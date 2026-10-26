-- Exact platform learning policy pilot; version20261027000000.
-- Generic B2 implementation plus two pinned own-source/synthetic-QA registrations.
-- No personal user grants, question-bank rows, personal data or private release harnesses.
-- Execute atomically through reviewed deployment/migration tooling; an existing namespace is an error.

-- CANDIDATE ONLY. Root must review, run isolated fixtures, dry-rollback and re-read
-- exact live hashes before applying. This is operational learning evidence, not
-- an approved programme, attestation, qualification, certificate or legal basis.
-- No existing results, course materials, keys, policies, grants or CSZ functions
-- are rewritten. Only explicitly registered exact course/owner tuples opt in.

SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

CREATE TABLE public.platform_course_learning_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_id uuid NOT NULL UNIQUE,
 organization_id uuid NOT NULL,
 source_course_id uuid NOT NULL,
 source_organization_id uuid NOT NULL CHECK(source_organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'),
 source_order_id uuid,
 scope_kind text NOT NULL CHECK(scope_kind IN('platform_source','explicit_synthetic_qa')),
 source_curriculum_sha256 text NOT NULL CHECK(source_curriculum_sha256~'^[0-9a-f]{64}$'),
 curriculum_sha256 text NOT NULL CHECK(curriculum_sha256~'^[0-9a-f]{64}$'),
 lesson_map jsonb NOT NULL CHECK(jsonb_typeof(lesson_map)='array'),
 required_components jsonb NOT NULL CHECK(jsonb_typeof(required_components)='array'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((scope_kind='platform_source' AND course_id=source_course_id AND organization_id=source_organization_id AND source_order_id IS NULL)
   OR(scope_kind='explicit_synthetic_qa' AND course_id<>source_course_id AND organization_id<>source_organization_id AND source_order_id IS NOT NULL))
);
CREATE TABLE public.platform_course_learning_bindings (
 enrollment_id uuid PRIMARY KEY,
 policy_id uuid NOT NULL REFERENCES public.platform_course_learning_policies(id),
 course_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 user_id uuid NOT NULL,
 bound_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 -- Deliberately no cascading FK to auth/enrollment. Existing privacy erases
 -- core enrollment rows before its audited uc_learning_erase_user tail.
 UNIQUE(enrollment_id,policy_id,user_id,course_id)
);
CREATE TABLE public.platform_course_learning_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 enrollment_id uuid NOT NULL,
 policy_id uuid NOT NULL REFERENCES public.platform_course_learning_policies(id),
 course_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 user_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('submission','review','test_session','completion')),
 source_id uuid NOT NULL,
 lesson_id uuid,
 actor_id uuid,
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 transaction_id bigint NOT NULL DEFAULT txid_current(),
 redacted boolean NOT NULL DEFAULT false,
 UNIQUE(policy_id,kind,source_id),
 CHECK((kind='completion' AND lesson_id IS NULL) OR(kind<>'completion' AND lesson_id IS NOT NULL))
);
CREATE INDEX platform_course_learning_evidence_subject ON public.platform_course_learning_evidence(user_id,enrollment_id);
CREATE INDEX platform_course_learning_evidence_actor ON public.platform_course_learning_evidence(actor_id) WHERE actor_id IS NOT NULL;
ALTER TABLE public.platform_course_learning_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_course_learning_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_course_learning_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_course_learning_policies,public.platform_course_learning_bindings,public.platform_course_learning_evidence FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.plp_sha(p_value jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,extensions AS $fn$
 SELECT encode(extensions.digest(convert_to(p_value::text,'UTF8'),'sha256'),'hex')
$fn$;

CREATE FUNCTION public.plp_lesson_policy_id(p_lesson uuid)RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p.id FROM public.platform_course_learning_policies p
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p.lesson_map)x WHERE x->>'lessonId'=p_lesson::text)
 ORDER BY p.id LIMIT 1
$fn$;

CREATE FUNCTION public.plp_question_bank(p_lesson uuid,p_semantic boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(CASE WHEN p_semantic THEN normalized-ARRAY['id','lesson_id'] ELSE normalized END
   ORDER BY CASE WHEN p_semantic THEN (normalized-ARRAY['id','lesson_id'])::text ELSE normalized->>'id' END),'[]'::jsonb)
 FROM(SELECT jsonb_build_object('id',q.id,'lesson_id',q.lesson_id,'question',q.question,
  'options',public._test_normalize_options(q.options,q.correct_answer),'order_index',q.order_index,
  'correct_answer',q.correct_answer,'explanation',q.explanation,'image_url',q.image_url,'is_bank_question',q.is_bank_question)normalized
  FROM public.test_questions q WHERE q.lesson_id=p_lesson)s
$fn$;

CREATE FUNCTION public.plp_curriculum_sha(p_course uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.plp_sha(jsonb_build_object(
 'course',(SELECT jsonb_build_object('id',c.id,'organization_id',c.organization_id,'title',c.title,'duration',c.duration,
  'source_course_id',c.source_course_id,'source_order_id',c.source_order_id,'sequential_lessons',c.sequential_lessons,
  'allow_video_seek',c.allow_video_seek)FROM public.courses c WHERE c.id=p_course),
 'lessons',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'course_id',l.course_id,'title',l.title,'type',l.type,
  'content',public.plp_sha(to_jsonb(coalesce(l.content,''))),'order_index',l.order_index,'module_id',l.module_id,
  'metadata',l.metadata,'is_locked',l.is_locked,'passing_score',l.test_passing_score,'questions_count',l.test_questions_count,
  'questions_to_show',l.test_questions_to_show,'max_attempts',l.test_max_attempts,'max_attempts_per_day',l.test_max_attempts_per_day,
  'show_answers',l.test_show_answers,'bank',public.plp_sha(public.plp_question_bank(l.id,false)))ORDER BY l.order_index,l.id)
  FROM public.lessons l WHERE l.course_id=p_course),'[]'::jsonb)))
$fn$;

CREATE FUNCTION public.plp_policy_fence(p_policy uuid,p_exclusive boolean DEFAULT false)RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c uuid;ok boolean;BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'PLP_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 FOR c IN SELECT DISTINCT x FROM public.platform_course_learning_policies p CROSS JOIN LATERAL unnest(ARRAY[p.course_id,p.source_course_id])x WHERE p.id=p_policy ORDER BY x LOOP
  IF p_exclusive THEN ok:=pg_try_advisory_xact_lock(hashtextextended(c::text,270271));
  ELSE ok:=pg_try_advisory_xact_lock_shared(hashtextextended(c::text,270271));END IF;
  IF NOT ok THEN RAISE EXCEPTION 'PLP_SOURCE_CONFLICT' USING ERRCODE='40001';END IF;
 END LOOP;
END;$fn$;

CREATE FUNCTION public.plp_privacy_erase(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.role()='service_role' AND current_setting('sintagma.account_deletion_erase_user',true)=p_user::text
  AND EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
$fn$;

CREATE FUNCTION public.plp_assert_actor(p_subject uuid)RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE u uuid;BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated' OR auth.uid()IS NULL THEN RAISE EXCEPTION 'PLP_ORIGINAL_AUTHENTICATED_ACTOR_REQUIRED' USING ERRCODE='42501';END IF;
 FOR u IN SELECT DISTINCT x FROM unnest(ARRAY[p_subject,auth.uid()])x WHERE x IS NOT NULL ORDER BY x LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(u::text,42007))THEN RAISE EXCEPTION 'PLP_SUBJECT_CONFLICT' USING ERRCODE='40001';END IF;
  IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=u)
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=u AND blocked_at IS NULL)
   THEN RAISE EXCEPTION 'PLP_ACTOR_OR_SUBJECT_CLOSED' USING ERRCODE='42501';END IF;
 END LOOP;
END;$fn$;

CREATE FUNCTION public.plp_binding(p_enrollment uuid)RETURNS public.platform_course_learning_bindings
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE b public.platform_course_learning_bindings%ROWTYPE;e public.enrollments%ROWTYPE;p public.platform_course_learning_policies%ROWTYPE;BEGIN
 SELECT * INTO STRICT b FROM public.platform_course_learning_bindings WHERE enrollment_id=p_enrollment;
 p:=public.plp_assert_current(b.policy_id);
 SELECT * INTO STRICT e FROM public.enrollments WHERE id=p_enrollment;
 IF ROW(e.user_id,e.course_id)IS DISTINCT FROM ROW(b.user_id,b.course_id)OR b.course_id<>p.course_id OR b.organization_id<>p.organization_id
  OR public.uc_enrollment_is_withdrawn(e.id)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=e.user_id AND organization_id=p.organization_id AND blocked_at IS NULL)
  OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=e.user_id)
  OR(e.status<>'completed' AND e.expires_at IS NOT NULL AND e.expires_at<=clock_timestamp())
  THEN RAISE EXCEPTION 'PLP_BINDING_OR_SUBJECT_UNAVAILABLE' USING ERRCODE='42501';END IF;
 RETURN b;
END;$fn$;

