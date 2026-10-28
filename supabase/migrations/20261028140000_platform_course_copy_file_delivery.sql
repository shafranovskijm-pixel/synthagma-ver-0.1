-- SOURCE ONLY. Not installed or accepted. Requires the exact separately reviewed PCR + PCF R4.
-- Only NEW own-source copies made by the existing ordinary purchase transaction are affected.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public,pg_temp;

DO $preflight$
DECLARE r record;p record;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'PCC_TRUSTED_INSTALLER_REQUIRED';END IF;
 IF to_regclass('public.platform_course_copy_file_cohorts') IS NOT NULL OR to_regclass('public.platform_course_copy_file_bindings') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_proc catalog_proc JOIN pg_namespace n ON n.oid=catalog_proc.pronamespace WHERE n.nspname='public' AND(catalog_proc.proname LIKE 'pcc_v1_%' OR catalog_proc.proname IN('read_course_exact_file_delivery_context','read_copied_course_exact_file','read_course_exact_file_delivery_mode'))) THEN
  RAISE EXCEPTION 'PCC_PREEXISTING_OBJECTS_REVIEW_REQUIRED';END IF;
 -- These exact immediate, validated parent FKs are the INSERT participation proof for the module UPDATE row fence.
 FOR r IN SELECT * FROM(VALUES
 ('public.module_access_overrides','module_access_overrides_module_id_fkey','FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE'),
 ('public.module_access_schedules','module_access_schedules_module_id_fkey','FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE')
 )v(relation_name,constraint_name,constraint_definition) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass(r.relation_name)AND c.conname=r.constraint_name
   AND c.contype='f'AND NOT c.condeferrable AND NOT c.condeferred AND c.convalidated
   AND pg_get_constraintdef(c.oid)=r.constraint_definition)THEN RAISE EXCEPTION 'PCC_MODULE_FK_FENCE_PREIMAGE_DRIFT';END IF;
 END LOOP;
 IF to_regprocedure('public.pcf_v1_binding_state(uuid,text,uuid)') IS NULL OR to_regclass('public.platform_course_file_receipts') IS NULL
 OR to_regprocedure('public.pcf_v1_enforcement_stamp()') IS NULL OR to_regprocedure('public.pcr_v2_lock(uuid[],text,text,boolean)') IS NULL
 OR to_regprocedure('public.pcr_v2_manifest(uuid,uuid)') IS NULL OR to_regprocedure('public.pcr_v2_blockers(uuid,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'PCC_ACCEPTED_PCR_PCF_R4_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN('public','auth') AND(has_schema_privilege('anon',oid,'CREATE') OR has_schema_privilege('authenticated',oid,'CREATE'))) THEN
  RAISE EXCEPTION 'PCC_UNTRUSTED_SCHEMA';END IF;
 FOR r IN SELECT * FROM(VALUES
 ('public.account_deletion_access_allowed()','d2771ddc0a8ec9e0b9467fb7072313da89fa104664e206adbff53b40aeb76031',true),
 ('public.can_access_course_as_learner(uuid)','c331839711b91a3c1d332cb11f630cf8a717fc50de62ca79a279af76812ccbd9',true),
 ('public.can_access_course(uuid,text)','0e8df0e7c5f4af75144134f3137b4ef7923311e8bba9c502f227753be767b0e8',true),
 ('public.can_manage_course_files_org(uuid,text)','06c9a52d3dd34fdef7bfa94df81d2e6892ab0a38bd706d38950cf815fc7def5e',true),
 ('public.can_read_electronic_library_document(uuid)','ccf7cd2f66bdf75b1a7dac521f8162d883fdb4c6bf14e9c090977b36d59aca40',true),
 ('public.can_read_lesson_attachment(uuid)','ff1055812391017ac89a6911f2ec710e8fb949796b4b28c571959412799a81da',true),
 ('public.get_course_electronic_library_shell(uuid)','e4a9008592327f7e0e166bf762465c9d4768a1fb814d90a8873df4220e952f55',true),
 ('public.purchase_marketplace_course(uuid,uuid,text,integer,text)','4de50d3f8eb18c254172c3edac34c63087d5c8398119db45b595d90991acfe36',true),
 ('public.uc_enrollment_is_withdrawn(uuid)','565cb7347e955511694c82608d7c8985723b77462ba7a54822a05cda915c81ad',true),
 ('public._paid_20260922_course_read(uuid,boolean)','1639b82b90f6316afc59544960166e8ddcf79d58f4608360aca785167bd3e077',true),
 ('public._paid_20260922_lesson_read(uuid,boolean,boolean)','727aae1cdb02ed6544588d94c7a4096abb4110aaf8773b8f6891d1af37921779',true),
 ('public.paid_umk_20260922_can_read_assignment(uuid,uuid,boolean)','f4e4a5cae4c3182bb1f177f95503aee6205b74aa180aba8ec2d5b89fe2f667a1',true),
 ('public.paid_umk_20260922_can_read_document(uuid)','38537ece3ae9b4a6d3207a7ab0e0808605b3267960130f3184de3ec120b39f15',true),
 ('public.paid_umk_20260922_protect_assignment()','03b7f98380643f233003fa5a960ce267c534b830f6e069c732e539bd9eaf45c2',true),
 ('public.validate_course_library_assignment_scope()','37c7d3111ad621865d1606f7d0a414cb805e90b15e780ee18ac5f5effb862e55',true),
 ('public._paid_20260922_course_scope(uuid)','5c157baaa48b7601b0d10a55b4ed68cf6c173aa62ffefb5416a8c979c93a483b',true),
 ('public._paid_20260922_original_ids()','eefe323ef70a0199f117f8a0fc4322a090fd6ea96a9001840ee0f712df9f1c53',false),
 ('public.can_access_lesson(uuid,text)','d382a4b9c36e32124db4138e594b83c90e30f98ca00341adfd957fb04b72fbba',true),
 ('public.can_access_organization(uuid,text)','fd092f3f561990ca552a15220eaaf1d77a1521115b06103a7ce528cfb3bda54c',true),
 ('public.guard_marketplace_order_delivery()','c3ea69b5188cce1770248c7e51d74a85281ec898d55de0b0ef34c3111021b563',true),
 ('public.paid_umk_20260922_deliver()','a632931029760cc1566e9465f03e6eec28862cb6e35d775ff9604152d2be94a3',true),
 ('public.paid_umk_20260922_is_asset(uuid)','f3a6ee4d34f66fe3376c3743e2ec177d0f894f2cf2f82c5342c4f5dcaceebd55',true),
 ('public.paid_umk_20260922_valid_grant(uuid,uuid)','2c3763a03049bcd7b8a4639269db9377d2c02b426b58976350cf5d1ed7ff7dd4',true)
 )v(signature,definition_sha256,security_definer) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
  IF p.oid IS NULL OR pg_get_userbyid(p.proowner)<>'postgres' OR p.prosecdef IS DISTINCT FROM r.security_definer
   OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') IS DISTINCT FROM r.definition_sha256 THEN
   RAISE EXCEPTION 'PCC_CURRENT_COPY_OR_ACCESS_PREIMAGE_DRIFT: %',r.signature;END IF;
 END LOOP;
