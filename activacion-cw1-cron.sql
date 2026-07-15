-- =============================================================
-- Cron de activacion: segmento "completaste gs-1, segui con cw-1"
-- Correr MANUALMENTE en el SQL Editor de Supabase.
--
-- Que hace: 1 vez al dia (15:00 UTC) manda send-activacion-cw1 a los
-- usuarios que completaron la leccion gs-1 hace mas de 24h y todavia NO
-- iniciaron cw-1 (no existe fila en progreso_usuarios para cw-1). Un solo
-- email por usuario de por vida (emails_enviados tipo='activacion').
--
-- >>> NOTA HISTORICA <<<
--   Este cron existia solo en pg_cron (no versionado). Su header traia el
--   placeholder 'Bearer TU_SERVICE_ROLE_KEY' sin reemplazar. Se confirmo el
--   2026-07-15 que el placeholder era COSMETICO: con verify_jwt=false el
--   gateway no valida Authorization y la funcion no lo leia, asi que el cron
--   mando con normalidad todo el tiempo (265 emails, 99/99 invocaciones 200,
--   cero 401). Este archivo lo sube al mismo estandar que
--   activacion-cero-lecciones-diario: secreto PROPIO validado de verdad.
--
-- DISTINTO de:
--   * activacion-cero-lecciones-diario -> nunca abrio ninguna leccion
--   * experimento dashboard            -> no se toca
-- =============================================================


-- -------------------------------------------------------------
-- PASO 0 (PRERREQUISITO — correr UNA sola vez, antes del cron)
-- Crear el secret PROPIO de este cron en Vault. NO reutilizar
-- activacion_internal_secret: secreto separado para que rotar uno no
-- afecte al otro. La Edge Function lo valida contra CW1_INTERNAL_SECRET
-- y si no matchea devuelve 401. El nombre DEBE ser 'cw1_internal_secret'.
--
-- El valor lo genera Postgres (aleatorio, 32 bytes hex).
-- -------------------------------------------------------------
-- select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'cw1_internal_secret');
--
-- Ver el valor generado (para copiarlo al secret de la Edge Function):
--   select decrypted_secret from vault.decrypted_secrets
--   where name = 'cw1_internal_secret';
--
-- -------------------------------------------------------------
-- PASO 0-bis: setear el MISMO valor como secret de la Edge Function
-- (terminal). IMPORTANTE: al re-deployar, usar --no-verify-jwt explicito
-- (el default del CLI es verify_jwt=true y rechazaria al cron, que no
-- manda JWT sino x-internal-secret):
--   supabase secrets set CW1_INTERNAL_SECRET='<valor_del_paso_0>'
--   supabase functions deploy send-activacion-cw1 --no-verify-jwt
-- Ambos lados (Vault y env) deben ser el MISMO valor.


-- -------------------------------------------------------------
-- PASO 1: reagendar el cron (idempotente: primero desagenda si existe)
-- Reemplaza el header viejo (Authorization: Bearer TU_SERVICE_ROLE_KEY)
-- por x-internal-secret resuelto SIEMPRE via Vault, nunca inline.
-- -------------------------------------------------------------
select cron.unschedule(jobid)
from cron.job
where jobname = 'activacion-cw1-diario';

select cron.schedule(
  'activacion-cw1-diario',
  '0 15 * * *',                         -- diario 15:00 UTC (schedule original, sin cambios)
  $$
  select net.http_post(
    url := 'https://rjabegfpuzdjccoxpsgv.supabase.co/functions/v1/send-activacion-cw1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'cw1_internal_secret'
      )
    ),
    body := jsonb_build_object(
      'user_id', g.user_id::text,
      'email',   u.email,
      'nombre',  coalesce(p.nombre_completo, 'Hacker')
    )
  )
  from progreso_usuarios g
  join auth.users u on u.id = g.user_id
  join profiles_usuarios p on p.id = g.user_id
  where g.leccion_id = 'gs-1'
    and g.completada = true
    and g.completada_at is not null
    and g.completada_at < now() - interval '24 hours'
    and not exists (
      select 1 from progreso_usuarios c
      where c.user_id = g.user_id and c.leccion_id = 'cw-1'
    )
    and not exists (
      select 1 from emails_enviados e
      where e.user_id = g.user_id and e.tipo = 'activacion'
    )
  limit 100;
  $$
);


-- -------------------------------------------------------------
-- VERIFICACION (solo lectura)
-- -------------------------------------------------------------
select jobname, schedule, active
from cron.job
where jobname = 'activacion-cw1-diario';
