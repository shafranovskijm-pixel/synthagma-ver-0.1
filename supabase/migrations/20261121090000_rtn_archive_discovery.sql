-- OFFLINE CANDIDATE. Finite archive DISCOVERY, never question/event admission.
-- Existing1300РІР‚вЂњ1600 canonical files are immutable. Archive starts OFF.
-- A separate root-reviewed v2 runtime/real RSS readiness gate is mandatory.
CREATE TEMP TABLE rtn_archive_old_functions ON COMMIT DROP AS SELECT oid,to_jsonb(p)catalog FROM pg_proc p;
CREATE TEMP TABLE rtn_archive_expected_patches(oid oid PRIMARY KEY,body text NOT NULL)ON COMMIT DROP;
DO $preflight$ DECLARE item record;p pg_proc%ROWTYPE;BEGIN
 IF current_user<>'postgres' OR to_regclass('rtn_private.news_runtime') IS NULL
  OR to_regclass('rtn_private.news_item_evidence') IS NULL OR to_regprocedure('rtn_private.assert_service()') IS NULL
 THEN RAISE EXCEPTION 'RTN_ARCHIVE_PREREQUISITES_REQUIRED';END IF;
 IF to_regclass('rtn_private.news_archive_runtime') IS NOT NULL THEN RAISE EXCEPTION 'RTN_ARCHIVE_ALREADY_EXISTS';END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='rtn-sources' AND public IS FALSE)
 THEN RAISE EXCEPTION 'RTN_ARCHIVE_PRIVATE_BUCKET_REQUIRED';END IF;
 FOR item IN SELECT * FROM(VALUES
  ('rtn_private.enqueue_news_check(text)','5ce521dadc809060b12bde1692a89b84','v','{postgres=X/postgres}'),
  ('public.claim_rtn_news_check(uuid)','66f964616ddd304d924d94e11d8296d8','v','{postgres=X/postgres,service_role=X/postgres}'),
  ('public.complete_rtn_news_check(uuid,uuid,jsonb)','e573c6ea95b0b8b941587e7e54075db0','v','{postgres=X/postgres,service_role=X/postgres}'),
  ('rtn_private.news_run_receipt(rtn_private.news_check_runs,boolean)','a3c4a1122c8c267e21bf4fcfd532091b','s','{postgres=X/postgres}')
 )x(signature,body_md5,volatility,acl)LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(item.signature);
  IF p.oid IS NULL OR md5(p.prosrc)IS DISTINCT FROM item.body_md5 OR pg_get_userbyid(p.proowner)<>'postgres'
   OR p.proacl::text IS DISTINCT FROM item.acl OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']
   OR NOT p.prosecdef OR p.provolatile::text IS DISTINCT FROM item.volatility
  THEN RAISE EXCEPTION 'RTN_ARCHIVE_OLD_FUNCTION_DRIFT:%',item.signature;END IF;
 END LOOP;
END;$preflight$;

ALTER TABLE rtn_private.news_runtime
 ADD COLUMN publisher_epoch bigint NOT NULL DEFAULT 0 CHECK(publisher_epoch BETWEEN 0 AND 9007199254740991),
 ADD COLUMN publisher_blocked_until timestamptz,
 ADD COLUMN publisher_verified_epoch bigint CHECK(publisher_verified_epoch BETWEEN 0 AND 9007199254740991),
 ADD COLUMN publisher_error_code text CHECK(publisher_error_code IN('RTN_NEWS_HTTP_401','RTN_NEWS_HTTP_403','RTN_NEWS_HTTP_429'));
UPDATE rtn_private.news_runtime n SET
 publisher_epoch=CASE WHEN s.last_status='blocked' THEN 1 ELSE 0 END,
 publisher_blocked_until=CASE WHEN s.last_status='blocked' THEN n.next_due_at END,
 publisher_verified_epoch=CASE WHEN s.last_success_at IS NOT NULL THEN 0 END,
 publisher_error_code=CASE WHEN s.last_error_code IN('RTN_NEWS_HTTP_401','RTN_NEWS_HTTP_403','RTN_NEWS_HTTP_429')THEN s.last_error_code END
 FROM rtn_private.news_sources s WHERE n.source_id=1 AND s.id=1;

CREATE TABLE rtn_private.news_archive_runtime(
 source_id smallint PRIMARY KEY CHECK(source_id=1)REFERENCES rtn_private.news_sources(id),
 last_processed_rss_run_id uuid REFERENCES rtn_private.news_check_runs(id),last_processed_completed_at timestamptz,
 baseline_anchor_run_id uuid,last_usable_anchor_run_id uuid,
 anchor_probe_retry_at timestamptz NOT NULL DEFAULT clock_timestamp(),anchor_probe_failures smallint NOT NULL DEFAULT 0 CHECK(anchor_probe_failures BETWEEN 0 AND 3),
 anchor_probe_error text CHECK(anchor_probe_error IN('RTN_ARCHIVE_ORIGINAL_READ_FAILED','RTN_ARCHIVE_ORIGINAL_HASH_CONFLICT','RTN_ARCHIVE_ORIGINAL_PARSE_FAILED','RTN_ARCHIVE_ANCHOR_HISTORY_LIMIT')),
 activation_state text NOT NULL DEFAULT'off' CHECK(activation_state IN('off','active')),
 activation_rss_run_id uuid REFERENCES rtn_private.news_check_runs(id),activation_receipt_sha256 text CHECK(activation_receipt_sha256~'^[0-9a-f]{64}$'),activated_at timestamptz,
 CHECK((activation_state='off'AND activation_rss_run_id IS NULL AND activation_receipt_sha256 IS NULL AND activated_at IS NULL)
  OR(activation_state='active'AND activation_rss_run_id IS NOT NULL AND activation_receipt_sha256 IS NOT NULL AND activated_at IS NOT NULL))
);
INSERT INTO rtn_private.news_archive_runtime(source_id)VALUES(1);
CREATE TABLE rtn_private.news_rss_anchor_observations(
 rss_run_id uuid PRIMARY KEY REFERENCES rtn_private.news_check_runs(id),response_sha256 text NOT NULL REFERENCES rtn_private.news_feed_captures(response_sha256),
 rss_completed_at timestamptz NOT NULL,accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 parser_format text NOT NULL CHECK(parser_format='rtn-rss-anchor-v1'),items jsonb NOT NULL CHECK(jsonb_typeof(items)='array'AND jsonb_array_length(items)<=200),
 observation_sha256 text NOT NULL CHECK(observation_sha256~'^[0-9a-f]{64}$'),
 result_kind text NOT NULL CHECK(result_kind IN('baseline','overlap','potential_gap','empty','needs_review'))
);
ALTER TABLE rtn_private.news_archive_runtime
 ADD FOREIGN KEY(baseline_anchor_run_id)REFERENCES rtn_private.news_rss_anchor_observations(rss_run_id),
 ADD FOREIGN KEY(last_usable_anchor_run_id)REFERENCES rtn_private.news_rss_anchor_observations(rss_run_id);
