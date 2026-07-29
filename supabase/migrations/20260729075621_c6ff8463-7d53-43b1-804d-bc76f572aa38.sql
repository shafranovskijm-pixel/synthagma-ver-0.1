-- ─────────────────────────────────────────────────────────────
-- Phase 5A.2 — canonical student capacity: atomic claim + accurate count
-- ─────────────────────────────────────────────────────────────

-- 1) Tighten count_org_students to canonical semantics
--    (active real students only). Keep signature stable for legacy callers.
DROP FUNCTION IF EXISTS public.count_org_students(uuid);
CREATE FUNCTION public.count_org_students(org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT count(DISTINCT p.user_id)::int
  FROM public.profiles p
  WHERE p.organization_id = org_id
    AND p.archived_at IS NULL
    AND public.is_student_profile(p.user_id, org_id);
$function$;

-- Revoke from anonymous; the only remaining anonymous consumer
-- (landing-self-enroll edge) already runs under service_role.
REVOKE ALL ON FUNCTION public.count_org_students(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_org_students(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.count_org_students(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_org_students(uuid) TO service_role;

COMMENT ON FUNCTION public.count_org_students(uuid) IS
'Legacy shim — active real students in an organization (archived_at IS NULL AND is_student_profile). Canonical source is get_organization_student_capacity.';

-- 2) Atomic "claim a student slot" RPC.
--    Called by edge functions after auth.users has been provisioned.
--    Serializes concurrent registrations per organization via advisory
--    xact lock and re-computes the canonical capacity in the same
--    transaction that inserts the profile row and the student role.
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
  v_current int;
  v_existing_org uuid;
  v_existing_archived timestamptz;
BEGIN
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

  -- Existing profile in the same organization → idempotent, does NOT
  -- consume a new slot. Existing archived profile in this org must be
  -- restored explicitly by staff, so we refuse rather than silently
  -- un-archive.
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
        'current_students', (
          SELECT count(DISTINCT p2.user_id)::int
          FROM public.profiles p2
          WHERE p2.organization_id = p_organization_id
            AND p2.archived_at IS NULL
            AND public.is_student_profile(p2.user_id, p_organization_id)
        ),
        'max_students', v_max,
        'is_unlimited', v_max = -1,
        'limit_source', v_source
      );
    END IF;

    -- Existing active profile in this org — refresh non-destructive fields.
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
      'current_students', (
        SELECT count(DISTINCT p2.user_id)::int
        FROM public.profiles p2
        WHERE p2.organization_id = p_organization_id
          AND p2.archived_at IS NULL
          AND public.is_student_profile(p2.user_id, p_organization_id)
      ),
      'max_students', v_max,
      'is_unlimited', v_max = -1,
      'limit_source', v_source
    );
  END IF;

  IF v_existing_org IS NOT NULL AND v_existing_org <> p_organization_id THEN
    -- Profile exists in a different org — safe conflict, no PII leak.
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PROFILE_IN_OTHER_ORG',
      'message', 'Профиль пользователя уже привязан к другой организации.',
      'max_students', v_max,
      'is_unlimited', v_max = -1,
      'limit_source', v_source
    );
  END IF;

  -- Canonical capacity check under the advisory lock.
  SELECT count(DISTINCT p.user_id)::int
    INTO v_current
  FROM public.profiles p
  WHERE p.organization_id = p_organization_id
    AND p.archived_at IS NULL
    AND public.is_student_profile(p.user_id, p_organization_id);

  IF v_max <> -1 AND v_current >= v_max THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'STUDENT_LIMIT_EXCEEDED',
      'message', format('Достигнут лимит учеников: %s из %s', v_current, v_max),
      'current_students', v_current,
      'max_students', v_max,
      'is_unlimited', false,
      'limit_source', v_source,
      'subscription_plan', v_plan
    );
  END IF;

  -- Claim the slot: create the profile and assign the student role
  -- inside the same transaction that holds the advisory lock.
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

  RETURN jsonb_build_object(
    'success', true,
    'is_existing', false,
    'current_students', v_current + 1,
    'max_students', v_max,
    'is_unlimited', v_max = -1,
    'limit_source', v_source,
    'subscription_plan', v_plan
  );
END;
$function$;

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
'Atomic slot claim for new students: advisory-xact-lock per organization, re-computes canonical capacity, upserts profile and student role in the same transaction. Idempotent for existing active profile in same org. Refuses archived profiles and cross-org conflicts. Service role only.';