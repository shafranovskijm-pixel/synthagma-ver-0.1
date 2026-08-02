ALTER TABLE public.student_groups
  ADD COLUMN IF NOT EXISTS group_number text,
  ADD COLUMN IF NOT EXISTS program_title text,
  ADD COLUMN IF NOT EXISTS program_hours integer,
  ADD COLUMN IF NOT EXISTS program_form text,
  ADD COLUMN IF NOT EXISTS default_price numeric,
  ADD COLUMN IF NOT EXISTS course_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'student_groups_course_id_fkey'
      AND conrelid = 'public.student_groups'::regclass
  ) THEN
    ALTER TABLE public.student_groups
      ADD CONSTRAINT student_groups_course_id_fkey
      FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_groups_course_id ON public.student_groups(course_id);