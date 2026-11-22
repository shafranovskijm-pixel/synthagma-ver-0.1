BEGIN;
SET ROLE postgres;
SELECT lab.check('manualmigration preserves all old source queue and original rows',
 lab.ctx('manual_retry_sources')=(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.sources s)
 AND lab.ctx('manual_retry_runs')=(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.check_runs s)
 AND lab.ctx('manual_retry_originals')=(SELECT coalesce(jsonb_agg(to_jsonb(s)ORDER BY id),'[]')FROM rtn_private.source_revisions s));
SELECT lab.check('manualmigration changes only two old bodies and preserves old function authority',
 NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lab.ctx('manual_retry_functions'))old LEFT JOIN pg_proc p ON p.oid=(old->>'oid')::oid
 WHERE p.oid IS NULL OR CASE WHEN p.oid IN('public.request_rtn_source_check(uuid,uuid)'::regprocedure,'public.get_rtn_workspace(uuid)'::regprocedure)
 THEN to_jsonb(p)-'prosrc' IS DISTINCT FROM old-'prosrc' ELSE to_jsonb(p) IS DISTINCT FROM old END));
UPDATE rtn_private.rollout_state SET stage='paid' WHERE id=1;
SET ROLE anon;
SELECT lab.denied('anonymous manualbank retry helper remainsprivate',$$SELECT rtn_private.source_retry_after('63000000-0000-4000-8000-000000000001')$$);
SELECT lab.denied('anonymous manualbank request remainsdenied',$$SELECT public.request_rtn_source_check('11111111-1111-4111-8111-111111111111','63000000-0000-4000-8000-000000000001')$$);
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.denied('authenticated users cannot directlyread private retryhelper',$$SELECT rtn_private.source_retry_after('63000000-0000-4000-8000-000000000001')$$);
SELECT lab.denied('foreignorganization cannotread even a blocked terminalreceipt',$$SELECT public.request_rtn_source_check('22222222-2222-4222-8222-222222222222','63000000-0000-4000-8000-000000000001')$$);
SET ROLE postgres;
INSERT INTO public.account_deletion_revocations VALUES('81000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SELECT lab.denied('a revokedactor cannotread a blockedreceipt orqueue a newrun',$$SELECT public.request_rtn_source_check('11111111-1111-4111-8111-111111111111','63000000-0000-4000-8000-000000000001')$$);
SET ROLE postgres;
DELETE FROM public.account_deletion_revocations WHERE user_id='81000000-0000-4000-8000-000000000001';
-- now() remains the transaction-start timestamp; the actual waiting interval
-- crosses case15's deadline. Native runner separately proves a real row wait.
UPDATE rtn_private.check_runs SET completed_at=now()-interval '1 hour'+interval '0.03 seconds'
 WHERE id='65000000-0000-4000-8000-000000000015';
SELECT lab.keep('manual_retry_runs_after_clock',(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.check_runs s));
SELECT pg_sleep(0.05);
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
DO $manual_cases$ DECLARE c record;sid uuid;reply jsonb;BEGIN
 FOR c IN SELECT * FROM lab.manual_retry_cases ORDER BY n LOOP
  sid:=('63000000-0000-4000-8000-'||lpad(c.n::text,12,'0'))::uuid;
  reply:=public.request_rtn_source_check('11111111-1111-4111-8111-111111111111',sid);
  IF c.expected_blocked THEN
   PERFORM lab.check(c.name,reply->>'status'='error' AND reply->'replayed'='true'::jsonb
    AND reply->'can_manual_check'='false'::jsonb AND (reply->>'retry_after')::timestamptz>clock_timestamp()
    AND reply->>'run_id'=('65000000-0000-4000-8000-'||lpad(c.n::text,12,'0')));
  ELSE
   PERFORM lab.check(c.name,reply->>'status'='queued' AND reply->'replayed'='false'::jsonb
    AND NOT(reply?'retry_after'));
  END IF;
 END LOOP;
END;$manual_cases$;
SELECT lab.keep('manual_retry_workspace',public.get_rtn_workspace('11111111-1111-4111-8111-111111111111'));
SET ROLE postgres;
SELECT lab.check('blocked manualrequests did notinsert orclaim a newrun',NOT EXISTS(
 SELECT 1 FROM rtn_private.check_runs r JOIN lab.manual_retry_cases c
 ON r.source_id=('63000000-0000-4000-8000-'||lpad(c.n::text,12,'0'))::uuid
 WHERE c.expected_blocked AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lab.ctx('manual_retry_runs'))old WHERE old->>'id'=r.id::text)));
SELECT lab.check('all preexisting runrows remainexact afterblocked andreleased requests',NOT EXISTS(
 SELECT 1 FROM jsonb_array_elements(lab.ctx('manual_retry_runs_after_clock'))old LEFT JOIN rtn_private.check_runs r ON r.id=(old->>'id')::uuid
 WHERE r.id IS NULL OR to_jsonb(r) IS DISTINCT FROM old));
SELECT lab.check('workspace denialdeadline and buttonpermission agreewith serverhelper',NOT EXISTS(
 SELECT 1 FROM jsonb_array_elements(lab.ctx('manual_retry_workspace')->'banks')b
 JOIN lab.manual_retry_cases c ON b->>'source_id'=('63000000-0000-4000-8000-'||lpad(c.n::text,12,'0'))
 WHERE (b->>'can_manual_check')::boolean IS DISTINCT FROM NOT c.expected_blocked
 OR (c.expected_blocked AND (b->>'next_check_after')::timestamptz IS DISTINCT FROM rtn_private.source_retry_after((b->>'source_id')::uuid))));
SELECT lab.check('manualrequests preserve sourcehealth originalbytes and unrelated business data',
 lab.ctx('manual_retry_sources')=(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.sources s)
 AND lab.ctx('manual_retry_originals')=(SELECT coalesce(jsonb_agg(to_jsonb(s)ORDER BY id),'[]')FROM rtn_private.source_revisions s)
 AND lab.ctx('manual_retry_business')=(SELECT jsonb_build_array((SELECT jsonb_agg(x)FROM public.courses x),
 (SELECT jsonb_agg(x)FROM public.test_attempts x),(SELECT jsonb_agg(x)FROM public.subscription_invoices x))));
SELECT lab.check('blocked receipt doesnotexpose leases actor claims URL or rawmetadata',
 NOT(lab.ctx('manual_retry_workspace')->'banks'->0 ?| ARRAY['lease_token','requested_by','result_metadata','authorization']));
COMMIT;
