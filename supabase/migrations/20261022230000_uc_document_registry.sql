-- UC018: explicit general document registrations, typed current relations and exact private versions.
-- Additive objects, no old-row backfill, no official education issuance/number allocation.
-- Production ledger/preservation guards belong to the reviewed outer release wrapper.
SET search_path=pg_catalog,public;
CREATE TABLE public.uc_document_registry_heads(organization_id uuid PRIMARY KEY,revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991));
CREATE TABLE public.uc_document_registry_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,group_id uuid,scope_group_ids uuid[] NOT NULL DEFAULT'{}',
 registration_id text NOT NULL,sequence_year integer NOT NULL,sequence_number integer NOT NULL CHECK(sequence_number>0),revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991),
 status text NOT NULL DEFAULT'registered'CHECK(status IN('registered','archived')),data jsonb NOT NULL,context_binding jsonb NOT NULL,legacy_claim jsonb,
 participant_ids uuid[] NOT NULL DEFAULT'{}',registered_by uuid,updated_by uuid,registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),redacted boolean NOT NULL DEFAULT false,
 UNIQUE(organization_id,registration_id),UNIQUE(organization_id,sequence_year,sequence_number)
);
CREATE INDEX uc_document_registry_records_page ON public.uc_document_registry_records(organization_id,registered_at DESC,id DESC);
CREATE INDEX uc_document_registry_records_groups ON public.uc_document_registry_records USING gin(scope_group_ids);
CREATE TABLE public.uc_document_registry_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,record_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision>0),action text NOT NULL CHECK(action IN('register','correct','archive','attach_legacy')),
 reason text NOT NULL,snapshot jsonb NOT NULL,participant_ids uuid[] NOT NULL DEFAULT'{}',recorded_by uuid,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),redacted boolean NOT NULL DEFAULT false,UNIQUE(record_id,revision)
);
CREATE INDEX uc_document_registry_events_org ON public.uc_document_registry_events(organization_id,record_id,revision);
CREATE TABLE public.uc_document_registry_requests(
 actor_id uuid NOT NULL,request_id uuid NOT NULL,organization_id uuid NOT NULL,scope jsonb NOT NULL,payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),result jsonb NOT NULL,
 participant_ids uuid[] NOT NULL DEFAULT'{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE public.uc_document_registry_incoming_sources(
 incoming_document_id uuid PRIMARY KEY,organization_id uuid NOT NULL,source jsonb NOT NULL,binding_hash text NOT NULL CHECK(binding_hash~'^[a-f0-9]{64}$'),record_id uuid,revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 participant_ids uuid[] NOT NULL DEFAULT'{}',linked_by uuid,linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid,updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX uc_document_registry_incoming_record ON public.uc_document_registry_incoming_sources(record_id)WHERE record_id IS NOT NULL;
CREATE INDEX uc_document_registry_incoming_org ON public.uc_document_registry_incoming_sources(organization_id,incoming_document_id);
CREATE FUNCTION public.uc_document_registry_error(p_code text)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION USING ERRCODE=CASE WHEN p_code='ACCESS_DENIED'THEN'42501'WHEN p_code='NOT_FOUND'THEN'PT404'WHEN p_code IN('REVISION_CONFLICT','REQUEST_MISMATCH','SOURCE_CHANGED','CONTEXT_CHANGED')THEN'PT409'ELSE'22023'END,MESSAGE='DOCUMENT_REGISTRY_'||p_code;END;$fn$;
CREATE FUNCTION public.uc_document_registry_hash(p_text text)RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$ SELECT encode(sha256(convert_to(p_text,'UTF8')),'hex') $fn$;


CREATE FUNCTION public.uc_document_registry_text(p jsonb,p_max integer,p_empty boolean DEFAULT false)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_typeof(p)='string' AND octet_length(p#>>'{}')<=p_max*4 AND char_length(p#>>'{}')+(SELECT count(*)FROM regexp_split_to_table(p#>>'{}','')ch WHERE ascii(ch)>65535)<=p_max AND(p_empty OR btrim(p#>>'{}')<>''),false) $fn$;
CREATE FUNCTION public.uc_document_registry_scope(p_org uuid,p_scope jsonb)RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g uuid;BEGIN
 IF public.uc_custom_journal_shape(p_scope,ARRAY['kind'])AND p_scope->>'kind'='organization'THEN g:=NULL;
 ELSIF public.uc_custom_journal_shape(p_scope,ARRAY['kind','group_id'])AND p_scope->>'kind'='group'AND public.uc_custom_journal_uuid(p_scope->'group_id')THEN g:=(p_scope->>'group_id')::uuid;
 ELSE PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_custom_journal_person(auth.uid())OR NOT public.account_deletion_access_allowed()OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org)
 OR NOT public.uc_platform_document_action_allowed(auth.uid(),'read')OR(g IS NULL AND public.uc_document_teacher_limited(p_org))
 OR(g IS NOT NULL AND(NOT EXISTS(SELECT 1 FROM public.student_groups WHERE id=g AND organization_id=p_org)OR NOT public.uc_document_scope_allowed(p_org,g,NULL)))
 OR NOT(public.can_access_organization(p_org,'journals.read')OR public.can_access_organization(p_org,'documents.read')OR public.can_access_organization(p_org,'documents.write'))THEN PERFORM public.uc_document_registry_error('ACCESS_DENIED');END IF;RETURN g;END;$fn$;
CREATE FUNCTION public.uc_document_registry_caps(p_org uuid,p_group uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE jr boolean:=public.uc_scoped_journal_permission(p_org,p_group,false);jw boolean:=public.uc_scoped_journal_permission(p_org,p_group,true);dr boolean:=public.uc_copy_registry_file_permission(p_org);dw boolean;
BEGIN dw:=coalesce(NOT public.uc_document_teacher_limited(p_org)AND public.uc_document_action_allowed(p_org,'write',NULL,NULL),false);
 RETURN jsonb_build_object('can_read',jr,'can_register',jw AND dw AND dr,'can_correct',jw AND dw AND dr,'can_archive',jw,'can_open_file',dr,'can_capture_source',dw,
 'can_read_legacy',jr AND(public.uc_document_org_access(p_org,false)OR(p_group IS NOT NULL AND public.can_access_organization(p_org,'documents.read'))),
 'can_register_incoming',jw AND dw AND dr AND public.uc_document_org_access(p_org,true),
 'can_read_incoming',CASE WHEN p_group IS NULL THEN public.uc_document_org_access(p_org,false)AND NOT public.uc_document_teacher_limited(p_org)ELSE public.can_access_organization(p_org,'documents.read')END,
 'can_capture_incoming',p_group IS NULL AND dw AND public.uc_document_org_access(p_org,true));END;$fn$;
CREATE FUNCTION public.uc_document_registry_base(p_org uuid,p_scope jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g uuid;rev bigint;BEGIN g:=public.uc_document_registry_scope(p_org,p_scope);SELECT revision INTO rev FROM public.uc_document_registry_heads WHERE organization_id=p_org;RETURN jsonb_build_object('schema_version',1,'organization_id',p_org,'scope',p_scope,'registry_revision',coalesce(rev,0),'capabilities',public.uc_document_registry_caps(p_org,g));END;$fn$;
CREATE FUNCTION public.uc_document_registry_fence(p_org uuid,p_group uuid,p_people uuid[],p_write boolean DEFAULT false,p_request uuid DEFAULT NULL)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE who uuid;BEGIN
 IF cardinality(coalesce(p_people,'{}'))>20000 THEN PERFORM public.uc_document_registry_error('LIMIT_EXCEEDED');END IF;
 FOR who IN SELECT DISTINCT x FROM unnest(array_append(coalesce(p_people,'{}'),auth.uid()))x WHERE x IS NOT NULL ORDER BY x LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(who::text,42007))THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;
  IF NOT public.uc_custom_journal_person(who)THEN PERFORM public.uc_document_registry_error('SOURCE_UNAVAILABLE');END IF;
 END LOOP;
 IF p_write THEN
  IF NOT pg_try_advisory_xact_lock(hashtextextended(p_org::text,0))THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;
  IF p_group IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_program_roster:'||p_group::text,0))THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_document_registry:'||p_org::text,0))THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;
 END IF;
 IF NOT p_write AND NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc_document_registry:'||p_org::text,0))THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;
 IF p_request IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_document_registry_request:'||auth.uid()::text||':'||p_request::text,0))THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;
 LOCK TABLE public.organizations,public.org_staff,public.org_staff_document_groups,public.user_roles,public.admin_staff IN ROW SHARE MODE NOWAIT;
 PERFORM 1 FROM public.organizations WHERE id=p_org FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_staff WHERE organization_id=p_org AND user_id=auth.uid()ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_staff_document_groups a JOIN public.org_staff s ON s.id=a.staff_id WHERE a.organization_id=p_org AND a.group_id=p_group AND s.user_id=auth.uid()ORDER BY a.staff_id FOR SHARE OF a NOWAIT;
 PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid()FOR SHARE NOWAIT;PERFORM 1 FROM public.admin_staff WHERE user_id=auth.uid()FOR SHARE NOWAIT;
 PERFORM public.uc_document_registry_scope(p_org,CASE WHEN p_group IS NULL THEN jsonb_build_object('kind','organization')ELSE jsonb_build_object('kind','group','group_id',p_group)END);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END;$fn$;


