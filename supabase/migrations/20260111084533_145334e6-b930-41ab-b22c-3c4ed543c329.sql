-- Create storage bucket for company documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-documents', 'company-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Create table to track company documents
CREATE TABLE public.company_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('contract', 'invoice', 'act', 'other')),
  name TEXT NOT NULL,
  file_url TEXT,
  file_path TEXT,
  file_size INTEGER,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for company_documents
CREATE POLICY "Org users can view company documents"
ON public.company_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id = company_documents.company_id
    AND (c.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  )
);

CREATE POLICY "Org users can manage company documents"
ON public.company_documents
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id = company_documents.company_id
    AND (c.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id = company_documents.company_id
    AND (c.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  )
);

-- Storage policies for company-documents bucket
CREATE POLICY "Org users can upload company documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM companies c
    JOIN profiles p ON p.organization_id = c.organization_id
    WHERE c.id::text = (storage.foldername(name))[1]
    AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Org users can view company documents storage"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM companies c
    JOIN profiles p ON p.organization_id = c.organization_id
    WHERE c.id::text = (storage.foldername(name))[1]
    AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Org users can delete company documents storage"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM companies c
    JOIN profiles p ON p.organization_id = c.organization_id
    WHERE c.id::text = (storage.foldername(name))[1]
    AND p.user_id = auth.uid()
  )
);