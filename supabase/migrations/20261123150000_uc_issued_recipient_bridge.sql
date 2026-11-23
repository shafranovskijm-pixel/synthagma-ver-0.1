-- B1: durable request for receipt of an EXISTING controlled issued PDF.
-- No historical backfill, legal order, policy acceptance, learner signature,
-- physical handover or external message is manufactured by this migration.
BEGIN;
SET LOCAL search_path=pg_catalog,public;
DO $preflight$
DECLARE signature text;
BEGIN
 IF to_regnamespace('uc_issued_recipient_private') IS NOT NULL
  OR to_regprocedure('public.prepare_issued_recipient_request(uuid,uuid,jsonb)') IS NOT NULL
  OR to_regprocedure('public.read_issued_recipient_request(uuid,jsonb)') IS NOT NULL
  OR to_regprocedure('public.activate_issued_recipient_request(uuid,uuid,uuid,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'B1_ALREADY_INSTALLED_OR_NAME_COLLISION';END IF;
 FOREACH signature IN ARRAY ARRAY[
  'public.uc_signature_assurance_issued_source_as(uuid,uuid,bigint,text,uuid,text,boolean)',
  'public.uc_signature_assurance_policy_eligible(uuid,uuid)',
  'public.uc_signature_assurance_file_fence(public.document_signatures,uuid,boolean,uuid,uuid,uuid[])',
  'public.uc_signature_assurance_fence(uuid,uuid[],boolean,uuid,uuid,uuid)',
  'public.uc_document_has_action(uuid,text)',
  'public.uc_document_record_scope(uuid,uuid,uuid,uuid,uuid)',
  'public.apply_signature_assurance(uuid,uuid,integer,jsonb)',
  'public.uc_signature_assurance_object_snapshot(text,text)',
  'public.uc_signature_assurance_personal_counts(uuid)'
 ] LOOP
  IF to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'B1_DEPENDENCY_MISSING:%',signature;END IF;
 END LOOP;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.uc_signature_assurance_personal_counts(uuid)'::regprocedure)
  IS DISTINCT FROM '40f7ed8b7cd224b30e283325b7558b62'
 THEN RAISE EXCEPTION 'B1_PRIVACY_PREIMAGE_CHANGED';END IF;
END;$preflight$;

CREATE SCHEMA uc_issued_recipient_private;
REVOKE ALL ON SCHEMA uc_issued_recipient_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE uc_issued_recipient_private.intents(
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,record_id uuid NOT NULL,
 record_revision bigint NOT NULL CHECK(record_revision BETWEEN 1 AND 9007199254740991),
 record_state_sha256 text NOT NULL CHECK(record_state_sha256~'^[0-9a-f]{64}$'),
 artifact jsonb NOT NULL CHECK(jsonb_typeof(artifact)='object'),
 subject_user_id uuid NOT NULL,enrollment_id uuid NOT NULL,course_id uuid NOT NULL,group_id uuid,
 purpose text NOT NULL CHECK(purpose='electronic_copy_receipt'),
 policy_version_id uuid NOT NULL,policy_sha256 text NOT NULL CHECK(policy_sha256~'^[0-9a-f]{64}$'),
 policy_decision_revision integer NOT NULL CHECK(policy_decision_revision BETWEEN 1 AND 2147483646),
 classification jsonb NOT NULL CHECK(public.uc_signature_assurance_classification(classification)),
 signature_id uuid NOT NULL UNIQUE REFERENCES public.document_signatures(id) ON DELETE RESTRICT,
 html_sha256 text NOT NULL CHECK(html_sha256~'^[0-9a-f]{64}$'),
 verification_request_id uuid NOT NULL UNIQUE,bind_request_id uuid NOT NULL UNIQUE,activation_request_id uuid NOT NULL UNIQUE,
 prepare_request_id uuid NOT NULL,payload_sha256 text NOT NULL CHECK(payload_sha256~'^[0-9a-f]{64}$'),
 logical_source_key_sha256 text NOT NULL UNIQUE CHECK(logical_source_key_sha256~'^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,
 UNIQUE(organization_id,prepare_request_id),UNIQUE(id,organization_id),
 CHECK(isfinite(expires_at) AND expires_at>created_at AND expires_at<=created_at+interval '91 days'),
 CHECK(id<>signature_id AND verification_request_id<>bind_request_id AND bind_request_id<>activation_request_id
  AND verification_request_id<>activation_request_id)
);
ALTER TABLE uc_issued_recipient_private.intents ENABLE ROW LEVEL SECURITY;
CREATE INDEX b1_intent_record ON uc_issued_recipient_private.intents(organization_id,record_id,created_at DESC,id DESC);
CREATE INDEX b1_intent_subject ON uc_issued_recipient_private.intents(subject_user_id);
CREATE INDEX b1_intent_creator ON uc_issued_recipient_private.intents(created_by);
-- Persist every accepted prepare UUID, including aliases which converge on an
-- existing logical intent. Reusing an alias with different data must conflict.
CREATE TABLE uc_issued_recipient_private.prepare_receipts(
 organization_id uuid NOT NULL,request_id uuid NOT NULL,payload_sha256 text NOT NULL CHECK(payload_sha256~'^[0-9a-f]{64}$'),
 intent_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,
 PRIMARY KEY(organization_id,request_id),
 FOREIGN KEY(intent_id,organization_id)REFERENCES uc_issued_recipient_private.intents(id,organization_id)ON DELETE RESTRICT
);
ALTER TABLE uc_issued_recipient_private.prepare_receipts ENABLE ROW LEVEL SECURITY;
CREATE INDEX b1_receipt_intent ON uc_issued_recipient_private.prepare_receipts(intent_id);
CREATE INDEX b1_receipt_creator ON uc_issued_recipient_private.prepare_receipts(created_by);

CREATE FUNCTION uc_issued_recipient_private.fail(p_code text)RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'B1_%',p_code USING ERRCODE='PT409';END;$fn$;
CREATE FUNCTION uc_issued_recipient_private.failure(p_message text,p_state text)RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE code text;
BEGIN
 IF p_state='42501' THEN code:='ACCESS_DENIED';
 ELSIF p_state IN('22P02','22003','22023')THEN code:='INVALID_INPUT';
 ELSIF p_state IN('55P03','40001','40P01','23505')THEN code:='REVISION_CONFLICT';
 ELSE
  FOREACH code IN ARRAY ARRAY['ACCESS_DENIED','INVALID_INPUT','RECIPIENT_CONTACT_REQUIRED','POLICY_REQUIRED','POLICY_NOT_ACCEPTED','POLICY_CHANGED','SOURCE_CHANGED','SOURCE_UNAVAILABLE','REQUEST_CONFLICT','REVISION_CONFLICT','CLOSED','EXPIRED','DEPENDENCY_UNAVAILABLE']LOOP
   IF p_message IN('B1_'||code,'SIGNATURE_EVIDENCE_'||code)THEN RETURN jsonb_build_object('version',1,'ok',false,'code',code);END IF;
  END LOOP;
  code:='DEPENDENCY_UNAVAILABLE';
 END IF;
 RETURN jsonb_build_object('version',1,'ok',false,'code',code);
END;$fn$;

CREATE FUNCTION uc_issued_recipient_private.revision(p_value jsonb)RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN jsonb_typeof(p_value)='number'AND(p_value#>>'{}')~'^[0-9]{1,16}$'
  THEN(p_value#>>'{}')::numeric BETWEEN 1 AND 9007199254740991 ELSE false END
$fn$;
CREATE FUNCTION uc_issued_recipient_private.artifact(p_value jsonb)RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_signature_assurance_shape(p_value,ARRAY['preparation_id','item_id','input_revision','source','byte_sha256','byte_size','render_input_hash','template_byte_sha256','html_sha256','renderer','renderer_revision','output_review_id','output_review_revision'])
  AND public.uc_signature_assurance_uuid(p_value->'preparation_id')AND public.uc_signature_assurance_uuid(p_value->'item_id')
  AND uc_issued_recipient_private.revision(p_value->'input_revision')AND uc_issued_recipient_private.revision(p_value->'output_review_revision')
  AND public.uc_signature_assurance_uuid(p_value->'output_review_id')
  AND public.uc_signature_assurance_shape(p_value->'source',ARRAY['kind','document_id','version_id','content_hash'])
  AND p_value->'source'->>'kind'='org_document_version'
  AND public.uc_signature_assurance_uuid(p_value->'source'->'document_id')AND public.uc_signature_assurance_uuid(p_value->'source'->'version_id')
  AND public.uc_signature_assurance_sha(p_value->'source'->'content_hash')
  AND public.uc_signature_assurance_sha(p_value->'byte_sha256')AND public.uc_signature_assurance_integer(p_value->'byte_size',1,20971520)
  AND public.uc_signature_assurance_sha(p_value->'render_input_hash')AND public.uc_signature_assurance_sha(p_value->'template_byte_sha256')
  AND public.uc_signature_assurance_sha(p_value->'html_sha256')AND p_value->>'renderer'='browserless'AND p_value->>'renderer_revision'='uc019-v1',false)
$fn$;

-- Explicit mutation locks precede all shared fences. The existing signature
-- INSERT/UPDATE trigger takes exclusive42007 locks for sender and recipient.
-- Taking shared locks first would create an unsafe lock-upgrade composition.
CREATE FUNCTION uc_issued_recipient_private.people(p_people uuid[],p_write boolean)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE person uuid;
BEGIN
 FOR person IN SELECT DISTINCT x FROM unnest(p_people)x WHERE x IS NOT NULL ORDER BY x LOOP
  IF p_write THEN
   IF NOT pg_try_advisory_xact_lock(hashtextextended(person::text,42007))THEN PERFORM uc_issued_recipient_private.fail('REVISION_CONFLICT');END IF;
  ELSE
   IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(person::text,42007))THEN PERFORM uc_issued_recipient_private.fail('REVISION_CONFLICT');END IF;
  END IF;
  IF NOT public.uc_custom_journal_person(person)THEN PERFORM uc_issued_recipient_private.fail('ACCESS_DENIED');END IF;
 END LOOP;
END;$fn$;

CREATE FUNCTION uc_issued_recipient_private.record_scope(p_org uuid,p_record uuid,p_write boolean)RETURNS public.education_document_records
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.education_document_records;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR NOT public.account_deletion_access_allowed()
  OR NOT public.uc_signature_assurance_active()OR p_org IS NULL OR p_record IS NULL
  OR NOT public.uc_document_has_action(p_org,'read')
  OR p_write AND(NOT public.uc_document_has_action(p_org,'write')OR NOT public.uc_document_has_action(p_org,'sign'))
 THEN PERFORM uc_issued_recipient_private.fail('ACCESS_DENIED');END IF;
 SELECT *INTO r FROM public.education_document_records WHERE id=p_record AND organization_id=p_org AND deleted_at IS NULL;
 IF r.id IS NULL OR r.user_id IS NULL OR r.enrollment_id IS NULL OR r.course_id IS NULL
  OR NOT public.uc_document_record_scope(p_org,r.group_id,r.enrollment_id,r.user_id,r.course_id)
 THEN PERFORM uc_issued_recipient_private.fail('ACCESS_DENIED');END IF;
 RETURN r;
END;$fn$;

CREATE FUNCTION uc_issued_recipient_private.policy(p_org uuid,p_policy uuid,p_hash text,p_revision integer)RETURNS public.uc_signature_assurance_policy_versions
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v public.uc_signature_assurance_policy_versions;d public.uc_signature_assurance_policy_decisions;
BEGIN
 SELECT *INTO v FROM public.uc_signature_assurance_policy_versions WHERE id=p_policy AND organization_id=p_org FOR SHARE NOWAIT;
 IF v.id IS NULL THEN PERFORM uc_issued_recipient_private.fail('POLICY_REQUIRED');END IF;
 SELECT *INTO d FROM public.uc_signature_assurance_policy_decisions WHERE organization_id=p_org AND policy_version_id=v.id ORDER BY stream_revision DESC LIMIT 1 FOR SHARE NOWAIT;
 IF NOT public.uc_signature_assurance_policy_eligible(p_org,v.id)OR d.state IS DISTINCT FROM'centre_accepted'THEN PERFORM uc_issued_recipient_private.fail('POLICY_NOT_ACCEPTED');END IF;
 IF v.body_sha256 IS DISTINCT FROM p_hash OR d.stream_revision IS DISTINCT FROM p_revision THEN PERFORM uc_issued_recipient_private.fail('POLICY_CHANGED');END IF;
 IF v.body->'classification'->>'document_type'IS DISTINCT FROM'education_document'
  OR v.body->'classification'->>'party_role'='sender'
  OR v.body->>'method'IS DISTINCT FROM'authenticated_account_confirmation'
  OR v.body->>'purpose'IS DISTINCT FROM'account_pep'
  OR v.body->>'identity_requirement'IS DISTINCT FROM'account_control'
  OR v.body->>'authority_requirement'IS DISTINCT FROM'self'
  OR v.body->'agreement'IS NULL OR v.body->'agreement'='null'::jsonb
 THEN PERFORM uc_issued_recipient_private.fail('POLICY_NOT_ACCEPTED');END IF;
 RETURN v;
END;$fn$;

CREATE FUNCTION uc_issued_recipient_private.source(p_intent uc_issued_recipient_private.intents,p_write boolean)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE r public.education_document_records;s public.document_signatures;descriptor jsonb;
BEGIN
 r:=uc_issued_recipient_private.record_scope(p_intent.organization_id,p_intent.record_id,p_write);
 PERFORM uc_issued_recipient_private.people(ARRAY[p_intent.subject_user_id,p_intent.created_by,auth.uid()],p_write);
 SELECT *INTO s FROM public.document_signatures WHERE id=p_intent.signature_id AND organization_id=p_intent.organization_id FOR SHARE NOWAIT;
 IF s.id IS NULL OR s.document_id IS DISTINCT FROM p_intent.record_id OR s.document_type IS DISTINCT FROM'education_document'
  OR s.recipient_user_id IS DISTINCT FROM p_intent.subject_user_id OR s.sender_user_id IS DISTINCT FROM p_intent.created_by
  OR s.current_revision_id IS NOT NULL OR public.uc_signature_assurance_hash(s.document_html)IS DISTINCT FROM p_intent.html_sha256
  OR s.expires_at IS DISTINCT FROM p_intent.expires_at
  OR r.user_id IS DISTINCT FROM p_intent.subject_user_id OR r.enrollment_id IS DISTINCT FROM p_intent.enrollment_id
  OR r.course_id IS DISTINCT FROM p_intent.course_id OR r.group_id IS DISTINCT FROM p_intent.group_id
 THEN PERFORM uc_issued_recipient_private.fail('SOURCE_CHANGED');END IF;
 PERFORM public.uc_signature_assurance_file_fence(s,auth.uid(),p_write,p_intent.subject_user_id,p_intent.subject_user_id,ARRAY[p_intent.subject_user_id,p_intent.created_by]);
 descriptor:=public.uc_signature_assurance_issued_source_as(p_intent.organization_id,p_intent.signature_id,p_intent.record_revision,p_intent.record_state_sha256,auth.uid(),NULL,true);
 IF descriptor->'artifact'IS DISTINCT FROM p_intent.artifact THEN PERFORM uc_issued_recipient_private.fail('SOURCE_CHANGED');END IF;
 -- Current write/sign grants are checked again after the existing role/group
 -- table fences, including the prepare phase that does not bind yet.
 PERFORM uc_issued_recipient_private.record_scope(p_intent.organization_id,p_intent.record_id,p_write);
 RETURN descriptor;
END;$fn$;

-- A recorded proof is an immutable historical fact, not a claim that today's
-- object still exists or has unchanged metadata. Activation adds that check.
CREATE FUNCTION uc_issued_recipient_private.recorded_proof(p_intent uc_issued_recipient_private.intents)RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE f public.uc_signature_assurance_file_proofs;
BEGIN
 SELECT *INTO f FROM public.uc_signature_assurance_file_proofs WHERE organization_id=p_intent.organization_id AND verification_request_id=p_intent.verification_request_id FOR SHARE NOWAIT;
 IF f.id IS NULL THEN RETURN NULL;END IF;
 IF f.signature_id IS DISTINCT FROM p_intent.signature_id OR f.party_role IS DISTINCT FROM'recipient'
  OR f.recipient_user_id IS DISTINCT FROM p_intent.subject_user_id OR f.proof->>'assurance'IS DISTINCT FROM'trusted_service_reread'
  OR NOT public.uc_signature_assurance_shape(f.proof,ARRAY['assurance','source','object_before','file','object_after'])
  OR NOT public.uc_signature_assurance_shape(f.proof->'source',ARRAY['organization_id','signature_id','chosen_party','document_revision_id','document_html_sha256','purpose','bucket','path'])
  OR NOT public.uc_signature_assurance_shape(f.proof->'file',ARRAY['bucket','path','sha256','bytes','mime'])
  OR f.proof->'source'->>'organization_id'IS DISTINCT FROM p_intent.organization_id::text
  OR f.proof->'source'->>'signature_id'IS DISTINCT FROM p_intent.signature_id::text
  OR f.proof->'source'->>'chosen_party'IS DISTINCT FROM'recipient'
  OR f.proof->'source'->'document_revision_id'IS DISTINCT FROM'null'::jsonb
  OR f.proof->'source'->>'document_html_sha256'IS DISTINCT FROM p_intent.html_sha256
  OR f.proof->'source'->>'purpose'IS DISTINCT FROM'source'
  OR f.proof->'source'->>'bucket'IS DISTINCT FROM'org-documents'
  OR f.proof->'source'->>'path'IS DISTINCT FROM f.proof->'file'->>'path'
  OR f.proof->'file'->>'bucket'IS DISTINCT FROM'org-documents'
  OR f.proof->'file'->>'sha256'IS DISTINCT FROM p_intent.artifact->>'byte_sha256'
  OR f.proof->'file'->'bytes'IS DISTINCT FROM p_intent.artifact->'byte_size'
  OR f.proof->'file'->>'mime'IS DISTINCT FROM'application/pdf'
  OR jsonb_typeof(f.proof->'object_before')IS DISTINCT FROM'object'
  OR f.proof->'object_before'IS DISTINCT FROM f.proof->'object_after'
 THEN PERFORM uc_issued_recipient_private.fail('SOURCE_CHANGED');END IF;
 RETURN f.id;
END;$fn$;
CREATE FUNCTION uc_issued_recipient_private.proof(p_intent uc_issued_recipient_private.intents,p_descriptor jsonb)RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE f public.uc_signature_assurance_file_proofs;proof_id uuid;object_now jsonb;
BEGIN
 proof_id:=uc_issued_recipient_private.recorded_proof(p_intent);
 IF proof_id IS NULL THEN RETURN NULL;END IF;
 SELECT *INTO STRICT f FROM public.uc_signature_assurance_file_proofs WHERE id=proof_id AND organization_id=p_intent.organization_id;
 object_now:=public.uc_signature_assurance_object_snapshot('org-documents',p_descriptor->'file'->>'path');
 IF f.proof->'file'IS DISTINCT FROM p_descriptor->'file'OR f.proof->'object_after'IS DISTINCT FROM object_now
 THEN PERFORM uc_issued_recipient_private.fail('SOURCE_CHANGED');END IF;
 RETURN f.id;
END;$fn$;

CREATE FUNCTION uc_issued_recipient_private.binding(p_intent uc_issued_recipient_private.intents)RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE b public.uc_signature_assurance_bindings;d public.uc_signature_assurance_document_snapshots;q public.uc_signature_assurance_requests;recorded_proof_id uuid;recorded_file jsonb;
BEGIN
 SELECT *INTO b FROM public.uc_signature_assurance_bindings WHERE organization_id=p_intent.organization_id AND signature_id=p_intent.signature_id AND party_role='recipient'ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
 IF b.id IS NULL THEN RETURN NULL;END IF;
 SELECT *INTO d FROM public.uc_signature_assurance_document_snapshots WHERE organization_id=p_intent.organization_id AND signature_id=p_intent.signature_id AND id=b.document_snapshot_id AND party_role='recipient'FOR SHARE NOWAIT;
 SELECT *INTO q FROM public.uc_signature_assurance_requests WHERE organization_id=p_intent.organization_id AND request_id=p_intent.bind_request_id FOR SHARE NOWAIT;
 -- Bind the immutable capture to the complete ACTUAL recorded trusted file tuple,
 -- including path/mime, without claiming a new current-source/byte reread.
 recorded_proof_id:=uc_issued_recipient_private.recorded_proof(p_intent);
 SELECT f.proof->'file'INTO recorded_file FROM public.uc_signature_assurance_file_proofs f
  WHERE f.id=recorded_proof_id AND f.organization_id=p_intent.organization_id;
 IF b.revision IS DISTINCT FROM 1 OR b.policy_version_id IS DISTINCT FROM p_intent.policy_version_id OR b.policy_sha256 IS DISTINCT FROM p_intent.policy_sha256
  OR b.policy_decision_revision IS DISTINCT FROM p_intent.policy_decision_revision OR b.classification IS DISTINCT FROM p_intent.classification
  -- The canonical assurance engine sets primary subject NULL when its retained
  -- participant set includes both pupil and attributed staff. That does not
  -- change the single actual learner of this exact controlled issuance item.
  -- Non-NULL contradictory primaries and incoherent b/d primaries stay denied.
  OR b.subject_user_id IS DISTINCT FROM d.subject_user_id
  OR b.subject_user_id IS NOT NULL AND b.subject_user_id IS DISTINCT FROM p_intent.subject_user_id
  OR b.recipient_user_id IS DISTINCT FROM p_intent.subject_user_id
  OR d.id IS NULL OR d.document_revision_id IS NOT NULL OR d.html_sha256 IS DISTINCT FROM p_intent.html_sha256
  OR d.recipient_user_id IS DISTINCT FROM p_intent.subject_user_id
  OR NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_preparation_items actual_item
   WHERE actual_item.id=(p_intent.artifact->>'item_id')::uuid AND actual_item.organization_id=p_intent.organization_id
    AND actual_item.preparation_id=(p_intent.artifact->>'preparation_id')::uuid AND actual_item.final_record_id=p_intent.record_id
    AND actual_item.user_id=p_intent.subject_user_id AND actual_item.enrollment_id=p_intent.enrollment_id
    AND actual_item.course_id=p_intent.course_id AND actual_item.group_id IS NOT DISTINCT FROM p_intent.group_id AND NOT actual_item.redacted)
  OR d.source_file_state IS DISTINCT FROM'verified_bytes'
  OR recorded_file IS NULL OR d.original_file IS DISTINCT FROM recorded_file
  OR d.original_file->>'bucket'IS DISTINCT FROM'org-documents'
  OR d.original_file->>'sha256'IS DISTINCT FROM p_intent.artifact->>'byte_sha256'
  OR d.original_file->'bytes'IS DISTINCT FROM p_intent.artifact->'byte_size'
  OR q.request_id IS NULL OR q.action IS DISTINCT FROM'bind_signature'OR q.stream_id IS DISTINCT FROM p_intent.signature_id
  OR q.party_role IS DISTINCT FROM'recipient'OR q.binding_id IS DISTINCT FROM b.id
 THEN PERFORM uc_issued_recipient_private.fail('SOURCE_CHANGED');END IF;
 RETURN b.id;
END;$fn$;

CREATE FUNCTION uc_issued_recipient_private.project(p_intent uc_issued_recipient_private.intents)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.education_document_records;s public.document_signatures;e public.uc_signature_assurance_events;
 descriptor jsonb;proof_id uuid;binding_id uuid;source_state text;stage text;confirmation jsonb;resume boolean:=false;
BEGIN
 r:=uc_issued_recipient_private.record_scope(p_intent.organization_id,p_intent.record_id,false);
 -- A mutable record moved to another group does not grant a newly scoped
 -- staff member access to the old intent's saved group/source references.
 IF NOT public.uc_document_record_scope(p_intent.organization_id,p_intent.group_id,p_intent.enrollment_id,p_intent.subject_user_id,p_intent.course_id)
 THEN PERFORM uc_issued_recipient_private.fail('ACCESS_DENIED');END IF;
 PERFORM uc_issued_recipient_private.people(ARRAY[p_intent.subject_user_id,p_intent.created_by,auth.uid()],false);
 SELECT *INTO s FROM public.document_signatures WHERE id=p_intent.signature_id AND organization_id=p_intent.organization_id;
 BEGIN
  proof_id:=uc_issued_recipient_private.recorded_proof(p_intent);
  binding_id:=uc_issued_recipient_private.binding(p_intent);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IN('B1_SOURCE_CHANGED','SIGNATURE_EVIDENCE_SOURCE_CHANGED')THEN source_state:='source_changed';
  ELSIF SQLSTATE IN('42501','55P03','40001','40P01')THEN RAISE;
  ELSE source_state:='source_unavailable';END IF;
 END;
 BEGIN
  descriptor:=uc_issued_recipient_private.source(p_intent,false);
  PERFORM uc_issued_recipient_private.proof(p_intent,descriptor);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IN('B1_SOURCE_CHANGED','SIGNATURE_EVIDENCE_SOURCE_CHANGED')THEN source_state:='source_changed';
  ELSIF SQLSTATE IN('42501','55P03','40001','40P01')THEN RAISE;
  ELSE source_state:='source_unavailable';END IF;
 END;
 SELECT *INTO e FROM public.uc_signature_assurance_events WHERE organization_id=p_intent.organization_id AND signature_id=p_intent.signature_id AND stream_kind='signature'AND party_role='recipient'
  AND kind IN('account_confirmed','recipient_rejected','invitation_revoked')ORDER BY revision DESC LIMIT 1;
 IF e.kind='account_confirmed'AND e.actor_user_id=p_intent.subject_user_id AND e.binding_id=binding_id
  AND e.policy_version_id=p_intent.policy_version_id AND e.payload->>'policy_sha256'=p_intent.policy_sha256
  AND e.payload->>'document_html_sha256'=p_intent.html_sha256 AND e.payload->'document_revision_id'='null'::jsonb
  AND e.payload->>'conclusion'='policy_eligible_account_confirmation'
 THEN confirmation:=jsonb_build_object('id',e.id,'revision',e.revision,'conclusion',e.payload->>'conclusion','server_at',public.uc_signature_assurance_utc(e.server_at));END IF;
 stage:=CASE WHEN s.id IS NULL OR s.deleted_at IS NOT NULL THEN'closed'
  WHEN s.status='revoked'OR e.kind='invitation_revoked'THEN'revoked'
  WHEN s.status='rejected'OR e.kind='recipient_rejected'THEN'rejected'
  WHEN source_state IS NOT NULL THEN source_state
  WHEN confirmation IS NOT NULL THEN'confirmed'
  WHEN s.signed_at IS NOT NULL OR s.status='signed'THEN'closed'
  WHEN s.status='expired'OR p_intent.expires_at<=clock_timestamp()THEN'expired'
  WHEN s.sent_at IS NOT NULL AND s.status IN('sent','viewed','in_review')THEN'pending'
  WHEN binding_id IS NOT NULL THEN'bound'WHEN proof_id IS NOT NULL THEN'source_verified'ELSE'draft'END;
 IF stage IN('draft','source_verified','bound')THEN
  BEGIN
   PERFORM uc_issued_recipient_private.record_scope(p_intent.organization_id,p_intent.record_id,true);
   PERFORM uc_issued_recipient_private.policy(p_intent.organization_id,p_intent.policy_version_id,p_intent.policy_sha256,p_intent.policy_decision_revision);
   resume:=coalesce(public.uc_signature_assurance_signature_write(p_intent.organization_id,p_intent.signature_id)
    AND public.uc_signature_action_allowed(p_intent.signature_id,'sign'),false);
  EXCEPTION WHEN OTHERS THEN resume:=false;END;
 END IF;
 RETURN jsonb_build_object('id',p_intent.id,'context',jsonb_build_object('organization_id',p_intent.organization_id,'record_id',p_intent.record_id,'subject_user_id',p_intent.subject_user_id,'enrollment_id',p_intent.enrollment_id,'course_id',p_intent.course_id,'group_id',p_intent.group_id),
  'source',jsonb_build_object('record_revision',p_intent.record_revision,'record_state_sha256',p_intent.record_state_sha256,'artifact',p_intent.artifact),
  'policy',jsonb_build_object('version_id',p_intent.policy_version_id,'body_sha256',p_intent.policy_sha256,'decision_revision',p_intent.policy_decision_revision,'classification',p_intent.classification),
  'signature',jsonb_build_object('id',p_intent.signature_id,'document_revision_id',NULL,'document_html_sha256',p_intent.html_sha256,'expires_at',public.uc_signature_assurance_utc(p_intent.expires_at),'sent_at',CASE WHEN s.sent_at IS NOT NULL THEN public.uc_signature_assurance_utc(s.sent_at)END),
  'operation_ids',jsonb_build_object('verification_request_id',p_intent.verification_request_id,'bind_request_id',p_intent.bind_request_id,'activation_request_id',p_intent.activation_request_id),
  'payload_sha256',p_intent.payload_sha256,'state',stage,'proof_record_id',proof_id,'binding_id',binding_id,'confirmation_event',confirmation,
  'capabilities',jsonb_build_object('can_resume',resume,'can_open_staff_evidence',coalesce(public.uc_signature_assurance_signature_read(p_intent.organization_id,p_intent.signature_id),false)));
END;$fn$;

CREATE FUNCTION public.prepare_issued_recipient_request(p_organization_id uuid,p_request_id uuid,p_payload jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
DECLARE r public.education_document_records;st public.uc_education_issuance_states;v public.uc_signature_assurance_policy_versions;
 intent uc_issued_recipient_private.intents;existing uc_issued_recipient_private.intents;receipt uc_issued_recipient_private.prepare_receipts;sig uuid:=gen_random_uuid();new_id uuid:=gen_random_uuid();
 digest text;logical text;mail text;recipient text;sender text;title text;html text;expires timestamptz;descriptor jsonb;
BEGIN
 IF p_request_id IS NULL OR octet_length(p_payload::text)>65536 OR NOT public.uc_signature_assurance_shape(p_payload,ARRAY['version','record_id','expected_record_revision','expected_record_state_sha256','expected_artifact','policy','purpose','expires_days'])
  OR p_payload->'version'IS DISTINCT FROM'1'::jsonb OR p_payload->>'purpose'IS DISTINCT FROM'electronic_copy_receipt'
  OR NOT public.uc_signature_assurance_uuid(p_payload->'record_id')
  OR NOT uc_issued_recipient_private.revision(p_payload->'expected_record_revision')
  OR NOT public.uc_signature_assurance_sha(p_payload->'expected_record_state_sha256')
  OR NOT uc_issued_recipient_private.artifact(p_payload->'expected_artifact')
  OR NOT public.uc_signature_assurance_shape(p_payload->'policy',ARRAY['version_id','body_sha256','decision_revision'])
  OR NOT public.uc_signature_assurance_uuid(p_payload->'policy'->'version_id')OR NOT public.uc_signature_assurance_sha(p_payload->'policy'->'body_sha256')
  OR NOT public.uc_signature_assurance_integer(p_payload->'policy'->'decision_revision',1,2147483646)
  OR NOT public.uc_signature_assurance_integer(p_payload->'expires_days',1,90)
 THEN PERFORM uc_issued_recipient_private.fail('INVALID_INPUT');END IF;
 r:=uc_issued_recipient_private.record_scope(p_organization_id,(p_payload->>'record_id')::uuid,true);
 PERFORM uc_issued_recipient_private.people(ARRAY[r.user_id,auth.uid()],true);
 PERFORM public.uc_signature_assurance_fence(p_organization_id,ARRAY[r.user_id],true,NULL,NULL,auth.uid());
 r:=uc_issued_recipient_private.record_scope(p_organization_id,r.id,true);
 digest:=public.uc_signature_assurance_hash(jsonb_build_object('organization_id',p_organization_id,'payload',p_payload)::text);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('b1_request:'||p_organization_id::text||':'||p_request_id::text,0))THEN PERFORM uc_issued_recipient_private.fail('REVISION_CONFLICT');END IF;
 SELECT *INTO receipt FROM uc_issued_recipient_private.prepare_receipts WHERE organization_id=p_organization_id AND request_id=p_request_id;
 IF receipt.request_id IS NOT NULL THEN
  IF receipt.payload_sha256 IS DISTINCT FROM digest THEN PERFORM uc_issued_recipient_private.fail('REQUEST_CONFLICT');END IF;
  SELECT *INTO STRICT existing FROM uc_issued_recipient_private.intents WHERE id=receipt.intent_id AND organization_id=p_organization_id;
  RETURN jsonb_build_object('version',1,'ok',true,'organization_id',p_organization_id,'actor_user_id',auth.uid(),'kind','prepare','intent',uc_issued_recipient_private.project(existing));
 END IF;
 PERFORM 1 FROM public.education_document_records WHERE id=r.id AND organization_id=p_organization_id FOR SHARE NOWAIT;
 SELECT *INTO st FROM public.uc_education_issuance_states WHERE record_id=r.id AND organization_id=p_organization_id FOR SHARE NOWAIT;
 IF st.record_id IS NULL OR st.redacted OR st.proof IS NULL OR st.annulment IS NOT NULL OR st.artifact IS NULL OR st.artifact='null'::jsonb THEN PERFORM uc_issued_recipient_private.fail('SOURCE_UNAVAILABLE');END IF;
 IF st.revision IS DISTINCT FROM(p_payload->>'expected_record_revision')::bigint OR public.uc_education_issue_state_hash(r.id)IS DISTINCT FROM p_payload->>'expected_record_state_sha256'
  OR st.artifact IS DISTINCT FROM p_payload->'expected_artifact'OR st.user_id IS DISTINCT FROM r.user_id OR st.enrollment_id IS DISTINCT FROM r.enrollment_id OR st.course_id IS DISTINCT FROM r.course_id OR st.group_id IS DISTINCT FROM r.group_id
 THEN PERFORM uc_issued_recipient_private.fail('SOURCE_CHANGED');END IF;
 v:=uc_issued_recipient_private.policy(p_organization_id,(p_payload->'policy'->>'version_id')::uuid,p_payload->'policy'->>'body_sha256',(p_payload->'policy'->>'decision_revision')::integer);
 logical:=public.uc_signature_assurance_hash(jsonb_build_object('organization_id',p_organization_id,'record_id',r.id,'artifact',st.artifact,'subject_user_id',r.user_id,'purpose','electronic_copy_receipt')::text);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('b1_logical:'||logical,0))THEN PERFORM uc_issued_recipient_private.fail('REVISION_CONFLICT');END IF;
 SELECT *INTO existing FROM uc_issued_recipient_private.intents WHERE logical_source_key_sha256=logical;
 IF existing.id IS NOT NULL THEN
  IF existing.payload_sha256 IS DISTINCT FROM digest THEN PERFORM uc_issued_recipient_private.fail('REQUEST_CONFLICT');END IF;
  PERFORM uc_issued_recipient_private.people(ARRAY[existing.subject_user_id,auth.uid()],true);
  INSERT INTO uc_issued_recipient_private.prepare_receipts(organization_id,request_id,payload_sha256,intent_id,created_by)VALUES(p_organization_id,p_request_id,digest,existing.id,auth.uid());
  RETURN jsonb_build_object('version',1,'ok',true,'organization_id',p_organization_id,'actor_user_id',auth.uid(),'kind','prepare','intent',uc_issued_recipient_private.project(existing));
 END IF;
 SELECT coalesce(nullif(btrim(u.email),''),nullif(btrim(p.email),'')),coalesce(nullif(btrim(p.full_name),''),nullif(btrim(u.email),''),nullif(btrim(p.email),''))INTO mail,recipient
  FROM auth.users u JOIN public.profiles p ON p.user_id=u.id WHERE u.id=r.user_id AND p.organization_id=p_organization_id;
 IF mail IS NULL OR mail!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'OR length(mail)>320 OR recipient IS NULL OR length(recipient)>300 THEN PERFORM uc_issued_recipient_private.fail('RECIPIENT_CONTACT_REQUIRED');END IF;
 SELECT coalesce(nullif(btrim(full_name),''),'Сотрудник учебного центра')INTO sender FROM public.profiles WHERE user_id=auth.uid();
 sender:=coalesce(sender,'Сотрудник учебного центра');
 title:='Электронная копия документа об обучении № '||coalesce(nullif(to_jsonb(r)->>'document_number',''),r.id::text);
 html:='<!doctype html><html lang="ru"><meta charset="utf-8"><body><h1>Получение электронной копии</h1><p>'||public.uc_signature_assurance_html_escape(title)||'</p><p>Подтверждается получение электронной копии указанного документа. Это не подтверждение передачи бумажного оригинала.</p><p>SHA-256 PDF: '||public.uc_signature_assurance_html_escape(st.artifact->>'byte_sha256')||'</p></body></html>';
 expires:=clock_timestamp()+make_interval(days=>(p_payload->>'expires_days')::integer);
 INSERT INTO public.document_signatures(id,organization_id,document_type,document_id,document_title,document_html,document_hash,document_snapshot_url,sender_user_id,sender_name,recipient_type,recipient_user_id,recipient_email,recipient_name,status,expires_at,mode,signature_method)
  VALUES(sig,p_organization_id,'education_document',r.id,title,html,public.uc_signature_assurance_hash(html),NULL,auth.uid(),sender,'student',r.user_id,mail,recipient,'draft',expires,'sign','pep');
 INSERT INTO uc_issued_recipient_private.intents(id,organization_id,record_id,record_revision,record_state_sha256,artifact,subject_user_id,enrollment_id,course_id,group_id,purpose,policy_version_id,policy_sha256,policy_decision_revision,classification,signature_id,html_sha256,verification_request_id,bind_request_id,activation_request_id,prepare_request_id,payload_sha256,logical_source_key_sha256,expires_at,created_by)
  VALUES(new_id,p_organization_id,r.id,st.revision,p_payload->>'expected_record_state_sha256',st.artifact,r.user_id,r.enrollment_id,r.course_id,r.group_id,'electronic_copy_receipt',v.id,v.body_sha256,(p_payload->'policy'->>'decision_revision')::integer,v.body->'classification',sig,public.uc_signature_assurance_hash(html),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),p_request_id,digest,logical,expires,auth.uid())RETURNING*INTO intent;
 INSERT INTO uc_issued_recipient_private.prepare_receipts(organization_id,request_id,payload_sha256,intent_id,created_by)VALUES(p_organization_id,p_request_id,digest,intent.id,auth.uid());
 descriptor:=uc_issued_recipient_private.source(intent,true);
 RETURN jsonb_build_object('version',1,'ok',true,'organization_id',p_organization_id,'actor_user_id',auth.uid(),'kind','prepare','intent',uc_issued_recipient_private.project(intent));
