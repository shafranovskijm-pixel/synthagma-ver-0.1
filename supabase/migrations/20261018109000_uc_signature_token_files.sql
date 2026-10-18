-- UC-007/009 companion: token previews and exact signature-owned file provenance.
-- No existing business rows, files, signatures, revisions or permission JSON are rewritten.
DO $preflight$
BEGIN
 IF to_regprocedure('public.uc_signature_file_context(text,text,uuid)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM (VALUES
  ('public.uc_signature_token_access_allowed(uuid,boolean)','d53d282e50b51ab83682444301fe6fed'),
  ('public.uc_document_storage_scope(text,text)','22fe1f060a238b9f871c280b1416dcf9'),
  ('public.uc_signature_storage_read(text,text)','a28e130e506297b006d9c6a24d5b6379'),
  ('public.uc_signature_storage_write(text,text)','946e9cc620dadad5eafa02f0e04106a2'),
  ('public.uc_guard_signature_revision()','13d7a54f91c28c26db9628543b8fea9f'),
  ('public.uc_guard_signature_integrity()','fdd8e690f722d046c7782c64e48f6949'),
  ('public.create_external_contract_signature(text,text,text,text,text,text,text,uuid)','3527f470623efd2f043eedf9cbfe4700'),
  ('public.add_signature_revision(uuid,text,text,text,text,text)','1781b4727399ddaabce71b145984a071')
 ) expected(signature,hash) WHERE to_regprocedure(signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>hash)
 OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='storage' AND table_name='objects' AND column_name='owner_id' AND data_type='text')
 THEN RAISE EXCEPTION 'Signature files: unreviewed provenance baseline'; END IF;
END;$preflight$;

