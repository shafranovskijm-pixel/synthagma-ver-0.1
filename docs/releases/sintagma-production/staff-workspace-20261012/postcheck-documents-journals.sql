-- Read-only; run inside the same release transaction before COMMIT.
WITH expected(signature,body_md5) AS (VALUES ('public.get_documents_kpi(uuid)','bf2a4257aa25cc98c117cf493fd37af3'),
('public.list_recycle_bin(uuid,text,integer,integer)','809e2faab1878886e39d113c2b31a56c'),
('public.soft_delete_document(text,uuid)','1636bd7fd1137589b38939cc8c94b025'),
('public.restore_document(text,uuid)','35b9752df3748bb27fcd4244ef837512')) SELECT e.signature AS check_name,COALESCE(md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=e.body_md5,false) AS ok FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
WITH expected(signature) AS (VALUES ('public.get_documents_kpi(uuid)'),('public.list_recycle_bin(uuid,text,integer,integer)'),('public.soft_delete_document(text,uuid)'),('public.restore_document(text,uuid)')) SELECT signature||' grants' AS check_name,has_function_privilege('authenticated',signature,'EXECUTE') AND has_function_privilege('service_role',signature,'EXECUTE') AND NOT has_function_privilege('anon',signature,'EXECUTE') AND NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure(signature) AND a.grantee=0 AND a.privilege_type='EXECUTE') AS ok FROM expected;
WITH expected(table_name,policy_name,command,permission) AS (VALUES ('journal_instances','Organization members can view their journal instances','SELECT','journals.read'),
('journal_instances','Organization members can create journal instances','INSERT','journals.write'),
('journal_instances','Organization members can update journal instances','UPDATE','journals.write'),
('journal_instances','Organization members can delete journal instances','DELETE','journals.write'),
('journal_entries','Organization members can view their journal entries','SELECT','journals.read'),
('journal_entries','Organization members can create journal entries','INSERT','journals.write'),
('journal_entries','Organization members can update journal entries','UPDATE','journals.write'),
('journal_entries','Organization members can delete journal entries','DELETE','journals.write')) SELECT e.table_name||' / '||e.policy_name AS check_name,COALESCE(p.cmd=e.command AND p.permissive='PERMISSIVE' AND p.roles=ARRAY['authenticated']::name[] AND (e.command='INSERT' OR strpos(p.qual,'can_access_organization')>0 AND strpos(p.qual,e.permission)>0) AND (e.command NOT IN ('INSERT','UPDATE') OR strpos(p.with_check,'can_access_organization')>0 AND strpos(p.with_check,e.permission)>0),false) AS ok FROM expected e LEFT JOIN pg_policies p ON p.schemaname='public' AND p.tablename=e.table_name AND p.policyname=e.policy_name;
SELECT t.name||' deletion fence' AS check_name,EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.name AND p.policyname='account_deletion_no_revoked_access' AND p.permissive='RESTRICTIVE' AND p.cmd='ALL') AS ok FROM (VALUES('journal_instances'),('journal_entries')) t(name);
SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('journal_instances','journal_entries') ORDER BY tablename,policyname;
