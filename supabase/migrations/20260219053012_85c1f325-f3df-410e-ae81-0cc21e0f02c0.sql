
-- Create training_plans table
CREATE TABLE public.training_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  user_id UUID NOT NULL,
  course_id UUID REFERENCES public.courses(id),
  course_name TEXT,
  planned_date DATE,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

-- Validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_training_plan_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('planned', 'enrolled', 'completed', 'overdue') THEN
    RAISE EXCEPTION 'Invalid training plan status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_training_plan_status_trigger
BEFORE INSERT OR UPDATE ON public.training_plans
FOR EACH ROW EXECUTE FUNCTION public.validate_training_plan_status();

-- Updated_at trigger
CREATE TRIGGER update_training_plans_updated_at
BEFORE UPDATE ON public.training_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: Company can manage their own plans
CREATE POLICY "Companies can view their training plans"
ON public.training_plans FOR SELECT
TO authenticated
USING (company_id = public.current_company_id());

CREATE POLICY "Companies can insert training plans"
ON public.training_plans FOR INSERT
TO authenticated
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Companies can update their training plans"
ON public.training_plans FOR UPDATE
TO authenticated
USING (company_id = public.current_company_id());

CREATE POLICY "Companies can delete their training plans"
ON public.training_plans FOR DELETE
TO authenticated
USING (company_id = public.current_company_id());

-- RLS: Organization can manage plans for their org
CREATE POLICY "Orgs can manage training plans"
ON public.training_plans FOR ALL
TO authenticated
USING (organization_id = public.current_organization_id());

-- RLS: Admin full access
CREATE POLICY "Admins can manage all training plans"
ON public.training_plans FOR ALL
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()));

-- RLS: Company can view course_reminders for their employees
CREATE POLICY "Companies can view their reminders"
ON public.course_reminders FOR SELECT
TO authenticated
USING (company_id = public.current_company_id());
