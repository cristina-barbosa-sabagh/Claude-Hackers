-- ===================================================================
-- CLAUDE HACKERS — Fase 8: Tabla unlocks_vistos
-- ===================================================================
-- Ejecutar en: Supabase SQL Editor (copiar y pegar completo)
-- Fecha: 2026-05-28
-- ===================================================================

-- ===================================================================
-- 1. TABLA: unlocks_vistos
-- ===================================================================
CREATE TABLE public.unlocks_vistos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unlock_id TEXT NOT NULL,
  visto_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, unlock_id)
);

CREATE INDEX idx_unlocks_user ON public.unlocks_vistos(user_id);

-- ===================================================================
-- 2. RLS
-- ===================================================================
ALTER TABLE public.unlocks_vistos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unlocks_select_own"
  ON public.unlocks_vistos FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "unlocks_insert_own"
  ON public.unlocks_vistos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
