-- 1) Helper: настоящий владелец организации
CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id uuid, _organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'organization'
      AND p.organization_id = _organization_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_org_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_owner(uuid, uuid) TO authenticated, service_role;

-- 2) Атомарное принятие приглашения сотрудника организации (только service_role)
CREATE OR REPLACE FUNCTION public.accept_org_staff_invitation(
  _token text,
  _user_id uuid,
  _user_email text,
  _display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  inv public.staff_invitations%ROWTYPE;
BEGIN
  IF v_claim_role <> 'service_role' AND current_user <> 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Недостаточно прав');
  END IF;

  IF _token IS NULL OR _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_REQUEST', 'message', 'Некорректный запрос');
  END IF;

  SELECT * INTO inv
  FROM public.staff_invitations
  WHERE token = _token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Приглашение не найдено');
  END IF;

  IF inv.invitation_type <> 'organization' OR inv.organization_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_TYPE', 'message', 'Тип приглашения не поддерживается');
  END IF;

  -- idempotent success
  IF inv.accepted_at IS NOT NULL THEN
    IF inv.accepted_user_id = _user_id THEN
      RETURN jsonb_build_object('ok', true, 'already', true, 'organization_id', inv.organization_id, 'role', inv.role);
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_ACCEPTED', 'message', 'Приглашение уже принято');
  END IF;

  IF inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EXPIRED', 'message', 'Срок действия приглашения истёк');
  END IF;

  IF coalesce(inv.status, 'pending') NOT IN ('pending', 'sent') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVOKED', 'message', 'Приглашение отозвано');
  END IF;

  IF lower(trim(coalesce(_user_email, ''))) <> lower(trim(inv.email)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EMAIL_MISMATCH', 'message', 'Приглашение оформлено на другой адрес');
  END IF;

  IF inv.role = 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OWNER_FORBIDDEN', 'message', 'Роль «Владелец» нельзя выдать через приглашение');
  END IF;

  INSERT INTO public.org_staff (organization_id, user_id, role, display_name, sections_access, visibility)
  VALUES (
    inv.organization_id,
    _user_id,
    inv.role,
    coalesce(nullif(trim(coalesce(_display_name, '')), ''), inv.full_name, inv.email),
    inv.sections_access,
    'all'
  )
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        sections_access = EXCLUDED.sections_access,
        display_name = coalesce(public.org_staff.display_name, EXCLUDED.display_name);

  UPDATE public.staff_invitations
  SET accepted_at = now(),
      accepted_user_id = _user_id,
      status = 'accepted'
  WHERE id = inv.id;

  RETURN jsonb_build_object('ok', true, 'already', false, 'organization_id', inv.organization_id, 'role', inv.role);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_org_staff_invitation(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_org_staff_invitation(text, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.accept_org_staff_invitation(text, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_org_staff_invitation(text, uuid, text, text) TO service_role;

-- 3) Определение рабочего кабинета: активный org_staff -> organization (без глобальной роли)
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = _user_id LIMIT 1;

  IF v_role = 'admin' THEN
    RETURN 'admin';
  END IF;

  IF v_role = 'organization' THEN
    RETURN 'organization';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.org_staff s
    WHERE s.user_id = _user_id
      AND (s.expires_at IS NULL OR s.expires_at > now())
  ) THEN
    RETURN 'organization'::app_role;
  END IF;

  RETURN v_role;
END;
$$;