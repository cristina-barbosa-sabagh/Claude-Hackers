-- =============================================================
-- v14: Signup source tracking
-- Pegar completo en el SQL Editor de Supabase.
-- =============================================================

-- 1. Agregar columna signup_source a profiles_usuarios
ALTER TABLE profiles_usuarios ADD COLUMN IF NOT EXISTS signup_source TEXT;

COMMENT ON COLUMN profiles_usuarios.signup_source IS
  'Botón/CTA de origen del signup: hero_cta, curso_cta, audiencia_cta, footer_cta, sticky_google, nav_cta, google_login, email_login';

-- 2. Recrear admin_users() con signup_source agregado
--    Basado en la definición VIVA de producción (pg_get_functiondef).
--    Único cambio: signup_source agregado al final de RETURNS TABLE y SELECT.
DROP FUNCTION IF EXISTS admin_users();

CREATE OR REPLACE FUNCTION admin_users()
RETURNS TABLE(
  user_email TEXT,
  nombre TEXT,
  empresa TEXT,
  rol TEXT,
  pais TEXT,
  whatsapp TEXT,
  created_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  utm_source TEXT,
  utm_campaign TEXT,
  lessons_completed BIGINT,
  ref_channel TEXT,
  referred_by_email TEXT,
  dias_inactivo INTEGER,
  recordatorios_enviados BIGINT,
  signup_source TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM _assert_admin();

  RETURN QUERY
  SELECT
    u.email::text AS user_email,
    p.nombre_completo AS nombre,
    p.empresa,
    p.rol,
    p.pais,
    p.whatsapp,
    p.created_at,
    u.last_sign_in_at AS last_seen_at,
    p.utm_source,
    p.utm_campaign,
    COALESCE(pr.cnt, 0) AS lessons_completed,
    p.ref_channel,
    ref_u.email::text AS referred_by_email,
    FLOOR(EXTRACT(EPOCH FROM (now() - u.last_sign_in_at)) / 86400)::int AS dias_inactivo,
    COALESCE(em.cnt, 0) AS recordatorios_enviados,
    p.signup_source
  FROM profiles_usuarios p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN (
    SELECT user_id, COUNT(*)::bigint AS cnt
    FROM progreso_usuarios
    WHERE completada = true
    GROUP BY user_id
  ) pr ON pr.user_id = p.id
  LEFT JOIN profiles_usuarios ref_p ON ref_p.codigo_referral = p.referred_by
  LEFT JOIN auth.users ref_u ON ref_u.id = ref_p.id
  LEFT JOIN (
    SELECT user_id, COUNT(*)::bigint AS cnt
    FROM emails_enviados
    WHERE tipo = 'inactividad'
    GROUP BY user_id
  ) em ON em.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_users() TO authenticated;
