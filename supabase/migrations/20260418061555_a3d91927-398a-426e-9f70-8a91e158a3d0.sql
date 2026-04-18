-- Recreate storage policies for external-contracts to ensure org users can upload
DROP POLICY IF EXISTS "Org members upload external contracts" ON storage.objects;
DROP POLICY IF EXISTS "Org members read own external contracts" ON storage.objects;
DROP POLICY IF EXISTS "Org members delete own external contracts" ON storage.objects;
DROP POLICY IF EXISTS "Admins update external contracts" ON storage.objects;

-- INSERT: allow authenticated users to upload into a folder whose name matches their organization_id, OR admins anywhere
CREATE POLICY "Org members upload external contracts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'external-contracts'
  AND (
    has_role('admin'::app_role, auth.uid())
    OR (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
    )
  )
);

-- SELECT
CREATE POLICY "Org members read own external contracts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'external-contracts'
  AND (
    has_role('admin'::app_role, auth.uid())
    OR (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
    )
  )
);

-- UPDATE (admins only — for editing/replacing files during review)
CREATE POLICY "Admins update external contracts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'external-contracts'
  AND has_role('admin'::app_role, auth.uid())
);

-- DELETE
CREATE POLICY "Org members delete own external contracts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'external-contracts'
  AND (
    has_role('admin'::app_role, auth.uid())
    OR (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
    )
  )
);

-- Clear default admin signature email so the field appears empty by default; fallback handled in frontend
UPDATE public.app_settings
SET setting_value = ''
WHERE setting_key = 'admin_signature_email' AND setting_value = 'admin@sintagma.com.ru';