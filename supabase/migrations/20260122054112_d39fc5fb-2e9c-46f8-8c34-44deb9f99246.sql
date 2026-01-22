-- Drop and recreate INSERT policy with proper authentication check
DROP POLICY IF EXISTS "Organizations can upload presentations" ON storage.objects;

CREATE POLICY "Authenticated users can upload presentations" 
ON storage.objects FOR INSERT 
WITH CHECK (
  bucket_id = 'presentations' 
  AND auth.role() = 'authenticated'
);