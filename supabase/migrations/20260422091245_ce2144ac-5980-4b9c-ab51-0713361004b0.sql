
-- 1) STAFF_INVITATIONS
CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_type TEXT NOT NULL CHECK (invitation_type IN ('admin', 'organization', 'company')),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL,
  sections_access JSONB DEFAULT '[]'::jsonb,
  custom_role_id UUID,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  invited_by UUID NOT NULL,
  invited_by_name TEXT,
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_token ON public.staff_invitations(token);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_email ON public.staff_invitations(lower(email));
CREATE INDEX IF NOT EXISTS idx_staff_invitations_org ON public.staff_invitations(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_invitations_status ON public.staff_invitations(status);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage admin invitations"
  ON public.staff_invitations FOR ALL
  USING (invitation_type = 'admin' AND public.has_role('admin'::app_role, auth.uid()))
  WITH CHECK (invitation_type = 'admin' AND public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org owners manage org invitations"
  ON public.staff_invitations FOR ALL
  USING (
    invitation_type = 'organization'
    AND organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL)
    AND public.has_role('organization'::app_role, auth.uid())
  )
  WITH CHECK (
    invitation_type = 'organization'
    AND organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid() AND p.organization_id IS NOT NULL)
    AND public.has_role('organization'::app_role, auth.uid())
  );

CREATE POLICY "Global admins manage all invitations"
  ON public.staff_invitations FOR ALL
  USING (public.has_role('admin'::app_role, auth.uid()))
  WITH CHECK (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Companies manage their invitations"
  ON public.staff_invitations FOR ALL
  USING (
    invitation_type = 'company'
    AND company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
  )
  WITH CHECK (
    invitation_type = 'company'
    AND company_id IN (SELECT id FROM public.companies WHERE user_id = auth.uid())
  );

-- 2) ROLE_AUDIT_LOG
CREATE TABLE IF NOT EXISTS public.role_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('admin', 'organization', 'company')),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL,
  target_email TEXT,
  target_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('granted', 'changed', 'revoked', 'invited', 'invitation_accepted', 'invitation_revoked')),
  old_role TEXT,
  new_role TEXT,
  old_sections_access JSONB,
  new_sections_access JSONB,
  performed_by UUID,
  performed_by_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_audit_log_org ON public.role_audit_log(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_role_audit_log_target ON public.role_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_created ON public.role_audit_log(created_at DESC);

ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all role audit"
  ON public.role_audit_log FOR SELECT
  USING (public.has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org owners read org role audit"
  ON public.role_audit_log FOR SELECT
  USING (
    scope = 'organization'
    AND organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND public.has_role('organization'::app_role, auth.uid())
  );

-- 3) ORG_CUSTOM_ROLES
CREATE TABLE IF NOT EXISTS public.org_custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  base_role TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_org_custom_roles_org ON public.org_custom_roles(organization_id);
ALTER TABLE public.org_custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org owners manage custom roles"
  ON public.org_custom_roles FOR ALL
  USING (
    (organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()) AND public.has_role('organization'::app_role, auth.uid()))
    OR public.has_role('admin'::app_role, auth.uid())
  )
  WITH CHECK (
    (organization_id IN (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()) AND public.has_role('organization'::app_role, auth.uid()))
    OR public.has_role('admin'::app_role, auth.uid())
  );

CREATE POLICY "Org staff read custom roles"
  ON public.org_custom_roles FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM public.org_staff WHERE user_id = auth.uid())
  );

-- 4) Triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_staff_invitations_updated ON public.staff_invitations;
CREATE TRIGGER trg_staff_invitations_updated
  BEFORE UPDATE ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_org_custom_roles_updated ON public.org_custom_roles;
CREATE TRIGGER trg_org_custom_roles_updated
  BEFORE UPDATE ON public.org_custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.log_org_staff_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_name TEXT;
BEGIN
  SELECT COALESCE(full_name, email) INTO actor_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.role_audit_log (scope, organization_id, target_user_id, action, new_role, new_sections_access, performed_by, performed_by_name)
    VALUES ('organization', NEW.organization_id, NEW.user_id, 'granted', NEW.role, NEW.sections_access, auth.uid(), actor_name);
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.role IS DISTINCT FROM NEW.role) OR (OLD.sections_access IS DISTINCT FROM NEW.sections_access) THEN
      INSERT INTO public.role_audit_log (scope, organization_id, target_user_id, action, old_role, new_role, old_sections_access, new_sections_access, performed_by, performed_by_name)
      VALUES ('organization', NEW.organization_id, NEW.user_id, 'changed', OLD.role, NEW.role, OLD.sections_access, NEW.sections_access, auth.uid(), actor_name);
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.role_audit_log (scope, organization_id, target_user_id, action, old_role, old_sections_access, performed_by, performed_by_name)
    VALUES ('organization', OLD.organization_id, OLD.user_id, 'revoked', OLD.role, OLD.sections_access, auth.uid(), actor_name);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_log_org_staff_changes ON public.org_staff;
CREATE TRIGGER trg_log_org_staff_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.org_staff
  FOR EACH ROW EXECUTE FUNCTION public.log_org_staff_changes();

CREATE OR REPLACE FUNCTION public.log_admin_staff_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_name TEXT;
BEGIN
  SELECT COALESCE(full_name, email) INTO actor_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.role_audit_log (scope, target_user_id, target_email, target_name, action, new_role, performed_by, performed_by_name)
    VALUES ('admin', NEW.user_id, NEW.email, NEW.full_name, 'granted', NEW.role, auth.uid(), actor_name);
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO public.role_audit_log (scope, target_user_id, target_email, target_name, action, old_role, new_role, performed_by, performed_by_name)
      VALUES ('admin', NEW.user_id, NEW.email, NEW.full_name, 'changed', OLD.role, NEW.role, auth.uid(), actor_name);
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.role_audit_log (scope, target_user_id, target_email, target_name, action, old_role, performed_by, performed_by_name)
    VALUES ('admin', OLD.user_id, OLD.email, OLD.full_name, 'revoked', OLD.role, auth.uid(), actor_name);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_log_admin_staff_changes ON public.admin_staff;
CREATE TRIGGER trg_log_admin_staff_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_staff
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_staff_changes();

CREATE OR REPLACE FUNCTION public.expire_staff_invitations()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE updated_count INTEGER;
BEGIN
  UPDATE public.staff_invitations
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END $$;
