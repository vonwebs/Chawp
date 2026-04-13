-- Create a public storage bucket named 'chawp' for app assets
-- This bucket will store user avatars, meal images, vendor images, etc.

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chawp',
  'chawp',
  true, -- Public bucket
  52428800, -- 50MB file size limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for the 'chawp' bucket

-- Policy 1: Allow public read access (anyone can view images)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'chawp');

-- Policy 2: Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chawp' 
  AND auth.role() = 'authenticated'
);

-- Policy 3: Allow users to update their own uploads
CREATE POLICY "Users can update own uploads"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'chawp' 
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'chawp' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy 4: Allow users to delete their own uploads
CREATE POLICY "Users can delete own uploads"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'chawp' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create folders structure (optional - folders are created automatically on upload)
-- But you can organize your storage with these paths:
-- - avatars/{user_id}/
-- - meals/
-- - vendors/
-- - banners/
-- - categories/

-- Note: To run this SQL:
-- 1. Go to Supabase Dashboard
-- 2. Navigate to SQL Editor
-- 3. Create a new query
-- 4. Paste and run this SQL
-- 5. Or use the Supabase CLI: supabase db push
