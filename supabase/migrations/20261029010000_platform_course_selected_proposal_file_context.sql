-- SOURCE ONLY. Additive selected immutable proposal file metadata; no existing function/data mutation.
-- Requires independently accepted PCR core + persisted review reader + PCF R4. Not applied or runtime-tested.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
SET LOCAL search_path=pg_catalog,public,pg_temp;
DO $preflight$DECLARE r record;p record;BEGIN
 IF current_user<>'postgres'THEN RAISE EXCEPTION 'PCF_TRUSTED_INSTALLER_REQUIRED';END IF;
 IF to_regclass('public.platform_course_publication_review_events')IS NULL OR to_regclass('public.platform_course_file_receipts')IS NULL THEN
  RAISE EXCEPTION 'PCF_ACCEPTED_REVIEW_AND_RECEIPT_STORES_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc catalog_proc JOIN pg_namespace n ON n.oid=catalog_proc.pronamespace WHERE n.nspname='public'AND catalog_proc.proname='read_platform_course_proposal_file_context')THEN
  RAISE EXCEPTION 'PCF_PROPOSAL_FILE_CONTEXT_PREEXISTING_REVIEW_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN('public','auth')AND(has_schema_privilege('anon',oid,'CREATE')OR has_schema_privilege('authenticated',oid,'CREATE')))THEN
  RAISE EXCEPTION 'PCF_UNTRUSTED_SCHEMA';END IF;
 FOR r IN SELECT * FROM(VALUES
 ('public.pcr_v2_actor(boolean)','63b645338e10484f5239d936457d2cec774b0d9f7afa160fa38b73c5154d5a1c','uuid',true,'v',false,ARRAY['search_path=pg_catalog, public','lock_timeout=3s']::text[]),
 ('public.pcr_v2_enter(uuid)','a379ba544bd18a26ac8f8c6d68c4077e60f96de79b6a4afc1eb0ef3a9726a53f','uuid',true,'v',false,ARRAY['search_path=pg_catalog, public','lock_timeout=3s']::text[]),
 ('public.pcr_v2_sha(jsonb)','0efcedbc625bdd5c0e6dc3f27a59e846460fe328880fd562d3f0de352c913b5a','text',false,'i',true,ARRAY['search_path=pg_catalog, public']::text[]),
 ('public.read_platform_course_file_receipt(uuid)','4fb190fb47314eed3eb2c13be06f008d60d791ea8dbfd9920c8021658b084ce9','jsonb',true,'v',false,ARRAY['search_path=pg_catalog, public, pg_temp']::text[]),
 ('public.read_platform_course_publication_review_context(uuid,uuid,text,text,uuid)','543e9fb05d8303eea9df527215d789aad44100ab7f83a5d2d66e69021cd64c75','jsonb',true,'v',false,ARRAY['search_path=pg_catalog, public, pg_temp','lock_timeout=3s']::text[])
 )v(signature,body_sha256,return_type,security_definer,volatility,strictness,configuration)LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
  IF p.oid IS NULL OR pg_get_userbyid(p.proowner)<>'postgres'OR p.prokind<>'f'
   OR p.prosecdef IS DISTINCT FROM r.security_definer OR p.provolatile::text IS DISTINCT FROM r.volatility
   OR p.proisstrict IS DISTINCT FROM r.strictness OR format_type(p.prorettype,NULL)IS DISTINCT FROM r.return_type
   OR p.proconfig IS DISTINCT FROM r.configuration OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')IS DISTINCT FROM r.body_sha256 THEN
   RAISE EXCEPTION 'PCF_SELECTED_READER_PREIMAGE_DRIFT: %',r.signature;END IF;
 END LOOP;
END;$preflight$;

