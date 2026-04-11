
-- Fix: add admin bypass to lesson_progress SELECT policy
DROP POLICY IF EXISTS "Org users can view progress for their courses" ON public.lesson_progress;
CREATE POLICY "Org users can view progress for their courses" 
  ON public.lesson_progress FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.lessons l 
      JOIN public.courses c ON c.id = l.course_id 
      WHERE l.id = lesson_progress.lesson_id 
      AND c.organization_id = current_organization_id()
    )
    OR has_role('admin'::app_role, auth.uid())
  );
