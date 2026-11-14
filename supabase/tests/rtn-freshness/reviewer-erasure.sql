-- ISOLATED LAB ONLY: confirm new immutable review metadata participates safely
-- in the already-validated privacy workflow. Never invoke this in production.
SET ROLE postgres;
SELECT lab.keep('reviewer_immutable_content',jsonb_build_array(
 (SELECT jsonb_agg(to_jsonb(k)-ARRAY['reviewed_by','review_note']ORDER BY id)FROM rtn_private.key_sets k),
 (SELECT jsonb_agg(to_jsonb(r)-ARRAY['published_by','release_note']ORDER BY id)FROM rtn_private.releases r),
 (SELECT jsonb_agg(t ORDER BY id)FROM rtn_private.attempts t)));
SELECT lab.check('freshness: reviewer erasure fixture contains real immutable weekly metadata',EXISTS(SELECT 1 FROM rtn_private.key_sets WHERE editorial_review_before IS NOT NULL AND jsonb_array_length(normative_limits)>0));
INSERT INTO public.account_deletion_jobs(id,user_id,receipt_hash,state,consent_version,snapshot)VALUES(
 '99000000-0000-4000-8000-000000000940','81000000-0000-4000-8000-000000000999','synthetic-freshness-reviewer-erasure','cleanup_pending','full-personal-data-v1','{"emptyOrganization":false,"organizationId":"11111111-1111-4111-8111-111111111111"}');
INSERT INTO public.account_deletion_revocations VALUES('81000000-0000-4000-8000-000000000999');
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT lab.check('freshness: actual confirmed workflow can redact reviewer with new normative fields',public.account_deletion_erase_data('99000000-0000-4000-8000-000000000940','synthetic-freshness-reviewer-erasure')->>'erased'='true');
SET ROLE postgres;
SELECT lab.check('freshness: reviewer redaction preserves all deadlines paths materials grades and release bytes',lab.ctx('reviewer_immutable_content')=jsonb_build_array(
 (SELECT jsonb_agg(to_jsonb(k)-ARRAY['reviewed_by','review_note']ORDER BY id)FROM rtn_private.key_sets k),
 (SELECT jsonb_agg(to_jsonb(r)-ARRAY['published_by','release_note']ORDER BY id)FROM rtn_private.releases r),
 (SELECT jsonb_agg(t ORDER BY id)FROM rtn_private.attempts t)));
SELECT lab.check('freshness: removing reviewer attribution cannot renew or invalidate the frozen review',rtn_private.normative_current((lab.ctx('fresh_review')->>'key_set_id')::uuid,clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM rtn_private.key_sets WHERE reviewed_by='81000000-0000-4000-8000-000000000999') AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id='81000000-0000-4000-8000-000000000999'));
