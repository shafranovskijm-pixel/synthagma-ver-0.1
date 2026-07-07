-- Allow active sales managers (not necessarily linked to organization) to manage their own tasks
CREATE OR REPLACE FUNCTION public.is_active_sales_manager(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.sales_managers WHERE user_id = _uid AND is_active = true);
$$;

CREATE POLICY sales_tasks_sm_insert ON public.sales_tasks
FOR INSERT TO authenticated
WITH CHECK (public.is_active_sales_manager(auth.uid()));

CREATE POLICY sales_tasks_sm_select ON public.sales_tasks
FOR SELECT TO authenticated
USING (public.is_active_sales_manager(auth.uid()));

CREATE POLICY sales_tasks_sm_update ON public.sales_tasks
FOR UPDATE TO authenticated
USING (public.is_active_sales_manager(auth.uid()))
WITH CHECK (public.is_active_sales_manager(auth.uid()));

CREATE POLICY sales_tasks_sm_delete ON public.sales_tasks
FOR DELETE TO authenticated
USING (public.is_active_sales_manager(auth.uid()));

-- Same fix for sales_lead_activities (same RLS pattern likely)
CREATE POLICY sales_lead_activities_sm_all ON public.sales_lead_activities
FOR ALL TO authenticated
USING (public.is_active_sales_manager(auth.uid()))
WITH CHECK (public.is_active_sales_manager(auth.uid()));

-- And sales_leads updates (last_contact_at etc.)
CREATE POLICY sales_leads_sm_all ON public.sales_leads
FOR ALL TO authenticated
USING (public.is_active_sales_manager(auth.uid()))
WITH CHECK (public.is_active_sales_manager(auth.uid()));