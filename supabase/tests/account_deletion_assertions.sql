-- Disposable PostgreSQL only. Run AFTER account_deletion_setup.py output.
-- UUIDs/emails/content below are synthetic, never production identities.
\set ON_ERROR_STOP on
CREATE FUNCTION public.fixture_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END; $$;
INSERT INTO auth.users(id,email) VALUES
 ('11111111-1111-4111-8111-111111111111','learner@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','teacher@example.invalid'),
 ('33333333-3333-4333-8333-333333333333','other@example.invalid'),
 ('44444444-4444-4444-8444-444444444444','empty@example.invalid'),
 ('55555555-5555-4555-8555-555555555555','document@example.invalid');
INSERT INTO public.organizations(id,name,email) VALUES
 ('10000000-0000-4000-8000-000000000001','Fixture A','a@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','Fixture B','b@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','Unused registration','empty@example.invalid');
INSERT INTO public.profiles(user_id,organization_id,full_name,email,phone,login,generated_password,bio,department) VALUES
 ('11111111-1111-4111-8111-111111111111','10000000-0000-4000-8000-000000000001','Synthetic learner','learner@example.invalid','+70000000000','learner','not-a-real-password','Private free text','Private dept'),
 ('22222222-2222-4222-8222-222222222222','10000000-0000-4000-8000-000000000001','Teacher','teacher@example.invalid',NULL,NULL,NULL,NULL,NULL),
 ('33333333-3333-4333-8333-333333333333','10000000-0000-4000-8000-000000000002','Other tenant','other@example.invalid',NULL,NULL,NULL,NULL,NULL),
 ('44444444-4444-4444-8444-444444444444','10000000-0000-4000-8000-000000000003','Empty owner','empty@example.invalid',NULL,NULL,NULL,NULL,NULL),
 ('55555555-5555-4555-8555-555555555555','10000000-0000-4000-8000-000000000001','Issued doc','document@example.invalid',NULL,NULL,NULL,NULL,NULL);
INSERT INTO public.user_roles(user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','student'),('22222222-2222-4222-8222-222222222222','organization'),
 ('33333333-3333-4333-8333-333333333333','student'),('44444444-4444-4444-8444-444444444444','organization'),('55555555-5555-4555-8555-555555555555','student');
INSERT INTO public.courses(id,organization_id,title,system_key) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Fixture course',NULL),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','Welcome','welcome');
INSERT INTO public.lessons(id,course_id,title,type) VALUES('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Fixture test','test');
INSERT INTO public.enrollments(id,user_id,course_id,status,progress,time_spent,completed_at) VALUES
 ('40000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','20000000-0000-4000-8000-000000000001','completed',100,1234,'2026-10-06T12:00:00Z');
INSERT INTO public.test_attempts(id,user_id,lesson_id,score,max_score,answers,completed_at) VALUES
 ('50000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','30000000-0000-4000-8000-000000000001',9,10,'{"essay":"Synthetic private essay"}','2026-10-06T12:00:00Z');
INSERT INTO public.course_manual_credits(enrollment_id,credited_by,credited_at) VALUES('40000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','2026-10-06T12:00:00Z');
INSERT INTO public.lesson_progress(user_id,lesson_id,completed) VALUES('11111111-1111-4111-8111-111111111111','30000000-0000-4000-8000-000000000001',true);
INSERT INTO public.student_frdo_data(user_id,organization_id,snils) VALUES('11111111-1111-4111-8111-111111111111','10000000-0000-4000-8000-000000000001','SYNTHETIC');
INSERT INTO public.pep_agreements(id,user_id,organization_id,agreement_text) VALUES('60000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','10000000-0000-4000-8000-000000000001','Synthetic standalone personal agreement');
INSERT INTO public.organization_offer_acceptances(user_id,organization_id) VALUES('44444444-4444-4444-8444-444444444444','10000000-0000-4000-8000-000000000003');
-- Self-attributed events must be deleted, not UPDATE-scrubbed through the fence.
INSERT INTO public.role_audit_log(target_user_id,performed_by,performed_by_name) VALUES('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Synthetic learner');
INSERT INTO public.student_deletion_log(student_id,deleted_by,deleted_by_name) VALUES('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Synthetic learner');
INSERT INTO public.student_login_tokens(user_id,organization_id,token) VALUES('11111111-1111-4111-8111-111111111111','10000000-0000-4000-8000-000000000001','99999999-9999-4999-8999-999999999999');
INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES
 ('avatars','11111111-1111-4111-8111-111111111111/photo.jpg','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'),
 ('avatars','33333333-3333-4333-8333-333333333333/photo.jpg','33333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333');
