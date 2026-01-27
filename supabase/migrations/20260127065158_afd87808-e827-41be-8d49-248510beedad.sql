-- Add test settings to lessons table
ALTER TABLE public.lessons
ADD COLUMN IF NOT EXISTS test_passing_score integer NOT NULL DEFAULT 60,
ADD COLUMN IF NOT EXISTS test_questions_to_show integer NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.lessons.test_passing_score IS 'Minimum passing score percentage (0-100)';
COMMENT ON COLUMN public.lessons.test_questions_to_show IS 'Number of random questions to show from the bank (NULL = show all)';