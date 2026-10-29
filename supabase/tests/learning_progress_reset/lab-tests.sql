-- ISOLATED LAB ONLY; synthetic fixtures. Run after lab-setup.sql + candidate migration.
BEGIN;
-- The original and replacement PLP hash functions canonicalize timestamp JSON in UTC.
SET LOCAL TimeZone='UTC';
CREATE FUNCTION pg_temp.assert(ok boolean,label text)RETURNS void LANGUAGE plpgsql AS $t$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',label;END IF;RAISE NOTICE 'PASS: %',label;END;$t$;
CREATE FUNCTION pg_temp.expect_error(command text,wanted_state text,wanted_message text,label text)RETURNS void LANGUAGE plpgsql AS $t$
DECLARE actual_state text:='00000';actual_message text:='';BEGIN
 BEGIN EXECUTE command;EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual_state=RETURNED_SQLSTATE,actual_message=MESSAGE_TEXT;END;
 IF actual_state<>wanted_state OR actual_message NOT LIKE wanted_message THEN
  RAISE EXCEPTION 'FAIL:% wanted %/% got %/%',label,wanted_state,wanted_message,actual_state,actual_message;
 END IF;RAISE NOTICE 'PASS: %',label;END;$t$;

INSERT INTO organizations(id,name)VALUES('10000000-0000-0000-0000-000000000001','Lab One'),('10000000-0000-0000-0000-000000000002','Lab Two');
INSERT INTO profiles(user_id,organization_id,full_name,onboarding_completed)VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Synthetic A',true),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Synthetic B',true),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Synthetic Staff',true),
 ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','Synthetic Other Staff',true),
 ('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','Synthetic Blocked',true),
 ('20000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','Synthetic Deleted',true);
UPDATE profiles SET blocked_at=clock_timestamp()WHERE user_id='20000000-0000-0000-0000-000000000005';
INSERT INTO account_deletion_revocations VALUES('20000000-0000-0000-0000-000000000006');
INSERT INTO lab_staff VALUES('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002');
INSERT INTO courses(id,organization_id,title)SELECT x,'10000000-0000-0000-0000-000000000001','Synthetic Course' FROM unnest(ARRAY[
 '30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',
 '30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000005',
 '7630559a-6caf-42e7-97f9-1cd0e4598c39']::uuid[])x;
INSERT INTO courses(id,organization_id,title)VALUES('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','Other Synthetic Course');
INSERT INTO lessons(id,course_id,title,type,order_index)VALUES
 ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Text A','text',1),
 ('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','Text B','text',2),
 ('50000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','Video','video',3),
 ('50000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','Test','test',4),
 ('50000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000001','Homework','homework',5),
 ('50000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000002','Other Enrollment','text',1),
 ('50000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000004','Protected','text',1),
 ('50000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000005','Withdrawn','text',1),
 ('50000000-0000-0000-0000-000000000009','7630559a-6caf-42e7-97f9-1cd0e4598c39','CSZ Homework','homework',1);
INSERT INTO enrollments(id,user_id,course_id,progress,time_spent)VALUES
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',80,40),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',0,5),
 ('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',0,10),
 ('40000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004',0,0),
 ('40000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000005',0,0),
 ('40000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000001',0,0),
 ('40000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000001',0,0),
 ('40000000-0000-0000-0000-000000000008','20000000-0000-0000-0000-000000000001','7630559a-6caf-42e7-97f9-1cd0e4598c39',0,0);
INSERT INTO platform_course_learning_policies(course_id)VALUES('30000000-0000-0000-0000-000000000004');
INSERT INTO lab_withdrawn VALUES('40000000-0000-0000-0000-000000000005');
INSERT INTO lesson_progress(user_id,lesson_id,completed,time_spent,completed_at)
 SELECT '20000000-0000-0000-0000-000000000001',x,true,10,clock_timestamp()-interval'1 hour' FROM unnest(ARRAY[
 '50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002',
 '50000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000005']::uuid[])x;
INSERT INTO lesson_progress(user_id,lesson_id,completed)VALUES('20000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001',true);
INSERT INTO test_questions VALUES('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','Synthetic question','["A","B"]',0,1,'Synthetic explanation',NULL,false);
INSERT INTO test_attempt_sessions(id,user_id,lesson_id,request_id,started_at,submitted_at,status,questions_snapshot,passing_score,show_answers)VALUES
 ('70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000001',clock_timestamp()-interval'2 hour',clock_timestamp()-interval'1 hour','completed','[{"id":"60000000-0000-0000-0000-000000000001","correct_answer":0,"options":["A","B"]}]',70,true),
 ('70000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000002',clock_timestamp()-interval'30 minute',NULL,'in_progress','[{"id":"60000000-0000-0000-0000-000000000001","correct_answer":0,"options":["A","B"]}]',70,true);
