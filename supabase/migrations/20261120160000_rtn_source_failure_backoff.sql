-- Failed bank-source checks must not bypass backoff through the weekly due
-- condition. Only this exact installed scheduler body changes; no worker,
-- manual authority, existing queue row, source original or schedule is changed
-- by this migration. Applying it is a separate owner-reviewed release gate.
CREATE TEMP TABLE rtn_source_retry_old_functions ON COMMIT DROP AS
 SELECT p.oid,to_jsonb(p) AS catalog FROM pg_proc p;
DO $source_retry$ DECLARE p pg_proc%ROWTYPE;body text;definition text;anchor text;replacement text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'RTN_SOURCE_RETRY_REQUIRES_OWNER';END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.enqueue_due_rtn_checks()');
 -- Root's actual SELECT capture20Nov; numericOID651198 belongs to that
 -- database only. CREATE OR REPLACE must preserve the captured OID everywhere.
 IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM '9cdc279471df0cfce5023b20d00faf97'
  OR pg_get_userbyid(p.proowner)<>'postgres' OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}'
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] OR NOT p.prosecdef OR p.provolatile<>'v'
 THEN RAISE EXCEPTION 'RTN_SOURCE_RETRY_PREIMAGE_OR_AUTHORITY_CHANGED';END IF;
 definition:=pg_get_functiondef(p.oid);body:=p.prosrc;
 anchor:='DECLARE s rtn_private.sources;rid uuid;ids jsonb:=''[]'';BEGIN';
 replacement:='DECLARE s rtn_private.sources;rid uuid;ids jsonb:=''[]'';latest record;retry_due boolean;checked_at timestamptz:=clock_timestamp();BEGIN';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1
 THEN RAISE EXCEPTION 'RTN_SOURCE_RETRY_DECLARATION_ANCHOR_CHANGED';END IF;
 body:=replace(body,anchor,replacement);
 anchor:=E'  IF s.last_checked_at IS NULL OR s.last_checked_at<=now()-interval ''1 day''';
 replacement:=E'  -- Completion order, not enqueue/start order: a late finishing older run\n'
  ||E'  -- is the actual latest result. Existing private source_id index narrows\n'
  ||E'  -- this lookup; no new global index or HTTP/claim operation is introduced.\n'
  ||E'  retry_due:=false;\n'
  ||E'  SELECT r.status,r.completed_at,r.error,r.http_status INTO latest FROM rtn_private.check_runs r\n'
  ||E'   WHERE r.source_id=s.id AND r.status IN(''changed'',''unchanged'',''error'') AND r.completed_at IS NOT NULL\n'
  ||E'   ORDER BY r.completed_at DESC,r.id DESC LIMIT 1;\n'
  ||E'  IF FOUND AND latest.status=''error'' THEN\n'
  ||E'   -- The old worker preserves OFFICIAL_HTTP_* in error even when its\n'
  ||E'   -- http_status is NULL. Unknown/redacted errors are not guessed as403.\n'
  ||E'   IF latest.completed_at+(CASE WHEN latest.http_status IN(401,403,429)\n'
  ||E'     OR latest.error IN(''OFFICIAL_HTTP_401'',''OFFICIAL_HTTP_403'',''OFFICIAL_HTTP_429'')\n'
  ||E'     THEN interval ''24 hours'' ELSE interval ''1 hour'' END)>checked_at THEN CONTINUE;END IF;\n'
  ||E'   retry_due:=true;\n'
  ||E'  END IF;\n'
  ||E'  IF retry_due OR s.last_checked_at IS NULL OR s.last_checked_at<=now()-interval ''1 day''';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1
 THEN RAISE EXCEPTION 'RTN_SOURCE_RETRY_DUE_ANCHOR_CHANGED';END IF;
 body:=replace(body,anchor,replacement);
 EXECUTE replace(definition,p.prosrc,body);
 -- No new functions/grants/config or other old body is allowed. The two
 -- existing due/kind expressions, lock order, expiry cleanup, open-run guard,
 -- response shape and service assertion remain byte-for-byte in this body.
 IF EXISTS(SELECT 1 FROM pg_temp.rtn_source_retry_old_functions old LEFT JOIN pg_proc actual ON actual.oid=old.oid
   WHERE actual.oid IS NULL OR CASE WHEN old.oid=p.oid THEN
    old.catalog-'prosrc' IS DISTINCT FROM to_jsonb(actual)-'prosrc' OR actual.prosrc IS DISTINCT FROM body
    ELSE old.catalog IS DISTINCT FROM to_jsonb(actual) END)
  OR(SELECT count(*) FROM pg_proc)<>(SELECT count(*) FROM pg_temp.rtn_source_retry_old_functions)
 THEN RAISE EXCEPTION 'RTN_SOURCE_RETRY_UNEXPECTED_FUNCTION_DELTA';END IF;
END;$source_retry$;
