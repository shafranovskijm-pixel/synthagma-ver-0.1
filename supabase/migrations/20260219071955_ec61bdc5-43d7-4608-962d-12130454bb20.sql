
-- Create company_requests table
CREATE TABLE public.company_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'training' CHECK (request_type IN ('training', 'documents', 'consultation', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  employees JSONB DEFAULT '[]'::jsonb,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  course_name TEXT,
  desired_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'rejected', 'completed')),
  org_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_requests ENABLE ROW LEVEL SECURITY;

-- Company can view own requests
CREATE POLICY "Company can view own requests"
ON public.company_requests FOR SELECT
TO authenticated
USING (company_id = public.current_company_id());

-- Company can create own requests
CREATE POLICY "Company can create own requests"
ON public.company_requests FOR INSERT
TO authenticated
WITH CHECK (company_id = public.current_company_id());

-- Organization can view requests from their companies
CREATE POLICY "Org can view company requests"
ON public.company_requests FOR SELECT
TO authenticated
USING (organization_id = public.current_organization_id());

-- Organization can update requests (status, response)
CREATE POLICY "Org can update company requests"
ON public.company_requests FOR UPDATE
TO authenticated
USING (organization_id = public.current_organization_id());

-- Admin full access
CREATE POLICY "Admin full access to company_requests"
ON public.company_requests FOR ALL
TO authenticated
USING (public.has_role('admin'::app_role, auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_company_requests_updated_at
BEFORE UPDATE ON public.company_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.company_requests;
