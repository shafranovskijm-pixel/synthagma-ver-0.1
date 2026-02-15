
CREATE OR REPLACE FUNCTION public.count_org_students(org_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT COUNT(DISTINCT p.user_id)
  FROM public.profiles p
  WHERE p.organization_id = org_id
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.user_id
        AND ur.role IN ('organization', 'admin')
    );
$$;
