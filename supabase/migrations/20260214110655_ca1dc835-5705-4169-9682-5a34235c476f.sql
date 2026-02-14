-- Allow admins to insert/update/delete courses (for marketplace platform courses)
CREATE POLICY "Admins can manage all courses"
ON public.courses
FOR ALL
USING (has_role('admin'::app_role, auth.uid()))
WITH CHECK (has_role('admin'::app_role, auth.uid()));
