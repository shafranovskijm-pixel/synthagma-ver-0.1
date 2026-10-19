-- Prospective private identification photographs and explicit staff decisions.
-- No backfill, legacy-media migration, admission/biometric claim or learning grant.
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM(VALUES
 ('public.save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)','ef4299140c264616b0854e95fea0af2a'),
 ('public.account_deletion_storage_write_guard()','6df5876891400b3db3f47047e3aa2502'),
 ('public.account_deletion_files(uuid)','c6fbcb05a1bd18c141980bcf4088472a'),
 ('public.account_deletion_personal_row_counts(uuid)','ea286986f6a388238464c48dd8a0fde5'),
 ('public.account_deletion_erase_data(uuid,text)','d0279bdfbfc4d97a1f0b32c47cc475ab'),
 ('public.account_deletion_snapshot(uuid)','90a1b279ec2d55a922f5097b1cdac0a4'),
 ('public.account_deletion_subject_write_guard()','cd0003cc49bdf9a3d074c9e624146e46'),
 ('public.get_org_staff_permissions(uuid,uuid)','c0ea40b20bbd1a71aa31cdbcbb7fc0b3'),
 ('public.has_org_staff_permission(uuid,uuid,text)','3d1fedafe94778fa19dd47acb71a3782'),
 ('public.has_role(public.app_role,uuid)','20c46f708cc2e7fa51b640290151a59e'),
 ('public.has_role(uuid,public.app_role)','82a7fa1cd06301bb83b010bc315aee0b'),
 ('public.is_org_owner(uuid,uuid)','362aca6afc26c775be594843258b2ab2'),
 ('public.is_student_profile(uuid,uuid)','92c79c1ec4600ef54941dc9590b39aa8'),
 ('public.uc_student_frdo_pair_valid(uuid,uuid)','ff48411960f670646f98213ad648cb4f'),
 ('public.uc_student_frdo_staff_org_allowed(uuid,uuid,text)','541b10208fdf1b4788ce4eae588110a6'),
 ('public.update_updated_at_column()','3210625d1c794f6db7b3c3defc5984dd'),
 ('public.uc_student_frdo_staff_can_write(uuid,uuid,uuid,text)','5a51f534b77abd13215626afde0b56e7'),
 ('public.uc_document_scope_allowed(uuid,uuid,uuid)','2a7407e7d178c7561b1d390f0884c6b6'),
 ('public.uc_enrollment_delete_has_witness(uuid,uuid,uuid)','ee28fb97a36686314030ea24c2635f4d'),
 ('public.uc_platform_document_action_allowed(uuid,text)','e5a1436d0cc46218d379c3ffec8c0d0d')
 ) f(signature,hash) WHERE to_regprocedure(signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>hash)
 THEN RAISE EXCEPTION 'Identification: unreviewed authority/registration/erasure baseline';END IF;
 IF(SELECT count(*)<>15 OR md5(jsonb_agg(jsonb_build_array(column_name,udt_name,is_nullable,column_default) ORDER BY column_name)::text)<>'36121adb3c985d903da4c96a3f210d0d' FROM information_schema.columns WHERE table_schema='public' AND table_name='video_identifications')
 OR EXISTS(SELECT 1 FROM storage.buckets WHERE id='student-identification-media') THEN RAISE EXCEPTION 'Identification: unreviewed video/bucket baseline';END IF;
END $preflight$;

CREATE TABLE public.uc_identification_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,organization_id uuid NOT NULL,enrollment_id uuid,
 scope_kind text NOT NULL CHECK(scope_kind IN('subject','enrollment')),scope_course_id uuid,
 projection_owned boolean NOT NULL,origin text NOT NULL CHECK(origin IN('prospective','legacy_overlay')),
 source_kind text NOT NULL CHECK(source_kind IN('self_photo','manual_staff_claim','legacy_unclassified')),
 status text NOT NULL CHECK(status IN('pending','verified','rejected','expired')),revision bigint NOT NULL DEFAULT 1 CHECK(revision>=1),
 current_source_id uuid,submitted_at timestamptz,decided_at timestamptz,decided_by uuid,rejection_reason text CHECK(length(rejection_reason)<=1000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((scope_kind='subject' AND enrollment_id IS NULL)OR(scope_kind='enrollment' AND enrollment_id IS NOT NULL))
);
CREATE INDEX uc_identification_record_subject ON public.uc_identification_records(organization_id,user_id,created_at DESC,id);
CREATE TABLE public.uc_identification_sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),identification_id uuid NOT NULL REFERENCES public.uc_identification_records(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL,organization_id uuid NOT NULL,reservation_request_id uuid NOT NULL,bucket text NOT NULL CHECK(bucket='student-identification-media'),
 path text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,state text NOT NULL CHECK(state IN('prepared','committed')),
 storage_object_id uuid,byte_sha256 text CHECK(byte_sha256~'^[a-f0-9]{64}$'),byte_size bigint CHECK(byte_size BETWEEN 1 AND 5242880),
 mime_type text NOT NULL DEFAULT 'image/jpeg' CHECK(mime_type='image/jpeg'),object_created_at timestamptz,object_updated_at timestamptz,
 committed_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(state<>'committed' OR(storage_object_id IS NOT NULL AND byte_sha256 IS NOT NULL AND byte_size IS NOT NULL AND object_created_at IS NOT NULL AND object_updated_at IS NOT NULL AND committed_at IS NOT NULL))
);
CREATE INDEX uc_identification_source_subject ON public.uc_identification_sources(user_id,identification_id);
CREATE TABLE public.uc_identification_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),identification_id uuid NOT NULL REFERENCES public.uc_identification_records(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL,organization_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision>=1),source_id uuid,
 action text NOT NULL CHECK(action IN('submitted','verified','rejected','manual_verified','reset')),from_status text,to_status text NOT NULL,
 actor_id uuid,at timestamptz NOT NULL DEFAULT clock_timestamp(),safe_reason text CHECK(length(safe_reason)<=1000),UNIQUE(identification_id,revision)
);
CREATE INDEX uc_identification_event_subject ON public.uc_identification_events(user_id,at DESC,id);
CREATE TABLE public.uc_identification_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN('prepare','submit','decision')),
 request_id uuid NOT NULL,payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),identification_id uuid NOT NULL,source_id uuid,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(actor_id,operation,request_id)
);
CREATE INDEX uc_identification_request_record ON public.uc_identification_requests(identification_id,actor_id);
CREATE TABLE public.uc_identification_write_contexts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),backend_pid integer NOT NULL DEFAULT pg_backend_pid(),transaction_id bigint NOT NULL DEFAULT txid_current(),
 kind text NOT NULL CHECK(kind IN('submit','review','registration_manual','subject_erase','reviewer_erase','projection_cascade')),
 identification_id uuid,source_id uuid,organization_id uuid,user_id uuid NOT NULL,actor_id uuid,enrollment_id uuid,expected_revision bigint,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX uc_identification_write_witness ON public.uc_identification_write_contexts(transaction_id,backend_pid,kind,identification_id,user_id);
DO $private$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['uc_identification_records','uc_identification_sources','uc_identification_events','uc_identification_requests','uc_identification_write_contexts'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $private$;

CREATE FUNCTION public.uc_identification_actor_allowed(p_actor uuid,p_write boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p_actor IS NOT NULL AND p_write IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)
 AND public.uc_platform_document_action_allowed(p_actor,CASE WHEN p_write THEN 'write' ELSE 'read' END)
 AND NOT EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=p_actor AND(a.expires_at<=now() OR p_write AND a.role NOT IN('super_admin','admin')))
 AND(NOT p_write OR NOT public.has_role(p_actor,'sales_manager'::public.app_role)),false)
