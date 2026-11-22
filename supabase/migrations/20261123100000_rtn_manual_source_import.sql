-- Legal browser-acquired original intake, separate from automatic HTTP health.
-- No old source check, course, result, key, permission or schedule is rewritten.
CREATE TEMP TABLE rtn_intake_old_functions ON COMMIT DROP AS
 SELECT p.oid,to_jsonb(p)data,CASE WHEN p.oid IN(to_regprocedure('public.get_rtn_workspace(uuid)'),
  to_regprocedure('public.get_rtn_editorial_workspace()'))THEN pg_get_functiondef(p.oid)END definition FROM pg_proc p;
DO $preimage$ DECLARE p pg_proc%ROWTYPE;wanted record;BEGIN
 IF current_user<>'postgres' OR to_regclass('rtn_private.manual_source_intakes')IS NOT NULL
 THEN RAISE EXCEPTION 'RTN_MANUAL_IMPORT_REQUIRES_FRESH_OWNER_INSTALL';END IF;
 FOR wanted IN SELECT * FROM(VALUES
  ('public.get_rtn_workspace(uuid)','8a20a5905c5a6c422c91583ecb26c69f'),
  ('public.get_rtn_editorial_workspace()','3d3308de35e87d456848d3ec8671ad37'))x(signature,body_md5)LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(wanted.signature);
  IF p.oid IS NULL OR md5(p.prosrc)IS DISTINCT FROM wanted.body_md5 OR pg_get_userbyid(p.proowner)<>'postgres'
   OR p.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] OR NOT p.prosecdef OR p.provolatile<>'s'
  THEN RAISE EXCEPTION 'RTN_MANUAL_IMPORT_PREIMAGE_CHANGED:%',wanted.signature;END IF;
 END LOOP;
END;$preimage$;

CREATE TABLE rtn_private.manual_source_intakes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL UNIQUE,
 source_id uuid NOT NULL REFERENCES rtn_private.sources(id),
 source_revision_id uuid NOT NULL REFERENCES rtn_private.source_revisions(id),
 expected_generation integer NOT NULL CHECK(expected_generation>=0),
 accepted_generation integer NOT NULL CHECK(accepted_generation>0),
 sha256 text NOT NULL CHECK(sha256~'^[0-9a-f]{64}$'),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 16777216),
 media_type text NOT NULL CHECK(media_type IN('application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
 original_path text NOT NULL,publication_page_url text NOT NULL,document_url text NOT NULL,
 attestation_version text NOT NULL CHECK(attestation_version='official-current-location-v1'),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[0-9a-f]{64}$'),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE rtn_private.manual_source_intakes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER rtn_manual_source_intake_frozen BEFORE UPDATE OR DELETE ON rtn_private.manual_source_intakes
 FOR EACH ROW EXECUTE FUNCTION rtn_private.reject_mutation();
CREATE TRIGGER rtn_manual_source_intake_no_truncate BEFORE TRUNCATE ON rtn_private.manual_source_intakes
 FOR EACH STATEMENT EXECUTE FUNCTION rtn_private.reject_mutation();

CREATE FUNCTION rtn_private.assert_manual_import_actor(p_actor uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM rtn_private.assert_service();
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor)
  OR NOT public.has_role(p_actor,'admin'::public.app_role)
  OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)
  OR EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor AND blocked_at IS NOT NULL)
  OR NOT coalesce(billing_access_private.actor_allowed(p_actor),false)
 THEN RAISE EXCEPTION 'rtn_manual_import_active_admin_required' USING ERRCODE='42501';END IF;
END;$fn$;

