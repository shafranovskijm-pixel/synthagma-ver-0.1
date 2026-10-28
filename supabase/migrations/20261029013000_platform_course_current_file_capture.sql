-- SOURCE ONLY. Additive current-reference intent proof; not executed or runtime accepted.
-- Requires exact installed five-stage ledger650. Existing begin5/reader/worker bodies and capabilities are unchanged.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=pg_catalog,public,pg_temp;
DO $install_current_capture_20261029013000$
DECLARE
 v_definition constant text:=$exact_current_capture_definition$CREATE FUNCTION public.begin_platform_course_current_file_capture(
 p_marketplace_id uuid,p_expected_edition_sha256 text,p_reference_kind text,p_reference_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $current_capture$
DECLARE
 v_actor uuid;v_course uuid;v_lesson uuid;v_fresh_lesson uuid;v_target uuid;v_bucket text;v_library uuid;
 v_manifest jsonb;v_edition text;v_snapshot jsonb;v_reply jsonb;v_expected_selection text;
 v_intent public.platform_course_file_intents;v_started timestamptz:=clock_timestamp();
BEGIN
 -- Ordinary active moderator/account authority, never an actor supplied by the browser.
 v_actor:=public.pcr_v2_actor(false);
 IF NOT coalesce(public.uc_platform_document_action_allowed(v_actor,'read'),false)THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_DENIED' USING ERRCODE='42501';END IF;
 IF current_setting('transaction_isolation')<>'read committed'THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 IF p_marketplace_id IS NULL OR p_expected_edition_sha256 IS NULL OR p_expected_edition_sha256!~'^[a-f0-9]{64}$'
 OR p_reference_kind IS NULL OR p_reference_kind NOT IN('course_document','lesson_attachment')OR p_reference_id IS NULL OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_SELECTION_REQUIRED' USING ERRCODE='22023';END IF;
 -- Existing PCR enter takes the same account/own-edition/parent/listing fences used by own-source writers.
 v_course:=public.pcr_v2_enter(p_marketplace_id);
 IF public.pcr_v2_actor(false)IS DISTINCT FROM v_actor OR NOT coalesce(public.uc_platform_document_action_allowed(v_actor,'read'),false)THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_DENIED' USING ERRCODE='42501';END IF;
 -- Explicit current Auth/profile row fences supplement the account advisory fence; no stale RR snapshot is accepted.
 PERFORM 1 FROM auth.users WHERE id=v_actor AND deleted_at IS NULL AND(banned_until IS NULL OR banned_until<=clock_timestamp())FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_DENIED' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=v_actor AND blocked_at IS NULL AND archived_at IS NULL FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_DENIED' USING ERRCODE='42501';END IF;
 -- The only supported fresh source is this fixed bucket. Bucket and target row locks persist to transaction end.
 SELECT id INTO v_bucket FROM storage.buckets WHERE id='course-files'FOR SHARE NOWAIT;
 IF v_bucket IS NULL THEN RAISE EXCEPTION 'PCF_CURRENT_COURSE_FILES_ONLY' USING ERRCODE='23514';END IF;
 IF p_reference_kind='course_document'THEN
  SELECT id,library_document_id INTO v_target,v_library FROM public.course_documents WHERE id=p_reference_id AND course_id=v_course FOR SHARE NOWAIT;
  IF v_target IS NULL THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
  IF v_library IS NOT NULL THEN RAISE EXCEPTION 'PCF_CURRENT_COURSE_FILES_ONLY' USING ERRCODE='23514';END IF;
 ELSE
  SELECT lesson_id INTO v_lesson FROM public.lesson_attachments WHERE id=p_reference_id;
  IF v_lesson IS NULL THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
  SELECT id INTO v_target FROM public.lessons WHERE id=v_lesson AND course_id=v_course FOR SHARE NOWAIT;
  IF v_target IS NULL THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
  SELECT lesson_id INTO v_fresh_lesson FROM public.lesson_attachments WHERE id=p_reference_id AND lesson_id=v_lesson FOR SHARE NOWAIT;
  IF v_fresh_lesson IS DISTINCT FROM v_lesson THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 END IF;
 v_manifest:=public.pcr_v2_manifest(v_course,p_marketplace_id);v_edition:=public.pcr_v2_sha(v_manifest);
 IF v_edition IS DISTINCT FROM p_expected_edition_sha256 THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 v_snapshot:=public.pcf_v1_reference_snapshot(v_course,p_reference_kind,p_reference_id,NULL::uuid);
 IF v_snapshot->>'source_bucket'IS DISTINCT FROM'course-files'
 OR v_snapshot->'library_document_id'IS DISTINCT FROM'null'::jsonb OR v_snapshot->'library_row_sha256'IS DISTINCT FROM'null'::jsonb
 OR v_snapshot->'source_org_version_id'IS DISTINCT FROM'null'::jsonb OR v_snapshot->'source_org_document_id'IS DISTINCT FROM'null'::jsonb
 OR v_snapshot->'source_org_version_metadata_sha256'IS DISTINCT FROM'null'::jsonb OR v_snapshot->'declared_org_storage_object_id'IS DISTINCT FROM'null'::jsonb
 OR v_snapshot->>'course_id'IS DISTINCT FROM v_course::text OR v_snapshot->>'organization_id'IS DISTINCT FROM'4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
 OR v_snapshot->>'reference_kind'IS DISTINCT FROM p_reference_kind OR v_snapshot->>'reference_id'IS DISTINCT FROM p_reference_id::text THEN
  RAISE EXCEPTION 'PCF_CURRENT_COURSE_FILES_ONLY' USING ERRCODE='23514';END IF;
 -- This call and all surrounding proofs occur in this SAME transaction, never a second SDK/RPC request.
 v_reply:=public.begin_platform_course_file_capture(p_marketplace_id,p_reference_kind,p_reference_id,NULL::uuid,p_request_id);
 IF jsonb_typeof(v_reply)IS DISTINCT FROM'object'OR(SELECT count(*)FROM jsonb_object_keys(v_reply))<>4
 OR NOT(v_reply?&ARRAY['intent_id','expires_at','replayed','state'])OR v_reply->'replayed'IS DISTINCT FROM'false'::jsonb
 OR v_reply->>'state'IS DISTINCT FROM'capture_intent_only_not_verified_or_approved'
 OR jsonb_typeof(v_reply->'intent_id')IS DISTINCT FROM'string'OR NOT coalesce(pg_input_is_valid(v_reply->>'intent_id','uuid'),false)
 OR jsonb_typeof(v_reply->'expires_at')IS DISTINCT FROM'string'OR NOT coalesce(pg_input_is_valid(v_reply->>'expires_at','timestamp with time zone'),false)THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_FRESH_INTENT_REQUIRED_NO_REPLAY' USING ERRCODE='22023';END IF;
 SELECT * INTO v_intent FROM public.platform_course_file_intents WHERE id=(v_reply->>'intent_id')::uuid FOR SHARE NOWAIT;
 v_expected_selection:=public.pcr_v2_sha(jsonb_build_object('marketplace_id',p_marketplace_id,'reference_kind',p_reference_kind,'reference_id',p_reference_id,'source_org_version_id',NULL::uuid));
 IF v_intent.id IS NULL OR v_intent.actor_id IS DISTINCT FROM v_actor OR v_intent.marketplace_id IS DISTINCT FROM p_marketplace_id
 OR v_intent.course_id IS DISTINCT FROM v_course OR v_intent.organization_id IS DISTINCT FROM'4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
 OR v_intent.reference_kind IS DISTINCT FROM p_reference_kind OR v_intent.reference_id IS DISTINCT FROM p_reference_id
 OR v_intent.source_org_version_id IS NOT NULL OR v_intent.request_id IS DISTINCT FROM p_request_id
 OR v_intent.selection_sha256 IS DISTINCT FROM v_expected_selection OR v_intent.scope_generation::text IS DISTINCT FROM v_snapshot->>'scope_generation'
 OR v_intent.reference_snapshot IS DISTINCT FROM v_snapshot OR v_intent.created_at<v_started OR v_intent.created_at>clock_timestamp()
 OR v_intent.expires_at IS DISTINCT FROM(v_reply->>'expires_at')::timestamptz OR v_intent.expires_at<=clock_timestamp()
 OR v_intent.expires_at>v_intent.created_at+interval'120 seconds'
 OR EXISTS(SELECT 1 FROM public.platform_course_file_receipts WHERE intent_id=v_intent.id)THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_INTENT_BINDING_MISMATCH' USING ERRCODE='40001';END IF;
 -- Fresh post-begin checks close same-transaction changes and never turn a prior request into current authority.
 IF public.pcr_v2_actor(false)IS DISTINCT FROM v_actor OR NOT coalesce(public.uc_platform_document_action_allowed(v_actor,'read'),false)
 OR public.pcr_v2_sha(public.pcr_v2_manifest(v_course,p_marketplace_id))IS DISTINCT FROM p_expected_edition_sha256
 OR public.pcf_v1_reference_snapshot(v_course,p_reference_kind,p_reference_id,NULL::uuid)IS DISTINCT FROM v_snapshot THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 RETURN v_reply||jsonb_build_object('schema_version',1,'actor_id',v_actor,'organization_id','4ac2c05a-d8b5-4e72-ba31-f2c743091d95',
  'marketplace_id',p_marketplace_id,'course_id',v_course,'current_edition_sha256',p_expected_edition_sha256,
  'reference_kind',p_reference_kind,'reference_id',p_reference_id,
  'selection_proof','same_transaction_current_course_files_only_no_library_or_org_version');
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CHANGED_RETRY' USING ERRCODE='40001';
END;
$current_capture$;
$exact_current_capture_definition$;
 v_expected_new_dependencies constant jsonb:=$current_capture_dependencies7$[{"signature":"public.pcr_v2_sha(jsonb)","body_sha256":"0efcedbc625bdd5c0e6dc3f27a59e846460fe328880fd562d3f0de352c913b5a","language":"sql","return_type":"text","security_definer":false,"strictness":true,"volatility":"i","configuration":["search_path=pg_catalog, public"],"argument_names":["p_value"],"default_argument_count":0,"allowed_role":null},{"signature":"public.pcr_v2_actor(boolean)","body_sha256":"63b645338e10484f5239d936457d2cec774b0d9f7afa160fa38b73c5154d5a1c","language":"plpgsql","return_type":"uuid","security_definer":true,"strictness":false,"volatility":"v","configuration":["search_path=pg_catalog, public","lock_timeout=3s"],"argument_names":["p_wait"],"default_argument_count":1,"allowed_role":null},{"signature":"public.pcr_v2_enter(uuid)","body_sha256":"a379ba544bd18a26ac8f8c6d68c4077e60f96de79b6a4afc1eb0ef3a9726a53f","language":"plpgsql","return_type":"uuid","security_definer":true,"strictness":false,"volatility":"v","configuration":["search_path=pg_catalog, public","lock_timeout=3s"],"argument_names":["p_listing"],"default_argument_count":0,"allowed_role":null},{"signature":"public.pcr_v2_manifest(uuid,uuid)","body_sha256":"ee7092c56bb9a82d7502c54723cd639869b4f599ad18d2eb88b690e099c004b4","language":"plpgsql","return_type":"jsonb","security_definer":true,"strictness":false,"volatility":"v","configuration":["search_path=pg_catalog, public"],"argument_names":["p_course","p_listing"],"default_argument_count":0,"allowed_role":null},{"signature":"public.begin_platform_course_file_capture(uuid,text,uuid,uuid,uuid)","body_sha256":"f81ba77d8442137ff460c059eb3dceff7647bf80423e9abc28a3707da4bb8d8f","language":"plpgsql","return_type":"jsonb","security_definer":true,"strictness":false,"volatility":"v","configuration":["search_path=pg_catalog, public, pg_temp"],"argument_names":["p_marketplace_id","p_reference_kind","p_reference_id","p_source_org_version","p_request_id"],"default_argument_count":0,"allowed_role":"authenticated"},{"signature":"public.pcf_v1_reference_identity(uuid,text,uuid,uuid)","body_sha256":"09955186b37769d5c80470a13d1f3a348646b65ca8b431816d42e91574e71b3b","language":"plpgsql","return_type":"jsonb","security_definer":true,"strictness":false,"volatility":"v","configuration":["search_path=pg_catalog, public, pg_temp"],"argument_names":["p_course","p_kind","p_reference","p_org_version"],"default_argument_count":0,"allowed_role":null},{"signature":"public.pcf_v1_reference_snapshot(uuid,text,uuid,uuid)","body_sha256":"e7a458de0f067dfe65f286407491c18f400bb5f465d7528711d796d960ff38ae","language":"plpgsql","return_type":"jsonb","security_definer":true,"strictness":false,"volatility":"v","configuration":["search_path=pg_catalog, public, pg_temp"],"argument_names":["p_course","p_kind","p_reference","p_org_version"],"default_argument_count":0,"allowed_role":null}]$current_capture_dependencies7$::jsonb;
 v_expected_old_dependencies constant jsonb:=$current_capture_dependencies11$[{"acl":"{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","body_sha256":"173fc1b274f78508f041a186f727489e5867b1d509e042c33863b21fd1873f3f","config":["search_path=pg_catalog, public"],"definition_sha256":"d2771ddc0a8ec9e0b9467fb7072313da89fa104664e206adbff53b40aeb76031","owner":"postgres","security_definer":true,"signature":"account_deletion_access_allowed()","volatility":"s"},{"acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","body_sha256":"725da653d96f2ab0c4c39a4c3b98eaf0500e58c7a35dd86462bb141b84a33e3f","config":["search_path=public"],"definition_sha256":"d21812183ef3c9e3bd45fa1ae027dd27b337b6cdd3f9d37e4a351b0301e2ad1f","owner":"postgres","security_definer":true,"signature":"current_organization_id()","volatility":"s"},{"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","body_sha256":"57063ce01ded1bf74df29b3e0660dbefacc1002f6d043f533d6d56a0f6df0901","config":["search_path=public, pg_temp"],"definition_sha256":"f552ca5a29481ee8f3eef79bf0629f4bcaa9e2a8558aa081b78142aab70c2494","owner":"postgres","security_definer":true,"signature":"guard_marketplace_course_tenant()","volatility":"v"},{"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","body_sha256":"b0336b567653b6b707d213649c61d32a3d41733e47f5eb7c1d30b00fc504f421","config":["search_path=public, pg_temp"],"definition_sha256":"1fbee990a70d888d0b376df6e42a12515e7a0fccafe78d9e91b768c6e1738330","owner":"postgres","security_definer":false,"signature":"guard_marketplace_course_validation()","volatility":"v"},{"acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","body_sha256":"97fe0d241c7ad7485dfc71dcbfc3225362ac44ae69aad2428ac2dd137dfae2cc","config":["search_path=public"],"definition_sha256":"4b13dd0676f6832da8b2e1e791b491cfbe60b1e389ad2b7d87c60b4ec5dd96a6","owner":"postgres","security_definer":true,"signature":"has_role(app_role,uuid)","volatility":"v"},{"acl":"{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","body_sha256":"38489374f587e32d311bda53d9a6ee7a32d5ef5cde633366ceb28f5ad4ff8353","config":["search_path=public"],"definition_sha256":"e4a280ca404f7cff5be54a02ce51871990a84c2c1827568a83587ffb8b7a9854","owner":"postgres","security_definer":true,"signature":"has_role(uuid,app_role)","volatility":"s"},{"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","body_sha256":"aad8674a2af1e670e35a6a29ac9311dd61f7df7368ad24918edaf599261c67fc","config":["search_path=public, pg_temp"],"definition_sha256":"4082ea93cb572d60c7bbc05a0a55e13aaf0b6aa94061b5956d9f723d0008044c","owner":"postgres","security_definer":true,"signature":"invalidate_marketplace_course_validation()","volatility":"v"},{"acl":"{postgres=X/postgres}","body_sha256":"be045de6aab70e370e0fd2df51a01dc6e977a25a7ae74501f8ef7190a07ec23d","config":["search_path=pg_catalog, public"],"definition_sha256":"646ae165fa5bcbd2b833cb0d3175ecdac5ad33bf88bd37f81ebc379089d8e52e","owner":"postgres","security_definer":true,"signature":"plp_curriculum_sha(uuid)","volatility":"s"},{"acl":"{postgres=X/postgres}","body_sha256":"637971dd091629255666336703d882696833a8fccfe3cbfcef29197706815677","config":["search_path=pg_catalog, public"],"definition_sha256":"ea1c38a6cf05d23a09145912a292f4193527eba780fb1b51f03c3c479d25a1ad","owner":"postgres","security_definer":true,"signature":"plp_question_bank(uuid,boolean)","volatility":"s"},{"acl":"{postgres=X/postgres}","body_sha256":"0efcedbc625bdd5c0e6dc3f27a59e846460fe328880fd562d3f0de352c913b5a","config":["search_path=pg_catalog, extensions"],"definition_sha256":"e7469ea4f625c1db9998737abc8baea2f0a0d4268ac12147c4249a4bbe743054","owner":"postgres","security_definer":false,"signature":"plp_sha(jsonb)","volatility":"i"},{"acl":"{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","body_sha256":"dc749ce29212ec2d7c5e5545f0ff1ba8e0701a7d347ba0afa85f327b45af69fe","config":["search_path=pg_catalog, public"],"definition_sha256":"bceeb04a9ca10d04f38658ca6c04248ee6e94d3c57dd15655546d2e4a6f12618","owner":"postgres","security_definer":true,"signature":"uc_platform_document_action_allowed(uuid,text)","volatility":"s"}]$current_capture_dependencies11$::jsonb;
 v_expected_events constant jsonb:=$current_capture_events$[{"body_sha256":"80e0c97f0a475697c1b517e0d27887bfa0c2baf138229735a58a345d2168505b","definition_sha256":"b0cadab880dc68f569b3e01057dc6f5acee9d05e122de6f4256130ae330bbcec","enabled":"O","event":"sql_drop","name":"issue_graphql_placeholder","owner":"supabase_admin","tags":["DROP EXTENSION"]},{"body_sha256":"00db212b76cecd4b0794b2f20c414ab4988d675959747cd12d3eb4c6d6736f38","definition_sha256":"eb3fa2e82a0135bc04a6236f93331911861c91b45d72cba5d9c03c1be2c34b4c","enabled":"O","event":"ddl_command_end","name":"issue_pg_cron_access","owner":"supabase_admin","tags":["CREATE EXTENSION"]},{"body_sha256":"03de03bb70da1d448f7a674215d1b63a924dc7115db657dae34b1aa8977e030e","definition_sha256":"9ec845adab4ba00bbf7740458b6c4461094697023f0f7adc693b373e2ea54f68","enabled":"O","event":"ddl_command_end","name":"issue_pg_graphql_access","owner":"supabase_admin","tags":["CREATE FUNCTION"]},{"body_sha256":"754e58111dbe32030af4d91591dfd78cb3cf8e8f4f56a5fcc199bb0cf7f4ac2b","definition_sha256":"e38c4060751c9695123350596f1cb0d0c943015f3267a2a455d8efe02c711184","enabled":"O","event":"ddl_command_end","name":"issue_pg_net_access","owner":"supabase_admin","tags":["CREATE EXTENSION"]},{"body_sha256":"de987df746eb39647098459e7993bd8595e592969b0cd647828a3d13d37cffe0","definition_sha256":"2b4b5d702ddf70fbd1a05c9825f9f9016d5c0ef97dd3df5f5b012ea23d9b94b1","enabled":"O","event":"ddl_command_end","name":"pgrst_ddl_watch","owner":"supabase_admin","tags":null},{"body_sha256":"791b41f0632fc86e0fc86a303ec0fd710c4e2ecf947a23422dae2b7a2c122f1d","definition_sha256":"3a2696133853e17a0456cbfbb233a03815f50895492143e84df983b558d76593","enabled":"O","event":"sql_drop","name":"pgrst_drop_watch","owner":"supabase_admin","tags":null}]$current_capture_events$::jsonb;
 v_expected_defaults constant jsonb:=$current_capture_defaults$[{"acl":"{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=rU/postgres,sandbox_exec=rU/postgres}","owner":"postgres","schema":"public","type":"S"},{"acl":"{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres}","owner":"postgres","schema":"public","type":"f"},{"acl":"{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,sandbox_exec_atxwvjxbqjgkbjlhsdch=ar/postgres,sandbox_exec=ar/postgres}","owner":"postgres","schema":"public","type":"r"},{"acl":"{postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}","owner":"supabase_admin","schema":"public","type":"S"},{"acl":"{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}","owner":"supabase_admin","schema":"public","type":"f"},{"acl":"{postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}","owner":"supabase_admin","schema":"public","type":"r"}]$current_capture_defaults$::jsonb;
 v_query_meta constant text:=$current_capture_old_meta_query$SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(jsonb_build_object('catalog',to_jsonb(p),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner))::text,'UTF8')),'hex'),'' ORDER BY p.oid::regprocedure::text),''),'UTF8')),'hex'))FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.prokind='f'$current_capture_old_meta_query$;
 v_query_schema constant text:=$current_capture_schema_query$WITH rel AS(SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth','storage','supabase_migrations')AND c.relkind IN('r','p','v','m','S','f')),fp AS(SELECT c.oid::regclass::text name,jsonb_build_object('oid',c.oid,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions,'persistence',c.relpersistence,'partition_bound',pg_get_expr(c.relpartbound,c.oid),'view',CASE WHEN c.relkind IN('v','m')THEN pg_get_viewdef(c.oid,true)END,'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'number',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'collation',a.attcollation,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid))ORDER BY a.attnum),'[]'::jsonb)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred)ORDER BY k.conname),'[]'::jsonb)FROM pg_constraint k WHERE k.conrelid=c.oid),'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'internal',t.tgisinternal,'definition',pg_get_triggerdef(t.oid,false))ORDER BY t.tgname),'[]'::jsonb)FROM pg_trigger t WHERE t.tgrelid=c.oid),'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))ORDER BY p.polname),'[]'::jsonb)FROM pg_policy p WHERE p.polrelid=c.oid),'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',i.indexrelid::regclass::text,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready)ORDER BY i.indexrelid::regclass::text),'[]'::jsonb)FROM pg_index i WHERE i.indrelid=c.oid)) payload FROM rel c)SELECT jsonb_build_object('relations',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(payload::text,'UTF8')),'hex'),'' ORDER BY name),''),'UTF8')),'hex'))FROM fp$current_capture_schema_query$;
 v_before_meta jsonb;v_after_meta jsonb;v_before_schema jsonb;v_after_schema jsonb;v_history jsonb;v_before_history jsonb;v_after_history jsonb;v_row jsonb;v_ok boolean;v_new_oid oid;
 v_before_defaults jsonb;v_after_defaults jsonb;v_before_events jsonb;v_after_events jsonb;v_before_store jsonb:='{}';v_after_store jsonb:='{}';v_relation text;v_digest jsonb;v_cap jsonb;
