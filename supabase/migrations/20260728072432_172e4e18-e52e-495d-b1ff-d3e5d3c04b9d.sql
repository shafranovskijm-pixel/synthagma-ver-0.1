-- 1) Permission alias normalization: legacy .view/.manage → canonical .read/.write.
CREATE OR REPLACE FUNCTION public.normalize_org_staff_permission(_permission text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _permission IS NULL THEN NULL
    WHEN _permission LIKE '%.view'   THEN regexp_replace(_permission, '\.view$',   '.read')
    WHEN _permission LIKE '%.manage' THEN regexp_replace(_permission, '\.manage$', '.write')
    ELSE _permission
  END
$$;

GRANT EXECUTE ON FUNCTION public.normalize_org_staff_permission(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_org_staff_permission(_user_id uuid, _organization_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH perms AS (
    SELECT unnest(public.get_org_staff_permissions(_user_id, _organization_id)) AS permission
  )
  SELECT EXISTS (
    SELECT 1
    FROM perms
    WHERE permission = _permission
       OR permission = public.normalize_org_staff_permission(_permission)
       OR public.normalize_org_staff_permission(permission) = public.normalize_org_staff_permission(_permission)
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_org_staff_permission(uuid, uuid, text) TO authenticated, service_role;

-- 2) current_organization_id: profile first, then owner-priority non-expired org_staff.
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT organization_id INTO v_org
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_org IS NOT NULL THEN
    RETURN v_org;
  END IF;

  SELECT organization_id INTO v_org
  FROM public.org_staff
  WHERE user_id = auth.uid()
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY
    CASE role
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'school_editor' THEN 3
      WHEN 'course_editor' THEN 4
      WHEN 'teacher' THEN 5
      WHEN 'sales_manager' THEN 6
      ELSE 10
    END,
    created_at ASC
  LIMIT 1;

  RETURN v_org;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated, service_role;

-- 3) Staff-aware access helpers used by RLS policies.
CREATE OR REPLACE FUNCTION public.can_access_organization(_organization_id uuid, _permission text DEFAULT 'settings.read')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _organization_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND p.organization_id = _organization_id
      )
      OR (
        _permission IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.org_staff os
          WHERE os.user_id = auth.uid()
            AND os.organization_id = _organization_id
            AND (os.expires_at IS NULL OR os.expires_at > now())
        )
        AND public.has_org_staff_permission(auth.uid(), _organization_id, _permission)
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_access_course(_course_id uuid, _permission text DEFAULT 'courses.read')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = _course_id
      AND public.can_access_organization(c.organization_id, _permission)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid, _permission text DEFAULT 'courses.read')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lessons l
    JOIN public.courses c ON c.id = l.course_id
    WHERE l.id = _lesson_id
      AND public.can_access_organization(c.organization_id, _permission)
  )
$$;

