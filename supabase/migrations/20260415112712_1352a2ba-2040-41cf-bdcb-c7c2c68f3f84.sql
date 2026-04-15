
-- Create storage bucket for cached presentation PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('presentation-files', 'presentation-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read access for presentation files"
ON storage.objects FOR SELECT
USING (bucket_id = 'presentation-files');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload presentation files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'presentation-files');

-- Allow authenticated users to update/overwrite
CREATE POLICY "Authenticated users can update presentation files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'presentation-files');

-- Allow authenticated users to delete
CREATE POLICY "Authenticated users can delete presentation files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'presentation-files');
