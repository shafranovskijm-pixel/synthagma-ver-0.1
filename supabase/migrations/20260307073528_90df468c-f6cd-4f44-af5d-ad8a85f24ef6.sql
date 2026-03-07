
CREATE TABLE public.ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context text NOT NULL UNIQUE,
  provider text NOT NULL DEFAULT 'gigachat',
  gigachat_model text DEFAULT 'GigaChat-Pro',
  lovable_model text DEFAULT 'google/gemini-2.5-flash',
  concurrency int DEFAULT 3,
  extra_config jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_ai_settings" ON public.ai_settings
  FOR ALL TO authenticated
  USING (public.has_role('admin'::app_role, auth.uid()))
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

-- Seed default rows
INSERT INTO public.ai_settings (context, provider, gigachat_model, lovable_model, concurrency, extra_config) VALUES
  ('course_generation', 'gigachat', 'GigaChat-Pro', 'google/gemini-2.5-flash', 3, '{}'),
  ('tts', 'elevenlabs', 'GigaChat-Pro', 'google/gemini-2.5-flash', 1, '{}'),
  ('consultant', 'gigachat', 'GigaChat-Max', 'google/gemini-2.5-flash', 1, '{}'),
  ('marketplace', 'lovable_ai', 'GigaChat-Pro', 'google/gemini-2.5-flash', 1, '{}'),
  ('pipeline', 'round_robin', 'GigaChat-Max', 'google/gemini-2.5-flash', 3, '{"slot0_model":"GigaChat-Max","slot1_model":"GigaChat-Pro","gemini_model":"google/gemini-2.5-flash"}'),
  ('org_default', 'gigachat', 'GigaChat-Pro', 'google/gemini-2.5-flash', 3, '{"allow_org_override":true}');
