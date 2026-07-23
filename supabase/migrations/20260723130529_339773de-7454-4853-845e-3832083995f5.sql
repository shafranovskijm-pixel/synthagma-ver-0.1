ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS test_show_answers boolean NOT NULL DEFAULT true;