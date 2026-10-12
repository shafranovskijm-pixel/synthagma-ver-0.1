-- Run as ONE SQL editor request. Exact source, rollback on any drift/check/ledger error.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $ledger$ BEGIN IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012200000') THEN RAISE EXCEPTION 'CRM release replay refused'; END IF; END $ledger$;
DO $preflight$
DECLARE r jsonb; t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['org_crm_clients','org_crm_deals','org_crm_tasks','org_crm_activities'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN RAISE EXCEPTION 'CRM table already exists: %',t; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'org_crm_%') THEN RAISE EXCEPTION 'CRM function namespace already exists'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements('[{"signature":"account_deletion_access_allowed()","body_md5":"6c078d0f1aa1f6b5af15485f0eaccb2a","definition_md5":"64b0a90b7db9813950ccca6dff208f3a","acl":["anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"can_access_organization(uuid,text)","body_md5":"ad720ba20dc32362ed009b2917cc2d9c","definition_md5":"2e11495f3d3e6ca261af8a08ed874269","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"get_org_staff_permissions(uuid,uuid)","body_md5":"f8d82709ae27730782dc4f455b35b7de","definition_md5":"c0ea40b20bbd1a71aa31cdbcbb7fc0b3","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"has_org_staff_permission(uuid,uuid,text)","body_md5":"b9c87ca03c3e95a57baf9122753792e2","definition_md5":"3d1fedafe94778fa19dd47acb71a3782","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"has_role(app_role,uuid)","body_md5":"5457df2171dee5cee3641e64285928f2","definition_md5":"20c46f708cc2e7fa51b640290151a59e","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"has_role(uuid,app_role)","body_md5":"4e852b30ef52ba5263c4e11d1aec8cf0","definition_md5":"82a7fa1cd06301bb83b010bc315aee0b","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"is_org_owner(uuid,uuid)","body_md5":"5894db724b2a3cbc52701cabfb2cf73c","definition_md5":"362aca6afc26c775be594843258b2ab2","acl":["anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"normalize_org_staff_permission(text)","body_md5":"2d47924fe022372f2dc128a979d56a53","definition_md5":"bb385c2b288bb966297a8504df1696ea","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"org_role_default_permissions(text)","body_md5":"2e440ec2b8552f215d00bd88ad7af166","definition_md5":"f2b39953a0c439d75079d72d5e103247","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"account_deletion_snapshot(uuid)","body_md5":"9b79f03eac8b32d3625d52e507365bc1","definition_md5":"be727630b1869bd977f9ca482f2c2e28","acl":["postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||(r->>'signature'))
   AND md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=r->>'body_md5'
   AND md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))=r->>'definition_md5'
   AND COALESCE((SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl) a),'null'::jsonb)=r->'acl') THEN RAISE EXCEPTION 'CRM helper drift: %',r->>'signature'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements('[{"table":"organizations","name":"id","type":"uuid"},{"table":"organizations","name":"subscription_plan","type":"text"},{"table":"org_staff","name":"user_id","type":"uuid"},{"table":"org_staff","name":"organization_id","type":"uuid"},{"table":"org_staff","name":"display_name","type":"text"},{"table":"org_staff","name":"role","type":"text"},{"table":"org_staff","name":"expires_at","type":"timestamp with time zone"},{"table":"org_staff","name":"can_receive_crm_tasks","type":"boolean"},{"table":"profiles","name":"user_id","type":"uuid"},{"table":"profiles","name":"organization_id","type":"uuid"},{"table":"profiles","name":"full_name","type":"text"}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||(r->>'table')) AND a.attname=r->>'name'
   AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)=r->>'type') THEN RAISE EXCEPTION 'CRM prerequisite column drift: %.%',r->>'table',r->>'name'; END IF;
 END LOOP;
 IF to_regclass('auth.users') IS NULL OR to_regclass('public.account_deletion_revocations') IS NULL THEN RAISE EXCEPTION 'CRM prerequisite relation missing'; END IF;
END $preflight$;
CREATE TEMP TABLE org_crm_security_before ON COMMIT DROP AS SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',CASE WHEN p.proname='account_deletion_snapshot' THEN NULL ELSE md5(pg_get_functiondef(p.oid)) END,'owner',p.proowner,'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' AND p.proname NOT LIKE 'org_crm_%'),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'owner',relowner,'acl',relacl,'rls',relrowsecurity,'force',relforcerowsecurity) ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname NOT LIKE 'org_crm_%'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename NOT LIKE 'org_crm_%'),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY tgrelid,tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND c.relname NOT LIKE 'org_crm_%' AND NOT tgisinternal)
) AS security_snapshot;
CREATE TEMP TABLE org_crm_release_result(result jsonb) ON COMMIT PRESERVE ROWS;
DO $apply$ DECLARE source text:=$crm_source$-- S-048: isolated organization CRM Beta; no changes to legacy sales data/policies/RPCs.
DO $preflight$
DECLARE r jsonb; t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['org_crm_clients','org_crm_deals','org_crm_tasks','org_crm_activities'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN RAISE EXCEPTION 'CRM table already exists: %',t; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'org_crm_%') THEN RAISE EXCEPTION 'CRM function namespace already exists'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements('[{"signature":"account_deletion_access_allowed()","body_md5":"6c078d0f1aa1f6b5af15485f0eaccb2a","definition_md5":"64b0a90b7db9813950ccca6dff208f3a","acl":["anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"can_access_organization(uuid,text)","body_md5":"ad720ba20dc32362ed009b2917cc2d9c","definition_md5":"2e11495f3d3e6ca261af8a08ed874269","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"get_org_staff_permissions(uuid,uuid)","body_md5":"f8d82709ae27730782dc4f455b35b7de","definition_md5":"c0ea40b20bbd1a71aa31cdbcbb7fc0b3","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"has_org_staff_permission(uuid,uuid,text)","body_md5":"b9c87ca03c3e95a57baf9122753792e2","definition_md5":"3d1fedafe94778fa19dd47acb71a3782","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"has_role(app_role,uuid)","body_md5":"5457df2171dee5cee3641e64285928f2","definition_md5":"20c46f708cc2e7fa51b640290151a59e","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"has_role(uuid,app_role)","body_md5":"4e852b30ef52ba5263c4e11d1aec8cf0","definition_md5":"82a7fa1cd06301bb83b010bc315aee0b","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"is_org_owner(uuid,uuid)","body_md5":"5894db724b2a3cbc52701cabfb2cf73c","definition_md5":"362aca6afc26c775be594843258b2ab2","acl":["anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"normalize_org_staff_permission(text)","body_md5":"2d47924fe022372f2dc128a979d56a53","definition_md5":"bb385c2b288bb966297a8504df1696ea","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"org_role_default_permissions(text)","body_md5":"2e440ec2b8552f215d00bd88ad7af166","definition_md5":"f2b39953a0c439d75079d72d5e103247","acl":["=X/postgres","anon=X/postgres","authenticated=X/postgres","postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]},{"signature":"account_deletion_snapshot(uuid)","body_md5":"9b79f03eac8b32d3625d52e507365bc1","definition_md5":"be727630b1869bd977f9ca482f2c2e28","acl":["postgres=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres","service_role=X/postgres"]}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||(r->>'signature'))
   AND md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=r->>'body_md5'
   AND md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))=r->>'definition_md5'
   AND COALESCE((SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl) a),'null'::jsonb)=r->'acl') THEN RAISE EXCEPTION 'CRM helper drift: %',r->>'signature'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements('[{"table":"organizations","name":"id","type":"uuid"},{"table":"organizations","name":"subscription_plan","type":"text"},{"table":"org_staff","name":"user_id","type":"uuid"},{"table":"org_staff","name":"organization_id","type":"uuid"},{"table":"org_staff","name":"display_name","type":"text"},{"table":"org_staff","name":"role","type":"text"},{"table":"org_staff","name":"expires_at","type":"timestamp with time zone"},{"table":"org_staff","name":"can_receive_crm_tasks","type":"boolean"},{"table":"profiles","name":"user_id","type":"uuid"},{"table":"profiles","name":"organization_id","type":"uuid"},{"table":"profiles","name":"full_name","type":"text"}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||(r->>'table')) AND a.attname=r->>'name'
   AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)=r->>'type') THEN RAISE EXCEPTION 'CRM prerequisite column drift: %.%',r->>'table',r->>'name'; END IF;
 END LOOP;
 IF to_regclass('auth.users') IS NULL OR to_regclass('public.account_deletion_revocations') IS NULL THEN RAISE EXCEPTION 'CRM prerequisite relation missing'; END IF;
