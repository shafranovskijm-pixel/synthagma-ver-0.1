\set ON_ERROR_STOP on
BEGIN;
-- Use a separate lesson so quota assertions do not depend on the main suite.
INSERT INTO public.lessons(id,course_id,title,type,test_passing_score,test_max_attempts_per_day)
 VALUES ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','Legacy encoded options','test',60,1);
INSERT INTO public.test_questions(id,lesson_id,question,options,correct_answer)
 VALUES ('50000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000003','Legacy array',to_jsonb('["Wrong","Correct"]'::text),1);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT public.start_test_attempt('40000000-0000-0000-0000-000000000003',gen_random_uuid())->>'attemptId' AS legacy_options_attempt \gset
SELECT public.test_assert(public.get_student_test_state('40000000-0000-0000-0000-000000000003')->'activeAttempt'->'questions'->0->'options'='["Wrong","Correct"]'::jsonb,
 'legacy JSON-string array becomes usable options before the attempt is reserved');
SELECT public.test_assert(public.submit_test_attempt(:'legacy_options_attempt','{"50000000-0000-0000-0000-000000000004":1}') @>
 '{"score":1,"maxScore":1,"passed":true,"attemptsUsed":1}', 'normalized legacy options grade against the preserved answer index');
RESET ROLE;
SELECT public.test_assert((SELECT jsonb_typeof(options)='string' FROM public.test_questions WHERE id='50000000-0000-0000-0000-000000000004'),
 'normalizing a snapshot leaves the source question unchanged');
INSERT INTO public.lessons(id,course_id,title,type,test_questions_to_show,test_max_attempts_per_day)
 VALUES ('40000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','Malformed content','test',1,1);
INSERT INTO public.test_questions(id,lesson_id,question,options,correct_answer) VALUES
 ('50000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000004','Broken candidate','{}',0),
 ('50000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000004','Valid candidate','["A","B"]',0);
-- Include a valid candidate but sample one question: invalid candidates must not
-- be silently skipped depending on the random order.
DO $$
DECLARE c record; before_sessions bigint; before_requests bigint; failed boolean;
BEGIN
 SELECT count(*) INTO before_sessions FROM public.test_attempt_sessions;
 SELECT count(*) INTO before_requests FROM public.test_attempt_start_requests;
 FOR c IN SELECT * FROM (VALUES
   ('object','{}'::jsonb,0), ('number','1'::jsonb,0), ('boolean','true'::jsonb,0),
   ('JSON null','null'::jsonb,0), ('SQL null',NULL::jsonb,0), ('empty array','[]'::jsonb,0),
   ('invalid encoded JSON',to_jsonb('not-json'::text),0),
   ('encoded object',to_jsonb('{}'::text),0), ('encoded empty array',to_jsonb('[]'::text),0),
   ('nested string',to_jsonb(to_jsonb('["A"]'::text)::text),0)
 ) AS cases(label,options,correct_answer)
 LOOP
   UPDATE public.test_questions SET options=c.options,correct_answer=c.correct_answer
     WHERE id='50000000-0000-0000-0000-000000000005';
   failed := false;
   BEGIN
     EXECUTE 'SET LOCAL ROLE authenticated';
     PERFORM public.start_test_attempt('40000000-0000-0000-0000-000000000004',gen_random_uuid());
     EXECUTE 'RESET ROLE';
   EXCEPTION WHEN invalid_parameter_value THEN
     failed := position('Test content invalid' IN SQLERRM)>0;
   END;
   PERFORM public.test_assert(failed,'clear content error for ' || c.label);
   PERFORM public.test_assert(
     (SELECT count(*) FROM public.test_attempt_sessions)=before_sessions
      AND (SELECT count(*) FROM public.test_attempt_start_requests)=before_requests,
     'no quota slot or acknowledged request consumed for ' || c.label);
 END LOOP;
END;
$$;
-- Repairing content allows the same learner to use the still available quota.
UPDATE public.test_questions SET options='["A","B"]',correct_answer=0
 WHERE id='50000000-0000-0000-0000-000000000005';
