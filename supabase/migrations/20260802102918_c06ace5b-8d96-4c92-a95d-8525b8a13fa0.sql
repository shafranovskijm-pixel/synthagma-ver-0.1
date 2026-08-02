ALTER TABLE public.org_contract_templates
  ADD COLUMN IF NOT EXISTS counterparty_type text NOT NULL DEFAULT 'any';

ALTER TABLE public.org_contract_templates
  DROP CONSTRAINT IF EXISTS org_contract_templates_counterparty_type_check;
ALTER TABLE public.org_contract_templates
  ADD CONSTRAINT org_contract_templates_counterparty_type_check
  CHECK (counterparty_type IN ('individual','legal','any'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_contract_templates_default
  ON public.org_contract_templates(organization_id, counterparty_type)
  WHERE is_default AND archived_at IS NULL;

ALTER TABLE public.org_contracts
  ADD COLUMN IF NOT EXISTS template_version integer,
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS students jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_contracts_number
  ON public.org_contracts(organization_id, contract_number)
  WHERE contract_number IS NOT NULL;