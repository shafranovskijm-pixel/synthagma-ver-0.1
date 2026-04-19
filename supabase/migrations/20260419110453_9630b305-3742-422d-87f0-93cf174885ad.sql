-- Templates of AI Avatars (tutors) per organization, reusable in lessons
CREATE TABLE IF NOT EXISTS public.ai_avatar_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid,
  name text NOT NULL DEFAULT 'Безымянный преподаватель',
  image_url text,
  voice_id text NOT NULL DEFAULT 'Nec_24000',
  system_prompt text NOT NULL DEFAULT '',
  greeting text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  style text NOT NULL DEFAULT 'friendly',
  session_minutes integer NOT NULL DEFAULT 5,
  model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_avatar_templates_org ON public.ai_avatar_templates(organization_id);

ALTER TABLE public.ai_avatar_templates ENABLE ROW LEVEL SECURITY;

-- Organization members and admins can manage templates within their org
CREATE POLICY "Org can view its avatar templates"
  ON public.ai_avatar_templates FOR SELECT
  USING (
    has_role('admin'::app_role, auth.uid())
    OR organization_id = current_organization_id()
  );

CREATE POLICY "Org can insert avatar templates"
  ON public.ai_avatar_templates FOR INSERT
  WITH CHECK (
    has_role('admin'::app_role, auth.uid())
    OR (
      has_role('organization'::app_role, auth.uid())
      AND organization_id = current_organization_id()
    )
  );

CREATE POLICY "Org can update its avatar templates"
  ON public.ai_avatar_templates FOR UPDATE
  USING (
    has_role('admin'::app_role, auth.uid())
    OR (
      has_role('organization'::app_role, auth.uid())
      AND organization_id = current_organization_id()
    )
  );

CREATE POLICY "Org can delete its avatar templates"
  ON public.ai_avatar_templates FOR DELETE
  USING (
    has_role('admin'::app_role, auth.uid())
    OR (
      has_role('organization'::app_role, auth.uid())
      AND organization_id = current_organization_id()
    )
  );

CREATE TRIGGER update_ai_avatar_templates_updated_at
  BEFORE UPDATE ON public.ai_avatar_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();