CREATE TABLE public.uc_signature_file_requests(
 request_id uuid PRIMARY KEY,request_kind text NOT NULL CHECK(request_kind IN('create','revision')),
 signature_id uuid NOT NULL,actor_id uuid NOT NULL,request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 revision_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.uc_signature_file_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uc_signature_file_requests FROM PUBLIC,anon,authenticated,service_role;

-- Parse a locator only; never fetch its URL. The Edge additionally requires the exact project origin.
-- New writes use raw keys. Percent-encoded/ambiguous path aliases are intentionally not accepted.
CREATE FUNCTION public.uc_signature_locator_key(p_locator text,p_bucket text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE v text; m text[];
BEGIN
 IF p_bucket NOT IN('external-contracts','signed-documents') OR p_locator IS NULL OR length(p_locator)>4000 THEN RETURN NULL; END IF;
 v:=p_locator;
 IF v ~* '^https://' THEN
  m:=regexp_match(v,'^https://[^/@?#[:space:]]+/storage/v1/object/(public|sign|authenticated)/'||p_bucket||'/([^?#]+)([?][^#]*)?$','i');
  IF m IS NULL THEN RETURN NULL; END IF; v:=m[2];
 END IF;
 IF v='' OR v ~ '[%?#\\[:cntrl:]]' OR v ~ '(^|/)([.]|[.][.]|)(/|$)' OR left(v,1)='/' THEN RETURN NULL; END IF;
 RETURN v;
END;$fn$;

CREATE FUNCTION public.uc_signature_canonical_file(p_org uuid,p_signature uuid,p_path text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(p_path ~ ('^'||p_org::text||'/signature-files/'||p_signature::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][a-z0-9]{1,10}$'),false)
$fn$;
CREATE FUNCTION public.uc_signature_object_uploader(p_bucket text,p_path text,p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_user IS NOT NULL AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path
  AND (o.owner=p_user OR o.owner_id=p_user::text)
  AND (o.owner IS NULL OR o.owner=p_user)
  AND (nullif(o.owner_id,'') IS NULL OR o.owner_id=p_user::text))
$fn$;
CREATE FUNCTION public.uc_signature_object_bound(p_signature uuid,p_bucket text,p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature AND s.deleted_at IS NULL AND (
  p_bucket='external-contracts' AND public.uc_signature_canonical_file(s.organization_id,s.id,p_path) AND (
   EXISTS(SELECT 1 FROM public.signature_revisions r WHERE r.signature_id=s.id
     AND public.uc_signature_locator_key(r.file_url,p_bucket)=p_path
     AND public.uc_signature_object_uploader(p_bucket,p_path,r.created_by))
   OR public.uc_signature_locator_key(s.document_snapshot_url,p_bucket)=p_path
     AND public.uc_signature_object_uploader(p_bucket,p_path,s.sender_user_id))
  OR p_bucket='external-contracts' AND s.handwritten_scan_path=p_path
   AND p_path ~ ('^'||s.organization_id::text||'/signed-scans/'||s.id::text||'-[a-zA-Z0-9._-]+$')
   AND s.status='signed' AND s.handwritten_scan_hash ~ '^[0-9a-f]{64}$'
   AND public.uc_signature_object_uploader(p_bucket,p_path,s.recipient_user_id)
  OR p_bucket='signed-documents' AND s.signed_document_path=p_path AND s.status='signed'
   AND p_path=s.organization_id::text||'/certificates/'||s.id::text||'.html'
   AND s.certificate_hash ~ '^[0-9a-f]{64}$'
   AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path)))
$fn$;

-- File scope is separate from permissive read/write grants. A mutable reference
-- never turns another signature's object into this group's object.
CREATE FUNCTION public.uc_signature_file_scope(p_bucket text,p_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_org uuid;v_signature uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RETURN false; END IF;
 v_org:=public.storage_try_uuid(split_part(p_path,'/',1));
 IF v_org IS NULL THEN RETURN false; END IF;
 -- Retain authenticated organization-wide access to historical objects. This
 -- cannot be used by the public token broker or by an assigned-group teacher.
 IF public.uc_document_scope_allowed(v_org,NULL,NULL) THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.organization_id=v_org
   AND public.uc_document_signature_read_scope(s.id)
   AND public.uc_signature_object_bound(s.id,p_bucket,p_path)) THEN RETURN true; END IF;
 IF p_bucket='external-contracts' AND split_part(p_path,'/',2)='signature-files' THEN
  v_signature:=public.storage_try_uuid(split_part(p_path,'/',3));
  RETURN EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=v_signature AND s.organization_id=v_org
   AND s.deleted_at IS NULL AND s.expires_at>now() AND s.status IN('draft','sent','viewed','in_review','changes_requested')
   AND public.uc_signature_canonical_file(v_org,s.id,p_path) AND public.uc_signature_actor_allowed(s.id,true,true)
   AND (NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path)
    OR public.uc_signature_object_uploader(p_bucket,p_path,auth.uid())));
 END IF;
 RETURN p_bucket='external-contracts' AND EXISTS(SELECT 1 FROM public.document_signatures s
  WHERE s.organization_id=v_org AND s.recipient_user_id=auth.uid() AND s.deleted_at IS NULL AND s.expires_at>now()
   AND s.status IN('sent','viewed','in_review')
   AND p_path ~ ('^'||v_org::text||'/signed-scans/'||s.id::text||'-[a-zA-Z0-9._-]+$')
   AND (NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path)
    OR public.uc_signature_object_uploader(p_bucket,p_path,auth.uid())));
END;$fn$;

DO $storage_scope$ DECLARE source text;needle text;replacement text;
BEGIN
 source:=pg_get_functiondef('public.uc_document_storage_scope(text,text)'::regprocedure);
 needle:='BEGIN'||chr(10);
 replacement:=replace(source,needle,needle||
  ' IF p_bucket IN(''external-contracts'',''signed-documents'') THEN RETURN public.uc_signature_file_scope(p_bucket,p_name); END IF;'||chr(10));
 IF source=replacement THEN RAISE EXCEPTION 'Unreviewed storage scope entry'; END IF;
 EXECUTE replacement;
