-- Generated UC010 internal review. Submit this ENTIRE file in ONE request.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $assert$ DECLARE r jsonb;BEGIN SELECT to_jsonb(q) INTO r FROM (-- Read-only; requires the exact installed100-109 ledger and prior postcheck.
SELECT
 (SELECT count(*)=10 FROM supabase_migrations.schema_migrations WHERE (version='20261018100000' AND name='uc_document_access_boundaries' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='455f5c4069200f225124bfd58adc948c') OR (version='20261018101000' AND name='uc_signature_integrity' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='1a7d1d39332388314cc8ebf0eaaef885') OR (version='20261018102000' AND name='uc_document_versions' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='485580713e67f5bbf40210836f757a8b') OR (version='20261018103000' AND name='uc_document_cleanup_scheduler' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='5d690c2e4284a79f12901a7deabdf736') OR (version='20261018104000' AND name='uc_document_staff_scope' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='c5d0538638fbaf0343612c13e7583510') OR (version='20261018105000' AND name='uc_document_action_permissions' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='6563e5305b0ea46bfead8f8098af4e3f') OR (version='20261018106000' AND name='uc_gorel_draft_caller' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='8e953d5f20050d66ead5454349445b7a') OR (version='20261018107000' AND name='uc_document_reminder_scheduler' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='612d9b242bae5289b34b8598fc1361e4') OR (version='20261018108000' AND name='uc_education_compliance_profile' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='a840381f437b4529d13a466636acf512') OR (version='20261018109000' AND name='uc_signature_token_files' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='f61b7f838928467ae28aa0a6602810c1')) AS exact_prior_ledger,
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261018110000') AS migration_absent,
 to_regclass('public.org_document_reviews') IS NULL AND to_regclass('public.org_document_review_comments') IS NULL AND to_regclass('public.org_document_review_events') IS NULL AND to_regclass('public.org_document_review_requests') IS NULL AS new_state_absent,
 NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('uc_org_document_review_actor','uc_org_document_review_actor_name','uc_org_document_review_file_state','uc_org_document_review_file_bound','uc_org_document_review_snapshot','uc_guard_org_document_review_history','uc_guard_org_document_review_record','uc_validate_org_document_review_links','get_org_document_workflow','list_org_document_review_candidates','uc_mutate_org_document_review','save_org_document_review_draft','transition_org_document_review','add_org_document_review_comment','resolve_org_document_review_comment')) AS new_functions_absent,
 coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_document_action_allowed(uuid,text,uuid,uuid)')))='79c190a053f711dc8110e9d451b1a56c',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_platform_document_action_allowed(uuid,text)')))='e5a1436d0cc46218d379c3ffec8c0d0d',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_document_scope_allowed(uuid,uuid,uuid)')))='2a7407e7d178c7561b1d390f0884c6b6',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_document_teacher_limited(uuid)')))='72cdbafda69c66500e0d9ae87e8ae403',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.is_org_owner(uuid,uuid)')))='362aca6afc26c775be594843258b2ab2',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.has_org_staff_permission(uuid,uuid,text)')))='3d1fedafe94778fa19dd47acb71a3782',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_document_pointer()')))='05734107701fca0104e19952c4880440',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_document_version_write()')))='e62e9d7f9c8f6c99c049417775b5da2a',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_org_document_blob_committed(text,text)')))='bc750c58e3d50e33bfd6bf6844fffbaa',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.can_access_organization(uuid,text)')))='2e11495f3d3e6ca261af8a08ed874269',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.get_org_staff_permissions(uuid,uuid)')))='c0ea40b20bbd1a71aa31cdbcbb7fc0b3',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.has_role(app_role,uuid)')))='20c46f708cc2e7fa51b640290151a59e',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.has_role(uuid,app_role)')))='82a7fa1cd06301bb83b010bc315aee0b',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.org_role_default_permissions(text)')))='7aeb1012822cfe0013409ce5b1df1771',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.normalize_org_staff_permission(text)')))='bb385c2b288bb966297a8504df1696ea',false) AS exact_access_dependencies,
 EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND policyname='uc_org_document_blob_no_delete' AND md5(to_jsonb(p)::text)='c82f6a57a88835e478dba6728f01489b') AND EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND policyname='uc_org_document_blob_no_overwrite' AND md5(to_jsonb(p)::text)='c5030108254eabf8300b0c94b9d7ef4e') AS exact_immutable_storage_boundary,
 NOT EXISTS(SELECT 1 FROM (-- Repeatable read-only acceptance: valid after real profiles have been saved too.
SELECT
 (SELECT count(*)=2 FROM supabase_migrations.schema_migrations WHERE (version='20261018108000' AND name='uc_education_compliance_profile' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='a840381f437b4529d13a466636acf512') OR (version='20261018109000' AND name='uc_signature_token_files' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='f61b7f838928467ae28aa0a6602810c1')) AS exact_profile_ledger,
 coalesce(md5(pg_get_functiondef(to_regprocedure('public.add_signature_revision(uuid,text,text,text,text,text)')))='55bba8f07761156974e016203862fce3',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text)')))='4eff66a8bbd761b099c451f3cab5184c',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid)')))='5e7217ad17ad684950bc1d4cc1a599b6',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.get_organization_education_profile(uuid)')))='fb776b25a2d3ddb2de45f4bb0af55c66',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.list_organization_document_applicability_decisions(uuid)')))='38bc3c9607dd9b234faedfb0a0c6a7e8',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.list_organization_document_applicability_history(uuid,text,integer,bigint)')))='9eaf5cedc8f849a078e3628c81b71bee',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.list_organization_education_profile_history(uuid,integer,bigint)')))='e5f0f8646e2e57ee474ec2105f5c5f3e',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)')))='d9b8bb1b7cc5a20ae27f9b71b8f7c4c0',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.save_organization_education_profile(uuid,bigint,jsonb,uuid)')))='20666a5fc6e0ec3d33e8229b103e047e',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_document_storage_scope(text,text)')))='8b098a3d3719a73e92a0b1a002121de9',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_empty_education_profile()')))='5cfa6476fc8d857005b1860f162c37b2',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_compliance_history()')))='9ea2c738380752e8d7de9cd5d2bf520b',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_signature_file_provenance()')))='29818408e329a07be3f740a8953f3bfc',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_canonical_file(uuid,uuid,text)')))='401b44e39584dd94d073b944e03979a8',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_file_context(text,text,uuid)')))='0913f786957394707e29ef705d5b790d',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_file_scope(text,text)')))='9d4733a8bb62597b9a67e4d85261c0df',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_locator_key(text,text)')))='3d2d9463e7063aea9f2090f218ffe3f0',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_object_bound(uuid,text,text)')))='0bad882bf215319b4fd5715103b78573',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_object_uploader(text,text,uuid)')))='69f24010df2478180c9b6dce8c32077d',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_storage_read(text,text)')))='8ed97513c96236cf32c44e764ad1e098',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_storage_write(text,text)')))='01d386c700f5341f132c72ed607a6e9a',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_validate_applicability_key(text,text)')))='fdaba82d961192324e65e8ccb876d987',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_validate_education_profile(jsonb)')))='dcb4593eeeecc6a48123ef8569b6e419',false) AS exact_new_functions,
 (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.organization_education_profiles'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.organization_education_profiles'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='organization_education_profiles'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='organization_education_profiles'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organization_education_profiles'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_education_profiles'::regclass))::text) hash)='876d5ee780c85d0d7a2256e72b38d086' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.organization_education_profile_history'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.organization_education_profile_history'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='organization_education_profile_history'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='organization_education_profile_history'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organization_education_profile_history'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_education_profile_history'::regclass))::text) hash)='a8514967a2b0ad1341cf192a6eb7a7c1' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.organization_document_applicability_decisions'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.organization_document_applicability_decisions'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='organization_document_applicability_decisions'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='organization_document_applicability_decisions'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organization_document_applicability_decisions'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_document_applicability_decisions'::regclass))::text) hash)='5f3e4bbd138ec894b1a582f7113320cf' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.organization_document_applicability_history'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.organization_document_applicability_history'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='organization_document_applicability_history'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='organization_document_applicability_history'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organization_document_applicability_history'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_document_applicability_history'::regclass))::text) hash)='ad0359196a8ad0b37ee84b98965284c4' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.uc_signature_file_requests'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.uc_signature_file_requests'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='uc_signature_file_requests'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='uc_signature_file_requests'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.uc_signature_file_requests'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.uc_signature_file_requests'::regclass))::text) hash)='d794ebebf61a3b2dff0df8b7e4633c7b' AS exact_new_schema,
 has_table_privilege('authenticated','public.organization_education_profiles','SELECT') AND NOT has_table_privilege('authenticated','public.organization_education_profiles','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.organization_education_profiles','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.organization_education_profiles','INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.organization_education_profile_history','SELECT') AND NOT has_table_privilege('authenticated','public.organization_education_profile_history','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.organization_education_profile_history','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.organization_education_profile_history','INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.organization_document_applicability_decisions','SELECT') AND NOT has_table_privilege('authenticated','public.organization_document_applicability_decisions','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.organization_document_applicability_decisions','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.organization_document_applicability_decisions','INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.organization_document_applicability_history','SELECT') AND NOT has_table_privilege('authenticated','public.organization_document_applicability_history','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.organization_document_applicability_history','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.organization_document_applicability_history','INSERT,UPDATE,DELETE') AS rpc_only_writes,
 has_function_privilege('authenticated','public.get_organization_education_profile(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.get_organization_education_profile(uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.get_organization_education_profile(uuid)','EXECUTE') AND has_function_privilege('authenticated','public.list_organization_document_applicability_decisions(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.list_organization_document_applicability_decisions(uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.list_organization_document_applicability_decisions(uuid)','EXECUTE') AND has_function_privilege('authenticated','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE') AND NOT has_function_privilege('anon','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE') AND NOT has_function_privilege('service_role','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE') AND has_function_privilege('authenticated','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE') AND NOT has_function_privilege('anon','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE') AND NOT has_function_privilege('service_role','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE') AND has_function_privilege('authenticated','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE') AND has_function_privilege('authenticated','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE') AS authenticated_rpc_only,
 has_function_privilege('authenticated','public.add_signature_revision(uuid,text,text,text,text,text)','EXECUTE')=true AND has_function_privilege('anon','public.add_signature_revision(uuid,text,text,text,text,text)','EXECUTE')=true AND has_function_privilege('service_role','public.add_signature_revision(uuid,text,text,text,text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text)','EXECUTE')=true AND has_function_privilege('anon','public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text)','EXECUTE')=false AND has_function_privilege('authenticated','public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.get_organization_education_profile(uuid)','EXECUTE')=true AND has_function_privilege('anon','public.get_organization_education_profile(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.get_organization_education_profile(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.list_organization_document_applicability_decisions(uuid)','EXECUTE')=true AND has_function_privilege('anon','public.list_organization_document_applicability_decisions(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.list_organization_document_applicability_decisions(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE')=true AND has_function_privilege('anon','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE')=false AND has_function_privilege('service_role','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE')=false AND has_function_privilege('authenticated','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE')=true AND has_function_privilege('anon','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE')=false AND has_function_privilege('service_role','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE')=false AND has_function_privilege('authenticated','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_document_storage_scope(text,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_document_storage_scope(text,text)','EXECUTE')=true AND has_function_privilege('service_role','public.uc_document_storage_scope(text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_empty_education_profile()','EXECUTE')=false AND has_function_privilege('anon','public.uc_empty_education_profile()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_empty_education_profile()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_guard_compliance_history()','EXECUTE')=false AND has_function_privilege('anon','public.uc_guard_compliance_history()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_guard_compliance_history()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_guard_signature_file_provenance()','EXECUTE')=false AND has_function_privilege('anon','public.uc_guard_signature_file_provenance()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_guard_signature_file_provenance()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_signature_canonical_file(uuid,uuid,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_signature_canonical_file(uuid,uuid,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_canonical_file(uuid,uuid,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_signature_file_context(text,text,uuid)','EXECUTE')=false AND has_function_privilege('anon','public.uc_signature_file_context(text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_file_context(text,text,uuid)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_signature_file_scope(text,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_signature_file_scope(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_file_scope(text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_signature_locator_key(text,text)','EXECUTE')=false AND has_function_privilege('anon','public.uc_signature_locator_key(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_locator_key(text,text)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_signature_object_bound(uuid,text,text)','EXECUTE')=false AND has_function_privilege('anon','public.uc_signature_object_bound(uuid,text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_object_bound(uuid,text,text)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_signature_object_uploader(text,text,uuid)','EXECUTE')=false AND has_function_privilege('anon','public.uc_signature_object_uploader(text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_object_uploader(text,text,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_signature_storage_read(text,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_signature_storage_read(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_storage_read(text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_signature_storage_write(text,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_signature_storage_write(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_storage_write(text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_validate_applicability_key(text,text)','EXECUTE')=false AND has_function_privilege('anon','public.uc_validate_applicability_key(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_validate_applicability_key(text,text)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_validate_education_profile(jsonb)','EXECUTE')=false AND has_function_privilege('anon','public.uc_validate_education_profile(jsonb)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_validate_education_profile(jsonb)','EXECUTE')=false AS exact_function_grants,
 NOT has_table_privilege('authenticated','public.uc_signature_file_requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.uc_signature_file_requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.uc_signature_file_requests','SELECT,INSERT,UPDATE,DELETE') AS private_request_receipts,
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='uc_revision_file_provenance' AND tgrelid='public.signature_revisions'::regclass AND tgenabled='O' AND md5(pg_get_triggerdef(oid))='3af5b39abc7d67db409c560a2d854c9f') AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='uc_signature_file_provenance' AND tgrelid='public.document_signatures'::regclass AND tgenabled='O' AND md5(pg_get_triggerdef(oid))='2a0cc2818aa843a097492522bc620b60') AS exact_provenance_triggers,
 EXISTS(SELECT 1 FROM pg_policies x WHERE schemaname='storage' AND policyname='uc_signature_namespace_immutable_delete' AND md5(to_jsonb(x)::text)='908d0e9b13cf7a2627011cc5152a3ca8') AND EXISTS(SELECT 1 FROM pg_policies x WHERE schemaname='storage' AND policyname='uc_signature_namespace_immutable_update' AND md5(to_jsonb(x)::text)='0381e2dba8030669fb760f4ff70ba1fc') AND EXISTS(SELECT 1 FROM pg_policies x WHERE schemaname='storage' AND policyname='uc_signature_namespace_insert' AND md5(to_jsonb(x)::text)='aa5bb3aba16a387e755916064a48c34e') AS exact_storage_boundaries) q CROSS JOIN LATERAL jsonb_each(to_jsonb(q)) e WHERE e.value IS DISTINCT FROM 'true'::jsonb) AS exact_previous_release) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'UC review preflight failed: %',r;END IF;END $assert$;
