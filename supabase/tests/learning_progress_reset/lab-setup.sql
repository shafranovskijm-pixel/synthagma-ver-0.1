-- ISOLATED LAB ONLY. Never run on production. Fresh disposable PostgreSQL database owned by postgres.
-- Auth/access stand-ins below use synthetic test.actor solely in this lab, not real JWT/Auth.
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')THEN CREATE ROLE service_role NOLOGIN;END IF;
END$$;
CREATE SCHEMA auth;
CREATE TABLE public.lab_progress_reset_fixture_marker(value text PRIMARY KEY CHECK(value='ISOLATED_SYNTHETIC_ONLY'));
INSERT INTO public.lab_progress_reset_fixture_marker VALUES('ISOLATED_SYNTHETIC_ONLY');
CREATE TYPE public.app_role AS ENUM('admin','organization','student');
CREATE FUNCTION auth.uid()RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE FUNCTION auth.role()RETURNS text LANGUAGE sql STABLE AS $$SELECT current_user::text$$;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;

CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text,description text,branding jsonb,student_dashboard_settings jsonb,subscription_plan text);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid,blocked_at timestamptz,full_name text,onboarding_completed boolean);
CREATE TABLE public.lab_staff(user_id uuid,organization_id uuid,PRIMARY KEY(user_id,organization_id));
CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY);
CREATE TABLE public.lab_withdrawn(enrollment_id uuid PRIMARY KEY);
CREATE TABLE public.courses(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),title text,is_published boolean DEFAULT true,
 description text,duration integer,skip_video_identification boolean DEFAULT true,cover_image_url text,landing_content jsonb DEFAULT '{}');
CREATE TABLE public.lessons(id uuid PRIMARY KEY,course_id uuid REFERENCES courses(id),title text,type text,order_index integer,
 test_show_answers boolean DEFAULT true,test_passing_score integer DEFAULT 70,test_max_attempts integer DEFAULT 2,
 test_max_attempts_per_day integer DEFAULT 20,test_questions_to_show integer DEFAULT 0);
CREATE TABLE public.enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,course_id uuid REFERENCES courses(id),
 progress integer NOT NULL DEFAULT 0,time_spent integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'active',
 started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,access_days integer,expires_at timestamptz,
 document_facts_revision bigint NOT NULL DEFAULT 0,UNIQUE(user_id,course_id));
CREATE TABLE public.lesson_progress(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,lesson_id uuid REFERENCES lessons(id),
 completed boolean NOT NULL DEFAULT false,time_spent integer NOT NULL DEFAULT 0,completed_at timestamptz,
 video_position real DEFAULT 0,video_duration real DEFAULT 0,UNIQUE(user_id,lesson_id));
CREATE TABLE public.course_manual_credits(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),enrollment_id uuid REFERENCES enrollments(id),
 credited_by uuid,credited_at timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz,revoked_by uuid);
CREATE TABLE public.homework_submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lesson_id uuid,student_id uuid,course_id uuid,
 organization_id uuid,content text,attachments jsonb DEFAULT '[]',status text DEFAULT 'pending',score integer,reviewer_id uuid,reviewer_comment text,
 submitted_at timestamptz DEFAULT clock_timestamp(),reviewed_at timestamptz,created_at timestamptz DEFAULT clock_timestamp());
CREATE UNIQUE INDEX csz_homework_one_pending_per_lesson ON public.homework_submissions(student_id,lesson_id)
 WHERE(course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])AND status='pending');
CREATE TABLE public.test_questions(id uuid PRIMARY KEY,lesson_id uuid,question text,options jsonb,correct_answer integer,order_index integer,
 explanation text,image_url text,is_bank_question boolean DEFAULT false);
CREATE TABLE public.test_attempt_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,lesson_id uuid,request_id uuid,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),submitted_at timestamptz,status text DEFAULT 'in_progress',
 questions_snapshot jsonb,passing_score integer,show_answers boolean,requires_final_test_photo boolean DEFAULT false,
 UNIQUE(user_id,lesson_id,request_id),CHECK(status IN('in_progress','completed')),CHECK((status='completed')=(submitted_at IS NOT NULL)));
CREATE UNIQUE INDEX test_attempt_sessions_one_active ON public.test_attempt_sessions(user_id,lesson_id)WHERE status='in_progress';
CREATE TABLE public.test_attempt_start_requests(user_id uuid,lesson_id uuid,request_id uuid,session_id uuid REFERENCES test_attempt_sessions(id),
 PRIMARY KEY(user_id,lesson_id,request_id));