CREATE FUNCTION public.uc_document_registry_source(p_org uuid,p_ref jsonb,p_required boolean DEFAULT true,p_own_write boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE proof jsonb;v public.org_document_versions;d public.org_documents;BEGIN
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
CREATE FUNCTION public.uc_document_registry_student(p_org uuid,p_group uuid,p_user uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_custom_journal_person(p_user)AND EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.user_id=p_user AND c.organization_id=p_org)
 AND(p_group IS NULL OR EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=p_user)),false) $fn$;
CREATE FUNCTION public.uc_document_registry_company(p_org uuid,p_group uuid,p_company uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.can_access_organization(p_org,'companies.read')AND EXISTS(SELECT 1 FROM public.companies c WHERE c.id=p_company AND c.organization_id=p_org)
 AND(p_group IS NULL OR EXISTS(SELECT 1 FROM public.org_contracts c WHERE c.organization_id=p_org AND c.company_id=p_company AND c.status NOT IN('deleted','cancelled','archived')AND(c.student_group_id=p_group OR EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=c.student_user_id)))),false) $fn$;
CREATE FUNCTION public.uc_document_registry_party(p_org uuid,p_group uuid,p_party jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE label text;person_id uuid;BEGIN
 IF public.uc_custom_journal_shape(p_party,ARRAY['kind','organization_id'])AND p_party->>'kind'='organization'AND public.uc_custom_journal_uuid(p_party->'organization_id')AND(p_party->>'organization_id')::uuid=p_org THEN SELECT name INTO label FROM public.organizations WHERE id=p_org;RETURN jsonb_build_object('label',left(coalesce(label,'Организация'),500),'participants','[]'::jsonb);
 ELSIF public.uc_custom_journal_shape(p_party,ARRAY['kind','user_id'])AND p_party->>'kind'='student'AND public.uc_custom_journal_uuid(p_party->'user_id')THEN person_id:=(p_party->>'user_id')::uuid;IF NOT public.uc_document_registry_student(p_org,p_group,person_id)THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;RETURN jsonb_build_object('label',public.uc_copy_registry_label(person_id),'participants',jsonb_build_array(person_id));
 ELSIF public.uc_custom_journal_shape(p_party,ARRAY['kind','company_id'])AND p_party->>'kind'='company'AND public.uc_custom_journal_uuid(p_party->'company_id')THEN IF NOT public.uc_document_registry_company(p_org,p_group,(p_party->>'company_id')::uuid)THEN PERFORM public.uc_document_registry_error('CONTEXT_MISMATCH');END IF;SELECT name INTO label FROM public.companies WHERE id=(p_party->>'company_id')::uuid;RETURN jsonb_build_object('label',left(label,500),'participants','[]'::jsonb);
 ELSIF public.uc_custom_journal_shape(p_party,ARRAY['kind','entity_type','name','inn'])AND p_party->>'kind'='external'AND coalesce(p_party->>'entity_type'IN('person','organization'),false)AND public.uc_document_registry_text(p_party->'name',300)AND(p_party->'inn'='null'::jsonb OR jsonb_typeof(p_party->'inn')='string'AND p_party->>'inn'~'^(\d{10}|\d{12})$')THEN RETURN jsonb_build_object('label',p_party->>'name','participants','[]'::jsonb);
 ELSE PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;END;$fn$;


CREATE FUNCTION public.uc_document_registry_context(p_org uuid,p_group uuid,p_subject jsonb,p_context jsonb,p_check boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE k text:=p_context->>'kind';subject_id uuid;e public.enrollments;c public.courses;t public.org_contracts;group_ids uuid[]:='{}';people uuid[]:='{}';binding jsonb;proof jsonb;label text;expected text;ref jsonb;
BEGIN
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


CREATE FUNCTION public.uc_document_registry_legacy_visible(p_org uuid,p_enrollment uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated'AND public.account_deletion_access_allowed()AND(public.uc_document_org_access(p_org,false)AND NOT public.uc_document_teacher_limited(p_org)OR EXISTS(
  SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=p_enrollment AND c.organization_id=p_org AND(e.user_id=auth.uid()OR public.uc_document_scope_allowed(p_org,NULL,p_enrollment)))),false) $fn$;
