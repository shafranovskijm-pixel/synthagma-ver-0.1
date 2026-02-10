
CREATE TABLE public.landing_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key TEXT UNIQUE NOT NULL,
  content_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read landing content"
  ON public.landing_content FOR SELECT USING (true);

CREATE POLICY "Admins can manage landing content"
  ON public.landing_content FOR ALL USING (
    has_role('admin'::app_role, auth.uid())
  );
