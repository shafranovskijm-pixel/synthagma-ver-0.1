
-- Sales services catalog
CREATE TABLE public.sales_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to sales_services" ON public.sales_services FOR ALL TO authenticated USING (public.has_role('admin'::app_role, auth.uid())) WITH CHECK (public.has_role('admin'::app_role, auth.uid()));
CREATE POLICY "Sales managers can read active services" ON public.sales_services FOR SELECT TO authenticated USING (public.has_role('sales_manager'::app_role, auth.uid()) AND is_active = true);

-- Sales managers extended profile
CREATE TABLE public.sales_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to sales_managers" ON public.sales_managers FOR ALL TO authenticated USING (public.has_role('admin'::app_role, auth.uid())) WITH CHECK (public.has_role('admin'::app_role, auth.uid()));
CREATE POLICY "Sales managers can read own profile" ON public.sales_managers FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.has_role('sales_manager'::app_role, auth.uid()));

-- Commercial proposals
CREATE TABLE public.commercial_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  manager_id UUID REFERENCES public.sales_managers(id),
  company_name TEXT NOT NULL,
  company_inn TEXT,
  company_email TEXT,
  company_phone TEXT,
  contact_person TEXT,
  tariff_plan TEXT,
  custom_note TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','negotiation','accepted','rejected')),
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.commercial_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to proposals" ON public.commercial_proposals FOR ALL TO authenticated USING (public.has_role('admin'::app_role, auth.uid())) WITH CHECK (public.has_role('admin'::app_role, auth.uid()));
CREATE POLICY "Sales managers own proposals" ON public.commercial_proposals FOR ALL TO authenticated USING (public.has_role('sales_manager'::app_role, auth.uid()) AND (created_by = auth.uid() OR manager_id IN (SELECT id FROM public.sales_managers WHERE user_id = auth.uid()))) WITH CHECK (public.has_role('sales_manager'::app_role, auth.uid()) AND created_by = auth.uid());

CREATE TRIGGER update_commercial_proposals_updated_at BEFORE UPDATE ON public.commercial_proposals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Commercial proposal services (line items)
CREATE TABLE public.commercial_proposal_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.commercial_proposals(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.sales_services(id) ON DELETE SET NULL,
  custom_name TEXT NOT NULL,
  custom_description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.commercial_proposal_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to proposal_services" ON public.commercial_proposal_services FOR ALL TO authenticated USING (public.has_role('admin'::app_role, auth.uid())) WITH CHECK (public.has_role('admin'::app_role, auth.uid()));
CREATE POLICY "Sales managers own proposal services" ON public.commercial_proposal_services FOR ALL TO authenticated USING (public.has_role('sales_manager'::app_role, auth.uid()) AND proposal_id IN (SELECT id FROM public.commercial_proposals WHERE created_by = auth.uid() OR manager_id IN (SELECT sm.id FROM public.sales_managers sm WHERE sm.user_id = auth.uid()))) WITH CHECK (public.has_role('sales_manager'::app_role, auth.uid()));

-- Sales leads (company database)
CREATE TABLE public.sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name TEXT NOT NULL,
  inn TEXT,
  ogrn TEXT,
  license_number TEXT,
  license_date TEXT,
  region TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','contacted','interested','not_interested','client')),
  assigned_manager_id UUID REFERENCES public.sales_managers(id) ON DELETE SET NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'obrnadzor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_contact_at TIMESTAMPTZ
);
ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to sales_leads" ON public.sales_leads FOR ALL TO authenticated USING (public.has_role('admin'::app_role, auth.uid())) WITH CHECK (public.has_role('admin'::app_role, auth.uid()));
CREATE POLICY "Sales managers see assigned leads" ON public.sales_leads FOR SELECT TO authenticated USING (public.has_role('sales_manager'::app_role, auth.uid()) AND assigned_manager_id IN (SELECT id FROM public.sales_managers WHERE user_id = auth.uid()));
CREATE POLICY "Sales managers update assigned leads" ON public.sales_leads FOR UPDATE TO authenticated USING (public.has_role('sales_manager'::app_role, auth.uid()) AND assigned_manager_id IN (SELECT id FROM public.sales_managers WHERE user_id = auth.uid()));

CREATE TRIGGER update_sales_leads_updated_at BEFORE UPDATE ON public.sales_leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sales lead activities
CREATE TABLE public.sales_lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES public.sales_managers(id),
  activity_type TEXT NOT NULL CHECK (activity_type IN ('call','email','meeting','note','status_change')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to lead_activities" ON public.sales_lead_activities FOR ALL TO authenticated USING (public.has_role('admin'::app_role, auth.uid())) WITH CHECK (public.has_role('admin'::app_role, auth.uid()));
CREATE POLICY "Sales managers own activities" ON public.sales_lead_activities FOR ALL TO authenticated USING (public.has_role('sales_manager'::app_role, auth.uid()) AND manager_id IN (SELECT id FROM public.sales_managers WHERE user_id = auth.uid())) WITH CHECK (public.has_role('sales_manager'::app_role, auth.uid()) AND manager_id IN (SELECT id FROM public.sales_managers WHERE user_id = auth.uid()));

-- Indexes for performance
CREATE INDEX idx_sales_leads_region ON public.sales_leads(region);
CREATE INDEX idx_sales_leads_status ON public.sales_leads(status);
CREATE INDEX idx_sales_leads_assigned ON public.sales_leads(assigned_manager_id);
CREATE INDEX idx_sales_leads_inn ON public.sales_leads(inn);
CREATE INDEX idx_commercial_proposals_status ON public.commercial_proposals(status);
CREATE INDEX idx_lead_activities_lead ON public.sales_lead_activities(lead_id);
CREATE INDEX idx_lead_activities_manager ON public.sales_lead_activities(manager_id);
