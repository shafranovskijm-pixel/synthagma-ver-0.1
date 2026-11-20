SELECT lab.check('six new global tables have RLS and no ordinary or service direct access',
 (SELECT count(*)=6 AND bool_and(c.relrowsecurity AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='rtn_private' AND c.relname IN('news_runtime','news_check_runs','news_feed_captures','news_items','news_item_evidence','update_projection_intents')));
SELECT lab.check('new global cache has no actor organization or recipient columns',NOT EXISTS(SELECT 1 FROM information_schema.columns
 WHERE table_schema='rtn_private' AND table_name IN('news_runtime','news_check_runs','news_feed_captures','news_items','news_item_evidence','update_projection_intents')
 AND column_name IN('actor_id','user_id','organization_id','recipient_id','requested_by','updated_by')));
SELECT lab.check('ingestion does not rewrite existing personal erasure scanner',lab.ctx('news_old_privacy')=(SELECT to_jsonb(p) FROM pg_proc p WHERE oid='rtn_private.personal_counts(uuid)'::regprocedure));
SELECT lab.check('service and user RPC grants are separated',
 has_function_privilege('service_role','public.complete_rtn_news_check(uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.complete_rtn_news_check(uuid,uuid,jsonb)','EXECUTE')
 AND has_function_privilege('authenticated','public.request_rtn_news_check(uuid)','EXECUTE')
 AND NOT has_function_privilege('service_role','public.request_rtn_news_check(uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','public.get_rtn_news_check_state(uuid)','EXECUTE')
 AND NOT has_function_privilege('sandbox_exec_atxwvjxbqjgkbjlhsdch','public.claim_rtn_news_check(uuid)','EXECUTE'));
SELECT lab.check('existing facts create exactly three historical queue intents without events',
 (SELECT count(*)=3 AND bool_and(historical) FROM rtn_private.update_projection_intents)
 AND NOT EXISTS(SELECT 1 FROM rtn_private.update_events));
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.project_rtn_update_intents(25);SELECT public.project_rtn_update_intents(25);SELECT public.project_rtn_update_intents(25);
SET ROLE postgres;
SELECT lab.check('historical source and release projection is deduplicated and never notifiable',
 (SELECT count(*)=2 AND bool_and(historical AND NOT notifiable) FROM rtn_private.update_events)
 AND(SELECT count(*)=3 FROM rtn_private.update_projection_intents WHERE completed_at IS NOT NULL));
UPDATE rtn_private.rollout_state SET stage='paid' WHERE id=1;
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.check('historical only home uses real publication or captured fact date',public.get_rtn_update_summary('11111111-1111-4111-8111-111111111111')#>>'{latest_event,release_id}'='97000000-0000-4000-8000-000000000001');
SET ROLE postgres;
DO $historical_fallback$ DECLARE correct boolean:=false;BEGIN
 BEGIN
  -- Insert a later sequence with genuinely older synthetic publication.
  INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,news_source_id,canonical_url,title,published_at,observed_at,historical,notifiable)
   VALUES('news','general','https://www.gosnadzor.ru/news/9/444/',repeat('4',64),1,'https://www.gosnadzor.ru/news/9/444/',
    'Synthetic old historical item inserted last','2018-01-01T00:00:00Z','2018-01-01T00:00:00Z',true,false);
  correct:=public.get_rtn_update_summary('11111111-1111-4111-8111-111111111111')#>>'{latest_event,release_id}'='97000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'RTN_LAB_ROLLBACK_HISTORICAL_ITEM';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM<>'RTN_LAB_ROLLBACK_HISTORICAL_ITEM' THEN RAISE;END IF;
 END;
 PERFORM lab.check('historical fallback ignores later insertion sequence of older item',correct);
END;$historical_fallback$;
SELECT lab.check('historical projection keeps actual recorded observation timestamps',NOT EXISTS(SELECT 1 FROM rtn_private.update_events e
 JOIN rtn_private.source_revisions sr ON sr.id=e.source_revision_id LEFT JOIN rtn_private.releases r ON r.id=e.release_id
 WHERE e.observed_at IS DISTINCT FROM CASE WHEN e.kind='bank_release' THEN r.published_at ELSE sr.captured_at END));
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.denied('manual refresh cannot target another organization',$$SELECT public.request_rtn_news_check('22222222-2222-4222-8222-222222222222')$$);
SELECT lab.denied('ordinary user cannot claim a service lease',$$SELECT public.claim_rtn_news_check(NULL)$$);
SELECT lab.keep('queued_news',public.request_rtn_news_check('11111111-1111-4111-8111-111111111111'));
SELECT lab.check('manual request returns a durable run without lease or actor attribution',
 lab.ctx('queued_news')->>'status'='queued' AND NOT(lab.ctx('queued_news') ?| ARRAY['lease_token','actor_id','organization_id']));
SELECT lab.check('new manual receipt exposes its current cooldown immediately',lab.ctx('queued_news')->>'cooldown_until' IS NOT NULL);
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',false);
SELECT lab.check('another paid organization reuses the same one global check',
 public.request_rtn_news_check('22222222-2222-4222-8222-222222222222')->>'run_id'=lab.ctx('queued_news')->>'run_id');
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT lab.keep('news_claim',public.claim_rtn_news_check((lab.ctx('queued_news')->>'run_id')::uuid));
SELECT lab.check('only one live lease can own the global feed',public.claim_rtn_news_check(NULL) IS NULL);
SELECT lab.denied('wrong lease token cannot complete a check',$$SELECT public.complete_rtn_news_check((lab.ctx('queued_news')->>'run_id')::uuid,gen_random_uuid(),'{}')$$,'40001');
SELECT lab.keep('payload_a',jsonb_build_object('status','success','response_sha256',repeat('a',64),'byte_size',100,
 'original_path','news/rss/'||repeat('a',64)||'.xml','resolved_feed_url','https://www.gosnadzor.ru/news/rss/',
 'items',jsonb_build_array(jsonb_build_object('canonical_url','https://www.gosnadzor.ru/news/67/100/','title','Synthetic headline A',
 'published_at',to_char((clock_timestamp()-interval '1 hour') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'content_sha256',repeat('b',64)))));
SELECT lab.denied('unknown result selectors are rejected atomically',$$SELECT public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,
 (lab.ctx('news_claim')->>'lease_token')::uuid,lab.ctx('payload_a')||'{"organization_id":"11111111-1111-4111-8111-111111111111"}')$$,'22023');
SELECT lab.keep('completed_a',public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,(lab.ctx('news_claim')->>'lease_token')::uuid,lab.ctx('payload_a')));
SELECT lab.check('completion receipt includes the successful observation from this transaction',lab.ctx('completed_a')->>'last_success_at' IS NOT NULL);
SELECT lab.check('same completed payload replay is idempotent',
 (public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,(lab.ctx('news_claim')->>'lease_token')::uuid,lab.ctx('payload_a'))->>'replayed')::boolean);
