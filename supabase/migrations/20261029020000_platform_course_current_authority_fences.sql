-- SOURCE CANDIDATE ONLY: bounded future current-rights packet, not applied or release accepted.
-- Requires independent review/native component execution and a paired Cloud rehearsal/history registrar.
BEGIN;
SET LOCAL statement_timeout='40s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=pg_catalog,public,pg_temp;
DO $pcc_rights_preflight$
DECLARE e jsonb;p_row pg_proc;v_oid oid;v_replaced oid[]:='{}';v_before jsonb;
 v_expected constant jsonb:=$old_rights_preimages$[{"signature":"public.pcc_v1_authorized_reference(uuid,text,uuid,text,text)","sha256":"aaf68700afb154dc2f4249ac7b4a1bfa97ac8facb154bff64ead62f5b7a13cc3","authenticated":false},{"signature":"public.read_course_exact_file_delivery_mode(uuid,text)","sha256":"f8b793bbc836893d29bb1657487aade3ccaec09dc6f9c72897c6163d98c91f1e","authenticated":true},{"signature":"public.pcc_v1_copy_binding_payload(uuid,jsonb)","sha256":"aaadad497dbffab5af1282d522b09876fd2d70fe7ea650bbe756f2454c4f829a","authenticated":false}]$old_rights_preimages$::jsonb;
