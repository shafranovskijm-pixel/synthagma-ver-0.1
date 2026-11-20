-- Only new archive cases. Released1300–1600 acceptance suites are not run.
SET ROLE postgres;
CREATE FUNCTION lab.archive_assert(ok boolean)RETURNS void LANGUAGE plpgsql AS $f$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ARCHIVE_LAB_ASSERTION_FAILED';END IF;END;$f$;
CREATE FUNCTION lab.archive_case(name text,sql text)RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
 BEGIN EXECUTE sql;RAISE EXCEPTION 'ARCHIVE_LAB_SCENARIO_ROLLBACK' USING ERRCODE='ZA17Q';
 EXCEPTION WHEN SQLSTATE'ZA17Q'THEN IF SQLERRM<>'ARCHIVE_LAB_SCENARIO_ROLLBACK'THEN RAISE;END IF;END;
 PERFORM lab.check(name,true);
END;$f$;
CREATE FUNCTION lab.archive_item(n integer,raw text DEFAULT'b')RETURNS jsonb LANGUAGE sql AS $f$
 SELECT jsonb_build_object('canonical_url','https://www.gosnadzor.ru/news/67/'||n||'/','title','Synthetic headline '||n,
  'published_at',lab.ctx('archive_prior_feed')#>>'{items,0,published_at}','content_sha256',repeat(raw,64))
$f$;
CREATE FUNCTION lab.archive_rss(items jsonb,hash text DEFAULT'c')RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE claim jsonb;payload jsonb;result jsonb;BEGIN
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 UPDATE rtn_private.news_runtime SET last_enqueued_at=clock_timestamp()-interval'11 minutes',next_due_at=clock_timestamp()-interval'1 second'WHERE source_id=1;
 PERFORM public.enqueue_due_rtn_news_check();claim:=public.claim_rtn_news_check_v2(NULL);PERFORM lab.archive_assert(claim IS NOT NULL);
 PERFORM public.authorize_rtn_news_rss_get((claim->>'run_id')::uuid,(claim->>'lease_token')::uuid,(claim->>'generation')::bigint,0);
 payload:=jsonb_build_object('status','success','response_sha256',repeat(hash,64),'byte_size',100,'original_path','news/rss/'||repeat(hash,64)||'.xml',
  'resolved_feed_url','https://www.gosnadzor.ru/news/rss/','items',items);
 result:=public.complete_rtn_news_check((claim->>'run_id')::uuid,(claim->>'lease_token')::uuid,payload);
 RETURN jsonb_build_object('claim',claim,'payload',payload,'result',result);
END;$f$;
CREATE FUNCTION lab.archive_anchor(rss jsonb)RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE items jsonb;BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('canonical_url',x->>'canonical_url','published_at',x->>'published_at','raw_item_sha256',x->>'content_sha256')),'[]'::jsonb)
  INTO items FROM jsonb_array_elements(rss#>'{payload,items}')x;
 RETURN public.record_rtn_news_archive_anchor((rss#>>'{claim,run_id}')::uuid,jsonb_build_object('status','success','parser_format','rtn-rss-anchor-v1',
  'response_sha256',rss#>>'{payload,response_sha256}','byte_size',100,'items',items));
END;$f$;
CREATE FUNCTION lab.archive_enable()RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE rss jsonb;BEGIN
 rss:=lab.archive_rss(lab.ctx('archive_prior_feed')->'items','d');PERFORM lab.archive_anchor(rss);
 IF(SELECT activation_state FROM rtn_private.news_archive_runtime)='off'THEN
  PERFORM rtn_private.activate_news_archive((rss#>>'{claim,run_id}')::uuid,repeat('f',64));
 END IF;RETURN rss;
END;$f$;
CREATE FUNCTION lab.archive_gap()RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE rss jsonb;BEGIN
 PERFORM lab.archive_enable();rss:=lab.archive_rss(jsonb_build_array(lab.archive_item(200,'e')),'e');PERFORM lab.archive_anchor(rss);
 RETURN public.claim_rtn_news_archive_gap();
END;$f$;
CREATE FUNCTION lab.archive_page(grant_data jsonb,n integer DEFAULT 300,include_anchor boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE request jsonb;day text;items jsonb;page jsonb;number integer;BEGIN
 request:=coalesce(grant_data->'request',grant_data);number:=(request->>'page_number')::integer;
 SELECT target_from_date::text INTO day FROM rtn_private.news_archive_gaps WHERE id=(SELECT gap_id FROM rtn_private.news_archive_requests WHERE id=(request->>'request_id')::uuid);
 items:=jsonb_build_array(jsonb_build_object('canonical_url','https://www.gosnadzor.ru/news/67/'||n||'/','title','Archive synthetic '||n,
  'source_date',day,'source_date_literal',to_char(day::date,'DD.MM.YYYY'),'date_precision','day','ordinal',1));
 IF include_anchor THEN items:=items||jsonb_build_array(jsonb_build_object('canonical_url','https://www.gosnadzor.ru/news/67/100/','title','Synthetic prior headline',
  'source_date',day,'source_date_literal',to_char(day::date,'DD.MM.YYYY'),'date_precision','day','ordinal',2));END IF;
 page:=jsonb_build_object('adapter_version','rtn-news-archive-v1','page_url',request->>'page_url','page_number',number,'response_sha256',md5(n::text)||md5(n::text),
  'response_bytes',100,'items',items,'next_page_url',CASE WHEN number<10 THEN rtn_private.archive_url(number+1)END,'pagination_state',CASE WHEN number=10 THEN'page_cap'ELSE'adjacent'END,
  'oldest_source_date',day,'newest_source_date',day,'date_precision','day','complete_archive',false,'exact_publication_times_known',false);
 RETURN jsonb_build_object('status','success','page',page,'original_path','news/archive/'||(page->>'response_sha256')||'.html',
  'resolved_url',request->>'page_url','content_type','text/html; charset=utf-8','decoded_encoding','utf-8','body_bytes_seen',100,'yield_after',false);
END;$f$;
CREATE FUNCTION lab.archive_complete(claim jsonb,payload jsonb)RETURNS jsonb LANGUAGE sql AS $f$
 SELECT public.complete_rtn_news_archive_request((claim#>>'{request,request_id}')::uuid,(claim->>'lease_token')::uuid,(claim->>'generation')::bigint,payload)
$f$;
CREATE FUNCTION lab.archive_next(claim jsonb)RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE response jsonb;BEGIN
 response:=public.authorize_rtn_news_archive_request((claim->>'gap_id')::uuid,(claim->>'lease_token')::uuid,(claim->>'generation')::bigint);
 PERFORM lab.archive_assert(response->>'status'='granted');RETURN jsonb_set(claim,'{request}',response->'request');
END;$f$;

SELECT lab.check('migration creates exactly seven restricted global tables and archive OFF',
 (SELECT count(*)=7 AND bool_and(c.relrowsecurity AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='rtn_private'AND c.relname IN('news_archive_runtime','news_rss_anchor_observations','news_archive_gaps','news_publisher_lease_epochs','news_archive_requests','news_archive_captures','news_archive_candidates'))
 AND(SELECT activation_state='off'FROM rtn_private.news_archive_runtime));
SELECT lab.check('migration changes only four allowed old bodies and preserves all old metadata',NOT EXISTS(
 SELECT 1 FROM jsonb_array_elements(lab.ctx('archive_old_procs'))old LEFT JOIN pg_proc p ON p.oid=(old->>'oid')::oid
 WHERE p.oid IS NULL OR to_jsonb(p)-'prosrc'IS DISTINCT FROM old-'prosrc'OR(p.prosrc IS DISTINCT FROM old->>'prosrc'
 AND p.oid NOT IN('rtn_private.enqueue_news_check(text)'::regprocedure,'public.claim_rtn_news_check(uuid)'::regprocedure,
 'public.complete_rtn_news_check(uuid,uuid,jsonb)'::regprocedure,'rtn_private.news_run_receipt(rtn_private.news_check_runs,boolean)'::regprocedure))));
SELECT lab.check('migration preserves old RSS rows and item event lineage including a live legacy lease',
 lab.ctx('archive_old_runs')=(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.news_check_runs r)
 AND lab.ctx('archive_old_events')=(SELECT jsonb_agg(to_jsonb(r)ORDER BY id)FROM rtn_private.update_events r)
 AND lab.ctx('archive_old_items')=(SELECT jsonb_agg(to_jsonb(r)ORDER BY canonical_url)FROM rtn_private.news_items r));
SELECT lab.check('new v2 service authority and two readonly scoped readers are separated',
 has_function_privilege('service_role','public.claim_rtn_news_check_v2(uuid)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.claim_rtn_news_archive_gap()','EXECUTE')
 AND NOT has_function_privilege('service_role','rtn_private.activate_news_archive(uuid,text)','EXECUTE')
 AND has_function_privilege('authenticated','public.list_rtn_news_archive_candidates(uuid,integer,text)','EXECUTE')
 AND NOT has_function_privilege('anon','public.get_rtn_news_archive_state(uuid)','EXECUTE'));
SELECT lab.check('archive tables carry no personal actor organization or recipient attribution',NOT EXISTS(SELECT 1 FROM information_schema.columns
 WHERE table_schema='rtn_private'AND table_name LIKE'news_archive_%'AND column_name IN('user_id','actor_id','organization_id','requested_by','recipient_id')));
SELECT lab.check('archive remains network-ineligible before owner activation',public.claim_rtn_news_archive_gap()IS NULL);
SELECT lab.keep('archive_legacy_result',public.complete_rtn_news_check((lab.ctx('archive_legacy_claim')->>'run_id')::uuid,(lab.ctx('archive_legacy_claim')->>'lease_token')::uuid,lab.ctx('archive_prior_feed')));
SELECT lab.check('old in-flight legacy completion remains compatible while archive OFF',lab.ctx('archive_legacy_result')->>'status'='unchanged');
SELECT lab.check('old terminal legacy completion replay remains readonly',
 (public.complete_rtn_news_check((lab.ctx('archive_legacy_claim')->>'run_id')::uuid,(lab.ctx('archive_legacy_claim')->>'lease_token')::uuid,lab.ctx('archive_prior_feed'))->>'replayed')::boolean);
SELECT lab.keep('archive_base',jsonb_build_object('claim',lab.ctx('archive_legacy_claim'),'payload',lab.ctx('archive_prior_feed')));
SELECT lab.check('first usable stored RSS input creates only an anchor baseline and no historical crawl',lab.archive_anchor(lab.ctx('archive_base'))->>'status'='baseline'AND NOT EXISTS(SELECT 1 FROM rtn_private.news_archive_gaps));
SELECT lab.check('same committed anchor replays its stored classification without creating gaps',lab.archive_anchor(lab.ctx('archive_base'))='{"status":"baseline","replayed":true,"gap_created":false}'::jsonb);

SELECT lab.archive_case('unchanged new capture uses older immutable per-item evidence without inventing rows',$s$
 SELECT lab.keep('r',lab.archive_rss(lab.ctx('archive_prior_feed')->'items','c'));
 SELECT lab.archive_assert(lab.archive_anchor(lab.ctx('r'))->>'status'='overlap');
 SELECT lab.archive_assert(NOT EXISTS(SELECT 1 FROM rtn_private.news_item_evidence WHERE response_sha256=repeat('c',64)));
$s$);
SELECT lab.archive_case('mixed changed and unchanged capture records the complete anchor set',$s$
 SELECT lab.keep('r',lab.archive_rss((lab.ctx('archive_prior_feed')->'items')||jsonb_build_array(lab.archive_item(201,'c')),'c'));
 SELECT lab.archive_assert(lab.archive_anchor(lab.ctx('r'))->>'status'='overlap');
 SELECT lab.archive_assert((SELECT jsonb_array_length(items)=2 FROM rtn_private.news_rss_anchor_observations WHERE rss_run_id=(lab.ctx('r')#>>'{claim,run_id}')::uuid));
$s$);
SELECT lab.archive_case('disjoint RSS transition creates one durable potential gap after baseline',$s$
 SELECT lab.keep('r',lab.archive_rss(jsonb_build_array(lab.archive_item(202,'e')),'e'));
 SELECT lab.archive_assert(lab.archive_anchor(lab.ctx('r'))->>'status'='potential_gap');
 SELECT lab.archive_assert((SELECT count(*)=1 FROM rtn_private.news_archive_gaps));
$s$);

SELECT lab.archive_case('future anchor input cannot skip its predecessor or poison the probe cursor',$s$
 SELECT lab.keep('first',lab.archive_rss(jsonb_build_array(lab.archive_item(201,'c')),'c'));
 SELECT lab.keep('later',lab.archive_rss(jsonb_build_array(lab.archive_item(202,'e')),'e'));
 SELECT lab.denied('future anchor denied',$q$SELECT lab.archive_anchor(lab.ctx('later'))$q$,'40001');
 SELECT lab.denied('future error denied',$q$SELECT public.record_rtn_news_archive_anchor((lab.ctx('later')#>>'{claim,run_id}')::uuid,'{"status":"error","error_code":"RTN_ARCHIVE_ORIGINAL_READ_FAILED"}')$q$,'40001');
 SELECT lab.archive_assert((SELECT anchor_probe_failures=0 FROM rtn_private.news_archive_runtime));
 SELECT lab.archive_assert(lab.archive_anchor(lab.ctx('first'))->>'status'='potential_gap');
$s$);
SELECT lab.archive_case('stale probe error against a committed success is readonly and cannot charge failures',$s$
 SELECT lab.keep('r',lab.archive_rss(lab.ctx('archive_prior_feed')->'items','c'));SELECT lab.archive_anchor(lab.ctx('r'));
 SELECT lab.denied('old error denied',$q$SELECT public.record_rtn_news_archive_anchor((lab.ctx('r')#>>'{claim,run_id}')::uuid,'{"status":"error","error_code":"RTN_ARCHIVE_ORIGINAL_PARSE_FAILED"}')$q$,'40001');
 SELECT lab.archive_assert((SELECT anchor_probe_failures=0 FROM rtn_private.news_archive_runtime));
$s$);
SELECT lab.archive_case('empty successful capture advances processed cursor without replacing usable anchor',$s$
 SELECT lab.keep('r',lab.archive_rss('[]','c'));SELECT lab.archive_assert(lab.archive_anchor(lab.ctx('r'))->>'status'='empty');
 SELECT lab.archive_assert((SELECT last_processed_rss_run_id=(lab.ctx('r')#>>'{claim,run_id}')::uuid AND last_usable_anchor_run_id=(lab.ctx('archive_base')#>>'{claim,run_id}')::uuid FROM rtn_private.news_archive_runtime));
$s$);
SELECT lab.archive_case('private original probe failure leaves the completed RSS outcome and cursor intact',$s$
 SELECT lab.keep('r',lab.archive_rss(lab.ctx('archive_prior_feed')->'items','c'));
 SELECT lab.keep('before_run',(SELECT to_jsonb(r)FROM rtn_private.news_check_runs r WHERE id=(lab.ctx('r')#>>'{claim,run_id}')::uuid));
 SELECT public.record_rtn_news_archive_anchor((lab.ctx('r')#>>'{claim,run_id}')::uuid,'{"status":"error","error_code":"RTN_ARCHIVE_ORIGINAL_HASH_CONFLICT"}');
 SELECT lab.archive_assert(lab.ctx('before_run')=(SELECT to_jsonb(r)FROM rtn_private.news_check_runs r WHERE id=(lab.ctx('r')#>>'{claim,run_id}')::uuid));
 SELECT lab.archive_assert((SELECT last_processed_rss_run_id=(lab.ctx('archive_base')#>>'{claim,run_id}')::uuid AND anchor_probe_failures=1 FROM rtn_private.news_archive_runtime));
$s$);
SELECT lab.archive_case('new lost overlap never resets an unresolved gap or its oldest boundary',$s$
 SELECT lab.keep('r',lab.archive_rss(jsonb_build_array(lab.archive_item(201,'c')),'c'));SELECT lab.archive_anchor(lab.ctx('r'));
 SELECT lab.keep('gap_before',(SELECT to_jsonb(g)FROM rtn_private.news_archive_gaps g));
 SELECT lab.keep('later',lab.archive_rss(jsonb_build_array(lab.archive_item(202,'e')),'e'));SELECT lab.archive_anchor(lab.ctx('later'));
 SELECT lab.archive_assert((SELECT count(*)=1 AND bool_and(status='needs_review'AND stop_reason='later_gap'AND from_anchor_run_id::text=lab.ctx('gap_before')->>'from_anchor_run_id'
  AND target_from_date::text=lab.ctx('gap_before')->>'target_from_date'AND campaign_get_reserved=0)FROM rtn_private.news_archive_gaps));
$s$);
SELECT lab.archive_case('owner activation rejects a legacy-only success without v2 GET proof',$s$
 SELECT lab.denied('legacy no activation',$q$SELECT rtn_private.activate_news_archive((lab.ctx('archive_base')#>>'{claim,run_id}')::uuid,repeat('f',64))$q$,'40001');
 SELECT lab.archive_assert((SELECT activation_state='off'FROM rtn_private.news_archive_runtime));
$s$);
SELECT lab.archive_case('genuine-shaped v2 GET and success enable owner activation while old claim grants no new work',$s$
 SELECT lab.archive_enable();
 UPDATE rtn_private.news_runtime SET next_due_at=clock_timestamp()-interval'1 second',last_enqueued_at=clock_timestamp()-interval'11 minutes';
 SELECT public.enqueue_due_rtn_news_check();SELECT lab.archive_assert(public.claim_rtn_news_check(NULL)IS NULL);
 SELECT lab.archive_assert(public.claim_rtn_news_check_v2(NULL)IS NOT NULL);
$s$);
SELECT lab.archive_case('duplicate RSS expected GET ordinal is rejected rather than issuing another grant',$s$
 UPDATE rtn_private.news_runtime SET next_due_at=clock_timestamp()-interval'1 second',last_enqueued_at=clock_timestamp()-interval'11 minutes';
 SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('claim',public.claim_rtn_news_check_v2(NULL));
 SELECT public.authorize_rtn_news_rss_get((lab.ctx('claim')->>'run_id')::uuid,(lab.ctx('claim')->>'lease_token')::uuid,(lab.ctx('claim')->>'generation')::bigint,0);
 SELECT lab.denied('same ordinal denied',$q$SELECT public.authorize_rtn_news_rss_get((lab.ctx('claim')->>'run_id')::uuid,(lab.ctx('claim')->>'lease_token')::uuid,(lab.ctx('claim')->>'generation')::bigint,0)$q$,'40001');
 SELECT lab.archive_assert((SELECT rss_get_grants=1 FROM rtn_private.news_publisher_lease_epochs WHERE work_id=(lab.ctx('claim')->>'run_id')::uuid));
$s$);
SELECT lab.archive_case('v2 completion without a genuine server GET grant is refused',$s$
 UPDATE rtn_private.news_runtime SET next_due_at=clock_timestamp()-interval'1 second',last_enqueued_at=clock_timestamp()-interval'11 minutes';
 SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('claim',public.claim_rtn_news_check_v2(NULL));
 SELECT lab.denied('unpermitted completion denied',$q$SELECT public.complete_rtn_news_check((lab.ctx('claim')->>'run_id')::uuid,(lab.ctx('claim')->>'lease_token')::uuid,lab.ctx('archive_prior_feed'))$q$,'40001');
$s$);
SELECT lab.archive_case('first archive claim reserves one full potential MiB before any result',$s$
 SELECT lab.keep('claim',lab.archive_gap());
 SELECT lab.archive_assert(lab.ctx('claim')#>>'{request,page_url}'='https://www.gosnadzor.ru/news/');
 SELECT lab.archive_assert((SELECT campaign_get_reserved=1 AND campaign_bytes_reserved=1048576 AND invocation_get_reserved=1 FROM rtn_private.news_archive_gaps));
 SELECT lab.denied('second outstanding grant denied',$q$SELECT public.authorize_rtn_news_archive_request((lab.ctx('claim')->>'gap_id')::uuid,(lab.ctx('claim')->>'lease_token')::uuid,(lab.ctx('claim')->>'generation')::bigint)$q$,'40001');
$s$);
SELECT lab.archive_case('archive HTML creates date-only candidates and never touches shared events or RSS lineage',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.keep('events_before',(SELECT jsonb_agg(to_jsonb(e)ORDER BY id)FROM rtn_private.update_events e));
 SELECT lab.keep('items_before',(SELECT jsonb_agg(to_jsonb(e)ORDER BY canonical_url)FROM rtn_private.news_items e));
 SELECT lab.keep('receipt',lab.archive_complete(lab.ctx('claim'),lab.archive_page(lab.ctx('claim'),300,true)));
 SELECT lab.archive_assert((SELECT count(*)=2 AND bool_and(date_precision='day'AND source_timezone IS NULL)FROM rtn_private.news_archive_candidates));
 SELECT lab.archive_assert(lab.ctx('events_before')=(SELECT jsonb_agg(to_jsonb(e)ORDER BY id)FROM rtn_private.update_events e));
 SELECT lab.archive_assert(lab.ctx('items_before')=(SELECT jsonb_agg(to_jsonb(e)ORDER BY canonical_url)FROM rtn_private.news_items e));
 SELECT lab.archive_assert(NOT EXISTS(SELECT 1 FROM rtn_private.personal_deliveries));
$s$);
SELECT lab.archive_case('same archive completion is readonly replay and conflicting payload cannot rewrite evidence',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.keep('page',lab.archive_page(lab.ctx('claim'),300,true));SELECT lab.archive_complete(lab.ctx('claim'),lab.ctx('page'));
 SELECT lab.archive_assert((lab.archive_complete(lab.ctx('claim'),lab.ctx('page'))->>'replayed')::boolean);
 SELECT lab.denied('archive replay conflict',$q$SELECT lab.archive_complete(lab.ctx('claim'),jsonb_set(lab.ctx('page'),'{page,items,0,title}','"Changed"'))$q$,'40001');
 SELECT lab.archive_assert((SELECT count(*)=1 FROM rtn_private.news_archive_captures));
$s$);
SELECT lab.archive_case('archive-first URL stays historical on its later genuine fresh-timestamp RSS appearance',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.archive_complete(lab.ctx('claim'),jsonb_set(lab.archive_page(lab.ctx('claim'),300),'{yield_after}','true'));
 SELECT lab.keep('fresh_item',jsonb_set(lab.archive_item(300,'f'),'{published_at}',to_jsonb(to_char(clock_timestamp()AT TIME ZONE'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))));
 SELECT lab.archive_rss(jsonb_build_array(lab.ctx('fresh_item')),'f');
 SELECT lab.archive_assert((SELECT historical AND NOT notifiable FROM rtn_private.update_events WHERE canonical_url='https://www.gosnadzor.ru/news/67/300/'));
 SELECT lab.archive_assert((SELECT archive_first FROM rtn_private.news_archive_candidates WHERE canonical_url='https://www.gosnadzor.ru/news/67/300/'));
$s$);
SELECT lab.archive_case('archive rejects mixed timestamp or event fields atomically',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.keep('page',lab.archive_page(lab.ctx('claim'))||'{"event_id":"11111111-1111-4111-8111-111111111111"}');
 SELECT lab.denied('no event admission',$q$SELECT lab.archive_complete(lab.ctx('claim'),lab.ctx('page'))$q$,'22023');
 SELECT lab.denied('no timestamp admission',$q$SELECT lab.archive_complete(lab.ctx('claim'),jsonb_set(lab.archive_page(lab.ctx('claim')),'{page,items,0,published_at}','"2026-11-20T00:00:00Z"'))$q$,'22023');
 SELECT lab.archive_assert(NOT EXISTS(SELECT 1 FROM rtn_private.news_archive_candidates)AND NOT EXISTS(SELECT 1 FROM rtn_private.news_archive_captures));
$s$);
SELECT lab.archive_case('official archive403 extends shared24h block without rewriting completed RSS success',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.keep('rss_last',(SELECT to_jsonb(r)FROM rtn_private.news_check_runs r WHERE status IN('changed','unchanged')ORDER BY completed_at DESC LIMIT 1));
 SELECT lab.keep('success_before',to_jsonb((SELECT last_success_at FROM rtn_private.news_sources)));
 SELECT lab.archive_complete(lab.ctx('claim'),'{"status":"error","error_code":"RTN_ARCHIVE_HTTP_403","body_bytes_seen":0,"byte_limit_exceeded":false}');
 SELECT lab.archive_assert((SELECT publisher_blocked_until>clock_timestamp()+interval'23 hours'AND next_due_at>=publisher_blocked_until FROM rtn_private.news_runtime));
 SELECT lab.archive_assert(lab.ctx('success_before')=to_jsonb((SELECT last_success_at FROM rtn_private.news_sources)));
 SELECT lab.archive_assert(lab.ctx('rss_last')=(SELECT to_jsonb(r)FROM rtn_private.news_check_runs r WHERE id=(lab.ctx('rss_last')->>'id')::uuid));
 SELECT lab.archive_assert(public.claim_rtn_news_archive_gap()IS NULL);
$s$);
SELECT lab.archive_case('expired publisher block exposes manual10minute cooldown despite future scheduled due',$s$
 UPDATE rtn_private.news_runtime SET publisher_blocked_until=clock_timestamp()-interval'1 second',next_due_at=clock_timestamp()+interval'1 hour',last_enqueued_at=clock_timestamp()-interval'11 minutes';
 UPDATE rtn_private.news_sources SET last_status='blocked',last_error_code='RTN_NEWS_HTTP_403';
 SELECT lab.archive_assert((SELECT(rtn_private.news_run_receipt(r)->>'cooldown_until')::timestamptz<clock_timestamp()FROM rtn_private.news_check_runs r ORDER BY queued_at DESC LIMIT 1));
 UPDATE rtn_private.rollout_state SET stage='paid';
 SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',true);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
 SELECT lab.keep('manual',public.request_rtn_news_check('11111111-1111-4111-8111-111111111111'));
 SET LOCAL ROLE postgres;SELECT set_config('request.jwt.claim.role','service_role',true);
 SELECT lab.archive_assert(public.claim_rtn_news_check_v2((lab.ctx('manual')->>'run_id')::uuid)IS NOT NULL);
$s$);
SELECT lab.archive_case('active publisher block still dominates manual cooldown and archive probing',$s$
 UPDATE rtn_private.news_runtime SET publisher_blocked_until=clock_timestamp()+interval'24 hours',last_enqueued_at=clock_timestamp()-interval'11 minutes';
 SELECT lab.archive_assert((SELECT(rtn_private.news_run_receipt(r)->>'cooldown_until')::timestamptz>clock_timestamp()+interval'23 hours'FROM rtn_private.news_check_runs r ORDER BY queued_at DESC LIMIT 1));
 SELECT lab.archive_assert(public.claim_rtn_news_check_v2(NULL)IS NULL AND public.claim_rtn_news_archive_gap()IS NULL);
$s$);
SELECT lab.archive_case('partial stream error consumes full pre-reserved cost and never advances checkpoint',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.archive_complete(lab.ctx('claim'),'{"status":"error","error_code":"RTN_ARCHIVE_BODY_SIZE_INVALID","body_bytes_seen":1048577,"byte_limit_exceeded":true}');
 SELECT lab.archive_assert((SELECT campaign_get_reserved=1 AND campaign_bytes_reserved=1048576 AND unique_pages=0 AND candidate_count=0 AND status='queued'FROM rtn_private.news_archive_gaps));
 SELECT lab.archive_assert(NOT EXISTS(SELECT 1 FROM rtn_private.news_archive_candidates));
$s$);
SELECT lab.archive_case('private persistence may settle after public20s but still inside invocation70s',$s$
 SELECT lab.keep('claim',lab.archive_gap());
 -- Synthetic control-time seed only. The next test separately proves the
 -- ordinary immutable guard rejects this without an explicit fixture bypass.
 ALTER TABLE rtn_private.news_archive_requests DISABLE TRIGGER archive_columns;
 UPDATE rtn_private.news_archive_requests SET deadline_at=clock_timestamp()-interval'1 second';
 ALTER TABLE rtn_private.news_archive_requests ENABLE TRIGGER archive_columns;
 SELECT lab.archive_assert((SELECT deadline_at<clock_timestamp()FROM rtn_private.news_archive_requests));
 SELECT lab.archive_complete(lab.ctx('claim'),lab.archive_page(lab.ctx('claim'),300,true));
 SELECT lab.archive_assert((SELECT unique_pages=1 FROM rtn_private.news_archive_gaps));
$s$);
SELECT lab.archive_case('readonly candidate list preserves day precision and never exposes private service metadata',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.archive_complete(lab.ctx('claim'),lab.archive_page(lab.ctx('claim'),300,true));
 UPDATE rtn_private.rollout_state SET stage='paid';SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.role','authenticated',true);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
 SELECT lab.keep('list',public.list_rtn_news_archive_candidates('11111111-1111-4111-8111-111111111111',1,NULL));
 SELECT lab.archive_assert(lab.ctx('list')->>'has_more'='true'AND jsonb_array_length(lab.ctx('list')->'items')=1 AND lab.ctx('list')->>'next_cursor'IS NOT NULL);
 SELECT lab.archive_assert((lab.ctx('list')::text)!~'original_path|response_sha256|lease_token|request_id|published_at');
 SELECT lab.keep('next',public.list_rtn_news_archive_candidates('11111111-1111-4111-8111-111111111111',1,lab.ctx('list')->>'next_cursor'));
 SELECT lab.archive_assert(lab.ctx('next')#>>'{items,0,canonical_url}'<>lab.ctx('list')#>>'{items,0,canonical_url}'AND lab.ctx('next')->>'has_more'='false');
$s$);
SELECT lab.archive_case('foreign and blocked actors cannot use archive readonly readers',$s$
 UPDATE rtn_private.rollout_state SET stage='paid';SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.role','authenticated',true);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
 SELECT lab.denied('foreign state denied',$q$SELECT public.get_rtn_news_archive_state('22222222-2222-4222-8222-222222222222')$q$);
 SET LOCAL ROLE postgres;UPDATE public.profiles SET blocked_at=clock_timestamp()WHERE user_id='81000000-0000-4000-8000-000000000001';SET LOCAL ROLE authenticated;
 SELECT lab.denied('blocked candidate list denied',$q$SELECT public.list_rtn_news_archive_candidates('11111111-1111-4111-8111-111111111111',20,NULL)$q$);
$s$);
SELECT lab.archive_case('list rejects malformed cursor and limits without starting work',$s$
 UPDATE rtn_private.rollout_state SET stage='paid';SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.role','authenticated',true);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
 SELECT lab.denied('bad cursor denied',$q$SELECT public.list_rtn_news_archive_candidates('11111111-1111-4111-8111-111111111111',20,'not-json')$q$,'22023');
 SELECT lab.denied('bad limit denied',$q$SELECT public.list_rtn_news_archive_candidates('11111111-1111-4111-8111-111111111111',21,NULL)$q$,'22023');
$s$);

SELECT lab.archive_case('historical original remains anchor-valid after a later RSS correction and revert',$s$
 SELECT lab.keep('old',lab.archive_rss(lab.ctx('archive_prior_feed')->'items','c'));
 SELECT lab.keep('changed',lab.archive_rss(jsonb_build_array(lab.archive_item(100,'d')),'d'));
 SELECT lab.keep('revert',lab.archive_rss(lab.ctx('archive_prior_feed')->'items','e'));
 SELECT lab.archive_assert(lab.archive_anchor(lab.ctx('old'))->>'status'='overlap');
 SELECT lab.archive_assert(lab.archive_anchor(lab.ctx('changed'))->>'status'='overlap');
 SELECT lab.archive_assert(lab.archive_anchor(lab.ctx('revert'))->>'status'='overlap');
 SELECT lab.archive_assert((SELECT count(*)=3 FROM rtn_private.news_item_evidence));
$s$);
SELECT lab.archive_case('conflicting committed anchor payload fails readonly instead of changing classification',$s$
 SELECT lab.keep('r',jsonb_set(lab.ctx('archive_base'),'{payload,response_sha256}',to_jsonb(repeat('f',64))));
 SELECT lab.denied('anchor conflict',$q$SELECT lab.archive_anchor(lab.ctx('r'))$q$,'40001');
 SELECT lab.archive_assert((SELECT count(*)=1 FROM rtn_private.news_rss_anchor_observations));
$s$);
SELECT lab.archive_case('three private original failures stop probe recovery without inventing RSS errors',$s$
 SELECT lab.keep('r',lab.archive_rss(lab.ctx('archive_prior_feed')->'items','c'));
 DO $loop$BEGIN FOR i IN 1..3 LOOP
  UPDATE rtn_private.news_archive_runtime SET anchor_probe_retry_at=clock_timestamp()-interval'1 second';
  PERFORM public.record_rtn_news_archive_anchor((lab.ctx('r')#>>'{claim,run_id}')::uuid,'{"status":"error","error_code":"RTN_ARCHIVE_ORIGINAL_READ_FAILED"}');
 END LOOP;END;$loop$;
 SELECT lab.archive_assert(public.get_rtn_news_archive_anchor_input()->>'state'='needs_review');
 SELECT lab.archive_assert((SELECT status='unchanged'FROM rtn_private.news_check_runs WHERE id=(lab.ctx('r')#>>'{claim,run_id}')::uuid));
$s$);
SELECT lab.archive_case('bounded history tail cannot silently skip an unobserved anchor interval',$s$
 INSERT INTO rtn_private.news_check_runs(kind,status,queued_at,completed_at,error_code)
 SELECT 'scheduled','error',clock_timestamp()+i*interval'1 second',clock_timestamp()+i*interval'1 second','RTN_NEWS_FETCH_FAILED'FROM generate_series(1,257)i;
 SELECT lab.archive_assert(public.get_rtn_news_archive_anchor_input()->>'state'='anchor_history_limited');
 SELECT public.record_rtn_news_archive_anchor(NULL,'{"status":"error","error_code":"RTN_ARCHIVE_ANCHOR_HISTORY_LIMIT"}');
 SELECT lab.archive_assert(public.get_rtn_news_archive_anchor_input()->>'state'='needs_review');
$s$);
SELECT lab.archive_case('newer manual enqueue threshold still applies after publisher block expiration',$s$
 UPDATE rtn_private.news_runtime SET publisher_blocked_until=clock_timestamp()-interval'1 second',last_enqueued_at=clock_timestamp()-interval'5 minutes',next_due_at=clock_timestamp()+interval'1 hour';
 UPDATE rtn_private.news_sources SET last_status='blocked',last_error_code='RTN_NEWS_HTTP_403';
 SELECT lab.archive_assert((SELECT(rtn_private.news_run_receipt(r)->>'cooldown_until')::timestamptz>clock_timestamp()+interval'4 minutes'FROM rtn_private.news_check_runs r ORDER BY queued_at DESC LIMIT 1));
 SELECT lab.keep('count_before',to_jsonb((SELECT count(*)FROM rtn_private.news_check_runs)));
 SELECT public.enqueue_due_rtn_news_check();SELECT lab.archive_assert(lab.ctx('count_before')=to_jsonb((SELECT count(*)FROM rtn_private.news_check_runs)));
$s$);
SELECT lab.archive_case('activation refuses a racing live legacy lease despite an earlier valid v2 success',$s$
 SELECT lab.keep('proof',lab.archive_rss(lab.ctx('archive_prior_feed')->'items','c'));
 UPDATE rtn_private.news_runtime SET last_enqueued_at=clock_timestamp()-interval'11 minutes',next_due_at=clock_timestamp()-interval'1 second';
 SELECT public.enqueue_due_rtn_news_check();SELECT public.claim_rtn_news_check(NULL);
 SELECT lab.denied('active legacy blocks activation',$q$SELECT rtn_private.activate_news_archive((lab.ctx('proof')#>>'{claim,run_id}')::uuid,repeat('f',64))$q$,'40001');
$s$);
SELECT lab.archive_case('invocation ends after three grants while durable campaign spend survives continuation',$s$
 SELECT lab.keep('claim',lab.archive_gap());
 SELECT lab.archive_complete(lab.ctx('claim'),lab.archive_page(lab.ctx('claim'),300));
 SELECT lab.keep('claim',lab.archive_next(lab.ctx('claim')));SELECT lab.archive_complete(lab.ctx('claim'),lab.archive_page(lab.ctx('claim'),301));
 SELECT lab.keep('claim',lab.archive_next(lab.ctx('claim')));SELECT lab.archive_complete(lab.ctx('claim'),lab.archive_page(lab.ctx('claim'),302));
 SELECT lab.archive_assert((SELECT status='queued'AND campaign_get_reserved=3 AND campaign_bytes_reserved=3145728 FROM rtn_private.news_archive_gaps));
 SELECT lab.keep('resume',public.claim_rtn_news_archive_gap());
 SELECT lab.archive_assert(lab.ctx('resume')#>>'{request,purpose}'='head_revalidate');
 SELECT lab.archive_assert((SELECT campaign_get_reserved=4 AND invocation_get_reserved=1 FROM rtn_private.news_archive_gaps));
$s$);
SELECT lab.archive_case('same raw hash preserves separate revalidation observations and candidate evidence',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.archive_complete(lab.ctx('claim'),jsonb_set(lab.archive_page(lab.ctx('claim'),300),'{yield_after}','true'));
 SELECT lab.keep('resume',public.claim_rtn_news_archive_gap());SELECT lab.archive_complete(lab.ctx('resume'),jsonb_set(lab.archive_page(lab.ctx('resume'),300),'{yield_after}','true'));
 SELECT lab.archive_assert((SELECT count(*)=1 FROM rtn_private.news_archive_captures)AND(SELECT count(*)=2 FROM rtn_private.news_archive_requests WHERE status='accepted'));
 SELECT lab.archive_assert((SELECT observation_count=2 FROM rtn_private.news_archive_candidates));
 SELECT lab.archive_assert((SELECT candidate_count=1 AND campaign_get_reserved=2 FROM rtn_private.news_archive_gaps));
$s$);
SELECT lab.archive_case('moving pagination fails closed without advancing the saved scan cursor',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.archive_complete(lab.ctx('claim'),jsonb_set(lab.archive_page(lab.ctx('claim'),300),'{yield_after}','true'));
 SELECT lab.keep('resume',public.claim_rtn_news_archive_gap());SELECT lab.archive_complete(lab.ctx('resume'),lab.archive_page(lab.ctx('resume'),301));
 SELECT lab.archive_assert((SELECT status='needs_review'AND stop_reason='moving_pagination'AND unique_pages=1 AND cursor_page=2 FROM rtn_private.news_archive_gaps));
 SELECT lab.archive_assert((SELECT count(*)=2 FROM rtn_private.news_archive_candidates));
$s$);
SELECT lab.archive_case('changed archive title at same URL is retained as conflict rather than an RSS correction',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.archive_complete(lab.ctx('claim'),jsonb_set(lab.archive_page(lab.ctx('claim'),300),'{yield_after}','true'));
 SELECT lab.keep('events_before',(SELECT jsonb_agg(to_jsonb(e)ORDER BY id)FROM rtn_private.update_events e));
 SELECT lab.keep('resume',public.claim_rtn_news_archive_gap());SELECT lab.archive_complete(lab.ctx('resume'),jsonb_set(lab.archive_page(lab.ctx('resume'),300),'{page,items,0,title}','"Different HTML title"'));
 SELECT lab.archive_assert((SELECT status='needs_review'AND stop_reason='candidate_conflict'FROM rtn_private.news_archive_gaps));
 SELECT lab.archive_assert((SELECT title='Archive synthetic 300'AND has_conflict FROM rtn_private.news_archive_candidates));
 SELECT lab.archive_assert(lab.ctx('events_before')=(SELECT jsonb_agg(to_jsonb(e)ORDER BY id)FROM rtn_private.update_events e));
$s$);
SELECT lab.archive_case('twenty repeated observations exhaust one campaign without a budget-reset crawl',$s$
 SELECT lab.keep('claim',lab.archive_gap());
 DO $loop$BEGIN FOR i IN 1..20 LOOP
  IF i>1 THEN PERFORM lab.keep('claim',public.claim_rtn_news_archive_gap());END IF;
  PERFORM lab.archive_assert(lab.ctx('claim')IS NOT NULL);
  PERFORM lab.archive_complete(lab.ctx('claim'),jsonb_set(lab.archive_page(lab.ctx('claim'),300),'{yield_after}','true'));
 END LOOP;END;$loop$;
 SELECT lab.archive_assert(public.claim_rtn_news_archive_gap()IS NULL);
 SELECT lab.archive_assert((SELECT status='needs_review'AND campaign_get_reserved=20 AND campaign_bytes_reserved=20971520 FROM rtn_private.news_archive_gaps));
$s$);
SELECT lab.archive_case('unknown expired lease spend remains charged and three crashes stop the same gap',$s$
 SELECT lab.keep('claim',lab.archive_gap());
 DO $loop$BEGIN FOR i IN 1..3 LOOP
  UPDATE rtn_private.news_archive_gaps SET lease_expires_at=clock_timestamp()-interval'1 second';
  PERFORM lab.archive_assert(public.claim_rtn_news_archive_gap()IS NULL);
  IF i<3 THEN UPDATE rtn_private.news_archive_gaps SET next_retry_at=clock_timestamp()-interval'1 second';PERFORM lab.keep('claim',public.claim_rtn_news_archive_gap());END IF;
 END LOOP;END;$loop$;
 SELECT lab.archive_assert((SELECT status='needs_review'AND failure_count=3 AND campaign_get_reserved=3 AND campaign_bytes_reserved=3145728 FROM rtn_private.news_archive_gaps));
 SELECT lab.archive_assert((SELECT count(*)=3 FROM rtn_private.news_archive_requests WHERE status='unknown_spend'));
$s$);
SELECT lab.archive_case('invocation70s expiration rejects completion without silently reclaiming reserved bytes',$s$
 SELECT lab.keep('claim',lab.archive_gap());UPDATE rtn_private.news_archive_gaps SET network_deadline_at=clock_timestamp()-interval'1 second';
 SELECT lab.denied('expired completion denied',$q$SELECT lab.archive_complete(lab.ctx('claim'),lab.archive_page(lab.ctx('claim')))$q$,'40001');
 SELECT lab.archive_assert((SELECT campaign_get_reserved=1 AND campaign_bytes_reserved=1048576 AND unique_pages=0 FROM rtn_private.news_archive_gaps));
$s$);
SELECT lab.archive_case('ordinary request authorization and candidate origins are immutable even for fixture owner',$s$
 SELECT lab.keep('claim',lab.archive_gap());
 SELECT lab.denied('grant immutable',$q$UPDATE rtn_private.news_archive_requests SET deadline_at=clock_timestamp()-interval'1 second'$q$,'55000');
 SELECT lab.archive_complete(lab.ctx('claim'),lab.archive_page(lab.ctx('claim'),300,true));
 SELECT lab.denied('candidate origin immutable',$q$UPDATE rtn_private.news_archive_candidates SET archive_first=false WHERE archive_first$q$,'55000');
 SELECT lab.denied('page capture immutable',$q$UPDATE rtn_private.news_archive_captures SET byte_size=101$q$,'55000');
 SELECT lab.denied('no truncate',$q$TRUNCATE rtn_private.news_rss_anchor_observations CASCADE$q$,'55000');
$s$);
SELECT lab.archive_case('state reader is honest bounded read-only metadata and does not expose service identities',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.archive_complete(lab.ctx('claim'),lab.archive_page(lab.ctx('claim'),300,true));
 UPDATE rtn_private.rollout_state SET stage='paid';SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.role','authenticated',true);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
 SELECT lab.keep('state',public.get_rtn_news_archive_state('11111111-1111-4111-8111-111111111111'));
 SELECT lab.archive_assert(lab.ctx('state')->>'complete_archive'='false'AND lab.ctx('state')->>'restored_public_events'='false'AND lab.ctx('state')#>>'{archive,date_precision}'='day');
 SELECT lab.archive_assert(lab.ctx('state')::text!~'original_path|lease_token|request_id|actor_id|organization_id|response_sha256');
$s$);
SELECT lab.check('all unrelated customer and financial sentinels remain exact',lab.ctx('archive_old_business')=(SELECT jsonb_build_array((SELECT jsonb_agg(x)FROM public.courses x),(SELECT jsonb_agg(x)FROM public.test_attempts x),(SELECT jsonb_agg(x)FROM public.subscription_invoices x))));

CREATE FUNCTION lab.archive_calendar(days integer)RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE rss jsonb;item jsonb;BEGIN
 item:=jsonb_set(lab.archive_item(501,'c'),'{published_at}',to_jsonb(to_char((clock_timestamp()-make_interval(days=>days))AT TIME ZONE'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
 rss:=lab.archive_rss(jsonb_build_array(item),'c');
 -- Fresh-controller calendar fixture, without deleting immutable observations.
 UPDATE rtn_private.news_archive_runtime SET last_processed_rss_run_id=NULL,last_processed_completed_at=NULL,baseline_anchor_run_id=NULL,last_usable_anchor_run_id=NULL;
 PERFORM lab.archive_anchor(rss);PERFORM rtn_private.activate_news_archive((rss#>>'{claim,run_id}')::uuid,repeat('f',64));
 rss:=lab.archive_rss(jsonb_build_array(lab.archive_item(502,'e')),'e');RETURN lab.archive_anchor(rss);
END;$f$;
SELECT lab.archive_case('inclusive calendar cap accepts one requested DATE',$s$
 SELECT lab.archive_assert(lab.archive_calendar(0)->>'status'='potential_gap');
 SELECT lab.archive_assert((SELECT target_until_date-target_from_date+1=1 FROM rtn_private.news_archive_gaps));
 SELECT lab.archive_assert(public.claim_rtn_news_archive_gap()IS NOT NULL);
$s$);
SELECT lab.archive_case('inclusive calendar cap accepts difference6 as seven DATEs',$s$
 SELECT lab.archive_assert(lab.archive_calendar(6)->>'status'='potential_gap');
 SELECT lab.archive_assert((SELECT target_until_date-target_from_date+1=7 FROM rtn_private.news_archive_gaps));
 SELECT lab.archive_assert(public.claim_rtn_news_archive_gap()IS NOT NULL);
$s$);
SELECT lab.archive_case('inclusive calendar cap stops difference7 as eight DATEs without clamping uncertainty',$s$
 SELECT lab.archive_assert(lab.archive_calendar(7)->>'status'='needs_review');
 SELECT lab.archive_assert((SELECT target_until_date-target_from_date+1=8 AND status='needs_review'AND campaign_get_reserved=0 FROM rtn_private.news_archive_gaps));
 SELECT lab.archive_assert(public.claim_rtn_news_archive_gap()IS NULL);
$s$);
SELECT lab.archive_case('reversed DATE interval fails the schema rather than being normalized',$s$
 SELECT lab.keep('claim',lab.archive_gap());
 SELECT lab.denied('reverse rejected',$q$INSERT INTO rtn_private.news_archive_gaps(from_anchor_run_id,to_anchor_run_id,target_from_date,target_until_date,status)
  SELECT from_anchor_run_id,to_anchor_run_id,CURRENT_DATE,CURRENT_DATE-1,'needs_review'FROM rtn_private.news_archive_gaps LIMIT 1$q$,'23514');
$s$);
SELECT lab.archive_case('accepted older boundary page retains every row but stops when prior anchor is missing',$s$
 SELECT lab.keep('claim',lab.archive_gap());SELECT lab.keep('page',lab.archive_page(lab.ctx('claim'),300));
 SELECT lab.keep('page',jsonb_set(jsonb_set(jsonb_set(jsonb_set(lab.ctx('page'),'{page,items,0,source_date}',to_jsonb((CURRENT_DATE-1)::text)),
  '{page,items,0,source_date_literal}',to_jsonb(to_char(CURRENT_DATE-1,'DD.MM.YYYY'))),'{page,oldest_source_date}',to_jsonb((CURRENT_DATE-1)::text)),
  '{page,newest_source_date}',to_jsonb((CURRENT_DATE-1)::text)));
 SELECT lab.archive_complete(lab.ctx('claim'),lab.ctx('page'));
 SELECT lab.archive_assert((SELECT status='needs_review'AND candidate_count=1 AND stop_reason='calendar_cap'FROM rtn_private.news_archive_gaps));
 SELECT lab.archive_assert((SELECT source_date=CURRENT_DATE-1 FROM rtn_private.news_archive_candidates));
$s$);
SELECT lab.archive_case('publisher epoch and activation proof columns cannot be silently rewritten',$s$
 SELECT lab.archive_enable();
 SELECT lab.denied('epoch immutable',$q$UPDATE rtn_private.news_publisher_lease_epochs SET publisher_epoch=publisher_epoch+1$q$,'55000');
 SELECT lab.denied('activation immutable',$q$UPDATE rtn_private.news_archive_runtime SET activation_receipt_sha256=repeat('a',64)$q$,'55000');
$s$);
SELECT lab.archive_case('API scope cannot be widened with a foreign URL or false full-archive flag',$s$
 SELECT lab.keep('claim',lab.archive_gap());
 SELECT lab.denied('foreign page',$q$SELECT lab.archive_complete(lab.ctx('claim'),jsonb_set(lab.archive_page(lab.ctx('claim')),'{page,page_url}','"https://outside.test/news/"'))$q$,'22023');
 SELECT lab.denied('false completeness',$q$SELECT lab.archive_complete(lab.ctx('claim'),jsonb_set(lab.archive_page(lab.ctx('claim')),'{page,complete_archive}','true'))$q$,'22023');
$s$);
