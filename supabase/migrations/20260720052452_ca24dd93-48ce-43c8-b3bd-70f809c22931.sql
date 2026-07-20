
ALTER TABLE public.admin_generated_documents
  ADD COLUMN IF NOT EXISTS plan text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_email text,
  ADD COLUMN IF NOT EXISTS sent_to_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
