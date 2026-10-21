-- UC014 foundation. Prospective technical evidence and separately authorized
-- human decisions. No enrollment/progress writes, numbering, issuer or backfill.
-- Installation is held until UC013 release/integration and native acceptance.
DO $preflight$ BEGIN
 IF to_regprocedure('public.uc_program_hash(jsonb)') IS NULL
 OR to_regprocedure('public.uc_program_file_proof(uuid,uuid)') IS NULL
 OR to_regprocedure('public.account_deletion_access_allowed()') IS NULL
 OR to_regclass('public.group_program_enrollment_snapshots') IS NULL
 OR to_regclass('public.test_attempt_sessions') IS NULL
 OR to_regclass('public.course_manual_credits') IS NULL THEN
  RAISE EXCEPTION 'LEARNING_OUTCOME_DEPENDENCY_UNAVAILABLE';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND(p.proname LIKE 'uc_learning_%' OR p.proname IN('read_learning_outcome','apply_learning_outcome_action'))) OR to_regclass('public.uc_learning_outcome_states') IS NOT NULL THEN RAISE EXCEPTION 'LEARNING_OUTCOME_DEPENDENCY_UNAVAILABLE';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES
 ('public._assert_test_learner_access(uuid)','121b38460edcfebb91a3b0ec5d5a4de5'),
 ('public._final_test_photo_required(uuid)','d147738f2ea89383f9ea876c5aabdde0'),
 ('public._paid_20260922_lesson_read(uuid,boolean,boolean)','0eb744d6b438b88f76ed164e8ec3131c'),
 ('public._test_attempt_limits(uuid,uuid)','b44145c47907f5fc4396e385d776acd2'),
 ('public._test_grade_payload(uuid)','5fd2c208ab1da1c99f53e39068a3853b'),
 ('public._test_manual_credit(uuid)','e23a3f0ed56fe05fd0a9a97422d93487'),
 ('public._test_normalize_options(jsonb,integer)','3d9019fdcfec6541dbdc251f0d735deb'),
 ('public._test_public_questions(jsonb,boolean)','f6cd1a2451ad7cf80b1afde037c5e8cb'),
 ('public._test_session_payload(uuid)','c41f809267021233b71c6715f0d50364'),
 ('public.account_deletion_access_allowed()','64b0a90b7db9813950ccca6dff208f3a'),
 ('public.can_access_course_as_learner(uuid)','fff57f8e966305869e67d97b578fee4b'),
 ('public.start_test_attempt(uuid,uuid)','43978d2d2dc843ec563dbc0d1fd6e313'),
 ('public.submit_test_attempt(uuid,jsonb)','9cff05e090f0c8da170d2bed99b728cf'),
 ('public._paid_20260922_course_read(uuid,boolean)','6e826c917b69c2e37ef99407c9808ed9'),
 ('public._paid_20260922_course_scope(uuid)','77b5addf47ccd0b51e133098b391eb2d'),
 ('public._paid_20260922_original_ids()','cd7bc9e459525c66f1c5cfa5b2b635b6')
 )p(signature,source_md5) WHERE to_regprocedure(signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>source_md5) THEN RAISE EXCEPTION 'LEARNING_OUTCOME_DEPENDENCY_UNAVAILABLE';END IF;
END;$preflight$;

CREATE TABLE public.uc_learning_criteria_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 course_id uuid NOT NULL, program_version_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 state text NOT NULL CHECK(state IN('draft','approved')),
 definition jsonb NOT NULL, module_snapshots jsonb NOT NULL DEFAULT '[]',
 programme_proof jsonb NOT NULL, content_hash text NOT NULL CHECK(content_hash~'^[a-f0-9]{64}$'),
 created_by uuid, reviewer_id uuid, approved_by uuid,
 participant_ids uuid[] NOT NULL, redacted boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), approved_at timestamptz,
 CHECK((state='approved')=(approved_at IS NOT NULL))
);
CREATE INDEX uc_learning_criteria_program ON public.uc_learning_criteria_versions(organization_id,course_id,program_version_id,approved_at DESC,id DESC);
CREATE INDEX uc_learning_criteria_people ON public.uc_learning_criteria_versions USING gin(participant_ids);
CREATE TABLE public.uc_learning_outcome_states(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
 group_id uuid NOT NULL,user_id uuid NOT NULL,course_id uuid NOT NULL,enrollment_id uuid NOT NULL,
 program_enrollment_snapshot_id uuid NOT NULL UNIQUE,program_version_id uuid NOT NULL,
 criteria_id uuid NOT NULL, revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 machine_id uuid,decision_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX uc_learning_states_subject ON public.uc_learning_outcome_states(user_id,enrollment_id);
CREATE INDEX uc_learning_states_scope ON public.uc_learning_outcome_states(organization_id,group_id,course_id,user_id);
CREATE TABLE public.uc_learning_attempt_contexts(
 session_id uuid PRIMARY KEY,user_id uuid NOT NULL,lesson_id uuid NOT NULL,
 state_id uuid,criteria_id uuid,scope jsonb,
 binding_state text NOT NULL CHECK(binding_state IN('bound','unconfigured','ambiguous','source_unavailable','system_unbound')),
 observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),session_started_at timestamptz NOT NULL,
 CHECK((binding_state='bound')=(state_id IS NOT NULL AND criteria_id IS NOT NULL AND scope IS NOT NULL))
);
CREATE INDEX uc_learning_context_subject ON public.uc_learning_attempt_contexts(user_id,session_id);
CREATE INDEX uc_learning_context_evaluation ON public.uc_learning_attempt_contexts(state_id,criteria_id,lesson_id,session_id) WHERE binding_state='bound';
CREATE TABLE public.uc_learning_machine_results(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),state_id uuid NOT NULL,
 organization_id uuid NOT NULL,user_id uuid NOT NULL,revision_created bigint NOT NULL,
 criteria_ref jsonb NOT NULL,input_hash text NOT NULL CHECK(input_hash~'^[a-f0-9]{64}$'),
 evaluation jsonb NOT NULL,evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(state_id,revision_created)
);
CREATE INDEX uc_learning_machine_subject ON public.uc_learning_machine_results(user_id,state_id);
CREATE TABLE public.uc_learning_attestation_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),state_id uuid NOT NULL,
 organization_id uuid NOT NULL,user_id uuid NOT NULL,revision_created bigint NOT NULL,
 criteria_id uuid NOT NULL,machine_result_id uuid NOT NULL,machine_input_hash text NOT NULL,
 outcome text NOT NULL CHECK(outcome IN('passed','not_passed','deferred')),
 basis text NOT NULL CHECK(basis IN('machine','recognition')),
 staff_reason text NOT NULL,learner_summary text NOT NULL,actor_id uuid,
 authority_snapshot jsonb NOT NULL,source_proof jsonb NOT NULL,
 supersedes_id uuid,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 participant_ids uuid[] NOT NULL,redacted boolean NOT NULL DEFAULT false,
 UNIQUE(state_id,revision_created),CHECK(user_id=ANY(participant_ids))
);
CREATE INDEX uc_learning_decision_subject ON public.uc_learning_attestation_decisions(user_id,state_id);
CREATE INDEX uc_learning_decision_people ON public.uc_learning_attestation_decisions USING gin(participant_ids);
CREATE TABLE public.uc_learning_outcome_requests(
 actor_id uuid NOT NULL,request_id uuid NOT NULL,organization_id uuid NOT NULL,user_id uuid,
 state_id uuid,action text NOT NULL,payload_hash text NOT NULL,receipt jsonb NOT NULL,
 participant_ids uuid[] NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,request_id),CHECK(actor_id=ANY(participant_ids)),CHECK(user_id IS NULL OR user_id=ANY(participant_ids))
);
CREATE INDEX uc_learning_request_subject ON public.uc_learning_outcome_requests(user_id,state_id);
CREATE INDEX uc_learning_request_people ON public.uc_learning_outcome_requests USING gin(participant_ids);
-- Normalize ONLY new object ACLs, including unexpected host default roles.
DO $acl$ DECLARE t text;g record;BEGIN
 FOREACH t IN ARRAY ARRAY['uc_learning_criteria_versions','uc_learning_outcome_states','uc_learning_attempt_contexts','uc_learning_machine_results','uc_learning_attestation_decisions','uc_learning_outcome_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  FOR g IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.oid=format('public.%I',t)::regclass AND a.grantee<>c.relowner LOOP
   EXECUTE format('REVOKE ALL ON public.%I FROM %s CASCADE',t,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
  EXECUTE format('GRANT ALL ON public.%I TO %I',t,(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=format('public.%I',t)::regclass));
 END LOOP;
END;$acl$;

CREATE FUNCTION public.uc_learning_error(p_code text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'LEARNING_OUTCOME_%',p_code USING ERRCODE=CASE p_code WHEN 'ACCESS_DENIED' THEN '42501' WHEN 'INVALID_INPUT' THEN '22023' WHEN 'REVISION_CONFLICT' THEN '40001' WHEN 'SOURCE_CHANGED' THEN '40001' ELSE 'P0001' END;END;$fn$;
CREATE FUNCTION public.uc_learning_shape(p jsonb,keys text[]) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
BEGIN IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN false;END IF;RETURN coalesce(p ?& keys AND (SELECT count(*) FROM jsonb_object_keys(p))=cardinality(keys),false);END;$fn$;
CREATE FUNCTION public.uc_learning_uuid(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_typeof(p)='string' AND p#>>'{}'~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)
$fn$;
CREATE FUNCTION public.uc_learning_ids(p jsonb,p_min integer,p_max integer) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
BEGIN IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RETURN false;END IF;RETURN jsonb_array_length(p) BETWEEN p_min AND p_max AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p)x WHERE NOT public.uc_learning_uuid(x)) AND (SELECT count(DISTINCT x) FROM jsonb_array_elements(p)x)=jsonb_array_length(p);END;$fn$;
CREATE FUNCTION public.uc_learning_text(p jsonb,maxlen integer) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_typeof(p)='string' AND length(p#>>'{}') BETWEEN 1 AND maxlen AND p#>>'{}'~'[^[:space:]]' AND btrim(p#>>'{}',E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))=p#>>'{}',false)
$fn$;
CREATE FUNCTION public.uc_learning_person(p_actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p_actor IS NOT NULL AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_actor AND to_jsonb(u)->>'deleted_at' IS NULL AND coalesce((to_jsonb(u)->>'banned_until')::timestamptz<=now(),true))
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)
 AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor AND to_jsonb(profiles)->>'blocked_at' IS NOT NULL),false)
