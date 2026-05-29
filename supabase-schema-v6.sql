-- ============================================================
-- SCHEMA V6: Skill bonuses por perfil completo
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE skill_bonuses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT,
  UNIQUE(user_id, skill_id)
);

ALTER TABLE skill_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skill_bonuses_select_own"
ON skill_bonuses FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "skill_bonuses_insert_own"
ON skill_bonuses FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- INSTRUCCIONES:
-- 1. Ejecuta este SQL en el SQL Editor de Supabase
-- 2. Verifica en Table Editor que la tabla skill_bonuses existe
--    con columnas: id, user_id, skill_id, unlocked_at, reason
-- 3. Verifica en Authentication > Policies que tiene 2 policies
--    (SELECT own, INSERT own)
-- ============================================================