LOCK TABLE public.org_documents,public.incoming_documents,public.education_document_records,public.document_issuance_log,public.program_documents,public.program_folders,public.program_categories,public.program_training_plans,public.frdo_signed_documents,public.student_documents,public.student_identity_documents,public.company_documents,public.group_documents,public.document_signatures,public.signature_revisions,public.signature_comments,public.pep_agreements,public.org_document_versions,public.document_number_sequences,public.organizations,public.profiles,public.companies,public.enrollments,storage.objects,storage.buckets,public.org_staff,public.admin_staff,public.user_roles,public.courses,public.lessons,public.student_groups,public.student_group_memberships,public.enrollment_history,public.test_attempts,public.lesson_progress,public.student_frdo_data,public.journal_instances,public.journal_entries,public.group_class_journal_marks,public.org_contracts,public.goreltech_document_operations,public.org_staff_document_groups,public.org_staff_document_scopes,public.org_staff_document_scope_events,public.uc_goreltech_document_stages,public.organization_education_profiles,public.organization_education_profile_history,public.organization_document_applicability_decisions,public.organization_document_applicability_history,public.uc_signature_file_requests,public.org_document_write_tokens IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc_review_before(table_name text PRIMARY KEY,row_count bigint,row_hash text) ON COMMIT DROP;
CREATE TEMP TABLE uc_review_policies_before ON COMMIT DROP AS SELECT * FROM pg_policies WHERE schemaname IN('public','storage');
CREATE TEMP TABLE uc_review_functions_before ON COMMIT DROP AS
 SELECT p.oid,md5(pg_get_functiondef(p.oid)) definition_hash,p.proowner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN('f','p');
