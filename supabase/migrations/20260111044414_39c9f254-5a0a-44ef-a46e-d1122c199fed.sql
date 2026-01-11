-- Drop the restrictive INSERT policy
DROP POLICY IF EXISTS "Users can create own enrollments" ON public.enrollments;

-- Create new policy allowing org users and admins to create enrollments
CREATE POLICY "Users and org users can create enrollments" 
ON public.enrollments 
FOR INSERT 
WITH CHECK (
  user_id = auth.uid() 
  OR has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM courses c 
    WHERE c.id = course_id 
    AND c.organization_id = current_organization_id()
  )
);

-- Add policy for org users and admins to update enrollments
CREATE POLICY "Org users and admins can update enrollments" 
ON public.enrollments 
FOR UPDATE 
USING (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM courses c 
    WHERE c.id = enrollments.course_id 
    AND c.organization_id = current_organization_id()
  )
);

-- Add policy for org users and admins to delete enrollments
CREATE POLICY "Org users and admins can delete enrollments" 
ON public.enrollments 
FOR DELETE 
USING (
  has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM courses c 
    WHERE c.id = enrollments.course_id 
    AND c.organization_id = current_organization_id()
  )
);