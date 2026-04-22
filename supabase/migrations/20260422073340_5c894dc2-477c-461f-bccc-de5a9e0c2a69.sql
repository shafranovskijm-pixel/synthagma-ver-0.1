
-- Fix existing INSERT policies that had no WITH CHECK
DROP POLICY IF EXISTS sales_blacklist_insert ON public.sales_blacklist;
CREATE POLICY sales_blacklist_insert ON public.sales_blacklist
  FOR INSERT
  WITH CHECK (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  );

DROP POLICY IF EXISTS sales_tasks_insert ON public.sales_tasks;
CREATE POLICY sales_tasks_insert ON public.sales_tasks
  FOR INSERT
  WITH CHECK (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  );

DROP POLICY IF EXISTS "Admins can insert sales companies db" ON public.sales_companies_db;
CREATE POLICY "Admins can insert sales companies db" ON public.sales_companies_db
  FOR INSERT
  WITH CHECK (
    has_role('admin'::app_role, auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = current_organization_id())
  );
