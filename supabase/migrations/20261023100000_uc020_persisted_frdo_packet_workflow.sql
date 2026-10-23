-- UC020 COMPLETE CANDIDATE SOURCE ONLY: not a production migration, no ledger/time assigned.
-- Seven new private models, actual deployed UC019 K SHA73a44f8fb32c51682962c02211f24439e574132e06cb9f325e2407082fc48bc6 prerequisite.
-- New narrow APIs and explicit UC018/privacy/storage additions; preserve every old row and old branch.
-- This held transaction intentionally ROLLBACKs. Native review and production preservation wrapper are mandatory.
BEGIN;
SET LOCAL search_path=pg_catalog,public,extensions;

DO $fresh$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND (left(p.proname,8)='uc_frdo_'OR p.proname='read_frdo_packets'))OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname IN('uc_frdo_supplement_revisions','uc_frdo_packets','uc_frdo_packet_subjects','uc_frdo_packet_artifact_builds','uc_frdo_packet_events','uc_frdo_packet_requests','uc_frdo_operator_authority_revisions'))THEN RAISE EXCEPTION 'FRDO_SOURCE_NAMESPACE_ALREADY_EXISTS';END IF;
END;$fresh$;

CREATE FUNCTION public.uc_frdo_error(p_code text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
 IF p_code NOT IN ('INVALID_REQUEST','AUTH_REQUIRED','ACCESS_DENIED','SOURCE_UNAVAILABLE','SOURCE_CHANGED','READINESS_BLOCKED','TEMPLATE_CHANGED','IDEMPOTENCY_CONFLICT','REVISION_CONFLICT','ARTIFACT_UNAVAILABLE','FILE_GENERATION_FAILED','RECEIPT_MISMATCH','ILLEGAL_TRANSITION','DEPENDENCY_UNAVAILABLE','FRDO_PACKET_RETENTION_REVIEW_REQUIRED') THEN p_code:='INVALID_REQUEST';END IF;
 RAISE EXCEPTION 'FRDO_PACKET_%',p_code USING ERRCODE=CASE WHEN p_code='AUTH_REQUIRED'THEN 'PT401' WHEN p_code='ACCESS_DENIED'THEN 'PT403' WHEN p_code IN('INVALID_REQUEST','READINESS_BLOCKED','TEMPLATE_CHANGED','RECEIPT_MISMATCH')THEN 'PT400' WHEN p_code='DEPENDENCY_UNAVAILABLE'THEN 'PT503' ELSE 'PT409' END;
END;$fn$;

-- Same canonical JSON domain as held J: only ASCII object keys, safe integers,
-- valid UTF8 strings and depth<=64. Values use PostgreSQL JSON string escaping;
-- native cross-language vectors are mandatory before any release. This is NOT
-- jsonb::text hashing or an authorization/proof of bytes.
CREATE FUNCTION public.uc_frdo_canonical(p_value jsonb,p_depth integer DEFAULT 0) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE kind text;result text;entry record;number numeric;
BEGIN
 IF p_value IS NULL OR p_depth<0 OR p_depth>64 OR octet_length(p_value::text)>8000000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 kind:=jsonb_typeof(p_value);
 IF kind IN('null','boolean','string')THEN RETURN p_value::text;
 ELSIF kind='number'THEN number:=(p_value#>>'{}')::numeric;IF number<>trunc(number)OR abs(number)>9007199254740991 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;RETURN trunc(number)::bigint::text;
 ELSIF kind='array'THEN
  SELECT '['||coalesce(string_agg(public.uc_frdo_canonical(value,p_depth+1),',' ORDER BY ordinal),'')||']' INTO result FROM jsonb_array_elements(p_value)WITH ORDINALITY a(value,ordinal);
 ELSIF kind='object'THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_value)AS keys(key) WHERE key!~'^[A-Za-z0-9_]+$')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.uc_frdo_canonical(value,p_depth+1),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(p_value);
 ELSE PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 IF octet_length(result)>8000000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;RETURN result;
END;$fn$;
CREATE FUNCTION public.uc_frdo_hash(p_value jsonb)RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,extensions AS $fn$
 SELECT encode(digest(convert_to(public.uc_frdo_canonical(p_value),'UTF8'),'sha256'),'hex')$fn$;
CREATE FUNCTION public.uc_frdo_shape(p_value jsonb,p_keys text[])RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN jsonb_typeof(p_value)='object'THEN coalesce((SELECT array_agg(key ORDER BY key COLLATE "C")FROM jsonb_object_keys(p_value)AS keys(key))=(SELECT array_agg(key ORDER BY key COLLATE "C")FROM unnest(p_keys)AS keys(key)),false)ELSE false END$fn$;
CREATE FUNCTION public.uc_frdo_scope_valid(p_scope jsonb)RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_frdo_shape(p_scope,ARRAY['kind'])AND p_scope->>'kind'='organization'OR public.uc_frdo_shape(p_scope,ARRAY['kind','group_id'])AND p_scope->>'kind'='group'AND public.uc_custom_journal_uuid(p_scope->'group_id'),false)$fn$;

-- Seven physical models. No raw table privileges/policies are made available to
-- client/service roles. Historical foreign keys never cascade or silently null PII.
CREATE TABLE public.uc_frdo_supplement_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 record_id uuid NOT NULL REFERENCES public.education_document_records(id),user_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),frozen_facts_sha256 text NOT NULL CHECK(frozen_facts_sha256~'^[a-f0-9]{64}$'),
 fields jsonb NOT NULL CHECK(jsonb_typeof(fields)='object'),evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='array'AND jsonb_array_length(evidence)BETWEEN 1 AND 30),
 source_reads jsonb NOT NULL CHECK(jsonb_typeof(source_reads)='array'),snapshot_sha256 text NOT NULL CHECK(snapshot_sha256~'^[a-f0-9]{64}$'),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),reviewed_by uuid,review_note text CHECK(char_length(review_note)BETWEEN 1 AND 4000),
 request_id uuid NOT NULL,retained_people uuid[] NOT NULL,redacted boolean NOT NULL DEFAULT false,
 UNIQUE(organization_id,record_id,revision),UNIQUE(organization_id,id,revision),
 CHECK(octet_length(fields::text)+octet_length(evidence::text)+octet_length(source_reads::text)<=8000000)
);
CREATE TABLE public.uc_frdo_packets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),scope jsonb NOT NULL CHECK(public.uc_frdo_scope_valid(scope)),
 group_id uuid REFERENCES public.student_groups(id),stream text NOT NULL CHECK(stream IN('dpo','po')),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),state_hash text NOT NULL CHECK(state_hash~'^[a-f0-9]{64}$'),
 cursor_secret bytea NOT NULL DEFAULT gen_random_bytes(32)CHECK(octet_length(cursor_secret)=32),
 state text NOT NULL CHECK(state IN('preview_frozen','file_generating','file_generation_failed','file_generated','administrative_handover_recorded','fis_upload_recorded','accepted','partially_rejected','rejected','receipt_unresolved','correction_abandoned')),
 capture jsonb NOT NULL CHECK(jsonb_typeof(capture)='object'AND octet_length(capture::text)<=8000000),snapshot_sha256 text NOT NULL CHECK(snapshot_sha256~'^[a-f0-9]{64}$'),
 source_reads jsonb NOT NULL CHECK(jsonb_typeof(source_reads)='array'AND octet_length(source_reads::text)<=8000000),
 parent_correction jsonb,issuer_review jsonb NOT NULL CHECK(jsonb_typeof(issuer_review)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid,
 retained_people uuid[] NOT NULL,current_build_id uuid,latest_registry_record_id uuid,
 latest_admin_handover_event_id uuid,latest_upload_event_id uuid,latest_receipt_event_id uuid,redacted boolean NOT NULL DEFAULT false,
 UNIQUE(organization_id,id),CHECK((scope->>'kind'='group'AND group_id=(scope->>'group_id')::uuid)OR(scope->>'kind'='organization'AND group_id IS NULL))
);
CREATE TABLE public.uc_frdo_packet_subjects(
 packet_id uuid NOT NULL REFERENCES public.uc_frdo_packets(id),record_id uuid NOT NULL REFERENCES public.education_document_records(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),group_id uuid REFERENCES public.student_groups(id),
 user_id uuid NOT NULL,enrollment_id uuid NOT NULL REFERENCES public.enrollments(id),course_id uuid NOT NULL REFERENCES public.courses(id),
 selected boolean NOT NULL,original boolean NOT NULL,PRIMARY KEY(packet_id,record_id),CHECK(selected OR original),
 FOREIGN KEY(organization_id,packet_id)REFERENCES public.uc_frdo_packets(organization_id,id)
);
CREATE INDEX uc_frdo_packet_subjects_person ON public.uc_frdo_packet_subjects(user_id,packet_id);
CREATE TABLE public.uc_frdo_packet_artifact_builds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),artifact_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),packet_id uuid NOT NULL REFERENCES public.uc_frdo_packets(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),actor_id uuid NOT NULL,input_revision bigint NOT NULL CHECK(input_revision BETWEEN 1 AND 9007199254740991),
 snapshot_sha256 text NOT NULL CHECK(snapshot_sha256~'^[a-f0-9]{64}$'),worker_request_id uuid NOT NULL,phase text NOT NULL CHECK(phase IN('queued','generating','failed','sealed')),
 lease_id uuid,lease_until timestamptz,bucket_id text NOT NULL CHECK(bucket_id='frdo-packet-artifacts'),object_path text NOT NULL,
 object_id uuid,object_updated_at timestamptz,byte_sha256 text CHECK(byte_sha256~'^[a-f0-9]{64}$'),byte_size bigint CHECK(byte_size BETWEEN 1 AND 20971520),
 readback_sha256 text CHECK(readback_sha256~'^[a-f0-9]{64}$'),part_proofs jsonb,template jsonb NOT NULL,artifact_ref jsonb,
 mime text NOT NULL DEFAULT'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'CHECK(mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
 signing jsonb NOT NULL DEFAULT'{"status":"not_verified"}'CHECK(signing='{"status":"not_verified"}'::jsonb),
 failure text CHECK(failure IN('FILE_GENERATION_FAILED','DEPENDENCY_UNAVAILABLE','SOURCE_CHANGED')),registry_record_id uuid,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),retained_people uuid[] NOT NULL,
 UNIQUE(packet_id,worker_request_id),UNIQUE(bucket_id,object_path),
 CHECK((phase='sealed'AND object_id IS NOT NULL AND object_updated_at IS NOT NULL AND byte_sha256 IS NOT NULL AND byte_size IS NOT NULL AND readback_sha256 IS NOT NULL AND readback_sha256=byte_sha256 AND artifact_ref IS NOT NULL AND failure IS NULL AND jsonb_typeof(part_proofs)='array'AND jsonb_array_length(part_proofs)=14)
 OR(phase<>'sealed'AND artifact_ref IS NULL AND byte_sha256 IS NULL AND byte_size IS NULL AND readback_sha256 IS NULL AND part_proofs IS NULL AND object_id IS NULL AND object_updated_at IS NULL AND((phase='failed')=(failure IS NOT NULL))))
);
CREATE TABLE public.uc_frdo_packet_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),packet_id uuid NOT NULL REFERENCES public.uc_frdo_packets(id),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),kind text NOT NULL CHECK(kind IN('preview_frozen','file_requested','file_sealed','file_failed','registry_recorded','admin_handover','fis_upload','receipt_recorded','correction_created','correction_abandoned')),
 actor_id uuid,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),previous_state_hash text CHECK(previous_state_hash~'^[a-f0-9]{64}$'),state_hash text NOT NULL CHECK(state_hash~'^[a-f0-9]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'AND octet_length(payload::text)<=8000000),retained_people uuid[] NOT NULL,
 UNIQUE(packet_id,revision),UNIQUE(packet_id,id),FOREIGN KEY(organization_id,packet_id)REFERENCES public.uc_frdo_packets(organization_id,id)
);
CREATE TABLE public.uc_frdo_packet_requests(
 actor_id uuid NOT NULL,request_id uuid NOT NULL,organization_id uuid NOT NULL REFERENCES public.organizations(id),scope jsonb NOT NULL CHECK(public.uc_frdo_scope_valid(scope)),
 action_kind text NOT NULL CHECK(action_kind IN('save_supplement','freeze_preview','generate_file','register_packet','record_admin_handover','record_fis_upload','record_receipt','create_correction','appoint_operator','revoke_operator','abandon_correction')),
 payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),phase text NOT NULL CHECK(phase IN('pending','committed')),
 intent_refs jsonb NOT NULL CHECK(jsonb_typeof(intent_refs)='object'AND octet_length(intent_refs::text)<=200000),
 receipt jsonb,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),retained_people uuid[] NOT NULL,
 PRIMARY KEY(actor_id,request_id),CHECK((phase='committed')=(receipt IS NOT NULL))
);
CREATE TABLE public.uc_frdo_operator_authority_revisions(
 id uuid NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),organization_id uuid NOT NULL REFERENCES public.organizations(id),operator_user_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN('active','revoked')),validity jsonb NOT NULL CHECK(jsonb_typeof(validity)='object'),
 evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),source_read jsonb NOT NULL CHECK(jsonb_typeof(source_read)='object'),
 state_hash text NOT NULL CHECK(state_hash~'^[a-f0-9]{64}$'),previous_state_hash text CHECK(previous_state_hash~'^[a-f0-9]{64}$'),
 recorded_by uuid,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),note text CHECK(char_length(note)BETWEEN 1 AND 2000),revocation_event_id uuid,
 external_delegation_verified boolean NOT NULL DEFAULT false CHECK(NOT external_delegation_verified),retained_people uuid[] NOT NULL,
 PRIMARY KEY(id,revision),CHECK((state='revoked')=(revocation_event_id IS NOT NULL))
);
CREATE INDEX uc_frdo_authority_operator ON public.uc_frdo_operator_authority_revisions(organization_id,operator_user_id,id,revision DESC);

-- All writes share the established deletion barrier in sorted UUID order. No
-- per-packet lock ever substitutes for all subjects + creator/operator/evidence actors.
CREATE FUNCTION public.uc_frdo_fence(p_people uuid[],p_lock_key text DEFAULT NULL)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE person uuid;
BEGIN
 FOR person IN SELECT DISTINCT value FROM unnest(coalesce(p_people,'{}'::uuid[]))value WHERE value IS NOT NULL ORDER BY value LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(person::text,42007))THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
  IF EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=person)THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 END LOOP;
 IF p_lock_key IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_frdo:'||p_lock_key,0))THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
