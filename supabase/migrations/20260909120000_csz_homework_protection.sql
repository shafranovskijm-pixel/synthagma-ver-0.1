-- S022 scope update: retain old CSZ and protect new 34-hour CSZ UUID.
-- Advisory lock (7630559,178) is a shared synchronization key, not course hours.
-- S022 local candidate. Course-specific; no historical data repair or global ACL changes.
-- Reviewed manifest + S022_LOCAL_IMPLEMENTATION_ACCEPTANCE_20260909.md govern release.
BEGIN;
-- Freeze writers BEFORE validating existing rows, otherwise old permissive policies could
-- admit incompatible history between the validation snapshot and guard installation.
LOCK TABLE public.courses,public.lessons,public.enrollments,public.homework_submissions,public.lesson_progress
  IN SHARE ROW EXCLUSIVE MODE;

-- Reject ambiguous existing history; never choose a convenient old approved row.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.homework_submissions h
    LEFT JOIN public.lessons l ON l.id=h.lesson_id
    LEFT JOIN public.courses c ON c.id=h.course_id
    WHERE (h.course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
      OR l.course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]))
      AND (l.course_id IS DISTINCT FROM h.course_id OR c.organization_id IS DISTINCT FROM h.organization_id
        OR l.type IS DISTINCT FROM 'homework' OR h.status NOT IN ('pending','approved','revision','rejected')
        OR h.submitted_at > clock_timestamp())
  ) OR EXISTS (
    SELECT 1 FROM public.homework_submissions
    WHERE course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
    GROUP BY student_id,lesson_id,submitted_at HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'S022 preflight: incompatible protected homework history; manual review required' USING ERRCODE='23514';
  END IF;
END;
$preflight$;

CREATE FUNCTION public.csz_homework_select_allowed(p_student uuid,p_course uuid,p_lesson uuid,p_org uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_course uuid; v_org uuid;
BEGIN
  SELECT l.course_id,c.organization_id INTO v_course,v_org FROM public.lessons l
    JOIN public.courses c ON c.id=l.course_id WHERE l.id=p_lesson;
  IF (p_course IS DISTINCT FROM '7630559a-6caf-42e7-97f9-1cd0e4598c39'::uuid AND p_course IS DISTINCT FROM '7e5bc4e6-0629-4186-9745-a821cbe7255a'::uuid)
    AND (v_course IS DISTINCT FROM '7630559a-6caf-42e7-97f9-1cd0e4598c39'::uuid AND v_course IS DISTINCT FROM '7e5bc4e6-0629-4186-9745-a821cbe7255a'::uuid) THEN RETURN true; END IF;
  IF auth.uid() IS NULL OR p_course IS DISTINCT FROM v_course OR p_org IS DISTINCT FROM v_org THEN RETURN false; END IF;
  RETURN (p_student=auth.uid() AND public.can_access_course_as_learner(p_course))
    OR public.can_access_course(p_course,'homework.read') OR public.can_access_course(p_course,'homework.write');
END;
$fn$;
REVOKE ALL ON FUNCTION public.csz_homework_select_allowed(uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.csz_homework_select_allowed(uuid,uuid,uuid,uuid) TO authenticated;

-- VOLATILE intentionally: critical reads use a fresh SPI statement snapshot after the lock.
CREATE FUNCTION public.csz_latest_homework_approved(p_student uuid,p_course uuid,p_lesson uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_status text;
BEGIN
  SELECT h.status INTO v_status FROM public.homework_submissions h
    JOIN public.lessons l ON l.id=h.lesson_id AND l.course_id=h.course_id AND l.type='homework'
    JOIN public.courses c ON c.id=h.course_id AND c.organization_id=h.organization_id
    WHERE h.student_id=p_student AND h.course_id=p_course AND h.lesson_id=p_lesson
    ORDER BY h.submitted_at DESC,h.id DESC LIMIT 1;
  RETURN coalesce(v_status='approved',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.csz_latest_homework_approved(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

ALTER POLICY hw_select_student ON public.homework_submissions USING (
  CASE WHEN course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
    THEN public.csz_homework_select_allowed(student_id,course_id,lesson_id,organization_id)
    ELSE student_id=auth.uid() OR organization_id=public.current_organization_id()
      OR public.has_role('admin'::public.app_role,auth.uid()) END
);
CREATE POLICY csz_homework_select_guard ON public.homework_submissions AS RESTRICTIVE
  FOR SELECT TO authenticated USING(public.csz_homework_select_allowed(student_id,course_id,lesson_id,organization_id));
ALTER POLICY hw_update_reviewer ON public.homework_submissions USING (
  CASE WHEN course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
    THEN public.can_access_course(course_id,'homework.write')
    ELSE (public.has_role('organization'::public.app_role,auth.uid()) AND organization_id=public.current_organization_id())
      OR public.has_role('admin'::public.app_role,auth.uid()) END
) WITH CHECK (
  CASE WHEN course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
    THEN public.can_access_course(course_id,'homework.write')
    ELSE (public.has_role('organization'::public.app_role,auth.uid()) AND organization_id=public.current_organization_id())
      OR public.has_role('admin'::public.app_role,auth.uid()) END
);

CREATE FUNCTION public.csz_guard_homework_submission()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
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
$fn$;
REVOKE ALL ON FUNCTION public.csz_guard_homework_submission() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzzz_csz_homework_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.homework_submissions
  FOR EACH ROW EXECUTE FUNCTION public.csz_guard_homework_submission();
CREATE UNIQUE INDEX csz_homework_one_pending_per_lesson ON public.homework_submissions(student_id,lesson_id)
  WHERE course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]) AND status='pending';

CREATE FUNCTION public.csz_guard_lesson_progress()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_scope boolean; v_user uuid; v_lid uuid; v_lesson public.lessons%ROWTYPE;
  v_e public.enrollments%ROWTYPE; v_credit timestamptz; v_staff boolean;
BEGIN
  v_scope := EXISTS(SELECT 1 FROM public.lessons WHERE course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
    AND ((TG_OP<>'INSERT' AND id=OLD.lesson_id) OR (TG_OP<>'DELETE' AND id=NEW.lesson_id)));
  IF NOT v_scope THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'S022: READ COMMITTED required' USING ERRCODE='25000'; END IF;
  PERFORM pg_advisory_xact_lock(7630559,178);
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id) THEN
    RAISE EXCEPTION 'S022: immutable progress identity' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN v_user:=OLD.user_id; v_lid:=OLD.lesson_id; ELSE v_user:=NEW.user_id; v_lid:=NEW.lesson_id; END IF;
  SELECT e.* INTO v_e FROM public.enrollments e JOIN public.lessons l ON l.course_id=e.course_id
    WHERE e.user_id=v_user AND l.id=v_lid FOR UPDATE OF e;
  IF NOT FOUND THEN RAISE EXCEPTION 'S022: enrollment required for progress' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_lesson FROM public.lessons WHERE id=v_lid;
  IF v_lesson.course_id IS DISTINCT FROM v_e.course_id THEN RAISE EXCEPTION 'S022: invalid progress context' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.courses c ON c.organization_id=p.organization_id
    WHERE p.user_id=v_user AND c.id=v_e.course_id) THEN
    RAISE EXCEPTION 'S022: progress student/tenant mismatch' USING ERRCODE='42501';
  END IF;
  v_staff:=coalesce(public.can_access_course(v_e.course_id,'students.write'),false);
  IF auth.uid() IS NULL OR NOT (v_staff OR (auth.uid()=v_user AND public.can_access_course_as_learner(v_e.course_id))) THEN
    RAISE EXCEPTION 'S022: unauthorized progress write' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN
    IF NOT v_staff THEN RAISE EXCEPTION 'S022: staff reset required' USING ERRCODE='42501'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.completed AND NOT NEW.completed THEN
    RAISE EXCEPTION 'S022: use staff reset to clear completed progress' USING ERRCODE='42501';
  END IF;
  SELECT credited_at INTO v_credit FROM public.course_manual_credits WHERE enrollment_id=v_e.id AND revoked_at IS NULL;
  IF NEW.completed THEN
    IF v_lesson.type='homework' AND v_credit IS NULL AND NOT public.csz_latest_homework_approved(v_user,v_e.course_id,v_lid) THEN
      RAISE EXCEPTION 'S022: latest homework must be approved' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND OLD.completed THEN NEW.completed_at:=coalesce(OLD.completed_at,v_credit,clock_timestamp());
    ELSE NEW.completed_at:=coalesce(v_credit,clock_timestamp()); END IF;
  ELSE NEW.completed_at:=NULL;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.csz_guard_lesson_progress() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzzz_csz_lesson_progress_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lesson_progress
  FOR EACH ROW EXECUTE FUNCTION public.csz_guard_lesson_progress();

CREATE FUNCTION public.csz_guard_enrollment()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_staff boolean; v_org uuid; v_credit timestamptz; v_total integer; v_done integer; v_ceiling integer;
BEGIN
  IF NOT ((TG_OP<>'INSERT' AND OLD.course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]))
    OR (TG_OP<>'DELETE' AND NEW.course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]))) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'S022: READ COMMITTED required' USING ERRCODE='25000'; END IF;
  PERFORM pg_advisory_xact_lock(7630559,178);
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'S022: protected enrollment/history cannot be deleted' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.course_id IS DISTINCT FROM OLD.course_id THEN
      RAISE EXCEPTION 'S022: immutable enrollment identity' USING ERRCODE='42501';
    END IF;
    -- Executor owns the row lock already; explicit lock documents the shared lock contract.
    PERFORM 1 FROM public.enrollments WHERE id=OLD.id FOR UPDATE;
  END IF;
  SELECT organization_id INTO v_org FROM public.courses WHERE id=NEW.course_id;
  v_staff:=coalesce(public.can_access_course(NEW.course_id,'students.write'),false);
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=NEW.user_id AND organization_id=v_org) THEN
    RAISE EXCEPTION 'S022: invalid enrollment actor/tenant' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NOT v_staff OR NEW.status<>'active' OR NEW.progress<>0 OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'S022: only staff may create an initial enrollment' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT v_staff AND (auth.uid() IS DISTINCT FROM OLD.user_id OR NOT public.can_access_course_as_learner(OLD.course_id)
    OR NEW.access_days IS DISTINCT FROM OLD.access_days OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at) THEN
    RAISE EXCEPTION 'S022: enrollment identity/access cannot be self-edited' USING ERRCODE='42501';
  END IF;
  IF NEW.status='active' AND NEW.progress=0 AND NEW.completed_at IS NULL
    AND (OLD.status='completed' OR OLD.progress<>0 OR OLD.completed_at IS NOT NULL) THEN
    IF NOT v_staff OR EXISTS(SELECT 1 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id
      WHERE lp.user_id=NEW.user_id AND l.course_id=NEW.course_id) THEN
      RAISE EXCEPTION 'S022: staff reset must clear target lesson progress first' USING ERRCODE='42501';
    END IF;
    RETURN NEW; -- existing S001 AFTER trigger revokes the active credit
  END IF;
  IF NEW.status NOT IN ('active','completed') AND NOT v_staff THEN
    RAISE EXCEPTION 'S022: learner cannot change enrollment lifecycle' USING ERRCODE='42501';
  END IF;
  IF OLD.status='completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'S022: use staff reset to reopen a completed enrollment' USING ERRCODE='42501';
  END IF;
  SELECT credited_at INTO v_credit FROM public.course_manual_credits WHERE enrollment_id=NEW.id AND revoked_at IS NULL;
  SELECT count(*),count(*) FILTER (WHERE lp.completed AND
    (l.type<>'homework' OR v_credit IS NOT NULL OR public.csz_latest_homework_approved(NEW.user_id,NEW.course_id,l.id)))
    INTO v_total,v_done FROM public.lessons l
    LEFT JOIN public.lesson_progress lp ON lp.lesson_id=l.id AND lp.user_id=NEW.user_id WHERE l.course_id=NEW.course_id;
  v_ceiling:=CASE WHEN v_total=0 THEN 0 ELSE round(v_done*100.0/v_total)::integer END;
  IF NEW.progress<0 OR NEW.progress>v_ceiling
    OR ((NEW.progress=100 OR NEW.status='completed') AND (v_total=0 OR v_done<>v_total)) THEN
    RAISE EXCEPTION 'S022: enrollment exceeds accepted lesson progress' USING ERRCODE='23514';
  END IF;
  IF NEW.status='completed' THEN
    IF OLD.status='completed' THEN NEW.completed_at:=coalesce(OLD.completed_at,v_credit,clock_timestamp());
    ELSE NEW.completed_at:=coalesce(v_credit,clock_timestamp()); END IF;
  ELSE NEW.completed_at:=NULL;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.csz_guard_enrollment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzzz_csz_enrollment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.csz_guard_enrollment();

