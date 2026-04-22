-- Add organization_id scoping to sales tables (NULL = platform/admin)
ALTER TABLE public.sales_tasks ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sales_blacklist ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sales_tasks_org ON public.sales_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_blacklist_org ON public.sales_blacklist(organization_id);

-- Update RLS policies to allow organization access
DROP POLICY IF EXISTS "Sales managers see own tasks" ON public.sales_tasks;
DROP POLICY IF EXISTS "Sales managers update own tasks" ON public.sales_tasks;
DROP POLICY IF EXISTS "Sales managers create own tasks" ON public.sales_tasks;

CREATE POLICY "Org members manage their sales_tasks" ON public.sales_tasks
  FOR ALL TO authenticated
  USING (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  )
  WITH CHECK (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  );

DROP POLICY IF EXISTS "Sales managers view blacklist" ON public.sales_blacklist;

CREATE POLICY "Org members manage their blacklist" ON public.sales_blacklist
  FOR ALL TO authenticated
  USING (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  )
  WITH CHECK (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  );

-- Drop unique constraint on inn (since now scoped per organization)
ALTER TABLE public.sales_blacklist DROP CONSTRAINT IF EXISTS sales_blacklist_inn_key;
CREATE UNIQUE INDEX IF NOT EXISTS sales_blacklist_inn_org_unique 
  ON public.sales_blacklist(inn, COALESCE(organization_id::text, 'platform'));
