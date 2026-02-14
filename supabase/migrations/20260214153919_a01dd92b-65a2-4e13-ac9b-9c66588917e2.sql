
-- Fix: the ALL policy needs WITH CHECK for INSERT/UPDATE to work
DROP POLICY "Org users can manage test questions" ON public.test_questions;

CREATE POLICY "Org users can manage test questions"
ON public.test_questions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = test_questions.lesson_id
      AND (c.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = test_questions.lesson_id
      AND (c.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  )
);
