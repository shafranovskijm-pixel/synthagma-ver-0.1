-- =========================================================================
-- Phase 5A.4 — lock down create_student_profile_with_capacity + fix backfill
-- =========================================================================

-- 1) Defense-in-depth: rewrite the function to require service_role at runtime.
--    Preserves SECURITY DEFINER, search_path, advisory lock, monthly limit,
--    atomic increment and existing signature.
CREATE OR REPLACE FUNCTION public.create_student_profile_with_capacity(
  p_organization_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_login text,
  p_generated_password text,
  p_company_id uuid,
  p_student_group_id uuid,
  p_region text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  -- Defense-in-depth: only trusted service_role callers (edge functions).
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'organization_id and user_id are required';
  END IF;

  -- Serialize concurrent registrations for this organization.
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
      RETURN jsonb_build_object(
        'success', false,
        'code', 'STUDENT_ARCHIVED',
        'message', 'Ученик находится в архиве. Восстановите его из архива вручную.',
        'current_students', v_current,
        'max_students', v_max,
        'is_unlimited', v_max = -1,
        'limit_source', v_source
      );
    END IF;

    UPDATE public.profiles
       SET full_name          = COALESCE(NULLIF(p_full_name, ''), full_name),
           email              = COALESCE(NULLIF(p_email, ''), email),
           company_id         = COALESCE(p_company_id, company_id),
           student_group_id   = COALESCE(p_student_group_id, student_group_id),
           region             = COALESCE(NULLIF(p_region, ''), region)
     WHERE user_id = p_user_id;

    INSERT INTO public.user_roles(user_id, role)
    VALUES (p_user_id, 'student'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'is_existing', true,
      'current_students', v_current,
      'max_students', v_max,
      'is_unlimited', v_max = -1,
      'limit_source', v_source
    );
  END IF;

  IF v_existing_org IS NOT NULL AND v_existing_org <> p_organization_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PROFILE_IN_OTHER_ORG',
      'message', 'Профиль пользователя уже привязан к другой организации.',
      'max_students', v_max,
      'is_unlimited', v_max = -1,
      'limit_source', v_source
    );
  END IF;

  IF v_max <> -1 AND v_current >= v_max THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'STUDENT_LIMIT_EXCEEDED',
      'message', format('Достигнут месячный лимит новых учеников: %s из %s', v_current, v_max),
      'current_students', v_current,
      'max_students', v_max,
      'is_unlimited', false,
      'limit_source', v_source,
      'subscription_plan', v_plan
    );
  END IF;

  INSERT INTO public.profiles(
    user_id, full_name, email, login, generated_password,
    organization_id, company_id, student_group_id, region
  ) VALUES (
    p_user_id,
    p_full_name,
    NULLIF(p_email, ''),
    NULLIF(p_login, ''),
    NULLIF(p_generated_password, ''),
    p_organization_id,
    p_company_id,
    p_student_group_id,
    NULLIF(p_region, '')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name          = EXCLUDED.full_name,
    email              = COALESCE(EXCLUDED.email, public.profiles.email),
    login              = COALESCE(EXCLUDED.login, public.profiles.login),
    generated_password = COALESCE(EXCLUDED.generated_password, public.profiles.generated_password),
    organization_id    = EXCLUDED.organization_id,
    company_id         = EXCLUDED.company_id,
    student_group_id   = EXCLUDED.student_group_id,
    region             = COALESCE(EXCLUDED.region, public.profiles.region);

  INSERT INTO public.user_roles(user_id, role)
  VALUES (p_user_id, 'student'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.organization_usage
     SET students_added_count = students_added_count + 1,
         updated_at = now()
   WHERE organization_id = p_organization_id
     AND month_start = v_month;

  v_current := v_current + 1;

  RETURN jsonb_build_object(
    'success', true,
    'is_existing', false,
    'current_students', v_current,
    'max_students', v_max,
    'is_unlimited', v_max = -1,
    'limit_source', v_source,
    'subscription_plan', v_plan
  );
END;
$function$;

-- Lock down grants: only service_role may execute.
REVOKE ALL ON FUNCTION public.create_student_profile_with_capacity(
  uuid, uuid, text, text, text, text, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_student_profile_with_capacity(
  uuid, uuid, text, text, text, text, uuid, uuid, text
) FROM anon;
REVOKE ALL ON FUNCTION public.create_student_profile_with_capacity(
  uuid, uuid, text, text, text, text, uuid, uuid, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_student_profile_with_capacity(
  uuid, uuid, text, text, text, text, uuid, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.create_student_profile_with_capacity(
  uuid, uuid, text, text, text, text, uuid, uuid, text
) IS
'Monthly-quota-aware student creation. service_role only (edge functions). Advisory lock per org. Increments organization_usage.students_added_count only on real new profile creation. Existing/archived/cross-org paths do NOT consume the monthly slot. Archiving does NOT return the slot.';

-- 2) Corrective backfill for the current month.
--    Rule: archived students still count against the month they were added in.
--    Do NOT filter archived_at. GREATEST() protects atomic increments that
--    happened after the previous (broken) backfill.
DO $$
DECLARE
  v_month date := (date_trunc('month', timezone('Europe/Moscow', now())))::date;
  v_month_start_utc timestamptz := timezone('Europe/Moscow', v_month::timestamp);
  v_next_month_start_utc timestamptz := timezone('Europe/Moscow', (v_month + interval '1 month')::timestamp);
  r record;
BEGIN
  CREATE TEMP TABLE _sa4_backfill(
    organization_id uuid PRIMARY KEY,
    new_count int NOT NULL,
    old_count int NOT NULL,
    final_count int NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _sa4_backfill(organization_id, new_count, old_count, final_count)
  SELECT
    p.organization_id,
    count(DISTINCT p.user_id)::int AS new_count,
    COALESCE(u.students_added_count, 0) AS old_count,
    GREATEST(
      COALESCE(u.students_added_count, 0),
      count(DISTINCT p.user_id)::int
    ) AS final_count
  FROM public.profiles p
  LEFT JOIN public.organization_usage u
    ON u.organization_id = p.organization_id
   AND u.month_start = v_month
  WHERE p.organization_id IS NOT NULL
    AND p.created_at >= v_month_start_utc
    AND p.created_at <  v_next_month_start_utc
    AND public.is_student_profile(p.user_id, p.organization_id)
  GROUP BY p.organization_id, u.students_added_count;

  INSERT INTO public.organization_usage (organization_id, month_start, students_added_count)
  SELECT organization_id, v_month, final_count FROM _sa4_backfill
  ON CONFLICT (organization_id, month_start)
  DO UPDATE SET
    students_added_count = EXCLUDED.students_added_count,
    updated_at = now();

  -- Report orgs where the corrected value changed (no PII).
  FOR r IN
    SELECT organization_id, old_count, new_count, final_count
    FROM _sa4_backfill
    WHERE final_count <> old_count
    ORDER BY final_count DESC
  LOOP
    RAISE NOTICE 'phase 5A.4 backfill: org=% old=% new=% final=%',
      r.organization_id, r.old_count, r.new_count, r.final_count;
  END LOOP;
END $$;