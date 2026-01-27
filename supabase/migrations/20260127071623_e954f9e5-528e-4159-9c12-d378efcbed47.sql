-- Add video_position column to lesson_progress to save watch progress
ALTER TABLE public.lesson_progress 
ADD COLUMN IF NOT EXISTS video_position REAL DEFAULT 0;

-- Add video_duration column to track total duration for percentage calculation
ALTER TABLE public.lesson_progress 
ADD COLUMN IF NOT EXISTS video_duration REAL DEFAULT 0;

COMMENT ON COLUMN public.lesson_progress.video_position IS 'Current video playback position in seconds';
COMMENT ON COLUMN public.lesson_progress.video_duration IS 'Total video duration in seconds';