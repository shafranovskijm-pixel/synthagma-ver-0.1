CREATE OR REPLACE FUNCTION public.get_organization_student_capacity(p_organization_id uuid, p_requested_count integer DEFAULT 1)
 RETURNS TABLE(current_students integer, max_students integer, is_unlimited boolean, can_add boolean, remaining_students integer, subscription_plan text, limit_source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan text;
  v_custom integer;
  v_plan_limit integer;
  v_max integer;
  v_source text;
  v_current integer := 0;
  v_requested integer := GREATEST(COALESCE(p_requested_count, 1), 0);
  v_uid uuid := auth.uid();
  v_jwt_role text := COALESCE(
    current_setting('request.jwt.claim.role', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
  );
  v_is_service boolean := (v_jwt_role = 'service_role');
  v_allowed boolean := false;
  v_month date := (date_trunc('month', timezone('Europe/Moscow', now())))::date;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

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

  SELECT COALESCE(u.students_added_count, 0)
    INTO v_current
  FROM public.organization_usage u
  WHERE u.organization_id = p_organization_id
    AND u.month_start = v_month;

  v_current := COALESCE(v_current, 0);

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

-- Patch service_role detection in create_student_profile_with_capacity
CREATE OR REPLACE FUNCTION public.create_student_profile_with_capacity(p_organization_id uuid, p_user_id uuid, p_full_name text, p_email text, p_login text, p_generated_password text, p_company_id uuid, p_student_group_id uuid, p_region text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan text;
  v_custom int;
  v_plan_limit int;
  v_max int;
  v_source text;
  v_current int := 0;
  v_existing_org uuid;
  v_existing_archived timestamptz;
  v_month date := (date_trunc('month', timezone('Europe/Moscow', now())))::date;
  v_jwt_role text := COALESCE(
    current_setting('request.jwt.claim.role', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
  );
BEGIN
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'organization_id and user_id are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 42));

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

  INSERT INTO public.organization_usage (organization_id, month_start, students_added_count)
  VALUES (p_organization_id, v_month, 0)
  ON CONFLICT (organization_id, month_start) DO NOTHING;

  SELECT students_added_count
    INTO v_current
  FROM public.organization_usage
  WHERE organization_id = p_organization_id
    AND month_start = v_month
  FOR UPDATE;

  v_current := COALESCE(v_current, 0);

  SELECT p.organization_id, p.archived_at
    INTO v_existing_org, v_existing_archived
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  IF v_existing_org IS NOT NULL AND v_existing_org = p_organization_id THEN
    IF v_existing_archived IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'STUDENT_ARCHIVED', 'message', 'Ученик находится в архиве. Восстановите его из архива вручную.', 'current_students', v_current, 'max_students', v_max, 'is_unlimited', v_max = -1, 'limit_source', v_source);
    END IF;
    UPDATE public.profiles
       SET full_name = COALESCE(NULLIF(p_full_name, ''), full_name),
           email = COALESCE(NULLIF(p_email, ''), email),
           company_id = COALESCE(p_company_id, company_id),
           student_group_id = COALESCE(p_student_group_id, student_group_id),
           region = COALESCE(NULLIF(p_region, ''), region)
     WHERE user_id = p_user_id;
    INSERT INTO public.user_roles(user_id, role) VALUES (p_user_id, 'student'::public.app_role) ON CONFLICT (user_id, role) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'is_existing', true, 'current_students', v_current, 'max_students', v_max, 'is_unlimited', v_max = -1, 'limit_source', v_source);
  END IF;

  IF v_existing_org IS NOT NULL AND v_existing_org <> p_organization_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'PROFILE_IN_OTHER_ORG', 'message', 'Профиль пользователя уже привязан к другой организации.', 'max_students', v_max, 'is_unlimited', v_max = -1, 'limit_source', v_source);
  END IF;

  IF v_max <> -1 AND v_current >= v_max THEN
    RETURN jsonb_build_object('success', false, 'code', 'STUDENT_LIMIT_EXCEEDED', 'message', format('Достигнут месячный лимит новых учеников: %s из %s', v_current, v_max), 'current_students', v_current, 'max_students', v_max, 'is_unlimited', false, 'limit_source', v_source);
  END IF;

  INSERT INTO public.profiles (user_id, full_name, email, login, generated_password, organization_id, company_id, student_group_id, region)
  VALUES (p_user_id, p_full_name, NULLIF(p_email, ''), NULLIF(p_login, ''), NULLIF(p_generated_password, ''), p_organization_id, p_company_id, p_student_group_id, NULLIF(p_region, ''))
  ON CONFLICT (user_id) DO UPDATE
     SET full_name = EXCLUDED.full_name,
         email = COALESCE(EXCLUDED.email, public.profiles.email),
         login = COALESCE(EXCLUDED.login, public.profiles.login),
         generated_password = COALESCE(EXCLUDED.generated_password, public.profiles.generated_password),
         organization_id = EXCLUDED.organization_id,
         company_id = COALESCE(EXCLUDED.company_id, public.profiles.company_id),
         student_group_id = COALESCE(EXCLUDED.student_group_id, public.profiles.student_group_id),
         region = COALESCE(EXCLUDED.region, public.profiles.region);

  INSERT INTO public.user_roles(user_id, role) VALUES (p_user_id, 'student'::public.app_role) ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.organization_usage
     SET students_added_count = students_added_count + 1
   WHERE organization_id = p_organization_id
     AND month_start = v_month;

  RETURN jsonb_build_object('success', true, 'is_existing', false, 'current_students', v_current + 1, 'max_students', v_max, 'is_unlimited', v_max = -1, 'limit_source', v_source);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_student_profile_with_capacity(uuid, uuid, text, text, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_student_profile_with_capacity(uuid, uuid, text, text, text, text, uuid, uuid, text) TO service_role;