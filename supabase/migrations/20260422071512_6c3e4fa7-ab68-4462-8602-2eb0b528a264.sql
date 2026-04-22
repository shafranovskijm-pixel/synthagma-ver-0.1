-- Recreate policies as separate per-command (FOR ALL sometimes fails to register)
DROP POLICY IF EXISTS "Org members manage their sales_tasks" ON public.sales_tasks;
DROP POLICY IF EXISTS "Admin full access to sales_tasks" ON public.sales_tasks;
DROP POLICY IF EXISTS "Org members manage their blacklist" ON public.sales_blacklist;
DROP POLICY IF EXISTS "Admin full access to blacklist" ON public.sales_blacklist;

-- sales_tasks
CREATE POLICY "sales_tasks_select" ON public.sales_tasks FOR SELECT TO authenticated
  USING (has_role('admin'::app_role, auth.uid()) OR (organization_id IS NOT NULL AND organization_id = current_organization_id()));

CREATE POLICY "sales_tasks_insert" ON public.sales_tasks FOR INSERT TO authenticated
  WITH CHECK (has_role('admin'::app_role, auth.uid()) OR (organization_id IS NOT NULL AND organization_id = current_organization_id()));

CREATE POLICY "sales_tasks_update" ON public.sales_tasks FOR UPDATE TO authenticated
  USING (has_role('admin'::app_role, auth.uid()) OR (organization_id IS NOT NULL AND organization_id = current_organization_id()))
  WITH CHECK (has_role('admin'::app_role, auth.uid()) OR (organization_id IS NOT NULL AND organization_id = current_organization_id()));

CREATE POLICY "sales_tasks_delete" ON public.sales_tasks FOR DELETE TO authenticated
  USING (has_role('admin'::app_role, auth.uid()) OR (organization_id IS NOT NULL AND organization_id = current_organization_id()));

-- sales_blacklist
CREATE POLICY "sales_blacklist_select" ON public.sales_blacklist FOR SELECT TO authenticated
  USING (has_role('admin'::app_role, auth.uid()) OR (organization_id IS NOT NULL AND organization_id = current_organization_id()));

CREATE POLICY "sales_blacklist_insert" ON public.sales_blacklist FOR INSERT TO authenticated
  WITH CHECK (has_role('admin'::app_role, auth.uid()) OR (organization_id IS NOT NULL AND organization_id = current_organization_id()));

CREATE POLICY "sales_blacklist_update" ON public.sales_blacklist FOR UPDATE TO authenticated
  USING (has_role('admin'::app_role, auth.uid()) OR (organization_id IS NOT NULL AND organization_id = current_organization_id()))
  WITH CHECK (has_role('admin'::app_role, auth.uid()) OR (organization_id IS NOT NULL AND organization_id = current_organization_id()));

CREATE POLICY "sales_blacklist_delete" ON public.sales_blacklist FOR DELETE TO authenticated
  USING (has_role('admin'::app_role, auth.uid()) OR (organization_id IS NOT NULL AND organization_id = current_organization_id()));