INSERT INTO public.education_document_records(organization_id,user_id,reg_number,full_name,document_type,document_number,issue_date,specialty_name,document_status,delivery_method)
 VALUES('10000000-0000-4000-8000-000000000001','55555555-5555-4555-8555-555555555555','FIXTURE','Issued doc','certificate','1','2026-10-06','Fixture','issued','personal');
CREATE TEMP TABLE test_state(key text PRIMARY KEY,value jsonb);
-- Service RPCs are not callable by authenticated or anon, even with another ID.
SELECT fixture_assert(NOT has_function_privilege('authenticated','public.account_deletion_begin(uuid,text,text)','EXECUTE'),'authenticated cannot invoke service begin');
SELECT fixture_assert(NOT has_function_privilege('anon','public.account_deletion_status(uuid,text)','EXECUTE'),'receipt queries must go through validated Edge handler');
SELECT fixture_assert((SELECT count(*)=255 FROM pg_policies WHERE policyname='account_deletion_no_revoked_access'),'all 254 public tables plus Storage guarded');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
SELECT fixture_assert(public.account_deletion_prepare('11111111-1111-4111-8111-111111111111',repeat('7',64),repeat('8',64),'account-deletion-v1')->>'code'='CONSENT_REQUIRED','v1 prepare cannot mint a full-delete plan');
SELECT fixture_assert(public.account_deletion_begin('11111111-1111-4111-8111-111111111111',repeat('7',64),NULL)->>'code'='CONSENT_REQUIRED','missing consent cannot revoke access');
SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM account_deletion_revocations),'old consent made no mutation');
-- The PEP FK must not be silently SET NULL on a document even if its party
-- UUIDs do not match the deleted account. This was missed by party-only checks.
INSERT INTO public.document_signatures(id,organization_id,sender_user_id,recipient_user_id,pep_agreement_id,status)
 VALUES('61000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','60000000-0000-4000-8000-000000000001','pending');
SELECT fixture_assert((public.account_deletion_prepare('11111111-1111-4111-8111-111111111111',repeat('7',64),repeat('8',64),'full-personal-data-v1')->'blockers') @> '[{"code":"DOCUMENTARY_RELATION_REVIEW_REQUIRED"}]','indirect PEP document relationship blocks before start');
SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM account_deletion_revocations),'documentary refusal did not revoke anyone');
DELETE FROM public.document_signatures WHERE id='61000000-0000-4000-8000-000000000001';
INSERT INTO public.organization_offer_acceptances(user_id,organization_id) VALUES('11111111-1111-4111-8111-111111111111','10000000-0000-4000-8000-000000000001');
SELECT fixture_assert((public.account_deletion_prepare('11111111-1111-4111-8111-111111111111',repeat('7',64),repeat('8',64),'full-personal-data-v1')->'blockers') @> '[{"code":"DOCUMENTARY_RELATION_REVIEW_REQUIRED"}]','active organization offer is not disposable personal data');
DELETE FROM public.organization_offer_acceptances WHERE user_id='11111111-1111-4111-8111-111111111111';
INSERT INTO test_state VALUES('old',public.account_deletion_prepare('11111111-1111-4111-8111-111111111111',repeat('a',64),repeat('b',64),'full-personal-data-v1'));
SELECT fixture_assert((SELECT value->>'canDelete'='true' FROM test_state WHERE key='old'),'ordinary learner with completed history may delete');
INSERT INTO test_state VALUES('new',public.account_deletion_prepare('11111111-1111-4111-8111-111111111111',repeat('c',64),repeat('d',64),'full-personal-data-v1'));
SELECT fixture_assert(public.account_deletion_begin('11111111-1111-4111-8111-111111111111',repeat('a',64),'full-personal-data-v1')->>'code'='PLAN_EXPIRED','new preview invalidates old confirmation');
-- A file appearing after preview invalidates that exact plan.
INSERT INTO storage.objects(bucket_id,name,owner) VALUES('avatars','11111111-1111-4111-8111-111111111111/new.jpg','11111111-1111-4111-8111-111111111111');
SELECT fixture_assert(public.account_deletion_begin('11111111-1111-4111-8111-111111111111',repeat('c',64),'full-personal-data-v1')->>'code'='PLAN_CHANGED','new private upload detected');
INSERT INTO test_state VALUES('version',public.account_deletion_prepare('11111111-1111-4111-8111-111111111111',repeat('7',64),repeat('8',64),'full-personal-data-v1'));
UPDATE storage.objects SET updated_at=now()+interval '1 second' WHERE name='11111111-1111-4111-8111-111111111111/photo.jpg';
SELECT fixture_assert(public.account_deletion_begin('11111111-1111-4111-8111-111111111111',repeat('7',64),'full-personal-data-v1')->>'code'='PLAN_CHANGED','same-path object replacement invalidates snapshot');
INSERT INTO test_state VALUES('final',public.account_deletion_prepare('11111111-1111-4111-8111-111111111111',repeat('e',64),repeat('f',64),'full-personal-data-v1'));
INSERT INTO test_state VALUES('begun',public.account_deletion_begin('11111111-1111-4111-8111-111111111111',repeat('e',64),'full-personal-data-v1'));
SELECT fixture_assert((SELECT value ? 'requestId' FROM test_state WHERE key='begun'),'begin confirmed');
-- Another active org actor is otherwise allowed by Storage RLS to upload
-- under a learner UUID. The subject-level trigger closes that path at begin.
CREATE POLICY fixture_frdo_staff ON public.student_frdo_data TO authenticated USING(auth.uid()='22222222-2222-4222-8222-222222222222') WITH CHECK(auth.uid()='22222222-2222-4222-8222-222222222222');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"22222222-2222-4222-8222-222222222222"}',false);
DO $$ BEGIN
 UPDATE public.student_frdo_data SET user_id='33333333-3333-4333-8333-333333333333' WHERE user_id='11111111-1111-4111-8111-111111111111';
 RAISE EXCEPTION 'revoked subject data was reassigned outside deletion scope';
