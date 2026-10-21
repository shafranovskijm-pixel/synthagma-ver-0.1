-- Administrative all-feature access is not an invoice tier or paid-addon consent.
-- Exactly two existing functions change; ACLs, ownership, signatures and auth fences stay intact.
BEGIN;
DO $sgt_feature_preflight$
DECLARE item jsonb;
BEGIN
 FOR item IN SELECT * FROM jsonb_array_elements('[{"signature":"get_postpaid_access_profile(uuid)","before":"4a87dc476576656ac0ac76b7f406b87e","after":"3be9c5b19c43ad418bac41ac5e4b2ddc"},{"signature":"org_crm_access_allowed(uuid,text)","before":"581c8acc857443da12d98579385b98f5","after":"e0168876ea0f59b8db87bb99393398bc"}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('public.'||(item->>'signature')) AND md5(p.prosrc)=item->>'before')
  THEN RAISE EXCEPTION 'PLATFORM_FEATURE_GRANT_PREDECESSOR_CHANGED'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('public.guard_organization_course_quota_config()') AND md5(p.prosrc)='6c23dce5cd36bb24b8282771c05d96a1')
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_attribute a ON a.attrelid=t.tgrelid AND a.attname='custom_enabled_categories'
 WHERE t.tgrelid='public.organizations'::regclass AND t.tgname='guard_organization_course_quota_config' AND t.tgenabled='O'
 AND t.tgfoid='public.guard_organization_course_quota_config()'::regprocedure AND t.tgtype=19 AND a.attnum=ANY(t.tgattr::smallint[]))
 THEN RAISE EXCEPTION 'PLATFORM_FEATURE_GRANT_ADMIN_GUARD_CHANGED'; END IF;
END $sgt_feature_preflight$;
CREATE TEMP TABLE platform_feature_grant_old_function_metadata_20261021 ON COMMIT DROP AS
 SELECT p.oid,to_jsonb(p)-'prosrc' AS metadata FROM pg_catalog.pg_proc p
 WHERE p.oid IN('public.get_postpaid_access_profile(uuid)'::regprocedure,'public.org_crm_access_allowed(uuid,text)'::regprocedure);

CREATE OR REPLACE FUNCTION public.get_postpaid_access_profile(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE active boolean; features jsonb; all_features boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.postpaid_is_admin() AND
  (auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() OR NOT (
   COALESCE(public.can_access_organization(p_organization_id,'settings.read'),false) OR COALESCE(public.can_access_organization(p_organization_id,'students.read'),false)
   OR COALESCE(public.can_access_organization(p_organization_id,'students.write'),false) OR COALESCE(public.can_access_organization(p_organization_id,'courses.read'),false)
   OR COALESCE(public.can_access_organization(p_organization_id,'courses.write'),false) OR COALESCE(public.can_access_organization(p_organization_id,'sales.read'),false)
   OR EXISTS(SELECT 1 FROM public.profiles p JOIN public.enrollments e ON e.user_id=p.user_id JOIN public.courses c ON c.id=e.course_id
     WHERE p.user_id=auth.uid() AND p.organization_id=p_organization_id AND c.organization_id=p_organization_id AND public.can_access_course_as_learner(c.id))))
 THEN RAISE EXCEPTION 'Organization access required' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.organization_billing_agreements WHERE organization_id=p_organization_id
 AND effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date AND (effective_to IS NULL OR effective_to>(now() AT TIME ZONE 'Europe/Moscow')::date)) INTO active;
 SELECT jsonb_build_object('crm',COALESCE(bool_or(feature='crm'),false),'webinar',COALESCE(bool_or(feature='webinar'),false),
 'videoserviceplus',COALESCE(bool_or(feature='videoserviceplus'),false),'frdoplus',COALESCE(bool_or(feature='frdoplus'),false)) INTO features
 FROM public.postpaid_feature_confirmations WHERE active AND organization_id=p_organization_id AND confirmed_at<=now() AND (effective_to IS NULL OR effective_to>now());
 SELECT COALESCE(active AND 'platform_all_features'=ANY(o.custom_enabled_categories),false) INTO all_features
 FROM public.organizations o WHERE o.id=p_organization_id;
 -- Administrative entitlement is separate from paid-feature confirmations.
 RETURN jsonb_build_object('entitlements',jsonb_build_object('all_platform_features',COALESCE(all_features,false)),
 'organization_id',p_organization_id,'active',active,'billing_mode',CASE WHEN active THEN 'postpaid' ELSE 'prepaid' END,
 'limits',CASE WHEN active THEN jsonb_build_object('maxCourses',-1,'maxStudents',-1,'maxTrainedStudents',-1,'maxStorageBytes',-1,'maxAiGenerations',-1) ELSE NULL END,'features',features);
END $function$;

CREATE OR REPLACE FUNCTION public.org_crm_access_allowed(p_organization_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL AND p_permission IN('sales.read','sales.write')
 AND public.account_deletion_access_allowed()
 AND public.can_access_organization(p_organization_id,p_permission)
 AND EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_organization_id
   AND CASE WHEN EXISTS (
     SELECT 1 FROM public.organization_billing_agreements agreement
     WHERE agreement.organization_id=o.id
       AND agreement.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date
       AND (agreement.effective_to IS NULL OR agreement.effective_to>(now() AT TIME ZONE 'Europe/Moscow')::date)
   ) THEN (COALESCE('platform_all_features'=ANY(o.custom_enabled_categories),false) OR EXISTS (
     SELECT 1 FROM public.postpaid_feature_confirmations confirmation
     WHERE confirmation.organization_id=o.id AND confirmation.feature='crm'
       AND confirmation.notified_at<=confirmation.confirmed_at
       AND confirmation.confirmed_at<=now()
       AND (confirmation.effective_to IS NULL OR confirmation.effective_to>now())
   )) ELSE o.subscription_plan::text IN('standard','professional','maximum') END)
$function$;

DO $sgt_feature_postflight$
DECLARE item jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.platform_feature_grant_old_function_metadata_20261021 old
 LEFT JOIN pg_catalog.pg_proc p ON p.oid=old.oid WHERE p.oid IS NULL OR(to_jsonb(p)-'prosrc') IS DISTINCT FROM old.metadata)
 THEN RAISE EXCEPTION 'PLATFORM_FEATURE_GRANT_FUNCTION_METADATA_CHANGED'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements('[{"signature":"get_postpaid_access_profile(uuid)","before":"4a87dc476576656ac0ac76b7f406b87e","after":"3be9c5b19c43ad418bac41ac5e4b2ddc"},{"signature":"org_crm_access_allowed(uuid,text)","before":"581c8acc857443da12d98579385b98f5","after":"e0168876ea0f59b8db87bb99393398bc"}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('public.'||(item->>'signature')) AND md5(p.prosrc)=item->>'after')
  THEN RAISE EXCEPTION 'PLATFORM_FEATURE_GRANT_SOURCE_MISMATCH'; END IF;
 END LOOP;
END $sgt_feature_postflight$;
COMMIT;
