-- Read-only, anonymised projection of existing records for an authorised course.
-- No new enrolments, learner roles, table grants or RLS policies are created.
CREATE OR REPLACE FUNCTION public.get_course_review_register(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_records jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_review_course(p_course_id) THEN
    RAISE EXCEPTION 'Course review is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data.payload ORDER BY row_data.record_no), '[]'::jsonb)
  INTO v_records
  FROM (
    SELECT numbered.record_no, jsonb_build_object(
      'record_no', numbered.record_no,
      'status', numbered.status,
      'progress', numbered.progress,
      'started_at', numbered.started_at,
      'completed_at', numbered.completed_at,
      'tests', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'lesson_title', lesson_row.title,
          'score', attempt_row.score,
          'max_score', attempt_row.max_score,
          'completed_at', attempt_row.completed_at
        ) ORDER BY attempt_row.completed_at, attempt_row.id)
        FROM public.test_attempts attempt_row
        JOIN public.lessons lesson_row ON lesson_row.id = attempt_row.lesson_id
        WHERE attempt_row.user_id = numbered.user_id
          AND lesson_row.course_id = p_course_id
      ), '[]'::jsonb),
      'assignments', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'lesson_title', lesson_row.title,
          'status', submission_row.status,
          'score', submission_row.score,
          'submitted_at', submission_row.submitted_at,
          'reviewed_at', submission_row.reviewed_at
        ) ORDER BY submission_row.submitted_at, submission_row.id)
        FROM public.homework_submissions submission_row
        JOIN public.lessons lesson_row ON lesson_row.id = submission_row.lesson_id
        JOIN public.courses course_row ON course_row.id = lesson_row.course_id
        WHERE submission_row.student_id = numbered.user_id
          AND submission_row.course_id = p_course_id
          AND lesson_row.course_id = p_course_id
          AND submission_row.organization_id = course_row.organization_id
      ), '[]'::jsonb)
    ) AS payload
    FROM (
      SELECT row_number() OVER (ORDER BY enrollment_row.started_at, enrollment_row.id) AS record_no,
        enrollment_row.user_id, enrollment_row.status, enrollment_row.progress,
        enrollment_row.started_at, enrollment_row.completed_at
      FROM public.enrollments enrollment_row
      WHERE enrollment_row.course_id = p_course_id
    ) numbered
  ) row_data;

  RETURN jsonb_build_object(
    'course_id', p_course_id,
    'recorded_at', now(),
    'enrollment_count', jsonb_array_length(v_records),
    'records', v_records
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_course_review_register(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_review_register(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.get_course_review_register(uuid) IS
  'Existing course records only; current exact course review grant required. No learner identifiers, profiles, answers or free-text submissions.';
