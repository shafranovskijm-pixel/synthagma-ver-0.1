-- Read-only backup before the S-048 release. No CRM/customer rows are returned.
SELECT jsonb_build_object(
 'observed_at',clock_timestamp(),
 'deletion_snapshot',(SELECT jsonb_build_object('definition',pg_get_functiondef(p.oid),'body_md5',md5(p.prosrc),'acl',p.proacl,'owner',pg_get_userbyid(p.proowner)) FROM pg_proc p WHERE p.oid='public.account_deletion_snapshot(uuid)'::regprocedure),
 'crm_namespace',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind)) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'org_crm_%'),
 'crm_functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'org_crm_%'),
 'ledger',(SELECT jsonb_agg(to_jsonb(m)) FROM supabase_migrations.schema_migrations m WHERE m.version='20261012200000')
) AS crm_backup_before;
