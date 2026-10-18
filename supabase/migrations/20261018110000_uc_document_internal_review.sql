-- UC-010: organization-recorded internal review of an exact immutable file version.
-- No legal signature, issuance, external messages, file mutation or historical backfill.
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM (VALUES
 ('public.uc_document_action_allowed(uuid,text,uuid,uuid)','79c190a053f711dc8110e9d451b1a56c'),
 ('public.uc_platform_document_action_allowed(uuid,text)','e5a1436d0cc46218d379c3ffec8c0d0d'),
 ('public.uc_document_scope_allowed(uuid,uuid,uuid)','2a7407e7d178c7561b1d390f0884c6b6'),
 ('public.uc_document_teacher_limited(uuid)','72cdbafda69c66500e0d9ae87e8ae403'),
 ('public.is_org_owner(uuid,uuid)','362aca6afc26c775be594843258b2ab2'),
 ('public.has_org_staff_permission(uuid,uuid,text)','3d1fedafe94778fa19dd47acb71a3782'),
 ('public.uc_guard_document_pointer()','05734107701fca0104e19952c4880440'),
 ('public.uc_guard_document_version_write()','e62e9d7f9c8f6c99c049417775b5da2a'),
 ('public.uc_org_document_blob_committed(text,text)','bc750c58e3d50e33bfd6bf6844fffbaa')
 ) b(signature,hash) WHERE to_regprocedure(signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>hash)
 THEN RAISE EXCEPTION 'Internal review: unreviewed document/access baseline'; END IF;
 IF (SELECT count(*) FROM pg_policies p WHERE schemaname='storage' AND tablename='objects' AND
  ((policyname='uc_org_document_blob_no_overwrite' AND md5(to_jsonb(p)::text)='c5030108254eabf8300b0c94b9d7ef4e') OR
   (policyname='uc_org_document_blob_no_delete' AND md5(to_jsonb(p)::text)='c82f6a57a88835e478dba6728f01489b')))<>2
 THEN RAISE EXCEPTION 'Internal review: unreviewed immutable Storage boundary'; END IF;
END;$preflight$;

