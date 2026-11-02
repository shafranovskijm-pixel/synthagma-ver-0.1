-- SEPARATE SOURCE CANDIDATE: install disabled. This is not a deployment receipt.
-- Existing Vault secrets, extension ACLs, support history and local polling are
-- untouched. The pg_net queue receives short-lived HMACs, never reusable tokens.
BEGIN;
CREATE TABLE mcp_events_private.runtime_config(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 encryption_secret_id uuid NOT NULL,
 worker_secret_id uuid NOT NULL,
 worker_url text NOT NULL DEFAULT 'https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/support-event-delivery'
  CHECK(worker_url='https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/support-event-delivery'),
 last_wake_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE mcp_events_private.wake_nonces(
 nonce uuid PRIMARY KEY,
 signed_timestamp bigint NOT NULL,
 consumed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE mcp_events_private.runtime_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_events_private.wake_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mcp_events_private.runtime_config,mcp_events_private.wake_nonces FROM PUBLIC,anon,authenticated,service_role;

-- Generate once inside Vault; neither value is returned by this migration.
-- A partial/conflicting old installation fails closed instead of adopting or
-- silently rotating a similarly named secret. The whole transaction rolls back.
DO $$
DECLARE aes_id uuid; worker_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('sintagma-support-events-vault-init-v1',0));
 IF EXISTS(SELECT 1 FROM vault.secrets WHERE name IN('sintagma_support_events_aes_master_v1','sintagma_support_events_worker_hmac_v1')) THEN
   RAISE EXCEPTION 'support_event_runtime_secret_name_conflict' USING ERRCODE='23505';
 END IF;
 aes_id:=vault.create_secret(encode(extensions.gen_random_bytes(32),'base64'),'sintagma_support_events_aes_master_v1','Support MCP Events AES master v1; backend only');
 worker_id:=vault.create_secret(encode(extensions.gen_random_bytes(32),'base64'),'sintagma_support_events_worker_hmac_v1','Support MCP Events wake HMAC key v1; backend only');
 INSERT INTO mcp_events_private.runtime_config(singleton,enabled,encryption_secret_id,worker_secret_id)
 VALUES(true,false,aes_id,worker_id);
END; $$;

CREATE FUNCTION mcp_events_private.require_service_identity()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN
   RAISE EXCEPTION 'support_event_service_identity_required' USING ERRCODE='42501';
 END IF;
END; $$;

-- Backend-only, in-memory configuration. Never expose as an MCP tool/result or
-- log the return value. 'vault-v1' is metadata, NOT the crypto envelope kid.
CREATE FUNCTION public.sintagma_support_event_runtime_config()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c mcp_events_private.runtime_config%ROWTYPE; aes text; worker text;
BEGIN
 PERFORM mcp_events_private.require_service_identity();
 SELECT * INTO STRICT c FROM mcp_events_private.runtime_config WHERE singleton;
 SELECT decrypted_secret INTO aes FROM vault.decrypted_secrets WHERE id=c.encryption_secret_id;
 SELECT decrypted_secret INTO worker FROM vault.decrypted_secrets WHERE id=c.worker_secret_id;
 IF aes IS NULL OR worker IS NULL OR octet_length(decode(aes,'base64'))<>32 OR octet_length(decode(worker,'base64'))<>32 THEN
   RAISE EXCEPTION 'support_event_runtime_key_unavailable' USING ERRCODE='55000';
 END IF;
 RETURN jsonb_build_object('enabled',c.enabled,'encryptionKey',jsonb_build_object('kid','vault-v1','key_base64',aes),'workerToken',worker,'workerUrl',c.worker_url);
END; $$;

CREATE FUNCTION public.sintagma_support_event_runtime_readiness()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c mcp_events_private.runtime_config%ROWTYPE;
BEGIN
 PERFORM mcp_events_private.require_service_identity();
 SELECT * INTO STRICT c FROM mcp_events_private.runtime_config WHERE singleton;
 RETURN jsonb_build_object('enabled',c.enabled,'workerUrl',c.worker_url,'configured',
   EXISTS(SELECT 1 FROM vault.secrets WHERE id=c.encryption_secret_id) AND EXISTS(SELECT 1 FROM vault.secrets WHERE id=c.worker_secret_id));
END; $$;

-- Call ONLY after worker HMAC verification, before claiming jobs. The nonce
-- primary key is a cross-instance replay guard. No nonce is a reusable secret.
CREATE FUNCTION public.sintagma_support_event_consume_wake_nonce(p_nonce uuid,p_timestamp bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE inserted integer; now_seconds bigint:=floor(extract(epoch FROM clock_timestamp()))::bigint;
BEGIN
 PERFORM mcp_events_private.require_service_identity();
 IF p_nonce IS NULL OR p_timestamp IS NULL OR p_timestamp<now_seconds-60 OR p_timestamp>now_seconds+5
    OR NOT EXISTS(SELECT 1 FROM mcp_events_private.runtime_config WHERE singleton AND enabled) THEN RETURN false; END IF;
 INSERT INTO mcp_events_private.wake_nonces(nonce,signed_timestamp) VALUES(p_nonce,p_timestamp) ON CONFLICT(nonce) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 RETURN inserted=1;
END; $$;

CREATE FUNCTION mcp_events_private.wake_worker()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c mcp_events_private.runtime_config%ROWTYPE; worker text; timestamp_text text; nonce_text text; signature text; now_at timestamptz:=clock_timestamp();
BEGIN
 -- Nonblocking: a concurrent source write must not wait on the wake throttle.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('sintagma-support-events-wake-v1',0)) THEN RETURN false; END IF;
 UPDATE mcp_events_private.runtime_config SET last_wake_at=now_at
 WHERE singleton AND enabled AND (last_wake_at IS NULL OR last_wake_at<=now_at-interval '1 second') RETURNING * INTO c;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT decrypted_secret INTO worker FROM vault.decrypted_secrets WHERE id=c.worker_secret_id;
 IF worker IS NULL OR octet_length(decode(worker,'base64'))<>32 THEN RETURN false; END IF;
 timestamp_text:=floor(extract(epoch FROM now_at))::bigint::text;
 nonce_text:=gen_random_uuid()::text;
 signature:=encode(extensions.hmac(convert_to('sintagma-support-events-wake-v1'||chr(10)||timestamp_text||chr(10)||nonce_text,'UTF8'),decode(worker,'base64'),'sha256'),'hex');
 PERFORM net.http_post(url:=c.worker_url,body:='{}'::jsonb,params:='{}'::jsonb,
   headers:=jsonb_build_object('Content-Type','application/json','x-sintagma-events-timestamp',timestamp_text,'x-sintagma-events-nonce',nonce_text,'x-sintagma-events-signature',signature),
   timeout_milliseconds:=5000);
 RETURN true;
EXCEPTION WHEN OTHERS THEN
 -- Transactional outbox remains the source of truth. Extension/queue failure
 -- is best effort; cron retries it without aborting a user's support INSERT.
 RETURN false;
END; $$;

CREATE FUNCTION mcp_events_private.wake_after_jobs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM mcp_new_event_jobs) THEN PERFORM mcp_events_private.wake_worker(); END IF;
 RETURN NULL;
