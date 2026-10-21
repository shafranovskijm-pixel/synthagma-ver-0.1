-- UC013 / release116. Prospective group facts; no inferred legacy dates.
-- Historical100..115 sources are unchanged. All new data is private.
DO $pre$
BEGIN
 IF to_regclass('public.uc_group_education_states')IS NOT NULL
 OR to_regprocedure('public.read_group_education_facts(uuid,uuid,jsonb)')IS NOT NULL
 THEN RAISE EXCEPTION 'uc116_already_installed' USING ERRCODE='55000';END IF;
 IF to_regprocedure('public.uc_admission_actor_allowed(uuid,boolean)')IS NULL
 OR to_regprocedure('public.uc_program_file_proof(uuid,uuid)')IS NULL
 OR to_regclass('public.student_group_memberships_effective')IS NULL
 THEN RAISE EXCEPTION 'uc116_source_baseline_unavailable' USING ERRCODE='55000';END IF;
END;$pre$;
DO $dependencies$DECLARE r record;BEGIN FOR r IN SELECT * FROM(VALUES
('account_deletion_erase_data(uuid,text)','725f8d0d90273d393989e39f10c176b4'),
('account_deletion_personal_row_counts(uuid)','6213c0e6f96a92f65e081976af522e74'),
('account_deletion_snapshot(uuid)','7238852e3da99d7b769e61d65a95dccb'),
('account_deletion_subject_write_guard()','cd0003cc49bdf9a3d074c9e624146e46'),
('add_students_to_groups(uuid,uuid[],uuid[])','940699229d4830d7a94f7415453b9f07'),
('auto_create_education_document()','b8cde9babf27dd691f78ce356319e47f'),
('bump_enrollment_document_facts_revision()','fca7f23c0d51b0a4c03a757fc898e2e6'),
('calc_enrollment_expires_at()','99c246e392e7b56a4ae73670ce4146f0'),
('capture_postpaid_study_activity()','c69b9d7d8134bdad13d9e368fdc37896'),
('create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text)','09cc562cc19c7c4d37811e478d4f5a46'),
('csz_guard_course_anchor()','d1af520e0ab22028a45791f4cc2687a3'),
('csz_guard_enrollment()','292b6f3a1e462bd6a2e45689bfc22436'),
('csz_guard_protected_truncate()','482a80e76e9fbd143c2fe367e7776683'),
('enforce_course_insert_limit()','22d2cf4e62324fbef5aaba41cfb9b443'),
('get_organization_student_capacity(uuid,integer)','c6e3e7c0f7f83044069811acb15dd39a'),
('guard_profile_tenant_identity()','20dd578b4211496f92a32ccaac4c8d60'),
('sync_group_course_enrollments()','97b3ba66ec588a9fa3d77bcd25f57f7a'),
('sync_profile_group_course_enrollment()','3608c6747572c6a98830b62cfb5b4238'),
('uc_capture_enrollment_delete_parent()','92daddb33e07e4f417504fd9d0c6e2c1'),
('uc_capture_identification_cascade()','4e22445a20d9aa9896274e49278aa83d'),
('uc_capture_program_association_event()','2ce633cf62c224ab8cb15171b799d2d3'),
('uc_cleanup_enrollment_delete_parent()','589f4dc53bb5bc97130736622025441a'),
('uc_cleanup_identification_cascade()','2daf4332809b103b3499ae752e2b569f'),
('uc_guard_admission_org_delete()','86846ea9cada0d382aae0f0236b52f2a'),
('uc_guard_bound_program_group()','fb1210ed77d70500a78ce06cfe72a97f'),
('uc_guard_enrollment_delete()','b81522835dc5b307d084fcf4006a2830'),
('uc_guard_program_artifact()','eb7789a817440fd1ecadbbdec4f0f2a6'),
('uc_guard_program_history()','43ac0a680636b00151d064691eda14ea')
)AS p(signature,definition_md5)LOOP IF to_regprocedure('public.'||r.signature)IS NULL OR md5(pg_get_functiondef(to_regprocedure('public.'||r.signature)))<>r.definition_md5 THEN RAISE EXCEPTION 'uc116_exact_dependency_unavailable %',r.signature USING ERRCODE='55000';END IF;END LOOP;END;$dependencies$;
CREATE TEMP TABLE uc116_function_oids_before ON COMMIT DROP AS SELECT oid FROM pg_proc;

CREATE TABLE public.uc_group_education_states(
 organization_id uuid NOT NULL,group_id uuid PRIMARY KEY,course_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 coverage_known_from timestamptz NOT NULL,timezone text NOT NULL,program_ref jsonb NOT NULL,program_proof jsonb NOT NULL,
 draft_calendar_id uuid,published_calendar_id uuid,legacy_calendar_changed boolean NOT NULL DEFAULT false,
 legacy_source_hash text NOT NULL,coverage_segment_id uuid,active_gap jsonb,
 source_rows jsonb,source_redacted boolean NOT NULL DEFAULT false,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),recorded_by uuid,
 UNIQUE(organization_id,group_id,course_id),CHECK(source_rows IS NULL OR jsonb_typeof(source_rows)='array')
);
CREATE TABLE public.uc_group_education_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,group_id uuid NOT NULL,course_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),action text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),effective_at timestamptz,actor_id uuid,origin text NOT NULL,
 reason text,subject_user_id uuid,source_event_id uuid,calendar_version_id uuid,snapshot_id uuid,
 input_hash text NOT NULL,authority_snapshot jsonb NOT NULL,authority_snapshot_hash text NOT NULL,payload jsonb NOT NULL,
 source_snapshot jsonb,source_snapshot_hash text,previous_row jsonb,next_row jsonb,source_receipt_id uuid,redacted boolean NOT NULL DEFAULT false,
 UNIQUE(group_id,revision),CHECK(origin IN('authenticated','system','service'))
);
CREATE TABLE public.uc_group_calendar_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,group_id uuid NOT NULL,course_id uuid NOT NULL,
 revision_created bigint NOT NULL CHECK(revision_created BETWEEN 1 AND 9007199254740991),
 base_version_id uuid,timezone text NOT NULL,planned_start_date date NOT NULL,planned_end_date date NOT NULL,
 coverage text NOT NULL CHECK(coverage IN('whole_program','partial_plan')),partial_reason text,program_ref jsonb NOT NULL,
 lessons jsonb NOT NULL CHECK(jsonb_typeof(lessons)='array'AND jsonb_array_length(lessons)<=250),
 known_academic_hours_total numeric(16,2) NOT NULL CHECK(known_academic_hours_total>=0),missing_hours_count integer NOT NULL CHECK(missing_hours_count BETWEEN 0 AND 250),
 content_hash text NOT NULL,content jsonb NOT NULL,teacher_proofs jsonb NOT NULL DEFAULT'[]',recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),recorded_by uuid,
 published_at timestamptz,published_by uuid,redacted boolean NOT NULL DEFAULT false,
 CHECK(planned_start_date<=planned_end_date)
);
CREATE TABLE public.uc_group_roster_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,group_id uuid NOT NULL,course_id uuid NOT NULL,
 as_of timestamptz NOT NULL,timezone text NOT NULL,knowledge_revision bigint NOT NULL,coverage_segment_id uuid NOT NULL,coverage_known_from timestamptz NOT NULL,
 calendar_version_id uuid NOT NULL,calendar_hash text NOT NULL,program_ref jsonb NOT NULL,program_proof jsonb NOT NULL,
 roster_rows jsonb NOT NULL CHECK(jsonb_typeof(roster_rows)='array'AND jsonb_array_length(roster_rows)<=1000),
 roster_hash text NOT NULL,source_hash text NOT NULL,source_input jsonb,row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 1000),
 purpose text NOT NULL CHECK(purpose IN('document_batch','lesson_roster','assessment_draft')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),recorded_by uuid,redacted boolean NOT NULL DEFAULT false
);
CREATE TABLE public.uc_group_education_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),row_kind text NOT NULL,
 organization_id uuid,group_id uuid,course_id uuid,actor_id uuid,request_id uuid,action text,expected_revision bigint,input_hash text,body jsonb,receipt jsonb,
 backend_pid integer,full_transaction_id text,context jsonb,
 subject_ids uuid[] NOT NULL DEFAULT '{}',actor_ids uuid[] NOT NULL DEFAULT '{}',teacher_ids uuid[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(row_kind IN('command','source_pending','source_parent','erase_context','source_transaction_receipt','source_transaction_budget','public_operation','source_detail')),
 CHECK((row_kind='command'AND actor_id IS NOT NULL AND request_id IS NOT NULL AND body IS NOT NULL)OR(row_kind<>'command'AND backend_pid IS NOT NULL AND full_transaction_id IS NOT NULL AND context IS NOT NULL)),
 CHECK(row_kind<>'source_parent'OR(action IS NOT NULL AND action IN('profiles','student_groups','courses','organizations')AND request_id IS NOT NULL AND context->>'parent_table'IS NOT NULL AND context->>'parent_id'IS NOT NULL AND action=context->>'parent_table'AND request_id::text=context->>'parent_id')),
 CHECK(row_kind<>'source_detail'OR(organization_id IS NOT NULL AND group_id IS NOT NULL AND course_id IS NOT NULL AND backend_pid>0 AND full_transaction_id~'^[1-9][0-9]{0,19}$'AND request_id IS NOT NULL AND actor_id IS NULL AND action IS NULL AND expected_revision IS NULL AND input_hash IS NULL AND body IS NULL AND receipt IS NULL AND subject_ids=ARRAY[request_id]AND actor_ids='{}'AND teacher_ids='{}'AND jsonb_typeof(context)='object'AND context?&ARRAY['schema_version','subject_user_id','detail']AND context-ARRAY['schema_version','subject_user_id','detail']='{}'AND context->'schema_version'='1'AND context->>'subject_user_id'=request_id::text AND jsonb_typeof(context->'detail')='object'AND(context->'detail')?&ARRAY['first_before','membership_source','association_source','last_contributor_index']AND(context->'detail')-ARRAY['first_before','membership_source','association_source','last_contributor_index']='{}'AND(context->'detail'->'first_before'='null'OR jsonb_typeof(context->'detail'->'first_before')='object'AND context->'detail'->'first_before'->>'user_id'=request_id::text)AND(context->'detail'->'membership_source'='null'OR context->'detail'->>'membership_source'IN('primary','additional','profile_archive','registration','group_lifecycle'))AND(context->'detail'->'association_source'='null'OR context->'detail'->>'association_source'IN('enrollment','program_association'))AND(context->'detail'->'last_contributor_index'='null'OR jsonb_typeof(context->'detail'->'last_contributor_index')='number'AND context->'detail'->>'last_contributor_index'~'^(0|[1-9]|[12][0-9]|3[01])$'))IS TRUE)
);
CREATE UNIQUE INDEX uc_group_education_command_request ON public.uc_group_education_requests(actor_id,request_id)WHERE row_kind='command';
CREATE UNIQUE INDEX uc_group_education_transaction_group ON public.uc_group_education_requests(row_kind,backend_pid,full_transaction_id,group_id)WHERE row_kind IN('source_pending','source_transaction_receipt','public_operation','erase_context');
CREATE UNIQUE INDEX uc_group_education_transaction_budget ON public.uc_group_education_requests(backend_pid,full_transaction_id)WHERE row_kind='source_transaction_budget';
-- Direct identity columns keep unrelated budget/context updates HOT-eligible;
-- the CHECK above binds them to the unchanged private JSON parent witness.
CREATE UNIQUE INDEX uc_group_education_source_parent ON public.uc_group_education_requests(backend_pid,full_transaction_id,action,request_id)WHERE row_kind='source_parent';
CREATE UNIQUE INDEX uc_group_education_source_detail ON public.uc_group_education_requests(backend_pid,full_transaction_id,group_id,request_id)WHERE row_kind='source_detail';
CREATE INDEX uc_group_education_events_subject ON public.uc_group_education_events(subject_user_id);
CREATE INDEX uc_group_education_events_actor ON public.uc_group_education_events(actor_id);
CREATE INDEX uc_group_education_events_receipt ON public.uc_group_education_events(source_receipt_id);
CREATE INDEX uc_group_education_requests_subjects ON public.uc_group_education_requests USING gin(subject_ids);
CREATE INDEX uc_group_education_requests_actors ON public.uc_group_education_requests USING gin(actor_ids);
CREATE INDEX uc_group_education_requests_teachers ON public.uc_group_education_requests USING gin(teacher_ids);
CREATE INDEX uc_group_education_calendar_teachers ON public.uc_group_calendar_versions USING gin(lessons jsonb_path_ops);
CREATE INDEX uc_group_education_snapshot_subjects ON public.uc_group_roster_snapshots USING gin(roster_rows jsonb_path_ops);
DO $rls$
DECLARE t text;
BEGIN FOREACH t IN ARRAY ARRAY['uc_group_education_states','uc_group_education_events','uc_group_calendar_versions','uc_group_roster_snapshots','uc_group_education_requests']LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
END LOOP;END;$rls$;

CREATE FUNCTION public.uc_group_education_error(p_code text)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'GROUP_FACTS_%',p_code USING ERRCODE=CASE p_code WHEN'ACCESS_DENIED'THEN'42501'WHEN'INVALID_INPUT'THEN'22023'WHEN'REVISION_CONFLICT'THEN'40001'WHEN'SOURCE_CHANGED'THEN'40001'ELSE'P0001'END;END;$fn$;
CREATE FUNCTION public.uc_group_education_scope(p_org uuid,p_group uuid,p_course uuid)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('organization_id',p_org,'group_id',p_group,'course_id',p_course)
$fn$;
CREATE FUNCTION public.uc_group_education_count(p_n integer,p_complete boolean DEFAULT true)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('exact_count',CASE WHEN p_complete AND p_n<=1000 THEN greatest(p_n,0)END,'count_lower_bound',least(greatest(p_n,0),1001))
$fn$;
CREATE FUNCTION public.uc_group_education_prerequisite(p_code text,p_target text DEFAULT'history',p_lesson uuid DEFAULT NULL)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('code',p_code,'label',CASE p_code WHEN'HISTORY_NOT_INITIALIZED'THEN'История состава ещё не начата'WHEN'NO_GROUP_COURSE'THEN'Укажите курс группы'WHEN'NO_UC111_BINDING'THEN'Подтвердите программу группы'WHEN'PROGRAM_SOURCE_UNAVAILABLE'THEN'Точный источник программы недоступен'WHEN'COVERAGE_GAP'THEN'В истории есть неподтверждённый период'WHEN'ROSTER_LIMIT_EXCEEDED'THEN'Подтверждённый состав превышает допустимый объём'WHEN'HISTORY_REVISION_CAPACITY'THEN'Доступная ёмкость истории исчерпана'WHEN'SOURCE_ERASED'THEN'Источник недоступен после удаления персональных данных'WHEN'LEGACY_HISTORY_UNKNOWN'THEN'Состав до начала наблюдения неизвестен'WHEN'TEACHER_REQUIRED'THEN'Назначьте преподавателя занятия'WHEN'HOURS_REQUIRED'THEN'Укажите академические часы'WHEN'PLAN_PARTIAL'THEN'План охватывает часть программы'WHEN'LEGACY_SOURCE_CHANGED'THEN'Исходные настройки изменились; проверьте план'WHEN'LEGACY_DISPLAY_UNAVAILABLE'THEN'Прежние настройки недоступны для показа'WHEN'DISPLAY_LABEL_UNAVAILABLE'THEN'Отображаемое имя недоступно'ELSE'Требуется проверка источника'END,'target',p_target,'lesson_id',p_lesson)
$fn$;
CREATE FUNCTION public.uc_group_education_actor_allowed(p_actor uuid,p_org uuid,p_group uuid,p_write boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_admission_actor_allowed(p_actor,p_write)
 AND EXISTS(SELECT 1 FROM public.student_groups g LEFT JOIN public.courses c ON c.id=g.course_id WHERE g.id=p_group AND g.organization_id=p_org AND(g.course_id IS NULL OR c.organization_id=p_org))
 AND(public.has_role(p_actor,'admin'::public.app_role)OR public.is_org_owner(p_actor,p_org)
 OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org AND(s.expires_at IS NULL OR s.expires_at>now())
 AND public.has_org_staff_permission(p_actor,p_org,CASE WHEN p_write THEN'students.write'ELSE'students.read'END)
 AND public.has_org_staff_permission(p_actor,p_org,CASE WHEN p_write THEN'documents.write'ELSE'documents.read'END)
 AND(s.role<>'teacher'OR(EXISTS(SELECT 1 FROM public.org_staff_document_groups x WHERE x.staff_id=s.id AND x.organization_id=p_org AND x.group_id=p_group)
 AND(NOT p_write OR s.sections_access ?& ARRAY['students.write','documents.write']))))),false)
$fn$;
CREATE FUNCTION public.uc_group_education_teacher_allowed(p_teacher uuid,p_org uuid,p_group uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_admission_actor_allowed(p_teacher,false)AND EXISTS(SELECT 1 FROM public.org_staff s JOIN public.org_staff_document_groups a ON a.staff_id=s.id AND a.organization_id=s.organization_id WHERE s.user_id=p_teacher AND s.organization_id=p_org AND s.role='teacher'AND(s.expires_at IS NULL OR s.expires_at>now())AND a.group_id=p_group)
 AND public.has_org_staff_permission(p_teacher,p_org,'students.read')AND public.has_org_staff_permission(p_teacher,p_org,'documents.read'),false)
$fn$;
CREATE FUNCTION public.uc_group_education_program(p_org uuid,p_group uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE b public.group_program_bindings;v jsonb;
BEGIN SELECT b0.* INTO b FROM public.group_program_bindings b0 JOIN public.student_groups g ON g.id=b0.group_id AND g.organization_id=b0.organization_id AND g.course_id=b0.course_id WHERE b0.organization_id=p_org AND b0.group_id=p_group;
 IF b.id IS NULL OR NOT public.uc_program_file_proof(p_org,(b.program_snapshot->>'file_version_id')::uuid)THEN RETURN NULL;END IF;
 v:=b.program_snapshot;RETURN jsonb_build_object('binding_id',b.id,'binding_revision',b.revision,'program_id',b.program_id,'version_id',b.version_id,'binding_snapshot_hash',b.snapshot_hash,'file_document_id',v->'file_document_id','file_version_id',v->'file_version_id','file_review_id',v->'file_review_id','facts_hash',v->'facts_hash');END;$fn$;
CREATE FUNCTION public.uc_group_education_program_proof(p_org uuid,p_group uuid,p_ref jsonb,p_snapshot_ids uuid[])RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE b public.group_program_bindings;v jsonb;
BEGIN SELECT * INTO b FROM public.group_program_bindings WHERE id=(p_ref->>'binding_id')::uuid AND organization_id=p_org AND group_id=p_group AND revision=(p_ref->>'binding_revision')::bigint AND snapshot_hash=p_ref->>'binding_snapshot_hash';
 IF b.id IS NULL OR public.uc_group_education_program(p_org,p_group)IS DISTINCT FROM p_ref THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 v:=b.program_snapshot;RETURN jsonb_build_object('schema_version',1,'state','confirmed','organization_id',p_org,'group_id',p_group,'course_id',b.course_id,'program_id',b.program_id,'version_id',b.version_id,'file_document_id',v->'file_document_id','file_version_id',v->'file_version_id','file_review_id',v->'file_review_id','facts_hash',v->'facts_hash','binding_id',b.id,'binding_revision',b.revision,'binding_snapshot_hash',b.snapshot_hash,'enrollment_snapshot_ids',to_jsonb(coalesce(p_snapshot_ids,'{}'::uuid[])),'facts_snapshot',v->'facts','group_snapshot',b.group_snapshot);END;$fn$;
CREATE FUNCTION public.uc_group_education_legacy(p_group uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g jsonb;dates jsonb;
BEGIN SELECT to_jsonb(x)INTO g FROM public.student_groups x WHERE id=p_group;IF g IS NULL THEN RETURN NULL;END IF;dates:=g->'training_dates';
 IF length(coalesce(g->>'schedule_text',''))>4000 OR length(coalesce(g->>'instructor_name',''))>1000 OR(jsonb_typeof(dates)='array'AND jsonb_array_length(dates)>250)THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('source','legacy_display','start_date',g->'start_date','end_date',g->'end_date','training_dates',CASE WHEN dates IS NULL OR dates='null'THEN'[]'::jsonb ELSE dates END,'schedule_text',g->'schedule_text','instructor_name',g->'instructor_name','source_hash',public.uc_program_hash(public.uc_program_group_calendar(p_group)));END;$fn$;
CREATE FUNCTION public.uc_group_education_own_source(p_group uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind IN('source_pending','source_transaction_receipt')AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id_if_assigned()::text)
$fn$;
CREATE FUNCTION public.uc_group_education_capabilities(p_org uuid,p_group uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 WITH a AS(SELECT public.uc_group_education_actor_allowed(auth.uid(),p_org,p_group,false)r,public.uc_group_education_actor_allowed(auth.uid(),p_org,p_group,true)w),s AS(SELECT*FROM public.uc_group_education_states WHERE group_id=p_group AND organization_id=p_org)
 SELECT jsonb_build_object('can_read',r,'can_initialize',r AND w AND NOT EXISTS(SELECT 1 FROM s),'can_correct_membership_time',r AND w AND EXISTS(SELECT 1 FROM s WHERE NOT source_redacted),'can_edit_calendar',r AND w,'can_publish_calendar',r AND w,'can_capture_snapshot',r AND w AND EXISTS(SELECT 1 FROM s WHERE active_gap IS NULL AND NOT source_redacted),'can_recover_coverage',r AND w AND EXISTS(SELECT 1 FROM s WHERE active_gap IS NOT NULL))FROM a
$fn$;

CREATE FUNCTION public.uc_group_education_scan(p_org uuid,p_group uuid,p_observed timestamptz,p_event uuid,p_base jsonb DEFAULT'[]',p_capture_all_labels boolean DEFAULT false,p_label_subjects uuid[]DEFAULT'{}')RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g public.student_groups;current_ref jsonb;r record;previous jsonb;item jsonb;label text;label_at jsonb;label_source jsonb;label_state text;result jsonb:='[]';n integer:=0;bad boolean:=false;
BEGIN SELECT * INTO g FROM public.student_groups WHERE id=p_group AND organization_id=p_org;IF NOT FOUND OR g.course_id IS NULL THEN RETURN jsonb_build_object('rows','[]'::jsonb,'count',0,'unavailable',true);END IF;current_ref:=public.uc_group_education_program(p_org,p_group);
 FOR r IN SELECT m.user_id,p.user_id profile_user,p.organization_id profile_org,p.full_name,p.archived_at,p.student_group_id,
 e.id enrollment_id,s.id snapshot_id
 FROM public.student_group_memberships_effective m LEFT JOIN public.profiles p ON p.user_id=m.user_id
 LEFT JOIN public.enrollments e ON e.user_id=m.user_id AND e.course_id=g.course_id
 LEFT JOIN public.group_program_enrollment_snapshots s ON s.user_id=m.user_id AND s.enrollment_id=e.id AND s.group_id=g.id AND s.organization_id=g.organization_id AND s.course_id=g.course_id AND s.binding_id=(current_ref->>'binding_id')::uuid AND s.binding_revision=(current_ref->>'binding_revision')::bigint AND s.snapshot_hash=current_ref->>'binding_snapshot_hash'AND s.version_id=(current_ref->>'version_id')::uuid
 WHERE m.organization_id=p_org AND m.group_id=p_group ORDER BY m.user_id LIMIT 1001 LOOP
  n:=n+1;IF n>1000 THEN EXIT;END IF;
  IF r.profile_user IS NULL OR r.profile_org IS DISTINCT FROM p_org THEN bad:=true;CONTINUE;END IF;
  SELECT x INTO previous FROM jsonb_array_elements(coalesce(p_base,'[]'))x WHERE x->>'user_id'=r.user_id::text;
  IF p_capture_all_labels OR r.user_id=ANY(p_label_subjects)THEN
   label:=nullif(public.uc_admission_trim(r.full_name),'');IF length(label)>240 THEN label:=NULL;END IF;
   label_state:=CASE WHEN label IS NULL THEN'unavailable'ELSE'available'END;label_at:=CASE WHEN label IS NOT NULL THEN to_jsonb(p_observed)ELSE'null'::jsonb END;
   label_source:=CASE WHEN label IS NOT NULL THEN jsonb_build_object('kind','authorized_current_profile','subject_user_id',r.user_id)ELSE'null'::jsonb END;
  ELSE label:=previous->>'subject_label';label_state:=coalesce(previous->>'label_state','unavailable');label_at:=coalesce(previous->'label_observed_at','null');label_source:=coalesce(previous->'label_source','null');END IF;
  item:=jsonb_build_object('user_id',r.user_id,'present',true,'archived',r.archived_at IS NOT NULL,'primary',coalesce(r.student_group_id=p_group,false),
   'additional',EXISTS(SELECT 1 FROM public.student_group_memberships m WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=r.user_id),
   'subject_label',label,'label_state',label_state,'label_observed_at',label_at,'label_source',label_source,
   'enrollment_id',r.enrollment_id,'program_enrollment_snapshot_id',r.snapshot_id,'association',CASE WHEN r.enrollment_id IS NULL THEN'no_exact_enrollment'WHEN r.snapshot_id IS NULL THEN'no_program_snapshot'ELSE'confirmed'END,
   'membership_basis',coalesce(previous->>'membership_basis','observed'),'effective_from',coalesce(previous->'effective_from','null'),'effective_until','null'::jsonb,
   'observed_since',coalesce(previous->'observed_since',to_jsonb(p_observed)),'source_event_ids',CASE WHEN previous IS NULL THEN jsonb_build_array(p_event)ELSE previous->'source_event_ids'END);
  result:=result||jsonb_build_array(item);
 END LOOP;RETURN jsonb_build_object('rows',result,'count',n,'unavailable',bad);END;$fn$;
CREATE FUNCTION public.uc_group_education_public_row(p_row jsonb)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT p_row-ARRAY['present','archived','primary','additional','_baseline_event_id','_membership_event_id','_association_event_id','_correction_event_id']
$fn$;
CREATE FUNCTION public.uc_group_education_authority(p_org uuid,p_group uuid,p_actor uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('actor_id',p_actor,'scope',public.uc_group_education_scope(p_org,p_group,(SELECT course_id FROM public.student_groups WHERE id=p_group AND organization_id=p_org)),
 'roles',coalesce((SELECT jsonb_agg(role::text ORDER BY role::text)FROM public.user_roles WHERE user_id=p_actor),'[]'),
 'staff',coalesce((SELECT jsonb_agg(jsonb_build_object('staff_id',s.id,'role',s.role,'sections_access',s.sections_access,'expires_at',s.expires_at,'exact_group_assigned',EXISTS(SELECT 1 FROM public.org_staff_document_groups a WHERE a.staff_id=s.id AND a.organization_id=p_org AND a.group_id=p_group))ORDER BY s.id)FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org),'[]'),
 'can_read',public.uc_group_education_actor_allowed(p_actor,p_org,p_group,false),'can_write',public.uc_group_education_actor_allowed(p_actor,p_org,p_group,true),'observed_at',clock_timestamp())
$fn$;
CREATE FUNCTION public.uc_group_education_lock(p_org uuid,p_group uuid,p_accounts uuid[],p_request uuid,p_barrier boolean DEFAULT false)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid;g public.student_groups;ref jsonb;t text;initial uuid[];fresh uuid[];
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL THEN PERFORM public.uc_group_education_error('ACCESS_DENIED');END IF;
 IF current_setting('transaction_isolation')<>'read committed'THEN RAISE EXCEPTION 'GROUP_FACTS_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 -- Old absent-state writers may acquire account locks in physical row order.
 -- Never wait while holding a partial new A-set, even before the barrier.
 FOR a IN SELECT DISTINCT x FROM unnest(array_append(coalesce(p_accounts,'{}'),auth.uid()))x WHERE x IS NOT NULL ORDER BY x LOOP IF NOT pg_try_advisory_xact_lock(hashtextextended(a::text,42007))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_org::text,0))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_program_roster:'||p_group::text,0))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 IF p_request IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_group_education_request:'||auth.uid()::text||':'||p_request::text,0))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 IF NOT public.uc_group_education_actor_allowed(auth.uid(),p_org,p_group,false)OR NOT public.uc_group_education_actor_allowed(auth.uid(),p_org,p_group,true)THEN PERFORM public.uc_group_education_error('ACCESS_DENIED');END IF;
 IF public.uc_group_education_own_source(p_group)THEN RAISE EXCEPTION 'GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED' USING ERRCODE='25000';END IF;
 IF p_barrier THEN
  LOCK TABLE public.organizations,public.courses,public.student_groups,public.profiles,public.student_group_memberships,public.enrollments,public.group_program_bindings,public.group_program_enrollment_snapshots IN SHARE MODE NOWAIT;
  SELECT coalesce(array_agg(user_id ORDER BY user_id),'{}')INTO fresh FROM(SELECT DISTINCT user_id FROM public.student_group_memberships_effective WHERE organization_id=p_org AND group_id=p_group)s;
  SELECT coalesce(array_agg(x ORDER BY x),'{}')INTO initial FROM(SELECT DISTINCT x FROM unnest(coalesce(p_accounts,'{}'))x WHERE x IS NOT NULL)s;
  IF EXISTS(SELECT 1 FROM unnest(fresh)x WHERE NOT x=ANY(initial))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 END IF;
 -- NOWAIT also covers relation acquisition; FOR SHARE NOWAIT alone does not.
 LOCK TABLE public.student_groups,public.group_program_bindings,public.program_fact_versions,public.org_documents,public.org_document_versions,public.org_document_reviews,public.org_staff,public.org_staff_document_groups,public.user_roles,public.admin_staff,storage.objects IN ROW SHARE MODE NOWAIT;
 SELECT * INTO g FROM public.student_groups WHERE id=p_group AND organization_id=p_org FOR SHARE NOWAIT;IF NOT FOUND OR g.course_id IS NULL THEN PERFORM public.uc_group_education_error('PREREQUISITE_MISSING');END IF;
 PERFORM 1 FROM public.group_program_bindings WHERE group_id=p_group AND organization_id=p_org ORDER BY id FOR SHARE NOWAIT;
 ref:=public.uc_group_education_program(p_org,p_group);IF ref IS NULL THEN PERFORM public.uc_group_education_error('PREREQUISITE_MISSING');END IF;
 PERFORM 1 FROM public.program_fact_versions WHERE id=(ref->>'version_id')::uuid FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_documents WHERE id=(ref->>'file_document_id')::uuid FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_document_versions WHERE id=(ref->>'file_version_id')::uuid FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_document_reviews WHERE id=(ref->>'file_review_id')::uuid FOR SHARE NOWAIT;
 PERFORM 1 FROM storage.objects WHERE id=(SELECT storage_object_id FROM public.org_document_versions WHERE id=(ref->>'file_version_id')::uuid)FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_staff WHERE user_id=ANY(array_append(coalesce(p_accounts,'{}'),auth.uid()))ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_staff_document_groups WHERE organization_id=p_org AND group_id=p_group ORDER BY staff_id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.user_roles WHERE user_id=ANY(array_append(coalesce(p_accounts,'{}'),auth.uid()))ORDER BY user_id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.admin_staff WHERE user_id=ANY(array_append(coalesce(p_accounts,'{}'),auth.uid()))ORDER BY user_id FOR SHARE NOWAIT;
 IF NOT public.uc_group_education_actor_allowed(auth.uid(),p_org,p_group,false)OR NOT public.uc_group_education_actor_allowed(auth.uid(),p_org,p_group,true)THEN PERFORM public.uc_group_education_error('ACCESS_DENIED');END IF;
 INSERT INTO public.uc_group_education_requests(row_kind,organization_id,group_id,course_id,actor_id,backend_pid,full_transaction_id,context,actor_ids)
 VALUES('public_operation',p_org,p_group,g.course_id,auth.uid(),pg_backend_pid(),pg_current_xact_id()::text,jsonb_build_object('schema_version',1,'first_observed_at',clock_timestamp()),ARRAY[auth.uid()])ON CONFLICT DO NOTHING;
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END;$fn$;

