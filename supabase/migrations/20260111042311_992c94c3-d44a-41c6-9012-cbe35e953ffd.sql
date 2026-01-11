-- Create course_documents table for documents attached to courses
CREATE TABLE public.course_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'material',
  description TEXT,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.course_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for course_documents
CREATE POLICY "Org users can manage course documents"
ON public.course_documents
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = course_documents.course_id
    AND (c.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = course_documents.course_id
    AND (c.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  )
);

CREATE POLICY "Enrolled students can view course documents"
ON public.course_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.course_id = course_documents.course_id
    AND e.user_id = auth.uid()
  )
);

-- Update student_documents to allow admins
DROP POLICY IF EXISTS "Org users can manage student documents" ON public.student_documents;

CREATE POLICY "Org users can manage student documents"
ON public.student_documents
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.id = student_documents.enrollment_id
    AND (c.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.id = student_documents.enrollment_id
    AND (c.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  )
);

-- Create storage bucket for student documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-documents', 'student-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for student-documents bucket
CREATE POLICY "Org users can manage student docs storage"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'student-documents'
  AND has_role('organization'::app_role, auth.uid())
);

CREATE POLICY "Admins can manage all student docs storage"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'student-documents'
  AND has_role('admin'::app_role, auth.uid())
);

CREATE POLICY "Students can view own documents storage"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'student-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Trigger for updated_at
CREATE TRIGGER update_course_documents_updated_at
BEFORE UPDATE ON public.course_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();