END;$storage_scope$;
CREATE OR REPLACE FUNCTION public.uc_signature_storage_read(p_bucket text,p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.account_deletion_access_allowed() AND (
  EXISTS(SELECT 1 FROM public.organizations o WHERE o.id::text=split_part(p_name,'/',1)
   AND public.uc_document_action_allowed(o.id,'read',NULL,NULL))
  OR EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.organization_id::text=split_part(p_name,'/',1)
   AND public.uc_signature_actor_allowed(s.id,false,true) AND public.uc_document_signature_read_scope(s.id)
   AND public.uc_signature_object_bound(s.id,p_bucket,p_name))
  OR p_bucket='external-contracts' AND split_part(p_name,'/',2)='signature-files'
   AND public.uc_signature_object_uploader(p_bucket,p_name,auth.uid()) AND public.uc_signature_file_scope(p_bucket,p_name))
$fn$;
-- Preserve all original referenced-file immutability checks and add only an
-- existing participant's canonical revision staging path.
DO $storage_write$ DECLARE source text;needle text;replacement text;
BEGIN
 source:=pg_get_functiondef('public.uc_signature_storage_write(text,text)'::regprocedure);
 needle:='AND (EXISTS(SELECT 1 FROM public.organizations o';
 replacement:=replace(source,needle,
  'AND ((p_bucket=''external-contracts'' AND EXISTS(SELECT 1 FROM public.document_signatures s WHERE '||
  's.id=public.storage_try_uuid(split_part(p_name,''/'',3)) AND s.deleted_at IS NULL AND s.expires_at>now() '||
  'AND s.status IN(''draft'',''sent'',''viewed'',''in_review'',''changes_requested'') '||
  'AND public.uc_signature_canonical_file(s.organization_id,s.id,p_name) AND public.uc_signature_actor_allowed(s.id,true,true))) '||
  'OR EXISTS(SELECT 1 FROM public.organizations o');
 IF source=replacement THEN RAISE EXCEPTION 'Unreviewed storage write entry'; END IF;
 EXECUTE replacement;
END;$storage_write$;
-- Staged canonical bytes are append-only even before a revision references them.
CREATE POLICY uc_signature_namespace_immutable_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'external-contracts' OR split_part(name,'/',2)<>'signature-files')
 WITH CHECK(bucket_id<>'external-contracts' OR split_part(name,'/',2)<>'signature-files');
CREATE POLICY uc_signature_namespace_immutable_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'external-contracts' OR split_part(name,'/',2)<>'signature-files');
CREATE POLICY uc_signature_namespace_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'external-contracts' OR (
  (owner=auth.uid() OR owner_id=auth.uid()::text)
  AND (owner IS NULL OR owner=auth.uid()) AND (nullif(owner_id,'') IS NULL OR owner_id=auth.uid()::text)
  AND (public.uc_signature_canonical_file(public.storage_try_uuid(split_part(name,'/',1)),public.storage_try_uuid(split_part(name,'/',3)),name)
   OR split_part(name,'/',2)='signed-scans')));

