-- Create table for student identity documents (passport, SNILS, education docs)
CREATE TABLE public.student_identity_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  type TEXT NOT NULL, -- passport, birth_certificate, snils, education_document, diploma, attestat
  name TEXT NOT NULL,
  file_url TEXT,
  file_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.student_identity_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Org users can manage student identity documents"
ON public.student_identity_documents
FOR ALL
USING (
  (organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())
)
WITH CHECK (
  (organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())
);

CREATE POLICY "Students can view own identity documents"
ON public.student_identity_documents
FOR SELECT
USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_student_identity_documents_updated_at
BEFORE UPDATE ON public.student_identity_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();