-- New post1400 composition cases only. Synthetic owner fixtures, never live
-- user claims, source facts, private objects or customer state.
SET ROLE postgres;
SELECT lab.check('only two reviewed readers change bodies and every old function metadata remains exact',
 (SELECT count(*)=2 FROM jsonb_array_elements(lab.ctx('news_reader_old_catalog')) old
  JOIN pg_proc p ON p.oid=(old->>'oid')::oid WHERE p.prosrc IS DISTINCT FROM old->>'prosrc')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lab.ctx('news_reader_old_catalog')) old
  LEFT JOIN pg_proc p ON p.oid=(old->>'oid')::oid WHERE p.oid IS NULL
   OR to_jsonb(p)-'prosrc' IS DISTINCT FROM old-'prosrc'
   OR(p.oid NOT IN('public.get_rtn_update_summary(uuid)'::regprocedure,'public.get_my_rtn_notifications(uuid,bigint,integer)'::regprocedure)
    AND p.prosrc IS DISTINCT FROM old->>'prosrc')));

-- A historical bootstrap task intentionally completes after a fresh RSS batch.
-- Its fact has an explicit old captured_at in this synthetic fixture; projection
-- must not relabel its late insertion time as a new observation.
INSERT INTO rtn_private.source_revisions(id,source_id,sha256,original_path,media_type,byte_size,document_url,captured_at)
 VALUES('94000000-0000-4000-8000-000000000090','92000000-0000-4000-8000-000000000001',repeat('9',64),
 'lab/old-backlog.pdf','application/pdf',100,'https://www.gosnadzor.ru/upload/lab-a.pdf','2020-01-01T00:00:00Z');
UPDATE rtn_private.update_projection_intents SET historical=true WHERE kind='source_revision' AND subject_id='94000000-0000-4000-8000-000000000090';
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.project_rtn_update_intents(25);
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.check('late historical projection does not replace a current RSS homepage event',
 public.get_rtn_update_summary('11111111-1111-4111-8111-111111111111')#>>'{latest_event,canonical_url}'='https://www.gosnadzor.ru/news/67/201/');
SET ROLE postgres;
SELECT lab.check('late historical projection observation is the actual recorded capture date',EXISTS(
 SELECT 1 FROM rtn_private.update_events e JOIN rtn_private.source_revisions sr ON sr.id=e.source_revision_id
 WHERE sr.id='94000000-0000-4000-8000-000000000090' AND e.observed_at=sr.captured_at AND e.historical AND NOT e.notifiable)
 AND(SELECT kind='source_change' AND historical FROM rtn_private.update_events ORDER BY sequence DESC LIMIT 1));

-- Count remains a bounded lower bound. Home selection must not accidentally
-- search only that most-recent1001 sequence page when archive backlog is large.
INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,news_source_id,canonical_url,title,published_at,observed_at,historical,notifiable)
 SELECT 'news','general','https://www.gosnadzor.ru/news/9/'||(50000+n)||'/',md5(n::text)||md5(n::text),1,
 'https://www.gosnadzor.ru/news/9/'||(50000+n)||'/','Synthetic old archive item '||n,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z',true,false
 FROM generate_series(1,1002)n;
SET ROLE authenticated;
SELECT lab.keep('news_large_summary',public.get_rtn_update_summary('11111111-1111-4111-8111-111111111111'));
SELECT lab.check('homepage latest is independent of bounded count page',lab.ctx('news_large_summary')#>>'{latest_event,canonical_url}'='https://www.gosnadzor.ru/news/67/201/'
 AND lab.ctx('news_large_summary')->>'event_count'='1000' AND lab.ctx('news_large_summary')->>'count_is_lower_bound'='true'
 AND lab.ctx('news_large_summary')->>'count_semantics'='known_events_not_unread');