CREATE FUNCTION public.uc_group_education_event(p_id uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',e.id,'scope',public.uc_group_education_scope(e.organization_id,e.group_id,e.course_id),'revision',e.revision,'action',e.action,'recorded_at',e.recorded_at,'effective_at',e.effective_at,'actor_id',e.actor_id,'origin',e.origin,'reason',e.reason,'subject_user_id',e.subject_user_id,'source_event_id',e.source_event_id,'calendar_version_id',e.calendar_version_id,'snapshot_id',e.snapshot_id,'input_hash',e.input_hash,'authority_snapshot_hash',e.authority_snapshot_hash,'payload',e.payload)FROM public.uc_group_education_events e WHERE id=p_id
$fn$;
CREATE FUNCTION public.uc_group_education_event_complete(p_receipt uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_receipt IS NULL OR EXISTS(SELECT 1 FROM public.uc_group_education_requests r WHERE r.id=p_receipt AND r.row_kind='source_transaction_receipt'AND r.context->>'status'='first_flush_complete_provisional'AND NOT(r.backend_pid=pg_backend_pid()AND r.full_transaction_id IS NOT DISTINCT FROM pg_current_xact_id_if_assigned()::text))
$fn$;
CREATE FUNCTION public.uc_group_education_append(p_org uuid,p_group uuid,p_id uuid,p_action text,p_effective timestamptz,p_payload jsonb,p_reason text DEFAULT NULL,p_subject uuid DEFAULT NULL,p_source_event uuid DEFAULT NULL,p_calendar uuid DEFAULT NULL,p_snapshot uuid DEFAULT NULL,p_source_receipt uuid DEFAULT NULL,p_authority jsonb DEFAULT NULL,p_actor uuid DEFAULT NULL,p_origin text DEFAULT NULL)RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.uc_group_education_states;r bigint;authority jsonb;actor uuid:=CASE WHEN p_authority IS NOT NULL THEN p_actor ELSE coalesce(p_actor,auth.uid())END;origin text:=coalesce(p_origin,CASE auth.role()WHEN'authenticated'THEN'authenticated'WHEN'service_role'THEN'service'ELSE'system'END);
BEGIN SELECT * INTO s FROM public.uc_group_education_states WHERE group_id=p_group AND organization_id=p_org FOR UPDATE NOWAIT;
 IF s.revision>=9007199254740991 THEN PERFORM public.uc_group_education_error('LIMIT_EXCEEDED');END IF;r:=s.revision+1;
 authority:=coalesce(p_authority,public.uc_group_education_authority(p_org,p_group,actor));
 INSERT INTO public.uc_group_education_events(id,organization_id,group_id,course_id,revision,action,effective_at,actor_id,origin,reason,subject_user_id,source_event_id,calendar_version_id,snapshot_id,input_hash,authority_snapshot,authority_snapshot_hash,payload,source_receipt_id)
 VALUES(p_id,p_org,p_group,s.course_id,r,p_action,p_effective,actor,origin,p_reason,p_subject,p_source_event,p_calendar,p_snapshot,public.uc_program_hash(p_payload),authority,public.uc_program_hash(authority),p_payload,p_source_receipt);
 UPDATE public.uc_group_education_states SET revision=r,recorded_at=clock_timestamp(),recorded_by=actor WHERE group_id=p_group;RETURN r;
END;$fn$;

CREATE FUNCTION public.uc_group_education_valid_zone(p_zone text)RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(length(p_zone)BETWEEN 1 AND 100 AND p_zone!~'^(posix|right)/'AND EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_zone),false)
$fn$;
CREATE FUNCTION public.uc_group_education_offset(p_text text)RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN right(p_text,1)='Z'THEN 0 ELSE(CASE substr(right(p_text,6),1,1)WHEN'-'THEN-1 ELSE 1 END)*(substr(right(p_text,6),2,2)::integer*60+right(p_text,2)::integer)END
$fn$;
CREATE FUNCTION public.uc_group_education_calendar_input(p_org uuid,p_group uuid,p_action jsonb,p_ref jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE lesson jsonb;item jsonb;lessons jsonb:='[]';proofs jsonb:='[]';teacher uuid;lid uuid;teacher_name text;teacher_proof jsonb;base public.uc_group_calendar_versions;old_lesson jsonb;zone text:=p_action->>'timezone';start_date date;end_date date;st timestamptz;en timestamptz;d date;known numeric:=0;missing integer:=0;n integer:=0;seen uuid[]:='{}';hours text;
BEGIN
 IF NOT public.uc_group_education_valid_zone(zone)OR(p_action->>'planned_start_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'OR(p_action->>'planned_end_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 start_date:=(p_action->>'planned_start_date')::date;end_date:=(p_action->>'planned_end_date')::date;
 IF start_date>end_date OR p_action->>'coverage'NOT IN('whole_program','partial_plan')OR(p_action->'partial_reason'<>'null'AND NOT public.uc_admission_text(p_action->'partial_reason',2000))OR(p_action->>'coverage'='partial_plan'AND p_action->'partial_reason'='null')THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 IF p_action->'base_version_id'<>'null'THEN
  IF NOT public.uc_admission_uuid(p_action->'base_version_id')THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  SELECT * INTO base FROM public.uc_group_calendar_versions WHERE id=(p_action->>'base_version_id')::uuid AND organization_id=p_org AND group_id=p_group;
  IF NOT FOUND THEN PERFORM public.uc_group_education_error('NOT_FOUND');END IF;
 END IF;
 IF jsonb_typeof(p_action->'lessons')IS DISTINCT FROM'array'OR jsonb_array_length(p_action->'lessons')>250 THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 FOR lesson IN SELECT x FROM jsonb_array_elements(p_action->'lessons')x LOOP
  n:=n+1;
  IF NOT public.uc_admission_shape(lesson,ARRAY['lesson_id','local_date','starts_at','ends_at','topic','module_label','course_lesson_id','academic_hours','teacher_user_id','status','cancellation_reason'])
   OR NOT public.uc_admission_text(lesson->'topic',1000)OR(lesson->'module_label'<>'null'AND NOT public.uc_admission_text(lesson->'module_label',160))
   OR(lesson->>'local_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'OR lesson->>'status'NOT IN('planned','cancelled')
   OR(lesson->'cancellation_reason'<>'null'AND NOT public.uc_admission_text(lesson->'cancellation_reason',2000))
   OR(lesson->>'status'='cancelled'AND lesson->'cancellation_reason'='null')
   OR((lesson->'starts_at'='null')IS DISTINCT FROM(lesson->'ends_at'='null'))THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  d:=(lesson->>'local_date')::date;IF d NOT BETWEEN start_date AND end_date THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  IF lesson->'starts_at'<>'null'THEN
   IF lesson->>'starts_at'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$'OR lesson->>'ends_at'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$'THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
   st:=(lesson->>'starts_at')::timestamptz;en:=(lesson->>'ends_at')::timestamptz;
   IF NOT isfinite(st)OR NOT isfinite(en)OR en<=st OR en-st>interval'24 hours'OR(st AT TIME ZONE zone)::date<>d OR(en AT TIME ZONE zone)::date<>d
   OR extract(epoch FROM((st AT TIME ZONE zone)-(st AT TIME ZONE'UTC')))/60<>public.uc_group_education_offset(lesson->>'starts_at')
   OR extract(epoch FROM((en AT TIME ZONE zone)-(en AT TIME ZONE'UTC')))/60<>public.uc_group_education_offset(lesson->>'ends_at')THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  END IF;
  IF lesson->'lesson_id'='null'THEN lid:=gen_random_uuid();ELSE
   IF NOT public.uc_admission_uuid(lesson->'lesson_id')THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;lid:=(lesson->>'lesson_id')::uuid;
   SELECT x INTO old_lesson FROM jsonb_array_elements(coalesce(base.lessons,'[]'))x WHERE x->>'lesson_id'=lid::text;
   IF old_lesson IS NULL OR(lesson-ARRAY['academic_hours','teacher_user_id','status','cancellation_reason'])IS DISTINCT FROM(old_lesson-ARRAY['academic_hours','teacher_user_id','status','cancellation_reason','teacher_label','teacher_source_hash','teacher_label_state','teacher_label_observed_at','teacher_label_source'])THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  END IF;
  IF lid=ANY(seen)THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;seen:=array_append(seen,lid);
  IF lesson->'course_lesson_id'<>'null'AND(NOT public.uc_admission_uuid(lesson->'course_lesson_id')OR NOT EXISTS(SELECT 1 FROM public.lessons WHERE id=(lesson->>'course_lesson_id')::uuid AND course_id=(SELECT course_id FROM public.student_groups WHERE id=p_group)))THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  hours:=lesson->>'academic_hours';IF hours IS NOT NULL AND(hours!~'^(0|[1-9][0-9]*)([.][0-9]{1,2})?$'OR hours::numeric<=0 OR hours::numeric>10000)THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  IF lesson->>'status'='planned'THEN IF hours IS NULL THEN missing:=missing+1;ELSE known:=known+hours::numeric;END IF;END IF;
  teacher_name:=NULL;teacher_proof:=NULL;teacher:=NULL;
  IF lesson->'teacher_user_id'<>'null'THEN
   IF NOT public.uc_admission_uuid(lesson->'teacher_user_id')THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;teacher:=(lesson->>'teacher_user_id')::uuid;
   IF NOT public.uc_group_education_teacher_allowed(teacher,p_org,p_group)THEN PERFORM public.uc_group_education_error('ACCESS_DENIED');END IF;
   SELECT nullif(public.uc_admission_trim(full_name),'')INTO teacher_name FROM public.profiles WHERE user_id=teacher AND organization_id=p_org;
   IF length(teacher_name)>240 THEN teacher_name:=NULL;END IF;
   teacher_proof:=public.uc_group_education_authority(p_org,p_group,teacher);proofs:=proofs||jsonb_build_array(jsonb_build_object('teacher_user_id',teacher,'proof',teacher_proof));
  END IF;
  item:=lesson||jsonb_build_object('lesson_id',lid,'teacher_label',teacher_name,'teacher_source_hash',CASE WHEN teacher_proof IS NOT NULL THEN public.uc_program_hash(teacher_proof)END,'teacher_label_state',CASE WHEN teacher_name IS NULL THEN'unavailable'ELSE'available'END,'teacher_label_observed_at',CASE WHEN teacher_name IS NOT NULL THEN clock_timestamp()END,'teacher_label_source',CASE WHEN teacher_name IS NOT NULL THEN jsonb_build_object('kind','authorized_current_profile','subject_user_id',teacher)END);
  lessons:=lessons||jsonb_build_array(item);
 END LOOP;
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'local_date',nullif(x->>'starts_at','')::timestamptz NULLS LAST,x->>'lesson_id'),'[]')INTO lessons FROM jsonb_array_elements(lessons)x;
 RETURN jsonb_build_object('timezone',zone,'planned_start_date',start_date,'planned_end_date',end_date,'coverage',p_action->'coverage','partial_reason',p_action->'partial_reason','program_ref',p_ref,'lessons',lessons,'known_academic_hours_total',known::text,'missing_hours_count',missing,'teacher_proofs',proofs);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END;$fn$;
CREATE FUNCTION public.uc_group_education_calendar(p_id uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_group_calendar_versions;s public.uc_group_education_states;pre jsonb:='[]';l jsonb;
BEGIN SELECT * INTO c FROM public.uc_group_calendar_versions WHERE id=p_id;IF NOT FOUND THEN RETURN NULL;END IF;SELECT * INTO s FROM public.uc_group_education_states WHERE group_id=c.group_id;
 IF c.redacted THEN pre:=jsonb_build_array(public.uc_group_education_prerequisite('SOURCE_ERASED','calendar'),public.uc_group_education_prerequisite('TEACHER_REQUIRED','calendar'));END IF;
 FOR l IN SELECT x FROM jsonb_array_elements(c.lessons)x WHERE x->>'status'='planned'LOOP
 IF l->'teacher_user_id'='null'AND NOT c.redacted THEN pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('TEACHER_REQUIRED','lesson',(l->>'lesson_id')::uuid));END IF;
 IF l->'academic_hours'='null'THEN pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('HOURS_REQUIRED','lesson',(l->>'lesson_id')::uuid));END IF;END LOOP;
 IF c.coverage='partial_plan'THEN pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('PLAN_PARTIAL','calendar'));END IF;
 IF jsonb_array_length(pre)>100 THEN SELECT jsonb_agg(x)INTO pre FROM(SELECT x FROM jsonb_array_elements(pre)x LIMIT 100)t;END IF;
 RETURN jsonb_build_object('id',c.id,'scope',public.uc_group_education_scope(c.organization_id,c.group_id,c.course_id),'revision_created',c.revision_created,'state',CASE WHEN c.published_at IS NULL THEN'draft'WHEN s.published_calendar_id=c.id THEN'published'ELSE'superseded'END,'timezone',c.timezone,'planned_start_date',c.planned_start_date,'planned_end_date',c.planned_end_date,'coverage',c.coverage,'partial_reason',c.partial_reason,'program_ref',c.program_ref,'lessons',c.lessons,'academic_hours_total',CASE WHEN c.missing_hours_count=0 THEN c.known_academic_hours_total::text END,'known_academic_hours_total',c.known_academic_hours_total::text,'missing_hours_count',c.missing_hours_count,'content_hash',c.content_hash,'recorded_at',c.recorded_at,'recorded_by',c.recorded_by,'published_at',c.published_at,'published_by',c.published_by,'prerequisites',pre);END;$fn$;
CREATE FUNCTION public.uc_group_education_envelope(p_org uuid,p_group uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g public.student_groups;s public.uc_group_education_states;ref jsonb;pre jsonb:='[]';state jsonb;legacy jsonb;counted integer;coverage text;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_group_education_actor_allowed(auth.uid(),p_org,p_group,false)THEN PERFORM public.uc_group_education_error('ACCESS_DENIED');END IF;
 SELECT * INTO g FROM public.student_groups WHERE id=p_group AND organization_id=p_org;SELECT * INTO s FROM public.uc_group_education_states WHERE group_id=p_group AND organization_id=p_org;
 IF s.group_id IS NOT NULL AND s.course_id IS DISTINCT FROM g.course_id THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
 ref:=public.uc_group_education_program(p_org,p_group);legacy:=public.uc_group_education_legacy(p_group);
 IF g.course_id IS NULL THEN pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('NO_GROUP_COURSE','group'));END IF;
 IF ref IS NULL THEN pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite(CASE WHEN EXISTS(SELECT 1 FROM public.group_program_bindings WHERE group_id=p_group)THEN'PROGRAM_SOURCE_UNAVAILABLE'ELSE'NO_UC111_BINDING'END,'program'));END IF;
 IF legacy IS NULL THEN pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('LEGACY_DISPLAY_UNAVAILABLE','group'));END IF;
 IF s.group_id IS NULL THEN pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('HISTORY_NOT_INITIALIZED'));ELSE
  IF public.uc_group_education_own_source(p_group)THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
  SELECT count(*)::integer INTO counted FROM(SELECT 1 FROM public.student_group_memberships_effective WHERE organization_id=p_org AND group_id=p_group LIMIT 1001)x;
  IF s.active_gap IS NOT NULL THEN pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('COVERAGE_GAP'));END IF;
  IF s.source_redacted THEN pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('SOURCE_ERASED'));END IF;
  IF counted>1000 THEN pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('ROSTER_LIMIT_EXCEEDED'));END IF;
  IF s.revision=9007199254740991 THEN pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('HISTORY_REVISION_CAPACITY'));END IF;
  IF s.legacy_calendar_changed THEN pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('LEGACY_SOURCE_CHANGED','calendar'));END IF;
  coverage:=CASE WHEN s.source_redacted THEN'source_unavailable'WHEN s.active_gap IS NOT NULL THEN'unknown_gap'ELSE'complete_observed'END;
  state:=jsonb_build_object('scope',public.uc_group_education_scope(p_org,p_group,g.course_id),'revision',s.revision,'coverage_known_from',s.coverage_known_from,'timezone',s.timezone,'program_ref',s.program_ref,'draft_calendar_id',s.draft_calendar_id,'published_calendar_id',s.published_calendar_id,'legacy_calendar_changed',s.legacy_calendar_changed,'recorded_at',s.recorded_at,'prerequisites',pre,'capabilities',public.uc_group_education_capabilities(p_org,p_group),'coverage',coverage,'coverage_segment_id',s.coverage_segment_id,'active_gap',s.active_gap,'membership_count',public.uc_group_education_count(counted,coverage='complete_observed'AND counted<=1000));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_org,'group_id',p_group,'scope',CASE WHEN g.course_id IS NOT NULL THEN public.uc_group_education_scope(p_org,p_group,g.course_id)END,'persisted',s.group_id IS NOT NULL,'state',state,'program_ref',ref,'legacy_calendar',legacy,'prerequisites',pre,'capabilities',public.uc_group_education_capabilities(p_org,p_group));END;$fn$;

CREATE FUNCTION public.read_group_education_facts(p_organization_id uuid,p_group_id uuid,p_query jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE mode text:=p_query->>'kind';s public.uc_group_education_states;envelope jsonb;scope jsonb;result jsonb;items jsonb:='[]';row record;lim integer;after_id uuid;ceiling bigint;after_rev bigint;next_rev bigint;next_id uuid;selected uuid;more boolean:=false;
BEGIN
 envelope:=public.uc_group_education_envelope(p_organization_id,p_group_id);scope:=envelope->'scope';
 IF mode='state'THEN IF NOT public.uc_admission_shape(p_query,ARRAY['kind'])THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;RETURN envelope;END IF;
 SELECT * INTO s FROM public.uc_group_education_states WHERE group_id=p_group_id AND organization_id=p_organization_id;
 IF mode<>'options'AND s.group_id IS NULL THEN PERFORM public.uc_group_education_error('PREREQUISITE_MISSING');END IF;
 IF public.uc_group_education_own_source(p_group_id)THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
 IF mode='calendar'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['kind','selection'])THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  IF p_query->'selection'->>'kind'='current'THEN
   IF NOT public.uc_admission_shape(p_query->'selection',ARRAY['kind','view'])OR p_query->'selection'->>'view'NOT IN('draft','published')THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
   selected:=CASE p_query->'selection'->>'view'WHEN'draft'THEN s.draft_calendar_id ELSE s.published_calendar_id END;
  ELSIF p_query->'selection'->>'kind'='version'THEN
   IF NOT public.uc_admission_shape(p_query->'selection',ARRAY['kind','version_id'])OR NOT public.uc_admission_uuid(p_query->'selection'->'version_id')THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;selected:=(p_query->'selection'->>'version_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM public.uc_group_calendar_versions WHERE id=selected AND organization_id=p_organization_id AND group_id=p_group_id)THEN PERFORM public.uc_group_education_error('NOT_FOUND');END IF;
  ELSE PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  RETURN jsonb_build_object('schema_version',1,'scope',scope,'selection',p_query->'selection','calendar',public.uc_group_education_calendar(selected),'prerequisites','[]'::jsonb);
 END IF;
 IF mode NOT IN('roster','snapshot','history','options')THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 IF jsonb_typeof(p_query->'limit')IS DISTINCT FROM'number'OR p_query->>'limit'!~'^[1-9][0-9]{0,2}$'THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;lim:=(p_query->>'limit')::integer;
 IF lim>(CASE WHEN mode IN('roster','snapshot')THEN 100 ELSE 50 END)THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 IF mode='history'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['kind','after_revision','ceiling_revision','limit'])OR jsonb_typeof(p_query->'after_revision')IS DISTINCT FROM'number'OR p_query->>'after_revision'!~'^[0-9]{1,16}$'THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;after_rev:=(p_query->>'after_revision')::bigint;
  IF p_query->'ceiling_revision'='null'THEN IF after_rev<>0 THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;ceiling:=s.revision;
  ELSE IF jsonb_typeof(p_query->'ceiling_revision')IS DISTINCT FROM'number'OR p_query->>'ceiling_revision'!~'^[1-9][0-9]{0,15}$'THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;ceiling:=(p_query->>'ceiling_revision')::bigint;END IF;
  IF ceiling>s.revision OR ceiling>9007199254740991 OR after_rev>ceiling THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  FOR row IN SELECT id,revision FROM public.uc_group_education_events WHERE organization_id=p_organization_id AND group_id=p_group_id AND revision>after_rev AND revision<=ceiling AND public.uc_group_education_event_complete(source_receipt_id)ORDER BY revision LIMIT lim+1 LOOP
   IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(public.uc_group_education_event(row.id));next_rev:=row.revision;END LOOP;
  RETURN jsonb_build_object('schema_version',1,'scope',scope,'events',items,'next_after_revision',CASE WHEN more THEN next_rev END,'ceiling_revision',ceiling,'current_revision',s.revision,'current_coverage',envelope->'state'->'coverage','active_gap',s.active_gap);
 ELSIF mode='options'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['kind','facet','after_id','limit'])OR p_query->>'facet'NOT IN('teachers','course_lessons')OR(p_query->'after_id'<>'null'AND NOT public.uc_admission_uuid(p_query->'after_id'))THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;after_id:=(p_query->>'after_id')::uuid;
  IF p_query->>'facet'='teachers'THEN
   FOR row IN SELECT DISTINCT p.user_id id,public.uc_admission_trim(p.full_name)label FROM public.profiles p JOIN public.org_staff st ON st.user_id=p.user_id AND st.organization_id=p.organization_id WHERE p.organization_id=p_organization_id AND(after_id IS NULL OR p.user_id>after_id)AND public.uc_group_education_teacher_allowed(p.user_id,p_organization_id,p_group_id)AND length(public.uc_admission_trim(p.full_name))BETWEEN 1 AND 240 ORDER BY p.user_id LIMIT lim+1 LOOP
    IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(jsonb_build_object('id',row.id,'label',row.label));next_id:=row.id;END LOOP;
  ELSE
   FOR row IN SELECT l.id,public.uc_admission_trim(l.title)label FROM public.lessons l WHERE l.course_id=(scope->>'course_id')::uuid AND(after_id IS NULL OR l.id>after_id)AND length(public.uc_admission_trim(l.title))BETWEEN 1 AND 240 ORDER BY l.id LIMIT lim+1 LOOP
    IF jsonb_array_length(items)=lim THEN more:=true;EXIT;END IF;items:=items||jsonb_build_array(jsonb_build_object('id',row.id,'label',row.label));next_id:=row.id;END LOOP;
  END IF;RETURN jsonb_build_object('schema_version',1,'scope',scope,'facet',p_query->>'facet','items',items,'next_after_id',CASE WHEN more THEN next_id END);
 ELSIF mode='roster'THEN
  IF NOT public.uc_admission_shape(p_query,ARRAY['kind','as_of','knowledge_revision','after_user_id','limit'])OR(p_query->'after_user_id'<>'null'AND NOT public.uc_admission_uuid(p_query->'after_user_id'))THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  IF p_query->'knowledge_revision'='null'THEN IF p_query->'after_user_id'<>'null'THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;ceiling:=s.revision;ELSE
   IF jsonb_typeof(p_query->'knowledge_revision')IS DISTINCT FROM'number'OR p_query->>'knowledge_revision'!~'^[1-9][0-9]{0,15}$'THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;ceiling:=(p_query->>'knowledge_revision')::bigint;END IF;
  RETURN public.uc_group_education_roster_context(p_organization_id,p_group_id,p_query->'as_of',ceiling,(p_query->>'after_user_id')::uuid,lim)->'page';
 ELSE
  IF NOT public.uc_admission_shape(p_query,ARRAY['kind','snapshot_id','after_user_id','limit'])OR NOT public.uc_admission_uuid(p_query->'snapshot_id')OR(p_query->'after_user_id'<>'null'AND NOT public.uc_admission_uuid(p_query->'after_user_id'))THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  RETURN public.uc_group_education_snapshot_page(p_organization_id,p_group_id,(p_query->>'snapshot_id')::uuid,(p_query->>'after_user_id')::uuid,lim);
 END IF;
END;$fn$;

