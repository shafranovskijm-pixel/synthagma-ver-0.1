
CREATE TABLE IF NOT EXISTS public.student_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID,
  student_full_name TEXT,
  student_login TEXT,
  student_email TEXT,
  organization_id UUID,
  deleted_by UUID,
  deleted_by_name TEXT,
  deleted_by_email TEXT,
  deletion_type TEXT NOT NULL DEFAULT 'soft',
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sdl_org ON public.student_deletion_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_sdl_student ON public.student_deletion_log(student_id);
CREATE INDEX IF NOT EXISTS idx_sdl_created ON public.student_deletion_log(created_at DESC);

ALTER TABLE public.student_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all deletion logs"
ON public.student_deletion_log FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org staff can view their org deletion logs"
ON public.student_deletion_log FOR SELECT
USING (
  organization_id IS NOT NULL
  AND public.has_org_staff_permission(auth.uid(), organization_id, 'students.manage')
);

CREATE POLICY "Authenticated can insert deletion logs"
ON public.student_deletion_log FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND deleted_by = auth.uid());
