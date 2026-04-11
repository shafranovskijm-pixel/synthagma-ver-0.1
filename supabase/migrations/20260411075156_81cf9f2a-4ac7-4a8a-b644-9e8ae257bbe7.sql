
CREATE TABLE public.sales_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  company_inn TEXT,
  company_kpp TEXT,
  company_address TEXT,
  company_director TEXT,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contract_number TEXT,
  contract_date DATE DEFAULT CURRENT_DATE,
  tariff_plan TEXT,
  contract_duration_months INTEGER NOT NULL DEFAULT 12,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  prepayment_amount NUMERIC NOT NULL DEFAULT 0,
  custom_services JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  html_content TEXT,
  manager_id UUID REFERENCES public.sales_managers(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything with contracts"
  ON public.sales_contracts FOR ALL
  USING (has_role('admin'::app_role, auth.uid()))
  WITH CHECK (has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER update_sales_contracts_updated_at
  BEFORE UPDATE ON public.sales_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
