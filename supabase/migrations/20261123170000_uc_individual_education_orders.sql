-- W1 LOCAL CANDIDATE R2. NOT QUALIFIED OR AUTHORIZED FOR PRODUCTION EXECUTION.
-- Explicit individual legal decisions, not automatic legal acts from progress.
-- No old programme/course/group/result/profile is updated or backfilled.
BEGIN;
SET LOCAL search_path=pg_catalog,public,storage;
DO $preflight$
BEGIN
 IF current_user<>'postgres'OR to_regnamespace('uc_individual_orders_private')IS NOT NULL
  OR to_regprocedure('public.read_individual_education_order(uuid,uuid,jsonb)')IS NOT NULL
  OR to_regprocedure('public.apply_individual_education_order(uuid,uuid,bigint,uuid,jsonb)')IS NOT NULL
  OR to_regprocedure('public.uc_education_artifact_actor(uuid,uuid,uuid,uuid,uuid)')IS NULL
  OR to_regprocedure('public.uc_education_actor_org_permission(uuid,uuid,text)')IS NULL
  OR to_regprocedure('billing_access_private.target_allowed(uuid,uuid)')IS NULL
  OR to_regprocedure('public.reserve_group_document_number(uuid,uuid,text,integer)')IS NULL
  OR to_regprocedure('public.uc_program_active_file_proof(uuid,uuid)')IS NULL
  OR to_regprocedure('public.uc_document_registry_context(uuid,uuid,jsonb,jsonb,boolean)')IS NULL
  OR to_regprocedure('public.apply_document_registry_action(uuid,jsonb,bigint,uuid,jsonb)')IS NULL
  OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=to_regprocedure('public.uc_scoped_journal_personal_counts(uuid)'))IS DISTINCT FROM'c6ae8b366a77714e1050167f35408023'
 THEN RAISE EXCEPTION 'UC_INDIVIDUAL_ORDER_DEPENDENCY_UNAVAILABLE';END IF;
END;$preflight$;
CREATE SCHEMA uc_individual_orders_private;
REVOKE ALL ON SCHEMA uc_individual_orders_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE uc_individual_orders_private.orders(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,enrollment_id uuid NOT NULL,subject_user_id uuid NOT NULL,course_id uuid NOT NULL,
 order_kind text NOT NULL CHECK(order_kind IN('admission','completion','early_withdrawal')),
 family text NOT NULL CHECK(family IN('admission','termination')),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 state_sha256 text NOT NULL CHECK(state_sha256~'^[a-f0-9]{64}$'),
 facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='object'),
 source_witness jsonb NOT NULL CHECK(jsonb_typeof(source_witness)='object'),
 approved_snapshot jsonb,approved_order_revision bigint,approved_order_sha256 text,
 decision jsonb,official_order_number jsonb,
 render_job jsonb,render_input_json text,
 staging_attest_request_id uuid NOT NULL,output_attest_request_id uuid NOT NULL,
 output_document_id uuid NOT NULL,upload_request_id uuid NOT NULL,registry_request_id uuid NOT NULL,
 artifact jsonb,output_object jsonb,registry jsonb,registered_snapshot jsonb,
 participant_ids uuid[] NOT NULL,closed boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,enrollment_id,family),UNIQUE(id,organization_id),
 CHECK(family=CASE WHEN order_kind='admission'THEN'admission'ELSE'termination'END),
 CHECK((approved_snapshot IS NULL)=(approved_order_revision IS NULL)AND(approved_snapshot IS NULL)=(approved_order_sha256 IS NULL)
  AND(approved_snapshot IS NULL)=(decision IS NULL)AND(approved_snapshot IS NULL)=(official_order_number IS NULL)AND(approved_snapshot IS NULL)=(render_job IS NULL)),
 CHECK(approved_order_revision IS NULL OR approved_order_revision BETWEEN 1 AND revision),
 CHECK(approved_order_sha256 IS NULL OR approved_order_sha256~'^[a-f0-9]{64}$'),
 CHECK(registry IS NULL OR artifact IS NOT NULL AND registered_snapshot IS NOT NULL),
 CHECK((artifact IS NULL)=(output_object IS NULL)),
 CHECK(participant_ids@>ARRAY[subject_user_id,created_by]AND array_position(participant_ids,NULL)IS NULL),
 CHECK(staging_attest_request_id<>output_attest_request_id AND staging_attest_request_id<>registry_request_id AND output_attest_request_id<>registry_request_id)
);
ALTER TABLE uc_individual_orders_private.orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX w1_order_subject ON uc_individual_orders_private.orders(subject_user_id);
CREATE INDEX w1_order_participants ON uc_individual_orders_private.orders USING gin(participant_ids);
CREATE UNIQUE INDEX w1_order_output_slot ON uc_individual_orders_private.orders(output_document_id,upload_request_id);
CREATE UNIQUE INDEX w1_order_registry_link ON uc_individual_orders_private.orders((registry->>'record_id'))WHERE registry IS NOT NULL;
CREATE TABLE uc_individual_orders_private.events(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,order_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 row_kind text NOT NULL DEFAULT'event'CHECK(row_kind IN('event','request_receipt')),original_event_id uuid REFERENCES uc_individual_orders_private.events(id)ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN('prepared','draft_revised','approved','artifact_staged','artifact_saved','output_reviewed_and_registered','closed')),
 request_id uuid NOT NULL,payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),
 actor_user_id uuid NOT NULL,server_at timestamptz NOT NULL DEFAULT clock_timestamp(),before_sha256 text,after_sha256 text NOT NULL,
 reason text NOT NULL,participant_ids uuid[] NOT NULL,result jsonb NOT NULL,
 UNIQUE(actor_user_id,request_id),
 FOREIGN KEY(order_id,organization_id)REFERENCES uc_individual_orders_private.orders(id,organization_id)ON DELETE RESTRICT,
 CHECK(before_sha256 IS NULL OR before_sha256~'^[a-f0-9]{64}$'),CHECK(after_sha256~'^[a-f0-9]{64}$'),CHECK(jsonb_typeof(result)='object'),
 CHECK((row_kind='event')=(original_event_id IS NULL)),CHECK(participant_ids@>ARRAY[actor_user_id]AND array_position(participant_ids,NULL)IS NULL)
);
ALTER TABLE uc_individual_orders_private.events ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX w1_domain_event_revision ON uc_individual_orders_private.events(order_id,revision)WHERE row_kind='event';
CREATE INDEX w1_event_actor ON uc_individual_orders_private.events(actor_user_id);
CREATE INDEX w1_event_participants ON uc_individual_orders_private.events USING gin(participant_ids);

CREATE FUNCTION uc_individual_orders_private.fail(p_code text,p_missing jsonb DEFAULT'[]')RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION USING ERRCODE=CASE WHEN p_code='ACCESS_DENIED'THEN'42501'WHEN p_code='INVALID_INPUT'THEN'22023'ELSE'PT409'END,
 MESSAGE='UC_INDIVIDUAL_ORDER_'||p_code,DETAIL=p_missing::text;END;$fn$;
CREATE FUNCTION uc_individual_orders_private.failure(p_message text,p_state text,p_detail text DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE code text;missing jsonb:='[]';
BEGIN
 IF p_state='42501'THEN code:='ACCESS_DENIED';
 ELSIF p_state IN('22023','22P02','22003','22007','22008')THEN code:='INVALID_INPUT';
 ELSIF p_state IN('55P03','40001','40P01','23505')THEN code:='REVISION_CONFLICT';
 ELSE
  FOREACH code IN ARRAY ARRAY['ACCESS_DENIED','INVALID_INPUT','NOT_FOUND','PREREQUISITE_MISSING','SOURCE_CHANGED','SOURCE_UNAVAILABLE','CONTEXT_CHANGED','REQUEST_CONFLICT','REVISION_CONFLICT','ORDER_EXISTS','DECISION_REQUIRED','OUTPUT_REVIEW_REQUIRED','ARTIFACT_RENDER_FAILED','DEPENDENCY_UNAVAILABLE','CLOSED','LIMIT_EXCEEDED']LOOP
   EXIT WHEN p_message IN('UC_INDIVIDUAL_ORDER_'||code,'DOCUMENT_REGISTRY_'||code,'SIGNATURE_EVIDENCE_'||code,'EDUCATION_ISSUANCE_'||code);code:=NULL;
  END LOOP;
  code:=coalesce(code,'DEPENDENCY_UNAVAILABLE');
 END IF;
 IF code='PREREQUISITE_MISSING'THEN
  BEGIN missing:=p_detail::jsonb;IF jsonb_typeof(missing)<>'array'OR jsonb_array_length(missing)>20
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(missing)x WHERE x NOT IN('PROGRAM_REQUIRED','PROGRAM_NOT_APPROVED','PROGRAM_FILE_UNAVAILABLE','IDENTITY_REQUIRED','AUTHORITY_BASIS_REQUIRED','ADMISSION_BASIS_REQUIRED','PRIOR_ADMISSION_REQUIRED','FINAL_PROTOCOL_REQUIRED','COMPLETION_DECISION_REQUIRED','WITHDRAWAL_GROUND_REQUIRED','DATE_REQUIRED','DATE_CONFLICT','TIMEZONE_REQUIRED','RENDER_REQUIRED','OUTPUT_REVIEW_REQUIRED','EXISTING_ORDER_REVIEW_REQUIRED','SIGNATORY_REQUIRED'))THEN missing:='[]';END IF;
  EXCEPTION WHEN OTHERS THEN missing:='[]';END;
 END IF;
 RETURN jsonb_build_object('version',1,'ok',false,'code',code,'missing_facts',missing);
END;$fn$;

-- The stage is private transport, not a signature, legal decision or byte proof.
-- Only the trusted worker's later exact attestation advances a render job.
DO $bucket$BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='uc-individual-order-staging')THEN RAISE EXCEPTION 'UC_INDIVIDUAL_ORDER_STAGING_ALREADY_EXISTS' USING ERRCODE='55000';END IF;
END;$bucket$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('uc-individual-order-staging','uc-individual-order-staging',false,20971520,ARRAY['application/pdf']);
CREATE POLICY uc_individual_order_stage_private ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated,anon
 USING(bucket_id<>'uc-individual-order-staging')WITH CHECK(bucket_id<>'uc-individual-order-staging');
CREATE FUNCTION uc_individual_orders_private.planned_output(p_bucket text,p_path text)RETURNS uc_individual_orders_private.orders
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE parts text[];head_row uc_individual_orders_private.orders;
BEGIN
 IF p_bucket IS DISTINCT FROM'org-documents'THEN RETURN head_row;END IF;parts:=string_to_array(p_path,'/');
 IF cardinality(parts)<>4 OR parts[2]<>'versions'OR NOT public.uc_signature_assurance_uuid(to_jsonb(parts[1]))OR NOT public.uc_signature_assurance_uuid(to_jsonb(parts[3]))THEN RETURN head_row;END IF;
 SELECT *INTO head_row FROM uc_individual_orders_private.orders WHERE organization_id=parts[1]::uuid AND output_document_id=parts[3]::uuid;
 IF head_row.id IS NOT NULL AND p_path IS DISTINCT FROM uc_individual_orders_private.output_descriptor(head_row)->>'file_path'THEN RETURN NULL;END IF;
 RETURN head_row;
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.storage_guard()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,storage SET TimeZone='UTC'AS $guard$
DECLARE head_row uc_individual_orders_private.orders;parts text[];is_stage boolean;path text;actor uuid;owner_text text;meta jsonb;size_text text;proof jsonb;actors uuid[];
BEGIN
 IF TG_OP='UPDATE'THEN
  IF OLD.bucket_id='uc-individual-order-staging'OR NEW.bucket_id='uc-individual-order-staging'THEN
   IF(to_jsonb(OLD)-ARRAY['last_accessed_at','updated_at','path_tokens'])IS NOT DISTINCT FROM(to_jsonb(NEW)-ARRAY['last_accessed_at','updated_at','path_tokens'])THEN NEW.updated_at:=OLD.updated_at;RETURN NEW;END IF;
   PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');
  END IF;
  -- An exact prepared output cannot be replaced, renamed or repointed. Access
  -- bookkeeping alone must not invalidate the actual canonical byte witness.
  head_row:=uc_individual_orders_private.planned_output(OLD.bucket_id,OLD.name);
  IF head_row.id IS NULL THEN head_row:=uc_individual_orders_private.planned_output(NEW.bucket_id,NEW.name);END IF;
  IF head_row.id IS NOT NULL THEN
   IF(to_jsonb(OLD)-ARRAY['last_accessed_at','updated_at','path_tokens'])IS NOT DISTINCT FROM(to_jsonb(NEW)-ARRAY['last_accessed_at','updated_at','path_tokens'])THEN NEW.updated_at:=OLD.updated_at;RETURN NEW;END IF;
   PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE'THEN
  IF OLD.bucket_id<>'uc-individual-order-staging'THEN
   head_row:=uc_individual_orders_private.planned_output(OLD.bucket_id,OLD.name);
   IF head_row.id IS NOT NULL THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
   RETURN OLD;
  END IF;
  parts:=string_to_array(OLD.name,'/');
  IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR cardinality(parts)<>5 OR NOT public.uc_signature_assurance_uuid(to_jsonb(parts[1]))
   OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=parts[1]::uuid)
   OR NOT EXISTS(SELECT 1 FROM public.account_deletion_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.files)f
    WHERE j.user_id=parts[1]::uuid AND j.state='cleanup_pending'AND j.consent_version='full-personal-data-v1'
     AND f->>'bucket'=OLD.bucket_id AND f->>'path'=OLD.name AND f->>'objectId'=OLD.id::text AND(f->>'updatedAt')::timestamptz=OLD.updated_at)
  THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
  RETURN OLD;
 END IF;
 is_stage:=NEW.bucket_id='uc-individual-order-staging';
 IF NOT is_stage AND NEW.bucket_id<>'org-documents'THEN RETURN NEW;END IF;
 parts:=string_to_array(NEW.name,'/');
 IF is_stage THEN
  IF cardinality(parts)<>5 OR NOT public.uc_signature_assurance_uuid(to_jsonb(parts[1]))OR NOT public.uc_signature_assurance_uuid(to_jsonb(parts[2]))OR NOT public.uc_signature_assurance_uuid(to_jsonb(parts[3]))THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
  SELECT *INTO head_row FROM uc_individual_orders_private.orders WHERE id=parts[3]::uuid AND organization_id=parts[2]::uuid AND subject_user_id=parts[1]::uuid FOR SHARE NOWAIT;
  IF head_row.id IS NULL OR auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR NEW.owner IS NOT NULL OR nullif(NEW.owner_id,'')IS NOT NULL THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
  actor:=head_row.updated_by;path:=uc_individual_orders_private.stage_path(head_row);
 ELSE
  -- Unrelated organization files keep every existing policy and guard.
  IF cardinality(parts)<>4 OR parts[2]<>'versions'OR NOT public.uc_signature_assurance_uuid(to_jsonb(parts[1]))OR NOT public.uc_signature_assurance_uuid(to_jsonb(parts[3]))THEN RETURN NEW;END IF;
  SELECT *INTO head_row FROM uc_individual_orders_private.orders WHERE organization_id=parts[1]::uuid AND output_document_id=parts[3]::uuid FOR SHARE NOWAIT;
  IF head_row.id IS NULL THEN RETURN NEW;END IF;
  path:=uc_individual_orders_private.output_descriptor(head_row)->>'file_path';owner_text:=coalesce(nullif(NEW.owner_id,''),NEW.owner::text);
  IF NOT public.uc_signature_assurance_uuid(to_jsonb(owner_text))THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
  actor:=owner_text::uuid;
  IF NOT coalesce((auth.role()='authenticated'AND auth.uid()=actor)
   OR(SESSION_USER='supabase_storage_admin'AND auth.role()='service_role'AND auth.uid()IS NULL AND NEW.owner_id=actor::text AND(NEW.owner IS NULL OR NEW.owner=actor)),false)
  THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 END IF;
 IF head_row.approved_snapshot IS NULL OR head_row.registry IS NOT NULL OR head_row.closed OR NEW.name IS DISTINCT FROM path
  OR is_stage AND head_row.render_job->>'stage'IS DISTINCT FROM'prepared'
  OR NOT is_stage AND(head_row.render_job->>'stage'IS DISTINCT FROM'staged'OR head_row.artifact IS NOT NULL)
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 actors:=ARRAY(SELECT DISTINCT value FROM unnest(array_append(head_row.participant_ids,actor))value WHERE value IS NOT NULL ORDER BY value);
 PERFORM uc_individual_orders_private.people(actors,true);
 PERFORM public.uc_signature_assurance_fence(head_row.organization_id,actors,true,NULL,NULL,actor);
 PERFORM uc_individual_orders_private.refresh(head_row,actor,'issue');
 meta:=uc_individual_orders_private.provenance(head_row,NEW.user_metadata);
 size_text:=coalesce(NEW.metadata->>'size',NEW.metadata->>'contentLength');
 IF size_text IS NULL OR size_text!~'^[0-9]{1,10}$'OR size_text::numeric NOT BETWEEN 1 AND 20971520 OR NEW.metadata->>'mimetype'IS DISTINCT FROM'application/pdf'THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 IF NOT is_stage THEN
  proof:=head_row.render_job->'staging_proof';
  IF proof IS NULL OR proof='null'::jsonb OR meta->'html_sha256'IS DISTINCT FROM proof->'html_sha256'OR meta->'byte_sha256'IS DISTINCT FROM proof->'byte_sha256'
   OR size_text::bigint IS DISTINCT FROM(proof->>'byte_size')::bigint THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 END IF;
 RETURN NEW;
END;$guard$;
CREATE TRIGGER uc_individual_order_storage_boundary BEFORE INSERT OR UPDATE OR DELETE ON storage.objects
 FOR EACH ROW EXECUTE FUNCTION uc_individual_orders_private.storage_guard();

