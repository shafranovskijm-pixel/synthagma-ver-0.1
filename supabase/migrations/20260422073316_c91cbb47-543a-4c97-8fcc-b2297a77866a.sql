
-- 1. Add organization_id to sales tables (nullable for backward compat with global admin data)
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sales_lead_activities ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sales_companies_db ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sales_contracts ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2. Indexes for org+date queries
CREATE INDEX IF NOT EXISTS idx_sales_leads_org_created ON public.sales_leads (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_lead_activities_org_created ON public.sales_lead_activities (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_companies_db_org ON public.sales_companies_db (organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_contracts_org_created ON public.sales_contracts (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_proposals_org_created ON public.commercial_proposals (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_signatures_org_created ON public.document_signatures (organization_id, created_at DESC);

-- 3. RLS policies for organization members on sales_leads
DROP POLICY IF EXISTS "Org members manage own sales_leads" ON public.sales_leads;
CREATE POLICY "Org members manage own sales_leads"
  ON public.sales_leads
  FOR ALL
  USING (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  )
  WITH CHECK (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  );

-- 4. RLS for sales_lead_activities
DROP POLICY IF EXISTS "Org members manage own lead_activities" ON public.sales_lead_activities;
CREATE POLICY "Org members manage own lead_activities"
  ON public.sales_lead_activities
  FOR ALL
  USING (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  )
  WITH CHECK (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  );

-- 5. RLS for sales_companies_db
DROP POLICY IF EXISTS "Org members view own sales_companies_db" ON public.sales_companies_db;
CREATE POLICY "Org members view own sales_companies_db"
  ON public.sales_companies_db
  FOR SELECT
  USING (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  );

DROP POLICY IF EXISTS "Org members modify own sales_companies_db" ON public.sales_companies_db;
CREATE POLICY "Org members modify own sales_companies_db"
  ON public.sales_companies_db
  FOR ALL
  USING (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  )
  WITH CHECK (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  );

-- 6. RLS for sales_contracts (same pattern)
DROP POLICY IF EXISTS "Org members manage own sales_contracts" ON public.sales_contracts;
CREATE POLICY "Org members manage own sales_contracts"
  ON public.sales_contracts
  FOR ALL
  USING (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  )
  WITH CHECK (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  );

-- 7. Auto-fill organization_id trigger for inserts where it's NULL
CREATE OR REPLACE FUNCTION public.auto_set_sales_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.organization_id := current_organization_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_org_sales_leads ON public.sales_leads;
CREATE TRIGGER trg_auto_org_sales_leads BEFORE INSERT ON public.sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_sales_org_id();

DROP TRIGGER IF EXISTS trg_auto_org_sales_lead_activities ON public.sales_lead_activities;
CREATE TRIGGER trg_auto_org_sales_lead_activities BEFORE INSERT ON public.sales_lead_activities
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_sales_org_id();

DROP TRIGGER IF EXISTS trg_auto_org_sales_companies_db ON public.sales_companies_db;
CREATE TRIGGER trg_auto_org_sales_companies_db BEFORE INSERT ON public.sales_companies_db
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_sales_org_id();

DROP TRIGGER IF EXISTS trg_auto_org_sales_contracts ON public.sales_contracts;
CREATE TRIGGER trg_auto_org_sales_contracts BEFORE INSERT ON public.sales_contracts
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_sales_org_id();
