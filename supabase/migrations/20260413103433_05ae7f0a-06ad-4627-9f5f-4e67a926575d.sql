
CREATE TABLE public.org_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  contract_number TEXT,
  contract_date DATE,
  file_url TEXT,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.org_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view own contracts"
  ON public.org_contracts FOR SELECT
  TO authenticated
  USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org members can insert own contracts"
  ON public.org_contracts FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org members can update own contracts"
  ON public.org_contracts FOR UPDATE
  TO authenticated
  USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org members can delete own contracts"
  ON public.org_contracts FOR DELETE
  TO authenticated
  USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER update_org_contracts_updated_at
  BEFORE UPDATE ON public.org_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
