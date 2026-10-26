-- Programme quality: preserve historical test details and restore authorized owner preview.
DO $preconditions$ BEGIN
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>638 OR (SELECT max(version) FROM supabase_migrations.schema_migrations)<>'20261026160000' THEN RAISE EXCEPTION 'EXPECTED_LEDGER638'; END IF;
 IF to_regprocedure('public.get_teacher_test_attempt_history(uuid,uuid[])') IS NOT NULL THEN RAISE EXCEPTION 'HISTORY_RPC_ALREADY_EXISTS'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.get_student_dashboard_snapshot(uuid)'::regprocedure),'UTF8')),'hex')<>'dfcaca5604595f1510a051a7817a6422fc8039b7e725b8599eed164df94bbea4' THEN RAISE EXCEPTION 'DASHBOARD_PREIMAGE_CHANGED'; END IF;
END $preconditions$;
CREATE OR REPLACE FUNCTION public.get_teacher_test_attempt_history(
  p_course_id uuid, p_attempt_ids uuid[]
)
RETURNS TABLE(attempt_id uuid, history_status text, questions jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $history$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF actor IS NULL
     OR public.account_deletion_access_allowed() IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.user_id = actor AND p.blocked_at IS NULL
     )
     OR public.can_access_course(p_course_id, 'students.read') IS NOT TRUE
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF p_attempt_ids IS NULL
     OR cardinality(p_attempt_ids) < 1
     OR cardinality(p_attempt_ids) > 200
     OR EXISTS (SELECT 1 FROM unnest(p_attempt_ids) x(id) WHERE x.id IS NULL)
     OR (SELECT count(DISTINCT x.id) FROM unnest(p_attempt_ids) x(id)) <> cardinality(p_attempt_ids)
  THEN
    RAISE EXCEPTION 'invalid request' USING ERRCODE='22023';
  END IF;
  -- A requested ID never creates a new scope. Fail the entire request on a
  -- missing or foreign-course attempt; do not return partial cross-tenant data.
  IF EXISTS (
    SELECT 1 FROM unnest(p_attempt_ids) wanted(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.test_attempts a
      JOIN public.lessons l ON l.id=a.lesson_id
      WHERE a.id=wanted.id AND l.course_id=p_course_id
    )
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT a.id,
    CASE
      WHEN a.session_id IS NULL THEN 'legacy_unknown'::text
      WHEN s.id IS NULL OR s.user_id IS DISTINCT FROM a.user_id
        OR s.lesson_id IS DISTINCT FROM a.lesson_id
        OR s.status IS DISTINCT FROM 'completed'
        OR CASE WHEN jsonb_typeof(s.questions_snapshot)='array'
                THEN jsonb_array_length(s.questions_snapshot) ELSE 0 END=0
      THEN 'snapshot_unavailable'::text
      ELSE 'snapshot'::text
    END,
    CASE
      WHEN a.session_id IS NOT NULL AND s.id IS NOT NULL
        AND s.user_id=a.user_id AND s.lesson_id=a.lesson_id
        AND s.status='completed'
        AND CASE WHEN jsonb_typeof(s.questions_snapshot)='array'
                 THEN jsonb_array_length(s.questions_snapshot) ELSE 0 END>0
      THEN (
        SELECT jsonb_agg(jsonb_build_object(
          'id', q.item->'id',
          'question', q.item->'question',
          'options', q.item->'options',
          'correct_answer', q.item->'correct_answer'
        ) ORDER BY q.ordinality)
        FROM jsonb_array_elements(s.questions_snapshot) WITH ORDINALITY q(item, ordinality)
      )
      ELSE NULL::jsonb
    END
  FROM unnest(p_attempt_ids) WITH ORDINALITY wanted(id, ordinality)
  JOIN public.test_attempts a ON a.id=wanted.id
  JOIN public.lessons l ON l.id=a.lesson_id AND l.course_id=p_course_id
  LEFT JOIN public.test_attempt_sessions s ON s.id=a.session_id
  ORDER BY wanted.ordinality;
END;
$history$;
REVOKE ALL ON FUNCTION public.get_teacher_test_attempt_history(uuid,uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_teacher_test_attempt_history(uuid,uuid[]) TO authenticated;
-- No table/session policy, grant, old result, raw repair journal or grading
-- function is modified. Authorization matches the existing teacher results RPC.

CREATE OR REPLACE FUNCTION public.get_student_dashboard_snapshot(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
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
  v_is_preview boolean;
BEGIN
  IF v_caller IS NULL OR p_user_id IS NULL
     OR public.account_deletion_access_allowed() IS NOT TRUE
     OR NOT EXISTS (SELECT 1 FROM public.profiles actor_profile WHERE actor_profile.user_id=v_caller AND actor_profile.blocked_at IS NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  v_is_preview := v_caller <> p_user_id AND NOT COALESCE(public.has_role(v_caller,'admin'::public.app_role),false);
  IF v_is_preview AND NOT EXISTS (
    SELECT 1 FROM public.profiles target_profile
    WHERE target_profile.user_id=p_user_id
      AND target_profile.organization_id IS NOT NULL
      AND public.is_student_profile(p_user_id,target_profile.organization_id)
      AND public.can_access_organization(target_profile.organization_id,'students.read')
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT
    p.user_id,
    p.full_name,
    p.organization_id,
    COALESCE(p.onboarding_completed, false) AS onboarding_completed
  INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  v_effective_org_id := v_profile.organization_id;

  SELECT ls.organization_id
  INTO v_labor
  FROM public.labor_safety_profiles ls
  WHERE ls.user_id = p_user_id
    AND (NOT v_is_preview OR ls.organization_id=v_profile.organization_id)
  ORDER BY ls.created_at DESC
  LIMIT 1;

  IF v_labor.organization_id IS NOT NULL THEN
    v_effective_org_id := v_labor.organization_id;
  END IF;

  IF v_effective_org_id IS NOT NULL THEN
    SELECT
      o.id,
      o.name,
      o.description,
      o.branding,
      o.student_dashboard_settings,
      o.subscription_plan
    INTO v_org
    FROM public.organizations o
    WHERE o.id = v_effective_org_id;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(enrollment_row.*)), '[]'::jsonb)
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
      CASE WHEN course_flags.library_only THEN NULL ELSE c.description END
        AS description,
      CASE WHEN course_flags.library_only THEN NULL ELSE c.duration END
        AS duration,
      CASE
        WHEN course_flags.library_only THEN true
        ELSE c.skip_video_identification
      END AS skip_video_identification,
      CASE WHEN course_flags.library_only THEN NULL ELSE c.cover_image_url END
        AS cover_image_url,
      course_flags.library_only,
      CASE
        WHEN course_flags.library_only THEN 0
        ELSE (
          SELECT COUNT(*)
          FROM public.lessons lesson_count
          WHERE lesson_count.course_id = en.course_id
        )
      END AS total_lessons,
      CASE
        WHEN course_flags.library_only THEN 0
        ELSE (
          SELECT COUNT(*)
          FROM public.lesson_progress lp
          JOIN public.lessons completed_lesson
            ON completed_lesson.id = lp.lesson_id
          WHERE lp.user_id = p_user_id
            AND lp.completed = true
            AND completed_lesson.course_id = en.course_id
        )
      END AS completed_lessons
    FROM public.enrollments en
    JOIN public.courses c ON c.id = en.course_id
    CROSS JOIN LATERAL (
      SELECT (
        NOT c.is_published
        AND COALESCE(
          c.landing_content
            @> '{"electronic_library":{"enabled":true}}'::jsonb,
          false
        )
      ) AS library_only
    ) course_flags
    WHERE en.user_id = p_user_id
      AND (NOT v_is_preview OR c.organization_id=v_effective_org_id)
      AND (
        NOT course_flags.library_only
        OR public.can_access_course(c.id, 'courses.read')
        OR (
          en.status IN ('active', 'completed')
          AND (
            en.expires_at IS NULL
            OR en.expires_at > now()
            OR en.status = 'completed'
          )
          AND EXISTS (
            SELECT 1
            FROM public.profiles learner_profile
            WHERE learner_profile.user_id = p_user_id
              AND learner_profile.organization_id = c.organization_id
          )
        )
      )
  ) enrollment_row;

  IF v_effective_org_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'has_passport', bool_or(sid.type = 'passport'),
      'has_snils', bool_or(sid.type = 'snils'),
      'has_education', bool_or(sid.type = 'education')
    )
    INTO v_documents
    FROM public.student_identity_documents sid
    WHERE sid.user_id = p_user_id
      AND (NOT v_is_preview OR sid.organization_id=v_effective_org_id);

    SELECT EXISTS (
      SELECT 1
      FROM public.video_identifications vi
      WHERE vi.user_id = p_user_id
        AND (NOT v_is_preview OR vi.organization_id=v_effective_org_id)
        AND vi.status = 'approved'
    )
    INTO v_video_identified;
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
    'documents', COALESCE(
      v_documents,
      jsonb_build_object(
        'has_passport', false,
        'has_snils', false,
        'has_education', false
      )
    ),
    'video_identified', COALESCE(v_video_identified, false)
  );
END;
$function$
;