SELECT lab.denied('different payload cannot replace a committed completion',$$SELECT public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,
 (lab.ctx('news_claim')->>'lease_token')::uuid,'{"status":"error","error_code":"RTN_NEWS_FETCH_FAILED"}')$$,'40001');
SET ROLE postgres;
SELECT lab.check('first RSS capture is immutable evidence and bootstrap news is historical',
 (SELECT count(*)=1 FROM rtn_private.news_feed_captures)
 AND(SELECT count(*)=1 AND bool_and(historical AND NOT notifiable AND source_excerpt='' AND own_summary='') FROM rtn_private.update_events WHERE kind='news')
 AND(SELECT count(*)=1 AND bool_and(raw_item_sha256=repeat('b',64)) FROM rtn_private.news_item_evidence));
SELECT lab.check('successful RSS remains partial finite-window coverage with hourly next due',
 (SELECT last_status='partial' AND coverage_kind='finite_rss_window' FROM rtn_private.news_sources WHERE id=1)
 AND(SELECT next_due_at>clock_timestamp()+interval '59 minutes' AND next_due_at<clock_timestamp()+interval '61 minutes' FROM rtn_private.news_runtime));
SELECT lab.denied('stored RSS capture cannot be overwritten',$$UPDATE rtn_private.news_feed_captures SET byte_size=101$$);
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.check('global cooldown returns committed result without a new run',
 public.request_rtn_news_check('11111111-1111-4111-8111-111111111111')->>'run_id'=lab.ctx('queued_news')->>'run_id');
