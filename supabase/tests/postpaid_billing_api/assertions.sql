\set ON_ERROR_STOP on
-- Disposable native database only; fixtures/auth model are defined by builder.
SELECT public.api_test_ok(current_setting('server_version_num')::int>=170000,'native PostgreSQL17 or newer');
-- Materialize the exact nine ordinary functions BEFORE calling
-- pg_get_functiondef. A join/WHERE filter alone can be reordered by PostgreSQL,
-- sending unrelated aggregate OIDs (for example array_agg) to that function.
WITH native_functions AS MATERIALIZED (
 SELECT p.oid,p.proacl FROM pg_proc p WHERE p.prokind='f' AND p.oid=ANY(ARRAY[
  'public.postpaid_is_admin()'::regprocedure::oid,
  'public.postpaid_require_admin()'::regprocedure::oid,
  'public.postpaid_collect_snapshot(uuid,date)'::regprocedure::oid,
  'public.postpaid_calculate(integer,integer,jsonb,integer,integer)'::regprocedure::oid,
  'public.approve_postpaid_statement(uuid,text,integer,integer)'::regprocedure::oid,
  'public.postpaid_authorize_invoice_write(uuid,text)'::regprocedure::oid,
  'public.guard_postpaid_invoice()'::regprocedure::oid,
  'public.issue_postpaid_invoice(uuid)'::regprocedure::oid,
  'public.postpaid_statement_immutable_snapshot()'::regprocedure::oid
 ])
)
SELECT public.api_test_ok(count(*)=9,'all nine unchanged native financial definitions and ACLs preserved')
 FROM public.api_test_preservation f JOIN native_functions p ON 'function:'||p.oid::regprocedure::text=f.name
 WHERE md5(pg_get_functiondef(p.oid)||p.proacl::text)=f.value;
SELECT public.api_test_ok(count(*)=3,'exactly three checked functions admin execution ACL') FROM pg_proc p
 WHERE p.pronamespace='public'::regnamespace AND p.proname IN('preview_postpaid_statement_checked','approve_postpaid_statement_checked','issue_postpaid_invoice_checked')
 AND p.prosecdef AND pg_get_userbyid(p.proowner)=current_user
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('service_role',p.oid,'EXECUTE');
SELECT public.api_test_ok(NOT has_function_privilege('authenticated','public.postpaid_collect_snapshot(uuid,date)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.postpaid_calculate(integer,integer,jsonb,integer,integer)','EXECUTE'),
 'private collector and calculator stay private');

SET ROLE anon;
SELECT public.api_test_error('SELECT public.preview_postpaid_statement_checked(NULL,NULL)','42501','anon cannot execute checked preview');
SET ROLE service_role;
SELECT public.api_test_error('SELECT public.preview_postpaid_statement_checked(NULL,NULL)','42501','service role cannot execute checked preview');
RESET ROLE;
SET ROLE authenticated;
SET billing_test.actor='';
SELECT public.api_test_error('SELECT public.preview_postpaid_statement_checked(NULL,NULL)','42501','missing user denied before parameter or existence checks');
SET billing_test.actor='20000000-0000-4000-8000-000000000003';
SELECT public.api_test_error('SELECT public.preview_postpaid_statement_checked(NULL,NULL)','42501','organization role cannot use administrative preview');
SELECT public.api_test_error('SELECT public.approve_postpaid_statement_checked(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)','42501','organization role cannot approve');
SELECT public.api_test_error('SELECT public.issue_postpaid_invoice_checked(NULL,NULL,NULL,NULL,NULL,NULL)','42501','organization role cannot issue');
SET billing_test.actor='20000000-0000-4000-8000-000000000004';
SELECT public.api_test_error('SELECT public.preview_postpaid_statement_checked(NULL,NULL)','42501','revoked admin denied');
SET billing_test.actor='20000000-0000-4000-8000-000000000005';
SELECT public.api_test_error('SELECT public.preview_postpaid_statement_checked(NULL,NULL)','42501','student denied');
SET billing_test.actor='20000000-0000-4000-8000-000000000001';
SELECT public.api_test_error('SELECT public.preview_postpaid_statement_checked(NULL,NULL)','22023','admin null scope rejected');
SELECT public.api_test_error(format('SELECT public.preview_postpaid_statement_checked(%L,%L)',
 (SELECT org FROM public.api_test_fixture WHERE name='other'),(SELECT statement FROM public.api_test_fixture WHERE name='main')),
 'P0002','cross organization statement denied');
