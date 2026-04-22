-- 1. sales_tasks: задачи и напоминания менеджеров
CREATE TABLE public.sales_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  manager_id uuid REFERENCES public.sales_managers(id) ON DELETE SET NULL,
  due_date timestamp with time zone NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  type text NOT NULL DEFAULT 'call',
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_tasks
  ADD CONSTRAINT sales_tasks_status_check CHECK (status IN ('pending','done','cancelled')),
  ADD CONSTRAINT sales_tasks_type_check CHECK (type IN ('call','email','meeting','followup','other'));

CREATE INDEX idx_sales_tasks_manager ON public.sales_tasks(manager_id);
CREATE INDEX idx_sales_tasks_due ON public.sales_tasks(due_date) WHERE status = 'pending';
CREATE INDEX idx_sales_tasks_lead ON public.sales_tasks(lead_id);

ALTER TABLE public.sales_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to sales_tasks" ON public.sales_tasks
  FOR ALL TO authenticated
  USING (has_role('admin'::app_role, auth.uid()))
  WITH CHECK (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Sales managers see own tasks" ON public.sales_tasks
  FOR SELECT TO authenticated
  USING (
    has_role('sales_manager'::app_role, auth.uid())
    AND manager_id IN (SELECT id FROM public.sales_managers WHERE user_id = auth.uid())
  );

CREATE POLICY "Sales managers update own tasks" ON public.sales_tasks
  FOR UPDATE TO authenticated
  USING (
    has_role('sales_manager'::app_role, auth.uid())
    AND manager_id IN (SELECT id FROM public.sales_managers WHERE user_id = auth.uid())
  );

CREATE POLICY "Sales managers create own tasks" ON public.sales_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role('sales_manager'::app_role, auth.uid())
    AND manager_id IN (SELECT id FROM public.sales_managers WHERE user_id = auth.uid())
  );

CREATE TRIGGER update_sales_tasks_updated_at
  BEFORE UPDATE ON public.sales_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. sales_blacklist: чёрный список ИНН
CREATE TABLE public.sales_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inn text NOT NULL UNIQUE,
  org_name text,
  reason text,
  added_by uuid,
  added_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_blacklist_inn ON public.sales_blacklist(inn);

ALTER TABLE public.sales_blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to blacklist" ON public.sales_blacklist
  FOR ALL TO authenticated
  USING (has_role('admin'::app_role, auth.uid()))
  WITH CHECK (has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Sales managers view blacklist" ON public.sales_blacklist
  FOR SELECT TO authenticated
  USING (has_role('sales_manager'::app_role, auth.uid()));

-- 3. sales_leads: next_contact_date
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS next_contact_date timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_sales_leads_next_contact 
  ON public.sales_leads(next_contact_date) 
  WHERE next_contact_date IS NOT NULL;

-- 4. commercial_proposals: трекинг открытий
ALTER TABLE public.commercial_proposals
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamp with time zone;