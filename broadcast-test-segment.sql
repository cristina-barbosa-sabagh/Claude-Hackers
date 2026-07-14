-- =============================================================
-- PASO 5 (prueba) — segmento 'test_interno'
-- Fuerza a las funciones de destinatarios a devolver UNICAMENTE
-- cristina@growthrockstar.com, sin importar el segmento real.
-- Inerte: solo actua si un broadcast usa segmento='test_interno'.
-- Correr manualmente en el SQL Editor. (Cuerpo verbatim de prod + 1 caso.)
-- =============================================================

-- ---- _internal_broadcast_recipients (la que usa la Edge Function) ----
CREATE OR REPLACE FUNCTION public._internal_broadcast_recipients(p_segmento text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(user_id uuid, email text, nombre_completo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  total_lecciones BIGINT;
BEGIN
  -- No admin check: solo accesible via service_role (ver REVOKE abajo)
  IF p_segmento IN ('completaron', 'no_completaron') THEN
    SELECT COUNT(*) INTO total_lecciones FROM lecciones;
  END IF;

  RETURN QUERY
  SELECT u.id AS user_id, u.email::text AS email, p.nombre_completo
  FROM auth.users u
  JOIN profiles_usuarios p ON p.id = u.id
  WHERE
    CASE p_segmento
      WHEN 'todos'           THEN TRUE
      WHEN 'activos'         THEN u.last_sign_in_at >= NOW() - INTERVAL '14 days'
      WHEN 'inactivos'       THEN u.last_sign_in_at < NOW() - INTERVAL '14 days'
                                   OR u.last_sign_in_at IS NULL
      WHEN 'completaron'     THEN (SELECT COUNT(*) FROM progreso_usuarios pr
                                   WHERE pr.user_id = u.id AND pr.completada = true) >= total_lecciones
      WHEN 'no_completaron'  THEN (SELECT COUNT(*) FROM progreso_usuarios pr
                                   WHERE pr.user_id = u.id AND pr.completada = true) < total_lecciones
      WHEN 'test_interno'    THEN lower(u.email) = 'cristina@growthrockstar.com'
      ELSE FALSE
    END
  ORDER BY u.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- ---- admin_broadcast_recipients (la que usa el conteo del admin) ----
CREATE OR REPLACE FUNCTION public.admin_broadcast_recipients(p_segmento text)
 RETURNS TABLE(user_id uuid, email text, nombre_completo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  total_lecciones BIGINT;
BEGIN
  PERFORM _assert_admin();

  IF p_segmento IN ('completaron', 'no_completaron') THEN
    SELECT COUNT(*) INTO total_lecciones FROM lecciones;
  END IF;

  RETURN QUERY
  SELECT
    u.id              AS user_id,
    u.email::text     AS email,
    p.nombre_completo AS nombre_completo
  FROM auth.users u
  JOIN profiles_usuarios p ON p.id = u.id
  WHERE
    CASE p_segmento
      WHEN 'todos' THEN
        TRUE
      WHEN 'activos' THEN
        u.last_sign_in_at >= NOW() - INTERVAL '14 days'
      WHEN 'inactivos' THEN
        u.last_sign_in_at < NOW() - INTERVAL '14 days'
        OR u.last_sign_in_at IS NULL
      WHEN 'completaron' THEN
        (SELECT COUNT(*) FROM progreso_usuarios pr
         WHERE pr.user_id = u.id AND pr.completada = true
        ) >= total_lecciones
      WHEN 'no_completaron' THEN
        (SELECT COUNT(*) FROM progreso_usuarios pr
         WHERE pr.user_id = u.id AND pr.completada = true
        ) < total_lecciones
      WHEN 'test_interno' THEN
        lower(u.email) = 'cristina@growthrockstar.com'
      ELSE
        FALSE
    END
  ORDER BY p.nombre_completo;
END;
$function$;

-- ---- CHECK: debe devolver EXACTAMENTE 1 fila (tu email) ----
SELECT count(*) AS debe_ser_1, min(email) AS email
FROM _internal_broadcast_recipients('test_interno', 1000, 0);
