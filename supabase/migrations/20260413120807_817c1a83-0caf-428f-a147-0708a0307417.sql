
-- Add require_enrollment_approval to courses
ALTER TABLE public.courses 
  ADD COLUMN IF NOT EXISTS require_enrollment_approval boolean NOT NULL DEFAULT false;

-- Create enrollment_requests table
CREATE TABLE public.enrollment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  UNIQUE(course_id, user_id)
);

ALTER TABLE public.enrollment_requests ENABLE ROW LEVEL SECURITY;

-- Students can view their own requests
CREATE POLICY "Students can view own enrollment requests"
  ON public.enrollment_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Students can create their own requests
CREATE POLICY "Students can create enrollment requests"
  ON public.enrollment_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Organization users can view requests for their courses
CREATE POLICY "Org users can view enrollment requests for their courses"
  ON public.enrollment_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = enrollment_requests.course_id
        AND c.organization_id = public.current_organization_id()
    )
    OR has_role('admin'::app_role, auth.uid())
  );

-- Organization users can update requests for their courses
CREATE POLICY "Org users can update enrollment requests for their courses"
  ON public.enrollment_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = enrollment_requests.course_id
        AND c.organization_id = public.current_organization_id()
    )
    OR has_role('admin'::app_role, auth.uid())
  );

-- Index for fast lookups
CREATE INDEX idx_enrollment_requests_course_id ON public.enrollment_requests(course_id);
CREATE INDEX idx_enrollment_requests_user_id ON public.enrollment_requests(user_id);
CREATE INDEX idx_enrollment_requests_status ON public.enrollment_requests(status);