CREATE FUNCTION public.plp_session_sha(s public.test_attempt_sessions)RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public SET timezone='UTC' AS $fn$
 SELECT public.plp_sha(jsonb_build_object('id',s.id,'user_id',s.user_id,'lesson_id',s.lesson_id,'request_id',s.request_id,
  'started_at',s.started_at,'questions_snapshot',s.questions_snapshot,'passing_score',s.passing_score,
  'show_answers',s.show_answers,'requires_final_test_photo',s.requires_final_test_photo))
$fn$;

CREATE FUNCTION public.plp_homework_sha(h public.homework_submissions,p_review boolean)RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public SET timezone='UTC' AS $fn$
 SELECT public.plp_sha(CASE WHEN p_review THEN to_jsonb(h) ELSE to_jsonb(h)-ARRAY['status','score','reviewer_id','reviewer_comment','reviewed_at'] END)
$fn$;

CREATE FUNCTION public.plp_component_ready(p_enrollment uuid,p_lesson uuid)RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE b public.platform_course_learning_bindings%ROWTYPE;p public.platform_course_learning_policies%ROWTYPE;component jsonb;h public.homework_submissions%ROWTYPE;minimum integer;BEGIN
 b:=public.plp_binding(p_enrollment);
 SELECT * INTO STRICT p FROM public.platform_course_learning_policies WHERE id=b.policy_id;
 SELECT x INTO component FROM jsonb_array_elements(p.required_components)x WHERE x->>'lessonId'=p_lesson::text;
 IF component IS NULL THEN RETURN false;END IF;
 IF component->>'kind'='test' THEN
  RETURN EXISTS(SELECT 1 FROM public.test_attempts a JOIN public.test_attempt_sessions s ON s.id=a.session_id
   JOIN public.platform_course_learning_evidence v ON v.policy_id=b.policy_id AND v.kind='test_session' AND v.source_id=s.id
   WHERE a.user_id=b.user_id AND a.lesson_id=p_lesson AND s.user_id=b.user_id AND s.lesson_id=p_lesson
    AND a.session_id IS NOT NULL AND s.status='completed' AND a.passed IS TRUE AND a.max_score>0
    AND a.score BETWEEN 0 AND a.max_score AND a.passing_score=(component->>'minimum')::integer AND s.passing_score=a.passing_score
    AND a.started_at=s.started_at AND a.completed_at=s.submitted_at AND s.started_at>=b.bound_at
    AND a.completed_at>=s.started_at AND a.max_score=jsonb_array_length(s.questions_snapshot)
    AND round(a.score*100.0/a.max_score)>=s.passing_score
    AND v.enrollment_id=b.enrollment_id AND v.user_id=b.user_id AND NOT v.redacted
    AND v.evidence_sha256=public.plp_session_sha(s));
 END IF;
 SELECT * INTO h FROM public.homework_submissions WHERE student_id=b.user_id AND course_id=b.course_id AND lesson_id=p_lesson ORDER BY submitted_at DESC,id DESC LIMIT 1;
 IF NOT FOUND OR h.status<>'approved' OR h.organization_id<>b.organization_id OR h.score IS NULL OR h.score NOT BETWEEN 0 AND 100
  OR h.reviewer_id IS NULL OR h.reviewer_id=h.student_id OR h.reviewed_at IS NULL OR h.reviewed_at<h.submitted_at OR h.submitted_at<b.bound_at THEN RETURN false;END IF;
 minimum:=(component->>'minimum')::integer;
 IF minimum IS NOT NULL AND h.score<minimum THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM public.platform_course_learning_evidence v WHERE v.policy_id=b.policy_id AND v.kind='submission' AND v.source_id=h.id
   AND v.enrollment_id=b.enrollment_id AND v.user_id=b.user_id AND NOT v.redacted AND v.evidence_sha256=public.plp_homework_sha(h,false))
  AND EXISTS(SELECT 1 FROM public.platform_course_learning_evidence v WHERE v.policy_id=b.policy_id AND v.kind='review' AND v.source_id=h.id
   AND v.enrollment_id=b.enrollment_id AND v.user_id=b.user_id AND v.actor_id=h.reviewer_id AND NOT v.redacted AND v.evidence_sha256=public.plp_homework_sha(h,true));
END;$fn$;

CREATE FUNCTION public.plp_enrollment_ready(p_enrollment uuid)RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE b public.platform_course_learning_bindings%ROWTYPE;p public.platform_course_learning_policies%ROWTYPE;x jsonb;total integer;done integer;BEGIN
 b:=public.plp_binding(p_enrollment);SELECT * INTO STRICT p FROM public.platform_course_learning_policies WHERE id=b.policy_id;
 FOR x IN SELECT value FROM jsonb_array_elements(p.required_components)LOOP
  IF NOT public.plp_component_ready(p_enrollment,(x->>'lessonId')::uuid)THEN RETURN false;END IF;
 END LOOP;
 SELECT count(*),count(*)FILTER(WHERE lp.completed)INTO total,done FROM public.lessons l
  LEFT JOIN public.lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=b.user_id WHERE l.course_id=b.course_id;
 RETURN total=15 AND done=total;
END;$fn$;

CREATE FUNCTION public.plp_bind_enrollment()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.platform_course_learning_policies%ROWTYPE;BEGIN
 SELECT * INTO p FROM public.platform_course_learning_policies WHERE course_id=NEW.course_id;
 IF NOT FOUND THEN RETURN NEW;END IF;
 p:=public.plp_assert_current(p.id);PERFORM public.plp_assert_actor(NEW.user_id);
 IF NEW.status<>'active' OR NEW.progress<>0 OR NEW.completed_at IS NOT NULL OR NOT public.can_access_course(NEW.course_id,'students.write')
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=NEW.user_id AND organization_id=p.organization_id AND blocked_at IS NULL)
  THEN RAISE EXCEPTION 'PLP_INITIAL_ENROLLMENT_REQUIRED' USING ERRCODE='42501';END IF;
 INSERT INTO public.platform_course_learning_bindings(enrollment_id,policy_id,course_id,organization_id,user_id)
 VALUES(NEW.id,p.id,NEW.course_id,p.organization_id,NEW.user_id);
 RETURN NEW;
END;$fn$;

CREATE FUNCTION public.plp_guard_homework()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE cid uuid;p public.platform_course_learning_policies%ROWTYPE;e public.enrollments%ROWTYPE;b public.platform_course_learning_bindings%ROWTYPE;latest public.homework_submissions%ROWTYPE;lid uuid;BEGIN
 cid:=CASE WHEN TG_OP='DELETE' THEN OLD.course_id ELSE NEW.course_id END;
 SELECT * INTO p FROM public.platform_course_learning_policies WHERE course_id=cid OR(TG_OP='UPDATE' AND course_id=OLD.course_id)
  OR id=public.plp_lesson_policy_id(CASE WHEN TG_OP='DELETE' THEN OLD.lesson_id ELSE NEW.lesson_id END)ORDER BY id LIMIT 1;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP<>'INSERT' AND public.plp_privacy_erase(OLD.student_id)THEN
  IF TG_OP='DELETE' THEN RETURN OLD;END IF;
  IF NEW.id=OLD.id AND NEW.student_id=OLD.student_id AND NEW.course_id=OLD.course_id AND NEW.lesson_id=OLD.lesson_id THEN RETURN NEW;END IF;
 END IF;
 IF TG_OP='UPDATE' AND public.plp_privacy_erase(OLD.reviewer_id)
  AND(to_jsonb(NEW)-ARRAY['reviewer_id','reviewer_comment','reviewed_at'])=(to_jsonb(OLD)-ARRAY['reviewer_id','reviewer_comment','reviewed_at'])
  AND NEW.reviewer_id IS NULL AND NEW.reviewer_comment IS NULL AND NEW.reviewed_at IS NULL THEN RETURN NEW;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PLP_HOMEWORK_HISTORY_IMMUTABLE' USING ERRCODE='42501';END IF;
 PERFORM public.plp_assert_actor(NEW.student_id);
 SELECT * INTO STRICT e FROM public.enrollments WHERE user_id=NEW.student_id AND course_id=cid FOR UPDATE;
 b:=public.plp_binding(e.id);p:=public.plp_assert_current(p.id);
 IF b.policy_id<>p.id OR NEW.course_id<>p.course_id OR NEW.organization_id<>p.organization_id OR e.status<>'active'
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.required_components)x WHERE x->>'lessonId'=NEW.lesson_id::text AND x->>'kind'='practice')
  THEN RAISE EXCEPTION 'PLP_HOMEWORK_CONTEXT' USING ERRCODE='42501';END IF;
 SELECT * INTO latest FROM public.homework_submissions WHERE student_id=NEW.student_id AND course_id=cid AND lesson_id=NEW.lesson_id ORDER BY submitted_at DESC,id DESC LIMIT 1;
 IF TG_OP='INSERT' THEN
  IF auth.uid()<>NEW.student_id OR NOT public.can_access_course_as_learner(cid) OR NEW.status<>'pending' OR NEW.score IS NOT NULL
   OR NEW.reviewer_id IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.reviewer_comment IS NOT NULL
   OR(length(btrim(coalesce(NEW.content,'')))=0 AND coalesce(NEW.attachments,'[]'::jsonb)='[]'::jsonb)
   OR jsonb_typeof(coalesce(NEW.attachments,'[]'::jsonb))<>'array'
   OR(latest.id IS NOT NULL AND latest.status NOT IN('revision','rejected'))THEN RAISE EXCEPTION 'PLP_OWN_PENDING_SUBMISSION_REQUIRED' USING ERRCODE='42501';END IF;
  NEW.submitted_at:=greatest(clock_timestamp(),coalesce(latest.submitted_at,'-infinity'::timestamptz)+interval'1 microsecond');NEW.created_at:=NEW.submitted_at;
 ELSE
  IF(to_jsonb(NEW)-ARRAY['status','score','reviewer_id','reviewer_comment','reviewed_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['status','score','reviewer_id','reviewer_comment','reviewed_at'])
   OR OLD.status<>'pending' OR latest.id IS DISTINCT FROM OLD.id OR auth.uid()=NEW.student_id OR NOT public.can_access_course(cid,'homework.write')
   THEN RAISE EXCEPTION 'PLP_REVIEWER_OR_LATEST_REQUIRED' USING ERRCODE='42501';END IF;
  IF NEW.status NOT IN('approved','revision','rejected')OR(NEW.score IS NOT NULL AND NEW.score NOT BETWEEN 0 AND 100)
   OR(NEW.status='approved' AND NEW.score IS NULL)THEN RAISE EXCEPTION 'PLP_EXPLICIT_RUBRIC_SCORE_REQUIRED' USING ERRCODE='23514';END IF;
  IF NEW.status='approved' AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.required_components)x WHERE x->>'lessonId'=NEW.lesson_id::text
   AND x->>'minimum' IS NOT NULL AND NEW.score<(x->>'minimum')::integer)THEN RAISE EXCEPTION 'PLP_FINAL_RUBRIC_MINIMUM' USING ERRCODE='23514';END IF;
  NEW.reviewer_id:=auth.uid();NEW.reviewed_at:=clock_timestamp();
 END IF;RETURN NEW;
