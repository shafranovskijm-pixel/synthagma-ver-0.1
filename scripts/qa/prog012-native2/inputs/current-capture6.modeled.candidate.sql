-- LAB ONLY. Exact function body, not the Cloud650 registrar/preflight or whole schema acceptance.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='20s';
SET LOCAL search_path=pg_catalog,public;
DO $current_model_guard$BEGIN
 IF current_database()<>'sintagma_pcc_public_native2_lab_20261029' OR current_user<>'postgres' OR session_user<>'postgres'
 OR inet_server_addr()IS DISTINCT FROM'127.0.0.1'::inet OR inet_server_port()<>5432
 OR current_setting('server_version_num')<>'170011' OR current_setting('data_directory')<>'/var/lib/postgresql/data'
 OR current_setting('pcr.lab_authorized',true)IS DISTINCT FROM'source-reviewed-root-run-only'
 OR to_regprocedure('public.begin_platform_course_current_file_capture(uuid,text,text,uuid,uuid)')IS NOT NULL
 OR public.pcf_v1_delivery_capabilities()->>'frozen_reader_implemented'IS DISTINCT FROM'false'
 OR public.pcf_v1_delivery_capabilities()->>'frontend_consumers_accepted'IS DISTINCT FROM'false'
 OR public.pcf_v1_delivery_capabilities()->>'copied_centre_exact_binding_supported'IS DISTINCT FROM'false'
 THEN RAISE EXCEPTION 'CFC_EXACT_PRIVATE_NATIVE_MODEL_EMPTY_NEW_FUNCTION_REQUIRED';END IF;
END;$current_model_guard$;
DO $current_model_dependencies$DECLARE v_dep jsonb;v_actual record;BEGIN
 FOR v_dep IN SELECT value FROM jsonb_array_elements($cfc_deps$[{"signature":"public.pcr_v2_sha(jsonb)","body_sha256":"0efcedbc625bdd5c0e6dc3f27a59e846460fe328880fd562d3f0de352c913b5a","security_definer":false,"volatility":"i","configuration":["search_path=pg_catalog, public"]},{"signature":"public.pcr_v2_actor(boolean)","body_sha256":"63b645338e10484f5239d936457d2cec774b0d9f7afa160fa38b73c5154d5a1c","security_definer":true,"volatility":"v","configuration":["search_path=pg_catalog, public","lock_timeout=3s"]},{"signature":"public.pcr_v2_enter(uuid)","body_sha256":"a379ba544bd18a26ac8f8c6d68c4077e60f96de79b6a4afc1eb0ef3a9726a53f","security_definer":true,"volatility":"v","configuration":["search_path=pg_catalog, public","lock_timeout=3s"]},{"signature":"public.pcr_v2_manifest(uuid,uuid)","body_sha256":"ee7092c56bb9a82d7502c54723cd639869b4f599ad18d2eb88b690e099c004b4","security_definer":true,"volatility":"v","configuration":["search_path=pg_catalog, public"]},{"signature":"public.begin_platform_course_file_capture(uuid,text,uuid,uuid,uuid)","body_sha256":"f81ba77d8442137ff460c059eb3dceff7647bf80423e9abc28a3707da4bb8d8f","security_definer":true,"volatility":"v","configuration":["search_path=pg_catalog, public, pg_temp"]},{"signature":"public.pcf_v1_reference_identity(uuid,text,uuid,uuid)","body_sha256":"09955186b37769d5c80470a13d1f3a348646b65ca8b431816d42e91574e71b3b","security_definer":true,"volatility":"v","configuration":["search_path=pg_catalog, public, pg_temp"]},{"signature":"public.pcf_v1_reference_snapshot(uuid,text,uuid,uuid)","body_sha256":"e7a458de0f067dfe65f286407491c18f400bb5f465d7528711d796d960ff38ae","security_definer":true,"volatility":"v","configuration":["search_path=pg_catalog, public, pg_temp"]}]$cfc_deps$::jsonb)LOOP
  SELECT * INTO v_actual FROM pg_proc WHERE oid=to_regprocedure(v_dep->>'signature');
  IF v_actual.oid IS NULL OR v_actual.proowner<>'postgres'::regrole
   OR encode(sha256(convert_to(v_actual.prosrc,'UTF8')),'hex')<>v_dep->>'body_sha256'
   OR v_actual.prosecdef<>(v_dep->>'security_definer')::boolean OR v_actual.provolatile::text<>v_dep->>'volatility'
   OR to_jsonb(v_actual.proconfig)IS DISTINCT FROM v_dep->'configuration'
  THEN RAISE EXCEPTION 'CFC_UNCHANGED_SEVEN_FOUNDATION_HELPERS_REQUIRED: %',v_dep->>'signature';END IF;
 END LOOP;