$fn$;
CREATE FUNCTION public.uc_identification_target_allowed(p_org uuid,p_user uuid,p_write boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p_org IS NOT NULL AND p_user IS NOT NULL AND p_write IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org)
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.organization_id=p_org AND(NOT p_write OR p.archived_at IS NULL))
 AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_user AND organization_id IS DISTINCT FROM p_org)
 AND public.is_student_profile(p_user,p_org)
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user),false)
$fn$;
CREATE FUNCTION public.uc_identification_scope_allowed(p_actor uuid,p_org uuid,p_user uuid,p_enrollment uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(
 public.has_role(p_actor,'admin'::public.app_role) OR public.is_org_owner(p_actor,p_org)
 OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org AND s.role<>'teacher' AND(s.expires_at IS NULL OR s.expires_at>now()))
 OR NOT EXISTS(SELECT 1 FROM public.org_staff WHERE user_id=p_actor AND role='teacher')
 OR EXISTS(SELECT 1 FROM public.org_staff s JOIN public.org_staff_document_groups a ON a.staff_id=s.id AND a.organization_id=s.organization_id
 JOIN public.student_groups g ON g.id=a.group_id AND g.organization_id=a.organization_id
 JOIN public.student_group_memberships_effective m ON m.organization_id=g.organization_id AND m.group_id=g.id AND m.user_id=p_user
 WHERE s.user_id=p_actor AND s.organization_id=p_org AND(s.expires_at IS NULL OR s.expires_at>now())
 AND((p_enrollment IS NULL AND(g.course_id IS NULL OR EXISTS(SELECT 1 FROM public.courses c WHERE c.id=g.course_id AND c.organization_id=p_org)))
 OR EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=p_enrollment AND e.user_id=p_user AND c.organization_id=p_org AND g.course_id=e.course_id))),false)
$fn$;
CREATE FUNCTION public.uc_identification_can_review(p_actor uuid,p_org uuid,p_user uuid,p_enrollment uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_identification_actor_allowed(p_actor,true)
 AND public.uc_student_frdo_staff_can_write(p_actor,p_org,p_user,'students.write') AND public.uc_student_frdo_staff_can_write(p_actor,p_org,p_user,'documents.write')
 AND(p_enrollment IS NULL OR EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=p_enrollment AND e.user_id=p_user AND c.organization_id=p_org))
 AND public.uc_identification_scope_allowed(p_actor,p_org,p_user,p_enrollment),false)
$fn$;
CREATE FUNCTION public.uc_identification_can_read(p_actor uuid,p_org uuid,p_user uuid,p_enrollment uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_identification_actor_allowed(p_actor,false) AND public.uc_identification_target_allowed(p_org,p_user,false)
 AND(p_actor=p_user OR public.uc_identification_can_review(p_actor,p_org,p_user,p_enrollment)
 OR(public.has_role(p_actor,'admin'::public.app_role) OR public.is_org_owner(p_actor,p_org)
 OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org AND(s.expires_at IS NULL OR s.expires_at>now())
 AND public.has_org_staff_permission(p_actor,p_org,'students.read') AND public.has_org_staff_permission(p_actor,p_org,'documents.read')))
 AND public.uc_identification_scope_allowed(p_actor,p_org,p_user,p_enrollment)),false)
$fn$;
CREATE FUNCTION public.uc_identification_can_submit(p_actor uuid,p_org uuid,p_user uuid,p_enrollment uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p_actor=p_user AND public.uc_identification_actor_allowed(p_actor,true) AND public.uc_identification_target_allowed(p_org,p_user,true)
 AND(p_enrollment IS NULL OR EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=p_enrollment AND e.user_id=p_user AND c.organization_id=p_org)),false)
