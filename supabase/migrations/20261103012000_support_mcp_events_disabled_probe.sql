-- SOURCE CANDIDATE ONLY: add a one-shot diagnostic channel while delivery is disabled.
-- No old routine/config/key/cron rewrite. No JWT or reusable key enters pg_net.
BEGIN;
DO $probe_preflight$
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'support_event_probe_requires_postgres'; END IF;
 IF to_regprocedure('mcp_events_private.require_service_identity()') IS NULL
    OR to_regclass('mcp_events_private.runtime_config') IS NULL
    OR to_regclass('mcp_events_private.wake_nonces') IS NULL THEN
   RAISE EXCEPTION 'support_event_probe_runtime_missing';
 END IF;
 IF to_regprocedure('public.sintagma_support_event_consume_probe_nonce(uuid,bigint)') IS NOT NULL
    OR to_regprocedure('mcp_events_private.queue_runtime_probe()') IS NOT NULL THEN
   RAISE EXCEPTION 'support_event_probe_already_installed';
 END IF;
END; $probe_preflight$;

-- Call after the HTTP worker has verified the distinct probe-purpose HMAC.
CREATE FUNCTION public.sintagma_support_event_consume_probe_nonce(p_nonce uuid,p_timestamp bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $consume_probe$
DECLARE inserted_rows integer; now_seconds bigint:=floor(extract(epoch FROM clock_timestamp()))::bigint;
BEGIN
 PERFORM mcp_events_private.require_service_identity();
 IF p_nonce IS NULL OR p_timestamp IS NULL OR p_timestamp<now_seconds-60 OR p_timestamp>now_seconds+5 THEN RETURN false; END IF;
 -- Hold the disabled-state row through the atomic nonce insert. No config field changes.
 PERFORM 1 FROM mcp_events_private.runtime_config WHERE singleton AND NOT enabled FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO mcp_events_private.wake_nonces(nonce,signed_timestamp)
 VALUES(p_nonce,p_timestamp) ON CONFLICT(nonce) DO NOTHING;
 GET DIAGNOSTICS inserted_rows=ROW_COUNT;
 RETURN inserted_rows=1;
END; $consume_probe$;

-- Owner-only: the caller chooses neither destination, purpose, body nor headers.
CREATE FUNCTION mcp_events_private.queue_runtime_probe()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $queue_probe$
DECLARE runtime_row mcp_events_private.runtime_config%ROWTYPE; worker_key text;
 timestamp_text text; nonce_text text; signature_text text; queued_request_id bigint;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('sintagma-support-events-probe-v1',0)) THEN
   RAISE EXCEPTION 'support_event_probe_in_progress' USING ERRCODE='55000';
 END IF;
 SELECT * INTO runtime_row FROM mcp_events_private.runtime_config WHERE singleton AND NOT enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'support_event_probe_requires_disabled' USING ERRCODE='55000'; END IF;
 SELECT decrypted_secret INTO worker_key FROM vault.decrypted_secrets WHERE id=runtime_row.worker_secret_id;
 IF worker_key IS NULL OR octet_length(decode(worker_key,'base64'))<>32 THEN
   RAISE EXCEPTION 'support_event_probe_key_unavailable' USING ERRCODE='55000';
 END IF;
 timestamp_text:=floor(extract(epoch FROM clock_timestamp()))::bigint::text;
 nonce_text:=gen_random_uuid()::text;
 signature_text:=encode(extensions.hmac(
   convert_to('sintagma-support-events-probe-v1'||chr(10)||timestamp_text||chr(10)||nonce_text,'UTF8'),
   decode(worker_key,'base64'),'sha256'),'hex');
 SELECT net.http_post(url:=runtime_row.worker_url||'?probe=pinning',body:='{}'::jsonb,params:='{}'::jsonb,
   headers:=jsonb_build_object('Content-Type','application/json','x-sintagma-events-timestamp',timestamp_text,
     'x-sintagma-events-nonce',nonce_text,'x-sintagma-events-signature',signature_text),
   timeout_milliseconds:=15000) INTO queued_request_id;
 IF queued_request_id IS NULL OR queued_request_id<=0 THEN
   RAISE EXCEPTION 'support_event_probe_queue_unavailable' USING ERRCODE='55000';
 END IF;
 RETURN queued_request_id;
END; $queue_probe$;

-- Existing public default EXECUTE grants may name privileged project roles.
-- Normalize only these two new functions; preserve defaults and all old objects.
DO $probe_new_acl$
DECLARE signature_text text; routine_owner oid; routine_oid oid; grant_row record; grantee_sql text;
BEGIN
 FOREACH signature_text IN ARRAY ARRAY[
   'public.sintagma_support_event_consume_probe_nonce(uuid,bigint)',
   'mcp_events_private.queue_runtime_probe()'] LOOP
   routine_oid:=to_regprocedure(signature_text);
   SELECT proowner INTO routine_owner FROM pg_proc WHERE oid=routine_oid;
   IF routine_owner IS NULL OR pg_get_userbyid(routine_owner)<>'postgres' THEN
     RAISE EXCEPTION 'support_event_probe_new_owner_invalid';
   END IF;
   FOR grant_row IN SELECT DISTINCT acl_item.grantee FROM pg_proc proc_catalog
     CROSS JOIN LATERAL aclexplode(coalesce(proc_catalog.proacl,acldefault('f',proc_catalog.proowner))) acl_item
     WHERE proc_catalog.oid=routine_oid AND acl_item.grantee<>proc_catalog.proowner LOOP
     grantee_sql:=CASE WHEN grant_row.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grant_row.grantee)) END;
     EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s',signature_text,grantee_sql);
   END LOOP;
 END LOOP;
 GRANT EXECUTE ON FUNCTION public.sintagma_support_event_consume_probe_nonce(uuid,bigint) TO service_role;
END; $probe_new_acl$;
COMMIT;