CREATE TABLE rtn_private.news_archive_gaps(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id smallint NOT NULL DEFAULT 1 CHECK(source_id=1),
 from_anchor_run_id uuid NOT NULL REFERENCES rtn_private.news_rss_anchor_observations(rss_run_id),
 to_anchor_run_id uuid NOT NULL REFERENCES rtn_private.news_rss_anchor_observations(rss_run_id),
 target_from_date date NOT NULL,target_until_date date NOT NULL CHECK(target_until_date>=target_from_date),
 status text NOT NULL DEFAULT'queued' CHECK(status IN('queued','running','observed_boundary','observed_end','needs_review')),
 stop_reason text CHECK(stop_reason IN('calendar_cap','request_cap','byte_cap','page_cap','candidate_cap','moving_pagination','candidate_conflict','anchor_boundary','listing_end','lease_exhausted','later_gap','invocation_elapsed','source_error')),
 generation bigint NOT NULL DEFAULT 0 CHECK(generation BETWEEN 0 AND 9007199254740991),lease_token uuid,lease_expires_at timestamptz,
 invocation_started_at timestamptz,network_deadline_at timestamptz,
 invocation_get_reserved smallint NOT NULL DEFAULT 0 CHECK(invocation_get_reserved BETWEEN 0 AND 3),
 invocation_bytes_reserved integer NOT NULL DEFAULT 0 CHECK(invocation_bytes_reserved BETWEEN 0 AND 3145728),
 campaign_get_reserved smallint NOT NULL DEFAULT 0 CHECK(campaign_get_reserved BETWEEN 0 AND 20),
 campaign_bytes_reserved integer NOT NULL DEFAULT 0 CHECK(campaign_bytes_reserved BETWEEN 0 AND 20971520),
 unique_pages smallint NOT NULL DEFAULT 0 CHECK(unique_pages BETWEEN 0 AND 10),candidate_count smallint NOT NULL DEFAULT 0 CHECK(candidate_count BETWEEN 0 AND 200),
 failure_count smallint NOT NULL DEFAULT 0 CHECK(failure_count BETWEEN 0 AND 3),next_retry_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 cursor_page smallint NOT NULL DEFAULT 1 CHECK(cursor_page BETWEEN 1 AND 10),next_purpose text NOT NULL DEFAULT'scan' CHECK(next_purpose IN('scan','head_revalidate','boundary_revalidate')),
 head_witness_sha256 text CHECK(head_witness_sha256~'^[0-9a-f]{64}$'),boundary_witness_sha256 text CHECK(boundary_witness_sha256~'^[0-9a-f]{64}$'),
 additional_uncertainty boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),last_checkpoint_at timestamptz,completed_at timestamptz,
 UNIQUE(from_anchor_run_id,to_anchor_run_id),CHECK(status='needs_review'OR target_until_date-target_from_date+1<=7)
);
CREATE UNIQUE INDEX rtn_archive_one_unresolved ON rtn_private.news_archive_gaps(source_id)WHERE status IN('queued','running','needs_review');
CREATE TABLE rtn_private.news_publisher_lease_epochs(
 channel text NOT NULL CHECK(channel IN('rss','archive')),work_id uuid NOT NULL,generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
 lease_token uuid NOT NULL,publisher_epoch bigint NOT NULL CHECK(publisher_epoch BETWEEN 0 AND 9007199254740991),
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 rss_get_grants smallint NOT NULL DEFAULT 0 CHECK(rss_get_grants BETWEEN 0 AND 5),runtime_mode text NOT NULL CHECK(runtime_mode IN('legacy','v2')),
 PRIMARY KEY(channel,work_id,generation)
);
CREATE TABLE rtn_private.news_archive_captures(
 response_sha256 text PRIMARY KEY CHECK(response_sha256~'^[0-9a-f]{64}$'),byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 1048576),
 original_path text NOT NULL CHECK(original_path='news/archive/'||response_sha256||'.html'),first_accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE rtn_private.news_archive_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),gap_id uuid NOT NULL REFERENCES rtn_private.news_archive_gaps(id),generation bigint NOT NULL,
 lease_token uuid NOT NULL,publisher_epoch bigint NOT NULL,campaign_ordinal smallint NOT NULL CHECK(campaign_ordinal BETWEEN 1 AND 20),
 invocation_ordinal smallint NOT NULL CHECK(invocation_ordinal BETWEEN 1 AND 3),purpose text NOT NULL CHECK(purpose IN('scan','head_revalidate','boundary_revalidate')),
 page_number smallint NOT NULL CHECK(page_number BETWEEN 1 AND 10),requested_url text NOT NULL,
 predecessor_request_id uuid REFERENCES rtn_private.news_archive_requests(id),expected_witness_sha256 text,
 authorized_at timestamptz NOT NULL DEFAULT clock_timestamp(),deadline_at timestamptz NOT NULL,
 reserved_body_bytes integer NOT NULL DEFAULT 1048576 CHECK(reserved_body_bytes=1048576),
 completed_at timestamptz,result_digest text CHECK(result_digest~'^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT'authorized' CHECK(status IN('authorized','accepted','error','unknown_spend')),
 response_sha256 text REFERENCES rtn_private.news_archive_captures(response_sha256),resolved_url text,content_type text,
 decoded_encoding text CHECK(decoded_encoding IN('utf-8','windows-1251')),body_bytes_seen integer CHECK(body_bytes_seen BETWEEN 0 AND 3145729),
 byte_limit_exceeded boolean,error_code text CHECK(error_code IS NULL OR error_code IN('RTN_ARCHIVE_PARSE_FAILED','RTN_ARCHIVE_BODY_SIZE_INVALID','RTN_ARCHIVE_TIMEOUT','RTN_ARCHIVE_ABORTED','RTN_ARCHIVE_TRANSPORT_ERROR','RTN_ARCHIVE_STORAGE_FAILED','RTN_ARCHIVE_STORAGE_HASH_CONFLICT','RTN_ARCHIVE_REDIRECT_FORBIDDEN')OR error_code~'^RTN_ARCHIVE_HTTP_[1-5][0-9]{2}$'),parsed_page jsonb,
 UNIQUE(gap_id,campaign_ordinal)
);
CREATE INDEX rtn_archive_requests_checkpoint ON rtn_private.news_archive_requests(gap_id,campaign_ordinal DESC);
CREATE TABLE rtn_private.news_archive_candidates(
 canonical_url text PRIMARY KEY CHECK(canonical_url~'^https://www[.]gosnadzor[.]ru/news/[1-9][0-9]{0,5}/[1-9][0-9]{0,11}/$'AND canonical_url!~'[[:space:][:cntrl:]]'),
 title text NOT NULL CHECK(length(title)BETWEEN 1 AND 500 AND title!~'[<>[:cntrl:]]'),source_date date NOT NULL,
 source_date_literal text NOT NULL CHECK(source_date_literal=to_char(source_date,'DD.MM.YYYY')),
 date_precision text NOT NULL DEFAULT'day' CHECK(date_precision='day'),source_timezone text CHECK(source_timezone IS NULL),
 archive_first boolean NOT NULL,first_request_id uuid NOT NULL REFERENCES rtn_private.news_archive_requests(id),last_request_id uuid NOT NULL REFERENCES rtn_private.news_archive_requests(id),
 first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 observation_count bigint NOT NULL DEFAULT 1 CHECK(observation_count BETWEEN 1 AND 9007199254740991),has_conflict boolean NOT NULL DEFAULT false
);
CREATE INDEX rtn_archive_candidates_keyset ON rtn_private.news_archive_candidates(first_seen_at DESC,canonical_url);
-- Existing live legacy leases are mapped, not cancelled or rewritten.
INSERT INTO rtn_private.news_publisher_lease_epochs(channel,work_id,generation,lease_token,publisher_epoch,expires_at,runtime_mode)
 SELECT 'rss',r.id,r.generation,r.lease_token,n.publisher_epoch,r.lease_expires_at,'legacy'
 FROM rtn_private.news_check_runs r CROSS JOIN rtn_private.news_runtime n WHERE r.status='running'AND n.source_id=1;

