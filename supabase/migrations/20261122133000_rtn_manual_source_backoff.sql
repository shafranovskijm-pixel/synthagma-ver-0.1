-- The manual bank-source entrypoint must respect the same publisher denial
-- deadline as the installed scheduler. No run/source/lease/schedule is changed.
-- A denied request returns the existing terminal receipt, which the unchanged
-- HTTP handler returns before claim_rtn_check or any official GET.
CREATE TEMP TABLE rtn_manual_retry_old_functions ON COMMIT DROP AS
 SELECT p.oid,to_jsonb(p) AS catalog,CASE WHEN p.oid IN(
  to_regprocedure('public.request_rtn_source_check(uuid,uuid)'),
  to_regprocedure('public.get_rtn_workspace(uuid)')) THEN pg_get_functiondef(p.oid) END AS definition
 FROM pg_proc p;
DO $manual_retry_preimage$ DECLARE p pg_proc%ROWTYPE;BEGIN
 IF current_user<>'postgres' OR to_regprocedure('rtn_private.source_retry_after(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'RTN_MANUAL_RETRY_REQUIRES_FRESH_OWNER_INSTALL';END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.request_rtn_source_check(uuid,uuid)');
 IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM '037dfd60274a288af498e9501a5f0e91'
  OR pg_get_userbyid(p.proowner)<>'postgres' OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] OR NOT p.prosecdef OR p.provolatile<>'v'
 THEN RAISE EXCEPTION 'RTN_MANUAL_RETRY_REQUEST_PREIMAGE_OR_AUTHORITY_CHANGED';END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.get_rtn_workspace(uuid)');
 IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM '606b6511c2cfd918dfe77fe6026cb4ee'
  OR pg_get_userbyid(p.proowner)<>'postgres' OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] OR NOT p.prosecdef OR p.provolatile<>'s'
 THEN RAISE EXCEPTION 'RTN_MANUAL_RETRY_WORKSPACE_PREIMAGE_OR_AUTHORITY_CHANGED';END IF;
END;$manual_retry_preimage$;

CREATE FUNCTION rtn_private.source_retry_after(p_source uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT CASE WHEN r.status='error' THEN r.completed_at+
  CASE WHEN r.http_status IN(401,403,429)
   OR r.error IN('OFFICIAL_HTTP_401','OFFICIAL_HTTP_403','OFFICIAL_HTTP_429')
   THEN interval '24 hours' ELSE interval '1 hour' END ELSE NULL END
 FROM rtn_private.check_runs r WHERE r.source_id=p_source
  AND r.status IN('changed','unchanged','error') AND r.completed_at IS NOT NULL
 ORDER BY r.completed_at DESC,r.id DESC LIMIT 1
$fn$;
-- Provider default grants must not expose this private source-history helper.
DO $manual_retry_acl$ DECLARE g record;BEGIN
 FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
  WHERE p.oid='rtn_private.source_retry_after(uuid)'::regprocedure AND a.grantee<>p.proowner LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION rtn_private.source_retry_after(uuid) FROM %s',
   CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
 END LOOP;
END;$manual_retry_acl$;

DO $manual_retry_hooks$ DECLARE old record;body text;anchor text;replacement text;BEGIN
 SELECT * INTO STRICT old FROM pg_temp.rtn_manual_retry_old_functions
  WHERE oid='public.request_rtn_source_check(uuid,uuid)'::regprocedure;
 body:=old.catalog->>'prosrc';
 anchor:='DECLARE r rtn_private.check_runs;BEGIN';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1
 THEN RAISE EXCEPTION 'RTN_MANUAL_RETRY_DECLARATION_ANCHOR_CHANGED';END IF;
 body:=replace(body,anchor,'DECLARE r rtn_private.check_runs;retry_after timestamptz;checked_at timestamptz;BEGIN');
 anchor:=' PERFORM pg_advisory_xact_lock(hashtextextended(''rtn:source:''||p_source_id::text,20261114));';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1
 THEN RAISE EXCEPTION 'RTN_MANUAL_RETRY_LOCK_ANCHOR_CHANGED';END IF;
 replacement:=anchor||E'\n -- Completion updates hold the source row. Read the latest terminal result\n'
  ||E' -- and the wall clock only AFTER waiting for that row/old source lock.\n'
  ||E' PERFORM 1 FROM rtn_private.sources WHERE id=p_source_id FOR UPDATE;\n'
  ||E' retry_after:=rtn_private.source_retry_after(p_source_id);\n'
  ||E' checked_at:=clock_timestamp();\n'
  ||E' IF retry_after>checked_at THEN\n'
  ||E'  SELECT * INTO STRICT r FROM rtn_private.check_runs WHERE source_id=p_source_id\n'
  ||E'   AND status IN(''changed'',''unchanged'',''error'') AND completed_at IS NOT NULL\n'
  ||E'   ORDER BY completed_at DESC,id DESC LIMIT 1;\n'
  ||E'  RETURN jsonb_build_object(''run_id'',r.id,''status'',r.status,''queued_at'',r.queued_at,\n'
  ||E'   ''replayed'',true,''retry_after'',retry_after,''can_manual_check'',false);\n'
  ||E' END IF;';
 body:=replace(body,anchor,replacement);
 EXECUTE replace(old.definition,old.catalog->>'prosrc',body);

 SELECT * INTO STRICT old FROM pg_temp.rtn_manual_retry_old_functions
  WHERE oid='public.get_rtn_workspace(uuid)'::regprocedure;
 body:=old.catalog->>'prosrc';
 anchor:='''can_manual_check'',can_manage AND rtn_private.entitled(p_organization_id,b.id),';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1
 THEN RAISE EXCEPTION 'RTN_MANUAL_RETRY_WORKSPACE_FIELD_ANCHOR_CHANGED';END IF;
 body:=replace(body,anchor,'''next_check_after'',retry.next_check_after,''can_manual_check'',can_manage AND rtn_private.entitled(p_organization_id,b.id) AND coalesce(clock_timestamp()>=retry.next_check_after,true),');
 anchor:=' FROM rtn_private.banks b JOIN rtn_private.sources s ON s.id=b.source_id';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1
 THEN RAISE EXCEPTION 'RTN_MANUAL_RETRY_WORKSPACE_JOIN_ANCHOR_CHANGED';END IF;
 body:=replace(body,anchor,anchor||E'\n LEFT JOIN LATERAL(SELECT rtn_private.source_retry_after(s.id)next_check_after)retry ON true');
 EXECUTE replace(old.definition,old.catalog->>'prosrc',body);
END;$manual_retry_hooks$;

DO $manual_retry_postimage$ DECLARE request_oid oid:='public.request_rtn_source_check(uuid,uuid)'::regprocedure;
 workspace_oid oid:='public.get_rtn_workspace(uuid)'::regprocedure;BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.rtn_manual_retry_old_functions old LEFT JOIN pg_proc p ON p.oid=old.oid
  WHERE p.oid IS NULL OR CASE WHEN p.oid IN(request_oid,workspace_oid) THEN
   to_jsonb(p)-'prosrc' IS DISTINCT FROM old.catalog-'prosrc'
   ELSE to_jsonb(p) IS DISTINCT FROM old.catalog END)
  OR(SELECT count(*) FROM pg_proc)<>(SELECT count(*)+1 FROM pg_temp.rtn_manual_retry_old_functions)
 THEN RAISE EXCEPTION 'RTN_MANUAL_RETRY_UNEXPECTED_FUNCTION_DELTA';END IF;
END;$manual_retry_postimage$;
