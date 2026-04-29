
-- Allow students to insert/update/delete their own identity documents
DROP POLICY IF EXISTS "Students can insert own identity documents" ON public.student_identity_documents;
CREATE POLICY "Students can insert own identity documents"
ON public.student_identity_documents
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Students can update own identity documents" ON public.student_identity_documents;
CREATE POLICY "Students can update own identity documents"
ON public.student_identity_documents
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Students can delete own identity documents" ON public.student_identity_documents;
CREATE POLICY "Students can delete own identity documents"
ON public.student_identity_documents
FOR DELETE
TO authenticated
USING (user_id = auth.uid());