-- SOURCE PROPOSAL: new-object-only ACL scope. Keep the original namespace guard.
-- Both scope/reset hunks must run in this original transaction; not an existing-object repair.
DO $new_acl_scope_selected_metadata$
DECLARE v_signature text;v_relation text;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' THEN RAISE EXCEPTION 'NEW_ACL_POSTGRES_OWNER_REQUIRED';END IF;
 FOREACH v_signature IN ARRAY ARRAY['public.read_platform_course_proposal_file_context(uuid,uuid,text,text,uuid)']::text[] LOOP
  IF pg_catalog.to_regprocedure(v_signature) IS NOT NULL THEN RAISE EXCEPTION 'NEW_ACL_PREEXISTING_FUNCTION_REFUSED: %',v_signature;END IF;
 END LOOP;
 FOREACH v_relation IN ARRAY ARRAY[]::text[] LOOP
  IF pg_catalog.to_regclass(v_relation) IS NOT NULL THEN RAISE EXCEPTION 'NEW_ACL_PREEXISTING_RELATION_REFUSED: %',v_relation;END IF;
 END LOOP;
END;$new_acl_scope_selected_metadata$;

CREATE FUNCTION public.read_platform_course_proposal_file_context(
 p_marketplace_id uuid,p_proposal_id uuid,p_expected_proposal_edition_sha256 text,p_reference_kind text,p_reference_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $f$
DECLARE v_course uuid;v_actor uuid;p public.platform_course_publication_review_events;r public.platform_course_file_receipts;
 v_manifest jsonb;v_binding jsonb;v_declared jsonb;v_count bigint;v_receipt jsonb;v_base jsonb;
BEGIN
 -- Reuse the ordinary persisted-review entry: current authenticated active moderator,
 -- account42007, READ COMMITTED, current owned source/listing and existing parent fences.
 v_course:=public.pcr_v2_enter(p_marketplace_id);v_actor:=public.pcr_v2_actor(false);
 IF NOT coalesce(public.uc_platform_document_action_allowed(v_actor,'read'),false) THEN
  RAISE EXCEPTION 'PCF_PROPOSAL_FILE_CONTEXT_DENIED' USING ERRCODE='42501';END IF;
 IF p_proposal_id IS NULL OR p_reference_id IS NULL OR p_reference_kind IS NULL
 OR p_reference_kind NOT IN('course_document','lesson_attachment')
 OR p_expected_proposal_edition_sha256 IS NULL OR p_expected_proposal_edition_sha256!~'^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'PCF_EXPLICIT_PROPOSAL_FILE_SELECTION_REQUIRED' USING ERRCODE='22023';END IF;
 SELECT * INTO p FROM public.platform_course_publication_review_events e
 WHERE e.id=p_proposal_id AND e.marketplace_id=p_marketplace_id AND e.course_id=v_course
  AND e.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'AND e.event_kind='submitted';
 IF p.id IS NULL THEN RAISE EXCEPTION 'PCF_PROPOSAL_SELECTION_UNAVAILABLE' USING ERRCODE='42501';END IF;
 IF p.edition_sha256 IS DISTINCT FROM p_expected_proposal_edition_sha256 THEN
  RAISE EXCEPTION 'PCF_PROPOSAL_SELECTION_CHANGED' USING ERRCODE='40001';END IF;
 v_base:=jsonb_build_object('schema_version',1,'actor_id',v_actor,'organization_id','4ac2c05a-d8b5-4e72-ba31-f2c743091d95',
  'marketplace_id',p_marketplace_id,'course_id',v_course,'proposal_id',p.id,'proposal_edition_sha256',p.edition_sha256,
  'reference_kind',p_reference_kind,'reference_id',p_reference_id,
  'delivery_scope','selected_platform_proposal_moderator_only_not_learner_acceptance');
 v_manifest:=p.canonical_manifest;
 <<sealed_selection>> BEGIN
  -- Only the selected immutable manifest is a receipt selector. Editable dossier
  -- claims, current binding_state and first/latest/title lookups are never used.
  IF jsonb_typeof(v_manifest)IS DISTINCT FROM'object'OR v_manifest->>'schema_version'IS DISTINCT FROM'2'
   OR v_manifest->>'course_id'IS DISTINCT FROM v_course::text OR v_manifest->>'marketplace_id'IS DISTINCT FROM p_marketplace_id::text
   OR v_manifest->>'organization_id'IS DISTINCT FROM'4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
   OR public.pcr_v2_sha(v_manifest)IS DISTINCT FROM p.edition_sha256
   OR v_manifest->>'file_bindings_schema_version'IS DISTINCT FROM'1'
   OR jsonb_typeof(v_manifest->'file_bindings')IS DISTINCT FROM'array' THEN EXIT sealed_selection;END IF;
  SELECT count(*),(jsonb_agg(b))->0 INTO v_count,v_binding FROM jsonb_array_elements(v_manifest->'file_bindings')AS bindings(b)
   WHERE b->>'reference_kind'=p_reference_kind AND b->>'reference_id'=p_reference_id::text;
  IF v_count<>1 OR v_binding->>'state'IS DISTINCT FROM'bytes_sealed'
   OR jsonb_typeof(v_binding->'receipt_id')IS DISTINCT FROM'string'
   OR NOT coalesce(pg_input_is_valid(v_binding->>'receipt_id','uuid'),false)
   OR NOT(v_binding?'source_org_version_id') THEN EXIT sealed_selection;END IF;
  IF v_binding->'source_org_version_id'IS DISTINCT FROM'null'::jsonb AND(
   jsonb_typeof(v_binding->'source_org_version_id')IS DISTINCT FROM'string'
   OR NOT coalesce(pg_input_is_valid(v_binding->>'source_org_version_id','uuid'),false))THEN EXIT sealed_selection;END IF;
  IF p_reference_kind='course_document' THEN
   IF jsonb_typeof(v_manifest->'documents')IS DISTINCT FROM'array'THEN EXIT sealed_selection;END IF;
   SELECT count(*),(jsonb_agg(d))->0 INTO v_count,v_declared FROM jsonb_array_elements(v_manifest->'documents')AS declared_documents(d)
    WHERE d->>'id'=p_reference_id::text;
  ELSE
   IF jsonb_typeof(v_manifest->'lessons')IS DISTINCT FROM'array'THEN EXIT sealed_selection;END IF;
   SELECT count(*),(jsonb_agg(a))->0 INTO v_count,v_declared FROM jsonb_array_elements(v_manifest->'lessons')AS declared_lessons(l)
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(l->'attachments')='array'THEN l->'attachments'ELSE'[]'::jsonb END)AS declared_attachments(a)
    WHERE a->>'id'=p_reference_id::text;
  END IF;
  IF v_count<>1 OR jsonb_typeof(v_declared->'row_sha256')IS DISTINCT FROM'string'
   OR (v_declared->>'row_sha256')!~'^[a-f0-9]{64}$'THEN EXIT sealed_selection;END IF;
  SELECT * INTO r FROM public.platform_course_file_receipts WHERE id=(v_binding->>'receipt_id')::uuid;
  IF r.id IS NULL OR r.id::text IS DISTINCT FROM v_binding->>'receipt_id'
   OR r.organization_id IS DISTINCT FROM'4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
   OR r.course_id IS DISTINCT FROM v_course OR r.marketplace_id IS DISTINCT FROM p_marketplace_id
   OR r.reference_kind IS DISTINCT FROM p_reference_kind OR r.reference_id IS DISTINCT FROM p_reference_id
   OR r.scope_generation::text IS DISTINCT FROM v_manifest->>'scope_generation'
   OR r.captured_edition_id::text IS DISTINCT FROM v_binding->>'captured_edition_id'
   OR r.file_sha256 IS DISTINCT FROM v_binding->>'file_bytes_sha256'
   OR to_jsonb(r.byte_length)IS DISTINCT FROM v_binding->'byte_length'
   OR r.reference_snapshot->'source_org_version_id'IS DISTINCT FROM v_binding->'source_org_version_id'
   OR r.reference_snapshot->>'course_id'IS DISTINCT FROM v_course::text
   OR r.reference_snapshot->>'organization_id'IS DISTINCT FROM'4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
   OR r.reference_snapshot->>'scope_generation'IS DISTINCT FROM r.scope_generation::text
   OR r.reference_snapshot->>'reference_kind'IS DISTINCT FROM p_reference_kind
   OR r.reference_snapshot->>'reference_id'IS DISTINCT FROM p_reference_id::text
   OR r.reference_snapshot->>'reference_row_sha256'IS DISTINCT FROM v_declared->>'row_sha256'
   OR r.byte_length<1 OR r.byte_length>8388608 OR octet_length(r.file_bytes)IS DISTINCT FROM r.byte_length
   OR encode(sha256(r.file_bytes),'hex')IS DISTINCT FROM r.file_sha256 THEN EXIT sealed_selection;END IF;
  IF p_reference_kind='course_document'AND(
   v_declared->'library_document_id'IS DISTINCT FROM r.reference_snapshot->'library_document_id'
   OR v_declared->'library_row_sha256'IS DISTINCT FROM r.reference_snapshot->'library_row_sha256')THEN EXIT sealed_selection;END IF;
  v_receipt:=jsonb_build_object('receipt_id',r.id,'captured_edition_id',r.captured_edition_id,
   'source_org_version_id',r.reference_snapshot->'source_org_version_id','file_bytes_sha256',r.file_sha256,'byte_length',r.byte_length);
 END sealed_selection;
 -- Recheck ordinary actor/current read permission before returning even HOLD metadata.
 IF public.pcr_v2_actor(false)IS DISTINCT FROM v_actor OR NOT coalesce(public.uc_platform_document_action_allowed(v_actor,'read'),false)THEN
  RAISE EXCEPTION 'PCF_PROPOSAL_FILE_CONTEXT_DENIED' USING ERRCODE='42501';END IF;
 RETURN v_base||jsonb_build_object('state',CASE WHEN v_receipt IS NULL THEN'held'ELSE'bytes_sealed'END,'receipt',v_receipt);
