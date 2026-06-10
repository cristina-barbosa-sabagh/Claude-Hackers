-- v13: Session tracking + lesson open events
--
-- Two new tables for activity metrics:
-- 1. sesiones_usuario — one row per session (30min throttle on frontend)
-- 2. eventos_leccion — one row per lesson open

-- =============================================================
-- 1. sesiones_usuario
-- =============================================================
CREATE TABLE IF NOT EXISTS sesiones_usuario (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  page       TEXT
);

CREATE INDEX IF NOT EXISTS idx_sesiones_user_started
  ON sesiones_usuario(user_id, started_at DESC);

ALTER TABLE sesiones_usuario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own sessions"
  ON sesiones_usuario FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own sessions"
  ON sesiones_usuario FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =============================================================
-- 2. eventos_leccion
-- =============================================================
CREATE TABLE IF NOT EXISTS eventos_leccion (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leccion_id TEXT NOT NULL,
  evento     TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eventos_leccion_user
  ON eventos_leccion(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eventos_leccion_leccion
  ON eventos_leccion(leccion_id);

ALTER TABLE eventos_leccion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own events"
  ON eventos_leccion FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own events"
  ON eventos_leccion FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
