-- Course import must not trust a browser-provided organization id and must
-- not create a course after a stale tariff-limit check. Authorization and the
-- effective limit are therefore rechecked atomically on the server.
CREATE OR REPLACE FUNCTION public.create_imported_course(
  p_organization_id uuid,
  p_title text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_course_id uuid;
  v_plan text;
  v_custom_max integer;
  v_max_courses integer;
  v_current_courses integer;
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

  -- Serialise imports for one organization. The count and INSERT below are
  -- then evaluated as one limit decision for every call to this RPC.
  SELECT COALESCE(subscription_plan, 'free'), custom_max_courses
    INTO v_plan, v_custom_max
  FROM public.organizations
  WHERE id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;

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
    -- KNOWN PRODUCT RISK: the seeded welcome course is an ordinary row in
    -- public.courses and useSubscriptionLimits currently counts every row for
    -- the organization. Keep parity here. Whether that seed should consume a
    -- paid limit remains an unresolved product decision; do not exempt it by
    -- its mutable title without a durable server-side marker and agreed rule.
    SELECT count(*)::integer
      INTO v_current_courses
    FROM public.courses
    WHERE organization_id = p_organization_id;

    IF v_current_courses >= GREATEST(v_max_courses, 0) THEN
      RAISE EXCEPTION 'maximum course limit reached'
        USING ERRCODE = 'P0001';
    END IF;
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