SET ROLE postgres;UPDATE rtn_private.news_runtime SET last_enqueued_at=clock_timestamp()-interval '11 minutes',next_due_at=clock_timestamp()-interval '1 second';
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('news_claim',public.claim_rtn_news_check(NULL));
SELECT lab.keep('same_content',public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,(lab.ctx('news_claim')->>'lease_token')::uuid,lab.ctx('payload_a')));
SELECT lab.check('repeated current content creates no new event',lab.ctx('same_content')->>'status'='unchanged' AND lab.ctx('same_content')->>'unchanged_count'='1');
SET ROLE postgres;UPDATE rtn_private.news_runtime SET last_enqueued_at=clock_timestamp()-interval '11 minutes',next_due_at=clock_timestamp()-interval '1 second';
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('news_claim',public.claim_rtn_news_check(NULL));
SELECT lab.keep('payload_b',jsonb_set(jsonb_set(jsonb_set(jsonb_set(lab.ctx('payload_a'),'{response_sha256}',to_jsonb(repeat('c',64))),
 '{original_path}',to_jsonb('news/rss/'||repeat('c',64)||'.xml')),'{items,0,title}','"Synthetic correction B"'),'{items,0,content_sha256}',to_jsonb(repeat('d',64))));
SELECT lab.keep('correction_b',public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,(lab.ctx('news_claim')->>'lease_token')::uuid,lab.ctx('payload_b')));
SELECT lab.check('actual observed correction creates a fresh notifiable event',lab.ctx('correction_b')->>'correction_count'='1');
SET ROLE postgres;UPDATE rtn_private.news_runtime SET last_enqueued_at=clock_timestamp()-interval '11 minutes',next_due_at=clock_timestamp()-interval '1 second';
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('news_claim',public.claim_rtn_news_check(NULL));
SELECT public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,(lab.ctx('news_claim')->>'lease_token')::uuid,lab.ctx('payload_a'));
SET ROLE postgres;
SELECT lab.check('A to B to A creates three immutable versions with explicit raw evidence',
 (SELECT count(*)=3 AND count(DISTINCT content_sha256)=3 FROM rtn_private.update_events WHERE kind='news')
 AND(SELECT count(*)=2 FROM rtn_private.news_item_evidence WHERE raw_item_sha256=repeat('b',64))
 AND(SELECT count(*)=2 FROM rtn_private.update_events WHERE kind='news' AND previous_event_id IS NOT NULL AND NOT historical AND notifiable)
 AND(SELECT current_raw_item_sha256=repeat('b',64) FROM rtn_private.news_items WHERE canonical_url='https://www.gosnadzor.ru/news/67/100/'));
UPDATE rtn_private.news_runtime SET last_enqueued_at=clock_timestamp()-interval '11 minutes',next_due_at=clock_timestamp()-interval '1 second';
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('news_claim',public.claim_rtn_news_check(NULL));
SELECT public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,(lab.ctx('news_claim')->>'lease_token')::uuid,'{"status":"error","error_code":"RTN_NEWS_HTTP_403"}');
SET ROLE postgres;
SELECT lab.check('403 preserves cached events and last success with24hour blocked backoff',
 (SELECT last_status='blocked' AND last_error_code='RTN_NEWS_HTTP_403' AND last_success_at IS NOT NULL FROM rtn_private.news_sources)
 AND(SELECT next_due_at>clock_timestamp()+interval '23 hours 59 minutes' FROM rtn_private.news_runtime)
 AND(SELECT count(*)=3 FROM rtn_private.update_events WHERE kind='news'));
UPDATE rtn_private.news_runtime SET last_enqueued_at=clock_timestamp()-interval '11 minutes';
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT lab.keep('blocked_manual',public.request_rtn_news_check('11111111-1111-4111-8111-111111111111'));
SELECT lab.check('manual refresh respects provider-blocked backoff rather than probing every10minutes',
 lab.ctx('blocked_manual')->>'status'='error' AND(lab.ctx('blocked_manual')->>'replayed')::boolean
 AND(lab.ctx('blocked_manual')->>'cooldown_until')::timestamptz>clock_timestamp()+interval '23 hours');
