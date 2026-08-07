-- Restrict the course-files Storage API to the tenant/course encoded in the
-- object path. The bucket remains public for already persisted public media
-- URLs; these policies protect listing and authenticated mutations.

CREATE OR REPLACE FUNCTION public.can_manage_course_files_org(
  _organization_id uuid,
  _permission text DEFAULT 'courses.write'
)
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
      public.has_role('admin'::public.app_role, auth.uid())
      OR (
        public.has_role('organization'::public.app_role, auth.uid())
        AND public.current_organization_id() = _organization_id
      )
      OR public.has_org_staff_permission(auth.uid(), _organization_id, _permission)
    )
$$;

REVOKE ALL ON FUNCTION public.can_manage_course_files_org(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_course_files_org(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_read_course_file_object(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH path_ids AS (
    SELECT
      public.storage_try_uuid((storage.foldername(_object_name))[1]) AS first_id,
      public.storage_try_uuid((storage.foldername(_object_name))[2]) AS second_id,
      public.storage_try_uuid(left(regexp_replace(_object_name, '^.*/', ''), 36)) AS basename_id
  )
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role('admin'::public.app_role, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM path_ids p
      JOIN public.organizations o ON o.id = p.first_id
      WHERE public.can_manage_course_files_org(o.id, 'courses.read')
         OR EXISTS (
           SELECT 1 FROM public.profiles pr
           WHERE pr.user_id = auth.uid()
             AND pr.organization_id = o.id
         )
    )
    OR EXISTS (
      SELECT 1
      FROM path_ids p
      JOIN public.courses c ON c.id IN (p.first_id, p.second_id)
      WHERE public.can_manage_course_files_org(c.organization_id, 'courses.read')
         OR EXISTS (
           SELECT 1 FROM public.enrollments e
           WHERE e.user_id = auth.uid()
             AND e.course_id = c.id
             AND e.status IN ('active', 'completed')
             AND (e.expires_at IS NULL OR e.expires_at > now())
         )
    )
    OR EXISTS (
      SELECT 1
      FROM path_ids p
      JOIN public.webinars w ON w.id IN (p.second_id, p.basename_id)
      WHERE (storage.foldername(_object_name))[1] = 'webinar-recordings'
        AND public.can_read_webinar_recording_object(
          w.organization_id::text || '/' || w.id::text || '-legacy'
        )
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_course_file_object(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH path_ids AS (
    SELECT
      public.storage_try_uuid((storage.foldername(_object_name))[1]) AS first_id,
      public.storage_try_uuid((storage.foldername(_object_name))[2]) AS second_id,
      public.storage_try_uuid(left(regexp_replace(_object_name, '^.*/', ''), 36)) AS basename_id
  )
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role('admin'::public.app_role, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM path_ids p
      JOIN public.organizations o ON o.id = p.first_id
      WHERE public.can_manage_course_files_org(o.id, 'courses.write')
    )
    OR EXISTS (
      SELECT 1
      FROM path_ids p
      JOIN public.courses c ON c.id IN (p.first_id, p.second_id)
      WHERE public.can_manage_course_files_org(c.organization_id, 'courses.write')
    )
    OR EXISTS (
      SELECT 1
      FROM path_ids p
      JOIN public.webinars w ON w.id IN (p.second_id, p.basename_id)
      WHERE (storage.foldername(_object_name))[1] = 'webinar-recordings'
        AND public.can_manage_webinar_recording_org(w.organization_id, 'webinars.write')
    )
  )
$$;

REVOKE ALL ON FUNCTION public.can_read_course_file_object(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_course_file_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_course_file_object(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_course_file_object(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Public read access for course files" ON storage.objects;
DROP POLICY IF EXISTS "Course files list by org members" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload course files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own course files" ON storage.objects;
DROP POLICY IF EXISTS "Org users can upload course files" ON storage.objects;
DROP POLICY IF EXISTS "Org users can delete course files" ON storage.objects;
DROP POLICY IF EXISTS course_files_tenant_select ON storage.objects;
DROP POLICY IF EXISTS course_files_tenant_insert ON storage.objects;
DROP POLICY IF EXISTS course_files_tenant_update ON storage.objects;
DROP POLICY IF EXISTS course_files_tenant_delete ON storage.objects;

CREATE POLICY course_files_tenant_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'course-files'
  AND public.can_read_course_file_object(name)
);

CREATE POLICY course_files_tenant_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'course-files'
  AND public.can_manage_course_file_object(name)
);

CREATE POLICY course_files_tenant_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'course-files'
  AND public.can_manage_course_file_object(name)
)
WITH CHECK (
  bucket_id = 'course-files'
  AND public.can_manage_course_file_object(name)
);

CREATE POLICY course_files_tenant_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'course-files'
  AND public.can_manage_course_file_object(name)
);
