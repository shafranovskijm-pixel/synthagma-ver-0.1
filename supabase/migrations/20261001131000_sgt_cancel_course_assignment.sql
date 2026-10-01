-- Cancel only an erroneous, unstarted assignment. Keep the existing enrollment
-- history/audit/protected-course triggers and never cascade retained records.
CREATE OR REPLACE FUNCTION public.cancel_course_assignment(p_enrollment_id uuid, p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET lock_timeout = '3s'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_enrollment public.enrollments%ROWTYPE;
  v_deleted_id uuid;
  v_relation record;
  v_has_records boolean;
BEGIN
  IF v_actor IS NULL OR p_organization_id IS NULL OR NOT coalesce((
    public.has_role(v_actor, 'admin'::public.app_role)
    OR public.is_org_owner(v_actor, p_organization_id)
    OR (
      EXISTS (SELECT 1 FROM public.org_staff os
        WHERE os.user_id = v_actor AND os.organization_id = p_organization_id
          AND (os.expires_at IS NULL OR os.expires_at > now()))
      AND public.has_org_staff_permission(v_actor, p_organization_id, 'students.write')
    )
  ), false) THEN
    RAISE EXCEPTION 'assignment_forbidden' USING ERRCODE = '42501';
  END IF;
  -- Guards must observe writes that completed while waiting for the locks.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'assignment_requires_read_committed' USING ERRCODE = '25000';
  END IF;
  -- These learning tables have no enrollment FK. Briefly prevent concurrent
  -- inserts/updates while checking them; a busy learner causes a retry, not loss.
  LOCK TABLE public.lessons, public.lesson_progress, public.test_attempts IN SHARE MODE;
  FOR v_relation IN
    SELECT c.oid::regclass AS relation FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (
        'test_attempt_sessions', 'homework_submissions', 'course_access_log', 'education_document_records'
      ) AND c.relkind IN ('r', 'p') ORDER BY c.oid
  LOOP
    EXECUTE format('LOCK TABLE %s IN SHARE MODE', v_relation.relation);
  END LOOP;
  -- Block concurrent changes to the incoming FK set while inspecting it.
  LOCK TABLE public.enrollments IN ROW EXCLUSIVE MODE;
  SELECT e.* INTO v_enrollment FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    JOIN public.profiles p ON p.user_id = e.user_id
    WHERE e.id = p_enrollment_id AND c.organization_id = p_organization_id
      AND p.organization_id = p_organization_id
    FOR UPDATE OF e FOR SHARE OF c, p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- started_at is the assignment date, populated by DEFAULT now(); it is not
  -- proof that a learner started studying.
  IF coalesce(v_enrollment.progress, 0) <> 0 OR coalesce(v_enrollment.time_spent, 0) <> 0
    OR v_enrollment.status IS DISTINCT FROM 'active' OR v_enrollment.completed_at IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.lesson_progress lp JOIN public.lessons l ON l.id = lp.lesson_id
      WHERE lp.user_id = v_enrollment.user_id AND l.course_id = v_enrollment.course_id)
    OR EXISTS (SELECT 1 FROM public.test_attempts ta JOIN public.lessons l ON l.id = ta.lesson_id
      WHERE ta.user_id = v_enrollment.user_id AND l.course_id = v_enrollment.course_id) THEN
    RAISE EXCEPTION 'assignment_has_learning_history' USING ERRCODE = '23514';
  END IF;
  FOR v_relation IN
    SELECT c.oid::regclass AS relation, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('test_attempt_sessions', 'homework_submissions', 'course_access_log')
        AND c.relkind IN ('r', 'p') ORDER BY c.oid
  LOOP
    IF v_relation.relname = 'test_attempt_sessions' THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s r JOIN public.lessons l ON l.id = r.lesson_id WHERE r.user_id = $1 AND l.course_id = $2)', v_relation.relation)
        INTO v_has_records USING v_enrollment.user_id, v_enrollment.course_id;
    ELSIF v_relation.relname = 'homework_submissions' THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE student_id = $1 AND course_id = $2)', v_relation.relation)
        INTO v_has_records USING v_enrollment.user_id, v_enrollment.course_id;
    ELSE
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE user_id = $1 AND course_id = $2)', v_relation.relation)
        INTO v_has_records USING v_enrollment.user_id, v_enrollment.course_id;
    END IF;
    IF v_has_records THEN
      RAISE EXCEPTION 'assignment_has_learning_history' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  -- Also preserve historical documents whose enrollment_id was cleared earlier.
  IF to_regclass('public.education_document_records') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.education_document_records WHERE user_id = $1 AND course_id = $2)'
      INTO v_has_records USING v_enrollment.user_id, v_enrollment.course_id;
    IF v_has_records THEN
      RAISE EXCEPTION 'assignment_has_dependent_records' USING ERRCODE = '23514';
    END IF;
  END IF;
  -- Inspect every incoming FK, including SET NULL and future relations. The row
  -- lock prevents a concurrent child insert from passing its FK check.
  FOR v_relation IN
    SELECT con.conkey, con.confkey, ns.nspname, rel.relname, att.attname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      LEFT JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
      WHERE con.contype = 'f' AND con.confrelid = 'public.enrollments'::regclass
  LOOP
    IF cardinality(v_relation.conkey) <> 1 OR cardinality(v_relation.confkey) <> 1
      OR v_relation.confkey[1] <> (SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.enrollments'::regclass AND attname = 'id') THEN
      RAISE EXCEPTION 'assignment_has_dependent_records' USING ERRCODE = '23514';
    END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)',
      v_relation.nspname, v_relation.relname, v_relation.attname)
      INTO v_has_records USING p_enrollment_id;
    IF v_has_records THEN
      RAISE EXCEPTION 'assignment_has_dependent_records' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  DELETE FROM public.enrollments WHERE id = p_enrollment_id RETURNING id INTO v_deleted_id;
  IF v_deleted_id IS DISTINCT FROM p_enrollment_id OR EXISTS (
    SELECT 1 FROM public.enrollments WHERE id = p_enrollment_id
  ) THEN
    RAISE EXCEPTION 'assignment_verification_failed' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('cancelled', true, 'enrollmentId', v_deleted_id,
    'organizationId', p_organization_id, 'userId', v_enrollment.user_id, 'courseId', v_enrollment.course_id);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_course_assignment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_course_assignment(uuid, uuid) TO authenticated;