CREATE FUNCTION public.csz_guard_lesson_metadata()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF NOT ((TG_OP<>'INSERT' AND OLD.course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]))
    OR (TG_OP<>'DELETE' AND NEW.course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]))) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'S022: READ COMMITTED required' USING ERRCODE='25000'; END IF;
  PERFORM pg_advisory_xact_lock(7630559,178);
  IF auth.uid() IS NULL OR NOT public.can_access_course(CASE WHEN TG_OP='DELETE' THEN OLD.course_id ELSE NEW.course_id END,'courses.write') THEN
    RAISE EXCEPTION 'S022: courses.write required for protected lesson metadata' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.course_id IS DISTINCT FROM OLD.course_id) THEN
    RAISE EXCEPTION 'S022: protected lesson cannot change identity/scope' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.csz_guard_lesson_metadata() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzzz_csz_lesson_metadata_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.csz_guard_lesson_metadata();

CREATE FUNCTION public.csz_guard_course_anchor()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF NOT ((TG_OP<>'INSERT' AND OLD.id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]))
    OR (TG_OP<>'DELETE' AND NEW.id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]))) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'S022: READ COMMITTED required' USING ERRCODE='25000'; END IF;
  PERFORM pg_advisory_xact_lock(7630559,178);
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id)) THEN
    RAISE EXCEPTION 'S022: protected course anchor cannot be removed/reassigned' USING ERRCODE='42501';
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_access_organization(NEW.organization_id,'courses.write') THEN
    RAISE EXCEPTION 'S022: courses.write required for protected course' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.csz_guard_course_anchor() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzzz_csz_course_anchor_guard BEFORE INSERT OR UPDATE OR DELETE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.csz_guard_course_anchor();