$fn$;
-- Explicit-actor predicate. No auth.uid substitution or another-group shortcut.
CREATE FUNCTION public.uc_learning_staff(p_actor uuid,p_org uuid,p_group uuid,p_write boolean) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_learning_person(p_actor) AND public.uc_platform_document_action_allowed(p_actor,CASE WHEN p_write THEN 'write' ELSE 'read' END)
 AND(NOT p_write OR NOT public.has_role(p_actor,'sales_manager'::public.app_role))
 AND (public.is_org_owner(p_actor,p_org) OR
  (public.has_role(p_actor,'admin'::public.app_role) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_actor AND p.organization_id=p_org)) OR
  EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org AND (s.expires_at IS NULL OR s.expires_at>now()) AND(NOT p_write OR s.role NOT IN('viewer','sales_manager'))
   AND public.has_org_staff_permission(p_actor,p_org,CASE WHEN p_write THEN 'students.write' ELSE 'students.read' END)
   AND public.has_org_staff_permission(p_actor,p_org,CASE WHEN p_write THEN 'documents.write' ELSE 'documents.read' END)
   AND (s.role<>'teacher' OR (p_group IS NOT NULL AND EXISTS(SELECT 1 FROM public.org_staff_document_groups g WHERE g.staff_id=s.id AND g.organization_id=p_org AND g.group_id=p_group)
    AND (NOT p_write OR s.sections_access ?& ARRAY['students.write','documents.write']))))),false)
