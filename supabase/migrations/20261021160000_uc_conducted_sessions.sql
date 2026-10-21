-- UC017: source-only candidate. Never derive attendance from lesson_progress.
-- This migration depends on the reviewed UC013/014/015 closure. The privacy
-- integration block intentionally refuses unknown predecessor definitions.
CREATE TABLE public.uc_conducted_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,
 group_id uuid NOT NULL,course_id uuid NOT NULL,lesson_id uuid NOT NULL,
 calendar_version_id uuid NOT NULL,calendar_hash text NOT NULL,
 roster_snapshot_id uuid NOT NULL,roster_hash text NOT NULL,source_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(group_id,lesson_id)
);
CREATE TABLE public.uc_conducted_session_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL,
 organization_id uuid NOT NULL,group_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,academic_hours numeric(12,2) NOT NULL CHECK(academic_hours>0 AND academic_hours<=10000),
 teacher_user_id uuid,attendance jsonb NOT NULL CHECK(jsonb_typeof(attendance)='array' AND jsonb_array_length(attendance)<=1000),
 reason text NOT NULL,actor_id uuid,authority_snapshot jsonb NOT NULL,
 source_proof jsonb NOT NULL,content_hash text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 supersedes_id uuid,participant_ids uuid[] NOT NULL,redacted boolean NOT NULL DEFAULT false,
 UNIQUE(session_id,revision),CHECK(ends_at>starts_at)
);
CREATE INDEX uc_conducted_versions_scope ON public.uc_conducted_session_versions(organization_id,group_id,session_id,revision DESC);
CREATE INDEX uc_conducted_versions_people ON public.uc_conducted_session_versions USING gin(participant_ids);
CREATE TABLE public.uc_session_document_drafts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,group_id uuid NOT NULL,
 session_id uuid NOT NULL,session_version_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('journal','protocol','education_document')),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),supersedes_id uuid,
 source_proof jsonb NOT NULL,content_hash text NOT NULL,actor_id uuid,reason text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),participant_ids uuid[] NOT NULL,redacted boolean NOT NULL DEFAULT false,
 UNIQUE(session_id,kind,revision)
);
CREATE INDEX uc_session_drafts_people ON public.uc_session_document_drafts USING gin(participant_ids);
CREATE TABLE public.uc_conducted_session_requests(
 actor_id uuid NOT NULL,request_id uuid NOT NULL,organization_id uuid NOT NULL,group_id uuid NOT NULL,
 input_hash text NOT NULL,receipt jsonb NOT NULL,participant_ids uuid[] NOT NULL,
 PRIMARY KEY(actor_id,request_id)
);
-- Remove even inherited/default custom grants on only these newly created tables.
DO $acl$ DECLARE t text;g record;BEGIN
 FOREACH t IN ARRAY ARRAY['uc_conducted_sessions','uc_conducted_session_versions','uc_session_document_drafts','uc_conducted_session_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  FOR g IN SELECT DISTINCT a.grantee,c.relowner FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.oid=to_regclass('public.'||t) AND a.grantee<>c.relowner LOOP
   EXECUTE format('REVOKE ALL ON public.%I FROM %s CASCADE',t,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
 END LOOP;
END;$acl$;

CREATE FUNCTION public.uc_session_error(p_code text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'UC_SESSION_%',p_code USING ERRCODE=CASE WHEN p_code='ACCESS_DENIED' THEN '42501' ELSE 'P0001' END;END;$fn$;

CREATE FUNCTION public.uc_session_access(p_org uuid,p_group uuid,p_write boolean) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE course uuid;BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL OR NOT public.uc_group_education_actor_allowed(auth.uid(),p_org,p_group,p_write) THEN PERFORM public.uc_session_error('ACCESS_DENIED');END IF;
 IF public.uc_group_education_own_source(p_group) THEN PERFORM public.uc_session_error('SOURCE_UNAVAILABLE');END IF;
 SELECT g.course_id INTO course FROM public.student_groups g JOIN public.courses c ON c.id=g.course_id AND c.organization_id=p_org WHERE g.id=p_group AND g.organization_id=p_org;
 IF course IS NULL THEN PERFORM public.uc_session_error('SOURCE_UNAVAILABLE');END IF;RETURN course;
END;$fn$;

CREATE FUNCTION public.uc_session_source(p_org uuid,p_group uuid,p_calendar uuid,p_lesson uuid,p_snapshot uuid,p_hash text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_group_calendar_versions;s public.uc_group_roster_snapshots;l jsonb;r jsonb;course uuid;BEGIN
 course:=public.uc_session_access(p_org,p_group,false);
 SELECT * INTO c FROM public.uc_group_calendar_versions WHERE id=p_calendar AND organization_id=p_org AND group_id=p_group AND course_id=course;
 SELECT * INTO s FROM public.uc_group_roster_snapshots WHERE id=p_snapshot AND organization_id=p_org AND group_id=p_group AND course_id=course;
 IF c.id IS NULL OR s.id IS NULL OR c.redacted OR s.redacted OR c.published_at IS NULL OR c.content_hash IS DISTINCT FROM p_hash
  OR s.calendar_version_id<>c.id OR s.calendar_hash<>c.content_hash OR s.purpose<>'lesson_roster' OR s.program_ref IS DISTINCT FROM c.program_ref
  OR public.uc_program_hash(c.content)<>c.content_hash OR public.uc_program_hash(s.roster_rows)<>s.roster_hash OR s.source_input IS NULL OR public.uc_program_hash(s.source_input)<>s.source_hash
  OR NOT public.uc_group_education_retained_program_valid(p_org,p_group,course,s.program_proof) THEN PERFORM public.uc_session_error('SOURCE_UNAVAILABLE');END IF;
 SELECT x INTO l FROM jsonb_array_elements(c.lessons)x WHERE x->>'lesson_id'=p_lesson::text;
 IF l IS NULL OR l->>'status'<>'planned' OR l->>'teacher_user_id' IS NULL OR l->>'academic_hours' IS NULL
  OR l->>'teacher_label_state'<>'available' OR NOT public.uc_group_education_teacher_allowed((l->>'teacher_user_id')::uuid,p_org,p_group) THEN PERFORM public.uc_session_error('SOURCE_UNAVAILABLE');END IF;
 IF s.row_count=0 OR s.row_count<>jsonb_array_length(s.roster_rows) THEN PERFORM public.uc_session_error('PREREQUISITE_MISSING');END IF;
 FOR r IN SELECT x FROM jsonb_array_elements(s.roster_rows)x LOOP
  IF r->>'association'<>'confirmed' OR r->>'label_state'<>'available' OR NOT public.uc_learning_person((r->>'user_id')::uuid)
   OR NOT EXISTS(SELECT 1 FROM public.group_program_enrollment_snapshots sn WHERE sn.id=(r->>'program_enrollment_snapshot_id')::uuid AND sn.organization_id=p_org AND sn.group_id=p_group AND sn.course_id=course AND sn.user_id=(r->>'user_id')::uuid AND sn.enrollment_id=(r->>'enrollment_id')::uuid AND sn.binding_id=(s.program_ref->>'binding_id')::uuid AND sn.binding_revision=(s.program_ref->>'binding_revision')::bigint AND sn.version_id=(s.program_ref->>'version_id')::uuid AND sn.snapshot_hash=s.program_ref->>'binding_snapshot_hash') THEN PERFORM public.uc_session_error('SOURCE_UNAVAILABLE');END IF;
 END LOOP;
 RETURN jsonb_build_object('schema_version',1,'scope',public.uc_group_education_scope(p_org,p_group,course),
  'calendar_version_id',c.id,'calendar_hash',c.content_hash,'lesson',l,'timezone',c.timezone,
  'snapshot_id',s.id,'snapshot_as_of',s.as_of,'knowledge_revision',s.knowledge_revision,'coverage_segment_id',s.coverage_segment_id,
  'roster_hash',s.roster_hash,'source_hash',s.source_hash,'program_ref',s.program_ref,'program_proof',s.program_proof,'roster_rows',s.roster_rows);
END;$fn$;

CREATE FUNCTION public.uc_session_outcomes(p_org uuid,p_group uuid,p_rows jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r jsonb;sc jsonb;result jsonb:='[]';outcome jsonb;BEGIN
 PERFORM public.uc_session_access(p_org,p_group,false);
 IF jsonb_array_length(p_rows)>100 THEN PERFORM public.uc_session_error('LIMIT_EXCEEDED');END IF;
 FOR r IN SELECT x FROM jsonb_array_elements(p_rows)x ORDER BY x->>'user_id' LOOP
  sc:=public.uc_learning_scope((r->>'program_enrollment_snapshot_id')::uuid);outcome:=NULL;
  IF sc->>'organization_id'=p_org::text AND sc->>'group_id'=p_group::text AND sc->>'user_id'=r->>'user_id' AND sc->>'enrollment_id'=r->>'enrollment_id' AND public.uc_learning_scope_valid(p_org,sc) THEN
   -- UC014 rechecks its own staff and exact learner scope. No machine decisions are written here.
   outcome:=public.uc_learning_envelope(p_org,sc);
  END IF;
  result:=result||jsonb_build_array(jsonb_build_object('user_id',r->'user_id','enrollment_id',r->'enrollment_id','program_enrollment_snapshot_id',r->'program_enrollment_snapshot_id','outcome',outcome));
 END LOOP;RETURN result;
END;$fn$;

CREATE FUNCTION public.uc_session_version(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',v.id,'session_id',v.session_id,'revision',v.revision,'starts_at',v.starts_at,'ends_at',v.ends_at,'academic_hours',v.academic_hours::text,'teacher_user_id',v.teacher_user_id,
 'attendance',v.attendance,'reason',v.reason,'actor_id',v.actor_id,'source_proof',v.source_proof,'content_hash',v.content_hash,'recorded_at',v.recorded_at,'supersedes_id',v.supersedes_id,'redacted',v.redacted)
 FROM public.uc_conducted_session_versions v WHERE v.id=p_id
$fn$;

CREATE FUNCTION public.read_conducted_sessions(p_organization_id uuid,p_group_id uuid,p_query jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE course uuid;s public.uc_conducted_sessions;v public.uc_conducted_session_versions;d public.uc_session_document_drafts;rows jsonb:='[]';item jsonb;proof jsonb;fresh boolean;after_id uuid;lim integer;BEGIN
 course:=public.uc_session_access(p_organization_id,p_group_id,false);
 IF public.uc_learning_shape(p_query,ARRAY['kind','after_id','limit']) AND p_query->>'kind'='list' THEN
  IF p_query->'after_id'<>'null' AND NOT public.uc_learning_uuid(p_query->'after_id') OR jsonb_typeof(p_query->'limit')<>'number' OR (p_query->>'limit')!~'^[0-9]+$' THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
  after_id:=(p_query->>'after_id')::uuid;lim:=(p_query->>'limit')::integer;IF lim NOT BETWEEN 1 AND 50 THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
  FOR s IN SELECT * FROM public.uc_conducted_sessions WHERE organization_id=p_organization_id AND group_id=p_group_id AND course_id=course AND(after_id IS NULL OR id>after_id) ORDER BY id LIMIT lim+1 LOOP
   IF jsonb_array_length(rows)=lim THEN RETURN jsonb_build_object('schema_version',1,'scope',public.uc_group_education_scope(p_organization_id,p_group_id,course),'sessions',rows,'next_after_id',rows->-1->>'id');END IF;
   SELECT * INTO v FROM public.uc_conducted_session_versions WHERE session_id=s.id ORDER BY revision DESC LIMIT 1;
   rows:=rows||jsonb_build_array(jsonb_build_object('id',s.id,'lesson_id',s.lesson_id,'calendar_version_id',s.calendar_version_id,'calendar_hash',s.calendar_hash,'snapshot_id',s.roster_snapshot_id,'revision',v.revision,'starts_at',v.starts_at,'ends_at',v.ends_at,'content_hash',v.content_hash,'redacted',v.redacted));
  END LOOP;RETURN jsonb_build_object('schema_version',1,'scope',public.uc_group_education_scope(p_organization_id,p_group_id,course),'sessions',rows,'next_after_id',NULL);
 ELSIF public.uc_learning_shape(p_query,ARRAY['kind','session_id','revision','after_user_id','limit']) AND p_query->>'kind'='session' THEN
  IF NOT public.uc_learning_uuid(p_query->'session_id') OR p_query->'revision'<>'null' AND (jsonb_typeof(p_query->'revision')<>'number' OR (p_query->>'revision')!~'^[1-9][0-9]*$') OR p_query->'after_user_id'<>'null' AND NOT public.uc_learning_uuid(p_query->'after_user_id') OR (p_query->>'limit')!~'^[0-9]+$' THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
  lim:=(p_query->>'limit')::integer;IF lim NOT BETWEEN 1 AND 50 THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
  SELECT * INTO s FROM public.uc_conducted_sessions WHERE id=(p_query->>'session_id')::uuid AND organization_id=p_organization_id AND group_id=p_group_id AND course_id=course;
  IF s.id IS NULL THEN PERFORM public.uc_session_error('NOT_FOUND');END IF;
  SELECT * INTO v FROM public.uc_conducted_session_versions WHERE session_id=s.id AND(p_query->'revision'='null' OR revision=(p_query->>'revision')::bigint) ORDER BY revision DESC LIMIT 1;
  IF v.id IS NULL THEN PERFORM public.uc_session_error('NOT_FOUND');END IF;
  fresh:=NOT v.redacted AND NOT EXISTS(SELECT 1 FROM public.uc_conducted_session_versions WHERE session_id=s.id AND revision>v.revision);
  IF fresh THEN BEGIN proof:=public.uc_session_source(p_organization_id,p_group_id,s.calendar_version_id,s.lesson_id,s.roster_snapshot_id,s.calendar_hash);fresh:=proof=v.source_proof;EXCEPTION WHEN SQLSTATE 'P0001' THEN fresh:=false;END;END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'user_id'),'[]') INTO rows FROM(SELECT x FROM jsonb_array_elements(v.attendance)x WHERE x->>'user_id' IS NOT NULL AND(p_query->'after_user_id'='null' OR (x->>'user_id')::uuid>(p_query->>'after_user_id')::uuid) ORDER BY x->>'user_id' LIMIT lim+1) q;
  after_id:=CASE WHEN jsonb_array_length(rows)>lim THEN (rows->(lim-1)->>'user_id')::uuid END;
  IF after_id IS NOT NULL THEN rows:=rows-(jsonb_array_length(rows)-1);END IF;
  item:=public.uc_session_version(v.id);item:=item||jsonb_build_object('attendance',rows);
  RETURN jsonb_build_object('schema_version',1,'scope',public.uc_group_education_scope(p_organization_id,p_group_id,course),'session',jsonb_build_object('id',s.id,'calendar_version_id',s.calendar_version_id,'calendar_hash',s.calendar_hash,'lesson_id',s.lesson_id,'snapshot_id',s.roster_snapshot_id),'version',item,'source_current',fresh,'outcomes',CASE WHEN fresh THEN public.uc_session_outcomes(p_organization_id,p_group_id,rows) ELSE '[]'::jsonb END,'next_after_user_id',after_id,'can_write',public.uc_group_education_actor_allowed(auth.uid(),p_organization_id,p_group_id,true),
   'draft_heads',coalesce((SELECT jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'revision',q.revision,'content_hash',q.content_hash,'redacted',q.redacted) ORDER BY q.kind) FROM(SELECT DISTINCT ON(kind) id,kind,revision,content_hash,redacted FROM public.uc_session_document_drafts WHERE session_id=s.id AND organization_id=p_organization_id AND group_id=p_group_id ORDER BY kind,revision DESC)q),'[]'::jsonb));
 ELSIF public.uc_learning_shape(p_query,ARRAY['kind','draft_id']) AND p_query->>'kind'='draft' AND public.uc_learning_uuid(p_query->'draft_id') THEN
  SELECT * INTO d FROM public.uc_session_document_drafts WHERE id=(p_query->>'draft_id')::uuid AND organization_id=p_organization_id AND group_id=p_group_id;
  IF d.id IS NULL THEN PERFORM public.uc_session_error('NOT_FOUND');END IF;
  SELECT * INTO v FROM public.uc_conducted_session_versions WHERE id=d.session_version_id;
  SELECT * INTO s FROM public.uc_conducted_sessions WHERE id=d.session_id AND course_id=course;
  fresh:=NOT d.redacted AND NOT v.redacted AND s.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.uc_conducted_session_versions WHERE session_id=s.id AND revision>v.revision);
  IF fresh THEN BEGIN
   proof:=public.uc_session_source(p_organization_id,p_group_id,s.calendar_version_id,s.lesson_id,s.roster_snapshot_id,s.calendar_hash);
   fresh:=proof=v.source_proof AND public.uc_session_outcomes(p_organization_id,p_group_id,d.source_proof->'attendance')=d.source_proof->'outcomes';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN fresh:=false;END;END IF;
  RETURN jsonb_build_object('schema_version',1,'scope',public.uc_group_education_scope(p_organization_id,p_group_id,course),'draft',jsonb_build_object('id',d.id,'session_id',d.session_id,'kind',d.kind,'revision',d.revision,'supersedes_id',d.supersedes_id,'source_proof',CASE WHEN fresh THEN d.source_proof ELSE NULL END,'content_hash',d.content_hash,'recorded_at',d.recorded_at,'actor_id',d.actor_id,'source_current',fresh,'redacted',d.redacted,'officially_issued',false));
 ELSE PERFORM public.uc_session_error('INVALID_INPUT');END IF;
END;$fn$;

CREATE FUNCTION public.apply_conducted_session_action(p_organization_id uuid,p_group_id uuid,p_expected_revision bigint,p_request_id uuid,p_action jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE course uuid;actor uuid:=auth.uid();s public.uc_conducted_sessions;v public.uc_conducted_session_versions;old public.uc_conducted_session_versions;d public.uc_session_document_drafts;previous public.uc_session_document_drafts;req public.uc_conducted_session_requests;proof jsonb;rows jsonb;attendance jsonb:='[]';r jsonb;input jsonb;outcomes jsonb;source jsonb;receipt jsonb;ids uuid[];starts timestamptz;ends timestamptz;hours numeric;teacher uuid;hash text;new_id uuid:=gen_random_uuid();kind text;rev bigint;BEGIN
 course:=public.uc_session_access(p_organization_id,p_group_id,true);
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990 OR public.uc_learning_text(p_action->'reason',2000) IS DISTINCT FROM true THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
 IF octet_length(p_action::text)>524288 THEN PERFORM public.uc_session_error('LIMIT_EXCEEDED');END IF;
 kind:=p_action->>'action';
 IF kind='confirm_session' THEN
  IF NOT public.uc_learning_shape(p_action,ARRAY['action','calendar_version_id','calendar_hash','lesson_id','snapshot_id','starts_at','ends_at','academic_hours','teacher_user_id','attendance','reason','human_attested']) OR p_action->'human_attested' IS DISTINCT FROM 'true'::jsonb THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
  IF NOT public.uc_learning_uuid(p_action->'calendar_version_id') OR NOT public.uc_learning_uuid(p_action->'lesson_id') OR NOT public.uc_learning_uuid(p_action->'snapshot_id') OR NOT public.uc_learning_uuid(p_action->'teacher_user_id') OR p_action->>'calendar_hash'!~'^[a-f0-9]{64}$' THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
  proof:=public.uc_session_source(p_organization_id,p_group_id,(p_action->>'calendar_version_id')::uuid,(p_action->>'lesson_id')::uuid,(p_action->>'snapshot_id')::uuid,p_action->>'calendar_hash');
 ELSIF kind IN('correct_attendance','create_draft') THEN
  IF NOT public.uc_learning_uuid(p_action->'session_id') THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
  SELECT * INTO s FROM public.uc_conducted_sessions WHERE id=(p_action->>'session_id')::uuid AND organization_id=p_organization_id AND group_id=p_group_id AND course_id=course;
  IF s.id IS NULL THEN PERFORM public.uc_session_error('NOT_FOUND');END IF;
  proof:=public.uc_session_source(p_organization_id,p_group_id,s.calendar_version_id,s.lesson_id,s.roster_snapshot_id,s.calendar_hash);
 ELSE PERFORM public.uc_session_error('INVALID_INPUT');END IF;
 SELECT array_agg(DISTINCT x ORDER BY x) INTO ids FROM(SELECT (r->>'user_id')::uuid x FROM jsonb_array_elements(proof->'roster_rows')r UNION SELECT (proof->'lesson'->>'teacher_user_id')::uuid UNION SELECT actor)people;
 PERFORM public.uc_group_education_lock(p_organization_id,p_group_id,ids,p_request_id,false);
 course:=public.uc_session_access(p_organization_id,p_group_id,true);
 -- Recheck after locking; membership, privacy and actor locks precede this ledger lock.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_session:'||p_group_id::text,0)) THEN PERFORM public.uc_session_error('SOURCE_CHANGED');END IF;
 IF proof IS DISTINCT FROM public.uc_session_source(p_organization_id,p_group_id,(proof->>'calendar_version_id')::uuid,(proof->'lesson'->>'lesson_id')::uuid,(proof->>'snapshot_id')::uuid,proof->>'calendar_hash') THEN PERFORM public.uc_session_error('SOURCE_CHANGED');END IF;
 hash:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'group_id',p_group_id,'expected_revision',p_expected_revision,'action',p_action));
 SELECT * INTO req FROM public.uc_conducted_session_requests WHERE actor_id=actor AND request_id=p_request_id;
 IF req.request_id IS NOT NULL THEN IF req.organization_id<>p_organization_id OR req.group_id<>p_group_id OR req.input_hash<>hash THEN PERFORM public.uc_session_error('REQUEST_CONFLICT');END IF;RETURN jsonb_build_object('schema_version',1,'receipt',req.receipt||jsonb_build_object('replayed',true));END IF;
 IF kind='confirm_session' THEN
  IF p_expected_revision<>0 OR EXISTS(SELECT 1 FROM public.uc_conducted_sessions WHERE group_id=p_group_id AND lesson_id=(p_action->>'lesson_id')::uuid) THEN PERFORM public.uc_session_error('REVISION_CONFLICT');END IF;
  IF NOT EXISTS(SELECT 1 FROM public.uc_group_education_states WHERE organization_id=p_organization_id AND group_id=p_group_id AND published_calendar_id=(proof->>'calendar_version_id')::uuid) THEN PERFORM public.uc_session_error('SOURCE_CHANGED');END IF;
  IF jsonb_typeof(p_action->'starts_at')<>'string' OR jsonb_typeof(p_action->'ends_at')<>'string' OR p_action->>'starts_at'!~'(Z|[+-][0-9]{2}:[0-9]{2})$' OR p_action->>'ends_at'!~'(Z|[+-][0-9]{2}:[0-9]{2})$' OR jsonb_typeof(p_action->'academic_hours')<>'string' OR p_action->>'academic_hours'!~'^[0-9]+([.][0-9]{1,2})?$' THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
  BEGIN starts:=(p_action->>'starts_at')::timestamptz;ends:=(p_action->>'ends_at')::timestamptz;hours:=(p_action->>'academic_hours')::numeric;EXCEPTION WHEN data_exception THEN PERFORM public.uc_session_error('INVALID_INPUT');END;
  teacher:=(p_action->>'teacher_user_id')::uuid;
  IF NOT isfinite(starts) OR NOT isfinite(ends) OR starts>=ends OR ends>clock_timestamp() OR ends-starts>interval '24 hours' OR starts IS DISTINCT FROM (proof->>'snapshot_as_of')::timestamptz OR hours<=0 OR hours>10000 OR teacher::text IS DISTINCT FROM proof->'lesson'->>'teacher_user_id' THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
  INSERT INTO public.uc_conducted_sessions(organization_id,group_id,course_id,lesson_id,calendar_version_id,calendar_hash,roster_snapshot_id,roster_hash,source_hash) VALUES(p_organization_id,p_group_id,course,(p_action->>'lesson_id')::uuid,(proof->>'calendar_version_id')::uuid,proof->>'calendar_hash',(proof->>'snapshot_id')::uuid,proof->>'roster_hash',proof->>'source_hash') RETURNING * INTO s;
  rev:=1;rows:=p_action->'attendance';
 ELSE
  SELECT * INTO old FROM public.uc_conducted_session_versions WHERE session_id=s.id ORDER BY revision DESC LIMIT 1;
  IF old.revision IS DISTINCT FROM p_expected_revision OR old.redacted OR old.source_proof IS DISTINCT FROM proof OR p_action->>'expected_content_hash' IS DISTINCT FROM old.content_hash THEN PERFORM public.uc_session_error('REVISION_CONFLICT');END IF;
  starts:=old.starts_at;ends:=old.ends_at;hours:=old.academic_hours;teacher:=old.teacher_user_id;rev:=old.revision+1;
  IF kind='correct_attendance' THEN
   IF NOT public.uc_learning_shape(p_action,ARRAY['action','session_id','expected_content_hash','attendance','reason','human_attested']) OR p_action->'human_attested' IS DISTINCT FROM 'true'::jsonb THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;rows:=p_action->'attendance';
  ELSE
   IF NOT public.uc_learning_shape(p_action,ARRAY['action','session_id','expected_content_hash','kind','expected_draft_revision','student_ids','reason','human_review_required']) OR p_action->'human_review_required' IS DISTINCT FROM 'true'::jsonb OR coalesce(p_action->>'kind','') NOT IN('journal','protocol','education_document') OR public.uc_learning_ids(p_action->'student_ids',1,100) IS DISTINCT FROM true OR jsonb_typeof(p_action->'expected_draft_revision') IS DISTINCT FROM 'number' OR coalesce(p_action->>'expected_draft_revision','')!~'^[0-9]+$' THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
   SELECT coalesce(jsonb_agg(x ORDER BY x->>'user_id'),'[]') INTO attendance FROM jsonb_array_elements(old.attendance)x WHERE p_action->'student_ids' ? (x->>'user_id');
   IF jsonb_array_length(attendance)<>jsonb_array_length(p_action->'student_ids') THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
   outcomes:=public.uc_session_outcomes(p_organization_id,p_group_id,attendance);
   SELECT array_agg(DISTINCT x ORDER BY x) INTO ids FROM(SELECT unnest(ids)x UNION SELECT (o->'outcome'->'last_decision'->>'actor_id')::uuid FROM jsonb_array_elements(outcomes)o WHERE o->'outcome'->'last_decision'->>'actor_id' IS NOT NULL) people WHERE x IS NOT NULL;
   PERFORM public.uc_group_education_lock(p_organization_id,p_group_id,ids,p_request_id,false);
   IF outcomes IS DISTINCT FROM public.uc_session_outcomes(p_organization_id,p_group_id,attendance) THEN PERFORM public.uc_session_error('SOURCE_CHANGED');END IF;
   IF p_action->>'kind'<>'journal' AND EXISTS(SELECT 1 FROM jsonb_array_elements(outcomes)x WHERE x->'outcome'='null' OR x->'outcome'->>'decision_relation' IS DISTINCT FROM 'current_inputs' OR x->'outcome'->'last_decision'='null' OR (p_action->>'kind'='education_document' AND x->'outcome'->'last_decision'->>'outcome' IS DISTINCT FROM 'passed')) THEN PERFORM public.uc_session_error('PREREQUISITE_MISSING');END IF;
   SELECT * INTO previous FROM public.uc_session_document_drafts WHERE session_id=s.id AND kind=p_action->>'kind' ORDER BY revision DESC LIMIT 1;
   IF coalesce(previous.revision,0)<>(p_action->>'expected_draft_revision')::bigint OR coalesce(previous.revision,0)>=9007199254740990 THEN PERFORM public.uc_session_error('REVISION_CONFLICT');END IF;
   source:=jsonb_build_object('schema_version',1,'kind',p_action->>'kind','status','draft_requires_human_review','officially_issued',false,'signature',NULL,'registry_number',NULL,'display_label_notice','display_labels_observed_separately_not_verified_legal_names','scope',public.uc_group_education_scope(p_organization_id,p_group_id,course),'session_id',s.id,'session_version_id',old.id,'session_revision',old.revision,'session_hash',old.content_hash,'session_source',proof-'roster_rows','starts_at',starts,'ends_at',ends,'academic_hours',hours::text,'teacher_user_id',teacher,'attendance',attendance,'outcomes',outcomes);
   IF octet_length(source::text)>1048576 THEN PERFORM public.uc_session_error('LIMIT_EXCEEDED');END IF;
   INSERT INTO public.uc_session_document_drafts(id,organization_id,group_id,session_id,session_version_id,kind,revision,supersedes_id,source_proof,content_hash,actor_id,reason,participant_ids) VALUES(new_id,p_organization_id,p_group_id,s.id,old.id,p_action->>'kind',coalesce(previous.revision,0)+1,previous.id,source,public.uc_program_hash(source),actor,p_action->>'reason',ids) RETURNING * INTO d;
   receipt:=jsonb_build_object('request_id',p_request_id,'action',kind,'session_id',s.id,'revision',old.revision,'version_id',old.id,'content_hash',old.content_hash,'draft_id',d.id,'draft_revision',d.revision,'draft_hash',d.content_hash,'replayed',false);
  END IF;
 END IF;
 IF kind IN('confirm_session','correct_attendance') THEN
  IF jsonb_typeof(rows)<>'array' OR jsonb_array_length(rows)<>jsonb_array_length(proof->'roster_rows') OR (SELECT count(DISTINCT x->>'user_id') FROM jsonb_array_elements(rows)x)<>jsonb_array_length(rows) THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
  FOR r IN SELECT x FROM jsonb_array_elements(rows)x ORDER BY x->>'user_id' LOOP
   IF NOT public.uc_learning_shape(r,ARRAY['user_id','status']) OR public.uc_learning_uuid(r->'user_id') IS DISTINCT FROM true OR coalesce(r->>'status','') NOT IN('present','absent','excused') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(proof->'roster_rows')x WHERE x->>'user_id'=r->>'user_id') THEN PERFORM public.uc_session_error('INVALID_INPUT');END IF;
   SELECT x INTO input FROM jsonb_array_elements(proof->'roster_rows')x WHERE x->>'user_id'=r->>'user_id';
   attendance:=attendance||jsonb_build_array(input||jsonb_build_object('status',r->>'status'));
  END LOOP;
  input:=jsonb_build_object('session_id',s.id,'revision',rev,'starts_at',starts,'ends_at',ends,'academic_hours',hours::text,'teacher_user_id',teacher,'attendance',attendance,'source_proof',proof,'reason',p_action->>'reason','actor_id',actor,'supersedes_id',old.id);
  INSERT INTO public.uc_conducted_session_versions(id,session_id,organization_id,group_id,revision,starts_at,ends_at,academic_hours,teacher_user_id,attendance,reason,actor_id,authority_snapshot,source_proof,content_hash,supersedes_id,participant_ids) VALUES(new_id,s.id,p_organization_id,p_group_id,rev,starts,ends,hours,teacher,attendance,p_action->>'reason',actor,public.uc_group_education_authority(p_organization_id,p_group_id,actor),proof,public.uc_program_hash(input),old.id,ids) RETURNING * INTO v;
  receipt:=jsonb_build_object('request_id',p_request_id,'action',kind,'session_id',s.id,'revision',rev,'version_id',v.id,'content_hash',v.content_hash,'draft_id',NULL,'draft_revision',NULL,'draft_hash',NULL,'replayed',false);
 END IF;
 INSERT INTO public.uc_conducted_session_requests(actor_id,request_id,organization_id,group_id,input_hash,receipt,participant_ids) VALUES(actor,p_request_id,p_organization_id,p_group_id,hash,receipt,ids);
 RETURN jsonb_build_object('schema_version',1,'receipt',receipt);
