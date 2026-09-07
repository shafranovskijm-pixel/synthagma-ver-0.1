\set ON_ERROR_STOP on
-- Run after test_attempts_fixture.sql and both 2026090712000* migrations.
BEGIN;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT public.manual_complete_course(
 (SELECT id FROM public.enrollments WHERE user_id='20000000-0000-0000-0000-000000000001'),
 '10000000-0000-0000-0000-000000000001');
SELECT public.test_assert((SELECT status='completed' AND progress=100 FROM public.enrollments WHERE user_id='20000000-0000-0000-0000-000000000001'), 'offline credit completes enrollment');
SELECT public.test_assert((SELECT completed FROM public.lesson_progress WHERE user_id='20000000-0000-0000-0000-000000000001' AND lesson_id='40000000-0000-0000-0000-000000000001'), 'offline credit completes course lesson progress');
SELECT public.test_assert((SELECT result_status='passed' AND tests_attempted=0 AND tests_passed=1
 AND latest_score IS NULL AND test_details->0->'score'='null'::jsonb AND test_details->0->>'attempts_used'='0'
 AND test_details->0->>'manual_credited_by'='20000000-0000-0000-0000-000000000003'
 FROM public.get_course_student_test_results_page('30000000-0000-0000-0000-000000000001')), 'offline pass without fabricated online attempt or score');
SELECT public.manual_complete_course(
 (SELECT id FROM public.enrollments WHERE user_id='20000000-0000-0000-0000-000000000001'),
 '10000000-0000-0000-0000-000000000001');
SELECT public.test_assert((SELECT count(*)=1 FROM public.course_manual_credits), 'duplicate offline credit is idempotent and keeps original actor/date');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT public.test_assert(public.get_student_test_state('40000000-0000-0000-0000-000000000001')->'manualCredit'->>'creditedBy'='20000000-0000-0000-0000-000000000003', 'learner sees explicit manual credit');
DO $$ BEGIN
  BEGIN
    PERFORM public.start_test_attempt('40000000-0000-0000-0000-000000000001',gen_random_uuid());
    RAISE EXCEPTION 'FAIL: manually credited test allowed new online attempt';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.manual_complete_course((SELECT id FROM public.enrollments WHERE user_id=auth.uid()),'10000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'FAIL: student self-credit allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.course_manual_credits(enrollment_id,credited_by)
      SELECT id,auth.uid() FROM public.enrollments WHERE user_id=auth.uid();
    RAISE EXCEPTION 'FAIL: direct credit forgery allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',true);
SELECT public.test_assert((SELECT count(*)=0 FROM public.course_manual_credits), 'other organization cannot read credit');
DO $$ BEGIN
  BEGIN
    PERFORM public.manual_complete_course((SELECT id FROM public.enrollments WHERE user_id='20000000-0000-0000-0000-000000000001'),'10000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'FAIL: cross tenant credit allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
  BEGIN
    PERFORM public.manual_complete_course((SELECT id FROM public.enrollments WHERE user_id='20000000-0000-0000-0000-000000000001'),'10000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'FAIL: mismatching organization context allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE public.enrollments SET status='active',progress=0,completed_at=NULL WHERE user_id='20000000-0000-0000-0000-000000000001';
SELECT public.test_assert((SELECT revoked_at IS NOT NULL FROM public.course_manual_credits), 'reset revokes credit but retains audit record');
SELECT public.test_assert((SELECT result_status='not_started' AND tests_passed=0 FROM public.get_course_student_test_results_page('30000000-0000-0000-0000-000000000001')), 'reset removes manual passed result');
RESET ROLE;
INSERT INTO public.test_attempts(user_id,lesson_id,score,max_score,answers,passing_score,passed)
VALUES ('20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,10,'{"original-answer":1}',70,false);
SET LOCAL ROLE authenticated;
SELECT public.manual_complete_course(
 (SELECT id FROM public.enrollments WHERE user_id='20000000-0000-0000-0000-000000000001'),
 '10000000-0000-0000-0000-000000000001');
SELECT public.test_assert((SELECT result_status='passed' AND tests_attempted=1 AND latest_score=1 AND latest_percent=10 AND attempts_used=1 AND tests_passed=1
 FROM public.get_course_student_test_results_page('30000000-0000-0000-0000-000000000001')), 'offline credit overrides failed status while preserving actual online score and count');
RESET ROLE;
SELECT public.test_assert((SELECT count(*)=1 AND bool_and(answers='{"original-answer":1}'::jsonb) FROM public.test_attempts WHERE user_id='20000000-0000-0000-0000-000000000001'), 'offline credit preserves original answers and creates no attempts');
SET LOCAL ROLE authenticated;
UPDATE public.enrollments SET status='active',progress=0 WHERE user_id='20000000-0000-0000-0000-000000000001';
SELECT public.test_assert((SELECT result_status='failed' FROM public.get_course_student_test_results_page('30000000-0000-0000-0000-000000000001')), 'revocation restores real failed test result');
RESET ROLE;
UPDATE public.test_attempts SET score=8,passed=true WHERE user_id='20000000-0000-0000-0000-000000000001';
UPDATE public.lessons SET test_passing_score=90 WHERE id='40000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.test_assert((SELECT result_status='passed' AND latest_passing_score=70 FROM public.get_course_student_test_results_page('30000000-0000-0000-0000-000000000001')), 'saved pass and threshold survive later editor threshold changes');
-- Learning reset is atomic and preserves test evidence and recovery semantics.
SELECT public.manual_complete_course(
 (SELECT id FROM public.enrollments WHERE user_id='20000000-0000-0000-0000-000000000001'),
 '10000000-0000-0000-0000-000000000001');
RESET ROLE;
CREATE FUNCTION public.test_reject_learning_reset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'simulated reset failure' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER test_reject_learning_reset BEFORE DELETE ON public.lesson_progress FOR EACH ROW EXECUTE FUNCTION public.test_reject_learning_reset();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.reset_course_learning_progress((SELECT id FROM public.enrollments WHERE user_id='20000000-0000-0000-0000-000000000001'),'10000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'FAIL: reset unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT public.test_assert((SELECT status='completed' AND progress=100 FROM public.enrollments WHERE user_id='20000000-0000-0000-0000-000000000001')
 AND (SELECT count(*)=1 FROM public.course_manual_credits WHERE revoked_at IS NULL), 'failed learning reset rolls back and preserves active credit');
RESET ROLE;
DROP TRIGGER test_reject_learning_reset ON public.lesson_progress;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.reset_course_learning_progress((SELECT id FROM public.enrollments WHERE user_id='20000000-0000-0000-0000-000000000001'),'10000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'FAIL: reset accepted mismatching organization';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.reset_course_learning_progress(
 (SELECT id FROM public.enrollments WHERE user_id='20000000-0000-0000-0000-000000000001'),
 '10000000-0000-0000-0000-000000000001');
SELECT public.test_assert((SELECT count(*)=0 FROM public.course_manual_credits WHERE revoked_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public.lesson_progress WHERE user_id='20000000-0000-0000-0000-000000000001'), 'successful reset removes progress and revokes only active credit');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
SELECT public.test_assert((SELECT count(*)=1 FROM public.test_attempts WHERE user_id=auth.uid())
 AND public.get_student_test_state('40000000-0000-0000-0000-000000000001')->>'attemptsUsed'='1', 'learning reset preserves attempt history and consumed quotas');
SELECT public.test_assert(public.complete_own_course_enrollment((SELECT id FROM public.enrollments WHERE user_id=auth.uid()))->>'status'='completed',
 'completion recovery honors saved passed result despite a higher current threshold');
ROLLBACK;
