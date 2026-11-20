BEGIN;
SET ROLE postgres;
SELECT lab.check('backoff replaces only scheduler body preserving its OID ACL config and all other functions',
 NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lab.ctx('source_retry_old_functions')) old LEFT JOIN pg_proc p ON p.oid=(old->>'oid')::oid
 WHERE p.oid IS NULL OR to_jsonb(p)-'prosrc' IS DISTINCT FROM old-'prosrc'
 OR(p.oid<>'public.enqueue_due_rtn_checks()'::regprocedure AND p.prosrc IS DISTINCT FROM old->>'prosrc'))
 AND (SELECT md5(prosrc)<>'9cdc279471df0cfce5023b20d00faf97' FROM pg_proc WHERE oid='public.enqueue_due_rtn_checks()'::regprocedure));
SELECT lab.check('migration preserves every existing source queue and immutable original row',
 lab.ctx('source_retry_old_sources')=(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.sources s)
 AND lab.ctx('source_retry_old_queue')=(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.check_runs r)
 AND lab.ctx('source_retry_old_originals')=(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.source_revisions s));
SET ROLE anon;
SELECT lab.denied('anonymous role cannot enqueue bank source checks',$$SELECT public.enqueue_due_rtn_checks()$$);
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.denied('authenticated owner cannot invoke service scheduler',$$SELECT public.enqueue_due_rtn_checks()$$);
SET ROLE postgres;
SELECT lab.check('preexisting sandbox role still has no source scheduler grant',NOT has_function_privilege('sandbox_exec_atxwvjxbqjgkbjlhsdch','public.enqueue_due_rtn_checks()','EXECUTE'));
UPDATE rtn_private.rollout_state SET stage='paid' WHERE id=1;
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.denied('manual source check retains foreign organization denial',$$SELECT public.request_rtn_source_check('22222222-2222-4222-8222-222222222222','a1000000-0000-4000-8000-000000000001')$$);
SELECT lab.check('genuine manual check still returns existing pending run without replacing it',
 public.request_rtn_source_check('11111111-1111-4111-8111-111111111111','a1000000-0000-4000-8000-000000000001')->>'run_id'='a4000000-0000-4000-8000-000000000001');
SET ROLE postgres;
CREATE TABLE lab.backoff_cases(n integer PRIMARY KEY,name text NOT NULL,checked_age interval,full_age interval,terminal_status text,
 terminal_age interval,terminal_error text,http_status integer,expected_kind text,active boolean NOT NULL DEFAULT true);
