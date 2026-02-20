
-- Fix: billing-documents read policy compares folder to profiles.id instead of organization_id
DROP POLICY IF EXISTS "Org users can read own billing docs" ON storage.objects;

CREATE POLICY "Org users can read own billing docs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'billing-documents'
  AND (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role
    )
    OR
    (storage.foldername(name))[1] IN (
      SELECT p.organization_id::text
      FROM profiles p
      WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL
    )
  )
);
