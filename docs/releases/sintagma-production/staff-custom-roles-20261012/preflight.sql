-- Read-only catalog assertions. No production rows or schema objects are changed.
DO $preflight$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('can_access_organization(uuid,text)','ad720ba20dc32362ed009b2917cc2d9c'),
    ('has_org_staff_permission(uuid,uuid,text)','b9c87ca03c3e95a57baf9122753792e2'),
    ('get_org_staff_permissions(uuid,uuid)','f8d82709ae27730782dc4f455b35b7de'),
    ('normalize_org_staff_permission(text)','2d47924fe022372f2dc128a979d56a53'),
    ('org_role_default_permissions(text)','2e440ec2b8552f215d00bd88ad7af166'),
    ('has_role(uuid,app_role)','4e852b30ef52ba5263c4e11d1aec8cf0'),
    ('has_role(app_role,uuid)','5457df2171dee5cee3641e64285928f2'),
    ('account_deletion_access_allowed()','6c078d0f1aa1f6b5af15485f0eaccb2a')
  ) x(signature,body_md5) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||r.signature)
        AND p.prosecdef=(r.signature NOT IN ('normalize_org_staff_permission(text)','org_role_default_permissions(text)'))
        AND p.provolatile=CASE WHEN r.signature IN ('normalize_org_staff_permission(text)','org_role_default_permissions(text)') THEN 'i'::"char"
          WHEN r.signature='has_role(app_role,uuid)' THEN 'v'::"char" ELSE 's'::"char" END
        AND md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=r.body_md5
        AND p.proconfig=CASE WHEN r.signature='account_deletion_access_allowed()'
          THEN ARRAY['search_path=pg_catalog, public'] ELSE ARRAY['search_path=public'] END
    ) THEN RAISE EXCEPTION 'Unreviewed custom-role access helper: %',r.signature; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.org_custom_roles'::regclass
    AND relrowsecurity AND NOT relforcerowsecurity AND pg_has_role(current_user,relowner,'USAGE'))
    OR NOT has_table_privilege('authenticated','public.org_custom_roles','SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'Custom-role RLS/ownership/grant precondition failed'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='org_custom_roles')<>3
  THEN RAISE EXCEPTION 'Unreviewed custom-role policy inventory'; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('Org owners manage custom roles','PERMISSIVE','ALL',ARRAY['public']::name[],
      'aa113fc3b5d28351c7b18bc219bfe6ef','aa113fc3b5d28351c7b18bc219bfe6ef'),
    ('Org staff read custom roles','PERMISSIVE','SELECT',ARRAY['public']::name[],
      '1f959ab7be157d1bfc86986c1363af5e','d41d8cd98f00b204e9800998ecf8427e'),
    ('account_deletion_no_revoked_access','RESTRICTIVE','ALL',ARRAY['authenticated']::name[],
      '99a326c0f33883b22c156502d80e9740','99a326c0f33883b22c156502d80e9740')
  ) x(policy_name,permissive,command,roles,qual_md5,check_md5) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='org_custom_roles'
      AND p.policyname=r.policy_name AND p.permissive=r.permissive AND p.cmd=r.command AND p.roles=r.roles
      AND md5(coalesce(p.qual,''))=r.qual_md5 AND md5(coalesce(p.with_check,''))=r.check_md5)
    THEN RAISE EXCEPTION 'Unreviewed custom-role policy: %',r.policy_name; END IF;
  END LOOP;
END $preflight$;
SELECT NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012123000') AS version_absent;
