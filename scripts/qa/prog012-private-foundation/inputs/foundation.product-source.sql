-- SOURCE CANDIDATE ONLY: private default-deny foundation, NOT a production registrar.
-- No public RPC, policy row, integration, ledger write or old helper replacement.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $pfd_foundation_pre$
DECLARE v_expected jsonb := $pfd_dependency_bodies$[{"signature":"public.pcc_v2_current_rights_keys(text,uuid[],boolean)","sha256":"d8fa5cf9de8220eea9e35eb77b338822572efa385a767fdbd08efa9f3e019394","security_definer":true,"configuration":["search_path=pg_catalog, public, pg_temp","lock_timeout=3s"]},{"signature":"public.pcc_v2_asset_authority_before()","sha256":"0fd69e387ae7e0027f388b7c1dd2e15ca3dcb60e2962727b9c46b843901dfbd5","security_definer":true,"configuration":["search_path=pg_catalog, public, pg_temp","lock_timeout=3s"]},{"signature":"public.pcc_v2_source_resource_fences(uuid,uuid,uuid,uuid)","sha256":"0912544852bd7a7f0b0d5f7d6c4636b82d4ebd5d5590c991d8da9eef900f6fd1","security_definer":true,"configuration":["search_path=pg_catalog, public, pg_temp","lock_timeout=3s"]},{"signature":"public.pcc_v2_enrollment_authority_before()","sha256":"988281195f4a2a0ef521a9d05004faeb4e0facbe1f65ba4ce7bdb63a5c6546a4","security_definer":true,"configuration":["search_path=pg_catalog, public, pg_temp","lock_timeout=3s"]},{"signature":"public.pcc_v2_copy_course_fences(uuid,text)","sha256":"b3f99fdfab5b76e3466ab866e2c6e069207f02b1faa79714443376d75fcb21f5","security_definer":true,"configuration":["search_path=pg_catalog, public, pg_temp","lock_timeout=3s"]},{"signature":"public.pcc_v1_authorized_reference(uuid,text,uuid,text,text)","sha256":"971549e1919c5e0fabc1d59fdd3187a688ef4cefe375e36db310688535d8c634","security_definer":true,"configuration":["search_path=pg_catalog, public, pg_temp"]},{"signature":"public.read_course_exact_file_delivery_mode(uuid,text)","sha256":"9948fdf4790e1f01f8abff9ef5f96832a0d258bebf27d48881fbcb79aefe0a42","security_definer":true,"configuration":["search_path=pg_catalog, public, pg_temp"]},{"signature":"public.pcc_v1_copy_binding_payload(uuid,jsonb)","sha256":"31e47de059caed8a80d7e08a3e638064d48ef366a19dc9125cad679bf5d97ecb","security_definer":true,"configuration":["search_path=pg_catalog, public, pg_temp"]},{"signature":"public.pcc_v1_actor()","sha256":"51ae9c29eaf12a7c9d637a4fb47882e5b3c34ce57dc26af16fa34535945dc25a","security_definer":true,"configuration":["search_path=pg_catalog, public, pg_temp"]},{"signature":"public.pcc_v1_reference_row(uuid,text,uuid)","sha256":"e88b6fa99d78003d38b9584dd998827e99000fb7c929ba533f8973f13c4936a0","security_definer":true,"configuration":["search_path=pg_catalog, public, pg_temp"]},{"signature":"public.pcc_v1_module_ready(uuid,uuid,uuid)","sha256":"9c31bb8856c7bdc24458385b8499eebe12b0286dbe0259fc497a0c82daed5d0a","security_definer":true,"configuration":["search_path=pg_catalog, public, pg_temp"]},{"signature":"public.pcc_v1_learner_lesson_ready(uuid,uuid,uuid)","sha256":"76eb69037a3ab7d4628aba03bcdf94dd5a9c3bd96a326e327627270973f3429f","security_definer":true,"configuration":["search_path=pg_catalog, public, pg_temp"]},{"signature":"public.pcr_v2_lock(uuid[],text,text,boolean)","sha256":"ee48e5e98d3f4140fae0a10288a7fe710b148877983675cd3b776f7b5ccf6d58","security_definer":true,"configuration":["search_path=pg_catalog, public"]},{"signature":"public.pcr_v2_parent_courses(uuid[],boolean)","sha256":"d14cf74e1507267fbfa6d87bdb9ee854d75cfa47243669c5d0194515614d7ce9","security_definer":true,"configuration":["search_path=pg_catalog, public"]},{"signature":"public.pcr_v2_parent_lesson(uuid,boolean,boolean)","sha256":"2e2d774e490778363e897e274fe124cb30c292458008b403001bde2c3a36cb7d","security_definer":true,"configuration":["search_path=pg_catalog, public"]},{"signature":"public.pcr_v2_source_before()","sha256":"bf28ca8028e9b2355497d1198de0236a98870bee06b5e2291e411ee1b136e9f3","security_definer":true,"configuration":["search_path=pg_catalog, public"]},{"signature":"public.pcr_v2_listing_before()","sha256":"c6d7a550437ec65c3123dd16c220b4aafe4f6d786739b881c53f9ea0d0d9b752","security_definer":true,"configuration":["search_path=pg_catalog, public"]},{"signature":"public.account_deletion_subject_write_guard()","sha256":"82a48095b102fb498d2bcbb223d21440a190d3216a1b999d790257bba46adfd7","security_definer":true,"configuration":["search_path=pg_catalog, public"]},{"signature":"public.uc_enrollment_is_withdrawn(uuid)","sha256":"51d86c8fe394fff258b78347eea25d75cf460c2f9e0e38a4f2f0a60c5891fba1","security_definer":true,"configuration":["search_path=pg_catalog, public"]},{"signature":"public.can_access_organization(uuid,text)","sha256":"6fe776ab798d2925d18996adf0301c021384416200083bc83874c64547517210","owner":"postgres","security_definer":true,"configuration":["search_path=public"]},{"signature":"public.paid_umk_20260922_is_asset(uuid)","sha256":"4bcd30d79d89d36b11d308a265fe4d4d11f329edd57b93d219f0b55aefd35c48","owner":"postgres","security_definer":true,"configuration":["search_path=public, pg_temp"]},{"signature":"public.paid_umk_20260922_valid_grant(uuid,uuid)","sha256":"9d7ca0c9e31a1b7595ca902127302d3b43f5c7ed361cf5f2ec10f688cef88d71","owner":"postgres","security_definer":true,"configuration":["search_path=public, pg_temp"]},{"signature":"public.paid_umk_20260922_can_read_document(uuid)","sha256":"73c95c35989b67a986c86d30316921f5a8f44cf5934063138b1d4a4868d86d2a","owner":"postgres","security_definer":true,"configuration":["search_path=public, pg_temp"]},{"signature":"public.paid_umk_20260922_can_read_assignment(uuid,uuid,boolean)","sha256":"f5dcdbbfd7d98ab78f0818de83634d7a5179461a3ec33c65350c5d6756f6fd86","owner":"postgres","security_definer":true,"configuration":["search_path=public, pg_temp"]},{"signature":"public._paid_20260922_course_scope(uuid)","sha256":"b7eab04edeaee4240b0b0e7e8dc6496cf9484dda738b2d0a566eb84cc3588fb7","owner":"postgres","security_definer":true,"configuration":["search_path=pg_catalog, public","row_security=off"]},{"signature":"public.get_org_staff_permissions(uuid,uuid)","sha256":"e4ba83b86a3c6c56b2b88a1cac7cfb82d28e6e7c1c6674bc7be7528b5bec4ed1","owner":"postgres","security_definer":true,"configuration":["search_path=public"]},{"signature":"public.has_org_staff_permission(uuid,uuid,text)","sha256":"bade109b70ccc197d67c42cfb24b587d23a20677274bac6bc1a540eea605241b","owner":"postgres","security_definer":true,"configuration":["search_path=public"]},{"signature":"public.is_org_owner(uuid,uuid)","sha256":"22b61a365fd98202d8e284a821587c55a45f14b7d5e2646809dee0be4506539d","owner":"postgres","security_definer":true,"configuration":["search_path=public"]},{"signature":"public.org_role_default_permissions(text)","sha256":"fc3f6e836d591292477bed632c702d5c3b71a7e690ed912e82cab4ca66a7ae05","owner":"postgres","security_definer":false,"configuration":["search_path=public"]},{"signature":"public.normalize_org_staff_permission(text)","sha256":"1e99bd01dcc41215a6e56e74d2081e084d81c8cba98a0ea95321322b6e48ce7b","owner":"postgres","security_definer":false,"configuration":["search_path=public"]},{"signature":"public._paid_20260922_course_read(uuid,boolean)","sha256":"a57597c06ddeb3d6515e96936b2dd1030c0d7cab3fca59ce6b938438b65b942d","security_definer":true,"configuration":["search_path=pg_catalog, public","row_security=off"]},{"signature":"public._paid_20260922_lesson_read(uuid,boolean,boolean)","sha256":"44b82cbe7fdad49cea90b0351af1a94017fb7838058890b4b1ed91c2ae37ef9a","security_definer":true,"configuration":["search_path=pg_catalog, public","row_security=off"]},{"signature":"public._paid_20260922_original_ids()","sha256":"89aae04ebbe3d78375af6df456e9fda807f47c8ca88b237726523342419c2770","security_definer":false,"configuration":["search_path=pg_catalog, public"]},{"signature":"public.can_access_lesson(uuid,text)","sha256":"d8f68e5e8efe2fe462359a4e761e20ef6ad0556977b8b81f59a6a7955c840934","security_definer":true,"configuration":["search_path=public"]},{"signature":"public.get_course_electronic_library_shell(uuid)","sha256":"80e4117f8458a6ed6a2227b14ce1f95df0e83b85f0f9519e52852aa47250797e","security_definer":true,"configuration":["search_path=public"]}]$pfd_dependency_bodies$::jsonb;
 v_entry jsonb;v_proc pg_proc;v_oid oid;v_table text;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' OR auth.uid() IS NOT NULL OR auth.role() IS NOT NULL THEN
  RAISE EXCEPTION 'PFD_FOUNDATION_OWNER_NO_SUBJECT_REQUIRED';END IF;
 IF public.pcf_v1_enforcement_stamp() IS DISTINCT FROM '5d8e867d99288c8e1372c1f7e49c4ca07341ce2fb197b5aa2ff593529095aee6' THEN
  RAISE EXCEPTION 'PFD_EXISTING_CAPTURE_STAMP_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc catalog_proc JOIN pg_namespace catalog_ns ON catalog_ns.oid=catalog_proc.pronamespace
  WHERE catalog_ns.nspname='public' AND left(catalog_proc.proname,7)='pfd_v2_')
 OR to_regclass('public.platform_private_file_delivery_v2_current') IS NOT NULL
 OR to_regclass('public.platform_private_file_delivery_v2_events') IS NOT NULL THEN
  RAISE EXCEPTION 'PFD_NEW_NAMESPACE_MUST_BE_ABSENT';END IF;
 FOR v_entry IN SELECT value FROM jsonb_array_elements(v_expected) LOOP
  v_oid:=to_regprocedure(v_entry->>'signature');SELECT * INTO v_proc FROM pg_proc catalog_proc WHERE catalog_proc.oid=v_oid;
  IF v_oid IS NULL OR v_proc.proowner IS DISTINCT FROM 'postgres'::regrole
   OR v_proc.prosecdef IS DISTINCT FROM (v_entry->>'security_definer')::boolean
   OR to_jsonb(v_proc.proconfig) IS DISTINCT FROM v_entry->'configuration'
   OR encode(sha256(convert_to(v_proc.prosrc,'UTF8')),'hex') IS DISTINCT FROM v_entry->>'sha256' THEN
   RAISE EXCEPTION 'PFD_CURRENT_DEPENDENCY_DRIFT: %',v_entry->>'signature';END IF;
 END LOOP;
 -- Existing INSERT/UPDATE subject fences protect absence of actor/staff/enrollment/progress rows.
 FOREACH v_table IN ARRAY ARRAY['enrollments','lesson_progress','org_staff','user_roles'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger catalog_trigger
   WHERE catalog_trigger.tgrelid=to_regclass('public.'||v_table)
    AND catalog_trigger.tgname='account_deletion_subject_fence'
    AND catalog_trigger.tgfoid='public.account_deletion_subject_write_guard()'::regprocedure
    AND catalog_trigger.tgenabled='O' AND NOT catalog_trigger.tgisinternal AND catalog_trigger.tgtype=23
    AND catalog_trigger.tgnargs=1 AND encode(catalog_trigger.tgargs,'hex')=encode(convert_to('user_id','UTF8')||decode('00','hex'),'hex')
    AND catalog_trigger.tgqual IS NULL) THEN RAISE EXCEPTION 'PFD_SUBJECT_WRITER_BINDING_DRIFT: %',v_table;END IF;
 END LOOP;
 -- Existing enrollment-key writers fence missing withdrawal/removal INSERTs.
 IF NOT EXISTS(SELECT 1 FROM pg_trigger catalog_trigger WHERE catalog_trigger.tgrelid='public.uc_enrollment_withdrawal_states'::regclass
  AND catalog_trigger.tgname='pcc_current_withdrawal_authority_fence'
  AND catalog_trigger.tgfoid='public.pcc_v2_enrollment_authority_before()'::regprocedure
  AND catalog_trigger.tgtype=31 AND catalog_trigger.tgenabled='O' AND NOT catalog_trigger.tgisinternal)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger catalog_trigger WHERE catalog_trigger.tgrelid='public.uc_course_assignment_removal_events'::regclass
  AND catalog_trigger.tgname='pcc_current_removal_authority_fence'
  AND catalog_trigger.tgfoid='public.pcc_v2_enrollment_authority_before()'::regprocedure
  AND catalog_trigger.tgtype=31 AND catalog_trigger.tgenabled='O' AND NOT catalog_trigger.tgisinternal) THEN
  RAISE EXCEPTION 'PFD_CURRENT_ENROLLMENT_EVENT_WRITER_BINDING_DRIFT';END IF;