END; $$;
CREATE TRIGGER support_mcp_event_delivery_wake AFTER INSERT ON mcp_events_private.delivery_jobs
 REFERENCING NEW TABLE AS mcp_new_event_jobs FOR EACH STATEMENT EXECUTE FUNCTION mcp_events_private.wake_after_jobs();

CREATE FUNCTION mcp_events_private.cleanup_runtime()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE now_at timestamptz:=clock_timestamp();
BEGIN
 DELETE FROM mcp_events_private.wake_nonces WHERE consumed_at<now_at-interval '120 seconds';
 UPDATE mcp_events_private.subscriptions SET status='expired',generation=generation+1,secret_envelope=NULL,secret_sha256=NULL,
   previous_secret_envelope=NULL,previous_secret_sha256=NULL,previous_valid_until=NULL,updated_at=now_at WHERE status='active' AND expires_at<=now_at;
 UPDATE mcp_events_private.delivery_jobs j SET status='cancelled',fence=fence+1,lease_token=NULL,worker_id=NULL,lease_expires_at=NULL,last_outcome='retention_expired',updated_at=now_at
 FROM mcp_events_private.outbox e WHERE j.event_id=e.id AND j.status IN('pending','leased') AND e.expires_at<=now_at;
 DELETE FROM mcp_events_private.delivery_jobs WHERE status IN('accepted','dead','cancelled') AND updated_at<now_at-interval '7 days';
 DELETE FROM mcp_events_private.outbox e WHERE e.expires_at<=now_at AND NOT EXISTS(SELECT 1 FROM mcp_events_private.delivery_jobs j WHERE j.event_id=e.id);
END; $$;

