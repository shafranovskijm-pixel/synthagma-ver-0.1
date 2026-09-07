-- Daily attempt quotas and an immutable start/submission record. A day is Moscow time.
-- Existing test_attempts remain completed-only, preserving downstream reports.
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS test_max_attempts_per_day integer;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_test_max_attempts_per_day_positive
  CHECK (test_max_attempts_per_day IS NULL OR test_max_attempts_per_day > 0);
COMMENT ON COLUMN public.lessons.test_max_attempts_per_day IS
  'Maximum started attempts per learner per Moscow calendar day; NULL means unlimited. Resuming does not consume another attempt.';

CREATE TABLE public.test_attempt_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  questions_snapshot jsonb NOT NULL CHECK (jsonb_typeof(questions_snapshot) = 'array'),
  passing_score integer NOT NULL CHECK (passing_score BETWEEN 0 AND 100),
  show_answers boolean NOT NULL,
  UNIQUE (user_id, lesson_id, request_id),
  CHECK ((status = 'completed') = (submitted_at IS NOT NULL))
);
CREATE UNIQUE INDEX test_attempt_sessions_one_active
  ON public.test_attempt_sessions(user_id, lesson_id) WHERE status = 'in_progress';
CREATE INDEX test_attempt_sessions_quota
  ON public.test_attempt_sessions(user_id, lesson_id, started_at);
ALTER TABLE public.test_attempt_sessions ENABLE ROW LEVEL SECURITY;
-- Snapshot contains the answer key; expose only filtered SECURITY DEFINER RPCs.
REVOKE ALL ON public.test_attempt_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.test_attempt_sessions TO service_role;

-- Remember every acknowledged start request, including requests that resumed
-- another tab's session, so a late retry cannot create a fresh attempt.
CREATE TABLE public.test_attempt_start_requests (
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.test_attempt_sessions(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id, lesson_id, request_id)
);
ALTER TABLE public.test_attempt_start_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_attempt_start_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.test_attempt_start_requests TO service_role;
ALTER TABLE public.test_attempts
  ADD COLUMN session_id uuid UNIQUE REFERENCES public.test_attempt_sessions(id),
  ADD COLUMN started_at timestamptz,
  ADD COLUMN passing_score integer,
  ADD COLUMN passed boolean;
COMMENT ON COLUMN public.test_attempts.started_at IS
  'Actual recorded start for new sessions. NULL for historical attempts whose start was never recorded.';