INSERT INTO lab.backoff_cases VALUES
 (1,'fresh403 with never successful full check does not bypass24h backoff','5 minutes',NULL,'error','5 minutes','OFFICIAL_HTTP_403',NULL,NULL,true),
 (2,'fresh401 error code retains24h backoff','5 minutes',NULL,'error','5 minutes','OFFICIAL_HTTP_401',NULL,NULL,true),
 (3,'fresh429 error code retains24h backoff','5 minutes',NULL,'error','5 minutes','OFFICIAL_HTTP_429',NULL,NULL,true),
 (4,'recorded HTTP403 retains24h even when error text is generic','5 minutes',NULL,'error','5 minutes','RTN_SOURCE_CHECK_FAILED',403,NULL,true),
 (5,'overdue successful full date cannot bypass a fresh403','5 minutes','8 days','error','5 minutes','OFFICIAL_HTTP_403',NULL,NULL,true),
 (6,'HTTP503 failure waits an elapsed hour','59 minutes','2 days','error','59 minutes','OFFICIAL_HTTP_503',503,NULL,true),
 (7,'transient network error waits an hour despite weekly due','59 minutes',NULL,'error','59 minutes','OFFICIAL_FETCH_FAILED',NULL,NULL,true),
 (8,'transient failure older than an hour retries the overdue full check','61 minutes',NULL,'error','61 minutes','OFFICIAL_FETCH_FAILED',NULL,'weekly',true),
 (9,'daily transient failure retries at one hour despite recent full success','1 hour','2 days','error','1 hour','OFFICIAL_TIMEOUT',NULL,'daily',true),
 (10,'known blocked source retries at24hour boundary','24 hours',NULL,'error','24 hours','OFFICIAL_HTTP_403',NULL,'weekly',true),
 (11,'known blocked source stays deferred immediately before24hour boundary','23 hours 59 minutes 50 seconds',NULL,'error','23 hours 59 minutes 50 seconds','OFFICIAL_HTTP_403',NULL,NULL,true),
 (12,'blocked daily check becomes daily retry after24hours','24 hours 10 seconds','2 days','error','24 hours 10 seconds','OFFICIAL_HTTP_403',NULL,'daily',true),
 (13,'successful recent daily and full checks remain not due','1 hour','2 days','unchanged','1 hour',NULL,200,NULL,true),
 (14,'successful daily check remains due after one day','25 hours','2 days','unchanged','25 hours',NULL,200,'daily',true),
 (15,'successful full check remains weekly due at seven days','1 hour','7 days','unchanged','1 hour',NULL,200,'weekly',true),
 (16,'successful full check remains not due before seven days','1 hour','6 days 23 hours','changed','1 hour',NULL,200,NULL,true),
 (17,'never checked active source retains first weekly queue',NULL,NULL,NULL,NULL,NULL,NULL,'weekly',true),
 (18,'inactive source remains excluded even when never checked',NULL,NULL,NULL,NULL,NULL,NULL,NULL,false),
 (19,'latest success supersedes an older failed outcome','10 minutes','2 days','unchanged','10 minutes',NULL,200,NULL,true),
 (20,'latest failed outcome supersedes older success','59 minutes','2 days','error','59 minutes','OFFICIAL_TIMEOUT',NULL,NULL,true),
 (21,'an active running check remains open without duplicate work',NULL,NULL,NULL,NULL,NULL,NULL,NULL,true),
 (22,'a lower expired lease remains reclaimable without creating another run',NULL,NULL,NULL,NULL,NULL,NULL,NULL,true),
 (23,'third exhausted lease becomes existing terminal error and waits instead of immediate retry',NULL,NULL,NULL,NULL,NULL,NULL,NULL,true),
 (24,'already queued old source remains untouched and unduplicated',NULL,NULL,NULL,NULL,NULL,NULL,NULL,true),
 (25,'unknown redacted failure waits one hour without guessing blocked class','59 minutes','2 days','error','59 minutes',NULL,NULL,NULL,true),
 (26,'redacted text retains24h when numeric HTTP status still proves blocking','2 hours','2 days','error','2 hours',NULL,403,NULL,true),
 (27,'completion order wins over a more recently queued older success','59 minutes','2 days','error','59 minutes','OFFICIAL_TIMEOUT',NULL,NULL,true),
 (28,'equal completion times use deterministic higher run id','2 hours',NULL,'error','2 hours','OFFICIAL_HTTP_503',503,NULL,true),
 (29,'unknown error retries daily after one elapsed hour','61 minutes','2 days','error','61 minutes',NULL,NULL,'daily',true),
 (30,'server wall clock permits retry after transaction start becomes stale','1 hour','2 days','error','1 hour -0.01 second','OFFICIAL_TIMEOUT',NULL,'daily',true);
