-- Drop the old SELECT policy for org users
DROP POLICY IF EXISTS "Org users can view enrollments for their courses" ON public.enrollments;

-- Create new policy that includes admins
CREATE POLICY "Org users and admins can view enrollments for their courses" 
ON public.enrollments 
FOR SELECT 
USING (
  user_id = auth.uid()
  OR has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM courses c 
    WHERE c.id = enrollments.course_id 
    AND c.organization_id = current_organization_id()
  )
);