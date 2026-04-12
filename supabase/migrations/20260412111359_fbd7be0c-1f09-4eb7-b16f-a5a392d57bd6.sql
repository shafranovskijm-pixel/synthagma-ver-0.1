
-- Add Kinescope Live columns to existing webinars table
ALTER TABLE public.webinars
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS kinescope_live_id text,
  ADD COLUMN IF NOT EXISTS kinescope_video_id text,
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS embed_url text,
  ADD COLUMN IF NOT EXISTS rtmp_url text,
  ADD COLUMN IF NOT EXISTS rtmp_key text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Update RLS: drop old policies and create new ones
DROP POLICY IF EXISTS "Org users can manage own webinars" ON public.webinars;
DROP POLICY IF EXISTS "Students can view accessible webinars" ON public.webinars;

CREATE POLICY "Org users can view own webinars"
  ON public.webinars FOR SELECT
  TO authenticated
  USING (
    organization_id = current_organization_id()
    OR has_role('admin'::app_role, auth.uid())
    OR EXISTS (
      SELECT 1 FROM webinar_participants wp
      WHERE wp.webinar_id = id AND wp.user_id = auth.uid()
    )
  );

CREATE POLICY "Org users can insert webinars"
  ON public.webinars FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = current_organization_id()
    OR has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "Org users can update own webinars"
  ON public.webinars FOR UPDATE
  TO authenticated
  USING (
    organization_id = current_organization_id()
    OR has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "Org users can delete own webinars"
  ON public.webinars FOR DELETE
  TO authenticated
  USING (
    organization_id = current_organization_id()
    OR has_role('admin'::app_role, auth.uid())
  );

-- Ensure webinar_participants RLS
DROP POLICY IF EXISTS "View participants" ON public.webinar_participants;
DROP POLICY IF EXISTS "Add participants" ON public.webinar_participants;
DROP POLICY IF EXISTS "Remove participants" ON public.webinar_participants;

CREATE POLICY "View participants"
  ON public.webinar_participants FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role('admin'::app_role, auth.uid())
    OR EXISTS (
      SELECT 1 FROM webinars w
      WHERE w.id = webinar_id AND w.organization_id = current_organization_id()
    )
  );

CREATE POLICY "Add participants"
  ON public.webinar_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role('admin'::app_role, auth.uid())
    OR EXISTS (
      SELECT 1 FROM webinars w
      WHERE w.id = webinar_id AND w.organization_id = current_organization_id()
    )
  );

CREATE POLICY "Remove participants"
  ON public.webinar_participants FOR DELETE
  TO authenticated
  USING (
    has_role('admin'::app_role, auth.uid())
    OR EXISTS (
      SELECT 1 FROM webinars w
      WHERE w.id = webinar_id AND w.organization_id = current_organization_id()
    )
  );

-- Add indexes if not exist
CREATE INDEX IF NOT EXISTS idx_webinars_org ON public.webinars(organization_id);
CREATE INDEX IF NOT EXISTS idx_webinars_status ON public.webinars(status);