CREATE FUNCTION public.apply_group_education_facts_action(p_organization_id uuid,p_group_id uuid,p_expected_revision bigint,p_request_id uuid,p_action jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();kind text:=p_action->>'action';keys text[];s public.uc_group_education_states;r public.uc_group_education_requests;g public.student_groups;accounts uuid[]:='{}';ref jsonb;observed timestamptz;event uuid:=gen_random_uuid();applied bigint;payload jsonb;body jsonb;input_hash text;receipt jsonb;scan jsonb;rows jsonb;ids uuid[];proof jsonb;calendar_input jsonb;calendar_id uuid;cal public.uc_group_calendar_versions;l jsonb;authority jsonb;closed_gap jsonb;context jsonb;snap uuid;
BEGIN
 IF kind NOT IN('initialize_history','correct_membership_time','save_calendar_version','publish_calendar_version','capture_roster_snapshot','recover_coverage')OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>9007199254740991 OR p_request_id IS NULL THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 keys:=CASE kind WHEN'initialize_history'THEN ARRAY['action','timezone','expected_program_ref','reason']WHEN'correct_membership_time'THEN ARRAY['action','event_id','expected_event_hash','corrected_effective_at','reason']WHEN'save_calendar_version'THEN ARRAY['action','base_version_id','expected_program_ref','timezone','planned_start_date','planned_end_date','coverage','partial_reason','lessons','reason']WHEN'publish_calendar_version'THEN ARRAY['action','version_id','expected_content_hash','expected_program_ref','reason']WHEN'capture_roster_snapshot'THEN ARRAY['action','as_of','knowledge_revision','calendar_version_id','expected_calendar_hash','expected_program_ref','purpose','reason']ELSE ARRAY['action','gap_id','expected_program_ref','reason']END;
 IF NOT public.uc_admission_shape(p_action,keys)OR NOT public.uc_admission_text(p_action->'reason',2000)THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 IF auth.role()IS DISTINCT FROM'authenticated'OR a IS NULL OR NOT public.uc_group_education_actor_allowed(a,p_organization_id,p_group_id,false)OR NOT public.uc_group_education_actor_allowed(a,p_organization_id,p_group_id,true)THEN PERFORM public.uc_group_education_error('ACCESS_DENIED');END IF;
 IF kind IN('initialize_history','recover_coverage')THEN
  SELECT coalesce(array_agg(user_id ORDER BY user_id),'{}')INTO accounts FROM(SELECT DISTINCT user_id FROM public.student_group_memberships_effective WHERE organization_id=p_organization_id AND group_id=p_group_id ORDER BY user_id LIMIT 1001)x;
  IF cardinality(accounts)>1000 THEN PERFORM public.uc_group_education_error('LIMIT_EXCEEDED');END IF;
 ELSIF kind='correct_membership_time'THEN
  IF NOT public.uc_admission_uuid(p_action->'event_id')THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  SELECT array_remove(ARRAY[subject_user_id],NULL)INTO accounts FROM public.uc_group_education_events WHERE id=(p_action->>'event_id')::uuid AND organization_id=p_organization_id AND group_id=p_group_id;
 ELSIF kind='save_calendar_version'THEN
  IF jsonb_typeof(p_action->'lessons')IS DISTINCT FROM'array'OR jsonb_array_length(p_action->'lessons')>250 THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_action->'lessons')x WHERE x->'teacher_user_id'<>'null'AND NOT public.uc_admission_uuid(x->'teacher_user_id'))THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  SELECT coalesce(array_agg(DISTINCT(x->>'teacher_user_id')::uuid),'{}')INTO accounts FROM jsonb_array_elements(p_action->'lessons')x WHERE x->'teacher_user_id'<>'null';
 ELSIF kind IN('publish_calendar_version','capture_roster_snapshot')THEN
  IF NOT public.uc_admission_uuid(p_action->(CASE WHEN kind='publish_calendar_version'THEN'version_id'ELSE'calendar_version_id'END))THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  SELECT * INTO cal FROM public.uc_group_calendar_versions WHERE id=(p_action->>CASE WHEN kind='publish_calendar_version'THEN'version_id'ELSE'calendar_version_id'END)::uuid AND organization_id=p_organization_id AND group_id=p_group_id;
  IF NOT FOUND THEN PERFORM public.uc_group_education_error('NOT_FOUND');END IF;
  SELECT coalesce(array_agg(DISTINCT(x->>'teacher_user_id')::uuid),'{}')INTO accounts FROM jsonb_array_elements(cal.lessons)x WHERE x->'teacher_user_id'<>'null';
  IF kind='capture_roster_snapshot'THEN
   IF jsonb_typeof(p_action->'knowledge_revision')IS DISTINCT FROM'number'OR p_action->>'knowledge_revision'!~'^[1-9][0-9]{0,15}$'THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
   context:=public.uc_group_education_roster_context(p_organization_id,p_group_id,p_action->'as_of',(p_action->>'knowledge_revision')::bigint,NULL,1000);
   SELECT accounts||coalesce(array_agg((x->>'user_id')::uuid),'{}')INTO accounts FROM jsonb_array_elements(context->'rows')x;
  END IF;
 END IF;
 PERFORM public.uc_group_education_lock(p_organization_id,p_group_id,accounts,p_request_id,kind IN('initialize_history','recover_coverage'));
 body:=jsonb_build_object('organization_id',p_organization_id,'group_id',p_group_id,'expected_revision',p_expected_revision,'action',p_action);input_hash:=public.uc_program_hash(body);
 SELECT * INTO r FROM public.uc_group_education_requests WHERE row_kind='command'AND actor_id=a AND request_id=p_request_id FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF r.organization_id<>p_organization_id OR r.group_id<>p_group_id OR r.body IS DISTINCT FROM body THEN PERFORM public.uc_group_education_error('REQUEST_CONFLICT');END IF;
  receipt:=r.receipt||jsonb_build_object('replayed',true);RETURN jsonb_build_object('schema_version',1,'envelope',public.uc_group_education_envelope(p_organization_id,p_group_id),'receipt',receipt,'event',public.uc_group_education_event((receipt->>'event_id')::uuid));
 END IF;
 SELECT * INTO s FROM public.uc_group_education_states WHERE group_id=p_group_id AND organization_id=p_organization_id FOR UPDATE NOWAIT;
 IF p_expected_revision<>coalesce(s.revision,0)THEN PERFORM public.uc_group_education_error('REVISION_CONFLICT');END IF;
 IF s.revision=9007199254740991 THEN PERFORM public.uc_group_education_error('LIMIT_EXCEEDED');END IF;
 SELECT * INTO g FROM public.student_groups WHERE id=p_group_id AND organization_id=p_organization_id;
 ref:=public.uc_group_education_program(p_organization_id,p_group_id);
 IF kind NOT IN('correct_membership_time','capture_roster_snapshot')AND p_action->'expected_program_ref'IS DISTINCT FROM ref THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 IF kind<>'initialize_history'AND s.group_id IS NULL THEN PERFORM public.uc_group_education_error('PREREQUISITE_MISSING');END IF;
 observed:=clock_timestamp();authority:=public.uc_group_education_authority(p_organization_id,p_group_id,a);
 IF kind IN('initialize_history','recover_coverage')THEN
  IF kind='initialize_history'AND(s.group_id IS NOT NULL OR NOT public.uc_group_education_valid_zone(p_action->>'timezone'))THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
  IF kind='recover_coverage'AND(NOT public.uc_admission_uuid(p_action->'gap_id')OR s.active_gap IS NULL OR s.active_gap->>'id'<>p_action->>'gap_id')THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  scan:=public.uc_group_education_scan(p_organization_id,p_group_id,observed,event,'[]',true);
  IF(scan->>'count')::integer>1000 THEN PERFORM public.uc_group_education_error('LIMIT_EXCEEDED');END IF;
  IF(scan->>'unavailable')::boolean THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;rows:=scan->'rows';
  SELECT coalesce(array_agg(DISTINCT(x->>'program_enrollment_snapshot_id')::uuid ORDER BY(x->>'program_enrollment_snapshot_id')::uuid),'{}')INTO ids FROM jsonb_array_elements(rows)x WHERE x->'program_enrollment_snapshot_id'<>'null';
  proof:=public.uc_group_education_program_proof(p_organization_id,p_group_id,ref,ids);
  IF kind='initialize_history'THEN
   applied:=1;INSERT INTO public.uc_group_education_states(organization_id,group_id,course_id,revision,coverage_known_from,timezone,program_ref,program_proof,legacy_source_hash,coverage_segment_id,source_rows,recorded_at,recorded_by)
   VALUES(p_organization_id,p_group_id,g.course_id,1,observed,p_action->>'timezone',ref,proof,public.uc_program_hash(public.uc_program_group_calendar(p_group_id)),event,rows,observed,a);
   payload:=jsonb_build_object('coverage_known_from',observed,'coverage_segment_id',event,'timezone',p_action->>'timezone','baseline_present_count',jsonb_array_length(rows),'baseline_archived_count',(SELECT count(*)FROM jsonb_array_elements(rows)x WHERE(x->>'archived')::boolean),'label_observation_hash',public.uc_program_hash(rows));
   INSERT INTO public.uc_group_education_events(id,organization_id,group_id,course_id,revision,action,effective_at,actor_id,origin,reason,input_hash,authority_snapshot,authority_snapshot_hash,payload,source_snapshot,source_snapshot_hash)
   VALUES(event,p_organization_id,p_group_id,g.course_id,1,'initialized',observed,a,'authenticated',p_action->>'reason',public.uc_program_hash(payload),authority,public.uc_program_hash(authority),payload,jsonb_build_object('rows',rows,'program_ref',ref,'program_proof',proof),public.uc_program_hash(jsonb_build_object('rows',rows,'program_ref',ref,'program_proof',proof)));
  ELSE
   closed_gap:=s.active_gap||jsonb_build_object('recovered_at',observed,'recovery_revision',s.revision+1,'recovery_segment_id',event);
   payload:=jsonb_build_object('gap',closed_gap,'baseline_observed_at',observed,'baseline_present_count',jsonb_array_length(rows),'baseline_archived_count',(SELECT count(*)FROM jsonb_array_elements(rows)x WHERE(x->>'archived')::boolean),'label_observation_hash',public.uc_program_hash(rows),'program_ref',ref);
   applied:=public.uc_group_education_append(p_organization_id,p_group_id,event,'coverage_recovered',observed,payload,p_action->>'reason');
   UPDATE public.uc_group_education_events SET source_snapshot=jsonb_build_object('rows',rows,'program_ref',ref,'program_proof',proof),source_snapshot_hash=public.uc_program_hash(jsonb_build_object('rows',rows,'program_ref',ref,'program_proof',proof))WHERE id=event;
   UPDATE public.uc_group_education_states SET active_gap=NULL,coverage_segment_id=event,coverage_known_from=observed,program_ref=ref,program_proof=proof,source_rows=rows,source_redacted=false WHERE group_id=p_group_id;
  END IF;
 ELSIF kind='correct_membership_time'THEN
  payload:=public.uc_group_education_correct(p_organization_id,p_group_id,p_action);
  applied:=public.uc_group_education_append(p_organization_id,p_group_id,event,'membership_time_corrected',(p_action->>'corrected_effective_at')::timestamptz,payload,p_action->>'reason',(SELECT subject_user_id FROM public.uc_group_education_events WHERE id=(p_action->>'event_id')::uuid),(p_action->>'event_id')::uuid);
 ELSIF kind='save_calendar_version'THEN
  calendar_id:=gen_random_uuid();calendar_input:=public.uc_group_education_calendar_input(p_organization_id,p_group_id,p_action,ref);
  INSERT INTO public.uc_group_calendar_versions(id,organization_id,group_id,course_id,revision_created,base_version_id,timezone,planned_start_date,planned_end_date,coverage,partial_reason,program_ref,lessons,known_academic_hours_total,missing_hours_count,content_hash,content,teacher_proofs,recorded_by)
  VALUES(calendar_id,p_organization_id,p_group_id,g.course_id,s.revision+1,(p_action->>'base_version_id')::uuid,calendar_input->>'timezone',(calendar_input->>'planned_start_date')::date,(calendar_input->>'planned_end_date')::date,calendar_input->>'coverage',calendar_input->>'partial_reason',ref,calendar_input->'lessons',(calendar_input->>'known_academic_hours_total')::numeric,(calendar_input->>'missing_hours_count')::integer,public.uc_program_hash(calendar_input-'teacher_proofs'),calendar_input-'teacher_proofs',calendar_input->'teacher_proofs',a);
  payload:=jsonb_build_object('version_id',calendar_id,'content_hash',public.uc_program_hash(calendar_input-'teacher_proofs'),'base_version_id',p_action->'base_version_id');
  applied:=public.uc_group_education_append(p_organization_id,p_group_id,event,'calendar_saved',NULL,payload,p_action->>'reason',NULL,NULL,calendar_id);
  UPDATE public.uc_group_education_states SET draft_calendar_id=calendar_id WHERE group_id=p_group_id;
 ELSIF kind='publish_calendar_version'THEN
  SELECT * INTO cal FROM public.uc_group_calendar_versions WHERE id=(p_action->>'version_id')::uuid AND group_id=p_group_id FOR UPDATE NOWAIT;
  IF cal.content_hash IS DISTINCT FROM p_action->>'expected_content_hash'OR cal.program_ref IS DISTINCT FROM ref OR cal.published_at IS NOT NULL OR s.draft_calendar_id IS DISTINCT FROM cal.id THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cal.lessons)x WHERE x->>'status'='planned')OR cal.missing_hours_count<>0 THEN PERFORM public.uc_group_education_error('PREREQUISITE_MISSING');END IF;
  FOR l IN SELECT x FROM jsonb_array_elements(cal.lessons)x WHERE x->>'status'='planned'LOOP IF l->'teacher_user_id'='null'OR NOT public.uc_group_education_teacher_allowed((l->>'teacher_user_id')::uuid,p_organization_id,p_group_id)THEN PERFORM public.uc_group_education_error('PREREQUISITE_MISSING');END IF;END LOOP;
  IF cal.coverage='whole_program'AND cal.known_academic_hours_total<>(s.program_proof->'facts_snapshot'->>'academic_hours')::numeric THEN PERFORM public.uc_group_education_error('PREREQUISITE_MISSING');END IF;
  calendar_id:=cal.id;payload:=jsonb_build_object('version_id',cal.id,'content_hash',cal.content_hash,'previous_published_id',s.published_calendar_id);
  applied:=public.uc_group_education_append(p_organization_id,p_group_id,event,'calendar_published',NULL,payload,p_action->>'reason',NULL,NULL,cal.id);
  UPDATE public.uc_group_calendar_versions SET published_at=observed,published_by=a WHERE id=cal.id;UPDATE public.uc_group_education_states SET published_calendar_id=cal.id WHERE group_id=p_group_id;
 ELSIF kind='capture_roster_snapshot'THEN
  context:=public.uc_group_education_roster_context(p_organization_id,p_group_id,p_action->'as_of',(p_action->>'knowledge_revision')::bigint,NULL,1000);
  IF context->'page'->>'coverage'<>'complete_observed'THEN PERFORM public.uc_group_education_error(CASE context->'page'->>'coverage'WHEN'unknown_legacy'THEN'LEGACY_HISTORY_UNKNOWN'WHEN'unknown_gap'THEN'COVERAGE_GAP'ELSE'SOURCE_UNAVAILABLE'END);END IF;
  SELECT * INTO cal FROM public.uc_group_calendar_versions WHERE id=(p_action->>'calendar_version_id')::uuid AND organization_id=p_organization_id AND group_id=p_group_id FOR SHARE NOWAIT;
  IF cal.published_at IS NULL OR cal.redacted OR cal.content_hash IS DISTINCT FROM p_action->>'expected_calendar_hash'OR p_action->'expected_program_ref'IS DISTINCT FROM context->'program_ref'OR cal.program_ref IS DISTINCT FROM context->'program_ref'OR p_action->>'purpose'NOT IN('document_batch','lesson_roster','assessment_draft')THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  FOR l IN SELECT x FROM jsonb_array_elements(cal.lessons)x WHERE x->>'status'='planned'LOOP
   IF l->'teacher_user_id'='null'OR l->>'teacher_label_state'<>'available'OR NOT public.uc_group_education_teacher_allowed((l->>'teacher_user_id')::uuid,p_organization_id,p_group_id)THEN PERFORM public.uc_group_education_error('PREREQUISITE_MISSING');END IF;
  END LOOP;
  rows:=context->'rows';IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows)x WHERE x->>'association'<>'confirmed'OR x->>'label_state'<>'available'OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=(x->>'user_id')::uuid))THEN PERFORM public.uc_group_education_error('PREREQUISITE_MISSING');END IF;
  proof:=context->'program_proof';
  PERFORM 1 FROM public.program_fact_versions WHERE id=(proof->>'version_id')::uuid FOR SHARE NOWAIT;
  PERFORM 1 FROM public.org_documents WHERE id=(proof->>'file_document_id')::uuid FOR SHARE NOWAIT;
  PERFORM 1 FROM public.org_document_versions WHERE id=(proof->>'file_version_id')::uuid FOR SHARE NOWAIT;
  PERFORM 1 FROM public.org_document_reviews WHERE id=(proof->>'file_review_id')::uuid FOR SHARE NOWAIT;
  PERFORM 1 FROM storage.objects WHERE id=(SELECT storage_object_id FROM public.org_document_versions WHERE id=(proof->>'file_version_id')::uuid)FOR SHARE NOWAIT;
  SELECT coalesce(array_agg(DISTINCT(x->>'program_enrollment_snapshot_id')::uuid ORDER BY(x->>'program_enrollment_snapshot_id')::uuid),'{}')INTO ids FROM jsonb_array_elements(rows)x;
  proof:=proof||jsonb_build_object('enrollment_snapshot_ids',to_jsonb(ids));
  IF NOT public.uc_group_education_retained_program_valid(p_organization_id,p_group_id,g.course_id,proof)THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
  snap:=gen_random_uuid();calendar_id:=cal.id;payload:=jsonb_build_object('schema_version',1,'scope',public.uc_group_education_scope(p_organization_id,p_group_id,g.course_id),'snapshot_id',snap,'as_of',context->'page'->'as_of','timezone',context->'page'->'timezone','knowledge_revision',p_action->'knowledge_revision','coverage_segment_id',context->'page'->'coverage_segment_id','coverage_known_from',context->'page'->'coverage_known_from','calendar_version_id',cal.id,'calendar_hash',cal.content_hash,'program_ref',context->'program_ref','program_proof',proof,'roster_hash',public.uc_program_hash(rows),'purpose',p_action->'purpose');
  INSERT INTO public.uc_group_roster_snapshots(id,organization_id,group_id,course_id,as_of,timezone,knowledge_revision,coverage_segment_id,coverage_known_from,calendar_version_id,calendar_hash,program_ref,program_proof,roster_rows,roster_hash,source_hash,source_input,row_count,purpose,recorded_by)
  VALUES(snap,p_organization_id,p_group_id,g.course_id,(context->'page'->>'as_of')::timestamptz,context->'page'->>'timezone',(p_action->>'knowledge_revision')::bigint,(context->'page'->>'coverage_segment_id')::uuid,(context->'page'->>'coverage_known_from')::timestamptz,cal.id,cal.content_hash,context->'program_ref',proof,rows,public.uc_program_hash(rows),public.uc_program_hash(payload),payload,jsonb_array_length(rows),p_action->>'purpose',a);
  payload:=jsonb_build_object('snapshot_id',snap,'source_hash',public.uc_program_hash(payload),'as_of',context->'page'->'as_of','knowledge_revision',p_action->'knowledge_revision');
  applied:=public.uc_group_education_append(p_organization_id,p_group_id,event,'roster_captured',NULL,payload,p_action->>'reason',NULL,NULL,cal.id,snap);
 ELSE PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 receipt:=jsonb_build_object('request_id',p_request_id,'action',kind,'input_hash',input_hash,'revision_applied',applied,'event_id',event,'calendar_version_id',calendar_id,'snapshot_id',snap,'replayed',false);
 INSERT INTO public.uc_group_education_requests(row_kind,organization_id,group_id,course_id,actor_id,request_id,action,expected_revision,input_hash,body,receipt,actor_ids,subject_ids,teacher_ids)
 VALUES('command',p_organization_id,p_group_id,g.course_id,a,p_request_id,kind,p_expected_revision,input_hash,body,receipt,ARRAY[a],
 CASE WHEN kind='correct_membership_time'THEN coalesce(accounts,'{}')WHEN kind IN('initialize_history','recover_coverage','capture_roster_snapshot')THEN ARRAY(SELECT DISTINCT(x->>'user_id')::uuid FROM jsonb_array_elements(coalesce(rows,'[]'))x WHERE x->>'user_id'IS NOT NULL ORDER BY 1)ELSE'{}'::uuid[]END,
 CASE WHEN kind IN('save_calendar_version','publish_calendar_version')THEN coalesce(accounts,'{}')WHEN kind='capture_roster_snapshot'THEN ARRAY(SELECT DISTINCT(x->>'teacher_user_id')::uuid FROM jsonb_array_elements(coalesce(cal.lessons,'[]'))x WHERE x->>'teacher_user_id'IS NOT NULL ORDER BY 1)ELSE'{}'::uuid[]END);
 RETURN jsonb_build_object('schema_version',1,'envelope',public.uc_group_education_envelope(p_organization_id,p_group_id),'receipt',receipt,'event',public.uc_group_education_event(event));
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END;$fn$;

CREATE FUNCTION public.uc_group_education_retained_program_valid(p_org uuid,p_group uuid,p_course uuid,p_proof jsonb)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p_proof->>'organization_id'=p_org::text AND p_proof->>'group_id'=p_group::text AND p_proof->>'course_id'=p_course::text AND p_proof->>'state'='confirmed'
 AND EXISTS(SELECT 1 FROM public.program_fact_versions v WHERE v.id=(p_proof->>'version_id')::uuid AND v.organization_id=p_org AND v.program_id=(p_proof->>'program_id')::uuid AND v.state='approved'
 AND v.file_document_id=(p_proof->>'file_document_id')::uuid AND v.file_version_id=(p_proof->>'file_version_id')::uuid AND v.file_review_id=(p_proof->>'file_review_id')::uuid
 AND v.facts_hash=p_proof->>'facts_hash'AND v.facts IS NOT DISTINCT FROM p_proof->'facts_snapshot')
 AND public.uc_program_file_proof(p_org,(p_proof->>'file_version_id')::uuid),false)
$fn$;
CREATE FUNCTION public.uc_group_education_roster_context(p_org uuid,p_group uuid,p_as_of jsonb,p_revision bigint,p_after uuid,p_limit integer)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.uc_group_education_states;base public.uc_group_education_events;ev record;item jsonb;old_item jsonb;data jsonb:='{}';rows jsonb:='[]';page_rows jsonb:='[]';gap jsonb;coverage text:='complete_observed';known timestamptz;as_of timestamptz;zone text;pre jsonb:='[]';n integer:=0;archived integer:=0;next_id uuid;effective timestamptz;correction uuid;refs jsonb;scope jsonb;more boolean:=false;proof jsonb;
BEGIN
 IF NOT public.uc_group_education_actor_allowed(auth.uid(),p_org,p_group,false)THEN PERFORM public.uc_group_education_error('ACCESS_DENIED');END IF;
 SELECT * INTO s FROM public.uc_group_education_states WHERE organization_id=p_org AND group_id=p_group;IF NOT FOUND THEN PERFORM public.uc_group_education_error('PREREQUISITE_MISSING');END IF;
 IF public.uc_group_education_own_source(p_group)THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
 IF p_revision IS NULL OR p_revision<1 OR p_revision>s.revision OR p_limit NOT BETWEEN 1 AND 1000 THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 IF p_as_of->>'kind'='current'THEN
  IF NOT public.uc_admission_shape(p_as_of,ARRAY['kind'])OR p_after IS NOT NULL THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;as_of:=clock_timestamp();zone:=s.timezone;
 ELSIF p_as_of->>'kind'='at'THEN
  IF NOT public.uc_admission_shape(p_as_of,ARRAY['kind','at','timezone'])OR NOT public.uc_group_education_valid_zone(p_as_of->>'timezone')OR p_as_of->>'at'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$'THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;as_of:=(p_as_of->>'at')::timestamptz;zone:=p_as_of->>'timezone';
  IF NOT isfinite(as_of)OR as_of>clock_timestamp()THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 ELSE PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 scope:=public.uc_group_education_scope(p_org,p_group,s.course_id);
 IF s.active_gap IS NOT NULL AND as_of>=(s.active_gap->>'started_at')::timestamptz THEN gap:=s.active_gap;END IF;
 IF gap IS NULL THEN SELECT e.payload->'gap'INTO gap FROM public.uc_group_education_events e WHERE e.group_id=p_group AND e.action='coverage_recovered'AND as_of>=(e.payload->'gap'->>'started_at')::timestamptz AND as_of<(e.payload->'gap'->>'recovered_at')::timestamptz ORDER BY e.revision DESC LIMIT 1;END IF;
 SELECT * INTO base FROM public.uc_group_education_events e WHERE e.organization_id=p_org AND e.group_id=p_group AND e.action IN('initialized','coverage_recovered')AND e.revision<=p_revision AND e.effective_at<=as_of ORDER BY e.effective_at DESC,e.revision DESC LIMIT 1;
 SELECT min(effective_at)INTO known FROM public.uc_group_education_events WHERE group_id=p_group AND action='initialized';known:=coalesce(base.effective_at,known,s.coverage_known_from);
 IF gap IS NOT NULL THEN coverage:='unknown_gap';pre:=jsonb_build_array(public.uc_group_education_prerequisite('COVERAGE_GAP'));
 ELSIF base.id IS NULL THEN coverage:='unknown_legacy';pre:=jsonb_build_array(public.uc_group_education_prerequisite('LEGACY_HISTORY_UNKNOWN'));
 ELSIF base.redacted OR base.source_snapshot IS NULL THEN coverage:='source_unavailable';pre:=jsonb_build_array(public.uc_group_education_prerequisite('SOURCE_ERASED'));
 END IF;
 IF coverage='complete_observed'THEN
  IF base.source_snapshot_hash IS DISTINCT FROM public.uc_program_hash(base.source_snapshot)THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
  proof:=base.source_snapshot->'program_proof';
  IF NOT public.uc_group_education_retained_program_valid(p_org,p_group,s.course_id,proof)THEN coverage:='source_unavailable';pre:=jsonb_build_array(public.uc_group_education_prerequisite('PROGRAM_SOURCE_UNAVAILABLE','program'));ELSE
   FOR item IN SELECT x FROM jsonb_array_elements(base.source_snapshot->'rows')x LOOP data:=data||jsonb_build_object(item->>'user_id',item||jsonb_build_object('_baseline_event_id',base.id,'_membership_event_id',NULL,'_association_event_id',NULL,'_correction_event_id',NULL));END LOOP;
   FOR ev IN
    SELECT e.*,coalesce((SELECT(c.payload->>'corrected_effective_at')::timestamptz FROM public.uc_group_education_events c WHERE c.action='membership_time_corrected'AND c.source_event_id=e.id AND c.revision<=p_revision AND NOT c.redacted ORDER BY c.revision DESC LIMIT 1),e.effective_at)actual_effective,
    (SELECT c.id FROM public.uc_group_education_events c WHERE c.action='membership_time_corrected'AND c.source_event_id=e.id AND c.revision<=p_revision AND NOT c.redacted ORDER BY c.revision DESC LIMIT 1)correction_id
    FROM public.uc_group_education_events e WHERE e.group_id=p_group AND e.revision>base.revision AND e.revision<=p_revision AND e.action IN('membership_observed','association_observed')AND public.uc_group_education_event_complete(e.source_receipt_id)
    ORDER BY actual_effective,e.revision
   LOOP
    IF ev.actual_effective>as_of THEN CONTINUE;END IF;
    IF ev.redacted OR ev.subject_user_id IS NULL THEN coverage:='source_unavailable';pre:=jsonb_build_array(public.uc_group_education_prerequisite('SOURCE_ERASED'));EXIT;END IF;
    old_item:=data->ev.subject_user_id::text;
    IF ev.action='association_observed'THEN
     IF old_item IS NULL THEN CONTINUE;END IF;
     item:=old_item||jsonb_build_object('enrollment_id',ev.payload->'enrollment_id','program_enrollment_snapshot_id',ev.payload->'program_enrollment_snapshot_id','association',CASE WHEN ev.payload->'enrollment_id'='null'THEN'no_exact_enrollment'WHEN ev.payload->'program_enrollment_snapshot_id'='null'THEN'no_program_snapshot'ELSE'confirmed'END,'_association_event_id',ev.id);
    ELSE
     item:=ev.next_row||jsonb_build_object('_baseline_event_id',base.id,'_membership_event_id',ev.id,'_association_event_id',old_item->'_association_event_id','_correction_event_id',ev.correction_id);
     IF ev.payload->>'change'='join'THEN item:=item||jsonb_build_object('effective_from',ev.actual_effective,'effective_until',NULL);ELSIF ev.payload->>'change'='leave'THEN item:=item||jsonb_build_object('effective_until',ev.actual_effective);END IF;
     IF ev.correction_id IS NOT NULL THEN item:=item||jsonb_build_object('membership_basis','corrected');END IF;
    END IF;
    data:=data||jsonb_build_object(ev.subject_user_id::text,item);
   END LOOP;
   IF coverage='complete_observed'THEN
    FOR item IN SELECT value FROM jsonb_each(data)ORDER BY key LOOP
     IF NOT coalesce((item->>'present')::boolean,false)THEN CONTINUE;END IF;
     IF(item->>'archived')::boolean THEN archived:=archived+1;CONTINUE;END IF;
     n:=n+1;
     SELECT coalesce(jsonb_agg(x ORDER BY x),'[]')INTO refs FROM(SELECT DISTINCT value x FROM jsonb_array_elements(jsonb_build_array(item->'_baseline_event_id',item->'_membership_event_id',item->'_association_event_id',item->'_correction_event_id'))WHERE value<>'null')r;
     item:=public.uc_group_education_public_row(item)||jsonb_build_object('source_event_ids',refs);rows:=rows||jsonb_build_array(item);
    END LOOP;
    IF n+archived>1000 THEN coverage:='source_unavailable';pre:=jsonb_build_array(public.uc_group_education_prerequisite('ROSTER_LIMIT_EXCEEDED'));END IF;
   END IF;
  END IF;
 END IF;
 IF coverage='complete_observed'THEN
  FOR item IN SELECT x FROM jsonb_array_elements(rows)x WHERE p_after IS NULL OR(x->>'user_id')::uuid>p_after ORDER BY x->>'user_id'LIMIT p_limit+1 LOOP
   IF jsonb_array_length(page_rows)=p_limit THEN more:=true;EXIT;END IF;page_rows:=page_rows||jsonb_build_array(item);next_id:=(item->>'user_id')::uuid;END LOOP;
 ELSE rows:='[]';page_rows:='[]';n:=0;archived:=0;END IF;
 RETURN jsonb_build_object('page',jsonb_build_object('schema_version',1,'scope',scope,'as_of',as_of,'timezone',zone,'knowledge_revision',p_revision,'coverage',coverage,'coverage_known_from',known,'rows',page_rows,'next_after_user_id',CASE WHEN more THEN next_id END,'prerequisites',pre,'excluded_archived_count',public.uc_group_education_count(archived,coverage='complete_observed'),'coverage_segment_id',CASE WHEN coverage='complete_observed'THEN base.id END,'coverage_gap',gap,'count',public.uc_group_education_count(n,coverage='complete_observed')),
 'rows',rows,'program_ref',base.source_snapshot->'program_ref','program_proof',proof,'baseline_id',base.id);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END;$fn$;

CREATE FUNCTION public.uc_group_education_source_relevant(p_table text,p_old jsonb,p_new jsonb)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
BEGIN
 IF p_table='profiles'THEN
  IF p_old IS NULL THEN RETURN p_new->>'student_group_id'IS NOT NULL;END IF;IF p_new IS NULL THEN RETURN true;END IF;
  RETURN(p_old->'user_id',p_old->'organization_id',p_old->'student_group_id',p_old->>'archived_at'IS NOT NULL)IS DISTINCT FROM(p_new->'user_id',p_new->'organization_id',p_new->'student_group_id',p_new->>'archived_at'IS NOT NULL);
 ELSIF p_table='student_group_memberships'THEN RETURN p_old IS NULL OR p_new IS NULL OR(p_old->'organization_id',p_old->'group_id',p_old->'user_id')IS DISTINCT FROM(p_new->'organization_id',p_new->'group_id',p_new->'user_id');
 ELSIF p_table='enrollments'THEN RETURN p_old IS NULL OR p_new IS NULL OR(p_old->'id',p_old->'user_id',p_old->'course_id')IS DISTINCT FROM(p_new->'id',p_new->'user_id',p_new->'course_id');
 ELSIF p_table='student_groups'THEN RETURN p_old IS NULL OR p_new IS NULL OR(p_old->'id',p_old->'organization_id',p_old->'course_id',p_old->'start_date',p_old->'end_date',p_old->'training_dates',p_old->'schedule_text',p_old->'instructor_name')IS DISTINCT FROM(p_new->'id',p_new->'organization_id',p_new->'course_id',p_new->'start_date',p_new->'end_date',p_new->'training_dates',p_new->'schedule_text',p_new->'instructor_name');
 ELSIF p_table='courses'THEN RETURN p_old IS NULL OR p_new IS NULL OR(p_old->'id',p_old->'organization_id')IS DISTINCT FROM(p_new->'id',p_new->'organization_id');
 ELSIF p_table='organizations'THEN RETURN p_old IS NULL OR p_new IS NULL OR p_old->'id'IS DISTINCT FROM p_new->'id';
 ELSIF p_table='group_program_bindings'THEN RETURN p_old IS NULL OR p_new IS NULL OR(p_old-ARRAY['recorded_at','recorded_by'])IS DISTINCT FROM(p_new-ARRAY['recorded_at','recorded_by']);
 ELSIF p_table='group_program_enrollment_snapshots'THEN RETURN true;
 END IF;RETURN false;END;$fn$;
CREATE FUNCTION public.uc_group_education_source_scopes(p_table text,p_old jsonb,p_new jsonb)RETURNS TABLE(organization_id uuid,group_id uuid,course_id uuid)LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE users uuid[]:=array_remove(ARRAY[(p_old->>'user_id')::uuid,(p_new->>'user_id')::uuid],NULL);groups uuid[]:=array_remove(ARRAY[(p_old->>'group_id')::uuid,(p_new->>'group_id')::uuid],NULL);orgs uuid[]:=array_remove(ARRAY[(p_old->>'organization_id')::uuid,(p_new->>'organization_id')::uuid],NULL);courses uuid[]:=array_remove(ARRAY[(p_old->>'course_id')::uuid,(p_new->>'course_id')::uuid],NULL);
BEGIN
 IF p_table='profiles'THEN
  groups:=array_remove(ARRAY[(p_old->>'student_group_id')::uuid,(p_new->>'student_group_id')::uuid],NULL);
  RETURN QUERY SELECT s.organization_id,s.group_id,s.course_id FROM public.uc_group_education_states s WHERE s.organization_id=ANY(orgs)AND(s.group_id=ANY(groups)OR EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=s.organization_id AND m.group_id=s.group_id AND m.user_id=ANY(users))OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.source_rows,'[]'))x WHERE(x->>'user_id')::uuid=ANY(users)))ORDER BY s.group_id;
 ELSIF p_table IN('student_group_memberships','group_program_bindings','group_program_enrollment_snapshots')THEN
  RETURN QUERY SELECT s.organization_id,s.group_id,s.course_id FROM public.uc_group_education_states s WHERE s.group_id=ANY(groups)AND s.organization_id=ANY(orgs)ORDER BY s.group_id;
 ELSIF p_table='enrollments'THEN
  RETURN QUERY SELECT s.organization_id,s.group_id,s.course_id FROM public.uc_group_education_states s WHERE s.course_id=ANY(courses)AND(EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=s.organization_id AND m.group_id=s.group_id AND m.user_id=ANY(users))OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.source_rows,'[]'))x WHERE(x->>'user_id')::uuid=ANY(users)))ORDER BY s.group_id;
 ELSIF p_table='student_groups'THEN
  RETURN QUERY SELECT s.organization_id,s.group_id,s.course_id FROM public.uc_group_education_states s WHERE s.group_id=ANY(array_remove(ARRAY[(p_old->>'id')::uuid,(p_new->>'id')::uuid],NULL))AND s.organization_id=ANY(orgs)ORDER BY s.group_id;
 ELSIF p_table='courses'THEN
  RETURN QUERY SELECT s.organization_id,s.group_id,s.course_id FROM public.uc_group_education_states s WHERE s.course_id=ANY(array_remove(ARRAY[(p_old->>'id')::uuid,(p_new->>'id')::uuid],NULL))AND s.organization_id=ANY(orgs)ORDER BY s.group_id;
 ELSIF p_table='organizations'THEN
  RETURN QUERY SELECT s.organization_id,s.group_id,s.course_id FROM public.uc_group_education_states s WHERE s.organization_id=ANY(array_remove(ARRAY[(p_old->>'id')::uuid,(p_new->>'id')::uuid],NULL))ORDER BY s.group_id;
 END IF;
