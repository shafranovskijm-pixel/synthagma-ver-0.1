-- Separate platform sales identities from org_staff compatibility profiles.
-- Additive security release: no business rows, global roles, manager identities,
-- table grants, account-deletion policies or new org_crm_* objects are changed.
-- Run as one transaction. Any preflight/DDL failure rolls back the whole release.
BEGIN;

DO $preflight$
DECLARE unexpected text;
BEGIN
  IF to_regprocedure('public.can_access_organization(uuid,text)') IS NULL
     OR to_regprocedure('public.account_deletion_access_allowed()') IS NULL
     OR to_regprocedure('public.is_org_owner(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'legacy_crm_access: canonical permission helpers required';
  END IF;
  -- Do not silently discard an unknown live policy. Its owner must review it.
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename,policyname)
    INTO unexpected FROM pg_policies
   WHERE schemaname='public' AND permissive='PERMISSIVE'
     AND tablename IN ('sales_leads','sales_tasks','sales_lead_activities')
     AND NOT (
       (tablename='sales_leads' AND policyname=ANY(ARRAY[
         'Admin full access to sales_leads','Sales managers see assigned leads',
         'Sales managers update assigned leads','Org members manage own sales_leads',
         'Sales managers see unassigned pool','sales_leads_sm_all']))
       OR (tablename='sales_tasks' AND policyname=ANY(ARRAY[
         'sales_tasks_select','sales_tasks_insert','sales_tasks_update','sales_tasks_delete',
         'sales_tasks_sm_select','sales_tasks_sm_insert','sales_tasks_sm_update','sales_tasks_sm_delete']))
       OR (tablename='sales_lead_activities' AND policyname=ANY(ARRAY[
         'Admin full access to lead_activities','Sales managers own activities',
         'Org members manage own lead_activities','sales_lead_activities_sm_all']))
     );
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'legacy_crm_access: unexpected permissive policies: %',unexpected;
  END IF;
END $preflight$;

-- Explicit actor helper for authenticated/service-role Edge handlers. An org
-- staff trigger-created sales_managers row alone NEVER establishes this role.
CREATE OR REPLACE FUNCTION public.is_platform_sales_manager(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
 SELECT _uid IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=_uid)
   AND EXISTS(SELECT 1 FROM public.sales_managers m WHERE m.user_id=_uid AND m.is_active)
   AND (public.has_role('sales_manager'::public.app_role,_uid)
        OR EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=_uid AND a.role='sales_manager'))
