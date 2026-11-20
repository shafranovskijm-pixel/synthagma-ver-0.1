-- Isolated synthetic queue sentinel, analogous to a previously queued source.
-- No production source, URL fetch, organization permission or live claim.
INSERT INTO rtn_private.sources(id,code,title,page_url,document_url,trusted_anchor_rule,parser)
 VALUES('a1000000-0000-4000-8000-000000000001','backoff-sentinel','Synthetic existing source','https://www.gosnadzor.ru/service/list/backoff/',
 'https://www.gosnadzor.ru/upload/backoff.pdf','a1','industrial-pdf');
INSERT INTO rtn_private.banks(id,source_id,code,title,domain)
 VALUES('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','BACKOFF','Synthetic source bank','industrial-safety');
INSERT INTO rtn_private.source_revisions(id,source_id,sha256,original_path,media_type,byte_size,document_url)
 VALUES('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',repeat('a',64),'synthetic-existing.pdf','application/pdf',100,'https://www.gosnadzor.ru/upload/backoff.pdf');
INSERT INTO rtn_private.check_runs(id,source_id,kind,status,queued_at)
 VALUES('a4000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','weekly','queued',now()-interval '5 days');
SELECT lab.keep('source_retry_old_functions',(SELECT jsonb_agg(to_jsonb(p)ORDER BY oid) FROM pg_proc p));
SELECT lab.keep('source_retry_old_sources',(SELECT jsonb_agg(to_jsonb(s)ORDER BY id) FROM rtn_private.sources s));
SELECT lab.keep('source_retry_old_queue',(SELECT jsonb_agg(to_jsonb(r)ORDER BY id) FROM rtn_private.check_runs r));
SELECT lab.keep('source_retry_old_originals',(SELECT jsonb_agg(to_jsonb(s)ORDER BY id) FROM rtn_private.source_revisions s));
SELECT lab.keep('source_retry_old_business',(SELECT jsonb_build_array((SELECT jsonb_agg(x)FROM public.courses x),(SELECT jsonb_agg(x)FROM public.test_attempts x),(SELECT jsonb_agg(x)FROM public.subscription_invoices x))));
