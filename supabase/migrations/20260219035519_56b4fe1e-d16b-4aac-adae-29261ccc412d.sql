CREATE POLICY "Org admins can update profiles in their org"
  ON public.profiles FOR UPDATE
  USING (
    (organization_id = current_organization_id() AND has_role('organization'::app_role, auth.uid()))
    OR has_role('admin'::app_role, auth.uid())
  )
  WITH CHECK (
    (organization_id = current_organization_id() AND has_role('organization'::app_role, auth.uid()))
    OR has_role('admin'::app_role, auth.uid())
  );