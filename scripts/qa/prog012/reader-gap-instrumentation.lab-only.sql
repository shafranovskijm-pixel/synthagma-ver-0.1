-- TEST SOURCE ONLY. NOT A PRODUCT MIGRATION. NO DATABASE HAS EXECUTED THIS.
-- Root must independently review the isolated fixture driver and establish its
-- loopback/unique-database/PID/empty-lab gates before installation.
-- Only synthetic actors, accounts, receipts and course rows may be used.
-- This deliberate pause is never installed in production or committed to Git.
-- Save exact candidate reader body, install this within a disposable lab, and
-- restore exact candidate body after each instrumented schedule. Its observations
-- supplement uninstrumented positive/negative tests; they do not prove provider parity.
CREATE SCHEMA pcf_reader_r4_lab;
REVOKE ALL ON SCHEMA pcf_reader_r4_lab FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION pcf_reader_r4_lab.pause_after_fast_check() RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $lab$
BEGIN
 PERFORM pg_advisory_lock(28,1401);
 PERFORM pg_advisory_unlock(28,1401);
END;$lab$;
REVOKE ALL ON FUNCTION pcf_reader_r4_lab.pause_after_fast_check() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.read_platform_course_file_receipt(p_receipt_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE r public.platform_course_file_receipts;v_user uuid:=auth.uid();v_admin boolean;v_course public.courses;v_binding jsonb;v_manifest_sha text;v_allowed boolean:=false;
BEGIN
 -- New byte-reader RPC has a fresh-snapshot contract; never change caller isolation.
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'PCF_READ_RPC_READ_COMMITTED_REQUIRED' USING ERRCODE='25000';END IF;
 IF v_user IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.account_deletion_access_allowed()
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_user AND blocked_at IS NULL AND archived_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_user AND deleted_at IS NULL AND(banned_until IS NULL OR banned_until<=clock_timestamp())) THEN
  RAISE EXCEPTION 'PCF_READ_AUTH_REQUIRED' USING ERRCODE='42501';END IF;
 -- ISOLATED TEST ONLY: deterministic gap after fast auth and before account fence.
 PERFORM pcf_reader_r4_lab.pause_after_fast_check();
 IF NOT pg_try_advisory_xact_lock(hashtextextended(v_user::text,42007)) THEN RAISE EXCEPTION 'PCF_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END IF;
 SELECT * INTO r FROM public.platform_course_file_receipts WHERE id=p_receipt_id;
 IF r.id IS NULL THEN RAISE EXCEPTION 'PCF_RECEIPT_UNAVAILABLE' USING ERRCODE='42501';END IF;
 PERFORM public.pcr_v2_lock(ARRAY[r.course_id],'shared','own-edition');
 BEGIN SELECT * INTO v_course FROM public.courses WHERE id=r.course_id FOR SHARE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PCF_CONTEXT_CHANGED_RETRY' USING ERRCODE='40001';END;
 IF v_course.organization_id IS DISTINCT FROM '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid THEN RAISE EXCEPTION 'PCF_OWN_PLATFORM_SOURCE_REQUIRED' USING ERRCODE='42501';END IF;
 -- A completed block/ban between the fast check and these fences must be seen.
 -- VOLATILE + READ COMMITTED gives this SQL statement a fresh snapshot.
 -- The account fence is still held; callers/writers must honour that protocol.
 IF auth.uid() IS DISTINCT FROM v_user OR auth.role() IS DISTINCT FROM 'authenticated'
 OR NOT public.account_deletion_access_allowed()
 OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_user AND blocked_at IS NULL AND archived_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_user AND deleted_at IS NULL AND(banned_until IS NULL OR banned_until<=clock_timestamp())) THEN
  RAISE EXCEPTION 'PCF_READ_AUTH_REQUIRED' USING ERRCODE='42501';END IF;
 v_admin:=public.has_role('admin'::public.app_role,v_user) AND public.uc_platform_document_action_allowed(v_user,'read');
 IF v_admin THEN
  -- Authorised moderator may inspect a frozen historical proposal before any
  -- decision. This is not a learner preview or a new current approval claim.
  v_allowed:=true;
 ELSE
  IF public.pcf_v1_delivery_capabilities()->>'frozen_reader_implemented' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'PCF_LEARNER_CONSUMER_NOT_ACCEPTED' USING ERRCODE='42501';END IF;
  v_binding:=public.pcf_v1_binding_state(r.course_id,r.reference_kind,r.reference_id);
  IF v_course.is_published IS NOT TRUE OR v_binding->>'receipt_id' IS DISTINCT FROM r.id::text THEN
   RAISE EXCEPTION 'PCF_CURRENT_DELIVERY_UNCONFIRMED' USING ERRCODE='42501';END IF;
  v_manifest_sha:=public.pcr_v2_sha(public.pcr_v2_manifest(r.course_id,r.marketplace_id));
  IF NOT EXISTS(SELECT 1 FROM public.marketplace_courses m JOIN public.platform_course_publication_review_events e ON e.marketplace_id=m.id
   WHERE m.id=r.marketplace_id AND m.course_id=r.course_id AND m.is_validated AND e.event_kind='publication_recorded' AND e.edition_sha256=v_manifest_sha) THEN
   RAISE EXCEPTION 'PCF_CURRENT_PUBLICATION_REQUIRED' USING ERRCODE='42501';END IF;
  IF r.reference_kind='course_document' THEN
   SELECT public.can_access_course(d.course_id,'courses.read') OR(d.visible_to_students AND d.allow_download AND public.can_access_course_as_learner(d.course_id))
    INTO v_allowed FROM public.course_documents d WHERE d.id=r.reference_id AND d.course_id=r.course_id
    AND(d.library_document_id IS NULL OR public.can_read_electronic_library_document(d.library_document_id));
  ELSE
   SELECT public.can_read_lesson_attachment(a.lesson_id) INTO v_allowed FROM public.lesson_attachments a JOIN public.lessons l ON l.id=a.lesson_id
    WHERE a.id=r.reference_id AND l.course_id=r.course_id;
  END IF;
 END IF;
 IF v_allowed IS DISTINCT FROM true OR octet_length(r.file_bytes)<>r.byte_length OR encode(sha256(r.file_bytes),'hex')<>r.file_sha256 THEN
  RAISE EXCEPTION 'PCF_FILE_READ_DENIED_OR_INTEGRITY' USING ERRCODE='42501';END IF;
 RETURN public.pcf_v1_receipt_summary(r.id,false)||jsonb_build_object('bytes_hex',encode(r.file_bytes,'hex'),
  'delivery_scope',CASE WHEN v_admin THEN 'authorised_moderator_frozen_context_not_learner_acceptance' ELSE 'current_own_course_authorised_learner' END,
  'consumer_acceptance',public.pcf_v1_delivery_capabilities());
END;$f$;
