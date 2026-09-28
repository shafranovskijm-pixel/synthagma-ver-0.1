-- READ ONLY. Save this result privately on D before replacing the three RPCs.
-- No tokens, passwords or learner data selected. Do not post definitions/ACL outside this release.
SELECT p.oid::regprocedure::text AS signature, pg_get_userbyid(p.proowner) AS function_owner,
 pg_get_functiondef(p.oid) AS definition, p.proacl::text AS explicit_acl,
 md5(replace(p.prosrc,chr(13)||chr(10),chr(10))) AS source_lf_md5,
 (SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'grantor',pg_get_userbyid(x.grantor),'privilege',x.privilege_type,'grantable',x.is_grantable)) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x) AS effective_acl
FROM pg_proc p WHERE p.oid IN (to_regprocedure('public.start_test_attempt(uuid,uuid)'),to_regprocedure('public.submit_test_attempt(uuid,jsonb)'),to_regprocedure('public.get_student_test_state(uuid)')) ORDER BY signature;

SELECT version,name,cardinality(statements) AS statement_count,
 md5(replace(array_to_string(statements,E'\n'),chr(13)||chr(10),chr(10))) AS statement_lf_md5
FROM supabase_migrations.schema_migrations ORDER BY version;
