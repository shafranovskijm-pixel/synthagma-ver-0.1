SET ROLE postgres;
CREATE FUNCTION lab.mi_assert(ok boolean)RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Synthetic manual intake assertion failed';END IF;END;$$;
CREATE FUNCTION lab.mi_case(label text,sql text)RETURNS void LANGUAGE plpgsql AS $$BEGIN
 BEGIN EXECUTE sql;RAISE EXCEPTION 'synthetic rollback' USING ERRCODE='ZMI01';EXCEPTION WHEN SQLSTATE 'ZMI01' THEN NULL;END;
 PERFORM lab.check(label,true);
END;$$;
CREATE FUNCTION lab.mi_file(sha text DEFAULT repeat('b',64),size integer DEFAULT 1234)RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('sha256',sha,'byte_size',size,'media_type','application/pdf',
 'original_path',(lab.ctx('source')->>'source_id')||'/'||sha||'.pdf','parser','industrial-pdf','original_verified',true)
$$;
CREATE FUNCTION lab.mi_provenance()RETURNS jsonb LANGUAGE sql AS $$SELECT '{"publication_page_url":"https://www.gosnadzor.ru/service/list/normative-lab/","document_url":"https://www.gosnadzor.ru/service/list/normative-lab/a1.pdf","attestation_version":"official-current-location-v1"}'::jsonb$$;
CREATE FUNCTION lab.mi_store(sha text DEFAULT repeat('b',64),size integer DEFAULT 1234)RETURNS void LANGUAGE sql AS $$
 INSERT INTO storage.objects(id,bucket_id,name,metadata)SELECT gen_random_uuid(),'rtn-sources',(lab.mi_file(sha,size)->>'original_path'),jsonb_build_object('size',size,'mimetype','application/pdf')
 WHERE NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='rtn-sources'AND name=lab.mi_file(sha,size)->>'original_path')
$$;
CREATE FUNCTION lab.mi_import(request uuid DEFAULT '99000000-0000-4000-8000-000000001001',generation integer DEFAULT 1,
 sha text DEFAULT repeat('b',64),banks jsonb DEFAULT lab.ctx('normalized'),size integer DEFAULT 1234)RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.finalize_rtn_manual_source_import('81000000-0000-4000-8000-000000000999',request,(lab.ctx('source')->>'source_id')::uuid,generation,lab.mi_file(sha,size),lab.mi_provenance(),banks)
$$;
CREATE FUNCTION lab.mi_service()RETURNS void LANGUAGE plpgsql AS $$BEGIN PERFORM set_config('request.jwt.claim.role','service_role',false);PERFORM set_config('request.jwt.claim.sub','',false);END;$$;
CREATE FUNCTION lab.mi_admin()RETURNS void LANGUAGE plpgsql AS $$BEGIN PERFORM set_config('request.jwt.claim.role','authenticated',false);PERFORM set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000999',false);END;$$;
GRANT EXECUTE ON FUNCTION lab.mi_assert(boolean),lab.mi_file(text,integer),lab.mi_provenance(),lab.mi_import(uuid,integer,text,jsonb,integer),lab.mi_service(),lab.mi_admin()TO authenticated,service_role;

SELECT lab.check('manual import changes only two old read projections and preserves every old function authority',
 NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lab.ctx('intake_old_functions'))old LEFT JOIN pg_proc p ON p.oid=(old->>'oid')::oid
 WHERE p.oid IS NULL OR to_jsonb(p)-'prosrc'IS DISTINCT FROM old-'prosrc'
 OR(p.oid NOT IN('public.get_rtn_workspace(uuid)'::regprocedure,'public.get_rtn_editorial_workspace()'::regprocedure)AND p.prosrc IS DISTINCT FROM old->>'prosrc')));
