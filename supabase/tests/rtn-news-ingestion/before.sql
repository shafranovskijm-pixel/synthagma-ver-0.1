-- Existing synthetic facts BEFORE1500 must be preserved and projected only as
-- historical, non-notifiable metadata. These are not real reviewed questions.
INSERT INTO rtn_private.sources(id,code,title,page_url,document_url,trusted_anchor_rule,parser)
 VALUES('92000000-0000-4000-8000-000000000001','lab-source','Synthetic old source','https://www.gosnadzor.ru/service/list/lab/',
 'https://www.gosnadzor.ru/upload/lab-a.pdf','a1','industrial-pdf');
INSERT INTO rtn_private.banks(id,source_id,code,title,domain)
 VALUES('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','LAB-A','Synthetic bank','industrial-safety');
INSERT INTO rtn_private.source_revisions(id,source_id,sha256,original_path,media_type,byte_size,document_url,captured_at)
 VALUES('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',repeat('e',64),'lab/a.pdf','application/pdf',100,'https://www.gosnadzor.ru/upload/lab-a.pdf','2026-11-19T10:00:00Z');
INSERT INTO rtn_private.bank_revisions(id,bank_id,source_revision_id,questions,normalized_sha256,normalization_note,question_count)
 VALUES('95000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',
 '[{"id":"fixture-q1","number":1,"text":"Synthetic question","options":[]}]',repeat('e',64),'Synthetic fixture only; not a verified public bank',1);
INSERT INTO rtn_private.key_sets(id,bank_id,bank_revision_id,questions,display_title,source_generation,review_note,reviewed_by)
 VALUES('96000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','[]',
 'Synthetic key reference',1,'Synthetic reference only; no substantive answer approval','81000000-0000-4000-8000-000000000999');
INSERT INTO rtn_private.releases(id,bank_id,key_set_id,effective_from,release_note,published_by,published_at)
 VALUES('97000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',
 '2026-11-20','Synthetic reference only; not genuine publication acceptance','81000000-0000-4000-8000-000000000999','2026-11-20T10:00:00Z');
SELECT lab.keep('news_old_facts',(SELECT jsonb_build_array((SELECT to_jsonb(x) FROM rtn_private.source_revisions x WHERE id='94000000-0000-4000-8000-000000000001'),
 (SELECT to_jsonb(x) FROM rtn_private.bank_revisions x WHERE id='95000000-0000-4000-8000-000000000001'),
 (SELECT to_jsonb(x) FROM rtn_private.key_sets x WHERE id='96000000-0000-4000-8000-000000000001'),
 (SELECT to_jsonb(x) FROM rtn_private.releases x WHERE id='97000000-0000-4000-8000-000000000001'))));
SELECT lab.keep('news_old_business',(SELECT jsonb_build_array((SELECT jsonb_agg(x) FROM public.courses x),
 (SELECT jsonb_agg(x) FROM public.test_attempts x),(SELECT jsonb_agg(x) FROM public.subscription_invoices x))));
SELECT lab.keep('news_old_privacy',(SELECT to_jsonb(p) FROM pg_proc p WHERE oid='rtn_private.personal_counts(uuid)'::regprocedure));

SELECT lab.keep('news_reader_old_catalog',(SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_proc p));
