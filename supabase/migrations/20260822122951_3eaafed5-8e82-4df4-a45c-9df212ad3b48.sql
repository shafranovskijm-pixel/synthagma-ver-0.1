-- profiles.organization_id/company_id/student_group_id are security identities used by
-- current_organization_id(), current_company_id() and tenant RLS helpers.
-- Existing broad profile UPDATE policies are intentionally kept for ordinary
-- profile and student administration fields, while these columns are
-- protected separately.

CREATE OR REPLACE FUNCTION public.guard_profile_tenant_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.student_group_id IS NOT DISTINCT FROM OLD.student_group_id
  THEN
    RETURN NEW;
  END IF;

  -- Service-role provisioning, global platform administrators and existing
  -- SECURITY DEFINER ownership/provisioning functions remain able to perform
  -- an explicit tenant transfer. A direct authenticated PostgREST request has
  -- current_user = authenticated and therefore cannot use this exception.
  IF auth.role() = 'service_role'
     OR public.has_role('admin'::public.app_role, auth.uid())
     OR current_user IN ('postgres', 'supabase_admin')
  THEN
    RETURN NEW;
  END IF;

  -- students.write managers may keep assigning a student to a company/group
  -- inside the student's existing organization. This does not let a student
  -- self-enrol by changing student_group_id or let a company account
  -- self-select another tenant, while preserving the current organization UI.
  IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
     AND public.can_access_organization(OLD.organization_id, 'students.write')
     AND (
       NEW.company_id IS NOT DISTINCT FROM OLD.company_id
       OR NEW.company_id IS NULL
       OR EXISTS (
         SELECT 1
         FROM public.companies c
         WHERE c.id = NEW.company_id
           AND c.organization_id = OLD.organization_id
       )
     )
     AND (
       NEW.student_group_id IS NOT DISTINCT FROM OLD.student_group_id
       OR NEW.student_group_id IS NULL
       OR EXISTS (
         SELECT 1
         FROM public.student_groups g
         WHERE g.id = NEW.student_group_id
           AND g.organization_id = OLD.organization_id
       )
     )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Profile tenant identity may only be changed by a trusted provisioning workflow'
    USING ERRCODE = '42501';
END
$function$;

REVOKE ALL ON FUNCTION public.guard_profile_tenant_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_profile_tenant_identity() FROM anon;

DROP TRIGGER IF EXISTS guard_profile_tenant_identity
  ON public.profiles;
CREATE TRIGGER guard_profile_tenant_identity
BEFORE UPDATE OF organization_id, company_id, student_group_id
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_tenant_identity();