END;$fn$;

CREATE FUNCTION public.plp_observe_homework()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE b public.platform_course_learning_bindings%ROWTYPE;BEGIN
 IF public.plp_privacy_erase(NEW.student_id)OR(TG_OP='UPDATE' AND public.plp_privacy_erase(OLD.reviewer_id))THEN RETURN NEW;END IF;
 SELECT v.* INTO b FROM public.platform_course_learning_bindings v JOIN public.enrollments e ON e.id=v.enrollment_id
  WHERE e.user_id=NEW.student_id AND e.course_id=NEW.course_id;
 IF NOT FOUND THEN RETURN NEW;END IF;
 INSERT INTO public.platform_course_learning_evidence(enrollment_id,policy_id,course_id,organization_id,user_id,kind,source_id,lesson_id,actor_id,evidence_sha256)
 VALUES(b.enrollment_id,b.policy_id,b.course_id,b.organization_id,b.user_id,CASE WHEN TG_OP='INSERT' THEN 'submission' ELSE 'review' END,
  NEW.id,NEW.lesson_id,auth.uid(),public.plp_homework_sha(NEW,TG_OP='UPDATE'));
 RETURN NEW;
END;$fn$;

CREATE FUNCTION public.plp_assert_current(p_policy uuid)RETURNS public.platform_course_learning_policies
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.platform_course_learning_policies%ROWTYPE;BEGIN
 PERFORM public.plp_policy_fence(p_policy,false);
 SELECT * INTO STRICT p FROM public.platform_course_learning_policies WHERE id=p_policy;
 IF NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=p.course_id AND c.organization_id=p.organization_id)
  OR NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=p.source_course_id AND c.organization_id=p.source_organization_id)
  OR public.plp_curriculum_sha(p.course_id)IS DISTINCT FROM p.curriculum_sha256
  OR public.plp_curriculum_sha(p.source_course_id)IS DISTINCT FROM p.source_curriculum_sha256 THEN
  RAISE EXCEPTION 'PLP_SOURCE_CHANGED' USING ERRCODE='23514';END IF;
 RETURN p;
END;$fn$;

-- Owner-only offline registration. No default EXECUTE survives the ACL tail.
-- It does not infer authorization from lineage. Root supplies both exact target
-- organization and all15 source/target lesson UUID pairs after reviewing them.
CREATE FUNCTION public.plp_register_policy(p_course uuid,p_org uuid,p_source uuid,p_source_sha text,p_target_sha text,p_map jsonb,p_components jsonb,p_qa boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE src public.courses%ROWTYPE;dst public.courses%ROWTYPE;entry jsonb;sl public.lessons%ROWTYPE;tl public.lessons%ROWTYPE;pid uuid;source_order uuid;BEGIN
 -- Initial activation must share the migration's DDL writer fence. Without it,
 -- an unregistered course has no per-policy fence yet and a concurrent lesson
 -- INSERT could be a phantom between hash validation and policy installation.
 -- The three CREATE TRIGGER statements in this migration already hold these
 -- ShareRowExclusive locks until commit; no additional runtime lock is taken.
 IF current_setting('transaction_isolation')<>'read committed'OR EXISTS(
  SELECT 1 FROM unnest(ARRAY['public.courses'::regclass,'public.lessons'::regclass,'public.test_questions'::regclass])required(rel)
  WHERE NOT EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=pg_backend_pid()AND l.relation=required.rel AND l.granted AND l.mode IN('ShareRowExclusiveLock','AccessExclusiveLock')))
  THEN RAISE EXCEPTION 'PLP_ATOMIC_REGISTRATION_REQUIRES_MIGRATION_TABLE_FENCE' USING ERRCODE='25000';END IF;
 IF p_source<>'00327a03-f79c-5d5c-9f57-d3c46cc54bae'::uuid THEN RAISE EXCEPTION 'PLP_UNREVIEWED_SOURCE' USING ERRCODE='23514';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_source::text,270271))
  OR NOT pg_try_advisory_xact_lock(hashtextextended(p_course::text,270271))THEN RAISE EXCEPTION 'PLP_SOURCE_CONFLICT' USING ERRCODE='40001';END IF;
 SELECT * INTO STRICT src FROM public.courses WHERE id=p_source FOR SHARE;
 SELECT * INTO STRICT dst FROM public.courses WHERE id=p_course FOR SHARE;
 IF src.organization_id<>'4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid OR dst.organization_id IS DISTINCT FROM p_org
  OR public.plp_curriculum_sha(p_source)IS DISTINCT FROM p_source_sha OR public.plp_curriculum_sha(p_course)IS DISTINCT FROM p_target_sha THEN RAISE EXCEPTION 'PLP_SOURCE_CHANGED' USING ERRCODE='23514';END IF;
 IF p_qa THEN
  -- Explicit root-authorized synthetic tuple only. Other copies are untouched.
  IF p_course<>'64ea14ee-6e9b-4e0d-a82d-d48ae2bf5599'::uuid OR p_org<>'0e29e728-bcc5-46e6-a339-066fb1e9c726'::uuid
   OR dst.source_course_id IS DISTINCT FROM src.id OR dst.source_order_id IS DISTINCT FROM 'dcb92be7-19bb-4c60-b840-df6d456b8a3b'::uuid
   OR NOT EXISTS(SELECT 1 FROM public.marketplace_orders o JOIN public.marketplace_courses m ON m.id=o.marketplace_course_id
    WHERE o.id=dst.source_order_id AND o.buyer_organization_id=p_org AND o.status='paid' AND o.price=0 AND m.course_id=src.id AND m.organization_id=src.organization_id)
   THEN RAISE EXCEPTION 'PLP_QA_PROVENANCE_UNCONFIRMED' USING ERRCODE='23514';END IF;
  source_order:=dst.source_order_id;
 ELSE IF p_course<>p_source OR p_org<>src.organization_id THEN RAISE EXCEPTION 'PLP_SOURCE_OWNER_REQUIRED' USING ERRCODE='23514';END IF;END IF;
 IF EXISTS(SELECT 1 FROM public.enrollments WHERE course_id=p_course)OR EXISTS(SELECT 1 FROM public.homework_submissions WHERE course_id=p_course)
  OR EXISTS(SELECT 1 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id WHERE l.course_id=p_course)
  OR EXISTS(SELECT 1 FROM public.test_attempt_sessions s JOIN public.lessons l ON l.id=s.lesson_id WHERE l.course_id=p_course)
  OR EXISTS(SELECT 1 FROM public.test_attempts a JOIN public.lessons l ON l.id=a.lesson_id WHERE l.course_id=p_course)
  THEN RAISE EXCEPTION 'PLP_EXISTING_ACTIVITY_CUTOVER_REQUIRES_REVIEW' USING ERRCODE='23514';END IF;
 IF jsonb_typeof(p_map)<>'array' OR jsonb_array_length(p_map)<>15
  OR(SELECT count(DISTINCT x->>'sourceLessonId')FROM jsonb_array_elements(p_map)x)<>15
  OR(SELECT count(DISTINCT x->>'lessonId')FROM jsonb_array_elements(p_map)x)<>15
  OR(SELECT count(*)FROM public.lessons WHERE course_id=p_course)<>15
  OR(SELECT count(*)FROM public.lessons WHERE course_id=p_source)<>15 THEN RAISE EXCEPTION 'PLP_EXACT_CURRICULUM_MAP_REQUIRED' USING ERRCODE='23514';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_map)LOOP
  SELECT * INTO STRICT sl FROM public.lessons WHERE id=(entry->>'sourceLessonId')::uuid AND course_id=p_source;
  SELECT * INTO STRICT tl FROM public.lessons WHERE id=(entry->>'lessonId')::uuid AND course_id=p_course;
  IF ROW(sl.title,sl.type,sl.content,sl.order_index,sl.is_locked,sl.test_passing_score,sl.test_questions_count,sl.test_questions_to_show,sl.test_show_answers)
   IS DISTINCT FROM ROW(tl.title,tl.type,tl.content,tl.order_index,tl.is_locked,tl.test_passing_score,tl.test_questions_count,tl.test_questions_to_show,tl.test_show_answers)
   OR public.plp_question_bank(sl.id,true)IS DISTINCT FROM public.plp_question_bank(tl.id,true)
   THEN RAISE EXCEPTION 'PLP_COPY_MISMATCH' USING ERRCODE='23514';END IF;
 END LOOP;
 IF jsonb_typeof(p_components)<>'array' OR jsonb_array_length(p_components)<>7
  OR(SELECT count(*)FROM jsonb_array_elements(p_components)x WHERE x->>'kind'='test' AND(x->>'minimum')::integer=70)<>3
  OR(SELECT count(*)FROM jsonb_array_elements(p_components)x WHERE x->>'kind'='practice' AND x->'minimum'='null'::jsonb)<>3
  OR(SELECT count(*)FROM jsonb_array_elements(p_components)x WHERE x->>'kind'='practice' AND(x->>'minimum')::integer=70)<>1
  OR(SELECT count(DISTINCT x->>'lessonId')FROM jsonb_array_elements(p_components)x)<>7 THEN RAISE EXCEPTION 'PLP_REVIEWED_COMPONENTS_REQUIRED' USING ERRCODE='23514';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_components)LOOP
  SELECT * INTO STRICT tl FROM public.lessons WHERE id=(entry->>'lessonId')::uuid AND course_id=p_course;
  SELECT * INTO STRICT sl FROM public.lessons WHERE id=(entry->>'sourceLessonId')::uuid AND course_id=p_source;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_map)x WHERE x->>'lessonId'=tl.id::text AND x->>'sourceLessonId'=sl.id::text)
   OR tl.is_locked OR tl.type<>(CASE WHEN entry->>'kind'='test' THEN 'test' ELSE 'homework' END)
   OR(entry->>'kind'='test' AND(tl.test_passing_score<>70 OR coalesce(tl.test_questions_to_show,0)<>(SELECT count(*)FROM public.test_questions WHERE lesson_id=tl.id)
    OR(sl.id IN('31eaf281-6591-5a18-844e-e10f7ebf17ee','d850cf2c-1ca2-5a81-bd2a-bc25b3c771f1')AND coalesce(tl.test_questions_to_show,0)<>6)
    OR(sl.id='68c2b530-a259-5924-8f47-49395ae77811'AND coalesce(tl.test_questions_to_show,0)<>8)))
   OR(entry->>'kind'='practice' AND sl.id='ed71b605-c937-5204-a0cb-232d7e5a67c6'::uuid AND(entry->>'minimum')::integer IS DISTINCT FROM 70)
   OR(entry->>'kind'='practice' AND sl.id<>'ed71b605-c937-5204-a0cb-232d7e5a67c6'::uuid AND entry->'minimum'<>'null'::jsonb)
   THEN RAISE EXCEPTION 'PLP_COMPONENT_MISMATCH' USING ERRCODE='23514';END IF;
 END LOOP;
 INSERT INTO public.platform_course_learning_policies(course_id,organization_id,source_course_id,source_organization_id,source_order_id,scope_kind,
  source_curriculum_sha256,curriculum_sha256,lesson_map,required_components)
 VALUES(p_course,p_org,p_source,src.organization_id,source_order,CASE WHEN p_qa THEN 'explicit_synthetic_qa' ELSE 'platform_source' END,p_source_sha,p_target_sha,p_map,p_components)RETURNING id INTO pid;
 RETURN pid;
