
CREATE OR REPLACE FUNCTION public.bulk_import_broadcast_companies(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.broadcast_companies_db (email, company_name, first_name, last_name, last_sent_at, source)
  SELECT
    lower(x->>'email'),
    NULLIF(x->>'company', ''),
    NULLIF(x->>'first_name', ''),
    NULLIF(x->>'last_name', ''),
    COALESCE(NULLIF(x->>'sent_at','')::timestamptz, now()),
    COALESCE(NULLIF(x->>'source',''), 'import')
  FROM jsonb_array_elements(p_rows) x
  WHERE COALESCE(x->>'email','') <> ''
  ON CONFLICT (email) DO UPDATE
    SET last_sent_at = GREATEST(broadcast_companies_db.last_sent_at, EXCLUDED.last_sent_at),
        company_name = COALESCE(EXCLUDED.company_name, broadcast_companies_db.company_name);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_import_broadcast_companies(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_import_broadcast_companies(JSONB) TO authenticated;

-- Also add a helper RPC to check if an email is already in broadcast db
CREATE OR REPLACE FUNCTION public.is_broadcast_company(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.broadcast_companies_db WHERE email = lower(p_email));
$$;

REVOKE ALL ON FUNCTION public.is_broadcast_company(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_broadcast_company(TEXT) TO service_role, authenticated;