CREATE FUNCTION uc_individual_orders_private.exact_time(p_value jsonb)RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
BEGIN
 IF jsonb_typeof(p_value)IS DISTINCT FROM'string'OR(p_value#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'THEN RETURN false;END IF;
 RETURN isfinite((p_value#>>'{}')::timestamptz)AND public.uc_signature_assurance_utc((p_value#>>'{}')::timestamptz)=p_value#>>'{}';
EXCEPTION WHEN OTHERS THEN RETURN false;END;$fn$;
CREATE FUNCTION public.attest_individual_education_order_artifact_service(p_context jsonb,p_observed_actor uuid,p_proof jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout='2000ms' SET TimeZone='UTC'AS $fn$
DECLARE head_row uc_individual_orders_private.orders;ctx jsonb;actual_context jsonb;key_name text;phase text:=p_proof->>'kind';phase_request_id uuid;
 event_id uuid:=gen_random_uuid();old_hash text;payload_hash text;old_request uc_individual_orders_private.events;canonical_event uc_individual_orders_private.events;
 actors uuid[];version_row public.org_document_versions;object_row storage.objects;owner_text text;observed jsonb;stage_proof jsonb;new_artifact jsonb;reply jsonb;at_time timestamptz:=clock_timestamp();detail text;descriptor jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR p_observed_actor IS NULL THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 IF octet_length(p_context::text)>16384 OR octet_length(p_proof::text)>16384
  OR NOT public.uc_signature_assurance_shape(p_context,ARRAY['version','organization_id','enrollment_id','subject_user_id','course_id','order_id','approved_order_revision','approved_order_sha256','render_job_id','render_generation','render_request_id','render_input_sha256','renderer','renderer_revision'])
  OR p_context->'version'IS DISTINCT FROM'1'::jsonb OR p_context->>'renderer'IS DISTINCT FROM'browserless'OR p_context->>'renderer_revision'IS DISTINCT FROM'uc-individual-order-v1'
  OR NOT uc_individual_orders_private.revision(p_context->'approved_order_revision')OR NOT uc_individual_orders_private.revision(p_context->'render_generation')
  OR NOT public.uc_signature_assurance_sha(p_context->'approved_order_sha256')OR NOT public.uc_signature_assurance_sha(p_context->'render_input_sha256')
  OR phase IS NULL OR phase NOT IN('staging','output')THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 FOREACH key_name IN ARRAY ARRAY['organization_id','enrollment_id','subject_user_id','course_id','order_id','render_job_id','render_request_id']LOOP
  IF NOT public.uc_signature_assurance_uuid(p_context->key_name)THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 END LOOP;
 IF NOT public.uc_signature_assurance_shape(p_proof,CASE phase WHEN'staging'THEN ARRAY['kind','object_id','object_updated_at','html_sha256','render_input_sha256','byte_sha256','byte_size','renderer','renderer_revision']
  ELSE ARRAY['kind','source','object_id','object_updated_at','staging_object_id','staging_updated_at','byte_sha256','byte_size','render_input_sha256','html_sha256','renderer','renderer_revision']END)
  OR NOT public.uc_signature_assurance_uuid(p_proof->'object_id')OR NOT uc_individual_orders_private.exact_time(p_proof->'object_updated_at')
  OR NOT public.uc_signature_assurance_sha(p_proof->'html_sha256')OR NOT public.uc_signature_assurance_sha(p_proof->'byte_sha256')OR NOT public.uc_signature_assurance_sha(p_proof->'render_input_sha256')
  OR NOT public.uc_signature_assurance_integer(p_proof->'byte_size',1,20971520)OR p_proof->>'renderer'IS DISTINCT FROM'browserless'OR p_proof->>'renderer_revision'IS DISTINCT FROM'uc-individual-order-v1'
  OR phase='output'AND(NOT uc_individual_orders_private.ref(p_proof->'source')OR NOT public.uc_signature_assurance_uuid(p_proof->'staging_object_id')OR NOT uc_individual_orders_private.exact_time(p_proof->'staging_updated_at'))
 THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 SELECT *INTO head_row FROM uc_individual_orders_private.orders WHERE organization_id=(p_context->>'organization_id')::uuid AND enrollment_id=(p_context->>'enrollment_id')::uuid AND id=(p_context->>'order_id')::uuid FOR UPDATE NOWAIT;
 IF head_row.id IS NULL THEN PERFORM uc_individual_orders_private.fail('NOT_FOUND');END IF;
 ctx:=uc_individual_orders_private.context(head_row.organization_id,head_row.enrollment_id,p_observed_actor,'issue');
 IF head_row.subject_user_id::text IS DISTINCT FROM ctx->>'subject_user_id'OR head_row.course_id::text IS DISTINCT FROM ctx->>'course_id'THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 descriptor:=uc_individual_orders_private.output_descriptor(head_row);
 SELECT *INTO version_row FROM public.org_document_versions WHERE organization_id=head_row.organization_id AND document_id=head_row.output_document_id AND request_id=head_row.upload_request_id;
 SELECT *INTO object_row FROM storage.objects WHERE bucket_id='org-documents'AND name=descriptor->>'file_path';
 owner_text:=coalesce(nullif(object_row.owner_id,''),object_row.owner::text);
 actors:=ARRAY(SELECT DISTINCT value FROM unnest(head_row.participant_ids||ARRAY[p_observed_actor,version_row.uploaded_by,CASE WHEN public.uc_signature_assurance_uuid(to_jsonb(owner_text))THEN owner_text::uuid END])value WHERE value IS NOT NULL ORDER BY value);
 -- Mutations take sorted exclusive42007 BEFORE the shared read-context fence.
 -- This avoids shared→exclusive upgrades and includes any genuine earlier
 -- upload/commit actor whose acknowledgment was lost before this staff resume.
 PERFORM uc_individual_orders_private.people(actors,true);
 PERFORM public.uc_signature_assurance_fence(head_row.organization_id,actors,true,NULL,NULL,p_observed_actor);
 actual_context:=uc_individual_orders_private.render_context(head_row,p_observed_actor,jsonb_build_object('order_id',head_row.id,'expected_revision',p_context->'approved_order_revision','expected_state_sha256',p_context->'approved_order_sha256','render_request_id',p_context->'render_request_id'));
 IF p_context->'subject_user_id'IS DISTINCT FROM to_jsonb(head_row.subject_user_id)OR p_context->'course_id'IS DISTINCT FROM to_jsonb(head_row.course_id)
  OR p_context->'render_job_id'IS DISTINCT FROM head_row.render_job->'id'OR p_context->'render_generation'IS DISTINCT FROM head_row.render_job->'generation'
  OR p_context->'render_input_sha256'IS DISTINCT FROM head_row.render_job->'render_input_sha256'OR p_proof->'render_input_sha256'IS DISTINCT FROM head_row.render_job->'render_input_sha256'
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 observed:=CASE phase WHEN'staging'THEN actual_context->'staging'->'observed_object'ELSE actual_context->'output'->'observed_object'END;
 IF observed IS NULL OR observed='null'::jsonb THEN PERFORM uc_individual_orders_private.fail('SOURCE_UNAVAILABLE');END IF;
 IF observed->'object_id'IS DISTINCT FROM p_proof->'object_id'OR observed->'updated_at'IS DISTINCT FROM p_proof->'object_updated_at'OR observed->'byte_size'IS DISTINCT FROM p_proof->'byte_size'
  OR observed->'provenance'->'html_sha256'IS DISTINCT FROM p_proof->'html_sha256'OR observed->'provenance'->'byte_sha256'IS DISTINCT FROM p_proof->'byte_sha256'
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 phase_request_id:=CASE phase WHEN'staging'THEN head_row.staging_attest_request_id ELSE head_row.output_attest_request_id END;
 payload_hash:=public.uc_program_hash(jsonb_build_object('context',p_context,'observed_actor',p_observed_actor,'proof',p_proof));
 SELECT *INTO old_request FROM uc_individual_orders_private.events WHERE actor_user_id=p_observed_actor AND events.request_id=phase_request_id FOR SHARE NOWAIT;
 IF old_request.id IS NOT NULL THEN
  IF old_request.organization_id<>head_row.organization_id OR old_request.order_id<>head_row.id OR old_request.payload_sha256<>payload_hash THEN PERFORM uc_individual_orders_private.fail('REQUEST_CONFLICT');END IF;
  RETURN old_request.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT *INTO canonical_event FROM uc_individual_orders_private.events WHERE organization_id=head_row.organization_id AND order_id=head_row.id AND row_kind='event'AND action=CASE phase WHEN'staging'THEN'artifact_staged'ELSE'artifact_saved'END ORDER BY revision LIMIT 1 FOR SHARE NOWAIT;
 IF phase='staging'THEN
  IF head_row.render_job->'staging_proof'<>'null'::jsonb THEN
   stage_proof:=head_row.render_job->'staging_proof';
   IF canonical_event.id IS NULL OR stage_proof->'object_id'IS DISTINCT FROM p_proof->'object_id'OR stage_proof->'updated_at'IS DISTINCT FROM p_proof->'object_updated_at'
    OR stage_proof->'html_sha256'IS DISTINCT FROM p_proof->'html_sha256'OR stage_proof->'byte_sha256'IS DISTINCT FROM p_proof->'byte_sha256'OR stage_proof->'byte_size'IS DISTINCT FROM p_proof->'byte_size'
   THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
   RETURN uc_individual_orders_private.receipt_alias(canonical_event,p_observed_actor,phase_request_id,payload_hash);
  END IF;
  IF canonical_event.id IS NOT NULL OR head_row.render_job->>'stage'IS DISTINCT FROM'prepared'THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 ELSE
  stage_proof:=head_row.render_job->'staging_proof';
  IF stage_proof IS NULL OR stage_proof='null'::jsonb THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["RENDER_REQUIRED"]');END IF;
  IF p_proof->'staging_object_id'IS DISTINCT FROM stage_proof->'object_id'OR p_proof->'staging_updated_at'IS DISTINCT FROM stage_proof->'updated_at'
   OR p_proof->'html_sha256'IS DISTINCT FROM stage_proof->'html_sha256'OR p_proof->'byte_sha256'IS DISTINCT FROM stage_proof->'byte_sha256'OR p_proof->'byte_size'IS DISTINCT FROM stage_proof->'byte_size'
   OR p_proof->'source'IS DISTINCT FROM actual_context->'output'->'source'OR actual_context->'output'->'object'='null'::jsonb
  THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  IF head_row.artifact IS NOT NULL THEN
   IF canonical_event.id IS NULL OR head_row.artifact->'source'IS DISTINCT FROM p_proof->'source'OR head_row.output_object IS DISTINCT FROM actual_context->'output'->'object'THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
   RETURN uc_individual_orders_private.receipt_alias(canonical_event,p_observed_actor,phase_request_id,payload_hash);
  END IF;
  IF canonical_event.id IS NOT NULL THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 END IF;
 IF head_row.registry IS NOT NULL OR head_row.closed THEN PERFORM uc_individual_orders_private.fail('CLOSED');END IF;
 IF head_row.revision>=9007199254740991 THEN PERFORM uc_individual_orders_private.fail('LIMIT_EXCEEDED');END IF;
 old_hash:=head_row.state_sha256;head_row.revision:=head_row.revision+1;head_row.updated_by:=p_observed_actor;head_row.updated_at:=at_time;head_row.participant_ids:=actors;
 IF phase='staging'THEN
  stage_proof:=jsonb_build_object('proof_id',event_id,'object_id',p_proof->'object_id','updated_at',p_proof->'object_updated_at','render_input_sha256',p_proof->'render_input_sha256','html_sha256',p_proof->'html_sha256','byte_sha256',p_proof->'byte_sha256','byte_size',p_proof->'byte_size','renderer','browserless','renderer_revision','uc-individual-order-v1');
  head_row.render_job:=head_row.render_job||jsonb_build_object('html_sha256',p_proof->'html_sha256','stage','staged','staging_proof',stage_proof);
 ELSE
  head_row.output_object:=actual_context->'output'->'object';
  head_row.artifact:=jsonb_build_object('source',actual_context->'output'->'source','byte_sha256',p_proof->'byte_sha256','byte_size',p_proof->'byte_size','render_input_sha256',p_proof->'render_input_sha256','html_sha256',p_proof->'html_sha256',
   'render_job_id',head_row.render_job->'id','render_generation',head_row.render_job->'generation','proof_id',event_id,'renderer','browserless','renderer_revision','uc-individual-order-v1','output_review',NULL);
  head_row.render_job:=head_row.render_job||jsonb_build_object('stage','saved');
 END IF;
 head_row:=uc_individual_orders_private.persist_head(head_row,false);
 reply:=jsonb_build_object('version',1,'ok',true,'kind',CASE phase WHEN'staging'THEN'staging_attested'ELSE'artifact_attested'END,'organization_id',head_row.organization_id,'enrollment_id',head_row.enrollment_id,'order_id',head_row.id,
  'render_job_id',head_row.render_job->'id','render_generation',head_row.render_job->'generation','render_request_id',head_row.render_job->'request_id','render_input_sha256',head_row.render_job->'render_input_sha256','proof_id',event_id,
  'byte_sha256',p_proof->'byte_sha256','byte_size',p_proof->'byte_size','html_sha256',p_proof->'html_sha256','source',CASE phase WHEN'output'THEN head_row.artifact->'source'END,
  'object',jsonb_build_object('object_id',p_proof->'object_id','updated_at',p_proof->'object_updated_at'),'replayed',false);
 PERFORM uc_individual_orders_private.record_event(head_row,event_id,p_observed_actor,phase_request_id,payload_hash,CASE phase WHEN'staging'THEN'artifact_staged'ELSE'artifact_saved'END,
  'Доверенный сервис перечитал и проверил байты PDF; юридическое решение, подпись и регистрация этой операцией не выполнялись.',old_hash,reply,at_time);
 RETURN reply;
EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;RETURN uc_individual_orders_private.failure(SQLERRM,SQLSTATE,detail);
END;$fn$;

-- A retained original registration is a historical fact. A requested later
-- registry revision is accepted only through its own actual retained event and
-- the same exact individual source/context; r2 is never pretended to be r1.
CREATE FUNCTION uc_individual_orders_private.registered_witness(p_order uc_individual_orders_private.orders,p_revision bigint,p_current boolean DEFAULT false)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE registry_row public.uc_document_registry_records;original_event public.uc_document_registry_events;requested_event public.uc_document_registry_events;review_event uc_individual_orders_private.events;
BEGIN
 IF p_order.registry IS NULL OR p_order.artifact IS NULL OR p_order.artifact->'output_review'='null'::jsonb OR p_revision IS NULL OR p_revision NOT BETWEEN 1 AND 9007199254740991
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_UNAVAILABLE');END IF;
 SELECT *INTO registry_row FROM public.uc_document_registry_records WHERE id=(p_order.registry->>'record_id')::uuid AND organization_id=p_order.organization_id AND NOT redacted FOR SHARE NOWAIT;
 SELECT *INTO original_event FROM public.uc_document_registry_events WHERE organization_id=p_order.organization_id AND record_id=registry_row.id AND revision=(p_order.registry->>'record_revision')::bigint AND action='register'AND NOT redacted FOR SHARE NOWAIT;
 SELECT *INTO requested_event FROM public.uc_document_registry_events WHERE organization_id=p_order.organization_id AND record_id=registry_row.id AND revision=p_revision AND NOT redacted FOR SHARE NOWAIT;
 SELECT *INTO review_event FROM uc_individual_orders_private.events WHERE id=(p_order.artifact->'output_review'->>'event_id')::uuid AND organization_id=p_order.organization_id AND order_id=p_order.id AND row_kind='event'AND action='output_reviewed_and_registered'FOR SHARE NOWAIT;
 IF registry_row.id IS NULL OR original_event.id IS NULL OR requested_event.id IS NULL OR review_event.id IS NULL THEN PERFORM uc_individual_orders_private.fail('SOURCE_UNAVAILABLE');END IF;
 IF original_event.snapshot IS DISTINCT FROM p_order.registered_snapshot OR original_event.snapshot->'data'->'source'IS DISTINCT FROM p_order.artifact->'source'
  OR review_event.result->'order'->'registry'IS DISTINCT FROM p_order.registry
  OR review_event.result->'order'->'artifact'->'output_review'IS DISTINCT FROM p_order.artifact->'output_review'
  OR review_event.actor_user_id::text IS DISTINCT FROM p_order.artifact->'output_review'->>'actor_user_id'
  OR original_event.recorded_by IS DISTINCT FROM review_event.actor_user_id
  OR requested_event.snapshot->'data'->'source'IS DISTINCT FROM p_order.artifact->'source'
  OR requested_event.snapshot->'data'->'subject'IS DISTINCT FROM jsonb_build_object('kind','student','user_id',p_order.subject_user_id)
  OR requested_event.snapshot->'context_binding'->>'organization_id'IS DISTINCT FROM p_order.organization_id::text
  OR requested_event.snapshot->'context_binding'->>'enrollment_id'IS DISTINCT FROM p_order.enrollment_id::text
  OR requested_event.snapshot->'context_binding'->>'user_id'IS DISTINCT FROM p_order.subject_user_id::text
  OR requested_event.snapshot->'context_binding'->>'course_id'IS DISTINCT FROM p_order.course_id::text
  OR p_current AND(registry_row.revision<>p_revision OR registry_row.data IS DISTINCT FROM requested_event.snapshot->'data'OR registry_row.context_binding IS DISTINCT FROM requested_event.snapshot->'context_binding')
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('registry_record_id',registry_row.id,'registry_record_revision',p_revision,'registry_event_id',requested_event.id,'registered_event_id',original_event.id);
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.own_person(p_order uc_individual_orders_private.orders,p_actor uuid)RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
BEGIN
 IF p_actor IS NULL OR p_actor IS DISTINCT FROM p_order.subject_user_id OR public.uc_custom_journal_person(p_actor)IS NOT TRUE
  OR public.is_user_blocked(p_actor)IS NOT FALSE OR billing_access_private.target_allowed(p_order.organization_id,p_actor)IS NOT TRUE
  OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor)
  OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_actor AND p.organization_id=p_order.organization_id AND p.archived_at IS NULL)
 THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 PERFORM uc_individual_orders_private.people(array_append(p_order.participant_ids,p_actor),false);
 -- Do not consult current programme pointers, mutable parent CAS or a current
 -- course-assignment row to invalidate a proven personal historical copy.
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.own_target(p_org uuid,p_record uuid,p_revision bigint)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE head_row uc_individual_orders_private.orders;source jsonb;witness jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR public.account_deletion_access_allowed()IS NOT TRUE THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 SELECT *INTO head_row FROM uc_individual_orders_private.orders WHERE organization_id=p_org AND registry->>'record_id'=p_record::text;
 IF head_row.id IS NULL THEN RETURN NULL;END IF;
 PERFORM uc_individual_orders_private.own_person(head_row,auth.uid());
 BEGIN
  witness:=uc_individual_orders_private.registered_witness(head_row,p_revision,true);source:=uc_individual_orders_private.artifact_source(head_row);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM IN('UC_INDIVIDUAL_ORDER_SOURCE_CHANGED','UC_INDIVIDUAL_ORDER_SOURCE_UNAVAILABLE')THEN RETURN NULL;ELSE RAISE;END IF;
 END;
 RETURN jsonb_build_object('kind','own_individual_order_file','order_id',head_row.id,'order_revision',head_row.revision,'registry_record_id',p_record,'registry_record_revision',p_revision,
  'document_id',head_row.artifact->'source'->'document_id','version_id',head_row.artifact->'source'->'version_id','content_hash',head_row.artifact->'source'->'content_hash',
  'byte_sha256',head_row.artifact->'byte_sha256','byte_size',head_row.artifact->'byte_size');
END;$fn$;
CREATE FUNCTION public.read_individual_education_order_file_context_service(p_context jsonb,p_observed_actor uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms' SET TimeZone='UTC'AS $fn$
DECLARE head_row uc_individual_orders_private.orders;source jsonb;witness jsonb;detail text;
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR p_observed_actor IS NULL THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 IF NOT public.uc_signature_assurance_shape(p_context,ARRAY['version','organization_id','enrollment_id','registry_record_id','registry_record_revision'])OR p_context->'version'IS DISTINCT FROM'1'::jsonb
  OR NOT public.uc_signature_assurance_uuid(p_context->'organization_id')OR NOT public.uc_signature_assurance_uuid(p_context->'enrollment_id')OR NOT public.uc_signature_assurance_uuid(p_context->'registry_record_id')OR NOT uc_individual_orders_private.revision(p_context->'registry_record_revision')
 THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 SELECT *INTO head_row FROM uc_individual_orders_private.orders WHERE organization_id=(p_context->>'organization_id')::uuid AND enrollment_id=(p_context->>'enrollment_id')::uuid AND registry->>'record_id'=p_context->>'registry_record_id'FOR SHARE NOWAIT;
 IF head_row.id IS NULL THEN PERFORM uc_individual_orders_private.fail('NOT_FOUND');END IF;
 PERFORM uc_individual_orders_private.own_person(head_row,p_observed_actor);
 witness:=uc_individual_orders_private.registered_witness(head_row,(p_context->>'registry_record_revision')::bigint,false);source:=uc_individual_orders_private.artifact_source(head_row);
 RETURN jsonb_build_object('version',1,'ok',true,'kind','own_file_context','organization_id',head_row.organization_id,'enrollment_id',head_row.enrollment_id,
  'registry_record_id',p_context->'registry_record_id','registry_record_revision',p_context->'registry_record_revision','order_id',head_row.id,'order_revision',head_row.revision,'subject_user_id',head_row.subject_user_id,
  'source',source->'source','file',source->'file','object',source->'object');
EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;RETURN uc_individual_orders_private.failure(SQLERRM,SQLSTATE,detail);
END;$fn$;

CREATE FUNCTION uc_individual_orders_private.bounded(p_text text,p_max integer)RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(string_agg(ch,''ORDER BY n),'')FROM(
  SELECT ch,n,sum(CASE WHEN ascii(ch)>65535 THEN 2 ELSE 1 END)OVER(ORDER BY n)units
  FROM regexp_split_to_table(left(coalesce(p_text,''),greatest(p_max,0)),'')WITH ORDINALITY t(ch,n)WHERE ch<>''
 )chars WHERE units<=p_max
$fn$;

CREATE FUNCTION uc_individual_orders_private.output_descriptor(p_order uc_individual_orders_private.orders)RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('document_id',p_order.output_document_id,'upload_request_id',p_order.upload_request_id,'expected_document_revision',0,
 'file_name','individual-order-'||p_order.id::text||'.pdf','file_path',p_order.organization_id::text||'/versions/'||p_order.output_document_id::text||'/'||p_order.upload_request_id::text||'.pdf',
 'document',jsonb_build_object('name',uc_individual_orders_private.bounded(CASE p_order.order_kind WHEN'admission'THEN'Приказ о зачислении'WHEN'completion'THEN'Приказ об отчислении в связи с завершением обучения'ELSE'Приказ о досрочном прекращении образовательных отношений'END||' № '||(p_order.official_order_number->>'display')||' — '||(p_order.facts->'programme_facts'->>'full_title'),1000),
 'type','other','issue_date',p_order.facts->'dates'->'document_date','status','active'))
$fn$;
CREATE FUNCTION uc_individual_orders_private.stage_path(p_order uc_individual_orders_private.orders)RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog AS $fn$
 SELECT p_order.subject_user_id::text||'/'||p_order.organization_id::text||'/'||p_order.id::text||'/'||(p_order.render_job->>'id')||'/'||(p_order.render_job->>'render_input_sha256')||'.pdf'
$fn$;
CREATE FUNCTION uc_individual_orders_private.provenance(p_order uc_individual_orders_private.orders,p_raw jsonb)RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT public.uc_signature_assurance_shape(p_raw,ARRAY['version','kind','order_id','render_job_id','render_generation','render_input_sha256','html_sha256','byte_sha256','renderer','renderer_revision'])
  OR EXISTS(SELECT 1 FROM jsonb_each(p_raw)e WHERE jsonb_typeof(e.value)<>'string')
  OR p_raw->>'version'IS DISTINCT FROM'1'OR p_raw->>'kind'IS DISTINCT FROM'individual_order'OR p_raw->>'order_id'IS DISTINCT FROM p_order.id::text
  OR p_raw->>'render_job_id'IS DISTINCT FROM p_order.render_job->>'id'OR p_raw->>'render_generation'IS DISTINCT FROM p_order.render_job->>'generation'
  OR p_raw->>'render_input_sha256'IS DISTINCT FROM p_order.render_job->>'render_input_sha256'
  OR p_raw->>'renderer'IS DISTINCT FROM'browserless'OR p_raw->>'renderer_revision'IS DISTINCT FROM'uc-individual-order-v1'
  OR NOT public.uc_signature_assurance_sha(p_raw->'html_sha256')OR NOT public.uc_signature_assurance_sha(p_raw->'byte_sha256')
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 IF p_order.render_job->'html_sha256'<>'null'::jsonb AND p_raw->'html_sha256'IS DISTINCT FROM p_order.render_job->'html_sha256'
  OR p_order.render_job->'staging_proof'<>'null'::jsonb AND p_raw->'byte_sha256'IS DISTINCT FROM p_order.render_job->'staging_proof'->'byte_sha256'
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('version',1,'kind','individual_order','order_id',p_order.id,'render_job_id',p_order.render_job->'id','render_generation',p_order.render_job->'generation',
  'render_input_sha256',p_raw->'render_input_sha256','html_sha256',p_raw->'html_sha256','byte_sha256',p_raw->'byte_sha256','renderer','browserless','renderer_revision','uc-individual-order-v1');
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.observation(p_order uc_individual_orders_private.orders,p_bucket text)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE object_row storage.objects;path text;size_text text;size_value bigint;provenance jsonb;owner_text text;
BEGIN
 IF p_order.approved_snapshot IS NULL OR p_bucket NOT IN('uc-individual-order-staging','org-documents')THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 path:=CASE p_bucket WHEN'uc-individual-order-staging'THEN uc_individual_orders_private.stage_path(p_order)ELSE uc_individual_orders_private.output_descriptor(p_order)->>'file_path'END;
 SELECT *INTO object_row FROM storage.objects WHERE bucket_id=p_bucket AND name=path FOR SHARE NOWAIT;
 IF object_row.id IS NULL THEN RETURN NULL;END IF;
 IF p_bucket='uc-individual-order-staging'THEN
  IF object_row.owner IS NOT NULL OR nullif(object_row.owner_id,'')IS NOT NULL THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 ELSE
  owner_text:=coalesce(nullif(object_row.owner_id,''),object_row.owner::text);
  IF owner_text IS NULL OR NOT public.uc_signature_assurance_uuid(to_jsonb(owner_text))OR public.uc_custom_journal_person(owner_text::uuid)IS NOT TRUE
  THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 END IF;
 size_text:=coalesce(object_row.metadata->>'size',object_row.metadata->>'contentLength');
 IF size_text IS NULL OR size_text!~'^[0-9]{1,10}$'OR size_text::numeric NOT BETWEEN 1 AND 20971520
  OR lower(btrim(object_row.metadata->>'mimetype'))IS DISTINCT FROM'application/pdf'OR object_row.updated_at IS NULL
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_UNAVAILABLE');END IF;
 size_value:=size_text::bigint;provenance:=uc_individual_orders_private.provenance(p_order,object_row.user_metadata);
 IF p_order.render_job->'staging_proof'<>'null'::jsonb AND to_jsonb(size_value)IS DISTINCT FROM p_order.render_job->'staging_proof'->'byte_size'THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('object_id',object_row.id,'updated_at',public.uc_signature_assurance_utc(object_row.updated_at),'byte_size',size_value,'mime_type','application/pdf','provenance',provenance);
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.artifact_source(p_order uc_individual_orders_private.orders)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE version_row public.org_document_versions;phase_event uc_individual_orders_private.events;descriptor jsonb;observed jsonb;ref jsonb;
BEGIN
 IF p_order.artifact IS NULL OR p_order.output_object IS NULL OR p_order.render_job->>'stage'IS DISTINCT FROM'saved'THEN PERFORM uc_individual_orders_private.fail('SOURCE_UNAVAILABLE');END IF;
 descriptor:=uc_individual_orders_private.output_descriptor(p_order);
 SELECT *INTO version_row FROM public.org_document_versions WHERE organization_id=p_order.organization_id AND document_id=p_order.output_document_id AND request_id=p_order.upload_request_id FOR SHARE NOWAIT;
 observed:=uc_individual_orders_private.observation(p_order,'org-documents');
 SELECT *INTO phase_event FROM uc_individual_orders_private.events WHERE id=(p_order.artifact->>'proof_id')::uuid AND organization_id=p_order.organization_id AND order_id=p_order.id AND action='artifact_saved'AND row_kind='event'FOR SHARE NOWAIT;
 IF version_row.id IS NULL OR observed IS NULL OR phase_event.id IS NULL THEN PERFORM uc_individual_orders_private.fail('SOURCE_UNAVAILABLE');END IF;
 ref:=public.uc_copy_registry_original_ref(version_row);
 IF public.uc_copy_registry_object_matches(version_row)IS NOT TRUE OR ref IS DISTINCT FROM p_order.artifact->'source'
  OR version_row.file_path IS DISTINCT FROM descriptor->>'file_path'OR version_row.file_name IS DISTINCT FROM descriptor->>'file_name'
  OR to_jsonb(version_row.file_size)IS DISTINCT FROM p_order.artifact->'byte_size'
  OR version_row.document_metadata->'name'IS DISTINCT FROM descriptor->'document'->'name'OR version_row.document_metadata->'type'IS DISTINCT FROM'"other"'::jsonb
  OR version_row.document_metadata->'issue_date'IS DISTINCT FROM descriptor->'document'->'issue_date'
  OR observed->'object_id'IS DISTINCT FROM p_order.output_object->'object_id'OR observed->'updated_at'IS DISTINCT FROM p_order.output_object->'updated_at'
  OR observed->'provenance'->'byte_sha256'IS DISTINCT FROM p_order.artifact->'byte_sha256'
  OR observed->'byte_size'IS DISTINCT FROM p_order.artifact->'byte_size'
  OR phase_event.result->'source'IS DISTINCT FROM ref OR phase_event.result->'object'IS DISTINCT FROM p_order.output_object
  OR phase_event.result->'byte_sha256'IS DISTINCT FROM p_order.artifact->'byte_sha256'OR phase_event.result->'byte_size'IS DISTINCT FROM p_order.artifact->'byte_size'
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('source',ref,'object',p_order.output_object,'observed_object',observed,
  'file',jsonb_build_object('bucket','org-documents','path',version_row.file_path,'sha256',p_order.artifact->'byte_sha256','bytes',p_order.artifact->'byte_size','mime','application/pdf'));
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.render_context(p_order uc_individual_orders_private.orders,p_actor uuid,p_query jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE ctx jsonb;stage_observed jsonb;output_observed jsonb;output_source jsonb;output_object jsonb;descriptor jsonb;version_row public.org_document_versions;document_row public.org_documents;existing jsonb;
BEGIN
 IF p_order.closed THEN PERFORM uc_individual_orders_private.fail('CLOSED');END IF;
 IF p_order.approved_snapshot IS NULL OR p_order.render_job IS NULL THEN PERFORM uc_individual_orders_private.fail('DECISION_REQUIRED');END IF;
 ctx:=uc_individual_orders_private.context(p_order.organization_id,p_order.enrollment_id,p_actor,'issue');
 IF p_order.registry IS NULL THEN PERFORM uc_individual_orders_private.refresh(p_order,p_actor,'issue');END IF;
 IF p_query->'expected_revision'IS DISTINCT FROM to_jsonb(p_order.approved_order_revision)OR p_query->>'expected_state_sha256'IS DISTINCT FROM p_order.approved_order_sha256
  OR p_query->'render_request_id'IS DISTINCT FROM p_order.render_job->'request_id'THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 PERFORM uc_individual_orders_private.people(array_append(p_order.participant_ids,p_actor),false);
 IF octet_length(p_order.render_input_json)>196608 OR encode(sha256(convert_to(p_order.render_input_json,'UTF8')),'hex')IS DISTINCT FROM p_order.render_job->>'render_input_sha256'
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 descriptor:=uc_individual_orders_private.output_descriptor(p_order);
 stage_observed:=uc_individual_orders_private.observation(p_order,'uc-individual-order-staging');
 IF p_order.render_job->'staging_proof'<>'null'::jsonb THEN
  IF stage_observed IS NULL THEN PERFORM uc_individual_orders_private.fail('SOURCE_UNAVAILABLE');END IF;
  IF stage_observed->'object_id'IS DISTINCT FROM p_order.render_job->'staging_proof'->'object_id'OR stage_observed->'updated_at'IS DISTINCT FROM p_order.render_job->'staging_proof'->'updated_at'
   OR stage_observed->'provenance'->'html_sha256'IS DISTINCT FROM p_order.render_job->'html_sha256'THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 END IF;
 output_observed:=uc_individual_orders_private.observation(p_order,'org-documents');
 SELECT *INTO version_row FROM public.org_document_versions WHERE organization_id=p_order.organization_id AND document_id=p_order.output_document_id AND request_id=p_order.upload_request_id FOR SHARE NOWAIT;
 IF version_row.id IS NOT NULL THEN
  SELECT *INTO document_row FROM public.org_documents WHERE id=p_order.output_document_id AND organization_id=p_order.organization_id FOR SHARE NOWAIT;
  IF p_order.render_job->>'stage'='prepared'OR output_observed IS NULL OR document_row.id IS NULL
   OR p_order.registry IS NULL AND(document_row.deleted_at IS NOT NULL OR document_row.status<>'active')
   OR public.uc_copy_registry_object_matches(version_row)IS NOT TRUE
   OR version_row.file_path IS DISTINCT FROM descriptor->>'file_path'OR version_row.file_name IS DISTINCT FROM descriptor->>'file_name'
   OR version_row.document_metadata->'name'IS DISTINCT FROM descriptor->'document'->'name'OR version_row.document_metadata->'type'IS DISTINCT FROM'"other"'::jsonb
   OR version_row.document_metadata->'issue_date'IS DISTINCT FROM descriptor->'document'->'issue_date'
  THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  output_source:=public.uc_copy_registry_original_ref(version_row);output_object:=jsonb_build_object('object_id',output_observed->'object_id','updated_at',output_observed->'updated_at');
 END IF;
 IF p_order.artifact IS NOT NULL THEN existing:=uc_individual_orders_private.artifact_source(p_order);END IF;
 RETURN jsonb_build_object('version',1,'organization_id',p_order.organization_id,'enrollment_id',p_order.enrollment_id,'subject_user_id',p_order.subject_user_id,'course_id',p_order.course_id,'actor_user_id',p_actor,'order_id',p_order.id,
  'current_order_revision',p_order.revision,'current_order_state_sha256',p_order.state_sha256,'current_order_state',CASE WHEN p_order.registry IS NOT NULL THEN'registered'WHEN p_order.artifact IS NOT NULL THEN'rendered_unregistered'ELSE'approved_unrendered'END,
  'render_job',p_order.render_job,'render_input_json',p_order.render_input_json,'render_input_sha256',p_order.render_job->'render_input_sha256',
  'staging',jsonb_build_object('bucket','uc-individual-order-staging','path',uc_individual_orders_private.stage_path(p_order),'proof',p_order.render_job->'staging_proof','observed_object',stage_observed),
  'output',descriptor||jsonb_build_object('source',output_source,'object',output_object,'observed_object',output_observed,'artifact',p_order.artifact),'registry',p_order.registry);
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.revision(p_value jsonb,p_zero boolean DEFAULT false)RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN jsonb_typeof(p_value)='number'AND(p_value#>>'{}')~'^[0-9]{1,16}$'THEN(p_value#>>'{}')::numeric BETWEEN CASE WHEN p_zero THEN 0 ELSE 1 END AND 9007199254740991 ELSE false END
$fn$;
CREATE FUNCTION uc_individual_orders_private.day(p_value jsonb)RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
BEGIN
 IF jsonb_typeof(p_value)IS DISTINCT FROM'string'OR(p_value#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN RETURN false;END IF;
 RETURN isfinite((p_value#>>'{}')::date)AND to_char((p_value#>>'{}')::date,'YYYY-MM-DD')=p_value#>>'{}';
EXCEPTION WHEN OTHERS THEN RETURN false;END;$fn$;
CREATE FUNCTION uc_individual_orders_private.ref(p_value jsonb)RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_signature_assurance_shape(p_value,ARRAY['kind','document_id','version_id','content_hash'])AND p_value->>'kind'='org_document_version'
 AND public.uc_signature_assurance_uuid(p_value->'document_id')AND public.uc_signature_assurance_uuid(p_value->'version_id')AND public.uc_signature_assurance_sha(p_value->'content_hash'),false)
$fn$;

-- Canonical registered data is observed; identity verification is an explicit
-- later staff declaration, never inferred from login/email or a quiz result.
-- PURE enrollment-only projection of the pinned existing registry context.
-- No authority/cache/state/numbering decision is made here. Owner-only callers
-- must first validate the actual actor/subject/billing/privacy context.
CREATE FUNCTION uc_individual_orders_private.enrollment_binding(p_org uuid,p_enrollment uuid)RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $fn$
DECLARE enrollment_row public.enrollments;course_row public.courses;groups uuid[];binding jsonb;proof jsonb;digest text;label text;
BEGIN
 SELECT x.*INTO enrollment_row FROM public.enrollments x JOIN public.courses y ON y.id=x.course_id WHERE x.id=p_enrollment AND y.organization_id=p_org;
 IF enrollment_row.id IS NULL THEN RETURN NULL;END IF;
 SELECT *INTO course_row FROM public.courses WHERE id=enrollment_row.course_id AND organization_id=p_org;
 SELECT coalesce(array_agg(DISTINCT m.group_id ORDER BY m.group_id),'{}')INTO groups FROM public.student_group_memberships_effective m JOIN public.student_groups g ON g.id=m.group_id
  WHERE m.organization_id=p_org AND m.user_id=enrollment_row.user_id AND(g.course_id IS NULL OR g.course_id=enrollment_row.course_id);
 binding:=jsonb_build_object('kind','enrollment','organization_id',p_org,'enrollment_id',enrollment_row.id,'user_id',enrollment_row.user_id,'course_id',enrollment_row.course_id,
  'enrollment_status',enrollment_row.status,'enrollment_revision',enrollment_row.document_facts_revision,'contract_id',NULL,'contract_student_user_id',NULL,'contract_group_id',NULL,'contract_company_id',NULL,'contract_status',NULL,'contract_updated_at',NULL,'scope_group_id',NULL);
 proof:=jsonb_build_object('binding',binding,'factual_group_ids',to_jsonb(groups),'reason',NULL);
 digest:=public.uc_document_registry_hash(proof::text);
 label:='Зачисление: '||left(coalesce(to_jsonb(course_row)->>'title','Курс'),250)||' · '||left(public.uc_copy_registry_label(enrollment_row.user_id),200)||' · '||left(enrollment_row.status,50);
 RETURN jsonb_build_object('binding',binding||jsonb_build_object('binding_hash',digest),'context',jsonb_build_object('kind','enrollment','enrollment_id',enrollment_row.id,'binding_hash',digest),
  'participants',jsonb_build_array(enrollment_row.user_id),'groups',to_jsonb(groups),'label',left(label,500));
END;$fn$;

CREATE FUNCTION uc_individual_orders_private.context(p_org uuid,p_enrollment uuid,p_actor uuid,p_mode text)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE e public.enrollments;c public.courses;p public.profiles;d public.student_frdo_data;org public.organizations;
 identity jsonb;identity_hash text;binding jsonb;witness jsonb;name text;birth date;req jsonb;
BEGIN
 IF p_mode IS NULL OR p_mode NOT IN('read','write','issue','own')OR p_actor IS NULL OR public.uc_custom_journal_person(p_actor)IS NOT TRUE
  OR billing_access_private.target_allowed(p_org,p_actor)IS NOT TRUE OR public.is_user_blocked(p_actor)IS NOT FALSE
 THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 SELECT x.*INTO e FROM public.enrollments x JOIN public.courses y ON y.id=x.course_id WHERE x.id=p_enrollment AND y.organization_id=p_org FOR SHARE OF x,y NOWAIT;
 IF e.id IS NULL THEN PERFORM uc_individual_orders_private.fail('NOT_FOUND');END IF;
 SELECT *INTO c FROM public.courses WHERE id=e.course_id AND organization_id=p_org;
 SELECT *INTO p FROM public.profiles WHERE user_id=e.user_id AND organization_id=p_org FOR SHARE NOWAIT;
 SELECT *INTO org FROM public.organizations WHERE id=p_org FOR SHARE NOWAIT;
 IF p.id IS NULL OR p.archived_at IS NOT NULL OR public.uc_custom_journal_person(e.user_id)IS NOT TRUE OR org.id IS NULL
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_UNAVAILABLE');END IF;
 IF p_mode='own'THEN
  IF p_actor<>e.user_id THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 ELSE
  IF public.uc_education_actor_org_permission(p_actor,p_org,'documents.read')IS NOT TRUE OR public.uc_platform_document_action_allowed(p_actor,'read')IS NOT TRUE
   OR public.uc_admission_staff_allowed(p_actor,p_org,e.user_id,NULL,e.id,false)IS NOT TRUE OR public.uc_learning_staff(p_actor,p_org,NULL,false)IS NOT TRUE
  THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
  IF p_mode IN('write','issue')AND(public.uc_education_actor_org_permission(p_actor,p_org,'documents.write')IS NOT TRUE OR public.uc_platform_document_action_allowed(p_actor,'write')IS NOT TRUE)
  THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
  IF p_mode='issue'AND public.uc_education_artifact_actor(p_actor,p_org,NULL,e.user_id,e.id)IS NOT TRUE THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 END IF;
 SELECT *INTO d FROM public.student_frdo_data WHERE organization_id=p_org AND user_id=e.user_id FOR SHARE NOWAIT;
 name:=nullif(btrim(p.full_name),'');birth:=d.birth_date;
 identity_hash:=public.uc_program_hash(jsonb_build_object('organization_id',p_org,'profile_id',p.id,'user_id',e.user_id,'full_name',name,'birth_date',birth));
 identity:=jsonb_build_object('source','current_student_registration','profile_id',p.id,'user_id',e.user_id,'full_name',name,'birth_date',birth,'identity_sha256',identity_hash,'name_assurance','registered_data_and_explicit_staff_review');
 -- Registry context checks use the genuine JWT only in staff public paths.
 -- The pure actor-parameter service route separately compares its stored exact
 -- registry snapshot and does not invoke auth-bound context under a fake actor.
 IF auth.role()='authenticated'AND auth.uid()=p_actor AND p_mode<>'own'THEN
  binding:=public.uc_document_registry_context(p_org,NULL,jsonb_build_object('kind','student','user_id',e.user_id),jsonb_build_object('kind','enrollment','enrollment_id',e.id,'binding_hash',repeat('0',64)),false);
 ELSE
  binding:=uc_individual_orders_private.enrollment_binding(p_org,e.id);
 END IF;
 witness:=jsonb_build_object('document_facts_revision',e.document_facts_revision,'registry_context_binding_sha256',binding->'binding'->'binding_hash','identity_sha256',identity_hash);
 req:=jsonb_build_object('name',org.name,'inn',org.inn,'ogrn',org.ogrn,'director_name',org.director_name,'director_position',org.director_position);
 RETURN jsonb_build_object('organization_id',p_org,'enrollment_id',e.id,'subject_user_id',e.user_id,'course_id',e.course_id,
  'student_label',uc_individual_orders_private.bounded(coalesce(name,'Имя не указано'),500),'course_label',uc_individual_orders_private.bounded(coalesce(nullif(btrim(c.title),''),'Курс'),2000),'identity',identity,'enrollment_witness',witness,'registry_context',binding,
  'organization_requisites',req,'organization_requisites_sha256',public.uc_program_hash(req));
END;$fn$;

CREATE FUNCTION uc_individual_orders_private.programme(p_org uuid,p_version uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE v public.program_fact_versions;r public.org_document_reviews;f public.org_document_versions;ref jsonb;approval jsonb;input jsonb;out jsonb;
BEGIN
 SELECT *INTO v FROM public.program_fact_versions WHERE id=p_version AND organization_id=p_org FOR SHARE NOWAIT;
 IF v.id IS NULL THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["PROGRAM_REQUIRED"]');END IF;
 IF v.state<>'approved'OR v.approved_at IS NULL OR v.approved_by IS NULL OR v.facts->>'program_type'='internal_nonformal'
 THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["PROGRAM_NOT_APPROVED"]');END IF;
 PERFORM public.uc_validate_program_facts(v.facts,true);
 IF v.facts_hash IS DISTINCT FROM public.uc_program_hash(v.facts)THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 SELECT *INTO r FROM public.org_document_reviews WHERE id=v.file_review_id AND organization_id=p_org AND document_id=v.file_document_id AND version_id=v.file_version_id FOR SHARE NOWAIT;
 SELECT *INTO f FROM public.org_document_versions WHERE id=v.file_version_id AND document_id=v.file_document_id AND organization_id=p_org FOR SHARE NOWAIT;
 IF r.id IS NULL OR r.state<>'approved'OR r.approval_number IS NULL OR r.approval_date IS NULL OR f.id IS NULL
  OR public.uc_program_active_file_proof(p_org,f.id)IS NOT TRUE OR public.uc_copy_registry_object_matches(f)IS NOT TRUE
 THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["PROGRAM_FILE_UNAVAILABLE"]');END IF;
 ref:=public.uc_copy_registry_original_ref(f);approval:=jsonb_build_object('number',r.approval_number,'date',r.approval_date);
 IF NOT uc_individual_orders_private.ref(ref)OR v.file_approval->>'number'IS DISTINCT FROM r.approval_number OR v.file_approval->'date'IS DISTINCT FROM to_jsonb(r.approval_date)
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 input:=jsonb_build_object('version',1,'organization_id',p_org,'program_id',v.program_id,'version_id',v.id,'version_revision',v.revision,'facts_sha256',v.facts_hash,
  'file',ref,'file_review_id',r.id,'file_review_revision',r.revision,'file_approval',approval,'programme_facts',v.facts,'approved_at',public.uc_signature_assurance_utc(v.approved_at),'approved_by',v.approved_by);
 out:=jsonb_build_object('program_id',v.program_id,'version_id',v.id,'version_revision',v.revision,'facts_sha256',v.facts_hash,'file',ref,'file_review_id',r.id,'file_review_revision',r.revision,'file_approval',approval,'snapshot_sha256',public.uc_program_hash(input));
 RETURN jsonb_build_object('programme',out,'facts',v.facts,'snapshot',input,'participants',to_jsonb(ARRAY[v.created_by,v.approved_by,v.reviewer_user_id,r.approved_by,f.uploaded_by]));
END;$fn$;

-- Remaining W1 helpers/RPCs/guards/privacy delta are appended before this draft
-- receives a final COMMIT/freeze. No partial migration may be executed.
CREATE FUNCTION uc_individual_orders_private.reviewed_source(p_org uuid,p_source jsonb,p_review uuid,p_revision bigint,p_role text)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE v public.org_document_versions;r public.org_document_reviews;d public.org_documents;label text;dt jsonb;
 prior_order uc_individual_orders_private.orders;prior_event uc_individual_orders_private.events;registry_row public.uc_document_registry_records;registry_event public.uc_document_registry_events;
BEGIN
 IF NOT uc_individual_orders_private.ref(p_source)OR p_review IS NULL OR p_revision IS NULL OR p_revision NOT BETWEEN 0 AND 9007199254740991
 THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 IF p_role='prior_admission_order'THEN
  SELECT *INTO prior_order FROM uc_individual_orders_private.orders WHERE organization_id=p_org AND order_kind='admission'AND registry IS NOT NULL AND artifact->'source'=p_source AND NOT closed FOR SHARE NOWAIT;
  SELECT *INTO prior_event FROM uc_individual_orders_private.events WHERE id=p_review AND organization_id=p_org AND order_id=prior_order.id AND revision=p_revision AND row_kind='event'AND action='output_reviewed_and_registered'FOR SHARE NOWAIT;
  SELECT *INTO registry_row FROM public.uc_document_registry_records WHERE id=(prior_order.registry->>'record_id')::uuid AND organization_id=p_org AND NOT redacted FOR SHARE NOWAIT;
  SELECT *INTO registry_event FROM public.uc_document_registry_events WHERE organization_id=p_org AND record_id=registry_row.id AND revision=(prior_order.registry->>'record_revision')::bigint AND action='register'AND NOT redacted FOR SHARE NOWAIT;
  SELECT *INTO v FROM public.org_document_versions WHERE id=(p_source->>'version_id')::uuid AND document_id=(p_source->>'document_id')::uuid AND organization_id=p_org FOR SHARE NOWAIT;
  IF prior_order.id IS NULL OR prior_event.id IS NULL OR prior_order.artifact->'output_review'->>'event_id'IS DISTINCT FROM prior_event.id::text
   OR registry_row.id IS NULL OR registry_event.id IS NULL OR registry_event.snapshot IS DISTINCT FROM prior_order.registered_snapshot
   OR registry_event.snapshot->'data'->'source'IS DISTINCT FROM p_source OR registry_row.data->'source'IS DISTINCT FROM p_source
   OR registry_event.snapshot->'data'->'subject'->>'user_id'IS DISTINCT FROM prior_order.subject_user_id::text
   OR v.id IS NULL OR public.uc_copy_registry_object_matches(v)IS NOT TRUE OR public.uc_copy_registry_original_ref(v)IS DISTINCT FROM p_source
  THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["PRIOR_ADMISSION_REQUIRED"]');END IF;
  RETURN jsonb_build_object('source',p_source,'review_id',prior_event.id,'review_revision',prior_event.revision,
   'label','Приказ о зачислении № '||(prior_order.official_order_number->>'display'),'document_date',prior_order.facts->'dates'->'document_date',
   'review_sha256',public.uc_program_hash(to_jsonb(prior_event)),'participants',to_jsonb(prior_order.participant_ids),
   'prior_enrollment_id',prior_order.enrollment_id,'prior_subject_user_id',prior_order.subject_user_id,'prior_course_id',prior_order.course_id,
   'prior_programme',prior_order.facts->'programme','prior_effective_date',prior_order.facts->'dates'->'effective_date');
 END IF;
 SELECT *INTO v FROM public.org_document_versions WHERE id=(p_source->>'version_id')::uuid AND document_id=(p_source->>'document_id')::uuid AND organization_id=p_org FOR SHARE NOWAIT;
 SELECT *INTO d FROM public.org_documents WHERE id=v.document_id AND organization_id=p_org FOR SHARE NOWAIT;
 SELECT *INTO r FROM public.org_document_reviews WHERE id=p_review AND organization_id=p_org AND document_id=v.document_id AND version_id=v.id FOR SHARE NOWAIT;
 IF v.id IS NULL OR d.id IS NULL OR d.deleted_at IS NOT NULL OR d.status<>'active'OR(d.expires_at IS NOT NULL AND d.expires_at<CURRENT_DATE)
  OR r.id IS NULL OR r.state<>'approved'OR r.revision<>p_revision OR public.uc_copy_registry_object_matches(v)IS NOT TRUE
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_UNAVAILABLE');END IF;
 IF public.uc_copy_registry_original_ref(v)IS DISTINCT FROM p_source THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 label:=uc_individual_orders_private.bounded(coalesce(nullif(v.document_metadata->>'name',''),nullif(v.file_name,''),'Документ'),1000);
 dt:=coalesce(v.document_metadata->'issue_date','null'::jsonb);
 IF dt<>'null'::jsonb AND NOT uc_individual_orders_private.day(dt)THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('source',p_source,'review_id',r.id,'review_revision',r.revision,'label',label,'document_date',dt,
  'review_sha256',public.uc_program_hash(to_jsonb(r)),'participants',to_jsonb(ARRAY[v.uploaded_by,r.approved_by,r.reviewer_user_id]));
END;$fn$;

CREATE FUNCTION uc_individual_orders_private.dates(p_dates jsonb,p_kind text)RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $fn$
DECLARE zone text;
BEGIN
 IF NOT public.uc_signature_assurance_shape(p_dates,ARRAY['document_date','effective_date','training_start_date','training_end_date','timezone'])
  OR NOT uc_individual_orders_private.day(p_dates->'document_date')OR NOT uc_individual_orders_private.day(p_dates->'effective_date')OR NOT uc_individual_orders_private.day(p_dates->'training_start_date')
  OR NOT(p_dates->'training_end_date'='null'::jsonb OR uc_individual_orders_private.day(p_dates->'training_end_date'))
  OR NOT public.uc_signature_assurance_text(p_dates->'timezone',100)
 THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 zone:=p_dates->>'timezone';
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone)THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["TIMEZONE_REQUIRED"]');END IF;
 IF(p_dates->>'document_date')::date>(clock_timestamp()AT TIME ZONE zone)::date
  OR p_dates->'training_end_date'<>'null'::jsonb AND(p_dates->>'training_end_date')::date<(p_dates->>'training_start_date')::date
 THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["DATE_CONFLICT"]');END IF;
 IF p_kind='completion'AND(p_dates->'training_end_date'='null'::jsonb OR(p_dates->>'effective_date')::date<(p_dates->>'training_end_date')::date)
 THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["DATE_REQUIRED"]');END IF;
END;$fn$;

CREATE FUNCTION uc_individual_orders_private.prepare_facts(p_org uuid,p_context jsonb,p_kind text,p_action jsonb,p_binding_check boolean DEFAULT true)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE choice jsonb:=p_action->'programme_choice';program jsonb;basis jsonb:=p_action->'basis';entry jsonb;proof jsonb;proofs jsonb:='[]';roles text[]:='{}';parts uuid[]:='{}';ref jsonb;
 binding_row public.course_program_bindings;name text;req jsonb:=p_context->'organization_requisites';authority_count integer:=0;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('admission','completion','early_withdrawal')OR NOT public.uc_signature_assurance_text(p_action->'grounds',2000)
  OR jsonb_typeof(basis)IS DISTINCT FROM'array'OR jsonb_array_length(basis)NOT BETWEEN 1 AND 10
  OR NOT public.uc_signature_assurance_shape(p_action->'expected_enrollment',ARRAY['document_facts_revision','registry_context_binding_sha256','identity_sha256'])
  OR NOT uc_individual_orders_private.revision(p_action->'expected_enrollment'->'document_facts_revision',true)
  OR NOT public.uc_signature_assurance_sha(p_action->'expected_enrollment'->'registry_context_binding_sha256')
  OR NOT public.uc_signature_assurance_sha(p_action->'expected_enrollment'->'identity_sha256')
 THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 IF p_action->'expected_enrollment'IS DISTINCT FROM p_context->'enrollment_witness'THEN PERFORM uc_individual_orders_private.fail('CONTEXT_CHANGED');END IF;
 IF p_context->'identity'->'full_name'='null'::jsonb OR NOT public.uc_signature_assurance_text(p_context->'identity'->'full_name',500)
 THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["IDENTITY_REQUIRED"]');END IF;
 IF jsonb_typeof(choice)IS DISTINCT FROM'object'OR jsonb_typeof(choice->'kind')IS DISTINCT FROM'string'OR choice->>'kind'NOT IN('individual_selection','course_binding')
  OR NOT public.uc_signature_assurance_shape(choice,CASE choice->>'kind'WHEN'course_binding'THEN ARRAY['kind','expected_binding_revision','programme']ELSE ARRAY['kind','programme','selection_reason']END)
  OR choice->>'kind'='individual_selection'AND NOT public.uc_signature_assurance_text(choice->'selection_reason',2000)
  OR choice->>'kind'='course_binding'AND NOT uc_individual_orders_private.revision(choice->'expected_binding_revision',true)
  OR NOT public.uc_signature_assurance_shape(choice->'programme',ARRAY['program_id','version_id','version_revision','facts_sha256','file','file_review_id','file_review_revision','file_approval','snapshot_sha256'])
  OR NOT public.uc_signature_assurance_uuid(choice->'programme'->'version_id')
 THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 program:=uc_individual_orders_private.programme(p_org,(choice->'programme'->>'version_id')::uuid);
 IF program->'programme'IS DISTINCT FROM choice->'programme'THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 IF p_binding_check AND choice->>'kind'='course_binding'THEN
  SELECT *INTO binding_row FROM public.course_program_bindings WHERE organization_id=p_org AND course_id=(p_context->>'course_id')::uuid FOR SHARE NOWAIT;
  IF binding_row.version_id IS DISTINCT FROM(choice->'programme'->>'version_id')::uuid OR binding_row.program_id IS DISTINCT FROM(choice->'programme'->>'program_id')::uuid
   OR to_jsonb(binding_row.revision)IS DISTINCT FROM choice->'expected_binding_revision'THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 END IF;
 PERFORM uc_individual_orders_private.dates(p_action->'dates',p_kind);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(basis)b GROUP BY b->>'role',b->'source'HAVING count(*)>1)THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(basis)LOOP
  IF NOT public.uc_signature_assurance_shape(entry,ARRAY['role','source','review_id','review_revision','provision'])
   OR jsonb_typeof(entry->'role')IS DISTINCT FROM'string'OR entry->>'role'NOT IN('application','education_contract','local_admission_rule','prior_admission_order','final_protocol','withdrawal_request','termination_ground','authority_document')
   OR NOT public.uc_signature_assurance_uuid(entry->'review_id')OR NOT uc_individual_orders_private.revision(entry->'review_revision',true)
   OR NOT public.uc_signature_assurance_text(entry->'provision',2000)THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
  proof:=uc_individual_orders_private.reviewed_source(p_org,entry->'source',(entry->>'review_id')::uuid,(entry->>'review_revision')::bigint,entry->>'role');
  IF entry->>'role'='prior_admission_order'AND(proof->'prior_enrollment_id'IS DISTINCT FROM p_context->'enrollment_id'
   OR proof->'prior_subject_user_id'IS DISTINCT FROM p_context->'subject_user_id'OR proof->'prior_course_id'IS DISTINCT FROM p_context->'course_id'
   OR proof->'prior_programme'IS DISTINCT FROM program->'programme')THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["PRIOR_ADMISSION_REQUIRED"]');END IF;
  proofs:=proofs||jsonb_build_array(proof||jsonb_build_object('role',entry->'role','provision',entry->'provision'));
  roles:=array_append(roles,entry->>'role');IF entry->>'role'='authority_document'THEN authority_count:=authority_count+1;END IF;
  SELECT coalesce(array_agg(DISTINCT value::uuid ORDER BY value::uuid),'{}')INTO parts FROM jsonb_array_elements_text(to_jsonb(parts)||(proof->'participants'))WHERE value IS NOT NULL;
 END LOOP;
 IF authority_count=0 THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["AUTHORITY_BASIS_REQUIRED"]');END IF;
 IF p_kind='admission'AND NOT(roles&&ARRAY['application','education_contract'])THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["ADMISSION_BASIS_REQUIRED"]');END IF;
 IF p_kind<>'admission'AND NOT('prior_admission_order'=ANY(roles))THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["PRIOR_ADMISSION_REQUIRED"]');END IF;
 IF p_kind='completion'AND NOT('final_protocol'=ANY(roles))THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["FINAL_PROTOCOL_REQUIRED"]');END IF;
 IF p_kind='early_withdrawal'AND NOT(roles&&ARRAY['withdrawal_request','termination_ground'])THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["WITHDRAWAL_GROUND_REQUIRED"]');END IF;
 IF NOT public.uc_signature_assurance_text(req->'name',1000)OR NOT public.uc_signature_assurance_text(req->'director_name',500)OR NOT public.uc_signature_assurance_text(req->'director_position',300)
 THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["SIGNATORY_REQUIRED"]');END IF;
 IF req->'inn'<>'null'::jsonb AND NOT public.uc_signature_assurance_text(req->'inn',20,true)
  OR req->'ogrn'<>'null'::jsonb AND NOT public.uc_signature_assurance_text(req->'ogrn',20,true)THEN PERFORM uc_individual_orders_private.fail('LIMIT_EXCEEDED');END IF;
 SELECT coalesce(array_agg(DISTINCT value::uuid ORDER BY value::uuid),'{}')INTO parts FROM jsonb_array_elements_text(to_jsonb(parts)||(program->'participants')||jsonb_build_array(p_context->'subject_user_id',auth.uid()))WHERE value IS NOT NULL;
 RETURN jsonb_build_object('facts',jsonb_build_object('programme',program->'programme','programme_facts',program->'facts','identity_snapshot',p_context->'identity','dates',p_action->'dates','basis',basis,'grounds',p_action->'grounds'),
  'witness',jsonb_build_object('enrollment',p_context->'enrollment_witness','registry_context',p_context->'registry_context','programme_choice',choice,'programme_snapshot',program->'snapshot','basis',proofs,
   'organization_requisites',req,'organization_requisites_sha256',p_context->'organization_requisites_sha256'),'participants',to_jsonb(parts));
END;$fn$;

CREATE FUNCTION uc_individual_orders_private.people(p_people uuid[],p_write boolean)RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE person_id uuid;
BEGIN
 IF cardinality(coalesce(p_people,'{}'))>100 THEN PERFORM uc_individual_orders_private.fail('LIMIT_EXCEEDED');END IF;
 FOR person_id IN SELECT DISTINCT value FROM unnest(coalesce(p_people,'{}'))value WHERE value IS NOT NULL ORDER BY value LOOP
  IF p_write THEN
   IF NOT pg_try_advisory_xact_lock(hashtextextended(person_id::text,42007))THEN PERFORM uc_individual_orders_private.fail('REVISION_CONFLICT');END IF;
  ELSE
   IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(person_id::text,42007))THEN PERFORM uc_individual_orders_private.fail('REVISION_CONFLICT');END IF;
  END IF;
  IF public.uc_custom_journal_person(person_id)IS NOT TRUE THEN PERFORM uc_individual_orders_private.fail('SOURCE_UNAVAILABLE');END IF;
 END LOOP;
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.head_hash(p_order uc_individual_orders_private.orders)RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
 SELECT public.uc_program_hash(to_jsonb(p_order)-ARRAY['state_sha256','updated_at','updated_by'])
$fn$;
CREATE FUNCTION uc_individual_orders_private.refresh(p_order uc_individual_orders_private.orders,p_actor uuid,p_mode text DEFAULT'issue')RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx jsonb;prepared jsonb;action jsonb;
BEGIN
 ctx:=uc_individual_orders_private.context(p_order.organization_id,p_order.enrollment_id,p_actor,p_mode);
 IF ctx->>'subject_user_id'IS DISTINCT FROM p_order.subject_user_id::text OR ctx->>'course_id'IS DISTINCT FROM p_order.course_id::text THEN PERFORM uc_individual_orders_private.fail('CONTEXT_CHANGED');END IF;
 action:=jsonb_build_object('expected_enrollment',p_order.source_witness->'enrollment','programme_choice',p_order.source_witness->'programme_choice','dates',p_order.facts->'dates','basis',p_order.facts->'basis','grounds',p_order.facts->'grounds');
 prepared:=uc_individual_orders_private.prepare_facts(p_order.organization_id,ctx,p_order.order_kind,action,false);
 -- A newer course/programme pointer is NOT a change to the selected immutable
 -- approved edition. Compare pinned programme/file/review facts, not pointers.
 -- A mutable reporting label likewise does not change registry binding facts.
 IF prepared->'facts'IS DISTINCT FROM p_order.facts
  OR(prepared->'witness'-'registry_context')IS DISTINCT FROM(p_order.source_witness-'registry_context')
  OR prepared->'witness'->'registry_context'->'binding'IS DISTINCT FROM p_order.source_witness->'registry_context'->'binding'
  OR prepared->'witness'->'registry_context'->'groups'IS DISTINCT FROM p_order.source_witness->'registry_context'->'groups'
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 RETURN ctx;
END;$fn$;

CREATE FUNCTION uc_individual_orders_private.persist_head(p_order uc_individual_orders_private.orders,p_insert boolean)RETURNS uc_individual_orders_private.orders
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE saved uc_individual_orders_private.orders;
BEGIN
 p_order.state_sha256:=uc_individual_orders_private.head_hash(p_order);
 IF p_insert THEN INSERT INTO uc_individual_orders_private.orders SELECT(p_order).*RETURNING*INTO saved;
 ELSE
  UPDATE uc_individual_orders_private.orders SET revision=p_order.revision,state_sha256=p_order.state_sha256,facts=p_order.facts,source_witness=p_order.source_witness,
   approved_snapshot=p_order.approved_snapshot,approved_order_revision=p_order.approved_order_revision,approved_order_sha256=p_order.approved_order_sha256,
   decision=p_order.decision,official_order_number=p_order.official_order_number,render_job=p_order.render_job,render_input_json=p_order.render_input_json,
   artifact=p_order.artifact,output_object=p_order.output_object,registry=p_order.registry,registered_snapshot=p_order.registered_snapshot,participant_ids=p_order.participant_ids,
   closed=p_order.closed,updated_by=p_order.updated_by,updated_at=p_order.updated_at
  WHERE id=p_order.id AND organization_id=p_order.organization_id AND revision=p_order.revision-1 RETURNING*INTO saved;
  IF saved.id IS NULL THEN PERFORM uc_individual_orders_private.fail('REVISION_CONFLICT');END IF;
 END IF;
 RETURN saved;
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.record_event(p_order uc_individual_orders_private.orders,p_event uuid,p_actor uuid,p_request uuid,p_payload text,p_action text,p_reason text,p_before text,p_result jsonb,p_at timestamptz)RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
BEGIN
 INSERT INTO uc_individual_orders_private.events(id,organization_id,order_id,revision,row_kind,action,request_id,payload_sha256,actor_user_id,server_at,before_sha256,after_sha256,reason,participant_ids,result)
 VALUES(p_event,p_order.organization_id,p_order.id,p_order.revision,'event',p_action,p_request,p_payload,p_actor,p_at,p_before,p_order.state_sha256,p_reason,
  ARRAY(SELECT DISTINCT value FROM unnest(array_append(p_order.participant_ids,p_actor))value WHERE value IS NOT NULL ORDER BY value),p_result);
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.receipt_alias(p_original uc_individual_orders_private.events,p_actor uuid,p_request uuid,p_payload text)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE result jsonb;canonical_event uc_individual_orders_private.events;
BEGIN
 IF p_original.row_kind='request_receipt'THEN SELECT *INTO canonical_event FROM uc_individual_orders_private.events WHERE id=p_original.original_event_id AND row_kind='event';ELSE canonical_event:=p_original;END IF;
 IF canonical_event.id IS NULL THEN PERFORM uc_individual_orders_private.fail('DEPENDENCY_UNAVAILABLE');END IF;
 result:=canonical_event.result||jsonb_build_object('replayed',true);
 IF result->>'kind'='apply'THEN result:=result||jsonb_build_object('actor_user_id',p_actor,'request_id',p_request);END IF;
 INSERT INTO uc_individual_orders_private.events(id,organization_id,order_id,revision,row_kind,action,original_event_id,request_id,payload_sha256,actor_user_id,before_sha256,after_sha256,reason,participant_ids,result)
 VALUES(gen_random_uuid(),canonical_event.organization_id,canonical_event.order_id,canonical_event.revision,'request_receipt',canonical_event.action,canonical_event.id,p_request,p_payload,p_actor,
  canonical_event.before_sha256,canonical_event.after_sha256,'Повтор уже выполненного действия; новый документ, решение и номер не создавались.',
  ARRAY(SELECT DISTINCT value FROM unnest(array_append(canonical_event.participant_ids,p_actor))value WHERE value IS NOT NULL ORDER BY value),result);
 RETURN result;
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.make_approved(p_order uc_individual_orders_private.orders)RETURNS uc_individual_orders_private.orders
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE variables jsonb;input jsonb;job_id uuid:=gen_random_uuid();render_request uuid:=gen_random_uuid();input_hash text;
BEGIN
 variables:=uc_individual_orders_private.variables(p_order);
 p_order.approved_order_revision:=p_order.revision;
 -- Deliberately exclude self-hash and all render/job/output references. This
 -- immutable approved snapshot is a DAG witness, not a self-referential hash.
 p_order.approved_snapshot:=jsonb_build_object('version',1,'organization_id',p_order.organization_id,'enrollment_id',p_order.enrollment_id,'subject_user_id',p_order.subject_user_id,'course_id',p_order.course_id,
  'order_id',p_order.id,'approved_order_revision',p_order.revision,'order_kind',p_order.order_kind,'facts',p_order.facts,'source_witness',p_order.source_witness,
  'decision',p_order.decision,'official_order_number',p_order.official_order_number,'variables',variables,'participant_ids',to_jsonb(p_order.participant_ids));
 p_order.approved_order_sha256:=public.uc_program_hash(p_order.approved_snapshot);
 input:=jsonb_build_object('version',1,'organization_id',p_order.organization_id,'enrollment_id',p_order.enrollment_id,'subject_user_id',p_order.subject_user_id,'course_id',p_order.course_id,'order_id',p_order.id,
  'approved_order_revision',p_order.approved_order_revision,'approved_order_sha256',p_order.approved_order_sha256,'render_job_id',job_id,'render_generation',1,
  'programme',p_order.facts->'programme','programme_facts',p_order.facts->'programme_facts','identity_snapshot',p_order.facts->'identity_snapshot','dates',p_order.facts->'dates',
  'official_order_number',p_order.official_order_number,'decision',p_order.decision,'variables',variables,'renderer','browserless','renderer_revision','uc-individual-order-v1');
 p_order.render_input_json:=input::text;
 IF octet_length(p_order.render_input_json)>196608 THEN PERFORM uc_individual_orders_private.fail('LIMIT_EXCEEDED');END IF;
 input_hash:=encode(sha256(convert_to(p_order.render_input_json,'UTF8')),'hex');
 p_order.render_job:=jsonb_build_object('id',job_id,'generation',1,'request_id',render_request,'approved_order_revision',p_order.approved_order_revision,'approved_order_sha256',p_order.approved_order_sha256,
  'render_input_sha256',input_hash,'html_sha256',NULL,'renderer','browserless','renderer_revision','uc-individual-order-v1','stage','prepared','staging_proof',NULL);
 RETURN p_order;
END;$fn$;

CREATE FUNCTION public.apply_individual_education_order(p_organization_id uuid,p_enrollment_id uuid,p_expected_revision bigint,p_request_id uuid,p_action jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms' SET TimeZone='UTC'AS $fn$
DECLARE actual_actor uuid:=auth.uid();op text:=p_action->>'action';ctx jsonb;digest text;head_row uc_individual_orders_private.orders;old_receipt uc_individual_orders_private.events;
 original_event uc_individual_orders_private.events;prepared jsonb;people uuid[];family_key text;event_id uuid:=gen_random_uuid();old_hash text;reason text;at_time timestamptz:=clock_timestamp();reply jsonb;registry_reply jsonb;registry_row public.uc_document_registry_records;registration_event public.uc_document_registry_events;artifact_proof jsonb;reg_action jsonb;number_value integer;year_value integer;detail text;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR actual_actor IS NULL OR public.account_deletion_access_allowed()IS NOT TRUE THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 IF p_organization_id IS NULL OR p_enrollment_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991
  OR octet_length(p_action::text)>196608 OR jsonb_typeof(p_action)IS DISTINCT FROM'object'OR p_action->'version'IS DISTINCT FROM'1'::jsonb OR op IS NULL OR op NOT IN('prepare','revise_draft','approve','register')
 THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 IF NOT public.uc_signature_assurance_shape(p_action,CASE op
  WHEN'prepare'THEN ARRAY['version','action','order_kind','expected_enrollment','programme_choice','dates','basis','grounds']
  WHEN'revise_draft'THEN ARRAY['version','action','order_id','expected_state_sha256','expected_enrollment','programme_choice','dates','basis','grounds','reason']
  WHEN'approve'THEN ARRAY['version','action','order_id','expected_state_sha256','expected_enrollment','expected_programme','decision','reason']
  ELSE ARRAY['version','action','order_id','expected_state_sha256','expected_artifact','pdf_review_confirmed','reason']END)
 THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 IF op<>'prepare'AND(NOT public.uc_signature_assurance_uuid(p_action->'order_id')OR NOT public.uc_signature_assurance_sha(p_action->'expected_state_sha256')OR NOT public.uc_signature_assurance_text(p_action->'reason',2000))THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 ctx:=uc_individual_orders_private.context(p_organization_id,p_enrollment_id,actual_actor,CASE WHEN op IN('approve','register')THEN'issue'ELSE'write'END);
 digest:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'enrollment_id',p_enrollment_id,'expected_revision',p_expected_revision,'action',p_action));
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_individual_order_request:'||actual_actor::text||':'||p_request_id::text,0))THEN PERFORM uc_individual_orders_private.fail('REVISION_CONFLICT');END IF;
 SELECT *INTO old_receipt FROM uc_individual_orders_private.events WHERE actor_user_id=actual_actor AND request_id=p_request_id FOR SHARE NOWAIT;
 IF old_receipt.id IS NOT NULL THEN
  IF old_receipt.payload_sha256<>digest OR old_receipt.organization_id<>p_organization_id THEN PERFORM uc_individual_orders_private.fail('REQUEST_CONFLICT');END IF;
  SELECT *INTO head_row FROM uc_individual_orders_private.orders WHERE id=old_receipt.order_id AND organization_id=p_organization_id AND enrollment_id=p_enrollment_id;
  IF head_row.id IS NULL OR head_row.subject_user_id::text IS DISTINCT FROM ctx->>'subject_user_id'OR head_row.course_id::text IS DISTINCT FROM ctx->>'course_id'THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
  PERFORM uc_individual_orders_private.people(array_append(head_row.participant_ids,actual_actor),true);
  PERFORM public.uc_signature_assurance_fence(p_organization_id,head_row.participant_ids,true,NULL,NULL,actual_actor);
  PERFORM uc_individual_orders_private.context(p_organization_id,p_enrollment_id,actual_actor,CASE WHEN op IN('approve','register')THEN'issue'ELSE'write'END);
  RETURN old_receipt.result||jsonb_build_object('replayed',true);
 END IF;
 IF op='prepare'THEN
  IF p_expected_revision<>0 OR jsonb_typeof(p_action->'order_kind')IS DISTINCT FROM'string'OR p_action->>'order_kind'NOT IN('admission','completion','early_withdrawal')THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
  prepared:=uc_individual_orders_private.prepare_facts(p_organization_id,ctx,p_action->>'order_kind',p_action,true);
  SELECT array_agg(value::uuid ORDER BY value::uuid)INTO people FROM jsonb_array_elements_text(prepared->'participants');
  PERFORM uc_individual_orders_private.people(people,true);PERFORM public.uc_signature_assurance_fence(p_organization_id,people,true,NULL,NULL,actual_actor);
  family_key:=CASE WHEN p_action->>'order_kind'='admission'THEN'admission'ELSE'termination'END;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_individual_order_family:'||p_organization_id::text||':'||p_enrollment_id::text||':'||family_key,0))THEN PERFORM uc_individual_orders_private.fail('REVISION_CONFLICT');END IF;
  SELECT *INTO head_row FROM uc_individual_orders_private.orders WHERE organization_id=p_organization_id AND enrollment_id=p_enrollment_id AND orders.family=family_key FOR UPDATE NOWAIT;
  IF head_row.id IS NOT NULL THEN
   IF head_row.facts IS DISTINCT FROM prepared->'facts'OR head_row.order_kind<>p_action->>'order_kind'THEN PERFORM uc_individual_orders_private.fail('ORDER_EXISTS');END IF;
   SELECT *INTO original_event FROM uc_individual_orders_private.events WHERE order_id=head_row.id AND row_kind='event'AND action='prepared'ORDER BY revision LIMIT 1;
   RETURN uc_individual_orders_private.receipt_alias(original_event,actual_actor,p_request_id,digest);
  END IF;
  IF EXISTS(SELECT 1 FROM public.uc_document_registry_records r WHERE r.organization_id=p_organization_id AND NOT r.redacted
   AND r.context_binding->>'enrollment_id'=p_enrollment_id::text AND r.context_binding->>'user_id'=ctx->>'subject_user_id'AND r.context_binding->>'course_id'=ctx->>'course_id'
   AND r.data->>'document_type'=CASE family_key WHEN'admission'THEN'enrollment_order'ELSE'expulsion_order'END)
  THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["EXISTING_ORDER_REVIEW_REQUIRED"]');END IF;
  head_row:=jsonb_populate_record(NULL::uc_individual_orders_private.orders,jsonb_build_object('id',gen_random_uuid(),'organization_id',p_organization_id,'enrollment_id',p_enrollment_id,'subject_user_id',ctx->'subject_user_id','course_id',ctx->'course_id',
   'order_kind',p_action->'order_kind','family',family_key,'revision',1,'state_sha256',repeat('0',64),'facts',prepared->'facts','source_witness',prepared->'witness',
   'staging_attest_request_id',gen_random_uuid(),'output_attest_request_id',gen_random_uuid(),'output_document_id',gen_random_uuid(),'upload_request_id',gen_random_uuid(),'registry_request_id',gen_random_uuid(),
   'participant_ids',to_jsonb(people),'closed',false,'created_by',actual_actor,'created_at',at_time,'updated_by',actual_actor,'updated_at',at_time));
  head_row:=uc_individual_orders_private.persist_head(head_row,true);reason:='Подготовлен индивидуальный проект; решения, подписи и регистрационного номера ещё нет.';op:='prepared';
 ELSE
  SELECT *INTO head_row FROM uc_individual_orders_private.orders WHERE id=(p_action->>'order_id')::uuid AND organization_id=p_organization_id AND enrollment_id=p_enrollment_id FOR UPDATE NOWAIT;
  IF head_row.id IS NULL THEN PERFORM uc_individual_orders_private.fail('NOT_FOUND');END IF;
  IF head_row.subject_user_id::text IS DISTINCT FROM ctx->>'subject_user_id'OR head_row.course_id::text IS DISTINCT FROM ctx->>'course_id'THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
  people:=ARRAY(SELECT DISTINCT value FROM unnest(array_append(head_row.participant_ids,actual_actor))value WHERE value IS NOT NULL ORDER BY value);
  PERFORM uc_individual_orders_private.people(people,true);PERFORM public.uc_signature_assurance_fence(p_organization_id,people,true,NULL,NULL,actual_actor);
  ctx:=uc_individual_orders_private.context(p_organization_id,p_enrollment_id,actual_actor,CASE WHEN op IN('approve','register')THEN'issue'ELSE'write'END);
  IF op='register'AND head_row.registry IS NOT NULL THEN
   IF p_action->'expected_artifact'IS DISTINCT FROM(head_row.artifact-'output_review')OR p_action->'pdf_review_confirmed'IS DISTINCT FROM'true'::jsonb THEN PERFORM uc_individual_orders_private.fail('REQUEST_CONFLICT');END IF;
   SELECT *INTO original_event FROM uc_individual_orders_private.events WHERE order_id=head_row.id AND row_kind='event'AND action='output_reviewed_and_registered'ORDER BY revision LIMIT 1;
   RETURN uc_individual_orders_private.receipt_alias(original_event,actual_actor,p_request_id,digest);
  END IF;
  IF head_row.closed THEN PERFORM uc_individual_orders_private.fail('CLOSED');END IF;
  IF head_row.revision<>p_expected_revision OR p_action->>'expected_state_sha256'IS DISTINCT FROM head_row.state_sha256 THEN PERFORM uc_individual_orders_private.fail('REVISION_CONFLICT');END IF;
  IF head_row.revision>=9007199254740991 THEN PERFORM uc_individual_orders_private.fail('LIMIT_EXCEEDED');END IF;
  old_hash:=head_row.state_sha256;reason:=p_action->>'reason';head_row.revision:=head_row.revision+1;head_row.updated_by:=actual_actor;head_row.updated_at:=at_time;head_row.participant_ids:=people;
  IF op='revise_draft'THEN
   IF head_row.approved_snapshot IS NOT NULL THEN PERFORM uc_individual_orders_private.fail('CLOSED');END IF;
   prepared:=uc_individual_orders_private.prepare_facts(p_organization_id,ctx,head_row.order_kind,p_action,true);
   SELECT array_agg(DISTINCT value::uuid ORDER BY value::uuid)INTO head_row.participant_ids FROM jsonb_array_elements_text(to_jsonb(people)||(prepared->'participants'));
   PERFORM uc_individual_orders_private.people(head_row.participant_ids,true);
   head_row.facts:=prepared->'facts';head_row.source_witness:=prepared->'witness';op:='draft_revised';
  ELSIF op='approve'THEN
   IF head_row.approved_snapshot IS NOT NULL THEN PERFORM uc_individual_orders_private.fail('CLOSED');END IF;
   IF p_action->'expected_enrollment'IS DISTINCT FROM ctx->'enrollment_witness'OR p_action->'expected_programme'IS DISTINCT FROM head_row.facts->'programme'THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
   PERFORM uc_individual_orders_private.refresh(head_row,actual_actor,'issue');PERFORM uc_individual_orders_private.decision_check(head_row,p_action->'decision');
   IF public.uc_document_registry_caps(p_organization_id,NULL)->'can_register'IS DISTINCT FROM'true'::jsonb THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
   year_value:=extract(year FROM(head_row.facts->'dates'->>'document_date')::date)::integer;
   number_value:=public.reserve_group_document_number(p_organization_id,NULL,'group_order',year_value);
   head_row.official_order_number:=jsonb_build_object('namespace','group_order','year',year_value,'sequence_number',number_value,'display','УЦ-'||number_value::text||'/'||year_value::text,'reserved_at',public.uc_signature_assurance_utc(at_time));
   head_row.decision:=jsonb_build_object('event_id',event_id,'kind',p_action->'decision'->'kind','actor_user_id',actual_actor,'server_at',public.uc_signature_assurance_utc(at_time),'payload_sha256',digest,'decision',p_action->'decision');
   head_row:=uc_individual_orders_private.make_approved(head_row);op:='approved';
  ELSE
   IF head_row.artifact IS NULL THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["RENDER_REQUIRED"]');END IF;
   IF p_action->'pdf_review_confirmed'IS DISTINCT FROM'true'::jsonb THEN PERFORM uc_individual_orders_private.fail('OUTPUT_REVIEW_REQUIRED');END IF;
   IF p_action->'expected_artifact'IS DISTINCT FROM(head_row.artifact-'output_review')THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
   PERFORM uc_individual_orders_private.refresh(head_row,actual_actor,'issue');artifact_proof:=uc_individual_orders_private.artifact_source(head_row);
   reg_action:=jsonb_build_object('action','register','data',jsonb_build_object('direction','outgoing','document_type',CASE head_row.order_kind WHEN'admission'THEN'enrollment_order'ELSE'expulsion_order'END,
    'title',uc_individual_orders_private.output_descriptor(head_row)->'document'->'name','document_date',head_row.facts->'dates'->'document_date','declared_document_number',head_row.official_order_number->'display','source',head_row.artifact->'source',
    'sender',jsonb_build_object('kind','organization','organization_id',p_organization_id),'recipient',jsonb_build_object('kind','student','user_id',head_row.subject_user_id),'subject',jsonb_build_object('kind','student','user_id',head_row.subject_user_id),
    'context',ctx->'registry_context'->'context','notes',uc_individual_orders_private.bounded(head_row.order_kind||': '||reason,2000),'origin',jsonb_build_object('kind','org_document')),'reason',reason);
   registry_reply:=public.apply_document_registry_action(p_organization_id,'{"kind":"organization"}',0,head_row.registry_request_id,reg_action);
   IF registry_reply->'ok'='false'::jsonb THEN PERFORM uc_individual_orders_private.fail('DEPENDENCY_UNAVAILABLE');END IF;
   SELECT r.*INTO registry_row FROM public.uc_document_registry_records r JOIN public.uc_document_registry_requests q ON q.organization_id=r.organization_id AND q.actor_id=actual_actor AND q.request_id=head_row.registry_request_id
    WHERE r.organization_id=p_organization_id AND r.id::text=coalesce(q.result->'record'->>'id',q.result->>'record_id')FOR SHARE OF r NOWAIT;
   IF registry_row.id IS NULL THEN PERFORM uc_individual_orders_private.fail('DEPENDENCY_UNAVAILABLE');END IF;
   SELECT *INTO registration_event FROM public.uc_document_registry_events WHERE organization_id=p_organization_id AND record_id=registry_row.id AND revision=registry_row.revision AND action='register'AND NOT redacted FOR SHARE NOWAIT;
   IF registration_event.id IS NULL OR registry_row.data IS DISTINCT FROM reg_action->'data'OR registry_row.data->'source'IS DISTINCT FROM head_row.artifact->'source'THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
   head_row.registered_snapshot:=registration_event.snapshot;
   head_row.registry:=jsonb_build_object('record_id',registry_row.id,'record_revision',registry_row.revision,'registration_id',registry_row.registration_id,'registered_at',public.uc_signature_assurance_utc(registry_row.registered_at),'source',head_row.artifact->'source');
   head_row.artifact:=head_row.artifact||jsonb_build_object('output_review',jsonb_build_object('event_id',event_id,'actor_user_id',actual_actor,'server_at',public.uc_signature_assurance_utc(at_time),'artifact_byte_sha256',head_row.artifact->'byte_sha256'));op:='output_reviewed_and_registered';
  END IF;
  head_row:=uc_individual_orders_private.persist_head(head_row,false);
 END IF;
 reply:=jsonb_build_object('version',1,'ok',true,'organization_id',p_organization_id,'actor_user_id',actual_actor,'enrollment_id',p_enrollment_id,'subject_user_id',head_row.subject_user_id,'course_id',head_row.course_id,
  'kind','apply','request_id',p_request_id,'replayed',false,'event_id',event_id,'revision_applied',head_row.revision,'order',uc_individual_orders_private.project(head_row,actual_actor));
 PERFORM uc_individual_orders_private.record_event(head_row,event_id,actual_actor,p_request_id,digest,op,reason,old_hash,reply,at_time);
 RETURN reply;
EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;RETURN uc_individual_orders_private.failure(SQLERRM,SQLSTATE,detail);
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.variables(p_order uc_individual_orders_private.orders)RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $fn$
DECLARE facts jsonb:=p_order.facts;req jsonb:=p_order.source_witness->'organization_requisites';authority jsonb;labels jsonb;kind_label text;out jsonb;
BEGIN
 SELECT value INTO authority FROM jsonb_array_elements(facts->'basis')WITH ORDINALITY b(value,n)WHERE value->>'role'='authority_document'ORDER BY n LIMIT 1;
 SELECT jsonb_agg(uc_individual_orders_private.bounded((value->>'label')||' — '||(value->>'provision'),2000)ORDER BY n)INTO labels FROM jsonb_array_elements(p_order.source_witness->'basis')WITH ORDINALITY b(value,n);
 kind_label:=CASE facts->'programme_facts'->>'program_type'
  WHEN'professional_training'THEN'программа профессионального обучения'
  WHEN'dpo_upskilling'THEN'дополнительная профессиональная программа повышения квалификации'
  WHEN'dpo_retraining'THEN'дополнительная профессиональная программа профессиональной переподготовки'END;
 IF authority IS NULL OR kind_label IS NULL OR p_order.decision IS NULL OR p_order.official_order_number IS NULL THEN PERFORM uc_individual_orders_private.fail('DEPENDENCY_UNAVAILABLE');END IF;
 out:=jsonb_build_object('organization_name',req->'name','organization_inn',req->'inn','organization_ogrn',req->'ogrn',
  'organization_requisites_sha256',p_order.source_witness->'organization_requisites_sha256','issuer_name',req->'director_name','issuer_position',req->'director_position','issuer_authority_basis',authority,
  'student_full_name',facts->'identity_snapshot'->'full_name','programme_type',facts->'programme_facts'->'program_type','programme_type_label',kind_label,'programme_title',facts->'programme_facts'->'full_title','academic_hours',facts->'programme_facts'->'academic_hours',
  'order_kind',p_order.order_kind,'official_order_number',p_order.official_order_number->'display','document_date',facts->'dates'->'document_date','effective_date',facts->'dates'->'effective_date','training_start_date',facts->'dates'->'training_start_date','training_end_date',facts->'dates'->'training_end_date','timezone',facts->'dates'->'timezone',
  'grounds_text',facts->'grounds','basis_labels',labels,'decision_event_id',p_order.decision->'event_id','decision_recorded_at',p_order.decision->'server_at','signature_assurance','not_observed');
 RETURN out;
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.decision_check(p_order uc_individual_orders_private.orders,p_decision jsonb)RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $fn$
DECLARE prior jsonb;protocol jsonb;ground jsonb;
BEGIN
 IF NOT public.uc_signature_assurance_text(p_decision->'grounds',2000)OR p_decision->'authority_checked'IS DISTINCT FROM'true'::jsonb THEN PERFORM uc_individual_orders_private.fail('DECISION_REQUIRED');END IF;
 IF p_decision->'grounds'IS DISTINCT FROM p_order.facts->'grounds'THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 IF p_order.order_kind='admission'THEN
  IF NOT public.uc_signature_assurance_shape(p_decision,ARRAY['kind','facts_checked','authority_checked','programme_checked','grounds'])OR p_decision->>'kind'IS DISTINCT FROM'admit'
   OR p_decision->'facts_checked'IS DISTINCT FROM'true'::jsonb OR p_decision->'programme_checked'IS DISTINCT FROM'true'::jsonb THEN PERFORM uc_individual_orders_private.fail('DECISION_REQUIRED');END IF;
  RETURN;
 END IF;
 SELECT value INTO prior FROM jsonb_array_elements(p_order.source_witness->'basis')WHERE value->>'role'='prior_admission_order'LIMIT 1;
 IF prior IS NULL OR(p_order.facts->'dates'->>'effective_date')::date<(prior->>'prior_effective_date')::date THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["DATE_CONFLICT"]');END IF;
 IF p_order.order_kind='completion'THEN
  IF NOT public.uc_signature_assurance_shape(p_decision,ARRAY['kind','final_protocol_source','final_protocol_checked','required_practice_checked','attestation_criteria_checked','actual_outcome','authority_checked','grounds'])
   OR p_decision->>'kind'IS DISTINCT FROM'complete'OR p_decision->'final_protocol_checked'IS DISTINCT FROM'true'::jsonb OR p_decision->'required_practice_checked'IS DISTINCT FROM'true'::jsonb
   OR p_decision->'attestation_criteria_checked'IS DISTINCT FROM'true'::jsonb OR p_decision->>'actual_outcome'IS DISTINCT FROM'passed'THEN PERFORM uc_individual_orders_private.fail('DECISION_REQUIRED');END IF;
  SELECT value INTO protocol FROM jsonb_array_elements(p_order.source_witness->'basis')WHERE value->>'role'='final_protocol'AND value->'source'=p_decision->'final_protocol_source'LIMIT 1;
  IF protocol IS NULL THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["FINAL_PROTOCOL_REQUIRED"]');END IF;
  IF protocol->'document_date'='null'::jsonb THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["DATE_REQUIRED"]');END IF;
  IF(p_order.facts->'dates'->>'effective_date')::date<(protocol->>'document_date')::date THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["DATE_CONFLICT"]');END IF;
 ELSE
  IF NOT public.uc_signature_assurance_shape(p_decision,ARRAY['kind','ground_kind','ground_source','ground_checked','no_completion_award','authority_checked','grounds'])OR p_decision->>'kind'IS DISTINCT FROM'terminate_early'
   OR jsonb_typeof(p_decision->'ground_kind')IS DISTINCT FROM'string'OR p_decision->>'ground_kind'NOT IN('learner_request','organization_decision','independent_circumstances')OR p_decision->'ground_checked'IS DISTINCT FROM'true'::jsonb OR p_decision->'no_completion_award'IS DISTINCT FROM'true'::jsonb
  THEN PERFORM uc_individual_orders_private.fail('DECISION_REQUIRED');END IF;
  SELECT value INTO ground FROM jsonb_array_elements(p_order.source_witness->'basis')WHERE value->>'role'IN('withdrawal_request','termination_ground')AND value->'source'=p_decision->'ground_source'LIMIT 1;
  IF ground IS NULL THEN PERFORM uc_individual_orders_private.fail('PREREQUISITE_MISSING','["WITHDRAWAL_GROUND_REQUIRED"]');END IF;
 END IF;
END;$fn$;

CREATE FUNCTION uc_individual_orders_private.project(p_order uc_individual_orders_private.orders,p_actor uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx jsonb;state text;fresh boolean:=true;can_write boolean:=false;can_issue boolean:=false;can_open boolean:=false;ignored jsonb;
BEGIN
 ctx:=uc_individual_orders_private.context(p_order.organization_id,p_order.enrollment_id,p_actor,'read');
 IF ctx->>'subject_user_id'IS DISTINCT FROM p_order.subject_user_id::text OR ctx->>'course_id'IS DISTINCT FROM p_order.course_id::text THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 PERFORM uc_individual_orders_private.people(array_append(p_order.participant_ids,p_actor),false);
 IF p_order.registry IS NULL THEN
  BEGIN PERFORM uc_individual_orders_private.refresh(p_order,p_actor,'read');
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM IN('UC_INDIVIDUAL_ORDER_SOURCE_CHANGED','UC_INDIVIDUAL_ORDER_SOURCE_UNAVAILABLE','UC_INDIVIDUAL_ORDER_CONTEXT_CHANGED','UC_INDIVIDUAL_ORDER_PREREQUISITE_MISSING')THEN fresh:=false;ELSE RAISE;END IF;
  END;
 END IF;
 IF p_order.artifact IS NOT NULL THEN
  BEGIN ignored:=uc_individual_orders_private.artifact_source(p_order);
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM IN('UC_INDIVIDUAL_ORDER_SOURCE_CHANGED','UC_INDIVIDUAL_ORDER_SOURCE_UNAVAILABLE')THEN fresh:=false;ELSE RAISE;END IF;
  END;
 END IF;
 state:=CASE WHEN p_order.closed THEN'closed'WHEN NOT fresh THEN'source_changed'WHEN p_order.registry IS NOT NULL THEN'registered'
  WHEN p_order.artifact IS NOT NULL THEN'rendered_unregistered'WHEN p_order.approved_snapshot IS NOT NULL THEN'approved_unrendered'ELSE'prepared_unapproved'END;
 BEGIN PERFORM uc_individual_orders_private.context(p_order.organization_id,p_order.enrollment_id,p_actor,'write');can_write:=true;
 EXCEPTION WHEN insufficient_privilege THEN can_write:=false;END;
 BEGIN
  PERFORM uc_individual_orders_private.context(p_order.organization_id,p_order.enrollment_id,p_actor,'issue');
  can_issue:=coalesce((public.uc_document_registry_caps(p_order.organization_id,NULL)->>'can_register')::boolean,false);
 EXCEPTION WHEN insufficient_privilege THEN can_issue:=false;END;
 can_open:=p_order.artifact IS NOT NULL AND fresh AND coalesce((public.uc_document_registry_caps(p_order.organization_id,NULL)->>'can_open_file')::boolean,false);
 RETURN jsonb_build_object('id',p_order.id,'organization_id',p_order.organization_id,'enrollment_id',p_order.enrollment_id,'subject_user_id',p_order.subject_user_id,'course_id',p_order.course_id,
  'order_kind',p_order.order_kind,'revision',p_order.revision,'state_sha256',p_order.state_sha256,'state',state,
  'programme',p_order.facts->'programme','programme_facts',p_order.facts->'programme_facts','identity_snapshot',p_order.facts->'identity_snapshot','dates',p_order.facts->'dates','basis',p_order.facts->'basis','grounds',p_order.facts->'grounds',
  'decision',p_order.decision,'official_order_number',p_order.official_order_number,'render',p_order.render_job,'artifact',p_order.artifact,'registry',p_order.registry,'execution_assurance','signature_not_observed_by_this_feature',
  'capabilities',jsonb_build_object('can_prepare',state='prepared_unapproved'AND can_write,'can_approve',state='prepared_unapproved'AND can_issue,
   'can_render',state='approved_unrendered'AND can_issue,'can_register',state='rendered_unregistered'AND can_issue,'can_open_source',can_open));
END;$fn$;
CREATE FUNCTION uc_individual_orders_private.event_value(p_event uc_individual_orders_private.events)RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',p_event.id,'order_id',p_event.order_id,'revision',p_event.revision,'action',p_event.action,'request_id',p_event.request_id,
 'payload_sha256',p_event.payload_sha256,'actor_user_id',p_event.actor_user_id,'server_at',public.uc_signature_assurance_utc(p_event.server_at),'before_sha256',p_event.before_sha256,'after_sha256',p_event.after_sha256,'reason',p_event.reason)
$fn$;
CREATE FUNCTION public.read_individual_education_order(p_organization_id uuid,p_enrollment_id uuid,p_query jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms' SET TimeZone='UTC'AS $fn$
DECLARE actual_actor uuid:=auth.uid();ctx jsonb;k text:=p_query->>'kind';base jsonb;head_row uc_individual_orders_private.orders;item uc_individual_orders_private.orders;
 event_row uc_individual_orders_private.events;version_row record;binding_row public.course_program_bindings;program jsonb;suggested jsonb;
 items jsonb:='[]';missing jsonb:='[]';n integer:=0;lim integer;after_id uuid;after_revision bigint;last_id uuid;last_revision bigint;more boolean:=false;can_write boolean:=false;detail text;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR actual_actor IS NULL OR public.account_deletion_access_allowed()IS NOT TRUE THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 IF p_organization_id IS NULL OR p_enrollment_id IS NULL OR jsonb_typeof(p_query)IS DISTINCT FROM'object'OR p_query->'version'IS DISTINCT FROM'1'::jsonb
  OR k IS NULL OR k NOT IN('summary','order','history','programme_choices','render_context')THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 ctx:=uc_individual_orders_private.context(p_organization_id,p_enrollment_id,actual_actor,'read');
 PERFORM uc_individual_orders_private.people(ARRAY[actual_actor,(ctx->>'subject_user_id')::uuid],false);
 base:=jsonb_build_object('version',1,'ok',true,'organization_id',p_organization_id,'actor_user_id',actual_actor,'enrollment_id',p_enrollment_id,'subject_user_id',ctx->'subject_user_id','course_id',ctx->'course_id','kind',k);
 IF k='summary'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['version','kind'])THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
  FOR item IN SELECT o.*FROM uc_individual_orders_private.orders o WHERE o.organization_id=p_organization_id AND o.enrollment_id=p_enrollment_id ORDER BY o.family LOOP
   items:=items||jsonb_build_array(uc_individual_orders_private.project(item,actual_actor));
  END LOOP;
  IF ctx->'identity'->'full_name'='null'::jsonb THEN missing:=missing||jsonb_build_array('IDENTITY_REQUIRED');END IF;
  SELECT *INTO binding_row FROM public.course_program_bindings WHERE organization_id=p_organization_id AND course_id=(ctx->>'course_id')::uuid;
  IF binding_row.course_id IS NULL THEN missing:=missing||jsonb_build_array('PROGRAM_REQUIRED');
  ELSE
   BEGIN
    program:=uc_individual_orders_private.programme(p_organization_id,binding_row.version_id);
    suggested:=jsonb_build_object('kind','course_binding','expected_binding_revision',binding_row.revision,'programme',program->'programme');
   EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='UC_INDIVIDUAL_ORDER_PREREQUISITE_MISSING'THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;missing:=missing||detail::jsonb;
    ELSIF SQLERRM IN('UC_INDIVIDUAL_ORDER_SOURCE_CHANGED','UC_INDIVIDUAL_ORDER_SOURCE_UNAVAILABLE')THEN missing:=missing||jsonb_build_array('PROGRAM_FILE_UNAVAILABLE');ELSE RAISE;END IF;
   END;
  END IF;
  BEGIN PERFORM uc_individual_orders_private.context(p_organization_id,p_enrollment_id,actual_actor,'write');can_write:=true;EXCEPTION WHEN insufficient_privilege THEN can_write:=false;END;
  SELECT coalesce(jsonb_agg(value ORDER BY value),'[]')INTO missing FROM(SELECT DISTINCT value FROM jsonb_array_elements_text(missing))unique_missing;
  RETURN base||jsonb_build_object('context',jsonb_build_object('enrollment_witness',ctx->'enrollment_witness','student_label',ctx->'student_label','course_label',ctx->'course_label'),
   'suggested_programme',suggested,'orders',items,'missing_facts',missing,'capabilities',jsonb_build_object('can_prepare',can_write));
 ELSIF k='programme_choices'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['version','kind','after_version_id','limit'])
   OR NOT(p_query->'after_version_id'='null'::jsonb OR public.uc_signature_assurance_uuid(p_query->'after_version_id'))
   OR NOT public.uc_signature_assurance_integer(p_query->'limit',1,100)THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
  after_id:=(p_query->>'after_version_id')::uuid;lim:=(p_query->>'limit')::integer;
  SELECT *INTO binding_row FROM public.course_program_bindings WHERE organization_id=p_organization_id AND course_id=(ctx->>'course_id')::uuid;
  FOR version_row IN SELECT v.id FROM public.program_fact_versions v WHERE v.organization_id=p_organization_id AND v.state='approved'AND(v.facts->>'program_type')IN('professional_training','dpo_upskilling','dpo_retraining')AND(after_id IS NULL OR v.id>after_id)ORDER BY v.id LIMIT(lim+1)LOOP
   n:=n+1;IF n>lim THEN more:=true;EXIT;END IF;last_id:=version_row.id;
   BEGIN program:=uc_individual_orders_private.programme(p_organization_id,version_row.id);
   EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN('UC_INDIVIDUAL_ORDER_PREREQUISITE_MISSING','UC_INDIVIDUAL_ORDER_SOURCE_CHANGED','UC_INDIVIDUAL_ORDER_SOURCE_UNAVAILABLE')THEN CONTINUE;ELSE RAISE;END IF;
   END;
   items:=items||jsonb_build_array(jsonb_build_object('id',version_row.id,'organization_id',p_organization_id,'course_id',ctx->'course_id','label',uc_individual_orders_private.bounded(program->'facts'->>'full_title',2000),
    'programme',program->'programme','facts',program->'facts','course_binding_revision',CASE WHEN binding_row.version_id=version_row.id THEN binding_row.revision END));last_id:=version_row.id;
  END LOOP;
  RETURN base||jsonb_build_object('choices',items,'next_after_version_id',CASE WHEN more THEN last_id END);
 END IF;
 IF NOT public.uc_signature_assurance_uuid(p_query->'order_id')THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
 SELECT *INTO head_row FROM uc_individual_orders_private.orders WHERE id=(p_query->>'order_id')::uuid AND organization_id=p_organization_id AND enrollment_id=p_enrollment_id FOR SHARE NOWAIT;
 IF head_row.id IS NULL THEN PERFORM uc_individual_orders_private.fail('NOT_FOUND');END IF;
 IF k='order'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['version','kind','order_id'])THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
  RETURN base||jsonb_build_object('order',uc_individual_orders_private.project(head_row,actual_actor));
 ELSIF k='render_context'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['version','kind','order_id','expected_revision','expected_state_sha256','render_request_id'])
   OR NOT uc_individual_orders_private.revision(p_query->'expected_revision')OR NOT public.uc_signature_assurance_sha(p_query->'expected_state_sha256')OR NOT public.uc_signature_assurance_uuid(p_query->'render_request_id')
  THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
  RETURN base||jsonb_build_object('render_context',uc_individual_orders_private.render_context(head_row,actual_actor,p_query));
 ELSE
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['version','kind','order_id','after_revision','limit'])OR NOT uc_individual_orders_private.revision(p_query->'after_revision',true)
   OR NOT public.uc_signature_assurance_integer(p_query->'limit',1,100)THEN PERFORM uc_individual_orders_private.fail('INVALID_INPUT');END IF;
  lim:=(p_query->>'limit')::integer;after_revision:=(p_query->>'after_revision')::bigint;
  FOR event_row IN SELECT e.*FROM uc_individual_orders_private.events e WHERE e.organization_id=p_organization_id AND e.order_id=head_row.id AND e.row_kind='event'AND e.revision>after_revision ORDER BY e.revision LIMIT(lim+1)LOOP
   n:=n+1;IF n>lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(uc_individual_orders_private.event_value(event_row));last_revision:=event_row.revision;
  END LOOP;
  RETURN base||jsonb_build_object('order_id',head_row.id,'events',items,'next_after_revision',CASE WHEN more THEN last_revision END);
 END IF;
EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;RETURN uc_individual_orders_private.failure(SQLERRM,SQLSTATE,detail);
END;$fn$;

-- ROOT-owned OFFLINE fragment for frozen private model32c37270 / DDLc72f76d5.
-- Merge into the new1700 module only after independent review. No business commands.
CREATE FUNCTION uc_individual_orders_private.head_guard()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $guard$
DECLARE actor uuid:=auth.uid();mode text;stage_before integer;stage_after integer;participants uuid[];
BEGIN
 IF TG_OP NOT IN('INSERT','UPDATE')THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 IF TG_OP='INSERT'THEN
  IF auth.role()IS DISTINCT FROM'authenticated'OR actor IS NULL OR actor IS DISTINCT FROM NEW.created_by OR actor IS DISTINCT FROM NEW.updated_by
   OR NEW.revision<>1 OR NEW.closed OR NEW.approved_snapshot IS NOT NULL OR NEW.decision IS NOT NULL OR NEW.official_order_number IS NOT NULL
   OR NEW.render_job IS NOT NULL OR NEW.render_input_json IS NOT NULL OR NEW.artifact IS NOT NULL OR NEW.output_object IS NOT NULL
   OR NEW.registry IS NOT NULL OR NEW.registered_snapshot IS NOT NULL
  THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
  mode:='write';
 ELSE
  IF ROW(NEW.id,NEW.organization_id,NEW.enrollment_id,NEW.subject_user_id,NEW.course_id,NEW.order_kind,NEW.family,NEW.created_by,NEW.created_at,
    NEW.staging_attest_request_id,NEW.output_attest_request_id,NEW.output_document_id,NEW.upload_request_id,NEW.registry_request_id)
   IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.enrollment_id,OLD.subject_user_id,OLD.course_id,OLD.order_kind,OLD.family,OLD.created_by,OLD.created_at,
    OLD.staging_attest_request_id,OLD.output_attest_request_id,OLD.output_document_id,OLD.upload_request_id,OLD.registry_request_id)
   OR OLD.closed OR NEW.revision<>OLD.revision+1 OR NOT(NEW.participant_ids@>OLD.participant_ids)
  THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  IF OLD.approved_snapshot IS NOT NULL AND ROW(NEW.facts,NEW.source_witness,NEW.approved_snapshot,NEW.approved_order_revision,NEW.approved_order_sha256,
    NEW.decision,NEW.official_order_number,NEW.render_input_json)
   IS DISTINCT FROM ROW(OLD.facts,OLD.source_witness,OLD.approved_snapshot,OLD.approved_order_revision,OLD.approved_order_sha256,
    OLD.decision,OLD.official_order_number,OLD.render_input_json)
  THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  IF OLD.render_job IS NOT NULL THEN
   IF NEW.render_job IS NULL OR NEW.render_job-ARRAY['html_sha256','stage','staging_proof']IS DISTINCT FROM OLD.render_job-ARRAY['html_sha256','stage','staging_proof']
    OR OLD.render_job->'html_sha256'<>'null'::jsonb AND NEW.render_job->'html_sha256'IS DISTINCT FROM OLD.render_job->'html_sha256'
    OR OLD.render_job->'staging_proof'<>'null'::jsonb AND NEW.render_job->'staging_proof'IS DISTINCT FROM OLD.render_job->'staging_proof'
   THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
   stage_before:=array_position(ARRAY['prepared','staged','saved'],OLD.render_job->>'stage');
   stage_after:=array_position(ARRAY['prepared','staged','saved'],NEW.render_job->>'stage');
   IF stage_before IS NULL OR stage_after IS NULL OR stage_after<stage_before OR stage_after>stage_before+1
   THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  END IF;
  IF OLD.artifact IS NOT NULL AND(NEW.artifact IS NULL OR NEW.artifact-'output_review'IS DISTINCT FROM OLD.artifact-'output_review'
   OR OLD.artifact->'output_review'<>'null'::jsonb AND NEW.artifact->'output_review'IS DISTINCT FROM OLD.artifact->'output_review')
   OR OLD.output_object IS NOT NULL AND NEW.output_object IS DISTINCT FROM OLD.output_object
   OR OLD.registry IS NOT NULL AND NEW.registry IS DISTINCT FROM OLD.registry
   OR OLD.registered_snapshot IS NOT NULL AND NEW.registered_snapshot IS DISTINCT FROM OLD.registered_snapshot
  THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  mode:=CASE WHEN NEW.approved_snapshot IS NOT NULL OR NEW.closed THEN'issue'ELSE'write'END;
  IF auth.role()='authenticated'THEN
   IF actor IS NULL OR actor IS DISTINCT FROM NEW.updated_by THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
  ELSIF auth.role()='service_role'AND actor IS NULL THEN
   IF NEW.updated_by IS NULL OR NEW.approved_snapshot IS NULL THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
   actor:=NEW.updated_by;mode:='issue';
  ELSE PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 END IF;
 SELECT ARRAY(SELECT DISTINCT value FROM unnest(NEW.participant_ids)value WHERE value IS NOT NULL ORDER BY value)INTO participants;
 IF NEW.participant_ids IS DISTINCT FROM participants OR cardinality(participants)>100 OR NOT(participants@>ARRAY[NEW.subject_user_id,NEW.created_by,actor])
  OR(NEW.registry IS NULL)IS DISTINCT FROM(NEW.registered_snapshot IS NULL)
  OR NEW.state_sha256 IS DISTINCT FROM uc_individual_orders_private.head_hash(NEW)
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 PERFORM uc_individual_orders_private.people(participants,true);
 PERFORM uc_individual_orders_private.context(NEW.organization_id,NEW.enrollment_id,actor,mode);
 RETURN NEW;
