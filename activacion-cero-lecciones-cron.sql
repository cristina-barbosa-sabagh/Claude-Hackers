-- =============================================================
-- Cron de activacion: segmento "0 lecciones abiertas"
-- Correr MANUALMENTE en el SQL Editor de Supabase.
--
-- Que hace: 1 vez al dia manda send-activacion-cero-lecciones a los
-- usuarios que se registraron hace mas de 24h y NUNCA abrieron ninguna
-- leccion. "Abrir" se trackea en eventos_leccion (evento='open'), NO en
-- progreso_usuarios (que se llena recien al completar). Por eso el WHERE
-- exige sin open en eventos_leccion Y sin fila en progreso_usuarios.
-- Base profiles_usuarios (= "Registrados" del dashboard). Un solo email
-- por usuario de por vida.
--
-- DISTINTO de:
--   * activacion-cw1-diario  -> gs-1 completada, cw-1 no iniciada
--   * experimento dashboard  -> no se toca; esto es un email adicional
--
-- =============================================================


-- -------------------------------------------------------------
-- PASO 0 (PRERREQUISITO — correr UNA sola vez, antes del cron)
-- Crear el secret ACOTADO en Vault. Vault esta VACIO hoy.
-- Es un secreto propio de esta funcion (NO el service_role): la Edge
-- Function lo valida contra ACTIVACION_INTERNAL_SECRET y si no matchea
-- devuelve 401. El nombre del secret DEBE ser exactamente
-- 'activacion_internal_secret'.
--
-- El valor lo genera Postgres (aleatorio, 32 bytes hex). Corre esto y
-- guardate el valor: lo vas a necesitar TAMBIEN como secret de la Edge
-- Function (ver PASO 0-bis).
-- -------------------------------------------------------------
-- select vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'activacion_internal_secret');
--
-- Ver el valor generado (para copiarlo al secret de la Edge Function):
--   select decrypted_secret from vault.decrypted_secrets
--   where name = 'activacion_internal_secret';
--
-- -------------------------------------------------------------
-- PASO 0-bis: setear el MISMO valor como secret de la Edge Function
-- (fuera del SQL Editor — terminal o Dashboard):
--   supabase secrets set ACTIVACION_INTERNAL_SECRET='<valor_del_paso_0>'
-- La funcion compara este env contra el header x-internal-secret que
-- manda el cron. Ambos lados deben ser el MISMO valor.


-- -------------------------------------------------------------
-- PASO 1: agendar el cron (idempotente: primero desagenda si existe)
-- El secret se resuelve SIEMPRE via Vault, nunca inline.
-- -------------------------------------------------------------
select cron.unschedule(jobid)
from cron.job
where jobname = 'activacion-cero-lecciones-diario';

select cron.schedule(
  'activacion-cero-lecciones-diario',
  '0 16 * * *',                         -- diario 16:00 UTC (evita choque con los otros dos: 14:00 y 15:00)
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
      'user_id', u.id::text,
      'email',   u.email,
      'nombre',  coalesce(p.nombre_completo, 'Hacker')
    )
  )
  from profiles_usuarios p
  join auth.users u on u.id = p.id
  where u.created_at < now() - interval '24 hours'
    and u.email is not null
    -- nunca ABRIO ninguna leccion: la apertura se trackea en eventos_leccion
    -- (evento='open'), NO en progreso_usuarios (que se llena al completar).
    and not exists (
      select 1 from eventos_leccion ev
      where ev.user_id = p.id and ev.evento = 'open'
    )
    -- ni progreso de ningun tipo (defensa adicional)
    and not exists (
      select 1 from progreso_usuarios g
      where g.user_id = p.id
    )
    -- nunca se le mando este email antes (idempotencia de por vida)
    and not exists (
      select 1 from emails_enviados e
      where e.user_id = p.id and e.tipo = 'activacion_cero_lecciones'
    );
  $$
);


-- -------------------------------------------------------------
-- VERIFICACION (solo lectura)
-- -------------------------------------------------------------
select jobname, schedule, active
from cron.job
where jobname = 'activacion-cero-lecciones-diario';
