\set ON_ERROR_STOP on
-- Run only against the isolated synthetic fixture, never a hosted database.
DO $$ BEGIN
  IF current_database() <> 'sgt_cancellation_test' THEN RAISE EXCEPTION 'Isolated cancellation database required'; END IF;
END $$;
BEGIN;
DO $$ BEGIN
  IF has_function_privilege('anon','public.cancel_course_assignment(uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.cancel_course_assignment(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected RPC execute grants';
  END IF;
END $$;
CREATE FUNCTION pg_temp.expect_rejection(p_actor uuid, p_org uuid, p_error text, p_enrollment_id uuid DEFAULT 'd4000000-0000-0000-0000-000000000001') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('test.uid', p_actor::text, true);
  IF auth.uid() IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Incorrect fixture actor'; END IF;
  BEGIN
    PERFORM public.cancel_course_assignment(p_enrollment_id,p_org);
    RAISE EXCEPTION 'Unexpected cancellation';
  EXCEPTION WHEN OTHERS THEN
    IF position(p_error in SQLERRM)=0 THEN RAISE; END IF;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.enrollments WHERE id=p_enrollment_id) THEN
    RAISE EXCEPTION 'Rejected cancellation changed enrollment';
  END IF;
END $$;

-- An ordinary learner, expired staff and read-only staff cannot cancel.
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000001','assignment_forbidden');
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000005','d1000000-0000-0000-0000-000000000001','assignment_forbidden');
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000006','d1000000-0000-0000-0000-000000000001','assignment_forbidden');
-- Owning a different tenant never permits cancelling the target enrollment.
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002','assignment_not_found');
UPDATE public.profiles SET organization_id='d1000000-0000-0000-0000-000000000002' WHERE user_id='d0000000-0000-0000-0000-000000000003';
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','assignment_not_found');
UPDATE public.profiles SET organization_id='d1000000-0000-0000-0000-000000000001' WHERE user_id='d0000000-0000-0000-0000-000000000003';

DO $$ DECLARE v_col text; BEGIN
  FOREACH v_col IN ARRAY ARRAY['progress','time_spent'] LOOP
    EXECUTE format('UPDATE public.enrollments SET %I=1 WHERE id=$1',v_col) USING 'd4000000-0000-0000-0000-000000000001'::uuid;
    PERFORM pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','assignment_has_learning_history');
    EXECUTE format('UPDATE public.enrollments SET %I=0 WHERE id=$1',v_col) USING 'd4000000-0000-0000-0000-000000000001'::uuid;
  END LOOP;
END $$;
UPDATE public.enrollments SET status='completed',completed_at=now() WHERE id='d4000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','assignment_has_learning_history');
UPDATE public.enrollments SET status='active',completed_at=NULL WHERE id='d4000000-0000-0000-0000-000000000001';

DO $$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['lesson_progress','test_attempts','test_attempt_sessions'] LOOP
    EXECUTE format('INSERT INTO public.%I(user_id,lesson_id) VALUES($1,$2)',v_table)
      USING 'd0000000-0000-0000-0000-000000000003'::uuid,'d3000000-0000-0000-0000-000000000001'::uuid;
    PERFORM pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','assignment_has_learning_history');
    EXECUTE format('DELETE FROM public.%I WHERE user_id=$1',v_table) USING 'd0000000-0000-0000-0000-000000000003'::uuid;
  END LOOP;
END $$;
INSERT INTO public.homework_submissions(student_id,course_id) VALUES('d0000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000001');
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','assignment_has_learning_history');
DELETE FROM public.homework_submissions WHERE student_id='d0000000-0000-0000-0000-000000000003';
INSERT INTO public.course_access_log(user_id,course_id) VALUES('d0000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000001');
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','assignment_has_learning_history');
DELETE FROM public.course_access_log WHERE user_id='d0000000-0000-0000-0000-000000000003';

