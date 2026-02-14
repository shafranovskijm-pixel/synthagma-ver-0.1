ALTER TABLE public.organizations ADD COLUMN promo_code text;

COMMENT ON COLUMN public.organizations.promo_code IS 'Promo code used during registration';