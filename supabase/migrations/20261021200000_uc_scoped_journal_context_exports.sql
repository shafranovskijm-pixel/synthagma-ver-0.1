-- UC015 follow-up. Additive scoped records; existing person-only records stay intact.
-- No official issue, registry number allocation, legal signature or attendance inference.
DO $precondition$
DECLARE v_pin record; v_proc pg_proc;
BEGIN
 FOR v_pin IN SELECT * FROM (VALUES
  ('public.read_custom_journals(uuid,jsonb)','8248952395b32a29d9fb336ba39541ee'),
  ('public.apply_custom_journal_action(uuid,bigint,uuid,jsonb)','c0340558fd14a5bb96ef0f413d46ff6c'),
  ('public.uc_custom_journal_personal_counts(uuid)','f0ac6ef8aeae4a9393c85ac0bc36d69e'),
  ('public.uc_custom_journal_erase_user(uuid)','c9b33cea7efed79bc6948568234187da')
 ) AS pins(signature,body_md5) LOOP
  SELECT p.* INTO v_proc FROM pg_proc p WHERE p.oid=to_regprocedure(v_pin.signature);
  IF v_proc.oid IS NULL OR md5(v_proc.prosrc)<>v_pin.body_md5 OR NOT v_proc.prosecdef
   OR v_proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']
   OR v_proc.proowner<>(SELECT proowner FROM pg_proc WHERE oid='public.uc_custom_journal_personal_counts(uuid)'::regprocedure)
  THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_UNREVIEWED_PREDECESSOR %',v_pin.signature;END IF;
 END LOOP;
 IF to_regclass('public.uc_conducted_session_versions') IS NULL
  OR to_regprocedure('public.uc_learning_envelope(uuid,jsonb)') IS NULL
  OR to_regprocedure('public.uc_group_education_program(uuid,uuid)') IS NULL
  OR to_regprocedure('public.uc_document_scope_allowed(uuid,uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_DEPENDENCY_UNAVAILABLE';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND(left(p.proname,18)='uc_scoped_journal_' OR p.proname IN('read_scoped_custom_journals','apply_scoped_custom_journal_action')))
 THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_NEW_NAME_COLLISION';END IF;
END;$precondition$;

CREATE TABLE public.uc_scoped_journal_contexts(
 journal_id uuid PRIMARY KEY,organization_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('organization','group')),
 group_id uuid,course_id uuid,program_ref jsonb,created_by uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(journal_id,organization_id),
 CONSTRAINT uc_scoped_context_journal_fk FOREIGN KEY(journal_id,organization_id) REFERENCES public.uc_custom_journals(id,organization_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((kind='organization' AND group_id IS NULL AND course_id IS NULL AND program_ref IS NULL)
  OR(kind='group' AND group_id IS NOT NULL AND course_id IS NOT NULL AND program_ref IS NOT NULL AND jsonb_typeof(program_ref)='object'))
);
CREATE INDEX uc_scoped_context_scope ON public.uc_scoped_journal_contexts(organization_id,group_id,journal_id);
CREATE TABLE public.uc_scoped_journal_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),journal_id uuid NOT NULL,organization_id uuid NOT NULL,schema_version_id uuid NOT NULL,
 subject_user_id uuid,subject_label text,source jsonb NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 field_values jsonb NOT NULL,archived boolean NOT NULL DEFAULT false,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 recorded_by uuid,created_by uuid,participant_ids uuid[] NOT NULL,redacted boolean NOT NULL DEFAULT false,
 UNIQUE(id,journal_id,organization_id),
 CONSTRAINT uc_scoped_record_context_fk FOREIGN KEY(journal_id,organization_id) REFERENCES public.uc_scoped_journal_contexts(journal_id,organization_id),
 CONSTRAINT uc_scoped_record_schema_fk FOREIGN KEY(schema_version_id,journal_id,organization_id) REFERENCES public.uc_custom_journal_schemas(id,journal_id,organization_id),
 CHECK((subject_user_id IS NULL)=(subject_label IS NULL)),CHECK(cardinality(participant_ids)<=10000)
);
CREATE INDEX uc_scoped_record_page ON public.uc_scoped_journal_records(organization_id,journal_id,id);
CREATE INDEX uc_scoped_record_people ON public.uc_scoped_journal_records USING gin(participant_ids);
CREATE TABLE public.uc_scoped_journal_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),record_id uuid NOT NULL,journal_id uuid NOT NULL,organization_id uuid NOT NULL,
 schema_version_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 action text NOT NULL CHECK(action IN('save_record','archive_record')),reason text NOT NULL,field_values jsonb NOT NULL,
 subject_user_id uuid,subject_label text,source jsonb NOT NULL,archived boolean NOT NULL,recorded_at timestamptz NOT NULL,recorded_by uuid,
 participant_ids uuid[] NOT NULL,redacted boolean NOT NULL DEFAULT false,UNIQUE(record_id,revision),
 CONSTRAINT uc_scoped_history_record_fk FOREIGN KEY(record_id,journal_id,organization_id) REFERENCES public.uc_scoped_journal_records(id,journal_id,organization_id),
 CONSTRAINT uc_scoped_history_schema_fk FOREIGN KEY(schema_version_id,journal_id,organization_id) REFERENCES public.uc_custom_journal_schemas(id,journal_id,organization_id),
 CHECK((subject_user_id IS NULL)=(subject_label IS NULL)),CHECK(cardinality(participant_ids)<=10000)
);
CREATE INDEX uc_scoped_history_people ON public.uc_scoped_journal_history USING gin(participant_ids);
CREATE TABLE public.uc_scoped_journal_requests(
 actor_id uuid NOT NULL,request_id uuid NOT NULL,organization_id uuid NOT NULL,journal_id uuid NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL,participant_ids uuid[] NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor_id,request_id),CHECK(cardinality(participant_ids)<=10000)
);
CREATE INDEX uc_scoped_request_people ON public.uc_scoped_journal_requests USING gin(participant_ids);
CREATE TABLE public.uc_scoped_journal_exports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),journal_id uuid NOT NULL,organization_id uuid NOT NULL,record_count integer NOT NULL CHECK(record_count BETWEEN 0 AND 1000),
 manifest_text text NOT NULL,html_text text NOT NULL,manifest_hash text NOT NULL CHECK(manifest_hash~'^[a-f0-9]{64}$'),html_hash text NOT NULL CHECK(html_hash~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL,recorded_by uuid,participant_ids uuid[] NOT NULL,redacted boolean NOT NULL DEFAULT false,
 CONSTRAINT uc_scoped_export_context_fk FOREIGN KEY(journal_id,organization_id) REFERENCES public.uc_scoped_journal_contexts(journal_id,organization_id),
 CHECK(octet_length(manifest_text)+octet_length(html_text)<=8388608),CHECK(cardinality(participant_ids)<=10000)
);
CREATE INDEX uc_scoped_export_page ON public.uc_scoped_journal_exports(organization_id,journal_id,id);
CREATE INDEX uc_scoped_export_people ON public.uc_scoped_journal_exports USING gin(participant_ids);

DO $private_tables$
DECLARE v_table text;v_grant record;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['uc_scoped_journal_contexts','uc_scoped_journal_records','uc_scoped_journal_history','uc_scoped_journal_requests','uc_scoped_journal_exports'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
  FOR v_grant IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid=to_regclass('public.'||v_table) AND a.grantee<>c.relowner LOOP
   EXECUTE format('REVOKE ALL ON public.%I FROM %s CASCADE',v_table,CASE WHEN v_grant.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_grant.grantee)) END);
  END LOOP;
 END LOOP;
END;$private_tables$;

CREATE FUNCTION public.uc_scoped_journal_permission(p_org uuid,p_group uuid,p_write boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND public.uc_custom_journal_person(auth.uid()) AND public.account_deletion_access_allowed()
  AND EXISTS(SELECT 1 FROM public.organizations organization_row WHERE organization_row.id=p_org)
  AND public.uc_platform_document_action_allowed(auth.uid(),CASE WHEN p_write THEN 'write' ELSE 'read' END)
  AND public.can_access_organization(p_org,'journals.read') AND(NOT p_write OR public.can_access_organization(p_org,'journals.write'))
  AND((p_group IS NULL AND NOT public.uc_document_teacher_limited(p_org))
   OR(p_group IS NOT NULL AND public.uc_document_scope_allowed(p_org,p_group,NULL)))
  AND(NOT p_write OR NOT public.has_role(auth.uid(),'sales_manager'::public.app_role))
  AND(NOT p_write OR NOT EXISTS(SELECT 1 FROM public.org_staff staff_row WHERE staff_row.user_id=auth.uid() AND staff_row.organization_id=p_org AND staff_row.role IN('viewer','sales_manager'))),false)