$fn$;
CREATE FUNCTION public.uc_learning_scope(p_snapshot uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('organization_id',organization_id,'group_id',group_id,'user_id',user_id,'course_id',course_id,'enrollment_id',enrollment_id,'program_enrollment_snapshot_id',id,'program_version_id',version_id)
 FROM public.group_program_enrollment_snapshots WHERE id=p_snapshot
$fn$;
CREATE FUNCTION public.uc_learning_scope_valid(p_org uuid,p_scope jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE k text;s public.group_program_enrollment_snapshots;BEGIN
 IF NOT public.uc_learning_shape(p_scope,ARRAY['organization_id','group_id','user_id','course_id','enrollment_id','program_enrollment_snapshot_id','program_version_id']) THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['organization_id','group_id','user_id','course_id','enrollment_id','program_enrollment_snapshot_id','program_version_id'] LOOP IF NOT public.uc_learning_uuid(p_scope->k) THEN RETURN false;END IF;END LOOP;
 SELECT * INTO s FROM public.group_program_enrollment_snapshots WHERE id=(p_scope->>'program_enrollment_snapshot_id')::uuid;
 RETURN coalesce(s.organization_id=p_org AND public.uc_learning_scope(s.id)=p_scope
  AND EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id JOIN public.student_groups g ON g.id=s.group_id AND g.organization_id=c.organization_id AND g.course_id=c.id
   JOIN public.student_group_memberships_effective m ON m.organization_id=c.organization_id AND m.group_id=g.id AND m.user_id=e.user_id
   WHERE e.id=s.enrollment_id AND e.user_id=s.user_id AND e.course_id=s.course_id AND c.organization_id=p_org AND e.status NOT IN('cancelled','revoked'))
  AND public.uc_learning_person(s.user_id),false);
END;$fn$;
CREATE FUNCTION public.uc_learning_envelope(p_org uuid,p_scope jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE audience text;s public.uc_learning_outcome_states;c public.uc_learning_criteria_versions;m public.uc_learning_machine_results;d public.uc_learning_attestation_decisions;fresh boolean:=false;decision_fresh boolean:=false;live jsonb;technical jsonb;decision jsonb;machine jsonb;prerequisites jsonb:='[]';can_decide boolean:=false;BEGIN
 audience:=public.uc_learning_access(p_org,p_scope,false);
 SELECT * INTO s FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=(p_scope->>'program_enrollment_snapshot_id')::uuid;
 SELECT jsonb_build_object('status',e.status,'progress',coalesce(e.progress,0),'manual_credited_at',(SELECT credited_at FROM public.course_manual_credits WHERE enrollment_id=e.id AND revoked_at IS NULL ORDER BY credited_at DESC,id DESC LIMIT 1)) INTO technical FROM public.enrollments e WHERE e.id=(p_scope->>'enrollment_id')::uuid;
 IF s.id IS NULL THEN
  SELECT * INTO c FROM public.uc_learning_criteria_versions v WHERE v.organization_id=p_org AND v.course_id=(p_scope->>'course_id')::uuid AND v.program_version_id=(p_scope->>'program_version_id')::uuid AND v.state='approved' AND NOT v.redacted ORDER BY v.approved_at DESC,v.id DESC LIMIT 1;
  IF c.definition->'main'->>'kind' IS DISTINCT FROM 'human_assessment' THEN c:=NULL;END IF;
  prerequisites:=jsonb_build_array(CASE WHEN c.id IS NULL THEN 'NEW_BOUND_SESSION_REQUIRED' ELSE 'HUMAN_ASSESSMENT_CONTEXT_NOT_STARTED' END);
 ELSE
  SELECT * INTO c FROM public.uc_learning_criteria_versions WHERE id=s.criteria_id;
  SELECT * INTO m FROM public.uc_learning_machine_results WHERE id=s.machine_id AND state_id=s.id;
  SELECT * INTO d FROM public.uc_learning_attestation_decisions WHERE id=s.decision_id AND state_id=s.id;
  live:=public.uc_learning_evaluate(s);
  IF c.redacted OR c.id IS NULL THEN prerequisites:=prerequisites||jsonb_build_array('SOURCE_ERASED');END IF;
  IF c.programme_proof IS DISTINCT FROM public.uc_learning_programme_proof(p_org,s.program_version_id) THEN prerequisites:=prerequisites||jsonb_build_array('SOURCE_UNAVAILABLE');END IF;
  IF m.id IS NULL THEN prerequisites:=prerequisites||jsonb_build_array('MACHINE_RESULT_NOT_CAPTURED');
  ELSE
   fresh:=m.input_hash=live->>'input_hash';
   machine:=jsonb_build_object('id',m.id,'revision_created',m.revision_created,'criteria_ref',m.criteria_ref,'input_hash',m.input_hash,'evaluated_at',m.evaluated_at,'eligibility',m.evaluation->'eligibility','components',m.evaluation->'components','source_fresh',fresh);
   IF NOT fresh THEN prerequisites:=prerequisites||jsonb_build_array('EVIDENCE_CHANGED');END IF;
  END IF;
  can_decide:=audience='staff' AND public.uc_learning_staff(auth.uid(),p_org,s.group_id,true) AND c.definition->'eligible_decider_ids' ? auth.uid()::text AND NOT c.redacted AND m.id IS NOT NULL AND fresh;
  IF d.id IS NOT NULL THEN
   decision_fresh:=fresh AND NOT d.redacted AND(d.basis<>'recognition' OR(d.source_proof->'recognition_proof' IS NOT NULL AND d.source_proof->'recognition_proof' IS NOT DISTINCT FROM public.uc_learning_recognition_proof(p_org,(d.source_proof->>'recognition_file_version_id')::uuid)));
   IF NOT decision_fresh THEN prerequisites:=prerequisites||jsonb_build_array('DECISION_SOURCE_CHANGED');END IF;
   decision:=jsonb_build_object('id',d.id,'machine_result_id',d.machine_result_id,'outcome',d.outcome,'learner_summary',d.learner_summary,'recorded_at',d.recorded_at,'supersedes_id',d.supersedes_id);
   IF audience='staff' THEN decision:=decision||jsonb_build_object('staff_reason',d.staff_reason,'actor_id',d.actor_id,'basis',d.basis);END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('schema_version',1,'audience',audience,'scope',p_scope,'revision',coalesce(s.revision,0),'criteria_ref',CASE WHEN c.id IS NOT NULL THEN public.uc_learning_criteria_ref(c) END,'machine',machine,'last_decision',decision,
  'decision_relation',CASE WHEN d.id IS NULL THEN 'no_decision' WHEN d.machine_result_id IS DISTINCT FROM m.id THEN 'new_machine_requires_review' WHEN NOT decision_fresh THEN 'source_changed' ELSE 'current_inputs' END,
  'technical_observation',technical,'prerequisites',prerequisites,'capabilities',jsonb_build_object('can_capture',c.id IS NOT NULL AND NOT c.redacted AND c.programme_proof IS NOT DISTINCT FROM public.uc_learning_programme_proof(p_org,(p_scope->>'program_version_id')::uuid) AND(s.id IS NOT NULL OR audience='staff' AND public.uc_learning_staff(auth.uid(),p_org,(p_scope->>'group_id')::uuid,true)),'can_decide',coalesce(can_decide,false)));
END;$fn$;
CREATE FUNCTION public.read_learning_outcome(p_organization_id uuid,p_query jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE u uuid:=auth.uid();target uuid;course uuid;enrollment uuid;after_id uuid;lim integer;sn record;rows jsonb:='[]';n integer:=0;last_id uuid;proof jsonb;versions jsonb;BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.uc_learning_person(u) OR NOT public.account_deletion_access_allowed() THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 IF p_query->>'kind'='outcome' THEN
  IF NOT public.uc_learning_shape(p_query,ARRAY['kind','scope']) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  RETURN public.uc_learning_envelope(p_organization_id,p_query->'scope');
 ELSIF p_query->>'kind'='associations' THEN
  IF NOT public.uc_learning_shape(p_query,ARRAY['kind','user_id','course_id','enrollment_id','after_snapshot_id','limit']) OR NOT public.uc_learning_uuid(p_query->'user_id') OR NOT public.uc_learning_uuid(p_query->'course_id') OR NOT public.uc_learning_uuid(p_query->'enrollment_id') OR NOT(p_query->'after_snapshot_id'='null'::jsonb OR public.uc_learning_uuid(p_query->'after_snapshot_id')) OR jsonb_typeof(p_query->'limit') IS DISTINCT FROM 'number' OR p_query->>'limit'!~'^[1-9][0-9]?$' THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  lim:=(p_query->>'limit')::integer;IF lim>50 THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  target:=(p_query->>'user_id')::uuid;course:=(p_query->>'course_id')::uuid;enrollment:=(p_query->>'enrollment_id')::uuid;after_id:=(p_query->>'after_snapshot_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=enrollment AND e.user_id=target AND e.course_id=course AND c.organization_id=p_organization_id AND e.status NOT IN('cancelled','revoked'))
   OR NOT(target=u AND public.can_access_course_as_learner(course) AND public._paid_20260922_course_read(course,true) OR target<>u AND(public.uc_learning_staff(u,p_organization_id,NULL,false) OR EXISTS(SELECT 1 FROM public.student_group_memberships_effective g WHERE g.user_id=target AND g.organization_id=p_organization_id AND public.uc_learning_staff(u,p_organization_id,g.group_id,false)))) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  FOR sn IN SELECT s.id,public.uc_learning_scope(s.id)scope FROM public.group_program_enrollment_snapshots s
   WHERE s.organization_id=p_organization_id AND s.enrollment_id=enrollment AND s.user_id=target AND s.course_id=course AND(after_id IS NULL OR s.id>after_id)
    AND public.uc_learning_scope_valid(p_organization_id,public.uc_learning_scope(s.id)) AND(target=u OR public.uc_learning_staff(u,p_organization_id,s.group_id,false)) ORDER BY s.id LIMIT lim+1
  LOOP
   n:=n+1;EXIT WHEN n>lim;rows:=rows||jsonb_build_array(public.uc_learning_envelope(p_organization_id,sn.scope));last_id:=sn.id;
  END LOOP;
  RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'user_id',target,'course_id',course,'enrollment_id',enrollment,'associations',rows,'next_after_snapshot_id',CASE WHEN n>lim THEN last_id END);
 ELSIF p_query->>'kind'='criteria' THEN
  IF NOT public.uc_learning_shape(p_query,ARRAY['kind','course_id','program_version_id']) OR NOT public.uc_learning_uuid(p_query->'course_id') OR NOT public.uc_learning_uuid(p_query->'program_version_id') THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  IF NOT public.uc_learning_staff(u,p_organization_id,NULL,false) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  course:=(p_query->>'course_id')::uuid;target:=(p_query->>'program_version_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=course AND organization_id=p_organization_id) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  proof:=public.uc_learning_programme_proof(p_organization_id,target);
  IF(SELECT count(*) FROM public.uc_learning_criteria_versions WHERE organization_id=p_organization_id AND course_id=course AND program_version_id=target AND NOT redacted)>50 THEN PERFORM public.uc_learning_error('LIMIT_EXCEEDED');END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(v)-'participant_ids' ORDER BY v.created_at DESC,v.id DESC),'[]') INTO versions FROM public.uc_learning_criteria_versions v WHERE v.organization_id=p_organization_id AND v.course_id=course AND v.program_version_id=target AND NOT v.redacted;
  RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'course_id',course,'program_version_id',target,'programme_proof',proof,'versions',versions,'capabilities',jsonb_build_object('can_save',public.uc_learning_staff(u,p_organization_id,NULL,true)));
 ELSIF p_query->>'kind' IN('options','decision_options') THEN RETURN public.uc_learning_options(p_organization_id,p_query);
 ELSE PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
END;$fn$;
CREATE FUNCTION public.uc_learning_validate_test(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE r jsonb;BEGIN
 IF NOT coalesce(public.uc_learning_shape(p,ARRAY['kind','component_id','lesson_id','retake_policy','pass_rule']) AND p->>'kind'='test'
 AND public.uc_learning_uuid(p->'component_id') AND public.uc_learning_uuid(p->'lesson_id')
 AND p->>'retake_policy' IN('latest_completed','best_percent'),false) THEN RETURN false;END IF;
 r:=p->'pass_rule';
 RETURN coalesce(public.uc_learning_shape(r,ARRAY['kind']) AND r->>'kind'='session_pass'
 OR public.uc_learning_shape(r,ARRAY['kind','threshold_basis_points','rounding']) AND r->>'kind'='percent'
  AND jsonb_typeof(r->'threshold_basis_points')='number' AND r->>'threshold_basis_points'~'^(0|[1-9][0-9]{0,4})$'
  AND (r->>'threshold_basis_points')::numeric<=10000 AND r->>'rounding' IN('none','nearest_integer_half_up'),false);
END;$fn$;
CREATE FUNCTION public.uc_learning_validate_criteria(p_org uuid,p_course uuid,p_definition jsonb,p_complete boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE x jsonb;m jsonb;modules jsonb:='[]';ids uuid[]:='{}';lessons uuid[];n integer:=0;u uuid;BEGIN
 IF NOT public.uc_learning_shape(p_definition,ARRAY['schema_version','main','requirements','reviewer_id','independent_review_required','eligible_decider_ids','recognition_component_ids','recognition_file_version_ids','review_note'])
 OR p_definition->'schema_version' IS DISTINCT FROM '1'::jsonb
 OR jsonb_typeof(p_definition->'requirements') IS DISTINCT FROM 'array' OR jsonb_array_length(p_definition->'requirements')>19
 OR jsonb_typeof(p_definition->'independent_review_required') IS DISTINCT FROM 'boolean'
 OR NOT public.uc_learning_ids(p_definition->'eligible_decider_ids',0,20)
 OR NOT public.uc_learning_ids(p_definition->'recognition_component_ids',0,20)
 OR NOT public.uc_learning_ids(p_definition->'recognition_file_version_ids',0,5)
 OR NOT public.uc_learning_text(p_definition->'review_note',2000)
 OR NOT(p_definition->'reviewer_id'='null'::jsonb OR public.uc_learning_uuid(p_definition->'reviewer_id')) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
 m:=p_definition->'main';
 IF m<>'null'::jsonb THEN
  IF NOT public.uc_learning_validate_test(m) AND NOT coalesce(public.uc_learning_shape(m,ARRAY['kind','component_id','label']) AND m->>'kind'='human_assessment' AND public.uc_learning_uuid(m->'component_id') AND public.uc_learning_text(m->'label',500),false) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  ids:=ARRAY[(m->>'component_id')::uuid];
 END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_definition->'requirements') LOOP
  IF NOT public.uc_learning_validate_test(x) AND NOT coalesce(public.uc_learning_shape(x,ARRAY['kind','component_id','module_id']) AND x->>'kind'='module_completion' AND public.uc_learning_uuid(x->'component_id') AND public.uc_learning_uuid(x->'module_id'),false) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  IF (x->>'component_id')::uuid=ANY(ids) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;ids:=ids||(x->>'component_id')::uuid;
 END LOOP;
 IF NOT p_complete THEN RETURN modules;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_definition->'recognition_component_ids') AS elem(value) WHERE NOT(elem.value::uuid=ANY(ids))) OR (jsonb_array_length(p_definition->'recognition_component_ids')=0)<>(jsonb_array_length(p_definition->'recognition_file_version_ids')=0) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
 IF m='null'::jsonb OR p_definition->'reviewer_id'='null'::jsonb OR jsonb_array_length(p_definition->'eligible_decider_ids')=0 THEN PERFORM public.uc_learning_error('PREREQUISITE_MISSING');END IF;
 IF NOT public.uc_learning_staff((p_definition->>'reviewer_id')::uuid,p_org,NULL,true) THEN PERFORM public.uc_learning_error('PREREQUISITE_MISSING');END IF;
 FOR u IN SELECT value::text::uuid FROM jsonb_array_elements_text(p_definition->'eligible_decider_ids') LOOP
  IF NOT(public.uc_learning_staff(u,p_org,NULL,true) OR EXISTS(SELECT 1 FROM public.student_groups g WHERE g.organization_id=p_org AND g.course_id=p_course AND public.uc_learning_staff(u,p_org,g.id,true))) THEN PERFORM public.uc_learning_error('PREREQUISITE_MISSING');END IF;
 END LOOP;
 FOR u IN SELECT value::text::uuid FROM jsonb_array_elements_text(p_definition->'recognition_file_version_ids') LOOP
  IF NOT public.uc_program_active_file_proof(p_org,u) THEN PERFORM public.uc_learning_error('SOURCE_UNAVAILABLE');END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(jsonb_build_array(m)||(p_definition->'requirements')) LOOP
  IF x->>'kind'='test' THEN
   IF NOT EXISTS(SELECT 1 FROM public.lessons l WHERE l.id=(x->>'lesson_id')::uuid AND l.course_id=p_course AND l.type='test') THEN PERFORM public.uc_learning_error('PREREQUISITE_MISSING');END IF;
  ELSIF x->>'kind'='module_completion' THEN
   IF NOT EXISTS(SELECT 1 FROM public.course_modules WHERE id=(x->>'module_id')::uuid AND course_id=p_course) THEN PERFORM public.uc_learning_error('PREREQUISITE_MISSING');END IF;
   SELECT array_agg(id ORDER BY id) INTO lessons FROM public.lessons WHERE module_id=(x->>'module_id')::uuid AND course_id=p_course;
   IF coalesce(cardinality(lessons),0)=0 THEN PERFORM public.uc_learning_error('PREREQUISITE_MISSING');END IF;
   n:=n+cardinality(lessons);IF n>250 THEN PERFORM public.uc_learning_error('LIMIT_EXCEEDED');END IF;
   modules:=modules||jsonb_build_array(jsonb_build_object('component_id',x->'component_id','module_id',x->'module_id','lesson_ids',to_jsonb(lessons)));
  END IF;
 END LOOP;
 -- Preserve the existing final-photo selector; never silently change its lesson.
 IF m->>'kind'='test' AND EXISTS(SELECT 1 FROM public.courses c WHERE c.id=p_course AND coalesce((to_jsonb(c)->>'require_final_test_photo')::boolean,false)) AND NOT public._final_test_photo_required((m->>'lesson_id')::uuid) THEN PERFORM public.uc_learning_error('PHOTO_POLICY_MISMATCH');END IF;
 RETURN modules;
END;$fn$;

