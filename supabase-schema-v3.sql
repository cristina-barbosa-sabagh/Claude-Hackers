-- ===================================================================
-- CLAUDE HACKERS — Fase 7a: Sistema de Streaks
-- ===================================================================
-- Ejecutar en: Supabase SQL Editor (copiar y pegar completo)
-- Fecha: 2026-05-28
-- ===================================================================

-- ===================================================================
-- 1. TABLA: streaks_usuarios
-- ===================================================================
CREATE TABLE public.streaks_usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  dias_actuales INT DEFAULT 0,
  dias_record INT DEFAULT 0,
  ultima_fecha_completada DATE,
  timezone TEXT DEFAULT 'America/Bogota',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_streaks_user ON public.streaks_usuarios(user_id);

-- ===================================================================
-- 2. RLS
-- ===================================================================
ALTER TABLE public.streaks_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "streaks_select_own"
  ON public.streaks_usuarios FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "streaks_insert_own"
  ON public.streaks_usuarios FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "streaks_update_own"
  ON public.streaks_usuarios FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ===================================================================
-- 3. FUNCION: actualizar_streak
-- ===================================================================
CREATE OR REPLACE FUNCTION public.actualizar_streak(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tz TEXT;
  v_hoy DATE;
  v_ultima DATE;
  v_dias INT;
  v_record INT;
BEGIN
  -- Obtener timezone del usuario (o default)
  SELECT timezone INTO v_tz
  FROM public.streaks_usuarios
  WHERE user_id = p_user_id;

  -- Si no existe registro de streak, crearlo
  IF v_tz IS NULL THEN
    v_tz := 'America/Bogota';
    INSERT INTO public.streaks_usuarios (user_id, timezone)
    VALUES (p_user_id, v_tz)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Fecha de hoy en timezone del usuario
  v_hoy := (now() AT TIME ZONE v_tz)::DATE;

  -- Obtener estado actual
  SELECT ultima_fecha_completada, dias_actuales, dias_record
  INTO v_ultima, v_dias, v_record
  FROM public.streaks_usuarios
  WHERE user_id = p_user_id;

  -- Logica de streak
  IF v_ultima = v_hoy THEN
    -- Ya completo algo hoy, no hacer nada
    RETURN;
  ELSIF v_ultima = v_hoy - 1 THEN
    -- Completo ayer, extender streak
    v_dias := v_dias + 1;
  ELSE
    -- Primer dia o rompio la racha
    v_dias := 1;
  END IF;

  -- Actualizar record si corresponde
  IF v_dias > v_record THEN
    v_record := v_dias;
  END IF;

  -- Guardar
  UPDATE public.streaks_usuarios
  SET dias_actuales = v_dias,
      dias_record = v_record,
      ultima_fecha_completada = v_hoy,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===================================================================
-- 4. REEMPLAZAR TRIGGER: ahora activa referral Y actualiza streak
-- ===================================================================
CREATE OR REPLACE FUNCTION public.on_lesson_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completada = true THEN
    -- Actualizar streak
    PERFORM public.actualizar_streak(NEW.user_id);

    -- Activar referral si es la primera leccion completada
    IF (
      SELECT COUNT(*) FROM public.progreso_usuarios
      WHERE user_id = NEW.user_id AND completada = true AND id != NEW.id
    ) = 0 THEN
      UPDATE public.referrals
      SET activated = true
      WHERE referred_id = NEW.user_id AND activated = false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger anterior y crear el nuevo
DROP TRIGGER IF EXISTS trg_activate_referral ON public.progreso_usuarios;

CREATE TRIGGER trg_on_lesson_completed
  AFTER INSERT OR UPDATE ON public.progreso_usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.on_lesson_completed();
