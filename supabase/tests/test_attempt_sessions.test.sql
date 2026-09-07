\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION public.test_expect_error(p_sql text, p_code text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught boolean := false;
BEGIN
 BEGIN EXECUTE p_sql;
 EXCEPTION WHEN OTHERS THEN
  caught := true;
  IF SQLSTATE <> p_code OR (p_message IS NOT NULL AND position(p_message IN SQLERRM)=0) THEN
    RAISE EXCEPTION 'Wrong error: % %', SQLSTATE, SQLERRM;
  END IF;
 END;
 PERFORM public.test_assert(caught, 'denied: ' || coalesce(p_message,p_code));
END;
$$;
UPDATE public.lessons SET test_max_attempts_per_day=2, test_max_attempts=3
 WHERE id='40000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT public.test_assert(
 public.get_student_test_state('40000000-0000-0000-0000-000000000001') @>
 '{"hasAttempt":false,"attemptsUsed":0,"attemptsUsedToday":0,"maxAttemptsPerDay":2,"maxAttempts":3,"dayTimezone":"Europe/Moscow"}',
 'initial state includes limits without starting a test');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.get_student_test_questions('40000000-0000-0000-0000-000000000001') WHERE explanation IS NOT NULL), 'legacy question endpoint hides explanation hints from learners');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',false);
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.get_student_test_questions('40000000-0000-0000-0000-000000000001') WHERE explanation='Original explanation'), 'authorized staff preview retains explanations');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001')->>'attemptId' AS attempt1 \gset
SELECT public.test_assert(public.start_test_attempt('40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002')->>'attemptId'=:'attempt1',
 'another tab resumes existing attempt');
SELECT public.test_assert(public.start_test_attempt('40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001')->>'attemptId'=:'attempt1',
 'replayed start request is idempotent');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_student_test_state('40000000-0000-0000-0000-000000000001')->'activeAttempt'->'questions') q WHERE q ? 'correct_answer' OR q ? 'explanation'),
 'active session masks answer keys and explanations');
SELECT public.test_assert((public.get_student_test_state('40000000-0000-0000-0000-000000000001')->>'attemptsUsed')::int=1,
 'resuming consumes no extra attempt');