CREATE FUNCTION public.uc_guard_signature_file_provenance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE;v_path text;r public.signature_revisions%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='signature_revisions' THEN
  IF TG_OP='INSERT' AND (auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid())
    AND NOT (auth.role()='service_role' AND nullif(NEW.file_url,'') IS NULL) THEN
   RAISE EXCEPTION 'Revision uploader must be the authenticated actor' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' AND nullif(NEW.file_url,'') IS NOT NULL THEN
   SELECT * INTO s FROM public.document_signatures WHERE id=NEW.signature_id;
   IF NOT FOUND OR NOT public.uc_signature_canonical_file(s.organization_id,s.id,NEW.file_url)
    OR NOT public.uc_signature_object_uploader('external-contracts',NEW.file_url,NEW.created_by) THEN
    RAISE EXCEPTION 'Revision file provenance is not verified' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='INSERT' AND NEW.handwritten_scan_path IS NOT NULL THEN
  RAISE EXCEPTION 'Use atomic signature finalization' USING ERRCODE='42501'; END IF;
 IF nullif(NEW.document_snapshot_url,'') IS NOT NULL AND
  (TG_OP='INSERT' OR NEW.document_snapshot_url IS DISTINCT FROM OLD.document_snapshot_url) THEN
  IF NOT public.uc_signature_canonical_file(NEW.organization_id,NEW.id,NEW.document_snapshot_url)
   OR NOT public.uc_signature_object_uploader('external-contracts',NEW.document_snapshot_url,NEW.sender_user_id) THEN
   RAISE EXCEPTION 'Snapshot file provenance is not verified' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id AND NEW.current_revision_id IS NOT NULL THEN
  SELECT * INTO r FROM public.signature_revisions WHERE id=NEW.current_revision_id AND signature_id=NEW.id;
  IF NOT FOUND OR nullif(r.file_url,'') IS NOT NULL AND
   (NOT public.uc_signature_canonical_file(NEW.organization_id,NEW.id,public.uc_signature_locator_key(r.file_url,'external-contracts'))
    OR NOT public.uc_signature_object_uploader('external-contracts',public.uc_signature_locator_key(r.file_url,'external-contracts'),r.created_by)) THEN
   RAISE EXCEPTION 'Current revision file provenance is not verified' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.signed_source_path IS DISTINCT FROM OLD.signed_source_path AND NEW.signed_source_path IS NOT NULL THEN
  SELECT * INTO r FROM public.signature_revisions WHERE id=NEW.signed_revision_id AND signature_id=NEW.id;
  IF NOT FOUND OR NEW.signed_source_bucket<>'external-contracts'
   OR public.uc_signature_locator_key(r.file_url,'external-contracts') IS DISTINCT FROM NEW.signed_source_path
   OR NOT public.uc_signature_canonical_file(NEW.organization_id,NEW.id,NEW.signed_source_path)
   OR NOT public.uc_signature_object_uploader('external-contracts',NEW.signed_source_path,r.created_by) THEN
   RAISE EXCEPTION 'Signed source provenance is not verified' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.handwritten_scan_path IS DISTINCT FROM OLD.handwritten_scan_path AND NEW.handwritten_scan_path IS NOT NULL THEN
  IF NEW.handwritten_scan_path !~ ('^'||NEW.organization_id::text||'/signed-scans/'||NEW.id::text||'-[a-zA-Z0-9._-]+$')
   OR NOT public.uc_signature_object_uploader('external-contracts',NEW.handwritten_scan_path,NEW.recipient_user_id) THEN
   RAISE EXCEPTION 'Signed scan provenance is not verified' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_signature_file_provenance BEFORE INSERT OR UPDATE ON public.document_signatures
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_signature_file_provenance();
CREATE TRIGGER uc_revision_file_provenance BEFORE INSERT OR UPDATE ON public.signature_revisions
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_signature_file_provenance();

