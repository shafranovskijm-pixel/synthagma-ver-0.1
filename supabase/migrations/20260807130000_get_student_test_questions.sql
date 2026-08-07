-- Students need the question text and options, but must never receive
-- test_questions.correct_answer through a direct table policy.
-- This RPC verifies either tenant course access (staff/admin preview) or an
-- active enrollment (student) and returns a deliberately masked shape.

CREATE OR REPLACE FUNCTION public.get_student_test_questions(p_lesson_id uuid)
RETURNS TABLE (
  id uuid,
  lesson_id uuid,
  question text,
  options jsonb,
  order_index integer,
  explanation text,
  is_bank_question boolean,
  image_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.can_access_lesson(p_lesson_id, 'courses.read')
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      JOIN public.enrollments e ON e.course_id = c.id
      WHERE l.id = p_lesson_id
        AND c.is_published = true
        AND e.user_id = auth.uid()
        AND e.status IN ('active', 'completed')
        AND (e.expires_at IS NULL OR e.expires_at > now())
    )
  ) THEN
    RAISE EXCEPTION 'Test questions are not available for this user' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    tq.id,
    tq.lesson_id,
    tq.question,
    tq.options,
    tq.order_index,
    tq.explanation,
    tq.is_bank_question,
    tq.image_url
  FROM public.test_questions tq
  WHERE tq.lesson_id = p_lesson_id
  ORDER BY tq.order_index;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_test_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_test_questions(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_student_test_questions(uuid) IS
  'Returns enrolled-student test questions without correct_answer; tenant staff access is allowed for preview.';