END;$pfd_foundation_pre$;
CREATE TEMP TABLE pfd_v2_foundation_source_guard ON COMMIT DROP AS
SELECT public.pcf_v1_enforcement_stamp() AS capture_stamp,public.pcf_v1_delivery_capabilities() AS capabilities,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('oid',catalog_proc.oid,'catalog',to_jsonb(catalog_proc),'definition',pg_get_functiondef(catalog_proc.oid)) ORDER BY catalog_proc.oid),'[]'::jsonb)
  FROM pg_proc catalog_proc JOIN pg_namespace catalog_ns ON catalog_ns.oid=catalog_proc.pronamespace
  WHERE catalog_ns.nspname='public' AND catalog_proc.prokind='f') AS old_functions;

-- Structural validation only: it cannot establish current source ownership or grant delivery.
CREATE FUNCTION public.pfd_v2_material_shape(p_material jsonb,p_course uuid,p_org uuid) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $pfd_material$
DECLARE v_ref jsonb;v_receipt jsonb;v_key text;v_uuid constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
 IF jsonb_typeof(p_material) IS DISTINCT FROM 'object' THEN RETURN false;END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_material))<>9
  OR NOT(p_material ?& ARRAY['course_id','marketplace_id','proposal_id','material_edition_sha256','organization_id','source_scope_generation','reference_vector_sha256','capture_enforcement_sha256','references']) THEN RETURN false;END IF;
 FOREACH v_key IN ARRAY ARRAY['course_id','marketplace_id','proposal_id','organization_id','source_scope_generation'] LOOP
  IF jsonb_typeof(p_material->v_key) IS DISTINCT FROM 'string' OR (p_material->>v_key)!~v_uuid THEN RETURN false;END IF;
 END LOOP;
 IF p_material->>'course_id' IS DISTINCT FROM p_course::text OR p_material->>'organization_id' IS DISTINCT FROM p_org::text
  OR p_org IS DISTINCT FROM '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid THEN RETURN false;END IF;
 FOREACH v_key IN ARRAY ARRAY['material_edition_sha256','reference_vector_sha256','capture_enforcement_sha256'] LOOP
  IF jsonb_typeof(p_material->v_key) IS DISTINCT FROM 'string' OR (p_material->>v_key)!~'^[0-9a-f]{64}$' THEN RETURN false;END IF;
 END LOOP;
 IF jsonb_typeof(p_material->'references') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 IF jsonb_array_length(p_material->'references')=0 THEN RETURN false;END IF;
 FOR v_ref IN SELECT value FROM jsonb_array_elements(p_material->'references') LOOP
  IF jsonb_typeof(v_ref) IS DISTINCT FROM 'object' THEN RETURN false;END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_ref))<>3 OR NOT(v_ref ?& ARRAY['reference_kind','reference_id','receipt']) THEN RETURN false;END IF;
  IF jsonb_typeof(v_ref->'reference_kind') IS DISTINCT FROM 'string' OR v_ref->>'reference_kind' NOT IN('course_document','lesson_attachment')
   OR jsonb_typeof(v_ref->'reference_id') IS DISTINCT FROM 'string' OR (v_ref->>'reference_id')!~v_uuid THEN RETURN false;END IF;
  v_receipt:=v_ref->'receipt';IF jsonb_typeof(v_receipt) IS DISTINCT FROM 'object' THEN RETURN false;END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_receipt))<>5 OR NOT(v_receipt ?& ARRAY['receipt_id','captured_edition_id','source_org_version_id','file_bytes_sha256','byte_length']) THEN RETURN false;END IF;
  FOREACH v_key IN ARRAY ARRAY['receipt_id','captured_edition_id'] LOOP
   IF jsonb_typeof(v_receipt->v_key) IS DISTINCT FROM 'string' OR (v_receipt->>v_key)!~v_uuid THEN RETURN false;END IF;
  END LOOP;
  IF v_receipt->'source_org_version_id' IS DISTINCT FROM 'null'::jsonb
   OR jsonb_typeof(v_receipt->'file_bytes_sha256') IS DISTINCT FROM 'string' OR (v_receipt->>'file_bytes_sha256')!~'^[0-9a-f]{64}$'
   OR jsonb_typeof(v_receipt->'byte_length') IS DISTINCT FROM 'number' THEN RETURN false;END IF;
  IF (v_receipt->>'byte_length')!~'^[1-9][0-9]{0,6}$' THEN RETURN false;END IF;
  IF (v_receipt->>'byte_length')::integer>8388608 THEN RETURN false;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_material->'references') item
  GROUP BY item->>'reference_kind',item->>'reference_id' HAVING count(*)<>1) THEN RETURN false;END IF;
 RETURN true;
