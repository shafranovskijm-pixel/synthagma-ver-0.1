-- These legacy policies predate org_staff permissions. Because PostgreSQL
-- combines permissive policies with OR, current_organization_id() allowed
-- staff to bypass the later courses.read/courses.write matrix. Keep the
-- staff-aware SELECT/INSERT/UPDATE/DELETE policies from 20260728072432 as the
-- only organization-scoped access path. Public published-course and platform
-- admin policies remain unchanged.
DROP POLICY IF EXISTS "Org users can manage their courses" ON public.courses;
DROP POLICY IF EXISTS "Org users can view own courses" ON public.courses;

-- Defence in depth: an account represented by org_staff is never an implicit
-- owner. It must pass the requested permission through its staff role.
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
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.profiles p ON p.user_id = ur.user_id
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'organization'::public.app_role
          AND p.organization_id = _organization_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.org_staff os
            WHERE os.user_id = auth.uid()
              AND os.organization_id = _organization_id
          )
      )
      OR (
        _permission IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.org_staff os
          WHERE os.user_id = auth.uid()
            AND os.organization_id = _organization_id
            AND (os.expires_at IS NULL OR os.expires_at > now())
        )
        AND public.has_org_staff_permission(auth.uid(), _organization_id, _permission)
      )
    )
$function$;

-- Replace the first-generation org_staff policies, which trusted a global
-- organization role and therefore treated some legacy teachers as owners.
DROP POLICY IF EXISTS "org_staff_select" ON public.org_staff;
DROP POLICY IF EXISTS "org_staff_insert" ON public.org_staff;
DROP POLICY IF EXISTS "org_staff_update" ON public.org_staff;
DROP POLICY IF EXISTS "org_staff_delete" ON public.org_staff;

-- A raw organization ownership identity (global organization role plus the
-- matching profile tenant) must never coexist with org_staff membership. RLS
-- alone is not enough because service-role Edge Functions bypass policies, so
-- enforce the invariant with a table trigger as well.
CREATE OR REPLACE FUNCTION public.has_org_ownership_identity(
  _user_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'organization'::public.app_role
      AND p.organization_id = _organization_id
  )
$function$;

REVOKE ALL ON FUNCTION public.has_org_ownership_identity(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_org_ownership_identity(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_org_ownership_identity(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_org_staff_owner_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.role = 'owner'
     OR public.has_org_ownership_identity(NEW.user_id, NEW.organization_id)
  THEN
    RAISE EXCEPTION 'Organization owner cannot also be organization staff'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.prevent_org_staff_owner_overlap() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_org_staff_owner_overlap() FROM anon;

DROP TRIGGER IF EXISTS prevent_org_staff_owner_overlap ON public.org_staff;
CREATE TRIGGER prevent_org_staff_owner_overlap
BEFORE INSERT OR UPDATE OF organization_id, user_id, role
ON public.org_staff
FOR EACH ROW
EXECUTE FUNCTION public.prevent_org_staff_owner_overlap();

CREATE POLICY "org_staff_select"
ON public.org_staff FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_access_organization(organization_id, 'staff.read')
);

CREATE POLICY "org_staff_insert"
ON public.org_staff FOR INSERT TO authenticated
WITH CHECK (
  role <> 'owner'
  AND NOT public.has_org_ownership_identity(user_id, organization_id)
  AND public.can_access_organization(organization_id, 'staff.write')
);

CREATE POLICY "org_staff_update"
ON public.org_staff FOR UPDATE TO authenticated
USING (public.can_access_organization(organization_id, 'staff.write'))
WITH CHECK (
  role <> 'owner'
  AND NOT public.has_org_ownership_identity(user_id, organization_id)
  AND public.can_access_organization(organization_id, 'staff.write')
);

-- Deletion is performed by remove_org_staff_member so revocation of a legacy
-- implicit-owner role and the staff row happen in one transaction.
CREATE OR REPLACE FUNCTION public.remove_org_staff_member(p_staff_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_staff public.org_staff%ROWTYPE;
BEGIN
  SELECT * INTO v_staff
  FROM public.org_staff
  WHERE id = p_staff_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT public.can_access_organization(v_staff.organization_id, 'staff.write') THEN
    RAISE EXCEPTION 'Insufficient permission to remove organization staff'
      USING ERRCODE = '42501';
  END IF;

  -- Ownership and staff membership must never overlap. There is no reliable
  -- legacy marker that lets a migration decide which identity to revoke, so
  -- fail closed and require an explicit ownership repair instead of risking
  -- an ownerless organization.
  IF public.is_org_owner(v_staff.user_id, v_staff.organization_id) OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = v_staff.user_id
      AND ur.role = 'organization'::public.app_role
      AND p.organization_id = v_staff.organization_id
  ) THEN
    RAISE EXCEPTION 'Staff member also has organization ownership identity; resolve ownership first'
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.org_staff WHERE id = p_staff_id;

  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.remove_org_staff_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_org_staff_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_org_staff_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_org_owner(
  _user_id uuid,
  _organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'organization'::public.app_role
      AND p.organization_id = _organization_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.org_staff os
        WHERE os.user_id = _user_id
          AND os.organization_id = _organization_id
      )
  )
$function$;

DO $assert_course_policies$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'courses'
      AND policyname IN (
        'Org users can manage their courses',
        'Org users can view own courses'
      )
  ) THEN
    RAISE EXCEPTION 'Legacy course policies are still active';
  END IF;
END
$assert_course_policies$;