-- Only genuinely new sessions are observed. The original start/resume, quota,
-- photo attachment order, DTO and grading functions remain byte-for-byte intact.
CREATE FUNCTION public.uc_learning_observe_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE candidate record;chosen record;s public.uc_learning_outcome_states;c public.uc_learning_criteria_versions;scope jsonb;seen integer:=0;binding text:='unconfigured';cid uuid;BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR current_setting('role',true) IS DISTINCT FROM 'authenticated' OR auth.uid() IS DISTINCT FROM NEW.user_id THEN
  INSERT INTO public.uc_learning_attempt_contexts(session_id,user_id,lesson_id,binding_state,session_started_at) VALUES(NEW.id,NEW.user_id,NEW.lesson_id,'system_unbound',NEW.started_at);RETURN NEW;
 END IF;
 PERFORM public.uc_learning_try_people(ARRAY[NEW.user_id]);
 FOR candidate IN
  SELECT sn.id,public.uc_learning_scope(sn.id)scope FROM public.group_program_enrollment_snapshots sn
  JOIN public.enrollments e ON e.id=sn.enrollment_id AND e.user_id=sn.user_id AND e.course_id=sn.course_id
  JOIN public.lessons l ON l.course_id=e.course_id AND l.id=NEW.lesson_id
  JOIN public.student_group_memberships_effective g ON g.organization_id=sn.organization_id AND g.group_id=sn.group_id AND g.user_id=sn.user_id
  WHERE sn.user_id=NEW.user_id AND e.status NOT IN('cancelled','revoked')
   AND public.uc_learning_scope_valid(sn.organization_id,public.uc_learning_scope(sn.id))
   AND public.can_access_course_as_learner(sn.course_id) AND public._paid_20260922_course_read(sn.course_id,true) ORDER BY sn.id LIMIT 2
 LOOP
  IF NOT public.uc_learning_scope_valid((candidate.scope->>'organization_id')::uuid,candidate.scope) THEN CONTINUE;END IF;
  seen:=seen+1;chosen:=candidate;
 END LOOP;
 IF seen>1 THEN binding:='ambiguous';
 ELSIF seen=1 THEN
  scope:=chosen.scope;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('uc014_scope:'||public.uc_program_hash(scope),0)) THEN PERFORM public.uc_learning_error('REVISION_CONFLICT');END IF;
  SELECT * INTO s FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=chosen.id;
  IF FOUND THEN SELECT * INTO c FROM public.uc_learning_criteria_versions WHERE id=s.criteria_id;
  ELSE SELECT * INTO c FROM public.uc_learning_criteria_versions v WHERE v.organization_id=(scope->>'organization_id')::uuid AND v.course_id=(scope->>'course_id')::uuid AND v.program_version_id=(scope->>'program_version_id')::uuid AND v.state='approved' AND v.approved_at<=NEW.started_at AND NOT v.redacted ORDER BY v.approved_at DESC,v.id DESC LIMIT 1;
  END IF;
  IF c.id IS NULL THEN binding:='unconfigured';
  ELSIF c.redacted OR c.programme_proof IS DISTINCT FROM public.uc_learning_programme_proof(c.organization_id,c.program_version_id) THEN binding:='source_unavailable';
  ELSE
   IF s.id IS NULL THEN
    INSERT INTO public.uc_learning_outcome_states(organization_id,group_id,user_id,course_id,enrollment_id,program_enrollment_snapshot_id,program_version_id,criteria_id)
    VALUES((scope->>'organization_id')::uuid,(scope->>'group_id')::uuid,NEW.user_id,(scope->>'course_id')::uuid,(scope->>'enrollment_id')::uuid,chosen.id,c.program_version_id,c.id) RETURNING * INTO s;
   END IF;
   binding:='bound';cid:=c.id;
  END IF;
 END IF;
 INSERT INTO public.uc_learning_attempt_contexts(session_id,user_id,lesson_id,state_id,criteria_id,scope,binding_state,session_started_at)
 VALUES(NEW.id,NEW.user_id,NEW.lesson_id,CASE WHEN binding='bound' THEN s.id END,cid,CASE WHEN binding='bound' THEN scope END,binding,NEW.started_at);
 RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_learning_new_session_context AFTER INSERT ON public.test_attempt_sessions FOR EACH ROW EXECUTE FUNCTION public.uc_learning_observe_session();

CREATE FUNCTION public.uc_learning_test_component(p_state public.uc_learning_outcome_states,p_component jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE attempt_row record;best jsonb;grade jsonb;facts jsonb:='[]';r jsonb:=p_component->'pass_rule';passed boolean;n integer:=0;sessions jsonb;reason text;BEGIN
 SELECT jsonb_build_object('count',count(*),'latest_started_at',max(s.started_at)) INTO sessions
 FROM public.test_attempt_sessions s JOIN public.uc_learning_attempt_contexts c ON c.session_id=s.id
 WHERE c.state_id=p_state.id AND c.criteria_id=p_state.criteria_id AND c.binding_state='bound' AND s.user_id=p_state.user_id AND s.lesson_id=(p_component->>'lesson_id')::uuid;
 FOR attempt_row IN SELECT a.*,s.started_at original_started_at,s.passing_score original_threshold,s.submitted_at original_submitted_at
  FROM public.test_attempts a JOIN public.test_attempt_sessions s ON s.id=a.session_id AND s.user_id=a.user_id AND s.lesson_id=a.lesson_id
  JOIN public.uc_learning_attempt_contexts c ON c.session_id=s.id AND c.user_id=s.user_id AND c.lesson_id=s.lesson_id AND c.session_started_at=s.started_at
  WHERE c.state_id=p_state.id AND c.criteria_id=p_state.criteria_id AND c.binding_state='bound' AND a.user_id=p_state.user_id AND a.lesson_id=(p_component->>'lesson_id')::uuid AND s.status='completed'
  ORDER BY a.completed_at,a.id LIMIT 1001
 LOOP
  n:=n+1;IF n>1000 THEN PERFORM public.uc_learning_error('LIMIT_EXCEEDED');END IF;
  IF attempt_row.max_score<=0 OR attempt_row.score<0 OR attempt_row.score>attempt_row.max_score OR attempt_row.passed IS NULL OR attempt_row.passing_score IS NULL OR attempt_row.passing_score NOT BETWEEN 0 AND 100 OR attempt_row.started_at IS DISTINCT FROM attempt_row.original_started_at OR attempt_row.completed_at IS DISTINCT FROM attempt_row.original_submitted_at OR attempt_row.passing_score IS DISTINCT FROM attempt_row.original_threshold THEN
   reason:='ORIGINAL_GRADE_UNAVAILABLE';EXIT;
  END IF;
  grade:=jsonb_build_object('attempt_id',attempt_row.id,'session_id',attempt_row.session_id,'started_at',attempt_row.original_started_at,'completed_at',attempt_row.completed_at,'score',attempt_row.score,'max_score',attempt_row.max_score,'original_passed',attempt_row.passed,'original_passing_score',attempt_row.original_threshold);
  facts:=facts||jsonb_build_array(grade);
  IF best IS NULL OR p_component->>'retake_policy'='latest_completed'
   OR attempt_row.score::numeric*(best->>'max_score')::numeric>(best->>'score')::numeric*attempt_row.max_score::numeric
   OR (attempt_row.score::numeric*(best->>'max_score')::numeric=(best->>'score')::numeric*attempt_row.max_score::numeric AND (attempt_row.completed_at,attempt_row.id)>((best->>'completed_at')::timestamptz,(best->>'attempt_id')::uuid)) THEN best:=grade;END IF;
 END LOOP;
 IF reason IS NOT NULL THEN best:=NULL;
 ELSIF best IS NULL THEN
  reason:=CASE WHEN EXISTS(SELECT 1 FROM public.test_attempts WHERE user_id=p_state.user_id AND lesson_id=(p_component->>'lesson_id')::uuid) THEN 'LEGACY_ATTEMPT_UNBOUND' WHEN (sessions->>'count')::integer>0 THEN 'ASSESSMENT_IN_PROGRESS' ELSE 'ASSESSMENT_NOT_STARTED' END;
 ELSE
  passed:=CASE WHEN r->>'kind'='session_pass' THEN (best->>'original_passed')::boolean
   WHEN r->>'rounding'='nearest_integer_half_up' THEN floor((best->>'score')::numeric*100/(best->>'max_score')::numeric+0.5)*100>=(r->>'threshold_basis_points')::integer
   ELSE (best->>'score')::numeric*10000>=(r->>'threshold_basis_points')::numeric*(best->>'max_score')::numeric END;
  reason:=CASE WHEN passed THEN 'CRITERIA_SATISFIED' ELSE 'CRITERIA_NOT_SATISFIED' END;
 END IF;
 RETURN jsonb_build_object('component_id',p_component->'component_id','kind','test','status',CASE WHEN best IS NOT NULL THEN CASE WHEN passed THEN 'satisfied' ELSE 'not_satisfied' END WHEN reason IN('ASSESSMENT_IN_PROGRESS','ASSESSMENT_NOT_STARTED') THEN 'not_started' ELSE 'unknown' END,
  'reason_code',reason,'original_grade',best,'selected_source_hash',public.uc_program_hash(jsonb_build_object('selected',best,'actual_completed_facts',facts,'sessions',sessions)),
  'provenance',CASE WHEN best IS NOT NULL THEN 'bound_context' ELSE 'unavailable' END);
END;$fn$;
CREATE FUNCTION public.uc_learning_evaluate(p_state public.uc_learning_outcome_states) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.uc_learning_criteria_versions;x jsonb;part jsonb;parts jsonb:='[]';pinned jsonb;current_ids jsonb;progress jsonb;n integer;done integer;eligibility text;technical jsonb;proof jsonb;input jsonb;BEGIN
 SELECT * INTO c FROM public.uc_learning_criteria_versions WHERE id=p_state.criteria_id;
 proof:=public.uc_learning_programme_proof(p_state.organization_id,p_state.program_version_id);
 SELECT jsonb_build_object('status',e.status,'progress',coalesce(e.progress,0),'manual_credited_at',(SELECT credited_at FROM public.course_manual_credits WHERE enrollment_id=e.id AND revoked_at IS NULL ORDER BY credited_at DESC,id DESC LIMIT 1)) INTO technical FROM public.enrollments e WHERE e.id=p_state.enrollment_id AND e.user_id=p_state.user_id AND e.course_id=p_state.course_id;
 IF c.id IS NULL OR c.state<>'approved' OR c.redacted OR proof IS DISTINCT FROM c.programme_proof THEN
  eligibility:='unknown';
 ELSE
  FOR x IN SELECT value FROM jsonb_array_elements(jsonb_build_array(c.definition->'main')||(c.definition->'requirements')) LOOP
   IF x->>'kind'='test' THEN part:=public.uc_learning_test_component(p_state,x);
   ELSIF x->>'kind'='module_completion' THEN
    SELECT value INTO pinned FROM jsonb_array_elements(c.module_snapshots) WHERE value->'component_id'=x->'component_id';
    SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') INTO current_ids FROM public.lessons WHERE course_id=p_state.course_id AND module_id=(x->>'module_id')::uuid;
    IF pinned IS NULL OR pinned->'lesson_ids' IS DISTINCT FROM current_ids OR NOT EXISTS(SELECT 1 FROM public.course_modules WHERE id=(x->>'module_id')::uuid AND course_id=p_state.course_id) THEN
     part:=jsonb_build_object('status','unknown','reason_code','MODULE_CONTENT_CHANGED','selected_source_hash',public.uc_program_hash(jsonb_build_object('pinned',pinned,'current',current_ids)));
    ELSE
     SELECT count(*)::integer,count(*) FILTER(WHERE lp.completed IS TRUE)::integer,coalesce(jsonb_agg(jsonb_build_object('lesson_id',l.id,'progress',to_jsonb(lp)) ORDER BY l.id),'[]') INTO n,done,progress
     FROM public.lessons l LEFT JOIN public.lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=p_state.user_id WHERE l.id IN(SELECT value::text::uuid FROM jsonb_array_elements_text(pinned->'lesson_ids'));
     part:=jsonb_build_object('status',CASE WHEN n>0 AND n=done THEN 'satisfied' ELSE 'not_started' END,'reason_code',CASE WHEN n>0 AND n=done THEN 'CURRENT_MODULE_CONDITION_OBSERVED' ELSE 'MODULE_INCOMPLETE' END,'selected_source_hash',public.uc_program_hash(jsonb_build_object('pinned',pinned,'observed_progress',progress)));
    END IF;
    part:=part||jsonb_build_object('component_id',x->'component_id','kind','module_completion','original_grade',NULL,'provenance','current_condition_observed');
   ELSE part:=jsonb_build_object('component_id',x->'component_id','kind','human_assessment','status','unknown','reason_code','HUMAN_ASSESSMENT_REQUIRED','original_grade',NULL,'selected_source_hash',NULL,'provenance','unavailable');
   END IF;
   parts:=parts||jsonb_build_array(part);
  END LOOP;
  eligibility:=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(parts) AS elem(value) WHERE elem.value->>'status'='unknown') THEN 'unknown' WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(parts) AS elem(value) WHERE elem.value->>'status'='not_started') THEN 'incomplete' WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(parts) AS elem(value) WHERE elem.value->>'status'='not_satisfied') THEN 'not_eligible' ELSE 'eligible' END;
 END IF;
 input:=jsonb_build_object('criteria_ref',public.uc_learning_criteria_ref(c),'programme_proof',proof,'components',parts,'technical_observation',technical,'criteria_redacted',coalesce(c.redacted,true));
 RETURN jsonb_build_object('eligibility',eligibility,'components',parts,'technical_observation',technical,'input_hash',public.uc_program_hash(input));
