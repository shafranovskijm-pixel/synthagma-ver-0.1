-- SOURCE CANDIDATE ONLY. Root review + isolated PostgreSQL acceptance required before release.
-- Fresh source/installed ABI observed 2026-10-29 at main e75ff3bfde901212475b5e2ebc3c8e4cc11a6ae2.
-- No historical attempt/session/answer/score/homework/document row is rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

ALTER TABLE public.enrollments
  ADD COLUMN learning_progress_epoch bigint NOT NULL DEFAULT 0,
  ADD COLUMN learning_progress_reset_at timestamptz,
  ADD CONSTRAINT enrollments_learning_progress_epoch_nonnegative CHECK (learning_progress_epoch>=0),
  ADD CONSTRAINT enrollments_learning_progress_reset_pair CHECK (
    (learning_progress_epoch=0 AND learning_progress_reset_at IS NULL)
    OR (learning_progress_epoch>0 AND learning_progress_reset_at IS NOT NULL));

-- Preserve exact previous PLP submission/review byte-hashes when extending the row type.
ALTER TABLE public.homework_submissions ADD COLUMN learning_progress_epoch bigint NOT NULL DEFAULT 0
 CHECK(learning_progress_epoch>=0);
CREATE OR REPLACE FUNCTION public.plp_homework_sha(h public.homework_submissions,p_review boolean)RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public SET TimeZone='UTC' AS $lpr$
 SELECT public.plp_sha(CASE WHEN p_review THEN to_jsonb(h)-'learning_progress_epoch'
 ELSE to_jsonb(h)-ARRAY['status','score','reviewer_id','reviewer_comment','reviewed_at','learning_progress_epoch']END);
$lpr$;

CREATE FUNCTION public.lpr_guard_homework_epoch()RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $lpr$
DECLARE e public.enrollments;owner_name name;cid uuid;org uuid;
BEGIN
 SELECT pg_catalog.pg_get_userbyid(relowner)INTO owner_name FROM pg_catalog.pg_class WHERE oid=TG_RELID;
 IF TG_OP='UPDATE'THEN
  IF NEW.learning_progress_epoch IS DISTINCT FROM OLD.learning_progress_epoch
   THEN RAISE EXCEPTION 'homework_learning_generation_is_immutable' USING ERRCODE='42501';END IF;
  IF current_user<>owner_name THEN
   IF(to_jsonb(NEW)-ARRAY['status','score','reviewer_id','reviewer_comment','reviewed_at'])
    IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['status','score','reviewer_id','reviewer_comment','reviewed_at'])
    THEN RAISE EXCEPTION 'homework_identity_content_origin_is_immutable' USING ERRCODE='42501';END IF;
   IF auth.uid()IS NULL OR auth.uid()=OLD.student_id OR NOT public.can_access_course(OLD.course_id,'homework.write')
    THEN RAISE EXCEPTION 'homework_review_forbidden' USING ERRCODE='42501';END IF;
   IF NEW.status NOT IN('approved','revision','rejected')OR(NEW.score IS NOT NULL AND NEW.score NOT BETWEEN 0 AND 100)
    THEN RAISE EXCEPTION 'invalid_homework_review' USING ERRCODE='22023';END IF;
   NEW.reviewer_id:=auth.uid();NEW.reviewed_at:=clock_timestamp();
  END IF;
  RETURN NEW;
 END IF;
 -- INSERT: a queued old form cannot adopt the new generation through a server default.
 IF auth.uid()IS NULL OR NEW.student_id IS DISTINCT FROM auth.uid()OR public.account_deletion_access_allowed()IS NOT TRUE
  THEN RAISE EXCEPTION 'homework_submission_forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.student_id::text,42007));
 IF NEW.course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
  THEN PERFORM pg_advisory_xact_lock(7630559,178);END IF;
 SELECT x.* INTO e FROM public.enrollments x WHERE x.user_id=NEW.student_id AND x.course_id=NEW.course_id FOR UPDATE;
 SELECT c.organization_id,l.course_id INTO org,cid FROM public.lessons l JOIN public.courses c ON c.id=l.course_id WHERE l.id=NEW.lesson_id AND l.type='homework';
 IF e.id IS NULL OR cid IS DISTINCT FROM NEW.course_id OR org IS DISTINCT FROM NEW.organization_id
  OR NOT public.can_access_course_as_learner(NEW.course_id)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=NEW.student_id AND organization_id=org AND blocked_at IS NULL)
  THEN RAISE EXCEPTION 'homework_submission_context' USING ERRCODE='42501';END IF;
 IF NEW.learning_progress_epoch IS DISTINCT FROM e.learning_progress_epoch THEN
  RAISE EXCEPTION 'LEARNING_PROGRESS_RESET' USING ERRCODE='P0001',DETAIL=jsonb_build_object(
   'learning_progress_epoch',e.learning_progress_epoch::text,'learning_progress_reset_at',e.learning_progress_reset_at)::text;
 END IF;
 IF current_user<>owner_name THEN
  IF NEW.status<>'pending'OR NEW.score IS NOT NULL OR NEW.reviewer_id IS NOT NULL OR NEW.reviewer_comment IS NOT NULL OR NEW.reviewed_at IS NOT NULL
   THEN RAISE EXCEPTION 'only_pending_own_homework_submission_allowed' USING ERRCODE='42501';END IF;
  NEW.submitted_at:=clock_timestamp();NEW.created_at:=NEW.submitted_at;
 END IF;
 RETURN NEW;
END;$lpr$;
REVOKE ALL ON FUNCTION public.lpr_guard_homework_epoch()FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aaaa_lpr_homework_epoch BEFORE INSERT OR UPDATE ON public.homework_submissions
 FOR EACH ROW EXECUTE FUNCTION public.lpr_guard_homework_epoch();

CREATE FUNCTION public.get_own_homework_history(p_lesson_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
DECLARE cid uuid;snap jsonb;items jsonb;
BEGIN
 SELECT course_id INTO cid FROM public.lessons WHERE id=p_lesson_id AND type='homework';
 IF cid IS NULL THEN RAISE EXCEPTION 'homework_lesson_not_found' USING ERRCODE='42501';END IF;
 snap:=public.get_course_learning_snapshot(cid);
 SELECT coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('learning_progress_epoch',h.learning_progress_epoch::text)
 ORDER BY h.submitted_at DESC,h.id DESC),'[]'::jsonb)INTO items
 FROM public.homework_submissions h WHERE h.student_id=auth.uid()AND h.lesson_id=p_lesson_id AND h.course_id=cid
 AND h.organization_id=(SELECT organization_id FROM public.courses WHERE id=cid);
 RETURN jsonb_build_object('learning_progress_epoch',snap->>'learning_progress_epoch',
 'learning_progress_reset_at',snap->'learning_progress_reset_at','submissions',items);
END;$lpr$;
REVOKE ALL ON FUNCTION public.get_own_homework_history(uuid)FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_own_homework_history(uuid)TO authenticated;

CREATE TABLE public.course_learning_progress_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  previous_epoch bigint NOT NULL CHECK(previous_epoch>=0),
  learning_progress_epoch bigint NOT NULL CHECK(learning_progress_epoch=previous_epoch+1),
  reset_at timestamptz NOT NULL,
  before_enrollment jsonb NOT NULL,
  lesson_progress_snapshot jsonb NOT NULL CHECK(jsonb_typeof(lesson_progress_snapshot)='array'),
  UNIQUE(enrollment_id,learning_progress_epoch)
);
ALTER TABLE public.course_learning_progress_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_learning_progress_resets FROM PUBLIC,anon,authenticated;
-- Owner-only reset history is removed by the existing trusted account/enrollment erasure cascade.
-- No learner/staff SELECT grant: old attempts keep their existing authorized history APIs.

