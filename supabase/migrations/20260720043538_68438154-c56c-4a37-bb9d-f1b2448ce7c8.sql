CREATE TABLE public.admin_generated_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doc_type TEXT NOT NULL,
  doc_number TEXT,
  doc_date DATE NOT NULL DEFAULT CURRENT_DATE,
  counterparty_name TEXT NOT NULL,
  counterparty_inn TEXT,
  counterparty_kind TEXT NOT NULL DEFAULT 'legal',
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  html_content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  signature_id UUID REFERENCES public.document_signatures(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_generated_documents TO authenticated;
GRANT ALL ON public.admin_generated_documents TO service_role;

ALTER TABLE public.admin_generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage admin generated documents"
ON public.admin_generated_documents
FOR ALL
TO authenticated
USING (
  public.has_admin_staff_role(auth.uid(), 'admin')
  OR public.has_admin_staff_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  public.has_admin_staff_role(auth.uid(), 'admin')
  OR public.has_admin_staff_role(auth.uid(), 'super_admin')
);

CREATE INDEX idx_admin_generated_documents_created_at
  ON public.admin_generated_documents(created_at DESC);
CREATE INDEX idx_admin_generated_documents_doc_type
  ON public.admin_generated_documents(doc_type);

CREATE TRIGGER update_admin_generated_documents_updated_at
  BEFORE UPDATE ON public.admin_generated_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();