END;$guard$;

CREATE FUNCTION uc_individual_orders_private.event_guard()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $guard$
DECLARE actor uuid:=auth.uid();mode text;head uc_individual_orders_private.orders;original uc_individual_orders_private.events;previous uc_individual_orders_private.events;participants uuid[];
BEGIN
 IF TG_OP<>'INSERT'THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 SELECT *INTO head FROM uc_individual_orders_private.orders WHERE id=NEW.order_id AND organization_id=NEW.organization_id FOR SHARE NOWAIT;
 IF head.id IS NULL THEN PERFORM uc_individual_orders_private.fail('SOURCE_UNAVAILABLE');END IF;
 IF auth.role()='authenticated'THEN
  IF actor IS NULL OR actor IS DISTINCT FROM NEW.actor_user_id OR NEW.action IN('artifact_staged','artifact_saved')
  THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 ELSIF auth.role()='service_role'AND actor IS NULL THEN
  actor:=NEW.actor_user_id;
  IF NEW.action NOT IN('artifact_staged','artifact_saved')THEN PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 ELSE PERFORM uc_individual_orders_private.fail('ACCESS_DENIED');END IF;
 mode:=CASE WHEN NEW.action IN('prepared','draft_revised')THEN'write'ELSE'issue'END;
 IF NEW.action='artifact_staged'AND NEW.request_id IS DISTINCT FROM head.staging_attest_request_id
  OR NEW.action='artifact_saved'AND NEW.request_id IS DISTINCT FROM head.output_attest_request_id
 THEN PERFORM uc_individual_orders_private.fail('REQUEST_CONFLICT');END IF;
 SELECT ARRAY(SELECT DISTINCT value FROM unnest(NEW.participant_ids)value WHERE value IS NOT NULL ORDER BY value)INTO participants;
 IF NEW.participant_ids IS DISTINCT FROM participants OR cardinality(participants)>100 OR NOT(participants@>ARRAY[actor,head.subject_user_id])
  OR NOT(array_append(head.participant_ids,actor)@>participants)
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 PERFORM uc_individual_orders_private.people(participants,true);
 PERFORM uc_individual_orders_private.context(head.organization_id,head.enrollment_id,actor,mode);
 IF NEW.row_kind='request_receipt'THEN
  SELECT *INTO original FROM uc_individual_orders_private.events WHERE id=NEW.original_event_id AND row_kind='event'FOR SHARE NOWAIT;
  IF original.id IS NULL OR ROW(NEW.organization_id,NEW.order_id,NEW.revision,NEW.action,NEW.before_sha256,NEW.after_sha256)
    IS DISTINCT FROM ROW(original.organization_id,original.order_id,original.revision,original.action,original.before_sha256,original.after_sha256)
   OR NEW.result IS DISTINCT FROM(CASE WHEN original.result->>'kind'='apply'THEN original.result||jsonb_build_object('replayed',true,'actor_user_id',actor,'request_id',NEW.request_id)
    ELSE original.result||jsonb_build_object('replayed',true)END)
  THEN PERFORM uc_individual_orders_private.fail('REQUEST_CONFLICT');END IF;
 ELSE
  IF NEW.original_event_id IS NOT NULL OR NEW.revision<>head.revision OR NEW.after_sha256 IS DISTINCT FROM head.state_sha256
   OR NEW.actor_user_id IS DISTINCT FROM head.updated_by
  THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  IF NEW.revision=1 THEN
   IF NEW.action<>'prepared'OR NEW.before_sha256 IS NOT NULL THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  ELSE
   SELECT *INTO previous FROM uc_individual_orders_private.events WHERE order_id=head.id AND organization_id=head.organization_id AND row_kind='event'AND revision=NEW.revision-1;
   IF previous.id IS NULL OR NEW.action='prepared'OR NEW.before_sha256 IS DISTINCT FROM previous.after_sha256 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  END IF;
 END IF;
 RETURN NEW;
