-- Forward-only own-inbox readmodel correction. Do not replay installed1300.
-- Existing ABI/ACL/owner/configuration and all stored facts remain unchanged.
-- A canonical confirmation may recapture equivalent immutable content into a
-- NEW snapshot ID. Historical evidence is distinct from current readiness.
BEGIN;
SET LOCAL search_path=pg_catalog,public;
DO $preflight$
BEGIN
 IF current_user<>'postgres'OR to_regclass('uc_issued_recipient_private.intents')IS NULL
  OR to_regprocedure('uc_issued_recipient_private.recorded_proof(uc_issued_recipient_private.intents)')IS NULL
  OR to_regprocedure('public.uc_education_artifact_saved_source(uuid)')IS NULL
  OR to_regprocedure('public.uc_signature_assurance_object_snapshot(text,text)')IS NULL
  OR to_regprocedure('uc_issued_recipient_private.own_source_status(uuid)')IS NOT NULL
 THEN RAISE EXCEPTION 'B1_INBOX_FORWARD_DEPENDENCY_OR_COLLISION';END IF;
 IF(SELECT md5(prosrc)FROM pg_proc WHERE oid=to_regprocedure('public.read_student_document_inbox(uuid,timestamptz,uuid,integer)'))
  IS DISTINCT FROM'ad60fe5d2fa071efe8dc7eece231aa99'
 THEN RAISE EXCEPTION 'B1_INBOX_FORWARD_PREIMAGE_CHANGED';END IF;
END;$preflight$;

