-- ============================================================
-- A. RPC: единый снапшот для дашборда ученика
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_student_dashboard_snapshot(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_profile record;
  v_org record;
  v_labor record;
  v_effective_org_id uuid;
  v_enrollments jsonb;
  v_documents jsonb;
  v_video_identified boolean;
  v_onboarding_completed boolean;
BEGIN
  -- Доступ: сам пользователь, глобальный админ или org-staff с правом students.view
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_caller <> p_user_id
     AND NOT public.has_role('admin'::app_role, v_caller) THEN
    -- проверим, что caller — staff/org того же ученика
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = p_user_id
        AND p.organization_id IS NOT NULL
        AND public.has_org_staff_permission(v_caller, p.organization_id, 'students.view')
    ) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  -- Профиль (без PII)
  SELECT user_id, full_name, organization_id, onboarding_completed
    INTO v_profile
  FROM public.profiles
  WHERE user_id = p_user_id
  LIMIT 1;

  v_onboarding_completed := COALESCE(v_profile.onboarding_completed, false);
  v_effective_org_id := v_profile.organization_id;

  -- Labor safety profile (может переопределить organization_id)
  SELECT organization_id, full_name
    INTO v_labor
  FROM public.labor_safety_profiles
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_labor.organization_id IS NOT NULL THEN
    v_effective_org_id := v_labor.organization_id;
  END IF;

  -- Организация (одним SELECT)
  IF v_effective_org_id IS NOT NULL THEN
    SELECT id, name, description, branding,
           student_dashboard_settings, subscription_plan,
           menu_settings
      INTO v_org
    FROM public.organizations
    WHERE id = v_effective_org_id
    LIMIT 1;
  END IF;

  -- Enrollments + агрегаты по урокам одним запросом
  SELECT COALESCE(jsonb_agg(row_to_json(e)::jsonb), '[]'::jsonb)
    INTO v_enrollments
  FROM (
    SELECT
      en.id,
      en.course_id,
      en.progress,
      en.status,
      en.time_spent,
      en.expires_at,
      c.title,
      c.description,
      c.duration,
      c.skip_video_identification,
      (SELECT COUNT(*) FROM public.lessons l WHERE l.course_id = en.course_id) AS total_lessons,
      (SELECT COUNT(*) FROM public.lesson_progress lp
        JOIN public.lessons l2 ON l2.id = lp.lesson_id
        WHERE lp.user_id = p_user_id AND lp.completed = true AND l2.course_id = en.course_id
      ) AS completed_lessons
    FROM public.enrollments en
    JOIN public.courses c ON c.id = en.course_id
    WHERE en.user_id = p_user_id
  ) e;

  -- Документы и видео-идентификация (только если есть org)
  IF v_effective_org_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'has_passport', bool_or(type IN ('passport','birth_certificate')),
      'has_snils', bool_or(type = 'snils'),
      'has_education', bool_or(type IN ('education_document','diploma','attestat'))
    )
      INTO v_documents
    FROM public.student_identity_documents
    WHERE user_id = p_user_id AND organization_id = v_effective_org_id;

    SELECT EXISTS (
      SELECT 1 FROM public.video_identifications
      WHERE user_id = p_user_id
        AND organization_id = v_effective_org_id
        AND status IN ('approved','verified')
    ) INTO v_video_identified;
  END IF;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'user_id', p_user_id,
      'full_name', COALESCE(v_labor.full_name, v_profile.full_name),
      'organization_id', v_effective_org_id,
      'onboarding_completed', v_onboarding_completed
    ),
    'org', CASE WHEN v_org.id IS NOT NULL THEN jsonb_build_object(
      'id', v_org.id,
      'name', v_org.name,
      'description', v_org.description,
      'branding', v_org.branding,
      'student_dashboard_settings', v_org.student_dashboard_settings,
      'subscription_plan', v_org.subscription_plan
    ) ELSE NULL END,
    'enrollments', COALESCE(v_enrollments, '[]'::jsonb),
    'documents', COALESCE(v_documents, jsonb_build_object('has_passport', false, 'has_snils', false, 'has_education', false)),
    'video_identified', COALESCE(v_video_identified, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_dashboard_snapshot(uuid) TO authenticated;

-- ============================================================
-- B. RPC: ядро организации одним запросом
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_organization_core(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_org record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Доступ: глобальный админ, владелец/staff организации, либо ученик/сотрудник той же организации
  IF NOT (
    public.has_role('admin'::app_role, v_caller)
    OR public.has_org_staff_permission(v_caller, p_org_id, 'settings.view')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = v_caller AND p.organization_id = p_org_id)
    OR EXISTS (SELECT 1 FROM public.org_staff os WHERE os.user_id = v_caller AND os.organization_id = p_org_id)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT id, name, description, branding, menu_settings,
         student_dashboard_settings, subscription_plan,
         custom_enabled_categories, frdo_enabled
    INTO v_org
  FROM public.organizations
  WHERE id = p_org_id
  LIMIT 1;

  IF v_org.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_org.id,
    'name', v_org.name,
    'description', v_org.description,
    'branding', v_org.branding,
    'menu_settings', v_org.menu_settings,
    'student_dashboard_settings', v_org.student_dashboard_settings,
    'subscription_plan', v_org.subscription_plan,
    'custom_enabled_categories', v_org.custom_enabled_categories,
    'frdo_enabled', v_org.frdo_enabled
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_core(uuid) TO authenticated;