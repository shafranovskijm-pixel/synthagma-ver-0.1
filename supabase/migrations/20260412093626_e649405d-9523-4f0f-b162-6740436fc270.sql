ALTER TABLE public.student_groups
  ADD COLUMN IF NOT EXISTS max_seats integer,
  ADD COLUMN IF NOT EXISTS curator_id uuid,
  ADD COLUMN IF NOT EXISTS strict_order boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS limit_access_time boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_resubmit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_locked_lessons boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_channel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_group_chat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_student_dialogs boolean NOT NULL DEFAULT false;