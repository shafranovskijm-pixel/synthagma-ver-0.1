CREATE POLICY "Admins can manage all categories"
ON public.course_categories
FOR ALL
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()))
WITH CHECK (public.has_role('admin'::app_role, auth.uid()));