CREATE TABLE public.test_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,lesson_id uuid,session_id uuid,
 started_at timestamptz,completed_at timestamptz,score integer,max_score integer,answers jsonb,shown_question_ids jsonb DEFAULT '[]',
 passing_score integer,passed boolean);
CREATE TABLE public.final_test_photo_challenges(id uuid PRIMARY KEY,user_id uuid,lesson_id uuid,course_id uuid,enrollment_id uuid,
 request_id uuid,session_id uuid,completed_at timestamptz,expires_at timestamptz);
CREATE TABLE public.platform_course_learning_policies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid);
CREATE TABLE public.platform_course_learning_bindings(enrollment_id uuid PRIMARY KEY);
CREATE TABLE public.labor_safety_profiles(user_id uuid,organization_id uuid,created_at timestamptz);
CREATE TABLE public.student_identity_documents(user_id uuid,organization_id uuid,type text);
CREATE TABLE public.video_identifications(user_id uuid,organization_id uuid,status text);

CREATE FUNCTION public.account_deletion_access_allowed()RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT auth.uid()IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid())$$;
CREATE FUNCTION public.uc_enrollment_is_withdrawn(p uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM public.lab_withdrawn WHERE enrollment_id=p)$$;
CREATE FUNCTION public.can_access_organization(p uuid,permission text)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM public.lab_staff WHERE user_id=auth.uid()AND organization_id=p)$$;
CREATE FUNCTION public.can_access_course(p uuid,permission text DEFAULT 'courses.read')RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=p AND public.can_access_organization(c.organization_id,permission))$$;
CREATE FUNCTION public.can_access_course_as_learner(p uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id
 JOIN public.profiles pr ON pr.user_id=e.user_id AND pr.organization_id=c.organization_id
 WHERE e.user_id=auth.uid()AND e.course_id=p AND e.status IN('active','completed')
 AND NOT public.uc_enrollment_is_withdrawn(e.id)AND(e.expires_at IS NULL OR e.expires_at>now()OR e.status='completed'))$$;
CREATE FUNCTION public._paid_20260922_lesson_read(p uuid,a boolean,b boolean)RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION public._final_test_photo_required(p uuid)RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION public._final_test_photo_object_valid(p uuid)RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION public._test_normalize_options(p jsonb,k integer)RETURNS jsonb LANGUAGE sql AS $$SELECT p$$;
CREATE FUNCTION public._test_public_questions(p jsonb,s boolean)RETURNS jsonb LANGUAGE sql AS $$SELECT p$$;
CREATE FUNCTION public._test_session_payload(p uuid)RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
 SELECT jsonb_build_object('attemptId',id,'questions',questions_snapshot,'status',status)FROM public.test_attempt_sessions WHERE id=p$$;
CREATE FUNCTION public._test_grade_payload(p uuid)RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
 SELECT jsonb_build_object('passed',passed,'scorePercent',round(score*100.0/max_score)::integer)FROM public.test_attempts WHERE session_id=p$$;
CREATE FUNCTION public.plp_sha(p jsonb)RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT md5(p::text)$$;
CREATE FUNCTION public.has_role(p uuid,r public.app_role)RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION public.is_student_profile(p uuid,o uuid)RETURNS boolean LANGUAGE sql AS $$SELECT true$$;

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_enrollment_read ON public.enrollments FOR SELECT TO authenticated USING(user_id=auth.uid()OR can_access_course(course_id,'students.read'));
CREATE POLICY own_enrollment_write ON public.enrollments FOR UPDATE TO authenticated USING(user_id=auth.uid()OR can_access_course(course_id,'students.write'));
CREATE POLICY own_progress ON public.lesson_progress FOR ALL TO authenticated USING(user_id=auth.uid())WITH CHECK(user_id=auth.uid());
CREATE POLICY own_hw_read ON public.homework_submissions FOR SELECT TO authenticated USING(student_id=auth.uid()OR can_access_course(course_id,'homework.read'));
CREATE POLICY own_hw_insert ON public.homework_submissions FOR INSERT TO authenticated WITH CHECK(student_id=auth.uid());
CREATE POLICY own_hw_review ON public.homework_submissions FOR UPDATE TO authenticated USING(can_access_course(course_id,'homework.write'));
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.lesson_progress,public.homework_submissions TO authenticated;
GRANT UPDATE ON public.enrollments TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
-- No write grant/policy on sessions, attempts, start-requests: server APIs own those rows.