SET ROLE postgres;UPDATE rtn_private.news_runtime SET next_due_at=clock_timestamp()-interval '1 second',last_enqueued_at=clock_timestamp()-interval '11 minutes';
UPDATE rtn_private.news_sources SET last_status='partial',last_error_code=NULL;
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('old_lease',public.claim_rtn_news_check(NULL));
SET ROLE postgres;UPDATE rtn_private.news_check_runs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE status='running';
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT lab.keep('recovered_lease',public.claim_rtn_news_check(NULL));
SELECT lab.check('expired lease is recovered with new token and generation',lab.ctx('old_lease')->>'run_id'=lab.ctx('recovered_lease')->>'run_id'
 AND lab.ctx('old_lease')->>'lease_token'<>lab.ctx('recovered_lease')->>'lease_token'
 AND(lab.ctx('old_lease')->>'generation')::bigint<(lab.ctx('recovered_lease')->>'generation')::bigint);
SELECT lab.denied('stale worker cannot complete after lease recovery',$$SELECT public.complete_rtn_news_check((lab.ctx('old_lease')->>'run_id')::uuid,
 (lab.ctx('old_lease')->>'lease_token')::uuid,lab.ctx('payload_a'))$$,'40001');
SELECT public.complete_rtn_news_check((lab.ctx('recovered_lease')->>'run_id')::uuid,(lab.ctx('recovered_lease')->>'lease_token')::uuid,'{"status":"error","error_code":"RTN_NEWS_HTTP_503"}');
SET ROLE postgres;
SELECT lab.check('transient failure uses1hour backoff and never marks source unchanged',
 (SELECT last_status='error' AND last_error_code='RTN_NEWS_HTTP_503' FROM rtn_private.news_sources)
 AND(SELECT next_due_at>clock_timestamp()+interval '59 minutes' AND next_due_at<clock_timestamp()+interval '61 minutes' FROM rtn_private.news_runtime));
-- New original with no bank must not invent a direction; a later normalization
-- creates its own durable intent so the new direction is not skipped.
INSERT INTO rtn_private.sources(id,code,title,page_url,document_url,trusted_anchor_rule,parser)
 VALUES('92000000-0000-4000-8000-000000000002','lab-late-bank','Synthetic late bank source','https://www.gosnadzor.ru/service/list/lab2/',
 'https://www.gosnadzor.ru/upload/lab-b.pdf','a1','industrial-pdf');
INSERT INTO rtn_private.source_revisions(id,source_id,sha256,original_path,media_type,byte_size,document_url)
 VALUES('94000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002',repeat('f',64),'lab/b.pdf','application/pdf',100,'https://www.gosnadzor.ru/upload/lab-b.pdf');
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT lab.keep('no_bank_projection',public.project_rtn_update_intents(1));
SELECT lab.check('source without a bank creates no invented event',lab.ctx('no_bank_projection')->>'processed'='0' AND lab.ctx('no_bank_projection')->>'inserted'='0');
SET ROLE postgres;
INSERT INTO rtn_private.banks(id,source_id,code,title,domain)
 VALUES('93000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002','LAB-B','Synthetic later bank','industrial-safety');
INSERT INTO rtn_private.bank_revisions(id,bank_id,source_revision_id,questions,normalized_sha256,normalization_note,question_count)
 VALUES('95000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000002',
 '[{"id":"q1","number":1,"text":"Synthetic later bank","options":[]}]',repeat('f',64),'Synthetic later normalization for trigger coverage only',1);
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.project_rtn_update_intents(1);
SET ROLE postgres;
SELECT lab.check('later bank normalization produces exact source event without a timestamp sweep',EXISTS(
 SELECT 1 FROM rtn_private.update_events WHERE bank_id='93000000-0000-4000-8000-000000000002' AND source_revision_id='94000000-0000-4000-8000-000000000002'
 AND kind='source_change' AND published_at IS NULL AND effective_from IS NULL AND NOT historical AND notifiable));