END;$guard$;

CREATE FUNCTION uc_individual_orders_private.head_event_proof()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $guard$
DECLARE head uc_individual_orders_private.orders;latest uc_individual_orders_private.events;proof uc_individual_orders_private.events;input jsonb;ignored jsonb;
BEGIN
 -- An earlier row-trigger NEW can be obsolete after later same-transaction steps.
 -- Validate the CURRENT persisted head, including its latest domain event.
 SELECT *INTO head FROM uc_individual_orders_private.orders WHERE id=NEW.id AND organization_id=NEW.organization_id;
 IF head.id IS NULL OR head.state_sha256 IS DISTINCT FROM uc_individual_orders_private.head_hash(head)
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 SELECT *INTO latest FROM uc_individual_orders_private.events WHERE order_id=head.id AND organization_id=head.organization_id AND row_kind='event'AND revision=head.revision;
 IF latest.id IS NULL OR latest.after_sha256 IS DISTINCT FROM head.state_sha256 OR latest.actor_user_id IS DISTINCT FROM head.updated_by
 THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
 IF head.approved_snapshot IS NOT NULL THEN
  IF head.approved_order_sha256 IS DISTINCT FROM public.uc_program_hash(head.approved_snapshot)
   OR head.approved_snapshot->'facts'IS DISTINCT FROM head.facts OR head.approved_snapshot->'source_witness'IS DISTINCT FROM head.source_witness
   OR head.approved_snapshot->'decision'IS DISTINCT FROM head.decision OR head.approved_snapshot->'official_order_number'IS DISTINCT FROM head.official_order_number
   OR head.approved_snapshot->>'order_id'IS DISTINCT FROM head.id::text OR head.approved_snapshot->>'organization_id'IS DISTINCT FROM head.organization_id::text
   OR head.approved_snapshot->>'enrollment_id'IS DISTINCT FROM head.enrollment_id::text OR head.approved_snapshot->>'subject_user_id'IS DISTINCT FROM head.subject_user_id::text
   OR head.approved_snapshot->>'course_id'IS DISTINCT FROM head.course_id::text OR head.approved_snapshot->>'order_kind'IS DISTINCT FROM head.order_kind
   OR head.approved_snapshot->'approved_order_revision'IS DISTINCT FROM to_jsonb(head.approved_order_revision)
  THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  SELECT *INTO proof FROM uc_individual_orders_private.events WHERE id=(head.decision->>'event_id')::uuid AND order_id=head.id AND organization_id=head.organization_id AND row_kind='event'AND action='approved'AND revision=head.approved_order_revision;
  IF proof.id IS NULL OR proof.actor_user_id::text IS DISTINCT FROM head.decision->>'actor_user_id'
   OR proof.payload_sha256 IS DISTINCT FROM head.decision->>'payload_sha256'
  THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  input:=head.render_input_json::jsonb;
  IF input->'variables'IS DISTINCT FROM head.approved_snapshot->'variables'OR input->'decision'IS DISTINCT FROM head.decision
   OR input->>'approved_order_sha256'IS DISTINCT FROM head.approved_order_sha256 OR input->'approved_order_revision'IS DISTINCT FROM to_jsonb(head.approved_order_revision)
   OR input->>'render_job_id'IS DISTINCT FROM head.render_job->>'id'OR input->'render_generation'IS DISTINCT FROM head.render_job->'generation'
   OR head.render_job->>'render_input_sha256'IS DISTINCT FROM encode(sha256(convert_to(head.render_input_json,'UTF8')),'hex')
  THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  IF head.render_job->'staging_proof'<>'null'::jsonb THEN
   SELECT *INTO proof FROM uc_individual_orders_private.events WHERE id=(head.render_job->'staging_proof'->>'proof_id')::uuid AND order_id=head.id AND organization_id=head.organization_id AND row_kind='event'AND action='artifact_staged'AND request_id=head.staging_attest_request_id;
   IF proof.id IS NULL OR proof.revision>head.revision OR head.render_job->'html_sha256'IS DISTINCT FROM head.render_job->'staging_proof'->'html_sha256'
    OR head.render_job->>'render_input_sha256'IS DISTINCT FROM head.render_job->'staging_proof'->>'render_input_sha256'
   THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  END IF;
 END IF;
 IF head.artifact IS NOT NULL THEN
  SELECT *INTO proof FROM uc_individual_orders_private.events WHERE id=(head.artifact->>'proof_id')::uuid AND order_id=head.id AND organization_id=head.organization_id AND row_kind='event'AND action='artifact_saved'AND request_id=head.output_attest_request_id;
  IF proof.id IS NULL OR proof.revision>head.revision OR head.render_job->>'stage'IS DISTINCT FROM'saved'OR head.render_job->'staging_proof'IS NULL OR head.render_job->'staging_proof'='null'::jsonb
   OR head.artifact->'byte_sha256'IS DISTINCT FROM head.render_job->'staging_proof'->'byte_sha256'
   OR head.artifact->'byte_size'IS DISTINCT FROM head.render_job->'staging_proof'->'byte_size'
   OR head.artifact->'html_sha256'IS DISTINCT FROM head.render_job->'html_sha256'
  THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  ignored:=uc_individual_orders_private.artifact_source(head);
 END IF;
 IF head.registry IS NOT NULL THEN
  SELECT *INTO proof FROM uc_individual_orders_private.events WHERE id=(head.artifact->'output_review'->>'event_id')::uuid AND order_id=head.id AND organization_id=head.organization_id AND row_kind='event'AND action='output_reviewed_and_registered';
  IF proof.id IS NULL OR proof.revision>head.revision OR proof.actor_user_id::text IS DISTINCT FROM head.artifact->'output_review'->>'actor_user_id'
   OR head.artifact->'output_review'->'artifact_byte_sha256'IS DISTINCT FROM head.artifact->'byte_sha256'
  THEN PERFORM uc_individual_orders_private.fail('SOURCE_CHANGED');END IF;
  ignored:=uc_individual_orders_private.registered_witness(head,(head.registry->>'record_revision')::bigint,false);
 END IF;
 RETURN NULL;
