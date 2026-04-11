DROP POLICY IF EXISTS "Org users can view attempts for their courses" ON public.test_attempts;
CREATE POLICY "Org users can view attempts for their courses" 
  ON public.test_attempts FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM lessons l 
      JOIN courses c ON c.id = l.course_id 
      WHERE l.id = test_attempts.lesson_id 
      AND c.organization_id = current_organization_id()
    )
    OR has_role('admin'::app_role, auth.uid())
  );