CREATE TEMP TABLE uc_review_cron_before ON COMMIT DROP AS SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j;
DO $snapshot$ DECLARE t text;n bigint;h text;BEGIN
 FOREACH t IN ARRAY ARRAY['public.org_documents','public.incoming_documents','public.education_document_records','public.document_issuance_log','public.program_documents','public.program_folders','public.program_categories','public.program_training_plans','public.frdo_signed_documents','public.student_documents','public.student_identity_documents','public.company_documents','public.group_documents','public.document_signatures','public.signature_revisions','public.signature_comments','public.pep_agreements','public.org_document_versions','public.document_number_sequences','public.organizations','public.profiles','public.companies','public.enrollments','storage.objects','storage.buckets','public.org_staff','public.admin_staff','public.user_roles','public.courses','public.lessons','public.student_groups','public.student_group_memberships','public.enrollment_history','public.test_attempts','public.lesson_progress','public.student_frdo_data','public.journal_instances','public.journal_entries','public.group_class_journal_marks','public.org_contracts','public.goreltech_document_operations','public.org_staff_document_groups','public.org_staff_document_scopes','public.org_staff_document_scope_events','public.uc_goreltech_document_stages','public.organization_education_profiles','public.organization_education_profile_history','public.organization_document_applicability_decisions','public.organization_document_applicability_history','public.uc_signature_file_requests','public.org_document_write_tokens'] LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\n'' ORDER BY to_jsonb(r)::text),'''')) FROM %s r',t) INTO n,h;
 INSERT INTO uc_review_before VALUES(t,n,h);END LOOP;END $snapshot$;
DO $migration$ DECLARE source text:=$source_110$-- UC-010: organization-recorded internal review of an exact immutable file version.
-- No legal signature, issuance, external messages, file mutation or historical backfill.
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM (VALUES
 ('public.uc_document_action_allowed(uuid,text,uuid,uuid)','79c190a053f711dc8110e9d451b1a56c'),
 ('public.uc_platform_document_action_allowed(uuid,text)','e5a1436d0cc46218d379c3ffec8c0d0d'),
 ('public.uc_document_scope_allowed(uuid,uuid,uuid)','2a7407e7d178c7561b1d390f0884c6b6'),
 ('public.uc_document_teacher_limited(uuid)','72cdbafda69c66500e0d9ae87e8ae403'),
 ('public.is_org_owner(uuid,uuid)','362aca6afc26c775be594843258b2ab2'),
 ('public.has_org_staff_permission(uuid,uuid,text)','3d1fedafe94778fa19dd47acb71a3782'),
 ('public.uc_guard_document_pointer()','05734107701fca0104e19952c4880440'),
 ('public.uc_guard_document_version_write()','e62e9d7f9c8f6c99c049417775b5da2a'),
 ('public.uc_org_document_blob_committed(text,text)','bc750c58e3d50e33bfd6bf6844fffbaa')
 ) b(signature,hash) WHERE to_regprocedure(signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>hash)
 THEN RAISE EXCEPTION 'Internal review: unreviewed document/access baseline'; END IF;
 IF (SELECT count(*) FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND
  ((policyname='uc_org_document_blob_no_overwrite' AND md5(to_jsonb(p)::text)='c5030108254eabf8300b0c94b9d7ef4e') OR
   (policyname='uc_org_document_blob_no_delete' AND md5(to_jsonb(p)::text)='c82f6a57a88835e478dba6728f01489b')))<>2
 THEN RAISE EXCEPTION 'Internal review: unreviewed immutable Storage boundary'; END IF;
END;$preflight$;

CREATE TABLE public.org_document_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES public.org_documents(id),version_id uuid NOT NULL REFERENCES public.org_document_versions(id),
 revision bigint NOT NULL CHECK(revision>0),state text NOT NULL CHECK(state IN('draft','in_review','changes_requested','approved','cancelled')),
 responsible_user_id uuid NOT NULL,reviewer_user_id uuid NOT NULL,responsible_name text NOT NULL,reviewer_name text NOT NULL,
 links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(links)='array'),
 approval_number text,approval_date date,approved_at timestamptz,approved_by uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(document_id,version_id),
 CHECK((state='approved')=(approval_number IS NOT NULL AND approval_date IS NOT NULL AND approved_at IS NOT NULL AND approved_by IS NOT NULL))
);
CREATE TABLE public.org_document_review_comments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 review_id uuid NOT NULL REFERENCES public.org_document_reviews(id) ON DELETE CASCADE,version_id uuid NOT NULL,
 author_user_id uuid NOT NULL,author_name text NOT NULL,author_role text NOT NULL,
 comment_text text NOT NULL,quoted_text text,position_anchor jsonb,
 resolution_status text NOT NULL DEFAULT 'unresolved' CHECK(resolution_status IN('unresolved','accepted','declined')),
 org_reply text,resolved_by uuid,resolved_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((resolution_status='unresolved')=(resolved_by IS NULL AND resolved_at IS NULL))
);
CREATE TABLE public.org_document_review_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 review_id uuid NOT NULL REFERENCES public.org_document_reviews(id) ON DELETE CASCADE,revision bigint NOT NULL,
 actor_id uuid NOT NULL,action text NOT NULL,note text,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(review_id,revision)
);
CREATE TABLE public.org_document_review_requests(
 request_id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 document_id uuid NOT NULL,review_id uuid NOT NULL,actor_id uuid NOT NULL,payload jsonb NOT NULL,receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX org_document_review_comments_review ON public.org_document_review_comments(review_id,created_at,id);
CREATE INDEX org_document_review_events_review ON public.org_document_review_events(review_id,revision);
DO $acl$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['org_document_reviews','org_document_review_comments','org_document_review_events','org_document_review_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  IF t<>'org_document_review_requests' THEN
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
   EXECUTE format('CREATE POLICY uc_internal_review_read ON public.%I FOR SELECT TO authenticated USING(public.uc_document_action_allowed(organization_id,''read'',NULL,NULL))',t);
   EXECUTE format('CREATE POLICY uc_internal_review_read_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.uc_document_action_allowed(organization_id,''read'',NULL,NULL)) WITH CHECK(false)',t);
  END IF;
 END LOOP;
END;$acl$;

-- This helper evaluates a proposed assignee, never impersonates that account.
CREATE FUNCTION public.uc_org_document_review_actor(p_org uuid,p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_org IS NOT NULL AND p_user IS NOT NULL
 AND public.uc_platform_document_action_allowed(p_user,'write')
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND (public.is_org_owner(p_user,p_org) OR
  EXISTS(SELECT 1 FROM public.org_staff s WHERE s.organization_id=p_org AND s.user_id=p_user
   AND (s.expires_at IS NULL OR s.expires_at>now()) AND public.has_org_staff_permission(p_user,p_org,'documents.write')
   AND (s.role<>'teacher' OR public.has_role(p_user,'admin'::public.app_role))))
$fn$;
-- Display snapshots belong to the review, not an additional directory grant.
CREATE FUNCTION public.uc_org_document_review_actor_name(p_org uuid,p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(nullif(s.display_name,''),nullif(p.full_name,''),'Сотрудник')
 FROM (SELECT p_user user_id) a LEFT JOIN public.profiles p ON p.user_id=a.user_id
 LEFT JOIN public.org_staff s ON s.user_id=a.user_id AND s.organization_id=p_org
$fn$;
CREATE FUNCTION public.uc_org_document_review_file_state(p_doc public.org_documents)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $fn$
 SELECT CASE WHEN p_doc.deleted_at IS NOT NULL THEN 'deleted' WHEN p_doc.status='archived' THEN 'archived'
 WHEN nullif(btrim(p_doc.file_url),'') IS NULL THEN 'fileless'
 WHEN p_doc.status='expired' OR p_doc.expires_at<current_date THEN 'expired'
 WHEN p_doc.status<>'active' OR p_doc.status IS NULL THEN 'unconfirmed'
 WHEN p_doc.expires_at<=current_date+30 THEN 'expiring' ELSE 'active' END
$fn$;
-- Existing UC006 append-only paths and exact object metadata are required.
-- A historical URL or immutable database pointer alone is not proof of a file.
CREATE FUNCTION public.uc_org_document_review_file_bound(p_doc public.org_documents)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.org_document_versions v JOIN storage.objects o ON o.id=v.storage_object_id
  WHERE v.id=p_doc.current_version_id AND v.document_id=p_doc.id AND v.organization_id=p_doc.organization_id
   AND v.event_kind IN('upload','restore') AND v.file_url IS NOT DISTINCT FROM p_doc.file_url
   AND v.file_path ~ ('^'||p_doc.organization_id::text||'/versions/'||p_doc.id::text||'/[0-9a-f-]{36}[.][a-z0-9]{1,12}$')
   AND o.bucket_id='org-documents' AND o.name=v.file_path
   AND v.file_url ~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?/storage/v1/object/public/org-documents/'
   AND right(v.file_url,length('/org-documents/'||v.file_path))='/org-documents/'||v.file_path
   AND v.file_size IS NOT NULL AND v.file_size>0 AND o.metadata->>'size' ~ '^[0-9]+$'
   AND v.file_size=CASE WHEN o.metadata->>'size' ~ '^[0-9]+$' THEN (o.metadata->>'size')::numeric END
   AND v.storage_metadata=jsonb_build_object('size',v.file_size,'etag',coalesce(o.metadata->>'eTag',o.metadata->>'etag'),'mimetype',o.metadata->>'mimetype'))
$fn$;
CREATE FUNCTION public.uc_org_document_review_snapshot(p_review uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',r.id,'organization_id',r.organization_id,'document_id',r.document_id,'version_id',r.version_id,
  'revision',r.revision,'state',r.state,'responsible_user_id',r.responsible_user_id,'reviewer_user_id',r.reviewer_user_id,
  'responsible_name',r.responsible_name,'reviewer_name',r.reviewer_name,'links',r.links,
  'approval',CASE WHEN r.state='approved' THEN jsonb_build_object('number',r.approval_number,'date',r.approval_date,'recorded_at',r.approved_at,'recorded_by',r.approved_by) END,
  'requires_new_version',EXISTS(SELECT 1 FROM public.org_document_review_comments c WHERE c.review_id=r.id AND c.resolution_status='accepted' AND c.position_anchor->>'kind' IN('insert','delete','replace')),
  'comments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'author_user_id',c.author_user_id,'author_name',c.author_name,'author_role',c.author_role,
    'quoted_text',c.quoted_text,'comment_text',c.comment_text,'position_anchor',c.position_anchor,'resolved',c.resolution_status<>'unresolved',
    'resolution_status',c.resolution_status,'org_reply',c.org_reply,'created_at',c.created_at) ORDER BY c.created_at,c.id)
   FROM public.org_document_review_comments c WHERE c.review_id=r.id),'[]'::jsonb),
  'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'actor_id',e.actor_id,'created_at',e.created_at,'note',e.note) ORDER BY e.revision)
   FROM public.org_document_review_events e WHERE e.review_id=r.id),'[]'::jsonb))
 FROM public.org_document_reviews r WHERE r.id=p_review
$fn$;

CREATE FUNCTION public.uc_guard_org_document_review_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=OLD.organization_id) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Internal review history is immutable' USING ERRCODE='42501';
END;$fn$;
CREATE TRIGGER uc_internal_review_event_immutable BEFORE UPDATE OR DELETE ON public.org_document_review_events
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_org_document_review_history();
CREATE TRIGGER uc_internal_review_request_immutable BEFORE UPDATE OR DELETE ON public.org_document_review_requests
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_org_document_review_history();

CREATE FUNCTION public.uc_guard_org_document_review_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=OLD.organization_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Internal review records cannot be deleted' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='org_document_reviews' THEN
  IF NOT EXISTS(SELECT 1 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id
   WHERE v.id=NEW.version_id AND d.id=NEW.document_id AND d.organization_id=NEW.organization_id AND v.organization_id=NEW.organization_id) THEN
   RAISE EXCEPTION 'Review version/organization mismatch' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (OLD.state IN('approved','cancelled') OR
   (NEW.id,NEW.organization_id,NEW.document_id,NEW.version_id,NEW.created_at) IS DISTINCT FROM
   (OLD.id,OLD.organization_id,OLD.document_id,OLD.version_id,OLD.created_at)) THEN
   RAISE EXCEPTION 'Closed review or version provenance is immutable' USING ERRCODE='42501'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.org_document_reviews r WHERE r.id=NEW.review_id AND r.organization_id=NEW.organization_id AND r.version_id=NEW.version_id) THEN
   RAISE EXCEPTION 'Comment review/version mismatch' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['resolution_status','org_reply','resolved_by','resolved_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['resolution_status','org_reply','resolved_by','resolved_at']) OR OLD.resolution_status<>'unresolved') THEN
   RAISE EXCEPTION 'Original comment and resolved decision are immutable' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_internal_review_record_guard BEFORE INSERT OR UPDATE OR DELETE ON public.org_document_reviews
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_org_document_review_record();
CREATE TRIGGER uc_internal_review_comment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.org_document_review_comments
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_org_document_review_record();

CREATE FUNCTION public.uc_validate_org_document_review_links(p_org uuid,p_links jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE x jsonb;v_id uuid;v_version uuid;
BEGIN
 IF jsonb_typeof(p_links) IS DISTINCT FROM 'array' OR jsonb_array_length(p_links)>100 THEN
  RAISE EXCEPTION 'Invalid review links' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_links) e GROUP BY e->>'kind',e->>'id' HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Duplicate review link' USING ERRCODE='22023'; END IF;
 FOR x IN SELECT * FROM jsonb_array_elements(p_links) LOOP
  IF jsonb_typeof(x)<>'object' OR NOT x ?& ARRAY['kind','id','version_id'] OR
   EXISTS(SELECT 1 FROM jsonb_object_keys(x) k WHERE k NOT IN('kind','id','version_id')) OR
   x->>'kind' NOT IN('course','group','document') OR x->>'kind' IS NULL THEN
   RAISE EXCEPTION 'Unsupported review link' USING ERRCODE='22023'; END IF;
  v_id:=public.storage_try_uuid(x->>'id');v_version:=public.storage_try_uuid(x->>'version_id');
  IF v_id IS NULL OR x->>'version_id' IS NOT NULL AND v_version IS NULL THEN RAISE EXCEPTION 'Invalid review link identifier' USING ERRCODE='22023'; END IF;
  IF x->>'kind'='course' THEN
   IF v_version IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.courses WHERE id=v_id AND organization_id=p_org) THEN RAISE EXCEPTION 'Review link inaccessible' USING ERRCODE='42501'; END IF;
  ELSIF x->>'kind'='group' THEN
   IF v_version IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.student_groups WHERE id=v_id AND organization_id=p_org) THEN RAISE EXCEPTION 'Review link inaccessible' USING ERRCODE='42501'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.org_documents WHERE id=v_id AND organization_id=p_org AND deleted_at IS NULL)
    OR v_version IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.org_document_versions WHERE id=v_version AND document_id=v_id AND organization_id=p_org) THEN
    RAISE EXCEPTION 'Review link inaccessible' USING ERRCODE='42501'; END IF;
  END IF;
 END LOOP;
END;$fn$;

CREATE FUNCTION public.get_org_document_workflow(p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.org_documents%ROWTYPE;v public.org_document_versions%ROWTYPE;r public.org_document_reviews%ROWTYPE;w jsonb;
 v_write boolean;v_actor boolean;v_live boolean;v_open boolean;v_state text;
BEGIN
 SELECT * INTO d FROM public.org_documents WHERE id=p_document_id;
 IF NOT FOUND OR NOT public.uc_document_action_allowed(d.organization_id,'read',NULL,NULL) THEN
  RAISE EXCEPTION 'Document review access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO v FROM public.org_document_versions WHERE id=d.current_version_id AND document_id=d.id AND organization_id=d.organization_id;
 SELECT * INTO r FROM public.org_document_reviews WHERE document_id=d.id AND version_id=d.current_version_id;
 w:=public.uc_org_document_review_snapshot(r.id);v_state:=public.uc_org_document_review_file_state(d);
 IF v_state IN('active','expiring') AND NOT public.uc_org_document_review_file_bound(d) THEN v_state:='unconfirmed'; END IF;
 v_write:=public.uc_document_action_allowed(d.organization_id,'write',NULL,NULL);
 v_actor:=v_write AND public.uc_org_document_review_actor(d.organization_id,auth.uid());
 v_live:=v_state IN('active','expiring') AND v.id IS NOT NULL AND nullif(v.file_url,'') IS NOT NULL;
 v_open:=r.state IN('draft','in_review','changes_requested');
 RETURN jsonb_build_object('document',jsonb_build_object('id',d.id,'organization_id',d.organization_id,'document_revision',d.document_revision,
  'current_version_id',d.current_version_id,'file_state',v_state,'file_url',d.file_url,'file_path',v.file_path,'file_name',v.file_name),
  'workflow',w,'cycles',coalesce((SELECT jsonb_agg(public.uc_org_document_review_snapshot(id) ORDER BY created_at DESC,id)
    FROM public.org_document_reviews WHERE document_id=d.id),'[]'::jsonb),'revision',coalesce(r.revision,0),
  'capabilities',jsonb_build_object(
   'can_configure',v_write AND v_live AND (r.id IS NULL OR r.state IN('draft','changes_requested')),
   'can_submit',coalesce(v_actor AND v_live AND auth.uid()=r.responsible_user_id AND r.state IN('draft','changes_requested') AND NOT (w->>'requires_new_version')::boolean,false),
   'can_comment',coalesce(v_actor AND v_live AND auth.uid() IN(r.responsible_user_id,r.reviewer_user_id) AND r.state IN('in_review','changes_requested'),false),
   'can_request_changes',coalesce(v_actor AND v_live AND auth.uid()=r.reviewer_user_id AND r.state='in_review',false),
   'can_decide',coalesce(v_actor AND v_live AND auth.uid()=r.reviewer_user_id AND r.state IN('in_review','changes_requested'),false),
   'can_cancel',coalesce(v_actor AND v_live AND v_open AND (auth.uid() IN(r.responsible_user_id,r.reviewer_user_id) OR public.is_org_owner(auth.uid(),d.organization_id)),false)));
END;$fn$;
CREATE FUNCTION public.list_org_document_review_candidates(p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.org_documents%ROWTYPE;
BEGIN
 SELECT * INTO d FROM public.org_documents WHERE id=p_document_id;
 IF NOT FOUND OR NOT public.uc_document_action_allowed(d.organization_id,'write',NULL,NULL) THEN
  RAISE EXCEPTION 'Document review configuration denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'actors',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',a.user_id,'staff_id',s.id,
  'display_name',coalesce(nullif(s.display_name,''),nullif(p.full_name,''),'Сотрудник'),'kind',CASE WHEN public.is_org_owner(a.user_id,d.organization_id) THEN 'owner' ELSE 'staff' END) ORDER BY a.user_id)
  FROM (SELECT user_id FROM public.profiles WHERE organization_id=d.organization_id UNION SELECT user_id FROM public.org_staff WHERE organization_id=d.organization_id) a
  LEFT JOIN public.profiles p ON p.user_id=a.user_id LEFT JOIN public.org_staff s ON s.user_id=a.user_id AND s.organization_id=d.organization_id
  WHERE public.uc_org_document_review_actor(d.organization_id,a.user_id)),'[]'::jsonb),
 'courses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',coalesce(title,'')) ORDER BY id) FROM public.courses WHERE organization_id=d.organization_id),'[]'::jsonb),
 'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',coalesce(name,''),'course_id',course_id) ORDER BY id) FROM public.student_groups WHERE organization_id=d.organization_id),'[]'::jsonb),
 'related_documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',coalesce(name,''),'current_version_id',current_version_id) ORDER BY id)
  FROM public.org_documents WHERE organization_id=d.organization_id AND deleted_at IS NULL AND id<>d.id),'[]'::jsonb));
END;$fn$;

-- Typed public wrappers call this private dispatcher. Lock order matches file
-- operations: request advisory -> document row -> workflow row. No GUC bypass.
CREATE FUNCTION public.uc_mutate_org_document_review(p_operation text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.org_documents%ROWTYPE;r public.org_document_reviews%ROWTYPE;c public.org_document_review_comments%ROWTYPE;
 q public.org_document_review_requests%ROWTYPE;v_request uuid;v_doc uuid;v_review uuid;v_actor uuid:=auth.uid();
 v_payload jsonb;v_receipt jsonb;v_note text;v_action text;v_expected bigint;v_version uuid;v_name text;v_role text;v_comment uuid;v_anchor jsonb;
BEGIN
 v_request:=(p_body->>'request_id')::uuid;
 IF v_actor IS NULL OR v_request IS NULL OR NOT public.account_deletion_access_allowed() OR p_operation NOT IN('save','transition','comment','resolve') THEN
  RAISE EXCEPTION 'Authenticated review request required' USING ERRCODE='42501'; END IF;
 v_payload:=jsonb_build_object('operation',p_operation,'body',p_body);
 PERFORM pg_advisory_xact_lock(hashtextextended('uc-internal-review:'||v_request::text,0));
 IF p_operation='save' THEN v_doc:=(p_body->>'document_id')::uuid;
 ELSE
  IF p_operation='resolve' THEN
   SELECT * INTO c FROM public.org_document_review_comments WHERE id=(p_body->>'comment_id')::uuid;v_review:=c.review_id;
  ELSE v_review:=(p_body->>'review_id')::uuid; END IF;
  SELECT document_id INTO v_doc FROM public.org_document_reviews WHERE id=v_review;
 END IF;
 SELECT * INTO d FROM public.org_documents WHERE id=v_doc FOR UPDATE;
 IF NOT FOUND OR NOT public.uc_document_action_allowed(d.organization_id,'write',NULL,NULL) THEN
  RAISE EXCEPTION 'Document review write denied' USING ERRCODE='42501'; END IF;
 IF p_operation='save' THEN SELECT * INTO r FROM public.org_document_reviews WHERE document_id=d.id AND version_id=(p_body->>'version_id')::uuid FOR UPDATE;
 ELSE SELECT * INTO r FROM public.org_document_reviews WHERE id=v_review AND document_id=d.id FOR UPDATE; END IF;
 IF p_operation<>'save' AND (r.id IS NULL OR NOT public.uc_org_document_review_actor(d.organization_id,v_actor)
   OR NOT(v_actor IN(r.responsible_user_id,r.reviewer_user_id) OR p_operation='transition' AND p_body->>'action'='cancel' AND public.is_org_owner(v_actor,d.organization_id))) THEN
  RAISE EXCEPTION 'Assigned active review actor required' USING ERRCODE='42501'; END IF;
 IF p_operation='resolve' AND v_actor IS DISTINCT FROM r.reviewer_user_id THEN RAISE EXCEPTION 'Assigned reviewer required' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM public.org_document_review_requests WHERE request_id=v_request;
 IF FOUND THEN
  IF q.actor_id IS DISTINCT FROM v_actor OR q.document_id IS DISTINCT FROM d.id OR q.payload IS DISTINCT FROM v_payload THEN
   RAISE EXCEPTION 'Review request UUID already used for another request' USING ERRCODE='22023'; END IF;
  RETURN q.receipt;
 END IF;
 IF public.uc_org_document_review_file_state(d) NOT IN('active','expiring') OR NOT public.uc_org_document_review_file_bound(d) THEN
  RAISE EXCEPTION 'Active exact file version required' USING ERRCODE='55000'; END IF;
 v_expected:=(p_body->>'expected_workflow_revision')::bigint;
 IF v_expected IS NULL OR v_expected<0 OR v_expected<>coalesce(r.revision,0) THEN
  RAISE EXCEPTION 'Review changed; reload current workflow' USING ERRCODE='40001'; END IF;
 IF p_operation IN('save','transition') AND (p_body->>'expected_document_revision')::bigint IS DISTINCT FROM d.document_revision THEN
  RAISE EXCEPTION 'Document changed; reload current version' USING ERRCODE='40001'; END IF;
 v_version:=CASE WHEN p_operation='save' THEN (p_body->>'version_id')::uuid ELSE r.version_id END;
 IF v_version IS DISTINCT FROM d.current_version_id OR p_operation='comment' AND (p_body->>'version_id')::uuid IS DISTINCT FROM r.version_id THEN
  RAISE EXCEPTION 'Document version changed; start a new review cycle' USING ERRCODE='40001'; END IF;
 IF r.state IN('approved','cancelled') THEN RAISE EXCEPTION 'Internal review cycle is closed' USING ERRCODE='55000'; END IF;
 IF p_operation='save' THEN
  IF r.id IS NOT NULL AND r.state NOT IN('draft','changes_requested') THEN RAISE EXCEPTION 'Review configuration is locked' USING ERRCODE='55000'; END IF;
  IF NOT public.uc_org_document_review_actor(d.organization_id,(p_body->>'responsible_user_id')::uuid)
    OR NOT public.uc_org_document_review_actor(d.organization_id,(p_body->>'reviewer_user_id')::uuid) THEN
   RAISE EXCEPTION 'Assignee must be an active organization-wide writer' USING ERRCODE='42501'; END IF;
  PERFORM public.uc_validate_org_document_review_links(d.organization_id,p_body->'links');
  IF r.id IS NULL THEN
   INSERT INTO public.org_document_reviews(organization_id,document_id,version_id,revision,state,responsible_user_id,reviewer_user_id,responsible_name,reviewer_name,links)
   VALUES(d.organization_id,d.id,d.current_version_id,1,'draft',(p_body->>'responsible_user_id')::uuid,(p_body->>'reviewer_user_id')::uuid,
    public.uc_org_document_review_actor_name(d.organization_id,(p_body->>'responsible_user_id')::uuid),
    public.uc_org_document_review_actor_name(d.organization_id,(p_body->>'reviewer_user_id')::uuid),p_body->'links') RETURNING * INTO r;
  ELSE UPDATE public.org_document_reviews SET responsible_user_id=(p_body->>'responsible_user_id')::uuid,reviewer_user_id=(p_body->>'reviewer_user_id')::uuid,
   responsible_name=public.uc_org_document_review_actor_name(d.organization_id,(p_body->>'responsible_user_id')::uuid),
   reviewer_name=public.uc_org_document_review_actor_name(d.organization_id,(p_body->>'reviewer_user_id')::uuid),
   links=p_body->'links',revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r; END IF;
  v_action:='configure';
 ELSIF p_operation='transition' THEN
  v_action:=p_body->>'action';v_note:=p_body->>'note';
  IF v_note IS NOT NULL AND length(v_note)>4000 OR v_action IS NULL OR v_action NOT IN('submit','request_changes','approve','cancel') THEN
   RAISE EXCEPTION 'Invalid review transition' USING ERRCODE='22023'; END IF;
  IF v_action<>'approve' AND (p_body->>'approval_number' IS NOT NULL OR p_body->>'approval_date' IS NOT NULL) THEN
   RAISE EXCEPTION 'Approval metadata only belongs to approval' USING ERRCODE='22023'; END IF;
  IF v_action='submit' THEN
   IF v_actor IS DISTINCT FROM r.responsible_user_id OR r.state NOT IN('draft','changes_requested') THEN RAISE EXCEPTION 'Assigned responsible actor required' USING ERRCODE='42501'; END IF;
   IF NOT public.uc_org_document_review_actor(d.organization_id,r.reviewer_user_id) THEN RAISE EXCEPTION 'Reviewer access changed; reconfigure' USING ERRCODE='42501'; END IF;
   PERFORM public.uc_validate_org_document_review_links(d.organization_id,r.links);
   IF EXISTS(SELECT 1 FROM public.org_document_review_comments WHERE review_id=r.id AND resolution_status='accepted' AND position_anchor->>'kind' IN('insert','delete','replace')) THEN
    RAISE EXCEPTION 'Accepted content changes require a new file version and review cycle' USING ERRCODE='55000'; END IF;
   UPDATE public.org_document_reviews SET state='in_review',revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  ELSIF v_action='request_changes' THEN
   IF v_actor IS DISTINCT FROM r.reviewer_user_id OR r.state<>'in_review' THEN RAISE EXCEPTION 'Assigned reviewer in active review required' USING ERRCODE='42501'; END IF;
   UPDATE public.org_document_reviews SET state='changes_requested',revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  ELSIF v_action='approve' THEN
   IF v_actor IS DISTINCT FROM r.reviewer_user_id OR r.state<>'in_review' THEN RAISE EXCEPTION 'Assigned reviewer in active review required' USING ERRCODE='42501'; END IF;
   IF NOT public.uc_org_document_review_actor(d.organization_id,r.responsible_user_id) THEN RAISE EXCEPTION 'Responsible actor access changed; reconfigure' USING ERRCODE='42501'; END IF;
   PERFORM public.uc_validate_org_document_review_links(d.organization_id,r.links);
   IF EXISTS(SELECT 1 FROM public.org_document_review_comments WHERE review_id=r.id AND
    (resolution_status='unresolved' OR resolution_status='accepted' AND position_anchor->>'kind' IN('insert','delete','replace'))) THEN
    RAISE EXCEPTION 'Resolve comments; accepted content changes require a new file version' USING ERRCODE='55000'; END IF;
   IF p_body->>'approval_number' IS NULL OR p_body->>'approval_number' !~ '[^[:space:]]' OR length(p_body->>'approval_number')>200
    OR p_body->>'approval_date' IS NULL THEN RAISE EXCEPTION 'Explicit internal approval number and date required' USING ERRCODE='22023'; END IF;
   UPDATE public.org_document_reviews SET state='approved',approval_number=p_body->>'approval_number',approval_date=(p_body->>'approval_date')::date,
    approved_at=clock_timestamp(),approved_by=v_actor,revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  ELSE
   UPDATE public.org_document_reviews SET state='cancelled',revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  END IF;
 ELSE
  IF r.state NOT IN('in_review','changes_requested') THEN RAISE EXCEPTION 'Comments require an active internal review' USING ERRCODE='55000'; END IF;
  IF p_operation='comment' THEN
   IF p_body->>'text' IS NULL OR p_body->>'text' !~ '[^[:space:]]' OR length(p_body->>'text')>4000 OR length(p_body->>'quote')>8000 THEN
    RAISE EXCEPTION 'Invalid review comment text' USING ERRCODE='22023'; END IF;
   v_anchor:=nullif(p_body->'anchor','null'::jsonb);
   IF v_anchor IS NOT NULL AND (jsonb_typeof(v_anchor)<>'object' OR octet_length(v_anchor::text)>16000 OR
    coalesce(v_anchor->>'kind','comment') NOT IN('comment','insert','delete','replace')) THEN
    RAISE EXCEPTION 'Invalid review anchor' USING ERRCODE='22023'; END IF;
   SELECT coalesce(nullif(p.full_name,''),nullif(s.display_name,''),'Сотрудник') INTO v_name FROM (SELECT v_actor user_id) x
    LEFT JOIN public.profiles p ON p.user_id=x.user_id LEFT JOIN public.org_staff s ON s.user_id=x.user_id AND s.organization_id=d.organization_id;
   v_role:=CASE WHEN v_actor=r.reviewer_user_id THEN 'reviewer' ELSE 'responsible' END;
   INSERT INTO public.org_document_review_comments(organization_id,review_id,version_id,author_user_id,author_name,author_role,comment_text,quoted_text,position_anchor)
   VALUES(d.organization_id,r.id,r.version_id,v_actor,coalesce(v_name,'Сотрудник'),v_role,p_body->>'text',p_body->>'quote',v_anchor) RETURNING id INTO v_comment;
   v_action:='comment';
  ELSE
   IF p_body->>'resolution' IS NULL OR p_body->>'resolution' NOT IN('accepted','declined') OR length(p_body->>'reply')>4000 THEN
    RAISE EXCEPTION 'Invalid comment resolution' USING ERRCODE='22023'; END IF;
   SELECT * INTO c FROM public.org_document_review_comments WHERE id=(p_body->>'comment_id')::uuid AND review_id=r.id FOR UPDATE;
   IF NOT FOUND OR c.resolution_status<>'unresolved' THEN RAISE EXCEPTION 'Comment already resolved; reload review' USING ERRCODE='40001'; END IF;
   UPDATE public.org_document_review_comments SET resolution_status=p_body->>'resolution',org_reply=p_body->>'reply',resolved_by=v_actor,resolved_at=clock_timestamp() WHERE id=c.id;
   v_action:='resolve_comment';v_note:=p_body->>'reply';
  END IF;
  UPDATE public.org_document_reviews SET revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
 END IF;
 INSERT INTO public.org_document_review_events(organization_id,review_id,revision,actor_id,action,note,snapshot)
 VALUES(d.organization_id,r.id,r.revision,v_actor,v_action,v_note,to_jsonb(r));
 v_receipt:=public.uc_org_document_review_snapshot(r.id);
 INSERT INTO public.org_document_review_requests(request_id,organization_id,document_id,review_id,actor_id,payload,receipt)
 VALUES(v_request,d.organization_id,d.id,r.id,v_actor,v_payload,v_receipt);
 RETURN v_receipt;
END;$fn$;
CREATE FUNCTION public.save_org_document_review_draft(p_document_id uuid,p_version_id uuid,p_expected_document_revision bigint,p_expected_workflow_revision bigint,
 p_responsible_user_id uuid,p_reviewer_user_id uuid,p_links jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_org_document_review('save',jsonb_build_object('document_id',p_document_id,'version_id',p_version_id,
 'expected_document_revision',p_expected_document_revision,'expected_workflow_revision',p_expected_workflow_revision,'responsible_user_id',p_responsible_user_id,
 'reviewer_user_id',p_reviewer_user_id,'links',p_links,'request_id',p_request_id))
$fn$;
CREATE FUNCTION public.transition_org_document_review(p_review_id uuid,p_expected_workflow_revision bigint,p_expected_document_revision bigint,p_action text,
 p_note text,p_approval_number text,p_approval_date date,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_org_document_review('transition',jsonb_build_object('review_id',p_review_id,'expected_workflow_revision',p_expected_workflow_revision,
 'expected_document_revision',p_expected_document_revision,'action',p_action,'note',p_note,'approval_number',p_approval_number,'approval_date',p_approval_date,'request_id',p_request_id))
$fn$;
CREATE FUNCTION public.add_org_document_review_comment(p_review_id uuid,p_version_id uuid,p_expected_workflow_revision bigint,p_text text,p_quote text,p_anchor jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_org_document_review('comment',jsonb_build_object('review_id',p_review_id,'version_id',p_version_id,'expected_workflow_revision',p_expected_workflow_revision,
 'text',p_text,'quote',p_quote,'anchor',p_anchor,'request_id',p_request_id))
$fn$;
CREATE FUNCTION public.resolve_org_document_review_comment(p_comment_id uuid,p_expected_workflow_revision bigint,p_resolution text,p_reply text,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_org_document_review('resolve',jsonb_build_object('comment_id',p_comment_id,'expected_workflow_revision',p_expected_workflow_revision,
 'resolution',p_resolution,'reply',p_reply,'request_id',p_request_id))
$fn$;
REVOKE ALL ON FUNCTION public.uc_org_document_review_actor(uuid,uuid),public.uc_org_document_review_file_state(public.org_documents),
 public.uc_org_document_review_actor_name(uuid,uuid),public.uc_org_document_review_file_bound(public.org_documents),
 public.uc_org_document_review_snapshot(uuid),public.uc_guard_org_document_review_history(),public.uc_guard_org_document_review_record(),
 public.uc_validate_org_document_review_links(uuid,jsonb),public.uc_mutate_org_document_review(text,jsonb),
 public.get_org_document_workflow(uuid),public.list_org_document_review_candidates(uuid),
 public.save_org_document_review_draft(uuid,uuid,bigint,bigint,uuid,uuid,jsonb,uuid),
 public.transition_org_document_review(uuid,bigint,bigint,text,text,text,date,uuid),
 public.add_org_document_review_comment(uuid,uuid,bigint,text,text,jsonb,uuid),
 public.resolve_org_document_review_comment(uuid,bigint,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_org_document_workflow(uuid),public.list_org_document_review_candidates(uuid),
 public.save_org_document_review_draft(uuid,uuid,bigint,bigint,uuid,uuid,jsonb,uuid),
 public.transition_org_document_review(uuid,bigint,bigint,text,text,text,date,uuid),
 public.add_org_document_review_comment(uuid,uuid,bigint,text,text,jsonb,uuid),
 public.resolve_org_document_review_comment(uuid,bigint,text,text,uuid) TO authenticated;

$source_110$;BEGIN
 IF md5(source)<>'de6de92f55d7d8478133678026097b9a' THEN RAISE EXCEPTION 'Source hash mismatch 20261018110000';END IF;
 EXECUTE source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261018110000','uc_document_internal_review',ARRAY[source]);
END $migration$;
DO $assert$ DECLARE r jsonb;BEGIN SELECT to_jsonb(q) INTO r FROM (-- Repeatable metadata-only acceptance; remains valid after real review records exist.
SELECT
 (SELECT count(*)=1 FROM supabase_migrations.schema_migrations WHERE (version='20261018110000' AND name='uc_document_internal_review' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='de6de92f55d7d8478133678026097b9a')) AS exact_review_ledger,
 coalesce(md5(pg_get_functiondef(to_regprocedure('public.add_org_document_review_comment(uuid,uuid,bigint,text,text,jsonb,uuid)')))='9ac6ed846ae68abe16506ef101b61cfe',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.get_org_document_workflow(uuid)')))='fbfd77ee0612152324ca66b387350fe4',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.list_org_document_review_candidates(uuid)')))='4c1401764363fb46a1d2895be968322c',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.resolve_org_document_review_comment(uuid,bigint,text,text,uuid)')))='994b7de94f54b67513123e41dc4a3c3e',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.save_org_document_review_draft(uuid,uuid,bigint,bigint,uuid,uuid,jsonb,uuid)')))='c810584557dcec64792fa28aba977699',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.transition_org_document_review(uuid,bigint,bigint,text,text,text,date,uuid)')))='79e1d5e6e8fcf9f4f22336a3cdfd9af2',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_org_document_review_history()')))='c5a41dc28c5166ca64bc12b6d045a0d1',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_org_document_review_record()')))='6455ddb3a86e9284c610db4203880320',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_mutate_org_document_review(text,jsonb)')))='74cb0b0059a16da71be61618e4cbd411',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_org_document_review_actor(uuid,uuid)')))='89738b475b21d69f496a543ceb97da49',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_org_document_review_actor_name(uuid,uuid)')))='3be72ce07caea51ac89d46e2fa6ca2e7',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_org_document_review_file_bound(org_documents)')))='52a37a3afd327393cc73b8af2a784316',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_org_document_review_file_state(org_documents)')))='1d653238bb9409357a17dc18fe78e060',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_org_document_review_snapshot(uuid)')))='21e23b5969a0b835dc8078d480976e69',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_validate_org_document_review_links(uuid,jsonb)')))='96e63767fec0bca93e7c77930e8e4407',false) AS exact_new_functions,
 (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.org_document_reviews'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.org_document_reviews'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='org_document_reviews'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='org_document_reviews'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.org_document_reviews'::regclass AND NOT tgisinternal),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.org_document_reviews'::regclass))::text) hash)='5e748d5d2679c9a40cc5e083e19d7d56' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.org_document_review_comments'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.org_document_review_comments'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='org_document_review_comments'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='org_document_review_comments'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.org_document_review_comments'::regclass AND NOT tgisinternal),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.org_document_review_comments'::regclass))::text) hash)='889d533fca3ede97fe04d449bf3f0a8e' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.org_document_review_events'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.org_document_review_events'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='org_document_review_events'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='org_document_review_events'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.org_document_review_events'::regclass AND NOT tgisinternal),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.org_document_review_events'::regclass))::text) hash)='aaeab9eec03d949b52d226de59df2769' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.org_document_review_requests'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.org_document_review_requests'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='org_document_review_requests'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='org_document_review_requests'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.org_document_review_requests'::regclass AND NOT tgisinternal),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.org_document_review_requests'::regclass))::text) hash)='ee5af1e6e9af44a9acf0a373eb8777a2' AS exact_new_schema,
 has_table_privilege('authenticated','public.org_document_reviews','SELECT') AND NOT has_table_privilege('authenticated','public.org_document_reviews','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.org_document_reviews','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.org_document_reviews','SELECT,INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.org_document_review_comments','SELECT') AND NOT has_table_privilege('authenticated','public.org_document_review_comments','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.org_document_review_comments','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.org_document_review_comments','SELECT,INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.org_document_review_events','SELECT') AND NOT has_table_privilege('authenticated','public.org_document_review_events','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.org_document_review_events','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.org_document_review_events','SELECT,INSERT,UPDATE,DELETE') AS rpc_only_writes,
 NOT has_table_privilege('authenticated','public.org_document_review_requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.org_document_review_requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.org_document_review_requests','SELECT,INSERT,UPDATE,DELETE') AS private_request_receipts,
 has_function_privilege('authenticated','public.add_org_document_review_comment(uuid,uuid,bigint,text,text,jsonb,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.add_org_document_review_comment(uuid,uuid,bigint,text,text,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.add_org_document_review_comment(uuid,uuid,bigint,text,text,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.get_org_document_workflow(uuid)','EXECUTE')=true AND has_function_privilege('anon','public.get_org_document_workflow(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.get_org_document_workflow(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.list_org_document_review_candidates(uuid)','EXECUTE')=true AND has_function_privilege('anon','public.list_org_document_review_candidates(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.list_org_document_review_candidates(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.resolve_org_document_review_comment(uuid,bigint,text,text,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.resolve_org_document_review_comment(uuid,bigint,text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.resolve_org_document_review_comment(uuid,bigint,text,text,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.save_org_document_review_draft(uuid,uuid,bigint,bigint,uuid,uuid,jsonb,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.save_org_document_review_draft(uuid,uuid,bigint,bigint,uuid,uuid,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.save_org_document_review_draft(uuid,uuid,bigint,bigint,uuid,uuid,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.transition_org_document_review(uuid,bigint,bigint,text,text,text,date,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.transition_org_document_review(uuid,bigint,bigint,text,text,text,date,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.transition_org_document_review(uuid,bigint,bigint,text,text,text,date,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_guard_org_document_review_history()','EXECUTE')=false AND has_function_privilege('anon','public.uc_guard_org_document_review_history()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_guard_org_document_review_history()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_guard_org_document_review_record()','EXECUTE')=false AND has_function_privilege('anon','public.uc_guard_org_document_review_record()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_guard_org_document_review_record()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_mutate_org_document_review(text,jsonb)','EXECUTE')=false AND has_function_privilege('anon','public.uc_mutate_org_document_review(text,jsonb)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_mutate_org_document_review(text,jsonb)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_org_document_review_actor(uuid,uuid)','EXECUTE')=false AND has_function_privilege('anon','public.uc_org_document_review_actor(uuid,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_org_document_review_actor(uuid,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_org_document_review_actor_name(uuid,uuid)','EXECUTE')=false AND has_function_privilege('anon','public.uc_org_document_review_actor_name(uuid,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_org_document_review_actor_name(uuid,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_org_document_review_file_bound(org_documents)','EXECUTE')=false AND has_function_privilege('anon','public.uc_org_document_review_file_bound(org_documents)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_org_document_review_file_bound(org_documents)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_org_document_review_file_state(org_documents)','EXECUTE')=false AND has_function_privilege('anon','public.uc_org_document_review_file_state(org_documents)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_org_document_review_file_state(org_documents)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_org_document_review_snapshot(uuid)','EXECUTE')=false AND has_function_privilege('anon','public.uc_org_document_review_snapshot(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_org_document_review_snapshot(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_validate_org_document_review_links(uuid,jsonb)','EXECUTE')=false AND has_function_privilege('anon','public.uc_validate_org_document_review_links(uuid,jsonb)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_validate_org_document_review_links(uuid,jsonb)','EXECUTE')=false AS exact_function_grants,
 EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND policyname='uc_org_document_blob_no_delete' AND md5(to_jsonb(p)::text)='c82f6a57a88835e478dba6728f01489b') AND EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND policyname='uc_org_document_blob_no_overwrite' AND md5(to_jsonb(p)::text)='c5030108254eabf8300b0c94b9d7ef4e') AS exact_immutable_storage_boundary) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'UC review postcheck failed: %',r;END IF;END $assert$;
DO $preserve$ DECLARE r record;n bigint;h text;BEGIN
 FOR r IN SELECT * FROM uc_review_before LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(x)::text,E''\n'' ORDER BY to_jsonb(x)::text),'''')) FROM %s x',r.table_name) INTO n,h;
 IF (n,h) IS DISTINCT FROM (r.row_count,r.row_hash) THEN RAISE EXCEPTION 'Historical data changed in %',r.table_name;END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM uc_review_policies_before b LEFT JOIN pg_policies p USING(schemaname,tablename,policyname) WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(p)) THEN RAISE EXCEPTION 'Existing policy changed';END IF;
 IF EXISTS(SELECT 1 FROM uc_review_functions_before b LEFT JOIN pg_proc p ON p.oid=b.oid WHERE b.definition_hash IS DISTINCT FROM md5(pg_get_functiondef(p.oid)) OR b.proowner IS DISTINCT FROM p.proowner OR b.proacl IS DISTINCT FROM p.proacl) THEN RAISE EXCEPTION 'Existing function changed';END IF;
 IF EXISTS(SELECT 1 FROM uc_review_cron_before b FULL JOIN (SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j) a USING(jobid) WHERE b.hash IS DISTINCT FROM a.hash) THEN RAISE EXCEPTION 'Cron metadata changed';END IF;
 IF EXISTS(SELECT 1 FROM public.org_document_reviews) OR EXISTS(SELECT 1 FROM public.org_document_review_comments) OR EXISTS(SELECT 1 FROM public.org_document_review_events) OR EXISTS(SELECT 1 FROM public.org_document_review_requests) THEN RAISE EXCEPTION 'Unexpected internal review backfill';END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';COMMIT;