END;$fn$;
CREATE FUNCTION public.uc_group_education_open_gap(p_org uuid,p_group uuid,p_started timestamptz,p_last_complete bigint,p_reason text,p_actor uuid DEFAULT NULL,p_origin text DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.uc_group_education_states;gap jsonb;
BEGIN SELECT * INTO s FROM public.uc_group_education_states WHERE organization_id=p_org AND group_id=p_group FOR UPDATE NOWAIT;
 IF s.active_gap IS NOT NULL THEN RETURN s.active_gap;END IF;
 gap:=jsonb_build_object('id',gen_random_uuid(),'started_at',p_started,'last_complete_revision',p_last_complete,'reason',p_reason,'recovered_at',NULL,'recovery_revision',NULL,'recovery_segment_id',NULL);
 UPDATE public.uc_group_education_states SET active_gap=gap,coverage_segment_id=NULL,source_rows=NULL WHERE group_id=p_group;
 IF s.revision<9007199254740991 THEN PERFORM public.uc_group_education_append(p_org,p_group,gen_random_uuid(),'coverage_gap',p_started,jsonb_build_object('gap',gap),NULL,NULL,NULL,NULL,NULL,NULL,NULL,p_actor,p_origin);END IF;
 RETURN gap;END;$fn$;
CREATE FUNCTION public.uc_group_education_source_queue(p_org uuid,p_group uuid,p_users uuid[],p_source text,p_table text,p_old jsonb,p_new jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.uc_group_education_states;r public.uc_group_education_requests;p public.uc_group_education_requests;b public.uc_group_education_requests;q public.uc_group_education_requests;ctx jsonb;rc jsonb;contributors jsonb;fact jsonb;fact_index integer;u uuid;before_row jsonb;d jsonb;first_at timestamptz;last_complete bigint;reason text;gap jsonb;actor uuid:=auth.uid();origin text:=CASE auth.role()WHEN'authenticated'THEN'authenticated'WHEN'service_role'THEN'service'ELSE'system'END;counted integer;admitted integer;live integer;detail_bytes bigint;old_bytes integer;fields jsonb:='[]';k text;
BEGIN
 SELECT * INTO s FROM public.uc_group_education_states WHERE group_id=p_group AND organization_id=p_org FOR UPDATE NOWAIT;IF NOT FOUND THEN RETURN;END IF;
 IF EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind='public_operation'AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text)THEN RAISE EXCEPTION 'GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED' USING ERRCODE='25000';END IF;
 SELECT * INTO r FROM public.uc_group_education_requests WHERE row_kind='source_transaction_receipt'AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text FOR UPDATE NOWAIT;
 IF r.id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind IN('source_pending','source_detail')AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text)THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  first_at:=clock_timestamp();last_complete:=coalesce((s.active_gap->>'last_complete_revision')::bigint,s.revision);
  rc:=jsonb_build_object('schema_version',1,'status','pending','first_observed_at',first_at,'initial_revision',s.revision,'last_complete_revision_before_tx',last_complete,'last_complete_segment_before_tx',s.coverage_segment_id,'source_observation_counter',0,'first_flushed_observation_counter',NULL,'first_flush_event_revision_range',NULL,'gap_id',s.active_gap->'id','last_actor_id',actor,'last_origin',origin,'group_admitted_detail_count',0);
  INSERT INTO public.uc_group_education_requests(row_kind,organization_id,group_id,course_id,backend_pid,full_transaction_id,context,actor_ids)VALUES('source_transaction_receipt',p_org,p_group,s.course_id,pg_backend_pid(),pg_current_xact_id()::text,rc,array_remove(ARRAY[actor],NULL))RETURNING * INTO r;
 ELSE rc:=r.context;first_at:=(rc->>'first_observed_at')::timestamptz;last_complete:=(rc->>'last_complete_revision_before_tx')::bigint;END IF;
 rc:=rc||jsonb_build_object('source_observation_counter',least(9007199254740991,(rc->>'source_observation_counter')::numeric+1),'last_actor_id',actor,'last_origin',origin);
 reason:=CASE WHEN s.active_gap IS NOT NULL THEN s.active_gap->>'reason'WHEN rc->'first_flushed_observation_counter'<>'null'THEN'history_detail_budget'WHEN p_table='group_program_bindings'THEN'source_changed'WHEN p_new IS NULL AND p_table IN('student_groups','courses','organizations')THEN'source_unavailable'WHEN p_table='student_groups'AND p_old IS NOT NULL AND(p_old->'id',p_old->'organization_id',p_old->'course_id')IS DISTINCT FROM(p_new->'id',p_new->'organization_id',p_new->'course_id')THEN'source_changed'END;
 IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=ANY(p_users))THEN reason:='source_unavailable';END IF;
 -- An existing malformed receipt must never reset an admission counter.
 IF coalesce(jsonb_typeof(rc->'group_admitted_detail_count')='number'AND rc->>'group_admitted_detail_count'~'^(0|[1-9][0-9]{0,3})$',false)THEN admitted:=(rc->>'group_admitted_detail_count')::integer;IF admitted>1000 THEN admitted:=NULL;END IF;END IF;
 IF admitted IS NULL THEN reason:=coalesce(reason,'history_detail_budget');END IF;
 SELECT * INTO p FROM public.uc_group_education_requests WHERE row_kind='source_pending'AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text FOR UPDATE NOWAIT;
 IF p.id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind='source_detail'AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text)THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  ctx:=jsonb_build_object('schema_version',1,'mode','detail','first_observed_at',first_at,'initial_revision',s.revision,'source_table_mask','[]'::jsonb,'contributors','[]'::jsonb,'legacy_fields','[]'::jsonb,'gap',NULL,'live_detail_count',0,'detail_map_serialized_bytes',2);
  -- A detail row always has both exact headers before it is inserted.
  INSERT INTO public.uc_group_education_requests(row_kind,organization_id,group_id,course_id,backend_pid,full_transaction_id,context,actor_ids)VALUES('source_pending',p_org,p_group,s.course_id,pg_backend_pid(),pg_current_xact_id()::text,ctx,array_remove(ARRAY[actor],NULL))RETURNING * INTO p;
 ELSE ctx:=p.context;END IF;
 IF p.organization_id IS DISTINCT FROM p_org OR p.course_id IS DISTINCT FROM s.course_id OR r.organization_id IS DISTINCT FROM p_org OR r.course_id IS DISTINCT FROM s.course_id THEN reason:=coalesce(reason,'source_changed');END IF;
 IF ctx->>'mode'='gap'THEN reason:=coalesce(reason,ctx->'gap'->>'reason','history_detail_budget');END IF;
 IF ctx?'details'OR coalesce(ctx->>'mode'NOT IN('detail','gap'),true)THEN reason:=coalesce(reason,'source_changed');END IF;
 IF coalesce(jsonb_typeof(ctx->'live_detail_count')='number'AND ctx->>'live_detail_count'~'^(0|[1-9][0-9]{0,3})$',false)AND coalesce(jsonb_typeof(ctx->'detail_map_serialized_bytes')='number'AND ctx->>'detail_map_serialized_bytes'~'^[0-9]{1,8}$',false)THEN live:=(ctx->>'live_detail_count')::integer;detail_bytes:=(ctx->>'detail_map_serialized_bytes')::bigint;IF live>1000 OR detail_bytes<2 OR detail_bytes>2097152 OR(live=0 AND detail_bytes<>2)THEN live:=NULL;END IF;END IF;
 IF live IS NULL THEN reason:=coalesce(reason,'source_changed');END IF;
 contributors:=coalesce(ctx->'contributors','[]');
 IF reason IS NULL THEN
  fact:=jsonb_build_object('actor_id',actor,'origin',origin,'authority',public.uc_group_education_authority(p_org,p_group,actor)-'observed_at');
  SELECT ordinal::integer-1 INTO fact_index FROM jsonb_array_elements(contributors)WITH ORDINALITY AS x(value,ordinal)WHERE value=fact LIMIT 1;
  IF fact_index IS NULL THEN IF jsonb_array_length(contributors)>=32 OR octet_length(fact::text)>8192 THEN reason:='history_detail_budget';ELSE fact_index:=jsonb_array_length(contributors);contributors:=contributors||jsonb_build_array(fact);END IF;END IF;
 END IF;
 INSERT INTO public.uc_group_education_requests(row_kind,backend_pid,full_transaction_id,context)VALUES('source_transaction_budget',pg_backend_pid(),pg_current_xact_id()::text,jsonb_build_object('schema_version',1,'admitted_detail_count',0))ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM public.uc_group_education_requests WHERE row_kind='source_transaction_budget'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text FOR UPDATE NOWAIT;
 IF coalesce(jsonb_typeof(b.context->'admitted_detail_count')='number'AND b.context->>'admitted_detail_count'~'^(0|[1-9][0-9]{0,4})$',false)THEN counted:=(b.context->>'admitted_detail_count')::integer;IF counted>10000 THEN counted:=NULL;END IF;END IF;
 IF counted IS NULL THEN reason:=coalesce(reason,'history_detail_budget');END IF;
 IF reason IS NULL THEN
  FOR u IN SELECT DISTINCT x FROM unnest(p_users)x WHERE x IS NOT NULL ORDER BY x LOOP
   SELECT * INTO q FROM public.uc_group_education_requests WHERE row_kind='source_detail'AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text AND request_id=u FOR UPDATE NOWAIT;
   IF q.id IS NULL THEN
    IF admitted>=1000 OR counted>=10000 THEN reason:='history_detail_budget';EXIT;END IF;
    SELECT x INTO before_row FROM jsonb_array_elements(coalesce(s.source_rows,'[]'))x WHERE x->>'user_id'=u::text;
    d:=jsonb_build_object('first_before',before_row,'membership_source',NULL,'association_source',NULL,'last_contributor_index',NULL);old_bytes:=0;admitted:=admitted+1;counted:=counted+1;
   ELSE
    IF q.organization_id IS DISTINCT FROM p_org OR q.course_id IS DISTINCT FROM s.course_id THEN reason:='source_changed';EXIT;END IF;
    d:=q.context->'detail';old_bytes:=octet_length(d::text);
   END IF;
   IF p_source IN('primary','additional','profile_archive','registration','group_lifecycle')THEN d:=d||jsonb_build_object('membership_source',p_source);END IF;
   IF p_source IN('enrollment','program_association')THEN d:=d||jsonb_build_object('association_source',p_source);END IF;
   d:=d||jsonb_build_object('last_contributor_index',fact_index);
   IF q.id IS NULL THEN
    detail_bytes:=CASE WHEN live=0 THEN octet_length(d::text)+42 ELSE detail_bytes+octet_length(d::text)+42 END;live:=live+1;
    INSERT INTO public.uc_group_education_requests(row_kind,organization_id,group_id,course_id,request_id,backend_pid,full_transaction_id,context,subject_ids)VALUES('source_detail',p_org,p_group,s.course_id,u,pg_backend_pid(),pg_current_xact_id()::text,jsonb_build_object('schema_version',1,'subject_user_id',u,'detail',d),ARRAY[u]);
   ELSE
    detail_bytes:=detail_bytes+octet_length(d::text)-old_bytes;
    UPDATE public.uc_group_education_requests SET context=jsonb_build_object('schema_version',1,'subject_user_id',u,'detail',d)WHERE id=q.id AND context IS DISTINCT FROM jsonb_build_object('schema_version',1,'subject_user_id',u,'detail',d);
   END IF;
  END LOOP;
 END IF;
 IF counted IS NOT NULL AND to_jsonb(counted)IS DISTINCT FROM b.context->'admitted_detail_count'THEN UPDATE public.uc_group_education_requests SET context=b.context||jsonb_build_object('admitted_detail_count',counted)WHERE id=b.id;END IF;
 IF admitted IS NOT NULL THEN rc:=rc||jsonb_build_object('group_admitted_detail_count',admitted);END IF;
 fields:=coalesce(ctx->'legacy_fields','[]');
 IF p_table='student_groups'AND p_old IS NOT NULL AND p_new IS NOT NULL THEN FOREACH k IN ARRAY ARRAY['start_date','end_date','training_dates','schedule_text','instructor_name']LOOP IF p_old->k IS DISTINCT FROM p_new->k AND NOT(fields? k) THEN fields:=fields||to_jsonb(k);END IF;END LOOP;END IF;
 ctx:=ctx||jsonb_build_object('contributors',contributors,'legacy_fields',fields,'live_detail_count',live,'detail_map_serialized_bytes',detail_bytes,'source_table_mask',(SELECT coalesce(jsonb_agg(x ORDER BY x),'[]')FROM(SELECT DISTINCT value x FROM jsonb_array_elements(coalesce(ctx->'source_table_mask','[]')||to_jsonb(p_table)))q));
 -- UUID object entry contributes38 key bytes+2 colon+2 delimiter; braces
 -- cancel the last delimiter. Account exact UTF8 jsonb bytes, not characters.
 IF reason IS NULL AND octet_length(((ctx-ARRAY['live_detail_count','detail_map_serialized_bytes'])||jsonb_build_object('details','{}'::jsonb))::text)-2+detail_bytes>2097152 THEN reason:='history_detail_budget';END IF;
 IF reason IS NOT NULL THEN
  DELETE FROM public.uc_group_education_requests WHERE row_kind='source_detail'AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text;
  gap:=public.uc_group_education_open_gap(p_org,p_group,first_at,last_complete,reason,actor,origin);ctx:=jsonb_build_object('schema_version',1,'mode','gap','first_observed_at',first_at,'initial_revision',rc->'initial_revision','source_table_mask',ctx->'source_table_mask','contributors','[]'::jsonb,'legacy_fields','[]'::jsonb,'gap',gap,'live_detail_count',0,'detail_map_serialized_bytes',2);rc:=rc||jsonb_build_object('status','gap','gap_id',gap->'id');
 END IF;
 UPDATE public.uc_group_education_requests SET context=rc,actor_ids=CASE WHEN reason IS NOT NULL THEN array_remove(ARRAY[actor],NULL)ELSE ARRAY(SELECT DISTINCT x FROM unnest(r.actor_ids||array_remove(ARRAY[actor],NULL))x ORDER BY x)END WHERE id=r.id;
 UPDATE public.uc_group_education_requests SET context=ctx,actor_ids=CASE WHEN reason IS NULL THEN ARRAY(SELECT DISTINCT x FROM unnest(p.actor_ids||array_remove(ARRAY[actor],NULL))x ORDER BY x)ELSE array_remove(ARRAY[actor],NULL)END WHERE id=p.id;
END;$fn$;

-- Integrated only by SQL116 owner. No operational authority is granted here.
CREATE INDEX uc_group_education_states_org ON public.uc_group_education_states(organization_id);
CREATE INDEX uc_group_education_states_course ON public.uc_group_education_states(course_id);

CREATE FUNCTION public.uc_group_education_erasing(p_user uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='service_role'AND auth.uid()IS NULL AND p_user IS NOT NULL
 AND current_setting('sintagma.account_deletion_erase_user',true)=p_user::text
 AND EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND EXISTS(SELECT 1 FROM public.uc_group_education_requests r WHERE r.row_kind='erase_context'AND r.backend_pid=pg_backend_pid()AND r.full_transaction_id=pg_current_xact_id_if_assigned()::text AND r.subject_ids=ARRAY[p_user]AND r.context->>'p_user'=p_user::text AND r.context->>'cleanup_job_id'IS NOT NULL),false)
$fn$;
CREATE FUNCTION public.uc_group_education_source_before()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE oldj jsonb:=CASE WHEN TG_OP<>'INSERT'THEN to_jsonb(OLD)END;newj jsonb:=CASE WHEN TG_OP<>'DELETE'THEN to_jsonb(NEW)END;scopes jsonb;fresh jsonb;users uuid[];accounts uuid[];orgs uuid[];groups uuid[];fresh_groups uuid[];a uuid;o uuid;g uuid;r record;origin text:=CASE auth.role()WHEN'authenticated'THEN'authenticated'WHEN'service_role'THEN'service'ELSE'system'END;source text;parent text;ctx jsonb;masked boolean:=false;
BEGIN
 IF NOT public.uc_group_education_source_relevant(TG_TABLE_NAME,oldj,newj)THEN IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 users:=array_remove(ARRAY[(oldj->>'user_id')::uuid,(newj->>'user_id')::uuid],NULL);
 IF cardinality(users)>0 THEN SELECT bool_and(public.uc_group_education_erasing(x))INTO masked FROM unnest(users)x;END IF;
 IF coalesce(masked,false)THEN
  IF TG_TABLE_NAME='profiles'AND TG_OP='DELETE'THEN
   INSERT INTO public.uc_group_education_requests(row_kind,backend_pid,full_transaction_id,action,request_id,context,subject_ids)
   VALUES('source_parent',pg_backend_pid(),pg_current_xact_id()::text,'profiles',coalesce(oldj->>'id',oldj->>'user_id')::uuid,jsonb_build_object('schema_version',1,'parent_table','profiles','parent_id',coalesce(oldj->>'id',oldj->>'user_id'),'old_tuple',jsonb_build_object('id',oldj->'id','user_id',oldj->'user_id','organization_id',oldj->'organization_id','student_group_id',oldj->'student_group_id'),'origin','service','actor_id',NULL,'observed_at',clock_timestamp()),users)ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;
 END IF;
 -- An old RR snapshot cannot prove absence of a newly initialized tracker. Fail
 -- before the state lookup, including apparently uninitialized relevant writes.
 IF current_setting('transaction_isolation')<>'read committed'THEN RAISE EXCEPTION 'GROUP_FACTS_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY x.group_id),'[]')INTO scopes FROM public.uc_group_education_source_scopes(TG_TABLE_NAME,oldj,newj)x;
 IF scopes='[]'THEN IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_TABLE_NAME IN('student_groups','courses','organizations')THEN
  SELECT coalesce(array_agg(DISTINCT u ORDER BY u),'{}')INTO users FROM(
   SELECT m.user_id u FROM public.student_group_memberships_effective m JOIN jsonb_to_recordset(scopes)AS s(organization_id uuid,group_id uuid,course_id uuid)ON s.organization_id=m.organization_id AND s.group_id=m.group_id
   UNION SELECT(x->>'user_id')::uuid FROM public.uc_group_education_states s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.source_rows,'[]'))x WHERE s.group_id IN(SELECT(v->>'group_id')::uuid FROM jsonb_array_elements(scopes)v))q WHERE u IS NOT NULL;
 END IF;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}')INTO accounts FROM unnest(array_append(users,auth.uid()))x WHERE x IS NOT NULL;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}')INTO groups FROM(
  SELECT(v->>'group_id')::uuid x FROM jsonb_array_elements(scopes)v
  UNION SELECT m.group_id FROM public.student_group_memberships_effective m WHERE m.user_id=ANY(users)
  UNION SELECT(oldj->>'student_group_id')::uuid UNION SELECT(newj->>'student_group_id')::uuid
  UNION SELECT(oldj->>'group_id')::uuid UNION SELECT(newj->>'group_id')::uuid)q WHERE x IS NOT NULL;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}')INTO orgs FROM(
  SELECT(v->>'organization_id')::uuid x FROM jsonb_array_elements(scopes)v UNION SELECT g.organization_id FROM public.student_groups g WHERE id=ANY(groups))q WHERE x IS NOT NULL;
 FOREACH a IN ARRAY accounts LOOP IF NOT pg_try_advisory_xact_lock(hashtextextended(a::text,42007))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
 FOREACH o IN ARRAY orgs LOOP IF NOT pg_try_advisory_xact_lock(hashtextextended(o::text,0))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
 FOREACH g IN ARRAY groups LOOP IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_program_roster:'||g::text,0))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY x.group_id),'[]')INTO fresh FROM public.uc_group_education_source_scopes(TG_TABLE_NAME,oldj,newj)x;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}')INTO fresh_groups FROM(
  SELECT(v->>'group_id')::uuid x FROM jsonb_array_elements(fresh)v UNION SELECT m.group_id FROM public.student_group_memberships_effective m WHERE m.user_id=ANY(users)
  UNION SELECT(oldj->>'student_group_id')::uuid UNION SELECT(newj->>'student_group_id')::uuid UNION SELECT(oldj->>'group_id')::uuid UNION SELECT(newj->>'group_id')::uuid)q WHERE x IS NOT NULL;
 IF fresh IS DISTINCT FROM scopes OR fresh_groups IS DISTINCT FROM groups THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 -- All source locks/old guards keep their original behavior. A witness contains
 -- provenance, never permission to bypass a parent/child authority guard.
 IF oldj IS NOT NULL AND TG_TABLE_NAME IN('profiles','student_groups','courses','organizations')AND(TG_OP='DELETE'OR oldj->'id'IS DISTINCT FROM newj->'id'OR oldj->'organization_id'IS DISTINCT FROM newj->'organization_id')THEN
  parent:=coalesce(oldj->>'id',oldj->>'user_id');ctx:=jsonb_build_object('schema_version',1,'parent_table',TG_TABLE_NAME,'parent_id',parent,'old_tuple',oldj,'tuple_hash',public.uc_program_hash(oldj),'actor_id',auth.uid(),'origin',origin,'observed_at',clock_timestamp());
  -- Parent rows can contain old free text; retain only the exact source tuple.
  ctx:=jsonb_set(ctx,'{old_tuple}',jsonb_build_object('id',oldj->'id','user_id',oldj->'user_id','organization_id',oldj->'organization_id','group_id',oldj->'group_id','student_group_id',oldj->'student_group_id','course_id',oldj->'course_id'));
  IF octet_length(ctx::text)>4096 THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  INSERT INTO public.uc_group_education_requests(row_kind,backend_pid,full_transaction_id,action,request_id,context,subject_ids,actor_ids)VALUES('source_parent',pg_backend_pid(),pg_current_xact_id()::text,TG_TABLE_NAME,parent::uuid,ctx,CASE WHEN TG_TABLE_NAME='profiles'THEN users ELSE'{}'END,array_remove(ARRAY[auth.uid()],NULL))ON CONFLICT DO NOTHING;
 END IF;
 source:=CASE TG_TABLE_NAME WHEN'profiles'THEN CASE WHEN oldj IS NOT NULL AND newj IS NOT NULL AND(oldj->>'archived_at'IS NOT NULL)IS DISTINCT FROM(newj->>'archived_at'IS NOT NULL)THEN'profile_archive'ELSE'primary'END WHEN'student_group_memberships'THEN'additional'WHEN'enrollments'THEN'enrollment'WHEN'group_program_enrollment_snapshots'THEN'program_association'ELSE'group_lifecycle'END;
 IF EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind='public_operation'AND group_id=ANY(groups)AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id_if_assigned()::text)THEN RAISE EXCEPTION 'GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED' USING ERRCODE='25000';END IF;
 INSERT INTO public.uc_group_education_requests(row_kind,backend_pid,full_transaction_id,context)VALUES('source_transaction_budget',pg_backend_pid(),pg_current_xact_id()::text,jsonb_build_object('schema_version',1,'admitted_detail_count',0))ON CONFLICT DO NOTHING;
 UPDATE public.uc_group_education_requests SET context=context||jsonb_build_object('statement_depth',least(coalesce((context->>'statement_depth')::integer,pg_trigger_depth()),pg_trigger_depth()),'statement_constraint_seen',coalesce((context->>'statement_constraint_seen')::boolean,false))WHERE row_kind='source_transaction_budget'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text AND(context->>'statement_depth'IS NULL OR(context->>'statement_depth')::integer>pg_trigger_depth()OR context->>'statement_constraint_seen'IS NULL);
 IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END;$fn$;

CREATE FUNCTION public.uc_group_education_source_fold()RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.uc_group_education_requests;r public.uc_group_education_requests;s public.uc_group_education_states;scan jsonb;newrows jsonb;oldrow jsonb;newrow jsonb;nextrow jsonb;ctx jsonb;detail jsonb;fact jsonb;u uuid;at_time timestamptz;event uuid;changes jsonb;change jsonb;kind text;source text;payload jsonb;counted integer;first_revision bigint;last_revision bigint;rev bigint;actor uuid;origin text;gap jsonb;newlabels uuid[];refs jsonb;finalrows jsonb;enrol uuid;snap uuid;unproven boolean;details jsonb;detail_count integer;detail_bytes bigint;joined record;working_user uuid;working_row jsonb;
BEGIN
 IF pg_current_xact_id_if_assigned()IS NULL THEN RETURN;END IF;
 -- A flush must not silently skip a staged subject whose private header was
 -- lost; exact SQL composition is required even when no new source row follows.
 IF EXISTS(SELECT 1 FROM public.uc_group_education_requests d WHERE d.row_kind='source_detail'AND d.backend_pid=pg_backend_pid()AND d.full_transaction_id=pg_current_xact_id()::text AND(
  NOT EXISTS(SELECT 1 FROM public.uc_group_education_requests header WHERE header.row_kind='source_pending'AND header.backend_pid=d.backend_pid AND header.full_transaction_id=d.full_transaction_id AND header.group_id=d.group_id AND header.organization_id=d.organization_id AND header.course_id=d.course_id)
  OR NOT EXISTS(SELECT 1 FROM public.uc_group_education_requests receipt_row WHERE receipt_row.row_kind='source_transaction_receipt'AND receipt_row.backend_pid=d.backend_pid AND receipt_row.full_transaction_id=d.full_transaction_id AND receipt_row.group_id=d.group_id AND receipt_row.organization_id=d.organization_id AND receipt_row.course_id=d.course_id)))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 FOR p IN SELECT * FROM public.uc_group_education_requests WHERE row_kind='source_pending'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text ORDER BY group_id FOR UPDATE NOWAIT LOOP
  SELECT * INTO r FROM public.uc_group_education_requests WHERE row_kind='source_transaction_receipt'AND backend_pid=p.backend_pid AND full_transaction_id=p.full_transaction_id AND group_id=p.group_id FOR UPDATE NOWAIT;
  SELECT * INTO s FROM public.uc_group_education_states WHERE group_id=p.group_id FOR UPDATE NOWAIT;
  IF r.id IS NULL OR s.group_id IS NULL OR(p.organization_id,p.group_id,p.course_id)IS DISTINCT FROM(r.organization_id,r.group_id,r.course_id)OR(p.organization_id,p.group_id,p.course_id)IS DISTINCT FROM(s.organization_id,s.group_id,s.course_id)THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  ctx:=p.context;at_time:=(ctx->>'first_observed_at')::timestamptz;
  IF ctx->>'mode'='gap'OR s.active_gap IS NOT NULL THEN
   UPDATE public.uc_group_education_requests SET context=r.context||jsonb_build_object('status','gap','gap_id',s.active_gap->'id'),subject_ids='{}',actor_ids=array_remove(ARRAY[(r.context->>'last_actor_id')::uuid],NULL)WHERE id=r.id;
   DELETE FROM public.uc_group_education_requests WHERE row_kind='source_detail'AND group_id=p.group_id AND backend_pid=p.backend_pid AND full_transaction_id=p.full_transaction_id;DELETE FROM public.uc_group_education_requests WHERE id=p.id;CONTINUE;
  END IF;
  -- Legitimate erased rows were ignored by the old NULL-user loop. No other
  -- malformed identity may multiply or collapse the one-pass join below.
  IF jsonb_typeof(coalesce(s.source_rows,'[]'))IS DISTINCT FROM'array'THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.source_rows,'[]'))x WHERE NOT coalesce(jsonb_typeof(x)='object'AND(
   jsonb_typeof(x->'user_id')='string'AND x->>'user_id'~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR s.source_redacted AND x->'user_id'='null'AND x->>'label_state'='redacted'),false))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.source_rows,'[]'))x WHERE x->>'user_id'IS NOT NULL GROUP BY x->>'user_id'HAVING count(*)>1)THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  SELECT count(*)::integer,CASE WHEN count(*)=0 THEN 2 ELSE sum(octet_length((q.context->'detail')::text)+42)END,coalesce(jsonb_object_agg(q.request_id::text,q.context->'detail'ORDER BY q.request_id),'{}')INTO detail_count,detail_bytes,details FROM public.uc_group_education_requests q WHERE q.row_kind='source_detail'AND q.backend_pid=p.backend_pid AND q.full_transaction_id=p.full_transaction_id AND q.group_id=p.group_id;
  IF NOT coalesce(jsonb_typeof(ctx->'live_detail_count')='number'AND ctx->>'live_detail_count'~'^(0|[1-9][0-9]{0,3})$',false)OR NOT coalesce(jsonb_typeof(ctx->'detail_map_serialized_bytes')='number'AND ctx->>'detail_map_serialized_bytes'~'^[0-9]{1,8}$',false)OR NOT coalesce(jsonb_typeof(r.context->'group_admitted_detail_count')='number'AND r.context->>'group_admitted_detail_count'~'^(0|[1-9][0-9]{0,3})$',false)THEN unproven:=true;
  ELSE unproven:=detail_count<>(ctx->>'live_detail_count')::integer OR detail_bytes<>(ctx->>'detail_map_serialized_bytes')::bigint OR detail_count>1000 OR(r.context->>'group_admitted_detail_count')::integer<detail_count OR(r.context->>'group_admitted_detail_count')::integer>1000;END IF;
  IF EXISTS(SELECT 1 FROM public.uc_group_education_requests q WHERE q.row_kind='source_detail'AND q.backend_pid=p.backend_pid AND q.full_transaction_id=p.full_transaction_id AND q.group_id=p.group_id AND(q.organization_id IS DISTINCT FROM p.organization_id OR q.course_id IS DISTINCT FROM p.course_id))THEN unproven:=true;END IF;
  IF unproven OR octet_length(((ctx-ARRAY['live_detail_count','detail_map_serialized_bytes'])||jsonb_build_object('details',details))::text)>2097152 THEN
   gap:=public.uc_group_education_open_gap(p.organization_id,p.group_id,at_time,(r.context->>'last_complete_revision_before_tx')::bigint,CASE WHEN unproven THEN'source_changed'ELSE'history_detail_budget'END,(r.context->>'last_actor_id')::uuid,r.context->>'last_origin');
   UPDATE public.uc_group_education_requests SET context=r.context||jsonb_build_object('status','gap','gap_id',gap->'id')WHERE id=r.id;DELETE FROM public.uc_group_education_requests WHERE row_kind='source_detail'AND group_id=p.group_id AND backend_pid=p.backend_pid AND full_transaction_id=p.full_transaction_id;DELETE FROM public.uc_group_education_requests WHERE id=p.id;CONTINUE;
  END IF;
  ctx:=ctx||jsonb_build_object('details',details);
  SELECT coalesce(array_agg(key::uuid ORDER BY key),'{}')INTO newlabels FROM jsonb_each(ctx->'details')WHERE value->'first_before'='null';
  scan:=public.uc_group_education_scan(p.organization_id,p.group_id,at_time,NULL,s.source_rows,false,newlabels);newrows:=scan->'rows';changes:='[]';unproven:=false;
  IF jsonb_typeof(newrows)IS DISTINCT FROM'array'THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(newrows)x WHERE NOT coalesce(jsonb_typeof(x)='object'AND jsonb_typeof(x->'user_id')='string'AND x->>'user_id'~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(newrows)x GROUP BY x->>'user_id'HAVING count(*)>1)THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  IF(scan->>'unavailable')::boolean OR(scan->>'count')::integer>1000 THEN
   gap:=public.uc_group_education_open_gap(p.organization_id,p.group_id,at_time,(r.context->>'last_complete_revision_before_tx')::bigint,CASE WHEN(scan->>'count')::integer>1000 THEN'source_cardinality'ELSE'source_unavailable'END,(r.context->>'last_actor_id')::uuid,r.context->>'last_origin');
   UPDATE public.uc_group_education_requests SET context=r.context||jsonb_build_object('status','gap','gap_id',gap->'id')WHERE id=r.id;DELETE FROM public.uc_group_education_requests WHERE row_kind='source_detail'AND group_id=p.group_id AND backend_pid=p.backend_pid AND full_transaction_id=p.full_transaction_id;DELETE FROM public.uc_group_education_requests WHERE id=p.id;CONTINUE;
  END IF;
  FOR joined IN
   SELECT coalesce(old_set.user_id,new_set.user_id)user_id,old_set.value old_value,new_set.value new_value
   FROM(SELECT(x->>'user_id')::uuid user_id,x value FROM jsonb_array_elements(coalesce(s.source_rows,'[]'))x WHERE x->>'user_id'IS NOT NULL)old_set
   FULL JOIN(SELECT(x->>'user_id')::uuid user_id,x value FROM jsonb_array_elements(newrows)x)new_set USING(user_id)
   ORDER BY coalesce(old_set.user_id,new_set.user_id)
  LOOP
   u:=joined.user_id;oldrow:=joined.old_value;newrow:=joined.new_value;
   detail:=ctx->'details'->u::text;
   IF oldrow IS NULL THEN oldrow:=newrow||jsonb_build_object('present',false,'primary',false,'additional',false,'archived',false,'enrollment_id',NULL,'program_enrollment_snapshot_id',NULL,'association','no_exact_enrollment');END IF;
   IF newrow IS NULL THEN newrow:=oldrow||jsonb_build_object('present',false,'primary',false,'additional',false);END IF;
   IF detail->>'association_source'IS NOT NULL THEN
    SELECT e.id,x.id INTO enrol,snap FROM public.enrollments e LEFT JOIN public.group_program_enrollment_snapshots x ON x.enrollment_id=e.id AND x.user_id=u AND x.organization_id=p.organization_id AND x.group_id=p.group_id AND x.course_id=p.course_id AND x.binding_id=(s.program_ref->>'binding_id')::uuid AND x.binding_revision=(s.program_ref->>'binding_revision')::bigint AND x.snapshot_hash=s.program_ref->>'binding_snapshot_hash'AND x.version_id=(s.program_ref->>'version_id')::uuid WHERE e.user_id=u AND e.course_id=p.course_id;
    newrow:=newrow||jsonb_build_object('enrollment_id',enrol,'program_enrollment_snapshot_id',snap,'association',CASE WHEN enrol IS NULL THEN'no_exact_enrollment'WHEN snap IS NULL THEN'no_program_snapshot'ELSE'confirmed'END);
   END IF;
   kind:=CASE WHEN(oldrow->>'present')::boolean IS DISTINCT FROM(newrow->>'present')::boolean THEN CASE WHEN(newrow->>'present')::boolean THEN'join'ELSE'leave'END WHEN(oldrow->>'archived')::boolean IS DISTINCT FROM(newrow->>'archived')::boolean THEN CASE WHEN(newrow->>'archived')::boolean THEN'archive'ELSE'unarchive'END WHEN(oldrow->'primary',oldrow->'additional')IS DISTINCT FROM(newrow->'primary',newrow->'additional')THEN'source_edge'END;
   IF kind IS NOT NULL OR(oldrow->'enrollment_id',oldrow->'program_enrollment_snapshot_id')IS DISTINCT FROM(newrow->'enrollment_id',newrow->'program_enrollment_snapshot_id')THEN
    IF detail IS NULL THEN unproven:=true;EXIT;END IF;
    fact:=ctx->'contributors'->(detail->>'last_contributor_index')::integer;
    IF fact IS NULL OR fact='null'THEN unproven:=true;EXIT;END IF;
    IF kind IS NOT NULL THEN changes:=changes||jsonb_build_array(jsonb_build_object('action','membership_observed','user_id',u,'change',kind,'old',oldrow,'next',newrow,'source',coalesce(detail->>'membership_source','group_lifecycle'),'fact',fact));END IF;
    IF(oldrow->'enrollment_id',oldrow->'program_enrollment_snapshot_id')IS DISTINCT FROM(newrow->'enrollment_id',newrow->'program_enrollment_snapshot_id')THEN changes:=changes||jsonb_build_array(jsonb_build_object('action','association_observed','user_id',u,'old',oldrow,'next',newrow,'source',coalesce(detail->>'association_source','program_association'),'fact',fact));END IF;
   END IF;
  END LOOP;
  IF unproven OR s.revision+jsonb_array_length(changes)+(CASE WHEN jsonb_array_length(ctx->'legacy_fields')>0 THEN 1 ELSE 0 END)>9007199254740991 THEN
   gap:=public.uc_group_education_open_gap(p.organization_id,p.group_id,at_time,(r.context->>'last_complete_revision_before_tx')::bigint,CASE WHEN unproven THEN'source_changed'ELSE'revision_capacity'END,(r.context->>'last_actor_id')::uuid,r.context->>'last_origin');
   UPDATE public.uc_group_education_requests SET context=r.context||jsonb_build_object('status','gap','gap_id',gap->'id')WHERE id=r.id;DELETE FROM public.uc_group_education_requests WHERE row_kind='source_detail'AND group_id=p.group_id AND backend_pid=p.backend_pid AND full_transaction_id=p.full_transaction_id;DELETE FROM public.uc_group_education_requests WHERE id=p.id;CONTINUE;
  END IF;
  first_revision:=s.revision+1;last_revision:=s.revision;working_user:=NULL;working_row:=NULL;
  FOR change IN SELECT x FROM jsonb_array_elements(changes)x LOOP
   event:=gen_random_uuid();u:=(change->>'user_id')::uuid;fact:=change->'fact';actor:=(fact->>'actor_id')::uuid;origin:=fact->>'origin';oldrow:=change->'old';nextrow:=change->'next';
   IF working_user IS DISTINCT FROM u THEN working_user:=u;working_row:=NULL;END IF;
   -- Only a present association inherits earlier same-user membership edits.
   -- Absent/leave association keeps its original plan.next and baseline oldrow.
   IF change->>'action'='association_observed'AND(nextrow->>'present')::boolean AND working_row IS NOT NULL THEN nextrow:=working_row||jsonb_build_object('enrollment_id',nextrow->'enrollment_id','program_enrollment_snapshot_id',nextrow->'program_enrollment_snapshot_id','association',nextrow->'association');END IF;
   IF change->>'action'='membership_observed'THEN
    payload:=jsonb_build_object('change',change->'change','previous_present',oldrow->'present','next_present',nextrow->'present','previous_archived',oldrow->'archived','next_archived',nextrow->'archived','source',change->'source','subject_label',nextrow->'subject_label','label_state',nextrow->'label_state','label_observed_at',nextrow->'label_observed_at','label_source',nextrow->'label_source');
    IF change->>'change'='join'THEN nextrow:=nextrow||jsonb_build_object('effective_from',at_time,'effective_until',NULL,'membership_basis','observed','observed_since',at_time);ELSIF change->>'change'='leave'THEN nextrow:=nextrow||jsonb_build_object('effective_until',at_time);END IF;
   ELSE payload:=jsonb_build_object('enrollment_id',nextrow->'enrollment_id','program_enrollment_snapshot_id',nextrow->'program_enrollment_snapshot_id','previous_enrollment_id',oldrow->'enrollment_id','previous_program_enrollment_snapshot_id',oldrow->'program_enrollment_snapshot_id','source',change->'source','observed_at',at_time);END IF;
   rev:=public.uc_group_education_append(p.organization_id,p.group_id,event,change->>'action',at_time,payload,NULL,u,NULL,NULL,NULL,r.id,fact->'authority',actor,origin);last_revision:=rev;
   UPDATE public.uc_group_education_events SET previous_row=oldrow,next_row=nextrow WHERE id=event;
   IF(nextrow->>'present')::boolean THEN
    SELECT coalesce(jsonb_agg(x),'[]')INTO refs FROM jsonb_array_elements(coalesce(nextrow->'source_event_ids','[]'))x WHERE x<>'null';refs:=refs||jsonb_build_array(event);SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]')INTO refs FROM jsonb_array_elements(refs)WITH ORDINALITY t(value,ordinal)WHERE ordinal>greatest(jsonb_array_length(refs)-4,0);
    working_row:=nextrow||jsonb_build_object('source_event_ids',refs);
   END IF;
  END LOOP;
  -- Each history next_row excludes its own ID. Recover the final present row
  -- from only this fold's exact receipt/scope/revision range, adding that ID once.
  WITH latest_event AS MATERIALIZED(
   SELECT DISTINCT ON(e.subject_user_id)e.subject_user_id,e.id,e.next_row
   FROM public.uc_group_education_events e
   WHERE e.source_receipt_id=r.id AND e.organization_id=p.organization_id AND e.group_id=p.group_id AND e.course_id=p.course_id
    AND e.revision BETWEEN first_revision AND last_revision AND e.action IN('membership_observed','association_observed')
   ORDER BY e.subject_user_id,e.revision DESC
  ),event_projection AS(
   SELECT last_event.subject_user_id,last_event.next_row,
    coalesce((SELECT jsonb_agg(t.value ORDER BY t.ordinal)FROM jsonb_array_elements(coalesce(last_event.next_row->'source_event_ids','[]'))WITH ORDINALITY t(value,ordinal)WHERE t.value<>'null'),'[]')||jsonb_build_array(last_event.id)ref_ids
   FROM latest_event last_event
  )SELECT coalesce(jsonb_agg(CASE WHEN event_projection.subject_user_id IS NULL THEN observed.value ELSE event_projection.next_row||jsonb_build_object('source_event_ids',
   (SELECT coalesce(jsonb_agg(t.value ORDER BY t.ordinal),'[]')FROM jsonb_array_elements(event_projection.ref_ids)WITH ORDINALITY t(value,ordinal)WHERE t.ordinal>greatest(jsonb_array_length(event_projection.ref_ids)-4,0)))END ORDER BY observed.value->>'user_id'),'[]')INTO finalrows
   FROM jsonb_array_elements(newrows)observed(value)LEFT JOIN event_projection ON event_projection.subject_user_id=(observed.value->>'user_id')::uuid;
  IF jsonb_array_length(ctx->'legacy_fields')>0 THEN
   SELECT value INTO fact FROM jsonb_array_elements(ctx->'contributors')WITH ORDINALITY x(value,ordinal)ORDER BY ordinal DESC LIMIT 1;
   last_revision:=public.uc_group_education_append(p.organization_id,p.group_id,gen_random_uuid(),'legacy_calendar_changed',at_time,jsonb_build_object('changed_fields',ctx->'legacy_fields','previous_hash',s.legacy_source_hash,'next_hash',public.uc_program_hash(public.uc_program_group_calendar(p.group_id))),NULL,NULL,NULL,NULL,NULL,r.id,fact->'authority',(fact->>'actor_id')::uuid,fact->>'origin');
   UPDATE public.uc_group_education_states SET legacy_calendar_changed=true,legacy_source_hash=public.uc_program_hash(public.uc_program_group_calendar(p.group_id))WHERE group_id=p.group_id;
  END IF;
  UPDATE public.uc_group_education_states SET source_rows=finalrows WHERE group_id=p.group_id;
  UPDATE public.uc_group_education_requests SET subject_ids='{}',context=r.context||jsonb_build_object('status','first_flush_complete_provisional','first_flushed_observation_counter',r.context->'source_observation_counter','first_flush_event_revision_range',CASE WHEN last_revision>=first_revision THEN jsonb_build_array(first_revision,last_revision)ELSE'[]'::jsonb END)WHERE id=r.id;
  DELETE FROM public.uc_group_education_requests WHERE row_kind='source_detail'AND group_id=p.group_id AND backend_pid=p.backend_pid AND full_transaction_id=p.full_transaction_id;DELETE FROM public.uc_group_education_requests WHERE id=p.id;
 END LOOP;
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END;$fn$;

