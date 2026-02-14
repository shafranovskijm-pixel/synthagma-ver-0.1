
CREATE OR REPLACE FUNCTION public.increment_promo_usage(p_code TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE promo_codes SET used_count = used_count + 1 WHERE code = p_code;
$$;
