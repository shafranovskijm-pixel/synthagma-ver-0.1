-- Read-only metadata backup. Save results before apply; no SQL here is executed
-- from its returned text. Includes ACLs because pg_get_functiondef omits them.
WITH signatures(signature) AS (VALUES
 ('public.org_role_default_permissions(text)'),('public.get_organization_core(uuid)'),
 ('public.current_organization_id()'),('public.can_access_organization(uuid,text)'),
 ('public.is_org_owner(uuid,uuid)'),('public.has_org_staff_permission(uuid,uuid,text)'),
 ('public.get_org_staff_permissions(uuid,uuid)'))
SELECT s.signature,p.oid IS NOT NULL AS exists,pg_get_userbyid(p.proowner) AS owner,
 p.proacl,pg_get_functiondef(p.oid) AS definition,
 md5(replace(p.prosrc,chr(13)||chr(10),chr(10))) AS body_md5
FROM signatures s LEFT JOIN pg_proc p ON p.oid=to_regprocedure(s.signature);

-- Full grant inventory for the ONLY two functions replaced by this migration.
SELECT p.oid::regprocedure AS signature,pg_get_userbyid(p.proowner) AS owner,
 CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
 a.privilege_type,a.is_grantable,
 format('GRANT %s ON FUNCTION %s TO %s%s;',a.privilege_type,p.oid::regprocedure,
   CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
   CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END) AS restore_grant_sql
FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
WHERE p.oid IN (to_regprocedure('public.org_role_default_permissions(text)'),to_regprocedure('public.get_organization_core(uuid)'));

-- Backup ALL policies of these tables, retaining unrelated and restrictive
-- expressions for post-apply comparison. Restore only the named changed policies.
SELECT tablename,policyname,permissive,roles,cmd,qual,with_check,
 'CREATE POLICY '||quote_ident(policyname)||' ON '||quote_ident(schemaname)||'.'||quote_ident(tablename)
 ||' AS '||permissive||' FOR '||cmd||' TO '
 ||(SELECT string_agg(CASE role_name WHEN 'public' THEN 'PUBLIC' ELSE quote_ident(role_name) END,', ')
    FROM unnest(roles::text[]) role_name)
 ||COALESCE(' USING ('||qual||')','')||COALESCE(' WITH CHECK ('||with_check||')','')||';' AS restore_policy_sql
FROM pg_policies WHERE schemaname='public' AND tablename IN ('companies','labor_safety_groups','labor_safety_records','organizations')
ORDER BY tablename,policyname;
