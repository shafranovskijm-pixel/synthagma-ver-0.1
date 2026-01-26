-- Add sequential lessons and video seek settings to courses
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS sequential_lessons boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_video_seek boolean NOT NULL DEFAULT true;

-- Add comment for clarity
COMMENT ON COLUMN public.courses.sequential_lessons IS 'When enabled, students must complete lessons in order';
COMMENT ON COLUMN public.courses.allow_video_seek IS 'When disabled, students cannot seek/rewind videos';