-- Only a scalar metadata status is returned. This is the actual authenticated
-- OWN-recipient leg, never a staff read/issue permission or a file capability.
-- Pure saved-source comparators are reused after this exact recipient fence;
-- neither staff-only record_scope/source RPC nor service auth is impersonated.
CREATE FUNCTION uc_issued_recipient_private.own_source_status(p_signature uuid)RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout='2000ms'AS $fn$
DECLARE s public.document_signatures;intent uc_issued_recipient_private.intents;r public.education_document_records;
 st public.uc_education_issuance_states;item public.uc_education_issuance_preparation_items;v public.org_document_versions;o storage.objects;
 saved jsonb;object_now jsonb;proof_id uuid;proof public.uc_signature_assurance_file_proofs;expected_file jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR NOT public.account_deletion_access_allowed()
 THEN RAISE EXCEPTION 'B1_INBOX_OWN_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT *INTO s FROM public.document_signatures WHERE id=p_signature AND recipient_user_id=auth.uid()FOR SHARE NOWAIT;
 IF s.id IS NULL OR NOT public.uc_signature_actor_allowed(s.id,false,true)
  OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid()AND p.organization_id=s.organization_id)
 THEN RAISE EXCEPTION 'B1_INBOX_OWN_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT *INTO intent FROM uc_issued_recipient_private.intents WHERE signature_id=s.id AND organization_id=s.organization_id;
 IF intent.id IS NULL THEN RAISE EXCEPTION 'B1_INBOX_EXPECTED_LINK_MISSING';END IF;
 IF intent.subject_user_id IS DISTINCT FROM auth.uid()THEN RAISE EXCEPTION 'B1_INBOX_OWN_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 PERFORM public.uc_signature_assurance_file_fence(s,auth.uid(),false,intent.subject_user_id,intent.subject_user_id,ARRAY[intent.subject_user_id,intent.created_by]);
 IF s.document_type IS DISTINCT FROM'education_document'OR s.document_id IS DISTINCT FROM intent.record_id
  OR s.sender_user_id IS DISTINCT FROM intent.created_by OR s.recipient_user_id IS DISTINCT FROM intent.subject_user_id
 THEN RETURN'source_changed';END IF;
 SELECT *INTO r FROM public.education_document_records WHERE id=intent.record_id AND organization_id=intent.organization_id FOR SHARE NOWAIT;
 SELECT *INTO st FROM public.uc_education_issuance_states WHERE record_id=intent.record_id AND organization_id=intent.organization_id FOR SHARE NOWAIT;
 IF r.id IS NULL OR r.deleted_at IS NOT NULL OR st.record_id IS NULL OR st.redacted OR st.proof IS NULL OR st.annulment IS NOT NULL OR st.artifact IS NULL OR st.artifact='null'::jsonb
 THEN RETURN'source_unavailable';END IF;
 IF r.user_id IS DISTINCT FROM intent.subject_user_id OR r.enrollment_id IS DISTINCT FROM intent.enrollment_id
  OR r.course_id IS DISTINCT FROM intent.course_id OR r.group_id IS DISTINCT FROM intent.group_id
  OR st.user_id IS DISTINCT FROM intent.subject_user_id OR st.enrollment_id IS DISTINCT FROM intent.enrollment_id
  OR st.course_id IS DISTINCT FROM intent.course_id OR st.group_id IS DISTINCT FROM intent.group_id
  OR st.revision IS DISTINCT FROM intent.record_revision OR public.uc_education_issue_state_hash(r.id)IS DISTINCT FROM intent.record_state_sha256
  OR st.artifact IS DISTINCT FROM intent.artifact
 THEN RETURN'source_changed';END IF;
 IF NOT uc_issued_recipient_private.artifact(intent.artifact)THEN RAISE EXCEPTION 'B1_INBOX_STORED_ARTIFACT_INVALID';END IF;
 SELECT *INTO item FROM public.uc_education_issuance_preparation_items WHERE id=(intent.artifact->>'item_id')::uuid AND preparation_id=(intent.artifact->>'preparation_id')::uuid AND organization_id=intent.organization_id FOR SHARE NOWAIT;
 IF item.id IS NULL OR item.redacted THEN RETURN'source_unavailable';END IF;
 IF item.final_record_id IS DISTINCT FROM intent.record_id OR item.user_id IS DISTINCT FROM intent.subject_user_id OR item.enrollment_id IS DISTINCT FROM intent.enrollment_id
  OR item.course_id IS DISTINCT FROM intent.course_id OR item.group_id IS DISTINCT FROM intent.group_id
  OR item.input_revision::text IS DISTINCT FROM intent.artifact->>'input_revision'OR item.artifact IS NULL
  OR item.artifact->'source'IS DISTINCT FROM intent.artifact->'source'OR item.artifact->'byte_sha256'IS DISTINCT FROM intent.artifact->'byte_sha256'
  OR item.artifact->'byte_size'IS DISTINCT FROM intent.artifact->'byte_size'OR item.artifact->'render_input_hash'IS DISTINCT FROM intent.artifact->'render_input_hash'
  OR item.artifact->'html_sha256'IS DISTINCT FROM intent.artifact->'html_sha256'OR item.artifact->'template_byte_sha256'IS DISTINCT FROM intent.artifact->'template_byte_sha256'
 THEN RETURN'source_changed';END IF;
 -- This existing helper is an owner-private PURE metadata comparator, with no
 -- staff permission/actor substitution and no file transfer.
 saved:=public.uc_education_artifact_saved_source(item.id);
 IF saved IS NULL THEN RETURN'source_unavailable';END IF;
 IF saved->'source'IS DISTINCT FROM intent.artifact->'source'THEN RETURN'source_changed';END IF;
 SELECT *INTO v FROM public.org_document_versions WHERE organization_id=intent.organization_id AND document_id=(intent.artifact->'source'->>'document_id')::uuid AND id=(intent.artifact->'source'->>'version_id')::uuid FOR SHARE NOWAIT;
 IF v.id IS NULL THEN RETURN'source_unavailable';END IF;
 SELECT *INTO o FROM storage.objects WHERE id=v.storage_object_id AND bucket_id='org-documents'AND name=v.file_path FOR SHARE NOWAIT;
 IF o.id IS NULL THEN RETURN'source_unavailable';END IF;
 IF NOT public.uc_copy_registry_object_matches(v)OR public.uc_copy_registry_original_ref(v)IS DISTINCT FROM intent.artifact->'source'
  OR v.file_size IS DISTINCT FROM(intent.artifact->>'byte_size')::bigint OR lower(btrim(v.storage_metadata->>'mimetype'))IS DISTINCT FROM'application/pdf'
  OR saved->'object'->>'object_id'IS DISTINCT FROM o.id::text OR(saved->'object'->>'updated_at')::timestamptz IS DISTINCT FROM o.updated_at
 THEN RETURN'source_changed';END IF;
 IF uc_issued_recipient_private.binding(intent)IS NULL THEN RETURN'source_unavailable';END IF;
 proof_id:=uc_issued_recipient_private.recorded_proof(intent);
 IF proof_id IS NULL THEN RETURN'source_unavailable';END IF;
 SELECT *INTO STRICT proof FROM public.uc_signature_assurance_file_proofs WHERE id=proof_id AND organization_id=intent.organization_id;
 object_now:=public.uc_signature_assurance_object_snapshot('org-documents',v.file_path);
 expected_file:=jsonb_build_object('bucket','org-documents','path',v.file_path,'sha256',intent.artifact->>'byte_sha256','bytes',intent.artifact->'byte_size','mime','application/pdf');
 IF proof.proof->'file'IS DISTINCT FROM expected_file OR proof.proof->'object_after'IS DISTINCT FROM object_now THEN RETURN'source_changed';END IF;
 RETURN'available';
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IN('B1_SOURCE_CHANGED','SIGNATURE_EVIDENCE_SOURCE_CHANGED','EDUCATION_ISSUANCE_SOURCE_CHANGED')THEN RETURN'source_changed';END IF;
 IF SQLERRM IN('SIGNATURE_EVIDENCE_SOURCE_UNAVAILABLE','EDUCATION_ISSUANCE_SOURCE_UNAVAILABLE')THEN RETURN'source_unavailable';END IF;
 -- Authority errors/lock conflicts/unknown dependencies must not become a
 -- fabricated zero pending count. The public inbox returns its normal error.
 RAISE;