END;$fn$;

CREATE FUNCTION public.plp_guard_test_session()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.platform_course_learning_policies%ROWTYPE;e public.enrollments%ROWTYPE;b public.platform_course_learning_bindings%ROWTYPE;cid uuid;lid uuid;snapshot jsonb;BEGIN
 lid:=CASE WHEN TG_OP='DELETE' THEN OLD.lesson_id ELSE NEW.lesson_id END;
 SELECT l.course_id INTO cid FROM public.lessons l WHERE l.id=lid;
 SELECT * INTO p FROM public.platform_course_learning_policies WHERE course_id=cid OR id=public.plp_lesson_policy_id(CASE WHEN TG_OP='DELETE' THEN OLD.lesson_id ELSE NEW.lesson_id END)
  OR(TG_OP='UPDATE'AND id=public.plp_lesson_policy_id(OLD.lesson_id))ORDER BY id LIMIT 1;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP<>'INSERT' AND public.plp_privacy_erase(OLD.user_id)THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PLP_TEST_HISTORY_IMMUTABLE' USING ERRCODE='42501';END IF;
 PERFORM public.plp_assert_actor(NEW.user_id);
 SELECT e0.* INTO STRICT e FROM public.enrollments e0 WHERE e0.user_id=NEW.user_id AND e0.course_id=cid FOR UPDATE;
 b:=public.plp_binding(e.id);p:=public.plp_assert_current(p.id);
 IF b.policy_id<>p.id OR auth.uid()<>NEW.user_id OR NOT public.can_access_course_as_learner(cid)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.required_components)x WHERE x->>'lessonId'=NEW.lesson_id::text AND x->>'kind'='test')
  THEN RAISE EXCEPTION 'PLP_TEST_CONTEXT' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' THEN
  IF e.status NOT IN('active','completed') OR NEW.status<>'in_progress' OR NEW.submitted_at IS NOT NULL OR NEW.started_at<b.bound_at
   OR NEW.started_at>clock_timestamp()OR NEW.passing_score<>70 OR jsonb_typeof(NEW.questions_snapshot)<>'array'
   THEN RAISE EXCEPTION 'PLP_INITIAL_SERVER_SESSION_REQUIRED' USING ERRCODE='23514';END IF;
  SELECT coalesce(jsonb_agg(q-'position'ORDER BY q->>'id'),'[]'::jsonb)INTO snapshot FROM jsonb_array_elements(NEW.questions_snapshot)q;
  IF snapshot IS DISTINCT FROM public.plp_question_bank(NEW.lesson_id,false)THEN RAISE EXCEPTION 'PLP_FROZEN_SNAPSHOT_MISMATCH' USING ERRCODE='23514';END IF;
 ELSE
  IF(to_jsonb(NEW)-ARRAY['status','submitted_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['status','submitted_at'])
   OR OLD.status<>'in_progress'OR NEW.status<>'completed'OR NEW.submitted_at IS NULL OR NEW.submitted_at<NEW.started_at
   OR NOT EXISTS(SELECT 1 FROM public.test_attempts a WHERE a.session_id=NEW.id AND a.user_id=NEW.user_id AND a.lesson_id=NEW.lesson_id AND a.completed_at=NEW.submitted_at)
   THEN RAISE EXCEPTION 'PLP_SESSION_SUBMIT_TRANSITION_REQUIRED' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;
END;$fn$;

CREATE FUNCTION public.plp_observe_test_session()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE b public.platform_course_learning_bindings%ROWTYPE;BEGIN
 SELECT v.* INTO b FROM public.platform_course_learning_bindings v JOIN public.enrollments e ON e.id=v.enrollment_id
  JOIN public.lessons l ON l.course_id=e.course_id WHERE e.user_id=NEW.user_id AND l.id=NEW.lesson_id;
 IF NOT FOUND THEN RETURN NEW;END IF;
 INSERT INTO public.platform_course_learning_evidence(enrollment_id,policy_id,course_id,organization_id,user_id,kind,source_id,lesson_id,actor_id,evidence_sha256)
 VALUES(b.enrollment_id,b.policy_id,b.course_id,b.organization_id,b.user_id,'test_session',NEW.id,NEW.lesson_id,NEW.user_id,public.plp_session_sha(NEW));
 RETURN NEW;
END;$fn$;

CREATE FUNCTION public.plp_guard_test_attempt()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.platform_course_learning_policies%ROWTYPE;s public.test_attempt_sessions%ROWTYPE;cid uuid;score_expected integer;max_expected integer;BEGIN
 SELECT l.course_id INTO cid FROM public.lessons l WHERE l.id=CASE WHEN TG_OP='DELETE' THEN OLD.lesson_id ELSE NEW.lesson_id END;
 SELECT * INTO p FROM public.platform_course_learning_policies WHERE course_id=cid OR id=public.plp_lesson_policy_id(CASE WHEN TG_OP='DELETE' THEN OLD.lesson_id ELSE NEW.lesson_id END)
  OR(TG_OP='UPDATE'AND id=public.plp_lesson_policy_id(OLD.lesson_id))ORDER BY id LIMIT 1;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP<>'INSERT' AND public.plp_privacy_erase(OLD.user_id)THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PLP_TEST_RESULT_IMMUTABLE' USING ERRCODE='42501';END IF;
 PERFORM public.plp_assert_actor(NEW.user_id);p:=public.plp_assert_current(p.id);
 SELECT * INTO STRICT s FROM public.test_attempt_sessions WHERE id=NEW.session_id;
 IF auth.uid()<>NEW.user_id OR NOT public.can_access_course_as_learner(cid)OR s.user_id<>NEW.user_id OR s.lesson_id<>NEW.lesson_id
  OR s.status<>'in_progress'OR NEW.started_at IS DISTINCT FROM s.started_at OR NEW.completed_at<s.started_at
  OR jsonb_typeof(NEW.answers)<>'object'OR NEW.passing_score IS DISTINCT FROM s.passing_score
  OR NOT EXISTS(SELECT 1 FROM public.platform_course_learning_evidence v WHERE v.policy_id=p.id AND v.kind='test_session'AND v.source_id=s.id
   AND v.user_id=s.user_id AND NOT v.redacted AND v.evidence_sha256=public.plp_session_sha(s))
  THEN RAISE EXCEPTION 'PLP_AUTHORITATIVE_TEST_RESULT_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT count(*)::integer,count(*)FILTER(WHERE NEW.answers->(q->>'id')=q->'correct_answer')::integer
  INTO max_expected,score_expected FROM jsonb_array_elements(s.questions_snapshot)q;
 IF max_expected=0 OR NEW.max_score<>max_expected OR NEW.score<>score_expected
  OR NEW.passed IS DISTINCT FROM(round(score_expected*100.0/max_expected)>=s.passing_score)
  OR NEW.shown_question_ids IS DISTINCT FROM(SELECT jsonb_agg(q->'id')FROM jsonb_array_elements(s.questions_snapshot)q)
  OR EXISTS(SELECT 1 FROM jsonb_each(NEW.answers)a LEFT JOIN LATERAL(SELECT q FROM jsonb_array_elements(s.questions_snapshot)q WHERE q->>'id'=a.key)item ON true
   WHERE item.q IS NULL OR jsonb_typeof(a.value)<>'number'OR a.value::text!~'^[0-9]+$'
    OR CASE WHEN a.value::text~'^[0-9]+$'THEN(a.value::text)::numeric>=jsonb_array_length(item.q->'options')ELSE false END)
  THEN RAISE EXCEPTION 'PLP_SERVER_GRADE_MISMATCH' USING ERRCODE='23514';END IF;
 RETURN NEW;
END;$fn$;

CREATE FUNCTION public.plp_guard_progress()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.platform_course_learning_policies%ROWTYPE;e public.enrollments%ROWTYPE;b public.platform_course_learning_bindings%ROWTYPE;u uuid;lid uuid;cid uuid;BEGIN
 u:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;lid:=CASE WHEN TG_OP='DELETE' THEN OLD.lesson_id ELSE NEW.lesson_id END;
 SELECT l.course_id INTO cid FROM public.lessons l WHERE l.id=lid;
 SELECT * INTO p FROM public.platform_course_learning_policies WHERE course_id=cid OR id=public.plp_lesson_policy_id(CASE WHEN TG_OP='DELETE' THEN OLD.lesson_id ELSE NEW.lesson_id END)
  OR(TG_OP='UPDATE'AND id=public.plp_lesson_policy_id(OLD.lesson_id))ORDER BY id LIMIT 1;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP<>'INSERT' AND public.plp_privacy_erase(OLD.user_id)THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE'THEN RAISE EXCEPTION 'PLP_EXPLICIT_RESET_REQUIRED' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE'AND(NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.lesson_id<>OLD.lesson_id OR(OLD.completed AND NOT NEW.completed))
  THEN RAISE EXCEPTION 'PLP_PROGRESS_IDENTITY_AND_HISTORY_IMMUTABLE' USING ERRCODE='42501';END IF;
 PERFORM public.plp_assert_actor(u);
 SELECT * INTO STRICT e FROM public.enrollments WHERE user_id=u AND course_id=cid FOR UPDATE;
 b:=public.plp_binding(e.id);
 IF b.policy_id<>p.id OR NOT((auth.uid()=u AND public.can_access_course_as_learner(cid))OR public.can_access_course(cid,'students.write'))
  THEN RAISE EXCEPTION 'PLP_PROGRESS_CONTEXT' USING ERRCODE='42501';END IF;
 IF NEW.completed THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p.required_components)x WHERE x->>'lessonId'=lid::text)
   AND NOT public.plp_component_ready(e.id,lid)THEN RAISE EXCEPTION 'PLP_ASSESSMENT_EVIDENCE_REQUIRED' USING ERRCODE='23514';END IF;
  NEW.completed_at:=CASE WHEN TG_OP='UPDATE'AND OLD.completed THEN OLD.completed_at ELSE clock_timestamp()END;
 ELSE NEW.completed_at:=NULL;END IF;RETURN NEW;