$fn$;
CREATE FUNCTION public.uc_scoped_journal_context_json(p_journal uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('kind',c.kind,'group_id',c.group_id,'course_id',c.course_id,'program_ref',c.program_ref) FROM public.uc_scoped_journal_contexts c WHERE c.journal_id=p_journal
$fn$;
CREATE FUNCTION public.uc_scoped_journal_context(p_org uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_group uuid;v_course uuid;v_ref jsonb;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>1024 THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 IF public.uc_custom_journal_shape(p_input,ARRAY['kind']) AND p_input->>'kind'='organization' THEN
  IF NOT public.uc_scoped_journal_permission(p_org,NULL,false) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
  RETURN jsonb_build_object('kind','organization','group_id',NULL,'course_id',NULL,'program_ref',NULL);
 END IF;
 IF NOT public.uc_custom_journal_shape(p_input,ARRAY['kind','group_id']) OR p_input->>'kind' IS DISTINCT FROM 'group' OR NOT public.uc_custom_journal_uuid(p_input->'group_id') THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 v_group:=(p_input->>'group_id')::uuid;
 IF NOT public.uc_scoped_journal_permission(p_org,v_group,false) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 SELECT g.course_id INTO v_course FROM public.student_groups g WHERE g.id=v_group AND g.organization_id=p_org;
 IF NOT FOUND THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
 IF v_course IS NOT NULL THEN
  v_ref:=public.uc_group_education_program(p_org,v_group);
  IF v_ref IS NOT NULL THEN v_ref:=jsonb_build_object('binding_id',v_ref->'binding_id','binding_revision',v_ref->'binding_revision','version_id',v_ref->'version_id','binding_snapshot_hash',v_ref->'binding_snapshot_hash');END IF;
 END IF;
 RETURN jsonb_build_object('kind','group','group_id',v_group,'course_id',v_course,'program_ref',v_ref);
END;$fn$;
CREATE FUNCTION public.uc_scoped_journal_fence(p_org uuid,p_group uuid,p_people uuid[],p_request uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_person uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 IF cardinality(coalesce(p_people,'{}'))>10000 THEN PERFORM public.uc_custom_journal_error('LIMIT_EXCEEDED');END IF;
 FOR v_person IN SELECT DISTINCT person_id FROM unnest(array_append(coalesce(p_people,'{}'),auth.uid())) person_id WHERE person_id IS NOT NULL ORDER BY person_id LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(v_person::text,42007)) THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
  IF NOT public.uc_custom_journal_person(v_person) THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
 END LOOP;
 IF p_request IS NOT NULL THEN
  IF NOT pg_try_advisory_xact_lock(hashtextextended(p_org::text,0)) THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
  IF p_group IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_program_roster:'||p_group::text,0)) THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
 END IF;
 IF p_request IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_scoped_journal_request:'||auth.uid()::text||':'||p_request::text,0)) THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
 -- Current grants/assignment cannot be revoked between authorization and return.
 -- NOWAIT never queues a partial lock set behind another administrative writer.
 LOCK TABLE public.organizations,public.org_staff,public.org_staff_document_groups,public.user_roles,public.admin_staff IN ROW SHARE MODE NOWAIT;
 PERFORM 1 FROM public.organizations organization_row WHERE organization_row.id=p_org FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_staff staff_row WHERE staff_row.organization_id=p_org AND staff_row.user_id=auth.uid() ORDER BY staff_row.id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_staff_document_groups assignment_row JOIN public.org_staff staff_row ON staff_row.id=assignment_row.staff_id
  WHERE assignment_row.organization_id=p_org AND assignment_row.group_id=p_group AND staff_row.user_id=auth.uid() ORDER BY assignment_row.staff_id FOR SHARE OF assignment_row NOWAIT;
 PERFORM 1 FROM public.user_roles role_row WHERE role_row.user_id=auth.uid() ORDER BY role_row.user_id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.admin_staff admin_row WHERE admin_row.user_id=auth.uid() ORDER BY admin_row.user_id FOR SHARE NOWAIT;
 IF NOT public.uc_scoped_journal_permission(p_org,p_group,false) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END;$fn$;
CREATE FUNCTION public.uc_scoped_journal_read_fence(p_org uuid,p_context jsonb,p_people uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_people uuid[];
BEGIN
 SELECT coalesce(array_agg(DISTINCT person_id ORDER BY person_id) FILTER(WHERE person_id IS NOT NULL),'{}') INTO v_people FROM unnest(p_people) person_id;
 PERFORM public.uc_scoped_journal_fence(p_org,(p_context->>'group_id')::uuid,v_people);
END;$fn$;
CREATE FUNCTION public.uc_scoped_journal_head_people(p_journal uuid) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT ARRAY[j.created_by,j.updated_by,c.created_by,s.created_by] FROM public.uc_custom_journals j JOIN public.uc_scoped_journal_contexts c ON c.journal_id=j.id JOIN public.uc_custom_journal_schemas s ON s.id=j.current_schema_id WHERE j.id=p_journal
$fn$;

CREATE FUNCTION public.read_scoped_custom_journals(p_organization_id uuid,p_context jsonb,p_query jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $fn$
DECLARE v_context jsonb;v_kind text:=p_query->>'kind';v_journal uuid;v_record uuid;v_after uuid;v_limit integer;v_after_revision bigint;
 v_rows jsonb:='[]';v_count integer:=0;v_last uuid;v_last_revision bigint;v_item record;v_base jsonb;v_j public.uc_custom_journals;v_export public.uc_scoped_journal_exports;v_people uuid[]:='{}';
BEGIN
 v_context:=public.uc_scoped_journal_context(p_organization_id,p_context);
 IF jsonb_typeof(p_query) IS DISTINCT FROM 'object' OR octet_length(p_query::text)>32768 THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 PERFORM public.uc_scoped_journal_fence(p_organization_id,(v_context->>'group_id')::uuid,ARRAY[auth.uid()]);
 v_context:=public.uc_scoped_journal_context(p_organization_id,p_context);
 IF v_kind='list' THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','after_id','limit','include_archived']) OR jsonb_typeof(p_query->'include_archived') IS DISTINCT FROM 'boolean' THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 ELSE
  IF NOT public.uc_custom_journal_uuid(p_query->'journal_id') THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;v_journal:=(p_query->>'journal_id')::uuid;
  IF NOT public.uc_scoped_journal_matches(p_organization_id,p_context,v_journal) THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
  v_context:=public.uc_scoped_journal_context_json(v_journal);SELECT j.* INTO v_j FROM public.uc_custom_journals j WHERE j.id=v_journal;
 END IF;
 v_base:=public.uc_scoped_journal_base(p_organization_id,v_context,NOT coalesce(v_j.redacted,false))||jsonb_build_object('kind',v_kind);
 IF v_kind='journal' THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','journal_id']) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  SELECT public.uc_scoped_journal_detail(v_journal) dto,public.uc_scoped_journal_head_people(v_journal) people INTO v_item;
  PERFORM public.uc_scoped_journal_read_fence(p_organization_id,v_context,v_item.people);
  RETURN public.uc_scoped_journal_base(p_organization_id,v_context,NOT coalesce(v_j.redacted,false))||jsonb_build_object('kind',v_kind,'journal',v_item.dto);
 ELSIF v_kind='export' THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','journal_id','export_id']) OR NOT public.uc_custom_journal_uuid(p_query->'export_id') THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  SELECT export_row.* INTO v_export FROM public.uc_scoped_journal_exports export_row WHERE export_row.id=(p_query->>'export_id')::uuid AND export_row.journal_id=v_journal AND export_row.organization_id=p_organization_id;
  IF NOT FOUND THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
  PERFORM public.uc_scoped_journal_fence(p_organization_id,(v_context->>'group_id')::uuid,v_export.participant_ids);
  IF NOT public.uc_scoped_journal_matches(p_organization_id,p_context,v_journal) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
  RETURN v_base||jsonb_build_object('journal_id',v_journal,'export',public.uc_scoped_journal_export_json(v_export.id));
 END IF;
 IF jsonb_typeof(p_query->'limit') IS DISTINCT FROM 'number' OR coalesce(p_query->>'limit','')!~'^[1-9][0-9]?$' THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 v_limit:=(p_query->>'limit')::integer;IF v_limit>(CASE WHEN v_kind IN('list','subjects') THEN 50 ELSE 25 END) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 IF v_kind='history' THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','journal_id','record_id','after_revision','limit']) OR NOT public.uc_custom_journal_uuid(p_query->'record_id') OR jsonb_typeof(p_query->'after_revision') IS DISTINCT FROM 'number' OR coalesce(p_query->>'after_revision','')!~'^(0|[1-9][0-9]{0,15})$' OR(p_query->>'after_revision')::numeric>9007199254740991 THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  v_record:=(p_query->>'record_id')::uuid;v_after_revision:=(p_query->>'after_revision')::bigint;
  IF NOT EXISTS(SELECT 1 FROM public.uc_scoped_journal_records r WHERE r.id=v_record AND r.journal_id=v_journal AND r.organization_id=p_organization_id) THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
  FOR v_item IN SELECT h.id,h.revision,public.uc_scoped_journal_history_json(h.id) dto,h.participant_ids||ARRAY[h.recorded_by,h.subject_user_id,s.created_by] people FROM public.uc_scoped_journal_history h JOIN public.uc_custom_journal_schemas s ON s.id=h.schema_version_id WHERE h.record_id=v_record AND h.journal_id=v_journal AND h.organization_id=p_organization_id AND h.revision>v_after_revision ORDER BY h.revision LIMIT v_limit+1 LOOP
   v_count:=v_count+1;IF v_count>v_limit THEN EXIT;END IF;v_rows:=v_rows||jsonb_build_array(v_item.dto);v_people:=v_people||v_item.people;v_last_revision:=v_item.revision;
  END LOOP;
  PERFORM public.uc_scoped_journal_read_fence(p_organization_id,v_context,v_people);
  RETURN v_base||jsonb_build_object('journal_id',v_journal,'record_id',v_record,'history',v_rows,'next_after_revision',CASE WHEN v_count>v_limit THEN v_last_revision END);
 END IF;
 IF NOT(p_query->'after_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'after_id')) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;v_after:=(p_query->>'after_id')::uuid;
 IF v_kind='list' THEN
  FOR v_item IN SELECT c.journal_id,public.uc_scoped_journal_detail(c.journal_id,false) dto,public.uc_scoped_journal_head_people(c.journal_id) people FROM public.uc_scoped_journal_contexts c JOIN public.uc_custom_journals j ON j.id=c.journal_id WHERE c.organization_id=p_organization_id AND c.kind=v_context->>'kind' AND c.group_id IS NOT DISTINCT FROM(v_context->>'group_id')::uuid AND(v_after IS NULL OR c.journal_id>v_after) AND((p_query->>'include_archived')::boolean OR NOT j.archived) ORDER BY c.journal_id LIMIT v_limit+1 LOOP
   v_count:=v_count+1;IF v_count>v_limit THEN EXIT;END IF;v_rows:=v_rows||jsonb_build_array(v_item.dto);v_people:=v_people||v_item.people;v_last:=v_item.journal_id;
  END LOOP;
  PERFORM public.uc_scoped_journal_read_fence(p_organization_id,v_context,v_people);
  RETURN v_base||jsonb_build_object('journals',v_rows,'next_after_id',CASE WHEN v_count>v_limit THEN v_last END);
 ELSIF v_kind='records' THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','journal_id','after_id','limit']) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  FOR v_item IN SELECT r.id,public.uc_scoped_journal_record_json(r.id) dto,r.participant_ids||ARRAY[r.recorded_by,r.created_by,r.subject_user_id,s.created_by] people FROM public.uc_scoped_journal_records r JOIN public.uc_custom_journal_schemas s ON s.id=r.schema_version_id WHERE r.organization_id=p_organization_id AND r.journal_id=v_journal AND(v_after IS NULL OR r.id>v_after) ORDER BY r.id LIMIT v_limit+1 LOOP
   v_count:=v_count+1;IF v_count>v_limit THEN EXIT;END IF;v_rows:=v_rows||jsonb_build_array(v_item.dto);v_people:=v_people||v_item.people;v_last:=v_item.id;
  END LOOP;
  PERFORM public.uc_scoped_journal_read_fence(p_organization_id,v_context,v_people);
  RETURN v_base||jsonb_build_object('journal_id',v_journal,'records',v_rows,'next_after_id',CASE WHEN v_count>v_limit THEN v_last END);
 ELSIF v_kind='subjects' THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','journal_id','after_id','limit']) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  FOR v_item IN WITH candidates AS(
   SELECT p.user_id FROM public.profiles p WHERE p.organization_id=p_organization_id UNION SELECT staff_row.user_id FROM public.org_staff staff_row WHERE staff_row.organization_id=p_organization_id AND(staff_row.expires_at IS NULL OR staff_row.expires_at>now())
   UNION SELECT e.user_id FROM public.enrollments e JOIN public.courses course_row ON course_row.id=e.course_id WHERE course_row.organization_id=p_organization_id AND e.status NOT IN('cancelled','revoked'))
   SELECT u.id,left(coalesce(nullif(p.full_name,''),'Пользователь '||left(u.id::text,8)),120) label FROM candidates candidate_row JOIN auth.users u ON u.id=candidate_row.user_id LEFT JOIN public.profiles p ON p.user_id=u.id
   WHERE(v_after IS NULL OR u.id>v_after) AND public.uc_scoped_journal_subject(p_organization_id,v_context,u.id) ORDER BY u.id LIMIT v_limit+1 LOOP
   v_count:=v_count+1;IF v_count>v_limit THEN EXIT;END IF;v_rows:=v_rows||jsonb_build_array(jsonb_build_object('user_id',v_item.id,'label',v_item.label));v_people:=array_append(v_people,v_item.id);v_last:=v_item.id;
  END LOOP;
  PERFORM public.uc_scoped_journal_read_fence(p_organization_id,v_context,v_people);
  RETURN v_base||jsonb_build_object('journal_id',v_journal,'subjects',v_rows,'next_after_id',CASE WHEN v_count>v_limit THEN v_last END);
 ELSIF v_kind='sources' THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','journal_id','source_kind','subject_user_id','after_id','limit']) OR coalesce(p_query->>'source_kind','') NOT IN('session','outcome') OR NOT(p_query->'subject_user_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_query->'subject_user_id')) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  IF v_context->>'kind'<>'group' THEN RETURN v_base||jsonb_build_object('journal_id',v_journal,'sources',v_rows,'next_after_id',NULL);END IF;
  IF p_query->'subject_user_id'<>'null'::jsonb AND NOT public.uc_scoped_journal_subject(p_organization_id,v_context,(p_query->>'subject_user_id')::uuid) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
  IF p_query->>'source_kind'='outcome' AND p_query->'subject_user_id'='null'::jsonb THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  FOR v_item IN SELECT source_candidate.*,public.uc_scoped_journal_source(p_organization_id,v_context,(p_query->>'subject_user_id')::uuid,source_candidate.source) people FROM(
   SELECT sv.id,'Занятие '||sv.starts_at::text||' · версия '||sv.revision::text label,jsonb_build_object('kind','session','session_id',ss.id,'session_version_id',sv.id,'content_hash',sv.content_hash) source
    FROM public.uc_conducted_sessions ss JOIN public.uc_conducted_session_versions sv ON sv.session_id=ss.id WHERE p_query->>'source_kind'='session' AND ss.organization_id=p_organization_id AND ss.group_id=(v_context->>'group_id')::uuid AND ss.course_id=(v_context->>'course_id')::uuid AND NOT sv.redacted
    AND NOT EXISTS(SELECT 1 FROM public.uc_conducted_session_versions newer_version WHERE newer_version.session_id=ss.id AND newer_version.revision>sv.revision)
   UNION ALL
   SELECT os.id,'Решение: '||CASE decision_row.outcome WHEN 'passed' THEN 'зачтено' WHEN 'not_passed' THEN 'не зачтено' ELSE 'отложено' END||' · версия '||os.revision::text,jsonb_build_object('kind','outcome','program_enrollment_snapshot_id',os.program_enrollment_snapshot_id,'state_id',os.id,'revision',os.revision,'machine_id',os.machine_id,'machine_input_hash',mr.input_hash,'decision_id',os.decision_id)
    FROM public.uc_learning_outcome_states os JOIN public.uc_learning_machine_results mr ON mr.id=os.machine_id JOIN public.uc_learning_attestation_decisions decision_row ON decision_row.id=os.decision_id
    WHERE p_query->>'source_kind'='outcome' AND os.organization_id=p_organization_id AND os.group_id=(v_context->>'group_id')::uuid AND os.user_id=(p_query->>'subject_user_id')::uuid AND NOT decision_row.redacted
  ) source_candidate WHERE(v_after IS NULL OR source_candidate.id>v_after) AND public.uc_scoped_journal_source_current(p_organization_id,v_context,(p_query->>'subject_user_id')::uuid,source_candidate.source) ORDER BY source_candidate.id LIMIT v_limit+1 LOOP
   v_count:=v_count+1;IF v_count>v_limit THEN EXIT;END IF;v_rows:=v_rows||jsonb_build_array(jsonb_build_object('id',v_item.id,'label',v_item.label,'source',v_item.source));v_people:=v_people||v_item.people;v_last:=v_item.id;
  END LOOP;
  PERFORM public.uc_scoped_journal_read_fence(p_organization_id,v_context,v_people);
  RETURN v_base||jsonb_build_object('journal_id',v_journal,'sources',v_rows,'next_after_id',CASE WHEN v_count>v_limit THEN v_last END);
 ELSIF v_kind='exports' THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','journal_id','after_id','limit']) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  FOR v_item IN SELECT e.id,public.uc_scoped_journal_export_json(e.id,false) dto,e.participant_ids||ARRAY[e.recorded_by] people FROM public.uc_scoped_journal_exports e WHERE e.organization_id=p_organization_id AND e.journal_id=v_journal AND(v_after IS NULL OR e.id>v_after) ORDER BY e.id LIMIT v_limit+1 LOOP
   v_count:=v_count+1;IF v_count>v_limit THEN EXIT;END IF;v_rows:=v_rows||jsonb_build_array(v_item.dto);v_people:=v_people||v_item.people;v_last:=v_item.id;
  END LOOP;
  PERFORM public.uc_scoped_journal_read_fence(p_organization_id,v_context,v_people);
  RETURN v_base||jsonb_build_object('journal_id',v_journal,'exports',v_rows,'next_after_id',CASE WHEN v_count>v_limit THEN v_last END);
 END IF;
 PERFORM public.uc_custom_journal_error('INVALID_INPUT');RETURN NULL;
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');RETURN NULL;END;$fn$;
CREATE FUNCTION public.uc_scoped_journal_matches(p_org uuid,p_input jsonb,p_journal uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_requested jsonb;v_stored public.uc_scoped_journal_contexts;
BEGIN
 v_requested:=public.uc_scoped_journal_context(p_org,p_input);
 SELECT c.* INTO v_stored FROM public.uc_scoped_journal_contexts c WHERE c.journal_id=p_journal AND c.organization_id=p_org;
 RETURN coalesce(v_stored.kind=v_requested->>'kind' AND v_stored.group_id IS NOT DISTINCT FROM (v_requested->>'group_id')::uuid,false);
END;$fn$;
CREATE FUNCTION public.uc_scoped_journal_base(p_org uuid,p_context jsonb,p_write boolean DEFAULT true) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('schema_version',2,'organization_id',p_org,'context',p_context,'capabilities',jsonb_build_object('can_read',public.uc_scoped_journal_permission(p_org,(p_context->>'group_id')::uuid,false),'can_write',
  p_write AND public.uc_scoped_journal_permission(p_org,(p_context->>'group_id')::uuid,true) AND(p_context->>'kind'='organization' OR(p_context->'program_ref'<>'null'::jsonb AND p_context IS NOT DISTINCT FROM public.uc_scoped_journal_context(p_org,jsonb_build_object('kind','group','group_id',p_context->'group_id'))))))
$fn$;
CREATE FUNCTION public.uc_scoped_journal_detail(p_journal uuid,p_full boolean DEFAULT true) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_custom_journal_detail(p_journal,p_full)||jsonb_build_object('context',public.uc_scoped_journal_context_json(p_journal),'source_current',
  c.kind='organization' OR public.uc_scoped_journal_context_json(c.journal_id) IS NOT DISTINCT FROM public.uc_scoped_journal_context(c.organization_id,jsonb_build_object('kind','group','group_id',c.group_id)))
 FROM public.uc_scoped_journal_contexts c WHERE c.journal_id=p_journal
$fn$;
CREATE FUNCTION public.uc_scoped_journal_subject(p_org uuid,p_context jsonb,p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_custom_journal_subject(p_org,p_user) AND(p_context->>'kind'='organization' OR EXISTS(
  SELECT 1 FROM public.student_group_memberships_effective member_row WHERE member_row.organization_id=p_org AND member_row.group_id=(p_context->>'group_id')::uuid AND member_row.user_id=p_user))
$fn$;
CREATE FUNCTION public.uc_scoped_journal_source(p_org uuid,p_context jsonb,p_user uuid,p_source jsonb) RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_session public.uc_conducted_sessions;v_version public.uc_conducted_session_versions;v_state public.uc_learning_outcome_states;v_decision public.uc_learning_attestation_decisions;v_proof jsonb;v_envelope jsonb;v_scope jsonb;v_key text;
BEGIN
 IF public.uc_custom_journal_shape(p_source,ARRAY['kind']) AND p_source->>'kind'='none' THEN RETURN '{}'::uuid[];END IF;
 IF p_context->>'kind'<>'group' THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 IF p_source->>'kind'='session' THEN
  IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','session_id','session_version_id','content_hash']) OR NOT public.uc_custom_journal_uuid(p_source->'session_id') OR NOT public.uc_custom_journal_uuid(p_source->'session_version_id') OR coalesce(p_source->>'content_hash','')!~'^[a-f0-9]{64}$' THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  IF NOT public.uc_group_education_actor_allowed(auth.uid(),p_org,(p_context->>'group_id')::uuid,false) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
  SELECT s.* INTO v_session FROM public.uc_conducted_sessions s WHERE s.id=(p_source->>'session_id')::uuid AND s.organization_id=p_org AND s.group_id=(p_context->>'group_id')::uuid AND s.course_id=(p_context->>'course_id')::uuid;
  SELECT sv.* INTO v_version FROM public.uc_conducted_session_versions sv WHERE sv.id=(p_source->>'session_version_id')::uuid AND sv.session_id=v_session.id AND sv.organization_id=p_org AND sv.group_id=v_session.group_id;
  IF v_session.id IS NULL OR v_version.id IS NULL OR v_version.redacted OR v_version.content_hash IS DISTINCT FROM p_source->>'content_hash'
   OR EXISTS(SELECT 1 FROM public.uc_conducted_session_versions newer_version WHERE newer_version.session_id=v_session.id AND newer_version.revision>v_version.revision)
   OR NOT((v_version.source_proof->'program_ref') @> (p_context->'program_ref'))
   OR(p_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_version.attendance) attendance_row WHERE attendance_row->>'user_id'=p_user::text))
  THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  v_proof:=public.uc_session_source(p_org,v_session.group_id,v_session.calendar_version_id,v_session.lesson_id,v_session.roster_snapshot_id,v_session.calendar_hash);
  IF v_proof IS DISTINCT FROM v_version.source_proof THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  RETURN v_version.participant_ids;
 ELSIF p_source->>'kind'='outcome' THEN
  IF p_user IS NULL OR NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','program_enrollment_snapshot_id','state_id','revision','machine_id','machine_input_hash','decision_id']) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  FOREACH v_key IN ARRAY ARRAY['program_enrollment_snapshot_id','state_id','machine_id','decision_id'] LOOP IF NOT public.uc_custom_journal_uuid(p_source->v_key) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;END LOOP;
  IF jsonb_typeof(p_source->'revision') IS DISTINCT FROM 'number' OR coalesce(p_source->>'revision','')!~'^[1-9][0-9]{0,15}$' OR (p_source->>'revision')::numeric>9007199254740991 OR coalesce(p_source->>'machine_input_hash','')!~'^[a-f0-9]{64}$' THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  SELECT os.* INTO v_state FROM public.uc_learning_outcome_states os WHERE os.id=(p_source->>'state_id')::uuid AND os.organization_id=p_org AND os.group_id=(p_context->>'group_id')::uuid AND os.course_id=(p_context->>'course_id')::uuid AND os.user_id=p_user AND os.program_version_id=(p_context->'program_ref'->>'version_id')::uuid;
  IF v_state.id IS NULL OR v_state.program_enrollment_snapshot_id IS DISTINCT FROM(p_source->>'program_enrollment_snapshot_id')::uuid OR v_state.revision IS DISTINCT FROM(p_source->>'revision')::bigint OR v_state.machine_id IS DISTINCT FROM(p_source->>'machine_id')::uuid OR v_state.decision_id IS DISTINCT FROM(p_source->>'decision_id')::uuid THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  v_scope:=public.uc_learning_scope(v_state.program_enrollment_snapshot_id);
  IF NOT public.uc_learning_staff(auth.uid(),p_org,v_state.group_id,false) OR NOT public.uc_learning_scope_valid(p_org,v_scope) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
  v_envelope:=public.uc_learning_envelope(p_org,v_scope);
  IF v_envelope->>'decision_relation' IS DISTINCT FROM 'current_inputs' OR v_envelope->'machine'->>'input_hash' IS DISTINCT FROM p_source->>'machine_input_hash' THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  SELECT decision_row.* INTO v_decision FROM public.uc_learning_attestation_decisions decision_row WHERE decision_row.id=v_state.decision_id AND decision_row.state_id=v_state.id AND decision_row.organization_id=p_org AND decision_row.user_id=p_user AND decision_row.machine_result_id=v_state.machine_id AND decision_row.machine_input_hash=p_source->>'machine_input_hash' AND NOT decision_row.redacted;
  IF v_decision.id IS NULL THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  RETURN v_decision.participant_ids;
 END IF;
 PERFORM public.uc_custom_journal_error('INVALID_INPUT');RETURN NULL;
END;$fn$;
CREATE FUNCTION public.uc_scoped_journal_source_current(p_org uuid,p_context jsonb,p_user uuid,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.uc_scoped_journal_source(p_org,p_context,p_user,p_source);RETURN true;
EXCEPTION WHEN SQLSTATE 'P0001' OR SQLSTATE '42501' OR SQLSTATE '22023' OR SQLSTATE '40001' THEN RETURN false;END;$fn$;
CREATE FUNCTION public.uc_scoped_journal_record_json(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',r.id,'journal_id',r.journal_id,'schema_version_id',r.schema_version_id,'revision',r.revision,
 'subject',CASE WHEN r.subject_user_id IS NULL OR r.redacted OR s.redacted THEN jsonb_build_object('kind','none') ELSE jsonb_build_object('kind','person','user_id',r.subject_user_id) END,
 'subject_label',CASE WHEN r.redacted OR s.redacted THEN NULL ELSE r.subject_label END,'source',CASE WHEN r.redacted OR s.redacted THEN jsonb_build_object('kind','none') ELSE r.source END,
 'source_current',NOT(r.redacted OR s.redacted) AND public.uc_scoped_journal_source_current(r.organization_id,public.uc_scoped_journal_context_json(r.journal_id),r.subject_user_id,r.source),
 'values',CASE WHEN r.redacted OR s.redacted THEN '{}'::jsonb ELSE r.field_values END,'archived',r.archived,'recorded_at',r.recorded_at,'recorded_by',r.recorded_by,
 'schema',public.uc_custom_journal_schema_json(s.id),'redacted',r.redacted OR s.redacted)
 FROM public.uc_scoped_journal_records r JOIN public.uc_custom_journal_schemas s ON s.id=r.schema_version_id WHERE r.id=p_id
$fn$;
CREATE FUNCTION public.uc_scoped_journal_history_json(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',h.id,'record_id',h.record_id,'revision',h.revision,'action',h.action,'reason',CASE WHEN h.redacted OR s.redacted THEN '' ELSE h.reason END,
 'recorded_at',h.recorded_at,'recorded_by',h.recorded_by,'schema',public.uc_custom_journal_schema_json(h.schema_version_id),
 'subject',CASE WHEN h.subject_user_id IS NULL OR h.redacted OR s.redacted THEN jsonb_build_object('kind','none') ELSE jsonb_build_object('kind','person','user_id',h.subject_user_id) END,
 'subject_label',CASE WHEN h.redacted OR s.redacted THEN NULL ELSE h.subject_label END,'source',CASE WHEN h.redacted OR s.redacted THEN jsonb_build_object('kind','none') ELSE h.source END,
 'values',CASE WHEN h.redacted OR s.redacted THEN '{}'::jsonb ELSE h.field_values END,'archived',h.archived,'redacted',h.redacted OR s.redacted)
 FROM public.uc_scoped_journal_history h JOIN public.uc_custom_journal_schemas s ON s.id=h.schema_version_id WHERE h.id=p_id
$fn$;
CREATE FUNCTION public.uc_scoped_journal_text_hash(p_text text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT encode(sha256(convert_to(p_text,'UTF8')),'hex')
$fn$;
CREATE FUNCTION public.uc_scoped_journal_escape(p_text text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT replace(replace(replace(replace(replace(coalesce(p_text,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')
$fn$;
CREATE FUNCTION public.uc_scoped_journal_html(p_manifest jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE v_html text;v_row jsonb;v_version jsonb;v_field jsonb;v_value jsonb;
BEGIN
 v_html:='<!doctype html><html lang="ru"><meta charset="utf-8"><title>'||public.uc_scoped_journal_escape(p_manifest->'journal'->>'title')||'</title><style>body{font:14px sans-serif;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:6px;text-align:left;white-space:pre-wrap}pre{white-space:pre-wrap;overflow-wrap:anywhere}section{margin:24px 0}small{color:#555}</style><h1>'||public.uc_scoped_journal_escape(p_manifest->'journal'->>'title')||'</h1><p>Сохранённая выгрузка журнала. Поле «Подпись» — непроверенный текст, не электронная подпись. Документ не подтверждает официальную выдачу.</p><p>Снимок: '||public.uc_scoped_journal_escape(p_manifest->>'export_id')||'; записей: '||public.uc_scoped_journal_escape(p_manifest->>'record_count')||'</p><pre>'||public.uc_scoped_journal_escape((p_manifest->'context')::text)||'</pre>';
 FOR v_row IN SELECT row_item FROM jsonb_array_elements(p_manifest->'records') row_item LOOP
  v_html:=v_html||'<section><h2>Запись '||public.uc_scoped_journal_escape(v_row->>'id')||'</h2><p>Версия '||public.uc_scoped_journal_escape(v_row->>'revision')||'; '||public.uc_scoped_journal_escape(coalesce(v_row->>'subject_label','Без персонального субъекта'))||'; источник: '||CASE WHEN v_row->'source'->>'kind'='none' THEN 'ручные сведения без связанного события' WHEN v_row->'source_current'='true'::jsonb THEN 'актуален на момент снимка' ELSE 'изменился или недоступен на момент снимка' END||'</p>';
  FOR v_version IN SELECT revision_item FROM jsonb_array_elements(v_row->'history') revision_item LOOP
   v_html:=v_html||'<h3>Исправление '||public.uc_scoped_journal_escape(v_version->>'revision')||'; схема '||public.uc_scoped_journal_escape(v_version->'schema'->>'version')||'</h3><p>'||public.uc_scoped_journal_escape(v_version->>'reason')||'</p><table><tr><th>Поле исходной схемы</th><th>Значение</th></tr>';
   FOR v_field IN SELECT field_item FROM jsonb_array_elements(v_version->'schema'->'fields') field_item LOOP
    v_value:=v_version->'values'->(v_field->>'id');
    v_html:=v_html||'<tr><td>'||public.uc_scoped_journal_escape(v_field->>'label')||'</td><td>'||public.uc_scoped_journal_escape(CASE WHEN jsonb_typeof(v_value)='string' THEN v_value#>>'{}' ELSE coalesce(v_value::text,'null') END)||'</td></tr>';
   END LOOP;
   v_html:=v_html||'</table><small>'||public.uc_scoped_journal_escape(v_version->>'recorded_at')||'</small><pre>'||public.uc_scoped_journal_escape((v_version->'source')::text)||'</pre>';
  END LOOP;
  v_html:=v_html||'</section>';
 END LOOP;
 RETURN v_html||'</html>';
END;$fn$;
CREATE FUNCTION public.uc_scoped_journal_export_json(p_id uuid,p_full boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_export public.uc_scoped_journal_exports;v_result jsonb;
BEGIN
 SELECT e.* INTO v_export FROM public.uc_scoped_journal_exports e WHERE e.id=p_id;
 IF v_export.id IS NULL THEN RETURN NULL;END IF;
 IF v_export.redacted OR EXISTS(SELECT 1 FROM unnest(v_export.participant_ids) person_id JOIN public.account_deletion_revocations rev ON rev.user_id=person_id)
  OR EXISTS(SELECT 1 FROM public.uc_custom_journals j WHERE j.id=v_export.journal_id AND j.redacted)
  OR public.uc_scoped_journal_text_hash(v_export.manifest_text)<>v_export.manifest_hash OR public.uc_scoped_journal_text_hash(v_export.html_text)<>v_export.html_hash
 THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
 v_result:=jsonb_build_object('id',v_export.id,'journal_id',v_export.journal_id,'record_count',v_export.record_count,'manifest_hash',v_export.manifest_hash,'html_hash',v_export.html_hash,'recorded_at',v_export.recorded_at,'recorded_by',v_export.recorded_by,'redacted',false);
 IF p_full THEN v_result:=v_result||jsonb_build_object('manifest_text',v_export.manifest_text,'html_text',v_export.html_text);END IF;
 RETURN v_result;
END;$fn$;
CREATE FUNCTION public.uc_scoped_journal_people(p_journal uuid) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(array_agg(DISTINCT person_id ORDER BY person_id) FILTER(WHERE person_id IS NOT NULL),'{}') FROM(
  SELECT j.created_by person_id FROM public.uc_custom_journals j WHERE j.id=p_journal UNION ALL SELECT j.updated_by FROM public.uc_custom_journals j WHERE j.id=p_journal
  UNION ALL SELECT c.created_by FROM public.uc_scoped_journal_contexts c WHERE c.journal_id=p_journal
  UNION ALL SELECT s.created_by FROM public.uc_custom_journal_schemas s WHERE s.journal_id=p_journal
  UNION ALL SELECT unnest(r.participant_ids) FROM public.uc_scoped_journal_records r WHERE r.journal_id=p_journal
  UNION ALL SELECT unnest(h.participant_ids) FROM public.uc_scoped_journal_history h WHERE h.journal_id=p_journal
 ) people_rows
$fn$;
CREATE FUNCTION public.uc_scoped_journal_capture(p_org uuid,p_journal uuid,p_locked_people uuid[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $fn$
DECLARE v_journal public.uc_custom_journals;v_id uuid:=gen_random_uuid();v_time timestamptz:=clock_timestamp();v_records jsonb;v_manifest jsonb;v_manifest_text text;v_html text;v_n integer;v_history_n bigint;v_size bigint;v_people uuid[];
BEGIN
 SELECT j.* INTO v_journal FROM public.uc_custom_journals j WHERE j.id=p_journal AND j.organization_id=p_org;
 IF v_journal.id IS NULL OR v_journal.redacted THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
 SELECT count(*) INTO v_n FROM public.uc_scoped_journal_records r WHERE r.journal_id=p_journal;
 SELECT count(*) INTO v_history_n FROM public.uc_scoped_journal_history h WHERE h.journal_id=p_journal;
 IF v_n>1000 OR v_history_n>10000 THEN PERFORM public.uc_custom_journal_error('LIMIT_EXCEEDED');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_scoped_journal_records r JOIN public.uc_custom_journal_schemas s ON s.id=r.schema_version_id WHERE r.journal_id=p_journal AND(r.redacted OR s.redacted))
  OR EXISTS(SELECT 1 FROM public.uc_scoped_journal_history h JOIN public.uc_custom_journal_schemas s ON s.id=h.schema_version_id WHERE h.journal_id=p_journal AND(h.redacted OR s.redacted))
 THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_scoped_journal_records r WHERE r.journal_id=p_journal AND(
  (SELECT count(*) FROM public.uc_scoped_journal_history h WHERE h.record_id=r.id)<>r.revision
  OR NOT EXISTS(SELECT 1 FROM public.uc_scoped_journal_history h WHERE h.record_id=r.id AND h.revision=1)
  OR NOT EXISTS(SELECT 1 FROM public.uc_scoped_journal_history h WHERE h.record_id=r.id AND h.revision=r.revision AND h.schema_version_id=r.schema_version_id AND h.field_values=r.field_values AND h.subject_user_id IS NOT DISTINCT FROM r.subject_user_id AND h.subject_label IS NOT DISTINCT FROM r.subject_label AND h.source=r.source AND h.archived=r.archived AND h.recorded_at=r.recorded_at AND h.recorded_by IS NOT DISTINCT FROM r.recorded_by)))
 THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
 SELECT array_agg(DISTINCT person_id ORDER BY person_id) INTO v_people FROM unnest(array_append(public.uc_scoped_journal_people(p_journal),auth.uid())) person_id WHERE person_id IS NOT NULL;
 IF EXISTS(SELECT 1 FROM unnest(v_people) person_id WHERE NOT person_id=ANY(p_locked_people)) THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
 SELECT coalesce(sum(octet_length(to_jsonb(content_row)::text)+octet_length(s.fields::text)+1024),0) INTO v_size FROM(
  SELECT r.schema_version_id,r.field_values,r.subject_label,r.source FROM public.uc_scoped_journal_records r WHERE r.journal_id=p_journal
  UNION ALL SELECT h.schema_version_id,h.field_values,h.subject_label,h.source FROM public.uc_scoped_journal_history h WHERE h.journal_id=p_journal
 ) content_row JOIN public.uc_custom_journal_schemas s ON s.id=content_row.schema_version_id;
 IF v_size>8388608 THEN PERFORM public.uc_custom_journal_error('LIMIT_EXCEEDED');END IF;
 SELECT coalesce(jsonb_agg(public.uc_scoped_journal_record_json(r.id)||jsonb_build_object('history',
  coalesce((SELECT jsonb_agg(public.uc_scoped_journal_history_json(h.id) ORDER BY h.revision) FROM public.uc_scoped_journal_history h WHERE h.record_id=r.id),'[]'::jsonb)) ORDER BY r.id),'[]'::jsonb)
 INTO v_records FROM public.uc_scoped_journal_records r WHERE r.journal_id=p_journal;
 v_manifest:=jsonb_build_object('schema_version',1,'export_id',v_id,'organization_id',p_org,'context',public.uc_scoped_journal_context_json(p_journal),
  'journal',jsonb_build_object('id',p_journal,'title',v_journal.title,'description',v_journal.description,'revision',v_journal.revision),
  'captured_at',v_time,'record_count',v_n,'records',v_records);
 v_manifest_text:=v_manifest::text;v_html:=public.uc_scoped_journal_html(v_manifest);
 IF octet_length(v_manifest_text)+octet_length(v_html)>8388608 THEN PERFORM public.uc_custom_journal_error('LIMIT_EXCEEDED');END IF;
 INSERT INTO public.uc_scoped_journal_exports(id,journal_id,organization_id,record_count,manifest_text,html_text,manifest_hash,html_hash,recorded_at,recorded_by,participant_ids)
 VALUES(v_id,p_journal,p_org,v_n,v_manifest_text,v_html,public.uc_scoped_journal_text_hash(v_manifest_text),public.uc_scoped_journal_text_hash(v_html),v_time,auth.uid(),v_people);
 RETURN v_id;
END;$fn$;

CREATE FUNCTION public.apply_scoped_custom_journal_action(p_organization_id uuid,p_context jsonb,p_expected_revision bigint,p_request_id uuid,p_action jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $fn$
DECLARE v_actor uuid:=auth.uid();v_op text:=p_action->>'action';v_context jsonb;v_current_context jsonb;v_journal uuid;v_record uuid;v_subject uuid;
 v_j public.uc_custom_journals;v_s public.uc_custom_journal_schemas;v_r public.uc_scoped_journal_records;v_request public.uc_scoped_journal_requests;
 v_people uuid[];v_source_people uuid[]:='{}';v_current_people uuid[];v_person uuid;v_fields jsonb;v_schema_id uuid;v_reason text:='';v_payload_hash text;
 v_receipt jsonb;v_revision bigint;v_outcome text:='applied';v_export uuid;v_label text;v_new_source jsonb;v_old_record jsonb;v_writing boolean;
BEGIN
 v_context:=public.uc_scoped_journal_context(p_organization_id,p_context);v_current_context:=v_context;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990 OR jsonb_typeof(p_action) IS DISTINCT FROM 'object' OR octet_length(p_action::text)>65536 THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 v_writing:=v_op IS DISTINCT FROM 'capture_export';
 IF NOT public.uc_scoped_journal_permission(p_organization_id,(v_context->>'group_id')::uuid,v_writing) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 IF v_op='create' THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','title','description','fields']) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 ELSE
  IF NOT public.uc_custom_journal_uuid(p_action->'journal_id') THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;v_journal:=(p_action->>'journal_id')::uuid;
  IF NOT public.uc_scoped_journal_matches(p_organization_id,p_context,v_journal) THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
  v_context:=public.uc_scoped_journal_context_json(v_journal);
  SELECT j.* INTO v_j FROM public.uc_custom_journals j WHERE j.id=v_journal AND j.organization_id=p_organization_id;
 END IF;
 IF v_op IN('create','save_schema') THEN
  IF NOT public.uc_custom_journal_text(p_action->'title',200) OR NOT public.uc_custom_journal_text(p_action->'description',2000,true) OR NOT public.uc_custom_journal_fields(p_action->'fields') THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;v_fields:=p_action->'fields';
 END IF;
 IF v_op='save_schema' THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','journal_id','title','description','fields','reason']) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 ELSIF v_op='archive_journal' THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','journal_id','archived','reason']) OR jsonb_typeof(p_action->'archived') IS DISTINCT FROM 'boolean' THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 ELSIF v_op='save_record' THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','journal_id','record_id','schema_version_id','subject','source','values','reason']) OR NOT public.uc_custom_journal_uuid(p_action->'schema_version_id') OR NOT(p_action->'record_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_action->'record_id')) OR NOT public.uc_custom_journal_text(p_action->'reason',1000,true) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  IF public.uc_custom_journal_shape(p_action->'subject',ARRAY['kind']) AND p_action->'subject'->>'kind'='none' THEN v_subject:=NULL;
  ELSIF public.uc_custom_journal_shape(p_action->'subject',ARRAY['kind','user_id']) AND p_action->'subject'->>'kind'='person' AND public.uc_custom_journal_uuid(p_action->'subject'->'user_id') THEN v_subject:=(p_action->'subject'->>'user_id')::uuid;
  ELSE PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
  v_record:=(p_action->>'record_id')::uuid;v_new_source:=p_action->'source';
 ELSIF v_op='archive_record' THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','journal_id','record_id','archived','reason']) OR NOT public.uc_custom_journal_uuid(p_action->'record_id') OR jsonb_typeof(p_action->'archived') IS DISTINCT FROM 'boolean' THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;v_record:=(p_action->>'record_id')::uuid;
 ELSIF v_op='capture_export' THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['action','journal_id']) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 ELSIF v_op<>'create' THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 IF v_record IS NOT NULL THEN
  SELECT r.* INTO v_r FROM public.uc_scoped_journal_records r WHERE r.id=v_record AND r.journal_id=v_journal AND r.organization_id=p_organization_id;
  IF NOT FOUND THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
  IF v_op='save_record' AND(v_subject IS DISTINCT FROM v_r.subject_user_id OR v_new_source IS DISTINCT FROM v_r.source) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;v_subject:=v_r.subject_user_id;
 END IF;
 IF v_op IN('save_schema','archive_journal','archive_record') OR(v_op='save_record' AND v_record IS NOT NULL) THEN
  IF NOT public.uc_custom_journal_text(p_action->'reason',1000) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
 END IF;v_reason:=coalesce(p_action->>'reason','');
 v_payload_hash:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'context',p_context,'expected_revision',p_expected_revision,'action',p_action));
 SELECT request_row.* INTO v_request FROM public.uc_scoped_journal_requests request_row WHERE request_row.actor_id=v_actor AND request_row.request_id=p_request_id;
 IF v_request.actor_id IS NOT NULL AND(v_request.organization_id<>p_organization_id OR v_request.payload_hash<>v_payload_hash) THEN PERFORM public.uc_custom_journal_error('REQUEST_CONFLICT');END IF;
 IF v_request.actor_id IS NULL AND v_op='save_record' AND v_subject IS NOT NULL AND NOT public.uc_scoped_journal_subject(p_organization_id,v_context,v_subject) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 IF v_request.actor_id IS NULL AND v_op='save_record' THEN v_source_people:=public.uc_scoped_journal_source(p_organization_id,v_context,v_subject,v_new_source);END IF;
 IF v_request.actor_id IS NOT NULL THEN
  v_source_people:=coalesce(public.uc_scoped_journal_head_people(v_request.journal_id),'{}');
  IF v_op IN('save_record','archive_record') THEN
   SELECT r.participant_ids||ARRAY[r.recorded_by,r.created_by,r.subject_user_id,s.created_by] INTO v_current_people FROM public.uc_scoped_journal_records r JOIN public.uc_custom_journal_schemas s ON s.id=r.schema_version_id WHERE r.id=(v_request.receipt->>'entity_id')::uuid AND r.journal_id=v_request.journal_id;
   IF NOT FOUND THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
   v_source_people:=v_source_people||coalesce(v_current_people,'{}');
  ELSIF v_op='capture_export' THEN
   SELECT e.participant_ids||ARRAY[e.recorded_by] INTO v_current_people FROM public.uc_scoped_journal_exports e WHERE e.id=(v_request.receipt->>'entity_id')::uuid AND e.journal_id=v_request.journal_id;
   IF NOT FOUND THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
   v_source_people:=v_source_people||coalesce(v_current_people,'{}');
  END IF;
 END IF;
 IF v_request.actor_id IS NULL AND v_op='capture_export' THEN
  IF(SELECT count(*) FROM public.uc_scoped_journal_records record_row WHERE record_row.journal_id=v_journal)>1000 OR(SELECT count(*) FROM public.uc_scoped_journal_history history_row WHERE history_row.journal_id=v_journal)>10000 THEN PERFORM public.uc_custom_journal_error('LIMIT_EXCEEDED');END IF;
  v_source_people:=public.uc_scoped_journal_people(v_journal);
 END IF;
 SELECT coalesce(array_agg(DISTINCT person_id ORDER BY person_id) FILTER(WHERE person_id IS NOT NULL),'{}') INTO v_people FROM unnest(
  ARRAY[v_actor,v_subject,v_j.created_by,v_j.updated_by]||coalesce(v_r.participant_ids,'{}')||coalesce(v_source_people,'{}')||coalesce(v_request.participant_ids,'{}')) person_id;
 PERFORM public.uc_scoped_journal_fence(p_organization_id,(v_context->>'group_id')::uuid,v_people,p_request_id);
 IF NOT public.uc_scoped_journal_permission(p_organization_id,(v_context->>'group_id')::uuid,v_writing) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 SELECT request_row.* INTO v_request FROM public.uc_scoped_journal_requests request_row WHERE request_row.actor_id=v_actor AND request_row.request_id=p_request_id;
 IF FOUND THEN
  IF v_request.organization_id<>p_organization_id OR v_request.payload_hash<>v_payload_hash OR NOT public.uc_scoped_journal_matches(p_organization_id,p_context,v_request.journal_id) THEN PERFORM public.uc_custom_journal_error('REQUEST_CONFLICT');END IF;
  v_current_people:=public.uc_scoped_journal_head_people(v_request.journal_id);
  IF v_op IN('save_record','archive_record') THEN
   SELECT v_current_people||r.participant_ids||ARRAY[r.recorded_by,r.created_by,r.subject_user_id,s.created_by] INTO v_current_people FROM public.uc_scoped_journal_records r JOIN public.uc_custom_journal_schemas s ON s.id=r.schema_version_id WHERE r.id=(v_request.receipt->>'entity_id')::uuid AND r.journal_id=v_request.journal_id;
   IF NOT FOUND THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  ELSIF v_op='capture_export' THEN
   SELECT v_current_people||e.participant_ids||ARRAY[e.recorded_by] INTO v_current_people FROM public.uc_scoped_journal_exports e WHERE e.id=(v_request.receipt->>'entity_id')::uuid AND e.journal_id=v_request.journal_id;
   IF NOT FOUND THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(v_current_people) person_id WHERE person_id IS NOT NULL AND NOT person_id=ANY(v_people)) THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
  v_context:=public.uc_scoped_journal_context_json(v_request.journal_id);v_receipt:=v_request.receipt||jsonb_build_object('replayed',true);
  RETURN public.uc_scoped_journal_base(p_organization_id,v_context)||jsonb_build_object('receipt',v_receipt,'journal',public.uc_scoped_journal_detail(v_request.journal_id),
   'record',CASE WHEN v_op IN('save_record','archive_record') THEN public.uc_scoped_journal_record_json((v_receipt->>'entity_id')::uuid) ELSE NULL END,
   'export',CASE WHEN v_op='capture_export' THEN public.uc_scoped_journal_export_json((v_receipt->>'entity_id')::uuid) ELSE NULL END);
 END IF;
 -- Same request/entity lock order and same journal row lock for EVERY writer/export.
 IF v_op='create' THEN
  IF p_expected_revision<>0 THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
  v_context:=public.uc_scoped_journal_context(p_organization_id,p_context);
  IF v_context->>'kind'='group' AND(v_context->'program_ref'='null'::jsonb OR v_context->'course_id'='null'::jsonb) THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  v_journal:=gen_random_uuid();v_schema_id:=gen_random_uuid();v_revision:=1;
  INSERT INTO public.uc_custom_journals(id,organization_id,title,description,revision,current_schema_id,created_by,updated_by)
   VALUES(v_journal,p_organization_id,p_action->>'title',p_action->>'description',1,v_schema_id,v_actor,v_actor) RETURNING * INTO v_j;
  INSERT INTO public.uc_custom_journal_schemas(id,journal_id,organization_id,version,hash,fields,field_identities,title,description,archived,action,reason,created_by)
   VALUES(v_schema_id,v_journal,p_organization_id,1,public.uc_program_hash(v_fields),v_fields,public.uc_custom_journal_identities(v_fields),v_j.title,v_j.description,false,'create','',v_actor);
  INSERT INTO public.uc_scoped_journal_contexts(journal_id,organization_id,kind,group_id,course_id,program_ref,created_by)
   VALUES(v_journal,p_organization_id,v_context->>'kind',(v_context->>'group_id')::uuid,(v_context->>'course_id')::uuid,nullif(v_context->'program_ref','null'::jsonb),v_actor);
 ELSE
  SELECT j.* INTO v_j FROM public.uc_custom_journals j WHERE j.id=v_journal AND j.organization_id=p_organization_id FOR UPDATE NOWAIT;
  IF NOT FOUND OR NOT public.uc_scoped_journal_matches(p_organization_id,p_context,v_journal) THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
  IF v_j.redacted THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  IF(v_j.created_by IS NOT NULL AND NOT v_j.created_by=ANY(v_people)) OR(v_j.updated_by IS NOT NULL AND NOT v_j.updated_by=ANY(v_people)) THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
  v_context:=public.uc_scoped_journal_context_json(v_journal);
  v_current_context:=public.uc_scoped_journal_context(p_organization_id,p_context);
  IF v_writing AND v_context IS DISTINCT FROM v_current_context THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  SELECT schema_row.* INTO v_s FROM public.uc_custom_journal_schemas schema_row WHERE schema_row.id=v_j.current_schema_id;
  IF v_s.redacted THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
  IF v_op IN('save_schema','archive_journal','capture_export') THEN
   IF v_j.revision<>p_expected_revision THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
   IF v_op='capture_export' THEN
    v_export:=public.uc_scoped_journal_capture(p_organization_id,v_journal,v_people);v_revision:=v_j.revision;
   ELSE
    IF v_op='save_schema' AND v_j.archived THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
    IF v_op='save_schema' AND EXISTS(SELECT 1 FROM public.uc_custom_journal_schemas old_schema CROSS JOIN LATERAL jsonb_array_elements(v_fields) new_field WHERE old_schema.journal_id=v_journal AND old_schema.field_identities?(new_field->>'id') AND old_schema.field_identities->>(new_field->>'id')<>public.uc_program_hash(new_field-'label')) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
    IF v_op='archive_journal' AND v_j.archived=(p_action->>'archived')::boolean THEN v_outcome:='unchanged';v_revision:=v_j.revision;
    ELSE
     v_schema_id:=gen_random_uuid();v_revision:=v_j.revision+1;
     INSERT INTO public.uc_custom_journal_schemas(id,journal_id,organization_id,version,hash,fields,field_identities,title,description,archived,action,reason,created_by)
      VALUES(v_schema_id,v_journal,p_organization_id,v_revision,public.uc_program_hash(CASE WHEN v_op='save_schema' THEN v_fields ELSE v_s.fields END),CASE WHEN v_op='save_schema' THEN v_fields ELSE v_s.fields END,
       CASE WHEN v_op='save_schema' THEN public.uc_custom_journal_identities(v_fields) ELSE v_s.field_identities END,CASE WHEN v_op='save_schema' THEN p_action->>'title' ELSE v_j.title END,CASE WHEN v_op='save_schema' THEN p_action->>'description' ELSE v_j.description END,
       CASE WHEN v_op='archive_journal' THEN(p_action->>'archived')::boolean ELSE v_j.archived END,v_op,v_reason,v_actor);
     UPDATE public.uc_custom_journals SET revision=v_revision,current_schema_id=v_schema_id,title=CASE WHEN v_op='save_schema' THEN p_action->>'title' ELSE title END,description=CASE WHEN v_op='save_schema' THEN p_action->>'description' ELSE description END,archived=CASE WHEN v_op='archive_journal' THEN(p_action->>'archived')::boolean ELSE archived END,updated_by=v_actor WHERE id=v_journal;
    END IF;
   END IF;
  ELSE
   IF v_j.archived THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
   IF v_record IS NOT NULL THEN
    SELECT record_row.* INTO v_r FROM public.uc_scoped_journal_records record_row WHERE record_row.id=v_record AND record_row.journal_id=v_journal AND record_row.organization_id=p_organization_id FOR UPDATE NOWAIT;
    IF v_r.revision<>p_expected_revision THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
    IF v_r.redacted THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
    IF EXISTS(SELECT 1 FROM unnest(v_r.participant_ids) person_id WHERE NOT person_id=ANY(v_people)) THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
    IF v_op='save_record' AND(v_r.subject_user_id IS DISTINCT FROM v_subject OR v_r.source IS DISTINCT FROM v_new_source) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
   ELSIF p_expected_revision<>0 THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
   IF v_op='save_record' THEN
    IF v_r.archived OR(p_action->>'schema_version_id')::uuid<>v_j.current_schema_id THEN PERFORM public.uc_custom_journal_error('SOURCE_UNAVAILABLE');END IF;
    IF NOT public.uc_custom_journal_values(v_s.fields,p_action->'values') THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
    IF v_subject IS NOT NULL AND NOT public.uc_scoped_journal_subject(p_organization_id,v_context,v_subject) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
    IF v_subject IS NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_s.fields) field_item WHERE field_item->>'semantic' IN('full_name','phone','email','position','signature')) THEN PERFORM public.uc_custom_journal_error('INVALID_INPUT');END IF;
    v_current_people:=public.uc_scoped_journal_source(p_organization_id,v_context,v_subject,v_new_source);
    IF EXISTS(SELECT 1 FROM unnest(v_current_people) person_id WHERE NOT person_id=ANY(v_people)) THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');END IF;
    IF v_record IS NULL THEN
     v_record:=gen_random_uuid();v_revision:=1;
     IF v_subject IS NOT NULL THEN SELECT left(coalesce(nullif(p.full_name,''),'Пользователь '||left(v_subject::text,8)),120) INTO v_label FROM public.profiles p WHERE p.user_id=v_subject;v_label:=coalesce(v_label,'Пользователь '||left(v_subject::text,8));END IF;
     INSERT INTO public.uc_scoped_journal_records(id,journal_id,organization_id,schema_version_id,subject_user_id,subject_label,source,revision,field_values,recorded_by,created_by,participant_ids)
      VALUES(v_record,v_journal,p_organization_id,v_s.id,v_subject,v_label,v_new_source,1,p_action->'values',v_actor,v_actor,v_people) RETURNING * INTO v_r;
    ELSE
     v_revision:=v_r.revision+1;
     UPDATE public.uc_scoped_journal_records SET revision=v_revision,schema_version_id=v_s.id,field_values=p_action->'values',recorded_at=clock_timestamp(),recorded_by=v_actor,participant_ids=v_people WHERE id=v_record RETURNING * INTO v_r;
    END IF;
   ELSE
    IF v_r.archived=(p_action->>'archived')::boolean THEN v_outcome:='unchanged';v_revision:=v_r.revision;
    ELSE v_revision:=v_r.revision+1;UPDATE public.uc_scoped_journal_records SET revision=v_revision,archived=(p_action->>'archived')::boolean,recorded_at=clock_timestamp(),recorded_by=v_actor,participant_ids=v_people WHERE id=v_record RETURNING * INTO v_r;END IF;
   END IF;
   IF v_outcome='applied' THEN INSERT INTO public.uc_scoped_journal_history(record_id,journal_id,organization_id,schema_version_id,revision,action,reason,field_values,subject_user_id,subject_label,source,archived,recorded_at,recorded_by,participant_ids)
    VALUES(v_record,v_journal,p_organization_id,v_r.schema_version_id,v_r.revision,v_op,v_reason,v_r.field_values,v_r.subject_user_id,v_r.subject_label,v_r.source,v_r.archived,v_r.recorded_at,v_actor,v_r.participant_ids);END IF;
  END IF;
 END IF;
 v_receipt:=jsonb_build_object('request_id',p_request_id,'action',v_op,'journal_id',v_journal,'entity_id',coalesce(v_export,v_record,v_journal),'revision_applied',v_revision,'outcome',v_outcome,'replayed',false);
 INSERT INTO public.uc_scoped_journal_requests(actor_id,request_id,organization_id,journal_id,payload_hash,receipt,participant_ids) VALUES(v_actor,p_request_id,p_organization_id,v_journal,v_payload_hash,v_receipt,v_people);
 RETURN public.uc_scoped_journal_base(p_organization_id,v_context)||jsonb_build_object('receipt',v_receipt,'journal',public.uc_scoped_journal_detail(v_journal),'record',public.uc_scoped_journal_record_json(v_record),'export',public.uc_scoped_journal_export_json(v_export));
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_custom_journal_error('REVISION_CONFLICT');RETURN NULL;END;$fn$;

CREATE FUNCTION public.uc_scoped_journal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_erased uuid:=nullif(current_setting('sintagma.account_deletion_erase_user',true),'')::uuid;v_old jsonb;
BEGIN
 v_old:=to_jsonb(OLD);
 IF auth.role()='service_role' AND v_erased IS NOT NULL AND EXISTS(SELECT 1 FROM public.account_deletion_revocations rev WHERE rev.user_id=v_erased)
  AND(v_old->>'created_by'=v_erased::text OR v_old->>'recorded_by'=v_erased::text OR v_old->>'actor_id'=v_erased::text OR v_old->>'subject_user_id'=v_erased::text OR coalesce(v_old->'participant_ids','[]'::jsonb) ? v_erased::text)
 THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END IF;
 IF TG_OP='DELETE' OR TG_TABLE_NAME<>'uc_scoped_journal_records' THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 IF NEW.revision<>OLD.revision+1 OR(to_jsonb(OLD)-ARRAY['revision','schema_version_id','field_values','archived','recorded_at','recorded_by','participant_ids']) IS DISTINCT FROM(to_jsonb(NEW)-ARRAY['revision','schema_version_id','field_values','archived','recorded_at','recorded_by','participant_ids']) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 RETURN NEW;
END;$fn$;
DO $immutable$
DECLARE v_table text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['uc_scoped_journal_contexts','uc_scoped_journal_records','uc_scoped_journal_history','uc_scoped_journal_requests','uc_scoped_journal_exports'] LOOP
  EXECUTE format('CREATE TRIGGER uc_scoped_journal_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_scoped_journal_guard()',v_table);
 END LOOP;
END;$immutable$;
CREATE FUNCTION public.uc_scoped_journal_personal_counts(p_user uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',count_row.table_name,'column',count_row.column_name,'count',count_row.n) ORDER BY count_row.table_name),'[]'::jsonb) FROM(
  SELECT 'uc_scoped_journal_contexts'::text table_name,'created_by'::text column_name,count(*) n FROM public.uc_scoped_journal_contexts c WHERE c.created_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_records','participant_ids',count(*) FROM public.uc_scoped_journal_records r WHERE p_user=ANY(r.participant_ids) OR r.subject_user_id=p_user OR r.recorded_by=p_user OR r.created_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_history','participant_ids',count(*) FROM public.uc_scoped_journal_history h WHERE p_user=ANY(h.participant_ids) OR h.subject_user_id=p_user OR h.recorded_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_requests','participant_ids',count(*) FROM public.uc_scoped_journal_requests request_row WHERE p_user=ANY(request_row.participant_ids) OR request_row.actor_id=p_user
  UNION ALL SELECT 'uc_scoped_journal_exports','participant_ids',count(*) FROM public.uc_scoped_journal_exports e WHERE p_user=ANY(e.participant_ids) OR e.recorded_by=p_user
 ) count_row WHERE count_row.n>0
$fn$;
CREATE FUNCTION public.uc_scoped_journal_erase_user(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR current_setting('sintagma.account_deletion_erase_user',true) IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations rev WHERE rev.user_id=p_user) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
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
 IF public.uc_scoped_journal_personal_counts(p_user)<>'[]'::jsonb THEN PERFORM public.uc_custom_journal_error('DEPENDENCY_UNAVAILABLE');END IF;
END;$fn$;

-- Preserve all existing function OIDs, ABI, owners, ACLs and settings. Only the
-- four reviewed bodies change; old organization/legacy contracts stay version 1.
DO $v1_and_privacy_bridge$
DECLARE v_signature text;v_before jsonb;v_definition text;v_body text;v_needle text;v_after jsonb;v_pin record;
BEGIN
 FOR v_pin IN SELECT * FROM(VALUES
  ('public.read_custom_journals(uuid,jsonb)','8248952395b32a29d9fb336ba39541ee'),
  ('public.apply_custom_journal_action(uuid,bigint,uuid,jsonb)','c0340558fd14a5bb96ef0f413d46ff6c'),
  ('public.uc_custom_journal_personal_counts(uuid)','f0ac6ef8aeae4a9393c85ac0bc36d69e'),
  ('public.uc_custom_journal_erase_user(uuid)','c9b33cea7efed79bc6948568234187da')
 ) pins(signature,body_md5) LOOP
  SELECT to_jsonb(p),pg_get_functiondef(p.oid),p.prosrc INTO v_before,v_definition,v_body FROM pg_proc p WHERE p.oid=to_regprocedure(v_pin.signature);
  IF md5(v_body)<>v_pin.body_md5 THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_UNREVIEWED_PREDECESSOR %',v_pin.signature;END IF;
  IF v_pin.signature='public.read_custom_journals(uuid,jsonb)' THEN
   v_needle:=$old$base:=public.uc_custom_journal_base(p_organization_id)||jsonb_build_object('kind',kind);$old$;
   IF(length(v_definition)-length(replace(v_definition,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_BRIDGE_ANCHOR';END IF;
   v_definition:=replace(v_definition,v_needle,v_needle||$new$
 IF public.uc_custom_journal_uuid(p_query->'journal_id') THEN
  IF EXISTS(SELECT 1 FROM public.uc_scoped_journal_contexts scoped_context WHERE scoped_context.journal_id=(p_query->>'journal_id')::uuid) THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
 END IF;$new$);
   v_needle:=$old$FOR rec IN SELECT id FROM public.uc_custom_journals WHERE organization_id=p_organization_id AND(after_id IS NULL OR id>after_id)$old$;
   IF(length(v_definition)-length(replace(v_definition,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_BRIDGE_ANCHOR';END IF;
   v_definition:=replace(v_definition,v_needle,$new$FOR rec IN SELECT id FROM public.uc_custom_journals WHERE organization_id=p_organization_id AND NOT EXISTS(SELECT 1 FROM public.uc_scoped_journal_contexts scoped_context WHERE scoped_context.journal_id=public.uc_custom_journals.id) AND(after_id IS NULL OR id>after_id)$new$);
  ELSIF v_pin.signature='public.apply_custom_journal_action(uuid,bigint,uuid,jsonb)' THEN
   v_needle:=$old$IF op='create'THEN$old$;
   IF(length(v_definition)-length(replace(v_definition,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_BRIDGE_ANCHOR';END IF;
   v_definition:=replace(v_definition,v_needle,$new$IF public.uc_custom_journal_uuid(p_action->'journal_id') THEN
  IF EXISTS(SELECT 1 FROM public.uc_scoped_journal_contexts scoped_context WHERE scoped_context.journal_id=(p_action->>'journal_id')::uuid) THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
 END IF;
 IF op='create'THEN$new$);
   v_needle:=$old$IF oldreq.payload_hash<>payload_hash OR oldreq.organization_id<>p_organization_id THEN$old$;
   IF(length(v_definition)-length(replace(v_definition,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_BRIDGE_ANCHOR';END IF;
   v_definition:=replace(v_definition,v_needle,$new$IF EXISTS(SELECT 1 FROM public.uc_scoped_journal_contexts scoped_context WHERE scoped_context.journal_id=oldreq.journal_id) THEN PERFORM public.uc_custom_journal_error('NOT_FOUND');END IF;
   IF oldreq.payload_hash<>payload_hash OR oldreq.organization_id<>p_organization_id THEN$new$);
  ELSIF v_pin.signature='public.uc_custom_journal_personal_counts(uuid)' THEN
   v_needle:=$old$RETURN result;$old$;
   IF(length(v_definition)-length(replace(v_definition,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_BRIDGE_ANCHOR';END IF;
   v_definition:=replace(v_definition,v_needle,$new$result:=result||public.uc_scoped_journal_personal_counts(p_user);RETURN result;$new$);
  ELSE
   v_needle:=$old$DELETE FROM public.uc_custom_journal_requests WHERE actor_id=p_user OR subject_user_id=p_user;$old$;
   IF(length(v_definition)-length(replace(v_definition,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_BRIDGE_ANCHOR';END IF;
   v_definition:=replace(v_definition,v_needle,$new$PERFORM public.uc_scoped_journal_erase_user(p_user);
 DELETE FROM public.uc_custom_journal_requests WHERE actor_id=p_user OR subject_user_id=p_user;$new$);
  END IF;
  EXECUTE v_definition;
  SELECT to_jsonb(p) INTO v_after FROM pg_proc p WHERE p.oid=to_regprocedure(v_pin.signature);
  IF(v_before-'prosrc') IS DISTINCT FROM(v_after-'prosrc') OR v_before->>'prosrc'=v_after->>'prosrc' THEN RAISE EXCEPTION 'CUSTOM_JOURNAL_BRIDGE_METADATA_CHANGED %',v_pin.signature;END IF;
 END LOOP;
END;$v1_and_privacy_bridge$;
DO $private_functions$
DECLARE v_function record;v_grant record;
BEGIN
 FOR v_function IN SELECT p.oid,p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND(left(p.proname,18)='uc_scoped_journal_' OR p.proname IN('read_scoped_custom_journals','apply_scoped_custom_journal_action')) LOOP
  FOR v_grant IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=v_function.oid AND a.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s CASCADE',v_function.signature,CASE WHEN v_grant.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_grant.grantee)) END);
  END LOOP;
 END LOOP;
END;$private_functions$;
GRANT EXECUTE ON FUNCTION public.read_scoped_custom_journals(uuid,jsonb,jsonb),public.apply_scoped_custom_journal_action(uuid,jsonb,bigint,uuid,jsonb) TO authenticated;
