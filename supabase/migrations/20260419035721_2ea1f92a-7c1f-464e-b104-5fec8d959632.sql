DROP POLICY IF EXISTS "Org users can view own webinars" ON public.webinars;

CREATE POLICY "Org users can view own webinars"
ON public.webinars
FOR SELECT
USING (
  organization_id = current_organization_id()
  OR has_role('admin'::app_role, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.webinar_participants wp
    WHERE wp.webinar_id = webinars.id AND wp.user_id = auth.uid()
  )
);