END $preflight$;

-- Isolated organization CRM. Legacy platform CRM is deliberately not referenced.
CREATE TABLE public.org_crm_clients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 org_name text NOT NULL CHECK(length(btrim(org_name)) BETWEEN 1 AND 300),
 inn text CHECK(length(inn)<=32),
 email text CHECK(email IS NULL OR (length(email)<=320 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
 phone text CHECK(length(phone)<=100), address text CHECK(length(address)<=1000), notes text CHECK(length(notes)<=10000),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,id)
);
CREATE TABLE public.org_crm_deals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 client_id uuid NOT NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300),
 stage text NOT NULL DEFAULT 'new' CHECK(stage IN('new','contacted','negotiation','won','lost')),
 amount numeric(16,2) NOT NULL DEFAULT 0 CHECK(amount>=0 AND amount<100000000000000),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,client_id,id),
 FOREIGN KEY(organization_id,client_id) REFERENCES public.org_crm_clients(organization_id,id) ON DELETE RESTRICT
);
CREATE TABLE public.org_crm_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 client_id uuid NOT NULL, deal_id uuid,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300), description text CHECK(length(description)<=10000),
 type text NOT NULL DEFAULT 'call' CHECK(type IN('call','email','meeting','followup','other')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','done','cancelled')),
 due_date timestamptz NOT NULL CHECK(isfinite(due_date)),
 assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 completed_at timestamptz,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((status='done')=(completed_at IS NOT NULL)),
 FOREIGN KEY(organization_id,client_id) REFERENCES public.org_crm_clients(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,client_id,deal_id) REFERENCES public.org_crm_deals(organization_id,client_id,id) ON DELETE RESTRICT
);
CREATE TABLE public.org_crm_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 client_id uuid NOT NULL, deal_id uuid,
 activity_type text NOT NULL CHECK(activity_type IN('call','email','meeting','note')),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 10000),
 actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,client_id) REFERENCES public.org_crm_clients(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,client_id,deal_id) REFERENCES public.org_crm_deals(organization_id,client_id,id) ON DELETE RESTRICT
);
CREATE INDEX org_crm_clients_order ON public.org_crm_clients(organization_id,updated_at DESC,id);
CREATE INDEX org_crm_deals_order ON public.org_crm_deals(organization_id,updated_at DESC,id);
CREATE INDEX org_crm_tasks_due ON public.org_crm_tasks(organization_id,due_date,id);
CREATE INDEX org_crm_activities_order ON public.org_crm_activities(organization_id,created_at DESC,id);

CREATE FUNCTION public.org_crm_access_allowed(p_organization_id uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND p_permission IN('sales.read','sales.write')
 AND public.account_deletion_access_allowed()
 AND public.can_access_organization(p_organization_id,p_permission)
 AND EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_organization_id
   AND o.subscription_plan::text IN('standard','professional','maximum'))