DROP POLICY IF EXISTS "Users can manage own test attempts" ON public.test_attempts;
CREATE POLICY "Users can read own test attempts" ON public.test_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.test_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._assert_test_learner_access(p_lesson_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND blocked_at IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.lessons l JOIN public.courses c ON c.id = l.course_id
    WHERE l.id = p_lesson_id AND l.type = 'test' AND c.is_published = true
      AND public.can_access_course_as_learner(c.id)
  ) THEN
    RAISE EXCEPTION 'Test is not available for this learner' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._test_manual_credit(p_lesson_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_credit jsonb;
BEGIN
  -- The following migration installs the manual-credit table. Safe during rollout.
  IF to_regclass('public.course_manual_credits') IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object('creditedAt', mc.credited_at, 'creditedBy', mc.credited_by)
    INTO v_credit
  FROM public.course_manual_credits mc
  JOIN public.enrollments e ON e.id = mc.enrollment_id
  JOIN public.lessons l ON l.course_id = e.course_id
  WHERE l.id = p_lesson_id AND e.user_id = auth.uid() AND mc.revoked_at IS NULL
  ORDER BY mc.credited_at DESC LIMIT 1;
  RETURN v_credit;
END;
$$;

CREATE OR REPLACE FUNCTION public._test_attempt_limits(p_lesson_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_day_start timestamptz;
  v_reset timestamptz;
  v_total integer;
  v_today integer;
  v_max integer;
  v_daily integer;
BEGIN
  v_day_start := date_trunc('day', v_now AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow';
  v_reset := (date_trunc('day', v_now AT TIME ZONE 'Europe/Moscow') + interval '1 day') AT TIME ZONE 'Europe/Moscow';
  SELECT test_max_attempts, test_max_attempts_per_day INTO v_max, v_daily
    FROM public.lessons WHERE id = p_lesson_id;
  SELECT count(*)::integer, count(*) FILTER (WHERE attempt_time >= v_day_start AND attempt_time < v_reset)::integer
    INTO v_total, v_today
  FROM (
    SELECT started_at AS attempt_time FROM public.test_attempt_sessions
      WHERE user_id = p_user_id AND lesson_id = p_lesson_id
    UNION ALL
    SELECT completed_at FROM public.test_attempts
      WHERE user_id = p_user_id AND lesson_id = p_lesson_id AND session_id IS NULL
  ) attempts;
  RETURN jsonb_build_object('maxAttempts', v_max, 'maxAttemptsPerDay', v_daily,
    'attemptsUsed', v_total, 'attemptsUsedToday', v_today,
    'dayTimezone', 'Europe/Moscow', 'resetAt', v_reset);
END;
$$;

CREATE OR REPLACE FUNCTION public._test_public_questions(p_questions jsonb, p_feedback boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(CASE WHEN p_feedback THEN q ELSE q - 'correct_answer' - 'explanation' END ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(p_questions) WITH ORDINALITY AS item(q, ord)
$$;

CREATE OR REPLACE FUNCTION public._test_session_payload(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.test_attempt_sessions%ROWTYPE;
BEGIN
  SELECT * INTO STRICT s FROM public.test_attempt_sessions WHERE id = p_session_id;
  RETURN public._test_attempt_limits(s.lesson_id, s.user_id) || jsonb_build_object(
    'attemptId', s.id, 'startedAt', s.started_at, 'status', s.status,
    'questions', public._test_public_questions(s.questions_snapshot, false),
    'passingScore', s.passing_score, 'showAnswers', s.show_answers);
END;
$$;

CREATE OR REPLACE FUNCTION public._test_grade_payload(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.test_attempts%ROWTYPE;
  s public.test_attempt_sessions%ROWTYPE;
  v_correct jsonb := '{}'::jsonb;
  v_explanations jsonb := '{}'::jsonb;
  v_show boolean;
BEGIN
  SELECT * INTO STRICT s FROM public.test_attempt_sessions WHERE id = p_session_id;
  SELECT * INTO STRICT a FROM public.test_attempts WHERE session_id = p_session_id;
  SELECT s.show_answers AND l.test_show_answers INTO v_show FROM public.lessons l WHERE l.id = s.lesson_id;
  IF v_show THEN
    SELECT coalesce(jsonb_object_agg(q->>'id', q->'correct_answer'), '{}'::jsonb),
      coalesce(jsonb_object_agg(q->>'id', q->'explanation'), '{}'::jsonb)
      INTO v_correct, v_explanations FROM jsonb_array_elements(s.questions_snapshot) q;
  END IF;
  RETURN public._test_attempt_limits(s.lesson_id, s.user_id) || jsonb_build_object(
    'attemptId', s.id, 'score', a.score, 'maxScore', a.max_score,
    'scorePercent', CASE WHEN a.max_score > 0 THEN round(a.score * 100.0 / a.max_score)::integer ELSE 0 END,
    'passed', a.passed, 'passingScore', a.passing_score, 'showAnswers', v_show,
    'correctAnswers', v_correct, 'explanations', v_explanations);
END;
$$;

-- Legacy seed data stored some options as a JSON string containing an array.
-- Normalize the immutable snapshot only; never rewrite the source question bank.
CREATE OR REPLACE FUNCTION public._test_normalize_options(p_options jsonb, p_correct_answer integer)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE v_options jsonb := p_options;
BEGIN
  IF jsonb_typeof(v_options) = 'string' THEN
    BEGIN
      v_options := (v_options #>> '{}')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Test content invalid: answer options are not a valid JSON array' USING ERRCODE = '22023';
    END;
  END IF;
  IF jsonb_typeof(v_options) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Test content invalid: answer options must be an array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_options) = 0 THEN
    RAISE EXCEPTION 'Test content invalid: answer options are empty' USING ERRCODE = '22023';
  END IF;
  -- Preserve legacy keys, including NULL and out-of-range values, in the snapshot.
  -- Legal answers still use zero-based option indexes; these keys cannot earn a point.
  RETURN v_options;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_test_attempt(p_lesson_id uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session uuid;
  v_limits jsonb;
  v_questions jsonb;
  v_count integer;
  v_passing integer;
  v_show boolean;
BEGIN
  PERFORM public._assert_test_learner_access(p_lesson_id);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'request_id is required' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_lesson_id::text, 0));
  PERFORM 1 FROM public.enrollments e JOIN public.lessons l ON l.course_id = e.course_id
    WHERE l.id = p_lesson_id AND e.user_id = v_user FOR UPDATE OF e;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment is not available' USING ERRCODE = '42501'; END IF;
  PERFORM public._assert_test_learner_access(p_lesson_id);
  IF public._test_manual_credit(p_lesson_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Course already credited by the organization' USING ERRCODE = 'P0001';
  END IF;
  SELECT session_id INTO v_session FROM public.test_attempt_start_requests
    WHERE user_id = v_user AND lesson_id = p_lesson_id AND request_id = p_request_id;
  IF v_session IS NOT NULL THEN RETURN public._test_session_payload(v_session); END IF;
  -- A second tab or a network retry resumes the same attempt, including across midnight.
  SELECT id INTO v_session FROM public.test_attempt_sessions
    WHERE user_id = v_user AND lesson_id = p_lesson_id AND status = 'in_progress';
  IF v_session IS NOT NULL THEN
    INSERT INTO public.test_attempt_start_requests(user_id, lesson_id, request_id, session_id)
      VALUES (v_user, p_lesson_id, p_request_id, v_session);
    RETURN public._test_session_payload(v_session);
  END IF;
  v_limits := public._test_attempt_limits(p_lesson_id, v_user);
  IF (v_limits->>'maxAttempts')::integer > 0
    AND (v_limits->>'attemptsUsed')::integer >= (v_limits->>'maxAttempts')::integer THEN
    RAISE EXCEPTION 'Attempts exhausted' USING ERRCODE = 'P0001', DETAIL = v_limits::text;
  END IF;
  IF (v_limits->>'maxAttemptsPerDay')::integer > 0
    AND (v_limits->>'attemptsUsedToday')::integer >= (v_limits->>'maxAttemptsPerDay')::integer THEN
    RAISE EXCEPTION 'Daily attempts exhausted' USING ERRCODE = 'P0001', DETAIL = v_limits::text;
  END IF;
  SELECT test_questions_to_show, test_passing_score, test_show_answers
    INTO v_count, v_passing, v_show FROM public.lessons WHERE id = p_lesson_id;
  -- Validate every candidate before sampling: malformed content must not randomly
  -- consume a quota slot or silently disappear from the configured question bank.
  WITH normalized AS MATERIALIZED (
    SELECT tq.id, tq.lesson_id, tq.question,
      public._test_normalize_options(tq.options, tq.correct_answer) AS options,
      tq.order_index, tq.correct_answer, tq.explanation, tq.image_url, tq.is_bank_question
    FROM public.test_questions tq WHERE tq.lesson_id = p_lesson_id
  )
  SELECT jsonb_agg(to_jsonb(q) ORDER BY q.position) INTO v_questions FROM (
    SELECT tq.*, row_number() OVER () AS position
    FROM (SELECT * FROM normalized ORDER BY random()
      LIMIT CASE WHEN v_count > 0 THEN v_count ELSE NULL END) tq
  ) q;
  IF v_questions IS NULL OR jsonb_array_length(v_questions) = 0 THEN
    RAISE EXCEPTION 'No test questions available' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.test_attempt_sessions(user_id, lesson_id, request_id, questions_snapshot, passing_score, show_answers)
    VALUES (v_user, p_lesson_id, p_request_id, v_questions, coalesce(v_passing, 60), v_show)
    RETURNING id INTO v_session;
  INSERT INTO public.test_attempt_start_requests(user_id, lesson_id, request_id, session_id)
    VALUES (v_user, p_lesson_id, p_request_id, v_session);
  RETURN public._test_session_payload(v_session);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_test_attempt(p_attempt_id uuid, p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.test_attempt_sessions%ROWTYPE;
  v_score integer;
  v_max integer;
  v_passed boolean;
  v_completed timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.test_attempt_sessions WHERE id = p_attempt_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found' USING ERRCODE = '42501'; END IF;
  PERFORM public._assert_test_learner_access(s.lesson_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(s.user_id::text || ':' || s.lesson_id::text, 0));
  SELECT * INTO STRICT s FROM public.test_attempt_sessions WHERE id = p_attempt_id FOR UPDATE;
  PERFORM public._assert_test_learner_access(s.lesson_id);
  -- A response can be lost after commit: return the original result, never regrade or recount.
  IF s.status = 'completed' THEN RETURN public._test_grade_payload(s.id); END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'answers must be an object' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_answers) a
    LEFT JOIN LATERAL (SELECT q FROM jsonb_array_elements(s.questions_snapshot) q WHERE q->>'id' = a.key) item ON true
    WHERE item.q IS NULL OR jsonb_typeof(a.value) <> 'number'
      OR a.value::text !~ '^[0-9]+$'
      OR CASE WHEN jsonb_typeof(a.value) = 'number' AND a.value::text ~ '^[0-9]+$'
        THEN (a.value::text)::numeric >= jsonb_array_length(item.q->'options') ELSE false END
  ) THEN
    RAISE EXCEPTION 'Answer is not a valid option in this attempt' USING ERRCODE = '22023';
  END IF;
  SELECT count(*)::integer, count(*) FILTER (WHERE p_answers->(q->>'id') = q->'correct_answer')::integer
    INTO v_max, v_score FROM jsonb_array_elements(s.questions_snapshot) q;
  v_passed := round(v_score * 100.0 / v_max) >= s.passing_score;
  v_completed := clock_timestamp();
  INSERT INTO public.test_attempts(user_id, lesson_id, session_id, started_at, completed_at,
    score, max_score, answers, shown_question_ids, passing_score, passed)
  VALUES (s.user_id, s.lesson_id, s.id, s.started_at, v_completed, v_score, v_max, p_answers,
    (SELECT jsonb_agg(q->'id') FROM jsonb_array_elements(s.questions_snapshot) q), s.passing_score, v_passed);
  UPDATE public.test_attempt_sessions SET status = 'completed', submitted_at = v_completed WHERE id = s.id;
  IF v_passed THEN
    INSERT INTO public.lesson_progress(user_id, lesson_id, completed, completed_at)
      VALUES (s.user_id, s.lesson_id, true, v_completed)
    ON CONFLICT (user_id, lesson_id) DO UPDATE SET completed = true,
      completed_at = coalesce(public.lesson_progress.completed_at, EXCLUDED.completed_at);
  END IF;
  RETURN public._test_grade_payload(s.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_test_state(p_lesson_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.test_attempts%ROWTYPE;
  v_active uuid;
  v_state jsonb;
  v_feedback jsonb;
  v_questions jsonb := '[]'::jsonb;
  v_used jsonb;
  v_show boolean;
  v_passing integer;
BEGIN
  PERFORM public._assert_test_learner_access(p_lesson_id);
  SELECT test_show_answers, test_passing_score INTO v_show, v_passing FROM public.lessons WHERE id = p_lesson_id;
  v_state := public._test_attempt_limits(p_lesson_id, auth.uid()) || jsonb_build_object(
    'hasAttempt', false, 'activeAttempt', NULL, 'showAnswers', v_show,
    'passingScore', v_passing, 'manualCredit', public._test_manual_credit(p_lesson_id));
  SELECT id INTO v_active FROM public.test_attempt_sessions
    WHERE user_id = auth.uid() AND lesson_id = p_lesson_id AND status = 'in_progress';
  IF v_active IS NOT NULL AND public._test_manual_credit(p_lesson_id) IS NULL THEN
    v_state := v_state || jsonb_build_object('activeAttempt', public._test_session_payload(v_active));
  END IF;
  SELECT coalesce(jsonb_agg(DISTINCT q), '[]'::jsonb) INTO v_used
    FROM public.test_attempts t CROSS JOIN LATERAL jsonb_array_elements(t.shown_question_ids) q
    WHERE t.user_id = auth.uid() AND t.lesson_id = p_lesson_id;
  v_state := v_state || jsonb_build_object('usedQuestionIds', v_used);
  SELECT * INTO a FROM public.test_attempts
    WHERE user_id = auth.uid() AND lesson_id = p_lesson_id ORDER BY completed_at DESC, id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN v_state; END IF;
  IF a.session_id IS NOT NULL THEN
    v_feedback := public._test_grade_payload(a.session_id);
    SELECT public._test_public_questions(questions_snapshot, v_show AND show_answers)
      INTO v_questions FROM public.test_attempt_sessions WHERE id = a.session_id;
  ELSE
    -- Historical starts, question versions, and passing threshold are unknown.
    v_feedback := jsonb_build_object('correctAnswers', '{}'::jsonb, 'explanations', '{}'::jsonb,
      'scorePercent', CASE WHEN a.max_score > 0 THEN round(a.score * 100.0 / a.max_score)::integer ELSE 0 END,
      'passed', a.passed, 'passingScore', a.passing_score);
  END IF;
  RETURN v_state || v_feedback || jsonb_build_object('hasAttempt', true,
    'attempt', to_jsonb(a) || jsonb_build_object('questions', v_questions, 'legacy', a.session_id IS NULL));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_test_attempt_history(p_lesson_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_organization_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_target uuid := coalesce(p_user_id, auth.uid()); v_history jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_lesson_id IS NOT NULL AND v_target <> auth.uid()
    AND NOT public.can_access_lesson(p_lesson_id, 'students.read') THEN
    RAISE EXCEPTION 'Test history is not available for this user' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(entry ORDER BY occurred_at DESC, entry->>'id'), '[]'::jsonb) INTO v_history
  FROM (
    SELECT s.started_at AS occurred_at, jsonb_build_object(
      'id', s.id, 'lesson_id', s.lesson_id, 'lesson_title', l.title, 'course_title', c.title, 'organization_id', c.organization_id,
      'started_at', s.started_at, 'completed_at', s.submitted_at, 'status', s.status,
      'score', a.score, 'max_score', a.max_score, 'passing_score', s.passing_score,
      'passed', a.passed, 'answers', coalesce(a.answers, '{}'::jsonb),
      'questions', public._test_public_questions(s.questions_snapshot,
        public.can_access_lesson(s.lesson_id, 'students.read') OR
        (s.status = 'completed' AND s.show_answers AND l.test_show_answers)),
      'legacy', false) AS entry
    FROM public.test_attempt_sessions s JOIN public.lessons l ON l.id = s.lesson_id JOIN public.courses c ON c.id = l.course_id
      LEFT JOIN public.test_attempts a ON a.session_id = s.id
    WHERE s.user_id = v_target AND (p_lesson_id IS NULL OR s.lesson_id = p_lesson_id)
      AND (p_organization_id IS NULL OR c.organization_id = p_organization_id)
      AND (v_target = auth.uid() OR public.can_access_lesson(s.lesson_id, 'students.read'))
    UNION ALL
    SELECT a.completed_at, jsonb_build_object(
      'id', a.id, 'lesson_id', a.lesson_id, 'lesson_title', l.title, 'course_title', c.title, 'organization_id', c.organization_id,
      'started_at', NULL, 'completed_at', a.completed_at, 'status', 'completed',
      'score', a.score, 'max_score', a.max_score, 'passing_score', a.passing_score,
      'passed', a.passed, 'answers', a.answers, 'questions', '[]'::jsonb, 'legacy', true)
    FROM public.test_attempts a JOIN public.lessons l ON l.id = a.lesson_id JOIN public.courses c ON c.id = l.course_id
    WHERE a.user_id = v_target AND a.session_id IS NULL
      AND (p_lesson_id IS NULL OR a.lesson_id = p_lesson_id)
      AND (p_organization_id IS NULL OR c.organization_id = p_organization_id)
      AND (v_target = auth.uid() OR public.can_access_lesson(a.lesson_id, 'students.read'))
  ) history;
  RETURN v_history;
END;
$$;

-- No helper may be called by an API role with arbitrary learner IDs.
REVOKE ALL ON FUNCTION public._assert_test_learner_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_manual_credit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_attempt_limits(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_public_questions(jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_session_payload(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_grade_payload(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_normalize_options(jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_test_attempt(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_test_attempt(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_student_test_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_test_attempt_history(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_test_attempt(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_test_attempt(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_test_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_test_attempt_history(uuid, uuid, uuid) TO authenticated, service_role;

-- Compatibility question endpoint must not reveal explanation answer hints before grading.
-- Students need the question text and options, but must never receive
-- test_questions.correct_answer through a direct table policy.
-- This RPC verifies either tenant course access (staff/admin preview) or an
-- active enrollment (student) and returns a deliberately masked shape.

CREATE OR REPLACE FUNCTION public.get_student_test_questions(p_lesson_id uuid)
RETURNS TABLE (
  id uuid,
  lesson_id uuid,
  question text,
  options jsonb,
  order_index integer,
  explanation text,
  is_bank_question boolean,
  image_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.can_access_lesson(p_lesson_id, 'courses.read')
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      JOIN public.enrollments e ON e.course_id = c.id
      WHERE l.id = p_lesson_id
        AND c.is_published = true
        AND e.user_id = auth.uid()
        AND e.status IN ('active', 'completed')
        AND (e.expires_at IS NULL OR e.expires_at > now())
    )
  ) THEN
    RAISE EXCEPTION 'Test questions are not available for this user' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    tq.id,
    tq.lesson_id,
    tq.question,
    tq.options,
    tq.order_index,
    CASE WHEN public.can_access_lesson(p_lesson_id, 'courses.read') THEN tq.explanation ELSE NULL::text END,
    tq.is_bank_question,
    tq.image_url
  FROM public.test_questions tq
  WHERE tq.lesson_id = p_lesson_id
  ORDER BY tq.order_index;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_test_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_test_questions(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_student_test_questions(uuid) IS
  'Returns enrolled-student test questions without correct_answer; tenant staff access is allowed for preview.';