END;$current_model_dependencies$;
CREATE FUNCTION public.begin_platform_course_current_file_capture(
 p_marketplace_id uuid,p_expected_edition_sha256 text,p_reference_kind text,p_reference_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $current_capture$
DECLARE
 v_actor uuid;v_course uuid;v_lesson uuid;v_fresh_lesson uuid;v_target uuid;v_bucket text;v_library uuid;
 v_manifest jsonb;v_edition text;v_snapshot jsonb;v_reply jsonb;v_expected_selection text;
 v_intent public.platform_course_file_intents;v_started timestamptz:=clock_timestamp();
BEGIN
 -- Ordinary active moderator/account authority, never an actor supplied by the browser.
 v_actor:=public.pcr_v2_actor(false);
 IF NOT coalesce(public.uc_platform_document_action_allowed(v_actor,'read'),false)THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_DENIED' USING ERRCODE='42501';END IF;
 IF current_setting('transaction_isolation')<>'read committed'THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 IF p_marketplace_id IS NULL OR p_expected_edition_sha256 IS NULL OR p_expected_edition_sha256!~'^[a-f0-9]{64}$'
 OR p_reference_kind IS NULL OR p_reference_kind NOT IN('course_document','lesson_attachment')OR p_reference_id IS NULL OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_SELECTION_REQUIRED' USING ERRCODE='22023';END IF;
 -- Existing PCR enter takes the same account/own-edition/parent/listing fences used by own-source writers.
 v_course:=public.pcr_v2_enter(p_marketplace_id);
 IF public.pcr_v2_actor(false)IS DISTINCT FROM v_actor OR NOT coalesce(public.uc_platform_document_action_allowed(v_actor,'read'),false)THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_DENIED' USING ERRCODE='42501';END IF;
 -- Explicit current Auth/profile row fences supplement the account advisory fence; no stale RR snapshot is accepted.
 PERFORM 1 FROM auth.users WHERE id=v_actor AND deleted_at IS NULL AND(banned_until IS NULL OR banned_until<=clock_timestamp())FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_DENIED' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=v_actor AND blocked_at IS NULL AND archived_at IS NULL FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_DENIED' USING ERRCODE='42501';END IF;
 -- The only supported fresh source is this fixed bucket. Bucket and target row locks persist to transaction end.
 SELECT id INTO v_bucket FROM storage.buckets WHERE id='course-files'FOR SHARE NOWAIT;
 IF v_bucket IS NULL THEN RAISE EXCEPTION 'PCF_CURRENT_COURSE_FILES_ONLY' USING ERRCODE='23514';END IF;
 IF p_reference_kind='course_document'THEN
  SELECT id,library_document_id INTO v_target,v_library FROM public.course_documents WHERE id=p_reference_id AND course_id=v_course FOR SHARE NOWAIT;
  IF v_target IS NULL THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
  IF v_library IS NOT NULL THEN RAISE EXCEPTION 'PCF_CURRENT_COURSE_FILES_ONLY' USING ERRCODE='23514';END IF;
 ELSE
  SELECT lesson_id INTO v_lesson FROM public.lesson_attachments WHERE id=p_reference_id;
  IF v_lesson IS NULL THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
  SELECT id INTO v_target FROM public.lessons WHERE id=v_lesson AND course_id=v_course FOR SHARE NOWAIT;
  IF v_target IS NULL THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
  SELECT lesson_id INTO v_fresh_lesson FROM public.lesson_attachments WHERE id=p_reference_id AND lesson_id=v_lesson FOR SHARE NOWAIT;
  IF v_fresh_lesson IS DISTINCT FROM v_lesson THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 END IF;
 v_manifest:=public.pcr_v2_manifest(v_course,p_marketplace_id);v_edition:=public.pcr_v2_sha(v_manifest);
 IF v_edition IS DISTINCT FROM p_expected_edition_sha256 THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 v_snapshot:=public.pcf_v1_reference_snapshot(v_course,p_reference_kind,p_reference_id,NULL::uuid);
 IF v_snapshot->>'source_bucket'IS DISTINCT FROM'course-files'
 OR v_snapshot->'library_document_id'IS DISTINCT FROM'null'::jsonb OR v_snapshot->'library_row_sha256'IS DISTINCT FROM'null'::jsonb
 OR v_snapshot->'source_org_version_id'IS DISTINCT FROM'null'::jsonb OR v_snapshot->'source_org_document_id'IS DISTINCT FROM'null'::jsonb
 OR v_snapshot->'source_org_version_metadata_sha256'IS DISTINCT FROM'null'::jsonb OR v_snapshot->'declared_org_storage_object_id'IS DISTINCT FROM'null'::jsonb
 OR v_snapshot->>'course_id'IS DISTINCT FROM v_course::text OR v_snapshot->>'organization_id'IS DISTINCT FROM'4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
 OR v_snapshot->>'reference_kind'IS DISTINCT FROM p_reference_kind OR v_snapshot->>'reference_id'IS DISTINCT FROM p_reference_id::text THEN
  RAISE EXCEPTION 'PCF_CURRENT_COURSE_FILES_ONLY' USING ERRCODE='23514';END IF;
 -- This call and all surrounding proofs occur in this SAME transaction, never a second SDK/RPC request.
 v_reply:=public.begin_platform_course_file_capture(p_marketplace_id,p_reference_kind,p_reference_id,NULL::uuid,p_request_id);
 IF jsonb_typeof(v_reply)IS DISTINCT FROM'object'OR(SELECT count(*)FROM jsonb_object_keys(v_reply))<>4
 OR NOT(v_reply?&ARRAY['intent_id','expires_at','replayed','state'])OR v_reply->'replayed'IS DISTINCT FROM'false'::jsonb
 OR v_reply->>'state'IS DISTINCT FROM'capture_intent_only_not_verified_or_approved'
 OR jsonb_typeof(v_reply->'intent_id')IS DISTINCT FROM'string'OR NOT coalesce(pg_input_is_valid(v_reply->>'intent_id','uuid'),false)
 OR jsonb_typeof(v_reply->'expires_at')IS DISTINCT FROM'string'OR NOT coalesce(pg_input_is_valid(v_reply->>'expires_at','timestamp with time zone'),false)THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_FRESH_INTENT_REQUIRED_NO_REPLAY' USING ERRCODE='22023';END IF;
 SELECT * INTO v_intent FROM public.platform_course_file_intents WHERE id=(v_reply->>'intent_id')::uuid FOR SHARE NOWAIT;
 v_expected_selection:=public.pcr_v2_sha(jsonb_build_object('marketplace_id',p_marketplace_id,'reference_kind',p_reference_kind,'reference_id',p_reference_id,'source_org_version_id',NULL::uuid));
 IF v_intent.id IS NULL OR v_intent.actor_id IS DISTINCT FROM v_actor OR v_intent.marketplace_id IS DISTINCT FROM p_marketplace_id
 OR v_intent.course_id IS DISTINCT FROM v_course OR v_intent.organization_id IS DISTINCT FROM'4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
 OR v_intent.reference_kind IS DISTINCT FROM p_reference_kind OR v_intent.reference_id IS DISTINCT FROM p_reference_id
 OR v_intent.source_org_version_id IS NOT NULL OR v_intent.request_id IS DISTINCT FROM p_request_id
 OR v_intent.selection_sha256 IS DISTINCT FROM v_expected_selection OR v_intent.scope_generation::text IS DISTINCT FROM v_snapshot->>'scope_generation'
 OR v_intent.reference_snapshot IS DISTINCT FROM v_snapshot OR v_intent.created_at<v_started OR v_intent.created_at>clock_timestamp()
 OR v_intent.expires_at IS DISTINCT FROM(v_reply->>'expires_at')::timestamptz OR v_intent.expires_at<=clock_timestamp()
 OR v_intent.expires_at>v_intent.created_at+interval'120 seconds'
 OR EXISTS(SELECT 1 FROM public.platform_course_file_receipts WHERE intent_id=v_intent.id)THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_INTENT_BINDING_MISMATCH' USING ERRCODE='40001';END IF;
 -- Fresh post-begin checks close same-transaction changes and never turn a prior request into current authority.
 IF public.pcr_v2_actor(false)IS DISTINCT FROM v_actor OR NOT coalesce(public.uc_platform_document_action_allowed(v_actor,'read'),false)
 OR public.pcr_v2_sha(public.pcr_v2_manifest(v_course,p_marketplace_id))IS DISTINCT FROM p_expected_edition_sha256
 OR public.pcf_v1_reference_snapshot(v_course,p_reference_kind,p_reference_id,NULL::uuid)IS DISTINCT FROM v_snapshot THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 RETURN v_reply||jsonb_build_object('schema_version',1,'actor_id',v_actor,'organization_id','4ac2c05a-d8b5-4e72-ba31-f2c743091d95',
  'marketplace_id',p_marketplace_id,'course_id',v_course,'current_edition_sha256',p_expected_edition_sha256,
  'reference_kind',p_reference_kind,'reference_id',p_reference_id,
  'selection_proof','same_transaction_current_course_files_only_no_library_or_org_version');
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';
END;
$current_capture$;

REVOKE ALL ON FUNCTION public.begin_platform_course_current_file_capture(uuid,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_platform_course_current_file_capture(uuid,text,text,uuid,uuid) TO authenticated;
DO $current_model_after$DECLARE p record;BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid='public.begin_platform_course_current_file_capture(uuid,text,text,uuid,uuid)'::regprocedure;
 IF p.proowner<>'postgres'::regrole OR NOT p.prosecdef OR p.provolatile<>'v'
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp','lock_timeout=3s']
 OR p.proargnames IS DISTINCT FROM ARRAY['p_marketplace_id','p_expected_edition_sha256','p_reference_kind','p_reference_id','p_request_id']
 OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>'ca721e0338a15df1abf3be716c4cf7666c570b82e2029249a40ed13a8774eaab'
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee<>p.proowner
  AND(a.grantee<>'authenticated'::regrole OR a.privilege_type<>'EXECUTE'OR a.is_grantable OR a.grantor<>p.proowner))
 OR NOT has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE')
 OR has_function_privilege('service_role',p.oid,'EXECUTE') THEN RAISE EXCEPTION 'CFC_EXACT_FUNCTION_BODY_ATTRIBUTES_ACL_REQUIRED';END IF;
END;$current_model_after$;
COMMIT;
