-- SOURCE CANDIDATE ONLY. NOT APPLIED, PARSED, TESTED OR RELEASE-READY.
-- PROG012 server core. No accepted decisions or legacy listing backfill.
-- Source review gate: compatible client child writers share parent locks.
-- Concurrent parent mutations can require ordinary retries; existing RLS stays.
-- V2 parent-row NOWAIT and private MVCC barriers; V1 remains immutable.
-- Own promotion requires new RC RPC and private invocation context.
-- HOLD until the new UI adapter, full runtime and immutable file-byte gates.
-- External file editions remain UNCONFIRMED. No runtime claim.
BEGIN;

-- DDL-only bounded maintenance footprint, not a runtime global lock.
SET LOCAL lock_timeout='3s';
LOCK TABLE public.courses,public.course_modules,public.lessons,public.test_questions,public.lesson_attachments,public.course_documents,public.library_documents,public.marketplace_courses IN SHARE ROW EXCLUSIVE MODE;

DO $f$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'pcr_v2_%') THEN
  RAISE EXCEPTION 'PCR_EXISTING_INTERNAL_NAMESPACE_REQUIRES_REVIEW';
 END IF;
END $f$;

-- SOURCE PROPOSAL: new-object-only ACL scope. Keep the original namespace guard.
-- Both scope/reset hunks must run in this original transaction; not an existing-object repair.
DO $new_acl_scope_core$
DECLARE v_signature text;v_relation text;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres' THEN RAISE EXCEPTION 'NEW_ACL_POSTGRES_OWNER_REQUIRED';END IF;
 FOREACH v_signature IN ARRAY ARRAY['public.pcr_v2_sha(jsonb)','public.pcr_v2_actor(boolean)','public.pcr_v2_resource_ids(uuid)','public.pcr_v2_lock(uuid[],text,text,boolean)','public.pcr_v2_touch_scope(uuid,text)','public.pcr_v2_touch_library(uuid[])','public.pcr_v2_parent_courses(uuid[],boolean)','public.pcr_v2_parent_lesson(uuid,boolean,boolean)','public.pcr_v2_library_parents(uuid[])','public.pcr_v2_claim_touch(uuid)','public.pcr_v2_delete_witness_cleanup()','public.pcr_v2_enter(uuid)','public.pcr_v2_manifest(uuid,uuid)','public.pcr_v2_blockers(uuid,jsonb)','public.pcr_v2_readiness(uuid)','public.read_platform_course_publication_readiness(uuid)','public.submit_platform_course_publication_proposal(uuid,text,jsonb,uuid)','public.record_platform_course_publication_review(uuid,uuid,text,text,text,timestamptz,uuid)','public.pcr_v2_source_scopes(text,jsonb)','public.pcr_v2_source_before()','public.pcr_v2_own_entry_invalidate()','public.pcr_v2_library_after()','public.pcr_v2_listing_before()','public.pcr_v2_listing_after()','public.publish_platform_course_proposal(uuid,uuid,text,uuid)','public.pcr_v2_final_claim()','public.pcr_v2_immutable()','public.pcr_v2_source_truncate()']::text[] LOOP
  IF pg_catalog.to_regprocedure(v_signature) IS NOT NULL THEN RAISE EXCEPTION 'NEW_ACL_PREEXISTING_FUNCTION_REFUSED: %',v_signature;END IF;
 END LOOP;
 FOREACH v_relation IN ARRAY ARRAY['public.platform_course_publication_review_events','public.platform_course_publication_invocations','public.platform_course_publication_scope_revisions','public.platform_course_publication_library_revisions','public.platform_course_publication_deleted_parents','public.platform_course_publication_review_events_sequence_seq']::text[] LOOP
  IF pg_catalog.to_regclass(v_relation) IS NOT NULL THEN RAISE EXCEPTION 'NEW_ACL_PREEXISTING_RELATION_REFUSED: %',v_relation;END IF;
 END LOOP;
END;$new_acl_scope_core$;

CREATE TABLE public.platform_course_publication_review_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  organization_id uuid NOT NULL CHECK (organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'),
  marketplace_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('submitted','review_decided','publication_recorded')),
  edition_sha256 text NOT NULL CHECK (edition_sha256 ~ '^[a-f0-9]{64}$'),
  canonical_manifest jsonb NOT NULL,
  review_payload jsonb NOT NULL,
  predecessor_event_id uuid REFERENCES public.platform_course_publication_review_events(id),
  actor_id uuid NOT NULL,
  transaction_id text NOT NULL DEFAULT pg_current_xact_id()::text,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  UNIQUE(actor_id,request_id),
  CHECK (jsonb_typeof(canonical_manifest)='object' AND jsonb_typeof(review_payload)='object'),
  CHECK (octet_length(canonical_manifest::text)<=2097152 AND octet_length(review_payload::text)<=262144)
);
CREATE INDEX platform_course_publication_events_listing_sequence
  ON public.platform_course_publication_review_events(marketplace_id,sequence DESC);
ALTER TABLE public.platform_course_publication_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_course_publication_review_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.platform_course_publication_review_events_sequence_seq FROM PUBLIC,anon,authenticated,service_role;

-- Server-only invocation context, never a client-settable GUC. All rows are
-- created and consumed in one RPC transaction and are absent after success.
CREATE TABLE public.platform_course_publication_invocations (
  transaction_id text NOT NULL,
  marketplace_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  edition_sha256 text NOT NULL,
  request_id uuid NOT NULL,
  request_sha256 text NOT NULL,
  PRIMARY KEY(transaction_id,marketplace_id)
);
ALTER TABLE public.platform_course_publication_invocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_course_publication_invocations FROM PUBLIC,anon,authenticated,service_role;


-- Private MVCC coordination metadata; no FK/cascade may rewrite review history.
CREATE TABLE public.platform_course_publication_scope_revisions (
 course_id uuid PRIMARY KEY, generation uuid NOT NULL DEFAULT gen_random_uuid(),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), active boolean NOT NULL,
 touched_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.platform_course_publication_library_revisions (
 library_document_id uuid PRIMARY KEY, revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 touched_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.platform_course_publication_deleted_parents (
 transaction_id text NOT NULL, parent_table text NOT NULL CHECK(parent_table IN ('courses','lessons')),
 parent_id uuid NOT NULL, course_id uuid NOT NULL, organization_id uuid,
 trigger_depth integer NOT NULL CHECK(trigger_depth>0),
 statement_finished boolean NOT NULL DEFAULT false,
 PRIMARY KEY(transaction_id,parent_table,parent_id)
);
ALTER TABLE public.platform_course_publication_scope_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_course_publication_library_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_course_publication_deleted_parents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_course_publication_scope_revisions, public.platform_course_publication_library_revisions,
 public.platform_course_publication_deleted_parents FROM PUBLIC,anon,authenticated,service_role;


CREATE FUNCTION public.pcr_v2_sha(p_value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $f$
 SELECT encode(extensions.digest(convert_to(p_value::text,'UTF8'),'sha256'),'hex')
$f$;

CREATE FUNCTION public.pcr_v2_actor(p_wait boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='3s' AS $f$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN RAISE EXCEPTION 'PCR_MODERATOR_REQUIRED' USING ERRCODE='42501';END IF;
 -- Match the current account-deletion/UC013 account lock, before PCR locks.
 IF p_wait THEN RAISE EXCEPTION 'PCR_INTERNAL_BLOCKING_LOCK_FORBIDDEN';
 ELSIF NOT pg_try_advisory_xact_lock(hashtextextended(v_actor::text,42007)) THEN
  RAISE EXCEPTION 'PCR_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';
 END IF;
 IF NOT public.has_role('admin'::public.app_role,v_actor)
    OR NOT public.uc_platform_document_action_allowed(v_actor,'write')
    OR NOT public.account_deletion_access_allowed()
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()))
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_actor AND blocked_at IS NULL AND archived_at IS NULL)
 THEN RAISE EXCEPTION 'PCR_MODERATOR_REQUIRED' USING ERRCODE='42501';END IF;
 RETURN v_actor;
END $f$;

