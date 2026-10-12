-- Read only: save this result before the release, outside the public repository.
SELECT jsonb_build_object(
 'table',(SELECT to_jsonb(x) FROM (SELECT relowner::regrole::text owner,relacl,relrowsecurity,relforcerowsecurity
   FROM pg_class WHERE oid='public.org_custom_roles'::regclass) x),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p
   WHERE schemaname='public' AND tablename='org_custom_roles'),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) ORDER BY tgname)
   FROM pg_trigger WHERE tgrelid='public.org_custom_roles'::regclass AND NOT tgisinternal),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,'definition',pg_get_functiondef(oid),
   'owner',proowner::regrole::text,'acl',proacl) ORDER BY oid::regprocedure::text)
   FROM pg_proc WHERE oid IN (
    'public.can_access_organization(uuid,text)'::regprocedure,'public.has_org_staff_permission(uuid,uuid,text)'::regprocedure,
    'public.get_org_staff_permissions(uuid,uuid)'::regprocedure,'public.normalize_org_staff_permission(text)'::regprocedure,
    'public.org_role_default_permissions(text)'::regprocedure,'public.has_role(uuid,app_role)'::regprocedure,
    'public.has_role(app_role,uuid)'::regprocedure,'public.account_deletion_access_allowed()'::regprocedure,
    'public.touch_updated_at()'::regprocedure))
) AS custom_roles_backup;