$fn$;
REVOKE ALL ON FUNCTION public.org_crm_access_allowed(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.org_crm_access_allowed(uuid,text) TO authenticated,service_role;

DO $security$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['org_crm_clients','org_crm_deals','org_crm_tasks','org_crm_activities'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY org_crm_read ON public.%I FOR SELECT TO authenticated USING(public.org_crm_access_allowed(organization_id,''sales.read''))',t);
  EXECUTE format('CREATE POLICY account_deletion_no_revoked_access ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_deletion_access_allowed())) WITH CHECK((SELECT public.account_deletion_access_allowed()))',t);
 END LOOP;
END $security$;

-- Internal helpers are callable by the security-definer entry points only.
CREATE FUNCTION public.org_crm_require_write(p_organization_id uuid,p_values jsonb,p_keys text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT COALESCE(public.org_crm_access_allowed(p_organization_id,'sales.write'),false) THEN
  RAISE EXCEPTION 'crm_forbidden' USING ERRCODE='42501';
 END IF;
 IF p_values IS NULL OR jsonb_typeof(p_values)<>'object'
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_values) k WHERE NOT(k=ANY(p_keys))) THEN
  RAISE EXCEPTION 'crm_invalid_fields' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_values) e WHERE
  jsonb_typeof(e.value) NOT IN('string','null') AND NOT(e.key='amount' AND jsonb_typeof(e.value)='number')) THEN
  RAISE EXCEPTION 'crm_invalid_field_type' USING ERRCODE='22023';
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.org_crm_require_write(uuid,jsonb,text[]) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.org_crm_task_assignees(p_organization_id uuid)
RETURNS TABLE(user_id uuid,full_name text,role text,email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT s.user_id,COALESCE(NULLIF(s.display_name,''),NULLIF(p.full_name,''),'Сотрудник'),s.role,NULL::text
 FROM public.org_staff s LEFT JOIN public.profiles p ON p.user_id=s.user_id
 WHERE s.organization_id=p_organization_id AND s.can_receive_crm_tasks
 AND(s.expires_at IS NULL OR s.expires_at>now())
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=s.user_id)
 UNION
 SELECT p.user_id,COALESCE(NULLIF(p.full_name,''),'Владелец'),'owner'::text,NULL::text
 FROM public.profiles p WHERE p.organization_id=p_organization_id
 AND public.is_org_owner(p.user_id,p_organization_id)
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=p.user_id)
$fn$;
REVOKE ALL ON FUNCTION public.org_crm_task_assignees(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.org_crm_snapshot(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE counts jsonb;
BEGIN
 IF NOT COALESCE(public.org_crm_access_allowed(p_organization_id,'sales.read'),false) THEN
  RAISE EXCEPTION 'crm_forbidden' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object(
 'clients',(SELECT count(*) FROM public.org_crm_clients WHERE organization_id=p_organization_id),
 'deals',(SELECT count(*) FROM public.org_crm_deals WHERE organization_id=p_organization_id),
 'tasks',(SELECT count(*) FROM public.org_crm_tasks WHERE organization_id=p_organization_id),
 'activities',(SELECT count(*) FROM public.org_crm_activities WHERE organization_id=p_organization_id)) INTO counts;
 RETURN jsonb_build_object(
 'clients',COALESCE((SELECT jsonb_agg(to_jsonb(c)-'created_by' ORDER BY c.updated_at DESC,c.id) FROM(SELECT * FROM public.org_crm_clients WHERE organization_id=p_organization_id ORDER BY updated_at DESC,id LIMIT 1000)c),'[]'::jsonb),
 'deals',COALESCE((SELECT jsonb_agg(to_jsonb(d)-'created_by' ORDER BY d.updated_at DESC,d.id) FROM(SELECT * FROM public.org_crm_deals WHERE organization_id=p_organization_id ORDER BY updated_at DESC,id LIMIT 1000)d),'[]'::jsonb),
 'tasks',COALESCE((SELECT jsonb_agg(to_jsonb(t)-'created_by' ORDER BY t.due_date,t.id) FROM(SELECT * FROM public.org_crm_tasks WHERE organization_id=p_organization_id ORDER BY due_date,id LIMIT 1000)t),'[]'::jsonb),
 'activities',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC,a.id) FROM(SELECT * FROM public.org_crm_activities WHERE organization_id=p_organization_id ORDER BY created_at DESC,id LIMIT 500)a),'[]'::jsonb),
 'assignees',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.full_name,a.user_id) FROM public.org_crm_task_assignees(p_organization_id)a),'[]'::jsonb),
 'counts',counts,'truncated',jsonb_build_object('clients',(counts->>'clients')::bigint>1000,'deals',(counts->>'deals')::bigint>1000,'tasks',(counts->>'tasks')::bigint>1000,'activities',(counts->>'activities')::bigint>500));
END $fn$;

