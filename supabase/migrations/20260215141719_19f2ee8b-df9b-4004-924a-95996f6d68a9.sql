ALTER TABLE public.organizations DROP CONSTRAINT organizations_tariff_type_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_tariff_type_check 
  CHECK (tariff_type IN ('free', 'trial', 'monthly', 'yearly'));