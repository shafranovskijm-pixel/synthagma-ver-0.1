-- READ ONLY. Exact expected catalog contract from unchanged migration in isolated PostgreSQL/PGlite.
-- Each *_ok must be true. Definition formatting hashes can vary across PostgreSQL versions;
-- a mismatch requires inspection, never silently changing expected values or reapplying SQL.
WITH expected(signature,source_md5,security_definer,volatility,result_type,anon_execute,authenticated_execute,service_execute) AS (VALUES ('public._final_test_photo_object_valid(uuid)','192f17b80230f666f8f59de6400b90a3',true,'s','boolean',false,false,NULL::boolean),
 ('public._final_test_photo_required(uuid)','ead406dd3f1391fb3c4e771d35288c3a',true,'s','boolean',false,false,NULL::boolean),
 ('public.can_read_final_test_photo(text)','608a4c23df488cd21f803010f45b5422',true,'s','boolean',true,true,true),
 ('public.can_upload_final_test_photo(text)','d65f44b2a1728374d100add684334f87',true,'s','boolean',true,true,true),
 ('public.complete_final_test_photo(uuid)','ceb7f48950d0e03d99e95ecc1383aa09',true,'v','jsonb',false,true,true),
 ('public.get_student_test_state(uuid)','a89422830aa2dda33581fa9c82de1885',true,'v','jsonb',false,true,true),
 ('public.get_test_attempt_photo(uuid)','eba255b2e06e822f5525c1a809e788c8',true,'v','jsonb',false,true,true),
 ('public.prepare_final_test_photo(uuid,uuid)','2f8370754c5a6afe4988df98f5dd2111',true,'v','jsonb',false,true,true),
 ('public.start_test_attempt(uuid,uuid)','93f7f7fb360e93929bf0497836ac0576',true,'v','jsonb',false,true,true),
 ('public.submit_test_attempt(uuid,jsonb)','a2aca06cead480bbe1f8fa95e6ad0863',true,'v','jsonb',false,true,true))
SELECT e.signature,p.oid IS NOT NULL AS exists_ok,md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=e.source_md5 AS source_hash_ok,
 p.prosecdef=e.security_definer AS security_definer_ok,p.provolatile::text=e.volatility AS volatility_ok,
 p.proconfig=ARRAY['search_path=public, pg_temp']::text[] AS search_path_ok,pg_get_function_result(p.oid)=e.result_type AS result_type_ok,
 has_function_privilege('anon',p.oid,'EXECUTE')=e.anon_execute AS anon_acl_ok,
 has_function_privilege('authenticated',p.oid,'EXECUTE')=e.authenticated_execute AS authenticated_acl_ok,
 (e.service_execute IS NULL OR has_function_privilege('service_role',p.oid,'EXECUTE')=e.service_execute) AS service_acl_ok
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) ORDER BY e.signature;

WITH expected(name,type,not_null,default_expr) AS (VALUES ('id','uuid',true,'gen_random_uuid()'),
 ('user_id','uuid',true,NULL),
 ('course_id','uuid',true,NULL),
 ('lesson_id','uuid',true,NULL),
 ('enrollment_id','uuid',true,NULL),
 ('request_id','uuid',true,NULL),
 ('object_path','text',true,NULL),
 ('storage_object_id','uuid',false,NULL),
 ('created_at','timestamp with time zone',true,'clock_timestamp()'),
 ('expires_at','timestamp with time zone',true,NULL),
 ('completed_at','timestamp with time zone',false,NULL),
 ('session_id','uuid',false,NULL))
SELECT e.name,a.attname IS NOT NULL AS exists_ok,format_type(a.atttypid,a.atttypmod)=e.type AS type_ok,
 a.attnotnull=e.not_null AS nullability_ok,pg_get_expr(d.adbin,d.adrelid) IS NOT DISTINCT FROM e.default_expr AS default_ok
FROM expected e LEFT JOIN pg_attribute a ON a.attrelid=to_regclass('public.final_test_photo_challenges') AND a.attname=e.name AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum ORDER BY e.name;

WITH expected(name,type,definition_md5) AS (VALUES ('final_test_photo_challenges_check','c','b713891cef505250d77874321da5c4c6'),
 ('final_test_photo_challenges_check1','c','b2c33673843b29c636a59da5671548b8'),
 ('final_test_photo_challenges_check2','c','88a6afbb55d33373d89dcdd3a3939e22'),
 ('final_test_photo_challenges_course_id_fkey','f','6ef5fedbaaa2d1f06cbe98b9528b8517'),
 ('final_test_photo_challenges_course_id_not_null','n','01d446cbc26427b8413556992c2e7c10'),
 ('final_test_photo_challenges_created_at_not_null','n','790c8d8fc119421e34dbad62d7c81df8'),
 ('final_test_photo_challenges_enrollment_id_fkey','f','4ca43519ba5168cb2630421461674488'),
 ('final_test_photo_challenges_enrollment_id_not_null','n','9deccf4ed977a591f66523ae2c3b2a1c'),
 ('final_test_photo_challenges_expires_at_not_null','n','c0f60e47a1d83178fa3ccb53409dc384'),
 ('final_test_photo_challenges_id_not_null','n','907e13ecdcdbd392cdd617ad837e567b'),
 ('final_test_photo_challenges_lesson_id_fkey','f','809fdd558f12360a18aa597624d08c3d'),
 ('final_test_photo_challenges_lesson_id_not_null','n','936c38322866d277ba4c7b47069ee519'),
 ('final_test_photo_challenges_object_path_key','u','a34042ce02f61c8ec110cef9ba876e6f'),
 ('final_test_photo_challenges_object_path_not_null','n','1cd69b3a4264d2397bd55e49cc97525b'),
 ('final_test_photo_challenges_pkey','p','4c6419b3704337bbfe50f018842a9ad3'),
 ('final_test_photo_challenges_request_id_not_null','n','9ad06d2910d72fcf7e6bb4b8ae6f950e'),
 ('final_test_photo_challenges_session_id_fkey','f','31bce062ba946dba77b672beb7643dcb'),
 ('final_test_photo_challenges_session_id_key','u','4e54a273e27f80152c6bf3321fc10718'),
 ('final_test_photo_challenges_user_id_lesson_id_request_id_key','u','a802cdb8a6a9828310797e181577e37f'),
 ('final_test_photo_challenges_user_id_not_null','n','3003e44049459afa56e7df8289c91ce3'))