END;$fn$;
DO $new_helper_acl$
DECLARE f record;grantee oid;
BEGIN
 SELECT p.oid,p.proowner,p.proacl,p.oid::regprocedure identity INTO STRICT f FROM pg_proc p WHERE p.oid='uc_issued_recipient_private.own_source_status(uuid)'::regprocedure;
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.identity);
 FOR grantee IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))a WHERE a.grantee<>f.proowner AND a.grantee<>0 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.identity,pg_get_userbyid(grantee));
 END LOOP;
END;$new_helper_acl$;

-- Guarded unique-needle patches retain every unrelated old branch and ABI.
DO $forward_body$
DECLARE old_body text;new_body text;patch jsonb;old_metadata jsonb;actual_metadata jsonb;
 patches constant jsonb:=$inbox_patches$[{"old":"d.recipient_user_id AS snapshot_recipient,\n","new":"d.recipient_user_id AS snapshot_recipient,d.source_file_state AS bound_source_file_state,d.original_file AS bound_original_file,d.captured_at AS bound_captured_at,b.agreement_sha256 AS bound_agreement_hash,\n   ed.id AS event_snapshot_row_id,ed.document_revision_id AS event_snapshot_revision,ed.html_sha256 AS event_snapshot_html_hash,ed.recipient_user_id AS event_snapshot_recipient,\n   ed.source_file_state AS event_source_file_state,ed.original_file AS event_original_file,ed.captured_at AS event_captured_at,\n"},{"old":"ev.server_at AS evidence_at,\n","new":"ev.server_at AS evidence_at,ev.payload->'original_file' AS evidence_original_file,ev.payload->>'method' AS evidence_method,\n   ev.payload->'actor' AS evidence_actor_payload,ev.agreement_event_id AS evidence_agreement_id,ev.payload->>'agreement_sha256' AS evidence_agreement_hash,\n"},{"old":"   ORDER BY e.revision DESC LIMIT 1)ev ON true\n","new":"   ORDER BY CASE WHEN b.id IS NOT NULL AND e.kind IN('account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked')THEN 0 ELSE 1 END,e.revision DESC LIMIT 1)ev ON true\n  LEFT JOIN public.uc_signature_assurance_document_snapshots ed ON ed.id=ev.document_snapshot_id\n   AND ed.organization_id=p_organization_id AND ed.signature_id=s.id AND ed.party_role='recipient'\n"},{"old":"ELSE NULL END AS current_html_hash\n","new":"ELSE NULL END AS current_html_hash,\n   CASE WHEN EXISTS(SELECT 1 FROM uc_issued_recipient_private.intents bi WHERE bi.organization_id=m.organization_id AND bi.signature_id=m.id)\n    THEN uc_issued_recipient_private.own_source_status(m.id)ELSE NULL END AS controlled_source_state\n"},{"old":"AS current_source_available,c.current_html_hash\n","new":"AS current_source_available,c.current_html_hash,c.controlled_source_state\n"},{"old":"AND h.snapshot_html_hash=h.current_html_hash AND h.bound_recipient=actor AND h.snapshot_recipient=actor,false) AS exact_source","new":"AND h.snapshot_html_hash=h.current_html_hash AND h.bound_recipient=actor AND h.snapshot_recipient=actor\n   AND coalesce(h.controlled_source_state='available',true),false) AS exact_source"},{"old":" ), classified AS MATERIALIZED(\n  SELECT m.*,coalesce(m.exact_source AND m.evidence_binding_id=m.binding_id AND m.evidence_snapshot_id=m.document_snapshot_id\n   AND m.evidence_policy_version_id=m.policy_version_id AND m.evidence_policy_hash=m.policy_sha256\n   AND m.evidence_html_hash=m.current_html_hash\n   AND m.evidence_document_revision IS NOT DISTINCT FROM coalesce(to_jsonb(m.current_revision_id),'null'::jsonb)\n   AND (m.evidence_kind<>'account_confirmed'OR m.evidence_actor=actor),false)AS exact_event\n  FROM matched m\n","new":" ), event_checks AS MATERIALIZED(\n  -- A new capture ID is normal. Compare immutable canonical content/context,\n  -- including the complete original-file tuple and real stored proof. A proof\n  -- is NOT retrospectively assigned a per-capture FK that was never stored.\n  SELECT m.id,coalesce(m.snapshot_id IS NOT NULL AND m.event_snapshot_row_id IS NOT NULL\n   AND m.bound_recipient=actor AND m.snapshot_recipient=actor AND m.event_snapshot_recipient=actor\n   AND m.bound_document_revision_id IS NOT DISTINCT FROM m.event_snapshot_revision\n   AND m.snapshot_html_hash=m.event_snapshot_html_hash\n   AND m.bound_source_file_state=m.event_source_file_state\n   AND m.bound_original_file IS NOT DISTINCT FROM m.event_original_file\n   AND m.evidence_original_file IS NOT DISTINCT FROM coalesce(m.bound_original_file,'null'::jsonb)\n   AND(m.bound_original_file IS NULL AND m.bound_source_file_state='not_present'\n    OR m.bound_original_file IS NOT NULL AND m.bound_source_file_state='verified_bytes'\n     AND public.uc_signature_assurance_shape(m.bound_original_file,ARRAY['bucket','path','sha256','bytes','mime'])\n     AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_file_proofs proof\n      WHERE proof.organization_id=p_organization_id AND proof.signature_id=m.id AND proof.party_role='recipient'\n       AND proof.verified_at<=least(m.bound_captured_at,m.event_captured_at)\n       AND proof.proof->>'assurance'='trusted_service_reread'\n       AND proof.proof->'file'=m.bound_original_file\n       AND proof.proof->'source'->>'organization_id'=p_organization_id::text\n       AND proof.proof->'source'->>'signature_id'=m.id::text\n       AND proof.proof->'source'->>'chosen_party'='recipient'\n       AND proof.proof->'source'->>'purpose'='source'\n       AND proof.proof->'source'->>'document_html_sha256'=m.snapshot_html_hash\n       AND proof.proof->'source'->'document_revision_id'IS NOT DISTINCT FROM coalesce(to_jsonb(m.bound_document_revision_id),'null'::jsonb)\n       AND proof.proof->'source'->>'bucket'=m.bound_original_file->>'bucket'\n       AND proof.proof->'source'->>'path'=m.bound_original_file->>'path'\n       AND jsonb_typeof(proof.proof->'object_before')='object'\n       AND proof.proof->'object_before'=proof.proof->'object_after')),\n   false)AS capture_equivalent\n  FROM matched m JOIN hash_candidates h ON h.id=m.id\n ), classified AS MATERIALIZED(\n  SELECT m.*,coalesce(checks.capture_equivalent AND m.evidence_binding_id=m.binding_id\n   AND m.evidence_snapshot_id=m.event_snapshot_row_id\n   AND m.evidence_policy_version_id=m.policy_version_id AND m.evidence_policy_hash=m.policy_sha256\n   AND m.evidence_html_hash=m.event_snapshot_html_hash\n   AND m.evidence_document_revision IS NOT DISTINCT FROM coalesce(to_jsonb(m.event_snapshot_revision),'null'::jsonb)\n   AND(m.evidence_kind<>'account_confirmed'OR m.evidence_actor=actor\n    AND m.evidence_actor_payload->>'user_id'=actor::text AND m.evidence_actor_payload->>'observed_mode'='account'\n    AND m.evidence_method='authenticated_account_confirmation')\n   AND(m.evidence_conclusion<>'policy_eligible_account_confirmation'\n    OR m.evidence_kind='account_confirmed'AND m.evidence_agreement_hash=m.bound_agreement_hash\n     AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_agreements agreement\n      WHERE agreement.organization_id=p_organization_id AND agreement.id=m.evidence_agreement_id\n       AND agreement.subject_user_id=m.bound_recipient AND agreement.policy_version_id=m.policy_version_id\n       AND agreement.policy_sha256=m.policy_sha256 AND agreement.terms->>'sha256'=m.evidence_agreement_hash)),false)AS exact_event\n  FROM matched m LEFT JOIN event_checks checks ON checks.id=m.id\n"},{"old":"WHEN c.status='rejected' OR c.evidence_kind='recipient_rejected' THEN 'rejected'\n","new":"WHEN c.status='rejected' OR c.evidence_kind='recipient_rejected' THEN 'rejected'\n   WHEN c.controlled_source_state='source_unavailable'THEN'source_unavailable'\n   WHEN c.controlled_source_state='source_changed'THEN'source_changed'\n"},{"old":"'document_revision_id',p.current_revision_id,\n    'document_html_sha256',p.current_html_hash,","new":"'document_revision_id',CASE WHEN p.binding_id IS NOT NULL THEN p.bound_document_revision_id ELSE p.current_revision_id END,\n    'document_html_sha256',CASE WHEN p.binding_id IS NOT NULL THEN p.snapshot_html_hash ELSE p.current_html_hash END,"}]$inbox_patches$::jsonb;