END;$pfd_material$;

CREATE TABLE public.platform_private_file_delivery_v2_current(
 course_id uuid PRIMARY KEY,organization_id uuid NOT NULL CHECK(organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid),
 authorization_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision>=1),
 state text NOT NULL DEFAULT 'disabled' CHECK(state IN('disabled','enabled_for_validation')),
 material jsonb NOT NULL CHECK(public.pfd_v2_material_shape(material,course_id,organization_id)),
 audience text NOT NULL CHECK(audience='own_source'),audience_organization_id uuid NOT NULL CHECK(audience_organization_id=organization_id),
 delivery_protocol_sha256 text NOT NULL CHECK(delivery_protocol_sha256~'^[0-9a-f]{64}$'),
 purposes text[] NOT NULL CHECK(purposes=ARRAY['preview']::text[] OR purposes=ARRAY['download']::text[]
  OR purposes=ARRAY['preview','download']::text[] OR purposes=ARRAY['download','preview']::text[]),
 configured_by uuid NOT NULL,configured_at timestamptz NOT NULL,last_event_id uuid NOT NULL
);
CREATE TABLE public.platform_private_file_delivery_v2_events(
 id uuid PRIMARY KEY,course_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision>=1),actor_id uuid NOT NULL,request_id uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256~'^[0-9a-f]{64}$'),action text NOT NULL CHECK(action IN('authorize','disable')),
 authorization_id uuid NOT NULL,recorded_at timestamptz NOT NULL,reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 16384),
 before_snapshot jsonb CHECK(before_snapshot IS NULL OR jsonb_typeof(before_snapshot)='object'),
 after_snapshot jsonb NOT NULL CHECK(jsonb_typeof(after_snapshot)='object'),receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
 UNIQUE(actor_id,request_id),UNIQUE(course_id,revision)
);
ALTER TABLE public.platform_private_file_delivery_v2_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_private_file_delivery_v2_events ENABLE ROW LEVEL SECURITY;
-- No FKs to old records: old privacy/source/resource deletions cannot cascade into immutable history.
CREATE FUNCTION public.pfd_v2_history_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $pfd_history$
BEGIN RAISE EXCEPTION 'PFD_APPEND_ONLY_HISTORY' USING ERRCODE='55000';END;$pfd_history$;
CREATE TRIGGER pfd_v2_events_immutable BEFORE UPDATE OR DELETE ON public.platform_private_file_delivery_v2_events
 FOR EACH ROW EXECUTE FUNCTION public.pfd_v2_history_immutable();
