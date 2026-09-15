\set ON_ERROR_STOP on
BEGIN;
-- Synthetic LOCAL fixtures; the transaction is rolled back and never sent to production.
INSERT INTO auth.users(id,email) VALUES
 ('10000000-0000-4000-8000-000000000001','admin@example.test'),
 ('10000000-0000-4000-8000-000000000002','reviewer@example.test'),
 ('10000000-0000-4000-8000-000000000003','other@example.test');
INSERT INTO public.organizations(id,name,email) VALUES
 ('20000000-0000-4000-8000-000000000001','Course owner','owner@example.test'),
 ('20000000-0000-4000-8000-000000000002','Other owner','other@example.test');
INSERT INTO public.courses(id,organization_id,title,is_published) VALUES
 ('7630559a-6caf-42e7-97f9-1cd0e4598c39','20000000-0000-4000-8000-000000000001','Review course',false),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','FOREIGN_COURSE',false);
INSERT INTO public.course_review_grants(course_id,user_id,created_by,updated_by,created_at,expires_at)
 VALUES ('7630559a-6caf-42e7-97f9-1cd0e4598c39','10000000-0000-4000-8000-000000000002',
 '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',now()-interval '2 days','infinity');

CREATE FUNCTION public.test_review_register_denied(target uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  PERFORM public.get_course_review_register(target);
  RAISE EXCEPTION 'FAIL: ungranted register was returned';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$$;

SET LOCAL ROLE anon;
SELECT public.test_review_register_denied('7630559a-6caf-42e7-97f9-1cd0e4598c39');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','','true');
SET LOCAL ROLE authenticated;
SELECT public.test_review_register_denied('7630559a-6caf-42e7-97f9-1cd0e4598c39');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT public.test_review_register_denied('7630559a-6caf-42e7-97f9-1cd0e4598c39');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT public.test_review_register_denied('30000000-0000-4000-8000-000000000002');
SELECT public.test_review_register_denied('30000000-0000-4000-8000-000000000099');
SELECT public.test_assert(
 (public.get_course_review_register('7630559a-6caf-42e7-97f9-1cd0e4598c39')->'records')='[]'::jsonb
 AND (public.get_course_review_register('7630559a-6caf-42e7-97f9-1cd0e4598c39')->>'enrollment_count')='0',
 'authorised empty course is genuinely empty');
RESET ROLE;

INSERT INTO public.lessons(id,course_id,title,type) VALUES
 ('40000000-0000-4000-8000-000000000001','7630559a-6caf-42e7-97f9-1cd0e4598c39','Test 1','test'),
 ('40000000-0000-4000-8000-000000000002','7630559a-6caf-42e7-97f9-1cd0e4598c39','Assignment 1','homework'),
 ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','FOREIGN_LESSON','test');
INSERT INTO public.enrollments(user_id,course_id,status,progress,started_at) VALUES
 ('50000000-0000-4000-8000-000000000001','7630559a-6caf-42e7-97f9-1cd0e4598c39','active',25,'2026-09-01'),
 ('50000000-0000-4000-8000-000000000002','7630559a-6caf-42e7-97f9-1cd0e4598c39','completed',100,'2026-09-02'),
 ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','FOREIGN_STATUS',99,'2026-09-01');
INSERT INTO public.test_attempts(user_id,lesson_id,score,max_score,answers,completed_at) VALUES
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',4,5,'{"secret":"PRIVATE_ANSWER"}','2026-09-03'),
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',991,999,'{}','2026-09-03'),
 ('50000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001',888,999,'{}','2026-09-03');
INSERT INTO public.homework_submissions(student_id,lesson_id,course_id,organization_id,status,score,content,reviewer_comment) VALUES
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','7630559a-6caf-42e7-97f9-1cd0e4598c39','20000000-0000-4000-8000-000000000001','revision',null,'PRIVATE_CONTENT','PRIVATE_COMMENT'),
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','FOREIGN_HW',991,'PRIVATE_CONTENT',null),
 -- Malformed cross-course or cross-organisation links must also be excluded.
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','7630559a-6caf-42e7-97f9-1cd0e4598c39','20000000-0000-4000-8000-000000000001','FOREIGN_LINK',991,null,null),
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','7630559a-6caf-42e7-97f9-1cd0e4598c39','20000000-0000-4000-8000-000000000002','FOREIGN_ORG',991,null,null);

SET LOCAL ROLE authenticated;
DO $$
DECLARE result jsonb;
BEGIN
 result := public.get_course_review_register('7630559a-6caf-42e7-97f9-1cd0e4598c39');
 PERFORM public.test_assert(result->>'enrollment_count'='2','exact current-course enrolment count');
 PERFORM public.test_assert(jsonb_array_length(result->'records')=2,'two genuine records only');
 PERFORM public.test_assert(result#>>'{records,0,status}'='active' AND result#>>'{records,0,progress}'='25','stored status and progress');
 PERFORM public.test_assert(result#>>'{records,0,tests,0,score}'='4' AND result#>>'{records,0,tests,0,max_score}'='5','real score only');
 PERFORM public.test_assert(jsonb_array_length(result#>'{records,0,tests}')=1,'foreign course and foreign learner attempts excluded');
 PERFORM public.test_assert(jsonb_array_length(result#>'{records,0,assignments}')=1,'foreign course/lesson/organisation submissions excluded');
 PERFORM public.test_assert(result#>>'{records,0,assignments,0,status}'='revision','actual assignment status preserved');
 PERFORM public.test_assert(result#>'{records,1,tests}'='[]'::jsonb AND result#>'{records,1,assignments}'='[]'::jsonb,'no invented results for second enrolment');
 PERFORM public.test_assert(result::text !~ 'FOREIGN_|PRIVATE_|50000000|user_id|student_id|enrollment_id|email|full_name|answers|reviewer_comment|content','private fields/identifiers/content absent');
 PERFORM public.test_assert((SELECT count(*) FROM public.enrollments)=0,'direct table visibility not widened');
 BEGIN
  INSERT INTO public.enrollments(user_id,course_id) VALUES ('10000000-0000-4000-8000-000000000002','7630559a-6caf-42e7-97f9-1cd0e4598c39');
  RAISE EXCEPTION 'FAIL: reviewer was able to write enrolments';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$$;
RESET ROLE;
SELECT public.test_assert((SELECT count(*) FROM public.enrollments)=3 AND (SELECT count(*) FROM public.test_attempts)=3 AND (SELECT count(*) FROM public.homework_submissions)=4,'reads created or changed no study records');

UPDATE public.course_review_grants SET expires_at=now()-interval '1 hour';
SET LOCAL ROLE authenticated;
SELECT public.test_review_register_denied('7630559a-6caf-42e7-97f9-1cd0e4598c39');
RESET ROLE;
UPDATE public.course_review_grants SET expires_at='infinity',revoked_at=now();
SET LOCAL ROLE authenticated;
SELECT public.test_review_register_denied('7630559a-6caf-42e7-97f9-1cd0e4598c39');
RESET ROLE;
UPDATE public.course_review_grants SET revoked_at=null;
UPDATE public.courses SET is_published=true WHERE id='7630559a-6caf-42e7-97f9-1cd0e4598c39';
SET LOCAL ROLE authenticated;
SELECT public.test_review_register_denied('7630559a-6caf-42e7-97f9-1cd0e4598c39');
RESET ROLE;
ROLLBACK;
\echo COURSE_REVIEW_REGISTER_CONTRACT_PASS
