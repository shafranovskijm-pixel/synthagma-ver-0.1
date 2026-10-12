-- Read-only catalog metadata. No sender rows, credentials, vault values or mail are read.
WITH scoped_tables AS (
 SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
 AND (c.relname LIKE 'mailing_%' OR c.relname IN ('org_smtp_settings','email_campaigns','email_campaign_recipients'))
), scoped_functions AS (
 SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND (
 p.proname IN ('can_access_organization','has_role','has_org_staff_permission','get_org_staff_permissions',
 'normalize_org_staff_permission','org_role_default_permissions','account_deletion_access_allowed',
 'get_mailing_sender_secret','get_mailing_deliverability_seed_secret','trigger_encrypt_mailing_sender_password',
 'set_mailing_sender_warmup','import_mailing_senders_batch','activate_verified_mailing_senders',
 'get_decrypted_org_smtp','save_mailing_sender','set_mailing_sender_active')
 OR p.prosrc LIKE '%email.manage%')
)
SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,'definition',pg_get_functiondef(oid),
   'body_md5',md5(replace(prosrc,chr(13)||chr(10),chr(10))),'owner',proowner::regrole::text,'acl',proacl) ORDER BY oid::regprocedure::text) FROM scoped_functions),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'owner',relowner::regrole::text,'acl',relacl,
   'rls',relrowsecurity,'force_rls',relforcerowsecurity) ORDER BY relname) FROM scoped_tables),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p
   WHERE p.schemaname='public' AND p.tablename IN (SELECT relname FROM scoped_tables)),
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'not_null',a.attnotnull,'acl',a.attacl,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum)
   FROM scoped_tables c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
   LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',tgname,'enabled',tgenabled,
   'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid::regclass::text,tgname)
   FROM pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM scoped_tables) AND NOT t.tgisinternal),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid))
   ORDER BY conrelid::regclass::text,conname) FROM pg_constraint WHERE conrelid IN (SELECT oid FROM scoped_tables))
) AS mailing_catalog_backup;
