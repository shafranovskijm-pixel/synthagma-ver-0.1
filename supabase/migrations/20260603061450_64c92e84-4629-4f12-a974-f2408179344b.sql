DROP POLICY IF EXISTS "Organization users can upload branding assets" ON storage.objects;
DROP POLICY IF EXISTS "Organization users can update their branding assets" ON storage.objects;
DROP POLICY IF EXISTS "Organization users can delete their branding assets" ON storage.objects;

CREATE POLICY "Org branding upload by org staff"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'org-branding'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.organization_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM public.org_staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id::text = (storage.foldername(name))[1]
    )
  )
);

CREATE POLICY "Org branding update by org staff"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'org-branding'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.organization_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM public.org_staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id::text = (storage.foldername(name))[1]
    )
  )
);

CREATE POLICY "Org branding delete by org staff"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'org-branding'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.organization_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM public.org_staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id::text = (storage.foldername(name))[1]
    )
  )
);

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS platform_kinescope_folder_id TEXT;