INSERT INTO public.api_test_receipts SELECT 'preview',public.preview_postpaid_statement_checked(org,statement)
 FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_ok((value->>'fresh')::boolean AND (value->'current'->>'period_closed')::boolean
 AND (value->'current'->>'courses_count')::int=22 AND (value->'current'->>'learners_count')::int=119
 AND value->'current'->'quote'->>'plan'='standard' AND (value->'current'->'quote'->>'amount')::numeric=6990,
 'actual native collector preview union119people22courses standard6990') FROM public.api_test_receipts WHERE name='preview';
SELECT public.api_test_ok(NOT(value::text LIKE '%PRIVATE CUSTOMER%' OR value::text LIKE '%customer_confirmation%'
 OR value::text LIKE '%feature_evidence%' OR value::text LIKE '%recorded_by%')
 AND value->'statement'->'review_hash'='null'::jsonb,'safe preview excludes private payloads and unapproved review hash')
 FROM public.api_test_receipts WHERE name='preview';
SELECT public.api_test_error(format('SELECT public.approve_postpaid_statement_checked(%L,%L,%L,6990,%L,22,119,%L)',
 org,statement,'NOT-A-HASH','standard','Synthetic reviewed facts'),'22023','malformed expected hash rejected')
 FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_error(format('SELECT public.approve_postpaid_statement_checked(%L,%L,%L,6990,%L,22,119,%L)',
 org,statement,repeat('0',32),'standard','Synthetic reviewed facts'),'40001','stale source expectation rejected')
 FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_error(format('SELECT public.approve_postpaid_statement_checked(%L,%L,%L,4490,%L,22,119,%L)',
 org,statement,source_hash,'start','Synthetic reviewed facts'),'40001','caller cannot approve wrong lower price')
 FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_error(format('SELECT public.approve_postpaid_statement_checked(%L,%L,%L,6990,%L,21,118,%L)',
 org,statement,source_hash,'standard','Synthetic reviewed facts'),'P0001','native ledger lower bounds not bypassed')
 FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_error(format('SELECT public.approve_postpaid_statement_checked(%L,%L,%L,6990,%L,NULL,119,%L)',
 org,statement,source_hash,'standard','Synthetic reviewed facts'),'22023','manual counts cannot be omitted')
 FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_error(format('SELECT public.approve_postpaid_statement_checked(%L,%L,%L,4490,%L,0,0,%L)',
 org,statement,source_hash,'start','Synthetic reviewed facts'),'55000','open current month cannot be approved')
 FROM public.api_test_fixture WHERE name='open';
SELECT public.api_test_ok(status='needs_review' AND reviewed_at IS NULL AND invoice_id IS NULL,'failed approvals left statement untouched')
 FROM public.postpaid_billing_statements WHERE id=(SELECT statement FROM public.api_test_fixture WHERE name='main');
INSERT INTO public.api_test_receipts SELECT 'approved',public.approve_postpaid_statement_checked(org,statement,source_hash,
 6990,'standard',22,119,'Synthetic reviewed facts') FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_ok(value->'statement'->>'status'='approved' AND NOT (value->>'already_approved')::boolean
 AND value->'statement'->>'review_hash' ~ '^[a-f0-9]{32}$','first exact review saved by native writer')
 FROM public.api_test_receipts WHERE name='approved';
SET billing_test.actor='20000000-0000-4000-8000-000000000002';
INSERT INTO public.api_test_receipts SELECT 'approve-retry',public.approve_postpaid_statement_checked(org,statement,source_hash,
 6990,'standard',22,119,'Synthetic reviewed facts') FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_ok((r.value->>'already_approved')::boolean
 AND r.value->'statement'=a.value->'statement','approval retry by another admin reuses original review timestamp and hash')
 FROM public.api_test_receipts r CROSS JOIN public.api_test_receipts a WHERE r.name='approve-retry' AND a.name='approved';
