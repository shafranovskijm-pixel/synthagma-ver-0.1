-- Add student reference to consent_documents
ALTER TABLE public.consent_documents 
ADD COLUMN student_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add index for faster queries
CREATE INDEX idx_consent_documents_student ON public.consent_documents(student_user_id);