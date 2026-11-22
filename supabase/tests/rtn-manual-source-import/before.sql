-- Storage metadata is an explicit synthetic adapter, not a production ALTER.
SET ROLE postgres;
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS metadata jsonb;
SELECT lab.keep('intake_old_functions',(SELECT jsonb_agg(to_jsonb(p)ORDER BY oid)FROM pg_proc p));
SELECT lab.keep('intake_old_sources',(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM rtn_private.sources s));
SELECT lab.keep('intake_old_runs',(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.check_runs r));
SELECT lab.keep('intake_old_originals',(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.source_revisions r));
SELECT lab.keep('intake_old_learning',jsonb_build_array((SELECT jsonb_agg(to_jsonb(k)ORDER BY id)FROM rtn_private.key_sets k),(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.releases r),(SELECT jsonb_agg(to_jsonb(t)ORDER BY id)FROM rtn_private.attempts t),(SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM rtn_private.assignments a)));
SELECT lab.keep('intake_old_business',jsonb_build_array((SELECT jsonb_agg(x)FROM public.courses x),(SELECT jsonb_agg(x)FROM public.test_attempts x),(SELECT jsonb_agg(x)FROM public.subscription_invoices x)));
