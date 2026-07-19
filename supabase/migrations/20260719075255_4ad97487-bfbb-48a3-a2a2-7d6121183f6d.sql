ALTER TABLE public.org_contracts
  ADD COLUMN IF NOT EXISTS student_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_group_id UUID REFERENCES public.student_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS counterparty_type TEXT,
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.org_contract_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variables JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'org_contracts'
      AND constraint_name = 'org_contracts_counterparty_type_check'
  ) THEN
    ALTER TABLE public.org_contracts
      ADD CONSTRAINT org_contracts_counterparty_type_check
      CHECK (counterparty_type IS NULL OR counterparty_type IN ('individual','legal'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_org_contracts_group
  ON public.org_contracts(organization_id, student_group_id);
CREATE INDEX IF NOT EXISTS idx_org_contracts_student
  ON public.org_contracts(organization_id, student_user_id);
CREATE INDEX IF NOT EXISTS idx_org_contracts_company
  ON public.org_contracts(organization_id, company_id);