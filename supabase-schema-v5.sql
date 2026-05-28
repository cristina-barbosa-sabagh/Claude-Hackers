-- ============================================================
-- SCHEMA V5: Perfil editable + Bucket de avatars
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. AGREGAR COLUMNAS A profiles_usuarios
-- ============================================================

ALTER TABLE profiles_usuarios
  ADD COLUMN IF NOT EXISTS nombre_completo TEXT,
  ADD COLUMN IF NOT EXISTS empresa TEXT,
  ADD COLUMN IF NOT EXISTS rol TEXT,
  ADD COLUMN IF NOT EXISTS pais TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. CREAR BUCKET "avatars" EN STORAGE
-- ============================================================
-- NOTA: Esto se hace desde el Dashboard de Supabase:
--   1. Ve a Storage en el menu lateral
--   2. Click "New bucket"
--   3. Nombre: avatars
--   4. Marca "Public bucket" (para que las fotos sean accesibles sin auth)
--   5. File size limit: 2097152 (2MB en bytes)
--   6. Allowed MIME types: image/jpeg, image/png, image/webp
--   7. Click "Create bucket"
--
-- Si prefieres crearlo por SQL (beta), descomenta esto:
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'avatars',
--   'avatars',
--   true,
--   2097152,
--   ARRAY['image/jpeg', 'image/png', 'image/webp']
-- );

-- 3. POLICIES DE STORAGE PARA BUCKET "avatars"
-- ============================================================

-- SELECT: cualquier usuario autenticado puede ver avatars
CREATE POLICY "Avatars son visibles para usuarios autenticados"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- INSERT: solo puede subir a su propia carpeta (user_id/)
CREATE POLICY "Usuarios pueden subir su propio avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- UPDATE: solo puede actualizar archivos en su propia carpeta
CREATE POLICY "Usuarios pueden actualizar su propio avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- DELETE: solo puede borrar archivos en su propia carpeta
CREATE POLICY "Usuarios pueden borrar su propio avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- INSTRUCCIONES:
-- 1. Primero crea el bucket "avatars" desde el Dashboard
--    (Storage > New bucket > nombre "avatars" > Public > 2MB > MIME types)
-- 2. Luego ejecuta TODO este SQL en el SQL Editor
-- 3. Verifica en Table Editor que profiles_usuarios tiene las columnas nuevas
-- 4. Verifica en Storage > Policies que aparecen las 4 policies
-- ============================================================