-- A UUID is generated before upload. Lost-response retries reuse it and the
-- exact original request; they never create a second invitation or revision.
CREATE FUNCTION public.create_external_contract_signature_v2(
 p_signature_id uuid,p_file_url text,p_file_name text,p_file_mime text,p_document_title text,p_admin_email text,
 p_admin_name text DEFAULT 'Администратор Синтагма',p_summary text DEFAULT NULL,p_organization_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_org uuid:=p_organization_id;v_actor uuid:=auth.uid();v_name text;v_revision uuid;s public.document_signatures%ROWTYPE;
 q public.uc_signature_file_requests%ROWTYPE;v_request_hash text;
BEGIN
 IF v_actor IS NULL OR NOT public.account_deletion_access_allowed() OR p_signature_id IS NULL OR v_org IS NULL
  OR NOT(public.uc_document_action_allowed(v_org,'write',NULL,NULL) OR public.uc_document_commercial_creation_allowed(v_org)) THEN
  RAISE EXCEPTION 'Organization document write access required' USING ERRCODE='42501'; END IF;
 IF NOT public.uc_signature_canonical_file(v_org,p_signature_id,p_file_url)
  OR nullif(btrim(p_file_name),'') IS NULL OR length(p_file_name)>500
  OR nullif(btrim(p_document_title),'') IS NULL OR length(p_document_title)>2000
  OR nullif(btrim(p_admin_email),'') IS NULL OR length(p_admin_email)>320
  OR NOT public.uc_signature_object_uploader('external-contracts',p_file_url,v_actor) THEN
  RAISE EXCEPTION 'Uploaded file binding is not verified' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('uc-external-signature:'||p_signature_id::text,0));
 IF NOT(public.uc_document_action_allowed(v_org,'write',NULL,NULL) OR public.uc_document_commercial_creation_allowed(v_org)) THEN
  RAISE EXCEPTION 'Organization document write access required' USING ERRCODE='42501'; END IF;
 v_request_hash:=encode(sha256(convert_to(jsonb_build_array(p_signature_id,p_file_url,p_file_name,p_file_mime,
  p_document_title,p_admin_email,p_admin_name,p_summary,p_organization_id)::text,'UTF8')),'hex');
 SELECT * INTO q FROM public.uc_signature_file_requests WHERE request_id=p_signature_id;
 IF FOUND THEN
  IF (q.request_kind,q.signature_id,q.actor_id,q.request_hash) IS DISTINCT FROM ('create',p_signature_id,v_actor,v_request_hash)
   OR NOT EXISTS(SELECT 1 FROM public.document_signatures WHERE id=q.signature_id AND deleted_at IS NULL AND organization_id=v_org AND sender_user_id=v_actor) THEN
   RAISE EXCEPTION 'Signature request UUID already used for a different request' USING ERRCODE='22023'; END IF;
  RETURN q.signature_id;
 END IF;
 SELECT * INTO s FROM public.document_signatures WHERE id=p_signature_id FOR UPDATE;
 IF FOUND THEN
  RAISE EXCEPTION 'Signature UUID is already occupied without this upload receipt' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(full_name,email,'Организация') INTO v_name FROM public.profiles WHERE user_id=v_actor LIMIT 1;
 IF v_name IS NULL THEN SELECT coalesce(display_name,'Организация') INTO v_name FROM public.org_staff WHERE user_id=v_actor AND organization_id=v_org LIMIT 1; END IF;
 INSERT INTO public.document_signatures(id,organization_id,sender_user_id,sender_name,document_type,document_title,
  recipient_type,recipient_email,recipient_name,status,mode,requires_bilateral)
 VALUES(p_signature_id,v_org,v_actor,coalesce(v_name,'Организация'),'external_upload',p_document_title,
  'admin_sintagma',p_admin_email,p_admin_name,'in_review','review',true);
 INSERT INTO public.signature_revisions(signature_id,version,document_html,file_url,file_name,file_mime,created_by,created_by_name,change_summary)
 VALUES(p_signature_id,1,NULL,p_file_url,p_file_name,p_file_mime,v_actor,coalesce(v_name,'Организация'),coalesce(p_summary,'Первоначальная версия'))
 RETURNING id INTO v_revision;
 UPDATE public.document_signatures SET current_revision_id=v_revision WHERE id=p_signature_id;
 INSERT INTO public.uc_signature_file_requests(request_id,request_kind,signature_id,actor_id,request_hash,revision_id)
 VALUES(p_signature_id,'create',p_signature_id,v_actor,v_request_hash,v_revision);
 RETURN p_signature_id;
END;$fn$;

-- Serialize revision version allocation under the same parent row lock used by
-- immutable guards. Keep the original participant, notification and response API.
DO $revision_lock$ DECLARE source text;needle text;replacement text;
BEGIN
 source:=pg_get_functiondef('public.add_signature_revision(uuid,text,text,text,text,text)'::regprocedure);
 needle:='SELECT * INTO v_sig FROM document_signatures WHERE id = p_signature_id;';
 replacement:=replace(source,needle,'SELECT * INTO v_sig FROM document_signatures WHERE id = p_signature_id FOR UPDATE;');
 IF source=replacement THEN RAISE EXCEPTION 'Unreviewed revision allocation'; END IF;
 EXECUTE replacement;
END;$revision_lock$;

