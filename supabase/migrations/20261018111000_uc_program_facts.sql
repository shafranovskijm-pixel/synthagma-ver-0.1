-- UC011: separately reviewed programme facts, exact approved file and group/enrollment snapshots.
-- No historical backfill, learning-access change, number allocation or legal enrollment-date inference.
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM (VALUES
 ('public.uc_document_action_allowed(uuid,text,uuid,uuid)','79c190a053f711dc8110e9d451b1a56c'),
 ('public.uc_document_record_scope(uuid,uuid,uuid,uuid,uuid)','c2d296f2ede0051919f375eaf1ce6802'),
 ('public.uc_org_document_review_actor(uuid,uuid)','89738b475b21d69f496a543ceb97da49'),
 ('public.uc_org_document_review_file_bound(public.org_documents)','52a37a3afd327393cc73b8af2a784316'),
 ('public.sync_profile_group_course_enrollment()','3608c6747572c6a98830b62cfb5b4238'),
 ('public.sync_group_course_enrollments()','97b3ba66ec588a9fa3d77bcd25f57f7a'),
 ('public.uc_org_document_blob_committed(text,text)','bc750c58e3d50e33bfd6bf6844fffbaa')
 ) b(signature,hash) WHERE to_regprocedure(signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>hash)
 THEN RAISE EXCEPTION 'Programme facts: unreviewed authority baseline'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='program-files' AND public=false)
 OR EXISTS(SELECT 1 FROM storage.buckets WHERE id='program-documents') THEN RAISE EXCEPTION 'Programme facts: unreviewed bucket baseline'; END IF;
 IF (SELECT count(*) FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND
  ((policyname='uc_org_document_blob_no_overwrite' AND md5(to_jsonb(p)::text)='c5030108254eabf8300b0c94b9d7ef4e') OR
   (policyname='uc_org_document_blob_no_delete' AND md5(to_jsonb(p)::text)='c82f6a57a88835e478dba6728f01489b')))<>2
 THEN RAISE EXCEPTION 'Programme facts: immutable file boundary changed'; END IF;
END;$preflight$;

CREATE TABLE public.program_fact_states(
 program_id uuid PRIMARY KEY REFERENCES public.program_documents(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 revision bigint NOT NULL CHECK(revision>0),current_version_id uuid NOT NULL
);
CREATE TABLE public.program_fact_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 program_id uuid NOT NULL REFERENCES public.program_documents(id),version_number bigint NOT NULL CHECK(version_number>0),revision bigint NOT NULL CHECK(revision>0),
 state text NOT NULL CHECK(state IN('draft','in_review','rejected','approved','cancelled')),
 file_document_id uuid NOT NULL REFERENCES public.org_documents(id),file_version_id uuid NOT NULL REFERENCES public.org_document_versions(id),
 file_review_id uuid NOT NULL REFERENCES public.org_document_reviews(id),file_approval jsonb NOT NULL,
 facts jsonb NOT NULL,facts_hash text NOT NULL CHECK(facts_hash ~ '^[a-f0-9]{64}$'),
 reviewer_user_id uuid NOT NULL,reviewer_name text NOT NULL,created_by uuid NOT NULL,created_by_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),approved_at timestamptz,approved_by uuid,note text,
 UNIQUE(program_id,version_number),CHECK((state='approved')=(approved_at IS NOT NULL AND approved_by IS NOT NULL))
);
ALTER TABLE public.program_fact_states ADD CONSTRAINT program_fact_current_version_fk FOREIGN KEY(current_version_id) REFERENCES public.program_fact_versions(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE public.course_program_bindings(
 course_id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),revision bigint NOT NULL CHECK(revision>0),
 version_id uuid NOT NULL REFERENCES public.program_fact_versions(id),program_id uuid NOT NULL REFERENCES public.program_documents(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),recorded_by uuid NOT NULL
);
CREATE TABLE public.group_program_bindings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid NOT NULL UNIQUE,course_id uuid NOT NULL,organization_id uuid NOT NULL REFERENCES public.organizations(id),
 revision bigint NOT NULL CHECK(revision>0),version_id uuid NOT NULL REFERENCES public.program_fact_versions(id),program_id uuid NOT NULL REFERENCES public.program_documents(id),
 program_snapshot jsonb NOT NULL,group_snapshot jsonb NOT NULL,snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),recorded_by uuid NOT NULL
);
-- Operational enrollment/group deletion must not cascade away these recorded facts.
-- Identity UUIDs are copied and validated on capture/read; there is intentionally no mutable enrollment FK.
CREATE TABLE public.group_program_enrollment_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),group_id uuid NOT NULL,
 enrollment_id uuid NOT NULL,user_id uuid NOT NULL,course_id uuid NOT NULL,binding_id uuid NOT NULL REFERENCES public.group_program_bindings(id),
 binding_revision bigint NOT NULL,version_id uuid NOT NULL REFERENCES public.program_fact_versions(id),
 program_snapshot jsonb NOT NULL,group_snapshot jsonb NOT NULL,snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 source text NOT NULL CHECK(source IN('association_created','confirmed_existing_association')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),recorded_by uuid,
 legal_enrollment_date date CHECK(legal_enrollment_date IS NULL),UNIQUE(group_id,enrollment_id)
);
CREATE TABLE public.program_fact_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),entity_kind text NOT NULL,
 entity_id uuid NOT NULL,revision bigint NOT NULL,actor_id uuid NOT NULL,action text NOT NULL,snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(entity_kind,entity_id,revision)
);
CREATE TABLE public.program_fact_requests(
 request_id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),actor_id uuid NOT NULL,
 payload jsonb NOT NULL,receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $acl$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['program_fact_states','program_fact_versions','course_program_bindings','group_program_bindings','group_program_enrollment_snapshots','program_fact_events','program_fact_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END;$acl$;

CREATE FUNCTION public.uc_program_hash(p_value jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT encode(sha256(convert_to(p_value::text,'UTF8')),'hex')
$fn$;
CREATE FUNCTION public.uc_validate_program_facts(p_facts jsonb,p_complete boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE k text;v jsonb;
BEGIN
 IF p_facts IS NULL OR jsonb_typeof(p_facts)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_facts))<>12
 OR NOT p_facts ?& ARRAY['schema_version','full_title','program_type','academic_hours','training_form','uses_elearning','uses_distance_learning','duration_calendar','attestation_form','attestation_criteria','qualification','profession']
 OR p_facts->'schema_version'<>'1'::jsonb THEN RAISE EXCEPTION 'invalid_program_facts_shape' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['full_title','duration_calendar','attestation_form','attestation_criteria','qualification','profession'] LOOP
  v:=p_facts->k;
  IF v<>'null'::jsonb AND (jsonb_typeof(v)<>'string' OR length(p_facts->>k)>4000 OR (p_facts->>k)!~'[^[:space:]]') THEN RAISE EXCEPTION 'invalid_program_facts_text' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_facts->'program_type'<>'null'::jsonb AND (p_facts->>'program_type') NOT IN('dpo_upskilling','dpo_retraining','professional_training','internal_nonformal')
 OR p_facts->'training_form'<>'null'::jsonb AND (p_facts->>'training_form') NOT IN('full_time','part_time','mixed')
 OR p_facts->'academic_hours'<>'null'::jsonb AND (jsonb_typeof(p_facts->'academic_hours')<>'number' OR (p_facts->>'academic_hours')!~'^[1-9][0-9]{0,5}$')
 OR jsonb_typeof(p_facts->'uses_elearning') NOT IN('boolean','null') OR jsonb_typeof(p_facts->'uses_distance_learning') NOT IN('boolean','null')
 THEN RAISE EXCEPTION 'invalid_program_facts_value' USING ERRCODE='22023'; END IF;
 IF p_complete AND EXISTS(SELECT 1 FROM unnest(ARRAY['full_title','program_type','academic_hours','training_form','duration_calendar','attestation_form','attestation_criteria']) x WHERE p_facts->x='null'::jsonb)
 THEN RAISE EXCEPTION 'program_facts_incomplete' USING ERRCODE='22023'; END IF;
END;$fn$;
-- Historical approved file versions remain valid evidence after the current pointer changes.
-- This proves the exact immutable object again, not just a stored review state or URL.
CREATE FUNCTION public.uc_program_file_proof(p_org uuid,p_version uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id
 JOIN storage.objects o ON o.id=v.storage_object_id JOIN public.org_document_reviews r ON r.document_id=d.id AND r.version_id=v.id AND r.organization_id=v.organization_id
 WHERE v.id=p_version AND v.organization_id=p_org AND r.state='approved'
 AND v.event_kind IN('upload','restore') AND o.bucket_id='org-documents' AND o.name=v.file_path
 AND v.file_path ~ ('^'||p_org::text||'/versions/'||d.id::text||'/[0-9a-f-]{36}[.][a-z0-9]{1,12}$')
 AND v.file_url ~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?/storage/v1/object/public/org-documents/'
 AND right(v.file_url,length('/org-documents/'||v.file_path))='/org-documents/'||v.file_path
 AND v.file_size>0 AND o.metadata->>'size' ~ '^[0-9]+$'
 AND v.file_size=CASE WHEN o.metadata->>'size' ~ '^[0-9]+$' THEN (o.metadata->>'size')::numeric END
 AND v.storage_metadata=jsonb_build_object('size',v.file_size,'etag',coalesce(o.metadata->>'eTag',o.metadata->>'etag'),'mimetype',o.metadata->>'mimetype'))
$fn$;
-- Archive/trash/current-pointer changes do not rewrite an approved historical
-- version. A new review or binding, however, must select an active document.
CREATE FUNCTION public.uc_program_active_file_proof(p_org uuid,p_version uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_program_file_proof(p_org,p_version) AND EXISTS(
  SELECT 1 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id
  WHERE v.id=p_version AND v.organization_id=p_org AND d.deleted_at IS NULL AND d.status='active' AND(d.expires_at IS NULL OR d.expires_at>=current_date))
$fn$;
CREATE FUNCTION public.uc_program_version_snapshot(p_version uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT to_jsonb(v) FROM public.program_fact_versions v WHERE id=p_version
$fn$;
CREATE FUNCTION public.uc_program_group_calendar(p_group uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('name',g.name,'start_date',to_jsonb(g)->'start_date','end_date',to_jsonb(g)->'end_date','training_dates',to_jsonb(g)->'training_dates',
 'schedule_text',to_jsonb(g)->'schedule_text','instructor_name',to_jsonb(g)->'instructor_name') FROM public.student_groups g WHERE id=p_group
$fn$;
CREATE FUNCTION public.uc_guard_program_history() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_TABLE_NAME='program_fact_versions' AND TG_OP='UPDATE' THEN
 IF OLD.state<>'approved' AND (to_jsonb(OLD)-ARRAY['revision','state','approved_at','approved_by','note'])=(to_jsonb(NEW)-ARRAY['revision','state','approved_at','approved_by','note']) THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'program_history_is_immutable' USING ERRCODE='42501';
END;$fn$;
CREATE TRIGGER uc_program_history_immutable BEFORE UPDATE OR DELETE ON public.program_fact_versions FOR EACH ROW EXECUTE FUNCTION public.uc_guard_program_history();
CREATE TRIGGER uc_program_history_immutable BEFORE UPDATE OR DELETE ON public.group_program_enrollment_snapshots FOR EACH ROW EXECUTE FUNCTION public.uc_guard_program_history();
CREATE TRIGGER uc_program_history_immutable BEFORE UPDATE OR DELETE ON public.program_fact_events FOR EACH ROW EXECUTE FUNCTION public.uc_guard_program_history();
CREATE TRIGGER uc_program_history_immutable BEFORE UPDATE OR DELETE ON public.program_fact_requests FOR EACH ROW EXECUTE FUNCTION public.uc_guard_program_history();

CREATE FUNCTION public.get_program_facts(p_organization_id uuid,p_program_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.program_documents;s public.program_fact_states;v public.program_fact_versions;w boolean;
BEGIN
 IF NOT coalesce(public.uc_document_action_allowed(p_organization_id,'read',NULL,NULL),false) THEN RAISE EXCEPTION 'program_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.program_documents WHERE id=p_program_id AND organization_id=p_organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'program_not_found' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.program_fact_states WHERE program_id=d.id;SELECT * INTO v FROM public.program_fact_versions WHERE id=s.current_version_id;
 w:=coalesce(public.uc_document_action_allowed(p_organization_id,'write',NULL,NULL),false);
 RETURN jsonb_build_object('program',jsonb_build_object('id',d.id,'organization_id',d.organization_id,'name',d.name,'description',d.description,'revision',coalesce(s.revision,0)),
 'current_version',public.uc_program_version_snapshot(v.id),'versions',coalesce((SELECT jsonb_agg(public.uc_program_version_snapshot(x.id) ORDER BY x.version_number DESC) FROM public.program_fact_versions x WHERE program_id=d.id),'[]'::jsonb),
 'capabilities',jsonb_build_object('can_create_version',w AND coalesce(v.state<>'in_review',true),
 'can_submit',w AND coalesce(v.state='draft' AND v.created_by=auth.uid(),false),'can_approve',w AND coalesce(v.state='in_review' AND v.reviewer_user_id=auth.uid() AND public.uc_org_document_review_actor(p_organization_id,auth.uid()),false),
 'can_reject',w AND coalesce(v.state='in_review' AND v.reviewer_user_id=auth.uid() AND public.uc_org_document_review_actor(p_organization_id,auth.uid()),false),'can_cancel',w AND coalesce(v.state IN('draft','in_review') AND v.created_by=auth.uid(),false)));
END;$fn$;
CREATE FUNCTION public.list_program_facts(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT coalesce(public.uc_document_action_allowed(p_organization_id,'read',NULL,NULL),false) THEN RAISE EXCEPTION 'program_access_denied' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(public.get_program_facts(p_organization_id,d.id) ORDER BY d.name,d.id) FROM public.program_documents d WHERE organization_id=p_organization_id),'[]'::jsonb);
END;$fn$;
CREATE FUNCTION public.list_program_facts_candidates(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT coalesce(public.uc_document_action_allowed(p_organization_id,'write',NULL,NULL),false) THEN RAISE EXCEPTION 'program_access_denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('files',coalesce((SELECT jsonb_agg(jsonb_build_object('document_id',d.id,'version_id',v.id,'review_id',r.id,'document_name',d.name,'version_number',v.version_number,
 'approval',jsonb_build_object('number',r.approval_number,'date',r.approval_date,'recorded_at',r.approved_at,'recorded_by',r.approved_by)) ORDER BY d.name,v.version_number DESC)
 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id
 JOIN LATERAL(SELECT r.* FROM public.org_document_reviews r WHERE r.version_id=v.id AND r.document_id=d.id AND r.organization_id=v.organization_id AND r.state='approved' ORDER BY r.approved_at DESC,r.id DESC LIMIT 1) r ON true
 WHERE v.organization_id=p_organization_id AND public.uc_program_active_file_proof(p_organization_id,v.id)),'[]'::jsonb),
 'reviewers',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',u.user_id,'display_name',public.uc_org_document_review_actor_name(p_organization_id,u.user_id)) ORDER BY u.user_id)
 FROM (SELECT user_id FROM public.profiles WHERE organization_id=p_organization_id UNION SELECT user_id FROM public.org_staff WHERE organization_id=p_organization_id) u
 WHERE public.uc_org_document_review_actor(p_organization_id,u.user_id)),'[]'::jsonb),
 'courses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',title) ORDER BY title,id) FROM public.courses WHERE organization_id=p_organization_id),'[]'::jsonb),
 'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'course_id',course_id) ORDER BY name,id) FROM public.student_groups WHERE organization_id=p_organization_id),'[]'::jsonb));
