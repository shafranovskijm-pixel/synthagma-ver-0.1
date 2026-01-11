-- Create storage policies for company-documents bucket
-- Allow organization users to upload documents for their companies

-- Policy for inserting files (uploading)
CREATE POLICY "Organization users can upload company documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'company-documents' 
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.companies c ON c.organization_id = p.organization_id
    WHERE p.user_id = auth.uid()
    AND c.id::text = (storage.foldername(name))[1]
  )
);

-- Policy for selecting files (viewing)
CREATE POLICY "Organization users can view their company documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'company-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.companies c ON c.organization_id = p.organization_id
    WHERE p.user_id = auth.uid()
    AND c.id::text = (storage.foldername(name))[1]
  )
);

-- Policy for updating files
CREATE POLICY "Organization users can update their company documents"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'company-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.companies c ON c.organization_id = p.organization_id
    WHERE p.user_id = auth.uid()
    AND c.id::text = (storage.foldername(name))[1]
  )
);

-- Policy for deleting files
CREATE POLICY "Organization users can delete their company documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'company-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.companies c ON c.organization_id = p.organization_id
    WHERE p.user_id = auth.uid()
    AND c.id::text = (storage.foldername(name))[1]
  )
);