CREATE TABLE public.org_document_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES public.org_documents(id),version_id uuid NOT NULL REFERENCES public.org_document_versions(id),
 revision bigint NOT NULL CHECK(revision>0),state text NOT NULL CHECK(state IN('draft','in_review','changes_requested','approved','cancelled')),
 responsible_user_id uuid NOT NULL,reviewer_user_id uuid NOT NULL,responsible_name text NOT NULL,reviewer_name text NOT NULL,
 links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(links)='array'),
 approval_number text,approval_date date,approved_at timestamptz,approved_by uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(document_id,version_id),
 CHECK((state='approved')=(approval_number IS NOT NULL AND approval_date IS NOT NULL AND approved_at IS NOT NULL AND approved_by IS NOT NULL))
);
CREATE TABLE public.org_document_review_comments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 review_id uuid NOT NULL REFERENCES public.org_document_reviews(id) ON DELETE CASCADE,version_id uuid NOT NULL,
 author_user_id uuid NOT NULL,author_name text NOT NULL,author_role text NOT NULL,
 comment_text text NOT NULL,quoted_text text,position_anchor jsonb,
 resolution_status text NOT NULL DEFAULT 'unresolved' CHECK(resolution_status IN('unresolved','accepted','declined')),
 org_reply text,resolved_by uuid,resolved_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((resolution_status='unresolved')=(resolved_by IS NULL AND resolved_at IS NULL))
);
CREATE TABLE public.org_document_review_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 review_id uuid NOT NULL REFERENCES public.org_document_reviews(id) ON DELETE CASCADE,revision bigint NOT NULL,
 actor_id uuid NOT NULL,action text NOT NULL,note text,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(review_id,revision)
);
CREATE TABLE public.org_document_review_requests(
 request_id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 document_id uuid NOT NULL,review_id uuid NOT NULL,actor_id uuid NOT NULL,payload jsonb NOT NULL,receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX org_document_review_comments_review ON public.org_document_review_comments(review_id,created_at,id);
CREATE INDEX org_document_review_events_review ON public.org_document_review_events(review_id,revision);
DO $acl$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['org_document_reviews','org_document_review_comments','org_document_review_events','org_document_review_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  IF t<>'org_document_review_requests' THEN
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
   EXECUTE format('CREATE POLICY uc_internal_review_read ON public.%I FOR SELECT TO authenticated USING(public.uc_document_action_allowed(organization_id,''read'',NULL,NULL))',t);
   EXECUTE format('CREATE POLICY uc_internal_review_read_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.uc_document_action_allowed(organization_id,''read'',NULL,NULL)) WITH CHECK(false)',t);
  END IF;
 END LOOP;
END;$acl$;

-- This helper evaluates a proposed assignee, never impersonates that account.
CREATE FUNCTION public.uc_org_document_review_actor(p_org uuid,p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_org IS NOT NULL AND p_user IS NOT NULL
 AND public.uc_platform_document_action_allowed(p_user,'write')
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND (public.is_org_owner(p_user,p_org) OR
  EXISTS(SELECT 1 FROM public.org_staff s WHERE s.organization_id=p_org AND s.user_id=p_user
   AND (s.expires_at IS NULL OR s.expires_at>now()) AND public.has_org_staff_permission(p_user,p_org,'documents.write')
   AND (s.role<>'teacher' OR public.has_role(p_user,'admin'::public.app_role))))
$fn$;
-- Display snapshots belong to the review, not an additional directory grant.
CREATE FUNCTION public.uc_org_document_review_actor_name(p_org uuid,p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(nullif(s.display_name,''),nullif(p.full_name,''),'Сотрудник')
 FROM (SELECT p_user user_id) a LEFT JOIN public.profiles p ON p.user_id=a.user_id
 LEFT JOIN public.org_staff s ON s.user_id=a.user_id AND s.organization_id=p_org
$fn$;
CREATE FUNCTION public.uc_org_document_review_file_state(p_doc public.org_documents)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $fn$
 SELECT CASE WHEN p_doc.deleted_at IS NOT NULL THEN 'deleted' WHEN p_doc.status='archived' THEN 'archived'
 WHEN nullif(btrim(p_doc.file_url),'') IS NULL THEN 'fileless'
 WHEN p_doc.status='expired' OR p_doc.expires_at<current_date THEN 'expired'
 WHEN p_doc.status<>'active' OR p_doc.status IS NULL THEN 'unconfirmed'
 WHEN p_doc.expires_at<=current_date+30 THEN 'expiring' ELSE 'active' END
$fn$;
-- Existing UC006 append-only paths and exact object metadata are required.
-- A historical URL or immutable database pointer alone is not proof of a file.
CREATE FUNCTION public.uc_org_document_review_file_bound(p_doc public.org_documents)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.org_document_versions v JOIN storage.objects o ON o.id=v.storage_object_id
  WHERE v.id=p_doc.current_version_id AND v.document_id=p_doc.id AND v.organization_id=p_doc.organization_id
   AND v.event_kind IN('upload','restore') AND v.file_url IS NOT DISTINCT FROM p_doc.file_url
   AND v.file_path ~ ('^'||p_doc.organization_id::text||'/versions/'||p_doc.id::text||'/[0-9a-f-]{36}[.][a-z0-9]{1,12}$')
   AND o.bucket_id='org-documents' AND o.name=v.file_path
   AND v.file_url ~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?/storage/v1/object/public/org-documents/'
   AND right(v.file_url,length('/org-documents/'||v.file_path))='/org-documents/'||v.file_path
   AND v.file_size IS NOT NULL AND v.file_size>0 AND o.metadata->>'size' ~ '^[0-9]+$'
   AND v.file_size=CASE WHEN o.metadata->>'size' ~ '^[0-9]+$' THEN (o.metadata->>'size')::numeric END
   AND v.storage_metadata=jsonb_build_object('size',v.file_size,'etag',coalesce(o.metadata->>'eTag',o.metadata->>'etag'),'mimetype',o.metadata->>'mimetype'))
$fn$;
CREATE FUNCTION public.uc_org_document_review_snapshot(p_review uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('id',r.id,'organization_id',r.organization_id,'document_id',r.document_id,'version_id',r.version_id,
  'revision',r.revision,'state',r.state,'responsible_user_id',r.responsible_user_id,'reviewer_user_id',r.reviewer_user_id,
  'responsible_name',r.responsible_name,'reviewer_name',r.reviewer_name,'links',r.links,
  'approval',CASE WHEN r.state='approved' THEN jsonb_build_object('number',r.approval_number,'date',r.approval_date,'recorded_at',r.approved_at,'recorded_by',r.approved_by) END,
  'requires_new_version',EXISTS(SELECT 1 FROM public.org_document_review_comments c WHERE c.review_id=r.id AND c.resolution_status='accepted' AND c.position_anchor->>'kind' IN('insert','delete','replace')),
  'comments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'author_user_id',c.author_user_id,'author_name',c.author_name,'author_role',c.author_role,
    'quoted_text',c.quoted_text,'comment_text',c.comment_text,'position_anchor',c.position_anchor,'resolved',c.resolution_status<>'unresolved',
    'resolution_status',c.resolution_status,'org_reply',c.org_reply,'created_at',c.created_at) ORDER BY c.created_at,c.id)
   FROM public.org_document_review_comments c WHERE c.review_id=r.id),'[]'::jsonb),
  'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'actor_id',e.actor_id,'created_at',e.created_at,'note',e.note) ORDER BY e.revision)
   FROM public.org_document_review_events e WHERE e.review_id=r.id),'[]'::jsonb))
 FROM public.org_document_reviews r WHERE r.id=p_review
