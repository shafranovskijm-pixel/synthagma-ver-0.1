-- UC-006. Immutable document versions; no reconstruction of unknown past history.
BEGIN;

ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS document_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_version_id uuid;
ALTER TABLE public.org_document_versions
  ADD COLUMN IF NOT EXISTS event_kind text,
  ADD COLUMN IF NOT EXISTS restored_from_version_id uuid REFERENCES public.org_document_versions(id),
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS request_payload jsonb,
  ADD COLUMN IF NOT EXISTS result_revision bigint,
  ADD COLUMN IF NOT EXISTS storage_object_id uuid,
  ADD COLUMN IF NOT EXISTS storage_metadata jsonb,
  ADD COLUMN IF NOT EXISTS document_metadata jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS org_document_versions_request_key
  ON public.org_document_versions(request_id) WHERE request_id IS NOT NULL;
ALTER TABLE public.org_documents ADD CONSTRAINT org_documents_current_version_fk
  FOREIGN KEY(current_version_id) REFERENCES public.org_document_versions(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.org_document_versions ADD CONSTRAINT org_document_versions_file_size_check
  CHECK(file_size IS NULL OR file_size >= 0) NOT VALID;

-- Only these SECURITY DEFINER routines can authorize a pointer mutation.
-- A client-controlled GUC, service role or trigger depth is NOT an authorization token.
CREATE TABLE public.org_document_write_tokens (
  document_id uuid NOT NULL,
  transaction_id bigint NOT NULL,
  PRIMARY KEY(document_id, transaction_id)
);
REVOKE ALL ON public.org_document_write_tokens FROM PUBLIC, anon, authenticated, service_role;

DO $policies$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='org_document_versions' AND permissive='PERMISSIVE'
  LOOP EXECUTE format('DROP POLICY %I ON public.org_document_versions',p.policyname); END LOOP;
END $policies$;
CREATE POLICY uc_document_versions_read ON public.org_document_versions FOR SELECT TO authenticated
  USING (
    public.account_deletion_access_allowed()
    AND public.can_access_organization(organization_id,'documents.read')
    AND EXISTS (SELECT 1 FROM public.org_documents d
      WHERE d.id=document_id AND d.organization_id=org_document_versions.organization_id)
  );
REVOKE INSERT, UPDATE, DELETE ON public.org_document_versions FROM anon, authenticated;
GRANT SELECT ON public.org_document_versions TO authenticated;

CREATE OR REPLACE FUNCTION public.uc_guard_document_version_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_doc uuid;
BEGIN
  v_doc := CASE WHEN TG_OP='DELETE' THEN OLD.document_id ELSE NEW.document_id END;
  IF NOT EXISTS (SELECT 1 FROM public.org_document_write_tokens
    WHERE document_id=v_doc AND transaction_id=txid_current()) THEN
    RAISE EXCEPTION 'Document versions are immutable; use the version operation' USING ERRCODE='42501';
  END IF;
  IF TG_OP<>'DELETE' AND NOT EXISTS (
    SELECT 1 FROM public.org_documents d WHERE d.id=NEW.document_id AND d.organization_id=NEW.organization_id
  ) THEN RAISE EXCEPTION 'Version organization mismatch' USING ERRCODE='23514'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $fn$;
CREATE TRIGGER uc_document_versions_write_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.org_document_versions FOR EACH ROW EXECUTE FUNCTION public.uc_guard_document_version_write();

CREATE OR REPLACE FUNCTION public.uc_guard_document_pointer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF TG_OP='DELETE' THEN
    IF EXISTS(SELECT 1 FROM public.org_document_versions WHERE document_id=OLD.id) THEN
      RAISE EXCEPTION 'Versioned documents must be archived or moved to the recycle bin' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.file_url,NEW.current_version_id,NEW.document_revision,NEW.organization_id,NEW.id)
       IS DISTINCT FROM (OLD.file_url,OLD.current_version_id,OLD.document_revision,OLD.organization_id,OLD.id)
     AND NOT EXISTS (SELECT 1 FROM public.org_document_write_tokens
       WHERE document_id=OLD.id AND transaction_id=txid_current()) THEN
    RAISE EXCEPTION 'Use commit_org_document_version to replace a document' USING ERRCODE='42501';
  END IF;
  IF NEW.current_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_document_versions v WHERE v.id=NEW.current_version_id
      AND v.document_id=NEW.id AND v.organization_id=NEW.organization_id AND v.file_url IS NOT DISTINCT FROM NEW.file_url
  ) THEN RAISE EXCEPTION 'Invalid current document version' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER uc_document_pointer_guard BEFORE UPDATE OR DELETE ON public.org_documents
  FOR EACH ROW EXECUTE FUNCTION public.uc_guard_document_pointer();

