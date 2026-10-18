-- UC-003: retain trusted compiler provenance while committing with the original actor.
-- Requires 104+105. No existing documents, receipts, or stored permissions are rewritten.
BEGIN;
DO $preflight$ BEGIN
 IF to_regprocedure('public.uc_document_action_allowed(uuid,text,uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'UC106 requires action permissions'; END IF;
 IF md5(pg_get_functiondef('public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure))<>'201600eaeb4cb37dcea7791d0716dbb2'
 OR md5(pg_get_functiondef('public.create_goreltech_group_document_batch_once(uuid,uuid,uuid,uuid,jsonb,text[])'::regprocedure))<>'72c0bc7f4b6feaba492b305887bafb32'
 THEN RAISE EXCEPTION 'UC106 unreviewed compiler RPCs'; END IF;
END;$preflight$;

CREATE TABLE public.uc_goreltech_document_stages(
 actor_id uuid NOT NULL,organization_id uuid NOT NULL,group_id uuid NOT NULL,
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes',
 consumed_at timestamptz,
 PRIMARY KEY(actor_id,organization_id,group_id,payload_sha256),
 CHECK(expires_at>created_at)
);
ALTER TABLE public.uc_goreltech_document_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uc_goreltech_document_stages FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.register_goreltech_group_document_stage(p_actor_id uuid,p_organization_id uuid,p_group_id uuid,p_docs jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_hash text;v_stage public.uc_goreltech_document_stages%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL
 THEN RAISE EXCEPTION 'Trusted compiler service required' USING ERRCODE='42501'; END IF;
 IF p_actor_id IS NULL OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor_id)
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor_id)
 OR p_organization_id IS DISTINCT FROM '7237f9d4-3670-4a19-8946-a43c68fd3473'::uuid
 OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_organization_id AND regexp_replace(coalesce(o.inn,''),'\D','','g')='7806541216' AND o.name ~* 'ГОРЭЛТЕХ')
 OR NOT EXISTS(SELECT 1 FROM public.student_groups g WHERE g.id=p_group_id AND g.organization_id=p_organization_id)
 THEN RAISE EXCEPTION 'Invalid compiler stage actor or tenant' USING ERRCODE='42501'; END IF;
 IF p_docs IS NULL OR jsonb_typeof(p_docs)<>'array' THEN RAISE EXCEPTION 'Expected nine compiled drafts' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_docs)<>9 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_docs) d WHERE
  jsonb_typeof(d)<>'object' OR coalesce(d->>'doc_status','')<>'draft' OR nullif(btrim(d->>'document_number'),'') IS NOT NULL
  OR coalesce(d->>'layout_format','')<>'docx_ooxml' OR coalesce(d->>'generation_status','')<>'generated'
  OR coalesce(d->>'docx_sha256','') !~ '^[0-9a-fA-F]{64}$' OR coalesce(d->>'template_sha256','') !~ '^[0-9a-fA-F]{64}$'
  OR nullif(btrim(d->>'template_registry_key'),'') IS NULL OR nullif(btrim(d->>'template_version_label'),'') IS NULL
  OR coalesce(jsonb_typeof(d->'variables_snapshot'),'')<>'object'
  OR coalesce(d->>'file_path','') NOT LIKE 'organizations/'||p_organization_id::text||'/group-documents/'||p_group_id::text||'/%'
  OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='billing-documents' AND o.name=d->>'file_path'))
 THEN RAISE EXCEPTION 'Invalid compiled draft metadata or missing staged object' USING ERRCODE='22023'; END IF;
 -- JSONB textual form is canonical for object keys; array order is intentionally part of the payload.
 -- The trusted compiler, not this metadata query, computes/validates file and template hashes.
 v_hash:=encode(sha256(convert_to(p_docs::text,'UTF8')),'hex');
 INSERT INTO public.uc_goreltech_document_stages(actor_id,organization_id,group_id,payload_sha256)
 VALUES(p_actor_id,p_organization_id,p_group_id,v_hash) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT v_stage FROM public.uc_goreltech_document_stages
 WHERE actor_id=p_actor_id AND organization_id=p_organization_id AND group_id=p_group_id AND payload_sha256=v_hash FOR UPDATE;
 IF v_stage.consumed_at IS NOT NULL OR v_stage.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'Compiler stage already consumed or expired' USING ERRCODE='55000'; END IF;
 RETURN jsonb_build_object('payload_sha256',v_hash,'expires_at',v_stage.expires_at);
