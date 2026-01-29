-- Add INSERT policy for organizations to create manual verification records
CREATE POLICY "Organizations can create verifications for their students"
ON public.video_identifications
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.organization_id = video_identifications.organization_id
  )
);