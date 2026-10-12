SELECT 'org_crm_resolve_subject:body' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='8351237283ffa0dffc504577be7f425c' AND prosecdef FROM pg_proc WHERE oid='public.org_crm_resolve_subject(uuid,text,uuid)'::regprocedure) AS ok
UNION ALL
SELECT 'org_crm_resolve_subject:acl' AS check_name,(NOT has_function_privilege('anon','public.org_crm_resolve_subject(uuid,text,uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','public.org_crm_resolve_subject(uuid,text,uuid)','EXECUTE')) AS ok
UNION ALL
SELECT 'org_crm_link_subject:body' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='3b7ba6aa76f7afac45c97673ed682cd5' AND prosecdef FROM pg_proc WHERE oid='public.org_crm_link_subject(uuid,text,uuid,uuid)'::regprocedure) AS ok
UNION ALL
SELECT 'org_crm_link_subject:acl' AS check_name,(NOT has_function_privilege('anon','public.org_crm_link_subject(uuid,text,uuid,uuid)','EXECUTE') AND has_function_privilege('authenticated','public.org_crm_link_subject(uuid,text,uuid,uuid)','EXECUTE')) AS ok
UNION ALL
SELECT 'org_crm_context:body' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='c9cebf28436ec578635dc1290dadaded' AND prosecdef FROM pg_proc WHERE oid='public.org_crm_context(uuid,text,uuid)'::regprocedure) AS ok
UNION ALL
SELECT 'org_crm_context:acl' AS check_name,(NOT has_function_privilege('anon','public.org_crm_context(uuid,text,uuid)','EXECUTE') AND has_function_privilege('authenticated','public.org_crm_context(uuid,text,uuid)','EXECUTE')) AS ok
UNION ALL
SELECT 'column:company_id' AS check_name,(SELECT NOT attnotnull AND format_type(atttypid,atttypmod)='uuid' FROM pg_attribute WHERE attrelid='public.org_crm_clients'::regclass AND attname='company_id' AND NOT attisdropped) AS ok
UNION ALL
SELECT 'column:student_user_id' AS check_name,(SELECT NOT attnotnull AND format_type(atttypid,atttypmod)='uuid' FROM pg_attribute WHERE attrelid='public.org_crm_clients'::regclass AND attname='student_user_id' AND NOT attisdropped) AS ok
UNION ALL
SELECT 'column:linked_at' AS check_name,(SELECT NOT attnotnull AND format_type(atttypid,atttypmod)='timestamp with time zone' FROM pg_attribute WHERE attrelid='public.org_crm_clients'::regclass AND attname='linked_at' AND NOT attisdropped) AS ok
UNION ALL
SELECT 'source_fks_set_null' AS check_name,(SELECT count(*)=2 FROM pg_constraint WHERE conrelid='public.org_crm_clients'::regclass AND contype='f' AND confrelid IN('public.companies'::regclass,'public.profiles'::regclass) AND confdeltype='n' AND convalidated) AS ok
UNION ALL
SELECT 'unique_context_indexes' AS check_name,(SELECT count(*)=2 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.org_crm_clients'::regclass AND c.relname IN('org_crm_clients_company_subject','org_crm_clients_student_subject') AND i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL) AS ok
UNION ALL
SELECT 'one_source_and_link_date' AS check_name,(SELECT count(*)=2 FROM pg_constraint WHERE conrelid='public.org_crm_clients'::regclass AND conname IN('org_crm_clients_one_subject','org_crm_clients_link_timestamp') AND contype='c' AND convalidated) AS ok
UNION ALL
SELECT 'deletion_shared_relation' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='3c63dd990d2c0cd876c0fe10b2ee2f4a' FROM pg_proc WHERE oid='public.account_deletion_snapshot(uuid)'::regprocedure) AS ok;