$fn$;

CREATE FUNCTION public.uc_guard_org_document_review_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=OLD.organization_id) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Internal review history is immutable' USING ERRCODE='42501';
END;$fn$;
CREATE TRIGGER uc_internal_review_event_immutable BEFORE UPDATE OR DELETE ON public.org_document_review_events
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_org_document_review_history();
CREATE TRIGGER uc_internal_review_request_immutable BEFORE UPDATE OR DELETE ON public.org_document_review_requests
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_org_document_review_history();

CREATE FUNCTION public.uc_guard_org_document_review_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=OLD.organization_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Internal review records cannot be deleted' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='org_document_reviews' THEN
  IF NOT EXISTS(SELECT 1 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id
   WHERE v.id=NEW.version_id AND d.id=NEW.document_id AND d.organization_id=NEW.organization_id AND v.organization_id=NEW.organization_id) THEN
   RAISE EXCEPTION 'Review version/organization mismatch' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (OLD.state IN('approved','cancelled') OR
   (NEW.id,NEW.organization_id,NEW.document_id,NEW.version_id,NEW.created_at) IS DISTINCT FROM
   (OLD.id,OLD.organization_id,OLD.document_id,OLD.version_id,OLD.created_at)) THEN
   RAISE EXCEPTION 'Closed review or version provenance is immutable' USING ERRCODE='42501'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.org_document_reviews r WHERE r.id=NEW.review_id AND r.organization_id=NEW.organization_id AND r.version_id=NEW.version_id) THEN
   RAISE EXCEPTION 'Comment review/version mismatch' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['resolution_status','org_reply','resolved_by','resolved_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['resolution_status','org_reply','resolved_by','resolved_at']) OR OLD.resolution_status<>'unresolved') THEN
   RAISE EXCEPTION 'Original comment and resolved decision are immutable' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_internal_review_record_guard BEFORE INSERT OR UPDATE OR DELETE ON public.org_document_reviews
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_org_document_review_record();
CREATE TRIGGER uc_internal_review_comment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.org_document_review_comments
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_org_document_review_record();

CREATE FUNCTION public.uc_validate_org_document_review_links(p_org uuid,p_links jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE x jsonb;v_id uuid;v_version uuid;
BEGIN
 IF jsonb_typeof(p_links) IS DISTINCT FROM 'array' OR jsonb_array_length(p_links)>100 THEN
  RAISE EXCEPTION 'Invalid review links' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_links) e GROUP BY e->>'kind',e->>'id' HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Duplicate review link' USING ERRCODE='22023'; END IF;
 FOR x IN SELECT * FROM jsonb_array_elements(p_links) LOOP
  IF jsonb_typeof(x)<>'object' OR NOT x ?& ARRAY['kind','id','version_id'] OR
   EXISTS(SELECT 1 FROM jsonb_object_keys(x) k WHERE k NOT IN('kind','id','version_id')) OR
   x->>'kind' NOT IN('course','group','document') OR x->>'kind' IS NULL THEN
   RAISE EXCEPTION 'Unsupported review link' USING ERRCODE='22023'; END IF;
  v_id:=public.storage_try_uuid(x->>'id');v_version:=public.storage_try_uuid(x->>'version_id');
  IF v_id IS NULL OR x->>'version_id' IS NOT NULL AND v_version IS NULL THEN RAISE EXCEPTION 'Invalid review link identifier' USING ERRCODE='22023'; END IF;
  IF x->>'kind'='course' THEN
   IF v_version IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.courses WHERE id=v_id AND organization_id=p_org) THEN RAISE EXCEPTION 'Review link inaccessible' USING ERRCODE='42501'; END IF;
  ELSIF x->>'kind'='group' THEN
   IF v_version IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.student_groups WHERE id=v_id AND organization_id=p_org) THEN RAISE EXCEPTION 'Review link inaccessible' USING ERRCODE='42501'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.org_documents WHERE id=v_id AND organization_id=p_org AND deleted_at IS NULL)
    OR v_version IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.org_document_versions WHERE id=v_version AND document_id=v_id AND organization_id=p_org) THEN
    RAISE EXCEPTION 'Review link inaccessible' USING ERRCODE='42501'; END IF;
  END IF;
 END LOOP;
