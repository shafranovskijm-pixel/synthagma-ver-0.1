-- SOURCE ONLY: replace one read-only context function; no data/capability/grant changes.
BEGIN;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=pg_catalog,public,pg_temp;
DO $current_file_review_install$
DECLARE v_before pg_catalog.pg_proc;v_after pg_catalog.pg_proc;v_stamp text;v_others text;
BEGIN
 IF current_user<>'postgres' OR (SELECT count(*) FROM supabase_migrations.schema_migrations)<>653
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261029040000')
 THEN RAISE EXCEPTION 'CURRENT_FILE_REVIEW_EXACT653_SOURCE_ONLY_INSTALL_PRECONDITION';END IF;
 SELECT * INTO v_before FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('public.read_platform_course_publication_review_context(uuid,uuid,text,text,uuid)');
 IF v_before.oid IS NULL OR encode(sha256(convert_to(v_before.prosrc,'UTF8')),'hex')<>'543e9fb05d8303eea9df527215d789aad44100ab7f83a5d2d66e69021cd64c75'
 OR pg_get_userbyid(v_before.proowner)<>'postgres' OR NOT v_before.prosecdef OR v_before.provolatile<>'v'
 OR v_before.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
 OR v_before.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp','lock_timeout=3s']
 OR encode(sha256(convert_to((SELECT prosrc FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('public.read_platform_course_proposal_file_context(uuid,uuid,text,text,uuid)')),'UTF8')),'hex') IS DISTINCT FROM 'a359743c50a3c0f318fb9d3712d2638ce067f1d95f4397008d1bcc432a1cec72'
 THEN RAISE EXCEPTION 'CURRENT_FILE_REVIEW_EXACT_READ_AND_SELECTED_METADATA_PREIMAGE_REQUIRED';END IF;
 IF public.pcf_v1_delivery_capabilities()->>'frontend_consumers_accepted' IS DISTINCT FROM 'false'
 OR public.pcf_v1_delivery_capabilities()->>'copied_centre_exact_binding_supported' IS DISTINCT FROM 'false'
 OR public.pcf_v1_delivery_capabilities()->>'frozen_reader_implemented' IS DISTINCT FROM 'false'
 THEN RAISE EXCEPTION 'CURRENT_FILE_REVIEW_CAPABILITIES_MUST_REMAIN_FALSE';END IF;
 v_stamp:=public.pcf_v1_enforcement_stamp();
 SELECT encode(sha256(convert_to(coalesce(string_agg(p.oid::text||E'\t'||to_jsonb(p)::text,E'\n'ORDER BY p.oid),''),'UTF8')),'hex') INTO v_others
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.oid<>v_before.oid;
 EXECUTE $current_file_review_definition$CREATE OR REPLACE FUNCTION public.read_platform_course_publication_review_context(
 p_marketplace_id uuid,p_proposal_id uuid DEFAULT NULL,
 p_expected_edition_sha256 text DEFAULT NULL,p_history_before_sequence text DEFAULT NULL,
 p_confirm_event_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $f$
DECLARE v_course uuid;v_actor uuid;v_ready jsonb;v_manifest jsonb;v_proposal public.platform_course_publication_review_events;
 v_before bigint;v_rows jsonb;v_has_more boolean;v_next text;v_selected jsonb;v_file_unconfirmed boolean;
 v_confirmed public.platform_course_publication_review_events;v_confirmed_json jsonb;
 v_file_state text;v_embedded_unconfirmed boolean;v_complete boolean;v_reference_ok boolean;
 v_ref record;v_selected_file jsonb;v_current_binding jsonb;v_binding_count bigint;v_reference_count integer:=0;
 v_current_refs jsonb:='[]';v_current_file_context jsonb;
BEGIN
 -- Same ordinary active moderator/RC/own-parent/fence/private-event authority
 -- as mutation RPCs. No service_role or client-GUC permission bypass.
 v_course:=public.pcr_v2_enter(p_marketplace_id);v_actor:=public.pcr_v2_actor(false);
 v_ready:=public.pcr_v2_readiness(p_marketplace_id);
 IF p_expected_edition_sha256 IS NOT NULL AND p_expected_edition_sha256 IS DISTINCT FROM v_ready->>'edition_sha256' THEN RAISE EXCEPTION 'PCR_SOURCE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 IF p_history_before_sequence IS NOT NULL THEN
  IF p_history_before_sequence!~'^[1-9][0-9]{0,18}$' OR NOT pg_input_is_valid(p_history_before_sequence,'bigint') THEN RAISE EXCEPTION 'PCR_INVALID_HISTORY_CURSOR' USING ERRCODE='22023';END IF;
  v_before:=p_history_before_sequence::bigint;
 END IF;
 IF p_proposal_id IS NULL THEN
  SELECT * INTO v_proposal FROM public.platform_course_publication_review_events
   WHERE marketplace_id=p_marketplace_id AND course_id=v_course AND organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95' AND event_kind='submitted'
   ORDER BY sequence DESC LIMIT 1;
 ELSE
  SELECT * INTO v_proposal FROM public.platform_course_publication_review_events
   WHERE id=p_proposal_id AND marketplace_id=p_marketplace_id AND course_id=v_course AND organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95' AND event_kind='submitted';
  IF v_proposal.id IS NULL THEN RAISE EXCEPTION 'PCR_PROPOSAL_UNAVAILABLE' USING ERRCODE='P0002';END IF;
 END IF;
 IF v_proposal.id IS NOT NULL THEN
  v_selected:=jsonb_build_object('id',v_proposal.id,'marketplace_id',v_proposal.marketplace_id,'course_id',v_proposal.course_id,
   'edition_sha256',v_proposal.edition_sha256,'submitted_at',v_proposal.recorded_at,'submitted_by',v_proposal.actor_id,'request_id',v_proposal.request_id,
   'is_current',v_proposal.id::text IS NOT DISTINCT FROM v_ready->>'proposal_id' AND v_proposal.edition_sha256 IS NOT DISTINCT FROM v_ready->>'edition_sha256',
   'dossier',v_proposal.review_payload,'source_context',public.pcr_v2_review_source_context(v_proposal.canonical_manifest));
 END IF;
 IF p_confirm_event_id IS NOT NULL THEN
  SELECT * INTO v_confirmed FROM public.platform_course_publication_review_events
   WHERE id=p_confirm_event_id AND marketplace_id=p_marketplace_id AND course_id=v_course AND organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95';
  IF v_confirmed.id IS NULL THEN RAISE EXCEPTION 'PCR_EVENT_UNAVAILABLE' USING ERRCODE='P0002';END IF;
  v_confirmed_json:=jsonb_build_object('id',v_confirmed.id,'sequence',v_confirmed.sequence::text,'proposal_id',v_confirmed.proposal_id,'event_kind',v_confirmed.event_kind,
   'edition_sha256',v_confirmed.edition_sha256,'recorded_at',v_confirmed.recorded_at,'actor_id',v_confirmed.actor_id,'request_id',v_confirmed.request_id,
   'decision',CASE WHEN v_confirmed.event_kind='review_decided' THEN v_confirmed.review_payload->'decision' END,
   'notes',CASE WHEN v_confirmed.event_kind='review_decided' THEN v_confirmed.review_payload->'notes' END,
   'next_review_at',CASE WHEN v_confirmed.event_kind='review_decided' THEN v_confirmed.review_payload->'next_review_at' END,
   'same_person_review',CASE WHEN v_confirmed.event_kind='review_decided' THEN v_confirmed.review_payload->'same_person_review' END);
 END IF;
 WITH bounded AS MATERIALIZED (
  SELECT e.*,row_number() OVER(ORDER BY sequence DESC) n FROM public.platform_course_publication_review_events e
  WHERE marketplace_id=p_marketplace_id AND course_id=v_course AND organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95' AND (v_before IS NULL OR sequence<v_before)
  ORDER BY sequence DESC LIMIT 26
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sequence',sequence::text,'proposal_id',proposal_id,'event_kind',event_kind,
   'edition_sha256',edition_sha256,'recorded_at',recorded_at,'actor_id',actor_id,'request_id',request_id,
   'decision',CASE WHEN event_kind='review_decided' THEN review_payload->'decision' END,
   'notes',CASE WHEN event_kind='review_decided' THEN review_payload->'notes' END,
   'next_review_at',CASE WHEN event_kind='review_decided' THEN review_payload->'next_review_at' END,
   'same_person_review',CASE WHEN event_kind='review_decided' THEN review_payload->'same_person_review' END) ORDER BY sequence DESC) FILTER(WHERE n<=25),'[]'),
   count(*)>25,min(sequence) FILTER(WHERE n<=25)::text INTO v_rows,v_has_more,v_next FROM bounded;
 v_manifest:=public.pcr_v2_manifest(v_course,p_marketplace_id);
 IF public.pcr_v2_sha(v_manifest) IS DISTINCT FROM v_ready->>'edition_sha256' THEN RAISE EXCEPTION 'PCR_SOURCE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 -- Exact V3 predicate, read only. A separate trusted immutable-file adapter is
 -- required before a file-backed course can ever become eligible.
 SELECT EXISTS(SELECT 1 FROM public.course_documents WHERE course_id=v_course)
 OR EXISTS(SELECT 1 FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id WHERE l.course_id=v_course)
 OR EXISTS(SELECT 1 FROM public.lessons WHERE course_id=v_course AND (type IN ('video','audio','pdf','file','presentation') OR content ~* '(https?://|<iframe|<(audio|video)|"(imageSrc|videoSrc|fileUrl)"[[:space:]]*:)')) INTO v_file_unconfirmed;

 -- A saved historical receipt is inspection evidence, not current readiness.
 -- This proof requires the caller's explicit current proposal/edition selection.
 v_file_state:=CASE WHEN v_file_unconfirmed THEN 'unconfirmed' ELSE 'no_file_reference_detected' END;
 SELECT EXISTS(SELECT 1 FROM public.lessons WHERE course_id=v_course AND
  (type IN('video','audio','pdf','file','presentation') OR content ~* '(https?://|<iframe|<(audio|video)|"(imageSrc|videoSrc|fileUrl)"[[:space:]]*:)'))
 INTO v_embedded_unconfirmed;
 IF p_proposal_id IS NOT NULL AND p_expected_edition_sha256 IS NOT NULL
  AND v_proposal.id=p_proposal_id
  AND v_proposal.id::text IS NOT DISTINCT FROM v_ready->>'proposal_id'
  AND v_proposal.edition_sha256 IS NOT DISTINCT FROM p_expected_edition_sha256
  AND v_proposal.edition_sha256 IS NOT DISTINCT FROM v_ready->>'edition_sha256'
  AND v_proposal.canonical_manifest IS NOT DISTINCT FROM v_manifest THEN
  v_complete:=NOT v_embedded_unconfirmed
   AND v_manifest->>'file_bindings_schema_version'='1'
   AND jsonb_typeof(v_manifest->'file_bindings')='array';
  FOR v_ref IN
   SELECT 'course_document'::text kind,d.id FROM public.course_documents d WHERE d.course_id=v_course
   UNION ALL SELECT 'lesson_attachment',a.id FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id WHERE l.course_id=v_course
   ORDER BY kind,id
  LOOP
   v_reference_count:=v_reference_count+1;
   v_selected_file:=public.read_platform_course_proposal_file_context(
    p_marketplace_id,p_proposal_id,p_expected_edition_sha256,v_ref.kind,v_ref.id);
   SELECT count(*),(jsonb_agg(x))->0 INTO v_binding_count,v_current_binding
    FROM jsonb_array_elements(coalesce(v_manifest->'file_bindings','[]'::jsonb)) AS current_bindings(x)
    WHERE x->>'reference_kind'=v_ref.kind AND x->>'reference_id'=v_ref.id::text;
   v_reference_ok:=v_binding_count=1 AND v_current_binding->>'state'='bytes_sealed'
    AND v_selected_file->>'state'='bytes_sealed'
    AND v_selected_file->>'actor_id'=v_actor::text
    AND v_selected_file->>'organization_id'='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
    AND v_selected_file->>'marketplace_id'=p_marketplace_id::text
    AND v_selected_file->>'course_id'=v_course::text
    AND v_selected_file->>'proposal_id'=p_proposal_id::text
    AND v_selected_file->>'proposal_edition_sha256'=p_expected_edition_sha256
    AND v_selected_file->>'reference_kind'=v_ref.kind AND v_selected_file->>'reference_id'=v_ref.id::text
    AND v_selected_file->>'delivery_scope'='selected_platform_proposal_moderator_only_not_learner_acceptance'
    AND v_selected_file->'receipt'->>'receipt_id'=v_current_binding->>'receipt_id'
    AND v_selected_file->'receipt'->>'captured_edition_id'=v_current_binding->>'captured_edition_id'
    AND v_selected_file->'receipt'->'source_org_version_id' IS NOT DISTINCT FROM v_current_binding->'source_org_version_id'
    AND v_selected_file->'receipt'->>'file_bytes_sha256'=v_current_binding->>'file_bytes_sha256'
    AND v_selected_file->'receipt'->'byte_length' IS NOT DISTINCT FROM v_current_binding->'byte_length';
   IF v_reference_ok IS DISTINCT FROM true THEN v_complete:=false;END IF;
   v_current_refs:=v_current_refs||jsonb_build_array(jsonb_build_object(
    'reference_kind',v_ref.kind,'reference_id',v_ref.id,
    'state',CASE WHEN v_reference_ok IS TRUE THEN 'bytes_sealed' ELSE 'unconfirmed' END,
    'receipt',CASE WHEN v_reference_ok IS TRUE THEN v_selected_file->'receipt' ELSE NULL END));
  END LOOP;
  IF jsonb_typeof(v_manifest->'file_bindings') IS DISTINCT FROM 'array'
   OR jsonb_array_length(v_manifest->'file_bindings')<>v_reference_count THEN v_complete:=false;END IF;
  v_file_state:=CASE WHEN v_reference_count=0 AND NOT v_embedded_unconfirmed THEN 'no_file_reference_detected'
   WHEN v_complete IS TRUE AND v_reference_count>0 THEN 'sealed_current' ELSE 'unconfirmed' END;
  v_current_file_context:=jsonb_build_object('schema_version',1,'actor_id',v_actor,
   'organization_id','4ac2c05a-d8b5-4e72-ba31-f2c743091d95','marketplace_id',p_marketplace_id,
   'course_id',v_course,'proposal_id',p_proposal_id,'proposal_edition_sha256',p_expected_edition_sha256,
   'current_edition_sha256',v_ready->'edition_sha256','scope_generation',v_manifest->'scope_generation',
   'state',v_file_state,'reference_count',v_reference_count,'references',v_current_refs);
 END IF;
 -- Recheck the same edition and actor after all per-reference work. The existing
 -- course/library transaction fences remain held; no browser receipt is trusted.
 IF public.pcr_v2_sha(public.pcr_v2_manifest(v_course,p_marketplace_id)) IS DISTINCT FROM v_ready->>'edition_sha256' THEN
  RAISE EXCEPTION 'PCR_SOURCE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 PERFORM public.pcr_v2_actor(false);
 RETURN jsonb_build_object('schema_version',1,'marketplace_id',p_marketplace_id,'course_id',v_course,'organization_id','4ac2c05a-d8b5-4e72-ba31-f2c743091d95',
  'actor_id',v_actor,'current_edition_sha256',v_ready->'edition_sha256','readiness',v_ready,'proposal',v_selected,
  'current_source_context',public.pcr_v2_review_source_context(v_manifest),'current_file_state',v_file_state,'current_file_context',v_current_file_context,
  'confirmed_event',v_confirmed_json,'history',v_rows,'history_has_more',v_has_more,'history_next_before_sequence',CASE WHEN v_has_more THEN v_next ELSE NULL END,
  'decision_scope','platform_template_only_not_centre_or_qualification');
END $f$;$current_file_review_definition$;
 SELECT * INTO v_after FROM pg_catalog.pg_proc WHERE oid=v_before.oid;
 IF v_after.oid IS NULL OR (to_jsonb(v_before)-'prosrc') IS DISTINCT FROM(to_jsonb(v_after)-'prosrc')
 OR encode(sha256(convert_to(v_after.prosrc,'UTF8')),'hex')<>'b1387be7f8362f6d1d1e31611109ce0af0c15d1e70aff0886c9b974efce007a2'
 OR public.pcf_v1_enforcement_stamp() IS DISTINCT FROM v_stamp
 OR v_others IS DISTINCT FROM(SELECT encode(sha256(convert_to(coalesce(string_agg(p.oid::text||E'\t'||to_jsonb(p)::text,E'\n'ORDER BY p.oid),''),'UTF8')),'hex') FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.oid<>v_before.oid)
 THEN RAISE EXCEPTION 'CURRENT_FILE_REVIEW_BODY_ONLY_AFTERIMAGE_OR_STAMP_DRIFT';END IF;
END $current_file_review_install$;
COMMIT;
