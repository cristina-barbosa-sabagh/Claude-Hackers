-- ===================================================================
-- CLAUDE HACKERS — Fases 5-7: Badges, Referrals, Profiles
-- ===================================================================
-- Ejecutar en: Supabase SQL Editor (copiar y pegar completo)
-- Fecha: 2026-05-28
-- ===================================================================

-- ===================================================================
-- 1. TABLA: badges_usuarios
-- ===================================================================
CREATE TABLE public.badges_usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  desbloqueado_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX idx_badges_user ON public.badges_usuarios(user_id);

-- ===================================================================
-- 2. TABLA: profiles_usuarios
-- ===================================================================
CREATE TABLE public.profiles_usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo_referral TEXT UNIQUE,
  referred_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_profiles_referral ON public.profiles_usuarios(codigo_referral);

-- ===================================================================
-- 3. TABLA: referrals
-- ===================================================================
CREATE TABLE public.referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(referrer_id, referred_id)
);

CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX idx_referrals_referred ON public.referrals(referred_id);

-- ===================================================================
-- 4. ROW LEVEL SECURITY
-- ===================================================================

-- Badges
ALTER TABLE public.badges_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badges_select_own"
  ON public.badges_usuarios FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "badges_insert_own"
  ON public.badges_usuarios FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Profiles
ALTER TABLE public.profiles_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON public.profiles_usuarios FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles_usuarios FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles_usuarios FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Referrals
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrals_select_own"
  ON public.referrals FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id);

CREATE POLICY "referrals_insert_own"
  ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = referred_id);

CREATE POLICY "referrals_update_activation"
  ON public.referrals FOR UPDATE TO authenticated
  USING (auth.uid() = referred_id)
  WITH CHECK (auth.uid() = referred_id);

-- ===================================================================
-- 5. VIEW PUBLICA: solo expone id + codigo_referral
-- ===================================================================
CREATE VIEW public.profiles_publicos AS
  SELECT id, codigo_referral
  FROM public.profiles_usuarios;

GRANT SELECT ON public.profiles_publicos TO authenticated;

-- ===================================================================
-- 6. FUNCION + TRIGGER: activar referral cuando usuario completa
--    su primera leccion
-- ===================================================================
CREATE OR REPLACE FUNCTION public.activate_referral_on_first_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo actuar cuando se marca como completada
  IF NEW.completada = true THEN
    -- Verificar si es la primera leccion completada de este usuario
    IF (
      SELECT COUNT(*) FROM public.progreso_usuarios
      WHERE user_id = NEW.user_id AND completada = true AND id != NEW.id
    ) = 0 THEN
      -- Activar todos los referrals donde este usuario es el referido
      UPDATE public.referrals
      SET activated = true
      WHERE referred_id = NEW.user_id AND activated = false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_activate_referral
  AFTER INSERT OR UPDATE ON public.progreso_usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.activate_referral_on_first_completion();
