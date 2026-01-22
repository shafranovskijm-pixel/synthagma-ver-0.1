-- Create public bucket for presentations
INSERT INTO storage.buckets (id, name, public) 
VALUES ('presentations', 'presentations', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy for organizations to upload presentations
CREATE POLICY "Organizations can upload presentations" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'presentations');

-- Create policy for anyone to view presentations (needed for Google Docs Viewer)
CREATE POLICY "Presentations are publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'presentations');