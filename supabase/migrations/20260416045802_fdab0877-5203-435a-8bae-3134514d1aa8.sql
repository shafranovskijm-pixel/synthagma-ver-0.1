
-- Create frdo_signed_documents table
CREATE TABLE public.frdo_signed_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded',
  sent_to_admin_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.frdo_signed_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their documents"
  ON public.frdo_signed_documents FOR SELECT
  USING (organization_id = public.current_organization_id() OR public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org members can insert documents"
  ON public.frdo_signed_documents FOR INSERT
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY "Org members can update their documents"
  ON public.frdo_signed_documents FOR UPDATE
  USING (organization_id = public.current_organization_id());

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('frdo-documents', 'frdo-documents', false);

CREATE POLICY "Org users can upload frdo docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'frdo-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Org users can read frdo docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'frdo-documents' AND auth.uid() IS NOT NULL);
