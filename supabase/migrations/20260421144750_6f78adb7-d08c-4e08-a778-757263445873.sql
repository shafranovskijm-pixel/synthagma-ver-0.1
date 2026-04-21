
-- Security definer helpers to break RLS recursion between webinars and webinar_participants
CREATE OR REPLACE FUNCTION public.is_webinar_org_member(_webinar_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.webinars w
    WHERE w.id = _webinar_id
      AND w.organization_id = public.current_organization_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_webinar_participant(_webinar_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.webinar_participants wp
    WHERE wp.webinar_id = _webinar_id AND wp.user_id = _user_id
  );
$$;

-- webinars: drop and recreate policies without cross-table EXISTS
DROP POLICY IF EXISTS "Org users can view own webinars" ON public.webinars;
DROP POLICY IF EXISTS "Org users can insert webinars" ON public.webinars;
DROP POLICY IF EXISTS "Org users can update own webinars" ON public.webinars;
DROP POLICY IF EXISTS "Org users can delete own webinars" ON public.webinars;

CREATE POLICY "Webinars select" ON public.webinars
FOR SELECT USING (
  organization_id = public.current_organization_id()
  OR public.has_role('admin'::app_role, auth.uid())
  OR public.is_webinar_participant(id, auth.uid())
);

CREATE POLICY "Webinars insert" ON public.webinars
FOR INSERT WITH CHECK (
  organization_id = public.current_organization_id()
  OR public.has_role('admin'::app_role, auth.uid())
  OR organization_id IS NULL AND public.has_role('admin'::app_role, auth.uid())
);

CREATE POLICY "Webinars update" ON public.webinars
FOR UPDATE USING (
  organization_id = public.current_organization_id()
  OR public.has_role('admin'::app_role, auth.uid())
);

CREATE POLICY "Webinars delete" ON public.webinars
FOR DELETE USING (
  organization_id = public.current_organization_id()
  OR public.has_role('admin'::app_role, auth.uid())
);

-- webinar_participants: drop all 4 and recreate without inline EXISTS on webinars
DROP POLICY IF EXISTS "Org users can manage participants" ON public.webinar_participants;
DROP POLICY IF EXISTS "View participants" ON public.webinar_participants;
DROP POLICY IF EXISTS "Add participants" ON public.webinar_participants;
DROP POLICY IF EXISTS "Remove participants" ON public.webinar_participants;

CREATE POLICY "Participants select" ON public.webinar_participants
FOR SELECT USING (
  user_id = auth.uid()
  OR public.has_role('admin'::app_role, auth.uid())
  OR public.is_webinar_org_member(webinar_id)
);

CREATE POLICY "Participants insert" ON public.webinar_participants
FOR INSERT WITH CHECK (
  public.has_role('admin'::app_role, auth.uid())
  OR public.is_webinar_org_member(webinar_id)
);

CREATE POLICY "Participants delete" ON public.webinar_participants
FOR DELETE USING (
  public.has_role('admin'::app_role, auth.uid())
  OR public.is_webinar_org_member(webinar_id)
);
