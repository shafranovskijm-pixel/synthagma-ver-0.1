-- UC-004. Additive signature integrity; historical rows and artifact bytes are not rewritten.
-- Deploy SQL before the new finalizer/certificate handlers. Unsafe old DML fails closed.
DO $prerequisites$
BEGIN
  IF to_regprocedure('public.can_access_organization(uuid,text)') IS NULL
    OR to_regprocedure('public.account_deletion_access_allowed()') IS NULL THEN
    RAISE EXCEPTION 'UC signature prerequisite missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='document_signatures' AND policyname='account_deletion_no_revoked_access'
    AND permissive='RESTRICTIVE') THEN RAISE EXCEPTION 'Account deletion signature fence missing'; END IF;
END;$prerequisites$;

ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS signed_revision_id uuid,
  ADD COLUMN IF NOT EXISTS signed_source_bucket text,
  ADD COLUMN IF NOT EXISTS signed_source_path text,
  ADD COLUMN IF NOT EXISTS signed_source_hash text,
  ADD COLUMN IF NOT EXISTS signed_organization_name text,
  ADD COLUMN IF NOT EXISTS signed_organization_inn text,
  ADD COLUMN IF NOT EXISTS handwritten_scan_hash text,
  ADD COLUMN IF NOT EXISTS certificate_state text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS certificate_hash text,
  ADD COLUMN IF NOT EXISTS certificate_error text;

