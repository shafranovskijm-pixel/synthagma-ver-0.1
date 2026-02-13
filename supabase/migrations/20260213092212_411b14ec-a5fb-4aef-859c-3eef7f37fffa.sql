-- Create public bucket for demo assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('demo-assets', 'demo-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read access for demo-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'demo-assets');

-- Allow authenticated upload (for admin)
CREATE POLICY "Admin upload for demo-assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'demo-assets' AND auth.role() = 'authenticated');