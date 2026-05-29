-- ============================================================
-- SCHEMA V7: RPC function get_my_referrals()
-- Retorna los referidos del usuario autenticado con datos
-- basicos de perfil (nombre, empresa, rol, avatar).
-- Usa SECURITY DEFINER para acceder a profiles_usuarios
-- de otros usuarios, pero SOLO filtrando por auth.uid().
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_referrals()
RETURNS TABLE (
  referral_id UUID,
  activated BOOLEAN,
  created_at TIMESTAMPTZ,
  referred_name TEXT,
  referred_empresa TEXT,
  referred_rol TEXT,
  referred_avatar_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id AS referral_id,
    r.activated,
    r.created_at,
    p.nombre_completo AS referred_name,
    p.empresa AS referred_empresa,
    p.rol AS referred_rol,
    p.avatar_url AS referred_avatar_url
  FROM referrals r
  LEFT JOIN profiles_usuarios p ON p.id = r.referred_id
  WHERE r.referrer_id = auth.uid()
  ORDER BY r.created_at DESC
  LIMIT 10;
$$;

-- Permitir ejecucion solo a usuarios autenticados
GRANT EXECUTE ON FUNCTION get_my_referrals() TO authenticated;

-- Revocar acceso a usuarios anonimos y al rol public
REVOKE EXECUTE ON FUNCTION get_my_referrals() FROM anon;
REVOKE EXECUTE ON FUNCTION get_my_referrals() FROM public;

-- ============================================================
-- INSTRUCCIONES:
-- 1. Copia todo este SQL y pegalo en el SQL Editor de Supabase
-- 2. Click en "Run"
-- 3. Verifica que dice "Success. No rows returned"
-- 4. Para probar, ve a SQL Editor y ejecuta:
--    SELECT * FROM get_my_referrals();
--    (debe retornar tus referidos o vacio si no tienes)
-- ============================================================
