CREATE OR REPLACE FUNCTION public.enforce_course_insert_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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

  IF EXISTS (
    SELECT 1 FROM public.organization_billing_agreements agreement
    WHERE agreement.organization_id = NEW.organization_id
      AND agreement.effective_from <= (now() AT TIME ZONE 'Europe/Moscow')::date
      AND (agreement.effective_to IS NULL
        OR agreement.effective_to > (now() AT TIME ZONE 'Europe/Moscow')::date)
  ) THEN
    v_max_courses := -1;
  END IF;

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
$function$