BEGIN
 IF current_user<>'postgres'OR session_user<>'postgres'OR current_setting('server_version_num')<>'170006'
 OR current_setting('transaction_isolation')<>'read committed'OR current_setting('session_replication_role')<>'origin'
 OR current_setting('standard_conforming_strings')<>'on'THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_EXACT_INSTALLER_CONTEXT_REQUIRED';END IF;
 LOCK TABLE supabase_migrations.schema_migrations IN SHARE MODE NOWAIT;
 IF(SELECT count(*)FROM supabase_migrations.schema_migrations)<>650 OR(SELECT max(version)FROM supabase_migrations.schema_migrations)<>'20261029010000'
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261029013000')THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_EXACT_650_PRECONDITION_NO_REPLAY';END IF;
 IF NOT(SELECT count(*)=5 AND bool_and(coalesce(m.version IS NOT NULL AND m.name=e.name AND cardinality(m.statements)=1
  AND octet_length(m.statements[1])=e.bytes AND encode(sha256(convert_to(m.statements[1],'UTF8')),'hex')=e.sha
  AND m.created_by IS NULL AND m.idempotency_key IS NULL AND m.rollback IS NULL,false))
  FROM(VALUES ('20261028000000','platform_template_publication_review',65401,'39348df1db77364c34e39d70460826eb1be602d6236da20ddadc59a2de37605e'),
('20261028000001','platform_course_publication_review_context',16004,'ab1e7a126f6509771d25452965b0b099fee4a7bf0788809a75544c23039bfb72'),
('20261028080000','platform_course_exact_file_bytes',58941,'ba3561945d80375977a0f1bff1788d85cd57940a8dc8c3cae9363edf632d505f'),
('20261028140000','platform_course_copy_file_delivery',72811,'8d5e38443bad697c5da1735ccefc681fa052b275f57ff437515e4ed046587e01'),
('20261029010000','platform_course_selected_proposal_file_context',18442,'9a8dc71cd64124eeea1a2b133a834269407bcee0ae46dbca9b99b8030c3157a2'))e(version,name,bytes,sha)LEFT JOIN supabase_migrations.schema_migrations m ON m.version=e.version)THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_INSTALLED_FIVE_SOURCE_HISTORY_DRIFT';END IF;
 EXECUTE $current_capture_old_history_query$SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex'))FROM supabase_migrations.schema_migrations t WHERE NOT(version=ANY($1))$current_capture_old_history_query$INTO v_history USING ARRAY['20261028000000','20261028000001','20261028080000','20261028140000','20261029010000']::text[];
 IF v_history IS DISTINCT FROM '{"rows":645,"sha256":"fce92af7a0213b4cb4e08ac24af64264a0281dd8feda240c286c63ce73944136"}'::jsonb THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_OLD645_HISTORY_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='begin_platform_course_current_file_capture')
 OR(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.prokind='f')<>1434 THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_NEW_FUNCTION_REQUIRED_NO_OVERWRITE';END IF;
 -- Full old helper definition/owner/ACL/config preimages remained unchanged by foundation650.
 SELECT count(*)=jsonb_array_length(v_expected_old_dependencies)AND bool_and(coalesce(p.oid IS NOT NULL
  AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=e->>'definition_sha256'
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=e->>'body_sha256'AND pg_get_userbyid(p.proowner)=e->>'owner'
  AND p.proacl::text IS NOT DISTINCT FROM e->>'acl'AND p.prosecdef=(e->>'security_definer')::boolean AND p.provolatile::text=e->>'volatility'
  AND coalesce(to_jsonb(p.proconfig),'null'::jsonb)=coalesce(e->'config','null'::jsonb),false))INTO v_ok
 FROM jsonb_array_elements(v_expected_old_dependencies)e LEFT JOIN pg_proc p ON p.oid=to_regprocedure('public.'||(e->>'signature'));
 IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_OLD_HELPER_PREIMAGE_DRIFT';END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(v_expected_new_dependencies)LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure(v_row->>'signature')
   AND p.proowner='postgres'::regrole AND p.prokind='f'AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=v_row->>'body_sha256'
   AND l.lanname=v_row->>'language'AND format_type(p.prorettype,NULL)=v_row->>'return_type'
   AND p.prosecdef=(v_row->>'security_definer')::boolean AND p.proisstrict=(v_row->>'strictness')::boolean AND p.provolatile::text=v_row->>'volatility'
   AND coalesce(to_jsonb(p.proconfig),'null'::jsonb)=v_row->'configuration')THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_FIVE_STAGE_DEPENDENCY_DRIFT: %',v_row->>'signature';END IF;
 END LOOP;
 IF public.pcf_v1_enforcement_stamp()IS DISTINCT FROM'5d8e867d99288c8e1372c1f7e49c4ca07341ce2fb197b5aa2ff593529095aee6'THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CURRENT650_ENFORCEMENT_STAMP_DRIFT';END IF;
 v_cap:=public.pcf_v1_delivery_capabilities();
 IF v_cap->'frozen_reader_implemented'IS DISTINCT FROM'false'::jsonb OR v_cap->'frontend_consumers_accepted'IS DISTINCT FROM'false'::jsonb
 OR v_cap->'copied_centre_exact_binding_supported'IS DISTINCT FROM'false'::jsonb THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_CAPABILITIES_MUST_STAY_FALSE';END IF;
 EXECUTE $current_capture_defaults_query$SELECT coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'*'),'type',d.defaclobjtype,'acl',d.defaclacl::text)ORDER BY pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'*'),d.defaclobjtype),'[]'::jsonb)FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='public'OR d.defaclnamespace=0$current_capture_defaults_query$INTO v_before_defaults;
 EXECUTE $current_capture_events_query$SELECT coalesce(jsonb_agg(jsonb_build_object('name',e.evtname,'event',e.evtevent,'enabled',e.evtenabled,'tags',e.evttags,'owner',pg_get_userbyid(e.evtowner),'body_sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'definition_sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'))ORDER BY e.evtname),'[]'::jsonb)FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid$current_capture_events_query$INTO v_before_events;
 IF v_before_defaults IS DISTINCT FROM v_expected_defaults OR v_before_events IS DISTINCT FROM v_expected_events THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_TRUSTED_CALLBACK_OR_DEFAULT_ACL_DRIFT';END IF;
 EXECUTE v_query_meta INTO v_before_meta;EXECUTE v_query_schema INTO v_before_schema;
 EXECUTE $current_capture_full650_before$SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex'))FROM supabase_migrations.schema_migrations t$current_capture_full650_before$INTO v_before_history;
 FOREACH v_relation IN ARRAY ARRAY['public.platform_course_file_intents','public.platform_course_file_receipts','public.platform_course_file_binding_events']LOOP
  EXECUTE format('SELECT jsonb_build_object(''rows'',count(*),''sha256'',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex''),'''' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex'')),''''),''UTF8'')),''hex''))FROM %s t',v_relation::regclass)INTO v_digest;
  v_before_store:=v_before_store||jsonb_build_object(v_relation,v_digest);
 END LOOP;
 IF encode(sha256(convert_to(v_definition,'UTF8')),'hex')<>'8cc1992a2e3dabffb5a4d2e4c77701fe703ce2f48445fd699ac37fbb2649e28d'THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_EXACT_SOURCE_LITERAL_REQUIRED';END IF;
 EXECUTE v_definition;
 -- The following unchanged reviewed reset algorithm addresses this one NEW fixed signature only.
 EXECUTE $current_capture_new_only_acl$-- SOURCE PROPOSAL: strip inherited ACL entries only from the fixed objects created above.
-- Existing expected GRANT statements and strict postflight guards remain after this block.
DO $new_acl_reset_current_capture$
DECLARE
 v_signatures text[]:=ARRAY['public.begin_platform_course_current_file_capture(uuid,text,text,uuid,uuid)']::text[];
 v_relations text[]:=ARRAY[]::text[];
 v_kinds text[]:=ARRAY[]::text[];
 v_function_oids oid[]:='{}'::oid[];v_relation_oids oid[]:='{}'::oid[];
 v_expected_owner oid:='postgres'::pg_catalog.regrole;v_public oid:='public'::pg_catalog.regnamespace;
 v_i integer;v_oid oid;v_owner oid;v_namespace oid;v_kind text;v_grantee oid;v_role_name name;v_role_sql text;v_object_sql text;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' THEN RAISE EXCEPTION 'NEW_ACL_POSTGRES_OWNER_REQUIRED';END IF;
 -- Resolve and pin every expected OID/owner/kind before the first privilege mutation.
 FOR v_i IN 1..pg_catalog.cardinality(v_signatures) LOOP
  v_oid:=pg_catalog.to_regprocedure(v_signatures[v_i]);
  SELECT p.proowner,p.pronamespace,p.prokind::text INTO v_owner,v_namespace,v_kind FROM pg_catalog.pg_proc p WHERE p.oid=v_oid;
  IF v_oid IS NULL OR v_owner IS DISTINCT FROM v_expected_owner OR v_namespace IS DISTINCT FROM v_public OR v_kind IS DISTINCT FROM 'f' THEN
   RAISE EXCEPTION 'NEW_ACL_FUNCTION_SCOPE_DRIFT: %',v_signatures[v_i];END IF;
  v_function_oids:=pg_catalog.array_append(v_function_oids,v_oid);
 END LOOP;
 IF pg_catalog.cardinality(v_relations)>0 THEN
  FOR v_i IN 1..pg_catalog.cardinality(v_relations) LOOP
   v_oid:=pg_catalog.to_regclass(v_relations[v_i]);
   SELECT c.relowner,c.relnamespace,c.relkind::text INTO v_owner,v_namespace,v_kind FROM pg_catalog.pg_class c WHERE c.oid=v_oid;
   IF v_oid IS NULL OR v_owner IS DISTINCT FROM v_expected_owner OR v_namespace IS DISTINCT FROM v_public OR v_kind IS DISTINCT FROM v_kinds[v_i] THEN
    RAISE EXCEPTION 'NEW_ACL_RELATION_SCOPE_DRIFT: %',v_relations[v_i];END IF;
   v_relation_oids:=pg_catalog.array_append(v_relation_oids,v_oid);
  END LOOP;
 END IF;
 FOR v_i IN 1..pg_catalog.cardinality(v_signatures) LOOP
  FOR v_grantee IN SELECT DISTINCT a.grantee FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   WHERE p.oid=v_function_oids[v_i] AND a.grantee<>p.proowner LOOP
   IF v_grantee=0 THEN v_role_sql:='PUBLIC';ELSE
    SELECT r.rolname INTO v_role_name FROM pg_catalog.pg_roles r WHERE r.oid=v_grantee;
    IF v_role_name IS NULL THEN RAISE EXCEPTION 'NEW_ACL_GRANTEE_DISAPPEARED';END IF;
    v_role_sql:=pg_catalog.format('%I',v_role_name);
   END IF;
   IF pg_catalog.to_regprocedure(v_signatures[v_i])::oid IS DISTINCT FROM v_function_oids[v_i]
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=v_function_oids[v_i] AND p.proowner=v_expected_owner AND p.pronamespace=v_public) THEN
    RAISE EXCEPTION 'NEW_ACL_FUNCTION_OID_DRIFT';END IF;
   EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s',v_signatures[v_i],v_role_sql);
  END LOOP;
 END LOOP;
 IF pg_catalog.cardinality(v_relations)>0 THEN
  FOR v_i IN 1..pg_catalog.cardinality(v_relations) LOOP
   FOR v_grantee IN SELECT DISTINCT a.grantee FROM pg_catalog.pg_class c
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a
    WHERE c.oid=v_relation_oids[v_i] AND a.grantee<>c.relowner LOOP
    IF v_grantee=0 THEN v_role_sql:='PUBLIC';ELSE
     SELECT r.rolname INTO v_role_name FROM pg_catalog.pg_roles r WHERE r.oid=v_grantee;
     IF v_role_name IS NULL THEN RAISE EXCEPTION 'NEW_ACL_GRANTEE_DISAPPEARED';END IF;
     v_role_sql:=pg_catalog.format('%I',v_role_name);
    END IF;
    IF pg_catalog.to_regclass(v_relations[v_i])::oid IS DISTINCT FROM v_relation_oids[v_i]
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=v_relation_oids[v_i] AND c.relowner=v_expected_owner AND c.relnamespace=v_public AND c.relkind::text=v_kinds[v_i]) THEN
     RAISE EXCEPTION 'NEW_ACL_RELATION_OID_DRIFT';END IF;
    -- Object names are static qualified inputs, and grantee names are catalog-quoted.
    v_object_sql:=CASE WHEN v_kinds[v_i]='S' THEN 'SEQUENCE' ELSE 'TABLE' END;
    EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON %s %s FROM %s',v_object_sql,v_relations[v_i],v_role_sql);
   END LOOP;
  END LOOP;
 END IF;
 -- Owners and every pinned identity must survive; no outside direct grants remain.
 FOR v_i IN 1..pg_catalog.cardinality(v_signatures) LOOP
  IF pg_catalog.to_regprocedure(v_signatures[v_i])::oid IS DISTINCT FROM v_function_oids[v_i]
   OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=v_function_oids[v_i] AND p.proowner=v_expected_owner AND p.pronamespace=v_public) THEN
   RAISE EXCEPTION 'NEW_ACL_FUNCTION_OID_DRIFT';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  WHERE p.oid=ANY(v_function_oids) AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'NEW_ACL_FUNCTION_RESET_DRIFT';END IF;
 IF pg_catalog.cardinality(v_relations)>0 THEN
  FOR v_i IN 1..pg_catalog.cardinality(v_relations) LOOP
   IF pg_catalog.to_regclass(v_relations[v_i])::oid IS DISTINCT FROM v_relation_oids[v_i]
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=v_relation_oids[v_i] AND c.relowner=v_expected_owner AND c.relnamespace=v_public AND c.relkind::text=v_kinds[v_i]) THEN
    RAISE EXCEPTION 'NEW_ACL_RELATION_OID_DRIFT';END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_class c CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a
   WHERE c.oid=ANY(v_relation_oids) AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'NEW_ACL_RELATION_RESET_DRIFT';END IF;
 END IF;