END;$fn$;
CREATE FUNCTION public.uc_learning_access(p_org uuid,p_scope jsonb,p_write boolean DEFAULT false) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE u uuid:=auth.uid();BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.uc_learning_person(u) OR NOT public.account_deletion_access_allowed() OR NOT public.uc_learning_scope_valid(p_org,p_scope) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 IF NOT p_write AND u=(p_scope->>'user_id')::uuid THEN
  IF NOT coalesce(public.can_access_course_as_learner((p_scope->>'course_id')::uuid),false) OR NOT coalesce(public._paid_20260922_course_read((p_scope->>'course_id')::uuid,true),false) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  RETURN 'learner';
 END IF;
 IF u=(p_scope->>'user_id')::uuid OR NOT public.uc_learning_staff(u,p_org,(p_scope->>'group_id')::uuid,p_write) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 RETURN 'staff';
END;$fn$;
CREATE FUNCTION public.uc_learning_programme_proof(p_org uuid,p_version uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('program_id',v.program_id,'program_version_id',v.id,'facts_hash',v.facts_hash,'file_document_id',v.file_document_id,'file_version_id',v.file_version_id,'file_review_id',v.file_review_id)
 FROM public.program_fact_versions v WHERE v.organization_id=p_org AND v.id=p_version AND v.state='approved'
 AND public.uc_program_file_proof(p_org,v.file_version_id)
$fn$;
CREATE FUNCTION public.uc_learning_criteria_ref(p public.uc_learning_criteria_versions) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('id',p.id,'revision',p.revision,'content_hash',p.content_hash,'approved_at',p.approved_at)
$fn$;
CREATE FUNCTION public.uc_learning_try_people(p_ids uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE u uuid;BEGIN
 FOR u IN SELECT DISTINCT x FROM unnest(p_ids)x WHERE x IS NOT NULL ORDER BY x LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(u::text,42007)) THEN PERFORM public.uc_learning_error('REVISION_CONFLICT');END IF;
  IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=u) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 END LOOP;
END;$fn$;

