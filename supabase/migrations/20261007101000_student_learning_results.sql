-- One learner's complete course summary, without fetching every other learner.
CREATE OR REPLACE FUNCTION public.get_student_learning_results(p_organization_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE((
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_org_owner(auth.uid(), p_organization_id)
    OR (EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id = auth.uid()
      AND s.organization_id = p_organization_id AND (s.expires_at IS NULL OR s.expires_at > now()))
      AND public.has_org_staff_permission(auth.uid(), p_organization_id, 'students.read'))
  ), false) THEN RAISE EXCEPTION 'student_results_forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_user_id
    AND p.organization_id = p_organization_id AND public.is_student_profile(p.user_id, p_organization_id)) THEN
    RAISE EXCEPTION 'student_not_in_organization' USING ERRCODE = '42501';
  END IF;
  WITH course_results AS (
    SELECT e.id AS enrollment_id, e.course_id, c.title AS course_title,
      COALESCE(e.progress, 0) AS progress, e.status, e.started_at, e.completed_at,
      COALESCE(e.time_spent, 0) AS time_spent, mc.credited_at AS manual_credited_at,
      COALESCE(t.tests, '[]'::jsonb) AS tests
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id AND c.organization_id = p_organization_id
    LEFT JOIN public.course_manual_credits mc ON mc.enrollment_id = e.id AND mc.revoked_at IS NULL
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'lesson_id', l.id, 'lesson_title', l.title,
        'score', a.score, 'max_score', a.max_score,
        'percent', CASE WHEN a.max_score > 0 THEN round(a.score::numeric * 100 / a.max_score)::integer ELSE NULL END,
        'passing_score', COALESCE(a.passing_score, l.test_passing_score, 70),
        'passed', CASE WHEN mc.credited_at IS NOT NULL THEN true
          WHEN a.id IS NULL THEN NULL ELSE COALESCE(a.passed,
            CASE WHEN a.max_score > 0 THEN round(a.score::numeric * 100 / a.max_score) >= COALESCE(a.passing_score, l.test_passing_score, 70) ELSE false END) END,
        'attempts_used', (SELECT count(*) FROM public.test_attempts ta WHERE ta.user_id = p_user_id AND ta.lesson_id = l.id),
        'completed_at', a.completed_at,
        'manual_credited_at', mc.credited_at
      ) ORDER BY l.order_index NULLS LAST, l.id) AS tests
      FROM public.lessons l
      LEFT JOIN LATERAL (SELECT ta.id, ta.score, ta.max_score, ta.passed, ta.passing_score, ta.completed_at
        FROM public.test_attempts ta WHERE ta.user_id = p_user_id AND ta.lesson_id = l.id
        ORDER BY ta.completed_at DESC NULLS LAST, ta.id DESC LIMIT 1) a ON true
      WHERE l.course_id = e.course_id AND l.type = 'test'
    ) t ON true
    WHERE e.user_id = p_user_id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.course_title, r.course_id), '[]'::jsonb)
    INTO v_result FROM course_results r;
  RETURN jsonb_build_object('organization_id', p_organization_id, 'user_id', p_user_id, 'courses', v_result);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_student_learning_results(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_student_learning_results(uuid,uuid) TO authenticated;