END;$new_acl_reset_current_capture$;

$current_capture_new_only_acl$;
 GRANT EXECUTE ON FUNCTION public.begin_platform_course_current_file_capture(uuid,text,text,uuid,uuid)TO authenticated;
 v_new_oid:=to_regprocedure('public.begin_platform_course_current_file_capture(uuid,text,text,uuid,uuid)');
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=v_new_oid AND p.proowner='postgres'::regrole AND p.prokind='f'
  AND p.pronamespace='public'::regnamespace AND l.lanname='plpgsql'AND p.prosecdef AND NOT p.proisstrict AND p.provolatile='v'
  AND format_type(p.prorettype,NULL)='jsonb'AND p.pronargs=5 AND p.pronargdefaults=0
  AND p.proargnames=ARRAY['p_marketplace_id','p_expected_edition_sha256','p_reference_kind','p_reference_id','p_request_id']::text[]
  AND p.proconfig=ARRAY['search_path=pg_catalog, public, pg_temp','lock_timeout=3s']::text[]
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='ca721e0338a15df1abf3be716c4cf7666c570b82e2029249a40ed13a8774eaab')THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_NEW_AFTERIMAGE_DRIFT';END IF;
 IF NOT has_function_privilege('authenticated',v_new_oid,'EXECUTE')OR has_function_privilege('anon',v_new_oid,'EXECUTE')OR has_function_privilege('service_role',v_new_oid,'EXECUTE')
 OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=v_new_oid
  AND a.grantee NOT IN(p.proowner,'authenticated'::regrole::oid))THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_NEW_ONLY_ACL_DRIFT';END IF;
 EXECUTE $current_capture_meta_after_query$SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(jsonb_build_object('catalog',to_jsonb(p),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner))::text,'UTF8')),'hex'),'' ORDER BY p.oid::regprocedure::text),''),'UTF8')),'hex'))FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.prokind='f' AND p.oid<>$1$current_capture_meta_after_query$INTO v_after_meta USING v_new_oid;
 IF v_after_meta IS DISTINCT FROM v_before_meta OR(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.prokind='f')<>1435 THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_ANY_EXISTING_FUNCTION_METADATA_CHANGED';END IF;
 EXECUTE v_query_schema INTO v_after_schema;
 IF v_after_schema IS DISTINCT FROM v_before_schema THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_ANY_EXISTING_RELATION_SCHEMA_CHANGED';END IF;
 FOREACH v_relation IN ARRAY ARRAY['public.platform_course_file_intents','public.platform_course_file_receipts','public.platform_course_file_binding_events']LOOP
  EXECUTE format('SELECT jsonb_build_object(''rows'',count(*),''sha256'',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex''),'''' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex'')),''''),''UTF8'')),''hex''))FROM %s t',v_relation::regclass)INTO v_digest;
  v_after_store:=v_after_store||jsonb_build_object(v_relation,v_digest);
 END LOOP;
 IF v_after_store IS DISTINCT FROM v_before_store THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_INSTALL_MUST_NOT_CREATE_OR_REWRITE_EVIDENCE';END IF;
 IF(SELECT count(*)FROM supabase_migrations.schema_migrations)<>650 OR(SELECT max(version)FROM supabase_migrations.schema_migrations)<>'20261029010000'
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261029013000')THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_INSTALL_HISTORY_MUST_REMAIN_650_UNTIL_EXTERNAL_REGISTRAR';END IF;
 EXECUTE $current_capture_full650_after$SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex'))FROM supabase_migrations.schema_migrations t$current_capture_full650_after$INTO v_after_history;
 EXECUTE $current_capture_defaults_after$SELECT coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'*'),'type',d.defaclobjtype,'acl',d.defaclacl::text)ORDER BY pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'*'),d.defaclobjtype),'[]'::jsonb)FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='public'OR d.defaclnamespace=0$current_capture_defaults_after$INTO v_after_defaults;
 EXECUTE $current_capture_events_after$SELECT coalesce(jsonb_agg(jsonb_build_object('name',e.evtname,'event',e.evtevent,'enabled',e.evtenabled,'tags',e.evttags,'owner',pg_get_userbyid(e.evtowner),'body_sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'definition_sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'))ORDER BY e.evtname),'[]'::jsonb)FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid$current_capture_events_after$INTO v_after_events;
 IF v_after_history IS DISTINCT FROM v_before_history OR v_after_defaults IS DISTINCT FROM v_before_defaults OR v_after_events IS DISTINCT FROM v_before_events THEN RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_HISTORY_DEFAULT_OR_CALLBACK_CHANGED';END IF;
 IF public.pcf_v1_enforcement_stamp()IS DISTINCT FROM'5d8e867d99288c8e1372c1f7e49c4ca07341ce2fb197b5aa2ff593529095aee6'OR public.pcf_v1_delivery_capabilities()IS DISTINCT FROM v_cap THEN
  RAISE EXCEPTION 'PCF_CURRENT_CAPTURE_ENFORCEMENT_OR_CAPABILITY_CHANGED';END IF;
END;$install_current_capture_20261029013000$;
COMMIT;