END;$fn$;

-- Request locks precede programme/target locks. Stored receipts never bypass current authorization.
CREATE FUNCTION public.uc_mutate_program_facts(p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE org uuid:=(p_payload->>'organization_id')::uuid;req uuid:=(p_payload->>'request_id')::uuid;actor uuid:=auth.uid();
 pid uuid:=(p_payload->>'program_id')::uuid;vid uuid:=(p_payload->>'version_id')::uuid;gid uuid:=(p_payload->>'group_id')::uuid;cid uuid:=(p_payload->>'course_id')::uuid;
 oldreq public.program_fact_requests;head public.program_fact_states;v public.program_fact_versions;filev public.org_document_versions;review public.org_document_reviews;
 cb public.course_program_bindings;gb public.group_program_bindings;g public.student_groups;d public.program_documents;
 expected bigint:=(p_payload->>'expected_revision')::bigint;result jsonb;payload jsonb:=jsonb_build_object('action',p_action,'arguments',p_payload);n bigint;nextid uuid;eid uuid;ids uuid[];snap uuid;
BEGIN
 IF p_action='transition' THEN SELECT organization_id,program_id INTO org,pid FROM public.program_fact_versions WHERE id=vid; END IF;
 IF actor IS NULL OR org IS NULL OR req IS NULL OR NOT coalesce(public.uc_document_action_allowed(org,'write',CASE WHEN p_action IN('bind_group','confirm_existing') THEN gid END,NULL),false)
 THEN RAISE EXCEPTION 'program_access_denied' USING ERRCODE='42501'; END IF;
 IF expected IS NULL OR expected<0 THEN RAISE EXCEPTION 'invalid_program_revision' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('uc_program_request:'||req::text,0));
 SELECT * INTO oldreq FROM public.program_fact_requests WHERE request_id=req;
 IF FOUND THEN
  IF oldreq.actor_id<>actor OR oldreq.organization_id<>org OR oldreq.payload<>payload THEN RAISE EXCEPTION 'program_request_collision' USING ERRCODE='22023'; END IF;
  RETURN oldreq.receipt;
 END IF;
 IF p_action IN('create','transition') THEN
  IF pid IS NULL THEN RAISE EXCEPTION 'invalid_program_id' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('uc_program_identity:'||pid::text,0));
  SELECT * INTO d FROM public.program_documents WHERE id=pid FOR UPDATE;
  IF FOUND AND d.organization_id<>org THEN RAISE EXCEPTION 'program_access_denied' USING ERRCODE='42501'; END IF;
  IF d.id IS NULL AND p_action<>'create' THEN RAISE EXCEPTION 'program_not_found' USING ERRCODE='42501'; END IF;
  SELECT * INTO head FROM public.program_fact_states WHERE program_id=pid FOR UPDATE;
  IF coalesce(head.revision,0)<>expected THEN RAISE EXCEPTION 'program_revision_conflict' USING ERRCODE='40001'; END IF;
  n:=expected+1;
  IF p_action='create' THEN
   PERFORM public.uc_validate_program_facts(p_payload->'facts',false);
   IF nullif(btrim(p_payload->>'name'),'') IS NULL OR length(p_payload->>'name')>500 OR length(p_payload->>'description')>4000
   OR NOT public.uc_org_document_review_actor(org,(p_payload->>'reviewer_id')::uuid) THEN RAISE EXCEPTION 'invalid_program_reviewer_or_name' USING ERRCODE='22023'; END IF;
   SELECT * INTO v FROM public.program_fact_versions WHERE id=head.current_version_id;
   IF v.state='in_review' THEN RAISE EXCEPTION 'program_review_in_progress' USING ERRCODE='22023'; END IF;
   IF NOT public.uc_program_active_file_proof(org,(p_payload->>'file_version_id')::uuid) THEN RAISE EXCEPTION 'approved_program_file_required' USING ERRCODE='22023'; END IF;
   SELECT * INTO filev FROM public.org_document_versions WHERE id=(p_payload->>'file_version_id')::uuid;
   SELECT * INTO review FROM public.org_document_reviews WHERE version_id=filev.id AND document_id=filev.document_id AND organization_id=org AND state='approved' ORDER BY approved_at DESC,id DESC LIMIT 1;
   IF d.id IS NULL THEN INSERT INTO public.program_documents(id,organization_id,name,description) VALUES(pid,org,p_payload->>'name',p_payload->>'description');
   ELSE UPDATE public.program_documents SET name=p_payload->>'name',description=p_payload->>'description' WHERE id=pid; END IF;
   IF v.state='draft' THEN UPDATE public.program_fact_versions SET state='cancelled',note='Superseded by a newly recorded facts version',revision=n WHERE id=v.id; END IF;
   INSERT INTO public.program_fact_versions(organization_id,program_id,version_number,revision,state,file_document_id,file_version_id,file_review_id,file_approval,facts,facts_hash,reviewer_user_id,reviewer_name,created_by,created_by_name)
   VALUES(org,pid,coalesce((SELECT max(version_number) FROM public.program_fact_versions WHERE program_id=pid),0)+1,n,'draft',filev.document_id,filev.id,review.id,
   jsonb_build_object('number',review.approval_number,'date',review.approval_date,'recorded_at',review.approved_at,'recorded_by',review.approved_by),p_payload->'facts',public.uc_program_hash(p_payload->'facts'),
   (p_payload->>'reviewer_id')::uuid,public.uc_org_document_review_actor_name(org,(p_payload->>'reviewer_id')::uuid),actor,public.uc_org_document_review_actor_name(org,actor)) RETURNING id INTO vid;
   INSERT INTO public.program_fact_states VALUES(pid,org,n,vid) ON CONFLICT(program_id) DO UPDATE SET revision=n,current_version_id=vid;
  ELSE
   SELECT * INTO v FROM public.program_fact_versions WHERE id=vid FOR UPDATE;
   IF head.current_version_id IS DISTINCT FROM vid THEN RAISE EXCEPTION 'program_version_is_not_current' USING ERRCODE='40001'; END IF;
   IF length(p_payload->>'note')>4000 THEN RAISE EXCEPTION 'invalid_program_note' USING ERRCODE='22023'; END IF;
   IF p_payload->>'transition' IN('submit','approve') AND NOT public.uc_program_active_file_proof(org,v.file_version_id) THEN RAISE EXCEPTION 'approved_program_file_required' USING ERRCODE='22023'; END IF;
   CASE p_payload->>'transition'
   WHEN 'submit' THEN
    IF v.state<>'draft' OR v.created_by<>actor THEN RAISE EXCEPTION 'program_transition_denied' USING ERRCODE='42501'; END IF;
    PERFORM public.uc_validate_program_facts(v.facts,true);
    IF NOT public.uc_org_document_review_actor(org,v.reviewer_user_id) THEN RAISE EXCEPTION 'program_reviewer_inactive' USING ERRCODE='42501'; END IF;
    UPDATE public.program_fact_versions SET state='in_review',revision=n,note=p_payload->>'note' WHERE id=vid;
   WHEN 'approve' THEN
    IF v.state<>'in_review' OR v.reviewer_user_id<>actor OR NOT public.uc_org_document_review_actor(org,actor) THEN RAISE EXCEPTION 'program_transition_denied' USING ERRCODE='42501'; END IF;
    PERFORM public.uc_validate_program_facts(v.facts,true);
    UPDATE public.program_fact_versions SET state='approved',revision=n,note=p_payload->>'note',approved_at=clock_timestamp(),approved_by=actor WHERE id=vid;
   WHEN 'reject' THEN
    IF v.state<>'in_review' OR v.reviewer_user_id<>actor OR NOT public.uc_org_document_review_actor(org,actor) THEN RAISE EXCEPTION 'program_transition_denied' USING ERRCODE='42501'; END IF;
    IF nullif(btrim(p_payload->>'note'),'') IS NULL THEN RAISE EXCEPTION 'program_decision_reason_required' USING ERRCODE='22023'; END IF;
    UPDATE public.program_fact_versions SET state='rejected',revision=n,note=p_payload->>'note' WHERE id=vid;
   WHEN 'cancel' THEN
    IF v.state NOT IN('draft','in_review') OR v.created_by<>actor THEN RAISE EXCEPTION 'program_transition_denied' USING ERRCODE='42501'; END IF;
    UPDATE public.program_fact_versions SET state='cancelled',revision=n,note=p_payload->>'note' WHERE id=vid;
   ELSE RAISE EXCEPTION 'invalid_program_transition' USING ERRCODE='22023'; END CASE;
   UPDATE public.program_fact_states SET revision=n WHERE program_id=pid;
  END IF;
  result:=public.uc_program_version_snapshot(vid);
  INSERT INTO public.program_fact_events(organization_id,entity_kind,entity_id,revision,actor_id,action,snapshot)VALUES(org,'program',pid,n,actor,CASE WHEN p_action='transition' THEN p_payload->>'transition' ELSE p_action END,result);
 ELSIF p_action='bind_course' THEN
  PERFORM 1 FROM public.courses WHERE id=cid AND organization_id=org FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'program_course_mismatch' USING ERRCODE='42501'; END IF;
  SELECT * INTO cb FROM public.course_program_bindings WHERE course_id=cid FOR UPDATE;
  IF coalesce(cb.revision,0)<>expected THEN RAISE EXCEPTION 'program_binding_revision_conflict' USING ERRCODE='40001'; END IF;
  SELECT * INTO v FROM public.program_fact_versions WHERE id=vid AND organization_id=org AND state='approved';
  IF NOT FOUND OR NOT public.uc_program_active_file_proof(org,v.file_version_id) THEN RAISE EXCEPTION 'approved_program_facts_required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.course_program_bindings VALUES(cid,org,expected+1,vid,v.program_id,clock_timestamp(),actor)
  ON CONFLICT(course_id) DO UPDATE SET revision=EXCLUDED.revision,version_id=EXCLUDED.version_id,program_id=EXCLUDED.program_id,recorded_at=EXCLUDED.recorded_at,recorded_by=EXCLUDED.recorded_by;
  SELECT to_jsonb(x) INTO result FROM public.course_program_bindings x WHERE course_id=cid;
  INSERT INTO public.program_fact_events(organization_id,entity_kind,entity_id,revision,actor_id,action,snapshot)VALUES(org,'course',cid,expected+1,actor,p_action,result);
 ELSIF p_action='bind_group' THEN
  SELECT * INTO g FROM public.student_groups WHERE id=gid AND organization_id=org FOR UPDATE;
  IF NOT FOUND OR g.course_id IS DISTINCT FROM cid OR cid IS NULL THEN RAISE EXCEPTION 'program_group_course_mismatch' USING ERRCODE='42501'; END IF;
  SELECT * INTO cb FROM public.course_program_bindings WHERE course_id=cid AND organization_id=org FOR SHARE;
  IF cb.version_id IS DISTINCT FROM vid THEN RAISE EXCEPTION 'current_course_program_binding_required' USING ERRCODE='40001'; END IF;
  SELECT * INTO gb FROM public.group_program_bindings WHERE group_id=gid FOR UPDATE;
  IF coalesce(gb.revision,0)<>expected THEN RAISE EXCEPTION 'program_binding_revision_conflict' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM public.group_program_enrollment_snapshots WHERE group_id=gid) THEN RAISE EXCEPTION 'group_program_binding_is_frozen' USING ERRCODE='22023'; END IF;
  SELECT * INTO v FROM public.program_fact_versions WHERE id=vid AND organization_id=org AND state='approved';
  IF NOT FOUND OR NOT public.uc_program_active_file_proof(org,v.file_version_id) THEN RAISE EXCEPTION 'approved_program_facts_required' USING ERRCODE='22023'; END IF;
  result:=public.uc_program_version_snapshot(vid);
  INSERT INTO public.group_program_bindings(group_id,course_id,organization_id,revision,version_id,program_id,program_snapshot,group_snapshot,snapshot_hash,recorded_by)
  VALUES(gid,cid,org,expected+1,vid,v.program_id,result,public.uc_program_group_calendar(gid),public.uc_program_hash(jsonb_build_object('program',result,'calendar',public.uc_program_group_calendar(gid))),actor)
  ON CONFLICT(group_id) DO UPDATE SET course_id=EXCLUDED.course_id,revision=EXCLUDED.revision,version_id=EXCLUDED.version_id,program_id=EXCLUDED.program_id,program_snapshot=EXCLUDED.program_snapshot,group_snapshot=EXCLUDED.group_snapshot,snapshot_hash=EXCLUDED.snapshot_hash,recorded_at=clock_timestamp(),recorded_by=actor;
  SELECT to_jsonb(x) INTO result FROM public.group_program_bindings x WHERE group_id=gid;
  INSERT INTO public.program_fact_events(organization_id,entity_kind,entity_id,revision,actor_id,action,snapshot)VALUES(org,'group',gid,expected+1,actor,p_action,result);
 ELSIF p_action='confirm_existing' THEN
  PERFORM 1 FROM public.student_groups WHERE id=gid AND organization_id=org FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'program_group_mismatch' USING ERRCODE='42501'; END IF;
  SELECT * INTO gb FROM public.group_program_bindings WHERE group_id=gid AND organization_id=org FOR SHARE;
  IF NOT FOUND OR gb.revision<>expected THEN RAISE EXCEPTION 'program_binding_revision_conflict' USING ERRCODE='40001'; END IF;
  IF jsonb_typeof(p_payload->'enrollment_ids')<>'array' OR jsonb_array_length(p_payload->'enrollment_ids') NOT BETWEEN 1 AND 1000
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'enrollment_ids') x WHERE jsonb_typeof(x)<>'string') THEN RAISE EXCEPTION 'invalid_program_enrollment_batch' USING ERRCODE='22023'; END IF;
  SELECT array_agg(DISTINCT x::uuid ORDER BY x::uuid) INTO ids FROM jsonb_array_elements_text(p_payload->'enrollment_ids') x;
  FOREACH eid IN ARRAY ids LOOP
   IF NOT public.uc_document_record_scope(org,gid,eid,NULL,gb.course_id) THEN RAISE EXCEPTION 'program_enrollment_scope_mismatch' USING ERRCODE='42501'; END IF;
   snap:=public.uc_capture_program_association(gid,eid,'confirmed_existing_association');
   IF snap IS NULL THEN RAISE EXCEPTION 'program_enrollment_association_mismatch' USING ERRCODE='22023'; END IF;
  END LOOP;
  SELECT jsonb_build_object('snapshots',jsonb_agg(to_jsonb(x) ORDER BY x.enrollment_id)) INTO result FROM public.group_program_enrollment_snapshots x WHERE group_id=gid AND enrollment_id=ANY(ids);
 ELSE RAISE EXCEPTION 'invalid_program_operation' USING ERRCODE='22023'; END IF;
 INSERT INTO public.program_fact_requests(request_id,organization_id,actor_id,payload,receipt)VALUES(req,org,actor,payload,result);
 RETURN result;