CREATE FUNCTION public.lpr_reset_error(p_epoch bigint,p_reset_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
BEGIN
 RAISE EXCEPTION 'LEARNING_PROGRESS_RESET' USING ERRCODE='P0001',
 DETAIL=jsonb_build_object('learning_progress_epoch',p_epoch::text,'learning_progress_reset_at',p_reset_at)::text;
END;$lpr$;
REVOKE ALL ON FUNCTION public.lpr_reset_error(bigint,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.lpr_assert_epoch(p_epoch bigint,p_reset_at timestamptz,p_expected text,p_legacy boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
BEGIN
 IF p_expected IS NULL AND p_legacy AND p_epoch=0 THEN RETURN;END IF;
 -- Compare canonical decimal text, never a JS-number bigint or unbounded cast.
 IF p_expected IS NULL OR p_expected !~ '^(0|[1-9][0-9]*)$' OR p_expected<>p_epoch::text THEN
  PERFORM public.lpr_reset_error(p_epoch,p_reset_at);
 END IF;
END;$lpr$;
REVOKE ALL ON FUNCTION public.lpr_assert_epoch(bigint,timestamptz,text,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.lpr_lock_own_enrollment(p_enrollment_id uuid,p_expected text,p_legacy boolean DEFAULT false)
RETURNS public.enrollments LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
DECLARE e public.enrollments;initial_course uuid;
BEGIN
 IF auth.uid() IS NULL OR public.account_deletion_access_allowed() IS NOT TRUE
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND blocked_at IS NULL)
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 -- Same subject fence as the existing account-deletion write guard; before the enrollment/LP locks.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,42007));
 SELECT course_id INTO initial_course FROM public.enrollments WHERE id=p_enrollment_id AND user_id=auth.uid();
 IF initial_course=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
  THEN PERFORM pg_advisory_xact_lock(7630559,178);END IF;
 SELECT * INTO e FROM public.enrollments WHERE id=p_enrollment_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE='P0002';END IF;
 IF e.course_id IS DISTINCT FROM initial_course THEN RAISE EXCEPTION 'enrollment changed' USING ERRCODE='40001';END IF;
 IF NOT public.can_access_course_as_learner(e.course_id) OR public.uc_enrollment_is_withdrawn(e.id)
  THEN RAISE EXCEPTION 'retained_enrollment_learning_denied' USING ERRCODE='42501';END IF;
 PERFORM public.lpr_assert_epoch(e.learning_progress_epoch,e.learning_progress_reset_at,p_expected,p_legacy);
 RETURN e;
END;$lpr$;
REVOKE ALL ON FUNCTION public.lpr_lock_own_enrollment(uuid,text,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.lpr_lock_own_lesson(p_lesson_id uuid,p_expected text,p_legacy boolean DEFAULT false)
RETURNS public.enrollments LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
DECLARE eid uuid;
BEGIN
 SELECT e.id INTO eid FROM public.enrollments e JOIN public.lessons l ON l.course_id=e.course_id
 WHERE l.id=p_lesson_id AND e.user_id=auth.uid();
 IF eid IS NULL THEN RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE='42501';END IF;
 RETURN public.lpr_lock_own_enrollment(eid,p_expected,p_legacy);
END;$lpr$;
REVOKE ALL ON FUNCTION public.lpr_lock_own_lesson(uuid,text,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.lpr_snapshot(p_enrollment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
DECLARE e public.enrollments; lp jsonb;
BEGIN
 SELECT * INTO STRICT e FROM public.enrollments WHERE id=p_enrollment_id;
 SELECT coalesce(jsonb_agg(to_jsonb(p)ORDER BY p.lesson_id),'[]'::jsonb)INTO lp
 FROM public.lesson_progress p JOIN public.lessons l ON l.id=p.lesson_id
 WHERE p.user_id=e.user_id AND l.course_id=e.course_id;
 RETURN jsonb_build_object(
  'enrollment',to_jsonb(e)||jsonb_build_object('learning_progress_epoch',e.learning_progress_epoch::text),
  'lesson_progress',lp,'learning_progress_epoch',e.learning_progress_epoch::text,
  'learning_progress_reset_at',e.learning_progress_reset_at);
END;$lpr$;
REVOKE ALL ON FUNCTION public.lpr_snapshot(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_course_learning_snapshot(p_course_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
DECLARE e public.enrollments;eid uuid;
BEGIN
 SELECT id INTO eid FROM public.enrollments WHERE user_id=auth.uid() AND course_id=p_course_id;
 -- Lock the same enrollment as reset/writers so epoch and LP are one consistent snapshot.
 IF auth.uid() IS NULL OR public.account_deletion_access_allowed() IS NOT TRUE
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND blocked_at IS NULL)
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,42007));
 IF p_course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
  THEN PERFORM pg_advisory_xact_lock(7630559,178);END IF;
 SELECT * INTO e FROM public.enrollments WHERE id=eid AND user_id=auth.uid()AND course_id=p_course_id FOR UPDATE;
 IF NOT FOUND OR NOT public.can_access_course_as_learner(e.course_id) OR public.uc_enrollment_is_withdrawn(e.id)
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 -- Snapshot discovers the new generation; this permissioned read is not a missing-epoch writer.
 RETURN public.lpr_snapshot(e.id);
END;$lpr$;
-- Replaced below with the dedicated discover helper; no missing-epoch write escape.
REVOKE ALL ON FUNCTION public.get_course_learning_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_course_learning_snapshot(uuid) TO authenticated;

CREATE FUNCTION public.lpr_guard_direct_progress_write() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $lpr$
DECLARE e public.enrollments;uid uuid;lid uuid;owner_name name;
BEGIN
 SELECT pg_catalog.pg_get_userbyid(relowner)INTO owner_name FROM pg_catalog.pg_class WHERE oid=TG_RELID;
 -- Only real table-owner execution (our explicit checked SECURITY DEFINER RPCs and trusted erasure).
 -- No auth.role(), session GUC or client-supplied flag authorizes this branch.
 IF current_user=owner_name THEN IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_TABLE_NAME='enrollments'THEN
  IF TG_OP='INSERT'THEN
   IF NEW.learning_progress_epoch<>0 OR NEW.learning_progress_reset_at IS NOT NULL
    THEN RAISE EXCEPTION 'learning_progress_generation_is_server_owned' USING ERRCODE='42501';END IF;
   RETURN NEW;
  END IF;
  IF TG_OP='UPDATE'THEN
   IF ROW(NEW.learning_progress_epoch,NEW.learning_progress_reset_at)IS DISTINCT FROM ROW(OLD.learning_progress_epoch,OLD.learning_progress_reset_at)
    THEN RAISE EXCEPTION 'learning_progress_generation_is_server_owned' USING ERRCODE='42501';END IF;
   IF OLD.learning_progress_epoch>0 AND ROW(NEW.id,NEW.user_id,NEW.course_id,NEW.progress,NEW.status,NEW.completed_at,NEW.time_spent)
    IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.course_id,OLD.progress,OLD.status,OLD.completed_at,OLD.time_spent)THEN
    RAISE EXCEPTION 'LEARNING_PROGRESS_RESET' USING ERRCODE='P0001',DETAIL=jsonb_build_object(
     'learning_progress_epoch',OLD.learning_progress_epoch::text,'learning_progress_reset_at',OLD.learning_progress_reset_at)::text;
   END IF;
   RETURN NEW;
  END IF;
  RETURN OLD; -- Existing enrollment delete/retention guards continue to decide DELETE.
 END IF;
 uid:=CASE WHEN TG_OP='DELETE'THEN OLD.user_id ELSE NEW.user_id END;
 lid:=CASE WHEN TG_OP='DELETE'THEN OLD.lesson_id ELSE NEW.lesson_id END;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,42007));
 IF EXISTS(SELECT 1 FROM public.lessons WHERE id=lid AND course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]))
  THEN PERFORM pg_advisory_xact_lock(7630559,178);END IF;
 SELECT x.* INTO e FROM public.enrollments x JOIN public.lessons l ON l.course_id=x.course_id
 WHERE x.user_id=uid AND l.id=lid FOR SHARE OF x;
 IF FOUND AND e.learning_progress_epoch>0 THEN
  RAISE EXCEPTION 'LEARNING_PROGRESS_RESET' USING ERRCODE='P0001',DETAIL=jsonb_build_object(
   'learning_progress_epoch',e.learning_progress_epoch::text,'learning_progress_reset_at',e.learning_progress_reset_at)::text;
 END IF;
 IF TG_OP='UPDATE'THEN
  SELECT x.* INTO e FROM public.enrollments x JOIN public.lessons l ON l.course_id=x.course_id
  WHERE x.user_id=OLD.user_id AND l.id=OLD.lesson_id FOR SHARE OF x;
  IF FOUND AND e.learning_progress_epoch>0 THEN
   RAISE EXCEPTION 'LEARNING_PROGRESS_RESET' USING ERRCODE='P0001',DETAIL=jsonb_build_object(
    'learning_progress_epoch',e.learning_progress_epoch::text,'learning_progress_reset_at',e.learning_progress_reset_at)::text;
  END IF;
 END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;