$fn$;
REVOKE ALL ON FUNCTION public.is_platform_sales_manager(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_platform_sales_manager(uuid) TO authenticated,service_role;

-- Keep the old signature, but give it the explicit platform meaning its old
-- policies incorrectly inferred from a compatibility row.
CREATE OR REPLACE FUNCTION public.is_active_sales_manager(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
 SELECT public.is_platform_sales_manager(_uid)
$fn$;
REVOKE ALL ON FUNCTION public.is_active_sales_manager(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_active_sales_manager(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.legacy_crm_access_allowed(_org_id uuid,_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL
   AND _permission IN('sales.read','sales.write')
   AND public.account_deletion_access_allowed()
   AND (public.has_role('admin'::public.app_role,auth.uid())
        OR (_org_id IS NULL AND public.is_platform_sales_manager(auth.uid()))
        OR (_org_id IS NOT NULL AND public.can_access_organization(_org_id,_permission)))
$fn$;
REVOKE ALL ON FUNCTION public.legacy_crm_access_allowed(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.legacy_crm_access_allowed(uuid,text) TO authenticated,service_role;

-- Preserve IDs used by proposals/contracts without promoting org staff to a
-- platform role. Re-evaluate all memberships, not just the row being removed.
-- Never let an organization admin activate/deactivate an independent platform
-- manager through an org_staff edit. The platform's own controls retain that job.
CREATE OR REPLACE FUNCTION public.sync_org_staff_to_sales_managers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE u uuid; users uuid[]; v_name text;
BEGIN
  IF TG_OP='DELETE' THEN users:=ARRAY[OLD.user_id];
  ELSIF TG_OP='UPDATE' THEN users:=ARRAY[OLD.user_id,NEW.user_id];
  ELSE users:=ARRAY[NEW.user_id]; END IF;
  FOR u IN SELECT DISTINCT x FROM unnest(users)x WHERE x IS NOT NULL LOOP
    IF public.has_role('admin'::public.app_role,u)
       OR public.has_role('sales_manager'::public.app_role,u)
       OR EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=u
                 AND a.role IN('sales_manager','admin','super_admin')) THEN
      CONTINUE;
    END IF;
    v_name:=NULL;
    SELECT COALESCE(NULLIF(s.display_name,''),NULLIF(p.full_name,''),p.email,'Сотрудник')
      INTO v_name FROM public.org_staff s LEFT JOIN public.profiles p ON p.user_id=s.user_id
     WHERE s.user_id=u AND (s.can_receive_crm_tasks OR s.role='sales_manager')
       AND (s.expires_at IS NULL OR s.expires_at>now())
       AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=u)
     ORDER BY s.organization_id LIMIT 1;
    IF v_name IS NOT NULL THEN
      INSERT INTO public.sales_managers(user_id,full_name,is_active) VALUES(u,v_name,true)
      ON CONFLICT(user_id) DO UPDATE SET full_name=EXCLUDED.full_name,is_active=true;
    ELSE
      UPDATE public.sales_managers SET is_active=false WHERE user_id=u;
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.sync_org_staff_to_sales_managers() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_sync_org_staff_to_sales_managers ON public.org_staff;
CREATE TRIGGER trg_sync_org_staff_to_sales_managers
AFTER INSERT OR UPDATE OF role,can_receive_crm_tasks,display_name,expires_at,user_id,organization_id OR DELETE
ON public.org_staff FOR EACH ROW EXECUTE FUNCTION public.sync_org_staff_to_sales_managers();

DROP POLICY IF EXISTS "Admin full access to sales_leads" ON public.sales_leads;
DROP POLICY IF EXISTS "Sales managers see assigned leads" ON public.sales_leads;
DROP POLICY IF EXISTS "Sales managers update assigned leads" ON public.sales_leads;
DROP POLICY IF EXISTS "Org members manage own sales_leads" ON public.sales_leads;
DROP POLICY IF EXISTS "Sales managers see unassigned pool" ON public.sales_leads;
DROP POLICY IF EXISTS sales_leads_sm_all ON public.sales_leads;
DROP POLICY IF EXISTS sales_tasks_select ON public.sales_tasks;
DROP POLICY IF EXISTS sales_tasks_insert ON public.sales_tasks;
DROP POLICY IF EXISTS sales_tasks_update ON public.sales_tasks;
DROP POLICY IF EXISTS sales_tasks_delete ON public.sales_tasks;
DROP POLICY IF EXISTS sales_tasks_sm_select ON public.sales_tasks;
DROP POLICY IF EXISTS sales_tasks_sm_insert ON public.sales_tasks;
DROP POLICY IF EXISTS sales_tasks_sm_update ON public.sales_tasks;
DROP POLICY IF EXISTS sales_tasks_sm_delete ON public.sales_tasks;
DROP POLICY IF EXISTS "Admin full access to lead_activities" ON public.sales_lead_activities;
DROP POLICY IF EXISTS "Sales managers own activities" ON public.sales_lead_activities;
DROP POLICY IF EXISTS "Org members manage own lead_activities" ON public.sales_lead_activities;
DROP POLICY IF EXISTS sales_lead_activities_sm_all ON public.sales_lead_activities;

-- A child must refer to a lead in the same scope, including NULL=platform.
-- The subquery uses the caller's RLS; it cannot expose foreign lead existence.
DO $policies$
DECLARE t text; related text; r text; w text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales_leads','sales_tasks','sales_lead_activities'] LOOP
    related:=CASE t
      WHEN 'sales_leads' THEN ''
      WHEN 'sales_tasks' THEN ' AND (lead_id IS NULL OR EXISTS(SELECT 1 FROM public.sales_leads l WHERE l.id=sales_tasks.lead_id AND l.organization_id IS NOT DISTINCT FROM sales_tasks.organization_id))'
      ELSE ' AND EXISTS(SELECT 1 FROM public.sales_leads l WHERE l.id=sales_lead_activities.lead_id AND l.organization_id IS NOT DISTINCT FROM sales_lead_activities.organization_id)'
    END;
    r:='public.legacy_crm_access_allowed(organization_id,''sales.read'')'||related;
    w:='public.legacy_crm_access_allowed(organization_id,''sales.write'')'||related;
    EXECUTE format('CREATE POLICY legacy_crm_read ON public.%I FOR SELECT TO authenticated USING(%s)',t,r);
    EXECUTE format('CREATE POLICY legacy_crm_insert ON public.%I FOR INSERT TO authenticated WITH CHECK(%s)',t,w);
    EXECUTE format('CREATE POLICY legacy_crm_update ON public.%I FOR UPDATE TO authenticated USING(%s) WITH CHECK(%s)',t,w,w);
    EXECUTE format('CREATE POLICY legacy_crm_delete ON public.%I FOR DELETE TO authenticated USING(%s)',t,w);
  END LOOP;
END $policies$;

-- A platform actor may also have a profile organization. Keep omitted lead
-- scope in the platform pool; organization UIs already pass an explicit scope.
-- Retain legacy organization auto-fill for non-platform callers, checked by RLS.
CREATE OR REPLACE FUNCTION public.set_legacy_crm_lead_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF NEW.organization_id IS NULL AND auth.uid() IS NOT NULL
     AND NOT (public.has_role('admin'::public.app_role,auth.uid())
              OR public.is_platform_sales_manager(auth.uid())) THEN
    NEW.organization_id:=public.current_organization_id();
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.set_legacy_crm_lead_scope() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_auto_org_sales_leads ON public.sales_leads;
CREATE TRIGGER trg_auto_org_sales_leads BEFORE INSERT ON public.sales_leads
FOR EACH ROW EXECUTE FUNCTION public.set_legacy_crm_lead_scope();

-- The former activity auto-fill used the caller's profile tenant even for a
-- platform lead. Derive scope from the referenced lead instead. No existing
-- activities are rewritten; mismatched old rows require separate review.
CREATE OR REPLACE FUNCTION public.set_legacy_crm_activity_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE lead_org uuid;
BEGIN
  SELECT l.organization_id INTO lead_org FROM public.sales_leads l WHERE l.id=NEW.lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'crm_lead_not_found' USING ERRCODE='23503'; END IF;
  IF NEW.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM lead_org THEN
    RAISE EXCEPTION 'crm_lead_scope_mismatch' USING ERRCODE='23514';
  END IF;
  NEW.organization_id:=lead_org;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.set_legacy_crm_activity_scope() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_auto_org_sales_lead_activities ON public.sales_lead_activities;
CREATE TRIGGER trg_auto_org_sales_lead_activities
BEFORE INSERT OR UPDATE OF lead_id,organization_id ON public.sales_lead_activities
FOR EACH ROW EXECUTE FUNCTION public.set_legacy_crm_activity_scope();

CREATE OR REPLACE FUNCTION public.list_org_task_assignees(_org_id uuid)
RETURNS TABLE(user_id uuid,full_name text,role text,email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF _org_id IS NULL OR NOT COALESCE(public.legacy_crm_access_allowed(_org_id,'sales.read'),false) THEN
    RAISE EXCEPTION 'crm_forbidden' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT s.user_id,COALESCE(NULLIF(s.display_name,''),p.full_name,p.email,'Сотрудник'),s.role,p.email
    FROM public.org_staff s LEFT JOIN public.profiles p ON p.user_id=s.user_id
   WHERE s.organization_id=_org_id AND s.can_receive_crm_tasks
     AND (s.expires_at IS NULL OR s.expires_at>now())
     AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=s.user_id)
  UNION
  SELECT p.user_id,COALESCE(p.full_name,p.email,'Владелец'),'owner'::text,p.email
    FROM public.profiles p WHERE p.organization_id=_org_id
     AND public.is_org_owner(p.user_id,_org_id)
     AND NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p.user_id AND s.organization_id=_org_id)
     AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=p.user_id);
END $fn$;
REVOKE ALL ON FUNCTION public.list_org_task_assignees(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_org_task_assignees(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.claim_sales_leads(_lead_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid:=auth.uid(); manager uuid; claimed_count integer;
BEGIN
  IF actor IS NULL OR NOT public.account_deletion_access_allowed()
     OR NOT (public.has_role('admin'::public.app_role,actor)
             OR public.is_platform_sales_manager(actor)) THEN
    RAISE EXCEPTION 'crm_forbidden' USING ERRCODE='42501';
  END IF;
  IF _lead_ids IS NULL OR cardinality(_lead_ids)=0 THEN RETURN 0; END IF;
  IF cardinality(_lead_ids)>2000 OR array_position(_lead_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'crm_invalid_lead_ids' USING ERRCODE='22023';
  END IF;
  SELECT m.id INTO manager FROM public.sales_managers m WHERE m.user_id=actor;
  IF manager IS NULL THEN
    -- Only a platform administrator may reach this branch. Never create a role.
    INSERT INTO public.sales_managers(user_id,full_name,is_active)
    VALUES(actor,COALESCE((SELECT NULLIF(p.full_name,'') FROM public.profiles p WHERE p.user_id=actor),'Менеджер'),true)
    ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id
    RETURNING id INTO manager;
  END IF;
  -- UPDATE rechecks its predicate after waiting on a concurrent claimant.
  -- Only rows changed by THIS call get a log; replays return 0 without duplicates.
  WITH claimed AS (
    UPDATE public.sales_leads SET assigned_manager_id=manager,status='in_progress',updated_at=now()
     WHERE id=ANY(_lead_ids) AND organization_id IS NULL
       AND assigned_manager_id IS NULL AND status='new'
    RETURNING id
  ), logged AS (
    INSERT INTO public.sales_lead_activities(lead_id,manager_id,activity_type,description,organization_id)
    SELECT id,manager,'status_change','Лид взят из общего пула',NULL::uuid FROM claimed
    RETURNING id
  ) SELECT count(*)::integer INTO claimed_count FROM logged;
  RETURN claimed_count;
END $fn$;
REVOKE ALL ON FUNCTION public.claim_sales_leads(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_sales_leads(uuid[]) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
