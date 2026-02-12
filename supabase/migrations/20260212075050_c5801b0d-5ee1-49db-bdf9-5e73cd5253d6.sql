-- Revert student-documents bucket to private to protect sensitive PII
UPDATE storage.buckets SET public = false WHERE id = 'student-documents';