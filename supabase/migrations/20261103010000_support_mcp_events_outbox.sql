-- SOURCE CANDIDATE ONLY. No HTTP, source backfill, auth rewrites or old ledger replay.
-- Secrets are AES-GCM envelopes made by the trusted HTTP worker. No plaintext
-- signing key or encryption key is ever accepted, decrypted or logged in SQL.
BEGIN;
CREATE SCHEMA mcp_events_private;
REVOKE ALL ON SCHEMA mcp_events_private FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE mcp_events_private.subscriptions(
 id text PRIMARY KEY CHECK(id ~ '^sub_[0-9a-f]{64}$'),
 owner_user_id uuid NOT NULL, oauth_client_id uuid NOT NULL, oauth_session_id uuid NOT NULL,
 event_name text NOT NULL CHECK(event_name IN('support.platform_chat.message.created','support.problem_report.created')),
 arguments jsonb NOT NULL CHECK(jsonb_typeof(arguments)='object'), callback_url text NOT NULL,
 secret_envelope jsonb, secret_sha256 text,
 previous_secret_envelope jsonb, previous_secret_sha256 text, previous_valid_until timestamptz,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','unsubscribed','expired','revoked')),
 generation bigint NOT NULL DEFAULT 1 CHECK(generation>0),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(status<>'active' OR (secret_envelope IS NOT NULL AND secret_sha256 ~ '^[0-9a-f]{64}$'))
);
CREATE TABLE mcp_events_private.outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_kind text NOT NULL CHECK(source_kind IN('platform_chat','problem_report')),
 source_event_id uuid NOT NULL, source_id uuid NOT NULL, message_id uuid,
 organization_id uuid, user_id uuid,
 event_name text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '7 days'),
 UNIQUE(source_kind,source_event_id),
 CHECK((source_kind='platform_chat' AND event_name='support.platform_chat.message.created' AND message_id IS NOT NULL AND message_id=source_event_id)
    OR(source_kind='problem_report' AND event_name='support.problem_report.created' AND message_id IS NULL AND source_id=source_event_id))
);
CREATE TABLE mcp_events_private.delivery_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subscription_id text NOT NULL REFERENCES mcp_events_private.subscriptions(id),
 event_id uuid NOT NULL REFERENCES mcp_events_private.outbox(id), generation bigint NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','leased','accepted','dead','cancelled')),
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(), attempt_no integer NOT NULL DEFAULT 0 CHECK(attempt_no BETWEEN 0 AND 8),
 fence bigint NOT NULL DEFAULT 0, lease_token uuid, worker_id uuid, lease_expires_at timestamptz,
 http_status integer, last_outcome text, accepted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(subscription_id,event_id)
);
CREATE INDEX support_event_delivery_ready ON mcp_events_private.delivery_jobs(available_at,id) WHERE status IN('pending','leased');
CREATE INDEX support_event_subscription_owner ON mcp_events_private.subscriptions(owner_user_id,oauth_client_id);
ALTER TABLE mcp_events_private.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_events_private.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_events_private.delivery_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA mcp_events_private FROM PUBLIC,anon,authenticated,service_role;

-- Explicit owner parameters for the service worker. Never SET claims or reuse
-- auth.uid()-dependent access checks with an invented administrator identity.
CREATE FUNCTION mcp_events_private.identity_allowed(p_user uuid,p_client uuid,p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT p_user IS NOT NULL AND p_client IS NOT NULL AND p_session IS NOT NULL
  AND public.has_role(p_user,'admin'::public.app_role) IS TRUE
  AND public.is_user_blocked(p_user) IS FALSE
  AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
  AND EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND deleted_at IS NULL AND NOT coalesce(is_anonymous,false)
    AND (banned_until IS NULL OR banned_until<=statement_timestamp()))
  AND EXISTS(SELECT 1 FROM auth.oauth_clients WHERE id=p_client AND deleted_at IS NULL)
  AND EXISTS(SELECT 1 FROM auth.sessions WHERE id=p_session AND user_id=p_user AND oauth_client_id=p_client
    AND (not_after IS NULL OR not_after>statement_timestamp()))
  AND EXISTS(SELECT 1 FROM auth.oauth_consents WHERE user_id=p_user AND client_id=p_client AND revoked_at IS NULL);
