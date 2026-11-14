-- SOURCE-ONLY unit regression. No assertion in this file has been executed.
-- Prerequisites: dedicated minimal-unit-bootstrap.sql, then exact candidate
-- migration. Full production UC013/PLP/RLS/Cloud/UI acceptance is NOT implied.
\set ON_ERROR_STOP on
BEGIN;
DO $f$ BEGIN
 IF current_database()<>'sintagma_pcr_v4_r2_lab_20261028' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
    OR current_setting('pcr.lab_authorized',true) IS DISTINCT FROM 'source-reviewed-root-run-only' THEN RAISE EXCEPTION 'PCR_UNIT_LAB_ONLY';END IF;
END $f$;
CREATE TEMP TABLE expected_history AS SELECT * FROM public.qa_retained_results;
CREATE TEMP TABLE expected_client AS SELECT * FROM public.marketplace_courses WHERE course_id='30000000-0000-0000-0000-000000000003';
CREATE TEMP TABLE unit_context(key text PRIMARY KEY,value jsonb);
GRANT ALL ON unit_context TO authenticated;
CREATE FUNCTION public.qa_pcr_assert_true(p_ok boolean,p_name text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'PCR_TEST_FAILED: %',p_name;END IF;RAISE NOTICE 'PCR_UNIT_PASS %',p_name;END $f$;
CREATE FUNCTION public.qa_pcr_expect_error(p_sql text,p_prefix text,p_name text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_message text;BEGIN
 BEGIN EXECUTE p_sql;EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_message=MESSAGE_TEXT;END;
 IF v_message IS NULL OR v_message NOT LIKE p_prefix||'%' THEN RAISE EXCEPTION 'PCR_TEST_EXPECTED_ERROR: %, expected %, got %',p_name,p_prefix,v_message;END IF;
 RAISE NOTICE 'PCR_UNIT_PASS %',p_name;
END $f$;
SELECT public.qa_pcr_assert_true((SELECT count(*)=0 FROM public.platform_course_publication_review_events)
 AND (SELECT is_validated FROM public.marketplace_courses WHERE id='70000000-0000-0000-0000-000000000002')
 AND (SELECT is_validated FROM public.marketplace_courses WHERE id='70000000-0000-0000-0000-000000000003'),'PCRV2S01 empty new store preserves legacy and client flags');
-- SOURCE PROPOSAL ONLY. Insert after PCRV2S01 in a NEW revision, before the first role-claim assignment in this fresh regression psql connection.
-- Do not edit frozen V3, do not use RESET/set_config(NULL) to simulate a never-set custom GUC.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
DO $qa_pre$ BEGIN
 IF auth.uid() IS DISTINCT FROM '10000000-0000-0000-0000-000000000001'::uuid OR auth.role() IS NOT NULL
 OR NOT public.has_role('admin'::public.app_role,auth.uid())
 OR NOT public.uc_platform_document_action_allowed(auth.uid(),'write')
 OR NOT public.account_deletion_access_allowed()
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND blocked_at IS NULL AND archived_at IS NULL)
 THEN RAISE EXCEPTION 'PCR_AUTH_SUBCASE_PRECONDITIONS_NOT_POSITIVE_ADMIN_WITH_NULL_ROLE';END IF;
END;$qa_pre$;
SET LOCAL ROLE authenticated;
DO $qa_null$
DECLARE v_state text;v_message text;
BEGIN
 IF current_user IS DISTINCT FROM 'authenticated' OR auth.role() IS NOT NULL THEN RAISE EXCEPTION 'PCR_AUTH_SUBCASE_ACTUAL_AUTHENTICATED_SQL_ROLE_AND_NULL_CLAIM_REQUIRED';END IF;
 BEGIN
  PERFORM public.read_platform_course_publication_readiness('70000000-0000-0000-0000-000000000001');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;END;
 IF v_state IS DISTINCT FROM '42501' OR v_message IS DISTINCT FROM 'PCR_MODERATOR_REQUIRED' THEN
  RAISE EXCEPTION 'PCR_AUTH_SUBCASE_EXPECTED_NULL_ROLE_DENIAL_GOT_STATE_%_MESSAGE_%',v_state,v_message;
 END IF;
 RAISE NOTICE 'PCR_AUTH_SUBCASE_PASS S02_NULL_ROLE_POSITIVE_ADMIN_DENIED';
END;$qa_null$;
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $qa_positive$
DECLARE v_ready jsonb;
BEGIN
 IF current_user IS DISTINCT FROM 'authenticated' OR auth.uid() IS DISTINCT FROM '10000000-0000-0000-0000-000000000001'::uuid OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'PCR_AUTH_SUBCASE_POSITIVE_CONTEXT_REQUIRED';END IF;
 v_ready:=public.read_platform_course_publication_readiness('70000000-0000-0000-0000-000000000001');
 IF v_ready->>'state' IS DISTINCT FROM 'review_missing' OR v_ready->>'course_id' IS DISTINCT FROM '30000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'PCR_AUTH_SUBCASE_SAME_ADMIN_VALID_ROLE_NOT_ALLOWED';END IF;
 RAISE NOTICE 'PCR_AUTH_SUBCASE_PASS S02_SAME_ADMIN_AUTHENTICATED_ALLOWED';
END;$qa_positive$;
-- Continue original PCRV2S02 unchanged: it assigns ordinary org UID and authenticated claim, then checks moderator denial.

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true),set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT public.qa_pcr_expect_error($q$SELECT public.read_platform_course_publication_readiness('70000000-0000-0000-0000-000000000001')$q$,'PCR_MODERATOR_REQUIRED','PCRV2S02 ordinary organization cannot enter review');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT public.qa_pcr_expect_error($q$SELECT count(*) FROM public.platform_course_publication_review_events$q$,'permission denied','PCRV2S03 moderator cannot directly read private evidence table');
SELECT public.qa_pcr_assert_true(public.read_platform_course_publication_readiness('70000000-0000-0000-0000-000000000002')->>'state'='legacy_unchanged','PCRV2S04 legacy is truthfully unreviewed without changing flag');
SELECT public.qa_pcr_expect_error($q$UPDATE public.marketplace_courses SET is_validated=true WHERE id='70000000-0000-0000-0000-000000000001'$q$,'PCR_PUBLICATION_RPC_REQUIRED','PCRV2S05 direct own promotion without review is blocked');
INSERT INTO unit_context VALUES('ready',public.read_platform_course_publication_readiness('70000000-0000-0000-0000-000000000001'));
INSERT INTO unit_context VALUES('incomplete',public.submit_platform_course_publication_proposal('70000000-0000-0000-0000-000000000001',(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),'{"schema_version":1}','80000000-0000-0000-0000-000000000001'));
SELECT public.qa_pcr_expect_error($q$SELECT public.record_platform_course_publication_review('70000000-0000-0000-0000-000000000001',(SELECT (value->>'proposal_id')::uuid FROM unit_context WHERE key='incomplete'),(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),'accepted_for_template_publication','Explicit TEST review',clock_timestamp()+interval '1 day','80000000-0000-0000-0000-000000000002')$q$,'PCR_REVIEW_INCOMPLETE','PCRV2S06 incomplete passport cannot become accepted');
INSERT INTO unit_context VALUES('dossier',jsonb_build_object('schema_version',1,'passport',jsonb_build_object(
 'purpose','Synthetic test only','audience','QA actors','entry_requirements','None for synthetic fixture','outcomes','Read control code',
 'teaching_plan','Read text then synthetic question','workload','Synthetic fixture, not actual academic hours','assessment_criteria','Control code matches inline text','applicability','Test, not real education or qualification'),
 'source_review',jsonb_build_object('state','not_applicable','rationale','Original inline synthetic text without legal claims'),
 'subject_keys',jsonb_build_object('state','confirmed','rationale','The answer matches the literal inline control code','evidence',jsonb_build_array(jsonb_build_object('reference','QA inline text plus synthetic question','edition','Exact TEST fixture','checked_at','2026-10-28'))),
 'practices',jsonb_build_object('state','not_applicable','rationale','No real practice in this synthetic fixture'),
 'rights',jsonb_build_object('state','confirmed','rationale','Original synthetic fixture text','evidence',jsonb_build_array(jsonb_build_object('reference','This test fixture source','edition','Exact TEST fixture','checked_at','2026-10-28'))),
 'document_links',jsonb_build_object('state','not_applicable','rationale','No files or centre programme in synthetic fixture')));
