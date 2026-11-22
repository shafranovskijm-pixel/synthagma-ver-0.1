-- These are isolated synthetic source histories, never production source events.
CREATE TABLE lab.manual_retry_cases(n integer PRIMARY KEY,name text NOT NULL,
 status text,age interval,error text,http_status integer,expected_blocked boolean);
GRANT SELECT ON lab.manual_retry_cases TO authenticated;
INSERT INTO lab.manual_retry_cases VALUES
 (1,'manual403safeerror waits24h despite a missing successful fullcheck','error','5 minutes','OFFICIAL_HTTP_403',NULL,true),
 (2,'manual401safeerror waits24h','error','2 hours','OFFICIAL_HTTP_401',NULL,true),
 (3,'manual429safeerror waits24h','error','2 hours','OFFICIAL_HTTP_429',NULL,true),
 (4,'numeric403 independently proves24h for genericerror','error','2 hours','RTN_SOURCE_CHECK_FAILED',403,true),
 (5,'numeric429 independently proves24h for nullerror','error','2 hours',NULL,429,true),
 (6,'503 waits onehour','error','59 minutes','OFFICIAL_HTTP_503',503,true),
 (7,'unknownerror is onehour without guessing403','error','59 minutes',NULL,NULL,true),
 (8,'HTTP403 boundary allows request at24hours','error','24 hours','OFFICIAL_HTTP_403',NULL,false),
 (9,'transient boundary allows request at onehour','error','1 hour','OFFICIAL_FETCH_FAILED',NULL,false),
 (10,'latest success supersedes an older403','unchanged','5 minutes',NULL,200,false),
 (11,'latest failure wins bycompletion rather than enqueue order','error','59 minutes','OFFICIAL_TIMEOUT',NULL,true),
 (12,'equal completion uses deterministic higher runid','error','2 hours','OFFICIAL_HTTP_503',503,false),
 (13,'neverchecked entitled source can be manually queued',NULL,NULL,NULL,NULL,false),
 (14,'a future denialdeadline is tested before an alreadyqueued replay','error','5 minutes','OFFICIAL_HTTP_403',NULL,true),
 (15,'fresh wall clock after an elapsed wait beats stale transaction now','error','1 hour -0.03 seconds','OFFICIAL_TIMEOUT',NULL,false),
 (16,'prose mentioning403 doesnotinvent a24hour classification','error','2 hours','prose mentions403 butisnotan exactsafecode',NULL,false);
INSERT INTO rtn_private.sources(id,code,title,page_url,document_url,trusted_anchor_rule,parser,last_status,last_checked_at)
 SELECT ('63000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'manual-retry-'||n,name,
 'https://www.gosnadzor.ru/service/list/manual-retry/','https://www.gosnadzor.ru/upload/manual-retry.pdf','a1','industrial-pdf',status,now()-age
 FROM lab.manual_retry_cases;
INSERT INTO rtn_private.banks(id,source_id,code,title,domain)
 SELECT ('64000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('63000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'MANUAL-RETRY-'||n,name,'industrial-safety'
 FROM lab.manual_retry_cases;
INSERT INTO rtn_private.check_runs(id,source_id,kind,status,queued_at,completed_at,error,http_status)
 SELECT ('65000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('63000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'weekly',status,
 now()-age-interval '1 minute',now()-age,error,http_status FROM lab.manual_retry_cases WHERE status IS NOT NULL;
UPDATE rtn_private.check_runs SET queued_at=now()-interval '5 hours'
 WHERE id='65000000-0000-4000-8000-000000000011';
INSERT INTO rtn_private.check_runs(id,source_id,kind,status,queued_at,completed_at,error,http_status,organization_id,requested_by) VALUES
 ('66000000-0000-4000-8000-000000000010','63000000-0000-4000-8000-000000000010','weekly','error',now()-interval '3 hours',now()-interval '2 hours','OFFICIAL_HTTP_403',NULL,NULL,NULL),
 ('66000000-0000-4000-8000-000000000011','63000000-0000-4000-8000-000000000011','daily','unchanged',now()-interval '2 hours',now()-interval '1 hour',NULL,200,NULL,NULL),
 ('64000000-0000-4000-8000-000000000012','63000000-0000-4000-8000-000000000012','weekly','error',now()-interval '3 hours',now()-interval '2 hours','OFFICIAL_HTTP_403',NULL,NULL,NULL),
 ('67000000-0000-4000-8000-000000000014','63000000-0000-4000-8000-000000000014','manual','queued',now()-interval '3 minutes',NULL,NULL,NULL,'11111111-1111-4111-8111-111111111111','81000000-0000-4000-8000-000000000001');
-- Keep the tie exact rather than relying on independently sampled now().
UPDATE rtn_private.check_runs SET completed_at=(SELECT completed_at FROM rtn_private.check_runs WHERE id='65000000-0000-4000-8000-000000000012')
 WHERE id='64000000-0000-4000-8000-000000000012';
SELECT lab.keep('manual_retry_sources',(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.sources s));
SELECT lab.keep('manual_retry_runs',(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.check_runs s));
SELECT lab.keep('manual_retry_functions',(SELECT jsonb_agg(to_jsonb(p)ORDER BY oid)FROM pg_proc p));
SELECT lab.keep('manual_retry_originals',(SELECT coalesce(jsonb_agg(to_jsonb(s)ORDER BY id),'[]')FROM rtn_private.source_revisions s));
SELECT lab.keep('manual_retry_business',(SELECT jsonb_build_array((SELECT jsonb_agg(x)FROM public.courses x),
 (SELECT jsonb_agg(x)FROM public.test_attempts x),(SELECT jsonb_agg(x)FROM public.subscription_invoices x))));
