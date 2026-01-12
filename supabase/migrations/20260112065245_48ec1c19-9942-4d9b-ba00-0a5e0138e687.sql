-- Add contract metadata fields to company_documents
ALTER TABLE public.company_documents
ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS students_count integer,
ADD COLUMN IF NOT EXISTS contract_date date;