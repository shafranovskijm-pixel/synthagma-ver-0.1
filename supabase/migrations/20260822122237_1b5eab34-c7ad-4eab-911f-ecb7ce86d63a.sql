-- Enforce the effective course limit at the table boundary. Every insertion
-- path (PostgREST, manual creation, duplication, imports and server jobs)
-- reaches this trigger, so no caller can rely on a stale browser-side count.
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
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required for course creation'
      USING ERRCODE = '23502';
  END IF;

  -- Lock the organization row first so a transaction that updates the tariff
  -- and then inserts a course uses the same lock order as this trigger. This
  -- keeps the selected tariff stable without creating a row/advisory deadlock.
  SELECT COALESCE(subscription_plan, 'free'), custom_max_courses
    INTO v_plan, v_custom_max
  FROM public.organizations
  WHERE id = NEW.organization_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;

  -- One transaction at a time may decide the course limit for an
  -- organization. Every INSERT path reaches this lock before the count.
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
    -- KNOWN PRODUCT RISK: the seeded welcome course remains an ordinary row
    -- and therefore consumes the same limit as it does in the current UI.
    SELECT count(*)::integer
      INTO v_current_courses
    FROM public.courses
    WHERE organization_id = NEW.organization_id;

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
BEFORE INSERT ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.enforce_course_insert_limit();

-- Import still owns authentication, tenant authorization and input
-- validation. The INSERT itself deliberately delegates the limit decision to
-- the same table trigger as every other creation path.
CREATE OR REPLACE FUNCTION public.create_imported_course(
  p_organization_id uuid,
  p_title text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_course_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
     OR NOT public.can_access_organization(p_organization_id, 'courses.write')
  THEN
    RAISE EXCEPTION 'Insufficient permission to create course'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(COALESCE(p_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Course title is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.courses (
    organization_id,
    title,
    description,
    is_published
  )
  VALUES (
    p_organization_id,
    btrim(p_title),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    false
  )
  RETURNING id INTO v_course_id;

  RETURN v_course_id;
END
$function$;

REVOKE ALL ON FUNCTION public.create_imported_course(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_imported_course(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_imported_course(uuid, text, text) TO authenticated;