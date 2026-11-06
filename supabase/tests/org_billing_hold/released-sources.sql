-- Released production source: account_deletion_access_allowed(); pg_get_functiondef MD5 64b0a90b7db9813950ccca6dff208f3a
CREATE OR REPLACE FUNCTION public.account_deletion_access_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid());
$function$;

-- Released production source: can_access_organization(uuid,text); pg_get_functiondef MD5 2e11495f3d3e6ca261af8a08ed874269
CREATE OR REPLACE FUNCTION public.can_access_organization(_organization_id uuid, _permission text DEFAULT 'settings.read'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _organization_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.profiles p ON p.user_id = ur.user_id
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'organization'::public.app_role
          AND p.organization_id = _organization_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.org_staff os
            WHERE os.user_id = auth.uid()
              AND os.organization_id = _organization_id
          )
      )
      OR (
        _permission IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.org_staff os
          WHERE os.user_id = auth.uid()
            AND os.organization_id = _organization_id
            AND (os.expires_at IS NULL OR os.expires_at > now())
        )
        AND public.has_org_staff_permission(auth.uid(), _organization_id, _permission)
      )
    )
$function$;

-- Released production source: is_user_blocked(uuid); pg_get_functiondef MD5 dc02aff89341bb5e29c09da37d4c5c0e
CREATE OR REPLACE FUNCTION public.is_user_blocked(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = _user_id AND blocked_at IS NOT NULL
  );
$function$;

-- Released production source: has_role(app_role,uuid); pg_get_functiondef MD5 20c46f708cc2e7fa51b640290151a59e
CREATE OR REPLACE FUNCTION public.has_role(_role app_role, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
END;
$function$;

-- Released production source: has_role(uuid,app_role); pg_get_functiondef MD5 82a7fa1cd06301bb83b010bc315aee0b
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$function$;

-- Released production source: can_access_course_as_learner(uuid); pg_get_functiondef MD5 52ace2cdf4ec9928758d5597aef745c8
CREATE OR REPLACE FUNCTION public.can_access_course_as_learner(_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    JOIN public.profiles p
      ON p.user_id = e.user_id
     AND p.organization_id = c.organization_id
    WHERE e.user_id = auth.uid()
      AND e.course_id = _course_id
      AND e.status IN ('active', 'completed')
      AND NOT public.uc_enrollment_is_withdrawn(e.id)
      -- Keep the existing SINTAGMA enrollment contract: completion preserves
      -- course access even when the original access period has elapsed.
      AND (
        e.expires_at IS NULL
        OR e.expires_at > now()
        OR e.status = 'completed'
      )
  )
$function$;

-- Released production source: get_user_role(uuid); pg_get_functiondef MD5 7cdd82d7dc9b614e7609419972ae4e8d
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
 RETURNS app_role
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Released production source: has_org_staff_permission(uuid,uuid,text); pg_get_functiondef MD5 3d1fedafe94778fa19dd47acb71a3782
CREATE OR REPLACE FUNCTION public.has_org_staff_permission(_user_id uuid, _organization_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH perms AS (
    SELECT unnest(public.get_org_staff_permissions(_user_id, _organization_id)) AS permission
  )
  SELECT EXISTS (
    SELECT 1
    FROM perms
    WHERE permission = _permission
       OR permission = public.normalize_org_staff_permission(_permission)
       OR public.normalize_org_staff_permission(permission) = public.normalize_org_staff_permission(_permission)
  )
$function$;

-- Released production source: is_org_owner(uuid,uuid); pg_get_functiondef MD5 362aca6afc26c775be594843258b2ab2
CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id uuid, _organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'organization'::public.app_role
      AND p.organization_id = _organization_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.org_staff os
        WHERE os.user_id = _user_id
          AND os.organization_id = _organization_id
      )
  )
$function$;

-- Released production source: transfer_org_ownership_atomic(uuid,uuid); pg_get_functiondef MD5 76bc41ea880561e4470497694bd9de2f
CREATE OR REPLACE FUNCTION public.transfer_org_ownership_atomic(p_organization_id uuid, p_new_owner_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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