INSERT INTO unit_context VALUES('proposal',public.submit_platform_course_publication_proposal('70000000-0000-0000-0000-000000000001',(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),(SELECT value FROM unit_context WHERE key='dossier'),'80000000-0000-0000-0000-000000000003'));
SELECT public.qa_pcr_assert_true(public.submit_platform_course_publication_proposal('70000000-0000-0000-0000-000000000001',(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),(SELECT value FROM unit_context WHERE key='dossier'),'80000000-0000-0000-0000-000000000003')->>'replayed'='true','PCRV2S07 same proposal request replays without a second event');
SELECT public.qa_pcr_expect_error($q$SELECT public.submit_platform_course_publication_proposal('70000000-0000-0000-0000-000000000001',(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),'{"schema_version":1,"different":true}','80000000-0000-0000-0000-000000000003')$q$,'PCR_REQUEST_CONFLICT','PCRV2S08 changed payload cannot reuse request id');
SELECT public.qa_pcr_expect_error($q$SELECT public.record_platform_course_publication_review('70000000-0000-0000-0000-000000000001',(SELECT (value->>'proposal_id')::uuid FROM unit_context WHERE key='proposal'),(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),NULL,'Explicit TEST review',clock_timestamp()+interval '1 day','80000000-0000-0000-0000-000000000004')$q$,'PCR_REVIEW_INCOMPLETE','PCRV2S09 null decision fails closed');
INSERT INTO unit_context VALUES('accepted',public.record_platform_course_publication_review('70000000-0000-0000-0000-000000000001',(SELECT (value->>'proposal_id')::uuid FROM unit_context WHERE key='proposal'),(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),'accepted_for_template_publication','Explicit synthetic fixture subject and scope review, not a real approval',clock_timestamp()+interval '1 day','80000000-0000-0000-0000-000000000005'));
INSERT INTO unit_context VALUES('published',public.publish_platform_course_proposal('70000000-0000-0000-0000-000000000001',(SELECT (value->>'proposal_id')::uuid FROM unit_context WHERE key='proposal'),(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),'80000000-0000-0000-0000-000000000006'));
SELECT public.qa_pcr_assert_true((SELECT value->>'id'='70000000-0000-0000-0000-000000000001' AND value->>'is_validated'='true' AND value->>'receipt_id' IS NOT NULL FROM unit_context WHERE key='published'),'PCRV2S10 exact inline proposal review and explicit promotion creates receipt');
SELECT public.qa_pcr_assert_true(public.publish_platform_course_proposal('70000000-0000-0000-0000-000000000001',(SELECT (value->>'proposal_id')::uuid FROM unit_context WHERE key='proposal'),(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),'80000000-0000-0000-0000-000000000006')->>'replayed'='true','PCRV2S11 publish retry returns historical receipt not a new claim');
SET CONSTRAINTS pcr_final_claim IMMEDIATE;
-- End this accepted synthetic operation before exercising a later edit. A
-- later source transaction must invalidate rather than rewrite old history.
COMMIT;
BEGIN;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
UPDATE public.test_questions SET correct_answer=1 WHERE id='60000000-0000-0000-0000-000000000001';
SELECT public.qa_pcr_assert_true(public.read_platform_course_publication_readiness('70000000-0000-0000-0000-000000000001')->>'state'='review_stale'
 AND NOT (SELECT is_validated FROM public.marketplace_courses WHERE id='70000000-0000-0000-0000-000000000001'),'PCRV2S12 source key edit invalidates current review and listing');