CREATE OR REPLACE FUNCTION public.recalc_enrollment_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_course_id uuid;
  v_user_id uuid;
  v_total int;
  v_done int;
  v_progress int;
BEGIN
  -- Определяем урок (для DELETE берём OLD)
  IF TG_OP = 'DELETE' THEN
    SELECT course_id INTO v_course_id FROM lessons WHERE id = OLD.lesson_id;
    v_user_id := OLD.user_id;
  ELSE
    SELECT course_id INTO v_course_id FROM lessons WHERE id = NEW.lesson_id;
    v_user_id := NEW.user_id;
  END IF;

  IF v_course_id IS NULL OR v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Считаем общее количество уроков и пройденных
  SELECT COUNT(*) INTO v_total FROM lessons WHERE course_id = v_course_id;
  IF v_total = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_done
  FROM lesson_progress lp
  JOIN lessons l ON l.id = lp.lesson_id
  WHERE l.course_id = v_course_id
    AND lp.user_id = v_user_id
    AND lp.completed = true;

  v_progress := LEAST(100, GREATEST(0, (v_done * 100) / v_total));

  -- Обновляем enrollment, если он существует и прогресс изменился в большую сторону
  -- (не уменьшаем прогресс автоматически, чтобы не откатывать ручные правки)
  UPDATE enrollments
  SET progress = v_progress
  WHERE user_id = v_user_id
    AND course_id = v_course_id
    AND progress < v_progress
    AND NOT public.uc_enrollment_is_withdrawn(enrollments.id);

  RETURN COALESCE(NEW, OLD);
