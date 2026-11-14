SET ROLE postgres;
SELECT lab.keep('npa_legal_before_erasure',jsonb_build_array(
 (SELECT jsonb_agg(to_jsonb(x)-ARRAY['configured_by','configuration_note','request_hash']ORDER BY x.id)FROM rtn_private.npa_configurations x),
 (SELECT jsonb_agg(to_jsonb(x)-ARRAY['approved_by','approval_note','request_hash']ORDER BY x.id)FROM rtn_private.npa_manifests x),
 (SELECT jsonb_agg(to_jsonb(x)-ARRAY['reviewed_by','review_note','evidence','request_hash']ORDER BY x.id)FROM rtn_private.npa_manual_reviews x),
 (SELECT jsonb_agg(to_jsonb(x)-ARRAY['requested_by','requester_erased']ORDER BY x.id)FROM rtn_private.npa_check_runs x),
 (SELECT jsonb_agg(to_jsonb(x)ORDER BY x.id)FROM rtn_private.npa_findings x),
 (SELECT jsonb_agg(to_jsonb(x)ORDER BY x.id)FROM rtn_private.npa_receipts x)));
SELECT lab.check('250 new actor links visible through actual personal count chain',EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts('81000000-0000-4000-8000-000000000999'))x WHERE x->>'table'='rtn_private.npa_manifests'));
SELECT lab.check('250 actor attribution is handled without legal content blocker',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rtn_private.personal_counts('81000000-0000-4000-8000-000000000999'))x WHERE x->>'column'='content_reference_requires_review'));
INSERT INTO public.account_deletion_jobs(id,user_id,receipt_hash,state,consent_version,snapshot)VALUES('95000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000999','synthetic-npa-admin-erasure','cleanup_pending','full-personal-data-v1','{"emptyOrganization":false,"organizationId":"11111111-1111-4111-8111-111111111111"}');
INSERT INTO public.account_deletion_revocations(user_id)VALUES('81000000-0000-4000-8000-000000000999');
SELECT lab.check('250 old erase RPC body and ACL still owned canonical service entry',(SELECT prosecdef AND proacl::text='{postgres=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}'FROM pg_proc WHERE oid='public.account_deletion_erase_data(uuid,text)'::regprocedure));
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT lab.keep('erased_npa_actor',public.account_deletion_erase_data('95000000-0000-4000-8000-000000000001','synthetic-npa-admin-erasure'));
SELECT lab.check('250 existing full consent erasure completes new attribution links',lab.ctx('erased_npa_actor')->>'erased'='true');
SET ROLE postgres;
SELECT lab.check('250 personal counts empty after new actor erasure',rtn_private.personal_counts('81000000-0000-4000-8000-000000000999')='[]'::jsonb);
SELECT lab.check('250 erased editor attribution is exact canonical redaction',NOT EXISTS(SELECT 1 FROM rtn_private.npa_manifests WHERE approved_by IS NOT NULL OR request_hash IS NOT NULL OR approval_note<>'Авторская атрибуция удалена по подтверждённому запросу.'));
SELECT lab.check('250 manifest/proof/findings/legal facts immutable through actor erasure',lab.ctx('npa_legal_before_erasure')=jsonb_build_array(
 (SELECT jsonb_agg(to_jsonb(x)-ARRAY['configured_by','configuration_note','request_hash']ORDER BY x.id)FROM rtn_private.npa_configurations x),
 (SELECT jsonb_agg(to_jsonb(x)-ARRAY['approved_by','approval_note','request_hash']ORDER BY x.id)FROM rtn_private.npa_manifests x),
 (SELECT jsonb_agg(to_jsonb(x)-ARRAY['reviewed_by','review_note','evidence','request_hash']ORDER BY x.id)FROM rtn_private.npa_manual_reviews x),
 (SELECT jsonb_agg(to_jsonb(x)-ARRAY['requested_by','requester_erased']ORDER BY x.id)FROM rtn_private.npa_check_runs x),
 (SELECT jsonb_agg(to_jsonb(x)ORDER BY x.id)FROM rtn_private.npa_findings x),
 (SELECT jsonb_agg(to_jsonb(x)ORDER BY x.id)FROM rtn_private.npa_receipts x)));
SELECT lab.check('250 other learner attempt, marks and answer snapshot preserved',(SELECT to_jsonb(t)=lab.ctx('old_attempt')FROM rtn_private.attempts t WHERE id=(lab.ctx('old_start')->>'attempt_id')::uuid));
SELECT lab.check('250 unrelated courses and invoices preserved',lab.ctx('old_data')=jsonb_build_array((SELECT jsonb_agg(x)FROM public.courses x),(SELECT jsonb_agg(x)FROM public.test_attempts x),(SELECT jsonb_agg(x)FROM public.subscription_invoices x)));
