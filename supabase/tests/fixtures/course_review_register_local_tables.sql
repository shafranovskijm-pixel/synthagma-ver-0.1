-- LOCAL TEST FIXTURE ONLY: complete the narrow prior fixture using the current
-- production column definitions from the original table-creation migrations.
ALTER TABLE public.enrollments
  ADD COLUMN progress integer NOT NULL DEFAULT 0,
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN completed_at timestamptz;
ALTER TABLE public.test_attempts
  ADD COLUMN score integer NOT NULL DEFAULT 0,
  ADD COLUMN max_score integer NOT NULL DEFAULT 0,
  ADD COLUMN completed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN answers jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.homework_submissions RENAME COLUMN user_id TO student_id;
ALTER TABLE public.homework_submissions
  ADD COLUMN course_id uuid REFERENCES public.courses(id),
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id),
  ADD COLUMN status text NOT NULL DEFAULT 'pending',
  ADD COLUMN score integer,
  ADD COLUMN submitted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN content text,
  ADD COLUMN reviewer_comment text;