END;$lpr$;
REVOKE ALL ON FUNCTION public.lpr_guard_direct_progress_write() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aaaa_lpr_direct_write_fence BEFORE INSERT OR UPDATE OR DELETE ON public.enrollments
 FOR EACH ROW EXECUTE FUNCTION public.lpr_guard_direct_progress_write();
CREATE TRIGGER aaaa_lpr_direct_write_fence BEFORE INSERT OR UPDATE OR DELETE ON public.lesson_progress
 FOR EACH ROW EXECUTE FUNCTION public.lpr_guard_direct_progress_write();

CREATE FUNCTION public.lpr_current_test_passed(p_user uuid,p_lesson uuid,p_reset_at timestamptz)RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
 SELECT EXISTS(SELECT 1 FROM public.test_attempts a JOIN public.lessons l ON l.id=a.lesson_id
 LEFT JOIN public.test_attempt_sessions s ON s.id=a.session_id
 WHERE a.user_id=p_user AND a.lesson_id=p_lesson AND a.max_score>0
 AND coalesce(a.passed,(a.score::numeric*100/a.max_score)>=coalesce(a.passing_score,l.test_passing_score,60))
 AND (p_reset_at IS NULL OR(s.id IS NOT NULL AND s.started_at>=p_reset_at)));
$lpr$;
REVOKE ALL ON FUNCTION public.lpr_current_test_passed(uuid,uuid,timestamptz)FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.lpr_current_homework_approved(p_user uuid,p_lesson uuid,p_course uuid,p_epoch bigint)RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
 SELECT coalesce((SELECT h.status='approved' AND h.learning_progress_epoch=p_epoch
 FROM public.homework_submissions h JOIN public.courses c ON c.id=h.course_id AND c.organization_id=h.organization_id
 WHERE h.student_id=p_user AND h.lesson_id=p_lesson AND h.course_id=p_course AND h.learning_progress_epoch=p_epoch
 ORDER BY h.submitted_at DESC,h.id DESC LIMIT 1),false);
$lpr$;
REVOKE ALL ON FUNCTION public.lpr_current_homework_approved(uuid,uuid,uuid,bigint)FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_own_lesson_progress(p_enrollment_id uuid,p_lesson_id uuid,p_expected_epoch text,
 p_completed boolean DEFAULT NULL,p_video_position real DEFAULT NULL,p_video_duration real DEFAULT NULL,p_seconds integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
DECLARE e public.enrollments;l public.lessons;old_lp public.lesson_progress;total integer;done integer;floor_progress integer;
BEGIN
 e:=public.lpr_lock_own_enrollment(p_enrollment_id,p_expected_epoch,false);
 SELECT * INTO l FROM public.lessons WHERE id=p_lesson_id AND course_id=e.course_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'lesson_not_in_enrollment' USING ERRCODE='42501';END IF;
 IF p_seconds IS NOT NULL AND(p_seconds<0 OR p_seconds>86400)
  OR p_video_position IS NOT NULL AND NOT(p_video_position>=0 AND p_video_position<=604800)
  OR p_video_duration IS NOT NULL AND NOT(p_video_duration>=0 AND p_video_duration<=604800)
  THEN RAISE EXCEPTION 'invalid_progress_payload' USING ERRCODE='22023';END IF;
 SELECT * INTO old_lp FROM public.lesson_progress WHERE user_id=e.user_id AND lesson_id=p_lesson_id;
 IF p_completed IS FALSE AND old_lp.completed THEN RAISE EXCEPTION 'explicit_staff_reset_required' USING ERRCODE='42501';END IF;
 IF p_completed IS TRUE AND e.learning_progress_epoch>0
  AND NOT EXISTS(SELECT 1 FROM public.course_manual_credits WHERE enrollment_id=e.id AND revoked_at IS NULL)THEN
  IF(l.type='test' AND NOT public.lpr_current_test_passed(e.user_id,l.id,e.learning_progress_reset_at))
   OR(l.type='homework' AND NOT public.lpr_current_homework_approved(e.user_id,l.id,e.course_id,e.learning_progress_epoch))
   THEN RAISE EXCEPTION 'current_learning_evidence_required' USING ERRCODE='23514';END IF;
 END IF;
 INSERT INTO public.lesson_progress(user_id,lesson_id,completed,completed_at,time_spent,video_position,video_duration)
 VALUES(e.user_id,l.id,coalesce(p_completed,false),CASE WHEN p_completed IS TRUE THEN clock_timestamp()END,
 coalesce(p_seconds,0),coalesce(p_video_position,0),coalesce(p_video_duration,0))
 ON CONFLICT(user_id,lesson_id)DO UPDATE SET
 completed=coalesce(p_completed,lesson_progress.completed),
 completed_at=CASE WHEN p_completed IS TRUE THEN coalesce(lesson_progress.completed_at,EXCLUDED.completed_at)ELSE lesson_progress.completed_at END,
 time_spent=coalesce(lesson_progress.time_spent,0)+coalesce(p_seconds,0),
 video_position=coalesce(p_video_position,lesson_progress.video_position),
 video_duration=coalesce(p_video_duration,lesson_progress.video_duration);
 SELECT count(*),count(*)FILTER(WHERE p.completed)INTO total,done FROM public.lessons x
 LEFT JOIN public.lesson_progress p ON p.lesson_id=x.id AND p.user_id=e.user_id WHERE x.course_id=e.course_id;
 floor_progress:=CASE WHEN total=0 THEN 0 ELSE(done*100)/total END;
 UPDATE public.enrollments SET progress=greatest(progress,floor_progress),
 time_spent=coalesce(time_spent,0)+coalesce(p_seconds,0)WHERE id=e.id;
 RETURN public.lpr_snapshot(e.id);
END;$lpr$;
REVOKE ALL ON FUNCTION public.save_own_lesson_progress(uuid,uuid,text,boolean,real,real,integer)FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_own_lesson_progress(uuid,uuid,text,boolean,real,real,integer)TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_course_learning_progress(p_enrollment_id uuid,p_organization_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
DECLARE e public.enrollments;org uuid;target uuid;initial_course uuid;who uuid;rows_before jsonb;at_time timestamptz;
BEGIN
 IF auth.uid()IS NULL OR public.account_deletion_access_allowed()IS NOT TRUE
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid()AND blocked_at IS NULL)
  THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501';END IF;
 SELECT user_id,course_id INTO target,initial_course FROM public.enrollments WHERE id=p_enrollment_id;
 IF target IS NULL THEN RAISE EXCEPTION 'enrollment not found' USING ERRCODE='P0002';END IF;
 FOR who IN SELECT DISTINCT v FROM unnest(ARRAY[target,auth.uid()])v ORDER BY v LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(who::text,42007));
 END LOOP;
 IF initial_course=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
  THEN PERFORM pg_advisory_xact_lock(7630559,178);END IF;
 SELECT * INTO e FROM public.enrollments WHERE id=p_enrollment_id FOR UPDATE;
 IF NOT FOUND OR e.user_id<>target OR e.course_id IS DISTINCT FROM initial_course THEN RAISE EXCEPTION 'enrollment changed' USING ERRCODE='40001';END IF;
 SELECT organization_id INTO org FROM public.courses WHERE id=e.course_id;
 IF p_organization_id IS NULL OR org IS DISTINCT FROM p_organization_id
  OR NOT public.can_access_course(e.course_id,'students.write')THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.platform_course_learning_policies WHERE course_id=e.course_id)
  OR EXISTS(SELECT 1 FROM public.platform_course_learning_bindings WHERE enrollment_id=e.id)
  THEN RAISE EXCEPTION 'PLP_EXPLICIT_RESET_REQUIRED' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=e.user_id)
  OR public.uc_enrollment_is_withdrawn(e.id)THEN RAISE EXCEPTION 'retained_enrollment_learning_denied' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(lp)ORDER BY lp.lesson_id),'[]'::jsonb)INTO rows_before
 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id
 WHERE lp.user_id=e.user_id AND l.course_id=e.course_id;
 at_time:=clock_timestamp();
 INSERT INTO public.course_learning_progress_resets(enrollment_id,organization_id,user_id,course_id,actor_id,
 previous_epoch,learning_progress_epoch,reset_at,before_enrollment,lesson_progress_snapshot)
 VALUES(e.id,org,e.user_id,e.course_id,auth.uid(),e.learning_progress_epoch,e.learning_progress_epoch+1,at_time,to_jsonb(e),rows_before);
 DELETE FROM public.lesson_progress lp USING public.lessons l
 WHERE lp.lesson_id=l.id AND l.course_id=e.course_id AND lp.user_id=e.user_id;
 -- Existing PLP/retention/CSZ guards are NOT disabled or bypassed. Any denial rolls back this whole reset.
 UPDATE public.enrollments SET progress=0,status='active',completed_at=NULL,
 learning_progress_epoch=e.learning_progress_epoch+1,learning_progress_reset_at=at_time WHERE id=e.id;
 -- Preserve old credit records, revoke any current one even if status was already active.
 UPDATE public.course_manual_credits SET revoked_at=at_time,revoked_by=auth.uid()
 WHERE enrollment_id=e.id AND revoked_at IS NULL;
 RETURN jsonb_build_object('enrollmentId',e.id,'reset',true,'learning_progress_epoch',(e.learning_progress_epoch+1)::text,
 'learning_progress_reset_at',at_time);