SELECT public.test_expect_error('SELECT * FROM public.test_attempt_sessions','42501');
SELECT public.test_expect_error('SELECT * FROM public.test_attempt_start_requests','42501');
SELECT public.test_expect_error('SELECT public._test_session_payload(''' || :'attempt1' || ''')','42501');
SELECT public.test_expect_error('SELECT public.start_test_attempt(''40000000-0000-0000-0000-000000000002'',gen_random_uuid())','42501');
SELECT public.test_expect_error('SELECT public.submit_test_attempt(''' || :'attempt1' || ''',''{"50000000-0000-0000-0000-000000000003":0}'')','22023','valid option');
SELECT public.test_expect_error('SELECT public.submit_test_attempt(''' || :'attempt1' || ''',''{"50000000-0000-0000-0000-000000000001":10}'')','22023','valid option');
SELECT public.test_expect_error('INSERT INTO public.test_attempts(user_id,lesson_id,score,max_score) VALUES (auth.uid(),''40000000-0000-0000-0000-000000000001'',100,100)','42501');
RESET ROLE;
UPDATE public.test_questions SET question='Changed after start',correct_answer=1,explanation='Changed explanation'
 WHERE id='50000000-0000-0000-0000-000000000001';
UPDATE public.lessons SET test_passing_score=100 WHERE id='40000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_assert(public.submit_test_attempt(:'attempt1',
 '{"50000000-0000-0000-0000-000000000001":0,"50000000-0000-0000-0000-000000000002":1}') @>
 '{"score":2,"maxScore":2,"passed":true,"passingScore":60,"attemptsUsed":1}',
 'grading uses question and threshold snapshot even when course changes');
SELECT public.test_assert(public.submit_test_attempt(:'attempt1','{}') @>
 '{"score":2,"maxScore":2,"passed":true,"attemptsUsed":1}', 'retry returns original grade, ignoring altered resubmission');
SELECT public.test_assert(public.start_test_attempt('40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002')->>'attemptId'=:'attempt1', 'late retry of a resume request returns the same completed session');
SELECT public.test_assert((SELECT count(*) FROM public.test_attempts)=1,'one completed record for repeated submission');
SELECT public.test_assert((public.get_student_test_state('40000000-0000-0000-0000-000000000001')->'correctAnswers'->>'50000000-0000-0000-0000-000000000001')='0',
 'review uses original correct answer');
SELECT public.test_expect_error('DELETE FROM public.test_attempts','42501');
SELECT public.test_expect_error('UPDATE public.test_attempts SET score=0','42501');
RESET ROLE;
SELECT public.test_assert((SELECT completed FROM public.lesson_progress WHERE user_id='20000000-0000-0000-0000-000000000001' AND lesson_id='40000000-0000-0000-0000-000000000001'),
 'passed attempt commits lesson progress');
DELETE FROM public.test_questions WHERE id='50000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_test_attempt_history('40000000-0000-0000-0000-000000000001')->0->'questions') q
 WHERE q->>'question'='Original question' AND q->>'correct_answer'='0'),'deleted questions remain in historical snapshot');
SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001',gen_random_uuid())->>'attemptId' AS attempt2 \gset
SELECT public.submit_test_attempt(:'attempt2','{}');
SELECT public.test_expect_error('SELECT public.start_test_attempt(''40000000-0000-0000-0000-000000000001'',gen_random_uuid())','P0001','Daily attempts exhausted');
RESET ROLE;
-- Place an existing start just before Moscow midnight. The server timezone is intentionally different.
SET TIME ZONE 'Pacific/Honolulu';
UPDATE public.test_attempt_sessions SET started_at=
 (date_trunc('day',clock_timestamp() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')-interval '1 millisecond'
 WHERE id=:'attempt1';
SET ROLE authenticated;
SELECT public.test_assert((public.get_student_test_state('40000000-0000-0000-0000-000000000001')->>'attemptsUsedToday')::int=1,
 'Moscow midnight boundary is independent of DB session timezone');
SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001',gen_random_uuid())->>'attemptId' AS attempt3 \gset
SELECT public.test_assert(public.start_test_attempt('40000000-0000-0000-0000-000000000001',gen_random_uuid())->>'attemptId'=:'attempt3',
 'active attempt remains resumable after quota reached');
SELECT public.submit_test_attempt(:'attempt3','{}');
SELECT public.test_expect_error('SELECT public.start_test_attempt(''40000000-0000-0000-0000-000000000001'',gen_random_uuid())','P0001','Attempts exhausted');
RESET ROLE;
UPDATE public.lessons SET test_max_attempts=null,test_max_attempts_per_day=null,test_show_answers=false WHERE id='40000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001',gen_random_uuid())->>'attemptId' AS private_attempt \gset
SELECT public.test_assert(public.submit_test_attempt(:'private_attempt','{}')->'correctAnswers'='{}'::jsonb,
 'show_answers=false hides grade feedback');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_test_attempt_history('40000000-0000-0000-0000-000000000001')) h,
 jsonb_array_elements(h->'questions') q WHERE q ? 'correct_answer'),'learner history respects current feedback restriction');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
SELECT public.test_expect_error('SELECT public.submit_test_attempt(''' || :'private_attempt' || ''',''{}'')','42501','Attempt not found');
SELECT public.test_assert(public.get_test_attempt_history(NULL,'20000000-0000-0000-0000-000000000001')='[]'::jsonb,
 'another learner cannot read history');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',false);
SELECT public.test_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_test_attempt_history(NULL,'20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')) h,
 jsonb_array_elements(h->'questions') q WHERE q ? 'correct_answer'),'authorized staff can audit hidden answer keys');
SELECT public.test_assert(public.get_test_attempt_history(NULL,'20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')='[]'::jsonb,
 'selected organization scope is honored');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',false);
SELECT public.test_assert(public.get_test_attempt_history(NULL,'20000000-0000-0000-0000-000000000001')='[]'::jsonb,
 'foreign organization staff cannot read history');
RESET ROLE;
INSERT INTO public.test_attempts(user_id,lesson_id,score,max_score,answers)
 VALUES ('20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,1,'{"old-question":0}');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT public.test_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_test_attempt_history()) h
 WHERE h @> '{"legacy":true,"started_at":null,"passing_score":null,"questions":[],"answers":{"old-question":0}}'),
 'legacy history retains answers without inventing a start or question snapshot');
SELECT public.test_assert((public.get_student_test_state('40000000-0000-0000-0000-000000000001')->>'attemptsUsed')::int=5,
 'legacy completions count once together with new sessions');
RESET ROLE;
UPDATE public.profiles SET blocked_at=now() WHERE user_id='20000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_expect_error('SELECT public.start_test_attempt(''40000000-0000-0000-0000-000000000001'',gen_random_uuid())','42501');
RESET ROLE;
UPDATE public.profiles SET blocked_at=null WHERE user_id='20000000-0000-0000-0000-000000000001';
UPDATE public.enrollments SET expires_at=now()-interval '1 day' WHERE user_id='20000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_expect_error('SELECT public.start_test_attempt(''40000000-0000-0000-0000-000000000001'',gen_random_uuid())','42501');
RESET ROLE;
UPDATE public.enrollments SET expires_at=null WHERE user_id='20000000-0000-0000-0000-000000000001';
UPDATE public.courses SET is_published=false WHERE id='30000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.test_expect_error('SELECT public.start_test_attempt(''40000000-0000-0000-0000-000000000001'',gen_random_uuid())','42501');
RESET ROLE;
UPDATE public.courses SET is_published=true WHERE id='30000000-0000-0000-0000-000000000001';
-- A failed progress write must roll back the attempt, status and score together.
CREATE FUNCTION public.test_reject_progress() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'simulated progress failure' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER test_reject_progress BEFORE INSERT OR UPDATE ON public.lesson_progress
 FOR EACH ROW EXECUTE FUNCTION public.test_reject_progress();
SET ROLE authenticated;
SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000001',gen_random_uuid())->>'attemptId' AS rollback_attempt \gset
SELECT public.test_expect_error('SELECT public.submit_test_attempt(''' || :'rollback_attempt' || ''',''{"50000000-0000-0000-0000-000000000002":1}'')','23514','simulated progress failure');
SELECT public.test_assert(public.get_student_test_state('40000000-0000-0000-0000-000000000001')->'activeAttempt'->>'attemptId'=:'rollback_attempt',
 'progress failure retains active session for safe retry');
RESET ROLE;
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.test_attempts WHERE session_id=:'rollback_attempt'),
 'progress failure leaves no partial completed attempt');
DROP TRIGGER test_reject_progress ON public.lesson_progress;
SET ROLE authenticated;
SELECT public.test_assert(public.submit_test_attempt(:'rollback_attempt','{"50000000-0000-0000-0000-000000000002":1}')->>'passed'='true',
 'same attempt succeeds after temporary persistence failure');
RESET ROLE;
ROLLBACK;