CREATE FUNCTION public.apply_learning_outcome_action(p_organization_id uuid,p_request_id uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid:=auth.uid();action text:=p_command->>'action';expected bigint;course uuid;version uuid;draft uuid;scope jsonb;scope_hash text;payload_hash text;people uuid[];
 c public.uc_learning_criteria_versions;s public.uc_learning_outcome_states;m public.uc_learning_machine_results;d public.uc_learning_attestation_decisions;oldreq public.uc_learning_outcome_requests;
 proof jsonb;modules jsonb;criteria_definition jsonb;live jsonb;current jsonb;receipt jsonb;event_id uuid;nextrev bigint;source_proof jsonb:='{}';required_ids jsonb;authority jsonb;decision_id uuid;BEGIN
 IF actor IS NULL OR p_organization_id IS NULL OR p_request_id IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.uc_learning_person(actor) OR NOT public.account_deletion_access_allowed() THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR octet_length(p_command::text)>65536 OR NOT coalesce(action IN('save_criteria_version','approve_criteria_version','capture_machine_result','record_attestation_decision','supersede_decision'),false) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
 IF jsonb_typeof(p_command->'expected_revision') IS DISTINCT FROM 'number' OR coalesce(p_command->>'expected_revision','')!~'^(0|[1-9][0-9]{0,15})$' OR(p_command->>'expected_revision')::numeric>9007199254740990 THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
 expected:=(p_command->>'expected_revision')::bigint;payload_hash:=public.uc_program_hash(p_command);
 IF action='save_criteria_version' THEN
  IF NOT public.uc_learning_shape(p_command,ARRAY['action','course_id','program_version_id','draft_id','expected_revision','definition','reason']) OR NOT public.uc_learning_uuid(p_command->'course_id') OR NOT public.uc_learning_uuid(p_command->'program_version_id') OR NOT(p_command->'draft_id'='null'::jsonb OR public.uc_learning_uuid(p_command->'draft_id')) OR NOT public.uc_learning_text(p_command->'reason',2000) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  course:=(p_command->>'course_id')::uuid;version:=(p_command->>'program_version_id')::uuid;draft:=(p_command->>'draft_id')::uuid;
 ELSIF action='approve_criteria_version' THEN
  IF NOT public.uc_learning_shape(p_command,ARRAY['action','version_id','expected_revision','expected_content_hash','reason']) OR NOT public.uc_learning_uuid(p_command->'version_id') OR coalesce(p_command->>'expected_content_hash','')!~'^[a-f0-9]{64}$' OR NOT public.uc_learning_text(p_command->'reason',2000) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  draft:=(p_command->>'version_id')::uuid;SELECT * INTO c FROM public.uc_learning_criteria_versions WHERE id=draft AND organization_id=p_organization_id;course:=c.course_id;version:=c.program_version_id;
 ELSE
  scope:=p_command->'scope';PERFORM public.uc_learning_access(p_organization_id,scope,action<>'capture_machine_result');
  IF action='capture_machine_result' THEN
   IF NOT public.uc_learning_shape(p_command,ARRAY['action','scope','expected_revision','expected_criteria_ref','reason']) OR NOT public.uc_learning_text(p_command->'reason',2000) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  ELSE
   IF NOT public.uc_learning_shape(p_command,ARRAY['action','scope','expected_revision','criteria_ref','machine_result_id','expected_machine_input_hash','expected_decision_id','outcome','basis','staff_reason','learner_summary','reviewed_current_component_ids','recognized_component_ids','recognition_file_version_id'])
   OR NOT public.uc_learning_uuid(p_command->'machine_result_id') OR coalesce(p_command->>'expected_machine_input_hash','')!~'^[a-f0-9]{64}$'
   OR NOT(p_command->'expected_decision_id'='null'::jsonb OR public.uc_learning_uuid(p_command->'expected_decision_id'))
   OR NOT coalesce(p_command->>'outcome' IN('passed','not_passed','deferred'),false) OR NOT coalesce(p_command->>'basis' IN('machine','recognition'),false)
   OR NOT public.uc_learning_text(p_command->'staff_reason',2000) OR NOT public.uc_learning_text(p_command->'learner_summary',1000)
   OR NOT public.uc_learning_ids(p_command->'reviewed_current_component_ids',0,20) OR NOT public.uc_learning_ids(p_command->'recognized_component_ids',0,20)
   OR NOT(p_command->'recognition_file_version_id'='null'::jsonb OR public.uc_learning_uuid(p_command->'recognition_file_version_id')) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  END IF;
 END IF;
 IF action IN('save_criteria_version','approve_criteria_version') THEN
  IF NOT public.uc_learning_staff(actor,p_organization_id,NULL,true) OR NOT EXISTS(SELECT 1 FROM public.courses WHERE id=course AND organization_id=p_organization_id) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  scope_hash:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'course_id',course,'program_version_id',version));
  criteria_definition:=CASE WHEN action='save_criteria_version' THEN p_command->'definition' ELSE c.definition END;
  PERFORM public.uc_learning_validate_criteria(p_organization_id,course,criteria_definition,false);
  SELECT array_agg(DISTINCT x) INTO people FROM(SELECT actor x UNION SELECT(c.definition->>'reviewer_id')::uuid UNION SELECT(criteria_definition->>'reviewer_id')::uuid UNION SELECT value::text::uuid FROM jsonb_array_elements_text(criteria_definition->'eligible_decider_ids'))q WHERE x IS NOT NULL;
 ELSE scope_hash:=public.uc_program_hash(scope);people:=ARRAY[actor,(scope->>'user_id')::uuid];END IF;
 PERFORM public.uc_learning_try_people(people);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc014_request:'||actor::text||':'||p_request_id::text,0)) OR NOT pg_try_advisory_xact_lock(hashtextextended('uc014_scope:'||scope_hash,0)) THEN PERFORM public.uc_learning_error('REVISION_CONFLICT');END IF;
 -- Replay still checks current role, exact tenant/scope, source and assignment.
 SELECT * INTO oldreq FROM public.uc_learning_outcome_requests WHERE actor_id=actor AND request_id=p_request_id;
 IF FOUND THEN
  IF oldreq.organization_id IS DISTINCT FROM p_organization_id OR oldreq.payload_hash<>payload_hash OR oldreq.action<>action THEN PERFORM public.uc_learning_error('REQUEST_CONFLICT');END IF;
  IF action IN('save_criteria_version','approve_criteria_version') THEN
   SELECT * INTO c FROM public.uc_learning_criteria_versions WHERE id=(oldreq.receipt->>'event_id')::uuid;
   IF c.redacted OR c.programme_proof IS DISTINCT FROM public.uc_learning_programme_proof(p_organization_id,c.program_version_id) OR(action='approve_criteria_version' AND c.reviewer_id IS DISTINCT FROM actor) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
   current:=public.read_learning_outcome(p_organization_id,jsonb_build_object('kind','criteria','course_id',course,'program_version_id',version));
  ELSE
   current:=public.uc_learning_envelope(p_organization_id,scope);
   IF action='capture_machine_result' AND NOT coalesce((current->'capabilities'->>'can_capture')::boolean,false) THEN PERFORM public.uc_learning_error('SOURCE_UNAVAILABLE');END IF;
   IF action<>'capture_machine_result' AND NOT coalesce((current->'capabilities'->>'can_decide')::boolean,false) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
   IF action<>'capture_machine_result' AND p_command->>'basis'='recognition' THEN
    SELECT * INTO d FROM public.uc_learning_attestation_decisions WHERE id=(oldreq.receipt->>'event_id')::uuid AND organization_id=p_organization_id AND user_id=(scope->>'user_id')::uuid;
    IF NOT coalesce(public.uc_document_action_allowed(p_organization_id,'read',NULL,NULL),false) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
    IF d.id IS NULL OR d.redacted OR d.source_proof->'recognition_proof' IS NULL OR d.source_proof->'recognition_proof' IS DISTINCT FROM public.uc_learning_recognition_proof(p_organization_id,(p_command->>'recognition_file_version_id')::uuid) THEN PERFORM public.uc_learning_error('SOURCE_CHANGED');END IF;
   END IF;
  END IF;
  RETURN jsonb_build_object('schema_version',1,'receipt',oldreq.receipt||jsonb_build_object('replayed',true),'current',current);
 END IF;
 IF action='save_criteria_version' THEN
  proof:=public.uc_learning_programme_proof(p_organization_id,version);
  IF proof IS NULL OR NOT(EXISTS(SELECT 1 FROM public.course_program_bindings WHERE organization_id=p_organization_id AND course_id=course AND version_id=version) OR EXISTS(SELECT 1 FROM public.group_program_bindings WHERE organization_id=p_organization_id AND course_id=course AND version_id=version)) THEN PERFORM public.uc_learning_error('SOURCE_UNAVAILABLE');END IF;
  IF draft IS NULL THEN
   IF expected<>0 THEN PERFORM public.uc_learning_error('REVISION_CONFLICT');END IF;
   INSERT INTO public.uc_learning_criteria_versions(organization_id,course_id,program_version_id,revision,state,definition,programme_proof,content_hash,created_by,reviewer_id,participant_ids)
   VALUES(p_organization_id,course,version,1,'draft',criteria_definition,proof,public.uc_program_hash(jsonb_build_object('definition',criteria_definition,'programme_proof',proof,'modules','[]'::jsonb)),actor,(criteria_definition->>'reviewer_id')::uuid,people) RETURNING * INTO c;
  ELSE
   SELECT * INTO c FROM public.uc_learning_criteria_versions WHERE id=draft AND organization_id=p_organization_id AND course_id=course AND program_version_id=version FOR UPDATE NOWAIT;
   IF c.id IS NULL OR c.created_by IS DISTINCT FROM actor OR c.state<>'draft' OR c.redacted THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
   IF c.revision<>expected THEN PERFORM public.uc_learning_error('REVISION_CONFLICT');END IF;
   UPDATE public.uc_learning_criteria_versions SET definition=criteria_definition,programme_proof=proof,content_hash=public.uc_program_hash(jsonb_build_object('definition',criteria_definition,'programme_proof',proof,'modules','[]'::jsonb)),reviewer_id=(criteria_definition->>'reviewer_id')::uuid,revision=revision+1,participant_ids=people WHERE id=c.id RETURNING * INTO c;
  END IF;
  event_id:=c.id;nextrev:=c.revision;
 ELSIF action='approve_criteria_version' THEN
  SELECT * INTO c FROM public.uc_learning_criteria_versions WHERE id=draft AND organization_id=p_organization_id FOR UPDATE NOWAIT;
  IF c.id IS NULL OR c.state<>'draft' OR c.redacted OR c.reviewer_id IS DISTINCT FROM actor OR((c.definition->>'independent_review_required')::boolean AND c.created_by=actor) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  IF c.revision<>expected OR c.content_hash<>p_command->>'expected_content_hash' THEN PERFORM public.uc_learning_error('REVISION_CONFLICT');END IF;
  proof:=public.uc_learning_programme_proof(p_organization_id,c.program_version_id);IF proof IS NULL OR proof IS DISTINCT FROM c.programme_proof THEN PERFORM public.uc_learning_error('SOURCE_CHANGED');END IF;
  modules:=public.uc_learning_validate_criteria(p_organization_id,c.course_id,c.definition,true);
  UPDATE public.uc_learning_criteria_versions v SET state='approved',approved_at=clock_timestamp(),approved_by=actor,revision=v.revision+1,module_snapshots=modules,content_hash=public.uc_program_hash(jsonb_build_object('definition',v.definition,'programme_proof',v.programme_proof,'modules',modules)) WHERE v.id=c.id RETURNING * INTO c;
  event_id:=c.id;nextrev:=c.revision;
 ELSE
  PERFORM public.uc_learning_access(p_organization_id,scope,action<>'capture_machine_result');
  SELECT * INTO s FROM public.uc_learning_outcome_states WHERE program_enrollment_snapshot_id=(scope->>'program_enrollment_snapshot_id')::uuid FOR UPDATE NOWAIT;
  IF s.id IS NULL THEN
   -- A new human-only assessment has no test session to observe. An explicit
   -- currently authorized staff capture starts its prospective unknown context.
   IF action<>'capture_machine_result' OR expected<>0 OR NOT public.uc_learning_staff(actor,p_organization_id,(scope->>'group_id')::uuid,true) THEN PERFORM public.uc_learning_error('PREREQUISITE_MISSING');END IF;
   SELECT * INTO c FROM public.uc_learning_criteria_versions v WHERE v.organization_id=p_organization_id AND v.course_id=(scope->>'course_id')::uuid AND v.program_version_id=(scope->>'program_version_id')::uuid AND v.state='approved' AND NOT v.redacted ORDER BY v.approved_at DESC,v.id DESC LIMIT 1;
   IF c.id IS NULL OR c.definition->'main'->>'kind' IS DISTINCT FROM 'human_assessment' OR public.uc_learning_criteria_ref(c) IS DISTINCT FROM p_command->'expected_criteria_ref' OR c.programme_proof IS DISTINCT FROM public.uc_learning_programme_proof(p_organization_id,c.program_version_id) THEN PERFORM public.uc_learning_error('SOURCE_CHANGED');END IF;
   INSERT INTO public.uc_learning_outcome_states(organization_id,group_id,user_id,course_id,enrollment_id,program_enrollment_snapshot_id,program_version_id,criteria_id)
   VALUES(p_organization_id,(scope->>'group_id')::uuid,(scope->>'user_id')::uuid,(scope->>'course_id')::uuid,(scope->>'enrollment_id')::uuid,(scope->>'program_enrollment_snapshot_id')::uuid,c.program_version_id,c.id) RETURNING * INTO s;
  ELSE SELECT * INTO c FROM public.uc_learning_criteria_versions WHERE id=s.criteria_id;END IF;
  IF s.revision<>expected THEN PERFORM public.uc_learning_error('REVISION_CONFLICT');END IF;
  IF c.id IS NULL OR c.redacted OR c.programme_proof IS DISTINCT FROM public.uc_learning_programme_proof(p_organization_id,c.program_version_id) OR public.uc_learning_criteria_ref(c) IS DISTINCT FROM(CASE WHEN action='capture_machine_result' THEN p_command->'expected_criteria_ref' ELSE p_command->'criteria_ref' END) THEN PERFORM public.uc_learning_error('SOURCE_CHANGED');END IF;
  nextrev:=s.revision+1;live:=public.uc_learning_evaluate(s);
  IF action='capture_machine_result' THEN
   INSERT INTO public.uc_learning_machine_results(state_id,organization_id,user_id,revision_created,criteria_ref,input_hash,evaluation) VALUES(s.id,p_organization_id,s.user_id,nextrev,public.uc_learning_criteria_ref(c),live->>'input_hash',live) RETURNING id INTO event_id;
   UPDATE public.uc_learning_outcome_states SET revision=nextrev,machine_id=event_id WHERE id=s.id;
  ELSE
   IF actor=s.user_id OR NOT c.definition->'eligible_decider_ids' ? actor::text THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
   SELECT * INTO m FROM public.uc_learning_machine_results WHERE id=s.machine_id AND state_id=s.id;
   IF m.id IS NULL OR m.id IS DISTINCT FROM(p_command->>'machine_result_id')::uuid OR m.input_hash IS DISTINCT FROM p_command->>'expected_machine_input_hash' OR m.input_hash IS DISTINCT FROM live->>'input_hash' OR c.programme_proof IS DISTINCT FROM public.uc_learning_programme_proof(p_organization_id,s.program_version_id) THEN PERFORM public.uc_learning_error('SOURCE_CHANGED');END IF;
   decision_id:=(p_command->>'expected_decision_id')::uuid;
   IF s.decision_id IS DISTINCT FROM decision_id OR(action='record_attestation_decision' AND decision_id IS NOT NULL) OR(action='supersede_decision' AND decision_id IS NULL) THEN PERFORM public.uc_learning_error('REVISION_CONFLICT');END IF;
   IF p_command->>'basis'='machine' THEN
    IF p_command->'recognition_file_version_id'<>'null'::jsonb OR jsonb_array_length(p_command->'recognized_component_ids')<>0 THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
    IF p_command->>'outcome'='passed' AND live->>'eligibility'<>'eligible' OR p_command->>'outcome'='not_passed' AND live->>'eligibility'<>'not_eligible' THEN PERFORM public.uc_learning_error('PREREQUISITE_MISSING');END IF;
    SELECT coalesce(jsonb_agg(x->'component_id' ORDER BY x->>'component_id'),'[]') INTO required_ids FROM jsonb_array_elements(live->'components')x WHERE x->>'provenance'='current_condition_observed';
    IF p_command->>'outcome'='passed' AND required_ids IS DISTINCT FROM(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x),'[]') FROM jsonb_array_elements_text(p_command->'reviewed_current_component_ids')x) THEN PERFORM public.uc_learning_error('PREREQUISITE_MISSING');END IF;
   ELSE
    IF NOT coalesce(public.uc_document_action_allowed(p_organization_id,'read',NULL,NULL),false) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
    IF NOT c.definition->'recognition_file_version_ids' ?(p_command->>'recognition_file_version_id') OR NOT public.uc_program_active_file_proof(p_organization_id,(p_command->>'recognition_file_version_id')::uuid) OR jsonb_array_length(p_command->'recognized_component_ids')=0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_command->'recognized_component_ids')x WHERE NOT(c.definition->'recognition_component_ids' ? x)) THEN PERFORM public.uc_learning_error('PREREQUISITE_MISSING');END IF;
    IF p_command->>'outcome'='passed' AND EXISTS(SELECT 1 FROM jsonb_array_elements(live->'components')x WHERE x->>'status'<>'satisfied' AND NOT(p_command->'recognized_component_ids' ?(x->>'component_id'))) THEN PERFORM public.uc_learning_error('PREREQUISITE_MISSING');END IF;
    source_proof:=jsonb_build_object('recognition_file_version_id',p_command->'recognition_file_version_id','recognition_proof',public.uc_learning_recognition_proof(p_organization_id,(p_command->>'recognition_file_version_id')::uuid),'recognized_component_ids',p_command->'recognized_component_ids');
   END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_command->'reviewed_current_component_ids')r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(live->'components')v WHERE v->>'component_id'=r AND v->>'provenance'='current_condition_observed')) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
   IF p_command->>'outcome'='passed' AND EXISTS(SELECT 1 FROM jsonb_array_elements(live->'components')v WHERE v->>'provenance'='current_condition_observed' AND NOT(p_command->'recognized_component_ids' ?(v->>'component_id')) AND NOT(p_command->'reviewed_current_component_ids' ?(v->>'component_id'))) THEN PERFORM public.uc_learning_error('PREREQUISITE_MISSING');END IF;
   authority:=jsonb_build_object('actor_id',actor,'scope',scope,'checked_at',clock_timestamp(),'both_writes',true,'eligible_decider',true,'criteria_ref',public.uc_learning_criteria_ref(c));
   INSERT INTO public.uc_learning_attestation_decisions(state_id,organization_id,user_id,revision_created,criteria_id,machine_result_id,machine_input_hash,outcome,basis,staff_reason,learner_summary,actor_id,authority_snapshot,source_proof,supersedes_id,participant_ids)
   VALUES(s.id,p_organization_id,s.user_id,nextrev,c.id,m.id,m.input_hash,p_command->>'outcome',p_command->>'basis',p_command->>'staff_reason',p_command->>'learner_summary',actor,authority,source_proof||jsonb_build_object('reviewed_current_component_ids',p_command->'reviewed_current_component_ids'),decision_id,ARRAY[actor,s.user_id]) RETURNING id INTO event_id;
   UPDATE public.uc_learning_outcome_states SET revision=nextrev,decision_id=event_id WHERE id=s.id;
  END IF;
 END IF;
 receipt:=jsonb_build_object('request_id',p_request_id,'action',action,'scope_hash',scope_hash,'applied_revision',nextrev,'event_id',event_id,'input_hash',payload_hash,'replayed',false);
 INSERT INTO public.uc_learning_outcome_requests(actor_id,request_id,organization_id,user_id,state_id,action,payload_hash,receipt,participant_ids) VALUES(actor,p_request_id,p_organization_id,s.user_id,s.id,action,payload_hash,receipt,coalesce(people,ARRAY[actor]));
 current:=CASE WHEN action IN('save_criteria_version','approve_criteria_version') THEN public.read_learning_outcome(p_organization_id,jsonb_build_object('kind','criteria','course_id',course,'program_version_id',version)) ELSE public.uc_learning_envelope(p_organization_id,scope) END;
 RETURN jsonb_build_object('schema_version',1,'receipt',receipt,'current',current);
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_learning_error('REVISION_CONFLICT');END;$fn$;

