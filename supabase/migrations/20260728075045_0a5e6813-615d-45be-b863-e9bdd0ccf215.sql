-- Helper: is target profile a "student" profile within org, i.e. NOT admin,
-- NOT organization owner, and NOT active org_staff of that organization.
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
        AND role IN ('admin', 'organization')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.org_staff
      WHERE user_id = _target_user_id
        AND organization_id = _org_id
        AND (expires_at IS NULL OR expires_at > now())
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_student_profile(uuid, uuid) TO authenticated, service_role;

-- Replace overly broad staff SELECT policy on profiles with a student-scoped one.
DROP POLICY IF EXISTS "Org staff can view profiles" ON public.profiles;
CREATE POLICY "Org staff can view student profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  public.can_access_organization(organization_id, 'students.read')
  AND public.is_student_profile(user_id, organization_id)
);

-- Replace overly broad staff UPDATE policy on profiles with a student-scoped one.
DROP POLICY IF EXISTS "Org staff can update profiles" ON public.profiles;
CREATE POLICY "Org staff can update student profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (
  public.can_access_organization(organization_id, 'students.write')
  AND public.is_student_profile(user_id, organization_id)
)
WITH CHECK (
  public.can_access_organization(organization_id, 'students.write')
  AND public.is_student_profile(user_id, organization_id)
);