SELECT lab.check('old source key release and client business bytes remain unchanged',
 lab.ctx('news_old_facts')=(SELECT jsonb_build_array((SELECT to_jsonb(x) FROM rtn_private.source_revisions x WHERE id='94000000-0000-4000-8000-000000000001'),
 (SELECT to_jsonb(x) FROM rtn_private.bank_revisions x WHERE id='95000000-0000-4000-8000-000000000001'),
 (SELECT to_jsonb(x) FROM rtn_private.key_sets x WHERE id='96000000-0000-4000-8000-000000000001'),
 (SELECT to_jsonb(x) FROM rtn_private.releases x WHERE id='97000000-0000-4000-8000-000000000001')))
 AND lab.ctx('news_old_business')=(SELECT jsonb_build_array((SELECT jsonb_agg(x) FROM public.courses x),
 (SELECT jsonb_agg(x) FROM public.test_attempts x),(SELECT jsonb_agg(x) FROM public.subscription_invoices x))));

INSERT INTO billing_access_private.active_holds VALUES('11111111-1111-4111-8111-111111111111');
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT lab.denied('manual refresh cannot bypass a billing hold even for a cached global run',$$SELECT public.request_rtn_news_check('11111111-1111-4111-8111-111111111111')$$);
SET ROLE postgres;DELETE FROM billing_access_private.active_holds WHERE organization_id='11111111-1111-4111-8111-111111111111';
INSERT INTO public.account_deletion_revocations VALUES('81000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SELECT lab.denied('manual refresh rechecks revocation before a global cache hit',$$SELECT public.request_rtn_news_check('11111111-1111-4111-8111-111111111111')$$);
SET ROLE postgres;DELETE FROM public.account_deletion_revocations WHERE user_id='81000000-0000-4000-8000-000000000001';
UPDATE rtn_private.news_runtime SET last_enqueued_at=clock_timestamp()-interval '11 minutes',next_due_at=clock_timestamp()-interval '1 second';
SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('news_claim',public.claim_rtn_news_check(NULL));
SELECT lab.denied('SQL ingestion independently rejects an external article identity',$$SELECT public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,
 (lab.ctx('news_claim')->>'lease_token')::uuid,jsonb_set(lab.ctx('payload_a'),'{items,0,canonical_url}','"https://attacker.test/news/67/100/"'))$$,'22023');
SELECT lab.denied('SQL ingestion independently rejects HTML in a headline',$$SELECT public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,
 (lab.ctx('news_claim')->>'lease_token')::uuid,jsonb_set(lab.ctx('payload_a'),'{items,0,title}','"<script>bad</script>"'))$$,'22023');
SET ROLE postgres;UPDATE rtn_private.news_check_runs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE status='running';
SET ROLE service_role;
SELECT lab.denied('expired worker cannot complete before a new claimant arrives',$$SELECT public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,
 (lab.ctx('news_claim')->>'lease_token')::uuid,lab.ctx('payload_a'))$$,'40001');
SELECT public.claim_rtn_news_check(NULL);
SET ROLE postgres;UPDATE rtn_private.news_check_runs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE status='running';
SET ROLE service_role;SELECT public.claim_rtn_news_check(NULL);
SET ROLE postgres;UPDATE rtn_private.news_check_runs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE status='running';
SET ROLE service_role;
SELECT lab.check('three exhausted claims close the durable run without another fetch lease',public.claim_rtn_news_check(NULL) IS NULL);
SET ROLE postgres;
SELECT lab.check('lease exhaustion is an explicit error rather than unchanged success',EXISTS(SELECT 1 FROM rtn_private.news_check_runs
 WHERE id=(lab.ctx('news_claim')->>'run_id')::uuid AND status='error' AND error_code='RTN_NEWS_LEASE_EXHAUSTED' AND attempt_count=3));
UPDATE rtn_private.news_runtime SET last_enqueued_at=clock_timestamp()-interval '11 minutes',next_due_at=clock_timestamp()-interval '1 second';
SET ROLE service_role;SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('news_claim',public.claim_rtn_news_check(NULL));
SELECT public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,(lab.ctx('news_claim')->>'lease_token')::uuid,jsonb_set(lab.ctx('payload_a'),'{items}','[]'));
SET ROLE postgres;
SELECT lab.check('empty successful RSS never deletes cached history or resets the bootstrap boundary',
 (SELECT count(*)=3 FROM rtn_private.update_events WHERE kind='news') AND(SELECT bootstrap_completed_at IS NOT NULL FROM rtn_private.news_runtime)
 AND(SELECT last_status='partial' AND coverage_kind='finite_rss_window' AND coverage_from IS NULL AND coverage_until IS NULL FROM rtn_private.news_sources));

