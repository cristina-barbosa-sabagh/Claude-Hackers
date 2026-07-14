-- =============================================================
-- v16: Broadcast resiliente — checkpoint por destinatario + estados
--
--  - Tabla broadcast_envios: checkpoint individual (anti-duplicado via
--    PK (broadcast_id,user_id)); fuente de verdad de quién recibió.
--  - Columnas de progreso/lease/cancelación en broadcasts.
--  - Máquina de estados extendida: + 'incompleto', + 'cancelado'.
--
-- Definiciones alineadas byte-a-byte con pg_get_constraintdef /
-- pg_get_indexdef / pg_policies de producción. RLS por DOMINIO
-- (@growthrockstar.com), igual que _assert_admin().
-- Ya aplicado en Supabase el 2026-07-13.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Checkpoint por destinatario
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcast_envios (
  broadcast_id  uuid        NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL,
  email         text        NOT NULL,
  estado        text        NOT NULL DEFAULT 'pendiente'::text,
  resend_id     text,
  error         text,
  intentos      smallint    NOT NULL DEFAULT 0,
  claimed_at    timestamptz,
  enviado_en    timestamptz,
  CONSTRAINT broadcast_envios_pkey PRIMARY KEY (broadcast_id, user_id),
  CONSTRAINT broadcast_envios_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'enviado'::text, 'fallido'::text])))
);

CREATE INDEX IF NOT EXISTS idx_be_no_enviado ON public.broadcast_envios USING btree (broadcast_id) WHERE (estado <> 'enviado'::text);
CREATE INDEX IF NOT EXISTS idx_be_bid_estado ON public.broadcast_envios USING btree (broadcast_id, estado);
CREATE INDEX IF NOT EXISTS idx_be_claimed ON public.broadcast_envios USING btree (claimed_at) WHERE (estado = 'pendiente'::text);

COMMENT ON TABLE broadcast_envios IS
  'Checkpoint por destinatario de cada broadcast. PK (broadcast_id,user_id) = anti-duplicado. Fuente de verdad de quien recibio.';

-- RLS: admin (dominio @growthrockstar.com) lee; escritura solo service_role
ALTER TABLE broadcast_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "be_admin_select" ON broadcast_envios;
CREATE POLICY "be_admin_select" ON broadcast_envios
  FOR SELECT
  USING ((split_part(lower((auth.jwt() ->> 'email'::text)), '@'::text, 2) = 'growthrockstar.com'::text));

GRANT SELECT ON broadcast_envios TO authenticated;

-- -------------------------------------------------------------
-- 2. Columnas nuevas en broadcasts
-- -------------------------------------------------------------
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS ultimo_progreso_en timestamptz,
  ADD COLUMN IF NOT EXISTS lease_hasta        timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_en       timestamptz,
  ADD COLUMN IF NOT EXISTS nota_estado        text;

COMMENT ON COLUMN broadcasts.ultimo_progreso_en IS 'Se actualiza cada chunk; el watchdog lo usa para detectar estancamiento.';
COMMENT ON COLUMN broadcasts.lease_hasta        IS 'Lock de concurrencia: si > now(), hay un chunk procesando; evita doble procesamiento.';
COMMENT ON COLUMN broadcasts.cancelado_en       IS 'Timestamp de cancelacion manual (estado=cancelado).';
COMMENT ON COLUMN broadcasts.nota_estado        IS 'Motivo legible de incompleto/cancelado, visible en el admin.';

-- -------------------------------------------------------------
-- 3. Máquina de estados: agrega 'incompleto' y 'cancelado'
-- -------------------------------------------------------------
ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_estado_check;
ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_estado_check
  CHECK ((estado = ANY (ARRAY['draft'::text, 'enviando'::text, 'completado'::text, 'error'::text, 'incompleto'::text, 'cancelado'::text])));