INSERT INTO test_attempt_start_requests VALUES
 ('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002');
INSERT INTO test_attempts(id,user_id,lesson_id,session_id,started_at,completed_at,score,max_score,answers,shown_question_ids,passing_score,passed)
 SELECT '90000000-0000-0000-0000-000000000001',user_id,lesson_id,id,started_at,submitted_at,1,1,'{"60000000-0000-0000-0000-000000000001":0}','["60000000-0000-0000-0000-000000000001"]',70,true
 FROM test_attempt_sessions WHERE id='70000000-0000-0000-0000-000000000001';
SELECT set_config('test.actor','20000000-0000-0000-0000-000000000001',true);
INSERT INTO homework_submissions(id,lesson_id,student_id,course_id,organization_id,content,status,score,reviewer_id,submitted_at,reviewed_at)
 VALUES('a0000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Synthetic old approved','approved',90,'20000000-0000-0000-0000-000000000003',clock_timestamp()-interval'1 hour',clock_timestamp()-interval'45 minute');
INSERT INTO homework_submissions(id,lesson_id,student_id,course_id,organization_id,content,status)
 VALUES('a0000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001','7630559a-6caf-42e7-97f9-1cd0e4598c39','10000000-0000-0000-0000-000000000001','Synthetic old pending','pending');
CREATE TEMP TABLE before_proof AS SELECT
 (SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM test_attempts a)attempts,
 (SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM test_attempt_sessions s)sessions,
 (SELECT jsonb_agg(to_jsonb(h)ORDER BY id)FROM homework_submissions h)homework,
 (SELECT jsonb_agg(to_jsonb(lp)ORDER BY lesson_id)FROM lesson_progress lp WHERE user_id='20000000-0000-0000-0000-000000000001')progress,
 (SELECT jsonb_agg(to_jsonb(e)ORDER BY id)FROM enrollments e WHERE id NOT IN('40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000008'))others;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((get_course_learning_snapshot('30000000-0000-0000-0000-000000000001')->>'learning_progress_epoch')='0','discover initial decimal epoch0');
SELECT pg_temp.assert((get_course_learning_snapshot('30000000-0000-0000-0000-000000000001')->'enrollment'->>'progress')='80','80 percent fixture verified');
SELECT pg_temp.assert((get_student_test_state('50000000-0000-0000-0000-000000000004')->>'passed')='true','legacy epoch0 passed test preserved');
SELECT pg_temp.assert((start_test_attempt('50000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000002')->>'attemptId')='70000000-0000-0000-0000-000000000002','legacy epoch0 idempotent active resume');
SELECT pg_temp.expect_error($q$SELECT reset_course_learning_progress('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')$q$,'42501','forbidden','learner cannot reset');
SELECT pg_temp.expect_error($q$SELECT save_own_lesson_progress('40000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001','0',true)$q$,'P0002','enrollment_not_found','cannot write other learner');
SELECT pg_temp.expect_error($q$SELECT save_own_lesson_progress('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000006','0',true)$q$,'42501','lesson_not_in_enrollment','cannot cross lesson enrollment');
SELECT pg_temp.expect_error($q$SELECT increment_lesson_time('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',5)$q$,'42501','forbidden','legacy time cannot target other user');
SELECT set_config('test.actor','20000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.expect_error($q$SELECT reset_course_learning_progress('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')$q$,'42501','forbidden','other organization cannot reset');
SELECT set_config('test.actor','20000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.expect_error($q$SELECT reset_course_learning_progress('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')$q$,'42501','forbidden','exact organization argument checked');
SELECT pg_temp.expect_error($q$SELECT reset_course_learning_progress('40000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001')$q$,'42501','PLP_EXPLICIT_RESET_REQUIRED','protected policy reset still denied');
SELECT pg_temp.expect_error($q$SELECT reset_course_learning_progress('40000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001')$q$,'42501','retained_enrollment_learning_denied','withdrawn reset denied');
SELECT pg_temp.assert((reset_course_learning_progress('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')->>'learning_progress_epoch')='1','authorized reset advances generation1');
SELECT pg_temp.expect_error($q$SELECT * FROM course_learning_progress_resets$q$,'42501','permission denied%','reset snapshot private to owner');
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*)FROM course_learning_progress_resets)=1,'only accepted reset audited');
SELECT pg_temp.assert((SELECT lesson_progress_snapshot FROM course_learning_progress_resets)=(SELECT progress FROM before_proof),'deleted progress archived exactly');
SELECT pg_temp.assert((SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM test_attempts a)=(SELECT attempts FROM before_proof),'old scores answers and attempts exact after reset');
SELECT pg_temp.assert((SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM test_attempt_sessions s)=(SELECT sessions FROM before_proof),'old sessions and snapshots exact after reset');
SELECT pg_temp.assert((SELECT jsonb_agg(to_jsonb(h)ORDER BY id)FROM homework_submissions h)=(SELECT homework FROM before_proof),'old homework and reviews exact after reset');

