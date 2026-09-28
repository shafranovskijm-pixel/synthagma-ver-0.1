-- S029 ONLY. No production execution implied by this file.
-- Original 20260929120000_final_test_photo.sql: 24718 bytes, SHA256 8a2c48c31c4f83892507a8705bce72bc3abfc0cb38a520d2b13bf262a59eae21.
-- Selected Cloud project and fresh recovery copy must be verified before execution.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $s029_release$
DECLARE
 v_failures text;
 v_source text := $s029_exact_migration$-- Optional camera photograph before each NEW final-test attempt. This records
-- submitted evidence; it is not biometric identification or a liveness check.
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS require_final_test_photo boolean NOT NULL DEFAULT false;
ALTER TABLE public.test_attempt_sessions
  ADD COLUMN IF NOT EXISTS requires_final_test_photo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.test_attempt_sessions.requires_final_test_photo IS
  'Course requirement snapshotted when the attempt starts. Existing sessions remain resumable.';

CREATE TABLE public.final_test_photo_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  object_path text NOT NULL UNIQUE,
  storage_object_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  session_id uuid UNIQUE REFERENCES public.test_attempt_sessions(id) ON DELETE CASCADE,
  UNIQUE (user_id, lesson_id, request_id),
  CHECK (expires_at > created_at),
  CHECK ((completed_at IS NULL) = (storage_object_id IS NULL)),
  CHECK (session_id IS NULL OR completed_at IS NOT NULL)
);
ALTER TABLE public.final_test_photo_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.final_test_photo_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.final_test_photo_challenges TO service_role;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('final-test-photos', 'final-test-photos', false, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg'];

-- Known modules follow the course builder order; unassigned/unknown modules
-- come last, as in courseLessonOrder.ts. UUID breaks equal stored indexes
-- deterministically; clients consume photoRequired instead of guessing.
CREATE OR REPLACE FUNCTION public._final_test_photo_required(p_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT c.require_final_test_photo AND l.id = (
    SELECT candidate.id FROM public.lessons candidate
    LEFT JOIN public.course_modules m ON m.id = candidate.module_id AND m.course_id = candidate.course_id
    WHERE candidate.course_id = c.id AND candidate.type = 'test'
    ORDER BY (m.id IS NULL) DESC, m.order_index DESC NULLS FIRST,
      m.id DESC NULLS FIRST, candidate.order_index DESC, candidate.id DESC
    LIMIT 1
  ) FROM public.lessons l JOIN public.courses c ON c.id = l.course_id
  WHERE l.id = p_lesson_id AND l.type = 'test'), false)
$$;

CREATE OR REPLACE FUNCTION public.can_upload_final_test_photo(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.final_test_photo_challenges c
    JOIN public.enrollments e ON e.id = c.enrollment_id AND e.user_id = c.user_id AND e.course_id = c.course_id
    JOIN public.courses course ON course.id = c.course_id
    WHERE c.object_path = p_path AND c.user_id = auth.uid()
      AND c.completed_at IS NULL AND c.session_id IS NULL AND c.expires_at > now()
      AND course.is_published AND public.can_access_course_as_learner(c.course_id)
      AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND blocked_at IS NOT NULL)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_read_final_test_photo(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.final_test_photo_challenges c
    WHERE c.object_path = p_path AND (
      (c.user_id = auth.uid() AND public.can_access_course_as_learner(c.course_id))
      OR public.can_access_lesson(c.lesson_id, 'students.read')
    ) AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND blocked_at IS NOT NULL)
  )
$$;

-- Restrictive guards also constrain any older broad storage policy. The new
-- bucket is immutable to clients after INSERT: no overwrite, move or deletion.
CREATE POLICY final_test_photos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'final-test-photos' AND public.can_upload_final_test_photo(name));
CREATE POLICY final_test_photos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'final-test-photos' AND public.can_read_final_test_photo(name));
CREATE POLICY final_test_photos_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
  WITH CHECK (bucket_id <> 'final-test-photos' OR public.can_upload_final_test_photo(name));
CREATE POLICY final_test_photos_select_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC
  USING (bucket_id <> 'final-test-photos' OR public.can_read_final_test_photo(name));
CREATE POLICY final_test_photos_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
  USING (bucket_id <> 'final-test-photos') WITH CHECK (bucket_id <> 'final-test-photos');
CREATE POLICY final_test_photos_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC
  USING (bucket_id <> 'final-test-photos');

