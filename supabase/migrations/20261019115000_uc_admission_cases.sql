-- UC012: exact bound personal case. Human internal review only. No legal rule
-- inference, issuance, learning access, date backfill, notifications or scheduler.
-- Installed100–114 and five reviewed erasure bodies are pinned below.

DO $preflight$BEGIN IF EXISTS(SELECT 1 FROM(VALUES
('public.account_deletion_erase_data(uuid,text)','0195ff3304609fad30cc773b1d7e348b'),
('public.account_deletion_files(uuid)','5e4638a7fb1a8909b393e94a64d88beb'),
('public.account_deletion_personal_row_counts(uuid)','b73ea401e57da586acfc0b16ee6c4435'),
('public.account_deletion_snapshot(uuid)','90a1b279ec2d55a922f5097b1cdac0a4'),
('public.account_deletion_storage_write_guard()','4c34fa5ade42bbd0deeac51e455709ea'),
('public.has_org_staff_permission(uuid,uuid,text)','3d1fedafe94778fa19dd47acb71a3782'),
('public.is_org_owner(uuid,uuid)','362aca6afc26c775be594843258b2ab2'),
('public.uc_document_action_allowed(uuid,text,uuid,uuid)','79c190a053f711dc8110e9d451b1a56c'),
('public.uc_identification_actor_allowed(uuid,boolean)','6506ece1c2b3123e5b38276594fca2a2'),
('public.uc_identification_target_allowed(uuid,uuid,boolean)','68d1c14d8472234a22fd09365ba5bb61'),
('public.uc_org_document_review_file_bound(org_documents)','52a37a3afd327393cc73b8af2a784316'),
('public.uc_org_document_review_file_state(org_documents)','1d653238bb9409357a17dc18fe78e060'),
('public.uc_platform_document_action_allowed(uuid,text)','e5a1436d0cc46218d379c3ffec8c0d0d'),
('public.uc_program_file_proof(uuid,uuid)','129853325186d540264e5d10c6a36ad8'),
('public.uc_student_frdo_staff_org_allowed(uuid,uuid,text)','541b10208fdf1b4788ce4eae588110a6'))v(signature,hash)WHERE to_regprocedure(signature)IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>hash)THEN RAISE EXCEPTION 'Admission: unreviewed installed114 baseline';END IF;
 IF to_regclass('public.uc_admission_cases')IS NOT NULL OR EXISTS(SELECT 1 FROM storage.buckets WHERE id='admission-case-evidence')THEN RAISE EXCEPTION 'Admission new state already present';END IF;END;$preflight$;

CREATE TABLE public.uc_admission_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,user_id uuid NOT NULL,group_id uuid NOT NULL,enrollment_id uuid NOT NULL,course_id uuid NOT NULL,
 program_ref jsonb NOT NULL,program_title text NOT NULL,program_type text NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 responsible_id uuid,rule_set_id uuid,requirements jsonb NOT NULL DEFAULT '[]',reviews jsonb NOT NULL DEFAULT '{}',tasks jsonb NOT NULL DEFAULT '[]',decision jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(organization_id,group_id,enrollment_id)
);
CREATE TABLE public.uc_admission_rule_sets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES public.uc_admission_cases(id),organization_id uuid NOT NULL,user_id uuid NOT NULL,
 program_ref jsonb NOT NULL,digest text NOT NULL CHECK(digest~'^[a-f0-9]{64}$'),sources jsonb NOT NULL,source_snapshots jsonb NOT NULL,definitions jsonb NOT NULL,
 reviewer_id uuid,authority_hash text NOT NULL,authority_snapshot jsonb NOT NULL,authority_redacted boolean NOT NULL DEFAULT false,review_reason text,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.uc_admission_case_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES public.uc_admission_cases(id),organization_id uuid NOT NULL,user_id uuid NOT NULL,
 case_revision bigint NOT NULL,kind text NOT NULL CHECK(kind IN('initialize','assign_responsible','review_local_rules','review_requirement','review_evidence','record_decision','evidence_committed')),
 actor_id uuid,authority_hash text NOT NULL,authority_snapshot jsonb NOT NULL,authority_redacted boolean NOT NULL DEFAULT false,payload jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(case_id,case_revision)
);
CREATE TABLE public.uc_admission_case_evidence(
 id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES public.uc_admission_cases(id),organization_id uuid NOT NULL,user_id uuid NOT NULL,
 requirement_id uuid NOT NULL,case_revision_created bigint NOT NULL,supersedes_id uuid,source_kind text NOT NULL,
 source_snapshot jsonb NOT NULL,source_redacted boolean NOT NULL DEFAULT false,participant_ids uuid[] NOT NULL CHECK(cardinality(participant_ids)>0),captured_by uuid,captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 byte_sha256 text NOT NULL CHECK(byte_sha256~'^[a-f0-9]{64}$'),byte_size bigint NOT NULL CHECK(byte_size BETWEEN 1 AND 20971520),mime_type text NOT NULL CHECK(mime_type IN('application/pdf','image/jpeg','image/png')),
 storage_object_id uuid NOT NULL,object_updated_at timestamptz NOT NULL,sealed_path text NOT NULL UNIQUE,event_id uuid NOT NULL
);
CREATE TABLE public.uc_admission_evidence_reservations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES public.uc_admission_cases(id),organization_id uuid NOT NULL,user_id uuid NOT NULL,actor_id uuid NOT NULL,
 prepare_request_id uuid NOT NULL,evidence_version_id uuid NOT NULL UNIQUE,requirement_id uuid NOT NULL,supersedes_id uuid,expected_revision bigint NOT NULL,program_ref jsonb NOT NULL,
 source jsonb NOT NULL,source_proof jsonb,sealed_proof jsonb,commit_request_id uuid,state text NOT NULL DEFAULT 'prepared'CHECK(state IN('prepared','sealed','consumed','expired')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 minutes',UNIQUE(actor_id,prepare_request_id)
);
CREATE TABLE public.uc_admission_case_requests(
 actor_id uuid NOT NULL,request_id uuid NOT NULL,case_id uuid REFERENCES public.uc_admission_cases(id),organization_id uuid NOT NULL,user_id uuid NOT NULL,
 kind text NOT NULL,payload_digest text NOT NULL,receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,request_id),CHECK(kind='_context'OR case_id IS NOT NULL)
);
CREATE INDEX uc_admission_events_history ON public.uc_admission_case_events(case_id,case_revision DESC);
CREATE INDEX uc_admission_evidence_case ON public.uc_admission_case_evidence(case_id,requirement_id);
CREATE INDEX uc_admission_reservations_subject ON public.uc_admission_evidence_reservations(user_id,actor_id);
DO $acl$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['uc_admission_cases','uc_admission_rule_sets','uc_admission_case_events','uc_admission_case_evidence','uc_admission_evidence_reservations','uc_admission_case_requests']LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END;$acl$;

CREATE FUNCTION public.uc_admission_error(p_code text)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'ADMISSION_%',p_code USING ERRCODE=CASE p_code WHEN 'ACCESS_DENIED'THEN '42501'WHEN 'INVALID_INPUT'THEN '22023'WHEN 'REVISION_CONFLICT'THEN '40001'ELSE 'P0001'END;END;$fn$;
CREATE FUNCTION public.uc_admission_shape(p_value jsonb,p_keys text[])RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
BEGIN IF jsonb_typeof(p_value)IS DISTINCT FROM 'object'THEN RETURN false;END IF;RETURN coalesce(p_value ?& p_keys AND(SELECT count(*)FROM jsonb_object_keys(p_value))=cardinality(p_keys),false);END;$fn$;
CREATE FUNCTION public.uc_admission_uuid(p_value jsonb)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_typeof(p_value)='string'AND p_value#>>'{}'~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)
$fn$;
CREATE FUNCTION public.uc_admission_trim(p_value text)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT btrim(p_value,E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))
$fn$;
CREATE FUNCTION public.uc_admission_text(p_value jsonb,p_max integer DEFAULT 4000)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_typeof(p_value)='string'AND length(p_value#>>'{}')BETWEEN 1 AND p_max AND public.uc_admission_trim(p_value#>>'{}')=p_value#>>'{}',false)
$fn$;
CREATE FUNCTION public.uc_admission_ids(p_value jsonb,p_min integer DEFAULT 0,p_max integer DEFAULT 100)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
BEGIN IF jsonb_typeof(p_value)IS DISTINCT FROM 'array'THEN RETURN false;END IF;RETURN jsonb_array_length(p_value)BETWEEN p_min AND p_max AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_value)x WHERE NOT public.uc_admission_uuid(x))AND(SELECT count(DISTINCT x)FROM jsonb_array_elements(p_value)x)=jsonb_array_length(p_value);END;$fn$;
CREATE FUNCTION public.uc_admission_ref_valid(p_ref jsonb)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE k text;BEGIN IF NOT public.uc_admission_shape(p_ref,ARRAY['enrollment_snapshot_id','binding_id','binding_revision','version_id','snapshot_hash','facts_hash','file_document_id','file_version_id','file_review_id'])THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['enrollment_snapshot_id','binding_id','version_id','file_document_id','file_version_id','file_review_id']LOOP IF NOT public.uc_admission_uuid(p_ref->k)THEN RETURN false;END IF;END LOOP;
 RETURN coalesce((p_ref->>'binding_revision')~'^[1-9][0-9]{0,15}$'AND(p_ref->>'binding_revision')::numeric<=9007199254740991 AND jsonb_typeof(p_ref->'binding_revision')='number'AND jsonb_typeof(p_ref->'snapshot_hash')='string'AND jsonb_typeof(p_ref->'facts_hash')='string'AND p_ref->>'snapshot_hash'~'^[0-9a-f]{64}$'AND p_ref->>'facts_hash'~'^[0-9a-f]{64}$',false);END;$fn$;