CREATE FUNCTION public.uc_group_education_source_observe()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE oldj jsonb:=CASE WHEN TG_OP<>'INSERT'THEN to_jsonb(OLD)END;newj jsonb:=CASE WHEN TG_OP<>'DELETE'THEN to_jsonb(NEW)END;users uuid[];r record;source text;
BEGIN
 IF NOT public.uc_group_education_source_relevant(TG_TABLE_NAME,oldj,newj)THEN RETURN NULL;END IF;
 users:=array_remove(ARRAY[(oldj->>'user_id')::uuid,(newj->>'user_id')::uuid],NULL);
 IF cardinality(users)>0 AND(SELECT bool_and(public.uc_group_education_erasing(x))FROM unnest(users)x)THEN RETURN NULL;END IF;
 source:=CASE TG_TABLE_NAME WHEN'profiles'THEN CASE WHEN oldj IS NOT NULL AND newj IS NOT NULL AND(oldj->>'archived_at'IS NOT NULL)IS DISTINCT FROM(newj->>'archived_at'IS NOT NULL)THEN'profile_archive'ELSE'primary'END WHEN'student_group_memberships'THEN'additional'WHEN'enrollments'THEN'enrollment'WHEN'group_program_enrollment_snapshots'THEN'program_association'ELSE'group_lifecycle'END;
 FOR r IN SELECT * FROM public.uc_group_education_source_scopes(TG_TABLE_NAME,oldj,newj)ORDER BY group_id LOOP
  IF TG_TABLE_NAME IN('student_groups','courses','organizations')THEN
   SELECT coalesce(array_agg(DISTINCT u ORDER BY u),'{}')INTO users FROM(SELECT m.user_id u FROM public.student_group_memberships_effective m WHERE m.organization_id=r.organization_id AND m.group_id=r.group_id UNION SELECT(x->>'user_id')::uuid FROM public.uc_group_education_states s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.source_rows,'[]'))x WHERE s.group_id=r.group_id)q WHERE u IS NOT NULL;
  END IF;
  PERFORM public.uc_group_education_source_queue(r.organization_id,r.group_id,users,source,TG_TABLE_NAME,oldj,newj);
 END LOOP;RETURN NULL;
END;$fn$;
CREATE FUNCTION public.uc_group_education_source_after()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE budget public.uc_group_education_requests;BEGIN
 SELECT * INTO budget FROM public.uc_group_education_requests WHERE row_kind='source_transaction_budget'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id_if_assigned()::text;
 IF budget.context?'statement_depth'THEN
  UPDATE public.uc_group_education_requests SET context=context||jsonb_build_object('statement_constraint_seen',true)WHERE id=budget.id AND(context->>'statement_constraint_seen')::boolean IS DISTINCT FROM true;RETURN NULL;
 END IF;
 PERFORM public.uc_group_education_source_fold();RETURN NULL;END;$fn$;
CREATE FUNCTION public.uc_group_education_source_statement_end()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE budget public.uc_group_education_requests;seen boolean;BEGIN
 SELECT * INTO budget FROM public.uc_group_education_requests WHERE row_kind='source_transaction_budget'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id_if_assigned()::text;
 IF budget.id IS NULL OR(budget.context->>'statement_depth')::integer IS DISTINCT FROM pg_trigger_depth()THEN RETURN NULL;END IF;
 seen:=coalesce((budget.context->>'statement_constraint_seen')::boolean,false);
 UPDATE public.uc_group_education_requests SET context=context-ARRAY['statement_depth','statement_constraint_seen']WHERE id=budget.id;
 -- The compact header plus exact small staged rows is current after each
 -- actual row. Materialize only the optional GIN mirror after trusted erasure.
 WITH mirrors AS MATERIALIZED(
  SELECT q.id,CASE WHEN q.context->>'mode'='detail'THEN ARRAY(SELECT d.request_id FROM public.uc_group_education_requests d WHERE d.row_kind='source_detail'AND d.group_id=q.group_id AND d.backend_pid=q.backend_pid AND d.full_transaction_id=q.full_transaction_id ORDER BY d.request_id)ELSE'{}'::uuid[]END ids
  FROM public.uc_group_education_requests q WHERE q.row_kind='source_pending'AND q.backend_pid=pg_backend_pid()AND q.full_transaction_id=pg_current_xact_id_if_assigned()::text
 )UPDATE public.uc_group_education_requests q SET subject_ids=m.ids FROM mirrors m WHERE q.id=m.id AND q.subject_ids IS DISTINCT FROM m.ids;
 IF seen THEN PERFORM public.uc_group_education_source_fold();END IF;
 IF budget.context->'admitted_detail_count'='0'::jsonb AND NOT EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind IN('source_pending','source_transaction_receipt')AND backend_pid=budget.backend_pid AND full_transaction_id=budget.full_transaction_id)THEN DELETE FROM public.uc_group_education_requests WHERE id=budget.id;END IF;
 RETURN NULL;
END;$fn$;
CREATE FUNCTION public.uc_group_education_parent_cleanup()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE j jsonb:=to_jsonb(OLD);u uuid;BEGIN
 DELETE FROM public.uc_group_education_requests WHERE row_kind='source_parent'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id_if_assigned()::text AND context->>'parent_table'=TG_TABLE_NAME AND context->>'parent_id'=coalesce(j->>'id',j->>'user_id');
 FOR u IN SELECT DISTINCT unnest(subject_ids)FROM public.uc_group_education_requests WHERE row_kind='erase_context'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id_if_assigned()::text LOOP
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=u)AND NOT EXISTS(SELECT 1 FROM public.enrollments WHERE user_id=u)AND NOT EXISTS(SELECT 1 FROM public.student_group_memberships WHERE user_id=u)AND NOT EXISTS(SELECT 1 FROM public.uc_group_education_requests p WHERE p.row_kind='source_parent'AND p.backend_pid=pg_backend_pid()AND p.full_transaction_id=pg_current_xact_id_if_assigned()::text AND p.context->>'parent_table'='profiles'AND p.context->'old_tuple'->>'user_id'=u::text)THEN DELETE FROM public.uc_group_education_requests WHERE row_kind='erase_context'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id_if_assigned()::text AND subject_ids=ARRAY[u];END IF;
 END LOOP;RETURN NULL;END;$fn$;
