-- Phase 4B.1.a.1 — corrective migration for organization dashboard RPCs.
-- Additive: CREATE OR REPLACE only. Prior migration is not edited.

CREATE OR REPLACE FUNCTION public.get_organization_dashboard_summary(
  p_organization_id uuid
)
RETURNS TABLE (
  active_students_count bigint,
  total_courses_count bigint,
  completed_students_count bigint,
  average_progress numeric,
  documents_total bigint,
  with_passport bigint,
  with_snils bigint,
  with_education bigint,
  documents_complete bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_organization(p_organization_id, 'students.read') THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH students AS (
    SELECT p.user_id AS user_id
    FROM public.profiles p
    WHERE p.organization_id = p_organization_id
      AND p.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
          AND ur.role IN ('admin'::app_role, 'organization'::app_role)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.org_staff os
        WHERE os.user_id = p.user_id
          AND os.organization_id = p_organization_id
          AND (os.expires_at IS NULL OR os.expires_at > now())
      )
  ),
  enr AS (
    SELECT e.user_id, e.progress, e.status
    FROM public.enrollments e
    JOIN students s ON s.user_id = e.user_id
  ),
  docs AS (
    SELECT
      s.user_id,
      bool_or(d.type IN ('passport','birth_certificate')) AS has_passport,
      bool_or(d.type = 'snils') AS has_snils,
      bool_or(d.type IN ('education_document','diploma','attestat')) AS has_education
    FROM students s
    LEFT JOIN public.student_identity_documents d
      ON d.user_id = s.user_id
     AND d.organization_id = p_organization_id
    GROUP BY s.user_id
  ),
  courses_agg AS (
    SELECT count(*)::bigint AS total_courses
    FROM public.courses c
    WHERE c.organization_id = p_organization_id
  )
  SELECT
    (SELECT count(*)::bigint FROM students),
    (SELECT total_courses FROM courses_agg),
    (SELECT count(DISTINCT user_id)::bigint FROM enr WHERE status = 'completed'),
    COALESCE((SELECT round(avg(progress)::numeric, 2) FROM enr), 0)::numeric,
    (SELECT count(*)::bigint FROM students),
    (SELECT count(*)::bigint FROM docs WHERE has_passport),
    (SELECT count(*)::bigint FROM docs WHERE has_snils),
    (SELECT count(*)::bigint FROM docs WHERE has_education),
    (SELECT count(*)::bigint FROM docs WHERE has_passport AND has_snils AND has_education);
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_dashboard_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_dashboard_summary(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_organization_course_overview(
  p_organization_id uuid
)
RETURNS TABLE (
  course_id uuid,
  students_count bigint,
  lessons_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.can_access_organization(p_organization_id, 'courses.read')
    AND public.can_access_organization(p_organization_id, 'students.read')
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH org_courses AS (
    SELECT c.id
    FROM public.courses c
    WHERE c.organization_id = p_organization_id
  ),
  students AS (
    SELECT p.user_id AS user_id
    FROM public.profiles p
    WHERE p.organization_id = p_organization_id
      AND p.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
          AND ur.role IN ('admin'::app_role, 'organization'::app_role)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.org_staff os
        WHERE os.user_id = p.user_id
          AND os.organization_id = p_organization_id
          AND (os.expires_at IS NULL OR os.expires_at > now())
      )
  ),
  student_agg AS (
    SELECT e.course_id, count(DISTINCT e.user_id)::bigint AS students_count
    FROM public.enrollments e
    JOIN students s ON s.user_id = e.user_id
    JOIN org_courses oc ON oc.id = e.course_id
    GROUP BY e.course_id
  ),
  lesson_agg AS (
    SELECT oc.id AS course_id, count(l.id)::bigint AS lessons_count
    FROM org_courses oc
    LEFT JOIN public.lessons l ON l.course_id = oc.id
    GROUP BY oc.id
  )
  SELECT
    oc.id,
    COALESCE(sa.students_count, 0)::bigint,
    COALESCE(la.lessons_count, 0)::bigint
  FROM org_courses oc
  LEFT JOIN student_agg sa ON sa.course_id = oc.id
  LEFT JOIN lesson_agg la ON la.course_id = oc.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_course_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_course_overview(uuid) TO authenticated, service_role;