CREATE FUNCTION public.org_crm_save_client(p_organization_id uuid,p_id uuid,p_values jsonb,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.org_crm_clients%ROWTYPE; v jsonb;
BEGIN
 PERFORM public.org_crm_require_write(p_organization_id,p_values,ARRAY['org_name','inn','email','phone','address','notes']);
 IF p_id IS NOT NULL THEN
  SELECT * INTO r FROM public.org_crm_clients WHERE id=p_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'crm_not_found' USING ERRCODE='P0002'; END IF;
  IF p_expected_updated_at IS NULL OR r.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'crm_conflict' USING ERRCODE='40001'; END IF;
  v:=to_jsonb(r)||p_values;
 ELSE
  IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'crm_invalid_version' USING ERRCODE='22023'; END IF;
  v:=p_values;
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.org_crm_clients(organization_id,org_name,inn,email,phone,address,notes,created_by)
  VALUES(p_organization_id,btrim(v->>'org_name'),NULLIF(btrim(v->>'inn'),''),NULLIF(btrim(v->>'email'),''),NULLIF(btrim(v->>'phone'),''),NULLIF(btrim(v->>'address'),''),NULLIF(btrim(v->>'notes'),''),auth.uid()) RETURNING * INTO r;
 ELSE
  UPDATE public.org_crm_clients SET org_name=btrim(v->>'org_name'),inn=NULLIF(btrim(v->>'inn'),''),email=NULLIF(btrim(v->>'email'),''),phone=NULLIF(btrim(v->>'phone'),''),address=NULLIF(btrim(v->>'address'),''),notes=NULLIF(btrim(v->>'notes'),''),updated_at=GREATEST(clock_timestamp(),r.updated_at+interval '1 microsecond')
  WHERE id=p_id AND organization_id=p_organization_id RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('id',r.id,'updated_at',r.updated_at);
END $fn$;

CREATE FUNCTION public.org_crm_save_deal(p_organization_id uuid,p_id uuid,p_values jsonb,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.org_crm_deals%ROWTYPE; v jsonb; client uuid;
BEGIN
 PERFORM public.org_crm_require_write(p_organization_id,p_values,ARRAY['client_id','title','stage','amount']);
 IF p_id IS NOT NULL THEN
  SELECT * INTO r FROM public.org_crm_deals WHERE id=p_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'crm_not_found' USING ERRCODE='P0002'; END IF;
  IF p_expected_updated_at IS NULL OR r.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'crm_conflict' USING ERRCODE='40001'; END IF;
  v:=to_jsonb(r)||p_values;
 ELSE
  IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'crm_invalid_version' USING ERRCODE='22023'; END IF;
  v:=jsonb_build_object('stage','new','amount',0)||p_values;
 END IF;
 client:=(v->>'client_id')::uuid;
 PERFORM 1 FROM public.org_crm_clients WHERE organization_id=p_organization_id AND id=client FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'crm_client_not_found' USING ERRCODE='P0002'; END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.org_crm_deals(organization_id,client_id,title,stage,amount,created_by)
  VALUES(p_organization_id,client,btrim(v->>'title'),v->>'stage',(v->>'amount')::numeric,auth.uid()) RETURNING * INTO r;
 ELSE
  UPDATE public.org_crm_deals SET client_id=client,title=btrim(v->>'title'),stage=v->>'stage',amount=(v->>'amount')::numeric,updated_at=GREATEST(clock_timestamp(),r.updated_at+interval '1 microsecond')
  WHERE id=p_id AND organization_id=p_organization_id RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('id',r.id,'updated_at',r.updated_at);
END $fn$;

CREATE FUNCTION public.org_crm_save_task(p_organization_id uuid,p_id uuid,p_values jsonb,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.org_crm_tasks%ROWTYPE; v jsonb; client uuid; deal uuid; assignee uuid; completion timestamptz;
BEGIN
 PERFORM public.org_crm_require_write(p_organization_id,p_values,ARRAY['client_id','deal_id','title','description','type','status','due_date','assigned_user_id']);
 IF p_id IS NOT NULL THEN
  SELECT * INTO r FROM public.org_crm_tasks WHERE id=p_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'crm_not_found' USING ERRCODE='P0002'; END IF;
  IF p_expected_updated_at IS NULL OR r.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'crm_conflict' USING ERRCODE='40001'; END IF;
  v:=to_jsonb(r)||p_values;
 ELSE
  IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'crm_invalid_version' USING ERRCODE='22023'; END IF;
  v:=jsonb_build_object('status','pending','type','call')||p_values;
 END IF;
 client:=(v->>'client_id')::uuid; deal:=NULLIF(v->>'deal_id','')::uuid; assignee:=NULLIF(v->>'assigned_user_id','')::uuid;
 PERFORM 1 FROM public.org_crm_clients WHERE organization_id=p_organization_id AND id=client FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'crm_client_not_found' USING ERRCODE='P0002'; END IF;
 IF deal IS NOT NULL THEN
  PERFORM 1 FROM public.org_crm_deals WHERE organization_id=p_organization_id AND client_id=client AND id=deal FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'crm_deal_not_found' USING ERRCODE='P0002'; END IF;
 END IF;
 -- Existing tasks remain completable when an assignee expires; new assignments must be eligible now.
 IF assignee IS NOT NULL AND (p_id IS NULL OR assignee IS DISTINCT FROM r.assigned_user_id) THEN
  IF NOT EXISTS(SELECT 1 FROM public.org_crm_task_assignees(p_organization_id) a WHERE a.user_id=assignee) THEN
   RAISE EXCEPTION 'crm_assignee_unavailable' USING ERRCODE='22023';
  END IF;
 END IF;
 completion:=CASE WHEN v->>'status'='done' THEN COALESCE(r.completed_at,clock_timestamp()) ELSE NULL END;
 IF p_id IS NULL THEN
  INSERT INTO public.org_crm_tasks(organization_id,client_id,deal_id,title,description,type,status,due_date,assigned_user_id,completed_at,created_by)
  VALUES(p_organization_id,client,deal,btrim(v->>'title'),NULLIF(btrim(v->>'description'),''),v->>'type',v->>'status',(v->>'due_date')::timestamptz,assignee,completion,auth.uid()) RETURNING * INTO r;
 ELSE
  UPDATE public.org_crm_tasks SET client_id=client,deal_id=deal,title=btrim(v->>'title'),description=NULLIF(btrim(v->>'description'),''),type=v->>'type',status=v->>'status',due_date=(v->>'due_date')::timestamptz,assigned_user_id=assignee,completed_at=completion,updated_at=GREATEST(clock_timestamp(),r.updated_at+interval '1 microsecond')
  WHERE id=p_id AND organization_id=p_organization_id RETURNING * INTO r;
 END IF;
 RETURN jsonb_build_object('id',r.id,'updated_at',r.updated_at);
END $fn$;

CREATE FUNCTION public.org_crm_add_activity(p_organization_id uuid,p_client_id uuid,p_deal_id uuid,p_activity_type text,p_description text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.org_crm_activities%ROWTYPE;
BEGIN
 PERFORM public.org_crm_require_write(p_organization_id,'{}'::jsonb,ARRAY[]::text[]);
 PERFORM 1 FROM public.org_crm_clients WHERE organization_id=p_organization_id AND id=p_client_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'crm_client_not_found' USING ERRCODE='P0002'; END IF;
 IF p_deal_id IS NOT NULL THEN
  PERFORM 1 FROM public.org_crm_deals WHERE organization_id=p_organization_id AND client_id=p_client_id AND id=p_deal_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'crm_deal_not_found' USING ERRCODE='P0002'; END IF;
 END IF;
 INSERT INTO public.org_crm_activities(organization_id,client_id,deal_id,activity_type,description,actor_user_id)
 VALUES(p_organization_id,p_client_id,p_deal_id,p_activity_type,btrim(p_description),auth.uid()) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'created_at',r.created_at);
END $fn$;

REVOKE ALL ON FUNCTION public.org_crm_snapshot(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.org_crm_save_client(uuid,uuid,jsonb,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.org_crm_save_deal(uuid,uuid,jsonb,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.org_crm_save_task(uuid,uuid,jsonb,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.org_crm_add_activity(uuid,uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.org_crm_snapshot(uuid),public.org_crm_save_client(uuid,uuid,jsonb,timestamptz),public.org_crm_save_deal(uuid,uuid,jsonb,timestamptz),public.org_crm_save_task(uuid,uuid,jsonb,timestamptz),public.org_crm_add_activity(uuid,uuid,uuid,text,text) TO authenticated,service_role;

-- Include CRM work in the existing owner-deletion preview before revocation.
CREATE OR REPLACE FUNCTION public.account_deletion_snapshot(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE p public.profiles%ROWTYPE; v_org uuid; v_owner boolean:=false;
 v_blockers jsonb:='[]'; v_categories jsonb:='[]'; v_files jsonb;
 v_count bigint; v_learning bigint; v_docs bigint:=0; v_shared bigint:=0; v_documentary bigint:=0;
 v_org_shared bigint:=0; v_courses bigint:=0; r record; v_fingerprint jsonb;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE user_id=p_user_id;
 v_org:=p.organization_id;
 IF v_org IS NOT NULL THEN v_owner:=public.is_org_owner(p_user_id,v_org); END IF;
 SELECT count(*) INTO v_learning FROM public.enrollments WHERE user_id=p_user_id;
 v_files:=public.account_deletion_files(p_user_id);
 -- Exact subject/document relationships; JSON checks are read-only detection,
 -- never commands to remove an organization-wide document.
 SELECT
   (SELECT count(*) FROM public.education_document_records WHERE user_id=p_user_id OR enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_issuance_log WHERE user_id=p_user_id)+
   (SELECT count(*) FROM public.student_documents WHERE enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_signatures WHERE (recipient_user_id=p_user_id OR sender_user_id=p_user_id) AND (signed_at IS NOT NULL OR sender_signed_at IS NOT NULL OR status='signed'))+
   (SELECT count(*) FROM public.org_contracts WHERE (student_user_id=p_user_id OR students::text LIKE '%'||p_user_id::text||'%') AND (approved_at IS NOT NULL OR signed_at IS NOT NULL OR status NOT IN ('draft','cancelled')))+
   (SELECT count(*) FROM public.group_documents WHERE (student_user_id=p_user_id OR variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%') AND (file_path IS NOT NULL OR doc_status<>'draft'))
 INTO v_docs;
 IF v_docs>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','У аккаунта есть оформленные учебные или подписанные документы организации. Для этих записей требуется отдельная проверка возможности удаления; она не заменяется подтверждением удаления аккаунта.')); END IF;
 IF EXISTS(SELECT 1 FROM public.group_completion_decision_history WHERE user_id=p_user_id) OR EXISTS(SELECT 1 FROM public.group_completion_decisions WHERE user_id=p_user_id) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть неизменяемая история итоговых решений организации. Их автоматическое удаление сейчас не поддержано без нарушения целостности общей истории; удаление не начато.'));
 END IF;
 -- CSZ preserves accepted homework by a dedicated immutable-history trigger.
 -- Do not bypass that guard just to scrub a personal free-text attachment.
 IF EXISTS(SELECT 1 FROM public.homework_submissions WHERE student_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.enrollments WHERE user_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id WHERE lp.user_id=p_user_id AND l.course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a')) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть защищённые работы ЦСЗ. Их обработка требует отдельного решения; результаты обучения сейчас не изменяются.'));
 END IF;
 -- These records have other stakeholders or privileged ownership. Never let
 -- Auth FK cascades silently delete client call records, contracts or grants.
 FOR r IN SELECT * FROM (VALUES
  ('ai_avatar_templates','created_by'),
  ('balance_transactions','performed_by'),
  ('call_logs','manager_user_id'),
  ('chat_groups','created_by'),
  ('checko_search_presets','created_by'),
  ('checko_search_runs','created_by'),
  ('commercial_proposals','created_by'),
  ('commercial_proposals','deleted_by'),
  ('companies','user_id'),
  ('company_documents','deleted_by'),
  ('company_staff','invited_by'),
  ('course_landing_history','created_by'),
  ('course_manual_credits','credited_by'),
  ('course_manual_credits','revoked_by'),
  ('course_payments','user_id'),
  ('course_review_grants','created_by'),
  ('course_review_grants','updated_by'),
  ('course_snapshots','created_by'),
  ('data_subject_requests','deleted_by'),
  ('data_subject_requests','resolved_by'),
  ('document_issuance_log','deleted_by'),
  ('document_signatures','deleted_by'),
  ('driving_audit','user_id'),
  ('driving_entries','created_by'),
  ('driving_entry_reversals','created_by'),
  ('driving_instructors','user_id'),
  ('driving_invites','created_by'),
  ('driving_lessons','created_by'),
  ('driving_memberships','user_id'),
  ('driving_schools','created_by'),
  ('driving_students','user_id'),
  ('education_document_records','deleted_by'),
  ('email_campaigns','created_by'),
  ('email_drip_sequences','created_by'),
  ('email_templates','created_by'),
  ('enrollment_requests','resolved_by'),
  ('enrollment_requests','user_id'),
  ('goreltech_document_operations','actor_id'),
  ('goreltech_enrollment_orders','actor_id'),
  ('group_class_journal_marks','updated_by'),
  ('group_completion_decisions','confirmed_by'),
  ('group_document_schedules','updated_by'),
  ('group_documents','created_by'),
  ('group_documents','student_user_id'),
  ('homework_submissions','reviewer_id'),
  ('incoming_documents','deleted_by'),
  ('labor_safety_enrollment_protocols','created_by'),
  ('labor_safety_enrollment_protocols','source_user_id'),
  ('labor_safety_enrollment_protocols','updated_by'),
  ('labor_safety_profiles','user_id'),
  ('library_documents','created_by'),
  ('mailing_deliverability_seeds','created_by'),
  ('mailing_report_links','created_by'),
  ('mailing_senders','created_by'),
  ('marketplace_course_comments','user_id'),
  ('marketplace_orders','buyer_user_id'),
  ('org_billing_documents','deleted_by'),
  ('org_contract_template_versions','created_by'),
  ('org_custom_roles','created_by'),
  ('org_document_share_links','created_by'),
  ('org_documents','deleted_by'),
  ('org_signatories','created_by'),
  ('platform_invoice_acts','created_by'),
  ('platform_updates','created_by'),
  ('proposal_presets','created_by'),
  ('referral_attribution_log','user_id'),
  ('referral_partners','user_id'),
  ('sales_demo_links','created_by'),
  ('sales_demo_sessions','user_id'),
  ('sales_managers','user_id'),
  ('sales_tasks','created_by'),
  ('signature_comments','author_user_id'),
  ('signature_comments','resolved_by'),
  ('signature_revisions','created_by'),
  ('training_plans','created_by'),
  ('webinar_polls','created_by'),
  ('webinars','created_by'),
  ('webinars','host_user_id')
 ) x(t,c) LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING p_user_id;
  v_shared:=v_shared+v_count;
 END LOOP;
 v_shared:=v_shared+(SELECT count(*) FROM public.document_signatures WHERE (sender_user_id=p_user_id OR recipient_user_id=p_user_id) AND (sender_user_id IS DISTINCT FROM p_user_id OR recipient_user_id IS DISTINCT FROM p_user_id));
 v_shared:=v_shared+(SELECT count(*) FROM public.org_contracts WHERE student_user_id IS DISTINCT FROM p_user_id AND students::text LIKE '%'||p_user_id::text||'%');
 v_shared:=v_shared+(SELECT count(*) FROM public.group_documents WHERE student_user_id IS DISTINCT FROM p_user_id AND (variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%'));
 IF v_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_DATA_REVIEW_REQUIRED','message','Аккаунт связан с общими рабочими записями. Сначала нужно передать ответственность за них; данные других пользователей не удаляются.')); END IF;
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE (o.owner=p_user_id OR o.owner_id=p_user_id::text)
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_files) f WHERE f->>'bucket'=o.bucket_id AND f->>'path'=o.name)) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_FILES_REVIEW_REQUIRED','message','Есть загруженные аккаунтом файлы вне личных папок. Сначала нужно проверить их принадлежность организации.'));
 END IF;
 IF v_owner THEN
  -- Locking/revalidation occurs again in begin. A brand-new sole-owner
  -- organization may be removed with its default welcome course/templates.
  SELECT count(*) INTO v_org_shared FROM public.profiles WHERE organization_id=v_org AND user_id<>p_user_id;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=v_org);
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.organizations WHERE id=v_org AND (balance<>0 OR is_paid OR paid_until IS NOT NULL));
  FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','organization_id'),
  ('org_crm_deals','organization_id'),
  ('org_crm_tasks','organization_id'),
  ('org_crm_activities','organization_id'),
  ('achievements','organization_id'),
  ('admin_generated_documents','sent_to_organization_id'),
  ('admin_org_messages','organization_id'),
  ('ai_avatar_templates','organization_id'),
  ('audit_logs','organization_id'),
  ('balance_transactions','organization_id'),
  ('chat_groups','organization_id'),
  ('checko_search_presets','organization_id'),
  ('commercial_proposals','organization_id'),
  ('companies','organization_id'),
  ('company_requests','organization_id'),
  ('consent_documents','organization_id'),
  ('course_landing_history','organization_id'),
  ('course_payments','organization_id'),
  ('course_reminders','organization_id'),
  ('course_requests','organization_id'),
  ('course_snapshots','organization_id'),
  ('data_subject_requests','organization_id'),
  ('document_issuance_log','organization_id'),
  ('document_number_sequences','organization_id'),
  ('document_signatures','organization_id'),
  ('driving_audit','organization_id'),
  ('driving_cars','organization_id'),
  ('driving_courses','organization_id'),
  ('driving_entries','organization_id'),
  ('driving_entry_reversals','organization_id'),
  ('driving_groups','organization_id'),
  ('driving_instructors','organization_id'),
  ('driving_invites','organization_id'),
  ('driving_lessons','organization_id'),
  ('driving_memberships','organization_id'),
  ('driving_operations','organization_id'),
  ('driving_programs','organization_id'),
  ('driving_schools','organization_id'),
  ('driving_shifts','organization_id'),
  ('driving_students','organization_id'),
  ('education_document_records','organization_id'),
  ('email_action_tokens','organization_id'),
  ('email_campaign_consent_log','organization_id'),
  ('email_campaigns','organization_id'),
  ('email_drip_subscribers','organization_id'),
  ('frdo_signed_documents','organization_id'),
  ('goreltech_document_operations','organization_id'),
  ('goreltech_enrollment_orders','organization_id'),
  ('group_class_journal_marks','organization_id'),
  ('group_completion_decision_history','organization_id'),
  ('group_completion_decisions','organization_id'),
  ('group_document_schedules','organization_id'),
  ('group_documents','organization_id'),
  ('homework_submissions','organization_id'),
  ('incoming_documents','organization_id'),
  ('journal_instances','organization_id'),
  ('kinescope_usage_cache','organization_id'),
  ('knowledge_bank','organization_id'),
  ('labor_safety_enrollment_protocols','organization_id'),
  ('labor_safety_groups','organization_id'),
  ('labor_safety_profiles','organization_id'),
  ('library_documents','organization_id'),
  ('library_folders','organization_id'),
  ('mailing_campaign_ledger','organization_id'),
  ('mailing_campaign_replies','organization_id'),
  ('mailing_contacts','organization_id'),
  ('mailing_deliverability_checks','organization_id'),
  ('mailing_deliverability_seeds','organization_id'),
  ('mailing_report_links','organization_id'),
  ('mailing_seed_ledger','organization_id'),
  ('mailing_senders','organization_id'),
  ('marketplace_courses','organization_id'),
  ('marketplace_orders','buyer_organization_id'),
  ('ordinary_mail_report_events','organization_id'),
  ('org_billing_documents','organization_id'),
  ('org_contract_template_versions','organization_id'),
  ('org_contract_templates','organization_id'),
  ('org_contracts','organization_id'),
  ('org_custom_roles','organization_id'),
  ('org_document_share_links','organization_id'),
  ('org_document_versions','organization_id'),
  ('org_documents','organization_id'),
  ('org_general_messages','organization_id'),
  ('org_payers','organization_id'),
  ('org_services','organization_id'),
  ('org_signatories','organization_id'),
  ('org_smtp_settings','organization_id'),
  ('org_staff','organization_id'),
  ('org_student_messages','organization_id'),
  ('organization_comments','organization_id'),
  ('organization_payment_settings','organization_id'),
  ('organization_reminders','organization_id'),
  ('pending_enrollments','organization_id'),
  ('platform_invoice_acts','organization_id'),
  ('program_categories','organization_id'),
  ('program_documents','organization_id'),
  ('program_folders','organization_id'),
  ('program_training_plans','organization_id'),
  ('proposal_presets','organization_id'),
  ('referral_attribution_log','organization_id'),
  ('referral_commissions','organization_id'),
  ('referral_registrations','organization_id'),
  ('registration_links','organization_id'),
  ('role_audit_log','organization_id'),
  ('sales_blacklist','organization_id'),
  ('sales_companies_db','organization_id'),
  ('sales_contracts','organization_id'),
  ('sales_demo_links','organization_id'),
  ('sales_demo_sessions','organization_id'),
  ('sales_lead_activities','organization_id'),
  ('sales_leads','organization_id'),
  ('sales_tasks','organization_id'),
  ('service_orders','organization_id'),
  ('skillspace_import_jobs','organization_id'),
  ('staff_invitations','organization_id'),
  ('student_deletion_log','organization_id'),
  ('student_group_memberships','organization_id'),
  ('student_groups','organization_id'),
  ('student_roster_removals','organization_id'),
  ('subscription_invoices','organization_id'),
  ('system_diagnostics','organization_id'),
  ('testimonials','organization_id'),
  ('training_plans','organization_id'),
  ('webinars','organization_id')
  ) x(t,c) LOOP
   EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING v_org;
   v_org_shared:=v_org_shared+v_count;
  END LOOP;
  -- Only the audited seeded course is auto-removable in the first release.
  SELECT count(*) INTO v_courses FROM public.courses WHERE organization_id=v_org;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.courses WHERE organization_id=v_org AND system_key IS DISTINCT FROM 'welcome');
 IF v_org_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','OWNERSHIP_TRANSFER_REQUIRED','message','Организация содержит пользователей, обучение, платежи или рабочие записи. Сначала передайте управление организацией.','actionHref','/organization?tab=staff')); END IF;
 END IF;
 -- PEP is deletable only when it is the person's standalone agreement, not
 -- evidence attached to a document signature (the live FK is SET NULL).
 SELECT count(*) INTO v_documentary FROM public.pep_agreements pa
 WHERE pa.user_id=p_user_id AND EXISTS(SELECT 1 FROM public.document_signatures d WHERE d.pep_agreement_id=pa.id);
 -- An organization's offer acceptance belongs to the organization lifecycle.
 -- Remove it only together with the verified unused sole-owner organization.
 SELECT v_documentary+count(*) INTO v_documentary FROM public.organization_offer_acceptances a
 WHERE a.user_id=p_user_id AND NOT (v_owner AND v_org_shared=0 AND a.organization_id=v_org);
 IF v_documentary>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','DOCUMENTARY_RELATION_REVIEW_REQUIRED','message','Есть соглашение ПЭП, связанное с подписью документа, или акцепт оферты действующей организации. Эти общие документальные записи требуют отдельной обработки; удаление аккаунта не начато.')); END IF;
 v_categories:=jsonb_build_array(
  jsonb_build_object('key','account','label','Вход в аккаунт, пароль, профиль и личные настройки','count',1,'action','delete'),
  jsonb_build_object('key','private_files','label','Личные фотографии и загруженные документы','count',jsonb_array_length(v_files),'action','delete'),
  jsonb_build_object('key','learning_results','label','Назначения курсов, прогресс, попытки, ответы и результаты обучения','count',v_learning,'action','delete'),
  jsonb_build_object('key','institutional_documents','label','Оформленные документы','count',v_docs,'action',CASE WHEN v_docs>0 THEN 'block' ELSE 'delete' END));
 IF v_documentary>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','documentary_relations','label','Соглашения ПЭП и акцепты оферт, связанные с документами или действующей организацией','count',v_documentary,'action','block')); END IF;
 IF v_owner THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','empty_organization','label','Неиспользованная организация и ознакомительный курс','count',1,'action',CASE WHEN v_org_shared>0 THEN 'block' ELSE 'delete' END)); END IF;
 SELECT count(*) INTO v_count FROM public.audit_logs WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','common_audit','label','Общие события организации: запись события сохраняется, имя и ссылка на аккаунт удаляются','count',v_count,'action','anonymize')); END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record','label','Техническая запись запрета старого доступа и квитанция об удалении без имени и контактов','count',1,'action','retain'));
 -- The snapshot is compared atomically just before the first mutation. Counts
 -- and manifest cover additions during the confirmation dialog; no PII stored.
 RETURN jsonb_build_object('organizationId',v_org,'emptyOrganization',v_owner AND v_org_shared=0,'learningCount',v_learning,
  'categories',v_categories,'blockers',v_blockers,'files',v_files,'sharedCount',v_shared,'personalRows',public.account_deletion_personal_row_counts(p_user_id),
  'profileRevision',p.updated_at,'role',(SELECT role::text FROM public.user_roles WHERE user_id=p_user_id LIMIT 1));
END;$function$
;
$crm_source$; BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>'f4eae00e743a71a5faaf0551cd1e315c' THEN RAISE EXCEPTION 'CRM source hash mismatch'; END IF;
 EXECUTE source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261012200000','org_crm_beta',ARRAY[source]);
END $apply$;
DO $verify$ DECLARE r record; checks integer:=0; after_security jsonb; BEGIN
 FOR r IN SELECT 'org_crm_clients:rls' AS check_name,(SELECT relrowsecurity FROM pg_class WHERE oid='public.org_crm_clients'::regclass) AS ok
UNION ALL
SELECT 'org_crm_clients:scope_required' AS check_name,(SELECT attnotnull FROM pg_attribute WHERE attrelid='public.org_crm_clients'::regclass AND attname='organization_id') AS ok
UNION ALL
SELECT 'org_crm_clients:authenticated_read_only' AS check_name,(has_table_privilege('authenticated','public.org_crm_clients','SELECT') AND NOT has_table_privilege('authenticated','public.org_crm_clients','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS ok
UNION ALL
SELECT 'org_crm_clients:anon_closed' AS check_name,(NOT has_table_privilege('anon','public.org_crm_clients','SELECT,INSERT,UPDATE,DELETE')) AS ok
UNION ALL
SELECT 'org_crm_clients:policy_inventory' AS check_name,(SELECT count(*)=2 AND count(*) FILTER(WHERE policyname='org_crm_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[])=1 AND count(*) FILTER(WHERE policyname='account_deletion_no_revoked_access' AND permissive='RESTRICTIVE' AND roles=ARRAY['authenticated']::name[])=1 FROM pg_policies WHERE schemaname='public' AND tablename='org_crm_clients') AS ok
UNION ALL
SELECT 'org_crm_deals:rls' AS check_name,(SELECT relrowsecurity FROM pg_class WHERE oid='public.org_crm_deals'::regclass) AS ok
UNION ALL
SELECT 'org_crm_deals:scope_required' AS check_name,(SELECT attnotnull FROM pg_attribute WHERE attrelid='public.org_crm_deals'::regclass AND attname='organization_id') AS ok
UNION ALL
SELECT 'org_crm_deals:authenticated_read_only' AS check_name,(has_table_privilege('authenticated','public.org_crm_deals','SELECT') AND NOT has_table_privilege('authenticated','public.org_crm_deals','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS ok
UNION ALL
SELECT 'org_crm_deals:anon_closed' AS check_name,(NOT has_table_privilege('anon','public.org_crm_deals','SELECT,INSERT,UPDATE,DELETE')) AS ok
UNION ALL
SELECT 'org_crm_deals:policy_inventory' AS check_name,(SELECT count(*)=2 AND count(*) FILTER(WHERE policyname='org_crm_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[])=1 AND count(*) FILTER(WHERE policyname='account_deletion_no_revoked_access' AND permissive='RESTRICTIVE' AND roles=ARRAY['authenticated']::name[])=1 FROM pg_policies WHERE schemaname='public' AND tablename='org_crm_deals') AS ok
UNION ALL
SELECT 'org_crm_tasks:rls' AS check_name,(SELECT relrowsecurity FROM pg_class WHERE oid='public.org_crm_tasks'::regclass) AS ok
UNION ALL
SELECT 'org_crm_tasks:scope_required' AS check_name,(SELECT attnotnull FROM pg_attribute WHERE attrelid='public.org_crm_tasks'::regclass AND attname='organization_id') AS ok
UNION ALL
SELECT 'org_crm_tasks:authenticated_read_only' AS check_name,(has_table_privilege('authenticated','public.org_crm_tasks','SELECT') AND NOT has_table_privilege('authenticated','public.org_crm_tasks','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS ok
UNION ALL
SELECT 'org_crm_tasks:anon_closed' AS check_name,(NOT has_table_privilege('anon','public.org_crm_tasks','SELECT,INSERT,UPDATE,DELETE')) AS ok
UNION ALL
SELECT 'org_crm_tasks:policy_inventory' AS check_name,(SELECT count(*)=2 AND count(*) FILTER(WHERE policyname='org_crm_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[])=1 AND count(*) FILTER(WHERE policyname='account_deletion_no_revoked_access' AND permissive='RESTRICTIVE' AND roles=ARRAY['authenticated']::name[])=1 FROM pg_policies WHERE schemaname='public' AND tablename='org_crm_tasks') AS ok
UNION ALL
SELECT 'org_crm_activities:rls' AS check_name,(SELECT relrowsecurity FROM pg_class WHERE oid='public.org_crm_activities'::regclass) AS ok
UNION ALL
SELECT 'org_crm_activities:scope_required' AS check_name,(SELECT attnotnull FROM pg_attribute WHERE attrelid='public.org_crm_activities'::regclass AND attname='organization_id') AS ok
UNION ALL
SELECT 'org_crm_activities:authenticated_read_only' AS check_name,(has_table_privilege('authenticated','public.org_crm_activities','SELECT') AND NOT has_table_privilege('authenticated','public.org_crm_activities','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS ok
UNION ALL
SELECT 'org_crm_activities:anon_closed' AS check_name,(NOT has_table_privilege('anon','public.org_crm_activities','SELECT,INSERT,UPDATE,DELETE')) AS ok
UNION ALL
SELECT 'org_crm_activities:policy_inventory' AS check_name,(SELECT count(*)=2 AND count(*) FILTER(WHERE policyname='org_crm_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[])=1 AND count(*) FILTER(WHERE policyname='account_deletion_no_revoked_access' AND permissive='RESTRICTIVE' AND roles=ARRAY['authenticated']::name[])=1 FROM pg_policies WHERE schemaname='public' AND tablename='org_crm_activities') AS ok
UNION ALL
SELECT 'org_crm_access_allowed:body' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='395b7dd7b17fd70aa2d3a48b62bc689c' AND prosecdef FROM pg_proc WHERE oid='public.org_crm_access_allowed(uuid,text)'::regprocedure) AS ok
UNION ALL
SELECT 'org_crm_access_allowed:grant' AS check_name,(NOT has_function_privilege('anon','public.org_crm_access_allowed(uuid,text)','EXECUTE') AND has_function_privilege('authenticated','public.org_crm_access_allowed(uuid,text)','EXECUTE')) AS ok
UNION ALL
SELECT 'org_crm_require_write:body' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='25068d464680549eb8c22fc6adf18122' AND prosecdef FROM pg_proc WHERE oid='public.org_crm_require_write(uuid,jsonb,text[])'::regprocedure) AS ok
UNION ALL
SELECT 'org_crm_require_write:grant' AS check_name,(NOT has_function_privilege('anon','public.org_crm_require_write(uuid,jsonb,text[])','EXECUTE') AND NOT has_function_privilege('authenticated','public.org_crm_require_write(uuid,jsonb,text[])','EXECUTE')) AS ok
UNION ALL
SELECT 'org_crm_task_assignees:body' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='87030d81a62da2191aca264eea8c5fff' AND prosecdef FROM pg_proc WHERE oid='public.org_crm_task_assignees(uuid)'::regprocedure) AS ok
UNION ALL
SELECT 'org_crm_task_assignees:grant' AS check_name,(NOT has_function_privilege('anon','public.org_crm_task_assignees(uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','public.org_crm_task_assignees(uuid)','EXECUTE')) AS ok
UNION ALL
SELECT 'org_crm_snapshot:body' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='bd2671fa878f290896ffda1f51e3f85c' AND prosecdef FROM pg_proc WHERE oid='public.org_crm_snapshot(uuid)'::regprocedure) AS ok
UNION ALL
SELECT 'org_crm_snapshot:grant' AS check_name,(NOT has_function_privilege('anon','public.org_crm_snapshot(uuid)','EXECUTE') AND has_function_privilege('authenticated','public.org_crm_snapshot(uuid)','EXECUTE')) AS ok
UNION ALL
SELECT 'org_crm_save_client:body' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='7b134fb064cfd07b023afdc4a442206a' AND prosecdef FROM pg_proc WHERE oid='public.org_crm_save_client(uuid,uuid,jsonb,timestamptz)'::regprocedure) AS ok
UNION ALL
SELECT 'org_crm_save_client:grant' AS check_name,(NOT has_function_privilege('anon','public.org_crm_save_client(uuid,uuid,jsonb,timestamptz)','EXECUTE') AND has_function_privilege('authenticated','public.org_crm_save_client(uuid,uuid,jsonb,timestamptz)','EXECUTE')) AS ok
UNION ALL
SELECT 'org_crm_save_deal:body' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='ace205eaf6b7c7c02cf8d0e82cfc03fe' AND prosecdef FROM pg_proc WHERE oid='public.org_crm_save_deal(uuid,uuid,jsonb,timestamptz)'::regprocedure) AS ok
UNION ALL
SELECT 'org_crm_save_deal:grant' AS check_name,(NOT has_function_privilege('anon','public.org_crm_save_deal(uuid,uuid,jsonb,timestamptz)','EXECUTE') AND has_function_privilege('authenticated','public.org_crm_save_deal(uuid,uuid,jsonb,timestamptz)','EXECUTE')) AS ok
UNION ALL
SELECT 'org_crm_save_task:body' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='ca55d6b06d228f9360b02a3a07bbd496' AND prosecdef FROM pg_proc WHERE oid='public.org_crm_save_task(uuid,uuid,jsonb,timestamptz)'::regprocedure) AS ok
UNION ALL
SELECT 'org_crm_save_task:grant' AS check_name,(NOT has_function_privilege('anon','public.org_crm_save_task(uuid,uuid,jsonb,timestamptz)','EXECUTE') AND has_function_privilege('authenticated','public.org_crm_save_task(uuid,uuid,jsonb,timestamptz)','EXECUTE')) AS ok
UNION ALL
SELECT 'org_crm_add_activity:body' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='2501e3eb2daf97693e8f697c8a5c48f8' AND prosecdef FROM pg_proc WHERE oid='public.org_crm_add_activity(uuid,uuid,uuid,text,text)'::regprocedure) AS ok
UNION ALL
SELECT 'org_crm_add_activity:grant' AS check_name,(NOT has_function_privilege('anon','public.org_crm_add_activity(uuid,uuid,uuid,text,text)','EXECUTE') AND has_function_privilege('authenticated','public.org_crm_add_activity(uuid,uuid,uuid,text,text)','EXECUTE')) AS ok
UNION ALL
SELECT 'same_tenant_foreign_keys' AS check_name,(SELECT count(*)=9 FROM pg_constraint WHERE conrelid IN ('public.org_crm_clients'::regclass,'public.org_crm_deals'::regclass,'public.org_crm_tasks'::regclass,'public.org_crm_activities'::regclass) AND contype='f' AND confrelid IN ('public.organizations'::regclass,'public.org_crm_clients'::regclass,'public.org_crm_deals'::regclass)) AS ok
UNION ALL
SELECT 'account_deletion_snapshot:four_new_tables_only' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='1f973f5048873db00cf52e0293f14b71' FROM pg_proc WHERE oid='public.account_deletion_snapshot(uuid)'::regprocedure) AS ok LOOP IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'CRM postcheck failed: %',r.check_name; END IF; checks:=checks+1; END LOOP;
 SELECT security_snapshot INTO after_security FROM (SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',CASE WHEN p.proname='account_deletion_snapshot' THEN NULL ELSE md5(pg_get_functiondef(p.oid)) END,'owner',p.proowner,'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' AND p.proname NOT LIKE 'org_crm_%'),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'owner',relowner,'acl',relacl,'rls',relrowsecurity,'force',relforcerowsecurity) ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname NOT LIKE 'org_crm_%'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename NOT LIKE 'org_crm_%'),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY tgrelid,tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND c.relname NOT LIKE 'org_crm_%' AND NOT tgisinternal)
) AS security_snapshot) q;
 IF after_security IS DISTINCT FROM(SELECT security_snapshot FROM org_crm_security_before) THEN RAISE EXCEPTION 'Unrelated CRM security changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012200000' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='f4eae00e743a71a5faaf0551cd1e315c') THEN RAISE EXCEPTION 'CRM ledger mismatch'; END IF;
 INSERT INTO org_crm_release_result VALUES(jsonb_build_object('committed',true,'checks_passed',checks,'ledger_source_match',true,'preserved_security',true,'transaction_id',txid_current()));
END $verify$;
NOTIFY pgrst,'reload schema'; COMMIT;
SELECT result AS release_result FROM org_crm_release_result;