CREATE FUNCTION public.uc_group_education_source_truncate()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'GROUP_FACTS_SOURCE_CHANGED' USING ERRCODE='42501';END;$fn$;
DO $triggers$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','student_group_memberships','enrollments','student_groups','courses','organizations','group_program_bindings','group_program_enrollment_snapshots']LOOP
  EXECUTE format('CREATE TRIGGER aaa_uc013_source_preflight BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_group_education_source_before()',t);
  EXECUTE format('CREATE TRIGGER aaa_uc013_source_observe AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_group_education_source_observe()',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER uc013_source_fold AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.uc_group_education_source_after()',t);
  EXECUTE format('CREATE TRIGGER zzzzzz_uc013_statement_end AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.uc_group_education_source_statement_end()',t);
  EXECUTE format('CREATE TRIGGER uc013_source_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.uc_group_education_source_truncate()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['profiles','student_group_memberships','enrollments','student_groups','courses','organizations']LOOP
  EXECUTE format('CREATE TRIGGER zzzzz_uc013_parent_cleanup AFTER UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_group_education_parent_cleanup()',t);
 END LOOP;
END;$triggers$;

CREATE FUNCTION public.uc_group_education_correct(p_org uuid,p_group uuid,p_action jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE e public.uc_group_education_events;b public.uc_group_education_events;v timestamptz;previous timestamptz;lower_time timestamptz;upper_time timestamptz;prev_time timestamptz;next_time timestamptz;next_base bigint;
BEGIN
 IF NOT public.uc_admission_uuid(p_action->'event_id')OR p_action->>'expected_event_hash'!~'^[0-9a-f]{64}$'OR p_action->>'corrected_effective_at'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$'THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 v:=(p_action->>'corrected_effective_at')::timestamptz;IF NOT isfinite(v)OR v>clock_timestamp()THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 SELECT * INTO e FROM public.uc_group_education_events WHERE id=(p_action->>'event_id')::uuid AND organization_id=p_org AND group_id=p_group FOR SHARE NOWAIT;
 IF NOT FOUND THEN PERFORM public.uc_group_education_error('NOT_FOUND');END IF;
 IF e.action<>'membership_observed'OR e.redacted OR e.subject_user_id IS NULL OR NOT public.uc_group_education_event_complete(e.source_receipt_id)THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
 IF e.input_hash IS DISTINCT FROM p_action->>'expected_event_hash'THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 SELECT * INTO b FROM public.uc_group_education_events WHERE group_id=p_group AND action IN('initialized','coverage_recovered')AND revision<e.revision ORDER BY revision DESC LIMIT 1;
 IF b.id IS NULL OR b.redacted THEN PERFORM public.uc_group_education_error('LEGACY_HISTORY_UNKNOWN');END IF;lower_time:=b.effective_at;
 SELECT min(revision)INTO next_base FROM public.uc_group_education_events WHERE group_id=p_group AND action IN('initialized','coverage_recovered')AND revision>e.revision;
 SELECT min((x->>'started_at')::timestamptz)INTO upper_time FROM(
  SELECT active_gap x FROM public.uc_group_education_states WHERE group_id=p_group AND active_gap IS NOT NULL
  UNION ALL SELECT payload->'gap'FROM public.uc_group_education_events WHERE group_id=p_group AND action='coverage_recovered')q WHERE(x->>'started_at')::timestamptz>lower_time;
 IF v<lower_time OR(upper_time IS NOT NULL AND v>=upper_time)THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 SELECT coalesce((SELECT(c.payload->>'corrected_effective_at')::timestamptz FROM public.uc_group_education_events c WHERE c.action='membership_time_corrected'AND c.source_event_id=e.id AND NOT c.redacted ORDER BY c.revision DESC LIMIT 1),e.effective_at)INTO previous;
 -- Preserve source transition order for this exact subject and covered segment.
 SELECT max(actual_at)FILTER(WHERE revision<e.revision),min(actual_at)FILTER(WHERE revision>e.revision)INTO prev_time,next_time FROM(
  SELECT t.revision,coalesce((SELECT(c.payload->>'corrected_effective_at')::timestamptz FROM public.uc_group_education_events c WHERE c.action='membership_time_corrected'AND c.source_event_id=t.id AND NOT c.redacted ORDER BY c.revision DESC LIMIT 1),t.effective_at)actual_at
  FROM public.uc_group_education_events t WHERE t.group_id=p_group AND t.subject_user_id=e.subject_user_id AND t.action='membership_observed'AND t.revision>b.revision AND(next_base IS NULL OR t.revision<next_base)AND public.uc_group_education_event_complete(t.source_receipt_id)AND NOT t.redacted)q;
 IF(prev_time IS NOT NULL AND v<=prev_time)OR(next_time IS NOT NULL AND v>=next_time)THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 RETURN jsonb_build_object('event_id',e.id,'previous_effective_at',previous,'corrected_effective_at',v,'expected_event_hash',e.input_hash);
END;$fn$;

CREATE FUNCTION public.uc_group_education_short_name(p_name text)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(string_agg(a[1]||CASE WHEN cardinality(a)>1 THEN' '||upper(left(a[2],1))||'.'ELSE''END||CASE WHEN cardinality(a)>2 THEN upper(left(a[3],1))||'.'ELSE''END,'; 'ORDER BY n),'')FROM(SELECT regexp_split_to_array(btrim(x),'\s+')a,n FROM regexp_split_to_table(coalesce(p_name,''),'[;\n]+')WITH ORDINALITY t(x,n)WHERE btrim(x)<>'')q
$fn$;
CREATE FUNCTION public.uc_group_education_validate_artifact(p_row jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE org uuid:=(p_row->>'organization_id')::uuid;grp uuid:=(p_row->>'group_id')::uuid;vs jsonb:=p_row->'variables_snapshot';src jsonb:=vs->'education_source';s public.uc_group_roster_snapshots;c public.uc_group_calendar_versions;page jsonb;header jsonb;expected_source jsonb;expected_students jsonb;expected_ids jsonb;facts jsonb;cal jsonb;canonical jsonb;rendered jsonb;vars jsonb:=coalesce(p_row->'variables','{}');k text;v jsonb;l jsonb;teacher uuid;teacher_label text;clock_value text;uniform text;parts text[];accounts uuid[];i integer:=0;item jsonb;row_item jsonb;period text;group_label text;student_count integer;form text;notice constant text:='Word-бланк отображает четыре даты и общие поля; полный поурочный план сохранён в источнике. Имена — отдельно наблюдённые отображаемые подписи, не подтверждённые юридические имена.';
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_group_education_actor_allowed(auth.uid(),org,grp,false)OR NOT public.uc_group_education_actor_allowed(auth.uid(),org,grp,true)THEN PERFORM public.uc_group_education_error('ACCESS_DENIED');END IF;
 IF p_row->>'doc_type'NOT IN('class_journal','enrollment_order','expulsion_order','student_list','schedule','attestation_sheet','registration_book','title_page','pass')OR p_row->>'doc_status'IS DISTINCT FROM'draft'OR p_row->'document_number'IS DISTINCT FROM'null'::jsonb OR p_row->>'student_user_id'IS NOT NULL THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 IF NOT public.uc_admission_shape(src,ARRAY['schema_version','snapshot_id','source_hash','roster_hash','calendar_version_id','calendar_hash','as_of','timezone','knowledge_revision','coverage_segment_id'])OR src->>'schema_version'<>'1'OR NOT public.uc_admission_uuid(src->'snapshot_id')THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 IF jsonb_typeof(vs)IS DISTINCT FROM'object'OR EXISTS(SELECT 1 FROM jsonb_object_keys(vs)AS keys(key_name)WHERE NOT key_name=ANY(ARRAY['education_source','education_calendar','education_source_notice','education_lesson_ids','program_facts','student_user_ids','students','scalars','rows','signatory_source','fidelity_status','attendance_source']))THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END IF;
 SELECT * INTO s FROM public.uc_group_roster_snapshots WHERE id=(src->>'snapshot_id')::uuid AND organization_id=org AND group_id=grp;IF NOT FOUND THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
 SELECT * INTO c FROM public.uc_group_calendar_versions WHERE id=s.calendar_version_id;
 SELECT coalesce(array_agg(DISTINCT u ORDER BY u),'{}')INTO accounts FROM(SELECT(x->>'user_id')::uuid u FROM jsonb_array_elements(s.roster_rows)x UNION SELECT(x->>'teacher_user_id')::uuid FROM jsonb_array_elements(c.lessons)x)q WHERE u IS NOT NULL;
 PERFORM public.uc_group_education_lock(org,grp,accounts,NULL,false);
 SELECT x.* INTO s FROM public.uc_group_roster_snapshots x WHERE x.id=s.id FOR SHARE NOWAIT;
 SELECT * INTO c FROM public.uc_group_calendar_versions WHERE id=s.calendar_version_id FOR SHARE NOWAIT;
 page:=public.uc_group_education_snapshot_page(org,grp,s.id,NULL,100);header:=page->'header';IF NOT(header->>'available')::boolean OR s.purpose<>'document_batch'OR c.redacted THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
 expected_source:=jsonb_build_object('schema_version',1,'snapshot_id',s.id,'source_hash',s.source_hash,'roster_hash',s.roster_hash,'calendar_version_id',s.calendar_version_id,'calendar_hash',s.calendar_hash,'as_of',s.as_of,'timezone',s.timezone,'knowledge_revision',s.knowledge_revision,'coverage_segment_id',s.coverage_segment_id);
 IF src IS DISTINCT FROM expected_source OR vs->'program_facts'IS DISTINCT FROM s.program_proof OR vs->'education_calendar'IS DISTINCT FROM page->'artifact_projection'->'calendar'OR vs->>'education_source_notice'IS DISTINCT FROM notice THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 cal:=page->'artifact_projection'->'calendar';facts:=s.program_proof->'facts_snapshot';
 IF c.published_at IS NULL OR c.coverage<>'whole_program'OR c.partial_reason IS NOT NULL OR jsonb_array_length(c.lessons)<>4 OR c.missing_hours_count<>0 OR c.known_academic_hours_total<>(facts->>'academic_hours')::numeric OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.lessons)x WHERE x->>'status'<>'planned'OR x->'teacher_user_id'='null'OR x->>'teacher_label_state'<>'available')THEN PERFORM public.uc_group_education_error('TEMPLATE_INCOMPATIBLE');END IF;
 teacher:=(c.lessons->0->>'teacher_user_id')::uuid;teacher_label:=c.lessons->0->>'teacher_label';IF NOT public.uc_group_education_teacher_allowed(teacher,org,grp)THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
 FOR l IN SELECT x FROM jsonb_array_elements(c.lessons)x LOOP
  IF l->>'teacher_user_id'<>teacher::text OR l->>'teacher_label'IS DISTINCT FROM teacher_label THEN PERFORM public.uc_group_education_error('TEMPLATE_INCOMPATIBLE');END IF;
  clock_value:='';IF l->'starts_at'<>'null'THEN
   clock_value:=to_char((l->>'starts_at')::timestamptz AT TIME ZONE c.timezone,'HH24:MI')||CASE WHEN extract(second FROM(l->>'starts_at')::timestamptz AT TIME ZONE c.timezone)<>0 THEN to_char((l->>'starts_at')::timestamptz AT TIME ZONE c.timezone,':SS')ELSE''END||'–'||to_char((l->>'ends_at')::timestamptz AT TIME ZONE c.timezone,'HH24:MI')||CASE WHEN extract(second FROM(l->>'ends_at')::timestamptz AT TIME ZONE c.timezone)<>0 THEN to_char((l->>'ends_at')::timestamptz AT TIME ZONE c.timezone,':SS')ELSE''END||CASE WHEN((l->>'ends_at')::timestamptz AT TIME ZONE c.timezone)::date>(l->>'local_date')::date THEN' (+1 день)'ELSE''END;
  END IF;
  IF uniform IS NOT NULL AND clock_value<>uniform THEN PERFORM public.uc_group_education_error('TEMPLATE_INCOMPATIBLE');END IF;uniform:=clock_value;
 END LOOP;
 SELECT coalesce(jsonb_agg(x->'user_id'ORDER BY x->>'user_id'),'[]'),coalesce(jsonb_agg(jsonb_build_object('row_number',n,'user_id',x->'user_id','full_name',x->'subject_label','label_observed_at',x->'label_observed_at','label_source',x->'label_source')ORDER BY x->>'user_id'),'[]')INTO expected_ids,expected_students FROM jsonb_array_elements(s.roster_rows)WITH ORDINALITY t(x,n);
 IF vs->'student_user_ids'IS DISTINCT FROM expected_ids OR vs->'students'IS DISTINCT FROM expected_students OR vs->'education_lesson_ids'IS DISTINCT FROM(SELECT jsonb_agg(x->'lesson_id'ORDER BY n)FROM jsonb_array_elements(c.lessons)WITH ORDINALITY t(x,n))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 form:=CASE facts->>'training_form'WHEN'full_time'THEN'Очная'WHEN'part_time'THEN'Заочная'WHEN'mixed'THEN'Очно-заочная'END;
 period:=to_char(c.planned_start_date,'DD.MM.YYYY')||' — '||to_char(c.planned_end_date,'DD.MM.YYYY');student_count:=jsonb_array_length(s.roster_rows);
 group_label:='Программа «'||(facts->>'full_title')||'»'||CASE WHEN coalesce(s.program_proof->'group_snapshot'->>'name','')<>''THEN'; группа «'||(s.program_proof->'group_snapshot'->>'name')||'»'ELSE''END||'; срок обучения '||period;
 canonical:=public.uc_program_render_scalars(facts,jsonb_build_object('name',s.program_proof->'group_snapshot'->'name','start_date',c.planned_start_date,'end_date',c.planned_end_date,'training_dates',(SELECT jsonb_agg(x->'local_date'ORDER BY n)FROM jsonb_array_elements(c.lessons)WITH ORDINALITY t(x,n)),'schedule_text',uniform,'instructor_name',teacher_label))||jsonb_build_object('PROGRAM_TITLE',facts->'full_title','PROGRAM_HOURS',facts->>'academic_hours','PROGRAM_FORM',form,'INSTRUCTOR_NAME',teacher_label,'INSTRUCTOR_SHORT',public.uc_group_education_short_name(teacher_label),'INSTRUCTOR_1_SHORT',public.uc_group_education_short_name(teacher_label),'INSTRUCTOR_2_SHORT','','STUDENTS_COUNT',student_count::text);
 FOR i IN 1..4 LOOP canonical:=canonical||jsonb_build_object('DATE_'||i,to_char((c.lessons->(i-1)->>'local_date')::date,'DD.MM.YYYY'),'SCHEDULE_DATE_'||i,to_char((c.lessons->(i-1)->>'local_date')::date,'DD.MM.YYYY'),'SCHEDULE_TIME_'||i,uniform,'SCHEDULE_TEACHER_'||i,teacher_label,'SCHEDULE_TOPIC_'||i,'','SCHEDULE_HOURS_'||i,'');END LOOP;
 rendered:=CASE WHEN p_row->>'layout_format'='docx_ooxml'THEN vs->'scalars'ELSE vars END;
 IF p_row->>'layout_format'='docx_ooxml'AND jsonb_typeof(rendered)IS DISTINCT FROM'object'THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 FOR k,v IN SELECT * FROM jsonb_each(canonical)LOOP IF rendered?k AND rendered->k IS DISTINCT FROM v THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
 FOR k,v IN SELECT * FROM jsonb_each(jsonb_build_object('program_title',facts->'full_title','program_hours',facts->>'academic_hours','program_form',form))LOOP IF vars?k AND vars->k IS DISTINCT FROM v THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
 IF jsonb_typeof(vs->'rows')='array'THEN
  IF jsonb_array_length(vs->'rows')<>student_count AND p_row->>'doc_type'<>'schedule'THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;i:=0;
  FOR item IN SELECT x FROM jsonb_array_elements(vs->'rows')x LOOP
   i:=i+1;row_item:=s.roster_rows->(i-1);FOR k,v IN SELECT * FROM jsonb_each(canonical)LOOP IF item?k AND item->k IS DISTINCT FROM v THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
   FOR k,v IN SELECT * FROM jsonb_each(jsonb_build_object('N',i::text,'STUDENT_NAME',row_item->'subject_label','STUDENT_PROGRAM',facts->'full_title','STUDENT_HOURS',facts->>'academic_hours','STUDENT_PERIOD',period,'PROGRAM_GROUP',group_label))LOOP IF item?k AND item->k IS DISTINCT FROM v THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
  END LOOP;
 END IF;
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_group_education_error('INVALID_INPUT');END;$fn$;

DO $artifact_patch$DECLARE original text;patched text;needle text;replacement text;BEGIN
 original:=pg_get_functiondef('public.uc_guard_program_artifact()'::regprocedure);IF md5(original)<>'eb7789a817440fd1ecadbbdec4f0f2a6'THEN RAISE EXCEPTION 'Exact116 guard before-body mismatch';END IF;
 needle:=$needle$ IF grp IS NULL THEN RETURN NEW; END IF;
$needle$;replacement:=$replacement$ IF coalesce(j->'variables_snapshot','{}'::jsonb) ? 'education_source' THEN
  IF TG_TABLE_NAME<>'group_documents' OR grp IS NULL THEN RAISE EXCEPTION 'GROUP_FACTS_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' THEN
  prior:=to_jsonb(OLD);
  -- Operational archive/trash/version-list metadata does not regenerate old
  -- content or invent a historical programme source. Every other column,
  -- including document numbers, dates, doc_status and byte hashes, is compared.
  IF (j-ARRAY['status','is_current','updated_at','archived_at','deleted_at','deleted_by'])
   =(prior-ARRAY['status','is_current','updated_at','archived_at','deleted_at','deleted_by'])
   AND (j->'status' IS NOT DISTINCT FROM prior->'status'
    OR TG_TABLE_NAME='group_documents' AND prior->>'status' IN('active','archived') AND j->>'status' IN('active','archived')
    OR TG_TABLE_NAME='org_contracts' AND prior->>'status' IN('active','approved','signed') AND j->>'status' IN('archived','cancelled'))
  THEN RETURN NEW; END IF;
 END IF;
  PERFORM public.uc_group_education_validate_artifact(j);
  RETURN NEW;
 END IF;
 IF grp IS NULL THEN RETURN NEW; END IF;
$replacement$;
 IF(length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Exact116 guard anchor count';END IF;patched:=replace(original,needle,replacement);
 IF md5(patched)<>'af13f7ea0040bd1924c4f4542dcc1fab'THEN RAISE EXCEPTION 'Exact116 guard after-body mismatch';END IF;EXECUTE patched;
END;$artifact_patch$;

-- Proposed delegated116 fragment; not applied. Original111/files/retention untouched.
CREATE FUNCTION public.uc_group_education_redact(p_value jsonb,p_user uuid,p_force boolean DEFAULT false,p_subject_scope boolean DEFAULT false,p_enrollment_ids uuid[] DEFAULT '{}',p_snapshot_ids uuid[] DEFAULT '{}')RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE result jsonb;k text;v jsonb;subject boolean;teacher boolean;actor boolean;author boolean;inherited boolean;attribution boolean;
BEGIN
 IF p_value IS NULL OR p_user IS NULL THEN RETURN p_value;END IF;
 IF jsonb_typeof(p_value)='array'THEN SELECT coalesce(jsonb_agg(public.uc_group_education_redact(x,p_user,p_force,p_subject_scope,p_enrollment_ids,p_snapshot_ids)),'[]')INTO result FROM jsonb_array_elements(p_value)x;RETURN result;
 ELSIF jsonb_typeof(p_value)<>'object'THEN RETURN p_value;END IF;
 subject:=coalesce(p_value->>'user_id'=p_user::text OR p_value->>'subject_user_id'=p_user::text,false);
 inherited:=p_subject_scope AND NOT EXISTS(SELECT 1 FROM jsonb_each(p_value)e WHERE e.key IN('user_id','subject_user_id','actor_id','staff_user_id','teacher_user_id')AND jsonb_typeof(e.value)='string'AND e.value<>to_jsonb(p_user));subject:=subject OR inherited;
 teacher:=coalesce(p_value->>'teacher_user_id'=p_user::text,false);
 actor:=EXISTS(SELECT 1 FROM jsonb_each(p_value)e WHERE e.key IN('actor_id','last_actor_id','reviewer_id','staff_user_id')AND e.value=to_jsonb(p_user));
 author:=EXISTS(SELECT 1 FROM jsonb_each(p_value)e WHERE e.key IN('recorded_by','published_by','created_by')AND e.value=to_jsonb(p_user));
 attribution:=actor OR(coalesce(p_force,false)AND NOT EXISTS(SELECT 1 FROM jsonb_each(p_value)e WHERE e.key IN('actor_id','last_actor_id','user_id','subject_user_id','teacher_user_id','staff_user_id')AND jsonb_typeof(e.value)='string'AND e.value<>to_jsonb(p_user)));
 result:='{}';FOR k,v IN SELECT * FROM jsonb_each(p_value)LOOP
  IF k=p_user::text THEN CONTINUE;
  ELSIF k IN('user_id','subject_user_id','actor_id','last_actor_id','recorded_by','published_by','created_by','reviewer_id','staff_user_id','teacher_user_id')AND v=to_jsonb(p_user)THEN v:='null';
  ELSIF k IN('subject_ids','actor_ids','teacher_ids','student_user_ids')AND jsonb_typeof(v)='array'THEN SELECT coalesce(jsonb_agg(x),'[]')INTO v FROM jsonb_array_elements(v)x WHERE x IS DISTINCT FROM to_jsonb(p_user);
  ELSIF k='enrollment_id'AND(subject OR v=ANY(SELECT to_jsonb(x)FROM unnest(p_enrollment_ids)x))THEN v:='null';
  ELSIF k='program_enrollment_snapshot_id'AND(subject OR v=ANY(SELECT to_jsonb(x)FROM unnest(p_snapshot_ids)x))THEN v:='null';
  ELSIF k='enrollment_snapshot_ids'AND jsonb_typeof(v)='array'THEN SELECT coalesce(jsonb_agg(x),'[]')INTO v FROM jsonb_array_elements(v)x WHERE NOT(x=ANY(SELECT to_jsonb(y)FROM unnest(p_snapshot_ids)y));
  ELSIF (subject OR teacher)AND k IN('subject_label','teacher_label','full_name','label','label_source','label_observed_at','teacher_label_source','teacher_label_observed_at','teacher_source_hash')THEN v:='null';
  ELSIF (subject OR teacher)AND k IN('label_state','teacher_label_state')THEN v:=to_jsonb('redacted'::text);
  ELSIF (attribution OR subject OR teacher)AND k IN('staff_id','org_staff_id','staff_label')THEN v:='null';
  ELSIF (actor OR author OR attribution OR subject OR teacher)AND k IN('reason','correction_reason')AND v<>'null'THEN v:='null';
  ELSIF subject AND k='id'AND(p_value?'role'OR p_value?'sections_access'OR p_value?'full_name')THEN v:='null';
  ELSIF jsonb_typeof(v)='string'AND position(p_user::text IN(v#>>'{}'))>0 AND k IN('reason','correction_reason','subject_label','teacher_label','full_name','staff_label','label')THEN v:='null';
  ELSE v:=public.uc_group_education_redact(v,p_user,attribution,subject,p_enrollment_ids,p_snapshot_ids);END IF;
  result:=result||jsonb_build_object(k,v);
 END LOOP;RETURN result;
END;$fn$;
CREATE FUNCTION public.uc_group_education_personal_counts(p_user uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t text;n bigint;result jsonb:='[]';BEGIN
 IF p_user IS NULL THEN RETURN result;END IF;
 FOREACH t IN ARRAY ARRAY['uc_group_education_states','uc_group_education_events','uc_group_calendar_versions','uc_group_roster_snapshots','uc_group_education_requests']LOOP
  EXECUTE format('SELECT count(*)FROM public.%I x WHERE position($1 IN to_jsonb(x)::text)>0',t)INTO n USING p_user::text;
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table',t,'column','private_source_and_attribution','count',n));END IF;
 END LOOP;RETURN result;
END;$fn$;
CREATE FUNCTION public.uc_group_education_deletion_preview(p_user uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE n bigint;BEGIN
 SELECT coalesce(sum((x->>'count')::bigint),0)INTO n FROM jsonb_array_elements(public.uc_group_education_personal_counts(p_user))x;
 IF n=0 THEN RETURN'[]';END IF;
 RETURN jsonb_build_array(jsonb_build_object('key','group_education_history','label','История групп: личные подписи и ссылки удаляются, общие обезличенные события сохраняются','count',n,'action','anonymize'));
END;$fn$;
CREATE FUNCTION public.uc_erase_group_education_facts(p_user uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE job uuid;job_count integer;scopes jsonb;scope jsonb;o uuid;g uuid;t text;r record;value jsonb;old_row jsonb;columns text;id_column text;current_context jsonb;enrollment_ids uuid[];snapshot_ids uuid[];operational boolean;
BEGIN
 IF p_user IS NULL OR auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR current_setting('sintagma.account_deletion_erase_user',true)IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)THEN RAISE EXCEPTION 'GROUP_FACTS_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT count(*)INTO job_count FROM public.account_deletion_jobs WHERE user_id=p_user AND state='cleanup_pending'AND consent_version='full-personal-data-v1';
 IF job_count<>1 THEN RAISE EXCEPTION 'GROUP_FACTS_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT id INTO job FROM public.account_deletion_jobs WHERE user_id=p_user AND state='cleanup_pending'AND consent_version='full-personal-data-v1'FOR UPDATE NOWAIT;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_user::text,42007))THEN RAISE EXCEPTION 'GROUP_FACTS_SOURCE_CHANGED' USING ERRCODE='40001';END IF;
 -- Collect exact individual association anchors from own nested subject rows,
 -- including association-event payloads inheriting the explicit root subject.
 WITH RECURSIVE roots(v)AS(
  SELECT to_jsonb(x)FROM public.uc_group_education_states x WHERE position(p_user::text IN to_jsonb(x)::text)>0
  UNION ALL SELECT to_jsonb(x)FROM public.uc_group_education_events x WHERE position(p_user::text IN to_jsonb(x)::text)>0
  UNION ALL SELECT to_jsonb(x)FROM public.uc_group_calendar_versions x WHERE position(p_user::text IN to_jsonb(x)::text)>0
  UNION ALL SELECT to_jsonb(x)FROM public.uc_group_roster_snapshots x WHERE position(p_user::text IN to_jsonb(x)::text)>0
  UNION ALL SELECT to_jsonb(x)FROM public.uc_group_education_requests x WHERE position(p_user::text IN to_jsonb(x)::text)>0
 ),walk(v,own)AS(
  SELECT v,coalesce(v->>'user_id'=p_user::text OR v->>'subject_user_id'=p_user::text,false)FROM roots
  UNION ALL SELECT child.v,coalesce(child.v->>'user_id'=p_user::text OR child.v->>'subject_user_id'=p_user::text,false)OR(w.own AND NOT EXISTS(SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(child.v)='object'THEN child.v ELSE'{}'END)e WHERE e.key IN('user_id','subject_user_id','actor_id','staff_user_id','teacher_user_id')AND jsonb_typeof(e.value)='string'AND e.value<>to_jsonb(p_user)))
  FROM walk w CROSS JOIN LATERAL(SELECT e.value v FROM jsonb_each(CASE WHEN jsonb_typeof(w.v)='object'THEN w.v ELSE'{}'END)e UNION ALL SELECT e.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(w.v)='array'THEN w.v ELSE'[]'END)e(value))child
 )SELECT coalesce(array_agg(DISTINCT(v->>'enrollment_id')::uuid)FILTER(WHERE own AND v->>'enrollment_id'IS NOT NULL),'{}'),coalesce(array_agg(DISTINCT(v->>'program_enrollment_snapshot_id')::uuid)FILTER(WHERE own AND v->>'program_enrollment_snapshot_id'IS NOT NULL),'{}')INTO enrollment_ids,snapshot_ids FROM walk;
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_user)OR EXISTS(SELECT 1 FROM public.enrollments WHERE user_id=p_user)OR EXISTS(SELECT 1 FROM public.student_group_memberships WHERE user_id=p_user)INTO operational;
 WITH raw AS(
  SELECT organization_id o,group_id g,course_id c FROM public.uc_group_education_states x WHERE position(p_user::text IN to_jsonb(x)::text)>0
  UNION SELECT organization_id,group_id,course_id FROM public.uc_group_education_events x WHERE position(p_user::text IN to_jsonb(x)::text)>0
  UNION SELECT organization_id,group_id,course_id FROM public.uc_group_calendar_versions x WHERE position(p_user::text IN to_jsonb(x)::text)>0
  UNION SELECT organization_id,group_id,course_id FROM public.uc_group_roster_snapshots x WHERE position(p_user::text IN to_jsonb(x)::text)>0
  UNION SELECT organization_id,group_id,course_id FROM public.uc_group_education_requests x WHERE group_id IS NOT NULL AND position(p_user::text IN to_jsonb(x)::text)>0
  UNION SELECT s.organization_id,s.group_id,s.course_id FROM public.uc_group_education_states s JOIN public.uc_group_education_requests q ON q.row_kind='source_parent'AND position(p_user::text IN to_jsonb(q)::text)>0 AND(
   q.context->'old_tuple'->>'organization_id'=s.organization_id::text OR q.context->'old_tuple'->>'group_id'=s.group_id::text OR q.context->'old_tuple'->>'student_group_id'=s.group_id::text OR q.context->'old_tuple'->>'course_id'=s.course_id::text
   OR q.context->>'parent_table'='student_groups'AND q.context->'old_tuple'->>'id'=s.group_id::text OR q.context->>'parent_table'='courses'AND q.context->'old_tuple'->>'id'=s.course_id::text OR q.context->>'parent_table'='organizations'AND q.context->'old_tuple'->>'id'=s.organization_id::text)
 )SELECT coalesce(jsonb_agg(jsonb_build_object('organization_id',z.o,'group_id',z.g,'course_id',z.c)ORDER BY z.o,z.g),'[]')INTO scopes FROM raw z WHERE z.o IS NOT NULL AND z.g IS NOT NULL AND z.c IS NOT NULL;
 -- Complete O then complete G, sorted, try-only; no foreign account A locks.
 FOR o IN SELECT DISTINCT(x.value->>'organization_id')::uuid FROM jsonb_array_elements(scopes)x(value)ORDER BY 1 LOOP IF NOT pg_try_advisory_xact_lock(hashtextextended(o::text,0))THEN RAISE EXCEPTION 'GROUP_FACTS_SOURCE_CHANGED' USING ERRCODE='40001';END IF;END LOOP;
 FOR g IN SELECT DISTINCT(x.value->>'group_id')::uuid FROM jsonb_array_elements(scopes)x(value)ORDER BY 1 LOOP IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_program_roster:'||g::text,0))THEN RAISE EXCEPTION 'GROUP_FACTS_SOURCE_CHANGED' USING ERRCODE='40001';END IF;END LOOP;
 FOREACH t IN ARRAY ARRAY['uc_group_education_states','uc_group_education_events','uc_group_calendar_versions','uc_group_roster_snapshots','uc_group_education_requests']LOOP
  id_column:=CASE WHEN t='uc_group_education_states'THEN'group_id'ELSE'id'END;
  FOR r IN EXECUTE format('SELECT %I id FROM public.%I x WHERE position($1 IN to_jsonb(x)::text)>0 ORDER BY %I FOR UPDATE NOWAIT',id_column,t,id_column)USING p_user::text LOOP NULL;END LOOP;
 END LOOP;
 FOR scope IN SELECT x.value FROM jsonb_array_elements(scopes)x(value)LOOP
  current_context:=jsonb_build_object('schema_version',1,'p_user',p_user,'cleanup_job_id',job);
  INSERT INTO public.uc_group_education_requests(row_kind,organization_id,group_id,course_id,backend_pid,full_transaction_id,context,subject_ids,actor_ids,teacher_ids)
  VALUES('erase_context',(scope->>'organization_id')::uuid,(scope->>'group_id')::uuid,(scope->>'course_id')::uuid,pg_backend_pid(),pg_current_xact_id()::text,current_context,ARRAY[p_user],'{}','{}')ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.uc_group_education_requests q WHERE row_kind='erase_context'AND q.organization_id=(scope->>'organization_id')::uuid AND q.group_id=(scope->>'group_id')::uuid AND q.course_id=(scope->>'course_id')::uuid AND q.backend_pid=pg_backend_pid()AND q.full_transaction_id=pg_current_xact_id()::text AND q.context=current_context AND q.subject_ids=ARRAY[p_user]AND q.actor_ids='{}'AND q.teacher_ids='{}')THEN RAISE EXCEPTION 'GROUP_FACTS_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 END LOOP;
 -- Remove only the erased SUBJECT stage, never another student's actor attribution.
 DELETE FROM public.uc_group_education_requests WHERE row_kind='source_detail'AND request_id=p_user;
 DELETE FROM public.uc_group_education_requests q WHERE q.row_kind IN('command','source_parent')AND position(p_user::text IN to_jsonb(q)::text)>0;
 FOREACH t IN ARRAY ARRAY['uc_group_education_states','uc_group_education_events','uc_group_calendar_versions','uc_group_roster_snapshots','uc_group_education_requests']LOOP
  id_column:=CASE WHEN t='uc_group_education_states'THEN'group_id'ELSE'id'END;
  FOR r IN EXECUTE format('SELECT to_jsonb(x)old_row FROM public.%I x WHERE position($1 IN to_jsonb(x)::text)>0 %s ORDER BY %I',t,CASE WHEN t='uc_group_education_requests'THEN'AND row_kind<>''erase_context'''ELSE''END,id_column)USING p_user::text LOOP
   old_row:=r.old_row;value:=public.uc_group_education_redact(old_row,p_user,false,false,enrollment_ids,snapshot_ids);
   IF t='uc_group_education_states'AND(value->'source_rows'IS DISTINCT FROM old_row->'source_rows'OR value->'program_proof'IS DISTINCT FROM old_row->'program_proof')THEN value:=value||jsonb_build_object('source_redacted',true);
   ELSIF t='uc_group_education_events'AND(old_row->>'subject_user_id'=p_user::text OR value->'source_snapshot'IS DISTINCT FROM old_row->'source_snapshot'OR value->'previous_row'IS DISTINCT FROM old_row->'previous_row'OR value->'next_row'IS DISTINCT FROM old_row->'next_row'OR value->'payload'IS DISTINCT FROM old_row->'payload')THEN value:=value||jsonb_build_object('redacted',true);
   ELSIF t='uc_group_calendar_versions'AND(value->'lessons'IS DISTINCT FROM old_row->'lessons'OR value->'content'IS DISTINCT FROM old_row->'content'OR value->'teacher_proofs'IS DISTINCT FROM old_row->'teacher_proofs')THEN value:=value||jsonb_build_object('redacted',true);
   ELSIF t='uc_group_roster_snapshots'AND(value->'roster_rows'IS DISTINCT FROM old_row->'roster_rows'OR value->'source_input'IS DISTINCT FROM old_row->'source_input'OR value->'program_proof'IS DISTINCT FROM old_row->'program_proof')THEN value:=value||jsonb_build_object('redacted',true);END IF;
   IF value IS DISTINCT FROM old_row THEN
    SELECT string_agg(quote_ident(attname),','ORDER BY attnum)INTO columns FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('UPDATE public.%I SET(%s)=(SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1))WHERE %I=$2',t,columns,columns,t,id_column)USING value,(old_row->>id_column)::uuid;
   END IF;
  END LOOP;
 END LOOP;
 -- Recompute live byte/count caches once from current post-redaction staging.
 -- Receipt/global admission counters are deliberately never refunded.
 WITH caches AS MATERIALIZED(
  SELECT q.id,count(d.id)::integer n,CASE WHEN count(d.id)=0 THEN 2 ELSE sum(octet_length((d.context->'detail')::text)+42)END bytes
  FROM public.uc_group_education_requests q LEFT JOIN public.uc_group_education_requests d ON d.row_kind='source_detail'AND d.group_id=q.group_id AND d.backend_pid=q.backend_pid AND d.full_transaction_id=q.full_transaction_id
  WHERE q.row_kind='source_pending'AND q.group_id IN(SELECT(x->>'group_id')::uuid FROM jsonb_array_elements(scopes)x)GROUP BY q.id
 )UPDATE public.uc_group_education_requests q SET context=q.context||jsonb_build_object('live_detail_count',z.n,'detail_map_serialized_bytes',z.bytes)FROM caches z WHERE q.id=z.id AND(q.context->'live_detail_count',q.context->'detail_map_serialized_bytes')IS DISTINCT FROM(to_jsonb(z.n),to_jsonb(z.bytes));
 IF NOT operational THEN DELETE FROM public.uc_group_education_requests WHERE row_kind='erase_context'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text AND context=jsonb_build_object('schema_version',1,'p_user',p_user,'cleanup_job_id',job)AND subject_ids=ARRAY[p_user]AND actor_ids='{}'AND teacher_ids='{}';END IF;
 -- Current trusted erase_context intentionally survives until source cleanup
 -- sees all operational subject rows gone. Inventory counts it: no false done.
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'GROUP_FACTS_SOURCE_CHANGED' USING ERRCODE='40001';
END;$fn$;

-- Exact three existing-body transforms. Guard remains core-author-owned.
-- Exact post609 privacy sequence; preserve full in-database pg_proc metadata exceptprosrc.
DO $uc013_privacy_1$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_erase_data(uuid,text)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC013';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '725f8d0d90273d393989e39f10c176b4' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC013';END IF;
 v_patched:=v_original;
 v_needle:=$uc013_privacy_1_needle_0$ PERFORM set_config('sintagma.account_deletion_erase_user',u::text,true);
$uc013_privacy_1_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC013';END IF;
 v_patched:=replace(v_patched,v_needle,$uc013_privacy_1_replacement_0$ PERFORM set_config('sintagma.account_deletion_erase_user',u::text,true);
 PERFORM public.uc_erase_group_education_facts(u);
$uc013_privacy_1_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'a10c73088117f3422b4eb2ec708dd0ad' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC013';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC013';END IF;
END;
$uc013_privacy_1$;

DO $uc013_privacy_2$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_personal_row_counts(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC013';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '6213c0e6f96a92f65e081976af522e74' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC013';END IF;
 v_patched:=v_original;
 v_needle:=$uc013_privacy_2_needle_0$ RETURN result;$uc013_privacy_2_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC013';END IF;
 v_patched:=replace(v_patched,v_needle,$uc013_privacy_2_replacement_0$ result:=result||public.uc_group_education_personal_counts(p_user_id);
 RETURN result;$uc013_privacy_2_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM '52ed26a701debe2c9f9299c04b9db8bb' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC013';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC013';END IF;
END;
$uc013_privacy_2$;

DO $uc013_privacy_3$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_snapshot(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC013';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '7238852e3da99d7b769e61d65a95dccb' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC013';END IF;
 v_patched:=v_original;
 v_needle:=$uc013_privacy_3_needle_0$ v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_admission_cases WHERE organization_id=v_org);$uc013_privacy_3_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC013';END IF;
 v_patched:=replace(v_patched,v_needle,$uc013_privacy_3_replacement_0$ v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_admission_cases WHERE organization_id=v_org);
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_group_education_states WHERE organization_id=v_org);$uc013_privacy_3_replacement_0$);
 v_needle:=$uc013_privacy_3_needle_1$ v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc013_privacy_3_needle_1$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC013';END IF;
 v_patched:=replace(v_patched,v_needle,$uc013_privacy_3_replacement_1$ v_categories:=v_categories||public.uc_group_education_deletion_preview(p_user_id);
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc013_privacy_3_replacement_1$);
 IF md5(v_patched) IS DISTINCT FROM '7725e2a24c177164694f8266cbf344ba' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC013';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC013';END IF;
END;
$uc013_privacy_3$;



-- UC116_FINAL_PRIVILEGES: exact new OIDs only, never broad name-prefix ACL edits.
CREATE FUNCTION public.uc_group_education_snapshot_page(p_org uuid,p_group uuid,p_id uuid,p_after uuid,p_limit integer)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.uc_group_roster_snapshots;c public.uc_group_calendar_versions;header jsonb;projection jsonb;pre jsonb:='[]';rows jsonb:='[]';item jsonb;next_id uuid;available boolean:=true;more boolean:=false;redacted integer:=0;n integer:=0;scope jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_group_education_actor_allowed(auth.uid(),p_org,p_group,false)OR NOT public.uc_group_education_actor_allowed(auth.uid(),p_org,p_group,true)THEN PERFORM public.uc_group_education_error('ACCESS_DENIED');END IF;
 IF public.uc_group_education_own_source(p_group)THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
 SELECT * INTO s FROM public.uc_group_roster_snapshots WHERE id=p_id AND organization_id=p_org AND group_id=p_group;IF NOT FOUND THEN PERFORM public.uc_group_education_error('NOT_FOUND');END IF;
 SELECT * INTO c FROM public.uc_group_calendar_versions WHERE id=s.calendar_version_id AND group_id=p_group AND organization_id=p_org;
 scope:=public.uc_group_education_scope(p_org,p_group,s.course_id);
 IF NOT EXISTS(SELECT 1 FROM public.student_groups WHERE id=p_group AND organization_id=p_org AND course_id=s.course_id)THEN PERFORM public.uc_group_education_error('ACCESS_DENIED');END IF;
 IF s.redacted OR c.redacted THEN available:=false;pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('SOURCE_ERASED','document'));END IF;
 IF c.id IS NULL OR c.content_hash<>s.calendar_hash OR c.program_ref IS DISTINCT FROM s.program_ref OR NOT public.uc_group_education_retained_program_valid(p_org,p_group,s.course_id,s.program_proof)THEN available:=false;pre:=pre||jsonb_build_array(public.uc_group_education_prerequisite('PROGRAM_SOURCE_UNAVAILABLE','program'));END IF;
 FOR item IN SELECT x FROM jsonb_array_elements(coalesce(c.lessons,'[]'))x WHERE x->>'status'='planned'LOOP
  IF item->'teacher_user_id'='null'OR item->>'teacher_label_state'<>'available'OR NOT public.uc_group_education_teacher_allowed((item->>'teacher_user_id')::uuid,p_org,p_group)THEN available:=false;END IF;
 END LOOP;
 IF NOT available AND pre='[]'THEN pre:=jsonb_build_array(public.uc_group_education_prerequisite('TEACHER_REQUIRED','calendar'));END IF;
 FOR item IN SELECT x FROM jsonb_array_elements(s.roster_rows)x LOOP
  IF item->>'label_state'<>'available'OR item->'user_id'='null'OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=(item->>'user_id')::uuid)THEN redacted:=redacted+1;available:=false;END IF;
  IF item->>'association'<>'confirmed'OR NOT EXISTS(SELECT 1 FROM public.group_program_enrollment_snapshots x WHERE x.id=(item->>'program_enrollment_snapshot_id')::uuid AND x.enrollment_id=(item->>'enrollment_id')::uuid AND x.user_id=(item->>'user_id')::uuid AND x.organization_id=p_org AND x.group_id=p_group AND x.course_id=s.course_id AND x.binding_id=(s.program_ref->>'binding_id')::uuid AND x.binding_revision=(s.program_ref->>'binding_revision')::bigint AND x.version_id=(s.program_ref->>'version_id')::uuid AND x.snapshot_hash=s.program_ref->>'binding_snapshot_hash')THEN available:=false;END IF;
 END LOOP;
 IF NOT available AND pre='[]'THEN pre:=jsonb_build_array(public.uc_group_education_prerequisite('SOURCE_ERASED','document'));END IF;
 IF available THEN
  IF public.uc_program_hash(s.roster_rows)<>s.roster_hash OR s.source_input IS NULL OR public.uc_program_hash(s.source_input)<>s.source_hash OR public.uc_program_hash(c.content)<>c.content_hash THEN PERFORM public.uc_group_education_error('SOURCE_UNAVAILABLE');END IF;
  FOR item IN SELECT x FROM jsonb_array_elements(s.roster_rows)x WHERE p_after IS NULL OR(x->>'user_id')::uuid>p_after ORDER BY x->>'user_id'LIMIT p_limit+1 LOOP
   IF n=p_limit THEN more:=true;EXIT;END IF;n:=n+1;rows:=rows||jsonb_build_array(item);next_id:=(item->>'user_id')::uuid;END LOOP;
  IF p_after IS NULL THEN projection:=jsonb_build_object('schema_version',1,'scope',scope,'snapshot_id',s.id,'source_hash',s.source_hash,'program_facts',s.program_proof,'calendar',public.uc_group_education_calendar(c.id),'as_of',s.as_of,'knowledge_revision',s.knowledge_revision,'coverage_segment_id',s.coverage_segment_id,'display_label_notice','display_labels_observed_separately_not_verified_legal_names');
   IF octet_length(projection::text)>1048576 THEN PERFORM public.uc_group_education_error('LIMIT_EXCEEDED');END IF;
  END IF;
 END IF;
 header:=jsonb_build_object('id',s.id,'scope',scope,'as_of',s.as_of,'timezone',s.timezone,'knowledge_revision',s.knowledge_revision,'coverage','complete_observed','calendar_version_id',s.calendar_version_id,'calendar_hash',s.calendar_hash,'program_ref',s.program_ref,'roster_hash',s.roster_hash,'source_hash',s.source_hash,'row_count',s.row_count,'redacted_count',redacted,'purpose',s.purpose,'recorded_at',s.recorded_at,'recorded_by',s.recorded_by,'available',available,'prerequisites',pre,'coverage_segment_id',s.coverage_segment_id,'coverage_known_from',s.coverage_known_from);
 RETURN jsonb_build_object('schema_version',1,'header',header,'rows',rows,'next_after_user_id',CASE WHEN more THEN next_id END,'artifact_projection',projection);END;$fn$;

DO $acl$
DECLARE t text;r record;g record;grantee text;
BEGIN
 FOREACH t IN ARRAY ARRAY['uc_group_education_states','uc_group_education_events','uc_group_calendar_versions','uc_group_roster_snapshots','uc_group_education_requests']LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.oid=format('public.%I',t)::regclass AND a.grantee<>c.relowner LOOP
   grantee:=CASE WHEN g.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(g.grantee))END;
   EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %s CASCADE',t,grantee);
  END LOOP;
  EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO %I',t,(SELECT pg_get_userbyid(relowner)FROM pg_class WHERE oid=format('public.%I',t)::regclass));
 END LOOP;
 FOR r IN SELECT p.oid,p.oid::regprocedure identity,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND NOT EXISTS(SELECT 1 FROM uc116_function_oids_before b WHERE b.oid=p.oid)LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=r.oid AND a.grantee<>p.proowner LOOP
   grantee:=CASE WHEN g.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(g.grantee))END;EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s CASCADE',r.identity,grantee);
  END LOOP;
 END LOOP;
 GRANT EXECUTE ON FUNCTION public.read_group_education_facts(uuid,uuid,jsonb),public.apply_group_education_facts_action(uuid,uuid,bigint,uuid,jsonb)TO authenticated;
END;$acl$;

-- Same unpublished migration116: exact separately reviewed mode48 extension.
-- Source-only integration remains held for combined native/release acceptance.
-- EXTERNAL AUTHORING ONLY. No installation or execution approval.
-- Caller must use one reviewed transaction; this file never commits it.
-- INTERNAL registry amendment: one owner-only helper, two existing wrappers.
DO $preconditions$
BEGIN
 IF current_user<>'postgres' THEN
  RAISE EXCEPTION 'UC116_MODE_AUTHORITY_OWNER_REQUIRED';
 END IF;
 IF pg_catalog.to_regprocedure('public.uc_group_education_actor_facts(uuid,uuid,uuid,boolean)') IS NOT NULL THEN
  RAISE EXCEPTION 'UC116_MODE_AUTHORITY_HELPER_ALREADY_EXISTS';
 END IF;
END;
$preconditions$;