END;$fn$;

CREATE FUNCTION public.uc_capture_program_association(p_group uuid,p_enrollment uuid,p_source text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g public.student_groups;b public.group_program_bindings;e public.enrollments;s public.group_program_enrollment_snapshots;newid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('uc_program_roster:'||p_group::text,0));
 SELECT * INTO g FROM public.student_groups WHERE id=p_group FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO b FROM public.group_program_bindings WHERE group_id=g.id AND organization_id=g.organization_id AND course_id=g.course_id FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT en.* INTO e FROM public.enrollments en JOIN public.courses c ON c.id=en.course_id AND c.organization_id=g.organization_id
 JOIN public.profiles p ON p.user_id=en.user_id AND p.organization_id=g.organization_id
 WHERE en.id=p_enrollment AND en.course_id=g.course_id AND EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.group_id=g.id AND m.organization_id=g.organization_id AND m.user_id=en.user_id);
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO s FROM public.group_program_enrollment_snapshots WHERE group_id=g.id AND enrollment_id=e.id;
 IF FOUND THEN
  IF (s.user_id,s.course_id,s.organization_id) IS DISTINCT FROM (e.user_id,e.course_id,g.organization_id) THEN RETURN NULL; END IF;
  RETURN s.id;
 END IF;
 -- A broken object never rolls back operational learning membership/enrollment,
 -- but it cannot create a new claim that its programme bytes were available.
 IF NOT public.uc_program_file_proof(g.organization_id,(b.program_snapshot->>'file_version_id')::uuid) THEN RETURN NULL; END IF;
 INSERT INTO public.group_program_enrollment_snapshots(organization_id,group_id,enrollment_id,user_id,course_id,binding_id,binding_revision,version_id,program_snapshot,group_snapshot,snapshot_hash,source,recorded_by)
 VALUES(g.organization_id,g.id,e.id,e.user_id,e.course_id,b.id,b.revision,b.version_id,b.program_snapshot,b.group_snapshot,b.snapshot_hash,p_source,auth.uid())
 ON CONFLICT(group_id,enrollment_id) DO NOTHING RETURNING id INTO newid;
 RETURN coalesce(newid,(SELECT id FROM public.group_program_enrollment_snapshots WHERE group_id=g.id AND enrollment_id=e.id AND user_id=e.user_id AND course_id=e.course_id AND organization_id=g.organization_id));