END;$fn$;
CREATE FUNCTION public.uc_frdo_write_barrier()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_OP='DELETE'THEN PERFORM public.uc_frdo_error('FRDO_PACKET_RETENTION_REVIEW_REQUIRED');END IF;
 PERFORM public.uc_frdo_fence(NEW.retained_people);
 IF TG_OP='UPDATE'AND TG_TABLE_NAME IN('uc_frdo_supplement_revisions','uc_frdo_packet_events','uc_frdo_operator_authority_revisions')THEN PERFORM public.uc_frdo_error('ILLEGAL_TRANSITION');END IF;
 IF TG_OP='UPDATE'AND TG_TABLE_NAME='uc_frdo_packets'AND(to_jsonb(NEW)-ARRAY['revision','state_hash','state','current_build_id','latest_registry_record_id','latest_admin_handover_event_id','latest_upload_event_id','latest_receipt_event_id','retained_people'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['revision','state_hash','state','current_build_id','latest_registry_record_id','latest_admin_handover_event_id','latest_upload_event_id','latest_receipt_event_id','retained_people'])THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 IF TG_OP='UPDATE'AND TG_TABLE_NAME='uc_frdo_packets'AND NOT(NEW.retained_people@>OLD.retained_people)THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 IF TG_OP='UPDATE'AND TG_TABLE_NAME='uc_frdo_packet_artifact_builds'AND to_jsonb(OLD)->>'phase'='sealed'AND(to_jsonb(NEW)-'registry_record_id')IS DISTINCT FROM(to_jsonb(OLD)-'registry_record_id')THEN PERFORM public.uc_frdo_error('ILLEGAL_TRANSITION');END IF;
 IF TG_OP='UPDATE'AND TG_TABLE_NAME='uc_frdo_packet_requests'AND(to_jsonb(OLD)->>'phase'='committed'OR(to_jsonb(NEW)-ARRAY['phase','receipt'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['phase','receipt']))THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;
 RETURN NEW;
END;$fn$;
CREATE FUNCTION public.uc_frdo_subject_barrier()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE packet public.uc_frdo_packets;
BEGIN
 IF TG_OP<>'INSERT'THEN PERFORM public.uc_frdo_error('ILLEGAL_TRANSITION');END IF;
 SELECT *INTO packet FROM public.uc_frdo_packets WHERE id=NEW.packet_id AND organization_id=NEW.organization_id;
 IF packet.id IS NULL OR packet.redacted THEN PERFORM public.uc_frdo_error('SOURCE_UNAVAILABLE');END IF;
 PERFORM public.uc_frdo_fence(array_append(packet.retained_people,NEW.user_id));RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_frdo_subject_barrier BEFORE INSERT OR UPDATE OR DELETE ON public.uc_frdo_packet_subjects FOR EACH ROW EXECUTE FUNCTION public.uc_frdo_subject_barrier();
DO $closed$
DECLARE table_name text;role_name text;grantee oid;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['uc_frdo_supplement_revisions','uc_frdo_packets','uc_frdo_packet_subjects','uc_frdo_packet_artifact_builds','uc_frdo_packet_events','uc_frdo_packet_requests','uc_frdo_operator_authority_revisions']LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  FOR grantee IN SELECT DISTINCT x.grantee FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x WHERE n.nspname='public'AND c.relname=table_name AND x.grantee<>c.relowner LOOP
   role_name:=CASE WHEN grantee=0 THEN 'PUBLIC'ELSE quote_ident(pg_get_userbyid(grantee))END;
   EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %s',table_name,role_name);
  END LOOP;
  -- PUBLIC must be closed even when it had no previous explicit ACL tuple.
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC',table_name);
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['uc_frdo_supplement_revisions','uc_frdo_packets','uc_frdo_packet_artifact_builds','uc_frdo_packet_events','uc_frdo_packet_requests','uc_frdo_operator_authority_revisions']LOOP
  EXECUTE format('CREATE TRIGGER uc_frdo_person_barrier BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_frdo_write_barrier()',table_name);
 END LOOP;
END;$closed$;





-- Canonical current-actor helpers. Called under the ORIGINAL authenticated request,
-- or the narrowly projected/stored actor inside the fixed service freeze body.
-- They are private and do not accept caller capabilities or a first-subject shortcut.
CREATE FUNCTION public.uc_frdo_record_live(p_org uuid,p_scope jsonb,p_record uuid,p_selected boolean DEFAULT true,p_write boolean DEFAULT false)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE group_id uuid;dto jsonb;ref jsonb;person uuid;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR NOT public.uc_custom_journal_person(auth.uid())OR NOT public.account_deletion_access_allowed()THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 group_id:=public.uc_education_issue_scope(p_org,p_scope);
 PERFORM 1 FROM public.education_document_records r WHERE r.id=p_record AND r.organization_id=p_org FOR SHARE;
 PERFORM 1 FROM public.uc_education_issuance_states s WHERE s.record_id=p_record FOR SHARE;
 dto:=public.uc_education_issue_record(p_org,group_id,p_record);
 IF dto IS NULL OR dto->'capabilities'->'can_read'IS DISTINCT FROM'true'::jsonb OR dto->'capabilities'->'can_export'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF p_write AND NOT public.uc_education_issue_can(p_org,coalesce(group_id,(dto->'official'->>'group_id')::uuid),(dto->'official'->>'enrollment_id')::uuid,(dto->'official'->>'user_id')::uuid,(dto->'official'->>'course_id')::uuid,'write')THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF dto->>'provenance'IS DISTINCT FROM'controlled_issuance'OR dto->'frdo_facts'IS NULL OR dto->'frdo_facts'='null'::jsonb OR dto->>'proof_availability'IS DISTINCT FROM'captured'OR dto->'artifact'->>'availability'IS DISTINCT FROM'available'OR NOT public.uc_custom_journal_uuid(dto->'official'->'user_id')OR NOT public.uc_custom_journal_uuid(dto->'official'->'enrollment_id')OR NOT public.uc_custom_journal_uuid(dto->'official'->'course_id')THEN PERFORM public.uc_frdo_error('SOURCE_UNAVAILABLE');END IF;
 IF p_selected AND(dto->>'lifecycle'IS DISTINCT FROM'active'OR dto->'official'->>'document_status'NOT IN('original','duplicate'))THEN PERFORM public.uc_frdo_error('READINESS_BLOCKED');END IF;
 IF group_id IS NOT NULL AND dto->'official'->'group_id'IS DISTINCT FROM to_jsonb(group_id)THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 person:=(dto->'official'->>'user_id')::uuid;PERFORM public.uc_frdo_fence(ARRAY[auth.uid(),person]);
 ref:=jsonb_build_object('record_id',p_record,'record_revision',(dto->>'revision')::bigint,'record_state_hash',dto->>'state_hash','frozen_facts_sha256',public.uc_frdo_hash(dto->'frdo_facts'),'user_id',person,'enrollment_id',(dto->'official'->>'enrollment_id')::uuid,'course_id',(dto->'official'->>'course_id')::uuid,'group_id',dto->'official'->'group_id');
 RETURN jsonb_build_object('record',dto,'ref',ref);
END;$fn$;

CREATE FUNCTION public.uc_frdo_source_live(p_org uuid,p_sealed jsonb,p_source_read jsonb,p_lock boolean DEFAULT false)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE source jsonb;authorized jsonb;source_version public.org_document_versions;storage_object storage.objects;people uuid[];
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR NOT public.uc_custom_journal_person(auth.uid())THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 IF NOT public.uc_frdo_shape(p_sealed,ARRAY['source','byte_sha256','byte_size'])OR NOT public.uc_frdo_shape(p_source_read,ARRAY['source','byte_sha256','byte_size','object_id','updated_at'])OR p_sealed->'source'IS DISTINCT FROM p_source_read->'source'OR p_sealed->'byte_sha256'IS DISTINCT FROM p_source_read->'byte_sha256'OR p_sealed->'byte_size'IS DISTINCT FROM p_source_read->'byte_size'OR coalesce(p_sealed->>'byte_sha256','')!~'^[a-f0-9]{64}$'OR NOT public.uc_custom_journal_uuid(p_source_read->'object_id')OR jsonb_typeof(p_sealed->'byte_size')IS DISTINCT FROM'number'OR(p_sealed->>'byte_size')::numeric<>trunc((p_sealed->>'byte_size')::numeric)OR(p_sealed->>'byte_size')::numeric NOT BETWEEN 1 AND 20971520 THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 source:=p_sealed->'source';IF NOT public.uc_frdo_shape(source,ARRAY['kind','document_id','version_id','content_hash'])OR source->>'kind'IS DISTINCT FROM'org_document_version'OR NOT public.uc_custom_journal_uuid(source->'document_id')OR NOT public.uc_custom_journal_uuid(source->'version_id')OR coalesce(source->>'content_hash','')!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;authorized:=public.uc_document_registry_source(p_org,source,true,false);
 IF p_lock THEN PERFORM public.uc_education_issue_source_lock(p_org,source);END IF;
 SELECT *INTO source_version FROM public.org_document_versions v WHERE v.id=(source->>'version_id')::uuid AND v.document_id=(source->>'document_id')::uuid AND v.organization_id=p_org;
 SELECT *INTO storage_object FROM storage.objects o WHERE o.id=source_version.storage_object_id;
 IF source_version.id IS NULL OR storage_object.id IS NULL OR storage_object.id IS DISTINCT FROM(p_source_read->>'object_id')::uuid OR storage_object.updated_at IS DISTINCT FROM(p_source_read->>'updated_at')::timestamptz OR source_version.file_size IS DISTINCT FROM(p_sealed->>'byte_size')::bigint OR(storage_object.metadata->>'size')::bigint IS DISTINCT FROM(p_sealed->>'byte_size')::bigint OR NOT public.uc_copy_registry_object_matches(source_version)OR public.uc_copy_registry_original_ref(source_version)IS DISTINCT FROM source THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 SELECT coalesce(array_agg(DISTINCT value::uuid ORDER BY value::uuid),'{}'::uuid[])INTO people FROM jsonb_array_elements_text(authorized->'participants')value;
 PERFORM public.uc_frdo_fence(array_append(people,auth.uid()));
 -- The byteSHA is trusted only because a closed service resolver read/hashed the
 -- actual object before this call. Object identity+updated_at bind that attestation;
 -- caller metadata/content_hash can never stand in for the byte hash.
 RETURN jsonb_build_object('sealed',p_sealed,'source_read',p_source_read,'people',to_jsonb(people));
END;$fn$;


CREATE FUNCTION public.uc_frdo_template(p_stream text)RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF p_stream='dpo'THEN RETURN '{"template_id":"dpo20230116","byte_sha256":"882c9f65af250372e177288d16c85c960814e2276c933e3908d6e3bfd510c1b1","mapping_revision":"uc020-v2","dictionary_sha256":"3d6be1c5ce05b93626e448ba4ab6094d4d603a9a28f8139919ae38daf598436e","column_count":40}'::jsonb;
 ELSIF p_stream='po'THEN RETURN '{"template_id":"po16102026","byte_sha256":"4d528f83573d0ada6ff421cdb0b9d77eb42134d33eb3ef08c60ec95c66a08439","mapping_revision":"uc020-v2","dictionary_sha256":"dee5aa87cbd1922b6a993e15bc5d135477514297cc6eb776e05d13612b2c7f42","column_count":35}'::jsonb;
 ELSE PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
END;$fn$;
CREATE FUNCTION public.uc_frdo_source_set_add(p_sources jsonb,p_sealed jsonb)RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE previous jsonb;matches integer;
BEGIN
 IF jsonb_typeof(p_sources)IS DISTINCT FROM'array'OR NOT public.uc_frdo_shape(p_sealed,ARRAY['source','byte_sha256','byte_size'])THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 SELECT count(*),jsonb_agg(value)->0 INTO matches,previous FROM jsonb_array_elements(p_sources)WHERE value->'source'=p_sealed->'source';
 IF matches>1 OR(matches=1 AND previous IS DISTINCT FROM p_sealed)THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 IF matches=0 THEN p_sources:=p_sources||jsonb_build_array(p_sealed);END IF;
 RETURN(SELECT jsonb_agg(value ORDER BY public.uc_frdo_canonical(value->'source')COLLATE "C")FROM jsonb_array_elements(p_sources));
END;$fn$;
CREATE FUNCTION public.uc_frdo_supplement_current(p_org uuid,p_record uuid)RETURNS public.uc_frdo_supplement_revisions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE result public.uc_frdo_supplement_revisions;actual text;
BEGIN
 SELECT *INTO result FROM public.uc_frdo_supplement_revisions s WHERE s.organization_id=p_org AND s.record_id=p_record ORDER BY revision DESC LIMIT 1;
 IF result.id IS NULL OR result.redacted THEN PERFORM public.uc_frdo_error('READINESS_BLOCKED');END IF;
 actual:=public.uc_frdo_hash(jsonb_build_object('schema_version',1,'organization_id',result.organization_id,'record_id',result.record_id,'user_id',result.user_id,'frozen_facts_sha256',result.frozen_facts_sha256,'revision',result.revision,'fields',result.fields,'evidence',result.evidence));
 IF actual IS DISTINCT FROM result.snapshot_sha256 THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 RETURN result;
END;$fn$;
CREATE FUNCTION public.uc_frdo_supplement_ref(p_value public.uc_frdo_supplement_revisions)RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('id',p_value.id,'revision',p_value.revision,'snapshot_sha256',p_value.snapshot_sha256,'frozen_facts_sha256',p_value.frozen_facts_sha256)$fn$;

-- This derives EVERY required reference/proof from canonical current records and
-- latest reviewed supplements. Client capture.source_cas.sources is only compared
-- after derivation, never treated as a complete authority list itself.
CREATE FUNCTION public.uc_frdo_capture_cas(p_org uuid,p_scope jsonb,p_capture jsonb,p_source_reads jsonb,p_issuer_intent jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE cas jsonb;expected_sources jsonb:='[]';people uuid[]:=ARRAY[auth.uid()];seen uuid[]:='{}';entry jsonb;bound jsonb;original_bound jsonb;supp public.uc_frdo_supplement_revisions;original_supp public.uc_frdo_supplement_revisions;required jsonb;source_read jsonb;resolved jsonb;matches integer;person uuid;manifest jsonb;issuer jsonb;
BEGIN
 IF NOT public.uc_frdo_shape(p_capture,ARRAY['schema_version','abi_revision','mapped_batch','source_cas','snapshot_sha256'])OR p_capture->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v4'OR p_capture->'schema_version'IS DISTINCT FROM'1'::jsonb OR public.uc_frdo_hash(p_capture-'snapshot_sha256')IS DISTINCT FROM p_capture->>'snapshot_sha256'OR octet_length(p_capture::text)>8000000 THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 cas:=p_capture->'source_cas';
 IF NOT public.uc_frdo_shape(cas,ARRAY['organization_id','scope','template','records','sources'])OR cas->'organization_id'IS DISTINCT FROM to_jsonb(p_org)OR cas->'scope'IS DISTINCT FROM p_scope OR jsonb_typeof(cas->'records')IS DISTINCT FROM'array'OR jsonb_array_length(cas->'records')NOT BETWEEN 1 AND 1000 OR jsonb_typeof(cas->'sources')IS DISTINCT FROM'array'OR jsonb_typeof(p_source_reads)IS DISTINCT FROM'array'OR jsonb_array_length(p_source_reads)NOT BETWEEN 1 AND 62000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 IF NOT public.uc_frdo_shape(p_issuer_intent,ARRAY['regime','evidence','review_note'])OR p_issuer_intent->>'regime'IS DISTINCT FROM'ordinary_rf'OR jsonb_typeof(p_issuer_intent->'review_note')IS DISTINCT FROM'string'OR char_length(btrim(p_issuer_intent->>'review_note'))NOT BETWEEN 1 AND 2000 THEN PERFORM public.uc_frdo_error('READINESS_BLOCKED');END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(cas->'records')ORDER BY value->'record'->>'record_id'LOOP
  IF NOT public.uc_frdo_shape(entry,ARRAY['record','original_record','supplement','original_supplement'])OR NOT public.uc_custom_journal_uuid(entry->'record'->'record_id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  IF(entry->'record'->>'record_id')::uuid=ANY(seen)THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;seen:=array_append(seen,(entry->'record'->>'record_id')::uuid);
  bound:=public.uc_frdo_record_live(p_org,p_scope,(entry->'record'->>'record_id')::uuid,true,true);IF bound->'ref'IS DISTINCT FROM entry->'record'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
  supp:=public.uc_frdo_supplement_current(p_org,(entry->'record'->>'record_id')::uuid);
  IF public.uc_frdo_supplement_ref(supp)IS DISTINCT FROM entry->'supplement'OR supp.user_id IS DISTINCT FROM(bound->'ref'->>'user_id')::uuid OR supp.frozen_facts_sha256 IS DISTINCT FROM bound->'ref'->>'frozen_facts_sha256'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
  people:=people||supp.retained_people||ARRAY[(bound->'ref'->>'user_id')::uuid];
  required:=bound->'record'->'artifact'->'artifact';expected_sources:=public.uc_frdo_source_set_add(expected_sources,jsonb_build_object('source',required->'source','byte_sha256',required->'byte_sha256','byte_size',required->'byte_size'));
  FOR required IN SELECT value FROM jsonb_array_elements(supp.evidence)LOOP expected_sources:=public.uc_frdo_source_set_add(expected_sources,required);END LOOP;
  IF supp.fields->'snils_exception'->>'kind'='external_support_approval'THEN expected_sources:=public.uc_frdo_source_set_add(expected_sources,supp.fields->'snils_exception'->'not_assigned_confirmation');expected_sources:=public.uc_frdo_source_set_add(expected_sources,supp.fields->'snils_exception'->'approval_evidence');END IF;
  IF bound->'record'->>'original_record_id'IS NOT NULL THEN
   IF entry->'original_record'->>'record_id'IS DISTINCT FROM bound->'record'->>'original_record_id'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
   original_bound:=public.uc_frdo_record_live(p_org,p_scope,(bound->'record'->>'original_record_id')::uuid,false,true);
   IF original_bound->'ref'IS DISTINCT FROM entry->'original_record'OR original_bound->'ref'->'user_id'IS DISTINCT FROM bound->'ref'->'user_id'OR original_bound->'ref'->'enrollment_id'IS DISTINCT FROM bound->'ref'->'enrollment_id'OR original_bound->'ref'->'course_id'IS DISTINCT FROM bound->'ref'->'course_id'OR original_bound->'ref'->'group_id'IS DISTINCT FROM bound->'ref'->'group_id'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
   original_supp:=public.uc_frdo_supplement_current(p_org,(original_bound->'ref'->>'record_id')::uuid);
   IF public.uc_frdo_supplement_ref(original_supp)IS DISTINCT FROM entry->'original_supplement'OR original_supp.user_id IS DISTINCT FROM(original_bound->'ref'->>'user_id')::uuid OR original_supp.frozen_facts_sha256 IS DISTINCT FROM original_bound->'ref'->>'frozen_facts_sha256'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
   people:=people||original_supp.retained_people;
   required:=original_bound->'record'->'artifact'->'artifact';expected_sources:=public.uc_frdo_source_set_add(expected_sources,jsonb_build_object('source',required->'source','byte_sha256',required->'byte_sha256','byte_size',required->'byte_size'));
   FOR required IN SELECT value FROM jsonb_array_elements(original_supp.evidence)LOOP expected_sources:=public.uc_frdo_source_set_add(expected_sources,required);END LOOP;
   IF original_supp.fields->'snils_exception'->>'kind'='external_support_approval'THEN expected_sources:=public.uc_frdo_source_set_add(expected_sources,original_supp.fields->'snils_exception'->'not_assigned_confirmation');expected_sources:=public.uc_frdo_source_set_add(expected_sources,original_supp.fields->'snils_exception'->'approval_evidence');END IF;
  ELSIF entry->'original_record'IS DISTINCT FROM'null'::jsonb OR entry->'original_supplement'IS DISTINCT FROM'null'::jsonb THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 END LOOP;
 -- An issuer source is explicit even when it coincides with an already required
 -- sealed source. A different byte proof for that same version is rejected.
 SELECT count(*),jsonb_agg(value)->0 INTO matches,issuer FROM jsonb_array_elements(p_source_reads)WHERE value->'source'=p_issuer_intent->'evidence';
 IF matches<>1 THEN PERFORM public.uc_frdo_error('SOURCE_UNAVAILABLE');END IF;
 expected_sources:=public.uc_frdo_source_set_add(expected_sources,jsonb_build_object('source',issuer->'source','byte_sha256',issuer->'byte_sha256','byte_size',issuer->'byte_size'));
 IF cas->'sources'IS DISTINCT FROM expected_sources OR jsonb_array_length(p_source_reads)<>jsonb_array_length(expected_sources)THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 FOR required IN SELECT value FROM jsonb_array_elements(expected_sources)LOOP
  SELECT count(*),jsonb_agg(value)->0 INTO matches,source_read FROM jsonb_array_elements(p_source_reads)WHERE value->'source'=required->'source';
  IF matches<>1 THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
  resolved:=public.uc_frdo_source_live(p_org,required,source_read,true);
  FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(resolved->'people')value LOOP people:=array_append(people,person);END LOOP;
 END LOOP;
 -- Merge selected/original purposes by ACTUAL record id, never only by user id.
 SELECT jsonb_agg(jsonb_build_object('record_id',record_id,'user_id',ref->'user_id','enrollment_id',ref->'enrollment_id','course_id',ref->'course_id','group_id',ref->'group_id','selected',selected,'original',original)ORDER BY record_id)INTO manifest FROM(
  SELECT record_id,(jsonb_agg(ref)->0)ref,bool_or(purpose='selected')selected,bool_or(purpose='original')original FROM(
   SELECT value->'record'->>'record_id'record_id,value->'record'ref,'selected'purpose FROM jsonb_array_elements(cas->'records')
   UNION ALL SELECT value->'original_record'->>'record_id',value->'original_record','original'FROM jsonb_array_elements(cas->'records')WHERE value->'original_record'IS DISTINCT FROM'null'::jsonb
  )refs GROUP BY record_id HAVING count(DISTINCT ref)=1
 )subjects;
 IF manifest IS NULL OR jsonb_array_length(manifest)<>(SELECT count(DISTINCT value)FROM(SELECT value->'record'->>'record_id'value FROM jsonb_array_elements(cas->'records')UNION ALL SELECT value->'original_record'->>'record_id'FROM jsonb_array_elements(cas->'records')WHERE value->'original_record'IS DISTINCT FROM'null'::jsonb)x)THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 SELECT array_agg(DISTINCT value ORDER BY value)INTO people FROM unnest(people)value;PERFORM public.uc_frdo_fence(people);
 RETURN jsonb_build_object('source_cas',cas,'manifest',manifest,'people',to_jsonb(people));
END;$fn$;


CREATE FUNCTION public.uc_frdo_mapped_integrity(p_capture jsonb,p_org uuid,p_scope jsonb)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE batch jsonb;mapping_context jsonb;mapped_row jsonb;cas jsonb;row_index integer:=0;cell_value jsonb;row_id text;previous_id text;expected_key text;columns integer;
BEGIN
 batch:=p_capture->'mapped_batch';mapping_context:=batch->'context';cas:=p_capture->'source_cas';
 IF NOT public.uc_frdo_shape(batch,ARRAY['context','rows','blocked_records','ready','root_sha256','signing','legal_policy_verification'])OR NOT public.uc_frdo_shape(mapping_context,ARRAY['schema_version','organization_id','actor_id','scope','as_of_date','stream','template','issuer_regime'])OR mapping_context->'schema_version'IS DISTINCT FROM'1'::jsonb OR mapping_context->'organization_id'IS DISTINCT FROM to_jsonb(p_org)OR mapping_context->'actor_id'IS DISTINCT FROM to_jsonb(auth.uid())OR mapping_context->'scope'IS DISTINCT FROM p_scope OR mapping_context->>'as_of_date'IS DISTINCT FROM to_char(CURRENT_DATE,'YYYY-MM-DD')OR mapping_context->>'issuer_regime'IS DISTINCT FROM'ordinary_rf'OR mapping_context->'template'IS DISTINCT FROM public.uc_frdo_template(mapping_context->>'stream')OR cas->'template'IS DISTINCT FROM mapping_context->'template'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 IF batch->'ready'IS DISTINCT FROM'true'::jsonb OR batch->'blocked_records'IS DISTINCT FROM'[]'::jsonb OR batch->'signing'IS DISTINCT FROM'{"status":"not_verified"}'::jsonb OR batch->>'legal_policy_verification'IS DISTINCT FROM'pending_primary_current_law'OR jsonb_typeof(batch->'rows')IS DISTINCT FROM'array'OR jsonb_array_length(batch->'rows')NOT BETWEEN 1 AND 1000 OR jsonb_array_length(batch->'rows')IS DISTINCT FROM jsonb_array_length(cas->'records')OR public.uc_frdo_hash(batch-'root_sha256')IS DISTINCT FROM batch->>'root_sha256'THEN PERFORM public.uc_frdo_error('READINESS_BLOCKED');END IF;
 columns:=CASE mapping_context->>'stream'WHEN'dpo'THEN 40 WHEN'po'THEN 35 ELSE NULL END;IF columns IS NULL THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 FOR mapped_row IN SELECT value FROM jsonb_array_elements(batch->'rows')LOOP
  IF NOT public.uc_frdo_shape(mapped_row,ARRAY['row_key','record','original_record','supplement','original_supplement','stream','cells','row_sha256','issues','ready'])OR mapped_row->'record'IS DISTINCT FROM cas->'records'->row_index->'record'OR mapped_row->'original_record'IS DISTINCT FROM cas->'records'->row_index->'original_record'OR mapped_row->'supplement'IS DISTINCT FROM cas->'records'->row_index->'supplement'OR mapped_row->'original_supplement'IS DISTINCT FROM cas->'records'->row_index->'original_supplement'OR mapped_row->'stream'IS DISTINCT FROM mapping_context->'stream'OR mapped_row->'ready'IS DISTINCT FROM'true'::jsonb OR jsonb_typeof(mapped_row->'cells')IS DISTINCT FROM'array'OR jsonb_array_length(mapped_row->'cells')<>columns OR mapped_row->'cells'->(columns-1)IS DISTINCT FROM'null'::jsonb OR jsonb_typeof(mapped_row->'issues')IS DISTINCT FROM'array'OR jsonb_array_length(mapped_row->'issues')>80 OR EXISTS(SELECT 1 FROM jsonb_array_elements(mapped_row->'issues')issue WHERE issue->>'severity'='blocker')OR public.uc_frdo_hash(mapped_row-'row_sha256')IS DISTINCT FROM mapped_row->>'row_sha256'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
  row_id:=mapped_row->'record'->>'record_id';IF previous_id IS NOT NULL AND previous_id COLLATE "C">=row_id COLLATE "C"THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;previous_id:=row_id;
  expected_key:=public.uc_frdo_hash(jsonb_build_object('organization_id',p_org,'scope',p_scope,'stream',mapping_context->'stream','record_id',mapped_row->'record'->'record_id'));IF mapped_row->>'row_key'IS DISTINCT FROM expected_key THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
  FOR cell_value IN SELECT value FROM jsonb_array_elements(mapped_row->'cells')LOOP
   IF jsonb_typeof(cell_value)NOT IN('null','string','number')OR(jsonb_typeof(cell_value)='string'AND octet_length(cell_value#>>'{}')>32000)OR(jsonb_typeof(cell_value)='number'AND((cell_value#>>'{}')::numeric<>trunc((cell_value#>>'{}')::numeric)OR(cell_value#>>'{}')::numeric NOT BETWEEN 0 AND 9007199254740991))THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  END LOOP;
  row_index:=row_index+1;
 END LOOP;
END;$fn$;

-- Current ALL-subject authorization for stored history. State/source freshness is
-- checked separately for NEW generation/submission; no history rewrite or paid
-- lesson/content-access join is introduced here.
CREATE FUNCTION public.uc_frdo_packet_access(p_packet uuid,p_write boolean DEFAULT false)RETURNS public.uc_frdo_packets
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE packet public.uc_frdo_packets;subject public.uc_frdo_packet_subjects;count_subjects integer:=0;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR NOT public.uc_custom_journal_person(auth.uid())OR NOT public.account_deletion_access_allowed()THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 SELECT *INTO packet FROM public.uc_frdo_packets WHERE id=p_packet AND NOT redacted;
 IF packet.id IS NULL OR NOT public.uc_document_has_action(packet.organization_id,CASE WHEN p_write THEN'write'ELSE'read'END)THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_education_issue_scope(packet.organization_id,packet.scope);PERFORM public.uc_frdo_fence(array_append(packet.retained_people,auth.uid()));
 FOR subject IN SELECT *FROM public.uc_frdo_packet_subjects WHERE packet_id=packet.id ORDER BY record_id LOOP
  count_subjects:=count_subjects+1;
  IF subject.organization_id IS DISTINCT FROM packet.organization_id OR NOT EXISTS(SELECT 1 FROM public.education_document_records r WHERE r.id=subject.record_id AND r.organization_id=subject.organization_id AND r.user_id=subject.user_id AND r.enrollment_id=subject.enrollment_id AND r.course_id=subject.course_id AND r.group_id IS NOT DISTINCT FROM subject.group_id)OR NOT public.uc_education_issue_can(subject.organization_id,coalesce(packet.group_id,subject.group_id),subject.enrollment_id,subject.user_id,subject.course_id,CASE WHEN p_write THEN'write'ELSE'read'END)THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 END LOOP;
 IF count_subjects<1 THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 RETURN packet;
END;$fn$;


-- The original JWT creates a minimal pending binding before any service freeze.
-- No full command, pupil name, SNILS, HTML or mutable profile data is persisted.
CREATE FUNCTION public.uc_frdo_begin_freeze(p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE actor uuid:=auth.uid();org uuid;scope jsonb;v_request_id uuid;action jsonb;selection jsonb;issuer jsonb;payload_hash text;people uuid[]:=ARRAY[auth.uid()];ids uuid[]:='{}';record_id uuid;bound jsonb;original_bound jsonb;source_proof jsonb;supp public.uc_frdo_supplement_revisions;original_supp public.uc_frdo_supplement_revisions;item jsonb;person uuid;pending public.uc_frdo_packet_requests;packet_id uuid;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR actor IS NULL OR NOT public.uc_custom_journal_person(actor)OR NOT public.account_deletion_access_allowed()THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 IF NOT public.uc_frdo_shape(p_command,ARRAY['schema_version','abi_revision','organization_id','scope','request_id','action'])OR p_command->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_command->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_command->'organization_id')OR NOT public.uc_custom_journal_uuid(p_command->'request_id')OR octet_length(p_command::text)>8000000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 org:=(p_command->>'organization_id')::uuid;scope:=p_command->'scope';v_request_id:=(p_command->>'request_id')::uuid;action:=p_command->'action';selection:=action->'selection';issuer:=action->'issuer_review';PERFORM public.uc_education_issue_scope(org,scope);
 IF NOT public.uc_document_has_action(org,'write')OR NOT public.uc_document_has_action(org,'read')THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_frdo_shape(action,ARRAY['kind','selection','expected_preview_hash','issuer_review'])OR action->>'kind'IS DISTINCT FROM'freeze_preview'OR coalesce(action->>'expected_preview_hash','')!~'^[a-f0-9]{64}$'OR NOT public.uc_frdo_shape(selection,ARRAY['stream','record_ids','template'])OR selection->'template'IS DISTINCT FROM public.uc_frdo_template(selection->>'stream')OR jsonb_typeof(selection->'record_ids')IS DISTINCT FROM'array'OR jsonb_array_length(selection->'record_ids')NOT BETWEEN 1 AND 1000 OR NOT public.uc_frdo_shape(issuer,ARRAY['regime','evidence','review_note'])OR issuer->>'regime'IS DISTINCT FROM'ordinary_rf'OR jsonb_typeof(issuer->'review_note')IS DISTINCT FROM'string'OR char_length(btrim(issuer->>'review_note'))NOT BETWEEN 1 AND 2000 THEN PERFORM public.uc_frdo_error('READINESS_BLOCKED');END IF;
 payload_hash:=public.uc_frdo_hash(p_command);PERFORM public.uc_frdo_fence(people,'request:'||actor::text||':'||v_request_id::text);
 SELECT *INTO pending FROM public.uc_frdo_packet_requests r WHERE r.actor_id=actor AND r.request_id=v_request_id FOR UPDATE;
 IF pending.request_id IS NOT NULL THEN
  IF pending.organization_id IS DISTINCT FROM org OR pending.scope IS DISTINCT FROM scope OR pending.action_kind<>'freeze_preview'OR pending.payload_sha256 IS DISTINCT FROM payload_hash THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;
  PERFORM public.uc_frdo_fence(pending.retained_people);
  IF pending.phase='committed'THEN
   FOR packet_id IN SELECT value::uuid FROM jsonb_array_elements_text(pending.receipt->'packet_ids')value LOOP PERFORM public.uc_frdo_packet_access(packet_id,false);END LOOP;
   RETURN jsonb_build_object('phase','committed','actor_id',actor,'request_id',v_request_id,'payload_sha256',payload_hash,'receipt',pending.receipt);
  END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(selection->'record_ids')ORDER BY value#>>'{}'LOOP
  IF NOT public.uc_custom_journal_uuid(item)OR(item#>>'{}')::uuid=ANY(ids)THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;record_id:=(item#>>'{}')::uuid;ids:=array_append(ids,record_id);
  bound:=public.uc_frdo_record_live(org,scope,record_id,true,true);people:=array_append(people,(bound->'ref'->>'user_id')::uuid);supp:=public.uc_frdo_supplement_current(org,record_id);people:=people||supp.retained_people;
  source_proof:=public.uc_document_registry_source(org,bound->'record'->'artifact'->'artifact'->'source',true,false);FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(source_proof->'participants')value LOOP people:=array_append(people,person);END LOOP;
  IF bound->'record'->>'original_record_id'IS NOT NULL THEN original_bound:=public.uc_frdo_record_live(org,scope,(bound->'record'->>'original_record_id')::uuid,false,true);people:=array_append(people,(original_bound->'ref'->>'user_id')::uuid);original_supp:=public.uc_frdo_supplement_current(org,(bound->'record'->>'original_record_id')::uuid);people:=people||original_supp.retained_people;source_proof:=public.uc_document_registry_source(org,original_bound->'record'->'artifact'->'artifact'->'source',true,false);FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(source_proof->'participants')value LOOP people:=array_append(people,person);END LOOP;END IF;
 END LOOP;
 source_proof:=public.uc_document_registry_source(org,issuer->'evidence',true,false);FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(source_proof->'participants')value LOOP people:=array_append(people,person);END LOOP;
 SELECT array_agg(DISTINCT value ORDER BY value)INTO people FROM unnest(people)value;PERFORM public.uc_frdo_fence(people);
 IF pending.request_id IS NULL THEN
  INSERT INTO public.uc_frdo_packet_requests(actor_id,request_id,organization_id,scope,action_kind,payload_sha256,phase,intent_refs,retained_people)VALUES(actor,v_request_id,org,scope,'freeze_preview',payload_hash,'pending',jsonb_build_object('record_ids',to_jsonb(ids),'issuer_evidence',issuer->'evidence','expected_preview_hash',action->'expected_preview_hash'),people);
 ELSIF pending.retained_people IS DISTINCT FROM people OR pending.intent_refs IS DISTINCT FROM jsonb_build_object('record_ids',to_jsonb(ids),'issuer_evidence',issuer->'evidence','expected_preview_hash',action->'expected_preview_hash')THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('phase','pending','actor_id',actor,'request_id',v_request_id,'payload_sha256',payload_hash);
END;$fn$;


-- Fixed service freeze only: no generic impersonation callback, claims setter,
-- dynamic SQL or configurable role. The actor is bound to a pending command that
-- was created under the original user JWT. The Edge MUST independently getUser on
-- that ORIGINAL JWT and compare it with verified_actor_id before using this entry.
CREATE FUNCTION public.uc_frdo_commit_freeze(p_value jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE prior_claims text;prior_sub text;prior_role text;claims jsonb;role_changed boolean:=false;actor uuid;org uuid;scope jsonb;command jsonb;action jsonb;capture jsonb;source_reads jsonb;pending public.uc_frdo_packet_requests;resolved jsonb;preview_hash text;selected_ids jsonb;issuer_proof jsonb;issuer_projection jsonb;manifest_entry jsonb;people uuid[];new_packet uuid;new_event uuid;recorded timestamptz;payload jsonb;payload_hash text;state_hash text;result_receipt jsonb;result jsonb;begin_result jsonb;
BEGIN
 -- A projected call cannot nest: its role is authenticated and uid is non-NULL.
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 prior_claims:=current_setting('request.jwt.claims',true);prior_sub:=current_setting('request.jwt.claim.sub',true);prior_role:=current_setting('request.jwt.claim.role',true);
 IF prior_claims IS NULL OR prior_claims=''OR coalesce(prior_sub,'')<>''OR(prior_role IS NOT NULL AND prior_role NOT IN('','service_role'))THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 BEGIN claims:=prior_claims::jsonb;EXCEPTION WHEN OTHERS THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END;
 IF jsonb_typeof(claims)IS DISTINCT FROM'object'OR claims->>'role'IS DISTINCT FROM'service_role'THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_frdo_shape(p_value,ARRAY['schema_version','abi_revision','organization_id','scope','verified_actor_id','request_id','command_payload_sha256','expected_preview_hash','capture','correction','command','source_reads'])OR p_value->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_value->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_value->'verified_actor_id')OR NOT public.uc_custom_journal_uuid(p_value->'organization_id')OR NOT public.uc_custom_journal_uuid(p_value->'request_id')OR p_value->'correction'IS DISTINCT FROM'null'::jsonb OR octet_length(p_value::text)>8000000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 actor:=(p_value->>'verified_actor_id')::uuid;org:=(p_value->>'organization_id')::uuid;scope:=p_value->'scope';command:=p_value->'command';action:=command->'action';capture:=p_value->'capture';source_reads:=p_value->'source_reads';
 IF NOT public.uc_custom_journal_person(actor)OR command->'organization_id'IS DISTINCT FROM p_value->'organization_id'OR command->'scope'IS DISTINCT FROM scope OR command->'request_id'IS DISTINCT FROM p_value->'request_id'OR command->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR action->>'kind'IS DISTINCT FROM'freeze_preview'OR action->'expected_preview_hash'IS DISTINCT FROM p_value->'expected_preview_hash'OR public.uc_frdo_hash(command)IS DISTINCT FROM p_value->>'command_payload_sha256'THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;
 PERFORM public.uc_frdo_fence(ARRAY[actor],'request:'||actor::text||':'||(p_value->>'request_id'));
 SELECT *INTO pending FROM public.uc_frdo_packet_requests r WHERE r.actor_id=actor AND r.request_id=(p_value->>'request_id')::uuid FOR UPDATE;
 IF pending.request_id IS NULL OR pending.organization_id IS DISTINCT FROM org OR pending.scope IS DISTINCT FROM scope OR pending.action_kind<>'freeze_preview'OR pending.payload_sha256 IS DISTINCT FROM p_value->>'command_payload_sha256'THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 -- No new custom nesting GUC and no change to absent/empty legacy sub. Require a
 -- present claims object so exact prior raw settings can be restored, not NULL→''.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 IF prior_role IS NOT NULL AND prior_role<>''THEN PERFORM set_config('request.jwt.claim.role','authenticated',true);role_changed:=true;END IF;
 BEGIN
  IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS DISTINCT FROM actor THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
  begin_result:=public.uc_frdo_begin_freeze(command);
  IF begin_result->>'phase'='committed'THEN
   result:=jsonb_build_object('schema_version',1,'abi_revision','uc020-persisted-v5','phase','committed','replayed',true,'actor_id',actor,'organization_id',org,'scope',scope,'receipt',begin_result->'receipt');
  ELSE
   PERFORM public.uc_frdo_mapped_integrity(capture,org,scope);
   SELECT jsonb_agg(value ORDER BY value#>>'{}')INTO selected_ids FROM jsonb_array_elements(action->'selection'->'record_ids');
   IF selected_ids IS DISTINCT FROM(SELECT jsonb_agg(value->'record'->'record_id'ORDER BY value->'record'->>'record_id')FROM jsonb_array_elements(capture->'source_cas'->'records'))OR action->'selection'->'template'IS DISTINCT FROM capture->'mapped_batch'->'context'->'template'OR action->'selection'->'stream'IS DISTINCT FROM capture->'mapped_batch'->'context'->'stream'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
   preview_hash:=public.uc_frdo_hash(jsonb_build_object('schema_version',1,'abi_revision','uc020-persisted-v5','organization_id',org,'scope',scope,'actor_id',actor,'snapshot_sha256',capture->'snapshot_sha256','issuer_review',action->'issuer_review','correction',NULL));
   IF preview_hash IS DISTINCT FROM p_value->>'expected_preview_hash'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
   resolved:=public.uc_frdo_capture_cas(org,scope,capture,source_reads,action->'issuer_review');
   SELECT array_agg(value::uuid ORDER BY value::uuid)INTO people FROM jsonb_array_elements_text(resolved->'people')value;
   IF people IS DISTINCT FROM pending.retained_people THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
   recorded:=clock_timestamp();new_packet:=gen_random_uuid();new_event:=gen_random_uuid();
   SELECT value INTO issuer_proof FROM jsonb_array_elements(capture->'source_cas'->'sources')WHERE value->'source'=action->'issuer_review'->'evidence';
   issuer_projection:=jsonb_build_object('fact_kind','operator_recorded_issuer_regime','regime','ordinary_rf','evidence',jsonb_build_object('availability','available','evidence',issuer_proof),'review_note',action->'issuer_review'->'review_note','recorded_by',actor,'recorded_at',recorded,'legal_policy_verified',false,'external_origin_verified',false);
   payload:=jsonb_build_object('snapshot_sha256',capture->'snapshot_sha256');payload_hash:=public.uc_frdo_hash(payload);
   state_hash:=public.uc_frdo_hash(jsonb_build_object('packet_id',new_packet,'revision',1,'previous_state_hash',NULL,'kind','preview_frozen','payload_sha256',payload_hash,'snapshot_sha256',capture->'snapshot_sha256','issuer_review',issuer_projection));
   INSERT INTO public.uc_frdo_packets(id,organization_id,scope,group_id,stream,revision,state_hash,state,capture,snapshot_sha256,source_reads,issuer_review,created_at,created_by,retained_people)VALUES(new_packet,org,scope,CASE WHEN scope->>'kind'='group'THEN(scope->>'group_id')::uuid ELSE NULL END,capture->'mapped_batch'->'context'->>'stream',1,state_hash,'preview_frozen',capture,capture->>'snapshot_sha256',source_reads,issuer_projection,recorded,actor,people);
   FOR manifest_entry IN SELECT value FROM jsonb_array_elements(resolved->'manifest')LOOP
    INSERT INTO public.uc_frdo_packet_subjects(packet_id,record_id,organization_id,group_id,user_id,enrollment_id,course_id,selected,original)VALUES(new_packet,(manifest_entry->>'record_id')::uuid,org,(manifest_entry->>'group_id')::uuid,(manifest_entry->>'user_id')::uuid,(manifest_entry->>'enrollment_id')::uuid,(manifest_entry->>'course_id')::uuid,(manifest_entry->>'selected')::boolean,(manifest_entry->>'original')::boolean);
   END LOOP;
   INSERT INTO public.uc_frdo_packet_events(id,organization_id,packet_id,revision,kind,actor_id,recorded_at,previous_state_hash,state_hash,payload_sha256,payload,retained_people)VALUES(new_event,org,new_packet,1,'preview_frozen',actor,recorded,NULL,state_hash,payload_hash,payload,people);
   result_receipt:=jsonb_build_object('request_id',pending.request_id,'action_kind','freeze_preview','packet_ids',jsonb_build_array(new_packet),'supplement_ids','[]'::jsonb,'authority_ids','[]'::jsonb,'event_ids',jsonb_build_array(new_event),'payload_sha256',pending.payload_sha256,'recorded_at',recorded);
   UPDATE public.uc_frdo_packet_requests r SET phase='committed',receipt=result_receipt WHERE r.actor_id=actor AND r.request_id=pending.request_id;
   result:=jsonb_build_object('schema_version',1,'abi_revision','uc020-persisted-v5','phase','committed','replayed',false,'actor_id',actor,'organization_id',org,'scope',scope,'receipt',result_receipt);
  END IF;
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims',prior_claims,true);IF role_changed THEN PERFORM set_config('request.jwt.claim.role',prior_role,true);END IF;
  IF current_setting('request.jwt.claims',true)IS DISTINCT FROM prior_claims OR current_setting('request.jwt.claim.sub',true)IS DISTINCT FROM prior_sub OR current_setting('request.jwt.claim.role',true)IS DISTINCT FROM prior_role THEN RAISE EXCEPTION 'FRDO_PACKET_CLAIM_RESTORATION_FAILED';END IF;
  RAISE;
 END;
 PERFORM set_config('request.jwt.claims',prior_claims,true);IF role_changed THEN PERFORM set_config('request.jwt.claim.role',prior_role,true);END IF;
 IF current_setting('request.jwt.claims',true)IS DISTINCT FROM prior_claims OR current_setting('request.jwt.claim.sub',true)IS DISTINCT FROM prior_sub OR current_setting('request.jwt.claim.role',true)IS DISTINCT FROM prior_role THEN RAISE EXCEPTION 'FRDO_PACKET_CLAIM_RESTORATION_FAILED';END IF;
 RETURN result;
END;$fn$;



-- ASSEMBLED FRAGMENT 10_supplement_custody.sql
-- UC020 S3 source fragment; assembled inside the reviewed transaction. No grants.
-- Original-JWT readers return exact private source descriptors, never signed URLs
-- or a promise that metadata/content_hash proves file bytes.
CREATE FUNCTION public.uc_frdo_record_history_access(p_org uuid,p_scope jsonb,p_record uuid,p_write boolean DEFAULT false)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE group_id uuid;dto jsonb;
BEGIN
 group_id:=public.uc_education_issue_scope(p_org,p_scope);dto:=public.uc_education_issue_record(p_org,group_id,p_record);
 IF dto IS NULL OR dto->'capabilities'->'can_read'IS DISTINCT FROM'true'::jsonb OR NOT public.uc_custom_journal_uuid(dto->'official'->'user_id')OR NOT public.uc_education_issue_can(p_org,coalesce(group_id,(dto->'official'->>'group_id')::uuid),(dto->'official'->>'enrollment_id')::uuid,(dto->'official'->>'user_id')::uuid,(dto->'official'->>'course_id')::uuid,CASE WHEN p_write THEN'write'ELSE'read'END)THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_frdo_fence(ARRAY[auth.uid(),(dto->'official'->>'user_id')::uuid]);
END;$fn$;

CREATE FUNCTION public.uc_frdo_source_descriptor(p_org uuid,p_ref jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE v public.org_document_versions;o storage.objects;proof jsonb;
BEGIN
 IF NOT public.uc_frdo_shape(p_ref,ARRAY['kind','document_id','version_id','content_hash'])OR p_ref->>'kind'IS DISTINCT FROM'org_document_version'OR NOT public.uc_custom_journal_uuid(p_ref->'document_id')OR NOT public.uc_custom_journal_uuid(p_ref->'version_id')OR coalesce(p_ref->>'content_hash','')!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 proof:=public.uc_document_registry_source(p_org,p_ref,true,false);
 SELECT * INTO v FROM public.org_document_versions WHERE organization_id=p_org AND document_id=(p_ref->>'document_id')::uuid AND id=(p_ref->>'version_id')::uuid;
 SELECT * INTO o FROM storage.objects WHERE id=v.storage_object_id;
 IF v.id IS NULL OR o.id IS NULL OR o.bucket_id<>'org-documents' OR o.name IS DISTINCT FROM v.file_path OR NOT public.uc_copy_registry_object_matches(v) THEN PERFORM public.uc_frdo_error('SOURCE_UNAVAILABLE');END IF;
 PERFORM public.uc_frdo_fence(ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(proof->'participants'))||ARRAY[auth.uid()]);
 RETURN jsonb_build_object('source',p_ref,'bucket','org-documents','path',v.file_path,'object_id',o.id,'updated_at',o.updated_at,'byte_size',v.file_size);
END;$fn$;

CREATE FUNCTION public.uc_frdo_source_projection(p_org uuid,p_sealed jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE authorized jsonb;
BEGIN
 authorized:=public.uc_document_registry_source(p_org,p_sealed->'source',false,false);
 RETURN CASE WHEN authorized IS NULL THEN '{"availability":"currently_unavailable","evidence":null}'::jsonb ELSE jsonb_build_object('availability','available','evidence',p_sealed) END;
END;$fn$;

CREATE FUNCTION public.uc_frdo_supplement_json(p_value public.uc_frdo_supplement_revisions,p_scope jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $fn$
DECLARE fields jsonb;evidence jsonb;
BEGIN
 IF p_value.id IS NULL OR p_value.redacted THEN RETURN NULL;END IF;
 PERFORM public.uc_frdo_record_history_access(p_value.organization_id,p_scope,p_value.record_id,false);
 PERFORM public.uc_frdo_fence(p_value.retained_people);
 fields:=p_value.fields;
 IF fields->'snils_exception'->>'kind'='external_support_approval' THEN
  fields:=jsonb_set(fields,'{snils_exception,not_assigned_confirmation}',public.uc_frdo_source_projection(p_value.organization_id,fields->'snils_exception'->'not_assigned_confirmation'));
  fields:=jsonb_set(fields,'{snils_exception,approval_evidence}',public.uc_frdo_source_projection(p_value.organization_id,fields->'snils_exception'->'approval_evidence'));
 END IF;
 SELECT coalesce(jsonb_agg(public.uc_frdo_source_projection(p_value.organization_id,value)ORDER BY ordinal),'[]')INTO evidence FROM jsonb_array_elements(p_value.evidence)WITH ORDINALITY a(value,ordinal);
 RETURN jsonb_build_object('ref',public.uc_frdo_supplement_ref(p_value),'record_id',p_value.record_id,'user_id',p_value.user_id,'fields',fields,'reviewed_by',p_value.reviewed_by,'reviewed_at',p_value.reviewed_at,'evidence',evidence,'review_note',p_value.review_note);
END;$fn$;

CREATE FUNCTION public.uc_frdo_supplement_shape(p_input jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE fields jsonb;field_name text;fact jsonb;known jsonb;exception jsonb;proof jsonb;period jsonb;start_date date;end_date date;index_value numeric;
BEGIN
 IF NOT public.uc_frdo_shape(p_input,ARRAY['record','expected_revision','fields','evidence','review_note']) OR jsonb_typeof(p_input->'expected_revision')IS DISTINCT FROM'number' OR (p_input->>'expected_revision')::numeric<>trunc((p_input->>'expected_revision')::numeric) OR (p_input->>'expected_revision')::numeric NOT BETWEEN 0 AND 9007199254740990 OR NOT public.uc_document_registry_text(p_input->'review_note',4000) OR jsonb_typeof(p_input->'evidence')IS DISTINCT FROM'array' OR jsonb_array_length(p_input->'evidence')NOT BETWEEN 1 AND 30 OR octet_length(p_input::text)>200000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 fields:=p_input->'fields';
 IF NOT public.uc_frdo_shape(fields-'training_period',ARRAY['gender','snils','citizenship_code','training_form','financing_source','education_form','professional_area','specialty_group','prior_education_level','prior_diploma_last_name','prior_diploma_series','prior_diploma_number','po_program_subtype','qualification_rank','qualification_not_awarded','patronymic_absence','series_absence','loss_confirmation','exchange_confirmation','destruction_confirmation','snils_exception'])THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 IF fields?'training_period'THEN
  period:=fields->'training_period';
  IF NOT public.uc_frdo_shape(period,ARRAY['kind','start_date','end_date','evidence_index'])OR period->>'kind'IS DISTINCT FROM'reviewed_actual_training_period_v1'OR jsonb_typeof(period->'start_date')IS DISTINCT FROM'string'OR jsonb_typeof(period->'end_date')IS DISTINCT FROM'string'OR coalesce(period->>'start_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'OR coalesce(period->>'end_date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'OR jsonb_typeof(period->'evidence_index')IS DISTINCT FROM'number'THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  BEGIN start_date:=(period->>'start_date')::date;end_date:=(period->>'end_date')::date;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END;
  index_value:=(period->>'evidence_index')::numeric;
  IF start_date IS NULL OR end_date IS NULL OR to_char(start_date,'YYYY-MM-DD')IS DISTINCT FROM period->>'start_date'OR to_char(end_date,'YYYY-MM-DD')IS DISTINCT FROM period->>'end_date'OR start_date>end_date OR index_value<>trunc(index_value)OR index_value NOT BETWEEN 0 AND 29 OR index_value>=jsonb_array_length(p_input->'evidence')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 END IF;
 FOR field_name,fact IN SELECT key,value FROM jsonb_each(fields)WHERE key NOT IN('snils_exception','training_period')LOOP
  IF fact->>'state' IN('unknown','confirmed_absent')THEN
   IF NOT public.uc_frdo_shape(fact,ARRAY['state'])THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  ELSIF fact->>'state'='known'AND public.uc_frdo_shape(fact,ARRAY['state','value'])THEN
   known:=fact->'value';
   IF field_name IN('qualification_not_awarded','patronymic_absence','series_absence')THEN
    IF jsonb_typeof(known)IS DISTINCT FROM'boolean'THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
   ELSIF NOT public.uc_document_registry_text(known,1000)THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');
   ELSIF field_name='snils'AND known#>>'{}'!~'^[0-9]{11}$'OR field_name='citizenship_code'AND known#>>'{}'!~'^[0-9]{3}$'THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  ELSE PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 END LOOP;
 exception:=fields->'snils_exception';
 IF public.uc_frdo_shape(exception,ARRAY['kind'])AND exception->>'kind'='none'THEN NULL;
 ELSIF public.uc_frdo_shape(exception,ARRAY['kind','ticket_reference','not_assigned_confirmation','approval_evidence','approved_at','scope_note'])AND exception->>'kind'='external_support_approval'AND public.uc_document_registry_text(exception->'ticket_reference',200)AND public.uc_document_registry_text(exception->'scope_note',1000)AND jsonb_typeof(exception->'approved_at')='string'THEN
  BEGIN IF (exception->>'approved_at')::timestamptz IS NULL THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END;
 ELSE PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 FOR proof IN SELECT value FROM jsonb_array_elements(p_input->'evidence')UNION ALL SELECT exception->'not_assigned_confirmation'WHERE exception->>'kind'='external_support_approval'UNION ALL SELECT exception->'approval_evidence'WHERE exception->>'kind'='external_support_approval'LOOP
  IF NOT public.uc_frdo_shape(proof,ARRAY['source','byte_sha256','byte_size'])OR coalesce(proof->>'byte_sha256','')!~'^[a-f0-9]{64}$'OR jsonb_typeof(proof->'byte_size')IS DISTINCT FROM'number'OR(proof->>'byte_size')::numeric<>trunc((proof->>'byte_size')::numeric)OR(proof->>'byte_size')::numeric NOT BETWEEN 1 AND 20971520 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 END LOOP;
END;$fn$;

CREATE FUNCTION public.uc_frdo_begin_supplement(p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
DECLARE org uuid;scope jsonb;actor uuid:=auth.uid();req uuid;input jsonb;bound jsonb;previous public.uc_frdo_supplement_revisions;pending public.uc_frdo_packet_requests;people uuid[];sources jsonb:='[]';proof jsonb;authorized jsonb;payload_hash text;person uuid;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR actor IS NULL OR NOT public.uc_custom_journal_person(actor)OR NOT public.account_deletion_access_allowed()THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 IF NOT public.uc_frdo_shape(p_command,ARRAY['schema_version','abi_revision','organization_id','scope','request_id','action'])OR p_command->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_command->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_command->'organization_id')OR NOT public.uc_custom_journal_uuid(p_command->'request_id')OR NOT public.uc_frdo_shape(p_command->'action',ARRAY['kind','input'])OR p_command->'action'->>'kind'IS DISTINCT FROM'save_supplement'THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 org:=(p_command->>'organization_id')::uuid;scope:=p_command->'scope';req:=(p_command->>'request_id')::uuid;input:=p_command->'action'->'input';PERFORM public.uc_frdo_supplement_shape(input);PERFORM public.uc_education_issue_scope(org,scope);
 IF NOT public.uc_document_has_action(org,'write')THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 payload_hash:=public.uc_frdo_hash(p_command);PERFORM public.uc_frdo_fence(ARRAY[actor],'request:'||actor::text||':'||req::text);
 SELECT *INTO pending FROM public.uc_frdo_packet_requests WHERE actor_id=actor AND request_id=req FOR UPDATE;
 IF pending.request_id IS NOT NULL AND(pending.organization_id IS DISTINCT FROM org OR pending.scope IS DISTINCT FROM scope OR pending.action_kind<>'save_supplement'OR pending.payload_sha256 IS DISTINCT FROM payload_hash)THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;
 IF NOT public.uc_custom_journal_uuid(input->'record'->'record_id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 IF pending.phase='committed'THEN PERFORM public.uc_frdo_record_history_access(org,scope,(input->'record'->>'record_id')::uuid,true);PERFORM public.uc_frdo_fence(pending.retained_people);RETURN jsonb_build_object('phase','committed','actor_id',actor,'request_id',req,'payload_sha256',payload_hash,'receipt',pending.receipt);END IF;
 bound:=public.uc_frdo_record_live(org,scope,(input->'record'->>'record_id')::uuid,true,true);people:=ARRAY[actor,(bound->'ref'->>'user_id')::uuid];
 IF input->'record'IS DISTINCT FROM bound->'ref'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 IF input->'fields'?'training_period'AND((input->'fields'->'training_period'->>'end_date')::date>(bound->'record'->'frdo_facts'->>'issue_date')::date OR(bound->'record'->'frdo_facts'->>'training_start_date'IS NOT NULL AND bound->'record'->'frdo_facts'->>'training_start_date'IS DISTINCT FROM input->'fields'->'training_period'->>'start_date')OR(bound->'record'->'frdo_facts'->>'training_end_date'IS NOT NULL AND bound->'record'->'frdo_facts'->>'training_end_date'IS DISTINCT FROM input->'fields'->'training_period'->>'end_date'))THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 PERFORM public.uc_frdo_fence(people,'supplement:'||org::text||':'||(input->'record'->>'record_id'));
 SELECT *INTO previous FROM public.uc_frdo_supplement_revisions WHERE organization_id=org AND record_id=(input->'record'->>'record_id')::uuid ORDER BY revision DESC LIMIT 1 FOR SHARE;
 IF coalesce(previous.revision,0)IS DISTINCT FROM(input->>'expected_revision')::bigint THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
 FOR proof IN SELECT value FROM jsonb_array_elements(input->'evidence')UNION ALL SELECT input->'fields'->'snils_exception'->'not_assigned_confirmation'WHERE input->'fields'->'snils_exception'->>'kind'='external_support_approval'UNION ALL SELECT input->'fields'->'snils_exception'->'approval_evidence'WHERE input->'fields'->'snils_exception'->>'kind'='external_support_approval'LOOP
  sources:=public.uc_frdo_source_set_add(sources,proof);authorized:=public.uc_document_registry_source(org,proof->'source',true,false);
  FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(authorized->'participants')LOOP people:=array_append(people,person);END LOOP;
 END LOOP;
 SELECT array_agg(DISTINCT value ORDER BY value)INTO people FROM unnest(people)value;PERFORM public.uc_frdo_fence(people);
 IF pending.request_id IS NULL THEN INSERT INTO public.uc_frdo_packet_requests(actor_id,request_id,organization_id,scope,action_kind,payload_sha256,phase,intent_refs,retained_people)VALUES(actor,req,org,scope,'save_supplement',payload_hash,'pending',jsonb_build_object('record',bound->'ref','expected_revision',input->'expected_revision','source_refs',(SELECT jsonb_agg(value->'source'ORDER BY public.uc_frdo_canonical(value->'source')COLLATE"C")FROM jsonb_array_elements(sources))),people);
 ELSIF pending.retained_people IS DISTINCT FROM people THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('phase','pending','actor_id',actor,'request_id',req,'payload_sha256',payload_hash);
END;$fn$;

CREATE FUNCTION public.uc_frdo_commit_supplement(p_value jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE prior_claims text;prior_sub text;prior_role text;claims jsonb;role_changed boolean:=false;actor uuid;org uuid;command jsonb;input jsonb;pending public.uc_frdo_packet_requests;begin_result jsonb;proof jsonb;source_read jsonb;sources jsonb:='[]';sources_checked jsonb:='[]';matches integer;new_id uuid;recorded timestamptz;new_revision bigint;snapshot text;v_receipt jsonb;result jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 prior_claims:=current_setting('request.jwt.claims',true);prior_sub:=current_setting('request.jwt.claim.sub',true);prior_role:=current_setting('request.jwt.claim.role',true);
 IF prior_claims IS NULL OR prior_claims=''OR coalesce(prior_sub,'')<>''OR(prior_role IS NOT NULL AND prior_role NOT IN('','service_role'))THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 BEGIN claims:=prior_claims::jsonb;EXCEPTION WHEN OTHERS THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END;
 IF jsonb_typeof(claims)IS DISTINCT FROM'object'OR claims->>'role'IS DISTINCT FROM'service_role'THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_frdo_shape(p_value,ARRAY['schema_version','abi_revision','verified_actor_id','command','command_payload_sha256','source_reads'])OR p_value->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_value->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_value->'verified_actor_id')OR jsonb_typeof(p_value->'source_reads')IS DISTINCT FROM'array'OR octet_length(p_value::text)>8000000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 actor:=(p_value->>'verified_actor_id')::uuid;command:=p_value->'command';input:=command->'action'->'input';
 IF command->'action'->>'kind'IS DISTINCT FROM'save_supplement'OR NOT public.uc_custom_journal_uuid(command->'organization_id')OR NOT public.uc_custom_journal_uuid(command->'request_id')OR public.uc_frdo_hash(command)IS DISTINCT FROM p_value->>'command_payload_sha256'THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;
 org:=(command->>'organization_id')::uuid;PERFORM public.uc_frdo_fence(ARRAY[actor],'request:'||actor::text||':'||(command->>'request_id'));
 SELECT *INTO pending FROM public.uc_frdo_packet_requests WHERE actor_id=actor AND request_id=(command->>'request_id')::uuid FOR UPDATE;
 IF pending.request_id IS NULL OR pending.action_kind<>'save_supplement'OR pending.payload_sha256 IS DISTINCT FROM p_value->>'command_payload_sha256'OR pending.organization_id IS DISTINCT FROM org OR pending.scope IS DISTINCT FROM command->'scope'THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);IF prior_role IS NOT NULL AND prior_role<>''THEN PERFORM set_config('request.jwt.claim.role','authenticated',true);role_changed:=true;END IF;
 BEGIN
  IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS DISTINCT FROM actor THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
  begin_result:=public.uc_frdo_begin_supplement(command);
  IF begin_result->>'phase'='committed'THEN result:=jsonb_build_object('phase','committed','replayed',true,'receipt',begin_result->'receipt');
  ELSE
   FOR proof IN SELECT value FROM jsonb_array_elements(input->'evidence')UNION ALL SELECT input->'fields'->'snils_exception'->'not_assigned_confirmation'WHERE input->'fields'->'snils_exception'->>'kind'='external_support_approval'UNION ALL SELECT input->'fields'->'snils_exception'->'approval_evidence'WHERE input->'fields'->'snils_exception'->>'kind'='external_support_approval'LOOP sources:=public.uc_frdo_source_set_add(sources,proof);END LOOP;
   IF jsonb_array_length(sources)<>jsonb_array_length(p_value->'source_reads')THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
   FOR proof IN SELECT value FROM jsonb_array_elements(sources)LOOP
    SELECT count(*),jsonb_agg(value)->0 INTO matches,source_read FROM jsonb_array_elements(p_value->'source_reads')WHERE value->'source'=proof->'source';
    IF matches<>1 THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;PERFORM public.uc_frdo_source_live(org,proof,source_read,true);sources_checked:=sources_checked||jsonb_build_array(source_read);
   END LOOP;
   new_id:=gen_random_uuid();recorded:=clock_timestamp();new_revision:=(input->>'expected_revision')::bigint+1;
   snapshot:=public.uc_frdo_hash(jsonb_build_object('schema_version',1,'organization_id',org,'record_id',input->'record'->'record_id','user_id',input->'record'->'user_id','frozen_facts_sha256',input->'record'->'frozen_facts_sha256','revision',new_revision,'fields',input->'fields','evidence',input->'evidence'));
   INSERT INTO public.uc_frdo_supplement_revisions(id,organization_id,record_id,user_id,revision,frozen_facts_sha256,fields,evidence,source_reads,snapshot_sha256,reviewed_at,reviewed_by,review_note,request_id,retained_people)VALUES(new_id,org,(input->'record'->>'record_id')::uuid,(input->'record'->>'user_id')::uuid,new_revision,input->'record'->>'frozen_facts_sha256',input->'fields',input->'evidence',sources_checked,snapshot,recorded,actor,input->>'review_note',pending.request_id,pending.retained_people);
   v_receipt:=jsonb_build_object('request_id',pending.request_id,'action_kind','save_supplement','packet_ids','[]'::jsonb,'supplement_ids',jsonb_build_array(new_id),'authority_ids','[]'::jsonb,'event_ids','[]'::jsonb,'payload_sha256',pending.payload_sha256,'recorded_at',recorded);
   UPDATE public.uc_frdo_packet_requests SET phase='committed',receipt=v_receipt WHERE actor_id=actor AND request_id=pending.request_id;
   result:=jsonb_build_object('phase','committed','replayed',false,'receipt',v_receipt);
  END IF;
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims',prior_claims,true);IF role_changed THEN PERFORM set_config('request.jwt.claim.role',prior_role,true);END IF;
  IF current_setting('request.jwt.claims',true)IS DISTINCT FROM prior_claims OR current_setting('request.jwt.claim.sub',true)IS DISTINCT FROM prior_sub OR current_setting('request.jwt.claim.role',true)IS DISTINCT FROM prior_role THEN RAISE EXCEPTION'FRDO_PACKET_CLAIM_RESTORATION_FAILED';END IF;RAISE;
 END;
 PERFORM set_config('request.jwt.claims',prior_claims,true);IF role_changed THEN PERFORM set_config('request.jwt.claim.role',prior_role,true);END IF;
 IF current_setting('request.jwt.claims',true)IS DISTINCT FROM prior_claims OR current_setting('request.jwt.claim.sub',true)IS DISTINCT FROM prior_sub OR current_setting('request.jwt.claim.role',true)IS DISTINCT FROM prior_role THEN RAISE EXCEPTION'FRDO_PACKET_CLAIM_RESTORATION_FAILED';END IF;
 RETURN result;
END;$fn$;


-- ASSEMBLED FRAGMENT 12_original_inputs.sql
CREATE FUNCTION public.uc_frdo_read_inputs(p_org uuid,p_scope jsonb,p_selection jsonb,p_issuer jsonb,p_preview boolean DEFAULT false)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE item jsonb;v_record_id uuid;seen uuid[]:='{}';bound jsonb;original_bound jsonb;s public.uc_frdo_supplement_revisions;os public.uc_frdo_supplement_revisions;items jsonb:='[]';sources jsonb:='[]';sealed jsonb;entry jsonb;issuer_descriptor jsonb;descriptor jsonb;descriptors jsonb:='[]';
BEGIN
 PERFORM public.uc_education_issue_scope(p_org,p_scope);
 IF NOT public.uc_document_has_action(p_org,'read')OR NOT public.uc_document_has_action(p_org,'write')THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_frdo_shape(p_selection,ARRAY['stream','record_ids','template'])OR p_selection->'template'IS DISTINCT FROM public.uc_frdo_template(p_selection->>'stream')OR jsonb_typeof(p_selection->'record_ids')IS DISTINCT FROM'array'OR jsonb_array_length(p_selection->'record_ids')NOT BETWEEN 1 AND 1000 OR NOT public.uc_frdo_shape(p_issuer,ARRAY['regime','evidence','review_note'])OR NOT((p_issuer->>'regime'IN('ordinary_rf','joint_rf_foreign')AND public.uc_document_registry_text(p_issuer->'review_note',2000))OR(p_issuer->>'regime'='unconfirmed'AND p_issuer->'evidence'='null'::jsonb AND p_issuer->'review_note'='null'::jsonb))OR(NOT p_preview AND p_issuer->>'regime'IS DISTINCT FROM'ordinary_rf')THEN PERFORM public.uc_frdo_error('READINESS_BLOCKED');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_selection->'record_ids')ORDER BY value#>>'{}'LOOP
  IF NOT public.uc_custom_journal_uuid(item)OR(item#>>'{}')::uuid=ANY(seen)THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  v_record_id:=(item#>>'{}')::uuid;seen:=array_append(seen,v_record_id);bound:=public.uc_frdo_record_live(p_org,p_scope,v_record_id,true,true);IF p_preview THEN SELECT *INTO s FROM public.uc_frdo_supplement_revisions WHERE organization_id=p_org AND uc_frdo_supplement_revisions.record_id=v_record_id AND NOT redacted ORDER BY revision DESC LIMIT 1;ELSE s:=public.uc_frdo_supplement_current(p_org,v_record_id);END IF;
  original_bound:=NULL;os:=NULL;
  IF bound->'record'->>'original_record_id'IS NOT NULL THEN original_bound:=public.uc_frdo_record_live(p_org,p_scope,(bound->'record'->>'original_record_id')::uuid,false,true);IF p_preview THEN SELECT *INTO os FROM public.uc_frdo_supplement_revisions WHERE organization_id=p_org AND record_id=(bound->'record'->>'original_record_id')::uuid AND NOT redacted ORDER BY revision DESC LIMIT 1;ELSE os:=public.uc_frdo_supplement_current(p_org,(bound->'record'->>'original_record_id')::uuid);END IF;END IF;
  items:=items||jsonb_build_array(jsonb_build_object('record',bound->'record','supplement',public.uc_frdo_supplement_json(s,p_scope),'original',original_bound->'record','original_supplement',CASE WHEN os.id IS NOT NULL THEN public.uc_frdo_supplement_json(os,p_scope)END));
  FOR entry IN SELECT value FROM jsonb_array_elements(jsonb_build_array(bound->'record',original_bound->'record'))WHERE value IS NOT NULL AND value<>'null'::jsonb LOOP
   sealed:=entry->'artifact'->'artifact';sources:=public.uc_frdo_source_set_add(sources,jsonb_build_object('source',sealed->'source','byte_sha256',sealed->'byte_sha256','byte_size',sealed->'byte_size'));
  END LOOP;
  FOR entry IN SELECT value FROM jsonb_array_elements(jsonb_build_array(to_jsonb(s),to_jsonb(os)))WHERE value->>'id'IS NOT NULL LOOP
   FOR sealed IN SELECT value FROM jsonb_array_elements(entry->'evidence')UNION ALL SELECT entry->'fields'->'snils_exception'->'not_assigned_confirmation'WHERE entry->'fields'->'snils_exception'->>'kind'='external_support_approval'UNION ALL SELECT entry->'fields'->'snils_exception'->'approval_evidence'WHERE entry->'fields'->'snils_exception'->>'kind'='external_support_approval'LOOP sources:=public.uc_frdo_source_set_add(sources,sealed);END LOOP;
  END LOOP;
 END LOOP;
 FOR sealed IN SELECT value FROM jsonb_array_elements(sources)LOOP
  descriptor:=public.uc_frdo_source_descriptor(p_org,sealed->'source');
  IF descriptor->'byte_size'IS DISTINCT FROM sealed->'byte_size'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
  descriptors:=descriptors||jsonb_build_array(descriptor||jsonb_build_object('expected_sha256',sealed->'byte_sha256'));
 END LOOP;
 IF p_issuer->>'regime'<>'unconfirmed'THEN issuer_descriptor:=public.uc_frdo_source_descriptor(p_org,p_issuer->'evidence');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(descriptors)WHERE value->'source'=p_issuer->'evidence')THEN descriptors:=descriptors||jsonb_build_array(issuer_descriptor||jsonb_build_object('expected_sha256',NULL));END IF;END IF;
 RETURN jsonb_build_object('input',jsonb_build_object('context',jsonb_build_object('schema_version',1,'organization_id',p_org,'actor_id',auth.uid(),'scope',p_scope,'as_of_date',to_char(CURRENT_DATE,'YYYY-MM-DD'),'stream',p_selection->'stream','template',p_selection->'template','issuer_regime',p_issuer->'regime'),'items',items),'source_descriptors',descriptors);
END;$fn$;


-- ASSEMBLED FRAGMENT 15_exact_donor_parts.sql
-- Exact donor manifest generated from the held canonical J metadata.
CREATE FUNCTION public.uc_frdo_parts(p_stream text)RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF p_stream='dpo'THEN RETURN '[{"path":"[Content_Types].xml","bytes":1557,"sha256":"a0c2a2d4310ffafdb5524472cb6fc644eb4556e0ca05759e88e292a3e214f7e0"},{"path":"_rels/.rels","bytes":735,"sha256":"ad78dfe44ec71f967f96e95bdf6baf2545c39e1a5e4413e7b8e9413eb95fd922"},{"path":"xl/_rels/workbook.xml.rels","bytes":839,"sha256":"15e353ac27ab7362603f4a0d0754a97885e8e2ce523615a3cd59b458ddcd60e9"},{"path":"xl/workbook.xml","bytes":2571,"sha256":"e49a4a844fa17e52dd631a3cfdb12e72138d7fa36736ef64b05d7e98b9fadacb"},{"path":"xl/styles.xml","bytes":13076,"sha256":"d4905029f6f6f7ed598cee29577bd9f9b1349400355ddd2dc2a4aee67547a08b"},{"path":"xl/worksheets/_rels/sheet2.xml.rels","bytes":293,"sha256":"ac2075ad5ad18eaee04da95ec4b12db9c771cc7cef61bcf1376be2026715d327"},{"path":"xl/worksheets/sheet2.xml","bytes":108240,"sha256":"fb6879b187d767b1cc6e22abfeb63ad57b7a13c00a0a1fb4112fd5a387ea758a"},{"path":"xl/theme/theme1.xml","bytes":6849,"sha256":"a10db1e59511e0533b346219f9ddf937bae92b8222b40048b9f5f22de2d31c97"},{"path":"xl/worksheets/sheet1.xml","bytes":885595,"sha256":"fcfd19a5b41eb367cde79750f8725cc9967ed77244349a2323ed432d669796fb"},{"path":"xl/sharedStrings.xml","bytes":52203,"sha256":"88860a710239aa17de8e6fe8806ff7e99e30c7d6a40347ae9fd42093ad927dfa"},{"path":"docProps/custom.xml","bytes":956,"sha256":"2b34605839289be471b97064f22fc3baeb0c1fb6baf64a09899f5662c2076da7"},{"path":"docProps/core.xml","bytes":767,"sha256":"e6a62893edf24a54f70079605256aae23166e3849a923c30488f88e92ffe7de4"},{"path":"xl/tables/table1.xml","bytes":974,"sha256":"905eb073123736c4de2a5b74c5c47da9fbb79c20aec86e4cf47e8467ce6cff3d"},{"path":"docProps/app.xml","bytes":1626,"sha256":"03bfaadb25ab9333d64e3b3852f8d45b3ec9da8b6ad463553f3075678002df07"}]'::jsonb;
 ELSIF p_stream='po'THEN RETURN '[{"path":"[Content_Types].xml","bytes":1548,"sha256":"32e73660bf97d57b9d1809468b91b57cede663b1a2955e08611cba21a0a069ae"},{"path":"_rels/.rels","bytes":588,"sha256":"73e5a29f48d5ab979eeda062493bc7e679265c1344ef936978b8becec5549497"},{"path":"xl/workbook.xml","bytes":2906,"sha256":"fb91190486a09b3e65b535f738414f70230b38ae15cc1559dc11dccbdb5fe85b"},{"path":"xl/_rels/workbook.xml.rels","bytes":839,"sha256":"15e353ac27ab7362603f4a0d0754a97885e8e2ce523615a3cd59b458ddcd60e9"},{"path":"xl/worksheets/sheet1.xml","bytes":778612,"sha256":"ed58ba67b8340c3f85f9824dd73d47999af214475770a1e6a2efe1e1bb7bfa29"},{"path":"xl/worksheets/sheet2.xml","bytes":564882,"sha256":"a6584a5313a29727180838448c1f067b86f169e16492cea6b010ea45c11b8648"},{"path":"xl/theme/theme1.xml","bytes":6847,"sha256":"868bbfaabb40a5ba3c37c759423c9cb78442b0c304f01c6527ee4f257f1b1c2c"},{"path":"xl/styles.xml","bytes":14544,"sha256":"07d1f05011dfb22effaa6cb97c98f3805ed0176d7cc77bc4fe5a92aa37d22d40"},{"path":"xl/sharedStrings.xml","bytes":439698,"sha256":"6bc4cabb0ce247856d01d71482ab4c469d96087c9da6ba187e6c8bd465d4d8f7"},{"path":"xl/worksheets/_rels/sheet2.xml.rels","bytes":458,"sha256":"7278090537b94e2da15ea13592e03a77fc42074b866dc43282215321ccdb0054"},{"path":"xl/printerSettings/printerSettings1.bin","bytes":29480,"sha256":"f0f7d531b9b80c96150e5fedbf1f5e3f6c3e79815d3d1b6cb4a449eda6b58771"},{"path":"xl/tables/table1.xml","bytes":1613,"sha256":"236947a1b1d708245bf1796eee22af43c1e44b9aa51a482f69a636dbca9128b2"},{"path":"docProps/core.xml","bytes":622,"sha256":"af7fec7ed192a075a6f12205be938d063bfa9689a7b72b22c6b49b7e61588903"},{"path":"docProps/app.xml","bytes":1392,"sha256":"f025a0a390b3d5339d3d335c9eacbba0e04d2f31c0a078930002625ce72468b2"}]'::jsonb;
 ELSE PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
END;$fn$;


-- ASSEMBLED FRAGMENT 20_artifact_lifecycle.sql
-- UC020 S3 artifact lifecycle. All new commands/leases use the original JWT.
-- The single service attestation is fixed to one existing original-user build;
-- it neither accepts an object path nor exposes arbitrary identity projection.
CREATE FUNCTION public.uc_frdo_packet_ref(p public.uc_frdo_packets)RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('id',p.id,'revision',p.revision,'state_hash',p.state_hash,'snapshot_sha256',p.snapshot_sha256)$fn$;

CREATE FUNCTION public.uc_frdo_packet_current(p_packet uuid,p_write boolean DEFAULT false)RETURNS public.uc_frdo_packets
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
DECLARE p public.uc_frdo_packets;issuer jsonb;resolved jsonb;actual_manifest jsonb;
BEGIN
 p:=public.uc_frdo_packet_access(p_packet,p_write);
 issuer:=jsonb_build_object('regime',p.issuer_review->'regime','evidence',p.issuer_review->'evidence'->'evidence'->'source','review_note',p.issuer_review->'review_note');
 resolved:=public.uc_frdo_capture_cas(p.organization_id,p.scope,p.capture,p.source_reads,issuer);
 SELECT jsonb_agg(jsonb_build_object('record_id',s.record_id,'user_id',s.user_id,'enrollment_id',s.enrollment_id,'course_id',s.course_id,'group_id',s.group_id,'selected',s.selected,'original',s.original)ORDER BY s.record_id)INTO actual_manifest FROM public.uc_frdo_packet_subjects s WHERE s.packet_id=p.id;
 IF actual_manifest IS DISTINCT FROM resolved->'manifest'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 RETURN p;
END;$fn$;

CREATE FUNCTION public.uc_frdo_append_event(p_packet uuid,p_kind text,p_payload jsonb,p_state text,p_people uuid[]DEFAULT'{}',p_event_id uuid DEFAULT NULL)RETURNS public.uc_frdo_packet_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE p public.uc_frdo_packets;e public.uc_frdo_packet_events;new_hash text;payload_hash text;
BEGIN
 p:=public.uc_frdo_packet_access(p_packet,true);PERFORM public.uc_frdo_fence(p.retained_people||p_people,'packet:'||p.id::text);
 SELECT *INTO p FROM public.uc_frdo_packets WHERE id=p_packet FOR UPDATE;
 IF p.revision>=9007199254740991 THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 SELECT array_agg(DISTINCT value ORDER BY value)INTO p_people FROM unnest(p.retained_people||coalesce(p_people,'{}'::uuid[])||ARRAY[auth.uid()])value WHERE value IS NOT NULL;PERFORM public.uc_frdo_fence(p_people);
 payload_hash:=public.uc_frdo_hash(p_payload);
 new_hash:=public.uc_frdo_hash(jsonb_build_object('packet_id',p.id,'revision',p.revision+1,'previous_state_hash',p.state_hash,'kind',p_kind,'payload_sha256',payload_hash,'snapshot_sha256',p.snapshot_sha256));
 INSERT INTO public.uc_frdo_packet_events(id,organization_id,packet_id,revision,kind,actor_id,previous_state_hash,state_hash,payload_sha256,payload,retained_people)VALUES(coalesce(p_event_id,gen_random_uuid()),p.organization_id,p.id,p.revision+1,p_kind,auth.uid(),p.state_hash,new_hash,payload_hash,p_payload,p_people)RETURNING*INTO e;
 UPDATE public.uc_frdo_packets SET revision=e.revision,state_hash=e.state_hash,state=p_state,retained_people=p_people WHERE id=p.id;
 RETURN e;
END;$fn$;

CREATE FUNCTION public.uc_frdo_request_file(p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE org uuid;scope jsonb;actor uuid:=auth.uid();req uuid;a jsonb;p public.uc_frdo_packets;pending public.uc_frdo_packet_requests;b public.uc_frdo_packet_artifact_builds;e public.uc_frdo_packet_events;payload_hash text;v_receipt jsonb;new_id uuid:=gen_random_uuid();new_artifact uuid:=gen_random_uuid();
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR actor IS NULL OR NOT public.uc_custom_journal_person(actor)OR NOT public.account_deletion_access_allowed()THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 IF NOT public.uc_frdo_shape(p_command,ARRAY['schema_version','abi_revision','organization_id','scope','request_id','action'])OR p_command->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_command->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_command->'organization_id')OR NOT public.uc_custom_journal_uuid(p_command->'request_id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 org:=(p_command->>'organization_id')::uuid;scope:=p_command->'scope';req:=(p_command->>'request_id')::uuid;a:=p_command->'action';PERFORM public.uc_education_issue_scope(org,scope);
 IF NOT public.uc_frdo_shape(a,ARRAY['kind','packet','expected_template'])OR a->>'kind'IS DISTINCT FROM'generate_file'OR NOT public.uc_custom_journal_uuid(a->'packet'->'id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 payload_hash:=public.uc_frdo_hash(p_command);PERFORM public.uc_frdo_fence(ARRAY[actor],'request:'||actor::text||':'||req::text);
 SELECT *INTO pending FROM public.uc_frdo_packet_requests WHERE actor_id=actor AND request_id=req FOR UPDATE;
 IF pending.request_id IS NOT NULL THEN
  IF pending.organization_id IS DISTINCT FROM org OR pending.scope IS DISTINCT FROM scope OR pending.action_kind<>'generate_file'OR pending.payload_sha256 IS DISTINCT FROM payload_hash THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;
  PERFORM public.uc_frdo_packet_access((a->'packet'->>'id')::uuid,true);PERFORM public.uc_frdo_fence(pending.retained_people);
  RETURN jsonb_build_object('phase',pending.phase,'replayed',true,'receipt',pending.receipt);
 END IF;
 p:=public.uc_frdo_packet_current((a->'packet'->>'id')::uuid,true);PERFORM public.uc_frdo_fence(p.retained_people,'packet:'||p.id::text);
 SELECT *INTO p FROM public.uc_frdo_packets WHERE id=p.id FOR UPDATE;
 IF p.organization_id IS DISTINCT FROM org OR p.scope IS DISTINCT FROM scope OR public.uc_frdo_packet_ref(p)IS DISTINCT FROM a->'packet'THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
 IF a->'expected_template'IS DISTINCT FROM public.uc_frdo_template(p.stream)OR p.capture->'mapped_batch'->'context'->'template'IS DISTINCT FROM a->'expected_template'THEN PERFORM public.uc_frdo_error('TEMPLATE_CHANGED');END IF;
 IF p.state NOT IN('preview_frozen','file_generation_failed','file_generated')THEN PERFORM public.uc_frdo_error('ILLEGAL_TRANSITION');END IF;
 INSERT INTO public.uc_frdo_packet_requests(actor_id,request_id,organization_id,scope,action_kind,payload_sha256,phase,intent_refs,retained_people)VALUES(actor,req,org,scope,'generate_file',payload_hash,'pending',jsonb_build_object('packet',a->'packet','build_id',new_id),ARRAY(SELECT DISTINCT value FROM unnest(p.retained_people||ARRAY[actor])value ORDER BY value));
 INSERT INTO public.uc_frdo_packet_artifact_builds(id,artifact_id,packet_id,organization_id,actor_id,input_revision,snapshot_sha256,worker_request_id,phase,bucket_id,object_path,template,retained_people)VALUES(new_id,new_artifact,p.id,org,actor,p.revision,p.snapshot_sha256,req,'queued','frdo-packet-artifacts',org::text||'/packets/'||p.id::text||'/'||new_id::text||'/'||new_artifact::text||'.xlsx',a->'expected_template',ARRAY(SELECT DISTINCT value FROM unnest(p.retained_people||ARRAY[actor])value ORDER BY value))RETURNING*INTO b;
 e:=public.uc_frdo_append_event(p.id,'file_requested',jsonb_build_object('build_id',b.id),'file_generating');
 UPDATE public.uc_frdo_packets SET current_build_id=b.id WHERE id=p.id;
 v_receipt:=jsonb_build_object('request_id',req,'action_kind','generate_file','packet_ids',jsonb_build_array(p.id),'supplement_ids','[]'::jsonb,'authority_ids','[]'::jsonb,'event_ids',jsonb_build_array(e.id),'payload_sha256',payload_hash,'recorded_at',e.recorded_at);
 UPDATE public.uc_frdo_packet_requests r SET phase='committed',receipt=v_receipt WHERE r.actor_id=actor AND r.request_id=req;
 RETURN jsonb_build_object('phase','committed','replayed',false,'receipt',v_receipt);
END;$fn$;

CREATE FUNCTION public.uc_frdo_claim_file(p_request jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE p public.uc_frdo_packets;b public.uc_frdo_packet_artifact_builds;new_lease uuid:=gen_random_uuid();now_at timestamptz:=clock_timestamp();
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 IF NOT public.uc_frdo_shape(p_request,ARRAY['schema_version','abi_revision','organization_id','packet_id','build_id','input_revision','request_id'])OR p_request->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_request->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_request->'packet_id')OR NOT public.uc_custom_journal_uuid(p_request->'build_id')OR NOT public.uc_custom_journal_uuid(p_request->'request_id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 p:=public.uc_frdo_packet_current((p_request->>'packet_id')::uuid,true);PERFORM public.uc_frdo_fence(p.retained_people,'packet:'||p.id::text);
 SELECT *INTO p FROM public.uc_frdo_packets WHERE id=p.id FOR UPDATE;SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE id=(p_request->>'build_id')::uuid FOR UPDATE;
 IF b.id IS NULL OR b.packet_id IS DISTINCT FROM p.id OR b.organization_id IS DISTINCT FROM p.organization_id OR b.actor_id IS DISTINCT FROM auth.uid()OR p_request->'organization_id'IS DISTINCT FROM to_jsonb(p.organization_id)OR b.worker_request_id IS DISTINCT FROM(p_request->>'request_id')::uuid OR to_jsonb(b.input_revision)IS DISTINCT FROM p_request->'input_revision'OR b.snapshot_sha256 IS DISTINCT FROM p.snapshot_sha256 THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF b.phase='sealed'THEN RETURN jsonb_build_object('phase','sealed','artifact',b.artifact_ref);END IF;
 IF p.current_build_id IS DISTINCT FROM b.id OR p.revision<>b.input_revision+1 OR p.state<>'file_generating'OR b.phase='failed'THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
 IF b.phase='generating'AND b.lease_until>now_at THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
 UPDATE public.uc_frdo_packet_artifact_builds SET phase='generating',lease_id=new_lease,lease_until=now_at+interval'120 seconds'WHERE id=b.id;
 RETURN jsonb_build_object('phase','generating','organization_id',p.organization_id,'actor_id',auth.uid(),'scope',p.scope,'packet',public.uc_frdo_packet_ref(p),'build_id',b.id,'artifact_id',b.artifact_id,'request_id',b.worker_request_id,'input_revision',b.input_revision,'snapshot_sha256',b.snapshot_sha256,'capture',p.capture,'template',b.template,'lease_id',new_lease,'lease_until',now_at+interval'120 seconds','storage',jsonb_build_object('bucket',b.bucket_id,'path',b.object_path));
END;$fn$;

CREATE FUNCTION public.uc_frdo_artifact_access(p_packet uuid,p_ref jsonb,p_current_submission boolean DEFAULT false,p_lock boolean DEFAULT false)RETURNS public.uc_frdo_packet_artifact_builds
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout='2000ms'AS $fn$
DECLARE p public.uc_frdo_packets;b public.uc_frdo_packet_artifact_builds;o storage.objects;
BEGIN
 p:=CASE WHEN p_current_submission THEN public.uc_frdo_packet_current(p_packet,false)ELSE public.uc_frdo_packet_access(p_packet,false)END;
 IF p_current_submission AND p.state='correction_abandoned'THEN PERFORM public.uc_frdo_error('ILLEGAL_TRANSITION');END IF;
 IF NOT public.uc_frdo_shape(p_ref,ARRAY['artifact_id','packet_id','snapshot_sha256','byte_sha256','byte_size','binding_sha256'])OR NOT public.uc_custom_journal_uuid(p_ref->'artifact_id')OR p_ref->'packet_id'IS DISTINCT FROM to_jsonb(p.id)OR p_ref->>'snapshot_sha256'IS DISTINCT FROM p.snapshot_sha256 THEN PERFORM public.uc_frdo_error('ARTIFACT_UNAVAILABLE');END IF;
 SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE artifact_id=(p_ref->>'artifact_id')::uuid AND packet_id=p.id AND organization_id=p.organization_id AND phase='sealed';
 IF b.id IS NULL OR b.byte_sha256 IS DISTINCT FROM b.readback_sha256 OR b.artifact_ref IS DISTINCT FROM p_ref OR(p_current_submission AND p.current_build_id IS DISTINCT FROM b.id)THEN PERFORM public.uc_frdo_error('ARTIFACT_UNAVAILABLE');END IF;
 IF p_lock THEN PERFORM 1 FROM public.uc_frdo_packet_artifact_builds WHERE id=b.id FOR SHARE;PERFORM 1 FROM storage.objects WHERE id=b.object_id FOR SHARE;PERFORM 1 FROM storage.buckets WHERE id=b.bucket_id FOR SHARE;END IF;
 SELECT *INTO o FROM storage.objects WHERE id=b.object_id;
 IF o.id IS NULL OR o.bucket_id IS DISTINCT FROM b.bucket_id OR o.name IS DISTINCT FROM b.object_path OR o.updated_at IS DISTINCT FROM b.object_updated_at OR(o.metadata->>'size')::bigint IS DISTINCT FROM b.byte_size OR lower(btrim(o.metadata->>'mimetype'))IS DISTINCT FROM b.mime OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id=b.bucket_id AND NOT public)THEN PERFORM public.uc_frdo_error('ARTIFACT_UNAVAILABLE');END IF;
 PERFORM public.uc_frdo_fence(b.retained_people);RETURN b;
END;$fn$;

CREATE FUNCTION public.uc_frdo_seal_file(p_value jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE prior_claims text;prior_sub text;prior_role text;claims jsonb;role_changed boolean:=false;actor uuid;packet_id uuid;p public.uc_frdo_packets;b public.uc_frdo_packet_artifact_builds;o storage.objects;e public.uc_frdo_packet_events;ref_body jsonb;artifact jsonb;result jsonb;part jsonb;expected_part jsonb;part_names text[];seen text[]:='{}';
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 prior_claims:=current_setting('request.jwt.claims',true);prior_sub:=current_setting('request.jwt.claim.sub',true);prior_role:=current_setting('request.jwt.claim.role',true);
 IF prior_claims IS NULL OR prior_claims=''OR coalesce(prior_sub,'')<>''OR(prior_role IS NOT NULL AND prior_role NOT IN('','service_role'))THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 BEGIN claims:=prior_claims::jsonb;EXCEPTION WHEN OTHERS THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END;IF jsonb_typeof(claims)IS DISTINCT FROM'object'OR claims->>'role'IS DISTINCT FROM'service_role'THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_frdo_shape(p_value,ARRAY['schema_version','abi_revision','verified_actor_id','organization_id','packet_id','build_id','input_revision','request_id','lease_id','snapshot_sha256','byte_sha256','byte_size','readback_sha256','template','signing','parts','object_id','object_updated_at'])OR p_value->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_value->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_value->'verified_actor_id')OR NOT public.uc_custom_journal_uuid(p_value->'packet_id')OR NOT public.uc_custom_journal_uuid(p_value->'build_id')OR NOT public.uc_custom_journal_uuid(p_value->'request_id')OR NOT public.uc_custom_journal_uuid(p_value->'lease_id')OR NOT public.uc_custom_journal_uuid(p_value->'object_id')OR p_value->'signing'IS DISTINCT FROM'{"status":"not_verified"}'::jsonb OR coalesce(p_value->>'byte_sha256','')!~'^[a-f0-9]{64}$'OR coalesce(p_value->>'readback_sha256','')!~'^[a-f0-9]{64}$'OR p_value->'byte_sha256'IS DISTINCT FROM p_value->'readback_sha256'OR jsonb_typeof(p_value->'byte_size')IS DISTINCT FROM'number'OR(p_value->>'byte_size')::numeric<>trunc((p_value->>'byte_size')::numeric)OR(p_value->>'byte_size')::numeric NOT BETWEEN 1 AND 20971520 OR jsonb_typeof(p_value->'parts')IS DISTINCT FROM'array'OR jsonb_array_length(p_value->'parts')NOT IN(13,14) OR octet_length(p_value::text)>100000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 actor:=(p_value->>'verified_actor_id')::uuid;packet_id:=(p_value->>'packet_id')::uuid;
 SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE id=(p_value->>'build_id')::uuid;
 IF b.id IS NULL OR b.actor_id IS DISTINCT FROM actor OR b.packet_id IS DISTINCT FROM packet_id OR p_value->'organization_id'IS DISTINCT FROM to_jsonb(b.organization_id)OR p_value->'input_revision'IS DISTINCT FROM to_jsonb(b.input_revision)OR p_value->'request_id'IS DISTINCT FROM to_jsonb(b.worker_request_id)THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);IF prior_role IS NOT NULL AND prior_role<>''THEN PERFORM set_config('request.jwt.claim.role','authenticated',true);role_changed:=true;END IF;
 BEGIN
  IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS DISTINCT FROM actor THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
  p:=public.uc_frdo_packet_access(packet_id,true);PERFORM public.uc_frdo_fence(p.retained_people,'packet:'||packet_id::text);
  SELECT *INTO p FROM public.uc_frdo_packets WHERE id=packet_id FOR UPDATE;SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE id=b.id FOR UPDATE;
  ref_body:=jsonb_build_object('artifact_id',b.artifact_id,'packet_id',p.id,'snapshot_sha256',p.snapshot_sha256,'byte_sha256',p_value->'byte_sha256','byte_size',p_value->'byte_size');artifact:=ref_body||jsonb_build_object('binding_sha256',public.uc_frdo_hash(ref_body));
  IF b.phase='sealed'THEN
   PERFORM public.uc_frdo_artifact_access(p.id,artifact,false,true);
   IF b.artifact_ref IS DISTINCT FROM artifact OR b.readback_sha256 IS DISTINCT FROM p_value->>'readback_sha256'OR b.part_proofs IS DISTINCT FROM p_value->'parts'OR b.template IS DISTINCT FROM p_value->'template'THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;
   result:=jsonb_build_object('phase','sealed','replayed',true,'artifact',b.artifact_ref);
  ELSE
   p:=public.uc_frdo_packet_current(packet_id,true);
   IF b.phase<>'generating'OR b.lease_id IS DISTINCT FROM(p_value->>'lease_id')::uuid OR b.lease_until<=clock_timestamp()OR p.current_build_id IS DISTINCT FROM b.id OR p.revision<>b.input_revision+1 OR p.state<>'file_generating'OR b.snapshot_sha256 IS DISTINCT FROM p_value->>'snapshot_sha256'OR b.template IS DISTINCT FROM p_value->'template'OR b.template IS DISTINCT FROM public.uc_frdo_template(p.stream)THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
   IF jsonb_array_length(p_value->'parts')<>jsonb_array_length(public.uc_frdo_parts(p.stream))THEN PERFORM public.uc_frdo_error('TEMPLATE_CHANGED');END IF;
   FOR part IN SELECT value FROM jsonb_array_elements(p_value->'parts')LOOP
    IF NOT public.uc_frdo_shape(part,ARRAY['path','bytes','sha256'])OR NOT public.uc_document_registry_text(part->'path',300)OR part->>'path'=ANY(seen)OR coalesce(part->>'sha256','')!~'^[a-f0-9]{64}$'OR jsonb_typeof(part->'bytes')IS DISTINCT FROM'number'OR(part->>'bytes')::numeric<>trunc((part->>'bytes')::numeric)OR(part->>'bytes')::numeric NOT BETWEEN 0 AND 20971520 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;seen:=array_append(seen,part->>'path');
    SELECT value INTO expected_part FROM jsonb_array_elements(public.uc_frdo_parts(p.stream))WHERE value->'path'=part->'path';
    IF expected_part IS NULL OR(part->>'path'<>'xl/worksheets/sheet1.xml'AND part IS DISTINCT FROM expected_part)OR(part->>'path'='xl/worksheets/sheet1.xml'AND(part->>'bytes')::bigint<1)THEN PERFORM public.uc_frdo_error('TEMPLATE_CHANGED');END IF;
   END LOOP;
   SELECT *INTO o FROM storage.objects WHERE id=(p_value->>'object_id')::uuid AND bucket_id=b.bucket_id AND name=b.object_path FOR SHARE;
   IF o.id IS NULL OR o.updated_at IS DISTINCT FROM(p_value->>'object_updated_at')::timestamptz OR(o.metadata->>'size')::bigint IS DISTINCT FROM(p_value->>'byte_size')::bigint OR lower(btrim(o.metadata->>'mimetype'))IS DISTINCT FROM b.mime OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id=b.bucket_id AND NOT public)THEN PERFORM public.uc_frdo_error('ARTIFACT_UNAVAILABLE');END IF;
   UPDATE public.uc_frdo_packet_artifact_builds SET phase='sealed',lease_until=NULL,object_id=o.id,object_updated_at=o.updated_at,byte_sha256=p_value->>'byte_sha256',byte_size=(p_value->>'byte_size')::bigint,readback_sha256=p_value->>'readback_sha256',part_proofs=p_value->'parts',artifact_ref=artifact WHERE id=b.id;
   e:=public.uc_frdo_append_event(p.id,'file_sealed',jsonb_build_object('artifact',artifact,'signing',jsonb_build_object('status','not_verified')),'file_generated');result:=jsonb_build_object('phase','sealed','replayed',false,'artifact',artifact,'event_id',e.id);
  END IF;
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims',prior_claims,true);IF role_changed THEN PERFORM set_config('request.jwt.claim.role',prior_role,true);END IF;
  IF current_setting('request.jwt.claims',true)IS DISTINCT FROM prior_claims OR current_setting('request.jwt.claim.sub',true)IS DISTINCT FROM prior_sub OR current_setting('request.jwt.claim.role',true)IS DISTINCT FROM prior_role THEN RAISE EXCEPTION'FRDO_PACKET_CLAIM_RESTORATION_FAILED';END IF;RAISE;
 END;
 PERFORM set_config('request.jwt.claims',prior_claims,true);IF role_changed THEN PERFORM set_config('request.jwt.claim.role',prior_role,true);END IF;
 IF current_setting('request.jwt.claims',true)IS DISTINCT FROM prior_claims OR current_setting('request.jwt.claim.sub',true)IS DISTINCT FROM prior_sub OR current_setting('request.jwt.claim.role',true)IS DISTINCT FROM prior_role THEN RAISE EXCEPTION'FRDO_PACKET_CLAIM_RESTORATION_FAILED';END IF;RETURN result;
END;$fn$;

CREATE FUNCTION public.uc_frdo_fail_file(p_build uuid,p_lease uuid,p_code text)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.uc_frdo_packets;b public.uc_frdo_packet_artifact_builds;e public.uc_frdo_packet_events;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR p_code NOT IN('FILE_GENERATION_FAILED','DEPENDENCY_UNAVAILABLE','SOURCE_CHANGED')THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE id=p_build;IF b.id IS NULL OR b.actor_id IS DISTINCT FROM auth.uid()THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 p:=public.uc_frdo_packet_access(b.packet_id,true);PERFORM public.uc_frdo_fence(p.retained_people,'packet:'||p.id::text);
 SELECT *INTO p FROM public.uc_frdo_packets WHERE id=p.id FOR UPDATE;SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE id=p_build FOR UPDATE;
 IF b.phase='failed'AND b.failure=p_code AND b.lease_id=p_lease THEN RETURN jsonb_build_object('phase','failed','replayed',true);END IF;
 IF b.phase<>'generating'OR b.lease_id IS DISTINCT FROM p_lease OR p.current_build_id IS DISTINCT FROM b.id OR p.revision<>b.input_revision+1 THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
 UPDATE public.uc_frdo_packet_artifact_builds SET phase='failed',lease_until=NULL,failure=p_code WHERE id=b.id;
 e:=public.uc_frdo_append_event(p.id,'file_failed',jsonb_build_object('build_id',b.id,'code',p_code),'file_generation_failed');RETURN jsonb_build_object('phase','failed','replayed',false,'event_id',e.id);
END;$fn$;


-- ASSEMBLED FRAGMENT 30_packet_operations.sql
CREATE FUNCTION public.uc_frdo_authority_ref(p public.uc_frdo_operator_authority_revisions)RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('id',p.id,'organization_id',p.organization_id,'operator_user_id',p.operator_user_id,'revision',p.revision,'state_hash',p.state_hash)$fn$;

CREATE FUNCTION public.uc_frdo_authority_current(p_org uuid,p_ref jsonb,p_require_current_operator boolean DEFAULT true)RETURNS public.uc_frdo_operator_authority_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a public.uc_frdo_operator_authority_revisions;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR NOT public.uc_custom_journal_person(auth.uid())OR NOT public.account_deletion_access_allowed()OR NOT public.uc_document_has_action(p_org,'read')THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_frdo_shape(p_ref,ARRAY['id','organization_id','operator_user_id','revision','state_hash'])OR NOT public.uc_custom_journal_uuid(p_ref->'id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 PERFORM public.uc_frdo_fence(ARRAY[auth.uid()],'authority:'||(p_ref->>'id'));
 SELECT *INTO a FROM public.uc_frdo_operator_authority_revisions WHERE organization_id=p_org AND id=(p_ref->>'id')::uuid ORDER BY revision DESC LIMIT 1 FOR SHARE;
 IF a.id IS NULL OR public.uc_frdo_authority_ref(a)IS DISTINCT FROM p_ref OR a.state<>'active'OR NOT public.uc_custom_journal_person(a.operator_user_id)OR(p_require_current_operator AND a.operator_user_id IS DISTINCT FROM auth.uid())OR clock_timestamp()<(a.validity->>'from')::timestamptz OR(a.validity->>'kind'='bounded'AND clock_timestamp()>=(a.validity->>'until')::timestamptz)OR NOT public.uc_education_actor_org_permission(a.operator_user_id,p_org,'documents.read')OR NOT public.uc_education_actor_org_permission(a.operator_user_id,p_org,'documents.write')THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_frdo_fence(a.retained_people||ARRAY[auth.uid()]);PERFORM public.uc_frdo_source_live(p_org,a.evidence,a.source_read,true);RETURN a;
END;$fn$;

CREATE FUNCTION public.uc_frdo_registry_data(p public.uc_frdo_packets,b public.uc_frdo_packet_artifact_builds)RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('direction','outgoing','document_type','other','title','Пакет ФИС ФРДО · '||upper(p.stream)||' · '||p.id::text,'document_date',to_char(p.created_at AT TIME ZONE'UTC','YYYY-MM-DD'),'declared_document_number',NULL,
 'source',jsonb_build_object('kind','frdo_packet_artifact','packet_id',p.id,'artifact_id',b.artifact_id,'snapshot_sha256',p.snapshot_sha256,'binding_sha256',b.artifact_ref->'binding_sha256'),
 'sender',jsonb_build_object('kind','organization','organization_id',p.organization_id),'recipient',jsonb_build_object('kind','external','entity_type','organization','name','ФИС ФРДО: пакет подготовлен, отправка учитывается отдельно','inn',NULL),
 'subject',jsonb_build_object('kind','none'),'context',jsonb_build_object('kind','frdo_packet','packet_id',p.id,'artifact_id',b.artifact_id,'snapshot_sha256',p.snapshot_sha256),'origin',jsonb_build_object('kind','org_document'),'notes','Регистрация файла пакета не подтверждает загрузку, принятие сведений ФИС ФРДО или проверенную электронную подпись.')$fn$;

CREATE FUNCTION public.uc_frdo_apply_direct(p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE org uuid;scope jsonb;actor uuid:=auth.uid();req uuid;a jsonb;kind text;p public.uc_frdo_packets;b public.uc_frdo_packet_artifact_builds;e public.uc_frdo_packet_events;pending public.uc_frdo_packet_requests;payload_hash text;v_receipt jsonb;data jsonb;registry_result jsonb;registry_record uuid;message_id uuid;prior_packet text;prior_actor text;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR actor IS NULL OR NOT public.uc_custom_journal_person(actor)OR NOT public.account_deletion_access_allowed()THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 IF NOT public.uc_frdo_shape(p_command,ARRAY['schema_version','abi_revision','organization_id','scope','request_id','action'])OR p_command->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_command->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_command->'organization_id')OR NOT public.uc_custom_journal_uuid(p_command->'request_id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 org:=(p_command->>'organization_id')::uuid;scope:=p_command->'scope';req:=(p_command->>'request_id')::uuid;a:=p_command->'action';kind:=a->>'kind';PERFORM public.uc_education_issue_scope(org,scope);
 IF NOT(CASE kind WHEN'register_packet'THEN public.uc_frdo_shape(a,ARRAY['kind','packet','artifact','expected_registry_preview_hash'])WHEN'record_admin_handover'THEN public.uc_frdo_shape(a,ARRAY['kind','packet','artifact','recipient','note'])ELSE false END)OR NOT public.uc_custom_journal_uuid(a->'packet'->'id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 payload_hash:=public.uc_frdo_hash(p_command);PERFORM public.uc_frdo_fence(ARRAY[actor],'request:'||actor::text||':'||req::text);
 SELECT *INTO pending FROM public.uc_frdo_packet_requests WHERE actor_id=actor AND request_id=req FOR UPDATE;
 IF pending.request_id IS NOT NULL THEN
  IF pending.organization_id IS DISTINCT FROM org OR pending.scope IS DISTINCT FROM scope OR pending.action_kind<>kind OR pending.payload_sha256 IS DISTINCT FROM payload_hash THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;
  PERFORM public.uc_frdo_packet_access((a->'packet'->>'id')::uuid,true);PERFORM public.uc_frdo_fence(pending.retained_people);RETURN jsonb_build_object('phase',pending.phase,'replayed',true,'receipt',pending.receipt);
 END IF;
 p:=public.uc_frdo_packet_current((a->'packet'->>'id')::uuid,true);PERFORM public.uc_frdo_fence(p.retained_people||ARRAY[actor],'packet:'||p.id::text);
 SELECT *INTO p FROM public.uc_frdo_packets WHERE id=p.id FOR UPDATE;
 IF p.organization_id IS DISTINCT FROM org OR p.scope IS DISTINCT FROM scope OR public.uc_frdo_packet_ref(p)IS DISTINCT FROM a->'packet'THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
 b:=public.uc_frdo_artifact_access(p.id,a->'artifact',true,true);
 IF p.state NOT IN('file_generated','administrative_handover_recorded')THEN PERFORM public.uc_frdo_error('ILLEGAL_TRANSITION');END IF;
 INSERT INTO public.uc_frdo_packet_requests(actor_id,request_id,organization_id,scope,action_kind,payload_sha256,phase,intent_refs,retained_people)VALUES(actor,req,org,scope,kind,payload_hash,'pending',jsonb_build_object('packet',a->'packet','artifact',a->'artifact'),ARRAY(SELECT DISTINCT value FROM unnest(p.retained_people||ARRAY[actor])value ORDER BY value));
 IF kind='register_packet'THEN
  IF b.registry_record_id IS NOT NULL THEN PERFORM public.uc_frdo_error('ILLEGAL_TRANSITION');END IF;
  data:=public.uc_frdo_registry_data(p,b);IF public.uc_frdo_hash(data)IS DISTINCT FROM a->>'expected_registry_preview_hash'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
  prior_packet:=current_setting('sintagma.frdo_registry_packet',true);prior_actor:=current_setting('sintagma.frdo_registry_actor',true);
  PERFORM set_config('sintagma.frdo_registry_packet',p.id::text,true);PERFORM set_config('sintagma.frdo_registry_actor',actor::text,true);
  BEGIN
   registry_result:=public.apply_document_registry_action(org,scope,0,req,jsonb_build_object('action','register','data',data,'reason','Регистрация точно сохранённого пакета ФИС ФРДО; отправка и принятие учитываются отдельно.'));
  EXCEPTION WHEN OTHERS THEN PERFORM set_config('sintagma.frdo_registry_packet',coalesce(prior_packet,''),true);PERFORM set_config('sintagma.frdo_registry_actor',coalesce(prior_actor,''),true);RAISE;END;
  PERFORM set_config('sintagma.frdo_registry_packet',coalesce(prior_packet,''),true);PERFORM set_config('sintagma.frdo_registry_actor',coalesce(prior_actor,''),true);
  SELECT r.id INTO registry_record FROM public.uc_document_registry_records r WHERE r.organization_id=org AND r.data->'source'->>'kind'='frdo_packet_artifact'AND r.data->'source'->>'artifact_id'=b.artifact_id::text;
  IF registry_record IS NULL THEN PERFORM public.uc_frdo_error('DEPENDENCY_UNAVAILABLE');END IF;
  UPDATE public.uc_frdo_packet_artifact_builds SET registry_record_id=registry_record WHERE id=b.id;UPDATE public.uc_frdo_packets SET latest_registry_record_id=registry_record WHERE id=p.id;
  e:=public.uc_frdo_append_event(p.id,'registry_recorded',jsonb_build_object('artifact',b.artifact_ref,'registry_record_id',registry_record),p.state);
 ELSE
  IF a->>'recipient'IS DISTINCT FROM'platform_administrator'OR NOT public.uc_document_registry_text(a->'note',2000)THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  -- Only an opaque authenticated application link enters the common inbox. No
  -- private object URL, signed URL, pupil identifiers, SNILS or free-text note.
  INSERT INTO public.admin_org_messages(organization_id,sender_user_id,sender_role,content)VALUES(org,actor,'organization','Подготовлен пакет ФИС ФРДО. Проверка прав и всех участников выполняется при открытии: /organization?tab=frdo&packet='||p.id::text)RETURNING id INTO message_id;
  e:=public.uc_frdo_append_event(p.id,'admin_handover',jsonb_build_object('artifact',b.artifact_ref,'message_id',message_id,'note',a->'note'),'administrative_handover_recorded');UPDATE public.uc_frdo_packets SET latest_admin_handover_event_id=e.id WHERE id=p.id;
 END IF;
 v_receipt:=jsonb_build_object('request_id',req,'action_kind',kind,'packet_ids',jsonb_build_array(p.id),'supplement_ids','[]'::jsonb,'authority_ids','[]'::jsonb,'event_ids',jsonb_build_array(e.id),'payload_sha256',payload_hash,'recorded_at',e.recorded_at);
 UPDATE public.uc_frdo_packet_requests r SET phase='committed',receipt=v_receipt WHERE r.actor_id=actor AND r.request_id=req;RETURN jsonb_build_object('phase','committed','replayed',false,'receipt',v_receipt);
END;$fn$;

CREATE FUNCTION public.uc_frdo_receipt_state(p_rows jsonb,p_receipt jsonb)RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE item jsonb;matching jsonb;seen text[]:='{}';accepted integer:=0;rejected integer:=0;unresolved integer:=0;
BEGIN
 IF NOT public.uc_frdo_shape(p_receipt,ARRAY['upload_event_id','submission_id','receipt_evidence','received_at','recording_method','outcomes','operator_note'])OR p_receipt->>'recording_method'IS DISTINCT FROM'authorized_operator_transcription'OR NOT public.uc_custom_journal_uuid(p_receipt->'upload_event_id')OR NOT public.uc_document_registry_text(p_receipt->'submission_id',300)OR NOT public.uc_document_registry_text(p_receipt->'operator_note',4000)OR jsonb_typeof(p_receipt->'outcomes')IS DISTINCT FROM'array'OR jsonb_array_length(p_receipt->'outcomes')IS DISTINCT FROM jsonb_array_length(p_rows)OR jsonb_array_length(p_rows)NOT BETWEEN 1 AND 1000 THEN PERFORM public.uc_frdo_error('RECEIPT_MISMATCH');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_receipt->'outcomes')LOOP
  IF item->>'row_key'=ANY(seen)THEN PERFORM public.uc_frdo_error('RECEIPT_MISMATCH');END IF;seen:=array_append(seen,item->>'row_key');
  SELECT value INTO matching FROM jsonb_array_elements(p_rows)WHERE value->'row_key'=item->'row_key'AND value->'row_sha256'=item->'row_sha256'AND value->'record'->'record_id'=item->'record_id';
  IF matching IS NULL THEN PERFORM public.uc_frdo_error('RECEIPT_MISMATCH');END IF;
  IF item->>'outcome'='accepted'AND public.uc_frdo_shape(item,ARRAY['row_key','row_sha256','record_id','outcome','external_record_reference'])AND(item->'external_record_reference'='null'::jsonb OR public.uc_document_registry_text(item->'external_record_reference',300))THEN accepted:=accepted+1;
  ELSIF item->>'outcome'='rejected'AND public.uc_frdo_shape(item,ARRAY['row_key','row_sha256','record_id','outcome','external_error_code','message'])AND(item->'external_error_code'='null'::jsonb OR public.uc_document_registry_text(item->'external_error_code',100))AND public.uc_document_registry_text(item->'message',2000)THEN rejected:=rejected+1;
  ELSIF item->>'outcome'='unresolved'AND public.uc_frdo_shape(item,ARRAY['row_key','row_sha256','record_id','outcome','message'])AND public.uc_document_registry_text(item->'message',2000)THEN unresolved:=unresolved+1;
  ELSE PERFORM public.uc_frdo_error('RECEIPT_MISMATCH');END IF;
 END LOOP;
 RETURN CASE WHEN unresolved>0 THEN'receipt_unresolved'WHEN accepted=jsonb_array_length(p_rows)THEN'accepted'WHEN rejected=jsonb_array_length(p_rows)THEN'rejected'ELSE'partially_rejected'END;
END;$fn$;

CREATE FUNCTION public.uc_frdo_begin_evidenced_action(p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE actor uuid:=auth.uid();org uuid;scope jsonb;req uuid;a jsonb;kind text;pending public.uc_frdo_packet_requests;payload_hash text;people uuid[]:=ARRAY[auth.uid()];sources jsonb:='[]';proof jsonb;authorized jsonb;person uuid;p public.uc_frdo_packets;b public.uc_frdo_packet_artifact_builds;authority public.uc_frdo_operator_authority_revisions;old_authority public.uc_frdo_operator_authority_revisions;upload public.uc_frdo_packet_events;operation jsonb;row jsonb;now_at timestamptz:=clock_timestamp();
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR actor IS NULL OR NOT public.uc_custom_journal_person(actor)OR NOT public.account_deletion_access_allowed()THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 IF NOT public.uc_frdo_shape(p_command,ARRAY['schema_version','abi_revision','organization_id','scope','request_id','action'])OR p_command->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_command->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_command->'organization_id')OR NOT public.uc_custom_journal_uuid(p_command->'request_id')OR octet_length(p_command::text)>8000000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 org:=(p_command->>'organization_id')::uuid;scope:=p_command->'scope';req:=(p_command->>'request_id')::uuid;a:=p_command->'action';kind:=a->>'kind';PERFORM public.uc_education_issue_scope(org,scope);
 IF NOT public.uc_document_has_action(org,'read')OR NOT public.uc_document_has_action(org,'write')THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF NOT(CASE kind WHEN'appoint_operator'THEN public.uc_frdo_shape(a,ARRAY['kind','operator_user_id','previous','validity','evidence','note'])WHEN'revoke_operator'THEN public.uc_frdo_shape(a,ARRAY['kind','authority','evidence','reason'])WHEN'record_fis_upload'THEN public.uc_frdo_shape(a,ARRAY['kind','packet','artifact','authority','submission_id','occurred_at','evidence','external_operations'])WHEN'record_receipt'THEN public.uc_frdo_shape(a,ARRAY['kind','packet','authority','receipt'])ELSE false END)THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 payload_hash:=public.uc_frdo_hash(p_command);PERFORM public.uc_frdo_fence(people,'request:'||actor::text||':'||req::text);
 SELECT *INTO pending FROM public.uc_frdo_packet_requests WHERE actor_id=actor AND request_id=req FOR UPDATE;
 IF pending.request_id IS NOT NULL AND(pending.organization_id IS DISTINCT FROM org OR pending.scope IS DISTINCT FROM scope OR pending.action_kind<>kind OR pending.payload_sha256 IS DISTINCT FROM payload_hash)THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;
 IF pending.phase='committed'THEN
  PERFORM public.uc_frdo_fence(pending.retained_people);
  IF kind IN('appoint_operator','revoke_operator')AND(scope->>'kind'<>'organization'OR public.uc_document_teacher_limited(org)OR NOT public.uc_document_action_allowed(org,'write',NULL,NULL))THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
  FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(pending.receipt->'packet_ids')LOOP p:=public.uc_frdo_packet_access(person,true);IF p.organization_id IS DISTINCT FROM org OR p.scope IS DISTINCT FROM scope THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;END LOOP;
  FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(pending.receipt->'authority_ids')LOOP SELECT *INTO authority FROM public.uc_frdo_operator_authority_revisions WHERE id=person AND organization_id=org ORDER BY revision DESC LIMIT 1;IF authority.id IS NULL THEN PERFORM public.uc_frdo_error('SOURCE_UNAVAILABLE');END IF;PERFORM public.uc_frdo_fence(authority.retained_people);END LOOP;
  RETURN jsonb_build_object('phase','committed','actor_id',actor,'request_id',req,'payload_sha256',payload_hash,'receipt',pending.receipt);
 END IF;
 IF kind IN('appoint_operator','revoke_operator')THEN
  IF scope->>'kind'<>'organization'OR public.uc_document_teacher_limited(org)OR NOT public.uc_document_action_allowed(org,'write',NULL,NULL)THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
  IF kind='appoint_operator'THEN
   IF NOT public.uc_custom_journal_uuid(a->'operator_user_id')OR NOT public.uc_custom_journal_person((a->>'operator_user_id')::uuid)OR NOT public.uc_education_actor_org_permission((a->>'operator_user_id')::uuid,org,'documents.read')OR NOT public.uc_education_actor_org_permission((a->>'operator_user_id')::uuid,org,'documents.write')OR NOT public.uc_document_registry_text(a->'note',2000)THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
   people:=array_append(people,(a->>'operator_user_id')::uuid);
   IF NOT(public.uc_frdo_shape(a->'validity',ARRAY['kind','from'])AND a->'validity'->>'kind'='explicit_open_end'OR public.uc_frdo_shape(a->'validity',ARRAY['kind','from','until'])AND a->'validity'->>'kind'='bounded')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
   BEGIN IF jsonb_typeof(a->'validity'->'from')IS DISTINCT FROM'string'OR(a->'validity'->>'from')::timestamptz IS NULL OR(a->'validity'->>'kind'='bounded'AND(jsonb_typeof(a->'validity'->'until')IS DISTINCT FROM'string'OR(a->'validity'->>'until')::timestamptz IS NULL OR(a->'validity'->>'until')::timestamptz<=(a->'validity'->>'from')::timestamptz))THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END;
   IF a->'previous'<>'null'::jsonb THEN
    IF NOT public.uc_custom_journal_uuid(a->'previous'->'id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
    SELECT *INTO old_authority FROM public.uc_frdo_operator_authority_revisions WHERE id=(a->'previous'->>'id')::uuid AND organization_id=org ORDER BY revision DESC LIMIT 1 FOR SHARE;
    IF old_authority.id IS NULL OR public.uc_frdo_authority_ref(old_authority)IS DISTINCT FROM a->'previous'OR old_authority.operator_user_id IS DISTINCT FROM(a->>'operator_user_id')::uuid THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;people:=people||old_authority.retained_people;
   END IF;
  ELSE
   IF NOT public.uc_custom_journal_uuid(a->'authority'->'id')OR NOT public.uc_document_registry_text(a->'reason',2000)THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
   SELECT *INTO old_authority FROM public.uc_frdo_operator_authority_revisions WHERE id=(a->'authority'->>'id')::uuid AND organization_id=org ORDER BY revision DESC LIMIT 1 FOR SHARE;
   IF old_authority.id IS NULL OR old_authority.state<>'active'OR public.uc_frdo_authority_ref(old_authority)IS DISTINCT FROM a->'authority'THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;people:=people||old_authority.retained_people;
  END IF;
 ELSE
  IF NOT public.uc_custom_journal_uuid(a->'packet'->'id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  p:=public.uc_frdo_packet_access((a->'packet'->>'id')::uuid,true);people:=people||p.retained_people;
  IF p.organization_id IS DISTINCT FROM org OR p.scope IS DISTINCT FROM scope THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
  authority:=public.uc_frdo_authority_current(org,a->'authority',true);people:=people||authority.retained_people;
 END IF;

 IF p.id IS NOT NULL THEN
  PERFORM public.uc_frdo_fence(people,'packet:'||p.id::text);SELECT *INTO p FROM public.uc_frdo_packets WHERE id=p.id FOR UPDATE;
  IF public.uc_frdo_packet_ref(p)IS DISTINCT FROM a->'packet'THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
  IF kind='record_fis_upload'THEN
   p:=public.uc_frdo_packet_current(p.id,true);b:=public.uc_frdo_artifact_access(p.id,a->'artifact',true,true);
   IF p.state NOT IN('file_generated','administrative_handover_recorded')OR NOT public.uc_document_registry_text(a->'submission_id',300)OR jsonb_typeof(a->'external_operations')IS DISTINCT FROM'array'OR jsonb_array_length(a->'external_operations')>1000 THEN PERFORM public.uc_frdo_error('ILLEGAL_TRANSITION');END IF;
   BEGIN IF jsonb_typeof(a->'occurred_at')IS DISTINCT FROM'string'OR(a->>'occurred_at')::timestamptz IS NULL OR(a->>'occurred_at')::timestamptz>now_at OR(a->>'occurred_at')::timestamptz<b.recorded_at THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END;
   FOR operation IN SELECT value FROM jsonb_array_elements(a->'external_operations')LOOP
    IF NOT public.uc_frdo_shape(operation,ARRAY['kind','record_id','original_record_id','external_reference','occurred_at','evidence','note'])OR operation->>'kind'NOT IN('remove_original_for_duplicate','amend_existing_external_record')OR NOT public.uc_document_registry_text(operation->'external_reference',300)OR NOT public.uc_document_registry_text(operation->'note',2000)THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
    SELECT value INTO row FROM jsonb_array_elements(p.capture->'mapped_batch'->'rows')WHERE value->'record'->'record_id'=operation->'record_id';
    IF jsonb_typeof(operation->'occurred_at')IS DISTINCT FROM'string'OR(operation->>'occurred_at')::timestamptz IS NULL OR row IS NULL OR row->'original_record'->'record_id'IS DISTINCT FROM operation->'original_record_id'OR(operation->>'occurred_at')::timestamptz>(a->>'occurred_at')::timestamptz THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
    sources:=public.uc_frdo_source_set_add(sources,operation->'evidence');
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p.capture->'mapped_batch'->'rows')r WHERE r.value->'original_record'<>'null'::jsonb AND 1<>(SELECT count(*)FROM jsonb_array_elements(a->'external_operations')op WHERE op->'record_id'=r.value->'record'->'record_id'AND op->'original_record_id'=r.value->'original_record'->'record_id'AND op->>'kind'='remove_original_for_duplicate'))THEN PERFORM public.uc_frdo_error('READINESS_BLOCKED');END IF;
  ELSE
   IF p.latest_upload_event_id IS NULL OR p.state NOT IN('fis_upload_recorded','receipt_unresolved')THEN PERFORM public.uc_frdo_error('ILLEGAL_TRANSITION');END IF;
   SELECT e.*INTO upload FROM public.uc_frdo_packet_events e WHERE e.packet_id=p.id AND e.id=p.latest_upload_event_id AND e.kind='fis_upload';
   IF upload.id IS NULL OR jsonb_typeof(a->'receipt'->'received_at')IS DISTINCT FROM'string'OR(a->'receipt'->>'received_at')::timestamptz IS NULL OR a->'receipt'->'upload_event_id'IS DISTINCT FROM to_jsonb(upload.id)OR a->'receipt'->'submission_id'IS DISTINCT FROM upload.payload->'submission_id'OR(a->'receipt'->>'received_at')::timestamptz<(upload.payload->>'occurred_at')::timestamptz OR(a->'receipt'->>'received_at')::timestamptz>now_at THEN PERFORM public.uc_frdo_error('RECEIPT_MISMATCH');END IF;
   PERFORM public.uc_frdo_receipt_state(p.capture->'mapped_batch'->'rows',a->'receipt');
  END IF;
 END IF;
 sources:=public.uc_frdo_source_set_add(sources,CASE WHEN kind='record_receipt'THEN a->'receipt'->'receipt_evidence'ELSE a->'evidence'END);
 FOR proof IN SELECT value FROM jsonb_array_elements(sources)LOOP
  authorized:=public.uc_document_registry_source(org,proof->'source',true,false);FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(authorized->'participants')LOOP people:=array_append(people,person);END LOOP;
 END LOOP;
 SELECT array_agg(DISTINCT value ORDER BY value)INTO people FROM unnest(people)value WHERE value IS NOT NULL;PERFORM public.uc_frdo_fence(people);
 IF pending.request_id IS NULL THEN INSERT INTO public.uc_frdo_packet_requests(actor_id,request_id,organization_id,scope,action_kind,payload_sha256,phase,intent_refs,retained_people)VALUES(actor,req,org,scope,kind,payload_hash,'pending',jsonb_build_object('packet',a->'packet','authority',a->'authority','operator_user_id',a->'operator_user_id','previous',a->'previous','source_refs',(SELECT jsonb_agg(value->'source'ORDER BY public.uc_frdo_canonical(value->'source')COLLATE"C")FROM jsonb_array_elements(sources))),people);
 ELSIF pending.retained_people IS DISTINCT FROM people THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('phase','pending','actor_id',actor,'request_id',req,'payload_sha256',payload_hash);
END;$fn$;


-- ASSEMBLED FRAGMENT 31_commit_evidenced.sql
-- A CLOSED service entry for these four evidenced organization facts only.
-- Original JWT begin -> exact pending actor/request/hash -> byte custody -> this
-- fixed transaction -> original current rights/CAS again. No arbitrary callback.
CREATE FUNCTION public.uc_frdo_commit_evidenced_action(p_value jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE prior_claims text;prior_sub text;prior_role text;claims jsonb;role_changed boolean:=false;actor uuid;org uuid;command jsonb;a jsonb;kind text;pending public.uc_frdo_packet_requests;begin_result jsonb;sources jsonb:='[]';proof jsonb;source_read jsonb;matches integer;p public.uc_frdo_packets;old_authority public.uc_frdo_operator_authority_revisions;new_authority public.uc_frdo_operator_authority_revisions;new_authority_id uuid;new_revision bigint;authority_body jsonb;recorded timestamptz;new_event uuid:=gen_random_uuid();payload jsonb;e public.uc_frdo_packet_events;new_state text;v_receipt jsonb;result jsonb;packet_ids jsonb:='[]';authority_ids jsonb:='[]';event_ids jsonb:='[]';
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 prior_claims:=current_setting('request.jwt.claims',true);prior_sub:=current_setting('request.jwt.claim.sub',true);prior_role:=current_setting('request.jwt.claim.role',true);
 IF prior_claims IS NULL OR prior_claims=''OR coalesce(prior_sub,'')<>''OR(prior_role IS NOT NULL AND prior_role NOT IN('','service_role'))THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 BEGIN claims:=prior_claims::jsonb;EXCEPTION WHEN OTHERS THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END;IF jsonb_typeof(claims)IS DISTINCT FROM'object'OR claims->>'role'IS DISTINCT FROM'service_role'THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_frdo_shape(p_value,ARRAY['schema_version','abi_revision','verified_actor_id','command','command_payload_sha256','source_reads'])OR p_value->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_value->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_value->'verified_actor_id')OR jsonb_typeof(p_value->'source_reads')IS DISTINCT FROM'array'OR octet_length(p_value::text)>8000000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 actor:=(p_value->>'verified_actor_id')::uuid;command:=p_value->'command';a:=command->'action';kind:=a->>'kind';
 IF kind NOT IN('appoint_operator','revoke_operator','record_fis_upload','record_receipt')OR NOT public.uc_custom_journal_uuid(command->'organization_id')OR NOT public.uc_custom_journal_uuid(command->'request_id')OR public.uc_frdo_hash(command)IS DISTINCT FROM p_value->>'command_payload_sha256'THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;
 org:=(command->>'organization_id')::uuid;PERFORM public.uc_frdo_fence(ARRAY[actor],'request:'||actor::text||':'||(command->>'request_id'));
 SELECT *INTO pending FROM public.uc_frdo_packet_requests WHERE actor_id=actor AND request_id=(command->>'request_id')::uuid FOR UPDATE;
 IF pending.request_id IS NULL OR pending.action_kind<>kind OR pending.payload_sha256 IS DISTINCT FROM p_value->>'command_payload_sha256'OR pending.organization_id IS DISTINCT FROM org OR pending.scope IS DISTINCT FROM command->'scope'THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);IF prior_role IS NOT NULL AND prior_role<>''THEN PERFORM set_config('request.jwt.claim.role','authenticated',true);role_changed:=true;END IF;
 BEGIN
  IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS DISTINCT FROM actor THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
  begin_result:=public.uc_frdo_begin_evidenced_action(command);
  IF begin_result->>'phase'='committed'THEN result:=jsonb_build_object('phase','committed','replayed',true,'receipt',begin_result->'receipt');
  ELSE
   sources:=public.uc_frdo_source_set_add(sources,CASE WHEN kind='record_receipt'THEN a->'receipt'->'receipt_evidence'ELSE a->'evidence'END);
   IF kind='record_fis_upload'THEN FOR proof IN SELECT value->'evidence'FROM jsonb_array_elements(a->'external_operations')LOOP sources:=public.uc_frdo_source_set_add(sources,proof);END LOOP;END IF;
   IF jsonb_array_length(sources)<>jsonb_array_length(p_value->'source_reads')THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
   FOR proof IN SELECT value FROM jsonb_array_elements(sources)LOOP
    SELECT count(*),jsonb_agg(value)->0 INTO matches,source_read FROM jsonb_array_elements(p_value->'source_reads')WHERE value->'source'=proof->'source';
    IF matches<>1 THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;PERFORM public.uc_frdo_source_live(org,proof,source_read,true);
   END LOOP;
   recorded:=clock_timestamp();
   IF kind IN('appoint_operator','revoke_operator')THEN
    IF kind='appoint_operator'AND a->'previous'='null'::jsonb THEN new_authority_id:=gen_random_uuid();new_revision:=1;
    ELSE
     new_authority_id:=(CASE WHEN kind='appoint_operator'THEN a->'previous'ELSE a->'authority'END->>'id')::uuid;
     PERFORM public.uc_frdo_fence(pending.retained_people,'authority:'||new_authority_id::text);
     SELECT *INTO old_authority FROM public.uc_frdo_operator_authority_revisions WHERE id=new_authority_id AND organization_id=org ORDER BY revision DESC LIMIT 1 FOR SHARE;
     IF old_authority.id IS NULL OR public.uc_frdo_authority_ref(old_authority)IS DISTINCT FROM(CASE WHEN kind='appoint_operator'THEN a->'previous'ELSE a->'authority'END)OR old_authority.revision>=9007199254740991 THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
     new_revision:=old_authority.revision+1;
    END IF;
    proof:=a->'evidence';SELECT value INTO source_read FROM jsonb_array_elements(p_value->'source_reads')WHERE value->'source'=proof->'source';
    authority_body:=jsonb_build_object('id',new_authority_id,'revision',new_revision,'organization_id',org,'operator_user_id',CASE WHEN kind='appoint_operator'THEN(a->>'operator_user_id')::uuid ELSE old_authority.operator_user_id END,'state',CASE WHEN kind='appoint_operator'THEN'active'ELSE'revoked'END,'validity',CASE WHEN kind='appoint_operator'THEN a->'validity'ELSE old_authority.validity END,'evidence',proof,'source_read',source_read,'previous_state_hash',old_authority.state_hash,'recorded_by',actor,'recorded_at',recorded,'external_delegation_verified',false,'note',CASE WHEN kind='appoint_operator'THEN a->'note'ELSE a->'reason'END,'revocation_event_id',CASE WHEN kind='revoke_operator'THEN new_event END);
    INSERT INTO public.uc_frdo_operator_authority_revisions(id,revision,organization_id,operator_user_id,state,validity,evidence,source_read,state_hash,previous_state_hash,recorded_by,recorded_at,note,revocation_event_id,retained_people)VALUES(new_authority_id,new_revision,org,(authority_body->>'operator_user_id')::uuid,authority_body->>'state',authority_body->'validity',proof,source_read,public.uc_frdo_hash(authority_body),old_authority.state_hash,actor,recorded,authority_body->>'note',CASE WHEN kind='revoke_operator'THEN new_event END,pending.retained_people)RETURNING*INTO new_authority;authority_ids:=jsonb_build_array(new_authority.id);
   ELSE
    p:=public.uc_frdo_packet_access((a->'packet'->>'id')::uuid,true);
    IF kind='record_fis_upload'THEN
     payload:=jsonb_build_object('artifact',a->'artifact','authority',a->'authority','submission_id',a->'submission_id','occurred_at',a->'occurred_at','evidence',a->'evidence','external_operations',a->'external_operations','recording_method','authorized_operator_transcription','external_origin_verified',false);new_state:='fis_upload_recorded';
     e:=public.uc_frdo_append_event(p.id,'fis_upload',payload,new_state,pending.retained_people,new_event);UPDATE public.uc_frdo_packets SET latest_upload_event_id=e.id WHERE id=p.id;
    ELSE
     payload:=jsonb_build_object('authority',a->'authority','receipt',((a->'receipt')-'receipt_evidence')||jsonb_build_object('event_id',new_event,'receipt_evidence',a->'receipt'->'receipt_evidence','recorded_at',recorded,'recorded_by',actor),'external_origin_verified',false);
     new_state:=public.uc_frdo_receipt_state(p.capture->'mapped_batch'->'rows',a->'receipt');
     e:=public.uc_frdo_append_event(p.id,'receipt_recorded',payload,new_state,pending.retained_people,new_event);UPDATE public.uc_frdo_packets SET latest_receipt_event_id=e.id WHERE id=p.id;
    END IF;
    packet_ids:=jsonb_build_array(p.id);event_ids:=jsonb_build_array(e.id);
   END IF;
   v_receipt:=jsonb_build_object('request_id',pending.request_id,'action_kind',kind,'packet_ids',packet_ids,'supplement_ids','[]'::jsonb,'authority_ids',authority_ids,'event_ids',event_ids,'payload_sha256',pending.payload_sha256,'recorded_at',recorded);
   UPDATE public.uc_frdo_packet_requests r SET phase='committed',receipt=v_receipt WHERE r.actor_id=actor AND r.request_id=pending.request_id;result:=jsonb_build_object('phase','committed','replayed',false,'receipt',v_receipt);
  END IF;
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims',prior_claims,true);IF role_changed THEN PERFORM set_config('request.jwt.claim.role',prior_role,true);END IF;
  IF current_setting('request.jwt.claims',true)IS DISTINCT FROM prior_claims OR current_setting('request.jwt.claim.sub',true)IS DISTINCT FROM prior_sub OR current_setting('request.jwt.claim.role',true)IS DISTINCT FROM prior_role THEN RAISE EXCEPTION'FRDO_PACKET_CLAIM_RESTORATION_FAILED';END IF;RAISE;
 END;
 PERFORM set_config('request.jwt.claims',prior_claims,true);IF role_changed THEN PERFORM set_config('request.jwt.claim.role',prior_role,true);END IF;
 IF current_setting('request.jwt.claims',true)IS DISTINCT FROM prior_claims OR current_setting('request.jwt.claim.sub',true)IS DISTINCT FROM prior_sub OR current_setting('request.jwt.claim.role',true)IS DISTINCT FROM prior_role THEN RAISE EXCEPTION'FRDO_PACKET_CLAIM_RESTORATION_FAILED';END IF;RETURN result;
END;$fn$;


-- ASSEMBLED FRAGMENT 32_correction_guard.sql
-- A correction is a NEW packet, never an edit of an accepted external row or the
-- previous sealed workbook. The rejected-row partition is authoritative history.
CREATE FUNCTION public.uc_frdo_correction_plan(p_org uuid,p_scope jsonb,p_plan jsonb,p_write boolean DEFAULT true)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
DECLARE p public.uc_frdo_packets;receipt_event public.uc_frdo_packet_events;replacement jsonb;row jsonb;outcome jsonb;bound jsonb;keys_seen text[]:='{}';records_seen uuid[]:='{}';people uuid[];record_id uuid;
BEGIN
 IF NOT public.uc_frdo_shape(p_plan,ARRAY['parent_job','receipt_event_id','replacements','reason'])OR NOT public.uc_custom_journal_uuid(p_plan->'parent_job'->'id')OR NOT public.uc_custom_journal_uuid(p_plan->'receipt_event_id')OR NOT public.uc_document_registry_text(p_plan->'reason',4000)OR jsonb_typeof(p_plan->'replacements')IS DISTINCT FROM'array'OR jsonb_array_length(p_plan->'replacements')NOT BETWEEN 1 AND 1000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 p:=public.uc_frdo_packet_access((p_plan->'parent_job'->>'id')::uuid,p_write);PERFORM public.uc_frdo_fence(p.retained_people||ARRAY[auth.uid()],'packet:'||p.id::text);SELECT *INTO p FROM public.uc_frdo_packets WHERE id=p.id FOR UPDATE;
 IF p.organization_id IS DISTINCT FROM p_org OR p.scope IS DISTINCT FROM p_scope OR public.uc_frdo_packet_ref(p)IS DISTINCT FROM p_plan->'parent_job'THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
 IF p.state NOT IN('partially_rejected','rejected')OR p.latest_receipt_event_id IS DISTINCT FROM(p_plan->>'receipt_event_id')::uuid THEN PERFORM public.uc_frdo_error('ILLEGAL_TRANSITION');END IF;
 SELECT *INTO receipt_event FROM public.uc_frdo_packet_events WHERE packet_id=p.id AND id=p.latest_receipt_event_id AND kind='receipt_recorded';
 IF receipt_event.id IS NULL OR public.uc_frdo_receipt_state(p.capture->'mapped_batch'->'rows',(receipt_event.payload->'receipt')-ARRAY['event_id','recorded_at','recorded_by'])IS DISTINCT FROM p.state THEN PERFORM public.uc_frdo_error('RECEIPT_MISMATCH');END IF;
 people:=p.retained_people||ARRAY[auth.uid()];
 FOR replacement IN SELECT value FROM jsonb_array_elements(p_plan->'replacements')LOOP
  IF NOT public.uc_frdo_shape(replacement,ARRAY['parent_row_key','record_id'])OR coalesce(replacement->>'parent_row_key','')!~'^[a-f0-9]{64}$'OR replacement->>'parent_row_key'=ANY(keys_seen)OR NOT public.uc_custom_journal_uuid(replacement->'record_id')OR(replacement->>'record_id')::uuid=ANY(records_seen)THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  keys_seen:=array_append(keys_seen,replacement->>'parent_row_key');record_id:=(replacement->>'record_id')::uuid;records_seen:=array_append(records_seen,record_id);
  SELECT value INTO row FROM jsonb_array_elements(p.capture->'mapped_batch'->'rows')WHERE value->'row_key'=replacement->'parent_row_key';
  SELECT value INTO outcome FROM jsonb_array_elements(receipt_event.payload->'receipt'->'outcomes')WHERE value->'row_key'=replacement->'parent_row_key';
  IF row IS NULL OR outcome->>'outcome'IS DISTINCT FROM'rejected'OR row->'row_sha256'IS DISTINCT FROM outcome->'row_sha256'OR row->'record'->'record_id'IS DISTINCT FROM outcome->'record_id'THEN PERFORM public.uc_frdo_error('ILLEGAL_TRANSITION');END IF;
  IF EXISTS(SELECT 1 FROM public.uc_frdo_packets child CROSS JOIN LATERAL jsonb_array_elements(child.parent_correction->'replacements')r WHERE child.organization_id=p_org AND child.state<>'correction_abandoned'AND child.parent_correction->'parent_job'->>'id'=p.id::text AND child.parent_correction->>'receipt_event_id'=receipt_event.id::text AND r->'parent_row_key'=replacement->'parent_row_key')THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
  bound:=public.uc_frdo_record_live(p_org,p_scope,record_id,true,p_write);
  IF bound->'ref'->'user_id'IS DISTINCT FROM row->'record'->'user_id'OR bound->'ref'->'enrollment_id'IS DISTINCT FROM row->'record'->'enrollment_id'OR bound->'ref'->'course_id'IS DISTINCT FROM row->'record'->'course_id'OR bound->'ref'->'group_id'IS DISTINCT FROM row->'record'->'group_id'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
  people:=array_append(people,(bound->'ref'->>'user_id')::uuid);
 END LOOP;
 SELECT array_agg(DISTINCT value ORDER BY value)INTO people FROM unnest(people)value;PERFORM public.uc_frdo_fence(people);
 RETURN jsonb_build_object('parent_packet_id',p.id,'stream',p.stream,'record_ids',(SELECT jsonb_agg(to_jsonb(value)ORDER BY value)FROM unnest(records_seen)value),'people',to_jsonb(people));
END;$fn$;


-- ASSEMBLED FRAGMENT 33_correction_freeze.sql
-- Fixed correction variants of the reviewed freeze boundary; exact pending original command is retained.
CREATE FUNCTION public.uc_frdo_begin_correction(p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE actor uuid:=auth.uid();org uuid;scope jsonb;v_request_id uuid;action jsonb;selection jsonb;issuer jsonb;payload_hash text;people uuid[]:=ARRAY[auth.uid()];ids uuid[]:='{}';record_id uuid;bound jsonb;original_bound jsonb;source_proof jsonb;supp public.uc_frdo_supplement_revisions;original_supp public.uc_frdo_supplement_revisions;item jsonb;person uuid;pending public.uc_frdo_packet_requests;packet_id uuid;parent_plan jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR actor IS NULL OR NOT public.uc_custom_journal_person(actor)OR NOT public.account_deletion_access_allowed()THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 IF NOT public.uc_frdo_shape(p_command,ARRAY['schema_version','abi_revision','organization_id','scope','request_id','action'])OR p_command->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_command->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_command->'organization_id')OR NOT public.uc_custom_journal_uuid(p_command->'request_id')OR octet_length(p_command::text)>8000000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 org:=(p_command->>'organization_id')::uuid;scope:=p_command->'scope';v_request_id:=(p_command->>'request_id')::uuid;action:=p_command->'action';PERFORM public.uc_education_issue_scope(org,scope);payload_hash:=public.uc_frdo_hash(p_command);PERFORM public.uc_frdo_fence(ARRAY[actor],'request:'||actor::text||':'||v_request_id::text);SELECT *INTO pending FROM public.uc_frdo_packet_requests r WHERE r.actor_id=actor AND r.request_id=v_request_id FOR UPDATE;IF pending.phase='committed'THEN IF pending.organization_id IS DISTINCT FROM org OR pending.scope IS DISTINCT FROM scope OR pending.action_kind<>'create_correction'OR pending.payload_sha256 IS DISTINCT FROM payload_hash THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;FOR packet_id IN SELECT value::uuid FROM jsonb_array_elements_text(pending.receipt->'packet_ids')value LOOP PERFORM public.uc_frdo_packet_access(packet_id,false);END LOOP;PERFORM public.uc_frdo_fence(pending.retained_people);RETURN jsonb_build_object('phase','committed','actor_id',actor,'request_id',v_request_id,'payload_sha256',payload_hash,'receipt',pending.receipt);END IF;parent_plan:=public.uc_frdo_correction_plan(org,scope,action->'plan',true);selection:=jsonb_build_object('stream',parent_plan->'stream','record_ids',parent_plan->'record_ids','template',action->'template');people:=people||ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(parent_plan->'people'));issuer:=action->'issuer_review';PERFORM public.uc_education_issue_scope(org,scope);
 IF NOT public.uc_document_has_action(org,'write')OR NOT public.uc_document_has_action(org,'read')THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_frdo_shape(action,ARRAY['kind','plan','template','expected_preview_hash','issuer_review'])OR action->>'kind'IS DISTINCT FROM'create_correction'OR coalesce(action->>'expected_preview_hash','')!~'^[a-f0-9]{64}$'OR NOT public.uc_frdo_shape(selection,ARRAY['stream','record_ids','template'])OR selection->'template'IS DISTINCT FROM public.uc_frdo_template(selection->>'stream')OR jsonb_typeof(selection->'record_ids')IS DISTINCT FROM'array'OR jsonb_array_length(selection->'record_ids')NOT BETWEEN 1 AND 1000 OR NOT public.uc_frdo_shape(issuer,ARRAY['regime','evidence','review_note'])OR issuer->>'regime'IS DISTINCT FROM'ordinary_rf'OR jsonb_typeof(issuer->'review_note')IS DISTINCT FROM'string'OR char_length(btrim(issuer->>'review_note'))NOT BETWEEN 1 AND 2000 THEN PERFORM public.uc_frdo_error('READINESS_BLOCKED');END IF;
 payload_hash:=public.uc_frdo_hash(p_command);PERFORM public.uc_frdo_fence(people,'request:'||actor::text||':'||v_request_id::text);
 SELECT *INTO pending FROM public.uc_frdo_packet_requests r WHERE r.actor_id=actor AND r.request_id=v_request_id FOR UPDATE;
 IF pending.request_id IS NOT NULL THEN
  IF pending.organization_id IS DISTINCT FROM org OR pending.scope IS DISTINCT FROM scope OR pending.action_kind<>'create_correction'OR pending.payload_sha256 IS DISTINCT FROM payload_hash THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;
  PERFORM public.uc_frdo_fence(pending.retained_people);
  IF pending.phase='committed'THEN
   FOR packet_id IN SELECT value::uuid FROM jsonb_array_elements_text(pending.receipt->'packet_ids')value LOOP PERFORM public.uc_frdo_packet_access(packet_id,false);END LOOP;
   RETURN jsonb_build_object('phase','committed','actor_id',actor,'request_id',v_request_id,'payload_sha256',payload_hash,'receipt',pending.receipt);
  END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(selection->'record_ids')ORDER BY value#>>'{}'LOOP
  IF NOT public.uc_custom_journal_uuid(item)OR(item#>>'{}')::uuid=ANY(ids)THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;record_id:=(item#>>'{}')::uuid;ids:=array_append(ids,record_id);
  bound:=public.uc_frdo_record_live(org,scope,record_id,true,true);people:=array_append(people,(bound->'ref'->>'user_id')::uuid);supp:=public.uc_frdo_supplement_current(org,record_id);people:=people||supp.retained_people;
  source_proof:=public.uc_document_registry_source(org,bound->'record'->'artifact'->'artifact'->'source',true,false);FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(source_proof->'participants')value LOOP people:=array_append(people,person);END LOOP;
  IF bound->'record'->>'original_record_id'IS NOT NULL THEN original_bound:=public.uc_frdo_record_live(org,scope,(bound->'record'->>'original_record_id')::uuid,false,true);people:=array_append(people,(original_bound->'ref'->>'user_id')::uuid);original_supp:=public.uc_frdo_supplement_current(org,(bound->'record'->>'original_record_id')::uuid);people:=people||original_supp.retained_people;source_proof:=public.uc_document_registry_source(org,original_bound->'record'->'artifact'->'artifact'->'source',true,false);FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(source_proof->'participants')value LOOP people:=array_append(people,person);END LOOP;END IF;
 END LOOP;
 source_proof:=public.uc_document_registry_source(org,issuer->'evidence',true,false);FOR person IN SELECT value::uuid FROM jsonb_array_elements_text(source_proof->'participants')value LOOP people:=array_append(people,person);END LOOP;
 SELECT array_agg(DISTINCT value ORDER BY value)INTO people FROM unnest(people)value;PERFORM public.uc_frdo_fence(people);
 IF pending.request_id IS NULL THEN
  INSERT INTO public.uc_frdo_packet_requests(actor_id,request_id,organization_id,scope,action_kind,payload_sha256,phase,intent_refs,retained_people)VALUES(actor,v_request_id,org,scope,'create_correction',payload_hash,'pending',jsonb_build_object('record_ids',to_jsonb(ids),'issuer_evidence',issuer->'evidence','expected_preview_hash',action->'expected_preview_hash','parent_job',action->'plan'->'parent_job','receipt_event_id',action->'plan'->'receipt_event_id'),people);
 ELSIF pending.retained_people IS DISTINCT FROM people OR pending.intent_refs IS DISTINCT FROM jsonb_build_object('record_ids',to_jsonb(ids),'issuer_evidence',issuer->'evidence','expected_preview_hash',action->'expected_preview_hash','parent_job',action->'plan'->'parent_job','receipt_event_id',action->'plan'->'receipt_event_id')THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('phase','pending','actor_id',actor,'request_id',v_request_id,'payload_sha256',payload_hash);
END;$fn$;

CREATE FUNCTION public.uc_frdo_commit_correction(p_value jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms'AS $fn$
DECLARE prior_claims text;prior_sub text;prior_role text;claims jsonb;role_changed boolean:=false;actor uuid;org uuid;scope jsonb;command jsonb;action jsonb;capture jsonb;source_reads jsonb;pending public.uc_frdo_packet_requests;resolved jsonb;preview_hash text;selected_ids jsonb;issuer_proof jsonb;issuer_projection jsonb;manifest_entry jsonb;people uuid[];new_packet uuid;new_event uuid;recorded timestamptz;payload jsonb;payload_hash text;state_hash text;result_receipt jsonb;result jsonb;begin_result jsonb;parent_plan jsonb;parent_event public.uc_frdo_packet_events;
BEGIN
 -- A projected call cannot nest: its role is authenticated and uid is non-NULL.
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 prior_claims:=current_setting('request.jwt.claims',true);prior_sub:=current_setting('request.jwt.claim.sub',true);prior_role:=current_setting('request.jwt.claim.role',true);
 IF prior_claims IS NULL OR prior_claims=''OR coalesce(prior_sub,'')<>''OR(prior_role IS NOT NULL AND prior_role NOT IN('','service_role'))THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 BEGIN claims:=prior_claims::jsonb;EXCEPTION WHEN OTHERS THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END;
 IF jsonb_typeof(claims)IS DISTINCT FROM'object'OR claims->>'role'IS DISTINCT FROM'service_role'THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_frdo_shape(p_value,ARRAY['schema_version','abi_revision','organization_id','scope','verified_actor_id','request_id','command_payload_sha256','expected_preview_hash','capture','correction','command','source_reads'])OR p_value->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_value->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_value->'verified_actor_id')OR NOT public.uc_custom_journal_uuid(p_value->'organization_id')OR NOT public.uc_custom_journal_uuid(p_value->'request_id')OR p_value->'correction'IS DISTINCT FROM p_value->'command'->'action'->'plan' OR octet_length(p_value::text)>8000000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 actor:=(p_value->>'verified_actor_id')::uuid;org:=(p_value->>'organization_id')::uuid;scope:=p_value->'scope';command:=p_value->'command';action:=command->'action';capture:=p_value->'capture';source_reads:=p_value->'source_reads';
 IF NOT public.uc_custom_journal_person(actor)OR command->'organization_id'IS DISTINCT FROM p_value->'organization_id'OR command->'scope'IS DISTINCT FROM scope OR command->'request_id'IS DISTINCT FROM p_value->'request_id'OR command->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR action->>'kind'IS DISTINCT FROM'create_correction'OR action->'expected_preview_hash'IS DISTINCT FROM p_value->'expected_preview_hash'OR public.uc_frdo_hash(command)IS DISTINCT FROM p_value->>'command_payload_sha256'THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;
 PERFORM public.uc_frdo_fence(ARRAY[actor],'request:'||actor::text||':'||(p_value->>'request_id'));
 SELECT *INTO pending FROM public.uc_frdo_packet_requests r WHERE r.actor_id=actor AND r.request_id=(p_value->>'request_id')::uuid FOR UPDATE;
 IF pending.request_id IS NULL OR pending.organization_id IS DISTINCT FROM org OR pending.scope IS DISTINCT FROM scope OR pending.action_kind<>'create_correction'OR pending.payload_sha256 IS DISTINCT FROM p_value->>'command_payload_sha256'THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 -- No new custom nesting GUC and no change to absent/empty legacy sub. Require a
 -- present claims object so exact prior raw settings can be restored, not NULL→''.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 IF prior_role IS NOT NULL AND prior_role<>''THEN PERFORM set_config('request.jwt.claim.role','authenticated',true);role_changed:=true;END IF;
 BEGIN
  IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS DISTINCT FROM actor THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
  begin_result:=public.uc_frdo_begin_correction(command);
  IF begin_result->>'phase'='committed'THEN
   result:=jsonb_build_object('schema_version',1,'abi_revision','uc020-persisted-v5','phase','committed','replayed',true,'actor_id',actor,'organization_id',org,'scope',scope,'receipt',begin_result->'receipt');
  ELSE
   PERFORM public.uc_frdo_mapped_integrity(capture,org,scope);
   parent_plan:=public.uc_frdo_correction_plan(org,scope,action->'plan',true);selected_ids:=parent_plan->'record_ids';
   IF selected_ids IS DISTINCT FROM(SELECT jsonb_agg(value->'record'->'record_id'ORDER BY value->'record'->>'record_id')FROM jsonb_array_elements(capture->'source_cas'->'records'))OR action->'template'IS DISTINCT FROM capture->'mapped_batch'->'context'->'template'OR parent_plan->'stream'IS DISTINCT FROM capture->'mapped_batch'->'context'->'stream'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
   preview_hash:=public.uc_frdo_hash(jsonb_build_object('schema_version',1,'abi_revision','uc020-persisted-v5','organization_id',org,'scope',scope,'actor_id',actor,'snapshot_sha256',capture->'snapshot_sha256','issuer_review',action->'issuer_review','correction',action->'plan'));
   IF preview_hash IS DISTINCT FROM p_value->>'expected_preview_hash'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
   resolved:=public.uc_frdo_capture_cas(org,scope,capture,source_reads,action->'issuer_review');
   SELECT array_agg(value::uuid ORDER BY value::uuid)INTO people FROM jsonb_array_elements_text(resolved->'people')value;
   SELECT array_agg(DISTINCT value ORDER BY value)INTO people FROM unnest(people||ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(parent_plan->'people')))value;
   IF people IS DISTINCT FROM pending.retained_people THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
   recorded:=clock_timestamp();new_packet:=gen_random_uuid();new_event:=gen_random_uuid();
   SELECT value INTO issuer_proof FROM jsonb_array_elements(capture->'source_cas'->'sources')WHERE value->'source'=action->'issuer_review'->'evidence';
   issuer_projection:=jsonb_build_object('fact_kind','operator_recorded_issuer_regime','regime','ordinary_rf','evidence',jsonb_build_object('availability','available','evidence',issuer_proof),'review_note',action->'issuer_review'->'review_note','recorded_by',actor,'recorded_at',recorded,'legal_policy_verified',false,'external_origin_verified',false);
   payload:=jsonb_build_object('snapshot_sha256',capture->'snapshot_sha256');payload_hash:=public.uc_frdo_hash(payload);
   state_hash:=public.uc_frdo_hash(jsonb_build_object('packet_id',new_packet,'revision',1,'previous_state_hash',NULL,'kind','preview_frozen','payload_sha256',payload_hash,'snapshot_sha256',capture->'snapshot_sha256','issuer_review',issuer_projection));
   INSERT INTO public.uc_frdo_packets(id,organization_id,scope,group_id,stream,revision,state_hash,state,capture,snapshot_sha256,source_reads,parent_correction,issuer_review,created_at,created_by,retained_people)VALUES(new_packet,org,scope,CASE WHEN scope->>'kind'='group'THEN(scope->>'group_id')::uuid ELSE NULL END,capture->'mapped_batch'->'context'->>'stream',1,state_hash,'preview_frozen',capture,capture->>'snapshot_sha256',source_reads,action->'plan',issuer_projection,recorded,actor,people);
   FOR manifest_entry IN SELECT value FROM jsonb_array_elements(resolved->'manifest')LOOP
    INSERT INTO public.uc_frdo_packet_subjects(packet_id,record_id,organization_id,group_id,user_id,enrollment_id,course_id,selected,original)VALUES(new_packet,(manifest_entry->>'record_id')::uuid,org,(manifest_entry->>'group_id')::uuid,(manifest_entry->>'user_id')::uuid,(manifest_entry->>'enrollment_id')::uuid,(manifest_entry->>'course_id')::uuid,(manifest_entry->>'selected')::boolean,(manifest_entry->>'original')::boolean);
   END LOOP;
   INSERT INTO public.uc_frdo_packet_events(id,organization_id,packet_id,revision,kind,actor_id,recorded_at,previous_state_hash,state_hash,payload_sha256,payload,retained_people)VALUES(new_event,org,new_packet,1,'preview_frozen',actor,recorded,NULL,state_hash,payload_hash,payload,people);
   parent_event:=public.uc_frdo_append_event((parent_plan->>'parent_packet_id')::uuid,'correction_created',jsonb_build_object('correction_packet_id',new_packet,'parent_receipt_event_id',action->'plan'->'receipt_event_id','row_keys',(SELECT jsonb_agg(value->'parent_row_key'ORDER BY value->>'parent_row_key')FROM jsonb_array_elements(action->'plan'->'replacements'))),(SELECT state FROM public.uc_frdo_packets WHERE id=(parent_plan->>'parent_packet_id')::uuid),people);
   result_receipt:=jsonb_build_object('request_id',pending.request_id,'action_kind','create_correction','packet_ids',jsonb_build_array((parent_plan->>'parent_packet_id')::uuid,new_packet),'supplement_ids','[]'::jsonb,'authority_ids','[]'::jsonb,'event_ids',jsonb_build_array(new_event,parent_event.id),'payload_sha256',pending.payload_sha256,'recorded_at',recorded);
   UPDATE public.uc_frdo_packet_requests r SET phase='committed',receipt=result_receipt WHERE r.actor_id=actor AND r.request_id=pending.request_id;
   result:=jsonb_build_object('schema_version',1,'abi_revision','uc020-persisted-v5','phase','committed','replayed',false,'actor_id',actor,'organization_id',org,'scope',scope,'receipt',result_receipt);
  END IF;
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims',prior_claims,true);IF role_changed THEN PERFORM set_config('request.jwt.claim.role',prior_role,true);END IF;
  IF current_setting('request.jwt.claims',true)IS DISTINCT FROM prior_claims OR current_setting('request.jwt.claim.sub',true)IS DISTINCT FROM prior_sub OR current_setting('request.jwt.claim.role',true)IS DISTINCT FROM prior_role THEN RAISE EXCEPTION 'FRDO_PACKET_CLAIM_RESTORATION_FAILED';END IF;
  RAISE;
 END;
 PERFORM set_config('request.jwt.claims',prior_claims,true);IF role_changed THEN PERFORM set_config('request.jwt.claim.role',prior_role,true);END IF;
 IF current_setting('request.jwt.claims',true)IS DISTINCT FROM prior_claims OR current_setting('request.jwt.claim.sub',true)IS DISTINCT FROM prior_sub OR current_setting('request.jwt.claim.role',true)IS DISTINCT FROM prior_role THEN RAISE EXCEPTION 'FRDO_PACKET_CLAIM_RESTORATION_FAILED';END IF;
 RETURN result;
END;$fn$;


-- ASSEMBLED FRAGMENT 34_abandon_correction.sql
-- Explicit recovery for an unsubmitted correction whose immutable source CAS is
-- obsolete. No old capture/file/history is rewritten or physically erased.
CREATE FUNCTION public.uc_frdo_abandon_correction(p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE actor uuid:=auth.uid();org uuid;scope jsonb;req uuid;a jsonb;p public.uc_frdo_packets;parent public.uc_frdo_packets;pending public.uc_frdo_packet_requests;e public.uc_frdo_packet_events;payload_hash text;v_receipt jsonb;people uuid[];
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR actor IS NULL OR NOT public.uc_custom_journal_person(actor)OR NOT public.account_deletion_access_allowed()THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 IF NOT public.uc_frdo_shape(p_command,ARRAY['schema_version','abi_revision','organization_id','scope','request_id','action'])OR p_command->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_command->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_command->'organization_id')OR NOT public.uc_custom_journal_uuid(p_command->'request_id')OR NOT public.uc_frdo_shape(p_command->'action',ARRAY['kind','packet','reason'])OR p_command->'action'->>'kind'IS DISTINCT FROM'abandon_correction'OR NOT public.uc_custom_journal_uuid(p_command->'action'->'packet'->'id')OR NOT public.uc_document_registry_text(p_command->'action'->'reason',4000)THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 org:=(p_command->>'organization_id')::uuid;scope:=p_command->'scope';req:=(p_command->>'request_id')::uuid;a:=p_command->'action';PERFORM public.uc_education_issue_scope(org,scope);payload_hash:=public.uc_frdo_hash(p_command);PERFORM public.uc_frdo_fence(ARRAY[actor],'request:'||actor::text||':'||req::text);
 SELECT *INTO pending FROM public.uc_frdo_packet_requests WHERE actor_id=actor AND request_id=req FOR UPDATE;
 p:=public.uc_frdo_packet_access((a->'packet'->>'id')::uuid,true);
 IF p.organization_id IS DISTINCT FROM org OR p.scope IS DISTINCT FROM scope OR p.parent_correction IS NULL THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 parent:=public.uc_frdo_packet_access((p.parent_correction->'parent_job'->>'id')::uuid,true);people:=p.retained_people||parent.retained_people||ARRAY[actor];
 IF pending.request_id IS NOT NULL THEN
  IF pending.organization_id IS DISTINCT FROM org OR pending.scope IS DISTINCT FROM scope OR pending.action_kind<>'abandon_correction'OR pending.payload_sha256 IS DISTINCT FROM payload_hash THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;PERFORM public.uc_frdo_fence(pending.retained_people);RETURN jsonb_build_object('phase',pending.phase,'replayed',true,'receipt',pending.receipt);
 END IF;
 PERFORM public.uc_frdo_fence(people,'packet:'||parent.id::text);PERFORM public.uc_frdo_fence(people,'packet:'||p.id::text);SELECT *INTO p FROM public.uc_frdo_packets WHERE id=p.id FOR UPDATE;
 IF public.uc_frdo_packet_ref(p)IS DISTINCT FROM a->'packet'THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
 IF p.state NOT IN('preview_frozen','file_generating','file_generation_failed','file_generated','administrative_handover_recorded')OR p.latest_upload_event_id IS NOT NULL OR p.latest_receipt_event_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.uc_frdo_packet_events WHERE packet_id=p.id AND kind IN('fis_upload','receipt_recorded'))THEN PERFORM public.uc_frdo_error('ILLEGAL_TRANSITION');END IF;
 SELECT array_agg(DISTINCT value ORDER BY value)INTO people FROM unnest(people)value;
 INSERT INTO public.uc_frdo_packet_requests(actor_id,request_id,organization_id,scope,action_kind,payload_sha256,phase,intent_refs,retained_people)VALUES(actor,req,org,scope,'abandon_correction',payload_hash,'pending',jsonb_build_object('packet',a->'packet','parent_packet_id',parent.id),people);
 e:=public.uc_frdo_append_event(p.id,'correction_abandoned',jsonb_build_object('parent_packet_id',parent.id,'reason',a->'reason','external_operation_verified',false),'correction_abandoned',people);
 v_receipt:=jsonb_build_object('request_id',req,'action_kind','abandon_correction','packet_ids',jsonb_build_array(p.id),'supplement_ids','[]'::jsonb,'authority_ids','[]'::jsonb,'event_ids',jsonb_build_array(e.id),'payload_sha256',payload_hash,'recorded_at',e.recorded_at);
 UPDATE public.uc_frdo_packet_requests r SET phase='committed',receipt=v_receipt WHERE r.actor_id=actor AND r.request_id=req;RETURN jsonb_build_object('phase','committed','replayed',false,'receipt',v_receipt);
END;$fn$;


-- ASSEMBLED FRAGMENT 40_registry_privacy.sql
-- SOURCE ONLY: additive UC018 / exact K integration for UC020. No BEGIN/COMMIT,
-- ledger, privilege grants or existing-data mutation. Assemble after packet helpers.
-- Historical reads use the exact sealed artifact plus ALL stored subjects. New
-- registration requires the current CAS and the caller's narrow dispatcher gate.
CREATE FUNCTION public.uc_frdo_registry_source(p_org uuid,p_ref jsonb,p_lock boolean DEFAULT false)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE packet public.uc_frdo_packets;b public.uc_frdo_packet_artifact_builds;people uuid[];groups uuid[];
BEGIN
 IF NOT public.uc_frdo_shape(p_ref,ARRAY['kind','packet_id','artifact_id','snapshot_sha256','binding_sha256'])OR p_ref->>'kind'IS DISTINCT FROM'frdo_packet_artifact'OR NOT public.uc_custom_journal_uuid(p_ref->'packet_id')OR NOT public.uc_custom_journal_uuid(p_ref->'artifact_id')OR coalesce(p_ref->>'snapshot_sha256','')!~'^[a-f0-9]{64}$'OR coalesce(p_ref->>'binding_sha256','')!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_document_registry_error('SOURCE_UNAVAILABLE');END IF;
 packet:=public.uc_frdo_packet_access((p_ref->>'packet_id')::uuid,false);
 IF packet.organization_id IS DISTINCT FROM p_org OR packet.snapshot_sha256 IS DISTINCT FROM p_ref->>'snapshot_sha256'THEN PERFORM public.uc_document_registry_error('SOURCE_UNAVAILABLE');END IF;
 SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE packet_id=packet.id AND artifact_id=(p_ref->>'artifact_id')::uuid AND organization_id=p_org AND phase='sealed'AND snapshot_sha256=packet.snapshot_sha256;
 IF b.id IS NULL OR b.artifact_ref->>'binding_sha256'IS DISTINCT FROM p_ref->>'binding_sha256'THEN PERFORM public.uc_document_registry_error('SOURCE_UNAVAILABLE');END IF;
 IF p_lock THEN
  IF current_setting('sintagma.frdo_registry_packet',true)IS DISTINCT FROM packet.id::text OR current_setting('sintagma.frdo_registry_actor',true)IS DISTINCT FROM auth.uid()::text THEN PERFORM public.uc_document_registry_error('ACCESS_DENIED');END IF;
  packet:=public.uc_frdo_packet_current(packet.id,true);
 END IF;
 b:=public.uc_frdo_artifact_access(packet.id,b.artifact_ref,p_lock,p_lock);
 -- The helper re-reads current permissions and exact immutable Storage identity.
 SELECT coalesce(array_agg(DISTINCT person ORDER BY person),'{}')INTO people FROM(SELECT user_id person FROM public.uc_frdo_packet_subjects WHERE packet_id=packet.id UNION SELECT unnest(packet.retained_people))all_people WHERE person IS NOT NULL;
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}')INTO groups FROM(SELECT group_id id FROM public.uc_frdo_packet_subjects WHERE packet_id=packet.id UNION SELECT packet.group_id)all_groups WHERE id IS NOT NULL;
 PERFORM public.uc_frdo_fence(people);
 RETURN jsonb_build_object('participants',to_jsonb(people),'groups',to_jsonb(groups),'label','Пакет ФРДО · '||packet.id::text,'verified',true,'artifact',b.artifact_ref,'file',jsonb_build_object('kind','frdo_packet_artifact','bucket',b.bucket_id,'path',b.object_path,'artifact_id',b.artifact_id,'proof_hash',b.byte_sha256,'file_name','frdo-'||packet.id::text||'.xlsx','mime',b.mime,'size',b.byte_size));
END;$fn$;
CREATE FUNCTION public.uc_frdo_registry_snapshot_guard(p_org uuid,p_snapshot jsonb)RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE data jsonb:=p_snapshot->'data';src jsonb;ctx jsonb;proof jsonb;
BEGIN
 src:=data->'source';ctx:=data->'context';
 IF src->>'kind'='frdo_packet_artifact'OR ctx->>'kind'='frdo_packet'THEN
  IF src->>'kind'IS DISTINCT FROM'frdo_packet_artifact'OR NOT public.uc_frdo_shape(ctx,ARRAY['kind','packet_id','artifact_id','snapshot_sha256'])OR ctx->>'kind'IS DISTINCT FROM'frdo_packet'OR ctx->>'packet_id'IS DISTINCT FROM src->>'packet_id'OR ctx->>'artifact_id'IS DISTINCT FROM src->>'artifact_id'OR ctx->>'snapshot_sha256'IS DISTINCT FROM src->>'snapshot_sha256'THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
  proof:=public.uc_frdo_registry_source(p_org,src,false);
 END IF;
 RETURN true;
END;$fn$;
CREATE FUNCTION public.uc_frdo_registry_context(p_org uuid,p_group uuid,p_subject jsonb,p_context jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE packet public.uc_frdo_packets;b public.uc_frdo_packet_artifact_builds;proof jsonb;src jsonb;binding jsonb;
BEGIN
 IF NOT public.uc_frdo_shape(p_context,ARRAY['kind','packet_id','artifact_id','snapshot_sha256'])OR p_context->>'kind'IS DISTINCT FROM'frdo_packet'OR NOT public.uc_custom_journal_uuid(p_context->'packet_id')OR NOT public.uc_custom_journal_uuid(p_context->'artifact_id')OR coalesce(p_context->>'snapshot_sha256','')!~'^[a-f0-9]{64}$'OR p_subject IS DISTINCT FROM jsonb_build_object('kind','none')THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
 packet:=public.uc_frdo_packet_access((p_context->>'packet_id')::uuid,false);
 IF packet.organization_id IS DISTINCT FROM p_org OR packet.snapshot_sha256 IS DISTINCT FROM p_context->>'snapshot_sha256'OR p_group IS NOT NULL AND p_group IS DISTINCT FROM packet.group_id THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
 SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE packet_id=packet.id AND artifact_id=(p_context->>'artifact_id')::uuid AND phase='sealed'AND organization_id=p_org;
 IF b.id IS NULL THEN PERFORM public.uc_document_registry_error('SOURCE_UNAVAILABLE');END IF;
 src:=jsonb_build_object('kind','frdo_packet_artifact','packet_id',packet.id,'artifact_id',b.artifact_id,'snapshot_sha256',packet.snapshot_sha256,'binding_sha256',b.artifact_ref->>'binding_sha256');proof:=public.uc_frdo_registry_source(p_org,src,false);
 binding:=jsonb_build_object('kind','frdo_packet','organization_id',p_org,'packet_id',packet.id,'artifact_id',b.artifact_id,'snapshot_sha256',packet.snapshot_sha256,'binding_hash',b.artifact_ref->>'binding_sha256','scope_group_id',p_group);
 RETURN jsonb_build_object('binding',binding,'context',p_context,'participants',proof->'participants','groups',proof->'groups','label',proof->'label');
END;$fn$;
CREATE FUNCTION public.uc_frdo_registry_subject(p_org uuid,p_source jsonb,p_user uuid)RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT CASE WHEN p_source->>'kind'='frdo_packet_artifact'AND public.uc_custom_journal_uuid(p_source->'packet_id')THEN EXISTS(SELECT 1 FROM public.uc_frdo_packet_subjects s WHERE s.packet_id=(p_source->>'packet_id')::uuid AND s.organization_id=p_org AND s.user_id=p_user)ELSE false END$fn$;
CREATE FUNCTION public.uc_frdo_personal_counts(p_user uuid)RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',t,'column','retained_frdo_copy_review_required','count',n)ORDER BY t),'[]'::jsonb)FROM(
 SELECT'uc_frdo_supplement_revisions'::text t,count(*)n FROM public.uc_frdo_supplement_revisions r WHERE r.user_id=p_user OR r.reviewed_by=p_user OR p_user=ANY(r.retained_people)
 UNION ALL SELECT'uc_frdo_packets',count(*)FROM public.uc_frdo_packets p WHERE p.created_by=p_user OR p_user=ANY(p.retained_people)
 UNION ALL SELECT'uc_frdo_packet_subjects',count(*)FROM public.uc_frdo_packet_subjects s WHERE s.user_id=p_user OR EXISTS(SELECT 1 FROM public.uc_frdo_packets p WHERE p.id=s.packet_id AND p_user=ANY(p.retained_people))
 UNION ALL SELECT'uc_frdo_packet_artifact_builds',count(*)FROM public.uc_frdo_packet_artifact_builds b WHERE b.actor_id=p_user OR p_user=ANY(b.retained_people)
 UNION ALL SELECT'uc_frdo_packet_events',count(*)FROM public.uc_frdo_packet_events e WHERE e.actor_id=p_user OR p_user=ANY(e.retained_people)
 UNION ALL SELECT'uc_frdo_packet_requests',count(*)FROM public.uc_frdo_packet_requests q WHERE q.actor_id=p_user OR p_user=ANY(q.retained_people)
 UNION ALL SELECT'uc_frdo_operator_authority_revisions',count(*)FROM public.uc_frdo_operator_authority_revisions a WHERE a.operator_user_id=p_user OR a.recorded_by=p_user OR p_user=ANY(a.retained_people)
 )counts WHERE n>0$fn$;
CREATE FUNCTION public.uc_frdo_retention_block(p_user uuid)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR current_setting('sintagma.account_deletion_erase_user',true)IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_user::text,42007))THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
 IF public.uc_frdo_personal_counts(p_user)<>'[]'::jsonb THEN RAISE EXCEPTION 'FRDO_PACKET_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
END;$fn$;
CREATE FUNCTION public.uc_frdo_storage_object_can_read(p_object storage.objects)RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE b public.uc_frdo_packet_artifact_builds;checked public.uc_frdo_packet_artifact_builds;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR p_object.bucket_id IS DISTINCT FROM'frdo-packet-artifacts'THEN RETURN false;END IF;
 SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE bucket_id=p_object.bucket_id AND object_path=p_object.name AND object_id=p_object.id AND object_updated_at=p_object.updated_at AND phase='sealed';
 IF b.id IS NULL THEN RETURN false;END IF;
 checked:=public.uc_frdo_artifact_access(b.packet_id,b.artifact_ref,false,false);
 RETURN checked.id=b.id AND checked.organization_id=b.organization_id AND checked.object_id=p_object.id AND checked.object_updated_at=p_object.updated_at AND checked.object_path=p_object.name AND checked.byte_sha256=checked.readback_sha256 AND checked.byte_size BETWEEN 1 AND 20971520 AND p_object.metadata->>'mimetype'=checked.mime AND p_object.metadata->>'size'=checked.byte_size::text;
 EXCEPTION WHEN SQLSTATE'PT400'OR SQLSTATE'PT401'OR SQLSTATE'PT403'OR SQLSTATE'PT409'OR SQLSTATE'PT503'OR lock_not_available OR serialization_failure OR deadlock_detected THEN RETURN false;
END;$fn$;
CREATE FUNCTION public.uc_frdo_artifact_object_immutable()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF OLD.bucket_id='frdo-packet-artifacts'OR(TG_OP='UPDATE'AND NEW.bucket_id='frdo-packet-artifacts')THEN
  IF TG_OP='UPDATE'AND(to_jsonb(OLD)-ARRAY['last_accessed_at','updated_at','path_tokens'])IS NOT DISTINCT FROM(to_jsonb(NEW)-ARRAY['last_accessed_at','updated_at','path_tokens'])THEN NEW.updated_at:=OLD.updated_at;RETURN NEW;END IF;
  RAISE EXCEPTION 'FRDO_PACKET_ARTIFACT_IMMUTABLE_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;
END;$fn$;

CREATE FUNCTION public.uc_frdo_artifact_bucket_immutable()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF OLD.id='frdo-packet-artifacts'OR(TG_OP='UPDATE'AND NEW.id='frdo-packet-artifacts')THEN RAISE EXCEPTION 'FRDO_PACKET_ARTIFACT_BUCKET_IMMUTABLE_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_frdo_artifact_bucket_immutable BEFORE UPDATE OR DELETE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION public.uc_frdo_artifact_bucket_immutable();

-- Authoritative Storage INSERT runs after worker async work, under one database
-- transaction. It accepts only the exact stored live lease and fixed actor;
-- caller metadata neither supplies an identity nor proves any artifact bytes.
CREATE FUNCTION public.uc_frdo_artifact_insert_guard()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout='2000ms'AS $fn$
DECLARE b public.uc_frdo_packet_artifact_builds;p public.uc_frdo_packets;meta jsonb;size_text text;prior_claims text;prior_sub text;prior_role text;claims jsonb;role_changed boolean:=false;
BEGIN
 IF NEW.bucket_id<>'frdo-packet-artifacts'THEN RETURN NEW;END IF;
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR NEW.owner IS NOT NULL OR nullif(NEW.owner_id,'')IS NOT NULL THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 meta:=NEW.user_metadata;
 IF NOT public.uc_frdo_shape(meta,ARRAY['build_id','lease_id','request_id','snapshot_sha256'])OR NOT public.uc_custom_journal_uuid(meta->'build_id')OR NOT public.uc_custom_journal_uuid(meta->'lease_id')OR NOT public.uc_custom_journal_uuid(meta->'request_id')OR coalesce(meta->>'snapshot_sha256','')!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE id=(meta->>'build_id')::uuid AND bucket_id=NEW.bucket_id AND object_path=NEW.name FOR SHARE NOWAIT;
 IF b.id IS NULL OR b.actor_id IS NULL OR b.phase IS DISTINCT FROM'generating'OR b.lease_id IS DISTINCT FROM(meta->>'lease_id')::uuid OR b.worker_request_id IS DISTINCT FROM(meta->>'request_id')::uuid OR b.snapshot_sha256 IS DISTINCT FROM meta->>'snapshot_sha256'OR b.lease_until IS NULL OR b.lease_until<=clock_timestamp()THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 SELECT *INTO p FROM public.uc_frdo_packets WHERE id=b.packet_id AND organization_id=b.organization_id FOR SHARE NOWAIT;
 IF p.id IS NULL OR p.current_build_id IS DISTINCT FROM b.id OR p.revision<>b.input_revision+1 OR p.state IS DISTINCT FROM'file_generating'OR p.snapshot_sha256 IS DISTINCT FROM b.snapshot_sha256 THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 size_text:=coalesce(NEW.metadata->>'size',NEW.metadata->>'contentLength');
 IF size_text IS NULL OR size_text!~'^[0-9]+$'OR size_text::numeric NOT BETWEEN 1 AND 20971520 OR NEW.metadata->>'mimetype'IS DISTINCT FROM b.mime THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 prior_claims:=current_setting('request.jwt.claims',true);prior_sub:=current_setting('request.jwt.claim.sub',true);prior_role:=current_setting('request.jwt.claim.role',true);
 IF prior_claims IS NULL OR prior_claims=''OR coalesce(prior_sub,'')<>''OR(prior_role IS NOT NULL AND prior_role NOT IN('','service_role'))THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 BEGIN claims:=prior_claims::jsonb;EXCEPTION WHEN OTHERS THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END;
 IF jsonb_typeof(claims)IS DISTINCT FROM'object'OR claims->>'role'IS DISTINCT FROM'service_role'THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',b.actor_id)::text,true);IF prior_role IS NOT NULL AND prior_role<>''THEN PERFORM set_config('request.jwt.claim.role','authenticated',true);role_changed:=true;END IF;
 BEGIN
  IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS DISTINCT FROM b.actor_id THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
  p:=public.uc_frdo_packet_current(b.packet_id,true);PERFORM public.uc_frdo_fence(b.retained_people||p.retained_people||ARRAY[b.actor_id]);
  IF p.organization_id IS DISTINCT FROM b.organization_id OR p.current_build_id IS DISTINCT FROM b.id OR p.revision<>b.input_revision+1 OR p.state IS DISTINCT FROM'file_generating'OR p.snapshot_sha256 IS DISTINCT FROM b.snapshot_sha256 OR b.lease_until<=clock_timestamp()THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims',prior_claims,true);IF role_changed THEN PERFORM set_config('request.jwt.claim.role',prior_role,true);END IF;
  IF current_setting('request.jwt.claims',true)IS DISTINCT FROM prior_claims OR current_setting('request.jwt.claim.sub',true)IS DISTINCT FROM prior_sub OR current_setting('request.jwt.claim.role',true)IS DISTINCT FROM prior_role THEN RAISE EXCEPTION'FRDO_PACKET_CLAIM_RESTORATION_FAILED';END IF;RAISE;
 END;
 PERFORM set_config('request.jwt.claims',prior_claims,true);IF role_changed THEN PERFORM set_config('request.jwt.claim.role',prior_role,true);END IF;
 IF current_setting('request.jwt.claims',true)IS DISTINCT FROM prior_claims OR current_setting('request.jwt.claim.sub',true)IS DISTINCT FROM prior_sub OR current_setting('request.jwt.claim.role',true)IS DISTINCT FROM prior_role THEN RAISE EXCEPTION'FRDO_PACKET_CLAIM_RESTORATION_FAILED';END IF;
 RETURN NEW;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');
END;$fn$;
CREATE TRIGGER uc_frdo_artifact_insert_guard BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.uc_frdo_artifact_insert_guard();
CREATE TRIGGER zz_uc_frdo_artifact_immutable BEFORE UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.uc_frdo_artifact_object_immutable();
DO $new_bucket$ BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='frdo-packet-artifacts')THEN RAISE EXCEPTION 'FRDO_PACKET_BUCKET_ALREADY_EXISTS';END IF;END;$new_bucket$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)VALUES('frdo-packet-artifacts','frdo-packet-artifacts',false,20971520,ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
CREATE POLICY uc_frdo_artifact_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='frdo-packet-artifacts'AND public.uc_frdo_storage_object_can_read(objects));
CREATE POLICY uc_frdo_artifact_select_fence ON storage.objects AS RESTRICTIVE FOR SELECT TO public USING(bucket_id<>'frdo-packet-artifacts'OR public.uc_frdo_storage_object_can_read(objects));
CREATE POLICY uc_frdo_artifact_insert_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO public WITH CHECK(bucket_id<>'frdo-packet-artifacts');
CREATE POLICY uc_frdo_artifact_update_fence ON storage.objects AS RESTRICTIVE FOR UPDATE TO public USING(bucket_id<>'frdo-packet-artifacts')WITH CHECK(bucket_id<>'frdo-packet-artifacts');
CREATE POLICY uc_frdo_artifact_delete_fence ON storage.objects AS RESTRICTIVE FOR DELETE TO public USING(bucket_id<>'frdo-packet-artifacts');
-- Final assembled ACL closure must grant ONLY authenticated EXECUTE on the
-- Boolean Storage policy helper; all other new helpers remain private.

-- Existing-function definitions below retain each old branch byte-for-byte.
CREATE OR REPLACE FUNCTION public.uc_document_registry_source(p_org uuid,p_ref jsonb,p_required boolean DEFAULT true,p_own_write boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE proof jsonb;v public.org_document_versions;d public.org_documents;BEGIN
 IF p_ref->>'kind'='frdo_packet_artifact'THEN RETURN public.uc_frdo_registry_source(p_org,p_ref,false);END IF;
 proof:=public.uc_copy_registry_source(p_org,p_ref,false,false);
 IF proof IS NULL AND p_own_write AND public.uc_custom_journal_shape(p_ref,ARRAY['kind','document_id','version_id','content_hash'])AND p_ref->>'kind'='org_document_version'AND public.uc_custom_journal_uuid(p_ref->'document_id')AND public.uc_custom_journal_uuid(p_ref->'version_id')AND coalesce(p_ref->>'content_hash','')~'^[a-f0-9]{64}$'
 AND NOT public.uc_document_teacher_limited(p_org)AND public.uc_document_org_access(p_org,true)THEN
  SELECT x.*INTO d FROM public.org_documents x WHERE x.id=(p_ref->>'document_id')::uuid AND x.organization_id=p_org AND x.deleted_at IS NULL AND coalesce(to_jsonb(x)->>'status','active')NOT IN('archived','expired');
  SELECT x.*INTO v FROM public.org_document_versions x WHERE x.id=(p_ref->>'version_id')::uuid AND x.document_id=d.id AND x.organization_id=p_org AND x.uploaded_by=auth.uid();
  IF v.id IS NOT NULL AND public.uc_copy_registry_object_matches(v)AND public.uc_copy_registry_original_ref(v)=p_ref THEN proof:=jsonb_build_object('participants',jsonb_build_array(v.uploaded_by),'label','Загруженная версия '||v.version_number||' · '||left(coalesce(v.file_name,'Файл'),400),'verified',true);END IF;
 END IF;
 IF proof IS NOT NULL THEN
  SELECT x.*INTO v FROM public.org_document_versions x WHERE x.id=(p_ref->>'version_id')::uuid AND x.document_id=(p_ref->>'document_id')::uuid AND x.organization_id=p_org;
  IF v.id IS NULL OR NOT public.uc_document_registry_text(to_jsonb(v.file_path),2000)OR v.file_path LIKE'/%'OR v.file_path LIKE'%..%'OR v.file_path LIKE'%://%'OR v.file_path~'[[:cntrl:]?]'OR strpos(v.file_path,chr(92))>0
   OR NOT public.uc_document_registry_text(to_jsonb(coalesce(nullif(v.file_name,''),'document')),1000)OR NOT public.uc_document_registry_text(to_jsonb(lower(btrim(v.storage_metadata->>'mimetype'))),200)
   OR coalesce(v.file_size,(v.storage_metadata->>'size')::bigint)NOT BETWEEN 0 AND 9007199254740991 THEN proof:=NULL;END IF;
 END IF;
 IF proof IS NULL AND p_required THEN PERFORM public.uc_document_registry_error('SOURCE_UNAVAILABLE');END IF;RETURN proof;END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_document_registry_context(p_org uuid,p_group uuid,p_subject jsonb,p_context jsonb,p_check boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE k text:=p_context->>'kind';subject_id uuid;e public.enrollments;c public.courses;t public.org_contracts;group_ids uuid[]:='{}';people uuid[]:='{}';binding jsonb;proof jsonb;label text;expected text;ref jsonb;
BEGIN
 IF k='frdo_packet'THEN RETURN public.uc_frdo_registry_context(p_org,p_group,p_subject,p_context);END IF;
 IF public.uc_custom_journal_shape(p_subject,ARRAY['kind'])AND p_subject->>'kind'='none'THEN subject_id:=NULL;
 ELSIF public.uc_custom_journal_shape(p_subject,ARRAY['kind','user_id'])AND p_subject->>'kind'='student'AND public.uc_custom_journal_uuid(p_subject->'user_id')THEN subject_id:=(p_subject->>'user_id')::uuid;IF NOT public.uc_document_registry_student(p_org,p_group,subject_id)THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;people:=array_append(people,subject_id);
 ELSE PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 IF k='organization'THEN
  IF NOT public.uc_custom_journal_shape(p_context,ARRAY['kind','not_applicable_reason'])OR NOT public.uc_document_registry_text(p_context->'not_applicable_reason',2000)OR p_group IS NOT NULL THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;label:='Документ организации: '||left(p_context->>'not_applicable_reason',350);
 ELSIF k IN('enrollment','contract','enrollment_contract')THEN
  IF NOT (CASE k WHEN'enrollment'THEN public.uc_custom_journal_shape(p_context,ARRAY['kind','enrollment_id','binding_hash'])WHEN'contract'THEN public.uc_custom_journal_shape(p_context,ARRAY['kind','contract_id','binding_hash'])ELSE public.uc_custom_journal_shape(p_context,ARRAY['kind','enrollment_id','contract_id','binding_hash'])END)
  OR coalesce(p_context->>'binding_hash','')!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
  IF k IN('enrollment','enrollment_contract')THEN
   IF NOT public.uc_custom_journal_uuid(p_context->'enrollment_id')THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
   SELECT x.*INTO e FROM public.enrollments x JOIN public.courses y ON y.id=x.course_id WHERE x.id=(p_context->>'enrollment_id')::uuid AND y.organization_id=p_org;
   IF e.id IS NULL OR NOT public.uc_document_registry_student(p_org,p_group,e.user_id)OR(subject_id IS NOT NULL AND subject_id<>e.user_id)THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
   SELECT*INTO c FROM public.courses WHERE id=e.course_id AND organization_id=p_org;people:=array_append(people,e.user_id);label:='Зачисление: '||left(coalesce(to_jsonb(c)->>'title','Курс'),250)||' · '||left(public.uc_copy_registry_label(e.user_id),200)||' · '||left(e.status,50);
   IF p_group IS NOT NULL AND EXISTS(SELECT 1 FROM public.student_groups g WHERE g.id=p_group AND g.organization_id=p_org AND g.course_id IS NOT NULL AND g.course_id<>e.course_id)THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
  END IF;
  IF k IN('contract','enrollment_contract')THEN
   IF NOT public.uc_custom_journal_uuid(p_context->'contract_id')THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
   SELECT*INTO t FROM public.org_contracts WHERE id=(p_context->>'contract_id')::uuid AND organization_id=p_org AND status NOT IN('deleted','cancelled','archived');
   IF t.id IS NULL OR NOT public.can_access_organization(p_org,'documents.read')THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
   IF t.student_user_id IS NOT NULL AND(NOT public.uc_document_registry_student(p_org,p_group,t.student_user_id)OR(subject_id IS NOT NULL AND subject_id<>t.student_user_id)OR(e.id IS NOT NULL AND t.student_user_id<>e.user_id))THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
   IF t.student_group_id IS NOT NULL AND(NOT EXISTS(SELECT 1 FROM public.student_groups g WHERE g.id=t.student_group_id AND g.organization_id=p_org)OR(p_group IS NOT NULL AND p_group<>t.student_group_id)OR(t.student_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=t.student_group_id AND m.user_id=t.student_user_id))OR(e.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m JOIN public.student_groups g ON g.id=m.group_id WHERE m.organization_id=p_org AND m.group_id=t.student_group_id AND m.user_id=e.user_id AND(g.course_id IS NULL OR g.course_id=e.course_id))))THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
   IF p_group IS NOT NULL AND t.student_group_id IS DISTINCT FROM p_group AND(t.student_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=t.student_user_id))THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
   IF e.id IS NOT NULL AND t.student_user_id IS NULL AND(t.student_group_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=t.student_group_id AND m.user_id=e.user_id))THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
   IF subject_id IS NOT NULL AND e.id IS NULL AND t.student_user_id IS NULL AND(t.student_group_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=t.student_group_id AND m.user_id=subject_id))THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
   IF t.company_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.companies x WHERE x.id=t.company_id AND x.organization_id=p_org)THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
   people:=array_append(people,t.student_user_id);IF t.student_group_id IS NOT NULL THEN group_ids:=array_append(group_ids,t.student_group_id);END IF;
   label:=concat_ws(' + ',label,'Договор '||left(coalesce(t.contract_number,t.name),180)||' · '||left(t.status,50));
  END IF;
 ELSE PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}')INTO people FROM unnest(people)id WHERE id IS NOT NULL;
 SELECT coalesce(array_agg(DISTINCT m.group_id ORDER BY m.group_id),'{}')INTO group_ids FROM public.student_group_memberships_effective m JOIN public.student_groups g ON g.id=m.group_id WHERE m.organization_id=p_org AND m.user_id=ANY(people)AND(e.id IS NULL OR g.course_id IS NULL OR g.course_id=e.course_id)AND(t.student_group_id IS NULL OR m.group_id=t.student_group_id);
 IF t.student_group_id IS NOT NULL THEN group_ids:=array_append(group_ids,t.student_group_id);END IF;
 IF p_group IS NOT NULL AND NOT(p_group=ANY(group_ids))THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}')INTO group_ids FROM unnest(group_ids)id WHERE id IS NOT NULL;
 binding:=jsonb_build_object('kind',k,'organization_id',p_org,'enrollment_id',e.id,'user_id',coalesce(e.user_id,t.student_user_id,subject_id),'course_id',e.course_id,'enrollment_status',e.status,'enrollment_revision',CASE WHEN e.id IS NULL THEN NULL ELSE e.document_facts_revision END,'contract_id',t.id,'contract_student_user_id',t.student_user_id,'contract_group_id',t.student_group_id,'contract_company_id',t.company_id,'contract_status',t.status,'contract_updated_at',t.updated_at,'scope_group_id',p_group);
 proof:=jsonb_build_object('binding',binding,'factual_group_ids',to_jsonb(group_ids),'reason',CASE WHEN k='organization'THEN p_context->>'not_applicable_reason'ELSE NULL END);expected:=public.uc_document_registry_hash(proof::text);
 IF k<>'organization'AND p_check AND expected<>p_context->>'binding_hash'THEN PERFORM public.uc_document_registry_error('CONTEXT_CHANGED');END IF;
 binding:=binding||jsonb_build_object('binding_hash',expected);ref:=CASE k WHEN'organization'THEN p_context WHEN'enrollment'THEN jsonb_build_object('kind',k,'enrollment_id',e.id,'binding_hash',expected)WHEN'contract'THEN jsonb_build_object('kind',k,'contract_id',t.id,'binding_hash',expected)ELSE jsonb_build_object('kind',k,'enrollment_id',e.id,'contract_id',t.id,'binding_hash',expected)END;
 RETURN jsonb_build_object('binding',binding,'context',ref,'participants',to_jsonb(people),'groups',to_jsonb(group_ids),'label',left(label,500));END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_document_registry_file(p_org uuid,p_source jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v public.org_document_versions;BEGIN IF p_source->>'kind'='frdo_packet_artifact'THEN RETURN public.uc_frdo_registry_source(p_org,p_source,false)->'file';END IF; PERFORM public.uc_document_registry_source(p_org,p_source,true,false);SELECT*INTO STRICT v FROM public.org_document_versions WHERE id=(p_source->>'version_id')::uuid AND document_id=(p_source->>'document_id')::uuid AND organization_id=p_org;
 RETURN jsonb_build_object('kind','org_document_version','bucket','org-documents','path',v.file_path,'version_id',v.id,'proof_hash',p_source->>'content_hash','file_name',coalesce(nullif(v.file_name,''),'document'),'mime',lower(btrim(coalesce(v.storage_metadata->>'mimetype','application/octet-stream'))),'size',coalesce(v.file_size,(v.storage_metadata->>'size')::bigint));END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_document_registry_source_lock(p_org uuid,p_ref jsonb,p_own boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v public.org_document_versions;proof jsonb;BEGIN
 IF p_ref->>'kind'='frdo_packet_artifact'THEN RETURN public.uc_frdo_registry_source(p_org,p_ref,true);END IF;
 proof:=public.uc_document_registry_source(p_org,p_ref,true,p_own);SELECT*INTO STRICT v FROM public.org_document_versions WHERE id=(p_ref->>'version_id')::uuid AND document_id=(p_ref->>'document_id')::uuid AND organization_id=p_org FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_documents WHERE id=v.document_id AND organization_id=p_org FOR SHARE NOWAIT;
 PERFORM 1 FROM storage.objects WHERE id=v.storage_object_id FOR SHARE NOWAIT;PERFORM 1 FROM storage.buckets WHERE id='org-documents'FOR SHARE NOWAIT;
 RETURN public.uc_document_registry_source(p_org,p_ref,true,p_own);END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_document_registry_record_json(p public.uc_document_registry_records,p_caps jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE src jsonb;ctx jsonb;current_context boolean:=false;can_correct boolean:=false;context_label text:='Связь изменена; прежние идентификаторы сохранены';proof jsonb;BEGIN
 PERFORM public.uc_frdo_registry_snapshot_guard(p.organization_id,jsonb_build_object('data',p.data));
 src:=public.uc_document_registry_source(p.organization_id,p.data->'source',false,false);
 BEGIN ctx:=public.uc_document_registry_context(p.organization_id,p.group_id,p.data->'subject',p.data->'context',true);current_context:=ctx->'binding'=p.context_binding;IF current_context THEN context_label:=ctx->>'label';END IF;
 EXCEPTION WHEN SQLSTATE'22023'OR SQLSTATE'PT409'OR SQLSTATE'PT404'OR SQLSTATE'42501'THEN IF SQLERRM NOT LIKE'DOCUMENT_REGISTRY_%'THEN RAISE;END IF;current_context:=false;END;
 IF(p_caps->>'can_correct')::boolean AND(p.data->'source'->>'kind')IS DISTINCT FROM'frdo_packet_artifact'AND p.status='registered'AND src IS NOT NULL AND current_context THEN BEGIN proof:=public.uc_document_registry_data(p.organization_id,p.group_id,p.data,true);can_correct:=true;
 EXCEPTION WHEN SQLSTATE'22023'OR SQLSTATE'PT409'OR SQLSTATE'PT404'OR SQLSTATE'42501'THEN IF SQLERRM NOT LIKE'DOCUMENT_REGISTRY_%'THEN RAISE;END IF;can_correct:=false;END;END IF;
 RETURN jsonb_build_object('id',p.id,'group_id',p.group_id,'registration_id',p.registration_id,'sequence_year',p.sequence_year,'sequence_number',p.sequence_number,'revision',p.revision,'status',p.status,'data',p.data,'context_binding',p.context_binding,'registered_at',p.registered_at,'recorded_by',p.registered_by,'recorded_by_label',CASE WHEN p.registered_by IS NULL THEN NULL ELSE public.uc_copy_registry_label(p.registered_by)END,'updated_at',p.updated_at,'source_label',src->'label','source_available',src IS NOT NULL,'sender_label',public.uc_document_registry_party_label(p.organization_id,p.data->'sender'),'recipient_label',public.uc_document_registry_party_label(p.organization_id,p.data->'recipient'),'subject_label',CASE WHEN p.data->'subject'->>'kind'='student'THEN public.uc_copy_registry_label((p.data->'subject'->>'user_id')::uuid)ELSE NULL END,'context_label',context_label,'context_current',current_context,'legacy_claim',p.legacy_claim,'can_correct',can_correct,'can_archive',(p_caps->>'can_archive')::boolean AND p.status='registered','can_open_file',(p_caps->>'can_open_file')::boolean AND src IS NOT NULL);
END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_document_registry_data(p_org uuid,p_group uuid,p_data jsonb,p_check_context boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE src jsonb;sender jsonb;recipient jsonb;ctx jsonb;origin jsonb:=p_data->'origin';legacy jsonb;people uuid[]:='{}';part jsonb;typ text:=p_data->>'document_type';BEGIN
 IF NOT public.uc_custom_journal_shape(p_data,ARRAY['direction','document_type','title','document_date','declared_document_number','source','sender','recipient','subject','context','origin','notes'])OR NOT coalesce(p_data->>'direction'IN('incoming','outgoing'),false)
 OR NOT coalesce(typ IN('contract','enrollment_order','expulsion_order','certificate','diploma','qualification','protocol','invoice','act','other'),false)OR NOT public.uc_document_registry_text(p_data->'title',500)OR NOT public.uc_copy_registry_date(p_data->'document_date')
 OR NOT(p_data->'declared_document_number'='null'::jsonb OR public.uc_document_registry_text(p_data->'declared_document_number',120,true))OR NOT public.uc_document_registry_text(p_data->'notes',4000,true)THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 PERFORM public.uc_frdo_registry_snapshot_guard(p_org,jsonb_build_object('data',p_data));
 IF p_data->'source'->>'kind'='frdo_packet_artifact'AND(p_data->>'direction'IS DISTINCT FROM'outgoing'OR typ IS DISTINCT FROM'other'OR p_data->'subject'IS DISTINCT FROM jsonb_build_object('kind','none')OR p_data->'origin'IS DISTINCT FROM jsonb_build_object('kind','org_document'))THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
 src:=public.uc_document_registry_source(p_org,p_data->'source',true,false);sender:=public.uc_document_registry_party(p_org,p_group,p_data->'sender');recipient:=public.uc_document_registry_party(p_org,p_group,p_data->'recipient');ctx:=public.uc_document_registry_context(p_org,p_group,p_data->'subject',p_data->'context',p_check_context);
 IF(p_data->>'direction'='incoming'AND p_data->'recipient'<>jsonb_build_object('kind','organization','organization_id',p_org))OR(p_data->>'direction'='outgoing'AND p_data->'sender'<>jsonb_build_object('kind','organization','organization_id',p_org))THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
 IF p_data->>'direction'='outgoing'AND typ IN('enrollment_order','expulsion_order','certificate','diploma','qualification')AND(p_data->'subject'->>'kind'IS DISTINCT FROM'student'OR p_data->'context'->>'kind'NOT IN('enrollment','enrollment_contract'))THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
 IF p_data->>'direction'='outgoing'AND p_data->'recipient'->>'kind'='student'AND ctx->'binding'->>'user_id'IS DISTINCT FROM p_data->'recipient'->>'user_id'THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
 IF ctx->'binding'->>'contract_company_id'IS NOT NULL AND(p_data->'sender'->>'kind'='company'AND p_data->'sender'->>'company_id'<>ctx->'binding'->>'contract_company_id'OR p_data->'recipient'->>'kind'='company'AND p_data->'recipient'->>'company_id'<>ctx->'binding'->>'contract_company_id')THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
 IF public.uc_custom_journal_shape(origin,ARRAY['kind'])AND origin->>'kind'='org_document'THEN NULL;
 ELSIF public.uc_custom_journal_shape(origin,ARRAY['kind','incoming_document_id'])AND origin->>'kind'='incoming_document'AND public.uc_custom_journal_uuid(origin->'incoming_document_id')THEN
  IF p_data->>'direction'<>'incoming'OR NOT EXISTS(SELECT 1 FROM public.incoming_documents i WHERE i.id=(origin->>'incoming_document_id')::uuid AND i.organization_id=p_org AND i.deleted_at IS NULL AND(i.related_company_id IS NULL OR p_data->'sender'=jsonb_build_object('kind','company','company_id',i.related_company_id)))THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
 ELSIF public.uc_custom_journal_shape(origin,ARRAY['kind','legacy_id','legacy_binding_hash','relationship_reason'])AND origin->>'kind'='legacy_issuance_log'AND public.uc_custom_journal_uuid(origin->'legacy_id')AND coalesce(origin->>'legacy_binding_hash','')~'^[a-f0-9]{64}$'AND public.uc_document_registry_text(origin->'relationship_reason',2000)THEN
  legacy:=public.uc_document_registry_legacy(p_org,p_group,(origin->>'legacy_id')::uuid);IF legacy->>'legacy_binding_hash'<>origin->>'legacy_binding_hash'THEN PERFORM public.uc_document_registry_error('CONTEXT_CHANGED');END IF;
  IF legacy->>'enrollment_id'IS NOT NULL AND legacy->>'enrollment_id'IS DISTINCT FROM ctx->'binding'->>'enrollment_id'THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
 ELSE PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 FOR part IN SELECT value FROM jsonb_array_elements(jsonb_build_array(src,sender,recipient,ctx))LOOP people:=people||ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(part->'participants')x);END LOOP;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}')INTO people FROM unnest(people)x WHERE x IS NOT NULL;
 RETURN jsonb_build_object('participants',to_jsonb(people),'groups',ctx->'groups','context_binding',ctx->'binding','source_label',src->'label','sender_label',sender->'label','recipient_label',recipient->'label','subject_label',CASE WHEN p_data->'subject'->>'kind'='student'THEN public.uc_copy_registry_label((p_data->'subject'->>'user_id')::uuid)ELSE NULL END,'context_label',ctx->'label','legacy_claim',legacy->'claim');END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_document_registry_capture_data(p_org uuid,p_data jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE proof jsonb;BEGIN
 IF p_data->'source'->>'kind'='frdo_packet_artifact'THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
 IF NOT public.uc_custom_journal_shape(p_data,ARRAY['doc_type','title','counterparty_name','counterparty_inn','doc_number','doc_date','notes','source'])OR NOT coalesce(p_data->>'doc_type'IN('contract','act','invoice','other'),false)OR NOT public.uc_document_registry_text(p_data->'title',500)
 OR NOT(p_data->'counterparty_name'='null'::jsonb OR public.uc_document_registry_text(p_data->'counterparty_name',300))OR NOT(p_data->'counterparty_inn'='null'::jsonb OR jsonb_typeof(p_data->'counterparty_inn')='string'AND p_data->>'counterparty_inn'~'^(\d{10}|\d{12})$')
 OR NOT(p_data->'doc_number'='null'::jsonb OR public.uc_document_registry_text(p_data->'doc_number',120,true))OR NOT(p_data->'doc_date'='null'::jsonb OR public.uc_copy_registry_date(p_data->'doc_date'))OR NOT public.uc_document_registry_text(p_data->'notes',4000,true)THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 proof:=public.uc_document_registry_source(p_org,p_data->'source',true,true);RETURN proof;END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_document_registry_replay(p_org uuid,p_scope jsonb,p_req public.uc_document_registry_requests,p_caps jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g uuid:=CASE WHEN p_scope->>'kind'='group'THEN(p_scope->>'group_id')::uuid ELSE NULL END;result jsonb:=p_req.result;item jsonb;src jsonb;ctx jsonb;proof jsonb;r public.uc_document_registry_records;i public.incoming_documents;link public.uc_document_registry_incoming_sources;current_context boolean:=false;same_current boolean:=false;BEGIN
 IF result->>'kind'='capture_incoming'THEN
  item:=result->'incoming';SELECT*INTO i FROM public.incoming_documents WHERE id=(item->>'id')::uuid AND organization_id=p_org AND deleted_at IS NULL;IF i.id IS NULL OR NOT(p_caps->>'can_capture_incoming')::boolean THEN PERFORM public.uc_document_registry_error('NOT_FOUND');END IF;
  PERFORM public.uc_document_registry_source_lock(p_org,item->'linked_source',true);src:=public.uc_document_registry_source(p_org,item->'linked_source',false,false);SELECT*INTO link FROM public.uc_document_registry_incoming_sources WHERE incoming_document_id=i.id AND organization_id=p_org;
  item:=item||jsonb_build_object('source_label',src->'label','source_available',src IS NOT NULL,'can_open_file',src IS NOT NULL,'can_register',(p_caps->>'can_register_incoming')::boolean AND link.record_id IS NULL);
  RETURN result||public.uc_document_registry_base(p_org,p_scope)||jsonb_build_object('replayed',true,'incoming',item);
 END IF;
 PERFORM public.uc_frdo_registry_snapshot_guard(p_org,result->'record');
 item:=result->'record';SELECT*INTO r FROM public.uc_document_registry_records WHERE id=(item->>'id')::uuid AND organization_id=p_org AND NOT redacted AND(g IS NULL OR g=ANY(scope_group_ids));IF r.id IS NULL THEN PERFORM public.uc_document_registry_error('NOT_FOUND');END IF;
 IF result->>'kind'<>'archive'THEN proof:=public.uc_document_registry_write_proof(p_org,r.group_id,item->'data');END IF;
 src:=public.uc_document_registry_source(p_org,item->'data'->'source',false,false);
 BEGIN ctx:=public.uc_document_registry_context(p_org,r.group_id,item->'data'->'subject',item->'data'->'context',true);current_context:=ctx->'binding'=item->'context_binding';EXCEPTION WHEN SQLSTATE'22023'OR SQLSTATE'42501'OR SQLSTATE'PT409'OR SQLSTATE'PT404'THEN IF SQLERRM NOT LIKE'DOCUMENT_REGISTRY_%'THEN RAISE;END IF;current_context:=false;END;
 same_current:=r.revision=(item->>'revision')::bigint AND r.data=item->'data'AND r.status=item->>'status';
 item:=item||jsonb_build_object('source_label',src->'label','source_available',src IS NOT NULL,'context_label',CASE WHEN current_context THEN ctx->>'label'ELSE'Связь изменена; прежние идентификаторы сохранены'END,'context_current',current_context,'can_open_file',(p_caps->>'can_open_file')::boolean AND src IS NOT NULL,'can_correct',(p_caps->>'can_correct')::boolean AND((r.data->'source'->>'kind')IS DISTINCT FROM'frdo_packet_artifact') AND same_current AND current_context AND src IS NOT NULL AND r.status='registered','can_archive',(p_caps->>'can_archive')::boolean AND same_current AND r.status='registered');
 RETURN result||public.uc_document_registry_base(p_org,p_scope)||jsonb_build_object('replayed',true,'record',item);END;$fn$;

CREATE OR REPLACE FUNCTION public.apply_document_registry_action(p_org uuid,p_scope jsonb,p_expected_revision bigint,p_request_id uuid,p_action jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE v_group uuid;v_op text:=p_action->>'action';v_caps jsonb;v_head bigint;v_payload text;v_req public.uc_document_registry_requests;v_rec public.uc_document_registry_records;v_previous public.uc_document_registry_records;v_incoming public.incoming_documents;v_link public.uc_document_registry_incoming_sources;v_version public.org_document_versions;v_data jsonb;v_proof jsonb;v_old_proof jsonb;v_src jsonb;v_plan jsonb;v_result jsonb;v_people uuid[]:='{}';v_groups uuid[]:='{}';v_reason text;v_year integer;v_number integer;v_registration text;v_event text;v_link_revision bigint;v_link_hash text;v_company uuid;v_inn text;BEGIN
 v_group:=public.uc_document_registry_scope(p_org,p_scope);IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>9007199254740991 OR p_request_id IS NULL OR jsonb_typeof(p_action)IS DISTINCT FROM'object'OR octet_length(p_action::text)>8388608 THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 IF NOT coalesce(v_op IN('capture_incoming','register','register_incoming','correct','archive'),false)THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 PERFORM public.uc_document_registry_fence(p_org,v_group,'{}',true,p_request_id);v_caps:=public.uc_document_registry_caps(p_org,v_group);
 IF (CASE v_op WHEN'capture_incoming'THEN NOT(v_caps->>'can_capture_incoming')::boolean WHEN'archive'THEN NOT(v_caps->>'can_archive')::boolean WHEN'register_incoming'THEN NOT(v_caps->>'can_register_incoming')::boolean WHEN'register'THEN NOT(v_caps->>'can_register')::boolean WHEN'correct'THEN NOT(v_caps->>'can_correct')::boolean ELSE true END) THEN PERFORM public.uc_document_registry_error('ACCESS_DENIED');END IF;
 INSERT INTO public.uc_document_registry_heads(organization_id)VALUES(p_org)ON CONFLICT DO NOTHING;SELECT revision INTO STRICT v_head FROM public.uc_document_registry_heads WHERE organization_id=p_org FOR UPDATE NOWAIT;
 v_payload:=public.uc_document_registry_hash(jsonb_build_object('organization_id',p_org,'scope',p_scope,'expected_revision',p_expected_revision,'action',p_action)::text);
 SELECT*INTO v_req FROM public.uc_document_registry_requests WHERE actor_id=auth.uid()AND request_id=p_request_id;
 IF v_req.request_id IS NOT NULL THEN
  IF v_req.payload_hash<>v_payload OR v_req.organization_id<>p_org OR v_req.scope<>p_scope THEN PERFORM public.uc_document_registry_error('REQUEST_MISMATCH');END IF;
  PERFORM public.uc_document_registry_fence(p_org,v_group,v_req.participant_ids,true,p_request_id);RETURN public.uc_document_registry_replay(p_org,p_scope,v_req,v_caps);
 END IF;
 IF v_op='capture_incoming'THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','data'])OR p_expected_revision<>0 THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;v_data:=p_action->'data';v_proof:=public.uc_document_registry_capture_data(p_org,v_data);
  SELECT coalesce(array_agg(x::uuid),'{}')INTO v_people FROM jsonb_array_elements_text(v_proof->'participants')x;PERFORM public.uc_document_registry_fence(p_org,v_group,v_people,true,p_request_id);PERFORM public.uc_document_registry_source_lock(p_org,v_data->'source',true);
  SELECT*INTO STRICT v_version FROM public.org_document_versions WHERE id=(v_data->'source'->>'version_id')::uuid AND document_id=(v_data->'source'->>'document_id')::uuid AND organization_id=p_org;
  INSERT INTO public.incoming_documents(organization_id,doc_type,title,counterparty_name,counterparty_inn,doc_number,doc_date,file_url,file_path,file_size,notes,uploaded_by)
   VALUES(p_org,v_data->>'doc_type',v_data->>'title',v_data->>'counterparty_name',v_data->>'counterparty_inn',v_data->>'doc_number',(v_data->>'doc_date')::date,v_version.file_path,v_version.file_path,v_version.file_size,v_data->>'notes',v_version.uploaded_by)RETURNING*INTO v_incoming;
  v_people:=array_append(v_people,auth.uid());v_link_hash:=public.uc_document_registry_hash(jsonb_build_object('organization_id',p_org,'incoming_document_id',v_incoming.id,'source',v_data->'source','revision',1)::text);
  INSERT INTO public.uc_document_registry_incoming_sources(incoming_document_id,organization_id,source,binding_hash,participant_ids,linked_by,updated_by)VALUES(v_incoming.id,p_org,v_data->'source',v_link_hash,v_people,auth.uid(),auth.uid());
  v_result:=jsonb_build_object('incoming',public.uc_document_registry_incoming_json(v_incoming,v_group,v_caps));
 ELSIF v_op IN('register','register_incoming')THEN
  IF p_expected_revision<>0 OR NOT public.uc_document_registry_text(p_action->'reason',2000)THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;v_reason:=p_action->>'reason';
  IF v_op='register'THEN IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','data','reason'])THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;v_data:=p_action->'data';IF v_data->>'direction'IS DISTINCT FROM'outgoing'OR v_data->'origin'->>'kind'='incoming_document'THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
  ELSE IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','incoming','data','reason'])THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;v_plan:=public.uc_document_registry_incoming_plan(p_org,v_group,p_action->'incoming',p_action->'data');v_data:=v_plan->'data';
   IF p_action->'incoming'->>'kind'='existing'THEN SELECT*INTO STRICT v_incoming FROM public.incoming_documents WHERE id=(p_action->'incoming'->>'incoming_document_id')::uuid AND organization_id=p_org AND deleted_at IS NULL FOR SHARE NOWAIT;SELECT*INTO v_link FROM public.uc_document_registry_incoming_sources WHERE incoming_document_id=v_incoming.id AND organization_id=p_org FOR UPDATE NOWAIT;IF v_link.binding_hash IS DISTINCT FROM p_action->'incoming'->>'expected_binding_hash'OR v_link.record_id IS NOT NULL THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;END IF;
  END IF;
  v_proof:=public.uc_document_registry_write_proof(p_org,v_group,v_data);
  IF v_data->'origin'->>'kind'='legacy_issuance_log'AND EXISTS(SELECT 1 FROM public.uc_document_registry_records x WHERE x.organization_id=p_org AND x.data->'origin'->>'kind'='legacy_issuance_log'AND x.data->'origin'->>'legacy_id'=v_data->'origin'->>'legacy_id')THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;
  IF v_op='register_incoming'AND v_incoming.id IS NULL THEN
   SELECT*INTO STRICT v_version FROM public.org_document_versions WHERE id=(v_data->'source'->>'version_id')::uuid AND organization_id=p_org;
   IF v_data->'sender'->>'kind'='company'THEN v_company:=(v_data->'sender'->>'company_id')::uuid;SELECT inn INTO v_inn FROM public.companies WHERE id=v_company AND organization_id=p_org;ELSIF v_data->'sender'->>'kind'='external'THEN v_inn:=v_data->'sender'->>'inn';END IF;
   INSERT INTO public.incoming_documents(organization_id,doc_type,title,counterparty_name,counterparty_inn,doc_number,doc_date,file_url,file_path,file_size,notes,related_company_id,uploaded_by)VALUES(p_org,CASE WHEN v_data->>'document_type'IN('contract','act','invoice')THEN v_data->>'document_type'ELSE'other'END,v_data->>'title',v_proof->>'sender_label',v_inn,v_data->>'declared_document_number',(v_data->>'document_date')::date,v_version.file_path,v_version.file_path,v_version.file_size,v_data->>'notes',v_company,v_version.uploaded_by)RETURNING*INTO v_incoming;
   v_data:=v_data||jsonb_build_object('origin',jsonb_build_object('kind','incoming_document','incoming_document_id',v_incoming.id));v_proof:=public.uc_document_registry_write_proof(p_org,v_group,v_data);
  END IF;
  IF v_head>=9007199254740991 THEN PERFORM public.uc_document_registry_error('LIMIT_EXCEEDED');END IF;v_year:=extract(year FROM timezone('Europe/Moscow',clock_timestamp()))::integer;
  INSERT INTO public.document_number_sequences(organization_id,doc_type,year,last_number,updated_at)VALUES(p_org,'general_registration',v_year,1,clock_timestamp())ON CONFLICT(organization_id,doc_type,year)DO UPDATE SET last_number=document_number_sequences.last_number+1,updated_at=clock_timestamp()WHERE document_number_sequences.last_number<2147483647 RETURNING last_number INTO v_number;
  IF v_number IS NULL THEN PERFORM public.uc_document_registry_error('LIMIT_EXCEEDED');END IF;v_registration:='РЕГ-'||v_year||'/'||CASE WHEN v_number<1000000 THEN lpad(v_number::text,6,'0')ELSE v_number::text END;
  SELECT coalesce(array_agg(x::uuid),'{}')INTO v_people FROM jsonb_array_elements_text(v_proof->'participants')x;v_people:=array_append(v_people,auth.uid());SELECT coalesce(array_agg(x::uuid),'{}')INTO v_groups FROM jsonb_array_elements_text(v_proof->'groups')x;
  INSERT INTO public.uc_document_registry_records(organization_id,group_id,scope_group_ids,registration_id,sequence_year,sequence_number,data,context_binding,legacy_claim,participant_ids,registered_by,updated_by)VALUES(p_org,v_group,v_groups,v_registration,v_year,v_number,v_data,v_proof->'context_binding',v_proof->'legacy_claim',v_people,auth.uid(),auth.uid())RETURNING*INTO v_rec;
  v_event:=CASE WHEN v_data->'origin'->>'kind'='legacy_issuance_log'THEN'attach_legacy'ELSE'register'END;
  INSERT INTO public.uc_document_registry_events(organization_id,record_id,revision,action,reason,snapshot,participant_ids,recorded_by)VALUES(p_org,v_rec.id,1,v_event,v_reason,jsonb_build_object('data',v_data,'status',v_rec.status,'context_binding',v_rec.context_binding),v_people,auth.uid());

 ELSIF v_op IN('correct','archive')THEN
  IF NOT (CASE WHEN v_op='correct'THEN public.uc_custom_journal_shape(p_action,ARRAY['action','record_id','data','reason'])ELSE public.uc_custom_journal_shape(p_action,ARRAY['action','record_id','reason'])END) OR NOT public.uc_custom_journal_uuid(p_action->'record_id')OR NOT public.uc_document_registry_text(p_action->'reason',2000)THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
  SELECT*INTO v_rec FROM public.uc_document_registry_records WHERE id=(p_action->>'record_id')::uuid AND organization_id=p_org AND NOT redacted AND(v_group IS NULL OR v_group=ANY(scope_group_ids))FOR UPDATE NOWAIT;
  IF v_rec.id IS NOT NULL THEN PERFORM public.uc_frdo_registry_snapshot_guard(p_org,jsonb_build_object('data',v_rec.data));IF v_rec.data->'source'->>'kind'='frdo_packet_artifact'AND v_op='correct'THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;END IF;
  IF v_rec.id IS NULL THEN PERFORM public.uc_document_registry_error('NOT_FOUND');END IF;IF v_rec.status<>'registered'OR v_rec.revision<>p_expected_revision THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;
  IF v_rec.revision>=9007199254740991 OR v_head>=9007199254740991 THEN PERFORM public.uc_document_registry_error('LIMIT_EXCEEDED');END IF;v_previous:=v_rec;v_reason:=p_action->>'reason';
  IF v_op='correct'THEN
   v_old_proof:=public.uc_document_registry_write_proof(p_org,v_rec.group_id,v_rec.data);v_data:=p_action->'data';v_proof:=public.uc_document_registry_write_proof(p_org,v_rec.group_id,v_data);
   IF v_data->>'direction'IS DISTINCT FROM v_rec.data->>'direction'OR v_data->'origin'->>'kind'IS DISTINCT FROM v_rec.data->'origin'->>'kind'OR v_data->'origin'->>'incoming_document_id'IS DISTINCT FROM v_rec.data->'origin'->>'incoming_document_id'OR v_data->'origin'->>'legacy_id'IS DISTINCT FROM v_rec.data->'origin'->>'legacy_id'THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;
   SELECT coalesce(array_agg(x::uuid),'{}')INTO v_groups FROM jsonb_array_elements_text(v_proof->'groups')x;SELECT coalesce(array_agg(x ORDER BY x),'{}')INTO v_groups FROM unnest(v_rec.scope_group_ids)x WHERE x=ANY(v_groups);
   SELECT coalesce(array_agg(x::uuid),'{}')INTO v_people FROM jsonb_array_elements_text(v_proof->'participants')x;v_people:=v_people||v_rec.participant_ids;
   UPDATE public.uc_document_registry_records SET data=v_data,context_binding=v_proof->'context_binding',legacy_claim=v_proof->'legacy_claim',scope_group_ids=v_groups,revision=revision+1,participant_ids=v_people,updated_by=auth.uid(),updated_at=clock_timestamp()WHERE id=v_rec.id RETURNING*INTO v_rec;
  ELSE
   v_people:=v_rec.participant_ids;PERFORM public.uc_document_registry_fence(p_org,v_group,v_people,true,p_request_id);
   UPDATE public.uc_document_registry_records SET status='archived',revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp()WHERE id=v_rec.id RETURNING*INTO v_rec;
  END IF;
  INSERT INTO public.uc_document_registry_events(organization_id,record_id,revision,action,reason,snapshot,participant_ids,recorded_by)VALUES(p_org,v_rec.id,v_rec.revision,v_op,v_reason,jsonb_build_object('data',v_rec.data,'status',v_rec.status,'context_binding',v_rec.context_binding),array_append(v_people,auth.uid()),auth.uid());
 ELSE PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 IF v_op<>'capture_incoming'THEN
  IF v_op='register_incoming'OR v_op='correct'AND v_rec.data->'origin'->>'kind'='incoming_document'THEN
   IF v_incoming.id IS NULL THEN SELECT*INTO STRICT v_incoming FROM public.incoming_documents WHERE id=(v_rec.data->'origin'->>'incoming_document_id')::uuid AND organization_id=p_org AND deleted_at IS NULL FOR SHARE NOWAIT;END IF;
   SELECT*INTO v_link FROM public.uc_document_registry_incoming_sources WHERE incoming_document_id=v_incoming.id AND organization_id=p_org FOR UPDATE NOWAIT;
   IF v_op='correct'AND(v_link.record_id IS DISTINCT FROM v_rec.id OR v_link.source IS DISTINCT FROM v_previous.data->'source')THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;
   IF v_op='register_incoming'AND v_link.record_id IS NOT NULL THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;
   v_link_revision:=coalesce(v_link.revision,0)+1;v_link_hash:=public.uc_document_registry_hash(jsonb_build_object('organization_id',p_org,'incoming_document_id',v_incoming.id,'source',v_rec.data->'source','revision',v_link_revision)::text);
   INSERT INTO public.uc_document_registry_incoming_sources(incoming_document_id,organization_id,source,binding_hash,record_id,revision,participant_ids,linked_by,updated_by)
    VALUES(v_incoming.id,p_org,v_rec.data->'source',v_link_hash,v_rec.id,v_link_revision,v_people,auth.uid(),auth.uid())ON CONFLICT(incoming_document_id)DO UPDATE SET source=excluded.source,binding_hash=excluded.binding_hash,record_id=excluded.record_id,revision=excluded.revision,participant_ids=uc_document_registry_incoming_sources.participant_ids||excluded.participant_ids,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  END IF;
  UPDATE public.uc_document_registry_heads SET revision=revision+1 WHERE organization_id=p_org RETURNING revision INTO v_head;
  v_result:=jsonb_build_object('record',public.uc_document_registry_record_json(v_rec,v_caps));
 END IF;
 v_people:=array_append(coalesce(v_people,'{}'),auth.uid());SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}')INTO v_people FROM unnest(v_people)x WHERE x IS NOT NULL;PERFORM public.uc_document_registry_fence(p_org,v_group,v_people,true,p_request_id);
 v_result:=public.uc_document_registry_base(p_org,p_scope)||jsonb_build_object('kind',v_op,'request_id',p_request_id,'replayed',false)||v_result;
 INSERT INTO public.uc_document_registry_requests(actor_id,request_id,organization_id,scope,payload_hash,result,participant_ids)VALUES(auth.uid(),p_request_id,p_org,p_scope,v_payload,v_result,v_people);RETURN v_result;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_document_registry_event_json(p public.uc_document_registry_events)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
 SELECT CASE WHEN public.uc_frdo_registry_snapshot_guard(p.organization_id,p.snapshot)THEN jsonb_build_object('id',p.id,'record_id',p.record_id,'revision',p.revision,'action',p.action,'reason',p.reason,'snapshot',p.snapshot,'recorded_at',p.recorded_at,'recorded_by',p.recorded_by,'recorded_by_label',CASE WHEN p.recorded_by IS NULL THEN NULL ELSE public.uc_copy_registry_label(p.recorded_by)END) ELSE NULL END $fn$;

CREATE OR REPLACE FUNCTION public.uc_document_registry_privacy_targets(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 WITH records AS MATERIALIZED(
  SELECT r.id,r.organization_id FROM public.uc_document_registry_records r WHERE NOT r.redacted AND(
   public.uc_frdo_registry_subject(r.organization_id,r.data->'source',p_user)OR EXISTS(SELECT 1 FROM public.uc_document_registry_events fh WHERE fh.record_id=r.id AND fh.organization_id=r.organization_id AND NOT fh.redacted AND public.uc_frdo_registry_subject(fh.organization_id,fh.snapshot->'data'->'source',p_user))OR
   r.data->'subject'->>'user_id'=p_user::text OR r.data->'sender'->>'user_id'=p_user::text OR r.data->'recipient'->>'user_id'=p_user::text OR r.context_binding->>'user_id'=p_user::text OR r.context_binding->>'contract_student_user_id'=p_user::text
   OR EXISTS(SELECT 1 FROM public.uc_document_registry_events h WHERE h.record_id=r.id AND h.organization_id=r.organization_id AND NOT h.redacted AND(h.snapshot->'data'->'subject'->>'user_id'=p_user::text OR h.snapshot->'data'->'sender'->>'user_id'=p_user::text OR h.snapshot->'data'->'recipient'->>'user_id'=p_user::text OR h.snapshot->'context_binding'->>'user_id'=p_user::text OR h.snapshot->'context_binding'->>'contract_student_user_id'=p_user::text)))
 ), links AS MATERIALIZED(
  SELECT s.incoming_document_id,s.organization_id FROM public.uc_document_registry_incoming_sources s JOIN records r ON r.id=s.record_id AND r.organization_id=s.organization_id
 ), requests AS MATERIALIZED(
  SELECT q.actor_id,q.request_id FROM public.uc_document_registry_requests q WHERE q.actor_id=p_user
   OR q.result->'record'->>'recorded_by'=p_user::text OR q.result->'record'->'legacy_claim'->>'stored_user_id'=p_user::text
   OR EXISTS(SELECT 1 FROM records r WHERE r.organization_id=q.organization_id AND q.result->'record'->>'id'=r.id::text)
   OR EXISTS(SELECT 1 FROM links s WHERE s.organization_id=q.organization_id AND q.result->'incoming'->>'id'=s.incoming_document_id::text)
 )SELECT jsonb_build_object('records',coalesce((SELECT jsonb_agg(id ORDER BY id)FROM records),'[]'),'requests',coalesce((SELECT jsonb_agg(jsonb_build_object('actor_id',actor_id,'request_id',request_id)ORDER BY actor_id,request_id)FROM requests),'[]')) $fn$;

CREATE OR REPLACE FUNCTION public.uc_scoped_journal_personal_counts(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
)||public.uc_education_personal_counts(p_user))||public.uc_frdo_personal_counts(p_user)
$function$;

CREATE OR REPLACE FUNCTION public.uc_scoped_journal_erase_user(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR current_setting('sintagma.account_deletion_erase_user',true) IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations rev WHERE rev.user_id=p_user) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events retained_removal WHERE retained_removal.user_id=p_user OR retained_removal.actor_id=p_user)THEN RAISE EXCEPTION 'COURSE_ASSIGNMENT_REMOVAL_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
 PERFORM public.uc_frdo_retention_block(p_user);
 PERFORM public.uc_education_erase_user(p_user);
 PERFORM public.uc_copy_registry_erase_user(p_user);
 PERFORM public.uc_document_registry_erase_user(p_user);
 -- Every copied personal export is invalidated, never silently re-rendered under an old hash.
 DELETE FROM public.uc_scoped_journal_exports e WHERE e.recorded_by=p_user OR p_user=ANY(e.participant_ids);
 DELETE FROM public.uc_scoped_journal_requests request_row WHERE request_row.actor_id=p_user OR p_user=ANY(request_row.participant_ids);
 DELETE FROM public.uc_scoped_journal_history h WHERE h.subject_user_id=p_user;
 DELETE FROM public.uc_scoped_journal_records r WHERE r.subject_user_id=p_user;
 -- Conservatively redact an entire attributed copy, including nonpersonal-author text.
 -- No universal discovery of undeclared third-party personal data in free text is claimed.
 UPDATE public.uc_scoped_journal_history SET recorded_by=NULL,subject_user_id=NULL,subject_label=NULL,field_values='{}',source='{"kind":"none"}',reason='',participant_ids='{}',redacted=true
  WHERE recorded_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_scoped_journal_records SET recorded_by=NULL,created_by=NULL,subject_user_id=NULL,subject_label=NULL,field_values='{}',source='{"kind":"none"}',participant_ids='{}',redacted=true
  WHERE recorded_by=p_user OR created_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_scoped_journal_contexts SET created_by=NULL WHERE created_by=p_user;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.uc_education_personal_counts(p_user))x WHERE x->>'column'='retained_subject_output_reference_review_required')THEN RAISE EXCEPTION 'EDUCATION_ARTIFACT_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
 IF public.uc_scoped_journal_personal_counts(p_user)<>'[]'::jsonb THEN PERFORM public.uc_custom_journal_error('DEPENDENCY_UNAVAILABLE');END IF;
END;$function$;

CREATE OR REPLACE FUNCTION public.account_deletion_snapshot(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE p public.profiles%ROWTYPE; v_org uuid; v_owner boolean:=false; v_education_outputs jsonb;v_education_unissued bigint;v_education_issued bigint;
 v_blockers jsonb:='[]'; v_categories jsonb:='[]'; v_files jsonb;
 v_count bigint; v_learning bigint; v_docs bigint:=0; v_shared bigint:=0; v_documentary bigint:=0;
 v_org_shared bigint:=0; v_courses bigint:=0; r record; v_fingerprint jsonb;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE user_id=p_user_id;
 v_org:=p.organization_id;
 IF v_org IS NOT NULL THEN v_owner:=public.is_org_owner(p_user_id,v_org); END IF;
 SELECT count(*) INTO v_learning FROM public.enrollments WHERE user_id=p_user_id;
 SELECT count(*)INTO v_count FROM public.uc_course_assignment_removal_events removal_event WHERE removal_event.user_id=p_user_id OR removal_event.actor_id=p_user_id;
 IF v_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','Сохранена история отмены или повторного назначения курса. До удаления нужна отдельная проверка этих записей; назначение не удаляется физически.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','retained_assignment_removals','label','История отмен и повторных назначений: требуется проверка хранения','count',v_count,'action','retain'));
 END IF;
 v_files:=public.account_deletion_files(p_user_id);
 -- Exact subject/document relationships; JSON checks are read-only detection,
 -- never commands to remove an organization-wide document.
 SELECT
   (SELECT count(*) FROM public.education_document_records WHERE user_id=p_user_id OR enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_issuance_log WHERE user_id=p_user_id)+
   (SELECT count(*) FROM public.student_documents WHERE enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_signatures WHERE (recipient_user_id=p_user_id OR sender_user_id=p_user_id) AND (signed_at IS NOT NULL OR sender_signed_at IS NOT NULL OR status='signed'))+
   (SELECT count(*) FROM public.org_contracts WHERE (student_user_id=p_user_id OR students::text LIKE '%'||p_user_id::text||'%') AND (approved_at IS NOT NULL OR signed_at IS NOT NULL OR status NOT IN ('draft','cancelled')))+
   (SELECT count(*) FROM public.group_documents WHERE (student_user_id=p_user_id OR variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%') AND (file_path IS NOT NULL OR doc_status<>'draft'))
 INTO v_docs;
 IF v_docs>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','У аккаунта есть оформленные учебные или подписанные документы организации. Для этих записей требуется отдельная проверка возможности удаления; она не заменяется подтверждением удаления аккаунта.')); END IF;
 IF EXISTS(SELECT 1 FROM public.group_completion_decision_history WHERE user_id=p_user_id) OR EXISTS(SELECT 1 FROM public.group_completion_decisions WHERE user_id=p_user_id) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть неизменяемая история итоговых решений организации. Их автоматическое удаление сейчас не поддержано без нарушения целостности общей истории; удаление не начато.'));
 END IF;
 -- CSZ preserves accepted homework by a dedicated immutable-history trigger.
 -- Do not bypass that guard just to scrub a personal free-text attachment.
 IF EXISTS(SELECT 1 FROM public.homework_submissions WHERE student_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.enrollments WHERE user_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id WHERE lp.user_id=p_user_id AND l.course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a')) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть защищённые работы ЦСЗ. Их обработка требует отдельного решения; результаты обучения сейчас не изменяются.'));
 END IF;
 -- These records have other stakeholders or privileged ownership. Never let
 -- Auth FK cascades silently delete client call records, contracts or grants.
 FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','student_user_id'),
  ('ai_avatar_templates','created_by'),
  ('balance_transactions','performed_by'),
  ('call_logs','manager_user_id'),
  ('chat_groups','created_by'),
  ('checko_search_presets','created_by'),
  ('checko_search_runs','created_by'),
  ('commercial_proposals','created_by'),
  ('commercial_proposals','deleted_by'),
  ('companies','user_id'),
  ('company_documents','deleted_by'),
  ('company_staff','invited_by'),
  ('course_landing_history','created_by'),
  ('course_manual_credits','credited_by'),
  ('course_manual_credits','revoked_by'),
  ('course_payments','user_id'),
  ('course_review_grants','created_by'),
  ('course_review_grants','updated_by'),
  ('course_snapshots','created_by'),
  ('data_subject_requests','deleted_by'),
  ('data_subject_requests','resolved_by'),
  ('document_issuance_log','deleted_by'),
  ('document_signatures','deleted_by'),
  ('driving_audit','user_id'),
  ('driving_entries','created_by'),
  ('driving_entry_reversals','created_by'),
  ('driving_instructors','user_id'),
  ('driving_invites','created_by'),
  ('driving_lessons','created_by'),
  ('driving_memberships','user_id'),
  ('driving_schools','created_by'),
  ('driving_students','user_id'),
  ('education_document_records','deleted_by'),
  ('email_campaigns','created_by'),
  ('email_drip_sequences','created_by'),
  ('email_templates','created_by'),
  ('enrollment_requests','resolved_by'),
  ('enrollment_requests','user_id'),
  ('goreltech_document_operations','actor_id'),
  ('goreltech_enrollment_orders','actor_id'),
  ('group_class_journal_marks','updated_by'),
  ('group_completion_decisions','confirmed_by'),
  ('group_document_schedules','updated_by'),
  ('group_documents','created_by'),
  ('group_documents','student_user_id'),
  ('homework_submissions','reviewer_id'),
  ('incoming_documents','deleted_by'),
  ('labor_safety_enrollment_protocols','created_by'),
  ('labor_safety_enrollment_protocols','source_user_id'),
  ('labor_safety_enrollment_protocols','updated_by'),
  ('labor_safety_profiles','user_id'),
  ('library_documents','created_by'),
  ('mailing_deliverability_seeds','created_by'),
  ('mailing_report_links','created_by'),
  ('mailing_senders','created_by'),
  ('marketplace_course_comments','user_id'),
  ('marketplace_orders','buyer_user_id'),
  ('org_billing_documents','deleted_by'),
  ('org_contract_template_versions','created_by'),
  ('org_custom_roles','created_by'),
  ('org_document_share_links','created_by'),
  ('org_documents','deleted_by'),
  ('org_signatories','created_by'),
  ('platform_invoice_acts','created_by'),
  ('platform_updates','created_by'),
  ('proposal_presets','created_by'),
  ('referral_attribution_log','user_id'),
  ('referral_partners','user_id'),
  ('sales_demo_links','created_by'),
  ('sales_demo_sessions','user_id'),
  ('sales_managers','user_id'),
  ('sales_tasks','created_by'),
  ('signature_comments','author_user_id'),
  ('signature_comments','resolved_by'),
  ('signature_revisions','created_by'),
  ('training_plans','created_by'),
  ('webinar_polls','created_by'),
  ('webinars','created_by'),
  ('webinars','host_user_id')
 ) x(t,c) LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING p_user_id;
  v_shared:=v_shared+v_count;
 END LOOP;
 v_shared:=v_shared+(SELECT count(*) FROM public.document_signatures WHERE (sender_user_id=p_user_id OR recipient_user_id=p_user_id) AND (sender_user_id IS DISTINCT FROM p_user_id OR recipient_user_id IS DISTINCT FROM p_user_id));
 v_shared:=v_shared+(SELECT count(*) FROM public.org_contracts WHERE student_user_id IS DISTINCT FROM p_user_id AND students::text LIKE '%'||p_user_id::text||'%');
 v_shared:=v_shared+(SELECT count(*) FROM public.group_documents WHERE student_user_id IS DISTINCT FROM p_user_id AND (variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%'));
 IF v_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_DATA_REVIEW_REQUIRED','message','Аккаунт связан с общими рабочими записями. Сначала нужно передать ответственность за них; данные других пользователей не удаляются.')); END IF;
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE (o.owner=p_user_id OR o.owner_id=p_user_id::text)
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_files) f WHERE f->>'bucket'=o.bucket_id AND f->>'path'=o.name)) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_FILES_REVIEW_REQUIRED','message','Есть загруженные аккаунтом файлы вне личных папок. Сначала нужно проверить их принадлежность организации.'));
 END IF;
 IF v_owner THEN
  -- Locking/revalidation occurs again in begin. A brand-new sole-owner
  -- organization may be removed with its default welcome course/templates.
  SELECT count(*) INTO v_org_shared FROM public.profiles WHERE organization_id=v_org AND user_id<>p_user_id;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=v_org);
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.organizations WHERE id=v_org AND (balance<>0 OR is_paid OR paid_until IS NOT NULL));
  FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','organization_id'),
  ('org_crm_deals','organization_id'),
  ('org_crm_tasks','organization_id'),
  ('org_crm_activities','organization_id'),
  ('achievements','organization_id'),
  ('admin_generated_documents','sent_to_organization_id'),
  ('admin_org_messages','organization_id'),
  ('ai_avatar_templates','organization_id'),
  ('audit_logs','organization_id'),
  ('balance_transactions','organization_id'),
  ('chat_groups','organization_id'),
  ('checko_search_presets','organization_id'),
  ('commercial_proposals','organization_id'),
  ('companies','organization_id'),
  ('company_requests','organization_id'),
  ('consent_documents','organization_id'),
  ('course_landing_history','organization_id'),
  ('course_payments','organization_id'),
  ('course_reminders','organization_id'),
  ('course_requests','organization_id'),
  ('course_snapshots','organization_id'),
  ('data_subject_requests','organization_id'),
  ('document_issuance_log','organization_id'),
  ('document_number_sequences','organization_id'),
  ('document_signatures','organization_id'),
  ('driving_audit','organization_id'),
  ('driving_cars','organization_id'),
  ('driving_courses','organization_id'),
  ('driving_entries','organization_id'),
  ('driving_entry_reversals','organization_id'),
  ('driving_groups','organization_id'),
  ('driving_instructors','organization_id'),
  ('driving_invites','organization_id'),
  ('driving_lessons','organization_id'),
  ('driving_memberships','organization_id'),
  ('driving_operations','organization_id'),
  ('driving_programs','organization_id'),
  ('driving_schools','organization_id'),
  ('driving_shifts','organization_id'),
  ('driving_students','organization_id'),
  ('education_document_records','organization_id'),
  ('email_action_tokens','organization_id'),
  ('email_campaign_consent_log','organization_id'),
  ('email_campaigns','organization_id'),
  ('email_drip_subscribers','organization_id'),
  ('frdo_signed_documents','organization_id'),
  ('goreltech_document_operations','organization_id'),
  ('goreltech_enrollment_orders','organization_id'),
  ('group_class_journal_marks','organization_id'),
  ('group_completion_decision_history','organization_id'),
  ('group_completion_decisions','organization_id'),
  ('group_document_schedules','organization_id'),
  ('group_documents','organization_id'),
  ('homework_submissions','organization_id'),
  ('incoming_documents','organization_id'),
  ('journal_instances','organization_id'),
  ('kinescope_usage_cache','organization_id'),
  ('knowledge_bank','organization_id'),
  ('labor_safety_enrollment_protocols','organization_id'),
  ('labor_safety_groups','organization_id'),
  ('labor_safety_profiles','organization_id'),
  ('library_documents','organization_id'),
  ('library_folders','organization_id'),
  ('mailing_campaign_ledger','organization_id'),
  ('mailing_campaign_replies','organization_id'),
  ('mailing_contacts','organization_id'),
  ('mailing_deliverability_checks','organization_id'),
  ('mailing_deliverability_seeds','organization_id'),
  ('mailing_report_links','organization_id'),
  ('mailing_seed_ledger','organization_id'),
  ('mailing_senders','organization_id'),
  ('marketplace_courses','organization_id'),
  ('marketplace_orders','buyer_organization_id'),
  ('ordinary_mail_report_events','organization_id'),
  ('org_billing_documents','organization_id'),
  ('org_contract_template_versions','organization_id'),
  ('org_contract_templates','organization_id'),
  ('org_contracts','organization_id'),
  ('org_custom_roles','organization_id'),
  ('org_document_share_links','organization_id'),
  ('org_document_versions','organization_id'),
  ('org_documents','organization_id'),
  ('org_general_messages','organization_id'),
  ('org_payers','organization_id'),
  ('org_services','organization_id'),
  ('org_signatories','organization_id'),
  ('org_smtp_settings','organization_id'),
  ('org_staff','organization_id'),
  ('org_student_messages','organization_id'),
  ('organization_comments','organization_id'),
  ('organization_payment_settings','organization_id'),
  ('organization_reminders','organization_id'),
  ('pending_enrollments','organization_id'),
  ('platform_invoice_acts','organization_id'),
  ('program_categories','organization_id'),
  ('program_documents','organization_id'),
  ('program_folders','organization_id'),
  ('program_training_plans','organization_id'),
  ('proposal_presets','organization_id'),
  ('referral_attribution_log','organization_id'),
  ('referral_commissions','organization_id'),
  ('referral_registrations','organization_id'),
  ('registration_links','organization_id'),
  ('role_audit_log','organization_id'),
  ('sales_blacklist','organization_id'),
  ('sales_companies_db','organization_id'),
  ('sales_contracts','organization_id'),
  ('sales_demo_links','organization_id'),
  ('sales_demo_sessions','organization_id'),
  ('sales_lead_activities','organization_id'),
  ('sales_leads','organization_id'),
  ('sales_tasks','organization_id'),
  ('service_orders','organization_id'),
  ('skillspace_import_jobs','organization_id'),
  ('staff_invitations','organization_id'),
  ('student_deletion_log','organization_id'),
  ('student_group_memberships','organization_id'),
  ('student_groups','organization_id'),
  ('student_roster_removals','organization_id'),
  ('subscription_invoices','organization_id'),
  ('system_diagnostics','organization_id'),
  ('testimonials','organization_id'),
  ('training_plans','organization_id'),
  ('webinars','organization_id')
  ) x(t,c) LOOP
   EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING v_org;
   v_org_shared:=v_org_shared+v_count;
  END LOOP;
  -- Only the audited seeded course is auto-removable in the first release.
  SELECT count(*) INTO v_courses FROM public.courses WHERE organization_id=v_org;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.courses WHERE organization_id=v_org AND system_key IS DISTINCT FROM 'welcome');
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_admission_cases WHERE organization_id=v_org);
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_group_education_states WHERE organization_id=v_org);
 IF v_org_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','OWNERSHIP_TRANSFER_REQUIRED','message','Организация содержит пользователей, обучение, платежи или рабочие записи. Сначала передайте управление организацией.','actionHref','/organization?tab=staff')); END IF;
 END IF;
 -- PEP is deletable only when it is the person's standalone agreement, not
 -- evidence attached to a document signature (the live FK is SET NULL).
 SELECT count(*) INTO v_documentary FROM public.pep_agreements pa
 WHERE pa.user_id=p_user_id AND EXISTS(SELECT 1 FROM public.document_signatures d WHERE d.pep_agreement_id=pa.id);
 -- An organization's offer acceptance belongs to the organization lifecycle.
 -- Remove it only together with the verified unused sole-owner organization.
 SELECT v_documentary+count(*) INTO v_documentary FROM public.organization_offer_acceptances a
 WHERE a.user_id=p_user_id AND NOT (v_owner AND v_org_shared=0 AND a.organization_id=v_org);
 IF v_documentary>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','DOCUMENTARY_RELATION_REVIEW_REQUIRED','message','Есть соглашение ПЭП, связанное с подписью документа, или акцепт оферты действующей организации. Эти общие документальные записи требуют отдельной обработки; удаление аккаунта не начато.')); END IF;
 v_education_outputs:=public.uc_education_saved_output_counts(p_user_id);v_education_unissued:=(v_education_outputs->>'unissued')::bigint;v_education_issued:=(v_education_outputs->>'issued')::bigint;
 IF v_education_unissued+v_education_issued>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','EDUCATION_ARTIFACT_RETENTION_REVIEW_REQUIRED','message','Сохранены файлы подготовки, ещё не выданные: '||v_education_unissued||'; архивы выданных документов: '||v_education_issued||'. Учебному центру нужно проверить черновики и основания дальнейшего хранения архива. Удаление аккаунта не начато.'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_frdo_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','FRDO_PACKET_RETENTION_REVIEW_REQUIRED','message','Сохранены персональные сведения и их копии в пакетах ФРДО, файлах, квитанциях или полномочиях оператора. Учебному центру нужно проверить основание и порядок дальнейшего хранения. Удаление аккаунта не начато.'));END IF;
 v_categories:=v_categories||jsonb_build_array(
  jsonb_build_object('key','account','label','Вход в аккаунт, пароль, профиль и личные настройки','count',1,'action','delete'),
  jsonb_build_object('key','private_files','label','Личные фотографии и загруженные документы','count',jsonb_array_length(v_files),'action','delete'),
  jsonb_build_object('key','learning_results','label','Назначения курсов, прогресс, попытки, ответы и результаты обучения','count',v_learning,'action','delete'),
  jsonb_build_object('key','institutional_documents','label','Оформленные документы','count',v_docs,'action',CASE WHEN v_docs>0 THEN 'block' ELSE 'delete' END));
 IF v_education_unissued+v_education_issued>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','education_artifact_outputs','label','Файлы подготовки и архив выданных документов: требуется проверка сохранения','count',v_education_unissued+v_education_issued,'action','block'));END IF;
 IF v_documentary>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','documentary_relations','label','Соглашения ПЭП и акцепты оферт, связанные с документами или действующей организацией','count',v_documentary,'action','block')); END IF;
 IF v_owner THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','empty_organization','label','Неиспользованная организация и ознакомительный курс','count',1,'action',CASE WHEN v_org_shared>0 THEN 'block' ELSE 'delete' END)); END IF;
 SELECT count(*) INTO v_count FROM public.audit_logs WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','common_audit','label','Общие события организации: запись события сохраняется, имя и ссылка на аккаунт удаляются','count',v_count,'action','anonymize')); END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_cases WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','admission_cases','label','Личные дела и их индивидуальные копии','count',v_count,'action','delete'));END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_case_events WHERE actor_id=p_user_id AND user_id<>p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','admission_review_attribution','label','Атрибуция внутренних проверок: удаляется ссылка на аккаунт и личный текст','count',v_count,'action','anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_frdo_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','frdo_retained_copies','label','Пакеты ФРДО, файлы, квитанции, источники и полномочия: требуется проверка хранения','count',v_count,'action','block'));END IF;
 v_categories:=v_categories||public.uc_group_education_deletion_preview(p_user_id);
 SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_learning_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','learning_outcomes','label','Результаты обучения и решения: личные строки удаляются, атрибуция обезличивается','count',v_count,'action','delete_or_anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_custom_journal_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','custom_journals','label','Собственные журналы: строки выбранного лица удаляются, авторские копии обезличиваются','count',v_count,'action','delete_or_anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_session_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','conducted_sessions','label','Проведённые занятия, посещение и черновики: личные сведения обезличиваются, редакции сохраняются','count',v_count,'action','anonymize'));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record','label','Техническая запись запрета старого доступа и квитанция об удалении без имени и контактов','count',1,'action','retain'));
 -- The snapshot is compared atomically just before the first mutation. Counts
 -- and manifest cover additions during the confirmation dialog; no PII stored.
 RETURN jsonb_build_object('organizationId',v_org,'emptyOrganization',v_owner AND v_org_shared=0,'learningCount',v_learning,
  'categories',v_categories,'blockers',v_blockers,'files',v_files,'sharedCount',v_shared,'personalRows',public.account_deletion_personal_row_counts(p_user_id),
  'profileRevision',p.updated_at,'role',(SELECT role::text FROM public.user_roles WHERE user_id=p_user_id LIMIT 1));
