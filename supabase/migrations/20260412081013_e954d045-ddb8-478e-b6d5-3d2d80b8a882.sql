
-- ============================================
-- 1. org_staff table
-- ============================================
CREATE TABLE public.org_staff (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'teacher',
  display_name text NOT NULL DEFAULT '',
  bio text,
  visibility text NOT NULL DEFAULT 'all',
  sections_access jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE public.org_staff ENABLE ROW LEVEL SECURITY;

-- Staff can view their own org's staff
CREATE POLICY "org_staff_select" ON public.org_staff
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    OR public.has_role('admin'::app_role, auth.uid())
  );

-- Only org managers and admins can manage staff
CREATE POLICY "org_staff_insert" ON public.org_staff
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role('organization'::app_role, auth.uid()) AND organization_id = public.current_organization_id())
    OR public.has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "org_staff_update" ON public.org_staff
  FOR UPDATE TO authenticated
  USING (
    (public.has_role('organization'::app_role, auth.uid()) AND organization_id = public.current_organization_id())
    OR public.has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "org_staff_delete" ON public.org_staff
  FOR DELETE TO authenticated
  USING (
    (public.has_role('organization'::app_role, auth.uid()) AND organization_id = public.current_organization_id())
    OR public.has_role('admin'::app_role, auth.uid())
  );

CREATE TRIGGER update_org_staff_updated_at
  BEFORE UPDATE ON public.org_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 2. homework_submissions table
-- ============================================
CREATE TABLE public.homework_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  content text,
  attachments jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  score integer,
  reviewer_id uuid,
  reviewer_comment text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;

-- Students can view their own submissions
CREATE POLICY "hw_select_student" ON public.homework_submissions
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR organization_id = public.current_organization_id()
    OR public.has_role('admin'::app_role, auth.uid())
  );

-- Students can create their own submissions
CREATE POLICY "hw_insert_student" ON public.homework_submissions
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Org managers and admins can update (review)
CREATE POLICY "hw_update_reviewer" ON public.homework_submissions
  FOR UPDATE TO authenticated
  USING (
    (public.has_role('organization'::app_role, auth.uid()) AND organization_id = public.current_organization_id())
    OR public.has_role('admin'::app_role, auth.uid())
  );

-- Enable realtime for homework_submissions
ALTER PUBLICATION supabase_realtime ADD TABLE public.homework_submissions;

-- Index for fast lookups
CREATE INDEX idx_homework_submissions_org_status ON public.homework_submissions(organization_id, status);
CREATE INDEX idx_homework_submissions_student ON public.homework_submissions(student_id);
CREATE INDEX idx_homework_submissions_lesson ON public.homework_submissions(lesson_id);