END;$f$;

-- SOURCE PROPOSAL: strip inherited ACL entries only from the fixed objects created above.
-- Existing expected GRANT statements and strict postflight guards remain after this block.
DO $new_acl_reset_selected_metadata$
DECLARE
 v_signatures text[]:=ARRAY['public.read_platform_course_proposal_file_context(uuid,uuid,text,text,uuid)']::text[];
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
END;$new_acl_reset_selected_metadata$;

REVOKE ALL ON FUNCTION public.read_platform_course_proposal_file_context(uuid,uuid,text,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_platform_course_proposal_file_context(uuid,uuid,text,text,uuid) TO authenticated;
DO $postflight$DECLARE p record;BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid='public.read_platform_course_proposal_file_context(uuid,uuid,text,text,uuid)'::regprocedure;
 IF pg_get_userbyid(p.proowner)<>'postgres'OR NOT p.prosecdef OR p.provolatile<>'v'OR p.proisstrict
  OR format_type(p.prorettype,NULL)<>'jsonb'OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp','lock_timeout=3s']
  OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>'a359743c50a3c0f318fb9d3712d2638ce067f1d95f4397008d1bcc432a1cec72'
  OR has_function_privilege('anon',p.oid,'EXECUTE')OR has_function_privilege('service_role',p.oid,'EXECUTE')
  OR NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
    WHERE a.privilege_type='EXECUTE'AND a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='authenticated')))THEN
  RAISE EXCEPTION 'PCF_SELECTED_READER_AFTERIMAGE_OR_ACL_DRIFT';END IF;
END;$postflight$;
COMMIT;
