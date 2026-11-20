-- Synthetic prior successful RSS plus an actual legacy-shaped live lease.
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('archive_first_claim',public.claim_rtn_news_check(NULL));
SELECT lab.keep('archive_prior_feed',jsonb_build_object('status','success','response_sha256',repeat('a',64),'byte_size',100,
 'original_path','news/rss/'||repeat('a',64)||'.xml','resolved_feed_url','https://www.gosnadzor.ru/news/rss/',
 'items',jsonb_build_array(jsonb_build_object('canonical_url','https://www.gosnadzor.ru/news/67/100/','title','Synthetic prior headline',
 'published_at',to_char((clock_timestamp()-interval '2 hours')AT TIME ZONE'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'content_sha256',repeat('b',64)))));
SELECT public.complete_rtn_news_check((lab.ctx('archive_first_claim')->>'run_id')::uuid,(lab.ctx('archive_first_claim')->>'lease_token')::uuid,lab.ctx('archive_prior_feed'));
SET ROLE postgres;UPDATE rtn_private.news_runtime SET next_due_at=clock_timestamp()-interval '1 second',last_enqueued_at=clock_timestamp()-interval '11 minutes';
SET ROLE service_role;SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('archive_legacy_claim',public.claim_rtn_news_check(NULL));
SET ROLE postgres;
SELECT lab.keep('archive_old_procs',(SELECT jsonb_agg(to_jsonb(p)ORDER BY oid)FROM pg_proc p));
SELECT lab.keep('archive_old_runs',(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.news_check_runs r));
SELECT lab.keep('archive_old_events',(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.update_events r));
SELECT lab.keep('archive_old_items',(SELECT jsonb_agg(to_jsonb(r)ORDER BY canonical_url)FROM rtn_private.news_items r));
SELECT lab.keep('archive_old_business',(SELECT jsonb_build_array((SELECT jsonb_agg(x)FROM public.courses x),(SELECT jsonb_agg(x)FROM public.test_attempts x),(SELECT jsonb_agg(x)FROM public.subscription_invoices x))));
