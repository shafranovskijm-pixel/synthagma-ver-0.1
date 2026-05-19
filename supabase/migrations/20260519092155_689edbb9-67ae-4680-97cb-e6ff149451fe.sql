
CREATE TABLE IF NOT EXISTS public.student_login_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  created_by UUID,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_login_tokens_user ON public.student_login_tokens(user_id, organization_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_student_login_tokens_token ON public.student_login_tokens(token) WHERE revoked_at IS NULL;

ALTER TABLE public.student_login_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org staff can view student login tokens"
ON public.student_login_tokens FOR SELECT
TO authenticated
USING (
  has_role('admin'::app_role, auth.uid())
  OR public.has_org_staff_permission(auth.uid(), organization_id, 'students.manage')
);

CREATE POLICY "Org staff can create student login tokens"
ON public.student_login_tokens FOR INSERT
TO authenticated
WITH CHECK (
  has_role('admin'::app_role, auth.uid())
  OR public.has_org_staff_permission(auth.uid(), organization_id, 'students.manage')
);

CREATE POLICY "Org staff can revoke student login tokens"
ON public.student_login_tokens FOR UPDATE
TO authenticated
USING (
  has_role('admin'::app_role, auth.uid())
  OR public.has_org_staff_permission(auth.uid(), organization_id, 'students.manage')
)
WITH CHECK (
  has_role('admin'::app_role, auth.uid())
  OR public.has_org_staff_permission(auth.uid(), organization_id, 'students.manage')
);