END;$lpr$;
REVOKE ALL ON FUNCTION public.reset_course_learning_progress(uuid,uuid)FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reset_course_learning_progress(uuid,uuid)TO authenticated;


-- Lifetime attempt cap renews per explicit school reset; daily cap still counts ALL historical attempts that day.
CREATE OR REPLACE FUNCTION public._test_attempt_limits(p_lesson_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_day_start timestamptz;
  v_reset timestamptz;
  v_total integer;
  v_today integer;
  v_max integer;
  v_daily integer;
  v_run_reset timestamptz;
BEGIN
  v_day_start := date_trunc('day', v_now AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow';
  v_reset := (date_trunc('day', v_now AT TIME ZONE 'Europe/Moscow') + interval '1 day') AT TIME ZONE 'Europe/Moscow';
  SELECT test_max_attempts, test_max_attempts_per_day INTO v_max, v_daily
    FROM public.lessons WHERE id = p_lesson_id;
  SELECT e.learning_progress_reset_at INTO v_run_reset FROM public.enrollments e
    JOIN public.lessons l ON l.course_id=e.course_id WHERE e.user_id=p_user_id AND l.id=p_lesson_id;
  SELECT count(*) FILTER(WHERE v_run_reset IS NULL OR attempt_time>=v_run_reset)::integer, count(*) FILTER (WHERE attempt_time >= v_day_start AND attempt_time < v_reset)::integer
    INTO v_total, v_today
  FROM (
    SELECT started_at AS attempt_time FROM public.test_attempt_sessions
      WHERE user_id = p_user_id AND lesson_id = p_lesson_id
    UNION ALL
    SELECT completed_at FROM public.test_attempts
      WHERE user_id = p_user_id AND lesson_id = p_lesson_id AND session_id IS NULL
  ) attempts;
  RETURN jsonb_build_object('maxAttempts', v_max, 'maxAttemptsPerDay', v_daily,
    'attemptsUsed', v_total, 'attemptsUsedToday', v_today,
    'dayTimezone', 'Europe/Moscow', 'resetAt', v_reset);
END;
$function$;
CREATE OR REPLACE FUNCTION public.lpr_get_student_test_state(p_lesson_id uuid,p_expected_epoch text,p_legacy boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  a public.test_attempts%ROWTYPE;
  e public.enrollments;
  v_active uuid;
  v_state jsonb;
  v_feedback jsonb;
  v_questions jsonb := '[]'::jsonb;
  v_used jsonb;
  v_show boolean;
  v_passing integer;
BEGIN
  e:=public.lpr_lock_own_lesson(p_lesson_id,p_expected_epoch,p_legacy);
  PERFORM public._assert_test_learner_access(p_lesson_id);
  SELECT test_show_answers, test_passing_score INTO v_show, v_passing FROM public.lessons WHERE id = p_lesson_id;
  v_state := public._test_attempt_limits(p_lesson_id, auth.uid()) || jsonb_build_object(
    'hasAttempt', false, 'activeAttempt', NULL, 'showAnswers', v_show,
    'passingScore', v_passing, 'manualCredit', public._test_manual_credit(p_lesson_id),
    'photoRequired', public._final_test_photo_required(p_lesson_id),
    'learning_progress_epoch',e.learning_progress_epoch::text,'learning_progress_reset_at',e.learning_progress_reset_at);
  SELECT id INTO v_active FROM public.test_attempt_sessions
    WHERE user_id = auth.uid() AND lesson_id = p_lesson_id AND status = 'in_progress'
      AND(e.learning_progress_reset_at IS NULL OR started_at>=e.learning_progress_reset_at);
  IF v_active IS NOT NULL AND public._test_manual_credit(p_lesson_id) IS NULL THEN
    v_state := v_state || jsonb_build_object('activeAttempt', public._test_session_payload(v_active));
  END IF;
  SELECT coalesce(jsonb_agg(DISTINCT q), '[]'::jsonb) INTO v_used
    FROM public.test_attempts t CROSS JOIN LATERAL jsonb_array_elements(t.shown_question_ids) q
    WHERE t.user_id = auth.uid() AND t.lesson_id = p_lesson_id
      AND(e.learning_progress_reset_at IS NULL OR EXISTS(SELECT 1 FROM public.test_attempt_sessions ss
        WHERE ss.id=t.session_id AND ss.started_at>=e.learning_progress_reset_at));
  v_state := v_state || jsonb_build_object('usedQuestionIds', v_used);
  SELECT * INTO a FROM public.test_attempts
    WHERE user_id = auth.uid() AND lesson_id = p_lesson_id
      AND(e.learning_progress_reset_at IS NULL OR EXISTS(SELECT 1 FROM public.test_attempt_sessions ss
        WHERE ss.id=test_attempts.session_id AND ss.started_at>=e.learning_progress_reset_at))
      ORDER BY completed_at DESC, id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN v_state; END IF;
  IF a.session_id IS NOT NULL THEN
    v_feedback := public._test_grade_payload(a.session_id);
    SELECT public._test_public_questions(questions_snapshot, v_show AND show_answers)
      INTO v_questions FROM public.test_attempt_sessions WHERE id = a.session_id;
  ELSE
    -- Historical starts, question versions, and passing threshold are unknown.
    v_feedback := jsonb_build_object('correctAnswers', '{}'::jsonb, 'explanations', '{}'::jsonb,
      'scorePercent', CASE WHEN a.max_score > 0 THEN round(a.score * 100.0 / a.max_score)::integer ELSE 0 END,
      'passed', a.passed, 'passingScore', a.passing_score);
  END IF;
  RETURN v_state || v_feedback || jsonb_build_object('hasAttempt', true,
    'attempt', to_jsonb(a) || jsonb_build_object('questions', v_questions, 'legacy', a.session_id IS NULL));
END;
$function$;
CREATE OR REPLACE FUNCTION public.lpr_start_test_attempt(p_lesson_id uuid,p_request_id uuid,p_expected_epoch text,p_legacy boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  e public.enrollments;
  v_session uuid;
  v_limits jsonb;
  v_questions jsonb;
  v_count integer;
  v_passing integer;
  v_show boolean;
  v_photo_required boolean;
  v_photo_id uuid;
  v_started_at timestamptz;
BEGIN
  e:=public.lpr_lock_own_lesson(p_lesson_id,p_expected_epoch,p_legacy);
  PERFORM public._assert_test_learner_access(p_lesson_id);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'request_id is required' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_lesson_id::text, 0));
  PERFORM 1 FROM public.enrollments enr JOIN public.lessons l ON l.course_id = enr.course_id
    WHERE l.id = p_lesson_id AND enr.user_id = v_user FOR UPDATE OF enr;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enrollment is not available' USING ERRCODE = '42501'; END IF;
  PERFORM public._assert_test_learner_access(p_lesson_id);
  IF public._test_manual_credit(p_lesson_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Course already credited by the organization' USING ERRCODE = 'P0001';
  END IF;
  SELECT session_id INTO v_session FROM public.test_attempt_start_requests
    WHERE user_id = v_user AND lesson_id = p_lesson_id AND request_id = p_request_id;
  IF v_session IS NOT NULL THEN
    IF e.learning_progress_reset_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.test_attempt_sessions ss WHERE ss.id=v_session AND ss.started_at>=e.learning_progress_reset_at)
     THEN PERFORM public.lpr_reset_error(e.learning_progress_epoch,e.learning_progress_reset_at);END IF;
    RETURN public._test_session_payload(v_session)||jsonb_build_object('learning_progress_epoch',e.learning_progress_epoch::text,'learning_progress_reset_at',e.learning_progress_reset_at);
  END IF;
  -- A second tab or a network retry resumes the same attempt, including across midnight.
  SELECT id INTO v_session FROM public.test_attempt_sessions
    WHERE user_id = v_user AND lesson_id = p_lesson_id AND status = 'in_progress'
      AND(e.learning_progress_reset_at IS NULL OR started_at>=e.learning_progress_reset_at);
  IF v_session IS NOT NULL THEN
    INSERT INTO public.test_attempt_start_requests(user_id, lesson_id, request_id, session_id)
      VALUES (v_user, p_lesson_id, p_request_id, v_session);
    RETURN public._test_session_payload(v_session)||jsonb_build_object('learning_progress_epoch',e.learning_progress_epoch::text,'learning_progress_reset_at',e.learning_progress_reset_at);
  END IF;
  v_limits := public._test_attempt_limits(p_lesson_id, v_user);
  IF (v_limits->>'maxAttempts')::integer > 0
    AND (v_limits->>'attemptsUsed')::integer >= (v_limits->>'maxAttempts')::integer THEN
    RAISE EXCEPTION 'Attempts exhausted' USING ERRCODE = 'P0001', DETAIL = v_limits::text;
  END IF;
  IF (v_limits->>'maxAttemptsPerDay')::integer > 0
    AND (v_limits->>'attemptsUsedToday')::integer >= (v_limits->>'maxAttemptsPerDay')::integer THEN
    RAISE EXCEPTION 'Daily attempts exhausted' USING ERRCODE = 'P0001', DETAIL = v_limits::text;
  END IF;
  SELECT test_questions_to_show, test_passing_score, test_show_answers
    INTO v_count, v_passing, v_show FROM public.lessons WHERE id = p_lesson_id;
  -- Validate every candidate before sampling: malformed content must not randomly
  -- consume a quota slot or silently disappear from the configured question bank.
  WITH normalized AS MATERIALIZED (
    SELECT tq.id, tq.lesson_id, tq.question,
      public._test_normalize_options(tq.options, tq.correct_answer) AS options,
      tq.order_index, tq.correct_answer, tq.explanation, tq.image_url, tq.is_bank_question
    FROM public.test_questions tq WHERE tq.lesson_id = p_lesson_id
  )
  SELECT jsonb_agg(to_jsonb(q) ORDER BY q.position) INTO v_questions FROM (
    SELECT tq.*, row_number() OVER () AS position
    FROM (SELECT * FROM normalized ORDER BY random()
      LIMIT CASE WHEN v_count > 0 THEN v_count ELSE NULL END) tq
  ) q;
  IF v_questions IS NULL OR jsonb_array_length(v_questions) = 0 THEN
    RAISE EXCEPTION 'No test questions available' USING ERRCODE = '22023';
  END IF;
  -- Use one reservation timestamp for expiry and the session. Crossing the
  -- expiry boundary between SELECT and INSERT must not consume an invalid slot.
  v_started_at := clock_timestamp();
  v_photo_required := public._final_test_photo_required(p_lesson_id);
  IF v_photo_required THEN
    SELECT c.id INTO v_photo_id FROM public.final_test_photo_challenges c
      JOIN public.enrollments enr ON enr.id = c.enrollment_id AND enr.user_id = v_user AND enr.course_id = c.course_id
      WHERE c.user_id = v_user AND c.lesson_id = p_lesson_id AND c.request_id = p_request_id
        AND c.completed_at IS NOT NULL AND c.expires_at > v_started_at AND c.session_id IS NULL
        AND public._final_test_photo_object_valid(c.id)
      FOR UPDATE OF c;
    IF v_photo_id IS NULL THEN
      RAISE EXCEPTION 'Final test photo required' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.test_attempt_sessions(user_id, lesson_id, request_id, started_at, questions_snapshot, passing_score, show_answers, requires_final_test_photo)
    VALUES (v_user, p_lesson_id, p_request_id, v_started_at, v_questions, coalesce(v_passing, 60), v_show, v_photo_required)
    RETURNING id INTO v_session;
  IF v_photo_id IS NOT NULL THEN
    UPDATE public.final_test_photo_challenges SET session_id = v_session WHERE id = v_photo_id;
  END IF;
  INSERT INTO public.test_attempt_start_requests(user_id, lesson_id, request_id, session_id)
    VALUES (v_user, p_lesson_id, p_request_id, v_session);
  RETURN public._test_session_payload(v_session)||jsonb_build_object('learning_progress_epoch',e.learning_progress_epoch::text,'learning_progress_reset_at',e.learning_progress_reset_at);
END;
$function$;
CREATE OR REPLACE FUNCTION public.lpr_submit_test_attempt(p_attempt_id uuid,p_answers jsonb,p_expected_epoch text,p_legacy boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  s public.test_attempt_sessions%ROWTYPE;
  e public.enrollments;
  v_score integer;
  v_max integer;
  v_passed boolean;
  v_completed timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.test_attempt_sessions WHERE id = p_attempt_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found' USING ERRCODE = '42501'; END IF;
  e:=public.lpr_lock_own_lesson(s.lesson_id,p_expected_epoch,p_legacy);
  IF e.learning_progress_reset_at IS NOT NULL AND s.started_at<e.learning_progress_reset_at
   THEN PERFORM public.lpr_reset_error(e.learning_progress_epoch,e.learning_progress_reset_at);END IF;
  PERFORM public._assert_test_learner_access(s.lesson_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(s.user_id::text || ':' || s.lesson_id::text, 0));
  SELECT * INTO STRICT s FROM public.test_attempt_sessions WHERE id = p_attempt_id FOR UPDATE;
  PERFORM public._assert_test_learner_access(s.lesson_id);
  -- A response can be lost after commit: return the original result, never regrade or recount.
  IF s.status = 'completed' THEN RETURN public._test_grade_payload(s.id)||jsonb_build_object('learning_progress_epoch',e.learning_progress_epoch::text,'learning_progress_reset_at',e.learning_progress_reset_at); END IF;
  -- Expiry limits the START window, not test duration. An attached photo remains
  -- valid during a long attempt, even if the course setting is later disabled.
  IF s.requires_final_test_photo AND NOT EXISTS (
    SELECT 1 FROM public.final_test_photo_challenges c
    WHERE c.session_id = s.id AND c.user_id = s.user_id AND c.lesson_id = s.lesson_id
      AND c.request_id = s.request_id AND c.completed_at IS NOT NULL
      AND c.completed_at <= s.started_at AND s.started_at < c.expires_at
      AND public._final_test_photo_object_valid(c.id)
  ) THEN
    RAISE EXCEPTION 'Final test photo required' USING ERRCODE = 'P0001';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'answers must be an object' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_answers) a
    LEFT JOIN LATERAL (SELECT q FROM jsonb_array_elements(s.questions_snapshot) q WHERE q->>'id' = a.key) item ON true
    WHERE item.q IS NULL OR jsonb_typeof(a.value) <> 'number'
      OR a.value::text !~ '^[0-9]+$'
      OR CASE WHEN jsonb_typeof(a.value) = 'number' AND a.value::text ~ '^[0-9]+$'
        THEN (a.value::text)::numeric >= jsonb_array_length(item.q->'options') ELSE false END
  ) THEN
    RAISE EXCEPTION 'Answer is not a valid option in this attempt' USING ERRCODE = '22023';
  END IF;
  SELECT count(*)::integer, count(*) FILTER (WHERE p_answers->(q->>'id') = q->'correct_answer')::integer
    INTO v_max, v_score FROM jsonb_array_elements(s.questions_snapshot) q;
  v_passed := round(v_score * 100.0 / v_max) >= s.passing_score;
  v_completed := clock_timestamp();
  INSERT INTO public.test_attempts(user_id, lesson_id, session_id, started_at, completed_at,
    score, max_score, answers, shown_question_ids, passing_score, passed)
  VALUES (s.user_id, s.lesson_id, s.id, s.started_at, v_completed, v_score, v_max, p_answers,
    (SELECT jsonb_agg(q->'id') FROM jsonb_array_elements(s.questions_snapshot) q), s.passing_score, v_passed);
  UPDATE public.test_attempt_sessions SET status = 'completed', submitted_at = v_completed WHERE id = s.id;
  IF v_passed THEN
    INSERT INTO public.lesson_progress(user_id, lesson_id, completed, completed_at)
      VALUES (s.user_id, s.lesson_id, true, v_completed)
    ON CONFLICT (user_id, lesson_id) DO UPDATE SET completed = true,
      completed_at = coalesce(public.lesson_progress.completed_at, EXCLUDED.completed_at);
  END IF;
  RETURN public._test_grade_payload(s.id)||jsonb_build_object('learning_progress_epoch',e.learning_progress_epoch::text,'learning_progress_reset_at',e.learning_progress_reset_at);
END;
$function$;
CREATE OR REPLACE FUNCTION public.lpr_complete_own_course_enrollment(p_enrollment_id uuid,p_expected_epoch text,p_legacy boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_enrollment public.enrollments%ROWTYPE;
  v_total integer;
  v_completed integer;
  v_was_completed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  v_enrollment:=public.lpr_lock_own_enrollment(p_enrollment_id,p_expected_epoch,p_legacy);
  SELECT *
  INTO v_enrollment
  FROM public.enrollments e
  WHERE e.id = p_enrollment_id
    AND e.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF public.uc_enrollment_is_withdrawn(v_enrollment.id) THEN RAISE EXCEPTION 'retained_enrollment_learning_denied' USING ERRCODE='42501';END IF;
  v_was_completed := v_enrollment.status = 'completed';

  -- Recover a passed test whose attempt was saved before progress failed.
  INSERT INTO public.lesson_progress (
    user_id, lesson_id, completed, completed_at
  )
  SELECT
    v_user_id, l.id, true, COALESCE(MAX(ta.completed_at), now())
  FROM public.lessons l
  JOIN public.test_attempts ta
    ON ta.lesson_id = l.id
   AND ta.user_id = v_user_id
   AND ta.max_score > 0
   AND COALESCE(ta.passed, (ta.score::numeric * 100 / ta.max_score::numeric) >= COALESCE(ta.passing_score, l.test_passing_score, 60))
  WHERE l.course_id = v_enrollment.course_id
    AND l.type = 'test'
    AND(v_enrollment.learning_progress_reset_at IS NULL OR EXISTS(
      SELECT 1 FROM public.test_attempt_sessions ss WHERE ss.id=ta.session_id AND ss.started_at>=v_enrollment.learning_progress_reset_at))
  GROUP BY l.id
  ON CONFLICT (user_id, lesson_id)
  DO UPDATE SET
    completed = true,
    completed_at = COALESCE(public.lesson_progress.completed_at, EXCLUDED.completed_at);

  SELECT COUNT(*) INTO v_total
  FROM public.lessons l
  WHERE l.course_id = v_enrollment.course_id;

  SELECT COUNT(*) INTO v_completed
  FROM public.lesson_progress lp
  JOIN public.lessons l ON l.id = lp.lesson_id
  WHERE l.course_id = v_enrollment.course_id
    AND lp.user_id = v_user_id
    AND lp.completed = true;

  IF v_total = 0 OR v_completed < v_total THEN
    RAISE EXCEPTION 'course_incomplete:%/%', v_completed, v_total USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.enrollments e
  SET progress = 100,
      status = 'completed',
      completed_at = COALESCE(e.completed_at, now())
  WHERE e.id = p_enrollment_id
  RETURNING * INTO v_enrollment;

  RETURN jsonb_build_object(
    'id', v_enrollment.id,
    'status', v_enrollment.status,
    'progress', v_enrollment.progress,
    'completed_at', v_enrollment.completed_at,
    'was_already_completed', v_was_completed,
    'learning_progress_epoch',v_enrollment.learning_progress_epoch::text,
    'learning_progress_reset_at',v_enrollment.learning_progress_reset_at
  );
END;
$function$;
-- Distinct names avoid PostgREST overload/default ambiguity.
CREATE FUNCTION public.get_student_test_state_at_epoch(p_lesson_id uuid,p_expected_epoch text)RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$ SELECT public.lpr_get_student_test_state(p_lesson_id,p_expected_epoch,false);$lpr$;
CREATE OR REPLACE FUNCTION public.get_student_test_state(p_lesson_id uuid)RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$ SELECT public.lpr_get_student_test_state(p_lesson_id,NULL,true);$lpr$;
CREATE FUNCTION public.start_test_attempt_at_epoch(p_lesson_id uuid,p_request_id uuid,p_expected_epoch text)RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$ SELECT public.lpr_start_test_attempt(p_lesson_id,p_request_id,p_expected_epoch,false);$lpr$;
CREATE OR REPLACE FUNCTION public.start_test_attempt(p_lesson_id uuid,p_request_id uuid)RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$ SELECT public.lpr_start_test_attempt(p_lesson_id,p_request_id,NULL,true);$lpr$;
CREATE FUNCTION public.submit_test_attempt_at_epoch(p_attempt_id uuid,p_answers jsonb,p_expected_epoch text)RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$ SELECT public.lpr_submit_test_attempt(p_attempt_id,p_answers,p_expected_epoch,false);$lpr$;
CREATE OR REPLACE FUNCTION public.submit_test_attempt(p_attempt_id uuid,p_answers jsonb)RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$ SELECT public.lpr_submit_test_attempt(p_attempt_id,p_answers,NULL,true);$lpr$;
CREATE FUNCTION public.complete_own_course_enrollment_at_epoch(p_enrollment_id uuid,p_expected_epoch text)RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$ SELECT public.lpr_complete_own_course_enrollment(p_enrollment_id,p_expected_epoch,false);$lpr$;
CREATE OR REPLACE FUNCTION public.complete_own_course_enrollment(p_enrollment_id uuid)RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$ SELECT public.lpr_complete_own_course_enrollment(p_enrollment_id,NULL,true);$lpr$;

CREATE OR REPLACE FUNCTION public.increment_lesson_time(p_lesson_id uuid,p_user_id uuid,p_seconds integer)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
DECLARE e public.enrollments;
BEGIN
 IF auth.uid()IS NULL OR p_user_id IS DISTINCT FROM auth.uid()THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';END IF;
 e:=public.lpr_lock_own_lesson(p_lesson_id,NULL,true);
 IF p_seconds<=0 THEN RETURN;END IF;
 PERFORM public.save_own_lesson_progress(e.id,p_lesson_id,'0',NULL,NULL,NULL,p_seconds);
END;$lpr$;
CREATE OR REPLACE FUNCTION public.recalc_enrollment_time(p_enrollment_id uuid)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
DECLARE e public.enrollments;
BEGIN
 e:=public.lpr_lock_own_enrollment(p_enrollment_id,NULL,true);
 UPDATE public.enrollments target SET time_spent=coalesce((SELECT sum(lp.time_spent)
 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id
 WHERE l.course_id=e.course_id AND lp.user_id=e.user_id),0)WHERE target.id=e.id;
END;$lpr$;

-- Historical in_progress sessions remain immutable. Enforce one active session
-- per CURRENT run under the same enrollment lock; do not mark old sessions completed/abandoned.
CREATE FUNCTION public.lpr_guard_current_test_session()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
DECLARE e public.enrollments;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,42007));
 IF EXISTS(SELECT 1 FROM public.lessons WHERE id=NEW.lesson_id AND course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[]))
  THEN PERFORM pg_advisory_xact_lock(7630559,178);END IF;
 SELECT x.* INTO e FROM public.enrollments x JOIN public.lessons l ON l.course_id=x.course_id
 WHERE x.user_id=NEW.user_id AND l.id=NEW.lesson_id FOR UPDATE OF x;
 IF NOT FOUND THEN RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE='42501';END IF;
 IF e.learning_progress_reset_at IS NOT NULL AND NEW.started_at<e.learning_progress_reset_at
  THEN PERFORM public.lpr_reset_error(e.learning_progress_epoch,e.learning_progress_reset_at);END IF;
 IF NEW.status='in_progress' AND EXISTS(SELECT 1 FROM public.test_attempt_sessions s
 WHERE s.user_id=NEW.user_id AND s.lesson_id=NEW.lesson_id AND s.status='in_progress'
 AND(e.learning_progress_reset_at IS NULL OR s.started_at>=e.learning_progress_reset_at))
 THEN RAISE EXCEPTION 'one_active_test_attempt_per_learning_run' USING ERRCODE='23505';END IF;
 RETURN NEW;