SELECT public.api_test_error(format('SELECT public.approve_postpaid_statement_checked(%L,%L,%L,6990,%L,22,120,%L)',
 org,statement,source_hash,'standard','Synthetic reviewed facts'),'40001','same tier conflicting reviewed counts rejected')
 FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_error(format('SELECT public.approve_postpaid_statement_checked(%L,%L,%L,6990,%L,22,119,%L)',
 org,statement,source_hash,'standard','Different explicit review note'),'40001','conflicting review note rejected')
 FROM public.api_test_fixture WHERE name='main';
SET TIME ZONE 'Asia/Vladivostok';
SELECT public.api_test_ok(public.preview_postpaid_statement_checked(org,statement)->'statement'->>'review_hash'=
 (SELECT value->'statement'->>'review_hash' FROM public.api_test_receipts WHERE name='approved'),
 'review hash stable across caller timezone') FROM public.api_test_fixture WHERE name='main';
SET TIME ZONE 'UTC';
SELECT public.api_test_error(format('SELECT public.issue_postpaid_invoice_checked(%L,%L,%L,6990,%L,%L)',
 org,statement,source_hash,'standard',repeat('0',32)),'40001','issue requires exact saved review hash')
 FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_error(format('SELECT public.issue_postpaid_invoice_checked(%L,%L,%L,4490,%L,%L)',
 org,statement,source_hash,'start',(SELECT value->'statement'->>'review_hash' FROM public.api_test_receipts WHERE name='approved')),
 '40001','issue expected amount and plan protected') FROM public.api_test_fixture WHERE name='main';
RESET ROLE;

-- New immutable source evidence after approval invalidates an unissued review,
-- even if it leaves the same119/22 price tier. Roll back only synthetic fact.
BEGIN;
SAVEPOINT late_source;
INSERT INTO public.postpaid_usage_events VALUES(md5('late-pair')::uuid,'10000000-0000-4000-8000-000000000001',
 'study',md5('learner-a1')::uuid,md5('course-a2')::uuid,'2020-01-25T00:00:00Z','lab','late',NULL);
SET LOCAL ROLE authenticated;
SET LOCAL billing_test.actor='20000000-0000-4000-8000-000000000001';
SELECT public.api_test_error(format('SELECT public.issue_postpaid_invoice_checked(%L,%L,%L,6990,%L,%L)',
 org,statement,source_hash,'standard',(SELECT value->'statement'->>'review_hash' FROM public.api_test_receipts WHERE name='approved')),
 '40001','late source rejected before issue') FROM public.api_test_fixture WHERE name='main';
RESET ROLE;
ROLLBACK TO late_source;
COMMIT;
-- The assertion above intentionally rolled back with its fixture; record only
-- its completed nonexceptional transaction boundary as a preserved test case.
SELECT public.api_test_ok(true,'late-source assertion transaction completed and reverted synthetic event');
SET ROLE authenticated;
SET billing_test.actor='20000000-0000-4000-8000-000000000001';
INSERT INTO public.api_test_receipts SELECT 'issued',public.issue_postpaid_invoice_checked(org,statement,source_hash,
 6990,'standard',(SELECT value->'statement'->>'review_hash' FROM public.api_test_receipts WHERE name='approved'))
 FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_ok(NOT(value->>'already_issued')::boolean AND value->>'payment_status'='pending'
 AND value->'paid_at'='null'::jsonb AND (value->>'amount')::numeric=6990 AND value->>'currency'='RUB',
 'first issue creates one pending6990 invoice without payment') FROM public.api_test_receipts WHERE name='issued';
