-- Preserve the existing students RPC contract and every limited-teacher check.
-- Organization-wide authorization is evaluated once per invocation. Source pins
-- make this fail closed if the deployed authorization semantics have changed.
-- No table, index, policy, grant, owner, student row, or document is modified.
DO $migration$
DECLARE
  fn regprocedure := 'public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)'::regprocedure;
  before_metadata jsonb;
  after_metadata jsonb;
BEGIN
  IF md5(pg_get_functiondef('public.account_deletion_access_allowed()'::regprocedure)) IS DISTINCT FROM '64b0a90b7db9813950ccca6dff208f3a' THEN
    RAISE EXCEPTION 'students_page_performance_source_changed: public.account_deletion_access_allowed()';
  END IF;
  IF md5(pg_get_functiondef('public.can_access_organization(uuid,text)'::regprocedure)) IS DISTINCT FROM '2e11495f3d3e6ca261af8a08ed874269' THEN
    RAISE EXCEPTION 'students_page_performance_source_changed: public.can_access_organization(uuid,text)';
  END IF;
  IF md5(pg_get_functiondef('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)'::regprocedure)) IS DISTINCT FROM '1aa56a1ad879bac34222cc62d5e0177e' THEN
    RAISE EXCEPTION 'students_page_performance_source_changed: public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)';
  END IF;
  IF md5(pg_get_functiondef('public.has_org_staff_permission(uuid,uuid,text)'::regprocedure)) IS DISTINCT FROM '3d1fedafe94778fa19dd47acb71a3782' THEN
    RAISE EXCEPTION 'students_page_performance_source_changed: public.has_org_staff_permission(uuid,uuid,text)';
  END IF;
  IF md5(pg_get_functiondef('public.has_role(uuid,public.app_role)'::regprocedure)) IS DISTINCT FROM '82a7fa1cd06301bb83b010bc315aee0b' THEN
    RAISE EXCEPTION 'students_page_performance_source_changed: public.has_role(uuid,public.app_role)';
  END IF;
  IF md5(pg_get_functiondef('public.has_role(public.app_role,uuid)'::regprocedure)) IS DISTINCT FROM '20c46f708cc2e7fa51b640290151a59e' THEN
    RAISE EXCEPTION 'students_page_performance_source_changed: public.has_role(public.app_role,uuid)';
  END IF;
  IF md5(pg_get_functiondef('public.is_org_owner(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '362aca6afc26c775be594843258b2ab2' THEN
    RAISE EXCEPTION 'students_page_performance_source_changed: public.is_org_owner(uuid,uuid)';
  END IF;
  IF md5(pg_get_functiondef('public.uc_document_scope_allowed(uuid,uuid,uuid)'::regprocedure)) IS DISTINCT FROM '2a7407e7d178c7561b1d390f0884c6b6' THEN
    RAISE EXCEPTION 'students_page_performance_source_changed: public.uc_document_scope_allowed(uuid,uuid,uuid)';
  END IF;
  IF md5(pg_get_functiondef('public.uc_document_student_scope_allowed(uuid,uuid)'::regprocedure)) IS DISTINCT FROM '9f92bb0ec735fb21e62ca5b342c5672c' THEN
    RAISE EXCEPTION 'students_page_performance_source_changed: public.uc_document_student_scope_allowed(uuid,uuid)';
  END IF;
  IF md5(pg_get_functiondef('public.uc_document_teacher_limited(uuid)'::regprocedure)) IS DISTINCT FROM '72cdbafda69c66500e0d9ae87e8ae403' THEN
    RAISE EXCEPTION 'students_page_performance_source_changed: public.uc_document_teacher_limited(uuid)';
  END IF;
SELECT jsonb_build_object('oid', p.oid::text, 'owner', p.proowner::text, 'acl', to_jsonb(p.proacl),
    'language', p.prolang::text, 'security_definer', p.prosecdef, 'volatility', p.provolatile,
    'parallel', p.proparallel, 'strict', p.proisstrict, 'leakproof', p.proleakproof,
    'cost', p.procost, 'rows', p.prorows, 'configuration', to_jsonb(p.proconfig),
    'arguments', pg_get_function_arguments(p.oid), 'result', pg_get_function_result(p.oid))
  INTO before_metadata FROM pg_proc p WHERE p.oid=fn;

  EXECUTE $replacement$
CREATE OR REPLACE FUNCTION public.get_organization_students_page(p_organization_id uuid, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text, p_course_id uuid DEFAULT NULL::uuid, p_group_filter text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_docs_filter text DEFAULT NULL::text, p_archive_mode text DEFAULT 'active'::text)
 RETURNS TABLE(id uuid, user_id uuid, full_name text, email text, login text, company_id uuid, student_group_id uuid, last_visit_at timestamp with time zone, archived_at timestamp with time zone, progress integer, status text, last_activity timestamp with time zone, enrollments jsonb, has_passport boolean, has_snils boolean, has_education boolean, frdo_complete boolean, frdo_has_data boolean, total_count bigint, active_count bigint, archived_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := GREATEST(1, LEAST(100, COALESCE(p_limit, 10)));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_search_like text;
  v_archive text := COALESCE(p_archive_mode, 'active');
  v_unrestricted_scope boolean;
  v_teacher_limited boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_access_organization(p_organization_id, 'students.read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Both helpers are STABLE and depend on this actor/organization only.
  -- NULL/limited scopes keep every original per-row authorization check.
  v_unrestricted_scope := public.uc_document_scope_allowed(p_organization_id, NULL, NULL) IS TRUE;
  v_teacher_limited := public.uc_document_teacher_limited(p_organization_id);

  IF v_search IS NOT NULL THEN
    v_search_like := '%' || v_search || '%';
  END IF;

  RETURN QUERY
  WITH excluded AS (
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin','organization')
    UNION
    SELECT os.user_id FROM public.org_staff os
    WHERE os.organization_id = p_organization_id
      AND (os.expires_at IS NULL OR os.expires_at > now())
  ),
  base AS (
    SELECT p.id, p.user_id, p.full_name, p.email, p.login, p.company_id,
           CASE WHEN v_teacher_limited AND NOT public.uc_document_scope_allowed(p.organization_id,p.student_group_id,NULL) THEN NULL ELSE p.student_group_id END AS student_group_id, p.last_visit_at, p.archived_at
    FROM public.profiles p
    WHERE p.organization_id = p_organization_id AND (CASE WHEN v_unrestricted_scope THEN true ELSE public.uc_document_student_scope_allowed(p_organization_id,p.user_id) END) AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = p_organization_id AND srr.user_id = p.user_id)
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
        OR (p_group_filter = 'no_group' AND NOT EXISTS (SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id = p.organization_id AND m.user_id = p.user_id))
        OR EXISTS (SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id = p.organization_id AND m.user_id = p.user_id AND m.group_id::text = p_group_filter)
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
    WHERE c.organization_id = p_organization_id AND (CASE WHEN v_unrestricted_scope THEN true ELSE public.uc_document_scope_allowed(p_organization_id,NULL,e.id) END)
      AND e.user_id IN (SELECT b.user_id FROM base b)
    GROUP BY e.user_id
  ),
  docs AS (
    SELECT d.user_id,
           BOOL_OR(d.type IN ('passport','birth_certificate'))                     AS has_passport,
           BOOL_OR(d.type = 'snils')                                               AS has_snils,
           BOOL_OR(d.type IN ('education_document','diploma','attestat'))          AS has_education
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
           COALESCE(be.has_active, false)                                           AS r_has_active,
           COALESCE(be.has_completed, false)                                        AS r_has_completed,
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
      OR (p_status = 'active'       AND j.r_has_active)
      OR (p_status = 'completed'    AND j.r_has_completed)
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
    WHERE p.organization_id = p_organization_id AND (CASE WHEN v_unrestricted_scope THEN true ELSE public.uc_document_student_scope_allowed(p_organization_id,p.user_id) END) AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = p_organization_id AND srr.user_id = p.user_id)
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
$function$

$replacement$;

SELECT jsonb_build_object('oid', p.oid::text, 'owner', p.proowner::text, 'acl', to_jsonb(p.proacl),
    'language', p.prolang::text, 'security_definer', p.prosecdef, 'volatility', p.provolatile,
    'parallel', p.proparallel, 'strict', p.proisstrict, 'leakproof', p.proleakproof,
    'cost', p.procost, 'rows', p.prorows, 'configuration', to_jsonb(p.proconfig),
    'arguments', pg_get_function_arguments(p.oid), 'result', pg_get_function_result(p.oid))
  INTO after_metadata FROM pg_proc p WHERE p.oid=fn;
  IF after_metadata IS DISTINCT FROM before_metadata THEN
    RAISE EXCEPTION 'students_page_performance_metadata_changed';
  END IF;
END;
$migration$;
