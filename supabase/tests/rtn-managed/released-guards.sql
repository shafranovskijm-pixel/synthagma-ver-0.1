-- Exact pg_get_functiondef read-only capture 2026-11-14. No live JWT or DML.
CREATE OR REPLACE FUNCTION billing_access_private.actor_allowed(p_actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=p_actor)
 AND(
  p_actor IS NULL
  OR EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_actor AND ur.role='admin'::public.app_role)
  OR NOT EXISTS(SELECT 1 FROM public.profiles p JOIN billing_access_private.active_holds h ON h.organization_id=p.organization_id
     WHERE p.user_id=p_actor)
 )
$function$;

CREATE OR REPLACE FUNCTION billing_access_private.target_allowed(p_organization_id uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT billing_access_private.actor_allowed(p_actor) AND(
  EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_actor AND ur.role='admin'::public.app_role)
  OR NOT EXISTS(SELECT 1 FROM billing_access_private.active_holds h WHERE h.organization_id=p_organization_id)
 )
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_role app_role, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN billing_access_private.actor_allowed(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT billing_access_private.actor_allowed(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$function$;

CREATE OR REPLACE FUNCTION public.account_deletion_access_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid())
   AND billing_access_private.actor_allowed(auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.normalize_org_staff_permission(_permission text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _permission IS NULL THEN NULL
    WHEN _permission LIKE '%.view'   THEN regexp_replace(_permission, '\.view$',   '.read')
    WHEN _permission LIKE '%.manage' THEN regexp_replace(_permission, '\.manage$', '.write')
    ELSE _permission
  END
$function$;

CREATE OR REPLACE FUNCTION public.org_role_default_permissions(_role text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _role
    WHEN 'owner' THEN ARRAY[
      'courses.read','courses.write','students.read','students.write',
      'companies.read','companies.write','library.read','library.write',
      'documents.read','documents.write','documents.sign','documents.issue','journals.read','journals.write',
      'frdo.read','frdo.write','labor_safety.read','labor_safety.write',
      'services.read','services.write','staff.read','staff.write',
      'billing.read','billing.write','settings.read','settings.write',
      'chats.read','chats.write','homework.read','homework.write',
      'webinars.read','webinars.write','sales.read','sales.write'
    ]
    WHEN 'admin' THEN ARRAY[
      'courses.read','courses.write','students.read','students.write',
      'companies.read','companies.write','library.read','library.write',
      'documents.read','documents.write','documents.sign','documents.issue','journals.read','journals.write',
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
      'courses.read','students.read','library.read','chats.read','chats.write',
      'homework.read','homework.write','documents.read','journals.read'
    ]
    WHEN 'sales_manager' THEN ARRAY[
      'sales.read','sales.write','companies.read','companies.write',
      'services.read','documents.read','chats.read','chats.write','students.read'
    ]
    ELSE ARRAY[]::text[]
  END
$function$;

CREATE OR REPLACE FUNCTION public.get_org_staff_permissions(_user_id uuid, _organization_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.has_org_staff_permission(_user_id uuid, _organization_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH perms AS (
    SELECT unnest(public.get_org_staff_permissions(_user_id, _organization_id)) AS permission
  )
  SELECT billing_access_private.target_allowed(_organization_id,_user_id) AND EXISTS (
    SELECT 1
    FROM perms
    WHERE permission = _permission
       OR permission = public.normalize_org_staff_permission(_permission)
       OR public.normalize_org_staff_permission(permission) = public.normalize_org_staff_permission(_permission)
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_access_organization(_organization_id uuid, _permission text DEFAULT 'settings.read'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.account_deletion_access_allowed()
    AND billing_access_private.target_allowed(_organization_id,auth.uid())
    AND _organization_id IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.is_student_profile(_target_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _target_user_id IS NOT NULL
    AND _org_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _target_user_id
        AND role IN ('admin', 'organization', 'company', 'sales_manager')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.org_staff
      WHERE user_id = _target_user_id
        AND organization_id = _org_id
        AND (expires_at IS NULL OR expires_at > now())
    );
$function$;

CREATE OR REPLACE FUNCTION public.postpaid_is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL AND public.has_role('admin'::public.app_role,auth.uid())
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.has_active_postpaid_agreement(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.postpaid_is_admin()
 AND (auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() OR NOT COALESCE(public.can_access_organization(p_organization_id,'settings.read'),false))
 THEN RAISE EXCEPTION 'Organization billing access required' USING ERRCODE='42501'; END IF;
 RETURN EXISTS(SELECT 1 FROM public.organization_billing_agreements WHERE organization_id=p_organization_id
  AND effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date AND (effective_to IS NULL OR effective_to>(now() AT TIME ZONE 'Europe/Moscow')::date));
END $function$;