END;$fn$;
REVOKE ALL ON FUNCTION public.register_goreltech_group_document_stage(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_goreltech_group_document_stage(uuid,uuid,uuid,jsonb) TO service_role;

DO $replace_rpc$ DECLARE src text;old_auth text;new_auth text:=$new_auth$
  IF v_jwt_role IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL OR p_actor_id IS DISTINCT FROM auth.uid()
    OR NOT public.uc_document_action_allowed(p_organization_id,'write',p_group_id,NULL) THEN
    RAISE EXCEPTION 'authenticated document writer and exact actor/group required' USING ERRCODE='42501';
  END IF;
$new_auth$;needle text;
BEGIN
 SELECT pg_get_functiondef('public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure) INTO src;
 old_auth:=$old_auth$
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR NOT (
    public.has_role(p_actor_id, 'admin'::app_role)
    OR public.has_org_staff_permission(p_actor_id, p_organization_id, 'documents.manage')
    OR public.is_org_owner(p_actor_id, p_organization_id)
  ) THEN
    RAISE EXCEPTION 'actor is not allowed to manage organization documents' USING ERRCODE = '42501';
  END IF;
$old_auth$;
 IF (length(src)-length(replace(src,old_auth,'')))/length(old_auth)<>1 THEN RAISE EXCEPTION 'UC106 auth source mismatch create_goreltech_group_document_batch'; END IF;
 src:=replace(src,old_auth,new_auth);
 needle:='  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text || '':'' || p_group_id::text, 0));';
 IF (length(src)-length(replace(src,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'UC106 batch lock source mismatch'; END IF;
 src:=replace(src,needle,$consume$
  UPDATE public.uc_goreltech_document_stages SET consumed_at=clock_timestamp()
  WHERE actor_id=p_actor_id AND organization_id=p_organization_id AND group_id=p_group_id
    AND payload_sha256=encode(sha256(convert_to(p_docs::text,'UTF8')),'hex')
    AND consumed_at IS NULL AND expires_at>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact unexpired compiler stage required' USING ERRCODE='42501'; END IF;
$consume$||needle);
 EXECUTE src;
 SELECT pg_get_functiondef('public.create_goreltech_group_document_batch_once(uuid,uuid,uuid,uuid,jsonb,text[])'::regprocedure) INTO src;
 old_auth:=$old_auth$
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR NOT COALESCE((
    public.has_role(p_actor_id, 'admin'::public.app_role)
    OR public.is_org_owner(p_actor_id, p_organization_id)
    OR (
      EXISTS (
        SELECT 1 FROM public.org_staff s
        WHERE s.user_id = p_actor_id AND s.organization_id = p_organization_id
          AND (s.expires_at IS NULL OR s.expires_at > now())
      )
      AND public.has_org_staff_permission(p_actor_id, p_organization_id, 'documents.manage')
    )
  ), false) THEN
    RAISE EXCEPTION 'actor is not allowed to manage organization documents' USING ERRCODE = '42501';
  END IF;
$old_auth$;
 IF (length(src)-length(replace(src,old_auth,'')))/length(old_auth)<>1 THEN RAISE EXCEPTION 'UC106 auth source mismatch create_goreltech_group_document_batch_once'; END IF;
 src:=replace(src,old_auth,new_auth);

 EXECUTE src;
END;$replace_rpc$;
REVOKE ALL ON FUNCTION public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb),
 public.create_goreltech_group_document_batch_once(uuid,uuid,uuid,uuid,jsonb,text[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb),
 public.create_goreltech_group_document_batch_once(uuid,uuid,uuid,uuid,jsonb,text[]) TO authenticated;

DO $postcheck$ BEGIN
 IF EXISTS(SELECT 1 FROM public.uc_goreltech_document_stages)
 OR has_table_privilege('authenticated','public.uc_goreltech_document_stages','SELECT,INSERT,UPDATE,DELETE')
 OR has_function_privilege('anon','public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('service_role','public.create_goreltech_group_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'UC106 compiler boundary postcheck failed'; END IF;
END;$postcheck$;
COMMIT;
