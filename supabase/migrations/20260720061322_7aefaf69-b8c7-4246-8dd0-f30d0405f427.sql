DROP POLICY IF EXISTS "Admins can manage admin generated documents" ON public.admin_generated_documents;
CREATE POLICY "Admins can manage admin generated documents"
ON public.admin_generated_documents
FOR ALL
USING (
  has_admin_staff_role(auth.uid(), 'admin')
  OR has_admin_staff_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  has_admin_staff_role(auth.uid(), 'admin')
  OR has_admin_staff_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'admin'::app_role)
);