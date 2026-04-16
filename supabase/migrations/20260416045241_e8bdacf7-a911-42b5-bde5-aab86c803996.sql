
-- Set default to true for new courses
ALTER TABLE public.courses ALTER COLUMN require_enrollment_approval SET DEFAULT true;

-- Update all existing courses to require approval
UPDATE public.courses SET require_enrollment_approval = true WHERE require_enrollment_approval = false;