END;$fn$;

CREATE FUNCTION public.plp_guard_enrollment()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.platform_course_learning_policies%ROWTYPE;b public.platform_course_learning_bindings%ROWTYPE;staff boolean;total integer;done integer;ceiling integer;renewal_at timestamptz;BEGIN
 SELECT * INTO p FROM public.platform_course_learning_policies WHERE course_id=CASE WHEN TG_OP='DELETE' THEN OLD.course_id ELSE NEW.course_id END
  OR(TG_OP='UPDATE'AND course_id=OLD.course_id)ORDER BY id LIMIT 1;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP<>'INSERT' AND public.plp_privacy_erase(OLD.user_id)THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE'THEN RAISE EXCEPTION 'PLP_ENROLLMENT_HISTORY_IMMUTABLE' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE'AND(NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.course_id<>OLD.course_id)
  THEN RAISE EXCEPTION 'PLP_ENROLLMENT_IDENTITY_IMMUTABLE' USING ERRCODE='42501';END IF;
 -- A historical completion is not a new current-source claim. Its technical
 -- fields remain frozen, but unrelated authorized metadata/time writes do not
 -- re-evaluate or regrade it against a later curriculum.
 IF TG_OP='UPDATE'AND OLD.status='completed'THEN
  PERFORM public.plp_assert_actor(NEW.user_id);staff:=public.can_access_course(NEW.course_id,'students.write');
  IF NEW.status<>'completed'OR NEW.progress<>OLD.progress OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
   THEN RAISE EXCEPTION 'PLP_EXPLICIT_RESET_REQUIRED' USING ERRCODE='42501';END IF;
  IF NOT(staff OR(auth.uid()=NEW.user_id AND public.can_access_course_as_learner(NEW.course_id)))
   OR(NOT staff AND ROW(NEW.access_days,NEW.started_at,NEW.expires_at)IS DISTINCT FROM ROW(OLD.access_days,OLD.started_at,OLD.expires_at))
   THEN RAISE EXCEPTION 'PLP_ENROLLMENT_CONTEXT' USING ERRCODE='42501';END IF;RETURN NEW;
 END IF;
 PERFORM public.plp_assert_actor(NEW.user_id);p:=public.plp_assert_current(p.id);staff:=public.can_access_course(NEW.course_id,'students.write');
 IF TG_OP='INSERT'THEN
  IF NOT staff OR NEW.status<>'active'OR NEW.progress<>0 OR NEW.completed_at IS NOT NULL
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=NEW.user_id AND organization_id=p.organization_id AND blocked_at IS NULL)
   THEN RAISE EXCEPTION 'PLP_INITIAL_ENROLLMENT_REQUIRED' USING ERRCODE='42501';END IF;RETURN NEW;
 END IF;
 -- Expiry blocks learning, not a permissioned extension of the same active
 -- assignment. Keep plp_binding() strict for every other path. The original
 -- calc_enrollment_expires_at already ran; document_facts_revision is stamped
 -- by the original server sequence trigger before this last BEFORE guard.
 renewal_at:=clock_timestamp();
 IF staff AND OLD.status='active' AND OLD.expires_at IS NOT NULL AND OLD.expires_at<=renewal_at
  AND NEW.expires_at IS NOT NULL AND NEW.expires_at>renewal_at
  AND(to_jsonb(NEW)-ARRAY['access_days','expires_at','document_facts_revision'])
      =(to_jsonb(OLD)-ARRAY['access_days','expires_at','document_facts_revision'])THEN
  SELECT * INTO STRICT b FROM public.platform_course_learning_bindings WHERE enrollment_id=OLD.id;
  IF b.policy_id<>p.id OR ROW(OLD.user_id,OLD.course_id)IS DISTINCT FROM ROW(b.user_id,b.course_id)
   OR b.course_id<>p.course_id OR b.organization_id<>p.organization_id
   OR public.uc_enrollment_is_withdrawn(OLD.id)
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=OLD.user_id AND organization_id=p.organization_id AND blocked_at IS NULL)
   OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=OLD.user_id)
   THEN RAISE EXCEPTION 'PLP_RENEWAL_BINDING_OR_SUBJECT_UNAVAILABLE' USING ERRCODE='42501';END IF;
  RETURN NEW;
 END IF;
 b:=public.plp_binding(OLD.id);
 IF b.policy_id<>p.id OR NOT(staff OR(auth.uid()=NEW.user_id AND public.can_access_course_as_learner(NEW.course_id)))
  THEN RAISE EXCEPTION 'PLP_ENROLLMENT_CONTEXT' USING ERRCODE='42501';END IF;
 IF NOT staff AND ROW(NEW.access_days,NEW.started_at,NEW.expires_at)IS DISTINCT FROM ROW(OLD.access_days,OLD.started_at,OLD.expires_at)
  THEN RAISE EXCEPTION 'PLP_ENROLLMENT_ACCESS_IMMUTABLE' USING ERRCODE='42501';END IF;
 IF NOT staff AND NEW.status NOT IN('active','completed')THEN RAISE EXCEPTION 'PLP_LIFECYCLE_STAFF_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT count(*),count(*)FILTER(WHERE lp.completed)INTO total,done FROM public.lessons l LEFT JOIN public.lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=NEW.user_id WHERE l.course_id=NEW.course_id;
 ceiling:=CASE WHEN total=0 THEN 0 ELSE(done*100)/total END;
 IF NEW.progress<0 OR NEW.progress>ceiling OR NEW.progress<OLD.progress
  THEN RAISE EXCEPTION 'PLP_PROGRESS_EXCEEDS_FACTS' USING ERRCODE='23514';END IF;
 IF NEW.progress=100 OR NEW.status='completed'THEN
  IF NOT public.plp_enrollment_ready(OLD.id)THEN RAISE EXCEPTION 'PLP_FULL_COURSE_EVIDENCE_REQUIRED' USING ERRCODE='23514';END IF;
  NEW.status:='completed';NEW.progress:=100;NEW.completed_at:=clock_timestamp();
 ELSE NEW.completed_at:=NULL;END IF;
 RETURN NEW;