EXCEPTION WHEN lock_not_available OR serialization_failure THEN PERFORM public.uc_session_error('SOURCE_CHANGED');END;$fn$;

-- Account deletion helpers are private. The exact authoritative integration is
-- captured in privacy-integration.template.sql after pricing/UC013/014/015.
CREATE FUNCTION public.uc_session_personal_counts(p_user uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_array(jsonb_build_object('table','uc_conducted_session_versions','count',(SELECT count(*) FROM public.uc_conducted_session_versions WHERE participant_ids @> ARRAY[p_user])),jsonb_build_object('table','uc_session_document_drafts','count',(SELECT count(*) FROM public.uc_session_document_drafts WHERE participant_ids @> ARRAY[p_user])),jsonb_build_object('table','uc_conducted_session_requests','count',(SELECT count(*) FROM public.uc_conducted_session_requests WHERE participant_ids @> ARRAY[p_user])))
$fn$;
CREATE FUNCTION public.uc_session_personal_export(p_user uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('sessions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'session_id',session_id,'revision',revision,'starts_at',starts_at,'ends_at',ends_at,'recorded_at',recorded_at,'attendance',(SELECT jsonb_agg(x) FROM jsonb_array_elements(attendance)x WHERE x->>'user_id'=p_user::text),'actor',actor_id=p_user,'teacher',teacher_user_id=p_user,'redacted',redacted)) FROM public.uc_conducted_session_versions WHERE participant_ids @> ARRAY[p_user]),'[]'),'document_drafts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'session_id',session_id,'kind',kind,'revision',revision,'recorded_at',recorded_at,'officially_issued',false)) FROM public.uc_session_document_drafts WHERE participant_ids @> ARRAY[p_user]),'[]'))
$fn$;
CREATE FUNCTION public.uc_session_redact(p_value jsonb,p_user uuid) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE result jsonb;item jsonb;k text;BEGIN
 IF p_value IS NULL THEN RETURN NULL;END IF;
 IF jsonb_typeof(p_value)='object' THEN
  -- Free text and observed labels of the erased subject cannot survive inside
  -- a retained hash/reference. Other students' rows and all revisions remain.
  IF p_value->>'user_id'=p_user::text OR p_value->>'subject_user_id'=p_user::text THEN RETURN jsonb_build_object('redacted',true,'status',p_value->'status');END IF;
  result:='{}';FOR k,item IN SELECT * FROM jsonb_each(p_value) LOOP
   IF k IN('reason','staff_reason','learner_summary','teacher_label','group_snapshot','facts_snapshot') THEN CONTINUE;END IF;
   result:=result||jsonb_build_object(k,public.uc_session_redact(item,p_user));
  END LOOP;RETURN result;
 ELSIF jsonb_typeof(p_value)='array' THEN SELECT coalesce(jsonb_agg(public.uc_session_redact(x,p_user)),'[]') INTO result FROM jsonb_array_elements(p_value)x;RETURN result;
 ELSIF p_value=to_jsonb(p_user::text) THEN RETURN 'null';ELSE RETURN p_value;END IF;
