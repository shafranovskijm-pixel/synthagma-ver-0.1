-- Give platform-owned courses an immutable identity that does not depend on a
-- user-editable title. System courses remain visible and usable, but do not
-- consume the organization's paid course quota.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS system_key text;

-- There should normally be one exact-title seeded course per organization.
-- If historic retries produced duplicates, mark only the oldest deterministic
-- candidate. The remaining rows stay ordinary user courses rather than making
-- this migration fail or silently deleting data.
WITH welcome_candidates AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id
      ORDER BY created_at ASC, id ASC
    ) AS candidate_rank
  FROM public.courses
  WHERE system_key IS NULL
    AND title = 'Добро пожаловать в СИНТАГМА'
)
UPDATE public.courses AS course
SET system_key = 'welcome'
FROM welcome_candidates AS candidate
WHERE candidate.id = course.id
  AND candidate.candidate_rank = 1;

ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_system_key_check;
ALTER TABLE public.courses
  ADD CONSTRAINT courses_system_key_check
  CHECK (system_key IS NULL OR system_key = 'welcome');

CREATE UNIQUE INDEX IF NOT EXISTS courses_organization_system_key_unique
  ON public.courses (organization_id, system_key)
  WHERE system_key IS NOT NULL;

COMMENT ON COLUMN public.courses.system_key IS
  'Stable platform-owned course identity. NULL for user courses; welcome for the seeded help course.';

-- RLS permissions to edit courses must not imply permission to mint a system
-- course and bypass quota. Only trusted platform/database actors may set,
-- remove or move the marker.
CREATE OR REPLACE FUNCTION public.guard_course_system_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Ordinary course transfers remain available. A marked system course may
    -- not be moved to another tenant by a regular course editor.
    IF NEW.system_key IS NULL
       AND OLD.system_key IS NULL
    THEN
      RETURN NEW;
    END IF;

    IF NEW.system_key IS NOT DISTINCT FROM OLD.system_key
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.system_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role'
     OR public.has_role('admin'::public.app_role, auth.uid())
     OR session_user IN ('postgres', 'supabase_admin')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only trusted platform processes may change a course system key'
    USING ERRCODE = '42501';
END
$function$;

REVOKE ALL ON FUNCTION public.guard_course_system_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_course_system_key() FROM anon;

DROP TRIGGER IF EXISTS guard_course_system_key ON public.courses;
CREATE TRIGGER guard_course_system_key
BEFORE INSERT OR UPDATE OF system_key, organization_id ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.guard_course_system_key();

-- Supersede the unified quota function from 20260822162000. Normal courses
-- keep the exact same locking and tariff behavior. System rows are excluded
-- both from admission checks and from the current-course count.
CREATE OR REPLACE FUNCTION public.enforce_course_insert_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_plan text;
  v_custom_max integer;
  v_max_courses integer;
  v_current_courses integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
       AND NEW.system_key IS NOT DISTINCT FROM OLD.system_key
    THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required for course creation'
      USING ERRCODE = '23502';
  END IF;

  -- A trusted system insert is not part of the commercial quota. The separate
  -- guard_course_system_key trigger rejects this marker for ordinary callers.
  IF NEW.system_key IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(subscription_plan, 'free'), custom_max_courses
    INTO v_plan, v_custom_max
  FROM public.organizations
  WHERE id = NEW.organization_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('course-limit:' || NEW.organization_id::text, 0)
  );

  v_max_courses := COALESCE(
    v_custom_max,
    CASE v_plan
      WHEN 'free' THEN 3
      WHEN 'start' THEN 15
      WHEN 'standard' THEN 30
      WHEN 'professional' THEN -1
      WHEN 'maximum' THEN -1
      ELSE 3
    END
  );

  IF v_max_courses <> -1 THEN
    SELECT count(*)::integer
      INTO v_current_courses
    FROM public.courses
    WHERE organization_id = NEW.organization_id
      AND system_key IS NULL;

    IF v_current_courses >= GREATEST(v_max_courses, 0) THEN
      RAISE EXCEPTION 'maximum course limit reached'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_course_insert_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_course_insert_limit() FROM anon;

DROP TRIGGER IF EXISTS enforce_course_insert_limit ON public.courses;
CREATE TRIGGER enforce_course_insert_limit
BEFORE INSERT OR UPDATE OF organization_id, system_key ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.enforce_course_insert_limit();