-- No CASCADE or SET NULL side effects: all nine current FK families + a new
-- future relation remain attached when their enrollment is not cancellable.
DO $$ DECLARE v_table text; v_count integer; BEGIN
  FOREACH v_table IN ARRAY ARRAY['labor_safety_enrollment_protocols','student_documents','student_consents','video_identifications','document_issuance_log','course_reminders','course_manual_credits','final_test_photo_challenges','cancellation_qa_future_records'] LOOP
    EXECUTE format('INSERT INTO public.%I(enrollment_id) VALUES($1)',v_table) USING 'd4000000-0000-0000-0000-000000000001'::uuid;
    PERFORM pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','assignment_has_dependent_records');
    EXECUTE format('SELECT count(*) FROM public.%I WHERE enrollment_id=$1',v_table) INTO v_count USING 'd4000000-0000-0000-0000-000000000001'::uuid;
    IF v_count<>1 THEN RAISE EXCEPTION 'Dependent record changed in %',v_table; END IF;
    EXECUTE format('DELETE FROM public.%I WHERE enrollment_id=$1',v_table) USING 'd4000000-0000-0000-0000-000000000001'::uuid;
  END LOOP;
END $$;
INSERT INTO public.education_document_records(id,organization_id,user_id,course_id,enrollment_id,reg_number,document_number,full_name,document_type,issue_date,specialty_name)
  VALUES(gen_random_uuid(),'d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003','d2000000-0000-0000-0000-000000000001',NULL,'QA','QA','QA','QA',current_date,'QA');
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','assignment_has_dependent_records');
DELETE FROM public.education_document_records WHERE user_id='d0000000-0000-0000-0000-000000000003';
INSERT INTO public.education_document_records(id,organization_id,user_id,course_id,enrollment_id,reg_number,document_number,full_name,document_type,issue_date,specialty_name)
  VALUES(gen_random_uuid(),'d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003',NULL,'d4000000-0000-0000-0000-000000000001','QA-FK','QA-FK','QA','QA',current_date,'QA');
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','assignment_has_dependent_records');
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.education_document_records WHERE reg_number='QA-FK' AND enrollment_id='d4000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Document enrollment link changed'; END IF;
END $$;
DELETE FROM public.education_document_records WHERE reg_number='QA-FK';

-- Existing BEFORE DELETE triggers that suppress deletion must produce a failure.
CREATE FUNCTION pg_temp.suppress_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
CREATE TRIGGER cancellation_qa_suppress BEFORE DELETE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION pg_temp.suppress_cancellation();
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','assignment_verification_failed');
DROP TRIGGER cancellation_qa_suppress ON public.enrollments;
CREATE FUNCTION pg_temp.reinsert_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO public.enrollments SELECT OLD.*; RETURN OLD;
END $$;
CREATE TRIGGER cancellation_qa_reinsert AFTER DELETE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION pg_temp.reinsert_cancellation();
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','assignment_verification_failed');
DROP TRIGGER cancellation_qa_reinsert ON public.enrollments;

-- Preserve the exact protected-course trigger; it is not disabled or bypassed.
SELECT pg_temp.expect_rejection('d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','S022: protected enrollment/history cannot be deleted','d4000000-0000-0000-0000-000000000002');

-- Active students.write staff can cancel an untouched assignment and the
-- existing AFTER DELETE enrollment history records the actor and exact ID.
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM set_config('test.uid','d0000000-0000-0000-0000-000000000004',true);
  v_result:=public.cancel_course_assignment('d4000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001');
  IF v_result->>'cancelled'<>'true' OR v_result->>'enrollmentId'<>'d4000000-0000-0000-0000-000000000001'
    OR v_result->>'organizationId'<>'d1000000-0000-0000-0000-000000000001'
    OR EXISTS(SELECT 1 FROM public.enrollments WHERE id='d4000000-0000-0000-0000-000000000001')
    OR NOT EXISTS(SELECT 1 FROM public.enrollment_history WHERE enrollment_id='d4000000-0000-0000-0000-000000000001' AND action='unenrolled' AND performed_by='d0000000-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'Cancellation/history evidence mismatch';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: isolated permission/tenant/progress/history/dependency/trigger/cancellation checks' AS result;
