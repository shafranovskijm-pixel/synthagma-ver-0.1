ALTER TABLE public.registration_links 
  ADD COLUMN student_group_id uuid REFERENCES public.student_groups(id) ON DELETE SET NULL;