-- Preserve other existing INSERT producers. This is a snapshot at this operation,
-- not a claim about the original upload date/author or earlier revisions.
CREATE OR REPLACE FUNCTION public.uc_snapshot_inserted_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_id uuid;
BEGIN
  IF NEW.current_version_id IS NOT NULL OR NEW.document_revision<>0 THEN
    RAISE EXCEPTION 'Initial version pointers are assigned by the server' USING ERRCODE='23514';
  END IF;
  IF nullif(btrim(NEW.file_url),'') IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.org_document_write_tokens VALUES(NEW.id,txid_current());
  INSERT INTO public.org_document_versions(document_id,organization_id,version_number,file_url,
    event_kind,change_summary,uploaded_by,document_metadata)
  VALUES(NEW.id,NEW.organization_id,1,NEW.file_url,'baseline',
    'Снимок файла при создании записи. Предыдущая история загрузки неизвестна.',auth.uid(),
    jsonb_build_object('name',NEW.name,'type',NEW.type,'issue_date',NEW.issue_date,
      'expires_at',NEW.expires_at,'responsible_person',NEW.responsible_person))
  RETURNING id INTO v_id;
  UPDATE public.org_documents SET current_version_id=v_id,document_revision=1 WHERE id=NEW.id;
  DELETE FROM public.org_document_write_tokens WHERE document_id=NEW.id AND transaction_id=txid_current();
  RETURN NEW;
END $fn$;
CREATE TRIGGER uc_document_initial_snapshot AFTER INSERT ON public.org_documents
  FOR EACH ROW EXECUTE FUNCTION public.uc_snapshot_inserted_document();

