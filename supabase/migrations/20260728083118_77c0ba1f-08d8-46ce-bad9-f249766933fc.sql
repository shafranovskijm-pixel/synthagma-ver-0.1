CREATE OR REPLACE FUNCTION public.get_course_students_stats(p_course_id uuid)
RETURNS TABLE(
  total_count bigint,
  active_count bigint,
  completed_count bigint,
  average_progress numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_course(p_course_id, 'students.read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT c.organization_id INTO v_org FROM public.courses c WHERE c.id = p_course_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'course not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH excluded AS (
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','organization')
    UNION
    SELECT os.user_id FROM public.org_staff os
    WHERE os.organization_id = v_org
      AND (os.expires_at IS NULL OR os.expires_at > now())
  )
  SELECT
    COUNT(*)::bigint                                                       AS total_count,
    COUNT(*) FILTER (WHERE e.status = 'active')::bigint                    AS active_count,
    COUNT(*) FILTER (WHERE e.status = 'completed')::bigint                 AS completed_count,
    COALESCE(ROUND(AVG(COALESCE(e.progress, 0))::numeric, 1), 0)           AS average_progress
  FROM public.enrollments e
  WHERE e.course_id = p_course_id
    AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = e.user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_course_students_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_students_stats(uuid) TO authenticated, service_role;