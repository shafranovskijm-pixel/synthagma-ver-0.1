ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS tariff_custom_label text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS paid_until timestamptz;