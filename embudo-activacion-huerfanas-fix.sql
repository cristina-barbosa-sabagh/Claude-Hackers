-- =============================================================
-- PROPUESTA (NO APLICADA) — Embudo de Activacion vs cuentas huerfanas
-- Fecha investigacion: 16-jul-2026, contra produccion (read-only).
--
-- HALLAZGOS (verificados contra prod, no contra el repo):
--   auth.users:            4976
--   profiles_usuarios:     4408  <- este es el "Registrados" del panel
--   huerfanas (sin profile): 568  (566 creadas en julio; eran ~490 al fix del Bug C)
--     - 243 nunca confirmaron email / nunca hicieron sign-in
--     - 325 SI confirmaron y SI se loguearon, pero nunca pasaron por
--       dashboard.html -> ensureProfile() (unico lugar que crea el profile;
--       NO hay trigger en auth.users en prod)
--     - 78 huerfanas tienen evento 'open' en eventos_leccion
--     - 37 huerfanas tienen lecciones completadas en progreso_usuarios
--
-- CONCLUSION: "Registrados" (4408) sale de profiles_usuarios, o sea que
-- EXCLUYE a las huerfanas. No esta inflado. El bug real es el inverso:
-- los pasos posteriores del embudo (opened_lesson, completed_1) cuentan
-- desde eventos_leccion / progreso_usuarios SIN join a profiles, asi que
-- incluyen actividad de 78/37 huerfanas que el denominador excluye.
-- Numerador y denominador miden poblaciones distintas.
--
-- DRY RUN (corrido 16-jul-2026 contra prod):
--   step             | actual | con_fix | diferencia
--   registered       |  4408  |  4408   |  0
--   opened_lesson    |  2354  |  2276   | -78   (53% -> 52%)
--   completed_1      |  1458  |  1421   | -37   (33% -> 32%)
--   completed_course |    18  |    18   |  0
-- =============================================================

-- ---- DRY RUN (read-only, correr cuando quieras re-verificar) ----
WITH viejo AS (
  SELECT 'registered' AS step, (SELECT COUNT(*) FROM profiles_usuarios) AS users, 1 AS ord
  UNION ALL SELECT 'opened_lesson', (SELECT COUNT(DISTINCT user_id) FROM eventos_leccion WHERE evento='open'), 2
  UNION ALL SELECT 'completed_1', (SELECT COUNT(DISTINCT user_id) FROM progreso_usuarios WHERE completada=true), 3
  UNION ALL SELECT 'completed_course', (SELECT COUNT(*) FROM (
    SELECT user_id FROM progreso_usuarios WHERE completada=true
    GROUP BY user_id HAVING COUNT(*) >= (SELECT COUNT(*) FROM lecciones)) s), 4
),
nuevo AS (
  SELECT 'registered' AS step, (SELECT COUNT(*) FROM profiles_usuarios) AS users, 1 AS ord
  UNION ALL SELECT 'opened_lesson', (SELECT COUNT(DISTINCT e.user_id) FROM eventos_leccion e
    JOIN profiles_usuarios p ON p.id=e.user_id WHERE e.evento='open'), 2
  UNION ALL SELECT 'completed_1', (SELECT COUNT(DISTINCT pr.user_id) FROM progreso_usuarios pr
    JOIN profiles_usuarios p ON p.id=pr.user_id WHERE pr.completada=true), 3
  UNION ALL SELECT 'completed_course', (SELECT COUNT(*) FROM (
    SELECT pr.user_id FROM progreso_usuarios pr
    JOIN profiles_usuarios p ON p.id=pr.user_id WHERE pr.completada=true
    GROUP BY pr.user_id HAVING COUNT(*) >= (SELECT COUNT(*) FROM lecciones)) s), 4
)
SELECT v.step, v.users AS actual, n.users AS con_fix, v.users - n.users AS diferencia
FROM viejo v JOIN nuevo n USING (step, ord) ORDER BY ord;

-- =============================================================
-- FIX PROPUESTO — NO CORRER TODAVIA (esperar OK)
-- Opcion elegida: embudo consistente (pasos con JOIN a profiles) +
-- fila extra 'no_profile' al FINAL para no perder visibilidad de las
-- huerfanas. Va al final para que rows[0] (denominador de los % en
-- admin.html) siga siendo 'registered'.
-- =============================================================
/*
CREATE OR REPLACE FUNCTION public.admin_activation_funnel()
 RETURNS TABLE(step text, users integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  PERFORM _assert_admin();

  RETURN QUERY

  SELECT 'registered'::text AS step,
    (SELECT COUNT(*)::integer FROM profiles_usuarios)

  UNION ALL

  -- JOIN a profiles: solo cuenta actividad de usuarios que estan en el denominador
  SELECT 'opened_lesson'::text,
    (SELECT COUNT(DISTINCT e.user_id)::integer
     FROM eventos_leccion e
     JOIN profiles_usuarios p ON p.id = e.user_id
     WHERE e.evento = 'open')

  UNION ALL

  SELECT 'completed_1'::text,
    (SELECT COUNT(DISTINCT pr.user_id)::integer
     FROM progreso_usuarios pr
     JOIN profiles_usuarios p ON p.id = pr.user_id
     WHERE pr.completada = true)

  UNION ALL

  SELECT 'completed_course'::text,
    (SELECT COUNT(*)::integer FROM (
      SELECT pr.user_id
      FROM progreso_usuarios pr
      JOIN profiles_usuarios p ON p.id = pr.user_id
      WHERE pr.completada = true
      GROUP BY pr.user_id
      HAVING COUNT(*) >= (SELECT COUNT(*) FROM lecciones)
    ) sub)

  UNION ALL

  -- Cuentas auth sin profile: visibles pero fuera del embudo principal
  SELECT 'no_profile'::text,
    (SELECT COUNT(*)::integer
     FROM auth.users u
     LEFT JOIN profiles_usuarios p ON p.id = u.id
     WHERE p.id IS NULL);
END;
$function$;
*/

-- Cambio acompanante en admin.html (renderFunnel, linea ~665):
--   labelMap: agregar  no_profile: 'Sin perfil (auth)'
--   colors:   agregar un 5to color neutro, ej '#666666'
