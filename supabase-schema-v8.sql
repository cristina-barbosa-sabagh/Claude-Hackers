-- Migration v8: Function to get registered user count
-- Run this in the Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_user_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::integer FROM profiles_usuarios;
$$;

-- Allow anonymous and authenticated users to call it
GRANT EXECUTE ON FUNCTION get_user_count() TO anon, authenticated;
