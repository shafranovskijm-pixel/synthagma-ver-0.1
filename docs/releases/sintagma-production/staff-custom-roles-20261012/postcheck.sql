SELECT 'custom_role_policy_count' AS check_name,count(*)=5 AS ok
FROM pg_policies WHERE schemaname='public' AND tablename='org_custom_roles'
UNION ALL
SELECT 'custom_role_scoped_'||e.command,EXISTS(
 SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='org_custom_roles'
 AND p.policyname=e.policy_name AND p.permissive='PERMISSIVE' AND p.cmd=e.command
 AND p.roles=ARRAY['authenticated']::name[]
 AND coalesce(p.qual,'')=coalesce(e.qual,'') AND coalesce(p.with_check,'')=coalesce(e.check_expr,''))
FROM (VALUES
 ('Org staff can read custom roles','SELECT','can_access_organization(organization_id, ''staff.read''::text)',NULL),
 ('Org staff can insert custom roles','INSERT',NULL,'can_access_organization(organization_id, ''staff.write''::text)'),
 ('Org staff can update custom roles','UPDATE','can_access_organization(organization_id, ''staff.write''::text)','can_access_organization(organization_id, ''staff.write''::text)'),
 ('Org staff can delete custom roles','DELETE','can_access_organization(organization_id, ''staff.write''::text)',NULL)
) e(policy_name,command,qual,check_expr)
UNION ALL
SELECT 'revocation_fence_unchanged',EXISTS(SELECT 1 FROM pg_policies
 WHERE schemaname='public' AND tablename='org_custom_roles' AND policyname='account_deletion_no_revoked_access'
 AND permissive='RESTRICTIVE' AND cmd='ALL' AND roles=ARRAY['authenticated']::name[]
 AND md5(qual)='99a326c0f33883b22c156502d80e9740' AND md5(with_check)='99a326c0f33883b22c156502d80e9740')
UNION ALL
SELECT 'table_rls_enabled',relrowsecurity AND NOT relforcerowsecurity
FROM pg_class WHERE oid='public.org_custom_roles'::regclass;
