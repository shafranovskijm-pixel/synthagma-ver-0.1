-- 1.1. Флаг получения задач CRM
ALTER TABLE public.org_staff
  ADD COLUMN IF NOT EXISTS can_receive_crm_tasks boolean NOT NULL DEFAULT false;

UPDATE public.org_staff
   SET can_receive_crm_tasks = true
 WHERE role IN ('sales_manager', 'owner', 'admin')
   AND can_receive_crm_tasks = false;

CREATE INDEX IF NOT EXISTS idx_org_staff_can_receive_crm
  ON public.org_staff(organization_id)
  WHERE can_receive_crm_tasks = true;

-- 1.2. Исполнитель задачи (любой пользователь, не только sales_manager)
ALTER TABLE public.sales_tasks
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_tasks_assigned_user
  ON public.sales_tasks(assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

-- 1.3. RPC: список возможных исполнителей задач для организации
CREATE OR REPLACE FUNCTION public.list_org_task_assignees(_org_id uuid)
RETURNS TABLE(user_id uuid, full_name text, role text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Сотрудники с включённой галочкой
  SELECT s.user_id,
         COALESCE(NULLIF(s.display_name, ''), p.full_name, p.email) AS full_name,
         s.role,
         p.email
    FROM public.org_staff s
    LEFT JOIN public.profiles p ON p.user_id = s.user_id
   WHERE s.organization_id = _org_id
     AND s.can_receive_crm_tasks = true

  UNION

  -- Владелец организации (роль 'organization' в user_roles, привязан к org через profiles)
  SELECT p.user_id,
         COALESCE(p.full_name, p.email) AS full_name,
         'owner'::text AS role,
         p.email
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'organization'::app_role
   WHERE p.organization_id = _org_id
     AND NOT EXISTS (
       SELECT 1 FROM public.org_staff s2 WHERE s2.user_id = p.user_id AND s2.organization_id = _org_id
     );
$$;

GRANT EXECUTE ON FUNCTION public.list_org_task_assignees(uuid) TO authenticated;

-- 2.2. Триггер: синк org_staff → sales_managers для совместимости с КП/договорами/лидами
CREATE OR REPLACE FUNCTION public.sync_org_staff_to_sales_managers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF COALESCE(NEW.can_receive_crm_tasks, false) = true OR NEW.role = 'sales_manager' THEN
      SELECT COALESCE(NULLIF(NEW.display_name, ''), p.full_name, p.email)
        INTO v_full_name
        FROM public.profiles p WHERE p.user_id = NEW.user_id;

      INSERT INTO public.sales_managers (user_id, full_name, is_active)
      VALUES (NEW.user_id, COALESCE(v_full_name, 'Сотрудник'), true)
      ON CONFLICT (user_id) DO UPDATE
        SET is_active = true,
            full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.sales_managers.full_name);
      RETURN NEW;
    END IF;

    -- Флаг снят и роль не sales_manager → деактивировать
    IF TG_OP = 'UPDATE' THEN
      UPDATE public.sales_managers SET is_active = false WHERE user_id = NEW.user_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.sales_managers SET is_active = false WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_org_staff_to_sales_managers ON public.org_staff;
CREATE TRIGGER trg_sync_org_staff_to_sales_managers
AFTER INSERT OR UPDATE OF role, can_receive_crm_tasks, display_name OR DELETE
ON public.org_staff
FOR EACH ROW
EXECUTE FUNCTION public.sync_org_staff_to_sales_managers();

-- Бэкап: прогнать триггер для существующих записей с галочкой
UPDATE public.org_staff SET updated_at = updated_at WHERE can_receive_crm_tasks = true OR role = 'sales_manager';