-- The storage service creates the object metadata. Do not trust a client-side
-- status in video_identifications, or any older general course-entry photo.
-- Metadata validates the stored upload's MIME/size, not its image contents.
CREATE OR REPLACE FUNCTION public._final_test_photo_object_valid(p_challenge_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.final_test_photo_challenges c
    JOIN storage.objects o ON o.bucket_id = 'final-test-photos' AND o.name = c.object_path
    WHERE c.id = p_challenge_id
      AND c.object_path = c.user_id::text || '/' || c.id::text || '/capture.jpg'
      AND coalesce(to_jsonb(o)->>'owner_id', to_jsonb(o)->>'owner') = c.user_id::text
      AND o.created_at >= c.created_at AND o.created_at <= c.expires_at
      AND o.metadata->>'mimetype' = 'image/jpeg'
      AND CASE WHEN o.metadata->>'size' ~ '^[0-9]+$'
        THEN (o.metadata->>'size')::numeric BETWEEN 1 AND 5242880 ELSE false END
      AND (c.storage_object_id IS NULL OR c.storage_object_id = o.id)
  )
$$;

CREATE OR REPLACE FUNCTION public.prepare_final_test_photo(p_lesson_id uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := auth.uid();
  v_enrollment uuid;
  v_course uuid;
  v_id uuid;
  c public.final_test_photo_challenges%ROWTYPE;
BEGIN
  PERFORM public._assert_test_learner_access(p_lesson_id);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'request_id is required' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_lesson_id::text, 0));
  SELECT e.id, e.course_id INTO v_enrollment, v_course
    FROM public.enrollments e JOIN public.lessons l ON l.course_id = e.course_id
    WHERE l.id = p_lesson_id AND e.user_id = v_user FOR UPDATE OF e;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment is not available' USING ERRCODE = '42501'; END IF;
  PERFORM public._assert_test_learner_access(p_lesson_id);
  IF NOT public._final_test_photo_required(p_lesson_id)
    OR public._test_manual_credit(p_lesson_id) IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.test_attempt_start_requests WHERE user_id = v_user
      AND lesson_id = p_lesson_id AND request_id = p_request_id)
    OR EXISTS (SELECT 1 FROM public.test_attempt_sessions WHERE user_id = v_user
      AND lesson_id = p_lesson_id AND status = 'in_progress') THEN
    RETURN jsonb_build_object('required', false);
  END IF;
  SELECT * INTO c FROM public.final_test_photo_challenges WHERE user_id = v_user
    AND lesson_id = p_lesson_id AND request_id = p_request_id FOR UPDATE;
  IF FOUND AND (c.expires_at <= clock_timestamp() OR c.enrollment_id <> v_enrollment
    OR c.completed_at IS NULL) THEN
    -- Retain the old object as orphan evidence for a service-role retention job;
    -- a fresh unpredictable path prevents reuse after expiry, an in-flight upload
    -- or a lost upload response. Every new camera preview gets a fresh path;
    -- completed proofs and actual attempt start requests remain idempotent.
    DELETE FROM public.final_test_photo_challenges WHERE id = c.id AND session_id IS NULL;
    c.id := NULL;
  END IF;
  IF c.id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO public.final_test_photo_challenges(id, user_id, course_id, lesson_id, enrollment_id,
      request_id, object_path, expires_at)
    VALUES (v_id, v_user, v_course, p_lesson_id, v_enrollment, p_request_id,
      v_user::text || '/' || v_id::text || '/capture.jpg', clock_timestamp() + interval '20 minutes')
    RETURNING * INTO c;
  END IF;
  RETURN jsonb_build_object('required', true, 'challengeId', c.id,
    'bucket', 'final-test-photos', 'path', c.object_path, 'expiresAt', c.expires_at,
    'completed', c.completed_at IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_final_test_photo(p_challenge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.final_test_photo_challenges%ROWTYPE; v_object uuid;
BEGIN
  SELECT * INTO c FROM public.final_test_photo_challenges WHERE id = p_challenge_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Final test photo challenge not found' USING ERRCODE = '42501'; END IF;
  PERFORM public._assert_test_learner_access(c.lesson_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(c.user_id::text || ':' || c.lesson_id::text, 0));
  PERFORM 1 FROM public.enrollments WHERE id = c.enrollment_id AND user_id = auth.uid()
    AND course_id = c.course_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment is not available' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.final_test_photo_challenges WHERE id = p_challenge_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Final test photo challenge not found' USING ERRCODE = '42501'; END IF;
  PERFORM public._assert_test_learner_access(c.lesson_id);
  IF c.session_id IS NULL AND c.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Final test photo expired' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public._final_test_photo_object_valid(c.id) THEN
    RAISE EXCEPTION 'Final test photo upload not found or invalid' USING ERRCODE = 'P0001';
  END IF;
  IF c.completed_at IS NULL THEN
    SELECT id INTO STRICT v_object FROM storage.objects
      WHERE bucket_id = 'final-test-photos' AND name = c.object_path;
    UPDATE public.final_test_photo_challenges SET storage_object_id = v_object,
      completed_at = clock_timestamp() WHERE id = c.id;
  END IF;
  RETURN jsonb_build_object('required', true, 'challengeId', c.id, 'completed', true, 'expiresAt', c.expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public._final_test_photo_required(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._final_test_photo_object_valid(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_upload_final_test_photo(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_final_test_photo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_upload_final_test_photo(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_final_test_photo(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_final_test_photo(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_final_test_photo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_final_test_photo(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_final_test_photo(uuid) TO authenticated, service_role;

-- Replacements below retain attempt quotas, locking, manual credits, grading,
-- idempotency and question snapshots from 20260907120000_test_attempt_sessions.

CREATE OR REPLACE FUNCTION public.get_test_attempt_photo(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_session uuid; v_lesson uuid; v_user uuid; v_photo jsonb;
BEGIN
  SELECT id, lesson_id, user_id INTO v_session, v_lesson, v_user
    FROM public.test_attempt_sessions WHERE id = p_attempt_id;
  IF NOT FOUND THEN
    SELECT session_id, lesson_id, user_id INTO v_session, v_lesson, v_user
      FROM public.test_attempts WHERE id = p_attempt_id;
  END IF;
  IF v_user IS NULL OR auth.uid() IS NULL
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND blocked_at IS NOT NULL)
    OR NOT (v_user = auth.uid() OR public.can_access_lesson(v_lesson, 'students.read')) THEN
    RAISE EXCEPTION 'Attempt photo not available' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('bucket', 'final-test-photos', 'path', c.object_path,
    'capturedAt', c.completed_at, 'challengeId', c.id) INTO v_photo
    FROM public.final_test_photo_challenges c WHERE c.session_id = v_session;
  RETURN v_photo;
END;
$$;
REVOKE ALL ON FUNCTION public.get_test_attempt_photo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_test_attempt_photo(uuid) TO authenticated, service_role;

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
  v_photo_required boolean;
  v_photo_id uuid;
  v_started_at timestamptz;
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
  -- Use one reservation timestamp for expiry and the session. Crossing the
  -- expiry boundary between SELECT and INSERT must not consume an invalid slot.
  v_started_at := clock_timestamp();
  v_photo_required := public._final_test_photo_required(p_lesson_id);
  IF v_photo_required THEN
    SELECT c.id INTO v_photo_id FROM public.final_test_photo_challenges c
      JOIN public.enrollments e ON e.id = c.enrollment_id AND e.user_id = v_user AND e.course_id = c.course_id
      WHERE c.user_id = v_user AND c.lesson_id = p_lesson_id AND c.request_id = p_request_id
        AND c.completed_at IS NOT NULL AND c.expires_at > v_started_at AND c.session_id IS NULL
        AND public._final_test_photo_object_valid(c.id)
      FOR UPDATE OF c;
    IF v_photo_id IS NULL THEN
      RAISE EXCEPTION 'Final test photo required' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.test_attempt_sessions(user_id, lesson_id, request_id, started_at, questions_snapshot, passing_score, show_answers, requires_final_test_photo)
    VALUES (v_user, p_lesson_id, p_request_id, v_started_at, v_questions, coalesce(v_passing, 60), v_show, v_photo_required)
    RETURNING id INTO v_session;
  IF v_photo_id IS NOT NULL THEN
    UPDATE public.final_test_photo_challenges SET session_id = v_session WHERE id = v_photo_id;
  END IF;
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
  -- Expiry limits the START window, not test duration. An attached photo remains
  -- valid during a long attempt, even if the course setting is later disabled.
  IF s.requires_final_test_photo AND NOT EXISTS (
    SELECT 1 FROM public.final_test_photo_challenges c
    WHERE c.session_id = s.id AND c.user_id = s.user_id AND c.lesson_id = s.lesson_id
      AND c.request_id = s.request_id AND c.completed_at IS NOT NULL
      AND c.completed_at <= s.started_at AND s.started_at < c.expires_at
      AND public._final_test_photo_object_valid(c.id)
  ) THEN
    RAISE EXCEPTION 'Final test photo required' USING ERRCODE = 'P0001';
  END IF;
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
    'passingScore', v_passing, 'manualCredit', public._test_manual_credit(p_lesson_id),
    'photoRequired', public._final_test_photo_required(p_lesson_id));
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
$s029_exact_migration$;
BEGIN
 IF md5(replace(v_source,chr(13)||chr(10),chr(10))) <> 'c6de5bea7fc4d902b175fc50582986bb' THEN RAISE EXCEPTION 'S029 source integrity mismatch'; END IF;
 WITH required_columns(relation_name,column_name) AS (VALUES ('public.courses','id'),
 ('public.courses','organization_id'),
 ('public.courses','is_published'),
 ('public.lessons','id'),
 ('public.lessons','course_id'),
 ('public.lessons','module_id'),
 ('public.lessons','type'),
 ('public.lessons','order_index'),
 ('public.lessons','test_questions_to_show'),
 ('public.lessons','test_passing_score'),
 ('public.lessons','test_show_answers'),
 ('public.course_modules','id'),
 ('public.course_modules','course_id'),
 ('public.course_modules','order_index'),
 ('public.profiles','user_id'),
 ('public.profiles','blocked_at'),
 ('public.enrollments','id'),
 ('public.enrollments','user_id'),
 ('public.enrollments','course_id'),
 ('public.test_attempt_sessions','id'),
 ('public.test_attempt_sessions','user_id'),
 ('public.test_attempt_sessions','lesson_id'),
 ('public.test_attempt_sessions','request_id'),
 ('public.test_attempt_sessions','status'),
 ('public.test_attempt_sessions','started_at'),
 ('public.test_attempt_sessions','submitted_at'),
 ('public.test_attempt_sessions','questions_snapshot'),
 ('public.test_attempt_sessions','passing_score'),
 ('public.test_attempt_sessions','show_answers'),
 ('public.test_attempt_start_requests','user_id'),
 ('public.test_attempt_start_requests','lesson_id'),
 ('public.test_attempt_start_requests','request_id'),
 ('public.test_attempt_start_requests','session_id'),
 ('public.test_attempts','id'),
 ('public.test_attempts','user_id'),
 ('public.test_attempts','lesson_id'),
 ('public.test_attempts','session_id'),
 ('public.test_attempts','started_at'),
 ('public.test_attempts','completed_at'),
 ('public.test_attempts','score'),
 ('public.test_attempts','max_score'),
 ('public.test_attempts','answers'),
 ('public.test_attempts','shown_question_ids'),
 ('public.test_attempts','passing_score'),
 ('public.test_attempts','passed'),
 ('public.test_questions','id'),
 ('public.test_questions','lesson_id'),
 ('public.test_questions','question'),
 ('public.test_questions','options'),
 ('public.test_questions','correct_answer'),
 ('public.test_questions','order_index'),
 ('public.test_questions','explanation'),
 ('public.test_questions','image_url'),
 ('public.test_questions','is_bank_question'),
 ('public.lesson_progress','user_id'),
 ('public.lesson_progress','lesson_id'),
 ('public.lesson_progress','completed'),
 ('public.lesson_progress','completed_at'),
 ('storage.objects','id'),
 ('storage.objects','bucket_id'),
 ('storage.objects','name'),
 ('storage.objects','created_at'),
 ('storage.objects','metadata'),
 ('storage.buckets','id'),
 ('storage.buckets','name'),
 ('storage.buckets','public'),
 ('storage.buckets','file_size_limit'),
 ('storage.buckets','allowed_mime_types'),
 ('supabase_migrations.schema_migrations','version'),
 ('supabase_migrations.schema_migrations','name'),
 ('supabase_migrations.schema_migrations','statements')),
 required_functions(signature) AS (VALUES ('auth.uid()'),
 ('public.can_access_course_as_learner(uuid)'),
 ('public.can_access_lesson(uuid,text)'),
 ('public._assert_test_learner_access(uuid)'),
 ('public._test_manual_credit(uuid)'),
 ('public._test_attempt_limits(uuid,uuid)'),
 ('public._test_session_payload(uuid)'),
 ('public._test_grade_payload(uuid)'),
 ('public._test_public_questions(jsonb,boolean)'),
 ('public._test_normalize_options(jsonb,integer)')),
 expected_previous(signature,source_md5) AS (VALUES ('public.get_student_test_state(uuid)','786137528d43b748a46963d3dcb0aeef'),
 ('public.start_test_attempt(uuid,uuid)','a3e10950942b32d7ce1d25ac590a97d5'),
 ('public.submit_test_attempt(uuid,jsonb)','1a998964238fb2e2b62ec0c9e2a6ee5f')),
 new_functions(signature) AS (VALUES ('public._final_test_photo_required(uuid)'),
 ('public.can_upload_final_test_photo(text)'),
 ('public.can_read_final_test_photo(text)'),
 ('public._final_test_photo_object_valid(uuid)'),
 ('public.prepare_final_test_photo(uuid,uuid)'),
 ('public.complete_final_test_photo(uuid)'),
 ('public.get_test_attempt_photo(uuid)')),
 checks(check_name,ok) AS (
 SELECT 'required_columns', NOT EXISTS(SELECT 1 FROM required_columns r WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(r.relation_name) AND a.attname=r.column_name AND a.attnum>0 AND NOT a.attisdropped))
 UNION ALL SELECT 'required_functions',NOT EXISTS(SELECT 1 FROM required_functions WHERE to_regprocedure(signature) IS NULL)
 UNION ALL SELECT 'api_roles',NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(name) WHERE to_regrole(name) IS NULL)
 UNION ALL SELECT 'schema_create_permission',has_schema_privilege(current_user,'public','CREATE') AND has_schema_privilege(current_user,'public','USAGE') AND has_schema_privilege(current_user,'storage','USAGE')
 UNION ALL SELECT 'alter_target_ownership',NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN (to_regclass('public.courses'),to_regclass('public.test_attempt_sessions')) AND NOT pg_has_role(current_user,c.relowner,'USAGE'))
 UNION ALL SELECT 'storage_policy_capability',coalesce((SELECT pg_has_role(current_user,c.relowner,'USAGE') FROM pg_class c WHERE c.oid=to_regclass('storage.objects')),false) OR EXISTS(SELECT 1 FROM pg_settings s WHERE s.name='supautils.policy_grants' AND s.context='sighup' AND s.vartype='string' AND jsonb_typeof(s.setting::jsonb->current_user::text)='array' AND (s.setting::jsonb->current_user::text) ? 'storage.objects')
 UNION ALL SELECT 'replace_rpc_ownership',NOT EXISTS(SELECT 1 FROM expected_previous e JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) WHERE NOT pg_has_role(current_user,p.proowner,'USAGE'))
 UNION ALL SELECT 'ledger_bucket_write_permissions',has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT') AND has_table_privilege(current_user,'storage.buckets','INSERT') AND has_table_privilege(current_user,'storage.buckets','UPDATE')
 UNION ALL SELECT 'replaced_rpc_source_hashes',NOT EXISTS(SELECT 1 FROM expected_previous e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) WHERE p.oid IS NULL OR md5(replace(p.prosrc,chr(13)||chr(10),chr(10))) IS DISTINCT FROM e.source_md5)
 UNION ALL SELECT 'prior_attempt_migrations_recorded',(SELECT count(*)=2 FROM supabase_migrations.schema_migrations WHERE version IN ('20260907120000','20260907120001'))
 UNION ALL SELECT 's029_version_absent',NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260929120000')
 UNION ALL SELECT 's029_table_absent',to_regclass('public.final_test_photo_challenges') IS NULL
 UNION ALL SELECT 's029_columns_absent',NOT EXISTS(SELECT 1 FROM pg_attribute WHERE (attrelid=to_regclass('public.courses') AND attname='require_final_test_photo' OR attrelid=to_regclass('public.test_attempt_sessions') AND attname='requires_final_test_photo') AND attnum>0 AND NOT attisdropped)
 UNION ALL SELECT 's029_functions_absent',NOT EXISTS(SELECT 1 FROM new_functions WHERE to_regprocedure(signature) IS NOT NULL)
 UNION ALL SELECT 's029_bucket_absent',NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='final-test-photos')
 UNION ALL SELECT 's029_policies_absent',NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('storage.objects') AND polname LIKE 'final_test_photos%')
 UNION ALL SELECT 'storage_owner_column',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('storage.objects') AND attname IN ('owner_id','owner') AND attnum>0 AND NOT attisdropped)
 UNION ALL SELECT 'storage_rls',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('storage.objects')),false)
 UNION ALL SELECT 'learner_result_insert_denied',NOT has_table_privilege('authenticated','public.test_attempts','INSERT') AND NOT has_table_privilege('anon','public.test_attempts','INSERT')
 )
 SELECT string_agg(check_name,', ' ORDER BY check_name) INTO v_failures FROM checks WHERE ok IS DISTINCT FROM true;
 IF v_failures IS NOT NULL THEN RAISE EXCEPTION 'S029 preconditions failed: %',v_failures; END IF;
 EXECUTE v_source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
 VALUES('20260929120000','final_test_photo',ARRAY[v_source]);
END;
$s029_release$;
NOTIFY pgrst,'reload schema';
COMMIT;
