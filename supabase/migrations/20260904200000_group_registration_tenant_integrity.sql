-- Atomic group/course tenant integrity at the table boundary, including the
-- service-role create_student_profile_with_capacity RPC. Its quota calculation,
-- monthly lock, result contract and permissions are deliberately unchanged.
--
-- NOT VALID avoids rewriting or silently repairing historical tenant mismatches.
-- New references and parent key changes are still enforced by PostgreSQL's FK
-- machinery (including its concurrent-transaction checks). Audit/remediate old
-- mismatches separately before VALIDATE CONSTRAINT; there is no data backfill.
-- Retain the single-column FKs: they also clear legacy/null-tenant references on
-- deletion. PostgREST embeddings across these pairs must use an explicit FK hint
-- if ambiguous (profiles_student_group_id_fkey/student_groups_course_id_fkey).
CREATE UNIQUE INDEX student_groups_id_organization_registration_key
  ON public.student_groups (id, organization_id);
CREATE UNIQUE INDEX courses_id_organization_registration_key
  ON public.courses (id, organization_id);

ALTER TABLE public.student_groups
  ADD CONSTRAINT student_groups_course_organization_registration_fkey
  FOREIGN KEY (course_id, organization_id)
  REFERENCES public.courses (id, organization_id)
  ON UPDATE NO ACTION ON DELETE SET NULL (course_id)
  NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_group_organization_registration_fkey
  FOREIGN KEY (student_group_id, organization_id)
  REFERENCES public.student_groups (id, organization_id)
  ON UPDATE NO ACTION ON DELETE SET NULL (student_group_id)
  NOT VALID;

CREATE OR REPLACE FUNCTION public.sync_profile_group_course_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_course_id uuid;
  v_group_org_id uuid;
  v_course_org_id uuid;
BEGIN
  IF NEW.student_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- SHARE, not KEY SHARE: course_id is not a key, but changing it must wait for
  -- registration/enrollment to commit. Held until transaction end. The group
  -- updater's AFTER trigger then sees committed membership at READ COMMITTED.
  -- Native composite FKs protect tenant references under stronger isolation too;
  -- this is not a claim of tested multi-session enrollment synchronization.
  SELECT g.course_id, g.organization_id INTO v_course_id, v_group_org_id
  FROM public.student_groups g WHERE g.id = NEW.student_group_id
  FOR SHARE;
  IF NOT FOUND THEN
    -- Cascading actions can already have deleted the group before this queued
    -- AFTER event runs. Its native SET NULL action clears the actual membership.
    IF TG_OP = 'UPDATE' AND NEW.organization_id IS NULL AND OLD.organization_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = OLD.organization_id)
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'student_group_not_found' USING ERRCODE = '23503';
  END IF;

  -- Preserve the pre-existing organization deletion actions: profiles.org uses
  -- ON DELETE SET NULL, while groups use ON DELETE CASCADE. During that cascade
  -- only, the organization is already gone and group deletion will clear the
  -- membership. Do not create an enrollment from this intermediate row.
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS NULL
     AND OLD.organization_id IS NOT DISTINCT FROM v_group_org_id
     AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = v_group_org_id)
  THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL OR v_group_org_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'student_group_organization_mismatch' USING ERRCODE = '23503';
  END IF;

  IF v_course_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT c.organization_id INTO v_course_org_id
  FROM public.courses c WHERE c.id = v_course_id FOR SHARE;
  IF NOT FOUND OR v_course_org_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'group_course_organization_mismatch' USING ERRCODE = '23503';
  END IF;

  -- A normal profile save may explicitly SET the unchanged identity fields.
  -- Validate them above, but do not undo an intentional enrollment deletion.
  IF TG_OP = 'UPDATE'
     AND NEW.student_group_id IS NOT DISTINCT FROM OLD.student_group_id
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
  THEN
    RETURN NEW;
  END IF;

  -- Existing active/completed/expired enrollments, progress and expiry are never
  -- overwritten or revived. A violation aborts the whole profile/quota RPC.
  INSERT INTO public.enrollments (user_id, course_id, status, progress, time_spent)
  VALUES (NEW.user_id, v_course_id, 'active', 0, 0)
  ON CONFLICT (user_id, course_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_profile_group_course_enrollment_trigger ON public.profiles;
CREATE TRIGGER sync_profile_group_course_enrollment_trigger
AFTER INSERT OR UPDATE OF student_group_id, organization_id, user_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_group_course_enrollment();

CREATE OR REPLACE FUNCTION public.sync_group_course_enrollments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_course_org_id uuid;
BEGIN
  IF NEW.course_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT c.organization_id INTO v_course_org_id
  FROM public.courses c WHERE c.id = NEW.course_id FOR SHARE;
  IF NOT FOUND OR v_course_org_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'group_course_organization_mismatch' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.student_group_id = NEW.id
      AND p.organization_id IS DISTINCT FROM NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'student_group_organization_mismatch' USING ERRCODE = '23503';
  END IF;

  -- Group settings saves include course_id even for rename/price/date edits.
  -- Tenant validation still runs, but an unchanged association must not enroll.
  IF TG_OP = 'UPDATE'
     AND NEW.course_id IS NOT DISTINCT FROM OLD.course_id
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.enrollments (user_id, course_id, status, progress, time_spent)
  SELECT p.user_id, NEW.course_id, 'active', 0, 0
  FROM public.profiles p
  WHERE p.student_group_id = NEW.id AND p.organization_id = NEW.organization_id
  ON CONFLICT (user_id, course_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_group_course_enrollments_trigger ON public.student_groups;
CREATE TRIGGER sync_group_course_enrollments_trigger
AFTER INSERT OR UPDATE OF course_id, organization_id ON public.student_groups
FOR EACH ROW EXECUTE FUNCTION public.sync_group_course_enrollments();

-- Trigger entrypoints are not application RPCs. Triggers do not need caller
-- EXECUTE privileges; no table grants, RLS or trusted provisioning bypass change.
REVOKE ALL ON FUNCTION public.sync_profile_group_course_enrollment()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_group_course_enrollments()
  FROM PUBLIC, anon, authenticated, service_role;
