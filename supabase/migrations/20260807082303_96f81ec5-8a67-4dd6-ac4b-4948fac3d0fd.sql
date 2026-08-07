-- Course completion must not depend on optional document requisites.

CREATE OR REPLACE FUNCTION public.auto_create_education_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course public.courses%ROWTYPE;
  v_full_name text;
  v_birth_date date;
  v_doc_type text;
  v_existing_count integer;
  v_year integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed'
     OR (TG_OP = 'UPDATE' AND OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_course
  FROM public.courses
  WHERE id = NEW.course_id;

  IF NOT FOUND OR v_course.frdo_program_type IS NULL THEN
    RETURN NEW;
  END IF;

  v_doc_type := CASE v_course.frdo_program_type
    WHEN 'qualification_upgrade' THEN 'certificate'
    WHEN 'professional_retraining' THEN 'diploma'
    WHEN 'professional_training' THEN 'qualification'
    ELSE NULL
  END;

  IF v_doc_type IS NULL OR EXISTS (
    SELECT 1
    FROM public.education_document_records edr
    WHERE edr.enrollment_id = NEW.id
      AND edr.deleted_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(BTRIM(p.full_name), '')
  INTO v_full_name
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id
  LIMIT 1;

  SELECT sfd.birth_date
  INTO v_birth_date
  FROM public.student_frdo_data sfd
  WHERE sfd.user_id = NEW.user_id
  LIMIT 1;

  -- Do not create an official document record from blank requisites.
  IF v_full_name IS NULL OR v_birth_date IS NULL THEN
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  SELECT COUNT(*) + 1
  INTO v_existing_count
  FROM public.education_document_records edr
  WHERE edr.organization_id = v_course.organization_id
    AND EXTRACT(YEAR FROM edr.issue_date) = v_year;

  INSERT INTO public.education_document_records (
    organization_id, enrollment_id, full_name, birth_date,
    document_type, document_number, reg_number, issue_date,
    specialty_name, qualification_name, document_status, delivery_method
  ) VALUES (
    v_course.organization_id, NEW.id, v_full_name, v_birth_date,
    v_doc_type,
    v_year || '/' || LPAD(v_existing_count::text, 6, '0'),
    'DOC-' || v_year || '/' || LPAD(v_existing_count::text, 4, '0'),
    CURRENT_DATE, v_course.title, v_course.frdo_qualification_name,
    'original', 'personal'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Document issuing is a follow-up workflow and must not roll back learning.
  RAISE WARNING 'education document was not auto-created for enrollment %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_own_course_enrollment(
  p_enrollment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT *
  INTO v_enrollment
  FROM public.enrollments e
  WHERE e.id = p_enrollment_id
    AND e.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrollment_not_found' USING ERRCODE = 'P0002';
  END IF;

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
   AND (ta.score::numeric * 100 / ta.max_score::numeric) >= COALESCE(l.test_passing_score, 60)
  WHERE l.course_id = v_enrollment.course_id
    AND l.type = 'test'
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
    'was_already_completed', v_was_completed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_own_course_enrollment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_own_course_enrollment(uuid) TO authenticated;