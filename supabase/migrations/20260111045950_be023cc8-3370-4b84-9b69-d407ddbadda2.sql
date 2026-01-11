-- Create enrollment_history table
CREATE TABLE public.enrollment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID,
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('enrolled', 'unenrolled')),
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.enrollment_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Org users can view enrollment history for their org courses"
ON public.enrollment_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.courses c
    JOIN public.profiles p ON p.organization_id = c.organization_id
    WHERE c.id = enrollment_history.course_id
    AND p.user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  )
);

CREATE POLICY "System can insert enrollment history"
ON public.enrollment_history
FOR INSERT
WITH CHECK (true);

-- Create trigger function to log enrollment changes
CREATE OR REPLACE FUNCTION public.log_enrollment_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.enrollment_history (enrollment_id, user_id, course_id, action, performed_by)
    VALUES (NEW.id, NEW.user_id, NEW.course_id, 'enrolled', auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.enrollment_history (enrollment_id, user_id, course_id, action, performed_by)
    VALUES (OLD.id, OLD.user_id, OLD.course_id, 'unenrolled', auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers
CREATE TRIGGER on_enrollment_insert
AFTER INSERT ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.log_enrollment_change();

CREATE TRIGGER on_enrollment_delete
AFTER DELETE ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.log_enrollment_change();