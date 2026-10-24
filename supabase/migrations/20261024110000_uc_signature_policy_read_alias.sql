BEGIN;
DO $uc022_policy_read_preimage$
DECLARE uc_target pg_catalog.pg_proc%ROWTYPE;
BEGIN
 SELECT * INTO uc_target FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure('public.read_signature_assurance(uuid,jsonb)');
 IF uc_target.oid IS NULL OR pg_catalog.md5(pg_catalog.pg_get_functiondef(uc_target.oid)) IS DISTINCT FROM '0a9e7d7d6ed8cc9637fa1c9ea6efaf28'
 OR pg_catalog.pg_get_userbyid(uc_target.proowner) IS DISTINCT FROM 'postgres'
 OR uc_target.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
 OR uc_target.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public','lock_timeout=2000ms','statement_timeout=10000ms']::text[]
 OR uc_target.prosecdef IS DISTINCT FROM true OR uc_target.provolatile::text IS DISTINCT FROM 'v' OR uc_target.proparallel::text IS DISTINCT FROM 'u'
 THEN RAISE EXCEPTION 'UC022_POLICY_READ_PREIMAGE_OR_AUTHORITY_CHANGED'; END IF;
END
$uc022_policy_read_preimage$;
CREATE OR REPLACE FUNCTION public.read_signature_assurance(p_organization_id uuid, p_query jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET lock_timeout TO '2000ms'
 SET statement_timeout TO '10000ms'
AS $function$
DECLARE org uuid:=p_organization_id;v_kind text:=p_query->>'kind';result jsonb;caps jsonb;list jsonb:='[]';agreements jsonb:='[]';consents jsonb:='[]';v public.uc_signature_assurance_policy_versions;head public.uc_signature_assurance_streams;subject uuid;sig uuid;party text;after_id uuid;lim integer;seen integer:=0;last_id uuid;next_id uuid;value jsonb;row_item record;revision_value integer;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_active()OR org IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=org)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF jsonb_typeof(p_query)IS DISTINCT FROM'object'OR octet_length(p_query::text)>196608 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 caps:=public.uc_signature_assurance_capabilities(org);
 IF v_kind IN('policy_list','policy_choices','subject')THEN
  IF NOT public.uc_signature_assurance_integer(p_query->'limit',1,100)OR p_query->'after_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_query->'after_id')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;lim:=(p_query->>'limit')::integer;after_id:=(p_query->>'after_id')::uuid;
 END IF;
 IF v_kind='signature'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','signature_id','party_role'])OR NOT public.uc_signature_assurance_uuid(p_query->'signature_id')OR NOT coalesce(p_query->>'party_role'IN('sender','recipient'),false)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  sig:=(p_query->>'signature_id')::uuid;party:=p_query->>'party_role';value:=public.uc_signature_assurance_context(org,sig,party);caps:=value->'capabilities';result:=jsonb_build_object('kind',v_kind,'context',value);
 ELSIF v_kind='policy'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','policy_version_id'])OR NOT public.uc_signature_assurance_uuid(p_query->'policy_version_id')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  PERFORM public.uc_signature_assurance_fence(org,'{}');value:=public.uc_signature_assurance_project_policy(org,(p_query->>'policy_version_id')::uuid);result:=jsonb_build_object('kind',v_kind,'policy',value);
 ELSIF v_kind IN('policy_list','policy_choices')THEN
  IF v_kind='policy_list'THEN
   IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','after_id','limit'])THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  ELSE
   IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','signature_id','party_role','purpose','after_id','limit'])OR NOT coalesce(p_query->>'purpose'IN('signature','consent','agreement'),false)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
   IF p_query->>'purpose'='signature'THEN
    IF NOT public.uc_signature_assurance_uuid(p_query->'signature_id')OR NOT coalesce(p_query->>'party_role'IN('sender','recipient'),false)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
    sig:=(p_query->>'signature_id')::uuid;party:=p_query->>'party_role';PERFORM public.uc_signature_assurance_signature_fence(org,sig);caps:=public.uc_signature_assurance_capabilities(org,sig,party);
   ELSIF p_query->'signature_id'<>'null'::jsonb OR p_query->'party_role'<>'null'::jsonb OR NOT public.uc_signature_assurance_own_current(org,auth.uid())THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
  END IF;
  PERFORM public.uc_signature_assurance_fence(org,'{}');
  FOR v IN SELECT *FROM public.uc_signature_assurance_policy_versions uc_policy_row WHERE uc_policy_row.organization_id=org AND(after_id IS NULL OR uc_policy_row.id>after_id)AND public.uc_signature_assurance_policy_read(org,uc_policy_row.id)
   AND(v_kind='policy_list'OR public.uc_signature_assurance_policy_eligible(org,uc_policy_row.id)AND CASE WHEN p_query->>'purpose'='signature'THEN(uc_policy_row.body->'classification'->>'party_role'='sender')=(party='sender')WHEN p_query->>'purpose'='agreement'THEN uc_policy_row.body->>'method'='authenticated_account_confirmation'AND uc_policy_row.body->'agreement'<>'null'::jsonb ELSE uc_policy_row.body->>'method'='authenticated_account_confirmation'AND uc_policy_row.body->'consent'<>'null'::jsonb END)ORDER BY uc_policy_row.id LIMIT lim+1 LOOP
   seen:=seen+1;IF seen>lim THEN next_id:=last_id;EXIT;END IF;
   IF v_kind='policy_list'THEN value:=public.uc_signature_assurance_project_policy(org,v.id);
   ELSE SELECT stream_revision INTO revision_value FROM public.uc_signature_assurance_policy_decisions WHERE organization_id=org AND policy_version_id=v.id ORDER BY stream_revision DESC LIMIT 1;
    value:=jsonb_build_object('id',v.id,'family_id',v.family_id,'organization_id',org,'version',v.version,'body_sha256',v.body_sha256,'classification',v.body->'classification','method',v.body->>'method','purpose',v.body->>'purpose','identity_requirement',v.body->>'identity_requirement','authority_requirement',v.body->>'authority_requirement','limitations',v.body->>'limitations','decision_revision',revision_value);
   END IF;list:=list||jsonb_build_array(value);last_id:=v.id;
  END LOOP;
  IF v_kind='policy_list'THEN result:=jsonb_build_object('kind',v_kind,'policies',list,'next_after_id',next_id);
  ELSE result:=jsonb_build_object('kind',v_kind,'signature_id',sig,'party_role',party,'purpose',p_query->>'purpose','choices',list,'next_after_id',next_id);END IF;
 ELSIF v_kind='events'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','stream_kind','stream_id','after_revision','through_revision','limit'])OR NOT public.uc_signature_assurance_uuid(p_query->'stream_id')OR NOT coalesce(p_query->>'stream_kind'IN('policy','signature','agreement','consent'),false)OR NOT public.uc_signature_assurance_integer(p_query->'after_revision')OR NOT public.uc_signature_assurance_integer(p_query->'limit',1,100)OR p_query->'through_revision'<>'null'::jsonb AND NOT public.uc_signature_assurance_integer(p_query->'through_revision')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  value:=public.uc_signature_assurance_read_events(org,p_query);result:=jsonb_build_object('kind',v_kind,'page',value);
  IF p_query->>'stream_kind'='signature'THEN caps:=public.uc_signature_assurance_capabilities(org,(p_query->>'stream_id')::uuid,NULL);END IF;
 ELSIF v_kind='terms'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','policy_version_id','terms_kind','declared_full_name'])OR NOT public.uc_signature_assurance_uuid(p_query->'policy_version_id')OR NOT public.uc_signature_assurance_text(p_query->'declared_full_name',300)OR NOT coalesce(p_query->>'terms_kind'IN('pep_agreement','personal_data_consent'),false)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  PERFORM public.uc_signature_assurance_fence(org,ARRAY[auth.uid()]);result:=public.uc_signature_assurance_render_terms(org,(p_query->>'policy_version_id')::uuid,p_query->>'terms_kind',p_query->>'declared_full_name');
 ELSIF v_kind='subject'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','subject_user_id','after_id','limit'])OR NOT public.uc_signature_assurance_uuid(p_query->'subject_user_id')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;subject:=(p_query->>'subject_user_id')::uuid;
  IF NOT public.uc_signature_assurance_subject_read(org,subject)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
  PERFORM public.uc_signature_assurance_fence(org,ARRAY[subject]);
  FOR row_item IN SELECT *FROM(SELECT id,'agreement'::text source FROM public.uc_signature_assurance_agreements WHERE organization_id=org AND subject_user_id=subject UNION ALL SELECT id,'consent'FROM public.uc_signature_assurance_consents WHERE organization_id=org AND subject_user_id=subject UNION ALL SELECT id,'legacy_agreement'FROM public.pep_agreements WHERE user_id=subject AND(organization_id=org OR organization_id IS NULL AND auth.uid()=subject)UNION ALL SELECT id,'legacy_consent'FROM public.student_consents WHERE organization_id=org AND user_id=subject)all_rows WHERE after_id IS NULL OR id>after_id ORDER BY id LIMIT lim+1 LOOP
   seen:=seen+1;IF seen>lim THEN next_id:=last_id;EXIT;END IF;
   IF row_item.source='agreement'THEN agreements:=agreements||jsonb_build_array(public.uc_signature_assurance_project_agreement(org,row_item.id));
   ELSIF row_item.source='legacy_agreement'THEN agreements:=agreements||jsonb_build_array(public.uc_signature_assurance_project_legacy_agreement(org,row_item.id,subject));
   ELSIF row_item.source='consent'THEN consents:=consents||jsonb_build_array(public.uc_signature_assurance_project_consent(org,row_item.id));
   ELSE consents:=consents||jsonb_build_array(public.uc_signature_assurance_project_legacy_consent(org,row_item.id,subject));END IF;last_id:=row_item.id;
  END LOOP;
  result:=jsonb_build_object('kind',v_kind,'subject_user_id',subject,
   'agreement_stream_id',coalesce((SELECT id FROM public.uc_signature_assurance_streams subject_head WHERE subject_head.organization_id=org AND subject_head.kind='agreement'AND entity_id=subject),public.uc_signature_assurance_empty_subject_stream(org,'agreement',subject)),
   'agreement_revision',coalesce((SELECT revision FROM public.uc_signature_assurance_streams subject_head WHERE subject_head.organization_id=org AND subject_head.kind='agreement'AND entity_id=subject),0),
   'consent_stream_id',coalesce((SELECT id FROM public.uc_signature_assurance_streams subject_head WHERE subject_head.organization_id=org AND subject_head.kind='consent'AND entity_id=subject),public.uc_signature_assurance_empty_subject_stream(org,'consent',subject)),
   'consent_revision',coalesce((SELECT revision FROM public.uc_signature_assurance_streams subject_head WHERE subject_head.organization_id=org AND subject_head.kind='consent'AND entity_id=subject),0),
   'agreements',agreements,'consents',consents,'next_after_id',next_id);
 ELSIF v_kind='receipt'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','signature_id','receipt_id'])OR NOT public.uc_signature_assurance_uuid(p_query->'signature_id')OR NOT public.uc_signature_assurance_uuid(p_query->'receipt_id')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  sig:=(p_query->>'signature_id')::uuid;value:=public.uc_signature_assurance_derive_manifest(org,sig,(p_query->>'receipt_id')::uuid);result:=jsonb_build_object('kind',v_kind,'manifest',value);caps:=value->'body'->'context'->'capabilities';
 ELSE PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 caps:=jsonb_set(caps,'{can_read}','true'::jsonb);
 RETURN jsonb_build_object('version',1,'ok',true,'scope',jsonb_build_object('actor_user_id',auth.uid(),'organization_id',org),'capabilities',caps,'result',result);
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');
 WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$function$
;
DO $uc022_policy_read_postimage$
DECLARE uc_target pg_catalog.pg_proc%ROWTYPE;
BEGIN
 SELECT * INTO uc_target FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure('public.read_signature_assurance(uuid,jsonb)');
 IF uc_target.oid IS NULL OR pg_catalog.md5(pg_catalog.pg_get_functiondef(uc_target.oid)) IS DISTINCT FROM '5567382afd0a559b3ba1ba638e8d8750'
 OR pg_catalog.pg_get_userbyid(uc_target.proowner) IS DISTINCT FROM 'postgres'
 OR uc_target.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
 OR uc_target.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public','lock_timeout=2000ms','statement_timeout=10000ms']::text[]
 OR uc_target.prosecdef IS DISTINCT FROM true OR uc_target.provolatile::text IS DISTINCT FROM 'v' OR uc_target.proparallel::text IS DISTINCT FROM 'u'
 THEN RAISE EXCEPTION 'UC022_POLICY_READ_POSTIMAGE_OR_AUTHORITY_CHANGED'; END IF;
END
$uc022_policy_read_postimage$;
COMMIT;