END;$guard$;

CREATE TRIGGER w1_head_before BEFORE INSERT OR UPDATE OR DELETE ON uc_individual_orders_private.orders
FOR EACH ROW EXECUTE FUNCTION uc_individual_orders_private.head_guard();
CREATE TRIGGER w1_head_truncate BEFORE TRUNCATE ON uc_individual_orders_private.orders
FOR EACH STATEMENT EXECUTE FUNCTION uc_individual_orders_private.head_guard();
CREATE TRIGGER w1_event_before BEFORE INSERT OR UPDATE OR DELETE ON uc_individual_orders_private.events
FOR EACH ROW EXECUTE FUNCTION uc_individual_orders_private.event_guard();
CREATE TRIGGER w1_event_truncate BEFORE TRUNCATE ON uc_individual_orders_private.events
FOR EACH STATEMENT EXECUTE FUNCTION uc_individual_orders_private.event_guard();
CREATE CONSTRAINT TRIGGER w1_head_event_proof AFTER INSERT OR UPDATE ON uc_individual_orders_private.orders
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION uc_individual_orders_private.head_event_proof();

-- Fail-closed retention composition: existing account erasure sees these actual
-- participants and stops for the established retained-data review. No guessed
-- legal retention term or automatic destruction process is introduced.
CREATE FUNCTION uc_individual_orders_private.personal_counts(p_user uuid)RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',x.table_name,'column',x.column_name,'count',x.n)ORDER BY x.table_name),'[]'::jsonb)
 FROM(
  SELECT 'uc_individual_education_orders'::text table_name,'participant_ids'::text column_name,count(*)n FROM uc_individual_orders_private.orders o WHERE o.subject_user_id=p_user OR o.created_by=p_user OR o.updated_by=p_user OR p_user=ANY(o.participant_ids)
  UNION ALL SELECT 'uc_individual_education_order_events','participant_ids',count(*)FROM uc_individual_orders_private.events e WHERE e.actor_user_id=p_user OR p_user=ANY(e.participant_ids)
  UNION ALL SELECT 'uc_individual_order_staging_objects','subject_prefix',count(*)FROM storage.objects o WHERE o.bucket_id='uc-individual-order-staging'AND split_part(o.name,'/',1)=p_user::text
 )x WHERE x.n>0