EXCEPTION WHEN insufficient_privilege THEN
 IF SQLERRM<>'Account personal data writes are closed' THEN RAISE; END IF;
END; $$;
DO $$ BEGIN
 INSERT INTO storage.objects(bucket_id,name,owner) VALUES('student-documents','11111111-1111-4111-8111-111111111111/late-passport.jpg','22222222-2222-4222-8222-222222222222');
 RAISE EXCEPTION 'late other-actor personal upload was accepted';
EXCEPTION WHEN insufficient_privilege THEN
 IF SQLERRM<>'Account personal uploads are closed' THEN RAISE; END IF;
END; $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
DO $$ BEGIN
 INSERT INTO public.document_signatures(organization_id,sender_user_id,recipient_user_id,pep_agreement_id,status)
 VALUES('10000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','60000000-0000-4000-8000-000000000001','pending');
 RAISE EXCEPTION 'late indirect PEP attachment was accepted';
EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'Account personal data writes are closed' THEN RAISE; END IF; END; $$;
DO $$ BEGIN
 UPDATE storage.objects SET updated_at=now() WHERE name='11111111-1111-4111-8111-111111111111/photo.jpg';
 RAISE EXCEPTION 'upsert after begin was accepted';
EXCEPTION WHEN insufficient_privilege THEN
 IF SQLERRM<>'Account personal uploads are closed' THEN RAISE; END IF;
END; $$;
-- Simulate a stale work manifest in this isolated fixture. Exact subject
-- scanning must catch remaining files independently of that manifest.
UPDATE account_deletion_jobs SET files='[]' WHERE id=(SELECT (value->>'requestId')::uuid FROM test_state WHERE key='final');
SELECT fixture_assert(public.account_deletion_erase_data((SELECT (value->>'requestId')::uuid FROM test_state WHERE key='final'),repeat('f',64))->>'code'='DELETION_UNAVAILABLE','stale manifest cannot hide personal files');
SELECT fixture_assert(jsonb_array_length(public.account_deletion_work((SELECT (value->>'requestId')::uuid FROM test_state WHERE key='final'),repeat('f',64))->'files')=2,'resume rehydrates exact remaining files');

SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM student_login_tokens WHERE user_id='11111111-1111-4111-8111-111111111111'),'login shortcuts revoked at begin');
SELECT fixture_assert(public.account_deletion_erase_data((SELECT (value->>'requestId')::uuid FROM test_state WHERE key='final'),repeat('f',64))->>'code'='DELETION_UNAVAILABLE','DB scrub refuses unresolved Storage files');
-- Simulates Storage API metadata removal only; real blobs are verified by Edge QA.
DELETE FROM storage.objects WHERE name LIKE '11111111-1111-4111-8111-111111111111/%';
SELECT public.account_deletion_erase_data((SELECT (value->>'requestId')::uuid FROM test_state WHERE key='final'),repeat('f',64));
SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM enrollments WHERE user_id='11111111-1111-4111-8111-111111111111'),'own enrollment physically removed');
SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM test_attempts WHERE user_id='11111111-1111-4111-8111-111111111111'),'scores and essays physically removed');
SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM course_manual_credits WHERE enrollment_id='40000000-0000-4000-8000-000000000001'),'own credit removed with enrollment, not a reset of another learner');
SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM profiles WHERE user_id='11111111-1111-4111-8111-111111111111'),'own profile physically removed');
SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM pep_agreements WHERE user_id='11111111-1111-4111-8111-111111111111'),'unattached personal PEP removed with account');
SELECT fixture_assert(public.account_deletion_personal_row_counts('11111111-1111-4111-8111-111111111111')='[]'::jsonb,'no own rows remain in the full audited direct map');
SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM enrollment_history WHERE user_id='11111111-1111-4111-8111-111111111111'),'real delete-trigger-generated history cleared');
SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM role_audit_log WHERE target_user_id='11111111-1111-4111-8111-111111111111') AND NOT EXISTS(SELECT 1 FROM student_deletion_log WHERE student_id='11111111-1111-4111-8111-111111111111'),'self-attributed audit rows removed without fence deadlock');
DO $$ BEGIN
 INSERT INTO public.group_completion_decisions(user_id) VALUES('11111111-1111-4111-8111-111111111111');
 RAISE EXCEPTION 'late completion decision was accepted';
EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'Account personal data writes are closed' THEN RAISE; END IF; END; $$;
DO $$ BEGIN
 INSERT INTO public.group_completion_decision_history(user_id) VALUES('11111111-1111-4111-8111-111111111111');
 RAISE EXCEPTION 'late immutable history was accepted';
EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'Account personal data writes are closed' THEN RAISE; END IF; END; $$;
DO $$ BEGIN
 INSERT INTO public.student_identity_documents(user_id,organization_id,type,name) VALUES('11111111-1111-4111-8111-111111111111','10000000-0000-4000-8000-000000000001','passport','late');
 RAISE EXCEPTION 'late staff subject data was accepted';
EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'Account personal data writes are closed' THEN RAISE; END IF; END; $$;
DO $$ BEGIN
 INSERT INTO public.enrollments(user_id,course_id) VALUES('11111111-1111-4111-8111-111111111111','20000000-0000-4000-8000-000000000001');
 RAISE EXCEPTION 'late enrollment was accepted';
EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'Account personal data writes are closed' THEN RAISE; END IF; END; $$;
SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM student_frdo_data WHERE user_id='11111111-1111-4111-8111-111111111111'),'draft passport/SNILS erased');
SELECT fixture_assert((SELECT email='other@example.invalid' FROM profiles WHERE user_id='33333333-3333-4333-8333-333333333333'),'other tenant preserved');
SELECT fixture_assert(EXISTS(SELECT 1 FROM storage.objects WHERE name='33333333-3333-4333-8333-333333333333/photo.jpg'),'other tenant file preserved');
SELECT fixture_assert(public.account_deletion_complete((SELECT (value->>'requestId')::uuid FROM test_state WHERE key='final'),repeat('f',64))->>'code'='DELETION_UNAVAILABLE','completion requires independent Auth absence');
DELETE FROM auth.users WHERE id='11111111-1111-4111-8111-111111111111';
SELECT fixture_assert(public.account_deletion_complete((SELECT (value->>'requestId')::uuid FROM test_state WHERE key='final'),repeat('f',64))->>'status'='deleted','terminal receipt after hard Auth deletion');
SELECT fixture_assert(public.account_deletion_status((SELECT (value->>'requestId')::uuid FROM test_state WHERE key='final'),repeat('0',64))->>'code'='INVALID_RECEIPT','wrong receipt secret rejected');
SELECT fixture_assert((SELECT user_id IS NULL AND snapshot='{}'::jsonb AND files='[]'::jsonb FROM account_deletion_jobs WHERE id=(SELECT (value->>'requestId')::uuid FROM test_state WHERE key='final')),'completed ledger has no profile or paths');
-- An old access JWT still contains the UUID, but cannot read retained history.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',false);
SELECT fixture_assert((SELECT count(*)=0 FROM public.profiles),'revoked JWT cannot read profiles');
SELECT fixture_assert((SELECT count(*)=0 FROM public.test_attempts),'revoked JWT cannot read results');
SELECT fixture_assert((SELECT count(*)=0 FROM storage.objects),'revoked JWT blocked by Storage RLS');
DO $$ BEGIN PERFORM public.account_deletion_request_guard(); RAISE EXCEPTION 'guard did not reject revoked JWT'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; $$;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"33333333-3333-4333-8333-333333333333"}',false);
SELECT fixture_assert((SELECT count(*)=1 FROM profiles),'ordinary user retains own profile access');
SELECT fixture_assert((SELECT count(*)=1 FROM storage.objects),'ordinary user retains own Storage access');
SELECT public.account_deletion_request_guard();
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
-- Exact issued-doc blocker affects only the corresponding subject.
SELECT fixture_assert((public.account_deletion_prepare('55555555-5555-4555-8555-555555555555',repeat('1',64),repeat('2',64),'full-personal-data-v1')->'blockers') @> '[{"code":"RETENTION_POLICY_REQUIRED"}]','issued document creates explicit retention gate');
SELECT fixture_assert((public.account_deletion_prepare('22222222-2222-4222-8222-222222222222',repeat('3',64),repeat('4',64),'full-personal-data-v1')->'blockers') @> '[{"code":"OWNERSHIP_TRANSFER_REQUIRED"}]','owner with other learners must transfer');
INSERT INTO test_state VALUES('empty',public.account_deletion_prepare('44444444-4444-4444-8444-444444444444',repeat('5',64),repeat('6',64),'full-personal-data-v1'));
SELECT fixture_assert((SELECT value->>'canDelete'='true' FROM test_state WHERE key='empty'),'unused owner can delete without making another account');
SELECT public.account_deletion_begin('44444444-4444-4444-8444-444444444444',repeat('5',64),'full-personal-data-v1');
SELECT public.account_deletion_erase_data((SELECT (value->>'requestId')::uuid FROM test_state WHERE key='empty'),repeat('6',64));
SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM organizations WHERE id='10000000-0000-4000-8000-000000000003'),'unused organization removed');
SELECT fixture_assert(NOT EXISTS(SELECT 1 FROM organization_offer_acceptances WHERE user_id='44444444-4444-4444-8444-444444444444'),'unused own organization offer removed with organization');
DELETE FROM auth.users WHERE id='44444444-4444-4444-8444-444444444444';
SELECT fixture_assert(public.account_deletion_complete((SELECT (value->>'requestId')::uuid FROM test_state WHERE key='empty'),repeat('6',64))->>'status'='deleted','unused owner deletion completed');
-- The exact production immutable trigger is installed in this fixture.
INSERT INTO group_completion_decision_history(decision_id,revision,organization_id,group_id,user_id,decision)
 VALUES(gen_random_uuid(),1,'10000000-0000-4000-8000-000000000002',gen_random_uuid(),'33333333-3333-4333-8333-333333333333','{"decision_note":"Synthetic private institutional note"}');
DO $$ BEGIN
 UPDATE group_completion_decision_history SET decision='{}' WHERE user_id='33333333-3333-4333-8333-333333333333';
 RAISE EXCEPTION 'immutable production history guard was bypassed';
EXCEPTION WHEN insufficient_privilege THEN
 IF SQLERRM<>'completion_history_is_immutable' THEN RAISE; END IF;
END; $$;
SELECT fixture_assert((public.account_deletion_prepare('33333333-3333-4333-8333-333333333333',repeat('9',64),repeat('0',64),'full-personal-data-v1')->'blockers') @> '[{"code":"PROTECTED_HISTORY_REVIEW_REQUIRED"}]','immutable institutional history gets exact blocker before mutation');
-- Verify the guard uses an initPlan and preserves a normal 10k-row RLS scan.
CREATE POLICY fixture_errors_self ON public.client_error_logs TO authenticated USING(user_id=auth.uid());
INSERT INTO public.client_error_logs(user_id) SELECT '33333333-3333-4333-8333-333333333333'::uuid FROM generate_series(1,10000);
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"33333333-3333-4333-8333-333333333333"}',false);
SELECT fixture_assert((SELECT count(*)=10000 FROM client_error_logs),'normal 10k-row scope unchanged');
EXPLAIN(ANALYZE,COSTS OFF,SUMMARY OFF) SELECT count(*) FROM client_error_logs;
RESET ROLE;
SELECT 'S042 SQL assertions passed' AS result;
