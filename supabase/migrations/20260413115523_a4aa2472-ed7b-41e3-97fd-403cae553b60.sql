-- Course: default access duration in days
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS default_access_days integer;

-- Lessons: lock individual lessons
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;