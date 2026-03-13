
CREATE TABLE public.marketplace_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.marketplace_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write
CREATE POLICY "Admins can select marketplace_settings"
ON public.marketplace_settings FOR SELECT
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can insert marketplace_settings"
ON public.marketplace_settings FOR INSERT
TO authenticated
WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Admins can update marketplace_settings"
ON public.marketplace_settings FOR UPDATE
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()));

-- Seed defaults
INSERT INTO public.marketplace_settings (setting_key, setting_value) VALUES
  ('validation_rules', '{"minLessons": 3, "minContentLength": 50, "requireTest": true, "requireText": true, "checkDuplicateTitles": true}'::jsonb),
  ('ai_prompts', '{}'::jsonb);
