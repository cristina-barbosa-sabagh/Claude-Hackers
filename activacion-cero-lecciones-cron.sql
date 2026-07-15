-- =============================================================
-- Cron de activacion: secuencia "0 lecciones abiertas" (dias 1/3/5/7)
-- Correr MANUALMENTE en el SQL Editor de Supabase.
--
-- Que hace: 1 vez al dia manda send-activacion-cero-lecciones a los usuarios
-- que se registraron hace >=24h y NUNCA abrieron ninguna leccion. "Abrir" se
-- trackea en eventos_leccion (evento='open'), NO en progreso_usuarios (que se
-- llena recien al completar). Base profiles_usuarios (= "Registrados").
--
-- Secuencia de 4 toques FOMO segun antiguedad del registro:
--   dia 1  -> referencia 'cero_lecciones'      (>=24h)
--   dia 3  -> referencia 'cero_lecciones_3d'   (>=3 dias)
--   dia 5  -> referencia 'cero_lecciones_5d'   (>=5 dias)
--   dia 7  -> referencia 'cero_lecciones_7d'   (>=7 dias)
-- Cada referencia es su propio anti-duplicado (una vez por toque, no de por
-- vida global). En una corrida se elige el TOQUE MAS ALTO pendiente y no
-- enviado (7, si no 5, si no 3, si no 1) via CASE mutuamente excluyente ->
-- a nadie le llegan dos toques el mismo dia. Al abrir una leccion, el usuario
-- sale del segmento y deja de recibir toques.
--
-- DISTINTO de:
--   * activacion-cw1-diario            -> completo gs-1, no inicio cw-1
--   * recordatorio-inactividad-diario  -> inactividad por last_seen_at
-- =============================================================


-- -------------------------------------------------------------
-- PRERREQUISITOS (ya resueltos en esta linea de trabajo):
--   * Secret Vault 'activacion_internal_secret' creado (se REUSA, no se crea
--     uno nuevo para la secuencia).
--   * Edge Function send-activacion-cero-lecciones desplegada con
--     verify_jwt=false y validando ACTIVACION_INTERNAL_SECRET.
-- -------------------------------------------------------------


-- -------------------------------------------------------------
-- PASO 1: reagendar el cron (idempotente: primero desagenda si existe)
-- El secret se resuelve SIEMPRE via Vault, nunca inline.
-- -------------------------------------------------------------
select cron.unschedule(jobid)
from cron.job
where jobname = 'activacion-cero-lecciones-diario';

select cron.schedule(
  'activacion-cero-lecciones-diario',
  '0 16 * * *',                         -- diario 16:00 UTC (evita choque con 14:00 y 15:00)
  $$
  select net.http_post(
    url := 'https://rjabegfpuzdjccoxpsgv.supabase.co/functions/v1/send-activacion-cero-lecciones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'activacion_internal_secret'
      )
    ),
    body := jsonb_build_object(
      'user_id', p.id::text,
      'email',   u.email,
      'nombre',  coalesce(p.nombre_completo, 'Hacker'),
      'dia',     t.dia
    )
  )
  from profiles_usuarios p
  join auth.users u on u.id = p.id
  -- Toque MAS ALTO pendiente y no enviado (CASE = mutuamente excluyente:
  -- devuelve el primer WHEN que matchea -> un solo dia por usuario/corrida).
  join lateral (
    select case
      when u.created_at < now() - interval '7 days'
           and not exists (select 1 from emails_enviados e
             where e.user_id = p.id and e.tipo = 'activacion_cero_lecciones'
               and e.referencia = 'cero_lecciones_7d')
        then 7
      when u.created_at < now() - interval '5 days'
           and not exists (select 1 from emails_enviados e
             where e.user_id = p.id and e.tipo = 'activacion_cero_lecciones'
               and e.referencia = 'cero_lecciones_5d')
        then 5
      when u.created_at < now() - interval '3 days'
           and not exists (select 1 from emails_enviados e
             where e.user_id = p.id and e.tipo = 'activacion_cero_lecciones'
               and e.referencia = 'cero_lecciones_3d')
        then 3
      when u.created_at < now() - interval '24 hours'
           and not exists (select 1 from emails_enviados e
             where e.user_id = p.id and e.tipo = 'activacion_cero_lecciones'
               and e.referencia = 'cero_lecciones')
        then 1
      else null
    end as dia
  ) t on t.dia is not null
  where u.email is not null
    -- nunca ABRIO ninguna leccion
    and not exists (
      select 1 from eventos_leccion ev
      where ev.user_id = p.id and ev.evento = 'open'
    )
    -- ni progreso de ningun tipo
    and not exists (
      select 1 from progreso_usuarios g
      where g.user_id = p.id
    );
  $$
);


-- -------------------------------------------------------------
-- VERIFICACION (solo lectura)
-- -------------------------------------------------------------
select jobname, schedule, active
from cron.job
where jobname = 'activacion-cero-lecciones-diario';