SELECT public.qa_pcr_expect_error($q$SELECT public.publish_platform_course_proposal('70000000-0000-0000-0000-000000000001',(SELECT (value->>'proposal_id')::uuid FROM unit_context WHERE key='proposal'),(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),'80000000-0000-0000-0000-000000000007')$q$,'PCR_SOURCE_CHANGED_RETRY','PCRV2S13 stale edition cannot promote');
-- A byte URL without immutable file evidence is always unconfirmed, even if
-- the human-supplied dossier uses not_applicable for document links.
INSERT INTO public.lesson_attachments(id,lesson_id,name,file_url,order_index) VALUES('90000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','TEST mutable URL','https://example.invalid/test.pdf',0);
UPDATE unit_context SET value=public.read_platform_course_publication_readiness('70000000-0000-0000-0000-000000000001') WHERE key='ready';
INSERT INTO unit_context VALUES('file_proposal',public.submit_platform_course_publication_proposal('70000000-0000-0000-0000-000000000001',(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),(SELECT value FROM unit_context WHERE key='dossier'),'80000000-0000-0000-0000-000000000008'));
SELECT public.qa_pcr_assert_true(public.read_platform_course_publication_readiness('70000000-0000-0000-0000-000000000001')->'blockers' @> '["file_or_external_material_edition_unconfirmed"]'::jsonb,'PCRV2S14 mutable file URL cannot masquerade as exact bytes');
RESET ROLE;
SELECT public.qa_pcr_expect_error($q$DELETE FROM public.platform_course_publication_review_events$q$,'PCR_IMMUTABLE_EVENT_HISTORY','PCRV2S15 even owner-level delete cannot rewrite review history');
SELECT public.qa_pcr_assert_true(NOT EXISTS((SELECT * FROM public.qa_retained_results EXCEPT TABLE expected_history) UNION ALL (TABLE expected_history EXCEPT SELECT * FROM public.qa_retained_results))
 AND NOT EXISTS((SELECT * FROM public.marketplace_courses WHERE course_id='30000000-0000-0000-0000-000000000003' EXCEPT TABLE expected_client) UNION ALL(TABLE expected_client EXCEPT SELECT * FROM public.marketplace_courses WHERE course_id='30000000-0000-0000-0000-000000000003')),'PCRV2S16 client listing and old result bytes preserved');
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
UPDATE unit_context SET value=public.read_platform_course_publication_readiness('70000000-0000-0000-0000-000000000001') WHERE key='ready';
SELECT public.record_platform_course_publication_review('70000000-0000-0000-0000-000000000001',(SELECT (value->>'proposal_id')::uuid FROM unit_context WHERE key='proposal'),(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),'accepted_for_template_publication','Second explicit synthetic review for same-transaction protection',clock_timestamp()+interval '1 day','80000000-0000-0000-0000-000000000009');
SET CONSTRAINTS pcr_final_claim IMMEDIATE;
SET CONSTRAINTS pcr_final_claim DEFERRED;
SELECT public.qa_pcr_expect_error($q$UPDATE public.lessons SET content='Source edited after accepted claim' WHERE id='50000000-0000-0000-0000-000000000001'$q$,'PCR_MIXED_CLAIM_SOURCE_TRANSACTION','PCRV2S17 immediate then deferred cannot allow a later source edit');
SELECT public.publish_platform_course_proposal('70000000-0000-0000-0000-000000000001',(SELECT (value->>'proposal_id')::uuid FROM unit_context WHERE key='proposal'),(SELECT value->>'edition_sha256' FROM unit_context WHERE key='ready'),'80000000-0000-0000-0000-000000000010');
SET CONSTRAINTS pcr_final_claim IMMEDIATE;
SET CONSTRAINTS pcr_final_claim DEFERRED;
SELECT public.qa_pcr_expect_error($q$UPDATE public.test_questions SET correct_answer=1 WHERE id='60000000-0000-0000-0000-000000000001'$q$,'PCR_MIXED_CLAIM_SOURCE_TRANSACTION','PCRV2S18 publication cannot be followed by a key edit in the same transaction');
ROLLBACK;
