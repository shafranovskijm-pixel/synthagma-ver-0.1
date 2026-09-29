-- READ ONLY. First verify the selected Cloud project is ORIGINAL SINTAGMA / atxwvjxbqjgkbjlhsdch.
-- SQL cannot independently authenticate the provider project identity. All rows must be true.
WITH required_columns(relation_name,column_name) AS (VALUES ('public.courses','id'),
 ('public.courses','organization_id'),
 ('public.courses','is_published'),
 ('public.lessons','id'),
 ('public.lessons','course_id'),
 ('public.lessons','module_id'),
 ('public.lessons','type'),
 ('public.lessons','order_index'),
 ('public.lessons','test_questions_to_show'),
 ('public.lessons','test_passing_score'),
 ('public.lessons','test_show_answers'),
 ('public.course_modules','id'),
 ('public.course_modules','course_id'),
 ('public.course_modules','order_index'),
 ('public.profiles','user_id'),
 ('public.profiles','blocked_at'),
 ('public.enrollments','id'),
 ('public.enrollments','user_id'),
 ('public.enrollments','course_id'),
 ('public.test_attempt_sessions','id'),
 ('public.test_attempt_sessions','user_id'),
 ('public.test_attempt_sessions','lesson_id'),
 ('public.test_attempt_sessions','request_id'),
 ('public.test_attempt_sessions','status'),
 ('public.test_attempt_sessions','started_at'),
 ('public.test_attempt_sessions','submitted_at'),
 ('public.test_attempt_sessions','questions_snapshot'),
 ('public.test_attempt_sessions','passing_score'),
 ('public.test_attempt_sessions','show_answers'),
 ('public.test_attempt_start_requests','user_id'),
 ('public.test_attempt_start_requests','lesson_id'),
 ('public.test_attempt_start_requests','request_id'),
 ('public.test_attempt_start_requests','session_id'),
 ('public.test_attempts','id'),
 ('public.test_attempts','user_id'),
 ('public.test_attempts','lesson_id'),
 ('public.test_attempts','session_id'),
 ('public.test_attempts','started_at'),
 ('public.test_attempts','completed_at'),
 ('public.test_attempts','score'),
 ('public.test_attempts','max_score'),
 ('public.test_attempts','answers'),
 ('public.test_attempts','shown_question_ids'),
 ('public.test_attempts','passing_score'),
 ('public.test_attempts','passed'),
 ('public.test_questions','id'),
 ('public.test_questions','lesson_id'),
 ('public.test_questions','question'),
 ('public.test_questions','options'),
 ('public.test_questions','correct_answer'),
 ('public.test_questions','order_index'),
 ('public.test_questions','explanation'),
 ('public.test_questions','image_url'),
 ('public.test_questions','is_bank_question'),
 ('public.lesson_progress','user_id'),
 ('public.lesson_progress','lesson_id'),
 ('public.lesson_progress','completed'),
 ('public.lesson_progress','completed_at'),
 ('storage.objects','id'),
 ('storage.objects','bucket_id'),
 ('storage.objects','name'),
 ('storage.objects','created_at'),
 ('storage.objects','metadata'),
 ('storage.buckets','id'),
 ('storage.buckets','name'),
 ('storage.buckets','public'),
 ('storage.buckets','file_size_limit'),
 ('storage.buckets','allowed_mime_types'),
 ('supabase_migrations.schema_migrations','version'),
 ('supabase_migrations.schema_migrations','name'),
 ('supabase_migrations.schema_migrations','statements')),
 required_functions(signature) AS (VALUES ('auth.uid()'),
 ('public.can_access_course_as_learner(uuid)'),
 ('public.can_access_lesson(uuid,text)'),
 ('public._assert_test_learner_access(uuid)'),
 ('public._test_manual_credit(uuid)'),
 ('public._test_attempt_limits(uuid,uuid)'),
 ('public._test_session_payload(uuid)'),
 ('public._test_grade_payload(uuid)'),
 ('public._test_public_questions(jsonb,boolean)'),
 ('public._test_normalize_options(jsonb,integer)')),
 expected_previous(signature,source_md5) AS (VALUES ('public.get_student_test_state(uuid)','786137528d43b748a46963d3dcb0aeef'),
 ('public.start_test_attempt(uuid,uuid)','a3e10950942b32d7ce1d25ac590a97d5'),
 ('public.submit_test_attempt(uuid,jsonb)','1a998964238fb2e2b62ec0c9e2a6ee5f')),
 new_functions(signature) AS (VALUES ('public._final_test_photo_required(uuid)'),
 ('public.can_upload_final_test_photo(text)'),
 ('public.can_read_final_test_photo(text)'),
 ('public._final_test_photo_object_valid(uuid)'),
 ('public.prepare_final_test_photo(uuid,uuid)'),
 ('public.complete_final_test_photo(uuid)'),
 ('public.get_test_attempt_photo(uuid)')),
 checks(check_name,ok) AS (
 SELECT 'required_columns', NOT EXISTS(SELECT 1 FROM required_columns r WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(r.relation_name) AND a.attname=r.column_name AND a.attnum>0 AND NOT a.attisdropped))
 UNION ALL SELECT 'required_functions',NOT EXISTS(SELECT 1 FROM required_functions WHERE to_regprocedure(signature) IS NULL)
 UNION ALL SELECT 'api_roles',NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(name) WHERE to_regrole(name) IS NULL)
 UNION ALL SELECT 'schema_create_permission',has_schema_privilege(current_user,'public','CREATE') AND has_schema_privilege(current_user,'public','USAGE') AND has_schema_privilege(current_user,'storage','USAGE')
 UNION ALL SELECT 'alter_target_ownership',NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN (to_regclass('public.courses'),to_regclass('public.test_attempt_sessions')) AND NOT pg_has_role(current_user,c.relowner,'USAGE'))
 UNION ALL SELECT 'storage_policy_capability',coalesce((SELECT pg_has_role(current_user,c.relowner,'USAGE') FROM pg_class c WHERE c.oid=to_regclass('storage.objects')),false) OR EXISTS(SELECT 1 FROM pg_settings s WHERE s.name='supautils.policy_grants' AND s.context='sighup' AND s.vartype='string' AND jsonb_typeof(s.setting::jsonb->current_user::text)='array' AND (s.setting::jsonb->current_user::text) ? 'storage.objects')
 UNION ALL SELECT 'replace_rpc_ownership',NOT EXISTS(SELECT 1 FROM expected_previous e JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) WHERE NOT pg_has_role(current_user,p.proowner,'USAGE'))
 UNION ALL SELECT 'ledger_bucket_write_permissions',has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT') AND has_table_privilege(current_user,'storage.buckets','INSERT') AND has_table_privilege(current_user,'storage.buckets','UPDATE')
 UNION ALL SELECT 'replaced_rpc_source_hashes',NOT EXISTS(SELECT 1 FROM expected_previous e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) WHERE p.oid IS NULL OR md5(replace(p.prosrc,chr(13)||chr(10),chr(10))) IS DISTINCT FROM e.source_md5)
 UNION ALL SELECT 'prior_attempt_migrations_recorded',(SELECT count(*)=2 FROM supabase_migrations.schema_migrations WHERE version IN ('20260907120000','20260907120001'))
 UNION ALL SELECT 's029_version_absent',NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260929120000')
 UNION ALL SELECT 's029_table_absent',to_regclass('public.final_test_photo_challenges') IS NULL
 UNION ALL SELECT 's029_columns_absent',NOT EXISTS(SELECT 1 FROM pg_attribute WHERE (attrelid=to_regclass('public.courses') AND attname='require_final_test_photo' OR attrelid=to_regclass('public.test_attempt_sessions') AND attname='requires_final_test_photo') AND attnum>0 AND NOT attisdropped)
 UNION ALL SELECT 's029_functions_absent',NOT EXISTS(SELECT 1 FROM new_functions WHERE to_regprocedure(signature) IS NOT NULL)
 UNION ALL SELECT 's029_bucket_absent',NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='final-test-photos')
 UNION ALL SELECT 's029_policies_absent',NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('storage.objects') AND polname LIKE 'final_test_photos%')
 UNION ALL SELECT 'storage_owner_column',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('storage.objects') AND attname IN ('owner_id','owner') AND attnum>0 AND NOT attisdropped)
 UNION ALL SELECT 'storage_rls',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('storage.objects')),false)
 UNION ALL SELECT 'learner_result_insert_denied',NOT has_table_privilege('authenticated','public.test_attempts','INSERT') AND NOT has_table_privilege('anon','public.test_attempts','INSERT')
 )
SELECT check_name,ok FROM checks ORDER BY check_name;