END;$fn$;
CREATE FUNCTION public.uc_session_erase_user(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR current_setting('sintagma.account_deletion_erase_user',true) IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user) THEN PERFORM public.uc_session_error('ACCESS_DENIED');END IF;
 DELETE FROM public.uc_conducted_session_requests WHERE participant_ids @> ARRAY[p_user];
 UPDATE public.uc_conducted_session_versions SET attendance=public.uc_session_redact(attendance,p_user),source_proof=public.uc_session_redact(source_proof,p_user),authority_snapshot='{}',reason='Личные сведения удалены.',actor_id=CASE WHEN actor_id=p_user THEN NULL ELSE actor_id END,teacher_user_id=CASE WHEN teacher_user_id=p_user THEN NULL ELSE teacher_user_id END,participant_ids=array_remove(participant_ids,p_user),redacted=true WHERE participant_ids @> ARRAY[p_user];
 UPDATE public.uc_session_document_drafts SET source_proof=public.uc_session_redact(source_proof,p_user),reason='Личные сведения удалены.',actor_id=CASE WHEN actor_id=p_user THEN NULL ELSE actor_id END,participant_ids=array_remove(participant_ids,p_user),redacted=true WHERE participant_ids @> ARRAY[p_user];
 -- Hashes remain historical commitments, explicitly invalid for further use.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.uc_session_personal_counts(p_user))x WHERE (x->>'count')::bigint<>0) THEN PERFORM public.uc_session_error('SOURCE_UNAVAILABLE');END IF;
