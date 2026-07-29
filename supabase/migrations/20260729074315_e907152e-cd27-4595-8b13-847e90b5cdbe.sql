
-- =========================================================================
-- Phase 5A.1 — server foundation for student capacity + tighter org access
-- =========================================================================

-- 1) Tighten can_access_organization: remove the "any profile in this org"
--    branch. Student self-access to their own profile / enrollments /
--    progress / test attempts is provided by separate self-scoped policies
--    (user_id = auth.uid()) that do NOT depend on this function.
CREATE OR REPLACE FUNCTION public.can_access_organization(
  _organization_id uuid,
  _permission text DEFAULT 'settings.read'::text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    _organization_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (
      -- Global admin
      public.has_role(auth.uid(), 'admin'::public.app_role)
      -- Owner: user with 'organization' role whose profile is attached
      -- to this specific organization.
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.profiles p ON p.user_id = ur.user_id
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'organization'::public.app_role
          AND p.organization_id = _organization_id
      )
      -- Active org_staff with the requested (normalized) permission
      OR (
        _permission IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.org_staff os
          WHERE os.user_id = auth.uid()
            AND os.organization_id = _organization_id
            AND (os.expires_at IS NULL OR os.expires_at > now())
        )
        AND public.has_org_staff_permission(auth.uid(), _organization_id, _permission)
      )
    )
$function$;

-- 2) Canonical student-capacity RPC.
CREATE OR REPLACE FUNCTION public.get_organization_student_capacity(
  p_organization_id uuid,
  p_requested_count integer DEFAULT 1
)
RETURNS TABLE (
  current_students integer,
  max_students integer,
  is_unlimited boolean,
  can_add boolean,
  remaining_students integer,
  subscription_plan text,
  limit_source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_plan text;
  v_custom integer;
  v_plan_limit integer;
  v_max integer;
  v_source text;
  v_current integer;
  v_requested integer := GREATEST(COALESCE(p_requested_count, 1), 0);
  v_uid uuid := auth.uid();
  v_is_service boolean := (current_setting('request.jwt.claim.role', true) = 'service_role');
  v_allowed boolean := false;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  -- Access matrix
  IF v_is_service THEN
    v_allowed := true;
  ELSIF v_uid IS NOT NULL THEN
    IF public.has_role(v_uid, 'admin'::public.app_role) THEN
      v_allowed := true;
    ELSIF EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE ur.user_id = v_uid
        AND ur.role = 'organization'::public.app_role
        AND p.organization_id = p_organization_id
    ) THEN
      v_allowed := true;
    ELSIF EXISTS (
      SELECT 1 FROM public.org_staff os
      WHERE os.user_id = v_uid
        AND os.organization_id = p_organization_id
        AND (os.expires_at IS NULL OR os.expires_at > now())
    ) AND (
      public.has_org_staff_permission(v_uid, p_organization_id, 'students.read')
      OR public.has_org_staff_permission(v_uid, p_organization_id, 'students.write')
    ) THEN
      v_allowed := true;
    ELSIF EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.organization_id = p_organization_id
        AND (
          c.user_id = v_uid
          OR public.has_company_access(v_uid, c.id, 'viewer'::public.company_staff_role)
        )
    ) THEN
      v_allowed := true;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'access denied to organization capacity' USING ERRCODE = '42501';
  END IF;

  SELECT o.subscription_plan, o.custom_max_students
    INTO v_plan, v_custom
  FROM public.organizations o
  WHERE o.id = p_organization_id;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002';
  END IF;

  v_plan_limit := CASE lower(coalesce(v_plan, 'free'))
    WHEN 'free' THEN 10
    WHEN 'start' THEN 100
    WHEN 'standard' THEN 200
    WHEN 'professional' THEN -1
    WHEN 'maximum' THEN -1
    ELSE 10
  END;

  IF v_custom IS NULL THEN
    v_max := v_plan_limit;
    v_source := 'plan';
  ELSE
    v_max := v_custom;
    v_source := 'custom';
  END IF;

  SELECT count(DISTINCT p.user_id)::int
    INTO v_current
  FROM public.profiles p
  WHERE p.organization_id = p_organization_id
    AND p.archived_at IS NULL
    AND public.is_student_profile(p.user_id, p_organization_id);

  current_students := v_current;
  max_students := v_max;
  subscription_plan := v_plan;
  limit_source := v_source;
  is_unlimited := (v_max = -1);

  IF is_unlimited THEN
    remaining_students := -1;
    can_add := true;
  ELSIF v_max <= 0 THEN
    remaining_students := 0;
    can_add := false;
  ELSE
    remaining_students := GREATEST(v_max - v_current, 0);
    can_add := (v_current + v_requested) <= v_max;
  END IF;

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_organization_student_capacity(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_organization_student_capacity(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_organization_student_capacity(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_student_capacity(uuid, integer) TO service_role;

COMMENT ON FUNCTION public.get_organization_student_capacity(uuid, integer) IS
'Canonical student-capacity RPC. Counts only active real students (archived_at IS NULL AND is_student_profile). custom_max_students overrides plan. -1 = unlimited. Access: admin / owning org / active staff with students.* / linked company user / service_role.';