CREATE FUNCTION public.csz_guard_protected_truncate()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  -- Statement guard: RLS and row triggers do not protect TRUNCATE (including CASCADE).
  -- A pre-existing REPEATABLE READ snapshot must not miss a concurrently created anchor.
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'S022: READ COMMITTED required for TRUNCATE' USING ERRCODE='25000'; END IF;
  PERFORM pg_advisory_xact_lock(7630559,178);
  IF EXISTS(SELECT 1 FROM public.courses WHERE id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])) THEN
    RAISE EXCEPTION 'S022: TRUNCATE forbidden while protected course exists' USING ERRCODE='42501';
  END IF;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.csz_guard_protected_truncate() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zzzz_csz_protected_truncate_guard BEFORE TRUNCATE ON public.homework_submissions
  FOR EACH STATEMENT EXECUTE FUNCTION public.csz_guard_protected_truncate();
CREATE TRIGGER zzzz_csz_protected_truncate_guard BEFORE TRUNCATE ON public.lesson_progress
  FOR EACH STATEMENT EXECUTE FUNCTION public.csz_guard_protected_truncate();
CREATE TRIGGER zzzz_csz_protected_truncate_guard BEFORE TRUNCATE ON public.enrollments
  FOR EACH STATEMENT EXECUTE FUNCTION public.csz_guard_protected_truncate();
CREATE TRIGGER zzzz_csz_protected_truncate_guard BEFORE TRUNCATE ON public.lessons
  FOR EACH STATEMENT EXECUTE FUNCTION public.csz_guard_protected_truncate();
CREATE TRIGGER zzzz_csz_protected_truncate_guard BEFORE TRUNCATE ON public.courses
  FOR EACH STATEMENT EXECUTE FUNCTION public.csz_guard_protected_truncate();
COMMIT;
