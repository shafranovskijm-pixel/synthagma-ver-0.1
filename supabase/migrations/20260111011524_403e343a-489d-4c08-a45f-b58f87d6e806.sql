-- Create storage bucket for course files
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-files', 'course-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload course files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'course-files' AND auth.role() = 'authenticated');

-- Allow public read access
CREATE POLICY "Public read access for course files"
ON storage.objects FOR SELECT
USING (bucket_id = 'course-files');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own course files"
ON storage.objects FOR DELETE
USING (bucket_id = 'course-files' AND auth.role() = 'authenticated');