SET ROLE authenticated;
SELECT public.test_assert(public.start_test_attempt('40000000-0000-0000-0000-000000000004',gen_random_uuid()) @>
 '{"attemptsUsed":1,"attemptsUsedToday":1}', 'valid content starts normally after rejected malformed content');
RESET ROLE;
-- Legacy keys never used one-based conversion. Invalid keys must neither block
-- the whole test nor reduce its max score, and must not permit forged answers.
INSERT INTO public.lessons(id,course_id,title,type,test_passing_score)
 VALUES ('40000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000001','Legacy answer keys','test',60);
INSERT INTO public.test_questions(id,lesson_id,question,options,correct_answer)
 VALUES ('50000000-0000-0000-0000-000000000007','40000000-0000-0000-0000-000000000005','Preserved legacy key','["A","B"]',NULL);
DO $$
DECLARE c record; attempt uuid; snapshot jsonb; failed boolean; result jsonb;
BEGIN
 FOR c IN SELECT * FROM (VALUES
   ('NULL key',NULL::integer,0), ('negative key',-1,0), ('key equal to option count',2,1)
 ) AS cases(label,correct_answer,legal_answer)
 LOOP
   UPDATE public.test_questions SET correct_answer=c.correct_answer
     WHERE id='50000000-0000-0000-0000-000000000007';
   EXECUTE 'SET LOCAL ROLE authenticated';
   attempt := (public.start_test_attempt('40000000-0000-0000-0000-000000000005',gen_random_uuid())->>'attemptId')::uuid;
   EXECUTE 'RESET ROLE';
   PERFORM public.test_assert(attempt IS NOT NULL,'test remains startable for ' || c.label);
   SELECT questions_snapshot INTO snapshot FROM public.test_attempt_sessions WHERE id=attempt;
   PERFORM public.test_assert(jsonb_array_length(snapshot)=1
     AND snapshot->0->'correct_answer'=coalesce(to_jsonb(c.correct_answer),'null'::jsonb)
     AND snapshot->0->'options'='["A","B"]'::jsonb,
     'snapshot retains exact source key and question for ' || c.label);
   failed := false;
   BEGIN
     EXECUTE 'SET LOCAL ROLE authenticated';
     PERFORM public.submit_test_attempt(attempt,
       jsonb_build_object('50000000-0000-0000-0000-000000000007',c.correct_answer));
     EXECUTE 'RESET ROLE';
   EXCEPTION WHEN invalid_parameter_value THEN
     failed := position('Answer is not a valid option' IN SQLERRM)>0;
   END;
   PERFORM public.test_assert(failed,'forged answer matching invalid key is denied for ' || c.label);
   PERFORM public.test_assert(NOT EXISTS(SELECT 1 FROM public.test_attempts WHERE session_id=attempt)
     AND EXISTS(SELECT 1 FROM public.test_attempt_sessions WHERE id=attempt AND status='in_progress'),
     'rejected forged answer leaves the same attempt open for ' || c.label);
   EXECUTE 'SET LOCAL ROLE authenticated';
   result := public.submit_test_attempt(attempt,
     jsonb_build_object('50000000-0000-0000-0000-000000000007',c.legal_answer));
   EXECUTE 'RESET ROLE';
   PERFORM public.test_assert(result @> '{"score":0,"maxScore":1,"passed":false}',
     'legal zero-based answer earns zero without shrinking max score for ' || c.label);
   PERFORM public.test_assert(
     (SELECT questions_snapshot=snapshot FROM public.test_attempt_sessions WHERE id=attempt)
     AND (SELECT correct_answer IS NOT DISTINCT FROM c.correct_answer FROM public.test_questions
       WHERE id='50000000-0000-0000-0000-000000000007'),
     'grading leaves snapshot and source key unchanged for ' || c.label);
 END LOOP;
END;
$$;
ROLLBACK;
