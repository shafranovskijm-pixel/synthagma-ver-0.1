
CREATE OR REPLACE FUNCTION public.is_student_profile(_target_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _target_user_id IS NOT NULL
    AND _org_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _target_user_id
        AND role IN ('admin', 'organization', 'company', 'sales_manager')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.org_staff
      WHERE user_id = _target_user_id
        AND organization_id = _org_id
        AND (expires_at IS NULL OR expires_at > now())
    );
$$;