BEGIN
 IF current_user<>'postgres'OR session_user<>'postgres'OR current_setting('transaction_isolation')<>'read committed'
 OR current_setting('session_replication_role')<>'origin'OR current_setting('standard_conforming_strings')<>'on'THEN
  RAISE EXCEPTION 'PCC_RIGHTS_INSTALLER_CONTEXT_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(ARRAY['pcc_v2_current_rights_keys','pcc_v2_asset_authority_before','pcc_v2_source_resource_fences','pcc_v2_enrollment_authority_before','pcc_v2_copy_course_fences']::text[]))
 OR EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND t.tgname=ANY(ARRAY['pcc_current_asset_authority_fence','pcc_current_withdrawal_authority_fence','pcc_current_removal_authority_fence']::text[]))THEN
  RAISE EXCEPTION 'PCC_RIGHTS_NEW_NAMES_REQUIRED_NO_REPLAY';END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version='20261028140000'AND m.name='platform_course_copy_file_delivery'
  AND cardinality(m.statements)=1 AND octet_length(m.statements[1])=72811
  AND encode(sha256(convert_to(m.statements[1],'UTF8')),'hex')='8d5e38443bad697c5da1735ccefc681fa052b275f57ff437515e4ed046587e01')THEN
  RAISE EXCEPTION 'PCC_RIGHTS_EXACT_INSTALLED650_COPY_SOURCE_REQUIRED';END IF;
 IF public.pcf_v1_enforcement_stamp()IS DISTINCT FROM'5d8e867d99288c8e1372c1f7e49c4ca07341ce2fb197b5aa2ff593529095aee6'
 OR public.pcf_v1_delivery_capabilities()->'frozen_reader_implemented'IS DISTINCT FROM'false'::jsonb
 OR public.pcf_v1_delivery_capabilities()->'frontend_consumers_accepted'IS DISTINCT FROM'false'::jsonb
 OR public.pcf_v1_delivery_capabilities()->'copied_centre_exact_binding_supported'IS DISTINCT FROM'false'::jsonb THEN
  RAISE EXCEPTION 'PCC_RIGHTS_ACCEPTED_PCF_BASELINE_AND_CAPFALSE_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='public.account_deletion_subject_write_guard()'::regprocedure
  AND p.proowner='postgres'::regrole AND p.prosecdef AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='82a48095b102fb498d2bcbb223d21440a190d3216a1b999d790257bba46adfd7')
 OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='public.uc_enrollment_is_withdrawn(uuid)'::regprocedure
  AND p.proowner='postgres'::regrole AND p.prosecdef AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='51d86c8fe394fff258b78347eea25d75cf460c2f9e0e38a4f2f0a60c5891fba1')THEN
  RAISE EXCEPTION 'PCC_RIGHTS_EXISTING_SUBJECT_AND_WITHDRAWAL_CONTRACT_DRIFT';END IF;
 -- Reuse existing42007 for enrollment INSERT/UPDATE, including OLD+NEW subjects.
 IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.enrollments'::regclass
  AND t.tgname='account_deletion_subject_fence'AND t.tgenabled='O'AND NOT t.tgisinternal AND t.tgtype=23
  AND t.tgfoid='public.account_deletion_subject_write_guard()'::regprocedure
  AND encode(t.tgargs,'hex')='757365725f696400')THEN RAISE EXCEPTION 'PCC_RIGHTS_EXISTING_ENROLLMENT42007_BINDING_REQUIRED';END IF;
 -- Existing42007 must exclude the new staff row that changes the owner's NOT EXISTS fallback.
 IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.org_staff'::regclass
  AND t.tgname='account_deletion_subject_fence'AND t.tgenabled='O'AND NOT t.tgisinternal AND t.tgtype=23
  AND t.tgfoid='public.account_deletion_subject_write_guard()'::regprocedure
  AND encode(t.tgargs,'hex')='757365725f696400')THEN RAISE EXCEPTION 'PCC_RIGHTS_EXISTING_ORG_STAFF42007_BINDING_REQUIRED';END IF;
 -- Four actual subject-writer bindings confirmed by 00/00B metadata.
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['enrollments','lesson_progress','org_staff','user_roles']::text[])AS expected(table_name)
  WHERE NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||expected.table_name)
   AND t.tgname='account_deletion_subject_fence'AND t.tgenabled='O'AND NOT t.tgisinternal AND t.tgtype=23
   AND t.tgfoid='public.account_deletion_subject_write_guard()'::regprocedure
   AND encode(t.tgargs,'hex')='757365725f696400'AND t.tgqual IS NULL))THEN
  RAISE EXCEPTION 'PCC_RIGHTS_ACTUAL_FOUR_SUBJECT42007_BINDINGS_REQUIRED';END IF;
 -- The locator ancestry cannot gain a previously missing parent behind the read.
 IF EXISTS(SELECT 1 FROM(VALUES('courses_source_course_id_fkey','FOREIGN KEY (source_course_id) REFERENCES courses(id)'),
 ('courses_source_order_id_fkey','FOREIGN KEY (source_order_id) REFERENCES marketplace_orders(id)'))expected(name,definition)
 WHERE NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.courses'::regclass AND c.conname=expected.name
  AND c.contype='f'AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred AND pg_get_constraintdef(c.oid)=expected.definition))THEN
  RAISE EXCEPTION 'PCC_RIGHTS_EXISTING_IMMEDIATE_COURSE_LINEAGE_FKS_REQUIRED';END IF;
 -- Preserve the existing append-only removal history barrier; no UPDATE/DELETE bypass.
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.uc_assignment_removal_immutable()')
  AND p.proowner='postgres'::regrole AND NOT p.prosecdef
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='1b9e39c3a0820be6cd297be17cfff8022e6bb46a6f4206462dc950094337e2a3')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.uc_course_assignment_removal_events'::regclass
  AND t.tgname='uc_assignment_removal_immutable'AND t.tgenabled='O'AND NOT t.tgisinternal AND t.tgtype=27
  AND t.tgfoid='public.uc_assignment_removal_immutable()'::regprocedure AND t.tgnargs=0 AND t.tgqual IS NULL)THEN
  RAISE EXCEPTION 'PCC_RIGHTS_EXISTING_REMOVAL_IMMUTABILITY_REQUIRED';END IF;
 -- Never install a body that assumes columns absent from the actual source schema.
 IF EXISTS(SELECT 1 FROM(VALUES
 ('enrollments','id'),('enrollments','user_id'),('enrollments','course_id'),
 ('lesson_progress','user_id'),('lesson_progress','lesson_id'),('lesson_progress','completed'),
 ('uc_enrollment_withdrawal_states','enrollment_id'),('uc_enrollment_withdrawal_states','redacted'),
 ('uc_course_assignment_removal_events','enrollment_id'),('uc_course_assignment_removal_events','revision'),('uc_course_assignment_removal_events','state'),
 ('org_staff','user_id'),('org_staff','organization_id'),('user_roles','user_id'),('user_roles','role'))required(table_name,column_name)
 WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'AND c.relname=required.table_name AND c.relkind IN('r','p')AND a.attname=required.column_name AND a.attnum>0 AND NOT a.attisdropped))THEN
  RAISE EXCEPTION 'PCC_RIGHTS_ACTUAL_SOURCE_COLUMNS_REQUIRED';END IF;
 -- Current authority predicates remain the exact reviewed bodies; do not adapt to drift.
 FOR e IN SELECT value FROM jsonb_array_elements($rights_dependency_bodies$[{"signature":"public.can_access_organization(uuid,text)","sha256":"6fe776ab798d2925d18996adf0301c021384416200083bc83874c64547517210","owner":"postgres","security_definer":true,"configuration":["search_path=public"]},{"signature":"public.paid_umk_20260922_is_asset(uuid)","sha256":"4bcd30d79d89d36b11d308a265fe4d4d11f329edd57b93d219f0b55aefd35c48","owner":"postgres","security_definer":true,"configuration":["search_path=public, pg_temp"]},{"signature":"public.paid_umk_20260922_valid_grant(uuid,uuid)","sha256":"9d7ca0c9e31a1b7595ca902127302d3b43f5c7ed361cf5f2ec10f688cef88d71","owner":"postgres","security_definer":true,"configuration":["search_path=public, pg_temp"]},{"signature":"public.paid_umk_20260922_can_read_document(uuid)","sha256":"73c95c35989b67a986c86d30316921f5a8f44cf5934063138b1d4a4868d86d2a","owner":"postgres","security_definer":true,"configuration":["search_path=public, pg_temp"]},{"signature":"public.paid_umk_20260922_can_read_assignment(uuid,uuid,boolean)","sha256":"f5dcdbbfd7d98ab78f0818de83634d7a5179461a3ec33c65350c5d6756f6fd86","owner":"postgres","security_definer":true,"configuration":["search_path=public, pg_temp"]},{"signature":"public._paid_20260922_course_scope(uuid)","sha256":"b7eab04edeaee4240b0b0e7e8dc6496cf9484dda738b2d0a566eb84cc3588fb7","owner":"postgres","security_definer":true,"configuration":["search_path=pg_catalog, public","row_security=off"]},{"signature":"public.get_org_staff_permissions(uuid,uuid)","sha256":"e4ba83b86a3c6c56b2b88a1cac7cfb82d28e6e7c1c6674bc7be7528b5bec4ed1","owner":"postgres","security_definer":true,"configuration":["search_path=public"]},{"signature":"public.has_org_staff_permission(uuid,uuid,text)","sha256":"bade109b70ccc197d67c42cfb24b587d23a20677274bac6bc1a540eea605241b","owner":"postgres","security_definer":true,"configuration":["search_path=public"]},{"signature":"public.is_org_owner(uuid,uuid)","sha256":"22b61a365fd98202d8e284a821587c55a45f14b7d5e2646809dee0be4506539d","owner":"postgres","security_definer":true,"configuration":["search_path=public"]},{"signature":"public.org_role_default_permissions(text)","sha256":"fc3f6e836d591292477bed632c702d5c3b71a7e690ed912e82cab4ca66a7ae05","owner":"postgres","security_definer":false,"configuration":["search_path=public"]},{"signature":"public.normalize_org_staff_permission(text)","sha256":"1e99bd01dcc41215a6e56e74d2081e084d81c8cba98a0ea95321322b6e48ce7b","owner":"postgres","security_definer":false,"configuration":["search_path=public"]}]$rights_dependency_bodies$::jsonb)LOOP
  v_oid:=to_regprocedure(e->>'signature');SELECT * INTO p_row FROM pg_proc WHERE oid=v_oid;
  IF v_oid IS NULL OR p_row.proowner IS DISTINCT FROM to_regrole(e->>'owner')
  OR p_row.prosecdef IS DISTINCT FROM(e->>'security_definer')::boolean
  OR to_jsonb(p_row.proconfig)IS DISTINCT FROM e->'configuration'
  OR encode(sha256(convert_to(p_row.prosrc,'UTF8')),'hex')IS DISTINCT FROM e->>'sha256'THEN
   RAISE EXCEPTION 'PCC_RIGHTS_CURRENT_DEPENDENCY_DRIFT: %',e->>'signature';END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(v_expected)LOOP
  v_oid:=to_regprocedure(e->>'signature');SELECT * INTO p_row FROM pg_proc WHERE oid=v_oid;
  IF v_oid IS NULL OR p_row.proowner<>'postgres'::regrole OR NOT p_row.prosecdef OR p_row.prokind<>'f'
   OR p_row.provolatile<>'v'OR p_row.proisstrict OR p_row.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
   OR encode(sha256(convert_to(p_row.prosrc,'UTF8')),'hex')<>e->>'sha256'THEN RAISE EXCEPTION 'PCC_RIGHTS_EXACT_R7_BEFOREIMAGE_REQUIRED: %',e->>'signature';END IF;
  IF has_function_privilege('anon',v_oid,'EXECUTE')OR has_function_privilege('service_role',v_oid,'EXECUTE')
   OR has_function_privilege('authenticated',v_oid,'EXECUTE')IS DISTINCT FROM(e->>'authenticated')::boolean
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p_row.proacl,acldefault('f',p_row.proowner)))a
    WHERE a.grantee<>p_row.proowner AND(NOT(e->>'authenticated')::boolean OR a.grantee<>'authenticated'::regrole::oid OR a.is_grantable))THEN
   RAISE EXCEPTION 'PCC_RIGHTS_R7_BEFOREIMAGE_ACL_DRIFT';END IF;
  v_replaced:=array_append(v_replaced,v_oid);
 END LOOP;
 IF to_regclass('pg_temp.pcc_rights_source_guard_20261029')IS NOT NULL THEN RAISE EXCEPTION 'PCC_RIGHTS_FRESH_TEMP_GUARD_REQUIRED';END IF;
 CREATE TEMP TABLE pcc_rights_source_guard_20261029(backend_pid integer,transaction_id bigint,replaced_oids oid[],old_catalog jsonb,other_functions jsonb,capabilities jsonb)ON COMMIT DROP;
 EXECUTE $other_rights_functions$SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(jsonb_build_object('catalog',to_jsonb(p),'definition',pg_get_functiondef(p.oid))::text,'UTF8')),'hex'),'' ORDER BY p.oid::regprocedure::text),''),'UTF8')),'hex'))FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.prokind='f'AND NOT(p.oid=ANY($1))$other_rights_functions$INTO v_before USING v_replaced;
 INSERT INTO pg_temp.pcc_rights_source_guard_20261029 VALUES(pg_backend_pid(),txid_current(),v_replaced,
  (SELECT jsonb_object_agg(p.oid::text,to_jsonb(p)-'prosrc')FROM pg_proc p WHERE p.oid=ANY(v_replaced)),v_before,public.pcf_v1_delivery_capabilities());
