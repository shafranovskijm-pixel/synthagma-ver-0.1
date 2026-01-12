-- Drop existing broken policies
DROP POLICY IF EXISTS "Authenticated users can upload to org-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view org-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update org-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete org-documents" ON storage.objects;

-- Create simple policies that allow authenticated organization users to manage files
CREATE POLICY "org_documents_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'org-documents');

CREATE POLICY "org_documents_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'org-documents');

CREATE POLICY "org_documents_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'org-documents');

CREATE POLICY "org_documents_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'org-documents');