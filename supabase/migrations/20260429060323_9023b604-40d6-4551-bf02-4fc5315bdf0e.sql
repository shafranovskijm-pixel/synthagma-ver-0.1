
-- 1. Add backward-compatible has_role(uuid, app_role) overload
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- 2. Fix get_decrypted_org_credentials_batch — use existing (role, user) signature explicitly
CREATE OR REPLACE FUNCTION public.get_decrypted_org_credentials_batch(p_organization_ids uuid[])
RETURNS TABLE(organization_id uuid, login_email text, login_password text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    oc.organization_id,
    oc.login_email,
    oc.login_password
  FROM public.organization_credentials oc
  WHERE oc.organization_id = ANY(p_organization_ids);
END;
$function$;

-- 3. Performance indexes for student dashboard
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON public.enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_lesson_completed ON public.lesson_progress(user_id, lesson_id) WHERE completed = true;
CREATE INDEX IF NOT EXISTS idx_student_identity_documents_user_org ON public.student_identity_documents(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_video_identifications_user_org_status ON public.video_identifications(user_id, organization_id, status);