EXCEPTION WHEN OTHERS THEN RETURN uc_issued_recipient_private.failure(SQLERRM,SQLSTATE);
END;$fn$;

CREATE FUNCTION public.read_issued_recipient_request(p_organization_id uuid,p_query jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
DECLARE r public.education_document_records;intent uc_issued_recipient_private.intents;
BEGIN
 IF p_query->>'kind'='record'AND public.uc_signature_assurance_shape(p_query,ARRAY['kind','record_id'])AND public.uc_signature_assurance_uuid(p_query->'record_id')THEN
  r:=uc_issued_recipient_private.record_scope(p_organization_id,(p_query->>'record_id')::uuid,false);
  PERFORM uc_issued_recipient_private.people(ARRAY[r.user_id,auth.uid()],false);
  SELECT i.*INTO intent FROM uc_issued_recipient_private.intents i JOIN public.uc_education_issuance_states st ON st.record_id=i.record_id AND st.organization_id=i.organization_id
   WHERE i.organization_id=p_organization_id AND i.record_id=r.id AND i.subject_user_id=r.user_id AND i.artifact=st.artifact
   ORDER BY i.created_at DESC,i.id DESC LIMIT 1;
 ELSIF p_query->>'kind'='intent'AND public.uc_signature_assurance_shape(p_query,ARRAY['kind','intent_id'])AND public.uc_signature_assurance_uuid(p_query->'intent_id')THEN
  SELECT *INTO intent FROM uc_issued_recipient_private.intents WHERE id=(p_query->>'intent_id')::uuid AND organization_id=p_organization_id;
  IF intent.id IS NULL THEN PERFORM uc_issued_recipient_private.fail('ACCESS_DENIED');END IF;
  r:=uc_issued_recipient_private.record_scope(p_organization_id,intent.record_id,false);
 ELSE PERFORM uc_issued_recipient_private.fail('INVALID_INPUT');END IF;
 RETURN jsonb_build_object('version',1,'ok',true,'organization_id',p_organization_id,'actor_user_id',auth.uid(),'kind','read','intent',CASE WHEN intent.id IS NOT NULL THEN uc_issued_recipient_private.project(intent)END);
EXCEPTION WHEN OTHERS THEN RETURN uc_issued_recipient_private.failure(SQLERRM,SQLSTATE);
END;$fn$;

CREATE FUNCTION public.activate_issued_recipient_request(p_organization_id uuid,p_intent_id uuid,p_request_id uuid,p_expected_payload_sha256 text)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
DECLARE intent uc_issued_recipient_private.intents;r public.education_document_records;s public.document_signatures;descriptor jsonb;proof_id uuid;binding_id uuid;result jsonb;projection jsonb;
BEGIN
 IF p_intent_id IS NULL OR p_request_id IS NULL OR NOT public.uc_signature_assurance_sha(to_jsonb(p_expected_payload_sha256))THEN PERFORM uc_issued_recipient_private.fail('INVALID_INPUT');END IF;
 SELECT *INTO intent FROM uc_issued_recipient_private.intents WHERE id=p_intent_id AND organization_id=p_organization_id;
 IF intent.id IS NULL THEN PERFORM uc_issued_recipient_private.fail('ACCESS_DENIED');END IF;
 r:=uc_issued_recipient_private.record_scope(p_organization_id,intent.record_id,true);
 IF p_request_id IS DISTINCT FROM intent.activation_request_id OR p_expected_payload_sha256 IS DISTINCT FROM intent.payload_sha256 THEN PERFORM uc_issued_recipient_private.fail('REQUEST_CONFLICT');END IF;
 PERFORM uc_issued_recipient_private.people(ARRAY[intent.subject_user_id,intent.created_by,auth.uid()],true);
 PERFORM public.uc_signature_assurance_fence(p_organization_id,ARRAY[intent.subject_user_id,intent.created_by],true,intent.signature_id,intent.bind_request_id,auth.uid());
 IF NOT pg_try_advisory_xact_lock(hashtextextended('b1_activate:'||intent.id::text,0))THEN PERFORM uc_issued_recipient_private.fail('REVISION_CONFLICT');END IF;
 SELECT *INTO s FROM public.document_signatures WHERE id=intent.signature_id AND organization_id=p_organization_id FOR UPDATE NOWAIT;
 descriptor:=uc_issued_recipient_private.source(intent,true);
 proof_id:=uc_issued_recipient_private.proof(intent,descriptor);
 IF proof_id IS NULL THEN PERFORM uc_issued_recipient_private.fail('SOURCE_UNAVAILABLE');END IF;
 binding_id:=uc_issued_recipient_private.binding(intent);
 IF s.sent_at IS NOT NULL THEN
  IF binding_id IS NULL THEN PERFORM uc_issued_recipient_private.fail('SOURCE_CHANGED');END IF;
  RETURN jsonb_build_object('version',1,'ok',true,'organization_id',p_organization_id,'actor_user_id',auth.uid(),'kind','activate','intent',uc_issued_recipient_private.project(intent));
 END IF;
 IF s.deleted_at IS NOT NULL OR s.status<>'draft'OR s.signed_at IS NOT NULL THEN PERFORM uc_issued_recipient_private.fail('CLOSED');END IF;
 IF intent.expires_at<=clock_timestamp()THEN PERFORM uc_issued_recipient_private.fail('EXPIRED');END IF;
 PERFORM uc_issued_recipient_private.policy(p_organization_id,intent.policy_version_id,intent.policy_sha256,intent.policy_decision_revision);
 IF binding_id IS NULL THEN
  result:=public.apply_signature_assurance(p_organization_id,intent.bind_request_id,0,jsonb_build_object('action','bind_signature','signature_id',intent.signature_id,'party_role','recipient','document_revision_id',NULL,'document_html_sha256',intent.html_sha256,'classification',intent.classification,'policy_version_id',intent.policy_version_id));
  IF result->'ok'IS DISTINCT FROM'true'::jsonb THEN PERFORM uc_issued_recipient_private.fail(coalesce(result->>'code','DEPENDENCY_UNAVAILABLE'));END IF;
  binding_id:=uc_issued_recipient_private.binding(intent);
 END IF;
 IF binding_id IS NULL THEN PERFORM uc_issued_recipient_private.fail('DEPENDENCY_UNAVAILABLE');END IF;
 UPDATE public.document_signatures SET status='sent',sent_at=clock_timestamp() WHERE id=intent.signature_id AND organization_id=p_organization_id AND status='draft'AND sent_at IS NULL;
 IF NOT FOUND THEN PERFORM uc_issued_recipient_private.fail('REVISION_CONFLICT');END IF;
 projection:=uc_issued_recipient_private.project(intent);
 IF projection->>'state'IS DISTINCT FROM'pending'THEN PERFORM uc_issued_recipient_private.fail('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('version',1,'ok',true,'organization_id',p_organization_id,'actor_user_id',auth.uid(),'kind','activate','intent',projection);
EXCEPTION WHEN OTHERS THEN RETURN uc_issued_recipient_private.failure(SQLERRM,SQLSTATE);
END;$fn$;

CREATE FUNCTION uc_issued_recipient_private.immutable()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_OP<>'INSERT'THEN RAISE EXCEPTION 'B1_INTENT_IMMUTABLE' USING ERRCODE='42501';END IF;
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS DISTINCT FROM NEW.created_by OR NOT public.account_deletion_access_allowed()THEN RAISE EXCEPTION 'B1_INTENT_INSERT_DENIED' USING ERRCODE='42501';END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER b1_intent_immutable BEFORE INSERT OR UPDATE OR DELETE ON uc_issued_recipient_private.intents FOR EACH ROW EXECUTE FUNCTION uc_issued_recipient_private.immutable();
CREATE TRIGGER b1_intent_no_truncate BEFORE TRUNCATE ON uc_issued_recipient_private.intents FOR EACH STATEMENT EXECUTE FUNCTION uc_issued_recipient_private.immutable();
CREATE TRIGGER b1_receipt_immutable BEFORE INSERT OR UPDATE OR DELETE ON uc_issued_recipient_private.prepare_receipts FOR EACH ROW EXECUTE FUNCTION uc_issued_recipient_private.immutable();
CREATE TRIGGER b1_receipt_no_truncate BEFORE TRUNCATE ON uc_issued_recipient_private.prepare_receipts FOR EACH STATEMENT EXECUTE FUNCTION uc_issued_recipient_private.immutable();

-- The ONLY changed existing function body. Existing snapshot and erasure paths
-- already consume this count and block for individual retention review. There
-- is no invented period, silent deletion or new account-deletion engine.
DO $privacy_composition$
DECLARE old_body text;new_body text;needle constant text:=E' )counts WHERE n>0\n';addition constant text:=E' UNION ALL SELECT ''uc_issued_recipient_private.intents'',count(*) FROM uc_issued_recipient_private.intents WHERE subject_user_id=p_user OR created_by=p_user\n UNION ALL SELECT ''uc_issued_recipient_private.prepare_receipts'',count(*) FROM uc_issued_recipient_private.prepare_receipts receipt WHERE receipt.created_by=p_user OR EXISTS(SELECT 1 FROM uc_issued_recipient_private.intents intent WHERE intent.id=receipt.intent_id AND intent.organization_id=receipt.organization_id AND intent.subject_user_id=p_user)\n';
BEGIN
 SELECT prosrc INTO STRICT old_body FROM pg_proc WHERE oid='public.uc_signature_assurance_personal_counts(uuid)'::regprocedure;
 IF md5(old_body)<>'40f7ed8b7cd224b30e283325b7558b62'OR(length(old_body)-length(replace(old_body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'B1_PRIVACY_UNIQUE_PREIMAGE_CHANGED';END IF;
 new_body:=replace(old_body,needle,addition||needle);
 EXECUTE format('CREATE OR REPLACE FUNCTION public.uc_signature_assurance_personal_counts(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS %L',new_body);
 IF (SELECT prosrc FROM pg_proc WHERE oid='public.uc_signature_assurance_personal_counts(uuid)'::regprocedure)IS DISTINCT FROM new_body THEN RAISE EXCEPTION 'B1_PRIVACY_POSTIMAGE_CHANGED';END IF;
END;$privacy_composition$;

-- Close only NEW object ACLs, including provider-specific default grantees and
-- column grants. Roles, memberships, old ACLs and default privileges stay put.
DO $new_acl$
DECLARE f record;g oid;c record;relation_row record;
BEGIN
 FOR g IN SELECT DISTINCT a.grantee FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a
  WHERE n.nspname='uc_issued_recipient_private'AND a.grantee<>n.nspowner AND a.grantee<>0 LOOP
  EXECUTE format('REVOKE ALL ON SCHEMA uc_issued_recipient_private FROM %I',pg_get_userbyid(g));
 END LOOP;
 FOR f IN SELECT p.oid,p.oid::regprocedure identity,p.proowner,p.proacl,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='uc_issued_recipient_private'OR p.oid IN('public.prepare_issued_recipient_request(uuid,uuid,jsonb)'::regprocedure,'public.read_issued_recipient_request(uuid,jsonb)'::regprocedure,'public.activate_issued_recipient_request(uuid,uuid,uuid,text)'::regprocedure)
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.identity);
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))a WHERE a.grantee<>f.proowner AND a.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.identity,pg_get_userbyid(g));
  END LOOP;
  IF f.nspname='public'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.identity);END IF;
 END LOOP;
 FOR relation_row IN SELECT t.oid,t.oid::regclass identity,t.relowner,t.relacl FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='uc_issued_recipient_private'AND t.relkind='r'LOOP
  EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC,anon,authenticated,service_role',relation_row.identity);
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce(relation_row.relacl,acldefault('r',relation_row.relowner)))a WHERE a.grantee<>relation_row.relowner AND a.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL ON TABLE %s FROM %I',relation_row.identity,pg_get_userbyid(g));
  END LOOP;
  FOR c IN SELECT attname,attacl FROM pg_attribute WHERE attrelid=relation_row.oid AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL LOOP
   FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(c.attacl)a WHERE a.grantee<>relation_row.relowner LOOP
    IF g=0 THEN EXECUTE format('REVOKE ALL(%I)ON TABLE %s FROM PUBLIC',c.attname,relation_row.identity);
    ELSE EXECUTE format('REVOKE ALL(%I)ON TABLE %s FROM %I',c.attname,relation_row.identity,pg_get_userbyid(g));END IF;
   END LOOP;
  END LOOP;
 END LOOP;
END;$new_acl$;
COMMENT ON TABLE uc_issued_recipient_private.intents IS 'Immutable exact issued-copy request intents. Draft links are included in existing signature retention review; no learner signature or physical handover is inferred.';
COMMENT ON TABLE uc_issued_recipient_private.prepare_receipts IS 'Append-only prepare UUID receipts, including logical-source aliases; subject is resolved through its immutable intent. No bearer credential is stored.';
COMMIT;
