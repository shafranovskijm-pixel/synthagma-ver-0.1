
-- Fix: Restrict direct SELECT on test_questions base table to org/admin users only.
-- Students must use the test_questions_for_students view (which masks correct_answer).

-- Drop the overly permissive policy that lets any enrolled student see correct_answer
DROP POLICY IF EXISTS "Test questions viewable with course access" ON public.test_questions;

-- New policy: only organization owners and admins can SELECT from the base table
CREATE POLICY "Org and admin can view test questions"
ON public.test_questions FOR SELECT
USING (
  has_role('admin'::app_role, auth.uid())
  OR (
    has_role('organization'::app_role, auth.uid())
    AND EXISTS (
      SELECT 1 FROM lessons l
      JOIN courses c ON c.id = l.course_id
      WHERE l.id = test_questions.lesson_id
      AND c.organization_id = current_organization_id()
    )
  )
);
