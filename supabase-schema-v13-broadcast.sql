-- =============================================================
-- v13: Broadcast system — tabla + RPC interna para Edge Function
-- Pegar completo en el SQL Editor de Supabase.
-- =============================================================

-- =============================================================
-- 1. Tabla broadcasts
-- =============================================================
CREATE TABLE IF NOT EXISTS broadcasts (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  asunto               TEXT        NOT NULL,
  cuerpo_html          TEXT        NOT NULL,
  segmento             TEXT        NOT NULL,
  total_destinatarios  INTEGER     DEFAULT 0,
  enviados             INTEGER     DEFAULT 0,
  fallidos             INTEGER     DEFAULT 0,
  estado               TEXT        DEFAULT 'draft'
                                   CHECK (estado IN ('draft','enviando','completado','error')),
  creado_por           TEXT,
  creado_en            TIMESTAMPTZ DEFAULT NOW(),
  enviado_en           TIMESTAMPTZ
);

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcasts_admin_only" ON broadcasts;
CREATE POLICY "broadcasts_admin_only" ON broadcasts
  FOR ALL
  USING  (auth.jwt()->>'email' = 'cristina@growthrockstar.com')
  WITH CHECK (auth.jwt()->>'email' = 'cristina@growthrockstar.com');

GRANT SELECT, INSERT, UPDATE ON broadcasts TO authenticated;

COMMENT ON TABLE broadcasts IS 'Broadcasts de email enviados desde el admin panel';

-- =============================================================
-- 2. RPC pública admin_broadcast_recipients (para frontend admin)
--    Usa _assert_admin() — requiere JWT de usuario autenticado.
-- =============================================================
DROP FUNCTION IF EXISTS admin_broadcast_recipients(TEXT);

CREATE OR REPLACE FUNCTION admin_broadcast_recipients(p_segmento TEXT)
RETURNS TABLE(user_id UUID, email TEXT, nombre_completo TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  total_lecciones BIGINT;
BEGIN
  PERFORM _assert_admin();

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
      ELSE FALSE
    END
  ORDER BY p.nombre_completo;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_broadcast_recipients(TEXT) TO authenticated;

COMMENT ON FUNCTION admin_broadcast_recipients(TEXT) IS
  'Devuelve destinatarios filtrados por segmento. Requiere JWT admin (frontend).';

-- =============================================================
-- 3. RPC interna _internal_broadcast_recipients (para Edge Function)
--    Sin _assert_admin() — solo invocable con service_role_key.
--    Misma lógica que admin_broadcast_recipients.
-- =============================================================
-- Legacy: firma de 1 arg reemplazada por la versión paginada (3 args) en prod.
DROP FUNCTION IF EXISTS _internal_broadcast_recipients(TEXT);

-- (Definición verbatim de pg_get_functiondef en prod — match exacto. Agrega
--  paginación p_limit/p_offset y ORDER BY u.id; misma lógica de segmentos.)
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
      ELSE FALSE
    END
  ORDER BY u.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- Revocar acceso a todos excepto service_role (que tiene permisos de superuser)
REVOKE ALL ON FUNCTION _internal_broadcast_recipients(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION _internal_broadcast_recipients(TEXT, INTEGER, INTEGER) FROM authenticated;
REVOKE ALL ON FUNCTION _internal_broadcast_recipients(TEXT, INTEGER, INTEGER) FROM anon;

COMMENT ON FUNCTION _internal_broadcast_recipients(TEXT, INTEGER, INTEGER) IS
  'Versión interna sin admin check. Solo accesible via service_role (Edge Functions).';

-- =============================================================
-- 4. admin_broadcast_notificacion — notificacion in-app "a todos"
--    Inserta una fila en notificaciones por cada destinatario.
--    (Estaba creada directo en la DB, sin versionar. Se versiona aca.)
--
--    Fix BUG C (opcion C1): la notificacion va SOLO a cuentas con perfil
--    (JOIN profiles_usuarios), para que coincida con la card SUSCRIPTORES
--    (admin_overview.total_users = COUNT(*) profiles_usuarios). Antes
--    insertaba por cada fila de auth.users, contando ~490 cuentas sin
--    perfil de mas.
-- =============================================================
-- (Definición verbatim de pg_get_functiondef en prod — match exacto.)
CREATE OR REPLACE FUNCTION public.admin_broadcast_notificacion(p_mensaje text, p_link text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_email text; v_bid text; v_count integer;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null or split_part(lower(v_email), '@', 2) <> 'growthrockstar.com' then
    raise exception 'No autorizado';
  end if;
  if p_mensaje is null or length(trim(p_mensaje)) = 0 then
    raise exception 'Mensaje vacío';
  end if;
  v_bid := gen_random_uuid()::text;
  insert into public.notificaciones (user_id, tipo, referencia, mensaje, link)
  select u.id, 'anuncio', v_bid, p_mensaje, nullif(trim(coalesce(p_link,'')), '')
  from auth.users u
  join profiles_usuarios p on p.id = u.id;
  get diagnostics v_count = row_count;
  return v_count;
end; $function$;

GRANT EXECUTE ON FUNCTION admin_broadcast_notificacion(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION admin_broadcast_notificacion(TEXT, TEXT) IS
  'Inserta notificacion in-app para todos los suscriptores con perfil. Requiere JWT admin.';