CREATE FUNCTION public.pcr_v2_resource_ids(p_course uuid) RETURNS uuid[]
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
 SELECT coalesce(array_agg(DISTINCT d.library_document_id ORDER BY d.library_document_id),'{}'::uuid[])
 FROM public.course_documents d WHERE d.course_id=p_course AND d.library_document_id IS NOT NULL
$f$;

CREATE FUNCTION public.pcr_v2_lock(p_ids uuid[],p_mode text,p_namespace text,p_wait boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_id uuid;v_key bigint;v_ok boolean;
BEGIN
 IF p_wait OR p_mode NOT IN ('shared','exclusive') OR p_namespace NOT IN ('own-edition','library-barrier') THEN RAISE EXCEPTION 'PCR_INTERNAL_LOCK_SCOPE';END IF;
 FOR v_id IN SELECT DISTINCT x FROM unnest(p_ids)x WHERE x IS NOT NULL ORDER BY x LOOP
  v_key:=hashtextextended('pcr-v2/'||p_namespace||'/'||v_id::text,0);
  IF p_mode='shared' THEN v_ok:=pg_try_advisory_xact_lock_shared(v_key);ELSE v_ok:=pg_try_advisory_xact_lock(v_key);END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'PCR_SOURCE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 END LOOP;
END $f$;

CREATE FUNCTION public.pcr_v2_touch_scope(p_course uuid,p_operation text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_generation uuid;
BEGIN
 IF p_operation IN ('own_touch','tombstone_touch') THEN
  UPDATE public.platform_course_publication_scope_revisions SET revision=revision+1,touched_at=clock_timestamp()
   WHERE course_id=p_course AND (active OR p_operation='tombstone_touch') RETURNING generation INTO v_generation;
  IF v_generation IS NULL THEN RAISE EXCEPTION 'PCR_SCOPE_REVISION_UNAVAILABLE' USING ERRCODE='40001';END IF;
 ELSIF p_operation='own_reset' THEN
  INSERT INTO public.platform_course_publication_scope_revisions(course_id,active) VALUES(p_course,true)
  ON CONFLICT(course_id) DO UPDATE SET generation=gen_random_uuid(),active=true,
    revision=platform_course_publication_scope_revisions.revision+1,touched_at=clock_timestamp()
  RETURNING generation INTO v_generation;
 ELSIF p_operation IN ('own_exit','client_listing_touch') THEN
  INSERT INTO public.platform_course_publication_scope_revisions(course_id,active) VALUES(p_course,false)
  ON CONFLICT(course_id) DO UPDATE SET active=CASE WHEN p_operation='own_exit' THEN false ELSE platform_course_publication_scope_revisions.active END,
   revision=platform_course_publication_scope_revisions.revision+1,touched_at=clock_timestamp()
  RETURNING generation INTO v_generation;
 ELSE RAISE EXCEPTION 'PCR_INTERNAL_REVISION_OPERATION';END IF;
 RETURN v_generation;
END $f$;
CREATE FUNCTION public.pcr_v2_touch_library(p_libraries uuid[]) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_id uuid;
BEGIN
 FOR v_id IN SELECT DISTINCT x FROM unnest(p_libraries)x WHERE x IS NOT NULL ORDER BY x LOOP
  PERFORM public.pcr_v2_lock(ARRAY[v_id],'exclusive','library-barrier');
  INSERT INTO public.platform_course_publication_library_revisions(library_document_id) VALUES(v_id)
  ON CONFLICT(library_document_id) DO UPDATE SET revision=platform_course_publication_library_revisions.revision+1,touched_at=clock_timestamp();
 END LOOP;
END $f$;
CREATE FUNCTION public.pcr_v2_parent_courses(p_courses uuid[],p_witness boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_id uuid;v_org uuid;v_map jsonb:='{}';v_found boolean;
BEGIN
 FOR v_id IN SELECT DISTINCT x FROM unnest(p_courses)x WHERE x IS NOT NULL ORDER BY x LOOP
  v_org:=NULL;
  BEGIN
   SELECT organization_id INTO v_org FROM public.courses WHERE id=v_id FOR SHARE NOWAIT;v_found:=FOUND;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCR_PARENT_CHANGED_RETRY' USING ERRCODE='40001';END;
  IF NOT v_found AND p_witness THEN
   SELECT organization_id INTO v_org FROM public.platform_course_publication_deleted_parents
    WHERE transaction_id=pg_current_xact_id()::text AND parent_table='courses' AND parent_id=v_id;v_found:=FOUND;
  END IF;
  IF NOT v_found THEN RAISE EXCEPTION 'PCR_PARENT_UNAVAILABLE_RETRY' USING ERRCODE='40001';END IF;
  v_map:=v_map||jsonb_build_object(v_id::text,v_org);
 END LOOP;
 RETURN v_map;
END $f$;
CREATE FUNCTION public.pcr_v2_parent_lesson(p_lesson uuid,p_witness boolean,p_lock boolean DEFAULT true) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_course uuid;
BEGIN
 IF p_lesson IS NULL THEN RETURN NULL;END IF;
 BEGIN
  IF p_lock THEN SELECT course_id INTO v_course FROM public.lessons WHERE id=p_lesson FOR SHARE NOWAIT;
  ELSE SELECT course_id INTO v_course FROM public.lessons WHERE id=p_lesson;END IF;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCR_PARENT_CHANGED_RETRY' USING ERRCODE='40001';END;
 IF v_course IS NULL AND p_witness THEN
  SELECT course_id INTO v_course FROM public.platform_course_publication_deleted_parents
   WHERE transaction_id=pg_current_xact_id()::text AND parent_table='lessons' AND parent_id=p_lesson;
 END IF;
 IF v_course IS NULL THEN RAISE EXCEPTION 'PCR_PARENT_UNAVAILABLE_RETRY' USING ERRCODE='40001';END IF;
 RETURN v_course;
END $f$;
CREATE FUNCTION public.pcr_v2_library_parents(p_libraries uuid[]) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_id uuid;
BEGIN
 FOR v_id IN SELECT DISTINCT x FROM unnest(p_libraries)x WHERE x IS NOT NULL ORDER BY x LOOP
  BEGIN
   PERFORM 1 FROM public.library_documents WHERE id=v_id FOR SHARE NOWAIT;
   IF NOT FOUND THEN RAISE EXCEPTION 'PCR_LIBRARY_UNAVAILABLE_RETRY' USING ERRCODE='40001';END IF;
  EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCR_PARENT_CHANGED_RETRY' USING ERRCODE='40001';END;
 END LOOP;
END $f$;
CREATE FUNCTION public.pcr_v2_claim_touch(p_course uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_libraries uuid[];
BEGIN
 -- Caller holds course parent, own fence, ordinary actor, and RC contract.
 v_libraries:=public.pcr_v2_resource_ids(p_course);
 PERFORM public.pcr_v2_library_parents(v_libraries);
 PERFORM public.pcr_v2_touch_library(v_libraries);
 PERFORM public.pcr_v2_touch_scope(p_course,'own_touch');
END $f$;
CREATE FUNCTION public.pcr_v2_delete_witness_cleanup() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN
 -- Mark only parent statements that have actually completed at this nesting
 -- level. A child hook inside a parent's BEFORE trigger cannot finish it.
 UPDATE public.platform_course_publication_deleted_parents
 SET statement_finished=true
 WHERE transaction_id=pg_current_xact_id()::text AND parent_table=TG_TABLE_NAME
 AND trigger_depth>=pg_trigger_depth();
 -- Parent completion alone is insufficient: deeper queued RI work may remain.
 -- Live recreated/cancelled parents need no old witness once that statement ended.
 DELETE FROM public.platform_course_publication_deleted_parents w
 WHERE w.transaction_id=pg_current_xact_id()::text AND w.parent_table='lessons'
 AND w.statement_finished
 AND (EXISTS(SELECT 1 FROM public.lessons l WHERE l.id=w.parent_id)
  OR (NOT EXISTS(SELECT 1 FROM public.test_questions q WHERE q.lesson_id=w.parent_id)
   AND NOT EXISTS(SELECT 1 FROM public.lesson_attachments a WHERE a.lesson_id=w.parent_id)));
 -- Drain lesson evidence first, then the course once direct children and
 -- still-needed lesson contexts have drained. Never touch another transaction.
 DELETE FROM public.platform_course_publication_deleted_parents w
 WHERE w.transaction_id=pg_current_xact_id()::text AND w.parent_table='courses'
 AND w.statement_finished
 AND (EXISTS(SELECT 1 FROM public.courses c WHERE c.id=w.parent_id)
  OR (NOT EXISTS(SELECT 1 FROM public.course_modules m WHERE m.course_id=w.parent_id)
   AND NOT EXISTS(SELECT 1 FROM public.lessons l WHERE l.course_id=w.parent_id)
   AND NOT EXISTS(SELECT 1 FROM public.course_documents d WHERE d.course_id=w.parent_id)
   AND NOT EXISTS(SELECT 1 FROM public.platform_course_publication_deleted_parents child
    WHERE child.transaction_id=w.transaction_id AND child.parent_table='lessons' AND child.course_id=w.parent_id)));
 RETURN NULL;
END $f$;

CREATE FUNCTION public.pcr_v2_enter(p_listing uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='3s' AS $f$
DECLARE v_course uuid;v_fresh uuid;v_org uuid;v_listing_org uuid;v_resources uuid[];
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'PCR_NEW_RPC_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 PERFORM public.pcr_v2_actor(false);
 SELECT course_id INTO v_course FROM public.marketplace_courses WHERE id=p_listing;
 IF v_course IS NULL THEN RAISE EXCEPTION 'PCR_LISTING_UNAVAILABLE' USING ERRCODE='P0002';END IF;
 -- TRY even at RPC entry: arbitrary caller transactions may already hold rows.
 PERFORM public.pcr_v2_lock(ARRAY[v_course],'exclusive','own-edition');
 PERFORM public.pcr_v2_parent_courses(ARRAY[v_course],false);
 BEGIN
  SELECT course_id,organization_id INTO v_fresh,v_listing_org FROM public.marketplace_courses WHERE id=p_listing FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCR_LISTING_CHANGED_RETRY' USING ERRCODE='40001';END;
 SELECT organization_id INTO v_org FROM public.courses WHERE id=v_course;
 IF v_fresh IS DISTINCT FROM v_course THEN RAISE EXCEPTION 'PCR_SOURCE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 IF v_org IS DISTINCT FROM '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
    OR (v_listing_org IS NOT NULL AND v_listing_org IS DISTINCT FROM v_org) THEN RAISE EXCEPTION 'PCR_OWN_PLATFORM_SOURCE_REQUIRED' USING ERRCODE='42501';END IF;
 v_resources:=public.pcr_v2_resource_ids(v_course);
 PERFORM public.pcr_v2_library_parents(v_resources);
 PERFORM public.pcr_v2_actor(false);
 RETURN v_course;
END $f$;

CREATE FUNCTION public.pcr_v2_manifest(p_course uuid,p_listing uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.courses c JOIN public.marketplace_courses m ON m.course_id=c.id
   WHERE c.id=p_course AND m.id=p_listing AND c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
   AND (m.organization_id IS NULL OR m.organization_id=c.organization_id)) THEN
  RAISE EXCEPTION 'PCR_OWN_PLATFORM_SOURCE_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_course_publication_scope_revisions WHERE course_id=p_course AND active) THEN RAISE EXCEPTION 'PCR_SCOPE_REVISION_UNAVAILABLE' USING ERRCODE='40001';END IF;
 SELECT jsonb_build_object('schema_version',2,'scope_generation',(SELECT r.generation FROM public.platform_course_publication_scope_revisions r WHERE r.course_id=c.id AND r.active),'course_id',c.id,'organization_id',c.organization_id,'marketplace_id',m.id,
  'listing_organization_id',m.organization_id,
  'course_row_sha256',public.pcr_v2_sha(to_jsonb(c)-ARRAY['created_at','updated_at','generation_progress']),
  'modules',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'row_sha256',public.pcr_v2_sha(to_jsonb(r)-ARRAY['created_at','updated_at'])) ORDER BY r.order_index,r.id) FROM public.course_modules r WHERE r.course_id=c.id),'[]'),
  'lessons',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'module_id',r.module_id,'type',r.type,'row_sha256',public.pcr_v2_sha(to_jsonb(r)-ARRAY['created_at','updated_at']),
    'question_bank_sha256',public.pcr_v2_sha(coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.order_index,q.id) FROM public.test_questions q WHERE q.lesson_id=r.id),'[]')),
    'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'row_sha256',public.pcr_v2_sha(to_jsonb(a)-'created_at'),'file_bytes_state','unconfirmed') ORDER BY a.order_index,a.id) FROM public.lesson_attachments a WHERE a.lesson_id=r.id),'[]')) ORDER BY r.order_index,r.id)
    FROM public.lessons r WHERE r.course_id=c.id),'[]'),
  'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'library_document_id',d.library_document_id,'row_sha256',public.pcr_v2_sha(to_jsonb(d)-ARRAY['created_at','updated_at']),
    'library_row_sha256',CASE WHEN b.id IS NOT NULL THEN public.pcr_v2_sha(to_jsonb(b)-ARRAY['created_at','updated_at']) END,'file_bytes_state','unconfirmed') ORDER BY d.sort_order,d.id)
    FROM public.course_documents d LEFT JOIN public.library_documents b ON b.id=d.library_document_id WHERE d.course_id=c.id),'[]'))
 INTO v_result FROM public.courses c JOIN public.marketplace_courses m ON m.course_id=c.id WHERE c.id=p_course AND m.id=p_listing;
 RETURN v_result;