BEGIN
 SELECT prosrc,to_jsonb(p)-'prosrc' INTO STRICT old_body,old_metadata FROM pg_proc p WHERE oid='public.read_student_document_inbox(uuid,timestamptz,uuid,integer)'::regprocedure;
 IF md5(old_body)<>'ad60fe5d2fa071efe8dc7eece231aa99'THEN RAISE EXCEPTION 'B1_INBOX_BODY_PREIMAGE_CHANGED';END IF;
 new_body:=old_body;
 FOR patch IN SELECT value FROM jsonb_array_elements(patches)LOOP
  IF(length(new_body)-length(replace(new_body,patch->>'old','')))/length(patch->>'old')<>1 THEN RAISE EXCEPTION 'B1_INBOX_UNIQUE_PATCH_NEEDLE_CHANGED';END IF;
  new_body:=replace(new_body,patch->>'old',patch->>'new');
 END LOOP;
 IF md5(new_body)<>'66be66c31d8f6e3c8208b55a747fc61d'THEN RAISE EXCEPTION 'B1_INBOX_EXPECTED_POSTIMAGE_CHANGED';END IF;
 EXECUTE format('CREATE OR REPLACE FUNCTION public.read_student_document_inbox(p_organization_id uuid,p_after_created_at timestamptz DEFAULT NULL,p_after_id uuid DEFAULT NULL,p_limit integer DEFAULT 50)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone=''UTC'' AS %L',new_body);
 SELECT to_jsonb(p)-'prosrc' INTO STRICT actual_metadata FROM pg_proc p WHERE oid='public.read_student_document_inbox(uuid,timestamptz,uuid,integer)'::regprocedure;
 IF actual_metadata IS DISTINCT FROM old_metadata THEN RAISE EXCEPTION 'B1_INBOX_EXISTING_METADATA_AUTHORITY_CHANGED';END IF;
 IF(SELECT prosrc FROM pg_proc WHERE oid='public.read_student_document_inbox(uuid,timestamptz,uuid,integer)'::regprocedure)IS DISTINCT FROM new_body THEN RAISE EXCEPTION 'B1_INBOX_ACTUAL_POSTIMAGE_CHANGED';END IF;
END;$forward_body$;
COMMIT;