CREATE FUNCTION rtn_private.archive_iso(t timestamptz)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $f$
 SELECT to_char(t AT TIME ZONE'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$f$;
CREATE FUNCTION rtn_private.archive_hash(j jsonb)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $f$
 SELECT encode(sha256(convert_to(j::text,'UTF8')),'hex')
$f$;
CREATE FUNCTION rtn_private.archive_require(ok boolean,code text DEFAULT'RTN_ARCHIVE_RESULT_INVALID')RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $f$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',code USING ERRCODE='22023';END IF;END;$f$;
CREATE FUNCTION rtn_private.archive_url(p integer)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $f$
 SELECT CASE WHEN p=1 THEN'https://www.gosnadzor.ru/news/'ELSE'https://www.gosnadzor.ru/news/?PAGEN_1='||p END
$f$;
CREATE FUNCTION rtn_private.archive_immutable()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $f$
BEGIN RAISE EXCEPTION 'RTN_ARCHIVE_IMMUTABLE' USING ERRCODE='55000';END;$f$;
CREATE FUNCTION rtn_private.archive_column_guard()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $f$
BEGIN
 IF TG_OP<>'UPDATE'THEN RAISE EXCEPTION 'RTN_ARCHIVE_IMMUTABLE' USING ERRCODE='55000';END IF;
 IF TG_TABLE_NAME='news_archive_candidates'THEN
  IF to_jsonb(OLD)-ARRAY['last_request_id','last_seen_at','observation_count','has_conflict'] IS DISTINCT FROM to_jsonb(NEW)-ARRAY['last_request_id','last_seen_at','observation_count','has_conflict']
   OR NEW.observation_count<OLD.observation_count OR(OLD.has_conflict AND NOT NEW.has_conflict)
  THEN RAISE EXCEPTION 'RTN_ARCHIVE_PROVENANCE_IMMUTABLE' USING ERRCODE='55000';END IF;
 ELSIF TG_TABLE_NAME='news_archive_requests'THEN
  IF OLD.status<>'authorized'AND to_jsonb(OLD)IS DISTINCT FROM to_jsonb(NEW)
   OR to_jsonb(OLD)-ARRAY['completed_at','result_digest','status','response_sha256','resolved_url','content_type','decoded_encoding','body_bytes_seen','byte_limit_exceeded','error_code','parsed_page']
    IS DISTINCT FROM to_jsonb(NEW)-ARRAY['completed_at','result_digest','status','response_sha256','resolved_url','content_type','decoded_encoding','body_bytes_seen','byte_limit_exceeded','error_code','parsed_page']
  THEN RAISE EXCEPTION 'RTN_ARCHIVE_REQUEST_IMMUTABLE' USING ERRCODE='55000';END IF;
 ELSIF TG_TABLE_NAME='news_archive_gaps'THEN
  IF to_jsonb(OLD)-ARRAY['status','stop_reason','generation','lease_token','lease_expires_at','invocation_started_at','network_deadline_at','invocation_get_reserved','invocation_bytes_reserved','campaign_get_reserved','campaign_bytes_reserved','unique_pages','candidate_count','failure_count','next_retry_at','cursor_page','next_purpose','head_witness_sha256','boundary_witness_sha256','additional_uncertainty','last_checkpoint_at','completed_at']
   IS DISTINCT FROM to_jsonb(NEW)-ARRAY['status','stop_reason','generation','lease_token','lease_expires_at','invocation_started_at','network_deadline_at','invocation_get_reserved','invocation_bytes_reserved','campaign_get_reserved','campaign_bytes_reserved','unique_pages','candidate_count','failure_count','next_retry_at','cursor_page','next_purpose','head_witness_sha256','boundary_witness_sha256','additional_uncertainty','last_checkpoint_at','completed_at']
   OR NEW.campaign_get_reserved<OLD.campaign_get_reserved OR NEW.campaign_bytes_reserved<OLD.campaign_bytes_reserved OR NEW.unique_pages<OLD.unique_pages OR NEW.candidate_count<OLD.candidate_count
  THEN RAISE EXCEPTION 'RTN_ARCHIVE_GAP_BOUNDARY_IMMUTABLE' USING ERRCODE='55000';END IF;
 ELSIF TG_TABLE_NAME='news_publisher_lease_epochs'THEN
  IF to_jsonb(OLD)-'rss_get_grants'IS DISTINCT FROM to_jsonb(NEW)-'rss_get_grants'
   OR NEW.rss_get_grants<OLD.rss_get_grants OR NEW.rss_get_grants>OLD.rss_get_grants+1
  THEN RAISE EXCEPTION 'RTN_ARCHIVE_EPOCH_ORIGIN_IMMUTABLE' USING ERRCODE='55000';END IF;
 ELSIF TG_TABLE_NAME='news_archive_runtime'THEN
  IF NEW.source_id IS DISTINCT FROM OLD.source_id OR(OLD.activation_state='active'AND
   jsonb_build_array(NEW.activation_state,NEW.activation_rss_run_id,NEW.activation_receipt_sha256,NEW.activated_at)
   IS DISTINCT FROM jsonb_build_array(OLD.activation_state,OLD.activation_rss_run_id,OLD.activation_receipt_sha256,OLD.activated_at))
  THEN RAISE EXCEPTION 'RTN_ARCHIVE_ACTIVATION_IMMUTABLE' USING ERRCODE='55000';END IF;
 END IF;RETURN NEW;
END;$f$;

CREATE FUNCTION rtn_private.archive_claim_rss(p_run_id uuid,p_mode text)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE n rtn_private.news_runtime%ROWTYPE;run rtn_private.news_check_runs%ROWTYPE;t timestamptz;BEGIN
 PERFORM rtn_private.assert_service();
 SELECT * INTO STRICT n FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;t:=clock_timestamp();
 IF p_mode='legacy'AND(SELECT activation_state FROM rtn_private.news_archive_runtime WHERE source_id=1)='active'THEN RETURN NULL;END IF;
 IF n.publisher_blocked_until>t OR EXISTS(SELECT 1 FROM rtn_private.news_archive_requests WHERE status='authorized'AND deadline_at>t)THEN RETURN NULL;END IF;
 SELECT * INTO run FROM rtn_private.news_check_runs WHERE source_id=1 AND status IN('queued','running')AND(p_run_id IS NULL OR id=p_run_id)
  ORDER BY queued_at,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR(run.status='running'AND run.lease_expires_at>clock_timestamp())THEN RETURN NULL;END IF;
 IF run.attempt_count>=3 THEN
  UPDATE rtn_private.news_check_runs SET status='error',completed_at=clock_timestamp(),lease_expires_at=NULL,error_code='RTN_NEWS_LEASE_EXHAUSTED'WHERE id=run.id;
  UPDATE rtn_private.news_sources SET last_checked_at=clock_timestamp(),last_status='error',last_error_code='RTN_NEWS_LEASE_EXHAUSTED'WHERE id=1;
  UPDATE rtn_private.news_runtime SET next_due_at=greatest(clock_timestamp()+interval'1 hour',publisher_blocked_until)WHERE source_id=1;RETURN NULL;
 END IF;
 UPDATE rtn_private.news_runtime SET generation=generation+1 WHERE source_id=1 RETURNING * INTO n;
 UPDATE rtn_private.news_check_runs SET status='running',started_at=clock_timestamp(),attempt_count=attempt_count+1,
  lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval'120 seconds',generation=n.generation WHERE id=run.id RETURNING * INTO run;
 INSERT INTO rtn_private.news_publisher_lease_epochs(channel,work_id,generation,lease_token,publisher_epoch,expires_at,runtime_mode)
  VALUES('rss',run.id,run.generation,run.lease_token,n.publisher_epoch,run.lease_expires_at,p_mode);
 RETURN jsonb_build_object('run_id',run.id,'lease_token',run.lease_token,'lease_expires_at',run.lease_expires_at,
  'generation',run.generation,'kind',run.kind,'source_url','https://www.gosnadzor.ru/news/rss/');
END;$f$;
CREATE FUNCTION public.claim_rtn_news_check_v2(p_run_id uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN PERFORM rtn_private.assert_service();RETURN rtn_private.archive_claim_rss(p_run_id,'v2');END;$f$;

CREATE FUNCTION public.authorize_rtn_news_rss_get(p_run_id uuid,p_lease_token uuid,p_generation bigint,p_expected_get_count integer DEFAULT 0)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE n rtn_private.news_runtime%ROWTYPE;r rtn_private.news_check_runs%ROWTYPE;e rtn_private.news_publisher_lease_epochs%ROWTYPE;t timestamptz;BEGIN
 PERFORM rtn_private.assert_service();PERFORM rtn_private.archive_require(p_expected_get_count BETWEEN 0 AND 4);
 SELECT * INTO STRICT n FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;
 SELECT * INTO r FROM rtn_private.news_check_runs WHERE id=p_run_id;
 SELECT * INTO e FROM rtn_private.news_publisher_lease_epochs WHERE channel='rss'AND work_id=p_run_id AND generation=p_generation FOR UPDATE;
 t:=clock_timestamp();
 IF r.status IS DISTINCT FROM'running'OR r.generation IS DISTINCT FROM p_generation OR r.lease_token IS DISTINCT FROM p_lease_token
  OR r.lease_expires_at<=t OR e.runtime_mode IS DISTINCT FROM'v2'OR e.publisher_epoch IS DISTINCT FROM n.publisher_epoch
  OR e.lease_token IS DISTINCT FROM p_lease_token OR e.rss_get_grants IS DISTINCT FROM p_expected_get_count OR n.publisher_blocked_until>t
  OR EXISTS(SELECT 1 FROM rtn_private.news_archive_requests WHERE status='authorized'AND deadline_at>t)
 THEN RAISE EXCEPTION 'RTN_ARCHIVE_RSS_GET_AUTHORITY_LOST' USING ERRCODE='40001';END IF;
 UPDATE rtn_private.news_publisher_lease_epochs SET rss_get_grants=rss_get_grants+1 WHERE channel='rss'AND work_id=p_run_id AND generation=p_generation;
 RETURN jsonb_build_object('publisher_epoch',n.publisher_epoch,'expires_at',rtn_private.archive_iso(least(r.lease_expires_at,t+interval'20 seconds')),
  'permitted',true,'get_count',p_expected_get_count+1);
END;$f$;

-- Four narrow body replacements, preserving EVERY other pg_proc field.
DO $patches$DECLARE p pg_proc%ROWTYPE;body text;old text;replacement text;BEGIN
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='rtn_private.enqueue_news_check(text)'::regprocedure;
 old:=E'  OR(runtime.next_due_at>clock_timestamp() AND EXISTS(SELECT 1 FROM rtn_private.news_sources WHERE id=1 AND last_status=''blocked''))';
 replacement:=E'  OR runtime.publisher_blocked_until>clock_timestamp()';
 IF(length(p.prosrc)-length(replace(p.prosrc,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'RTN_ARCHIVE_ENQUEUE_ANCHOR_CHANGED';END IF;
 body:=replace(p.prosrc,old,replacement);EXECUTE replace(pg_get_functiondef(p.oid),p.prosrc,body);INSERT INTO rtn_archive_expected_patches VALUES(p.oid,body);
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='public.claim_rtn_news_check(uuid)'::regprocedure;
 body:=E'BEGIN\n PERFORM rtn_private.assert_service();\n RETURN rtn_private.archive_claim_rss(p_run_id,''legacy'');\nEND;';
 EXECUTE replace(pg_get_functiondef(p.oid),p.prosrc,body);INSERT INTO rtn_archive_expected_patches VALUES(p.oid,body);
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='rtn_private.news_run_receipt(rtn_private.news_check_runs,boolean)'::regprocedure;
 old:=E'CASE WHEN s.last_status=''blocked'' THEN greatest(n.last_enqueued_at+interval ''10 minutes'',n.next_due_at)\n   ELSE n.last_enqueued_at+interval ''10 minutes'' END';
 replacement:=E'CASE WHEN n.publisher_blocked_until>clock_timestamp() THEN greatest(n.last_enqueued_at+interval ''10 minutes'',n.publisher_blocked_until)\n   ELSE n.last_enqueued_at+interval ''10 minutes'' END';
 IF(length(p.prosrc)-length(replace(p.prosrc,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'RTN_ARCHIVE_RECEIPT_ANCHOR_CHANGED';END IF;
 body:=replace(p.prosrc,old,replacement);EXECUTE replace(pg_get_functiondef(p.oid),p.prosrc,body);INSERT INTO rtn_archive_expected_patches VALUES(p.oid,body);
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='public.complete_rtn_news_check(uuid,uuid,jsonb)'::regprocedure;body:=p.prosrc;
 old:='observed:=clock_timestamp();';
 replacement:=E'-- Terminal replay above is readonly; current live authority is checked here.\n'
  ||E' IF NOT EXISTS(SELECT 1 FROM rtn_private.news_publisher_lease_epochs x WHERE x.channel=''rss''AND x.work_id=run.id\n'
  ||E'  AND x.generation=run.generation AND x.lease_token=p_lease_token\n'
  ||E'  AND((x.runtime_mode=''legacy''AND(SELECT activation_state FROM rtn_private.news_archive_runtime WHERE source_id=1)=''off'')\n'
  ||E'   OR(x.runtime_mode=''v2''AND x.rss_get_grants>0)))\n'
  ||E' THEN RAISE EXCEPTION ''RTN_ARCHIVE_RSS_COMPLETION_UNPERMITTED'' USING ERRCODE=''40001'';END IF;\n'
  ||E' IF NOT(p_result->>''status''=''error''AND p_result->>''error_code''IN(''RTN_NEWS_HTTP_401'',''RTN_NEWS_HTTP_403'',''RTN_NEWS_HTTP_429''))\n'
  ||E'  AND(runtime.publisher_blocked_until>clock_timestamp()OR NOT EXISTS(SELECT 1 FROM rtn_private.news_publisher_lease_epochs x WHERE x.channel=''rss''AND x.work_id=run.id\n'
  ||E'   AND x.generation=run.generation AND x.publisher_epoch=runtime.publisher_epoch))\n'
  ||E' THEN RAISE EXCEPTION ''RTN_ARCHIVE_RSS_EPOCH_STALE'' USING ERRCODE=''40001'';END IF;\n observed:=clock_timestamp();';
 IF(length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'RTN_ARCHIVE_COMPLETION_ANCHOR_CHANGED';END IF;body:=replace(body,old,replacement);
 old:='  UPDATE rtn_private.news_runtime SET next_due_at=observed+CASE WHEN v_error_code IN(''RTN_NEWS_HTTP_401'',''RTN_NEWS_HTTP_403'',''RTN_NEWS_HTTP_429'') THEN interval ''24 hours'' ELSE interval ''1 hour'' END WHERE source_id=1;';
 replacement:=E'  IF v_error_code IN(''RTN_NEWS_HTTP_401'',''RTN_NEWS_HTTP_403'',''RTN_NEWS_HTTP_429'')THEN\n'
  ||E'   PERFORM rtn_private.archive_publisher_block(v_error_code);\n'
  ||E'  ELSE UPDATE rtn_private.news_runtime SET next_due_at=greatest(observed+interval ''1 hour'',publisher_blocked_until)WHERE source_id=1;END IF;';
 IF(length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'RTN_ARCHIVE_ERROR_ANCHOR_CHANGED';END IF;body:=replace(body,old,replacement);
 old:='historic:=runtime.bootstrap_completed_at IS NULL OR(previous IS NULL AND published<runtime.bootstrap_completed_at);';
 replacement:=old||E'\n  historic:=historic OR(previous IS NULL AND EXISTS(SELECT 1 FROM rtn_private.news_archive_candidates c WHERE c.canonical_url=item->>''canonical_url''AND c.archive_first));';
 IF(length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'RTN_ARCHIVE_HISTORY_ANCHOR_CHANGED';END IF;body:=replace(body,old,replacement);
 old:=' UPDATE rtn_private.news_runtime SET next_due_at=observed+interval ''1 hour'',';
 replacement:=E' UPDATE rtn_private.news_runtime SET publisher_verified_epoch=publisher_epoch,publisher_blocked_until=NULL,publisher_error_code=NULL,\n  next_due_at=observed+interval ''1 hour'',';
 IF(length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'RTN_ARCHIVE_SUCCESS_ANCHOR_CHANGED';END IF;body:=replace(body,old,replacement);
 EXECUTE replace(pg_get_functiondef(p.oid),p.prosrc,body);INSERT INTO rtn_archive_expected_patches VALUES(p.oid,body);
END;$patches$;

CREATE FUNCTION rtn_private.activate_news_archive(p_rss_run_id uuid,p_reviewed_deployment_sha256 text)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE n rtn_private.news_runtime%ROWTYPE;a rtn_private.news_archive_runtime%ROWTYPE;t timestamptz;BEGIN
 PERFORM rtn_private.archive_require(p_reviewed_deployment_sha256~'^[0-9a-f]{64}$');
 SELECT * INTO STRICT n FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;
 SELECT * INTO STRICT a FROM rtn_private.news_archive_runtime WHERE source_id=1 FOR UPDATE;t:=clock_timestamp();
 IF a.activation_state='active'THEN
  IF a.activation_rss_run_id IS DISTINCT FROM p_rss_run_id OR a.activation_receipt_sha256 IS DISTINCT FROM p_reviewed_deployment_sha256
  THEN RAISE EXCEPTION 'RTN_ARCHIVE_ACTIVATION_CONFLICT' USING ERRCODE='40001';END IF;
  RETURN jsonb_build_object('status','active','replayed',true);
 END IF;
 IF n.publisher_blocked_until>t OR n.publisher_verified_epoch IS DISTINCT FROM n.publisher_epoch
  OR NOT EXISTS(SELECT 1 FROM rtn_private.news_check_runs r JOIN rtn_private.news_feed_captures c ON c.response_sha256=r.response_sha256
   JOIN rtn_private.news_publisher_lease_epochs e ON e.channel='rss'AND e.work_id=r.id AND e.generation=r.generation
   WHERE r.id=p_rss_run_id AND r.status IN('changed','unchanged')AND r.completed_at IS NOT NULL
    AND e.runtime_mode='v2'AND e.rss_get_grants>0 AND e.publisher_epoch=n.publisher_epoch)
  OR EXISTS(SELECT 1 FROM rtn_private.news_check_runs r JOIN rtn_private.news_publisher_lease_epochs e ON e.channel='rss'AND e.work_id=r.id AND e.generation=r.generation
   WHERE r.status='running'AND e.runtime_mode='legacy')
 THEN RAISE EXCEPTION 'RTN_ARCHIVE_ACTIVATION_PROOF_REQUIRED' USING ERRCODE='40001';END IF;
 UPDATE rtn_private.news_archive_runtime SET activation_state='active',activation_rss_run_id=p_rss_run_id,
  activation_receipt_sha256=p_reviewed_deployment_sha256,activated_at=clock_timestamp()WHERE source_id=1;
 RETURN jsonb_build_object('status','active','replayed',false);
END;$f$;
CREATE INDEX rtn_archive_gap_recent ON rtn_private.news_archive_gaps(created_at DESC,id DESC);
CREATE FUNCTION public.get_rtn_news_archive_state(p_organization_id uuid)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE n rtn_private.news_runtime%ROWTYPE;a rtn_private.news_archive_runtime%ROWTYPE;g rtn_private.news_archive_gaps%ROWTYPE;
 r rtn_private.news_check_runs%ROWTYPE;known integer:=0;BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.read');PERFORM rtn_private.assert_entitled(p_organization_id);
 SELECT * INTO STRICT n FROM rtn_private.news_runtime WHERE source_id=1;SELECT * INTO STRICT a FROM rtn_private.news_archive_runtime WHERE source_id=1;
 SELECT * INTO g FROM rtn_private.news_archive_gaps ORDER BY(status IN('queued','running','needs_review'))DESC,created_at DESC,id DESC LIMIT 1;
 WITH tail AS MATERIALIZED(SELECT * FROM rtn_private.news_check_runs ORDER BY queued_at DESC,id DESC LIMIT 256)
 SELECT * INTO r FROM tail WHERE completed_at IS NOT NULL ORDER BY completed_at DESC,id DESC LIMIT 1;
 IF g.id IS NOT NULL THEN
  SELECT count(DISTINCT x->>'canonical_url')INTO known FROM rtn_private.news_archive_requests q CROSS JOIN LATERAL jsonb_array_elements(q.parsed_page->'items')x
   WHERE q.gap_id=g.id AND q.status='accepted'AND EXISTS(SELECT 1 FROM rtn_private.news_items i WHERE i.canonical_url=x->>'canonical_url');
 END IF;
 RETURN jsonb_build_object('source_health',rtn_private.update_source_health(),
  'rss',jsonb_build_object('last_completed_at',rtn_private.archive_iso(r.completed_at),'last_success_at',rtn_private.archive_iso((SELECT last_success_at FROM rtn_private.news_sources WHERE id=1)),
   'last_run_status',r.status,'error_code',r.error_code),
  'publisher',jsonb_build_object('blocked_until',rtn_private.archive_iso(n.publisher_blocked_until),'epoch',n.publisher_epoch,
   'verified',coalesce(n.publisher_verified_epoch=n.publisher_epoch,false),'error_code',n.publisher_error_code),
  'activation',a.activation_state,'anchor',jsonb_build_object('state',rtn_private.archive_anchor_input()->>'state',
   'last_rss_completed_at',rtn_private.archive_iso(a.last_processed_completed_at),'last_accepted_at',(SELECT rtn_private.archive_iso(accepted_at)FROM rtn_private.news_rss_anchor_observations WHERE rss_run_id=a.last_processed_rss_run_id),'error_code',a.anchor_probe_error),
  'archive',CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('state',g.status,'target_from_date',g.target_from_date,'target_until_date',g.target_until_date,
   'date_precision','day','checkpoint_at',rtn_private.archive_iso(g.last_checkpoint_at),'pages_observed',g.unique_pages,'candidates_observed',g.candidate_count,
   'pending_date_precision',g.candidate_count-known,'known_rss',known,'stop_reason',g.stop_reason,'next_retry_at',rtn_private.archive_iso(g.next_retry_at),
   'budget',jsonb_build_object('get_reserved',g.campaign_get_reserved,'body_bytes_reserved',g.campaign_bytes_reserved,'page_limit',10,'get_limit',20,'body_byte_limit',20971520,'candidate_limit',200))END,
  'complete_archive',false,'restored_public_events',false);
END;$f$;
CREATE FUNCTION public.list_rtn_news_archive_candidates(p_organization_id uuid,p_limit integer DEFAULT 20,p_cursor text DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE cursor_data jsonb;cursor_at timestamptz;url text;encoded text;items jsonb;more boolean;last_at timestamptz;last_url text;BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.read');PERFORM rtn_private.assert_entitled(p_organization_id);
 PERFORM rtn_private.archive_require(p_limit BETWEEN 1 AND 20,'RTN_ARCHIVE_LIST_LIMIT_INVALID');
 IF p_cursor IS NOT NULL THEN
  PERFORM rtn_private.archive_require(length(p_cursor)BETWEEN 1 AND 2048 AND p_cursor~'^[A-Za-z0-9_-]+$','RTN_ARCHIVE_CURSOR_INVALID');
  BEGIN
   cursor_data:=convert_from(decode(translate(p_cursor,'-_','+/')||repeat('=',(4-length(p_cursor)%4)%4),'base64'),'UTF8')::jsonb;
   PERFORM rtn_private.archive_require(jsonb_typeof(cursor_data)='object'AND cursor_data-ARRAY['first_seen_at','canonical_url']='{}'::jsonb
    AND cursor_data->>'first_seen_at'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'
    AND cursor_data->>'canonical_url'~'^https://www[.]gosnadzor[.]ru/news/[1-9][0-9]{0,5}/[1-9][0-9]{0,11}/$'AND cursor_data->>'canonical_url'!~'[[:space:][:cntrl:]]');
   cursor_at:=(cursor_data->>'first_seen_at')::timestamptz;url:=cursor_data->>'canonical_url';
   encoded:=translate(replace(encode(convert_to(cursor_data::text,'UTF8'),'base64'),E'\n',''),'+/','-_');encoded:=rtrim(encoded,'=');
   PERFORM rtn_private.archive_require(encoded=p_cursor AND rtn_private.archive_iso(cursor_at)=cursor_data->>'first_seen_at');
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'RTN_ARCHIVE_CURSOR_INVALID' USING ERRCODE='22023';END;
 END IF;
 WITH page AS MATERIALIZED(SELECT c.* FROM rtn_private.news_archive_candidates c
  WHERE p_cursor IS NULL OR c.first_seen_at<cursor_at OR(c.first_seen_at=cursor_at AND c.canonical_url>url)
  ORDER BY c.first_seen_at DESC,c.canonical_url LIMIT p_limit+1),selected AS(SELECT * FROM page ORDER BY first_seen_at DESC,canonical_url LIMIT p_limit)
 SELECT coalesce(jsonb_agg(jsonb_build_object('canonical_url',c.canonical_url,'title',c.title,'source_date',c.source_date,'date_precision','day',
   'has_conflict',c.has_conflict,'known_rss',EXISTS(SELECT 1 FROM rtn_private.news_items i WHERE i.canonical_url=c.canonical_url))ORDER BY c.first_seen_at DESC,c.canonical_url),'[]'::jsonb),
  (SELECT count(*)>p_limit FROM page)INTO items,more FROM selected c;
 IF more THEN
  SELECT c.first_seen_at,c.canonical_url INTO last_at,last_url FROM rtn_private.news_archive_candidates c
   WHERE c.canonical_url=items->(jsonb_array_length(items)-1)->>'canonical_url';
  encoded:=rtrim(translate(replace(encode(convert_to(jsonb_build_object('first_seen_at',rtn_private.archive_iso(last_at),'canonical_url',last_url)::text,'UTF8'),'base64'),E'\n',''),'+/','-_'),'=');
 ELSE encoded:=NULL;END IF;
 RETURN jsonb_build_object('items',items,'next_cursor',encoded,'has_more',more,'scope','archive_discovery_not_fresh_news','complete_archive',false,'exact_publication_times_known',false);
END;$f$;



CREATE FUNCTION rtn_private.archive_request_receipt(r rtn_private.news_archive_requests,replayed boolean)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE g rtn_private.news_archive_gaps%ROWTYPE;n integer:=0;known integer:=0;BEGIN
 SELECT * INTO STRICT g FROM rtn_private.news_archive_gaps WHERE id=r.gap_id;
 IF r.status='accepted'THEN
  n:=jsonb_array_length(r.parsed_page->'items');SELECT count(*)INTO known FROM jsonb_array_elements(r.parsed_page->'items')x
   WHERE EXISTS(SELECT 1 FROM rtn_private.news_items i WHERE i.canonical_url=x->>'canonical_url');
 END IF;
 RETURN jsonb_build_object('status',CASE WHEN r.status='error'THEN'error'WHEN g.status='running'THEN'continue'WHEN g.status='queued'THEN'yielded'ELSE g.status END,
  'replayed',replayed,'accepted_candidates',n,'pending_date_precision',n-known,'known_rss',known,'stop_reason',g.stop_reason);
END;$f$;
CREATE FUNCTION public.complete_rtn_news_archive_request(p_request_id uuid,p_lease_token uuid,p_generation bigint,p_result jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE n rtn_private.news_runtime%ROWTYPE;g rtn_private.news_archive_gaps%ROWTYPE;r rtn_private.news_archive_requests%ROWTYPE;
 page jsonb;item jsonb;old rtn_private.news_archive_candidates%ROWTYPE;digest text;witness text;code text;bytes integer;overflow boolean;t timestamptz;lease_deadline timestamptz;
 added integer:=0;overlap boolean:=false;conflict boolean:=false;repeated_scan boolean:=false;state text;reason text;prior jsonb;oldest date;yielded boolean;is_block boolean;
BEGIN
 PERFORM rtn_private.assert_service();PERFORM rtn_private.archive_require(jsonb_typeof(p_result)='object'AND octet_length(p_result::text)<=131072);
 digest:=rtn_private.archive_hash(p_result);
 SELECT * INTO r FROM rtn_private.news_archive_requests WHERE id=p_request_id;
 IF r.id IS NULL THEN RAISE EXCEPTION 'RTN_ARCHIVE_REQUEST_UNKNOWN' USING ERRCODE='40001';END IF;
 SELECT * INTO STRICT n FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;
 PERFORM 1 FROM rtn_private.news_archive_runtime WHERE source_id=1 FOR UPDATE;
 SELECT * INTO STRICT g FROM rtn_private.news_archive_gaps WHERE id=r.gap_id FOR UPDATE;
 SELECT * INTO STRICT r FROM rtn_private.news_archive_requests WHERE id=p_request_id FOR UPDATE;t:=clock_timestamp();lease_deadline:=g.lease_expires_at;
 IF p_lease_token IS NULL OR r.lease_token IS DISTINCT FROM p_lease_token OR r.generation IS DISTINCT FROM p_generation
 THEN RAISE EXCEPTION 'RTN_ARCHIVE_COMPLETION_CONFLICT' USING ERRCODE='40001';END IF;
 IF r.completed_at IS NOT NULL THEN
  IF r.result_digest IS DISTINCT FROM digest THEN RAISE EXCEPTION 'RTN_ARCHIVE_COMPLETION_CONFLICT' USING ERRCODE='40001';END IF;
  RETURN rtn_private.archive_request_receipt(r,true);
 END IF;
 IF g.status IS DISTINCT FROM'running'OR g.generation IS DISTINCT FROM p_generation OR g.lease_token IS DISTINCT FROM p_lease_token
  OR g.lease_expires_at<=t OR g.network_deadline_at<=t OR r.status<>'authorized'
 THEN RAISE EXCEPTION 'RTN_ARCHIVE_COMPLETION_EXPIRED' USING ERRCODE='40001';END IF;
 -- Request20s limits public GET/body/parser; private persistence may settle
 -- later, but only inside the SAME absolute70s invocation/live120s lease.
 IF p_result->>'status'='error'THEN
  PERFORM rtn_private.archive_require(p_result-ARRAY['status','error_code','body_bytes_seen','byte_limit_exceeded']='{}'::jsonb
   AND jsonb_typeof(p_result->'body_bytes_seen')='number'AND p_result->>'body_bytes_seen'~'^[0-9]{1,7}$'
   AND jsonb_typeof(p_result->'byte_limit_exceeded')='boolean'
   AND(p_result->>'error_code'IN('RTN_ARCHIVE_PARSE_FAILED','RTN_ARCHIVE_BODY_SIZE_INVALID','RTN_ARCHIVE_TIMEOUT','RTN_ARCHIVE_ABORTED','RTN_ARCHIVE_TRANSPORT_ERROR','RTN_ARCHIVE_STORAGE_FAILED','RTN_ARCHIVE_STORAGE_HASH_CONFLICT','RTN_ARCHIVE_REDIRECT_FORBIDDEN')
    OR p_result->>'error_code'~'^RTN_ARCHIVE_HTTP_[1-5][0-9]{2}$'));
  bytes:=(p_result->>'body_bytes_seen')::integer;overflow:=(p_result->>'byte_limit_exceeded')::boolean;code:=p_result->>'error_code';
  PERFORM rtn_private.archive_require(bytes<=3145729 AND(overflow=(bytes>1048576)));
  is_block:=code IN('RTN_ARCHIVE_HTTP_401','RTN_ARCHIVE_HTTP_403','RTN_ARCHIVE_HTTP_429');
  IF NOT is_block AND(r.publisher_epoch<>n.publisher_epoch OR n.publisher_blocked_until>clock_timestamp())
  THEN RAISE EXCEPTION 'RTN_ARCHIVE_EPOCH_STALE' USING ERRCODE='40001';END IF;
  UPDATE rtn_private.news_archive_requests SET completed_at=t,result_digest=digest,status='error',body_bytes_seen=bytes,byte_limit_exceeded=overflow,error_code=code WHERE id=r.id RETURNING * INTO r;
  IF is_block THEN PERFORM rtn_private.archive_publisher_block(replace(code,'RTN_ARCHIVE_','RTN_NEWS_'));END IF;
  UPDATE rtn_private.news_archive_gaps SET status=CASE WHEN failure_count+1>=3 THEN'needs_review'ELSE'queued'END,
   failure_count=least(3,failure_count+1),stop_reason=CASE WHEN failure_count+1>=3 THEN'source_error'END,
   next_retry_at=clock_timestamp()+CASE WHEN is_block THEN interval'24 hours'ELSE interval'1 hour'END,lease_expires_at=NULL WHERE id=g.id;
  IF clock_timestamp()>=g.network_deadline_at OR clock_timestamp()>=lease_deadline THEN RAISE EXCEPTION 'RTN_ARCHIVE_COMPLETION_EXPIRED' USING ERRCODE='40001';END IF;
  RETURN rtn_private.archive_request_receipt(r,false);
 END IF;
 PERFORM rtn_private.archive_require(p_result-ARRAY['status','page','original_path','resolved_url','content_type','decoded_encoding','body_bytes_seen','yield_after']='{}'::jsonb
  AND p_result->>'status'='success'AND jsonb_typeof(p_result->'yield_after')='boolean'
  AND p_result->>'resolved_url'=r.requested_url AND p_result->>'decoded_encoding'IN('utf-8','windows-1251')
  AND length(p_result->>'content_type')<=128 AND p_result->>'content_type'~*'^text/html([[:space:]]*;|[[:space:]]*$)'
  AND p_result->>'content_type'!~','AND jsonb_typeof(p_result->'body_bytes_seen')='number');
 IF r.publisher_epoch<>n.publisher_epoch OR n.publisher_blocked_until>clock_timestamp()
 THEN RAISE EXCEPTION 'RTN_ARCHIVE_EPOCH_STALE' USING ERRCODE='40001';END IF;
 page:=p_result->'page';witness:=rtn_private.archive_validate_page(page,r);
 PERFORM rtn_private.archive_require(p_result->>'original_path'='news/archive/'||(page->>'response_sha256')||'.html'
  AND p_result->'body_bytes_seen'=page->'response_bytes');
 INSERT INTO rtn_private.news_archive_captures(response_sha256,byte_size,original_path)
  VALUES(page->>'response_sha256',(page->>'response_bytes')::integer,p_result->>'original_path')ON CONFLICT DO NOTHING;
 PERFORM rtn_private.archive_require(EXISTS(SELECT 1 FROM rtn_private.news_archive_captures c WHERE c.response_sha256=page->>'response_sha256'
  AND c.byte_size=(page->>'response_bytes')::integer AND c.original_path=p_result->>'original_path'),'RTN_ARCHIVE_CAPTURE_CONFLICT');
  SELECT count(*)INTO added FROM jsonb_array_elements(page->'items')x WHERE NOT EXISTS(
   SELECT 1 FROM rtn_private.news_archive_requests q CROSS JOIN LATERAL jsonb_array_elements(q.parsed_page->'items')y
   WHERE q.gap_id=g.id AND q.id<>r.id AND q.status='accepted'AND y->>'canonical_url'=x->>'canonical_url');
 IF g.candidate_count+added>200 THEN
  UPDATE rtn_private.news_archive_requests SET completed_at=t,result_digest=digest,status='error',response_sha256=page->>'response_sha256',
   resolved_url=p_result->>'resolved_url',content_type=p_result->>'content_type',decoded_encoding=p_result->>'decoded_encoding',body_bytes_seen=(page->>'response_bytes')::integer,
   byte_limit_exceeded=false,parsed_page=page WHERE id=r.id RETURNING * INTO r;
  UPDATE rtn_private.news_archive_gaps SET status='needs_review',stop_reason='candidate_cap',lease_expires_at=NULL WHERE id=g.id;
  RETURN rtn_private.archive_request_receipt(r,false);
 END IF;
 UPDATE rtn_private.news_archive_requests SET completed_at=t,result_digest=digest,status='accepted',response_sha256=page->>'response_sha256',
  resolved_url=p_result->>'resolved_url',content_type=p_result->>'content_type',decoded_encoding=p_result->>'decoded_encoding',body_bytes_seen=(page->>'response_bytes')::integer,
  byte_limit_exceeded=false,parsed_page=page WHERE id=r.id RETURNING * INTO r;
  FOR item IN SELECT value FROM jsonb_array_elements(page->'items')LOOP
   SELECT * INTO old FROM rtn_private.news_archive_candidates WHERE canonical_url=item->>'canonical_url';
   IF FOUND THEN
    conflict:=conflict OR old.has_conflict OR old.title IS DISTINCT FROM item->>'title'OR old.source_date::text IS DISTINCT FROM item->>'source_date';
    UPDATE rtn_private.news_archive_candidates SET last_request_id=r.id,last_seen_at=t,observation_count=observation_count+1,
     has_conflict=has_conflict OR title IS DISTINCT FROM item->>'title'OR source_date::text IS DISTINCT FROM item->>'source_date'WHERE canonical_url=old.canonical_url;
   ELSE
    INSERT INTO rtn_private.news_archive_candidates(canonical_url,title,source_date,source_date_literal,archive_first,first_request_id,last_request_id,first_seen_at,last_seen_at)
     VALUES(item->>'canonical_url',item->>'title',(item->>'source_date')::date,item->>'source_date_literal',
      NOT EXISTS(SELECT 1 FROM rtn_private.news_items i WHERE i.canonical_url=item->>'canonical_url'),r.id,r.id,t,t);
   END IF;
  END LOOP;
 UPDATE rtn_private.news_archive_gaps SET candidate_count=candidate_count+added WHERE id=g.id;
 IF r.purpose<>'scan'THEN
  IF conflict OR witness IS DISTINCT FROM r.expected_witness_sha256 THEN
   UPDATE rtn_private.news_archive_gaps SET status='needs_review',stop_reason=CASE WHEN conflict THEN'candidate_conflict'ELSE'moving_pagination'END,lease_expires_at=NULL WHERE id=g.id;
  ELSE
   UPDATE rtn_private.news_archive_gaps SET next_purpose=CASE WHEN r.purpose='head_revalidate'AND cursor_page>2 THEN'boundary_revalidate'ELSE'scan'END WHERE id=g.id;
  END IF;
 ELSE
  SELECT o.items INTO STRICT prior FROM rtn_private.news_rss_anchor_observations o WHERE o.rss_run_id=g.from_anchor_run_id;
  overlap:=EXISTS(SELECT 1 FROM jsonb_array_elements(page->'items')x JOIN jsonb_array_elements(prior)y ON x->>'canonical_url'=y->>'canonical_url');
  oldest:=(page->>'oldest_source_date')::date;state:='running';reason:=NULL;
  -- A URL repeated across distinct scan pages is a moving-offset witness,
  -- not harmless dedup. Revalidation intentionally repeats its own page.
  repeated_scan:=EXISTS(SELECT 1 FROM jsonb_array_elements(page->'items')x
   JOIN rtn_private.news_archive_requests q ON q.gap_id=g.id AND q.id<>r.id AND q.status='accepted'AND q.purpose='scan'
   CROSS JOIN LATERAL jsonb_array_elements(q.parsed_page->'items')y WHERE x->>'canonical_url'=y->>'canonical_url');
  IF repeated_scan THEN state:='needs_review';reason:='moving_pagination';
  ELSIF conflict THEN state:='needs_review';reason:='candidate_conflict';
  ELSIF overlap AND oldest<=g.target_from_date THEN state:='observed_boundary';reason:='anchor_boundary';
  ELSIF page->>'pagination_state'='terminal'THEN state:=CASE WHEN overlap THEN'observed_end'ELSE'needs_review'END;reason:=CASE WHEN overlap THEN'listing_end'ELSE'moving_pagination'END;
  ELSIF oldest<g.target_from_date THEN state:='needs_review';reason:='calendar_cap';
  ELSIF page->>'pagination_state'='page_cap'THEN state:='needs_review';reason:='page_cap';END IF;
  UPDATE rtn_private.news_archive_gaps SET unique_pages=unique_pages+1,last_checkpoint_at=t,
   head_witness_sha256=CASE WHEN r.page_number=1 THEN witness ELSE head_witness_sha256 END,boundary_witness_sha256=witness,
   cursor_page=least(10,r.page_number+1),next_purpose='scan',status=state,stop_reason=reason,
   completed_at=CASE WHEN state IN('observed_boundary','observed_end')THEN t END,
   lease_expires_at=CASE WHEN state='running'THEN lease_expires_at END WHERE id=g.id;
 END IF;
 SELECT * INTO STRICT g FROM rtn_private.news_archive_gaps WHERE id=g.id;
 yielded:=(p_result->>'yield_after')::boolean OR g.invocation_get_reserved>=3 OR clock_timestamp()>=g.network_deadline_at;
 IF g.status='running'AND yielded THEN UPDATE rtn_private.news_archive_gaps SET status='queued',lease_expires_at=NULL WHERE id=g.id;END IF;
 IF clock_timestamp()>=g.network_deadline_at OR clock_timestamp()>=lease_deadline THEN RAISE EXCEPTION 'RTN_ARCHIVE_COMPLETION_EXPIRED' USING ERRCODE='40001';END IF;
 RETURN rtn_private.archive_request_receipt(r,false);
END;$f$;

CREATE FUNCTION rtn_private.archive_request_payload(r rtn_private.news_archive_requests)RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $f$
 SELECT jsonb_build_object('request_id',r.id,'page_url',r.requested_url,'page_number',r.page_number,'purpose',r.purpose,
  'request_deadline_at',rtn_private.archive_iso(r.deadline_at),'max_response_bytes',1048576)
$f$;
CREATE FUNCTION rtn_private.archive_reserve_request(p_gap_id uuid,p_token uuid,p_generation bigint)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE n rtn_private.news_runtime%ROWTYPE;g rtn_private.news_archive_gaps%ROWTYPE;r rtn_private.news_archive_requests%ROWTYPE;
 previous rtn_private.news_archive_requests%ROWTYPE;reason text;number integer;t timestamptz;expected text;
BEGIN
 SELECT * INTO STRICT n FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;
 PERFORM 1 FROM rtn_private.news_archive_runtime WHERE source_id=1 FOR UPDATE;
 SELECT * INTO g FROM rtn_private.news_archive_gaps WHERE id=p_gap_id FOR UPDATE;t:=clock_timestamp();
 IF g.status IS DISTINCT FROM'running'OR g.lease_token IS DISTINCT FROM p_token OR g.generation IS DISTINCT FROM p_generation
  OR g.lease_expires_at<=t OR NOT EXISTS(SELECT 1 FROM rtn_private.news_publisher_lease_epochs e WHERE e.channel='archive'AND e.work_id=g.id
   AND e.generation=p_generation AND e.lease_token=p_token AND e.publisher_epoch=n.publisher_epoch)
 THEN RAISE EXCEPTION 'RTN_ARCHIVE_LEASE_LOST' USING ERRCODE='40001';END IF;
 IF EXISTS(SELECT 1 FROM rtn_private.news_archive_requests WHERE gap_id=g.id AND status='authorized')
 THEN RAISE EXCEPTION 'RTN_ARCHIVE_REQUEST_ALREADY_AUTHORIZED' USING ERRCODE='40001';END IF;
 reason:=rtn_private.archive_pause_reason();
 IF reason IS NOT NULL THEN
  UPDATE rtn_private.news_archive_gaps SET status='queued',lease_expires_at=NULL WHERE id=g.id;
  RETURN jsonb_build_object('status','paused','reason',reason);
 END IF;
 IF g.network_deadline_at<=t OR g.invocation_get_reserved>=3 THEN
  UPDATE rtn_private.news_archive_gaps SET status='queued',lease_expires_at=NULL WHERE id=g.id;
  RETURN jsonb_build_object('status','paused','reason','invocation_elapsed');
 END IF;
 IF g.status='needs_review'OR g.campaign_get_reserved>=20 OR g.campaign_bytes_reserved+1048576>20971520
  OR(g.next_purpose='scan'AND(g.cursor_page>10 OR g.unique_pages>=10 OR g.candidate_count>=200))
 THEN
  UPDATE rtn_private.news_archive_gaps SET status='needs_review',stop_reason=CASE WHEN campaign_get_reserved>=20 THEN'request_cap'
   WHEN campaign_bytes_reserved+1048576>20971520 THEN'byte_cap'WHEN candidate_count>=200 THEN'candidate_cap'ELSE'page_cap'END,lease_expires_at=NULL WHERE id=g.id;
  RETURN jsonb_build_object('status','paused','reason','budget_exhausted');
 END IF;
 SELECT * INTO previous FROM rtn_private.news_archive_requests WHERE gap_id=g.id AND purpose='scan'AND status='accepted'ORDER BY campaign_ordinal DESC LIMIT 1;
 number:=CASE g.next_purpose WHEN'head_revalidate'THEN 1 WHEN'boundary_revalidate'THEN previous.page_number ELSE g.cursor_page END;
 expected:=CASE g.next_purpose WHEN'head_revalidate'THEN g.head_witness_sha256 WHEN'boundary_revalidate'THEN g.boundary_witness_sha256 END;
 IF g.next_purpose='scan'AND number>1 AND(previous.parsed_page->>'next_page_url'IS DISTINCT FROM rtn_private.archive_url(number))
 THEN RAISE EXCEPTION 'RTN_ARCHIVE_CHECKPOINT_TARGET_INVALID' USING ERRCODE='40001';END IF;
 INSERT INTO rtn_private.news_archive_requests(gap_id,generation,lease_token,publisher_epoch,campaign_ordinal,invocation_ordinal,purpose,page_number,
  requested_url,predecessor_request_id,expected_witness_sha256,authorized_at,deadline_at)
 VALUES(g.id,p_generation,p_token,n.publisher_epoch,g.campaign_get_reserved+1,g.invocation_get_reserved+1,g.next_purpose,number,
  rtn_private.archive_url(number),previous.id,expected,t,least(t+interval'20 seconds',g.network_deadline_at))RETURNING * INTO r;
 UPDATE rtn_private.news_archive_gaps SET invocation_get_reserved=invocation_get_reserved+1,invocation_bytes_reserved=invocation_bytes_reserved+1048576,
  campaign_get_reserved=campaign_get_reserved+1,campaign_bytes_reserved=campaign_bytes_reserved+1048576 WHERE id=g.id;
 RETURN jsonb_build_object('status','granted','request',rtn_private.archive_request_payload(r));
END;$f$;
CREATE FUNCTION public.authorize_rtn_news_archive_request(p_gap_id uuid,p_lease_token uuid,p_generation bigint)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN PERFORM rtn_private.assert_service();RETURN rtn_private.archive_reserve_request(p_gap_id,p_lease_token,p_generation);END;$f$;
CREATE FUNCTION public.claim_rtn_news_archive_gap()RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE n rtn_private.news_runtime%ROWTYPE;g rtn_private.news_archive_gaps%ROWTYPE;issued jsonb;t timestamptz;BEGIN
 PERFORM rtn_private.assert_service();SELECT * INTO STRICT n FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;
 PERFORM 1 FROM rtn_private.news_archive_runtime WHERE source_id=1 FOR UPDATE;t:=clock_timestamp();
 IF rtn_private.archive_pause_reason()IS NOT NULL THEN RETURN NULL;END IF;
 SELECT * INTO g FROM rtn_private.news_archive_gaps WHERE status IN('queued','running','needs_review')ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR g.status='needs_review'OR g.next_retry_at>clock_timestamp()THEN RETURN NULL;END IF;
 IF g.status='running'THEN
  IF g.lease_expires_at>clock_timestamp()THEN RETURN NULL;END IF;
  UPDATE rtn_private.news_archive_requests SET status='unknown_spend',completed_at=clock_timestamp(),error_code='RTN_ARCHIVE_TIMEOUT'
   WHERE gap_id=g.id AND status='authorized';
  UPDATE rtn_private.news_archive_gaps SET failure_count=least(3,failure_count+1),status=CASE WHEN failure_count+1>=3 THEN'needs_review'ELSE'queued'END,
   stop_reason=CASE WHEN failure_count+1>=3 THEN'lease_exhausted'END,next_retry_at=clock_timestamp()+interval'1 hour',lease_expires_at=NULL WHERE id=g.id;
  RETURN NULL;
 END IF;
 IF g.target_until_date-g.target_from_date+1 NOT BETWEEN 1 AND 7 THEN
  UPDATE rtn_private.news_archive_gaps SET status='needs_review',stop_reason='calendar_cap'WHERE id=g.id;RETURN NULL;
 END IF;
 UPDATE rtn_private.news_archive_gaps SET status='running',generation=generation+1,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval'120 seconds',
  invocation_started_at=clock_timestamp(),network_deadline_at=clock_timestamp()+interval'70 seconds',invocation_get_reserved=0,invocation_bytes_reserved=0,
  next_purpose=CASE WHEN head_witness_sha256 IS NULL THEN'scan'ELSE'head_revalidate'END WHERE id=g.id RETURNING * INTO g;
 INSERT INTO rtn_private.news_publisher_lease_epochs(channel,work_id,generation,lease_token,publisher_epoch,expires_at,runtime_mode)
  VALUES('archive',g.id,g.generation,g.lease_token,n.publisher_epoch,g.lease_expires_at,'v2');
 issued:=rtn_private.archive_reserve_request(g.id,g.lease_token,g.generation);
 IF issued->>'status'<>'granted'THEN RETURN NULL;END IF;
 SELECT * INTO STRICT g FROM rtn_private.news_archive_gaps WHERE id=g.id;
 RETURN jsonb_build_object('gap_id',g.id,'lease_token',g.lease_token,'generation',g.generation,'publisher_epoch',n.publisher_epoch,
  'lease_expires_at',rtn_private.archive_iso(g.lease_expires_at),'invocation_deadline_at',rtn_private.archive_iso(g.network_deadline_at),'request',issued->'request',
  'remaining',jsonb_build_object('get_attempts',20-g.campaign_get_reserved,'body_bytes',20971520-g.campaign_bytes_reserved,'pages',10-g.unique_pages,'candidates',200-g.candidate_count));
END;$f$;

CREATE FUNCTION rtn_private.archive_validate_page(page jsonb,r rtn_private.news_archive_requests)RETURNS text
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $f$
DECLARE item jsonb;number integer:=0;day date;last_day date;first_day date;witness jsonb:='[]';BEGIN
 PERFORM rtn_private.archive_require(jsonb_typeof(page)='object'AND octet_length(page::text)<=65536
  AND page-ARRAY['adapter_version','page_url','page_number','response_sha256','response_bytes','items','next_page_url','pagination_state','oldest_source_date','newest_source_date','date_precision','complete_archive','exact_publication_times_known']='{}'::jsonb
  AND page->>'adapter_version'='rtn-news-archive-v1'AND page->>'page_url'=r.requested_url AND page->'page_number'=to_jsonb(r.page_number)
  AND page->>'response_sha256'~'^[0-9a-f]{64}$'AND jsonb_typeof(page->'response_bytes')='number'AND page->>'response_bytes'~'^[1-9][0-9]{0,6}$'
  AND page->>'date_precision'='day'AND page->'complete_archive'='false'::jsonb AND page->'exact_publication_times_known'='false'::jsonb
  AND jsonb_typeof(page->'items')='array'AND jsonb_array_length(page->'items')BETWEEN 1 AND 20);
 PERFORM rtn_private.archive_require((page->>'response_bytes')::integer<=1048576);
 PERFORM rtn_private.archive_require((page->>'pagination_state'='adjacent'AND r.page_number<10 AND page->>'next_page_url'=rtn_private.archive_url(r.page_number+1))
  OR(page->>'pagination_state'='page_cap'AND r.page_number=10 AND page->'next_page_url'='null'::jsonb)
  OR(page->>'pagination_state'='terminal'AND page->'next_page_url'='null'::jsonb));
 PERFORM rtn_private.archive_require((SELECT count(DISTINCT x->>'canonical_url')FROM jsonb_array_elements(page->'items')x)=jsonb_array_length(page->'items'));
 FOR item IN SELECT value FROM jsonb_array_elements(page->'items')LOOP
  number:=number+1;
  PERFORM rtn_private.archive_require(jsonb_typeof(item)='object'AND item-ARRAY['canonical_url','title','source_date','source_date_literal','date_precision','ordinal']='{}'::jsonb
   AND item->>'canonical_url'~'^https://www[.]gosnadzor[.]ru/news/[1-9][0-9]{0,5}/[1-9][0-9]{0,11}/$'AND item->>'canonical_url'!~'[[:space:][:cntrl:]]'
   AND jsonb_typeof(item->'title')='string'AND length(item->>'title')BETWEEN 1 AND 500 AND item->>'title'!~'[<>[:cntrl:]]'
   AND item->>'source_date'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'AND item->>'date_precision'='day'AND item->'ordinal'=to_jsonb(number));
  BEGIN day:=(item->>'source_date')::date;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'RTN_ARCHIVE_DATE_INVALID' USING ERRCODE='22023';END;
  PERFORM rtn_private.archive_require(item->>'source_date_literal'=to_char(day,'DD.MM.YYYY')AND day BETWEEN'1900-01-01'::date AND'2200-12-31'::date
   AND day<=(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date AND(last_day IS NULL OR day<=last_day));
  first_day:=coalesce(first_day,day);last_day:=day;
  witness:=witness||jsonb_build_array(jsonb_build_object('canonical_url',item->>'canonical_url','source_date',item->>'source_date','ordinal',number));
 END LOOP;
 PERFORM rtn_private.archive_require(page->>'newest_source_date'=first_day::text AND page->>'oldest_source_date'=last_day::text);
 RETURN rtn_private.archive_hash(witness);
END;$f$;
DO $guards$DECLARE tab text;BEGIN
 FOREACH tab IN ARRAY ARRAY['news_archive_runtime','news_rss_anchor_observations','news_archive_gaps','news_publisher_lease_epochs','news_archive_requests','news_archive_captures','news_archive_candidates']LOOP
  EXECUTE format('ALTER TABLE rtn_private.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE TRIGGER archive_no_truncate BEFORE TRUNCATE ON rtn_private.%I FOR EACH STATEMENT EXECUTE FUNCTION rtn_private.archive_immutable()',tab);
  IF tab IN('news_rss_anchor_observations','news_archive_captures')THEN
   EXECUTE format('CREATE TRIGGER archive_no_mutation BEFORE UPDATE OR DELETE ON rtn_private.%I FOR EACH ROW EXECUTE FUNCTION rtn_private.archive_immutable()',tab);
  ELSIF tab IN('news_archive_candidates','news_archive_requests','news_archive_gaps','news_publisher_lease_epochs','news_archive_runtime')THEN
   EXECUTE format('CREATE TRIGGER archive_columns BEFORE UPDATE OR DELETE ON rtn_private.%I FOR EACH ROW EXECUTE FUNCTION rtn_private.archive_column_guard()',tab);
  END IF;
 END LOOP;
END;$guards$;

CREATE FUNCTION rtn_private.archive_anchor_input()RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE a rtn_private.news_archive_runtime%ROWTYPE;entry record;BEGIN
 SELECT * INTO STRICT a FROM rtn_private.news_archive_runtime WHERE source_id=1;
 IF a.anchor_probe_failures>=3 THEN RETURN jsonb_build_object('state','needs_review','retry_at',NULL);END IF;
 IF a.anchor_probe_retry_at>clock_timestamp()THEN RETURN jsonb_build_object('state','retry_wait','retry_at',rtn_private.archive_iso(a.anchor_probe_retry_at));END IF;
 IF a.last_processed_rss_run_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM(SELECT id FROM rtn_private.news_check_runs ORDER BY queued_at DESC,id DESC LIMIT 256)tail WHERE tail.id=a.last_processed_rss_run_id)
 THEN RETURN jsonb_build_object('state','anchor_history_limited','retry_at',NULL);END IF;
 WITH tail AS MATERIALIZED(SELECT * FROM rtn_private.news_check_runs ORDER BY queued_at DESC,id DESC LIMIT 256)
 SELECT r.id,r.completed_at,c.response_sha256,c.byte_size,c.original_path,c.resolved_feed_url INTO entry
 FROM tail r JOIN rtn_private.news_feed_captures c ON c.response_sha256=r.response_sha256
 WHERE r.status IN('changed','unchanged')AND r.completed_at IS NOT NULL
  AND(a.last_processed_rss_run_id IS NULL OR(r.completed_at,r.id)>(a.last_processed_completed_at,a.last_processed_rss_run_id))
 ORDER BY CASE WHEN a.last_processed_rss_run_id IS NULL THEN r.completed_at END DESC,
  CASE WHEN a.last_processed_rss_run_id IS NULL THEN r.id END DESC,r.completed_at,r.id LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','no_success','retry_at',NULL);END IF;
 RETURN jsonb_build_object('state','ready','input',jsonb_build_object('rss_run_id',entry.id,'response_sha256',entry.response_sha256,
  'byte_size',entry.byte_size,'original_path',entry.original_path,'resolved_feed_url',entry.resolved_feed_url,
  'rss_completed_at',rtn_private.archive_iso(entry.completed_at),'baseline',a.baseline_anchor_run_id IS NULL));
END;$f$;
CREATE FUNCTION public.get_rtn_news_archive_anchor_input()RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN PERFORM rtn_private.assert_service();RETURN rtn_private.archive_anchor_input();END;$f$;

CREATE FUNCTION public.record_rtn_news_archive_anchor(p_rss_run_id uuid,p_result jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE a rtn_private.news_archive_runtime%ROWTYPE;run rtn_private.news_check_runs%ROWTYPE;old rtn_private.news_rss_anchor_observations%ROWTYPE;
 expected jsonb;items jsonb;item jsonb;digest text;kind text;from_day date;until_day date;pub timestamptz;created boolean:=false;prior jsonb;
BEGIN
 PERFORM rtn_private.assert_service();PERFORM rtn_private.archive_require(jsonb_typeof(p_result)='object'AND octet_length(p_result::text)<=131072);
 PERFORM 1 FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;
 SELECT * INTO STRICT a FROM rtn_private.news_archive_runtime WHERE source_id=1 FOR UPDATE;
 IF p_result->>'status'='success'THEN
  PERFORM rtn_private.archive_require(p_result-ARRAY['status','parser_format','response_sha256','byte_size','items']='{}'::jsonb
   AND p_result->>'parser_format'='rtn-rss-anchor-v1'AND p_result->>'response_sha256'~'^[0-9a-f]{64}$'
   AND jsonb_typeof(p_result->'byte_size')='number'AND p_result->>'byte_size'~'^[1-9][0-9]{0,6}$'
   AND jsonb_typeof(p_result->'items')='array'AND jsonb_array_length(p_result->'items')<=200);
  FOR item IN SELECT value FROM jsonb_array_elements(p_result->'items')LOOP
   PERFORM rtn_private.archive_require(jsonb_typeof(item)='object'AND item-ARRAY['canonical_url','published_at','raw_item_sha256']='{}'::jsonb
    AND item->>'canonical_url'~'^https://www[.]gosnadzor[.]ru/news/[1-9][0-9]{0,5}/[1-9][0-9]{0,11}/$'AND item->>'canonical_url'!~'[[:space:][:cntrl:]]'
    AND item->>'raw_item_sha256'~'^[0-9a-f]{64}$'AND item->>'published_at'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$');
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'published_at',value->>'canonical_url'),'[]'::jsonb)INTO items FROM jsonb_array_elements(p_result->'items');
  PERFORM rtn_private.archive_require((SELECT count(DISTINCT x->>'canonical_url')FROM jsonb_array_elements(items)x)=jsonb_array_length(items));
  digest:=rtn_private.archive_hash((p_result-'items')||jsonb_build_object('items',items));
 ELSE
  PERFORM rtn_private.archive_require(p_result-ARRAY['status','error_code']='{}'::jsonb AND p_result->>'status'='error'
   AND p_result->>'error_code'IN('RTN_ARCHIVE_ORIGINAL_READ_FAILED','RTN_ARCHIVE_ORIGINAL_HASH_CONFLICT','RTN_ARCHIVE_ORIGINAL_PARSE_FAILED','RTN_ARCHIVE_ANCHOR_HISTORY_LIMIT'));
 END IF;
 SELECT * INTO old FROM rtn_private.news_rss_anchor_observations WHERE rss_run_id=p_rss_run_id;
 IF FOUND THEN
  IF digest IS NULL OR old.observation_sha256 IS DISTINCT FROM digest THEN RAISE EXCEPTION 'RTN_ARCHIVE_ANCHOR_REPLAY_CONFLICT' USING ERRCODE='40001';END IF;
  RETURN jsonb_build_object('status',old.result_kind,'replayed',true,'gap_created',old.result_kind='potential_gap');
 END IF;
 expected:=rtn_private.archive_anchor_input();
 IF p_rss_run_id IS NULL THEN
  IF expected->>'state'<>'anchor_history_limited'OR p_result->>'error_code'IS DISTINCT FROM'RTN_ARCHIVE_ANCHOR_HISTORY_LIMIT'
  THEN RAISE EXCEPTION 'RTN_ARCHIVE_ANCHOR_INPUT_STALE' USING ERRCODE='40001';END IF;
  UPDATE rtn_private.news_archive_runtime SET anchor_probe_failures=3,anchor_probe_error='RTN_ARCHIVE_ANCHOR_HISTORY_LIMIT'WHERE source_id=1;
  RETURN jsonb_build_object('status','needs_review','replayed',false,'gap_created',false);
 END IF;
 IF expected->>'state'IS DISTINCT FROM'ready'OR expected#>>'{input,rss_run_id}'IS DISTINCT FROM p_rss_run_id::text
 THEN RAISE EXCEPTION 'RTN_ARCHIVE_ANCHOR_INPUT_STALE' USING ERRCODE='40001';END IF;
 IF digest IS NULL THEN
  IF p_result->>'error_code'='RTN_ARCHIVE_ANCHOR_HISTORY_LIMIT'THEN RAISE EXCEPTION 'RTN_ARCHIVE_ANCHOR_INPUT_STALE' USING ERRCODE='40001';END IF;
  UPDATE rtn_private.news_archive_runtime SET anchor_probe_failures=anchor_probe_failures+1,anchor_probe_error=p_result->>'error_code',
   anchor_probe_retry_at=clock_timestamp()+interval'1 hour'WHERE source_id=1;
  RETURN jsonb_build_object('status','probe_error','replayed',false,'gap_created',false);
 END IF;
 SELECT * INTO STRICT run FROM rtn_private.news_check_runs WHERE id=p_rss_run_id;
 PERFORM rtn_private.archive_require(p_result->>'response_sha256'=run.response_sha256 AND(p_result->>'byte_size')::integer=(expected#>>'{input,byte_size}')::integer
  AND jsonb_array_length(items)=run.new_event_count+run.correction_count+run.unchanged_count,'RTN_ARCHIVE_ANCHOR_CAPTURE_MISMATCH');
 FOR item IN SELECT value FROM jsonb_array_elements(items)LOOP
  BEGIN pub:=(item->>'published_at')::timestamptz;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'RTN_ARCHIVE_ANCHOR_DATE_INVALID' USING ERRCODE='22023';END;
  -- Unchanged items deliberately use their older immutable event evidence.
  PERFORM rtn_private.archive_require(EXISTS(SELECT 1 FROM rtn_private.news_item_evidence e JOIN rtn_private.update_events u ON u.id=e.event_id
   WHERE e.raw_item_sha256=item->>'raw_item_sha256'AND u.canonical_url=item->>'canonical_url'AND u.published_at=pub),'RTN_ARCHIVE_ANCHOR_ITEM_EVIDENCE_MISMATCH');
 END LOOP;
 IF jsonb_array_length(items)=0 THEN kind:='empty';
 ELSIF a.last_usable_anchor_run_id IS NULL THEN kind:='baseline';
 ELSE
  SELECT o.items INTO STRICT prior FROM rtn_private.news_rss_anchor_observations o WHERE rss_run_id=a.last_usable_anchor_run_id;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(items)x JOIN jsonb_array_elements(prior)y ON x->>'canonical_url'=y->>'canonical_url')THEN kind:='overlap';
  ELSIF EXISTS(SELECT 1 FROM rtn_private.news_archive_gaps WHERE status IN('queued','running','needs_review'))THEN
   kind:='needs_review';UPDATE rtn_private.news_archive_gaps SET status='needs_review',stop_reason='later_gap',additional_uncertainty=true,lease_expires_at=NULL WHERE status IN('queued','running','needs_review');
  ELSE
   from_day:=((prior->0->>'published_at')::timestamptz AT TIME ZONE'Europe/Moscow')::date;
   until_day:=(run.completed_at AT TIME ZONE'Europe/Moscow')::date;
   PERFORM rtn_private.archive_require(until_day>=from_day,'RTN_ARCHIVE_ANCHOR_CALENDAR_INVALID');
   kind:=CASE WHEN until_day-from_day+1 BETWEEN 1 AND 7 THEN'potential_gap'ELSE'needs_review'END;
  END IF;
 END IF;
 INSERT INTO rtn_private.news_rss_anchor_observations(rss_run_id,response_sha256,rss_completed_at,parser_format,items,observation_sha256,result_kind)
  VALUES(run.id,run.response_sha256,run.completed_at,'rtn-rss-anchor-v1',items,digest,kind);
 IF kind='potential_gap'OR(kind='needs_review'AND prior IS NOT NULL AND NOT EXISTS(SELECT 1 FROM rtn_private.news_archive_gaps WHERE status IN('queued','running','needs_review')))THEN
  INSERT INTO rtn_private.news_archive_gaps(from_anchor_run_id,to_anchor_run_id,target_from_date,target_until_date,status,stop_reason)
   VALUES(a.last_usable_anchor_run_id,run.id,from_day,until_day,CASE WHEN kind='potential_gap'THEN'queued'ELSE'needs_review'END,CASE WHEN kind='needs_review'THEN'calendar_cap'END);
  created:=kind='potential_gap';
 END IF;
 UPDATE rtn_private.news_archive_runtime SET last_processed_rss_run_id=run.id,last_processed_completed_at=run.completed_at,
  baseline_anchor_run_id=CASE WHEN kind='baseline'THEN run.id ELSE baseline_anchor_run_id END,
  last_usable_anchor_run_id=CASE WHEN kind<>'empty'THEN run.id ELSE last_usable_anchor_run_id END,
  anchor_probe_failures=0,anchor_probe_error=NULL,anchor_probe_retry_at=clock_timestamp()WHERE source_id=1;
 RETURN jsonb_build_object('status',kind,'replayed',false,'gap_created',created);
END;$f$;

CREATE FUNCTION rtn_private.archive_publisher_block(p_code text)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE blocked timestamptz;BEGIN
 PERFORM rtn_private.archive_require(p_code IN('RTN_NEWS_HTTP_401','RTN_NEWS_HTTP_403','RTN_NEWS_HTTP_429'));
 UPDATE rtn_private.news_runtime SET publisher_epoch=publisher_epoch+1,
  publisher_blocked_until=greatest(publisher_blocked_until,clock_timestamp()+interval'24 hours'),publisher_error_code=p_code,
  next_due_at=greatest(next_due_at,publisher_blocked_until,clock_timestamp()+interval'24 hours')WHERE source_id=1 RETURNING publisher_blocked_until INTO blocked;
 UPDATE rtn_private.news_sources SET last_checked_at=clock_timestamp(),last_status='blocked',last_error_code=p_code WHERE id=1;
END;$f$;
CREATE FUNCTION rtn_private.archive_pause_reason()RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE n rtn_private.news_runtime%ROWTYPE;BEGIN
 SELECT * INTO STRICT n FROM rtn_private.news_runtime WHERE source_id=1;
 IF(SELECT activation_state FROM rtn_private.news_archive_runtime WHERE source_id=1)<>'active'THEN RETURN'archive_disabled';END IF;
 IF n.publisher_blocked_until>clock_timestamp()THEN RETURN'publisher_blocked';END IF;
 IF n.publisher_verified_epoch IS DISTINCT FROM n.publisher_epoch THEN RETURN'publisher_unverified';END IF;
 IF n.next_due_at<=clock_timestamp()OR EXISTS(SELECT 1 FROM rtn_private.news_check_runs WHERE status IN('queued','running'))THEN RETURN'rss_priority';END IF;
 RETURN NULL;
END;$f$;

-- New-object ACLs only; never broaden old/schema/default privileges.
DO $acl$DECLARE f record;g record;tab record;BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE NOT EXISTS(SELECT 1 FROM rtn_archive_old_functions old WHERE old.oid=p.oid)AND(n.nspname='rtn_private'OR(n.nspname='public'AND p.proname IN(
   'get_rtn_news_archive_anchor_input','record_rtn_news_archive_anchor','claim_rtn_news_archive_gap','authorize_rtn_news_archive_request','complete_rtn_news_archive_request',
   'authorize_rtn_news_rss_get','claim_rtn_news_check_v2','get_rtn_news_archive_state','list_rtn_news_archive_candidates')))LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',f.proowner)))a WHERE a.grantee<>f.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',f.signature,CASE WHEN g.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(g.grantee))END);
  END LOOP;
  IF f.nspname='public'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',f.signature,
   CASE WHEN f.proname IN('get_rtn_news_archive_state','list_rtn_news_archive_candidates')THEN'authenticated'ELSE'service_role'END);END IF;
 END LOOP;
 FOR tab IN SELECT c.oid,c.relowner,c.oid::regclass qualified FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='rtn_private'
  AND c.relname IN('news_archive_runtime','news_rss_anchor_observations','news_archive_gaps','news_publisher_lease_epochs','news_archive_requests','news_archive_captures','news_archive_candidates')LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid=tab.oid),acldefault('r',tab.relowner)))a WHERE a.grantee<>tab.relowner LOOP
   EXECUTE format('REVOKE ALL ON TABLE %s FROM %s',tab.qualified,CASE WHEN g.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(g.grantee))END);
  END LOOP;
 END LOOP;
 IF(SELECT count(*)FROM rtn_archive_expected_patches)<>4 OR EXISTS(SELECT 1 FROM rtn_archive_old_functions old LEFT JOIN pg_proc p ON p.oid=old.oid
  LEFT JOIN rtn_archive_expected_patches patch ON patch.oid=old.oid WHERE p.oid IS NULL OR to_jsonb(p)-'prosrc'IS DISTINCT FROM old.catalog-'prosrc'
   OR(patch.oid IS NULL AND p.prosrc IS DISTINCT FROM old.catalog->>'prosrc')OR(patch.oid IS NOT NULL AND p.prosrc IS DISTINCT FROM patch.body))
 THEN RAISE EXCEPTION 'RTN_ARCHIVE_UNEXPECTED_OLD_FUNCTION_DELTA';END IF;
END;$acl$;