CREATE OR REPLACE FUNCTION public.commit_org_document_version(
  p_document_id uuid, p_organization_id uuid, p_request_id uuid, p_expected_revision bigint,
  p_upload jsonb DEFAULT NULL, p_restore_version_id uuid DEFAULT NULL, p_document jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE
  d public.org_documents%ROWTYPE;
  v public.org_document_versions%ROWTYPE;
  source_version public.org_document_versions%ROWTYPE;
  payload jsonb;
  meta jsonb;
  v_id uuid;
  next_number integer;
  v_path text; v_url text; v_name text; v_size bigint; v_summary text;
  actor_name text;
  v_origin text;
  v_object_id uuid;
  v_storage_metadata jsonb;
  v_actual_size bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed()
    OR NOT public.can_access_organization(p_organization_id,'documents.write') THEN
    RAISE EXCEPTION 'Document write permission required' USING ERRCODE='42501';
  END IF;
  IF p_document_id IS NULL OR p_organization_id IS NULL OR p_request_id IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision<0
    OR jsonb_typeof(p_document) IS DISTINCT FROM 'object'
    OR (p_upload IS NULL) = (p_restore_version_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid version operation' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_document) k
    WHERE k NOT IN ('name','type','issue_date','expires_at','responsible_person','status')) THEN
    RAISE EXCEPTION 'Unsupported document field' USING ERRCODE='22023';
  END IF;
  IF p_document ? 'status' AND (p_document->>'status') NOT IN ('active','archived','expired') THEN
    RAISE EXCEPTION 'Invalid document status' USING ERRCODE='22023';
  END IF;
  payload:=jsonb_build_object('document_id',p_document_id,'organization_id',p_organization_id,
    'expected_revision',p_expected_revision,'upload',p_upload,'restore_version_id',p_restore_version_id,'document',p_document);
  -- Serialize a request before checking replay, then serialize the document.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,610181020));
  SELECT * INTO v FROM public.org_document_versions WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v.organization_id<>p_organization_id OR v.document_id<>p_document_id OR v.request_payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION 'Request identifier already used for another operation' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('document_id',v.document_id,'revision',v.result_revision,
      'version_id',v.id,'version_number',v.version_number,'replayed',true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_document_id::text,610181021));
  SELECT * INTO d FROM public.org_documents WHERE id=p_document_id FOR UPDATE;
  IF FOUND THEN
    IF d.organization_id<>p_organization_id THEN RAISE EXCEPTION 'Document organization mismatch' USING ERRCODE='42501'; END IF;
    IF d.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Document is in the recycle bin' USING ERRCODE='22023'; END IF;
    IF d.document_revision<>p_expected_revision THEN RAISE EXCEPTION 'Document changed; reload before replacing it' USING ERRCODE='40001'; END IF;
    IF p_document ? 'type' AND p_document->>'type' IS DISTINCT FROM d.type THEN
      RAISE EXCEPTION 'Document type cannot be changed during replacement' USING ERRCODE='22023';
    END IF;
  ELSE
    IF p_expected_revision<>0 OR p_restore_version_id IS NOT NULL
      OR nullif(btrim(p_document->>'name'),'') IS NULL OR nullif(btrim(p_document->>'type'),'') IS NULL THEN
      RAISE EXCEPTION 'New document name and type are required' USING ERRCODE='22023';
    END IF;
    -- Required catalogue rows are single-current-entry types. No destructive
    -- unique backfill: existing duplicates remain visible for manual review.
    IF p_document->>'type' IN ('charter','license','registration','admission_rules','edu_activity_order',
      'attestation_rules','edu_relations','expulsion_rules','program_dev_rules','vsoko','elearning_rules',
      'practice_rules','qualification_issuance','credit_rules','salary_rules','pedagogical_council',
      'paid_services','personal_data','electronic_docs_rules','program_approval','schedule_approval',
      'commission_orders','doc_forms_approval','electronic_docs_order','self_examination_report') THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||(p_document->>'type'),610181022));
      IF EXISTS(SELECT 1 FROM public.org_documents WHERE organization_id=p_organization_id
        AND type=p_document->>'type' AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Document already exists; reload before replacing it' USING ERRCODE='40001';
      END IF;
    END IF;
    INSERT INTO public.org_documents(id,organization_id,name,type,file_url)
      VALUES(p_document_id,p_organization_id,p_document->>'name',p_document->>'type',NULL) RETURNING * INTO d;
  END IF;
  meta:=jsonb_build_object('name',d.name,'type',d.type,'issue_date',d.issue_date,
    'expires_at',d.expires_at,'responsible_person',d.responsible_person);
  IF p_restore_version_id IS NOT NULL THEN
    SELECT * INTO source_version FROM public.org_document_versions
      WHERE id=p_restore_version_id AND document_id=d.id AND organization_id=d.organization_id;
    IF NOT FOUND OR nullif(btrim(source_version.file_url),'') IS NULL THEN
      RAISE EXCEPTION 'Restorable version not found' USING ERRCODE='22023';
    END IF;
    v_path:=source_version.file_path;v_url:=source_version.file_url;v_name:=source_version.file_name;v_size:=source_version.file_size;
    v_object_id:=source_version.storage_object_id;v_storage_metadata:=source_version.storage_metadata;
    v_summary:='Восстановлен файл версии №'||source_version.version_number;
    meta:=meta||coalesce(source_version.document_metadata,'{}'::jsonb);
  ELSE
    IF jsonb_typeof(p_upload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Upload details required' USING ERRCODE='22023'; END IF;
    v_path:=p_upload->>'file_path';v_name:=p_upload->>'file_name';
    v_size:=(p_upload->>'file_size')::bigint;v_summary:=nullif(btrim(p_upload->>'change_summary'),'');
    -- PostgREST supplies claims from the verified user JWT, not a request body.
    v_origin:=auth.jwt()->>'iss';
    IF v_origin IS NULL OR v_origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?/auth/v1/?$' THEN
      RAISE EXCEPTION 'Verified Storage origin unavailable' USING ERRCODE='22023';
    END IF;
    v_origin:=regexp_replace(v_origin,'/auth/v1/?$','');
    v_url:=v_origin||'/storage/v1/object/public/org-documents/'||v_path;
    IF v_path IS NULL OR v_path !~ ('^'||p_organization_id::text||'/versions/'||p_document_id::text||'/'||p_request_id::text||'\.[a-z0-9]{1,12}$')
      OR v_size IS NULL OR v_size<0 OR nullif(btrim(v_name),'') IS NULL THEN
      RAISE EXCEPTION 'Invalid staged file' USING ERRCODE='22023';
    END IF;
    SELECT id,metadata INTO v_object_id,v_storage_metadata FROM storage.objects
      WHERE bucket_id='org-documents' AND name=v_path FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Staged file not found' USING ERRCODE='22023';
    END IF;
    IF coalesce(v_storage_metadata->>'size','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Staged file size unavailable' USING ERRCODE='22023';
    END IF;
    v_actual_size:=(v_storage_metadata->>'size')::bigint;
    IF v_size<>v_actual_size THEN RAISE EXCEPTION 'Staged file size mismatch' USING ERRCODE='22023'; END IF;
    v_storage_metadata:=jsonb_build_object('size',v_actual_size,'etag',coalesce(v_storage_metadata->>'eTag',v_storage_metadata->>'etag'),
      'mimetype',v_storage_metadata->>'mimetype');
  END IF;
  meta:=meta||(p_document-'status');
  IF nullif(btrim(meta->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Document name required' USING ERRCODE='22023'; END IF;
  IF nullif(meta->>'expires_at','')::date < nullif(meta->>'issue_date','')::date THEN
    RAISE EXCEPTION 'Expiry precedes issue date' USING ERRCODE='22023';
  END IF;
  SELECT full_name INTO actor_name FROM public.profiles WHERE user_id=auth.uid() LIMIT 1;
  INSERT INTO public.org_document_write_tokens VALUES(d.id,txid_current());
  SELECT coalesce(max(version_number),0)+1 INTO next_number FROM public.org_document_versions WHERE document_id=d.id;
  IF d.current_version_id IS NULL AND nullif(btrim(d.file_url),'') IS NOT NULL THEN
    INSERT INTO public.org_document_versions(document_id,organization_id,version_number,file_url,event_kind,change_summary,
      uploaded_by,uploaded_by_name,document_metadata)
    VALUES(d.id,d.organization_id,next_number,d.file_url,'baseline',
      'Снимок предыдущего файла на дату операции. Исходная дата и автор загрузки неизвестны.',auth.uid(),actor_name,
      jsonb_build_object('name',d.name,'type',d.type,'issue_date',d.issue_date,'expires_at',d.expires_at,'responsible_person',d.responsible_person));
    next_number:=next_number+1;
  END IF;
  INSERT INTO public.org_document_versions(document_id,organization_id,version_number,file_url,file_path,file_name,file_size,
    change_summary,uploaded_by,uploaded_by_name,event_kind,restored_from_version_id,request_id,request_payload,result_revision,document_metadata,storage_object_id,storage_metadata)
  VALUES(d.id,d.organization_id,next_number,v_url,v_path,v_name,v_size,v_summary,auth.uid(),actor_name,
    CASE WHEN p_restore_version_id IS NULL THEN 'upload' ELSE 'restore' END,p_restore_version_id,p_request_id,
    payload,d.document_revision+1,meta,v_object_id,v_storage_metadata) RETURNING id INTO v_id;
  UPDATE public.org_documents SET file_url=v_url,current_version_id=v_id,document_revision=d.document_revision+1,
    name=meta->>'name',issue_date=nullif(meta->>'issue_date','')::date,expires_at=nullif(meta->>'expires_at','')::date,
    responsible_person=nullif(btrim(meta->>'responsible_person'),''),
    status=coalesce(p_document->>'status',d.status,'active'),reminder_sent_at=NULL
    WHERE id=d.id;
  DELETE FROM public.org_document_write_tokens WHERE document_id=d.id AND transaction_id=txid_current();
  RETURN jsonb_build_object('document_id',d.id,'revision',d.document_revision+1,
    'version_id',v_id,'version_number',next_number,'replayed',false);
END $fn$;
REVOKE ALL ON FUNCTION public.commit_org_document_version(uuid,uuid,uuid,bigint,jsonb,uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.commit_org_document_version(uuid,uuid,uuid,bigint,jsonb,uuid,jsonb) TO authenticated;

-- Version staging paths are append-only from upload onward, closing the race
-- between a concurrent Storage DELETE/overwrite and the version transaction.
-- Uncertain/abandoned uploads are retained; cleanup needs a separate reviewed job.
CREATE OR REPLACE FUNCTION public.uc_org_document_blob_committed(p_bucket text,p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT p_bucket='org-documents' AND (
    p_path ~ '^[0-9a-f-]{36}/versions/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,12}$'
    OR EXISTS(SELECT 1 FROM public.org_document_versions WHERE file_path=p_path
      OR right(file_url,length(p_path)+1)='/'||p_path)
    OR EXISTS(SELECT 1 FROM public.org_documents WHERE right(file_url,length(p_path)+1)='/'||p_path)
  )
$fn$;
REVOKE ALL ON FUNCTION public.uc_org_document_blob_committed(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.uc_org_document_blob_committed(text,text) TO authenticated,service_role;
CREATE POLICY uc_org_document_blob_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING(NOT public.uc_org_document_blob_committed(bucket_id,name))
  WITH CHECK(NOT public.uc_org_document_blob_committed(bucket_id,name));
CREATE POLICY uc_org_document_blob_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING(NOT public.uc_org_document_blob_committed(bucket_id,name));

COMMENT ON COLUMN public.org_document_versions.event_kind IS 'baseline is a truthful snapshot at this operation, not reconstructed historical authorship/date';
COMMENT ON TABLE public.org_document_write_tokens IS 'Internal transaction capability; no client or service role writes';
COMMIT;

