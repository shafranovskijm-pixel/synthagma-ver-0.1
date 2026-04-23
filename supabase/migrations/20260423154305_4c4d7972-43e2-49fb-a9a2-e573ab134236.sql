-- Batch RPC for fetching organization credentials in one call
CREATE OR REPLACE FUNCTION public.get_decrypted_org_credentials_batch(p_organization_ids uuid[])
RETURNS TABLE (
  organization_id uuid,
  login_email text,
  login_password text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    oc.organization_id,
    oc.login_email,
    oc.login_password
  FROM public.organization_credentials oc
  WHERE oc.organization_id = ANY(p_organization_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.get_decrypted_org_credentials_batch(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_decrypted_org_credentials_batch(uuid[]) TO authenticated;

-- Targeted indexes for hot filters
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_completed
  ON public.lesson_progress (user_id, completed, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_attempts_user_completed
  ON public.test_attempts (user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_companies_db_inn
  ON public.sales_companies_db (inn);

CREATE INDEX IF NOT EXISTS idx_sales_companies_db_region
  ON public.sales_companies_db (region);

CREATE INDEX IF NOT EXISTS idx_sales_companies_db_updated
  ON public.sales_companies_db (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_checko_pending_inns_added
  ON public.checko_pending_inns (added_at);

CREATE INDEX IF NOT EXISTS idx_profiles_org
  ON public.profiles (organization_id);

CREATE INDEX IF NOT EXISTS idx_courses_org
  ON public.courses (organization_id);
