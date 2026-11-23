-- W2 LOCAL R6 CANDIDATE. No production execution/qualification is authorized by this file.
-- Actual individual W1/UC013 source -> the same controlled UC019 record/bytes.
-- Old groups, public grouped refs, attempts, numbers and business facts stay intact.
BEGIN;
SET LOCAL search_path=pg_catalog,public,storage;
DO $preflight$
BEGIN
 IF current_user<>'postgres'OR to_regnamespace('uc_individual_issuance_private')IS NOT NULL
  OR to_regprocedure('uc_individual_orders_private.actor_allowed(uuid,uuid,uuid,text)')IS NULL
  OR to_regprocedure('uc_individual_orders_private.registered_witness(uc_individual_orders_private.orders,bigint,boolean)')IS NULL
  OR to_regprocedure('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)')IS NULL
  OR to_regprocedure('public.uc_admission_actor_allowed(uuid,boolean)')IS NULL
  OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261123170000')
  OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=to_regprocedure('public.uc_scoped_journal_personal_counts(uuid)'))IS DISTINCT FROM'afe583ea861280c7ce4f5da51502948b'
 THEN RAISE EXCEPTION 'UC_INDIVIDUAL_ISSUANCE_DEPENDENCY_UNAVAILABLE' USING ERRCODE='55000';END IF;
END;$preflight$;
CREATE SCHEMA uc_individual_issuance_private;
REVOKE ALL ON SCHEMA uc_individual_issuance_private FROM PUBLIC,anon,authenticated,service_role;
-- No default discriminator is added to an old row. Exact private relationships
-- distinguish a genuine individual context from the unchanged real-group path.
CREATE TABLE uc_individual_issuance_private.cases(
 case_id uuid PRIMARY KEY REFERENCES public.uc_admission_cases(id)ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 organization_id uuid NOT NULL,enrollment_id uuid NOT NULL,user_id uuid NOT NULL,course_id uuid NOT NULL,
 kind text NOT NULL DEFAULT'individual_w1'CHECK(kind='individual_w1'),version integer NOT NULL DEFAULT 1 CHECK(version=1),
 binding jsonb NOT NULL CHECK(jsonb_typeof(binding)='object'),source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
 participant_ids uuid[] NOT NULL,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,enrollment_id),UNIQUE(case_id,organization_id),CHECK(participant_ids@>ARRAY[user_id,created_by]AND array_position(participant_ids,NULL)IS NULL)
);
CREATE TABLE uc_individual_issuance_private.items(
 item_id uuid PRIMARY KEY REFERENCES public.uc_education_issuance_preparation_items(id)ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 preparation_id uuid NOT NULL UNIQUE REFERENCES public.uc_education_issuance_preparations(id)ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 case_id uuid NOT NULL REFERENCES uc_individual_issuance_private.cases(case_id)ON DELETE RESTRICT,
 organization_id uuid NOT NULL,enrollment_id uuid NOT NULL,user_id uuid NOT NULL,course_id uuid NOT NULL,
 eligibility_ref jsonb NOT NULL CHECK(jsonb_typeof(eligibility_ref)='object'),source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
 participant_ids uuid[] NOT NULL,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(item_id,preparation_id),CHECK(participant_ids@>ARRAY[user_id,created_by]AND array_position(participant_ids,NULL)IS NULL)
);
CREATE TABLE uc_individual_issuance_private.contexts(
 context_id uuid PRIMARY KEY REFERENCES public.uc_education_issuance_contexts(id)ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
 item_id uuid NOT NULL REFERENCES uc_individual_issuance_private.items(item_id)ON DELETE RESTRICT,
 transaction_id bigint NOT NULL,backend_pid integer NOT NULL,actor_id uuid NOT NULL,
 organization_id uuid NOT NULL,enrollment_id uuid NOT NULL,user_id uuid NOT NULL,course_id uuid NOT NULL,
 source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- The canonical context is intentionally deleted by the same issue transaction.
-- Durable programme/source provenance is instead keyed to the SAME real record.
CREATE TABLE uc_individual_issuance_private.issued_sources(
 record_id uuid PRIMARY KEY REFERENCES public.education_document_records(id)ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 item_id uuid NOT NULL UNIQUE REFERENCES uc_individual_issuance_private.items(item_id)ON DELETE RESTRICT,
 case_id uuid NOT NULL REFERENCES uc_individual_issuance_private.cases(case_id)ON DELETE RESTRICT,
 organization_id uuid NOT NULL,enrollment_id uuid NOT NULL,user_id uuid NOT NULL,course_id uuid NOT NULL,
 eligibility_ref jsonb NOT NULL CHECK(jsonb_typeof(eligibility_ref)='object'),source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
 artifact jsonb NOT NULL CHECK(jsonb_typeof(artifact)='object'),participant_ids uuid[]NOT NULL,recorded_by uuid NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(participant_ids@>ARRAY[user_id,recorded_by]AND array_position(participant_ids,NULL)IS NULL)
);
-- A transport receipt points to actual canonical business event(s). It does not
-- increment case/record heads, reserve numbers or create shadow legal events.
CREATE TABLE uc_individual_issuance_private.requests(
 actor_id uuid NOT NULL,request_id uuid NOT NULL,organization_id uuid NOT NULL,enrollment_id uuid NOT NULL,user_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN('initialize_admission','apply_admission_review','prepare_evidence','evidence_committed','review_protocol_facts','prepare_artifact','issue')),
 canonical_kind text NOT NULL CHECK(canonical_kind IN('admission','issuance')),canonical_actor_id uuid NOT NULL,canonical_request_id uuid NOT NULL,
 canonical_payload_sha256 text NOT NULL CHECK(canonical_payload_sha256~'^[a-f0-9]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 participant_ids uuid[]NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,request_id),
 CHECK(participant_ids@>ARRAY[actor_id,user_id,canonical_actor_id]AND array_position(participant_ids,NULL)IS NULL)
);
ALTER TABLE uc_individual_issuance_private.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE uc_individual_issuance_private.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE uc_individual_issuance_private.contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE uc_individual_issuance_private.issued_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE uc_individual_issuance_private.requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX w2_case_subject ON uc_individual_issuance_private.cases(user_id);
CREATE INDEX w2_case_participants ON uc_individual_issuance_private.cases USING gin(participant_ids);
CREATE INDEX w2_item_subject ON uc_individual_issuance_private.items(user_id);
CREATE INDEX w2_item_participants ON uc_individual_issuance_private.items USING gin(participant_ids);
CREATE INDEX w2_context_transaction ON uc_individual_issuance_private.contexts(transaction_id,backend_pid,actor_id);
CREATE INDEX w2_issued_subject ON uc_individual_issuance_private.issued_sources(user_id);
CREATE INDEX w2_issued_participants ON uc_individual_issuance_private.issued_sources USING gin(participant_ids);
CREATE INDEX w2_request_subject ON uc_individual_issuance_private.requests(user_id);
CREATE INDEX w2_request_participants ON uc_individual_issuance_private.requests USING gin(participant_ids);

DO $conditional_schema$
DECLARE t text;c record;expected text:='CHECK ((kind = ANY (ARRAY[''initialize''::text, ''assign_responsible''::text, ''review_local_rules''::text, ''review_requirement''::text, ''review_evidence''::text, ''record_decision''::text, ''evidence_committed''::text])))';
BEGIN
 FOREACH t IN ARRAY ARRAY['uc_admission_cases','uc_education_issuance_contexts','uc_education_issuance_preparation_items']LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attname='group_id'AND attnotnull AND NOT attisdropped)THEN RAISE EXCEPTION 'W2_GROUP_NULL_PREIMAGE_%',t;END IF;
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN group_id DROP NOT NULL',t);
 END LOOP;
 SELECT oid,conname,pg_get_constraintdef(oid)definition INTO c FROM pg_constraint WHERE conrelid='public.uc_admission_case_events'::regclass AND conname='uc_admission_case_events_kind_check'AND contype='c';
 IF c.oid IS NULL OR c.definition IS DISTINCT FROM expected THEN RAISE EXCEPTION 'W2_ADMISSION_EVENT_KIND_CHECK_PREIMAGE';END IF;
 ALTER TABLE public.uc_admission_case_events DROP CONSTRAINT uc_admission_case_events_kind_check;
 ALTER TABLE public.uc_admission_case_events ADD CONSTRAINT uc_admission_case_events_kind_check CHECK(kind IN('initialize','assign_responsible','review_local_rules','review_requirement','review_evidence','record_decision','evidence_committed','review_protocol_facts'));
END;$conditional_schema$;

CREATE FUNCTION uc_individual_issuance_private.fail(p_code text)RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION USING ERRCODE=CASE p_code WHEN'ACCESS_DENIED'THEN'42501'WHEN'INVALID_INPUT'THEN'22023'WHEN'NOT_FOUND'THEN'PT404'ELSE'PT409'END,MESSAGE='EDUCATION_ISSUANCE_'||p_code;END;$fn$;
CREATE FUNCTION uc_individual_issuance_private.scope(p_org uuid,p_enrollment uuid,p_user uuid,p_course uuid)RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('kind','individual_w1','version',1,'organization_id',p_org,'enrollment_id',p_enrollment,'user_id',p_user,'course_id',p_course,'group_id',NULL)
$fn$;
CREATE FUNCTION uc_individual_issuance_private.scope_input(p_scope jsonb,p_org uuid,p_enrollment uuid)RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_signature_assurance_shape(p_scope,ARRAY['kind','version','organization_id','enrollment_id'])AND p_scope->>'kind'='individual_w1'AND p_scope->'version'='1'::jsonb
  AND p_scope->>'organization_id'=p_org::text AND p_scope->>'enrollment_id'=p_enrollment::text,false)
$fn$;
CREATE FUNCTION uc_individual_issuance_private.event_ref(p_event uc_individual_orders_private.events)RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('id',p_event.id,'revision',p_event.revision,'payload_sha256',p_event.payload_sha256)
$fn$;

CREATE FUNCTION uc_individual_issuance_private.order_witness(p_order uc_individual_orders_private.orders,p_live boolean DEFAULT true)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE decision_event uc_individual_orders_private.events;registration_event uc_individual_orders_private.events;checked jsonb;programme jsonb;
BEGIN
 IF p_order.id IS NULL OR p_order.approved_snapshot IS NULL OR p_order.registry IS NULL OR p_order.artifact IS NULL
  OR p_order.artifact->'output_review'IS NULL OR p_order.artifact->'output_review'='null'::jsonb
  OR p_order.approved_order_sha256 IS DISTINCT FROM public.uc_program_hash(p_order.approved_snapshot)
  OR p_order.approved_snapshot->'facts'IS DISTINCT FROM p_order.facts
  OR p_order.approved_snapshot->'decision'IS DISTINCT FROM p_order.decision
 THEN PERFORM uc_individual_issuance_private.fail('SOURCE_UNAVAILABLE');END IF;
 SELECT *INTO decision_event FROM uc_individual_orders_private.events WHERE id=(p_order.decision->>'event_id')::uuid
  AND organization_id=p_order.organization_id AND order_id=p_order.id AND row_kind='event'AND action='approved'AND revision=p_order.approved_order_revision FOR SHARE NOWAIT;
 SELECT *INTO registration_event FROM uc_individual_orders_private.events WHERE id=(p_order.artifact->'output_review'->>'event_id')::uuid
  AND organization_id=p_order.organization_id AND order_id=p_order.id AND row_kind='event'AND action='output_reviewed_and_registered'FOR SHARE NOWAIT;
 IF decision_event.id IS NULL OR registration_event.id IS NULL OR decision_event.actor_user_id::text IS DISTINCT FROM p_order.decision->>'actor_user_id'
  OR decision_event.payload_sha256 IS DISTINCT FROM p_order.decision->>'payload_sha256'
  OR registration_event.actor_user_id::text IS DISTINCT FROM p_order.artifact->'output_review'->>'actor_user_id'
  OR registration_event.result->'order'->'registry'IS DISTINCT FROM p_order.registry
  OR registration_event.result->'order'->'programme'IS DISTINCT FROM p_order.facts->'programme'
  OR registration_event.revision<p_order.approved_order_revision OR registration_event.revision>p_order.revision
 THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 -- Always corroborate the real public registration event/source internally;
 -- it has no payload_sha256 and is never fabricated as a private EventRef.
 checked:=uc_individual_orders_private.registered_witness(p_order,(p_order.registry->>'record_revision')::bigint,false);
 IF p_live THEN
  IF p_order.closed THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
  checked:=uc_individual_orders_private.artifact_source(p_order);
  programme:=uc_individual_orders_private.programme(p_order.organization_id,(p_order.facts->'programme'->>'version_id')::uuid);
  IF programme->'programme'IS DISTINCT FROM p_order.facts->'programme'OR programme->'facts'IS DISTINCT FROM p_order.facts->'programme_facts'THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 END IF;
 RETURN jsonb_build_object('order_id',p_order.id,'order_revision',registration_event.revision,'approved_order_revision',p_order.approved_order_revision,'approved_order_sha256',p_order.approved_order_sha256,
  'decision_event',uc_individual_issuance_private.event_ref(decision_event),'registration_event',uc_individual_issuance_private.event_ref(registration_event),
  'registry',p_order.registry,'artifact',p_order.artifact-'output_review','dates',p_order.facts->'dates');
END;$fn$;
CREATE FUNCTION uc_individual_issuance_private.admission_binding(p_org uuid,p_enrollment uuid,p_live boolean DEFAULT true)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE head_row uc_individual_orders_private.orders;enrollment_row public.enrollments;binding jsonb;witness jsonb;
BEGIN
 SELECT e.*INTO enrollment_row FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id AND c.organization_id=p_org
  JOIN public.profiles p ON p.user_id=e.user_id AND p.organization_id=p_org AND p.archived_at IS NULL WHERE e.id=p_enrollment FOR SHARE OF e,c,p NOWAIT;
 IF enrollment_row.id IS NULL OR public.uc_identification_target_allowed(p_org,enrollment_row.user_id,true)IS NOT TRUE THEN PERFORM uc_individual_issuance_private.fail('SOURCE_UNAVAILABLE');END IF;
 SELECT *INTO head_row FROM uc_individual_orders_private.orders WHERE organization_id=p_org AND enrollment_id=p_enrollment AND subject_user_id=enrollment_row.user_id
  AND course_id=enrollment_row.course_id AND order_kind='admission'AND registry IS NOT NULL FOR SHARE NOWAIT;
 IF head_row.id IS NULL OR head_row.decision->>'kind'IS DISTINCT FROM'admit'THEN PERFORM uc_individual_issuance_private.fail('ADMISSION_UNAVAILABLE');END IF;
 witness:=uc_individual_issuance_private.order_witness(head_row,p_live);
 binding:=jsonb_build_object('kind','individual_w1_admission','version',1,'scope',uc_individual_issuance_private.scope(p_org,p_enrollment,enrollment_row.user_id,enrollment_row.course_id),
  'programme',head_row.facts->'programme','programme_facts',head_row.facts->'programme_facts','admission_order',witness);
 RETURN binding||jsonb_build_object('source_hash',public.uc_program_hash(binding));
END;$fn$;
CREATE FUNCTION uc_individual_issuance_private.case_target(p_org uuid,p_user uuid,p_enrollment uuid,p_live boolean DEFAULT false)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE sidecar uc_individual_issuance_private.cases;canonical public.uc_admission_cases;current_binding jsonb;
BEGIN
 SELECT *INTO sidecar FROM uc_individual_issuance_private.cases WHERE organization_id=p_org AND enrollment_id=p_enrollment AND user_id=p_user FOR SHARE NOWAIT;
 IF sidecar.case_id IS NULL THEN RETURN NULL;END IF;
 SELECT *INTO canonical FROM public.uc_admission_cases WHERE id=sidecar.case_id AND organization_id=p_org AND enrollment_id=p_enrollment AND user_id=p_user FOR SHARE NOWAIT;
 IF canonical.id IS NULL OR canonical.group_id IS NOT NULL OR canonical.course_id IS DISTINCT FROM sidecar.course_id
  OR canonical.program_ref IS DISTINCT FROM sidecar.binding->'programme'OR sidecar.source_sha256 IS DISTINCT FROM sidecar.binding->>'source_hash'
  OR public.uc_program_hash(sidecar.binding-'source_hash')IS DISTINCT FROM sidecar.source_sha256
 THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 current_binding:=uc_individual_issuance_private.admission_binding(p_org,p_enrollment,p_live);
 IF current_binding IS DISTINCT FROM sidecar.binding THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('organization_id',p_org,'group_id',NULL,'enrollment_id',p_enrollment,'user_id',p_user,'course_id',sidecar.course_id);
END;$fn$;


CREATE FUNCTION uc_individual_issuance_private.programme_ref_valid(p_value jsonb)RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE k text;
BEGIN
 IF NOT public.uc_signature_assurance_shape(p_value,ARRAY['program_id','version_id','version_revision','facts_sha256','file','file_review_id','file_review_revision','file_approval','snapshot_sha256'])
  OR NOT uc_individual_orders_private.revision(p_value->'version_revision',true)OR NOT uc_individual_orders_private.revision(p_value->'file_review_revision',true)
  OR NOT public.uc_signature_assurance_sha(p_value->'facts_sha256')OR NOT public.uc_signature_assurance_sha(p_value->'snapshot_sha256')
  OR NOT uc_individual_orders_private.ref(p_value->'file')OR NOT public.uc_signature_assurance_shape(p_value->'file_approval',ARRAY['number','date'])
  OR NOT public.uc_signature_assurance_text(p_value->'file_approval'->'number',500)OR NOT uc_individual_orders_private.day(p_value->'file_approval'->'date')THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['program_id','version_id','file_review_id']LOOP IF NOT public.uc_signature_assurance_uuid(p_value->k)THEN RETURN false;END IF;END LOOP;
 RETURN true;
END;$fn$;
CREATE FUNCTION uc_individual_issuance_private.association_target(p_org uuid,p_user uuid,p_enrollment uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
BEGIN RETURN uc_individual_issuance_private.case_target(p_org,p_user,p_enrollment,false);
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IN('EDUCATION_ISSUANCE_SOURCE_CHANGED','EDUCATION_ISSUANCE_SOURCE_UNAVAILABLE','EDUCATION_ISSUANCE_ADMISSION_UNAVAILABLE','UC_INDIVIDUAL_ORDER_SOURCE_CHANGED','UC_INDIVIDUAL_ORDER_SOURCE_UNAVAILABLE')THEN RETURN NULL;END IF;RAISE;
END;$fn$;
CREATE FUNCTION uc_individual_issuance_private.actor_context(p_actor uuid,p_org uuid,p_enrollment uuid,p_mode text)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE context jsonb;
BEGIN
 IF p_mode IS NULL OR p_mode NOT IN('read','admission_write','issue')THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
 context:=uc_individual_orders_private.context(p_org,p_enrollment,p_actor,CASE p_mode WHEN'admission_write'THEN'write'ELSE p_mode END);
 IF p_mode='admission_write'AND(public.uc_admission_actor_allowed(p_actor,true)IS NOT TRUE
  OR public.uc_education_actor_org_permission(p_actor,p_org,'students.write')IS NOT TRUE
  OR public.uc_education_actor_org_permission(p_actor,p_org,'documents.write')IS NOT TRUE)THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
 RETURN context;
END;$fn$;
CREATE FUNCTION uc_individual_issuance_private.case_row(p_case uuid,p_actor uuid,p_mode text)RETURNS public.uc_admission_cases
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE c public.uc_admission_cases;binding uc_individual_issuance_private.cases;context jsonb;current jsonb;
BEGIN
 SELECT *INTO binding FROM uc_individual_issuance_private.cases WHERE case_id=p_case FOR SHARE NOWAIT;
 IF binding.case_id IS NULL THEN PERFORM uc_individual_issuance_private.fail('NOT_FOUND');END IF;
 SELECT *INTO c FROM public.uc_admission_cases WHERE id=p_case AND organization_id=binding.organization_id AND enrollment_id=binding.enrollment_id
  AND user_id=binding.user_id AND course_id=binding.course_id AND group_id IS NULL FOR SHARE NOWAIT;
 IF c.id IS NULL THEN PERFORM uc_individual_issuance_private.fail('SOURCE_UNAVAILABLE');END IF;
 context:=uc_individual_issuance_private.actor_context(p_actor,c.organization_id,c.enrollment_id,p_mode);
 IF context->>'subject_user_id'IS DISTINCT FROM c.user_id::text OR context->>'course_id'IS DISTINCT FROM c.course_id::text THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
 current:=uc_individual_issuance_private.admission_binding(c.organization_id,c.enrollment_id,p_mode<>'read');
 IF current IS DISTINCT FROM binding.binding OR c.program_ref IS DISTINCT FROM current->'programme'THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 RETURN c;
END;$fn$;


-- Versioned typed-ref adapters over exact canonical review actions. Old grouped
-- validator/core bodies are not modified, and actual canonical case/events/
-- reviews/requests remain the single business store. Initializing a new case is
-- a separately scoped W1 operation; the old grouped initialize branch is closed.
CREATE FUNCTION uc_individual_issuance_private.validate_review_action(p_command jsonb)RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE action text:=p_command->>'action';keys text[];k text;x jsonb;BEGIN
 IF p_command->>'action'='initialize'THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 keys:=CASE action WHEN 'initialize'THEN ARRAY['action','group_id','enrollment_id','expected_program_ref','expected_revision']WHEN 'assign_responsible'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','responsible_id','reason']WHEN 'review_local_rules'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','sources','requirements','review_reason']WHEN 'review_requirement'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','requirement_id','expected_requirement_revision','applicability','evidence_version_ids','reason','exception']WHEN 'review_evidence'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','requirement_id','expected_requirement_revision','evidence_version_id','byte_sha256','outcome','reason']WHEN 'record_decision'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','rule_set_id','rule_set_digest','requirements_digest','evidence_version_ids','outcome','reason']ELSE NULL END;
 IF action='review_requirement'AND p_command?'issuance_evidence'THEN keys:=keys||ARRAY['issuance_evidence'];IF NOT public.uc_education_admission_evidence_shape(p_command->'issuance_evidence')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;END IF;
 IF keys IS NULL OR NOT public.uc_admission_shape(p_command,keys)OR NOT uc_individual_issuance_private.programme_ref_valid(p_command->'expected_program_ref')OR jsonb_typeof(p_command->'expected_revision')IS DISTINCT FROM 'number'OR p_command->>'expected_revision'!~'^[0-9]{1,16}$'OR(p_command->>'expected_revision')::numeric>9007199254740991 OR(action='initialize')IS DISTINCT FROM(p_command->>'expected_revision'='0')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 FOREACH k IN ARRAY keys LOOP IF k~'_id$'AND NOT public.uc_admission_uuid(p_command->k)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;END LOOP;
 IF p_command?'reason'AND NOT public.uc_admission_text(p_command->'reason')OR p_command?'review_reason'AND NOT public.uc_admission_text(p_command->'review_reason')OR p_command?'expected_requirement_revision'AND(jsonb_typeof(p_command->'expected_requirement_revision')IS DISTINCT FROM 'number'OR p_command->>'expected_requirement_revision'!~'^[1-9][0-9]{0,15}$'OR(p_command->>'expected_requirement_revision')::numeric>9007199254740991)OR p_command?'evidence_version_ids'AND NOT public.uc_admission_ids(p_command->'evidence_version_ids')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 IF action='review_requirement'THEN
  IF coalesce(p_command->>'applicability'IN('unknown','applicable','not_applicable'),false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  x:=p_command->'exception';IF x<>'null'::jsonb AND(NOT public.uc_admission_shape(x,ARRAY['rule_id','reason','evidence_version_ids'])OR NOT public.uc_admission_uuid(x->'rule_id')OR NOT public.uc_admission_text(x->'reason')OR NOT public.uc_admission_ids(x->'evidence_version_ids',1))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 ELSIF action='review_evidence'AND coalesce(p_command->>'outcome'IN('accepted','rejected')AND jsonb_typeof(p_command->'byte_sha256')='string'AND p_command->>'byte_sha256'~'^[a-f0-9]{64}$',false)=false OR action='record_decision'AND coalesce(p_command->>'outcome'IN('needs_information','admitted','not_admitted')AND jsonb_typeof(p_command->'rule_set_digest')='string'AND jsonb_typeof(p_command->'requirements_digest')='string'AND p_command->>'rule_set_digest'~'^[a-f0-9]{64}$'AND p_command->>'requirements_digest'~'^[a-f0-9]{64}$',false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
END;$fn$;
CREATE FUNCTION uc_individual_issuance_private.apply_review_core(p_organization_id uuid,p_student_user_id uuid,p_request_id uuid,p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();act text:=p_command->>'action';c public.uc_admission_cases;prior public.uc_admission_case_requests;scope jsonb;ref jsonb;reqid uuid;ctx uuid;event uuid:=gen_random_uuid();receipt jsonb;payload_digest text;source jsonb;sources jsonb:='[]';defs jsonb;d jsonb;q jsonb;reqs jsonb:='[]';review jsonb;identities jsonb;identity jsonb;new_rule uuid;digest text;reason text;eid uuid;rid uuid;rev bigint;BEGIN
 IF auth.role()IS DISTINCT FROM 'authenticated'OR a IS NULL OR p_request_id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM uc_individual_issuance_private.validate_review_action(p_command);payload_digest:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'user_id',p_student_user_id,'command',p_command));
 IF act='initialize'THEN scope:=public.uc_admission_association(p_organization_id,p_student_user_id,(p_command->>'group_id')::uuid,(p_command->>'enrollment_id')::uuid);
 ELSE SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_command->>'case_id')::uuid AND organization_id=p_organization_id AND user_id=p_student_user_id;scope:=public.uc_admission_scope(c.id);END IF;
 IF scope IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_admission_lock(a,p_organization_id,p_student_user_id,(scope->>'group_id')::uuid,(scope->>'enrollment_id')::uuid,CASE WHEN act='assign_responsible'THEN(p_command->>'responsible_id')::uuid ELSE c.responsible_id END);
 PERFORM pg_advisory_xact_lock(hashtextextended('uc_admission_request:'||a::text||':'||p_request_id::text,0));
 IF act<>'initialize'THEN SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_command->>'case_id')::uuid;
  IF act IN('review_local_rules','review_requirement','review_evidence','record_decision')AND c.responsible_id IS DISTINCT FROM a THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  IF act='review_local_rules'AND NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  IF act='assign_responsible'AND NOT public.uc_admission_staff_allowed((p_command->>'responsible_id')::uuid,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 END IF;
 SELECT * INTO prior FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id;
 IF prior.actor_id IS NOT NULL THEN IF prior.payload_digest<>payload_digest OR prior.organization_id<>p_organization_id OR prior.user_id<>p_student_user_id OR prior.kind<>act THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;RETURN public.uc_admission_result(prior.case_id,a,prior.receipt,true);END IF;
 IF act='initialize'THEN
  ref:=public.uc_admission_program(p_organization_id,p_student_user_id,(scope->>'group_id')::uuid,(scope->>'enrollment_id')::uuid);IF ref IS NULL THEN PERFORM public.uc_admission_error('PREREQUISITE_MISSING');END IF;
  IF ref IS DISTINCT FROM p_command->'expected_program_ref'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  IF EXISTS(SELECT 1 FROM public.uc_admission_cases WHERE organization_id=p_organization_id AND group_id=(scope->>'group_id')::uuid AND enrollment_id=(scope->>'enrollment_id')::uuid)THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
  INSERT INTO public.uc_admission_cases(organization_id,user_id,group_id,enrollment_id,course_id,program_ref,program_title,program_type,revision)SELECT p_organization_id,p_student_user_id,(scope->>'group_id')::uuid,(scope->>'enrollment_id')::uuid,(scope->>'course_id')::uuid,ref,public.uc_admission_trim(v.facts->>'full_title'),v.facts->>'program_type',1 FROM public.program_fact_versions v WHERE v.id=(ref->>'version_id')::uuid RETURNING * INTO c;
  ctx:=public.uc_admission_context(c.id,a,'mutation');
 ELSE
  SELECT * INTO c FROM public.uc_admission_cases WHERE id=c.id FOR UPDATE;
  IF c.revision<>(p_command->>'expected_revision')::bigint THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
  IF c.revision>=9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
  IF c.program_ref IS DISTINCT FROM p_command->'expected_program_ref'OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  IF act IN('review_local_rules','review_requirement','review_evidence','record_decision')AND c.responsible_id IS DISTINCT FROM a THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  ctx:=public.uc_admission_context(c.id,a,'mutation');
  UPDATE public.uc_admission_cases SET revision=revision+1,updated_at=clock_timestamp()WHERE id=c.id RETURNING * INTO c;
  reason:=coalesce(p_command->>'reason',p_command->>'review_reason');
  IF act='assign_responsible'THEN
   IF NOT public.uc_admission_staff_allowed((p_command->>'responsible_id')::uuid,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
   UPDATE public.uc_admission_cases SET responsible_id=(p_command->>'responsible_id')::uuid WHERE id=c.id;
  ELSIF act='review_local_rules'THEN
   IF NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
   IF jsonb_typeof(p_command->'sources')IS DISTINCT FROM 'array'OR jsonb_array_length(p_command->'sources')NOT BETWEEN 1 AND 3 OR jsonb_typeof(p_command->'requirements')IS DISTINCT FROM 'array'OR jsonb_array_length(p_command->'requirements')NOT BETWEEN 3 AND 50 THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   FOR source IN SELECT x FROM jsonb_array_elements(p_command->'sources')x LOOP
    IF NOT public.uc_admission_shape(source,ARRAY['document_id','version_id','review_id'])OR NOT public.uc_admission_uuid(source->'document_id')OR NOT public.uc_admission_uuid(source->'version_id')OR NOT public.uc_admission_uuid(source->'review_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
    PERFORM public.uc_admission_lock_rules(jsonb_build_array(source));d:=public.uc_admission_local_source(c.organization_id,source);IF d IS NULL THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;sources:=sources||jsonb_build_array(d);END LOOP;
   IF(SELECT count(DISTINCT x->>'document_id')FROM jsonb_array_elements(p_command->'sources')x)<>jsonb_array_length(sources)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   defs:=p_command->'requirements';IF(SELECT count(DISTINCT x->>'key')FROM jsonb_array_elements(defs)x)<>jsonb_array_length(defs)OR EXISTS(SELECT 1 FROM unnest(ARRAY['education_basis','application','contract_or_funding'])k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(defs)x WHERE x->>'kind'=k))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   FOR d IN SELECT x FROM jsonb_array_elements(defs)x LOOP
    IF NOT public.uc_education_admission_definition_shape(d,c.program_type)OR coalesce(jsonb_typeof(d->'key')='string'AND d->>'key'~'^[a-z0-9_]{1,64}$'AND d->>'kind'IN('education_basis','application','contract_or_funding','other_reviewed')AND d->>'exception_policy'IN('not_defined','local_reasoned_exception'),false)=false OR NOT public.uc_admission_text(d->'staff_label',160)OR NOT public.uc_admission_text(d->'provision',1000)OR NOT public.uc_admission_ids(d->'source_version_ids',1,3)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'source_version_ids')v WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources)s WHERE s->'version_id'=v))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(defs)def WHERE def?'issuance_condition')AND(SELECT count(*)FROM jsonb_array_elements(defs)def WHERE def->>'kind'='education_basis')<>1 THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   new_rule:=gen_random_uuid();digest:=public.uc_program_hash(jsonb_build_object('program_ref',c.program_ref,'source_snapshots',sources,'definitions',defs));identities:=coalesce(c.reviews->'identities','{}');
   FOR d IN SELECT x FROM jsonb_array_elements(defs)x LOOP
    identity:=identities->(d->>'key');reqid:=coalesce((identity->>'id')::uuid,gen_random_uuid());rev:=coalesce((identity->>'revision')::bigint,0)+1;
    IF rev>9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;identities:=identities||jsonb_build_object(d->>'key',jsonb_build_object('id',reqid,'revision',rev));
    reqs:=reqs||jsonb_build_array(jsonb_build_object('id',reqid,'revision',rev,'rule_id',gen_random_uuid(),'rule_set_id',new_rule,'rule_set_digest',digest,'label',d->'staff_label','applicability','unknown','review_event_id',NULL,'evidence_version_ids','[]'::jsonb,'current_state','unknown','public_next_action','Обратитесь к ответственному сотруднику'));END LOOP;
   source:=public.uc_admission_authority(c.id,a);INSERT INTO public.uc_admission_rule_sets(id,case_id,organization_id,user_id,program_ref,digest,sources,source_snapshots,definitions,reviewer_id,authority_hash,authority_snapshot,review_reason)VALUES(new_rule,c.id,c.organization_id,c.user_id,c.program_ref,digest,p_command->'sources',sources,defs,a,public.uc_program_hash(source),source,reason);
   UPDATE public.uc_admission_cases SET rule_set_id=new_rule,requirements=reqs,reviews=jsonb_build_object('identities',identities,'requirements','{}'::jsonb,'evidence','{}'::jsonb)WHERE id=c.id;
  ELSIF act IN('review_requirement','review_evidence')THEN
   SELECT x INTO q FROM jsonb_array_elements(c.requirements)x WHERE x->>'id'=p_command->>'requirement_id';IF q IS NULL OR(q->>'revision')::bigint<>(p_command->>'expected_requirement_revision')::bigint THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
   IF NOT public.uc_admission_rules_current(c.id)THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
   IF act='review_requirement'THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->'evidence_version_ids')x WHERE NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=(x#>>'{}')::uuid AND e.case_id=c.id AND e.requirement_id=(q->>'id')::uuid AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id)))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
    IF p_command->'exception'<>'null'::jsonb THEN
     IF p_command->>'applicability'<>'applicable'OR p_command->'exception'->>'rule_id'<>q->>'rule_id'OR NOT EXISTS(SELECT 1 FROM public.uc_admission_rule_sets rs,jsonb_array_elements(rs.definitions)AS rule_definition(definition) WHERE rs.id=c.rule_set_id AND rule_definition.definition->>'exception_policy'='local_reasoned_exception'AND c.reviews->'identities'->(rule_definition.definition->>'key')->>'id'=q->>'id')OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->'exception'->'evidence_version_ids')x WHERE NOT p_command->'evidence_version_ids'@>jsonb_build_array(x))THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;END IF;
    SELECT coalesce(jsonb_agg(CASE WHEN x->>'id'=q->>'id'THEN x||jsonb_build_object('applicability',p_command->'applicability','review_event_id',event)ELSE x END),'[]')INTO reqs FROM jsonb_array_elements(c.requirements)x;
    PERFORM public.uc_education_admission_review_check(c.id,(q->>'id')::uuid,p_command->'issuance_evidence',p_command->'evidence_version_ids');
    review:=jsonb_build_object('actor_id',a,'reason',reason,'exception',p_command->'exception','event_id',event,'requirement_revision',q->'revision');
    IF EXISTS(SELECT 1 FROM public.uc_admission_rule_sets rs,jsonb_array_elements(rs.definitions)def WHERE rs.id=c.rule_set_id AND def?'issuance_condition'AND c.reviews->'identities'->(def->>'key')->>'id'=q->>'id')THEN review:=review||jsonb_build_object('issuance_evidence',p_command->'issuance_evidence');END IF;
    UPDATE public.uc_admission_cases SET requirements=reqs,reviews=jsonb_set(reviews,ARRAY['requirements',q->>'id'],review,true)WHERE id=c.id;
   ELSE
    eid:=(p_command->>'evidence_version_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=eid AND e.case_id=c.id AND e.requirement_id=(q->>'id')::uuid AND e.byte_sha256=p_command->>'byte_sha256'AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id))OR public.uc_admission_evidence_dto(eid,a)->>'availability'<>'available'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
    review:=jsonb_build_object('actor_id',a,'reason',reason,'event_id',event,'outcome',p_command->'outcome','requirement_revision',q->'revision');UPDATE public.uc_admission_cases SET reviews=jsonb_set(reviews,ARRAY['evidence',eid::text],review,true)WHERE id=c.id;
   END IF;
  ELSIF act='record_decision'THEN
   PERFORM public.uc_admission_lock_rules((SELECT rs.sources FROM public.uc_admission_rule_sets rs WHERE rs.id=c.rule_set_id));PERFORM public.uc_admission_refresh(c.id);SELECT * INTO c FROM public.uc_admission_cases WHERE id=c.id;
   IF c.rule_set_id IS DISTINCT FROM(p_command->>'rule_set_id')::uuid OR(SELECT rs.digest FROM public.uc_admission_rule_sets rs WHERE rs.id=c.rule_set_id)IS DISTINCT FROM p_command->>'rule_set_digest'OR public.uc_admission_requirements_digest(c.id)IS DISTINCT FROM p_command->>'requirements_digest'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
   IF NOT public.uc_admission_rules_current(c.id)THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
   IF p_command->>'outcome'='admitted'AND(jsonb_array_length(c.requirements)<3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.requirements)x WHERE x->>'applicability'='unknown'OR x->>'current_state'NOT IN('satisfied','exception_recorded')))THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
   SELECT coalesce(jsonb_agg(e.id ORDER BY e.id),'[]')INTO d FROM public.uc_admission_case_evidence e WHERE e.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id);
   IF public.uc_program_hash(d)<>public.uc_program_hash((SELECT coalesce(jsonb_agg(x ORDER BY x),'[]')FROM jsonb_array_elements(p_command->'evidence_version_ids')x))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
   UPDATE public.uc_admission_cases SET decision=jsonb_build_object('event_id',event,'case_revision',revision,'outcome',p_command->'outcome','recorded_at',clock_timestamp(),'responsible_id',a,'reason',reason,'program_ref',program_ref,'rule_set_id',rule_set_id,'requirements_digest',p_command->'requirements_digest','evidence_version_ids',p_command->'evidence_version_ids','authority_snapshot_hash',public.uc_program_hash(jsonb_build_array(a,public.uc_admission_scope(c.id),true)),'later_review_required',false)WHERE id=c.id;
  END IF;
 END IF;
 PERFORM public.uc_admission_refresh(c.id);receipt:=public.uc_admission_event(c.id,a,event,act,p_request_id,payload_digest,reason);
 DELETE FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=ctx AND kind='_context';RETURN public.uc_admission_result(c.id,a,receipt,false);
END;$fn$;


CREATE FUNCTION uc_individual_issuance_private.programme_for_case(p_org uuid,p_user uuid,p_enrollment uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE target jsonb;programme jsonb;
BEGIN
 target:=uc_individual_issuance_private.case_target(p_org,p_user,p_enrollment,true);IF target IS NULL THEN RETURN NULL;END IF;
 SELECT binding->'programme'INTO programme FROM uc_individual_issuance_private.cases WHERE organization_id=p_org AND user_id=p_user AND enrollment_id=p_enrollment;
 RETURN programme;
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IN('EDUCATION_ISSUANCE_SOURCE_CHANGED','EDUCATION_ISSUANCE_SOURCE_UNAVAILABLE','EDUCATION_ISSUANCE_ADMISSION_UNAVAILABLE','UC_INDIVIDUAL_ORDER_SOURCE_CHANGED','UC_INDIVIDUAL_ORDER_SOURCE_UNAVAILABLE','UC_INDIVIDUAL_ORDER_PREREQUISITE_MISSING')THEN RETURN NULL;END IF;RAISE;
END;$fn$;
CREATE FUNCTION uc_individual_issuance_private.admission_prerequisites(p_org uuid,p_user uuid,p_enrollment uuid,p_rules boolean)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE code text;
BEGIN
 IF uc_individual_issuance_private.association_target(p_org,p_user,p_enrollment)IS NULL THEN code:='association_inactive';
 ELSIF uc_individual_issuance_private.programme_for_case(p_org,p_user,p_enrollment)IS NULL THEN code:='program_file_unavailable';
 ELSIF p_rules THEN code:='rule_set_unreviewed';END IF;
 RETURN CASE WHEN code IS NULL THEN'[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('code',code,'public_label',CASE code WHEN'association_inactive'THEN'Учебная связь недоступна'WHEN'rule_set_unreviewed'THEN'Нужно проверить правила личного дела'ELSE'Нужно подтвердить программу обучения'END,
  'next_action',CASE code WHEN'association_inactive'THEN'contact_staff'WHEN'rule_set_unreviewed'THEN'review_rule_set'ELSE'open_programme_confirmation'END,'persisted',false))END;
END;$fn$;
CREATE FUNCTION uc_individual_issuance_private.personal_counts(p_user uuid)RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',x.table_name,'column',x.column_name,'count',x.n)ORDER BY x.table_name),'[]'::jsonb)FROM(
  SELECT 'uc_individual_issuance_cases'::text table_name,'participant_ids'::text column_name,count(*)n FROM uc_individual_issuance_private.cases c WHERE c.user_id=p_user OR c.created_by=p_user OR p_user=ANY(c.participant_ids)
  UNION ALL SELECT 'uc_individual_issuance_items','participant_ids',count(*)FROM uc_individual_issuance_private.items i WHERE i.user_id=p_user OR i.created_by=p_user OR p_user=ANY(i.participant_ids)
  UNION ALL SELECT 'uc_individual_issuance_contexts','actual_actor_and_subject',count(*)FROM uc_individual_issuance_private.contexts c WHERE c.user_id=p_user OR c.actor_id=p_user
  UNION ALL SELECT 'uc_individual_issuance_sources','participant_ids',count(*)FROM uc_individual_issuance_private.issued_sources s WHERE s.user_id=p_user OR s.recorded_by=p_user OR p_user=ANY(s.participant_ids)
  UNION ALL SELECT 'uc_individual_issuance_requests','participant_ids',count(*)FROM uc_individual_issuance_private.requests r WHERE r.user_id=p_user OR r.actor_id=p_user OR r.canonical_actor_id=p_user OR p_user=ANY(r.participant_ids)
 )x WHERE x.n>0
$fn$;


CREATE FUNCTION uc_individual_issuance_private.case_state(p_case uuid,p_actor uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE c public.uc_admission_cases;state jsonb;binding uc_individual_issuance_private.cases;entry jsonb;code text;codes text[]:='{}';blockers jsonb:='[]';
BEGIN
 c:=uc_individual_issuance_private.case_row(p_case,p_actor,'read');
 SELECT *INTO binding FROM uc_individual_issuance_private.cases WHERE case_id=c.id;
 state:=public.uc_admission_state(c.id,p_actor,false);
 FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(state->'prerequisites','[]'::jsonb))LOOP
  code:=CASE entry->>'code'WHEN'association_inactive'THEN'ADMISSION_UNAVAILABLE'WHEN'missing_program_binding'THEN'PROGRAM_UNCONFIRMED'WHEN'missing_enrollment_snapshot'THEN'PROGRAM_UNCONFIRMED'WHEN'program_file_unavailable'THEN'ADMISSION_SOURCE_UNAVAILABLE'ELSE'ADMISSION_REVIEW_REQUIRED'END;
  IF NOT(code=ANY(codes))THEN codes:=array_append(codes,code);blockers:=blockers||jsonb_build_array(public.uc_education_issue_block(code));END IF;
 END LOOP;
 RETURN(state-'prerequisites')||jsonb_build_object('scope',uc_individual_issuance_private.scope(c.organization_id,c.enrollment_id,c.user_id,c.course_id),'program_ref',binding.binding->'programme',
  'blockers',blockers,'issuance_reviews',coalesce(state->'issuance_reviews','[]'::jsonb),'issuance_conditions',coalesce(state->'issuance_conditions','[]'::jsonb),'binding',binding.binding);
END;$fn$;


-- The actual canonical condition/evidence derivation is retained. Only the
-- explicit persisted case, actual actor and versioned scope/ref differ.
CREATE FUNCTION uc_individual_issuance_private.admission_source(p_org uuid,p_enrollment uuid,p_program jsonb,p_program_type text,p_actor uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;s jsonb;rs public.uc_admission_rule_sets;def jsonb;q jsonb;review jsonb;dto jsonb;e jsonb;refs jsonb:='[]';final_refs jsonb:='[]';final_proof jsonb;ref jsonb;req uuid;BEGIN
 SELECT x.*INTO c FROM public.uc_admission_cases x JOIN uc_individual_issuance_private.cases b ON b.case_id=x.id AND b.organization_id=x.organization_id AND b.enrollment_id=x.enrollment_id AND b.user_id=x.user_id AND b.course_id=x.course_id WHERE x.organization_id=p_org AND x.group_id IS NULL AND x.enrollment_id=p_enrollment;
 IF c.id IS NULL OR NOT public.uc_admission_staff_allowed(p_actor,p_org,c.user_id,NULL::uuid,p_enrollment,false)THEN RETURN jsonb_build_object('code','ADMISSION_UNAVAILABLE','ref',NULL);END IF;
 s:=public.uc_admission_state(c.id,p_actor,false);IF c.program_ref IS DISTINCT FROM p_program THEN RETURN jsonb_build_object('code','ADMISSION_REVIEW_REQUIRED','ref',NULL);END IF;
 IF s->'decision'IS NULL OR s->'decision'='null'::jsonb OR s->'decision'->>'outcome'IS DISTINCT FROM 'admitted'THEN RETURN jsonb_build_object('code','ADMISSION_NOT_CONFIRMED','ref',NULL);END IF;
 IF s->'decision'->'later_review_required'IS DISTINCT FROM 'false'::jsonb OR NOT public.uc_admission_rules_current(c.id)THEN RETURN jsonb_build_object('code','ADMISSION_REVIEW_REQUIRED','ref',NULL);END IF;
 SELECT *INTO rs FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id AND NOT authority_redacted;
 IF rs.id IS NULL OR(SELECT count(*)FROM jsonb_array_elements(rs.definitions)x WHERE x->>'kind'='education_basis')<>1 THEN RETURN jsonb_build_object('code','FINAL_ISSUANCE_CONDITION_UNCONFIRMED','ref',NULL);END IF;
 SELECT x INTO def FROM jsonb_array_elements(rs.definitions)x WHERE x->>'kind'='education_basis';req:=(c.reviews->'identities'->(def->>'key')->>'id')::uuid;SELECT x INTO q FROM jsonb_array_elements(s->'requirements')x WHERE x->>'id'=req::text;review:=c.reviews->'requirements'->req::text;
 IF NOT def?'issuance_condition'OR NOT public.uc_education_admission_definition_shape(def,p_program_type)OR(p_program_type IN('dpo_upskilling','dpo_retraining')AND def->'issuance_condition'->>'kind'IS DISTINCT FROM 'primary_education_before_qualification')THEN RETURN jsonb_build_object('code','FINAL_ISSUANCE_CONDITION_UNCONFIRMED','ref',NULL);END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(c.decision->'evidence_version_ids')ORDER BY value LOOP
  dto:=public.uc_admission_evidence_dto((e#>>'{}')::uuid,p_actor);IF dto->>'case_id'IS DISTINCT FROM c.id::text OR dto->>'availability'IS DISTINCT FROM 'available'OR dto->>'review'IS DISTINCT FROM 'accepted'OR dto->'can_read_bytes'IS DISTINCT FROM 'true'::jsonb OR NOT public.uc_admission_uuid(dto->'review_event_id')OR EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=(e#>>'{}')::uuid)THEN RETURN jsonb_build_object('code','ADMISSION_SOURCE_UNAVAILABLE','ref',NULL);END IF;
  refs:=refs||jsonb_build_array(jsonb_build_object('evidence_id',dto->'id','requirement_id',dto->'requirement_id','review_event_id',dto->'review_event_id','byte_sha256',dto->'byte_sha256','byte_size',dto->'byte_size'));END LOOP;
 IF def->'issuance_condition'->>'kind'='primary_education_before_qualification'THEN
  IF review->'issuance_evidence'IS NULL OR review->'issuance_evidence'='null'::jsonb OR NOT public.uc_education_admission_evidence_shape(review->'issuance_evidence')OR review->'requirement_revision'IS DISTINCT FROM q->'revision'OR NOT public.uc_admission_uuid(review->'event_id')THEN RETURN jsonb_build_object('code','PRIMARY_EDUCATION_EVIDENCE_REQUIRED','ref',NULL);END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(review->'issuance_evidence'->'evidence_version_ids')ORDER BY value LOOP SELECT x INTO dto FROM jsonb_array_elements(refs)x WHERE x->'evidence_id'=e AND x->>'requirement_id'=req::text;IF dto IS NULL THEN RETURN jsonb_build_object('code','PRIMARY_EDUCATION_EVIDENCE_REQUIRED','ref',NULL);END IF;final_refs:=final_refs||jsonb_build_array(dto);END LOOP;
  final_proof:=jsonb_build_object('requirement_id',req,'requirement_revision',q->'revision','review_event_id',review->'event_id','education_level',review->'issuance_evidence'->'education_level','evidence_refs',final_refs);
 END IF;
 ref:=jsonb_build_object('kind','individual_w1_admission_review','version',1,'case_id',c.id,'scope',uc_individual_issuance_private.scope(c.organization_id,c.enrollment_id,c.user_id,c.course_id),'revision',c.revision,'decision_event_id',c.decision->'event_id','decision_case_revision',c.decision->'case_revision','program_ref',c.program_ref,'rule_set_id',c.rule_set_id,'rule_set_digest',rs.digest,'requirements_digest',public.uc_admission_requirements_digest(c.id),'evidence_refs',refs,'final_education_proof',final_proof);
 RETURN jsonb_build_object('code',NULL,'ref',ref||jsonb_build_object('source_hash',public.uc_program_hash(ref)));END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.protocol_current(p_case uuid,p_actor uuid,p_completion uc_individual_orders_private.orders)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;e public.uc_admission_case_events;r jsonb;basis jsonb;actual jsonb;hash_input jsonb;
BEGIN
 c:=uc_individual_issuance_private.case_row(p_case,p_actor,'read');
 SELECT *INTO e FROM public.uc_admission_case_events WHERE case_id=c.id AND organization_id=c.organization_id AND kind='review_protocol_facts'ORDER BY case_revision DESC LIMIT 1;
 IF e.id IS NULL OR e.authority_redacted OR e.actor_id IS NULL OR public.uc_custom_journal_person(e.actor_id)IS NOT TRUE THEN RETURN NULL;END IF;
 r:=e.payload;hash_input:=r-'review_sha256';
 IF r->>'id'IS DISTINCT FROM e.id::text OR r->'case_revision'IS DISTINCT FROM to_jsonb(e.case_revision)
  OR r->>'actor_user_id'IS DISTINCT FROM e.actor_id::text OR r->>'recorded_at'IS DISTINCT FROM public.uc_signature_assurance_utc(e.recorded_at)
  OR r->>'completion_order_id'IS DISTINCT FROM p_completion.id::text OR r->'completion_decision_event_id'IS DISTINCT FROM p_completion.decision->'event_id'
  OR r->'protocol_source'IS DISTINCT FROM p_completion.decision->'decision'->'final_protocol_source'
  OR r->>'review_sha256'IS DISTINCT FROM public.uc_program_hash(hash_input)
 THEN RETURN NULL;END IF;
 SELECT x INTO basis FROM jsonb_array_elements(p_completion.source_witness->'basis')x WHERE x->>'role'='final_protocol'AND x->'source'=r->'protocol_source'AND x->'review_id'=r->'protocol_review_id'AND x->'review_revision'=r->'protocol_review_revision';
 IF basis IS NULL THEN RETURN NULL;END IF;
 actual:=uc_individual_orders_private.reviewed_source(c.organization_id,r->'protocol_source',(r->>'protocol_review_id')::uuid,(r->>'protocol_review_revision')::bigint,'final_protocol');
 IF actual->'review_sha256'IS DISTINCT FROM basis->'review_sha256'OR r->>'actual_outcome'IS DISTINCT FROM'passed'
  OR r->'subject_and_programme_checked'IS DISTINCT FROM'true'::jsonb OR r->'required_practice_checked'IS DISTINCT FROM'true'::jsonb OR r->'attestation_criteria_checked'IS DISTINCT FROM'true'::jsonb
 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('source',r->'protocol_source','review_id',r->'protocol_review_id','review_revision',r->'protocol_review_revision',
  'review_sha256',actual->'review_sha256','provision',basis->'provision','facts_review',r);
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.candidate(p_org uuid,p_enrollment uuid,p_actor uuid,p_lock boolean DEFAULT false)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE ctx jsonb;b jsonb;completion uc_individual_orders_private.orders;c uc_individual_issuance_private.cases;cw jsonb;protocol jsonb;admission jsonb;identity jsonb;ref jsonb;
 name text;birth date;doc_type text;code text;existing uuid;n integer;withdrawal bigint;
BEGIN
 ctx:=uc_individual_issuance_private.actor_context(p_actor,p_org,p_enrollment,'issue');
 IF p_lock THEN PERFORM public.uc_education_issue_enrollment_fence(p_enrollment,true);END IF;
 SELECT count(*)::integer,min(id::text)::uuid INTO n,existing FROM public.education_document_records WHERE organization_id=p_org AND enrollment_id=p_enrollment AND document_status='original';
 IF n>1 THEN existing:=NULL;END IF;
 SELECT coalesce(max(revision),0)INTO withdrawal FROM public.uc_enrollment_withdrawal_states WHERE enrollment_id=p_enrollment AND NOT redacted;
 IF public.uc_enrollment_is_withdrawn(p_enrollment)OR EXISTS(SELECT 1 FROM uc_individual_orders_private.orders w WHERE w.organization_id=p_org AND w.enrollment_id=p_enrollment AND w.order_kind='early_withdrawal'AND w.registry IS NOT NULL AND NOT w.closed AND w.decision->>'kind'='terminate_early')THEN code:='WITHDRAWN';ELSIF n>0 THEN code:='ALREADY_ISSUED';END IF;
 IF code IS NULL THEN b:=uc_individual_issuance_private.admission_binding(p_org,p_enrollment,true);
  doc_type:=CASE b->'programme_facts'->>'program_type'WHEN'professional_training'THEN'qualification'WHEN'dpo_upskilling'THEN'certificate'WHEN'dpo_retraining'THEN'diploma'END;
  IF doc_type IS NULL THEN code:='UNSUPPORTED_PROGRAM_TYPE';END IF;
 END IF;
 SELECT *INTO c FROM uc_individual_issuance_private.cases WHERE organization_id=p_org AND enrollment_id=p_enrollment FOR SHARE NOWAIT;
 IF code IS NULL AND c.case_id IS NULL THEN code:='ADMISSION_UNAVAILABLE';END IF;
 IF code IS NULL THEN admission:=uc_individual_issuance_private.admission_source(p_org,p_enrollment,b->'programme',b->'programme_facts'->>'program_type',p_actor);code:=admission->>'code';END IF;
 IF code IS NULL THEN
  SELECT *INTO completion FROM uc_individual_orders_private.orders WHERE organization_id=p_org AND enrollment_id=p_enrollment AND order_kind='completion'AND registry IS NOT NULL FOR SHARE NOWAIT;
  IF completion.id IS NULL THEN code:='ATTESTATION_NOT_PASSED';
  ELSIF completion.subject_user_id::text IS DISTINCT FROM ctx->>'subject_user_id'OR completion.course_id::text IS DISTINCT FROM ctx->>'course_id'
   OR completion.facts->'programme'IS DISTINCT FROM b->'programme'OR completion.decision->>'kind'IS DISTINCT FROM'complete'
   OR completion.decision->'decision'->>'actual_outcome'IS DISTINCT FROM'passed'OR completion.decision->'decision'->'final_protocol_checked'IS DISTINCT FROM'true'::jsonb
   OR completion.decision->'decision'->'required_practice_checked'IS DISTINCT FROM'true'::jsonb OR completion.decision->'decision'->'attestation_criteria_checked'IS DISTINCT FROM'true'::jsonb OR completion.decision->'decision'->'authority_checked'IS DISTINCT FROM'true'::jsonb
  THEN code:='ATTESTATION_REVIEW_REQUIRED';
  ELSE cw:=uc_individual_issuance_private.order_witness(completion,true);protocol:=uc_individual_issuance_private.protocol_current(c.case_id,p_actor,completion);
   IF protocol IS NULL THEN code:='ATTESTATION_REVIEW_REQUIRED';END IF;
  END IF;
 END IF;
 SELECT nullif(btrim(p.full_name),''),d.birth_date INTO name,birth FROM public.profiles p LEFT JOIN public.student_frdo_data d ON d.organization_id=p.organization_id AND d.user_id=p.user_id WHERE p.organization_id=p_org AND p.user_id=(ctx->>'subject_user_id')::uuid;
 IF code IS NULL AND(name IS NULL OR birth IS NULL)THEN code:='IDENTITY_DETAILS_INCOMPLETE';END IF;
 IF code IS NULL THEN
  identity:=jsonb_build_object('user_id',ctx->'subject_user_id','registration_hash',public.uc_program_hash(jsonb_build_object('organization_id',p_org,'user_id',ctx->'subject_user_id','full_name',name,'birth_date',birth)),'source','current_student_registration');
  ref:=jsonb_build_object('kind','individual_w1','version',1,'scope',b->'scope','programme',b->'programme','programme_facts',b->'programme_facts','admission_order',b->'admission_order',
   'admission_review',admission->'ref','completion_order',cw,'completion_decision',completion.decision,'final_protocol',protocol,'identity_ref',identity,'withdrawal_revision',withdrawal);
  ref:=ref||jsonb_build_object('source_hash',public.uc_program_hash(ref));
 END IF;
 RETURN jsonb_build_object('enrollment_id',p_enrollment,'user_id',ctx->'subject_user_id','course_id',ctx->'course_id','group_id',NULL,
  'document_type',doc_type,'eligibility_ref',ref,'existing_original_record_id',existing,'blockers',CASE WHEN code IS NULL THEN'[]'::jsonb ELSE jsonb_build_array(public.uc_education_issue_block(code))END);
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.preview(p_org uuid,p_enrollment uuid,p_actor uuid,p_intent jsonb,p_lock boolean DEFAULT false)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c jsonb;ctx jsonb;
BEGIN
 ctx:=uc_individual_issuance_private.actor_context(p_actor,p_org,p_enrollment,'issue');
 IF NOT public.uc_admission_shape(p_intent,ARRAY['course_id','enrollment_ids','issue_date','document_series'])OR p_intent->'course_id'IS DISTINCT FROM ctx->'course_id'
  OR p_intent->'enrollment_ids'IS DISTINCT FROM jsonb_build_array(p_enrollment)OR NOT public.uc_copy_registry_date(p_intent->'issue_date')OR(p_intent->>'issue_date')::date>CURRENT_DATE
  OR(p_intent->'document_series'<>'null'::jsonb AND(jsonb_typeof(p_intent->'document_series')IS DISTINCT FROM'string'OR length(p_intent->>'document_series')>120))
 THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
 c:=uc_individual_issuance_private.candidate(p_org,p_enrollment,p_actor,p_lock);
 IF c->'eligibility_ref'<>'null'::jsonb AND(p_intent->>'issue_date')::date<(c->'eligibility_ref'->'final_protocol'->'facts_review'->>'protocol_date')::date THEN
  c:=c||jsonb_build_object('eligibility_ref',NULL,'blockers',jsonb_build_array(public.uc_education_issue_block('ATTESTATION_REVIEW_REQUIRED')));
 END IF;
 RETURN jsonb_build_object('intent',p_intent,'preview_hash',public.uc_program_hash(jsonb_build_object('organization_id',p_org,'enrollment_id',p_enrollment,'intent',p_intent,'candidate',c)),
  'candidate',c,'ready',c->'eligibility_ref'<>'null'::jsonb);
END;$fn$;

-- Same canonical printable keys/limits; the attestation date is the actual
-- explicitly reviewed individual final protocol, never a fake learning result.
CREATE FUNCTION uc_individual_issuance_private.render_variables(p_org uuid,p_identity jsonb,p_facts jsonb,p_numbers jsonb,p_proof jsonb,p_document_type text)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE o public.organizations;dt date;out jsonb;
BEGIN
 SELECT *INTO o FROM public.organizations WHERE id=p_org;dt:=(p_proof->'final_protocol'->'facts_review'->>'protocol_date')::date;
 IF o.id IS NULL OR dt IS NULL THEN PERFORM uc_individual_issuance_private.fail('SOURCE_UNAVAILABLE');END IF;
 out:=jsonb_build_object('organization_name',o.name,'organization_inn',coalesce(o.inn,''),'organization_ogrn',coalesce(o.ogrn,''),'organization_director_name',coalesce(o.director_name,''),'organization_director_position',coalesce(o.director_position,''),'organization_director_authority','',
  'full_name',p_identity->'full_name','birth_date',to_char((p_identity->>'birth_date')::date,'DD.MM.YYYY'),'document_type_label',CASE p_document_type WHEN'certificate'THEN'Удостоверение'WHEN'diploma'THEN'Диплом'WHEN'qualification'THEN'Свидетельство'END,
  'document_series',coalesce(p_numbers->>'document_series',''),'document_number',p_numbers->'document_number','reg_number',p_numbers->'reg_number','issue_date',to_char((p_numbers->>'issue_date')::date,'DD.MM.YYYY'),
  'program_title',p_facts->'full_title','program_type_label',CASE p_facts->>'program_type'WHEN'dpo_upskilling'THEN'Повышение квалификации'WHEN'dpo_retraining'THEN'Профессиональная переподготовка'WHEN'professional_training'THEN'Профессиональное обучение'END,
  'academic_hours',p_facts->>'academic_hours','qualification_name',coalesce(p_facts->>'qualification',''),'profession',coalesce(p_facts->>'profession',''),'attestation_outcome','Итоговая аттестация пройдена','attestation_recorded_date',to_char(dt,'DD.MM.YYYY'));
 IF EXISTS(SELECT 1 FROM jsonb_each_text(out)x WHERE x.value IS NULL OR length(x.value)>CASE x.key WHEN'organization_inn'THEN 20 WHEN'organization_ogrn'THEN 20 WHEN'full_name'THEN 500 WHEN'organization_director_name'THEN 500 WHEN'organization_director_position'THEN 300 WHEN'birth_date'THEN 10 WHEN'issue_date'THEN 10 WHEN'attestation_recorded_date'THEN 10 WHEN'document_type_label'THEN 100 WHEN'document_series'THEN 120 WHEN'document_number'THEN 120 WHEN'reg_number'THEN 120 WHEN'program_type_label'THEN 200 WHEN'academic_hours'THEN 40 WHEN'attestation_outcome'THEN 100 WHEN'program_title'THEN 4000 WHEN'qualification_name'THEN 4000 WHEN'profession'THEN 4000 ELSE 1000 END)THEN PERFORM uc_individual_issuance_private.fail('LIMIT_EXCEEDED');END IF;
 RETURN out;
END;$fn$;

-- W2 UC013 authenticated evidence overloads. SOURCE-ONLY fragment; not an installer.
-- Prerequisites: frozen W2 private case/scope/binding helpers and exact legacy body guards.
-- Final owner/ACL inventory and old4/4/2 individual rejection are composed by the 1800 owner.
-- Old canonical body MD5: context4 eb01f1c109788fc65c070eacb0f2aeca;
-- finalize4 96e6b861575a36d4070312f8a18ef58d; file2 165a808a8389dcd656de3f4269aadb12.
-- No grouped signature is replaced and no stored receipt schema is rewritten.

CREATE FUNCTION uc_individual_issuance_private.admission_result(p_case uuid,p_actor uuid,p_receipt jsonb,p_replayed boolean)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE state jsonb;BEGIN
 state:=uc_individual_issuance_private.case_state(p_case,p_actor);
 RETURN jsonb_build_object('schema_version',2,'ok',true,'scope',state->'scope','receipt',p_receipt||jsonb_build_object('schema_version',2),'replayed',p_replayed,'state',state);
END;$fn$;

CREATE FUNCTION public.uc_admission_evidence_context(p_case_id uuid,p_reservation_id uuid,p_expected_revision bigint,p_request_id uuid,p_individual_scope jsonb)RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;r public.uc_admission_evidence_reservations;src jsonb;sealed jsonb;prior public.uc_admission_case_requests;replay jsonb;digest text;binding jsonb;BEGIN
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;SELECT * INTO r FROM public.uc_admission_evidence_reservations WHERE id=p_reservation_id AND case_id=c.id AND actor_id=a;
 IF auth.role()IS DISTINCT FROM 'authenticated'OR a IS NULL OR r.id IS NULL OR p_request_id IS NULL OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,true)OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)OR c.group_id IS NOT NULL OR NOT uc_individual_issuance_private.scope_input(p_individual_scope,c.organization_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 c:=uc_individual_issuance_private.case_row(c.id,a,CASE WHEN r.state='consumed'THEN'read'ELSE'admission_write'END);
 binding:=uc_individual_issuance_private.admission_binding(c.organization_id,c.enrollment_id,r.state<>'consumed');
 IF p_expected_revision IS DISTINCT FROM r.expected_revision THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
 digest:=public.uc_program_hash(jsonb_build_object('case_id',c.id,'reservation_id',r.id,'expected_revision',p_expected_revision));
 sealed:=coalesce(r.sealed_proof,jsonb_build_object('bucket','admission-case-evidence','path',r.user_id::text||'/'||r.organization_id::text||'/'||r.case_id::text||'/sealed/'||r.evidence_version_id::text,'object_id',NULL,'updated_at',NULL,'byte_sha256',NULL,'byte_size',NULL,'mime_type',NULL));
 IF r.state='consumed'THEN
  SELECT * INTO prior FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id AND case_id=c.id AND kind='evidence_committed'AND payload_digest=digest;
  IF prior.actor_id IS NULL OR r.commit_request_id IS DISTINCT FROM p_request_id THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
  src:=public.uc_admission_object('admission-case-evidence',sealed->>'path',sealed->>'byte_sha256');IF src IS NULL OR src->>'object_id'IS DISTINCT FROM sealed->>'object_id'OR(src->>'updated_at')::timestamptz IS DISTINCT FROM(sealed->>'updated_at')::timestamptz OR src->>'byte_size'IS DISTINCT FROM sealed->>'byte_size'OR src->>'mime_type'IS DISTINCT FROM sealed->>'mime_type'THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
  replay:=uc_individual_issuance_private.admission_result(c.id,a,prior.receipt,true);
 ELSE
  IF r.state NOT IN('prepared','sealed')OR r.expires_at<=clock_timestamp()THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
  IF c.revision<>p_expected_revision THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;IF c.revision>=9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
  IF c.program_ref IS DISTINCT FROM r.program_ref OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  src:=public.uc_admission_source_proof(r.id,a);IF src IS NULL THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  IF r.state='sealed'THEN
   IF r.commit_request_id IS DISTINCT FROM p_request_id OR src IS DISTINCT FROM r.source_proof THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
   prior.receipt:=public.uc_admission_object('admission-case-evidence',sealed->>'path',sealed->>'byte_sha256');IF prior.receipt IS NULL OR prior.receipt->>'object_id'IS DISTINCT FROM sealed->>'object_id'OR(prior.receipt->>'updated_at')::timestamptz IS DISTINCT FROM(sealed->>'updated_at')::timestamptz OR prior.receipt->>'byte_size'IS DISTINCT FROM sealed->>'byte_size'OR prior.receipt->>'mime_type'IS DISTINCT FROM sealed->>'mime_type'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('schema_version',2,'mode',r.state,'actor_id',a,'scope',uc_individual_issuance_private.scope(c.organization_id,c.enrollment_id,c.user_id,c.course_id),'case_id',c.id,'case_revision',c.revision,'expected_revision',r.expected_revision,'reservation_id',r.id,'evidence_version_id',r.evidence_version_id,'requirement_id',r.requirement_id,'supersedes_id',r.supersedes_id,'request_id',p_request_id,'expires_at',r.expires_at,'source_kind',r.source->>'kind','source',src,'sealed',sealed,'replay_result',replay,'binding',binding);
END;$fn$;

CREATE FUNCTION public.uc_finalize_admission_case_evidence(p_case_id uuid,p_reservation_id uuid,p_expected_revision bigint,p_request_id uuid,p_individual_scope jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;r public.uc_admission_evidence_reservations;context jsonb;ctx uuid;event uuid:=gen_random_uuid();digest text;receipt jsonb;BEGIN
 context:=public.uc_admission_evidence_context(p_case_id,p_reservation_id,p_expected_revision,p_request_id,p_individual_scope);
 IF context->>'mode'='consumed'THEN RETURN context->'replay_result';END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;PERFORM public.uc_admission_lock(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,c.responsible_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('uc_admission_request:'||a::text||':'||p_request_id::text,0));SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id FOR UPDATE;SELECT * INTO r FROM public.uc_admission_evidence_reservations WHERE id=p_reservation_id FOR UPDATE;
 context:=public.uc_admission_evidence_context(p_case_id,p_reservation_id,p_expected_revision,p_request_id,p_individual_scope);IF context->>'mode'='consumed'THEN RETURN context->'replay_result';END IF;
 IF r.state<>'sealed'THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;PERFORM public.uc_admission_lock_source(r.id);
 context:=public.uc_admission_evidence_context(p_case_id,p_reservation_id,p_expected_revision,p_request_id,p_individual_scope);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.requirements)x WHERE x->>'id'=r.requirement_id::text)OR(r.supersedes_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=r.supersedes_id AND e.case_id=c.id AND e.requirement_id=r.requirement_id AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id)))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id)THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
 ctx:=public.uc_admission_context(c.id,a,'mutation');
 INSERT INTO public.uc_admission_case_evidence(id,case_id,organization_id,user_id,requirement_id,case_revision_created,supersedes_id,source_kind,source_snapshot,participant_ids,captured_by,byte_sha256,byte_size,mime_type,storage_object_id,object_updated_at,sealed_path,event_id)VALUES(r.evidence_version_id,c.id,c.organization_id,c.user_id,r.requirement_id,c.revision+1,r.supersedes_id,CASE WHEN r.source->>'kind'='upload'THEN 'upload'ELSE r.source->'candidate'->>'kind'END,jsonb_build_object('declaration',r.source,'proof',r.source_proof),ARRAY[c.user_id],a,r.sealed_proof->>'byte_sha256',(r.sealed_proof->>'byte_size')::bigint,r.sealed_proof->>'mime_type',(r.sealed_proof->>'object_id')::uuid,(r.sealed_proof->>'updated_at')::timestamptz,r.sealed_proof->>'path',event);
 UPDATE public.uc_admission_cases SET revision=revision+1,updated_at=clock_timestamp()WHERE id=c.id;UPDATE public.uc_admission_evidence_reservations SET state='consumed'WHERE id=r.id;PERFORM public.uc_admission_refresh(c.id);
 digest:=public.uc_program_hash(jsonb_build_object('case_id',c.id,'reservation_id',r.id,'expected_revision',p_expected_revision));receipt:=public.uc_admission_event(c.id,a,event,'evidence_committed',p_request_id,digest,NULL);
 DELETE FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=ctx AND kind='_context';RETURN uc_individual_issuance_private.admission_result(c.id,a,receipt,false);END;$fn$;

CREATE FUNCTION public.uc_admission_evidence_file_context(p_case_id uuid,p_evidence_version_id uuid,p_individual_scope jsonb)RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;e public.uc_admission_case_evidence;o jsonb;BEGIN SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;
 IF auth.role()IS DISTINCT FROM 'authenticated'OR a IS NULL OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)OR c.group_id IS NOT NULL OR NOT uc_individual_issuance_private.scope_input(p_individual_scope,c.organization_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 c:=uc_individual_issuance_private.case_row(c.id,a,'read');
 SELECT * INTO e FROM public.uc_admission_case_evidence WHERE id=p_evidence_version_id AND case_id=c.id;
 o:=public.uc_admission_object('admission-case-evidence',e.sealed_path,e.byte_sha256);IF e.id IS NULL OR o IS NULL OR(o->>'object_id')::uuid IS DISTINCT FROM e.storage_object_id OR(o->>'updated_at')::timestamptz IS DISTINCT FROM e.object_updated_at OR(o->>'byte_size')::bigint IS DISTINCT FROM e.byte_size OR o->>'mime_type'IS DISTINCT FROM e.mime_type THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
 RETURN jsonb_build_object('schema_version',2,'actor_id',a,'scope',uc_individual_issuance_private.scope(c.organization_id,c.enrollment_id,c.user_id,c.course_id),'case_id',c.id,'case_revision',c.revision,'evidence_version_id',e.id,'object',o,'byte_sha256',e.byte_sha256,'byte_size',e.byte_size,'mime_type',e.mime_type);END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.artifact_live(p_actor uuid,p_preparation uuid,p_item uuid,p_revision bigint,p_fresh boolean)RETURNS public.uc_education_issuance_preparation_items
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;typed uc_individual_issuance_private.items;ctx jsonb;candidate jsonb;identity jsonb;e jsonb;dto jsonb;
BEGIN
 SELECT *INTO typed FROM uc_individual_issuance_private.items WHERE item_id=p_item AND preparation_id=p_preparation FOR SHARE NOWAIT;
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=typed.item_id AND preparation_id=typed.preparation_id AND input_revision=p_revision AND NOT redacted;
 SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=p_preparation AND actor_id=p_actor AND kind='original'AND NOT redacted;
 IF typed.item_id IS NULL OR i.id IS NULL OR p.id IS NULL OR i.organization_id<>typed.organization_id OR i.enrollment_id<>typed.enrollment_id OR i.user_id<>typed.user_id OR i.course_id<>typed.course_id
  OR i.group_id IS NOT NULL OR i.eligibility_ref IS DISTINCT FROM typed.eligibility_ref OR typed.source_sha256 IS DISTINCT FROM i.eligibility_ref->>'source_hash'
 THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
 ctx:=uc_individual_issuance_private.actor_context(p_actor,i.organization_id,i.enrollment_id,'issue');
 PERFORM public.uc_education_issue_fence(i.organization_id,NULL,ARRAY[p_actor,i.user_id]);
 PERFORM uc_individual_issuance_private.case_row(typed.case_id,p_actor,'read');
 FOR e IN SELECT value FROM jsonb_array_elements(i.eligibility_ref->'admission_review'->'evidence_refs')LOOP
  dto:=public.uc_admission_evidence_dto((e->>'evidence_id')::uuid,p_actor);
  IF dto IS NULL OR dto->>'case_id'IS DISTINCT FROM typed.case_id::text OR dto->'can_read_bytes'IS DISTINCT FROM'true'::jsonb OR dto->>'availability'IS DISTINCT FROM'available'
   OR dto->'byte_sha256'IS DISTINCT FROM e->'byte_sha256'OR dto->'byte_size'IS DISTINCT FROM e->'byte_size'THEN PERFORM uc_individual_issuance_private.fail('SOURCE_UNAVAILABLE');END IF;
 END LOOP;
 IF p_fresh AND i.final_record_id IS NULL THEN
  IF NOT public.uc_education_template_current(p.organization_id,p.template,p.template_storage)THEN PERFORM uc_individual_issuance_private.fail('ARTIFACT_REVIEW_REQUIRED');END IF;
  IF public.uc_education_number_witness(i.organization_id,(i.number_plan->>'issue_date')::date)IS DISTINCT FROM p.number_witness THEN PERFORM uc_individual_issuance_private.fail('NUMBER_PLAN_STALE');END IF;
  candidate:=uc_individual_issuance_private.candidate(i.organization_id,i.enrollment_id,p_actor,false);
  IF candidate->'eligibility_ref'IS DISTINCT FROM i.eligibility_ref THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
  SELECT jsonb_build_object('user_id',pr.user_id,'full_name',btrim(pr.full_name),'birth_date',d.birth_date,'registration_hash',i.eligibility_ref->'identity_ref'->'registration_hash','source','current_student_registration')INTO identity
   FROM public.profiles pr JOIN public.student_frdo_data d ON d.user_id=pr.user_id AND d.organization_id=pr.organization_id WHERE pr.user_id=i.user_id AND pr.organization_id=i.organization_id;
  IF identity IS DISTINCT FROM i.official_identity
   OR uc_individual_issuance_private.render_variables(i.organization_id,identity,i.eligibility_ref->'programme_facts',i.number_plan,i.eligibility_ref,i.frdo_facts->>'document_type')IS DISTINCT FROM i.render_variables
   OR public.uc_education_frdo_snapshot(i.organization_id,i.user_id,i.eligibility_ref->'programme_facts',i.number_plan,i.frdo_facts->>'document_type',NULL,false)IS DISTINCT FROM i.frdo_facts
  THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 END IF;
 RETURN i;
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.preparation_access(p_preparation uuid,p_fresh boolean,p_item uuid)RETURNS public.uc_education_issuance_preparations
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.uc_education_issuance_preparations;i public.uc_education_issuance_preparation_items;typed uc_individual_issuance_private.items;
BEGIN
 SELECT *INTO typed FROM uc_individual_issuance_private.items WHERE preparation_id=p_preparation;
 SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=p_preparation AND actor_id=auth.uid()AND NOT redacted;
 IF typed.item_id IS NULL OR p.id IS NULL OR auth.role()IS DISTINCT FROM'authenticated'OR(p_item IS NOT NULL AND p_item<>typed.item_id)THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
 IF NOT coalesce((public.uc_document_registry_caps(p.organization_id,NULL)->>'can_register')::boolean,false)THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_source(p.organization_id,p.template->'source',true);
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=typed.item_id;
 PERFORM uc_individual_issuance_private.artifact_live(auth.uid(),p.id,i.id,i.input_revision,p_fresh);
 IF i.artifact IS NOT NULL THEN PERFORM public.uc_education_issue_source(i.organization_id,i.artifact->'source',true);END IF;
 RETURN p;
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.preparation_value(p_preparation uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.uc_education_issuance_preparations;typed uc_individual_issuance_private.items;item jsonb;
BEGIN
 p:=uc_individual_issuance_private.preparation_access(p_preparation,false,NULL);SELECT *INTO typed FROM uc_individual_issuance_private.items WHERE preparation_id=p.id;
 item:=public.uc_education_preparation_item_json(typed.item_id)||jsonb_build_object('source_kind','individual_w1');
 RETURN jsonb_build_object('id',p.id,'organization_id',p.organization_id,'scope',p.scope,'kind',p.kind,'created_at',p.created_at,'created_by',p.actor_id,'intent_hash',p.intent_hash,
  'plan',p.plan,'template',p.template,'items',jsonb_build_array(item),'source_kind','individual_w1');
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.prepare(p_org uuid,p_enrollment uuid,p_request uuid,p_plan jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();ctx jsonb;preview jsonb;c jsonb;proof jsonb;template jsonb;witness jsonb;numbers jsonb;identity jsonb;facts jsonb;frdo jsonb;vars jsonb;source jsonb;
 payload text;prior public.uc_education_issuance_requests;receipt jsonb;prep_id uuid:=gen_random_uuid();item_id uuid:=gen_random_uuid();document_id uuid:=gen_random_uuid();upload_request uuid:=gen_random_uuid();case_id uuid;parts uuid[];
BEGIN
 ctx:=uc_individual_issuance_private.actor_context(a,p_org,p_enrollment,'issue');
 IF p_request IS NULL OR NOT public.uc_admission_shape(p_plan,ARRAY['kind','intent','preview_hash','items','template','reason'])OR p_plan->>'kind'IS DISTINCT FROM'original'
  OR NOT public.uc_admission_text(p_plan->'reason',2000)OR NOT public.uc_signature_assurance_sha(p_plan->'preview_hash')OR jsonb_typeof(p_plan->'items')IS DISTINCT FROM'array'OR jsonb_array_length(p_plan->'items')<>1
  OR NOT public.uc_admission_shape(p_plan->'items'->0,ARRAY['enrollment_id','expected_eligibility_ref'])OR p_plan->'items'->0->>'enrollment_id'IS DISTINCT FROM p_enrollment::text
 THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
 payload:=public.uc_program_hash(jsonb_build_object('organization_id',p_org,'scope',jsonb_build_object('kind','organization'),'plan',p_plan));
 parts:=uc_individual_issuance_private.participants(p_org,p_enrollment,a,p_plan->'template',NULL);PERFORM uc_individual_orders_private.people(parts,true);
 PERFORM public.uc_education_issue_fence(p_org,NULL,parts,'prepare:'||a::text||':'||p_request::text);
 SELECT *INTO prior FROM public.uc_education_issuance_requests WHERE actor_id=a AND request_id=p_request;
 IF prior.request_id IS NOT NULL THEN
  IF prior.organization_id<>p_org OR prior.scope IS DISTINCT FROM jsonb_build_object('kind','organization')OR prior.action<>'prepare_artifacts'OR prior.payload_hash<>payload
   OR NOT EXISTS(SELECT 1 FROM uc_individual_issuance_private.items WHERE preparation_id=(prior.receipt->>'preparation_id')::uuid AND enrollment_id=p_enrollment)
  THEN PERFORM uc_individual_issuance_private.fail('REQUEST_CONFLICT');END IF;
  RETURN jsonb_build_object('receipt',prior.receipt,'preparation',uc_individual_issuance_private.preparation_value((prior.receipt->>'preparation_id')::uuid),'replayed',true);
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_org::text,0))THEN PERFORM uc_individual_issuance_private.fail('REVISION_CONFLICT');END IF;
 preview:=uc_individual_issuance_private.preview(p_org,p_enrollment,a,p_plan->'intent',true);c:=preview->'candidate';proof:=c->'eligibility_ref';
 IF preview->'ready'IS DISTINCT FROM'true'::jsonb OR preview->'preview_hash'IS DISTINCT FROM p_plan->'preview_hash'OR proof IS DISTINCT FROM p_plan->'items'->0->'expected_eligibility_ref'
 THEN PERFORM uc_individual_issuance_private.fail('REVISION_CONFLICT');END IF;
 template:=public.uc_education_template(p_org,p_plan->'template',true);witness:=public.uc_education_number_witness(p_org,(p_plan->'intent'->>'issue_date')::date);
 SELECT coalesce(array_agg(DISTINCT u ORDER BY u),'{}')INTO parts FROM unnest(parts||uc_individual_issuance_private.participants(p_org,p_enrollment,a,p_plan->'template',NULL))u;
 PERFORM uc_individual_orders_private.people(parts,true);PERFORM public.uc_education_issue_fence(p_org,NULL,parts);
 numbers:=public.uc_education_prospective_numbers(witness,1,(p_plan->'intent'->>'issue_date')::date,p_plan->'intent'->>'document_series');
 SELECT jsonb_build_object('user_id',p.user_id,'full_name',btrim(p.full_name),'birth_date',d.birth_date,'registration_hash',proof->'identity_ref'->'registration_hash','source','current_student_registration')INTO identity
  FROM public.profiles p JOIN public.student_frdo_data d ON d.organization_id=p.organization_id AND d.user_id=p.user_id WHERE p.organization_id=p_org AND p.user_id=(ctx->>'subject_user_id')::uuid;
 facts:=proof->'programme_facts';source:=jsonb_build_object('kind','individual_w1','version',1,'scope',proof->'scope','programme',proof->'programme','program_snapshot',jsonb_build_object('facts',facts),'eligibility_ref',proof);
 frdo:=public.uc_education_frdo_snapshot(p_org,(ctx->>'subject_user_id')::uuid,facts,numbers,c->>'document_type',NULL,false);
 vars:=uc_individual_issuance_private.render_variables(p_org,identity,facts,numbers,proof,c->>'document_type');
 SELECT x.case_id INTO case_id FROM uc_individual_issuance_private.cases x WHERE x.organization_id=p_org AND x.enrollment_id=p_enrollment;
 INSERT INTO public.uc_education_issuance_preparations(id,organization_id,actor_id,scope,kind,plan,intent_hash,template,template_storage,number_witness,participant_ids)
 VALUES(prep_id,p_org,a,jsonb_build_object('kind','organization'),'original',p_plan,payload,p_plan->'template',template->'storage',witness,parts);
 INSERT INTO uc_individual_issuance_private.items(item_id,preparation_id,case_id,organization_id,enrollment_id,user_id,course_id,eligibility_ref,source_sha256,participant_ids,created_by)
 VALUES(item_id,prep_id,case_id,p_org,p_enrollment,(ctx->>'subject_user_id')::uuid,(ctx->>'course_id')::uuid,proof,proof->>'source_hash',parts,a);
 INSERT INTO public.uc_education_issuance_preparation_items(id,preparation_id,organization_id,enrollment_id,user_id,course_id,group_id,number_plan,eligibility_ref,source_snapshot,official_identity,frdo_facts,render_variables,render_input_hash,output_document_id,output_request_id,participant_ids)
 VALUES(item_id,prep_id,p_org,p_enrollment,(ctx->>'subject_user_id')::uuid,(ctx->>'course_id')::uuid,NULL,numbers,proof,source,identity,frdo,vars,
 public.uc_program_hash(jsonb_build_object('preparation_id',prep_id,'item_id',item_id,'plan_hash',payload,'template',template,'proof',proof,'source',source,'identity',identity,'frdo_facts',frdo,'numbers',numbers,'variables',vars)),document_id,upload_request,parts);
 receipt:=jsonb_build_object('request_id',p_request,'action','prepare_artifacts','payload_hash',payload,'preparation_id',prep_id,'applied_at',clock_timestamp(),'replayed',false);
 INSERT INTO public.uc_education_issuance_requests(actor_id,request_id,organization_id,scope,action,payload_hash,receipt,participant_ids)VALUES(a,p_request,p_org,jsonb_build_object('kind','organization'),'prepare_artifacts',payload,receipt,parts);
 RETURN jsonb_build_object('receipt',receipt,'preparation',uc_individual_issuance_private.preparation_value(prep_id),'replayed',false);
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.participants(p_org uuid,p_enrollment uuid,p_actor uuid,p_template jsonb DEFAULT NULL,p_item uuid DEFAULT NULL,p_command jsonb DEFAULT NULL)RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 WITH current_case AS MATERIALIZED(SELECT c.*FROM public.uc_admission_cases c JOIN uc_individual_issuance_private.cases t ON t.case_id=c.id WHERE t.organization_id=p_org AND t.enrollment_id=p_enrollment),
 current_rules AS MATERIALIZED(SELECT r.*FROM public.uc_admission_rule_sets r JOIN current_case c ON c.rule_set_id=r.id),
 incoming_sources AS(SELECT x source FROM jsonb_array_elements(CASE WHEN p_command->>'action'='apply_admission_review'AND p_command->'command'->>'action'='review_local_rules'AND jsonb_typeof(p_command->'command'->'sources')='array'THEN CASE WHEN jsonb_array_length(p_command->'command'->'sources')BETWEEN 1 AND 3 THEN p_command->'command'->'sources'ELSE'[]'::jsonb END ELSE'[]'::jsonb END)x),
 local_sources AS(SELECT x source FROM current_rules r CROSS JOIN LATERAL jsonb_array_elements(r.sources)x UNION ALL SELECT source FROM incoming_sources),
 incoming_documents AS(SELECT to_jsonb(d)AS source_row FROM public.student_identity_documents d JOIN current_case c ON c.user_id=d.user_id AND c.organization_id=d.organization_id WHERE p_command->>'action'='prepare_evidence'AND p_command->'source'->>'kind'='existing'AND p_command->'source'->'candidate'->>'kind'='identity_document'AND d.id::text=p_command->'source'->'candidate'->>'id'
  UNION ALL SELECT to_jsonb(d)FROM public.student_documents d JOIN current_case c ON c.enrollment_id=d.enrollment_id WHERE p_command->>'action'='prepare_evidence'AND p_command->'source'->>'kind'='existing'AND p_command->'source'->'candidate'->>'kind'='enrollment_document'AND d.id::text=p_command->'source'->'candidate'->>'id'),
 selected_item AS MATERIALIZED(SELECT i.*FROM public.uc_education_issuance_preparation_items i JOIN uc_individual_issuance_private.items t ON t.item_id=i.id WHERE i.id=p_item AND t.organization_id=p_org AND t.enrollment_id=p_enrollment),
 templates AS(SELECT p_template ref UNION ALL SELECT p.template FROM public.uc_education_issuance_preparations p JOIN selected_item i ON i.preparation_id=p.id),
 selected_versions AS(SELECT v.id,v.uploaded_by FROM templates t JOIN public.org_document_versions v ON v.id::text=t.ref->'source'->>'version_id'AND v.document_id::text=t.ref->'source'->>'document_id'AND v.organization_id=p_org
  UNION ALL SELECT v.id,v.uploaded_by FROM public.org_document_versions v JOIN selected_item i ON i.organization_id=v.organization_id AND i.output_document_id=v.document_id AND i.output_request_id=v.request_id)
 SELECT coalesce(array_agg(DISTINCT u ORDER BY u),'{}')FROM(
  SELECT p_actor u UNION ALL SELECT e.user_id FROM public.enrollments e JOIN public.courses co ON co.id=e.course_id AND co.organization_id=p_org WHERE e.id=p_enrollment
  UNION ALL SELECT (p_command->'command'->>'responsible_id')::uuid FROM current_case c WHERE p_command->>'action'='apply_admission_review'AND p_command->'command'->>'action'='assign_responsible'AND c.id::text=p_command->'command'->>'case_id'
   AND public.uc_admission_uuid(p_command->'command'->'responsible_id')AND public.uc_admission_staff_allowed(CASE WHEN public.uc_admission_uuid(p_command->'command'->'responsible_id')THEN(p_command->'command'->>'responsible_id')::uuid END,p_org,c.user_id,NULL,p_enrollment,true)
   AND public.uc_admission_staff_allowed(CASE WHEN public.uc_admission_uuid(p_command->'command'->'responsible_id')THEN(p_command->'command'->>'responsible_id')::uuid END,p_org,c.user_id,NULL,p_enrollment,false)
  UNION ALL SELECT unnest(o.participant_ids)FROM uc_individual_orders_private.orders o WHERE o.organization_id=p_org AND o.enrollment_id=p_enrollment
  UNION ALL SELECT unnest(s.participant_ids)FROM uc_individual_issuance_private.cases s WHERE s.organization_id=p_org AND s.enrollment_id=p_enrollment
  UNION ALL SELECT c.responsible_id FROM current_case c
  UNION ALL SELECT CASE WHEN public.uc_admission_uuid(c.decision->'responsible_id')THEN(c.decision->>'responsible_id')::uuid END FROM current_case c
  UNION ALL SELECT CASE WHEN public.uc_admission_uuid(q.value->'actor_id')THEN(q.value->>'actor_id')::uuid END FROM current_case c CROSS JOIN LATERAL jsonb_each(coalesce(c.reviews->'requirements','{}'))q
  UNION ALL SELECT CASE WHEN public.uc_admission_uuid(q.value->'actor_id')THEN(q.value->>'actor_id')::uuid END FROM current_case c CROSS JOIN LATERAL jsonb_each(coalesce(c.reviews->'evidence','{}'))q
  UNION ALL SELECT r.reviewer_id FROM current_rules r
  UNION ALL SELECT e.actor_id FROM public.uc_admission_case_events e JOIN current_case c ON c.id=e.case_id WHERE e.id=(c.decision->>'event_id')::uuid
  UNION ALL SELECT x.actor_id FROM current_case c CROSS JOIN LATERAL(SELECT e.actor_id FROM public.uc_admission_case_events e WHERE e.case_id=c.id AND e.kind='review_protocol_facts'ORDER BY e.case_revision DESC LIMIT 1)x
  UNION ALL SELECT unnest(e.participant_ids)FROM public.uc_admission_case_evidence e JOIN current_case c ON c.id=e.case_id WHERE NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id)
  UNION ALL SELECT e.captured_by FROM public.uc_admission_case_evidence e JOIN current_case c ON c.id=e.case_id WHERE NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id)
  UNION ALL SELECT r.actor_id FROM public.uc_admission_evidence_reservations r JOIN current_case c ON c.id=r.case_id WHERE r.state IN('prepared','sealed')AND r.expires_at>now()
  UNION ALL SELECT CASE WHEN public.uc_admission_uuid(d.source_row->k)THEN(d.source_row->>k)::uuid END FROM incoming_documents d CROSS JOIN unnest(ARRAY['uploaded_by','created_by','actor_id','user_id','student_user_id'])k
  UNION ALL SELECT v.uploaded_by FROM local_sources s JOIN public.org_document_versions v ON v.id::text=s.source->>'version_id'AND v.document_id::text=s.source->>'document_id'AND v.organization_id=p_org
  UNION ALL SELECT r.approved_by FROM local_sources s JOIN public.org_document_reviews r ON r.id::text=s.source->>'review_id'AND r.version_id::text=s.source->>'version_id'AND r.document_id::text=s.source->>'document_id'AND r.organization_id=p_org
  UNION ALL SELECT r.reviewer_user_id FROM local_sources s JOIN public.org_document_reviews r ON r.id::text=s.source->>'review_id'AND r.version_id::text=s.source->>'version_id'AND r.document_id::text=s.source->>'document_id'AND r.organization_id=p_org
  UNION ALL SELECT v.uploaded_by FROM selected_versions v
  UNION ALL SELECT r.approved_by FROM templates t JOIN public.org_document_reviews r ON r.id::text=t.ref->>'review_id'AND r.version_id::text=t.ref->'source'->>'version_id'AND r.organization_id=p_org
  UNION ALL SELECT r.reviewer_user_id FROM templates t JOIN public.org_document_reviews r ON r.id::text=t.ref->>'review_id'AND r.version_id::text=t.ref->'source'->>'version_id'AND r.organization_id=p_org
  UNION ALL SELECT r.approved_by FROM public.org_document_reviews r JOIN selected_item i ON r.document_id=i.output_document_id AND r.organization_id=i.organization_id JOIN selected_versions v ON v.id=r.version_id WHERE r.state='approved'
  UNION ALL SELECT r.reviewer_user_id FROM public.org_document_reviews r JOIN selected_item i ON r.document_id=i.output_document_id AND r.organization_id=i.organization_id JOIN selected_versions v ON v.id=r.version_id WHERE r.state='approved'
 )x WHERE u IS NOT NULL
$fn$;

CREATE FUNCTION uc_individual_issuance_private.initialize(p_org uuid,p_enrollment uuid,p_request uuid,p_expected jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();ctx jsonb;b jsonb;c public.uc_admission_cases;id uuid:=gen_random_uuid();event_id uuid:=gen_random_uuid();context_id uuid;receipt jsonb;h text;parts uuid[];
BEGIN
 ctx:=uc_individual_issuance_private.actor_context(a,p_org,p_enrollment,'admission_write');b:=uc_individual_issuance_private.admission_binding(p_org,p_enrollment,true);
 IF b IS DISTINCT FROM p_expected THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 parts:=uc_individual_issuance_private.participants(p_org,p_enrollment,a);PERFORM uc_individual_orders_private.people(parts,true);
 PERFORM public.uc_education_issue_fence(p_org,NULL,parts,'individual_admission:'||p_enrollment::text);
 IF EXISTS(SELECT 1 FROM uc_individual_issuance_private.cases WHERE organization_id=p_org AND enrollment_id=p_enrollment)
  OR EXISTS(SELECT 1 FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request)THEN PERFORM uc_individual_issuance_private.fail('REQUEST_CONFLICT');END IF;
 INSERT INTO uc_individual_issuance_private.cases(case_id,organization_id,enrollment_id,user_id,course_id,binding,source_sha256,participant_ids,created_by)
 VALUES(id,p_org,p_enrollment,(ctx->>'subject_user_id')::uuid,(ctx->>'course_id')::uuid,b,b->>'source_hash',parts,a);
 INSERT INTO public.uc_admission_cases(id,organization_id,user_id,group_id,enrollment_id,course_id,program_ref,program_title,program_type,revision)
 VALUES(id,p_org,(ctx->>'subject_user_id')::uuid,NULL,p_enrollment,(ctx->>'course_id')::uuid,b->'programme',public.uc_admission_trim(b->'programme_facts'->>'full_title'),b->'programme_facts'->>'program_type',1)RETURNING*INTO c;
 PERFORM public.uc_admission_lock(a,p_org,c.user_id,NULL,c.enrollment_id,NULL);context_id:=public.uc_admission_context(c.id,a,'mutation');
 h:=public.uc_program_hash(jsonb_build_object('organization_id',p_org,'enrollment_id',p_enrollment,'binding',b,'operation','initialize_admission'));
 PERFORM public.uc_admission_refresh(c.id);receipt:=public.uc_admission_event(c.id,a,event_id,'initialize',p_request,h,NULL);
 DELETE FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=context_id AND kind='_context';
 RETURN jsonb_build_object('receipt',receipt,'state',uc_individual_issuance_private.case_state(c.id,a),'replayed',false);
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.review_protocol(p_org uuid,p_enrollment uuid,p_request uuid,p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;completion uc_individual_orders_private.orders;witness jsonb;basis jsonb;proof jsonb;facts jsonb;receipt jsonb;authority jsonb;event_id uuid:=gen_random_uuid();at timestamptz:=clock_timestamp();ctx uuid;h text;dt date;
BEGIN
 IF NOT public.uc_signature_assurance_shape(p_command,ARRAY['schema_version','action','case_id','expected_case_revision','binding','completion_order','protocol_source','protocol_review_id','protocol_review_revision','protocol_number','protocol_date','subject_and_programme_checked','required_practice_checked','attestation_criteria_checked','actual_outcome','grounds'])
  OR NOT public.uc_signature_assurance_uuid(p_command->'case_id')OR NOT uc_individual_orders_private.revision(p_command->'expected_case_revision')
  OR NOT public.uc_signature_assurance_uuid(p_command->'protocol_review_id')OR NOT uc_individual_orders_private.revision(p_command->'protocol_review_revision',true)
  OR NOT public.uc_signature_assurance_text(p_command->'protocol_number',120)OR NOT public.uc_copy_registry_date(p_command->'protocol_date')OR NOT public.uc_signature_assurance_text(p_command->'grounds',2000)
  OR p_command->'subject_and_programme_checked'IS DISTINCT FROM'true'::jsonb OR p_command->'required_practice_checked'IS DISTINCT FROM'true'::jsonb OR p_command->'attestation_criteria_checked'IS DISTINCT FROM'true'::jsonb OR p_command->>'actual_outcome'IS DISTINCT FROM'passed'
 THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
 c:=uc_individual_issuance_private.case_row((p_command->>'case_id')::uuid,a,'admission_write');
 IF c.organization_id<>p_org OR c.enrollment_id<>p_enrollment OR c.responsible_id IS DISTINCT FROM a THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
 IF p_command->'binding'IS DISTINCT FROM uc_individual_issuance_private.admission_binding(p_org,p_enrollment,true)THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 SELECT*INTO completion FROM uc_individual_orders_private.orders WHERE organization_id=p_org AND enrollment_id=p_enrollment AND order_kind='completion'AND registry IS NOT NULL FOR SHARE NOWAIT;
 witness:=uc_individual_issuance_private.order_witness(completion,true);
 IF witness IS DISTINCT FROM p_command->'completion_order'OR completion.subject_user_id<>c.user_id OR completion.course_id<>c.course_id OR completion.decision->'decision'->'final_protocol_source'IS DISTINCT FROM p_command->'protocol_source'
  OR completion.facts->'programme'IS DISTINCT FROM c.program_ref OR completion.decision->>'kind'IS DISTINCT FROM'complete'OR completion.decision->'decision'->>'actual_outcome'IS DISTINCT FROM'passed'
 THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 SELECT x INTO basis FROM jsonb_array_elements(completion.source_witness->'basis')x WHERE x->>'role'='final_protocol'AND x->'source'=p_command->'protocol_source'AND x->'review_id'=p_command->'protocol_review_id'AND x->'review_revision'=p_command->'protocol_review_revision';
 IF basis IS NULL THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 proof:=uc_individual_orders_private.reviewed_source(p_org,p_command->'protocol_source',(p_command->>'protocol_review_id')::uuid,(p_command->>'protocol_review_revision')::bigint,'final_protocol');
 IF proof->'review_sha256'IS DISTINCT FROM basis->'review_sha256'THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 dt:=(p_command->>'protocol_date')::date;
 IF dt>CURRENT_DATE OR dt<(completion.facts->'dates'->>'training_start_date')::date OR completion.facts->'dates'->'training_end_date'='null'::jsonb OR dt>(completion.facts->'dates'->>'training_end_date')::date
  OR dt>(completion.facts->'dates'->>'document_date')::date THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
 PERFORM public.uc_admission_lock(a,p_org,c.user_id,NULL,p_enrollment,c.responsible_id);SELECT*INTO c FROM public.uc_admission_cases WHERE id=c.id FOR UPDATE;
 IF c.revision<>(p_command->>'expected_case_revision')::bigint THEN PERFORM uc_individual_issuance_private.fail('REVISION_CONFLICT');END IF;
 IF c.revision>=9007199254740991 THEN PERFORM uc_individual_issuance_private.fail('LIMIT_EXCEEDED');END IF;
 ctx:=public.uc_admission_context(c.id,a,'mutation');UPDATE public.uc_admission_cases SET revision=revision+1,updated_at=at WHERE id=c.id RETURNING*INTO c;
 facts:=jsonb_build_object('id',event_id,'case_revision',c.revision,'actor_user_id',a,'recorded_at',public.uc_signature_assurance_utc(at),'completion_order_id',completion.id,'completion_decision_event_id',completion.decision->'event_id',
  'protocol_source',p_command->'protocol_source','protocol_review_id',p_command->'protocol_review_id','protocol_review_revision',p_command->'protocol_review_revision','protocol_number',p_command->'protocol_number','protocol_date',p_command->'protocol_date',
  'subject_and_programme_checked',true,'required_practice_checked',true,'attestation_criteria_checked',true,'actual_outcome','passed','grounds',p_command->'grounds');
 facts:=facts||jsonb_build_object('review_sha256',public.uc_program_hash(facts));authority:=public.uc_admission_authority(c.id,a);h:=public.uc_program_hash(p_command);
 INSERT INTO public.uc_admission_case_events(id,case_id,organization_id,user_id,case_revision,kind,actor_id,authority_hash,authority_snapshot,payload,recorded_at)
 VALUES(event_id,c.id,p_org,c.user_id,c.revision,'review_protocol_facts',a,public.uc_program_hash(authority),authority,facts,at);
 receipt:=jsonb_build_object('schema_version',1,'request_id',p_request,'case_id',c.id,'revision',c.revision,'event_id',event_id,'kind','review_protocol_facts','payload_digest',h);
 INSERT INTO public.uc_admission_case_requests(actor_id,request_id,case_id,organization_id,user_id,kind,payload_digest,receipt)VALUES(a,p_request,c.id,p_org,c.user_id,'review_protocol_facts',h,receipt);
 DELETE FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=ctx AND kind='_context';
 RETURN jsonb_build_object('receipt',receipt,'state',uc_individual_issuance_private.case_state(c.id,a),'protocol_review',facts,'replayed',false);
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.context_matches(p_context uuid,p_org uuid,p_enrollment uuid,p_user uuid,p_course uuid)RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM uc_individual_issuance_private.contexts t
 JOIN public.uc_education_issuance_contexts c ON c.id=t.context_id
 JOIN uc_individual_issuance_private.items typed ON typed.item_id=t.item_id
 JOIN public.uc_education_issuance_preparation_items i ON i.id=typed.item_id AND i.preparation_id=typed.preparation_id
 JOIN public.uc_education_issuance_preparations p ON p.id=i.preparation_id
 WHERE t.context_id=p_context AND t.transaction_id=txid_current()AND t.backend_pid=pg_backend_pid()AND t.actor_id=auth.uid()
 AND c.transaction_id=t.transaction_id AND c.backend_pid=t.backend_pid AND c.actor_id=t.actor_id AND c.mode='original'AND c.group_id IS NULL
 AND t.organization_id=p_org AND t.enrollment_id=p_enrollment AND t.user_id=p_user AND t.course_id=p_course
 AND c.organization_id=t.organization_id AND c.enrollment_id=t.enrollment_id AND c.user_id=t.user_id AND c.course_id=t.course_id
 AND i.organization_id=t.organization_id AND i.enrollment_id=t.enrollment_id AND i.user_id=t.user_id AND i.course_id=t.course_id AND i.group_id IS NULL
 AND p.organization_id=t.organization_id AND p.actor_id=t.actor_id AND p.kind='original'AND NOT p.redacted AND NOT i.redacted AND i.final_record_id IS NULL
 AND t.source_sha256=typed.source_sha256 AND typed.eligibility_ref=i.eligibility_ref AND t.source_sha256=i.eligibility_ref->>'source_hash'
 AND c.proof=i.eligibility_ref AND c.source_snapshot=i.source_snapshot AND c.official_identity=i.official_identity||i.number_plan||jsonb_build_object('document_type',i.frdo_facts->'document_type','original_document_data',NULL))
$fn$;

CREATE FUNCTION uc_individual_issuance_private.record_context(p_row public.education_document_records)RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT c.id FROM public.uc_education_issuance_contexts c WHERE p_row.group_id IS NULL AND uc_individual_issuance_private.context_matches(c.id,p_row.organization_id,p_row.enrollment_id,p_row.user_id,p_row.course_id)
$fn$;

CREATE FUNCTION uc_individual_issuance_private.programme_guard(p_row public.education_document_records)RETURNS public.education_document_records
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context uuid;i public.uc_education_issuance_preparation_items;facts jsonb;dt text;
BEGIN
 v_context:=uc_individual_issuance_private.record_context(p_row);
 SELECT x.*INTO i FROM public.uc_education_issuance_preparation_items x JOIN uc_individual_issuance_private.contexts c ON c.item_id=x.id WHERE c.context_id=v_context;
 IF i.id IS NULL THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
 facts:=i.eligibility_ref->'programme_facts';dt:=CASE facts->>'program_type'WHEN'dpo_upskilling'THEN'certificate'WHEN'dpo_retraining'THEN'diploma'WHEN'professional_training'THEN'qualification'END;
 IF dt IS NULL OR p_row.document_type IS DISTINCT FROM dt THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 p_row.specialty_name:=facts->>'full_title';p_row.qualification_name:=coalesce(facts->>'qualification',facts->>'profession');RETURN p_row;
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.record_source(p_row public.education_document_records)RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context uuid;typed uc_individual_issuance_private.items;i public.uc_education_issuance_preparation_items;artifact jsonb;review jsonb;parts uuid[];
BEGIN
 v_context:=uc_individual_issuance_private.record_context(p_row);
 SELECT t.*INTO typed FROM uc_individual_issuance_private.items t JOIN uc_individual_issuance_private.contexts c ON c.item_id=t.item_id WHERE c.context_id=v_context;
 SELECT*INTO i FROM public.uc_education_issuance_preparation_items WHERE id=typed.item_id;
 review:=public.uc_education_output_approval(i.id);
 artifact:=(i.artifact-'output_review')||jsonb_build_object('preparation_id',i.preparation_id,'item_id',i.id,'input_revision',i.input_revision,'output_review_id',review->'id','output_review_revision',review->'revision');
 IF typed.item_id IS NULL OR i.artifact IS NULL OR review IS NULL THEN PERFORM uc_individual_issuance_private.fail('ARTIFACT_REVIEW_REQUIRED');END IF;
 SELECT coalesce(array_agg(DISTINCT u ORDER BY u),'{}')INTO parts FROM unnest(typed.participant_ids||uc_individual_issuance_private.participants(typed.organization_id,typed.enrollment_id,auth.uid(),NULL,typed.item_id))u;
 PERFORM uc_individual_orders_private.people(parts,true);
 INSERT INTO uc_individual_issuance_private.issued_sources(record_id,item_id,case_id,organization_id,enrollment_id,user_id,course_id,eligibility_ref,source_sha256,artifact,participant_ids,recorded_by)
 VALUES(p_row.id,typed.item_id,typed.case_id,typed.organization_id,typed.enrollment_id,typed.user_id,typed.course_id,typed.eligibility_ref,typed.source_sha256,artifact,parts,auth.uid());
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.issue_one(p_item uuid,p_artifact jsonb,p_reason text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;r public.education_document_records;s public.uc_education_issuance_states;original public.education_document_records;old public.uc_education_issuance_states;official jsonb;item jsonb;source jsonb;context_id uuid:=gen_random_uuid();registry jsonb;context jsonb;data jsonb;event_id uuid:=gen_random_uuid();duplicate_event uuid;before_hash text;after_hash text;mode text;original_data text;BEGIN
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item FOR UPDATE;SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF p.actor_id IS DISTINCT FROM auth.uid()OR p.kind<>'original'OR NOT EXISTS(SELECT 1 FROM uc_individual_issuance_private.items t WHERE t.item_id=i.id AND t.preparation_id=p.id)OR i.final_record_id IS NOT NULL OR i.redacted OR p.redacted THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 mode:=CASE p.kind WHEN'original'THEN'original'ELSE'duplicate'END;
 IF mode='duplicate'THEN SELECT *INTO original FROM public.education_document_records WHERE id=(p.plan->'change'->>'record_id')::uuid;SELECT *INTO old FROM public.uc_education_issuance_states WHERE record_id=original.id;before_hash:=public.uc_education_issue_state_hash(original.id);
 original_data:=jsonb_build_object('record_id',original.id,'document_number',original.document_number,'reg_number',original.reg_number,'issue_date',original.issue_date)::text;END IF;
 official:=i.official_identity||i.number_plan||jsonb_build_object('document_type',i.frdo_facts->'document_type','original_document_data',original_data);
 INSERT INTO uc_individual_issuance_private.contexts(context_id,item_id,transaction_id,backend_pid,actor_id,organization_id,enrollment_id,user_id,course_id,source_sha256)
 VALUES(context_id,i.id,txid_current(),pg_backend_pid(),auth.uid(),i.organization_id,i.enrollment_id,i.user_id,i.course_id,i.eligibility_ref->>'source_hash');
 INSERT INTO public.uc_education_issuance_contexts(id,transaction_id,backend_pid,actor_id,organization_id,mode,enrollment_id,user_id,course_id,group_id,original_record_id,proof,source_snapshot,official_identity)
 VALUES(context_id,txid_current(),pg_backend_pid(),auth.uid(),i.organization_id,mode,i.enrollment_id,i.user_id,i.course_id,i.group_id,original.id,i.eligibility_ref,i.source_snapshot,official)RETURNING id INTO context_id;
 item:=jsonb_build_object('user_id',i.user_id,'enrollment_id',i.enrollment_id,'document_type',i.frdo_facts->'document_type','issue_date',i.number_plan->'issue_date','document_series',i.number_plan->'document_series','full_name',i.official_identity->'full_name','birth_date',i.official_identity->'birth_date','document_status',mode,'original_document_data',original_data,'notes','');
 SELECT *INTO r FROM public.issue_education_document_batch(i.organization_id,i.group_id,i.course_id,jsonb_build_array(item));
 DELETE FROM public.uc_education_issuance_contexts WHERE id=context_id;
 IF r.id IS NULL OR r.document_number IS DISTINCT FROM i.number_plan->>'document_number'OR r.reg_number IS DISTINCT FROM i.number_plan->>'reg_number'OR r.delivery_method IS DISTINCT FROM'not_recorded'OR r.document_status<>mode THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;
 context:=public.uc_document_registry_context(i.organization_id,CASE WHEN p.scope->>'kind'='group'THEN(p.scope->>'group_id')::uuid END,jsonb_build_object('kind','student','user_id',i.user_id),jsonb_build_object('kind','enrollment','enrollment_id',i.enrollment_id,'binding_hash',repeat('0',64)),false)->'context';
 data:=jsonb_build_object('direction','outgoing','document_type',r.document_type,'title',CASE r.document_type WHEN'certificate'THEN'Удостоверение'WHEN'diploma'THEN'Диплом'ELSE'Свидетельство'END||' № '||r.document_number,'document_date',r.issue_date,'declared_document_number',r.document_number,'source',p_artifact->'source','sender',jsonb_build_object('kind','organization','organization_id',i.organization_id),'recipient',jsonb_build_object('kind','student','user_id',i.user_id),'subject',jsonb_build_object('kind','student','user_id',i.user_id),'context',context,'origin',jsonb_build_object('kind','org_document'),'notes','Зарегистрирован проверенный файл выданного документа. Факт передачи фиксируется отдельно.');
 registry:=public.apply_document_registry_action(i.organization_id,p.scope,0,gen_random_uuid(),jsonb_build_object('action','register','data',data,'reason',p_reason));
 IF registry->'record'->>'id'IS NULL THEN PERFORM public.uc_education_issue_error('DEPENDENCY_UNAVAILABLE');END IF;
 INSERT INTO public.uc_education_issuance_states(record_id,organization_id,user_id,course_id,enrollment_id,group_id,revision,original_record_id,registry_record_id,proof,artifact,frdo_facts,notes,recorded_by,updated_by,participant_ids)
 VALUES(r.id,i.organization_id,i.user_id,i.course_id,i.enrollment_id,i.group_id,1,original.id,(registry->'record'->>'id')::uuid,i.eligibility_ref,p_artifact,i.frdo_facts,'',auth.uid(),auth.uid(),ARRAY[i.user_id,auth.uid()]);
 after_hash:=public.uc_education_issue_state_hash(r.id);
 INSERT INTO public.uc_education_issuance_events(id,record_id,organization_id,user_id,revision,kind,actor_id,reason,previous_state_hash,state_hash,payload,participant_ids)
 VALUES(event_id,r.id,i.organization_id,i.user_id,1,'issued',auth.uid(),p_reason,public.uc_program_hash(jsonb_build_object('record_id',r.id,'revision',0)),after_hash,jsonb_build_object('kind','issued','official',to_jsonb(r)-'deleted_by','proof',i.eligibility_ref,'proof_availability','captured','artifact',p_artifact,'frdo_facts',i.frdo_facts),ARRAY[i.user_id,auth.uid()]);
 UPDATE public.uc_education_issuance_preparation_items SET final_record_id=r.id WHERE id=i.id;
 IF mode='duplicate'THEN
 IF old.revision>=9007199254740991 THEN PERFORM public.uc_education_issue_error('LIMIT_EXCEEDED');END IF;duplicate_event:=gen_random_uuid();
 UPDATE public.uc_education_issuance_states SET revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp(),participant_ids=array_append(participant_ids,auth.uid())WHERE record_id=original.id;
 INSERT INTO public.uc_education_issuance_events(id,record_id,organization_id,user_id,revision,kind,actor_id,reason,previous_state_hash,state_hash,payload,participant_ids)
 VALUES(duplicate_event,original.id,i.organization_id,i.user_id,old.revision+1,'duplicate_issued',auth.uid(),p_reason,before_hash,public.uc_education_issue_state_hash(original.id),jsonb_build_object('kind','duplicate_issued','original_record_id',original.id,'duplicate_record_id',r.id,'basis',p.plan->'change'->'basis'),ARRAY[i.user_id,auth.uid()]);
 END IF;
 RETURN jsonb_build_object('record_id',r.id,'original_record_id',original.id,'event_ids',CASE WHEN duplicate_event IS NULL THEN jsonb_build_array(event_id)ELSE jsonb_build_array(event_id,duplicate_event)END,'enrollment_id',i.enrollment_id);END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.prepare_evidence_core(p_case_id uuid,p_expected_revision bigint,p_expected_program_ref jsonb,p_request_id uuid,p_source jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;prior public.uc_admission_case_requests;r public.uc_admission_evidence_reservations;candidate jsonb;digest text;receipt jsonb;BEGIN
 IF auth.role()IS DISTINCT FROM 'authenticated'OR a IS NULL OR p_request_id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 1 AND 9007199254740991 OR NOT uc_individual_issuance_private.programme_ref_valid(p_expected_program_ref)OR NOT public.uc_admission_shape(p_source,CASE p_source->>'kind'WHEN 'upload'THEN ARRAY['kind','requirement_id','supersedes_id','declared_size','declared_mime','declared_sha256']WHEN 'existing'THEN ARRAY['kind','requirement_id','supersedes_id','candidate']ELSE ARRAY[]::text[]END)OR NOT public.uc_admission_uuid(p_source->'requirement_id')OR(p_source->'supersedes_id'<>'null'::jsonb AND NOT public.uc_admission_uuid(p_source->'supersedes_id'))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 IF p_source->>'kind'='upload'THEN
  IF jsonb_typeof(p_source->'declared_size')IS DISTINCT FROM 'number'OR p_source->>'declared_size'!~'^[1-9][0-9]{0,7}$'OR(p_source->>'declared_size')::bigint>20971520 OR coalesce(p_source->>'declared_mime'IN('application/pdf','image/jpeg','image/png'),false)=false OR coalesce(jsonb_typeof(p_source->'declared_sha256')='string'AND p_source->>'declared_sha256'~'^[a-f0-9]{64}$',false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 ELSE
  candidate:=p_source->'candidate';IF NOT public.uc_admission_shape(candidate,ARRAY['kind','id','version_id','fingerprint'])OR NOT public.uc_admission_uuid(candidate->'id')OR(candidate->'version_id'<>'null'::jsonb AND NOT public.uc_admission_uuid(candidate->'version_id'))OR coalesce(candidate->>'kind'IN('identity_document','enrollment_document','contract_artifact','organization_document_version'),false)=false OR coalesce(candidate->>'fingerprint'~'^[a-f0-9]{64}$',false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;IF c.id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_admission_lock(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,c.responsible_id);PERFORM pg_advisory_xact_lock(hashtextextended('uc_admission_request:'||a::text||':'||p_request_id::text,0));
 digest:=public.uc_program_hash(jsonb_build_object('case_id',p_case_id,'expected_revision',p_expected_revision,'expected_program_ref',p_expected_program_ref,'source',p_source));
 SELECT * INTO prior FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id;
 IF prior.actor_id IS NOT NULL THEN IF prior.case_id<>c.id OR prior.kind<>'prepare_evidence'OR prior.payload_digest<>digest THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;RETURN prior.receipt;END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id FOR UPDATE;
 IF c.revision<>p_expected_revision THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;IF c.revision>=9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
 IF c.program_ref IS DISTINCT FROM p_expected_program_ref OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.requirements)x WHERE x->>'id'=p_source->>'requirement_id')THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
 IF p_source->'supersedes_id'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=(p_source->>'supersedes_id')::uuid AND e.case_id=c.id AND e.requirement_id=(p_source->>'requirement_id')::uuid AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF(SELECT count(*)FROM public.uc_admission_evidence_reservations WHERE case_id=c.id AND state IN('prepared','sealed')AND expires_at>clock_timestamp())>=100 OR(jsonb_array_length(public.uc_admission_current_evidence(c.id,a))>=100 AND p_source->'supersedes_id'='null'::jsonb)THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
 IF p_source->>'kind'='existing'THEN candidate:=public.uc_admission_candidate(c.id,candidate->>'kind',(candidate->>'id')::uuid,(candidate->>'version_id')::uuid,a);
 IF candidate IS NULL OR candidate->'candidate'->>'fingerprint'IS DISTINCT FROM p_source->'candidate'->>'fingerprint'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF candidate->'candidate'->>'availability'<>'capturable'THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;END IF;
 INSERT INTO public.uc_admission_evidence_reservations(case_id,organization_id,user_id,actor_id,prepare_request_id,evidence_version_id,requirement_id,supersedes_id,expected_revision,program_ref,source)VALUES(c.id,c.organization_id,c.user_id,a,p_request_id,gen_random_uuid(),(p_source->>'requirement_id')::uuid,(p_source->>'supersedes_id')::uuid,p_expected_revision,c.program_ref,p_source)RETURNING * INTO r;
 receipt:=jsonb_build_object('schema_version',1,'case_id',c.id,'case_revision',c.revision,'reservation_id',r.id,'evidence_version_id',r.evidence_version_id,'expires_at',r.expires_at,'source_kind',p_source->>'kind','upload_slot',CASE WHEN p_source->>'kind'='upload'THEN jsonb_build_object('bucket','admission-case-evidence','path',c.user_id::text||'/'||c.organization_id::text||'/'||c.id::text||'/staging/'||a::text||'/'||r.id::text,'upsert',false,'max_bytes',20971520)END);
 INSERT INTO public.uc_admission_case_requests(actor_id,request_id,case_id,organization_id,user_id,kind,payload_digest,receipt)VALUES(a,p_request_id,c.id,c.organization_id,c.user_id,'prepare_evidence',digest,receipt);RETURN receipt;END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.read_admission_core(p_organization_id uuid,p_student_user_id uuid,p_query jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();mode text:=p_query->>'mode';c public.uc_admission_cases;scope jsonb;pr jsonb;pre jsonb;items jsonb:='[]';row record;candidate jsonb;has_more boolean:=false;next_id uuid;lim integer;after_id uuid;kind text;ceiling bigint;before_rev bigint;counted integer:=0;staff boolean;BEGIN
 IF auth.role()IS DISTINCT FROM 'authenticated'OR NOT public.uc_admission_actor_allowed(a,false)OR NOT public.uc_identification_target_allowed(p_organization_id,p_student_user_id,true)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF mode='case'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['mode','group_id','enrollment_id'])OR NOT public.uc_admission_uuid(p_query->'group_id')OR NOT public.uc_admission_uuid(p_query->'enrollment_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  scope:=public.uc_admission_association(p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid);
  IF scope IS NULL OR NOT public.uc_admission_can_read(a,p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  SELECT * INTO c FROM public.uc_admission_cases WHERE organization_id=p_organization_id AND user_id=p_student_user_id AND group_id=(p_query->>'group_id')::uuid AND enrollment_id=(p_query->>'enrollment_id')::uuid;
  pr:=public.uc_admission_program(p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid);pre:=public.uc_admission_prerequisites(p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid,c.id IS NOT NULL AND c.rule_set_id IS NULL);
  IF a=p_student_user_id THEN RETURN jsonb_build_object('schema_version',1,'mode','case','projection','learner','scope',scope,'state',CASE WHEN c.id IS NOT NULL THEN public.uc_admission_state(c.id,a,true)END,'prerequisites',pre);END IF;
  RETURN jsonb_build_object('schema_version',1,'mode','case','projection','staff','scope',scope,'program_ref',pr,'program_title',(SELECT public.uc_admission_trim(facts->>'full_title')FROM public.program_fact_versions WHERE id=(pr->>'version_id')::uuid),'state',CASE WHEN c.id IS NOT NULL THEN public.uc_admission_state(c.id,a,false)END,'prerequisites',pre,'capabilities',public.uc_admission_capabilities(a,p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid,c.id));
 END IF;
 IF mode='history'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['mode','case_id','ceiling_revision','before_revision','limit'])THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 ELSE
  IF NOT public.uc_admission_shape(p_query,CASE mode WHEN 'associations'THEN ARRAY['mode','after_id','limit']WHEN 'candidates'THEN ARRAY['mode','case_id','kind','after_id','limit']WHEN 'options'THEN ARRAY['mode','case_id','kind','after_id','limit']ELSE ARRAY[]::text[]END)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 END IF;
 IF jsonb_typeof(p_query->'limit')IS DISTINCT FROM 'number'OR p_query->>'limit'!~'^[0-9]{1,2}$'OR(p_query->>'limit')::integer NOT BETWEEN 1 AND 50 THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;lim:=(p_query->>'limit')::integer;
 IF mode<>'history'THEN IF p_query->'after_id'<>'null'::jsonb AND NOT public.uc_admission_uuid(p_query->'after_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;after_id:=(p_query->>'after_id')::uuid;END IF;
 IF mode='associations'THEN
  staff:=public.has_role(a,'admin'::public.app_role)OR public.is_org_owner(a,p_organization_id)OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=a AND s.organization_id=p_organization_id AND s.role<>'teacher'AND(s.expires_at IS NULL OR s.expires_at>now())AND public.has_org_staff_permission(a,p_organization_id,'students.read')AND public.has_org_staff_permission(a,p_organization_id,'documents.read'));
  IF a<>p_student_user_id AND NOT staff AND NOT EXISTS(SELECT 1 FROM public.student_groups g JOIN public.enrollments e ON e.course_id=g.course_id AND e.user_id=p_student_user_id WHERE g.organization_id=p_organization_id AND public.uc_admission_staff_allowed(a,p_organization_id,p_student_user_id,g.id,e.id,false))THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  FOR row IN SELECT g.id group_id,e.id enrollment_id,coalesce(nullif(public.uc_admission_trim(left(g.name,160)),''),'Группа без названия')group_label FROM public.student_groups g JOIN public.enrollments e ON e.course_id=g.course_id AND e.user_id=p_student_user_id WHERE g.organization_id=p_organization_id AND(after_id IS NULL OR g.id>after_id)AND public.uc_admission_can_read(a,p_organization_id,p_student_user_id,g.id,e.id)ORDER BY g.id LIMIT lim+1 LOOP
   counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;
   scope:=public.uc_admission_association(p_organization_id,p_student_user_id,row.group_id,row.enrollment_id);
   items:=items||jsonb_build_array(jsonb_build_object('scope',scope,'group_label',row.group_label,'case_id',(SELECT id FROM public.uc_admission_cases WHERE organization_id=p_organization_id AND group_id=row.group_id AND enrollment_id=row.enrollment_id),'prerequisites',public.uc_admission_prerequisites(p_organization_id,p_student_user_id,row.group_id,row.enrollment_id,false)));next_id:=row.group_id;END LOOP;
  pre:='[]';IF counted=0 AND after_id IS NULL THEN pre:=jsonb_build_array(jsonb_build_object('code',CASE WHEN EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses co ON co.id=e.course_id WHERE e.user_id=p_student_user_id AND co.organization_id=p_organization_id)THEN 'missing_group'ELSE 'missing_enrollment'END,'public_label','Выберите подтверждённую учебную связь','next_action','select_exact_association','persisted',false));END IF;
  RETURN jsonb_build_object('schema_version',1,'mode',mode,'organization_id',p_organization_id,'user_id',p_student_user_id,'items',items,'prerequisites',pre,'has_more',has_more,'next_after_id',CASE WHEN has_more THEN next_id END);
 END IF;
 IF NOT public.uc_admission_uuid(p_query->'case_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_query->>'case_id')::uuid AND organization_id=p_organization_id AND user_id=p_student_user_id;
 IF c.id IS NULL OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF mode='history'THEN
  IF(p_query->'ceiling_revision'<>'null'::jsonb AND(p_query->>'ceiling_revision'!~'^[1-9][0-9]{0,15}$'OR(p_query->>'ceiling_revision')::numeric>9007199254740991))OR(p_query->'before_revision'<>'null'::jsonb AND(p_query->>'before_revision'!~'^[1-9][0-9]{0,15}$'OR(p_query->>'before_revision')::numeric>9007199254740991))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  ceiling:=coalesce((p_query->>'ceiling_revision')::bigint,c.revision);before_rev:=(p_query->>'before_revision')::bigint;IF ceiling>c.revision OR(before_rev IS NOT NULL AND before_rev>ceiling+1)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  FOR row IN SELECT * FROM public.uc_admission_case_events WHERE case_id=c.id AND case_revision<=ceiling AND(before_rev IS NULL OR case_revision<before_rev)ORDER BY case_revision DESC LIMIT lim+1 LOOP counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;items:=items||jsonb_build_array(jsonb_build_object('id',row.id,'case_id',row.case_id,'case_revision',row.case_revision,'kind',row.kind,'recorded_at',CASE WHEN row.kind='review_protocol_facts'THEN to_jsonb(public.uc_signature_assurance_utc(row.recorded_at))ELSE to_jsonb(row.recorded_at)END,'actor_id',CASE WHEN row.kind='review_protocol_facts'AND(row.authority_redacted OR row.actor_id IS NULL OR public.uc_custom_journal_person(row.actor_id)IS NOT TRUE)THEN NULL ELSE row.actor_id END,'payload',CASE WHEN row.kind='review_protocol_facts'THEN CASE WHEN row.authority_redacted OR row.actor_id IS NULL OR public.uc_custom_journal_person(row.actor_id)IS NOT TRUE THEN NULL ELSE row.payload END ELSE public.uc_admission_history_payload(row.payload,a)END));before_rev:=row.case_revision;END LOOP;
  RETURN jsonb_build_object('schema_version',1,'mode',mode,'case_id',c.id,'ceiling_revision',ceiling,'items',items,'has_more',has_more,'next_before_revision',CASE WHEN has_more THEN before_rev END);
 ELSIF mode='candidates'THEN
  kind:=p_query->>'kind';IF kind NOT IN('identity_document','enrollment_document','organization_document_version','contract_artifact')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  IF kind='organization_document_version'AND NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  FOR row IN SELECT * FROM(
   SELECT d.id,NULL::uuid version_id FROM public.student_identity_documents d WHERE kind='identity_document'AND d.user_id=c.user_id AND d.organization_id=c.organization_id
   UNION ALL SELECT d.id,NULL::uuid FROM public.student_documents d WHERE kind='enrollment_document'AND d.enrollment_id=c.enrollment_id
   UNION ALL SELECT d.id,d.current_version_id FROM public.org_documents d WHERE kind='organization_document_version'AND d.organization_id=c.organization_id AND public.uc_program_file_proof(c.organization_id,d.current_version_id)
   UNION ALL SELECT d.id,NULL::uuid FROM public.org_contracts d WHERE kind='contract_artifact'AND d.organization_id=c.organization_id AND d.student_user_id=c.user_id
  )q WHERE after_id IS NULL OR id>after_id ORDER BY id LIMIT lim+1 LOOP counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;candidate:=public.uc_admission_candidate(c.id,kind,row.id,row.version_id);IF candidate IS NULL THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;items:=items||jsonb_build_array(candidate->'candidate');next_id:=row.id;END LOOP;
  RETURN jsonb_build_object('schema_version',1,'mode',mode,'case_id',c.id,'case_revision',c.revision,'items',items,'has_more',has_more,'next_after_id',CASE WHEN has_more THEN next_id END);
 ELSIF mode='options'THEN
  kind:=p_query->>'kind';IF kind NOT IN('responsibles','local_acts')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  IF kind='responsibles'THEN
   FOR row IN SELECT q.user_id,coalesce(nullif(public.uc_admission_trim(left(s.display_name,160)),''),nullif(public.uc_admission_trim(left(p.full_name,160)),''),'Сотрудник')display_name FROM(SELECT user_id FROM public.org_staff WHERE organization_id=c.organization_id UNION SELECT user_id FROM public.profiles WHERE organization_id=c.organization_id UNION SELECT a)q LEFT JOIN public.org_staff s ON s.user_id=q.user_id AND s.organization_id=c.organization_id LEFT JOIN public.profiles p ON p.user_id=q.user_id WHERE(after_id IS NULL OR q.user_id>after_id)AND public.uc_admission_staff_allowed(q.user_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,true)AND public.uc_admission_staff_allowed(q.user_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)ORDER BY q.user_id LIMIT lim+1 LOOP counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;items:=items||jsonb_build_array(jsonb_build_object('user_id',row.user_id,'display_name',row.display_name));next_id:=row.user_id;END LOOP;
  ELSE
   IF NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
   FOR row IN SELECT d.id,d.current_version_id,r.id review_id FROM public.org_documents d JOIN public.org_document_reviews r ON r.document_id=d.id AND r.version_id=d.current_version_id AND r.organization_id=d.organization_id WHERE d.organization_id=c.organization_id AND d.type IN('admission_rules','edu_relations','paid_services')AND(after_id IS NULL OR d.id>after_id)AND public.uc_admission_local_source(c.organization_id,jsonb_build_object('document_id',d.id,'version_id',d.current_version_id,'review_id',r.id))IS NOT NULL ORDER BY d.id LIMIT lim+1 LOOP counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;candidate:=public.uc_admission_local_source(c.organization_id,jsonb_build_object('document_id',row.id,'version_id',row.current_version_id,'review_id',row.review_id));items:=items||jsonb_build_array(candidate-'version_metadata');next_id:=row.id;END LOOP;
  END IF;
  RETURN jsonb_build_object('schema_version',1,'mode',mode,'case_id',c.id,'case_revision',c.revision,'kind',kind,'items',items,'has_more',has_more,'next_after_id',CASE WHEN has_more THEN next_id END);
 END IF;PERFORM public.uc_admission_error('INVALID_INPUT');RETURN NULL;END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.can_mode(p_actor uuid,p_org uuid,p_enrollment uuid,p_mode text)RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM uc_individual_issuance_private.actor_context(p_actor,p_org,p_enrollment,p_mode);RETURN true;
 EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.record_value(p_org uuid,p_enrollment uuid,p_record uuid,p_actor uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE typed uc_individual_issuance_private.issued_sources;s public.uc_education_issuance_states;r public.education_document_records;value jsonb;ctx jsonb;
BEGIN
 ctx:=uc_individual_issuance_private.actor_context(p_actor,p_org,p_enrollment,'read');
 SELECT*INTO typed FROM uc_individual_issuance_private.issued_sources WHERE record_id=p_record AND organization_id=p_org AND enrollment_id=p_enrollment;
 SELECT*INTO r FROM public.education_document_records WHERE id=typed.record_id AND organization_id=typed.organization_id AND enrollment_id=typed.enrollment_id AND user_id=typed.user_id AND course_id=typed.course_id AND group_id IS NULL AND deleted_at IS NULL;
 SELECT*INTO s FROM public.uc_education_issuance_states WHERE record_id=r.id AND NOT redacted;
 IF typed.record_id IS NULL OR r.id IS NULL OR s.record_id IS NULL OR s.proof IS DISTINCT FROM typed.eligibility_ref OR s.artifact IS DISTINCT FROM typed.artifact THEN PERFORM uc_individual_issuance_private.fail('SOURCE_UNAVAILABLE');END IF;
 PERFORM public.uc_education_issue_fence(p_org,NULL,typed.participant_ids);
 value:=public.uc_education_issue_record(p_org,NULL,p_record);
 IF value IS NULL THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
 -- Stored captured provenance is historical evidence, not a fresh evaluation.
 RETURN value||jsonb_build_object('proof',typed.eligibility_ref,'proof_availability','captured','capabilities',(value->'capabilities')||jsonb_build_object('can_issue_duplicate',false));
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.context_value(p_org uuid,p_enrollment uuid,p_actor uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx jsonb;b jsonb;c uc_individual_issuance_private.cases;state jsonb;o uc_individual_orders_private.orders;witness jsonb;protocol jsonb;candidate jsonb;blockers jsonb:='[]';can_write boolean;can_issue boolean;
BEGIN
 ctx:=uc_individual_issuance_private.actor_context(p_actor,p_org,p_enrollment,'read');can_write:=uc_individual_issuance_private.can_mode(p_actor,p_org,p_enrollment,'admission_write');can_issue:=uc_individual_issuance_private.can_mode(p_actor,p_org,p_enrollment,'issue');
 BEGIN b:=uc_individual_issuance_private.admission_binding(p_org,p_enrollment,true);
 EXCEPTION WHEN SQLSTATE'PT409'THEN
  IF SQLERRM IN('EDUCATION_ISSUANCE_ADMISSION_UNAVAILABLE','EDUCATION_ISSUANCE_SOURCE_UNAVAILABLE','EDUCATION_ISSUANCE_SOURCE_CHANGED')THEN
   RETURN jsonb_build_object('w1_binding',NULL,'admission_case',NULL,'completion_order',NULL,'protocol_review',NULL,'eligibility_ref',NULL,'existing_original_record_id',NULL,
    'blockers',jsonb_build_array(public.uc_education_issue_block('ADMISSION_UNAVAILABLE')),'capabilities',jsonb_build_object('can_read',true,'can_review_admission',can_write,'can_prepare_evidence',false,'can_prepare_artifact',false,'can_issue',can_issue,'can_open_evidence',false));
  END IF;RAISE;
 END;
 SELECT*INTO c FROM uc_individual_issuance_private.cases WHERE organization_id=p_org AND enrollment_id=p_enrollment;
 IF c.case_id IS NOT NULL THEN state:=uc_individual_issuance_private.case_state(c.case_id,p_actor);END IF;
 SELECT*INTO o FROM uc_individual_orders_private.orders WHERE organization_id=p_org AND enrollment_id=p_enrollment AND order_kind='completion'AND registry IS NOT NULL;
 IF o.id IS NOT NULL THEN witness:=uc_individual_issuance_private.order_witness(o,true);IF c.case_id IS NOT NULL THEN protocol:=uc_individual_issuance_private.protocol_current(c.case_id,p_actor,o);END IF;END IF;
 IF can_issue THEN candidate:=uc_individual_issuance_private.candidate(p_org,p_enrollment,p_actor,false);blockers:=candidate->'blockers';
 ELSE blockers:=jsonb_build_array(public.uc_education_issue_block('ISSUANCE_AUTHORITY_REQUIRED'));END IF;
 RETURN jsonb_build_object('w1_binding',b,'admission_case',state,'completion_order',witness,'protocol_review',protocol->'facts_review','eligibility_ref',candidate->'eligibility_ref','existing_original_record_id',candidate->'existing_original_record_id','blockers',blockers,
  'capabilities',jsonb_build_object('can_read',true,'can_review_admission',can_write,'can_prepare_evidence',can_write AND c.case_id IS NOT NULL,'can_prepare_artifact',can_issue AND candidate->'eligibility_ref'<>'null'::jsonb,'can_issue',can_issue,'can_open_evidence',c.case_id IS NOT NULL));
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.issue(p_org uuid,p_enrollment uuid,p_request uuid,p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();ctx jsonb;preview jsonb;i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;prior public.uc_education_issuance_requests;h text;result jsonb;receipt jsonb;parts uuid[];
BEGIN
 ctx:=uc_individual_issuance_private.actor_context(a,p_org,p_enrollment,'issue');
 IF NOT public.uc_signature_assurance_shape(p_command,ARRAY['schema_version','action','intent','preview_hash','preparation_id','item_id','expected_eligibility_ref','artifact','reason'])OR NOT public.uc_signature_assurance_uuid(p_command->'preparation_id')OR NOT public.uc_signature_assurance_uuid(p_command->'item_id')
  OR NOT public.uc_signature_assurance_sha(p_command->'preview_hash')OR NOT public.uc_signature_assurance_text(p_command->'reason',2000)THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
 h:=public.uc_program_hash(jsonb_build_object('organization_id',p_org,'enrollment_id',p_enrollment,'command',p_command));parts:=uc_individual_issuance_private.participants(p_org,p_enrollment,a,NULL,(p_command->>'item_id')::uuid);
 PERFORM uc_individual_orders_private.people(parts,true);PERFORM public.uc_education_issue_fence(p_org,NULL,parts,'request:'||a::text||':'||p_request::text);
 SELECT*INTO prior FROM public.uc_education_issuance_requests WHERE actor_id=a AND request_id=p_request;
 IF prior.request_id IS NOT NULL THEN
  IF prior.organization_id<>p_org OR prior.scope IS DISTINCT FROM jsonb_build_object('kind','organization')OR prior.action<>'issue_batch'OR prior.payload_hash<>h OR prior.receipt->'enrollment_ids'IS DISTINCT FROM jsonb_build_array(p_enrollment)THEN PERFORM uc_individual_issuance_private.fail('REQUEST_CONFLICT');END IF;
  RETURN jsonb_build_object('receipt',prior.receipt,'record',uc_individual_issuance_private.record_value(p_org,p_enrollment,(prior.receipt->'record_ids'->>0)::uuid,a),'replayed',true);
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_org::text,0))THEN PERFORM uc_individual_issuance_private.fail('REVISION_CONFLICT');END IF;
 preview:=uc_individual_issuance_private.preview(p_org,p_enrollment,a,p_command->'intent',true);
 IF preview->'ready'IS DISTINCT FROM'true'::jsonb OR preview->'preview_hash'IS DISTINCT FROM p_command->'preview_hash'OR preview->'candidate'->'eligibility_ref'IS DISTINCT FROM p_command->'expected_eligibility_ref'THEN PERFORM uc_individual_issuance_private.fail('REVISION_CONFLICT');END IF;
 i:=public.uc_education_artifact_final(p_org,NULL,p_command->'artifact');SELECT*INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF i.id::text IS DISTINCT FROM p_command->>'item_id'OR p.id::text IS DISTINCT FROM p_command->>'preparation_id'OR i.enrollment_id<>p_enrollment
  OR i.eligibility_ref IS DISTINCT FROM p_command->'expected_eligibility_ref'OR p.plan->'intent'IS DISTINCT FROM p_command->'intent'OR p.plan->'preview_hash'IS DISTINCT FROM p_command->'preview_hash'
  OR p.plan->'reason'IS DISTINCT FROM p_command->'reason'OR NOT EXISTS(SELECT 1 FROM uc_individual_issuance_private.items x WHERE x.item_id=i.id AND x.preparation_id=p.id)
 THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 result:=public.uc_education_issue_one(i.id,p_command->'artifact',p_command->>'reason');
 receipt:=jsonb_build_object('request_id',p_request,'action','issue_batch','scope_hash',public.uc_program_hash(jsonb_build_object('organization_id',p_org,'scope',jsonb_build_object('kind','organization'))),'payload_hash',h,
  'record_ids',jsonb_build_array(result->'record_id'),'enrollment_ids',jsonb_build_array(p_enrollment),'event_ids',result->'event_ids','applied_at',clock_timestamp(),'replayed',false);
 INSERT INTO public.uc_education_issuance_requests(actor_id,request_id,organization_id,scope,action,payload_hash,receipt,participant_ids)VALUES(a,p_request,p_org,jsonb_build_object('kind','organization'),'issue_batch',h,receipt,parts);
 RETURN jsonb_build_object('receipt',receipt,'record',uc_individual_issuance_private.record_value(p_org,p_enrollment,(result->>'record_id')::uuid,a),'replayed',false);
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.envelope(p_org uuid,p_enrollment uuid,p_actor uuid,p_kind text)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx jsonb;BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS DISTINCT FROM p_actor THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
 ctx:=uc_individual_issuance_private.actor_context(p_actor,p_org,p_enrollment,'read');
 RETURN jsonb_build_object('schema_version',2,'ok',true,'organization_id',p_org,'enrollment_id',p_enrollment,'user_id',ctx->'subject_user_id','course_id',ctx->'course_id','actor_user_id',p_actor,'kind',p_kind);
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.failure(p_message text,p_state text)RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE code text;
BEGIN
 code:=CASE WHEN p_state='42501'THEN'ACCESS_DENIED'WHEN p_state IN('40001','40P01','55P03')THEN'REVISION_CONFLICT'
  WHEN p_state IN('22P02','22003','22007','22008','22023')THEN'INVALID_INPUT'
  WHEN p_message~'^(EDUCATION_ISSUANCE_|ADMISSION_|UC_ADMISSION_|UC_INDIVIDUAL_ORDER_)(INVALID_INPUT|ACCESS_DENIED|REVISION_CONFLICT|REQUEST_CONFLICT|SOURCE_CHANGED|SOURCE_UNAVAILABLE|PREREQUISITE_MISSING|REVIEW_REQUIRED|LIMIT_EXCEEDED|DEPENDENCY_UNAVAILABLE|NUMBER_PLAN_STALE|ARTIFACT_UNAVAILABLE|ARTIFACT_REVIEW_REQUIRED|ARTIFACT_RENDER_FAILED)$'
   THEN regexp_replace(p_message,'^(EDUCATION_ISSUANCE_|ADMISSION_|UC_ADMISSION_|UC_INDIVIDUAL_ORDER_)','')
  WHEN p_message IN('ADMISSION_LIMIT_REACHED','UC_ADMISSION_LIMIT_REACHED')THEN'LIMIT_EXCEEDED'
  WHEN p_message IN('EDUCATION_ISSUANCE_NOT_FOUND','UC_INDIVIDUAL_ORDER_NOT_FOUND')THEN'SOURCE_UNAVAILABLE'ELSE'DEPENDENCY_UNAVAILABLE'END;
 RETURN jsonb_build_object('schema_version',2,'ok',false,'code',code,'retryable',code IN('REVISION_CONFLICT','DEPENDENCY_UNAVAILABLE'),
  'message',CASE code WHEN'ACCESS_DENIED'THEN'Недостаточно действующих прав для этой операции.'WHEN'INVALID_INPUT'THEN'Проверьте переданные данные.'WHEN'REQUEST_CONFLICT'THEN'Этот запрос уже использован для другой операции.'WHEN'REVISION_CONFLICT'THEN'Данные изменились. Обновите состояние.'WHEN'SOURCE_CHANGED'THEN'Исходные документы изменились. Требуется повторная проверка.'WHEN'SOURCE_UNAVAILABLE'THEN'Подтверждённый источник сейчас недоступен.'WHEN'NUMBER_PLAN_STALE'THEN'Обновите план номеров перед выдачей.'ELSE'Операция не завершена. Обновите состояние или проверьте необходимые документы.'END,'blockers','[]'::jsonb);
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.mutation_receipt(p_request uuid,p_operation text,p_payload text,p_result jsonb)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r jsonb:=p_result->'receipt';v_case_id uuid;v_case_revision bigint;event_ids jsonb:='[]';preparation_id uuid;item_id uuid;record_id uuid;at timestamptz;reservation public.uc_admission_evidence_reservations;
BEGIN
 v_case_id:=(r->>'case_id')::uuid;v_case_revision:=coalesce((r->>'revision')::bigint,(r->>'case_revision')::bigint);
 IF r->>'event_id'IS NOT NULL THEN event_ids:=jsonb_build_array(r->'event_id');SELECT ev.recorded_at INTO at FROM public.uc_admission_case_events ev WHERE ev.id=(r->>'event_id')::uuid AND ev.case_id=v_case_id AND ev.case_revision=v_case_revision;
 ELSIF p_operation='prepare_evidence'THEN SELECT*INTO reservation FROM public.uc_admission_evidence_reservations WHERE id=(p_result->'preparation'->>'reservation_id')::uuid;at:=reservation.created_at;
 ELSIF p_operation='prepare_artifact'THEN preparation_id:=(r->>'preparation_id')::uuid;SELECT created_at INTO at FROM public.uc_education_issuance_preparations WHERE id=preparation_id;item_id:=(p_result->'preparation'->'items'->0->>'id')::uuid;
 ELSIF p_operation='issue'THEN event_ids:=r->'event_ids';record_id:=(r->'record_ids'->>0)::uuid;preparation_id:=(p_result->'record'->'artifact'->'artifact'->>'preparation_id')::uuid;item_id:=(p_result->'record'->'artifact'->'artifact'->>'item_id')::uuid;at:=(r->>'applied_at')::timestamptz;
 END IF;
 IF at IS NULL OR event_ids IS NULL OR jsonb_array_length(event_ids)>2 THEN PERFORM uc_individual_issuance_private.fail('DEPENDENCY_UNAVAILABLE');END IF;
 RETURN jsonb_build_object('request_id',p_request,'operation',p_operation,'payload_sha256',p_payload,'case_id',v_case_id,'case_revision',v_case_revision,'event_ids',event_ids,'preparation_id',preparation_id,'item_id',item_id,'record_id',record_id,'applied_at',public.uc_signature_assurance_utc(at),'replayed',false);
END;$fn$;

CREATE FUNCTION public.read_individual_education_issuance(p_organization_id uuid,p_enrollment_id uuid,p_query jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'SET lock_timeout='2000ms'AS $fn$
DECLARE a uuid:=auth.uid();kind text:=p_query->>'kind';base jsonb;ctx jsonb;c public.uc_admission_cases;out jsonb;query jsonb;lim integer;after_id uuid;typed uc_individual_issuance_private.items;items jsonb:='[]';next_id uuid;n integer:=0;summary jsonb;item jsonb;
BEGIN
 base:=uc_individual_issuance_private.envelope(p_organization_id,p_enrollment_id,a,kind);
 IF jsonb_typeof(p_query)IS DISTINCT FROM'object'OR octet_length(p_query::text)>131072 OR p_query->'schema_version'IS DISTINCT FROM'2'::jsonb THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
 IF kind='context'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['schema_version','kind'])THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
  RETURN base||jsonb_build_object('context',uc_individual_issuance_private.context_value(p_organization_id,p_enrollment_id,a));
 ELSIF kind IN('admission_options','evidence_candidates','case_history')THEN
  IF NOT public.uc_signature_assurance_uuid(p_query->'case_id')THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
  c:=uc_individual_issuance_private.case_row((p_query->>'case_id')::uuid,a,'read');IF c.organization_id<>p_organization_id OR c.enrollment_id<>p_enrollment_id THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
  IF kind='admission_options'THEN
   IF NOT public.uc_admission_shape(p_query,ARRAY['schema_version','kind','case_id','option_kind','after_id','limit'])OR p_query->>'option_kind'IS NULL OR p_query->>'option_kind'NOT IN('responsibles','local_acts')THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
   query:=(p_query-ARRAY['schema_version','kind','option_kind'])||jsonb_build_object('mode','options','kind',p_query->'option_kind');
  ELSIF kind='evidence_candidates'THEN
   IF NOT public.uc_admission_shape(p_query,ARRAY['schema_version','kind','case_id','source_kind','after_id','limit'])OR p_query->>'source_kind'IS NULL OR p_query->>'source_kind'NOT IN('identity_document','enrollment_document')THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
   query:=(p_query-ARRAY['schema_version','kind','source_kind'])||jsonb_build_object('mode','candidates','kind',p_query->'source_kind');
  ELSE
   IF NOT public.uc_admission_shape(p_query,ARRAY['schema_version','kind','case_id','ceiling_revision','before_revision','limit'])OR(p_query->'ceiling_revision'<>'null'::jsonb AND NOT uc_individual_orders_private.revision(p_query->'ceiling_revision'))OR(p_query->'before_revision'<>'null'::jsonb AND NOT uc_individual_orders_private.revision(p_query->'before_revision'))THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
   query:=(p_query-ARRAY['schema_version','kind'])||jsonb_build_object('mode','history');
  END IF;
  out:=uc_individual_issuance_private.read_admission_core(p_organization_id,c.user_id,query);
  IF kind='case_history'THEN RETURN base||jsonb_build_object('case_id',c.id,'ceiling_revision',out->'ceiling_revision','items',out->'items','next_before_revision',out->'next_before_revision');END IF;
  RETURN base||jsonb_build_object('case_id',c.id,'case_revision',out->'case_revision','items',out->'items','next_after_id',out->'next_after_id')||CASE kind WHEN'admission_options'THEN jsonb_build_object('option_kind',p_query->'option_kind')ELSE jsonb_build_object('source_kind',p_query->'source_kind')END;
 ELSIF kind='preview_issue'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['schema_version','kind','intent'])THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
  RETURN base||uc_individual_issuance_private.preview(p_organization_id,p_enrollment_id,a,p_query->'intent',false);
 ELSIF kind='record'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['schema_version','kind','record_id'])OR NOT public.uc_signature_assurance_uuid(p_query->'record_id')THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
  RETURN base||jsonb_build_object('record',uc_individual_issuance_private.record_value(p_organization_id,p_enrollment_id,(p_query->>'record_id')::uuid,a));
 ELSIF kind='preparation'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['schema_version','kind','preparation_id'])OR NOT public.uc_signature_assurance_uuid(p_query->'preparation_id')THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
  SELECT*INTO typed FROM uc_individual_issuance_private.items WHERE preparation_id=(p_query->>'preparation_id')::uuid AND organization_id=p_organization_id AND enrollment_id=p_enrollment_id;
  IF typed.item_id IS NULL THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
  RETURN base||jsonb_build_object('preparation',uc_individual_issuance_private.preparation_value(typed.preparation_id));
 ELSIF kind='preparations'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['schema_version','kind','after_id','limit'])OR jsonb_typeof(p_query->'limit')IS DISTINCT FROM'number'OR p_query->>'limit'!~'^[0-9]{1,2}$'OR(p_query->>'limit')::integer NOT BETWEEN 1 AND 50
   OR(p_query->'after_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_query->'after_id'))THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
  ctx:=uc_individual_issuance_private.actor_context(a,p_organization_id,p_enrollment_id,'issue');lim:=(p_query->>'limit')::integer;after_id:=(p_query->>'after_id')::uuid;
  FOR typed IN SELECT t.*FROM uc_individual_issuance_private.items t JOIN public.uc_education_issuance_preparations p ON p.id=t.preparation_id AND p.actor_id=a AND NOT p.redacted WHERE t.organization_id=p_organization_id AND t.enrollment_id=p_enrollment_id AND(after_id IS NULL OR t.preparation_id>after_id)ORDER BY t.preparation_id LIMIT lim+1 LOOP
   n:=n+1;IF n>lim THEN next_id:=(items->-1->>'id')::uuid;EXIT;END IF;
   item:=public.uc_education_preparation_item_json(typed.item_id);
   summary:=jsonb_build_object('id',typed.preparation_id,'kind','original','created_at',(SELECT created_at FROM public.uc_education_issuance_preparations WHERE id=typed.preparation_id),'item_count',1,
    'prepared_count',CASE WHEN item->>'status'='prepared'THEN 1 ELSE 0 END,'rendered_unissued_count',CASE WHEN item->>'status'='rendered_unissued'THEN 1 ELSE 0 END,'approved_unissued_count',CASE WHEN item->>'status'='approved_unissued'THEN 1 ELSE 0 END,'consumed_count',CASE WHEN item->>'status'='consumed'THEN 1 ELSE 0 END,'stale_count',CASE WHEN item->>'status'='stale'THEN 1 ELSE 0 END);
   items:=items||jsonb_build_array(summary);
  END LOOP;
  RETURN base||jsonb_build_object('items',items,'next_after_id',next_id);
 END IF;
 PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN uc_individual_issuance_private.failure(SQLERRM,SQLSTATE);
END;$fn$;

CREATE FUNCTION public.apply_individual_education_issuance(p_organization_id uuid,p_enrollment_id uuid,p_request_id uuid,p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'SET lock_timeout='2000ms'AS $fn$
DECLARE a uuid:=auth.uid();op text:=p_command->>'action';base jsonb;ctx jsonb;h text;parts uuid[];canonical_parts uuid[];prior uc_individual_issuance_private.requests;c public.uc_admission_cases;
out jsonb;payload jsonb;receipt jsonb;canonical jsonb;canonical_kind text;canonical_hash text;binding jsonb;state jsonb;source_entry jsonb;
BEGIN
 base:=uc_individual_issuance_private.envelope(p_organization_id,p_enrollment_id,a,op);
 IF p_request_id IS NULL OR jsonb_typeof(p_command)IS DISTINCT FROM'object'OR octet_length(p_command::text)>2097152 OR p_command->'schema_version'IS DISTINCT FROM'2'::jsonb
  OR op IS NULL OR op NOT IN('initialize_admission','apply_admission_review','prepare_evidence','review_protocol_facts','prepare_artifact','issue')THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
 ctx:=uc_individual_issuance_private.actor_context(a,p_organization_id,p_enrollment_id,CASE WHEN op IN('prepare_artifact','issue')THEN'issue'ELSE'admission_write'END);
 h:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'enrollment_id',p_enrollment_id,'command',p_command));
 SELECT*INTO prior FROM uc_individual_issuance_private.requests WHERE actor_id=a AND request_id=p_request_id;
 IF prior.request_id IS NOT NULL AND(prior.organization_id<>p_organization_id OR prior.enrollment_id<>p_enrollment_id OR prior.user_id::text IS DISTINCT FROM base->>'user_id'OR prior.result->'course_id'IS DISTINCT FROM base->'course_id'OR prior.operation<>op OR prior.payload_sha256<>h)THEN PERFORM uc_individual_issuance_private.fail('REQUEST_CONFLICT');END IF;
 IF op='apply_admission_review'AND prior.request_id IS NULL THEN
  IF NOT public.uc_signature_assurance_shape(p_command,ARRAY['schema_version','action','binding','command'])THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
  PERFORM uc_individual_issuance_private.validate_review_action(p_command->'command');
  SELECT x.*INTO c FROM public.uc_admission_cases x JOIN uc_individual_issuance_private.cases t ON t.case_id=x.id WHERE x.id=(p_command->'command'->>'case_id')::uuid AND t.organization_id=p_organization_id AND t.enrollment_id=p_enrollment_id AND x.user_id=(ctx->>'subject_user_id')::uuid AND x.course_id=(ctx->>'course_id')::uuid;
  IF c.id IS NULL THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
  IF p_command->'command'->>'action'='assign_responsible'THEN
   IF NOT public.uc_admission_staff_allowed((p_command->'command'->>'responsible_id')::uuid,p_organization_id,c.user_id,NULL,p_enrollment_id,true)OR NOT public.uc_admission_staff_allowed((p_command->'command'->>'responsible_id')::uuid,p_organization_id,c.user_id,NULL,p_enrollment_id,false)THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
  ELSE
   IF c.responsible_id IS DISTINCT FROM a THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
   IF p_command->'command'->>'action'='review_local_rules'THEN FOR source_entry IN SELECT value FROM jsonb_array_elements(p_command->'command'->'sources')LOOP
    IF public.uc_admission_local_source(p_organization_id,source_entry)IS NULL THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
   END LOOP;END IF;
  END IF;
 END IF;
 IF prior.request_id IS NOT NULL THEN
  SELECT coalesce(array_agg(DISTINCT u ORDER BY u),'{}')INTO parts FROM unnest(uc_individual_issuance_private.participants(p_organization_id,p_enrollment_id,a)||prior.participant_ids)u;
 ELSE
  parts:=uc_individual_issuance_private.participants(p_organization_id,p_enrollment_id,a,CASE WHEN op='prepare_artifact'THEN p_command->'plan'->'template'END,CASE WHEN op='issue'AND public.uc_signature_assurance_uuid(p_command->'item_id')THEN(p_command->>'item_id')::uuid END,p_command);
 END IF;
 PERFORM uc_individual_orders_private.people(parts,true);
 PERFORM public.uc_education_issue_fence(p_organization_id,NULL,parts,'individual_request:'||a::text||':'||p_request_id::text);
 SELECT*INTO prior FROM uc_individual_issuance_private.requests WHERE actor_id=a AND request_id=p_request_id;
 IF prior.request_id IS NOT NULL THEN
  IF prior.organization_id<>p_organization_id OR prior.enrollment_id<>p_enrollment_id OR prior.user_id::text IS DISTINCT FROM base->>'user_id'OR prior.result->'course_id'IS DISTINCT FROM base->'course_id'OR prior.operation<>op OR prior.payload_sha256<>h THEN PERFORM uc_individual_issuance_private.fail('REQUEST_CONFLICT');END IF;
  PERFORM public.uc_education_issue_fence(p_organization_id,NULL,prior.participant_ids);
  RETURN jsonb_set(prior.result,'{receipt,replayed}','true'::jsonb);
 END IF;
 -- The public W2 transport UUID cannot silently alias another feature's real
 -- canonical request, or a different W2 operation under the same actor.
 IF EXISTS(SELECT 1 FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id)
  OR EXISTS(SELECT 1 FROM public.uc_education_issuance_requests WHERE actor_id=a AND request_id=p_request_id)
 THEN PERFORM uc_individual_issuance_private.fail('REQUEST_CONFLICT');END IF;
 IF op='initialize_admission'THEN
  IF NOT public.uc_signature_assurance_shape(p_command,ARRAY['schema_version','action','expected_case_revision','binding'])OR p_command->'expected_case_revision'IS DISTINCT FROM'0'::jsonb THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
  out:=uc_individual_issuance_private.initialize(p_organization_id,p_enrollment_id,p_request_id,p_command->'binding');payload:=jsonb_build_object('state',out->'state');canonical_kind:='admission';
 ELSIF op IN('apply_admission_review','prepare_evidence')THEN
  IF NOT public.uc_signature_assurance_shape(p_command,CASE op WHEN'apply_admission_review'THEN ARRAY['schema_version','action','binding','command']ELSE ARRAY['schema_version','action','case_id','expected_case_revision','binding','source']END)THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
  binding:=uc_individual_issuance_private.admission_binding(p_organization_id,p_enrollment_id,true);
  IF binding IS DISTINCT FROM p_command->'binding'THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
  IF NOT public.uc_signature_assurance_uuid(CASE op WHEN'apply_admission_review'THEN p_command->'command'->'case_id'ELSE p_command->'case_id'END)THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
  c:=uc_individual_issuance_private.case_row((CASE op WHEN'apply_admission_review'THEN p_command->'command'->>'case_id'ELSE p_command->>'case_id'END)::uuid,a,'admission_write');
  IF c.organization_id<>p_organization_id OR c.enrollment_id<>p_enrollment_id THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
  IF op='apply_admission_review'THEN
   out:=uc_individual_issuance_private.apply_review_core(p_organization_id,c.user_id,p_request_id,p_command->'command');payload:=jsonb_build_object('state',uc_individual_issuance_private.case_state(c.id,a));
  ELSE
   IF NOT uc_individual_orders_private.revision(p_command->'expected_case_revision')OR(p_command->'source'->>'kind'='existing'AND p_command->'source'->'candidate'->>'kind'NOT IN('identity_document','enrollment_document'))THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
   canonical:=uc_individual_issuance_private.prepare_evidence_core(c.id,(p_command->>'expected_case_revision')::bigint,binding->'programme',p_request_id,p_command->'source');
   state:=canonical||jsonb_build_object('schema_version',2,'kind','individual_w1','scope',binding->'scope');
   out:=jsonb_build_object('preparation',state,'receipt',canonical);payload:=jsonb_build_object('preparation',state);
  END IF;canonical_kind:='admission';
 ELSIF op='review_protocol_facts'THEN
  out:=uc_individual_issuance_private.review_protocol(p_organization_id,p_enrollment_id,p_request_id,p_command);payload:=jsonb_build_object('state',out->'state','protocol_review',out->'protocol_review');canonical_kind:='admission';
 ELSIF op='prepare_artifact'THEN
  IF NOT public.uc_signature_assurance_shape(p_command,ARRAY['schema_version','action','plan'])THEN PERFORM uc_individual_issuance_private.fail('INVALID_INPUT');END IF;
  out:=uc_individual_issuance_private.prepare(p_organization_id,p_enrollment_id,p_request_id,p_command->'plan');payload:=jsonb_build_object('preparation',out->'preparation');canonical_kind:='issuance';
 ELSE
  out:=uc_individual_issuance_private.issue(p_organization_id,p_enrollment_id,p_request_id,p_command);payload:=jsonb_build_object('record',out->'record');canonical_kind:='issuance';
 END IF;
 IF canonical_kind='admission'THEN SELECT q.payload_digest,q.receipt,ARRAY[q.actor_id,q.user_id]INTO canonical_hash,canonical,canonical_parts FROM public.uc_admission_case_requests q WHERE q.actor_id=a AND q.request_id=p_request_id AND q.organization_id=p_organization_id AND q.user_id=(base->>'user_id')::uuid;
 ELSE SELECT q.payload_hash,q.receipt,q.participant_ids INTO canonical_hash,canonical,canonical_parts FROM public.uc_education_issuance_requests q WHERE q.actor_id=a AND q.request_id=p_request_id AND q.organization_id=p_organization_id;END IF;
 IF canonical IS NULL OR canonical IS DISTINCT FROM out->'receipt'OR canonical_hash IS NULL THEN PERFORM uc_individual_issuance_private.fail('DEPENDENCY_UNAVAILABLE');END IF;
 SELECT coalesce(array_agg(DISTINCT u ORDER BY u),'{}')INTO parts FROM unnest(parts||coalesce(canonical_parts,'{}')||uc_individual_issuance_private.participants(p_organization_id,p_enrollment_id,a,CASE WHEN op='prepare_artifact'THEN p_command->'plan'->'template'END,CASE WHEN op='issue'AND public.uc_signature_assurance_uuid(p_command->'item_id')THEN(p_command->>'item_id')::uuid END,p_command))u;
 PERFORM uc_individual_orders_private.people(parts,true);PERFORM public.uc_education_issue_fence(p_organization_id,NULL,parts);
 receipt:=uc_individual_issuance_private.mutation_receipt(p_request_id,op,h,out);payload:=base||jsonb_build_object('receipt',receipt)||payload;
 INSERT INTO uc_individual_issuance_private.requests(actor_id,request_id,organization_id,enrollment_id,user_id,operation,canonical_kind,canonical_actor_id,canonical_request_id,canonical_payload_sha256,payload_sha256,result,participant_ids)
 VALUES(a,p_request_id,p_organization_id,p_enrollment_id,(base->>'user_id')::uuid,op,canonical_kind,a,p_request_id,canonical_hash,h,payload,parts);
 RETURN payload;
EXCEPTION WHEN OTHERS THEN RETURN uc_individual_issuance_private.failure(SQLERRM,SQLSTATE);
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.private_guard()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE value jsonb:=to_jsonb(NEW);old_value jsonb:=to_jsonb(OLD);creator uuid;subject uuid;org uuid;enrollment uuid;canonical jsonb;digest text;
BEGIN
 IF TG_OP='DELETE'AND TG_TABLE_NAME='contexts'AND(old_value->>'transaction_id')::bigint=txid_current()AND(old_value->>'backend_pid')::integer=pg_backend_pid()AND(old_value->>'actor_id')::uuid=auth.uid()AND auth.role()='authenticated'THEN RETURN OLD;END IF;
 IF TG_OP<>'INSERT'THEN RAISE EXCEPTION 'individual_issuance_source_is_immutable' USING ERRCODE='42501';END IF;
 creator:=coalesce((value->>'created_by')::uuid,(value->>'recorded_by')::uuid,(value->>'actor_id')::uuid);subject:=(value->>'user_id')::uuid;org:=(value->>'organization_id')::uuid;enrollment:=(value->>'enrollment_id')::uuid;
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR creator IS DISTINCT FROM auth.uid()OR subject IS NULL THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
 PERFORM uc_individual_issuance_private.actor_context(creator,org,enrollment,CASE WHEN TG_TABLE_NAME IN('items','contexts','issued_sources')OR TG_TABLE_NAME='requests'AND value->>'operation'IN('prepare_artifact','issue')THEN'issue'ELSE'admission_write'END);
 IF TG_TABLE_NAME IN('cases','items','issued_sources')THEN
  IF value->'participant_ids'IS NULL OR NOT(value->'participant_ids'@>jsonb_build_array(creator,subject))THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
  IF TG_TABLE_NAME='cases'THEN
   IF NEW.source_sha256 IS DISTINCT FROM NEW.binding->>'source_hash'OR NEW.source_sha256 IS DISTINCT FROM public.uc_program_hash(NEW.binding-'source_hash')
    OR NEW.binding->'scope'IS DISTINCT FROM uc_individual_issuance_private.scope(NEW.organization_id,NEW.enrollment_id,NEW.user_id,NEW.course_id)
   THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
  ELSE
   IF value->>'source_sha256'IS DISTINCT FROM value->'eligibility_ref'->>'source_hash'OR value->>'source_sha256'IS DISTINCT FROM public.uc_program_hash((value->'eligibility_ref')-'source_hash')
    OR value->'eligibility_ref'->'scope'IS DISTINCT FROM uc_individual_issuance_private.scope(org,enrollment,subject,(value->>'course_id')::uuid)
   THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
  END IF;
 ELSIF TG_TABLE_NAME='contexts'THEN
  IF NEW.transaction_id<>txid_current()OR NEW.backend_pid<>pg_backend_pid()THEN PERFORM uc_individual_issuance_private.fail('ACCESS_DENIED');END IF;
 ELSE
  IF NEW.actor_id<>NEW.canonical_actor_id OR NEW.request_id<>NEW.canonical_request_id OR NEW.result->>'actor_user_id'IS DISTINCT FROM NEW.actor_id::text
   OR NEW.result->>'organization_id'IS DISTINCT FROM NEW.organization_id::text OR NEW.result->>'enrollment_id'IS DISTINCT FROM NEW.enrollment_id::text OR NEW.result->>'user_id'IS DISTINCT FROM NEW.user_id::text
   OR NEW.result->'receipt'->>'request_id'IS DISTINCT FROM NEW.request_id::text OR NEW.result->'receipt'->>'operation'IS DISTINCT FROM NEW.operation OR NEW.result->'receipt'->>'payload_sha256'IS DISTINCT FROM NEW.payload_sha256
  THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
  IF NEW.canonical_kind='admission'THEN SELECT q.receipt,q.payload_digest INTO canonical,digest FROM public.uc_admission_case_requests q WHERE q.actor_id=NEW.canonical_actor_id AND q.request_id=NEW.canonical_request_id AND q.organization_id=NEW.organization_id AND q.user_id=NEW.user_id;
  ELSE SELECT q.receipt,q.payload_hash INTO canonical,digest FROM public.uc_education_issuance_requests q WHERE q.actor_id=NEW.canonical_actor_id AND q.request_id=NEW.canonical_request_id AND q.organization_id=NEW.organization_id;END IF;
  IF canonical IS NULL OR digest IS DISTINCT FROM NEW.canonical_payload_sha256 THEN PERFORM uc_individual_issuance_private.fail('SOURCE_UNAVAILABLE');END IF;
 END IF;
 RETURN NEW;
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.correspondence()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE value jsonb:=to_jsonb(NEW);typed_case uc_individual_issuance_private.cases;typed_item uc_individual_issuance_private.items;issued uc_individual_issuance_private.issued_sources;
 c public.uc_admission_cases;i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;r public.education_document_records;s public.uc_education_issuance_states;ctx public.uc_education_issuance_contexts;
BEGIN
 IF TG_TABLE_NAME='cases'THEN
  SELECT*INTO typed_case FROM uc_individual_issuance_private.cases WHERE case_id=NEW.case_id;
  SELECT*INTO c FROM public.uc_admission_cases WHERE id=typed_case.case_id;
  IF c.id IS NULL OR c.group_id IS NOT NULL OR c.organization_id<>typed_case.organization_id OR c.enrollment_id<>typed_case.enrollment_id OR c.user_id<>typed_case.user_id OR c.course_id<>typed_case.course_id
   OR c.program_ref IS DISTINCT FROM typed_case.binding->'programme'OR typed_case.binding IS DISTINCT FROM uc_individual_issuance_private.admission_binding(typed_case.organization_id,typed_case.enrollment_id,false)
  THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 ELSIF TG_TABLE_NAME='items'THEN
  SELECT*INTO typed_item FROM uc_individual_issuance_private.items WHERE item_id=NEW.item_id;
  SELECT*INTO i FROM public.uc_education_issuance_preparation_items WHERE id=typed_item.item_id;
  SELECT*INTO p FROM public.uc_education_issuance_preparations WHERE id=typed_item.preparation_id;
  SELECT*INTO typed_case FROM uc_individual_issuance_private.cases WHERE case_id=typed_item.case_id;
  IF i.id IS NULL OR p.id IS NULL OR typed_case.case_id IS NULL OR i.group_id IS NOT NULL OR i.preparation_id<>typed_item.preparation_id OR p.kind<>'original'OR p.scope IS DISTINCT FROM jsonb_build_object('kind','organization')
   OR i.organization_id<>typed_item.organization_id OR i.enrollment_id<>typed_item.enrollment_id OR i.user_id<>typed_item.user_id OR i.course_id<>typed_item.course_id
   OR i.eligibility_ref IS DISTINCT FROM typed_item.eligibility_ref OR i.source_snapshot->>'kind'IS DISTINCT FROM'individual_w1'OR i.source_snapshot->'eligibility_ref'IS DISTINCT FROM typed_item.eligibility_ref
   OR p.plan->'items'->0->'expected_eligibility_ref'IS DISTINCT FROM typed_item.eligibility_ref OR p.actor_id<>typed_item.created_by
  THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 ELSIF TG_TABLE_NAME='contexts'THEN
  SELECT*INTO ctx FROM public.uc_education_issuance_contexts WHERE id=NEW.context_id;
  -- The canonical issue transaction intentionally removes both paired contexts.
  IF ctx.id IS NOT NULL AND NOT uc_individual_issuance_private.context_matches(ctx.id,ctx.organization_id,ctx.enrollment_id,ctx.user_id,ctx.course_id)THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 ELSIF TG_TABLE_NAME='issued_sources'THEN
  SELECT*INTO issued FROM uc_individual_issuance_private.issued_sources WHERE record_id=NEW.record_id;
  SELECT*INTO i FROM public.uc_education_issuance_preparation_items WHERE id=issued.item_id;
  SELECT*INTO r FROM public.education_document_records WHERE id=issued.record_id;
  SELECT*INTO s FROM public.uc_education_issuance_states WHERE record_id=issued.record_id;
  IF i.id IS NULL OR r.id IS NULL OR s.record_id IS NULL OR i.final_record_id IS DISTINCT FROM r.id OR r.group_id IS NOT NULL
   OR r.organization_id<>issued.organization_id OR r.enrollment_id<>issued.enrollment_id OR r.user_id<>issued.user_id OR r.course_id<>issued.course_id
   OR s.proof IS DISTINCT FROM issued.eligibility_ref OR s.artifact IS DISTINCT FROM issued.artifact OR i.eligibility_ref IS DISTINCT FROM issued.eligibility_ref
   OR NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_events e WHERE e.record_id=r.id AND e.organization_id=r.organization_id AND e.user_id=r.user_id AND e.revision=1 AND e.kind='issued'AND NOT e.redacted AND e.payload->'proof'=issued.eligibility_ref AND e.payload->'artifact'=issued.artifact)
  THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 END IF;
 RETURN NULL;
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.conditional_group()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t uc_individual_issuance_private.cases;i uc_individual_issuance_private.items;x uc_individual_issuance_private.contexts;
BEGIN
 IF TG_TABLE_NAME='uc_admission_cases'THEN
  SELECT*INTO t FROM uc_individual_issuance_private.cases WHERE case_id=NEW.id;
  IF NEW.group_id IS NULL THEN
   IF t.case_id IS NULL OR t.organization_id<>NEW.organization_id OR t.enrollment_id<>NEW.enrollment_id OR t.user_id<>NEW.user_id OR t.course_id<>NEW.course_id OR t.binding->'programme'IS DISTINCT FROM NEW.program_ref THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
  ELSIF t.case_id IS NOT NULL THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 ELSIF TG_TABLE_NAME='uc_education_issuance_preparation_items'THEN
  SELECT*INTO i FROM uc_individual_issuance_private.items WHERE item_id=NEW.id;
  IF NEW.group_id IS NULL THEN
   IF i.item_id IS NULL OR i.preparation_id<>NEW.preparation_id OR i.organization_id<>NEW.organization_id OR i.enrollment_id<>NEW.enrollment_id OR i.user_id<>NEW.user_id OR i.course_id<>NEW.course_id OR i.eligibility_ref IS DISTINCT FROM NEW.eligibility_ref THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
  ELSIF i.item_id IS NOT NULL THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 ELSE
  SELECT*INTO x FROM uc_individual_issuance_private.contexts WHERE context_id=NEW.id;
  IF NEW.group_id IS NULL THEN
   SELECT*INTO i FROM uc_individual_issuance_private.items WHERE item_id=x.item_id;
   IF x.context_id IS NULL OR i.item_id IS NULL OR x.transaction_id<>txid_current()OR x.backend_pid<>pg_backend_pid()OR x.actor_id IS DISTINCT FROM auth.uid()
    OR NEW.transaction_id<>x.transaction_id OR NEW.backend_pid<>x.backend_pid OR NEW.actor_id<>x.actor_id OR NEW.mode<>'original'
    OR NEW.organization_id<>x.organization_id OR NEW.enrollment_id<>x.enrollment_id OR NEW.user_id<>x.user_id OR NEW.course_id<>x.course_id OR NEW.proof IS DISTINCT FROM i.eligibility_ref
   THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
  ELSIF x.context_id IS NOT NULL THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 END IF;
 RETURN NEW;
END;$fn$;

CREATE FUNCTION uc_individual_issuance_private.protocol_event_guard()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;
BEGIN
 IF NEW.kind<>'review_protocol_facts'THEN RETURN NEW;END IF;
 SELECT*INTO c FROM public.uc_admission_cases WHERE id=NEW.case_id AND group_id IS NULL;
 IF c.id IS NULL OR NOT EXISTS(SELECT 1 FROM uc_individual_issuance_private.cases WHERE case_id=c.id)OR auth.role()IS DISTINCT FROM'authenticated'OR NEW.actor_id IS DISTINCT FROM auth.uid()OR c.responsible_id IS DISTINCT FROM NEW.actor_id
  OR NEW.authority_redacted OR NEW.organization_id<>c.organization_id OR NEW.user_id<>c.user_id OR NEW.case_revision<>c.revision
  OR NEW.payload->>'id'IS DISTINCT FROM NEW.id::text OR NEW.payload->'case_revision'IS DISTINCT FROM to_jsonb(NEW.case_revision)OR NEW.payload->>'actor_user_id'IS DISTINCT FROM NEW.actor_id::text
  OR NEW.payload->>'recorded_at'IS DISTINCT FROM public.uc_signature_assurance_utc(NEW.recorded_at)OR NEW.payload->>'review_sha256'IS DISTINCT FROM public.uc_program_hash(NEW.payload-'review_sha256')
  OR NEW.authority_hash IS DISTINCT FROM public.uc_program_hash(NEW.authority_snapshot)OR NEW.authority_snapshot->>'actor_id'IS DISTINCT FROM NEW.actor_id::text
  OR NEW.authority_snapshot->'scope'IS DISTINCT FROM public.uc_admission_scope(c.id)OR NEW.authority_snapshot->'program_ref'IS DISTINCT FROM c.program_ref
 THEN PERFORM uc_individual_issuance_private.fail('SOURCE_CHANGED');END IF;
 PERFORM uc_individual_issuance_private.case_row(c.id,NEW.actor_id,'admission_write');
 RETURN NEW;
END;$fn$;

DO $new_guards$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['cases','items','contexts','issued_sources','requests']LOOP
  EXECUTE format('CREATE TRIGGER w2_private_immutable BEFORE INSERT OR UPDATE OR DELETE ON uc_individual_issuance_private.%I FOR EACH ROW EXECUTE FUNCTION uc_individual_issuance_private.private_guard()',t);
  IF t<>'requests'THEN EXECUTE format('CREATE CONSTRAINT TRIGGER w2_current_correspondence AFTER INSERT ON uc_individual_issuance_private.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION uc_individual_issuance_private.correspondence()',t);END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['uc_admission_cases','uc_education_issuance_contexts','uc_education_issuance_preparation_items']LOOP
  EXECUTE format('CREATE TRIGGER w2_exact_group_or_individual BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION uc_individual_issuance_private.conditional_group()',t);
 END LOOP;
END;$new_guards$;
CREATE TRIGGER w2_exact_protocol_event BEFORE INSERT ON public.uc_admission_case_events FOR EACH ROW EXECUTE FUNCTION uc_individual_issuance_private.protocol_event_guard();

-- Exact guarded current-body composition. Old function ABI/owner/ACL/
-- config/volatility remain unchanged; no old migration is replayed.
DO $w2_delta_1$
DECLARE target oid:=to_regprocedure('public.uc_admission_association(uuid,uuid,uuid,uuid)');old_body text:=$w2_old_1$
 SELECT jsonb_build_object('organization_id',p_org,'group_id',g.id,'enrollment_id',e.id,'user_id',e.user_id,'course_id',e.course_id)
 FROM public.student_groups g JOIN public.courses co ON co.id=g.course_id AND co.organization_id=g.organization_id
 JOIN public.enrollments e ON e.course_id=co.id AND e.user_id=p_user JOIN public.student_group_memberships_effective m ON m.group_id=g.id AND m.organization_id=g.organization_id AND m.user_id=e.user_id
 WHERE g.id=p_group AND g.organization_id=p_org AND e.id=p_enrollment AND public.uc_identification_target_allowed(p_org,p_user,true)
$w2_old_1$;new_body text:=$w2_new_1$
 SELECT jsonb_build_object('organization_id',p_org,'group_id',g.id,'enrollment_id',e.id,'user_id',e.user_id,'course_id',e.course_id)
 FROM public.student_groups g JOIN public.courses co ON co.id=g.course_id AND co.organization_id=g.organization_id
 JOIN public.enrollments e ON e.course_id=co.id AND e.user_id=p_user JOIN public.student_group_memberships_effective m ON m.group_id=g.id AND m.organization_id=g.organization_id AND m.user_id=e.user_id
 WHERE g.id=p_group AND g.organization_id=p_org AND e.id=p_enrollment AND public.uc_identification_target_allowed(p_org,p_user,true)

 UNION ALL
 SELECT uc_individual_issuance_private.association_target(p_org,p_user,p_enrollment)
 WHERE p_group IS NULL AND EXISTS(SELECT 1 FROM uc_individual_issuance_private.cases c WHERE c.organization_id=p_org AND c.user_id=p_user AND c.enrollment_id=p_enrollment)
$w2_new_1$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'c941a8eccb60340b4d83107e53a5a1c4'OR md5(old_body)<>'c941a8eccb60340b4d83107e53a5a1c4'OR md5(new_body)<>'0a019bb1da1205ec11fb6929647d27f0'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_1' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_1';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'0a019bb1da1205ec11fb6929647d27f0'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_1';END IF;
END;$w2_delta_1$;

DO $w2_delta_2$
DECLARE target oid:=to_regprocedure('public.uc_admission_program(uuid,uuid,uuid,uuid)');old_body text:=$w2_old_2$
 SELECT jsonb_build_object('enrollment_snapshot_id',s.id,'binding_id',b.id,'binding_revision',b.revision,'version_id',v.id,'snapshot_hash',s.snapshot_hash,'facts_hash',v.facts_hash,'file_document_id',v.file_document_id,'file_version_id',v.file_version_id,'file_review_id',v.file_review_id)
 FROM public.group_program_enrollment_snapshots s JOIN public.group_program_bindings b ON b.id=s.binding_id AND b.organization_id=s.organization_id AND b.group_id=s.group_id AND b.course_id=s.course_id AND b.version_id=s.version_id AND b.revision=s.binding_revision AND b.snapshot_hash=s.snapshot_hash
 JOIN public.program_fact_versions v ON v.id=s.version_id AND v.organization_id=s.organization_id AND v.state='approved'
 WHERE s.organization_id=p_org AND s.user_id=p_user AND s.group_id=p_group AND s.enrollment_id=p_enrollment AND public.uc_admission_association(p_org,p_user,p_group,p_enrollment)IS NOT NULL
 AND s.course_id=(public.uc_admission_association(p_org,p_user,p_group,p_enrollment)->>'course_id')::uuid AND public.uc_program_file_proof(p_org,v.file_version_id)
$w2_old_2$;new_body text:=$w2_new_2$
 SELECT jsonb_build_object('enrollment_snapshot_id',s.id,'binding_id',b.id,'binding_revision',b.revision,'version_id',v.id,'snapshot_hash',s.snapshot_hash,'facts_hash',v.facts_hash,'file_document_id',v.file_document_id,'file_version_id',v.file_version_id,'file_review_id',v.file_review_id)
 FROM public.group_program_enrollment_snapshots s JOIN public.group_program_bindings b ON b.id=s.binding_id AND b.organization_id=s.organization_id AND b.group_id=s.group_id AND b.course_id=s.course_id AND b.version_id=s.version_id AND b.revision=s.binding_revision AND b.snapshot_hash=s.snapshot_hash
 JOIN public.program_fact_versions v ON v.id=s.version_id AND v.organization_id=s.organization_id AND v.state='approved'
 WHERE s.organization_id=p_org AND s.user_id=p_user AND s.group_id=p_group AND s.enrollment_id=p_enrollment AND public.uc_admission_association(p_org,p_user,p_group,p_enrollment)IS NOT NULL
 AND s.course_id=(public.uc_admission_association(p_org,p_user,p_group,p_enrollment)->>'course_id')::uuid AND public.uc_program_file_proof(p_org,v.file_version_id)

 UNION ALL
 SELECT uc_individual_issuance_private.programme_for_case(p_org,p_user,p_enrollment)
 WHERE p_group IS NULL AND EXISTS(SELECT 1 FROM uc_individual_issuance_private.cases c WHERE c.organization_id=p_org AND c.user_id=p_user AND c.enrollment_id=p_enrollment)
$w2_new_2$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'5e0279471cfdc6e675bdb7f39d25fc0e'OR md5(old_body)<>'5e0279471cfdc6e675bdb7f39d25fc0e'OR md5(new_body)<>'3747d83082a55b5a8ce67824a5d01909'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_2' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_2';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'3747d83082a55b5a8ce67824a5d01909'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_2';END IF;
END;$w2_delta_2$;

DO $w2_delta_3$
DECLARE target oid:=to_regprocedure('public.uc_admission_prerequisites(uuid,uuid,uuid,uuid,boolean)');old_body text:=$w2_old_3$
DECLARE code text;BEGIN
 IF public.uc_admission_association(p_org,p_user,p_group,p_enrollment)IS NULL THEN code:='association_inactive';
 ELSIF NOT EXISTS(SELECT 1 FROM public.group_program_bindings WHERE group_id=p_group AND organization_id=p_org)THEN code:='missing_program_binding';
 ELSIF NOT EXISTS(SELECT 1 FROM public.group_program_enrollment_snapshots WHERE group_id=p_group AND enrollment_id=p_enrollment AND user_id=p_user AND organization_id=p_org)THEN code:='missing_enrollment_snapshot';
 ELSIF public.uc_admission_program(p_org,p_user,p_group,p_enrollment)IS NULL THEN code:='program_file_unavailable';ELSIF p_rules THEN code:='rule_set_unreviewed';END IF;
 RETURN CASE WHEN code IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('code',code,'public_label',CASE code WHEN 'association_inactive'THEN 'Учебная связь недоступна'WHEN 'rule_set_unreviewed'THEN 'Нужно проверить правила личного дела'ELSE 'Нужно подтвердить программу обучения'END,'next_action',CASE code WHEN 'association_inactive'THEN 'contact_staff'WHEN 'rule_set_unreviewed'THEN 'review_rule_set'ELSE 'open_programme_confirmation'END,'persisted',false))END;END;$w2_old_3$;new_body text:=$w2_new_3$
DECLARE code text;BEGIN
 IF p_group IS NULL AND EXISTS(SELECT 1 FROM uc_individual_issuance_private.cases c WHERE c.organization_id=p_org AND c.user_id=p_user AND c.enrollment_id=p_enrollment)THEN
  RETURN uc_individual_issuance_private.admission_prerequisites(p_org,p_user,p_enrollment,p_rules);
 END IF;
 IF public.uc_admission_association(p_org,p_user,p_group,p_enrollment)IS NULL THEN code:='association_inactive';
 ELSIF NOT EXISTS(SELECT 1 FROM public.group_program_bindings WHERE group_id=p_group AND organization_id=p_org)THEN code:='missing_program_binding';
 ELSIF NOT EXISTS(SELECT 1 FROM public.group_program_enrollment_snapshots WHERE group_id=p_group AND enrollment_id=p_enrollment AND user_id=p_user AND organization_id=p_org)THEN code:='missing_enrollment_snapshot';
 ELSIF public.uc_admission_program(p_org,p_user,p_group,p_enrollment)IS NULL THEN code:='program_file_unavailable';ELSIF p_rules THEN code:='rule_set_unreviewed';END IF;
 RETURN CASE WHEN code IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('code',code,'public_label',CASE code WHEN 'association_inactive'THEN 'Учебная связь недоступна'WHEN 'rule_set_unreviewed'THEN 'Нужно проверить правила личного дела'ELSE 'Нужно подтвердить программу обучения'END,'next_action',CASE code WHEN 'association_inactive'THEN 'contact_staff'WHEN 'rule_set_unreviewed'THEN 'review_rule_set'ELSE 'open_programme_confirmation'END,'persisted',false))END;END;$w2_new_3$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'e6bb425b4638a513211eab7877875de1'OR md5(old_body)<>'e6bb425b4638a513211eab7877875de1'OR md5(new_body)<>'4f4a238157d4183053904ed93a35d8d3'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_3' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_3';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'4f4a238157d4183053904ed93a35d8d3'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_3';END IF;
END;$w2_delta_3$;

DO $w2_delta_4$
DECLARE target oid:=to_regprocedure('public.uc_scoped_journal_personal_counts(uuid)');old_body text:=$w2_old_4$
 SELECT (
 SELECT(
 SELECT(
 SELECT(
 SELECT(
 SELECT(
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',count_row.table_name,'column',count_row.column_name,'count',count_row.n) ORDER BY count_row.table_name),'[]'::jsonb) FROM(
  SELECT 'uc_scoped_journal_contexts'::text table_name,'created_by'::text column_name,count(*) n FROM public.uc_scoped_journal_contexts c WHERE c.created_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_records','participant_ids',count(*) FROM public.uc_scoped_journal_records r WHERE p_user=ANY(r.participant_ids) OR r.subject_user_id=p_user OR r.recorded_by=p_user OR r.created_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_history','participant_ids',count(*) FROM public.uc_scoped_journal_history h WHERE p_user=ANY(h.participant_ids) OR h.subject_user_id=p_user OR h.recorded_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_requests','participant_ids',count(*) FROM public.uc_scoped_journal_requests request_row WHERE p_user=ANY(request_row.participant_ids) OR request_row.actor_id=p_user
  UNION ALL SELECT 'uc_scoped_journal_exports','participant_ids',count(*) FROM public.uc_scoped_journal_exports e WHERE p_user=ANY(e.participant_ids) OR e.recorded_by=p_user
 ) count_row WHERE count_row.n>0
)||public.uc_copy_registry_personal_counts(p_user)
)||public.uc_document_registry_personal_counts(p_user)
)||public.uc_education_personal_counts(p_user))||public.uc_frdo_personal_counts(p_user))||public.uc_signature_assurance_personal_counts(p_user)||public.uc_signature_assurance_file_proof_personal_counts(p_user)||public.uc_archive_personal_counts(p_user)||public.uc_publication_personal_counts(p_user)
||(SELECT coalesce(jsonb_agg(jsonb_build_object('table',x.key,'column','retained_self_examination','count',x.value::bigint)ORDER BY x.key),'[]'::jsonb)FROM jsonb_each_text(public.uc_self_examination_personal_counts(p_user))x WHERE x.value::bigint>0)
||public.uc_ng_personal_counts(p_user)
) || rtn_private.personal_counts(p_user) || uc_individual_orders_private.personal_counts(p_user)
$w2_old_4$;new_body text:=$w2_new_4$
 SELECT (
 SELECT(
 SELECT(
 SELECT(
 SELECT(
 SELECT(
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',count_row.table_name,'column',count_row.column_name,'count',count_row.n) ORDER BY count_row.table_name),'[]'::jsonb) FROM(
  SELECT 'uc_scoped_journal_contexts'::text table_name,'created_by'::text column_name,count(*) n FROM public.uc_scoped_journal_contexts c WHERE c.created_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_records','participant_ids',count(*) FROM public.uc_scoped_journal_records r WHERE p_user=ANY(r.participant_ids) OR r.subject_user_id=p_user OR r.recorded_by=p_user OR r.created_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_history','participant_ids',count(*) FROM public.uc_scoped_journal_history h WHERE p_user=ANY(h.participant_ids) OR h.subject_user_id=p_user OR h.recorded_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_requests','participant_ids',count(*) FROM public.uc_scoped_journal_requests request_row WHERE p_user=ANY(request_row.participant_ids) OR request_row.actor_id=p_user
  UNION ALL SELECT 'uc_scoped_journal_exports','participant_ids',count(*) FROM public.uc_scoped_journal_exports e WHERE p_user=ANY(e.participant_ids) OR e.recorded_by=p_user
 ) count_row WHERE count_row.n>0
)||public.uc_copy_registry_personal_counts(p_user)
)||public.uc_document_registry_personal_counts(p_user)
)||public.uc_education_personal_counts(p_user))||public.uc_frdo_personal_counts(p_user))||public.uc_signature_assurance_personal_counts(p_user)||public.uc_signature_assurance_file_proof_personal_counts(p_user)||public.uc_archive_personal_counts(p_user)||public.uc_publication_personal_counts(p_user)
||(SELECT coalesce(jsonb_agg(jsonb_build_object('table',x.key,'column','retained_self_examination','count',x.value::bigint)ORDER BY x.key),'[]'::jsonb)FROM jsonb_each_text(public.uc_self_examination_personal_counts(p_user))x WHERE x.value::bigint>0)
||public.uc_ng_personal_counts(p_user)
) || rtn_private.personal_counts(p_user) || uc_individual_orders_private.personal_counts(p_user) || uc_individual_issuance_private.personal_counts(p_user)
$w2_new_4$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'afe583ea861280c7ce4f5da51502948b'OR md5(old_body)<>'afe583ea861280c7ce4f5da51502948b'OR md5(new_body)<>'e4ac9c415ad3756807e0e133a32fba9e'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_4' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_4';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'e4ac9c415ad3756807e0e133a32fba9e'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_4';END IF;
END;$w2_delta_4$;

DO $w2_delta_5$
DECLARE target oid:=to_regprocedure('public.read_student_admission_case(uuid,uuid,jsonb)');old_body text:=$w2_old_5$
DECLARE a uuid:=auth.uid();mode text:=p_query->>'mode';c public.uc_admission_cases;scope jsonb;pr jsonb;pre jsonb;items jsonb:='[]';row record;candidate jsonb;has_more boolean:=false;next_id uuid;lim integer;after_id uuid;kind text;ceiling bigint;before_rev bigint;counted integer:=0;staff boolean;BEGIN
 IF auth.role()IS DISTINCT FROM 'authenticated'OR NOT public.uc_admission_actor_allowed(a,false)OR NOT public.uc_identification_target_allowed(p_organization_id,p_student_user_id,true)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF mode='case'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['mode','group_id','enrollment_id'])OR NOT public.uc_admission_uuid(p_query->'group_id')OR NOT public.uc_admission_uuid(p_query->'enrollment_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  scope:=public.uc_admission_association(p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid);
  IF scope IS NULL OR NOT public.uc_admission_can_read(a,p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  SELECT * INTO c FROM public.uc_admission_cases WHERE organization_id=p_organization_id AND user_id=p_student_user_id AND group_id=(p_query->>'group_id')::uuid AND enrollment_id=(p_query->>'enrollment_id')::uuid;
  pr:=public.uc_admission_program(p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid);pre:=public.uc_admission_prerequisites(p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid,c.id IS NOT NULL AND c.rule_set_id IS NULL);
  IF a=p_student_user_id THEN RETURN jsonb_build_object('schema_version',1,'mode','case','projection','learner','scope',scope,'state',CASE WHEN c.id IS NOT NULL THEN public.uc_admission_state(c.id,a,true)END,'prerequisites',pre);END IF;
  RETURN jsonb_build_object('schema_version',1,'mode','case','projection','staff','scope',scope,'program_ref',pr,'program_title',(SELECT public.uc_admission_trim(facts->>'full_title')FROM public.program_fact_versions WHERE id=(pr->>'version_id')::uuid),'state',CASE WHEN c.id IS NOT NULL THEN public.uc_admission_state(c.id,a,false)END,'prerequisites',pre,'capabilities',public.uc_admission_capabilities(a,p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid,c.id));
 END IF;
 IF mode='history'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['mode','case_id','ceiling_revision','before_revision','limit'])THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 ELSE
  IF NOT public.uc_admission_shape(p_query,CASE mode WHEN 'associations'THEN ARRAY['mode','after_id','limit']WHEN 'candidates'THEN ARRAY['mode','case_id','kind','after_id','limit']WHEN 'options'THEN ARRAY['mode','case_id','kind','after_id','limit']ELSE ARRAY[]::text[]END)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 END IF;
 IF jsonb_typeof(p_query->'limit')IS DISTINCT FROM 'number'OR p_query->>'limit'!~'^[0-9]{1,2}$'OR(p_query->>'limit')::integer NOT BETWEEN 1 AND 50 THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;lim:=(p_query->>'limit')::integer;
 IF mode<>'history'THEN IF p_query->'after_id'<>'null'::jsonb AND NOT public.uc_admission_uuid(p_query->'after_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;after_id:=(p_query->>'after_id')::uuid;END IF;
 IF mode='associations'THEN
  staff:=public.has_role(a,'admin'::public.app_role)OR public.is_org_owner(a,p_organization_id)OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=a AND s.organization_id=p_organization_id AND s.role<>'teacher'AND(s.expires_at IS NULL OR s.expires_at>now())AND public.has_org_staff_permission(a,p_organization_id,'students.read')AND public.has_org_staff_permission(a,p_organization_id,'documents.read'));
  IF a<>p_student_user_id AND NOT staff AND NOT EXISTS(SELECT 1 FROM public.student_groups g JOIN public.enrollments e ON e.course_id=g.course_id AND e.user_id=p_student_user_id WHERE g.organization_id=p_organization_id AND public.uc_admission_staff_allowed(a,p_organization_id,p_student_user_id,g.id,e.id,false))THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  FOR row IN SELECT g.id group_id,e.id enrollment_id,coalesce(nullif(public.uc_admission_trim(left(g.name,160)),''),'Группа без названия')group_label FROM public.student_groups g JOIN public.enrollments e ON e.course_id=g.course_id AND e.user_id=p_student_user_id WHERE g.organization_id=p_organization_id AND(after_id IS NULL OR g.id>after_id)AND public.uc_admission_can_read(a,p_organization_id,p_student_user_id,g.id,e.id)ORDER BY g.id LIMIT lim+1 LOOP
   counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;
   scope:=public.uc_admission_association(p_organization_id,p_student_user_id,row.group_id,row.enrollment_id);
   items:=items||jsonb_build_array(jsonb_build_object('scope',scope,'group_label',row.group_label,'case_id',(SELECT id FROM public.uc_admission_cases WHERE organization_id=p_organization_id AND group_id=row.group_id AND enrollment_id=row.enrollment_id),'prerequisites',public.uc_admission_prerequisites(p_organization_id,p_student_user_id,row.group_id,row.enrollment_id,false)));next_id:=row.group_id;END LOOP;
  pre:='[]';IF counted=0 AND after_id IS NULL THEN pre:=jsonb_build_array(jsonb_build_object('code',CASE WHEN EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses co ON co.id=e.course_id WHERE e.user_id=p_student_user_id AND co.organization_id=p_organization_id)THEN 'missing_group'ELSE 'missing_enrollment'END,'public_label','Выберите подтверждённую учебную связь','next_action','select_exact_association','persisted',false));END IF;
  RETURN jsonb_build_object('schema_version',1,'mode',mode,'organization_id',p_organization_id,'user_id',p_student_user_id,'items',items,'prerequisites',pre,'has_more',has_more,'next_after_id',CASE WHEN has_more THEN next_id END);
 END IF;
 IF NOT public.uc_admission_uuid(p_query->'case_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_query->>'case_id')::uuid AND organization_id=p_organization_id AND user_id=p_student_user_id;
 IF c.id IS NULL OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF mode='history'THEN
  IF(p_query->'ceiling_revision'<>'null'::jsonb AND(p_query->>'ceiling_revision'!~'^[1-9][0-9]{0,15}$'OR(p_query->>'ceiling_revision')::numeric>9007199254740991))OR(p_query->'before_revision'<>'null'::jsonb AND(p_query->>'before_revision'!~'^[1-9][0-9]{0,15}$'OR(p_query->>'before_revision')::numeric>9007199254740991))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  ceiling:=coalesce((p_query->>'ceiling_revision')::bigint,c.revision);before_rev:=(p_query->>'before_revision')::bigint;IF ceiling>c.revision OR(before_rev IS NOT NULL AND before_rev>ceiling+1)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  FOR row IN SELECT * FROM public.uc_admission_case_events WHERE case_id=c.id AND case_revision<=ceiling AND(before_rev IS NULL OR case_revision<before_rev)ORDER BY case_revision DESC LIMIT lim+1 LOOP counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;items:=items||jsonb_build_array(jsonb_build_object('id',row.id,'case_id',row.case_id,'case_revision',row.case_revision,'kind',row.kind,'recorded_at',row.recorded_at,'actor_id',row.actor_id,'payload',public.uc_admission_history_payload(row.payload,a)));before_rev:=row.case_revision;END LOOP;
  RETURN jsonb_build_object('schema_version',1,'mode',mode,'case_id',c.id,'ceiling_revision',ceiling,'items',items,'has_more',has_more,'next_before_revision',CASE WHEN has_more THEN before_rev END);
 ELSIF mode='candidates'THEN
  kind:=p_query->>'kind';IF kind NOT IN('identity_document','enrollment_document','organization_document_version','contract_artifact')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  IF kind='organization_document_version'AND NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  FOR row IN SELECT * FROM(
   SELECT d.id,NULL::uuid version_id FROM public.student_identity_documents d WHERE kind='identity_document'AND d.user_id=c.user_id AND d.organization_id=c.organization_id
   UNION ALL SELECT d.id,NULL::uuid FROM public.student_documents d WHERE kind='enrollment_document'AND d.enrollment_id=c.enrollment_id
   UNION ALL SELECT d.id,d.current_version_id FROM public.org_documents d WHERE kind='organization_document_version'AND d.organization_id=c.organization_id AND public.uc_program_file_proof(c.organization_id,d.current_version_id)
   UNION ALL SELECT d.id,NULL::uuid FROM public.org_contracts d WHERE kind='contract_artifact'AND d.organization_id=c.organization_id AND d.student_user_id=c.user_id
  )q WHERE after_id IS NULL OR id>after_id ORDER BY id LIMIT lim+1 LOOP counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;candidate:=public.uc_admission_candidate(c.id,kind,row.id,row.version_id);IF candidate IS NULL THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;items:=items||jsonb_build_array(candidate->'candidate');next_id:=row.id;END LOOP;
  RETURN jsonb_build_object('schema_version',1,'mode',mode,'case_id',c.id,'case_revision',c.revision,'items',items,'has_more',has_more,'next_after_id',CASE WHEN has_more THEN next_id END);
 ELSIF mode='options'THEN
  kind:=p_query->>'kind';IF kind NOT IN('responsibles','local_acts')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  IF kind='responsibles'THEN
   FOR row IN SELECT q.user_id,coalesce(nullif(public.uc_admission_trim(left(s.display_name,160)),''),nullif(public.uc_admission_trim(left(p.full_name,160)),''),'Сотрудник')display_name FROM(SELECT user_id FROM public.org_staff WHERE organization_id=c.organization_id UNION SELECT user_id FROM public.profiles WHERE organization_id=c.organization_id UNION SELECT a)q LEFT JOIN public.org_staff s ON s.user_id=q.user_id AND s.organization_id=c.organization_id LEFT JOIN public.profiles p ON p.user_id=q.user_id WHERE(after_id IS NULL OR q.user_id>after_id)AND public.uc_admission_staff_allowed(q.user_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,true)AND public.uc_admission_staff_allowed(q.user_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)ORDER BY q.user_id LIMIT lim+1 LOOP counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;items:=items||jsonb_build_array(jsonb_build_object('user_id',row.user_id,'display_name',row.display_name));next_id:=row.user_id;END LOOP;
  ELSE
   IF NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
   FOR row IN SELECT d.id,d.current_version_id,r.id review_id FROM public.org_documents d JOIN public.org_document_reviews r ON r.document_id=d.id AND r.version_id=d.current_version_id AND r.organization_id=d.organization_id WHERE d.organization_id=c.organization_id AND d.type IN('admission_rules','edu_relations','paid_services')AND(after_id IS NULL OR d.id>after_id)AND public.uc_admission_local_source(c.organization_id,jsonb_build_object('document_id',d.id,'version_id',d.current_version_id,'review_id',r.id))IS NOT NULL ORDER BY d.id LIMIT lim+1 LOOP counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;candidate:=public.uc_admission_local_source(c.organization_id,jsonb_build_object('document_id',row.id,'version_id',row.current_version_id,'review_id',row.review_id));items:=items||jsonb_build_array(candidate-'version_metadata');next_id:=row.id;END LOOP;
  END IF;
  RETURN jsonb_build_object('schema_version',1,'mode',mode,'case_id',c.id,'case_revision',c.revision,'kind',kind,'items',items,'has_more',has_more,'next_after_id',CASE WHEN has_more THEN next_id END);
 END IF;PERFORM public.uc_admission_error('INVALID_INPUT');RETURN NULL;END;$w2_old_5$;new_body text:=$w2_new_5$
DECLARE a uuid:=auth.uid();mode text:=p_query->>'mode';c public.uc_admission_cases;scope jsonb;pr jsonb;pre jsonb;items jsonb:='[]';row record;candidate jsonb;has_more boolean:=false;next_id uuid;lim integer;after_id uuid;kind text;ceiling bigint;before_rev bigint;counted integer:=0;staff boolean;BEGIN
 IF auth.role()IS DISTINCT FROM 'authenticated'OR NOT public.uc_admission_actor_allowed(a,false)OR NOT public.uc_identification_target_allowed(p_organization_id,p_student_user_id,true)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF mode='case'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['mode','group_id','enrollment_id'])OR NOT public.uc_admission_uuid(p_query->'group_id')OR NOT public.uc_admission_uuid(p_query->'enrollment_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  scope:=public.uc_admission_association(p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid);
  IF scope IS NULL OR NOT public.uc_admission_can_read(a,p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  SELECT * INTO c FROM public.uc_admission_cases WHERE organization_id=p_organization_id AND user_id=p_student_user_id AND group_id=(p_query->>'group_id')::uuid AND enrollment_id=(p_query->>'enrollment_id')::uuid;
  pr:=public.uc_admission_program(p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid);pre:=public.uc_admission_prerequisites(p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid,c.id IS NOT NULL AND c.rule_set_id IS NULL);
  IF a=p_student_user_id THEN RETURN jsonb_build_object('schema_version',1,'mode','case','projection','learner','scope',scope,'state',CASE WHEN c.id IS NOT NULL THEN public.uc_admission_state(c.id,a,true)END,'prerequisites',pre);END IF;
  RETURN jsonb_build_object('schema_version',1,'mode','case','projection','staff','scope',scope,'program_ref',pr,'program_title',(SELECT public.uc_admission_trim(facts->>'full_title')FROM public.program_fact_versions WHERE id=(pr->>'version_id')::uuid),'state',CASE WHEN c.id IS NOT NULL THEN public.uc_admission_state(c.id,a,false)END,'prerequisites',pre,'capabilities',public.uc_admission_capabilities(a,p_organization_id,p_student_user_id,(p_query->>'group_id')::uuid,(p_query->>'enrollment_id')::uuid,c.id));
 END IF;
 IF mode='history'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['mode','case_id','ceiling_revision','before_revision','limit'])THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 ELSE
  IF NOT public.uc_admission_shape(p_query,CASE mode WHEN 'associations'THEN ARRAY['mode','after_id','limit']WHEN 'candidates'THEN ARRAY['mode','case_id','kind','after_id','limit']WHEN 'options'THEN ARRAY['mode','case_id','kind','after_id','limit']ELSE ARRAY[]::text[]END)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 END IF;
 IF jsonb_typeof(p_query->'limit')IS DISTINCT FROM 'number'OR p_query->>'limit'!~'^[0-9]{1,2}$'OR(p_query->>'limit')::integer NOT BETWEEN 1 AND 50 THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;lim:=(p_query->>'limit')::integer;
 IF mode<>'history'THEN IF p_query->'after_id'<>'null'::jsonb AND NOT public.uc_admission_uuid(p_query->'after_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;after_id:=(p_query->>'after_id')::uuid;END IF;
 IF mode='associations'THEN
  staff:=public.has_role(a,'admin'::public.app_role)OR public.is_org_owner(a,p_organization_id)OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=a AND s.organization_id=p_organization_id AND s.role<>'teacher'AND(s.expires_at IS NULL OR s.expires_at>now())AND public.has_org_staff_permission(a,p_organization_id,'students.read')AND public.has_org_staff_permission(a,p_organization_id,'documents.read'));
  IF a<>p_student_user_id AND NOT staff AND NOT EXISTS(SELECT 1 FROM public.student_groups g JOIN public.enrollments e ON e.course_id=g.course_id AND e.user_id=p_student_user_id WHERE g.organization_id=p_organization_id AND public.uc_admission_staff_allowed(a,p_organization_id,p_student_user_id,g.id,e.id,false))THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  FOR row IN SELECT g.id group_id,e.id enrollment_id,coalesce(nullif(public.uc_admission_trim(left(g.name,160)),''),'Группа без названия')group_label FROM public.student_groups g JOIN public.enrollments e ON e.course_id=g.course_id AND e.user_id=p_student_user_id WHERE g.organization_id=p_organization_id AND(after_id IS NULL OR g.id>after_id)AND public.uc_admission_can_read(a,p_organization_id,p_student_user_id,g.id,e.id)ORDER BY g.id LIMIT lim+1 LOOP
   counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;
   scope:=public.uc_admission_association(p_organization_id,p_student_user_id,row.group_id,row.enrollment_id);
   items:=items||jsonb_build_array(jsonb_build_object('scope',scope,'group_label',row.group_label,'case_id',(SELECT id FROM public.uc_admission_cases WHERE organization_id=p_organization_id AND group_id=row.group_id AND enrollment_id=row.enrollment_id),'prerequisites',public.uc_admission_prerequisites(p_organization_id,p_student_user_id,row.group_id,row.enrollment_id,false)));next_id:=row.group_id;END LOOP;
  pre:='[]';IF counted=0 AND after_id IS NULL THEN pre:=jsonb_build_array(jsonb_build_object('code',CASE WHEN EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses co ON co.id=e.course_id WHERE e.user_id=p_student_user_id AND co.organization_id=p_organization_id)THEN 'missing_group'ELSE 'missing_enrollment'END,'public_label','Выберите подтверждённую учебную связь','next_action','select_exact_association','persisted',false));END IF;
  RETURN jsonb_build_object('schema_version',1,'mode',mode,'organization_id',p_organization_id,'user_id',p_student_user_id,'items',items,'prerequisites',pre,'has_more',has_more,'next_after_id',CASE WHEN has_more THEN next_id END);
 END IF;
 IF NOT public.uc_admission_uuid(p_query->'case_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_query->>'case_id')::uuid AND organization_id=p_organization_id AND user_id=p_student_user_id;
 IF EXISTS(SELECT 1 FROM uc_individual_issuance_private.cases w2 WHERE w2.case_id=c.id)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF c.id IS NULL OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF mode='history'THEN
  IF(p_query->'ceiling_revision'<>'null'::jsonb AND(p_query->>'ceiling_revision'!~'^[1-9][0-9]{0,15}$'OR(p_query->>'ceiling_revision')::numeric>9007199254740991))OR(p_query->'before_revision'<>'null'::jsonb AND(p_query->>'before_revision'!~'^[1-9][0-9]{0,15}$'OR(p_query->>'before_revision')::numeric>9007199254740991))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  ceiling:=coalesce((p_query->>'ceiling_revision')::bigint,c.revision);before_rev:=(p_query->>'before_revision')::bigint;IF ceiling>c.revision OR(before_rev IS NOT NULL AND before_rev>ceiling+1)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  FOR row IN SELECT * FROM public.uc_admission_case_events WHERE case_id=c.id AND case_revision<=ceiling AND(before_rev IS NULL OR case_revision<before_rev)ORDER BY case_revision DESC LIMIT lim+1 LOOP counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;items:=items||jsonb_build_array(jsonb_build_object('id',row.id,'case_id',row.case_id,'case_revision',row.case_revision,'kind',row.kind,'recorded_at',row.recorded_at,'actor_id',row.actor_id,'payload',public.uc_admission_history_payload(row.payload,a)));before_rev:=row.case_revision;END LOOP;
  RETURN jsonb_build_object('schema_version',1,'mode',mode,'case_id',c.id,'ceiling_revision',ceiling,'items',items,'has_more',has_more,'next_before_revision',CASE WHEN has_more THEN before_rev END);
 ELSIF mode='candidates'THEN
  kind:=p_query->>'kind';IF kind NOT IN('identity_document','enrollment_document','organization_document_version','contract_artifact')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  IF kind='organization_document_version'AND NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  FOR row IN SELECT * FROM(
   SELECT d.id,NULL::uuid version_id FROM public.student_identity_documents d WHERE kind='identity_document'AND d.user_id=c.user_id AND d.organization_id=c.organization_id
   UNION ALL SELECT d.id,NULL::uuid FROM public.student_documents d WHERE kind='enrollment_document'AND d.enrollment_id=c.enrollment_id
   UNION ALL SELECT d.id,d.current_version_id FROM public.org_documents d WHERE kind='organization_document_version'AND d.organization_id=c.organization_id AND public.uc_program_file_proof(c.organization_id,d.current_version_id)
   UNION ALL SELECT d.id,NULL::uuid FROM public.org_contracts d WHERE kind='contract_artifact'AND d.organization_id=c.organization_id AND d.student_user_id=c.user_id
  )q WHERE after_id IS NULL OR id>after_id ORDER BY id LIMIT lim+1 LOOP counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;candidate:=public.uc_admission_candidate(c.id,kind,row.id,row.version_id);IF candidate IS NULL THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;items:=items||jsonb_build_array(candidate->'candidate');next_id:=row.id;END LOOP;
  RETURN jsonb_build_object('schema_version',1,'mode',mode,'case_id',c.id,'case_revision',c.revision,'items',items,'has_more',has_more,'next_after_id',CASE WHEN has_more THEN next_id END);
 ELSIF mode='options'THEN
  kind:=p_query->>'kind';IF kind NOT IN('responsibles','local_acts')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  IF kind='responsibles'THEN
   FOR row IN SELECT q.user_id,coalesce(nullif(public.uc_admission_trim(left(s.display_name,160)),''),nullif(public.uc_admission_trim(left(p.full_name,160)),''),'Сотрудник')display_name FROM(SELECT user_id FROM public.org_staff WHERE organization_id=c.organization_id UNION SELECT user_id FROM public.profiles WHERE organization_id=c.organization_id UNION SELECT a)q LEFT JOIN public.org_staff s ON s.user_id=q.user_id AND s.organization_id=c.organization_id LEFT JOIN public.profiles p ON p.user_id=q.user_id WHERE(after_id IS NULL OR q.user_id>after_id)AND public.uc_admission_staff_allowed(q.user_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,true)AND public.uc_admission_staff_allowed(q.user_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)ORDER BY q.user_id LIMIT lim+1 LOOP counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;items:=items||jsonb_build_array(jsonb_build_object('user_id',row.user_id,'display_name',row.display_name));next_id:=row.user_id;END LOOP;
  ELSE
   IF NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
   FOR row IN SELECT d.id,d.current_version_id,r.id review_id FROM public.org_documents d JOIN public.org_document_reviews r ON r.document_id=d.id AND r.version_id=d.current_version_id AND r.organization_id=d.organization_id WHERE d.organization_id=c.organization_id AND d.type IN('admission_rules','edu_relations','paid_services')AND(after_id IS NULL OR d.id>after_id)AND public.uc_admission_local_source(c.organization_id,jsonb_build_object('document_id',d.id,'version_id',d.current_version_id,'review_id',r.id))IS NOT NULL ORDER BY d.id LIMIT lim+1 LOOP counted:=counted+1;IF counted>lim THEN has_more:=true;EXIT;END IF;candidate:=public.uc_admission_local_source(c.organization_id,jsonb_build_object('document_id',row.id,'version_id',row.current_version_id,'review_id',row.review_id));items:=items||jsonb_build_array(candidate-'version_metadata');next_id:=row.id;END LOOP;
  END IF;
  RETURN jsonb_build_object('schema_version',1,'mode',mode,'case_id',c.id,'case_revision',c.revision,'kind',kind,'items',items,'has_more',has_more,'next_after_id',CASE WHEN has_more THEN next_id END);
 END IF;PERFORM public.uc_admission_error('INVALID_INPUT');RETURN NULL;END;$w2_new_5$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'a648495809c3cd3e308ff04c2be25063'OR md5(old_body)<>'a648495809c3cd3e308ff04c2be25063'OR md5(new_body)<>'a1af9aa3624ecde2ec3b9aae46d5feea'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_5' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_5';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'a1af9aa3624ecde2ec3b9aae46d5feea'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_5';END IF;
END;$w2_delta_5$;

DO $w2_delta_6$
DECLARE target oid:=to_regprocedure('public.apply_student_admission_case_action(uuid,uuid,uuid,jsonb)');old_body text:=$w2_old_6$
DECLARE a uuid:=auth.uid();act text:=p_command->>'action';c public.uc_admission_cases;prior public.uc_admission_case_requests;scope jsonb;ref jsonb;reqid uuid;ctx uuid;event uuid:=gen_random_uuid();receipt jsonb;payload_digest text;source jsonb;sources jsonb:='[]';defs jsonb;d jsonb;q jsonb;reqs jsonb:='[]';review jsonb;identities jsonb;identity jsonb;new_rule uuid;digest text;reason text;eid uuid;rid uuid;rev bigint;BEGIN
 IF auth.role()IS DISTINCT FROM 'authenticated'OR a IS NULL OR p_request_id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_admission_validate_action(p_command);payload_digest:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'user_id',p_student_user_id,'command',p_command));
 IF act='initialize'THEN scope:=public.uc_admission_association(p_organization_id,p_student_user_id,(p_command->>'group_id')::uuid,(p_command->>'enrollment_id')::uuid);
 ELSE SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_command->>'case_id')::uuid AND organization_id=p_organization_id AND user_id=p_student_user_id;scope:=public.uc_admission_scope(c.id);END IF;
 IF scope IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_admission_lock(a,p_organization_id,p_student_user_id,(scope->>'group_id')::uuid,(scope->>'enrollment_id')::uuid,CASE WHEN act='assign_responsible'THEN(p_command->>'responsible_id')::uuid ELSE c.responsible_id END);
 PERFORM pg_advisory_xact_lock(hashtextextended('uc_admission_request:'||a::text||':'||p_request_id::text,0));
 IF act<>'initialize'THEN SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_command->>'case_id')::uuid;
  IF act IN('review_local_rules','review_requirement','review_evidence','record_decision')AND c.responsible_id IS DISTINCT FROM a THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  IF act='review_local_rules'AND NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  IF act='assign_responsible'AND NOT public.uc_admission_staff_allowed((p_command->>'responsible_id')::uuid,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 END IF;
 SELECT * INTO prior FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id;
 IF prior.actor_id IS NOT NULL THEN IF prior.payload_digest<>payload_digest OR prior.organization_id<>p_organization_id OR prior.user_id<>p_student_user_id OR prior.kind<>act THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;RETURN public.uc_admission_result(prior.case_id,a,prior.receipt,true);END IF;
 IF act='initialize'THEN
  ref:=public.uc_admission_program(p_organization_id,p_student_user_id,(scope->>'group_id')::uuid,(scope->>'enrollment_id')::uuid);IF ref IS NULL THEN PERFORM public.uc_admission_error('PREREQUISITE_MISSING');END IF;
  IF ref IS DISTINCT FROM p_command->'expected_program_ref'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  IF EXISTS(SELECT 1 FROM public.uc_admission_cases WHERE organization_id=p_organization_id AND group_id=(scope->>'group_id')::uuid AND enrollment_id=(scope->>'enrollment_id')::uuid)THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
  INSERT INTO public.uc_admission_cases(organization_id,user_id,group_id,enrollment_id,course_id,program_ref,program_title,program_type,revision)SELECT p_organization_id,p_student_user_id,(scope->>'group_id')::uuid,(scope->>'enrollment_id')::uuid,(scope->>'course_id')::uuid,ref,public.uc_admission_trim(v.facts->>'full_title'),v.facts->>'program_type',1 FROM public.program_fact_versions v WHERE v.id=(ref->>'version_id')::uuid RETURNING * INTO c;
  ctx:=public.uc_admission_context(c.id,a,'mutation');
 ELSE
  SELECT * INTO c FROM public.uc_admission_cases WHERE id=c.id FOR UPDATE;
  IF c.revision<>(p_command->>'expected_revision')::bigint THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
  IF c.revision>=9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
  IF c.program_ref IS DISTINCT FROM p_command->'expected_program_ref'OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  IF act IN('review_local_rules','review_requirement','review_evidence','record_decision')AND c.responsible_id IS DISTINCT FROM a THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  ctx:=public.uc_admission_context(c.id,a,'mutation');
  UPDATE public.uc_admission_cases SET revision=revision+1,updated_at=clock_timestamp()WHERE id=c.id RETURNING * INTO c;
  reason:=coalesce(p_command->>'reason',p_command->>'review_reason');
  IF act='assign_responsible'THEN
   IF NOT public.uc_admission_staff_allowed((p_command->>'responsible_id')::uuid,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
   UPDATE public.uc_admission_cases SET responsible_id=(p_command->>'responsible_id')::uuid WHERE id=c.id;
  ELSIF act='review_local_rules'THEN
   IF NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
   IF jsonb_typeof(p_command->'sources')IS DISTINCT FROM 'array'OR jsonb_array_length(p_command->'sources')NOT BETWEEN 1 AND 3 OR jsonb_typeof(p_command->'requirements')IS DISTINCT FROM 'array'OR jsonb_array_length(p_command->'requirements')NOT BETWEEN 3 AND 50 THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   FOR source IN SELECT x FROM jsonb_array_elements(p_command->'sources')x LOOP
    IF NOT public.uc_admission_shape(source,ARRAY['document_id','version_id','review_id'])OR NOT public.uc_admission_uuid(source->'document_id')OR NOT public.uc_admission_uuid(source->'version_id')OR NOT public.uc_admission_uuid(source->'review_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
    PERFORM public.uc_admission_lock_rules(jsonb_build_array(source));d:=public.uc_admission_local_source(c.organization_id,source);IF d IS NULL THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;sources:=sources||jsonb_build_array(d);END LOOP;
   IF(SELECT count(DISTINCT x->>'document_id')FROM jsonb_array_elements(p_command->'sources')x)<>jsonb_array_length(sources)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   defs:=p_command->'requirements';IF(SELECT count(DISTINCT x->>'key')FROM jsonb_array_elements(defs)x)<>jsonb_array_length(defs)OR EXISTS(SELECT 1 FROM unnest(ARRAY['education_basis','application','contract_or_funding'])k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(defs)x WHERE x->>'kind'=k))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   FOR d IN SELECT x FROM jsonb_array_elements(defs)x LOOP
    IF NOT public.uc_education_admission_definition_shape(d,c.program_type)OR coalesce(jsonb_typeof(d->'key')='string'AND d->>'key'~'^[a-z0-9_]{1,64}$'AND d->>'kind'IN('education_basis','application','contract_or_funding','other_reviewed')AND d->>'exception_policy'IN('not_defined','local_reasoned_exception'),false)=false OR NOT public.uc_admission_text(d->'staff_label',160)OR NOT public.uc_admission_text(d->'provision',1000)OR NOT public.uc_admission_ids(d->'source_version_ids',1,3)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'source_version_ids')v WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources)s WHERE s->'version_id'=v))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(defs)def WHERE def?'issuance_condition')AND(SELECT count(*)FROM jsonb_array_elements(defs)def WHERE def->>'kind'='education_basis')<>1 THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   new_rule:=gen_random_uuid();digest:=public.uc_program_hash(jsonb_build_object('program_ref',c.program_ref,'source_snapshots',sources,'definitions',defs));identities:=coalesce(c.reviews->'identities','{}');
   FOR d IN SELECT x FROM jsonb_array_elements(defs)x LOOP
    identity:=identities->(d->>'key');reqid:=coalesce((identity->>'id')::uuid,gen_random_uuid());rev:=coalesce((identity->>'revision')::bigint,0)+1;
    IF rev>9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;identities:=identities||jsonb_build_object(d->>'key',jsonb_build_object('id',reqid,'revision',rev));
    reqs:=reqs||jsonb_build_array(jsonb_build_object('id',reqid,'revision',rev,'rule_id',gen_random_uuid(),'rule_set_id',new_rule,'rule_set_digest',digest,'label',d->'staff_label','applicability','unknown','review_event_id',NULL,'evidence_version_ids','[]'::jsonb,'current_state','unknown','public_next_action','Обратитесь к ответственному сотруднику'));END LOOP;
   source:=public.uc_admission_authority(c.id,a);INSERT INTO public.uc_admission_rule_sets(id,case_id,organization_id,user_id,program_ref,digest,sources,source_snapshots,definitions,reviewer_id,authority_hash,authority_snapshot,review_reason)VALUES(new_rule,c.id,c.organization_id,c.user_id,c.program_ref,digest,p_command->'sources',sources,defs,a,public.uc_program_hash(source),source,reason);
   UPDATE public.uc_admission_cases SET rule_set_id=new_rule,requirements=reqs,reviews=jsonb_build_object('identities',identities,'requirements','{}'::jsonb,'evidence','{}'::jsonb)WHERE id=c.id;
  ELSIF act IN('review_requirement','review_evidence')THEN
   SELECT x INTO q FROM jsonb_array_elements(c.requirements)x WHERE x->>'id'=p_command->>'requirement_id';IF q IS NULL OR(q->>'revision')::bigint<>(p_command->>'expected_requirement_revision')::bigint THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
   IF NOT public.uc_admission_rules_current(c.id)THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
   IF act='review_requirement'THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->'evidence_version_ids')x WHERE NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=(x#>>'{}')::uuid AND e.case_id=c.id AND e.requirement_id=(q->>'id')::uuid AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id)))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
    IF p_command->'exception'<>'null'::jsonb THEN
     IF p_command->>'applicability'<>'applicable'OR p_command->'exception'->>'rule_id'<>q->>'rule_id'OR NOT EXISTS(SELECT 1 FROM public.uc_admission_rule_sets rs,jsonb_array_elements(rs.definitions)AS rule_definition(definition) WHERE rs.id=c.rule_set_id AND rule_definition.definition->>'exception_policy'='local_reasoned_exception'AND c.reviews->'identities'->(rule_definition.definition->>'key')->>'id'=q->>'id')OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->'exception'->'evidence_version_ids')x WHERE NOT p_command->'evidence_version_ids'@>jsonb_build_array(x))THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;END IF;
    SELECT coalesce(jsonb_agg(CASE WHEN x->>'id'=q->>'id'THEN x||jsonb_build_object('applicability',p_command->'applicability','review_event_id',event)ELSE x END),'[]')INTO reqs FROM jsonb_array_elements(c.requirements)x;
    PERFORM public.uc_education_admission_review_check(c.id,(q->>'id')::uuid,p_command->'issuance_evidence',p_command->'evidence_version_ids');
    review:=jsonb_build_object('actor_id',a,'reason',reason,'exception',p_command->'exception','event_id',event,'requirement_revision',q->'revision');
    IF EXISTS(SELECT 1 FROM public.uc_admission_rule_sets rs,jsonb_array_elements(rs.definitions)def WHERE rs.id=c.rule_set_id AND def?'issuance_condition'AND c.reviews->'identities'->(def->>'key')->>'id'=q->>'id')THEN review:=review||jsonb_build_object('issuance_evidence',p_command->'issuance_evidence');END IF;
    UPDATE public.uc_admission_cases SET requirements=reqs,reviews=jsonb_set(reviews,ARRAY['requirements',q->>'id'],review,true)WHERE id=c.id;
   ELSE
    eid:=(p_command->>'evidence_version_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=eid AND e.case_id=c.id AND e.requirement_id=(q->>'id')::uuid AND e.byte_sha256=p_command->>'byte_sha256'AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id))OR public.uc_admission_evidence_dto(eid,a)->>'availability'<>'available'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
    review:=jsonb_build_object('actor_id',a,'reason',reason,'event_id',event,'outcome',p_command->'outcome','requirement_revision',q->'revision');UPDATE public.uc_admission_cases SET reviews=jsonb_set(reviews,ARRAY['evidence',eid::text],review,true)WHERE id=c.id;
   END IF;
  ELSIF act='record_decision'THEN
   PERFORM public.uc_admission_lock_rules((SELECT rs.sources FROM public.uc_admission_rule_sets rs WHERE rs.id=c.rule_set_id));PERFORM public.uc_admission_refresh(c.id);SELECT * INTO c FROM public.uc_admission_cases WHERE id=c.id;
   IF c.rule_set_id IS DISTINCT FROM(p_command->>'rule_set_id')::uuid OR(SELECT rs.digest FROM public.uc_admission_rule_sets rs WHERE rs.id=c.rule_set_id)IS DISTINCT FROM p_command->>'rule_set_digest'OR public.uc_admission_requirements_digest(c.id)IS DISTINCT FROM p_command->>'requirements_digest'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
   IF NOT public.uc_admission_rules_current(c.id)THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
   IF p_command->>'outcome'='admitted'AND(jsonb_array_length(c.requirements)<3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.requirements)x WHERE x->>'applicability'='unknown'OR x->>'current_state'NOT IN('satisfied','exception_recorded')))THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
   SELECT coalesce(jsonb_agg(e.id ORDER BY e.id),'[]')INTO d FROM public.uc_admission_case_evidence e WHERE e.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id);
   IF public.uc_program_hash(d)<>public.uc_program_hash((SELECT coalesce(jsonb_agg(x ORDER BY x),'[]')FROM jsonb_array_elements(p_command->'evidence_version_ids')x))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
   UPDATE public.uc_admission_cases SET decision=jsonb_build_object('event_id',event,'case_revision',revision,'outcome',p_command->'outcome','recorded_at',clock_timestamp(),'responsible_id',a,'reason',reason,'program_ref',program_ref,'rule_set_id',rule_set_id,'requirements_digest',p_command->'requirements_digest','evidence_version_ids',p_command->'evidence_version_ids','authority_snapshot_hash',public.uc_program_hash(jsonb_build_array(a,public.uc_admission_scope(c.id),true)),'later_review_required',false)WHERE id=c.id;
  END IF;
 END IF;
 PERFORM public.uc_admission_refresh(c.id);receipt:=public.uc_admission_event(c.id,a,event,act,p_request_id,payload_digest,reason);
 DELETE FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=ctx AND kind='_context';RETURN public.uc_admission_result(c.id,a,receipt,false);
END;$w2_old_6$;new_body text:=$w2_new_6$
DECLARE a uuid:=auth.uid();act text:=p_command->>'action';c public.uc_admission_cases;prior public.uc_admission_case_requests;scope jsonb;ref jsonb;reqid uuid;ctx uuid;event uuid:=gen_random_uuid();receipt jsonb;payload_digest text;source jsonb;sources jsonb:='[]';defs jsonb;d jsonb;q jsonb;reqs jsonb:='[]';review jsonb;identities jsonb;identity jsonb;new_rule uuid;digest text;reason text;eid uuid;rid uuid;rev bigint;BEGIN
 IF auth.role()IS DISTINCT FROM 'authenticated'OR a IS NULL OR p_request_id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_admission_validate_action(p_command);payload_digest:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'user_id',p_student_user_id,'command',p_command));
 IF act='initialize'THEN scope:=public.uc_admission_association(p_organization_id,p_student_user_id,(p_command->>'group_id')::uuid,(p_command->>'enrollment_id')::uuid);
 ELSE SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_command->>'case_id')::uuid AND organization_id=p_organization_id AND user_id=p_student_user_id;scope:=public.uc_admission_scope(c.id);END IF;
 IF EXISTS(SELECT 1 FROM uc_individual_issuance_private.cases w2 WHERE w2.case_id=c.id)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF scope IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_admission_lock(a,p_organization_id,p_student_user_id,(scope->>'group_id')::uuid,(scope->>'enrollment_id')::uuid,CASE WHEN act='assign_responsible'THEN(p_command->>'responsible_id')::uuid ELSE c.responsible_id END);
 PERFORM pg_advisory_xact_lock(hashtextextended('uc_admission_request:'||a::text||':'||p_request_id::text,0));
 IF act<>'initialize'THEN SELECT * INTO c FROM public.uc_admission_cases WHERE id=(p_command->>'case_id')::uuid;
  IF act IN('review_local_rules','review_requirement','review_evidence','record_decision')AND c.responsible_id IS DISTINCT FROM a THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  IF act='review_local_rules'AND NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  IF act='assign_responsible'AND NOT public.uc_admission_staff_allowed((p_command->>'responsible_id')::uuid,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 END IF;
 SELECT * INTO prior FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id;
 IF prior.actor_id IS NOT NULL THEN IF prior.payload_digest<>payload_digest OR prior.organization_id<>p_organization_id OR prior.user_id<>p_student_user_id OR prior.kind<>act THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;RETURN public.uc_admission_result(prior.case_id,a,prior.receipt,true);END IF;
 IF act='initialize'THEN
  ref:=public.uc_admission_program(p_organization_id,p_student_user_id,(scope->>'group_id')::uuid,(scope->>'enrollment_id')::uuid);IF ref IS NULL THEN PERFORM public.uc_admission_error('PREREQUISITE_MISSING');END IF;
  IF ref IS DISTINCT FROM p_command->'expected_program_ref'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  IF EXISTS(SELECT 1 FROM public.uc_admission_cases WHERE organization_id=p_organization_id AND group_id=(scope->>'group_id')::uuid AND enrollment_id=(scope->>'enrollment_id')::uuid)THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
  INSERT INTO public.uc_admission_cases(organization_id,user_id,group_id,enrollment_id,course_id,program_ref,program_title,program_type,revision)SELECT p_organization_id,p_student_user_id,(scope->>'group_id')::uuid,(scope->>'enrollment_id')::uuid,(scope->>'course_id')::uuid,ref,public.uc_admission_trim(v.facts->>'full_title'),v.facts->>'program_type',1 FROM public.program_fact_versions v WHERE v.id=(ref->>'version_id')::uuid RETURNING * INTO c;
  ctx:=public.uc_admission_context(c.id,a,'mutation');
 ELSE
  SELECT * INTO c FROM public.uc_admission_cases WHERE id=c.id FOR UPDATE;
  IF c.revision<>(p_command->>'expected_revision')::bigint THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
  IF c.revision>=9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
  IF c.program_ref IS DISTINCT FROM p_command->'expected_program_ref'OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  IF act IN('review_local_rules','review_requirement','review_evidence','record_decision')AND c.responsible_id IS DISTINCT FROM a THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  ctx:=public.uc_admission_context(c.id,a,'mutation');
  UPDATE public.uc_admission_cases SET revision=revision+1,updated_at=clock_timestamp()WHERE id=c.id RETURNING * INTO c;
  reason:=coalesce(p_command->>'reason',p_command->>'review_reason');
  IF act='assign_responsible'THEN
   IF NOT public.uc_admission_staff_allowed((p_command->>'responsible_id')::uuid,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
   UPDATE public.uc_admission_cases SET responsible_id=(p_command->>'responsible_id')::uuid WHERE id=c.id;
  ELSIF act='review_local_rules'THEN
   IF NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
   IF jsonb_typeof(p_command->'sources')IS DISTINCT FROM 'array'OR jsonb_array_length(p_command->'sources')NOT BETWEEN 1 AND 3 OR jsonb_typeof(p_command->'requirements')IS DISTINCT FROM 'array'OR jsonb_array_length(p_command->'requirements')NOT BETWEEN 3 AND 50 THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   FOR source IN SELECT x FROM jsonb_array_elements(p_command->'sources')x LOOP
    IF NOT public.uc_admission_shape(source,ARRAY['document_id','version_id','review_id'])OR NOT public.uc_admission_uuid(source->'document_id')OR NOT public.uc_admission_uuid(source->'version_id')OR NOT public.uc_admission_uuid(source->'review_id')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
    PERFORM public.uc_admission_lock_rules(jsonb_build_array(source));d:=public.uc_admission_local_source(c.organization_id,source);IF d IS NULL THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;sources:=sources||jsonb_build_array(d);END LOOP;
   IF(SELECT count(DISTINCT x->>'document_id')FROM jsonb_array_elements(p_command->'sources')x)<>jsonb_array_length(sources)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   defs:=p_command->'requirements';IF(SELECT count(DISTINCT x->>'key')FROM jsonb_array_elements(defs)x)<>jsonb_array_length(defs)OR EXISTS(SELECT 1 FROM unnest(ARRAY['education_basis','application','contract_or_funding'])k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(defs)x WHERE x->>'kind'=k))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   FOR d IN SELECT x FROM jsonb_array_elements(defs)x LOOP
    IF NOT public.uc_education_admission_definition_shape(d,c.program_type)OR coalesce(jsonb_typeof(d->'key')='string'AND d->>'key'~'^[a-z0-9_]{1,64}$'AND d->>'kind'IN('education_basis','application','contract_or_funding','other_reviewed')AND d->>'exception_policy'IN('not_defined','local_reasoned_exception'),false)=false OR NOT public.uc_admission_text(d->'staff_label',160)OR NOT public.uc_admission_text(d->'provision',1000)OR NOT public.uc_admission_ids(d->'source_version_ids',1,3)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'source_version_ids')v WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources)s WHERE s->'version_id'=v))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(defs)def WHERE def?'issuance_condition')AND(SELECT count(*)FROM jsonb_array_elements(defs)def WHERE def->>'kind'='education_basis')<>1 THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
   new_rule:=gen_random_uuid();digest:=public.uc_program_hash(jsonb_build_object('program_ref',c.program_ref,'source_snapshots',sources,'definitions',defs));identities:=coalesce(c.reviews->'identities','{}');
   FOR d IN SELECT x FROM jsonb_array_elements(defs)x LOOP
    identity:=identities->(d->>'key');reqid:=coalesce((identity->>'id')::uuid,gen_random_uuid());rev:=coalesce((identity->>'revision')::bigint,0)+1;
    IF rev>9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;identities:=identities||jsonb_build_object(d->>'key',jsonb_build_object('id',reqid,'revision',rev));
    reqs:=reqs||jsonb_build_array(jsonb_build_object('id',reqid,'revision',rev,'rule_id',gen_random_uuid(),'rule_set_id',new_rule,'rule_set_digest',digest,'label',d->'staff_label','applicability','unknown','review_event_id',NULL,'evidence_version_ids','[]'::jsonb,'current_state','unknown','public_next_action','Обратитесь к ответственному сотруднику'));END LOOP;
   source:=public.uc_admission_authority(c.id,a);INSERT INTO public.uc_admission_rule_sets(id,case_id,organization_id,user_id,program_ref,digest,sources,source_snapshots,definitions,reviewer_id,authority_hash,authority_snapshot,review_reason)VALUES(new_rule,c.id,c.organization_id,c.user_id,c.program_ref,digest,p_command->'sources',sources,defs,a,public.uc_program_hash(source),source,reason);
   UPDATE public.uc_admission_cases SET rule_set_id=new_rule,requirements=reqs,reviews=jsonb_build_object('identities',identities,'requirements','{}'::jsonb,'evidence','{}'::jsonb)WHERE id=c.id;
  ELSIF act IN('review_requirement','review_evidence')THEN
   SELECT x INTO q FROM jsonb_array_elements(c.requirements)x WHERE x->>'id'=p_command->>'requirement_id';IF q IS NULL OR(q->>'revision')::bigint<>(p_command->>'expected_requirement_revision')::bigint THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
   IF NOT public.uc_admission_rules_current(c.id)THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
   IF act='review_requirement'THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->'evidence_version_ids')x WHERE NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=(x#>>'{}')::uuid AND e.case_id=c.id AND e.requirement_id=(q->>'id')::uuid AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id)))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
    IF p_command->'exception'<>'null'::jsonb THEN
     IF p_command->>'applicability'<>'applicable'OR p_command->'exception'->>'rule_id'<>q->>'rule_id'OR NOT EXISTS(SELECT 1 FROM public.uc_admission_rule_sets rs,jsonb_array_elements(rs.definitions)AS rule_definition(definition) WHERE rs.id=c.rule_set_id AND rule_definition.definition->>'exception_policy'='local_reasoned_exception'AND c.reviews->'identities'->(rule_definition.definition->>'key')->>'id'=q->>'id')OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->'exception'->'evidence_version_ids')x WHERE NOT p_command->'evidence_version_ids'@>jsonb_build_array(x))THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;END IF;
    SELECT coalesce(jsonb_agg(CASE WHEN x->>'id'=q->>'id'THEN x||jsonb_build_object('applicability',p_command->'applicability','review_event_id',event)ELSE x END),'[]')INTO reqs FROM jsonb_array_elements(c.requirements)x;
    PERFORM public.uc_education_admission_review_check(c.id,(q->>'id')::uuid,p_command->'issuance_evidence',p_command->'evidence_version_ids');
    review:=jsonb_build_object('actor_id',a,'reason',reason,'exception',p_command->'exception','event_id',event,'requirement_revision',q->'revision');
    IF EXISTS(SELECT 1 FROM public.uc_admission_rule_sets rs,jsonb_array_elements(rs.definitions)def WHERE rs.id=c.rule_set_id AND def?'issuance_condition'AND c.reviews->'identities'->(def->>'key')->>'id'=q->>'id')THEN review:=review||jsonb_build_object('issuance_evidence',p_command->'issuance_evidence');END IF;
    UPDATE public.uc_admission_cases SET requirements=reqs,reviews=jsonb_set(reviews,ARRAY['requirements',q->>'id'],review,true)WHERE id=c.id;
   ELSE
    eid:=(p_command->>'evidence_version_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=eid AND e.case_id=c.id AND e.requirement_id=(q->>'id')::uuid AND e.byte_sha256=p_command->>'byte_sha256'AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id))OR public.uc_admission_evidence_dto(eid,a)->>'availability'<>'available'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
    review:=jsonb_build_object('actor_id',a,'reason',reason,'event_id',event,'outcome',p_command->'outcome','requirement_revision',q->'revision');UPDATE public.uc_admission_cases SET reviews=jsonb_set(reviews,ARRAY['evidence',eid::text],review,true)WHERE id=c.id;
   END IF;
  ELSIF act='record_decision'THEN
   PERFORM public.uc_admission_lock_rules((SELECT rs.sources FROM public.uc_admission_rule_sets rs WHERE rs.id=c.rule_set_id));PERFORM public.uc_admission_refresh(c.id);SELECT * INTO c FROM public.uc_admission_cases WHERE id=c.id;
   IF c.rule_set_id IS DISTINCT FROM(p_command->>'rule_set_id')::uuid OR(SELECT rs.digest FROM public.uc_admission_rule_sets rs WHERE rs.id=c.rule_set_id)IS DISTINCT FROM p_command->>'rule_set_digest'OR public.uc_admission_requirements_digest(c.id)IS DISTINCT FROM p_command->>'requirements_digest'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
   IF NOT public.uc_admission_rules_current(c.id)THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
   IF p_command->>'outcome'='admitted'AND(jsonb_array_length(c.requirements)<3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.requirements)x WHERE x->>'applicability'='unknown'OR x->>'current_state'NOT IN('satisfied','exception_recorded')))THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
   SELECT coalesce(jsonb_agg(e.id ORDER BY e.id),'[]')INTO d FROM public.uc_admission_case_evidence e WHERE e.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id);
   IF public.uc_program_hash(d)<>public.uc_program_hash((SELECT coalesce(jsonb_agg(x ORDER BY x),'[]')FROM jsonb_array_elements(p_command->'evidence_version_ids')x))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
   UPDATE public.uc_admission_cases SET decision=jsonb_build_object('event_id',event,'case_revision',revision,'outcome',p_command->'outcome','recorded_at',clock_timestamp(),'responsible_id',a,'reason',reason,'program_ref',program_ref,'rule_set_id',rule_set_id,'requirements_digest',p_command->'requirements_digest','evidence_version_ids',p_command->'evidence_version_ids','authority_snapshot_hash',public.uc_program_hash(jsonb_build_array(a,public.uc_admission_scope(c.id),true)),'later_review_required',false)WHERE id=c.id;
  END IF;
 END IF;
 PERFORM public.uc_admission_refresh(c.id);receipt:=public.uc_admission_event(c.id,a,event,act,p_request_id,payload_digest,reason);
 DELETE FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=ctx AND kind='_context';RETURN public.uc_admission_result(c.id,a,receipt,false);
END;$w2_new_6$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'7516522496a8713c03ccec72b8f978bb'OR md5(old_body)<>'7516522496a8713c03ccec72b8f978bb'OR md5(new_body)<>'36fbe3023db9157785e9d207336ffd8e'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_6' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_6';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'36fbe3023db9157785e9d207336ffd8e'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_6';END IF;
END;$w2_delta_6$;

DO $w2_delta_7$
DECLARE target oid:=to_regprocedure('public.prepare_admission_case_evidence(uuid,bigint,jsonb,uuid,jsonb)');old_body text:=$w2_old_7$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;prior public.uc_admission_case_requests;r public.uc_admission_evidence_reservations;candidate jsonb;digest text;receipt jsonb;BEGIN
 IF auth.role()IS DISTINCT FROM 'authenticated'OR a IS NULL OR p_request_id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 1 AND 9007199254740991 OR NOT public.uc_admission_ref_valid(p_expected_program_ref)OR NOT public.uc_admission_shape(p_source,CASE p_source->>'kind'WHEN 'upload'THEN ARRAY['kind','requirement_id','supersedes_id','declared_size','declared_mime','declared_sha256']WHEN 'existing'THEN ARRAY['kind','requirement_id','supersedes_id','candidate']ELSE ARRAY[]::text[]END)OR NOT public.uc_admission_uuid(p_source->'requirement_id')OR(p_source->'supersedes_id'<>'null'::jsonb AND NOT public.uc_admission_uuid(p_source->'supersedes_id'))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 IF p_source->>'kind'='upload'THEN
  IF jsonb_typeof(p_source->'declared_size')IS DISTINCT FROM 'number'OR p_source->>'declared_size'!~'^[1-9][0-9]{0,7}$'OR(p_source->>'declared_size')::bigint>20971520 OR coalesce(p_source->>'declared_mime'IN('application/pdf','image/jpeg','image/png'),false)=false OR coalesce(jsonb_typeof(p_source->'declared_sha256')='string'AND p_source->>'declared_sha256'~'^[a-f0-9]{64}$',false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 ELSE
  candidate:=p_source->'candidate';IF NOT public.uc_admission_shape(candidate,ARRAY['kind','id','version_id','fingerprint'])OR NOT public.uc_admission_uuid(candidate->'id')OR(candidate->'version_id'<>'null'::jsonb AND NOT public.uc_admission_uuid(candidate->'version_id'))OR coalesce(candidate->>'kind'IN('identity_document','enrollment_document','contract_artifact','organization_document_version'),false)=false OR coalesce(candidate->>'fingerprint'~'^[a-f0-9]{64}$',false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;IF c.id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_admission_lock(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,c.responsible_id);PERFORM pg_advisory_xact_lock(hashtextextended('uc_admission_request:'||a::text||':'||p_request_id::text,0));
 digest:=public.uc_program_hash(jsonb_build_object('case_id',p_case_id,'expected_revision',p_expected_revision,'expected_program_ref',p_expected_program_ref,'source',p_source));
 SELECT * INTO prior FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id;
 IF prior.actor_id IS NOT NULL THEN IF prior.case_id<>c.id OR prior.kind<>'prepare_evidence'OR prior.payload_digest<>digest THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;RETURN prior.receipt;END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id FOR UPDATE;
 IF c.revision<>p_expected_revision THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;IF c.revision>=9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
 IF c.program_ref IS DISTINCT FROM p_expected_program_ref OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.requirements)x WHERE x->>'id'=p_source->>'requirement_id')THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
 IF p_source->'supersedes_id'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=(p_source->>'supersedes_id')::uuid AND e.case_id=c.id AND e.requirement_id=(p_source->>'requirement_id')::uuid AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF(SELECT count(*)FROM public.uc_admission_evidence_reservations WHERE case_id=c.id AND state IN('prepared','sealed')AND expires_at>clock_timestamp())>=100 OR(jsonb_array_length(public.uc_admission_current_evidence(c.id,a))>=100 AND p_source->'supersedes_id'='null'::jsonb)THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
 IF p_source->>'kind'='existing'THEN candidate:=public.uc_admission_candidate(c.id,candidate->>'kind',(candidate->>'id')::uuid,(candidate->>'version_id')::uuid,a);
 IF candidate IS NULL OR candidate->'candidate'->>'fingerprint'IS DISTINCT FROM p_source->'candidate'->>'fingerprint'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF candidate->'candidate'->>'availability'<>'capturable'THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;END IF;
 INSERT INTO public.uc_admission_evidence_reservations(case_id,organization_id,user_id,actor_id,prepare_request_id,evidence_version_id,requirement_id,supersedes_id,expected_revision,program_ref,source)VALUES(c.id,c.organization_id,c.user_id,a,p_request_id,gen_random_uuid(),(p_source->>'requirement_id')::uuid,(p_source->>'supersedes_id')::uuid,p_expected_revision,c.program_ref,p_source)RETURNING * INTO r;
 receipt:=jsonb_build_object('schema_version',1,'case_id',c.id,'case_revision',c.revision,'reservation_id',r.id,'evidence_version_id',r.evidence_version_id,'expires_at',r.expires_at,'source_kind',p_source->>'kind','upload_slot',CASE WHEN p_source->>'kind'='upload'THEN jsonb_build_object('bucket','admission-case-evidence','path',c.user_id::text||'/'||c.organization_id::text||'/'||c.id::text||'/staging/'||a::text||'/'||r.id::text,'upsert',false,'max_bytes',20971520)END);
 INSERT INTO public.uc_admission_case_requests(actor_id,request_id,case_id,organization_id,user_id,kind,payload_digest,receipt)VALUES(a,p_request_id,c.id,c.organization_id,c.user_id,'prepare_evidence',digest,receipt);RETURN receipt;END;$w2_old_7$;new_body text:=$w2_new_7$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;prior public.uc_admission_case_requests;r public.uc_admission_evidence_reservations;candidate jsonb;digest text;receipt jsonb;BEGIN
 IF EXISTS(SELECT 1 FROM uc_individual_issuance_private.cases w2 WHERE w2.case_id=p_case_id)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;

 IF auth.role()IS DISTINCT FROM 'authenticated'OR a IS NULL OR p_request_id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 1 AND 9007199254740991 OR NOT public.uc_admission_ref_valid(p_expected_program_ref)OR NOT public.uc_admission_shape(p_source,CASE p_source->>'kind'WHEN 'upload'THEN ARRAY['kind','requirement_id','supersedes_id','declared_size','declared_mime','declared_sha256']WHEN 'existing'THEN ARRAY['kind','requirement_id','supersedes_id','candidate']ELSE ARRAY[]::text[]END)OR NOT public.uc_admission_uuid(p_source->'requirement_id')OR(p_source->'supersedes_id'<>'null'::jsonb AND NOT public.uc_admission_uuid(p_source->'supersedes_id'))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 IF p_source->>'kind'='upload'THEN
  IF jsonb_typeof(p_source->'declared_size')IS DISTINCT FROM 'number'OR p_source->>'declared_size'!~'^[1-9][0-9]{0,7}$'OR(p_source->>'declared_size')::bigint>20971520 OR coalesce(p_source->>'declared_mime'IN('application/pdf','image/jpeg','image/png'),false)=false OR coalesce(jsonb_typeof(p_source->'declared_sha256')='string'AND p_source->>'declared_sha256'~'^[a-f0-9]{64}$',false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 ELSE
  candidate:=p_source->'candidate';IF NOT public.uc_admission_shape(candidate,ARRAY['kind','id','version_id','fingerprint'])OR NOT public.uc_admission_uuid(candidate->'id')OR(candidate->'version_id'<>'null'::jsonb AND NOT public.uc_admission_uuid(candidate->'version_id'))OR coalesce(candidate->>'kind'IN('identity_document','enrollment_document','contract_artifact','organization_document_version'),false)=false OR coalesce(candidate->>'fingerprint'~'^[a-f0-9]{64}$',false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;IF c.id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_admission_lock(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,c.responsible_id);PERFORM pg_advisory_xact_lock(hashtextextended('uc_admission_request:'||a::text||':'||p_request_id::text,0));
 digest:=public.uc_program_hash(jsonb_build_object('case_id',p_case_id,'expected_revision',p_expected_revision,'expected_program_ref',p_expected_program_ref,'source',p_source));
 SELECT * INTO prior FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id;
 IF prior.actor_id IS NOT NULL THEN IF prior.case_id<>c.id OR prior.kind<>'prepare_evidence'OR prior.payload_digest<>digest THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;RETURN prior.receipt;END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id FOR UPDATE;
 IF c.revision<>p_expected_revision THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;IF c.revision>=9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
 IF c.program_ref IS DISTINCT FROM p_expected_program_ref OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.requirements)x WHERE x->>'id'=p_source->>'requirement_id')THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;
 IF p_source->'supersedes_id'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=(p_source->>'supersedes_id')::uuid AND e.case_id=c.id AND e.requirement_id=(p_source->>'requirement_id')::uuid AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF(SELECT count(*)FROM public.uc_admission_evidence_reservations WHERE case_id=c.id AND state IN('prepared','sealed')AND expires_at>clock_timestamp())>=100 OR(jsonb_array_length(public.uc_admission_current_evidence(c.id,a))>=100 AND p_source->'supersedes_id'='null'::jsonb)THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
 IF p_source->>'kind'='existing'THEN candidate:=public.uc_admission_candidate(c.id,candidate->>'kind',(candidate->>'id')::uuid,(candidate->>'version_id')::uuid,a);
 IF candidate IS NULL OR candidate->'candidate'->>'fingerprint'IS DISTINCT FROM p_source->'candidate'->>'fingerprint'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF candidate->'candidate'->>'availability'<>'capturable'THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;END IF;
 INSERT INTO public.uc_admission_evidence_reservations(case_id,organization_id,user_id,actor_id,prepare_request_id,evidence_version_id,requirement_id,supersedes_id,expected_revision,program_ref,source)VALUES(c.id,c.organization_id,c.user_id,a,p_request_id,gen_random_uuid(),(p_source->>'requirement_id')::uuid,(p_source->>'supersedes_id')::uuid,p_expected_revision,c.program_ref,p_source)RETURNING * INTO r;
 receipt:=jsonb_build_object('schema_version',1,'case_id',c.id,'case_revision',c.revision,'reservation_id',r.id,'evidence_version_id',r.evidence_version_id,'expires_at',r.expires_at,'source_kind',p_source->>'kind','upload_slot',CASE WHEN p_source->>'kind'='upload'THEN jsonb_build_object('bucket','admission-case-evidence','path',c.user_id::text||'/'||c.organization_id::text||'/'||c.id::text||'/staging/'||a::text||'/'||r.id::text,'upsert',false,'max_bytes',20971520)END);
 INSERT INTO public.uc_admission_case_requests(actor_id,request_id,case_id,organization_id,user_id,kind,payload_digest,receipt)VALUES(a,p_request_id,c.id,c.organization_id,c.user_id,'prepare_evidence',digest,receipt);RETURN receipt;END;$w2_new_7$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'584fc0447a9cc9529c4d61425d46be21'OR md5(old_body)<>'584fc0447a9cc9529c4d61425d46be21'OR md5(new_body)<>'96ab6628e4ff7f9c16b9435ec277753f'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_7' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_7';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'96ab6628e4ff7f9c16b9435ec277753f'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_7';END IF;
END;$w2_delta_7$;

DO $w2_delta_8$
DECLARE target oid:=to_regprocedure('public.uc_admission_evidence_context(uuid,uuid,bigint,uuid)');old_body text:=$w2_old_8$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;r public.uc_admission_evidence_reservations;src jsonb;sealed jsonb;prior public.uc_admission_case_requests;replay jsonb;digest text;BEGIN
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;SELECT * INTO r FROM public.uc_admission_evidence_reservations WHERE id=p_reservation_id AND case_id=c.id AND actor_id=a;
 IF auth.role()IS DISTINCT FROM 'authenticated'OR a IS NULL OR r.id IS NULL OR p_request_id IS NULL OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,true)OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF p_expected_revision IS DISTINCT FROM r.expected_revision THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
 digest:=public.uc_program_hash(jsonb_build_object('case_id',c.id,'reservation_id',r.id,'expected_revision',p_expected_revision));
 sealed:=coalesce(r.sealed_proof,jsonb_build_object('bucket','admission-case-evidence','path',r.user_id::text||'/'||r.organization_id::text||'/'||r.case_id::text||'/sealed/'||r.evidence_version_id::text,'object_id',NULL,'updated_at',NULL,'byte_sha256',NULL,'byte_size',NULL,'mime_type',NULL));
 IF r.state='consumed'THEN
  SELECT * INTO prior FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id AND case_id=c.id AND kind='evidence_committed'AND payload_digest=digest;
  IF prior.actor_id IS NULL OR r.commit_request_id IS DISTINCT FROM p_request_id THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
  src:=public.uc_admission_object('admission-case-evidence',sealed->>'path',sealed->>'byte_sha256');IF src IS NULL OR src->>'object_id'IS DISTINCT FROM sealed->>'object_id'OR(src->>'updated_at')::timestamptz IS DISTINCT FROM(sealed->>'updated_at')::timestamptz OR src->>'byte_size'IS DISTINCT FROM sealed->>'byte_size'OR src->>'mime_type'IS DISTINCT FROM sealed->>'mime_type'THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
  replay:=public.uc_admission_result(c.id,a,prior.receipt,true);
 ELSE
  IF r.state NOT IN('prepared','sealed')OR r.expires_at<=clock_timestamp()THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
  IF c.revision<>p_expected_revision THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;IF c.revision>=9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
  IF c.program_ref IS DISTINCT FROM r.program_ref OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  src:=public.uc_admission_source_proof(r.id,a);IF src IS NULL THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  IF r.state='sealed'THEN
   IF r.commit_request_id IS DISTINCT FROM p_request_id OR src IS DISTINCT FROM r.source_proof THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
   prior.receipt:=public.uc_admission_object('admission-case-evidence',sealed->>'path',sealed->>'byte_sha256');IF prior.receipt IS NULL OR prior.receipt->>'object_id'IS DISTINCT FROM sealed->>'object_id'OR(prior.receipt->>'updated_at')::timestamptz IS DISTINCT FROM(sealed->>'updated_at')::timestamptz OR prior.receipt->>'byte_size'IS DISTINCT FROM sealed->>'byte_size'OR prior.receipt->>'mime_type'IS DISTINCT FROM sealed->>'mime_type'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('schema_version',1,'mode',r.state,'actor_id',a,'scope',public.uc_admission_scope(c.id),'case_id',c.id,'case_revision',c.revision,'expected_revision',r.expected_revision,'reservation_id',r.id,'evidence_version_id',r.evidence_version_id,'requirement_id',r.requirement_id,'supersedes_id',r.supersedes_id,'request_id',p_request_id,'expires_at',r.expires_at,'source_kind',r.source->>'kind','source',src,'sealed',sealed,'replay_result',replay);
END;$w2_old_8$;new_body text:=$w2_new_8$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;r public.uc_admission_evidence_reservations;src jsonb;sealed jsonb;prior public.uc_admission_case_requests;replay jsonb;digest text;BEGIN
 IF EXISTS(SELECT 1 FROM uc_individual_issuance_private.cases w2 WHERE w2.case_id=p_case_id)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;

 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;SELECT * INTO r FROM public.uc_admission_evidence_reservations WHERE id=p_reservation_id AND case_id=c.id AND actor_id=a;
 IF auth.role()IS DISTINCT FROM 'authenticated'OR a IS NULL OR r.id IS NULL OR p_request_id IS NULL OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,true)OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF p_expected_revision IS DISTINCT FROM r.expected_revision THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
 digest:=public.uc_program_hash(jsonb_build_object('case_id',c.id,'reservation_id',r.id,'expected_revision',p_expected_revision));
 sealed:=coalesce(r.sealed_proof,jsonb_build_object('bucket','admission-case-evidence','path',r.user_id::text||'/'||r.organization_id::text||'/'||r.case_id::text||'/sealed/'||r.evidence_version_id::text,'object_id',NULL,'updated_at',NULL,'byte_sha256',NULL,'byte_size',NULL,'mime_type',NULL));
 IF r.state='consumed'THEN
  SELECT * INTO prior FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id AND case_id=c.id AND kind='evidence_committed'AND payload_digest=digest;
  IF prior.actor_id IS NULL OR r.commit_request_id IS DISTINCT FROM p_request_id THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
  src:=public.uc_admission_object('admission-case-evidence',sealed->>'path',sealed->>'byte_sha256');IF src IS NULL OR src->>'object_id'IS DISTINCT FROM sealed->>'object_id'OR(src->>'updated_at')::timestamptz IS DISTINCT FROM(sealed->>'updated_at')::timestamptz OR src->>'byte_size'IS DISTINCT FROM sealed->>'byte_size'OR src->>'mime_type'IS DISTINCT FROM sealed->>'mime_type'THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
  replay:=public.uc_admission_result(c.id,a,prior.receipt,true);
 ELSE
  IF r.state NOT IN('prepared','sealed')OR r.expires_at<=clock_timestamp()THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
  IF c.revision<>p_expected_revision THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;IF c.revision>=9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
  IF c.program_ref IS DISTINCT FROM r.program_ref OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  src:=public.uc_admission_source_proof(r.id,a);IF src IS NULL THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  IF r.state='sealed'THEN
   IF r.commit_request_id IS DISTINCT FROM p_request_id OR src IS DISTINCT FROM r.source_proof THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
   prior.receipt:=public.uc_admission_object('admission-case-evidence',sealed->>'path',sealed->>'byte_sha256');IF prior.receipt IS NULL OR prior.receipt->>'object_id'IS DISTINCT FROM sealed->>'object_id'OR(prior.receipt->>'updated_at')::timestamptz IS DISTINCT FROM(sealed->>'updated_at')::timestamptz OR prior.receipt->>'byte_size'IS DISTINCT FROM sealed->>'byte_size'OR prior.receipt->>'mime_type'IS DISTINCT FROM sealed->>'mime_type'THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('schema_version',1,'mode',r.state,'actor_id',a,'scope',public.uc_admission_scope(c.id),'case_id',c.id,'case_revision',c.revision,'expected_revision',r.expected_revision,'reservation_id',r.id,'evidence_version_id',r.evidence_version_id,'requirement_id',r.requirement_id,'supersedes_id',r.supersedes_id,'request_id',p_request_id,'expires_at',r.expires_at,'source_kind',r.source->>'kind','source',src,'sealed',sealed,'replay_result',replay);
END;$w2_new_8$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'eb01f1c109788fc65c070eacb0f2aeca'OR md5(old_body)<>'eb01f1c109788fc65c070eacb0f2aeca'OR md5(new_body)<>'cb2842b4cc886d8796a9022cdc67cf04'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_8' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_8';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'cb2842b4cc886d8796a9022cdc67cf04'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_8';END IF;
END;$w2_delta_8$;

DO $w2_delta_9$
DECLARE target oid:=to_regprocedure('public.uc_finalize_admission_case_evidence(uuid,uuid,bigint,uuid)');old_body text:=$w2_old_9$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;r public.uc_admission_evidence_reservations;context jsonb;ctx uuid;event uuid:=gen_random_uuid();digest text;receipt jsonb;BEGIN
 context:=public.uc_admission_evidence_context(p_case_id,p_reservation_id,p_expected_revision,p_request_id);
 IF context->>'mode'='consumed'THEN RETURN context->'replay_result';END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;PERFORM public.uc_admission_lock(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,c.responsible_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('uc_admission_request:'||a::text||':'||p_request_id::text,0));SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id FOR UPDATE;SELECT * INTO r FROM public.uc_admission_evidence_reservations WHERE id=p_reservation_id FOR UPDATE;
 context:=public.uc_admission_evidence_context(p_case_id,p_reservation_id,p_expected_revision,p_request_id);IF context->>'mode'='consumed'THEN RETURN context->'replay_result';END IF;
 IF r.state<>'sealed'THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;PERFORM public.uc_admission_lock_source(r.id);
 context:=public.uc_admission_evidence_context(p_case_id,p_reservation_id,p_expected_revision,p_request_id);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.requirements)x WHERE x->>'id'=r.requirement_id::text)OR(r.supersedes_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=r.supersedes_id AND e.case_id=c.id AND e.requirement_id=r.requirement_id AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id)))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id)THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
 ctx:=public.uc_admission_context(c.id,a,'mutation');
 INSERT INTO public.uc_admission_case_evidence(id,case_id,organization_id,user_id,requirement_id,case_revision_created,supersedes_id,source_kind,source_snapshot,participant_ids,captured_by,byte_sha256,byte_size,mime_type,storage_object_id,object_updated_at,sealed_path,event_id)VALUES(r.evidence_version_id,c.id,c.organization_id,c.user_id,r.requirement_id,c.revision+1,r.supersedes_id,CASE WHEN r.source->>'kind'='upload'THEN 'upload'ELSE r.source->'candidate'->>'kind'END,jsonb_build_object('declaration',r.source,'proof',r.source_proof),ARRAY[c.user_id],a,r.sealed_proof->>'byte_sha256',(r.sealed_proof->>'byte_size')::bigint,r.sealed_proof->>'mime_type',(r.sealed_proof->>'object_id')::uuid,(r.sealed_proof->>'updated_at')::timestamptz,r.sealed_proof->>'path',event);
 UPDATE public.uc_admission_cases SET revision=revision+1,updated_at=clock_timestamp()WHERE id=c.id;UPDATE public.uc_admission_evidence_reservations SET state='consumed'WHERE id=r.id;PERFORM public.uc_admission_refresh(c.id);
 digest:=public.uc_program_hash(jsonb_build_object('case_id',c.id,'reservation_id',r.id,'expected_revision',p_expected_revision));receipt:=public.uc_admission_event(c.id,a,event,'evidence_committed',p_request_id,digest,NULL);
 DELETE FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=ctx AND kind='_context';RETURN public.uc_admission_result(c.id,a,receipt,false);END;$w2_old_9$;new_body text:=$w2_new_9$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;r public.uc_admission_evidence_reservations;context jsonb;ctx uuid;event uuid:=gen_random_uuid();digest text;receipt jsonb;BEGIN
 IF EXISTS(SELECT 1 FROM uc_individual_issuance_private.cases w2 WHERE w2.case_id=p_case_id)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;

 context:=public.uc_admission_evidence_context(p_case_id,p_reservation_id,p_expected_revision,p_request_id);
 IF context->>'mode'='consumed'THEN RETURN context->'replay_result';END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;PERFORM public.uc_admission_lock(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,c.responsible_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('uc_admission_request:'||a::text||':'||p_request_id::text,0));SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id FOR UPDATE;SELECT * INTO r FROM public.uc_admission_evidence_reservations WHERE id=p_reservation_id FOR UPDATE;
 context:=public.uc_admission_evidence_context(p_case_id,p_reservation_id,p_expected_revision,p_request_id);IF context->>'mode'='consumed'THEN RETURN context->'replay_result';END IF;
 IF r.state<>'sealed'THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;PERFORM public.uc_admission_lock_source(r.id);
 context:=public.uc_admission_evidence_context(p_case_id,p_reservation_id,p_expected_revision,p_request_id);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.requirements)x WHERE x->>'id'=r.requirement_id::text)OR(r.supersedes_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=r.supersedes_id AND e.case_id=c.id AND e.requirement_id=r.requirement_id AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id)))THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=p_request_id)THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
 ctx:=public.uc_admission_context(c.id,a,'mutation');
 INSERT INTO public.uc_admission_case_evidence(id,case_id,organization_id,user_id,requirement_id,case_revision_created,supersedes_id,source_kind,source_snapshot,participant_ids,captured_by,byte_sha256,byte_size,mime_type,storage_object_id,object_updated_at,sealed_path,event_id)VALUES(r.evidence_version_id,c.id,c.organization_id,c.user_id,r.requirement_id,c.revision+1,r.supersedes_id,CASE WHEN r.source->>'kind'='upload'THEN 'upload'ELSE r.source->'candidate'->>'kind'END,jsonb_build_object('declaration',r.source,'proof',r.source_proof),ARRAY[c.user_id],a,r.sealed_proof->>'byte_sha256',(r.sealed_proof->>'byte_size')::bigint,r.sealed_proof->>'mime_type',(r.sealed_proof->>'object_id')::uuid,(r.sealed_proof->>'updated_at')::timestamptz,r.sealed_proof->>'path',event);
 UPDATE public.uc_admission_cases SET revision=revision+1,updated_at=clock_timestamp()WHERE id=c.id;UPDATE public.uc_admission_evidence_reservations SET state='consumed'WHERE id=r.id;PERFORM public.uc_admission_refresh(c.id);
 digest:=public.uc_program_hash(jsonb_build_object('case_id',c.id,'reservation_id',r.id,'expected_revision',p_expected_revision));receipt:=public.uc_admission_event(c.id,a,event,'evidence_committed',p_request_id,digest,NULL);
 DELETE FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=ctx AND kind='_context';RETURN public.uc_admission_result(c.id,a,receipt,false);END;$w2_new_9$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'96e6b861575a36d4070312f8a18ef58d'OR md5(old_body)<>'96e6b861575a36d4070312f8a18ef58d'OR md5(new_body)<>'1c84e8e11ff7abd0e6fe3be8fa77bc74'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_9' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_9';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'1c84e8e11ff7abd0e6fe3be8fa77bc74'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_9';END IF;
END;$w2_delta_9$;

DO $w2_delta_10$
DECLARE target oid:=to_regprocedure('public.uc_admission_evidence_file_context(uuid,uuid)');old_body text:=$w2_old_10$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;e public.uc_admission_case_evidence;o jsonb;BEGIN SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;
 IF auth.role()IS DISTINCT FROM 'authenticated'OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 SELECT * INTO e FROM public.uc_admission_case_evidence WHERE id=p_evidence_version_id AND case_id=c.id;
 o:=public.uc_admission_object('admission-case-evidence',e.sealed_path,e.byte_sha256);IF e.id IS NULL OR o IS NULL OR(o->>'object_id')::uuid IS DISTINCT FROM e.storage_object_id OR(o->>'updated_at')::timestamptz IS DISTINCT FROM e.object_updated_at OR(o->>'byte_size')::bigint IS DISTINCT FROM e.byte_size OR o->>'mime_type'IS DISTINCT FROM e.mime_type THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
 RETURN jsonb_build_object('schema_version',1,'actor_id',a,'scope',public.uc_admission_scope(c.id),'case_id',c.id,'case_revision',c.revision,'evidence_version_id',e.id,'object',o,'byte_sha256',e.byte_sha256,'byte_size',e.byte_size,'mime_type',e.mime_type);END;$w2_old_10$;new_body text:=$w2_new_10$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;e public.uc_admission_case_evidence;o jsonb;BEGIN
 IF EXISTS(SELECT 1 FROM uc_individual_issuance_private.cases w2 WHERE w2.case_id=p_case_id)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;
 IF auth.role()IS DISTINCT FROM 'authenticated'OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 SELECT * INTO e FROM public.uc_admission_case_evidence WHERE id=p_evidence_version_id AND case_id=c.id;
 o:=public.uc_admission_object('admission-case-evidence',e.sealed_path,e.byte_sha256);IF e.id IS NULL OR o IS NULL OR(o->>'object_id')::uuid IS DISTINCT FROM e.storage_object_id OR(o->>'updated_at')::timestamptz IS DISTINCT FROM e.object_updated_at OR(o->>'byte_size')::bigint IS DISTINCT FROM e.byte_size OR o->>'mime_type'IS DISTINCT FROM e.mime_type THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
 RETURN jsonb_build_object('schema_version',1,'actor_id',a,'scope',public.uc_admission_scope(c.id),'case_id',c.id,'case_revision',c.revision,'evidence_version_id',e.id,'object',o,'byte_sha256',e.byte_sha256,'byte_size',e.byte_size,'mime_type',e.mime_type);END;$w2_new_10$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'165a808a8389dcd656de3f4269aadb12'OR md5(old_body)<>'165a808a8389dcd656de3f4269aadb12'OR md5(new_body)<>'fc719e8cb980fbb56503a77aa78a853f'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_10' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_10';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'fc719e8cb980fbb56503a77aa78a853f'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_10';END IF;
END;$w2_delta_10$;

DO $w2_delta_11$
DECLARE target oid:=to_regprocedure('public.uc_education_preparation_access(uuid,boolean,uuid)');old_body text:=$w2_old_11$
DECLARE prep public.uc_education_issuance_preparations;i public.uc_education_issuance_preparation_items;g uuid;c jsonb;r jsonb;identity jsonb;vars jsonb;frdo jsonb;correct boolean;BEGIN
 SELECT *INTO prep FROM public.uc_education_issuance_preparations WHERE id=p_preparation AND actor_id=auth.uid()AND NOT redacted;
 IF prep.id IS NULL OR NOT public.uc_education_issue_actor()THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;g:=public.uc_education_issue_scope(prep.organization_id,prep.scope);
 IF NOT coalesce((public.uc_document_registry_caps(prep.organization_id,g)->>'can_register')::boolean,false)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_source(prep.organization_id,prep.template->'source',true);
 FOR i IN SELECT *FROM public.uc_education_issuance_preparation_items WHERE preparation_id=prep.id AND(p_item IS NULL OR id=p_item)ORDER BY id LOOP
 IF i.redacted OR i.user_id IS NULL OR NOT public.uc_education_artifact_actor(prep.actor_id,i.organization_id,i.group_id,i.user_id,i.enrollment_id)OR NOT public.uc_education_issue_proof_visible(i.eligibility_ref)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_fence(i.organization_id,i.group_id,ARRAY[i.user_id,prep.actor_id]);
 IF i.artifact IS NOT NULL THEN PERFORM public.uc_education_issue_source(i.organization_id,i.artifact->'source',true);END IF;
 IF p_fresh AND i.final_record_id IS NULL THEN
 IF NOT public.uc_education_template_current(prep.organization_id,prep.template,prep.template_storage)THEN PERFORM public.uc_education_issue_error('ARTIFACT_REVIEW_REQUIRED');END IF;
 IF public.uc_education_number_witness(prep.organization_id,(i.number_plan->>'issue_date')::date)IS DISTINCT FROM prep.number_witness THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;
 correct:=prep.kind='duplicate'AND prep.plan->'change'->'basis'->>'kind'='correction_replacement';
 IF prep.kind='original'THEN c:=public.uc_education_issue_candidate(i.organization_id,g,i.enrollment_id,false);IF c IS NULL OR c->'eligibility_ref'IS DISTINCT FROM i.eligibility_ref THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 ELSE r:=public.uc_education_issue_record(i.organization_id,g,(prep.plan->'change'->>'record_id')::uuid);IF r IS NULL OR r->'revision'IS DISTINCT FROM prep.plan->'change'->'expected_revision'OR r->>'state_hash'IS DISTINCT FROM prep.plan->'change'->>'expected_state_hash'OR r->'capabilities'->'can_issue_duplicate'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 identity:=public.uc_education_replacement_identity((prep.plan->'change'->>'record_id')::uuid,correct);IF identity IS DISTINCT FROM i.official_identity THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;END IF;
 vars:=public.uc_education_render_variables(i.organization_id,i.official_identity,i.source_snapshot->'program_snapshot'->'facts',i.number_plan,i.eligibility_ref,i.frdo_facts->>'document_type');
 IF vars IS DISTINCT FROM i.render_variables THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 IF prep.kind='original'OR correct THEN frdo:=public.uc_education_frdo_snapshot(i.organization_id,i.user_id,i.source_snapshot->'program_snapshot'->'facts',i.number_plan,i.frdo_facts->>'document_type',CASE WHEN correct THEN i.frdo_facts END,correct);IF frdo IS DISTINCT FROM i.frdo_facts THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;END IF;
 END IF;END LOOP;
 IF p_item IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_preparation_items x WHERE x.id=p_item AND x.preparation_id=prep.id)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;RETURN prep;END;$w2_old_11$;new_body text:=$w2_new_11$
DECLARE prep public.uc_education_issuance_preparations;i public.uc_education_issuance_preparation_items;g uuid;c jsonb;r jsonb;identity jsonb;vars jsonb;frdo jsonb;correct boolean;BEGIN
 IF EXISTS(SELECT 1 FROM uc_individual_issuance_private.items w2 WHERE w2.preparation_id=p_preparation)THEN RETURN uc_individual_issuance_private.preparation_access(p_preparation,p_fresh,p_item);END IF;
 SELECT *INTO prep FROM public.uc_education_issuance_preparations WHERE id=p_preparation AND actor_id=auth.uid()AND NOT redacted;
 IF prep.id IS NULL OR NOT public.uc_education_issue_actor()THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;g:=public.uc_education_issue_scope(prep.organization_id,prep.scope);
 IF NOT coalesce((public.uc_document_registry_caps(prep.organization_id,g)->>'can_register')::boolean,false)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_source(prep.organization_id,prep.template->'source',true);
 FOR i IN SELECT *FROM public.uc_education_issuance_preparation_items WHERE preparation_id=prep.id AND(p_item IS NULL OR id=p_item)ORDER BY id LOOP
 IF i.redacted OR i.user_id IS NULL OR NOT public.uc_education_artifact_actor(prep.actor_id,i.organization_id,i.group_id,i.user_id,i.enrollment_id)OR NOT public.uc_education_issue_proof_visible(i.eligibility_ref)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_fence(i.organization_id,i.group_id,ARRAY[i.user_id,prep.actor_id]);
 IF i.artifact IS NOT NULL THEN PERFORM public.uc_education_issue_source(i.organization_id,i.artifact->'source',true);END IF;
 IF p_fresh AND i.final_record_id IS NULL THEN
 IF NOT public.uc_education_template_current(prep.organization_id,prep.template,prep.template_storage)THEN PERFORM public.uc_education_issue_error('ARTIFACT_REVIEW_REQUIRED');END IF;
 IF public.uc_education_number_witness(prep.organization_id,(i.number_plan->>'issue_date')::date)IS DISTINCT FROM prep.number_witness THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;
 correct:=prep.kind='duplicate'AND prep.plan->'change'->'basis'->>'kind'='correction_replacement';
 IF prep.kind='original'THEN c:=public.uc_education_issue_candidate(i.organization_id,g,i.enrollment_id,false);IF c IS NULL OR c->'eligibility_ref'IS DISTINCT FROM i.eligibility_ref THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 ELSE r:=public.uc_education_issue_record(i.organization_id,g,(prep.plan->'change'->>'record_id')::uuid);IF r IS NULL OR r->'revision'IS DISTINCT FROM prep.plan->'change'->'expected_revision'OR r->>'state_hash'IS DISTINCT FROM prep.plan->'change'->>'expected_state_hash'OR r->'capabilities'->'can_issue_duplicate'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 identity:=public.uc_education_replacement_identity((prep.plan->'change'->>'record_id')::uuid,correct);IF identity IS DISTINCT FROM i.official_identity THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;END IF;
 vars:=public.uc_education_render_variables(i.organization_id,i.official_identity,i.source_snapshot->'program_snapshot'->'facts',i.number_plan,i.eligibility_ref,i.frdo_facts->>'document_type');
 IF vars IS DISTINCT FROM i.render_variables THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 IF prep.kind='original'OR correct THEN frdo:=public.uc_education_frdo_snapshot(i.organization_id,i.user_id,i.source_snapshot->'program_snapshot'->'facts',i.number_plan,i.frdo_facts->>'document_type',CASE WHEN correct THEN i.frdo_facts END,correct);IF frdo IS DISTINCT FROM i.frdo_facts THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;END IF;
 END IF;END LOOP;
 IF p_item IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_preparation_items x WHERE x.id=p_item AND x.preparation_id=prep.id)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;RETURN prep;END;$w2_new_11$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'f1c6860d9c167200f8a61206820d7d63'OR md5(old_body)<>'f1c6860d9c167200f8a61206820d7d63'OR md5(new_body)<>'1dd8a47bdac5e87dd908be97eeb0de54'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_11' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_11';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'1dd8a47bdac5e87dd908be97eeb0de54'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_11';END IF;
END;$w2_delta_11$;

DO $w2_delta_12$
DECLARE target oid:=to_regprocedure('public.uc_education_artifact_live(uuid,uuid,uuid,bigint,boolean)');old_body text:=$w2_old_12$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;c public.uc_admission_cases;s public.uc_learning_outcome_states;m public.uc_learning_machine_results;d public.uc_learning_attestation_decisions;proof jsonb;a jsonb;e jsonb;dto jsonb;identity jsonb;facts jsonb;correct boolean;BEGIN
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item AND preparation_id=p_preparation AND input_revision=p_revision AND NOT redacted;
 SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=p_preparation AND actor_id=p_actor AND NOT redacted;
 IF i.id IS NULL OR p.id IS NULL OR i.organization_id<>p.organization_id OR i.user_id IS NULL OR NOT public.uc_education_artifact_actor(p_actor,i.organization_id,i.group_id,i.user_id,i.enrollment_id)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_fence(i.organization_id,i.group_id,ARRAY[p_actor,i.user_id]);proof:=i.eligibility_ref;a:=proof->'admission_ref';
 SELECT *INTO c FROM public.uc_admission_cases WHERE id=(a->>'case_id')::uuid AND organization_id=i.organization_id AND user_id=i.user_id AND group_id=i.group_id AND enrollment_id=i.enrollment_id;
 IF c.id IS NULL THEN PERFORM public.uc_education_issue_error('SOURCE_UNAVAILABLE');END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(a->'evidence_refs')LOOP dto:=public.uc_admission_evidence_dto((e->>'evidence_id')::uuid,p_actor);IF dto IS NULL OR dto->>'case_id'IS DISTINCT FROM c.id::text OR dto->'can_read_bytes'IS DISTINCT FROM'true'::jsonb OR dto->>'availability'IS DISTINCT FROM'available'OR dto->'byte_sha256'IS DISTINCT FROM e->'byte_sha256'OR dto->'byte_size'IS DISTINCT FROM e->'byte_size'THEN PERFORM public.uc_education_issue_error('SOURCE_UNAVAILABLE');END IF;END LOOP;
 IF p_fresh AND i.final_record_id IS NULL THEN
 IF NOT public.uc_education_template_current(p.organization_id,p.template,p.template_storage)THEN PERFORM public.uc_education_issue_error('ARTIFACT_REVIEW_REQUIRED');END IF;
 IF public.uc_education_number_witness(i.organization_id,(i.number_plan->>'issue_date')::date)IS DISTINCT FROM p.number_witness THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;
 IF p.kind='original'THEN
 IF public.uc_enrollment_is_withdrawn(i.enrollment_id)OR public.uc_admission_program(i.organization_id,i.user_id,i.group_id,i.enrollment_id)IS DISTINCT FROM proof->'program_ref'OR c.revision<>(a->>'revision')::bigint OR c.decision->'event_id'IS DISTINCT FROM a->'decision_event_id'OR c.decision->>'outcome'IS DISTINCT FROM'admitted'OR c.decision->'later_review_required'IS DISTINCT FROM'false'::jsonb OR NOT public.uc_admission_rules_current(c.id)OR public.uc_admission_requirements_digest(c.id)IS DISTINCT FROM a->>'requirements_digest'THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 SELECT *INTO s FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=(proof->'program_ref'->>'enrollment_snapshot_id')::uuid AND organization_id=i.organization_id AND enrollment_id=i.enrollment_id;
 SELECT *INTO m FROM public.uc_learning_machine_results WHERE id=s.machine_id AND state_id=s.id;SELECT *INTO d FROM public.uc_learning_attestation_decisions WHERE id=s.decision_id AND state_id=s.id;
 IF s.id IS NULL OR m.id IS NULL OR d.id IS NULL OR s.revision<>(proof->'outcome_ref'->>'revision')::bigint OR s.machine_id IS DISTINCT FROM(proof->'outcome_ref'->>'machine_result_id')::uuid OR s.decision_id IS DISTINCT FROM(proof->'outcome_ref'->>'decision_id')::uuid OR d.redacted OR d.outcome<>'passed'OR d.machine_result_id IS DISTINCT FROM m.id OR m.input_hash IS DISTINCT FROM public.uc_learning_evaluate(s)->>'input_hash'OR(d.basis='machine'AND m.evaluation->>'eligibility'<>'eligible')OR(d.basis='recognition'AND d.source_proof->'recognition_proof'IS DISTINCT FROM public.uc_learning_recognition_proof(i.organization_id,(d.source_proof->>'recognition_file_version_id')::uuid))THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 SELECT jsonb_build_object('user_id',pr.user_id,'full_name',btrim(pr.full_name),'birth_date',f.birth_date,'registration_hash',proof->'identity_ref'->'registration_hash','source','current_student_registration')INTO identity FROM public.profiles pr JOIN public.student_frdo_data f ON f.user_id=pr.user_id AND f.organization_id=pr.organization_id WHERE pr.user_id=i.user_id AND pr.organization_id=i.organization_id;
 IF identity IS DISTINCT FROM i.official_identity THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.education_document_records r JOIN public.uc_education_issuance_states x ON x.record_id=r.id WHERE r.id=(p.plan->'change'->>'record_id')::uuid AND r.organization_id=i.organization_id AND r.user_id=i.user_id AND r.enrollment_id=i.enrollment_id AND r.document_status='original'AND r.deleted_at IS NULL AND x.revision=(p.plan->'change'->>'expected_revision')::bigint AND x.annulment IS NULL AND NOT x.redacted AND public.uc_education_issue_state_hash(r.id)=p.plan->'change'->>'expected_state_hash')THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 correct:=p.plan->'change'->'basis'->>'kind'='correction_replacement';IF public.uc_education_replacement_identity((p.plan->'change'->>'record_id')::uuid,correct)IS DISTINCT FROM i.official_identity THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 END IF;
 facts:=i.source_snapshot->'program_snapshot'->'facts';IF public.uc_education_render_variables(i.organization_id,i.official_identity,facts,i.number_plan,proof,i.frdo_facts->>'document_type')IS DISTINCT FROM i.render_variables THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 IF p.kind='original'OR p.plan->'change'->'basis'->>'kind'='correction_replacement'THEN IF public.uc_education_frdo_snapshot(i.organization_id,i.user_id,facts,i.number_plan,i.frdo_facts->>'document_type',CASE WHEN p.kind='duplicate'THEN i.frdo_facts END,p.kind='duplicate')IS DISTINCT FROM i.frdo_facts THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;END IF;
 END IF;RETURN i;END;$w2_old_12$;new_body text:=$w2_new_12$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;c public.uc_admission_cases;s public.uc_learning_outcome_states;m public.uc_learning_machine_results;d public.uc_learning_attestation_decisions;proof jsonb;a jsonb;e jsonb;dto jsonb;identity jsonb;facts jsonb;correct boolean;BEGIN
 IF EXISTS(SELECT 1 FROM uc_individual_issuance_private.items w2 WHERE w2.item_id=p_item)THEN RETURN uc_individual_issuance_private.artifact_live(p_actor,p_preparation,p_item,p_revision,p_fresh);END IF;
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item AND preparation_id=p_preparation AND input_revision=p_revision AND NOT redacted;
 SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=p_preparation AND actor_id=p_actor AND NOT redacted;
 IF i.id IS NULL OR p.id IS NULL OR i.organization_id<>p.organization_id OR i.user_id IS NULL OR NOT public.uc_education_artifact_actor(p_actor,i.organization_id,i.group_id,i.user_id,i.enrollment_id)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_fence(i.organization_id,i.group_id,ARRAY[p_actor,i.user_id]);proof:=i.eligibility_ref;a:=proof->'admission_ref';
 SELECT *INTO c FROM public.uc_admission_cases WHERE id=(a->>'case_id')::uuid AND organization_id=i.organization_id AND user_id=i.user_id AND group_id=i.group_id AND enrollment_id=i.enrollment_id;
 IF c.id IS NULL THEN PERFORM public.uc_education_issue_error('SOURCE_UNAVAILABLE');END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(a->'evidence_refs')LOOP dto:=public.uc_admission_evidence_dto((e->>'evidence_id')::uuid,p_actor);IF dto IS NULL OR dto->>'case_id'IS DISTINCT FROM c.id::text OR dto->'can_read_bytes'IS DISTINCT FROM'true'::jsonb OR dto->>'availability'IS DISTINCT FROM'available'OR dto->'byte_sha256'IS DISTINCT FROM e->'byte_sha256'OR dto->'byte_size'IS DISTINCT FROM e->'byte_size'THEN PERFORM public.uc_education_issue_error('SOURCE_UNAVAILABLE');END IF;END LOOP;
 IF p_fresh AND i.final_record_id IS NULL THEN
 IF NOT public.uc_education_template_current(p.organization_id,p.template,p.template_storage)THEN PERFORM public.uc_education_issue_error('ARTIFACT_REVIEW_REQUIRED');END IF;
 IF public.uc_education_number_witness(i.organization_id,(i.number_plan->>'issue_date')::date)IS DISTINCT FROM p.number_witness THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;
 IF p.kind='original'THEN
 IF public.uc_enrollment_is_withdrawn(i.enrollment_id)OR public.uc_admission_program(i.organization_id,i.user_id,i.group_id,i.enrollment_id)IS DISTINCT FROM proof->'program_ref'OR c.revision<>(a->>'revision')::bigint OR c.decision->'event_id'IS DISTINCT FROM a->'decision_event_id'OR c.decision->>'outcome'IS DISTINCT FROM'admitted'OR c.decision->'later_review_required'IS DISTINCT FROM'false'::jsonb OR NOT public.uc_admission_rules_current(c.id)OR public.uc_admission_requirements_digest(c.id)IS DISTINCT FROM a->>'requirements_digest'THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 SELECT *INTO s FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=(proof->'program_ref'->>'enrollment_snapshot_id')::uuid AND organization_id=i.organization_id AND enrollment_id=i.enrollment_id;
 SELECT *INTO m FROM public.uc_learning_machine_results WHERE id=s.machine_id AND state_id=s.id;SELECT *INTO d FROM public.uc_learning_attestation_decisions WHERE id=s.decision_id AND state_id=s.id;
 IF s.id IS NULL OR m.id IS NULL OR d.id IS NULL OR s.revision<>(proof->'outcome_ref'->>'revision')::bigint OR s.machine_id IS DISTINCT FROM(proof->'outcome_ref'->>'machine_result_id')::uuid OR s.decision_id IS DISTINCT FROM(proof->'outcome_ref'->>'decision_id')::uuid OR d.redacted OR d.outcome<>'passed'OR d.machine_result_id IS DISTINCT FROM m.id OR m.input_hash IS DISTINCT FROM public.uc_learning_evaluate(s)->>'input_hash'OR(d.basis='machine'AND m.evaluation->>'eligibility'<>'eligible')OR(d.basis='recognition'AND d.source_proof->'recognition_proof'IS DISTINCT FROM public.uc_learning_recognition_proof(i.organization_id,(d.source_proof->>'recognition_file_version_id')::uuid))THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 SELECT jsonb_build_object('user_id',pr.user_id,'full_name',btrim(pr.full_name),'birth_date',f.birth_date,'registration_hash',proof->'identity_ref'->'registration_hash','source','current_student_registration')INTO identity FROM public.profiles pr JOIN public.student_frdo_data f ON f.user_id=pr.user_id AND f.organization_id=pr.organization_id WHERE pr.user_id=i.user_id AND pr.organization_id=i.organization_id;
 IF identity IS DISTINCT FROM i.official_identity THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.education_document_records r JOIN public.uc_education_issuance_states x ON x.record_id=r.id WHERE r.id=(p.plan->'change'->>'record_id')::uuid AND r.organization_id=i.organization_id AND r.user_id=i.user_id AND r.enrollment_id=i.enrollment_id AND r.document_status='original'AND r.deleted_at IS NULL AND x.revision=(p.plan->'change'->>'expected_revision')::bigint AND x.annulment IS NULL AND NOT x.redacted AND public.uc_education_issue_state_hash(r.id)=p.plan->'change'->>'expected_state_hash')THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 correct:=p.plan->'change'->'basis'->>'kind'='correction_replacement';IF public.uc_education_replacement_identity((p.plan->'change'->>'record_id')::uuid,correct)IS DISTINCT FROM i.official_identity THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 END IF;
 facts:=i.source_snapshot->'program_snapshot'->'facts';IF public.uc_education_render_variables(i.organization_id,i.official_identity,facts,i.number_plan,proof,i.frdo_facts->>'document_type')IS DISTINCT FROM i.render_variables THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 IF p.kind='original'OR p.plan->'change'->'basis'->>'kind'='correction_replacement'THEN IF public.uc_education_frdo_snapshot(i.organization_id,i.user_id,facts,i.number_plan,i.frdo_facts->>'document_type',CASE WHEN p.kind='duplicate'THEN i.frdo_facts END,p.kind='duplicate')IS DISTINCT FROM i.frdo_facts THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;END IF;
 END IF;RETURN i;END;$w2_new_12$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'8676afb303a386c3471b387352c25cc9'OR md5(old_body)<>'8676afb303a386c3471b387352c25cc9'OR md5(new_body)<>'28c5f6cc2ebab197a1b114aa7bac0f26'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_12' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_12';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'28c5f6cc2ebab197a1b114aa7bac0f26'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_12';END IF;
END;$w2_delta_12$;

DO $w2_delta_13$
DECLARE target oid:=to_regprocedure('public.uc_education_issue_one(uuid,jsonb,text)');old_body text:=$w2_old_13$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;r public.education_document_records;s public.uc_education_issuance_states;original public.education_document_records;old public.uc_education_issuance_states;official jsonb;item jsonb;source jsonb;context_id uuid;registry jsonb;context jsonb;data jsonb;event_id uuid:=gen_random_uuid();duplicate_event uuid;before_hash text;after_hash text;mode text;original_data text;BEGIN
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item FOR UPDATE;SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF p.actor_id IS DISTINCT FROM auth.uid()OR i.final_record_id IS NOT NULL OR i.redacted OR p.redacted THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 mode:=CASE p.kind WHEN'original'THEN'original'ELSE'duplicate'END;
 IF mode='duplicate'THEN SELECT *INTO original FROM public.education_document_records WHERE id=(p.plan->'change'->>'record_id')::uuid;SELECT *INTO old FROM public.uc_education_issuance_states WHERE record_id=original.id;before_hash:=public.uc_education_issue_state_hash(original.id);
 original_data:=jsonb_build_object('record_id',original.id,'document_number',original.document_number,'reg_number',original.reg_number,'issue_date',original.issue_date)::text;END IF;
 official:=i.official_identity||i.number_plan||jsonb_build_object('document_type',i.frdo_facts->'document_type','original_document_data',original_data);
 INSERT INTO public.uc_education_issuance_contexts(transaction_id,backend_pid,actor_id,organization_id,mode,enrollment_id,user_id,course_id,group_id,original_record_id,proof,source_snapshot,official_identity)
 VALUES(txid_current(),pg_backend_pid(),auth.uid(),i.organization_id,mode,i.enrollment_id,i.user_id,i.course_id,i.group_id,original.id,i.eligibility_ref,i.source_snapshot,official)RETURNING id INTO context_id;
 item:=jsonb_build_object('user_id',i.user_id,'enrollment_id',i.enrollment_id,'document_type',i.frdo_facts->'document_type','issue_date',i.number_plan->'issue_date','document_series',i.number_plan->'document_series','full_name',i.official_identity->'full_name','birth_date',i.official_identity->'birth_date','document_status',mode,'original_document_data',original_data,'notes','');
 SELECT *INTO r FROM public.issue_education_document_batch(i.organization_id,i.group_id,i.course_id,jsonb_build_array(item));
 DELETE FROM public.uc_education_issuance_contexts WHERE id=context_id;
 IF r.id IS NULL OR r.document_number IS DISTINCT FROM i.number_plan->>'document_number'OR r.reg_number IS DISTINCT FROM i.number_plan->>'reg_number'OR r.delivery_method IS DISTINCT FROM'not_recorded'OR r.document_status<>mode THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;
 context:=public.uc_document_registry_context(i.organization_id,CASE WHEN p.scope->>'kind'='group'THEN(p.scope->>'group_id')::uuid END,jsonb_build_object('kind','student','user_id',i.user_id),jsonb_build_object('kind','enrollment','enrollment_id',i.enrollment_id,'binding_hash',repeat('0',64)),false)->'context';
 data:=jsonb_build_object('direction','outgoing','document_type',r.document_type,'title',CASE r.document_type WHEN'certificate'THEN'Удостоверение'WHEN'diploma'THEN'Диплом'ELSE'Свидетельство'END||' № '||r.document_number,'document_date',r.issue_date,'declared_document_number',r.document_number,'source',p_artifact->'source','sender',jsonb_build_object('kind','organization','organization_id',i.organization_id),'recipient',jsonb_build_object('kind','student','user_id',i.user_id),'subject',jsonb_build_object('kind','student','user_id',i.user_id),'context',context,'origin',jsonb_build_object('kind','org_document'),'notes','Зарегистрирован проверенный файл выданного документа. Факт передачи фиксируется отдельно.');
 registry:=public.apply_document_registry_action(i.organization_id,p.scope,0,gen_random_uuid(),jsonb_build_object('action','register','data',data,'reason',p_reason));
 IF registry->'record'->>'id'IS NULL THEN PERFORM public.uc_education_issue_error('DEPENDENCY_UNAVAILABLE');END IF;
 INSERT INTO public.uc_education_issuance_states(record_id,organization_id,user_id,course_id,enrollment_id,group_id,revision,original_record_id,registry_record_id,proof,artifact,frdo_facts,notes,recorded_by,updated_by,participant_ids)
 VALUES(r.id,i.organization_id,i.user_id,i.course_id,i.enrollment_id,i.group_id,1,original.id,(registry->'record'->>'id')::uuid,i.eligibility_ref,p_artifact,i.frdo_facts,'',auth.uid(),auth.uid(),ARRAY[i.user_id,auth.uid()]);
 after_hash:=public.uc_education_issue_state_hash(r.id);
 INSERT INTO public.uc_education_issuance_events(id,record_id,organization_id,user_id,revision,kind,actor_id,reason,previous_state_hash,state_hash,payload,participant_ids)
 VALUES(event_id,r.id,i.organization_id,i.user_id,1,'issued',auth.uid(),p_reason,public.uc_program_hash(jsonb_build_object('record_id',r.id,'revision',0)),after_hash,jsonb_build_object('kind','issued','official',to_jsonb(r)-'deleted_by','proof',i.eligibility_ref,'proof_availability','captured','artifact',p_artifact,'frdo_facts',i.frdo_facts),ARRAY[i.user_id,auth.uid()]);
 UPDATE public.uc_education_issuance_preparation_items SET final_record_id=r.id WHERE id=i.id;
 IF mode='duplicate'THEN
 IF old.revision>=9007199254740991 THEN PERFORM public.uc_education_issue_error('LIMIT_EXCEEDED');END IF;duplicate_event:=gen_random_uuid();
 UPDATE public.uc_education_issuance_states SET revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp(),participant_ids=array_append(participant_ids,auth.uid())WHERE record_id=original.id;
 INSERT INTO public.uc_education_issuance_events(id,record_id,organization_id,user_id,revision,kind,actor_id,reason,previous_state_hash,state_hash,payload,participant_ids)
 VALUES(duplicate_event,original.id,i.organization_id,i.user_id,old.revision+1,'duplicate_issued',auth.uid(),p_reason,before_hash,public.uc_education_issue_state_hash(original.id),jsonb_build_object('kind','duplicate_issued','original_record_id',original.id,'duplicate_record_id',r.id,'basis',p.plan->'change'->'basis'),ARRAY[i.user_id,auth.uid()]);
 END IF;
 RETURN jsonb_build_object('record_id',r.id,'original_record_id',original.id,'event_ids',CASE WHEN duplicate_event IS NULL THEN jsonb_build_array(event_id)ELSE jsonb_build_array(event_id,duplicate_event)END,'enrollment_id',i.enrollment_id);END;$w2_old_13$;new_body text:=$w2_new_13$
DECLARE i public.uc_education_issuance_preparation_items;p public.uc_education_issuance_preparations;r public.education_document_records;s public.uc_education_issuance_states;original public.education_document_records;old public.uc_education_issuance_states;official jsonb;item jsonb;source jsonb;context_id uuid;registry jsonb;context jsonb;data jsonb;event_id uuid:=gen_random_uuid();duplicate_event uuid;before_hash text;after_hash text;mode text;original_data text;BEGIN
 IF EXISTS(SELECT 1 FROM uc_individual_issuance_private.items w2 WHERE w2.item_id=p_item)THEN RETURN uc_individual_issuance_private.issue_one(p_item,p_artifact,p_reason);END IF;
 SELECT *INTO i FROM public.uc_education_issuance_preparation_items WHERE id=p_item FOR UPDATE;SELECT *INTO p FROM public.uc_education_issuance_preparations WHERE id=i.preparation_id;
 IF p.actor_id IS DISTINCT FROM auth.uid()OR i.final_record_id IS NOT NULL OR i.redacted OR p.redacted THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 mode:=CASE p.kind WHEN'original'THEN'original'ELSE'duplicate'END;
 IF mode='duplicate'THEN SELECT *INTO original FROM public.education_document_records WHERE id=(p.plan->'change'->>'record_id')::uuid;SELECT *INTO old FROM public.uc_education_issuance_states WHERE record_id=original.id;before_hash:=public.uc_education_issue_state_hash(original.id);
 original_data:=jsonb_build_object('record_id',original.id,'document_number',original.document_number,'reg_number',original.reg_number,'issue_date',original.issue_date)::text;END IF;
 official:=i.official_identity||i.number_plan||jsonb_build_object('document_type',i.frdo_facts->'document_type','original_document_data',original_data);
 INSERT INTO public.uc_education_issuance_contexts(transaction_id,backend_pid,actor_id,organization_id,mode,enrollment_id,user_id,course_id,group_id,original_record_id,proof,source_snapshot,official_identity)
 VALUES(txid_current(),pg_backend_pid(),auth.uid(),i.organization_id,mode,i.enrollment_id,i.user_id,i.course_id,i.group_id,original.id,i.eligibility_ref,i.source_snapshot,official)RETURNING id INTO context_id;
 item:=jsonb_build_object('user_id',i.user_id,'enrollment_id',i.enrollment_id,'document_type',i.frdo_facts->'document_type','issue_date',i.number_plan->'issue_date','document_series',i.number_plan->'document_series','full_name',i.official_identity->'full_name','birth_date',i.official_identity->'birth_date','document_status',mode,'original_document_data',original_data,'notes','');
 SELECT *INTO r FROM public.issue_education_document_batch(i.organization_id,i.group_id,i.course_id,jsonb_build_array(item));
 DELETE FROM public.uc_education_issuance_contexts WHERE id=context_id;
 IF r.id IS NULL OR r.document_number IS DISTINCT FROM i.number_plan->>'document_number'OR r.reg_number IS DISTINCT FROM i.number_plan->>'reg_number'OR r.delivery_method IS DISTINCT FROM'not_recorded'OR r.document_status<>mode THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;
 context:=public.uc_document_registry_context(i.organization_id,CASE WHEN p.scope->>'kind'='group'THEN(p.scope->>'group_id')::uuid END,jsonb_build_object('kind','student','user_id',i.user_id),jsonb_build_object('kind','enrollment','enrollment_id',i.enrollment_id,'binding_hash',repeat('0',64)),false)->'context';
 data:=jsonb_build_object('direction','outgoing','document_type',r.document_type,'title',CASE r.document_type WHEN'certificate'THEN'Удостоверение'WHEN'diploma'THEN'Диплом'ELSE'Свидетельство'END||' № '||r.document_number,'document_date',r.issue_date,'declared_document_number',r.document_number,'source',p_artifact->'source','sender',jsonb_build_object('kind','organization','organization_id',i.organization_id),'recipient',jsonb_build_object('kind','student','user_id',i.user_id),'subject',jsonb_build_object('kind','student','user_id',i.user_id),'context',context,'origin',jsonb_build_object('kind','org_document'),'notes','Зарегистрирован проверенный файл выданного документа. Факт передачи фиксируется отдельно.');
 registry:=public.apply_document_registry_action(i.organization_id,p.scope,0,gen_random_uuid(),jsonb_build_object('action','register','data',data,'reason',p_reason));
 IF registry->'record'->>'id'IS NULL THEN PERFORM public.uc_education_issue_error('DEPENDENCY_UNAVAILABLE');END IF;
 INSERT INTO public.uc_education_issuance_states(record_id,organization_id,user_id,course_id,enrollment_id,group_id,revision,original_record_id,registry_record_id,proof,artifact,frdo_facts,notes,recorded_by,updated_by,participant_ids)
 VALUES(r.id,i.organization_id,i.user_id,i.course_id,i.enrollment_id,i.group_id,1,original.id,(registry->'record'->>'id')::uuid,i.eligibility_ref,p_artifact,i.frdo_facts,'',auth.uid(),auth.uid(),ARRAY[i.user_id,auth.uid()]);
 after_hash:=public.uc_education_issue_state_hash(r.id);
 INSERT INTO public.uc_education_issuance_events(id,record_id,organization_id,user_id,revision,kind,actor_id,reason,previous_state_hash,state_hash,payload,participant_ids)
 VALUES(event_id,r.id,i.organization_id,i.user_id,1,'issued',auth.uid(),p_reason,public.uc_program_hash(jsonb_build_object('record_id',r.id,'revision',0)),after_hash,jsonb_build_object('kind','issued','official',to_jsonb(r)-'deleted_by','proof',i.eligibility_ref,'proof_availability','captured','artifact',p_artifact,'frdo_facts',i.frdo_facts),ARRAY[i.user_id,auth.uid()]);
 UPDATE public.uc_education_issuance_preparation_items SET final_record_id=r.id WHERE id=i.id;
 IF mode='duplicate'THEN
 IF old.revision>=9007199254740991 THEN PERFORM public.uc_education_issue_error('LIMIT_EXCEEDED');END IF;duplicate_event:=gen_random_uuid();
 UPDATE public.uc_education_issuance_states SET revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp(),participant_ids=array_append(participant_ids,auth.uid())WHERE record_id=original.id;
 INSERT INTO public.uc_education_issuance_events(id,record_id,organization_id,user_id,revision,kind,actor_id,reason,previous_state_hash,state_hash,payload,participant_ids)
 VALUES(duplicate_event,original.id,i.organization_id,i.user_id,old.revision+1,'duplicate_issued',auth.uid(),p_reason,before_hash,public.uc_education_issue_state_hash(original.id),jsonb_build_object('kind','duplicate_issued','original_record_id',original.id,'duplicate_record_id',r.id,'basis',p.plan->'change'->'basis'),ARRAY[i.user_id,auth.uid()]);
 END IF;
 RETURN jsonb_build_object('record_id',r.id,'original_record_id',original.id,'event_ids',CASE WHEN duplicate_event IS NULL THEN jsonb_build_array(event_id)ELSE jsonb_build_array(event_id,duplicate_event)END,'enrollment_id',i.enrollment_id);END;$w2_new_13$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'5ded5548b6acc55a49785d1fa5b3ac47'OR md5(old_body)<>'5ded5548b6acc55a49785d1fa5b3ac47'OR md5(new_body)<>'6e2c9387adf4d28dc2675a5a81e7663c'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_13' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_13';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'6e2c9387adf4d28dc2675a5a81e7663c'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_13';END IF;
END;$w2_delta_13$;

DO $w2_delta_14$
DECLARE target oid:=to_regprocedure('public.uc_guard_program_issuance()');old_body text:=$w2_old_14$
DECLARE s public.group_program_enrollment_snapshots;f jsonb;t text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF public.uc_program_issuance_lifecycle(to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.education_document_program_sources WHERE record_id=OLD.id) THEN RAISE EXCEPTION 'issued_program_source_is_immutable' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT (jsonb_populate_record(NULL::public.group_program_enrollment_snapshots,c.source_snapshot)).* INTO s FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=NEW.organization_id AND c.enrollment_id=NEW.enrollment_id AND c.user_id=NEW.user_id AND c.course_id=NEW.course_id AND c.group_id=NEW.group_id AND c.mode='duplicate';
 IF s.id IS NULL THEN s:=public.uc_program_issuance_source(NEW.organization_id,NEW.group_id,NEW.enrollment_id,NEW.user_id,NEW.course_id);END IF;
 f:=s.program_snapshot->'facts';t:=CASE f->>'program_type' WHEN 'dpo_upskilling' THEN 'certificate' WHEN 'dpo_retraining' THEN 'diploma' WHEN 'professional_training' THEN 'qualification' END;
 IF t IS NULL OR NEW.document_type IS DISTINCT FROM t THEN RAISE EXCEPTION 'education_document_type_program_mismatch' USING ERRCODE='22023'; END IF;
 -- These fields are server-derived; neither a live course title nor a caller's export row is authoritative.
 NEW.specialty_name:=f->>'full_title';NEW.qualification_name:=coalesce(f->>'qualification',f->>'profession');
 RETURN NEW;
END;$w2_old_14$;new_body text:=$w2_new_14$
DECLARE s public.group_program_enrollment_snapshots;f jsonb;t text;
BEGIN
 IF TG_OP='UPDATE'AND EXISTS(SELECT 1 FROM uc_individual_issuance_private.issued_sources w2 WHERE w2.record_id=OLD.id)THEN
  IF public.uc_program_issuance_lifecycle(to_jsonb(OLD),to_jsonb(NEW))THEN RETURN NEW;END IF;RAISE EXCEPTION 'issued_program_source_is_immutable' USING ERRCODE='42501';END IF;
 IF NEW.group_id IS NULL AND uc_individual_issuance_private.record_context(NEW)IS NOT NULL THEN RETURN uc_individual_issuance_private.programme_guard(NEW);END IF;
 IF TG_OP='UPDATE' THEN
  IF public.uc_program_issuance_lifecycle(to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.education_document_program_sources WHERE record_id=OLD.id) THEN RAISE EXCEPTION 'issued_program_source_is_immutable' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT (jsonb_populate_record(NULL::public.group_program_enrollment_snapshots,c.source_snapshot)).* INTO s FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=NEW.organization_id AND c.enrollment_id=NEW.enrollment_id AND c.user_id=NEW.user_id AND c.course_id=NEW.course_id AND c.group_id=NEW.group_id AND c.mode='duplicate';
 IF s.id IS NULL THEN s:=public.uc_program_issuance_source(NEW.organization_id,NEW.group_id,NEW.enrollment_id,NEW.user_id,NEW.course_id);END IF;
 f:=s.program_snapshot->'facts';t:=CASE f->>'program_type' WHEN 'dpo_upskilling' THEN 'certificate' WHEN 'dpo_retraining' THEN 'diploma' WHEN 'professional_training' THEN 'qualification' END;
 IF t IS NULL OR NEW.document_type IS DISTINCT FROM t THEN RAISE EXCEPTION 'education_document_type_program_mismatch' USING ERRCODE='22023'; END IF;
 -- These fields are server-derived; neither a live course title nor a caller's export row is authoritative.
 NEW.specialty_name:=f->>'full_title';NEW.qualification_name:=coalesce(f->>'qualification',f->>'profession');
 RETURN NEW;
END;$w2_new_14$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'5d899185d5b31c279741f70e99f1d5a6'OR md5(old_body)<>'5d899185d5b31c279741f70e99f1d5a6'OR md5(new_body)<>'82500fffe4d99dfa318d61b7d3c19e86'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_14' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_14';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'82500fffe4d99dfa318d61b7d3c19e86'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_14';END IF;
END;$w2_delta_14$;

DO $w2_delta_15$
DECLARE target oid:=to_regprocedure('public.uc_record_program_issuance()');old_body text:=$w2_old_15$
DECLARE s public.group_program_enrollment_snapshots;
BEGIN
 IF TG_OP='UPDATE' AND public.uc_program_issuance_lifecycle(to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 SELECT (jsonb_populate_record(NULL::public.group_program_enrollment_snapshots,c.source_snapshot)).* INTO s FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=NEW.organization_id AND c.enrollment_id=NEW.enrollment_id AND c.user_id=NEW.user_id AND c.course_id=NEW.course_id AND c.group_id=NEW.group_id AND c.mode='duplicate';
 IF s.id IS NULL THEN s:=public.uc_program_issuance_source(NEW.organization_id,NEW.group_id,NEW.enrollment_id,NEW.user_id,NEW.course_id);END IF;
 INSERT INTO public.education_document_program_sources(record_id,organization_id,enrollment_snapshot_id,snapshot,recorded_by)
 VALUES(NEW.id,NEW.organization_id,s.id,to_jsonb(s),auth.uid());RETURN NEW;
END;$w2_old_15$;new_body text:=$w2_new_15$
DECLARE s public.group_program_enrollment_snapshots;
BEGIN
 IF TG_OP='UPDATE' AND public.uc_program_issuance_lifecycle(to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 IF NEW.group_id IS NULL AND uc_individual_issuance_private.record_context(NEW)IS NOT NULL THEN PERFORM uc_individual_issuance_private.record_source(NEW);RETURN NEW;END IF;
 SELECT (jsonb_populate_record(NULL::public.group_program_enrollment_snapshots,c.source_snapshot)).* INTO s FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=NEW.organization_id AND c.enrollment_id=NEW.enrollment_id AND c.user_id=NEW.user_id AND c.course_id=NEW.course_id AND c.group_id=NEW.group_id AND c.mode='duplicate';
 IF s.id IS NULL THEN s:=public.uc_program_issuance_source(NEW.organization_id,NEW.group_id,NEW.enrollment_id,NEW.user_id,NEW.course_id);END IF;
 INSERT INTO public.education_document_program_sources(record_id,organization_id,enrollment_snapshot_id,snapshot,recorded_by)
 VALUES(NEW.id,NEW.organization_id,s.id,to_jsonb(s),auth.uid());RETURN NEW;
END;$w2_new_15$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'ed5ec4865ca78c073b8525956f7c89f0'OR md5(old_body)<>'ed5ec4865ca78c073b8525956f7c89f0'OR md5(new_body)<>'44a8dd10853dec4c751ac682d12ee72f'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_15' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_15';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'44a8dd10853dec4c751ac682d12ee72f'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_15';END IF;
END;$w2_delta_15$;

DO $w2_delta_16$
DECLARE target oid:=to_regprocedure('public.read_education_issuance(uuid,jsonb,jsonb)');old_body text:=$w2_old_16$
<<issuance_read>>
DECLARE g uuid;kind text:=p_query->>'kind';caps jsonb;base jsonb;lim integer;items jsonb:='[]';r jsonb;id uuid;next_id uuid;ceiling bigint;next_revision bigint;before_value bigint;v public.org_document_versions;rv public.org_document_reviews;d public.org_documents;prep public.uc_education_issuance_preparations;summary jsonb;c public.education_document_records;en public.enrollments;event record;filter text;count_items integer;BEGIN
 g:=public.uc_education_issue_scope(p_organization_id,p_scope);PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[auth.uid()]);caps:=public.uc_education_issue_caps(p_organization_id,g);base:=jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'scope',p_scope,'capabilities',caps,'kind',kind);
 IF jsonb_typeof(p_query)IS DISTINCT FROM'object'OR octet_length(p_query::text)>131072 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 IF kind IN('withdrawal','withdrawal_preview','withdrawal_history')THEN IF caps->'can_read_withdrawal'IS DISTINCT FROM'true'::jsonb AND caps->'can_withdraw'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 ELSE IF caps->'can_read'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;END IF;
 IF kind IN('templates','preparations','candidates','records','history','withdrawal_history')THEN IF jsonb_typeof(p_query->'limit')IS DISTINCT FROM'number'OR coalesce(p_query->>'limit','')!~'^[0-9]+$'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;lim:=(p_query->>'limit')::integer;IF lim NOT BETWEEN 1 AND (CASE WHEN kind='preparations'THEN 50 ELSE 100 END) THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;END IF;
 IF kind='preparation'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','preparation_id'])OR NOT public.uc_admission_uuid(p_query->'preparation_id')THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;prep:=public.uc_education_preparation_access((p_query->>'preparation_id')::uuid);IF prep.organization_id<>p_organization_id OR prep.scope IS DISTINCT FROM p_scope THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;RETURN base||jsonb_build_object('preparation',public.uc_education_preparation_json(prep.id));
 ELSIF kind='preparations'THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY['kind','after_id','limit','filter'])OR NOT(p_query->'after_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'after_id'))OR p_query->>'filter'NOT IN('all','open','consumed')OR caps->'can_issue'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR prep IN SELECT *FROM public.uc_education_issuance_preparations WHERE organization_id=p_organization_id AND actor_id=auth.uid()AND scope=p_scope AND NOT redacted AND(p_query->'after_id'='null'::jsonb OR public.uc_education_issuance_preparations.id>(p_query->>'after_id')::uuid)ORDER BY public.uc_education_issuance_preparations.id LOOP
 summary:=NULL;SELECT jsonb_build_object('id',prep.id,'kind',prep.kind,'created_at',prep.created_at,'item_count',count(*),'prepared_count',count(*)FILTER(WHERE j->>'status'='prepared'),'rendered_unissued_count',count(*)FILTER(WHERE j->>'status'='rendered_unissued'),'approved_unissued_count',count(*)FILTER(WHERE j->>'status'='approved_unissued'),'consumed_count',count(*)FILTER(WHERE j->>'status'='consumed'),'stale_count',count(*)FILTER(WHERE j->>'status'='stale'))INTO summary FROM public.uc_education_issuance_preparation_items i CROSS JOIN LATERAL(SELECT public.uc_education_preparation_item_json(i.id)j)x WHERE preparation_id=prep.id AND NOT i.redacted;
 IF(summary->>'item_count')::integer=0 OR(p_query->>'filter'='open'AND summary->'consumed_count'=summary->'item_count')OR(p_query->>'filter'='consumed'AND summary->'consumed_count'<>summary->'item_count')THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->>'id')::uuid;EXIT;END IF;items:=items||jsonb_build_array(summary);END LOOP;RETURN base||jsonb_build_object('items',items,'next_after_id',next_id);
 ELSIF kind='templates'THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY['kind','after_version_id','limit'])OR NOT(p_query->'after_version_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'after_version_id'))OR caps->'can_issue'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR v IN SELECT x.*FROM public.org_document_versions x JOIN public.org_documents y ON y.id=x.document_id AND y.current_version_id=x.id AND y.organization_id=x.organization_id WHERE x.organization_id=p_organization_id AND y.deleted_at IS NULL AND coalesce(y.status,'active')NOT IN('archived','expired')AND x.file_size BETWEEN 1 AND 1048576 AND lower(split_part(x.storage_metadata->>'mimetype',';',1))='text/html'AND public.uc_copy_registry_object_matches(x)AND(p_query->'after_version_id'='null'::jsonb OR x.id>(p_query->>'after_version_id')::uuid)ORDER BY x.id LOOP
 SELECT *INTO rv FROM public.org_document_reviews WHERE document_id=v.document_id AND version_id=v.id AND organization_id=p_organization_id AND state='approved';IF rv.id IS NULL OR EXISTS(SELECT 1 FROM public.org_document_review_comments x WHERE x.review_id=rv.id AND x.resolution_status='accepted'AND x.position_anchor->>'kind'IN('insert','delete','replace'))OR public.uc_education_issue_source(p_organization_id,public.uc_copy_registry_original_ref(v),false)IS NULL THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->'template'->'source'->>'version_id')::uuid;EXIT;END IF;SELECT *INTO d FROM public.org_documents WHERE public.org_documents.id=v.document_id;items:=items||jsonb_build_array(jsonb_build_object('label',left(d.name,1000),'template',jsonb_build_object('source',public.uc_copy_registry_original_ref(v),'review_id',rv.id,'review_revision',rv.revision)));END LOOP;RETURN base||jsonb_build_object('items',items,'next_after_version_id',next_id);
 ELSIF kind='preview_issue'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','intent'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;RETURN base||jsonb_build_object('preview',public.uc_education_issue_preview(p_organization_id,g,p_query->'intent'));
 ELSIF kind='preview_change'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','change'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;RETURN base||jsonb_build_object('preview',public.uc_education_change_preview(p_organization_id,g,p_query->'change'));
 ELSIF kind='candidates'THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY['kind','course_id','after_enrollment_id','limit','filter'])OR NOT public.uc_admission_uuid(p_query->'course_id')OR NOT(p_query->'after_enrollment_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'after_enrollment_id'))OR p_query->>'filter'NOT IN('all','ready','blocked','already_issued')OR NOT EXISTS(SELECT 1 FROM public.courses WHERE public.courses.id=(p_query->>'course_id')::uuid AND organization_id=p_organization_id)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR en IN SELECT *FROM public.enrollments WHERE course_id=(p_query->>'course_id')::uuid AND(p_query->'after_enrollment_id'='null'::jsonb OR public.enrollments.id>(p_query->>'after_enrollment_id')::uuid)ORDER BY public.enrollments.id LOOP
 IF NOT public.uc_education_issue_can(p_organization_id,g,en.id,en.user_id,en.course_id,'read')THEN CONTINUE;END IF;PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[en.user_id]);r:=public.uc_education_issue_candidate(p_organization_id,g,en.id);IF r IS NULL OR(p_query->>'filter'='ready'AND r->'eligibility_ref'='null'::jsonb)OR(p_query->>'filter'='blocked'AND r->'eligibility_ref'<>'null'::jsonb)OR(p_query->>'filter'='already_issued'AND r->'existing_original_record_id'='null'::jsonb)THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->>'enrollment_id')::uuid;EXIT;END IF;items:=items||jsonb_build_array(r);END LOOP;RETURN base||jsonb_build_object('course_id',p_query->'course_id','items',items,'next_after_enrollment_id',next_id);
 ELSIF kind='records'THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY['kind','course_id','after_id','limit','filter'])OR NOT(p_query->'course_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'course_id'))OR NOT(p_query->'after_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'after_id'))OR p_query->>'filter'NOT IN('all','active','annulled','legacy_unverified')THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR c IN SELECT *FROM public.education_document_records WHERE organization_id=p_organization_id AND deleted_at IS NULL AND(p_query->'course_id'='null'::jsonb OR course_id=(p_query->>'course_id')::uuid)AND(p_query->'after_id'='null'::jsonb OR public.education_document_records.id>(p_query->>'after_id')::uuid)ORDER BY public.education_document_records.id LOOP
 IF NOT public.uc_education_issue_can(p_organization_id,coalesce(g,c.group_id),c.enrollment_id,c.user_id,c.course_id,'read')THEN CONTINUE;END IF;PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[c.user_id]);r:=public.uc_education_issue_record(p_organization_id,g,c.id);IF r IS NULL OR(p_query->>'filter'IN('active','annulled')AND r->>'lifecycle'<>p_query->>'filter')OR(p_query->>'filter'='legacy_unverified'AND r->>'provenance'<>'legacy_unverified')THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->'official'->>'id')::uuid;EXIT;END IF;items:=items||jsonb_build_array(r);END LOOP;RETURN base||jsonb_build_object('items',items,'next_after_id',next_id);
 ELSIF kind IN('record','history')THEN
 IF NOT public.uc_admission_uuid(p_query->'record_id')OR NOT(CASE WHEN kind='record'THEN public.uc_admission_shape(p_query,ARRAY['kind','record_id'])ELSE public.uc_admission_shape(p_query,ARRAY['kind','record_id','ceiling_revision','before_revision','limit'])END)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;id:=(p_query->>'record_id')::uuid;r:=public.uc_education_issue_record(p_organization_id,g,id);IF r IS NULL THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[(r->'official'->>'user_id')::uuid]);
 IF kind='record'THEN RETURN base||jsonb_build_object('record',r);END IF;
 ceiling:=(r->>'revision')::bigint;IF p_query->'ceiling_revision'<>'null'::jsonb THEN IF coalesce(p_query->>'ceiling_revision','')!~'^[0-9]+$'OR(p_query->>'ceiling_revision')::bigint>ceiling THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;ceiling:=(p_query->>'ceiling_revision')::bigint;END IF;
 IF p_query->'before_revision'<>'null'::jsonb THEN IF coalesce(p_query->>'before_revision','')!~'^[0-9]+$'OR(p_query->>'before_revision')::bigint<1 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;before_value:=(p_query->>'before_revision')::bigint;END IF;
 FOR event IN SELECT x.id,x.revision FROM public.uc_education_issuance_events x WHERE x.organization_id=p_organization_id AND x.record_id=issuance_read.id AND NOT x.redacted AND x.revision<=ceiling AND(before_value IS NULL OR x.revision<before_value)ORDER BY x.revision DESC LIMIT lim+1 LOOP IF jsonb_array_length(items)=lim THEN next_revision:=(items->-1->>'revision')::bigint;EXIT;END IF;items:=items||jsonb_build_array(public.uc_education_issue_event(event.id));END LOOP;
 RETURN base||jsonb_build_object('record_id',id,'ceiling_revision',ceiling,'items',items,'next_before_revision',next_revision);
 ELSIF kind IN('withdrawal','withdrawal_preview','withdrawal_history')THEN
 IF kind='withdrawal_preview'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','intent'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;RETURN base||jsonb_build_object('preview',public.uc_education_withdraw_intent(p_organization_id,g,p_query->'intent'));END IF;
 IF NOT public.uc_admission_uuid(p_query->'enrollment_id')OR NOT(CASE WHEN kind='withdrawal'THEN public.uc_admission_shape(p_query,ARRAY['kind','enrollment_id'])ELSE public.uc_admission_shape(p_query,ARRAY['kind','enrollment_id','ceiling_revision','before_revision','limit'])END)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;id:=(p_query->>'enrollment_id')::uuid;r:=public.uc_education_withdraw_state(p_organization_id,g,id);PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[(r->'ref'->>'user_id')::uuid]);IF kind='withdrawal'THEN RETURN base||jsonb_build_object('state',r);END IF;
 ceiling:=(r->'ref'->>'revision')::bigint;IF p_query->'ceiling_revision'<>'null'::jsonb THEN IF coalesce(p_query->>'ceiling_revision','')!~'^[0-9]+$'OR(p_query->>'ceiling_revision')::bigint>ceiling THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;ceiling:=(p_query->>'ceiling_revision')::bigint;END IF;
 IF p_query->'before_revision'<>'null'::jsonb THEN IF coalesce(p_query->>'before_revision','')!~'^[0-9]+$'OR(p_query->>'before_revision')::bigint<1 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;before_value:=(p_query->>'before_revision')::bigint;END IF;
 FOR event IN SELECT x.id,x.revision FROM public.uc_enrollment_withdrawal_events x WHERE x.organization_id=p_organization_id AND x.enrollment_id=issuance_read.id AND NOT x.redacted AND x.revision<=ceiling AND(before_value IS NULL OR x.revision<before_value)ORDER BY x.revision DESC LIMIT lim+1 LOOP IF jsonb_array_length(items)=lim THEN next_revision:=(items->-1->>'revision')::bigint;EXIT;END IF;items:=items||jsonb_build_array(public.uc_education_withdraw_event(event.id));END LOOP;RETURN base||jsonb_build_object('enrollment_id',id,'ceiling_revision',ceiling,'items',items,'next_before_revision',next_revision);
 ELSIF kind='export'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','selection','format'])OR p_query->>'format'IS DISTINCT FROM'canonical_snapshot'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;RETURN base||jsonb_build_object('artifact',public.uc_education_issue_export(p_organization_id,p_scope,p_query->'selection'));
 ELSE PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION 'EDUCATION_ISSUANCE_REVISION_CONFLICT' USING ERRCODE='PT409';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END;$w2_old_16$;new_body text:=$w2_new_16$
<<issuance_read>>
DECLARE g uuid;kind text:=p_query->>'kind';caps jsonb;base jsonb;lim integer;items jsonb:='[]';r jsonb;id uuid;next_id uuid;ceiling bigint;next_revision bigint;before_value bigint;v public.org_document_versions;rv public.org_document_reviews;d public.org_documents;prep public.uc_education_issuance_preparations;summary jsonb;c public.education_document_records;en public.enrollments;event record;filter text;count_items integer;BEGIN
 g:=public.uc_education_issue_scope(p_organization_id,p_scope);PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[auth.uid()]);caps:=public.uc_education_issue_caps(p_organization_id,g);base:=jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'scope',p_scope,'capabilities',caps,'kind',kind);
 IF jsonb_typeof(p_query)IS DISTINCT FROM'object'OR octet_length(p_query::text)>131072 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 IF kind IN('withdrawal','withdrawal_preview','withdrawal_history')THEN IF caps->'can_read_withdrawal'IS DISTINCT FROM'true'::jsonb AND caps->'can_withdraw'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;
 ELSE IF caps->'can_read'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;END IF;
 IF kind IN('templates','preparations','candidates','records','history','withdrawal_history')THEN IF jsonb_typeof(p_query->'limit')IS DISTINCT FROM'number'OR coalesce(p_query->>'limit','')!~'^[0-9]+$'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;lim:=(p_query->>'limit')::integer;IF lim NOT BETWEEN 1 AND (CASE WHEN kind='preparations'THEN 50 ELSE 100 END) THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;END IF;
 IF kind='preparation'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','preparation_id'])OR NOT public.uc_admission_uuid(p_query->'preparation_id')THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;IF EXISTS(SELECT 1 FROM uc_individual_issuance_private.items w2 WHERE w2.preparation_id=(p_query->>'preparation_id')::uuid)THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;prep:=public.uc_education_preparation_access((p_query->>'preparation_id')::uuid);IF prep.organization_id<>p_organization_id OR prep.scope IS DISTINCT FROM p_scope THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;RETURN base||jsonb_build_object('preparation',public.uc_education_preparation_json(prep.id));
 ELSIF kind='preparations'THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY['kind','after_id','limit','filter'])OR NOT(p_query->'after_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'after_id'))OR p_query->>'filter'NOT IN('all','open','consumed')OR caps->'can_issue'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR prep IN SELECT *FROM public.uc_education_issuance_preparations WHERE organization_id=p_organization_id AND actor_id=auth.uid()AND scope=p_scope AND NOT redacted AND NOT EXISTS(SELECT 1 FROM uc_individual_issuance_private.items w2 WHERE w2.preparation_id=public.uc_education_issuance_preparations.id)AND(p_query->'after_id'='null'::jsonb OR public.uc_education_issuance_preparations.id>(p_query->>'after_id')::uuid)ORDER BY public.uc_education_issuance_preparations.id LOOP
 summary:=NULL;SELECT jsonb_build_object('id',prep.id,'kind',prep.kind,'created_at',prep.created_at,'item_count',count(*),'prepared_count',count(*)FILTER(WHERE j->>'status'='prepared'),'rendered_unissued_count',count(*)FILTER(WHERE j->>'status'='rendered_unissued'),'approved_unissued_count',count(*)FILTER(WHERE j->>'status'='approved_unissued'),'consumed_count',count(*)FILTER(WHERE j->>'status'='consumed'),'stale_count',count(*)FILTER(WHERE j->>'status'='stale'))INTO summary FROM public.uc_education_issuance_preparation_items i CROSS JOIN LATERAL(SELECT public.uc_education_preparation_item_json(i.id)j)x WHERE preparation_id=prep.id AND NOT i.redacted;
 IF(summary->>'item_count')::integer=0 OR(p_query->>'filter'='open'AND summary->'consumed_count'=summary->'item_count')OR(p_query->>'filter'='consumed'AND summary->'consumed_count'<>summary->'item_count')THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->>'id')::uuid;EXIT;END IF;items:=items||jsonb_build_array(summary);END LOOP;RETURN base||jsonb_build_object('items',items,'next_after_id',next_id);
 ELSIF kind='templates'THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY['kind','after_version_id','limit'])OR NOT(p_query->'after_version_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'after_version_id'))OR caps->'can_issue'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR v IN SELECT x.*FROM public.org_document_versions x JOIN public.org_documents y ON y.id=x.document_id AND y.current_version_id=x.id AND y.organization_id=x.organization_id WHERE x.organization_id=p_organization_id AND y.deleted_at IS NULL AND coalesce(y.status,'active')NOT IN('archived','expired')AND x.file_size BETWEEN 1 AND 1048576 AND lower(split_part(x.storage_metadata->>'mimetype',';',1))='text/html'AND public.uc_copy_registry_object_matches(x)AND(p_query->'after_version_id'='null'::jsonb OR x.id>(p_query->>'after_version_id')::uuid)ORDER BY x.id LOOP
 SELECT *INTO rv FROM public.org_document_reviews WHERE document_id=v.document_id AND version_id=v.id AND organization_id=p_organization_id AND state='approved';IF rv.id IS NULL OR EXISTS(SELECT 1 FROM public.org_document_review_comments x WHERE x.review_id=rv.id AND x.resolution_status='accepted'AND x.position_anchor->>'kind'IN('insert','delete','replace'))OR public.uc_education_issue_source(p_organization_id,public.uc_copy_registry_original_ref(v),false)IS NULL THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->'template'->'source'->>'version_id')::uuid;EXIT;END IF;SELECT *INTO d FROM public.org_documents WHERE public.org_documents.id=v.document_id;items:=items||jsonb_build_array(jsonb_build_object('label',left(d.name,1000),'template',jsonb_build_object('source',public.uc_copy_registry_original_ref(v),'review_id',rv.id,'review_revision',rv.revision)));END LOOP;RETURN base||jsonb_build_object('items',items,'next_after_version_id',next_id);
 ELSIF kind='preview_issue'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','intent'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;RETURN base||jsonb_build_object('preview',public.uc_education_issue_preview(p_organization_id,g,p_query->'intent'));
 ELSIF kind='preview_change'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','change'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;RETURN base||jsonb_build_object('preview',public.uc_education_change_preview(p_organization_id,g,p_query->'change'));
 ELSIF kind='candidates'THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY['kind','course_id','after_enrollment_id','limit','filter'])OR NOT public.uc_admission_uuid(p_query->'course_id')OR NOT(p_query->'after_enrollment_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'after_enrollment_id'))OR p_query->>'filter'NOT IN('all','ready','blocked','already_issued')OR NOT EXISTS(SELECT 1 FROM public.courses WHERE public.courses.id=(p_query->>'course_id')::uuid AND organization_id=p_organization_id)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR en IN SELECT *FROM public.enrollments WHERE course_id=(p_query->>'course_id')::uuid AND(p_query->'after_enrollment_id'='null'::jsonb OR public.enrollments.id>(p_query->>'after_enrollment_id')::uuid)ORDER BY public.enrollments.id LOOP
 IF NOT public.uc_education_issue_can(p_organization_id,g,en.id,en.user_id,en.course_id,'read')THEN CONTINUE;END IF;PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[en.user_id]);r:=public.uc_education_issue_candidate(p_organization_id,g,en.id);IF r IS NULL OR(p_query->>'filter'='ready'AND r->'eligibility_ref'='null'::jsonb)OR(p_query->>'filter'='blocked'AND r->'eligibility_ref'<>'null'::jsonb)OR(p_query->>'filter'='already_issued'AND r->'existing_original_record_id'='null'::jsonb)THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->>'enrollment_id')::uuid;EXIT;END IF;items:=items||jsonb_build_array(r);END LOOP;RETURN base||jsonb_build_object('course_id',p_query->'course_id','items',items,'next_after_enrollment_id',next_id);
 ELSIF kind='records'THEN
 IF NOT public.uc_admission_shape(p_query,ARRAY['kind','course_id','after_id','limit','filter'])OR NOT(p_query->'course_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'course_id'))OR NOT(p_query->'after_id'='null'::jsonb OR public.uc_admission_uuid(p_query->'after_id'))OR p_query->>'filter'NOT IN('all','active','annulled','legacy_unverified')THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 FOR c IN SELECT *FROM public.education_document_records WHERE organization_id=p_organization_id AND deleted_at IS NULL AND(p_query->'course_id'='null'::jsonb OR course_id=(p_query->>'course_id')::uuid)AND(p_query->'after_id'='null'::jsonb OR public.education_document_records.id>(p_query->>'after_id')::uuid)ORDER BY public.education_document_records.id LOOP
 IF NOT public.uc_education_issue_can(p_organization_id,coalesce(g,c.group_id),c.enrollment_id,c.user_id,c.course_id,'read')THEN CONTINUE;END IF;PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[c.user_id]);r:=public.uc_education_issue_record(p_organization_id,g,c.id);IF r IS NOT NULL AND EXISTS(SELECT 1 FROM uc_individual_issuance_private.issued_sources w2s JOIN public.education_document_records w2r ON w2r.id=w2s.record_id AND w2r.organization_id=w2s.organization_id AND w2r.enrollment_id=w2s.enrollment_id AND w2r.user_id=w2s.user_id AND w2r.course_id=w2s.course_id WHERE w2s.record_id=(r->'official'->>'id')::uuid AND w2s.organization_id=p_organization_id)THEN r:=jsonb_set(r,'{capabilities,can_issue_duplicate}','false'::jsonb,false);END IF;IF r IS NULL OR(p_query->>'filter'IN('active','annulled')AND r->>'lifecycle'<>p_query->>'filter')OR(p_query->>'filter'='legacy_unverified'AND r->>'provenance'<>'legacy_unverified')THEN CONTINUE;END IF;
 IF jsonb_array_length(items)=lim THEN next_id:=(items->-1->'official'->>'id')::uuid;EXIT;END IF;items:=items||jsonb_build_array(r);END LOOP;RETURN base||jsonb_build_object('items',items,'next_after_id',next_id);
 ELSIF kind IN('record','history')THEN
 IF NOT public.uc_admission_uuid(p_query->'record_id')OR NOT(CASE WHEN kind='record'THEN public.uc_admission_shape(p_query,ARRAY['kind','record_id'])ELSE public.uc_admission_shape(p_query,ARRAY['kind','record_id','ceiling_revision','before_revision','limit'])END)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;id:=(p_query->>'record_id')::uuid;r:=public.uc_education_issue_record(p_organization_id,g,id);IF r IS NULL THEN PERFORM public.uc_education_issue_error('ACCESS_DENIED');END IF;PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[(r->'official'->>'user_id')::uuid]);
 IF r IS NOT NULL AND EXISTS(SELECT 1 FROM uc_individual_issuance_private.issued_sources w2s JOIN public.education_document_records w2r ON w2r.id=w2s.record_id AND w2r.organization_id=w2s.organization_id AND w2r.enrollment_id=w2s.enrollment_id AND w2r.user_id=w2s.user_id AND w2r.course_id=w2s.course_id WHERE w2s.record_id=(r->'official'->>'id')::uuid AND w2s.organization_id=p_organization_id)THEN r:=jsonb_set(r,'{capabilities,can_issue_duplicate}','false'::jsonb,false);END IF;IF kind='record'THEN RETURN base||jsonb_build_object('record',r);END IF;
 ceiling:=(r->>'revision')::bigint;IF p_query->'ceiling_revision'<>'null'::jsonb THEN IF coalesce(p_query->>'ceiling_revision','')!~'^[0-9]+$'OR(p_query->>'ceiling_revision')::bigint>ceiling THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;ceiling:=(p_query->>'ceiling_revision')::bigint;END IF;
 IF p_query->'before_revision'<>'null'::jsonb THEN IF coalesce(p_query->>'before_revision','')!~'^[0-9]+$'OR(p_query->>'before_revision')::bigint<1 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;before_value:=(p_query->>'before_revision')::bigint;END IF;
 FOR event IN SELECT x.id,x.revision FROM public.uc_education_issuance_events x WHERE x.organization_id=p_organization_id AND x.record_id=issuance_read.id AND NOT x.redacted AND x.revision<=ceiling AND(before_value IS NULL OR x.revision<before_value)ORDER BY x.revision DESC LIMIT lim+1 LOOP IF jsonb_array_length(items)=lim THEN next_revision:=(items->-1->>'revision')::bigint;EXIT;END IF;items:=items||jsonb_build_array(public.uc_education_issue_event(event.id));END LOOP;
 RETURN base||jsonb_build_object('record_id',id,'ceiling_revision',ceiling,'items',items,'next_before_revision',next_revision);
 ELSIF kind IN('withdrawal','withdrawal_preview','withdrawal_history')THEN
 IF kind='withdrawal_preview'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','intent'])THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;RETURN base||jsonb_build_object('preview',public.uc_education_withdraw_intent(p_organization_id,g,p_query->'intent'));END IF;
 IF NOT public.uc_admission_uuid(p_query->'enrollment_id')OR NOT(CASE WHEN kind='withdrawal'THEN public.uc_admission_shape(p_query,ARRAY['kind','enrollment_id'])ELSE public.uc_admission_shape(p_query,ARRAY['kind','enrollment_id','ceiling_revision','before_revision','limit'])END)THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;id:=(p_query->>'enrollment_id')::uuid;r:=public.uc_education_withdraw_state(p_organization_id,g,id);PERFORM public.uc_education_issue_fence(p_organization_id,g,ARRAY[(r->'ref'->>'user_id')::uuid]);IF kind='withdrawal'THEN RETURN base||jsonb_build_object('state',r);END IF;
 ceiling:=(r->'ref'->>'revision')::bigint;IF p_query->'ceiling_revision'<>'null'::jsonb THEN IF coalesce(p_query->>'ceiling_revision','')!~'^[0-9]+$'OR(p_query->>'ceiling_revision')::bigint>ceiling THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;ceiling:=(p_query->>'ceiling_revision')::bigint;END IF;
 IF p_query->'before_revision'<>'null'::jsonb THEN IF coalesce(p_query->>'before_revision','')!~'^[0-9]+$'OR(p_query->>'before_revision')::bigint<1 THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;before_value:=(p_query->>'before_revision')::bigint;END IF;
 FOR event IN SELECT x.id,x.revision FROM public.uc_enrollment_withdrawal_events x WHERE x.organization_id=p_organization_id AND x.enrollment_id=issuance_read.id AND NOT x.redacted AND x.revision<=ceiling AND(before_value IS NULL OR x.revision<before_value)ORDER BY x.revision DESC LIMIT lim+1 LOOP IF jsonb_array_length(items)=lim THEN next_revision:=(items->-1->>'revision')::bigint;EXIT;END IF;items:=items||jsonb_build_array(public.uc_education_withdraw_event(event.id));END LOOP;RETURN base||jsonb_build_object('enrollment_id',id,'ceiling_revision',ceiling,'items',items,'next_before_revision',next_revision);
 ELSIF kind='export'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind','selection','format'])OR p_query->>'format'IS DISTINCT FROM'canonical_snapshot'THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;RETURN base||jsonb_build_object('artifact',public.uc_education_issue_export(p_organization_id,p_scope,p_query->'selection'));
 ELSE PERFORM public.uc_education_issue_error('INVALID_INPUT');END IF;
 EXCEPTION WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN RAISE EXCEPTION 'EDUCATION_ISSUANCE_REVISION_CONFLICT' USING ERRCODE='PT409';WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_education_issue_error('INVALID_INPUT');END;$w2_new_16$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'f03cf43f952e0d1191943f4c9b2c8808'OR md5(old_body)<>'f03cf43f952e0d1191943f4c9b2c8808'OR md5(new_body)<>'4ed350757fe98a6d929fd3ab06ce402f'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_16' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_16';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'4ed350757fe98a6d929fd3ab06ce402f'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_16';END IF;
END;$w2_delta_16$;

DO $w2_delta_17$
DECLARE target oid:=to_regprocedure('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)');old_body text:=$w2_old_17$
DECLARE
  v_item jsonb;
  v_user_id uuid;
  v_enrollment_id uuid;
  v_doc_type text;
  v_issue_date date;
  v_year int;
  v_doc_n int;
  v_reg_n int;
  v_max_doc int;
  v_max_reg int;
  v_doc_number text;
  v_reg_number text;
  v_new_id uuid;
  v_existing_id uuid;
  v_group_course_id uuid;
  v_ids uuid[] := '{}';
  v_items_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id is required'; END IF;
  IF p_course_id IS NULL THEN RAISE EXCEPTION 'exact course_id is required'; END IF;
  IF NOT public.uc_document_has_action(p_organization_id,'issue') THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a non-empty array';
  END IF;
  v_items_count := jsonb_array_length(p_items);
  IF v_items_count = 0 THEN RAISE EXCEPTION 'items must be a non-empty array'; END IF;
  IF v_items_count > 500 THEN RAISE EXCEPTION 'items exceed max batch size (500)'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = p_course_id AND c.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'course % does not belong to organization', p_course_id;
  END IF;
  IF p_group_id IS NOT NULL THEN
    SELECT g.course_id INTO v_group_course_id FROM public.student_groups g
    WHERE g.id = p_group_id AND g.organization_id = p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'group % does not belong to organization', p_group_id; END IF;
    IF v_group_course_id IS NULL OR v_group_course_id <> p_course_id THEN
      RAISE EXCEPTION 'group % is not linked to exact course %', p_group_id, p_course_id;
    END IF;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=p_organization_id AND c.course_id=p_course_id AND c.group_id=p_group_id)THEN RAISE EXCEPTION 'verified_issuance_context_required' USING ERRCODE='42501';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_user_id := NULLIF(v_item->>'user_id', '')::uuid;
    v_enrollment_id := NULLIF(v_item->>'enrollment_id', '')::uuid;
    IF NOT public.uc_document_action_allowed(p_organization_id,'issue',p_group_id,v_enrollment_id) THEN RAISE EXCEPTION 'Issuance scope denied' USING ERRCODE='42501'; END IF;
    v_doc_type := NULLIF(btrim(v_item->>'document_type'), '');
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'user_id is required for every item'; END IF;
    IF v_enrollment_id IS NULL THEN RAISE EXCEPTION 'enrollment_id is required for every item'; END IF;
    IF v_doc_type NOT IN ('certificate', 'diploma', 'qualification') THEN
      RAISE EXCEPTION 'document_type must be certificate, diploma or qualification';
    END IF;
    IF NULLIF(v_item->>'issue_date', '') IS NULL THEN RAISE EXCEPTION 'issue_date is required for every item'; END IF;
    v_issue_date := (v_item->>'issue_date')::date;
    v_year := EXTRACT(YEAR FROM v_issue_date)::int;

    IF NOT EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.user_id = v_user_id AND pr.organization_id = p_organization_id
        AND (p_group_id IS NULL OR EXISTS (SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id = pr.organization_id AND m.user_id = pr.user_id AND m.group_id = p_group_id))
    ) THEN RAISE EXCEPTION 'student % is not a member of the specified organization/group', v_user_id; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id = e.course_id
      WHERE e.id = v_enrollment_id AND e.user_id = v_user_id AND e.course_id = p_course_id
        AND c.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'enrollment % does not belong to student %/exact course %', v_enrollment_id, v_user_id, p_course_id;
    END IF;

    -- One enrollment has one original education document. Re-export returns it.
    SELECT r.id INTO v_existing_id
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND r.enrollment_id = v_enrollment_id
      AND lower(btrim(r.document_status)) IN ('original', 'оригинал') AND r.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=p_organization_id AND c.enrollment_id=v_enrollment_id AND c.user_id=v_user_id AND c.mode='duplicate'AND v_item->>'document_status'='duplicate'AND c.original_record_id=r.id)
    ORDER BY r.created_at, r.id LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      IF EXISTS(SELECT 1 FROM public.education_document_program_sources ps WHERE ps.record_id=v_existing_id
       AND (ps.snapshot->>'group_id')::uuid IS DISTINCT FROM p_group_id) THEN
       RAISE EXCEPTION 'original_document_belongs_to_other_program_association' USING ERRCODE='22023'; END IF;
      v_ids := array_append(v_ids, v_existing_id); CONTINUE;
    END IF;

    SELECT COALESCE(MAX((substring(r.document_number FROM '([0-9]+)$'))::int), 0) INTO v_max_doc
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND EXTRACT(YEAR FROM r.issue_date) = v_year AND r.deleted_at IS NULL;
    INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
    VALUES (p_organization_id, 'edu_doc', v_year, v_max_doc + 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = GREATEST(document_number_sequences.last_number + 1, v_max_doc + 1), updated_at = now()
    RETURNING last_number INTO v_doc_n;

    SELECT COALESCE(MAX((substring(r.reg_number FROM '([0-9]+)$'))::int), 0) INTO v_max_reg
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND EXTRACT(YEAR FROM r.issue_date) = v_year AND r.deleted_at IS NULL;
    INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
    VALUES (p_organization_id, 'edu_reg', v_year, v_max_reg + 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = GREATEST(document_number_sequences.last_number + 1, v_max_reg + 1), updated_at = now()
    RETURNING last_number INTO v_reg_n;

    v_doc_number := v_year::text || '/' || lpad(v_doc_n::text, GREATEST(6,length(v_doc_n::text)), '0');
    v_reg_number := 'ДОК-' || v_year::text || '/' || lpad(v_reg_n::text, GREATEST(4,length(v_reg_n::text)), '0');
    INSERT INTO public.education_document_records (
      organization_id, user_id, course_id, group_id, enrollment_id,
      reg_number, document_number, document_series, document_type,
      full_name, birth_date, issue_date, specialty_name, qualification_name,
      document_status, delivery_method, education_result, notes, original_document_data
    ) VALUES (
      p_organization_id, v_user_id, p_course_id, p_group_id, v_enrollment_id,
      v_reg_number, v_doc_number, NULLIF(v_item->>'document_series', ''), v_doc_type,
      COALESCE(NULLIF(v_item->>'full_name', ''), ''), NULLIF(v_item->>'birth_date', '')::date,
      v_issue_date, COALESCE(NULLIF(v_item->>'specialty_name', ''), ''),
      NULLIF(v_item->>'qualification_name', ''), COALESCE(NULLIF(v_item->>'document_status', ''), 'original'),
      'not_recorded',
      NULLIF(v_item->>'education_result', ''), NULLIF(v_item->>'notes', ''), NULLIF(v_item->>'original_document_data','')
    ) RETURNING id INTO v_new_id;
    v_ids := array_append(v_ids, v_new_id);
  END LOOP;

  RETURN QUERY SELECT * FROM public.education_document_records r
  WHERE r.id = ANY(v_ids) ORDER BY array_position(v_ids, r.id);
END;
$w2_old_17$;new_body text:=$w2_new_17$
DECLARE
  v_item jsonb;
  v_user_id uuid;
  v_enrollment_id uuid;
  v_doc_type text;
  v_issue_date date;
  v_year int;
  v_doc_n int;
  v_reg_n int;
  v_max_doc int;
  v_max_reg int;
  v_doc_number text;
  v_reg_number text;
  v_new_id uuid;
  v_existing_id uuid;
  v_group_course_id uuid;
  v_ids uuid[] := '{}';
  v_items_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id is required'; END IF;
  IF p_course_id IS NULL THEN RAISE EXCEPTION 'exact course_id is required'; END IF;
  IF NOT public.uc_document_has_action(p_organization_id,'issue') THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a non-empty array';
  END IF;
  v_items_count := jsonb_array_length(p_items);
  IF v_items_count = 0 THEN RAISE EXCEPTION 'items must be a non-empty array'; END IF;
  IF v_items_count > 500 THEN RAISE EXCEPTION 'items exceed max batch size (500)'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = p_course_id AND c.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'course % does not belong to organization', p_course_id;
  END IF;
  IF p_group_id IS NOT NULL THEN
    SELECT g.course_id INTO v_group_course_id FROM public.student_groups g
    WHERE g.id = p_group_id AND g.organization_id = p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'group % does not belong to organization', p_group_id; END IF;
    IF v_group_course_id IS NULL OR v_group_course_id <> p_course_id THEN
      RAISE EXCEPTION 'group % is not linked to exact course %', p_group_id, p_course_id;
    END IF;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=p_organization_id AND c.course_id=p_course_id AND(c.group_id=p_group_id OR p_group_id IS NULL AND uc_individual_issuance_private.context_matches(c.id,c.organization_id,c.enrollment_id,c.user_id,c.course_id)))THEN RAISE EXCEPTION 'verified_issuance_context_required' USING ERRCODE='42501';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_user_id := NULLIF(v_item->>'user_id', '')::uuid;
    v_enrollment_id := NULLIF(v_item->>'enrollment_id', '')::uuid;
    IF NOT public.uc_document_action_allowed(p_organization_id,'issue',p_group_id,v_enrollment_id) THEN RAISE EXCEPTION 'Issuance scope denied' USING ERRCODE='42501'; END IF;
    v_doc_type := NULLIF(btrim(v_item->>'document_type'), '');
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'user_id is required for every item'; END IF;
    IF v_enrollment_id IS NULL THEN RAISE EXCEPTION 'enrollment_id is required for every item'; END IF;
    IF v_doc_type NOT IN ('certificate', 'diploma', 'qualification') THEN
      RAISE EXCEPTION 'document_type must be certificate, diploma or qualification';
    END IF;
    IF NULLIF(v_item->>'issue_date', '') IS NULL THEN RAISE EXCEPTION 'issue_date is required for every item'; END IF;
    v_issue_date := (v_item->>'issue_date')::date;
    v_year := EXTRACT(YEAR FROM v_issue_date)::int;

    IF NOT EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.user_id = v_user_id AND pr.organization_id = p_organization_id
        AND (p_group_id IS NULL OR EXISTS (SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id = pr.organization_id AND m.user_id = pr.user_id AND m.group_id = p_group_id))
    ) THEN RAISE EXCEPTION 'student % is not a member of the specified organization/group', v_user_id; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id = e.course_id
      WHERE e.id = v_enrollment_id AND e.user_id = v_user_id AND e.course_id = p_course_id
        AND c.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'enrollment % does not belong to student %/exact course %', v_enrollment_id, v_user_id, p_course_id;
    END IF;

    -- One enrollment has one original education document. Re-export returns it.
    SELECT r.id INTO v_existing_id
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND r.enrollment_id = v_enrollment_id
      AND lower(btrim(r.document_status)) IN ('original', 'оригинал') AND r.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_contexts c WHERE c.transaction_id=txid_current()AND c.backend_pid=pg_backend_pid()AND c.actor_id=auth.uid()AND c.organization_id=p_organization_id AND c.enrollment_id=v_enrollment_id AND c.user_id=v_user_id AND c.mode='duplicate'AND v_item->>'document_status'='duplicate'AND c.original_record_id=r.id)
    ORDER BY r.created_at, r.id LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      IF EXISTS(SELECT 1 FROM public.education_document_program_sources ps WHERE ps.record_id=v_existing_id
       AND (ps.snapshot->>'group_id')::uuid IS DISTINCT FROM p_group_id) THEN
       RAISE EXCEPTION 'original_document_belongs_to_other_program_association' USING ERRCODE='22023'; END IF;
      v_ids := array_append(v_ids, v_existing_id); CONTINUE;
    END IF;

    SELECT COALESCE(MAX((substring(r.document_number FROM '([0-9]+)$'))::int), 0) INTO v_max_doc
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND EXTRACT(YEAR FROM r.issue_date) = v_year AND r.deleted_at IS NULL;
    INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
    VALUES (p_organization_id, 'edu_doc', v_year, v_max_doc + 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = GREATEST(document_number_sequences.last_number + 1, v_max_doc + 1), updated_at = now()
    RETURNING last_number INTO v_doc_n;

    SELECT COALESCE(MAX((substring(r.reg_number FROM '([0-9]+)$'))::int), 0) INTO v_max_reg
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND EXTRACT(YEAR FROM r.issue_date) = v_year AND r.deleted_at IS NULL;
    INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
    VALUES (p_organization_id, 'edu_reg', v_year, v_max_reg + 1)
    ON CONFLICT (organization_id, doc_type, year)
    DO UPDATE SET last_number = GREATEST(document_number_sequences.last_number + 1, v_max_reg + 1), updated_at = now()
    RETURNING last_number INTO v_reg_n;

    v_doc_number := v_year::text || '/' || lpad(v_doc_n::text, GREATEST(6,length(v_doc_n::text)), '0');
    v_reg_number := 'ДОК-' || v_year::text || '/' || lpad(v_reg_n::text, GREATEST(4,length(v_reg_n::text)), '0');
    INSERT INTO public.education_document_records (
      organization_id, user_id, course_id, group_id, enrollment_id,
      reg_number, document_number, document_series, document_type,
      full_name, birth_date, issue_date, specialty_name, qualification_name,
      document_status, delivery_method, education_result, notes, original_document_data
    ) VALUES (
      p_organization_id, v_user_id, p_course_id, p_group_id, v_enrollment_id,
      v_reg_number, v_doc_number, NULLIF(v_item->>'document_series', ''), v_doc_type,
      COALESCE(NULLIF(v_item->>'full_name', ''), ''), NULLIF(v_item->>'birth_date', '')::date,
      v_issue_date, COALESCE(NULLIF(v_item->>'specialty_name', ''), ''),
      NULLIF(v_item->>'qualification_name', ''), COALESCE(NULLIF(v_item->>'document_status', ''), 'original'),
      'not_recorded',
      NULLIF(v_item->>'education_result', ''), NULLIF(v_item->>'notes', ''), NULLIF(v_item->>'original_document_data','')
    ) RETURNING id INTO v_new_id;
    v_ids := array_append(v_ids, v_new_id);
  END LOOP;

  RETURN QUERY SELECT * FROM public.education_document_records r
  WHERE r.id = ANY(v_ids) ORDER BY array_position(v_ids, r.id);
END;
$w2_new_17$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'a685ded5aeaf0b819b630ea03b4ffdb5'OR md5(old_body)<>'a685ded5aeaf0b819b630ea03b4ffdb5'OR md5(new_body)<>'5e8ffbc60406bf1c9977883a35021b26'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_17' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_17';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'5e8ffbc60406bf1c9977883a35021b26'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_17';END IF;
END;$w2_delta_17$;

DO $w2_delta_18$
DECLARE target oid:=to_regprocedure('public.uc_education_canonical_boundary()');old_body text:=$w2_old_18$
DECLARE c public.uc_education_issuance_contexts;identity jsonb;BEGIN
 IF TG_OP<>'INSERT'THEN IF public.uc_education_trusted_erasure(OLD.user_id)THEN IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;RAISE EXCEPTION 'controlled_issuance_lifecycle_required' USING ERRCODE='42501';END IF;
 SELECT *INTO c FROM public.uc_education_issuance_contexts WHERE transaction_id=txid_current()AND backend_pid=pg_backend_pid()AND actor_id=auth.uid()AND organization_id=NEW.organization_id AND enrollment_id=NEW.enrollment_id AND user_id=NEW.user_id AND course_id=NEW.course_id AND group_id=NEW.group_id;
 IF c.id IS NULL OR NOT public.uc_education_issue_actor()OR NOT public.uc_education_artifact_actor(c.actor_id,c.organization_id,c.group_id,c.user_id,c.enrollment_id)THEN RAISE EXCEPTION 'verified_issuance_context_required' USING ERRCODE='42501';END IF;identity:=c.official_identity;
 IF NEW.delivery_method IS DISTINCT FROM 'not_recorded' OR NEW.delivery_details IS NOT NULL OR NEW.document_status IS DISTINCT FROM c.mode OR NEW.document_number IS DISTINCT FROM identity->>'document_number'OR NEW.reg_number IS DISTINCT FROM identity->>'reg_number'OR NEW.document_series IS DISTINCT FROM identity->>'document_series'OR NEW.issue_date IS DISTINCT FROM(identity->>'issue_date')::date OR NEW.document_type IS DISTINCT FROM identity->>'document_type'OR NEW.full_name IS DISTINCT FROM identity->>'full_name'OR NEW.birth_date IS DISTINCT FROM(identity->>'birth_date')::date OR NEW.original_document_data IS DISTINCT FROM identity->>'original_document_data'THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 IF EXISTS(SELECT 1 FROM public.education_document_records r WHERE r.organization_id=NEW.organization_id AND r.deleted_at IS NULL AND(r.reg_number=NEW.reg_number OR r.document_number=NEW.document_number))THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;RETURN NEW;END;$w2_old_18$;new_body text:=$w2_new_18$
DECLARE c public.uc_education_issuance_contexts;identity jsonb;BEGIN
 IF TG_OP<>'INSERT'THEN IF public.uc_education_trusted_erasure(OLD.user_id)THEN IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;RAISE EXCEPTION 'controlled_issuance_lifecycle_required' USING ERRCODE='42501';END IF;
 SELECT *INTO c FROM public.uc_education_issuance_contexts WHERE transaction_id=txid_current()AND backend_pid=pg_backend_pid()AND actor_id=auth.uid()AND organization_id=NEW.organization_id AND enrollment_id=NEW.enrollment_id AND user_id=NEW.user_id AND course_id=NEW.course_id AND(group_id=NEW.group_id OR NEW.group_id IS NULL AND uc_individual_issuance_private.context_matches(id,NEW.organization_id,NEW.enrollment_id,NEW.user_id,NEW.course_id));
 IF c.id IS NULL OR NOT public.uc_education_issue_actor()OR NOT(public.uc_education_artifact_actor(c.actor_id,c.organization_id,c.group_id,c.user_id,c.enrollment_id)OR c.group_id IS NULL AND uc_individual_issuance_private.context_matches(c.id,c.organization_id,c.enrollment_id,c.user_id,c.course_id))THEN RAISE EXCEPTION 'verified_issuance_context_required' USING ERRCODE='42501';END IF;identity:=c.official_identity;
 IF NEW.delivery_method IS DISTINCT FROM 'not_recorded' OR NEW.delivery_details IS NOT NULL OR NEW.document_status IS DISTINCT FROM c.mode OR NEW.document_number IS DISTINCT FROM identity->>'document_number'OR NEW.reg_number IS DISTINCT FROM identity->>'reg_number'OR NEW.document_series IS DISTINCT FROM identity->>'document_series'OR NEW.issue_date IS DISTINCT FROM(identity->>'issue_date')::date OR NEW.document_type IS DISTINCT FROM identity->>'document_type'OR NEW.full_name IS DISTINCT FROM identity->>'full_name'OR NEW.birth_date IS DISTINCT FROM(identity->>'birth_date')::date OR NEW.original_document_data IS DISTINCT FROM identity->>'original_document_data'THEN PERFORM public.uc_education_issue_error('SOURCE_CHANGED');END IF;
 IF EXISTS(SELECT 1 FROM public.education_document_records r WHERE r.organization_id=NEW.organization_id AND r.deleted_at IS NULL AND(r.reg_number=NEW.reg_number OR r.document_number=NEW.document_number))THEN PERFORM public.uc_education_issue_error('NUMBER_PLAN_STALE');END IF;RETURN NEW;END;$w2_new_18$;def text;before_meta jsonb;after_meta jsonb;
BEGIN
 IF target IS NULL OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'acd5ceb5a484fe347bfd372717166c5e'OR md5(old_body)<>'acd5ceb5a484fe347bfd372717166c5e'OR md5(new_body)<>'99b4d41c8bda2765861fd90b0ba67daa'THEN RAISE EXCEPTION 'W2_CURRENT_BODY_PREIMAGE_18' USING ERRCODE='55000';END IF;
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO before_meta FROM pg_proc p WHERE oid=target;
 def:=pg_get_functiondef(target);IF length(def)-length(replace(def,old_body,''))<>length(old_body)THEN RAISE EXCEPTION 'W2_UNIQUE_BODY_NEEDLE_18';END IF;
 EXECUTE replace(def,old_body,new_body);
 SELECT to_jsonb(p)-ARRAY['prosrc','xmin','cmin','xmax','cmax','ctid']INTO after_meta FROM pg_proc p WHERE oid=target;
 IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=target)IS DISTINCT FROM'99b4d41c8bda2765861fd90b0ba67daa'THEN RAISE EXCEPTION 'W2_EXACT_BODY_POSTIMAGE_18';END IF;
END;$w2_delta_18$;


-- Strip provider-default grants ONLY on the new private objects and the five
-- new authenticated entrypoints. Existing overloads/defaultACL/roles are exact.
DO $w2_acl$
DECLARE f record;t record;a record;sig text;
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace='uc_individual_issuance_private'::regnamespace OR p.oid=ANY(ARRAY[
  'public.read_individual_education_issuance(uuid,uuid,jsonb)'::regprocedure,
  'public.apply_individual_education_issuance(uuid,uuid,uuid,jsonb)'::regprocedure,
  'public.uc_admission_evidence_context(uuid,uuid,bigint,uuid,jsonb)'::regprocedure,
  'public.uc_finalize_admission_case_evidence(uuid,uuid,bigint,uuid,jsonb)'::regprocedure,
  'public.uc_admission_evidence_file_context(uuid,uuid,jsonb)'::regprocedure])LOOP
  FOR a IN SELECT DISTINCT x.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x WHERE p.oid=f.oid AND x.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s CASCADE',f.oid::regprocedure,CASE WHEN a.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(a.grantee))END);
  END LOOP;
  EXECUTE format('GRANT ALL ON FUNCTION %s TO postgres',f.oid::regprocedure);
 END LOOP;
 FOR t IN SELECT c.oid FROM pg_class c WHERE c.relnamespace='uc_individual_issuance_private'::regnamespace AND c.relkind='r'LOOP
  FOR a IN SELECT DISTINCT x.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x WHERE c.oid=t.oid AND x.grantee<>c.relowner LOOP
   EXECUTE format('REVOKE ALL ON TABLE %s FROM %s CASCADE',t.oid::regclass,CASE WHEN a.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(a.grantee))END);
  END LOOP;EXECUTE format('GRANT ALL ON TABLE %s TO postgres',t.oid::regclass);
 END LOOP;
 FOREACH sig IN ARRAY ARRAY['public.read_individual_education_issuance(uuid,uuid,jsonb)','public.apply_individual_education_issuance(uuid,uuid,uuid,jsonb)','public.uc_admission_evidence_context(uuid,uuid,bigint,uuid,jsonb)','public.uc_finalize_admission_case_evidence(uuid,uuid,bigint,uuid,jsonb)','public.uc_admission_evidence_file_context(uuid,uuid,jsonb)']LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',sig);END LOOP;
END;$w2_acl$;
COMMENT ON SCHEMA uc_individual_issuance_private IS 'Typed individual W1/UC013 source adapters for canonical UC019 issuance; no parallel record, numbering, qualification or signature engine.';
COMMIT;
