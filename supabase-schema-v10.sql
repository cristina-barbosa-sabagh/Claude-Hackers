-- v10: WhatsApp field for Colbell integration
ALTER TABLE profiles_usuarios ADD COLUMN IF NOT EXISTS whatsapp TEXT;
