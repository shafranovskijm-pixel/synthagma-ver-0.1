-- SOURCE ONLY / SUCCESSOR. NOT PARSED, RUN, APPROVED OR RELEASED.
-- Requires a separately accepted PCR core. Does not replace that core's race fix.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
SET LOCAL search_path=pg_catalog,public,pg_temp;
DO $preflight$
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'PCF_TRUSTED_INSTALLER_REQUIRED';END IF;
 IF to_regprocedure('public.pcr_v2_enter(uuid)') IS NULL
 OR to_regprocedure('public.pcr_v2_manifest(uuid,uuid)') IS NULL
 OR to_regprocedure('public.pcr_v2_blockers(uuid,jsonb)') IS NULL
 OR to_regprocedure('public.pcr_v2_actor(boolean)') IS NULL THEN
  RAISE EXCEPTION 'PCF_ACCEPTED_CORE_REQUIRED';END IF;
 IF to_regclass('public.platform_course_file_intents') IS NOT NULL
 OR to_regclass('public.platform_course_file_receipts') IS NOT NULL
 OR to_regclass('public.platform_course_file_binding_events') IS NOT NULL THEN
  RAISE EXCEPTION 'PCF_PREEXISTING_STORE_REVIEW_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND(p.proname LIKE 'pcf_v1_%' OR p.proname IN('begin_platform_course_file_capture','load_platform_course_file_capture_worker','finish_platform_course_file_capture_worker','read_platform_course_file_receipt'))) THEN
  RAISE EXCEPTION 'PCF_PREEXISTING_FUNCTIONS_REVIEW_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN('public','auth') AND
  (has_schema_privilege('anon',oid,'CREATE') OR has_schema_privilege('authenticated',oid,'CREATE'))) THEN
  RAISE EXCEPTION 'PCF_UNTRUSTED_SCHEMA';END IF;
END;$preflight$;

