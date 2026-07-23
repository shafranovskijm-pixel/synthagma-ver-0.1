CREATE OR REPLACE FUNCTION public.get_student_dashboard_snapshot(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_profile record;
  v_org record;
  v_labor record;
  v_effective_org_id uuid;
  v_enrollments jsonb;
  v_documents jsonb;
  v_video_identified boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_caller <> p_user_id
     AND NOT public.has_role('admin'::app_role, v_caller) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = p_user_id
        AND p.organization_id IS NOT NULL
        AND public.has_org_staff_permission(v_caller, p.organization_id, 'students.view')
    ) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  SELECT p.user_id, p.full_name, p.organization_id, COALESCE(p.onboarding_completed, false) AS onboarding_completed
    INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  v_effective_org_id := v_profile.organization_id;

  SELECT ls.organization_id
    INTO v_labor
  FROM public.labor_safety_profiles ls
  WHERE ls.user_id = p_user_id
  ORDER BY ls.created_at DESC
  LIMIT 1;

  IF v_labor.organization_id IS NOT NULL THEN
    v_effective_org_id := v_labor.organization_id;
  END IF;

  IF v_effective_org_id IS NOT NULL THEN
    SELECT o.id, o.name, o.description, o.branding, o.student_dashboard_settings, o.subscription_plan
      INTO v_org
    FROM public.organizations o
    WHERE o.id = v_effective_org_id;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(e.*)), '[]'::jsonb)
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
      c.cover_image_url,
      (SELECT COUNT(*) FROM public.lessons l WHERE l.course_id = en.course_id) AS total_lessons,
      (SELECT COUNT(*) FROM public.lesson_progress lp
        JOIN public.lessons l2 ON l2.id = lp.lesson_id
        WHERE lp.user_id = p_user_id AND lp.completed = true AND l2.course_id = en.course_id
      ) AS completed_lessons
    FROM public.enrollments en
    JOIN public.courses c ON c.id = en.course_id
    WHERE en.user_id = p_user_id
  ) e;

  IF v_effective_org_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'has_passport', bool_or(sid.type = 'passport'),
      'has_snils', bool_or(sid.type = 'snils'),
      'has_education', bool_or(sid.type = 'education')
    )
      INTO v_documents
    FROM public.student_identity_documents sid
    WHERE sid.user_id = p_user_id;

    SELECT EXISTS(
      SELECT 1 FROM public.video_identifications vi
      WHERE vi.user_id = p_user_id AND vi.status = 'approved'
    ) INTO v_video_identified;
  END IF;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'user_id', v_profile.user_id,
      'full_name', v_profile.full_name,
      'organization_id', v_profile.organization_id,
      'onboarding_completed', COALESCE(v_profile.onboarding_completed, false)
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
$function$;