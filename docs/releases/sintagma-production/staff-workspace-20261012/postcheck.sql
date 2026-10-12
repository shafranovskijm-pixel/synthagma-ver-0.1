-- Read-only technical postflight, in the SAME transaction before COMMIT.
-- Every ok must be true. This does not prove a real employee's browser outcome.
WITH expected(signature,body_md5) AS (VALUES
 ('public.get_organization_core(uuid)','605bd6383175f8851046c2962afa4bbf'),
 ('public.org_role_default_permissions(text)','2e440ec2b8552f215d00bd88ad7af166'))
SELECT e.signature AS check_name,COALESCE(md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=e.body_md5,false) AS ok
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);

SELECT 'core authenticated execute' AS check_name,has_function_privilege('authenticated','public.get_organization_core(uuid)','EXECUTE') AS ok
UNION ALL SELECT 'core anonymous denied',NOT has_function_privilege('anon','public.get_organization_core(uuid)','EXECUTE')
UNION ALL SELECT 'core service execute',has_function_privilege('service_role','public.get_organization_core(uuid)','EXECUTE')
UNION ALL SELECT 'core no PUBLIC grant',NOT EXISTS(
 SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
 WHERE p.oid=to_regprocedure('public.get_organization_core(uuid)') AND a.grantee=0 AND a.privilege_type='EXECUTE')
UNION ALL SELECT 'legacy companies policies absent',NOT EXISTS(SELECT 1 FROM pg_policies
 WHERE schemaname='public' AND tablename='companies'
 AND policyname IN ('Org users can manage their companies','Org users can view their companies'))
UNION ALL SELECT 'company-owner SELECT and UPDATE remain',(
 SELECT count(*)=2 FROM pg_policies WHERE schemaname='public' AND tablename='companies'
 AND policyname IN ('Companies can view own record','Companies can update own record'));

WITH expected(table_name,policy_name,command,permission) AS (VALUES
 ('companies','Org staff can read companies','SELECT','companies.read'),
 ('companies','Org staff can insert companies','INSERT','companies.write'),
 ('companies','Org staff can update companies','UPDATE','companies.write'),
 ('companies','Org staff can delete companies','DELETE','companies.write'),
 ('labor_safety_groups','Users can view labor safety groups of their organization','SELECT','labor_safety.read'),
 ('labor_safety_groups','Users can create labor safety groups in their organization','INSERT','labor_safety.write'),
 ('labor_safety_groups','Users can update labor safety groups in their organization','UPDATE','labor_safety.write'),
 ('labor_safety_groups','Users can delete labor safety groups in their organization','DELETE','labor_safety.write'),
 ('labor_safety_records','Users can view labor safety records','SELECT','labor_safety.read'),
 ('labor_safety_records','Users can create labor safety records','INSERT','labor_safety.write'),
 ('labor_safety_records','Users can update labor safety records','UPDATE','labor_safety.write'),
 ('labor_safety_records','Users can delete labor safety records','DELETE','labor_safety.write'))
SELECT e.table_name||' / '||e.policy_name AS check_name,
 COALESCE(p.cmd=e.command AND p.permissive='PERMISSIVE' AND p.roles=ARRAY['authenticated']::name[]
   AND (e.command='INSERT' OR strpos(p.qual,'can_access_organization')>0 AND strpos(p.qual,e.permission)>0)
   AND (e.command NOT IN ('INSERT','UPDATE') OR strpos(p.with_check,'can_access_organization')>0 AND strpos(p.with_check,e.permission)>0),false) AS ok,
 p.qual,p.with_check
FROM expected e LEFT JOIN pg_policies p ON p.schemaname='public' AND p.tablename=e.table_name AND p.policyname=e.policy_name;

SELECT t.name||' deletion fence' AS check_name,EXISTS(SELECT 1 FROM pg_policies p
 WHERE p.schemaname='public' AND p.tablename=t.name AND p.policyname='account_deletion_no_revoked_access'
 AND p.permissive='RESTRICTIVE' AND p.cmd='ALL') AS ok
FROM (VALUES('companies'),('labor_safety_groups'),('labor_safety_records')) t(name);

-- Compare these definitions with the BEFORE backup. No migration statement
-- modifies the tenant resolver, permission helpers, owner policies or org RLS.
SELECT signature,pg_get_functiondef(to_regprocedure(signature)) AS unchanged_definition
FROM (VALUES('public.current_organization_id()'),('public.can_access_organization(uuid,text)'),
 ('public.is_org_owner(uuid,uuid)'),('public.has_org_staff_permission(uuid,uuid,text)'),
 ('public.get_org_staff_permissions(uuid,uuid)')) f(signature);
SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND (tablename='organizations'
 OR tablename IN ('companies','labor_safety_groups','labor_safety_records')
 AND (policyname='account_deletion_no_revoked_access' OR policyname IN ('Companies can view own record','Companies can update own record')))
ORDER BY tablename,policyname;
