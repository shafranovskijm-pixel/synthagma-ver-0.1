-- Read-only. Save every result on D before any apply. A green signature check
-- alone is NOT approval: review ALL policy expressions and live helper bodies.
WITH expected(signature,body_md5) AS (VALUES
 ('public.can_access_organization(uuid,text)','ad720ba20dc32362ed009b2917cc2d9c'),
 ('public.is_org_owner(uuid,uuid)','5894db724b2a3cbc52701cabfb2cf73c'),
 ('public.has_org_staff_permission(uuid,uuid,text)','b9c87ca03c3e95a57baf9122753792e2'),
 ('public.get_org_staff_permissions(uuid,uuid)','f8d82709ae27730782dc4f455b35b7de'),
 ('public.account_deletion_access_allowed()','6c078d0f1aa1f6b5af15485f0eaccb2a'))
SELECT e.signature,p.oid IS NOT NULL AS exists,
 COALESCE(md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=e.body_md5,false) AS reviewed_body_matches,
 p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,
 CASE WHEN p.oid IS NOT NULL THEN pg_get_functiondef(p.oid) END AS live_definition
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);

-- Additional invoked dependencies: inspect overload semantics and permission
-- normalization instead of assuming a matching function name proves behavior.
SELECT signature,p.oid IS NOT NULL AS exists,p.prosecdef,p.proconfig,
 pg_get_userbyid(p.proowner) AS owner,
 CASE WHEN p.oid IS NOT NULL THEN pg_get_functiondef(p.oid) END AS live_definition
FROM (VALUES ('public.normalize_org_staff_permission(text)'),
 ('public.has_role(public.app_role,uuid)'),('public.has_role(uuid,public.app_role)')) f(signature)
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.signature);

WITH expected(table_name,column_name) AS (VALUES
 ('organizations','id'),('organizations','name'),('organizations','description'),
 ('organizations','branding'),('organizations','menu_settings'),('organizations','student_dashboard_settings'),
 ('organizations','subscription_plan'),('organizations','custom_enabled_categories'),('organizations','frdo_enabled'),
 ('profiles','user_id'),('profiles','organization_id'),('org_staff','user_id'),('org_staff','organization_id'),
 ('org_staff','expires_at'),('org_staff','role'),('org_staff','sections_access'),
 ('companies','id'),('companies','organization_id'),('companies','user_id'),
 ('labor_safety_groups','id'),('labor_safety_groups','organization_id'),
 ('labor_safety_records','group_id'))
SELECT e.table_name,e.column_name,c.column_name IS NOT NULL AS exists,c.data_type
FROM expected e LEFT JOIN information_schema.columns c ON c.table_schema='public'
 AND c.table_name=e.table_name AND c.column_name=e.column_name ORDER BY 1,2;

SELECT c.oid::regclass AS relation,c.relrowsecurity,c.relforcerowsecurity,
 pg_get_userbyid(c.relowner) AS owner,pg_has_role(current_user,c.relowner,'USAGE') AS can_alter_as_owner
FROM pg_class c WHERE c.oid IN (to_regclass('public.companies'),to_regclass('public.labor_safety_groups'),to_regclass('public.labor_safety_records'));

-- Inspect additional permissive policies too: OR policies can bypass the matrix.
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public'
 AND tablename IN ('companies','labor_safety_groups','labor_safety_records','organizations')
ORDER BY tablename,policyname;

WITH expected(table_name,policy_name,command) AS (VALUES
 ('companies','Org users can manage their companies','ALL'),
 ('companies','Org users can view their companies','SELECT'),
 ('companies','Companies can view own record','SELECT'),
 ('companies','Companies can update own record','UPDATE'),
 ('labor_safety_groups','Users can view labor safety groups of their organization','SELECT'),
 ('labor_safety_groups','Users can create labor safety groups in their organization','INSERT'),
 ('labor_safety_groups','Users can update labor safety groups in their organization','UPDATE'),
 ('labor_safety_groups','Users can delete labor safety groups in their organization','DELETE'),
 ('labor_safety_records','Users can view labor safety records','SELECT'),
 ('labor_safety_records','Users can create labor safety records','INSERT'),
 ('labor_safety_records','Users can update labor safety records','UPDATE'),
 ('labor_safety_records','Users can delete labor safety records','DELETE'))
SELECT e.*,p.policyname IS NOT NULL AND p.cmd=e.command AND p.permissive='PERMISSIVE' AS expected_policy_present
FROM expected e LEFT JOIN pg_policies p ON p.schemaname='public' AND p.tablename=e.table_name AND p.policyname=e.policy_name;

SELECT r.name,to_regrole(r.name) IS NOT NULL AS role_exists
FROM (VALUES('authenticated'),('anon'),('service_role')) r(name);
SELECT f.signature,p.oid IS NOT NULL AS exists,pg_get_userbyid(p.proowner) AS owner,
 COALESCE(pg_has_role(current_user,p.proowner,'USAGE'),false) AS can_replace_as_owner,
 p.proacl,CASE WHEN p.oid IS NOT NULL THEN pg_get_functiondef(p.oid) END AS before_definition
FROM (VALUES('public.org_role_default_permissions(text)'),('public.get_organization_core(uuid)')) f(signature)
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.signature);
SELECT t.relation_name,g.privilege,
 CASE WHEN to_regclass(t.relation_name) IS NOT NULL AND to_regrole('authenticated') IS NOT NULL
   THEN has_table_privilege('authenticated',t.relation_name,g.privilege) ELSE false END AS existing_table_grant
FROM (VALUES('public.companies'),('public.labor_safety_groups'),('public.labor_safety_records')) t(relation_name)
CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE')) g(privilege);
SELECT to_regprocedure('public.get_organization_core(uuid)') IS NOT NULL AS existing_core,
 to_regprocedure('public.org_role_default_permissions(text)') IS NOT NULL AS existing_defaults,
 to_regprocedure('public.has_role(public.app_role,uuid)') IS NOT NULL AS has_role_overload;
SELECT role,public.org_role_default_permissions(role) AS current_permissions
FROM unnest(ARRAY['owner','admin','school_editor','course_editor','teacher','sales_manager']) role;

-- Identity metadata only, no business rows, tokens or personal data.
SELECT current_database(),current_user,version();
