BEGIN;
CREATE FUNCTION public.test_expect_error(p_sql text, p_code text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught boolean := false;
BEGIN
  BEGIN EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    caught := true;
    IF SQLSTATE <> p_code OR (p_message IS NOT NULL AND position(p_message IN SQLERRM) = 0) THEN
      RAISE EXCEPTION 'Wrong error: % %', SQLSTATE, SQLERRM;
    END IF;
  END;
  PERFORM public.test_assert(caught, 'denied: ' || coalesce(p_message, p_code));
END;
$$;
CREATE FUNCTION public.photo_test_value(p_key text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT current_setting('photo_test.' || p_key)::jsonb
$$;

SELECT public.test_assert((SELECT bool_and(NOT require_final_test_photo) FROM public.courses), 'existing courses default off');
SELECT public.test_assert((SELECT NOT public AND file_size_limit = 5242880 AND allowed_mime_types = ARRAY['image/jpeg']
  FROM storage.buckets WHERE id = 'final-test-photos'), 'private bucket restricts MIME and size');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);
SELECT public.test_assert(public.get_student_test_state('40000000-0000-0000-0000-000000000001')->>'photoRequired' = 'false', 'disabled course has no photo requirement');
SELECT public.test_assert(public.prepare_final_test_photo('40000000-0000-0000-0000-000000000001', gen_random_uuid()) = '{"required":false}', 'disabled prepare creates no challenge');
SELECT set_config('photo_test.old', public.start_test_attempt('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001')::text, false);
RESET ROLE;
UPDATE public.courses SET require_final_test_photo = true WHERE id = '30000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_assert(public.get_student_test_state('40000000-0000-0000-0000-000000000001')->>'photoRequired' = 'true', 'enabled course exposes current rule');
SELECT public.test_assert(public.start_test_attempt('40000000-0000-0000-0000-000000000001', gen_random_uuid())->>'attemptId' = public.photo_test_value('old')->>'attemptId', 'pre-toggle session resumes without photo');
SELECT public.test_assert(public.prepare_final_test_photo('40000000-0000-0000-0000-000000000001', gen_random_uuid()) = '{"required":false}', 'active session needs no second photograph');
SELECT public.test_assert(public.submit_test_attempt((public.photo_test_value('old')->>'attemptId')::uuid, '{}')->>'score' = '0', 'pre-toggle session submits under snapshot rule');
SELECT public.test_assert(public.get_test_attempt_photo((public.photo_test_value('old')->>'attemptId')::uuid) IS NULL, 'pre-feature session has no photo');
SELECT public.test_expect_error($q$SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001', gen_random_uuid())$q$, 'P0001', 'Final test photo required');
SELECT public.test_assert(public.get_student_test_state('40000000-0000-0000-0000-000000000001')->>'attemptsUsed' = '1', 'denied start consumes no attempt');
RESET ROLE;
INSERT INTO public.video_identifications(user_id, enrollment_id, status, photo_url)
 SELECT user_id, id, 'verified', 'https://example.invalid/old-course-photo.jpg' FROM public.enrollments
 WHERE user_id = '20000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_expect_error($q$SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001', gen_random_uuid())$q$, 'P0001', 'Final test photo required');
RESET ROLE;

-- Final test is the last test in module order, not the highest flat lesson index.
INSERT INTO public.course_modules(id, course_id, order_index) VALUES
 ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1),
 ('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 2);
UPDATE public.lessons SET module_id = '70000000-0000-0000-0000-000000000002', order_index = 0
 WHERE id = '40000000-0000-0000-0000-000000000001';
INSERT INTO public.lessons(id, course_id, title, type, module_id, order_index) VALUES
 ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Earlier module test', 'test', '70000000-0000-0000-0000-000000000001', 100);
INSERT INTO public.test_questions(id, lesson_id, question, options, correct_answer) VALUES
 ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000003', 'Earlier test', '["A","B"]', 0);
SELECT public.test_assert(public._final_test_photo_required('40000000-0000-0000-0000-000000000001') AND NOT public._final_test_photo_required('40000000-0000-0000-0000-000000000003'), 'module order overrides flat lesson indexes');
INSERT INTO public.lessons(id, course_id, title, type, order_index) VALUES
 ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'Unassigned final', 'test', -1);
