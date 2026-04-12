
CREATE TABLE public.subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  plan TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  period_months INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org can view own invoices"
  ON public.subscription_invoices
  FOR SELECT TO authenticated
  USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org can insert own invoices"
  ON public.subscription_invoices
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Service role full access"
  ON public.subscription_invoices
  FOR ALL
  USING (true)
  WITH CHECK (true);