END;$function$;
-- One registry identity per immutable artifact, including archived records.
CREATE UNIQUE INDEX uc_frdo_registry_artifact_once ON public.uc_document_registry_records(organization_id,(data->'source'->>'artifact_id'))WHERE data->'source'->>'kind'='frdo_packet_artifact';


-- ASSEMBLED FRAGMENT 45_private_pagination.sql
-- Bounded scans use authenticated encrypted opaque cursors through installed pgcrypto.
-- No denied UUID/count, key, source capability or identity override is projected.
CREATE FUNCTION public.uc_frdo_cursor_encode(p_org uuid,p_scope jsonb,p_filter jsonb,p_after uuid)RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $fn$
DECLARE key bytea;body text;cipher bytea;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR p_after IS NULL THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;PERFORM public.uc_education_issue_scope(p_org,p_scope);
 SELECT p.cursor_secret INTO key FROM public.uc_frdo_packets p WHERE p.organization_id=p_org ORDER BY p.created_at,p.id LIMIT 1;
 IF key IS NULL OR octet_length(key)<>32 THEN PERFORM public.uc_frdo_error('SOURCE_UNAVAILABLE');END IF;
 body:=public.uc_frdo_canonical(jsonb_build_object('version',1,'organization_id',p_org,'actor_id',auth.uid(),'scope',p_scope,'filter',p_filter,'after',p_after,'expires_at',to_char(clock_timestamp()+interval'30 minutes','YYYY-MM-DD"T"HH24:MI:SS.USOF')));
 -- pgcrypto OpenPGP integrity protection remains enabled (disable-mdc is never set).
 cipher:=pgp_sym_encrypt(body,encode(key,'hex'),'cipher-algo=aes256,compress-algo=0');RETURN'v1.'||encode(cipher,'hex');
