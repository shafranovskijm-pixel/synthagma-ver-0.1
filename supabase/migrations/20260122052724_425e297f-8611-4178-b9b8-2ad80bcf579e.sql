-- Add SELECT policy for public access to presentations bucket
CREATE POLICY "Public can read presentations" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'presentations');

-- Add UPDATE policy for organizations
CREATE POLICY "Organizations can update presentations" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'presentations');

-- Add DELETE policy for organizations  
CREATE POLICY "Organizations can delete presentations" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'presentations');