REVOKE ALL ON FUNCTION mcp_events_private.require_service_identity(),mcp_events_private.wake_worker(),mcp_events_private.wake_after_jobs(),mcp_events_private.cleanup_runtime() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.sintagma_support_event_runtime_config(),public.sintagma_support_event_runtime_readiness(),public.sintagma_support_event_consume_wake_nonce(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sintagma_support_event_runtime_config(),public.sintagma_support_event_runtime_readiness(),public.sintagma_support_event_consume_wake_nonce(uuid,bigint) TO service_role;

-- V2: the live project has named default EXECUTE grants beyond PUBLIC. Normalize
-- only this exact new-object allowlist. Never ALTER ROLE/DEFAULT PRIVILEGES, or
-- change ACLs on existing project functions, extension objects or client tables.
DO $bounded_new_acl$
DECLARE signatures text[]:=ARRAY[
 'public.sintagma_support_event_authorize()',
 'public.sintagma_support_event_identity(uuid,uuid,uuid,text,jsonb,text)',
 'public.sintagma_support_event_subscribe_verified(uuid,uuid,uuid,text,jsonb,text,jsonb,text,integer)',
 'public.sintagma_support_event_unsubscribe(uuid,uuid,uuid,text,jsonb,text)',
 'public.sintagma_support_event_claim(uuid,integer,integer)',
 'public.sintagma_support_event_prepare_delivery(uuid,uuid,bigint)',
 'public.sintagma_support_event_finish_delivery(uuid,uuid,bigint,text,integer)',
 'mcp_events_private.identity_allowed(uuid,uuid,uuid)',
 'mcp_events_private.normalize_arguments(text,jsonb)',
 'mcp_events_private.subscription_id(uuid,uuid,text,jsonb,text)',
 'mcp_events_private.validate_callback_url(text)',
 'mcp_events_private.enqueue_source()',
 'public.sintagma_support_event_runtime_config()',
 'public.sintagma_support_event_runtime_readiness()',
 'public.sintagma_support_event_consume_wake_nonce(uuid,bigint)',
 'mcp_events_private.require_service_identity()',
 'mcp_events_private.wake_worker()',
 'mcp_events_private.wake_after_jobs()',
 'mcp_events_private.cleanup_runtime()'];
 tables text[]:=ARRAY['mcp_events_private.subscriptions','mcp_events_private.outbox','mcp_events_private.delivery_jobs','mcp_events_private.runtime_config','mcp_events_private.wake_nonces'];
 signature text; relation_name text; object_oid oid; owner_id oid; a record; grantee_sql text;
BEGIN
 IF cardinality(signatures)<>19 OR cardinality(tables)<>5 THEN RAISE EXCEPTION 'support_event_new_acl_allowlist_invalid'; END IF;
 FOREACH signature IN ARRAY signatures LOOP
   object_oid:=to_regprocedure(signature);
   SELECT proowner INTO owner_id FROM pg_proc WHERE oid=object_oid;
   IF owner_id IS NULL OR pg_get_userbyid(owner_id)<>'postgres' THEN RAISE EXCEPTION 'support_event_new_function_owner_invalid'; END IF;
   FOR a IN SELECT DISTINCT x.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x WHERE p.oid=object_oid AND x.grantee<>p.proowner LOOP
     grantee_sql:=CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;
     EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s',signature,grantee_sql);
   END LOOP;
 END LOOP;
 FOREACH relation_name IN ARRAY tables LOOP
   object_oid:=to_regclass(relation_name);
   SELECT relowner INTO owner_id FROM pg_class WHERE oid=object_oid;
   IF owner_id IS NULL OR pg_get_userbyid(owner_id)<>'postgres' THEN RAISE EXCEPTION 'support_event_new_table_owner_invalid'; END IF;
   FOR a IN SELECT DISTINCT x.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x WHERE c.oid=object_oid AND x.grantee<>c.relowner LOOP
     grantee_sql:=CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;
     EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %s',relation_name,grantee_sql);
   END LOOP;
 END LOOP;
 SELECT nspowner INTO owner_id FROM pg_namespace WHERE nspname='mcp_events_private';
 IF owner_id IS NULL OR pg_get_userbyid(owner_id)<>'postgres' THEN RAISE EXCEPTION 'support_event_new_schema_owner_invalid'; END IF;
 FOR a IN SELECT DISTINCT x.grantee FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.nspname='mcp_events_private' AND x.grantee<>n.nspowner LOOP
   grantee_sql:=CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;
   EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA mcp_events_private FROM %s',grantee_sql);
 END LOOP;
 GRANT EXECUTE ON FUNCTION public.sintagma_support_event_authorize() TO authenticated;
 GRANT EXECUTE ON FUNCTION public.sintagma_support_event_identity(uuid,uuid,uuid,text,jsonb,text),
   public.sintagma_support_event_subscribe_verified(uuid,uuid,uuid,text,jsonb,text,jsonb,text,integer),
   public.sintagma_support_event_unsubscribe(uuid,uuid,uuid,text,jsonb,text),public.sintagma_support_event_claim(uuid,integer,integer),
   public.sintagma_support_event_prepare_delivery(uuid,uuid,bigint),public.sintagma_support_event_finish_delivery(uuid,uuid,bigint,text,integer),
   public.sintagma_support_event_runtime_config(),public.sintagma_support_event_runtime_readiness(),public.sintagma_support_event_consume_wake_nonce(uuid,bigint) TO service_role;
END; $bounded_new_acl$;

-- Only fixed private function calls appear in cron commands. No token/key is
-- embedded in pg_cron metadata or a SQL literal. Wake exits while disabled.
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname IN('sintagma-support-events-wake-v1','sintagma-support-events-cleanup-v1')) THEN
   RAISE EXCEPTION 'support_event_runtime_cron_name_conflict' USING ERRCODE='23505';
 END IF;
 PERFORM cron.schedule('sintagma-support-events-wake-v1','* * * * *','SELECT mcp_events_private.wake_worker();');
 PERFORM cron.schedule('sintagma-support-events-cleanup-v1','37 3 * * *','SELECT mcp_events_private.cleanup_runtime();');
END; $$;
COMMIT;