CREATE FUNCTION public.uc_group_education_actor_facts(p_actor uuid, p_org uuid, p_group uuid, p_requested_write boolean)
 RETURNS TABLE(can_read boolean, can_write boolean, snapshot jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 WITH raw_group AS MATERIALIZED (
   SELECT g.course_id, c.organization_id AS course_organization_id
   FROM public.student_groups g
   LEFT JOIN public.courses c ON c.id=g.course_id
   WHERE g.id=p_group AND g.organization_id=p_org
 ), group_valid AS MATERIALIZED (
   SELECT EXISTS(SELECT 1 FROM raw_group
     WHERE course_id IS NULL OR course_organization_id=p_org) AS allowed
 ), role_rows AS MATERIALIZED (
   SELECT role::text AS role FROM public.user_roles
   WHERE p_requested_write IS NULL AND user_id=p_actor
 ), staff_rows AS MATERIALIZED (
   SELECT s.id, s.role, s.sections_access, s.expires_at,
     EXISTS(SELECT 1 FROM public.org_staff_document_groups a
       WHERE a.staff_id=s.id AND a.organization_id=p_org AND a.group_id=p_group) AS exact_group_assigned
   FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org
 ), actor_flags AS MATERIALIZED (
   SELECT
     CASE WHEN p_requested_write IS NOT TRUE
       THEN public.uc_admission_actor_allowed(p_actor,false) ELSE NULL::boolean END AS admission_read,
     CASE WHEN p_requested_write IS NOT FALSE
       THEN public.uc_admission_actor_allowed(p_actor,true) ELSE NULL::boolean END AS admission_write,
     (public.has_role(p_actor,'admin'::public.app_role)
       OR public.is_org_owner(p_actor,p_org)) AS privileged
 ), eligible_staff AS MATERIALIZED (
   SELECT
     CASE WHEN p_requested_write IS NOT TRUE THEN
       EXISTS(SELECT 1 FROM staff_rows s
         WHERE (s.expires_at IS NULL OR s.expires_at>now())
         AND (s.role<>'teacher' OR s.exact_group_assigned)) ELSE NULL::boolean END AS read_eligible,
     CASE WHEN p_requested_write IS NOT FALSE THEN
       EXISTS(SELECT 1 FROM staff_rows s
         WHERE (s.expires_at IS NULL OR s.expires_at>now())
         AND (s.role<>'teacher' OR (s.exact_group_assigned
           AND s.sections_access ?& ARRAY['students.write','documents.write']))) ELSE NULL::boolean END AS write_eligible
 ), permission_flags AS MATERIALIZED (
   SELECT
     CASE WHEN p_requested_write IS NOT TRUE THEN
       CASE WHEN a.admission_read AND g.allowed AND NOT a.privileged AND s.read_eligible
         THEN public.has_org_staff_permission(p_actor,p_org,'students.read') ELSE false END
       ELSE NULL::boolean END AS students_read,
     CASE WHEN p_requested_write IS NOT TRUE THEN
       CASE WHEN a.admission_read AND g.allowed AND NOT a.privileged AND s.read_eligible
         THEN public.has_org_staff_permission(p_actor,p_org,'documents.read') ELSE false END
       ELSE NULL::boolean END AS documents_read,
     CASE WHEN p_requested_write IS NOT FALSE THEN
       CASE WHEN a.admission_write AND g.allowed AND NOT a.privileged AND s.write_eligible
         THEN public.has_org_staff_permission(p_actor,p_org,'students.write') ELSE false END
       ELSE NULL::boolean END AS students_write,
     CASE WHEN p_requested_write IS NOT FALSE THEN
       CASE WHEN a.admission_write AND g.allowed AND NOT a.privileged AND s.write_eligible
         THEN public.has_org_staff_permission(p_actor,p_org,'documents.write') ELSE false END
       ELSE NULL::boolean END AS documents_write
   FROM actor_flags a CROSS JOIN group_valid g CROSS JOIN eligible_staff s
 ), decision AS MATERIALIZED (
   SELECT
     CASE WHEN p_requested_write IS NOT TRUE THEN
       coalesce(a.admission_read AND g.allowed
         AND (a.privileged OR (s.read_eligible AND p.students_read AND p.documents_read)),false)
       ELSE NULL::boolean END AS read_result,
     CASE WHEN p_requested_write IS NOT FALSE THEN
       coalesce(a.admission_write AND g.allowed
         AND (a.privileged OR (s.write_eligible AND p.students_write AND p.documents_write)),false)
       ELSE NULL::boolean END AS write_result
   FROM actor_flags a CROSS JOIN group_valid g CROSS JOIN eligible_staff s CROSS JOIN permission_flags p
 )
 SELECT d.read_result, d.write_result,
   CASE WHEN p_requested_write IS NULL THEN jsonb_build_object(
     'actor_id',p_actor,
     'scope',public.uc_group_education_scope(p_org,p_group,(SELECT course_id FROM raw_group)),
     'roles',coalesce((SELECT jsonb_agg(role ORDER BY role) FROM role_rows),'[]'::jsonb),
     'staff',coalesce((SELECT jsonb_agg(jsonb_build_object(
       'staff_id',s.id,'role',s.role,'sections_access',s.sections_access,
       'expires_at',s.expires_at,'exact_group_assigned',s.exact_group_assigned)
       ORDER BY s.id) FROM staff_rows s),'[]'::jsonb),
     'can_read',d.read_result,'can_write',d.write_result,'observed_at',clock_timestamp())
     ELSE NULL::jsonb END
 FROM decision d
$function$;

-- Restrict ONLY the exact newly created helper, including inherited custom ACL.
-- No old function ACL, role or pg_default_acl object is modified.
DO $helper_acl$
DECLARE
 target_sql constant text:='public.uc_group_education_actor_facts(uuid,uuid,uuid,boolean)';
 target regprocedure:=target_sql::regprocedure;
 owner_oid oid;
 owner_name text;
 grantee_oid oid;
 grantee_name text;
BEGIN
 SELECT p.proowner,r.rolname INTO owner_oid,owner_name
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE p.oid=target;
 IF owner_name IS DISTINCT FROM 'postgres' THEN
  RAISE EXCEPTION 'UC116_MODE_AUTHORITY_HELPER_OWNER_MISMATCH';
 END IF;
 FOR grantee_oid IN
   SELECT DISTINCT a.grantee FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   WHERE p.oid=target AND a.grantee<>p.proowner
 LOOP
  IF grantee_oid=0 THEN
   EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC CASCADE',target_sql);
  ELSE
   SELECT rolname INTO grantee_name FROM pg_catalog.pg_roles WHERE oid=grantee_oid;
   IF grantee_name IS NULL THEN
    RAISE EXCEPTION 'UC116_MODE_AUTHORITY_HELPER_GRANTEE_UNAVAILABLE';
   END IF;
   EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I CASCADE',target_sql,grantee_name);
  END IF;
 END LOOP;
 EXECUTE pg_catalog.format('GRANT ALL PRIVILEGES ON FUNCTION %s TO %I',target_sql,owner_name);
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   WHERE p.oid=target AND a.grantee<>owner_oid) THEN
  RAISE EXCEPTION 'UC116_MODE_AUTHORITY_HELPER_UNEXPECTED_EXECUTE_GRANT';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
   WHERE p.oid=target AND p.proowner=owner_oid AND r.rolname='postgres') THEN
  RAISE EXCEPTION 'UC116_MODE_AUTHORITY_HELPER_OWNER_CHANGED';
 END IF;
END;
$helper_acl$;

CREATE OR REPLACE FUNCTION public.uc_group_education_authority(p_org uuid, p_group uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT f.snapshot
 FROM public.uc_group_education_actor_facts(p_actor,p_org,p_group,NULL::boolean) f
$function$;

CREATE OR REPLACE FUNCTION public.uc_group_education_actor_allowed(p_actor uuid, p_org uuid, p_group uuid, p_write boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT CASE WHEN p_write IS NULL THEN false ELSE coalesce(
   (SELECT CASE WHEN p_write THEN f.can_write ELSE f.can_read END
     FROM public.uc_group_education_actor_facts(p_actor,p_org,p_group,p_write) f),false) END
$function$;

-- Same unpublished UC013 migration: reviewed append-only budget51 extension.
-- Source equivalence is pinned; release artifacts require independent native51 regeneration.
-- EXTERNAL ISOLATED CANDIDATE ONLY. Not production/release SQL.
-- Apply atomically after exact SQL74bb + mode48 a088, before synthetic seed.
BEGIN;
DO $preflight$
DECLARE e jsonb;p record;counted integer;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' THEN RAISE EXCEPTION 'UC116_COUNTER_OWNER_REQUIRED';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements('[{"signature":"apply_group_education_facts_action(uuid,uuid,bigint,uuid,jsonb)","md5":"fe4c4d6eb3fdad11c8e8c4d40ab6b454","owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres}"},{"signature":"read_group_education_facts(uuid,uuid,jsonb)","md5":"09920d026684f29eeb45af6cb35faffd","owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres}"},{"signature":"uc_erase_group_education_facts(uuid)","md5":"6edeeaf434b269a82afd156eb5d6eb64","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_actor_allowed(uuid,uuid,uuid,boolean)","md5":"65e768337c08576fe98d2ba4f635be34","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_actor_facts(uuid,uuid,uuid,boolean)","md5":"9f97d20a8bd235af84c11449b7e5cb12","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_append(uuid,uuid,uuid,text,timestamp with time zone,jsonb,text,uuid,uuid,uuid,uuid,uuid,jsonb,uuid,text)","md5":"56323f6159613c47ed4c14271f60b0f1","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_authority(uuid,uuid,uuid)","md5":"72197dfa9f61684eabfe36ede4d22143","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_calendar(uuid)","md5":"ebdc054dd2c0c6fbf62548d01d97a920","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_calendar_input(uuid,uuid,jsonb,jsonb)","md5":"f9efa636d923a36030efc0d440edbdf6","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_capabilities(uuid,uuid)","md5":"ea19e09040a38de728289010a64a3c71","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_correct(uuid,uuid,jsonb)","md5":"389b7ea12c5016c47a02426c7345c973","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_count(integer,boolean)","md5":"d5ba9fbd1e5c76394f349c682bc6ef59","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_deletion_preview(uuid)","md5":"51d07ce570983fb238735f8f13f37b00","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_envelope(uuid,uuid)","md5":"2099370b881bd939afc15ef7c988026d","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_erasing(uuid)","md5":"e15622bfe33ad971c09d6207b42734ba","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_error(text)","md5":"7d95f86c32312dc49915faab9b7d308b","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_event(uuid)","md5":"8896759b8f07e52d74a0a7a6b6b0f3d6","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_event_complete(uuid)","md5":"becd22ad94aa3cc358987a340ad170f7","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_legacy(uuid)","md5":"00a57bc8ceeba84f47d32cb0bbcf59d2","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_lock(uuid,uuid,uuid[],uuid,boolean)","md5":"7817c2332be2dbfa1ae95501e7754768","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_offset(text)","md5":"9cbc88b36c56e1c529f65fc7975706ac","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_open_gap(uuid,uuid,timestamp with time zone,bigint,text,uuid,text)","md5":"0e369032ef03eacc66c7508298239d43","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_own_source(uuid)","md5":"295789143ed6adf7acf6811dd6146e7a","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_parent_cleanup()","md5":"e62e759ef88a0527f9841036f223745a","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_personal_counts(uuid)","md5":"878070544bd428c4fb28e85f0891fb71","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_prerequisite(text,text,uuid)","md5":"5f1d5a04c557fa334a46c5f551062604","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_program(uuid,uuid)","md5":"3ddfcb97fa76f4b979f899bd9e6f6667","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_program_proof(uuid,uuid,jsonb,uuid[])","md5":"088b178a74cb60f1b6eff0fdb5a67247","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_public_row(jsonb)","md5":"7b7ee4bcbac0546aa5b93ced4ee57cc6","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_redact(jsonb,uuid,boolean,boolean,uuid[],uuid[])","md5":"f8441ea984564bc6f07ca5c2094265c9","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_retained_program_valid(uuid,uuid,uuid,jsonb)","md5":"aab8ea38bf12c2e057896c59851a7648","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_roster_context(uuid,uuid,jsonb,bigint,uuid,integer)","md5":"3546a3593fcfe91fb7e7217e50175428","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_scan(uuid,uuid,timestamp with time zone,uuid,jsonb,boolean,uuid[])","md5":"0ada0f370189530fd49e488a06cdd186","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_scope(uuid,uuid,uuid)","md5":"4b9809e8bae980279d8af2556761ebf8","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_short_name(text)","md5":"bb8cb4314cae48f242c27bcc51cfab62","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_snapshot_page(uuid,uuid,uuid,uuid,integer)","md5":"5f0cc6e8df03a7c551da9e0745a22d60","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_source_after()","md5":"905572a7872607018081ea3d59c2b711","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_source_before()","md5":"e7603ef4437c31adae8df7ad0916acb8","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_source_fold()","md5":"1bd1d631df99920fed70af8c693a31e3","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_source_observe()","md5":"cd900fc5f511e5f1cce72e1132984ed2","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_source_queue(uuid,uuid,uuid[],text,text,jsonb,jsonb)","md5":"a6870153cf88c94eb593f088e270eef1","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_source_relevant(text,jsonb,jsonb)","md5":"471f1b04846b39c455b239381dd7e797","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_source_scopes(text,jsonb,jsonb)","md5":"65f474abe5339ab6dce057f6d71e3e82","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_source_statement_end()","md5":"aeb1f188f8ab87756d40421a7b33d8e0","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_source_truncate()","md5":"3f544fa385e6f9a7fb78dbf72fee467b","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_teacher_allowed(uuid,uuid,uuid)","md5":"dc1310b73e4f84a8deeabb556ffb1369","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_valid_zone(text)","md5":"76657e8d633f02cc1a0a5f2da2de51f0","owner":"postgres","acl":"{postgres=X/postgres}"},{"signature":"uc_group_education_validate_artifact(jsonb)","md5":"e26fda60fe424fe09bdd0e2f3fbfdd6d","owner":"postgres","acl":"{postgres=X/postgres}"}]'::jsonb) LOOP
  SELECT md5(pg_get_functiondef(x.oid))definition_md5,pg_get_userbyid(x.proowner)owner,x.proacl::text acl INTO p FROM pg_proc x WHERE x.oid=to_regprocedure('public.'||(e->>'signature'));
  IF p.definition_md5 IS DISTINCT FROM e->>'md5' OR p.owner IS DISTINCT FROM e->>'owner' OR p.acl IS DISTINCT FROM e->>'acl' THEN RAISE EXCEPTION 'UC116_COUNTER_BASELINE_SOURCE_OR_ACL:%',e->>'signature';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.uc_group_education_requests) THEN RAISE EXCEPTION 'UC116_COUNTER_EMPTY_EXPERIMENT_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc catalog_proc JOIN pg_namespace n ON n.oid=catalog_proc.pronamespace WHERE n.nspname='public'AND catalog_proc.proname=ANY(ARRAY['uc_group_education_budget_counter','uc_group_education_budget_ticket_guard','uc_group_education_compact_budget_tickets']))THEN RAISE EXCEPTION 'UC116_COUNTER_HELPER_NAME_COLLISION';END IF;
 SELECT count(*)INTO counted FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='row_kind' WHERE c.conrelid='public.uc_group_education_requests'::regclass AND c.contype='c' AND c.conkey=ARRAY[a.attnum]::smallint[];
 IF counted<>1 THEN RAISE EXCEPTION 'UC116_COUNTER_ROW_KIND_CHECK_IDENTITY';END IF;
 SELECT c.conname,pg_get_expr(c.conbin,c.conrelid)expression INTO p FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='row_kind' WHERE c.conrelid='public.uc_group_education_requests'::regclass AND c.contype='c' AND c.conkey=ARRAY[a.attnum]::smallint[];
 IF regexp_replace(p.expression,'\s','','g')<>regexp_replace('(row_kind = ANY (ARRAY[''command''::text, ''source_pending''::text, ''source_parent''::text, ''erase_context''::text, ''source_transaction_receipt''::text, ''source_transaction_budget''::text, ''public_operation''::text, ''source_detail''::text]))','\s','','g') THEN RAISE EXCEPTION 'UC116_COUNTER_ROW_KIND_CHECK_SOURCE';END IF;
 EXECUTE format('ALTER TABLE public.uc_group_education_requests DROP CONSTRAINT %I',p.conname);
END;$preflight$;
ALTER TABLE public.uc_group_education_requests ADD CONSTRAINT uc_group_education_requests_counter_kinds CHECK(row_kind IN('command','source_pending','source_parent','erase_context','source_transaction_receipt','source_transaction_budget','public_operation','source_detail','source_budget_admission'));
ALTER TABLE public.uc_group_education_requests ADD CONSTRAINT uc_group_education_budget_ticket_shape CHECK(row_kind<>'source_budget_admission'OR(
 organization_id IS NULL AND group_id IS NULL AND course_id IS NULL AND actor_id IS NULL AND request_id IS NOT NULL AND action IS NULL AND expected_revision BETWEEN 1 AND 10000 AND input_hash IS NULL AND body IS NULL AND receipt IS NULL
 AND backend_pid>0 AND full_transaction_id~'^[1-9][0-9]{0,19}$' AND subject_ids='{}'::uuid[] AND actor_ids='{}'::uuid[] AND teacher_ids='{}'::uuid[]
 AND context=jsonb_build_object('schema_version',1,'admitted_detail_count',expected_revision,'previous_admitted_detail_count',expected_revision-1))IS TRUE);
CREATE UNIQUE INDEX uc_group_education_budget_ticket_ordinal ON public.uc_group_education_requests(backend_pid,full_transaction_id,expected_revision DESC)WHERE row_kind='source_budget_admission';
CREATE INDEX uc_group_education_budget_ticket_cleanup ON public.uc_group_education_requests(created_at,id)WHERE row_kind='source_transaction_budget'AND context->>'ticket_status'='active';

CREATE FUNCTION public.uc_group_education_budget_counter(p_budget uuid)RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $counter$
DECLARE b public.uc_group_education_requests;latest bigint:=0;checkpoint integer;value integer;
BEGIN
 SELECT * INTO b FROM public.uc_group_education_requests WHERE id=p_budget AND row_kind='source_transaction_budget'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id_if_assigned()::text FOR UPDATE NOWAIT;
 IF b.id IS NULL THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 -- Malformed old budget values keep the original conservative gap behavior.
 IF NOT coalesce(jsonb_typeof(b.context->'admitted_detail_count')='number'AND b.context->>'admitted_detail_count'~'^(0|[1-9][0-9]{0,4})$',false)
 OR NOT coalesce(jsonb_typeof(b.context->'ticket_checkpoint')='number'AND b.context->>'ticket_checkpoint'~'^(0|[1-9][0-9]{0,4})$',false)
 OR b.context->>'ticket_status'IS DISTINCT FROM'active' THEN RETURN NULL;END IF;
 value:=(b.context->>'admitted_detail_count')::integer;checkpoint:=(b.context->>'ticket_checkpoint')::integer;
 IF value>10000 OR checkpoint<>value THEN RETURN NULL;END IF;
 SELECT expected_revision INTO latest FROM public.uc_group_education_requests WHERE row_kind='source_budget_admission'AND backend_pid=b.backend_pid AND full_transaction_id=b.full_transaction_id ORDER BY expected_revision DESC LIMIT 1;
 latest:=coalesce(latest,0);
 IF latest<checkpoint OR latest>10000 THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 IF checkpoint>0 AND NOT EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind='source_budget_admission'AND backend_pid=b.backend_pid AND full_transaction_id=b.full_transaction_id AND expected_revision=checkpoint AND request_id=b.id)THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 RETURN latest::integer;
END;$counter$;
CREATE FUNCTION public.uc_group_education_budget_ticket_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $ticket$
DECLARE b public.uc_group_education_requests;n integer;
BEGIN
 IF TG_OP IN('UPDATE','DELETE')AND OLD.row_kind='source_transaction_budget'AND(
 TG_OP='DELETE'OR(NEW.id,NEW.row_kind,NEW.backend_pid,NEW.full_transaction_id)IS DISTINCT FROM(OLD.id,OLD.row_kind,OLD.backend_pid,OLD.full_transaction_id))AND EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind='source_budget_admission'AND backend_pid=OLD.backend_pid AND full_transaction_id=OLD.full_transaction_id)THEN RAISE EXCEPTION 'GROUP_FACTS_SOURCE_CHANGED' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT'AND NEW.row_kind<>'source_budget_admission'OR TG_OP='UPDATE'AND OLD.row_kind<>'source_budget_admission'AND NEW.row_kind<>'source_budget_admission'OR TG_OP='DELETE'AND OLD.row_kind<>'source_budget_admission'THEN IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='UPDATE'THEN RAISE EXCEPTION 'GROUP_FACTS_SOURCE_CHANGED' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT'THEN
  IF NEW.backend_pid IS DISTINCT FROM pg_backend_pid()OR NEW.full_transaction_id IS DISTINCT FROM pg_current_xact_id()::text THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  n:=public.uc_group_education_budget_counter(NEW.request_id);
  IF n IS NULL OR n>=10000 OR NEW.expected_revision IS DISTINCT FROM(n+1)::bigint THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  RETURN NEW;
 END IF;
 -- Current-TX deletion would reset a monotonic quota. No flush/erasure path
 -- may do it. An old set is deletable only under this real cleanup claim.
 IF OLD.full_transaction_id=pg_current_xact_id()::text THEN RAISE EXCEPTION 'GROUP_FACTS_SOURCE_CHANGED' USING ERRCODE='42501';END IF;
 SELECT * INTO b FROM public.uc_group_education_requests WHERE id=OLD.request_id AND row_kind='source_transaction_budget'AND backend_pid=OLD.backend_pid AND full_transaction_id=OLD.full_transaction_id FOR UPDATE NOWAIT;
 IF b.id IS NULL OR b.context->>'ticket_status'IS DISTINCT FROM'compacted'
 OR b.context->'ticket_compaction'IS DISTINCT FROM jsonb_build_object('schema_version',1,'backend_pid',pg_backend_pid(),'full_transaction_id',pg_current_xact_id()::text,'admitted_detail_count',b.context->'admitted_detail_count')
 OR OLD.expected_revision>(b.context->>'admitted_detail_count')::integer THEN RAISE EXCEPTION 'GROUP_FACTS_SOURCE_CHANGED' USING ERRCODE='42501';END IF;
 RETURN OLD;
END;$ticket$;
CREATE TRIGGER aaa_uc013_budget_ticket_guard BEFORE INSERT OR UPDATE OR DELETE ON public.uc_group_education_requests FOR EACH ROW EXECUTE FUNCTION public.uc_group_education_budget_ticket_guard();
CREATE FUNCTION public.uc_group_education_compact_budget_tickets()RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $compact$
DECLARE b public.uc_group_education_requests;n integer;lo bigint;hi bigint;total bigint;counted integer;receipt_count integer;unsafe_reason text;
BEGIN
 -- Another transaction's uncommitted rows are invisible at READ COMMITTED.
 -- Different full xid + visibility is the commit proof, never a TTL/status.
 IF current_setting('transaction_isolation')<>'read committed'THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 SELECT * INTO b FROM public.uc_group_education_requests WHERE row_kind='source_transaction_budget'AND context->>'ticket_status'='active'AND full_transaction_id<>pg_current_xact_id()::text ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF b.id IS NULL THEN RETURN;END IF;
 <<verify_old>>
 BEGIN
  IF NOT coalesce(jsonb_typeof(b.context->'admitted_detail_count')='number'AND b.context->>'admitted_detail_count'~'^(0|[1-9][0-9]{0,4})$',false)
  OR NOT coalesce(jsonb_typeof(b.context->'ticket_checkpoint')='number'AND b.context->>'ticket_checkpoint'~'^(0|[1-9][0-9]{0,4})$',false)OR b.context?'statement_depth'OR b.context?'statement_constraint_seen'THEN unsafe_reason:='checkpoint_shape';EXIT verify_old;END IF;
  counted:=(b.context->>'admitted_detail_count')::integer;
  IF counted>10000 OR counted<>(b.context->>'ticket_checkpoint')::integer THEN unsafe_reason:='checkpoint_value';EXIT verify_old;END IF;
  SELECT count(*)::integer,min(expected_revision),max(expected_revision)INTO n,lo,hi FROM public.uc_group_education_requests WHERE row_kind='source_budget_admission'AND backend_pid=b.backend_pid AND full_transaction_id=b.full_transaction_id;
  IF n<>counted OR(n>0 AND(lo<>1 OR hi<>n))OR EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind='source_budget_admission'AND backend_pid=b.backend_pid AND full_transaction_id=b.full_transaction_id AND request_id<>b.id)THEN unsafe_reason:='ticket_set';EXIT verify_old;END IF;
  IF EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind IN('source_pending','source_detail')AND backend_pid=b.backend_pid AND full_transaction_id=b.full_transaction_id)THEN unsafe_reason:='pending_source';EXIT verify_old;END IF;
  IF EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind='source_transaction_receipt'AND backend_pid=b.backend_pid AND full_transaction_id=b.full_transaction_id AND(
   NOT coalesce(context->>'status'IN('gap','first_flush_complete_provisional'),false)
   OR NOT coalesce(jsonb_typeof(context->'group_admitted_detail_count')='number'AND context->>'group_admitted_detail_count'~'^(0|[1-9][0-9]{0,3})$',false)))THEN unsafe_reason:='receipt_shape';EXIT verify_old;END IF;
  SELECT count(*)::integer,coalesce(sum((context->>'group_admitted_detail_count')::integer),0)INTO receipt_count,total FROM public.uc_group_education_requests WHERE row_kind='source_transaction_receipt'AND backend_pid=b.backend_pid AND full_transaction_id=b.full_transaction_id;
  IF total<>counted OR EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind='source_transaction_receipt'AND backend_pid=b.backend_pid AND full_transaction_id=b.full_transaction_id AND(context->>'group_admitted_detail_count')::integer>1000)OR(counted>0 AND receipt_count=0)THEN unsafe_reason:='receipt_total';EXIT verify_old;END IF;
 END verify_old;
 IF unsafe_reason IS NOT NULL THEN
  -- Failure isolation: retain every old ticket/count/receipt/event. Only the
  -- old budget operational status and a finite nonpersonal reason may change.
  -- This marker rolls back with the caller, and excludes the unsafe set from
  -- the active-cleanup partial index on a successful unrelated source commit.
  UPDATE public.uc_group_education_requests SET context=context||jsonb_build_object('ticket_status','retained_unverified','ticket_retention',jsonb_build_object('schema_version',1,'reason',unsafe_reason))WHERE id=b.id;
  RETURN;
 END IF;
 UPDATE public.uc_group_education_requests SET context=context||jsonb_build_object('ticket_status','compacted','ticket_compaction',jsonb_build_object('schema_version',1,'backend_pid',pg_backend_pid(),'full_transaction_id',pg_current_xact_id()::text,'admitted_detail_count',counted))WHERE id=b.id;
 DELETE FROM public.uc_group_education_requests WHERE row_kind='source_budget_admission'AND backend_pid=b.backend_pid AND full_transaction_id=b.full_transaction_id;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>counted THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 -- No catch-all: unexpected DDL/DML/connection errors remain real failures.