CREATE FUNCTION rtn_private.manual_source_intake_receipt(p_intake uuid,p_replayed boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('intake_id',i.id,'request_id',i.request_id,'source_id',i.source_id,
  'revision_id',i.source_revision_id,'sha256',i.sha256,'byte_size',i.byte_size,'received_at',i.received_at,
  'acquisition_method','admin_upload','replayed',p_replayed,
  'normalization_required',NOT EXISTS(SELECT 1 FROM rtn_private.bank_revisions WHERE source_revision_id=i.source_revision_id),
  'accepted_generation',i.accepted_generation,
  'still_current',s.last_sha256=i.sha256 AND s.source_generation=i.accepted_generation,
  'automatic_verification_advanced',false)
 FROM rtn_private.manual_source_intakes i JOIN rtn_private.sources s ON s.id=i.source_id WHERE i.id=p_intake
$fn$;

CREATE FUNCTION public.finalize_rtn_manual_source_import(p_actor_uid uuid,p_request_id uuid,p_source_id uuid,
 p_expected_generation integer,p_file jsonb,p_provenance jsonb,p_normalized_banks jsonb DEFAULT '[]') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s rtn_private.sources;prior rtn_private.manual_source_intakes;rev rtn_private.source_revisions;
 intake_id uuid:=gen_random_uuid();fingerprint text;file_sha text;file_bytes integer;file_type text;file_path text;
 parser_name text;extension text;page_url text;document_location text;object_meta jsonb;revision_id uuid;
 accepted_generation integer;inserted_id uuid;BEGIN
 PERFORM rtn_private.assert_service();
 IF p_actor_uid IS NULL OR p_request_id IS NULL OR p_source_id IS NULL
  OR p_expected_generation IS NULL OR p_expected_generation<0
 THEN RAISE EXCEPTION 'rtn_manual_import_invalid_request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_uid::text,42007));
 PERFORM rtn_private.assert_manual_import_actor(p_actor_uid);
 IF jsonb_typeof(p_file)IS DISTINCT FROM 'object' OR octet_length(coalesce(p_file,'null')::text)>8192
  OR(SELECT array_agg(key ORDER BY key)FROM jsonb_object_keys(p_file)key)
    IS DISTINCT FROM ARRAY['byte_size','media_type','original_path','original_verified','parser','sha256']::text[]
  OR jsonb_typeof(p_provenance)IS DISTINCT FROM 'object' OR octet_length(coalesce(p_provenance,'null')::text)>16384
  OR(SELECT array_agg(key ORDER BY key)FROM jsonb_object_keys(p_provenance)key)
    IS DISTINCT FROM ARRAY['attestation_version','document_url','publication_page_url']::text[]
  OR p_provenance->>'attestation_version'IS DISTINCT FROM 'official-current-location-v1'
  OR jsonb_typeof(p_normalized_banks)IS DISTINCT FROM 'array' OR octet_length(p_normalized_banks::text)>2000000
  OR p_file->'original_verified'IS DISTINCT FROM 'true'::jsonb
  OR jsonb_typeof(p_file->'sha256')IS DISTINCT FROM 'string' OR p_file->>'sha256'!~'^[0-9a-f]{64}$'
  OR jsonb_typeof(p_file->'byte_size')IS DISTINCT FROM 'number' OR p_file->>'byte_size'!~'^[1-9][0-9]{0,7}$'
 THEN RAISE EXCEPTION 'rtn_manual_import_verified_file_required' USING ERRCODE='22023';END IF;
 file_sha:=p_file->>'sha256';file_bytes:=(p_file->>'byte_size')::integer;
 file_type:=p_file->>'media_type';file_path:=p_file->>'original_path';parser_name:=p_file->>'parser';
 page_url:=p_provenance->>'publication_page_url';document_location:=p_provenance->>'document_url';
 IF file_bytes>16777216 OR NOT rtn_private.official_url(page_url) OR NOT rtn_private.official_url(document_location)
  OR page_url~'[?#[:space:]]' OR document_location~'[?#[:space:]]'
  OR length(page_url)>4000 OR length(document_location)>4000
 THEN RAISE EXCEPTION 'rtn_manual_import_official_provenance_required' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rtn:source:'||p_source_id::text,20261114));
 SELECT * INTO s FROM rtn_private.sources WHERE id=p_source_id FOR UPDATE;
 IF NOT FOUND OR NOT s.active THEN RAISE EXCEPTION 'rtn_manual_import_source_unavailable' USING ERRCODE='22023';END IF;
 -- Revalidate the real actor after waiting, without ever changing auth claims.
 PERFORM rtn_private.assert_manual_import_actor(p_actor_uid);
 extension:=CASE WHEN s.parser='industrial-pdf' THEN 'pdf' ELSE 'xlsx' END;
 IF parser_name IS DISTINCT FROM s.parser
  OR file_type IS DISTINCT FROM(CASE WHEN s.parser='industrial-pdf' THEN 'application/pdf' ELSE 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' END)
  OR file_path IS DISTINCT FROM p_source_id::text||'/'||file_sha||'.'||extension
 THEN RAISE EXCEPTION 'rtn_manual_import_source_file_mismatch' USING ERRCODE='22023';END IF;
 SELECT o.metadata INTO object_meta FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id
  WHERE o.bucket_id='rtn-sources' AND o.name=file_path AND b.public IS FALSE;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_manual_import_private_original_required' USING ERRCODE='22023';END IF;
 IF object_meta?'size' THEN
  IF coalesce(object_meta->>'size','')!~'^[0-9]{1,10}$'
  THEN RAISE EXCEPTION 'rtn_manual_import_private_original_mismatch' USING ERRCODE='22023';END IF;
  IF(object_meta->>'size')::bigint<>file_bytes
  THEN RAISE EXCEPTION 'rtn_manual_import_private_original_mismatch' USING ERRCODE='22023';END IF;
 END IF;
 IF object_meta?'mimetype' AND object_meta->>'mimetype'IS DISTINCT FROM file_type
 THEN RAISE EXCEPTION 'rtn_manual_import_private_original_mismatch' USING ERRCODE='22023';END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('source_id',p_source_id,
  'expected_generation',p_expected_generation,'file',p_file,'provenance',p_provenance,'normalized_banks',p_normalized_banks)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM rtn_private.manual_source_intakes WHERE request_id=p_request_id;
 IF FOUND THEN
  IF prior.request_sha256 IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'rtn_manual_import_request_conflict' USING ERRCODE='40001';END IF;
  RETURN rtn_private.manual_source_intake_receipt(prior.id,true);
 END IF;
 -- No legacy queued/running fetch may later rewind the accepted content pointer.
 -- Both normal enqueue paths serialize on the source row or old advisory lock.
 IF EXISTS(SELECT 1 FROM rtn_private.check_runs WHERE source_id=s.id AND status IN('queued','running'))
 THEN RAISE EXCEPTION 'rtn_manual_import_source_busy' USING ERRCODE='40001';END IF;
 IF s.source_generation<>p_expected_generation THEN RAISE EXCEPTION 'rtn_manual_import_generation_conflict' USING ERRCODE='40001';END IF;
 SELECT * INTO rev FROM rtn_private.source_revisions WHERE source_id=s.id AND sha256=file_sha;
 IF FOUND THEN
  IF s.last_sha256 IS NOT NULL AND s.last_sha256 IS DISTINCT FROM file_sha
  THEN RAISE EXCEPTION 'rtn_manual_import_historical_revision_requires_review' USING ERRCODE='40001';END IF;
  IF rev.original_path IS DISTINCT FROM file_path OR rev.byte_size<>file_bytes OR rev.media_type IS DISTINCT FROM file_type
  THEN RAISE EXCEPTION 'rtn_manual_import_original_conflict' USING ERRCODE='40001';END IF;
  revision_id:=rev.id;
 ELSE
  INSERT INTO rtn_private.source_revisions(source_id,sha256,original_path,media_type,byte_size,document_url,metadata)
   VALUES(s.id,file_sha,file_path,file_type,file_bytes,document_location,jsonb_build_object(
    'acquisition_method','admin_upload','manual_intake_id',intake_id,'attestation_version','official-current-location-v1',
    'source_page_url',page_url,'parser_revision','rtn-manual-intake-v1','dates_require_review',true,
    'official_answer_keys_supplied',false))RETURNING id INTO revision_id;
 END IF;
 accepted_generation:=s.source_generation;
 IF s.last_sha256 IS DISTINCT FROM file_sha THEN
  UPDATE rtn_private.sources SET last_sha256=file_sha,source_generation=source_generation+1 WHERE id=s.id
   RETURNING source_generation INTO accepted_generation;
 END IF;
 -- A repeated original must never replay its old pinned extraction over a
 -- subsequently reviewed normalization correction. Corrections have their own
 -- explicit CAS/note workflow; a new intake reuses that immutable history.
 IF jsonb_array_length(p_normalized_banks)>0
  AND NOT EXISTS(SELECT 1 FROM rtn_private.bank_revisions WHERE source_revision_id=revision_id)
 THEN PERFORM rtn_private.normalize_revision(revision_id,p_normalized_banks);END IF;
 INSERT INTO rtn_private.manual_source_intakes(id,request_id,source_id,source_revision_id,expected_generation,accepted_generation,
  sha256,byte_size,media_type,original_path,publication_page_url,document_url,attestation_version,request_sha256)
 VALUES(intake_id,p_request_id,s.id,revision_id,p_expected_generation,accepted_generation,file_sha,file_bytes,file_type,file_path,
  page_url,document_location,'official-current-location-v1',fingerprint)
 ON CONFLICT(request_id)DO NOTHING RETURNING id INTO inserted_id;
 IF inserted_id IS NULL THEN RAISE EXCEPTION 'rtn_manual_import_request_conflict' USING ERRCODE='40001';END IF;
 RETURN rtn_private.manual_source_intake_receipt(intake_id,false);
END;$fn$;

DO $read_metadata$ DECLARE old record;body text;anchor text;replacement text;BEGIN
 SELECT * INTO STRICT old FROM pg_temp.rtn_intake_old_functions WHERE oid='public.get_rtn_editorial_workspace()'::regprocedure;
 anchor:=E' RETURN jsonb_build_object(\n';
 replacement:=anchor||E'  ''manual_source_import_capability'',jsonb_build_object(''version'',''rtn-manual-intake-v1'',''attestation_version'',''official-current-location-v1'',''max_file_bytes'',16777216),\n';
 IF(length(old.data->>'prosrc')-length(replace(old.data->>'prosrc',anchor,'')))/length(anchor)<>1
 THEN RAISE EXCEPTION 'RTN_MANUAL_IMPORT_CAPABILITY_ANCHOR_CHANGED';END IF;
 body:=replace(old.data->>'prosrc',anchor,replacement);EXECUTE replace(old.definition,old.data->>'prosrc',body);
 SELECT * INTO STRICT old FROM pg_temp.rtn_intake_old_functions WHERE oid='public.get_rtn_workspace(uuid)'::regprocedure;
 anchor:='''last_checked_at'',s.last_checked_at,';
 replacement:='''source_acquisition_method'',CASE WHEN active_sr.id IS NOT NULL THEN CASE WHEN active_sr.metadata->>''acquisition_method''=''admin_upload'' THEN ''admin_upload'' WHEN EXISTS(SELECT 1 FROM rtn_private.check_runs checked WHERE checked.revision_id=active_sr.id AND checked.status IN(''changed'',''unchanged'') AND checked.http_status=200)THEN ''official_http'' ELSE ''unknown'' END ELSE CASE WHEN sr.metadata->>''acquisition_method''=''admin_upload'' THEN ''admin_upload'' WHEN EXISTS(SELECT 1 FROM rtn_private.check_runs checked WHERE checked.revision_id=sr.id AND checked.status IN(''changed'',''unchanged'') AND checked.http_status=200)THEN ''official_http'' ELSE ''unknown'' END END,''source_received_at'',CASE WHEN active_sr.id IS NOT NULL THEN active_sr.captured_at ELSE sr.captured_at END,'||anchor;
 IF(length(old.data->>'prosrc')-length(replace(old.data->>'prosrc',anchor,'')))/length(anchor)<>1
 THEN RAISE EXCEPTION 'RTN_MANUAL_IMPORT_ORIGIN_ANCHOR_CHANGED';END IF;
 body:=replace(old.data->>'prosrc',anchor,replacement);EXECUTE replace(old.definition,old.data->>'prosrc',body);
END;$read_metadata$;

DO $new_acl$ DECLARE r record;g record;BEGIN
 FOR g IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a
  WHERE c.oid='rtn_private.manual_source_intakes'::regclass AND a.grantee<>c.relowner LOOP
  EXECUTE format('REVOKE ALL ON TABLE rtn_private.manual_source_intakes FROM %s',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
 END LOOP;
 FOR r IN SELECT p.oid,p.proowner,p.oid::regprocedure::text signature,p.proname FROM pg_proc p WHERE p.oid IN(
  'rtn_private.assert_manual_import_actor(uuid)'::regprocedure,
  'rtn_private.manual_source_intake_receipt(uuid,boolean)'::regprocedure,
  'public.finalize_rtn_manual_source_import(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb)'::regprocedure)LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=r.oid),acldefault('f',r.proowner)))a WHERE a.grantee<>r.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',r.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
  IF r.proname='finalize_rtn_manual_source_import' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);END IF;
 END LOOP;
END;$new_acl$;
DO $postimage$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.rtn_intake_old_functions old LEFT JOIN pg_proc p ON p.oid=old.oid WHERE p.oid IS NULL OR
  CASE WHEN p.oid IN('public.get_rtn_workspace(uuid)'::regprocedure,'public.get_rtn_editorial_workspace()'::regprocedure)
   THEN to_jsonb(p)-'prosrc'IS DISTINCT FROM old.data-'prosrc' ELSE to_jsonb(p)IS DISTINCT FROM old.data END)
  OR(SELECT count(*)FROM pg_proc)<>(SELECT count(*)+3 FROM pg_temp.rtn_intake_old_functions)
 THEN RAISE EXCEPTION 'RTN_MANUAL_IMPORT_UNEXPECTED_FUNCTION_DELTA';END IF;
END;$postimage$;
