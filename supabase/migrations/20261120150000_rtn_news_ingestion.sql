-- Central public-news checks and factual version intents. No user/organization
-- attribution is copied into this global cache. Two exact-preimage reader
-- bodies are narrowly patched below; personal tables/privacy bodies, the old
-- source worker, course, attempt, grade, price and quota remain unchanged.
-- Source transport/runtime/schedule deployment is a separate release gate.
CREATE TEMP TABLE rtn_news_existing_functions ON COMMIT DROP AS SELECT oid,to_jsonb(p) AS catalog FROM pg_proc p;
CREATE TEMP TABLE rtn_news_reader_patches(oid oid PRIMARY KEY,expected_body text NOT NULL) ON COMMIT DROP;
DO $preflight$ DECLARE expected record;p pg_proc%ROWTYPE;BEGIN
 IF current_user<>'postgres' OR to_regclass('rtn_private.news_sources') IS NULL
  OR to_regclass('rtn_private.update_events') IS NULL OR to_regprocedure('rtn_private.assert_service()') IS NULL
  OR to_regprocedure('rtn_private.lock_actor()') IS NULL
 THEN RAISE EXCEPTION 'RTN_NEWS_REQUIRES_INSTALLED_GLOBAL_UPDATES';END IF;
 IF to_regclass('rtn_private.news_runtime') IS NOT NULL OR to_regprocedure('public.request_rtn_news_check(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'RTN_NEWS_ALREADY_EXISTS_REQUIRES_READBACK';END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='rtn-sources' AND name='rtn-sources' AND public IS FALSE
  AND(file_size_limit IS NULL OR file_size_limit>=1048576))
 THEN RAISE EXCEPTION 'RTN_NEWS_PRIVATE_ORIGINAL_BUCKET_REQUIRED';END IF;
 FOR expected IN SELECT * FROM(VALUES
  ('rtn_private.actor_allowed()','6adb3d9af11b2c5c07826dccb18f871a',true,'s'),
  ('rtn_private.assert_entitled(uuid,uuid)','3830455633b8df1b36aeb684201c65ca',true,'s'),
  ('rtn_private.assert_staff(uuid,text)','7821002b867b0a082c7798a382d3a70d',true,'s'),
  ('rtn_private.lock_actor()','d5723b819f698349820eeac316b0a668',true,'v'),
  ('rtn_private.validate_update_event()','97b9ad234efe69e57b161d37b6af3be8',false,'v'),
  ('rtn_private.reject_update_event_mutation()','f349e2e399ab8aecbc7d690601784bfb',false,'v'),
  ('rtn_private.update_event_payload(rtn_private.update_events)','f877079c2a64dd258a63771bf6a050ba',false,'i'),
  ('rtn_private.update_source_health()','98fab84f29af355d041827e7bb4379db',true,'s')
 )x(signature,body_md5,security_definer,volatility) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM expected.body_md5 OR pg_get_userbyid(p.proowner)<>'postgres'
   OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres}' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']
   OR p.prosecdef IS DISTINCT FROM expected.security_definer OR p.provolatile::text IS DISTINCT FROM expected.volatility
  THEN RAISE EXCEPTION 'RTN_NEWS_AUTHORITY_PREIMAGE_CHANGED:%',expected.signature;END IF;
 END LOOP;
 -- Root's actual post1400 SELECT capture20Nov11:54:16UTC. OIDs are
 -- recorded before CREATE OR REPLACE and must remain unchanged, not hardcoded
 -- across independently created native test schemas. All other metadata pins
 -- are exact; a changed body/ACL/owner/config fails before any durable DDL.
 FOR expected IN SELECT * FROM(VALUES
  ('public.get_rtn_update_summary(uuid)','d68d91d06db9c2ace8a6175eeada4304','s'),
  ('public.get_my_rtn_notifications(uuid,bigint,integer)','3de5144ef4934330e9838549c1329396','v')
 )x(signature,body_md5,volatility) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM expected.body_md5 OR pg_get_userbyid(p.proowner)<>'postgres'
   OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] OR NOT p.prosecdef
   OR p.provolatile::text IS DISTINCT FROM expected.volatility
  THEN RAISE EXCEPTION 'RTN_NEWS_READER_PREIMAGE_CHANGED:%',expected.signature;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM rtn_private.update_events WHERE kind='news') THEN
  RAISE EXCEPTION 'RTN_NEWS_EXISTING_NEWS_EVIDENCE_RECONCILIATION_REQUIRED';END IF;
 IF(SELECT count(*) FROM rtn_private.source_revisions)+(SELECT count(*) FROM rtn_private.bank_revisions)+(SELECT count(*) FROM rtn_private.releases)>5000
 THEN RAISE EXCEPTION 'RTN_NEWS_HISTORICAL_BOOTSTRAP_REQUIRES_BOUNDED_REVIEW';END IF;
END;$preflight$;

