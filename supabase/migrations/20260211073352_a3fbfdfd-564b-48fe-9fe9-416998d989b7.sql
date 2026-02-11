
-- Add retraining period to courses
ALTER TABLE public.courses ADD COLUMN retraining_period_months integer;

-- Create course_reminders table
CREATE TABLE public.course_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  completed_at timestamptz NOT NULL,
  reminder_date date NOT NULL,
  reminder_text text,
  notify_organization boolean NOT NULL DEFAULT true,
  notify_company boolean NOT NULL DEFAULT true,
  notify_student boolean NOT NULL DEFAULT true,
  is_sent boolean NOT NULL DEFAULT false,
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.course_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Org users can view course reminders"
ON public.course_reminders
FOR SELECT
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can manage course reminders"
ON public.course_reminders
FOR ALL
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

-- Students can view their own reminders
CREATE POLICY "Students can view own course reminders"
ON public.course_reminders
FOR SELECT
USING (user_id = auth.uid());

-- Index for faster lookups
CREATE INDEX idx_course_reminders_reminder_date ON public.course_reminders(reminder_date) WHERE is_sent = false AND is_dismissed = false;
CREATE INDEX idx_course_reminders_course_id ON public.course_reminders(course_id);
CREATE INDEX idx_course_reminders_org_id ON public.course_reminders(organization_id);

-- Trigger for auto-creating reminders when enrollment is completed
CREATE OR REPLACE FUNCTION public.create_course_reminder_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_period integer;
  v_org_id uuid;
  v_company_id uuid;
BEGIN
  -- Only act when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Get course retraining period
    SELECT retraining_period_months, organization_id 
    INTO v_period, v_org_id
    FROM public.courses WHERE id = NEW.course_id;
    
    -- Only create reminder if period is set
    IF v_period IS NOT NULL AND v_period > 0 THEN
      -- Get student's company_id from profiles
      SELECT company_id INTO v_company_id
      FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
      
      INSERT INTO public.course_reminders (
        course_id, enrollment_id, user_id, organization_id, company_id,
        completed_at, reminder_date
      ) VALUES (
        NEW.course_id, NEW.id, NEW.user_id, v_org_id, v_company_id,
        COALESCE(NEW.completed_at, now()),
        (COALESCE(NEW.completed_at, now()) + (v_period || ' months')::interval)::date
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_create_course_reminder
AFTER UPDATE ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.create_course_reminder_on_completion();

-- Updated_at trigger
CREATE TRIGGER update_course_reminders_updated_at
BEFORE UPDATE ON public.course_reminders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