$fn$;
-- Three exact reviewed body deltas, preserving owner/ACL/config/ABI and all old
-- rows. All non-W1 own order/file denials remain identical.
DO $body_delta$
DECLARE patch jsonb;fn_oid oid;old_body text;old_def text;new_body text;new_def text;before_meta jsonb;after_meta jsonb;
BEGIN
 FOR patch IN SELECT value FROM jsonb_array_elements($patches$[{"identity":"public.uc_scoped_journal_personal_counts(uuid)","before_md5":"c6ae8b366a77714e1050167f35408023","after_md5":"afe583ea861280c7ce4f5da51502948b","old":"\n SELECT (\n SELECT(\n SELECT(\n SELECT(\n SELECT(\n SELECT(\n SELECT coalesce(jsonb_agg(jsonb_build_object('table',count_row.table_name,'column',count_row.column_name,'count',count_row.n) ORDER BY count_row.table_name),'[]'::jsonb) FROM(\n  SELECT 'uc_scoped_journal_contexts'::text table_name,'created_by'::text column_name,count(*) n FROM public.uc_scoped_journal_contexts c WHERE c.created_by=p_user\n  UNION ALL SELECT 'uc_scoped_journal_records','participant_ids',count(*) FROM public.uc_scoped_journal_records r WHERE p_user=ANY(r.participant_ids) OR r.subject_user_id=p_user OR r.recorded_by=p_user OR r.created_by=p_user\n  UNION ALL SELECT 'uc_scoped_journal_history','participant_ids',count(*) FROM public.uc_scoped_journal_history h WHERE p_user=ANY(h.participant_ids) OR h.subject_user_id=p_user OR h.recorded_by=p_user\n  UNION ALL SELECT 'uc_scoped_journal_requests','participant_ids',count(*) FROM public.uc_scoped_journal_requests request_row WHERE p_user=ANY(request_row.participant_ids) OR request_row.actor_id=p_user\n  UNION ALL SELECT 'uc_scoped_journal_exports','participant_ids',count(*) FROM public.uc_scoped_journal_exports e WHERE p_user=ANY(e.participant_ids) OR e.recorded_by=p_user\n ) count_row WHERE count_row.n>0\n)||public.uc_copy_registry_personal_counts(p_user)\n)||public.uc_document_registry_personal_counts(p_user)\n)||public.uc_education_personal_counts(p_user))||public.uc_frdo_personal_counts(p_user))||public.uc_signature_assurance_personal_counts(p_user)||public.uc_signature_assurance_file_proof_personal_counts(p_user)||public.uc_archive_personal_counts(p_user)||public.uc_publication_personal_counts(p_user)\n||(SELECT coalesce(jsonb_agg(jsonb_build_object('table',x.key,'column','retained_self_examination','count',x.value::bigint)ORDER BY x.key),'[]'::jsonb)FROM jsonb_each_text(public.uc_self_examination_personal_counts(p_user))x WHERE x.value::bigint>0)\n||public.uc_ng_personal_counts(p_user)\n) || rtn_private.personal_counts(p_user)\n","next":"\n SELECT (\n SELECT(\n SELECT(\n SELECT(\n SELECT(\n SELECT(\n SELECT coalesce(jsonb_agg(jsonb_build_object('table',count_row.table_name,'column',count_row.column_name,'count',count_row.n) ORDER BY count_row.table_name),'[]'::jsonb) FROM(\n  SELECT 'uc_scoped_journal_contexts'::text table_name,'created_by'::text column_name,count(*) n FROM public.uc_scoped_journal_contexts c WHERE c.created_by=p_user\n  UNION ALL SELECT 'uc_scoped_journal_records','participant_ids',count(*) FROM public.uc_scoped_journal_records r WHERE p_user=ANY(r.participant_ids) OR r.subject_user_id=p_user OR r.recorded_by=p_user OR r.created_by=p_user\n  UNION ALL SELECT 'uc_scoped_journal_history','participant_ids',count(*) FROM public.uc_scoped_journal_history h WHERE p_user=ANY(h.participant_ids) OR h.subject_user_id=p_user OR h.recorded_by=p_user\n  UNION ALL SELECT 'uc_scoped_journal_requests','participant_ids',count(*) FROM public.uc_scoped_journal_requests request_row WHERE p_user=ANY(request_row.participant_ids) OR request_row.actor_id=p_user\n  UNION ALL SELECT 'uc_scoped_journal_exports','participant_ids',count(*) FROM public.uc_scoped_journal_exports e WHERE p_user=ANY(e.participant_ids) OR e.recorded_by=p_user\n ) count_row WHERE count_row.n>0\n)||public.uc_copy_registry_personal_counts(p_user)\n)||public.uc_document_registry_personal_counts(p_user)\n)||public.uc_education_personal_counts(p_user))||public.uc_frdo_personal_counts(p_user))||public.uc_signature_assurance_personal_counts(p_user)||public.uc_signature_assurance_file_proof_personal_counts(p_user)||public.uc_archive_personal_counts(p_user)||public.uc_publication_personal_counts(p_user)\n||(SELECT coalesce(jsonb_agg(jsonb_build_object('table',x.key,'column','retained_self_examination','count',x.value::bigint)ORDER BY x.key),'[]'::jsonb)FROM jsonb_each_text(public.uc_self_examination_personal_counts(p_user))x WHERE x.value::bigint>0)\n||public.uc_ng_personal_counts(p_user)\n) || rtn_private.personal_counts(p_user) || uc_individual_orders_private.personal_counts(p_user)\n"},{"identity":"uc_document_chain_private.row_value(uuid,jsonb,uuid,uuid,boolean)","before_md5":"1cb91c29d1559727c1c0bb05d0416c56","after_md5":"7a0a04e4587c1fda6172ef781910e140","old":"\nDECLARE e record;g uuid;gname text;association text:='unavailable';association_why text;facts jsonb;missing jsonb;\n d public.uc_automatic_admission_drafts;projection jsonb;r public.uc_document_registry_records;issued public.education_document_records;issue_state public.uc_education_issuance_states;\n source jsonb;proof jsonb;can_open boolean;can_manage boolean;admission jsonb;completion jsonb;education jsonb;action jsonb;typ text;state text;why text;code text;number text;dt date;\nBEGIN\n SELECT * INTO e FROM uc_education_journal_private.enrollments(p_org,p_scope||jsonb_build_object('enrollment_id',p_enrollment)) x WHERE x.enrollment_id=p_enrollment;\n IF NOT FOUND THEN RETURN NULL;END IF;\n facts:=public.uc_admission_document_source(e.enrollment_id,p_group);\n IF facts IS NOT NULL THEN g:=(facts->>'group_id')::uuid;missing:=facts->'missing_facts';END IF;\n IF p_group IS NOT NULL AND g IS DISTINCT FROM p_group THEN RETURN NULL;END IF;\n IF g IS NOT NULL AND NOT uc_education_journal_private.source_allowed(p_org,p_scope,g,e.enrollment_id,e.user_id,e.course_id) THEN\n  g:=NULL;facts:=NULL;\n END IF;\n SELECT left(name,2000) INTO gname FROM public.student_groups WHERE id=g AND organization_id=p_org;\n IF facts IS NULL THEN association_why:='Не удалось подтвердить связь обучения с группой и программой.';\n ELSIF missing ? 'ambiguous_group' THEN association:='choose_group';association_why:='Выберите группу для этого обучения.';\n ELSIF missing ? 'group_not_selected' THEN association:='group_missing';association_why:='Добавьте ученика в подходящую группу.';\n ELSIF missing ? 'group_course_not_bound' THEN association:='course_unbound';association_why:='Уточните программу и основание зачисления для этого обучения.';\n ELSIF missing ? 'program_not_confirmed' THEN association:='program_unconfirmed';association_why:='Подтвердите программу обучения для этой группы.';\n ELSE association:='confirmed';association_why:=NULL;END IF;\n can_manage:=NOT p_self AND public.uc_document_action_allowed(p_org,'write',g,e.enrollment_id);\n FOR typ IN SELECT unnest(ARRAY['enrollment_order','expulsion_order']) LOOP\n  source:=NULL;proof:=NULL;can_open:=false;number:=NULL;dt:=NULL;action:=NULL;state:='not_created';code:='ORDER_NOT_CREATED';\n  why:=CASE typ WHEN 'enrollment_order' THEN 'Приказ о зачислении ещё не оформлен.' ELSE 'Приказ об отчислении ещё не оформлен; требуется основание завершения или досрочного прекращения обучения.' END;\n  SELECT x.* INTO r FROM public.uc_document_registry_records x WHERE x.organization_id=p_org AND NOT x.redacted AND x.context_binding->>'enrollment_id'=e.enrollment_id::text AND x.data->>'document_type'=typ\n   AND uc_document_chain_private.registry_matches(p_org,p_scope,e.enrollment_id,e.user_id,e.course_id,p_group,x)\n   ORDER BY x.registered_at DESC,x.id DESC LIMIT 1;\n  IF FOUND THEN\n   number:=r.registration_id;dt:=(r.data->>'document_date')::date;\n   IF r.legacy_claim IS NOT NULL AND r.legacy_claim<>'null'::jsonb THEN state:='legacy_unverified';code:='LEGACY_ORDER_UNVERIFIED';why:='Сохранена прежняя запись; её происхождение не подтверждено этой цепочкой.';\n   ELSE state:='registered';code:=NULL;why:=NULL;END IF;\n   IF public.uc_custom_journal_shape(r.data->'source',ARRAY['kind','document_id','version_id','content_hash'])\n    AND r.data->'source'->>'kind'='org_document_version' AND public.uc_custom_journal_uuid(r.data->'source'->'document_id') AND public.uc_custom_journal_uuid(r.data->'source'->'version_id') THEN\n    source:=jsonb_build_object('kind','registry_record','id',r.id,'revision',r.revision,'document_id',r.data->'source'->'document_id','version_id',r.data->'source'->'version_id');\n    IF NOT p_self THEN\n     proof:=public.uc_document_registry_source(p_org,r.data->'source',false,false);\n     can_open:=proof IS NOT NULL AND coalesce((public.uc_document_registry_caps(p_org,r.group_id)->>'can_open_file')::boolean,false);\n    END IF;\n   END IF;\n   IF p_self THEN code:='INDIVIDUAL_EXTRACT_UNAVAILABLE';why:='Приказ зарегистрирован. Индивидуальная выписка пока недоступна; обратитесь в учебный центр.';\n   ELSIF NOT can_open THEN code:='SOURCE_UNAVAILABLE';why:='Запись сохранена; точный файл сейчас недоступен по текущим правам или состоянию источника.';END IF;\n  ELSIF typ='enrollment_order' THEN\n   SELECT x.* INTO d FROM public.uc_automatic_admission_drafts x WHERE x.organization_id=p_org AND x.enrollment_id=e.enrollment_id AND x.user_id=e.user_id AND x.course_id=e.course_id;\n   IF FOUND AND(p_group IS NULL OR d.group_id=p_group) AND uc_education_journal_private.source_allowed(p_org,p_scope,d.group_id,e.enrollment_id,e.user_id,e.course_id) THEN\n    projection:=public.uc_admission_draft_projection(d.id);dt:=d.document_date;\n    source:=jsonb_build_object('kind','admission_draft','id',d.id,'revision',d.revision,'enrollment_id',e.enrollment_id,'group_id',d.group_id);\n    IF d.status<>'disabled' AND coalesce((projection->>'stale')::boolean,true) IS FALSE AND coalesce((projection->>'registered_locked')::boolean,true) IS FALSE THEN\n     state:=CASE WHEN d.status='prepared' THEN 'draft' ELSE 'needs_information' END;\n     code:=CASE WHEN d.status='prepared' THEN 'DRAFT_NOT_APPROVED' ELSE 'DRAFT_NEEDS_INFORMATION' END;\n     why:=CASE WHEN d.status='prepared' THEN 'Подготовлен проект; подпись и регистрационный номер ещё не оформлены.' ELSE 'Проект сохранён; перед оформлением нужно уточнить сведения о программе и приёме.' END;can_open:=NOT p_self;\n    ELSE state:='needs_information';code:=CASE WHEN d.status='disabled' THEN 'PREPARATION_DISABLED' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'DRAFT_SOURCE_CHANGED' ELSE 'DRAFT_NEEDS_INFORMATION' END;\n     why:=CASE WHEN d.status='disabled' THEN 'Автоподготовка проекта отключена в настройках.' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'Исходные сведения изменились; обновите проект в настройках зачисления.' ELSE 'Перед подготовкой проекта нужны сведения о группе и программе.' END;END IF;\n    IF p_self THEN code:='INDIVIDUAL_DRAFT_EXPORT_UNAVAILABLE';why:='Проект приказа подготовлен или требует сведений. Оформленную персональную выписку предоставляет учебный центр.';END IF;\n   END IF;\n  END IF;\n  IF can_manage AND typ='enrollment_order' AND state IN('needs_information','not_created') THEN\n   action:=CASE WHEN association IN('choose_group','group_missing') THEN jsonb_build_object('kind','choose_group','enrollment_id',e.enrollment_id)\n    WHEN association='program_unconfirmed' AND g IS NOT NULL THEN jsonb_build_object('kind','review_group_program','group_id',g)\n    ELSE jsonb_build_object('kind','review_admission_draft','enrollment_id',e.enrollment_id,'group_id',g) END;\n  ELSIF source IS NOT NULL AND can_open THEN action:=jsonb_build_object('kind','open_source','source',source);\n  ELSIF can_manage THEN action:=CASE WHEN typ='enrollment_order' THEN jsonb_build_object('kind','review_admission_draft','enrollment_id',e.enrollment_id,'group_id',g) ELSE jsonb_build_object('kind','review_completion','enrollment_id',e.enrollment_id,'group_id',g) END;END IF;\n  IF typ='enrollment_order' THEN admission:=uc_document_chain_private.slot('admission_order',state,code,why,number,dt,source,can_open,action);\n  ELSE completion:=uc_document_chain_private.slot('completion_order',state,code,why,number,dt,source,can_open,action);END IF;\n END LOOP;\n source:=NULL;can_open:=false;state:='not_created';code:='EDUCATION_DOCUMENT_NOT_ISSUED';why:='Итоговый документ ещё не выдан. Проверьте программу, аттестацию и условия выдачи.';number:=NULL;dt:=NULL;\n SELECT x.* INTO issued FROM public.education_document_records x WHERE x.organization_id=p_org AND x.enrollment_id=e.enrollment_id AND x.user_id=e.user_id\n  AND(x.course_id IS NULL OR x.course_id=e.course_id) AND x.deleted_at IS NULL AND(p_group IS NULL OR x.group_id=p_group)\n  AND uc_education_journal_private.source_allowed(p_org,p_scope,x.group_id,e.enrollment_id,e.user_id,e.course_id)\n  AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_states z WHERE z.record_id=x.id AND z.redacted)\n  ORDER BY x.issue_date DESC,x.created_at DESC,x.id DESC LIMIT 1;\n IF FOUND THEN\n  number:=issued.document_number;dt:=issued.issue_date;\n  SELECT * INTO issue_state FROM public.uc_education_issuance_states s WHERE s.record_id=issued.id AND s.organization_id=p_org AND s.user_id=e.user_id\n   AND s.enrollment_id=e.enrollment_id AND s.course_id=e.course_id AND NOT s.redacted;\n  IF NOT FOUND OR issued.course_id IS DISTINCT FROM e.course_id OR issue_state.group_id IS DISTINCT FROM issued.group_id OR issue_state.proof IS NULL OR issue_state.proof='null'::jsonb THEN state:='legacy_unverified';code:='LEGACY_ISSUANCE_UNVERIFIED';why:='Сохранена прежняя запись. Контролируемое основание выдачи этой цепочкой не подтверждено.';\n  ELSE\n   state:=CASE WHEN issue_state.annulment IS NOT NULL THEN 'annulled' ELSE 'issued' END;code:=NULL;why:=CASE WHEN issue_state.annulment IS NOT NULL THEN 'Документ аннулирован; прежняя запись сохранена.' ELSE NULL END;\n   source:=jsonb_build_object('kind','education_record','id',issued.id,'revision',issue_state.revision,'enrollment_id',e.enrollment_id);\n   IF NOT p_self THEN can_open:=public.uc_education_issue_can(p_org,issued.group_id,e.enrollment_id,e.user_id,e.course_id,'read')\n    AND public.uc_education_issue_source(p_org,issue_state.artifact->'source',false) IS NOT NULL;END IF;\n   IF p_self THEN code:='OWN_CONTROLLED_DOWNLOAD_UNAVAILABLE';why:='Документ учтён. Персональная загрузка этого оформленного файла пока недоступна в данном разделе.';\n   ELSIF NOT can_open THEN code:='SOURCE_UNAVAILABLE';why:='Выдача сохранена; точный оформленный файл сейчас недоступен.';END IF;\n  END IF;\n END IF;\n action:=CASE WHEN source IS NOT NULL AND can_open THEN jsonb_build_object('kind','open_source','source',source) WHEN can_manage THEN jsonb_build_object('kind','review_issuance','enrollment_id',e.enrollment_id,'course_id',e.course_id,'group_id',g) ELSE NULL END;\n education:=uc_document_chain_private.slot('education_document',state,code,why,number,dt,source,can_open,action);\n RETURN jsonb_build_object('enrollment_id',e.enrollment_id,'student_user_id',e.user_id,'student_label',left(coalesce(nullif(e.person_label,''),'Имя не указано'),2000),\n 'course_id',e.course_id,'course_label',left(coalesce(nullif(e.course_label,''),'Курс'),2000),'group_id',g,'group_label',gname,\n 'association_state',association,'association_why',association_why,'admission_order',admission,'completion_order',completion,'education_document',education,'journals_available',true);\nEND;","next":"\nDECLARE e record;g uuid;gname text;association text:='unavailable';association_why text;facts jsonb;missing jsonb;\n d public.uc_automatic_admission_drafts;projection jsonb;r public.uc_document_registry_records;issued public.education_document_records;issue_state public.uc_education_issuance_states;\n source jsonb;proof jsonb;can_open boolean;can_manage boolean;admission jsonb;completion jsonb;education jsonb;action jsonb;typ text;state text;why text;code text;number text;dt date;\nBEGIN\n SELECT * INTO e FROM uc_education_journal_private.enrollments(p_org,p_scope||jsonb_build_object('enrollment_id',p_enrollment)) x WHERE x.enrollment_id=p_enrollment;\n IF NOT FOUND THEN RETURN NULL;END IF;\n facts:=public.uc_admission_document_source(e.enrollment_id,p_group);\n IF facts IS NOT NULL THEN g:=(facts->>'group_id')::uuid;missing:=facts->'missing_facts';END IF;\n IF p_group IS NOT NULL AND g IS DISTINCT FROM p_group THEN RETURN NULL;END IF;\n IF g IS NOT NULL AND NOT uc_education_journal_private.source_allowed(p_org,p_scope,g,e.enrollment_id,e.user_id,e.course_id) THEN\n  g:=NULL;facts:=NULL;\n END IF;\n SELECT left(name,2000) INTO gname FROM public.student_groups WHERE id=g AND organization_id=p_org;\n IF facts IS NULL THEN association_why:='Не удалось подтвердить связь обучения с группой и программой.';\n ELSIF missing ? 'ambiguous_group' THEN association:='choose_group';association_why:='Выберите группу для этого обучения.';\n ELSIF missing ? 'group_not_selected' THEN association:='group_missing';association_why:='Добавьте ученика в подходящую группу.';\n ELSIF missing ? 'group_course_not_bound' THEN association:='course_unbound';association_why:='Уточните программу и основание зачисления для этого обучения.';\n ELSIF missing ? 'program_not_confirmed' THEN association:='program_unconfirmed';association_why:='Подтвердите программу обучения для этой группы.';\n ELSE association:='confirmed';association_why:=NULL;END IF;\n can_manage:=NOT p_self AND public.uc_document_action_allowed(p_org,'write',g,e.enrollment_id);\n FOR typ IN SELECT unnest(ARRAY['enrollment_order','expulsion_order']) LOOP\n  source:=NULL;proof:=NULL;can_open:=false;number:=NULL;dt:=NULL;action:=NULL;state:='not_created';code:='ORDER_NOT_CREATED';\n  why:=CASE typ WHEN 'enrollment_order' THEN 'Приказ о зачислении ещё не оформлен.' ELSE 'Приказ об отчислении ещё не оформлен; требуется основание завершения или досрочного прекращения обучения.' END;\n  SELECT x.* INTO r FROM public.uc_document_registry_records x WHERE x.organization_id=p_org AND NOT x.redacted AND x.context_binding->>'enrollment_id'=e.enrollment_id::text AND x.data->>'document_type'=typ\n   AND uc_document_chain_private.registry_matches(p_org,p_scope,e.enrollment_id,e.user_id,e.course_id,p_group,x)\n   ORDER BY x.registered_at DESC,x.id DESC LIMIT 1;\n  IF FOUND THEN\n   number:=r.registration_id;dt:=(r.data->>'document_date')::date;\n   IF r.legacy_claim IS NOT NULL AND r.legacy_claim<>'null'::jsonb THEN state:='legacy_unverified';code:='LEGACY_ORDER_UNVERIFIED';why:='Сохранена прежняя запись; её происхождение не подтверждено этой цепочкой.';\n   ELSE state:='registered';code:=NULL;why:=NULL;END IF;\n   IF public.uc_custom_journal_shape(r.data->'source',ARRAY['kind','document_id','version_id','content_hash'])\n    AND r.data->'source'->>'kind'='org_document_version' AND public.uc_custom_journal_uuid(r.data->'source'->'document_id') AND public.uc_custom_journal_uuid(r.data->'source'->'version_id') THEN\n    source:=jsonb_build_object('kind','registry_record','id',r.id,'revision',r.revision,'document_id',r.data->'source'->'document_id','version_id',r.data->'source'->'version_id');\n    IF NOT p_self THEN\n     proof:=public.uc_document_registry_source(p_org,r.data->'source',false,false);\n     can_open:=proof IS NOT NULL AND coalesce((public.uc_document_registry_caps(p_org,r.group_id)->>'can_open_file')::boolean,false);\n    END IF;\n   END IF;\n   IF p_self THEN\n    proof:=uc_individual_orders_private.own_target(p_org,r.id,r.revision);can_open:=proof IS NOT NULL;\n    IF can_open THEN code:=NULL;why:=NULL;ELSE code:='INDIVIDUAL_EXTRACT_UNAVAILABLE';why:='Приказ зарегистрирован. Индивидуальная выписка пока недоступна; обратитесь в учебный центр.';END IF;\n   ELSIF NOT can_open THEN code:='SOURCE_UNAVAILABLE';why:='Запись сохранена; точный файл сейчас недоступен по текущим правам или состоянию источника.';END IF;\n  ELSIF typ='enrollment_order' THEN\n   SELECT x.* INTO d FROM public.uc_automatic_admission_drafts x WHERE x.organization_id=p_org AND x.enrollment_id=e.enrollment_id AND x.user_id=e.user_id AND x.course_id=e.course_id;\n   IF FOUND AND(p_group IS NULL OR d.group_id=p_group) AND uc_education_journal_private.source_allowed(p_org,p_scope,d.group_id,e.enrollment_id,e.user_id,e.course_id) THEN\n    projection:=public.uc_admission_draft_projection(d.id);dt:=d.document_date;\n    source:=jsonb_build_object('kind','admission_draft','id',d.id,'revision',d.revision,'enrollment_id',e.enrollment_id,'group_id',d.group_id);\n    IF d.status<>'disabled' AND coalesce((projection->>'stale')::boolean,true) IS FALSE AND coalesce((projection->>'registered_locked')::boolean,true) IS FALSE THEN\n     state:=CASE WHEN d.status='prepared' THEN 'draft' ELSE 'needs_information' END;\n     code:=CASE WHEN d.status='prepared' THEN 'DRAFT_NOT_APPROVED' ELSE 'DRAFT_NEEDS_INFORMATION' END;\n     why:=CASE WHEN d.status='prepared' THEN 'Подготовлен проект; подпись и регистрационный номер ещё не оформлены.' ELSE 'Проект сохранён; перед оформлением нужно уточнить сведения о программе и приёме.' END;can_open:=NOT p_self;\n    ELSE state:='needs_information';code:=CASE WHEN d.status='disabled' THEN 'PREPARATION_DISABLED' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'DRAFT_SOURCE_CHANGED' ELSE 'DRAFT_NEEDS_INFORMATION' END;\n     why:=CASE WHEN d.status='disabled' THEN 'Автоподготовка проекта отключена в настройках.' WHEN coalesce((projection->>'stale')::boolean,true) THEN 'Исходные сведения изменились; обновите проект в настройках зачисления.' ELSE 'Перед подготовкой проекта нужны сведения о группе и программе.' END;END IF;\n    IF p_self THEN code:='INDIVIDUAL_DRAFT_EXPORT_UNAVAILABLE';why:='Проект приказа подготовлен или требует сведений. Оформленную персональную выписку предоставляет учебный центр.';END IF;\n   END IF;\n  END IF;\n  IF can_manage AND typ='enrollment_order' AND state IN('needs_information','not_created') THEN\n   action:=CASE WHEN association IN('choose_group','group_missing') THEN jsonb_build_object('kind','choose_group','enrollment_id',e.enrollment_id)\n    WHEN association='program_unconfirmed' AND g IS NOT NULL THEN jsonb_build_object('kind','review_group_program','group_id',g)\n    ELSE jsonb_build_object('kind','review_admission_draft','enrollment_id',e.enrollment_id,'group_id',g) END;\n  ELSIF source IS NOT NULL AND can_open THEN action:=jsonb_build_object('kind','open_source','source',source);\n  ELSIF can_manage THEN action:=CASE WHEN typ='enrollment_order' THEN jsonb_build_object('kind','review_admission_draft','enrollment_id',e.enrollment_id,'group_id',g) ELSE jsonb_build_object('kind','review_completion','enrollment_id',e.enrollment_id,'group_id',g) END;END IF;\n  IF typ='enrollment_order' THEN admission:=uc_document_chain_private.slot('admission_order',state,code,why,number,dt,source,can_open,action);\n  ELSE completion:=uc_document_chain_private.slot('completion_order',state,code,why,number,dt,source,can_open,action);END IF;\n END LOOP;\n source:=NULL;can_open:=false;state:='not_created';code:='EDUCATION_DOCUMENT_NOT_ISSUED';why:='Итоговый документ ещё не выдан. Проверьте программу, аттестацию и условия выдачи.';number:=NULL;dt:=NULL;\n SELECT x.* INTO issued FROM public.education_document_records x WHERE x.organization_id=p_org AND x.enrollment_id=e.enrollment_id AND x.user_id=e.user_id\n  AND(x.course_id IS NULL OR x.course_id=e.course_id) AND x.deleted_at IS NULL AND(p_group IS NULL OR x.group_id=p_group)\n  AND uc_education_journal_private.source_allowed(p_org,p_scope,x.group_id,e.enrollment_id,e.user_id,e.course_id)\n  AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_states z WHERE z.record_id=x.id AND z.redacted)\n  ORDER BY x.issue_date DESC,x.created_at DESC,x.id DESC LIMIT 1;\n IF FOUND THEN\n  number:=issued.document_number;dt:=issued.issue_date;\n  SELECT * INTO issue_state FROM public.uc_education_issuance_states s WHERE s.record_id=issued.id AND s.organization_id=p_org AND s.user_id=e.user_id\n   AND s.enrollment_id=e.enrollment_id AND s.course_id=e.course_id AND NOT s.redacted;\n  IF NOT FOUND OR issued.course_id IS DISTINCT FROM e.course_id OR issue_state.group_id IS DISTINCT FROM issued.group_id OR issue_state.proof IS NULL OR issue_state.proof='null'::jsonb THEN state:='legacy_unverified';code:='LEGACY_ISSUANCE_UNVERIFIED';why:='Сохранена прежняя запись. Контролируемое основание выдачи этой цепочкой не подтверждено.';\n  ELSE\n   state:=CASE WHEN issue_state.annulment IS NOT NULL THEN 'annulled' ELSE 'issued' END;code:=NULL;why:=CASE WHEN issue_state.annulment IS NOT NULL THEN 'Документ аннулирован; прежняя запись сохранена.' ELSE NULL END;\n   source:=jsonb_build_object('kind','education_record','id',issued.id,'revision',issue_state.revision,'enrollment_id',e.enrollment_id);\n   IF NOT p_self THEN can_open:=public.uc_education_issue_can(p_org,issued.group_id,e.enrollment_id,e.user_id,e.course_id,'read')\n    AND public.uc_education_issue_source(p_org,issue_state.artifact->'source',false) IS NOT NULL;END IF;\n   IF p_self THEN code:='OWN_CONTROLLED_DOWNLOAD_UNAVAILABLE';why:='Документ учтён. Персональная загрузка этого оформленного файла пока недоступна в данном разделе.';\n   ELSIF NOT can_open THEN code:='SOURCE_UNAVAILABLE';why:='Выдача сохранена; точный оформленный файл сейчас недоступен.';END IF;\n  END IF;\n END IF;\n action:=CASE WHEN source IS NOT NULL AND can_open THEN jsonb_build_object('kind','open_source','source',source) WHEN can_manage THEN jsonb_build_object('kind','review_issuance','enrollment_id',e.enrollment_id,'course_id',e.course_id,'group_id',g) ELSE NULL END;\n education:=uc_document_chain_private.slot('education_document',state,code,why,number,dt,source,can_open,action);\n RETURN jsonb_build_object('enrollment_id',e.enrollment_id,'student_user_id',e.user_id,'student_label',left(coalesce(nullif(e.person_label,''),'Имя не указано'),2000),\n 'course_id',e.course_id,'course_label',left(coalesce(nullif(e.course_label,''),'Курс'),2000),'group_id',g,'group_label',gname,\n 'association_state',association,'association_why',association_why,'admission_order',admission,'completion_order',completion,'education_document',education,'journals_available',true);\nEND;"},{"identity":"uc_document_chain_private.resolve_source(uuid,jsonb,uuid,uuid,jsonb,boolean)","before_md5":"c16b8cc3f1ae62477e7761b92da8c7b8","after_md5":"fc829dfd9fde8eeb56335451d28529dd","old":"\nDECLARE e record;d public.uc_automatic_admission_drafts;r public.uc_document_registry_records;s public.uc_education_issuance_states;i public.education_document_records;projection jsonb;target jsonb;why text;kind text:=p_source->>'kind';\nBEGIN\n IF jsonb_typeof(p_source) IS DISTINCT FROM 'object' OR jsonb_typeof(p_source->'kind') IS DISTINCT FROM 'string' THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n IF kind<>'org_document_version' THEN\n  IF jsonb_typeof(p_source->'revision') IS DISTINCT FROM 'number' OR coalesce(p_source->>'revision','')!~'^[1-9][0-9]{0,15}$' THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n  IF(p_source->>'revision')::numeric>9007199254740991 THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n END IF;\n SELECT * INTO e FROM uc_education_journal_private.enrollments(p_org,p_scope||jsonb_build_object('enrollment_id',p_enrollment)) x WHERE x.enrollment_id=p_enrollment;\n IF NOT FOUND THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;\n IF kind='admission_draft' THEN\n  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','id','revision','enrollment_id','group_id']) OR NOT public.uc_custom_journal_uuid(p_source->'id')\n  OR p_source->>'enrollment_id' IS DISTINCT FROM p_enrollment::text OR jsonb_typeof(p_source->'group_id') NOT IN('string','null') THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n  SELECT * INTO d FROM public.uc_automatic_admission_drafts WHERE id=(p_source->>'id')::uuid AND organization_id=p_org AND enrollment_id=e.enrollment_id AND user_id=e.user_id AND course_id=e.course_id;\n  IF NOT FOUND OR(p_group IS NOT NULL AND d.group_id IS DISTINCT FROM p_group) OR NOT uc_education_journal_private.source_allowed(p_org,p_scope,d.group_id,e.enrollment_id,e.user_id,e.course_id) THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;\n  IF d.revision::text IS DISTINCT FROM p_source->>'revision' OR d.group_id::text IS DISTINCT FROM p_source->>'group_id' THEN PERFORM uc_document_chain_private.fail('SOURCE_CHANGED');END IF;\n  projection:=public.uc_admission_draft_projection(d.id);\n  IF p_self THEN why:='Индивидуальный экспорт проекта здесь недоступен. Оформленную выписку предоставляет учебный центр.';\n  ELSIF d.status='disabled' OR coalesce((projection->>'stale')::boolean,true) OR coalesce((projection->>'registered_locked')::boolean,true) THEN why:='Исходные сведения проекта изменились или приказ уже оформлен. Откройте актуальное состояние зачисления.';\n  ELSE target:=jsonb_build_object('kind','admission_draft','draft',projection,'enrollment_id',e.enrollment_id,'group_id',d.group_id);END IF;\n ELSIF kind='registry_record' THEN\n  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','id','revision','document_id','version_id']) OR NOT public.uc_custom_journal_uuid(p_source->'id') OR NOT public.uc_custom_journal_uuid(p_source->'document_id') OR NOT public.uc_custom_journal_uuid(p_source->'version_id') THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n  SELECT * INTO r FROM public.uc_document_registry_records x WHERE x.id=(p_source->>'id')::uuid AND x.data->>'document_type' IN('enrollment_order','expulsion_order')\n   AND uc_document_chain_private.registry_matches(p_org,p_scope,e.enrollment_id,e.user_id,e.course_id,p_group,x);\n  IF NOT FOUND THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;\n  IF r.revision::text IS DISTINCT FROM p_source->>'revision' OR r.data->'source'->>'document_id' IS DISTINCT FROM p_source->>'document_id' OR r.data->'source'->>'version_id' IS DISTINCT FROM p_source->>'version_id' THEN PERFORM uc_document_chain_private.fail('SOURCE_CHANGED');END IF;\n  IF p_self THEN why:='Полный приказ может содержать данные других учеников. Индивидуальная выписка пока недоступна.';\n  ELSIF public.uc_document_registry_source(p_org,r.data->'source',false,false) IS NULL OR NOT coalesce((public.uc_document_registry_caps(p_org,r.group_id)->>'can_open_file')::boolean,false) THEN why:='Точный файл сейчас недоступен по текущим правам или состоянию источника.';\n  ELSE target:=jsonb_build_object('kind','registry_record','record_id',r.id,'revision',r.revision);END IF;\n ELSIF kind='education_record' THEN\n  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','id','revision','enrollment_id']) OR NOT public.uc_custom_journal_uuid(p_source->'id') OR p_source->>'enrollment_id' IS DISTINCT FROM p_enrollment::text THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n  SELECT x.* INTO i FROM public.education_document_records x WHERE x.id=(p_source->>'id')::uuid AND x.organization_id=p_org AND x.enrollment_id=e.enrollment_id AND x.user_id=e.user_id AND(x.course_id IS NULL OR x.course_id=e.course_id) AND x.deleted_at IS NULL\n   AND(p_group IS NULL OR x.group_id=p_group) AND uc_education_journal_private.source_allowed(p_org,p_scope,x.group_id,e.enrollment_id,e.user_id,e.course_id);\n  SELECT * INTO s FROM public.uc_education_issuance_states WHERE record_id=i.id AND organization_id=p_org AND user_id=e.user_id AND enrollment_id=e.enrollment_id AND course_id=e.course_id AND NOT redacted;\n  IF i.id IS NULL OR i.course_id IS DISTINCT FROM e.course_id OR s.group_id IS DISTINCT FROM i.group_id OR s.record_id IS NULL OR s.proof IS NULL OR s.proof='null'::jsonb THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;\n  IF s.revision::text IS DISTINCT FROM p_source->>'revision' THEN PERFORM uc_document_chain_private.fail('SOURCE_CHANGED');END IF;\n  IF p_self THEN why:='Персональная загрузка оформленного файла пока недоступна в данном разделе.';\n  ELSIF NOT public.uc_education_issue_can(p_org,i.group_id,e.enrollment_id,e.user_id,e.course_id,'read') OR public.uc_education_issue_source(p_org,s.artifact->'source',false) IS NULL THEN why:='Точный оформленный файл сейчас недоступен.';\n  ELSE target:=jsonb_build_object('kind','education_record','record_id',i.id,'revision',s.revision,'enrollment_id',e.enrollment_id);END IF;\n ELSIF kind='org_document_version' THEN\n  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','document_id','version_id','proof_hash']) OR NOT public.uc_custom_journal_uuid(p_source->'document_id') OR NOT public.uc_custom_journal_uuid(p_source->'version_id') OR coalesce(p_source->>'proof_hash','')!~'^[a-f0-9]{64}$' THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n  SELECT x.* INTO r FROM public.uc_document_registry_records x WHERE uc_document_chain_private.registry_matches(p_org,p_scope,e.enrollment_id,e.user_id,e.course_id,p_group,x)\n   AND x.data->'source'=jsonb_build_object('kind','org_document_version','document_id',p_source->'document_id','version_id',p_source->'version_id','content_hash',p_source->'proof_hash') ORDER BY x.registered_at DESC,x.id DESC LIMIT 1;\n  IF NOT FOUND THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;\n  IF p_self THEN why:='Полная версия документа организации недоступна ученику. Нужна отдельная персональная выписка.';\n  ELSIF public.uc_document_registry_source(p_org,r.data->'source',false,false) IS NULL OR NOT coalesce((public.uc_document_registry_caps(p_org,r.group_id)->>'can_open_file')::boolean,false) THEN why:='Точная версия источника сейчас недоступна.';\n  ELSE target:=p_source;END IF;\n ELSE PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n RETURN jsonb_build_object('availability',CASE WHEN target IS NULL THEN 'unavailable' ELSE 'available' END,'why',why,'source',p_source,'target',target,\n 'context',jsonb_build_object('organization_id',p_org,'student_user_id',e.user_id,'enrollment_id',e.enrollment_id,'course_id',e.course_id,'group_id',p_group));\nEND;","next":"\nDECLARE e record;d public.uc_automatic_admission_drafts;r public.uc_document_registry_records;s public.uc_education_issuance_states;i public.education_document_records;projection jsonb;target jsonb;why text;kind text:=p_source->>'kind';\nBEGIN\n IF jsonb_typeof(p_source) IS DISTINCT FROM 'object' OR jsonb_typeof(p_source->'kind') IS DISTINCT FROM 'string' THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n IF kind<>'org_document_version' THEN\n  IF jsonb_typeof(p_source->'revision') IS DISTINCT FROM 'number' OR coalesce(p_source->>'revision','')!~'^[1-9][0-9]{0,15}$' THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n  IF(p_source->>'revision')::numeric>9007199254740991 THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n END IF;\n SELECT * INTO e FROM uc_education_journal_private.enrollments(p_org,p_scope||jsonb_build_object('enrollment_id',p_enrollment)) x WHERE x.enrollment_id=p_enrollment;\n IF NOT FOUND THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;\n IF kind='admission_draft' THEN\n  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','id','revision','enrollment_id','group_id']) OR NOT public.uc_custom_journal_uuid(p_source->'id')\n  OR p_source->>'enrollment_id' IS DISTINCT FROM p_enrollment::text OR jsonb_typeof(p_source->'group_id') NOT IN('string','null') THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n  SELECT * INTO d FROM public.uc_automatic_admission_drafts WHERE id=(p_source->>'id')::uuid AND organization_id=p_org AND enrollment_id=e.enrollment_id AND user_id=e.user_id AND course_id=e.course_id;\n  IF NOT FOUND OR(p_group IS NOT NULL AND d.group_id IS DISTINCT FROM p_group) OR NOT uc_education_journal_private.source_allowed(p_org,p_scope,d.group_id,e.enrollment_id,e.user_id,e.course_id) THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;\n  IF d.revision::text IS DISTINCT FROM p_source->>'revision' OR d.group_id::text IS DISTINCT FROM p_source->>'group_id' THEN PERFORM uc_document_chain_private.fail('SOURCE_CHANGED');END IF;\n  projection:=public.uc_admission_draft_projection(d.id);\n  IF p_self THEN why:='Индивидуальный экспорт проекта здесь недоступен. Оформленную выписку предоставляет учебный центр.';\n  ELSIF d.status='disabled' OR coalesce((projection->>'stale')::boolean,true) OR coalesce((projection->>'registered_locked')::boolean,true) THEN why:='Исходные сведения проекта изменились или приказ уже оформлен. Откройте актуальное состояние зачисления.';\n  ELSE target:=jsonb_build_object('kind','admission_draft','draft',projection,'enrollment_id',e.enrollment_id,'group_id',d.group_id);END IF;\n ELSIF kind='registry_record' THEN\n  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','id','revision','document_id','version_id']) OR NOT public.uc_custom_journal_uuid(p_source->'id') OR NOT public.uc_custom_journal_uuid(p_source->'document_id') OR NOT public.uc_custom_journal_uuid(p_source->'version_id') THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n  SELECT * INTO r FROM public.uc_document_registry_records x WHERE x.id=(p_source->>'id')::uuid AND x.data->>'document_type' IN('enrollment_order','expulsion_order')\n   AND uc_document_chain_private.registry_matches(p_org,p_scope,e.enrollment_id,e.user_id,e.course_id,p_group,x);\n  IF NOT FOUND THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;\n  IF r.revision::text IS DISTINCT FROM p_source->>'revision' OR r.data->'source'->>'document_id' IS DISTINCT FROM p_source->>'document_id' OR r.data->'source'->>'version_id' IS DISTINCT FROM p_source->>'version_id' THEN PERFORM uc_document_chain_private.fail('SOURCE_CHANGED');END IF;\n  IF p_self THEN\n   target:=uc_individual_orders_private.own_target(p_org,r.id,r.revision);\n   IF target IS NULL THEN why:='Полный приказ может содержать данные других учеников. Индивидуальная выписка пока недоступна.';END IF;\n  ELSIF public.uc_document_registry_source(p_org,r.data->'source',false,false) IS NULL OR NOT coalesce((public.uc_document_registry_caps(p_org,r.group_id)->>'can_open_file')::boolean,false) THEN why:='Точный файл сейчас недоступен по текущим правам или состоянию источника.';\n  ELSE target:=jsonb_build_object('kind','registry_record','record_id',r.id,'revision',r.revision);END IF;\n ELSIF kind='education_record' THEN\n  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','id','revision','enrollment_id']) OR NOT public.uc_custom_journal_uuid(p_source->'id') OR p_source->>'enrollment_id' IS DISTINCT FROM p_enrollment::text THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n  SELECT x.* INTO i FROM public.education_document_records x WHERE x.id=(p_source->>'id')::uuid AND x.organization_id=p_org AND x.enrollment_id=e.enrollment_id AND x.user_id=e.user_id AND(x.course_id IS NULL OR x.course_id=e.course_id) AND x.deleted_at IS NULL\n   AND(p_group IS NULL OR x.group_id=p_group) AND uc_education_journal_private.source_allowed(p_org,p_scope,x.group_id,e.enrollment_id,e.user_id,e.course_id);\n  SELECT * INTO s FROM public.uc_education_issuance_states WHERE record_id=i.id AND organization_id=p_org AND user_id=e.user_id AND enrollment_id=e.enrollment_id AND course_id=e.course_id AND NOT redacted;\n  IF i.id IS NULL OR i.course_id IS DISTINCT FROM e.course_id OR s.group_id IS DISTINCT FROM i.group_id OR s.record_id IS NULL OR s.proof IS NULL OR s.proof='null'::jsonb THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;\n  IF s.revision::text IS DISTINCT FROM p_source->>'revision' THEN PERFORM uc_document_chain_private.fail('SOURCE_CHANGED');END IF;\n  IF p_self THEN why:='Персональная загрузка оформленного файла пока недоступна в данном разделе.';\n  ELSIF NOT public.uc_education_issue_can(p_org,i.group_id,e.enrollment_id,e.user_id,e.course_id,'read') OR public.uc_education_issue_source(p_org,s.artifact->'source',false) IS NULL THEN why:='Точный оформленный файл сейчас недоступен.';\n  ELSE target:=jsonb_build_object('kind','education_record','record_id',i.id,'revision',s.revision,'enrollment_id',e.enrollment_id);END IF;\n ELSIF kind='org_document_version' THEN\n  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','document_id','version_id','proof_hash']) OR NOT public.uc_custom_journal_uuid(p_source->'document_id') OR NOT public.uc_custom_journal_uuid(p_source->'version_id') OR coalesce(p_source->>'proof_hash','')!~'^[a-f0-9]{64}$' THEN PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n  SELECT x.* INTO r FROM public.uc_document_registry_records x WHERE uc_document_chain_private.registry_matches(p_org,p_scope,e.enrollment_id,e.user_id,e.course_id,p_group,x)\n   AND x.data->'source'=jsonb_build_object('kind','org_document_version','document_id',p_source->'document_id','version_id',p_source->'version_id','content_hash',p_source->'proof_hash') ORDER BY x.registered_at DESC,x.id DESC LIMIT 1;\n  IF NOT FOUND THEN PERFORM uc_document_chain_private.fail('NOT_FOUND');END IF;\n  IF p_self THEN why:='Полная версия документа организации недоступна ученику. Нужна отдельная персональная выписка.';\n  ELSIF public.uc_document_registry_source(p_org,r.data->'source',false,false) IS NULL OR NOT coalesce((public.uc_document_registry_caps(p_org,r.group_id)->>'can_open_file')::boolean,false) THEN why:='Точная версия источника сейчас недоступна.';\n  ELSE target:=p_source;END IF;\n ELSE PERFORM uc_document_chain_private.fail('INVALID_INPUT');END IF;\n RETURN jsonb_build_object('availability',CASE WHEN target IS NULL THEN 'unavailable' ELSE 'available' END,'why',why,'source',p_source,'target',target,\n 'context',jsonb_build_object('organization_id',p_org,'student_user_id',e.user_id,'enrollment_id',e.enrollment_id,'course_id',e.course_id,'group_id',p_group));\nEND;"}]$patches$::jsonb)LOOP
  fn_oid:=to_regprocedure(patch->>'identity');
  SELECT prosrc,pg_get_functiondef(oid),jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'volatility',provolatile,'security_definer',prosecdef,'args',proargnames,'argtypes',proargtypes::text,'return',prorettype)INTO STRICT old_body,old_def,before_meta FROM pg_proc WHERE oid=fn_oid;
  IF md5(old_body)IS DISTINCT FROM patch->>'before_md5'OR old_body IS DISTINCT FROM patch->>'old'THEN RAISE EXCEPTION 'W1_DEPENDENCY_PREIMAGE_CHANGED:%',patch->>'identity';END IF;
  new_body:=patch->>'next';
  IF md5(new_body)IS DISTINCT FROM patch->>'after_md5'OR strpos(old_def,old_body)=0 OR strpos(substr(old_def,strpos(old_def,old_body)+length(old_body)),old_body)>0 THEN RAISE EXCEPTION 'W1_BODY_DELTA_INVALID';END IF;
  new_def:=overlay(old_def placing new_body from strpos(old_def,old_body)for length(old_body));EXECUTE new_def;
  SELECT jsonb_build_object('owner',proowner,'acl',proacl,'config',proconfig,'volatility',provolatile,'security_definer',prosecdef,'args',proargnames,'argtypes',proargtypes::text,'return',prorettype)INTO STRICT after_meta FROM pg_proc WHERE oid=fn_oid;
  IF before_meta IS DISTINCT FROM after_meta OR(SELECT md5(prosrc)FROM pg_proc WHERE oid=fn_oid)IS DISTINCT FROM patch->>'after_md5'THEN RAISE EXCEPTION 'W1_BODY_DELTA_POSTIMAGE_CHANGED';END IF;
 END LOOP;
