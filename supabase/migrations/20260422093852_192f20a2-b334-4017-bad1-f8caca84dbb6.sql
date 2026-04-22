-- Drop old function first (return type change)
DROP FUNCTION IF EXISTS public.expire_temporary_staff_roles();

-- Enum ролей сотрудников компании
DO $$ BEGIN
  CREATE TYPE public.company_staff_role AS ENUM ('owner', 'manager', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Таблица company_staff
CREATE TABLE IF NOT EXISTS public.company_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.company_staff_role NOT NULL DEFAULT 'viewer',
  invited_by UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_staff_company ON public.company_staff(company_id);
CREATE INDEX IF NOT EXISTS idx_company_staff_user ON public.company_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_company_staff_expires ON public.company_staff(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE public.company_staff ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_company_access(
  _user_id UUID,
  _company_id UUID,
  _min_role public.company_staff_role DEFAULT 'viewer'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_owner UUID;
  _company_org UUID;
  _staff_role public.company_staff_role;
  _role_rank INT;
  _min_rank INT;
BEGIN
  IF _user_id IS NULL OR _company_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') THEN
    RETURN TRUE;
  END IF;

  SELECT user_id, organization_id INTO _company_owner, _company_org
  FROM public.companies WHERE id = _company_id;

  IF _company_owner IS NULL AND _company_org IS NULL THEN
    RETURN FALSE;
  END IF;

  IF _company_owner = _user_id THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _user_id
      AND p.organization_id = _company_org
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = 'organization')
  ) THEN
    RETURN TRUE;
  END IF;

  IF public.has_org_staff_permission(_user_id, _company_org, 'companies_manage') THEN
    RETURN TRUE;
  END IF;

  SELECT role INTO _staff_role FROM public.company_staff
  WHERE company_id = _company_id AND user_id = _user_id
    AND (expires_at IS NULL OR expires_at > now());

  IF _staff_role IS NULL THEN
    RETURN FALSE;
  END IF;

  _role_rank := CASE _staff_role
    WHEN 'owner' THEN 3 WHEN 'manager' THEN 2 WHEN 'viewer' THEN 1 END;
  _min_rank := CASE _min_role
    WHEN 'owner' THEN 3 WHEN 'manager' THEN 2 WHEN 'viewer' THEN 1 END;

  RETURN _role_rank >= _min_rank;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_companies(_user_id UUID)
RETURNS TABLE(company_id UUID, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, 'owner'::TEXT FROM public.companies c WHERE c.user_id = _user_id
  UNION
  SELECT cs.company_id, cs.role::TEXT FROM public.company_staff cs
  WHERE cs.user_id = _user_id AND (cs.expires_at IS NULL OR cs.expires_at > now());
$$;

DROP POLICY IF EXISTS "company_staff_select" ON public.company_staff;
CREATE POLICY "company_staff_select" ON public.company_staff FOR SELECT
USING (public.has_company_access(auth.uid(), company_id, 'viewer'));

DROP POLICY IF EXISTS "company_staff_insert" ON public.company_staff;
CREATE POLICY "company_staff_insert" ON public.company_staff FOR INSERT
WITH CHECK (public.has_company_access(auth.uid(), company_id, 'owner'));

DROP POLICY IF EXISTS "company_staff_update" ON public.company_staff;
CREATE POLICY "company_staff_update" ON public.company_staff FOR UPDATE
USING (public.has_company_access(auth.uid(), company_id, 'owner'));

DROP POLICY IF EXISTS "company_staff_delete" ON public.company_staff;
CREATE POLICY "company_staff_delete" ON public.company_staff FOR DELETE
USING (public.has_company_access(auth.uid(), company_id, 'owner'));

DROP TRIGGER IF EXISTS trg_company_staff_updated ON public.company_staff;
CREATE TRIGGER trg_company_staff_updated
  BEFORE UPDATE ON public.company_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.audit_company_staff_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id UUID;
BEGIN
  SELECT organization_id INTO _org_id FROM public.companies
  WHERE id = COALESCE(NEW.company_id, OLD.company_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.role_audit_log(organization_id, actor_user_id, target_user_id, action, scope, new_role, metadata)
    VALUES (_org_id, auth.uid(), NEW.user_id, 'role_assigned', 'company', NEW.role::TEXT,
      jsonb_build_object('company_id', NEW.company_id, 'expires_at', NEW.expires_at));
  ELSIF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO public.role_audit_log(organization_id, actor_user_id, target_user_id, action, scope, old_role, new_role, metadata)
    VALUES (_org_id, auth.uid(), NEW.user_id, 'role_changed', 'company', OLD.role::TEXT, NEW.role::TEXT,
      jsonb_build_object('company_id', NEW.company_id));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.role_audit_log(organization_id, actor_user_id, target_user_id, action, scope, old_role, metadata)
    VALUES (_org_id, auth.uid(), OLD.user_id, 'role_revoked', 'company', OLD.role::TEXT,
      jsonb_build_object('company_id', OLD.company_id));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_company_staff ON public.company_staff;
CREATE TRIGGER trg_audit_company_staff
  AFTER INSERT OR UPDATE OR DELETE ON public.company_staff
  FOR EACH ROW EXECUTE FUNCTION public.audit_company_staff_changes();

DO $$ BEGIN
  ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
EXCEPTION WHEN others THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.expire_temporary_staff_roles()
RETURNS TABLE(expired_org INT, expired_admin INT, expired_company INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org INT; _adm INT; _cmp INT;
BEGIN
  WITH d AS (DELETE FROM public.org_staff WHERE expires_at IS NOT NULL AND expires_at <= now() RETURNING 1)
  SELECT count(*) INTO _org FROM d;

  WITH d AS (DELETE FROM public.admin_staff WHERE expires_at IS NOT NULL AND expires_at <= now() RETURNING 1)
  SELECT count(*) INTO _adm FROM d;

  WITH d AS (DELETE FROM public.company_staff WHERE expires_at IS NOT NULL AND expires_at <= now() RETURNING 1)
  SELECT count(*) INTO _cmp FROM d;

  UPDATE public.staff_invitations
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at <= now();

  RETURN QUERY SELECT _org, _adm, _cmp;
END;
$$;