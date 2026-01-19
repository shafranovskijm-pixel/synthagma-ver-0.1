-- Add skip_video_identification column to courses table
ALTER TABLE public.courses ADD COLUMN skip_video_identification boolean DEFAULT false;