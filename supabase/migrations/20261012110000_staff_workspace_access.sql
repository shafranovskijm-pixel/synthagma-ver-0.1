-- Staff workspace access. Prepared offline; live definitions must be reviewed
-- with docs/releases/sintagma-production/staff-workspace-20261012/preflight.sql.
-- No business rows, global roles, profile identities or current_organization_id
-- are changed. Preserve company-owner policies and account-deletion fences.

DO $prerequisites$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.can_access_organization(uuid,text)',
    'public.has_org_staff_permission(uuid,uuid,text)',
    'public.get_org_staff_permissions(uuid,uuid)',
    'public.normalize_org_staff_permission(text)',
    'public.has_role(public.app_role,uuid)',
    'public.has_role(uuid,public.app_role)',
    'public.is_org_owner(uuid,uuid)',
    'public.account_deletion_access_allowed()',
    'public.get_organization_core(uuid)',
    'public.org_role_default_permissions(text)'
  ] LOOP
    IF to_regprocedure(signature) IS NULL THEN
      RAISE EXCEPTION 'Staff workspace prerequisite missing: %', signature;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('companies'), ('labor_safety_groups'), ('labor_safety_records')) t(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t.name AND c.relrowsecurity
    )
  ) THEN RAISE EXCEPTION 'Staff workspace requires existing RLS tables'; END IF;
  -- A signature alone is insufficient: the older helper trusted every profile
  -- as an organization owner. Reject an unreviewed live definition, including
  -- a semantically harmless change, until its body is explicitly re-reviewed.
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.can_access_organization(uuid,text)','ad720ba20dc32362ed009b2917cc2d9c'),
      ('public.is_org_owner(uuid,uuid)','5894db724b2a3cbc52701cabfb2cf73c'),
      ('public.has_org_staff_permission(uuid,uuid,text)','b9c87ca03c3e95a57baf9122753792e2'),
      ('public.get_org_staff_permissions(uuid,uuid)','f8d82709ae27730782dc4f455b35b7de'),
      ('public.account_deletion_access_allowed()','6c078d0f1aa1f6b5af15485f0eaccb2a')
    ) expected(signature,body_md5)
    LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
    WHERE p.oid IS NULL OR md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))<>expected.body_md5
  ) THEN RAISE EXCEPTION 'Unreviewed staff access helper; inspect live definitions before applying'; END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('companies'),('labor_safety_groups'),('labor_safety_records')) t(name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public'
      AND p.tablename=t.name AND p.policyname='account_deletion_no_revoked_access'
      AND p.permissive='RESTRICTIVE' AND p.cmd='ALL')
  ) THEN RAISE EXCEPTION 'Required account-deletion restrictive policy missing'; END IF;
END;
$prerequisites$;

-- Mirror the existing frontend matrix. Only the previously missing teacher
-- library.read and sales_manager defaults differ from the preceding SQL body.
CREATE OR REPLACE FUNCTION public.org_role_default_permissions(_role text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public
AS $function$
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

-- Limited shell metadata; never expand SELECT organizations to all columns.
-- Preserve a genuine learner's existing access to their own school. An expired
-- staff row cannot use a coinciding profile organization to restore staff access.
CREATE OR REPLACE FUNCTION public.get_organization_core(p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_org record;
BEGIN
  IF v_caller IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'Not authenticated or account access revoked' USING ERRCODE='42501';
  END IF;
  IF p_org_id IS NULL OR NOT (
    public.has_role('admin'::public.app_role, v_caller)
    OR public.is_org_owner(v_caller, p_org_id)
    OR EXISTS (
      SELECT 1 FROM public.org_staff s
      WHERE s.user_id=v_caller AND s.organization_id=p_org_id
        AND (s.expires_at IS NULL OR s.expires_at>now())
    )
    OR (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=v_caller AND p.organization_id=p_org_id)
      AND NOT EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id=v_caller AND s.organization_id=p_org_id)
    )
  ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
  END IF;
  SELECT id, name, description, branding, menu_settings,
         student_dashboard_settings, subscription_plan,
         custom_enabled_categories, frdo_enabled
    INTO v_org FROM public.organizations WHERE id=p_org_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id',v_org.id,'name',v_org.name,'description',v_org.description,
    'branding',v_org.branding,'menu_settings',v_org.menu_settings,
    'student_dashboard_settings',v_org.student_dashboard_settings,
    'subscription_plan',v_org.subscription_plan,
    'custom_enabled_categories',v_org.custom_enabled_categories,
    'frdo_enabled',v_org.frdo_enabled
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_organization_core(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_core(uuid) TO authenticated, service_role;

-- Replace only the two legacy organization-wide policies. Company-owner
-- SELECT/UPDATE and any restrictive account-deletion policy stay untouched.
DROP POLICY IF EXISTS "Org users can manage their companies" ON public.companies;
DROP POLICY IF EXISTS "Org users can view their companies" ON public.companies;
CREATE POLICY "Org staff can read companies" ON public.companies
  FOR SELECT TO authenticated
  USING (public.can_access_organization(organization_id,'companies.read'));
CREATE POLICY "Org staff can insert companies" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_organization(organization_id,'companies.write'));
CREATE POLICY "Org staff can update companies" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.can_access_organization(organization_id,'companies.write'))
  WITH CHECK (public.can_access_organization(organization_id,'companies.write'));
