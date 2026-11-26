-- SOURCE ONLY. Dedicated synthetic PG17 lab, after the accepted V3 core and
-- additive read RPC. No execution or production acceptance is implied.
\set ON_ERROR_STOP on
DO $guard$ BEGIN
 IF current_database()<>'sintagma_pcr_v4_r2_lab_20261028' OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
 OR current_setting('pcr.lab_authorized',true) IS DISTINCT FROM 'source-reviewed-root-run-only'
 OR to_regclass('public.qa_retained_results') IS NULL THEN RAISE EXCEPTION 'PCR_READ_TEST_DEDICATED_SYNTHETIC_LAB_ONLY';END IF;
END $guard$;
CREATE TEMP TABLE read_before_events AS SELECT public.pcr_v2_sha(coalesce(jsonb_agg(to_jsonb(e) ORDER BY sequence),'[]')) sha FROM public.platform_course_publication_review_events e;
BEGIN;
CREATE FUNCTION public.qa_pcr_read_assert(p_ok boolean,p_name text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'PCR_READ_TEST_FAILED: %',p_name;END IF;RAISE NOTICE 'PCR_READ_UNIT_PASS %',p_name;END $f$;
CREATE FUNCTION public.qa_pcr_read_error(p_sql text,p_state text,p_name text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_state text;BEGIN
 BEGIN EXECUTE p_sql;EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE;END;
 IF v_state IS DISTINCT FROM p_state THEN RAISE EXCEPTION 'PCR_READ_EXPECTED_STATE: %, expected %, got %',p_name,p_state,v_state;END IF;
 RAISE NOTICE 'PCR_READ_UNIT_PASS %',p_name;
END $f$;
CREATE TEMP TABLE read_expected AS SELECT id,edition_sha256,review_payload FROM public.platform_course_publication_review_events
 WHERE marketplace_id='70000000-0000-0000-0000-000000000001' AND event_kind='submitted' ORDER BY sequence DESC LIMIT 1;
CREATE TEMP TABLE read_test_state(key text PRIMARY KEY,value jsonb);
GRANT SELECT ON read_expected TO authenticated;
GRANT ALL ON read_test_state TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
INSERT INTO read_test_state VALUES('legacy',public.read_platform_course_publication_review_context('70000000-0000-0000-0000-000000000002'));
SELECT public.qa_pcr_read_assert((SELECT value->'proposal'='null'::jsonb AND value->'readiness'->>'state'='legacy_unchanged' AND value->'readiness'->>'is_validated'='true' FROM read_test_state WHERE key='legacy'),'PCRUIR01 legacy is not auto-approved or hidden');
INSERT INTO read_test_state VALUES('persisted',public.read_platform_course_publication_review_context('70000000-0000-0000-0000-000000000001'));
SELECT public.qa_pcr_read_assert((SELECT value->'proposal'->'dossier'=(SELECT review_payload FROM read_expected)
 AND value->'proposal'->>'id'=(SELECT id::text FROM read_expected) AND value->'proposal'->>'edition_sha256'=(SELECT edition_sha256 FROM read_expected)
 FROM read_test_state WHERE key='persisted'),'PCRUIR02 persisted dossier and exact edition survive a new read');
SELECT public.qa_pcr_read_error($q$SELECT * FROM public.platform_course_publication_review_events$q$,'42501','PCRUIR03 private table remains inaccessible directly');
SELECT public.qa_pcr_read_error($q$SELECT public.read_platform_course_publication_review_context('70000000-0000-0000-0000-000000000003')$q$,'42501','PCRUIR04 current client source is outside scoped context');
SELECT public.qa_pcr_read_assert((SELECT value::text !~ 'question_bank_sha256|storage_path|file_url|correct_answer|canonical_manifest' FROM read_test_state WHERE key='persisted'),'PCRUIR05 read DTO excludes private bank and mutable storage pointers');
SELECT public.qa_pcr_read_error($q$SELECT public.read_platform_course_publication_review_context('70000000-0000-0000-0000-000000000001',NULL,repeat('f',64))$q$,'40001','PCRUIR06 expected current edition mismatch fails closed');
SELECT public.qa_pcr_read_error($q$SELECT public.read_platform_course_publication_review_context('70000000-0000-0000-0000-000000000002',(SELECT id FROM read_expected))$q$,'P0002','PCRUIR07 proposal cannot cross listing or source scope');
INSERT INTO read_test_state VALUES('new_proposal',public.submit_platform_course_publication_proposal('70000000-0000-0000-0000-000000000001',
 (SELECT value->>'current_edition_sha256' FROM read_test_state WHERE key='persisted'),(SELECT review_payload FROM read_expected),'a0000000-0000-0000-0000-000000000001'));
INSERT INTO read_test_state VALUES('historical',public.read_platform_course_publication_review_context('70000000-0000-0000-0000-000000000001',(SELECT id FROM read_expected)));
SELECT public.qa_pcr_read_assert((SELECT value->'proposal'->>'is_current'='false' AND value->'proposal'->'dossier'=(SELECT review_payload FROM read_expected)
 AND value->'proposal'->'source_context'->>'historical_content_state'='fingerprint_only_not_reconstructed_from_current_bank' FROM read_test_state WHERE key='historical'),'PCRUIR08 historical dossier is exact and never a current-bank reconstruction');
INSERT INTO read_test_state VALUES('review',public.record_platform_course_publication_review('70000000-0000-0000-0000-000000000001',
 (SELECT (value->>'proposal_id')::uuid FROM read_test_state WHERE key='new_proposal'),(SELECT value->>'current_edition_sha256' FROM read_test_state WHERE key='persisted'),
 'needs_revision','Explicit SYNTHETIC read-contract fixture',NULL,'a0000000-0000-0000-0000-000000000002'));
INSERT INTO read_test_state VALUES('confirmed',public.read_platform_course_publication_review_context('70000000-0000-0000-0000-000000000001',
 (SELECT (value->>'proposal_id')::uuid FROM read_test_state WHERE key='new_proposal'),(SELECT value->>'current_edition_sha256' FROM read_test_state WHERE key='persisted'),NULL,
 (SELECT (value->>'review_id')::uuid FROM read_test_state WHERE key='review')));
SELECT public.qa_pcr_read_assert((SELECT value->'confirmed_event'->>'id'=(SELECT value->>'review_id' FROM read_test_state WHERE key='review')
 AND value->'confirmed_event'->>'actor_id'='10000000-0000-0000-0000-000000000001' AND value->'confirmed_event'->>'request_id'='a0000000-0000-0000-0000-000000000002'
 AND value->'confirmed_event'->>'decision'='needs_revision' FROM read_test_state WHERE key='confirmed'),'PCRUIR09 exact saved decision lookup is scoped and explicit');
DO $f$ DECLARE i integer;BEGIN
 FOR i IN 1..27 LOOP
  PERFORM public.record_platform_course_publication_review('70000000-0000-0000-0000-000000000001',
   (SELECT (value->>'proposal_id')::uuid FROM read_test_state WHERE key='new_proposal'),(SELECT value->>'current_edition_sha256' FROM read_test_state WHERE key='persisted'),
   'needs_revision','SYNTHETIC pagination only',NULL,gen_random_uuid());
 END LOOP;
END $f$;
INSERT INTO read_test_state VALUES('page1',public.read_platform_course_publication_review_context('70000000-0000-0000-0000-000000000001'));
INSERT INTO read_test_state VALUES('page2',public.read_platform_course_publication_review_context('70000000-0000-0000-0000-000000000001',NULL,NULL,
 (SELECT value->>'history_next_before_sequence' FROM read_test_state WHERE key='page1')));
SELECT public.qa_pcr_read_assert((SELECT jsonb_array_length(value->'history')=25 AND value->>'history_has_more'='true' FROM read_test_state WHERE key='page1')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements((SELECT value->'history' FROM read_test_state WHERE key='page1')) a,
 jsonb_array_elements((SELECT value->'history' FROM read_test_state WHERE key='page2')) b WHERE a->>'id'=b->>'id'),'PCRUIR10 bounded cursor history has no false complete page or duplicate events');
SELECT public.qa_pcr_read_error($q$SELECT public.read_platform_course_publication_review_context('70000000-0000-0000-0000-000000000001',NULL,NULL,'-1')$q$,'22023','PCRUIR11 invalid history cursor fails closed');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT public.qa_pcr_read_error($q$SELECT public.read_platform_course_publication_review_context('70000000-0000-0000-0000-000000000001')$q$,'42501','PCRUIR12 ordinary organization cannot read methodical evidence');
RESET ROLE;
ROLLBACK;
DO $f$ BEGIN
 IF (SELECT sha FROM read_before_events) IS DISTINCT FROM (SELECT public.pcr_v2_sha(coalesce(jsonb_agg(to_jsonb(e) ORDER BY sequence),'[]')) FROM public.platform_course_publication_review_events e)
 THEN RAISE EXCEPTION 'PCR_READ_TEST_ROLLBACK_CHANGED_CORE_HISTORY';END IF;
 RAISE NOTICE 'PCR_READ_UNIT_PASS PCRUIR13 fixture rollback leaves all original review history byte-equivalent';
END $f$;
