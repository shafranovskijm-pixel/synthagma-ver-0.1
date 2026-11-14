SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000999',false);
SELECT lab.keep('approved_v2',public.approve_rtn_npa_manifest((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('changed_claim')->>'run_id')::uuid,(lab.ctx('configuration')->>'configuration_id')::uuid,(lab.ctx('approved')->>'manifest_id')::uuid,1,'Synthetic review of newly confirmed legal edition','85000000-0000-4000-8000-000000000004'));
SELECT lab.check('250 exact new legal baseline restores automatic window',lab.ctx('approved_v2')->'admission'->>'admission_basis'='automatic_attestation');
SELECT lab.keep('unknown_queue',public.request_rtn_npa_editorial_check((lab.ctx('bank_id')#>>'{}')::uuid));
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT lab.keep('unknown_claim',public.claim_rtn_npa_check((lab.ctx('unknown_queue')->>'run_id')::uuid));
SELECT lab.keep('unknown_complete',public.complete_rtn_npa_check((lab.ctx('unknown_claim')->>'run_id')::uuid,(lab.ctx('unknown_claim')->>'lease_token')::uuid,'{"protocol":"rtn-npa-v1","worker_version":"rtn-npa-official-v1","status":"unknown","basis":[],"question_source":null,"discovery":null,"additional_artifacts":[],"runtime_egress_verified":false,"error_code":"synthetic_transient_network_error"}'));
SELECT lab.check('250 transient failure never creates a renewal',lab.ctx('unknown_complete')->>'outcome'='unknown'AND lab.ctx('unknown_complete')->'valid_until_exclusive'='null'::jsonb);
SET ROLE postgres;
SELECT lab.check('250 new public RPC ACLs scrub provider sandbox and anonymous defaults',NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl)a
 WHERE n.nspname='public'AND p.proname IN('configure_rtn_npa_basis','approve_rtn_npa_manifest','acknowledge_rtn_npa_manual_review','request_rtn_npa_check','request_rtn_npa_editorial_check','get_rtn_npa_editorial_workspace','claim_rtn_npa_check','complete_rtn_npa_check','enqueue_due_rtn_npa_checks')
 AND a.grantee NOT IN((SELECT oid FROM pg_roles WHERE rolname='postgres'),(SELECT oid FROM pg_roles WHERE rolname=CASE WHEN p.proname IN('claim_rtn_npa_check','complete_rtn_npa_check','enqueue_due_rtn_npa_checks')THEN'service_role'ELSE'authenticated'END))));
SELECT lab.check('250 new private helpers and tables remain owner-only',NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl)a WHERE n.nspname='rtn_private'AND p.proname LIKE'npa_%'AND a.grantee<>p.proowner)
 AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='rtn_private'AND c.relname LIKE'npa_%'AND c.relkind='r'AND(NOT c.relrowsecurity OR EXISTS(SELECT 1 FROM aclexplode(c.relacl)a WHERE a.grantee<>c.relowner))));