END;$fn$;

DO $functions_acl$ DECLARE f record;g record;BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure::text sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND(p.proname LIKE 'uc_session_%' OR p.proname IN('read_conducted_sessions','apply_conducted_session_action')) LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=f.oid AND a.grantee<>p.proowner LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s CASCADE',f.sig,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);END LOOP;
 END LOOP;
END;$functions_acl$;
GRANT EXECUTE ON FUNCTION public.read_conducted_sessions(uuid,uuid,jsonb),public.apply_conducted_session_action(uuid,uuid,bigint,uuid,jsonb) TO authenticated;

-- Release gate: the root integrator must stack the reviewed exact-body privacy
-- transform here. A source-only migration can never silently skip the erase job.
-- Exact post609 privacy sequence; preserve full in-database pg_proc metadata exceptprosrc.
DO $uc017_privacy_1$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_personal_row_counts(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC017';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM 'bf7c8c1cb09cfdfe35b3c67ecc653ff3' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC017';END IF;
 v_patched:=v_original;
 v_needle:=$uc017_privacy_1_needle_0$ RETURN result;$uc017_privacy_1_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC017';END IF;
 v_patched:=replace(v_patched,v_needle,$uc017_privacy_1_replacement_0$ result:=result||public.uc_session_personal_counts(p_user_id);
 RETURN result;$uc017_privacy_1_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM '5b88dbf3ae72ae78fcd5c9f3dbca3872' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC017';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC017';END IF;
END;
$uc017_privacy_1$;

DO $uc017_privacy_2$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_snapshot(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC017';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM 'f3100b7f572115c4b22c84a82690a584' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC017';END IF;
 v_patched:=v_original;
 v_needle:=$uc017_privacy_2_needle_0$ v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc017_privacy_2_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC017';END IF;
 v_patched:=replace(v_patched,v_needle,$uc017_privacy_2_replacement_0$ SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_session_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','conducted_sessions','label','Проведённые занятия, посещение и черновики: личные сведения обезличиваются, редакции сохраняются','count',v_count,'action','anonymize'));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc017_privacy_2_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'bd5bd6dd7079951d1712d51fe2b4d3b1' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC017';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC017';END IF;
END;
$uc017_privacy_2$;

DO $uc017_privacy_3$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_erase_data(uuid,text)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC017';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '96a99f5bbe4c1389ef920dcdc82ce82b' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC017';END IF;
 v_patched:=v_original;
 v_needle:=$uc017_privacy_3_needle_0$ IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u)) n WHERE (n->>'count')::bigint>0)$uc017_privacy_3_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC017';END IF;
 v_patched:=replace(v_patched,v_needle,$uc017_privacy_3_replacement_0$ PERFORM public.uc_session_erase_user(u);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u)) n WHERE (n->>'count')::bigint>0)$uc017_privacy_3_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'a496bbcd2154d994c9e83888313a84a3' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC017';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC017';END IF;
END;
$uc017_privacy_3$;

DO $privacy_required$ BEGIN
 IF position('public.uc_session_personal_counts(p_user_id)' IN pg_get_functiondef('public.account_deletion_personal_row_counts(uuid)'::regprocedure))=0
 OR position('public.uc_session_personal_counts(p_user_id)' IN pg_get_functiondef('public.account_deletion_snapshot(uuid)'::regprocedure))=0
 OR position('public.uc_session_erase_user(u)' IN pg_get_functiondef('public.account_deletion_erase_data(uuid,text)'::regprocedure))=0
 THEN PERFORM public.uc_session_error('PRIVACY_INTEGRATION_NOT_CAPTURED');END IF;
END;$privacy_required$;
