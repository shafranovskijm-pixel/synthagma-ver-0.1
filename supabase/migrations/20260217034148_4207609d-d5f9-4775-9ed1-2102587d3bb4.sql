
CREATE TABLE public.course_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  accessed_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text
);

ALTER TABLE public.course_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org managers can view course access logs"
  ON public.course_access_log FOR SELECT TO authenticated
  USING (organization_id = current_organization_id() OR has_role('admin', auth.uid()));

CREATE POLICY "Authenticated users can insert own access logs"
  ON public.course_access_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_course_access_log_user ON public.course_access_log(user_id);
CREATE INDEX idx_course_access_log_org ON public.course_access_log(organization_id);
