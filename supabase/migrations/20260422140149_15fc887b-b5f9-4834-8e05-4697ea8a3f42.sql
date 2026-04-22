INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-stamps',
  'org-stamps',
  false,
  5242880,
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "org_stamps_read" ON storage.objects;
CREATE POLICY "org_stamps_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'org-stamps'
  AND (
    public.get_admin_staff_role(auth.uid()) IS NOT NULL
    OR public.has_org_staff_permission(auth.uid(), ((storage.foldername(name))[2])::uuid, 'documents.view'::text)
  )
);

DROP POLICY IF EXISTS "org_stamps_write" ON storage.objects;
CREATE POLICY "org_stamps_write"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'org-stamps'
  AND (storage.foldername(name))[1] = 'organizations'
  AND (
    public.get_admin_staff_role(auth.uid()) IS NOT NULL
    OR public.has_org_staff_permission(auth.uid(), ((storage.foldername(name))[2])::uuid, 'documents.manage'::text)
  )
);

DROP POLICY IF EXISTS "org_stamps_update" ON storage.objects;
CREATE POLICY "org_stamps_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'org-stamps'
  AND (
    public.get_admin_staff_role(auth.uid()) IS NOT NULL
    OR public.has_org_staff_permission(auth.uid(), ((storage.foldername(name))[2])::uuid, 'documents.manage'::text)
  )
);

DROP POLICY IF EXISTS "org_stamps_delete" ON storage.objects;
CREATE POLICY "org_stamps_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'org-stamps'
  AND (
    public.get_admin_staff_role(auth.uid()) IS NOT NULL
    OR public.has_org_staff_permission(auth.uid(), ((storage.foldername(name))[2])::uuid, 'documents.manage'::text)
  )
);