END;$fn$;
CREATE FUNCTION public.uc_capture_program_association_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE x record;
BEGIN
 -- Unchanged profile/enrollment saves are not enrollment events and never backfill old associations.
 IF TG_TABLE_NAME='enrollments' THEN
  IF TG_OP='UPDATE' AND (NEW.id,NEW.user_id,NEW.course_id) IS NOT DISTINCT FROM (OLD.id,OLD.user_id,OLD.course_id) THEN RETURN NEW; END IF;
  FOR x IN SELECT m.group_id FROM public.student_group_memberships_effective m JOIN public.student_groups g ON g.id=m.group_id AND g.organization_id=m.organization_id WHERE m.user_id=NEW.user_id AND g.course_id=NEW.course_id LOOP
   PERFORM public.uc_capture_program_association(x.group_id,NEW.id,'association_created');
  END LOOP;
 ELSIF TG_TABLE_NAME='profiles' THEN
  IF TG_OP='UPDATE' AND (NEW.user_id,NEW.organization_id,NEW.student_group_id) IS NOT DISTINCT FROM (OLD.user_id,OLD.organization_id,OLD.student_group_id) THEN RETURN NEW; END IF;
  FOR x IN SELECT e.id,g.id group_id FROM public.student_groups g JOIN public.enrollments e ON e.course_id=g.course_id AND e.user_id=NEW.user_id WHERE g.id=NEW.student_group_id AND g.organization_id=NEW.organization_id LOOP
   PERFORM public.uc_capture_program_association(x.group_id,x.id,'association_created');
  END LOOP;
 ELSIF TG_TABLE_NAME='student_group_memberships' THEN
  IF TG_OP='UPDATE' AND (NEW.group_id,NEW.user_id,NEW.organization_id) IS NOT DISTINCT FROM (OLD.group_id,OLD.user_id,OLD.organization_id) THEN RETURN NEW; END IF;
  FOR x IN SELECT e.id FROM public.enrollments e JOIN public.student_groups g ON g.course_id=e.course_id WHERE g.id=NEW.group_id AND g.organization_id=NEW.organization_id AND e.user_id=NEW.user_id LOOP
   PERFORM public.uc_capture_program_association(NEW.group_id,x.id,'association_created');
  END LOOP;
 END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER zzz_uc_program_association AFTER INSERT OR UPDATE OF id,user_id,course_id ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.uc_capture_program_association_event();
