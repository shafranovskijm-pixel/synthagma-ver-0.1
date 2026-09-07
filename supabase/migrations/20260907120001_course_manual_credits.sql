-- Explicit offline completion is an audited fact, separate from online test attempts.
CREATE TABLE public.course_manual_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  credited_by uuid NOT NULL,
  credited_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid,
  revoked_at timestamptz
);
CREATE UNIQUE INDEX course_manual_credits_one_active
  ON public.course_manual_credits (enrollment_id) WHERE revoked_at IS NULL;
ALTER TABLE public.course_manual_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_manual_credits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.course_manual_credits TO authenticated;
GRANT ALL ON public.course_manual_credits TO service_role;
CREATE POLICY course_manual_credits_read ON public.course_manual_credits
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.enrollments e
      WHERE e.id = enrollment_id
        AND (e.user_id = auth.uid() OR public.can_access_course(e.course_id, 'students.read')))
  );

-- A progress reset revokes the active credit, retaining its original actor/date.
CREATE OR REPLACE FUNCTION public.revoke_manual_credit_on_course_reset()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed')
    OR OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.course_id IS DISTINCT FROM NEW.course_id THEN
    UPDATE public.course_manual_credits
    SET revoked_at = now(), revoked_by = auth.uid()
    WHERE enrollment_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_manual_credit_on_course_reset() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER revoke_manual_credit_on_course_reset
  AFTER UPDATE OF status, user_id, course_id ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.revoke_manual_credit_on_course_reset();

