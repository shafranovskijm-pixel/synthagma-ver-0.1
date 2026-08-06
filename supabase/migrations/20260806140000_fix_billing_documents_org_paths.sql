-- Generated group DOCX files use organizations/{org_id}/..., while older
-- billing documents use {org_id}/.... Allow both layouts through the same
-- canonical organization access check. Invalid/non-org folders stay hidden.
DROP POLICY IF EXISTS "Org users can read own billing docs" ON storage.objects;

CREATE POLICY "Org users can read own billing docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'billing-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_organization(
      CASE
        WHEN (storage.foldername(name))[1] = 'organizations'
          AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN ((storage.foldername(name))[2])::uuid
        WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN ((storage.foldername(name))[1])::uuid
        ELSE NULL
      END,
      'documents.read'
    )
  )
);
