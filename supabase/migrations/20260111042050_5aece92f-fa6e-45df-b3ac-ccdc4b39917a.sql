-- Create storage bucket for organization documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-documents', 'org-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for org-documents bucket
-- Org users can view documents from their organization
CREATE POLICY "Org users can view org documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'org-documents' 
  AND (storage.foldername(name))[1]::uuid = current_organization_id()
);

-- Org users can upload documents to their organization folder
CREATE POLICY "Org users can upload org documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'org-documents' 
  AND (storage.foldername(name))[1]::uuid = current_organization_id()
);

-- Org users can delete documents from their organization folder
CREATE POLICY "Org users can delete org documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'org-documents' 
  AND (storage.foldername(name))[1]::uuid = current_organization_id()
);

-- Admins can manage all org documents
CREATE POLICY "Admins can manage all org documents"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'org-documents' 
  AND has_role('admin'::app_role, auth.uid())
);

-- Update RLS policy for org_documents to allow admins
DROP POLICY IF EXISTS "Org users can manage org documents" ON public.org_documents;

CREATE POLICY "Org users can manage org documents"
ON public.org_documents
FOR ALL
USING (
  organization_id = current_organization_id()
  OR has_role('admin'::app_role, auth.uid())
)
WITH CHECK (
  organization_id = current_organization_id()
  OR has_role('admin'::app_role, auth.uid())
);