INSERT INTO rtn_private.sources(id,code,title,page_url,document_url,trusted_anchor_rule,parser,last_checked_at,last_full_check_at,last_status,active)
 SELECT ('a5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'backoff-case-'||n,'Synthetic backoff case '||n,
 'https://www.gosnadzor.ru/service/list/backoff/','https://www.gosnadzor.ru/upload/backoff.pdf','a1','industrial-pdf',
 now()-checked_age,now()-full_age,terminal_status,active FROM lab.backoff_cases;
INSERT INTO rtn_private.check_runs(id,source_id,kind,status,queued_at,completed_at,error,http_status)
 SELECT ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('a5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'weekly',terminal_status,now()-terminal_age-interval '1 minute',now()-terminal_age,terminal_error,http_status FROM lab.backoff_cases WHERE terminal_status IS NOT NULL;
UPDATE rtn_private.check_runs SET queued_at=now()-interval '5 hours' WHERE id='b1000000-0000-4000-8000-000000000027';
-- Older failures/successes and completion-order traps are real fixture rows,
-- not a guessed source.last_error field or a parser of prose error messages.
INSERT INTO rtn_private.check_runs(id,source_id,kind,status,queued_at,completed_at,error,http_status) VALUES
 ('b2000000-0000-4000-8000-000000000019','a5000000-0000-4000-8000-000000000019','daily','error',now()-interval '40 minutes',now()-interval '30 minutes','OFFICIAL_HTTP_403',NULL),
 ('b2000000-0000-4000-8000-000000000020','a5000000-0000-4000-8000-000000000020','daily','unchanged',now()-interval '3 hours',now()-interval '2 hours',NULL,200),
 ('b2000000-0000-4000-8000-000000000027','a5000000-0000-4000-8000-000000000027','daily','unchanged',now()-interval '2 hours',now()-interval '1 hour',NULL,200),
 ('b2000000-0000-4000-8000-000000000028','a5000000-0000-4000-8000-000000000028','weekly','error',now()-interval '3 hours',now()-interval '2 hours','OFFICIAL_HTTP_403',NULL);
INSERT INTO rtn_private.check_runs(id,source_id,kind,status,lease_token,lease_expires_at,attempt_count,queued_at) VALUES
 ('b3000000-0000-4000-8000-000000000021','a5000000-0000-4000-8000-000000000021','weekly','running',gen_random_uuid(),now()+interval '5 minutes',1,now()-interval '5 minutes'),
 ('b3000000-0000-4000-8000-000000000022','a5000000-0000-4000-8000-000000000022','weekly','running',gen_random_uuid(),now()-interval '1 minute',1,now()-interval '5 minutes'),
 ('b3000000-0000-4000-8000-000000000023','a5000000-0000-4000-8000-000000000023','weekly','running',gen_random_uuid(),now()-interval '1 minute',3,now()-interval '5 minutes'),
 ('b3000000-0000-4000-8000-000000000024','a5000000-0000-4000-8000-000000000024','weekly','queued',NULL,NULL,0,now()-interval '5 days');
SELECT lab.keep('source_retry_sources_before_call',(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.sources s));
SELECT lab.keep('source_retry_open_before_call',(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.check_runs r
 WHERE status IN('queued','running') AND id<>'b3000000-0000-4000-8000-000000000023'));
-- Same transaction's now() is deliberately older than this due boundary.
SELECT pg_sleep(0.03);
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT lab.keep('source_retry_enqueued',public.enqueue_due_rtn_checks());
SET ROLE postgres;
SELECT lab.check(c.name,CASE WHEN expected_kind IS NULL THEN NOT EXISTS(SELECT 1 FROM rtn_private.check_runs r
 WHERE r.source_id=('a5000000-0000-4000-8000-'||lpad(c.n::text,12,'0'))::uuid AND r.status='queued' AND r.id::text NOT LIKE 'b3000000-%')
 ELSE EXISTS(SELECT 1 FROM rtn_private.check_runs r WHERE r.source_id=('a5000000-0000-4000-8000-'||lpad(c.n::text,12,'0'))::uuid AND r.status='queued' AND r.kind=c.expected_kind) END)
 FROM lab.backoff_cases c ORDER BY n;
SELECT lab.check('source retry result returns only new queued run ids with unchanged DTO',
 (SELECT count(*)=(lab.ctx('source_retry_enqueued')->>'queued')::integer FROM lab.backoff_cases WHERE expected_kind IS NOT NULL)
 AND jsonb_array_length(lab.ctx('source_retry_enqueued')->'run_ids')=(lab.ctx('source_retry_enqueued')->>'queued')::integer
 AND NOT(lab.ctx('source_retry_enqueued') ?| ARRAY['source_url','actor_id','organization_id']));
SELECT lab.check('scheduler never rewrites source health or original success timestamps',lab.ctx('source_retry_sources_before_call')=(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.sources s));
SELECT lab.check('prior queued sentinel and originals remain byte exact after schedule call',
 lab.ctx('source_retry_old_queue')=(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.check_runs r WHERE id='a4000000-0000-4000-8000-000000000001')
 AND lab.ctx('source_retry_old_originals')=(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.source_revisions s));
SELECT lab.check('existing third lease cleanup stays explicit terminal error without a fabricated success',EXISTS(SELECT 1 FROM rtn_private.check_runs
 WHERE id='b3000000-0000-4000-8000-000000000023' AND status='error' AND error='worker_lease_expired' AND completed_at IS NOT NULL AND lease_token IS NULL));
SELECT lab.check('preexisting pending active and reclaimable open runs keep every stored byte',
 lab.ctx('source_retry_open_before_call')=(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.check_runs r WHERE id IN(
 'a4000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000021','b3000000-0000-4000-8000-000000000022','b3000000-0000-4000-8000-000000000024')));
SELECT lab.keep('source_retry_queue_after_first',(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.check_runs r));
SET ROLE service_role;SELECT lab.keep('source_retry_again',public.enqueue_due_rtn_checks());
SET ROLE postgres;
SELECT lab.check('another hourly tick neither duplicates nor rewrites durable queued checks',lab.ctx('source_retry_again')->>'queued'='0'
 AND lab.ctx('source_retry_queue_after_first')=(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.check_runs r));
SELECT lab.check('client course results invoices and financial settings remain preserved',lab.ctx('source_retry_old_business')=(SELECT jsonb_build_array(
 (SELECT jsonb_agg(x)FROM public.courses x),(SELECT jsonb_agg(x)FROM public.test_attempts x),(SELECT jsonb_agg(x)FROM public.subscription_invoices x))));
COMMIT;