SELECT lab.check('250 transient failure preserves still-live attested window',(rtn_private.npa_admission((lab.ctx('fresh_release')->>'release_id')::uuid,clock_timestamp()+interval'2 days')->>'allowed')::boolean);
SELECT lab.check('250 latest failure displayed separately from valid admission',rtn_private.npa_admission((lab.ctx('fresh_release')->>'release_id')::uuid,clock_timestamp())->>'latest_check_status'='unknown');
SAVEPOINT unsupported;
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000999',false);
SELECT lab.keep('pp_configuration',public.configure_rtn_npa_basis((lab.ctx('bank_id')#>>'{}')::uuid,(lab.ctx('configuration')->>'configuration_id')::uuid,(lab.ctx('fresh_release')->>'release_id')::uuid,lab.ctx('basis')||'[{"country":"RU","kind":"GovernmentDecree","date":"2023-01-01","number":"123","title":"Synthetic unsupported decree"}]',(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date,'Synthetic unsupported declared basis must not be ignored','85000000-0000-4000-8000-000000000005'));
SELECT lab.check('250 unsupported PP explicitly counted',lab.ctx('pp_configuration')->'unsupported_count'='1'::jsonb);
SELECT lab.keep('pp_queue',public.request_rtn_npa_editorial_check((lab.ctx('bank_id')#>>'{}')::uuid));
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT lab.keep('pp_claim',public.claim_rtn_npa_check((lab.ctx('pp_queue')->>'run_id')::uuid));
SELECT lab.check('250 claim includes unsupported basis honestly',jsonb_array_length(lab.ctx('pp_claim')->'unsupported_basis')=1 AND lab.ctx('pp_claim')->'all_declared_basis_count'='2'::jsonb);
SELECT lab.keep('pp_result',lab.npa_result((lab.ctx('pp_claim')->>'run_id')::uuid,2));
SELECT lab.keep('pp_complete',public.complete_rtn_npa_check((lab.ctx('pp_claim')->>'run_id')::uuid,(lab.ctx('pp_claim')->>'lease_token')::uuid,lab.ctx('pp_result')));
SELECT lab.check('250 FederalLaw-only proof cannot renew PP course',lab.ctx('pp_complete')->>'outcome'='unknown'AND lab.ctx('pp_complete')->'valid_until_exclusive'='null'::jsonb);
SET ROLE postgres;
SELECT lab.check('250 PP unknown preserves unexpired actual manual review',(rtn_private.npa_admission((lab.ctx('fresh_release')->>'release_id')::uuid,clock_timestamp())->>'allowed')::boolean);
SELECT lab.check('250 PP unknown does not extend old manual expiry',NOT(rtn_private.npa_admission((lab.ctx('fresh_release')->>'release_id')::uuid,clock_timestamp()+interval'2 days')->>'allowed')::boolean);
ROLLBACK TO SAVEPOINT unsupported;
SET ROLE postgres;
-- Independent verifier controls; malformed coverage is never accepted because
-- the service transport's status happened to say complete.
SELECT lab.check('250 unknown artifact path invalidates full proof',NOT(rtn_private.npa_proof(jsonb_set(lab.ctx('npa_result'),'{basis,0,artifacts,identity,path}',to_jsonb('npa250/'||(lab.ctx('npa_claim')->>'run_id')||'/'||repeat('b',64)||'.json')),(SELECT r FROM rtn_private.npa_check_runs r WHERE id=(lab.ctx('npa_claim')->>'run_id')::uuid),clock_timestamp())->>'full')::boolean);
SELECT lab.check('250 incomplete discovery totals invalidate full proof',NOT(rtn_private.npa_proof(jsonb_set(lab.ctx('npa_result'),'{discovery,reported_total}','577'),(SELECT r FROM rtn_private.npa_check_runs r WHERE id=(lab.ctx('npa_claim')->>'run_id')::uuid),clock_timestamp())->>'full')::boolean);
SELECT lab.check('250 duplicate NPA identity invalidates full proof',NOT(rtn_private.npa_proof(jsonb_set(lab.ctx('npa_result'),'{basis}',(lab.ctx('npa_result')->'basis')||(lab.ctx('npa_result')->'basis')),(SELECT r FROM rtn_private.npa_check_runs r WHERE id=(lab.ctx('npa_claim')->>'run_id')::uuid),clock_timestamp())->>'full')::boolean);
SELECT lab.check('250 truncated canonical graph cannot be called full proof',NOT(rtn_private.npa_proof(lab.ctx('npa_result')#-'{basis,0,stable,graph,canonical}',(SELECT r FROM rtn_private.npa_check_runs r WHERE id=(lab.ctx('npa_claim')->>'run_id')::uuid),clock_timestamp())->>'full')::boolean);
SELECT lab.denied('250 missing result status is rejected',$q$SELECT rtn_private.npa_proof(lab.ctx('npa_result')-'status',(SELECT r FROM rtn_private.npa_check_runs r WHERE id=(lab.ctx('npa_claim')->>'run_id')::uuid),clock_timestamp())$q$,'22023');
SELECT lab.check('250 missing artifact URL and transport cannot pass',NOT(rtn_private.npa_proof(lab.ctx('npa_result')#-'{basis,0,artifacts,identity,request_url}'#-'{basis,0,artifacts,identity,transport}',(SELECT r FROM rtn_private.npa_check_runs r WHERE id=(lab.ctx('npa_claim')->>'run_id')::uuid),clock_timestamp())->>'full')::boolean);
SELECT lab.keep('publication_proof',jsonb_set(lab.ctx('npa_result'),'{discovery}',(lab.ctx('npa_result')->'discovery')||jsonb_build_object('reported_total',1,
 'pages',jsonb_build_array((lab.ctx('npa_result')->'discovery'->'pages'->0)||'{"reported_total":1,"publication_ids":["0001202611140001"]}'),
 'resolved_publications',jsonb_build_array(jsonb_build_object('publication_id','0001202611140001','relation','not_related','basis_docids','[]'::jsonb,'graph_reference_ids','[]'::jsonb,
 'artifact',lab.artifact((lab.ctx('npa_claim')->>'run_id')::uuid,'http://actual.pravo.gov.ru:8000/api/ebpi/redtext?bpa=ebpi&t=999&ttl=2',repeat('9',64)))))));
SELECT lab.check('250 actual original-text publication endpoint maps to SQL full proof',(rtn_private.npa_proof(lab.ctx('publication_proof'),(SELECT r FROM rtn_private.npa_check_runs r WHERE id=(lab.ctx('npa_claim')->>'run_id')::uuid),clock_timestamp())->>'full')::boolean);
SELECT lab.check('250 missing publication relation fails closed',NOT(rtn_private.npa_proof(lab.ctx('publication_proof')#-'{discovery,resolved_publications,0,relation}',(SELECT r FROM rtn_private.npa_check_runs r WHERE id=(lab.ctx('npa_claim')->>'run_id')::uuid),clock_timestamp())->>'full')::boolean);
SELECT lab.check('250 hard future boundary is separate from editorial window',rtn_private.npa_hard_stop((lab.ctx('fresh_review')->>'key_set_id')::uuid,jsonb_build_array(jsonb_build_object('stable',jsonb_build_object('graph',jsonb_build_object('future_editions',jsonb_build_array(jsonb_build_object('effective_from',(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date+2)))))))=(((clock_timestamp()AT TIME ZONE'Europe/Moscow')::date+2)::timestamp AT TIME ZONE'Europe/Moscow'));
SELECT lab.denied('250 unauthorized immutable manifest rewrite','UPDATE rtn_private.npa_manifests SET acknowledged_epoch=999');
SELECT lab.denied('250 unauthorized source history deletion','DELETE FROM rtn_private.npa_findings');
SELECT lab.denied('250 arbitrary caller cannot use attribution eraser',$q$SELECT rtn_private.npa_erase_attribution('81000000-0000-4000-8000-000000000999')$q$);