END;$compact$;
CREATE OR REPLACE FUNCTION public.uc_group_education_source_before()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE oldj jsonb:=CASE WHEN TG_OP<>'INSERT'THEN to_jsonb(OLD)END;newj jsonb:=CASE WHEN TG_OP<>'DELETE'THEN to_jsonb(NEW)END;scopes jsonb;fresh jsonb;users uuid[];accounts uuid[];orgs uuid[];groups uuid[];fresh_groups uuid[];a uuid;o uuid;g uuid;r record;origin text:=CASE auth.role()WHEN'authenticated'THEN'authenticated'WHEN'service_role'THEN'service'ELSE'system'END;source text;parent text;ctx jsonb;masked boolean:=false;budget public.uc_group_education_requests;
BEGIN
 IF NOT public.uc_group_education_source_relevant(TG_TABLE_NAME,oldj,newj)THEN IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 users:=array_remove(ARRAY[(oldj->>'user_id')::uuid,(newj->>'user_id')::uuid],NULL);
 IF cardinality(users)>0 THEN SELECT bool_and(public.uc_group_education_erasing(x))INTO masked FROM unnest(users)x;END IF;
 IF coalesce(masked,false)THEN
  IF TG_TABLE_NAME='profiles'AND TG_OP='DELETE'THEN
   INSERT INTO public.uc_group_education_requests(row_kind,backend_pid,full_transaction_id,action,request_id,context,subject_ids)
   VALUES('source_parent',pg_backend_pid(),pg_current_xact_id()::text,'profiles',coalesce(oldj->>'id',oldj->>'user_id')::uuid,jsonb_build_object('schema_version',1,'parent_table','profiles','parent_id',coalesce(oldj->>'id',oldj->>'user_id'),'old_tuple',jsonb_build_object('id',oldj->'id','user_id',oldj->'user_id','organization_id',oldj->'organization_id','student_group_id',oldj->'student_group_id'),'origin','service','actor_id',NULL,'observed_at',clock_timestamp()),users)ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;
 END IF;
 -- An old RR snapshot cannot prove absence of a newly initialized tracker. Fail
 -- before the state lookup, including apparently uninitialized relevant writes.
 IF current_setting('transaction_isolation')<>'read committed'THEN RAISE EXCEPTION 'GROUP_FACTS_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY x.group_id),'[]')INTO scopes FROM public.uc_group_education_source_scopes(TG_TABLE_NAME,oldj,newj)x;
 IF scopes='[]'THEN IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_TABLE_NAME IN('student_groups','courses','organizations')THEN
  SELECT coalesce(array_agg(DISTINCT u ORDER BY u),'{}')INTO users FROM(
   SELECT m.user_id u FROM public.student_group_memberships_effective m JOIN jsonb_to_recordset(scopes)AS s(organization_id uuid,group_id uuid,course_id uuid)ON s.organization_id=m.organization_id AND s.group_id=m.group_id
   UNION SELECT(x->>'user_id')::uuid FROM public.uc_group_education_states s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.source_rows,'[]'))x WHERE s.group_id IN(SELECT(v->>'group_id')::uuid FROM jsonb_array_elements(scopes)v))q WHERE u IS NOT NULL;
 END IF;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}')INTO accounts FROM unnest(array_append(users,auth.uid()))x WHERE x IS NOT NULL;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}')INTO groups FROM(
  SELECT(v->>'group_id')::uuid x FROM jsonb_array_elements(scopes)v
  UNION SELECT m.group_id FROM public.student_group_memberships_effective m WHERE m.user_id=ANY(users)
  UNION SELECT(oldj->>'student_group_id')::uuid UNION SELECT(newj->>'student_group_id')::uuid
  UNION SELECT(oldj->>'group_id')::uuid UNION SELECT(newj->>'group_id')::uuid)q WHERE x IS NOT NULL;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}')INTO orgs FROM(
  SELECT(v->>'organization_id')::uuid x FROM jsonb_array_elements(scopes)v UNION SELECT g.organization_id FROM public.student_groups g WHERE id=ANY(groups))q WHERE x IS NOT NULL;
 FOREACH a IN ARRAY accounts LOOP IF NOT pg_try_advisory_xact_lock(hashtextextended(a::text,42007))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
 FOREACH o IN ARRAY orgs LOOP IF NOT pg_try_advisory_xact_lock(hashtextextended(o::text,0))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
 FOREACH g IN ARRAY groups LOOP IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_program_roster:'||g::text,0))THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY x.group_id),'[]')INTO fresh FROM public.uc_group_education_source_scopes(TG_TABLE_NAME,oldj,newj)x;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}')INTO fresh_groups FROM(
  SELECT(v->>'group_id')::uuid x FROM jsonb_array_elements(fresh)v UNION SELECT m.group_id FROM public.student_group_memberships_effective m WHERE m.user_id=ANY(users)
  UNION SELECT(oldj->>'student_group_id')::uuid UNION SELECT(newj->>'student_group_id')::uuid UNION SELECT(oldj->>'group_id')::uuid UNION SELECT(newj->>'group_id')::uuid)q WHERE x IS NOT NULL;
 IF fresh IS DISTINCT FROM scopes OR fresh_groups IS DISTINCT FROM groups THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 -- All source locks/old guards keep their original behavior. A witness contains
 -- provenance, never permission to bypass a parent/child authority guard.
 IF oldj IS NOT NULL AND TG_TABLE_NAME IN('profiles','student_groups','courses','organizations')AND(TG_OP='DELETE'OR oldj->'id'IS DISTINCT FROM newj->'id'OR oldj->'organization_id'IS DISTINCT FROM newj->'organization_id')THEN
  parent:=coalesce(oldj->>'id',oldj->>'user_id');ctx:=jsonb_build_object('schema_version',1,'parent_table',TG_TABLE_NAME,'parent_id',parent,'old_tuple',oldj,'tuple_hash',public.uc_program_hash(oldj),'actor_id',auth.uid(),'origin',origin,'observed_at',clock_timestamp());
  -- Parent rows can contain old free text; retain only the exact source tuple.
  ctx:=jsonb_set(ctx,'{old_tuple}',jsonb_build_object('id',oldj->'id','user_id',oldj->'user_id','organization_id',oldj->'organization_id','group_id',oldj->'group_id','student_group_id',oldj->'student_group_id','course_id',oldj->'course_id'));
  IF octet_length(ctx::text)>4096 THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  INSERT INTO public.uc_group_education_requests(row_kind,backend_pid,full_transaction_id,action,request_id,context,subject_ids,actor_ids)VALUES('source_parent',pg_backend_pid(),pg_current_xact_id()::text,TG_TABLE_NAME,parent::uuid,ctx,CASE WHEN TG_TABLE_NAME='profiles'THEN users ELSE'{}'END,array_remove(ARRAY[auth.uid()],NULL))ON CONFLICT DO NOTHING;
 END IF;
 source:=CASE TG_TABLE_NAME WHEN'profiles'THEN CASE WHEN oldj IS NOT NULL AND newj IS NOT NULL AND(oldj->>'archived_at'IS NOT NULL)IS DISTINCT FROM(newj->>'archived_at'IS NOT NULL)THEN'profile_archive'ELSE'primary'END WHEN'student_group_memberships'THEN'additional'WHEN'enrollments'THEN'enrollment'WHEN'group_program_enrollment_snapshots'THEN'program_association'ELSE'group_lifecycle'END;
 IF EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind='public_operation'AND group_id=ANY(groups)AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id_if_assigned()::text)THEN RAISE EXCEPTION 'GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED' USING ERRCODE='25000';END IF;
 SELECT * INTO budget FROM public.uc_group_education_requests WHERE row_kind='source_transaction_budget'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text FOR UPDATE NOWAIT;
 IF budget.id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind IN('source_pending','source_detail','source_transaction_receipt','source_budget_admission')AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text)THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  PERFORM public.uc_group_education_compact_budget_tickets();
  INSERT INTO public.uc_group_education_requests(row_kind,backend_pid,full_transaction_id,context)VALUES('source_transaction_budget',pg_backend_pid(),pg_current_xact_id()::text,jsonb_build_object('schema_version',1,'admitted_detail_count',0,'ticket_checkpoint',0,'ticket_status','active'))RETURNING * INTO budget;
 END IF;
 UPDATE public.uc_group_education_requests SET context=context||jsonb_build_object('statement_depth',least(coalesce((context->>'statement_depth')::integer,pg_trigger_depth()),pg_trigger_depth()),'statement_constraint_seen',coalesce((context->>'statement_constraint_seen')::boolean,false))WHERE row_kind='source_transaction_budget'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text AND(context->>'statement_depth'IS NULL OR(context->>'statement_depth')::integer>pg_trigger_depth()OR context->>'statement_constraint_seen'IS NULL);
 IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_group_education_source_queue(p_org uuid,p_group uuid,p_users uuid[],p_source text,p_table text,p_old jsonb,p_new jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.uc_group_education_states;r public.uc_group_education_requests;p public.uc_group_education_requests;b public.uc_group_education_requests;q public.uc_group_education_requests;ctx jsonb;rc jsonb;contributors jsonb;fact jsonb;fact_index integer;u uuid;before_row jsonb;d jsonb;first_at timestamptz;last_complete bigint;reason text;gap jsonb;actor uuid:=auth.uid();origin text:=CASE auth.role()WHEN'authenticated'THEN'authenticated'WHEN'service_role'THEN'service'ELSE'system'END;counted integer;admitted integer;live integer;detail_bytes bigint;old_bytes integer;fields jsonb:='[]';k text;
BEGIN
 SELECT * INTO s FROM public.uc_group_education_states WHERE group_id=p_group AND organization_id=p_org FOR UPDATE NOWAIT;IF NOT FOUND THEN RETURN;END IF;
 IF EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind='public_operation'AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text)THEN RAISE EXCEPTION 'GROUP_FACTS_MIXED_TRANSACTION_UNSUPPORTED' USING ERRCODE='25000';END IF;
 SELECT * INTO r FROM public.uc_group_education_requests WHERE row_kind='source_transaction_receipt'AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text FOR UPDATE NOWAIT;
 IF r.id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind IN('source_pending','source_detail')AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text)THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  first_at:=clock_timestamp();last_complete:=coalesce((s.active_gap->>'last_complete_revision')::bigint,s.revision);
  rc:=jsonb_build_object('schema_version',1,'status','pending','first_observed_at',first_at,'initial_revision',s.revision,'last_complete_revision_before_tx',last_complete,'last_complete_segment_before_tx',s.coverage_segment_id,'source_observation_counter',0,'first_flushed_observation_counter',NULL,'first_flush_event_revision_range',NULL,'gap_id',s.active_gap->'id','last_actor_id',actor,'last_origin',origin,'group_admitted_detail_count',0);
  INSERT INTO public.uc_group_education_requests(row_kind,organization_id,group_id,course_id,backend_pid,full_transaction_id,context,actor_ids)VALUES('source_transaction_receipt',p_org,p_group,s.course_id,pg_backend_pid(),pg_current_xact_id()::text,rc,array_remove(ARRAY[actor],NULL))RETURNING * INTO r;
 ELSE rc:=r.context;first_at:=(rc->>'first_observed_at')::timestamptz;last_complete:=(rc->>'last_complete_revision_before_tx')::bigint;END IF;
 rc:=rc||jsonb_build_object('source_observation_counter',least(9007199254740991,(rc->>'source_observation_counter')::numeric+1),'last_actor_id',actor,'last_origin',origin);
 reason:=CASE WHEN s.active_gap IS NOT NULL THEN s.active_gap->>'reason'WHEN rc->'first_flushed_observation_counter'<>'null'THEN'history_detail_budget'WHEN p_table='group_program_bindings'THEN'source_changed'WHEN p_new IS NULL AND p_table IN('student_groups','courses','organizations')THEN'source_unavailable'WHEN p_table='student_groups'AND p_old IS NOT NULL AND(p_old->'id',p_old->'organization_id',p_old->'course_id')IS DISTINCT FROM(p_new->'id',p_new->'organization_id',p_new->'course_id')THEN'source_changed'END;
 IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=ANY(p_users))THEN reason:='source_unavailable';END IF;
 -- An existing malformed receipt must never reset an admission counter.
 IF coalesce(jsonb_typeof(rc->'group_admitted_detail_count')='number'AND rc->>'group_admitted_detail_count'~'^(0|[1-9][0-9]{0,3})$',false)THEN admitted:=(rc->>'group_admitted_detail_count')::integer;IF admitted>1000 THEN admitted:=NULL;END IF;END IF;
 IF admitted IS NULL THEN reason:=coalesce(reason,'history_detail_budget');END IF;
 SELECT * INTO p FROM public.uc_group_education_requests WHERE row_kind='source_pending'AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text FOR UPDATE NOWAIT;
 IF p.id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind='source_detail'AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text)THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  ctx:=jsonb_build_object('schema_version',1,'mode','detail','first_observed_at',first_at,'initial_revision',s.revision,'source_table_mask','[]'::jsonb,'contributors','[]'::jsonb,'legacy_fields','[]'::jsonb,'gap',NULL,'live_detail_count',0,'detail_map_serialized_bytes',2);
  -- A detail row always has both exact headers before it is inserted.
  INSERT INTO public.uc_group_education_requests(row_kind,organization_id,group_id,course_id,backend_pid,full_transaction_id,context,actor_ids)VALUES('source_pending',p_org,p_group,s.course_id,pg_backend_pid(),pg_current_xact_id()::text,ctx,array_remove(ARRAY[actor],NULL))RETURNING * INTO p;
 ELSE ctx:=p.context;END IF;
 IF p.organization_id IS DISTINCT FROM p_org OR p.course_id IS DISTINCT FROM s.course_id OR r.organization_id IS DISTINCT FROM p_org OR r.course_id IS DISTINCT FROM s.course_id THEN reason:=coalesce(reason,'source_changed');END IF;
 IF ctx->>'mode'='gap'THEN reason:=coalesce(reason,ctx->'gap'->>'reason','history_detail_budget');END IF;
 IF ctx?'details'OR coalesce(ctx->>'mode'NOT IN('detail','gap'),true)THEN reason:=coalesce(reason,'source_changed');END IF;
 IF coalesce(jsonb_typeof(ctx->'live_detail_count')='number'AND ctx->>'live_detail_count'~'^(0|[1-9][0-9]{0,3})$',false)AND coalesce(jsonb_typeof(ctx->'detail_map_serialized_bytes')='number'AND ctx->>'detail_map_serialized_bytes'~'^[0-9]{1,8}$',false)THEN live:=(ctx->>'live_detail_count')::integer;detail_bytes:=(ctx->>'detail_map_serialized_bytes')::bigint;IF live>1000 OR detail_bytes<2 OR detail_bytes>2097152 OR(live=0 AND detail_bytes<>2)THEN live:=NULL;END IF;END IF;
 IF live IS NULL THEN reason:=coalesce(reason,'source_changed');END IF;
 contributors:=coalesce(ctx->'contributors','[]');
 IF reason IS NULL THEN
  fact:=jsonb_build_object('actor_id',actor,'origin',origin,'authority',public.uc_group_education_authority(p_org,p_group,actor)-'observed_at');
  SELECT ordinal::integer-1 INTO fact_index FROM jsonb_array_elements(contributors)WITH ORDINALITY AS x(value,ordinal)WHERE value=fact LIMIT 1;
  IF fact_index IS NULL THEN IF jsonb_array_length(contributors)>=32 OR octet_length(fact::text)>8192 THEN reason:='history_detail_budget';ELSE fact_index:=jsonb_array_length(contributors);contributors:=contributors||jsonb_build_array(fact);END IF;END IF;
 END IF;
 SELECT * INTO b FROM public.uc_group_education_requests WHERE row_kind='source_transaction_budget'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text FOR UPDATE NOWAIT;
 IF b.id IS NULL THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
 counted:=public.uc_group_education_budget_counter(b.id);
 IF counted IS NULL THEN reason:=coalesce(reason,'history_detail_budget');END IF;
 IF reason IS NULL THEN
  FOR u IN SELECT DISTINCT x FROM unnest(p_users)x WHERE x IS NOT NULL ORDER BY x LOOP
   SELECT * INTO q FROM public.uc_group_education_requests WHERE row_kind='source_detail'AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text AND request_id=u FOR UPDATE NOWAIT;
   IF q.id IS NULL THEN
    IF admitted>=1000 OR counted>=10000 THEN reason:='history_detail_budget';EXIT;END IF;
    SELECT x INTO before_row FROM jsonb_array_elements(coalesce(s.source_rows,'[]'))x WHERE x->>'user_id'=u::text;
    d:=jsonb_build_object('first_before',before_row,'membership_source',NULL,'association_source',NULL,'last_contributor_index',NULL);old_bytes:=0;admitted:=admitted+1;counted:=counted+1;
    INSERT INTO public.uc_group_education_requests(row_kind,request_id,expected_revision,backend_pid,full_transaction_id,context)VALUES('source_budget_admission',b.id,counted,pg_backend_pid(),pg_current_xact_id()::text,jsonb_build_object('schema_version',1,'admitted_detail_count',counted,'previous_admitted_detail_count',counted-1));
   ELSE
    IF q.organization_id IS DISTINCT FROM p_org OR q.course_id IS DISTINCT FROM s.course_id THEN reason:='source_changed';EXIT;END IF;
    d:=q.context->'detail';old_bytes:=octet_length(d::text);
   END IF;
   IF p_source IN('primary','additional','profile_archive','registration','group_lifecycle')THEN d:=d||jsonb_build_object('membership_source',p_source);END IF;
   IF p_source IN('enrollment','program_association')THEN d:=d||jsonb_build_object('association_source',p_source);END IF;
   d:=d||jsonb_build_object('last_contributor_index',fact_index);
   IF q.id IS NULL THEN
    detail_bytes:=CASE WHEN live=0 THEN octet_length(d::text)+42 ELSE detail_bytes+octet_length(d::text)+42 END;live:=live+1;
    INSERT INTO public.uc_group_education_requests(row_kind,organization_id,group_id,course_id,request_id,backend_pid,full_transaction_id,context,subject_ids)VALUES('source_detail',p_org,p_group,s.course_id,u,pg_backend_pid(),pg_current_xact_id()::text,jsonb_build_object('schema_version',1,'subject_user_id',u,'detail',d),ARRAY[u]);
   ELSE
    detail_bytes:=detail_bytes+octet_length(d::text)-old_bytes;
    UPDATE public.uc_group_education_requests SET context=jsonb_build_object('schema_version',1,'subject_user_id',u,'detail',d)WHERE id=q.id AND context IS DISTINCT FROM jsonb_build_object('schema_version',1,'subject_user_id',u,'detail',d);
   END IF;
  END LOOP;
 END IF;
 IF admitted IS NOT NULL THEN rc:=rc||jsonb_build_object('group_admitted_detail_count',admitted);END IF;
 fields:=coalesce(ctx->'legacy_fields','[]');
 IF p_table='student_groups'AND p_old IS NOT NULL AND p_new IS NOT NULL THEN FOREACH k IN ARRAY ARRAY['start_date','end_date','training_dates','schedule_text','instructor_name']LOOP IF p_old->k IS DISTINCT FROM p_new->k AND NOT(fields? k) THEN fields:=fields||to_jsonb(k);END IF;END LOOP;END IF;
 ctx:=ctx||jsonb_build_object('contributors',contributors,'legacy_fields',fields,'live_detail_count',live,'detail_map_serialized_bytes',detail_bytes,'source_table_mask',(SELECT coalesce(jsonb_agg(x ORDER BY x),'[]')FROM(SELECT DISTINCT value x FROM jsonb_array_elements(coalesce(ctx->'source_table_mask','[]')||to_jsonb(p_table)))q));
 -- UUID object entry contributes38 key bytes+2 colon+2 delimiter; braces
 -- cancel the last delimiter. Account exact UTF8 jsonb bytes, not characters.
 IF reason IS NULL AND octet_length(((ctx-ARRAY['live_detail_count','detail_map_serialized_bytes'])||jsonb_build_object('details','{}'::jsonb))::text)-2+detail_bytes>2097152 THEN reason:='history_detail_budget';END IF;
 IF reason IS NOT NULL THEN
  DELETE FROM public.uc_group_education_requests WHERE row_kind='source_detail'AND group_id=p_group AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id()::text;
  gap:=public.uc_group_education_open_gap(p_org,p_group,first_at,last_complete,reason,actor,origin);ctx:=jsonb_build_object('schema_version',1,'mode','gap','first_observed_at',first_at,'initial_revision',rc->'initial_revision','source_table_mask',ctx->'source_table_mask','contributors','[]'::jsonb,'legacy_fields','[]'::jsonb,'gap',gap,'live_detail_count',0,'detail_map_serialized_bytes',2);rc:=rc||jsonb_build_object('status','gap','gap_id',gap->'id');
 END IF;
 UPDATE public.uc_group_education_requests SET context=rc,actor_ids=CASE WHEN reason IS NOT NULL THEN array_remove(ARRAY[actor],NULL)ELSE ARRAY(SELECT DISTINCT x FROM unnest(r.actor_ids||array_remove(ARRAY[actor],NULL))x ORDER BY x)END WHERE id=r.id;
 UPDATE public.uc_group_education_requests SET context=ctx,actor_ids=CASE WHEN reason IS NULL THEN ARRAY(SELECT DISTINCT x FROM unnest(p.actor_ids||array_remove(ARRAY[actor],NULL))x ORDER BY x)ELSE array_remove(ARRAY[actor],NULL)END WHERE id=p.id;
END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_group_education_source_statement_end()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE budget public.uc_group_education_requests;seen boolean;counted integer;ticket_n integer;ticket_lo bigint;ticket_hi bigint;BEGIN
 SELECT * INTO budget FROM public.uc_group_education_requests WHERE row_kind='source_transaction_budget'AND backend_pid=pg_backend_pid()AND full_transaction_id=pg_current_xact_id_if_assigned()::text;
 IF budget.id IS NULL OR(budget.context->>'statement_depth')::integer IS DISTINCT FROM pg_trigger_depth()THEN RETURN NULL;END IF;
 seen:=coalesce((budget.context->>'statement_constraint_seen')::boolean,false);
 counted:=public.uc_group_education_budget_counter(budget.id);
 IF counted IS NOT NULL THEN
  SELECT count(*)::integer,min(expected_revision),max(expected_revision)INTO ticket_n,ticket_lo,ticket_hi FROM public.uc_group_education_requests WHERE row_kind='source_budget_admission'AND backend_pid=budget.backend_pid AND full_transaction_id=budget.full_transaction_id;
  IF ticket_n<>counted OR(ticket_n>0 AND(ticket_lo<>1 OR ticket_hi<>counted))OR EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind='source_budget_admission'AND backend_pid=budget.backend_pid AND full_transaction_id=budget.full_transaction_id AND request_id<>budget.id)THEN PERFORM public.uc_group_education_error('SOURCE_CHANGED');END IF;
  budget.context:=budget.context||jsonb_build_object('admitted_detail_count',counted,'ticket_checkpoint',counted);
 END IF;
 UPDATE public.uc_group_education_requests SET context=budget.context-ARRAY['statement_depth','statement_constraint_seen']WHERE id=budget.id;
 -- The compact header plus exact small staged rows is current after each
 -- actual row. Materialize only the optional GIN mirror after trusted erasure.
 WITH mirrors AS MATERIALIZED(
  SELECT q.id,CASE WHEN q.context->>'mode'='detail'THEN ARRAY(SELECT d.request_id FROM public.uc_group_education_requests d WHERE d.row_kind='source_detail'AND d.group_id=q.group_id AND d.backend_pid=q.backend_pid AND d.full_transaction_id=q.full_transaction_id ORDER BY d.request_id)ELSE'{}'::uuid[]END ids
  FROM public.uc_group_education_requests q WHERE q.row_kind='source_pending'AND q.backend_pid=pg_backend_pid()AND q.full_transaction_id=pg_current_xact_id_if_assigned()::text
 )UPDATE public.uc_group_education_requests q SET subject_ids=m.ids FROM mirrors m WHERE q.id=m.id AND q.subject_ids IS DISTINCT FROM m.ids;
 IF seen THEN PERFORM public.uc_group_education_source_fold();END IF;
 IF budget.context->'admitted_detail_count'='0'::jsonb AND NOT EXISTS(SELECT 1 FROM public.uc_group_education_requests WHERE row_kind IN('source_pending','source_transaction_receipt')AND backend_pid=budget.backend_pid AND full_transaction_id=budget.full_transaction_id)THEN DELETE FROM public.uc_group_education_requests WHERE id=budget.id;END IF;
 RETURN NULL;
END;$fn$;
DO $postcheck$
DECLARE e jsonb;p record;name text;entry record;
BEGIN
 FOR name IN SELECT unnest(ARRAY['public.uc_group_education_budget_counter(uuid)','public.uc_group_education_budget_ticket_guard()','public.uc_group_education_compact_budget_tickets()']) LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||name||' FROM PUBLIC,anon,authenticated,service_role';
  FOR entry IN SELECT DISTINCT a.grantee FROM pg_proc catalog_proc CROSS JOIN LATERAL aclexplode(coalesce(catalog_proc.proacl,acldefault('f',catalog_proc.proowner)))a WHERE catalog_proc.oid=to_regprocedure(name)AND a.grantee<>catalog_proc.proowner AND a.grantee<>0 LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||name||' FROM '||quote_ident(pg_get_userbyid(entry.grantee));END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc catalog_proc CROSS JOIN LATERAL aclexplode(coalesce(catalog_proc.proacl,acldefault('f',catalog_proc.proowner)))a WHERE catalog_proc.oid=to_regprocedure(name)AND(a.grantee<>catalog_proc.proowner OR a.privilege_type<>'EXECUTE'OR a.is_grantable))THEN RAISE EXCEPTION 'UC116_COUNTER_HELPER_ACL';END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements('[{"signature":"apply_group_education_facts_action(uuid,uuid,bigint,uuid,jsonb)","source_md5":"ec03958d3f5b43a514463db033ab9b31","owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"read_group_education_facts(uuid,uuid,jsonb)","source_md5":"dbf79cf279ca303ae9e056769742630c","owner":"postgres","acl":"{postgres=X/postgres,authenticated=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_erase_group_education_facts(uuid)","source_md5":"de75c2c8f9ddbc21813adeea1201e7ba","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_actor_allowed(uuid,uuid,uuid,boolean)","source_md5":"62c5da19f9c58248124256ea099f8e47","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_actor_facts(uuid,uuid,uuid,boolean)","source_md5":"72a24ebbeb3a494b56a801124fbf3a16","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_append(uuid,uuid,uuid,text,timestamp with time zone,jsonb,text,uuid,uuid,uuid,uuid,uuid,jsonb,uuid,text)","source_md5":"5d4aac021381779315c954f20fdb4e18","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_authority(uuid,uuid,uuid)","source_md5":"89e6ec4177ca4c531dc969a3e5c4020e","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_calendar(uuid)","source_md5":"4d766dae48238de417c2aef722a76187","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_calendar_input(uuid,uuid,jsonb,jsonb)","source_md5":"e8e12a4c40207e987e83a7b9512110db","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_capabilities(uuid,uuid)","source_md5":"e2da06a9e9103906c6d7c7a164227d8d","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_correct(uuid,uuid,jsonb)","source_md5":"5f1b5a4d5c1763d3effaa4fa24611550","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_count(integer,boolean)","source_md5":"36a3d4568ce47aaa8bb18ff951ab39a1","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"i","security_definer":false,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog"]},{"signature":"uc_group_education_deletion_preview(uuid)","source_md5":"48edca794e19be509668261dc447f8b6","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_envelope(uuid,uuid)","source_md5":"2b0ff67c8ac78d02ea5b5ae9cef1298f","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_erasing(uuid)","source_md5":"81a21328e8de62518b5c68b8cb32a17f","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_error(text)","source_md5":"5153ec02ef631d3c226be3b66812e519","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":false,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog"]},{"signature":"uc_group_education_event(uuid)","source_md5":"a2115ea46778e4875c8493f92ce9d0b1","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_event_complete(uuid)","source_md5":"a42bdc040e1773d99477e9690da09aea","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_legacy(uuid)","source_md5":"869c76975cdb921e3c3c99b6ee4e18fb","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_lock(uuid,uuid,uuid[],uuid,boolean)","source_md5":"7f7cd0aab788190b9ef0fde161536c84","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_offset(text)","source_md5":"08ce55de85267cc5d6545fec8961c692","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"i","security_definer":false,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog"]},{"signature":"uc_group_education_open_gap(uuid,uuid,timestamp with time zone,bigint,text,uuid,text)","source_md5":"1ec4a3b525e1e351cfed80c5b2f0a663","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_own_source(uuid)","source_md5":"f6c394af9dfc99da43e0501ea360dd3a","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_parent_cleanup()","source_md5":"717b7b4e498e0f42d0d6490b4f0913c4","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_personal_counts(uuid)","source_md5":"6395243ad5482a4d1974511c7a39dcf0","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_prerequisite(text,text,uuid)","source_md5":"1da686220bdc6e5469f9f5acc4dfbada","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"i","security_definer":false,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog"]},{"signature":"uc_group_education_program(uuid,uuid)","source_md5":"3d6d8ca16131f45e23ad34af9b3fc6e7","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_program_proof(uuid,uuid,jsonb,uuid[])","source_md5":"47ed1d50de38735eeb4ac5a8a2e546da","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_public_row(jsonb)","source_md5":"d7c28917a73ba0e52a4e381933e86481","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"i","security_definer":false,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog"]},{"signature":"uc_group_education_redact(jsonb,uuid,boolean,boolean,uuid[],uuid[])","source_md5":"e42fe75761e618364994089be8c0dd24","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"i","security_definer":false,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_retained_program_valid(uuid,uuid,uuid,jsonb)","source_md5":"4a411f37397ab83f9847b6b8be998a4b","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_roster_context(uuid,uuid,jsonb,bigint,uuid,integer)","source_md5":"68f65a00a4c84bd1441073e676738171","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_scan(uuid,uuid,timestamp with time zone,uuid,jsonb,boolean,uuid[])","source_md5":"dce079cc75f6557ad07dd9e062701cda","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_scope(uuid,uuid,uuid)","source_md5":"621a258408215586c8d0adae5f25586d","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"i","security_definer":false,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog"]},{"signature":"uc_group_education_short_name(text)","source_md5":"4f992dd22e1234876da7b01c34b898a0","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"i","security_definer":false,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog"]},{"signature":"uc_group_education_snapshot_page(uuid,uuid,uuid,uuid,integer)","source_md5":"933c5ffe6082d3ca5d14ab493c0c854f","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_source_after()","source_md5":"eb6ad7d0bf32800d54305ff3e6ff2e9e","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_source_before()","source_md5":"b63f4a35129460c245ea89d055bf2f87","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_source_fold()","source_md5":"14d78c30099698e0c3478762661b6b32","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_source_observe()","source_md5":"3fc73a3cfc187d86f8ef1bc33c666e4c","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_source_queue(uuid,uuid,uuid[],text,text,jsonb,jsonb)","source_md5":"003f8c7c8c5c084dbf71ecdea9b7fcc3","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_source_relevant(text,jsonb,jsonb)","source_md5":"ac03f36acb5b116a6e4663d78564d1f3","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"i","security_definer":false,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog"]},{"signature":"uc_group_education_source_scopes(text,jsonb,jsonb)","source_md5":"0ff6f74920c70feccdb90bd88f33ba69","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_source_statement_end()","source_md5":"1af8268d922d27769c53e9e5e2c62473","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_source_truncate()","source_md5":"618e2fc39497415aa1f6f1d12b1bf9b0","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":false,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog"]},{"signature":"uc_group_education_teacher_allowed(uuid,uuid,uuid)","source_md5":"519ddf3c05c1656cead3cd00312c2ca0","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]},{"signature":"uc_group_education_valid_zone(text)","source_md5":"696d43468f9ed334b640833f2483e310","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"s","security_definer":false,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog"]},{"signature":"uc_group_education_validate_artifact(jsonb)","source_md5":"88961556ea23c95ea25b1fd1ca838cf9","owner":"postgres","acl":"{postgres=X/postgres}","volatility":"v","security_definer":true,"strict":false,"parallel":"u","configuration":["search_path=pg_catalog, public"]}]'::jsonb) LOOP
  SELECT md5(x.prosrc) AS metadata_source_md5,pg_get_userbyid(x.proowner) AS metadata_owner,x.proacl::text AS metadata_acl,x.provolatile::text AS metadata_volatility,x.prosecdef AS metadata_security_definer,x.proisstrict AS metadata_strict,x.proparallel::text AS metadata_parallel,to_jsonb(x.proconfig) AS metadata_configuration INTO p FROM pg_proc x WHERE x.oid=to_regprocedure('public.'||(e->>'signature'));
  IF p.metadata_owner IS DISTINCT FROM e->>'owner'OR p.metadata_acl IS DISTINCT FROM e->>'acl'OR p.metadata_volatility IS DISTINCT FROM e->>'volatility'OR to_jsonb(p.metadata_security_definer)IS DISTINCT FROM e->'security_definer'OR to_jsonb(p.metadata_strict)IS DISTINCT FROM e->'strict'OR p.metadata_parallel IS DISTINCT FROM e->>'parallel'OR p.metadata_configuration IS DISTINCT FROM nullif(e->'configuration','null'::jsonb) THEN RAISE EXCEPTION 'UC116_COUNTER_OLD48_METADATA:%',e->>'signature';END IF;
  IF p.metadata_source_md5 IS DISTINCT FROM coalesce(('{"uc_group_education_source_before()":"9ce34b1849aa41806643c00cf9f8e1bc","uc_group_education_source_queue(uuid,uuid,uuid[],text,text,jsonb,jsonb)":"196e09acbef6739c8585643f4be043ab","uc_group_education_source_statement_end()":"a866131afdfb2b8d5f2b3fd40d521a26"}'::jsonb)->>(e->>'signature'),e->>'source_md5')THEN RAISE EXCEPTION 'UC116_COUNTER_EXACT_BODY:%',e->>'signature';END IF;
 END LOOP;
 IF (SELECT coalesce(jsonb_agg((catalog_proc.proname||'('||replace(oidvectortypes(catalog_proc.proargtypes),', ',',')||')')ORDER BY catalog_proc.proname||'('||replace(oidvectortypes(catalog_proc.proargtypes),', ',',')||')'),'[]'::jsonb)FROM pg_proc catalog_proc JOIN pg_namespace n ON n.oid=catalog_proc.pronamespace WHERE n.nspname='public'AND catalog_proc.proname=ANY(ARRAY['apply_group_education_facts_action','read_group_education_facts','uc_erase_group_education_facts','uc_group_education_actor_allowed','uc_group_education_actor_facts','uc_group_education_append','uc_group_education_authority','uc_group_education_budget_counter','uc_group_education_budget_ticket_guard','uc_group_education_calendar','uc_group_education_calendar_input','uc_group_education_capabilities','uc_group_education_compact_budget_tickets','uc_group_education_correct','uc_group_education_count','uc_group_education_deletion_preview','uc_group_education_envelope','uc_group_education_erasing','uc_group_education_error','uc_group_education_event','uc_group_education_event_complete','uc_group_education_legacy','uc_group_education_lock','uc_group_education_offset','uc_group_education_open_gap','uc_group_education_own_source','uc_group_education_parent_cleanup','uc_group_education_personal_counts','uc_group_education_prerequisite','uc_group_education_program','uc_group_education_program_proof','uc_group_education_public_row','uc_group_education_redact','uc_group_education_retained_program_valid','uc_group_education_roster_context','uc_group_education_scan','uc_group_education_scope','uc_group_education_short_name','uc_group_education_snapshot_page','uc_group_education_source_after','uc_group_education_source_before','uc_group_education_source_fold','uc_group_education_source_observe','uc_group_education_source_queue','uc_group_education_source_relevant','uc_group_education_source_scopes','uc_group_education_source_statement_end','uc_group_education_source_truncate','uc_group_education_teacher_allowed','uc_group_education_valid_zone','uc_group_education_validate_artifact']))IS DISTINCT FROM '["apply_group_education_facts_action(uuid,uuid,bigint,uuid,jsonb)","read_group_education_facts(uuid,uuid,jsonb)","uc_erase_group_education_facts(uuid)","uc_group_education_actor_allowed(uuid,uuid,uuid,boolean)","uc_group_education_actor_facts(uuid,uuid,uuid,boolean)","uc_group_education_append(uuid,uuid,uuid,text,timestamp with time zone,jsonb,text,uuid,uuid,uuid,uuid,uuid,jsonb,uuid,text)","uc_group_education_authority(uuid,uuid,uuid)","uc_group_education_budget_counter(uuid)","uc_group_education_budget_ticket_guard()","uc_group_education_calendar(uuid)","uc_group_education_calendar_input(uuid,uuid,jsonb,jsonb)","uc_group_education_capabilities(uuid,uuid)","uc_group_education_compact_budget_tickets()","uc_group_education_correct(uuid,uuid,jsonb)","uc_group_education_count(integer,boolean)","uc_group_education_deletion_preview(uuid)","uc_group_education_envelope(uuid,uuid)","uc_group_education_erasing(uuid)","uc_group_education_error(text)","uc_group_education_event(uuid)","uc_group_education_event_complete(uuid)","uc_group_education_legacy(uuid)","uc_group_education_lock(uuid,uuid,uuid[],uuid,boolean)","uc_group_education_offset(text)","uc_group_education_open_gap(uuid,uuid,timestamp with time zone,bigint,text,uuid,text)","uc_group_education_own_source(uuid)","uc_group_education_parent_cleanup()","uc_group_education_personal_counts(uuid)","uc_group_education_prerequisite(text,text,uuid)","uc_group_education_program(uuid,uuid)","uc_group_education_program_proof(uuid,uuid,jsonb,uuid[])","uc_group_education_public_row(jsonb)","uc_group_education_redact(jsonb,uuid,boolean,boolean,uuid[],uuid[])","uc_group_education_retained_program_valid(uuid,uuid,uuid,jsonb)","uc_group_education_roster_context(uuid,uuid,jsonb,bigint,uuid,integer)","uc_group_education_scan(uuid,uuid,timestamp with time zone,uuid,jsonb,boolean,uuid[])","uc_group_education_scope(uuid,uuid,uuid)","uc_group_education_short_name(text)","uc_group_education_snapshot_page(uuid,uuid,uuid,uuid,integer)","uc_group_education_source_after()","uc_group_education_source_before()","uc_group_education_source_fold()","uc_group_education_source_observe()","uc_group_education_source_queue(uuid,uuid,uuid[],text,text,jsonb,jsonb)","uc_group_education_source_relevant(text,jsonb,jsonb)","uc_group_education_source_scopes(text,jsonb,jsonb)","uc_group_education_source_statement_end()","uc_group_education_source_truncate()","uc_group_education_teacher_allowed(uuid,uuid,uuid)","uc_group_education_valid_zone(text)","uc_group_education_validate_artifact(jsonb)"]'::jsonb THEN RAISE EXCEPTION 'UC116_COUNTER_EXACT_IDENTITY_SET51';END IF;
 -- All48 actual baseline identities + the3 explicit helpers, including every
 -- overload of those names. No prefix-count arithmetic or missing erasure RPC.
END;$postcheck$;
COMMIT;
