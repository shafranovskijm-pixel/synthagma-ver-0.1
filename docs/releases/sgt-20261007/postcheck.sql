WITH expected_bodies(signature,expected_md5) AS (VALUES ('public.get_course_student_test_results_page(uuid,integer,integer,text,text,text)','3b0477021dab332faf915c4068b645cd'),
 ('public.get_course_students_page(uuid,integer,integer,text,text)','96c769a4aef12c31a26cf60ed5fee3a6'),
 ('public.get_course_students_stats(uuid)','d2c479644a57371ea661375aeb2b49cf'),
 ('public.get_organization_course_overview(uuid)','1574858ae7f1160d9fb878b9d9d957d5'),
 ('public.get_organization_dashboard_summary(uuid)','356209e0c2140498976ce0e120692b3f'),
 ('public.get_organization_student_group_counts(uuid)','44fa97c91b5b3d2a4189c7be1ea23114'),
 ('public.get_organization_students_counts(uuid)','9f1698ff10ee1259ae3612c83b0b59a4'),
 ('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)','da30d027a3965293a07917a0fed51cf6'),
 ('public.set_archived_student_removed(uuid,uuid,boolean)','6f4d6ca9ec126765dfb7357b0a6984f8'),
 ('public.get_student_learning_results(uuid,uuid)','3513cc3b320806f392e672b15e57fb5b')),
new_functions AS (SELECT * FROM pg_proc WHERE oid IN (to_regprocedure('public.set_archived_student_removed(uuid,uuid,boolean)'),to_regprocedure('public.get_student_learning_results(uuid,uuid)'))),
checks(check_name,ok) AS (
 SELECT 'exact RPC body: '||e.signature,COALESCE(md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=e.expected_md5,false) FROM expected_bodies e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 UNION ALL SELECT 'marker RLS',COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.student_roster_removals')),false)
 UNION ALL SELECT 'no direct authenticated marker writes',NOT has_table_privilege('authenticated','public.student_roster_removals','INSERT,UPDATE,DELETE')
 UNION ALL SELECT 'no anon marker access',NOT has_table_privilege('anon','public.student_roster_removals','SELECT,INSERT,UPDATE,DELETE')
 UNION ALL SELECT 'new RPC security definer and fixed path',count(*)=2 AND bool_and(prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp']) FROM new_functions
 UNION ALL SELECT 'new RPC authenticated execute',count(*)=2 AND bool_and(has_function_privilege('authenticated',oid,'EXECUTE')) FROM new_functions
 UNION ALL SELECT 'new RPC anon denied',count(*)=2 AND bool_and(NOT has_function_privilege('anon',oid,'EXECUTE')) FROM new_functions
 UNION ALL SELECT 'new RPC PUBLIC denied',NOT EXISTS(SELECT 1 FROM new_functions f,LATERAL aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
 UNION ALL SELECT 'exact ledger: 20261007100000',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007100000' AND name='student_archive_removal' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='8fb90b0b12d80b372f929897fdad5d46')
 UNION ALL SELECT 'exact ledger: 20261007101000',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007101000' AND name='student_learning_results' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='b0f57a122a371e12f49822ae7f57753d')
)
SELECT check_name,ok FROM checks ORDER BY check_name;
