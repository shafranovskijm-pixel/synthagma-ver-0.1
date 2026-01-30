-- Add FRDO settings columns to courses table
ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS frdo_program_type text,
ADD COLUMN IF NOT EXISTS frdo_document_type text,
ADD COLUMN IF NOT EXISTS frdo_professional_area text,
ADD COLUMN IF NOT EXISTS frdo_specialty_group text,
ADD COLUMN IF NOT EXISTS frdo_qualification_name text,
ADD COLUMN IF NOT EXISTS frdo_profession_name text,
ADD COLUMN IF NOT EXISTS frdo_qualification_rank text;

-- Add comments for documentation
COMMENT ON COLUMN public.courses.frdo_program_type IS 'FRDO program type: qualification_upgrade, professional_retraining, professional_training';
COMMENT ON COLUMN public.courses.frdo_document_type IS 'FRDO document type name';
COMMENT ON COLUMN public.courses.frdo_professional_area IS 'Professional activity area for FRDO';
COMMENT ON COLUMN public.courses.frdo_specialty_group IS 'Specialty group for FRDO';
COMMENT ON COLUMN public.courses.frdo_qualification_name IS 'Qualification/specialty name for FRDO';
COMMENT ON COLUMN public.courses.frdo_profession_name IS 'Profession name for professional training (PO)';
COMMENT ON COLUMN public.courses.frdo_qualification_rank IS 'Qualification rank for professional training (PO)';