END;$lpr$;
REVOKE ALL ON FUNCTION public.lpr_guard_current_test_session()FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aaaa_lpr_current_session BEFORE INSERT ON public.test_attempt_sessions
 FOR EACH ROW EXECUTE FUNCTION public.lpr_guard_current_test_session();
DROP INDEX public.test_attempt_sessions_one_active;

REVOKE ALL ON FUNCTION public.lpr_get_student_test_state(uuid,text,boolean),
 public.lpr_start_test_attempt(uuid,uuid,text,boolean),
 public.lpr_submit_test_attempt(uuid,jsonb,text,boolean),
 public.lpr_complete_own_course_enrollment(uuid,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_student_test_state_at_epoch(uuid,text),public.get_student_test_state(uuid),
 public.start_test_attempt_at_epoch(uuid,uuid,text),public.start_test_attempt(uuid,uuid),
 public.submit_test_attempt_at_epoch(uuid,jsonb,text),public.submit_test_attempt(uuid,jsonb),
 public.complete_own_course_enrollment_at_epoch(uuid,text),public.complete_own_course_enrollment(uuid),
 public.increment_lesson_time(uuid,uuid,integer),public.recalc_enrollment_time(uuid)FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_student_test_state_at_epoch(uuid,text),public.get_student_test_state(uuid),
 public.start_test_attempt_at_epoch(uuid,uuid,text),public.start_test_attempt(uuid,uuid),
 public.submit_test_attempt_at_epoch(uuid,jsonb,text),public.submit_test_attempt(uuid,jsonb),
 public.complete_own_course_enrollment_at_epoch(uuid,text),public.complete_own_course_enrollment(uuid),
 public.increment_lesson_time(uuid,uuid,integer),public.recalc_enrollment_time(uuid)TO authenticated;


CREATE OR REPLACE FUNCTION public.get_student_dashboard_snapshot(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_profile record;
  v_org record;
  v_labor record;
  v_effective_org_id uuid;
  v_enrollments jsonb;
  v_documents jsonb;
  v_video_identified boolean;
  v_is_preview boolean;
BEGIN
  IF v_caller IS NULL OR p_user_id IS NULL
     OR public.account_deletion_access_allowed() IS NOT TRUE
     OR NOT EXISTS (SELECT 1 FROM public.profiles actor_profile WHERE actor_profile.user_id=v_caller AND actor_profile.blocked_at IS NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  v_is_preview := v_caller <> p_user_id AND NOT COALESCE(public.has_role(v_caller,'admin'::public.app_role),false);
  IF v_is_preview AND NOT EXISTS (
    SELECT 1 FROM public.profiles target_profile
    WHERE target_profile.user_id=p_user_id
      AND target_profile.organization_id IS NOT NULL
      AND public.is_student_profile(p_user_id,target_profile.organization_id)
      AND public.can_access_organization(target_profile.organization_id,'students.read')
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT
    p.user_id,
    p.full_name,
    p.organization_id,
    COALESCE(p.onboarding_completed, false) AS onboarding_completed
  INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  v_effective_org_id := v_profile.organization_id;

  SELECT ls.organization_id
  INTO v_labor
  FROM public.labor_safety_profiles ls
  WHERE ls.user_id = p_user_id
    AND (NOT v_is_preview OR ls.organization_id=v_profile.organization_id)
  ORDER BY ls.created_at DESC
  LIMIT 1;

  IF v_labor.organization_id IS NOT NULL THEN
    v_effective_org_id := v_labor.organization_id;
  END IF;

  IF v_effective_org_id IS NOT NULL THEN
    SELECT
      o.id,
      o.name,
      o.description,
      o.branding,
      o.student_dashboard_settings,
      o.subscription_plan
    INTO v_org
    FROM public.organizations o
    WHERE o.id = v_effective_org_id;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(enrollment_row.*)), '[]'::jsonb)
  INTO v_enrollments
  FROM (
    SELECT
      en.id,
      en.course_id,
      en.progress,
      en.learning_progress_epoch::text AS learning_progress_epoch,
      en.learning_progress_reset_at,
      en.status,
      en.time_spent,
      en.expires_at,
      c.title,
      CASE WHEN course_flags.library_only THEN NULL ELSE c.description END
        AS description,
      CASE WHEN course_flags.library_only THEN NULL ELSE c.duration END
        AS duration,
      CASE
        WHEN course_flags.library_only THEN true
        ELSE c.skip_video_identification
      END AS skip_video_identification,
      CASE WHEN course_flags.library_only THEN NULL ELSE c.cover_image_url END
        AS cover_image_url,
      course_flags.library_only,
      CASE
        WHEN course_flags.library_only THEN 0
        ELSE (
          SELECT COUNT(*)
          FROM public.lessons lesson_count
          WHERE lesson_count.course_id = en.course_id
        )
      END AS total_lessons,
      CASE
        WHEN course_flags.library_only THEN 0
        ELSE (
          SELECT COUNT(*)
          FROM public.lesson_progress lp
          JOIN public.lessons completed_lesson
            ON completed_lesson.id = lp.lesson_id
          WHERE lp.user_id = p_user_id
            AND lp.completed = true
            AND completed_lesson.course_id = en.course_id
        )
      END AS completed_lessons
    FROM public.enrollments en
    JOIN public.courses c ON c.id = en.course_id
    CROSS JOIN LATERAL (
      SELECT (
        NOT c.is_published
        AND COALESCE(
          c.landing_content
            @> '{"electronic_library":{"enabled":true}}'::jsonb,
          false
        )
      ) AS library_only
    ) course_flags
    WHERE en.user_id = p_user_id
      AND (NOT v_is_preview OR c.organization_id=v_effective_org_id)
      AND (
        NOT course_flags.library_only
        OR public.can_access_course(c.id, 'courses.read')
        OR (
          en.status IN ('active', 'completed')
          AND (
            en.expires_at IS NULL
            OR en.expires_at > now()
            OR en.status = 'completed'
          )
          AND EXISTS (
            SELECT 1
            FROM public.profiles learner_profile
            WHERE learner_profile.user_id = p_user_id
              AND learner_profile.organization_id = c.organization_id
          )
        )
      )
  ) enrollment_row;

  IF v_effective_org_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'has_passport', bool_or(sid.type = 'passport'),
      'has_snils', bool_or(sid.type = 'snils'),
      'has_education', bool_or(sid.type = 'education')
    )
    INTO v_documents
    FROM public.student_identity_documents sid
    WHERE sid.user_id = p_user_id
      AND (NOT v_is_preview OR sid.organization_id=v_effective_org_id);

    SELECT EXISTS (
      SELECT 1
      FROM public.video_identifications vi
      WHERE vi.user_id = p_user_id
        AND (NOT v_is_preview OR vi.organization_id=v_effective_org_id)
        AND vi.status = 'approved'
    )
    INTO v_video_identified;
  END IF;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'user_id', v_profile.user_id,
      'full_name', v_profile.full_name,
      'organization_id', v_profile.organization_id,
      'onboarding_completed', COALESCE(v_profile.onboarding_completed, false)
    ),
    'org', CASE WHEN v_org.id IS NOT NULL THEN jsonb_build_object(
      'id', v_org.id,
      'name', v_org.name,
      'description', v_org.description,
      'branding', v_org.branding,
      'student_dashboard_settings', v_org.student_dashboard_settings,
      'subscription_plan', v_org.subscription_plan
    ) ELSE NULL END,
    'enrollments', COALESCE(v_enrollments, '[]'::jsonb),
    'documents', COALESCE(
      v_documents,
      jsonb_build_object(
        'has_passport', false,
        'has_snils', false,
        'has_education', false
      )
    ),
    'video_identified', COALESCE(v_video_identified, false)
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.lpr_manual_complete_course(p_enrollment_id uuid,p_organization_id uuid,p_expected_epoch text,p_legacy boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_enrollment public.enrollments%ROWTYPE;
  v_organization_id uuid;
  v_credit public.course_manual_credits%ROWTYPE;
  initial_course uuid;target uuid;who uuid;
BEGIN
  IF v_actor IS NULL OR public.account_deletion_access_allowed()IS NOT TRUE
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_actor AND blocked_at IS NULL)THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  SELECT course_id,user_id INTO initial_course,target FROM public.enrollments WHERE id=p_enrollment_id;
  FOR who IN SELECT DISTINCT v FROM unnest(ARRAY[target,auth.uid()])v WHERE v IS NOT NULL ORDER BY v LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended(who::text,42007));
  END LOOP;
  IF initial_course=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])
   THEN PERFORM pg_advisory_xact_lock(7630559,178);END IF;
  SELECT e.* INTO v_enrollment FROM public.enrollments e WHERE e.id = p_enrollment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_enrollment.course_id IS DISTINCT FROM initial_course OR v_enrollment.user_id IS DISTINCT FROM target
   THEN RAISE EXCEPTION 'enrollment changed' USING ERRCODE='40001';END IF;
  SELECT c.organization_id INTO v_organization_id FROM public.courses c WHERE c.id = v_enrollment.course_id;
  IF p_organization_id IS NULL OR v_organization_id IS DISTINCT FROM p_organization_id
    OR NOT public.can_access_course(v_enrollment.course_id, 'students.write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public.lpr_assert_epoch(v_enrollment.learning_progress_epoch,v_enrollment.learning_progress_reset_at,p_expected_epoch,p_legacy);
  SELECT mc.* INTO v_credit FROM public.course_manual_credits mc
    WHERE mc.enrollment_id = p_enrollment_id AND mc.revoked_at IS NULL;
  IF NOT FOUND THEN
    INSERT INTO public.course_manual_credits(enrollment_id, credited_by)
      VALUES (p_enrollment_id, v_actor) RETURNING * INTO v_credit;
  END IF;
  -- Complete each lesson without manufacturing scores, answers or attempts.
  INSERT INTO public.lesson_progress(user_id, lesson_id, completed, completed_at)
    SELECT v_enrollment.user_id, l.id, true, v_credit.credited_at
    FROM public.lessons l WHERE l.course_id = v_enrollment.course_id
    ON CONFLICT (user_id, lesson_id) DO UPDATE
      SET completed = true,
          completed_at = COALESCE(public.lesson_progress.completed_at, EXCLUDED.completed_at);
  UPDATE public.enrollments SET status = 'completed', progress = 100,
    completed_at = COALESCE(completed_at, v_credit.credited_at)
    WHERE id = p_enrollment_id;
  RETURN jsonb_build_object('enrollmentId', p_enrollment_id, 'creditedAt', v_credit.credited_at, 'creditedBy', v_credit.credited_by,'learning_progress_epoch',v_enrollment.learning_progress_epoch::text,'learning_progress_reset_at',v_enrollment.learning_progress_reset_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.lpr_manual_complete_course(uuid,uuid,text,boolean)FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.manual_complete_course_at_epoch(p_enrollment_id uuid,p_organization_id uuid,p_expected_epoch text)RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
 SELECT public.lpr_manual_complete_course(p_enrollment_id,p_organization_id,p_expected_epoch,false);
$lpr$;
CREATE OR REPLACE FUNCTION public.manual_complete_course(p_enrollment_id uuid,p_organization_id uuid)RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $lpr$
 SELECT public.lpr_manual_complete_course(p_enrollment_id,p_organization_id,NULL,true);
$lpr$;
REVOKE ALL ON FUNCTION public.manual_complete_course_at_epoch(uuid,uuid,text),public.manual_complete_course(uuid,uuid)FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manual_complete_course_at_epoch(uuid,uuid,text),public.manual_complete_course(uuid,uuid)TO authenticated;

-- CSZ scoped homework uses the existing privacy/advisory/enrollment serialization;
-- old pending/approved submissions remain unchanged and do not occupy a new run.
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
    AND learning_progress_epoch=NEW.learning_progress_epoch
    ORDER BY submitted_at DESC,id DESC LIMIT 1;
  IF TG_OP='INSERT' THEN
    IF auth.uid() IS DISTINCT FROM NEW.student_id OR NOT public.can_access_course_as_learner(NEW.course_id)
      OR v_enrollment.status<>'active' OR NEW.status<>'pending'
      OR NEW.score IS NOT NULL OR NEW.reviewer_id IS NOT NULL OR NEW.reviewer_comment IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'S022: only own eligible pending submission is allowed' USING ERRCODE='42501';
    END IF;
    IF EXISTS(SELECT 1 FROM public.homework_submissions h WHERE h.student_id=NEW.student_id AND h.course_id=NEW.course_id
      AND h.lesson_id=NEW.lesson_id AND h.status='pending'
      AND h.learning_progress_epoch=v_enrollment.learning_progress_epoch)
      THEN RAISE EXCEPTION 'one_pending_homework_per_learning_run' USING ERRCODE='23505';END IF;
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
CREATE OR REPLACE FUNCTION public.csz_latest_homework_approved(p_student uuid, p_course uuid, p_lesson uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_status text;
BEGIN
  SELECT h.status INTO v_status FROM public.homework_submissions h
    JOIN public.lessons l ON l.id=h.lesson_id AND l.course_id=h.course_id AND l.type='homework'
    JOIN public.courses c ON c.id=h.course_id AND c.organization_id=h.organization_id
    JOIN public.enrollments e ON e.user_id=h.student_id AND e.course_id=h.course_id
    WHERE h.student_id=p_student AND h.course_id=p_course AND h.lesson_id=p_lesson
      AND h.learning_progress_epoch=e.learning_progress_epoch
    ORDER BY h.submitted_at DESC,h.id DESC LIMIT 1;
  RETURN coalesce(v_status='approved',false);
END;
$function$;
DROP INDEX public.csz_homework_one_pending_per_lesson;
CREATE UNIQUE INDEX csz_homework_one_pending_per_lesson ON public.homework_submissions(student_id,lesson_id,learning_progress_epoch)
 WHERE(course_id=ANY(ARRAY['7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a']::uuid[])AND status='pending');
COMMIT;
NOTIFY pgrst,'reload schema';