-- Repeatable metadata-only acceptance; remains valid after real review records exist.
SELECT
 (SELECT count(*)=1 FROM supabase_migrations.schema_migrations WHERE (version='20261018110000' AND name='uc_document_internal_review' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='de6de92f55d7d8478133678026097b9a')) AS exact_review_ledger,
 coalesce(md5(pg_get_functiondef(to_regprocedure('public.add_org_document_review_comment(uuid,uuid,bigint,text,text,jsonb,uuid)')))='9ac6ed846ae68abe16506ef101b61cfe',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.get_org_document_workflow(uuid)')))='fbfd77ee0612152324ca66b387350fe4',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.list_org_document_review_candidates(uuid)')))='4c1401764363fb46a1d2895be968322c',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.resolve_org_document_review_comment(uuid,bigint,text,text,uuid)')))='994b7de94f54b67513123e41dc4a3c3e',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.save_org_document_review_draft(uuid,uuid,bigint,bigint,uuid,uuid,jsonb,uuid)')))='c810584557dcec64792fa28aba977699',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.transition_org_document_review(uuid,bigint,bigint,text,text,text,date,uuid)')))='79e1d5e6e8fcf9f4f22336a3cdfd9af2',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_org_document_review_history()')))='c5a41dc28c5166ca64bc12b6d045a0d1',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_org_document_review_record()')))='6455ddb3a86e9284c610db4203880320',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_mutate_org_document_review(text,jsonb)')))='74cb0b0059a16da71be61618e4cbd411',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_org_document_review_actor(uuid,uuid)')))='89738b475b21d69f496a543ceb97da49',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_org_document_review_actor_name(uuid,uuid)')))='3be72ce07caea51ac89d46e2fa6ca2e7',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_org_document_review_file_bound(org_documents)')))='52a37a3afd327393cc73b8af2a784316',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_org_document_review_file_state(org_documents)')))='1d653238bb9409357a17dc18fe78e060',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_org_document_review_snapshot(uuid)')))='21e23b5969a0b835dc8078d480976e69',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_validate_org_document_review_links(uuid,jsonb)')))='96e63767fec0bca93e7c77930e8e4407',false) AS exact_new_functions,
 (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.org_document_reviews'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.org_document_reviews'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='org_document_reviews'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='org_document_reviews'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.org_document_reviews'::regclass AND NOT tgisinternal),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.org_document_reviews'::regclass))::text) hash)='5e748d5d2679c9a40cc5e083e19d7d56' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.org_document_review_comments'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.org_document_review_comments'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='org_document_review_comments'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='org_document_review_comments'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.org_document_review_comments'::regclass AND NOT tgisinternal),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.org_document_review_comments'::regclass))::text) hash)='889d533fca3ede97fe04d449bf3f0a8e' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.org_document_review_events'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.org_document_review_events'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='org_document_review_events'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='org_document_review_events'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.org_document_review_events'::regclass AND NOT tgisinternal),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.org_document_review_events'::regclass))::text) hash)='aaeab9eec03d949b52d226de59df2769' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.org_document_review_requests'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.org_document_review_requests'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='org_document_review_requests'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='org_document_review_requests'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.org_document_review_requests'::regclass AND NOT tgisinternal),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.org_document_review_requests'::regclass))::text) hash)='ee5af1e6e9af44a9acf0a373eb8777a2' AS exact_new_schema,
 has_table_privilege('authenticated','public.org_document_reviews','SELECT') AND NOT has_table_privilege('authenticated','public.org_document_reviews','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.org_document_reviews','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.org_document_reviews','SELECT,INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.org_document_review_comments','SELECT') AND NOT has_table_privilege('authenticated','public.org_document_review_comments','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.org_document_review_comments','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.org_document_review_comments','SELECT,INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.org_document_review_events','SELECT') AND NOT has_table_privilege('authenticated','public.org_document_review_events','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.org_document_review_events','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.org_document_review_events','SELECT,INSERT,UPDATE,DELETE') AS rpc_only_writes,
 NOT has_table_privilege('authenticated','public.org_document_review_requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.org_document_review_requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.org_document_review_requests','SELECT,INSERT,UPDATE,DELETE') AS private_request_receipts,
 has_function_privilege('authenticated','public.add_org_document_review_comment(uuid,uuid,bigint,text,text,jsonb,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.add_org_document_review_comment(uuid,uuid,bigint,text,text,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.add_org_document_review_comment(uuid,uuid,bigint,text,text,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.get_org_document_workflow(uuid)','EXECUTE')=true AND has_function_privilege('anon','public.get_org_document_workflow(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.get_org_document_workflow(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.list_org_document_review_candidates(uuid)','EXECUTE')=true AND has_function_privilege('anon','public.list_org_document_review_candidates(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.list_org_document_review_candidates(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.resolve_org_document_review_comment(uuid,bigint,text,text,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.resolve_org_document_review_comment(uuid,bigint,text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.resolve_org_document_review_comment(uuid,bigint,text,text,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.save_org_document_review_draft(uuid,uuid,bigint,bigint,uuid,uuid,jsonb,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.save_org_document_review_draft(uuid,uuid,bigint,bigint,uuid,uuid,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.save_org_document_review_draft(uuid,uuid,bigint,bigint,uuid,uuid,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.transition_org_document_review(uuid,bigint,bigint,text,text,text,date,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.transition_org_document_review(uuid,bigint,bigint,text,text,text,date,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.transition_org_document_review(uuid,bigint,bigint,text,text,text,date,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_guard_org_document_review_history()','EXECUTE')=false AND has_function_privilege('anon','public.uc_guard_org_document_review_history()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_guard_org_document_review_history()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_guard_org_document_review_record()','EXECUTE')=false AND has_function_privilege('anon','public.uc_guard_org_document_review_record()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_guard_org_document_review_record()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_mutate_org_document_review(text,jsonb)','EXECUTE')=false AND has_function_privilege('anon','public.uc_mutate_org_document_review(text,jsonb)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_mutate_org_document_review(text,jsonb)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_org_document_review_actor(uuid,uuid)','EXECUTE')=false AND has_function_privilege('anon','public.uc_org_document_review_actor(uuid,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_org_document_review_actor(uuid,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_org_document_review_actor_name(uuid,uuid)','EXECUTE')=false AND has_function_privilege('anon','public.uc_org_document_review_actor_name(uuid,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_org_document_review_actor_name(uuid,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_org_document_review_file_bound(org_documents)','EXECUTE')=false AND has_function_privilege('anon','public.uc_org_document_review_file_bound(org_documents)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_org_document_review_file_bound(org_documents)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_org_document_review_file_state(org_documents)','EXECUTE')=false AND has_function_privilege('anon','public.uc_org_document_review_file_state(org_documents)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_org_document_review_file_state(org_documents)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_org_document_review_snapshot(uuid)','EXECUTE')=false AND has_function_privilege('anon','public.uc_org_document_review_snapshot(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_org_document_review_snapshot(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_validate_org_document_review_links(uuid,jsonb)','EXECUTE')=false AND has_function_privilege('anon','public.uc_validate_org_document_review_links(uuid,jsonb)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_validate_org_document_review_links(uuid,jsonb)','EXECUTE')=false AS exact_function_grants,
 EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND policyname='uc_org_document_blob_no_delete' AND md5(to_jsonb(p)::text)='c82f6a57a88835e478dba6728f01489b') AND EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND policyname='uc_org_document_blob_no_overwrite' AND md5(to_jsonb(p)::text)='c5030108254eabf8300b0c94b9d7ef4e') AS exact_immutable_storage_boundary;
