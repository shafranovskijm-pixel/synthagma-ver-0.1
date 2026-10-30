-- ISOLATED SYNTHETIC LAB ONLY. Requires frozen reset fixture, migration655, this extension and migration656.
BEGIN;
SET LOCAL TimeZone='UTC';
CREATE FUNCTION pg_temp.assert(ok boolean,label text)RETURNS void LANGUAGE plpgsql AS $t$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',label;END IF;RAISE NOTICE 'PASS: %',label;END;$t$;
SELECT pg_temp.assert((SELECT attnotnull FROM pg_attribute WHERE attrelid='public.test_attempts'::regclass AND attname='completed_at'),'history cursor date mirrors actual NOT NULL completion contract');
CREATE FUNCTION pg_temp.expect_error(command text,wanted_state text,wanted_message text,label text)RETURNS void LANGUAGE plpgsql AS $t$
DECLARE actual_state text:='00000';actual_message text:='';BEGIN
 BEGIN EXECUTE command;EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual_state=RETURNED_SQLSTATE,actual_message=MESSAGE_TEXT;END;
 IF actual_state<>wanted_state OR actual_message NOT LIKE wanted_message THEN
  RAISE EXCEPTION 'FAIL:% wanted %/% got %/%',label,wanted_state,wanted_message,actual_state,actual_message;
 END IF;RAISE NOTICE 'PASS: %',label;END;$t$;
INSERT INTO public.organizations(id,name)VALUES('11000000-0000-0000-0000-000000000001','Synthetic History Org'),('11000000-0000-0000-0000-000000000002','Synthetic Other Org');
INSERT INTO public.profiles(user_id,organization_id,full_name,onboarding_completed)VALUES
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','Synthetic Learner',true),
 ('21000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','Synthetic Staff',true),
 ('21000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000002','Synthetic Other',true),
 ('21000000-0000-0000-0000-000000000004','11000000-0000-0000-0000-000000000001','Synthetic Blocked',true);
UPDATE public.profiles SET blocked_at=clock_timestamp()WHERE user_id='21000000-0000-0000-0000-000000000004';
INSERT INTO public.lab_staff VALUES('21000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001');
INSERT INTO public.courses(id,organization_id,title)VALUES('31000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','Synthetic Ten Lesson Course');
INSERT INTO public.enrollments(id,user_id,course_id)VALUES
 ('41000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001'),
 ('41000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000004','31000000-0000-0000-0000-000000000001');