INSERT INTO rtn_private.key_sets(id,bank_id,bank_revision_id,questions,display_title,source_generation,review_note,reviewed_by)
 VALUES('96000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000002','[]',
 'Synthetic new key reference',1,'Synthetic reference only; no graded training acceptance','81000000-0000-4000-8000-000000000999');
INSERT INTO rtn_private.releases(id,bank_id,key_set_id,effective_from,release_note,published_by,published_at)
 VALUES('97000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000002',
 '2026-11-20','Synthetic fresh release reference for queue coverage','81000000-0000-4000-8000-000000000999','2026-11-20T11:00:00Z');
SET ROLE service_role;SELECT public.project_rtn_update_intents(1);
SELECT lab.denied('projection batch size remains bounded',$$SELECT public.project_rtn_update_intents(51)$$,'22023');
SET ROLE postgres;
SELECT lab.check('fresh release intent uses actual publication and effective dates with no key payload',EXISTS(
 SELECT 1 FROM rtn_private.update_events e JOIN rtn_private.releases r ON r.id=e.release_id
 WHERE r.id='97000000-0000-4000-8000-000000000002' AND e.kind='bank_release' AND e.published_at=r.published_at
 AND e.effective_from=r.effective_from AND e.notifiable AND NOT e.historical)
 AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(rtn_private.update_event_payload((SELECT e FROM rtn_private.update_events e WHERE release_id='97000000-0000-4000-8000-000000000002'))) k
 WHERE k IN('key_set_id','questions','answers','materials','original_path')));
INSERT INTO rtn_private.banks(id,source_id,code,title,domain)
 VALUES('93000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002','LAB-C','Synthetic next direction','industrial-safety');
INSERT INTO rtn_private.source_revisions(id,source_id,sha256,original_path,media_type,byte_size,document_url)
 VALUES('94000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002',repeat('1',64),'lab/b2.pdf','application/pdf',100,'https://www.gosnadzor.ru/upload/lab-b.pdf');
SET ROLE service_role;
SELECT lab.keep('projection_first',public.project_rtn_update_intents(1));
SELECT lab.check('a large source projection retains an explicit remaining cursor',lab.ctx('projection_first')->>'processed'='1' AND(lab.ctx('projection_first')->>'has_more')::boolean);
SELECT lab.keep('projection_second',public.project_rtn_update_intents(1));
SELECT lab.check('next bounded projection finishes remaining bank subjects without truncation',lab.ctx('projection_second')->>'processed'='1' AND NOT(lab.ctx('projection_second')->>'has_more')::boolean);
SET ROLE postgres;
UPDATE rtn_private.news_runtime SET last_enqueued_at=clock_timestamp()-interval '11 minutes',next_due_at=clock_timestamp()-interval '1 second';
SET ROLE service_role;
SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('news_claim',public.claim_rtn_news_check(NULL));
SELECT lab.keep('reverse_order_payload',jsonb_build_object('status','success','response_sha256',repeat('2',64),'byte_size',100,
 'original_path','news/rss/'||repeat('2',64)||'.xml','resolved_feed_url','https://www.gosnadzor.ru/news/rss/',
 'items',jsonb_build_array(
  jsonb_build_object('canonical_url','https://www.gosnadzor.ru/news/67/201/','title','Newest headline first in RSS',
   'published_at',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'content_sha256',repeat('3',64)),
  jsonb_build_object('canonical_url','https://www.gosnadzor.ru/news/67/200/','title','Older headline last in RSS',
   'published_at',to_char((clock_timestamp()-interval '1 minute') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'content_sha256',repeat('4',64)))));
SELECT public.complete_rtn_news_check((lab.ctx('news_claim')->>'run_id')::uuid,(lab.ctx('news_claim')->>'lease_token')::uuid,lab.ctx('reverse_order_payload'));
SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT lab.check('newest RSS headline wins homepage sequence despite newest-first input array',
 public.get_rtn_update_summary('11111111-1111-4111-8111-111111111111')#>>'{latest_event,canonical_url}'='https://www.gosnadzor.ru/news/67/201/');
SET ROLE postgres;