SELECT e.name,c.oid IS NOT NULL AS exists_ok,c.contype::text=e.type AS type_ok,md5(pg_get_constraintdef(c.oid))=e.definition_md5 AS definition_ok
FROM expected e LEFT JOIN pg_constraint c ON c.conrelid=to_regclass('public.final_test_photo_challenges') AND c.conname=e.name ORDER BY e.name;

WITH expected(name,command,permissive,expression_md5) AS (VALUES ('final_test_photos_delete_guard','d',false,'91c4a9630401645055702a1d74fc9fc4'),
 ('final_test_photos_insert','a',true,'35396e465eee3a7f03dc919cd7e24322'),
 ('final_test_photos_insert_guard','a',false,'b41503a663a4b68c8496081bcf2a4a96'),
 ('final_test_photos_select','r',true,'6d7f8e92712b3caf6b351852c116ea15'),
 ('final_test_photos_select_guard','r',false,'80b8d3bd65da76e83cbe70d59f91f101'),
 ('final_test_photos_update_guard','w',false,'f2e446a6fb938f561a15ef123f0a1e80'))
SELECT e.name,p.oid IS NOT NULL AS exists_ok,p.polcmd::text=e.command AS command_ok,p.polpermissive=e.permissive AS permissive_ok,
 md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))=e.expression_md5 AS expression_ok,
 p.polroles=CASE WHEN e.name IN ('final_test_photos_insert','final_test_photos_select') THEN ARRAY[to_regrole('authenticated')::oid] ELSE ARRAY[0::oid] END AS roles_ok
FROM expected e LEFT JOIN pg_policy p ON p.polrelid=to_regclass('storage.objects') AND p.polname=e.name ORDER BY e.name;

SELECT (SELECT count(*)=1 FROM supabase_migrations.schema_migrations WHERE version='20260929120000' AND name='final_test_photo' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='c6de5bea7fc4d902b175fc50582986bb') AS exact_ledger_ok,
 (SELECT count(*)=1 FROM storage.buckets WHERE id='final-test-photos' AND name='final-test-photos' AND NOT public AND file_size_limit=5242880 AND allowed_mime_types=ARRAY['image/jpeg']) AS bucket_ok,
 (SELECT count(*)=6 FROM pg_policy WHERE polrelid=to_regclass('storage.objects') AND polname LIKE 'final_test_photos%') AS policy_count_ok,
 (SELECT count(*)=12 FROM pg_attribute WHERE attrelid=to_regclass('public.final_test_photo_challenges') AND attnum>0 AND NOT attisdropped) AS column_count_ok,
 (SELECT count(*)=20 FROM pg_constraint WHERE conrelid=to_regclass('public.final_test_photo_challenges')) AS constraint_count_ok,
 (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.final_test_photo_challenges')) AS challenges_rls_ok,
 (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('storage.objects')) AS storage_rls_ok,
 NOT has_table_privilege('authenticated','public.final_test_photo_challenges','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS no_authenticated_table_grants_ok,
 NOT has_table_privilege('anon','public.final_test_photo_challenges','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS no_anon_table_grants_ok,
 has_table_privilege('service_role','public.final_test_photo_challenges','SELECT') AND has_table_privilege('service_role','public.final_test_photo_challenges','INSERT') AND has_table_privilege('service_role','public.final_test_photo_challenges','UPDATE') AND has_table_privilege('service_role','public.final_test_photo_challenges','DELETE') AS service_grants_ok,
 NOT has_table_privilege('authenticated','public.test_attempts','INSERT') AND NOT has_table_privilege('anon','public.test_attempts','INSERT') AS direct_result_insert_denied_ok,
 (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND ((table_name='courses' AND column_name='require_final_test_photo') OR (table_name='test_attempt_sessions' AND column_name='requires_final_test_photo')) AND data_type='boolean' AND is_nullable='NO' AND column_default='false') AS false_default_columns_ok,
 (SELECT count(*)=0 FROM public.courses WHERE require_final_test_photo) AS all_course_switches_off_ok,
 (SELECT count(*)=0 FROM public.test_attempt_sessions WHERE requires_final_test_photo) AS existing_sessions_unchanged_ok,
 (SELECT count(*)=0 FROM public.final_test_photo_challenges) AS no_photo_challenges_before_activation_ok;