END $f$;

CREATE FUNCTION public.pcr_v2_blockers(p_course uuid,p_dossier jsonb) RETURNS text[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v text[]:='{}';v_key text;v_section jsonb;v_ref jsonb;
BEGIN
 IF jsonb_typeof(p_dossier) IS DISTINCT FROM 'object' OR p_dossier->>'schema_version' IS DISTINCT FROM '1' THEN RETURN ARRAY['dossier_missing'];END IF;
 FOREACH v_key IN ARRAY ARRAY['purpose','audience','entry_requirements','outcomes','teaching_plan','workload','assessment_criteria','applicability'] LOOP
  IF jsonb_typeof(p_dossier->'passport'->v_key) IS DISTINCT FROM 'string' OR nullif(btrim(p_dossier->'passport'->>v_key),'') IS NULL THEN v:=array_append(v,'passport_'||v_key);END IF;
 END LOOP;
 FOREACH v_key IN ARRAY ARRAY['source_review','subject_keys','practices','rights','document_links'] LOOP
  v_section:=p_dossier->v_key;
  IF jsonb_typeof(v_section) IS DISTINCT FROM 'object' OR NOT coalesce(v_section->>'state' IN ('confirmed','not_applicable'),false)
    OR nullif(btrim(v_section->>'rationale'),'') IS NULL THEN v:=array_append(v,v_key||'_incomplete');
  ELSIF v_section->>'state'='confirmed' AND (jsonb_typeof(v_section->'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(v_section->'evidence')=0) THEN
   v:=array_append(v,v_key||'_evidence_missing');
  ELSIF v_section->>'state'='confirmed' THEN
   FOR v_ref IN SELECT value FROM jsonb_array_elements(v_section->'evidence') LOOP
    IF jsonb_typeof(v_ref) IS DISTINCT FROM 'object' OR nullif(btrim(v_ref->>'reference'),'') IS NULL
       OR nullif(btrim(v_ref->>'edition'),'') IS NULL OR nullif(btrim(v_ref->>'checked_at'),'') IS NULL THEN
     v:=array_append(v,v_key||'_evidence_incomplete');EXIT;
    END IF;
    IF NOT pg_input_is_valid(v_ref->>'checked_at','timestamptz') THEN v:=array_append(v,v_key||'_evidence_date_invalid');EXIT;END IF;
    IF NOT isfinite((v_ref->>'checked_at')::timestamptz) OR (v_ref->>'checked_at')::timestamptz>clock_timestamp() THEN v:=array_append(v,v_key||'_evidence_date_invalid');EXIT;END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF p_dossier->'rights'->>'state' IS DISTINCT FROM 'confirmed' THEN v:=array_append(v,'rights_review_required');END IF;
 IF EXISTS(SELECT 1 FROM public.test_questions q JOIN public.lessons l ON l.id=q.lesson_id WHERE l.course_id=p_course)
    AND p_dossier->'subject_keys'->>'state' IS DISTINCT FROM 'confirmed' THEN v:=array_append(v,'subject_key_review_required');END IF;
 IF EXISTS(SELECT 1 FROM public.lessons WHERE course_id=p_course AND type IN ('practice','homework'))
    AND p_dossier->'practices'->>'state' IS DISTINCT FROM 'confirmed' THEN v:=array_append(v,'practice_review_required');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.lessons WHERE course_id=p_course) THEN v:=array_append(v,'curriculum_empty');END IF;
 IF EXISTS(SELECT 1 FROM public.test_questions q JOIN public.lessons l ON l.id=q.lesson_id WHERE l.course_id=p_course
   AND (q.correct_answer IS NULL OR NOT public.prog_test_question_key_valid(q.options,q.correct_answer))) THEN v:=array_append(v,'invalid_structural_test_key');END IF;
 IF EXISTS(SELECT 1 FROM public.lessons l LEFT JOIN public.course_modules m ON m.id=l.module_id WHERE l.course_id=p_course AND l.module_id IS NOT NULL AND m.course_id IS DISTINCT FROM l.course_id) THEN v:=array_append(v,'module_course_mismatch');END IF;
 -- No mutable URL is represented as an immutable file edition. This inline core
 -- cannot accept file-backed material; a separately verified file contract is
 -- an OPEN prerequisite for full PROG012, not an automatic N/A workaround.
 IF EXISTS(SELECT 1 FROM public.course_documents WHERE course_id=p_course)
    OR EXISTS(SELECT 1 FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id WHERE l.course_id=p_course)
    OR EXISTS(SELECT 1 FROM public.lessons WHERE course_id=p_course AND (type IN ('video','audio','pdf','file','presentation') OR content ~* '(https?://|<iframe|<(audio|video)|"(imageSrc|videoSrc|fileUrl)"[[:space:]]*:)'))
 THEN v:=array_append(v,'file_or_external_material_edition_unconfirmed');END IF;
 RETURN v;
END $f$;

CREATE FUNCTION public.pcr_v2_readiness(p_listing uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_course uuid;v_manifest jsonb;v_sha text;v_proposal public.platform_course_publication_review_events;v_review public.platform_course_publication_review_events;v_blockers text[];v_validated boolean;
BEGIN
 v_course:=public.pcr_v2_enter(p_listing);v_manifest:=public.pcr_v2_manifest(v_course,p_listing);v_sha:=public.pcr_v2_sha(v_manifest);
 SELECT is_validated INTO v_validated FROM public.marketplace_courses WHERE id=p_listing;
 SELECT * INTO v_proposal FROM public.platform_course_publication_review_events WHERE marketplace_id=p_listing AND event_kind='submitted' ORDER BY sequence DESC LIMIT 1;
 IF v_proposal.id IS NULL THEN RETURN jsonb_build_object('marketplace_id',p_listing,'course_id',v_course,'edition_sha256',v_sha,'is_validated',v_validated,'state',CASE WHEN v_validated THEN 'legacy_unchanged' ELSE 'review_missing' END,'blockers',jsonb_build_array('explicit_template_review_missing'));END IF;
 IF v_proposal.course_id IS DISTINCT FROM v_course OR v_proposal.edition_sha256 IS DISTINCT FROM v_sha THEN RETURN jsonb_build_object('marketplace_id',p_listing,'course_id',v_course,'proposal_id',v_proposal.id,'edition_sha256',v_sha,'state','review_stale','blockers',jsonb_build_array('source_edition_changed'));END IF;
 v_blockers:=public.pcr_v2_blockers(v_course,v_proposal.review_payload);
 SELECT * INTO v_review FROM public.platform_course_publication_review_events WHERE proposal_id=v_proposal.id AND event_kind='review_decided' ORDER BY sequence DESC LIMIT 1;
 RETURN jsonb_build_object('marketplace_id',p_listing,'course_id',v_course,'proposal_id',v_proposal.id,'review_id',v_review.id,'edition_sha256',v_sha,
  'state',CASE WHEN cardinality(v_blockers)>0 THEN 'review_incomplete' WHEN v_review.id IS NULL THEN 'review_missing'
   WHEN v_review.review_payload->>'decision'='needs_revision' THEN 'needs_revision'
   WHEN (v_review.review_payload->>'next_review_at')::timestamptz<=clock_timestamp() THEN 'review_due' ELSE 'eligible' END,
  'blockers',to_jsonb(v_blockers),'is_validated',v_validated,'decision_scope','platform_template_only_not_centre_or_qualification');
END $f$;

CREATE FUNCTION public.read_platform_course_publication_readiness(p_marketplace_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='3s' AS $f$
DECLARE v_course uuid;v_org uuid;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'PCR_NEW_RPC_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 PERFORM public.pcr_v2_actor(false);
 SELECT m.course_id,c.organization_id INTO v_course,v_org FROM public.marketplace_courses m JOIN public.courses c ON c.id=m.course_id WHERE m.id=p_marketplace_id;
 IF v_course IS NULL THEN RAISE EXCEPTION 'PCR_LISTING_UNAVAILABLE' USING ERRCODE='P0002';END IF;
 IF v_org IS DISTINCT FROM '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid THEN
  RETURN jsonb_build_object('marketplace_id',p_marketplace_id,'course_id',v_course,'state','out_of_scope','blockers','[]'::jsonb);
 END IF;
 RETURN public.pcr_v2_readiness(p_marketplace_id);
END $f$;

CREATE FUNCTION public.submit_platform_course_publication_proposal(p_marketplace_id uuid,p_expected_edition_sha256 text,p_dossier jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='3s' AS $f$
DECLARE v_actor uuid;v_course uuid;v_manifest jsonb;v_sha text;v_request text;v_id uuid:=gen_random_uuid();v_old public.platform_course_publication_review_events;
BEGIN
 v_course:=public.pcr_v2_enter(p_marketplace_id);v_actor:=public.pcr_v2_actor(false);
 IF p_request_id IS NULL OR p_expected_edition_sha256 IS NULL OR jsonb_typeof(p_dossier) IS DISTINCT FROM 'object' OR octet_length(p_dossier::text)>262144 THEN RAISE EXCEPTION 'PCR_INVALID_PROPOSAL';END IF;
 v_request:=public.pcr_v2_sha(jsonb_build_object('operation','submit','marketplace_id',p_marketplace_id,'expected_edition',p_expected_edition_sha256,'dossier',p_dossier));
 SELECT * INTO v_old FROM public.platform_course_publication_review_events WHERE actor_id=v_actor AND request_id=p_request_id;
 IF v_old.id IS NOT NULL THEN IF v_old.request_sha256<>v_request OR v_old.event_kind<>'submitted' THEN RAISE EXCEPTION 'PCR_REQUEST_CONFLICT' USING ERRCODE='22023';END IF;RETURN jsonb_build_object('proposal_id',v_old.id,'edition_sha256',v_old.edition_sha256,'replayed',true);END IF;
 v_manifest:=public.pcr_v2_manifest(v_course,p_marketplace_id);v_sha:=public.pcr_v2_sha(v_manifest);
 IF p_expected_edition_sha256 IS DISTINCT FROM v_sha THEN RAISE EXCEPTION 'PCR_SOURCE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 INSERT INTO public.platform_course_publication_review_events(id,course_id,organization_id,marketplace_id,proposal_id,event_kind,edition_sha256,canonical_manifest,review_payload,actor_id,request_id,request_sha256)
 VALUES(v_id,v_course,'4ac2c05a-d8b5-4e72-ba31-f2c743091d95',p_marketplace_id,v_id,'submitted',v_sha,v_manifest,p_dossier,v_actor,p_request_id,v_request);
 RETURN jsonb_build_object('proposal_id',v_id,'edition_sha256',v_sha,'replayed',false,'readiness',public.pcr_v2_readiness(p_marketplace_id));
END $f$;

CREATE FUNCTION public.record_platform_course_publication_review(p_marketplace_id uuid,p_proposal_id uuid,p_expected_edition_sha256 text,p_decision text,p_notes text,p_next_review_at timestamptz,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='3s' AS $f$
DECLARE v_actor uuid;v_course uuid;v_ready jsonb;v_request text;v_id uuid:=gen_random_uuid();v_previous uuid;v_proposal public.platform_course_publication_review_events;v_old public.platform_course_publication_review_events;v_payload jsonb;
BEGIN
 v_course:=public.pcr_v2_enter(p_marketplace_id);v_actor:=public.pcr_v2_actor(false);
 IF p_request_id IS NULL OR NOT coalesce(p_decision IN ('accepted_for_template_publication','needs_revision'),false) OR nullif(btrim(p_notes),'') IS NULL OR length(p_notes)>16384 THEN RAISE EXCEPTION 'PCR_REVIEW_INCOMPLETE';END IF;
 v_payload:=jsonb_build_object('decision',p_decision,'notes',p_notes,'next_review_at',p_next_review_at,'responsible_user_id',v_actor,'reviewer_user_id',v_actor,'scope','platform_template_only_not_centre_or_qualification');
 v_request:=public.pcr_v2_sha(jsonb_build_object('operation','review','marketplace_id',p_marketplace_id,'proposal_id',p_proposal_id,'expected_edition',p_expected_edition_sha256,'payload',v_payload));
 SELECT * INTO v_old FROM public.platform_course_publication_review_events WHERE actor_id=v_actor AND request_id=p_request_id;
 IF v_old.id IS NOT NULL THEN IF v_old.request_sha256<>v_request OR v_old.event_kind<>'review_decided' THEN RAISE EXCEPTION 'PCR_REQUEST_CONFLICT' USING ERRCODE='22023';END IF;RETURN jsonb_build_object('review_id',v_old.id,'replayed',true);END IF;
 IF p_decision='accepted_for_template_publication' AND (p_next_review_at IS NULL OR NOT isfinite(p_next_review_at) OR p_next_review_at<=clock_timestamp()) THEN RAISE EXCEPTION 'PCR_REVIEW_DATE_REQUIRED';END IF;
 v_ready:=public.pcr_v2_readiness(p_marketplace_id);
 IF v_ready->>'proposal_id' IS DISTINCT FROM p_proposal_id::text OR v_ready->>'edition_sha256' IS DISTINCT FROM p_expected_edition_sha256 OR v_ready->>'state'='review_stale' THEN RAISE EXCEPTION 'PCR_SOURCE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 IF p_decision='accepted_for_template_publication' AND v_ready->>'state'='review_incomplete' THEN RAISE EXCEPTION 'PCR_REVIEW_INCOMPLETE' USING ERRCODE='23514';END IF;
 SELECT * INTO v_proposal FROM public.platform_course_publication_review_events WHERE id=p_proposal_id AND event_kind='submitted';
 IF v_proposal.id IS NULL OR v_proposal.course_id<>v_course THEN RAISE EXCEPTION 'PCR_PROPOSAL_UNAVAILABLE';END IF;
 IF p_decision='accepted_for_template_publication' THEN PERFORM public.pcr_v2_claim_touch(v_course);END IF;
 v_payload:=v_payload||jsonb_build_object('same_person_review',v_proposal.actor_id=v_actor);
 SELECT id INTO v_previous FROM public.platform_course_publication_review_events WHERE proposal_id=p_proposal_id ORDER BY sequence DESC LIMIT 1;
 INSERT INTO public.platform_course_publication_review_events(id,course_id,organization_id,marketplace_id,proposal_id,event_kind,edition_sha256,canonical_manifest,review_payload,predecessor_event_id,actor_id,request_id,request_sha256)
 VALUES(v_id,v_course,'4ac2c05a-d8b5-4e72-ba31-f2c743091d95',p_marketplace_id,p_proposal_id,'review_decided',p_expected_edition_sha256,v_proposal.canonical_manifest,v_payload,v_previous,v_actor,p_request_id,v_request);
 RETURN jsonb_build_object('review_id',v_id,'replayed',false,'readiness',public.pcr_v2_readiness(p_marketplace_id));
END $f$;

CREATE FUNCTION public.pcr_v2_source_scopes(p_table text,p_row jsonb) RETURNS uuid[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v uuid[];
BEGIN
 IF p_row IS NULL THEN RETURN '{}'::uuid[];END IF;
 IF p_table='courses' THEN RETURN ARRAY[(p_row->>'id')::uuid];
 ELSIF p_table IN ('course_modules','lessons','course_documents') THEN RETURN ARRAY[(p_row->>'course_id')::uuid];
 ELSIF p_table IN ('test_questions','lesson_attachments') THEN SELECT ARRAY[l.course_id] INTO v FROM public.lessons l WHERE l.id=(p_row->>'lesson_id')::uuid;
 ELSIF p_table='library_documents' THEN SELECT array_agg(DISTINCT d.course_id ORDER BY d.course_id) INTO v FROM public.course_documents d WHERE d.library_document_id=(p_row->>'id')::uuid;
 ELSE RAISE EXCEPTION 'PCR_INTERNAL_SOURCE_TABLE';END IF;
 RETURN coalesce(v,'{}'::uuid[]);
END $f$;

CREATE FUNCTION public.pcr_v2_source_before() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_old jsonb:=CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END;v_new jsonb:=CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END;
 v_old_ids uuid[]:='{}';v_new_ids uuid[]:='{}';v_ids uuid[];v_owned uuid[];v_libraries uuid[]:='{}';v_map jsonb:='{}';
 v_id uuid;v_lesson uuid;v_lessons uuid[]:='{}';v_old_lesson uuid;v_new_lesson uuid;v_old_course uuid;v_new_course uuid;v_org uuid;
BEGIN
 -- There is deliberately NO isolation-level ban on existing source writers.
 -- All new lock acquisitions are nonblocking: DML target is already locked.
 IF TG_TABLE_NAME='library_documents' THEN
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}') INTO v_libraries
   FROM unnest(ARRAY[(v_old->>'id')::uuid,(v_new->>'id')::uuid])x WHERE x IS NOT NULL;
  -- Mandatory even when a RR fanout lookup below sees zero own references.
  PERFORM public.pcr_v2_touch_library(v_libraries);
 END IF;
 IF TG_TABLE_NAME IN ('test_questions','lesson_attachments') THEN
  v_old_lesson:=(v_old->>'lesson_id')::uuid;v_new_lesson:=(v_new->>'lesson_id')::uuid;
  v_old_course:=public.pcr_v2_parent_lesson(v_old_lesson,TG_OP<>'INSERT',false);
  v_new_course:=public.pcr_v2_parent_lesson(v_new_lesson,TG_OP='UPDATE' AND v_new_lesson IS NOT DISTINCT FROM v_old_lesson,false);
  v_old_ids:=array_remove(ARRAY[v_old_course],NULL);v_new_ids:=array_remove(ARRAY[v_new_course],NULL);
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}') INTO v_lessons
   FROM unnest(ARRAY[v_old_lesson,v_new_lesson])x WHERE x IS NOT NULL;
 ELSE
  v_old_ids:=public.pcr_v2_source_scopes(TG_TABLE_NAME,v_old);v_new_ids:=public.pcr_v2_source_scopes(TG_TABLE_NAME,v_new);
 END IF;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}') INTO v_ids FROM unnest(v_old_ids||v_new_ids)x WHERE x IS NOT NULL;
 IF TG_TABLE_NAME='courses' THEN
  -- The target tuple itself pins owner classification. INSERT is not visible
  -- yet; UPDATE/DELETE already own the target row before this trigger.
  IF v_old IS NOT NULL THEN v_map:=v_map||jsonb_build_object(v_old->>'id',v_old->>'organization_id');END IF;
  IF v_new IS NOT NULL THEN v_map:=v_map||jsonb_build_object(v_new->>'id',v_new->>'organization_id');END IF;
 ELSE v_map:=public.pcr_v2_parent_courses(v_ids,TG_OP<>'INSERT');END IF;
 FOR v_lesson IN SELECT x FROM unnest(v_lessons)x ORDER BY x LOOP
  v_id:=public.pcr_v2_parent_lesson(v_lesson,TG_OP<>'INSERT',true);
  IF v_lesson=v_old_lesson AND v_id IS DISTINCT FROM v_old_course OR v_lesson=v_new_lesson AND v_id IS DISTINCT FROM v_new_course THEN
   RAISE EXCEPTION 'PCR_PARENT_MAPPING_CHANGED_RETRY' USING ERRCODE='40001';
  END IF;
 END LOOP;
 SELECT coalesce(array_agg(x ORDER BY x),'{}') INTO v_owned FROM unnest(v_ids)x
  WHERE v_map->>x::text='4ac2c05a-d8b5-4e72-ba31-f2c743091d95';
 -- A courses ownership exit must fence its former own generation as well.
 IF TG_TABLE_NAME='courses' AND v_old->>'organization_id'='4ac2c05a-d8b5-4e72-ba31-f2c743091d95' THEN
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_owned FROM unnest(v_owned||ARRAY[(v_old->>'id')::uuid])x;
 END IF;
 PERFORM public.pcr_v2_lock(v_owned,'exclusive','own-edition');
 IF EXISTS(SELECT 1 FROM public.platform_course_publication_review_events e WHERE e.transaction_id=pg_current_xact_id()::text AND e.course_id=ANY(v_owned)
   AND (e.event_kind='publication_recorded' OR e.event_kind='review_decided' AND e.review_payload->>'decision'='accepted_for_template_publication')) THEN
  RAISE EXCEPTION 'PCR_MIXED_CLAIM_SOURCE_TRANSACTION' USING ERRCODE='40001';
 END IF;
 IF TG_TABLE_NAME='course_documents' AND cardinality(v_owned)>0 THEN
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}') INTO v_libraries
   FROM unnest(ARRAY[(v_old->>'library_document_id')::uuid,(v_new->>'library_document_id')::uuid])x WHERE x IS NOT NULL;
  PERFORM public.pcr_v2_library_parents(v_libraries);
 END IF;
 IF TG_TABLE_NAME='courses' THEN
  IF v_old->>'organization_id'='4ac2c05a-d8b5-4e72-ba31-f2c743091d95' AND
    (TG_OP='DELETE' OR v_new->>'organization_id' IS DISTINCT FROM v_old->>'organization_id' OR v_new->>'id' IS DISTINCT FROM v_old->>'id') THEN
   PERFORM public.pcr_v2_touch_scope((v_old->>'id')::uuid,'own_exit');
  END IF;
  IF TG_OP<>'DELETE' AND v_new->>'organization_id'='4ac2c05a-d8b5-4e72-ba31-f2c743091d95' THEN
   IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.courses WHERE id=(v_new->>'id')::uuid) THEN
    -- BEFORE INSERT also runs for ON CONFLICT DO NOTHING. Never change an
    -- existing edition generation merely because a duplicate was attempted.
    PERFORM public.pcr_v2_touch_scope((v_new->>'id')::uuid,CASE WHEN EXISTS(SELECT 1 FROM public.platform_course_publication_scope_revisions WHERE course_id=(v_new->>'id')::uuid AND active) THEN 'own_touch' ELSE 'client_listing_touch' END);
   ELSE
    PERFORM public.pcr_v2_touch_scope((v_new->>'id')::uuid,CASE WHEN TG_OP='INSERT' OR v_old->>'organization_id' IS DISTINCT FROM v_new->>'organization_id' OR v_old->>'id' IS DISTINCT FROM v_new->>'id' THEN 'own_reset' ELSE 'own_touch' END);
   END IF;
  END IF;
 ELSE
  FOREACH v_id IN ARRAY v_owned LOOP
   -- An own parent already deleted in this same cascading command is inactive;
   -- its BEFORE DELETE fenced/touched the generation. Trusted witness only.
   IF EXISTS(SELECT 1 FROM public.platform_course_publication_deleted_parents WHERE transaction_id=pg_current_xact_id()::text AND parent_table='courses' AND parent_id=v_id) THEN
    PERFORM public.pcr_v2_touch_scope(v_id,'tombstone_touch');
   ELSE PERFORM public.pcr_v2_touch_scope(v_id,'own_touch');END IF;
  END LOOP;
 END IF;
 IF TG_OP='DELETE' AND TG_TABLE_NAME IN ('courses','lessons') THEN
  v_id:=(v_old->>'id')::uuid;v_old_course:=CASE WHEN TG_TABLE_NAME='courses' THEN v_id ELSE (v_old->>'course_id')::uuid END;
  v_org:=CASE WHEN TG_TABLE_NAME='courses' THEN (v_old->>'organization_id')::uuid ELSE (v_map->>v_old_course::text)::uuid END;
  INSERT INTO public.platform_course_publication_deleted_parents(transaction_id,parent_table,parent_id,course_id,organization_id,trigger_depth)
   VALUES(pg_current_xact_id()::text,TG_TABLE_NAME,v_id,v_old_course,v_org,pg_trigger_depth())
  ON CONFLICT(transaction_id,parent_table,parent_id) DO UPDATE SET course_id=EXCLUDED.course_id,organization_id=EXCLUDED.organization_id,trigger_depth=EXCLUDED.trigger_depth,statement_finished=false;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $f$;

CREATE FUNCTION public.pcr_v2_own_entry_invalidate() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN
 IF NEW.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95' AND
  (TG_OP='INSERT' OR OLD.organization_id IS DISTINCT FROM NEW.organization_id OR OLD.id IS DISTINCT FROM NEW.id) THEN
  -- No WHERE is_validated=true snapshot hole on entry into the own scope.
  -- Client true listing INSERT/repoint/promotion touched the same private
  -- course revision: a RR transfer cannot miss a post-snapshot new listing.
  UPDATE public.marketplace_courses SET is_validated=false WHERE course_id=NEW.id
   AND (organization_id IS NULL OR organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid);
 END IF;
 RETURN NEW;
END $f$;

CREATE FUNCTION public.pcr_v2_library_after() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN
 UPDATE public.marketplace_courses m SET is_validated=false FROM public.courses c,public.course_documents d
 WHERE m.course_id=c.id AND d.course_id=c.id AND d.library_document_id=coalesce(NEW.id,OLD.id)
 AND c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95' AND m.is_validated;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $f$;

CREATE FUNCTION public.pcr_v2_listing_before() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_org uuid;v_ready jsonb;v_intent public.platform_course_publication_invocations;v_structural boolean;
BEGIN
 IF NEW.is_validated IS NOT TRUE THEN RETURN NEW;END IF;
 SELECT * INTO v_intent FROM public.platform_course_publication_invocations WHERE transaction_id=pg_current_xact_id()::text AND marketplace_id=NEW.id;
 v_structural:=TG_OP='INSERT' OR OLD.is_validated IS DISTINCT FROM true OR NEW.course_id IS DISTINCT FROM OLD.course_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id;
 IF NOT v_structural AND v_intent.request_id IS NULL THEN RETURN NEW;END IF;
 PERFORM public.pcr_v2_parent_courses(ARRAY[NEW.course_id],false);
 SELECT organization_id INTO v_org FROM public.courses WHERE id=NEW.course_id;
 IF v_org IS DISTINCT FROM '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid THEN
  -- Private coordination only. A later RR ownership entry must detect this
  -- new/repointed/true client listing even if absent from its old snapshot.
  IF v_structural THEN
   PERFORM public.pcr_v2_lock(ARRAY[NEW.course_id],'exclusive','own-edition');
   PERFORM public.pcr_v2_touch_scope(NEW.course_id,'client_listing_touch');
  END IF;
  RETURN NEW;
 END IF;
 -- Only the new RC-only RPC may create a new own publication claim. Client
 -- promotion is unchanged; own historical true metadata edits remain unchanged.
 IF v_intent.request_id IS NULL THEN RAISE EXCEPTION 'PCR_PUBLICATION_RPC_REQUIRED' USING ERRCODE='23514';END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'PCR_NEW_RPC_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 PERFORM public.pcr_v2_actor(false);
 PERFORM public.pcr_v2_lock(ARRAY[NEW.course_id],'exclusive','own-edition');
 IF TG_OP='INSERT' OR NEW.course_id IS DISTINCT FROM OLD.course_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'PCR_REVIEW_MISSING' USING ERRCODE='23514';END IF;
 v_ready:=public.pcr_v2_readiness(NEW.id);
 IF v_ready->>'state' IS DISTINCT FROM 'eligible' THEN RAISE EXCEPTION 'PCR_PUBLICATION_REVIEW_REQUIRED: %',v_ready->>'state' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $f$;

CREATE FUNCTION public.pcr_v2_listing_after() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_ready jsonb;v_actor uuid;v_id uuid:=gen_random_uuid();v_request uuid;v_sha text;v_review public.platform_course_publication_review_events;v_intent public.platform_course_publication_invocations;
BEGIN
 IF NEW.is_validated IS NOT TRUE THEN RETURN NEW;END IF;
 SELECT * INTO v_intent FROM public.platform_course_publication_invocations WHERE transaction_id=pg_current_xact_id()::text AND marketplace_id=NEW.id;
 IF TG_OP='UPDATE' AND OLD.is_validated IS TRUE AND NEW.course_id IS NOT DISTINCT FROM OLD.course_id AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id AND v_intent.request_id IS NULL THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=NEW.course_id AND organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95') THEN RETURN NEW;END IF;
 v_actor:=public.pcr_v2_actor(false);v_ready:=public.pcr_v2_readiness(NEW.id);
 IF v_ready->>'state' IS DISTINCT FROM 'eligible' THEN RAISE EXCEPTION 'PCR_PUBLICATION_REVIEW_REQUIRED' USING ERRCODE='23514';END IF;
 SELECT * INTO v_review FROM public.platform_course_publication_review_events WHERE id=(v_ready->>'review_id')::uuid;
 IF v_intent.request_id IS NOT NULL AND (v_intent.actor_id<>v_actor OR v_intent.proposal_id<>v_review.proposal_id OR v_intent.edition_sha256<>v_review.edition_sha256) THEN RAISE EXCEPTION 'PCR_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 v_request:=coalesce(v_intent.request_id,gen_random_uuid());v_sha:=coalesce(v_intent.request_sha256,public.pcr_v2_sha(jsonb_build_object('operation','direct_promotion','listing_id',NEW.id,'proposal_id',v_review.proposal_id,'edition',v_review.edition_sha256)));
 INSERT INTO public.platform_course_publication_review_events(id,course_id,organization_id,marketplace_id,proposal_id,event_kind,edition_sha256,canonical_manifest,review_payload,predecessor_event_id,actor_id,request_id,request_sha256)
 VALUES(v_id,NEW.course_id,'4ac2c05a-d8b5-4e72-ba31-f2c743091d95',NEW.id,v_review.proposal_id,'publication_recorded',v_review.edition_sha256,v_review.canonical_manifest,
  jsonb_build_object('review_id',v_review.id,'is_validated',true,'scope','platform_template_only_not_centre_or_qualification'),v_review.id,v_actor,v_request,v_sha);
 RETURN NEW;
END $f$;

CREATE FUNCTION public.publish_platform_course_proposal(p_marketplace_id uuid,p_proposal_id uuid,p_expected_edition_sha256 text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='3s' AS $f$
DECLARE v_course uuid;v_actor uuid;v_request text;v_ready jsonb;v_old public.platform_course_publication_review_events;v_saved public.marketplace_courses;v_receipt uuid;
BEGIN
 v_course:=public.pcr_v2_enter(p_marketplace_id);v_actor:=public.pcr_v2_actor(false);
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'PCR_REQUEST_REQUIRED';END IF;
 v_request:=public.pcr_v2_sha(jsonb_build_object('operation','publish','marketplace_id',p_marketplace_id,'proposal_id',p_proposal_id,'edition',p_expected_edition_sha256));
 SELECT * INTO v_old FROM public.platform_course_publication_review_events WHERE actor_id=v_actor AND request_id=p_request_id;
 IF v_old.id IS NOT NULL THEN
  IF v_old.request_sha256<>v_request OR v_old.event_kind<>'publication_recorded' THEN RAISE EXCEPTION 'PCR_REQUEST_CONFLICT' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('id',v_old.marketplace_id,'course_id',v_old.course_id,'edition_sha256',v_old.edition_sha256,'receipt_id',v_old.id,'is_validated_at_recording',true,'replayed',true,'current_readiness',public.pcr_v2_readiness(p_marketplace_id));
 END IF;
 v_ready:=public.pcr_v2_readiness(p_marketplace_id);
 IF v_ready->>'proposal_id' IS DISTINCT FROM p_proposal_id::text OR v_ready->>'edition_sha256' IS DISTINCT FROM p_expected_edition_sha256 THEN RAISE EXCEPTION 'PCR_SOURCE_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 IF v_ready->>'state' IS DISTINCT FROM 'eligible' THEN RAISE EXCEPTION 'PCR_PUBLICATION_REVIEW_REQUIRED' USING ERRCODE='23514';END IF;
 PERFORM public.pcr_v2_claim_touch(v_course);
 INSERT INTO public.platform_course_publication_invocations(transaction_id,marketplace_id,proposal_id,actor_id,edition_sha256,request_id,request_sha256)
 VALUES(pg_current_xact_id()::text,p_marketplace_id,p_proposal_id,v_actor,p_expected_edition_sha256,p_request_id,v_request);
 UPDATE public.marketplace_courses SET is_validated=true WHERE id=p_marketplace_id AND course_id=v_course RETURNING * INTO v_saved;
 SELECT id INTO v_receipt FROM public.platform_course_publication_review_events WHERE actor_id=v_actor AND request_id=p_request_id;
 IF v_saved.id IS DISTINCT FROM p_marketplace_id OR v_saved.is_validated IS NOT TRUE OR v_receipt IS NULL THEN RAISE EXCEPTION 'PCR_PUBLICATION_NOT_CONFIRMED';END IF;
 DELETE FROM public.platform_course_publication_invocations WHERE transaction_id=pg_current_xact_id()::text AND marketplace_id=p_marketplace_id;
 RETURN jsonb_build_object('id',v_saved.id,'course_id',v_saved.course_id,'is_validated',true,'edition_sha256',p_expected_edition_sha256,'receipt_id',v_receipt,'replayed',false);
END $f$;

CREATE FUNCTION public.pcr_v2_final_claim() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_sha text;
BEGIN
 IF NEW.event_kind='publication_recorded' OR NEW.event_kind='review_decided' AND NEW.review_payload->>'decision'='accepted_for_template_publication' THEN
  IF NEW.actor_id IS DISTINCT FROM public.pcr_v2_actor(false) THEN RAISE EXCEPTION 'PCR_ACTOR_CHANGED' USING ERRCODE='42501';END IF;
  IF NEW.event_kind='review_decided' AND ((NEW.review_payload->>'next_review_at')::timestamptz<=clock_timestamp() OR NOT isfinite((NEW.review_payload->>'next_review_at')::timestamptz)) THEN RAISE EXCEPTION 'PCR_FINAL_REVIEW_DUE' USING ERRCODE='23514';END IF;
  v_sha:=public.pcr_v2_sha(public.pcr_v2_manifest(NEW.course_id,NEW.marketplace_id));
  IF v_sha IS DISTINCT FROM NEW.edition_sha256 THEN RAISE EXCEPTION 'PCR_FINAL_EDITION_CHANGED' USING ERRCODE='40001';END IF;
  IF NEW.event_kind='publication_recorded' AND NOT EXISTS(SELECT 1 FROM public.marketplace_courses WHERE id=NEW.marketplace_id AND course_id=NEW.course_id AND is_validated) THEN RAISE EXCEPTION 'PCR_FINAL_PUBLICATION_CHANGED' USING ERRCODE='40001';END IF;
 END IF;
 RETURN NEW;
END $f$;
CREATE FUNCTION public.pcr_v2_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $f$
BEGIN RAISE EXCEPTION 'PCR_IMMUTABLE_EVENT_HISTORY' USING ERRCODE='55000';END $f$;

CREATE FUNCTION public.pcr_v2_source_truncate() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE v_own boolean;
BEGIN
 -- Protect only actual current-own source rows affected by this TRUNCATE.
 -- Private historical reviews alone never block a client-only shared table.
 IF TG_TABLE_NAME='courses' THEN SELECT EXISTS(SELECT 1 FROM public.courses WHERE organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95') INTO v_own;
 ELSIF TG_TABLE_NAME IN ('course_modules','lessons','course_documents') THEN
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I s JOIN public.courses c ON c.id=s.course_id WHERE c.organization_id=$1)',TG_TABLE_NAME) INTO v_own USING '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid;
 ELSIF TG_TABLE_NAME IN ('test_questions','lesson_attachments') THEN
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I s JOIN public.lessons l ON l.id=s.lesson_id JOIN public.courses c ON c.id=l.course_id WHERE c.organization_id=$1)',TG_TABLE_NAME) INTO v_own USING '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid;
 ELSIF TG_TABLE_NAME='library_documents' THEN
  SELECT EXISTS(SELECT 1 FROM public.library_documents b JOIN public.course_documents d ON d.library_document_id=b.id JOIN public.courses c ON c.id=d.course_id WHERE c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95') INTO v_own;
 ELSE RAISE EXCEPTION 'PCR_INTERNAL_SOURCE_TABLE';END IF;
 IF v_own THEN RAISE EXCEPTION 'PCR_OWN_SOURCE_TRUNCATE_UNSUPPORTED' USING ERRCODE='55000';END IF;
 RETURN NULL;
END $f$;

CREATE TRIGGER pcr_events_immutable BEFORE UPDATE OR DELETE ON public.platform_course_publication_review_events FOR EACH ROW EXECUTE FUNCTION public.pcr_v2_immutable();
CREATE TRIGGER pcr_events_no_truncate BEFORE TRUNCATE ON public.platform_course_publication_review_events FOR EACH STATEMENT EXECUTE FUNCTION public.pcr_v2_immutable();
CREATE CONSTRAINT TRIGGER pcr_final_claim AFTER INSERT ON public.platform_course_publication_review_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.pcr_v2_final_claim();
CREATE TRIGGER pcr_own_publication_before BEFORE INSERT OR UPDATE ON public.marketplace_courses FOR EACH ROW EXECUTE FUNCTION public.pcr_v2_listing_before();
CREATE TRIGGER pcr_own_publication_after AFTER INSERT OR UPDATE ON public.marketplace_courses FOR EACH ROW EXECUTE FUNCTION public.pcr_v2_listing_after();

-- Run after current UC013 and PLP BEFORE guards; their ordering, policies and
-- existing invalidation functions are untouched. Source writes use try-locks.
DO $f$ DECLARE v_table text;BEGIN
 FOREACH v_table IN ARRAY ARRAY['courses','course_modules','lessons','test_questions','lesson_attachments','course_documents','library_documents'] LOOP
  EXECUTE format('CREATE TRIGGER zzzzzzzz_pcr_source_classification BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.pcr_v2_source_before()',v_table);
  EXECUTE format('CREATE TRIGGER zzzzzzzz_pcr_source_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.pcr_v2_source_truncate()',v_table);
 END LOOP;
END $f$;
CREATE TRIGGER pcr_own_scope_entry_invalidate AFTER INSERT OR UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.pcr_v2_own_entry_invalidate();
CREATE TRIGGER pcr_course_delete_witness_cleanup AFTER DELETE ON public.courses FOR EACH STATEMENT EXECUTE FUNCTION public.pcr_v2_delete_witness_cleanup();
CREATE TRIGGER pcr_lesson_delete_witness_cleanup AFTER DELETE ON public.lessons FOR EACH STATEMENT EXECUTE FUNCTION public.pcr_v2_delete_witness_cleanup();
-- SOURCE PROPOSAL ONLY: keep the two existing course/lesson AFTER DELETE
-- statement hooks; add these four leaf/intermediate drain opportunities.
CREATE TRIGGER pcr_module_delete_witness_cleanup AFTER DELETE ON public.course_modules FOR EACH STATEMENT EXECUTE FUNCTION public.pcr_v2_delete_witness_cleanup();
CREATE TRIGGER pcr_question_delete_witness_cleanup AFTER DELETE ON public.test_questions FOR EACH STATEMENT EXECUTE FUNCTION public.pcr_v2_delete_witness_cleanup();
CREATE TRIGGER pcr_attachment_delete_witness_cleanup AFTER DELETE ON public.lesson_attachments FOR EACH STATEMENT EXECUTE FUNCTION public.pcr_v2_delete_witness_cleanup();
CREATE TRIGGER pcr_document_delete_witness_cleanup AFTER DELETE ON public.course_documents FOR EACH STATEMENT EXECUTE FUNCTION public.pcr_v2_delete_witness_cleanup();
CREATE TRIGGER pcr_library_invalidate AFTER INSERT OR UPDATE OR DELETE ON public.library_documents FOR EACH ROW EXECUTE FUNCTION public.pcr_v2_library_after();

-- SOURCE PROPOSAL: strip inherited ACL entries only from the fixed objects created above.
-- Existing expected GRANT statements and strict postflight guards remain after this block.
DO $new_acl_reset_core$
DECLARE
 v_signatures text[]:=ARRAY['public.pcr_v2_sha(jsonb)','public.pcr_v2_actor(boolean)','public.pcr_v2_resource_ids(uuid)','public.pcr_v2_lock(uuid[],text,text,boolean)','public.pcr_v2_touch_scope(uuid,text)','public.pcr_v2_touch_library(uuid[])','public.pcr_v2_parent_courses(uuid[],boolean)','public.pcr_v2_parent_lesson(uuid,boolean,boolean)','public.pcr_v2_library_parents(uuid[])','public.pcr_v2_claim_touch(uuid)','public.pcr_v2_delete_witness_cleanup()','public.pcr_v2_enter(uuid)','public.pcr_v2_manifest(uuid,uuid)','public.pcr_v2_blockers(uuid,jsonb)','public.pcr_v2_readiness(uuid)','public.read_platform_course_publication_readiness(uuid)','public.submit_platform_course_publication_proposal(uuid,text,jsonb,uuid)','public.record_platform_course_publication_review(uuid,uuid,text,text,text,timestamptz,uuid)','public.pcr_v2_source_scopes(text,jsonb)','public.pcr_v2_source_before()','public.pcr_v2_own_entry_invalidate()','public.pcr_v2_library_after()','public.pcr_v2_listing_before()','public.pcr_v2_listing_after()','public.publish_platform_course_proposal(uuid,uuid,text,uuid)','public.pcr_v2_final_claim()','public.pcr_v2_immutable()','public.pcr_v2_source_truncate()']::text[];
 v_relations text[]:=ARRAY['public.platform_course_publication_review_events','public.platform_course_publication_invocations','public.platform_course_publication_scope_revisions','public.platform_course_publication_library_revisions','public.platform_course_publication_deleted_parents','public.platform_course_publication_review_events_sequence_seq']::text[];
 v_kinds text[]:=ARRAY['r','r','r','r','r','S']::text[];
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
END;$new_acl_reset_core$;

-- Internal helpers are not APIs and cannot be called by tenants or services.
DO $f$ DECLARE v_function regprocedure;BEGIN
 FOR v_function IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'pcr_v2_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',v_function);
 END LOOP;
END $f$;
REVOKE ALL ON FUNCTION public.read_platform_course_publication_readiness(uuid),public.submit_platform_course_publication_proposal(uuid,text,jsonb,uuid),public.record_platform_course_publication_review(uuid,uuid,text,text,text,timestamptz,uuid),public.publish_platform_course_proposal(uuid,uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_platform_course_publication_readiness(uuid),public.submit_platform_course_publication_proposal(uuid,text,jsonb,uuid),public.record_platform_course_publication_review(uuid,uuid,text,text,text,timestamptz,uuid),public.publish_platform_course_proposal(uuid,uuid,text,uuid) TO authenticated;

-- Private generation seed only: no content, flag, dossier, approval, old
-- attempt or result is changed. DDL locks prevent a concurrent missing seed.
INSERT INTO public.platform_course_publication_scope_revisions(course_id,active)
 SELECT id,true FROM public.courses WHERE organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95';

COMMIT;
