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
--
-- Fix BUG A: antes opens = COUNT(*) de eventos_leccion (evento='open') y
-- completions = COUNT(*) de progreso_usuarios eran dos tablas independientes
-- sin relacion causal; el 46% de las completadas no tiene evento 'open' del
-- mismo usuario -> completadas podian superar aperturas (cc-3: 950%, new-5:
-- 0 opens / 19 comps). Ahora "reached" = usuarios que ABRIERON la leccion O
-- tienen progreso en ella, garantizando completers ⊆ reached (rate <= 100%).
--
-- NOTA SEMANTICA: "opens" ahora significa "usuarios que alcanzaron la
-- leccion", NO eventos de apertura crudos.
--
-- Fix del fix (corrige el commit 2d9fb2f): la version anterior usaba dentro
-- de las CTEs los mismos nombres (leccion_id, opens, completions) que las
-- columnas OUT de RETURNS TABLE. En PL/pgSQL esas columnas de salida estan
-- en scope, asi que "leccion_id" era ambiguo y la funcion fallaba al
-- invocarse ("column reference leccion_id is ambiguous") — aunque un SELECT
-- plano que replica la logica NO lo detecta, porque ahi no existen las
-- columnas OUT. Solucion: renombrar las columnas internas de las CTEs a
-- lid / uid / n_opens / n_completions para que no choquen con las de salida.
-- (Definicion verbatim de pg_get_functiondef en prod — match exacto.)
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_lesson_funnel()
 RETURNS TABLE(leccion_id text, opens bigint, completions bigint, completion_rate numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM _assert_admin();

  RETURN QUERY
  WITH reached AS (
    SELECT ev.leccion_id AS lid, ev.user_id AS uid FROM eventos_leccion ev WHERE ev.evento = 'open'
    UNION
    SELECT pr.leccion_id AS lid, pr.user_id AS uid FROM progreso_usuarios pr
  ),
  o AS (
    SELECT reached.lid AS lid, COUNT(DISTINCT reached.uid) AS n_opens
    FROM reached GROUP BY reached.lid
  ),
  c AS (
    SELECT pu.leccion_id AS lid, COUNT(DISTINCT pu.user_id) AS n_completions
    FROM progreso_usuarios pu WHERE pu.completada = true GROUP BY pu.leccion_id
  )
  SELECT
    o.lid,
    o.n_opens,
    COALESCE(c.n_completions, 0),
    CASE WHEN o.n_opens = 0 THEN 0
         ELSE ROUND(COALESCE(c.n_completions, 0)::numeric / o.n_opens * 100, 1) END
  FROM o
  LEFT JOIN c ON c.lid = o.lid
  ORDER BY o.n_opens DESC;
END;
$function$;

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
