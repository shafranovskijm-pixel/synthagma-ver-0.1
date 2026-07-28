-- =========================================================
-- 1. INDEXES (only if missing)
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_profiles_org_archived
  ON public.profiles(organization_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_profiles_org_group
  ON public.profiles(organization_id, student_group_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_course
  ON public.enrollments(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_student_identity_docs_org_user_type
  ON public.student_identity_documents(organization_id, user_id, type);
CREATE INDEX IF NOT EXISTS idx_student_frdo_org_user
  ON public.student_frdo_data(organization_id, user_id);

-- =========================================================
-- 2. Organization students page
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_organization_students_page(
  p_organization_id uuid,
  p_limit int DEFAULT 10,
  p_offset int DEFAULT 0,
  p_search text DEFAULT NULL,
  p_course_id uuid DEFAULT NULL,
  p_group_filter text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_docs_filter text DEFAULT NULL,
  p_archive_mode text DEFAULT 'active'
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  full_name text,
  email text,
  login text,
  company_id uuid,
  student_group_id uuid,
  last_visit_at timestamptz,
  archived_at timestamptz,
  progress int,
  status text,
  last_activity timestamptz,
  enrollments jsonb,
  has_passport boolean,
  has_snils boolean,
  has_education boolean,
  frdo_complete boolean,
  frdo_has_data boolean,
  total_count bigint,
  active_count bigint,
  archived_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := GREATEST(1, LEAST(100, COALESCE(p_limit, 10)));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_search_like text;
  v_archive text := COALESCE(p_archive_mode, 'active');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_organization(p_organization_id, 'students.read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_search IS NOT NULL THEN
    v_search_like := '%' || v_search || '%';
  END IF;

  RETURN QUERY
  WITH excluded AS (
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin','organization')
    UNION
    SELECT os.user_id
    FROM public.org_staff os
    WHERE os.organization_id = p_organization_id
      AND (os.expires_at IS NULL OR os.expires_at > now())
  ),
  base AS (
    SELECT p.id, p.user_id, p.full_name, p.email, p.login, p.company_id,
           p.student_group_id, p.last_visit_at, p.archived_at
    FROM public.profiles p
    WHERE p.organization_id = p_organization_id
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = p.user_id)
      AND (
        (v_archive = 'active'  AND p.archived_at IS NULL) OR
        (v_archive = 'archive' AND p.archived_at IS NOT NULL)
      )
      AND (
        v_search IS NULL
        OR p.full_name ILIKE v_search_like
        OR p.email     ILIKE v_search_like
        OR p.login     ILIKE v_search_like
      )
      AND (
        p_group_filter IS NULL
        OR p_group_filter = 'all'
        OR (p_group_filter = 'no_group' AND p.student_group_id IS NULL)
        OR p.student_group_id::text = p_group_filter
      )
  ),
  base_enr AS (
    SELECT e.user_id,
           jsonb_agg(jsonb_build_object(
             'id',           e.id,
             'course_id',    e.course_id,
             'course_title', c.title,
             'progress',     COALESCE(e.progress, 0),
             'status',       e.status,
             'started_at',   e.started_at,
             'completed_at', e.completed_at,
             'time_spent',   e.time_spent
           ) ORDER BY e.started_at DESC NULLS LAST) AS enrollments,
           COUNT(*)::int                                   AS enroll_count,
           BOOL_OR(e.status = 'completed')                 AS has_completed,
           BOOL_OR(e.status = 'active')                    AS has_active,
           ROUND(AVG(COALESCE(e.progress, 0)))::int        AS avg_progress,
           MAX(e.started_at)                               AS last_started
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    WHERE c.organization_id = p_organization_id
      AND e.user_id IN (SELECT b.user_id FROM base b)
    GROUP BY e.user_id
  ),
  docs AS (
    SELECT d.user_id,
           BOOL_OR(d.type = 'passport')            AS has_passport,
           BOOL_OR(d.type = 'snils')               AS has_snils,
           BOOL_OR(d.type = 'education_document')  AS has_education
    FROM public.student_identity_documents d
    WHERE d.organization_id = p_organization_id
      AND d.user_id IN (SELECT b.user_id FROM base b)
    GROUP BY d.user_id
  ),
  frdo AS (
    SELECT f.user_id,
           (f.last_name  IS NOT NULL AND
            f.first_name IS NOT NULL AND
            f.birth_date IS NOT NULL AND
            f.gender     IS NOT NULL AND
            f.snils      IS NOT NULL) AS frdo_complete
    FROM public.student_frdo_data f
    WHERE f.organization_id = p_organization_id
      AND f.user_id IN (SELECT b.user_id FROM base b)
  ),
  joined AS (
    SELECT b.*,
           COALESCE(be.avg_progress, 0)                                             AS r_progress,
           CASE
             WHEN be.enroll_count IS NULL THEN NULL
             WHEN be.has_completed THEN 'completed'
             WHEN be.has_active    THEN 'active'
             ELSE NULL
           END                                                                      AS r_status,
           be.last_started                                                          AS r_last_activity,
           COALESCE(be.enrollments, '[]'::jsonb)                                    AS r_enrollments,
           COALESCE(be.enroll_count, 0)                                             AS r_enroll_count,
           COALESCE(d.has_passport,  false)                                         AS r_has_passport,
           COALESCE(d.has_snils,     false)                                         AS r_has_snils,
           COALESCE(d.has_education, false)                                         AS r_has_education,
           COALESCE(fr.frdo_complete, false)                                        AS r_frdo_complete,
           (fr.user_id IS NOT NULL)                                                 AS r_frdo_has_data
    FROM base b
    LEFT JOIN base_enr be ON be.user_id = b.user_id
    LEFT JOIN docs     d  ON d.user_id  = b.user_id
    LEFT JOIN frdo     fr ON fr.user_id = b.user_id
  ),
  filtered AS (
    SELECT * FROM joined j
    WHERE (
      p_course_id IS NULL
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(j.r_enrollments) x
        WHERE (x->>'course_id')::uuid = p_course_id
      )
    )
    AND (
      p_status IS NULL OR p_status = 'all'
      OR (p_status = 'active'       AND j.r_status = 'active')
      OR (p_status = 'completed'    AND j.r_status = 'completed')
      OR (p_status = 'not_enrolled' AND j.r_enroll_count = 0)
    )
    AND (
      p_docs_filter IS NULL OR p_docs_filter = 'all'
      OR (p_docs_filter = 'complete'     AND j.r_has_passport AND j.r_has_snils AND j.r_has_education)
      OR (p_docs_filter = 'incomplete'   AND NOT (j.r_has_passport AND j.r_has_snils AND j.r_has_education))
      OR (p_docs_filter = 'no_passport'  AND NOT j.r_has_passport)
      OR (p_docs_filter = 'no_snils'     AND NOT j.r_has_snils)
      OR (p_docs_filter = 'no_education' AND NOT j.r_has_education)
    )
  ),
  cnt AS (SELECT COUNT(*)::bigint AS total_count FROM filtered),
  org_cnt AS (
    SELECT
      COUNT(*) FILTER (WHERE p.archived_at IS NULL)     ::bigint AS active_count,
      COUNT(*) FILTER (WHERE p.archived_at IS NOT NULL) ::bigint AS archived_count
    FROM public.profiles p
    WHERE p.organization_id = p_organization_id
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = p.user_id)
  )
  SELECT
    f.id, f.user_id, f.full_name, f.email, f.login, f.company_id,
    f.student_group_id, f.last_visit_at, f.archived_at,
    f.r_progress, f.r_status, f.r_last_activity, f.r_enrollments,
    f.r_has_passport, f.r_has_snils, f.r_has_education,
    f.r_frdo_complete, f.r_frdo_has_data,
    cnt.total_count, org_cnt.active_count, org_cnt.archived_count
  FROM filtered f, cnt, org_cnt
  ORDER BY
    CASE WHEN v_archive = 'archive' THEN 0 ELSE 1 END,
    CASE WHEN v_archive = 'archive' THEN f.archived_at END DESC NULLS LAST,
    CASE WHEN v_archive <> 'archive' AND f.r_enroll_count > 0 THEN 0 ELSE 1 END,
    f.full_name NULLS LAST,
    f.user_id
  OFFSET v_offset
  LIMIT  v_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_organization_students_page(uuid,int,int,text,uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_students_page(uuid,int,int,text,uuid,text,text,text,text) TO authenticated, service_role;

-- =========================================================
-- 3. Course students page
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_course_students_page(
  p_course_id uuid,
  p_limit int DEFAULT 10,
  p_offset int DEFAULT 0,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  full_name text,
  email text,
  login text,
  enrollment_id uuid,
  progress int,
  status text,
  started_at timestamptz,
  completed_at timestamptz,
  time_spent int,
  archived_at timestamptz,
  total_count bigint,
  active_count bigint,
  completed_count bigint,
  average_progress numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := GREATEST(1, LEAST(100, COALESCE(p_limit, 10)));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_search_like text;
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

  IF v_search IS NOT NULL THEN
    v_search_like := '%' || v_search || '%';
  END IF;

  RETURN QUERY
  WITH excluded AS (
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','organization')
    UNION
    SELECT os.user_id FROM public.org_staff os
    WHERE os.organization_id = v_org
      AND (os.expires_at IS NULL OR os.expires_at > now())
  ),
  rows AS (
    SELECT p.id, p.user_id, p.full_name, p.email, p.login, p.archived_at,
           e.id AS enrollment_id, COALESCE(e.progress, 0) AS progress,
           e.status, e.started_at, e.completed_at, e.time_spent
    FROM public.enrollments e
    JOIN public.profiles p ON p.user_id = e.user_id
    WHERE e.course_id = p_course_id
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = e.user_id)
      AND (
        v_search IS NULL
        OR p.full_name ILIKE v_search_like
        OR p.email     ILIKE v_search_like
        OR p.login     ILIKE v_search_like
      )
      AND (
        p_status IS NULL OR p_status = 'all'
        OR (p_status = 'active'    AND e.status = 'active')
        OR (p_status = 'completed' AND e.status = 'completed')
      )
  ),
  cnt AS (SELECT COUNT(*)::bigint AS total_count FROM rows),
  course_cnt AS (
    SELECT
      COUNT(*)::bigint                                        AS total_count,
      COUNT(*) FILTER (WHERE e.status = 'active')::bigint     AS active_count,
      COUNT(*) FILTER (WHERE e.status = 'completed')::bigint  AS completed_count,
      COALESCE(ROUND(AVG(COALESCE(e.progress, 0))::numeric, 1), 0) AS avg_progress
    FROM public.enrollments e
    WHERE e.course_id = p_course_id
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = e.user_id)
  )
  SELECT
    r.id, r.user_id, r.full_name, r.email, r.login,
    r.enrollment_id, r.progress, r.status, r.started_at, r.completed_at, r.time_spent,
    r.archived_at,
    cnt.total_count,
    course_cnt.active_count, course_cnt.completed_count, course_cnt.avg_progress
  FROM rows r, cnt, course_cnt
  ORDER BY r.full_name NULLS LAST, r.user_id
  OFFSET v_offset
  LIMIT  v_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_course_students_page(uuid,int,int,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_course_students_page(uuid,int,int,text,text) TO authenticated, service_role;

-- =========================================================
-- 4. Available students for course page
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_available_students_for_course_page(
  p_course_id uuid,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  full_name text,
  email text,
  login text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := GREATEST(1, LEAST(100, COALESCE(p_limit, 20)));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_search_like text;
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

  IF v_search IS NOT NULL THEN
    v_search_like := '%' || v_search || '%';
  END IF;

  RETURN QUERY
  WITH excluded AS (
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','organization')
    UNION
    SELECT os.user_id FROM public.org_staff os
    WHERE os.organization_id = v_org
      AND (os.expires_at IS NULL OR os.expires_at > now())
  ),
  rows AS (
    SELECT p.id, p.user_id, p.full_name, p.email, p.login
    FROM public.profiles p
    WHERE p.organization_id = v_org
      AND p.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM excluded ex WHERE ex.user_id = p.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.course_id = p_course_id AND e.user_id = p.user_id
      )
      AND (
        v_search IS NULL
        OR p.full_name ILIKE v_search_like
        OR p.email     ILIKE v_search_like
        OR p.login     ILIKE v_search_like
      )
  ),
  cnt AS (SELECT COUNT(*)::bigint AS total_count FROM rows)
  SELECT r.id, r.user_id, r.full_name, r.email, r.login, cnt.total_count
  FROM rows r, cnt
  ORDER BY r.full_name NULLS LAST, r.user_id
  OFFSET v_offset
  LIMIT  v_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_available_students_for_course_page(uuid,int,int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_students_for_course_page(uuid,int,int,text) TO authenticated, service_role;