END;$preflight$;

-- SOURCE PROPOSAL: new-object-only ACL scope. Keep the original namespace guard.
-- Both scope/reset hunks must run in this original transaction; not an existing-object repair.
DO $new_acl_scope_copy$
DECLARE v_signature text;v_relation text;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' THEN RAISE EXCEPTION 'NEW_ACL_POSTGRES_OWNER_REQUIRED';END IF;
 FOREACH v_signature IN ARRAY ARRAY['public.pcc_v1_immutable()','public.pcc_v1_actor()','public.pcc_v1_source_context(uuid,uuid)','public.pcc_v1_module_ready(uuid,uuid,uuid)','public.pcc_v1_learner_lesson_ready(uuid,uuid,uuid)','public.pcc_v1_reference_row(uuid,text,uuid)','public.pcc_v1_authorized_reference(uuid,text,uuid,text,text)','public.pcc_v1_copy_binding_payload(uuid,jsonb)','public.read_course_exact_file_delivery_mode(uuid,text)','public.read_course_exact_file_delivery_context(uuid,text,uuid,text,text)','public.read_copied_course_exact_file(uuid,text,uuid,text,text,uuid,uuid)','public.pcc_v1_add_new_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb)','public.pcc_v1_seal_new_copy(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)']::text[] LOOP
  IF pg_catalog.to_regprocedure(v_signature) IS NOT NULL THEN RAISE EXCEPTION 'NEW_ACL_PREEXISTING_FUNCTION_REFUSED: %',v_signature;END IF;
 END LOOP;
 FOREACH v_relation IN ARRAY ARRAY['public.platform_course_copy_file_cohorts','public.platform_course_copy_file_bindings']::text[] LOOP
  IF pg_catalog.to_regclass(v_relation) IS NOT NULL THEN RAISE EXCEPTION 'NEW_ACL_PREEXISTING_RELATION_REFUSED: %',v_relation;END IF;
 END LOOP;
END;$new_acl_scope_copy$;

CREATE TABLE public.platform_course_copy_file_cohorts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid NOT NULL UNIQUE,
 organization_id uuid NOT NULL,source_course_id uuid NOT NULL,marketplace_id uuid NOT NULL,
 order_id uuid NOT NULL UNIQUE,actor_id uuid NOT NULL,copy_generation_id uuid NOT NULL UNIQUE,
 publication_id uuid NOT NULL REFERENCES public.platform_course_publication_review_events(id),
 publication_manifest_sha256 text NOT NULL CHECK(publication_manifest_sha256~'^[a-f0-9]{64}$'),
 source_scope_generation uuid NOT NULL,reference_count integer NOT NULL CHECK(reference_count>=0),
 reference_vector_sha256 text NOT NULL CHECK(reference_vector_sha256~'^[a-f0-9]{64}$'),
 lesson_order jsonb NOT NULL CHECK(jsonb_typeof(lesson_order)='array'),
 transaction_id text NOT NULL DEFAULT pg_current_xact_id()::text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(course_id<>source_course_id)
);
CREATE TABLE public.platform_course_copy_file_bindings(
 id uuid PRIMARY KEY,course_id uuid NOT NULL,organization_id uuid NOT NULL,copy_generation_id uuid NOT NULL,
 reference_kind text NOT NULL CHECK(reference_kind IN('course_document','lesson_attachment')),reference_id uuid NOT NULL,
 source_course_id uuid NOT NULL,source_reference_id uuid NOT NULL,
 receipt_id uuid NOT NULL REFERENCES public.platform_course_file_receipts(id),
 target_row_sha256 text NOT NULL CHECK(target_row_sha256~'^[a-f0-9]{64}$'),
 target_module_id uuid,target_lesson_id uuid,source_module_id uuid,source_lesson_id uuid,
 source_library_document_id uuid,source_reference_metadata jsonb NOT NULL,
 source_library_metadata jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(course_id,reference_kind,reference_id),UNIQUE(course_id,reference_kind,source_reference_id),
 CHECK(jsonb_typeof(source_reference_metadata)='object'),
 CHECK((reference_kind='lesson_attachment' AND target_lesson_id IS NOT NULL AND source_lesson_id IS NOT NULL)
    OR(reference_kind='course_document' AND target_lesson_id IS NULL AND source_lesson_id IS NULL))
);
-- No target/source-course FK cascade: ordinary deletion is still possible; private audit cannot be erased by it.
-- No legacy row is backfilled. Header absence is not inferred from a failed query.
ALTER TABLE public.platform_course_copy_file_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_course_copy_file_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_course_copy_file_cohorts,public.platform_course_copy_file_bindings FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pcc_v1_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN RAISE EXCEPTION 'PCC_APPEND_ONLY_COPY_HISTORY' USING ERRCODE='55000';END;$f$;
CREATE TRIGGER pcc_cohorts_immutable BEFORE UPDATE OR DELETE ON public.platform_course_copy_file_cohorts FOR EACH ROW EXECUTE FUNCTION public.pcc_v1_immutable();
CREATE TRIGGER pcc_cohorts_no_truncate BEFORE TRUNCATE ON public.platform_course_copy_file_cohorts FOR EACH STATEMENT EXECUTE FUNCTION public.pcc_v1_immutable();
CREATE TRIGGER pcc_bindings_immutable BEFORE UPDATE OR DELETE ON public.platform_course_copy_file_bindings FOR EACH ROW EXECUTE FUNCTION public.pcc_v1_immutable();
CREATE TRIGGER pcc_bindings_no_truncate BEFORE TRUNCATE ON public.platform_course_copy_file_bindings FOR EACH STATEMENT EXECUTE FUNCTION public.pcc_v1_immutable();

CREATE FUNCTION public.pcc_v1_actor() RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_user uuid:=auth.uid();BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'PCC_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 IF v_user IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.account_deletion_access_allowed()
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_user AND deleted_at IS NULL AND(banned_until IS NULL OR banned_until<=clock_timestamp()))
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_user AND blocked_at IS NULL AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'PCC_CURRENT_ACCOUNT_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(v_user::text,42007)) THEN
  RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 -- Fresh RC check after the account fence, including the profile that every role requires.
 IF auth.uid() IS DISTINCT FROM v_user OR auth.role() IS DISTINCT FROM 'authenticated'
 OR NOT public.account_deletion_access_allowed()
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_user AND deleted_at IS NULL AND(banned_until IS NULL OR banned_until<=clock_timestamp()))
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_user AND blocked_at IS NULL AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'PCC_CURRENT_ACCOUNT_REQUIRED' USING ERRCODE='42501';END IF;
 RETURN v_user;
END;$f$;