$$;
CREATE FUNCTION public.sintagma_support_event_authorize()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j jsonb:=auth.jwt(); u uuid:=auth.uid(); c uuid; s uuid;
BEGIN
 IF u IS NULL OR coalesce(j->>'role','')<>'authenticated'
   OR coalesce(j->>'client_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   OR coalesce(j->>'session_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
   RAISE EXCEPTION 'support_event_oauth_admin_required' USING ERRCODE='42501';
 END IF;
 c:=(j->>'client_id')::uuid; s:=(j->>'session_id')::uuid;
 IF NOT mcp_events_private.identity_allowed(u,c,s) THEN RAISE EXCEPTION 'support_event_oauth_admin_required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('user_id',u,'client_id',c,'session_id',s);
END; $$;

CREATE FUNCTION mcp_events_private.normalize_arguments(p_name text,p_args jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE k text; result jsonb:='{}';
BEGIN
 IF p_name IS NULL OR p_name NOT IN('support.platform_chat.message.created','support.problem_report.created')
    OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' OR p_args-ARRAY['organization_id','user_id']<>'{}'::jsonb THEN
   RAISE EXCEPTION 'invalid_support_event_arguments' USING ERRCODE='22023';
 END IF;
 FOREACH k IN ARRAY ARRAY['organization_id','user_id'] LOOP
   IF p_args ? k THEN
     IF jsonb_typeof(p_args->k) IS DISTINCT FROM 'string' OR p_args->>k !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
       RAISE EXCEPTION 'invalid_support_event_arguments' USING ERRCODE='22023';
     END IF;
     result:=result||jsonb_build_object(k,(p_args->>k)::uuid::text);
   END IF;
 END LOOP;
 RETURN result;
END; $$;
CREATE FUNCTION mcp_events_private.subscription_id(p_user uuid,p_client uuid,p_name text,p_args jsonb,p_url text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT 'sub_'||encode(sha256(convert_to(jsonb_build_array(p_user::text,p_client::text,p_name,p_args,p_url)::text,'UTF8')),'hex');
$$;
CREATE FUNCTION mcp_events_private.validate_callback_url(p_url text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p_url IS NULL OR octet_length(p_url)>2048 OR p_url !~ '^https://[^/?#]+'
    OR p_url ~ '[[:space:]#]' OR split_part(split_part(substr(p_url,9),'/',1),'?',1) ~ '@' THEN
   RAISE EXCEPTION 'invalid_callback_url' USING ERRCODE='22023';
 END IF;
END; $$;
-- Read-only pre-verification identity. The trusted transport needs the actual
-- deterministic subscription ID in the callback challenge before persisting it.
CREATE FUNCTION public.sintagma_support_event_identity(
 p_user_id uuid,p_client_id uuid,p_session_id uuid,p_name text,p_arguments jsonb,p_callback_url text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE args jsonb;
BEGIN
 IF NOT mcp_events_private.identity_allowed(p_user_id,p_client_id,p_session_id) THEN RAISE EXCEPTION 'support_event_oauth_admin_required' USING ERRCODE='42501'; END IF;
 args:=mcp_events_private.normalize_arguments(p_name,p_arguments);
 PERFORM mcp_events_private.validate_callback_url(p_callback_url);
 RETURN mcp_events_private.subscription_id(p_user_id,p_client_id,p_name,args,p_callback_url);
END; $$;

CREATE FUNCTION public.sintagma_support_event_subscribe_verified(
 p_user_id uuid,p_client_id uuid,p_session_id uuid,p_name text,p_arguments jsonb,p_callback_url text,
 p_secret_envelope jsonb,p_secret_sha256 text,p_ttl_seconds integer DEFAULT 86400)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE args jsonb; sid text; previous mcp_events_private.subscriptions%ROWTYPE; fresh_until timestamptz;
 rotate boolean; change_identity boolean; next_generation bigint; now_at timestamptz:=clock_timestamp(); iv bytea; ciphertext bytea;
BEGIN
 IF NOT mcp_events_private.identity_allowed(p_user_id,p_client_id,p_session_id) THEN RAISE EXCEPTION 'support_event_oauth_admin_required' USING ERRCODE='42501'; END IF;
 args:=mcp_events_private.normalize_arguments(p_name,p_arguments);
 PERFORM mcp_events_private.validate_callback_url(p_callback_url);
 IF p_secret_envelope IS NULL OR jsonb_typeof(p_secret_envelope)<>'object'
    OR p_secret_envelope-ARRAY['v','kid','iv','ciphertext']<>'{}'::jsonb
    OR p_secret_envelope->'v' IS DISTINCT FROM '1'::jsonb
    OR coalesce(p_secret_envelope->>'kid','') !~ '^[a-zA-Z0-9_-]{1,80}$'
    OR jsonb_typeof(p_secret_envelope->'iv') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_secret_envelope->'ciphertext') IS DISTINCT FROM 'string'
    OR coalesce(p_secret_sha256,'') !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION 'invalid_secret_envelope' USING ERRCODE='22023';
 END IF;
 BEGIN
   iv:=decode(p_secret_envelope->>'iv','base64'); ciphertext:=decode(p_secret_envelope->>'ciphertext','base64');
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_secret_envelope' USING ERRCODE='22023'; END;
 IF octet_length(iv)<>12 OR octet_length(ciphertext) NOT BETWEEN 40 AND 256 THEN RAISE EXCEPTION 'invalid_secret_envelope' USING ERRCODE='22023'; END IF;
 sid:=mcp_events_private.subscription_id(p_user_id,p_client_id,p_name,args,p_callback_url);
 fresh_until:=now_at+make_interval(secs=>greatest(60,least(coalesce(p_ttl_seconds,86400),86400)));
 SELECT least(fresh_until,coalesce(not_after,fresh_until)) INTO fresh_until FROM auth.sessions WHERE id=p_session_id;
 IF fresh_until IS NULL OR fresh_until<=now_at THEN RAISE EXCEPTION 'support_event_oauth_admin_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('support-event-sub:'||sid,0));
 SELECT * INTO previous FROM mcp_events_private.subscriptions WHERE id=sid FOR UPDATE;
 IF FOUND THEN
   IF previous.owner_user_id<>p_user_id OR previous.oauth_client_id<>p_client_id OR previous.event_name<>p_name
      OR previous.arguments<>args OR previous.callback_url<>p_callback_url THEN RAISE EXCEPTION 'subscription_identity_conflict' USING ERRCODE='23514'; END IF;
   rotate:=previous.secret_sha256 IS DISTINCT FROM p_secret_sha256;
   change_identity:=rotate OR previous.oauth_session_id<>p_session_id OR previous.status<>'active';
   next_generation:=previous.generation+CASE WHEN change_identity THEN 1 ELSE 0 END;
   UPDATE mcp_events_private.subscriptions SET oauth_session_id=p_session_id,secret_envelope=p_secret_envelope,secret_sha256=p_secret_sha256,
      previous_secret_envelope=CASE WHEN rotate AND previous.status='active' THEN previous.secret_envelope WHEN previous.previous_valid_until>now_at THEN previous.previous_secret_envelope ELSE NULL END,
      previous_secret_sha256=CASE WHEN rotate AND previous.status='active' THEN previous.secret_sha256 WHEN previous.previous_valid_until>now_at THEN previous.previous_secret_sha256 ELSE NULL END,
      previous_valid_until=CASE WHEN rotate AND previous.status='active' THEN now_at+interval '120 seconds' WHEN previous.previous_valid_until>now_at THEN previous.previous_valid_until ELSE NULL END,
      status='active',generation=next_generation,verified_at=now_at,expires_at=fresh_until,updated_at=now_at WHERE id=sid;
   IF change_identity THEN
     -- Invalidate already-claimed generations, preserving the event IDs and
     -- bounded attempt counter for a new claim using current signing material.
     UPDATE mcp_events_private.delivery_jobs SET generation=next_generation,status='pending',fence=fence+1,
       lease_token=NULL,worker_id=NULL,lease_expires_at=NULL,available_at=now_at,updated_at=now_at
       WHERE subscription_id=sid AND status IN('pending','leased') AND attempt_no<8;
   END IF;
 ELSE
   INSERT INTO mcp_events_private.subscriptions(id,owner_user_id,oauth_client_id,oauth_session_id,event_name,arguments,callback_url,
     secret_envelope,secret_sha256,expires_at,verified_at,created_at,updated_at)
   VALUES(sid,p_user_id,p_client_id,p_session_id,p_name,args,p_callback_url,p_secret_envelope,p_secret_sha256,fresh_until,now_at,now_at,now_at);
 END IF;
 RETURN jsonb_build_object('id',sid,'refreshBefore',fresh_until,'cursor',NULL,'truncated',false);
END; $$;

CREATE FUNCTION public.sintagma_support_event_unsubscribe(p_user_id uuid,p_client_id uuid,p_session_id uuid,p_name text,p_arguments jsonb,p_callback_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE args jsonb; sid text;
BEGIN
 IF NOT mcp_events_private.identity_allowed(p_user_id,p_client_id,p_session_id) THEN RAISE EXCEPTION 'support_event_oauth_admin_required' USING ERRCODE='42501'; END IF;
 args:=mcp_events_private.normalize_arguments(p_name,p_arguments);
 PERFORM mcp_events_private.validate_callback_url(p_callback_url);
 sid:=mcp_events_private.subscription_id(p_user_id,p_client_id,p_name,args,p_callback_url);
 UPDATE mcp_events_private.subscriptions SET status='unsubscribed',generation=generation+1,secret_envelope=NULL,secret_sha256=NULL,
   previous_secret_envelope=NULL,previous_secret_sha256=NULL,previous_valid_until=NULL,updated_at=clock_timestamp()
   WHERE id=sid AND owner_user_id=p_user_id AND oauth_client_id=p_client_id AND status<>'unsubscribed';
 UPDATE mcp_events_private.delivery_jobs SET status='cancelled',fence=fence+1,lease_token=NULL,lease_expires_at=NULL,last_outcome='unsubscribed',updated_at=clock_timestamp()
   WHERE subscription_id=sid AND status IN('pending','leased');
 RETURN jsonb_build_object('id',sid,'unsubscribed',true);
END; $$;

CREATE FUNCTION mcp_events_private.enqueue_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e mcp_events_private.outbox%ROWTYPE; c public.support_conversations%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='support_messages' THEN
   IF NEW.role IS DISTINCT FROM 'user' THEN RETURN NEW; END IF;
   SELECT * INTO c FROM public.support_conversations WHERE id=NEW.conversation_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'support_conversation_missing' USING ERRCODE='23503'; END IF;
   INSERT INTO mcp_events_private.outbox(source_kind,source_event_id,source_id,message_id,organization_id,user_id,event_name)
   VALUES('platform_chat',NEW.id,NEW.conversation_id,NEW.id,c.organization_id,c.user_id,'support.platform_chat.message.created')
   ON CONFLICT(source_kind,source_event_id) DO NOTHING RETURNING * INTO e;
 ELSE
   INSERT INTO mcp_events_private.outbox(source_kind,source_event_id,source_id,organization_id,user_id,event_name)
   VALUES('problem_report',NEW.id,NEW.id,NEW.organization_id,NEW.user_id,'support.problem_report.created')
   ON CONFLICT(source_kind,source_event_id) DO NOTHING RETURNING * INTO e;
 END IF;
 IF e.id IS NULL THEN RETURN NEW; END IF;
 INSERT INTO mcp_events_private.delivery_jobs(subscription_id,event_id,generation)
 SELECT s.id,e.id,s.generation FROM mcp_events_private.subscriptions s
 WHERE s.status='active' AND s.expires_at>clock_timestamp() AND s.event_name=e.event_name
   AND (NOT s.arguments?'organization_id' OR (s.arguments->>'organization_id')::uuid=e.organization_id)
   AND (NOT s.arguments?'user_id' OR (s.arguments->>'user_id')::uuid=e.user_id)
   AND mcp_events_private.identity_allowed(s.owner_user_id,s.oauth_client_id,s.oauth_session_id)
 FOR SHARE OF s
 ON CONFLICT(subscription_id,event_id) DO NOTHING;
 RETURN NEW;
END; $$;
CREATE TRIGGER support_mcp_event_message_insert AFTER INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION mcp_events_private.enqueue_source();
CREATE TRIGGER support_mcp_event_problem_insert AFTER INSERT ON public.support_requests FOR EACH ROW EXECUTE FUNCTION mcp_events_private.enqueue_source();

CREATE FUNCTION public.sintagma_support_event_claim(p_worker_id uuid,p_limit integer DEFAULT 10,p_lease_seconds integer DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE now_at timestamptz:=clock_timestamp(); result jsonb;
BEGIN
 IF p_worker_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 15 AND 120 THEN
   RAISE EXCEPTION 'invalid_event_claim' USING ERRCODE='22023';
 END IF;
 UPDATE mcp_events_private.subscriptions s SET status=CASE WHEN s.expires_at<=now_at THEN 'expired' ELSE 'revoked' END,
   secret_envelope=NULL,secret_sha256=NULL,previous_secret_envelope=NULL,previous_secret_sha256=NULL,previous_valid_until=NULL,generation=generation+1,updated_at=now_at
 WHERE s.status='active' AND (s.expires_at<=now_at OR NOT mcp_events_private.identity_allowed(s.owner_user_id,s.oauth_client_id,s.oauth_session_id));
 UPDATE mcp_events_private.delivery_jobs j SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,fence=fence+1,last_outcome='inactive_subscription',updated_at=now_at
 FROM mcp_events_private.subscriptions s,mcp_events_private.outbox e WHERE j.subscription_id=s.id AND j.event_id=e.id AND j.status IN('pending','leased')
   AND (s.status<>'active' OR s.expires_at<=now_at OR e.expires_at<=now_at OR j.generation<>s.generation);
 UPDATE mcp_events_private.delivery_jobs SET status='dead',lease_token=NULL,lease_expires_at=NULL,last_outcome='attempts_exhausted',updated_at=now_at
 WHERE status IN('pending','leased') AND attempt_no>=8 AND (lease_expires_at IS NULL OR lease_expires_at<=now_at);
 WITH picked AS(
   SELECT j.id FROM mcp_events_private.delivery_jobs j JOIN mcp_events_private.subscriptions s ON s.id=j.subscription_id JOIN mcp_events_private.outbox e ON e.id=j.event_id
   WHERE j.attempt_no<8 AND j.available_at<=now_at AND (j.status='pending' OR (j.status='leased' AND j.lease_expires_at<=now_at))
     AND s.status='active' AND s.expires_at>now_at AND e.expires_at>now_at AND j.generation=s.generation
   ORDER BY j.available_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT p_limit
 ), claimed AS(
   UPDATE mcp_events_private.delivery_jobs j SET status='leased',attempt_no=j.attempt_no+1,fence=j.fence+1,
     lease_token=gen_random_uuid(),worker_id=p_worker_id,lease_expires_at=now_at+make_interval(secs=>p_lease_seconds),updated_at=now_at
   FROM picked WHERE j.id=picked.id RETURNING j.id,j.lease_token,j.fence,j.attempt_no,j.lease_expires_at
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('job_id',id,'lease_token',lease_token,'fence',fence,'attempt_no',attempt_no,'lease_expires_at',lease_expires_at)),'[]'::jsonb) INTO result FROM claimed;
 RETURN result;
END; $$;

CREATE FUNCTION public.sintagma_support_event_prepare_delivery(p_job_id uuid,p_lease_token uuid,p_fence bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j mcp_events_private.delivery_jobs%ROWTYPE; s mcp_events_private.subscriptions%ROWTYPE; e mcp_events_private.outbox%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO j FROM mcp_events_private.delivery_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'leased' OR j.lease_token IS DISTINCT FROM p_lease_token OR j.fence IS DISTINCT FROM p_fence OR j.lease_expires_at<=now_at THEN RETURN NULL; END IF;
 SELECT * INTO s FROM mcp_events_private.subscriptions WHERE id=j.subscription_id;
 SELECT * INTO e FROM mcp_events_private.outbox WHERE id=j.event_id;
 IF s.status<>'active' OR s.expires_at<=now_at OR e.expires_at<=now_at OR j.generation<>s.generation
    OR NOT mcp_events_private.identity_allowed(s.owner_user_id,s.oauth_client_id,s.oauth_session_id) THEN
   UPDATE mcp_events_private.delivery_jobs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,fence=fence+1,last_outcome='authorization_or_expiry',updated_at=now_at WHERE id=j.id;
   RETURN NULL;
 END IF;
 RETURN jsonb_build_object('job_id',j.id,'subscription_id',s.id,'owner_user_id',s.owner_user_id,'oauth_client_id',s.oauth_client_id,
   'callback_url',s.callback_url,'event_name',s.event_name,'secret_envelope',s.secret_envelope,
   'previous_secret_envelope',CASE WHEN s.previous_valid_until>now_at THEN s.previous_secret_envelope ELSE NULL END,
   'previous_valid_until',CASE WHEN s.previous_valid_until>now_at THEN s.previous_valid_until ELSE NULL END,
   'event',jsonb_build_object('eventId','evt_'||e.id::text,'name',e.event_name,'timestamp',e.occurred_at,'cursor',NULL,
     'data',jsonb_build_object('source_kind',e.source_kind,'source_id',e.source_id,'message_id',e.message_id,'organization_id',e.organization_id)));
END; $$;

CREATE FUNCTION public.sintagma_support_event_finish_delivery(p_job_id uuid,p_lease_token uuid,p_fence bigint,p_outcome text,p_http_status integer DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j mcp_events_private.delivery_jobs%ROWTYPE; s mcp_events_private.subscriptions%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN('accepted','retry','gone','too_large','permanent')
   OR (p_outcome='accepted' AND (p_http_status IS NULL OR p_http_status NOT BETWEEN 200 AND 299))
   OR (p_outcome='gone' AND p_http_status IS DISTINCT FROM 410)
   OR (p_outcome='too_large' AND p_http_status IS DISTINCT FROM 413)
   OR (p_outcome='retry' AND p_http_status IS NOT NULL AND p_http_status NOT IN(408,425,429) AND p_http_status NOT BETWEEN 500 AND 599)
   OR (p_outcome='permanent' AND p_http_status IS NOT NULL AND (p_http_status NOT BETWEEN 300 AND 499 OR p_http_status IN(408,410,413,425,429))) THEN
   RAISE EXCEPTION 'invalid_event_outcome' USING ERRCODE='22023';
 END IF;
 -- Subscription -> job is the same lock order as refresh/unsubscribe. The gone
 -- branch must never hold a job and then wait for the subscription in reverse.
 SELECT * INTO s FROM mcp_events_private.subscriptions
   WHERE id=(SELECT subscription_id FROM mcp_events_private.delivery_jobs WHERE id=p_job_id) FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO j FROM mcp_events_private.delivery_jobs WHERE id=p_job_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'leased' OR j.lease_token IS DISTINCT FROM p_lease_token OR j.fence IS DISTINCT FROM p_fence OR j.lease_expires_at<=now_at THEN RETURN false; END IF;
 IF s.status<>'active' OR s.expires_at<=now_at OR j.generation<>s.generation
    OR NOT EXISTS(SELECT 1 FROM mcp_events_private.outbox WHERE id=j.event_id AND expires_at>now_at)
    OR NOT mcp_events_private.identity_allowed(s.owner_user_id,s.oauth_client_id,s.oauth_session_id) THEN
   UPDATE mcp_events_private.delivery_jobs SET status='cancelled',last_outcome='authorization_or_expiry',lease_token=NULL,lease_expires_at=NULL,fence=fence+1,updated_at=now_at WHERE id=j.id;
   RETURN false;
 END IF;
 IF p_outcome='gone' THEN
   UPDATE mcp_events_private.subscriptions SET status='unsubscribed',generation=generation+1,secret_envelope=NULL,secret_sha256=NULL,
     previous_secret_envelope=NULL,previous_secret_sha256=NULL,previous_valid_until=NULL,updated_at=now_at WHERE id=s.id;
   UPDATE mcp_events_private.delivery_jobs SET status='cancelled',last_outcome='gone',http_status=410,lease_token=NULL,lease_expires_at=NULL,fence=fence+1,updated_at=now_at WHERE subscription_id=s.id AND status IN('pending','leased');
 ELSE
   UPDATE mcp_events_private.delivery_jobs SET status=CASE WHEN p_outcome='accepted' THEN 'accepted' WHEN p_outcome='retry' AND attempt_no<8 THEN 'pending' ELSE 'dead' END,
     last_outcome=p_outcome,http_status=p_http_status,accepted_at=CASE WHEN p_outcome='accepted' THEN now_at ELSE NULL END,
     available_at=CASE WHEN p_outcome='retry' THEN now_at+make_interval(secs=>least(3600,5*power(2,greatest(attempt_no-1,0)))::integer) ELSE available_at END,
     lease_token=NULL,lease_expires_at=NULL,worker_id=NULL,updated_at=now_at WHERE id=j.id;
 END IF;
 RETURN true;
END; $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mcp_events_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.sintagma_support_event_authorize() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sintagma_support_event_authorize() TO authenticated;
REVOKE ALL ON FUNCTION public.sintagma_support_event_identity(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sintagma_support_event_subscribe_verified(uuid,uuid,uuid,text,jsonb,text,jsonb,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sintagma_support_event_unsubscribe(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sintagma_support_event_claim(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sintagma_support_event_prepare_delivery(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sintagma_support_event_finish_delivery(uuid,uuid,bigint,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sintagma_support_event_identity(uuid,uuid,uuid,text,jsonb,text),
 public.sintagma_support_event_subscribe_verified(uuid,uuid,uuid,text,jsonb,text,jsonb,text,integer),
 public.sintagma_support_event_unsubscribe(uuid,uuid,uuid,text,jsonb,text),public.sintagma_support_event_claim(uuid,integer,integer),
 public.sintagma_support_event_prepare_delivery(uuid,uuid,bigint),public.sintagma_support_event_finish_delivery(uuid,uuid,bigint,text,integer) TO service_role;
COMMIT;
