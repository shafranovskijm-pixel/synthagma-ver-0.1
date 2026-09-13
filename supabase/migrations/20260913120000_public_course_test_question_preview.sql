-- Allow authenticated marketplace/store visitors to preview questions from a
-- published course. The function keeps answer keys out of its return type and
-- only exposes explanations to staff who can read the lesson in its tenant.

CREATE OR REPLACE VIEW public.test_questions_for_students
WITH (security_invoker = true)
AS
SELECT
  tq.id,
  tq.lesson_id,
  tq.question,
  tq.options,
  tq.order_index,
  CASE
    WHEN public.can_access_lesson(tq.lesson_id, 'courses.read') THEN tq.explanation
    ELSE NULL::text
  END AS explanation,
  tq.is_bank_question,
  tq.image_url,
  CASE
    WHEN public.can_access_lesson(tq.lesson_id, 'courses.read') THEN tq.correct_answer
    ELSE NULL::integer
  END AS correct_answer
FROM public.test_questions tq
WHERE EXISTS (
  SELECT 1
  FROM public.lessons l
  JOIN public.courses c ON c.id = l.course_id
  WHERE l.id = tq.lesson_id
    AND (
      c.is_published IS TRUE
      OR public.can_access_lesson(tq.lesson_id, 'courses.read')
    )
);

REVOKE ALL ON public.test_questions_for_students FROM PUBLIC, anon;
GRANT SELECT ON public.test_questions_for_students TO authenticated;

COMMENT ON VIEW public.test_questions_for_students IS
  'Legacy question view: correct_answer and explanation are visible only to staff with courses.read access to the lesson tenant.';

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
DECLARE
  v_can_preview_as_staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_can_preview_as_staff := public.can_access_lesson(p_lesson_id, 'courses.read');

  IF NOT (
    v_can_preview_as_staff
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE l.id = p_lesson_id
        AND c.is_published IS TRUE
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
    CASE WHEN v_can_preview_as_staff THEN tq.explanation ELSE NULL::text END,
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
  'Returns masked test questions to authenticated users for published courses and to authorized tenant staff for preview; correct_answer is never returned and explanation is staff-only.';
