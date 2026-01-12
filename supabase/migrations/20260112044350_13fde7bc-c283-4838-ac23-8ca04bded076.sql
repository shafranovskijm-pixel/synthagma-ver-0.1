-- Drop existing policies and recreate with correct logic
DROP POLICY IF EXISTS "Org users can upload company documents" ON storage.objects;
DROP POLICY IF EXISTS "Org users can view company documents" ON storage.objects;
DROP POLICY IF EXISTS "Org users can update company documents" ON storage.objects;
DROP POLICY IF EXISTS "Org users can delete company documents" ON storage.objects;

-- Allow org users to upload files to their companies' folders
CREATE POLICY "Org users can upload company documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-documents' 
  AND EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id::text = (storage.foldername(name))[1]
    AND (c.organization_id = public.current_organization_id() OR public.has_role('admin'::public.app_role, auth.uid()))
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
    WHERE c.id::text = (storage.foldername(name))[1]
    AND (c.organization_id = public.current_organization_id() OR public.has_role('admin'::public.app_role, auth.uid()))
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
    WHERE c.id::text = (storage.foldername(name))[1]
    AND (c.organization_id = public.current_organization_id() OR public.has_role('admin'::public.app_role, auth.uid()))
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
    WHERE c.id::text = (storage.foldername(name))[1]
    AND (c.organization_id = public.current_organization_id() OR public.has_role('admin'::public.app_role, auth.uid()))
  )
);