CREATE OR REPLACE FUNCTION public.uc_signature_actor_allowed(p_signature_id uuid, p_write boolean DEFAULT false, p_recipient boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
 SELECT public.account_deletion_access_allowed() AND EXISTS(
  SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature_id AND s.deleted_at IS NULL
   AND (public.can_access_organization(s.organization_id,CASE WHEN p_write THEN 'documents.write' ELSE 'documents.read' END)
     OR (p_write AND s.sender_user_id=auth.uid() AND s.document_type IN ('contract','external_upload','act')
       AND public.can_access_organization(s.organization_id,'sales.write'))
     OR (p_recipient AND s.recipient_user_id=auth.uid())))
$fn$;
REVOKE ALL ON FUNCTION public.uc_signature_actor_allowed(uuid,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.uc_signature_actor_allowed(uuid,boolean,boolean) TO authenticated,service_role;

-- Replace every old permissive OR-bypass; retain ALL restrictive deletion fences.
DO $policies$ DECLARE p record;
BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
   AND tablename IN ('document_signatures','signature_revisions','pep_agreements') AND permissive='PERMISSIVE'
 LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END;$policies$;
CREATE POLICY uc_signatures_read ON public.document_signatures FOR SELECT TO authenticated
 USING (public.can_access_organization(organization_id,'documents.read') OR recipient_user_id=auth.uid());
CREATE POLICY uc_signatures_insert ON public.document_signatures FOR INSERT TO authenticated
 WITH CHECK (public.can_access_organization(organization_id,'documents.write') AND sender_user_id=auth.uid());
CREATE POLICY uc_signatures_update ON public.document_signatures FOR UPDATE TO authenticated
 USING (public.can_access_organization(organization_id,'documents.write'))
 WITH CHECK (public.can_access_organization(organization_id,'documents.write'));
CREATE POLICY uc_signatures_delete_draft ON public.document_signatures FOR DELETE TO authenticated
 USING (status='draft' AND signed_at IS NULL AND public.can_access_organization(organization_id,'documents.write'));
CREATE POLICY uc_signature_revisions_read ON public.signature_revisions FOR SELECT TO authenticated
 USING (public.uc_signature_actor_allowed(signature_id,false,true));
CREATE POLICY uc_signature_revisions_insert ON public.signature_revisions FOR INSERT TO authenticated
 WITH CHECK (public.uc_signature_actor_allowed(signature_id,true,false) AND created_by=auth.uid());
CREATE POLICY uc_pep_read ON public.pep_agreements FOR SELECT TO authenticated
 USING (user_id=auth.uid() OR public.can_access_organization(organization_id,'documents.read'));
CREATE POLICY uc_pep_insert_own ON public.pep_agreements FOR INSERT TO authenticated
 WITH CHECK (user_id=auth.uid() AND (organization_id=public.current_organization_id()
   OR public.can_access_organization(organization_id,'documents.write')
   OR EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id
     WHERE e.user_id=auth.uid() AND c.organization_id=pep_agreements.organization_id AND e.status IN ('active','completed'))));
CREATE POLICY uc_pep_active_account ON public.pep_agreements AS RESTRICTIVE FOR ALL TO authenticated
 USING (public.account_deletion_access_allowed()) WITH CHECK(public.account_deletion_access_allowed());

CREATE OR REPLACE FUNCTION public.uc_guard_signature_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_service boolean := coalesce(auth.role(),'')='service_role'; v_mutable text[];
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.signed_at IS NOT NULL OR OLD.status='signed' OR OLD.sender_signed_at IS NOT NULL THEN
   RAISE EXCEPTION 'Signed evidence cannot be deleted' USING ERRCODE='42501'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NOT v_service AND (auth.uid() IS NULL OR NEW.sender_user_id IS DISTINCT FROM auth.uid()
    OR NOT public.account_deletion_access_allowed()
    OR NOT (public.can_access_organization(NEW.organization_id,'documents.write')
      OR NEW.document_type IN ('contract','external_upload','act') AND public.can_access_organization(NEW.organization_id,'sales.write'))) THEN
   RAISE EXCEPTION 'Signature creation permission denied' USING ERRCODE='42501'; END IF;
  IF NEW.status='signed' OR NEW.signed_at IS NOT NULL OR NEW.pep_agreement_id IS NOT NULL
   OR NEW.sender_signed_at IS NOT NULL OR NEW.signed_revision_id IS NOT NULL
   OR NEW.signed_source_hash IS NOT NULL OR NEW.signed_source_bucket IS NOT NULL OR NEW.signed_source_path IS NOT NULL
   OR NEW.signed_organization_name IS NOT NULL OR NEW.signed_organization_inn IS NOT NULL OR NEW.handwritten_scan_hash IS NOT NULL
   OR NEW.signed_document_path IS NOT NULL OR NEW.certificate_hash IS NOT NULL
   OR NEW.certificate_state<>'not_requested' THEN
   RAISE EXCEPTION 'Use atomic signature finalization' USING ERRCODE='42501'; END IF;
  IF NEW.document_html IS NOT NULL THEN NEW.document_hash:=encode(sha256(convert_to(NEW.document_html,'UTF8')),'hex'); END IF;
  RETURN NEW;
 END IF;
 -- Provenance and tenant/party identity may never be moved to another record.
 IF (NEW.id,NEW.organization_id,NEW.sender_user_id,NEW.created_at) IS DISTINCT FROM
    (OLD.id,OLD.organization_id,OLD.sender_user_id,OLD.created_at) THEN
  RAISE EXCEPTION 'Signature provenance is immutable' USING ERRCODE='42501'; END IF;
 IF OLD.signed_at IS NULL AND OLD.status<>'signed' AND (NEW.status='signed' OR
   (NEW.signed_at,NEW.signed_ip,NEW.signed_user_agent,NEW.pep_agreement_id,NEW.signed_revision_id,
    NEW.signed_source_bucket,NEW.signed_source_path,NEW.signed_source_hash,NEW.signed_organization_name,NEW.signed_organization_inn,
    NEW.handwritten_scan_path,NEW.handwritten_scan_hash,NEW.signature_method,NEW.signed_document_path,
    NEW.certificate_state,NEW.certificate_hash,NEW.certificate_error,NEW.sender_signed_at,NEW.sender_signed_ip,NEW.sender_signed_user_agent)
    IS DISTINCT FROM
   (OLD.signed_at,OLD.signed_ip,OLD.signed_user_agent,OLD.pep_agreement_id,OLD.signed_revision_id,
    OLD.signed_source_bucket,OLD.signed_source_path,OLD.signed_source_hash,OLD.signed_organization_name,OLD.signed_organization_inn,
    OLD.handwritten_scan_path,OLD.handwritten_scan_hash,OLD.signature_method,OLD.signed_document_path,
    OLD.certificate_state,OLD.certificate_hash,OLD.certificate_error,OLD.sender_signed_at,OLD.sender_signed_ip,OLD.sender_signed_user_agent)) THEN
  IF NOT v_service OR current_setting('sintagma.signature_finalizing_id',true) IS DISTINCT FROM OLD.id::text THEN
   RAISE EXCEPTION 'Use atomic signature finalization' USING ERRCODE='42501'; END IF;
 END IF;
 IF NOT v_service AND NOT public.uc_signature_actor_allowed(OLD.id,true,false) THEN
  IF NOT ((OLD.recipient_user_id=auth.uid() AND public.account_deletion_access_allowed()
      AND (to_jsonb(NEW)-ARRAY['hidden_for_recipient','updated_at'])=(to_jsonb(OLD)-ARRAY['hidden_for_recipient','updated_at']))
    OR (NEW.status='changes_requested' AND OLD.status IN ('sent','viewed','in_review','changes_requested')
      AND OLD.expires_at>clock_timestamp() AND OLD.deleted_at IS NULL
      AND (to_jsonb(NEW)-ARRAY['status','rejection_reason','updated_at'])=(to_jsonb(OLD)-ARRAY['status','rejection_reason','updated_at']))
    OR (OLD.recipient_user_id=auth.uid() AND public.account_deletion_access_allowed()
      AND OLD.status IN ('sent','viewed','in_review','changes_requested')
      AND (to_jsonb(NEW)-ARRAY['document_html','document_hash','current_revision_id','status','updated_at'])=
          (to_jsonb(OLD)-ARRAY['document_html','document_hash','current_revision_id','status','updated_at']))) THEN
   RAISE EXCEPTION 'Signature write permission denied' USING ERRCODE='42501'; END IF;
 END IF;
 IF OLD.status IN ('revoked','rejected','expired') AND
   (to_jsonb(NEW)-ARRAY['hidden_for_sender','hidden_for_recipient','updated_at','email_opened_at']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['hidden_for_sender','hidden_for_recipient','updated_at','email_opened_at']) THEN
  RAISE EXCEPTION 'Closed signature cannot be reopened' USING ERRCODE='42501'; END IF;
 IF OLD.signed_at IS NOT NULL OR OLD.status='signed' OR OLD.sender_signed_at IS NOT NULL THEN
  v_mutable:=ARRAY['updated_at','hidden_for_sender','hidden_for_recipient','email_opened_at'];
  -- The certificate is an append-once derivative; it cannot replace signed evidence.
  IF v_service THEN
   v_mutable:=v_mutable||ARRAY['certificate_state','certificate_error'];
   IF OLD.signed_document_path IS NULL AND NEW.signed_document_path=OLD.organization_id::text||'/certificates/'||OLD.id::text||'.html'
      AND NEW.certificate_hash ~ '^[0-9a-f]{64}$' THEN
    v_mutable:=v_mutable||ARRAY['signed_document_path','certificate_hash'];
   END IF;
  END IF;
  -- Countersign is append-once by the original sender, authenticated by the RPC.
  IF OLD.sender_signed_at IS NULL AND NEW.sender_signed_at IS NOT NULL
     AND auth.uid()=OLD.sender_user_id AND public.account_deletion_access_allowed()
     AND public.uc_signature_actor_allowed(OLD.id,true,false) THEN
   v_mutable:=v_mutable||ARRAY['sender_signed_at','sender_signed_ip','sender_signed_user_agent'];
  END IF;
  IF (to_jsonb(NEW)-v_mutable) IS DISTINCT FROM (to_jsonb(OLD)-v_mutable) THEN
   RAISE EXCEPTION 'Signed document content and evidence are immutable' USING ERRCODE='42501'; END IF;
 ELSIF NOT v_service AND (NEW.status='signed' OR
   (NEW.signed_at,NEW.signed_ip,NEW.signed_user_agent,NEW.pep_agreement_id,NEW.document_hash,
    NEW.signed_revision_id,NEW.signed_source_bucket,NEW.signed_source_path,NEW.signed_source_hash,
    NEW.handwritten_scan_path,NEW.handwritten_scan_hash,NEW.signed_document_path,NEW.certificate_hash)
   IS DISTINCT FROM
   (OLD.signed_at,OLD.signed_ip,OLD.signed_user_agent,OLD.pep_agreement_id,OLD.document_hash,
    OLD.signed_revision_id,OLD.signed_source_bucket,OLD.signed_source_path,OLD.signed_source_hash,
    OLD.handwritten_scan_path,OLD.handwritten_scan_hash,OLD.signed_document_path,OLD.certificate_hash)) THEN
  -- An unsigned sender may edit content/hash together; signing facts only via service RPC.
  IF NEW.status='signed' OR (to_jsonb(NEW)-ARRAY['document_html','document_hash','document_title','document_snapshot_url','current_revision_id','updated_at','status','rejection_reason','rejected_at','sent_at','viewed_at','hidden_for_sender','hidden_for_recipient','email_opened_at','expires_at','mode','recipient_email','recipient_name','recipient_user_id','recipient_type'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['document_html','document_hash','document_title','document_snapshot_url','current_revision_id','updated_at','status','rejection_reason','rejected_at','sent_at','viewed_at','hidden_for_sender','hidden_for_recipient','email_opened_at','expires_at','mode','recipient_email','recipient_name','recipient_user_id','recipient_type']) THEN
   RAISE EXCEPTION 'Use atomic signature finalization' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.current_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.signature_revisions r
   WHERE r.id=NEW.current_revision_id AND r.signature_id=NEW.id) THEN
  RAISE EXCEPTION 'Revision belongs to another signature' USING ERRCODE='23514'; END IF;
 IF OLD.signed_at IS NULL AND OLD.status<>'signed' AND NEW.document_html IS DISTINCT FROM OLD.document_html THEN
  NEW.document_hash:=encode(sha256(convert_to(NEW.document_html,'UTF8')),'hex'); END IF;
 RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_guard_signature_integrity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER uc_signature_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.document_signatures
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_signature_integrity();

CREATE OR REPLACE FUNCTION public.uc_guard_signature_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE; v_id uuid;
BEGIN
 v_id:=CASE WHEN TG_OP='DELETE' THEN OLD.signature_id ELSE NEW.signature_id END;
 SELECT * INTO s FROM public.document_signatures WHERE id=v_id FOR UPDATE;
 IF NOT FOUND OR s.deleted_at IS NOT NULL OR s.status IN ('signed','revoked','rejected','expired') OR s.signed_at IS NOT NULL THEN
  RAISE EXCEPTION 'Signature revision is closed' USING ERRCODE='42501'; END IF;
 IF auth.role()<>'service_role' AND NOT public.uc_signature_actor_allowed(v_id,true,true) THEN
  RAISE EXCEPTION 'Revision permission denied' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Signature revision history cannot be deleted' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (OLD.document_html IS NOT NULL AND OLD.document_html<>'') THEN
  RAISE EXCEPTION 'Create a new revision instead of overwriting history' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['document_html','document_hash']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['document_html','document_hash']) THEN
  RAISE EXCEPTION 'Revision provenance is immutable' USING ERRCODE='42501'; END IF;
 IF NEW.document_html IS NOT NULL THEN NEW.document_hash:=encode(sha256(convert_to(NEW.document_html,'UTF8')),'hex'); END IF;
 RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_guard_signature_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER uc_signature_revision_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.signature_revisions
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_signature_revision();

