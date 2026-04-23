-- Add last_seen_announcement_at to profiles for "what's new" bell badge
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS last_seen_announcement_at timestamptz;

-- Add generation_progress to courses for realtime AI generation progress
-- Format: {"step": "content", "current": 7, "total": 35, "message": "Урок 7 из 35"}
ALTER TABLE public.courses 
  ADD COLUMN IF NOT EXISTS generation_progress jsonb;

-- Index for fast lookups during active generation
CREATE INDEX IF NOT EXISTS idx_courses_generation_progress 
  ON public.courses(id) 
  WHERE generation_progress IS NOT NULL;