END;$fn$;

CREATE FUNCTION public.get_org_document_workflow(p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.org_documents%ROWTYPE;v public.org_document_versions%ROWTYPE;r public.org_document_reviews%ROWTYPE;w jsonb;
 v_write boolean;v_actor boolean;v_live boolean;v_open boolean;v_state text;
BEGIN
 SELECT * INTO d FROM public.org_documents WHERE id=p_document_id;
 IF NOT FOUND OR NOT public.uc_document_action_allowed(d.organization_id,'read',NULL,NULL) THEN
  RAISE EXCEPTION 'Document review access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO v FROM public.org_document_versions WHERE id=d.current_version_id AND document_id=d.id AND organization_id=d.organization_id;
 SELECT * INTO r FROM public.org_document_reviews WHERE document_id=d.id AND version_id=d.current_version_id;
 w:=public.uc_org_document_review_snapshot(r.id);v_state:=public.uc_org_document_review_file_state(d);
 IF v_state IN('active','expiring') AND NOT public.uc_org_document_review_file_bound(d) THEN v_state:='unconfirmed'; END IF;
 v_write:=public.uc_document_action_allowed(d.organization_id,'write',NULL,NULL);
 v_actor:=v_write AND public.uc_org_document_review_actor(d.organization_id,auth.uid());
 v_live:=v_state IN('active','expiring') AND v.id IS NOT NULL AND nullif(v.file_url,'') IS NOT NULL;
 v_open:=r.state IN('draft','in_review','changes_requested');
 RETURN jsonb_build_object('document',jsonb_build_object('id',d.id,'organization_id',d.organization_id,'document_revision',d.document_revision,
  'current_version_id',d.current_version_id,'file_state',v_state,'file_url',d.file_url,'file_path',v.file_path,'file_name',v.file_name),
  'workflow',w,'cycles',coalesce((SELECT jsonb_agg(public.uc_org_document_review_snapshot(id) ORDER BY created_at DESC,id)
    FROM public.org_document_reviews WHERE document_id=d.id),'[]'::jsonb),'revision',coalesce(r.revision,0),
  'capabilities',jsonb_build_object(
   'can_configure',v_write AND v_live AND (r.id IS NULL OR r.state IN('draft','changes_requested')),
   'can_submit',coalesce(v_actor AND v_live AND auth.uid()=r.responsible_user_id AND r.state IN('draft','changes_requested') AND NOT (w->>'requires_new_version')::boolean,false),
   'can_comment',coalesce(v_actor AND v_live AND auth.uid() IN(r.responsible_user_id,r.reviewer_user_id) AND r.state IN('in_review','changes_requested'),false),
   'can_request_changes',coalesce(v_actor AND v_live AND auth.uid()=r.reviewer_user_id AND r.state='in_review',false),
   'can_decide',coalesce(v_actor AND v_live AND auth.uid()=r.reviewer_user_id AND r.state IN('in_review','changes_requested'),false),
   'can_cancel',coalesce(v_actor AND v_live AND v_open AND (auth.uid() IN(r.responsible_user_id,r.reviewer_user_id) OR public.is_org_owner(auth.uid(),d.organization_id)),false)));
END;$fn$;
CREATE FUNCTION public.list_org_document_review_candidates(p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.org_documents%ROWTYPE;
BEGIN
 SELECT * INTO d FROM public.org_documents WHERE id=p_document_id;
 IF NOT FOUND OR NOT public.uc_document_action_allowed(d.organization_id,'write',NULL,NULL) THEN
  RAISE EXCEPTION 'Document review configuration denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'actors',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',a.user_id,'staff_id',s.id,
  'display_name',coalesce(nullif(s.display_name,''),nullif(p.full_name,''),'Сотрудник'),'kind',CASE WHEN public.is_org_owner(a.user_id,d.organization_id) THEN 'owner' ELSE 'staff' END) ORDER BY a.user_id)
  FROM (SELECT user_id FROM public.profiles WHERE organization_id=d.organization_id UNION SELECT user_id FROM public.org_staff WHERE organization_id=d.organization_id) a
  LEFT JOIN public.profiles p ON p.user_id=a.user_id LEFT JOIN public.org_staff s ON s.user_id=a.user_id AND s.organization_id=d.organization_id
  WHERE public.uc_org_document_review_actor(d.organization_id,a.user_id)),'[]'::jsonb),
 'courses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',coalesce(title,'')) ORDER BY id) FROM public.courses WHERE organization_id=d.organization_id),'[]'::jsonb),
 'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',coalesce(name,''),'course_id',course_id) ORDER BY id) FROM public.student_groups WHERE organization_id=d.organization_id),'[]'::jsonb),
 'related_documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',coalesce(name,''),'current_version_id',current_version_id) ORDER BY id)
  FROM public.org_documents WHERE organization_id=d.organization_id AND deleted_at IS NULL AND id<>d.id),'[]'::jsonb));