END;$pcc_rights_preflight$;


-- SOURCE DRAFT ONLY. Not a standalone installer and not executed.
-- New private helpers; final paired installer must strip inherited non-owner ACLs.
-- Public response contracts, stored bindings, receipts and source versions stay unchanged.

CREATE FUNCTION public.pcc_v2_current_rights_keys(p_namespace text,p_ids uuid[],p_exclusive boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $rights_keys$
DECLARE v_id uuid;v_key bigint;v_locked boolean;
BEGIN
 IF p_namespace IS NULL OR p_namespace NOT IN('asset','enrollment')OR p_exclusive IS NULL THEN
  RAISE EXCEPTION 'PCC_CURRENT_RIGHTS_KEY_SCOPE_REQUIRED' USING ERRCODE='22023';END IF;
 -- A fixed namespace and sorted row identities, not a whole-platform mutex.
 -- Readers of the same source remain compatible; only the matching writer excludes them.
 FOR v_id IN SELECT DISTINCT x FROM unnest(coalesce(p_ids,'{}'::uuid[]))x WHERE x IS NOT NULL ORDER BY x LOOP
  v_key:=hashtextextended('sintagma.pcc.v2.current-rights.'||p_namespace||'.'||v_id::text,282906);
  IF p_exclusive THEN v_locked:=pg_try_advisory_xact_lock(v_key);
  ELSE v_locked:=pg_try_advisory_xact_lock_shared(v_key);END IF;
  IF NOT v_locked THEN RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 END LOOP;
END;$rights_keys$;

CREATE FUNCTION public.pcc_v2_asset_authority_before()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $asset_authority$
DECLARE v_ids uuid[];
BEGIN
 IF TG_TABLE_SCHEMA IS DISTINCT FROM'public'OR TG_TABLE_NAME IS DISTINCT FROM'paid_umk_20260922_assets'
 OR TG_LEVEL IS DISTINCT FROM'ROW'OR TG_OP NOT IN('INSERT','UPDATE','DELETE')THEN
  RAISE EXCEPTION 'PCC_CURRENT_ASSET_TRIGGER_SCOPE_REQUIRED';END IF;
 IF TG_OP='INSERT'THEN v_ids:=ARRAY[NEW.library_document_id];
 ELSIF TG_OP='DELETE'THEN v_ids:=ARRAY[OLD.library_document_id];
 ELSE v_ids:=ARRAY[OLD.library_document_id,NEW.library_document_id];END IF;
 -- In particular, INSERT participates when the reader previously found zero asset rows.
 -- Do not replace or change existing paid-UMK delivery/protection helpers or RLS.
 PERFORM public.pcc_v2_current_rights_keys('asset',v_ids,true);
 IF TG_OP='DELETE'THEN RETURN OLD;END IF;
 RETURN NEW;
END;$asset_authority$;

CREATE FUNCTION public.pcc_v2_source_resource_fences(p_library uuid,p_org_version uuid,p_order uuid,p_buyer_course uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $copy_source_fences$
DECLARE v_document uuid;
BEGIN
 -- The sole product caller derives all four IDs from its immutable b/h/r tuple,
 -- before its current authorization predicates. Ordinary roles cannot call this.
 -- Keep this narrow metadata-only component separate from loading 8MiB receipt bytes.
 IF p_library IS NULL AND p_org_version IS NULL AND p_order IS NULL THEN RETURN;END IF;
 -- Plain files also depend on the current acquisition order. Take this fence
 -- before the caller checks paid/completed, not only inside the library branch.
 PERFORM 1 FROM public.marketplace_orders o WHERE o.id=p_order FOR SHARE OF o NOWAIT;
 IF p_library IS NOT NULL THEN
  PERFORM public.pcc_v2_current_rights_keys('asset',ARRAY[p_library],false);
  PERFORM 1 FROM public.library_documents ld WHERE ld.id=p_library FOR SHARE OF ld NOWAIT;
  PERFORM 1 FROM public.paid_umk_20260922_assets a WHERE a.library_document_id=p_library ORDER BY a.id FOR SHARE OF a NOWAIT;
  PERFORM 1 FROM public.paid_umk_20260922_grants g
   WHERE g.buyer_course_id=p_buyer_course AND g.asset_id IN(
    SELECT a.id FROM public.paid_umk_20260922_assets a WHERE a.library_document_id=p_library)
   ORDER BY g.buyer_course_id,g.asset_id FOR SHARE OF g NOWAIT;
  PERFORM 1 FROM public.marketplace_orders o WHERE o.id IN(
   SELECT g.order_id FROM public.paid_umk_20260922_grants g JOIN public.paid_umk_20260922_assets a ON a.id=g.asset_id
   WHERE g.buyer_course_id=p_buyer_course AND a.library_document_id=p_library)
   ORDER BY o.id FOR SHARE OF o NOWAIT;
 END IF;
 -- Freeze the exact stored source version. A newer current_version_id is never selected.
 IF p_org_version IS NOT NULL THEN
  SELECT v.document_id INTO v_document FROM public.org_document_versions v WHERE v.id=p_org_version FOR SHARE OF v NOWAIT;
  IF v_document IS NOT NULL THEN
   PERFORM 1 FROM public.org_documents d WHERE d.id=v_document FOR SHARE OF d NOWAIT;
  END IF;
 END IF;
 -- Current predicates are evaluated by the unchanged payload checks AFTER these locks.
 -- Missing/deleted/archived/foreign rows still deny. Sealed bytes never follow Storage changes.
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';
END;$copy_source_fences$;

-- SOURCE DRAFT ONLY. Do not install before reviewing the four-table metadata.
-- Existing account42007 still serializes normal enrollment/progress subject writes.
-- The separate enrollment-ID key is only for absence-sensitive withdrawal/history predicates.

CREATE FUNCTION public.pcc_v2_enrollment_authority_before()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $enrollment_authority$
DECLARE v_ids uuid[];
BEGIN
 IF TG_TABLE_SCHEMA IS DISTINCT FROM'public'
 OR TG_TABLE_NAME NOT IN('uc_enrollment_withdrawal_states','uc_course_assignment_removal_events')
 OR TG_LEVEL IS DISTINCT FROM'ROW'OR TG_OP NOT IN('INSERT','UPDATE','DELETE')THEN
  RAISE EXCEPTION 'PCC_CURRENT_ENROLLMENT_TRIGGER_SCOPE_REQUIRED';END IF;
 IF TG_OP='INSERT'THEN v_ids:=ARRAY[NEW.enrollment_id];
 ELSIF TG_OP='DELETE'THEN v_ids:=ARRAY[OLD.enrollment_id];
 ELSE v_ids:=ARRAY[OLD.enrollment_id,NEW.enrollment_id];END IF;
 -- Immutable withdrawal/removal rows may intentionally outlive an enrollment;
 -- no new foreign key, history rewrite or inferred user_id is introduced here.
 PERFORM public.pcc_v2_current_rights_keys('enrollment',v_ids,true);
 IF TG_OP='DELETE'THEN RETURN OLD;END IF;
 RETURN NEW;
END;$enrollment_authority$;

CREATE FUNCTION public.pcc_v2_copy_course_fences(p_course uuid,p_access_mode text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $copy_course_fences$
DECLARE v_actor uuid;v_enrollments uuid[];v_fresh_enrollments uuid[];v_before jsonb;v_after jsonb;
 v_ancestry_query constant text:=$ancestry_query$WITH RECURSIVE ancestry AS(
  SELECT c.id,c.organization_id,c.source_course_id,c.source_order_id FROM public.courses c WHERE c.id=$1
  UNION
  SELECT p.id,p.organization_id,p.source_course_id,p.source_order_id FROM public.courses p JOIN ancestry a ON p.id=a.source_course_id
 )SELECT coalesce(jsonb_agg(to_jsonb(a)ORDER BY a.id),'[]'::jsonb)FROM ancestry a$ancestry_query$;
BEGIN
 -- Header-less legacy/client routes retain the exact existing authorization contract.
 IF NOT EXISTS(SELECT 1 FROM public.platform_course_copy_file_cohorts WHERE course_id=p_course)THEN RETURN;END IF;
 IF p_access_mode IS NULL OR p_access_mode NOT IN('learner','staff_preview')THEN
  RAISE EXCEPTION 'PCC_SELECTION_REQUIRED' USING ERRCODE='22023';END IF;
 v_actor:=public.pcc_v1_actor();
 -- Current course/library permissions also depend on the same actor's roles,
 -- profile and staff row. Existing42007 excludes a new staff row in the
 -- NOT EXISTS owner fallback; the installer must verify that real binding.
 PERFORM 1 FROM auth.users u WHERE u.id=v_actor FOR SHARE OF u NOWAIT;
 PERFORM 1 FROM public.profiles p WHERE p.user_id=v_actor FOR SHARE OF p NOWAIT;
 PERFORM 1 FROM public.user_roles ur WHERE ur.user_id=v_actor ORDER BY ur.role FOR SHARE OF ur NOWAIT;
 PERFORM 1 FROM public.org_staff os WHERE os.user_id=v_actor ORDER BY os.organization_id FOR SHARE OF os NOWAIT;
 -- Both existing callers hold the selected course row first. The recursive read
 -- is only a locator; repeat it after locking each current ancestry/order/listing row.
 EXECUTE v_ancestry_query INTO v_before USING p_course;
 PERFORM 1 FROM public.courses c WHERE c.id IN(
  SELECT x.id FROM jsonb_to_recordset(v_before)x(id uuid,organization_id uuid,source_course_id uuid,source_order_id uuid))
  ORDER BY c.id FOR SHARE OF c NOWAIT;
 PERFORM 1 FROM public.marketplace_orders o WHERE o.id IN(
  SELECT x.source_order_id FROM jsonb_to_recordset(v_before)x(id uuid,organization_id uuid,source_course_id uuid,source_order_id uuid))
  ORDER BY o.id FOR SHARE OF o NOWAIT;
 PERFORM 1 FROM public.marketplace_courses m WHERE m.id IN(
  SELECT o.marketplace_course_id FROM public.marketplace_orders o WHERE o.id IN(
   SELECT x.source_order_id FROM jsonb_to_recordset(v_before)x(id uuid,organization_id uuid,source_course_id uuid,source_order_id uuid)))
  ORDER BY m.id FOR SHARE OF m NOWAIT;
 EXECUTE v_ancestry_query INTO v_after USING p_course;
 IF v_after IS DISTINCT FROM v_before THEN RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 IF p_access_mode='learner'THEN
  SELECT coalesce(array_agg(e.id ORDER BY e.id),'{}'::uuid[])INTO v_enrollments
   FROM public.enrollments e WHERE e.user_id=v_actor AND e.course_id=p_course;
  PERFORM public.pcc_v2_current_rights_keys('enrollment',v_enrollments,false);
  PERFORM 1 FROM public.enrollments e WHERE e.id=ANY(v_enrollments)AND e.user_id=v_actor AND e.course_id=p_course
   ORDER BY e.id FOR SHARE OF e NOWAIT;
  SELECT coalesce(array_agg(e.id ORDER BY e.id),'{}'::uuid[])INTO v_fresh_enrollments
   FROM public.enrollments e WHERE e.user_id=v_actor AND e.course_id=p_course;
  IF v_fresh_enrollments IS DISTINCT FROM v_enrollments THEN RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END IF;
  -- Lock existing rows even if redacted/cancelled/complete=false: changing one
  -- of those fields must not revoke a permission checked just before byte return.
  PERFORM 1 FROM public.uc_enrollment_withdrawal_states s WHERE s.enrollment_id=ANY(v_enrollments)
   ORDER BY s.enrollment_id FOR SHARE OF s NOWAIT;
  PERFORM 1 FROM public.uc_course_assignment_removal_events e WHERE e.enrollment_id=ANY(v_enrollments)
   ORDER BY e.enrollment_id,e.revision FOR SHARE OF e NOWAIT;
  PERFORM 1 FROM public.lesson_progress p JOIN public.lessons l ON l.id=p.lesson_id
   WHERE p.user_id=v_actor AND l.course_id=p_course ORDER BY p.lesson_id FOR SHARE OF p NOWAIT;
 END IF;
 -- Preserve ordinary helper semantics, including completed enrollment despite
 -- elapsed expires_at and the staff-preview path without learner enrollment.
 PERFORM public.pcc_v1_actor();
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';
END;$copy_course_fences$;

-- SOURCE PROPOSAL: strip inherited ACL entries only from the fixed objects created above.
-- Existing expected GRANT statements and strict postflight guards remain after this block.
DO $new_acl_reset_pcc_current_rights$
DECLARE
 v_signatures text[]:=ARRAY['public.pcc_v2_current_rights_keys(text,uuid[],boolean)','public.pcc_v2_asset_authority_before()','public.pcc_v2_source_resource_fences(uuid,uuid,uuid,uuid)','public.pcc_v2_enrollment_authority_before()','public.pcc_v2_copy_course_fences(uuid,text)']::text[];
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
END;$new_acl_reset_pcc_current_rights$;


CREATE OR REPLACE FUNCTION public.pcc_v1_authorized_reference(p_course uuid,p_kind text,p_reference uuid,p_access_mode text,p_purpose text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_actor uuid;v_course public.courses;v_row jsonb;v_lesson public.lessons;v_module uuid;v_visible boolean;v_download boolean;v_first_lesson uuid;v_parent_lesson uuid;v_library_only boolean:=false;
BEGIN
 v_actor:=public.pcc_v1_actor();
 IF p_course IS NULL OR p_reference IS NULL OR p_kind NOT IN('course_document','lesson_attachment')
 OR p_access_mode NOT IN('learner','staff_preview') OR p_purpose NOT IN('preview','download')
 OR p_kind IS NULL OR p_access_mode IS NULL OR p_purpose IS NULL THEN RAISE EXCEPTION 'PCC_SELECTION_REQUIRED' USING ERRCODE='22023';END IF;
 BEGIN SELECT * INTO v_course FROM public.courses WHERE id=p_course FOR SHARE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END;
 IF v_course.id IS NULL THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
 PERFORM public.pcc_v2_copy_course_fences(p_course,p_access_mode);
 PERFORM public.pcc_v1_actor();
 IF p_access_mode='staff_preview' THEN
  IF NOT coalesce(public.can_access_course(p_course,'courses.read'),false) OR NOT coalesce(public._paid_20260922_course_read(p_course,false),false) THEN
   RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
 ELSE
  IF NOT coalesce(public.can_access_course_as_learner(p_course),false)
   OR NOT coalesce(public._paid_20260922_course_read(p_course,true),false) THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
  IF v_course.is_published IS NOT TRUE THEN
   -- Preserve the existing enrolled electronic-library-only route; this does not grant draft lessons/plain files.
   v_library_only:=coalesce((public.get_course_electronic_library_shell(p_course)->>'library_only')::boolean,false);
   IF NOT v_library_only OR p_kind<>'course_document' THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
  END IF;
 END IF;
 -- Course remains the first row fence. Lock exact mutable inputs before taking authority snapshots.
 BEGIN
  IF p_kind='course_document' THEN
   PERFORM 1 FROM public.course_documents d WHERE d.id=p_reference AND d.course_id=p_course FOR SHARE OF d NOWAIT;
   IF NOT FOUND THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
  ELSE
   -- This first read is a locator only; no flags, linkage or row hash from it can authorize bytes.
   SELECT a.lesson_id INTO v_parent_lesson FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id
    WHERE a.id=p_reference AND l.course_id=p_course;
   IF v_parent_lesson IS NULL THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
   SELECT l.* INTO v_lesson FROM public.lessons l WHERE l.id=v_parent_lesson AND l.course_id=p_course FOR SHARE OF l NOWAIT;
   IF v_lesson.id IS NULL THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
   PERFORM 1 FROM public.lesson_attachments a WHERE a.id=p_reference AND a.lesson_id=v_lesson.id FOR SHARE OF a NOWAIT;
   IF NOT FOUND THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
  END IF;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END;
 -- The reference row and, for attachments, its current lesson are now held through byte return.
 v_row:=public.pcc_v1_reference_row(p_course,p_kind,p_reference);
 IF v_row IS NULL THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
 v_module:=CASE WHEN p_kind='course_document' THEN(v_row->>'module_id')::uuid ELSE v_lesson.module_id END;
 IF v_module IS NOT NULL THEN
  BEGIN
   -- FOR UPDATE conflicts with the verified immediate FK KEY SHARE of new schedule/override INSERTs.
   PERFORM 1 FROM public.course_modules m WHERE m.id=v_module AND m.course_id=p_course FOR UPDATE OF m NOWAIT;
   IF NOT FOUND THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END;
 END IF;
 -- Staff preview keeps its existing rights; schedules/sequential completion remain learner-only below.
 v_download:=v_course.allow_materials_download IS DISTINCT FROM false;
 IF p_kind='course_document' THEN
  v_visible:=coalesce((v_row->>'visible_to_students')::boolean,false);v_download:=v_download AND coalesce((v_row->>'allow_download')::boolean,false);
  v_module:=(v_row->>'module_id')::uuid;
  IF v_library_only AND(v_row->>'library_document_id' IS NULL OR NOT v_visible) THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
  IF p_access_mode='learner' AND(NOT v_visible OR(NOT v_library_only AND NOT public.pcc_v1_module_ready(p_course,v_module,v_actor))) THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
  IF v_row->>'library_document_id' IS NOT NULL THEN
   IF NOT coalesce(public.can_read_electronic_library_document((v_row->>'library_document_id')::uuid),false)
    OR(public.paid_umk_20260922_is_asset((v_row->>'library_document_id')::uuid)
     AND NOT coalesce(public.paid_umk_20260922_can_read_assignment(p_course,(v_row->>'library_document_id')::uuid,v_visible),false)) THEN
     RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
  END IF;
  -- Module-scoped materials may open at the same boundary as the first lesson of that module.
  IF p_access_mode='learner' AND NOT v_library_only AND v_module IS NOT NULL THEN
   SELECT id INTO v_first_lesson FROM public.lessons WHERE course_id=p_course AND module_id=v_module ORDER BY order_index,id LIMIT 1;
   IF v_first_lesson IS NOT NULL AND NOT public.pcc_v1_learner_lesson_ready(p_course,v_first_lesson,v_actor) THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
  END IF;
 ELSE
  SELECT * INTO v_lesson FROM public.lessons WHERE id=(v_row->>'lesson_id')::uuid AND course_id=p_course;
  IF v_lesson.id IS NULL OR NOT coalesce(public._paid_20260922_lesson_read(v_lesson.id,false,p_access_mode='learner'),false)
   OR(p_access_mode='learner' AND NOT public.pcc_v1_learner_lesson_ready(p_course,v_lesson.id,v_actor)) THEN
   RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
  v_visible:=true;v_module:=v_lesson.module_id;
 END IF;
 IF p_purpose='download' AND NOT v_download THEN RAISE EXCEPTION 'PCC_DOWNLOAD_UNAVAILABLE' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('actor_id',v_actor,'organization_id',v_course.organization_id,'row',v_row,'module_id',v_module,
  'lesson_id',CASE WHEN p_kind='lesson_attachment' THEN v_lesson.id END,'visible_to_students',v_visible,'allow_download',v_download);
END;$f$;

CREATE OR REPLACE FUNCTION public.read_course_exact_file_delivery_mode(p_course_id uuid,p_access_mode text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_actor uuid;v_course public.courses;h public.platform_course_copy_file_cohorts;v_base jsonb;v_marker jsonb;v_vector jsonb;
BEGIN
 v_actor:=public.pcc_v1_actor();
 IF p_course_id IS NULL OR p_access_mode IS NULL OR p_access_mode NOT IN('learner','staff_preview') THEN RAISE EXCEPTION 'PCC_SELECTION_REQUIRED' USING ERRCODE='22023';END IF;
 BEGIN SELECT * INTO v_course FROM public.courses WHERE id=p_course_id FOR SHARE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END;
 IF v_course.id IS NULL THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
 PERFORM public.pcc_v2_copy_course_fences(p_course_id,p_access_mode);
 PERFORM public.pcc_v1_actor();
 IF p_access_mode='staff_preview' THEN
  IF NOT coalesce(public.can_access_course(p_course_id,'courses.read'),false) OR NOT coalesce(public._paid_20260922_course_read(p_course_id,false),false) THEN
   RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
 ELSE
  IF NOT coalesce(public.can_access_course_as_learner(p_course_id),false)
   OR NOT coalesce(public._paid_20260922_course_read(p_course_id,true),false) THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
  IF v_course.is_published IS NOT TRUE AND NOT coalesce((public.get_course_electronic_library_shell(p_course_id)->>'library_only')::boolean,false) THEN
   RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
 END IF;
 v_base:=jsonb_build_object('schema_version',1,'actor_id',v_actor,'organization_id',v_course.organization_id,'course_id',p_course_id,'access_mode',p_access_mode);
 SELECT * INTO h FROM public.platform_course_copy_file_cohorts WHERE course_id=p_course_id;
 IF h.id IS NULL THEN
  -- A current own-source PCR publication must not downgrade to live URLs merely because it is not a buyer copy.
  IF v_course.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid AND EXISTS(
   SELECT 1 FROM public.platform_course_publication_review_events e WHERE e.course_id=p_course_id
    AND e.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'AND e.event_kind='publication_recorded')THEN
   RETURN v_base||jsonb_build_object('mode','frozen_required','state','held','cohort',NULL);
  END IF;
  RETURN v_base||jsonb_build_object('mode','legacy','state','legacy','cohort',NULL);
 END IF;
 -- Header existence always prevents downgrade, including an invalidated or zero-reference cohort.
 IF h.organization_id=v_course.organization_id AND h.source_course_id IS NOT DISTINCT FROM v_course.source_course_id
 AND h.order_id IS NOT DISTINCT FROM v_course.source_order_id AND EXISTS(
  SELECT 1 FROM public.marketplace_orders o JOIN public.marketplace_courses m ON m.id=o.marketplace_course_id
  WHERE o.id=h.order_id AND o.buyer_organization_id=h.organization_id AND o.buyer_type='organization'
   AND o.status IN('paid','completed')AND o.paid_at IS NOT NULL AND m.id=h.marketplace_id AND m.course_id=h.source_course_id)
 AND EXISTS(SELECT 1 FROM public.platform_course_publication_review_events e WHERE e.id=h.publication_id
  AND e.event_kind='publication_recorded'AND e.course_id=h.source_course_id AND e.marketplace_id=h.marketplace_id AND e.edition_sha256=h.publication_manifest_sha256)THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind',b.reference_kind,'reference',b.reference_id,'binding',b.id,'receipt',b.receipt_id,'target_sha256',b.target_row_sha256)ORDER BY b.reference_kind,b.reference_id),'[]')
  INTO v_vector FROM public.platform_course_copy_file_bindings b WHERE b.course_id=h.course_id AND b.copy_generation_id=h.copy_generation_id;
  IF jsonb_array_length(v_vector)=h.reference_count AND public.pcr_v2_sha(v_vector)=h.reference_vector_sha256 THEN
   v_marker:=jsonb_build_object('schema_version',1,'copy_generation_id',h.copy_generation_id,'publication_id',h.publication_id,
    'publication_manifest_sha256',h.publication_manifest_sha256,'source_course_id',h.source_course_id,'reference_count',h.reference_count,'reference_vector_sha256',h.reference_vector_sha256);
  END IF;
 END IF;
 -- held is a course-level raw-media/offline gate, not a declaration that every per-reference file is unavailable.
 RETURN v_base||jsonb_build_object('mode','frozen_required','state','held','cohort',v_marker);
END;$f$;

CREATE OR REPLACE FUNCTION public.pcc_v1_copy_binding_payload(p_binding uuid,p_access jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE b public.platform_course_copy_file_bindings;h public.platform_course_copy_file_cohorts;r public.platform_course_file_receipts;
 v_library public.library_documents;v_vector jsonb;
BEGIN
 SELECT * INTO b FROM public.platform_course_copy_file_bindings WHERE id=p_binding;
 SELECT * INTO h FROM public.platform_course_copy_file_cohorts WHERE course_id=b.course_id;
 SELECT * INTO r FROM public.platform_course_file_receipts WHERE id=b.receipt_id;
 PERFORM public.pcc_v2_source_resource_fences(b.source_library_document_id,
  CASE WHEN r.reference_snapshot->>'source_org_version_id'IS NOT NULL THEN(r.reference_snapshot->>'source_org_version_id')::uuid END,
  h.order_id,h.course_id);
 IF b.id IS NULL OR h.id IS NULL OR r.id IS NULL OR b.copy_generation_id<>h.copy_generation_id OR b.organization_id<>h.organization_id
 OR h.organization_id IS DISTINCT FROM(p_access->>'organization_id')::uuid OR b.target_row_sha256 IS DISTINCT FROM public.pcr_v2_sha(p_access->'row')
 OR b.target_module_id IS DISTINCT FROM(p_access->>'module_id')::uuid OR b.target_lesson_id IS DISTINCT FROM(p_access->>'lesson_id')::uuid
 OR r.course_id<>h.source_course_id OR b.source_course_id<>h.source_course_id OR r.organization_id<>'4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
 OR r.marketplace_id<>h.marketplace_id OR r.reference_kind<>b.reference_kind OR r.reference_id<>b.source_reference_id OR r.scope_generation<>h.source_scope_generation
 OR NOT EXISTS(SELECT 1 FROM public.courses c JOIN public.marketplace_orders o ON o.id=h.order_id JOIN public.marketplace_courses m ON m.id=h.marketplace_id
   WHERE c.id=h.course_id AND c.organization_id=h.organization_id AND c.source_course_id=h.source_course_id AND c.source_order_id=h.order_id
    AND o.buyer_organization_id=h.organization_id AND o.marketplace_course_id=h.marketplace_id AND o.buyer_type='organization'
    AND o.status IN('paid','completed') AND o.paid_at IS NOT NULL AND m.course_id=h.source_course_id)
 OR NOT EXISTS(SELECT 1 FROM public.platform_course_publication_review_events e WHERE e.id=h.publication_id AND e.event_kind='publication_recorded'
  AND e.course_id=h.source_course_id AND e.marketplace_id=h.marketplace_id AND e.edition_sha256=h.publication_manifest_sha256) THEN RETURN NULL;END IF;
 -- Frozen source bytes do not follow later pointer/object overwrites. Current rights/revocation still apply.
 IF b.source_library_document_id IS NOT NULL THEN
  SELECT * INTO v_library FROM public.library_documents WHERE id=b.source_library_document_id;
  IF v_library.id IS NULL OR v_library.organization_id IS DISTINCT FROM '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
   OR v_library.archived_at IS NOT NULL OR v_library.library_status IS DISTINCT FROM 'active' THEN RETURN NULL;END IF;
  IF public.paid_umk_20260922_is_asset(v_library.id)
   AND NOT coalesce(public.paid_umk_20260922_valid_grant(h.course_id,v_library.id),false) THEN RETURN NULL;END IF;
 END IF;
 IF r.reference_snapshot->>'source_org_version_id' IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id
  WHERE v.id=(r.reference_snapshot->>'source_org_version_id')::uuid AND v.organization_id=r.organization_id
   AND d.organization_id=r.organization_id AND d.deleted_at IS NULL) THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',x.reference_kind,'reference',x.reference_id,'binding',x.id,'receipt',x.receipt_id,'target_sha256',x.target_row_sha256) ORDER BY x.reference_kind,x.reference_id),'[]')
 INTO v_vector FROM public.platform_course_copy_file_bindings x WHERE x.course_id=h.course_id AND x.copy_generation_id=h.copy_generation_id;
 IF jsonb_array_length(v_vector)<>h.reference_count OR public.pcr_v2_sha(v_vector)<>h.reference_vector_sha256 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('schema_version',1,'state','bytes_sealed','binding_id',b.id,'copy_generation_id',h.copy_generation_id,
  'course_id',h.course_id,'organization_id',h.organization_id,'reference_kind',b.reference_kind,'reference_id',b.reference_id,
  'module_id',b.target_module_id,'lesson_id',b.target_lesson_id,'source_organization_id',r.organization_id,'source_course_id',r.course_id,
  'source_reference_kind',r.reference_kind,'source_reference_id',r.reference_id,'source_module_id',b.source_module_id,'source_lesson_id',b.source_lesson_id,
  'publication_id',h.publication_id,'publication_manifest_sha256',h.publication_manifest_sha256,'file_receipt_id',r.id,'captured_edition_id',r.captured_edition_id,
  'source_org_version_id',r.reference_snapshot->'source_org_version_id','file_bytes_sha256',r.file_sha256,'byte_length',r.byte_length,
  'display_name',left(coalesce(nullif(regexp_replace(b.source_reference_metadata->>'name','[[:cntrl:]]','','g'),''),'course-file'),1000),
  'visible_to_students',(p_access->>'visible_to_students')::boolean,'allow_download',(p_access->>'allow_download')::boolean);
END;$f$;


CREATE TRIGGER pcc_current_asset_authority_fence BEFORE INSERT OR UPDATE OR DELETE ON public.paid_umk_20260922_assets FOR EACH ROW EXECUTE FUNCTION public.pcc_v2_asset_authority_before();
CREATE TRIGGER pcc_current_withdrawal_authority_fence BEFORE INSERT OR UPDATE OR DELETE ON public.uc_enrollment_withdrawal_states FOR EACH ROW EXECUTE FUNCTION public.pcc_v2_enrollment_authority_before();
CREATE TRIGGER pcc_current_removal_authority_fence BEFORE INSERT OR UPDATE OR DELETE ON public.uc_course_assignment_removal_events FOR EACH ROW EXECUTE FUNCTION public.pcc_v2_enrollment_authority_before();
DO $pcc_rights_postflight$
DECLARE e jsonb;p_row pg_proc;v_oid oid;v_new oid[]:='{}';v_replaced oid[];v_expected_catalog jsonb;v_other jsonb;g record;
 v_expected constant jsonb:=$new_rights_bodies$[{"signature":"public.pcc_v2_current_rights_keys(text,uuid[],boolean)","sha256":"d8fa5cf9de8220eea9e35eb77b338822572efa385a767fdbd08efa9f3e019394","returns":"void"},{"signature":"public.pcc_v2_asset_authority_before()","sha256":"0fd69e387ae7e0027f388b7c1dd2e15ca3dcb60e2962727b9c46b843901dfbd5","returns":"trigger"},{"signature":"public.pcc_v2_source_resource_fences(uuid,uuid,uuid,uuid)","sha256":"0912544852bd7a7f0b0d5f7d6c4636b82d4ebd5d5590c991d8da9eef900f6fd1","returns":"void"},{"signature":"public.pcc_v2_enrollment_authority_before()","sha256":"988281195f4a2a0ef521a9d05004faeb4e0facbe1f65ba4ce7bdb63a5c6546a4","returns":"trigger"},{"signature":"public.pcc_v2_copy_course_fences(uuid,text)","sha256":"b3f99fdfab5b76e3466ab866e2c6e069207f02b1faa79714443376d75fcb21f5","returns":"void"}]$new_rights_bodies$::jsonb;
 v_changed constant jsonb:=$changed_rights_bodies$[{"signature":"public.pcc_v1_authorized_reference(uuid,text,uuid,text,text)","sha256":"971549e1919c5e0fabc1d59fdd3187a688ef4cefe375e36db310688535d8c634"},{"signature":"public.read_course_exact_file_delivery_mode(uuid,text)","sha256":"9948fdf4790e1f01f8abff9ef5f96832a0d258bebf27d48881fbcb79aefe0a42"},{"signature":"public.pcc_v1_copy_binding_payload(uuid,jsonb)","sha256":"31e47de059caed8a80d7e08a3e638064d48ef366a19dc9125cad679bf5d97ecb"}]$changed_rights_bodies$::jsonb;
 v_triggers constant jsonb:=$new_rights_triggers$[{"name":"pcc_current_asset_authority_fence","table":"public.paid_umk_20260922_assets","fn":"public.pcc_v2_asset_authority_before()"},{"name":"pcc_current_withdrawal_authority_fence","table":"public.uc_enrollment_withdrawal_states","fn":"public.pcc_v2_enrollment_authority_before()"},{"name":"pcc_current_removal_authority_fence","table":"public.uc_course_assignment_removal_events","fn":"public.pcc_v2_enrollment_authority_before()"}]$new_rights_triggers$::jsonb;
BEGIN
 SELECT * INTO g FROM pg_temp.pcc_rights_source_guard_20261029;
 IF NOT FOUND OR g.backend_pid IS DISTINCT FROM pg_backend_pid()OR g.transaction_id IS DISTINCT FROM txid_current()
 OR(SELECT count(*)FROM pg_temp.pcc_rights_source_guard_20261029)<>1 THEN RAISE EXCEPTION 'PCC_RIGHTS_SAME_TRANSACTION_GUARD_REQUIRED';END IF;
 v_replaced:=g.replaced_oids;
 FOR e IN SELECT value FROM jsonb_array_elements(v_expected)LOOP
  v_oid:=to_regprocedure(e->>'signature');SELECT * INTO p_row FROM pg_proc WHERE oid=v_oid;
  IF v_oid IS NULL OR p_row.proowner IS DISTINCT FROM'postgres'::regrole OR p_row.pronamespace IS DISTINCT FROM'public'::regnamespace
  OR p_row.prokind IS DISTINCT FROM'f'OR p_row.prosecdef IS DISTINCT FROM true OR p_row.provolatile IS DISTINCT FROM'v'
  OR p_row.proisstrict OR p_row.prorettype IS DISTINCT FROM to_regtype(e->>'returns')
  OR p_row.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp','lock_timeout=3s']::text[]
  OR encode(sha256(convert_to(p_row.prosrc,'UTF8')),'hex')IS DISTINCT FROM e->>'sha256'
  OR has_function_privilege('anon',v_oid,'EXECUTE')OR has_function_privilege('authenticated',v_oid,'EXECUTE')OR has_function_privilege('service_role',v_oid,'EXECUTE')
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p_row.proacl,acldefault('f',p_row.proowner)))a WHERE a.grantee<>p_row.proowner)THEN
   RAISE EXCEPTION 'PCC_RIGHTS_NEW_PRIVATE_BODY_OR_ACL_DRIFT: %',e->>'signature';END IF;
  v_new:=array_append(v_new,v_oid);
 END LOOP;
 IF cardinality(v_new)<>5 OR cardinality(v_replaced)<>3 THEN RAISE EXCEPTION 'PCC_RIGHTS_EXACT_FIVE_NEW_THREE_CHANGED_REQUIRED';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(v_changed)LOOP
  v_oid:=to_regprocedure(e->>'signature');SELECT * INTO p_row FROM pg_proc WHERE oid=v_oid;
  IF v_oid IS NULL OR NOT(v_oid=ANY(v_replaced))OR(to_jsonb(p_row)-'prosrc')IS DISTINCT FROM g.old_catalog->v_oid::text
  OR encode(sha256(convert_to(p_row.prosrc,'UTF8')),'hex')IS DISTINCT FROM e->>'sha256'THEN
   RAISE EXCEPTION 'PCC_RIGHTS_EXISTING_FUNCTION_ATTRIBUTES_OR_BODY_DRIFT: %',e->>'signature';END IF;
 END LOOP;
 EXECUTE $other_rights_functions$SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(jsonb_build_object('catalog',to_jsonb(p),'definition',pg_get_functiondef(p.oid))::text,'UTF8')),'hex'),'' ORDER BY p.oid::regprocedure::text),''),'UTF8')),'hex'))FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.prokind='f'AND NOT(p.oid=ANY($1))$other_rights_functions$INTO v_other USING v_replaced||v_new;
 IF v_other IS DISTINCT FROM g.other_functions THEN RAISE EXCEPTION 'PCC_RIGHTS_OTHER_FUNCTIONS_CHANGED';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(v_triggers)LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass(e->>'table')AND t.tgname=e->>'name'
   AND t.tgfoid=to_regprocedure(e->>'fn')AND NOT t.tgisinternal AND t.tgenabled='O'AND t.tgtype=31
   AND t.tgnargs=0 AND t.tgqual IS NULL AND t.tgconstraint=0)THEN RAISE EXCEPTION 'PCC_RIGHTS_NEW_TRIGGER_SCOPE_DRIFT';END IF;
 END LOOP;
 IF public.pcf_v1_delivery_capabilities()IS DISTINCT FROM g.capabilities
 OR public.pcf_v1_enforcement_stamp()IS DISTINCT FROM'5d8e867d99288c8e1372c1f7e49c4ca07341ce2fb197b5aa2ff593529095aee6'THEN
  RAISE EXCEPTION 'PCC_RIGHTS_NO_CAPABILITY_OR_PCF_STAMP_CHANGE_ALLOWED';END IF;
END;$pcc_rights_postflight$;
COMMIT;