CREATE FUNCTION public.add_signature_revision_v2(p_revision_id uuid,p_signature_id uuid,p_expected_revision_id uuid,
 p_file_url text DEFAULT NULL,p_file_name text DEFAULT NULL,p_file_mime text DEFAULT NULL,
 p_document_html text DEFAULT NULL,p_change_summary text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE;v_actor uuid:=auth.uid();v_name text;v_next integer;
 q public.uc_signature_file_requests%ROWTYPE;v_request_hash text;
BEGIN
 IF v_actor IS NULL OR NOT public.account_deletion_access_allowed() OR p_revision_id IS NULL THEN
  RAISE EXCEPTION 'Authenticated revision actor required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.document_signatures WHERE id=p_signature_id FOR UPDATE;
 IF NOT FOUND OR NOT public.uc_signature_actor_allowed(s.id,true,true) THEN
  RAISE EXCEPTION 'Revision permission denied' USING ERRCODE='42501'; END IF;
 v_request_hash:=encode(sha256(convert_to(jsonb_build_array(p_revision_id,p_signature_id,p_expected_revision_id,
  p_file_url,p_file_name,p_file_mime,p_document_html,p_change_summary)::text,'UTF8')),'hex');
 SELECT * INTO q FROM public.uc_signature_file_requests WHERE request_id=p_revision_id;
 IF FOUND THEN
  IF (q.request_kind,q.signature_id,q.actor_id,q.request_hash) IS DISTINCT FROM ('revision',p_signature_id,v_actor,v_request_hash) THEN
   RAISE EXCEPTION 'Revision request UUID already used for a different request' USING ERRCODE='22023'; END IF;
  RETURN q.revision_id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.signature_revisions WHERE id=p_revision_id) THEN
  RAISE EXCEPTION 'Revision UUID is already occupied without this upload receipt' USING ERRCODE='22023'; END IF;
 IF s.current_revision_id IS DISTINCT FROM p_expected_revision_id THEN
  RAISE EXCEPTION 'Document revision changed; reload before editing' USING ERRCODE='40001'; END IF;
 IF s.deleted_at IS NOT NULL OR s.status NOT IN('draft','sent','viewed','in_review','changes_requested') OR s.expires_at<=now() THEN
  RAISE EXCEPTION 'Signature revision is closed' USING ERRCODE='55000'; END IF;
 SELECT coalesce(full_name,email,'Пользователь') INTO v_name FROM public.profiles WHERE user_id=v_actor LIMIT 1;
 SELECT coalesce(max(version),0)+1 INTO v_next FROM public.signature_revisions WHERE signature_id=s.id;
 INSERT INTO public.signature_revisions(id,signature_id,version,document_html,file_url,file_name,file_mime,created_by,created_by_name,change_summary)
 VALUES(p_revision_id,s.id,v_next,p_document_html,p_file_url,p_file_name,p_file_mime,v_actor,coalesce(v_name,'Пользователь'),p_change_summary);
 UPDATE public.document_signatures SET current_revision_id=p_revision_id,status='in_review',updated_at=now() WHERE id=s.id;
 IF v_actor<>s.sender_user_id THEN
  INSERT INTO public.org_notifications(organization_id,user_id,type,title,message,related_id)
  VALUES(s.organization_id,s.sender_user_id,'signature','Новая версия документа от '||coalesce(v_name,'Пользователь'),
   s.document_title||coalesce(' — '||p_change_summary,''),s.id);
 END IF;
 INSERT INTO public.uc_signature_file_requests(request_id,request_kind,signature_id,actor_id,request_hash,revision_id)
 VALUES(p_revision_id,'revision',p_signature_id,v_actor,v_request_hash,p_revision_id);
 RETURN p_revision_id;
END;$fn$;