CREATE OR REPLACE FUNCTION public.uc_guard_pep_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.pep_agreement_id=OLD.id
   AND (s.signed_at IS NOT NULL OR s.status='signed')) THEN
  RAISE EXCEPTION 'Accepted signature agreement is immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_guard_pep_evidence() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER uc_pep_evidence_integrity BEFORE UPDATE OR DELETE ON public.pep_agreements
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_pep_evidence();

-- Bearer-token RPCs must not bypass deleted/closed/revoked-account fences.
CREATE OR REPLACE FUNCTION public.uc_signature_token_access_allowed(p_id uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_id AND s.deleted_at IS NULL
  AND (NOT p_write AND s.status='signed' OR s.status IN ('sent','viewed','in_review','changes_requested') AND s.expires_at>now())
  AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id IN(s.sender_user_id,s.recipient_user_id)))
$fn$;
REVOKE ALL ON FUNCTION public.uc_signature_token_access_allowed(uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_signature_by_token(p_token text)
RETURNS TABLE(id uuid,document_type text,document_title text,document_html text,document_hash text,organization_id uuid,
 organization_name text,organization_inn text,recipient_email text,recipient_name text,recipient_user_id uuid,status text,
 mode text,current_revision_id uuid,expires_at timestamptz,signed_at timestamptz,signed_ip text,sender_signed_at timestamptz,
 sender_signed_ip text,sender_name text,signature_method text,handwritten_scan_path text,signed_document_path text,pep_agreement_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT s.id,s.document_type,s.document_title,
  CASE WHEN s.status='signed' OR s.current_revision_id IS NULL THEN s.document_html ELSE r.document_html END,
  CASE WHEN s.status='signed' OR s.current_revision_id IS NULL THEN s.document_hash ELSE r.document_hash END,
  s.organization_id,coalesce(s.signed_organization_name,o.name),coalesce(s.signed_organization_inn,o.inn),
  s.recipient_email,s.recipient_name,s.recipient_user_id,s.status,s.mode,s.current_revision_id,s.expires_at,s.signed_at,
  s.signed_ip,s.sender_signed_at,s.sender_signed_ip,s.sender_name,s.signature_method,s.handwritten_scan_path,
  s.signed_document_path,s.pep_agreement_id
 FROM public.document_signatures s JOIN public.organizations o ON o.id=s.organization_id
 LEFT JOIN public.signature_revisions r ON r.id=s.current_revision_id AND r.signature_id=s.id
 WHERE s.signature_token=p_token AND public.uc_signature_token_access_allowed(s.id,false)
$fn$;
CREATE OR REPLACE FUNCTION public.get_signature_revisions_by_token(p_token text)
RETURNS TABLE(id uuid,version integer,document_html text,document_hash text,file_url text,file_name text,file_mime text,created_by_name text,change_summary text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT r.id,r.version,r.document_html,r.document_hash,r.file_url,r.file_name,r.file_mime,r.created_by_name,r.change_summary,r.created_at
 FROM public.signature_revisions r JOIN public.document_signatures s ON s.id=r.signature_id
 WHERE s.signature_token=p_token AND public.uc_signature_token_access_allowed(s.id,false) ORDER BY r.version
$fn$;
CREATE OR REPLACE FUNCTION public.get_signature_comments_by_token(p_token text)
RETURNS TABLE(id uuid,revision_id uuid,author_name text,author_role text,quoted_text text,comment_text text,position_anchor jsonb,resolved boolean,resolution_status text,org_reply text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT c.id,c.revision_id,c.author_name,c.author_role,c.quoted_text,c.comment_text,c.position_anchor,c.resolved,c.resolution_status,c.org_reply,c.created_at
 FROM public.signature_comments c JOIN public.document_signatures s ON s.id=c.signature_id
 WHERE s.signature_token=p_token AND public.uc_signature_token_access_allowed(s.id,false) ORDER BY c.created_at
$fn$;

CREATE OR REPLACE FUNCTION public.uc_guard_signature_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE; v_id uuid;
BEGIN
 v_id:=CASE WHEN TG_OP='DELETE' THEN OLD.signature_id ELSE NEW.signature_id END;
 SELECT * INTO s FROM public.document_signatures WHERE id=v_id FOR UPDATE;
 IF NOT public.uc_signature_token_access_allowed(v_id,true) THEN
  RAISE EXCEPTION 'Signature review is closed' USING ERRCODE='42501'; END IF;
 IF auth.role()<>'service_role' THEN
  IF NOT public.account_deletion_access_allowed() THEN RAISE EXCEPTION 'Account access revoked' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND NOT public.uc_signature_actor_allowed(s.id,true,false) THEN
   RAISE EXCEPTION 'Review decision permission denied' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' AND auth.uid() IS NOT NULL AND s.recipient_user_id IS DISTINCT FROM auth.uid()
    AND NOT public.uc_signature_actor_allowed(s.id,true,false) THEN
   RAISE EXCEPTION 'Review permission denied' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' AND (NEW.author_user_id IS NOT NULL AND NEW.author_user_id IS DISTINCT FROM auth.uid()
    OR NEW.author_role<>'recipient' AND NOT public.uc_signature_actor_allowed(s.id,true,false)) THEN
   RAISE EXCEPTION 'Review author mismatch' USING ERRCODE='42501'; END IF;
  IF TG_OP='DELETE' AND NOT public.uc_signature_actor_allowed(s.id,true,false) AND
    (coalesce(OLD.resolution_status,'pending')<>'pending' OR OLD.author_role<>'recipient'
      OR auth.uid() IS NOT NULL AND s.recipient_user_id IS DISTINCT FROM auth.uid()) THEN
   RAISE EXCEPTION 'Review withdrawal denied' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['resolution_status','resolved','resolved_at','resolved_by','org_reply'])
  IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['resolution_status','resolved','resolved_at','resolved_by','org_reply']) THEN
  RAISE EXCEPTION 'Review comment provenance is immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_guard_signature_comment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER uc_signature_comment_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.signature_comments
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_signature_comment();

DO $comment_policies$ DECLARE p record;
BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='signature_comments' AND permissive='PERMISSIVE'
 LOOP EXECUTE format('DROP POLICY %I ON public.signature_comments',p.policyname); END LOOP;
END;$comment_policies$;
CREATE POLICY uc_signature_comments_read ON public.signature_comments FOR SELECT TO authenticated
 USING(public.uc_signature_actor_allowed(signature_id,false,true));
CREATE POLICY uc_signature_comments_insert ON public.signature_comments FOR INSERT TO authenticated
 WITH CHECK(public.uc_signature_actor_allowed(signature_id,true,true) AND author_user_id=auth.uid());
CREATE POLICY uc_signature_comments_decide ON public.signature_comments FOR UPDATE TO authenticated
 USING(public.uc_signature_actor_allowed(signature_id,true,false))
 WITH CHECK(public.uc_signature_actor_allowed(signature_id,true,false));

CREATE OR REPLACE FUNCTION public.uc_finalize_signature(
 p_token text,p_document_hash text,p_agreement jsonb,p_method text DEFAULT 'pep',
 p_expected_revision_id uuid DEFAULT NULL,p_revision_provided boolean DEFAULT false,
 p_ip text DEFAULT NULL,p_user_agent text DEFAULT NULL,p_scan_path text DEFAULT NULL,p_scan_hash text DEFAULT NULL,
 p_source_bucket text DEFAULT NULL,p_source_path text DEFAULT NULL,p_source_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE; r public.signature_revisions%ROWTYPE;
 v_html text; v_hash text; v_pep uuid; v_signed_at timestamptz; v_scan_prefix text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Service finalizer required' USING ERRCODE='42501'; END IF;
 IF length(coalesce(p_token,''))<16 OR p_method IS NULL OR p_method NOT IN ('pep','handwritten_scan') THEN
  RAISE EXCEPTION 'Invalid signature request' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.document_signatures WHERE signature_token=p_token FOR UPDATE;
 IF NOT FOUND OR s.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Signature not found' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id IN(s.sender_user_id,s.recipient_user_id)) THEN
  RAISE EXCEPTION 'Account access revoked' USING ERRCODE='42501'; END IF;
 IF p_revision_provided AND p_expected_revision_id IS DISTINCT FROM s.current_revision_id THEN
  RAISE EXCEPTION 'Document revision changed; reload before signing' USING ERRCODE='40001'; END IF;
 IF s.current_revision_id IS NOT NULL THEN
  SELECT * INTO r FROM public.signature_revisions WHERE id=s.current_revision_id AND signature_id=s.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid current revision' USING ERRCODE='23514'; END IF;
  v_html:=r.document_html;
 ELSE v_html:=s.document_html; END IF;
 IF nullif(v_html,'') IS NULL THEN RAISE EXCEPTION 'Document content unavailable; signing is closed' USING ERRCODE='22023'; END IF;
 v_hash:=encode(sha256(convert_to(v_html,'UTF8')),'hex');
 IF p_method='pep' AND p_document_hash IS DISTINCT FROM v_hash THEN
  RAISE EXCEPTION 'Document content changed; reload before signing' USING ERRCODE='40001'; END IF;
 IF s.status='signed' THEN
  IF s.signature_method<>p_method OR s.document_hash IS DISTINCT FROM v_hash OR
    (p_method='handwritten_scan' AND (s.handwritten_scan_path,s.handwritten_scan_hash) IS DISTINCT FROM (p_scan_path,p_scan_hash)) THEN
   RAISE EXCEPTION 'Signature already finalized for different evidence' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('success',true,'signatureId',s.id,'pepAgreementId',s.pep_agreement_id,
    'signedAt',s.signed_at,'ip',s.signed_ip,'method',s.signature_method,'idempotent',true,'certificateState',s.certificate_state);
 END IF;
 IF p_method='handwritten_scan' AND NOT p_revision_provided THEN
  RAISE EXCEPTION 'Reload current document before attaching a signed scan' USING ERRCODE='40001'; END IF;
 IF s.status NOT IN ('sent','viewed','in_review') OR s.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Signature is closed or expired' USING ERRCODE='55000'; END IF;
 IF jsonb_typeof(p_agreement)<>'object' OR length(trim(coalesce(p_agreement->>'agreement_text','')))<10
   OR length(coalesce(p_agreement->>'agreement_text',''))>100000
   OR length(trim(coalesce(p_agreement->>'full_name','')))<2
   OR lower(trim(coalesce(p_agreement->>'email','')))<>lower(trim(s.recipient_email)) THEN
  RAISE EXCEPTION 'Invalid signer agreement or recipient email' USING ERRCODE='22023'; END IF;
 IF r.file_url IS NOT NULL AND (p_source_bucket IS DISTINCT FROM 'external-contracts' OR p_source_path IS NULL
   OR NOT (r.file_url=p_source_path OR right(split_part(r.file_url,'?',1),length('/external-contracts/'||p_source_path))='/external-contracts/'||p_source_path)
   OR p_source_hash IS NULL OR p_source_hash !~ '^[0-9a-f]{64}$') THEN
  RAISE EXCEPTION 'Original file evidence is required' USING ERRCODE='22023'; END IF;
 IF p_method='handwritten_scan' THEN
  v_scan_prefix:=s.organization_id::text||'/signed-scans/'||s.id::text||'-';
  IF p_scan_path IS NULL OR left(p_scan_path,length(v_scan_prefix))<>v_scan_prefix OR p_scan_path LIKE '%..%'
     OR p_scan_hash IS NULL OR p_scan_hash !~ '^[0-9a-f]{64}$'
     OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='external-contracts' AND name=p_scan_path) THEN
   RAISE EXCEPTION 'Invalid scan evidence' USING ERRCODE='22023'; END IF;
 END IF;
 INSERT INTO public.pep_agreements(organization_id,user_id,email,full_name,agreement_text,agreement_version,ip_address,user_agent)
 VALUES(s.organization_id,s.recipient_user_id,s.recipient_email,trim(p_agreement->>'full_name'),p_agreement->>'agreement_text',
   coalesce(nullif(p_agreement->>'agreement_version',''),'v1.0'),left(p_ip,200),left(p_user_agent,2000)) RETURNING id INTO v_pep;
 v_signed_at:=clock_timestamp();
 PERFORM set_config('sintagma.signature_finalizing_id',s.id::text,true);
 UPDATE public.document_signatures SET status='signed',document_html=v_html,document_hash=v_hash,
  signed_at=v_signed_at,signed_ip=left(p_ip,200),signed_user_agent=left(p_user_agent,2000),pep_agreement_id=v_pep,
  signature_method=p_method,signed_revision_id=s.current_revision_id,
  signed_organization_name=(SELECT name FROM public.organizations WHERE id=s.organization_id),
  signed_organization_inn=(SELECT inn FROM public.organizations WHERE id=s.organization_id),
  signed_source_bucket=p_source_bucket,signed_source_path=p_source_path,signed_source_hash=coalesce(p_source_hash,v_hash),
  handwritten_scan_path=CASE WHEN p_method='handwritten_scan' THEN p_scan_path END,
  handwritten_scan_hash=CASE WHEN p_method='handwritten_scan' THEN p_scan_hash END,
  certificate_state=CASE WHEN p_method='pep' THEN 'pending' ELSE 'not_requested' END
 WHERE id=s.id AND status=s.status AND current_revision_id IS NOT DISTINCT FROM s.current_revision_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Signature transition conflicted' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('success',true,'signatureId',s.id,'pepAgreementId',v_pep,'signedAt',v_signed_at,
  'ip',left(p_ip,200),'method',p_method,'idempotent',false,'certificateState',CASE WHEN p_method='pep' THEN 'pending' ELSE 'not_requested' END);
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_finalize_signature(text,text,jsonb,text,uuid,boolean,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.uc_finalize_signature(text,text,jsonb,text,uuid,boolean,text,text,text,text,text,text,text) TO service_role;

-- Serialize withdrawals on the same row lock as finalization. A signed row cannot be reopened.
CREATE OR REPLACE FUNCTION public.revoke_signature(p_signature_id uuid,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RAISE EXCEPTION 'Auth required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.document_signatures WHERE id=p_signature_id FOR UPDATE;
 IF NOT FOUND OR s.deleted_at IS NOT NULL OR NOT public.uc_signature_actor_allowed(s.id,true,false) THEN
  RAISE EXCEPTION 'Signature permission denied' USING ERRCODE='42501'; END IF;
 IF s.status IN ('signed','rejected','revoked') OR s.signed_at IS NOT NULL THEN
  RAISE EXCEPTION 'Signature already closed' USING ERRCODE='55000'; END IF;
 UPDATE public.document_signatures SET status='revoked',rejected_at=clock_timestamp(),
  rejection_reason=coalesce(nullif(trim(p_reason),''),'Отозвано отправителем') WHERE id=s.id;
 RETURN jsonb_build_object('ok',true,'signature_id',s.id,'revoked_at',clock_timestamp());
END;$fn$;
REVOKE ALL ON FUNCTION public.revoke_signature(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_signature(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sender_countersign(p_signature_id uuid,p_ip text DEFAULT NULL,p_user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE; h jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN
  RAISE EXCEPTION 'Auth required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.document_signatures WHERE id=p_signature_id FOR UPDATE;
 IF NOT FOUND OR s.deleted_at IS NOT NULL OR s.sender_user_id IS DISTINCT FROM auth.uid()
   OR NOT public.uc_signature_actor_allowed(s.id,true,false) THEN
  RAISE EXCEPTION 'Only authorized original sender can countersign' USING ERRCODE='42501'; END IF;
 IF s.status<>'signed' THEN RAISE EXCEPTION 'Recipient must sign first' USING ERRCODE='55000'; END IF;
 IF s.sender_signed_at IS NOT NULL THEN RETURN; END IF;
 -- Keep the old RPC arguments for compatibility, but provenance comes from
 -- request metadata. Missing metadata is recorded as missing, never invented.
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 UPDATE public.document_signatures SET sender_signed_at=clock_timestamp(),
  sender_signed_ip=left(trim(split_part(h->>'x-forwarded-for',',',1)),200),
  sender_signed_user_agent=left(h->>'user-agent',2000) WHERE id=s.id AND sender_signed_at IS NULL;
END;$fn$;
REVOKE ALL ON FUNCTION public.sender_countersign(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sender_countersign(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_signature_changes(p_token text,p_summary text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 UPDATE public.document_signatures SET status='changes_requested',rejection_reason=left(p_summary,10000)
 WHERE signature_token=p_token AND mode='review' AND status IN ('sent','viewed','in_review','changes_requested')
  AND deleted_at IS NULL AND expires_at>clock_timestamp()
  AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id IN(sender_user_id,recipient_user_id));
 IF NOT FOUND THEN RAISE EXCEPTION 'Review is closed' USING ERRCODE='55000'; END IF;
END;$fn$;

-- Restrictive guards apply even beside legacy bucket-wide permissive policies.
CREATE OR REPLACE FUNCTION public.uc_signature_storage_read(p_bucket text,p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.account_deletion_access_allowed() AND (
  EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.deleted_at IS NULL AND s.organization_id::text=split_part(p_name,'/',1)
   AND (s.signed_document_path=p_name AND p_bucket='signed-documents'
      OR s.handwritten_scan_path=p_name AND p_bucket='external-contracts'
      OR s.signed_source_bucket=p_bucket AND s.signed_source_path=p_name
      OR p_bucket='external-contracts' AND EXISTS(SELECT 1 FROM public.signature_revisions r WHERE r.signature_id=s.id
        AND (r.file_url=p_name OR right(split_part(r.file_url,'?',1),length('/external-contracts/'||p_name))='/external-contracts/'||p_name)))
   AND (s.recipient_user_id=auth.uid() OR public.can_access_organization(s.organization_id,'documents.read')))
  OR EXISTS(SELECT 1 FROM public.organizations o WHERE o.id::text=split_part(p_name,'/',1)
    AND public.can_access_organization(o.id,'documents.read')))
$fn$;
CREATE OR REPLACE FUNCTION public.uc_signature_storage_write(p_bucket text,p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.account_deletion_access_allowed()
 AND NOT (p_bucket='signed-documents' AND split_part(p_name,'/',2) IN ('certificates','evidence'))
 -- Files referenced by ANY revision are immutable already while in review.
 -- Replacements use a new object and revision; download/hash cannot race an overwrite.
 AND NOT EXISTS(SELECT 1 FROM public.signature_revisions r JOIN public.document_signatures s ON s.id=r.signature_id
   WHERE p_bucket='external-contracts' AND (r.file_url=p_name OR right(split_part(r.file_url,'?',1),length('/external-contracts/'||p_name))='/external-contracts/'||p_name))
 AND NOT EXISTS(
  SELECT 1 FROM public.document_signatures s WHERE (s.status='signed' OR s.signed_at IS NOT NULL)
   AND ((p_bucket='signed-documents' AND s.signed_document_path=p_name)
    OR (p_bucket='external-contracts' AND s.handwritten_scan_path=p_name)
    OR (s.signed_source_bucket=p_bucket AND s.signed_source_path=p_name)
    OR (p_bucket='external-contracts' AND EXISTS(SELECT 1 FROM public.signature_revisions r WHERE r.signature_id=s.id
      AND (r.file_url=p_name OR right(split_part(r.file_url,'?',1),length('/external-contracts/'||p_name))='/external-contracts/'||p_name)))))
 AND (EXISTS(SELECT 1 FROM public.organizations o WHERE o.id::text=split_part(p_name,'/',1)
   AND (public.can_access_organization(o.id,'documents.write') OR p_bucket='external-contracts' AND public.can_access_organization(o.id,'sales.write')))
  OR (p_bucket='external-contracts' AND EXISTS(SELECT 1 FROM public.document_signatures s
    WHERE s.recipient_user_id=auth.uid() AND s.deleted_at IS NULL AND s.expires_at>now()
      AND s.status IN ('sent','viewed','in_review')
      AND left(p_name,length(s.organization_id::text||'/signed-scans/'||s.id::text||'-'))=
          s.organization_id::text||'/signed-scans/'||s.id::text||'-')))
$fn$;
REVOKE ALL ON FUNCTION public.uc_signature_storage_read(text,text),public.uc_signature_storage_write(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.uc_signature_storage_read(text,text),public.uc_signature_storage_write(text,text) TO authenticated,service_role;
CREATE POLICY uc_signature_file_participant_read ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id IN ('signed-documents','external-contracts') AND public.uc_signature_storage_read(bucket_id,name));
CREATE POLICY uc_signature_file_participant_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='external-contracts' AND public.uc_signature_storage_write(bucket_id,name));
CREATE POLICY uc_signature_file_read_boundary ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING (bucket_id NOT IN ('signed-documents','external-contracts') OR public.uc_signature_storage_read(bucket_id,name));
CREATE POLICY uc_signature_file_insert_boundary ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (bucket_id NOT IN ('signed-documents','external-contracts') OR public.uc_signature_storage_write(bucket_id,name));
CREATE POLICY uc_signature_file_update_boundary ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (bucket_id NOT IN ('signed-documents','external-contracts') OR (public.uc_signature_storage_write(bucket_id,name) AND split_part(name,'/',2)<>'signed-scans'))
 WITH CHECK (bucket_id NOT IN ('signed-documents','external-contracts') OR (public.uc_signature_storage_write(bucket_id,name) AND split_part(name,'/',2)<>'signed-scans'));
CREATE POLICY uc_signature_file_delete_boundary ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING (bucket_id NOT IN ('signed-documents','external-contracts') OR (public.uc_signature_storage_write(bucket_id,name) AND split_part(name,'/',2)<>'signed-scans'));
