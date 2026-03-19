
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value text NOT NULL DEFAULT '',
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for cache check before auth)
CREATE POLICY "Anyone can read app_settings" ON public.app_settings FOR SELECT USING (true);

-- Only admins can update
CREATE POLICY "Admins can update app_settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role('admin'::app_role, auth.uid()));

-- Insert initial force_cache_version
INSERT INTO public.app_settings (setting_key, setting_value) VALUES ('force_cache_version', 'v2026-03-19');
