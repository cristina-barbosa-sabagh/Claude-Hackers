-- =============================================================
-- Cron de activacion: toque INSTANTANEO "0 lecciones abiertas"
-- Correr MANUALMENTE en el SQL Editor de Supabase.
--
-- Que hace: cada 15 min manda send-activacion-cero-lecciones con dia="instant"
-- (toque calido de bienvenida, foco en beneficios) a los usuarios que se
-- registraron hace >=15 min y <=1 hora, que NUNCA abrieron una leccion y que
-- todavia no recibieron este toque. Es ADICIONAL a la secuencia FOMO 1/3/5/7
-- (activacion-cero-lecciones-cron.sql); no la reemplaza.
--
-- Solo para registros NUEVOS (de aca en adelante). El limite superior
-- created_at > now() - 1 hour excluye el backlog viejo: NO hay backfill
-- retroactivo. El limite inferior 15 min evita agarrar a alguien que recien
-- sale del registro.
--
-- Referencia en emails_enviados: 'cero_lecciones_instant'.
--
-- DISTINTO de:
--   * activacion-cero-lecciones-diario -> secuencia FOMO 1/3/5/7
--   * activacion-cw1-diario            -> completo gs-1, no inicio cw-1
--   * recordatorio-inactividad-diario  -> inactividad por last_seen_at
-- =============================================================


-- -------------------------------------------------------------
-- PRERREQUISITOS (ya resueltos en esta linea de trabajo):
--   * Secret Vault 'activacion_internal_secret' creado (se REUSA).
--   * Edge Function send-activacion-cero-lecciones desplegada con
--     verify_jwt=false, validando ACTIVACION_INTERNAL_SECRET y soportando
--     dia="instant".
-- -------------------------------------------------------------


-- -------------------------------------------------------------
-- PASO 1: agendar el cron (idempotente: primero desagenda si existe)
-- El secret se resuelve SIEMPRE via Vault, nunca inline.
-- -------------------------------------------------------------
select cron.unschedule(jobid)
from cron.job
where jobname = 'activacion-cero-lecciones-instant';

select cron.schedule(
  'activacion-cero-lecciones-instant',
  '*/15 * * * *',                       -- cada 15 minutos
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
      'dia',     'instant'
    )
  )
  from profiles_usuarios p
  join auth.users u on u.id = p.id
  where u.email is not null
    -- registro RECIENTE: paso el minimo de 15 min pero no mas de 1 hora
    -- (el limite superior excluye el backlog viejo -> sin backfill retroactivo)
    and u.created_at < now() - interval '15 minutes'
    and u.created_at > now() - interval '1 hour'
    -- nunca ABRIO ninguna leccion
    and not exists (
      select 1 from eventos_leccion ev
      where ev.user_id = p.id and ev.evento = 'open'
    )
    -- ni progreso de ningun tipo
    and not exists (
      select 1 from progreso_usuarios g
      where g.user_id = p.id
    )
    -- todavia no recibio ESTE toque instantaneo
    and not exists (
      select 1 from emails_enviados e
      where e.user_id = p.id
        and e.tipo = 'activacion_cero_lecciones'
        and e.referencia = 'cero_lecciones_instant'
    )
    -- GUARD "maximo 1 toque cada ~24h": defensa extra (casi nunca deberia
    -- activarse aca por ser el primer toque, pero evita doble-envio si
    -- convive con otra corrida manual).
    and not exists (
      select 1 from emails_enviados e2
      where e2.user_id = p.id
        and e2.tipo = 'activacion_cero_lecciones'
        and e2.created_at > now() - interval '20 hours'
    );
  $$
);


-- -------------------------------------------------------------
-- VERIFICACION (solo lectura)
-- -------------------------------------------------------------
select jobname, schedule, active
from cron.job
where jobname = 'activacion-cero-lecciones-instant';
