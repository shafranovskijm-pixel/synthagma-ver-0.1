
-- Add AI avatar lesson type fields to lessons table
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS ai_avatar_name text,
  ADD COLUMN IF NOT EXISTS ai_avatar_image_url text,
  ADD COLUMN IF NOT EXISTS ai_avatar_voice_id text DEFAULT 'Nec_24000',
  ADD COLUMN IF NOT EXISTS ai_avatar_system_prompt text,
  ADD COLUMN IF NOT EXISTS ai_avatar_greeting text,
  ADD COLUMN IF NOT EXISTS ai_avatar_subject text,
  ADD COLUMN IF NOT EXISTS ai_avatar_style text DEFAULT 'friendly',
  ADD COLUMN IF NOT EXISTS ai_avatar_session_minutes integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS ai_avatar_model text DEFAULT 'google/gemini-3-flash-preview';

-- Link tutor sessions to specific lesson
ALTER TABLE public.ai_tutor_sessions
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_tutor_sessions_lesson_id ON public.ai_tutor_sessions(lesson_id);
