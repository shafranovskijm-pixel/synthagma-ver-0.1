-- AD04: private, reservation-scoped database observation; no byte-attestation or business mutation.
BEGIN;
CREATE OR REPLACE FUNCTION public.uc_observe_admission_sealed_object(p_actor_id uuid,p_case_id uuid,p_reservation_id uuid,p_expected_revision bigint,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $ad04$
DECLARE c0 public.uc_admission_cases;c public.uc_admission_cases;r public.uc_admission_evidence_reservations;src jsonb;obj jsonb;sealed_path text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF p_actor_id IS NULL OR p_case_id IS NULL OR p_reservation_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 THEN PERFORM public.uc_admission_error('INVALID_INPUT');END IF;
 IF p_expected_revision>=9007199254740991 THEN PERFORM public.uc_admission_error('LIMIT_REACHED');END IF;
 SELECT * INTO c0 FROM public.uc_admission_cases WHERE id=p_case_id;
 SELECT * INTO r FROM public.uc_admission_evidence_reservations WHERE id=p_reservation_id AND case_id=p_case_id AND actor_id=p_actor_id;
 IF c0.id IS NULL OR r.id IS NULL THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_admission_lock(p_actor_id,c0.organization_id,c0.user_id,c0.group_id,c0.enrollment_id,c0.responsible_id);
 SELECT * INTO c FROM public.uc_admission_cases WHERE id=p_case_id FOR SHARE NOWAIT;
 SELECT * INTO r FROM public.uc_admission_evidence_reservations WHERE id=p_reservation_id FOR SHARE NOWAIT;
 IF c.id IS NULL OR r.id IS NULL OR r.actor_id IS DISTINCT FROM p_actor_id OR r.case_id IS DISTINCT FROM c.id
 OR c.organization_id IS DISTINCT FROM c0.organization_id OR c.user_id IS DISTINCT FROM c0.user_id OR c.group_id IS DISTINCT FROM c0.group_id OR c.enrollment_id IS DISTINCT FROM c0.enrollment_id OR c.responsible_id IS DISTINCT FROM c0.responsible_id
 OR r.organization_id IS DISTINCT FROM c.organization_id OR r.user_id IS DISTINCT FROM c.user_id THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_admission_staff_allowed(p_actor_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,true) OR NOT public.uc_admission_staff_allowed(p_actor_id,c.organization_id,c.user_id,c.group_id,c.enrollment_id,false) THEN PERFORM public.uc_admission_error('ACCESS_DENIED');END IF;
 IF r.expected_revision IS DISTINCT FROM p_expected_revision OR c.revision IS DISTINCT FROM p_expected_revision THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
 IF r.state NOT IN('prepared','sealed') OR r.expires_at<=clock_timestamp() THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
 IF r.state='sealed' AND r.commit_request_id IS DISTINCT FROM p_request_id THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END IF;
 IF c.program_ref IS DISTINCT FROM r.program_ref OR c.program_ref IS DISTINCT FROM public.uc_admission_program(c.organization_id,c.user_id,c.group_id,c.enrollment_id) THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 PERFORM public.uc_admission_lock_source(r.id);src:=public.uc_admission_source_proof(r.id,p_actor_id);
 IF src IS NULL OR(r.state='sealed' AND r.source_proof IS DISTINCT FROM src) THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 sealed_path:=r.user_id::text||'/'||r.organization_id::text||'/'||r.case_id::text||'/sealed/'||r.evidence_version_id::text;
 PERFORM 1 FROM storage.objects WHERE bucket_id='admission-case-evidence' AND name=sealed_path FOR SHARE NOWAIT;
 obj:=public.uc_admission_object('admission-case-evidence',sealed_path,NULL);
 IF obj IS NULL OR obj->>'byte_size' IS DISTINCT FROM src->>'byte_size' OR obj->>'mime_type' IS DISTINCT FROM src->>'mime_type' THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF r.state='sealed' AND((obj->>'object_id')::uuid IS DISTINCT FROM(r.sealed_proof->>'object_id')::uuid OR(obj->>'updated_at')::timestamptz IS DISTINCT FROM(r.sealed_proof->>'updated_at')::timestamptz OR obj->>'byte_size' IS DISTINCT FROM r.sealed_proof->>'byte_size' OR obj->>'mime_type' IS DISTINCT FROM r.sealed_proof->>'mime_type') THEN PERFORM public.uc_admission_error('SOURCE_CHANGED');END IF;
 IF r.expires_at<=clock_timestamp() THEN PERFORM public.uc_admission_error('SOURCE_UNAVAILABLE');END IF;
 RETURN jsonb_build_object('schema_version',1,'actor_id',p_actor_id,'case_id',c.id,'reservation_id',r.id,'evidence_version_id',r.evidence_version_id,'expected_revision',p_expected_revision,'request_id',p_request_id,'source_fingerprint',src->>'fingerprint','object',obj);
EXCEPTION WHEN lock_not_available THEN PERFORM public.uc_admission_error('REVISION_CONFLICT');END;
$ad04$;
-- This function has one intended caller: the service worker acting for the already authenticated reservation actor.
DO $acl$
DECLARE g record;
BEGIN
 REVOKE ALL ON FUNCTION public.uc_observe_admission_sealed_object(uuid,uuid,uuid,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
 FOR g IN SELECT DISTINCT grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid='public.uc_observe_admission_sealed_object(uuid,uuid,uuid,bigint,uuid)'::regprocedure),acldefault('f',(SELECT proowner FROM pg_proc WHERE oid='public.uc_observe_admission_sealed_object(uuid,uuid,uuid,bigint,uuid)'::regprocedure)))) WHERE grantee<>0 AND grantee<>(SELECT proowner FROM pg_proc WHERE oid='public.uc_observe_admission_sealed_object(uuid,uuid,uuid,bigint,uuid)'::regprocedure) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION public.uc_observe_admission_sealed_object(uuid,uuid,uuid,bigint,uuid) FROM %I',pg_get_userbyid(g.grantee));
 END LOOP;
 GRANT EXECUTE ON FUNCTION public.uc_observe_admission_sealed_object(uuid,uuid,uuid,bigint,uuid) TO service_role;
END;$acl$;
COMMIT;
