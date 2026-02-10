-- Make student-documents bucket private to protect sensitive student data
UPDATE storage.buckets SET public = false WHERE id = 'student-documents';