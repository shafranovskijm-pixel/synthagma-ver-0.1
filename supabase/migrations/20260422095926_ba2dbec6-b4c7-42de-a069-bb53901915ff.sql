
-- 1. Suppression list (отписка / жалобы / bounce)
CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'platform',  -- 'platform' or organization_id
  reason TEXT NOT NULL DEFAULT 'unsubscribe', -- unsubscribe | bounce | complaint | manual
  source_campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, scope)
);

CREATE INDEX IF NOT EXISTS idx_email_suppressions_email ON public.email_suppressions(email);
CREATE INDEX IF NOT EXISTS idx_email_suppressions_scope ON public.email_suppressions(scope);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Suppressions: admins read all"
  ON public.email_suppressions FOR SELECT
  USING (has_role('admin'::app_role, auth.uid()) OR scope = current_organization_id()::text);

CREATE POLICY "Suppressions: admins insert"
  ON public.email_suppressions FOR INSERT
  WITH CHECK (has_role('admin'::app_role, auth.uid()) OR scope = current_organization_id()::text);

CREATE POLICY "Suppressions: admins delete"
  ON public.email_suppressions FOR DELETE
  USING (has_role('admin'::app_role, auth.uid()) OR scope = current_organization_id()::text);

-- 2. Click tracking
CREATE TABLE IF NOT EXISTS public.email_campaign_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.email_campaign_recipients(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_clicks_campaign ON public.email_campaign_clicks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_clicks_recipient ON public.email_campaign_clicks(recipient_id);

ALTER TABLE public.email_campaign_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clicks: visible to campaign owner"
  ON public.email_campaign_clicks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    WHERE c.id = email_campaign_clicks.campaign_id
      AND (has_role('admin'::app_role, auth.uid())
           OR (c.scope = 'org' AND c.organization_id = current_organization_id()))
  ));

-- 3. Add click_count + scheduled_at index to email_campaigns
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unsubscribe_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS utm_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled
  ON public.email_campaigns(scheduled_at)
  WHERE status = 'scheduled';

-- 4. Helper function: check if email is suppressed
CREATE OR REPLACE FUNCTION public.is_email_suppressed(p_email TEXT, p_scope TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.email_suppressions
    WHERE lower(email) = lower(p_email)
      AND (scope = p_scope OR scope = 'platform')
  );
$$;
