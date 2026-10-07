WITH expected_functions(signature,expected_md5) AS (VALUES ('public.get_course_student_test_results_page(uuid,integer,integer,text,text,text)','9009d8f0b0480aeeff590b63dccacbc3'),
 ('public.get_course_students_page(uuid,integer,integer,text,text)','7eba308561b797a6959168e37d85a931'),
 ('public.get_course_students_stats(uuid)','c7d78df2a8a802e6b77d4dafde85205b'),
 ('public.get_organization_course_overview(uuid)','8d7e1374ac51f0600baee68d3a57d155'),
 ('public.get_organization_dashboard_summary(uuid)','1986673325d4e4e66e0fc690a1b00424'),
 ('public.get_organization_student_group_counts(uuid)','c8ef4b60f5981e5c1d332486e8c0e867'),
 ('public.get_organization_students_counts(uuid)','e139f9f9cddeabc78434bf0f861936e0'),
 ('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)','79178b91a3749a6f5e3f3d379306c846')),
required_columns(table_name,column_name,type_name) AS (VALUES ('profiles','user_id','uuid'),
 ('profiles','organization_id','uuid'),
 ('profiles','archived_at','timestamp with time zone'),
 ('profiles','full_name','text'),
 ('profiles','email','text'),
 ('profiles','login','text'),
 ('org_staff','user_id','uuid'),
 ('org_staff','organization_id','uuid'),
 ('org_staff','expires_at','timestamp with time zone'),
 ('courses','id','uuid'),
 ('courses','organization_id','uuid'),
 ('courses','title','text'),
 ('enrollments','id','uuid'),
 ('enrollments','user_id','uuid'),
 ('enrollments','course_id','uuid'),
 ('enrollments','progress','integer'),
 ('enrollments','status','text'),
 ('enrollments','started_at','timestamp with time zone'),
 ('enrollments','completed_at','timestamp with time zone'),
 ('enrollments','time_spent','integer'),
 ('lessons','id','uuid'),
 ('lessons','course_id','uuid'),
 ('lessons','type','text'),
 ('lessons','title','text'),
 ('lessons','order_index','integer'),
 ('lessons','test_passing_score','integer'),
 ('test_attempts','id','uuid'),
 ('test_attempts','user_id','uuid'),
 ('test_attempts','lesson_id','uuid'),
 ('test_attempts','score','integer'),
 ('test_attempts','max_score','integer'),
 ('test_attempts','passing_score','integer'),
 ('test_attempts','passed','boolean'),
 ('test_attempts','completed_at','timestamp with time zone'),
 ('course_manual_credits','enrollment_id','uuid'),
 ('course_manual_credits','credited_at','timestamp with time zone'),
 ('course_manual_credits','revoked_at','timestamp with time zone'),
 ('student_deletion_log','student_id','uuid'),
 ('student_deletion_log','organization_id','uuid'),
 ('student_deletion_log','deleted_by','uuid'),
 ('student_deletion_log','metadata','jsonb')),
checks(check_name,ok) AS (
 SELECT 'exact live definition: '||signature, COALESCE(md5(replace(pg_get_functiondef(to_regprocedure(signature)),chr(13)||chr(10),chr(10)))=expected_md5,false) FROM expected_functions
 UNION ALL SELECT 'function ownership: '||e.signature,COALESCE(pg_has_role(current_user,p.proowner,'USAGE'),false) FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 UNION ALL SELECT 'column: '||r.table_name||'.'||r.column_name,EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||r.table_name) AND a.attname=r.column_name AND a.attnum>0 AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)=r.type_name) FROM required_columns r
 UNION ALL SELECT 'required helpers',NOT EXISTS(SELECT 1 FROM (VALUES ('auth.uid()'),('public.has_role(uuid,public.app_role)'),('public.is_org_owner(uuid,uuid)'),('public.is_student_profile(uuid,uuid)'),('public.has_org_staff_permission(uuid,uuid,text)')) f(signature) WHERE to_regprocedure(signature) IS NULL)
 UNION ALL SELECT 'public schema create',has_schema_privilege(current_user,'public','CREATE')
 UNION ALL SELECT 'organizations reference permission',has_table_privilege(current_user,'public.organizations','REFERENCES')
 UNION ALL SELECT 'ledger access',has_table_privilege(current_user,'supabase_migrations.schema_migrations','SELECT') AND has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT')
 UNION ALL SELECT 'both ledger rows absent',NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261007100000','20261007101000'))
 UNION ALL SELECT 'marker table absent',to_regclass('public.student_roster_removals') IS NULL
 UNION ALL SELECT 'new RPCs absent',to_regprocedure('public.set_archived_student_removed(uuid,uuid,boolean)') IS NULL AND to_regprocedure('public.get_student_learning_results(uuid,uuid)') IS NULL
)
SELECT current_user AS executor,check_name,ok FROM checks ORDER BY check_name;
