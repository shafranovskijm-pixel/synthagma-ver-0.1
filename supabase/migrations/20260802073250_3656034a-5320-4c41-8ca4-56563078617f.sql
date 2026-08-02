ALTER TABLE public.student_groups
  ADD COLUMN IF NOT EXISTS group_number text,
  ADD COLUMN IF NOT EXISTS program_title text,
  ADD COLUMN IF NOT EXISTS program_hours integer,
  ADD COLUMN IF NOT EXISTS program_form text,
  ADD COLUMN IF NOT EXISTS default_price numeric;

CREATE TABLE IF NOT EXISTS public.group_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  name text NOT NULL,
  document_number text,
  document_date date,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  html text,
  file_path text,
  status text NOT NULL DEFAULT 'active',
  student_user_id uuid,
  company_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_documents_group ON public.group_documents(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_documents_org ON public.group_documents(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_documents TO authenticated;
GRANT ALL ON public.group_documents TO service_role;

ALTER TABLE public.group_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org staff can view group documents"
ON public.group_documents FOR SELECT TO authenticated
USING (public.can_access_organization(organization_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org staff can insert group documents"
ON public.group_documents FOR INSERT TO authenticated
WITH CHECK (public.can_access_organization(organization_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org staff can update group documents"
ON public.group_documents FOR UPDATE TO authenticated
USING (public.can_access_organization(organization_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org staff can delete group documents"
ON public.group_documents FOR DELETE TO authenticated
USING (public.can_access_organization(organization_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_group_documents_updated_at
BEFORE UPDATE ON public.group_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();