CREATE TABLE public.platform_course_file_intents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,
 marketplace_id uuid NOT NULL,course_id uuid NOT NULL,
 organization_id uuid NOT NULL CHECK(organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'),
 reference_kind text NOT NULL CHECK(reference_kind IN('course_document','lesson_attachment')),
 reference_id uuid NOT NULL,source_org_version_id uuid,
 scope_generation uuid NOT NULL,reference_snapshot jsonb NOT NULL,
 request_id uuid NOT NULL,selection_sha256 text NOT NULL CHECK(selection_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 UNIQUE(actor_id,marketplace_id,request_id),
 CHECK(jsonb_typeof(reference_snapshot)='object' AND octet_length(reference_snapshot::text)<=32768),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '120 seconds')
);
CREATE TABLE public.platform_course_file_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),intent_id uuid NOT NULL UNIQUE REFERENCES public.platform_course_file_intents(id),
 captured_edition_id uuid NOT NULL UNIQUE,actor_id uuid NOT NULL,course_id uuid NOT NULL,marketplace_id uuid NOT NULL,
 organization_id uuid NOT NULL CHECK(organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'),
 scope_generation uuid NOT NULL,reference_kind text NOT NULL,reference_id uuid NOT NULL,
 reference_snapshot jsonb NOT NULL,file_bytes bytea NOT NULL,
 byte_length integer NOT NULL CHECK(byte_length>0 AND byte_length<=8388608),
 file_sha256 text NOT NULL CHECK(file_sha256~'^[a-f0-9]{64}$'),
 enforcement_sha256 text NOT NULL CHECK(enforcement_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(octet_length(file_bytes)=byte_length AND encode(sha256(file_bytes),'hex')=file_sha256)
);
CREATE TABLE public.platform_course_file_binding_events(
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 receipt_id uuid NOT NULL UNIQUE REFERENCES public.platform_course_file_receipts(id),
 course_id uuid NOT NULL,scope_generation uuid NOT NULL,
 reference_kind text NOT NULL CHECK(reference_kind IN('course_document','lesson_attachment')),
 reference_id uuid NOT NULL,actor_id uuid NOT NULL,
 transaction_id text NOT NULL DEFAULT pg_current_xact_id()::text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX platform_course_file_binding_lookup ON public.platform_course_file_binding_events
 (course_id,scope_generation,reference_kind,reference_id,sequence DESC);
ALTER TABLE public.platform_course_file_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_course_file_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_course_file_binding_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_course_file_intents,public.platform_course_file_receipts,
 public.platform_course_file_binding_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.platform_course_file_binding_events_sequence_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pcf_v1_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN RAISE EXCEPTION 'PCF_APPEND_ONLY_HISTORY' USING ERRCODE='55000';END;$f$;
CREATE TRIGGER pcf_intents_immutable BEFORE UPDATE OR DELETE ON public.platform_course_file_intents
 FOR EACH ROW EXECUTE FUNCTION public.pcf_v1_immutable();
CREATE TRIGGER pcf_intents_no_truncate BEFORE TRUNCATE ON public.platform_course_file_intents
 FOR EACH STATEMENT EXECUTE FUNCTION public.pcf_v1_immutable();
CREATE TRIGGER pcf_receipts_immutable BEFORE UPDATE OR DELETE ON public.platform_course_file_receipts
 FOR EACH ROW EXECUTE FUNCTION public.pcf_v1_immutable();
CREATE TRIGGER pcf_receipts_no_truncate BEFORE TRUNCATE ON public.platform_course_file_receipts
 FOR EACH STATEMENT EXECUTE FUNCTION public.pcf_v1_immutable();
CREATE TRIGGER pcf_bindings_immutable BEFORE UPDATE OR DELETE ON public.platform_course_file_binding_events
 FOR EACH ROW EXECUTE FUNCTION public.pcf_v1_immutable();
CREATE TRIGGER pcf_bindings_no_truncate BEFORE TRUNCATE ON public.platform_course_file_binding_events
 FOR EACH STATEMENT EXECUTE FUNCTION public.pcf_v1_immutable();

-- This is a trusted WORKER actor check, not an impersonated JWT or approval.
CREATE FUNCTION public.pcf_v1_worker_actor(p_actor uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_actor IS NULL THEN
  RAISE EXCEPTION 'PCF_WORKER_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_actor::text,42007)) THEN
  RAISE EXCEPTION 'PCF_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 IF NOT public.has_role('admin'::public.app_role,p_actor)
 OR NOT public.uc_platform_document_action_allowed(p_actor,'write')
 OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor AND blocked_at IS NULL AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'PCF_ACTOR_NO_LONGER_AUTHORIZED' USING ERRCODE='42501';END IF;
END;$f$;

CREATE FUNCTION public.pcf_v1_enforcement_stamp() RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $stamp$
DECLARE v_sig text;v_functions jsonb:='[]';v_tables jsonb;v_fn jsonb;
BEGIN
 FOREACH v_sig IN ARRAY ARRAY[
 'public.pcf_v1_immutable()','public.pcf_v1_worker_actor(uuid)','public.pcf_v1_worker_enter(uuid,uuid,uuid)',
 'public.pcf_v1_decode_key(text)','public.pcf_v1_pointer(text)','public.pcf_v1_reference_identity(uuid,text,uuid,uuid)',
 'public.pcf_v1_reference_snapshot(uuid,text,uuid,uuid)','public.pcf_v1_enforcement_stamp()',
 'public.pcf_v1_receipt_summary(uuid,boolean)','public.pcf_v1_binding_state(uuid,text,uuid)',
 'public.pcf_v1_file_blockers(uuid,jsonb)','public.pcf_v1_file_manifest(uuid)',
 'public.pcf_v1_delivery_capabilities()',
 'public.begin_platform_course_file_capture(uuid,text,uuid,uuid,uuid)',
 'public.load_platform_course_file_capture_worker(uuid,uuid)',
 'public.finish_platform_course_file_capture_worker(uuid,uuid,uuid,text,text,text)',
 'public.read_platform_course_file_receipt(uuid)',
 'public.pcr_v2_manifest(uuid,uuid)','public.pcr_v2_blockers(uuid,jsonb)'] LOOP
  SELECT jsonb_build_object('signature',v_sig,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,
   'path',p.proconfig,'body_sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'acl',p.proacl::text)
  INTO v_fn FROM pg_proc p WHERE p.oid=to_regprocedure(v_sig);
  IF v_fn IS NULL THEN RAISE EXCEPTION 'PCF_ADAPTER_NOT_INSTALLED';END IF;
  v_functions:=v_functions||jsonb_build_array(v_fn);
 END LOOP;
  -- Include the complete installed core barrier/claim family and access helpers.
  -- An accepted deployment stamp must bind their bodies/ACLs, not only this adapter.
  FOR v_sig IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND(p.proname LIKE 'pcr_v2_%' OR p.proname IN(
    'has_role','uc_platform_document_action_allowed','account_deletion_access_allowed',
    'can_access_course','can_access_course_as_learner','can_read_electronic_library_document','can_read_lesson_attachment'))
   ORDER BY p.oid::regprocedure::text LOOP
   SELECT jsonb_build_object('signature',v_sig,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,
    'path',p.proconfig,'body_sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'acl',p.proacl::text)
   INTO v_fn FROM pg_proc p WHERE p.oid=to_regprocedure(v_sig);
   v_functions:=v_functions||jsonb_build_array(v_fn);
  END LOOP;
 SELECT jsonb_agg(jsonb_build_object('table',t.relname,'owner',pg_get_userbyid(t.relowner),'rls',t.relrowsecurity,'acl',t.relacl::text,
  'constraints',(SELECT coalesce(jsonb_agg(pg_get_constraintdef(c.oid) ORDER BY c.conname),'[]') FROM pg_constraint c WHERE c.conrelid=t.oid),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',g.tgname,'enabled',g.tgenabled,'definition',pg_get_triggerdef(g.oid)) ORDER BY g.tgname),'[]') FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal)) ORDER BY t.relname)
 INTO v_tables FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'
 AND t.relname IN('platform_course_file_intents','platform_course_file_receipts','platform_course_file_binding_events',
   'platform_course_publication_scope_revisions','platform_course_publication_library_revisions','platform_course_publication_review_events',
   'courses','course_modules','lessons','test_questions','course_documents','lesson_attachments','library_documents','marketplace_courses');
 RETURN public.pcr_v2_sha(jsonb_build_object('protocol','pcf-bytea/1','max_bytes',8388608,'functions',v_functions,'tables',v_tables));
END;$stamp$;

CREATE FUNCTION public.pcf_v1_receipt_summary(p_receipt uuid,p_replayed boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE r public.platform_course_file_receipts;
BEGIN
 SELECT * INTO r FROM public.platform_course_file_receipts WHERE id=p_receipt;
 IF r.id IS NULL THEN RAISE EXCEPTION 'PCF_RECEIPT_UNAVAILABLE';END IF;
 RETURN jsonb_build_object('receipt_id',r.id,'intent_id',r.intent_id,'course_id',r.course_id,'marketplace_id',r.marketplace_id,
  'reference_kind',r.reference_kind,'reference_id',r.reference_id,'captured_edition_id',r.captured_edition_id,
  'source_org_version_id',r.reference_snapshot->'source_org_version_id','file_bytes_sha256',r.file_sha256,'byte_length',r.byte_length,
  'recorded_at',r.created_at,'state','bytes_sealed','replayed',p_replayed,
  'source_bucket_public_at_capture',r.reference_snapshot->'source_bucket_public',
  'proof_scope','actual_captured_bytes_not_historical_origin_attestation_or_review_approval');
END;$f$;

CREATE FUNCTION public.begin_platform_course_file_capture(p_marketplace_id uuid,p_reference_kind text,p_reference_id uuid,p_source_org_version uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_course uuid;v_actor uuid;v_selection text;v_existing public.platform_course_file_intents;
 v_snapshot jsonb;v_id uuid:=gen_random_uuid();v_now timestamptz:=clock_timestamp();v_receipt uuid;
BEGIN
 v_course:=public.pcr_v2_enter(p_marketplace_id);v_actor:=public.pcr_v2_actor(false);
 IF p_request_id IS NULL OR p_reference_id IS NULL OR p_reference_kind NOT IN('course_document','lesson_attachment') THEN RAISE EXCEPTION 'PCF_REQUEST_INVALID' USING ERRCODE='22023';END IF;
 v_selection:=public.pcr_v2_sha(jsonb_build_object('marketplace_id',p_marketplace_id,'reference_kind',p_reference_kind,'reference_id',p_reference_id,'source_org_version_id',p_source_org_version));
 SELECT * INTO v_existing FROM public.platform_course_file_intents WHERE actor_id=v_actor AND marketplace_id=p_marketplace_id AND request_id=p_request_id;
 IF v_existing.id IS NOT NULL THEN
  IF v_existing.selection_sha256<>v_selection THEN RAISE EXCEPTION 'PCF_REQUEST_CONFLICT' USING ERRCODE='22023';END IF;
  SELECT id INTO v_receipt FROM public.platform_course_file_receipts WHERE intent_id=v_existing.id;
  RETURN jsonb_build_object('intent_id',v_existing.id,'expires_at',v_existing.expires_at,'receipt_id',v_receipt,'replayed',true,'scope','historical_request_not_new_capture_or_approval');
 END IF;
 v_snapshot:=public.pcf_v1_reference_snapshot(v_course,p_reference_kind,p_reference_id,p_source_org_version);
 IF v_snapshot->>'expected_byte_length' IS NOT NULL AND ((v_snapshot->>'expected_byte_length')::bigint<=0 OR (v_snapshot->>'expected_byte_length')::bigint>8388608) THEN
  RAISE EXCEPTION 'PCF_OPERATIONAL_SIZE_LIMIT' USING ERRCODE='22023';END IF;
 INSERT INTO public.platform_course_file_intents(id,actor_id,marketplace_id,course_id,organization_id,reference_kind,reference_id,source_org_version_id,scope_generation,reference_snapshot,request_id,selection_sha256,created_at,expires_at)
 VALUES(v_id,v_actor,p_marketplace_id,v_course,'4ac2c05a-d8b5-4e72-ba31-f2c743091d95',p_reference_kind,p_reference_id,p_source_org_version,
  (v_snapshot->>'scope_generation')::uuid,v_snapshot,p_request_id,v_selection,v_now,v_now+interval '120 seconds');
 RETURN jsonb_build_object('intent_id',v_id,'expires_at',v_now+interval '120 seconds','replayed',false,'state','capture_intent_only_not_verified_or_approved');
END;$f$;

CREATE FUNCTION public.load_platform_course_file_capture_worker(p_intent_id uuid,p_authenticated_user uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE i public.platform_course_file_intents;v_receipt uuid;v_snapshot jsonb;
BEGIN
 PERFORM public.pcf_v1_worker_actor(p_authenticated_user);
 SELECT * INTO i FROM public.platform_course_file_intents WHERE id=p_intent_id;
 IF i.id IS NULL OR i.actor_id IS DISTINCT FROM p_authenticated_user THEN RAISE EXCEPTION 'PCF_INTENT_ACTOR_MISMATCH' USING ERRCODE='42501';END IF;
 PERFORM public.pcf_v1_worker_enter(i.marketplace_id,i.course_id,i.actor_id);
 SELECT id INTO v_receipt FROM public.platform_course_file_receipts WHERE intent_id=i.id;
 IF v_receipt IS NOT NULL THEN RETURN jsonb_build_object('protocol','pcf-bytea/1','completed',true,
  'intent_id',i.id,'actor_id',i.actor_id,'marketplace_id',i.marketplace_id,'reference',i.reference_snapshot,
  'receipt',public.pcf_v1_receipt_summary(v_receipt,true));END IF;
 IF i.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'PCF_CAPTURE_INTENT_EXPIRED' USING ERRCODE='22023';END IF;
 v_snapshot:=public.pcf_v1_reference_snapshot(i.course_id,i.reference_kind,i.reference_id,i.source_org_version_id);
 IF v_snapshot IS DISTINCT FROM i.reference_snapshot THEN RAISE EXCEPTION 'PCF_CAPTURE_SOURCE_CHANGED' USING ERRCODE='40001';END IF;
 RETURN jsonb_build_object('protocol','pcf-bytea/1','completed',false,'intent_id',i.id,'actor_id',i.actor_id,
  'marketplace_id',i.marketplace_id,'expires_at',i.expires_at,'reference',i.reference_snapshot,
  'enforcement_sha256',public.pcf_v1_enforcement_stamp(),'max_bytes',8388608);
END;$f$;

CREATE FUNCTION public.finish_platform_course_file_capture_worker(p_intent_id uuid,p_authenticated_user uuid,p_captured_edition uuid,p_bytes_hex text,p_file_sha256 text,p_capture_enforcement_sha256 text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE i public.platform_course_file_intents;r public.platform_course_file_receipts;v_snapshot jsonb;v_bytes bytea;v_hash text;v_stamp text;v_id uuid:=gen_random_uuid();
BEGIN
 PERFORM public.pcf_v1_worker_actor(p_authenticated_user);
 IF p_captured_edition IS NULL OR p_bytes_hex IS NULL OR length(p_bytes_hex)=0 OR length(p_bytes_hex)>16777216
 OR length(p_bytes_hex)%2<>0 OR p_bytes_hex!~'^[a-f0-9]+$' OR p_file_sha256!~'^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'PCF_BYTES_INVALID' USING ERRCODE='22023';END IF;
 v_bytes:=decode(p_bytes_hex,'hex');v_hash:=encode(sha256(v_bytes),'hex');
 IF v_hash IS DISTINCT FROM p_file_sha256 THEN RAISE EXCEPTION 'PCF_ACTUAL_BYTE_DIGEST_MISMATCH' USING ERRCODE='22023';END IF;
 SELECT * INTO i FROM public.platform_course_file_intents WHERE id=p_intent_id;
 IF i.id IS NULL OR i.actor_id IS DISTINCT FROM p_authenticated_user THEN RAISE EXCEPTION 'PCF_INTENT_ACTOR_MISMATCH' USING ERRCODE='42501';END IF;
 PERFORM public.pcf_v1_worker_enter(i.marketplace_id,i.course_id,i.actor_id);
 SELECT * INTO r FROM public.platform_course_file_receipts WHERE intent_id=i.id;
 IF r.id IS NOT NULL THEN
  IF r.file_sha256<>v_hash OR r.byte_length<>octet_length(v_bytes) THEN RAISE EXCEPTION 'PCF_INTENT_ALREADY_SEALED_DIFFERENT_BYTES' USING ERRCODE='22023';END IF;
  RETURN public.pcf_v1_receipt_summary(r.id,true);
 END IF;
 IF i.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'PCF_CAPTURE_INTENT_EXPIRED' USING ERRCODE='22023';END IF;
 v_stamp:=public.pcf_v1_enforcement_stamp();
 IF v_stamp IS DISTINCT FROM p_capture_enforcement_sha256 THEN RAISE EXCEPTION 'PCF_ENFORCEMENT_CHANGED' USING ERRCODE='40001';END IF;
 v_snapshot:=public.pcf_v1_reference_snapshot(i.course_id,i.reference_kind,i.reference_id,i.source_org_version_id);
 IF v_snapshot IS DISTINCT FROM i.reference_snapshot THEN RAISE EXCEPTION 'PCF_CAPTURE_SOURCE_CHANGED' USING ERRCODE='40001';END IF;
 IF v_snapshot->>'expected_byte_length' IS NOT NULL AND (v_snapshot->>'expected_byte_length')::bigint<>octet_length(v_bytes) THEN RAISE EXCEPTION 'PCF_DECLARED_SIZE_MISMATCH' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.platform_course_publication_review_events e WHERE e.transaction_id=pg_current_xact_id()::text AND e.course_id=i.course_id
 AND(e.event_kind='publication_recorded' OR e.event_kind='review_decided' AND e.review_payload->>'decision'='accepted_for_template_publication')) THEN
  RAISE EXCEPTION 'PCF_MIXED_CLAIM_BINDING_TRANSACTION' USING ERRCODE='40001';END IF;
 PERFORM public.pcr_v2_claim_touch(i.course_id);
 INSERT INTO public.platform_course_file_receipts(id,intent_id,captured_edition_id,actor_id,course_id,marketplace_id,organization_id,scope_generation,reference_kind,reference_id,reference_snapshot,file_bytes,byte_length,file_sha256,enforcement_sha256)
 VALUES(v_id,i.id,p_captured_edition,i.actor_id,i.course_id,i.marketplace_id,i.organization_id,i.scope_generation,i.reference_kind,i.reference_id,i.reference_snapshot,v_bytes,octet_length(v_bytes),v_hash,v_stamp);
 INSERT INTO public.platform_course_file_binding_events(receipt_id,course_id,scope_generation,reference_kind,reference_id,actor_id)
 VALUES(v_id,i.course_id,i.scope_generation,i.reference_kind,i.reference_id,i.actor_id);
 -- Explicit capture changes only current own/null platform listings. Never a
 -- client listing, even an already-false legacy listing for the same source.
 UPDATE public.marketplace_courses SET is_validated=false WHERE course_id=i.course_id
 AND(organization_id IS NULL OR organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95');
 RETURN public.pcf_v1_receipt_summary(v_id,false);
END;$f$;
CREATE FUNCTION public.pcf_v1_worker_enter(p_listing uuid,p_course uuid,p_actor uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_course uuid;v_org uuid;v_listing_org uuid;v_lib uuid[];
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'PCF_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 PERFORM public.pcf_v1_worker_actor(p_actor);
 PERFORM public.pcr_v2_lock(ARRAY[p_course],'exclusive','own-edition');
 PERFORM public.pcr_v2_parent_courses(ARRAY[p_course],false);
 BEGIN
  SELECT course_id,organization_id INTO v_course,v_listing_org FROM public.marketplace_courses WHERE id=p_listing FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCF_SOURCE_CHANGED_RETRY' USING ERRCODE='40001';END;
 SELECT organization_id INTO v_org FROM public.courses WHERE id=p_course;
 IF v_course IS DISTINCT FROM p_course OR v_org IS DISTINCT FROM '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
 OR(v_listing_org IS NOT NULL AND v_listing_org IS DISTINCT FROM v_org) THEN
  RAISE EXCEPTION 'PCF_OWN_PLATFORM_SOURCE_REQUIRED' USING ERRCODE='42501';END IF;
 v_lib:=public.pcr_v2_resource_ids(p_course);PERFORM public.pcr_v2_library_parents(v_lib);
 PERFORM public.pcf_v1_worker_actor(p_actor);
END;$f$;

CREATE FUNCTION public.pcf_v1_decode_key(p_key text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_bytes bytea:=''::bytea;v_i integer:=1;v_char text;v_key text;
BEGIN
 IF length(p_key)>4096 THEN RAISE EXCEPTION 'PCF_SOURCE_KEY_INVALID';END IF;
 WHILE v_i<=length(p_key) LOOP
  v_char:=substr(p_key,v_i,1);
  IF v_char='%' THEN
   IF substr(p_key,v_i+1,2)!~'^[A-Fa-f0-9]{2}$' THEN RAISE EXCEPTION 'PCF_SOURCE_KEY_INVALID';END IF;
   v_bytes:=v_bytes||decode(substr(p_key,v_i+1,2),'hex');v_i:=v_i+3;
  ELSE v_bytes:=v_bytes||convert_to(v_char,'UTF8');v_i:=v_i+1;END IF;
 END LOOP;
 v_key:=convert_from(v_bytes,'UTF8');
 IF v_key='' OR length(v_key)>2048 OR v_key~'[[:cntrl:]%\\?#]' OR v_key~'(^/|/$|//|(^|/)[.][.]?(/|$))' THEN
  RAISE EXCEPTION 'PCF_SOURCE_KEY_INVALID';END IF;
 RETURN v_key;
END;$f$;
CREATE FUNCTION public.pcf_v1_pointer(p_url text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_parts text[];v_bucket text;v_key text;
BEGIN
 -- Only known fixed API/project origins. Queries (including old signed tokens)
 -- are discarded; no URL, token or arbitrary host is persisted or fetched.
 v_parts:=regexp_match(p_url,'^https://api[.]xn--80aaiswd0ak[.]xn--p1ai/sb-storage/object/(?:authenticated|public|sign)/(org-documents|library-files|course-files)/([^?#]+)(?:[?][^#]*)?$');
 IF v_parts IS NULL THEN
  v_parts:=regexp_match(p_url,'^https://atxwvjxbqjgkbjlhsdch[.]supabase[.]co/storage/v1/object/(?:authenticated|public|sign)/(org-documents|library-files|course-files)/([^?#]+)(?:[?][^#]*)?$');
 END IF;
 IF v_parts IS NULL THEN
  v_parts:=regexp_match(p_url,'^(org-documents|library-files|course-files)/([^?#]+)$');
 END IF;
 IF v_parts IS NULL THEN RAISE EXCEPTION 'PCF_FIXED_STORAGE_REFERENCE_REQUIRED' USING ERRCODE='23514';END IF;
 v_bucket:=v_parts[1];v_key:=public.pcf_v1_decode_key(v_parts[2]);
 RETURN jsonb_build_object('bucket',v_bucket,'key',v_key);
END;$f$;

CREATE FUNCTION public.pcf_v1_reference_identity(p_course uuid,p_kind text,p_reference uuid,p_org_version uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_row jsonb;v_lib public.library_documents;v_url text;v_pointer jsonb;v_expected jsonb;v_obj storage.objects;
 v_ver public.org_document_versions;v_doc public.org_documents;v_generation uuid;v_org uuid;v_public boolean;v_name text;
BEGIN
 SELECT organization_id INTO v_org FROM public.courses WHERE id=p_course;
 IF v_org IS DISTINCT FROM '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid THEN RAISE EXCEPTION 'PCF_OWN_PLATFORM_SOURCE_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT generation INTO v_generation FROM public.platform_course_publication_scope_revisions WHERE course_id=p_course AND active;
 IF v_generation IS NULL THEN RAISE EXCEPTION 'PCF_SOURCE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 IF p_kind='course_document' THEN
  SELECT to_jsonb(d)-ARRAY['created_at','updated_at'] INTO v_row FROM public.course_documents d WHERE id=p_reference AND course_id=p_course;
 ELSIF p_kind='lesson_attachment' THEN
  SELECT to_jsonb(a)-'created_at' INTO v_row FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id WHERE a.id=p_reference AND l.course_id=p_course;
 ELSE RAISE EXCEPTION 'PCF_REFERENCE_KIND_UNSUPPORTED' USING ERRCODE='22023';END IF;
 IF v_row IS NULL THEN RAISE EXCEPTION 'PCF_REFERENCE_NOT_CURRENT' USING ERRCODE='40001';END IF;
 v_url:=nullif(v_row->>'file_url','');v_name:=left(coalesce(v_row->>'name','verified-course-file'),160);
 IF p_kind='course_document' AND v_row->>'library_document_id' IS NOT NULL THEN
  SELECT * INTO v_lib FROM public.library_documents WHERE id=(v_row->>'library_document_id')::uuid FOR SHARE NOWAIT;
  IF v_lib.id IS NULL OR v_lib.organization_id IS DISTINCT FROM v_org OR v_lib.archived_at IS NOT NULL
  OR v_lib.storage_path IS NULL OR v_lib.external_url IS NOT NULL THEN
   RAISE EXCEPTION 'PCF_OWN_STORAGE_LIBRARY_REQUIRED' USING ERRCODE='23514';END IF;
  v_pointer:=jsonb_build_object('bucket','library-files','key',public.pcf_v1_decode_key(v_lib.storage_path));
  IF v_url IS NOT NULL AND public.pcf_v1_pointer(v_url) IS DISTINCT FROM v_pointer THEN RAISE EXCEPTION 'PCF_REFERENCE_SOURCE_CONFLICT' USING ERRCODE='23514';END IF;
 ELSE
  IF v_url IS NULL THEN RAISE EXCEPTION 'PCF_FILE_REFERENCE_MISSING' USING ERRCODE='23514';END IF;
  v_pointer:=public.pcf_v1_pointer(v_url);
 END IF;
 IF v_pointer->>'bucket'='org-documents' AND split_part(v_pointer->>'key','/',1)<>v_org::text
 OR v_pointer->>'bucket'='library-files' AND (split_part(v_pointer->>'key','/',1)<>'library' OR split_part(v_pointer->>'key','/',2)<>v_org::text)
 OR v_pointer->>'bucket'='course-files' AND NOT(left(v_pointer->>'key',length(p_course::text||'/'))=p_course::text||'/' OR left(v_pointer->>'key',length('courses/'||p_course::text||'/'))='courses/'||p_course::text||'/') THEN
  RAISE EXCEPTION 'PCF_STORAGE_TENANT_MISMATCH' USING ERRCODE='42501';END IF;
 IF p_org_version IS NOT NULL THEN
  SELECT * INTO v_ver FROM public.org_document_versions WHERE id=p_org_version FOR SHARE NOWAIT;
  SELECT * INTO v_doc FROM public.org_documents WHERE id=v_ver.document_id FOR SHARE NOWAIT;
  IF v_ver.id IS NULL OR v_ver.organization_id IS DISTINCT FROM v_org OR v_doc.organization_id IS DISTINCT FROM v_org
  OR v_doc.deleted_at IS NOT NULL OR v_ver.file_path IS NULL THEN RAISE EXCEPTION 'PCF_EXACT_ORG_VERSION_REQUIRED' USING ERRCODE='23514';END IF;
  v_expected:=jsonb_build_object('bucket','org-documents','key',public.pcf_v1_decode_key(v_ver.file_path));
  IF v_expected IS DISTINCT FROM v_pointer THEN RAISE EXCEPTION 'PCF_ORG_VERSION_POINTER_MISMATCH' USING ERRCODE='23514';END IF;
 END IF;
 RETURN jsonb_build_object('course_id',p_course,'organization_id',v_org,'scope_generation',v_generation,'reference_kind',p_kind,'reference_id',p_reference,
  'reference_row_sha256',public.pcr_v2_sha(v_row),'library_document_id',v_lib.id,
  'library_row_sha256',CASE WHEN v_lib.id IS NOT NULL THEN public.pcr_v2_sha(to_jsonb(v_lib)-ARRAY['created_at','updated_at']) END,
  'source_org_version_id',p_org_version,'source_org_document_id',v_ver.document_id,
  'source_org_version_metadata_sha256',CASE WHEN v_ver.id IS NOT NULL THEN public.pcr_v2_sha(to_jsonb(v_ver)-'created_at') END,
  'declared_org_storage_object_id',v_ver.storage_object_id,
  'source_bucket',v_pointer->>'bucket','source_key',v_pointer->>'key',
  'expected_byte_length',coalesce(v_lib.file_size,nullif(v_row->>'file_size','')::bigint,v_ver.file_size),'file_name',v_name);
END;$f$;

CREATE FUNCTION public.pcf_v1_reference_snapshot(p_course uuid,p_kind text,p_reference uuid,p_org_version uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_identity jsonb;v_obj storage.objects;v_public boolean;
BEGIN
 v_identity:=public.pcf_v1_reference_identity(p_course,p_kind,p_reference,p_org_version);
 SELECT * INTO v_obj FROM storage.objects WHERE bucket_id=v_identity->>'source_bucket' AND name=v_identity->>'source_key'
  AND archived_at IS NULL AND NOT is_delete_marker FOR SHARE NOWAIT;
 IF v_obj.id IS NULL THEN RAISE EXCEPTION 'PCF_SOURCE_OBJECT_UNAVAILABLE' USING ERRCODE='23514';END IF;
 IF v_identity->>'declared_org_storage_object_id' IS NOT NULL AND (v_identity->>'declared_org_storage_object_id')::uuid<>v_obj.id THEN
  RAISE EXCEPTION 'PCF_SOURCE_OBJECT_VERSION_MISMATCH' USING ERRCODE='23514';END IF;
 SELECT b.public INTO v_public FROM storage.buckets b WHERE b.id=v_obj.bucket_id;
 RETURN v_identity||jsonb_build_object('source_object_id',v_obj.id,'source_storage_version',v_obj.version,
  'source_object_metadata_sha256',public.pcr_v2_sha(to_jsonb(v_obj)-ARRAY['last_accessed_at','updated_at','path_tokens']),
  'source_bucket_public',v_public);
END;$f$;

-- Source explicitly stops short of asserting real consumer acceptance.
-- A successor must wire and accept own learner/preview/material readers plus
-- exact copied-centre delivery before changing frozen_reader_implemented.
CREATE FUNCTION public.pcf_v1_delivery_capabilities() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN RETURN jsonb_build_object('protocol','pcf-bytea/1','admin_bytes_reader_source',true,
 'own_learner_bytes_reader_source',true,'frontend_consumers_accepted',false,
 'copied_centre_exact_binding_supported',false,'frozen_reader_implemented',false);END;$f$;

CREATE FUNCTION public.pcf_v1_binding_state(p_course uuid,p_kind text,p_reference uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE r public.platform_course_file_receipts;v_generation uuid;v_identity jsonb;v_original_identity jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=p_course AND organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95') THEN
  RETURN jsonb_build_object('state','out_of_scope');END IF;
 SELECT generation INTO v_generation FROM public.platform_course_publication_scope_revisions WHERE course_id=p_course AND active;
 SELECT x.* INTO r FROM public.platform_course_file_binding_events e JOIN public.platform_course_file_receipts x ON x.id=e.receipt_id
 WHERE e.course_id=p_course AND e.scope_generation=v_generation AND e.reference_kind=p_kind AND e.reference_id=p_reference ORDER BY e.sequence DESC LIMIT 1;
 IF r.id IS NULL THEN RETURN jsonb_build_object('state','unconfirmed');END IF;
 BEGIN v_identity:=public.pcf_v1_reference_identity(p_course,p_kind,p_reference,(r.reference_snapshot->>'source_org_version_id')::uuid);
 EXCEPTION WHEN SQLSTATE '23514' OR SQLSTATE '42501' OR SQLSTATE '22023' THEN RETURN jsonb_build_object('state','reference_unconfirmed');END;
 -- Original object state is a capture witness, not perpetual mutable storage
 -- authority. Delivery uses retained bytea. Only the declared reference/version
 -- must still agree; old source overwrite cannot silently change reviewed bytes.
 v_original_identity:=r.reference_snapshot-ARRAY['source_object_id','source_storage_version','source_object_metadata_sha256','source_bucket_public'];
 IF v_identity IS DISTINCT FROM v_original_identity OR r.enforcement_sha256<>public.pcf_v1_enforcement_stamp() THEN
  RETURN jsonb_build_object('state','stale');END IF;
 RETURN public.pcf_v1_receipt_summary(r.id,false)||jsonb_build_object('delivery_capabilities',public.pcf_v1_delivery_capabilities());
END;$f$;

CREATE FUNCTION public.pcf_v1_file_blockers(p_course uuid,p_dossier jsonb) RETURNS text[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v text[]:='{}';ref record;b jsonb;e jsonb;v_count integer;v_total integer:=0;v_evidence_count integer:=0;
BEGIN
 FOR ref IN SELECT 'course_document'::text AS kind,id FROM public.course_documents WHERE course_id=p_course
 UNION ALL SELECT 'lesson_attachment',a.id FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id WHERE l.course_id=p_course LOOP
  v_total:=v_total+1;b:=public.pcf_v1_binding_state(p_course,ref.kind,ref.id);
  IF b->>'state' IS DISTINCT FROM 'bytes_sealed' THEN v:=array_append(v,'file_bytes_receipt_unconfirmed');CONTINUE;END IF;
  IF jsonb_typeof(p_dossier->'document_links'->'evidence') IS DISTINCT FROM 'array' THEN v:=array_append(v,'file_dossier_exact_binding_required');CONTINUE;END IF;
  v_count:=0;
  FOR e IN SELECT value FROM jsonb_array_elements(p_dossier->'document_links'->'evidence') LOOP
   IF e->>'reference_kind'=ref.kind AND e->>'reference_id'=ref.id::text
    AND e->>'file_receipt_id'=b->>'receipt_id' AND e->>'captured_edition_id'=b->>'captured_edition_id'
    AND e->>'file_bytes_sha256'=b->>'file_bytes_sha256'
    AND e->'source_org_version_id' IS NOT DISTINCT FROM b->'source_org_version_id' THEN v_count:=v_count+1;END IF;
  END LOOP;
  IF v_count<>1 THEN v:=array_append(v,'file_dossier_exact_binding_required');END IF;
 END LOOP;
 IF v_total>0 THEN
  IF jsonb_typeof(p_dossier->'document_links'->'evidence')='array' THEN
   SELECT count(*) INTO v_evidence_count FROM jsonb_array_elements(p_dossier->'document_links'->'evidence')x WHERE x ? 'file_receipt_id';END IF;
  IF v_evidence_count<>v_total THEN v:=array_append(v,'file_dossier_coverage_mismatch');END IF;
  IF public.pcf_v1_delivery_capabilities()->>'frozen_reader_implemented' IS DISTINCT FROM 'true' THEN
   v:=array_append(v,'file_delivery_consumers_not_accepted');END IF;
 END IF;
 -- This source adapter has no external-media byte resolver. Never clear those
 -- blockers because the course's document/attachment vector happens to pass.
 IF EXISTS(SELECT 1 FROM public.lessons WHERE course_id=p_course AND(type IN('video','audio','pdf','file','presentation')
 OR content~*'(https?://|<iframe|<(audio|video)|"(imageSrc|videoSrc|fileUrl)"[[:space:]]*:)')) THEN
  v:=array_append(v,'file_or_external_material_edition_unconfirmed');END IF;
 RETURN ARRAY(SELECT DISTINCT x FROM unnest(v)x ORDER BY x);
END;$f$;

CREATE FUNCTION public.pcf_v1_file_manifest(p_course uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE ref record;v jsonb:='[]';
BEGIN
 FOR ref IN SELECT 'course_document'::text AS kind,id FROM public.course_documents WHERE course_id=p_course
 UNION ALL SELECT 'lesson_attachment',a.id FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id WHERE l.course_id=p_course
 ORDER BY kind,id LOOP
  v:=v||jsonb_build_array(public.pcf_v1_binding_state(p_course,ref.kind,ref.id)||jsonb_build_object('reference_kind',ref.kind,'reference_id',ref.id));
 END LOOP;
 RETURN v;
END;$f$;

CREATE FUNCTION public.read_platform_course_file_receipt(p_receipt_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE r public.platform_course_file_receipts;v_user uuid:=auth.uid();v_admin boolean;v_course public.courses;v_binding jsonb;v_manifest_sha text;v_allowed boolean:=false;
BEGIN
 -- New byte-reader RPC has a fresh-snapshot contract; never change caller isolation.
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'PCF_READ_RPC_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 IF v_user IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.account_deletion_access_allowed()
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_user AND blocked_at IS NULL AND archived_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_user AND deleted_at IS NULL AND(banned_until IS NULL OR banned_until<=clock_timestamp())) THEN
  RAISE EXCEPTION 'PCF_READ_AUTH_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(v_user::text,42007)) THEN RAISE EXCEPTION 'PCF_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 SELECT * INTO r FROM public.platform_course_file_receipts WHERE id=p_receipt_id;
 IF r.id IS NULL THEN RAISE EXCEPTION 'PCF_RECEIPT_UNAVAILABLE' USING ERRCODE='42501';END IF;
 PERFORM public.pcr_v2_lock(ARRAY[r.course_id],'shared','own-edition');
 BEGIN SELECT * INTO v_course FROM public.courses WHERE id=r.course_id FOR SHARE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCF_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END;
 IF v_course.organization_id IS DISTINCT FROM '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid THEN RAISE EXCEPTION 'PCF_OWN_PLATFORM_SOURCE_REQUIRED' USING ERRCODE='42501';END IF;
 -- A completed block/ban between the fast check and these fences must be seen.
 -- VOLATILE + READ COMMITTED gives this SQL statement a fresh snapshot.
 -- The account fence is still held; callers/writers must honour that protocol.
 IF auth.uid() IS DISTINCT FROM v_user OR auth.role() IS DISTINCT FROM 'authenticated'
 OR NOT public.account_deletion_access_allowed()
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_user AND blocked_at IS NULL AND archived_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_user AND deleted_at IS NULL AND(banned_until IS NULL OR banned_until<=clock_timestamp())) THEN
  RAISE EXCEPTION 'PCF_READ_AUTH_REQUIRED' USING ERRCODE='42501';END IF;
 v_admin:=public.has_role('admin'::public.app_role,v_user) AND public.uc_platform_document_action_allowed(v_user,'read');
 IF v_admin THEN
  -- Authorised moderator may inspect a frozen historical proposal before any
  -- decision. This is not a learner preview or a new current approval claim.
  v_allowed:=true;
 ELSE
  IF public.pcf_v1_delivery_capabilities()->>'frozen_reader_implemented' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'PCF_LEARNER_CONSUMER_NOT_ACCEPTED' USING ERRCODE='42501';END IF;
  v_binding:=public.pcf_v1_binding_state(r.course_id,r.reference_kind,r.reference_id);
  IF v_course.is_published IS NOT TRUE OR v_binding->>'receipt_id' IS DISTINCT FROM r.id::text THEN
   RAISE EXCEPTION 'PCF_CURRENT_DELIVERY_UNCONFIRMED' USING ERRCODE='42501';END IF;
  v_manifest_sha:=public.pcr_v2_sha(public.pcr_v2_manifest(r.course_id,r.marketplace_id));
  IF NOT EXISTS(SELECT 1 FROM public.marketplace_courses m JOIN public.platform_course_publication_review_events e ON e.marketplace_id=m.id
   WHERE m.id=r.marketplace_id AND m.course_id=r.course_id AND m.is_validated AND e.event_kind='publication_recorded' AND e.edition_sha256=v_manifest_sha) THEN
   RAISE EXCEPTION 'PCF_CURRENT_PUBLICATION_REQUIRED' USING ERRCODE='42501';END IF;
  IF r.reference_kind='course_document' THEN
   SELECT public.can_access_course(d.course_id,'courses.read') OR(d.visible_to_students AND d.allow_download AND public.can_access_course_as_learner(d.course_id))
    INTO v_allowed FROM public.course_documents d WHERE d.id=r.reference_id AND d.course_id=r.course_id
    AND(d.library_document_id IS NULL OR public.can_read_electronic_library_document(d.library_document_id));
  ELSE
   SELECT public.can_read_lesson_attachment(a.lesson_id) INTO v_allowed FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id
    WHERE a.id=r.reference_id AND l.course_id=r.course_id;
  END IF;
 END IF;
 IF v_allowed IS DISTINCT FROM true OR octet_length(r.file_bytes)<>r.byte_length OR encode(sha256(r.file_bytes),'hex')<>r.file_sha256 THEN
  RAISE EXCEPTION 'PCF_FILE_READ_DENIED_OR_INTEGRITY' USING ERRCODE='42501';END IF;
 RETURN public.pcf_v1_receipt_summary(r.id,false)||jsonb_build_object('bytes_hex',encode(r.file_bytes,'hex'),
  'delivery_scope',CASE WHEN v_admin THEN 'authorised_moderator_frozen_context_not_learner_acceptance' ELSE 'current_own_course_authorised_learner' END,
  'consumer_acceptance',public.pcf_v1_delivery_capabilities());
END;$f$;

-- Exact reviewed-core body preimages. A later core fix must be rebased explicitly,
-- never normalised or silently overwritten by this file adapter.
DO $core_preimage$
DECLARE r record;p record;BEGIN
 FOR r IN SELECT * FROM(VALUES
 ('public.pcr_v2_manifest(uuid,uuid)','3a7ba76402fd49ea5c34760200c0ae68af1791fc3eeab6fae4997a4f89dde1c3','jsonb'),
 ('public.pcr_v2_blockers(uuid,jsonb)','6db18fb63d6659e657f1a5ed011cbc2a9867db0d1073718e9e848b06b0775aa6','text[]')
 )v(signature,body_sha,return_type) LOOP
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
 IF p.oid IS NULL OR pg_get_userbyid(p.proowner)<>'postgres' OR NOT p.prosecdef OR p.provolatile<>'v' OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] OR format_type(p.prorettype,NULL)<>r.return_type OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>r.body_sha THEN RAISE EXCEPTION 'PCF_CORE_PREIMAGE_DRIFT';END IF;
 END LOOP;END;$core_preimage$;

CREATE OR REPLACE FUNCTION public.pcr_v2_manifest(p_course uuid,p_listing uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.courses c JOIN public.marketplace_courses m ON m.course_id=c.id
   WHERE c.id=p_course AND m.id=p_listing AND c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
   AND (m.organization_id IS NULL OR m.organization_id=c.organization_id)) THEN
  RAISE EXCEPTION 'PCR_OWN_PLATFORM_SOURCE_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_course_publication_scope_revisions WHERE course_id=p_course AND active) THEN RAISE EXCEPTION 'PCR_SCOPE_REVISION_UNAVAILABLE' USING ERRCODE='40001';END IF;
 SELECT jsonb_build_object('schema_version',2,'scope_generation',(SELECT r.generation FROM public.platform_course_publication_scope_revisions r WHERE r.course_id=c.id AND r.active),'course_id',c.id,'organization_id',c.organization_id,'marketplace_id',m.id,
  'listing_organization_id',m.organization_id,
  'course_row_sha256',public.pcr_v2_sha(to_jsonb(c)-ARRAY['created_at','updated_at','generation_progress']),
  'modules',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'row_sha256',public.pcr_v2_sha(to_jsonb(r)-ARRAY['created_at','updated_at'])) ORDER BY r.order_index,r.id) FROM public.course_modules r WHERE r.course_id=c.id),'[]'),
  'lessons',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'module_id',r.module_id,'type',r.type,'row_sha256',public.pcr_v2_sha(to_jsonb(r)-ARRAY['created_at','updated_at']),
    'question_bank_sha256',public.pcr_v2_sha(coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.order_index,q.id) FROM public.test_questions q WHERE q.lesson_id=r.id),'[]')),
    'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'row_sha256',public.pcr_v2_sha(to_jsonb(a)-'created_at'),'file_bytes_state','unconfirmed') ORDER BY a.order_index,a.id) FROM public.lesson_attachments a WHERE a.lesson_id=r.id),'[]')) ORDER BY r.order_index,r.id)
    FROM public.lessons r WHERE r.course_id=c.id),'[]'),
  'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'library_document_id',d.library_document_id,'row_sha256',public.pcr_v2_sha(to_jsonb(d)-ARRAY['created_at','updated_at']),
    'library_row_sha256',CASE WHEN b.id IS NOT NULL THEN public.pcr_v2_sha(to_jsonb(b)-ARRAY['created_at','updated_at']) END,'file_bytes_state','unconfirmed') ORDER BY d.sort_order,d.id)
    FROM public.course_documents d LEFT JOIN public.library_documents b ON b.id=d.library_document_id WHERE d.course_id=c.id),'[]'))
 INTO v_result FROM public.courses c JOIN public.marketplace_courses m ON m.course_id=c.id WHERE c.id=p_course AND m.id=p_listing;
 IF EXISTS(SELECT 1 FROM public.course_documents WHERE course_id=p_course) OR EXISTS(SELECT 1 FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id WHERE l.course_id=p_course) THEN
  v_result:=v_result||jsonb_build_object('file_bindings_schema_version',1,'file_bindings',public.pcf_v1_file_manifest(p_course));
 END IF;
 RETURN v_result;
END $f$;

CREATE OR REPLACE FUNCTION public.pcr_v2_blockers(p_course uuid,p_dossier jsonb) RETURNS text[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v text[]:='{}';v_key text;v_section jsonb;v_ref jsonb;
BEGIN
 IF jsonb_typeof(p_dossier) IS DISTINCT FROM 'object' OR p_dossier->>'schema_version' IS DISTINCT FROM '1' THEN RETURN ARRAY['dossier_missing'];END IF;
 FOREACH v_key IN ARRAY ARRAY['purpose','audience','entry_requirements','outcomes','teaching_plan','workload','assessment_criteria','applicability'] LOOP
  IF jsonb_typeof(p_dossier->'passport'->v_key) IS DISTINCT FROM 'string' OR nullif(btrim(p_dossier->'passport'->>v_key),'') IS NULL THEN v:=array_append(v,'passport_'||v_key);END IF;
 END LOOP;
 FOREACH v_key IN ARRAY ARRAY['source_review','subject_keys','practices','rights','document_links'] LOOP
  v_section:=p_dossier->v_key;
  IF jsonb_typeof(v_section) IS DISTINCT FROM 'object' OR NOT coalesce(v_section->>'state' IN ('confirmed','not_applicable'),false)
    OR nullif(btrim(v_section->>'rationale'),'') IS NULL THEN v:=array_append(v,v_key||'_incomplete');
  ELSIF v_section->>'state'='confirmed' AND (jsonb_typeof(v_section->'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(v_section->'evidence')=0) THEN
   v:=array_append(v,v_key||'_evidence_missing');
  ELSIF v_section->>'state'='confirmed' THEN
   FOR v_ref IN SELECT value FROM jsonb_array_elements(v_section->'evidence') LOOP
    IF jsonb_typeof(v_ref) IS DISTINCT FROM 'object' OR nullif(btrim(v_ref->>'reference'),'') IS NULL
       OR nullif(btrim(v_ref->>'edition'),'') IS NULL OR nullif(btrim(v_ref->>'checked_at'),'') IS NULL THEN
     v:=array_append(v,v_key||'_evidence_incomplete');EXIT;
    END IF;
    IF NOT pg_input_is_valid(v_ref->>'checked_at','timestamptz') THEN v:=array_append(v,v_key||'_evidence_date_invalid');EXIT;END IF;
    IF NOT isfinite((v_ref->>'checked_at')::timestamptz) OR (v_ref->>'checked_at')::timestamptz>clock_timestamp() THEN v:=array_append(v,v_key||'_evidence_date_invalid');EXIT;END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF p_dossier->'rights'->>'state' IS DISTINCT FROM 'confirmed' THEN v:=array_append(v,'rights_review_required');END IF;
 IF EXISTS(SELECT 1 FROM public.test_questions q JOIN public.lessons l ON l.id=q.lesson_id WHERE l.course_id=p_course)
    AND p_dossier->'subject_keys'->>'state' IS DISTINCT FROM 'confirmed' THEN v:=array_append(v,'subject_key_review_required');END IF;
 IF EXISTS(SELECT 1 FROM public.lessons WHERE course_id=p_course AND type IN ('practice','homework'))
    AND p_dossier->'practices'->>'state' IS DISTINCT FROM 'confirmed' THEN v:=array_append(v,'practice_review_required');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.lessons WHERE course_id=p_course) THEN v:=array_append(v,'curriculum_empty');END IF;
 IF EXISTS(SELECT 1 FROM public.test_questions q JOIN public.lessons l ON l.id=q.lesson_id WHERE l.course_id=p_course
   AND (q.correct_answer IS NULL OR NOT public.prog_test_question_key_valid(q.options,q.correct_answer))) THEN v:=array_append(v,'invalid_structural_test_key');END IF;
 IF EXISTS(SELECT 1 FROM public.lessons l LEFT JOIN public.course_modules m ON m.id=l.module_id WHERE l.course_id=p_course AND l.module_id IS NOT NULL AND m.course_id IS DISTINCT FROM l.course_id) THEN v:=array_append(v,'module_course_mismatch');END IF;
 -- Real receipt/bytes/dossier binding is additive; copied/consumer/media HOLD remains explicit.
 v:=v||public.pcf_v1_file_blockers(p_course,p_dossier);
 RETURN v;
END $f$;

-- Atomic final privileges. No direct table/byte/intent client or worker access.
DO $acl$
DECLARE r record;BEGIN
 FOR r IN SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND(p.proname LIKE 'pcf_v1_%' OR p.proname IN('begin_platform_course_file_capture','load_platform_course_file_capture_worker','finish_platform_course_file_capture_worker','read_platform_course_file_receipt')) LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION '||r.signature||' FROM PUBLIC,anon,authenticated,service_role';
 END LOOP;
END;$acl$;
GRANT EXECUTE ON FUNCTION public.begin_platform_course_file_capture(uuid,text,uuid,uuid,uuid),public.read_platform_course_file_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.load_platform_course_file_capture_worker(uuid,uuid),public.finish_platform_course_file_capture_worker(uuid,uuid,uuid,text,text,text) TO service_role;
DO $postflight$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(t.relacl,acldefault('r',t.relowner)))a
 WHERE n.nspname='public' AND t.relname IN('platform_course_file_intents','platform_course_file_receipts','platform_course_file_binding_events') AND(a.grantee=0 OR a.grantee<>t.relowner)) THEN RAISE EXCEPTION 'PCF_PRIVATE_STORE_ACL_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
 WHERE n.nspname='public' AND(p.proname LIKE 'pcf_v1_%' OR p.proname IN('begin_platform_course_file_capture','load_platform_course_file_capture_worker','finish_platform_course_file_capture_worker','read_platform_course_file_receipt'))
 AND a.grantee<>p.proowner AND NOT(
  p.proname IN('begin_platform_course_file_capture','read_platform_course_file_receipt') AND a.grantee='authenticated'::regrole
  OR p.proname IN('load_platform_course_file_capture_worker','finish_platform_course_file_capture_worker') AND a.grantee='service_role'::regrole)) THEN
  RAISE EXCEPTION 'PCF_FUNCTION_PRIVATE_ACL_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM pg_class s JOIN pg_namespace n ON n.oid=s.relnamespace
 CROSS JOIN LATERAL aclexplode(coalesce(s.relacl,acldefault('s',s.relowner)))a
 WHERE n.nspname='public' AND s.relname='platform_course_file_binding_events_sequence_seq' AND a.grantee<>s.relowner) THEN
  RAISE EXCEPTION 'PCF_SEQUENCE_PRIVATE_ACL_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM public.platform_course_file_intents) OR EXISTS(SELECT 1 FROM public.platform_course_file_receipts) OR EXISTS(SELECT 1 FROM public.platform_course_file_binding_events) THEN RAISE EXCEPTION 'PCF_MIGRATION_MUST_NOT_SEED_CAPTURE_OR_APPROVAL';END IF;
END;$postflight$;
COMMIT;
