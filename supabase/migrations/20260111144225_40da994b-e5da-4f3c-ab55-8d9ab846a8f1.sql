-- Add course_id column to registration_links for automatic enrollment
ALTER TABLE public.registration_links 
ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;

-- Add index for faster queries
CREATE INDEX idx_registration_links_course_id ON public.registration_links(course_id);

-- Add comment
COMMENT ON COLUMN public.registration_links.course_id IS 'Optional course to auto-enroll students upon registration';