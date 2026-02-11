
-- Add advance days setting to courses
ALTER TABLE public.courses ADD COLUMN reminder_advance_days integer NOT NULL DEFAULT 30;

-- Update trigger to use advance days
CREATE OR REPLACE FUNCTION public.create_course_reminder_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_period integer;
  v_org_id uuid;
  v_company_id uuid;
  v_advance_days integer;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    SELECT retraining_period_months, organization_id, reminder_advance_days
    INTO v_period, v_org_id, v_advance_days
    FROM public.courses WHERE id = NEW.course_id;
    
    IF v_period IS NOT NULL AND v_period > 0 THEN
      SELECT company_id INTO v_company_id
      FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
      
      INSERT INTO public.course_reminders (
        course_id, enrollment_id, user_id, organization_id, company_id,
        completed_at, reminder_date
      ) VALUES (
        NEW.course_id, NEW.id, NEW.user_id, v_org_id, v_company_id,
        COALESCE(NEW.completed_at, now()),
        ((COALESCE(NEW.completed_at, now()) + (v_period || ' months')::interval) - (COALESCE(v_advance_days, 30) || ' days')::interval)::date
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
