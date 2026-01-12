-- Drop existing policies
DROP POLICY IF EXISTS "Org users can upload company documents" ON storage.objects;
DROP POLICY IF EXISTS "Org users can view company documents" ON storage.objects;
DROP POLICY IF EXISTS "Org users can update company documents" ON storage.objects;
DROP POLICY IF EXISTS "Org users can delete company documents" ON storage.objects;

-- Simple policy: Allow authenticated users to upload to company-documents bucket
-- if they belong to an organization
CREATE POLICY "Org users can upload company documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-documents' 
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.organization_id IS NOT NULL
  )
);

-- Allow org users to view documents in company-documents bucket
CREATE POLICY "Org users can view company documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.organization_id IS NOT NULL
  )
);

-- Allow org users to update documents
CREATE POLICY "Org users can update company documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.organization_id IS NOT NULL
  )
);

-- Allow org users to delete documents
CREATE POLICY "Org users can delete company documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.organization_id IS NOT NULL
  )
);