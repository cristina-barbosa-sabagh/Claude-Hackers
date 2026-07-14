-- =============================================================
-- Broadcast resiliente — PASO 3: crons de continuacion + watchdog
-- Correr manualmente en el SQL Editor de Supabase.
--
-- REQUISITOS PREVIOS (ver notas):
--   1) broadcast-send deployado con verify_jwt = false (auth in-code).
--   2) Secret BROADCAST_INTERNAL_SECRET seteado en la Edge Function.
--   3) Los 3 broadcasts colgados YA reconciliados (fuera de 'enviando').
--      El cron de continuacion tiene guard (ultimo_progreso_en IS NOT NULL)
--      como defensa, pero el orden correcto es reconciliar primero (Paso 6).
--
-- Reemplazar <<SECRET>> por el valor real de BROADCAST_INTERNAL_SECRET
-- (o migrarlo a Vault; ver nota al pie).
-- =============================================================


-- -------------------------------------------------------------
-- CRON 1: broadcast-continuar (cada 1 min)
-- Poke a cada broadcast 'enviando' sin lease vigente -> procesa 1 chunk.
-- El propio chunk computa pendientes y finaliza si no quedan.
-- El lease atomico evita doble-procesamiento con el self-invoke.
-- -------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'broadcast-continuar';

select cron.schedule(
  'broadcast-continuar',
  '* * * * *',                          -- cada 1 minuto
  $$
  select net.http_post(
    url     := 'https://rjabegfpuzdjccoxpsgv.supabase.co/functions/v1/broadcast-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', '<<SECRET>>'
    ),
    body    := jsonb_build_object('broadcast_id', b.id::text, 'mode', 'chunk')
  )
  from broadcasts b
  where b.estado = 'enviando'
    and b.ultimo_progreso_en is not null            -- guard: excluye los colgados viejos (NULL)
    and (b.lease_hasta is null or b.lease_hasta < now());
  $$
);


-- -------------------------------------------------------------
-- CRON 2: broadcast-watchdog (cada 5 min)
-- Marca 'incompleto' los broadcasts 'enviando' sin PROGRESO REAL en 15 min.
-- NO llama a la Edge Function: es un UPDATE puro. Visible en el admin.
-- (El estancamiento se mide con ultimo_progreso_en, que el Paso 2 solo
--  refresca cuando hubo envios/fallos reales, no ante transitorios.)
-- -------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'broadcast-watchdog';

select cron.schedule(
  'broadcast-watchdog',
  '*/5 * * * *',                        -- cada 5 minutos
  $$
  update broadcasts
  set estado      = 'incompleto',
      lease_hasta = null,
      nota_estado = 'Estancado: sin progreso real desde '
                    || to_char(ultimo_progreso_en, 'YYYY-MM-DD HH24:MI') || ' UTC'
  where estado = 'enviando'
    and ultimo_progreso_en is not null
    and ultimo_progreso_en < now() - interval '15 minutes';
  $$
);


-- -------------------------------------------------------------
-- VERIFICACION (solo lectura)
-- -------------------------------------------------------------
select jobname, schedule, active
from cron.job
where jobname in ('broadcast-continuar', 'broadcast-watchdog')
order by jobname;

-- Nota Vault (opcional, mas seguro que inline):
--   El patron existente del proyecto inlinea el secreto en el command.
--   Alternativa: guardar el secreto en Vault y referenciarlo:
--     (select decrypted_secret from vault.decrypted_secrets where name = 'broadcast_internal_secret')
--   en lugar del literal '<<SECRET>>'.
