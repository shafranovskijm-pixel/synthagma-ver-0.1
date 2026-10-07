-- Run only after sgt_archive_results_setup.py in a fresh isolated database.
UPDATE profiles SET archived_at=now() WHERE user_id='30000000-0000-0000-0000-000000000002';
INSERT INTO lessons VALUES
 ('70000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Attempted test','test',1,90,3),
 ('70000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','Unstarted test','test',2,70,3);
INSERT INTO test_attempts(user_id,lesson_id,score,max_score,passed,passing_score,completed_at) VALUES
 ('30000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001',10,10,true,70,'2026-10-01'),
 ('30000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001',8,10,true,70,'2026-10-02');
INSERT INTO education_document_records(organization_id,user_id,course_id,document_number) VALUES
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','PRESERVED');
-- A preserved historical enrollment in another tenant must remain untouched.
INSERT INTO courses VALUES ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Other tenant course');
INSERT INTO enrollments(user_id,course_id,progress,status,time_spent) VALUES
 ('30000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002',100,'completed',500);
SET test.uid='30000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
DO $test$
DECLARE o uuid:='10000000-0000-0000-0000-000000000001'; s uuid:='30000000-0000-0000-0000-000000000002'; c uuid:='50000000-0000-0000-0000-000000000001'; r jsonb;
BEGIN
  r:=get_student_learning_results(o,s);
  IF jsonb_array_length(r->'courses')<>1 OR jsonb_array_length(r->'courses'->0->'tests')<>2 THEN RAISE EXCEPTION 'incomplete result summary'; END IF;
  IF (r#>>'{courses,0,tests,0,score}')::integer<>8 OR (r#>>'{courses,0,tests,0,passing_score}')::integer<>70
    OR (r#>>'{courses,0,tests,0,passed}')::boolean IS DISTINCT FROM true
    OR (r#>>'{courses,0,tests,0,attempts_used}')::integer<>2 THEN RAISE EXCEPTION 'latest saved result replaced by current threshold'; END IF;
  IF r#>>'{courses,0,tests,1,score}' IS NOT NULL OR (r#>>'{courses,0,tests,1,attempts_used}')::integer<>0 THEN RAISE EXCEPTION 'invented unstarted score'; END IF;
  BEGIN PERFORM set_archived_student_removed(o,'30000000-0000-0000-0000-000000000003',true); RAISE EXCEPTION 'active learner accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM set_archived_student_removed(o,'30000000-0000-0000-0000-000000000005',true); RAISE EXCEPTION 'foreign learner accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM get_student_learning_results(o,'30000000-0000-0000-0000-000000000005'); RAISE EXCEPTION 'foreign results exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  r:=set_archived_student_removed(o,s,true);
  IF (r->>'changed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'removal not confirmed'; END IF;
  r:=set_archived_student_removed(o,s,true);
  IF (r->>'changed')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'repeat is not idempotent'; END IF;
  IF EXISTS(SELECT 1 FROM get_organization_students_page(o,p_archive_mode=>'archive') WHERE user_id=s)
    OR (SELECT archived_count FROM get_organization_students_counts(o))<>1
    OR EXISTS(SELECT 1 FROM get_organization_student_group_counts(o) WHERE group_id='20000000-0000-0000-0000-000000000001' AND total_count<>0)
    OR (SELECT total_count FROM get_course_students_stats(c))<>0
    OR EXISTS(SELECT 1 FROM get_course_student_test_results_page(c) WHERE user_id=s)
    OR EXISTS(SELECT 1 FROM get_course_students_page(c) WHERE user_id=s) THEN RAISE EXCEPTION 'removed learner remains in operational roster/counts'; END IF;
  IF (SELECT progress FROM enrollments WHERE user_id=s AND course_id=c)<>73 OR (SELECT count(*) FROM test_attempts WHERE user_id=s)<>2
    OR (SELECT count(*) FROM education_document_records WHERE user_id=s AND document_number='PRESERVED')<>1 THEN RAISE EXCEPTION 'learning evidence modified'; END IF;
  IF jsonb_array_length(get_student_learning_results(o,s)->'courses')<>1 THEN RAISE EXCEPTION 'removed learning history inaccessible'; END IF;
  r:=set_archived_student_removed(o,s,false);
  IF (r->>'removed')::boolean IS DISTINCT FROM false OR (SELECT archived_at FROM profiles WHERE user_id=s) IS NULL
    OR (SELECT archived_count FROM get_organization_students_counts(o))<>2
    OR (SELECT total_count FROM get_course_students_stats(c))<>1 THEN RAISE EXCEPTION 'restore did not return to archive'; END IF;
  RAISE NOTICE 'PASS: latest/unstarted results, archive transition, idempotency, audit, all roster counters, history preserved and restore';
END;
$test$;
RESET ROLE;
DO $test$
BEGIN
 IF (SELECT count(*) FROM student_deletion_log WHERE student_id='30000000-0000-0000-0000-000000000002')<>2 THEN RAISE EXCEPTION 'remove/restore audit missing or repeated removal duplicated'; END IF;
END;
$test$;
-- Manual credit is displayed separately, without manufacturing an online attempt.
INSERT INTO course_manual_credits(enrollment_id,credited_at,credited_by) VALUES
 ('60000000-0000-0000-0000-000000000001',now(),'30000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
DO $test$
DECLARE r jsonb;
BEGIN
 r:=get_student_learning_results('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002');
 IF r#>>'{courses,0,tests,1,manual_credited_at}' IS NULL OR r#>>'{courses,0,tests,1,score}' IS NOT NULL
   OR (r#>>'{courses,0,tests,1,attempts_used}')::integer<>0 THEN RAISE EXCEPTION 'manual credit fabricated online score'; END IF;
END;
$test$;
-- The fixture intentionally permits learners through legacy can_access_organization.
-- New RPCs must independently enforce owner/admin/actual staff membership.
SET test.uid='30000000-0000-0000-0000-000000000003';
DO $test$
BEGIN
 BEGIN PERFORM set_archived_student_removed('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',true); RAISE EXCEPTION 'learner mutation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM get_student_learning_results('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002'); RAISE EXCEPTION 'learner result read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO student_roster_removals VALUES('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',now(),auth.uid()); RAISE EXCEPTION 'direct marker write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: ordinary learner cannot read another learner or mutate roster despite permissive legacy helper';
END;
$test$;
SET test.uid='30000000-0000-0000-0000-000000000006';
DO $test$
BEGIN
 PERFORM set_archived_student_removed('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',true);
 PERFORM get_student_learning_results('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002');
 RAISE NOTICE 'PASS: permitted staff mutation and result read';
END;
$test$;
RESET ROLE;
UPDATE org_staff SET expires_at=now()-interval '1 day' WHERE user_id='30000000-0000-0000-0000-000000000006';
SET ROLE authenticated;
DO $test$
BEGIN
 BEGIN PERFORM set_archived_student_removed('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',false); RAISE EXCEPTION 'expired staff allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM get_student_learning_results('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002'); RAISE EXCEPTION 'expired staff result read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: expired staff denied';
END;
$test$;
RESET ROLE;
SET test.uid='30000000-0000-0000-0000-000000000005';
SET ROLE authenticated;
DO $test$
BEGIN
 IF (SELECT total_count FROM get_course_students_stats('50000000-0000-0000-0000-000000000002'))<>1 THEN RAISE EXCEPTION 'other tenant enrollment was hidden'; END IF;
 IF (SELECT count(*) FROM student_roster_removals)<>0 THEN RAISE EXCEPTION 'other tenant can read removal marker'; END IF;
 RAISE NOTICE 'PASS: removal marker does not affect another tenant course or expose itself';
END;
$test$;
RESET ROLE;
