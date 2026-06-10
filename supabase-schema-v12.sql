-- v12: Admin RPCs with strict email guard (@growthrockstar.com)
--
-- All functions use SECURITY DEFINER to bypass RLS.
-- Each one calls _assert_admin() which extracts the domain
-- from the caller's JWT email and compares by exact equality.
-- GRANT only to authenticated (not anon).

-- =============================================================
-- Helper: strict admin check
-- =============================================================
CREATE OR REPLACE FUNCTION _assert_admin()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller_email TEXT;
  caller_domain TEXT;
BEGIN
  caller_email := LOWER(TRIM(COALESCE(auth.jwt()->>'email', '')));

  IF caller_email = '' THEN
    RAISE EXCEPTION 'Unauthorized: no email in session';
  END IF;

  -- Extract domain: everything after the last @
  caller_domain := SUBSTRING(caller_email FROM '@([^@]+)$');

  IF caller_domain IS NULL OR caller_domain != 'growthrockstar.com' THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;
END;
$$;

-- =============================================================
-- 1. admin_overview()
-- Total suscriptores, curso completado, DAU/WAU/MAU
-- =============================================================
CREATE OR REPLACE FUNCTION admin_overview()
RETURNS TABLE(
  total_users INTEGER,
  completed_course INTEGER,
  dau INTEGER,
  wau INTEGER,
  mau INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM _assert_admin();

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::integer FROM profiles_usuarios),

    (SELECT COUNT(*)::integer FROM (
      SELECT user_id FROM progreso_usuarios
      WHERE completada = true
      GROUP BY user_id
      HAVING COUNT(*) >= 20
    ) sub),

    (SELECT COUNT(*)::integer FROM profiles_usuarios
     WHERE last_seen_at >= NOW() - INTERVAL '24 hours'),

    (SELECT COUNT(*)::integer FROM profiles_usuarios
     WHERE last_seen_at >= NOW() - INTERVAL '7 days'),

    (SELECT COUNT(*)::integer FROM profiles_usuarios
     WHERE last_seen_at >= NOW() - INTERVAL '30 days');
END;
$$;

GRANT EXECUTE ON FUNCTION admin_overview() TO authenticated;

-- =============================================================
-- 2. admin_users()
-- Full user list with progress count
-- =============================================================
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
  lessons_completed BIGINT
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
    p.last_seen_at,
    p.utm_source,
    p.utm_campaign,
    COALESCE(pr.cnt, 0) AS lessons_completed
  FROM profiles_usuarios p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN (
    SELECT user_id, COUNT(*)::bigint AS cnt
    FROM progreso_usuarios
    WHERE completada = true
    GROUP BY user_id
  ) pr ON pr.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_users() TO authenticated;

-- =============================================================
-- 3. admin_referral_ranking()
-- Full ranking without opt-in filter or limit
-- =============================================================
CREATE OR REPLACE FUNCTION admin_referral_ranking()
RETURNS TABLE(
  user_email TEXT,
  nombre TEXT,
  total_referrals BIGINT,
  active_referrals BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM _assert_admin();

  RETURN QUERY
  SELECT
    u.email::text AS user_email,
    p.nombre_completo AS nombre,
    COUNT(r.id) AS total_referrals,
    COUNT(r.id) FILTER (WHERE r.activated = true) AS active_referrals
  FROM profiles_usuarios p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN referrals r ON r.referrer_id = p.id
  GROUP BY p.id, u.email, p.nombre_completo
  HAVING COUNT(r.id) > 0
  ORDER BY active_referrals DESC, total_referrals DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_referral_ranking() TO authenticated;

-- =============================================================
-- 4. admin_referral_channels()
-- Referrals by channel
-- =============================================================
CREATE OR REPLACE FUNCTION admin_referral_channels()
RETURNS TABLE(
  channel TEXT,
  total BIGINT,
  activated BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM _assert_admin();

  RETURN QUERY
  SELECT
    COALESCE(r.ref_channel, 'unknown') AS channel,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE r.activated = true) AS activated
  FROM referrals r
  GROUP BY r.ref_channel
  ORDER BY total DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_referral_channels() TO authenticated;

-- =============================================================
-- 5. admin_lessons_stats()
-- Completions per lesson
-- =============================================================
CREATE OR REPLACE FUNCTION admin_lessons_stats()
RETURNS TABLE(
  leccion_id TEXT,
  completions BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM _assert_admin();

  RETURN QUERY
  SELECT
    p.leccion_id,
    COUNT(*) AS completions
  FROM progreso_usuarios p
  WHERE p.completada = true
  GROUP BY p.leccion_id
  ORDER BY completions DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_lessons_stats() TO authenticated;
