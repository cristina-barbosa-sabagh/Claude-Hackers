-- v9: Leaderboard + opt-in privacy
-- Already run in production

-- Add opt-in column
ALTER TABLE profiles_usuarios ADD COLUMN IF NOT EXISTS show_in_leaderboard BOOLEAN DEFAULT false;

-- Public leaderboard: top 20 by referral count (only opted-in users)
CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE(nombre TEXT, avatar TEXT, referral_count BIGINT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.nombre_completo AS nombre,
    p.avatar_url AS avatar,
    COUNT(r.id) AS referral_count
  FROM profiles_usuarios p
  JOIN referrals r ON r.referrer_id = p.id AND r.activated = true
  WHERE p.show_in_leaderboard = true
  GROUP BY p.id, p.nombre_completo, p.avatar_url
  ORDER BY referral_count DESC
  LIMIT 20;
$$;

-- Personal position (authenticated only)
CREATE OR REPLACE FUNCTION get_my_leaderboard_position()
RETURNS TABLE(posicion BIGINT, referral_count BIGINT)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH ranked AS (
    SELECT
      p.id,
      COUNT(r.id) AS referral_count,
      RANK() OVER (ORDER BY COUNT(r.id) DESC) AS posicion
    FROM profiles_usuarios p
    LEFT JOIN referrals r ON r.referrer_id = p.id AND r.activated = true
    GROUP BY p.id
  )
  SELECT posicion, referral_count
  FROM ranked
  WHERE id = auth.uid();
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_leaderboard() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_leaderboard_position() TO authenticated;