CREATE FUNCTION public.uc_admission_actor_allowed(p_actor uuid,p_write boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(EXISTS(SELECT 1 FROM auth.users a WHERE a.id=p_actor AND to_jsonb(a)->>'deleted_at'IS NULL AND coalesce((to_jsonb(a)->>'banned_until')::timestamptz<=now(),true))AND public.uc_identification_actor_allowed(p_actor,p_write)AND NOT EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=p_actor AND(a.role NOT IN('admin','super_admin')OR a.expires_at<=now())),false)
$fn$;
CREATE FUNCTION public.uc_admission_association(p_org uuid,p_user uuid,p_group uuid,p_enrollment uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('organization_id',p_org,'group_id',g.id,'enrollment_id',e.id,'user_id',e.user_id,'course_id',e.course_id)
 FROM public.student_groups g JOIN public.courses co ON co.id=g.course_id AND co.organization_id=g.organization_id
 JOIN public.enrollments e ON e.course_id=co.id AND e.user_id=p_user JOIN public.student_group_memberships_effective m ON m.group_id=g.id AND m.organization_id=g.organization_id AND m.user_id=e.user_id
 WHERE g.id=p_group AND g.organization_id=p_org AND e.id=p_enrollment AND public.uc_identification_target_allowed(p_org,p_user,true)
$fn$;
-- Explicit actor and THAT group. Never reuse an auth.uid-only or any-group
-- learner helper to validate a proposed different responsible person.
CREATE FUNCTION public.uc_admission_staff_allowed(p_actor uuid,p_org uuid,p_user uuid,p_group uuid,p_enrollment uuid,p_write boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p_actor<>p_user AND public.uc_admission_actor_allowed(p_actor,p_write)AND public.uc_admission_association(p_org,p_user,p_group,p_enrollment)IS NOT NULL
 AND(public.has_role(p_actor,'admin'::public.app_role)OR public.is_org_owner(p_actor,p_org)
 OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org AND(s.expires_at IS NULL OR s.expires_at>now())
 AND public.has_org_staff_permission(p_actor,p_org,CASE WHEN p_write THEN 'students.write'ELSE 'students.read'END)
 AND public.has_org_staff_permission(p_actor,p_org,CASE WHEN p_write THEN 'documents.write'ELSE 'documents.read'END)
 AND(s.role<>'teacher'OR(EXISTS(SELECT 1 FROM public.org_staff_document_groups a WHERE a.staff_id=s.id AND a.organization_id=p_org AND a.group_id=p_group)
 AND(NOT p_write OR s.sections_access ?& ARRAY['students.write','documents.write']))))),false)
$fn$;
CREATE FUNCTION public.uc_admission_can_read(p_actor uuid,p_org uuid,p_user uuid,p_group uuid,p_enrollment uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_admission_actor_allowed(p_actor,false)AND public.uc_admission_association(p_org,p_user,p_group,p_enrollment)IS NOT NULL AND(p_actor=p_user OR public.uc_admission_staff_allowed(p_actor,p_org,p_user,p_group,p_enrollment,false)),false)
$fn$;
CREATE FUNCTION public.uc_admission_scope(p_case uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('organization_id',organization_id,'group_id',group_id,'enrollment_id',enrollment_id,'user_id',user_id,'course_id',course_id)FROM public.uc_admission_cases WHERE id=p_case
$fn$;
CREATE FUNCTION public.uc_admission_program(p_org uuid,p_user uuid,p_group uuid,p_enrollment uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('enrollment_snapshot_id',s.id,'binding_id',b.id,'binding_revision',b.revision,'version_id',v.id,'snapshot_hash',s.snapshot_hash,'facts_hash',v.facts_hash,'file_document_id',v.file_document_id,'file_version_id',v.file_version_id,'file_review_id',v.file_review_id)
 FROM public.group_program_enrollment_snapshots s JOIN public.group_program_bindings b ON b.id=s.binding_id AND b.organization_id=s.organization_id AND b.group_id=s.group_id AND b.course_id=s.course_id AND b.version_id=s.version_id AND b.revision=s.binding_revision AND b.snapshot_hash=s.snapshot_hash
 JOIN public.program_fact_versions v ON v.id=s.version_id AND v.organization_id=s.organization_id AND v.state='approved'
 WHERE s.organization_id=p_org AND s.user_id=p_user AND s.group_id=p_group AND s.enrollment_id=p_enrollment AND public.uc_admission_association(p_org,p_user,p_group,p_enrollment)IS NOT NULL
 AND s.course_id=(public.uc_admission_association(p_org,p_user,p_group,p_enrollment)->>'course_id')::uuid AND public.uc_program_file_proof(p_org,v.file_version_id)
$fn$;
CREATE FUNCTION public.uc_admission_prerequisites(p_org uuid,p_user uuid,p_group uuid,p_enrollment uuid,p_rules boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE code text;BEGIN
 IF public.uc_admission_association(p_org,p_user,p_group,p_enrollment)IS NULL THEN code:='association_inactive';
 ELSIF NOT EXISTS(SELECT 1 FROM public.group_program_bindings WHERE group_id=p_group AND organization_id=p_org)THEN code:='missing_program_binding';
 ELSIF NOT EXISTS(SELECT 1 FROM public.group_program_enrollment_snapshots WHERE group_id=p_group AND enrollment_id=p_enrollment AND user_id=p_user AND organization_id=p_org)THEN code:='missing_enrollment_snapshot';
 ELSIF public.uc_admission_program(p_org,p_user,p_group,p_enrollment)IS NULL THEN code:='program_file_unavailable';ELSIF p_rules THEN code:='rule_set_unreviewed';END IF;
 RETURN CASE WHEN code IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('code',code,'public_label',CASE code WHEN 'association_inactive'THEN 'Учебная связь недоступна'WHEN 'rule_set_unreviewed'THEN 'Нужно проверить правила личного дела'ELSE 'Нужно подтвердить программу обучения'END,'next_action',CASE code WHEN 'association_inactive'THEN 'contact_staff'WHEN 'rule_set_unreviewed'THEN 'review_rule_set'ELSE 'open_programme_confirmation'END,'persisted',false))END;END;$fn$;
CREATE FUNCTION public.uc_admission_lock(p_actor uuid,p_org uuid,p_user uuid,p_group uuid,p_enrollment uuid,p_responsible uuid DEFAULT NULL)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE u uuid;BEGIN
 IF current_setting('transaction_isolation')<>'read committed'THEN RAISE EXCEPTION 'ADMISSION_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 FOR u IN SELECT DISTINCT x FROM unnest(ARRAY[p_actor,p_user,p_responsible])x WHERE x IS NOT NULL ORDER BY x LOOP PERFORM pg_advisory_xact_lock(hashtextextended(u::text,42007));END LOOP;
 IF NOT public.uc_admission_staff_allowed(p_actor,p_org,p_user,p_group,p_enrollment,true)OR NOT public.uc_admission_staff_allowed(p_actor,p_org,p_user,p_group,p_enrollment,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('uc_program_roster:'||p_group::text,0));
 -- Current scope and revocation after both fences, before shared row locks.
 IF NOT public.uc_admission_staff_allowed(p_actor,p_org,p_user,p_group,p_enrollment,true)OR NOT public.uc_admission_staff_allowed(p_actor,p_org,p_user,p_group,p_enrollment,false)OR(p_responsible IS NOT NULL AND NOT public.uc_admission_staff_allowed(p_responsible,p_org,p_user,p_group,p_enrollment,true))THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
END;$fn$;

CREATE FUNCTION public.uc_admission_local_source(p_org uuid,p_ref jsonb)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('document_id',d.id,'version_id',v.id,'review_id',r.id,'type',d.type,'label',coalesce(nullif(public.uc_admission_trim(left(d.name,160)),''),'Локальный акт'),'approval',jsonb_build_object('number',r.approval_number,'date',r.approval_date,'recorded_at',r.approved_at,'recorded_by',r.approved_by),'version_metadata',jsonb_build_object('storage_object_id',v.storage_object_id,'storage_metadata',v.storage_metadata,'file_size',v.file_size))
 FROM public.org_documents d JOIN public.org_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.organization_id=d.organization_id
 JOIN public.org_document_reviews r ON r.document_id=d.id AND r.version_id=v.id AND r.organization_id=d.organization_id
 WHERE d.id=(p_ref->>'document_id')::uuid AND v.id=(p_ref->>'version_id')::uuid AND r.id=(p_ref->>'review_id')::uuid AND d.organization_id=p_org
 AND d.type IN('admission_rules','edu_relations','paid_services')AND r.state='approved'AND r.approval_number IS NOT NULL AND r.approval_date IS NOT NULL AND r.approved_at IS NOT NULL AND r.approved_by IS NOT NULL
 AND public.uc_org_document_review_file_state(d)IN('active','expiring')AND public.uc_org_document_review_file_bound(d)
$fn$;
CREATE FUNCTION public.uc_admission_rules_current(p_case uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(r.id IS NOT NULL AND NOT r.authority_redacted AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.sources)s WHERE public.uc_admission_local_source(r.organization_id,s)IS NULL OR public.uc_admission_local_source(r.organization_id,s)IS DISTINCT FROM(SELECT x FROM jsonb_array_elements(r.source_snapshots)x WHERE x->>'document_id'=s->>'document_id')),false)
 FROM public.uc_admission_cases c LEFT JOIN public.uc_admission_rule_sets r ON r.id=c.rule_set_id AND r.case_id=c.id WHERE c.id=p_case
$fn$;
CREATE FUNCTION public.uc_admission_requirements_digest(p_case uuid)RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_program_hash(jsonb_build_object('requirements',requirements,'rule_set_id',rule_set_id,'program_ref',program_ref))FROM public.uc_admission_cases WHERE id=p_case
$fn$;
CREATE FUNCTION public.uc_admission_capabilities(p_actor uuid,p_org uuid,p_user uuid,p_group uuid,p_enrollment uuid,p_case uuid DEFAULT NULL)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 WITH a AS(SELECT public.uc_admission_staff_allowed(p_actor,p_org,p_user,p_group,p_enrollment,true)AND public.uc_admission_staff_allowed(p_actor,p_org,p_user,p_group,p_enrollment,false)w),r AS(SELECT responsible_id FROM public.uc_admission_cases WHERE id=p_case)
 SELECT jsonb_build_object('can_initialize',w AND p_case IS NULL AND public.uc_admission_program(p_org,p_user,p_group,p_enrollment)IS NOT NULL,
 'can_assign',w AND p_case IS NOT NULL,'can_review',coalesce(w AND p_case IS NOT NULL AND p_actor=(SELECT responsible_id FROM r),false),
 'can_decide',coalesce(w AND p_case IS NOT NULL AND p_actor=(SELECT responsible_id FROM r),false),'can_prepare_evidence',w AND p_case IS NOT NULL,
 'can_configure_rules',coalesce(w AND p_case IS NOT NULL AND p_actor=(SELECT responsible_id FROM r)AND p_actor=auth.uid()AND public.uc_document_action_allowed(p_org,'read',NULL,NULL),false))FROM a
$fn$;
CREATE FUNCTION public.uc_admission_object(p_bucket text,p_path text,p_known text DEFAULT NULL,p_extra jsonb DEFAULT '{}')RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
 SELECT jsonb_build_object('bucket',o.bucket_id,'path',o.name,'object_id',o.id,'updated_at',o.updated_at,'mime_type',o.metadata->>'mimetype','byte_size',(o.metadata->>'size')::bigint,'known_sha256',p_known,
 'fingerprint',public.uc_program_hash(jsonb_build_object('object_id',o.id,'updated_at',o.updated_at,'bucket',o.bucket_id,'path',o.name,'metadata',o.metadata,'extra',p_extra)))
 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path AND o.updated_at IS NOT NULL AND CASE WHEN o.metadata->>'size'~'^[0-9]{1,8}$'THEN(o.metadata->>'size')::bigint BETWEEN 1 AND 20971520 ELSE false END AND o.metadata->>'mimetype'IN('application/pdf','image/jpeg','image/png')
$fn$;
CREATE FUNCTION public.uc_admission_evidence_dto(p_evidence uuid,p_actor uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',e.id,'case_id',e.case_id,'case_revision_created',e.case_revision_created,'requirement_id',e.requirement_id,'supersedes_id',e.supersedes_id,'source_kind',e.source_kind,'captured_at',e.captured_at,'byte_sha256',e.byte_sha256,'byte_size',e.byte_size,'mime_type',e.mime_type,
 'availability',CASE WHEN o IS NULL THEN 'unavailable'WHEN(o->>'object_id')::uuid<>e.storage_object_id OR(o->>'updated_at')::timestamptz<>e.object_updated_at OR(o->>'byte_size')::bigint<>e.byte_size OR o->>'mime_type'<>e.mime_type THEN 'integrity_conflict'ELSE 'available'END,
 'review',coalesce(c.reviews->'evidence'->e.id::text->>'outcome','unreviewed'),'review_event_id',c.reviews->'evidence'->e.id::text->'event_id',
 'can_read_bytes',public.uc_admission_staff_allowed(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)AND o IS NOT NULL AND(o->>'object_id')::uuid=e.storage_object_id AND(o->>'updated_at')::timestamptz=e.object_updated_at AND(o->>'byte_size')::bigint=e.byte_size AND o->>'mime_type'=e.mime_type)
 FROM public.uc_admission_case_evidence e JOIN public.uc_admission_cases c ON c.id=e.case_id LEFT JOIN LATERAL(SELECT public.uc_admission_object('admission-case-evidence',e.sealed_path,e.byte_sha256) o)q ON true WHERE e.id=p_evidence
$fn$;
CREATE FUNCTION public.uc_admission_current_evidence(p_case uuid,p_actor uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(public.uc_admission_evidence_dto(e.id,p_actor)ORDER BY e.captured_at,e.id),'[]')FROM public.uc_admission_case_evidence e
 WHERE e.case_id=p_case AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=e.case_id AND n.supersedes_id=e.id)
