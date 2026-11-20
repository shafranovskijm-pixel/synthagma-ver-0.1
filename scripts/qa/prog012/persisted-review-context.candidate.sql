-- SOURCE ONLY. Additive persisted own-review read contract; not applied/tested.
-- Depends on independently accepted V3 PCR core. No private table grant and
-- no replacement of core functions/triggers, old reviews, content or results.
BEGIN;
CREATE FUNCTION public.pcr_v2_review_source_context(p_manifest jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_build_object(
  'schema_version',1,'manifest_schema_version',p_manifest->'schema_version',
  'course_id',p_manifest->'course_id','marketplace_id',p_manifest->'marketplace_id',
  'modules',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v->'id') ORDER BY n) FROM jsonb_array_elements(coalesce(p_manifest->'modules','[]')) WITH ORDINALITY a(v,n)),'[]'),
  'lessons',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v->'id','module_id',v->'module_id','type',v->'type') ORDER BY n) FROM jsonb_array_elements(coalesce(p_manifest->'lessons','[]')) WITH ORDINALITY a(v,n)),'[]'),
  'file_bindings_schema_version',1,
  'file_bindings',coalesce((SELECT jsonb_agg(v ORDER BY k,n) FROM (
    SELECT 0 k,n,jsonb_build_object('reference_kind','course_document','reference_id',d->'id','receipt_id',NULL,'exact_version_kind',NULL,'exact_version_id',NULL,'file_bytes_sha256',NULL,'byte_length',NULL,'state','unconfirmed') v
    FROM jsonb_array_elements(coalesce(p_manifest->'documents','[]')) WITH ORDINALITY a(d,n)
    UNION ALL
    SELECT 1 k,l.n*1000000+a.n,jsonb_build_object('reference_kind','lesson_attachment','reference_id',a.v->'id','receipt_id',NULL,'exact_version_kind',NULL,'exact_version_id',NULL,'file_bytes_sha256',NULL,'byte_length',NULL,'state','unconfirmed')
    FROM jsonb_array_elements(coalesce(p_manifest->'lessons','[]')) WITH ORDINALITY l(v,n)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(l.v->'attachments','[]')) WITH ORDINALITY a(v,n)
   ) z),'[]'),
  'historical_content_state','fingerprint_only_not_reconstructed_from_current_bank',
  'file_authority_state','v3_unconfirmed_until_separate_trusted_file_receipt_adapter')
$f$;
REVOKE ALL ON FUNCTION public.pcr_v2_review_source_context(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_platform_course_publication_review_context(
 p_marketplace_id uuid,p_proposal_id uuid DEFAULT NULL,
 p_expected_edition_sha256 text DEFAULT NULL,p_history_before_sequence text DEFAULT NULL,
 p_confirm_event_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $f$
DECLARE v_course uuid;v_actor uuid;v_ready jsonb;v_manifest jsonb;v_proposal public.platform_course_publication_review_events;
 v_before bigint;v_rows jsonb;v_has_more boolean;v_next text;v_selected jsonb;v_file_unconfirmed boolean;
 v_confirmed public.platform_course_publication_review_events;v_confirmed_json jsonb;
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
 PERFORM public.pcr_v2_actor(false);
 RETURN jsonb_build_object('schema_version',1,'marketplace_id',p_marketplace_id,'course_id',v_course,'organization_id','4ac2c05a-d8b5-4e72-ba31-f2c743091d95',
  'actor_id',v_actor,'current_edition_sha256',v_ready->'edition_sha256','readiness',v_ready,'proposal',v_selected,
  'current_source_context',public.pcr_v2_review_source_context(v_manifest),'current_file_state',CASE WHEN v_file_unconfirmed THEN 'unconfirmed' ELSE 'no_file_reference_detected' END,
  'confirmed_event',v_confirmed_json,'history',v_rows,'history_has_more',v_has_more,'history_next_before_sequence',CASE WHEN v_has_more THEN v_next ELSE NULL END,
  'decision_scope','platform_template_only_not_centre_or_qualification');
END $f$;
REVOKE ALL ON FUNCTION public.read_platform_course_publication_review_context(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_platform_course_publication_review_context(uuid,uuid,text,text,uuid) TO authenticated;
COMMIT;