CREATE FUNCTION public.uc_document_registry_legacy(p_org uuid,p_group uuid,p_id uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE r public.document_issuance_log;e public.enrollments;claim jsonb;BEGIN
 SELECT x.*INTO r FROM public.document_issuance_log x WHERE x.id=p_id AND x.organization_id=p_org AND x.deleted_at IS NULL;
 IF r.id IS NULL OR NOT public.uc_document_registry_legacy_visible(p_org,r.enrollment_id)THEN PERFORM public.uc_document_registry_error('NOT_FOUND');END IF;
 SELECT x.*INTO e FROM public.enrollments x JOIN public.courses c ON c.id=x.course_id WHERE x.id=r.enrollment_id AND c.organization_id=p_org;
 IF p_group IS NOT NULL AND(e.id IS NULL OR NOT public.uc_document_registry_student(p_org,p_group,e.user_id)OR EXISTS(SELECT 1 FROM public.student_groups g WHERE g.id=p_group AND g.course_id IS NOT NULL AND g.course_id<>e.course_id))THEN PERFORM public.uc_document_registry_error('NOT_FOUND');END IF;
 claim:=jsonb_build_object('id',r.id,'enrollment_id',r.enrollment_id,'stored_user_id',r.user_id,'stored_user_name',r.user_name,'document_type',r.document_type,'document_name',r.document_name,'reg_number',r.reg_number,'issued_at',r.issued_at,'send_method',r.send_method,'send_number',r.send_number,'file_url_present',coalesce(r.file_url<>'',false),'created_at',r.created_at);
 RETURN jsonb_build_object('claim',claim,'student',CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object('user_id',e.user_id,'label',public.uc_copy_registry_label(e.user_id))END,'enrollment_id',e.id,'relationship_verified',e.id IS NOT NULL,'legacy_binding_hash',public.uc_document_registry_hash(to_jsonb(r)::text),'file_state',CASE WHEN coalesce(r.file_url,'')=''THEN'missing'ELSE'legacy_unversioned'END,'can_open_file',false);
END;$fn$;
CREATE FUNCTION public.uc_document_registry_data(p_org uuid,p_group uuid,p_data jsonb,p_check_context boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE src jsonb;sender jsonb;recipient jsonb;ctx jsonb;origin jsonb:=p_data->'origin';legacy jsonb;people uuid[]:='{}';part jsonb;typ text:=p_data->>'document_type';BEGIN
 IF NOT public.uc_custom_journal_shape(p_data,ARRAY['direction','document_type','title','document_date','declared_document_number','source','sender','recipient','subject','context','origin','notes'])OR NOT coalesce(p_data->>'direction'IN('incoming','outgoing'),false)
 OR NOT coalesce(typ IN('contract','enrollment_order','expulsion_order','certificate','diploma','qualification','protocol','invoice','act','other'),false)OR NOT public.uc_document_registry_text(p_data->'title',500)OR NOT public.uc_copy_registry_date(p_data->'document_date')
 OR NOT(p_data->'declared_document_number'='null'::jsonb OR public.uc_document_registry_text(p_data->'declared_document_number',120,true))OR NOT public.uc_document_registry_text(p_data->'notes',4000,true)THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
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


CREATE FUNCTION public.uc_document_registry_party_label(p_org uuid,p_party jsonb)RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE name text;BEGIN CASE p_party->>'kind'WHEN'organization'THEN SELECT x.name INTO name FROM public.organizations x WHERE x.id=p_org;WHEN'student'THEN name:=public.uc_copy_registry_label((p_party->>'user_id')::uuid);WHEN'company'THEN SELECT x.name INTO name FROM public.companies x WHERE x.id=(p_party->>'company_id')::uuid AND x.organization_id=p_org;ELSE name:=p_party->>'name';END CASE;RETURN left(coalesce(name,'Исторический адресат'),500);END;$fn$;
CREATE FUNCTION public.uc_document_registry_record_json(p public.uc_document_registry_records,p_caps jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE src jsonb;ctx jsonb;current_context boolean:=false;can_correct boolean:=false;context_label text:='Связь изменена; прежние идентификаторы сохранены';proof jsonb;BEGIN
 src:=public.uc_document_registry_source(p.organization_id,p.data->'source',false,false);
 BEGIN ctx:=public.uc_document_registry_context(p.organization_id,p.group_id,p.data->'subject',p.data->'context',true);current_context:=ctx->'binding'=p.context_binding;IF current_context THEN context_label:=ctx->>'label';END IF;
 EXCEPTION WHEN SQLSTATE'22023'OR SQLSTATE'PT409'OR SQLSTATE'PT404'OR SQLSTATE'42501'THEN IF SQLERRM NOT LIKE'DOCUMENT_REGISTRY_%'THEN RAISE;END IF;current_context:=false;END;
 IF(p_caps->>'can_correct')::boolean AND p.status='registered'AND src IS NOT NULL AND current_context THEN BEGIN proof:=public.uc_document_registry_data(p.organization_id,p.group_id,p.data,true);can_correct:=true;
 EXCEPTION WHEN SQLSTATE'22023'OR SQLSTATE'PT409'OR SQLSTATE'PT404'OR SQLSTATE'42501'THEN IF SQLERRM NOT LIKE'DOCUMENT_REGISTRY_%'THEN RAISE;END IF;can_correct:=false;END;END IF;
 RETURN jsonb_build_object('id',p.id,'group_id',p.group_id,'registration_id',p.registration_id,'sequence_year',p.sequence_year,'sequence_number',p.sequence_number,'revision',p.revision,'status',p.status,'data',p.data,'context_binding',p.context_binding,'registered_at',p.registered_at,'recorded_by',p.registered_by,'recorded_by_label',CASE WHEN p.registered_by IS NULL THEN NULL ELSE public.uc_copy_registry_label(p.registered_by)END,'updated_at',p.updated_at,'source_label',src->'label','source_available',src IS NOT NULL,'sender_label',public.uc_document_registry_party_label(p.organization_id,p.data->'sender'),'recipient_label',public.uc_document_registry_party_label(p.organization_id,p.data->'recipient'),'subject_label',CASE WHEN p.data->'subject'->>'kind'='student'THEN public.uc_copy_registry_label((p.data->'subject'->>'user_id')::uuid)ELSE NULL END,'context_label',context_label,'context_current',current_context,'legacy_claim',p.legacy_claim,'can_correct',can_correct,'can_archive',(p_caps->>'can_archive')::boolean AND p.status='registered','can_open_file',(p_caps->>'can_open_file')::boolean AND src IS NOT NULL);
END;$fn$;
CREATE FUNCTION public.uc_document_registry_event_json(p public.uc_document_registry_events)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
 SELECT jsonb_build_object('id',p.id,'record_id',p.record_id,'revision',p.revision,'action',p.action,'reason',p.reason,'snapshot',p.snapshot,'recorded_at',p.recorded_at,'recorded_by',p.recorded_by,'recorded_by_label',CASE WHEN p.recorded_by IS NULL THEN NULL ELSE public.uc_copy_registry_label(p.recorded_by)END) $fn$;
CREATE FUNCTION public.uc_document_registry_filters(p jsonb)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_custom_journal_shape(p,ARRAY['direction','document_type','status','date_from','date_to','text'])AND p->>'direction'IN('all','incoming','outgoing')AND p->>'document_type'IN('all','contract','enrollment_order','expulsion_order','certificate','diploma','qualification','protocol','invoice','act','other')AND p->>'status'IN('all','registered','archived')AND(p->'date_from'='null'::jsonb OR public.uc_copy_registry_date(p->'date_from'))AND(p->'date_to'='null'::jsonb OR public.uc_copy_registry_date(p->'date_to'))AND(p->>'date_from'IS NULL OR p->>'date_to'IS NULL OR p->>'date_from'<=p->>'date_to')AND public.uc_document_registry_text(p->'text',200,true),false) $fn$;
CREATE FUNCTION public.uc_document_registry_matches(p public.uc_document_registry_records,p_group uuid,p_filters jsonb)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT NOT p.redacted AND(p_group IS NULL OR p_group=ANY(p.scope_group_ids))AND(p_filters->>'direction'='all'OR p.data->>'direction'=p_filters->>'direction')AND(p_filters->>'document_type'='all'OR p.data->>'document_type'=p_filters->>'document_type')AND(p_filters->>'status'='all'OR p.status=p_filters->>'status')AND(p_filters->>'date_from'IS NULL OR p.data->>'document_date'>=p_filters->>'date_from')AND(p_filters->>'date_to'IS NULL OR p.data->>'document_date'<=p_filters->>'date_to')AND(coalesce(p_filters->>'text','')=''OR strpos(lower(p.registration_id||' '||coalesce(p.data->>'title','')||' '||coalesce(p.data->>'declared_document_number','')||' '||coalesce(p.data->>'notes','')),lower(p_filters->>'text'))>0) $fn$;
CREATE FUNCTION public.uc_document_registry_incoming_json(p public.incoming_documents,p_group uuid,p_caps jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE link public.uc_document_registry_incoming_sources;r public.uc_document_registry_records;src jsonb;oldfile boolean:=false;BEGIN
 SELECT*INTO link FROM public.uc_document_registry_incoming_sources WHERE incoming_document_id=p.id AND organization_id=p.organization_id;
 IF link.record_id IS NOT NULL THEN SELECT*INTO r FROM public.uc_document_registry_records WHERE id=link.record_id AND organization_id=p.organization_id AND NOT redacted AND(p_group IS NULL OR p_group=ANY(scope_group_ids));END IF;
 IF p_group IS NOT NULL AND r.id IS NULL THEN PERFORM public.uc_document_registry_error('NOT_FOUND');END IF;
 IF link.incoming_document_id IS NOT NULL THEN src:=public.uc_document_registry_source(p.organization_id,link.source,false,false);ELSE
  oldfile:=coalesce(public.uc_document_org_access(p.organization_id,false)AND NOT public.uc_document_teacher_limited(p.organization_id)AND EXISTS(SELECT 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id WHERE b.id='incoming-documents'AND NOT b.public AND o.name=p.file_path AND o.name LIKE p.organization_id::text||'/%'),false);
 END IF;
 RETURN jsonb_build_object('id',p.id,'doc_type',p.doc_type,'title',p.title,'counterparty_name',p.counterparty_name,'counterparty_inn',p.counterparty_inn,'doc_number',p.doc_number,'doc_date',p.doc_date,'notes',p.notes,'created_at',p.created_at,'updated_at',p.updated_at,'related_signature_id',p.related_signature_id,'related_billing_doc_id',p.related_billing_doc_id,'related_company_id',p.related_company_id,'linked_source',link.source,'source_label',src->'label','source_available',src IS NOT NULL,'binding_hash',link.binding_hash,'registry_record_id',r.id,'registration_id',r.registration_id,'legacy_unversioned',link.incoming_document_id IS NULL,'can_register',(p_caps->>'can_register_incoming')::boolean AND link.record_id IS NULL,'can_open_file',src IS NOT NULL OR oldfile);END;$fn$;


CREATE FUNCTION public.uc_document_registry_context_try(p_org uuid,p_group uuid,p_subject jsonb,p_context jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN RETURN public.uc_document_registry_context(p_org,p_group,p_subject,p_context,false);EXCEPTION WHEN SQLSTATE'22023'OR SQLSTATE'42501'OR SQLSTATE'PT404'OR SQLSTATE'PT409'THEN IF SQLERRM NOT LIKE'DOCUMENT_REGISTRY_%'THEN RAISE;END IF;RETURN NULL;END;$fn$;
CREATE FUNCTION public.uc_document_registry_source_choice(p_org uuid,p_document uuid,p_version uuid,p_own_write boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v public.org_document_versions;ref jsonb;src jsonb;BEGIN SELECT*INTO v FROM public.org_document_versions WHERE id=p_version AND document_id=p_document AND organization_id=p_org;IF v.id IS NULL THEN PERFORM public.uc_document_registry_error('SOURCE_UNAVAILABLE');END IF;ref:=public.uc_copy_registry_original_ref(v);src:=public.uc_document_registry_source(p_org,ref,true,p_own_write);RETURN jsonb_build_object('label',src->'label','source',ref);END;$fn$;
CREATE FUNCTION public.uc_document_registry_incoming_plan(p_org uuid,p_group uuid,p_incoming jsonb,p_data jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.incoming_documents;link public.uc_document_registry_incoming_sources;full_data jsonb;proof jsonb;BEGIN
 IF NOT public.uc_custom_journal_shape(p_data,ARRAY['direction','document_type','title','document_date','declared_document_number','source','sender','recipient','subject','context','notes'])OR p_data->>'direction'IS DISTINCT FROM'incoming'THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 IF public.uc_custom_journal_shape(p_incoming,ARRAY['kind'])AND p_incoming->>'kind'='new'THEN full_data:=p_data||jsonb_build_object('origin',jsonb_build_object('kind','org_document'));
 ELSIF public.uc_custom_journal_shape(p_incoming,ARRAY['kind','incoming_document_id','expected_binding_hash'])AND p_incoming->>'kind'='existing'AND public.uc_custom_journal_uuid(p_incoming->'incoming_document_id')AND(p_incoming->'expected_binding_hash'='null'::jsonb OR jsonb_typeof(p_incoming->'expected_binding_hash')='string'AND p_incoming->>'expected_binding_hash'~'^[a-f0-9]{64}$')THEN
  SELECT*INTO r FROM public.incoming_documents WHERE id=(p_incoming->>'incoming_document_id')::uuid AND organization_id=p_org AND deleted_at IS NULL;IF r.id IS NULL THEN PERFORM public.uc_document_registry_error('NOT_FOUND');END IF;
  SELECT*INTO link FROM public.uc_document_registry_incoming_sources WHERE incoming_document_id=r.id AND organization_id=p_org;
  IF link.binding_hash IS DISTINCT FROM p_incoming->>'expected_binding_hash'OR link.record_id IS NOT NULL THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;
  full_data:=p_data||jsonb_build_object('origin',jsonb_build_object('kind','incoming_document','incoming_document_id',r.id));
 ELSE PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 proof:=public.uc_document_registry_data(p_org,p_group,full_data,true);RETURN jsonb_build_object('data',full_data,'proof',proof);END;$fn$;
CREATE FUNCTION public.uc_document_registry_file(p_org uuid,p_source jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v public.org_document_versions;BEGIN PERFORM public.uc_document_registry_source(p_org,p_source,true,false);SELECT*INTO STRICT v FROM public.org_document_versions WHERE id=(p_source->>'version_id')::uuid AND document_id=(p_source->>'document_id')::uuid AND organization_id=p_org;
 RETURN jsonb_build_object('kind','org_document_version','bucket','org-documents','path',v.file_path,'version_id',v.id,'proof_hash',p_source->>'content_hash','file_name',coalesce(nullif(v.file_name,''),'document'),'mime',lower(btrim(coalesce(v.storage_metadata->>'mimetype','application/octet-stream'))),'size',coalesce(v.file_size,(v.storage_metadata->>'size')::bigint));END;$fn$;


CREATE FUNCTION public.read_document_registry(p_org uuid,p_scope jsonb,p_query jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
DECLARE g uuid;k text:=p_query->>'kind';base jsonb;caps jsonb;result jsonb;items jsonb:='[]';people uuid[]:='{}';lim integer;after_id uuid;last_id uuid;more boolean:=false;filters jsonb;binding text;cursor jsonb;cursor_time timestamptz;cursor_id uuid;last_time timestamptz;r public.uc_document_registry_records;h public.uc_document_registry_events;v public.org_document_versions;i public.incoming_documents;l public.document_issuance_log;o storage.objects;link public.uc_document_registry_incoming_sources;t record;obj jsonb;plan jsonb;src jsonb;counts jsonb;events jsonb:='[]';manifest jsonb;manifest_text text;record_count bigint;event_count bigint;after_rev bigint;last_rev bigint;captured timestamptz;
BEGIN
 g:=public.uc_document_registry_scope(p_org,p_scope);IF jsonb_typeof(p_query)IS DISTINCT FROM'object'OR octet_length(p_query::text)>8388608 THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 PERFORM public.uc_document_registry_fence(p_org,g,'{}',false,NULL);base:=public.uc_document_registry_base(p_org,p_scope);caps:=base->'capabilities';
 IF k IN('list','sources','parties','contexts','legacy_issuance','incoming','history')THEN IF jsonb_typeof(p_query->'limit')IS DISTINCT FROM'number'OR coalesce(p_query->>'limit','')!~'^[1-9][0-9]{0,2}$'THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;lim:=(p_query->>'limit')::integer;IF lim>100 THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;END IF;
 IF k NOT IN('incoming','incoming_file','sources','source')AND NOT(caps->>'can_read')::boolean THEN PERFORM public.uc_document_registry_error('ACCESS_DENIED');END IF;
 IF k='list'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','filters','after','limit'])OR NOT public.uc_document_registry_filters(p_query->'filters')OR NOT(p_query->'after'='null'::jsonb OR public.uc_document_registry_text(p_query->'after',2000))THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
  filters:=p_query->'filters';binding:=public.uc_document_registry_hash(jsonb_build_object('org',p_org,'scope',p_scope,'actor',auth.uid(),'filters',filters)::text);
  IF p_query->'after'<>'null'::jsonb THEN BEGIN cursor:=convert_from(decode(p_query->>'after','base64'),'UTF8')::jsonb;IF NOT public.uc_custom_journal_shape(cursor,ARRAY['binding','registered_at','id'])OR cursor->>'binding'IS DISTINCT FROM binding OR NOT public.uc_custom_journal_uuid(cursor->'id')OR jsonb_typeof(cursor->'registered_at')IS DISTINCT FROM'string'THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;cursor_time:=(cursor->>'registered_at')::timestamptz;cursor_id:=(cursor->>'id')::uuid;EXCEPTION WHEN invalid_text_representation OR invalid_parameter_value OR character_not_in_repertoire OR invalid_datetime_format OR datetime_field_overflow THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END;END IF;
  SELECT jsonb_build_object('total',count(*),'incoming',count(*)FILTER(WHERE x.data->>'direction'='incoming'),'outgoing',count(*)FILTER(WHERE x.data->>'direction'='outgoing'),'contracts',count(*)FILTER(WHERE x.data->>'document_type'='contract'),'orders',count(*)FILTER(WHERE x.data->>'document_type'IN('enrollment_order','expulsion_order')))INTO counts FROM public.uc_document_registry_records x WHERE x.organization_id=p_org AND public.uc_document_registry_matches(x,g,filters);
  FOR r IN SELECT x.*FROM public.uc_document_registry_records x WHERE x.organization_id=p_org AND public.uc_document_registry_matches(x,g,filters)AND(cursor_id IS NULL OR(x.registered_at,x.id)<(cursor_time,cursor_id))ORDER BY x.registered_at DESC,x.id DESC LIMIT lim+1 LOOP
   IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(public.uc_document_registry_record_json(r,caps));people:=people||r.participant_ids;last_id:=r.id;last_time:=r.registered_at;END LOOP;
  result:=jsonb_build_object('records',items,'next_cursor',CASE WHEN more THEN encode(convert_to(jsonb_build_object('binding',binding,'registered_at',last_time,'id',last_id)::text,'UTF8'),'base64')ELSE NULL END,'counts',counts);
 ELSIF k IN('detail','history','file')THEN
  IF NOT (CASE k WHEN'detail'THEN public.uc_custom_journal_shape(p_query,ARRAY['kind','record_id'])WHEN'history'THEN public.uc_custom_journal_shape(p_query,ARRAY['kind','record_id','after_revision','limit'])ELSE public.uc_custom_journal_shape(p_query,ARRAY['kind','record_id','record_revision'])END) OR NOT public.uc_custom_journal_uuid(p_query->'record_id')THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
  SELECT*INTO r FROM public.uc_document_registry_records WHERE id=(p_query->>'record_id')::uuid AND organization_id=p_org AND NOT redacted AND(g IS NULL OR g=ANY(scope_group_ids));IF r.id IS NULL THEN PERFORM public.uc_document_registry_error('NOT_FOUND');END IF;people:=people||r.participant_ids;
  IF k='detail'THEN result:=jsonb_build_object('record',public.uc_document_registry_record_json(r,caps));
  ELSIF k='file'THEN
   IF jsonb_typeof(p_query->'record_revision')IS DISTINCT FROM'number'OR coalesce(p_query->>'record_revision','')!~'^[1-9][0-9]{0,15}$'THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
   IF(p_query->>'record_revision')::numeric<>r.revision THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;result:=jsonb_build_object('file',public.uc_document_registry_file(p_org,r.data->'source'));
  ELSE
   IF jsonb_typeof(p_query->'after_revision')IS DISTINCT FROM'number'OR coalesce(p_query->>'after_revision','')!~'^(0|[1-9][0-9]{0,15})$'THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;after_rev:=(p_query->>'after_revision')::bigint;IF after_rev>9007199254740991 THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
   FOR h IN SELECT*FROM public.uc_document_registry_events WHERE organization_id=p_org AND record_id=r.id AND NOT redacted AND revision>after_rev ORDER BY revision LIMIT lim+1 LOOP IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(public.uc_document_registry_event_json(h));people:=people||h.participant_ids;last_rev:=h.revision;END LOOP;result:=jsonb_build_object('history',items,'next_after_revision',CASE WHEN more THEN last_rev ELSE NULL END);
  END IF;
 ELSIF k IN('sources','source')THEN
  IF k='source'THEN IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','document_id','version_id'])OR NOT public.uc_custom_journal_uuid(p_query->'document_id')OR NOT public.uc_custom_journal_uuid(p_query->'version_id')THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;obj:=public.uc_document_registry_source_choice(p_org,(p_query->>'document_id')::uuid,(p_query->>'version_id')::uuid,(caps->>'can_capture_source')::boolean);result:=jsonb_build_object('source',obj);people:=people||ARRAY(SELECT uploaded_by FROM public.org_document_versions WHERE id=(p_query->>'version_id')::uuid AND organization_id=p_org);
  ELSE
   IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','text','after_id','limit'])OR NOT public.uc_document_registry_text(p_query->'text',200,true)OR NOT(p_query->'after_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'after_id'))THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;after_id:=(p_query->>'after_id')::uuid;
   IF(caps->>'can_open_file')::boolean THEN FOR v IN SELECT x.*FROM public.org_document_versions x JOIN public.org_documents d ON d.id=x.document_id AND d.organization_id=x.organization_id WHERE x.organization_id=p_org AND d.deleted_at IS NULL AND coalesce(to_jsonb(d)->>'status','active')NOT IN('archived','expired')AND(after_id IS NULL OR x.id>after_id)AND public.uc_copy_registry_object_matches(x)AND(x.uploaded_by IS NULL OR public.uc_custom_journal_person(x.uploaded_by))AND(coalesce(p_query->>'text','')=''OR strpos(lower(d.name||' '||coalesce(x.file_name,'')),lower(p_query->>'text'))>0)ORDER BY x.id LIMIT lim+1 LOOP
    IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;obj:=public.uc_document_registry_source_choice(p_org,v.document_id,v.id,false);items:=items||jsonb_build_array(obj);people:=array_append(people,v.uploaded_by);last_id:=v.id;END LOOP;END IF;result:=jsonb_build_object('sources',items,'next_after_id',CASE WHEN more THEN last_id ELSE NULL END);
  END IF;

 ELSIF k='parties'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','party_kind','text','after_id','limit'])OR NOT coalesce(p_query->>'party_kind'IN('student','company'),false)OR NOT public.uc_document_registry_text(p_query->'text',200,true)OR NOT(p_query->'after_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'after_id'))THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;after_id:=(p_query->>'after_id')::uuid;
  IF p_query->>'party_kind'='student'THEN
   FOR t IN SELECT DISTINCT e.user_id id,public.uc_copy_registry_label(e.user_id)label FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=p_org AND public.uc_document_registry_student(p_org,g,e.user_id)AND(after_id IS NULL OR e.user_id>after_id)AND(coalesce(p_query->>'text','')=''OR strpos(lower(public.uc_copy_registry_label(e.user_id)),lower(p_query->>'text'))>0)ORDER BY id LIMIT lim+1 LOOP
    IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(jsonb_build_object('label',t.label,'party',jsonb_build_object('kind','student','user_id',t.id)));people:=array_append(people,t.id);last_id:=t.id;END LOOP;
  ELSE FOR t IN SELECT x.id,left(x.name,500)label FROM public.companies x WHERE x.organization_id=p_org AND public.uc_document_registry_company(p_org,g,x.id)AND(after_id IS NULL OR x.id>after_id)AND(coalesce(p_query->>'text','')=''OR strpos(lower(x.name),lower(p_query->>'text'))>0)ORDER BY x.id LIMIT lim+1 LOOP IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(jsonb_build_object('label',t.label,'party',jsonb_build_object('kind','company','company_id',t.id)));last_id:=t.id;END LOOP;END IF;
  result:=jsonb_build_object('parties',items,'next_after_id',CASE WHEN more THEN last_id ELSE NULL END);
 ELSIF k='contexts'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','subject','context_kind','enrollment_id','text','after_id','limit'])OR NOT coalesce(p_query->>'context_kind'IN('enrollment','contract','enrollment_contract'),false)OR NOT public.uc_document_registry_text(p_query->'text',200,true)OR NOT(p_query->'after_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'after_id'))OR NOT(p_query->'enrollment_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'enrollment_id'))OR NOT(public.uc_custom_journal_shape(p_query->'subject',ARRAY['kind'])AND p_query->'subject'->>'kind'='none'OR public.uc_custom_journal_shape(p_query->'subject',ARRAY['kind','user_id'])AND p_query->'subject'->>'kind'='student'AND public.uc_custom_journal_uuid(p_query->'subject'->'user_id'))THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
  IF(p_query->>'context_kind'='enrollment_contract')<>(p_query->'enrollment_id'<>'null'::jsonb)THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;after_id:=(p_query->>'after_id')::uuid;
  FOR t IN
   WITH refs AS(
    SELECT x.id,jsonb_build_object('kind','enrollment','enrollment_id',x.id,'binding_hash',repeat('0',64))ref FROM public.enrollments x JOIN public.courses c ON c.id=x.course_id WHERE p_query->>'context_kind'='enrollment'AND c.organization_id=p_org AND(after_id IS NULL OR x.id>after_id)
    UNION ALL
    SELECT x.id,CASE WHEN p_query->>'context_kind'='contract'THEN jsonb_build_object('kind','contract','contract_id',x.id,'binding_hash',repeat('0',64))ELSE jsonb_build_object('kind','enrollment_contract','enrollment_id',p_query->'enrollment_id','contract_id',x.id,'binding_hash',repeat('0',64))END FROM public.org_contracts x WHERE p_query->>'context_kind'IN('contract','enrollment_contract')AND x.organization_id=p_org AND(after_id IS NULL OR x.id>after_id)
   ),choices AS(SELECT id,public.uc_document_registry_context_try(p_org,g,p_query->'subject',ref)choice FROM refs)
   SELECT*FROM choices WHERE choice IS NOT NULL AND(coalesce(p_query->>'text','')=''OR strpos(lower(choice->>'label'),lower(p_query->>'text'))>0)ORDER BY id LIMIT lim+1 LOOP
    IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;obj:=t.choice;items:=items||jsonb_build_array(jsonb_build_object('label',obj->'label','context',obj->'context','student_id',obj->'binding'->'user_id','group_id',coalesce(obj->'binding'->'contract_group_id',to_jsonb(g)),'company_id',obj->'binding'->'contract_company_id','current_status',coalesce(obj->'binding'->>'enrollment_status',obj->'binding'->>'contract_status','')));people:=people||ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(obj->'participants')x);last_id:=t.id;END LOOP;
  result:=jsonb_build_object('contexts',items,'next_after_id',CASE WHEN more THEN last_id ELSE NULL END);
 ELSIF k='legacy_issuance'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','after_id','limit'])OR NOT(p_query->'after_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'after_id'))THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;IF NOT(caps->>'can_read_legacy')::boolean THEN PERFORM public.uc_document_registry_error('ACCESS_DENIED');END IF;after_id:=(p_query->>'after_id')::uuid;
  FOR l IN SELECT x.*FROM public.document_issuance_log x WHERE x.organization_id=p_org AND x.deleted_at IS NULL AND(after_id IS NULL OR x.id>after_id)AND public.uc_document_registry_legacy_visible(p_org,x.enrollment_id)AND(g IS NULL OR EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id JOIN public.student_groups gr ON gr.id=g WHERE e.id=x.enrollment_id AND c.organization_id=p_org AND(gr.course_id IS NULL OR gr.course_id=e.course_id)AND public.uc_document_registry_student(p_org,g,e.user_id)))ORDER BY x.id LIMIT lim+1 LOOP
   IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;obj:=public.uc_document_registry_legacy(p_org,g,l.id);obj:=obj||jsonb_build_object('id',l.id,'linked_record_id',(SELECT x.id FROM public.uc_document_registry_records x WHERE x.organization_id=p_org AND NOT x.redacted AND x.data->'origin'->>'kind'='legacy_issuance_log'AND x.data->'origin'->>'legacy_id'=l.id::text AND(g IS NULL OR g=ANY(x.scope_group_ids))ORDER BY x.registered_at LIMIT 1));items:=items||jsonb_build_array(obj);IF obj->'student'<>'null'::jsonb THEN people:=array_append(people,(obj->'student'->>'user_id')::uuid);END IF;last_id:=l.id;END LOOP;
  result:=jsonb_build_object('legacy_records',items,'next_after_id',CASE WHEN more THEN last_id ELSE NULL END);
 ELSIF k='incoming'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','after_id','limit'])OR NOT(p_query->'after_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'after_id'))THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
  IF NOT(caps->>'can_read_incoming')::boolean AND NOT(caps->>'can_capture_incoming')::boolean THEN PERFORM public.uc_document_registry_error('ACCESS_DENIED');END IF;after_id:=(p_query->>'after_id')::uuid;
  IF(caps->>'can_read_incoming')::boolean THEN FOR i IN SELECT x.*FROM public.incoming_documents x WHERE x.organization_id=p_org AND x.deleted_at IS NULL AND(after_id IS NULL OR x.id>after_id)AND(g IS NULL OR EXISTS(SELECT 1 FROM public.uc_document_registry_incoming_sources a JOIN public.uc_document_registry_records rr ON rr.id=a.record_id AND rr.organization_id=a.organization_id WHERE a.incoming_document_id=x.id AND a.organization_id=p_org AND NOT rr.redacted AND g=ANY(rr.scope_group_ids)))ORDER BY x.id LIMIT lim+1 LOOP
   IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(public.uc_document_registry_incoming_json(i,g,caps));SELECT*INTO link FROM public.uc_document_registry_incoming_sources WHERE incoming_document_id=i.id AND organization_id=p_org;people:=people||coalesce(link.participant_ids,'{}');last_id:=i.id;END LOOP;END IF;
  result:=jsonb_build_object('incoming',items,'next_after_id',CASE WHEN more THEN last_id ELSE NULL END);

 ELSIF k IN('validate','validate_incoming')THEN
  IF NOT(caps->>'can_register')::boolean THEN PERFORM public.uc_document_registry_error('ACCESS_DENIED');END IF;
  IF k='validate'THEN IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','data'])THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;obj:=public.uc_document_registry_data(p_org,g,p_query->'data',true);
  ELSE IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','incoming','data'])THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;plan:=public.uc_document_registry_incoming_plan(p_org,g,p_query->'incoming',p_query->'data');obj:=plan->'proof';END IF;
  people:=people||ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(obj->'participants')x);result:=jsonb_build_object('validation',jsonb_build_object('valid',true,'data',p_query->'data','context_binding',obj->'context_binding','source_label',obj->'source_label','sender_label',obj->'sender_label','recipient_label',obj->'recipient_label','subject_label',obj->'subject_label','context_label',obj->'context_label'));
 ELSIF k='incoming_file'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','incoming_document_id','expected_binding_hash'])OR NOT public.uc_custom_journal_uuid(p_query->'incoming_document_id')OR NOT(p_query->'expected_binding_hash'='null'::jsonb OR jsonb_typeof(p_query->'expected_binding_hash')='string'AND p_query->>'expected_binding_hash'~'^[a-f0-9]{64}$')THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
  IF NOT(caps->>'can_read_incoming')::boolean THEN PERFORM public.uc_document_registry_error('ACCESS_DENIED');END IF;
  SELECT*INTO i FROM public.incoming_documents WHERE id=(p_query->>'incoming_document_id')::uuid AND organization_id=p_org AND deleted_at IS NULL;IF i.id IS NULL THEN PERFORM public.uc_document_registry_error('NOT_FOUND');END IF;
  SELECT*INTO link FROM public.uc_document_registry_incoming_sources WHERE incoming_document_id=i.id AND organization_id=p_org;
  IF g IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.uc_document_registry_records rr WHERE rr.id=link.record_id AND rr.organization_id=p_org AND NOT rr.redacted AND g=ANY(rr.scope_group_ids))THEN PERFORM public.uc_document_registry_error('NOT_FOUND');END IF;
  IF link.binding_hash IS DISTINCT FROM p_query->>'expected_binding_hash'THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END IF;
  IF link.incoming_document_id IS NOT NULL THEN people:=people||link.participant_ids;result:=jsonb_build_object('file',public.uc_document_registry_file(p_org,link.source));
  ELSE
   IF g IS NOT NULL OR NOT public.uc_document_org_access(p_org,false)OR public.uc_document_teacher_limited(p_org)THEN PERFORM public.uc_document_registry_error('ACCESS_DENIED');END IF;
   SELECT x.*INTO o FROM storage.objects x JOIN storage.buckets b ON b.id=x.bucket_id WHERE b.id='incoming-documents'AND NOT b.public AND x.name=i.file_path AND x.name LIKE p_org::text||'/%';
   IF o.id IS NULL OR coalesce(o.metadata->>'size','')!~'^[0-9]{1,15}$'THEN PERFORM public.uc_document_registry_error('SOURCE_UNAVAILABLE');END IF;
   result:=jsonb_build_object('file',jsonb_build_object('kind','legacy_incoming_object','bucket','incoming-documents','path',o.name,'incoming_document_id',i.id,'proof_hash',public.uc_document_registry_hash(jsonb_build_object('id',o.id,'bucket',o.bucket_id,'path',o.name,'metadata',o.metadata)::text),'file_name',regexp_replace(o.name,'^.*/',''),'mime',coalesce(nullif(lower(btrim(o.metadata->>'mimetype')),''),'application/octet-stream'),'size',(o.metadata->>'size')::bigint));
  END IF;
 ELSIF k='export'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','filters'])OR NOT public.uc_document_registry_filters(p_query->'filters')THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;filters:=p_query->'filters';
  SELECT count(*)INTO record_count FROM public.uc_document_registry_records x WHERE x.organization_id=p_org AND public.uc_document_registry_matches(x,g,filters);
  SELECT count(*)INTO event_count FROM public.uc_document_registry_events eh JOIN public.uc_document_registry_records rr ON rr.id=eh.record_id AND rr.organization_id=eh.organization_id WHERE rr.organization_id=p_org AND public.uc_document_registry_matches(rr,g,filters)AND NOT eh.redacted;
  IF record_count>1000 OR event_count>10000 OR coalesce((SELECT sum(octet_length(x.data::text))FROM public.uc_document_registry_records x WHERE x.organization_id=p_org AND public.uc_document_registry_matches(x,g,filters)),0)+coalesce((SELECT sum(octet_length(eh.snapshot::text))FROM public.uc_document_registry_events eh JOIN public.uc_document_registry_records rr ON rr.id=eh.record_id AND rr.organization_id=eh.organization_id WHERE rr.organization_id=p_org AND public.uc_document_registry_matches(rr,g,filters)AND NOT eh.redacted),0)>8388608 THEN PERFORM public.uc_document_registry_error('LIMIT_EXCEEDED');END IF;
  SELECT coalesce(jsonb_agg(public.uc_document_registry_record_json(x,caps)ORDER BY x.registered_at,x.id),'[]')INTO items FROM public.uc_document_registry_records x WHERE x.organization_id=p_org AND public.uc_document_registry_matches(x,g,filters);
  SELECT coalesce(jsonb_agg(public.uc_document_registry_event_json(eh)ORDER BY eh.record_id,eh.revision),'[]')INTO events FROM public.uc_document_registry_events eh JOIN public.uc_document_registry_records rr ON rr.id=eh.record_id AND rr.organization_id=eh.organization_id WHERE rr.organization_id=p_org AND public.uc_document_registry_matches(rr,g,filters)AND NOT eh.redacted;
  SELECT coalesce(array_agg(DISTINCT who),'{}')INTO people FROM(SELECT unnest(x.participant_ids)who FROM public.uc_document_registry_records x WHERE x.organization_id=p_org AND public.uc_document_registry_matches(x,g,filters)UNION SELECT unnest(eh.participant_ids)FROM public.uc_document_registry_events eh JOIN public.uc_document_registry_records rr ON rr.id=eh.record_id AND rr.organization_id=eh.organization_id WHERE rr.organization_id=p_org AND public.uc_document_registry_matches(rr,g,filters)AND NOT eh.redacted)all_people;
  captured:=clock_timestamp();manifest:=jsonb_build_object('schema_version',1,'kind','document_registry_export','organization_id',p_org,'scope',p_scope,'registry_revision',base->'registry_revision','captured_at',captured,'captured_by',auth.uid(),'filters',filters,'record_count',record_count,'event_count',event_count,'records',items,'events',events);manifest_text:=manifest::text;
  IF octet_length(manifest_text)>8388608 THEN PERFORM public.uc_document_registry_error('LIMIT_EXCEEDED');END IF;result:=jsonb_build_object('export',jsonb_build_object('snapshot',manifest,'manifest_json',manifest_text,'manifest_sha256',public.uc_document_registry_hash(manifest_text),'manifest_bytes',octet_length(manifest_text)));
 ELSE PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 SELECT coalesce(array_agg(DISTINCT who ORDER BY who),'{}')INTO people FROM unnest(people)who WHERE who IS NOT NULL;PERFORM public.uc_document_registry_fence(p_org,g,people,false,NULL);
 RETURN base||jsonb_build_object('kind',k)||result;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_document_registry_error('REVISION_CONFLICT');END;$fn$;