END;$fn$;

CREATE FUNCTION public.uc_frdo_cursor_decode(p_org uuid,p_scope jsonb,p_filter jsonb,p_cursor jsonb)RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $fn$
DECLARE key bytea;raw bytea;body jsonb;
BEGIN
 IF p_cursor='null'::jsonb THEN RETURN NULL;END IF;
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR jsonb_typeof(p_cursor)IS DISTINCT FROM'string'OR char_length(p_cursor#>>'{}')NOT BETWEEN 67 AND 8195 OR p_cursor#>>'{}'!~'^v1\.[a-f0-9]+$'THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;PERFORM public.uc_education_issue_scope(p_org,p_scope);
 SELECT p.cursor_secret INTO key FROM public.uc_frdo_packets p WHERE p.organization_id=p_org ORDER BY p.created_at,p.id LIMIT 1;
 IF key IS NULL OR octet_length(key)<>32 THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
 BEGIN raw:=decode(substring(p_cursor#>>'{}'FROM 4),'hex');body:=pgp_sym_decrypt(raw,encode(key,'hex'))::jsonb;EXCEPTION WHEN OTHERS THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END;
 IF NOT public.uc_frdo_shape(body,ARRAY['version','organization_id','actor_id','scope','filter','after','expires_at'])OR body->'version'IS DISTINCT FROM'1'::jsonb OR body->'organization_id'IS DISTINCT FROM to_jsonb(p_org)OR body->'actor_id'IS DISTINCT FROM to_jsonb(auth.uid())OR body->'scope'IS DISTINCT FROM p_scope OR body->'filter'IS DISTINCT FROM p_filter OR NOT public.uc_custom_journal_uuid(body->'after')OR jsonb_typeof(body->'expires_at')IS DISTINCT FROM'string'OR(body->>'expires_at')::timestamptz<=clock_timestamp()THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
 RETURN(body->>'after')::uuid;
END;$fn$;


-- ASSEMBLED FRAGMENT 50_read_projections.sql
CREATE FUNCTION public.uc_frdo_artifact_json(p public.uc_frdo_packet_artifact_builds)RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('id',p.id,'artifact_id',p.artifact_id,'packet_id',p.packet_id,'input_revision',p.input_revision,'snapshot_sha256',p.snapshot_sha256,'worker_request_id',p.worker_request_id,'recorded_at',p.recorded_at,'state',p.phase,'artifact',p.artifact_ref,'failure',p.failure)||CASE WHEN p.phase='sealed'THEN jsonb_build_object('signing',p.signing,'template',p.template,'readback_sha256',p.readback_sha256,'registry_record_id',p.registry_record_id)ELSE'{}'::jsonb END$fn$;

CREATE FUNCTION public.uc_frdo_authority_json(p public.uc_frdo_operator_authority_revisions)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR NOT public.account_deletion_access_allowed()OR NOT public.uc_document_has_action(p.organization_id,'read')THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;PERFORM public.uc_frdo_fence(p.retained_people||ARRAY[auth.uid()]);
 RETURN jsonb_build_object('ref',public.uc_frdo_authority_ref(p),'fact_kind','organization_recorded_appointment','state',p.state,'validity',p.validity,'evidence',public.uc_frdo_source_projection(p.organization_id,p.evidence),'external_delegation_verified',false,'recorded_at',p.recorded_at,'recorded_by',p.recorded_by,'revocation_event_id',p.revocation_event_id);
END;$fn$;

CREATE FUNCTION public.uc_frdo_currency(p_packet uuid)RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM public.uc_frdo_packet_access(p_packet,false);
 BEGIN PERFORM public.uc_frdo_packet_current(p_packet,false);RETURN'current';
 EXCEPTION WHEN SQLSTATE'PT409'OR SQLSTATE'PT400'OR SQLSTATE'PT403'OR SQLSTATE'PT401'OR SQLSTATE'PT404'OR SQLSTATE'42501'OR SQLSTATE'22023' THEN
  IF SQLERRM NOT LIKE'FRDO_PACKET_%'AND SQLERRM NOT LIKE'EDUCATION_%'AND SQLERRM NOT LIKE'DOCUMENT_REGISTRY_%'AND SQLERRM NOT LIKE'UC_%'THEN RAISE;END IF;
  RETURN CASE WHEN SQLSTATE='PT409'THEN'changed'ELSE'unavailable'END;
 END;
END;$fn$;

CREATE FUNCTION public.uc_frdo_packet_json(p_packet uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.uc_frdo_packets;b public.uc_frdo_packet_artifact_builds;currency text;can_write boolean:=false;can_file boolean:=false;can_operator boolean:=false;can_manage boolean:=false;issuer jsonb;
BEGIN
 p:=public.uc_frdo_packet_access(p_packet,false);currency:=public.uc_frdo_currency(p.id);
 BEGIN PERFORM public.uc_frdo_packet_access(p.id,true);can_write:=true;EXCEPTION WHEN SQLSTATE'PT403'OR SQLSTATE'PT401'OR SQLSTATE'42501' THEN can_write:=false;END;
 SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE id=p.current_build_id AND packet_id=p.id;
 IF b.phase='sealed'THEN BEGIN PERFORM public.uc_frdo_artifact_access(p.id,b.artifact_ref,false,false);can_file:=true;EXCEPTION WHEN SQLSTATE'PT409'OR SQLSTATE'PT403' THEN can_file:=false;END;END IF;
 can_operator:=can_write AND EXISTS(SELECT 1 FROM public.uc_frdo_operator_authority_revisions a WHERE a.organization_id=p.organization_id AND a.operator_user_id=auth.uid()AND a.state='active'AND NOT EXISTS(SELECT 1 FROM public.uc_frdo_operator_authority_revisions newer WHERE newer.id=a.id AND newer.revision>a.revision)AND clock_timestamp()>=(a.validity->>'from')::timestamptz AND(a.validity->>'kind'='explicit_open_end'OR clock_timestamp()<(a.validity->>'until')::timestamptz)AND public.uc_frdo_source_projection(p.organization_id,a.evidence)->>'availability'='available');
 can_manage:=can_write AND NOT public.uc_document_teacher_limited(p.organization_id)AND public.uc_document_action_allowed(p.organization_id,'write',NULL,NULL);
 issuer:=p.issuer_review;issuer:=jsonb_set(issuer,'{evidence}',public.uc_frdo_source_projection(p.organization_id,p.issuer_review->'evidence'->'evidence'));
 RETURN jsonb_build_object('ref',public.uc_frdo_packet_ref(p),'stream',p.stream,'state',p.state,'capture',p.capture,'created_at',p.created_at,'created_by',p.created_by,'source_currency',currency,'current_build',CASE WHEN b.id IS NOT NULL THEN public.uc_frdo_artifact_json(b)END,'latest_registry_record_id',p.latest_registry_record_id,'latest_admin_handover_event_id',p.latest_admin_handover_event_id,'latest_upload_event_id',p.latest_upload_event_id,'latest_receipt_event_id',p.latest_receipt_event_id,'parent_correction',p.parent_correction,'issuer_review',issuer,
 'capabilities',jsonb_build_object('can_read',true,'can_preview',can_write,'can_review_supplement',can_write,'can_generate_file',can_write AND currency='current'AND p.state IN('preview_frozen','file_generation_failed','file_generated'),'can_record_admin_handover',can_write AND can_file AND currency='current'AND p.state IN('file_generated','administrative_handover_recorded'),'can_record_external_upload',can_operator AND can_file AND currency='current'AND p.state IN('file_generated','administrative_handover_recorded'),'can_record_receipt',can_operator AND p.state IN('fis_upload_recorded','receipt_unresolved'),'can_create_correction',can_write AND p.state IN('partially_rejected','rejected'),'can_register_packet',can_write AND can_file AND currency='current'AND b.registry_record_id IS NULL AND p.state IN('file_generated','administrative_handover_recorded'),'can_manage_operators',can_manage,'can_abandon_correction',can_write AND p.parent_correction IS NOT NULL AND p.latest_upload_event_id IS NULL AND p.latest_receipt_event_id IS NULL AND p.state IN('preview_frozen','file_generating','file_generation_failed','file_generated','administrative_handover_recorded')));
END;$fn$;

CREATE FUNCTION public.uc_frdo_summary(p public.uc_frdo_packets)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.uc_frdo_packet_access(p.id,false);RETURN jsonb_build_object('ref',public.uc_frdo_packet_ref(p),'stream',p.stream,'state',p.state,'row_count',jsonb_array_length(p.capture->'mapped_batch'->'rows'),'source_currency',public.uc_frdo_currency(p.id),'created_at',p.created_at);END;$fn$;

CREATE FUNCTION public.uc_frdo_event_json(p public.uc_frdo_packet_events)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE payload jsonb;receipt jsonb;operations jsonb;
BEGIN
 PERFORM public.uc_frdo_packet_access(p.packet_id,false);PERFORM public.uc_frdo_fence(p.retained_people);
 payload:=p.payload;
 IF p.kind='fis_upload'THEN
  payload:=jsonb_set(payload,'{evidence}',public.uc_frdo_source_projection(p.organization_id,payload->'evidence'));
  SELECT coalesce(jsonb_agg(value||jsonb_build_object('evidence',public.uc_frdo_source_projection(p.organization_id,value->'evidence'))ORDER BY ordinal),'[]')INTO operations FROM jsonb_array_elements(payload->'external_operations')WITH ORDINALITY a(value,ordinal);payload:=jsonb_set(payload,'{external_operations}',operations);
 ELSIF p.kind='receipt_recorded'THEN receipt:=payload->'receipt';receipt:=jsonb_set(receipt,'{receipt_evidence}',public.uc_frdo_source_projection(p.organization_id,receipt->'receipt_evidence'));payload:=jsonb_set(payload,'{receipt}',receipt);END IF;
 RETURN jsonb_build_object('id',p.id,'revision',p.revision,'actor_id',p.actor_id,'recorded_at',p.recorded_at,'previous_state_hash',p.previous_state_hash,'state_hash',p.state_hash,'payload_sha256',p.payload_sha256,'kind',p.kind)||payload;
END;$fn$;

CREATE FUNCTION public.read_frdo_packets(p_request jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE org uuid;v_scope jsonb;q jsonb;kind text;envelope jsonb;result jsonb;p public.uc_frdo_packets;candidate public.uc_frdo_packets;b public.uc_frdo_packet_artifact_builds;s public.uc_frdo_supplement_revisions;a public.uc_frdo_operator_authority_revisions;e public.uc_frdo_packet_events;items jsonb:='[]';limit_count integer;ceiling bigint;cursor uuid;next_cursor uuid;next_revision bigint;rows_found integer:=0;file jsonb;filter jsonb;next_token text;scanned integer:=0;last_seen uuid;previous_seen uuid;
BEGIN
 IF NOT public.uc_frdo_shape(p_request,ARRAY['schema_version','abi_revision','organization_id','scope','query'])OR p_request->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_request->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_request->'organization_id')OR octet_length(p_request::text)>200000 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 org:=(p_request->>'organization_id')::uuid;v_scope:=p_request->'scope';q:=p_request->'query';kind:=q->>'kind';PERFORM public.uc_education_issue_scope(org,v_scope);IF NOT public.uc_document_has_action(org,'read')THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
 envelope:=jsonb_build_object('schema_version',1,'abi_revision','uc020-persisted-v5','organization_id',org,'scope',v_scope,'actor_id',auth.uid(),'kind',kind);
 IF kind='supplement'THEN
  IF NOT public.uc_frdo_shape(q,ARRAY['kind','record_id'])OR NOT public.uc_custom_journal_uuid(q->'record_id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;PERFORM public.uc_frdo_record_live(org,v_scope,(q->>'record_id')::uuid,false,false);SELECT *INTO s FROM public.uc_frdo_supplement_revisions WHERE organization_id=org AND record_id=(q->>'record_id')::uuid AND NOT redacted ORDER BY revision DESC LIMIT 1;
  RETURN envelope||jsonb_build_object('supplement',CASE WHEN s.id IS NOT NULL THEN public.uc_frdo_supplement_json(s,v_scope)END);
 ELSIF kind='authorities'THEN
  IF NOT public.uc_frdo_shape(q,ARRAY['kind','operator_user_id','after_id','limit'])OR v_scope->>'kind'<>'organization'OR q->'operator_user_id'<>'null'::jsonb AND NOT public.uc_custom_journal_uuid(q->'operator_user_id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 ELSIF kind='packets'THEN
  IF NOT public.uc_frdo_shape(q,ARRAY['kind','after_cursor','limit','stream'])OR NOT(q->'stream'='null'::jsonb OR q->>'stream'IN('dpo','po'))THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
 ELSE
  IF kind='download'THEN
   IF NOT public.uc_frdo_shape(q,ARRAY['kind','packet','artifact','purpose'])OR NOT public.uc_custom_journal_uuid(q->'packet'->'id')OR q->>'purpose'NOT IN('current_submission','historical_copy')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
   p:=public.uc_frdo_packet_access((q->'packet'->>'id')::uuid,false);IF public.uc_frdo_packet_ref(p)IS DISTINCT FROM q->'packet'THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;b:=public.uc_frdo_artifact_access(p.id,q->'artifact',q->>'purpose'='current_submission',false);
   IF p.organization_id IS DISTINCT FROM org OR p.scope IS DISTINCT FROM v_scope THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
   -- Internal descriptor: the HTTP adapter signs through the ORIGINAL JWT and
   -- re-reads this same authorization after signing before returning the URL.
   RETURN envelope||jsonb_build_object('descriptor',jsonb_build_object('bucket',b.bucket_id,'path',b.object_path,'object_id',b.object_id,'updated_at',b.object_updated_at,'byte_sha256',b.byte_sha256,'byte_size',b.byte_size,'packet_id',p.id,'artifact_id',b.artifact_id,'signing',b.signing));
  END IF;
  IF NOT public.uc_custom_journal_uuid(q->'packet_id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;p:=public.uc_frdo_packet_access((q->>'packet_id')::uuid,false);
  IF p.organization_id IS DISTINCT FROM org OR p.scope IS DISTINCT FROM v_scope THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;
  IF kind IN('receipt','corrections')THEN envelope:=envelope||jsonb_build_object('packet_id',p.id);END IF;
  IF kind='packet'THEN IF NOT public.uc_frdo_shape(q,ARRAY['kind','packet_id'])THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;RETURN envelope||jsonb_build_object('packet',public.uc_frdo_packet_json(p.id));END IF;
  IF kind='receipt'THEN IF NOT public.uc_frdo_shape(q,ARRAY['kind','packet_id','receipt_event_id'])OR NOT public.uc_custom_journal_uuid(q->'receipt_event_id')THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;SELECT ev.*INTO e FROM public.uc_frdo_packet_events ev WHERE ev.packet_id=p.id AND ev.id=(q->>'receipt_event_id')::uuid AND ev.kind='receipt_recorded';IF e.id IS NULL THEN PERFORM public.uc_frdo_error('SOURCE_UNAVAILABLE');END IF;RETURN envelope||jsonb_build_object('receipt',public.uc_frdo_event_json(e)->'receipt','external_origin_verified',false);END IF;
 END IF;
 IF jsonb_typeof(q->'limit')IS DISTINCT FROM'number'OR(q->>'limit')::numeric<>trunc((q->>'limit')::numeric)OR(q->>'limit')::numeric NOT BETWEEN 1 AND 50 THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;limit_count:=(q->>'limit')::integer;
 IF kind='history'THEN
  IF NOT public.uc_frdo_shape(q,ARRAY['kind','packet_id','ceiling_revision','before_revision','limit'])THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  ceiling:=coalesce((q->>'ceiling_revision')::bigint,p.revision);IF ceiling NOT BETWEEN 1 AND p.revision OR(q->>'before_revision')::bigint<=0 THEN PERFORM public.uc_frdo_error('REVISION_CONFLICT');END IF;
  FOR e IN SELECT *FROM public.uc_frdo_packet_events WHERE packet_id=p.id AND revision<=ceiling AND(q->'before_revision'='null'::jsonb OR revision<(q->>'before_revision')::bigint)ORDER BY revision DESC LIMIT limit_count+1 LOOP
   rows_found:=rows_found+1;IF rows_found>limit_count THEN next_revision:=(items->(jsonb_array_length(items)-1)->>'revision')::bigint;EXIT;END IF;items:=items||jsonb_build_array(public.uc_frdo_event_json(e));
  END LOOP;RETURN envelope||jsonb_build_object('packet_id',p.id,'events',items,'ceiling_revision',ceiling,'next_before_revision',next_revision);
 END IF;
 IF kind IN('packets','corrections')THEN filter:=jsonb_build_object('kind',kind,'stream',q->'stream','parent_packet_id',CASE WHEN kind='corrections'THEN p.id END);cursor:=public.uc_frdo_cursor_decode(org,v_scope,filter,q->'after_cursor');
 ELSE IF NOT(q->'after_id'='null'::jsonb OR public.uc_custom_journal_uuid(q->'after_id'))THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;cursor:=(q->>'after_id')::uuid;END IF;
 IF kind='authorities'THEN
  FOR a IN SELECT x.*FROM public.uc_frdo_operator_authority_revisions x WHERE x.organization_id=org AND(cursor IS NULL OR x.id>cursor)AND(q->'operator_user_id'='null'::jsonb OR x.operator_user_id=(q->>'operator_user_id')::uuid)AND NOT EXISTS(SELECT 1 FROM public.uc_frdo_operator_authority_revisions n WHERE n.id=x.id AND n.revision>x.revision)ORDER BY x.id LIMIT limit_count+1 LOOP
   rows_found:=rows_found+1;IF rows_found>limit_count THEN next_cursor:=(items->(jsonb_array_length(items)-1)->'ref'->>'id')::uuid;EXIT;END IF;items:=items||jsonb_build_array(public.uc_frdo_authority_json(a));
  END LOOP;RETURN envelope||jsonb_build_object('authorities',items,'next_after_id',next_cursor);
 ELSIF kind='artifacts'THEN
  IF NOT public.uc_frdo_shape(q,ARRAY['kind','packet_id','after_id','limit'])THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  FOR b IN SELECT *FROM public.uc_frdo_packet_artifact_builds WHERE packet_id=p.id AND(cursor IS NULL OR id>cursor)ORDER BY id LIMIT limit_count+1 LOOP rows_found:=rows_found+1;IF rows_found>limit_count THEN next_cursor:=(items->(jsonb_array_length(items)-1)->>'id')::uuid;EXIT;END IF;PERFORM public.uc_frdo_fence(b.retained_people);items:=items||jsonb_build_array(public.uc_frdo_artifact_json(b));END LOOP;
  RETURN envelope||jsonb_build_object('packet_id',p.id,'artifacts',items,'next_after_id',next_cursor);
 ELSIF kind IN('packets','corrections')THEN
  IF kind='corrections'AND NOT public.uc_frdo_shape(q,ARRAY['kind','packet_id','after_cursor','limit'])THEN PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
  -- Denied candidates contribute neither identifiers nor counts. Scan is bounded
  -- to this exact tenant/scope page; an auth error is not a source-currency change.
  FOR candidate IN SELECT *FROM public.uc_frdo_packets WHERE organization_id=org AND uc_frdo_packets.scope=v_scope AND NOT redacted AND(cursor IS NULL OR id>cursor)AND(kind<>'packets'OR q->'stream'='null'::jsonb OR stream=q->>'stream')AND(kind<>'corrections'OR parent_correction->'parent_job'->>'id'=p.id::text)ORDER BY id LIMIT 100 LOOP
   scanned:=scanned+1;previous_seen:=last_seen;last_seen:=candidate.id;
   BEGIN PERFORM public.uc_frdo_packet_access(candidate.id,false);EXCEPTION WHEN SQLSTATE'PT403'OR SQLSTATE'PT401'OR SQLSTATE'42501' THEN CONTINUE;END;
   rows_found:=rows_found+1;IF rows_found>limit_count THEN next_token:=public.uc_frdo_cursor_encode(org,v_scope,filter,previous_seen);EXIT;END IF;items:=items||jsonb_build_array(public.uc_frdo_summary(candidate));
  END LOOP;IF next_token IS NULL AND scanned=100 THEN next_token:=public.uc_frdo_cursor_encode(org,v_scope,filter,last_seen);END IF;RETURN envelope||jsonb_build_object('packets',items,'next_cursor',next_token);
 ELSE PERFORM public.uc_frdo_error('INVALID_REQUEST');END IF;
END;$fn$;


-- ASSEMBLED FRAGMENT 60_mutation_result.sql
CREATE FUNCTION public.uc_frdo_mutation_result(p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.uc_frdo_packet_requests;packet_id uuid;supplement_id uuid;authority_id uuid;p public.uc_frdo_packets;s public.uc_frdo_supplement_revisions;a public.uc_frdo_operator_authority_revisions;packets jsonb:='[]';supplement jsonb;authority jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR NOT public.account_deletion_access_allowed()OR NOT public.uc_custom_journal_uuid(p_command->'request_id')OR NOT public.uc_custom_journal_uuid(p_command->'organization_id')THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 PERFORM public.uc_education_issue_scope((p_command->>'organization_id')::uuid,p_command->'scope');
 SELECT *INTO r FROM public.uc_frdo_packet_requests WHERE actor_id=auth.uid()AND request_id=(p_command->>'request_id')::uuid;
 IF r.request_id IS NULL OR r.phase<>'committed'OR r.payload_sha256 IS DISTINCT FROM public.uc_frdo_hash(p_command)OR r.organization_id IS DISTINCT FROM(p_command->>'organization_id')::uuid OR r.scope IS DISTINCT FROM p_command->'scope'THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;PERFORM public.uc_frdo_fence(r.retained_people);
 FOR packet_id IN SELECT value::uuid FROM jsonb_array_elements_text(r.receipt->'packet_ids')LOOP
  p:=public.uc_frdo_packet_access(packet_id,false);IF p.organization_id IS DISTINCT FROM r.organization_id OR p.scope IS DISTINCT FROM r.scope THEN PERFORM public.uc_frdo_error('ACCESS_DENIED');END IF;packets:=packets||jsonb_build_array(public.uc_frdo_packet_json(packet_id));
 END LOOP;
 FOR supplement_id IN SELECT value::uuid FROM jsonb_array_elements_text(r.receipt->'supplement_ids')LOOP
  SELECT *INTO s FROM public.uc_frdo_supplement_revisions WHERE id=supplement_id AND organization_id=r.organization_id;IF s.id IS NULL THEN PERFORM public.uc_frdo_error('SOURCE_UNAVAILABLE');END IF;supplement:=public.uc_frdo_supplement_json(s,r.scope);
 END LOOP;
 FOR authority_id IN SELECT value::uuid FROM jsonb_array_elements_text(r.receipt->'authority_ids')LOOP
  SELECT *INTO a FROM public.uc_frdo_operator_authority_revisions WHERE id=authority_id AND organization_id=r.organization_id ORDER BY revision DESC LIMIT 1;IF a.id IS NULL THEN PERFORM public.uc_frdo_error('SOURCE_UNAVAILABLE');END IF;authority:=public.uc_frdo_authority_json(a);
 END LOOP;
 RETURN jsonb_build_object('schema_version',1,'abi_revision','uc020-persisted-v5','organization_id',r.organization_id,'scope',r.scope,'actor_id',auth.uid(),'replayed',false,'receipt',r.receipt,'packets',packets,'supplement',supplement,'authority',authority);
END;$fn$;

CREATE FUNCTION public.uc_frdo_pending_worker_request(p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.uc_frdo_packet_requests;b public.uc_frdo_packet_artifact_builds;
BEGIN
 PERFORM public.uc_frdo_request_file(p_command);
 SELECT *INTO r FROM public.uc_frdo_packet_requests WHERE actor_id=auth.uid()AND request_id=(p_command->>'request_id')::uuid;
 SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE id=(r.intent_refs->>'build_id')::uuid AND worker_request_id=r.request_id AND actor_id=auth.uid()AND organization_id=r.organization_id;
 IF b.id IS NULL OR r.action_kind<>'generate_file'OR r.payload_sha256 IS DISTINCT FROM public.uc_frdo_hash(p_command)THEN PERFORM public.uc_frdo_error('IDEMPOTENCY_CONFLICT');END IF;PERFORM public.uc_frdo_packet_access(b.packet_id,true);
 RETURN jsonb_build_object('schema_version',1,'abi_revision','uc020-persisted-v5','organization_id',b.organization_id,'packet_id',b.packet_id,'build_id',b.id,'input_revision',b.input_revision,'request_id',b.worker_request_id);
END;$fn$;


-- ASSEMBLED FRAGMENT 62_correction_selection.sql
CREATE FUNCTION public.uc_frdo_read_correction_selection(p_org uuid,p_scope jsonb,p_plan jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE resolved jsonb;
BEGIN
 resolved:=public.uc_frdo_correction_plan(p_org,p_scope,p_plan,true);
 RETURN resolved- 'people';
END;$fn$;


-- ASSEMBLED FRAGMENT 13_action_sources.sql
-- The worker obtains file locations only from the complete authorized command;
-- no independently supplied URL/path/actor or generic projection RPC is exposed.
CREATE FUNCTION public.uc_frdo_action_sources(p_command jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE beginning jsonb;a jsonb:=p_command->'action';sources jsonb:='[]';proof jsonb;descriptor jsonb;descriptors jsonb:='[]';org uuid;
BEGIN
 IF a->>'kind'='save_supplement'THEN beginning:=public.uc_frdo_begin_supplement(p_command);
 ELSE beginning:=public.uc_frdo_begin_evidenced_action(p_command);END IF;
 IF beginning->>'phase'='committed'THEN RETURN jsonb_build_object('phase','committed','receipt',beginning->'receipt','source_descriptors','[]'::jsonb);END IF;
 org:=(p_command->>'organization_id')::uuid;
 IF a->>'kind'='save_supplement'THEN
  FOR proof IN SELECT value FROM jsonb_array_elements(a->'input'->'evidence')UNION ALL SELECT a->'input'->'fields'->'snils_exception'->'not_assigned_confirmation'WHERE a->'input'->'fields'->'snils_exception'->>'kind'='external_support_approval'UNION ALL SELECT a->'input'->'fields'->'snils_exception'->'approval_evidence'WHERE a->'input'->'fields'->'snils_exception'->>'kind'='external_support_approval'LOOP sources:=public.uc_frdo_source_set_add(sources,proof);END LOOP;
 ELSE
  sources:=public.uc_frdo_source_set_add(sources,CASE WHEN a->>'kind'='record_receipt'THEN a->'receipt'->'receipt_evidence'ELSE a->'evidence'END);
  IF a->>'kind'='record_fis_upload'THEN FOR proof IN SELECT value->'evidence'FROM jsonb_array_elements(a->'external_operations')LOOP sources:=public.uc_frdo_source_set_add(sources,proof);END LOOP;END IF;
 END IF;
 FOR proof IN SELECT value FROM jsonb_array_elements(sources)LOOP
  descriptor:=public.uc_frdo_source_descriptor(org,proof->'source');IF descriptor->'byte_size'IS DISTINCT FROM proof->'byte_size'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
  descriptors:=descriptors||jsonb_build_array(descriptor||jsonb_build_object('expected_sha256',proof->'byte_sha256'));
 END LOOP;
 RETURN jsonb_build_object('phase','pending','receipt',NULL,'source_descriptors',descriptors);
END;$fn$;

CREATE FUNCTION public.uc_frdo_candidate_object(p_request jsonb,p_lease uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
DECLARE b public.uc_frdo_packet_artifact_builds;o storage.objects;
BEGIN
 PERFORM public.uc_frdo_assert_file_claim(p_request,p_lease);
 SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE id=(p_request->>'build_id')::uuid;
 SELECT *INTO o FROM storage.objects WHERE bucket_id=b.bucket_id AND name=b.object_path;
 IF o.id IS NULL OR o.user_metadata->>'build_id'IS DISTINCT FROM b.id::text OR o.user_metadata->>'request_id'IS DISTINCT FROM b.worker_request_id::text OR o.user_metadata->>'snapshot_sha256'IS DISTINCT FROM b.snapshot_sha256 OR lower(btrim(o.metadata->>'mimetype'))IS DISTINCT FROM b.mime OR(o.metadata->>'size')::bigint IS NULL OR(o.metadata->>'size')::bigint NOT BETWEEN 1 AND 20971520 THEN PERFORM public.uc_frdo_error('ARTIFACT_UNAVAILABLE');END IF;
 -- An immutable object from an earlier expired lease may be recovered ONLY by
 -- the same build/actor/request/snapshot, followed by actual J byte readback and
 -- current lease/CAS attestation. It is never overwritten or accepted on size.
 RETURN jsonb_build_object('object_id',o.id,'updated_at',o.updated_at,'byte_size',(o.metadata->>'size')::bigint);
END;$fn$;

CREATE FUNCTION public.uc_frdo_assert_file_claim(p_request jsonb,p_lease uuid)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.uc_frdo_packets;b public.uc_frdo_packet_artifact_builds;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR NOT public.uc_frdo_shape(p_request,ARRAY['schema_version','abi_revision','organization_id','packet_id','build_id','input_revision','request_id'])OR p_request->'schema_version'IS DISTINCT FROM'1'::jsonb OR p_request->>'abi_revision'IS DISTINCT FROM'uc020-persisted-v5'OR NOT public.uc_custom_journal_uuid(p_request->'packet_id')OR NOT public.uc_custom_journal_uuid(p_request->'build_id')THEN PERFORM public.uc_frdo_error('AUTH_REQUIRED');END IF;
 p:=public.uc_frdo_packet_current((p_request->>'packet_id')::uuid,true);
 SELECT *INTO b FROM public.uc_frdo_packet_artifact_builds WHERE id=(p_request->>'build_id')::uuid;
 IF b.id IS NULL OR b.actor_id IS DISTINCT FROM auth.uid()OR b.packet_id IS DISTINCT FROM p.id OR b.organization_id IS DISTINCT FROM p.organization_id OR p_request->'organization_id'IS DISTINCT FROM to_jsonb(p.organization_id)OR p_request->'input_revision'IS DISTINCT FROM to_jsonb(b.input_revision)OR p_request->'request_id'IS DISTINCT FROM to_jsonb(b.worker_request_id)OR b.phase<>'generating'OR b.lease_id IS DISTINCT FROM p_lease OR b.lease_until<=clock_timestamp()OR p.current_build_id IS DISTINCT FROM b.id OR p.revision<>b.input_revision+1 OR p.state<>'file_generating'THEN PERFORM public.uc_frdo_error('SOURCE_CHANGED');END IF;
END;$fn$;


-- ASSEMBLED FRAGMENT 90_narrow_acl.sql
-- Proposed exact final ACL, SOURCE ONLY until the complete bundle/native lab and
-- preservation wrapper are reviewed. No old object/default/role ACL is changed.
DO $close_new_functions$
DECLARE routine regprocedure;principal oid;owner_oid oid;principal_sql text;
BEGIN
 FOR routine IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(left(p.proname,8)='uc_frdo_'OR p.proname='read_frdo_packets')LOOP
  SELECT proowner INTO owner_oid FROM pg_proc WHERE oid=routine;
  FOR principal IN SELECT DISTINCT x.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x WHERE p.oid=routine AND x.grantee<>owner_oid LOOP
   principal_sql:=CASE WHEN principal=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(principal))END;EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s',routine,principal_sql);
  END LOOP;
  EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC',routine);
 END LOOP;
END;$close_new_functions$;

GRANT EXECUTE ON FUNCTION public.uc_frdo_begin_freeze(jsonb),public.uc_frdo_begin_correction(jsonb),public.uc_frdo_read_inputs(uuid,jsonb,jsonb,jsonb,boolean),public.uc_frdo_read_correction_selection(uuid,jsonb,jsonb),public.uc_frdo_action_sources(jsonb),public.uc_frdo_claim_file(jsonb),public.uc_frdo_assert_file_claim(jsonb,uuid),public.uc_frdo_fail_file(uuid,uuid,text),public.uc_frdo_candidate_object(jsonb,uuid),public.read_frdo_packets(jsonb),public.uc_frdo_mutation_result(jsonb),public.uc_frdo_pending_worker_request(jsonb),public.uc_frdo_apply_direct(jsonb),public.uc_frdo_abandon_correction(jsonb),public.uc_frdo_storage_object_can_read(storage.objects) TO authenticated;
GRANT EXECUTE ON FUNCTION public.uc_frdo_commit_freeze(jsonb),public.uc_frdo_commit_correction(jsonb),public.uc_frdo_commit_supplement(jsonb),public.uc_frdo_commit_evidenced_action(jsonb),public.uc_frdo_seal_file(jsonb)TO service_role;
-- No table/sequence grant, PUBLIC/anon grant, old-function regrant, role change,
-- default-privilege change, broad read-helper or generic identity-projection API.


-- Held source rehearsal only. This is not a production deployment.
COMMIT;