CREATE TRIGGER pfd_v2_events_no_truncate BEFORE TRUNCATE ON public.platform_private_file_delivery_v2_events
 FOR EACH STATEMENT EXECUTE FUNCTION public.pfd_v2_history_immutable();

CREATE FUNCTION public.pfd_v2_rollout_lock(p_course uuid,p_exclusive boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $pfd_lock$
DECLARE v_key bigint;v_ok boolean;
BEGIN
 IF p_course IS NULL OR p_exclusive IS NULL THEN RAISE EXCEPTION 'PFD_SELECTION_REQUIRED' USING ERRCODE='22023';END IF;
 v_key:=hashtextextended('pfd-v2/course/'||p_course::text,0);
 IF p_exclusive THEN v_ok:=pg_try_advisory_xact_lock(v_key);ELSE v_ok:=pg_try_advisory_xact_lock_shared(v_key);END IF;
 IF NOT v_ok THEN RAISE EXCEPTION 'PFD_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END IF;
END;$pfd_lock$;

-- Fence only: returns unchanged V1 coarse mode, NEVER a V2 grant or bytes authority.
-- Intentionally no copycohort lookup/early return. The old COPY helper is unchanged.
CREATE FUNCTION public.pfd_v2_own_source_fence(p_course uuid,p_access_mode text,p_exclusive boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET lock_timeout='3s' AS $pfd_own_fence$
DECLARE v_actor uuid;v_org uuid;v_enrollments uuid[];v_fresh uuid[];v_mode jsonb;
BEGIN
 IF p_course IS NULL OR p_access_mode IS NULL OR p_access_mode NOT IN('learner','staff_preview') OR p_exclusive IS NULL THEN
  RAISE EXCEPTION 'PFD_SELECTION_REQUIRED' USING ERRCODE='22023';END IF;
 v_actor:=public.pcc_v1_actor(); -- genuine active Auth/profile + existing exclusive subject42007 TRY fence
 PERFORM 1 FROM auth.users account_row WHERE account_row.id=v_actor FOR SHARE OF account_row NOWAIT;
 PERFORM 1 FROM public.profiles profile_row WHERE profile_row.user_id=v_actor FOR SHARE OF profile_row NOWAIT;
 PERFORM 1 FROM public.user_roles role_row WHERE role_row.user_id=v_actor ORDER BY role_row.role FOR SHARE OF role_row NOWAIT;
 PERFORM 1 FROM public.org_staff staff_row WHERE staff_row.user_id=v_actor ORDER BY staff_row.organization_id FOR SHARE OF staff_row NOWAIT;
 PERFORM public.pfd_v2_rollout_lock(p_course,p_exclusive);
 -- Ordinary source writers already take exclusive own-edition TRY even on INSERT.
 -- Genuine actor is fenced; ordinary course rights are rechecked below. pcr_v2_enter is admin/UCwrite-only and is NOT used.
 PERFORM public.pcr_v2_lock(ARRAY[p_course],'shared','own-edition');
 SELECT course_row.organization_id INTO v_org FROM public.courses course_row WHERE course_row.id=p_course FOR SHARE OF course_row NOWAIT;
 IF v_org IS DISTINCT FROM '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid THEN
  RAISE EXCEPTION 'PFD_OWN_SOURCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
 IF p_access_mode='learner' THEN
  SELECT coalesce(array_agg(enrollment_row.id ORDER BY enrollment_row.id),'{}'::uuid[]) INTO v_enrollments
   FROM public.enrollments enrollment_row WHERE enrollment_row.user_id=v_actor AND enrollment_row.course_id=p_course;
  PERFORM public.pcc_v2_current_rights_keys('enrollment',v_enrollments,false);
  PERFORM 1 FROM public.enrollments enrollment_row WHERE enrollment_row.id=ANY(v_enrollments)
   AND enrollment_row.user_id=v_actor AND enrollment_row.course_id=p_course ORDER BY enrollment_row.id FOR SHARE OF enrollment_row NOWAIT;
  SELECT coalesce(array_agg(enrollment_row.id ORDER BY enrollment_row.id),'{}'::uuid[]) INTO v_fresh
   FROM public.enrollments enrollment_row WHERE enrollment_row.user_id=v_actor AND enrollment_row.course_id=p_course;
  IF v_fresh IS DISTINCT FROM v_enrollments THEN RAISE EXCEPTION 'PFD_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END IF;
  PERFORM 1 FROM public.uc_enrollment_withdrawal_states withdrawal_row WHERE withdrawal_row.enrollment_id=ANY(v_enrollments)
   ORDER BY withdrawal_row.enrollment_id FOR SHARE OF withdrawal_row NOWAIT;
  PERFORM 1 FROM public.uc_course_assignment_removal_events removal_row WHERE removal_row.enrollment_id=ANY(v_enrollments)
   ORDER BY removal_row.enrollment_id,removal_row.revision FOR SHARE OF removal_row NOWAIT;
  PERFORM 1 FROM public.lesson_progress progress_row JOIN public.lessons lesson_row ON lesson_row.id=progress_row.lesson_id
   WHERE progress_row.user_id=v_actor AND lesson_row.course_id=p_course ORDER BY progress_row.lesson_id FOR SHARE OF progress_row NOWAIT;
 END IF;
 PERFORM public.pcc_v1_actor();
 v_mode:=public.read_course_exact_file_delivery_mode(p_course,p_access_mode); -- unchanged normal course/paid/published-library predicates
 IF v_mode->>'actor_id' IS DISTINCT FROM v_actor::text OR v_mode->>'organization_id' IS DISTINCT FROM v_org::text
  OR v_mode->>'course_id' IS DISTINCT FROM p_course::text OR v_mode->>'access_mode' IS DISTINCT FROM p_access_mode THEN
  RAISE EXCEPTION 'PFD_CURRENT_SCOPE_REQUIRED' USING ERRCODE='42501';END IF;
 PERFORM public.pcc_v1_actor();
 RETURN v_mode;
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PFD_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';
END;$pfd_own_fence$;

DO $pfd_new_acl_and_post$
DECLARE v_signatures text[]:=ARRAY['public.pfd_v2_material_shape(jsonb,uuid,uuid)','public.pfd_v2_history_immutable()','public.pfd_v2_rollout_lock(uuid,boolean)','public.pfd_v2_own_source_fence(uuid,text,boolean)'];
 v_relations text[]:=ARRAY['public.platform_private_file_delivery_v2_current','public.platform_private_file_delivery_v2_events'];
 v_function_oids oid[]:='{}';v_relation_oids oid[]:='{}';v_name text;v_oid oid;v_grantee oid;v_role text;v_i integer;v_expected jsonb:=$pfd_new_bodies$[{"signature":"public.pfd_v2_material_shape(jsonb,uuid,uuid)","bodySha256":"598b4e07bd52233a84a28139c655b7e74bd3960eb96a44547e2fe3bbb98dba01","config":["search_path=pg_catalog, public, pg_temp"],"volatility":"i"},{"signature":"public.pfd_v2_history_immutable()","bodySha256":"20e6d88adde957c8e4568b5e2033dac6f0eb1c9df85234a1792b7b234a759ac8","config":["search_path=pg_catalog, public, pg_temp"],"volatility":"v"},{"signature":"public.pfd_v2_rollout_lock(uuid,boolean)","bodySha256":"0b9589cab5e0470442f0c8a01d8756ce926331c40f27a1ccd497f9b5dc00db7c","config":["search_path=pg_catalog, public, pg_temp","lock_timeout=3s"],"volatility":"v"},{"signature":"public.pfd_v2_own_source_fence(uuid,text,boolean)","bodySha256":"e074cbb41c3e48f48eafb78eab87e582633e3c624aec924f798adcefc8b0d1f9","config":["search_path=pg_catalog, public, pg_temp","lock_timeout=3s"],"volatility":"v"}]$pfd_new_bodies$::jsonb;
 v_entry jsonb;v_proc pg_proc;v_baseline record;v_old_now jsonb;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' THEN RAISE EXCEPTION 'PFD_OWNER_REQUIRED';END IF;
 FOREACH v_name IN ARRAY v_signatures LOOP
  v_oid:=to_regprocedure(v_name);
  IF NOT EXISTS(SELECT 1 FROM pg_proc catalog_proc WHERE catalog_proc.oid=v_oid AND catalog_proc.proowner='postgres'::regrole
   AND catalog_proc.pronamespace='public'::regnamespace AND catalog_proc.prokind='f') THEN RAISE EXCEPTION 'PFD_NEW_FUNCTION_IDENTITY_DRIFT';END IF;
  v_function_oids:=array_append(v_function_oids,v_oid);
 END LOOP;
 FOREACH v_name IN ARRAY v_relations LOOP
  v_oid:=to_regclass(v_name);
  IF NOT EXISTS(SELECT 1 FROM pg_class catalog_relation WHERE catalog_relation.oid=v_oid AND catalog_relation.relowner='postgres'::regrole
   AND catalog_relation.relnamespace='public'::regnamespace AND catalog_relation.relkind='r') THEN RAISE EXCEPTION 'PFD_NEW_TABLE_IDENTITY_DRIFT';END IF;
  v_relation_oids:=array_append(v_relation_oids,v_oid);
 END LOOP;
 FOR v_i IN 1..cardinality(v_signatures) LOOP
  FOR v_grantee IN SELECT DISTINCT privilege_row.grantee FROM pg_proc catalog_proc
   CROSS JOIN LATERAL aclexplode(coalesce(catalog_proc.proacl,acldefault('f',catalog_proc.proowner))) privilege_row
   WHERE catalog_proc.oid=v_function_oids[v_i] AND privilege_row.grantee<>catalog_proc.proowner LOOP
   IF v_grantee=0 THEN v_role:='PUBLIC';ELSE SELECT quote_ident(role_row.rolname) INTO v_role FROM pg_roles role_row WHERE role_row.oid=v_grantee;END IF;
   IF v_role IS NULL OR to_regprocedure(v_signatures[v_i])::oid IS DISTINCT FROM v_function_oids[v_i] THEN RAISE EXCEPTION 'PFD_NEW_FUNCTION_OID_OR_GRANTEE_DRIFT';END IF;
   EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s',v_signatures[v_i],v_role);
  END LOOP;
 END LOOP;
 FOR v_i IN 1..cardinality(v_relations) LOOP
  FOR v_grantee IN SELECT DISTINCT privilege_row.grantee FROM pg_class catalog_relation
   CROSS JOIN LATERAL aclexplode(coalesce(catalog_relation.relacl,acldefault('r',catalog_relation.relowner))) privilege_row
   WHERE catalog_relation.oid=v_relation_oids[v_i] AND privilege_row.grantee<>catalog_relation.relowner LOOP
   IF v_grantee=0 THEN v_role:='PUBLIC';ELSE SELECT quote_ident(role_row.rolname) INTO v_role FROM pg_roles role_row WHERE role_row.oid=v_grantee;END IF;
   IF v_role IS NULL OR to_regclass(v_relations[v_i])::oid IS DISTINCT FROM v_relation_oids[v_i] THEN RAISE EXCEPTION 'PFD_NEW_TABLE_OID_OR_GRANTEE_DRIFT';END IF;
   EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %s',v_relations[v_i],v_role);
  END LOOP;
 END LOOP;
 -- No public RPC exists in this foundation; every new function/table remains owner-only.
 IF EXISTS(SELECT 1 FROM pg_proc catalog_proc CROSS JOIN LATERAL aclexplode(coalesce(catalog_proc.proacl,acldefault('f',catalog_proc.proowner))) privilege_row
  WHERE catalog_proc.oid=ANY(v_function_oids) AND privilege_row.grantee<>catalog_proc.proowner)
 OR EXISTS(SELECT 1 FROM pg_class catalog_relation CROSS JOIN LATERAL aclexplode(coalesce(catalog_relation.relacl,acldefault('r',catalog_relation.relowner))) privilege_row
  WHERE catalog_relation.oid=ANY(v_relation_oids) AND privilege_row.grantee<>catalog_relation.relowner) THEN RAISE EXCEPTION 'PFD_NEW_PRIVATE_ACL_DRIFT';END IF;
 FOR v_entry IN SELECT value FROM jsonb_array_elements(v_expected) LOOP
  SELECT * INTO v_proc FROM pg_proc catalog_proc WHERE catalog_proc.oid=to_regprocedure(v_entry->>'signature');
  IF v_proc.proowner IS DISTINCT FROM 'postgres'::regrole OR NOT v_proc.prosecdef
   OR v_proc.provolatile::text IS DISTINCT FROM v_entry->>'volatility'
   OR to_jsonb(v_proc.proconfig) IS DISTINCT FROM v_entry->'config'
   OR encode(sha256(convert_to(v_proc.prosrc,'UTF8')),'hex') IS DISTINCT FROM v_entry->>'bodySha256' THEN
   RAISE EXCEPTION 'PFD_NEW_BODY_OR_ATTRIBUTES_DRIFT: %',v_entry->>'signature';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class catalog_relation WHERE catalog_relation.oid=ANY(v_relation_oids) AND NOT catalog_relation.relrowsecurity)
 OR EXISTS(SELECT 1 FROM pg_constraint catalog_constraint WHERE catalog_constraint.contype='f' AND(catalog_constraint.conrelid=ANY(v_relation_oids) OR catalog_constraint.confrelid=ANY(v_relation_oids))) THEN
  RAISE EXCEPTION 'PFD_NEW_TABLE_RLS_OR_NO_FK_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM public.platform_private_file_delivery_v2_current) OR EXISTS(SELECT 1 FROM public.platform_private_file_delivery_v2_events) THEN
  RAISE EXCEPTION 'PFD_DEFAULT_DENY_ZERO_ROWS_REQUIRED';END IF;
 SELECT * INTO v_baseline FROM pg_temp.pfd_v2_foundation_source_guard;
 IF NOT FOUND OR(SELECT count(*) FROM pg_temp.pfd_v2_foundation_source_guard)<>1 THEN RAISE EXCEPTION 'PFD_SAME_TX_BASELINE_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('oid',catalog_proc.oid,'catalog',to_jsonb(catalog_proc),'definition',pg_get_functiondef(catalog_proc.oid)) ORDER BY catalog_proc.oid),'[]'::jsonb)
 INTO v_old_now FROM pg_proc catalog_proc JOIN pg_namespace catalog_ns ON catalog_ns.oid=catalog_proc.pronamespace
 WHERE catalog_ns.nspname='public' AND catalog_proc.prokind='f' AND NOT(catalog_proc.oid=ANY(v_function_oids));
 IF v_old_now IS DISTINCT FROM v_baseline.old_functions OR public.pcf_v1_enforcement_stamp() IS DISTINCT FROM v_baseline.capture_stamp
  OR public.pcf_v1_delivery_capabilities() IS DISTINCT FROM v_baseline.capabilities THEN
  RAISE EXCEPTION 'PFD_OLD_FUNCTION_CAPTURE_OR_CAPABILITIES_CHANGED';END IF;
END;$pfd_new_acl_and_post$;

COMMIT;