SELECT public.test_assert(public._final_test_photo_required('40000000-0000-0000-0000-000000000004') AND NOT public._final_test_photo_required('40000000-0000-0000-0000-000000000001'), 'unassigned test follows all known modules');
DELETE FROM public.lessons WHERE id = '40000000-0000-0000-0000-000000000004';
SET ROLE authenticated;
SELECT public.test_assert(public.prepare_final_test_photo('40000000-0000-0000-0000-000000000003', gen_random_uuid()) = '{"required":false}', 'non-final test does not require camera');
SELECT set_config('photo_test.intermediate', public.start_test_attempt('40000000-0000-0000-0000-000000000003', gen_random_uuid())::text, false);
SELECT public.test_assert(public.submit_test_attempt((public.photo_test_value('intermediate')->>'attemptId')::uuid, '{}')->>'score' = '0', 'non-final test starts and submits without photo');

SELECT set_config('photo_test.abandoned', public.prepare_final_test_photo('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000005')::text, false);
INSERT INTO storage.objects(bucket_id, name, owner_id, metadata)
 VALUES ('final-test-photos', public.photo_test_value('abandoned')->>'path', auth.uid()::text, '{"size":1000,"mimetype":"image/jpeg"}');
SELECT set_config('photo_test.renewed', public.prepare_final_test_photo('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000005')::text, false);
SELECT public.test_assert(public.photo_test_value('renewed')->>'path' <> public.photo_test_value('abandoned')->>'path', 'reopening after incomplete upload receives fresh path for new preview');
SELECT public.test_expect_error('SELECT public.complete_final_test_photo(''' || (public.photo_test_value('abandoned')->>'challengeId') || ''')', '42501', 'challenge not found');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM storage.objects WHERE name = public.photo_test_value('abandoned')->>'path'), 'orphan upload cannot be read or reused by learner');

SELECT set_config('photo_test.first', public.prepare_final_test_photo('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002')::text, false);
SELECT public.test_assert(public.photo_test_value('first') @> '{"required":true,"completed":false,"bucket":"final-test-photos"}', 'prepare returns new server-owned challenge');
SELECT set_config('photo_test.first_renewed', public.prepare_final_test_photo('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002')::text, false);
SELECT public.test_assert(public.photo_test_value('first_renewed')->>'challengeId' <> public.photo_test_value('first')->>'challengeId', 'reopening before upload also rotates incomplete challenge to isolate in-flight upload');
SELECT public.test_expect_error('INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES (''final-test-photos'',''' || (public.photo_test_value('first')->>'path') || ''',auth.uid()::text,''{"size":200,"mimetype":"image/jpeg"}'')', '42501');
SELECT set_config('photo_test.first', public.photo_test_value('first_renewed')::text, false);
SELECT public.test_expect_error('SELECT public.complete_final_test_photo(''' || (public.photo_test_value('first')->>'challengeId') || ''')', 'P0001', 'upload not found or invalid');
SELECT public.test_expect_error('SELECT * FROM public.final_test_photo_challenges', '42501');
SELECT public.test_expect_error('UPDATE public.final_test_photo_challenges SET completed_at=now()', '42501');
SELECT public.test_expect_error('SELECT public._final_test_photo_object_valid(''' || (public.photo_test_value('first')->>'challengeId') || ''')', '42501');
SELECT public.test_expect_error($q$INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES ('final-test-photos','arbitrary/capture.jpg',auth.uid()::text,'{"size":200,"mimetype":"image/jpeg"}')$q$, '42501');
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', false);
SELECT public.test_expect_error('SELECT public.complete_final_test_photo(''' || (public.photo_test_value('first')->>'challengeId') || ''')', '42501', 'challenge not found');
SELECT public.test_expect_error('INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES (''final-test-photos'',''' || (public.photo_test_value('first')->>'path') || ''',auth.uid()::text,''{"size":200,"mimetype":"image/jpeg"}'')', '42501');
SELECT public.test_expect_error($q$SELECT public.prepare_final_test_photo('40000000-0000-0000-0000-000000000001',gen_random_uuid())$q$, '42501');
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);

-- Upload metadata is produced by Storage; this fixture checks the same row RLS.
INSERT INTO storage.objects(bucket_id, name, owner_id, metadata)
 VALUES ('final-test-photos', public.photo_test_value('first')->>'path', auth.uid()::text, '{"size":1000,"mimetype":"image/jpeg"}');
SELECT public.test_assert((SELECT count(*) = 1 FROM storage.objects WHERE bucket_id = 'final-test-photos'), 'owner reads own private object');
WITH updated AS (UPDATE storage.objects SET metadata = '{"size":100}' WHERE bucket_id = 'final-test-photos' RETURNING *)
 SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM updated), 'even broad legacy policy cannot overwrite photo');
WITH deleted AS (DELETE FROM storage.objects WHERE bucket_id = 'final-test-photos' RETURNING *)
 SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM deleted), 'learner cannot delete evidence');
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', false);
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id = 'final-test-photos'), 'another tenant cannot read private evidence');
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id = 'final-test-photos'), 'anonymous legacy public policy cannot expose evidence');
SELECT public.test_expect_error($q$SELECT public.prepare_final_test_photo('40000000-0000-0000-0000-000000000001',gen_random_uuid())$q$, '42501');
RESET ROLE;

-- Administrative corruption fixtures exercise independent server validation.
UPDATE storage.objects SET metadata = '{"size":1000,"mimetype":"video/mp4"}' WHERE name = public.photo_test_value('first')->>'path';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);
SELECT public.test_expect_error('SELECT public.complete_final_test_photo(''' || (public.photo_test_value('first')->>'challengeId') || ''')', 'P0001', 'upload not found or invalid');
RESET ROLE;
UPDATE storage.objects SET metadata = '{"size":5242881,"mimetype":"image/jpeg"}' WHERE name = public.photo_test_value('first')->>'path';
SET ROLE authenticated;
SELECT public.test_expect_error('SELECT public.complete_final_test_photo(''' || (public.photo_test_value('first')->>'challengeId') || ''')', 'P0001', 'upload not found or invalid');
RESET ROLE;
UPDATE storage.objects SET metadata = '{"size":1000,"mimetype":"image/jpeg"}', owner_id = '20000000-0000-0000-0000-000000000002'
 WHERE name = public.photo_test_value('first')->>'path';
SET ROLE authenticated;
SELECT public.test_expect_error('SELECT public.complete_final_test_photo(''' || (public.photo_test_value('first')->>'challengeId') || ''')', 'P0001', 'upload not found or invalid');
RESET ROLE;
UPDATE storage.objects SET owner_id = '20000000-0000-0000-0000-000000000001', created_at = clock_timestamp() - interval '1 day'
 WHERE name = public.photo_test_value('first')->>'path';
SET ROLE authenticated;
SELECT public.test_expect_error('SELECT public.complete_final_test_photo(''' || (public.photo_test_value('first')->>'challengeId') || ''')', 'P0001', 'upload not found or invalid');
RESET ROLE;
UPDATE storage.objects SET created_at = clock_timestamp() WHERE name = public.photo_test_value('first')->>'path';
UPDATE public.enrollments SET status = 'revoked' WHERE user_id = '20000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_expect_error('SELECT public.complete_final_test_photo(''' || (public.photo_test_value('first')->>'challengeId') || ''')', '42501', 'not available');
RESET ROLE;
UPDATE public.enrollments SET status = 'active' WHERE user_id = '20000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_assert(public.complete_final_test_photo((public.photo_test_value('first')->>'challengeId')::uuid)->>'completed' = 'true', 'valid owned JPEG upload completes challenge');
SELECT public.test_assert(public.complete_final_test_photo((public.photo_test_value('first')->>'challengeId')::uuid)->>'completed' = 'true', 'completion retry is idempotent');
SELECT public.test_assert(public.prepare_final_test_photo('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002')->>'challengeId' = public.photo_test_value('first')->>'challengeId', 'completed challenge prepare is idempotent and preserves accepted photo');
SELECT public.test_assert(public.get_student_test_state('40000000-0000-0000-0000-000000000001')->>'attemptsUsed' = '1', 'camera preparation and completion do not spend quota');
SELECT public.test_expect_error($q$SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001', gen_random_uuid())$q$, 'P0001', 'Final test photo required');
SELECT set_config('photo_test.attempt', public.start_test_attempt('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002')::text, false);
SELECT public.test_assert(public.start_test_attempt('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003')->>'attemptId' = public.photo_test_value('attempt')->>'attemptId', 'second tab resumes same photographed session');
SELECT public.test_assert(public.get_student_test_state('40000000-0000-0000-0000-000000000001')->>'attemptsUsed' = '2', 'new photographed attempt spends exactly one slot');
SELECT public.test_assert(public.get_test_attempt_photo((public.photo_test_value('attempt')->>'attemptId')::uuid)->>'path' = public.photo_test_value('first')->>'path', 'learner can find attached evidence by session id');
RESET ROLE;
SELECT public.test_assert((SELECT requires_final_test_photo FROM public.test_attempt_sessions WHERE id = (public.photo_test_value('attempt')->>'attemptId')::uuid), 'new attempt snapshots requirement');
SELECT public.test_assert((SELECT session_id = (public.photo_test_value('attempt')->>'attemptId')::uuid FROM public.final_test_photo_challenges WHERE id = (public.photo_test_value('first')->>'challengeId')::uuid), 'photo attaches atomically to attempt');
-- Removing the attachment simulates an invalid/bypassed session; submission fails.
UPDATE public.final_test_photo_challenges SET session_id = NULL WHERE id = (public.photo_test_value('first')->>'challengeId')::uuid;
SET ROLE authenticated;
SELECT public.test_expect_error('SELECT public.submit_test_attempt(''' || (public.photo_test_value('attempt')->>'attemptId') || ''',''{}'')', 'P0001', 'Final test photo required');
RESET ROLE;
UPDATE public.final_test_photo_challenges SET session_id = (public.photo_test_value('attempt')->>'attemptId')::uuid WHERE id = (public.photo_test_value('first')->>'challengeId')::uuid;
-- Move the complete timeline back together: photo expiry must not limit test duration.
UPDATE public.final_test_photo_challenges SET created_at = created_at - interval '1 hour', completed_at = completed_at - interval '1 hour', expires_at = expires_at - interval '1 hour' WHERE id = (public.photo_test_value('first')->>'challengeId')::uuid;
UPDATE storage.objects SET created_at = created_at - interval '1 hour' WHERE name = public.photo_test_value('first')->>'path';
UPDATE public.test_attempt_sessions SET started_at = started_at - interval '1 hour' WHERE id = (public.photo_test_value('attempt')->>'attemptId')::uuid;
UPDATE public.courses SET require_final_test_photo = false WHERE id = '30000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_assert(public.submit_test_attempt((public.photo_test_value('attempt')->>'attemptId')::uuid, '{}')->>'score' = '0', 'long session submits with attached photo after expiry and setting change');
SELECT public.test_assert(public.submit_test_attempt((public.photo_test_value('attempt')->>'attemptId')::uuid, '{"50000000-0000-0000-0000-000000000001":0}')->>'score' = '0', 'submission retry preserves original grade');
SELECT public.test_assert(public.start_test_attempt('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003')->>'attemptId' = public.photo_test_value('attempt')->>'attemptId', 'late resume request still returns original completed attempt');
SELECT set_config('photo_test.completed', to_jsonb(id)::text, false) FROM public.test_attempts WHERE session_id = (public.photo_test_value('attempt')->>'attemptId')::uuid;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', false);
SELECT public.test_assert(public.get_test_attempt_photo((public.photo_test_value('completed') #>> '{}')::uuid)->>'path' = public.photo_test_value('first')->>'path', 'own-tenant staff reads photo by completed attempt id');
SELECT public.test_assert(EXISTS(SELECT 1 FROM storage.objects WHERE name = public.photo_test_value('first')->>'path'), 'authorized staff can request a signed URL for evidence');
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000004', false);
SELECT public.test_expect_error('SELECT public.get_test_attempt_photo(''' || (public.photo_test_value('completed') #>> '{}') || ''')', '42501', 'not available');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM storage.objects WHERE name = public.photo_test_value('first')->>'path'), 'foreign-tenant staff cannot sign or read photo');
RESET ROLE;
UPDATE public.courses SET require_final_test_photo = true WHERE id = '30000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);
SELECT public.test_expect_error($q$SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001', gen_random_uuid())$q$, 'P0001', 'Final test photo required');
SELECT set_config('photo_test.expired', public.prepare_final_test_photo('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004')::text, false);
RESET ROLE;
UPDATE public.final_test_photo_challenges SET created_at = clock_timestamp() - interval '30 minutes', expires_at = clock_timestamp() - interval '10 minutes'
 WHERE id = (public.photo_test_value('expired')->>'challengeId')::uuid;
SET ROLE authenticated;
SELECT public.test_expect_error('SELECT public.complete_final_test_photo(''' || (public.photo_test_value('expired')->>'challengeId') || ''')', 'P0001', 'Final test photo expired');
SELECT public.test_assert(public.prepare_final_test_photo('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004')->>'challengeId' <> public.photo_test_value('expired')->>'challengeId', 'expired prepare creates a fresh path for the same request');
SELECT public.test_expect_error('INSERT INTO public.test_attempts(user_id,lesson_id,score,max_score) VALUES(auth.uid(),''40000000-0000-0000-0000-000000000001'',1,1)', '42501');
SELECT public.test_expect_error('UPDATE public.test_attempt_sessions SET requires_final_test_photo=false', '42501');
RESET ROLE;
UPDATE public.lessons SET test_max_attempts = 2 WHERE id = '40000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_expect_error($q$SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001', gen_random_uuid())$q$, 'P0001', 'Attempts exhausted');
RESET ROLE;
UPDATE public.lessons SET test_max_attempts = NULL, test_max_attempts_per_day = 2 WHERE id = '40000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_expect_error($q$SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001', gen_random_uuid())$q$, 'P0001', 'Daily attempts exhausted');
SELECT public.test_assert(public.get_student_test_state('40000000-0000-0000-0000-000000000001')->>'attemptsUsed' = '2', 'quota denials and expired challenges add no sessions');
RESET ROLE;
INSERT INTO public.course_manual_credits(enrollment_id, credited_by)
 SELECT id, '20000000-0000-0000-0000-000000000003' FROM public.enrollments WHERE user_id = '20000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_assert(public.get_student_test_state('40000000-0000-0000-0000-000000000001')->'manualCredit' <> 'null', 'manual credit remains visible');
SELECT public.test_assert(public.prepare_final_test_photo('40000000-0000-0000-0000-000000000001', gen_random_uuid()) = '{"required":false}', 'manual credit requires no camera');
SELECT public.test_expect_error($q$SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001', gen_random_uuid())$q$, 'P0001', 'already credited');
RESET ROLE;
ROLLBACK;