END;$fn$;

-- Typed public wrappers call this private dispatcher. Lock order matches file
-- operations: request advisory -> document row -> workflow row. No GUC bypass.
CREATE FUNCTION public.uc_mutate_org_document_review(p_operation text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.org_documents%ROWTYPE;r public.org_document_reviews%ROWTYPE;c public.org_document_review_comments%ROWTYPE;
 q public.org_document_review_requests%ROWTYPE;v_request uuid;v_doc uuid;v_review uuid;v_actor uuid:=auth.uid();
 v_payload jsonb;v_receipt jsonb;v_note text;v_action text;v_expected bigint;v_version uuid;v_name text;v_role text;v_comment uuid;v_anchor jsonb;
BEGIN
 v_request:=(p_body->>'request_id')::uuid;
 IF v_actor IS NULL OR v_request IS NULL OR NOT public.account_deletion_access_allowed() OR p_operation NOT IN('save','transition','comment','resolve') THEN
  RAISE EXCEPTION 'Authenticated review request required' USING ERRCODE='42501'; END IF;
 v_payload:=jsonb_build_object('operation',p_operation,'body',p_body);
 PERFORM pg_advisory_xact_lock(hashtextextended('uc-internal-review:'||v_request::text,0));
 IF p_operation='save' THEN v_doc:=(p_body->>'document_id')::uuid;
 ELSE
  IF p_operation='resolve' THEN
   SELECT * INTO c FROM public.org_document_review_comments WHERE id=(p_body->>'comment_id')::uuid;v_review:=c.review_id;
  ELSE v_review:=(p_body->>'review_id')::uuid; END IF;
  SELECT document_id INTO v_doc FROM public.org_document_reviews WHERE id=v_review;
 END IF;
 SELECT * INTO d FROM public.org_documents WHERE id=v_doc FOR UPDATE;
 IF NOT FOUND OR NOT public.uc_document_action_allowed(d.organization_id,'write',NULL,NULL) THEN
  RAISE EXCEPTION 'Document review write denied' USING ERRCODE='42501'; END IF;
 IF p_operation='save' THEN SELECT * INTO r FROM public.org_document_reviews WHERE document_id=d.id AND version_id=(p_body->>'version_id')::uuid FOR UPDATE;
 ELSE SELECT * INTO r FROM public.org_document_reviews WHERE id=v_review AND document_id=d.id FOR UPDATE; END IF;
 IF p_operation<>'save' AND (r.id IS NULL OR NOT public.uc_org_document_review_actor(d.organization_id,v_actor)
   OR NOT(v_actor IN(r.responsible_user_id,r.reviewer_user_id) OR p_operation='transition' AND p_body->>'action'='cancel' AND public.is_org_owner(v_actor,d.organization_id))) THEN
  RAISE EXCEPTION 'Assigned active review actor required' USING ERRCODE='42501'; END IF;
 IF p_operation='resolve' AND v_actor IS DISTINCT FROM r.reviewer_user_id THEN RAISE EXCEPTION 'Assigned reviewer required' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM public.org_document_review_requests WHERE request_id=v_request;
 IF FOUND THEN
  IF q.actor_id IS DISTINCT FROM v_actor OR q.document_id IS DISTINCT FROM d.id OR q.payload IS DISTINCT FROM v_payload THEN
   RAISE EXCEPTION 'Review request UUID already used for another request' USING ERRCODE='22023'; END IF;
  RETURN q.receipt;
 END IF;
 IF public.uc_org_document_review_file_state(d) NOT IN('active','expiring') OR NOT public.uc_org_document_review_file_bound(d) THEN
  RAISE EXCEPTION 'Active exact file version required' USING ERRCODE='55000'; END IF;
 v_expected:=(p_body->>'expected_workflow_revision')::bigint;
 IF v_expected IS NULL OR v_expected<0 OR v_expected<>coalesce(r.revision,0) THEN
  RAISE EXCEPTION 'Review changed; reload current workflow' USING ERRCODE='40001'; END IF;
 IF p_operation IN('save','transition') AND (p_body->>'expected_document_revision')::bigint IS DISTINCT FROM d.document_revision THEN
  RAISE EXCEPTION 'Document changed; reload current version' USING ERRCODE='40001'; END IF;
 v_version:=CASE WHEN p_operation='save' THEN (p_body->>'version_id')::uuid ELSE r.version_id END;
 IF v_version IS DISTINCT FROM d.current_version_id OR p_operation='comment' AND (p_body->>'version_id')::uuid IS DISTINCT FROM r.version_id THEN
  RAISE EXCEPTION 'Document version changed; start a new review cycle' USING ERRCODE='40001'; END IF;
 IF r.state IN('approved','cancelled') THEN RAISE EXCEPTION 'Internal review cycle is closed' USING ERRCODE='55000'; END IF;
 IF p_operation='save' THEN
  IF r.id IS NOT NULL AND r.state NOT IN('draft','changes_requested') THEN RAISE EXCEPTION 'Review configuration is locked' USING ERRCODE='55000'; END IF;
  IF NOT public.uc_org_document_review_actor(d.organization_id,(p_body->>'responsible_user_id')::uuid)
    OR NOT public.uc_org_document_review_actor(d.organization_id,(p_body->>'reviewer_user_id')::uuid) THEN
   RAISE EXCEPTION 'Assignee must be an active organization-wide writer' USING ERRCODE='42501'; END IF;
  PERFORM public.uc_validate_org_document_review_links(d.organization_id,p_body->'links');
  IF r.id IS NULL THEN
   INSERT INTO public.org_document_reviews(organization_id,document_id,version_id,revision,state,responsible_user_id,reviewer_user_id,responsible_name,reviewer_name,links)
   VALUES(d.organization_id,d.id,d.current_version_id,1,'draft',(p_body->>'responsible_user_id')::uuid,(p_body->>'reviewer_user_id')::uuid,
    public.uc_org_document_review_actor_name(d.organization_id,(p_body->>'responsible_user_id')::uuid),
    public.uc_org_document_review_actor_name(d.organization_id,(p_body->>'reviewer_user_id')::uuid),p_body->'links') RETURNING * INTO r;
  ELSE UPDATE public.org_document_reviews SET responsible_user_id=(p_body->>'responsible_user_id')::uuid,reviewer_user_id=(p_body->>'reviewer_user_id')::uuid,
   responsible_name=public.uc_org_document_review_actor_name(d.organization_id,(p_body->>'responsible_user_id')::uuid),
   reviewer_name=public.uc_org_document_review_actor_name(d.organization_id,(p_body->>'reviewer_user_id')::uuid),
   links=p_body->'links',revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r; END IF;
  v_action:='configure';
 ELSIF p_operation='transition' THEN
  v_action:=p_body->>'action';v_note:=p_body->>'note';
  IF v_note IS NOT NULL AND length(v_note)>4000 OR v_action IS NULL OR v_action NOT IN('submit','request_changes','approve','cancel') THEN
   RAISE EXCEPTION 'Invalid review transition' USING ERRCODE='22023'; END IF;
  IF v_action<>'approve' AND (p_body->>'approval_number' IS NOT NULL OR p_body->>'approval_date' IS NOT NULL) THEN
   RAISE EXCEPTION 'Approval metadata only belongs to approval' USING ERRCODE='22023'; END IF;
  IF v_action='submit' THEN
   IF v_actor IS DISTINCT FROM r.responsible_user_id OR r.state NOT IN('draft','changes_requested') THEN RAISE EXCEPTION 'Assigned responsible actor required' USING ERRCODE='42501'; END IF;
   IF NOT public.uc_org_document_review_actor(d.organization_id,r.reviewer_user_id) THEN RAISE EXCEPTION 'Reviewer access changed; reconfigure' USING ERRCODE='42501'; END IF;
   PERFORM public.uc_validate_org_document_review_links(d.organization_id,r.links);
   IF EXISTS(SELECT 1 FROM public.org_document_review_comments WHERE review_id=r.id AND resolution_status='accepted' AND position_anchor->>'kind' IN('insert','delete','replace')) THEN
    RAISE EXCEPTION 'Accepted content changes require a new file version and review cycle' USING ERRCODE='55000'; END IF;
   UPDATE public.org_document_reviews SET state='in_review',revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  ELSIF v_action='request_changes' THEN
   IF v_actor IS DISTINCT FROM r.reviewer_user_id OR r.state<>'in_review' THEN RAISE EXCEPTION 'Assigned reviewer in active review required' USING ERRCODE='42501'; END IF;
   UPDATE public.org_document_reviews SET state='changes_requested',revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  ELSIF v_action='approve' THEN
   IF v_actor IS DISTINCT FROM r.reviewer_user_id OR r.state<>'in_review' THEN RAISE EXCEPTION 'Assigned reviewer in active review required' USING ERRCODE='42501'; END IF;
   IF NOT public.uc_org_document_review_actor(d.organization_id,r.responsible_user_id) THEN RAISE EXCEPTION 'Responsible actor access changed; reconfigure' USING ERRCODE='42501'; END IF;
   PERFORM public.uc_validate_org_document_review_links(d.organization_id,r.links);
   IF EXISTS(SELECT 1 FROM public.org_document_review_comments WHERE review_id=r.id AND
    (resolution_status='unresolved' OR resolution_status='accepted' AND position_anchor->>'kind' IN('insert','delete','replace'))) THEN
    RAISE EXCEPTION 'Resolve comments; accepted content changes require a new file version' USING ERRCODE='55000'; END IF;
   IF p_body->>'approval_number' IS NULL OR p_body->>'approval_number' !~ '[^[:space:]]' OR length(p_body->>'approval_number')>200
    OR p_body->>'approval_date' IS NULL THEN RAISE EXCEPTION 'Explicit internal approval number and date required' USING ERRCODE='22023'; END IF;
   UPDATE public.org_document_reviews SET state='approved',approval_number=p_body->>'approval_number',approval_date=(p_body->>'approval_date')::date,
    approved_at=clock_timestamp(),approved_by=v_actor,revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  ELSE
   UPDATE public.org_document_reviews SET state='cancelled',revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  END IF;
 ELSE
  IF r.state NOT IN('in_review','changes_requested') THEN RAISE EXCEPTION 'Comments require an active internal review' USING ERRCODE='55000'; END IF;
  IF p_operation='comment' THEN
   IF p_body->>'text' IS NULL OR p_body->>'text' !~ '[^[:space:]]' OR length(p_body->>'text')>4000 OR length(p_body->>'quote')>8000 THEN
    RAISE EXCEPTION 'Invalid review comment text' USING ERRCODE='22023'; END IF;
   v_anchor:=nullif(p_body->'anchor','null'::jsonb);
   IF v_anchor IS NOT NULL AND (jsonb_typeof(v_anchor)<>'object' OR octet_length(v_anchor::text)>16000 OR
    coalesce(v_anchor->>'kind','comment') NOT IN('comment','insert','delete','replace')) THEN
    RAISE EXCEPTION 'Invalid review anchor' USING ERRCODE='22023'; END IF;
   SELECT coalesce(nullif(p.full_name,''),nullif(s.display_name,''),'Сотрудник') INTO v_name FROM (SELECT v_actor user_id) x
    LEFT JOIN public.profiles p ON p.user_id=x.user_id LEFT JOIN public.org_staff s ON s.user_id=x.user_id AND s.organization_id=d.organization_id;
   v_role:=CASE WHEN v_actor=r.reviewer_user_id THEN 'reviewer' ELSE 'responsible' END;
   INSERT INTO public.org_document_review_comments(organization_id,review_id,version_id,author_user_id,author_name,author_role,comment_text,quoted_text,position_anchor)
   VALUES(d.organization_id,r.id,r.version_id,v_actor,coalesce(v_name,'Сотрудник'),v_role,p_body->>'text',p_body->>'quote',v_anchor) RETURNING id INTO v_comment;
   v_action:='comment';
  ELSE
   IF p_body->>'resolution' IS NULL OR p_body->>'resolution' NOT IN('accepted','declined') OR length(p_body->>'reply')>4000 THEN
    RAISE EXCEPTION 'Invalid comment resolution' USING ERRCODE='22023'; END IF;
   SELECT * INTO c FROM public.org_document_review_comments WHERE id=(p_body->>'comment_id')::uuid AND review_id=r.id FOR UPDATE;
   IF NOT FOUND OR c.resolution_status<>'unresolved' THEN RAISE EXCEPTION 'Comment already resolved; reload review' USING ERRCODE='40001'; END IF;
   UPDATE public.org_document_review_comments SET resolution_status=p_body->>'resolution',org_reply=p_body->>'reply',resolved_by=v_actor,resolved_at=clock_timestamp() WHERE id=c.id;
   v_action:='resolve_comment';v_note:=p_body->>'reply';
  END IF;
  UPDATE public.org_document_reviews SET revision=revision+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
 END IF;
 INSERT INTO public.org_document_review_events(organization_id,review_id,revision,actor_id,action,note,snapshot)
 VALUES(d.organization_id,r.id,r.revision,v_actor,v_action,v_note,to_jsonb(r));
 v_receipt:=public.uc_org_document_review_snapshot(r.id);
 INSERT INTO public.org_document_review_requests(request_id,organization_id,document_id,review_id,actor_id,payload,receipt)
 VALUES(v_request,d.organization_id,d.id,r.id,v_actor,v_payload,v_receipt);
 RETURN v_receipt;
END;$fn$;
CREATE FUNCTION public.save_org_document_review_draft(p_document_id uuid,p_version_id uuid,p_expected_document_revision bigint,p_expected_workflow_revision bigint,
 p_responsible_user_id uuid,p_reviewer_user_id uuid,p_links jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_org_document_review('save',jsonb_build_object('document_id',p_document_id,'version_id',p_version_id,
 'expected_document_revision',p_expected_document_revision,'expected_workflow_revision',p_expected_workflow_revision,'responsible_user_id',p_responsible_user_id,
 'reviewer_user_id',p_reviewer_user_id,'links',p_links,'request_id',p_request_id))
$fn$;
CREATE FUNCTION public.transition_org_document_review(p_review_id uuid,p_expected_workflow_revision bigint,p_expected_document_revision bigint,p_action text,
 p_note text,p_approval_number text,p_approval_date date,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_org_document_review('transition',jsonb_build_object('review_id',p_review_id,'expected_workflow_revision',p_expected_workflow_revision,
 'expected_document_revision',p_expected_document_revision,'action',p_action,'note',p_note,'approval_number',p_approval_number,'approval_date',p_approval_date,'request_id',p_request_id))
$fn$;
CREATE FUNCTION public.add_org_document_review_comment(p_review_id uuid,p_version_id uuid,p_expected_workflow_revision bigint,p_text text,p_quote text,p_anchor jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_org_document_review('comment',jsonb_build_object('review_id',p_review_id,'version_id',p_version_id,'expected_workflow_revision',p_expected_workflow_revision,
 'text',p_text,'quote',p_quote,'anchor',p_anchor,'request_id',p_request_id))
$fn$;
CREATE FUNCTION public.resolve_org_document_review_comment(p_comment_id uuid,p_expected_workflow_revision bigint,p_resolution text,p_reply text,p_request_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_mutate_org_document_review('resolve',jsonb_build_object('comment_id',p_comment_id,'expected_workflow_revision',p_expected_workflow_revision,
 'resolution',p_resolution,'reply',p_reply,'request_id',p_request_id))
$fn$;
REVOKE ALL ON FUNCTION public.uc_org_document_review_actor(uuid,uuid),public.uc_org_document_review_file_state(public.org_documents),
 public.uc_org_document_review_actor_name(uuid,uuid),public.uc_org_document_review_file_bound(public.org_documents),
 public.uc_org_document_review_snapshot(uuid),public.uc_guard_org_document_review_history(),public.uc_guard_org_document_review_record(),
 public.uc_validate_org_document_review_links(uuid,jsonb),public.uc_mutate_org_document_review(text,jsonb),
 public.get_org_document_workflow(uuid),public.list_org_document_review_candidates(uuid),
 public.save_org_document_review_draft(uuid,uuid,bigint,bigint,uuid,uuid,jsonb,uuid),
 public.transition_org_document_review(uuid,bigint,bigint,text,text,text,date,uuid),
 public.add_org_document_review_comment(uuid,uuid,bigint,text,text,jsonb,uuid),
 public.resolve_org_document_review_comment(uuid,bigint,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_org_document_workflow(uuid),public.list_org_document_review_candidates(uuid),
 public.save_org_document_review_draft(uuid,uuid,bigint,bigint,uuid,uuid,jsonb,uuid),
 public.transition_org_document_review(uuid,bigint,bigint,text,text,text,date,uuid),
 public.add_org_document_review_comment(uuid,uuid,bigint,text,text,jsonb,uuid),
 public.resolve_org_document_review_comment(uuid,bigint,text,text,uuid) TO authenticated;