-- First subscribe after the old article and its first corrections already
-- exist. No historical blast is delivered merely because preferences changed.
SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY['general'],ARRAY['news'],0);
SELECT lab.check('optin after old article and correction does not deliver history',
 public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')->>'materialized_count'='0');
-- Actual SQL statements run separately; a tiny lab delay avoids WASM ms-clock
-- ties, without fabricating a later publication or observed_at in the worker.
SELECT pg_sleep(0.005);
SET ROLE postgres;
UPDATE rtn_private.news_runtime SET last_enqueued_at=clock_timestamp()-interval '11 minutes',next_due_at=clock_timestamp()-interval '1 second';
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('news_claim',public.claim_rtn_news_check(NULL));
SELECT lab.keep('post_optin_payload',jsonb_set(jsonb_set(jsonb_set(jsonb_set(lab.ctx('payload_a'),'{response_sha256}',to_jsonb(repeat('6',64))),
 '{original_path}',to_jsonb('news/rss/'||repeat('6',64)||'.xml')),'{items,0,title}','"Post optin correction of old article"'),'{items,0,content_sha256}',to_jsonb(repeat('7',64))));
SELECT public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,(lab.ctx('news_claim')->>'lease_token')::uuid,lab.ctx('post_optin_payload'));
SET ROLE postgres;
SELECT lab.keep('post_optin_correction_id',(SELECT to_jsonb(current_event_id) FROM rtn_private.news_items WHERE canonical_url='https://www.gosnadzor.ru/news/67/100/'));
SELECT lab.check('postoptin correction keeps true old publication and new observed occurrence',EXISTS(
 SELECT 1 FROM rtn_private.update_events e JOIN rtn_private.personal_subscriptions s ON s.organization_id='11111111-1111-4111-8111-111111111111' AND s.user_id='81000000-0000-4000-8000-000000000001'
 WHERE e.id=(lab.ctx('post_optin_correction_id')#>>'{}')::uuid AND e.previous_event_id IS NOT NULL
 AND e.published_at=(lab.ctx('payload_a')#>>'{items,0,published_at}')::timestamptz
 AND e.published_at<s.enabled_since AND e.observed_at>s.enabled_since AND e.notifiable AND NOT e.historical));
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT lab.keep('correction_delivery',public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111'));
SELECT lab.check('new correction of old publication delivers once after optin',lab.ctx('correction_delivery')->>'materialized_count'='1'
 AND jsonb_array_length(lab.ctx('correction_delivery')->'items')=1
 AND lab.ctx('correction_delivery')#>>'{items,0,event,id}'=lab.ctx('post_optin_correction_id')#>>'{}');
SELECT lab.check('repeated correction pull keeps one recipient delivery',public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')->>'materialized_count'='0');
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',false);
SELECT pg_sleep(0.005);
SELECT public.save_my_rtn_subscription('22222222-2222-4222-8222-222222222222',true,ARRAY['general'],ARRAY['news'],0);
SELECT lab.check('late optin after correction still delivers zero history',public.get_my_rtn_notifications('22222222-2222-4222-8222-222222222222')->>'materialized_count'='0');

-- Newly discovered old first publication is ordinary historical capture, not
-- an observed correction. Both subscribed users must still receive nothing.
SET ROLE postgres;UPDATE rtn_private.news_runtime SET last_enqueued_at=clock_timestamp()-interval '11 minutes',next_due_at=clock_timestamp()-interval '1 second';
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('news_claim',public.claim_rtn_news_check(NULL));
SELECT public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,(lab.ctx('news_claim')->>'lease_token')::uuid,
 jsonb_set(jsonb_set(jsonb_set(jsonb_set(lab.ctx('post_optin_payload'),'{response_sha256}',to_jsonb(repeat('8',64))),
 '{original_path}',to_jsonb('news/rss/'||repeat('8',64)||'.xml')),'{items,0,canonical_url}','"https://www.gosnadzor.ru/news/67/800/"'),'{items,0,content_sha256}',to_jsonb(repeat('a',64))));
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.check('ordinary old first capture after optin is not correction delivery',public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')->>'materialized_count'='0');
SET ROLE postgres;
SELECT lab.check('ordinary old first capture keeps no predecessor and historical status',EXISTS(SELECT 1 FROM rtn_private.update_events
 WHERE canonical_url='https://www.gosnadzor.ru/news/67/800/' AND previous_event_id IS NULL AND historical AND NOT notifiable));
SELECT lab.check('correction materialization remains scoped to exact recipient and event',
 (SELECT count(*)=1 FROM rtn_private.personal_deliveries WHERE event_id=(lab.ctx('post_optin_correction_id')#>>'{}')::uuid)
 AND NOT EXISTS(SELECT 1 FROM rtn_private.personal_deliveries WHERE recipient_user_id='81000000-0000-4000-8000-000000000002'));