CREATE POLICY "Org staff can delete companies" ON public.companies
  FOR DELETE TO authenticated
  USING (public.can_access_organization(organization_id,'companies.write'));

-- Replace the eight named legacy OT policies; other policies are not touched.
DROP POLICY IF EXISTS "Users can view labor safety groups of their organization" ON public.labor_safety_groups;
CREATE POLICY "Users can view labor safety groups of their organization"
  ON public.labor_safety_groups FOR SELECT TO authenticated
  USING (public.can_access_organization(organization_id,'labor_safety.read'));
DROP POLICY IF EXISTS "Users can create labor safety groups in their organization" ON public.labor_safety_groups;
CREATE POLICY "Users can create labor safety groups in their organization"
  ON public.labor_safety_groups FOR INSERT TO authenticated
  WITH CHECK (public.can_access_organization(organization_id,'labor_safety.write'));
DROP POLICY IF EXISTS "Users can update labor safety groups in their organization" ON public.labor_safety_groups;
CREATE POLICY "Users can update labor safety groups in their organization"
  ON public.labor_safety_groups FOR UPDATE TO authenticated
  USING (public.can_access_organization(organization_id,'labor_safety.write'))
  WITH CHECK (public.can_access_organization(organization_id,'labor_safety.write'));
DROP POLICY IF EXISTS "Users can delete labor safety groups in their organization" ON public.labor_safety_groups;
CREATE POLICY "Users can delete labor safety groups in their organization"
  ON public.labor_safety_groups FOR DELETE TO authenticated
  USING (public.can_access_organization(organization_id,'labor_safety.write'));

DROP POLICY IF EXISTS "Users can view labor safety records" ON public.labor_safety_records;
CREATE POLICY "Users can view labor safety records"
  ON public.labor_safety_records FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.labor_safety_groups g WHERE g.id=group_id
    AND public.can_access_organization(g.organization_id,'labor_safety.read')));
DROP POLICY IF EXISTS "Users can create labor safety records" ON public.labor_safety_records;
CREATE POLICY "Users can create labor safety records"
  ON public.labor_safety_records FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.labor_safety_groups g WHERE g.id=group_id
    AND public.can_access_organization(g.organization_id,'labor_safety.write')));
DROP POLICY IF EXISTS "Users can update labor safety records" ON public.labor_safety_records;
CREATE POLICY "Users can update labor safety records"
  ON public.labor_safety_records FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.labor_safety_groups g WHERE g.id=group_id
    AND public.can_access_organization(g.organization_id,'labor_safety.write')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.labor_safety_groups g WHERE g.id=group_id
    AND public.can_access_organization(g.organization_id,'labor_safety.write')));
DROP POLICY IF EXISTS "Users can delete labor safety records" ON public.labor_safety_records;
CREATE POLICY "Users can delete labor safety records"
  ON public.labor_safety_records FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.labor_safety_groups g WHERE g.id=group_id
    AND public.can_access_organization(g.organization_id,'labor_safety.write')));

NOTIFY pgrst, 'reload schema';
