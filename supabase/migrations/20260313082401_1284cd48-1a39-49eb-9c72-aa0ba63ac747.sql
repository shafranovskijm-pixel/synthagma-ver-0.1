ALTER TABLE public.course_categories
  ADD COLUMN IF NOT EXISTS parent_type text DEFAULT 'Повышение квалификации',
  ADD COLUMN IF NOT EXISTS icon text DEFAULT NULL;