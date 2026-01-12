-- Drop existing policies
DROP POLICY IF EXISTS "Org users can upload company documents" ON storage.objects;
DROP POLICY IF EXISTS "Org users can view company documents" ON storage.objects;
DROP POLICY IF EXISTS "Org users can update company documents" ON storage.objects;
DROP POLICY IF EXISTS "Org users can delete company documents" ON storage.objects;

-- Simplified policy: Allow authenticated users to upload to company folders they have access to via profiles
CREATE POLICY "Org users can upload company documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-documents' 
  AND EXISTS (
    SELECT 1 FROM public.companies c
    JOIN public.profiles p ON p.organization_id = c.organization_id
    WHERE c.id::text = (storage.foldername(name))[1]
    AND p.user_id = auth.uid()
  )
);

-- Allow org users to view their company documents
CREATE POLICY "Org users can view company documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM public.companies c
    JOIN public.profiles p ON p.organization_id = c.organization_id
    WHERE c.id::text = (storage.foldername(name))[1]
    AND p.user_id = auth.uid()
  )
);

-- Allow org users to update their company documents
CREATE POLICY "Org users can update company documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM public.companies c
    JOIN public.profiles p ON p.organization_id = c.organization_id
    WHERE c.id::text = (storage.foldername(name))[1]
    AND p.user_id = auth.uid()
  )
);

-- Allow org users to delete their company documents
CREATE POLICY "Org users can delete company documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM public.companies c
    JOIN public.profiles p ON p.organization_id = c.organization_id
    WHERE c.id::text = (storage.foldername(name))[1]
    AND p.user_id = auth.uid()
  )
);