END;$fn$;

CREATE FUNCTION public.plp_observe_completion()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $fn$
DECLARE b public.platform_course_learning_bindings%ROWTYPE;BEGIN
 IF NEW.status<>'completed'OR OLD.status='completed'THEN RETURN NEW;END IF;
 SELECT * INTO b FROM public.platform_course_learning_bindings WHERE enrollment_id=NEW.id;
 IF NOT FOUND THEN RETURN NEW;END IF;
 INSERT INTO public.platform_course_learning_evidence(enrollment_id,policy_id,course_id,organization_id,user_id,kind,source_id,actor_id,evidence_sha256)
 VALUES(b.enrollment_id,b.policy_id,b.course_id,b.organization_id,b.user_id,'completion',NEW.id,auth.uid(),public.plp_sha(jsonb_build_object('enrollment',NEW.id,'policy',b.policy_id,
  'user_id',NEW.user_id,'course_id',NEW.course_id,'progress',NEW.progress,'completed_at',NEW.completed_at)))ON CONFLICT(policy_id,kind,source_id)DO NOTHING;
 RETURN NEW;
END;$fn$;

CREATE FUNCTION public.plp_guard_curriculum()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ids uuid[];p record;old_course uuid;new_course uuid;BEGIN
 IF TG_TABLE_NAME='courses'THEN
  old_course:=CASE WHEN TG_OP<>'INSERT'THEN OLD.id END;new_course:=CASE WHEN TG_OP<>'DELETE'THEN NEW.id END;
 ELSIF TG_TABLE_NAME='lessons'THEN
  old_course:=CASE WHEN TG_OP<>'INSERT'THEN OLD.course_id END;new_course:=CASE WHEN TG_OP<>'DELETE'THEN NEW.course_id END;
 ELSE
  IF TG_OP<>'INSERT'THEN SELECT course_id INTO old_course FROM public.lessons WHERE id=OLD.lesson_id;END IF;
  IF TG_OP<>'DELETE'THEN SELECT course_id INTO new_course FROM public.lessons WHERE id=NEW.lesson_id;END IF;
 END IF;
 FOR p IN SELECT id FROM public.platform_course_learning_policies WHERE course_id=ANY(ARRAY[old_course,new_course])OR source_course_id=ANY(ARRAY[old_course,new_course])ORDER BY id LOOP
  PERFORM public.plp_policy_fence(p.id,true);
  IF TG_TABLE_NAME='courses'AND(TG_OP='DELETE'OR(TG_OP='UPDATE'AND(to_jsonb(OLD)->>'id'IS DISTINCT FROM to_jsonb(NEW)->>'id' OR to_jsonb(OLD)->>'organization_id'IS DISTINCT FROM to_jsonb(NEW)->>'organization_id')))
   THEN RAISE EXCEPTION 'PLP_REGISTERED_ANCHOR_IMMUTABLE' USING ERRCODE='42501';END IF;
  IF TG_OP='UPDATE'AND TG_TABLE_NAME='lessons'AND(to_jsonb(NEW)->>'id'IS DISTINCT FROM to_jsonb(OLD)->>'id' OR to_jsonb(NEW)->>'course_id'IS DISTINCT FROM to_jsonb(OLD)->>'course_id')
   THEN RAISE EXCEPTION 'PLP_REGISTERED_LESSON_IDENTITY_IMMUTABLE' USING ERRCODE='42501';END IF;
  IF TG_OP='UPDATE'AND TG_TABLE_NAME='test_questions'AND(to_jsonb(NEW)->>'id'IS DISTINCT FROM to_jsonb(OLD)->>'id' OR to_jsonb(NEW)->>'lesson_id'IS DISTINCT FROM to_jsonb(OLD)->>'lesson_id')
   THEN RAISE EXCEPTION 'PLP_REGISTERED_QUESTION_IDENTITY_IMMUTABLE' USING ERRCODE='42501';END IF;
 END LOOP;
 IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;
END;$fn$;

CREATE FUNCTION public.plp_private_history_guard()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_OP='INSERT'THEN
  IF TG_TABLE_NAME<>'platform_course_learning_policies'THEN PERFORM public.plp_assert_actor(NEW.user_id);END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='platform_course_learning_bindings'AND TG_OP='DELETE'AND public.plp_privacy_erase(OLD.user_id)THEN RETURN OLD;END IF;
 IF TG_TABLE_NAME='platform_course_learning_evidence'THEN
  IF TG_OP='DELETE'AND public.plp_privacy_erase(OLD.user_id)THEN RETURN OLD;END IF;
  IF TG_OP='UPDATE'AND public.plp_privacy_erase(OLD.actor_id)
   AND(to_jsonb(NEW)-ARRAY['actor_id','redacted'])=(to_jsonb(OLD)-ARRAY['actor_id','redacted'])
   AND NEW.actor_id IS NULL AND NEW.redacted THEN RETURN NEW;END IF;
 END IF;
 RAISE EXCEPTION 'PLP_PRIVATE_EVIDENCE_IMMUTABLE' USING ERRCODE='42501';
END;$fn$;

CREATE FUNCTION public.plp_guard_truncate()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM public.platform_course_learning_policies)THEN RAISE EXCEPTION 'PLP_REGISTERED_HISTORY_NO_TRUNCATE' USING ERRCODE='42501';END IF;
 RETURN NULL;
END;$fn$;

-- A modifying CTE or same-transaction curriculum edit must not leave a new
-- evidence/binding claim pinned to a source that changed later in that command.
-- Existing historical receipts are not revisited by this deferred INSERT guard.
CREATE FUNCTION public.plp_validate_new_claim_at_commit()RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_TABLE_NAME='platform_course_learning_evidence'THEN
  IF NOT EXISTS(SELECT 1 FROM public.platform_course_learning_evidence WHERE id=NEW.id AND NOT redacted)THEN RETURN NULL;END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.platform_course_learning_bindings WHERE enrollment_id=NEW.enrollment_id)THEN RETURN NULL;END IF;
 END IF;
 PERFORM public.plp_assert_current(NEW.policy_id);RETURN NULL;
END;$fn$;

-- Presentation proof only. It grants no course/lesson access, grades or outcome.
-- Unregistered client lineage and stale source/target snapshots return unknown.
CREATE FUNCTION public.get_platform_learning_task_proof(p_course_id uuid,p_lesson_id uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.platform_course_learning_policies%ROWTYPE;content text;BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL
  OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid())
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid()AND blocked_at IS NULL)
  OR NOT(public.can_access_course_as_learner(p_course_id)OR public.can_access_course(p_course_id,'courses.read')OR public.can_access_course(p_course_id,'courses.write'))
  THEN RETURN jsonb_build_object('status','unknown');END IF;
 SELECT * INTO p FROM public.platform_course_learning_policies WHERE course_id=p_course_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','unknown');END IF;
 BEGIN p:=public.plp_assert_current(p.id);EXCEPTION WHEN check_violation OR serialization_failure THEN RETURN jsonb_build_object('status','source_changed');END;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.lesson_map)x WHERE x->>'lessonId'=p_lesson_id::text)THEN RETURN jsonb_build_object('status','unknown');END IF;
 SELECT l.content INTO content FROM public.lessons l WHERE l.id=p_lesson_id AND l.course_id=p_course_id AND l.type='homework';
 IF NOT FOUND THEN RETURN jsonb_build_object('status','unknown');END IF;
 RETURN jsonb_build_object('status','verified','courseId',p_course_id,'lessonId',p_lesson_id,'contentSha256',encode(extensions.digest(convert_to(coalesce(content,''),'UTF8'),'sha256'),'hex'),'policyId',p.id);
