
-- 1) Добавить временные роли (expires_at) в org_staff и admin_staff
ALTER TABLE public.org_staff
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.admin_staff
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_org_staff_expires_at
  ON public.org_staff (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_staff_expires_at
  ON public.admin_staff (expires_at)
  WHERE expires_at IS NOT NULL;

-- 2) Связь org_staff с кастомной ролью (опционально)
ALTER TABLE public.org_staff
  ADD COLUMN IF NOT EXISTS custom_role_id uuid REFERENCES public.org_custom_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_staff_custom_role
  ON public.org_staff (custom_role_id)
  WHERE custom_role_id IS NOT NULL;

-- 3) Функция массового истечения ролей и приглашений
CREATE OR REPLACE FUNCTION public.expire_temporary_staff_roles()
RETURNS TABLE(scope text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_count bigint;
  admin_count bigint;
  inv_count bigint;
BEGIN
  WITH expired_org AS (
    DELETE FROM public.org_staff
    WHERE expires_at IS NOT NULL AND expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO org_count FROM expired_org;

  WITH expired_admin AS (
    DELETE FROM public.admin_staff
    WHERE expires_at IS NOT NULL AND expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO admin_count FROM expired_admin;

  WITH expired_inv AS (
    UPDATE public.staff_invitations
    SET status = 'expired', updated_at = now()
    WHERE status = 'pending' AND expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO inv_count FROM expired_inv;

  RETURN QUERY VALUES
    ('org_staff'::text, org_count),
    ('admin_staff'::text, admin_count),
    ('invitations'::text, inv_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_temporary_staff_roles() TO service_role;