SELECT lab.check('manual provenance table and helpers remain private service capability only',
 (SELECT relrowsecurity FROM pg_class WHERE oid='rtn_private.manual_source_intakes'::regclass)
 AND NOT has_table_privilege('authenticated','rtn_private.manual_source_intakes','SELECT')
 AND NOT has_table_privilege('service_role','rtn_private.manual_source_intakes','INSERT')
 AND NOT has_function_privilege('authenticated','public.finalize_rtn_manual_source_import(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb)','EXECUTE')
 AND NOT has_function_privilege('sandbox_exec_atxwvjxbqjgkbjlhsdch','public.finalize_rtn_manual_source_import(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb)','EXECUTE')
 AND NOT has_function_privilege('service_role','rtn_private.manual_source_intake_receipt(uuid,boolean)','EXECUTE'));
SELECT lab.mi_case('accepted manual original advances only content hash and generation without claiming HTTP success',$s$
 SELECT lab.mi_store();SET ROLE service_role;SELECT lab.mi_service();SELECT lab.keep('mi',lab.mi_import());
 SET ROLE postgres;SELECT lab.mi_assert(lab.ctx('mi')->>'acquisition_method'='admin_upload'AND lab.ctx('mi')->'automatic_verification_advanced'='false'::jsonb AND(lab.ctx('mi')->>'still_current')::boolean);
 SELECT lab.mi_assert((SELECT source_generation=2 AND last_sha256=repeat('b',64)FROM rtn_private.sources WHERE id=(lab.ctx('source')->>'source_id')::uuid));
 SELECT lab.mi_assert((SELECT to_jsonb(s)-ARRAY['last_sha256','source_generation']FROM rtn_private.sources s WHERE id=(lab.ctx('source')->>'source_id')::uuid)=(lab.ctx('intake_old_sources')->0)-ARRAY['last_sha256','source_generation']);
 SELECT lab.mi_assert(lab.ctx('intake_old_runs')=(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.check_runs r));
 SELECT lab.mi_assert(lab.ctx('intake_old_learning')=jsonb_build_array((SELECT jsonb_agg(to_jsonb(k)ORDER BY id)FROM rtn_private.key_sets k),(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.releases r),(SELECT jsonb_agg(to_jsonb(t)ORDER BY id)FROM rtn_private.attempts t),(SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM rtn_private.assignments a)));
$s$);
SELECT lab.mi_case('known pinned A1 extraction normalizes211 questions without approving answer keys',$s$
 SELECT lab.mi_store('69349ffd501308449e68a7f46caf416808faec2795ae72f8f424f7eea9d49bcc',847382);
 SET ROLE service_role;SELECT lab.mi_service();SELECT lab.keep('mi',lab.mi_import('99000000-0000-4000-8000-000000001002',1,'69349ffd501308449e68a7f46caf416808faec2795ae72f8f424f7eea9d49bcc',lab.ctx('manual_known211'),847382));
 SET ROLE postgres;SELECT lab.mi_assert((SELECT question_count=211 FROM rtn_private.bank_revisions WHERE source_revision_id=(lab.ctx('mi')->>'revision_id')::uuid));
 SELECT lab.mi_assert(lab.ctx('mi')->'normalization_required'='false'::jsonb AND lab.ctx('intake_old_learning')->0=(SELECT jsonb_agg(to_jsonb(k)ORDER BY id)FROM rtn_private.key_sets k));
$s$);
SELECT lab.mi_case('unknown unextracted PDF remains normalization required',$s$
 SELECT lab.mi_store();SET ROLE service_role;SELECT lab.mi_service();SELECT lab.keep('mi',lab.mi_import('99000000-0000-4000-8000-000000001003',1,repeat('b',64),'[]'));
 SET ROLE postgres;SELECT lab.mi_assert((lab.ctx('mi')->>'normalization_required')::boolean AND NOT EXISTS(SELECT 1 FROM rtn_private.bank_revisions WHERE source_revision_id=(lab.ctx('mi')->>'revision_id')::uuid));
$s$);
SELECT lab.mi_case('exact request replay is idempotent before stale expected generation',$s$
 SELECT lab.mi_store();SET ROLE service_role;SELECT lab.mi_service();SELECT lab.keep('first',lab.mi_import());SELECT lab.keep('again',lab.mi_import());
 SET ROLE postgres;SELECT lab.mi_assert(lab.ctx('first')->>'intake_id'=lab.ctx('again')->>'intake_id'AND(lab.ctx('again')->>'replayed')::boolean AND lab.ctx('first')->>'received_at'=lab.ctx('again')->>'received_at');
 SELECT lab.mi_assert((SELECT count(*)=1 FROM rtn_private.manual_source_intakes)AND(SELECT source_generation=2 FROM rtn_private.sources WHERE id=(lab.ctx('source')->>'source_id')::uuid));
$s$);
SELECT lab.mi_case('same request with changed normalized banks is rejected rather than replayed as success',$s$
 SELECT lab.mi_store();SET ROLE service_role;SELECT lab.mi_service();SELECT lab.mi_import();
 SELECT lab.denied('changed normalized body',$q$SELECT lab.mi_import('99000000-0000-4000-8000-000000001001',1,repeat('b',64),'[]')$q$,'40001');
 SET ROLE postgres;SELECT lab.mi_assert((SELECT count(*)=1 FROM rtn_private.manual_source_intakes));
$s$);
SELECT lab.mi_case('stale generation cannot overwrite the accepted content pointer',$s$
 SELECT lab.mi_store();SET ROLE service_role;SELECT lab.mi_service();
 SELECT lab.denied('old generation',$q$SELECT lab.mi_import('99000000-0000-4000-8000-000000001004',0)$q$,'40001');
 SET ROLE postgres;SELECT lab.mi_assert(NOT EXISTS(SELECT 1 FROM rtn_private.manual_source_intakes)AND lab.ctx('intake_old_sources')=(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.sources s));
$s$);
SELECT lab.mi_case('same SHA new request neither increments generation nor refreshes original capture time',$s$
 SELECT lab.mi_store();SET ROLE service_role;SELECT lab.mi_service();SELECT lab.keep('first',lab.mi_import());
 SET ROLE postgres;SELECT lab.keep('source_before',(SELECT to_jsonb(r)FROM rtn_private.source_revisions r WHERE id=(lab.ctx('first')->>'revision_id')::uuid));
 SET ROLE service_role;SELECT lab.keep('second',lab.mi_import('99000000-0000-4000-8000-000000001005',2));
 SET ROLE postgres;SELECT lab.mi_assert(lab.ctx('first')->>'revision_id'=lab.ctx('second')->>'revision_id'AND lab.ctx('second')->>'accepted_generation'='2');
 SELECT lab.mi_assert(lab.ctx('source_before')=(SELECT to_jsonb(r)FROM rtn_private.source_revisions r WHERE id=(lab.ctx('first')->>'revision_id')::uuid));
$s$);
SELECT lab.mi_case('same original intake preserves a later explicit normalization correction',$s$
 SELECT lab.mi_store();SET ROLE service_role;SELECT lab.mi_service();SELECT lab.keep('first',lab.mi_import());
 SET ROLE postgres;SELECT lab.keep('prior_norm',(SELECT jsonb_build_object('A.1',id)FROM rtn_private.bank_revisions WHERE source_revision_id=(lab.ctx('first')->>'revision_id')::uuid));
 SET ROLE service_role;
 SELECT public.normalize_rtn_revision((lab.ctx('first')->>'revision_id')::uuid,jsonb_set(lab.ctx('normalized'),'{0,questions,0,text}','"Synthetic explicitly corrected extraction"'),lab.ctx('prior_norm'),'Synthetic reviewed correction with CAS');
 SET ROLE postgres;SELECT lab.keep('corrected',(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.bank_revisions r));
 SET ROLE service_role;SELECT lab.mi_import('99000000-0000-4000-8000-000000001006',2);
 SET ROLE postgres;SELECT lab.mi_assert(lab.ctx('corrected')=(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.bank_revisions r));
$s$);
SELECT lab.mi_case('historical replay after a later accepted source cannot rewind its pointer',$s$
 SELECT lab.mi_store();SELECT lab.mi_store(repeat('c',64));SET ROLE service_role;SELECT lab.mi_service();SELECT lab.keep('first',lab.mi_import());
 SELECT lab.keep('later',lab.mi_import('99000000-0000-4000-8000-000000001007',2,repeat('c',64)));
 SELECT lab.keep('again',lab.mi_import());
 SET ROLE postgres;SELECT lab.mi_assert(lab.ctx('again')->'still_current'='false'::jsonb AND(lab.ctx('again')->>'replayed')::boolean AND lab.ctx('again')->>'accepted_generation'='2');
 SELECT lab.mi_assert((SELECT last_sha256=repeat('c',64)AND source_generation=3 FROM rtn_private.sources WHERE id=(lab.ctx('source')->>'source_id')::uuid));
$s$);
SELECT lab.mi_case('new request cannot silently restore a known historical original even with current generation',$s$
 SELECT lab.mi_store();SELECT lab.mi_store(repeat('a',64));SET ROLE service_role;SELECT lab.mi_service();SELECT lab.mi_import();
 SELECT lab.denied('historical revision requires review',$q$SELECT lab.mi_import('99000000-0000-4000-8000-000000001008',2,repeat('a',64))$q$,'40001');
 SET ROLE postgres;SELECT lab.mi_assert((SELECT last_sha256=repeat('b',64)AND source_generation=2 FROM rtn_private.sources WHERE id=(lab.ctx('source')->>'source_id')::uuid));
$s$);
SELECT lab.mi_case('queued real source work rejects intake without editing its queue',$s$
 SELECT lab.mi_store();INSERT INTO rtn_private.check_runs(source_id,kind,status)VALUES((lab.ctx('source')->>'source_id')::uuid,'weekly','queued');
 SELECT lab.keep('busy_runs',(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.check_runs r));
 SET ROLE service_role;SELECT lab.mi_service();SELECT lab.denied('queued source busy',$q$SELECT lab.mi_import()$q$,'40001');
 SET ROLE postgres;SELECT lab.mi_assert(lab.ctx('busy_runs')=(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.check_runs r));
$s$);
SELECT lab.mi_case('running source lease rejects intake without reclaiming or resetting it',$s$
 SELECT lab.mi_store();INSERT INTO rtn_private.check_runs(source_id,kind,status,lease_token,lease_expires_at,attempt_count)VALUES((lab.ctx('source')->>'source_id')::uuid,'weekly','running',gen_random_uuid(),clock_timestamp()+interval '10 minutes',1);
 SET ROLE service_role;SELECT lab.mi_service();SELECT lab.denied('running source busy',$q$SELECT lab.mi_import()$q$,'40001');
 SET ROLE postgres;SELECT lab.mi_assert(NOT EXISTS(SELECT 1 FROM rtn_private.manual_source_intakes)AND EXISTS(SELECT 1 FROM rtn_private.check_runs WHERE status='running'AND attempt_count=1));
$s$);
SELECT lab.mi_case('expired reclaimable source lease still rejects intake without queue mutation',$s$
 SELECT lab.mi_store();INSERT INTO rtn_private.check_runs(source_id,kind,status,lease_token,lease_expires_at,attempt_count)VALUES((lab.ctx('source')->>'source_id')::uuid,'weekly','running',gen_random_uuid(),clock_timestamp()-interval '1 second',1);
 SET ROLE service_role;SELECT lab.mi_service();SELECT lab.denied('expired source busy',$q$SELECT lab.mi_import()$q$,'40001');
 SET ROLE postgres;SELECT lab.mi_assert(EXISTS(SELECT 1 FROM rtn_private.check_runs WHERE status='running'AND attempt_count=1 AND lease_expires_at<clock_timestamp()));
$s$);
SELECT lab.mi_case('private stored original is required before acceptance',$s$
 SET ROLE service_role;SELECT lab.mi_service();SELECT lab.denied('no private object',$q$SELECT lab.mi_import()$q$,'22023');
 SET ROLE postgres;SELECT lab.mi_assert(NOT EXISTS(SELECT 1 FROM rtn_private.manual_source_intakes));
$s$);
SELECT lab.mi_case('private object size and trusted verified receipt cannot be forged by an upload argument',$s$
 SELECT lab.mi_store();UPDATE storage.objects SET metadata=metadata||'{"size":42}'WHERE name=lab.mi_file()->>'original_path';
 SET ROLE service_role;SELECT lab.mi_service();SELECT lab.denied('wrong private size',$q$SELECT lab.mi_import()$q$,'22023');
 SELECT lab.denied('not verified',$q$SELECT public.finalize_rtn_manual_source_import('81000000-0000-4000-8000-000000000999',gen_random_uuid(),(lab.ctx('source')->>'source_id')::uuid,1,lab.mi_file()||'{"original_verified":false}',lab.mi_provenance(),lab.ctx('normalized'))$q$,'22023');
$s$);
SELECT lab.mi_case('wrong path source parser or oversized original is rejected',$s$
 SET ROLE service_role;SELECT lab.mi_service();
 SELECT lab.denied('wrong path',$q$SELECT public.finalize_rtn_manual_source_import('81000000-0000-4000-8000-000000000999',gen_random_uuid(),(lab.ctx('source')->>'source_id')::uuid,1,lab.mi_file()||'{"original_path":"elsewhere.pdf"}',lab.mi_provenance(),'[]')$q$,'22023');
 SELECT lab.denied('wrong parser',$q$SELECT public.finalize_rtn_manual_source_import('81000000-0000-4000-8000-000000000999',gen_random_uuid(),(lab.ctx('source')->>'source_id')::uuid,1,lab.mi_file()||'{"parser":"energy-xlsx"}',lab.mi_provenance(),'[]')$q$,'22023');
 SELECT lab.denied('oversize',$q$SELECT lab.mi_import('99000000-0000-4000-8000-000000001009',1,repeat('b',64),'[]',16777217)$q$,'22023');
$s$);
SELECT lab.mi_case('nonofficial provenance cannot be accepted as an official source',$s$
 SET ROLE service_role;SELECT lab.mi_service();
 SELECT lab.denied('foreign location',$q$SELECT public.finalize_rtn_manual_source_import('81000000-0000-4000-8000-000000000999',gen_random_uuid(),(lab.ctx('source')->>'source_id')::uuid,1,lab.mi_file(),lab.mi_provenance()||'{"document_url":"https://foreign.invalid/a.pdf"}','[]')$q$,'22023');
 SELECT lab.denied('unknown attestation',$q$SELECT public.finalize_rtn_manual_source_import('81000000-0000-4000-8000-000000000999',gen_random_uuid(),(lab.ctx('source')->>'source_id')::uuid,1,lab.mi_file(),lab.mi_provenance()||'{"attestation_version":"guessed"}','[]')$q$,'22023');
$s$);
SELECT lab.mi_case('nonservice caller cannot invoke finalization even when naming an admin actor',$s$
 SET ROLE authenticated;SELECT lab.mi_admin();SELECT lab.denied('authenticated finalization',$q$SELECT lab.mi_import()$q$);
$s$);
SELECT lab.mi_case('actual nonadmin blocked or revoked actor is rejected by the final service transaction',$s$
 SET ROLE service_role;SELECT lab.mi_service();
 SELECT lab.denied('not admin',$q$SELECT public.finalize_rtn_manual_source_import('81000000-0000-4000-8000-000000000001',gen_random_uuid(),(lab.ctx('source')->>'source_id')::uuid,1,lab.mi_file(),lab.mi_provenance(),'[]')$q$);
 SET ROLE postgres;UPDATE public.profiles SET blocked_at=clock_timestamp()WHERE user_id='81000000-0000-4000-8000-000000000999';
 SET ROLE service_role;SELECT lab.denied('blocked actor',$q$SELECT lab.mi_import()$q$);
 SET ROLE postgres;UPDATE public.profiles SET blocked_at=NULL WHERE user_id='81000000-0000-4000-8000-000000000999';INSERT INTO public.account_deletion_revocations VALUES('81000000-0000-4000-8000-000000000999');
 SET ROLE service_role;SELECT lab.denied('revoked actor',$q$SELECT lab.mi_import()$q$);
$s$);
SELECT lab.mi_case('accepted global provenance stores no actor attribution and survives confirmed erasure unchanged',$s$
 SELECT lab.mi_store();SET ROLE service_role;SELECT lab.mi_service();SELECT lab.mi_import();
 SET ROLE postgres;SELECT lab.keep('intake_snapshot',(SELECT to_jsonb(i)FROM rtn_private.manual_source_intakes i));
 SELECT lab.mi_assert(position('81000000-0000-4000-8000-000000000999'IN lab.ctx('intake_snapshot')::text)=0);
 INSERT INTO public.account_deletion_jobs(id,user_id,receipt_hash,state,consent_version,snapshot)VALUES('99000000-0000-4000-8000-000000001010','81000000-0000-4000-8000-000000000999','synthetic-manual-import-erasure','cleanup_pending','full-personal-data-v1','{"emptyOrganization":false,"organizationId":"11111111-1111-4111-8111-111111111111"}');
 INSERT INTO public.account_deletion_revocations VALUES('81000000-0000-4000-8000-000000000999');
 SET ROLE service_role;SELECT lab.mi_assert(public.account_deletion_erase_data('99000000-0000-4000-8000-000000001010','synthetic-manual-import-erasure')->>'erased'='true');
 SET ROLE postgres;SELECT lab.mi_assert(lab.ctx('intake_snapshot')=(SELECT to_jsonb(i)FROM rtn_private.manual_source_intakes i));
$s$);
SELECT lab.mi_case('provenance is immutable and does not add guessed approval or effective dates',$s$
 SELECT lab.mi_store();SET ROLE service_role;SELECT lab.mi_service();SELECT lab.keep('mi',lab.mi_import());
 SET ROLE postgres;SELECT lab.denied('intake update','UPDATE rtn_private.manual_source_intakes SET accepted_generation=999');
 SELECT lab.denied('intake delete','DELETE FROM rtn_private.manual_source_intakes');SELECT lab.denied('intake truncate','TRUNCATE rtn_private.manual_source_intakes');
 SELECT lab.mi_assert((SELECT metadata->'dates_require_review'='true'::jsonb AND NOT(metadata?|ARRAY['effective_from','approved_on','http_status'])FROM rtn_private.source_revisions WHERE id=(lab.ctx('mi')->>'revision_id')::uuid));
$s$);
SELECT lab.mi_case('exact released-source origin is not replaced by a newer unpublished manual source',$s$
 UPDATE rtn_private.check_runs SET http_status=200 WHERE revision_id=(lab.ctx('completed')->>'revision_id')::uuid;
 SELECT lab.mi_store();SET ROLE service_role;SELECT lab.mi_service();SELECT lab.keep('mi',lab.mi_import());
 SET ROLE authenticated;SELECT lab.mi_admin();SELECT lab.keep('card',public.get_rtn_workspace('11111111-1111-4111-8111-111111111111')->'banks'->0);
 SELECT lab.mi_assert(lab.ctx('card')->>'source_revision_id'=lab.ctx('completed')->>'revision_id');
 SELECT lab.mi_assert(lab.ctx('card')->>'source_acquisition_method'='official_http'AND lab.ctx('card')->>'latest_source_revision_id'=lab.ctx('mi')->>'revision_id');
$s$);
SELECT lab.mi_case('editorial capability exposes only the bounded manual intake workflow',$s$
 SET ROLE authenticated;SELECT lab.mi_admin();
 SELECT lab.mi_assert(public.get_rtn_editorial_workspace()->'manual_source_import_capability'='{"version":"rtn-manual-intake-v1","attestation_version":"official-current-location-v1","max_file_bytes":16777216}'::jsonb);
$s$);
SELECT lab.check('manual import migration and new fixtures preserve unrelated client courses results and billing',lab.ctx('intake_old_business')=jsonb_build_array((SELECT jsonb_agg(x)FROM public.courses x),(SELECT jsonb_agg(x)FROM public.test_attempts x),(SELECT jsonb_agg(x)FROM public.subscription_invoices x)));
SET ROLE postgres;