END;$fn$;

-- BEFORE order is intentionally after auto_complete_enrollment and all original
-- account/retention/document guards. A raised exception precedes every AFTER
-- completion side effect. Existing trigger/function definitions are untouched.
CREATE TRIGGER zzzzzzz_plp_homework_guard BEFORE INSERT OR UPDATE OR DELETE ON public.homework_submissions FOR EACH ROW EXECUTE FUNCTION public.plp_guard_homework();
CREATE TRIGGER a_plp_homework_evidence AFTER INSERT OR UPDATE ON public.homework_submissions FOR EACH ROW EXECUTE FUNCTION public.plp_observe_homework();
CREATE TRIGGER zzzzzzz_plp_session_guard BEFORE INSERT OR UPDATE OR DELETE ON public.test_attempt_sessions FOR EACH ROW EXECUTE FUNCTION public.plp_guard_test_session();
CREATE TRIGGER a_plp_session_evidence AFTER INSERT ON public.test_attempt_sessions FOR EACH ROW EXECUTE FUNCTION public.plp_observe_test_session();
CREATE TRIGGER zzzzzzz_plp_attempt_guard BEFORE INSERT OR UPDATE OR DELETE ON public.test_attempts FOR EACH ROW EXECUTE FUNCTION public.plp_guard_test_attempt();
CREATE TRIGGER zzzzzzz_plp_progress_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lesson_progress FOR EACH ROW EXECUTE FUNCTION public.plp_guard_progress();
CREATE TRIGGER zzzzzzz_plp_enrollment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.plp_guard_enrollment();
CREATE TRIGGER a_plp_bind_enrollment AFTER INSERT ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.plp_bind_enrollment();
CREATE TRIGGER a_plp_completion_receipt AFTER UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.plp_observe_completion();
CREATE TRIGGER zzzzzzz_plp_course_guard BEFORE UPDATE OR DELETE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.plp_guard_curriculum();
CREATE TRIGGER zzzzzzz_plp_lesson_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.plp_guard_curriculum();
CREATE TRIGGER zzzzzzz_plp_bank_guard BEFORE INSERT OR UPDATE OR DELETE ON public.test_questions FOR EACH ROW EXECUTE FUNCTION public.plp_guard_curriculum();
CREATE TRIGGER plp_private_history_guard BEFORE INSERT OR UPDATE OR DELETE ON public.platform_course_learning_policies FOR EACH ROW EXECUTE FUNCTION public.plp_private_history_guard();
CREATE TRIGGER plp_private_history_guard BEFORE INSERT OR UPDATE OR DELETE ON public.platform_course_learning_bindings FOR EACH ROW EXECUTE FUNCTION public.plp_private_history_guard();
CREATE TRIGGER plp_private_history_guard BEFORE INSERT OR UPDATE OR DELETE ON public.platform_course_learning_evidence FOR EACH ROW EXECUTE FUNCTION public.plp_private_history_guard();
CREATE CONSTRAINT TRIGGER plp_new_evidence_source_at_commit AFTER INSERT ON public.platform_course_learning_evidence DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plp_validate_new_claim_at_commit();
CREATE CONSTRAINT TRIGGER plp_new_binding_source_at_commit AFTER INSERT ON public.platform_course_learning_bindings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.plp_validate_new_claim_at_commit();
DO $truncate_guards$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['courses','lessons','test_questions','enrollments','lesson_progress','homework_submissions','test_attempt_sessions','test_attempts','platform_course_learning_policies','platform_course_learning_bindings','platform_course_learning_evidence']LOOP
  EXECUTE format('CREATE TRIGGER zzzzzzz_plp_truncate_guard BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.plp_guard_truncate()',t);
 END LOOP;
END;$truncate_guards$;

-- The original deletion preview and final personal-row counter both already
-- call uc_learning_personal_counts. Its erase helper is called after deleting
-- core enrollment/activity rows, hence no cascading references are introduced.
-- Exact old definitions are generated into the separate privacy patch below;
-- root must apply that patch inside this transaction before COMMIT.
DO $plp_privacy_beforeimage$
BEGIN
 IF md5(pg_get_functiondef('public.uc_learning_personal_counts(uuid)'::regprocedure))<>'944b62f8a673a0633e0ebf8c997bed8c'
 OR md5(pg_get_functiondef('public.uc_learning_erase_user(uuid)'::regprocedure))<>'701bc7d6d2efba8e5d3f3c3c0f835691'
 THEN RAISE EXCEPTION 'PLP_PRIVACY_BEFOREIMAGE_CHANGED' USING ERRCODE='23514';END IF;
