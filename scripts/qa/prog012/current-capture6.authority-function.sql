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