INSERT INTO public.api_test_receipts SELECT 'issue-retry',public.issue_postpaid_invoice_checked(org,statement,source_hash,
 6990,'standard',(SELECT value->'statement'->>'review_hash' FROM public.api_test_receipts WHERE name='approved'))
 FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_ok((r.value->>'already_issued')::boolean AND r.value->>'invoice_id'=a.value->>'invoice_id'
 AND r.value->>'invoice_number'=a.value->>'invoice_number','issue retry returns original identity and number')
 FROM public.api_test_receipts r CROSS JOIN public.api_test_receipts a WHERE r.name='issue-retry' AND a.name='issued';
SELECT public.api_test_ok(count(*)=1,'only one native invoice exists') FROM public.subscription_invoices;
SELECT public.api_test_error('UPDATE public.subscription_invoices SET status=''paid''','42501','authenticated direct invoice update forbidden');
RESET ROLE;
-- Later facts must not turn an issued replay into a second obligation.
INSERT INTO public.postpaid_usage_events VALUES(md5('later-after-issue')::uuid,'10000000-0000-4000-8000-000000000001',
 'study',md5('learner-a1')::uuid,md5('course-a2')::uuid,'2020-01-25T00:00:00Z','lab','later',NULL);
SET ROLE authenticated;
SET billing_test.actor='20000000-0000-4000-8000-000000000001';
SELECT public.api_test_ok(public.preview_postpaid_statement_checked(org,statement)->'fresh'='null'::jsonb
 AND public.preview_postpaid_statement_checked(org,statement)->'current'='null'::jsonb,
 'issued preview uses frozen receipt without re-evaluating later facts') FROM public.api_test_fixture WHERE name='main';
INSERT INTO public.api_test_receipts SELECT 'issued-late-replay',public.issue_postpaid_invoice_checked(org,statement,source_hash,
 6990,'standard',(SELECT value->'statement'->>'review_hash' FROM public.api_test_receipts WHERE name='approved'))
 FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_ok((r.value->>'already_issued')::boolean AND r.value->>'invoice_id'=a.value->>'invoice_id',
 'issued late-source replay safely reuses frozen obligation') FROM public.api_test_receipts r CROSS JOIN public.api_test_receipts a
 WHERE r.name='issued-late-replay' AND a.name='issued';
SELECT public.api_test_ok(public.approve_postpaid_statement_checked(org,statement,source_hash,6990,'standard',22,119,
 'Synthetic reviewed facts')->>'already_issued'='true','issued exact approval retry never overwrites original review')
 FROM public.api_test_fixture WHERE name='main';
SELECT public.api_test_error(format('SELECT public.issue_postpaid_invoice_checked(%L,%L,%L,6990,%L,%L)',
 (SELECT org FROM public.api_test_fixture WHERE name='other'),statement,source_hash,'standard',
 (SELECT value->'statement'->>'review_hash' FROM public.api_test_receipts WHERE name='approved')),
 'P0002','cross organization issue cannot reuse someone else invoice') FROM public.api_test_fixture WHERE name='main';
RESET ROLE;
SELECT public.api_test_ok((SELECT md5(jsonb_agg(to_jsonb(o) ORDER BY id)::text) FROM public.organizations o)=value,
 'all organization access paid_until branding and features exact') FROM public.api_test_preservation WHERE name='organizations';
SELECT public.api_test_ok((SELECT md5(jsonb_agg(to_jsonb(a) ORDER BY id)::text) FROM public.organization_billing_agreements a)=value,
 'all postpaid agreement evidence exact') FROM public.api_test_preservation WHERE name='agreements';
SELECT public.api_test_ok(status='needs_review' AND invoice_id IS NULL AND reviewed_at IS NULL,
 'other organization statement unchanged') FROM public.postpaid_billing_statements WHERE id=(SELECT statement FROM public.api_test_fixture WHERE name='other');
SELECT public.api_test_ok(count(*)=0,'private financial write authorization tokens consumed') FROM public.postpaid_invoice_write_tokens;
SELECT jsonb_build_object('passed',count(*),'failed',count(*) FILTER(WHERE NOT passed),
 'qualification','isolated native PostgreSQL with synthetic auth model; not Cloud/JWT') AS native_checked_api_result FROM public.api_test_results;
