-- Exact raw metadata observation for the existing UC019 worker. No artifact,
-- review, number, issuance or business result is recorded by this function.
BEGIN;
CREATE FUNCTION public.uc_observe_education_artifact_object(
 p_actor_id uuid,p_organization_id uuid,p_preparation_id uuid,p_item_id uuid,
 p_input_revision bigint,p_request_id uuid,p_kind text
)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,storage SET lock_timeout='2000ms' AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;o storage.objects;
 bucket text;path text;result jsonb;BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('staging','output')THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 -- Reuse the original-caller request receipt, actor, scope and privacy fences.
 i:=public.uc_education_artifact_service_request(p_actor_id,p_organization_id,p_preparation_id,p_item_id,p_input_revision,p_request_id);
 IF p_kind='staging'THEN
  bucket:='education-issuance-staging';path:=i.user_id::text||'/'||i.organization_id::text||'/'||i.preparation_id::text||'/'||i.id::text||'/'||i.render_input_hash||'.pdf';
 ELSE
  IF i.staging_proof IS NULL THEN PERFORM public.uc_education_issue_error('REVIEW_REQUIRED');END IF;
  bucket:='org-documents';path:=i.organization_id::text||'/versions/'||i.output_document_id::text||'/'||i.output_request_id::text||'.pdf';
 END IF;
 PERFORM 1 FROM storage.buckets b WHERE b.id=bucket AND NOT b.public FOR SHARE;
 IF NOT FOUND THEN PERFORM public.uc_education_issue_error('SOURCE_UNAVAILABLE');END IF;
 SELECT *INTO o FROM storage.objects s WHERE s.bucket_id=bucket AND s.name=path FOR SHARE;
 IF o.id IS NOT NULL THEN
  IF jsonb_typeof(o.metadata)IS DISTINCT FROM'object'OR coalesce(o.metadata->>'size','')!~'^[0-9]{1,8}$'
   OR(o.metadata->>'size')::bigint NOT BETWEEN 1 AND 20971520 OR o.metadata->>'mimetype'IS DISTINCT FROM'application/pdf'
   OR(o.user_metadata IS NOT NULL AND jsonb_typeof(o.user_metadata)<>'object')
   OR(p_kind='staging'AND(o.owner IS NOT NULL OR nullif(o.owner_id,'')IS NOT NULL))THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
  result:=jsonb_build_object('bucket',bucket,'path',path,'object_id',o.id,
   'updated_at',to_char(o.updated_at AT TIME ZONE'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'byte_size',(o.metadata->>'size')::bigint,'mime_type',o.metadata->>'mimetype','storage_metadata',o.metadata,'user_metadata',o.user_metadata);
 ELSIF p_kind='staging'AND i.staging_proof IS NOT NULL THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');
 END IF;
 -- Observation cannot acknowledge stale eligibility or a revoked source actor.
 PERFORM public.uc_education_artifact_live(p_actor_id,p_preparation_id,p_item_id,p_input_revision,true);
 RETURN jsonb_build_object('schema_version',1,'actor_id',p_actor_id,'organization_id',p_organization_id,
  'preparation_id',p_preparation_id,'item_id',p_item_id,'input_revision',p_input_revision,'request_id',p_request_id,
  'render_input_hash',i.render_input_hash,'kind',p_kind,'object',result);
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN
  RAISE EXCEPTION 'EDUCATION_ISSUANCE_REVISION_CONFLICT' USING ERRCODE='PT409';
 WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
  PERFORM public.uc_education_issue_error('INVALID_INPUT');
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_observe_education_artifact_object(uuid,uuid,uuid,uuid,bigint,uuid,text)FROM PUBLIC,anon,authenticated,service_role;
-- Provider default privileges must not expose this new service-only reader.
DO $acl$DECLARE provider_role text;BEGIN
 FOREACH provider_role IN ARRAY ARRAY['sandbox_exec_atxwvjxbqjgkbjlhsdch','sandbox_exec']LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=provider_role)THEN
   EXECUTE format('REVOKE ALL ON FUNCTION public.uc_observe_education_artifact_object(uuid,uuid,uuid,uuid,bigint,uuid,text) FROM %I',provider_role);
  END IF;
 END LOOP;
END;$acl$;
GRANT EXECUTE ON FUNCTION public.uc_observe_education_artifact_object(uuid,uuid,uuid,uuid,bigint,uuid,text)TO service_role;
COMMIT;