CREATE FUNCTION public.uc_learning_recognition_proof(p_org uuid,p_file uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('file_version_id',v.id,'document_id',v.document_id,'review_id',r.id,'metadata_hash',public.uc_program_hash(jsonb_build_object('storage_object_id',v.storage_object_id,'storage_metadata',v.storage_metadata)))
 FROM public.org_document_versions v JOIN LATERAL(SELECT x.id FROM public.org_document_reviews x WHERE x.organization_id=v.organization_id AND x.version_id=v.id AND x.document_id=v.document_id AND x.state='approved' ORDER BY x.approved_at DESC,x.id DESC LIMIT 1)r ON true
 WHERE v.id=p_file AND v.organization_id=p_org AND public.uc_program_active_file_proof(p_org,v.id)
$fn$;
CREATE FUNCTION public.uc_learning_options(p_org uuid,p_query jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE course uuid;version uuid;lessons jsonb;modules jsonb;humans jsonb;files jsonb;eligible uuid[];scope jsonb;envelope jsonb;c public.uc_learning_criteria_versions;BEGIN
 IF p_query->>'kind'='decision_options' THEN
  IF NOT public.uc_learning_shape(p_query,ARRAY['kind','scope']) THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
  scope:=p_query->'scope';PERFORM public.uc_learning_access(p_org,scope,true);envelope:=public.uc_learning_envelope(p_org,scope);
  IF NOT coalesce((envelope->'capabilities'->>'can_decide')::boolean,false) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  SELECT * INTO c FROM public.uc_learning_criteria_versions WHERE id=(envelope->'criteria_ref'->>'id')::uuid AND NOT redacted;
  IF EXISTS(SELECT 1 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id WHERE v.organization_id=p_org AND c.definition->'recognition_file_version_ids' ? v.id::text AND public.uc_program_active_file_proof(p_org,v.id) AND public.uc_document_action_allowed(p_org,'read',NULL,NULL) AND length(d.name)>1000) THEN PERFORM public.uc_learning_error('LIMIT_EXCEEDED');END IF;
  IF EXISTS(SELECT 1 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id WHERE v.organization_id=p_org AND c.definition->'recognition_file_version_ids' ? v.id::text AND public.uc_program_active_file_proof(p_org,v.id) AND public.uc_document_action_allowed(p_org,'read',NULL,NULL) AND(d.name IS NULL OR d.name!~'[^[:space:]]')) THEN PERFORM public.uc_learning_error('SOURCE_UNAVAILABLE');END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('version_id',v.id,'document_name',d.name) ORDER BY v.id),'[]') INTO files FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id
   WHERE v.organization_id=p_org AND c.definition->'recognition_file_version_ids' ? v.id::text AND public.uc_program_active_file_proof(p_org,v.id) AND public.uc_document_action_allowed(p_org,'read',NULL,NULL);
  RETURN jsonb_build_object('schema_version',1,'scope',scope,'allowed_component_ids',c.definition->'recognition_component_ids','files',files);
 END IF;
 IF NOT public.uc_learning_shape(p_query,ARRAY['kind','course_id','program_version_id']) OR NOT public.uc_learning_uuid(p_query->'course_id') OR NOT public.uc_learning_uuid(p_query->'program_version_id') THEN PERFORM public.uc_learning_error('INVALID_INPUT');END IF;
 IF NOT public.uc_learning_staff(auth.uid(),p_org,NULL,true) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 course:=(p_query->>'course_id')::uuid;version:=(p_query->>'program_version_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=course AND organization_id=p_org) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 IF public.uc_learning_programme_proof(p_org,version) IS NULL THEN PERFORM public.uc_learning_error('SOURCE_UNAVAILABLE');END IF;
 IF(SELECT count(*) FROM public.lessons WHERE course_id=course)>500 OR(SELECT count(*) FROM public.course_modules WHERE course_id=course)>250 THEN PERFORM public.uc_learning_error('LIMIT_EXCEEDED');END IF;
 IF EXISTS(SELECT 1 FROM public.lessons WHERE course_id=course AND(length(title)>1000 OR length(type)>80)) OR EXISTS(SELECT 1 FROM public.course_modules WHERE course_id=course AND length(title)>1000) THEN PERFORM public.uc_learning_error('LIMIT_EXCEEDED');END IF;
 IF EXISTS(SELECT 1 FROM public.lessons WHERE course_id=course AND(title IS NULL OR title!~'[^[:space:]]' OR type IS NULL OR type!~'[^[:space:]]')) OR EXISTS(SELECT 1 FROM public.course_modules WHERE course_id=course AND(title IS NULL OR title!~'[^[:space:]]')) THEN PERFORM public.uc_learning_error('SOURCE_UNAVAILABLE');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'type',l.type,'module_id',l.module_id) ORDER BY l.order_index,l.id),'[]') INTO lessons FROM public.lessons l WHERE l.course_id=course;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title) ORDER BY m.id),'[]') INTO modules FROM public.course_modules m WHERE m.course_id=course;
 SELECT array_agg(DISTINCT q.user_id ORDER BY q.user_id) INTO eligible FROM(SELECT user_id FROM public.profiles WHERE organization_id=p_org UNION SELECT user_id FROM public.org_staff WHERE organization_id=p_org)q
  WHERE public.uc_learning_staff(q.user_id,p_org,NULL,true) OR EXISTS(SELECT 1 FROM public.student_groups g WHERE g.organization_id=p_org AND g.course_id=course AND public.uc_learning_staff(q.user_id,p_org,g.id,true));
 IF coalesce(cardinality(eligible),0)>250 THEN PERFORM public.uc_learning_error('LIMIT_EXCEEDED');END IF;
 IF EXISTS(SELECT 1 FROM unnest(coalesce(eligible,'{}'::uuid[]))u WHERE length(public.uc_org_document_review_actor_name(p_org,u))>500) THEN PERFORM public.uc_learning_error('LIMIT_EXCEEDED');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',q.user_id,'display_name',public.uc_org_document_review_actor_name(p_org,q.user_id),'can_review',public.uc_learning_staff(q.user_id,p_org,NULL,true),'can_decide',true) ORDER BY q.user_id),'[]') INTO humans FROM unnest(coalesce(eligible,'{}'::uuid[]))q(user_id);
 IF(SELECT count(*) FROM public.org_document_versions v WHERE v.organization_id=p_org AND public.uc_program_active_file_proof(p_org,v.id))>250 THEN PERFORM public.uc_learning_error('LIMIT_EXCEEDED');END IF;
 IF EXISTS(SELECT 1 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id WHERE v.organization_id=p_org AND public.uc_program_active_file_proof(p_org,v.id) AND length(d.name)>1000) THEN PERFORM public.uc_learning_error('LIMIT_EXCEEDED');END IF;
 IF EXISTS(SELECT 1 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id WHERE v.organization_id=p_org AND public.uc_program_active_file_proof(p_org,v.id) AND(d.name IS NULL OR d.name!~'[^[:space:]]')) THEN PERFORM public.uc_learning_error('SOURCE_UNAVAILABLE');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('version_id',v.id,'document_name',d.name) ORDER BY v.id),'[]') INTO files FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id WHERE v.organization_id=p_org AND public.uc_program_active_file_proof(p_org,v.id);
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_org,'course_id',course,'program_version_id',version,'lessons',lessons,'modules',modules,'humans',humans,'files',files);
END;$fn$;

