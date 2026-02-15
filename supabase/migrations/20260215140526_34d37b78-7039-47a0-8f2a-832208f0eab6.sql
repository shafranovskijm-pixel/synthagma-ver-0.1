
-- Billing documents table
CREATE TABLE public.org_billing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  doc_type text NOT NULL DEFAULT 'invoice',
  file_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid
);

ALTER TABLE public.org_billing_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can view own billing docs"
  ON public.org_billing_documents FOR SELECT
  USING (organization_id = current_organization_id());

CREATE POLICY "Admins can manage billing docs"
  ON public.org_billing_documents FOR ALL
  USING (has_role('admin'::app_role, auth.uid()));

-- Storage bucket for billing documents
INSERT INTO storage.buckets (id, name, public) VALUES ('billing-documents', 'billing-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Admins can upload billing docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'billing-documents' AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete billing docs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'billing-documents' AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Org users can read own billing docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'billing-documents' AND (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR (storage.foldername(name))[1] IN (SELECT id::text FROM profiles WHERE user_id = auth.uid() AND organization_id IS NOT NULL)
  ));