$fn$;
CREATE FUNCTION public.uc_admission_state(p_case uuid,p_actor uuid,p_learner boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;d jsonb;tasks jsonb;changed boolean;derived jsonb;BEGIN SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case;
 IF c.id IS NULL OR NOT public.uc_admission_can_read(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 derived:=public.uc_admission_derive(c.id,p_actor);changed:=c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)OR NOT coalesce(public.uc_admission_rules_current(c.id),false)OR derived->'requirements'IS DISTINCT FROM c.requirements;
 d:=c.decision;IF d IS NOT NULL THEN d:=jsonb_set(d,'{later_review_required}',to_jsonb(changed OR coalesce((d->>'case_revision')::bigint<c.revision,false)));END IF;
 IF p_learner THEN
 IF p_actor<>c.user_id THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t->'id','public_label',t->'public_label','next_action',CASE WHEN t->>'kind'='supply_evidence'THEN 'upload_own_attachment'ELSE 'contact_staff'END,'status',t->'status')),'[]')INTO tasks FROM jsonb_array_elements(derived->'tasks')t;
 RETURN jsonb_build_object('id',c.id,'scope',public.uc_admission_scope(c.id),'revision',c.revision,'program_title',c.program_title,'outcome',coalesce(d->>'outcome','not_reviewed'),'outcome_recorded_at',d->'recorded_at','later_review_required',d IS NOT NULL AND(d->>'later_review_required')::boolean,'tasks',tasks);END IF;
 IF NOT public.uc_admission_staff_allowed(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 RETURN jsonb_build_object('id',c.id,'scope',public.uc_admission_scope(c.id),'revision',c.revision,'program_ref',c.program_ref,'program_title',c.program_title,'program_type',c.program_type,'responsible_id',c.responsible_id,'rule_set_id',c.rule_set_id,'requirements',derived->'requirements',
 'evidence',public.uc_admission_current_evidence(c.id,p_actor),'tasks',derived->'tasks','decision',d,'prerequisites',public.uc_admission_prerequisites(c.organization_id,c.user_id,c.group_id,c.enrollment_id,NOT coalesce(public.uc_admission_rules_current(c.id),false)),
 'capabilities',public.uc_admission_capabilities(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id,c.id),'rule_set_digest',(SELECT digest FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id),'requirements_digest',public.uc_program_hash(jsonb_build_object('requirements',derived->'requirements','rule_set_id',c.rule_set_id,'program_ref',c.program_ref)));END;$fn$;
CREATE FUNCTION public.uc_admission_derive(p_case uuid,p_actor uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;q jsonb;reqs jsonb:='[]';derived_tasks jsonb:='[]';eids jsonb;ev jsonb;state text;kind text;k text;tid uuid;reason text;BEGIN SELECT * INTO STRICT c FROM public.uc_admission_cases WHERE id=p_case;
 FOR q IN SELECT x FROM jsonb_array_elements(c.requirements)x LOOP
  SELECT coalesce(jsonb_agg(e.id ORDER BY e.id),'[]')INTO eids FROM public.uc_admission_case_evidence e WHERE e.case_id=c.id AND e.requirement_id=(q->>'id')::uuid AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.case_id=c.id AND n.supersedes_id=e.id);
  state:=CASE q->>'applicability'WHEN 'unknown'THEN 'unknown'WHEN 'not_applicable'THEN 'satisfied'ELSE 'missing'END;
  IF q->>'applicability'='applicable'AND jsonb_array_length(eids)>0 THEN
   state:='satisfied';FOR ev IN SELECT public.uc_admission_evidence_dto((x#>>'{}')::uuid,p_actor)FROM jsonb_array_elements(eids)x LOOP
    IF ev->>'availability'<>'available'THEN state:='unreadable';EXIT;ELSIF ev->>'review'<>'accepted'THEN state:='unreviewed';END IF;END LOOP;
  END IF;
  IF q->>'applicability'='applicable'AND c.reviews->'requirements'->(q->>'id')->'exception'IS NOT NULL AND c.reviews->'requirements'->(q->>'id')->'exception'<>'null'::jsonb THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.reviews->'requirements'->(q->>'id')->'exception'->'evidence_version_ids')x WHERE public.uc_admission_evidence_dto((x#>>'{}')::uuid,p_actor)->>'review'<>'accepted'OR public.uc_admission_evidence_dto((x#>>'{}')::uuid,p_actor)->>'availability'<>'available')THEN state:='exception_recorded';ELSE state:='exception_pending';END IF;
  END IF;
  q:=q||jsonb_build_object('evidence_version_ids',eids,'current_state',state,'public_next_action',CASE WHEN state IN('satisfied','exception_recorded')THEN NULL WHEN state='missing'THEN 'Добавьте читаемые сведения'ELSE 'Обратитесь к ответственному сотруднику'END);reqs:=reqs||jsonb_build_array(q);
  IF state NOT IN('satisfied','exception_recorded')THEN
   kind:=CASE state WHEN 'unknown'THEN 'review_applicability'WHEN 'missing'THEN 'supply_evidence'WHEN 'unreadable'THEN 'recheck_source'WHEN 'exception_pending'THEN 'review_exception'ELSE 'review_evidence'END;
   k:=public.uc_program_hash(jsonb_build_array(c.id,q->'id',q->'revision',q->'rule_set_digest',eids,kind));
   SELECT(t->>'id')::uuid INTO tid FROM jsonb_array_elements(c.tasks)t WHERE t->>'key'=k;
   derived_tasks:=derived_tasks||jsonb_build_array(jsonb_build_object('id',coalesce(tid,(substr(k,1,8)||'-'||substr(k,9,4)||'-'||substr(k,13,4)||'-'||substr(k,17,4)||'-'||substr(k,21,12))::uuid),'key',k,'requirement_id',q->'id','kind',kind,'status','open','assignee_id',c.responsible_id,'public_label',CASE kind WHEN 'supply_evidence'THEN 'Добавьте сведения в документы ученика'WHEN 'review_applicability'THEN 'Требуется проверка применимости'ELSE 'Требуется проверка ответственным'END,'deadline',jsonb_build_object('kind','not_set','date',NULL,'rule_id',NULL),'reason',NULL));
  END IF;
 END LOOP;
 IF c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)OR(c.rule_set_id IS NOT NULL AND NOT coalesce(public.uc_admission_rules_current(c.id),false))THEN
  kind:=CASE WHEN c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN 'recheck_programme'ELSE 'recheck_source'END;
  k:=public.uc_program_hash(jsonb_build_array(c.id,c.program_ref,c.rule_set_id,kind));
  derived_tasks:=derived_tasks||jsonb_build_array(jsonb_build_object('id',(substr(k,1,8)||'-'||substr(k,9,4)||'-'||substr(k,13,4)||'-'||substr(k,17,4)||'-'||substr(k,21,12))::uuid,'key',k,'requirement_id',NULL,'kind',kind,'status','open','assignee_id',c.responsible_id,'public_label','Требуется повторная проверка источника','deadline',jsonb_build_object('kind','not_set','date',NULL,'rule_id',NULL),'reason',NULL));
 END IF;
 IF jsonb_array_length(reqs)>50 OR jsonb_array_length(derived_tasks)>50 OR jsonb_array_length(public.uc_admission_current_evidence(c.id,p_actor))>100 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
 RETURN jsonb_build_object('requirements',reqs,'tasks',derived_tasks);
END;$fn$;
CREATE FUNCTION public.uc_admission_refresh(p_case uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d jsonb;BEGIN d:=public.uc_admission_derive(p_case,auth.uid());UPDATE public.uc_admission_cases SET requirements=d->'requirements',tasks=d->'tasks'WHERE id=p_case;END;$fn$;

CREATE FUNCTION public.uc_admission_student_path(p_reference text,p_user uuid)RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE path text:=p_reference;BEGIN
 IF path~'^https://'THEN path:=substring(path FROM '^https://atxwvjxbqjgkbjlhsdch[.]supabase[.]co/storage/v1/object/(?:public|authenticated)/student-documents/(.+)$');END IF;
 IF path~('^'||p_user::text||'/[A-Za-z0-9_./-]+$')AND path!~'(^|/)[.][.]?(/|$)'AND position('//'IN path)=0 THEN RETURN path;END IF;RETURN NULL;END;$fn$;
CREATE FUNCTION public.uc_admission_candidate(p_case uuid,p_kind text,p_id uuid,p_version uuid DEFAULT NULL,p_actor uuid DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;s jsonb;obj jsonb;path text;label text;availability text:='unavailable';fingerprint text;BEGIN SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case;
 p_actor:=coalesce(p_actor,auth.uid());IF NOT public.uc_admission_staff_allowed(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF p_kind='identity_document'AND p_version IS NULL THEN SELECT to_jsonb(d)INTO s FROM public.student_identity_documents d WHERE d.id=p_id AND d.user_id=c.user_id AND d.organization_id=c.organization_id;
 ELSIF p_kind='enrollment_document'AND p_version IS NULL THEN SELECT to_jsonb(d)INTO s FROM public.student_documents d WHERE d.id=p_id AND d.enrollment_id=c.enrollment_id;
 ELSIF p_kind='organization_document_version'AND p_version IS NOT NULL THEN
  IF p_actor IS DISTINCT FROM auth.uid()OR NOT public.uc_document_action_allowed(c.organization_id,'read',NULL,NULL)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
  SELECT to_jsonb(v)||jsonb_build_object('name',d.name)INTO s FROM public.org_documents d JOIN public.org_document_versions v ON v.document_id=d.id AND v.organization_id=d.organization_id WHERE d.id=p_id AND v.id=p_version AND d.organization_id=c.organization_id AND public.uc_program_file_proof(c.organization_id,v.id);availability:='needs_individual_copy';
 ELSIF p_kind='contract_artifact'AND p_version IS NULL THEN SELECT to_jsonb(d)INTO s FROM public.org_contracts d WHERE d.id=p_id AND d.organization_id=c.organization_id AND d.student_user_id=c.user_id;availability:='needs_individual_copy';END IF;
 IF s IS NULL THEN RETURN NULL;END IF;
 label:=coalesce(nullif(public.uc_admission_trim(left(coalesce(s->>'name',s->>'title'),160)),''),'Документ');
 IF p_kind IN('identity_document','enrollment_document')THEN
  path:=public.uc_admission_student_path(coalesce(nullif(s->>'file_path',''),s->>'file_url'),c.user_id);
  IF nullif(s->>'file_path','')IS NOT NULL AND nullif(s->>'file_url','')IS NOT NULL AND public.uc_admission_student_path(s->>'file_url',c.user_id)IS DISTINCT FROM path THEN path:=NULL;END IF;
  IF path IS NOT NULL THEN obj:=public.uc_admission_object('student-documents',path,NULL,s);END IF;
  IF obj IS NOT NULL THEN availability:='capturable';END IF;
 END IF;
 fingerprint:=public.uc_program_hash(jsonb_build_object('scope',public.uc_admission_scope(c.id),'kind',p_kind,'id',p_id,'version_id',p_version,'row',s,'object',obj));
 RETURN jsonb_build_object('candidate',jsonb_build_object('kind',p_kind,'id',p_id,'version_id',p_version,'availability',availability,'label',label,'fingerprint',fingerprint),'object',obj,'source_snapshot',s);
END;$fn$;
CREATE FUNCTION public.uc_admission_history_payload(p_payload jsonb,p_actor uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE e jsonb;fresh jsonb;items jsonb:='[]';BEGIN FOR e IN SELECT x FROM jsonb_array_elements(p_payload->'evidence')x LOOP fresh:=public.uc_admission_evidence_dto((e->>'id')::uuid,p_actor);
 items:=items||jsonb_build_array(e||jsonb_build_object('availability',coalesce(fresh->>'availability','unavailable'),'can_read_bytes',coalesce((fresh->>'can_read_bytes')::boolean,false)));END LOOP;RETURN jsonb_set(p_payload,'{evidence}',items);END;$fn$;
CREATE FUNCTION public.read_student_admission_case(p_organization_id uuid,p_student_user_id uuid,p_query jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
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
 END IF;PERFORM public.uc_admission_error('INVALID_INPUT');RETURN NULL;END;$fn$;

CREATE FUNCTION public.uc_admission_context(p_case uuid,p_actor uuid,p_mode text,p_erase_user uuid DEFAULT NULL)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;req uuid:=gen_random_uuid();BEGIN SELECT * INTO STRICT c FROM public.uc_admission_cases WHERE id=p_case;
 INSERT INTO public.uc_admission_case_requests(actor_id,request_id,case_id,organization_id,user_id,kind,payload_digest,receipt)VALUES(p_actor,req,NULL,c.organization_id,c.user_id,'_context',repeat('0',64),jsonb_build_object('case_id',c.id,'pid',pg_backend_pid(),'tx',txid_current(),'mode',p_mode,'erase_user',p_erase_user));RETURN req;END;$fn$;
CREATE FUNCTION public.uc_admission_redact(p_value jsonb,p_user uuid,p_force boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE k text;v jsonb;result jsonb;active boolean:=p_force;BEGIN
 IF jsonb_typeof(p_value)='array'THEN SELECT coalesce(jsonb_agg(public.uc_admission_redact(x,p_user,p_force)),'[]')INTO result FROM jsonb_array_elements(p_value)x;RETURN result;
 ELSIF jsonb_typeof(p_value)<>'object'THEN RETURN p_value;END IF;
 active:=active OR EXISTS(SELECT 1 FROM jsonb_each(p_value)e WHERE e.key IN('actor_id','reviewer_id','responsible_id','assignee_id','captured_by','approved_by','recorded_by')AND e.value=to_jsonb(p_user));
 result:='{}';FOR k,v IN SELECT * FROM jsonb_each(p_value)LOOP
  IF k IN('actor_id','reviewer_id','responsible_id','assignee_id','captured_by','approved_by','recorded_by')AND v=to_jsonb(p_user)THEN v:='null';
  ELSIF active AND k IN('reason','review_reason','staff_label','provision','label')AND jsonb_typeof(v)='string'THEN v:=to_jsonb('Сведения удалены'::text);
  ELSIF active AND k IN('staff_id','org_staff_id')THEN v:='null';
  ELSIF active AND k='path'AND jsonb_typeof(v)='string'AND position(p_user::text IN(v#>>'{}'))>0 THEN v:='null';
  ELSE v:=public.uc_admission_redact(v,p_user,active);END IF;result:=result||jsonb_build_object(k,v);END LOOP;
 IF p_value?'authority_snapshot'AND result->'authority_snapshot'IS DISTINCT FROM p_value->'authority_snapshot'THEN result:=jsonb_set(result,'{authority_redacted}','true');END IF;
 IF p_value?'source_snapshot'AND result->'source_snapshot'IS DISTINCT FROM p_value->'source_snapshot'THEN result:=jsonb_set(result,'{source_redacted}','true');END IF;RETURN result;END;$fn$;
CREATE FUNCTION public.uc_guard_admission_history()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record;c public.uc_admission_cases;cid uuid:=coalesce((to_jsonb(OLD)->>'case_id')::uuid,(to_jsonb(OLD)->'receipt'->>'case_id')::uuid);mode text;erase_user uuid;BEGIN
 IF TG_TABLE_NAME='uc_admission_cases'THEN cid:=OLD.id;END IF;SELECT * INTO c FROM public.uc_admission_cases WHERE id=cid;
 FOR ctx IN SELECT * FROM public.uc_admission_case_requests q WHERE q.kind='_context'AND q.receipt->>'case_id'=cid::text AND(q.receipt->>'pid')::integer=pg_backend_pid()AND(q.receipt->>'tx')::bigint=txid_current()LOOP
  mode:=ctx.receipt->>'mode';erase_user:=(ctx.receipt->>'erase_user')::uuid;
  IF mode IN('subject_erase','reviewer_erase')AND auth.role()='service_role'AND auth.uid()IS NULL AND current_setting('sintagma.account_deletion_erase_user',true)=erase_user::text AND EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=erase_user)THEN
   IF TG_OP='DELETE'AND(TG_TABLE_NAME='uc_admission_case_requests'AND(to_jsonb(OLD)->>'actor_id'=erase_user::text OR to_jsonb(OLD)->>'user_id'=erase_user::text OR to_jsonb(OLD)->>'kind'='_context')OR to_jsonb(OLD)->>'user_id'=erase_user::text OR TG_TABLE_NAME='uc_admission_evidence_reservations'AND to_jsonb(OLD)->>'actor_id'=erase_user::text)THEN RETURN OLD;END IF;
   IF mode='reviewer_erase'AND TG_OP='UPDATE'AND to_jsonb(NEW)=public.uc_admission_redact(to_jsonb(OLD),erase_user,(TG_TABLE_NAME IN('uc_admission_rule_sets','uc_admission_case_events')AND(to_jsonb(OLD)->>'reviewer_id'=erase_user::text OR to_jsonb(OLD)->>'actor_id'=erase_user::text))OR(TG_TABLE_NAME='uc_admission_cases'AND EXISTS(SELECT 1 FROM public.uc_admission_rule_sets s WHERE s.id=(to_jsonb(OLD)->>'rule_set_id')::uuid AND s.reviewer_id=erase_user)))THEN RETURN NEW;END IF;
  ELSIF mode IN('mutation','attest')AND((mode='mutation'AND auth.role()='authenticated'AND auth.uid()=ctx.actor_id)OR(mode='attest'AND auth.role()='service_role'AND auth.uid()IS NULL))AND public.uc_admission_staff_allowed(ctx.actor_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,true)AND public.uc_admission_staff_allowed(ctx.actor_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN
   IF TG_OP='DELETE'AND TG_TABLE_NAME='uc_admission_case_requests'AND to_jsonb(OLD)->>'kind'='_context'AND to_jsonb(OLD)->>'actor_id'=ctx.actor_id::text AND to_jsonb(OLD)->>'request_id'=ctx.request_id::text THEN RETURN OLD;END IF;
   IF TG_OP='UPDATE'AND TG_TABLE_NAME='uc_admission_evidence_reservations'AND(to_jsonb(OLD)-ARRAY['state','source_proof','sealed_proof','commit_request_id'])=(to_jsonb(NEW)-ARRAY['state','source_proof','sealed_proof','commit_request_id'])AND to_jsonb(OLD)->>'actor_id'=ctx.actor_id::text THEN RETURN NEW;END IF;
   IF mode='mutation'AND TG_OP='UPDATE'AND TG_TABLE_NAME='uc_admission_cases'AND(to_jsonb(OLD)-ARRAY['revision','responsible_id','rule_set_id','requirements','reviews','tasks','decision','updated_at'])=(to_jsonb(NEW)-ARRAY['revision','responsible_id','rule_set_id','requirements','reviews','tasks','decision','updated_at'])THEN RETURN NEW;END IF;
  END IF;
 END LOOP;PERFORM public.uc_admission_error('ACCESS_DENIED');RETURN NULL;END;$fn$;
DO $guards$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['uc_admission_cases','uc_admission_rule_sets','uc_admission_case_events','uc_admission_case_evidence','uc_admission_evidence_reservations','uc_admission_case_requests']LOOP EXECUTE format('CREATE TRIGGER uc_admission_history_guard BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_guard_admission_history()',t);END LOOP;END;$guards$;
CREATE FUNCTION public.uc_admission_result(p_case uuid,p_actor uuid,p_receipt jsonb,p_replayed boolean)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('schema_version',1,'scope',public.uc_admission_scope(p_case),'receipt',p_receipt,'replayed',p_replayed,'state',public.uc_admission_state(p_case,p_actor,false))
$fn$;
CREATE FUNCTION public.uc_admission_authority(p_case uuid,p_actor uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('actor_id',p_actor,'scope',public.uc_admission_scope(c.id),'responsible_id',c.responsible_id,'program_ref',c.program_ref,'rule_set_id',c.rule_set_id,
 'read_allowed',public.uc_admission_staff_allowed(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false),'write_allowed',public.uc_admission_staff_allowed(p_actor,c.organization_id,c.user_id,c.group_id,c.enrollment_id,true),
 'roles',coalesce((SELECT jsonb_agg(role::text ORDER BY role::text)FROM public.user_roles WHERE user_id=p_actor),'[]'),
 'staff',(SELECT jsonb_build_object('actor_id',p_actor,'staff_id',s.id,'role',s.role,'sections_access',s.sections_access,'expires_at',s.expires_at,'exact_group_assigned',EXISTS(SELECT 1 FROM public.org_staff_document_groups g WHERE g.staff_id=s.id AND g.organization_id=c.organization_id AND g.group_id=c.group_id))FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=c.organization_id),
 'admin_role',(SELECT jsonb_build_object('role',role,'expires_at',expires_at)FROM public.admin_staff WHERE user_id=p_actor),'org_owner',public.is_org_owner(p_actor,c.organization_id),'recorded_at',clock_timestamp())FROM public.uc_admission_cases c WHERE c.id=p_case
$fn$;
CREATE FUNCTION public.uc_admission_event(p_case uuid,p_actor uuid,p_event uuid,p_kind text,p_request uuid,p_payload_digest text,p_reason text DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;r public.uc_admission_rule_sets;payload jsonb;receipt jsonb;all_evidence jsonb;authority jsonb;BEGIN SELECT * INTO STRICT c FROM public.uc_admission_cases WHERE id=p_case;SELECT * INTO r FROM public.uc_admission_rule_sets WHERE id=c.rule_set_id;authority:=public.uc_admission_authority(c.id,p_actor);
 IF p_kind='record_decision'THEN UPDATE public.uc_admission_cases SET decision=jsonb_set(decision,'{authority_snapshot_hash}',to_jsonb(public.uc_program_hash(authority)))WHERE id=c.id RETURNING * INTO c;END IF;
 SELECT coalesce(jsonb_agg(e.id ORDER BY e.id),'[]')INTO all_evidence FROM public.uc_admission_case_evidence e WHERE e.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence n WHERE n.supersedes_id=e.id AND n.case_id=c.id);
 payload:=jsonb_build_object('reason',p_reason,'program_ref',c.program_ref,'responsible_id',c.responsible_id,'rule_set_id',c.rule_set_id,'rule_set_digest',r.digest,'requirements_digest',public.uc_admission_requirements_digest(c.id),'requirements',c.requirements,'evidence_version_ids',all_evidence,'evidence',public.uc_admission_current_evidence(c.id,p_actor),'tasks',c.tasks,'decision',c.decision,'local_sources',coalesce(r.sources,'[]'),'local_requirements',coalesce(r.definitions,'[]'));
 INSERT INTO public.uc_admission_case_events(id,case_id,organization_id,user_id,case_revision,kind,actor_id,authority_hash,authority_snapshot,payload)VALUES(p_event,c.id,c.organization_id,c.user_id,c.revision,p_kind,p_actor,public.uc_program_hash(authority),authority,payload);
 receipt:=jsonb_build_object('schema_version',1,'request_id',p_request,'case_id',c.id,'revision',c.revision,'event_id',p_event,'kind',p_kind,'payload_digest',p_payload_digest);
 INSERT INTO public.uc_admission_case_requests(actor_id,request_id,case_id,organization_id,user_id,kind,payload_digest,receipt)VALUES(p_actor,p_request,c.id,c.organization_id,c.user_id,p_kind,p_payload_digest,receipt);RETURN receipt;END;$fn$;
CREATE FUNCTION public.uc_admission_validate_action(p_command jsonb)RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE action text:=p_command->>'action';keys text[];k text;x jsonb;BEGIN
 keys:=CASE action WHEN 'initialize'THEN ARRAY['action','group_id','enrollment_id','expected_program_ref','expected_revision']WHEN 'assign_responsible'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','responsible_id','reason']WHEN 'review_local_rules'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','sources','requirements','review_reason']WHEN 'review_requirement'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','requirement_id','expected_requirement_revision','applicability','evidence_version_ids','reason','exception']WHEN 'review_evidence'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','requirement_id','expected_requirement_revision','evidence_version_id','byte_sha256','outcome','reason']WHEN 'record_decision'THEN ARRAY['action','case_id','expected_revision','expected_program_ref','rule_set_id','rule_set_digest','requirements_digest','evidence_version_ids','outcome','reason']ELSE NULL END;
 IF keys IS NULL OR NOT public.uc_admission_shape(p_command,keys)OR NOT public.uc_admission_ref_valid(p_command->'expected_program_ref')OR jsonb_typeof(p_command->'expected_revision')IS DISTINCT FROM 'number'OR p_command->>'expected_revision'!~'^[0-9]{1,16}$'OR(p_command->>'expected_revision')::numeric>9007199254740991 OR(action='initialize')IS DISTINCT FROM(p_command->>'expected_revision'='0')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 FOREACH k IN ARRAY keys LOOP IF k~'_id$'AND NOT public.uc_admission_uuid(p_command->k)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;END LOOP;
 IF p_command?'reason'AND NOT public.uc_admission_text(p_command->'reason')OR p_command?'review_reason'AND NOT public.uc_admission_text(p_command->'review_reason')OR p_command?'expected_requirement_revision'AND(jsonb_typeof(p_command->'expected_requirement_revision')IS DISTINCT FROM 'number'OR p_command->>'expected_requirement_revision'!~'^[1-9][0-9]{0,15}$'OR(p_command->>'expected_requirement_revision')::numeric>9007199254740991)OR p_command?'evidence_version_ids'AND NOT public.uc_admission_ids(p_command->'evidence_version_ids')THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 IF action='review_requirement'THEN
  IF coalesce(p_command->>'applicability'IN('unknown','applicable','not_applicable'),false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
  x:=p_command->'exception';IF x<>'null'::jsonb AND(NOT public.uc_admission_shape(x,ARRAY['rule_id','reason','evidence_version_ids'])OR NOT public.uc_admission_uuid(x->'rule_id')OR NOT public.uc_admission_text(x->'reason')OR NOT public.uc_admission_ids(x->'evidence_version_ids',1))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 ELSIF action='review_evidence'AND coalesce(p_command->>'outcome'IN('accepted','rejected')AND jsonb_typeof(p_command->'byte_sha256')='string'AND p_command->>'byte_sha256'~'^[a-f0-9]{64}$',false)=false OR action='record_decision'AND coalesce(p_command->>'outcome'IN('needs_information','admitted','not_admitted')AND jsonb_typeof(p_command->'rule_set_digest')='string'AND jsonb_typeof(p_command->'requirements_digest')='string'AND p_command->>'rule_set_digest'~'^[a-f0-9]{64}$'AND p_command->>'requirements_digest'~'^[a-f0-9]{64}$',false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
END;$fn$;
CREATE FUNCTION public.apply_student_admission_case_action(p_organization_id uuid,p_student_user_id uuid,p_request_id uuid,p_command jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
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
    IF NOT public.uc_admission_shape(d,ARRAY['key','kind','staff_label','source_version_ids','provision','exception_policy'])OR coalesce(jsonb_typeof(d->'key')='string'AND d->>'key'~'^[a-z0-9_]{1,64}$'AND d->>'kind'IN('education_basis','application','contract_or_funding','other_reviewed')AND d->>'exception_policy'IN('not_defined','local_reasoned_exception'),false)=false OR NOT public.uc_admission_text(d->'staff_label',160)OR NOT public.uc_admission_text(d->'provision',1000)OR NOT public.uc_admission_ids(d->'source_version_ids',1,3)THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'source_version_ids')v WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources)s WHERE s->'version_id'=v))THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;END LOOP;
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
     IF p_command->>'applicability'<>'applicable'OR p_command->'exception'->>'rule_id'<>q->>'rule_id'OR NOT EXISTS(SELECT 1 FROM public.uc_admission_rule_sets rs,jsonb_array_elements(rs.definitions)d WHERE rs.id=c.rule_set_id AND d->>'exception_policy'='local_reasoned_exception'AND c.reviews->'identities'->(d->>'key')->>'id'=q->>'id')OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->'exception'->'evidence_version_ids')x WHERE NOT p_command->'evidence_version_ids'@>jsonb_build_array(x))THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;END IF;
    SELECT coalesce(jsonb_agg(CASE WHEN x->>'id'=q->>'id'THEN x||jsonb_build_object('applicability',p_command->'applicability','review_event_id',event)ELSE x END),'[]')INTO reqs FROM jsonb_array_elements(c.requirements)x;
    review:=jsonb_build_object('actor_id',a,'reason',reason,'exception',p_command->'exception','event_id',event,'requirement_revision',q->'revision');
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

CREATE FUNCTION public.prepare_admission_case_evidence(p_case_id uuid,p_expected_revision bigint,p_expected_program_ref jsonb,p_request_id uuid,p_source jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
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
 INSERT INTO public.uc_admission_case_requests(actor_id,request_id,case_id,organization_id,user_id,kind,payload_digest,receipt)VALUES(a,p_request_id,c.id,c.organization_id,c.user_id,'prepare_evidence',digest,receipt);RETURN receipt;END;$fn$;
CREATE FUNCTION public.uc_admission_source_proof(p_reservation uuid,p_actor uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.uc_admission_evidence_reservations;candidate jsonb;o jsonb;path text;BEGIN SELECT * INTO r FROM public.uc_admission_evidence_reservations WHERE id=p_reservation;
 IF r.source->>'kind'='upload'THEN
  path:=r.user_id::text||'/'||r.organization_id::text||'/'||r.case_id::text||'/staging/'||r.actor_id::text||'/'||r.id::text;
  IF NOT EXISTS(SELECT 1 FROM storage.objects s WHERE s.bucket_id='admission-case-evidence'AND s.name=path AND coalesce(to_jsonb(s)->>'owner_id',to_jsonb(s)->>'owner')=r.actor_id::text)THEN RETURN NULL;END IF;
  o:=public.uc_admission_object('admission-case-evidence',path,r.source->>'declared_sha256',r.source);
  IF o->>'byte_size'IS DISTINCT FROM r.source->>'declared_size'OR o->>'mime_type'IS DISTINCT FROM r.source->>'declared_mime'THEN RETURN NULL;END IF;RETURN o;
 END IF;
 candidate:=public.uc_admission_candidate(r.case_id,r.source->'candidate'->>'kind',(r.source->'candidate'->>'id')::uuid,(r.source->'candidate'->>'version_id')::uuid,p_actor);
 IF candidate->'candidate'->>'fingerprint'IS DISTINCT FROM r.source->'candidate'->>'fingerprint'OR candidate->'candidate'->>'availability'IS DISTINCT FROM 'capturable'THEN RETURN NULL;END IF;RETURN candidate->'object';END;$fn$;
CREATE FUNCTION public.uc_admission_evidence_context(p_case_id uuid,p_reservation_id uuid,p_expected_revision bigint,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
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
END;$fn$;
CREATE FUNCTION public.uc_admission_lock_rules(p_sources jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM 1 FROM public.org_documents WHERE id IN(SELECT(x->>'document_id')::uuid FROM jsonb_array_elements(p_sources)x)ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_document_versions WHERE id IN(SELECT(x->>'version_id')::uuid FROM jsonb_array_elements(p_sources)x)ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_document_reviews WHERE id IN(SELECT(x->>'review_id')::uuid FROM jsonb_array_elements(p_sources)x)ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM storage.objects WHERE id IN(SELECT v.storage_object_id FROM public.org_document_versions v,jsonb_array_elements(p_sources)x WHERE v.id=(x->>'version_id')::uuid)ORDER BY id FOR SHARE NOWAIT;
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END;$fn$;
CREATE FUNCTION public.uc_admission_lock_source(p_reservation uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.uc_admission_evidence_reservations;s jsonb;BEGIN SELECT * INTO STRICT r FROM public.uc_admission_evidence_reservations WHERE id=p_reservation;
 IF r.source->>'kind'='existing'THEN
  IF r.source->'candidate'->>'kind'='identity_document'THEN PERFORM 1 FROM public.student_identity_documents WHERE id=(r.source->'candidate'->>'id')::uuid FOR SHARE NOWAIT;
  ELSIF r.source->'candidate'->>'kind'='enrollment_document'THEN PERFORM 1 FROM public.student_documents WHERE id=(r.source->'candidate'->>'id')::uuid FOR SHARE NOWAIT;ELSE PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;END IF;
 s:=public.uc_admission_source_proof(r.id,r.actor_id);
 PERFORM 1 FROM storage.objects WHERE id IN((s->>'object_id')::uuid,(r.sealed_proof->>'object_id')::uuid)ORDER BY id FOR SHARE NOWAIT;
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END;$fn$;
CREATE FUNCTION public.uc_attest_admission_case_evidence(p_actor_id uuid,p_case_id uuid,p_reservation_id uuid,p_expected_revision bigint,p_request_id uuid,p_source_object_id uuid,p_source_updated_at timestamptz,p_source_fingerprint text,p_sealed_object_id uuid,p_sealed_updated_at timestamptz,p_byte_sha256 text,p_byte_size bigint,p_mime_type text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_admission_cases;r public.uc_admission_evidence_reservations;src jsonb;obj jsonb;sealed jsonb;ctx uuid;BEGIN
 IF auth.role()IS DISTINCT FROM 'service_role'OR auth.uid()IS NOT NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF p_request_id IS NULL OR p_source_object_id IS NULL OR p_source_updated_at IS NULL OR p_sealed_object_id IS NULL OR p_sealed_updated_at IS NULL OR coalesce(p_byte_sha256~'^[a-f0-9]{64}$',false)=false OR p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 20971520 OR coalesce(p_mime_type IN('application/pdf','image/jpeg','image/png'),false)=false THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;SELECT * INTO r FROM public.uc_admission_evidence_reservations WHERE id=p_reservation_id AND case_id=c.id AND actor_id=p_actor_id;IF r.id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_admission_lock(p_actor_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,c.responsible_id);SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id FOR UPDATE;SELECT * INTO r FROM public.uc_admission_evidence_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF r.expected_revision IS DISTINCT FROM p_expected_revision OR c.revision IS DISTINCT FROM p_expected_revision THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;IF c.revision>=9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
 IF r.state NOT IN('prepared','sealed')OR r.expires_at<=clock_timestamp()THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
 IF c.program_ref IS DISTINCT FROM r.program_ref OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 PERFORM public.uc_admission_lock_source(r.id);src:=public.uc_admission_source_proof(r.id,p_actor_id);
 IF src IS NULL OR(src->>'object_id')::uuid IS DISTINCT FROM p_source_object_id OR(src->>'updated_at')::timestamptz IS DISTINCT FROM p_source_updated_at OR src->>'fingerprint'IS DISTINCT FROM p_source_fingerprint OR(src->>'byte_size')::bigint IS DISTINCT FROM p_byte_size OR src->>'mime_type'IS DISTINCT FROM p_mime_type OR(src->>'known_sha256'IS NOT NULL AND src->>'known_sha256'<>p_byte_sha256)THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 BEGIN PERFORM 1 FROM storage.objects WHERE id=p_sealed_object_id FOR SHARE NOWAIT;EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END;
 obj:=public.uc_admission_object('admission-case-evidence',r.user_id::text||'/'||r.organization_id::text||'/'||r.case_id::text||'/sealed/'||r.evidence_version_id::text,p_byte_sha256);
 IF r.expires_at<=clock_timestamp()THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
 IF obj IS NULL OR(obj->>'object_id')::uuid IS DISTINCT FROM p_sealed_object_id OR(obj->>'updated_at')::timestamptz IS DISTINCT FROM p_sealed_updated_at OR(obj->>'byte_size')::bigint IS DISTINCT FROM p_byte_size OR obj->>'mime_type'IS DISTINCT FROM p_mime_type THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 sealed:=jsonb_build_object('bucket','admission-case-evidence','path',obj->'path','object_id',p_sealed_object_id,'updated_at',p_sealed_updated_at,'byte_sha256',p_byte_sha256,'byte_size',p_byte_size,'mime_type',p_mime_type);
 IF r.state='sealed'THEN IF r.source_proof IS DISTINCT FROM src OR r.sealed_proof IS DISTINCT FROM sealed OR r.commit_request_id IS DISTINCT FROM p_request_id THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
 ELSE ctx:=public.uc_admission_context(c.id,p_actor_id,'attest');UPDATE public.uc_admission_evidence_reservations SET state='sealed',source_proof=src,sealed_proof=sealed,commit_request_id=p_request_id WHERE id=r.id;DELETE FROM public.uc_admission_case_requests WHERE actor_id=p_actor_id AND request_id=ctx AND kind='_context';END IF;
 RETURN jsonb_build_object('schema_version',1,'case_id',c.id,'reservation_id',r.id,'evidence_version_id',r.evidence_version_id,'state','sealed','byte_sha256',p_byte_sha256,'byte_size',p_byte_size,'mime_type',p_mime_type);END;$fn$;
CREATE FUNCTION public.uc_finalize_admission_case_evidence(p_case_id uuid,p_reservation_id uuid,p_expected_revision bigint,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
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
 DELETE FROM public.uc_admission_case_requests WHERE actor_id=a AND request_id=ctx AND kind='_context';RETURN public.uc_admission_result(c.id,a,receipt,false);END;$fn$;
CREATE FUNCTION public.uc_admission_evidence_file_context(p_case_id uuid,p_evidence_version_id uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();c public.uc_admission_cases;e public.uc_admission_case_evidence;o jsonb;BEGIN SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id;
 IF auth.role()IS DISTINCT FROM 'authenticated'OR NOT public.uc_admission_staff_allowed(a,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 SELECT * INTO e FROM public.uc_admission_case_evidence WHERE id=p_evidence_version_id AND case_id=c.id;
 o:=public.uc_admission_object('admission-case-evidence',e.sealed_path,e.byte_sha256);IF e.id IS NULL OR o IS NULL OR(o->>'object_id')::uuid IS DISTINCT FROM e.storage_object_id OR(o->>'updated_at')::timestamptz IS DISTINCT FROM e.object_updated_at OR(o->>'byte_size')::bigint IS DISTINCT FROM e.byte_size OR o->>'mime_type'IS DISTINCT FROM e.mime_type THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
 RETURN jsonb_build_object('schema_version',1,'actor_id',a,'scope',public.uc_admission_scope(c.id),'case_id',c.id,'case_revision',c.revision,'evidence_version_id',e.id,'object',o,'byte_sha256',e.byte_sha256,'byte_size',e.byte_size,'mime_type',e.mime_type);END;$fn$;

CREATE FUNCTION public.uc_admission_stage_allowed(p_bucket text,p_path text,p_write boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated'AND p_bucket='admission-case-evidence'AND EXISTS(SELECT 1 FROM public.uc_admission_evidence_reservations r JOIN public.uc_admission_cases c ON c.id=r.case_id
 WHERE r.actor_id=auth.uid()AND r.source->>'kind'='upload'AND r.state IN('prepared','sealed')AND r.expires_at>clock_timestamp()AND r.expected_revision=c.revision
 AND p_path=r.user_id::text||'/'||r.organization_id::text||'/'||c.id::text||'/staging/'||r.actor_id::text||'/'||r.id::text
 AND public.uc_admission_staff_allowed(auth.uid(),c.organization_id,c.user_id,c.group_id,c.enrollment_id,true)AND public.uc_admission_staff_allowed(auth.uid(),c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)
 AND(NOT p_write OR r.state='prepared'AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path))),false)
$fn$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)VALUES('admission-case-evidence','admission-case-evidence',false,20971520,ARRAY['application/pdf','image/jpeg','image/png']);
CREATE POLICY uc_admission_stage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='admission-case-evidence'AND public.uc_admission_stage_allowed(bucket_id,name,true)AND coalesce(to_jsonb(objects)->>'owner_id',to_jsonb(objects)->>'owner')=auth.uid()::text);
CREATE POLICY uc_admission_stage_select ON storage.objects FOR SELECT TO authenticated USING(bucket_id='admission-case-evidence'AND public.uc_admission_stage_allowed(bucket_id,name,false));
CREATE POLICY uc_admission_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK(bucket_id<>'admission-case-evidence'OR public.uc_admission_stage_allowed(bucket_id,name,true)AND coalesce(to_jsonb(objects)->>'owner_id',to_jsonb(objects)->>'owner')=auth.uid()::text);
CREATE POLICY uc_admission_select_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC USING(bucket_id<>'admission-case-evidence'OR public.uc_admission_stage_allowed(bucket_id,name,false));
CREATE POLICY uc_admission_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC USING(bucket_id<>'admission-case-evidence')WITH CHECK(bucket_id<>'admission-case-evidence');
CREATE POLICY uc_admission_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC USING(bucket_id<>'admission-case-evidence');
CREATE FUNCTION public.uc_guard_admission_storage()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE o jsonb:=CASE WHEN TG_OP='DELETE'THEN to_jsonb(OLD)ELSE to_jsonb(NEW)END;r public.uc_admission_evidence_reservations;c public.uc_admission_cases;BEGIN
 IF TG_OP='UPDATE'AND(OLD.bucket_id='admission-case-evidence'OR NEW.bucket_id='admission-case-evidence')THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF o->>'bucket_id'<>'admission-case-evidence'THEN RETURN CASE WHEN TG_OP='DELETE'THEN OLD ELSE NEW END;END IF;
 IF TG_OP='INSERT'THEN
  IF auth.role()='authenticated'AND public.uc_admission_stage_allowed(NEW.bucket_id,NEW.name,true)AND coalesce(to_jsonb(NEW)->>'owner_id',to_jsonb(NEW)->>'owner')=auth.uid()::text THEN RETURN NEW;END IF;
  IF auth.role()='service_role'AND auth.uid()IS NULL THEN
   SELECT * INTO r FROM public.uc_admission_evidence_reservations q WHERE NEW.name=q.user_id::text||'/'||q.organization_id::text||'/'||q.case_id::text||'/sealed/'||q.evidence_version_id::text AND q.state IN('prepared','sealed')AND q.expires_at>clock_timestamp();SELECT * INTO c FROM public.uc_admission_cases WHERE id=r.case_id;
   IF r.id IS NOT NULL AND c.revision=r.expected_revision AND public.uc_admission_staff_allowed(r.actor_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,true)AND public.uc_admission_staff_allowed(r.actor_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false)AND c.program_ref=public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id)AND NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.id=r.evidence_version_id)THEN RETURN NEW;END IF;
  END IF;
 ELSIF TG_OP='DELETE'AND auth.role()='service_role'AND auth.uid()IS NULL THEN
  -- The confirmed job snapshot is the explicit exact file plan. Unlike a GUC,
  -- this private row remains valid for the separate Storage cleanup request.
  IF EXISTS(SELECT 1 FROM public.account_deletion_jobs j,jsonb_array_elements(j.files)f WHERE j.state='cleanup_pending'AND EXISTS(SELECT 1 FROM public.account_deletion_revocations v WHERE v.user_id=j.user_id)AND(split_part(OLD.name,'/',1)=j.user_id::text OR split_part(OLD.name,'/',4)='staging'AND split_part(OLD.name,'/',5)=j.user_id::text)AND f->>'bucket'=OLD.bucket_id AND f->>'path'=OLD.name AND f->>'objectId'=OLD.id::text AND(f->>'updatedAt')::timestamptz=OLD.updated_at)THEN RETURN OLD;END IF;
  IF NOT EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.storage_object_id=OLD.id OR e.sealed_path=OLD.name)AND EXISTS(SELECT 1 FROM public.uc_admission_evidence_reservations q WHERE q.state<>'consumed'AND q.expires_at<=clock_timestamp()AND(OLD.name=q.user_id::text||'/'||q.organization_id::text||'/'||q.case_id::text||'/sealed/'||q.evidence_version_id::text OR OLD.name=q.user_id::text||'/'||q.organization_id::text||'/'||q.case_id::text||'/staging/'||q.actor_id::text||'/'||q.id::text))THEN RETURN OLD;END IF;
 END IF;PERFORM public.uc_admission_error('ACCESS_DENIED');RETURN NULL;END;$fn$;
CREATE TRIGGER uc_admission_storage_boundary BEFORE INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.uc_guard_admission_storage();
CREATE FUNCTION public.uc_guard_admission_org_delete()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN IF EXISTS(SELECT 1 FROM public.uc_admission_cases WHERE organization_id=OLD.id)THEN PERFORM public.uc_admission_error('REVIEW_REQUIRED');END IF;RETURN OLD;END;$fn$;
CREATE TRIGGER uc_admission_org_file_plan BEFORE DELETE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.uc_guard_admission_org_delete();
CREATE FUNCTION public.uc_erase_admission_cases(p_user uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE cid uuid;t text;r record;redacted jsonb;ctx uuid;force boolean;BEGIN
 IF auth.role()IS DISTINCT FROM 'service_role'OR auth.uid()IS NOT NULL OR current_setting('sintagma.account_deletion_erase_user',true)IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 -- Never acquire other subjects'/reviewers' account advisory locks here.
 -- Sort the complete parent union before touching any registry child.
 FOR cid IN SELECT c.id FROM public.uc_admission_cases c WHERE c.user_id=p_user OR c.responsible_id=p_user OR c.reviews::text LIKE '%'||p_user::text||'%'OR c.decision::text LIKE '%'||p_user::text||'%'OR c.tasks::text LIKE '%'||p_user::text||'%'
 OR EXISTS(SELECT 1 FROM public.uc_admission_case_events e WHERE e.case_id=c.id AND(e.actor_id=p_user OR e.payload::text LIKE '%'||p_user::text||'%'OR e.authority_snapshot::text LIKE '%'||p_user::text||'%'))
 OR EXISTS(SELECT 1 FROM public.uc_admission_rule_sets s WHERE s.case_id=c.id AND(s.reviewer_id=p_user OR s.authority_snapshot::text LIKE '%'||p_user::text||'%'))
 OR EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.case_id=c.id AND(e.captured_by=p_user OR p_user=ANY(e.participant_ids)))
 OR EXISTS(SELECT 1 FROM public.uc_admission_case_requests q WHERE q.case_id=c.id AND q.actor_id=p_user)
 OR EXISTS(SELECT 1 FROM public.uc_admission_evidence_reservations q WHERE q.case_id=c.id AND q.actor_id=p_user)ORDER BY c.id LOOP PERFORM 1 FROM public.uc_admission_cases WHERE id=cid FOR UPDATE;END LOOP;
 FOR cid IN SELECT c.id FROM public.uc_admission_cases c WHERE c.user_id=p_user OR c.responsible_id=p_user OR c.reviews::text LIKE '%'||p_user::text||'%'OR c.decision::text LIKE '%'||p_user::text||'%'OR c.tasks::text LIKE '%'||p_user::text||'%'
 OR EXISTS(SELECT 1 FROM public.uc_admission_case_events e WHERE e.case_id=c.id AND(e.actor_id=p_user OR e.payload::text LIKE '%'||p_user::text||'%'OR e.authority_snapshot::text LIKE '%'||p_user::text||'%'))
 OR EXISTS(SELECT 1 FROM public.uc_admission_rule_sets s WHERE s.case_id=c.id AND(s.reviewer_id=p_user OR s.authority_snapshot::text LIKE '%'||p_user::text||'%'))
 OR EXISTS(SELECT 1 FROM public.uc_admission_case_evidence e WHERE e.case_id=c.id AND(e.captured_by=p_user OR p_user=ANY(e.participant_ids)))
 OR EXISTS(SELECT 1 FROM public.uc_admission_case_requests q WHERE q.case_id=c.id AND q.actor_id=p_user)
 OR EXISTS(SELECT 1 FROM public.uc_admission_evidence_reservations q WHERE q.case_id=c.id AND q.actor_id=p_user)ORDER BY c.id LOOP
  ctx:=public.uc_admission_context(cid,p_user,'reviewer_erase',p_user);
  DELETE FROM public.uc_admission_evidence_reservations WHERE case_id=cid AND(actor_id=p_user OR user_id=p_user);
  DELETE FROM public.uc_admission_case_requests WHERE case_id=cid AND kind<>'_context'AND(actor_id=p_user OR user_id=p_user);
  IF EXISTS(SELECT 1 FROM public.uc_admission_cases WHERE id=cid AND user_id=p_user)THEN
   DELETE FROM public.uc_admission_case_evidence WHERE case_id=cid;DELETE FROM public.uc_admission_case_events WHERE case_id=cid;DELETE FROM public.uc_admission_rule_sets WHERE case_id=cid;
   DELETE FROM public.uc_admission_cases WHERE id=cid;DELETE FROM public.uc_admission_case_requests WHERE actor_id=p_user AND request_id=ctx AND kind='_context';
  ELSE
   SELECT EXISTS(SELECT 1 FROM public.uc_admission_cases c JOIN public.uc_admission_rule_sets s ON s.id=c.rule_set_id WHERE c.id=cid AND s.reviewer_id=p_user)INTO force;
   FOREACH t IN ARRAY ARRAY['uc_admission_cases','uc_admission_rule_sets','uc_admission_case_events','uc_admission_case_evidence']LOOP
    FOR r IN EXECUTE format('SELECT to_jsonb(x)old_row FROM public.%I x WHERE %s=$1',t,CASE WHEN t='uc_admission_cases'THEN 'id'ELSE 'case_id'END)USING cid LOOP
     redacted:=public.uc_admission_redact(r.old_row,p_user,(t='uc_admission_cases'AND force)OR(t='uc_admission_rule_sets'AND r.old_row->>'reviewer_id'=p_user::text)OR(t='uc_admission_case_events'AND r.old_row->>'actor_id'=p_user::text));
     IF redacted IS DISTINCT FROM r.old_row THEN
      -- Full typed-row equality is rechecked by the private erasure guard.
      EXECUTE format('UPDATE public.%I x SET(%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1))WHERE id=$2',t,
       (SELECT string_agg(quote_ident(attname),','ORDER BY attnum)FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped),
       (SELECT string_agg(quote_ident(attname),','ORDER BY attnum)FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped),t)USING redacted,(r.old_row->>'id')::uuid;
     END IF;
    END LOOP;
   END LOOP;
   DELETE FROM public.uc_admission_case_requests WHERE actor_id=p_user AND request_id=ctx AND kind='_context';
  END IF;
 END LOOP;
END;$fn$;

DO $patch$DECLARE original text;patched text;BEGIN
 original:=pg_get_functiondef('public.account_deletion_files(uuid)'::regprocedure);patched:=original;
 IF(length(patched)-length(replace(patched,'''avatars'',''student-documents'',''final-test-photos'',''student-identification-media''','')))/length('''avatars'',''student-documents'',''final-test-photos'',''student-identification-media''')<>1 THEN RAISE EXCEPTION 'Exact admission patch anchor missing: account_deletion_files(uuid)';END IF;
 patched:=replace(patched,'''avatars'',''student-documents'',''final-test-photos'',''student-identification-media''','''avatars'',''student-documents'',''final-test-photos'',''student-identification-media'',''admission-case-evidence''');
 IF(length(patched)-length(replace(patched,'  OR (o.bucket_id=''student-documents'' AND o.name LIKE ''avatars/''||p_user_id::text||''.%'')','')))/length('  OR (o.bucket_id=''student-documents'' AND o.name LIKE ''avatars/''||p_user_id::text||''.%'')')<>1 THEN RAISE EXCEPTION 'Exact admission patch anchor missing: account_deletion_files(uuid)';END IF;
 patched:=replace(patched,'  OR (o.bucket_id=''student-documents'' AND o.name LIKE ''avatars/''||p_user_id::text||''.%'')','  OR (o.bucket_id=''student-documents'' AND o.name LIKE ''avatars/''||p_user_id::text||''.%'')
  OR (o.bucket_id=''admission-case-evidence''AND split_part(o.name,''/'',4)=''staging''AND split_part(o.name,''/'',5)=p_user_id::text)');
 EXECUTE patched;
 original:=pg_get_functiondef('public.account_deletion_storage_write_guard()'::regprocedure);patched:=original;
 IF(length(patched)-length(replace(patched,'''avatars'',''student-documents'',''final-test-photos'',''student-identification-media''','')))/length('''avatars'',''student-documents'',''final-test-photos'',''student-identification-media''')<>1 THEN RAISE EXCEPTION 'Exact admission patch anchor missing: account_deletion_storage_write_guard()';END IF;
 patched:=replace(patched,'''avatars'',''student-documents'',''final-test-photos'',''student-identification-media''','''avatars'',''student-documents'',''final-test-photos'',''student-identification-media'',''admission-case-evidence''');
 EXECUTE patched;
 original:=pg_get_functiondef('public.account_deletion_personal_row_counts(uuid)'::regprocedure);patched:=original;
 IF(length(patched)-length(replace(patched,'  (''video_identifications'',''user_id''),','')))/length('  (''video_identifications'',''user_id''),')<>1 THEN RAISE EXCEPTION 'Exact admission patch anchor missing: account_deletion_personal_row_counts(uuid)';END IF;
 patched:=replace(patched,'  (''video_identifications'',''user_id''),','  (''uc_admission_cases'',''user_id''),
  (''uc_admission_cases'',''responsible_id''),
  (''uc_admission_rule_sets'',''user_id''),
  (''uc_admission_rule_sets'',''reviewer_id''),
  (''uc_admission_case_events'',''user_id''),
  (''uc_admission_case_events'',''actor_id''),
  (''uc_admission_case_evidence'',''user_id''),
  (''uc_admission_case_evidence'',''captured_by''),
  (''uc_admission_evidence_reservations'',''user_id''),
  (''uc_admission_evidence_reservations'',''actor_id''),
  (''uc_admission_case_requests'',''user_id''),
  (''uc_admission_case_requests'',''actor_id''),
  (''video_identifications'',''user_id''),');
 IF(length(patched)-length(replace(patched,' RETURN result;','')))/length(' RETURN result;')<>1 THEN RAISE EXCEPTION 'Exact admission patch anchor missing: account_deletion_personal_row_counts(uuid)';END IF;
 patched:=replace(patched,' RETURN result;',' SELECT count(*)INTO n FROM public.uc_admission_cases WHERE reviews::text LIKE ''%''||p_user_id::text||''%''OR decision::text LIKE ''%''||p_user_id::text||''%''OR tasks::text LIKE ''%''||p_user_id::text||''%'';
 IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object(''table'',''uc_admission_cases'',''column'',''review_attribution'',''count'',n));END IF;
 RETURN result;');
 EXECUTE patched;
 original:=pg_get_functiondef('public.account_deletion_erase_data(uuid,text)'::regprocedure);patched:=original;
 IF(length(patched)-length(replace(patched,' PERFORM set_config(''sintagma.account_deletion_erase_user'',u::text,true);','')))/length(' PERFORM set_config(''sintagma.account_deletion_erase_user'',u::text,true);')<>1 THEN RAISE EXCEPTION 'Exact admission patch anchor missing: account_deletion_erase_data(uuid,text)';END IF;
 patched:=replace(patched,' PERFORM set_config(''sintagma.account_deletion_erase_user'',u::text,true);',' PERFORM set_config(''sintagma.account_deletion_erase_user'',u::text,true);
 PERFORM public.uc_erase_admission_cases(u);');
 EXECUTE patched;
 original:=pg_get_functiondef('public.account_deletion_snapshot(uuid)'::regprocedure);patched:=original;
 IF(length(patched)-length(replace(patched,' IF v_org_shared>0 THEN v_blockers:=','')))/length(' IF v_org_shared>0 THEN v_blockers:=')<>1 THEN RAISE EXCEPTION 'Exact admission patch anchor missing: account_deletion_snapshot(uuid)';END IF;
 patched:=replace(patched,' IF v_org_shared>0 THEN v_blockers:=',' v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_admission_cases WHERE organization_id=v_org);
 IF v_org_shared>0 THEN v_blockers:=');
 IF(length(patched)-length(replace(patched,' v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''security_record''','')))/length(' v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''security_record''')<>1 THEN RAISE EXCEPTION 'Exact admission patch anchor missing: account_deletion_snapshot(uuid)';END IF;
 patched:=replace(patched,' v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''security_record''',' SELECT count(*)INTO v_count FROM public.uc_admission_cases WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''admission_cases'',''label'',''Личные дела и их индивидуальные копии'',''count'',v_count,''action'',''delete''));END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_case_events WHERE actor_id=p_user_id AND user_id<>p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''admission_review_attribution'',''label'',''Атрибуция внутренних проверок: удаляется ссылка на аккаунт и личный текст'',''count'',v_count,''action'',''anonymize''));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object(''key'',''security_record''');
 EXECUTE patched;
END;$patch$;


DO $grants$DECLARE f record;BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname~'^uc_admission_'OR p.proname IN('uc_attest_admission_case_evidence','uc_finalize_admission_case_evidence','uc_erase_admission_cases','uc_guard_admission_history','uc_guard_admission_storage','uc_guard_admission_org_delete','read_student_admission_case','apply_student_admission_case_action','prepare_admission_case_evidence'))LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.oid::regprocedure);
  IF f.proname IN('read_student_admission_case','apply_student_admission_case_action','prepare_admission_case_evidence','uc_admission_evidence_context','uc_finalize_admission_case_evidence','uc_admission_evidence_file_context','uc_admission_stage_allowed')THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.oid::regprocedure);END IF;
  IF f.proname='uc_attest_admission_case_evidence'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.oid::regprocedure);END IF;
  IF f.proname='uc_admission_stage_allowed'THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon',f.oid::regprocedure);END IF;
 END LOOP;
END;$grants$;