CREATE TABLE rtn_private.news_runtime(
 source_id smallint PRIMARY KEY CHECK(source_id=1) REFERENCES rtn_private.news_sources(id),
 generation bigint NOT NULL DEFAULT 0 CHECK(generation BETWEEN 0 AND 9007199254740991),
 next_due_at timestamptz NOT NULL DEFAULT clock_timestamp(),last_enqueued_at timestamptz,bootstrap_completed_at timestamptz
);
INSERT INTO rtn_private.news_runtime(source_id) VALUES(1);
CREATE TABLE rtn_private.news_check_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id smallint NOT NULL DEFAULT 1 REFERENCES rtn_private.news_runtime(source_id),
 kind text NOT NULL CHECK(kind IN('manual','scheduled')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','changed','unchanged','error')),
 queued_at timestamptz NOT NULL DEFAULT clock_timestamp(),started_at timestamptz,completed_at timestamptz,
 lease_token uuid,lease_expires_at timestamptz,generation bigint,attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
 result_digest text CHECK(result_digest ~ '^[0-9a-f]{64}$'),response_sha256 text CHECK(response_sha256 ~ '^[0-9a-f]{64}$'),
 new_event_count integer NOT NULL DEFAULT 0 CHECK(new_event_count BETWEEN 0 AND 200),
 correction_count integer NOT NULL DEFAULT 0 CHECK(correction_count BETWEEN 0 AND 200),
 unchanged_count integer NOT NULL DEFAULT 0 CHECK(unchanged_count BETWEEN 0 AND 200),
 error_code text CHECK(error_code IS NULL OR error_code ~ '^RTN_NEWS_[A-Z0-9_]{1,100}$')
);
CREATE UNIQUE INDEX rtn_news_one_open_check ON rtn_private.news_check_runs(source_id) WHERE status IN('queued','running');
CREATE INDEX rtn_news_checks_recent ON rtn_private.news_check_runs(queued_at DESC,id DESC);
CREATE TABLE rtn_private.news_feed_captures(
 response_sha256 text PRIMARY KEY CHECK(response_sha256 ~ '^[0-9a-f]{64}$'),source_id smallint NOT NULL DEFAULT 1 REFERENCES rtn_private.news_sources(id),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 1048576),
 original_path text NOT NULL CHECK(original_path='news/rss/'||response_sha256||'.xml'),
 resolved_feed_url text NOT NULL CHECK(resolved_feed_url IN('https://www.gosnadzor.ru/news/rss/','https://gosnadzor.ru/news/rss/')),
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE rtn_private.news_items(
 canonical_url text PRIMARY KEY CHECK(canonical_url ~ '^https://www[.]gosnadzor[.]ru/news/[1-9][0-9]{0,5}/[1-9][0-9]{0,11}/$'),
 current_raw_item_sha256 text NOT NULL CHECK(current_raw_item_sha256 ~ '^[0-9a-f]{64}$'),
 current_event_id uuid NOT NULL REFERENCES rtn_private.update_events(id),
 first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE rtn_private.news_item_evidence(
 event_id uuid PRIMARY KEY REFERENCES rtn_private.update_events(id),
 raw_item_sha256 text NOT NULL CHECK(raw_item_sha256 ~ '^[0-9a-f]{64}$'),
 response_sha256 text NOT NULL REFERENCES rtn_private.news_feed_captures(response_sha256),
 observed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE rtn_private.update_projection_intents(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN('source_revision','bank_revision','release')),subject_id uuid NOT NULL,
 historical boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 after_bank_id uuid,completed_at timestamptz,error_code text,
 retry_after timestamptz NOT NULL DEFAULT clock_timestamp(),attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
 UNIQUE(kind,subject_id),CHECK(error_code IS NULL OR error_code='RTN_NEWS_PROJECTION_FAILED')
);
CREATE INDEX rtn_update_projection_pending ON rtn_private.update_projection_intents(id) WHERE completed_at IS NULL;
DO $rls$ DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['news_runtime','news_check_runs','news_feed_captures','news_items','news_item_evidence','update_projection_intents'] LOOP
  EXECUTE format('ALTER TABLE rtn_private.%I ENABLE ROW LEVEL SECURITY',name);
 END LOOP;
END;$rls$;
CREATE TRIGGER rtn_news_capture_immutable BEFORE UPDATE OR DELETE ON rtn_private.news_feed_captures FOR EACH ROW EXECUTE FUNCTION rtn_private.reject_update_event_mutation();
CREATE TRIGGER rtn_news_capture_no_truncate BEFORE TRUNCATE ON rtn_private.news_feed_captures FOR EACH STATEMENT EXECUTE FUNCTION rtn_private.reject_update_event_mutation();
CREATE TRIGGER rtn_news_item_evidence_immutable BEFORE UPDATE OR DELETE ON rtn_private.news_item_evidence FOR EACH ROW EXECUTE FUNCTION rtn_private.reject_update_event_mutation();
CREATE TRIGGER rtn_news_item_evidence_no_truncate BEFORE TRUNCATE ON rtn_private.news_item_evidence FOR EACH STATEMENT EXECUTE FUNCTION rtn_private.reject_update_event_mutation();

CREATE FUNCTION rtn_private.news_run_receipt(r rtn_private.news_check_runs,p_replayed boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('run_id',r.id,'status',r.status,'queued_at',r.queued_at,'completed_at',r.completed_at,
  'new_event_count',r.new_event_count,'correction_count',r.correction_count,'unchanged_count',r.unchanged_count,
  'error_code',r.error_code,'replayed',p_replayed,'last_success_at',(SELECT last_success_at FROM rtn_private.news_sources WHERE id=1),
  'cooldown_until',(SELECT CASE WHEN s.last_status='blocked' THEN greatest(n.last_enqueued_at+interval '10 minutes',n.next_due_at)
   ELSE n.last_enqueued_at+interval '10 minutes' END FROM rtn_private.news_runtime n JOIN rtn_private.news_sources s ON s.id=n.source_id WHERE n.source_id=1))
$fn$;
CREATE FUNCTION rtn_private.enqueue_news_check(p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE runtime rtn_private.news_runtime%ROWTYPE;run rtn_private.news_check_runs%ROWTYPE;BEGIN
 IF p_kind NOT IN('manual','scheduled') OR p_kind IS NULL THEN RAISE EXCEPTION 'RTN_NEWS_INVALID_KIND' USING ERRCODE='22023';END IF;
 SELECT * INTO STRICT runtime FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;
 SELECT * INTO run FROM rtn_private.news_check_runs WHERE source_id=1 AND status IN('queued','running') ORDER BY queued_at,id LIMIT 1;
 IF FOUND THEN RETURN rtn_private.news_run_receipt(run,true);END IF;
 IF(p_kind='scheduled' AND runtime.next_due_at>clock_timestamp())
  OR(runtime.next_due_at>clock_timestamp() AND EXISTS(SELECT 1 FROM rtn_private.news_sources WHERE id=1 AND last_status='blocked'))
  OR runtime.last_enqueued_at>clock_timestamp()-interval '10 minutes' THEN
  SELECT * INTO run FROM rtn_private.news_check_runs ORDER BY queued_at DESC,id DESC LIMIT 1;
  IF FOUND THEN RETURN rtn_private.news_run_receipt(run,true);END IF;
  RETURN jsonb_build_object('run_id',NULL,'status','idle','replayed',true);
 END IF;
 INSERT INTO rtn_private.news_check_runs(kind) VALUES(p_kind) RETURNING * INTO run;
 UPDATE rtn_private.news_runtime SET last_enqueued_at=run.queued_at WHERE source_id=1;
 RETURN rtn_private.news_run_receipt(run,false);
END;$fn$;
CREATE FUNCTION public.request_rtn_news_check(p_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM rtn_private.lock_actor();
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.write');
 PERFORM rtn_private.assert_entitled(p_organization_id);
 -- Match the existing subject -> organization fence order. Deny foreign
 -- callers before waiting and recheck every authority after either wait.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,42));
 PERFORM 1 FROM public.organizations WHERE id=p_organization_id FOR KEY SHARE;
 PERFORM rtn_private.lock_actor();
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.write');
 PERFORM rtn_private.assert_entitled(p_organization_id);
 -- The shared runtime may be held by another organization/service worker.
 -- Acquire it before the final checks and before any enqueue OR cache return.
 PERFORM 1 FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;
 PERFORM rtn_private.lock_actor();
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.write');
 PERFORM rtn_private.assert_entitled(p_organization_id);
 RETURN rtn_private.enqueue_news_check('manual');
END;$fn$;
CREATE FUNCTION public.get_rtn_news_check_state(p_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE run rtn_private.news_check_runs%ROWTYPE;BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.read');PERFORM rtn_private.assert_entitled(p_organization_id);
 SELECT * INTO run FROM rtn_private.news_check_runs ORDER BY queued_at DESC,id DESC LIMIT 1;
 RETURN jsonb_build_object('check',CASE WHEN run.id IS NULL THEN NULL ELSE rtn_private.news_run_receipt(run) END,
  'source_health',rtn_private.update_source_health(),'can_request',coalesce(public.can_access_organization(p_organization_id,'courses.write'),false),
  'next_due_at',(SELECT next_due_at FROM rtn_private.news_runtime WHERE source_id=1));
END;$fn$;
CREATE FUNCTION public.enqueue_due_rtn_news_check() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM rtn_private.assert_service();RETURN rtn_private.enqueue_news_check('scheduled');END;$fn$;
CREATE FUNCTION public.claim_rtn_news_check(p_run_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE runtime rtn_private.news_runtime%ROWTYPE;run rtn_private.news_check_runs%ROWTYPE;BEGIN
 PERFORM rtn_private.assert_service();
 SELECT * INTO STRICT runtime FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;
 SELECT * INTO run FROM rtn_private.news_check_runs WHERE source_id=1 AND status IN('queued','running')
  AND(p_run_id IS NULL OR id=p_run_id) ORDER BY queued_at,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR(run.status='running' AND run.lease_expires_at>clock_timestamp()) THEN RETURN NULL;END IF;
 IF run.attempt_count>=3 THEN
  UPDATE rtn_private.news_check_runs SET status='error',completed_at=clock_timestamp(),lease_expires_at=NULL,error_code='RTN_NEWS_LEASE_EXHAUSTED' WHERE id=run.id;
  UPDATE rtn_private.news_sources SET last_checked_at=clock_timestamp(),last_status='error',last_error_code='RTN_NEWS_LEASE_EXHAUSTED' WHERE id=1;
  UPDATE rtn_private.news_runtime SET next_due_at=clock_timestamp()+interval '1 hour' WHERE source_id=1;RETURN NULL;
 END IF;
 UPDATE rtn_private.news_runtime SET generation=generation+1 WHERE source_id=1 RETURNING * INTO runtime;
 UPDATE rtn_private.news_check_runs SET status='running',started_at=clock_timestamp(),attempt_count=attempt_count+1,
  lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '120 seconds',generation=runtime.generation
  WHERE id=run.id RETURNING * INTO run;
 RETURN jsonb_build_object('run_id',run.id,'lease_token',run.lease_token,'lease_expires_at',run.lease_expires_at,
  'generation',run.generation,'kind',run.kind,'source_url','https://www.gosnadzor.ru/news/rss/');
END;$fn$;

CREATE FUNCTION public.complete_rtn_news_check(p_run_id uuid,p_lease_token uuid,p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE runtime rtn_private.news_runtime%ROWTYPE;run rtn_private.news_check_runs%ROWTYPE;item jsonb;
 state rtn_private.news_items%ROWTYPE;previous uuid;event_id uuid;event_hash text;raw_hash text;published timestamptz;
 result_hash text;capture_hash text;size integer;path text;resolved text;observed timestamptz;oldest timestamptz;newest timestamptz;
 n_new integer:=0;n_corrected integer:=0;n_unchanged integer:=0;historic boolean;v_error_code text;BEGIN
 PERFORM rtn_private.assert_service();
 IF p_result IS NULL OR jsonb_typeof(p_result)<>'object' OR octet_length(p_result::text)>524288
 THEN RAISE EXCEPTION 'RTN_NEWS_RESULT_INVALID' USING ERRCODE='22023';END IF;
 result_hash:=encode(pg_catalog.sha256(convert_to(p_result::text,'UTF8')),'hex');
 SELECT * INTO STRICT runtime FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;
 SELECT * INTO run FROM rtn_private.news_check_runs WHERE id=p_run_id FOR UPDATE;
 IF run.id IS NULL OR run.lease_token IS DISTINCT FROM p_lease_token OR p_lease_token IS NULL
 THEN RAISE EXCEPTION 'RTN_NEWS_LEASE_CONFLICT' USING ERRCODE='40001';END IF;
 IF run.status IN('changed','unchanged','error') THEN
  IF run.result_digest=result_hash THEN RETURN rtn_private.news_run_receipt(run,true);END IF;
  RAISE EXCEPTION 'RTN_NEWS_COMPLETION_CONFLICT' USING ERRCODE='40001';
 END IF;
 IF run.status<>'running' OR run.lease_expires_at<=clock_timestamp() OR run.generation IS DISTINCT FROM runtime.generation
 THEN RAISE EXCEPTION 'RTN_NEWS_LEASE_EXPIRED' USING ERRCODE='40001';END IF;
 observed:=clock_timestamp();
 IF p_result->>'status'='error' THEN
  IF p_result-ARRAY['status','error_code']<>'{}'::jsonb OR jsonb_typeof(p_result->'error_code') IS DISTINCT FROM 'string'
   OR p_result->>'error_code' !~ '^RTN_NEWS_[A-Z0-9_]{1,100}$'
  THEN RAISE EXCEPTION 'RTN_NEWS_ERROR_RESULT_INVALID' USING ERRCODE='22023';END IF;
  v_error_code:=p_result->>'error_code';
  UPDATE rtn_private.news_sources SET last_checked_at=observed,last_status=CASE WHEN v_error_code IN('RTN_NEWS_HTTP_401','RTN_NEWS_HTTP_403','RTN_NEWS_HTTP_429') THEN 'blocked' ELSE 'error' END,
   last_error_code=v_error_code WHERE id=1;
  UPDATE rtn_private.news_check_runs SET status='error',completed_at=observed,lease_expires_at=NULL,result_digest=result_hash,error_code=v_error_code
   WHERE id=run.id RETURNING * INTO run;
  UPDATE rtn_private.news_runtime SET next_due_at=observed+CASE WHEN v_error_code IN('RTN_NEWS_HTTP_401','RTN_NEWS_HTTP_403','RTN_NEWS_HTTP_429') THEN interval '24 hours' ELSE interval '1 hour' END WHERE source_id=1;
  RETURN rtn_private.news_run_receipt(run,false);
 END IF;
 IF p_result->>'status' IS DISTINCT FROM 'success' OR p_result-ARRAY['status','response_sha256','byte_size','original_path','resolved_feed_url','items']<>'{}'::jsonb
  OR jsonb_typeof(p_result->'response_sha256') IS DISTINCT FROM 'string' OR p_result->>'response_sha256' !~ '^[0-9a-f]{64}$'
  OR jsonb_typeof(p_result->'byte_size') IS DISTINCT FROM 'number' OR p_result->>'byte_size' !~ '^[1-9][0-9]{0,6}$'
  OR jsonb_typeof(p_result->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'items')>200
 THEN RAISE EXCEPTION 'RTN_NEWS_SUCCESS_RESULT_INVALID' USING ERRCODE='22023';END IF;
 capture_hash:=p_result->>'response_sha256';size:=(p_result->>'byte_size')::integer;path:=p_result->>'original_path';resolved:=p_result->>'resolved_feed_url';
 IF size>1048576 OR path IS DISTINCT FROM 'news/rss/'||capture_hash||'.xml'
  OR resolved IS NULL OR resolved NOT IN('https://www.gosnadzor.ru/news/rss/','https://gosnadzor.ru/news/rss/')
  OR(SELECT count(DISTINCT x->>'canonical_url') FROM jsonb_array_elements(p_result->'items') x)<>jsonb_array_length(p_result->'items')
 THEN RAISE EXCEPTION 'RTN_NEWS_CAPTURE_INVALID' USING ERRCODE='22023';END IF;
 INSERT INTO rtn_private.news_feed_captures(response_sha256,byte_size,original_path,resolved_feed_url)
  VALUES(capture_hash,size,path,resolved) ON CONFLICT(response_sha256) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM rtn_private.news_feed_captures c WHERE c.response_sha256=capture_hash AND c.byte_size=size AND c.original_path=path)
 THEN RAISE EXCEPTION 'RTN_NEWS_CAPTURE_HASH_CONFLICT' USING ERRCODE='23514';END IF;
 -- The official RSS is newest-first. Stable oldest-first insertion makes the
 -- final shared sequence point to the newest headline, not caller array order.
 FOR item IN SELECT value FROM jsonb_array_elements(p_result->'items')
  ORDER BY value->>'published_at',value->>'canonical_url' LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['canonical_url','title','published_at','content_sha256']<>'{}'::jsonb
   OR jsonb_typeof(item->'canonical_url') IS DISTINCT FROM 'string' OR item->>'canonical_url' !~ '^https://www[.]gosnadzor[.]ru/news/[1-9][0-9]{0,5}/[1-9][0-9]{0,11}/$'
   OR jsonb_typeof(item->'title') IS DISTINCT FROM 'string' OR length(btrim(item->>'title')) NOT BETWEEN 1 AND 500 OR item->>'title' ~ '[<>[:cntrl:]]'
   OR jsonb_typeof(item->'content_sha256') IS DISTINCT FROM 'string' OR item->>'content_sha256' !~ '^[0-9a-f]{64}$'
   OR jsonb_typeof(item->'published_at') IS DISTINCT FROM 'string' OR item->>'published_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
  THEN RAISE EXCEPTION 'RTN_NEWS_ITEM_INVALID' USING ERRCODE='22023';END IF;
  published:=(item->>'published_at')::timestamptz;
  IF published>observed+interval '10 minutes' THEN RAISE EXCEPTION 'RTN_NEWS_ITEM_FUTURE_DATE' USING ERRCODE='22023';END IF;
  oldest:=least(oldest,published);newest:=greatest(newest,published);raw_hash:=item->>'content_sha256';
  SELECT * INTO state FROM rtn_private.news_items WHERE canonical_url=item->>'canonical_url' FOR UPDATE;
  IF FOUND AND state.current_raw_item_sha256=raw_hash THEN
   UPDATE rtn_private.news_items SET last_seen_at=observed WHERE canonical_url=state.canonical_url;n_unchanged:=n_unchanged+1;CONTINUE;
  END IF;
  previous:=state.current_event_id;
  -- This is an EVENT REVISION fingerprint, not the source item's raw digest.
  -- The explicit predecessor makes A->B->A a third immutable correction while
  -- a repeated observation of current A remains a no-op. Raw digest is retained
  -- separately in private evidence, never relabelled as a different raw hash.
  event_hash:=encode(pg_catalog.sha256(convert_to(jsonb_build_object('format','rtn-news-event-v1',
   'raw_item_sha256',raw_hash,'previous_event_id',previous)::text,'UTF8')),'hex');
  historic:=runtime.bootstrap_completed_at IS NULL OR(previous IS NULL AND published<runtime.bootstrap_completed_at);
  INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,previous_event_id,news_source_id,canonical_url,title,
   published_at,observed_at,historical,notifiable)
   VALUES('news','general',item->>'canonical_url',event_hash,previous,1,item->>'canonical_url',item->>'title',published,observed,historic,NOT historic)
   RETURNING id INTO event_id;
  INSERT INTO rtn_private.news_item_evidence(event_id,raw_item_sha256,response_sha256,observed_at) VALUES(event_id,raw_hash,capture_hash,observed);
  INSERT INTO rtn_private.news_items(canonical_url,current_raw_item_sha256,current_event_id,first_seen_at,last_seen_at)
   VALUES(item->>'canonical_url',raw_hash,event_id,observed,observed) ON CONFLICT(canonical_url) DO UPDATE
   SET current_raw_item_sha256=excluded.current_raw_item_sha256,current_event_id=excluded.current_event_id,last_seen_at=excluded.last_seen_at;
  IF previous IS NULL THEN n_new:=n_new+1;ELSE n_corrected:=n_corrected+1;END IF;
 END LOOP;
 UPDATE rtn_private.news_sources SET last_checked_at=observed,last_success_at=observed,last_status='partial',last_error_code=NULL,
  coverage_kind='finite_rss_window',coverage_from=oldest,coverage_until=newest WHERE id=1;
 UPDATE rtn_private.news_runtime SET next_due_at=observed+interval '1 hour',
  bootstrap_completed_at=CASE WHEN bootstrap_completed_at IS NULL AND jsonb_array_length(p_result->'items')>0 THEN observed ELSE bootstrap_completed_at END WHERE source_id=1;
 UPDATE rtn_private.news_check_runs SET status=CASE WHEN n_new+n_corrected>0 THEN 'changed' ELSE 'unchanged' END,
  completed_at=observed,lease_expires_at=NULL,result_digest=result_hash,response_sha256=capture_hash,
  new_event_count=n_new,correction_count=n_corrected,unchanged_count=n_unchanged WHERE id=run.id RETURNING * INTO run;
 RETURN rtn_private.news_run_receipt(run,false);
END;$fn$;

-- Constant-size AFTER INSERT intents, not HTTP work or publication decisions.
-- A bank normalization can introduce a bank after the original was captured;
-- its own intent prevents this direction from being lost behind a cursor.
CREATE FUNCTION rtn_private.capture_update_projection_intent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_kind text;BEGIN
 IF TG_OP<>'INSERT' OR TG_TABLE_SCHEMA<>'rtn_private' THEN RAISE EXCEPTION 'RTN_NEWS_INTENT_TRIGGER_SCOPE_INVALID';END IF;
 v_kind:=CASE TG_TABLE_NAME WHEN 'source_revisions' THEN 'source_revision' WHEN 'bank_revisions' THEN 'bank_revision' WHEN 'releases' THEN 'release' END;
 IF v_kind IS NULL THEN RAISE EXCEPTION 'RTN_NEWS_INTENT_TRIGGER_SCOPE_INVALID';END IF;
 INSERT INTO rtn_private.update_projection_intents(kind,subject_id,historical) VALUES(v_kind,NEW.id,false) ON CONFLICT(kind,subject_id) DO NOTHING;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER rtn_source_update_intent AFTER INSERT ON rtn_private.source_revisions FOR EACH ROW EXECUTE FUNCTION rtn_private.capture_update_projection_intent();
CREATE TRIGGER rtn_bank_update_intent AFTER INSERT ON rtn_private.bank_revisions FOR EACH ROW EXECUTE FUNCTION rtn_private.capture_update_projection_intent();
CREATE TRIGGER rtn_release_update_intent AFTER INSERT ON rtn_private.releases FOR EACH ROW EXECUTE FUNCTION rtn_private.capture_update_projection_intent();
-- Existing facts become explicitly historical metadata; no old result, source,
-- key, signature or admission record is rewritten and none is notifiable.
INSERT INTO rtn_private.update_projection_intents(kind,subject_id,historical)
 SELECT 'source_revision',id,true FROM rtn_private.source_revisions ON CONFLICT(kind,subject_id) DO NOTHING;
INSERT INTO rtn_private.update_projection_intents(kind,subject_id,historical)
 SELECT 'bank_revision',id,true FROM rtn_private.bank_revisions ON CONFLICT(kind,subject_id) DO NOTHING;
INSERT INTO rtn_private.update_projection_intents(kind,subject_id,historical)
 SELECT 'release',id,true FROM rtn_private.releases ON CONFLICT(kind,subject_id) DO NOTHING;

CREATE FUNCTION public.project_rtn_update_intents(p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE task rtn_private.update_projection_intents%ROWTYPE;sr rtn_private.source_revisions%ROWTYPE;
 bank rtn_private.banks%ROWTYPE;br rtn_private.bank_revisions%ROWTYPE;release rtn_private.releases%ROWTYPE;
 n integer:=0;inserted integer:=0;task_n integer;task_inserted integer;step_inserted integer;intents_processed integer:=0;
 last_bank uuid;more boolean;failed boolean:=false;BEGIN
 PERFORM rtn_private.assert_service();
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'RTN_NEWS_PROJECTION_LIMIT_INVALID' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rtn-global-version-projection',42022));
 -- Both task count and examined bank subjects are bounded by p_limit. Fresh
 -- committed facts precede bootstrap backlog; duplicate normalization intents
 -- cannot delay a new release for many hourly ticks.
 FOR iteration IN 1..p_limit LOOP
 EXIT WHEN n>=p_limit;
 SELECT * INTO task FROM rtn_private.update_projection_intents WHERE completed_at IS NULL AND attempt_count<3 AND retry_after<=clock_timestamp()
  ORDER BY historical,id LIMIT 1 FOR UPDATE;
 EXIT WHEN NOT FOUND;
 task_n:=0;task_inserted:=0;last_bank:=NULL;more:=false;
 BEGIN
  IF task.kind='source_revision' THEN
   SELECT * INTO STRICT sr FROM rtn_private.source_revisions WHERE id=task.subject_id;
   FOR bank IN SELECT b.* FROM rtn_private.banks b WHERE b.source_id=sr.source_id AND(task.after_bank_id IS NULL OR b.id>task.after_bank_id) ORDER BY b.id LIMIT p_limit-n LOOP
    INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,bank_id,source_revision_id,canonical_url,title,observed_at,historical,notifiable)
     VALUES('source_change',bank.domain,bank.id::text||':'||sr.id::text,sr.sha256,bank.id,sr.id,sr.document_url,
      'Перечень вопросов Ростехнадзора: '||bank.code,sr.captured_at,task.historical,NOT task.historical)
     ON CONFLICT(kind,event_key,content_sha256) DO NOTHING;
    GET DIAGNOSTICS step_inserted=ROW_COUNT;task_inserted:=task_inserted+step_inserted;task_n:=task_n+1;last_bank:=bank.id;
   END LOOP;
   SELECT EXISTS(SELECT 1 FROM rtn_private.banks b WHERE b.source_id=sr.source_id AND b.id>coalesce(last_bank,task.after_bank_id)) INTO more;
   -- With no matching banks there is no subject event to fabricate.
   IF last_bank IS NULL THEN more:=false;END IF;
  ELSIF task.kind='bank_revision' THEN
   SELECT * INTO STRICT br FROM rtn_private.bank_revisions WHERE id=task.subject_id;
   SELECT * INTO STRICT bank FROM rtn_private.banks WHERE id=br.bank_id;
   SELECT * INTO STRICT sr FROM rtn_private.source_revisions WHERE id=br.source_revision_id;
   INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,bank_id,source_revision_id,canonical_url,title,observed_at,historical,notifiable)
    VALUES('source_change',bank.domain,bank.id::text||':'||sr.id::text,sr.sha256,bank.id,sr.id,sr.document_url,
     'Перечень вопросов Ростехнадзора: '||bank.code,sr.captured_at,task.historical,NOT task.historical)
    ON CONFLICT(kind,event_key,content_sha256) DO NOTHING;
   GET DIAGNOSTICS task_inserted=ROW_COUNT;task_n:=1;
  ELSE
   SELECT * INTO STRICT release FROM rtn_private.releases WHERE id=task.subject_id;
   SELECT * INTO STRICT bank FROM rtn_private.banks WHERE id=release.bank_id;
   SELECT b.* INTO STRICT br FROM rtn_private.key_sets k JOIN rtn_private.bank_revisions b ON b.id=k.bank_revision_id WHERE k.id=release.key_set_id;
   SELECT * INTO STRICT sr FROM rtn_private.source_revisions WHERE id=br.source_revision_id;
   INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,bank_id,source_revision_id,release_id,canonical_url,title,
    published_at,effective_from,observed_at,historical,notifiable)
    VALUES('bank_release',bank.domain,release.id::text,sr.sha256,bank.id,sr.id,release.id,sr.document_url,
     'Учебная редакция для подготовки: '||bank.code,release.published_at,release.effective_from,release.published_at,task.historical,NOT task.historical)
    ON CONFLICT(kind,event_key,content_sha256) DO NOTHING;
   GET DIAGNOSTICS task_inserted=ROW_COUNT;task_n:=1;
  END IF;
  UPDATE rtn_private.update_projection_intents SET after_bank_id=coalesce(last_bank,after_bank_id),
   completed_at=CASE WHEN more THEN NULL ELSE clock_timestamp() END,error_code=NULL WHERE id=task.id;
 EXCEPTION WHEN OTHERS THEN
  -- The failed subtransaction removes its partial events/cursor. Leave a
  -- bounded retryable intent; never fabricate successful projection metadata.
  failed:=true;task_n:=0;task_inserted:=0;
  UPDATE rtn_private.update_projection_intents SET attempt_count=attempt_count+1,
   retry_after=clock_timestamp()+interval '1 hour',error_code='RTN_NEWS_PROJECTION_FAILED' WHERE id=task.id;
 END;
 n:=n+task_n;inserted:=inserted+task_inserted;intents_processed:=intents_processed+1;
 END LOOP;
 RETURN jsonb_build_object('processed',n,'inserted',inserted,'intents_processed',intents_processed,'failed',failed,
  'has_more',EXISTS(SELECT 1 FROM rtn_private.update_projection_intents WHERE completed_at IS NULL AND attempt_count<3));
END;$fn$;

-- Existing13/14 source files remain immutable. Home prefers actual newly
-- observed facts; late historical projection cannot displace a fresh event.
-- With no nonhistorical fact, real publication/source-capture time wins over
-- later insertion sequence. The latest search is independent of count's1001
-- page. One matching index supports this presentation order across all rows.
CREATE INDEX rtn_updates_home_latest ON rtn_private.update_events(historical,
 (CASE WHEN historical THEN coalesce(published_at,observed_at) ELSE observed_at END) DESC,sequence DESC);
DO $reader_patches$ DECLARE p pg_proc%ROWTYPE;body text;anchor text;replacement text;definition text;BEGIN
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='public.get_rtn_update_summary(uuid)'::regprocedure;
 anchor:=E' WITH recent AS MATERIALIZED(SELECT e FROM rtn_private.update_events e\n  WHERE e.bank_id IS NULL OR rtn_private.entitled(p_organization_id,e.bank_id) ORDER BY e.sequence DESC LIMIT 1001)\n SELECT count(*)::integer,(SELECT rtn_private.update_event_payload(e) FROM recent ORDER BY(e).sequence DESC LIMIT 1) INTO n,latest FROM recent;';
 replacement:=E' WITH recent AS MATERIALIZED(SELECT 1 FROM rtn_private.update_events e\n  WHERE e.bank_id IS NULL OR rtn_private.entitled(p_organization_id,e.bank_id) ORDER BY e.sequence DESC LIMIT 1001)\n SELECT count(*)::integer INTO n FROM recent;\n SELECT rtn_private.update_event_payload(e) INTO latest FROM rtn_private.update_events e\n WHERE e.bank_id IS NULL OR rtn_private.entitled(p_organization_id,e.bank_id)\n ORDER BY e.historical,(CASE WHEN e.historical THEN coalesce(e.published_at,e.observed_at) ELSE e.observed_at END) DESC,e.sequence DESC LIMIT 1;';
 IF (length(p.prosrc)-length(replace(p.prosrc,anchor,'')))/length(anchor)<>1
 THEN RAISE EXCEPTION 'RTN_NEWS_SUMMARY_PATCH_ANCHOR_CHANGED';END IF;
 body:=replace(p.prosrc,anchor,replacement);definition:=pg_get_functiondef(p.oid);
 INSERT INTO pg_temp.rtn_news_reader_patches VALUES(p.oid,body);
 EXECUTE replace(definition,p.prosrc,body);
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='public.get_my_rtn_notifications(uuid,bigint,integer)'::regprocedure;
 anchor:='(e.kind=''source_change'' OR e.published_at>=s.enabled_since)';
 -- A post-consent correction is a newly observed shared occurrence. Keep its
 -- real original publication date, notifiable/nonhistorical and strict consent
 -- observed_at cutoff, current topic/kind/bank guards and recipient uniqueness.
 replacement:='(e.kind=''source_change'' OR e.published_at>=s.enabled_since OR(e.kind=''news'' AND e.previous_event_id IS NOT NULL))';
 IF (length(p.prosrc)-length(replace(p.prosrc,anchor,'')))/length(anchor)<>2
 THEN RAISE EXCEPTION 'RTN_NEWS_NOTIFICATION_PATCH_ANCHOR_CHANGED';END IF;
 body:=replace(p.prosrc,anchor,replacement);definition:=pg_get_functiondef(p.oid);
 INSERT INTO pg_temp.rtn_news_reader_patches VALUES(p.oid,body);
 EXECUTE replace(definition,p.prosrc,body);
END;$reader_patches$;

-- Restrict NEW OIDs only. Existing provider defaults, guards and table/schema
-- grants are not changed; ordinary/service clients receive no direct cache.
DO $acl$ DECLARE f record;g record;t record;BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure signature,p.proname,n.nspname
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE NOT EXISTS(SELECT 1 FROM pg_temp.rtn_news_existing_functions old WHERE old.oid=p.oid)
   AND(n.nspname='rtn_private' OR(n.nspname='public' AND p.proname IN('request_rtn_news_check','get_rtn_news_check_state',
    'enqueue_due_rtn_news_check','claim_rtn_news_check','complete_rtn_news_check','project_rtn_update_intents'))) LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',f.proowner))) a WHERE a.grantee<>f.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',f.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
  IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',f.signature,
   CASE WHEN f.proname IN('request_rtn_news_check','get_rtn_news_check_state') THEN 'authenticated' ELSE 'service_role' END);END IF;
 END LOOP;
 FOR t IN SELECT c.oid,c.relowner,c.relkind,c.oid::regclass qualified_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='rtn_private' AND c.relname IN('news_runtime','news_check_runs','news_feed_captures','news_items','news_item_evidence',
   'update_projection_intents','update_projection_intents_id_seq') LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid=t.oid),acldefault(CASE WHEN t.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,t.relowner))) a
   WHERE a.grantee<>t.relowner LOOP
   EXECUTE format('REVOKE ALL ON %s %s FROM %s',CASE WHEN t.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,t.qualified_name,
    CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
 END LOOP;
 -- Only these two reviewed bodies may differ. Their OIDs, ACLs, owner,
 -- config, security, volatility and every other pg_proc field stay exact.
 IF(SELECT count(*) FROM pg_temp.rtn_news_reader_patches)<>2 OR EXISTS(
  SELECT 1 FROM pg_temp.rtn_news_existing_functions old LEFT JOIN pg_proc p ON p.oid=old.oid
  LEFT JOIN pg_temp.rtn_news_reader_patches patch ON patch.oid=old.oid
  WHERE p.oid IS NULL OR CASE WHEN patch.oid IS NULL THEN old.catalog IS DISTINCT FROM to_jsonb(p)
   ELSE old.catalog-'prosrc' IS DISTINCT FROM to_jsonb(p)-'prosrc' OR p.prosrc IS DISTINCT FROM patch.expected_body END)
 THEN RAISE EXCEPTION 'RTN_NEWS_EXISTING_FUNCTION_CHANGED';END IF;
END;$acl$;