END;$body_delta$;

-- Strip provider-specific default grants ONLY from objects created by this
-- migration. No existing role, membership, default ACL or storage grant changes.
DO $acl$
DECLARE obj record;grantee_oid oid;owner_oid oid;allowed_oid oid;privilege_name text;
BEGIN
 FOR obj IN SELECT p.oid,p.oid::regprocedure signature,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='uc_individual_orders_private'OR p.oid IN('public.read_individual_education_order(uuid,uuid,jsonb)'::regprocedure,'public.apply_individual_education_order(uuid,uuid,bigint,uuid,jsonb)'::regprocedure,
   'public.attest_individual_education_order_artifact_service(jsonb,uuid,jsonb)'::regprocedure,'public.read_individual_education_order_file_context_service(jsonb,uuid)'::regprocedure)
 LOOP
  allowed_oid:=CASE WHEN obj.oid IN('public.read_individual_education_order(uuid,uuid,jsonb)'::regprocedure,'public.apply_individual_education_order(uuid,uuid,bigint,uuid,jsonb)'::regprocedure)THEN'authenticated'::regrole::oid
   WHEN obj.oid IN('public.attest_individual_education_order_artifact_service(jsonb,uuid,jsonb)'::regprocedure,'public.read_individual_education_order_file_context_service(jsonb,uuid)'::regprocedure)THEN'service_role'::regrole::oid END;
  FOR grantee_oid IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=obj.oid AND a.grantee<>obj.proowner LOOP
   IF grantee_oid=0 THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',obj.signature);ELSE EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',obj.signature,pg_get_userbyid(grantee_oid));END IF;
  END LOOP;
  IF allowed_oid IS NOT NULL THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',obj.signature,pg_get_userbyid(allowed_oid));END IF;
 END LOOP;
 FOR obj IN SELECT c.oid,c.oid::regclass relation,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='uc_individual_orders_private'AND c.relkind IN('r','S','v','m','f')LOOP
  FOR grantee_oid IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S'THEN'S'::"char"ELSE'r'::"char"END,c.relowner)))a WHERE c.oid=obj.oid AND a.grantee<>obj.relowner LOOP
   IF grantee_oid=0 THEN EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC',obj.relation);ELSE EXECUTE format('REVOKE ALL ON TABLE %s FROM %I',obj.relation,pg_get_userbyid(grantee_oid));END IF;
  END LOOP;
  FOR grantee_oid IN SELECT DISTINCT a.grantee FROM pg_attribute t CROSS JOIN LATERAL aclexplode(t.attacl)a WHERE t.attrelid=obj.oid AND a.grantee<>obj.relowner LOOP
   FOR privilege_name IN SELECT DISTINCT a.privilege_type FROM pg_attribute t CROSS JOIN LATERAL aclexplode(t.attacl)a WHERE t.attrelid=obj.oid AND a.grantee=grantee_oid LOOP
    EXECUTE format('REVOKE %s (%s) ON TABLE %s FROM %s',privilege_name,(SELECT string_agg(quote_ident(t.attname),','ORDER BY t.attnum)FROM pg_attribute t CROSS JOIN LATERAL aclexplode(t.attacl)a WHERE t.attrelid=obj.oid AND a.grantee=grantee_oid AND a.privilege_type=privilege_name),obj.relation,CASE WHEN grantee_oid=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(grantee_oid))END);
   END LOOP;
  END LOOP;
 END LOOP;
 SELECT nspowner INTO STRICT owner_oid FROM pg_namespace WHERE nspname='uc_individual_orders_private';
 FOR grantee_oid IN SELECT DISTINCT a.grantee FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a WHERE n.nspname='uc_individual_orders_private'AND a.grantee<>owner_oid LOOP
  IF grantee_oid=0 THEN REVOKE ALL ON SCHEMA uc_individual_orders_private FROM PUBLIC;ELSE EXECUTE format('REVOKE ALL ON SCHEMA uc_individual_orders_private FROM %I',pg_get_userbyid(grantee_oid));END IF;
 END LOOP;
END;$acl$;
COMMENT ON FUNCTION public.read_individual_education_order(uuid,uuid,jsonb)IS'Bounded actual individual programme, legal-decision and retained artifact projection; no automatic legal act from learning progress.';
COMMENT ON FUNCTION public.apply_individual_education_order(uuid,uuid,bigint,uuid,jsonb)IS'Explicit authorized individual admission/termination decisions and one reviewed PDF registration through the existing registry/number namespace. Issuer signature is not observed by this feature.';
COMMENT ON FUNCTION public.attest_individual_education_order_artifact_service(jsonb,uuid,jsonb)IS'Service-only actual-getUser actor, immutable job and fresh byte-proof binding; raw object metadata alone never attests a PDF or a signature.';
COMMENT ON FUNCTION public.read_individual_education_order_file_context_service(jsonb,uuid)IS'Service-only exact-own registered individual PDF context. Historical registered source is independent of current programme pointers; privacy and billing remain current.';
COMMIT;
