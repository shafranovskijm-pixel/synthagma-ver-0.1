
-- Demo links for sales presentations
CREATE TABLE public.sales_demo_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  kinescope_live_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.sales_demo_links ENABLE ROW LEVEL SECURITY;

-- Anyone can read (to validate tokens)
CREATE POLICY "Anyone can read demo links"
  ON public.sales_demo_links FOR SELECT
  USING (true);

-- Only admins can manage
CREATE POLICY "Admins can insert demo links"
  ON public.sales_demo_links FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can update demo links"
  ON public.sales_demo_links FOR UPDATE
  TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can delete demo links"
  ON public.sales_demo_links FOR DELETE
  TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()));

-- Demo sessions tracking
CREATE TABLE public.sales_demo_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  demo_link_id UUID NOT NULL REFERENCES public.sales_demo_links(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id UUID,
  participant_name TEXT,
  org_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_demo_sessions ENABLE ROW LEVEL SECURITY;

-- Admins can view all sessions
CREATE POLICY "Admins can view demo sessions"
  ON public.sales_demo_sessions FOR SELECT
  TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()));

-- Anyone can insert (public demo registration via edge function uses service role)
CREATE POLICY "Anyone can insert demo sessions"
  ON public.sales_demo_sessions FOR INSERT
  WITH CHECK (true);
