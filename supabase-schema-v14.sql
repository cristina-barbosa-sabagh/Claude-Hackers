-- v14: Admin RPCs for tracking metrics (sessions, funnels, cohorts, geo)
--
-- All functions use SECURITY DEFINER + _assert_admin() guard.
-- Safe on empty tables (return 0 or empty result set).

-- =============================================================
-- 1. admin_sessions_stats()
-- Sessions total, per day (last 30d), avg per user, frequency dist
-- =============================================================
CREATE OR REPLACE FUNCTION admin_sessions_stats()
RETURNS TABLE(
  total_sessions BIGINT,
  avg_sessions_per_user NUMERIC,
  sessions_per_day JSON,
  freq_1 BIGINT,
  freq_2_3 BIGINT,
  freq_4_plus BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total BIGINT;
  v_avg NUMERIC;
  v_per_day JSON;
  v_f1 BIGINT;
  v_f2 BIGINT;
  v_f4 BIGINT;
BEGIN
  PERFORM _assert_admin();

  -- Total sessions
  SELECT COUNT(*) INTO v_total FROM sesiones_usuario;

  -- Avg sessions per user
  SELECT COALESCE(ROUND(AVG(cnt), 2), 0) INTO v_avg
  FROM (SELECT COUNT(*) AS cnt FROM sesiones_usuario GROUP BY user_id) sub;

  -- Sessions per day (last 30 days)
  SELECT COALESCE(json_agg(row_to_json(d)), '[]'::json) INTO v_per_day
  FROM (
    SELECT
      dates.dt::date AS day,
      COALESCE(c.cnt, 0) AS sessions
    FROM generate_series(
      (CURRENT_DATE - INTERVAL '29 days')::date,
      CURRENT_DATE,
      '1 day'::interval
    ) AS dates(dt)
    LEFT JOIN (
      SELECT started_at::date AS day, COUNT(*) AS cnt
      FROM sesiones_usuario
      WHERE started_at >= CURRENT_DATE - INTERVAL '29 days'
      GROUP BY started_at::date
    ) c ON c.day = dates.dt::date
    ORDER BY dates.dt
  ) d;

  -- Frequency distribution
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE cnt = 1), 0),
    COALESCE(COUNT(*) FILTER (WHERE cnt BETWEEN 2 AND 3), 0),
    COALESCE(COUNT(*) FILTER (WHERE cnt >= 4), 0)
  INTO v_f1, v_f2, v_f4
  FROM (SELECT COUNT(*) AS cnt FROM sesiones_usuario GROUP BY user_id) sub;

  RETURN QUERY SELECT v_total, v_avg, v_per_day, v_f1, v_f2, v_f4;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_sessions_stats() TO authenticated;

-- =============================================================
-- 2. admin_lesson_funnel()
-- Per lesson: opens vs completions + completion rate
-- =============================================================
CREATE OR REPLACE FUNCTION admin_lesson_funnel()
RETURNS TABLE(
  leccion_id TEXT,
  opens BIGINT,
  completions BIGINT,
  completion_rate NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM _assert_admin();

  RETURN QUERY
  SELECT
    COALESCE(e.leccion_id, p.leccion_id) AS leccion_id,
    COALESCE(e.opens, 0) AS opens,
    COALESCE(p.completions, 0) AS completions,
    CASE
      WHEN COALESCE(e.opens, 0) = 0 THEN 0
      ELSE ROUND(COALESCE(p.completions, 0)::numeric / e.opens * 100, 1)
    END AS completion_rate
  FROM (
    SELECT ev.leccion_id, COUNT(*) AS opens
    FROM eventos_leccion ev
    WHERE ev.evento = 'open'
    GROUP BY ev.leccion_id
  ) e
  FULL OUTER JOIN (
    SELECT pr.leccion_id, COUNT(*) AS completions
    FROM progreso_usuarios pr
    WHERE pr.completada = true
    GROUP BY pr.leccion_id
  ) p ON e.leccion_id = p.leccion_id
  ORDER BY COALESCE(e.opens, 0) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_lesson_funnel() TO authenticated;

-- =============================================================
-- 3. admin_activation_funnel()
-- Registered → opened 1+ lesson → completed 1+ → completed course
-- =============================================================
CREATE OR REPLACE FUNCTION admin_activation_funnel()
RETURNS TABLE(
  step TEXT,
  users INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM _assert_admin();

  RETURN QUERY

  SELECT 'registered'::text AS step,
    (SELECT COUNT(*)::integer FROM profiles_usuarios)

  UNION ALL

  SELECT 'opened_lesson'::text,
    (SELECT COUNT(DISTINCT user_id)::integer FROM eventos_leccion WHERE evento = 'open')

  UNION ALL

  SELECT 'completed_1'::text,
    (SELECT COUNT(DISTINCT user_id)::integer FROM progreso_usuarios WHERE completada = true)

  UNION ALL

  SELECT 'completed_course'::text,
    (SELECT COUNT(*)::integer FROM (
      SELECT user_id
      FROM progreso_usuarios
      WHERE completada = true
      GROUP BY user_id
      HAVING COUNT(*) >= 20
    ) sub);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_activation_funnel() TO authenticated;

-- =============================================================
-- 4. admin_cohorts()
-- By registration month: registered count + still active (last 30d)
-- =============================================================
CREATE OR REPLACE FUNCTION admin_cohorts()
RETURNS TABLE(
  cohort TEXT,
  registered BIGINT,
  active_30d BIGINT,
  retention_rate NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM _assert_admin();

  RETURN QUERY
  SELECT
    TO_CHAR(p.created_at, 'YYYY-MM') AS cohort,
    COUNT(*) AS registered,
    COUNT(*) FILTER (WHERE p.last_seen_at >= NOW() - INTERVAL '30 days') AS active_30d,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(
        COUNT(*) FILTER (WHERE p.last_seen_at >= NOW() - INTERVAL '30 days')::numeric
        / COUNT(*) * 100, 1
      )
    END AS retention_rate
  FROM profiles_usuarios p
  GROUP BY TO_CHAR(p.created_at, 'YYYY-MM')
  ORDER BY cohort;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_cohorts() TO authenticated;

-- =============================================================
-- 5. admin_geo()
-- Users by country
-- =============================================================
CREATE OR REPLACE FUNCTION admin_geo()
RETURNS TABLE(
  pais TEXT,
  total BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM _assert_admin();

  RETURN QUERY
  SELECT
    COALESCE(NULLIF(TRIM(p.pais), ''), 'Sin especificar') AS pais,
    COUNT(*) AS total
  FROM profiles_usuarios p
  GROUP BY COALESCE(NULLIF(TRIM(p.pais), ''), 'Sin especificar')
  ORDER BY total DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_geo() TO authenticated;
