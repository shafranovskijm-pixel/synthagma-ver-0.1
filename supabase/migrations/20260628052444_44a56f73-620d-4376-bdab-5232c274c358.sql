
CREATE OR REPLACE FUNCTION public.ensure_sales_manager_for_current_user()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role('admin'::app_role, v_uid) OR public.has_role('sales_manager'::app_role, v_uid)) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  SELECT id INTO v_id FROM public.sales_managers WHERE user_id = v_uid LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  SELECT COALESCE(full_name, email, 'Менеджер') INTO v_name FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.sales_managers (user_id, full_name, is_active)
  VALUES (v_uid, COALESCE(v_name, 'Менеджер'), true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_sales_manager_for_current_user() TO authenticated;
