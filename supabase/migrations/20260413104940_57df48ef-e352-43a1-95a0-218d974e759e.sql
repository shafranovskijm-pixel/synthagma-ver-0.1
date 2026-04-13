
-- Create enum for payer type
CREATE TYPE public.payer_type AS ENUM ('individual', 'legal_entity');

-- Create org_payers table
CREATE TABLE public.org_payers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  inn TEXT,
  phone TEXT,
  email TEXT,
  payer_type payer_type NOT NULL DEFAULT 'individual',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.org_payers ENABLE ROW LEVEL SECURITY;

-- Org users can manage their own payers
CREATE POLICY "Org users can view their payers"
ON public.org_payers FOR SELECT
TO authenticated
USING (
  organization_id = current_organization_id()
  OR has_role('admin'::app_role, auth.uid())
);

CREATE POLICY "Org users can create payers"
ON public.org_payers FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = current_organization_id()
  OR has_role('admin'::app_role, auth.uid())
);

CREATE POLICY "Org users can update their payers"
ON public.org_payers FOR UPDATE
TO authenticated
USING (
  organization_id = current_organization_id()
  OR has_role('admin'::app_role, auth.uid())
);

CREATE POLICY "Org users can delete their payers"
ON public.org_payers FOR DELETE
TO authenticated
USING (
  organization_id = current_organization_id()
  OR has_role('admin'::app_role, auth.uid())
);

-- Timestamp trigger
CREATE TRIGGER update_org_payers_updated_at
BEFORE UPDATE ON public.org_payers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
