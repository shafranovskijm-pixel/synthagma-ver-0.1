
CREATE TABLE public.ai_prompt_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('structure','content')),
  scope TEXT NOT NULL CHECK (scope IN ('user','course')),
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_prompt_templates TO authenticated;
GRANT ALL ON public.ai_prompt_templates TO service_role;

ALTER TABLE public.ai_prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ai prompt templates"
  ON public.ai_prompt_templates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_ai_prompt_templates_user_kind ON public.ai_prompt_templates(user_id, kind);
CREATE INDEX idx_ai_prompt_templates_course ON public.ai_prompt_templates(course_id) WHERE course_id IS NOT NULL;

CREATE TRIGGER update_ai_prompt_templates_updated_at
  BEFORE UPDATE ON public.ai_prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