CREATE OR REPLACE FUNCTION public.manual_complete_course(p_enrollment_id uuid, p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_enrollment public.enrollments%ROWTYPE;
  v_organization_id uuid;
  v_credit public.course_manual_credits%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  SELECT e.* INTO v_enrollment FROM public.enrollments e WHERE e.id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT c.organization_id INTO v_organization_id FROM public.courses c WHERE c.id = v_enrollment.course_id;
  IF p_organization_id IS NULL OR v_organization_id IS DISTINCT FROM p_organization_id
    OR NOT public.can_access_course(v_enrollment.course_id, 'students.write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT mc.* INTO v_credit FROM public.course_manual_credits mc
    WHERE mc.enrollment_id = p_enrollment_id AND mc.revoked_at IS NULL;
  IF NOT FOUND THEN
    INSERT INTO public.course_manual_credits(enrollment_id, credited_by)
      VALUES (p_enrollment_id, v_actor) RETURNING * INTO v_credit;
  END IF;
  -- Complete each lesson without manufacturing scores, answers or attempts.
  INSERT INTO public.lesson_progress(user_id, lesson_id, completed, completed_at)
    SELECT v_enrollment.user_id, l.id, true, v_credit.credited_at
    FROM public.lessons l WHERE l.course_id = v_enrollment.course_id
    ON CONFLICT (user_id, lesson_id) DO UPDATE
      SET completed = true,
          completed_at = COALESCE(public.lesson_progress.completed_at, EXCLUDED.completed_at);
  UPDATE public.enrollments SET status = 'completed', progress = 100,
    completed_at = COALESCE(completed_at, v_credit.credited_at)
    WHERE id = p_enrollment_id;
  RETURN jsonb_build_object('enrollmentId', p_enrollment_id, 'creditedAt', v_credit.credited_at, 'creditedBy', v_credit.credited_by);
END;
$$;
REVOKE ALL ON FUNCTION public.manual_complete_course(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_complete_course(uuid, uuid) TO authenticated;

-- Preserve the existing report RPC shape; explicit credit metadata belongs to
-- each test result, while online scores/counts continue to describe real attempts.

CREATE OR REPLACE FUNCTION public.get_course_student_test_results_page(
  p_course_id uuid,
  p_limit int DEFAULT 10,
  p_offset int DEFAULT 0,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_result_filter text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  full_name text,
  email text,
  login text,
  enrollment_id uuid,
  progress int,
  status text,
  started_at timestamptz,
  completed_at timestamptz,
  time_spent int,
  archived_at timestamptz,
  tests_total int,
  tests_attempted int,
  tests_passed int,
  average_percent int,
  latest_score int,
  latest_max_score int,
  latest_percent int,
  latest_passing_score int,
  attempts_used int,
  last_attempt_at timestamptz,
  result_status text,
  test_details jsonb,
  total_count bigint,
  active_count bigint,
  completed_count bigint,
  average_progress numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := GREATEST(1, LEAST(100, COALESCE(p_limit, 10)));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_search_like text;
  v_org uuid;
  v_tests_total int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_course(p_course_id, 'students.read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT c.organization_id INTO v_org FROM public.courses c WHERE c.id = p_course_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'course not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_search IS NOT NULL THEN
    v_search_like := '%' || v_search || '%';
  END IF;

  SELECT COUNT(*)::int INTO v_tests_total
  FROM public.lessons l
  WHERE l.course_id = p_course_id AND l.type = 'test';

  RETURN QUERY
  WITH excluded AS (
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','organization')
    UNION
    SELECT os.user_id FROM public.org_staff os
    WHERE os.organization_id = v_org
      AND (os.expires_at IS NULL OR os.expires_at > now())
  ),
  base AS (
    SELECT p.id, p.user_id, p.full_name, p.email, p.login, p.archived_at,
           e.id AS enrollment_id, COALESCE(e.progress, 0) AS progress,
           e.status, e.started_at, e.completed_at, e.time_spent,
           mc.credited_at AS manual_credited_at, mc.credited_by AS manual_credited_by
    FROM public.enrollments e
    JOIN public.profiles p ON p.user_id = e.user_id
    LEFT JOIN public.course_manual_credits mc ON mc.enrollment_id = e.id AND mc.revoked_at IS NULL
    WHERE e.course_id = p_course_id
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = e.user_id)
      AND (
        v_search IS NULL
        OR p.full_name ILIKE v_search_like
        OR p.email     ILIKE v_search_like
        OR p.login     ILIKE v_search_like
      )
      AND (
        p_status IS NULL OR p_status = 'all'
        OR (p_status = 'active'    AND e.status = 'active')
        OR (p_status = 'completed' AND e.status = 'completed')
      )
  ),
  test_lessons AS (
    SELECT l.id, l.title, l.order_index,
           COALESCE(l.test_passing_score, 70) AS passing_score,
           l.test_max_attempts
    FROM public.lessons l
    WHERE l.course_id = p_course_id AND l.type = 'test'
  ),
  latest_attempts AS (
    SELECT DISTINCT ON (ta.user_id, ta.lesson_id)
      ta.user_id, ta.lesson_id, ta.score, ta.max_score, ta.completed_at, ta.passing_score, ta.passed
    FROM public.test_attempts ta
    JOIN test_lessons tl ON tl.id = ta.lesson_id
    WHERE ta.user_id IN (SELECT b.user_id FROM base b)
    ORDER BY ta.user_id, ta.lesson_id, ta.completed_at DESC NULLS LAST
  ),
  attempt_counts AS (
    SELECT ta.user_id, ta.lesson_id, COUNT(*)::int AS attempts_used
    FROM public.test_attempts ta
    JOIN test_lessons tl ON tl.id = ta.lesson_id
    WHERE ta.user_id IN (SELECT b.user_id FROM base b)
    GROUP BY ta.user_id, ta.lesson_id
  ),
  per_lesson AS (
    SELECT
      b.user_id, tl.id AS lesson_id, tl.title AS lesson_title, tl.order_index,
      la.score, la.max_score,
      CASE WHEN la.max_score > 0
        THEN ROUND(la.score::numeric * 100 / la.max_score)::int
        ELSE NULL END AS percent,
      COALESCE(la.passing_score, tl.passing_score) AS passing_score,
      la.passed AS attempt_passed,
      tl.test_max_attempts,
      COALESCE(ac.attempts_used, 0) AS attempts_used,
      la.completed_at, b.manual_credited_at, b.manual_credited_by
    FROM base b
    CROSS JOIN test_lessons tl
    LEFT JOIN latest_attempts la ON la.user_id = b.user_id AND la.lesson_id = tl.id
    LEFT JOIN attempt_counts ac ON ac.user_id = b.user_id AND ac.lesson_id = tl.id
    WHERE la.lesson_id IS NOT NULL OR b.manual_credited_at IS NOT NULL
  ),
  per_user AS (
    SELECT
      pl.user_id,
      COUNT(*) FILTER (WHERE pl.attempts_used > 0)::int AS tests_attempted,
      SUM(CASE WHEN pl.manual_credited_at IS NOT NULL OR COALESCE(pl.attempt_passed, pl.max_score > 0 AND pl.percent >= pl.passing_score, false) THEN 1 ELSE 0 END)::int AS tests_passed,
      ROUND(AVG(pl.percent))::int AS average_percent,
      MAX(pl.completed_at) AS last_attempt_at,
      -- Single-test convenience fields (from the first / only latest attempt)
      (ARRAY_AGG(pl.score       ORDER BY pl.order_index NULLS LAST, pl.lesson_id))[1] AS latest_score,
      (ARRAY_AGG(pl.max_score   ORDER BY pl.order_index NULLS LAST, pl.lesson_id))[1] AS latest_max_score,
      (ARRAY_AGG(pl.percent     ORDER BY pl.order_index NULLS LAST, pl.lesson_id))[1] AS latest_percent,
      (ARRAY_AGG(pl.passing_score ORDER BY pl.order_index NULLS LAST, pl.lesson_id))[1] AS latest_passing_score,
      (ARRAY_AGG(pl.attempts_used ORDER BY pl.order_index NULLS LAST, pl.lesson_id))[1] AS latest_attempts_used,
      jsonb_agg(jsonb_build_object(
        'lesson_id',     pl.lesson_id,
        'lesson_title',  pl.lesson_title,
        'score',         pl.score,
        'max_score',     pl.max_score,
        'percent',       pl.percent,
        'passing_score', pl.passing_score,
        'passed',        (pl.manual_credited_at IS NOT NULL OR COALESCE(pl.attempt_passed, pl.max_score > 0 AND pl.percent >= pl.passing_score, false)),
        'manual_credited_at', pl.manual_credited_at,
        'manual_credited_by', pl.manual_credited_by,
        'attempts_used', pl.attempts_used,
        'max_attempts',  pl.test_max_attempts,
        'completed_at',  pl.completed_at
      ) ORDER BY pl.order_index NULLS LAST, pl.lesson_id) AS test_details
    FROM per_lesson pl
    GROUP BY pl.user_id
  ),
  joined AS (
    SELECT
      b.*,
      COALESCE(pu.tests_attempted, 0)  AS tests_attempted,
      COALESCE(pu.tests_passed, 0)     AS tests_passed,
      COALESCE(pu.average_percent, 0)  AS average_percent,
      pu.latest_score, pu.latest_max_score, pu.latest_percent,
      pu.latest_passing_score, pu.latest_attempts_used, pu.last_attempt_at,
      COALESCE(pu.test_details, '[]'::jsonb) AS test_details,
      CASE
        WHEN v_tests_total = 0 THEN 'no_tests'
        WHEN b.manual_credited_at IS NOT NULL THEN 'passed'
        WHEN COALESCE(pu.tests_attempted, 0) = 0 THEN 'not_started'
        WHEN COALESCE(pu.tests_passed, 0) >= v_tests_total THEN 'passed'
        ELSE 'failed'
      END AS result_status
    FROM base b
    LEFT JOIN per_user pu ON pu.user_id = b.user_id
  ),
  filtered AS (
    SELECT * FROM joined j
    WHERE
      p_result_filter IS NULL OR p_result_filter = 'all'
      OR (p_result_filter = 'passed'      AND j.result_status = 'passed')
      OR (p_result_filter = 'failed'      AND j.result_status = 'failed')
      OR (p_result_filter = 'not_started' AND j.result_status = 'not_started')
  ),
  cnt AS (SELECT COUNT(*)::bigint AS total_count FROM filtered),
  course_cnt AS (
    SELECT
      COUNT(*) FILTER (WHERE e.status = 'active')::bigint     AS active_count,
      COUNT(*) FILTER (WHERE e.status = 'completed')::bigint  AS completed_count,
      COALESCE(ROUND(AVG(COALESCE(e.progress, 0))::numeric, 1), 0) AS avg_progress
    FROM public.enrollments e
    WHERE e.course_id = p_course_id
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = e.user_id)
  )
  SELECT
    f.id, f.user_id, f.full_name, f.email, f.login,
    f.enrollment_id, f.progress, f.status, f.started_at, f.completed_at, f.time_spent,
    f.archived_at,
    v_tests_total AS tests_total,
    f.tests_attempted, f.tests_passed, f.average_percent,
    f.latest_score, f.latest_max_score, f.latest_percent,
    f.latest_passing_score,
    f.latest_attempts_used AS attempts_used,
    f.last_attempt_at,
    f.result_status,
    f.test_details,
    cnt.total_count,
    course_cnt.active_count, course_cnt.completed_count, course_cnt.avg_progress
  FROM filtered f, cnt, course_cnt
  ORDER BY f.full_name NULLS LAST, f.user_id
  OFFSET v_offset
  LIMIT  v_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_course_student_test_results_page(uuid,int,int,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_student_test_results_page(uuid,int,int,text,text,text) TO authenticated, service_role;



-- Reset study progress without erasing evidence or granting extra test attempts.
CREATE OR REPLACE FUNCTION public.reset_course_learning_progress(p_enrollment_id uuid, p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_enrollment public.enrollments%ROWTYPE; v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
  SELECT e.* INTO v_enrollment FROM public.enrollments e WHERE e.id=p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'enrollment not found' USING ERRCODE='P0002'; END IF;
  SELECT c.organization_id INTO v_org FROM public.courses c WHERE c.id=v_enrollment.course_id;
  IF p_organization_id IS NULL OR v_org IS DISTINCT FROM p_organization_id
    OR NOT public.can_access_course(v_enrollment.course_id,'students.write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.lesson_progress lp USING public.lessons l
    WHERE lp.lesson_id=l.id AND l.course_id=v_enrollment.course_id AND lp.user_id=v_enrollment.user_id;
  UPDATE public.enrollments SET progress=0,status='active',completed_at=NULL WHERE id=p_enrollment_id;
  RETURN jsonb_build_object('enrollmentId',p_enrollment_id,'reset',true);
END;
$$;
REVOKE ALL ON FUNCTION public.reset_course_learning_progress(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reset_course_learning_progress(uuid,uuid) TO authenticated;

-- Recovery of already completed online work must honor its recorded threshold.
CREATE OR REPLACE FUNCTION public.complete_own_course_enrollment(
  p_enrollment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_enrollment public.enrollments%ROWTYPE;
  v_total integer;
  v_completed integer;
  v_was_completed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_enrollment
  FROM public.enrollments e
  WHERE e.id = p_enrollment_id
    AND e.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_was_completed := v_enrollment.status = 'completed';

  -- Recover a passed test whose attempt was saved before progress failed.
  INSERT INTO public.lesson_progress (
    user_id, lesson_id, completed, completed_at
  )
  SELECT
    v_user_id, l.id, true, COALESCE(MAX(ta.completed_at), now())
  FROM public.lessons l
  JOIN public.test_attempts ta
    ON ta.lesson_id = l.id
   AND ta.user_id = v_user_id
   AND ta.max_score > 0
   AND COALESCE(ta.passed, (ta.score::numeric * 100 / ta.max_score::numeric) >= COALESCE(ta.passing_score, l.test_passing_score, 60))
  WHERE l.course_id = v_enrollment.course_id
    AND l.type = 'test'
  GROUP BY l.id
  ON CONFLICT (user_id, lesson_id)
  DO UPDATE SET
    completed = true,
    completed_at = COALESCE(public.lesson_progress.completed_at, EXCLUDED.completed_at);

  SELECT COUNT(*) INTO v_total
  FROM public.lessons l
  WHERE l.course_id = v_enrollment.course_id;

  SELECT COUNT(*) INTO v_completed
  FROM public.lesson_progress lp
  JOIN public.lessons l ON l.id = lp.lesson_id
  WHERE l.course_id = v_enrollment.course_id
    AND lp.user_id = v_user_id
    AND lp.completed = true;

  IF v_total = 0 OR v_completed < v_total THEN
    RAISE EXCEPTION 'course_incomplete:%/%', v_completed, v_total USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.enrollments e
  SET progress = 100,
      status = 'completed',
      completed_at = COALESCE(e.completed_at, now())
  WHERE e.id = p_enrollment_id
  RETURNING * INTO v_enrollment;

  RETURN jsonb_build_object(
    'id', v_enrollment.id,
    'status', v_enrollment.status,
    'progress', v_enrollment.progress,
    'completed_at', v_enrollment.completed_at,
    'was_already_completed', v_was_completed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_own_course_enrollment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_own_course_enrollment(uuid) TO authenticated;
