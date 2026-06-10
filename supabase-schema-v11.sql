-- v11: UTMs, last_seen, referral channel
ALTER TABLE profiles_usuarios ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE profiles_usuarios ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE profiles_usuarios ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE profiles_usuarios ADD COLUMN IF NOT EXISTS utm_term TEXT;
ALTER TABLE profiles_usuarios ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE profiles_usuarios ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS ref_channel TEXT;
