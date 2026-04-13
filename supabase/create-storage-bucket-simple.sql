-- Simple SQL to create the 'chawp' public storage bucket
-- Run this in Supabase SQL Editor

INSERT INTO storage.buckets (id, name, public)
VALUES ('chawp', 'chawp', true)
ON CONFLICT (id) DO NOTHING;

-- Allow everyone to read files (public access)
CREATE POLICY "Public read access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'chawp');

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'chawp' AND auth.role() = 'authenticated');

-- Allow authenticated users to update files
CREATE POLICY "Authenticated update" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'chawp' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete files
CREATE POLICY "Authenticated delete" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'chawp' AND auth.role() = 'authenticated');