END;
$function$;
CREATE OR REPLACE FUNCTION public.auto_complete_enrollment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.progress >= 100 AND NEW.status = 'active' AND NOT public.uc_enrollment_is_withdrawn(NEW.id) THEN
    NEW.status := 'completed';
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.revoke_manual_credit_on_course_reset()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed')
    OR OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.course_id IS DISTINCT FROM NEW.course_id THEN
    UPDATE public.course_manual_credits
    SET revoked_at = now(), revoked_by = auth.uid()
    WHERE enrollment_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public._test_manual_credit(p_lesson_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_credit jsonb;
BEGIN
  -- The following migration installs the manual-credit table. Safe during rollout.
  IF to_regclass('public.course_manual_credits') IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object('creditedAt', mc.credited_at, 'creditedBy', mc.credited_by)
    INTO v_credit
  FROM public.course_manual_credits mc
  JOIN public.enrollments e ON e.id = mc.enrollment_id
  JOIN public.lessons l ON l.course_id = e.course_id
  WHERE l.id = p_lesson_id AND e.user_id = auth.uid() AND mc.revoked_at IS NULL
  ORDER BY mc.credited_at DESC LIMIT 1;
  RETURN v_credit;
END;
$function$;
CREATE OR REPLACE FUNCTION public._assert_test_learner_access(p_lesson_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public._paid_20260922_lesson_read(p_lesson_id,false,true) THEN
    RAISE EXCEPTION 'Paid test content is not available for this user' USING ERRCODE='42501';
  END IF;
  IF auth.uid() IS NULL OR EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND blocked_at IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.lessons l JOIN public.courses c ON c.id = l.course_id
    WHERE l.id = p_lesson_id AND l.type = 'test' AND c.is_published = true
      AND public.can_access_course_as_learner(c.id)
  ) THEN
    RAISE EXCEPTION 'Test is not available for this learner' USING ERRCODE = '42501';
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.csz_guard_homework_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_scope boolean; v_lesson public.lessons%ROWTYPE; v_org uuid;
  v_enrollment public.enrollments%ROWTYPE; v_latest public.homework_submissions%ROWTYPE;
BEGIN
  v_scope := (TG_OP<>'INSERT' AND (OLD.course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
    OR EXISTS(SELECT 1 FROM public.lessons WHERE id=OLD.lesson_id AND course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]))))
    OR (TG_OP<>'DELETE' AND (NEW.course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
    OR EXISTS(SELECT 1 FROM public.lessons WHERE id=NEW.lesson_id AND course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]))));
  IF NOT coalesce(v_scope,false) THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'S022: READ COMMITTED required' USING ERRCODE='25000'; END IF;
  PERFORM pg_advisory_xact_lock(7630559,178); -- also serializes protected curriculum changes
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'S022: protected homework history cannot be deleted' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND
    (to_jsonb(NEW)-ARRAY['status','score','reviewer_id','reviewer_comment','reviewed_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','score','reviewer_id','reviewer_comment','reviewed_at']) THEN
    RAISE EXCEPTION 'S022: immutable homework identity/content/order' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_enrollment FROM public.enrollments
    WHERE user_id=NEW.student_id AND course_id=NEW.course_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'S022: enrollment required' USING ERRCODE='42501'; END IF;
  -- These are separate commands AFTER the potentially blocking enrollment SELECT.
  SELECT * INTO v_lesson FROM public.lessons WHERE id=NEW.lesson_id;
  SELECT organization_id INTO v_org FROM public.courses WHERE id=NEW.course_id;
  IF (NEW.course_id IS DISTINCT FROM '7630559a-6caf-42e7-97f9-1cd0e4598c39'::uuid AND NEW.course_id IS DISTINCT FROM '7e5bc4e6-0629-4186-9745-a821cbe7255a'::uuid)
    OR v_lesson.course_id IS DISTINCT FROM NEW.course_id OR v_lesson.type IS DISTINCT FROM 'homework'
    OR NEW.organization_id IS DISTINCT FROM v_org
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=NEW.student_id AND organization_id=v_org) THEN
    RAISE EXCEPTION 'S022: invalid homework context' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_latest FROM public.homework_submissions
    WHERE student_id=NEW.student_id AND course_id=NEW.course_id AND lesson_id=NEW.lesson_id
    ORDER BY submitted_at DESC,id DESC LIMIT 1;
  IF TG_OP='INSERT' THEN
    IF auth.uid() IS DISTINCT FROM NEW.student_id OR NOT public.can_access_course_as_learner(NEW.course_id)
      OR v_enrollment.status<>'active' OR NEW.status<>'pending'
      OR NEW.score IS NOT NULL OR NEW.reviewer_id IS NOT NULL OR NEW.reviewer_comment IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'S022: only own eligible pending submission is allowed' USING ERRCODE='42501';
    END IF;
    IF v_latest.id IS NOT NULL AND v_latest.status NOT IN ('revision','rejected') THEN
      RAISE EXCEPTION 'S022: latest submission does not permit resubmission' USING ERRCODE='23514';
    END IF;
    NEW.submitted_at:=greatest(clock_timestamp(),v_latest.submitted_at+interval '1 microsecond');
    NEW.created_at:=NEW.submitted_at;
  ELSE
    IF auth.uid() IS NULL OR auth.uid()=NEW.student_id OR NOT public.can_access_course(NEW.course_id,'homework.write') THEN
      RAISE EXCEPTION 'S022: homework.write on the actual course required' USING ERRCODE='42501';
    END IF;
    IF v_latest.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'S022: stale homework review' USING ERRCODE='23514'; END IF;
    IF NEW.status NOT IN ('approved','revision','rejected') OR (NEW.score IS NOT NULL AND NEW.score NOT BETWEEN 0 AND 100) THEN
      RAISE EXCEPTION 'S022: invalid review status/score' USING ERRCODE='23514';
    END IF;
    IF OLD.status='approved' AND NEW.status<>'approved' AND
      (v_enrollment.status='completed' OR EXISTS(SELECT 1 FROM public.lesson_progress
        WHERE user_id=NEW.student_id AND lesson_id=NEW.lesson_id AND completed)) THEN
      RAISE EXCEPTION 'S022: staff reset required before withdrawing completed approval' USING ERRCODE='23514';
    END IF;
    NEW.reviewer_id:=auth.uid(); NEW.reviewed_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_recalc_enrollment_progress AFTER INSERT OR UPDATE OR DELETE ON public.lesson_progress FOR EACH ROW EXECUTE FUNCTION public.recalc_enrollment_progress();
CREATE TRIGGER trigger_auto_complete_enrollment BEFORE INSERT OR UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.auto_complete_enrollment();
CREATE TRIGGER revoke_manual_credit_on_course_reset AFTER UPDATE OF status,user_id,course_id ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.revoke_manual_credit_on_course_reset();
CREATE TRIGGER zzzz_csz_homework_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.homework_submissions FOR EACH ROW EXECUTE FUNCTION public.csz_guard_homework_submission();