-- NULL means the existing pre-PCR legacy own-source acquisition; it is never returned for a stale PCR publication.
-- A customer-owned listing is not eligible to enter this function's frozen branch.
CREATE FUNCTION public.pcc_v1_source_context(p_source uuid,p_listing uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_actor uuid;v_published public.platform_course_publication_review_events;v_proposal public.platform_course_publication_review_events;
 v_review public.platform_course_publication_review_events;v_manifest jsonb;v_generation uuid;v_sha text;v_blockers text[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=p_source AND organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95') THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_course_publication_review_events WHERE marketplace_id=p_listing AND event_kind='publication_recorded') THEN RETURN NULL;END IF;
 v_actor:=public.pcc_v1_actor();
 PERFORM public.pcr_v2_lock(ARRAY[p_source],'shared','own-edition');
 PERFORM public.pcc_v1_actor();
 IF NOT EXISTS(SELECT 1 FROM public.courses c JOIN public.marketplace_courses m ON m.course_id=c.id
  WHERE c.id=p_source AND c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95' AND m.id=p_listing AND m.is_active AND m.is_validated
   AND(m.organization_id IS NULL OR m.organization_id=c.organization_id)) THEN
  RAISE EXCEPTION 'PCC_OWN_CURRENT_PUBLICATION_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT * INTO v_published FROM public.platform_course_publication_review_events WHERE marketplace_id=p_listing AND event_kind='publication_recorded' ORDER BY sequence DESC LIMIT 1;
 SELECT * INTO v_proposal FROM public.platform_course_publication_review_events WHERE marketplace_id=p_listing AND event_kind='submitted' ORDER BY sequence DESC LIMIT 1;
 SELECT * INTO v_review FROM public.platform_course_publication_review_events WHERE proposal_id=v_proposal.id AND event_kind='review_decided' ORDER BY sequence DESC LIMIT 1;
 v_manifest:=public.pcr_v2_manifest(p_source,p_listing);v_sha:=public.pcr_v2_sha(v_manifest);
 SELECT generation INTO v_generation FROM public.platform_course_publication_scope_revisions WHERE course_id=p_source AND active;
 IF v_published.id IS NULL OR v_proposal.id IS NULL OR v_review.id IS NULL OR v_generation IS NULL
 OR v_published.course_id IS DISTINCT FROM p_source OR v_published.proposal_id IS DISTINCT FROM v_proposal.id
 OR v_published.predecessor_event_id IS DISTINCT FROM v_review.id
 OR v_published.edition_sha256 IS DISTINCT FROM v_sha OR v_proposal.edition_sha256 IS DISTINCT FROM v_sha OR v_review.edition_sha256 IS DISTINCT FROM v_sha
 OR v_published.canonical_manifest IS DISTINCT FROM v_manifest
 OR v_review.review_payload->>'decision' IS DISTINCT FROM 'accepted_for_template_publication'
 OR(v_review.review_payload->>'next_review_at')::timestamptz IS NULL
 OR(v_review.review_payload->>'next_review_at')::timestamptz<=clock_timestamp() THEN
  RAISE EXCEPTION 'PCC_FROZEN_SOURCE_HOLD' USING ERRCODE='23514';END IF;
 v_blockers:=public.pcr_v2_blockers(p_source,v_proposal.review_payload);
 IF cardinality(v_blockers)>0 THEN RAISE EXCEPTION 'PCC_FROZEN_SOURCE_HOLD' USING ERRCODE='23514';END IF;
 RETURN jsonb_build_object('publication_id',v_published.id,'publication_manifest_sha256',v_sha,'source_scope_generation',v_generation,'actor_id',v_actor);
END;$f$;

CREATE FUNCTION public.pcc_v1_module_ready(p_course uuid,p_module uuid,p_actor uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_unlock timestamptz;BEGIN
 IF p_module IS NULL THEN RETURN true;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.course_modules WHERE id=p_module AND course_id=p_course) THEN RETURN false;END IF;
 -- Caller holds the selected module FOR UPDATE before entering this helper.
 -- Existing schedule/override UPDATE and DELETE need their own tuple fences; absent INSERT uses that parent FK fence.
 BEGIN
  PERFORM 1 FROM public.module_access_schedules s WHERE s.module_id=p_module FOR SHARE OF s NOWAIT;
  PERFORM 1 FROM public.module_access_overrides o WHERE o.module_id=p_module AND o.user_id=p_actor FOR SHARE OF o NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END;
 SELECT unlock_at INTO v_unlock FROM public.module_access_overrides WHERE module_id=p_module AND user_id=p_actor;
 IF FOUND THEN RETURN v_unlock IS NULL OR v_unlock<=clock_timestamp();END IF;
 IF EXISTS(SELECT 1 FROM public.module_access_schedules WHERE module_id=p_module AND course_id IS DISTINCT FROM p_course) THEN RETURN false;END IF;
 SELECT unlock_at INTO v_unlock FROM public.module_access_schedules WHERE module_id=p_module AND course_id=p_course;
 RETURN v_unlock IS NULL OR v_unlock<=clock_timestamp();
END;$f$;

-- Mirrors the current module-group, schedule/override, lesson lock and preceding-completion rules.
-- An ambiguous tied module or per-module lesson order is held, not silently given a different order.
CREATE FUNCTION public.pcc_v1_learner_lesson_ready(p_course uuid,p_lesson uuid,p_actor uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_lesson public.lessons;v_sequential boolean;v_prior record;v_current_found boolean:=false;
BEGIN
 SELECT * INTO v_lesson FROM public.lessons WHERE id=p_lesson AND course_id=p_course;
 IF v_lesson.id IS NULL OR v_lesson.is_locked OR NOT public.pcc_v1_module_ready(p_course,v_lesson.module_id,p_actor) THEN RETURN false;END IF;
 SELECT sequential_lessons INTO v_sequential FROM public.courses WHERE id=p_course;
 IF v_sequential IS DISTINCT FROM true THEN RETURN true;END IF;
 IF EXISTS(SELECT 1 FROM public.course_modules WHERE course_id=p_course GROUP BY order_index HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM public.lessons WHERE course_id=p_course GROUP BY module_id,order_index HAVING count(*)>1) THEN RETURN false;END IF;
 FOR v_prior IN SELECT l.id FROM public.lessons l LEFT JOIN public.course_modules m ON m.id=l.module_id AND m.course_id=p_course
  WHERE l.course_id=p_course ORDER BY m.order_index NULLS LAST,m.id NULLS LAST,l.order_index,l.id LOOP
  IF v_prior.id=p_lesson THEN v_current_found:=true;EXIT;END IF;
  IF NOT EXISTS(SELECT 1 FROM public.lesson_progress WHERE user_id=p_actor AND lesson_id=v_prior.id AND completed) THEN RETURN false;END IF;
 END LOOP;
 RETURN v_current_found;
END;$f$;

CREATE FUNCTION public.pcc_v1_reference_row(p_course uuid,p_kind text,p_reference uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_row jsonb;BEGIN
 IF p_kind='course_document' THEN SELECT to_jsonb(d)-ARRAY['created_at','updated_at'] INTO v_row FROM public.course_documents d WHERE d.id=p_reference AND d.course_id=p_course;
 ELSIF p_kind='lesson_attachment' THEN SELECT to_jsonb(a)-'created_at' INTO v_row FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id WHERE a.id=p_reference AND l.course_id=p_course;
 ELSE RAISE EXCEPTION 'PCC_REFERENCE_KIND_UNSUPPORTED' USING ERRCODE='22023';END IF;
 RETURN v_row;
END;$f$;

CREATE FUNCTION public.pcc_v1_authorized_reference(p_course uuid,p_kind text,p_reference uuid,p_access_mode text,p_purpose text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
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

CREATE FUNCTION public.pcc_v1_copy_binding_payload(p_binding uuid,p_access jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE b public.platform_course_copy_file_bindings;h public.platform_course_copy_file_cohorts;r public.platform_course_file_receipts;
 v_library public.library_documents;v_vector jsonb;
BEGIN
 SELECT * INTO b FROM public.platform_course_copy_file_bindings WHERE id=p_binding;
 SELECT * INTO h FROM public.platform_course_copy_file_cohorts WHERE course_id=b.course_id;
 SELECT * INTO r FROM public.platform_course_file_receipts WHERE id=b.receipt_id;
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

-- Course-wide classification is authoritative even with zero references; it never probes a first file.
CREATE FUNCTION public.read_course_exact_file_delivery_mode(p_course_id uuid,p_access_mode text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_actor uuid;v_course public.courses;h public.platform_course_copy_file_cohorts;v_base jsonb;v_marker jsonb;v_vector jsonb;
BEGIN
 v_actor:=public.pcc_v1_actor();
 IF p_course_id IS NULL OR p_access_mode IS NULL OR p_access_mode NOT IN('learner','staff_preview') THEN RAISE EXCEPTION 'PCC_SELECTION_REQUIRED' USING ERRCODE='22023';END IF;
 BEGIN SELECT * INTO v_course FROM public.courses WHERE id=p_course_id FOR SHARE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END;
 IF v_course.id IS NULL THEN RAISE EXCEPTION 'PCC_REFERENCE_UNAVAILABLE' USING ERRCODE='42501';END IF;
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

CREATE FUNCTION public.read_course_exact_file_delivery_context(p_course_id uuid,p_reference_kind text,p_reference_id uuid,p_access_mode text,p_purpose text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE a jsonb;h public.platform_course_copy_file_cohorts;b public.platform_course_copy_file_bindings;v_payload jsonb;v_base jsonb;
BEGIN
 a:=public.pcc_v1_authorized_reference(p_course_id,p_reference_kind,p_reference_id,p_access_mode,p_purpose);
 v_base:=jsonb_build_object('schema_version',1,'actor_id',a->'actor_id','organization_id',a->'organization_id','course_id',p_course_id,
  'reference_kind',p_reference_kind,'reference_id',p_reference_id,'access_mode',p_access_mode,'purpose',p_purpose);
 SELECT * INTO h FROM public.platform_course_copy_file_cohorts WHERE course_id=p_course_id;
 IF h.id IS NULL THEN
  -- Recheck at each reference request: a cached pre-publication legacy course decision is not authority for a new raw URL.
  IF EXISTS(SELECT 1 FROM public.courses c WHERE c.id=p_course_id AND c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid)
   AND EXISTS(SELECT 1 FROM public.platform_course_publication_review_events e WHERE e.course_id=p_course_id
    AND e.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'AND e.event_kind='publication_recorded')THEN
   RETURN v_base||jsonb_build_object('mode','frozen_required','state','hold','binding',NULL);
  END IF;
  RETURN v_base||jsonb_build_object('mode','legacy','state','legacy','binding',NULL);
 END IF;
 SELECT * INTO b FROM public.platform_course_copy_file_bindings WHERE course_id=p_course_id AND reference_kind=p_reference_kind AND reference_id=p_reference_id;
 v_payload:=public.pcc_v1_copy_binding_payload(b.id,a);
 RETURN v_base||jsonb_build_object('mode','frozen_required','state',CASE WHEN v_payload IS NULL THEN 'hold' ELSE 'bytes_sealed' END,'binding',v_payload);
END;$f$;

CREATE FUNCTION public.read_copied_course_exact_file(p_course_id uuid,p_reference_kind text,p_reference_id uuid,p_access_mode text,p_purpose text,p_binding_id uuid,p_copy_generation_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_context jsonb;r public.platform_course_file_receipts;v_recheck jsonb;
BEGIN
 v_context:=public.read_course_exact_file_delivery_context(p_course_id,p_reference_kind,p_reference_id,p_access_mode,p_purpose);
 IF p_binding_id IS NULL OR p_copy_generation_id IS NULL OR v_context->>'mode' IS DISTINCT FROM 'frozen_required'
 OR v_context->>'state' IS DISTINCT FROM 'bytes_sealed' OR v_context->'binding'->>'binding_id' IS DISTINCT FROM p_binding_id::text
 OR v_context->'binding'->>'copy_generation_id' IS DISTINCT FROM p_copy_generation_id::text THEN
  RAISE EXCEPTION 'PCC_FROZEN_FILE_HOLD' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.platform_course_file_receipts WHERE id=(v_context->'binding'->>'file_receipt_id')::uuid;
 IF r.id IS NULL OR r.byte_length<1 OR r.byte_length>8388608 OR octet_length(r.file_bytes)<>r.byte_length OR encode(sha256(r.file_bytes),'hex')<>r.file_sha256 THEN
  RAISE EXCEPTION 'PCC_FROZEN_FILE_HOLD' USING ERRCODE='42501';END IF;
 -- Fresh RC rights and association check immediately before returning private bytes.
 v_recheck:=public.read_course_exact_file_delivery_context(p_course_id,p_reference_kind,p_reference_id,p_access_mode,p_purpose);
 IF v_recheck IS DISTINCT FROM v_context THEN RAISE EXCEPTION 'PCC_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 RETURN v_context||jsonb_build_object('bytes_hex',encode(r.file_bytes,'hex'));
END;$f$;

-- Private construction only. The normal purchase function is the sole caller after the order delivery trigger.
CREATE FUNCTION public.pcc_v1_add_new_binding(p_course uuid,p_generation uuid,p_source uuid,p_listing uuid,p_kind text,p_source_reference uuid,p_target_reference uuid,p_context jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_source jsonb;v_target jsonb;v_binding jsonb;r public.platform_course_file_receipts;v_org uuid;
 v_source_lesson public.lessons;v_target_lesson public.lessons;v_library public.library_documents;
BEGIN
 v_source:=public.pcc_v1_reference_row(p_source,p_kind,p_source_reference);
 v_target:=public.pcc_v1_reference_row(p_course,p_kind,p_target_reference);
 SELECT organization_id INTO v_org FROM public.courses WHERE id=p_course AND source_course_id=p_source;
 IF v_source IS NULL OR v_target IS NULL OR v_org IS NULL THEN RAISE EXCEPTION 'PCC_EXACT_COPY_REFERENCE_REQUIRED' USING ERRCODE='23514';END IF;
 v_binding:=public.pcf_v1_binding_state(p_source,p_kind,p_source_reference);
 IF v_binding->>'state' IS DISTINCT FROM 'bytes_sealed' THEN RAISE EXCEPTION 'PCC_SOURCE_FILE_HOLD' USING ERRCODE='23514';END IF;
 SELECT * INTO r FROM public.platform_course_file_receipts WHERE id=(v_binding->>'receipt_id')::uuid;
 IF r.id IS NULL OR r.course_id<>p_source OR r.marketplace_id<>p_listing OR r.reference_kind<>p_kind OR r.reference_id<>p_source_reference
 OR r.scope_generation IS DISTINCT FROM(p_context->>'source_scope_generation')::uuid
 OR r.organization_id<>'4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
 OR r.byte_length<1 OR r.byte_length>8388608 OR octet_length(r.file_bytes)<>r.byte_length OR encode(sha256(r.file_bytes),'hex')<>r.file_sha256 THEN
  RAISE EXCEPTION 'PCC_SOURCE_FILE_HOLD' USING ERRCODE='23514';END IF;
 IF p_kind='lesson_attachment' THEN
  SELECT * INTO v_source_lesson FROM public.lessons WHERE id=(v_source->>'lesson_id')::uuid AND course_id=p_source;
  SELECT * INTO v_target_lesson FROM public.lessons WHERE id=(v_target->>'lesson_id')::uuid AND course_id=p_course;
  IF v_source_lesson.id IS NULL OR v_target_lesson.id IS NULL
   OR v_target->>'file_url' IS DISTINCT FROM 'urn:sintagma:course-file-binding:'||p_target_reference::text THEN
   RAISE EXCEPTION 'PCC_ATTACHMENT_MAPPING_REQUIRED' USING ERRCODE='23514';END IF;
 ELSE
  IF v_target->>'file_url' IS NOT NULL THEN RAISE EXCEPTION 'PCC_FROZEN_COPY_HAS_LIVE_POINTER' USING ERRCODE='23514';END IF;
  IF v_source->>'library_document_id' IS NOT NULL THEN
   SELECT * INTO v_library FROM public.library_documents WHERE id=(v_source->>'library_document_id')::uuid;
   IF v_library.id IS NULL OR v_library.organization_id IS DISTINCT FROM '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid THEN RAISE EXCEPTION 'PCC_SOURCE_LIBRARY_SCOPE_REQUIRED' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 INSERT INTO public.platform_course_copy_file_bindings(id,course_id,organization_id,copy_generation_id,reference_kind,reference_id,
  source_course_id,source_reference_id,receipt_id,target_row_sha256,target_module_id,target_lesson_id,source_module_id,source_lesson_id,
  source_library_document_id,source_reference_metadata,source_library_metadata)
 VALUES(p_target_reference,p_course,v_org,p_generation,p_kind,p_target_reference,p_source,p_source_reference,r.id,public.pcr_v2_sha(v_target),
  CASE WHEN p_kind='course_document' THEN(v_target->>'module_id')::uuid ELSE v_target_lesson.module_id END,v_target_lesson.id,
  CASE WHEN p_kind='course_document' THEN(v_source->>'module_id')::uuid ELSE v_source_lesson.module_id END,v_source_lesson.id,
  v_library.id,v_source,CASE WHEN v_library.id IS NOT NULL THEN to_jsonb(v_library)-ARRAY['created_at','updated_at'] END);
END;$f$;

CREATE FUNCTION public.pcc_v1_seal_new_copy(p_course uuid,p_source uuid,p_listing uuid,p_order uuid,p_context jsonb,p_documents jsonb,p_attachments jsonb,p_lesson_map jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_actor uuid;v_generation uuid:=gen_random_uuid();v_org uuid;v_doc record;v_attachment record;v_asset record;
 v_target uuid;v_count integer;v_source_doc uuid;v_documents jsonb:=p_documents;v_vector jsonb;v_lesson_order jsonb;v_recheck jsonb;
BEGIN
 v_actor:=public.pcc_v1_actor();
 v_recheck:=public.pcc_v1_source_context(p_source,p_listing);
 IF v_recheck IS NULL OR v_recheck IS DISTINCT FROM p_context OR(p_context->>'actor_id')::uuid IS DISTINCT FROM v_actor THEN
  RAISE EXCEPTION 'PCC_SOURCE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 SELECT c.organization_id INTO v_org FROM public.courses c JOIN public.marketplace_orders o ON o.id=p_order
 WHERE c.id=p_course AND c.source_course_id=p_source AND c.source_order_id=p_order AND o.buyer_organization_id=c.organization_id
  AND o.marketplace_course_id=p_listing AND o.buyer_type='organization' AND o.buyer_user_id=v_actor AND o.status IN('paid','completed') AND o.paid_at IS NOT NULL;
 IF v_org IS NULL OR EXISTS(SELECT 1 FROM public.platform_course_copy_file_cohorts WHERE course_id=p_course OR order_id=p_order) THEN
  RAISE EXCEPTION 'PCC_NEW_DELIVERED_COPY_REQUIRED' USING ERRCODE='23514';END IF;
 -- paid_umk_deliver has already run in the same transaction. A grant is never synthesized here.
 FOR v_asset IN SELECT * FROM public.paid_umk_20260922_assets WHERE source_course_id=p_source AND enabled ORDER BY id LOOP
  SELECT count(*),min(id::text)::uuid INTO v_count,v_source_doc FROM public.course_documents WHERE course_id=p_source AND library_document_id=v_asset.library_document_id;
  IF v_count<>1 THEN RAISE EXCEPTION 'PCC_UNCOVERED_OR_AMBIGUOUS_UMK_SOURCE_HOLD' USING ERRCODE='23514';END IF;
  SELECT count(*),min(id::text)::uuid INTO v_count,v_target FROM public.course_documents WHERE course_id=p_course AND library_document_id=v_asset.library_document_id;
  IF v_count<>1 OR NOT coalesce(public.paid_umk_20260922_valid_grant(p_course,v_asset.library_document_id),false) THEN
   RAISE EXCEPTION 'PCC_UMK_DELIVERY_HOLD' USING ERRCODE='23514';END IF;
  -- Preserve the source's restrictive audience/download flags on these NEW trigger-created rows.
  UPDATE public.course_documents target SET visible_to_students=target.visible_to_students AND source.visible_to_students,allow_download=source.allow_download
   FROM public.course_documents source WHERE target.id=v_target AND target.course_id=p_course AND source.id=v_source_doc AND source.course_id=p_source;
  v_documents:=v_documents||jsonb_build_object(v_source_doc::text,v_target::text);
 END LOOP;
 FOR v_doc IN SELECT * FROM public.course_documents WHERE course_id=p_source ORDER BY id LOOP
  IF NOT(v_documents ? v_doc.id::text) THEN RAISE EXCEPTION 'PCC_DOCUMENT_MAPPING_REQUIRED' USING ERRCODE='23514';END IF;
  v_target:=(v_documents->>v_doc.id::text)::uuid;
  PERFORM public.pcc_v1_add_new_binding(p_course,v_generation,p_source,p_listing,'course_document',v_doc.id,v_target,p_context);
 END LOOP;
 FOR v_attachment IN SELECT a.id,a.lesson_id FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id WHERE l.course_id=p_source ORDER BY a.id LOOP
  IF NOT(p_attachments ? v_attachment.id::text) OR NOT(p_lesson_map ? v_attachment.lesson_id::text) THEN RAISE EXCEPTION 'PCC_ATTACHMENT_MAPPING_REQUIRED' USING ERRCODE='23514';END IF;
  v_target:=(p_attachments->>v_attachment.id::text)::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.lesson_attachments WHERE id=v_target AND lesson_id=(p_lesson_map->>v_attachment.lesson_id::text)::uuid) THEN
   RAISE EXCEPTION 'PCC_ATTACHMENT_MAPPING_REQUIRED' USING ERRCODE='23514';END IF;
  PERFORM public.pcc_v1_add_new_binding(p_course,v_generation,p_source,p_listing,'lesson_attachment',v_attachment.id,v_target,p_context);
 END LOOP;
 SELECT count(*) INTO v_count FROM public.platform_course_copy_file_bindings WHERE course_id=p_course AND copy_generation_id=v_generation;
 IF v_count<>(SELECT count(*) FROM public.course_documents WHERE course_id=p_course)
   +(SELECT count(*) FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id WHERE l.course_id=p_course) THEN
  RAISE EXCEPTION 'PCC_COMPLETE_REFERENCE_VECTOR_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',x.reference_kind,'reference',x.reference_id,'binding',x.id,'receipt',x.receipt_id,'target_sha256',x.target_row_sha256) ORDER BY x.reference_kind,x.reference_id),'[]')
 INTO v_vector FROM public.platform_course_copy_file_bindings x WHERE x.course_id=p_course AND x.copy_generation_id=v_generation;
 SELECT coalesce(jsonb_agg(l.id ORDER BY m.order_index NULLS LAST,m.id NULLS LAST,l.order_index,l.id),'[]') INTO v_lesson_order
  FROM public.lessons l LEFT JOIN public.course_modules m ON m.id=l.module_id AND m.course_id=p_course WHERE l.course_id=p_course;
 INSERT INTO public.platform_course_copy_file_cohorts(course_id,organization_id,source_course_id,marketplace_id,order_id,actor_id,copy_generation_id,
  publication_id,publication_manifest_sha256,source_scope_generation,reference_count,reference_vector_sha256,lesson_order)
 VALUES(p_course,v_org,p_source,p_listing,p_order,v_actor,v_generation,(p_context->>'publication_id')::uuid,p_context->>'publication_manifest_sha256',
  (p_context->>'source_scope_generation')::uuid,jsonb_array_length(v_vector),public.pcr_v2_sha(v_vector),v_lesson_order);
END;$f$;

-- Current purchase preimage receives exactly the seven inverse-recorded hooks.
CREATE OR REPLACE FUNCTION public.purchase_marketplace_course(p_marketplace_course_id uuid, p_target_organization_id uuid, p_buyer_type text DEFAULT 'organization'::text, p_students_count integer DEFAULT 1, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_listing public.marketplace_courses%ROWTYPE;
  v_source public.courses%ROWTYPE;
  v_order_id uuid;
  v_new_course_id uuid;
  v_new_module_id uuid;
  v_new_lesson_id uuid;
  v_price numeric;
  v_balance numeric;
  v_module_map jsonb := '{}'::jsonb;
  v_module record;
  v_lesson record;
  v_frozen_context jsonb;
  v_document record;
  v_attachment record;
  v_new_reference_id uuid;
  v_document_map jsonb := '{}'::jsonb;
  v_attachment_map jsonb := '{}'::jsonb;
  v_lesson_map jsonb := '{}'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_marketplace_course_id IS NULL OR p_target_organization_id IS NULL THEN
    RAISE EXCEPTION 'Marketplace course and target organization are required'
      USING ERRCODE = '22023';
  END IF;

  -- The current product delivers a cloned course to an organization. A future
  -- student-specific delivery flow must use its own atomic enrollment RPC.
  IF p_buyer_type IS DISTINCT FROM 'organization' THEN
    RAISE EXCEPTION 'Only organization marketplace purchases are supported'
      USING ERRCODE = '22023';
  END IF;

  IF p_students_count IS NULL OR p_students_count < 1 THEN
    RAISE EXCEPTION 'Students count must be positive' USING ERRCODE = '22023';
  END IF;

  -- This helper excludes ordinary students while preserving platform admins,
  -- organization owners and org_staff with courses.write.
  IF NOT public.can_manage_course_files_org(
    p_target_organization_id,
    'courses.write'
  ) THEN
    RAISE EXCEPTION 'Insufficient permission to purchase a course for this organization'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize balance changes for this buyer before the quota trigger locks
  -- the same organization row. This preserves the global organization-row
  -- first lock order and prevents two concurrent purchases overspending it.
  SELECT o.balance
    INTO v_balance
  FROM public.organizations o
  WHERE o.id = p_target_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target organization not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT mc.*
    INTO v_listing
  FROM public.marketplace_courses mc
  WHERE mc.id = p_marketplace_course_id
    AND mc.is_active = true
    AND mc.is_validated = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active marketplace course not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.*
    INTO v_source
  FROM public.courses c
  WHERE c.id = v_listing.course_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marketplace source course not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_listing.organization_id IS DISTINCT FROM v_source.organization_id
     AND NOT (
       v_listing.organization_id IS NULL
       AND v_source.organization_id = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
     )
  THEN
    RAISE EXCEPTION 'Marketplace listing tenant does not own its source course'
      USING ERRCODE = 'P0002';
  END IF;

  -- Only the current own source with a PCR publication enters frozen-copy construction.
  -- The original buyer-organization first row lock and all financial branches remain unchanged.
  IF v_source.organization_id = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
     AND EXISTS (SELECT 1 FROM public.platform_course_publication_review_events
       WHERE marketplace_id = v_listing.id AND event_kind = 'publication_recorded')
  THEN
    v_frozen_context := public.pcc_v1_source_context(v_source.id, v_listing.id);
  END IF;

  -- Never trust a client-supplied price.
  v_price := v_listing.price_organization;

  IF v_price < 0 THEN
    RAISE EXCEPTION 'Marketplace price cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'Insufficient organization balance'
      USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.marketplace_orders (
    marketplace_course_id,
    buyer_user_id,
    buyer_organization_id,
    buyer_type,
    status,
    price,
    students_count,
    notes,
    payment_method,
    paid_at
  )
  VALUES (
    v_listing.id,
    v_user_id,
    p_target_organization_id,
    'organization',
    'pending',
    v_price,
    p_students_count,
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    'balance',
    NULL
  )
  RETURNING id INTO v_order_id;

  IF v_price > 0 THEN
    INSERT INTO public.balance_transactions (
      organization_id,
      amount,
      type,
      description,
      related_order_id,
      performed_by
    )
    VALUES (
      p_target_organization_id,
      -v_price,
      'marketplace_purchase',
      'Покупка курса «' || v_source.title || '»',
      v_order_id,
      v_user_id
    );

    UPDATE public.organizations
    SET balance = balance - v_price
    WHERE id = p_target_organization_id;
  END IF;

  INSERT INTO public.courses (
    accent_color,
    allow_materials_download,
    allow_video_seek,
    catalog_order,
    category_id,
    completion_notify_emails,
    cover_image_url,
    default_access_days,
    description,
    duration,
    frdo_document_type,
    frdo_duration_hours,
    frdo_education_form,
    frdo_financing_source,
    frdo_profession_name,
    frdo_professional_area,
    frdo_program_type,
    frdo_qualification_name,
    frdo_qualification_rank,
    frdo_specialty_group,
    generation_progress,
    hidden_from_catalog,
    is_published,
    landing_content,
    notify_on_completion,
    organization_id,
    price,
    reminder_advance_days,
    require_enrollment_approval,
    retraining_period_months,
    sequential_lessons,
    skip_video_identification,
    slug,
    source_course_id,
    source_order_id,
    title,
    training_form
  )
  VALUES (
    v_source.accent_color,
    v_source.allow_materials_download,
    v_source.allow_video_seek,
    v_source.catalog_order,
    NULL,
    -- Extra notification recipients belong to the seller tenant. The buyer
    -- may configure its own recipients without receiving seller addresses.
    NULL,
    v_source.cover_image_url,
    v_source.default_access_days,
    v_source.description,
    v_source.duration,
    v_source.frdo_document_type,
    v_source.frdo_duration_hours,
    v_source.frdo_education_form,
    v_source.frdo_financing_source,
    v_source.frdo_profession_name,
    v_source.frdo_professional_area,
    v_source.frdo_program_type,
    v_source.frdo_qualification_name,
    v_source.frdo_qualification_rank,
    v_source.frdo_specialty_group,
    v_source.generation_progress,
    v_source.hidden_from_catalog,
    v_source.is_published,
    v_source.landing_content,
    v_source.notify_on_completion,
    p_target_organization_id,
    v_source.price,
    v_source.reminder_advance_days,
    v_source.require_enrollment_approval,
    v_source.retraining_period_months,
    v_source.sequential_lessons,
    v_source.skip_video_identification,
    NULL,
    v_source.id,
    v_order_id,
    v_source.title,
    v_source.training_form
  )
  RETURNING id INTO v_new_course_id;

  IF v_frozen_context IS NULL THEN
  INSERT INTO public.course_documents (
    course_id,
    name,
    type,
    description,
    file_url
  )
  SELECT
    v_new_course_id,
    d.name,
    d.type,
    d.description,
    d.file_url
  FROM public.course_documents d
  WHERE d.course_id = v_source.id;
  END IF;

  FOR v_module IN
    SELECT m.id, m.title, m.order_index
    FROM public.course_modules m
    WHERE m.course_id = v_source.id
    ORDER BY m.order_index, m.id
  LOOP
    INSERT INTO public.course_modules (course_id, title, order_index)
    VALUES (v_new_course_id, v_module.title, v_module.order_index)
    RETURNING id INTO v_new_module_id;

    v_module_map := v_module_map || jsonb_build_object(
      v_module.id::text,
      v_new_module_id::text
    );
  END LOOP;

  IF v_frozen_context IS NOT NULL THEN
    FOR v_document IN SELECT d.* FROM public.course_documents d
      WHERE d.course_id = v_source.id ORDER BY d.sort_order, d.id
    LOOP
      -- Canonical paid UMK assignments are created by the existing settled-order trigger.
      IF v_document.library_document_id IS NOT NULL
         AND public.paid_umk_20260922_is_asset(v_document.library_document_id) THEN CONTINUE; END IF;
      IF v_document.module_id IS NOT NULL AND NOT (v_module_map ? v_document.module_id::text) THEN
        RAISE EXCEPTION 'PCC_DOCUMENT_MODULE_MAPPING_REQUIRED' USING ERRCODE = '23514';
      END IF;
      v_new_reference_id := gen_random_uuid();
      INSERT INTO public.course_documents(id, course_id, name, type, description, file_url,
        library_document_id, module_id, library_category, sort_order, visible_to_students, allow_download)
      VALUES(v_new_reference_id, v_new_course_id, v_document.name, v_document.type, v_document.description, NULL,
        NULL, CASE WHEN v_document.module_id IS NOT NULL THEN (v_module_map ->> v_document.module_id::text)::uuid END,
        v_document.library_category, v_document.sort_order, v_document.visible_to_students, v_document.allow_download);
      -- Generic source-library provenance remains in the private snapshot, never a foreign-tenant FK.
      v_document_map := v_document_map || jsonb_build_object(v_document.id::text, v_new_reference_id::text);
    END LOOP;
  END IF;

  -- module_access_schedules/module_access_overrides are intentionally reset.
  -- Their absolute dates and per-user exceptions belong to the seller tenant;
  -- the buyer configures a new schedule for the cloned modules when needed.
  FOR v_lesson IN
    SELECT l.*
    FROM public.lessons l
    WHERE l.course_id = v_source.id
    ORDER BY l.order_index, l.id
  LOOP
    IF v_lesson.module_id IS NOT NULL
       AND NOT (v_module_map ? v_lesson.module_id::text)
    THEN
      RAISE EXCEPTION 'Marketplace source lesson % references a module outside the source course',
        v_lesson.id
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.lessons (
      ai_avatar_allow_interruptions,
      ai_avatar_greeting,
      ai_avatar_image_url,
      ai_avatar_language,
      ai_avatar_llm_model,
      ai_avatar_llm_provider,
      ai_avatar_model,
      ai_avatar_name,
      ai_avatar_session_minutes,
      ai_avatar_stt_model,
      ai_avatar_stt_provider,
      ai_avatar_style,
      ai_avatar_subject,
      ai_avatar_system_prompt,
      ai_avatar_tts_provider,
      ai_avatar_tts_voice,
      ai_avatar_voice_id,
      content,
      course_id,
      is_locked,
      module_id,
      order_index,
      test_max_attempts,
      test_passing_score,
      test_questions_count,
      test_questions_to_show,
      test_show_answers,
      title,
      type
    )
    VALUES (
      v_lesson.ai_avatar_allow_interruptions,
      v_lesson.ai_avatar_greeting,
      v_lesson.ai_avatar_image_url,
      v_lesson.ai_avatar_language,
      v_lesson.ai_avatar_llm_model,
      v_lesson.ai_avatar_llm_provider,
      v_lesson.ai_avatar_model,
      v_lesson.ai_avatar_name,
      v_lesson.ai_avatar_session_minutes,
      v_lesson.ai_avatar_stt_model,
      v_lesson.ai_avatar_stt_provider,
      v_lesson.ai_avatar_style,
      v_lesson.ai_avatar_subject,
      v_lesson.ai_avatar_system_prompt,
      v_lesson.ai_avatar_tts_provider,
      v_lesson.ai_avatar_tts_voice,
      v_lesson.ai_avatar_voice_id,
      v_lesson.content,
      v_new_course_id,
      v_lesson.is_locked,
      CASE
        WHEN v_lesson.module_id IS NULL THEN NULL
        ELSE (v_module_map ->> v_lesson.module_id::text)::uuid
      END,
      v_lesson.order_index,
      v_lesson.test_max_attempts,
      v_lesson.test_passing_score,
      v_lesson.test_questions_count,
      v_lesson.test_questions_to_show,
      v_lesson.test_show_answers,
      v_lesson.title,
      v_lesson.type
    )
    RETURNING id INTO v_new_lesson_id;
    IF v_frozen_context IS NOT NULL THEN
      v_lesson_map := v_lesson_map || jsonb_build_object(v_lesson.id::text, v_new_lesson_id::text);
    END IF;

    INSERT INTO public.test_questions (
      lesson_id,
      question,
      options,
      correct_answer,
      explanation,
      image_url,
      is_bank_question,
      order_index
    )
    SELECT
      v_new_lesson_id,
      q.question,
      q.options,
      q.correct_answer,
      q.explanation,
      q.image_url,
      q.is_bank_question,
      q.order_index
    FROM public.test_questions q
    WHERE q.lesson_id = v_lesson.id;

    IF v_frozen_context IS NULL THEN
    INSERT INTO public.lesson_attachments (
      lesson_id,
      name,
      file_url,
      file_type,
      file_size,
      category,
      order_index
    )
    SELECT
      v_new_lesson_id,
      a.name,
      a.file_url,
      a.file_type,
      a.file_size,
      a.category,
      a.order_index
    FROM public.lesson_attachments a
    WHERE a.lesson_id = v_lesson.id;
    ELSE
      FOR v_attachment IN SELECT a.* FROM public.lesson_attachments a WHERE a.lesson_id = v_lesson.id ORDER BY a.order_index, a.id
      LOOP
        v_new_reference_id := gen_random_uuid();
        INSERT INTO public.lesson_attachments(id, lesson_id, name, file_url, file_type, file_size, category, order_index)
        VALUES(v_new_reference_id, v_new_lesson_id, v_attachment.name,
          'urn:sintagma:course-file-binding:' || v_new_reference_id::text, v_attachment.file_type, v_attachment.file_size, v_attachment.category, v_attachment.order_index);
        v_attachment_map := v_attachment_map || jsonb_build_object(v_attachment.id::text, v_new_reference_id::text);
      END LOOP;
    END IF;
  END LOOP;

  UPDATE public.marketplace_orders
  SET status = 'paid', paid_at = now()
  WHERE id = v_order_id;

  IF v_frozen_context IS NOT NULL THEN
    PERFORM public.pcc_v1_seal_new_copy(v_new_course_id, v_source.id, v_listing.id, v_order_id,
      v_frozen_context, v_document_map, v_attachment_map, v_lesson_map);
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'course_id', v_new_course_id,
    'price', v_price
  );
END
$function$
;

-- SOURCE PROPOSAL: strip inherited ACL entries only from the fixed objects created above.
-- Existing expected GRANT statements and strict postflight guards remain after this block.
DO $new_acl_reset_copy$
DECLARE
 v_signatures text[]:=ARRAY['public.pcc_v1_immutable()','public.pcc_v1_actor()','public.pcc_v1_source_context(uuid,uuid)','public.pcc_v1_module_ready(uuid,uuid,uuid)','public.pcc_v1_learner_lesson_ready(uuid,uuid,uuid)','public.pcc_v1_reference_row(uuid,text,uuid)','public.pcc_v1_authorized_reference(uuid,text,uuid,text,text)','public.pcc_v1_copy_binding_payload(uuid,jsonb)','public.read_course_exact_file_delivery_mode(uuid,text)','public.read_course_exact_file_delivery_context(uuid,text,uuid,text,text)','public.read_copied_course_exact_file(uuid,text,uuid,text,text,uuid,uuid)','public.pcc_v1_add_new_binding(uuid,uuid,uuid,uuid,text,uuid,uuid,jsonb)','public.pcc_v1_seal_new_copy(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)']::text[];
 v_relations text[]:=ARRAY['public.platform_course_copy_file_cohorts','public.platform_course_copy_file_bindings']::text[];
 v_kinds text[]:=ARRAY['r','r']::text[];
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
END;$new_acl_reset_copy$;

-- Every construction/read helper is private; only the two bounded ordinary-context RPCs are exposed.
DO $acl$ DECLARE r record;BEGIN
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'pcc_v1_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.oid::regprocedure);
  EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',r.oid::regprocedure);
 END LOOP;
END;$acl$;
REVOKE ALL ON FUNCTION public.read_course_exact_file_delivery_context(uuid,text,uuid,text,text),public.read_copied_course_exact_file(uuid,text,uuid,text,text,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_course_exact_file_delivery_context(uuid,text,uuid,text,text),public.read_copied_course_exact_file(uuid,text,uuid,text,text,uuid,uuid) TO authenticated;
ALTER FUNCTION public.read_course_exact_file_delivery_context(uuid,text,uuid,text,text) OWNER TO postgres;
ALTER FUNCTION public.read_copied_course_exact_file(uuid,text,uuid,text,text,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_course_exact_file_delivery_mode(uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_course_exact_file_delivery_mode(uuid,text) TO authenticated;
ALTER FUNCTION public.read_course_exact_file_delivery_mode(uuid,text) OWNER TO postgres;
-- purchase_marketplace_course keeps its existing signature, ACL, financial and notification behavior.
-- No PCF delivery capability function or publication claim is changed here.
DO $postflight$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(t.relacl,acldefault('r',t.relowner)))a
  WHERE n.nspname='public' AND t.relname IN('platform_course_copy_file_cohorts','platform_course_copy_file_bindings') AND a.grantee<>t.relowner) THEN
  RAISE EXCEPTION 'PCC_PRIVATE_STORE_ACL_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
  WHERE n.nspname='public' AND(p.proname LIKE 'pcc_v1_%' OR p.proname IN('read_course_exact_file_delivery_context','read_copied_course_exact_file','read_course_exact_file_delivery_mode'))
   AND a.grantee<>p.proowner AND NOT(p.proname IN('read_course_exact_file_delivery_context','read_copied_course_exact_file','read_course_exact_file_delivery_mode') AND a.grantee='authenticated'::regrole)) THEN
  RAISE EXCEPTION 'PCC_PRIVATE_FUNCTION_ACL_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM public.platform_course_copy_file_cohorts) OR EXISTS(SELECT 1 FROM public.platform_course_copy_file_bindings) THEN
  RAISE EXCEPTION 'PCC_INSTALL_MUST_NOT_CREATE_CLIENT_HISTORY';END IF;
END;$postflight$;
COMMIT;
