CREATE OR REPLACE FUNCTION public.transfer_org_ownership_atomic(
  p_organization_id uuid,
  p_new_owner_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_name text;
  v_target_display_name text;
  v_target_full_name text;
  v_target_email text;
  v_target_profile_org uuid;
  v_target_global_role public.app_role;
  v_owner_count integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_new_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Organization and new owner are required' USING ERRCODE = '22004';
  END IF;
  IF p_new_owner_user_id = v_caller THEN
    RAISE EXCEPTION 'New owner must be another user' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.organizations
  WHERE id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_org_owner(v_caller, p_organization_id) THEN
    RAISE EXCEPTION 'Only the current owner can transfer ownership'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_owner_count
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role = 'organization'::public.app_role
    AND p.organization_id = p_organization_id;
  IF v_owner_count <> 1 THEN
    RAISE EXCEPTION 'Organization ownership is inconsistent; transfer requires manual repair'
      USING ERRCODE = '23514';
  END IF;

  SELECT full_name INTO v_caller_name
  FROM public.profiles
  WHERE user_id = v_caller;

  SELECT os.display_name, p.full_name, p.email, p.organization_id, ur.role
    INTO v_target_display_name, v_target_full_name, v_target_email,
         v_target_profile_org, v_target_global_role
  FROM public.org_staff os
  JOIN public.profiles p ON p.user_id = os.user_id
  JOIN public.user_roles ur ON ur.user_id = os.user_id
  JOIN auth.users au ON au.id = os.user_id
  WHERE os.organization_id = p_organization_id
    AND os.user_id = p_new_owner_user_id
    AND os.role IN ('admin', 'school_editor')
    AND (os.expires_at IS NULL OR os.expires_at > now())
  FOR UPDATE OF os, p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'New owner must be an active administrator or school editor of this organization'
      USING ERRCODE = '23514';
  END IF;

  IF v_target_global_role <> 'student'::public.app_role
     OR (v_target_profile_org IS NOT NULL AND v_target_profile_org <> p_organization_id)
  THEN
    RAISE EXCEPTION 'New owner must be a student-role account without another organization identity'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.profiles
  SET organization_id = p_organization_id
  WHERE user_id = p_new_owner_user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_new_owner_user_id, 'organization'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.user_roles
  SET role = 'student'::public.app_role
  WHERE user_id = v_caller
    AND role = 'organization'::public.app_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Current owner role is inconsistent' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.org_staff (
    organization_id, user_id, role, display_name, visibility
  ) VALUES (
    p_organization_id,
    v_caller,
    'admin',
    COALESCE(NULLIF(v_caller_name, ''), 'Бывший владелец'),
    'all'
  )
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin';

  DELETE FROM public.org_staff
  WHERE organization_id = p_organization_id
    AND user_id = p_new_owner_user_id;

  INSERT INTO public.role_audit_log (
    scope, organization_id, target_user_id, target_name, target_email,
    action, old_role, new_role, performed_by, performed_by_name, details
  ) VALUES (
    'organization',
    p_organization_id,
    p_new_owner_user_id,
    COALESCE(v_target_display_name, v_target_full_name),
    v_target_email,
    'granted',
    NULL,
    'owner',
    v_caller,
    v_caller_name,
    jsonb_build_object('type', 'ownership_transfer', 'from_user_id', v_caller)
  );

  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.transfer_org_ownership_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_org_ownership_atomic(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_org_ownership_atomic(uuid, uuid) TO authenticated;
