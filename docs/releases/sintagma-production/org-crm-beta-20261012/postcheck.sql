SELECT 'org_crm_clients:rls' AS check_name,(SELECT relrowsecurity FROM pg_class WHERE oid='public.org_crm_clients'::regclass) AS ok
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
SELECT 'account_deletion_snapshot:four_new_tables_only' AS check_name,(SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='1f973f5048873db00cf52e0293f14b71' FROM pg_proc WHERE oid='public.account_deletion_snapshot(uuid)'::regprocedure) AS ok;