CREATE TRIGGER zzz_uc_program_association AFTER INSERT OR UPDATE OF user_id,organization_id,student_group_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.uc_capture_program_association_event();
CREATE TRIGGER zzz_uc_program_association AFTER INSERT OR UPDATE OF group_id,user_id,organization_id ON public.student_group_memberships FOR EACH ROW EXECUTE FUNCTION public.uc_capture_program_association_event();
CREATE FUNCTION public.uc_guard_bound_program_group() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF (NEW.id,NEW.organization_id) IS DISTINCT FROM (OLD.id,OLD.organization_id)
 AND EXISTS(SELECT 1 FROM public.group_program_bindings WHERE group_id=OLD.id)
 THEN RAISE EXCEPTION 'group_program_identity_is_frozen' USING ERRCODE='22023'; END IF;
 IF (NEW.id,NEW.organization_id,NEW.course_id) IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.course_id)
 AND EXISTS(SELECT 1 FROM public.group_program_enrollment_snapshots WHERE group_id=OLD.id)
 THEN RAISE EXCEPTION 'group_program_association_is_frozen' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_program_frozen_group BEFORE UPDATE OF id,organization_id,course_id ON public.student_groups FOR EACH ROW EXECUTE FUNCTION public.uc_guard_bound_program_group();

CREATE FUNCTION public.get_course_program_binding(p_organization_id uuid,p_course_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE b public.course_program_bindings;
BEGIN
 IF NOT coalesce(public.uc_document_has_action(p_organization_id,'read') AND public.uc_document_course_scope_allowed(p_organization_id,p_course_id),false) OR NOT EXISTS(SELECT 1 FROM public.courses WHERE id=p_course_id AND organization_id=p_organization_id)
 THEN RAISE EXCEPTION 'program_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM public.course_program_bindings WHERE course_id=p_course_id AND organization_id=p_organization_id;
 RETURN jsonb_build_object('revision',coalesce(b.revision,0),'binding',CASE WHEN b.course_id IS NOT NULL THEN to_jsonb(b) END,'version',public.uc_program_version_snapshot(b.version_id));
END;$fn$;
CREATE FUNCTION public.get_group_program_facts(p_organization_id uuid,p_group_id uuid,p_enrollment_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g public.student_groups;b public.group_program_bindings;s public.group_program_enrollment_snapshots;e public.enrollments;own boolean:=false;w boolean;roster jsonb;confirmed boolean;file_proven boolean;reason text;
BEGIN
 SELECT * INTO g FROM public.student_groups WHERE id=p_group_id AND organization_id=p_organization_id;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RAISE EXCEPTION 'program_access_denied' USING ERRCODE='42501'; END IF;
 IF p_enrollment_id IS NOT NULL THEN
  SELECT en.* INTO e FROM public.enrollments en JOIN public.courses c ON c.id=en.course_id AND c.organization_id=p_organization_id
  WHERE en.id=p_enrollment_id AND en.course_id=g.course_id AND EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_organization_id AND m.group_id=g.id AND m.user_id=en.user_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'program_enrollment_scope_mismatch' USING ERRCODE='42501'; END IF;
  own:=e.user_id=auth.uid();
 END IF;
 IF NOT own AND NOT coalesce(public.uc_document_action_allowed(p_organization_id,'read',g.id,p_enrollment_id),false) THEN RAISE EXCEPTION 'program_access_denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM public.group_program_bindings WHERE group_id=g.id AND organization_id=g.organization_id AND course_id=g.course_id;
 SELECT * INTO s FROM public.group_program_enrollment_snapshots WHERE group_id=g.id AND enrollment_id=p_enrollment_id AND user_id=e.user_id AND course_id=e.course_id AND organization_id=g.organization_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('enrollment_id',en.id,'user_id',en.user_id,'snapshot_id',sn.id,'state',CASE WHEN sn.id IS NULL THEN 'unconfirmed' ELSE 'confirmed' END) ORDER BY en.user_id,en.id),'[]'::jsonb) INTO roster
 FROM public.enrollments en JOIN public.courses c ON c.id=en.course_id AND c.organization_id=g.organization_id
 JOIN public.profiles p ON p.user_id=en.user_id AND p.organization_id=g.organization_id
 LEFT JOIN public.group_program_enrollment_snapshots sn ON sn.enrollment_id=en.id AND sn.group_id=g.id AND sn.user_id=en.user_id AND sn.course_id=en.course_id AND sn.organization_id=g.organization_id
 WHERE en.course_id=g.course_id AND (NOT own OR en.id=p_enrollment_id) AND EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=g.organization_id AND m.group_id=g.id AND m.user_id=en.user_id);
 file_proven:=b.id IS NOT NULL AND public.uc_program_file_proof(g.organization_id,(b.program_snapshot->>'file_version_id')::uuid);
 confirmed:=file_proven AND (p_enrollment_id IS NULL OR s.id IS NOT NULL);
 reason:=CASE WHEN b.id IS NULL THEN 'no_confirmed_group_binding' WHEN NOT file_proven THEN 'exact_program_file_unavailable' WHEN p_enrollment_id IS NOT NULL AND s.id IS NULL THEN 'no_confirmed_enrollment_snapshot' END;
 w:=NOT own AND coalesce(public.uc_document_action_allowed(p_organization_id,'write',g.id,p_enrollment_id),false);
 RETURN jsonb_build_object('state',CASE WHEN confirmed THEN 'confirmed' ELSE 'unconfirmed' END,'reason',reason,'group_id',g.id,'course_id',g.course_id,'enrollment_id',p_enrollment_id,
 'revision',coalesce(b.revision,0),'binding',CASE WHEN b.id IS NOT NULL THEN to_jsonb(b) END,'snapshot',CASE WHEN s.id IS NOT NULL THEN to_jsonb(s) END,'enrollments',roster,
 'capabilities',jsonb_build_object('can_bind',w AND NOT EXISTS(SELECT 1 FROM public.group_program_enrollment_snapshots WHERE group_id=g.id),'can_confirm_existing',w AND file_proven));
END;$fn$;

