WITH f AS (SELECT * FROM pg_proc WHERE oid=to_regprocedure('public.save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)')),
 checks(check_name,ok) AS (
 SELECT 'department text and nullable',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.profiles') AND attname='department' AND attnum>0 AND NOT attisdropped AND atttypid='text'::regtype AND NOT attnotnull)
 UNION ALL SELECT 'exact RPC body',COALESCE((SELECT md5(prosrc)='cb2ac19a504c810c9d15e38dd4f9b0f5' FROM f),false)
 UNION ALL SELECT 'RPC security definer',COALESCE((SELECT prosecdef FROM f),false)
 UNION ALL SELECT 'RPC fixed search path',COALESCE((SELECT proconfig @> ARRAY['search_path=public, pg_temp'] FROM f),false)
 UNION ALL SELECT 'anon execute denied',NOT COALESCE((SELECT has_function_privilege('anon',oid,'EXECUTE') FROM f),true)
 UNION ALL SELECT 'authenticated execute denied',NOT COALESCE((SELECT has_function_privilege('authenticated',oid,'EXECUTE') FROM f),true)
 UNION ALL SELECT 'PUBLIC execute denied',NOT EXISTS(SELECT 1 FROM f,LATERAL aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')
 UNION ALL SELECT 'service_role execute granted',COALESCE((SELECT has_function_privilege('service_role',oid,'EXECUTE') FROM f),false)
 UNION ALL SELECT 'exact ledger row',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260929140000' AND name='student_registration_details' AND array_length(statements,1)=1 AND md5(statements[1])='8c9402bfaeb72420586be5a67ded3476')
 )
SELECT check_name,ok FROM checks ORDER BY check_name;
