
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
           e.status, e.started_at, e.completed_at, e.time_spent
    FROM public.enrollments e
    JOIN public.profiles p ON p.user_id = e.user_id
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
      ta.user_id, ta.lesson_id, ta.score, ta.max_score, ta.completed_at
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
      la.user_id, la.lesson_id, tl.title AS lesson_title, tl.order_index,
      la.score, la.max_score,
      CASE WHEN la.max_score > 0
        THEN ROUND(la.score::numeric * 100 / la.max_score)::int
        ELSE 0 END AS percent,
      tl.passing_score,
      tl.test_max_attempts,
      COALESCE(ac.attempts_used, 0) AS attempts_used,
      la.completed_at
    FROM latest_attempts la
    JOIN test_lessons tl ON tl.id = la.lesson_id
    LEFT JOIN attempt_counts ac
      ON ac.user_id = la.user_id AND ac.lesson_id = la.lesson_id
  ),
  per_user AS (
    SELECT
      pl.user_id,
      COUNT(*)::int AS tests_attempted,
      SUM(CASE WHEN pl.max_score > 0 AND pl.percent >= pl.passing_score THEN 1 ELSE 0 END)::int AS tests_passed,
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
        'passed',        (pl.max_score > 0 AND pl.percent >= pl.passing_score),
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
