-- Guarded canonical migration; actual application is recorded in the migration ledger.
-- Explicit user decision: current platform-owned source courses are free.
-- Exact13 prices:7marketplace listings +6courses. Hidden5 stay hidden.
-- No purchase RPC rewrite, no client/course-copy repricing, no historical order changes.
CREATE TEMP TABLE _free_raw(payload text NOT NULL) ON COMMIT DROP;
INSERT INTO _free_raw VALUES ($own_free_payload${"schemaVersion":1,"platformOrganizationId":"4ac2c05a-d8b5-4e72-ba31-f2c743091d95","listingPrices":[{"id":"1b2f8bf6-2cf0-5e98-8603-204848cffca3","course_id":"eee04ed8-712a-516b-b424-f4d3f2914789","before_md5":"4f77729d4136866eb3ccdf5143a68b68","source_before_md5":"7b4466aef63ed3934b4026d7fa973df3"},{"id":"327d4a8b-03b9-4698-8d50-967654d039ba","course_id":"5deec6c9-5948-49b5-9470-a0ac3fa1e3af","before_md5":"90265f88552e07431638bb1141360a12","source_before_md5":"de02739692de19ff0f7794157cb981a7"},{"id":"95d4ffdd-8db8-5d95-9e38-d7084989d94e","course_id":"26e65ccb-609f-5b3d-b59a-f280c9feae5b","before_md5":"9ec9adf903a9f4e534d079848bfdf1f6","source_before_md5":"94c7f8c63d484ab2af56addbe67f7253"},{"id":"99233251-f236-5880-82d6-ec41decd2c6e","course_id":"271f5a00-3c75-5bc4-95d3-0bfb571af830","before_md5":"fe752d0bb6c7cdd33a07e2bc7e07d3b4","source_before_md5":"914457051906a9b4cff6a0572ef27f28"},{"id":"a165fa41-88ce-5d0f-b388-ad726adb44d7","course_id":"c54775d6-4fa6-5074-9fe4-0ee0e43e3d20","before_md5":"2b499a6cfbe20dccaa667f6f0fb9dbe4","source_before_md5":"86cacfc998d8d169510825a2808bc70d"},{"id":"a360ad51-53d6-4860-affb-b4930d7b1e01","course_id":"42b85e3d-9807-4ebf-842f-351d33be631b","before_md5":"80b04ce0af78c66f67eb3bb4716121c1","source_before_md5":"65c536b9503aba7612b21dd63ab4dace"},{"id":"fc0ebbaf-3da8-53b0-a4e9-12b3fd5f1762","course_id":"8ae9739f-e87b-5397-94a5-86bfe99b0d77","before_md5":"5bb724bb4b309f570a600113d03b467b","source_before_md5":"8f4720aa11cc6f895a2ba8f1acda5508"}],"coursePrices":[{"id":"11a21919-7240-4fbd-a01b-66ddd167e322","before_md5":"14963844aec8a37e8e70d9826a4557c7"},{"id":"1c4d2669-30c8-4190-bf9e-c2473fa7f472","before_md5":"70c9325a729e42b95b97f4a1efa3634a"},{"id":"2a6504f3-6050-4746-9f86-a95e4d6e76a8","before_md5":"686cab4d380c31dcd31950fcff679876"},{"id":"535aba86-6863-4de6-823c-b8bad53fb3e0","before_md5":"13c97448c1cad4d850a97afbdd893551"},{"id":"728c5454-184e-456c-a0eb-7742729b7c4c","before_md5":"248842433e4ca1752c9420c7c8fe405d"},{"id":"9c2dbba5-f6b0-49b4-89cd-30a3799ffbd8","before_md5":"f4f3e70129066b4f9d45e8ba2f1d7cd3"}],"validationRestores":[{"id":"13c8341d-c0d0-4d98-aa7c-a0a2763030e4","course_id":"2a6504f3-6050-4746-9f86-a95e4d6e76a8","before_md5":"507cb8e5e5c25753771126a20a0dab3e","old_is_validated":true},{"id":"30e0878d-58a3-4f88-a7c6-f5d37df3c31b","course_id":"1c4d2669-30c8-4190-bf9e-c2473fa7f472","before_md5":"b40e66b9022e95c4c7afc61b042d63f5","old_is_validated":true},{"id":"8415ac13-9226-4736-857f-718b64026a98","course_id":"728c5454-184e-456c-a0eb-7742729b7c4c","before_md5":"8964844848fe4abf49366d82a80eae80","old_is_validated":true},{"id":"847a1426-311b-468d-9737-db570c537a22","course_id":"11a21919-7240-4fbd-a01b-66ddd167e322","before_md5":"94f3f7f6f87d21d59d381e225acc395f","old_is_validated":true},{"id":"d37e2e11-12ef-4cf0-88d2-f8f7b59b1584","course_id":"535aba86-6863-4de6-823c-b8bad53fb3e0","before_md5":"dc03b15eeb18f7e6d4b908b5552ee957","old_is_validated":true},{"id":"e3be3800-e67c-4933-8aca-ee6c0a3af9fd","course_id":"9c2dbba5-f6b0-49b4-89cd-30a3799ffbd8","before_md5":"6cd0a44a84456c89003a20cd2a7e3581","old_is_validated":true}]}$own_free_payload$);
CREATE TEMP TABLE _free_listing_expected ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset((SELECT payload::jsonb->'listingPrices' FROM _free_raw)) AS x(id uuid,course_id uuid,before_md5 text,source_before_md5 text);
CREATE TEMP TABLE _free_course_expected ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset((SELECT payload::jsonb->'coursePrices' FROM _free_raw)) AS x(id uuid,before_md5 text);
CREATE TEMP TABLE _free_validation_expected ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset((SELECT payload::jsonb->'validationRestores' FROM _free_raw)) AS x(id uuid,course_id uuid,before_md5 text,old_is_validated boolean);
CREATE TEMP TABLE _free_trigger_expected ON COMMIT DROP AS SELECT * FROM jsonb_to_recordset($own_free_triggers$[{"table_name":"marketplace_courses","name":"guard_marketplace_course_tenant","definition":"CREATE TRIGGER guard_marketplace_course_tenant BEFORE INSERT OR UPDATE OF course_id, organization_id ON public.marketplace_courses FOR EACH ROW EXECUTE FUNCTION guard_marketplace_course_tenant()","body_md5":"f559f88fcb32df0856617379690ff58b","enabled":"O"},{"table_name":"marketplace_courses","name":"guard_marketplace_course_validation","definition":"CREATE TRIGGER guard_marketplace_course_validation BEFORE INSERT OR UPDATE OF is_validated, course_id ON public.marketplace_courses FOR EACH ROW EXECUTE FUNCTION guard_marketplace_course_validation()","body_md5":"e146ae483c88344ecba6cc3aaf89277d","enabled":"O"},{"table_name":"marketplace_courses","name":"update_marketplace_courses_updated_at","definition":"CREATE TRIGGER update_marketplace_courses_updated_at BEFORE UPDATE ON public.marketplace_courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()","body_md5":"3210625d1c794f6db7b3c3defc5984dd","enabled":"O"},{"table_name":"courses","name":"aaa_uc013_source_observe","definition":"CREATE TRIGGER aaa_uc013_source_observe AFTER INSERT OR DELETE OR UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION uc_group_education_source_observe()","body_md5":"cd900fc5f511e5f1cce72e1132984ed2","enabled":"O"},{"table_name":"courses","name":"aaa_uc013_source_preflight","definition":"CREATE TRIGGER aaa_uc013_source_preflight BEFORE INSERT OR DELETE OR UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION uc_group_education_source_before()","body_md5":"6fe87318dc3a19f4124095e44adc4ce6","enabled":"O"},{"table_name":"courses","name":"audit_courses","definition":"CREATE TRIGGER audit_courses AFTER INSERT OR DELETE OR UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION auto_audit_log()","body_md5":"644c3c1683c37b13b25108607fca2421","enabled":"O"},{"table_name":"courses","name":"enforce_course_insert_limit","definition":"CREATE TRIGGER enforce_course_insert_limit BEFORE INSERT OR UPDATE OF organization_id, system_key ON public.courses FOR EACH ROW EXECUTE FUNCTION enforce_course_insert_limit()","body_md5":"22d2cf4e62324fbef5aaba41cfb9b443","enabled":"O"},{"table_name":"courses","name":"guard_course_system_key","definition":"CREATE TRIGGER guard_course_system_key BEFORE INSERT OR UPDATE OF system_key, organization_id ON public.courses FOR EACH ROW EXECUTE FUNCTION guard_course_system_key()","body_md5":"e39d1d9f581d9065694bf86e99d897fd","enabled":"O"},{"table_name":"courses","name":"invalidate_marketplace_course_on_course_update","definition":"CREATE TRIGGER invalidate_marketplace_course_on_course_update AFTER UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION invalidate_marketplace_course_validation()","body_md5":"b19482763a8cbda7b9df4be01a51ba9d","enabled":"O"},{"table_name":"courses","name":"trg_resolve_pending_enrollments","definition":"CREATE TRIGGER trg_resolve_pending_enrollments AFTER INSERT ON public.courses FOR EACH ROW EXECUTE FUNCTION resolve_pending_enrollments()","body_md5":"c86d3eb93eaa207820337e77afa3bce8","enabled":"O"},{"table_name":"courses","name":"trg_snapshot_course_landing","definition":"CREATE TRIGGER trg_snapshot_course_landing BEFORE UPDATE OF landing_content ON public.courses FOR EACH ROW EXECUTE FUNCTION snapshot_course_landing()","body_md5":"c3f175b24240e064762f5e359ebc5afc","enabled":"O"},{"table_name":"courses","name":"uc013_source_fold","definition":"CREATE CONSTRAINT TRIGGER uc013_source_fold AFTER INSERT OR DELETE OR UPDATE ON public.courses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION uc_group_education_source_after()","body_md5":"905572a7872607018081ea3d59c2b711","enabled":"O"},{"table_name":"courses","name":"uc013_source_truncate","definition":"CREATE TRIGGER uc013_source_truncate BEFORE TRUNCATE ON public.courses FOR EACH STATEMENT EXECUTE FUNCTION uc_group_education_source_truncate()","body_md5":"3f544fa385e6f9a7fb78dbf72fee467b","enabled":"O"},{"table_name":"courses","name":"uc_enrollment_delete_parent_before","definition":"CREATE TRIGGER uc_enrollment_delete_parent_before BEFORE DELETE ON public.courses FOR EACH ROW EXECUTE FUNCTION uc_capture_enrollment_delete_parent()","body_md5":"92daddb33e07e4f417504fd9d0c6e2c1","enabled":"O"},{"table_name":"courses","name":"update_courses_updated_at","definition":"CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()","body_md5":"3210625d1c794f6db7b3c3defc5984dd","enabled":"O"},{"table_name":"courses","name":"zzz_uc_enrollment_delete_parent_cleanup","definition":"CREATE TRIGGER zzz_uc_enrollment_delete_parent_cleanup AFTER DELETE ON public.courses FOR EACH ROW EXECUTE FUNCTION uc_cleanup_enrollment_delete_parent()","body_md5":"589f4dc53bb5bc97130736622025441a","enabled":"O"},{"table_name":"courses","name":"zzzz_csz_course_anchor_guard","definition":"CREATE TRIGGER zzzz_csz_course_anchor_guard BEFORE INSERT OR DELETE OR UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION csz_guard_course_anchor()","body_md5":"d1af520e0ab22028a45791f4cc2687a3","enabled":"O"},{"table_name":"courses","name":"zzzz_csz_protected_truncate_guard","definition":"CREATE TRIGGER zzzz_csz_protected_truncate_guard BEFORE TRUNCATE ON public.courses FOR EACH STATEMENT EXECUTE FUNCTION csz_guard_protected_truncate()","body_md5":"482a80e76e9fbd143c2fe367e7776683","enabled":"O"},{"table_name":"courses","name":"zzzz_paid_20260922_lineage_guard","definition":"CREATE TRIGGER zzzz_paid_20260922_lineage_guard BEFORE UPDATE OF id, organization_id, source_course_id, source_order_id ON public.courses FOR EACH ROW EXECUTE FUNCTION _paid_20260922_lineage_guard()","body_md5":"ee1dae96c6cec6eef1441e6e77d931d9","enabled":"O"},{"table_name":"courses","name":"zzzzz_uc013_parent_cleanup","definition":"CREATE TRIGGER zzzzz_uc013_parent_cleanup AFTER DELETE OR UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION uc_group_education_parent_cleanup()","body_md5":"e62e759ef88a0527f9841036f223745a","enabled":"O"},{"table_name":"courses","name":"zzzzzz_uc013_statement_end","definition":"CREATE TRIGGER zzzzzz_uc013_statement_end AFTER INSERT OR DELETE OR UPDATE ON public.courses FOR EACH STATEMENT EXECUTE FUNCTION uc_group_education_source_statement_end()","body_md5":"25668455ef6d3f4d5821022f5aa329cb","enabled":"O"}]$own_free_triggers$::jsonb) AS x(table_name text,name text,definition text,body_md5 text,enabled text);
DO $free_initial$
BEGIN
 IF current_user<>'postgres' OR auth.uid() IS NOT NULL OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'FREE_PRICE_EXPECTED_POSTGRES_NO_ACTOR_READ_COMMITTED'; END IF;
 IF current_setting('session_replication_role')<>'origin' THEN RAISE EXCEPTION 'FREE_PRICE_EXPECTED_ORIGIN_TRIGGERS';END IF;
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>639 OR (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20261026180000' THEN RAISE EXCEPTION 'FREE_PRICE_EXPECTED_LEDGER639_MAX1800';END IF;
 IF encode(sha256(convert_to((SELECT payload FROM _free_raw),'UTF8')),'hex')<>'e85d3cbbebd1f052ae1a43b2f977a442262d394a3c2f183a3c69901ccb309088' THEN RAISE EXCEPTION 'FREE_PRICE_PAYLOAD_CHANGED';END IF;
 IF (SELECT count(*) FROM _free_listing_expected)<>7 OR (SELECT count(DISTINCT id) FROM _free_listing_expected)<>7 OR (SELECT count(*) FROM _free_course_expected)<>6 OR (SELECT count(DISTINCT id) FROM _free_course_expected)<>6 OR (SELECT count(*) FROM _free_validation_expected)<>6 THEN RAISE EXCEPTION 'FREE_PRICE_EXPECTED_7_PLUS_6';END IF;
 IF md5(pg_get_functiondef('public.purchase_marketplace_course(uuid,uuid,text,integer,text)'::regprocedure))<>'06895622e2c957fd62777f9e5fca581b' THEN RAISE EXCEPTION 'FREE_PRICE_PURCHASE_CONTRACT_DRIFT';END IF;
 IF md5(pg_get_functiondef('public.uc_group_education_source_relevant(text,jsonb,jsonb)'::regprocedure))<>'471f1b04846b39c455b239381dd7e797' THEN RAISE EXCEPTION 'FREE_PRICE_UC013_RELEVANCE_DRIFT';END IF;
 IF to_regprocedure('public.guard_platform_owned_marketplace_zero_price()') IS NOT NULL OR to_regprocedure('public.guard_platform_owned_course_zero_price()') IS NOT NULL THEN RAISE EXCEPTION 'FREE_PRICE_NEW_GUARD_ALREADY_EXISTS';END IF;
 IF EXISTS(SELECT 1 FROM _free_trigger_expected e LEFT JOIN pg_trigger t ON t.tgrelid=('public.'||e.table_name)::regclass AND t.tgname=e.name WHERE t.oid IS NULL OR t.tgenabled::text IS DISTINCT FROM e.enabled OR pg_get_triggerdef(t.oid,false) IS DISTINCT FROM e.definition OR md5(pg_get_functiondef(t.tgfoid)) IS DISTINCT FROM e.body_md5) THEN RAISE EXCEPTION 'FREE_PRICE_EXISTING_TRIGGER_DRIFT';END IF;
END $free_initial$;
SELECT pg_advisory_xact_lock(hashtextextended('platform-owned-free-prices-20261026',0));
DO $free_lock$
BEGIN
 -- Same listing-before-source order as purchase RPC; no history table locks.
 PERFORM m.id FROM public.marketplace_courses m WHERE m.id IN(SELECT id FROM _free_listing_expected UNION SELECT id FROM _free_validation_expected) ORDER BY m.id FOR UPDATE OF m;
 PERFORM c.id FROM public.courses c WHERE c.id IN(SELECT course_id FROM _free_listing_expected UNION SELECT id FROM _free_course_expected) ORDER BY c.id FOR NO KEY UPDATE OF c;
 IF (SELECT count(*) FROM _free_listing_expected e JOIN public.marketplace_courses m ON m.id=e.id JOIN public.courses c ON c.id=m.course_id WHERE m.course_id=e.course_id AND c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid AND (m.organization_id=c.organization_id OR m.organization_id IS NULL) AND md5(to_jsonb(m)::text)=e.before_md5 AND md5(to_jsonb(c)::text)=e.source_before_md5)<>7 THEN RAISE EXCEPTION 'FREE_PRICE_LISTING7_OWNER_OR_PREIMAGE_CHANGED';END IF;
 IF (SELECT count(*) FROM _free_course_expected e JOIN public.courses c ON c.id=e.id WHERE c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid AND md5(to_jsonb(c)::text)=e.before_md5)<>6 THEN RAISE EXCEPTION 'FREE_PRICE_COURSE6_OWNER_OR_PREIMAGE_CHANGED';END IF;
 IF (SELECT count(*) FROM _free_validation_expected e JOIN public.marketplace_courses m ON m.id=e.id JOIN public.courses c ON c.id=m.course_id WHERE c.id=e.course_id AND c.id IN(SELECT id FROM _free_course_expected) AND c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid AND md5(to_jsonb(m)::text)=e.before_md5)<>6 THEN RAISE EXCEPTION 'FREE_PRICE_RELATED_VALIDATION_PREIMAGE_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM public.marketplace_courses m JOIN public.courses c ON c.id=m.course_id WHERE c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid AND (m.price_organization<>0 OR m.price_student<>0) AND NOT EXISTS(SELECT 1 FROM _free_listing_expected e WHERE e.id=m.id)) OR EXISTS(SELECT 1 FROM public.courses c WHERE c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid AND c.price<>0 AND NOT EXISTS(SELECT 1 FROM _free_course_expected e WHERE e.id=c.id)) THEN RAISE EXCEPTION 'FREE_PRICE_NEW_PRICED_OWN_SOURCE_OUTSIDE13';END IF;
END $free_lock$;
CREATE TEMP TABLE _free_old_courses ON COMMIT DROP AS SELECT id,to_jsonb(c) AS row_data FROM public.courses c;
CREATE TEMP TABLE _free_old_listings ON COMMIT DROP AS SELECT id,to_jsonb(m) AS row_data FROM public.marketplace_courses m;
CREATE TEMP TABLE _free_old_preservation ON COMMIT DROP AS SELECT 'organizations'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.organizations t
UNION ALL
SELECT 'balance_transactions'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.balance_transactions t
UNION ALL
SELECT 'marketplace_orders'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.marketplace_orders t
UNION ALL
SELECT 'lessons'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.lessons t
UNION ALL
SELECT 'test_questions'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.test_questions t
UNION ALL
SELECT 'test_attempts'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.test_attempts t
UNION ALL
SELECT 'test_attempt_sessions'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.test_attempt_sessions t
UNION ALL
SELECT 'test_attempt_start_requests'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.test_attempt_start_requests t
UNION ALL
SELECT 'lesson_progress'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.lesson_progress t
UNION ALL
SELECT 'enrollments'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.enrollments t
UNION ALL
SELECT 'course_landing_history'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.course_landing_history t
UNION ALL
SELECT 'marketplace_import_catalog'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.marketplace_import_catalog t
UNION ALL
SELECT 'uc_group_education_states'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.uc_group_education_states t
UNION ALL
SELECT 'uc_group_education_requests'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.uc_group_education_requests t
UNION ALL
SELECT 'audit_logs'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.audit_logs t;
CREATE TEMP TABLE _free_old_authority ON COMMIT DROP AS SELECT 'table:'||c.relname AS name,jsonb_build_object('owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity) AS data FROM pg_class c WHERE c.oid IN('public.courses'::regclass,'public.marketplace_courses'::regclass) UNION ALL SELECT 'policy:'||p.tablename||':'||p.policyname,to_jsonb(p) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename IN('courses','marketplace_courses') UNION ALL SELECT 'purchase',jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl::text,'config',p.proconfig,'secdef',p.prosecdef) FROM pg_proc p WHERE p.oid='public.purchase_marketplace_course(uuid,uuid,text,integer,text)'::regprocedure;
CREATE TEMP TABLE _free_old_ledger ON COMMIT DROP AS SELECT to_jsonb(v) AS row_data FROM supabase_migrations.schema_migrations v;

CREATE FUNCTION public.guard_platform_owned_marketplace_zero_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $guard$
DECLARE source_owner uuid;
BEGIN
 -- Lock the actual current source owner; copied-client lineage/title is irrelevant.
 SELECT c.organization_id INTO source_owner FROM public.courses c WHERE c.id=NEW.course_id FOR SHARE OF c;
 IF NOT FOUND THEN RAISE EXCEPTION 'MARKETPLACE_SOURCE_NOT_FOUND' USING ERRCODE='P0002';END IF;
 IF source_owner='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid THEN NEW.price_organization:=0;NEW.price_student:=0;END IF;
 RETURN NEW;
END $guard$;
CREATE FUNCTION public.guard_platform_owned_course_zero_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $guard$
BEGIN
 IF NEW.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid THEN
  -- A transfer must not silently reprice a listing while still customer-owned.
  IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id AND EXISTS(SELECT 1 FROM public.marketplace_courses m WHERE m.course_id=OLD.id AND (m.price_organization<>0 OR m.price_student<>0)) THEN RAISE EXCEPTION 'PLATFORM_TRANSFER_REQUIRES_ZERO_LISTING_PRICES' USING ERRCODE='23514';END IF;
  NEW.price:=0;
 END IF;
 RETURN NEW;
END $guard$;
-- Trigger functions are not public RPCs; remove only new-function default grants.
DO $free_new_function_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT p.oid::regprocedure::text AS identity,a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN('public.guard_platform_owned_marketplace_zero_price()'::regprocedure,'public.guard_platform_owned_course_zero_price()'::regprocedure) AND a.grantee<>p.proowner LOOP
  IF r.grantee=0 THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',r.identity);ELSE EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',r.identity,pg_get_userbyid(r.grantee));END IF;
 END LOOP;
END $free_new_function_acl$;
CREATE TRIGGER guard_platform_owned_marketplace_zero_price BEFORE INSERT OR UPDATE OF course_id,price_organization,price_student ON public.marketplace_courses FOR EACH ROW EXECUTE FUNCTION public.guard_platform_owned_marketplace_zero_price();
CREATE TRIGGER guard_platform_owned_course_zero_price BEFORE INSERT OR UPDATE OF organization_id,price ON public.courses FOR EACH ROW EXECUTE FUNCTION public.guard_platform_owned_course_zero_price();

DO $free_prices$
DECLARE n integer;
BEGIN
 UPDATE public.marketplace_courses m SET price_organization=0,price_student=0 FROM _free_listing_expected e,public.courses c WHERE m.id=e.id AND c.id=m.course_id AND c.id=e.course_id AND c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>7 THEN RAISE EXCEPTION 'FREE_PRICE_LISTING_COUNT';END IF;
 UPDATE public.courses c SET price=0 FROM _free_course_expected e WHERE c.id=e.id AND c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>6 THEN RAISE EXCEPTION 'FREE_PRICE_COURSE_COUNT';END IF;
 -- Existing course invalidation fires on any UPDATE. Restore only the previously
 -- captured bit on exactly these6; never validate a formerly unvalidated listing.
 UPDATE public.marketplace_courses m SET is_validated=e.old_is_validated FROM _free_validation_expected e WHERE m.id=e.id AND m.course_id=e.course_id AND m.is_validated IS DISTINCT FROM e.old_is_validated;
END $free_prices$;
SET CONSTRAINTS ALL IMMEDIATE;
CREATE TEMP TABLE _free_new_preservation ON COMMIT DROP AS SELECT 'organizations'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.organizations t
UNION ALL
SELECT 'balance_transactions'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.balance_transactions t
UNION ALL
SELECT 'marketplace_orders'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.marketplace_orders t
UNION ALL
SELECT 'lessons'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.lessons t
UNION ALL
SELECT 'test_questions'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.test_questions t
UNION ALL
SELECT 'test_attempts'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.test_attempts t
UNION ALL
SELECT 'test_attempt_sessions'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.test_attempt_sessions t
UNION ALL
SELECT 'test_attempt_start_requests'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.test_attempt_start_requests t
UNION ALL
SELECT 'lesson_progress'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.lesson_progress t
UNION ALL
SELECT 'enrollments'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.enrollments t
UNION ALL
SELECT 'course_landing_history'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.course_landing_history t
UNION ALL
SELECT 'marketplace_import_catalog'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.marketplace_import_catalog t
UNION ALL
SELECT 'uc_group_education_states'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.uc_group_education_states t
UNION ALL
SELECT 'uc_group_education_requests'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.uc_group_education_requests t
UNION ALL
SELECT 'audit_logs'::text AS object_name, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.audit_logs t;
CREATE TEMP TABLE _free_new_authority ON COMMIT DROP AS SELECT 'table:'||c.relname AS name,jsonb_build_object('owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity) AS data FROM pg_class c WHERE c.oid IN('public.courses'::regclass,'public.marketplace_courses'::regclass) UNION ALL SELECT 'policy:'||p.tablename||':'||p.policyname,to_jsonb(p) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename IN('courses','marketplace_courses') UNION ALL SELECT 'purchase',jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl::text,'config',p.proconfig,'secdef',p.prosecdef) FROM pg_proc p WHERE p.oid='public.purchase_marketplace_course(uuid,uuid,text,integer,text)'::regprocedure;
DO $free_preservation$
BEGIN
 IF EXISTS((SELECT * FROM _free_old_preservation EXCEPT SELECT * FROM _free_new_preservation) UNION ALL (SELECT * FROM _free_new_preservation EXCEPT SELECT * FROM _free_old_preservation)) THEN RAISE EXCEPTION 'FREE_PRICE_ORDERS_BALANCES_HISTORY_OR_MATERIALS_CHANGED';END IF;
 IF EXISTS((SELECT * FROM _free_old_authority EXCEPT SELECT * FROM _free_new_authority) UNION ALL (SELECT * FROM _free_new_authority EXCEPT SELECT * FROM _free_old_authority)) THEN RAISE EXCEPTION 'FREE_PRICE_EXISTING_AUTHORITY_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM _free_old_courses b FULL JOIN public.courses c ON c.id=b.id LEFT JOIN _free_course_expected e ON e.id=b.id WHERE b.id IS NULL OR c.id IS NULL OR CASE WHEN e.id IS NULL THEN b.row_data IS DISTINCT FROM to_jsonb(c) ELSE (b.row_data-'updated_at')||jsonb_build_object('price',0) IS DISTINCT FROM to_jsonb(c)-'updated_at' END) THEN RAISE EXCEPTION 'FREE_PRICE_COURSE_NONPRICE_OR_CLIENT_CHANGE';END IF;
 IF EXISTS(SELECT 1 FROM _free_old_listings b FULL JOIN public.marketplace_courses m ON m.id=b.id LEFT JOIN _free_listing_expected e ON e.id=b.id LEFT JOIN _free_validation_expected v ON v.id=b.id WHERE b.id IS NULL OR m.id IS NULL OR CASE WHEN e.id IS NOT NULL THEN (b.row_data-'updated_at')||jsonb_build_object('price_organization',0,'price_student',0) IS DISTINCT FROM to_jsonb(m)-'updated_at' WHEN v.id IS NOT NULL THEN b.row_data-'updated_at' IS DISTINCT FROM to_jsonb(m)-'updated_at' ELSE b.row_data IS DISTINCT FROM to_jsonb(m) END) THEN RAISE EXCEPTION 'FREE_PRICE_LISTING_FLAG_PRICE_OR_CLIENT_CHANGE';END IF;
 IF EXISTS(SELECT 1 FROM public.courses c WHERE c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid AND c.price IS DISTINCT FROM 0) OR EXISTS(SELECT 1 FROM public.marketplace_courses m JOIN public.courses c ON c.id=m.course_id WHERE c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid AND (m.price_organization<>0 OR m.price_student<>0)) THEN RAISE EXCEPTION 'FREE_PRICE_CURRENT_OWN_SOURCE_NOT_ZERO';END IF;
 IF EXISTS((SELECT row_data FROM _free_old_ledger EXCEPT SELECT to_jsonb(v) FROM supabase_migrations.schema_migrations v) UNION ALL (SELECT to_jsonb(v) FROM supabase_migrations.schema_migrations v EXCEPT SELECT row_data FROM _free_old_ledger)) THEN RAISE EXCEPTION 'FREE_PRICE_LEDGER_CHANGED_BEFORE_ROOT_WRAPPER';END IF;
 IF EXISTS(SELECT 1 FROM _free_trigger_expected e LEFT JOIN pg_trigger t ON t.tgrelid=('public.'||e.table_name)::regclass AND t.tgname=e.name WHERE t.oid IS NULL OR t.tgenabled::text IS DISTINCT FROM e.enabled OR pg_get_triggerdef(t.oid,false) IS DISTINCT FROM e.definition OR md5(pg_get_functiondef(t.tgfoid)) IS DISTINCT FROM e.body_md5) THEN RAISE EXCEPTION 'FREE_PRICE_EXISTING_TRIGGER_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN('public.guard_platform_owned_marketplace_zero_price()'::regprocedure,'public.guard_platform_owned_course_zero_price()'::regprocedure) AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'FREE_PRICE_NEW_TRIGGER_FUNCTION_PUBLIC_GRANT';END IF;
END $free_preservation$;
SELECT jsonb_build_object('status','PASS','priceRows',13,'marketplacePriceRows',7,'coursePriceRows',6,'previouslyHiddenFiveRemainHidden',true,'currentSourceOwnershipOnly',true,'clientPricesUntouched',true,'ordersBalancesSubscriptionsAndHistoryUntouched',true,'oldListingValidationRestoredOnly',true,'existingPurchaseRpcUnchanged',true,'newOrderCreated',false,'legalApprovalGranted',false,'executedByAuthor',false,'payloadSha256','e85d3cbbebd1f052ae1a43b2f977a442262d394a3c2f183a3c69901ccb309088') AS redacted_proof;