SELECT set_config('test.actor','20000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((get_course_learning_snapshot('30000000-0000-0000-0000-000000000001')->'enrollment'->>'progress')='0','fresh learner sees authoritative0');
SELECT pg_temp.assert(jsonb_array_length(get_course_learning_snapshot('30000000-0000-0000-0000-000000000001')->'lesson_progress')=0,'current lessons empty');
SELECT pg_temp.expect_error($q$UPDATE enrollments SET progress=80 WHERE id='40000000-0000-0000-0000-000000000001'$q$,'P0001','LEARNING_PROGRESS_RESET','stale direct enrollment80 rejected');
SELECT pg_temp.expect_error($q$UPDATE enrollments SET progress=100 WHERE id='40000000-0000-0000-0000-000000000001'$q$,'P0001','LEARNING_PROGRESS_RESET','stale100 cannot auto-complete');
SELECT pg_temp.expect_error($q$INSERT INTO lesson_progress(user_id,lesson_id,completed)VALUES('20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',true)$q$,'P0001','LEARNING_PROGRESS_RESET','stale direct lesson upsert rejected');
SELECT pg_temp.expect_error($q$UPDATE enrollments SET learning_progress_epoch=2 WHERE id='40000000-0000-0000-0000-000000000001'$q$,'42501','learning_progress_generation_is_server_owned','epoch cannot be forged');
SELECT pg_temp.expect_error($q$SELECT save_own_lesson_progress('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','0',true)$q$,'P0001','LEARNING_PROGRESS_RESET','old epoch completion rejected');
SELECT pg_temp.expect_error($q$SELECT save_own_lesson_progress('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',NULL,true)$q$,'P0001','LEARNING_PROGRESS_RESET','missing epoch rejected');
SELECT pg_temp.expect_error($q$SELECT save_own_lesson_progress('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','01',true)$q$,'P0001','LEARNING_PROGRESS_RESET','noncanonical epoch rejected');
SELECT pg_temp.expect_error($q$SELECT increment_lesson_time('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',5)$q$,'P0001','LEARNING_PROGRESS_RESET','legacy missing-epoch time rejected');
SELECT pg_temp.expect_error($q$SELECT recalc_enrollment_time('40000000-0000-0000-0000-000000000001')$q$,'P0001','LEARNING_PROGRESS_RESET','legacy recalc cannot overwrite cumulative time');
SELECT pg_temp.expect_error($q$SELECT get_student_test_state('50000000-0000-0000-0000-000000000004')$q$,'P0001','LEARNING_PROGRESS_RESET','legacy test read refuses missing generation after reset');
SELECT pg_temp.assert((get_student_test_state_at_epoch('50000000-0000-0000-0000-000000000004','1')->>'hasAttempt')='false','old passed test excluded from current state');
SELECT pg_temp.assert(get_student_test_state_at_epoch('50000000-0000-0000-0000-000000000004','1')->'activeAttempt'='null'::jsonb,'old active session excluded from current state');
SELECT pg_temp.assert((get_student_test_state_at_epoch('50000000-0000-0000-0000-000000000004','1')->>'attemptsUsed')='0','course max attempts renew for current run');
SELECT pg_temp.expect_error($q$SELECT submit_test_attempt_at_epoch('70000000-0000-0000-0000-000000000002','{"60000000-0000-0000-0000-000000000001":0}','1')$q$,'P0001','LEARNING_PROGRESS_RESET','pre-reset active session cannot submit into new run');
SELECT pg_temp.expect_error($q$SELECT start_test_attempt_at_epoch('50000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000002','1')$q$,'P0001','LEARNING_PROGRESS_RESET','old start request cannot relabel session');
SELECT pg_temp.expect_error($q$SELECT save_own_lesson_progress('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','1',true)$q$,'23514','current_learning_evidence_required','old passed cannot be relabeled through new completion API');
SELECT pg_temp.expect_error($q$SELECT save_own_lesson_progress('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000005','1',true)$q$,'23514','current_learning_evidence_required','old approved homework cannot be relabeled');
SELECT pg_temp.expect_error($q$SELECT complete_own_course_enrollment_at_epoch('40000000-0000-0000-0000-000000000001','1')$q$,'P0001','course_incomplete:%','course recovery cannot restore historical tests');
SELECT pg_temp.expect_error($q$INSERT INTO homework_submissions(lesson_id,student_id,course_id,organization_id,content)VALUES('50000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','stale')$q$,'P0001','LEARNING_PROGRESS_RESET','old pending form missing epoch rejected');
SELECT pg_temp.expect_error($q$INSERT INTO homework_submissions(lesson_id,student_id,course_id,organization_id,content,learning_progress_epoch,status,score)VALUES('50000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','forged',1,'approved',100)$q$,'42501','only_pending_own_homework_submission_allowed','learner cannot manufacture approved current homework');
SELECT pg_temp.assert((get_own_homework_history('50000000-0000-0000-0000-000000000005')->'submissions'->0->>'learning_progress_epoch')='0','old homework history readable with string epoch');
SELECT pg_temp.assert((save_own_lesson_progress('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','1',true,NULL,NULL,5)->'enrollment'->>'progress')='20','new epoch text completion accepted');
SELECT save_own_lesson_progress('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','1',true);
SELECT pg_temp.assert((save_own_lesson_progress('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','1',true,50,100,5)->'enrollment'->>'progress')='60','new epoch video accepted and progress recomputed');
CREATE TEMP TABLE new_session AS SELECT start_test_attempt_at_epoch('50000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000003','1')payload;
SELECT pg_temp.assert((SELECT payload->>'attemptId' FROM new_session)<>'70000000-0000-0000-0000-000000000002','new session coexists with immutable historical active session');
SELECT pg_temp.assert(start_test_attempt_at_epoch('50000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000004','1')->>'attemptId'=(SELECT payload->>'attemptId'FROM new_session),'concurrent-tab equivalent resume within current run');
SELECT pg_temp.assert((submit_test_attempt_at_epoch((SELECT(payload->>'attemptId')::uuid FROM new_session),'{"60000000-0000-0000-0000-000000000001":0}','1')->>'passed')='true','new current test submission succeeds');
INSERT INTO homework_submissions(id,lesson_id,student_id,course_id,organization_id,content,learning_progress_epoch)
 VALUES('a0000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','New current homework',1);
SELECT set_config('test.actor','20000000-0000-0000-0000-000000000003',true);
UPDATE homework_submissions SET status='approved',score=95 WHERE id='a0000000-0000-0000-0000-000000000003';
SELECT pg_temp.expect_error($q$UPDATE homework_submissions SET learning_progress_epoch=1 WHERE id='a0000000-0000-0000-0000-000000000001'$q$,'42501','homework_learning_generation_is_immutable','reviewer cannot relabel historical homework');
SELECT set_config('test.actor','20000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert((save_own_lesson_progress('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000005','1',true)->'enrollment'->>'progress')='100','fresh current approval completes course');
SELECT pg_temp.assert((complete_own_course_enrollment_at_epoch('40000000-0000-0000-0000-000000000001','1')->>'status')='completed','current complete response verifies completion');
SELECT pg_temp.assert((get_course_learning_snapshot('30000000-0000-0000-0000-000000000001')->'enrollment'->>'time_spent')='50','cumulative old time plus new increments preserved');
SELECT pg_temp.assert(jsonb_array_length(get_course_learning_snapshot('30000000-0000-0000-0000-000000000001')->'lesson_progress')=5,'fresh full reload retains exactly current completed lessons');

SELECT set_config('test.actor','20000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert((reset_course_learning_progress('40000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000001')->>'learning_progress_epoch')='1','CSZ reset starts new run without deleting old pending homework');
SELECT set_config('test.actor','20000000-0000-0000-0000-000000000001',true);
INSERT INTO homework_submissions(id,lesson_id,student_id,course_id,organization_id,content,learning_progress_epoch)
 VALUES('a0000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001','7630559a-6caf-42e7-97f9-1cd0e4598c39','10000000-0000-0000-0000-000000000001','Current CSZ homework',1);
SELECT pg_temp.assert(jsonb_array_length(get_own_homework_history('50000000-0000-0000-0000-000000000009')->'submissions')=2,'CSZ old pending and new pending coexist by distinct epochs');
SELECT pg_temp.expect_error($q$INSERT INTO homework_submissions(lesson_id,student_id,course_id,organization_id,content,learning_progress_epoch)VALUES('50000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001','7630559a-6caf-42e7-97f9-1cd0e4598c39','10000000-0000-0000-0000-000000000001','duplicate',1)$q$,'23505','one_pending_homework_per_learning_run','CSZ one pending constraint retained within current run');
RESET ROLE;
SELECT pg_temp.assert((SELECT jsonb_agg(to_jsonb(e)ORDER BY id)FROM enrollments e WHERE id NOT IN('40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000008'))=(SELECT others FROM before_proof),'all other enrollments exact');
SELECT pg_temp.assert((SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM test_attempt_sessions s WHERE id IN('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002'))=(SELECT sessions FROM before_proof),'old completed and active snapshots still exact after new test');
SELECT pg_temp.assert((SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM test_attempts a WHERE id='90000000-0000-0000-0000-000000000001')=(SELECT attempts FROM before_proof),'old scores answers passing rules exact after new completion');
SELECT pg_temp.assert((SELECT jsonb_agg(to_jsonb(h)ORDER BY id)FROM homework_submissions h WHERE id IN('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002'))=(SELECT homework FROM before_proof),'historical approved and pending homework exact after new runs');
SELECT pg_temp.assert((SELECT plp_homework_sha(h,true)=plp_sha(to_jsonb(h)-'learning_progress_epoch')AND plp_homework_sha(h,false)=plp_sha(to_jsonb(h)-ARRAY['learning_progress_epoch','status','score','reviewer_id','reviewer_comment','reviewed_at'])FROM homework_submissions h WHERE id='a0000000-0000-0000-0000-000000000001'),'PLP previous submission/review hash material unchanged');

-- JSON payload compatibility vectors: NULL/zero/high scores and all review states.
DO $vectors$
DECLARE vector jsonb;h public.homework_submissions;base jsonb;n integer:=0;
BEGIN
 FOR vector IN SELECT jsonb_build_object('id',gen_random_uuid(),'lesson_id','50000000-0000-0000-0000-000000000005',
  'student_id','20000000-0000-0000-0000-000000000001','course_id','30000000-0000-0000-0000-000000000001',
  'organization_id','10000000-0000-0000-0000-000000000001','content','Synthetic hash vector',
  'attachments','[]'::jsonb,'status',st,'score',sc,'reviewer_comment',NULL,'learning_progress_epoch',0)
 FROM unnest(ARRAY['pending','approved','revision','rejected'])st CROSS JOIN unnest(ARRAY[NULL,0,100]::integer[])sc LOOP
  h:=jsonb_populate_record(NULL::public.homework_submissions,vector);
  base:=to_jsonb(h)-'learning_progress_epoch';
  PERFORM pg_temp.assert(public.plp_homework_sha(h,true)=public.plp_sha(base),'PLP review hash vector '||n);
  PERFORM pg_temp.assert(public.plp_homework_sha(h,false)=public.plp_sha(base-ARRAY['status','score','reviewer_id','reviewer_comment','reviewed_at']),'PLP submission hash vector '||n);
  n:=n+1;
 END LOOP;
 PERFORM pg_temp.assert(n=12,'12 independent NULL/zero/100 score state vectors');
END;$vectors$;

SELECT pg_temp.assert(NOT has_function_privilege('anon','public.increment_lesson_time(uuid,uuid,integer)','EXECUTE'),'anonymous time writer revoked');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.lpr_lock_own_enrollment(uuid,text,boolean)','EXECUTE'),'private legacy bypass helper inaccessible');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','public.course_learning_progress_resets','SELECT'),'private reset snapshots not granted');
SELECT set_config('test.actor','20000000-0000-0000-0000-000000000005',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT get_course_learning_snapshot('30000000-0000-0000-0000-000000000001')$q$,'42501','forbidden','blocked learner denied snapshot');
SELECT set_config('test.actor','20000000-0000-0000-0000-000000000006',true);
SELECT pg_temp.expect_error($q$SELECT get_course_learning_snapshot('30000000-0000-0000-0000-000000000001')$q$,'42501','forbidden','deleted learner denied snapshot');
RESET ROLE;
ROLLBACK;