CREATE FUNCTION public.create_program_facts_version(p_organization_id uuid,p_program_id uuid,p_name text,p_description text,p_file_version_id uuid,p_reviewer_id uuid,p_facts jsonb,p_expected_revision bigint,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_program_facts('create',jsonb_build_object('organization_id',p_organization_id,'program_id',p_program_id,'name',p_name,'description',p_description,'file_version_id',p_file_version_id,'reviewer_id',p_reviewer_id,'facts',p_facts,'expected_revision',p_expected_revision,'request_id',p_request_id))
$fn$;
CREATE FUNCTION public.transition_program_facts_version(p_version_id uuid,p_expected_revision bigint,p_action text,p_note text,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_program_facts('transition',jsonb_build_object('version_id',p_version_id,'expected_revision',p_expected_revision,'transition',p_action,'note',p_note,'request_id',p_request_id))
$fn$;
CREATE FUNCTION public.bind_course_program_version(p_organization_id uuid,p_course_id uuid,p_version_id uuid,p_expected_revision bigint,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_program_facts('bind_course',jsonb_build_object('organization_id',p_organization_id,'course_id',p_course_id,'version_id',p_version_id,'expected_revision',p_expected_revision,'request_id',p_request_id))
$fn$;
CREATE FUNCTION public.bind_group_program_version(p_organization_id uuid,p_group_id uuid,p_course_id uuid,p_version_id uuid,p_expected_revision bigint,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_program_facts('bind_group',jsonb_build_object('organization_id',p_organization_id,'group_id',p_group_id,'course_id',p_course_id,'version_id',p_version_id,'expected_revision',p_expected_revision,'request_id',p_request_id))
$fn$;
CREATE FUNCTION public.confirm_group_program_enrollments(p_organization_id uuid,p_group_id uuid,p_enrollment_ids uuid[],p_expected_binding_revision bigint,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_program_facts('confirm_existing',jsonb_build_object('organization_id',p_organization_id,'group_id',p_group_id,'enrollment_ids',p_enrollment_ids,'expected_revision',p_expected_binding_revision,'request_id',p_request_id))
$fn$;

-- An artifact records which exact learners its renderer requested. This is not a
-- claim that an arbitrary HTML body or the complete historical group roster was reviewed.
CREATE FUNCTION public.uc_program_document_proof(p_org uuid,p_group uuid,p_users uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE g public.student_groups;b public.group_program_bindings;ids uuid[];snaps jsonb;v jsonb;n integer;
BEGIN
 IF NOT coalesce(public.uc_document_action_allowed(p_org,'write',p_group,NULL),false) THEN RAISE EXCEPTION 'program_access_denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('uc_program_roster:'||p_group::text,0));
 SELECT * INTO g FROM public.student_groups WHERE id=p_group AND organization_id=p_org FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'program_group_mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM public.group_program_bindings WHERE group_id=g.id AND organization_id=p_org AND course_id=g.course_id FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('schema_version',1,'state','unconfirmed','organization_id',p_org,'group_id',g.id,'course_id',g.course_id,'reason','no_confirmed_group_binding'); END IF;
 IF p_users IS NULL OR array_position(p_users,NULL) IS NOT NULL OR cardinality(p_users)>1000
 THEN RAISE EXCEPTION 'explicit_program_document_roster_required' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(DISTINCT u ORDER BY u),'{}'::uuid[]) INTO ids FROM unnest(p_users) u;
 IF cardinality(ids)<>cardinality(p_users) THEN RAISE EXCEPTION 'duplicate_program_document_roster' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(s.id ORDER BY s.id),'[]'::jsonb),count(*) INTO snaps,n
 FROM public.group_program_enrollment_snapshots s JOIN public.enrollments e ON e.id=s.enrollment_id AND e.user_id=s.user_id AND e.course_id=s.course_id
 JOIN public.profiles p ON p.user_id=e.user_id AND p.organization_id=p_org
 WHERE s.group_id=g.id AND s.organization_id=p_org AND s.course_id=g.course_id AND s.user_id=ANY(ids)
 AND s.binding_id=b.id AND s.binding_revision=b.revision AND s.version_id=b.version_id AND s.snapshot_hash=b.snapshot_hash
 AND EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.group_id=g.id AND m.organization_id=p_org AND m.user_id=s.user_id);
 IF n<>cardinality(ids) OR NOT public.uc_program_file_proof(p_org,(b.program_snapshot->>'file_version_id')::uuid)
 THEN RAISE EXCEPTION 'program_document_snapshot_changed_or_unconfirmed' USING ERRCODE='40001'; END IF;
 v:=b.program_snapshot;
 RETURN jsonb_build_object('schema_version',1,'state','confirmed','organization_id',p_org,'group_id',g.id,'course_id',g.course_id,
 'program_id',b.program_id,'version_id',b.version_id,'file_document_id',v->'file_document_id','file_version_id',v->'file_version_id','file_review_id',v->'file_review_id',
 'facts_hash',v->'facts_hash','binding_id',b.id,'binding_revision',b.revision,'binding_snapshot_hash',b.snapshot_hash,'enrollment_snapshot_ids',snaps,
 'facts_snapshot',v->'facts','group_snapshot',b.group_snapshot);
END;$fn$;
CREATE FUNCTION public.uc_program_render_scalars(p_facts jsonb,p_calendar jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $fn$
 WITH dates AS(SELECT coalesce(p_calendar->>'start_date','') start_iso,coalesce(p_calendar->>'end_date','') end_iso),
 rendered AS(SELECT *,coalesce(to_char(nullif(start_iso,'')::date,'DD.MM.YYYY'),'') start_short,coalesce(to_char(nullif(end_iso,'')::date,'DD.MM.YYYY'),'') end_short FROM dates),
 projected AS(SELECT *,concat_ws(' — ',nullif(start_short,''),nullif(end_short,'')) period,
 CASE WHEN start_iso='' THEN '' ELSE '«'||to_char(start_iso::date,'DD')||'» '||(ARRAY['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'])[extract(month FROM start_iso::date)::integer]||' '||to_char(start_iso::date,'YYYY')||' г.' END start_ru,
 CASE WHEN end_iso='' THEN '' ELSE '«'||to_char(end_iso::date,'DD')||'» '||(ARRAY['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'])[extract(month FROM end_iso::date)::integer]||' '||to_char(end_iso::date,'YYYY')||' г.' END end_ru FROM rendered)
 SELECT jsonb_build_object('GROUP_NAME',coalesce(p_calendar->>'name',''),'START_DATE',start_iso,'END_DATE',end_iso,
 'START_DATE_RU',start_ru,'END_DATE_RU',end_ru,
 'SERVICE_START_DATE',start_iso,'SERVICE_END_DATE',end_iso,'SCHEDULE',coalesce(p_calendar->>'schedule_text',''),'STUDENT_DATES',period,
 'service_start_date',start_iso,'service_end_date',end_iso,'schedule',coalesce(p_calendar->>'schedule_text',''),
 'PROGRAM_DURATION_CALENDAR',coalesce(p_facts->>'duration_calendar',''),'ATTESTATION_FORM',coalesce(p_facts->>'attestation_form',''),
 'ATTESTATION_CRITERIA',coalesce(p_facts->>'attestation_criteria',''),'QUALIFICATION',coalesce(p_facts->>'qualification',''),'PROFESSION',coalesce(p_facts->>'profession',''),
 'group_name',coalesce(p_calendar->>'name',''),'start_date',start_short,'end_date',end_short,'start_date_ru',start_ru,'end_date_ru',end_ru,'train_period',period,'training_period',period,
 'schedule_text',CASE WHEN coalesce(p_calendar->>'schedule_text','')<>'' THEN 'Режим занятий: '||(p_calendar->>'schedule_text')||'.' ELSE 'Режим занятий в настройках группы не задан.' END,
 'STUDENT_PROGRAM',p_facts->>'full_title','STUDENT_HOURS',p_facts->>'academic_hours','STUDENT_PERIOD',period,
 'PROGRAM_GROUP',concat_ws('; ','Программа «'||(p_facts->>'full_title')||'»',CASE WHEN coalesce(p_calendar->>'name','')<>'' THEN 'группа «'||(p_calendar->>'name')||'»' END,CASE WHEN period<>'' THEN 'срок обучения '||period END),
 'instructor_name',btrim(coalesce(p_calendar->>'instructor_name','')),
 'INSTRUCTOR_NAME',coalesce(p_calendar->>'instructor_name',''))
 ||(SELECT jsonb_object_agg('DAY'||i||'_DATE',coalesce(to_char(nullif(p_calendar->'training_dates'->>(i-1),'')::date,'DD.MM.YYYY'),'')) FROM generate_series(1,4) i)
 ||(SELECT jsonb_object_agg('DATE_'||i,coalesce(to_char(nullif(p_calendar->'training_dates'->>(i-1),'')::date,'DD.MM.YYYY'),'')) FROM generate_series(1,4) i) FROM projected
$fn$;
CREATE FUNCTION public.uc_guard_program_artifact() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE j jsonb:=to_jsonb(NEW);prior jsonb;org uuid:=NEW.organization_id;grp uuid;users uuid[];expected jsonb;given jsonb;vs jsonb;vars jsonb;facts jsonb;form text;item jsonb;canonical jsonb;rendered jsonb;k text;value jsonb;row_index integer:=0;
BEGIN
 IF TG_TABLE_NAME='group_documents' THEN grp:=NEW.group_id;ELSE grp:=NEW.student_group_id;END IF;
 IF grp IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  prior:=to_jsonb(OLD);
  -- Operational archive/trash/version-list metadata does not regenerate old
  -- content or invent a historical programme source. Every other column,
  -- including document numbers, dates, doc_status and byte hashes, is compared.
  IF (j-ARRAY['status','is_current','updated_at','archived_at','deleted_at','deleted_by'])
   =(prior-ARRAY['status','is_current','updated_at','archived_at','deleted_at','deleted_by'])
   AND (j->'status' IS NOT DISTINCT FROM prior->'status'
    OR TG_TABLE_NAME='group_documents' AND prior->>'status' IN('active','archived') AND j->>'status' IN('active','archived')
    OR TG_TABLE_NAME='org_contracts' AND prior->>'status' IN('active','approved','signed') AND j->>'status' IN('archived','cancelled'))
  THEN RETURN NEW; END IF;
 END IF;
 vs:=coalesce(j->'variables_snapshot','{}'::jsonb);IF vs='null'::jsonb THEN vs:='{}'::jsonb;END IF;
 given:=vs->'program_facts';
 IF j->>'student_user_id' IS NOT NULL THEN users:=ARRAY[(j->>'student_user_id')::uuid];
 ELSIF TG_TABLE_NAME='org_contracts' THEN
  IF jsonb_typeof(j->'students')='array' THEN SELECT array_agg((x->>'user_id')::uuid ORDER BY x->>'user_id') INTO users FROM jsonb_array_elements(j->'students') x;END IF;
 ELSE
  IF jsonb_typeof(vs->'student_user_ids')='array' THEN SELECT coalesce(array_agg(x::uuid ORDER BY x::uuid),'{}'::uuid[]) INTO users FROM jsonb_array_elements_text(vs->'student_user_ids') x;END IF;
 END IF;
 expected:=public.uc_program_document_proof(org,grp,users);
 IF given IS NOT NULL AND given<>expected OR (expected->>'state'='confirmed' AND given IS NULL)
 THEN RAISE EXCEPTION 'program_document_proof_mismatch_refresh' USING ERRCODE='40001'; END IF;
 IF expected->>'state'='unconfirmed' THEN
  IF TG_TABLE_NAME='group_documents' AND (coalesce(j->>'doc_status','draft')<>'draft' OR nullif(btrim(j->>'document_number'),'') IS NOT NULL)
  OR TG_TABLE_NAME='org_contracts' AND (coalesce(j->>'status','draft')<>'draft' OR nullif(btrim(j->>'contract_number'),'') IS NOT NULL)
  THEN RAISE EXCEPTION 'unconfirmed_program_facts_draft_only' USING ERRCODE='22023'; END IF;
 ELSE
  SELECT program_snapshot->'facts' INTO facts FROM public.group_program_bindings WHERE group_id=grp;
  form:=CASE facts->>'training_form' WHEN 'full_time' THEN 'Очная' WHEN 'part_time' THEN 'Заочная' WHEN 'mixed' THEN 'Очно-заочная' END;
  vars:=coalesce(j->'variables','{}'::jsonb);
  IF TG_TABLE_NAME='group_documents' THEN
   IF j->>'layout_format'='docx_ooxml' THEN
    IF (vs->'scalars'->>'PROGRAM_TITLE',vs->'scalars'->>'PROGRAM_HOURS',vs->'scalars'->>'PROGRAM_FORM') IS DISTINCT FROM (facts->>'full_title',facts->>'academic_hours',form)
    THEN RAISE EXCEPTION 'program_document_scalar_mismatch' USING ERRCODE='40001'; END IF;
   ELSIF (vars->>'program_title',vars->>'program_hours',vars->>'program_form') IS DISTINCT FROM (facts->>'full_title',facts->>'academic_hours',form)
   THEN RAISE EXCEPTION 'program_document_scalar_mismatch' USING ERRCODE='40001'; END IF;
  ELSIF vs ? 'programs' THEN
   IF jsonb_typeof(vs->'programs')<>'array' OR jsonb_array_length(vs->'programs')<>1
   OR (vs->'programs'->0->>'PROG_TITLE',vs->'programs'->0->>'PROG_FORM',vs->'programs'->0->>'PROG_COUNT') IS DISTINCT FROM (facts->>'full_title',form,cardinality(users)::text)
   OR vs->>'PROGRAM_HOURS' IS DISTINCT FROM facts->>'academic_hours'
   OR jsonb_typeof(vs->'students')<>'array' OR jsonb_array_length(vs->'students')<>cardinality(users)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(vs->'students') x WHERE x->>'STUDENT_PROGRAM' IS DISTINCT FROM facts->>'full_title')
   THEN RAISE EXCEPTION 'program_contract_scalar_mismatch' USING ERRCODE='40001'; END IF;
  ELSIF (vars->>'program_title',vars->>'program_hours',vars->>'program_form',vars->>'course_title',vars->>'course_hours')
   IS DISTINCT FROM (facts->>'full_title',facts->>'academic_hours',form,facts->>'full_title',facts->>'academic_hours')
  THEN RAISE EXCEPTION 'program_contract_scalar_mismatch' USING ERRCODE='40001'; END IF;
  canonical:=public.uc_program_render_scalars(facts,expected->'group_snapshot');
  rendered:=CASE WHEN TG_TABLE_NAME='group_documents' AND j->>'layout_format'='docx_ooxml' THEN vs->'scalars'
    WHEN TG_TABLE_NAME='org_contracts' AND vs ? 'programs' THEN vs->'scalars' ELSE vars END;
  FOR k,value IN SELECT * FROM jsonb_each(canonical) LOOP
   IF rendered ? k AND rendered->k IS DISTINCT FROM value THEN RAISE EXCEPTION 'program_calendar_or_facts_scalar_mismatch' USING ERRCODE='40001'; END IF;
  END LOOP;
  IF jsonb_typeof(vs->'rows')='array' THEN
   FOR item IN SELECT * FROM jsonb_array_elements(vs->'rows') LOOP
    row_index:=row_index+1;
    FOR k,value IN SELECT * FROM jsonb_each(canonical) LOOP
     IF item ? k AND item->k IS DISTINCT FROM value THEN RAISE EXCEPTION 'program_document_row_scalar_mismatch' USING ERRCODE='40001'; END IF;
    END LOOP;
    IF TG_TABLE_NAME='group_documents' AND j->>'doc_type'='schedule' AND(
     item ? 'DATE' AND item->>'DATE' IS DISTINCT FROM coalesce(to_char(nullif(expected->'group_snapshot'->'training_dates'->>(row_index-1),'')::date,'DD.MM.YYYY'),'')
     OR item ? 'TIME' AND item->>'TIME' IS DISTINCT FROM coalesce(expected->'group_snapshot'->>'schedule_text','')
     OR item ? 'TEACHER' AND item->>'TEACHER' IS DISTINCT FROM coalesce(expected->'group_snapshot'->>'instructor_name',''))
    THEN RAISE EXCEPTION 'program_schedule_row_scalar_mismatch' USING ERRCODE='40001'; END IF;
   END LOOP;
  END IF;
  IF TG_TABLE_NAME='org_contracts' AND vs ? 'programs' AND EXISTS(SELECT 1 FROM jsonb_array_elements(vs->'students') s WHERE
   s ? 'STUDENT_DATES' AND s->'STUDENT_DATES' IS DISTINCT FROM canonical->'STUDENT_DATES'
   OR s ? 'STUDENT_HOURS' AND s->>'STUDENT_HOURS' IS DISTINCT FROM facts->>'academic_hours')
  THEN RAISE EXCEPTION 'program_contract_row_scalar_mismatch' USING ERRCODE='40001'; END IF;
 END IF;
 NEW.variables_snapshot:=vs||jsonb_build_object('program_facts',expected);
 RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_program_artifact_guard BEFORE INSERT OR UPDATE ON public.group_documents FOR EACH ROW EXECUTE FUNCTION public.uc_guard_program_artifact();
CREATE TRIGGER uc_program_artifact_guard BEFORE INSERT OR UPDATE ON public.org_contracts FOR EACH ROW EXECUTE FUNCTION public.uc_guard_program_artifact();

-- Staging is still trusted-service only (UC106). The original-user final INSERT
-- rechecks exact facts after rendering, and failure rolls back stage consumption.
-- No existing compiler RPC, document row or old idempotency receipt is rewritten.

CREATE TABLE public.education_document_program_sources(
 record_id uuid PRIMARY KEY REFERENCES public.education_document_records(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 enrollment_snapshot_id uuid NOT NULL REFERENCES public.group_program_enrollment_snapshots(id),snapshot jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),recorded_by uuid NOT NULL
);
ALTER TABLE public.education_document_program_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.education_document_program_sources FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER uc_program_history_immutable BEFORE UPDATE OR DELETE ON public.education_document_program_sources FOR EACH ROW EXECUTE FUNCTION public.uc_guard_program_history();
CREATE FUNCTION public.uc_program_issuance_source(p_org uuid,p_group uuid,p_enrollment uuid,p_user uuid,p_course uuid)
RETURNS public.group_program_enrollment_snapshots LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.group_program_enrollment_snapshots;b public.group_program_bindings;
BEGIN
 IF p_group IS NULL OR p_enrollment IS NULL OR NOT coalesce(public.uc_document_has_action(p_org,'issue') AND public.uc_document_record_scope(p_org,p_group,p_enrollment,p_user,p_course),false)
 THEN RAISE EXCEPTION 'exact_program_issuance_scope_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('uc_program_roster:'||p_group::text,0));
 PERFORM 1 FROM public.student_groups WHERE id=p_group AND organization_id=p_org AND course_id=p_course FOR SHARE;
 SELECT * INTO b FROM public.group_program_bindings WHERE group_id=p_group AND organization_id=p_org AND course_id=p_course FOR SHARE;
 SELECT * INTO s FROM public.group_program_enrollment_snapshots WHERE group_id=p_group AND enrollment_id=p_enrollment AND organization_id=p_org AND user_id=p_user AND course_id=p_course
 AND binding_id=b.id AND binding_revision=b.revision AND version_id=b.version_id AND snapshot_hash=b.snapshot_hash;
 IF NOT FOUND OR NOT public.uc_program_file_proof(p_org,(s.program_snapshot->>'file_version_id')::uuid)
 THEN RAISE EXCEPTION 'confirmed_program_issuance_snapshot_required' USING ERRCODE='22023'; END IF;
 RETURN s;
END;$fn$;
CREATE FUNCTION public.uc_program_issuance_lifecycle(p_before jsonb,p_after jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 -- Delivery/trash/cancellation never reissue a document or attach a fabricated
 -- source to legacy facts. Cancellation cannot be undone into a claimed original.
 SELECT (p_before-ARRAY['updated_at','deleted_at','deleted_by','delivery_method','delivery_details','notes','document_status'])
  =(p_after-ARRAY['updated_at','deleted_at','deleted_by','delivery_method','delivery_details','notes','document_status'])
 AND (p_before->'document_status' IS NOT DISTINCT FROM p_after->'document_status'
  OR p_before->>'document_status' IN('original','duplicate') AND p_after->>'document_status'='cancelled')
$fn$;
CREATE FUNCTION public.uc_guard_program_issuance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.group_program_enrollment_snapshots;f jsonb;t text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF public.uc_program_issuance_lifecycle(to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.education_document_program_sources WHERE record_id=OLD.id) THEN RAISE EXCEPTION 'issued_program_source_is_immutable' USING ERRCODE='42501'; END IF;
 END IF;
 s:=public.uc_program_issuance_source(NEW.organization_id,NEW.group_id,NEW.enrollment_id,NEW.user_id,NEW.course_id);
 f:=s.program_snapshot->'facts';t:=CASE f->>'program_type' WHEN 'dpo_upskilling' THEN 'certificate' WHEN 'dpo_retraining' THEN 'diploma' WHEN 'professional_training' THEN 'qualification' END;
 IF t IS NULL OR NEW.document_type IS DISTINCT FROM t THEN RAISE EXCEPTION 'education_document_type_program_mismatch' USING ERRCODE='22023'; END IF;
 -- These fields are server-derived; neither a live course title nor a caller's export row is authoritative.
 NEW.specialty_name:=f->>'full_title';NEW.qualification_name:=coalesce(f->>'qualification',f->>'profession');
 RETURN NEW;
END;$fn$;
CREATE FUNCTION public.uc_record_program_issuance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.group_program_enrollment_snapshots;
BEGIN
 IF TG_OP='UPDATE' AND public.uc_program_issuance_lifecycle(to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 s:=public.uc_program_issuance_source(NEW.organization_id,NEW.group_id,NEW.enrollment_id,NEW.user_id,NEW.course_id);
 INSERT INTO public.education_document_program_sources(record_id,organization_id,enrollment_snapshot_id,snapshot,recorded_by)
 VALUES(NEW.id,NEW.organization_id,s.id,to_jsonb(s),auth.uid());RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_program_issuance_guard BEFORE INSERT OR UPDATE ON public.education_document_records FOR EACH ROW EXECUTE FUNCTION public.uc_guard_program_issuance();
CREATE TRIGGER uc_program_issuance_record AFTER INSERT OR UPDATE ON public.education_document_records FOR EACH ROW EXECUTE FUNCTION public.uc_record_program_issuance();
DO $auto_issuance$ DECLARE src text;needle text;replacement text;
BEGIN
 IF md5(pg_get_functiondef('public.auto_create_education_document()'::regprocedure))<>'6be323dfb0295c9b083fb0273ad7d8ff'
 OR md5(pg_get_functiondef('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure))<>'669c0cd4987e806846f03a4e82f8be15'
 THEN RAISE EXCEPTION 'Programme facts: unreviewed issuance baseline'; END IF;
 SELECT pg_get_functiondef('public.auto_create_education_document()'::regprocedure) INTO src;
 src:=replace(src,'  v_course public.courses%ROWTYPE;','  v_course public.courses%ROWTYPE;'||E'\n  v_program_source public.group_program_enrollment_snapshots;\n  v_association_count integer;');
 needle:=$old$  IF NOT FOUND OR v_course.frdo_program_type IS NULL THEN RETURN NEW; END IF;

  v_doc_type := CASE v_course.frdo_program_type
    WHEN 'qualification_upgrade' THEN 'certificate'
    WHEN 'professional_retraining' THEN 'diploma'
    WHEN 'professional_training' THEN 'qualification'
    ELSE NULL
  END;$old$;
 replacement:=$new$  IF NOT FOUND THEN RETURN NEW; END IF;
  -- Completion stays successful when provenance or issuance authority is unknown.
  -- Multiple effective associations require explicit group selection; never pick the first.
  SELECT count(*) INTO v_association_count FROM public.student_group_memberships_effective m
  JOIN public.student_groups g ON g.id=m.group_id AND g.organization_id=m.organization_id
  WHERE m.user_id=NEW.user_id AND m.organization_id=v_course.organization_id AND g.course_id=NEW.course_id;
  IF v_association_count<>1 THEN RETURN NEW; END IF;
  SELECT m.group_id INTO v_group_id FROM public.student_group_memberships_effective m JOIN public.student_groups g ON g.id=m.group_id AND g.organization_id=m.organization_id
  WHERE m.user_id=NEW.user_id AND m.organization_id=v_course.organization_id AND g.course_id=NEW.course_id;
  IF NOT coalesce(public.uc_document_has_action(v_course.organization_id,'issue') AND public.uc_document_record_scope(v_course.organization_id,v_group_id,NEW.id,NEW.user_id,NEW.course_id),false) THEN RETURN NEW; END IF;
  v_program_source:=public.uc_program_issuance_source(v_course.organization_id,v_group_id,NEW.id,NEW.user_id,NEW.course_id);
  v_course.title:=v_program_source.program_snapshot->'facts'->>'full_title';
  v_course.frdo_qualification_name:=coalesce(v_program_source.program_snapshot->'facts'->>'qualification',v_program_source.program_snapshot->'facts'->>'profession');
  v_doc_type := CASE v_program_source.program_snapshot->'facts'->>'program_type'
    WHEN 'dpo_upskilling' THEN 'certificate'
    WHEN 'dpo_retraining' THEN 'diploma'
    WHEN 'professional_training' THEN 'qualification'
    ELSE NULL
  END;$new$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Programme facts: auto source marker changed'; END IF;src:=replace(src,needle,replacement);
 needle:=$old$  SELECT NULLIF(BTRIM(p.full_name), ''), p.student_group_id
  INTO v_full_name, v_group_id$old$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Programme facts: auto group marker changed'; END IF;
 src:=replace(src,needle,$new$  SELECT NULLIF(BTRIM(p.full_name), '')
  INTO v_full_name$new$);EXECUTE src;
 SELECT pg_get_functiondef('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure) INTO src;
 needle:='    IF v_existing_id IS NOT NULL THEN v_ids := array_append(v_ids, v_existing_id); CONTINUE; END IF;';
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Programme facts: issuance replay marker changed'; END IF;
 src:=replace(src,needle,$new$    IF v_existing_id IS NOT NULL THEN
      IF EXISTS(SELECT 1 FROM public.education_document_program_sources ps WHERE ps.record_id=v_existing_id
       AND (ps.snapshot->>'group_id')::uuid IS DISTINCT FROM p_group_id) THEN
       RAISE EXCEPTION 'original_document_belongs_to_other_program_association' USING ERRCODE='22023'; END IF;
      v_ids := array_append(v_ids, v_existing_id); CONTINUE;
    END IF;$new$);EXECUTE src;
END;$auto_issuance$;

-- The actual legacy bucket is already private. New programme files use UC006 versioning.
-- This separate boundary also constrains broad overlapping policies and platform viewers.
CREATE POLICY uc_program_legacy_read_boundary ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated,anon
 USING(bucket_id NOT IN('program-files','program-documents') OR (bucket_id='program-files' AND split_part(name,'/',1)='programs'
 AND split_part(name,'/',3)<>'' AND public.uc_document_action_allowed(public.storage_try_uuid(split_part(name,'/',2)),'read',NULL,NULL)));
CREATE POLICY uc_program_legacy_no_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated,anon WITH CHECK(bucket_id NOT IN('program-files','program-documents'));
CREATE POLICY uc_program_legacy_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated,anon USING(bucket_id NOT IN('program-files','program-documents')) WITH CHECK(bucket_id NOT IN('program-files','program-documents'));
CREATE POLICY uc_program_legacy_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated,anon USING(bucket_id NOT IN('program-files','program-documents'));
CREATE FUNCTION public.uc_guard_program_navigation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id,NEW.organization_id) IS DISTINCT FROM(OLD.id,OLD.organization_id) THEN RAISE EXCEPTION 'program_navigation_identity_immutable' USING ERRCODE='42501'; END IF;
 IF NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.program_categories WHERE id=NEW.category_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'program_category_tenant_mismatch' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='program_documents' THEN
  IF NEW.folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.program_folders WHERE id=NEW.folder_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'program_folder_tenant_mismatch' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='program_folders' THEN
 IF NEW.parent_id IS NOT NULL THEN
  IF NEW.parent_id=NEW.id OR NOT EXISTS(SELECT 1 FROM public.program_folders WHERE id=NEW.parent_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'program_parent_tenant_mismatch' USING ERRCODE='42501'; END IF;
  IF EXISTS(WITH RECURSIVE ancestors AS (SELECT id,parent_id FROM public.program_folders WHERE id=NEW.parent_id UNION SELECT f.id,f.parent_id FROM public.program_folders f JOIN ancestors a ON a.parent_id=f.id) SELECT 1 FROM ancestors WHERE id=NEW.id) THEN RAISE EXCEPTION 'program_folder_cycle' USING ERRCODE='22023'; END IF;
 END IF;
 END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_program_navigation_guard BEFORE INSERT OR UPDATE ON public.program_documents FOR EACH ROW EXECUTE FUNCTION public.uc_guard_program_navigation();
CREATE TRIGGER uc_program_navigation_guard BEFORE INSERT OR UPDATE ON public.program_folders FOR EACH ROW EXECUTE FUNCTION public.uc_guard_program_navigation();

DO $grants$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(
 'uc_program_hash','uc_validate_program_facts','uc_program_file_proof','uc_program_active_file_proof','uc_program_version_snapshot','uc_program_group_calendar','uc_guard_program_history','uc_mutate_program_facts','uc_capture_program_association','uc_capture_program_association_event','uc_guard_bound_program_group','uc_guard_program_navigation','uc_program_document_proof','uc_program_render_scalars','uc_guard_program_artifact','uc_program_issuance_source','uc_program_issuance_lifecycle','uc_guard_program_issuance','uc_record_program_issuance',
 'get_program_facts','list_program_facts','list_program_facts_candidates','get_course_program_binding','get_group_program_facts','create_program_facts_version','transition_program_facts_version','bind_course_program_version','bind_group_program_version','confirm_group_program_enrollments') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.oid::regprocedure);
  IF f.proname NOT LIKE 'uc_%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.oid::regprocedure); END IF;
 END LOOP;
END;$grants$;