GRANT EXECUTE ON FUNCTION public.can_access_organization(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_course(uuid, text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_lesson(uuid, text)       TO authenticated, service_role;

-- 4) Staff-aware policies (additive; existing owner/admin policies remain unchanged).
DROP POLICY IF EXISTS "Org staff can view organization" ON public.organizations;
CREATE POLICY "Org staff can view organization"
ON public.organizations FOR SELECT TO authenticated
USING (public.can_access_organization(id, 'settings.read'));

DROP POLICY IF EXISTS "Org staff can update organization" ON public.organizations;
CREATE POLICY "Org staff can update organization"
ON public.organizations FOR UPDATE TO authenticated
USING (public.can_access_organization(id, 'settings.write'))
WITH CHECK (public.can_access_organization(id, 'settings.write'));

DROP POLICY IF EXISTS "Org staff can view profiles" ON public.profiles;
CREATE POLICY "Org staff can view profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.can_access_organization(organization_id, 'students.read'));

DROP POLICY IF EXISTS "Org staff can update profiles" ON public.profiles;
CREATE POLICY "Org staff can update profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (public.can_access_organization(organization_id, 'students.write'))
WITH CHECK (public.can_access_organization(organization_id, 'students.write'));

DROP POLICY IF EXISTS "Org staff can view courses" ON public.courses;
CREATE POLICY "Org staff can view courses"
ON public.courses FOR SELECT TO authenticated
USING (public.can_access_organization(organization_id, 'courses.read'));

DROP POLICY IF EXISTS "Org staff can insert courses" ON public.courses;
CREATE POLICY "Org staff can insert courses"
ON public.courses FOR INSERT TO authenticated
WITH CHECK (public.can_access_organization(organization_id, 'courses.write'));

DROP POLICY IF EXISTS "Org staff can update courses" ON public.courses;
CREATE POLICY "Org staff can update courses"
ON public.courses FOR UPDATE TO authenticated
USING (public.can_access_organization(organization_id, 'courses.write'))
WITH CHECK (public.can_access_organization(organization_id, 'courses.write'));

DROP POLICY IF EXISTS "Org staff can delete courses" ON public.courses;
CREATE POLICY "Org staff can delete courses"
ON public.courses FOR DELETE TO authenticated
USING (public.can_access_organization(organization_id, 'courses.write'));

DROP POLICY IF EXISTS "Org staff can view lessons" ON public.lessons;
CREATE POLICY "Org staff can view lessons"
ON public.lessons FOR SELECT TO authenticated
USING (public.can_access_course(course_id, 'courses.read'));

DROP POLICY IF EXISTS "Org staff can manage lessons" ON public.lessons;
CREATE POLICY "Org staff can manage lessons"
ON public.lessons FOR ALL TO authenticated
USING (public.can_access_course(course_id, 'courses.write'))
WITH CHECK (public.can_access_course(course_id, 'courses.write'));

DROP POLICY IF EXISTS "Org staff can view enrollments" ON public.enrollments;
CREATE POLICY "Org staff can view enrollments"
ON public.enrollments FOR SELECT TO authenticated
USING (public.can_access_course(course_id, 'students.read'));

DROP POLICY IF EXISTS "Org staff can insert enrollments" ON public.enrollments;
CREATE POLICY "Org staff can insert enrollments"
ON public.enrollments FOR INSERT TO authenticated
WITH CHECK (public.can_access_course(course_id, 'students.write'));

DROP POLICY IF EXISTS "Org staff can update enrollments" ON public.enrollments;
CREATE POLICY "Org staff can update enrollments"
ON public.enrollments FOR UPDATE TO authenticated
USING (public.can_access_course(course_id, 'students.write'))
WITH CHECK (public.can_access_course(course_id, 'students.write'));

DROP POLICY IF EXISTS "Org staff can delete enrollments" ON public.enrollments;
CREATE POLICY "Org staff can delete enrollments"
ON public.enrollments FOR DELETE TO authenticated
USING (public.can_access_course(course_id, 'students.write'));

DROP POLICY IF EXISTS "Org staff can view lesson progress" ON public.lesson_progress;
CREATE POLICY "Org staff can view lesson progress"
ON public.lesson_progress FOR SELECT TO authenticated
USING (public.can_access_lesson(lesson_id, 'students.read'));

DROP POLICY IF EXISTS "Org staff can view test questions" ON public.test_questions;
CREATE POLICY "Org staff can view test questions"
ON public.test_questions FOR SELECT TO authenticated
USING (public.can_access_lesson(lesson_id, 'courses.read'));

DROP POLICY IF EXISTS "Org staff can manage test questions" ON public.test_questions;
CREATE POLICY "Org staff can manage test questions"
ON public.test_questions FOR ALL TO authenticated
USING (public.can_access_lesson(lesson_id, 'courses.write'))
WITH CHECK (public.can_access_lesson(lesson_id, 'courses.write'));

DROP POLICY IF EXISTS "Org staff can view test attempts" ON public.test_attempts;
CREATE POLICY "Org staff can view test attempts"
ON public.test_attempts FOR SELECT TO authenticated
USING (public.can_access_lesson(lesson_id, 'students.read'));

-- 5) set_student_blocked: authorize via EXISTS, no LIMIT 1 ambiguity.
CREATE OR REPLACE FUNCTION public.set_student_blocked(
  _target_user_id uuid,
  _blocked boolean,
  _reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _target_org uuid;
  _authorized boolean := false;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Не авторизован' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO _target_org
  FROM public.profiles
  WHERE user_id = _target_user_id;

  IF _target_org IS NULL THEN
    RAISE EXCEPTION 'Ученик не найден' USING ERRCODE = 'P0002';
  END IF;

  IF public.has_role(_caller, 'admin'::public.app_role) THEN
    _authorized := true;
  END IF;

  IF NOT _authorized
     AND EXISTS (
       SELECT 1
       FROM public.profiles p
       JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'organization'::public.app_role
       WHERE p.user_id = _caller
         AND p.organization_id = _target_org
     )
  THEN
    _authorized := true;
  END IF;

  IF NOT _authorized
     AND public.has_org_staff_permission(_caller, _target_org, 'students.write')
  THEN
    _authorized := true;
  END IF;

  IF NOT _authorized THEN
    RAISE EXCEPTION 'Недостаточно прав' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET blocked_at     = CASE WHEN _blocked THEN now() ELSE NULL END,
         blocked_reason = CASE WHEN _blocked THEN NULLIF(trim(COALESCE(_reason, '')), '') ELSE NULL END,
         blocked_by     = CASE WHEN _blocked THEN _caller ELSE NULL END,
         updated_at     = now()
   WHERE user_id = _target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_student_blocked(uuid, boolean, text) TO authenticated, service_role;

-- 6) Supporting indexes for hot paths (idempotent).
CREATE INDEX IF NOT EXISTS idx_org_staff_user_org_active
  ON public.org_staff (user_id, organization_id)
  WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_course_user
  ON public.enrollments (course_id, user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_org_user
  ON public.profiles (organization_id, user_id);