$fn$;
CREATE FUNCTION public.uc_identification_lock_mutation(p_actor uuid,p_org uuid,p_user uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE u uuid;BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Identification: READ COMMITTED required' USING ERRCODE='25000';END IF;
 IF p_actor IS NULL OR p_user IS NULL OR p_org IS NULL THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 FOR u IN SELECT DISTINCT x FROM unnest(ARRAY[p_actor,p_user])x ORDER BY x LOOP PERFORM pg_advisory_xact_lock(hashtextextended(u::text,42007));END LOOP;
 IF NOT public.uc_identification_actor_allowed(p_actor,true) OR NOT public.uc_identification_target_allowed(p_org,p_user,true)
 THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.profiles WHERE user_id=p_user AND organization_id=p_org FOR UPDATE;
END;$fn$;
CREATE FUNCTION public.uc_identification_payload(p_value jsonb)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT encode(sha256(convert_to(p_value::text,'UTF8')),'hex')
$fn$;
CREATE FUNCTION public.uc_identification_capabilities(p_actor uuid,p_org uuid,p_user uuid,p_enrollment uuid,p_status text,p_source uuid,p_legacy boolean)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('canSubmit',public.uc_identification_can_submit(p_actor,p_org,p_user,p_enrollment),
 'canReview',public.uc_identification_can_review(p_actor,p_org,p_user,p_enrollment),
 'canReject',p_status='pending' AND public.uc_identification_can_review(p_actor,p_org,p_user,p_enrollment),
 'canReset',p_status IN('verified','rejected') AND public.uc_identification_can_review(p_actor,p_org,p_user,p_enrollment),
 'canReadMedia',p_source IS NOT NULL AND public.uc_identification_can_read(p_actor,p_org,p_user,p_enrollment))
$fn$;
CREATE FUNCTION public.uc_identification_record_dto(p_id uuid,p_actor uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('identificationId',r.id,'organizationId',r.organization_id,'studentUserId',r.user_id,'enrollmentId',r.enrollment_id,
 'revision',r.revision,'status',r.status,'sourceKind',r.source_kind,
 'assurance',CASE WHEN r.status IN('verified','rejected') AND r.decided_at IS NOT NULL THEN 'current_server_review' WHEN r.source_kind='legacy_unclassified' THEN 'historical_unproven' WHEN r.submitted_at IS NOT NULL THEN 'submitted' ELSE 'unreviewed' END,
 'createdAt',r.created_at,'submittedAt',r.submitted_at,'decidedAt',r.decided_at,'rejectionReason',r.rejection_reason,
 'media',CASE WHEN s.id IS NOT NULL THEN jsonb_build_object('identificationId',r.id,'sourceId',s.id) ELSE NULL END,
 'projectionPresent',EXISTS(SELECT 1 FROM public.video_identifications v WHERE v.id=r.id),
 'capabilities',public.uc_identification_capabilities(p_actor,r.organization_id,r.user_id,r.enrollment_id,r.status,s.id,r.origin='legacy_overlay'))
 FROM public.uc_identification_records r LEFT JOIN public.uc_identification_sources s ON s.id=r.current_source_id AND s.identification_id=r.id AND s.state='committed' WHERE r.id=p_id
$fn$;
CREATE FUNCTION public.uc_identification_legacy_dto(p_id uuid,p_actor uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('identificationId',v.id,'organizationId',v.organization_id,'studentUserId',v.user_id,'enrollmentId',v.enrollment_id,
 'revision',0,'status',v.status,'sourceKind','legacy_unclassified','assurance','historical_unproven','createdAt',v.created_at,'submittedAt',NULL,'decidedAt',NULL,
 'rejectionReason',left(v.rejection_reason,1000),'media',NULL,'projectionPresent',true,
 'capabilities',public.uc_identification_capabilities(p_actor,v.organization_id,v.user_id,v.enrollment_id,v.status,NULL,true))
 FROM public.video_identifications v WHERE v.id=p_id AND NOT EXISTS(SELECT 1 FROM public.uc_identification_records r WHERE r.id=v.id)
$fn$;
CREATE FUNCTION public.uc_identification_event_dto(p_id uuid,p_actor uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('eventId',e.id,'identificationId',e.identification_id,'revision',e.revision,'action',e.action,'at',e.at,'reason',e.safe_reason,
 'reviewerUserId',CASE WHEN e.action<>'submitted' AND p_actor<>e.user_id AND public.uc_identification_can_read(p_actor,e.organization_id,e.user_id,r.enrollment_id) THEN e.actor_id ELSE NULL END)
 FROM public.uc_identification_events e JOIN public.uc_identification_records r ON r.id=e.identification_id WHERE e.id=p_id
$fn$;
CREATE FUNCTION public.uc_identification_receipt_result(p_id uuid,p_actor uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE q public.uc_identification_requests;r public.uc_identification_records;v jsonb;BEGIN
 SELECT * INTO q FROM public.uc_identification_requests WHERE id=p_id AND actor_id=p_actor;
 SELECT * INTO r FROM public.uc_identification_records WHERE id=q.identification_id;
 IF q.id IS NULL OR r.id IS NULL OR NOT public.uc_identification_can_read(p_actor,r.organization_id,r.user_id,r.enrollment_id) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 v:=q.result;
 v:=jsonb_set(v,'{record,capabilities}',public.uc_identification_record_dto(r.id,p_actor)->'capabilities');
 RETURN jsonb_set(v,'{replayed}','true'::jsonb);
END;$fn$;

CREATE FUNCTION public.prepare_own_identification_photo(p_organization_id uuid,p_request_id uuid,p_enrollment_id uuid DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();h text;q public.uc_identification_requests;r public.uc_identification_records;s public.uc_identification_sources;v jsonb;c uuid;BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR p_request_id IS NULL THEN RAISE EXCEPTION 'IDENTIFICATION_INVALID_REQUEST' USING ERRCODE='22023';END IF;
 PERFORM public.uc_identification_lock_mutation(a,p_organization_id,a);
 IF NOT public.uc_identification_can_submit(a,p_organization_id,a,p_enrollment_id) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(a::text||':prepare:'||p_request_id::text,114));
 h:=public.uc_identification_payload(jsonb_build_array(p_organization_id,p_enrollment_id));
 SELECT * INTO q FROM public.uc_identification_requests WHERE actor_id=a AND operation='prepare' AND request_id=p_request_id;
 IF FOUND THEN IF q.payload_sha256<>h THEN RAISE EXCEPTION 'IDENTIFICATION_CONFLICT' USING ERRCODE='40001';END IF;RETURN jsonb_set(q.result,'{replayed}','true'::jsonb);END IF;
 IF p_enrollment_id IS NOT NULL THEN SELECT course_id INTO c FROM public.enrollments WHERE id=p_enrollment_id AND user_id=a;END IF;
 INSERT INTO public.uc_identification_records(user_id,organization_id,enrollment_id,scope_kind,scope_course_id,projection_owned,origin,source_kind,status)
 VALUES(a,p_organization_id,p_enrollment_id,CASE WHEN p_enrollment_id IS NULL THEN 'subject' ELSE 'enrollment' END,c,true,'prospective','self_photo','pending') RETURNING * INTO r;
 s.id:=gen_random_uuid();s.path:=a::text||'/'||p_organization_id::text||'/'||r.id::text||'/'||s.id::text||'/capture.jpg';
 INSERT INTO public.uc_identification_sources(id,identification_id,user_id,organization_id,reservation_request_id,bucket,path,expires_at,state)
 VALUES(s.id,r.id,a,p_organization_id,p_request_id,'student-identification-media',s.path,clock_timestamp()+interval '30 minutes','prepared') RETURNING * INTO s;
 UPDATE public.uc_identification_records SET current_source_id=s.id WHERE id=r.id;
 v:=jsonb_build_object('contractVersion',1,'replayed',false,'identificationId',r.id,'sourceId',s.id,'revision',1,'bucket',s.bucket,'path',s.path,'expiresAt',s.expires_at,'maxBytes',5242880,'mimeType','image/jpeg');
 INSERT INTO public.uc_identification_requests(actor_id,operation,request_id,payload_sha256,identification_id,source_id,result)VALUES(a,'prepare',p_request_id,h,r.id,s.id,v);
 RETURN v;
END;$fn$;

CREATE FUNCTION public.uc_identification_object(p_source uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $fn$
 SELECT jsonb_build_object('storageObjectId',o.id,'objectCreatedAt',o.created_at,'objectUpdatedAt',o.updated_at,'ownerId',coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner'),
 'byteSize',(o.metadata->>'size')::bigint,'mimeType',o.metadata->>'mimetype')
 FROM public.uc_identification_sources s JOIN storage.objects o ON o.bucket_id=s.bucket AND o.name=s.path
 WHERE s.id=p_source AND s.path=s.user_id::text||'/'||s.organization_id::text||'/'||s.identification_id::text||'/'||s.id::text||'/capture.jpg'
 AND coalesce(to_jsonb(o)->>'owner_id',to_jsonb(o)->>'owner')=s.user_id::text
 AND o.created_at>=s.created_at AND o.created_at<=s.expires_at AND o.metadata->>'mimetype'='image/jpeg'
 AND CASE WHEN o.metadata->>'size'~'^[0-9]{1,7}$' THEN(o.metadata->>'size')::bigint BETWEEN 1 AND 5242880 ELSE false END
 AND(s.state='prepared' OR(s.storage_object_id=o.id AND s.object_created_at=o.created_at AND s.object_updated_at=o.updated_at AND s.byte_size=(o.metadata->>'size')::bigint))
$fn$;
CREATE FUNCTION public.uc_identification_submit_context(p_identification_id uuid,p_source_id uuid,p_expected_revision bigint,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();r public.uc_identification_records;s public.uc_identification_sources;q public.uc_identification_requests;o jsonb;v jsonb;h text;BEGIN
 SELECT * INTO r FROM public.uc_identification_records WHERE id=p_identification_id;
 SELECT * INTO s FROM public.uc_identification_sources WHERE id=p_source_id AND identification_id=r.id AND user_id=r.user_id AND organization_id=r.organization_id;
 IF auth.role() IS DISTINCT FROM 'authenticated' OR s.id IS NULL OR r.source_kind<>'self_photo' OR r.current_source_id IS DISTINCT FROM s.id
 OR NOT public.uc_identification_can_submit(a,r.organization_id,r.user_id,r.enrollment_id) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_expected_revision>9007199254740991 THEN RAISE EXCEPTION 'IDENTIFICATION_INVALID_REQUEST' USING ERRCODE='22023';END IF;
 h:=public.uc_identification_payload(jsonb_build_array(r.id,s.id,p_expected_revision));
 SELECT * INTO q FROM public.uc_identification_requests WHERE actor_id=a AND operation='submit' AND request_id=p_request_id;
 IF q.id IS NOT NULL AND(q.payload_sha256<>h OR q.identification_id<>r.id OR q.source_id<>s.id) THEN RAISE EXCEPTION 'IDENTIFICATION_CONFLICT' USING ERRCODE='40001';END IF;
 IF s.state='committed' AND q.id IS NULL OR s.state='prepared' AND(r.revision<>p_expected_revision OR q.id IS NOT NULL) THEN RAISE EXCEPTION 'IDENTIFICATION_CONFLICT' USING ERRCODE='40001';END IF;
 IF s.state='prepared' AND s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'IDENTIFICATION_UPLOAD_EXPIRED';END IF;
 o:=public.uc_identification_object(s.id);IF o IS NULL THEN RAISE EXCEPTION 'IDENTIFICATION_SOURCE_UNAVAILABLE';END IF;
 v:=jsonb_build_object('contractVersion',1,'mode',s.state,'actorId',a,'organizationId',r.organization_id,'studentUserId',r.user_id,'enrollmentId',r.enrollment_id,
 'identificationId',r.id,'sourceId',s.id,'revision',r.revision,'bucket',s.bucket,'path',s.path,'expiresAt',s.expires_at,'maxBytes',5242880,'mimeType','image/jpeg',
 'byteSha256',s.byte_sha256,'replayResult',CASE WHEN q.id IS NOT NULL THEN public.uc_identification_receipt_result(q.id,a) ELSE NULL END);
 RETURN v||o;
END;$fn$;

CREATE FUNCTION public.uc_commit_identification_photo(p_actor_id uuid,p_identification_id uuid,p_source_id uuid,p_expected_revision bigint,p_request_id uuid,p_storage_object_id uuid,p_object_updated_at timestamptz,p_byte_sha256 text,p_byte_size bigint)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.uc_identification_records;s public.uc_identification_sources;q public.uc_identification_requests;h text;o jsonb;w uuid;e uuid;v jsonb;BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.uc_identification_records WHERE id=p_identification_id;
 PERFORM public.uc_identification_lock_mutation(p_actor_id,r.organization_id,r.user_id);
 IF NOT public.uc_identification_can_submit(p_actor_id,r.organization_id,r.user_id,r.enrollment_id) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_byte_sha256 IS NULL OR p_byte_sha256!~'^[a-f0-9]{64}$' OR p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 5242880 OR p_storage_object_id IS NULL OR p_object_updated_at IS NULL THEN RAISE EXCEPTION 'IDENTIFICATION_INVALID_REQUEST' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::text||':submit:'||p_request_id::text,114));
 SELECT * INTO r FROM public.uc_identification_records WHERE id=p_identification_id FOR UPDATE;
 SELECT * INTO s FROM public.uc_identification_sources WHERE id=p_source_id AND identification_id=r.id AND user_id=r.user_id AND organization_id=r.organization_id FOR UPDATE;
 IF s.id IS NULL OR r.source_kind<>'self_photo' OR r.current_source_id IS DISTINCT FROM s.id THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 h:=public.uc_identification_payload(jsonb_build_array(r.id,s.id,p_expected_revision));
 SELECT * INTO q FROM public.uc_identification_requests WHERE actor_id=p_actor_id AND operation='submit' AND request_id=p_request_id;
 IF FOUND THEN IF q.payload_sha256<>h OR q.identification_id<>r.id OR q.source_id<>s.id OR s.storage_object_id IS DISTINCT FROM p_storage_object_id OR s.object_updated_at IS DISTINCT FROM p_object_updated_at OR s.byte_sha256 IS DISTINCT FROM p_byte_sha256 OR s.byte_size IS DISTINCT FROM p_byte_size THEN RAISE EXCEPTION 'IDENTIFICATION_CONFLICT' USING ERRCODE='40001';END IF;RETURN public.uc_identification_receipt_result(q.id,p_actor_id);END IF;
 IF r.revision<>p_expected_revision OR s.state<>'prepared' OR r.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'IDENTIFICATION_CONFLICT' USING ERRCODE='40001';END IF;
 IF s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'IDENTIFICATION_UPLOAD_EXPIRED';END IF;
 o:=public.uc_identification_object(s.id);
 IF o IS NULL OR(o->>'storageObjectId')::uuid IS DISTINCT FROM p_storage_object_id OR(o->>'objectUpdatedAt')::timestamptz IS DISTINCT FROM p_object_updated_at OR(o->>'byteSize')::bigint IS DISTINCT FROM p_byte_size THEN RAISE EXCEPTION 'IDENTIFICATION_SOURCE_UNAVAILABLE';END IF;
 UPDATE public.uc_identification_sources SET state='committed',storage_object_id=p_storage_object_id,byte_sha256=p_byte_sha256,byte_size=p_byte_size,
 object_created_at=(o->>'objectCreatedAt')::timestamptz,object_updated_at=p_object_updated_at,committed_at=clock_timestamp() WHERE id=s.id;
 UPDATE public.uc_identification_records SET revision=revision+1,status='pending',submitted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
 INSERT INTO public.uc_identification_write_contexts(kind,identification_id,source_id,organization_id,user_id,actor_id,expected_revision)
 VALUES('submit',r.id,s.id,r.organization_id,r.user_id,p_actor_id,p_expected_revision) RETURNING id INTO w;
 INSERT INTO public.video_identifications(id,user_id,organization_id,enrollment_id,status,created_at)VALUES(r.id,r.user_id,r.organization_id,r.enrollment_id,'pending',r.created_at);
 DELETE FROM public.uc_identification_write_contexts WHERE id=w;
 INSERT INTO public.uc_identification_events(identification_id,user_id,organization_id,revision,source_id,action,to_status,actor_id)VALUES(r.id,r.user_id,r.organization_id,r.revision,s.id,'submitted','pending',p_actor_id) RETURNING id INTO e;
 v:=jsonb_build_object('contractVersion',1,'replayed',false,'record',public.uc_identification_record_dto(r.id,p_actor_id),'event',public.uc_identification_event_dto(e,p_actor_id));
 INSERT INTO public.uc_identification_requests(actor_id,operation,request_id,payload_sha256,identification_id,source_id,result)VALUES(p_actor_id,'submit',p_request_id,h,r.id,s.id,v);
 RETURN v;
END;$fn$;

CREATE FUNCTION public.uc_apply_identification_decision(p_actor uuid,p_org uuid,p_user uuid,p_request uuid,p_action text,p_id uuid,p_revision bigint,p_reason text,p_registration boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.uc_identification_records;q public.uc_identification_requests;old public.video_identifications;h text;reason text:=nullif(btrim(p_reason),'');v jsonb;w uuid;e uuid;previous text;course uuid;BEGIN
 PERFORM public.uc_identification_lock_mutation(p_actor,p_org,p_user);
 IF NOT public.uc_identification_can_review(p_actor,p_org,p_user,NULL) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_action IS NULL OR p_action NOT IN('verify','reject','manual_verify','reset') OR p_revision IS NULL OR p_revision<0 OR p_revision>9007199254740991
 OR length(reason)>1000 OR reason~'[[:cntrl:]]' OR(p_action='reject' AND reason IS NULL)
 OR(p_action='manual_verify' AND(p_id IS NOT NULL OR p_revision<>0)) OR(p_action<>'manual_verify' AND p_id IS NULL)
 THEN RAISE EXCEPTION 'IDENTIFICATION_INVALID_REQUEST' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||':decision:'||p_request::text,114));
 h:=public.uc_identification_payload(jsonb_build_array(p_org,p_user,p_action,p_id,p_revision,reason));
 SELECT * INTO q FROM public.uc_identification_requests WHERE actor_id=p_actor AND operation='decision' AND request_id=p_request;
 IF FOUND THEN
  IF q.payload_sha256<>h THEN RAISE EXCEPTION 'IDENTIFICATION_CONFLICT' USING ERRCODE='40001';END IF;
  SELECT * INTO r FROM public.uc_identification_records WHERE id=q.identification_id;
  IF NOT public.uc_identification_can_review(p_actor,r.organization_id,r.user_id,r.enrollment_id) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  RETURN public.uc_identification_receipt_result(q.id,p_actor);
 END IF;
 IF p_action='manual_verify' THEN
  INSERT INTO public.uc_identification_records(user_id,organization_id,scope_kind,projection_owned,origin,source_kind,status,decided_at,decided_by)
  VALUES(p_user,p_org,'subject',true,'prospective','manual_staff_claim','verified',clock_timestamp(),p_actor) RETURNING * INTO r;
 ELSE
  SELECT * INTO r FROM public.uc_identification_records WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN
   SELECT * INTO old FROM public.video_identifications WHERE id=p_id AND organization_id=p_org AND user_id=p_user FOR UPDATE;
   IF NOT FOUND OR NOT public.uc_identification_can_review(p_actor,p_org,p_user,old.enrollment_id) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
   IF p_revision<>0 THEN RAISE EXCEPTION 'IDENTIFICATION_CONFLICT' USING ERRCODE='40001';END IF;
   IF p_action='verify' THEN RAISE EXCEPTION 'IDENTIFICATION_SOURCE_UNAVAILABLE';END IF;
   IF(p_action='reject' AND old.status<>'pending')OR(p_action='reset' AND old.status NOT IN('verified','rejected')) THEN RAISE EXCEPTION 'IDENTIFICATION_CONFLICT' USING ERRCODE='40001';END IF;
   IF old.enrollment_id IS NOT NULL THEN SELECT course_id INTO course FROM public.enrollments WHERE id=old.enrollment_id AND user_id=p_user;END IF;
   INSERT INTO public.uc_identification_records(id,user_id,organization_id,enrollment_id,scope_kind,scope_course_id,projection_owned,origin,source_kind,status,revision)
   VALUES(old.id,p_user,p_org,old.enrollment_id,CASE WHEN old.enrollment_id IS NULL THEN 'subject' ELSE 'enrollment' END,course,false,'legacy_overlay','legacy_unclassified',old.status,1) RETURNING * INTO r;
   previous:=old.status;
  ELSE
   IF r.user_id<>p_user OR r.organization_id<>p_org OR NOT public.uc_identification_can_review(p_actor,p_org,p_user,r.enrollment_id) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
   IF r.revision<>p_revision THEN RAISE EXCEPTION 'IDENTIFICATION_CONFLICT' USING ERRCODE='40001';END IF;
   IF(p_action IN('verify','reject') AND r.status<>'pending')OR(p_action='reset' AND r.status NOT IN('verified','rejected')) THEN RAISE EXCEPTION 'IDENTIFICATION_CONFLICT' USING ERRCODE='40001';END IF;
   IF r.source_kind='self_photo' AND r.submitted_at IS NULL THEN RAISE EXCEPTION 'IDENTIFICATION_SOURCE_UNAVAILABLE';END IF;
   IF p_action='verify' AND(r.origin='legacy_overlay' OR r.source_kind<>'self_photo' OR NOT EXISTS(SELECT 1 FROM public.uc_identification_sources s WHERE s.id=r.current_source_id AND s.identification_id=r.id AND s.state='committed' AND public.uc_identification_object(s.id) IS NOT NULL)) THEN RAISE EXCEPTION 'IDENTIFICATION_SOURCE_UNAVAILABLE';END IF;
   previous:=r.status;
   UPDATE public.uc_identification_records SET revision=revision+1 WHERE id=r.id RETURNING * INTO r;
  END IF;
  UPDATE public.uc_identification_records SET status=CASE p_action WHEN 'verify' THEN 'verified' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,
  decided_at=CASE WHEN p_action='reset' THEN NULL ELSE clock_timestamp() END,decided_by=CASE WHEN p_action='reset' THEN NULL ELSE p_actor END,
  rejection_reason=CASE WHEN p_action='reject' THEN reason ELSE NULL END,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
 END IF;
 IF r.projection_owned THEN
  INSERT INTO public.uc_identification_write_contexts(kind,identification_id,source_id,organization_id,user_id,actor_id,expected_revision)
  VALUES(CASE WHEN p_registration THEN 'registration_manual' ELSE 'review' END,r.id,r.current_source_id,p_org,p_user,p_actor,p_revision) RETURNING id INTO w;
  IF p_action='manual_verify' THEN
   INSERT INTO public.video_identifications(id,user_id,organization_id,enrollment_id,status,verified_by,verified_at,created_at)
   VALUES(r.id,p_user,p_org,NULL,'verified',p_actor,r.decided_at,r.created_at);
  ELSE
   UPDATE public.video_identifications SET status=r.status,verified_by=r.decided_by,verified_at=r.decided_at,rejection_reason=r.rejection_reason WHERE id=r.id;
  END IF;
  DELETE FROM public.uc_identification_write_contexts WHERE id=w;
 END IF;
 INSERT INTO public.uc_identification_events(identification_id,user_id,organization_id,revision,source_id,action,from_status,to_status,actor_id,safe_reason)
 VALUES(r.id,p_user,p_org,r.revision,CASE WHEN r.source_kind='self_photo' THEN r.current_source_id ELSE NULL END,
 CASE p_action WHEN 'verify' THEN 'verified' WHEN 'reject' THEN 'rejected' WHEN 'manual_verify' THEN 'manual_verified' ELSE 'reset' END,previous,r.status,p_actor,reason) RETURNING id INTO e;
 v:=jsonb_build_object('contractVersion',1,'replayed',false,'record',public.uc_identification_record_dto(r.id,p_actor),'event',public.uc_identification_event_dto(e,p_actor));
 INSERT INTO public.uc_identification_requests(actor_id,operation,request_id,payload_sha256,identification_id,source_id,result)
 VALUES(p_actor,'decision',p_request,h,r.id,r.current_source_id,jsonb_set(v,'{event,reviewerUserId}','null'::jsonb));
 RETURN v;
END;$fn$;
CREATE FUNCTION public.decide_student_identification(p_organization_id uuid,p_student_user_id uuid,p_request_id uuid,p_action text,p_identification_id uuid DEFAULT NULL,p_expected_revision bigint DEFAULT 0,p_reason text DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 RETURN public.uc_apply_identification_decision(auth.uid(),p_organization_id,p_student_user_id,p_request_id,p_action,p_identification_id,p_expected_revision,p_reason,false);
END;$fn$;
CREATE FUNCTION public.uc_registration_identification_claim(p_org uuid,p_user uuid,p_actor uuid)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.uc_identification_records;v jsonb;BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 PERFORM public.uc_identification_lock_mutation(p_actor,p_org,p_user);
 IF NOT public.uc_identification_can_review(p_actor,p_org,p_user,NULL) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT x.* INTO r FROM public.uc_identification_records x JOIN public.uc_identification_events e ON e.identification_id=x.id
 WHERE x.user_id=p_user AND x.organization_id=p_org AND x.enrollment_id IS NULL ORDER BY e.at DESC,e.id DESC LIMIT 1 FOR UPDATE OF x;
 IF r.source_kind='manual_staff_claim' AND r.status='verified' AND r.decided_by=p_actor THEN RETURN r.id;END IF;
 v:=public.uc_apply_identification_decision(p_actor,p_org,p_user,gen_random_uuid(),'manual_verify',NULL,0,NULL,true);
 RETURN(v->'record'->>'identificationId')::uuid;
END;$fn$;

CREATE FUNCTION public.get_student_identification_state(p_organization_id uuid,p_student_user_ids uuid[],p_include_history boolean DEFAULT false,p_enrollment_id uuid DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();u uuid;r record;items jsonb;events jsonb;current_item jsonb;states jsonb:='[]';total bigint;event_total bigint;record_ids uuid[];cap jsonb;BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR a IS NULL THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_student_user_ids IS NULL OR cardinality(p_student_user_ids) NOT BETWEEN 1 AND 100 OR array_position(p_student_user_ids,NULL) IS NOT NULL
 OR cardinality(p_student_user_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_student_user_ids)x) OR p_include_history IS NULL
 OR(p_include_history AND cardinality(p_student_user_ids)<>1) OR(p_enrollment_id IS NOT NULL AND cardinality(p_student_user_ids)<>1)
 THEN RAISE EXCEPTION 'IDENTIFICATION_INVALID_REQUEST' USING ERRCODE='22023';END IF;
 -- Authorize the whole batch before assembling any output. No partial existence clues.
 FOREACH u IN ARRAY p_student_user_ids LOOP
  IF NOT public.uc_identification_can_read(a,p_organization_id,u,p_enrollment_id)
  OR(p_enrollment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=p_enrollment_id AND e.user_id=u AND c.organization_id=p_organization_id))
  THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 END LOOP;
 FOREACH u IN ARRAY p_student_user_ids LOOP
  items:='[]';events:='[]';current_item:=NULL;record_ids:=ARRAY[]::uuid[];
  SELECT count(*) INTO total FROM(
   SELECT x.id FROM public.uc_identification_records x WHERE x.user_id=u AND x.organization_id=p_organization_id AND(x.source_kind<>'self_photo' OR x.submitted_at IS NOT NULL)
   AND(p_enrollment_id IS NULL OR x.enrollment_id=p_enrollment_id) AND public.uc_identification_can_read(a,x.organization_id,x.user_id,x.enrollment_id)
   UNION ALL SELECT v.id FROM public.video_identifications v WHERE v.user_id=u AND v.organization_id=p_organization_id AND(p_enrollment_id IS NULL OR v.enrollment_id=p_enrollment_id)
   AND NOT EXISTS(SELECT 1 FROM public.uc_identification_records x WHERE x.id=v.id) AND public.uc_identification_can_read(a,v.organization_id,v.user_id,v.enrollment_id)
  ) q;
  FOR r IN SELECT * FROM(
   SELECT x.id,1 priority,coalesce(last_event.at,x.created_at) at,coalesce(last_event.id,x.id) event_order,
    public.uc_identification_record_dto(x.id,a) dto FROM public.uc_identification_records x
   LEFT JOIN LATERAL(SELECT e.at,e.id FROM public.uc_identification_events e WHERE e.identification_id=x.id ORDER BY e.at DESC,e.id DESC LIMIT 1)last_event ON true
   WHERE x.user_id=u AND x.organization_id=p_organization_id AND(x.source_kind<>'self_photo' OR x.submitted_at IS NOT NULL)
   AND(p_enrollment_id IS NULL OR x.enrollment_id=p_enrollment_id) AND public.uc_identification_can_read(a,x.organization_id,x.user_id,x.enrollment_id)
   UNION ALL SELECT v.id,0,v.created_at,v.id,public.uc_identification_legacy_dto(v.id,a) FROM public.video_identifications v
   WHERE v.user_id=u AND v.organization_id=p_organization_id AND(p_enrollment_id IS NULL OR v.enrollment_id=p_enrollment_id)
   AND NOT EXISTS(SELECT 1 FROM public.uc_identification_records x WHERE x.id=v.id) AND public.uc_identification_can_read(a,v.organization_id,v.user_id,v.enrollment_id)
  ) q ORDER BY priority DESC,at DESC,event_order DESC,id DESC LIMIT CASE WHEN p_include_history THEN 50 ELSE 1 END LOOP
   IF current_item IS NULL THEN current_item:=r.dto;END IF;record_ids:=array_append(record_ids,r.id);
   IF p_include_history THEN items:=items||jsonb_build_array(r.dto);END IF;
  END LOOP;
  event_total:=0;
  IF p_include_history THEN
   SELECT count(*) INTO event_total FROM public.uc_identification_events e WHERE e.identification_id=ANY(record_ids);
   SELECT coalesce(jsonb_agg(public.uc_identification_event_dto(e.id,a) ORDER BY e.at DESC,e.id DESC),'[]') INTO events
   FROM(SELECT id,at FROM public.uc_identification_events WHERE identification_id=ANY(record_ids) ORDER BY at DESC,id DESC LIMIT 100)e;
  END IF;
  cap:=coalesce(current_item->'capabilities',public.uc_identification_capabilities(a,p_organization_id,u,p_enrollment_id,'pending',NULL,false));
  states:=states||jsonb_build_array(jsonb_build_object('organizationId',p_organization_id,'studentUserId',u,'requestedEnrollmentId',p_enrollment_id,
  'current',current_item,'history',items,'events',events,'historyTruncated',p_include_history AND(total>50 OR event_total>100),
  'compatibility',jsonb_build_object('historicalVerifiedObserved',EXISTS(SELECT 1 FROM public.video_identifications v WHERE v.user_id=u AND v.organization_id=p_organization_id AND v.status='verified'
   AND(p_enrollment_id IS NULL OR v.enrollment_id=p_enrollment_id) AND NOT EXISTS(SELECT 1 FROM public.uc_identification_records x WHERE x.id=v.id AND x.projection_owned)
   AND public.uc_identification_can_read(a,v.organization_id,v.user_id,v.enrollment_id))),'capabilities',cap));
 END LOOP;
 RETURN jsonb_build_object('contractVersion',1,'subjects',states);
END;$fn$;

CREATE FUNCTION public.uc_identification_media_context(p_identification_id uuid,p_source_id uuid)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a uuid:=auth.uid();r public.uc_identification_records;s public.uc_identification_sources;o jsonb;BEGIN
 SELECT * INTO r FROM public.uc_identification_records WHERE id=p_identification_id;
 SELECT * INTO s FROM public.uc_identification_sources WHERE id=p_source_id AND identification_id=r.id AND user_id=r.user_id AND organization_id=r.organization_id AND state='committed';
 IF auth.role() IS DISTINCT FROM 'authenticated' OR s.id IS NULL OR NOT public.uc_identification_can_read(a,r.organization_id,r.user_id,r.enrollment_id) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 o:=public.uc_identification_object(s.id);IF o IS NULL THEN RAISE EXCEPTION 'IDENTIFICATION_SOURCE_UNAVAILABLE';END IF;
 RETURN jsonb_build_object('contractVersion',1,'actorId',a,'organizationId',r.organization_id,'studentUserId',r.user_id,'enrollmentId',r.enrollment_id,
 'identificationId',r.id,'sourceId',s.id,'revision',r.revision,'bucket',s.bucket,'path',s.path,'byteSha256',s.byte_sha256,'maxBytes',5242880)||o;
END;$fn$;

CREATE FUNCTION public.uc_identification_storage_allowed(p_bucket text,p_path text,p_write boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND p_bucket='student-identification-media' AND EXISTS(
 SELECT 1 FROM public.uc_identification_sources s JOIN public.uc_identification_records r ON r.id=s.identification_id AND r.user_id=s.user_id AND r.organization_id=s.organization_id
 WHERE s.bucket=p_bucket AND s.path=p_path AND s.path=s.user_id::text||'/'||s.organization_id::text||'/'||r.id::text||'/'||s.id::text||'/capture.jpg'
 AND(CASE WHEN p_write THEN s.state='prepared' AND s.expires_at>clock_timestamp() AND public.uc_identification_can_submit(auth.uid(),s.organization_id,s.user_id,r.enrollment_id)
 ELSE(s.state='committed' AND public.uc_identification_can_read(auth.uid(),s.organization_id,s.user_id,r.enrollment_id))
 OR(s.state='prepared' AND s.expires_at>clock_timestamp() AND public.uc_identification_can_submit(auth.uid(),s.organization_id,s.user_id,r.enrollment_id)) END)),false)
$fn$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)VALUES('student-identification-media','student-identification-media',false,5242880,ARRAY['image/jpeg']);
CREATE POLICY uc_identification_media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='student-identification-media' AND public.uc_identification_storage_allowed(bucket_id,name,true) AND coalesce(to_jsonb(objects)->>'owner_id',to_jsonb(objects)->>'owner')=auth.uid()::text);
CREATE POLICY uc_identification_media_select ON storage.objects FOR SELECT TO authenticated USING(bucket_id='student-identification-media' AND public.uc_identification_storage_allowed(bucket_id,name,false));
CREATE POLICY uc_identification_media_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK(bucket_id<>'student-identification-media' OR(public.uc_identification_storage_allowed(bucket_id,name,true) AND coalesce(to_jsonb(objects)->>'owner_id',to_jsonb(objects)->>'owner')=auth.uid()::text));
CREATE POLICY uc_identification_media_select_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC USING(bucket_id<>'student-identification-media' OR public.uc_identification_storage_allowed(bucket_id,name,false));
CREATE POLICY uc_identification_media_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC USING(bucket_id<>'student-identification-media') WITH CHECK(bucket_id<>'student-identification-media');
CREATE POLICY uc_identification_media_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC USING(bucket_id<>'student-identification-media');
-- Old tabs must not publish another generic capture before their old video
-- INSERT is rejected. This exact namespace is not the ordinary avatar feature.
CREATE POLICY uc_identification_legacy_capture_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC
 WITH CHECK(NOT(bucket_id='avatars' AND name~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/verification_[0-9]+[.]jpg$'));
CREATE POLICY uc_identification_legacy_capture_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC
 USING(NOT(bucket_id='avatars' AND name~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/verification_[0-9]+[.]jpg$'))
 WITH CHECK(NOT(bucket_id='avatars' AND name~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/verification_[0-9]+[.]jpg$'));

CREATE FUNCTION public.uc_identification_projection_read(p_org uuid,p_user uuid,p_enrollment uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.role()='authenticated' AND public.uc_identification_can_read(auth.uid(),p_org,p_user,p_enrollment)
$fn$;
CREATE POLICY uc_identification_projection_select_boundary ON public.video_identifications AS RESTRICTIVE FOR SELECT TO authenticated USING(public.uc_identification_projection_read(organization_id,user_id,enrollment_id));
CREATE POLICY uc_identification_projection_insert_boundary ON public.video_identifications AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(false);
CREATE POLICY uc_identification_projection_update_boundary ON public.video_identifications AS RESTRICTIVE FOR UPDATE TO authenticated USING(false) WITH CHECK(false);
CREATE POLICY uc_identification_projection_delete_boundary ON public.video_identifications AS RESTRICTIVE FOR DELETE TO authenticated USING(false);

CREATE FUNCTION public.uc_guard_identification_projection()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE w public.uc_identification_write_contexts;r public.uc_identification_records;v uuid;BEGIN
 IF TG_OP='DELETE' THEN
  IF auth.role()='service_role' AND auth.uid() IS NULL AND current_setting('sintagma.account_deletion_erase_user',true)=OLD.user_id::text
  AND EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=OLD.user_id)
  AND EXISTS(SELECT 1 FROM public.uc_identification_write_contexts ctx WHERE ctx.kind='subject_erase' AND ctx.user_id=OLD.user_id AND ctx.backend_pid=pg_backend_pid() AND ctx.transaction_id=txid_current()) THEN RETURN OLD;END IF;
  SELECT * INTO w FROM public.uc_identification_write_contexts WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()
  AND kind='projection_cascade' AND identification_id=OLD.id AND user_id=OLD.user_id AND organization_id=OLD.organization_id AND enrollment_id=OLD.enrollment_id AND actor_id IS NOT DISTINCT FROM auth.uid() ORDER BY created_at DESC LIMIT 1;
  IF w.id IS NOT NULL AND w.kind='projection_cascade' AND public.uc_enrollment_delete_actor_writable() AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=OLD.user_id) THEN DELETE FROM public.uc_identification_write_contexts WHERE id=w.id;RETURN OLD;END IF;
  RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND NEW.verified_by IS NULL AND OLD.verified_by IS NOT NULL
 AND(to_jsonb(NEW)-ARRAY['verified_by','updated_at'])=(to_jsonb(OLD)-ARRAY['verified_by','updated_at'])
 AND auth.role()='service_role' AND auth.uid() IS NULL AND EXISTS(SELECT 1 FROM public.uc_identification_write_contexts ctx WHERE ctx.kind='reviewer_erase' AND ctx.actor_id=OLD.verified_by AND ctx.backend_pid=pg_backend_pid() AND ctx.transaction_id=txid_current()
 AND current_setting('sintagma.account_deletion_erase_user',true)=ctx.actor_id::text AND EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=ctx.actor_id)) THEN RETURN NEW;END IF;
 SELECT * INTO r FROM public.uc_identification_records WHERE id=NEW.id AND projection_owned;
 SELECT * INTO w FROM public.uc_identification_write_contexts WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND identification_id=NEW.id AND organization_id=NEW.organization_id AND user_id=NEW.user_id AND kind IN('submit','review','registration_manual') ORDER BY created_at DESC LIMIT 1;
 IF r.id IS NULL OR w.id IS NULL OR(NEW.user_id,NEW.organization_id,NEW.enrollment_id,NEW.created_at) IS DISTINCT FROM(r.user_id,r.organization_id,r.enrollment_id,r.created_at)
 OR(NEW.status,NEW.verified_by,NEW.verified_at,NEW.rejection_reason) IS DISTINCT FROM(r.status,r.decided_by,r.decided_at,r.rejection_reason)
 OR NEW.photo_url IS NOT NULL OR NEW.video_url IS NOT NULL OR NEW.ip_address IS NOT NULL OR NEW.user_agent IS NOT NULL OR NEW.device_info IS NOT NULL
 THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' AND(to_jsonb(NEW)-ARRAY['status','verified_by','verified_at','rejection_reason','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['status','verified_by','verified_at','rejection_reason','updated_at']) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF w.kind='submit' AND auth.role()='service_role' AND auth.uid() IS NULL AND public.uc_identification_can_submit(w.actor_id,r.organization_id,r.user_id,r.enrollment_id) AND r.status='pending' AND r.decided_by IS NULL THEN RETURN NEW;END IF;
 IF w.kind IN('review','registration_manual') AND public.uc_identification_can_review(w.actor_id,r.organization_id,r.user_id,r.enrollment_id)
 AND((w.kind='review' AND auth.role()='authenticated' AND auth.uid()=w.actor_id) OR(w.kind='registration_manual' AND auth.role()='service_role' AND auth.uid() IS NULL AND r.source_kind='manual_staff_claim')) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';
END;$fn$;
CREATE TRIGGER uc_identification_projection_guard BEFORE INSERT OR UPDATE OR DELETE ON public.video_identifications FOR EACH ROW EXECUTE FUNCTION public.uc_guard_identification_projection();
CREATE FUNCTION public.uc_capture_identification_cascade()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v record;canonical_org uuid;BEGIN
 IF NOT(public.uc_enrollment_delete_live_allowed(OLD.id,OLD.user_id,OLD.course_id) OR public.uc_enrollment_delete_has_witness(OLD.id,OLD.user_id,OLD.course_id)
 OR(auth.role()='service_role' AND auth.uid() IS NULL AND current_setting('sintagma.account_deletion_erase_user',true)=OLD.user_id::text AND EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=OLD.user_id)
 AND EXISTS(SELECT 1 FROM public.uc_identification_write_contexts WHERE kind='subject_erase' AND user_id=OLD.user_id AND backend_pid=pg_backend_pid() AND transaction_id=txid_current()))) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT organization_id INTO canonical_org FROM public.courses WHERE id=OLD.course_id;
 IF canonical_org IS NULL THEN
  SELECT organization_id INTO canonical_org FROM public.uc_enrollment_delete_witnesses WHERE enrollment_id=OLD.id AND user_id=OLD.user_id AND course_id=OLD.course_id
  AND actor_id=auth.uid() AND backend_pid=pg_backend_pid() AND transaction_id=txid_current() ORDER BY id LIMIT 1;
 END IF;
 IF canonical_org IS NULL THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 FOR v IN SELECT id,user_id,organization_id FROM public.video_identifications WHERE enrollment_id=OLD.id LOOP
 IF v.user_id IS DISTINCT FROM OLD.user_id OR v.organization_id IS DISTINCT FROM canonical_org THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 INSERT INTO public.uc_identification_write_contexts(kind,identification_id,organization_id,user_id,actor_id,enrollment_id)VALUES('projection_cascade',v.id,v.organization_id,v.user_id,auth.uid(),OLD.id);END LOOP;
 RETURN OLD;
END;$fn$;
CREATE FUNCTION public.uc_cleanup_identification_cascade()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN DELETE FROM public.uc_identification_write_contexts WHERE kind='projection_cascade' AND enrollment_id=OLD.id AND backend_pid=pg_backend_pid() AND transaction_id=txid_current();RETURN OLD;END;$fn$;
CREATE TRIGGER uc_identification_cascade_before BEFORE DELETE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.uc_capture_identification_cascade();
CREATE TRIGGER zzz_uc_identification_cascade_cleanup AFTER DELETE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.uc_cleanup_identification_cascade();

CREATE FUNCTION public.uc_erase_identification_data(p_user uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE record_id uuid;BEGIN
 -- Called only from the receipt-validated original erase wrapper after its lock,
 -- current plan/file checks and exact revoked-subject context. Never lock others.
 IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL OR current_setting('sintagma.account_deletion_erase_user',true) IS DISTINCT FROM p_user::text
 OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user) THEN RAISE EXCEPTION 'IDENTIFICATION_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 -- Cross-reviewed erasures share a deterministic parent-row order before any
 -- own deletion/foreign attribution update. No unrelated advisory lock is taken.
 FOR record_id IN SELECT r.id FROM public.uc_identification_records r WHERE r.user_id=p_user OR r.decided_by=p_user
 OR EXISTS(SELECT 1 FROM public.uc_identification_events e WHERE e.identification_id=r.id AND e.actor_id=p_user)
 OR EXISTS(SELECT 1 FROM public.uc_identification_requests q WHERE q.identification_id=r.id AND q.actor_id=p_user) ORDER BY r.id LOOP
  PERFORM 1 FROM public.uc_identification_records WHERE id=record_id FOR UPDATE;
 END LOOP;
 INSERT INTO public.uc_identification_write_contexts(kind,user_id,actor_id)VALUES('subject_erase',p_user,p_user),('reviewer_erase',p_user,p_user);
 DELETE FROM public.uc_identification_requests WHERE actor_id=p_user OR identification_id IN(SELECT id FROM public.uc_identification_records WHERE user_id=p_user);
 DELETE FROM public.uc_identification_events WHERE user_id=p_user;
 DELETE FROM public.uc_identification_sources WHERE user_id=p_user;
 DELETE FROM public.uc_identification_records WHERE user_id=p_user;
 UPDATE public.uc_identification_records SET decided_by=NULL WHERE decided_by=p_user;
 UPDATE public.uc_identification_events SET actor_id=NULL WHERE actor_id=p_user;
END;$fn$;

-- Five exact reviewed existing bodies, preserving their owner/ACL/signatures.
DO $patch$ DECLARE original text;patched text;needle text;replacement text;BEGIN
 original:=pg_get_functiondef('public.account_deletion_storage_write_guard()'::regprocedure);
 patched:=replace(original,'''avatars'',''student-documents'',''final-test-photos''','''avatars'',''student-documents'',''final-test-photos'',''student-identification-media''');
 IF patched=original THEN RAISE EXCEPTION 'Identification storage erasure anchor missing';END IF;EXECUTE patched;
 original:=pg_get_functiondef('public.account_deletion_files(uuid)'::regprocedure);
 patched:=replace(original,'''avatars'',''student-documents'',''final-test-photos''','''avatars'',''student-documents'',''final-test-photos'',''student-identification-media''');
 IF patched=original THEN RAISE EXCEPTION 'Identification manifest anchor missing';END IF;EXECUTE patched;
 original:=pg_get_functiondef('public.account_deletion_personal_row_counts(uuid)'::regprocedure);
 patched:=replace(original,E'  (''video_identifications'',''user_id''),',E'  (''uc_identification_records'',''user_id''),\n  (''uc_identification_sources'',''user_id''),\n  (''uc_identification_events'',''user_id''),\n  (''uc_identification_records'',''decided_by''),\n  (''uc_identification_events'',''actor_id''),\n  (''uc_identification_requests'',''actor_id''),\n  (''video_identifications'',''user_id''),');
 IF patched=original THEN RAISE EXCEPTION 'Identification count anchor missing';END IF;EXECUTE patched;
 original:=pg_get_functiondef('public.account_deletion_erase_data(uuid,text)'::regprocedure);
 patched:=replace(original,E' PERFORM set_config(''sintagma.account_deletion_erase_user'',u::text,true);',E' PERFORM set_config(''sintagma.account_deletion_erase_user'',u::text,true);\n PERFORM public.uc_erase_identification_data(u);');
 patched:=replace(patched,E' IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u))',E' DELETE FROM public.uc_identification_write_contexts WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND kind IN(''subject_erase'',''reviewer_erase'') AND user_id=u;\n IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u))');
 IF patched=original OR position('PERFORM public.uc_erase_identification_data(u);' IN patched)=0 OR position('DELETE FROM public.uc_identification_write_contexts' IN patched)=0 THEN RAISE EXCEPTION 'Identification erase anchors missing';END IF;EXECUTE patched;
 original:=pg_get_functiondef('public.save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)'::regprocedure);
 needle:=substring(original FROM position(E'  IF p_confirm_identity IS TRUE THEN\n    SELECT * INTO v_identification' IN original) FOR position(E'  RETURN jsonb_build_object(''success''' IN original)-position(E'  IF p_confirm_identity IS TRUE THEN\n    SELECT * INTO v_identification' IN original));
 replacement:=E'  IF p_confirm_identity IS TRUE THEN\n    v_identification.id:=public.uc_registration_identification_claim(p_organization_id,p_user_id,p_actor_id);\n    SELECT v.* INTO v_identification FROM public.video_identifications v WHERE v.id=v_identification.id;\n  END IF;\n';
 IF needle IS NULL OR length(needle)<100 THEN RAISE EXCEPTION 'Identification registration identity anchor missing';END IF;
 patched:=replace(original,needle,replacement);
 patched:=replace(patched,E'  -- Serialize repeated imports/confirmation',E'  IF p_confirm_identity IS TRUE THEN\n    PERFORM public.uc_identification_lock_mutation(p_actor_id,p_organization_id,p_user_id);\n  END IF;\n  -- Serialize repeated imports/confirmation');
 IF patched=original OR position('PERFORM public.uc_identification_lock_mutation' IN patched)=0 THEN RAISE EXCEPTION 'Identification registration lock anchor missing';END IF;EXECUTE patched;
END $patch$;

DO $grants$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND(p.proname LIKE 'uc_identification_%' OR p.proname IN('uc_guard_identification_projection','uc_apply_identification_decision','uc_commit_identification_photo','uc_registration_identification_claim','uc_capture_identification_cascade','uc_cleanup_identification_cascade','uc_erase_identification_data','prepare_own_identification_photo','decide_student_identification','get_student_identification_state')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.oid::regprocedure);
 IF f.proname IN('prepare_own_identification_photo','decide_student_identification','get_student_identification_state','uc_identification_submit_context','uc_identification_media_context','uc_identification_storage_allowed','uc_identification_projection_read') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.oid::regprocedure);END IF;
 IF f.proname='uc_commit_identification_photo' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.oid::regprocedure);END IF;
 IF f.proname='uc_identification_storage_allowed' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon',f.oid::regprocedure);END IF;
 END LOOP;
END $grants$;
