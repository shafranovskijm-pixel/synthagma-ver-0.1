
-- Open pool of unassigned leads to sales managers + claim RPC

CREATE POLICY "Sales managers see unassigned pool"
ON public.sales_leads
FOR SELECT
USING (
  has_role('sales_manager'::app_role, auth.uid())
  AND assigned_manager_id IS NULL
  AND organization_id IS NULL
  AND status = 'new'
);

CREATE OR REPLACE FUNCTION public.claim_sales_leads(_lead_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mgr_id uuid;
  _count integer := 0;
BEGIN
  IF NOT (has_role('sales_manager'::app_role, auth.uid()) OR has_role('admin'::app_role, auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO _mgr_id FROM public.sales_managers WHERE user_id = auth.uid() LIMIT 1;
  IF _mgr_id IS NULL THEN
    -- auto-provision for admins viewing the cabinet
    INSERT INTO public.sales_managers (user_id, full_name)
    VALUES (auth.uid(), coalesce((SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Менеджер'))
    RETURNING id INTO _mgr_id;
  END IF;

  UPDATE public.sales_leads
     SET assigned_manager_id = _mgr_id,
         status = 'in_progress',
         updated_at = now()
   WHERE id = ANY(_lead_ids)
     AND assigned_manager_id IS NULL;
  GET DIAGNOSTICS _count = ROW_COUNT;

  INSERT INTO public.sales_lead_activities (lead_id, manager_id, activity_type, notes)
  SELECT id, _mgr_id, 'claim', 'Лид взят из общего пула'
    FROM public.sales_leads
   WHERE id = ANY(_lead_ids) AND assigned_manager_id = _mgr_id;

  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_sales_leads(uuid[]) TO authenticated;