END;$plp_privacy_beforeimage$;
CREATE OR REPLACE FUNCTION public.uc_learning_personal_counts(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE result jsonb:='[]';t text;n bigint;BEGIN
 FOREACH t IN ARRAY ARRAY['uc_learning_criteria_versions','uc_learning_attestation_decisions','uc_learning_outcome_requests'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE participant_ids @> ARRAY[$1]::uuid[]',t) INTO n USING p_user;
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table',t,'column','participant_ids','count',n));END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['uc_learning_outcome_states','uc_learning_attempt_contexts','uc_learning_machine_results'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id=$1',t) INTO n USING p_user;
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table',t,'column','user_id','count',n));END IF;
 END LOOP;
 SELECT count(*)INTO n FROM public.platform_course_learning_bindings WHERE user_id=p_user;
 IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table','platform_course_learning_bindings','column','user_id','count',n));END IF;
 SELECT count(*)INTO n FROM public.platform_course_learning_evidence WHERE user_id=p_user OR actor_id=p_user;
 IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table','platform_course_learning_evidence','column','user_id_or_actor_id','count',n));END IF;
 RETURN result;
END;$function$;

CREATE OR REPLACE FUNCTION public.uc_learning_erase_user(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
 -- The original authenticated revocation and transaction-local erasure guard above
 -- is mandatory; no generic service bypass or permanent retention is added.
 DELETE FROM public.platform_course_learning_evidence WHERE user_id=p_user;
 DELETE FROM public.platform_course_learning_bindings WHERE user_id=p_user;
 UPDATE public.platform_course_learning_evidence SET actor_id=NULL,redacted=true WHERE actor_id=p_user;
 IF public.uc_learning_personal_counts(p_user)<>'[]'::jsonb THEN PERFORM public.uc_learning_error('DEPENDENCY_UNAVAILABLE');END IF;
END;$function$;


-- Strip *all* default new-object grants, including provider sandbox defaults.
-- Registration, evidence and hash helpers remain owner-only. Only the narrow
-- presentation proof RPC is callable by the original authenticated actor.
DO $new_acl$DECLARE r record;role_name text;BEGIN
 FOR r IN SELECT p.oid::regprocedure::text identity,p.proowner,a.grantee FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
  WHERE n.nspname='public'AND(p.proname LIKE'plp_%'OR p.proname='get_platform_learning_task_proof')AND a.grantee<>p.proowner LOOP
  IF r.grantee=0 THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',r.identity);
  ELSE EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',r.identity,pg_get_userbyid(r.grantee));END IF;
 END LOOP;
 FOR r IN SELECT c.oid::regclass::text identity,c.relowner,a.grantee FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a
  WHERE n.nspname='public'AND c.relname IN('platform_course_learning_policies','platform_course_learning_bindings','platform_course_learning_evidence')AND a.grantee<>c.relowner LOOP
  IF r.grantee=0 THEN EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC',r.identity);
  ELSE EXECUTE format('REVOKE ALL ON TABLE %s FROM %I',r.identity,pg_get_userbyid(r.grantee));END IF;
 END LOOP;
END;$new_acl$;
GRANT EXECUTE ON FUNCTION public.get_platform_learning_task_proof(uuid,uuid)TO authenticated;

-- PLP_EXACT_ROOT_REVIEWED_REGISTRATION_INSERT_HERE


-- Exact hashes pinned by root's independent readonly/live/native equivalence27Oct2026.
-- CANDIDATE ONLY: paste into the core migration registration marker in the SAME transaction.
-- Replace BOTH SHA placeholders with exact hashes observed in the reviewed dry-rollback
-- after material changes have finished. Never substitute a live self-computed hash
-- in the production commit: changed data must abort the beforeimage check.
SELECT public.plp_register_policy(
 '00327a03-f79c-5d5c-9f57-d3c46cc54bae','4ac2c05a-d8b5-4e72-ba31-f2c743091d95','00327a03-f79c-5d5c-9f57-d3c46cc54bae',
 '7eb6a3fcbf38df0a327e5464474d2923ea449e7766cb7e3d3a8219c1ba363ece','7eb6a3fcbf38df0a327e5464474d2923ea449e7766cb7e3d3a8219c1ba363ece',
 $plp_map_source$[{"sourceLessonId":"e93e2f93-b8e3-5a80-9d66-6788fb118f88","lessonId":"e93e2f93-b8e3-5a80-9d66-6788fb118f88"},{"sourceLessonId":"2eeb80ab-636e-54cb-a1c6-9e2045ddf513","lessonId":"2eeb80ab-636e-54cb-a1c6-9e2045ddf513"},{"sourceLessonId":"adcbde3e-d6c1-508f-b3bc-a6ca65c10af0","lessonId":"adcbde3e-d6c1-508f-b3bc-a6ca65c10af0"},{"sourceLessonId":"1b7f35b7-e97f-541d-af6f-b96f9bd34597","lessonId":"1b7f35b7-e97f-541d-af6f-b96f9bd34597"},{"sourceLessonId":"31eaf281-6591-5a18-844e-e10f7ebf17ee","lessonId":"31eaf281-6591-5a18-844e-e10f7ebf17ee"},{"sourceLessonId":"087e3aec-e124-5119-94a7-4699c9d14275","lessonId":"087e3aec-e124-5119-94a7-4699c9d14275"},{"sourceLessonId":"f97142a5-7dcd-5064-a5f0-9c2949c19f07","lessonId":"f97142a5-7dcd-5064-a5f0-9c2949c19f07"},{"sourceLessonId":"5c18f534-bb20-562a-99ac-372aa52f9e04","lessonId":"5c18f534-bb20-562a-99ac-372aa52f9e04"},{"sourceLessonId":"68c2b530-a259-5924-8f47-49395ae77811","lessonId":"68c2b530-a259-5924-8f47-49395ae77811"},{"sourceLessonId":"cc66955b-fe74-589a-9331-0db6951d4bd6","lessonId":"cc66955b-fe74-589a-9331-0db6951d4bd6"},{"sourceLessonId":"ab6e2737-1baf-5188-9534-987039e9f923","lessonId":"ab6e2737-1baf-5188-9534-987039e9f923"},{"sourceLessonId":"b4006135-f38c-534b-bda9-03656777c7b9","lessonId":"b4006135-f38c-534b-bda9-03656777c7b9"},{"sourceLessonId":"d850cf2c-1ca2-5a81-bd2a-bc25b3c771f1","lessonId":"d850cf2c-1ca2-5a81-bd2a-bc25b3c771f1"},{"sourceLessonId":"ed71b605-c937-5204-a0cb-232d7e5a67c6","lessonId":"ed71b605-c937-5204-a0cb-232d7e5a67c6"},{"sourceLessonId":"19b3ca08-1ef4-5708-92a9-95867d2dc997","lessonId":"19b3ca08-1ef4-5708-92a9-95867d2dc997"}]$plp_map_source$::jsonb,
 $plp_required_source$[{"sourceLessonId":"1b7f35b7-e97f-541d-af6f-b96f9bd34597","lessonId":"1b7f35b7-e97f-541d-af6f-b96f9bd34597","kind":"practice","minimum":null},{"sourceLessonId":"31eaf281-6591-5a18-844e-e10f7ebf17ee","lessonId":"31eaf281-6591-5a18-844e-e10f7ebf17ee","kind":"test","minimum":70},{"sourceLessonId":"5c18f534-bb20-562a-99ac-372aa52f9e04","lessonId":"5c18f534-bb20-562a-99ac-372aa52f9e04","kind":"practice","minimum":null},{"sourceLessonId":"68c2b530-a259-5924-8f47-49395ae77811","lessonId":"68c2b530-a259-5924-8f47-49395ae77811","kind":"test","minimum":70},{"sourceLessonId":"b4006135-f38c-534b-bda9-03656777c7b9","lessonId":"b4006135-f38c-534b-bda9-03656777c7b9","kind":"practice","minimum":null},{"sourceLessonId":"d850cf2c-1ca2-5a81-bd2a-bc25b3c771f1","lessonId":"d850cf2c-1ca2-5a81-bd2a-bc25b3c771f1","kind":"test","minimum":70},{"sourceLessonId":"ed71b605-c937-5204-a0cb-232d7e5a67c6","lessonId":"ed71b605-c937-5204-a0cb-232d7e5a67c6","kind":"practice","minimum":70}]$plp_required_source$::jsonb,false);
SELECT public.plp_register_policy(
 '64ea14ee-6e9b-4e0d-a82d-d48ae2bf5599','0e29e728-bcc5-46e6-a339-066fb1e9c726','00327a03-f79c-5d5c-9f57-d3c46cc54bae',
 '7eb6a3fcbf38df0a327e5464474d2923ea449e7766cb7e3d3a8219c1ba363ece','7dd9bfa04e9cf1bdf4a9412bf77b8737180b30bee06b50751d05dcbbb9faddfc',
 $plp_map_qa$[{"sourceLessonId":"e93e2f93-b8e3-5a80-9d66-6788fb118f88","lessonId":"bdbad446-f91b-433e-baf9-0863455b92f9"},{"sourceLessonId":"2eeb80ab-636e-54cb-a1c6-9e2045ddf513","lessonId":"f8f3ac74-6c6e-4b14-a892-2d8128698d0e"},{"sourceLessonId":"adcbde3e-d6c1-508f-b3bc-a6ca65c10af0","lessonId":"a91d88cd-5b56-48ee-bf88-81a84ea01b9a"},{"sourceLessonId":"1b7f35b7-e97f-541d-af6f-b96f9bd34597","lessonId":"58b886ce-afaf-4c9e-9eff-0ad6014c0650"},{"sourceLessonId":"31eaf281-6591-5a18-844e-e10f7ebf17ee","lessonId":"6007ace5-c528-4c54-9360-a81d4ae92fe1"},{"sourceLessonId":"087e3aec-e124-5119-94a7-4699c9d14275","lessonId":"204b6a72-495b-457b-b1de-9c0a3ab2ca3e"},{"sourceLessonId":"f97142a5-7dcd-5064-a5f0-9c2949c19f07","lessonId":"9e370be6-79f4-4563-b1e0-c445eddcd238"},{"sourceLessonId":"5c18f534-bb20-562a-99ac-372aa52f9e04","lessonId":"5d192216-8760-4869-aef9-0c19e5f427f0"},{"sourceLessonId":"68c2b530-a259-5924-8f47-49395ae77811","lessonId":"54333d58-37e5-4f23-85ed-dac69625bced"},{"sourceLessonId":"cc66955b-fe74-589a-9331-0db6951d4bd6","lessonId":"f647ff82-8fa3-45c5-9284-ce537011589f"},{"sourceLessonId":"ab6e2737-1baf-5188-9534-987039e9f923","lessonId":"7ad07c86-ab2f-4c7b-ae6e-1306e0585b75"},{"sourceLessonId":"b4006135-f38c-534b-bda9-03656777c7b9","lessonId":"e3c2bddd-6c47-4309-89b9-d0e9ce6485ff"},{"sourceLessonId":"d850cf2c-1ca2-5a81-bd2a-bc25b3c771f1","lessonId":"4d7607ae-b16e-4f98-b0e8-b7abc8092338"},{"sourceLessonId":"ed71b605-c937-5204-a0cb-232d7e5a67c6","lessonId":"de3f3d64-0d41-43fc-b615-b001d91b2a62"},{"sourceLessonId":"19b3ca08-1ef4-5708-92a9-95867d2dc997","lessonId":"f641396c-22a2-41f5-9f27-6d82c288256e"}]$plp_map_qa$::jsonb,
 $plp_required_qa$[{"sourceLessonId":"1b7f35b7-e97f-541d-af6f-b96f9bd34597","lessonId":"58b886ce-afaf-4c9e-9eff-0ad6014c0650","kind":"practice","minimum":null},{"sourceLessonId":"31eaf281-6591-5a18-844e-e10f7ebf17ee","lessonId":"6007ace5-c528-4c54-9360-a81d4ae92fe1","kind":"test","minimum":70},{"sourceLessonId":"5c18f534-bb20-562a-99ac-372aa52f9e04","lessonId":"5d192216-8760-4869-aef9-0c19e5f427f0","kind":"practice","minimum":null},{"sourceLessonId":"68c2b530-a259-5924-8f47-49395ae77811","lessonId":"54333d58-37e5-4f23-85ed-dac69625bced","kind":"test","minimum":70},{"sourceLessonId":"b4006135-f38c-534b-bda9-03656777c7b9","lessonId":"e3c2bddd-6c47-4309-89b9-d0e9ce6485ff","kind":"practice","minimum":null},{"sourceLessonId":"d850cf2c-1ca2-5a81-bd2a-bc25b3c771f1","lessonId":"4d7607ae-b16e-4f98-b0e8-b7abc8092338","kind":"test","minimum":70},{"sourceLessonId":"ed71b605-c937-5204-a0cb-232d7e5a67c6","lessonId":"de3f3d64-0d41-43fc-b615-b001d91b2a62","kind":"practice","minimum":70}]$plp_required_qa$::jsonb,true);
-- Root must materialize pinned hashes and the exact source/QA15-map registration
-- in this same transaction. Deliberately not guessed from current rows here.

