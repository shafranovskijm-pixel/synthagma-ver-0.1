-- Add explanation field to test_questions for explaining wrong answers
ALTER TABLE public.test_questions 
ADD COLUMN IF NOT EXISTS explanation text;

-- Add is_bank_question to mark questions as part of question bank (vs always shown)
ALTER TABLE public.test_questions 
ADD COLUMN IF NOT EXISTS is_bank_question boolean NOT NULL DEFAULT true;

-- Add test settings to lessons for bank configuration
ALTER TABLE public.lessons
ADD COLUMN IF NOT EXISTS test_questions_count integer DEFAULT 5;

-- Add used_question_ids to test_attempts to track which questions were shown
ALTER TABLE public.test_attempts
ADD COLUMN IF NOT EXISTS shown_question_ids jsonb DEFAULT '[]'::jsonb;