CREATE FUNCTION public.uc_learning_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE erased uuid;ids uuid[];j jsonb;BEGIN
 erased:=nullif(current_setting('sintagma.account_deletion_erase_user',true),'')::uuid;
 IF TG_OP<>'INSERT' AND erased IS NOT NULL AND auth.role()='service_role' AND(to_jsonb(OLD)->>'user_id'=erased::text OR coalesce(to_jsonb(OLD)->'participant_ids','[]') ? erased::text) THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END IF;
 IF TG_OP='DELETE' THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='uc_learning_outcome_states' THEN
   IF(to_jsonb(OLD)-ARRAY['revision','machine_id','decision_id']) IS DISTINCT FROM(to_jsonb(NEW)-ARRAY['revision','machine_id','decision_id']) OR NEW.revision<>OLD.revision+1 THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  ELSIF TG_TABLE_NAME='uc_learning_criteria_versions' THEN
   IF OLD.state<>'draft' OR OLD.redacted OR NEW.revision<>OLD.revision+1 OR(to_jsonb(OLD)-ARRAY['revision','definition','module_snapshots','programme_proof','content_hash','reviewer_id','participant_ids','state','approved_at','approved_by']) IS DISTINCT FROM(to_jsonb(NEW)-ARRAY['revision','definition','module_snapshots','programme_proof','content_hash','reviewer_id','participant_ids','state','approved_at','approved_by']) OR(NEW.state='approved' AND NEW.definition IS DISTINCT FROM OLD.definition) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
  ELSE PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 END IF;
 j:=to_jsonb(NEW);SELECT array_agg(DISTINCT x::uuid ORDER BY x::uuid) INTO ids FROM(SELECT j->>'user_id' x UNION SELECT value FROM jsonb_array_elements_text(coalesce(j->'participant_ids','[]')))q WHERE x IS NOT NULL;
 PERFORM public.uc_learning_try_people(coalesce(ids,'{}'::uuid[]));RETURN NEW;
END;$fn$;
DO $guards$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['uc_learning_criteria_versions','uc_learning_outcome_states','uc_learning_attempt_contexts','uc_learning_machine_results','uc_learning_attestation_decisions','uc_learning_outcome_requests'] LOOP
 EXECUTE format('CREATE TRIGGER uc_learning_private_history BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_learning_guard()',t);
END LOOP;END;$guards$;

CREATE FUNCTION public.uc_learning_personal_counts(p_user uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE result jsonb:='[]';t text;n bigint;BEGIN
 FOREACH t IN ARRAY ARRAY['uc_learning_criteria_versions','uc_learning_attestation_decisions','uc_learning_outcome_requests'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE participant_ids @> ARRAY[$1]::uuid[]',t) INTO n USING p_user;
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table',t,'column','participant_ids','count',n));END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['uc_learning_outcome_states','uc_learning_attempt_contexts','uc_learning_machine_results'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id=$1',t) INTO n USING p_user;
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table',t,'column','user_id','count',n));END IF;
 END LOOP;RETURN result;
END;$fn$;
CREATE FUNCTION public.uc_learning_erase_user(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR current_setting('sintagma.account_deletion_erase_user',true) IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user) THEN PERFORM public.uc_learning_error('ACCESS_DENIED');END IF;
 DELETE FROM public.uc_learning_outcome_requests WHERE participant_ids @> ARRAY[p_user];
 DELETE FROM public.uc_learning_attestation_decisions WHERE user_id=p_user;
 DELETE FROM public.uc_learning_machine_results WHERE user_id=p_user;
 DELETE FROM public.uc_learning_attempt_contexts WHERE user_id=p_user;
 DELETE FROM public.uc_learning_outcome_states WHERE user_id=p_user;
 -- Approved rules remain a nonpersonal immutable reference. The erased copy is
 -- no longer usable as criteria, and no human name/text/UUID survives inside it.
 UPDATE public.uc_learning_criteria_versions SET redacted=true,definition='{}',created_by=NULL,reviewer_id=NULL,approved_by=NULL,participant_ids='{}' WHERE participant_ids @> ARRAY[p_user];
 UPDATE public.uc_learning_attestation_decisions SET redacted=true,actor_id=NULL,staff_reason='Атрибуция и личный текст удалены.',learner_summary='Сохранён итог без личного текста удалённого сотрудника.',authority_snapshot='{}',source_proof='{}',participant_ids=array_remove(participant_ids,p_user) WHERE participant_ids @> ARRAY[p_user];
 IF public.uc_learning_personal_counts(p_user)<>'[]'::jsonb THEN PERFORM public.uc_learning_error('DEPENDENCY_UNAVAILABLE');END IF;
END;$fn$;

-- Exact two known predecessors only: released115 or held116. The latter is
-- an integration pin, not a claim that UC013 was deployed/accepted. A changed
-- source requires a new reviewed migration; no broad body/metadata exemption.
-- Exact post609 privacy sequence; preserve full in-database pg_proc metadata exceptprosrc.
DO $uc014_privacy_1$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_personal_row_counts(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC014';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '52ed26a701debe2c9f9299c04b9db8bb' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC014';END IF;
 v_patched:=v_original;
 v_needle:=$uc014_privacy_1_needle_0$ RETURN result;$uc014_privacy_1_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC014';END IF;
 v_patched:=replace(v_patched,v_needle,$uc014_privacy_1_replacement_0$ result:=result||public.uc_learning_personal_counts(p_user_id);
 RETURN result;$uc014_privacy_1_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'd263532fd944bf09e2adec1f0eac9fee' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC014';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC014';END IF;
END;
$uc014_privacy_1$;

DO $uc014_privacy_2$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_snapshot(uuid)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC014';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM '7725e2a24c177164694f8266cbf344ba' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC014';END IF;
 v_patched:=v_original;
 v_needle:=$uc014_privacy_2_needle_0$ v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc014_privacy_2_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC014';END IF;
 v_patched:=replace(v_patched,v_needle,$uc014_privacy_2_replacement_0$ SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_learning_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','learning_outcomes','label','Результаты обучения и решения: личные строки удаляются, атрибуция обезличивается','count',v_count,'action','delete_or_anonymize'));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record'$uc014_privacy_2_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM 'dce5ffea181b5136a9eb82490438f962' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC014';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC014';END IF;
END;
$uc014_privacy_2$;

DO $uc014_privacy_3$
DECLARE v_oid oid;v_original text;v_patched text;v_needle text;v_metadata jsonb;v_after_metadata jsonb;v_after_definition text;
BEGIN
 v_oid:=to_regprocedure('public.account_deletion_erase_data(uuid,text)');
 IF v_oid IS NULL THEN RAISE EXCEPTION 'UC_PRIVACY_FUNCTION_MISSING:UC014';END IF;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_original,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF md5(v_original) IS DISTINCT FROM 'a10c73088117f3422b4eb2ec708dd0ad' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_PREDECESSOR:UC014';END IF;
 v_patched:=v_original;
 v_needle:=$uc014_privacy_3_needle_0$ IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u)) n WHERE (n->>'count')::bigint>0)$uc014_privacy_3_needle_0$;
 IF (length(v_patched)-length(replace(v_patched,v_needle,'')))/length(v_needle)<>1 THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_ANCHOR_COUNT:UC014';END IF;
 v_patched:=replace(v_patched,v_needle,$uc014_privacy_3_replacement_0$ PERFORM public.uc_learning_erase_user(u);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u)) n WHERE (n->>'count')::bigint>0)$uc014_privacy_3_replacement_0$);
 IF md5(v_patched) IS DISTINCT FROM '8b2de268a017d85ee99eb3acee4c87a5' THEN RAISE EXCEPTION 'UC_PRIVACY_EXACT_RESULT:UC014';END IF;
 EXECUTE v_patched;
 SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_after_definition,v_after_metadata FROM pg_proc p WHERE p.oid=v_oid;
 IF v_after_definition IS DISTINCT FROM v_patched OR v_after_metadata IS DISTINCT FROM v_metadata THEN RAISE EXCEPTION 'UC_PRIVACY_METADATA_OR_SOURCE_CHANGED:UC014';END IF;
END;
$uc014_privacy_3$;


-- Owner-only exact new functions; only two authenticated API entry points.
DO $function_acl$ DECLARE f record;g record;BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND(p.proname LIKE 'uc_learning_%' OR p.proname IN('read_learning_outcome','apply_learning_outcome_action')) LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=f.oid AND a.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s CASCADE',f.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
  EXECUTE format('GRANT ALL ON FUNCTION %s TO %I',f.signature,pg_get_userbyid(f.proowner));
 END LOOP;
END;$function_acl$;
GRANT EXECUTE ON FUNCTION public.read_learning_outcome(uuid,jsonb),public.apply_learning_outcome_action(uuid,uuid,jsonb) TO authenticated;
