-- Close two legacy cross-tenant/public-read gaps that block safe publishing.

CREATE OR REPLACE FUNCTION public.can_manage_webinar_recording_org(
  _organization_id uuid,
  _permission text
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

REVOKE ALL ON FUNCTION public.can_manage_webinar_recording_org(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_webinar_recording_org(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_read_webinar_recording_object(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.webinars w
    WHERE w.id = public.storage_try_uuid(left(regexp_replace(_object_name, '^.*/', ''), 36))
      AND w.organization_id = public.storage_try_uuid(split_part(_object_name, '/', 1))
      AND (
        public.can_manage_webinar_recording_org(w.organization_id, 'webinars.read')
        OR (
          w.access_type = 'org_all'
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
              AND p.organization_id = w.organization_id
          )
        )
        OR (
          w.access_type = 'course'
          AND w.course_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.enrollments e
            WHERE e.user_id = auth.uid()
              AND e.course_id = w.course_id
              AND e.status IN ('active', 'completed')
              AND (e.expires_at IS NULL OR e.expires_at > now())
          )
        )
        OR (
          w.access_type = 'company'
          AND w.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
              AND p.company_id = w.company_id
          )
        )
        OR (
          w.access_type = 'enrolled'
          AND EXISTS (
            SELECT 1
            FROM public.enrollments e
            JOIN public.courses c ON c.id = e.course_id
            WHERE e.user_id = auth.uid()
              AND c.organization_id = w.organization_id
              AND e.status IN ('active', 'completed')
              AND (e.expires_at IS NULL OR e.expires_at > now())
          )
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_read_webinar_recording_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_webinar_recording_object(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Org users can manage webinar recordings" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read webinar recordings" ON storage.objects;
DROP POLICY IF EXISTS webinar_recordings_select ON storage.objects;
DROP POLICY IF EXISTS webinar_recordings_insert ON storage.objects;
DROP POLICY IF EXISTS webinar_recordings_update ON storage.objects;
DROP POLICY IF EXISTS webinar_recordings_delete ON storage.objects;

CREATE POLICY webinar_recordings_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'webinar-recordings'
  AND public.can_read_webinar_recording_object(name)
);

CREATE POLICY webinar_recordings_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'webinar-recordings'
  AND public.can_manage_webinar_recording_org(
    public.storage_try_uuid((storage.foldername(name))[1]),
    'webinars.write'
  )
);

CREATE POLICY webinar_recordings_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'webinar-recordings'
  AND public.can_manage_webinar_recording_org(
    public.storage_try_uuid((storage.foldername(name))[1]),
    'webinars.write'
  )
)
WITH CHECK (
  bucket_id = 'webinar-recordings'
  AND public.can_manage_webinar_recording_org(
    public.storage_try_uuid((storage.foldername(name))[1]),
    'webinars.write'
  )
);

CREATE POLICY webinar_recordings_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'webinar-recordings'
  AND public.can_manage_webinar_recording_org(
    public.storage_try_uuid((storage.foldername(name))[1]),
    'webinars.write'
  )
);

-- Public visitors validate only the token they already possess. They can no
-- longer enumerate every demo token through the base table.
CREATE OR REPLACE FUNCTION public.public_get_sales_demo_link(p_token text)
RETURNS TABLE (
  id uuid,
  token text,
  label text,
  kinescope_live_id text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.token, s.label, s.kinescope_live_id, s.is_active
  FROM public.sales_demo_links s
  WHERE s.token = p_token
    AND s.is_active = true
    AND (s.expires_at IS NULL OR s.expires_at > now())
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.public_get_sales_demo_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_sales_demo_link(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Anyone can read demo links" ON public.sales_demo_links;
DROP POLICY IF EXISTS sales_demo_links_admin_select ON public.sales_demo_links;
CREATE POLICY sales_demo_links_admin_select
ON public.sales_demo_links FOR SELECT TO authenticated
USING (public.has_role('admin'::public.app_role, auth.uid()));