CREATE FUNCTION public.uc_signature_file_context(p_token text,p_kind text DEFAULT 'revision',p_revision_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE;r public.signature_revisions%ROWTYPE;
 v_bucket text:='external-contracts';v_locator text;v_path text;v_hash text;v_revision uuid;v_name text;v_mime text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service context required' USING ERRCODE='42501'; END IF;
 IF p_token IS NULL OR length(p_token) NOT BETWEEN 16 AND 200 OR p_token ~ '[[:space:]]' OR p_kind IS NULL
  OR p_kind NOT IN('revision','source','scan','certificate') OR p_kind<>'revision' AND p_revision_id IS NOT NULL THEN
  RAISE EXCEPTION 'Invalid file selector' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.document_signatures WHERE signature_token=p_token;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document not found' USING ERRCODE='P0002'; END IF;
 IF NOT public.uc_signature_token_access_allowed(s.id,false) THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='55000'; END IF;
 IF p_kind IN('revision','source') THEN
  v_revision:=CASE WHEN p_kind='revision' THEN coalesce(p_revision_id,s.current_revision_id)
   WHEN s.status='signed' THEN coalesce(s.signed_revision_id,s.current_revision_id) ELSE s.current_revision_id END;
  IF v_revision IS NOT NULL THEN
   SELECT * INTO r FROM public.signature_revisions WHERE id=v_revision AND signature_id=s.id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found' USING ERRCODE='P0002'; END IF;
   v_locator:=r.file_url;v_name:=r.file_name;v_mime:=r.file_mime;
  END IF;
  IF p_kind='source' AND s.status='signed' AND s.signed_source_path IS NOT NULL THEN
   v_bucket:=s.signed_source_bucket;v_locator:=s.signed_source_path;v_hash:=s.signed_source_hash;
  ELSIF s.status='signed' AND v_revision=s.signed_revision_id AND s.signed_source_path IS NOT NULL THEN
   v_hash:=s.signed_source_hash;
  END IF;
 ELSIF p_kind='scan' THEN
  IF s.status<>'signed' THEN RAISE EXCEPTION 'Signed scan unavailable' USING ERRCODE='P0002'; END IF;
  v_locator:=s.handwritten_scan_path;v_hash:=s.handwritten_scan_hash;
 ELSE
  IF s.status<>'signed' THEN RAISE EXCEPTION 'Certificate unavailable' USING ERRCODE='P0002'; END IF;
  v_bucket:='signed-documents';v_locator:=s.signed_document_path;v_hash:=s.certificate_hash;v_mime:='text/html';
 END IF;
 IF v_bucket NOT IN('external-contracts','signed-documents') OR nullif(v_locator,'') IS NULL THEN
  RAISE EXCEPTION 'File unavailable' USING ERRCODE='P0002'; END IF;
 v_path:=public.uc_signature_locator_key(v_locator,v_bucket);
 IF v_path IS NULL OR NOT public.uc_signature_object_bound(s.id,v_bucket,v_path) THEN
  RAISE EXCEPTION 'Historical file binding requires review' USING ERRCODE='P0010'; END IF;
 RETURN jsonb_build_object('signature_id',s.id,'organization_id',s.organization_id,'status',s.status,'kind',p_kind,
  'revision_id',v_revision,'bucket',v_bucket,'locator',v_locator,'provenance_path',v_path,'expected_hash',v_hash,'file_name',v_name,'file_mime',v_mime,
  'signed_source_bucket',s.signed_source_bucket,'signed_source_path',s.signed_source_path,'signed_revision_id',s.signed_revision_id);
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_signature_locator_key(text,text),public.uc_signature_canonical_file(uuid,uuid,text),
 public.uc_signature_object_uploader(text,text,uuid),public.uc_signature_object_bound(uuid,text,text),
 public.uc_signature_file_scope(text,text),public.uc_guard_signature_file_provenance(),
 public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid),
 public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text),
 public.uc_signature_file_context(text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.uc_signature_file_scope(text,text),public.uc_signature_canonical_file(uuid,uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.uc_signature_file_context(text,text,uuid) TO service_role;
COMMENT ON FUNCTION public.uc_signature_file_context(text,text,uuid) IS 'Service-only exact token context. Canonical signature namespace AND exact uploader required. Edge independently verifies project origin and sealed hashes, then issues a 60-second URL.';

