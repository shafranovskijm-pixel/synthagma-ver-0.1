-- Allow students to upload their own documents to student-documents bucket
CREATE POLICY "Students can upload own documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'student-documents' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow students to view their own documents
CREATE POLICY "Students can view own documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'student-documents' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow students to delete their own documents
CREATE POLICY "Students can delete own documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'student-documents' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);