-- All ten lessons must exist before LP is seeded: monotone progress must not
-- observe a temporary one-lesson denominator and legitimately reach100.
INSERT INTO public.lessons(id,course_id,title,type,order_index,test_max_attempts,test_max_attempts_per_day)
 SELECT ('51000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  '31000000-0000-0000-0000-000000000001','Synthetic Lesson '||n,
  CASE WHEN n<=5 THEN 'text'ELSE 'test'END,n,20,20 FROM generate_series(1,10)n;
DO $fixture$
DECLARE n integer;lid uuid;qid uuid;sid uuid;rid uuid;
BEGIN
 FOR n IN 1..10 LOOP
  lid:=('51000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
  IF n<=5 THEN
   INSERT INTO public.lesson_progress(user_id,lesson_id,completed,completed_at)
    VALUES('21000000-0000-0000-0000-000000000001',lid,true,clock_timestamp()-interval'1 hour');
  ELSE
   qid:=('61000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
   sid:=('71000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
   rid:=('81000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
   INSERT INTO public.test_questions(id,lesson_id,question,options,correct_answer,order_index)
    VALUES(qid,lid,'Synthetic check','["A","B"]',0,1);
   INSERT INTO public.test_attempt_sessions(id,user_id,lesson_id,request_id,started_at,submitted_at,status,questions_snapshot,passing_score,show_answers)
    VALUES(sid,'21000000-0000-0000-0000-000000000001',lid,rid,clock_timestamp()-interval'10 days',clock_timestamp()-interval'10 days'+interval'1 minute',
     'completed',jsonb_build_array(jsonb_build_object('id',qid,'correct_answer',0,'options',jsonb_build_array('A','B'))),70,true);
   INSERT INTO public.test_attempts(user_id,lesson_id,session_id,started_at,completed_at,score,max_score,answers,shown_question_ids,passing_score,passed)
    SELECT user_id,lesson_id,id,started_at,submitted_at,CASE WHEN n<10 THEN 1 ELSE 0 END,1,jsonb_build_object(qid,CASE WHEN n<10 THEN 0 ELSE 1 END),
     jsonb_build_array(qid),70,n<10 FROM public.test_attempt_sessions WHERE id=sid;
  END IF;
 END LOOP;
END;$fixture$;
CREATE TEMP TABLE before_rows AS SELECT
 (SELECT md5(jsonb_agg(to_jsonb(a)ORDER BY id)::text)FROM public.test_attempts a)AS attempts,
 (SELECT md5(jsonb_agg(to_jsonb(s)ORDER BY id)::text)FROM public.test_attempt_sessions s)AS sessions,
 (SELECT md5(jsonb_agg(to_jsonb(p)ORDER BY id)::text)FROM public.lesson_progress p)AS progress,
 (SELECT md5(jsonb_agg(to_jsonb(e)ORDER BY id)::text)FROM public.enrollments e)AS enrollments;
SELECT set_config('test.actor','21000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(get_course_learning_snapshot('31000000-0000-0000-0000-000000000001')->'enrollment'->>'progress'='50','legacy five current text lessons produce authoritative50');
SELECT pg_temp.assert(get_student_test_state_at_epoch('51000000-0000-0000-0000-000000000006','0')->>'passed'IS NULL,'historical passed grade cannot masquerade as current pass');
SELECT pg_temp.assert(get_student_test_state('51000000-0000-0000-0000-000000000006')->>'hasAttempt'='false','legacy client alias cannot promote missingLP from old grade');
SELECT pg_temp.assert(get_student_test_state_at_epoch('51000000-0000-0000-0000-000000000006','0')->>'historyOnlyResultAvailable'='true','retained grade availability remains explicit without current pass');
SELECT pg_temp.assert(get_student_test_state_at_epoch('51000000-0000-0000-0000-000000000006','0')->>'currentCompleted'='false','historical passed grade is not current lesson completion');
SELECT pg_temp.assert(get_student_test_state_at_epoch('51000000-0000-0000-0000-000000000006','0')->>'attemptsUsed'='1','legacy quota still counts old attempt without refund');
SELECT pg_temp.expect_error($q$SELECT complete_own_course_enrollment_at_epoch('41000000-0000-0000-0000-000000000001','0')$q$,'P0001','course_incomplete:5/10','legacy completion cannot silently recover old tests');
SELECT pg_temp.assert(get_course_learning_snapshot('31000000-0000-0000-0000-000000000001')->'enrollment'->>'progress'='50','denied recovery leaves50 unchanged');
SELECT pg_temp.assert((SELECT count(*)FROM jsonb_array_elements(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','0')->'lessons')x WHERE(x->>'current_completed')::boolean)=5,'history reports exactly five actual LP completions');
SELECT pg_temp.assert((get_own_course_learning_history('31000000-0000-0000-0000-000000000001','0')->'counts'->>'attempts_total')='5','all five historical attempts retained');
SELECT pg_temp.assert((SELECT count(*)FROM jsonb_array_elements(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','0')->'attempts')x WHERE(x->>'is_counted_in_current_run')::boolean)=0,'no historical passed attempt counted without currentLP');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','0')->'attempts')x WHERE(x->>'historical_boundary_known')::boolean),'epoch0 does not invent an old reset boundary');
SELECT pg_temp.assert(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','0')::text !~ 'answers|questions_snapshot|correct_answer|before_enrollment|lesson_progress_snapshot|credited_by|actor_id','history projection exposes no keys answers snapshots or actors');
SELECT pg_temp.expect_error($q$SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')$q$,'P0001','LEARNING_PROGRESS_RESET','history requires exact caller epoch');
RESET ROLE;
SELECT pg_temp.assert((SELECT md5(jsonb_agg(to_jsonb(a)ORDER BY id)::text)FROM public.test_attempts a)=(SELECT attempts FROM before_rows),'history and failed completion preserve exact attempt bytes');
SELECT pg_temp.assert((SELECT md5(jsonb_agg(to_jsonb(s)ORDER BY id)::text)FROM public.test_attempt_sessions s)=(SELECT sessions FROM before_rows),'history and failed completion preserve exact session snapshots');
SELECT pg_temp.assert((SELECT md5(jsonb_agg(to_jsonb(p)ORDER BY id)::text)FROM public.lesson_progress p)=(SELECT progress FROM before_rows),'history cannot recreate currentLP');
SELECT pg_temp.assert((SELECT md5(jsonb_agg(to_jsonb(e)ORDER BY id)::text)FROM public.enrollments e)=(SELECT enrollments FROM before_rows),'history cannot rewrite enrollment or its epoch');
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE legacy_active AS SELECT start_test_attempt_at_epoch('51000000-0000-0000-0000-000000000006','85000000-0000-0000-0000-000000000006','0')payload;
SELECT pg_temp.assert(get_student_test_state_at_epoch('51000000-0000-0000-0000-000000000006','0')->'activeAttempt'->>'attemptId'=(SELECT payload->>'attemptId'FROM legacy_active),'history-only old grade does not hide a genuine active attempt');
RESET ROLE;
SELECT set_config('test.actor','21000000-0000-0000-0000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((SELECT count(*)FROM jsonb_array_elements(get_student_learning_results('11000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001')->'courses'->0->'tests')x WHERE x->>'passed'IS NOT NULL)=0,'teacher current summary excludes all uncredited historical tests');
SELECT pg_temp.assert((SELECT sum((x->>'historical_attempts_used')::integer)FROM jsonb_array_elements(get_student_learning_results('11000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001')->'courses'->0->'tests')x)=5,'teacher summary keeps historical attempt counts separately');
-- Retained legacy active credit must not manufacture a current test/course mark.
RESET ROLE;
SAVEPOINT legacy_credit_without_lp;
INSERT INTO public.course_manual_credits(id,enrollment_id,credited_by,credited_at)
 VALUES('a1000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000002',clock_timestamp()-interval'5 days');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(get_student_learning_results('11000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001')->'courses'->0->>'manual_credited_at'IS NULL,'legacy manual credit without full currentLP is history only');
SELECT pg_temp.assert((SELECT count(*)FROM jsonb_array_elements(get_student_learning_results('11000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001')->'courses'->0->'tests')x WHERE x->>'passed'='true')=0,'legacy active manual credit cannot pass missing current tests');
SELECT pg_temp.assert((SELECT count(*)FROM jsonb_array_elements(get_student_learning_results('11000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001')->'courses'->0->'tests')x WHERE x->>'manual_credited_at'IS NOT NULL)=0,'legacy credit cannot supply current test credit dates withoutLP');
SELECT set_config('test.actor','21000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','0')->'counts'->>'manual_credits_total'='1','legacy uncounted manual credit remains available in safe history');
SELECT pg_temp.assert(get_student_test_state('51000000-0000-0000-0000-000000000006')->'manualCredit'='null'::jsonb,'legacy reader alias does not expose uncredited manual mark as current');
SELECT pg_temp.assert(get_student_test_state_at_epoch('51000000-0000-0000-0000-000000000006','0')->>'historicalManualCreditAvailable'='true','legacy manual history availability remains explicit');
SELECT pg_temp.assert(get_student_test_state_at_epoch('51000000-0000-0000-0000-000000000006','0')->'activeAttempt'='null'::jsonb,'raw active institutional credit retains original hold on pending attempt until organization reset');
SELECT pg_temp.expect_error($q$SELECT start_test_attempt_at_epoch('51000000-0000-0000-0000-000000000007','85000000-0000-0000-0000-000000000007','0')$q$,'P0001','Course already credited by the organization','uncredited legacy institutional credit still requires explicit organization reset before new start');
ROLLBACK TO SAVEPOINT legacy_credit_without_lp;
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_error($q$SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','0')$q$,'P0002','enrollment_not_found','staff cannot use own history RPC to read a learner');
SELECT set_config('test.actor','21000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.expect_error($q$SELECT get_student_learning_results('11000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001')$q$,'42501','student_results_forbidden','wrong tenant cannot read staff summary');
SELECT pg_temp.expect_error($q$SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','0')$q$,'P0002','enrollment_not_found','other learner cannot read own history for unassigned course');
SELECT set_config('test.actor','21000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.expect_error($q$SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','0')$q$,'42501','forbidden','blocked learner cannot read history');
SELECT set_config('test.actor','',true);
SELECT pg_temp.expect_error($q$SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','0')$q$,'42501','forbidden','no actor cannot read history');
SELECT set_config('test.actor','21000000-0000-0000-0000-000000000001',true);
CREATE TEMP TABLE new_session AS SELECT start_test_attempt_at_epoch('51000000-0000-0000-0000-000000000010','84000000-0000-0000-0000-000000000010','0')payload;
SELECT pg_temp.assert(submit_test_attempt_at_epoch((SELECT(payload->>'attemptId')::uuid FROM new_session),'{"61000000-0000-0000-0000-000000000010":0}','0')->>'passed'='true','new epoch0 submission still works');
SELECT pg_temp.assert(get_student_test_state_at_epoch('51000000-0000-0000-0000-000000000010','0')->>'currentCompleted'='true','new atomic submission persists authoritativeLP');
SELECT pg_temp.expect_error($q$SELECT complete_own_course_enrollment_at_epoch('41000000-0000-0000-0000-000000000001','0')$q$,'P0001','course_incomplete:6/10','new final pass does not restore four other old tests');
SELECT pg_temp.assert(get_course_learning_snapshot('31000000-0000-0000-0000-000000000001')->'enrollment'->>'progress'='60','only new valid test advances legacy progress60');
SELECT set_config('test.actor','21000000-0000-0000-0000-000000000002',true);
SELECT reset_course_learning_progress('41000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001');
SELECT set_config('test.actor','21000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')->'counts'->>'resets_total'='1','genuine synthetic reset boundary is in safe chronology');
SELECT pg_temp.assert(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')->'resets'->0->>'previous_progress'='60','reset chronology retains prior progress safely');
SELECT pg_temp.assert(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')->'resets'->0->>'previous_epoch'='0','reset epochs serialized as canonical strings');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')->'attempts')x WHERE(x->>'is_current_run')::boolean),'all pre-reset starts classified historical after actual reset');
SELECT pg_temp.assert(get_student_test_state_at_epoch('51000000-0000-0000-0000-000000000010','1')->>'currentCompleted'='false','reset cannot retain old test LP');
SELECT pg_temp.expect_error($q$SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','0')$q$,'P0001','LEARNING_PROGRESS_RESET','old history callbacks cannot render as current epoch');
CREATE TEMP TABLE failed_session AS SELECT start_test_attempt_at_epoch('51000000-0000-0000-0000-000000000006','82000000-0000-0000-0000-000000000006','1')payload;
SELECT pg_temp.assert(submit_test_attempt_at_epoch((SELECT(payload->>'attemptId')::uuid FROM failed_session),'{"61000000-0000-0000-0000-000000000006":1}','1')->>'passed'='false','new current failed attempt remains an explicit failure');
SELECT pg_temp.assert(get_student_test_state_at_epoch('51000000-0000-0000-0000-000000000006','1')->>'currentCompleted'='false','failed current attempt does not create LP');
SELECT set_config('test.actor','21000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert((SELECT x->>'passed'FROM jsonb_array_elements(get_student_learning_results('11000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001')->'courses'->0->'tests')x WHERE x->>'lesson_id'='51000000-0000-0000-0000-000000000006')='false','teacher sees genuine current failure after recorded reset');
SELECT set_config('test.actor','21000000-0000-0000-0000-000000000001',true);
DO $new_run$
DECLARE n integer;lid uuid;qid uuid;request_id uuid;session_id uuid;
BEGIN
 FOR n IN 1..10 LOOP
  lid:=('51000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
  IF n<=5 THEN PERFORM save_own_lesson_progress('41000000-0000-0000-0000-000000000001',lid,'1',true);
  ELSE
   qid:=('61000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
   request_id:=('83000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
   session_id:=(start_test_attempt_at_epoch(lid,request_id,'1')->>'attemptId')::uuid;
   PERFORM submit_test_attempt_at_epoch(session_id,jsonb_build_object(qid,0),'1');
  END IF;
 END LOOP;
END;$new_run$;
SELECT pg_temp.assert(complete_own_course_enrollment_at_epoch('41000000-0000-0000-0000-000000000001','1')->>'status'='completed','all genuinely repeated lessons complete normally');
SELECT pg_temp.assert((SELECT count(*)FROM jsonb_array_elements(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')->'attempts')x WHERE(x->>'is_counted_in_current_run')::boolean)=5,'five current passed attempts counted separately from retained history');
SELECT pg_temp.assert((get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')->'counts'->>'attempts_total')='12','history retains old failed passed and new attempts');
RESET ROLE;
SELECT pg_temp.assert((SELECT md5(jsonb_agg(to_jsonb(a)ORDER BY id)::text)FROM public.test_attempts a WHERE a.session_id IN(SELECT id FROM public.test_attempt_sessions WHERE request_id::text LIKE '81000000-%'AND started_at<clock_timestamp()-interval'1 day'))=(SELECT attempts FROM before_rows),'old attempt answers scores and identity remain exact after new run');
SELECT pg_temp.assert((SELECT md5(jsonb_agg(to_jsonb(s)ORDER BY id)::text)FROM public.test_attempt_sessions s WHERE request_id::text LIKE '81000000-%'AND started_at<clock_timestamp()-interval'1 day')=(SELECT sessions FROM before_rows),'old session snapshots remain exact after reset and new run');
-- Synthetic unknown-start legacy row + bounded page, retaining all records.
INSERT INTO public.test_attempts(user_id,lesson_id,completed_at,score,max_score,answers,passed)
 SELECT '21000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000006','2026-01-01T00:00:00Z'::timestamptz,1,1,'{}',true FROM generate_series(1,101)n;
INSERT INTO public.course_manual_credits(id,enrollment_id,credited_by,credited_at,revoked_at)
 VALUES('a1000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000002','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
INSERT INTO public.test_attempts(id,user_id,lesson_id,completed_at,score,max_score,answers,passed)
 VALUES('91000000-0000-0000-0000-000000000099','21000000-0000-0000-0000-000000000004','51000000-0000-0000-0000-000000000006','2026-01-01T00:00:00Z',1,1,'{}',true);
SELECT set_config('test.actor','21000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((SELECT jsonb_array_length(p->'attempts')+jsonb_array_length(p->'resets')+jsonb_array_length(p->'manual_credits')FROM(SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')p)x)=100,'bounded safe history returns100 total event records');
SELECT pg_temp.assert(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')->>'has_more'='true','bounded history discloses omitted older attempts');
SELECT pg_temp.assert(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')->'counts'->>'attempts_total'='113','bounded history retains full total113');
SELECT pg_temp.assert(EXISTS(SELECT 1 FROM jsonb_array_elements(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')->'attempts')x WHERE x->>'run_epoch'IS NULL AND x->>'is_current_run'='false'AND x->>'historical_boundary_known'='false'),'unknown legacy starts are explicit unclassified history');
CREATE TEMP TABLE first_page AS SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')p;
CREATE TEMP TABLE second_page AS SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1',
 (p->'next_cursor'->>'ts')::timestamptz,p->'next_cursor'->>'kind',(p->'next_cursor'->>'id')::uuid)p FROM first_page;
SELECT pg_temp.assert((SELECT p->>'per_page_limit'FROM first_page)='100','history page contract is unified100');
SELECT pg_temp.assert((SELECT p->'next_cursor'IS NOT NULL AND p->'next_cursor'<>'null'::jsonb FROM first_page),'first page supplies exact stable older cursor');
SELECT pg_temp.assert((SELECT p->>'has_more'FROM second_page)='false','second page reaches complete retained history');
SELECT pg_temp.assert((SELECT p->'next_cursor'='null'::jsonb FROM second_page),'final page exposes no spurious cursor');
SELECT pg_temp.assert((SELECT jsonb_array_length(p->'attempts')+jsonb_array_length(p->'resets')+jsonb_array_length(p->'manual_credits')FROM second_page)=15,'second page has remaining15 records including equal-time ties');
CREATE TEMP TABLE flattened_pages AS
 SELECT kind,x->>'id'AS id FROM(SELECT p FROM first_page UNION ALL SELECT p FROM second_page)pages
 CROSS JOIN LATERAL(VALUES('attempt',pages.p->'attempts'),('reset',pages.p->'resets'),('manual_credit',pages.p->'manual_credits'))k(kind,rows)
 CROSS JOIN LATERAL jsonb_array_elements(k.rows)x;
SELECT pg_temp.assert((SELECT count(*)FROM flattened_pages)=115,'all115 retained event records are accessible over pages');
SELECT pg_temp.assert((SELECT count(DISTINCT(kind,id))FROM flattened_pages)=115,'stable composite cursor has no cross-page duplicates or skipped ties');
SELECT pg_temp.assert((SELECT count(*)FROM flattened_pages WHERE kind='manual_credit')=1,'credit sharing timestamp with attempts occurs once');
SELECT pg_temp.expect_error($q$SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1','2026-01-01T00:00:00Z',NULL,NULL)$q$,'22023','history_cursor_not_available','partial cursor rejected');
SELECT pg_temp.expect_error($q$SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1','2026-01-01T00:00:00Z','bogus','91000000-0000-0000-0000-000000000099')$q$,'22023','history_cursor_not_available','unknown event kind rejected');
SELECT pg_temp.expect_error($q$SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1','2026-01-01T00:00:00Z','attempt','91000000-0000-0000-0000-000000000099')$q$,'22023','history_cursor_not_available','foreign learner cursor rejected without data exposure');
SELECT pg_temp.expect_error($q$SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1','2025-01-01T00:00:00Z','manual_credit','a1000000-0000-0000-0000-000000000001')$q$,'22023','history_cursor_not_available','own record with fabricated cursor timestamp rejected');
SELECT pg_temp.expect_error($q$SELECT get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1','2026-01-01T00:00:00Z','manual_credit','a1000000-0000-0000-0000-000000000099')$q$,'22023','history_cursor_not_available','unknown cursor rejected with same error as foreign');
-- Unknown historical outcome/threshold cannot be regraded using mutable lesson settings.
RESET ROLE;
INSERT INTO public.test_attempts(id,user_id,lesson_id,completed_at,score,max_score,answers,passed,passing_score)
 VALUES('91000000-0000-0000-0000-000000000100','21000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000006',clock_timestamp(),1,2,'{}',NULL,NULL);
UPDATE public.lessons SET test_passing_score=1 WHERE id='51000000-0000-0000-0000-000000000006';
SELECT set_config('test.actor','21000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((SELECT x->>'passed'FROM jsonb_array_elements(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')->'attempts')x WHERE x->>'id'='91000000-0000-0000-0000-000000000100')IS NULL,'unknown legacy outcome remains unknown after current threshold changed');
SELECT pg_temp.assert((SELECT x->>'passing_score'FROM jsonb_array_elements(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')->'attempts')x WHERE x->>'id'='91000000-0000-0000-0000-000000000100')IS NULL,'unknown historical threshold is not copied from current lesson');
SELECT pg_temp.assert((SELECT x->>'is_counted_in_current_run'FROM jsonb_array_elements(get_own_course_learning_history('31000000-0000-0000-0000-000000000001','1')->'attempts')x WHERE x->>'id'='91000000-0000-0000-0000-000000000100')='false','unknown legacy grade cannot count as new progress');

SELECT pg_temp.assert(NOT has_function_privilege('anon','public.get_own_course_learning_history(uuid,text,timestamptz,text,uuid)','EXECUTE'),'anonymous history execution revoked');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.lpr_get_student_test_state(uuid,text,boolean)','EXECUTE'),'private state helper still inaccessible');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','public.course_learning_progress_resets','SELECT'),'raw reset snapshots remain private');
RESET ROLE;
ROLLBACK;
