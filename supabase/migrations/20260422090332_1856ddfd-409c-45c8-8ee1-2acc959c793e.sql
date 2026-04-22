-- ============================================================
-- Этап 1: Фундамент системы прав сотрудников
-- ============================================================

-- 1. Получить роль сотрудника платформы
CREATE OR REPLACE FUNCTION public.get_admin_staff_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.admin_staff WHERE user_id = _user_id LIMIT 1
$$;

-- 2. Проверить, что админ-сотрудник имеет указанную роль (с учётом иерархии)
-- super_admin > admin > sales_manager / viewer (последние две — параллельны)
CREATE OR REPLACE FUNCTION public.has_admin_staff_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_staff
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (role = 'super_admin')
        OR (role = 'admin' AND _role IN ('viewer'))
      )
  )
$$;

-- 3. Шаблон разрешений по ролям организации (server-side mirror of rolePermissions.ts)
-- Возвращает базовый набор прав для роли. Personal overrides из sections_access merge'атся выше.
CREATE OR REPLACE FUNCTION public.org_role_default_permissions(_role text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _role
    WHEN 'owner' THEN ARRAY[
      'courses.read','courses.write','students.read','students.write',
      'companies.read','companies.write','library.read','library.write',
      'documents.read','documents.write','journals.read','journals.write',
      'frdo.read','frdo.write','labor_safety.read','labor_safety.write',
      'services.read','services.write','staff.read','staff.write',
      'billing.read','billing.write','settings.read','settings.write',
      'chats.read','chats.write','homework.read','homework.write',
      'webinars.read','webinars.write','sales.read','sales.write'
    ]
    WHEN 'admin' THEN ARRAY[
      'courses.read','courses.write','students.read','students.write',
      'companies.read','companies.write','library.read','library.write',
      'documents.read','documents.write','journals.read','journals.write',
      'frdo.read','frdo.write','labor_safety.read','labor_safety.write',
      'services.read','services.write','staff.read',
      'billing.read','settings.read',
      'chats.read','chats.write','homework.read','homework.write',
      'webinars.read','webinars.write','sales.read'
    ]
    WHEN 'school_editor' THEN ARRAY[
      'courses.read','courses.write','library.read','library.write',
      'documents.read','services.read','services.write',
      'settings.read','webinars.read','webinars.write'
    ]
    WHEN 'course_editor' THEN ARRAY[
      'courses.read','courses.write','library.read','library.write',
      'documents.read','webinars.read'
    ]
    WHEN 'teacher' THEN ARRAY[
      'courses.read','students.read','chats.read','chats.write',
      'homework.read','homework.write','documents.read','journals.read'
    ]
    ELSE ARRAY[]::text[]
  END
$$;

-- 4. Полный набор разрешений сотрудника организации (роль + personal overrides)
CREATE OR REPLACE FUNCTION public.get_org_staff_permissions(_user_id uuid, _organization_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_role text;
  base_perms text[];
  override_perms text[];
BEGIN
  SELECT role,
         COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(sections_access)),
           ARRAY[]::text[]
         )
    INTO staff_role, override_perms
    FROM public.org_staff
   WHERE user_id = _user_id AND organization_id = _organization_id
   LIMIT 1;

  IF staff_role IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  base_perms := public.org_role_default_permissions(staff_role);

  -- merge: union of base + overrides (overrides могут только добавлять права)
  RETURN ARRAY(
    SELECT DISTINCT unnest(base_perms || override_perms)
  );
END;
$$;

-- 5. Проверка конкретного разрешения у сотрудника организации
CREATE OR REPLACE FUNCTION public.has_org_staff_permission(_user_id uuid, _organization_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _permission = ANY(public.get_org_staff_permissions(_user_id, _organization_id))
$$;

-- ============================================================
-- 6. Автосвязка admin_staff (role='sales_manager') ↔ sales_managers
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_admin_staff_to_sales_managers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- INSERT/UPDATE: если новая роль = sales_manager → создать или активировать
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.role = 'sales_manager' THEN
    INSERT INTO public.sales_managers (user_id, full_name, is_active)
    VALUES (NEW.user_id, COALESCE(NULLIF(NEW.full_name, ''), NEW.email), true)
    ON CONFLICT (user_id) DO UPDATE
      SET is_active = true,
          full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.sales_managers.full_name);
    RETURN NEW;
  END IF;

  -- UPDATE: если роль СМЕНИЛАСЬ с sales_manager → деактивировать запись
  IF TG_OP = 'UPDATE' AND OLD.role = 'sales_manager' AND NEW.role <> 'sales_manager' THEN
    UPDATE public.sales_managers SET is_active = false WHERE user_id = NEW.user_id;
    RETURN NEW;
  END IF;

  -- DELETE: деактивировать
  IF TG_OP = 'DELETE' AND OLD.role = 'sales_manager' THEN
    UPDATE public.sales_managers SET is_active = false WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_admin_staff_to_sales_managers_trg ON public.admin_staff;
CREATE TRIGGER sync_admin_staff_to_sales_managers_trg
AFTER INSERT OR UPDATE OF role OR DELETE ON public.admin_staff
FOR EACH ROW
EXECUTE FUNCTION public.sync_admin_staff_to_sales_managers();

-- Backfill: для уже существующих admin_staff с ролью sales_manager создать sales_managers
INSERT INTO public.sales_managers (user_id, full_name, is_active)
SELECT a.user_id, COALESCE(NULLIF(a.full_name, ''), a.email), true
  FROM public.admin_staff a
 WHERE a.role = 'sales_manager'
   AND NOT EXISTS (SELECT 1 FROM public.sales_managers sm WHERE sm.user_id = a.user_id)
ON CONFLICT (user_id) DO NOTHING;