CREATE FUNCTION public.uc_document_registry_source_lock(p_org uuid,p_ref jsonb,p_own boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v public.org_document_versions;proof jsonb;BEGIN
 proof:=public.uc_document_registry_source(p_org,p_ref,true,p_own);SELECT*INTO STRICT v FROM public.org_document_versions WHERE id=(p_ref->>'version_id')::uuid AND document_id=(p_ref->>'document_id')::uuid AND organization_id=p_org FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_documents WHERE id=v.document_id AND organization_id=p_org FOR SHARE NOWAIT;
 PERFORM 1 FROM storage.objects WHERE id=v.storage_object_id FOR SHARE NOWAIT;PERFORM 1 FROM storage.buckets WHERE id='org-documents'FOR SHARE NOWAIT;
 RETURN public.uc_document_registry_source(p_org,p_ref,true,p_own);END;$fn$;
CREATE FUNCTION public.uc_document_registry_write_proof(p_org uuid,p_group uuid,p_data jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE proof jsonb;after_proof jsonb;people uuid[];group_ids uuid[];BEGIN
 proof:=public.uc_document_registry_data(p_org,p_group,p_data,true);SELECT coalesce(array_agg(x::uuid),'{}')INTO people FROM jsonb_array_elements_text(proof->'participants')x;PERFORM public.uc_document_registry_fence(p_org,p_group,people,true,NULL);
 PERFORM public.uc_document_registry_source_lock(p_org,p_data->'source',false);
 IF proof->'context_binding'->>'enrollment_id'IS NOT NULL THEN PERFORM 1 FROM public.enrollments WHERE id=(proof->'context_binding'->>'enrollment_id')::uuid FOR SHARE NOWAIT;END IF;
 IF proof->'context_binding'->>'course_id'IS NOT NULL THEN PERFORM 1 FROM public.courses WHERE id=(proof->'context_binding'->>'course_id')::uuid FOR SHARE NOWAIT;END IF;
 IF proof->'context_binding'->>'contract_id'IS NOT NULL THEN PERFORM 1 FROM public.org_contracts WHERE id=(proof->'context_binding'->>'contract_id')::uuid FOR SHARE NOWAIT;END IF;
 SELECT coalesce(array_agg(x::uuid),'{}')INTO group_ids FROM jsonb_array_elements_text(proof->'groups')x;PERFORM 1 FROM public.student_groups WHERE organization_id=p_org AND id=ANY(group_ids)ORDER BY id FOR SHARE NOWAIT;
 after_proof:=public.uc_document_registry_data(p_org,p_group,p_data,true);IF after_proof IS DISTINCT FROM proof THEN PERFORM public.uc_document_registry_error('CONTEXT_CHANGED');END IF;RETURN after_proof;END;$fn$;
CREATE FUNCTION public.uc_document_registry_capture_data(p_org uuid,p_data jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE proof jsonb;BEGIN
 IF NOT public.uc_custom_journal_shape(p_data,ARRAY['doc_type','title','counterparty_name','counterparty_inn','doc_number','doc_date','notes','source'])OR NOT coalesce(p_data->>'doc_type'IN('contract','act','invoice','other'),false)OR NOT public.uc_document_registry_text(p_data->'title',500)
 OR NOT(p_data->'counterparty_name'='null'::jsonb OR public.uc_document_registry_text(p_data->'counterparty_name',300))OR NOT(p_data->'counterparty_inn'='null'::jsonb OR jsonb_typeof(p_data->'counterparty_inn')='string'AND p_data->>'counterparty_inn'~'^(\d{10}|\d{12})$')
 OR NOT(p_data->'doc_number'='null'::jsonb OR public.uc_document_registry_text(p_data->'doc_number',120,true))OR NOT(p_data->'doc_date'='null'::jsonb OR public.uc_copy_registry_date(p_data->'doc_date'))OR NOT public.uc_document_registry_text(p_data->'notes',4000,true)THEN PERFORM public.uc_document_registry_error('INVALID_INPUT');END IF;
 proof:=public.uc_document_registry_source(p_org,p_data->'source',true,true);RETURN proof;END;$fn$;


CREATE FUNCTION public.uc_document_registry_replay(p_org uuid,p_scope jsonb,p_req public.uc_document_registry_requests,p_caps jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g uuid:=CASE WHEN p_scope->>'kind'='group'THEN(p_scope->>'group_id')::uuid ELSE NULL END;result jsonb:=p_req.result;item jsonb;src jsonb;ctx jsonb;proof jsonb;r public.uc_document_registry_records;i public.incoming_documents;link public.uc_document_registry_incoming_sources;current_context boolean:=false;same_current boolean:=false;BEGIN
 IF result->>'kind'='capture_incoming'THEN
  item:=result->'incoming';SELECT*INTO i FROM public.incoming_documents WHERE id=(item->>'id')::uuid AND organization_id=p_org AND deleted_at IS NULL;IF i.id IS NULL OR NOT(p_caps->>'can_capture_incoming')::boolean THEN PERFORM public.uc_document_registry_error('NOT_FOUND');END IF;
  PERFORM public.uc_document_registry_source_lock(p_org,item->'linked_source',true);src:=public.uc_document_registry_source(p_org,item->'linked_source',false,false);SELECT*INTO link FROM public.uc_document_registry_incoming_sources WHERE incoming_document_id=i.id AND organization_id=p_org;
  item:=item||jsonb_build_object('source_label',src->'label','source_available',src IS NOT NULL,'can_open_file',src IS NOT NULL,'can_register',(p_caps->>'can_register_incoming')::boolean AND link.record_id IS NULL);
  RETURN result||public.uc_document_registry_base(p_org,p_scope)||jsonb_build_object('replayed',true,'incoming',item);
 END IF;
 item:=result->'record';SELECT*INTO r FROM public.uc_document_registry_records WHERE id=(item->>'id')::uuid AND organization_id=p_org AND NOT redacted AND(g IS NULL OR g=ANY(scope_group_ids));IF r.id IS NULL THEN PERFORM public.uc_document_registry_error('NOT_FOUND');END IF;
 IF result->>'kind'<>'archive'THEN proof:=public.uc_document_registry_write_proof(p_org,r.group_id,item->'data');END IF;
 src:=public.uc_document_registry_source(p_org,item->'data'->'source',false,false);
 BEGIN ctx:=public.uc_document_registry_context(p_org,r.group_id,item->'data'->'subject',item->'data'->'context',true);current_context:=ctx->'binding'=item->'context_binding';EXCEPTION WHEN SQLSTATE'22023'OR SQLSTATE'42501'OR SQLSTATE'PT409'OR SQLSTATE'PT404'THEN IF SQLERRM NOT LIKE'DOCUMENT_REGISTRY_%'THEN RAISE;END IF;current_context:=false;END;
 same_current:=r.revision=(item->>'revision')::bigint AND r.data=item->'data'AND r.status=item->>'status';
 item:=item||jsonb_build_object('source_label',src->'label','source_available',src IS NOT NULL,'context_label',CASE WHEN current_context THEN ctx->>'label'ELSE'Связь изменена; прежние идентификаторы сохранены'END,'context_current',current_context,'can_open_file',(p_caps->>'can_open_file')::boolean AND src IS NOT NULL,'can_correct',(p_caps->>'can_correct')::boolean AND same_current AND current_context AND src IS NOT NULL AND r.status='registered','can_archive',(p_caps->>'can_archive')::boolean AND same_current AND r.status='registered');
 RETURN result||public.uc_document_registry_base(p_org,p_scope)||jsonb_build_object('replayed',true,'record',item);END;$fn$;


CREATE FUNCTION public.apply_document_registry_action(p_org uuid,p_scope jsonb,p_expected_revision bigint,p_request_id uuid,p_action jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC'AS $fn$
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


-- Privacy integration covers structured registry copies, not independent retained originals or guessed names.
CREATE FUNCTION public.uc_document_registry_privacy_targets(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 WITH records AS MATERIALIZED(
  SELECT r.id,r.organization_id FROM public.uc_document_registry_records r WHERE NOT r.redacted AND(
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
CREATE FUNCTION public.uc_document_registry_personal_counts(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 WITH target AS MATERIALIZED(SELECT public.uc_document_registry_privacy_targets(p_user)j),counts AS(
 SELECT'uc_document_registry_records'::text t,count(*)n FROM public.uc_document_registry_records r CROSS JOIN target WHERE r.id IN(SELECT x::uuid FROM jsonb_array_elements_text(j->'records')x)OR p_user=ANY(r.participant_ids)OR r.registered_by=p_user OR r.updated_by=p_user OR r.legacy_claim->>'stored_user_id'=p_user::text
 UNION ALL SELECT'uc_document_registry_events',count(*)FROM public.uc_document_registry_events e CROSS JOIN target WHERE e.record_id IN(SELECT x::uuid FROM jsonb_array_elements_text(j->'records')x)AND NOT e.redacted OR p_user=ANY(e.participant_ids)OR e.recorded_by=p_user
 UNION ALL SELECT'uc_document_registry_incoming_sources',count(*)FROM public.uc_document_registry_incoming_sources s WHERE p_user=ANY(s.participant_ids)OR s.linked_by=p_user OR s.updated_by=p_user
 UNION ALL SELECT'uc_document_registry_requests',count(*)FROM public.uc_document_registry_requests q CROSS JOIN target WHERE p_user=ANY(q.participant_ids)OR EXISTS(SELECT 1 FROM jsonb_array_elements(j->'requests')x WHERE q.actor_id::text=x.value->>'actor_id'AND q.request_id::text=x.value->>'request_id')
 )SELECT coalesce(jsonb_agg(jsonb_build_object('table',t,'column','structured_subject_closure_or_actor_attribution','count',n)ORDER BY t),'[]'::jsonb)FROM counts WHERE n>0 $fn$;
CREATE FUNCTION public.uc_document_registry_erase_user(p_user uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE target jsonb;BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR current_setting('sintagma.account_deletion_erase_user',true)IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)THEN PERFORM public.uc_document_registry_error('ACCESS_DENIED');END IF;
 target:=public.uc_document_registry_privacy_targets(p_user);
 DELETE FROM public.uc_document_registry_requests q WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(target->'requests')x WHERE q.actor_id::text=x.value->>'actor_id'AND q.request_id::text=x.value->>'request_id');
 UPDATE public.uc_document_registry_events SET snapshot='{}',reason='',recorded_by=NULL,participant_ids='{}',redacted=true WHERE record_id IN(SELECT x::uuid FROM jsonb_array_elements_text(target->'records')x);
 UPDATE public.uc_document_registry_records SET data='{}',context_binding='{}',legacy_claim=NULL,registered_by=NULL,updated_by=NULL,participant_ids='{}',redacted=true,status='archived'WHERE id IN(SELECT x::uuid FROM jsonb_array_elements_text(target->'records')x);
 -- Source associations retain archive identity and a tombstone: no record can be silently registered again.
 UPDATE public.uc_document_registry_records SET registered_by=CASE WHEN registered_by=p_user THEN NULL ELSE registered_by END,updated_by=CASE WHEN updated_by=p_user THEN NULL ELSE updated_by END,participant_ids=array_remove(participant_ids,p_user),legacy_claim=CASE WHEN legacy_claim->>'stored_user_id'=p_user::text THEN jsonb_set(legacy_claim,'{stored_user_id}','null')ELSE legacy_claim END WHERE registered_by=p_user OR updated_by=p_user OR p_user=ANY(participant_ids)OR legacy_claim->>'stored_user_id'=p_user::text;
 UPDATE public.uc_document_registry_events SET recorded_by=CASE WHEN recorded_by=p_user THEN NULL ELSE recorded_by END,participant_ids=array_remove(participant_ids,p_user)WHERE recorded_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_document_registry_incoming_sources SET linked_by=CASE WHEN linked_by=p_user THEN NULL ELSE linked_by END,updated_by=CASE WHEN updated_by=p_user THEN NULL ELSE updated_by END,participant_ids=array_remove(participant_ids,p_user)WHERE linked_by=p_user OR updated_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_document_registry_requests SET participant_ids=array_remove(participant_ids,p_user)WHERE p_user=ANY(participant_ids);
 IF public.uc_document_registry_personal_counts(p_user)<>'[]'::jsonb THEN PERFORM public.uc_document_registry_error('DEPENDENCY_UNAVAILABLE');END IF;END;$fn$;


DO $document_registry_privacy_bridge$
DECLARE p pg_proc;oldbody text;newbody text;definition text;before_meta jsonb;after_meta jsonb;pin record;
BEGIN
 FOR pin IN SELECT*FROM(VALUES('public.uc_scoped_journal_personal_counts(uuid)','990d91cfef61c08fa87a10c90ce2f3d7','63476fea68407b8f0a09a0ace1e2030a'),('public.uc_scoped_journal_erase_user(uuid)','20e51ce5c3233d472ca94884ad3ad4c7','eeab1ccbbf78c67ad8035420aa9e2ff7'))x(signature,old_md5,new_md5)LOOP
  SELECT*INTO p FROM pg_proc WHERE oid=to_regprocedure(pin.signature);IF p.oid IS NULL OR md5(p.prosrc)<>pin.old_md5 OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')OR NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']THEN RAISE EXCEPTION'DOCUMENT_REGISTRY_UNREVIEWED_PRIVACY_PREDECESSOR %',pin.signature;END IF;before_meta:=to_jsonb(p);oldbody:=p.prosrc;
  IF pin.signature='public.uc_scoped_journal_personal_counts(uuid)'THEN newbody:=E'\n SELECT('||oldbody||E')||public.uc_document_registry_personal_counts(p_user)\n';
  ELSE IF(length(oldbody)-length(replace(oldbody,' -- Every copied personal export','')))<>length(' -- Every copied personal export')THEN RAISE EXCEPTION'DOCUMENT_REGISTRY_PRIVACY_BRIDGE_ANCHOR';END IF;newbody:=replace(oldbody,' -- Every copied personal export',E' PERFORM public.uc_document_registry_erase_user(p_user);\n -- Every copied personal export');END IF;
  IF md5(newbody)<>pin.new_md5 THEN RAISE EXCEPTION'DOCUMENT_REGISTRY_PRIVACY_NEW_BODY_MISMATCH';END IF;definition:=pg_get_functiondef(p.oid);IF(length(definition)-length(replace(definition,oldbody,'')))<>length(oldbody)THEN RAISE EXCEPTION'DOCUMENT_REGISTRY_PRIVACY_AMBIGUOUS_BODY';END IF;EXECUTE replace(definition,oldbody,newbody);
  SELECT to_jsonb(q)INTO after_meta FROM pg_proc q WHERE q.oid=p.oid;IF(before_meta-'prosrc')IS DISTINCT FROM(after_meta-'prosrc')OR md5(after_meta->>'prosrc')<>pin.new_md5 THEN RAISE EXCEPTION'DOCUMENT_REGISTRY_PRIVACY_METADATA_CHANGED';END IF;
 END LOOP;END;$document_registry_privacy_bridge$;
-- Remove only the historical actor-ID escape and actor-versus-pupil comparison. Actual enrollment is authoritative.
DO $document_registry_legacy_policy_guard$
DECLARE p pg_policy;old_meta jsonb;new_meta jsonb;BEGIN
 SELECT q.*INTO p FROM pg_policy q WHERE q.polrelid='public.document_issuance_log'::regclass AND q.polname='uc_document_assigned_read';
 IF p.oid IS NULL OR p.polcmd<>'r'OR p.polpermissive OR p.polroles IS DISTINCT FROM ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]OR md5(pg_get_expr(p.polqual,p.polrelid))<>'5fdd3fc60911993f9f665aa7e6ed2bc4'OR p.polwithcheck IS NOT NULL THEN RAISE EXCEPTION'DOCUMENT_REGISTRY_UNREVIEWED_LEGACY_POLICY';END IF;
 old_meta:=to_jsonb(p);ALTER POLICY uc_document_assigned_read ON public.document_issuance_log USING(public.uc_document_owns_enrollment(enrollment_id,organization_id)OR(public.uc_document_org_access(organization_id,false)AND public.uc_document_record_scope(organization_id,NULL,enrollment_id,NULL,NULL)));
 SELECT to_jsonb(q)INTO new_meta FROM pg_policy q WHERE q.oid=p.oid;IF(old_meta-'polqual')IS DISTINCT FROM(new_meta-'polqual')THEN RAISE EXCEPTION'DOCUMENT_REGISTRY_LEGACY_POLICY_METADATA_CHANGED';END IF;
END;$document_registry_legacy_policy_guard$;
DO $document_registry_private_acl$
DECLARE r record;a record;BEGIN
 FOR r IN SELECT c.oid,c.relname,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND left(c.relname,21)='uc_document_registry_'AND c.relkind IN('r','p')LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.relname);
  FOR a IN SELECT DISTINCT grantee FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid=r.oid),acldefault('r',r.relowner)))WHERE grantee<>r.relowner LOOP EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %s CASCADE',r.relname,CASE WHEN a.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(a.grantee))END);END LOOP;
 END LOOP;
 FOR r IN SELECT p.oid,p.oid::regprocedure::text signature,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(left(p.proname,21)='uc_document_registry_'OR p.proname IN('read_document_registry','apply_document_registry_action'))LOOP
  FOR a IN SELECT DISTINCT grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=r.oid),acldefault('f',r.proowner)))WHERE grantee<>r.proowner LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s CASCADE',r.signature,CASE WHEN a.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(a.grantee))END);END LOOP;
 END LOOP;END;$document_registry_private_acl$;
GRANT EXECUTE ON FUNCTION public.read_document_registry(uuid,jsonb,jsonb),public.apply_document_registry_action(uuid,jsonb,bigint,uuid,jsonb) TO authenticated;
