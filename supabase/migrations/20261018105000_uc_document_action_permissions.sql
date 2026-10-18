-- UC-003 stage 2. New action grants; no permission JSON or business-row backfill.
-- Requires released foundation 100--103 and reviewed group scopes 104.
DO $prerequisites$
BEGIN
 IF to_regprocedure('public.uc_document_scope_allowed(uuid,uuid,uuid)') IS NULL
  OR to_regprocedure('public.uc_document_signature_scope(uuid)') IS NULL
  OR to_regprocedure('public.uc_document_signature_source_scope(uuid,uuid)') IS NULL
  OR to_regprocedure('public.uc_document_record_scope(uuid,uuid,uuid,uuid,uuid)') IS NULL
  OR to_regprocedure('public.uc_document_contract_scope(uuid,uuid,uuid,uuid,jsonb)') IS NULL
  OR to_regprocedure('public.uc_document_student_scope_allowed(uuid,uuid)') IS NULL
  OR to_regprocedure('public.uc_finalize_signature(text,text,jsonb,text,uuid,boolean,text,text,text,text,text,text,text)') IS NULL THEN
  RAISE EXCEPTION 'UC action permissions require the released foundation and group scopes'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES
  ('public.org_role_default_permissions(text)','f2b39953a0c439d75079d72d5e103247'),
  ('public.uc_guard_signature_integrity()','65d9e7ac959c7af8e3d7729837d426e4'),
  ('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)','069a8805ac893e668811954b0020b9e6'),
  ('public.get_next_document_number(uuid,text,integer)','8912e499fc96392d7b17596c8cbc4f22'),
  ('public.next_reg_number(uuid,text,integer)','05a451485383ac5d51f9812aae0ade29')
 ) expected(signature,definition_md5) WHERE to_regprocedure(signature) IS NULL
  OR md5(pg_get_functiondef(to_regprocedure(signature)))<>definition_md5) THEN
  RAISE EXCEPTION 'UC action permissions: unreviewed released foundation'; END IF;
END;$prerequisites$;

CREATE FUNCTION public.uc_platform_document_action_allowed(p_user uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_user IS NOT NULL AND p_action IN ('read','write','sign','issue')
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND (NOT public.has_role('admin'::public.app_role,p_user)
  OR NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user)
  OR EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user AND
     (role IN ('super_admin','admin') OR p_action='read' AND role IN ('viewer','sales_manager'))
     AND (expires_at IS NULL OR expires_at>now()))
   AND NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user
     AND (NOT (role IN ('super_admin','admin') OR p_action='read' AND role IN ('viewer','sales_manager')) OR expires_at<=now())))
$fn$;
CREATE FUNCTION public.uc_platform_sales_action_allowed(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND (NOT public.has_role('admin'::public.app_role,p_user)
  OR NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user)
  OR EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user AND role IN ('super_admin','admin','sales_manager')
     AND (expires_at IS NULL OR expires_at>now()))
   AND NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user
     AND (role NOT IN ('super_admin','admin','sales_manager') OR expires_at<=now())))
$fn$;
CREATE FUNCTION public.uc_document_has_action(p_org uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_platform_document_action_allowed(auth.uid(),p_action)
  AND public.account_deletion_access_allowed()
  AND p_org IS NOT NULL AND p_action IN ('read','write','sign','issue')
  AND coalesce(public.can_access_organization(p_org,'documents.'||p_action),false)
$fn$;
CREATE FUNCTION public.uc_document_action_allowed(p_org uuid,p_action text,p_group uuid DEFAULT NULL,p_enrollment uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_document_has_action(p_org,p_action)
  AND public.uc_document_scope_allowed(p_org,p_group,p_enrollment)
$fn$;
CREATE FUNCTION public.uc_document_commercial_creation_allowed(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_platform_sales_action_allowed(auth.uid()) AND public.account_deletion_access_allowed()
  AND coalesce(public.can_access_organization(p_org,'sales.write'),false)
  AND public.uc_document_scope_allowed(p_org,NULL,NULL)
$fn$;
REVOKE ALL ON FUNCTION public.uc_platform_document_action_allowed(uuid,text),public.uc_platform_sales_action_allowed(uuid),
 public.uc_document_has_action(uuid,text),public.uc_document_action_allowed(uuid,text,uuid,uuid),
 public.uc_document_commercial_creation_allowed(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.uc_platform_document_action_allowed(uuid,text),public.uc_platform_sales_action_allowed(uuid),
 public.uc_document_has_action(uuid,text),public.uc_document_action_allowed(uuid,text,uuid,uuid),
 public.uc_document_commercial_creation_allowed(uuid) TO authenticated,service_role;

-- Existing canonical aliases still normalize only view/manage. Write never
-- implies sign or issue; adding role defaults does not rewrite stored grants.
DO $defaults$ DECLARE source text; replacement text; needle text;
BEGIN
 source:=pg_get_functiondef('public.org_role_default_permissions(text)'::regprocedure);
 needle:='''documents.read'',''documents.write'',''journals.read''';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>2 THEN
  RAISE EXCEPTION 'Unreviewed organization role defaults'; END IF;
 replacement:=replace(source,needle,'''documents.read'',''documents.write'',''documents.sign'',''documents.issue'',''journals.read''');
 EXECUTE replacement;
END;$defaults$;
CREATE OR REPLACE FUNCTION public.uc_document_org_access(p_org uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_document_has_action(p_org,CASE WHEN p_write THEN 'write' ELSE 'read' END)
$fn$;

CREATE FUNCTION public.uc_signature_commercial_sender_allowed(p_signature uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.account_deletion_access_allowed() AND EXISTS(SELECT 1 FROM public.document_signatures s
  WHERE s.id=p_signature AND s.deleted_at IS NULL AND s.sender_user_id=auth.uid()
   AND s.document_type IN ('contract','external_upload','act')
   AND public.uc_document_commercial_creation_allowed(s.organization_id))
$fn$;
CREATE FUNCTION public.uc_signature_action_allowed(p_signature uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_action IN ('read','write','sign') AND public.account_deletion_access_allowed()
  AND EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature AND s.deleted_at IS NULL
   AND (public.uc_document_has_action(s.organization_id,p_action) AND public.uc_document_signature_scope(s.id)
    OR public.uc_signature_commercial_sender_allowed(s.id)))
$fn$;
CREATE OR REPLACE FUNCTION public.uc_signature_actor_allowed(p_signature_id uuid,p_write boolean DEFAULT false,p_recipient boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.account_deletion_access_allowed() AND (
  public.uc_signature_action_allowed(p_signature_id,CASE WHEN p_write THEN 'write' ELSE 'read' END)
  OR p_recipient AND EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature_id
   AND s.deleted_at IS NULL AND s.recipient_user_id=auth.uid()))
$fn$;
REVOKE ALL ON FUNCTION public.uc_signature_commercial_sender_allowed(uuid),public.uc_signature_action_allowed(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.uc_signature_commercial_sender_allowed(uuid),public.uc_signature_action_allowed(uuid,text) TO authenticated,service_role;
DROP POLICY uc_signatures_read ON public.document_signatures;
CREATE POLICY uc_signatures_read ON public.document_signatures FOR SELECT TO authenticated
 USING(public.uc_signature_actor_allowed(id,false,true));

-- A sign-only original sender may countersign through the narrow RPC without
-- acquiring edit rights. Keep every released immutable-evidence check intact.
DO $signature_guard$ DECLARE source text; replacement text; needle text;
BEGIN
 source:=pg_get_functiondef('public.uc_guard_signature_integrity()'::regprocedure);
 needle:='IF NOT v_service AND NOT public.uc_signature_actor_allowed(OLD.id,true,false) THEN';
 replacement:=replace(source,needle,
  'IF NOT v_service AND NOT public.uc_signature_actor_allowed(OLD.id,true,false) AND NOT ('||
  'OLD.status=''signed'' AND public.uc_signature_action_allowed(OLD.id,''sign'') AND '||
  'current_setting(''sintagma.signature_countersigning_id'',true)=OLD.id::text AND '||
  '(to_jsonb(NEW)-ARRAY[''sender_signed_at'',''sender_signed_ip'',''sender_signed_user_agent'',''updated_at''])='||
  '(to_jsonb(OLD)-ARRAY[''sender_signed_at'',''sender_signed_ip'',''sender_signed_user_agent'',''updated_at''])) THEN');
 IF replacement=source THEN RAISE EXCEPTION 'Unreviewed released signature guard entry'; END IF;
 source:=replacement;
 replacement:=replace(source,'AND public.uc_signature_actor_allowed(OLD.id,true,false) THEN',
  'AND public.uc_signature_action_allowed(OLD.id,''sign'') THEN');
 IF replacement=source THEN RAISE EXCEPTION 'Unreviewed released countersign append guard'; END IF;
 EXECUTE replacement;
END;$signature_guard$;
CREATE OR REPLACE FUNCTION public.sender_countersign(p_signature_id uuid,p_ip text DEFAULT NULL,p_user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE; h jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RAISE EXCEPTION 'Auth required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.document_signatures WHERE id=p_signature_id FOR UPDATE;
 IF NOT FOUND OR s.deleted_at IS NOT NULL OR s.sender_user_id IS DISTINCT FROM auth.uid()
  OR NOT public.uc_signature_action_allowed(s.id,'sign') THEN RAISE EXCEPTION 'Document sign permission required' USING ERRCODE='42501'; END IF;
 IF s.status<>'signed' THEN RAISE EXCEPTION 'Recipient must sign first' USING ERRCODE='55000'; END IF;
 IF s.sender_signed_at IS NOT NULL THEN RETURN; END IF;
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 PERFORM set_config('sintagma.signature_countersigning_id',s.id::text,true);
 UPDATE public.document_signatures SET sender_signed_at=clock_timestamp(),
  sender_signed_ip=left(trim(split_part(h->>'x-forwarded-for',',',1)),200),
  sender_signed_user_agent=left(h->>'user-agent',2000) WHERE id=s.id AND sender_signed_at IS NULL;
END;$fn$;

CREATE FUNCTION public.uc_guard_signature_actions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_service boolean:=coalesce(auth.role(),'')='service_role'; v_id uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  -- The service sales handler verifies the actual sender via the user client.
  -- Even service inserts cannot appoint a read-only platform viewer as sender.
  IF NOT public.uc_platform_document_action_allowed(NEW.sender_user_id,'write')
    AND NOT (NEW.document_type IN ('contract','external_upload','act') AND public.uc_platform_sales_action_allowed(NEW.sender_user_id)) THEN
   RAISE EXCEPTION 'Sender platform document access denied' USING ERRCODE='42501'; END IF;
  IF NOT v_service AND NOT (public.uc_document_has_action(NEW.organization_id,'write') AND public.uc_document_signature_source_scope(NEW.organization_id,NEW.document_id)
    OR NEW.document_type IN ('contract','external_upload','act') AND public.uc_document_commercial_creation_allowed(NEW.organization_id)) THEN
   RAISE EXCEPTION 'Document write scope required' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 v_id:=OLD.id;
 IF TG_OP='UPDATE' AND NEW.document_id IS DISTINCT FROM OLD.document_id AND NOT (
   (public.uc_document_has_action(NEW.organization_id,'write') OR public.uc_signature_commercial_sender_allowed(v_id))
   AND public.uc_document_signature_source_scope(NEW.organization_id,NEW.document_id)) THEN
  RAISE EXCEPTION 'New signature source scope denied' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.sender_signed_at,NEW.sender_signed_ip,NEW.sender_signed_user_agent)
   IS DISTINCT FROM (OLD.sender_signed_at,OLD.sender_signed_ip,OLD.sender_signed_user_agent) THEN
  IF NOT public.uc_signature_action_allowed(v_id,'sign') OR current_setting('sintagma.signature_countersigning_id',true) IS DISTINCT FROM v_id::text THEN
   RAISE EXCEPTION 'Use authorized countersign RPC' USING ERRCODE='42501'; END IF;
 ELSIF NOT v_service THEN
  IF TG_OP='UPDATE' AND OLD.recipient_user_id=auth.uid() AND
   (to_jsonb(NEW)-ARRAY['hidden_for_recipient','updated_at'])=(to_jsonb(OLD)-ARRAY['hidden_for_recipient','updated_at']) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.status='changes_requested' AND
   (to_jsonb(NEW)-ARRAY['status','rejection_reason','updated_at'])=(to_jsonb(OLD)-ARRAY['status','rejection_reason','updated_at']) THEN RETURN NEW; END IF;
  -- An authenticated recipient may supply the reviewed revision; invitation
  -- token finalization itself remains protected by the released service RPC.
  IF TG_OP='UPDATE' AND OLD.recipient_user_id=auth.uid() AND OLD.status IN ('sent','viewed','in_review','changes_requested')
    AND (to_jsonb(NEW)-ARRAY['document_html','document_hash','current_revision_id','status','updated_at'])=
        (to_jsonb(OLD)-ARRAY['document_html','document_hash','current_revision_id','status','updated_at']) THEN RETURN NEW; END IF;
  IF NOT public.uc_signature_action_allowed(v_id,'write') THEN RAISE EXCEPTION 'Document write scope required' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_guard_signature_actions() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER uc_signature_operation_guard BEFORE INSERT OR UPDATE OR DELETE ON public.document_signatures
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_signature_actions();

-- Action checks also cover SECURITY DEFINER triggers/RPCs and soft-delete RPCs.
-- Rejecting the legacy auto-issuer rolls back its subtransaction/counters; its
-- existing EXCEPTION handler preserves the learner's completed enrollment.
CREATE FUNCTION public.uc_document_row_action_allowed(p_table text,p_row jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_org uuid; v_enrollment uuid; v_group uuid; v_user uuid; v_action text:='write';
BEGIN
 v_org:=nullif(p_row->>'organization_id','')::uuid;
 v_enrollment:=nullif(p_row->>'enrollment_id','')::uuid;
 v_group:=nullif(p_row->>'group_id','')::uuid;
 v_user:=nullif(p_row->>'user_id','')::uuid;
 IF p_table IN ('education_document_records','document_issuance_log') THEN v_action:='issue';
 ELSIF p_table='group_documents' AND p_row->>'doc_status'='final' AND p_row->>'doc_type' IN ('enrollment_order','expulsion_order') THEN v_action:='issue'; END IF;
 IF p_table='company_documents' THEN SELECT organization_id INTO v_org FROM public.companies WHERE id=(p_row->>'company_id')::uuid;
 ELSIF p_table='org_contracts' THEN
  RETURN public.uc_document_has_action(v_org,'write') AND public.uc_document_contract_scope(v_org,
   nullif(p_row->>'student_group_id','')::uuid,nullif(p_row->>'student_user_id','')::uuid,nullif(p_row->>'company_id','')::uuid,p_row->'students');
 ELSIF p_table='program_training_plans' THEN SELECT organization_id INTO v_org FROM public.courses WHERE id=(p_row->>'course_id')::uuid;
 ELSIF p_table='student_documents' THEN SELECT c.organization_id INTO v_org FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=v_enrollment;
 ELSIF p_table='student_identity_documents' THEN
  RETURN public.account_deletion_access_allowed() AND (
   v_user=auth.uid() AND public.uc_document_student_in_org(v_user,v_org)
   OR public.uc_document_has_action(v_org,'write') AND public.uc_document_student_scope_allowed(v_org,v_user));
 END IF;
 IF p_table IN ('education_document_records','document_issuance_log') THEN
  RETURN public.uc_document_has_action(v_org,'issue') AND public.uc_document_record_scope(v_org,v_group,v_enrollment,v_user,nullif(p_row->>'course_id','')::uuid);
 ELSIF p_table='group_documents' THEN
  RETURN public.uc_document_has_action(v_org,v_action) AND public.uc_document_record_scope(v_org,v_group,NULL,nullif(p_row->>'student_user_id','')::uuid,NULL);
 END IF;
 RETURN public.uc_document_action_allowed(v_org,v_action,v_group,v_enrollment);
END;$fn$;
CREATE FUNCTION public.uc_guard_document_actions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_TABLE_NAME='group_documents' AND TG_OP='UPDATE' AND
  (to_jsonb(NEW)-ARRAY['is_current','updated_at'])=(to_jsonb(OLD)-ARRAY['is_current','updated_at']) THEN
  IF NOT public.uc_document_action_allowed(OLD.organization_id,'write',OLD.group_id,NULL) THEN
   RAISE EXCEPTION 'Document version scope denied' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP IN ('UPDATE','DELETE') AND NOT public.uc_document_row_action_allowed(TG_TABLE_NAME,to_jsonb(OLD)) THEN
  RAISE EXCEPTION 'Document action or group scope denied' USING ERRCODE='42501'; END IF;
 IF TG_OP IN ('INSERT','UPDATE') AND NOT public.uc_document_row_action_allowed(TG_TABLE_NAME,to_jsonb(NEW)) THEN
  RAISE EXCEPTION 'Document action or group scope denied' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_document_row_action_allowed(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.uc_document_row_action_allowed(text,jsonb) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.uc_guard_document_actions() FROM PUBLIC,anon,authenticated;
DO $row_actions$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['org_documents','incoming_documents','education_document_records','document_issuance_log','program_documents',
  'program_folders','program_categories','program_training_plans','frdo_signed_documents','student_documents','student_identity_documents','company_documents','group_documents','org_contracts'] LOOP
  EXECUTE format('CREATE TRIGGER uc_document_action_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_guard_document_actions()',t);
  -- Issue-only grants need a permissive insert/update path independent of write;
  -- action triggers and 104 restrictive scopes remain an additional boundary.
  IF t IN ('education_document_records','document_issuance_log') THEN
   EXECUTE format('DROP POLICY uc_documents_insert ON public.%I',t);
   EXECUTE format('DROP POLICY uc_documents_update ON public.%I',t);
   EXECUTE format('DROP POLICY uc_documents_delete ON public.%I',t);
   EXECUTE format('CREATE POLICY uc_documents_insert ON public.%I FOR INSERT TO authenticated WITH CHECK(public.uc_document_row_action_allowed(%L,to_jsonb(%I.*)))',t,t,t);
   EXECUTE format('CREATE POLICY uc_documents_update ON public.%I FOR UPDATE TO authenticated USING(public.uc_document_row_action_allowed(%L,to_jsonb(%I.*))) WITH CHECK(public.uc_document_row_action_allowed(%L,to_jsonb(%I.*)))',t,t,t,t,t);
   EXECUTE format('CREATE POLICY uc_documents_delete ON public.%I FOR DELETE TO authenticated USING(public.uc_document_row_action_allowed(%L,to_jsonb(%I.*)))',t,t,t);
  END IF;
 END LOOP;
END;$row_actions$;
DO $contracts_write_preflight$
BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='org_contracts' AND permissive='PERMISSIVE' AND cmd IN('INSERT','UPDATE','DELETE','ALL'))<>3
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='org_contracts' AND permissive='PERMISSIVE' AND cmd IN('INSERT','UPDATE','DELETE') AND
   (roles<>ARRAY['authenticated']::name[] OR policyname<>CASE cmd WHEN 'INSERT' THEN 'Org members can insert own contracts' WHEN 'UPDATE' THEN 'Org members can update own contracts' ELSE 'Org members can delete own contracts' END
    OR coalesce(qual,with_check)<>'((organization_id = current_organization_id()) OR has_role(''admin''::app_role, auth.uid()))')) THEN
  RAISE EXCEPTION 'UC actions unreviewed org contracts write policies'; END IF;
END;$contracts_write_preflight$;
DROP POLICY "Org members can insert own contracts" ON public.org_contracts;
DROP POLICY "Org members can update own contracts" ON public.org_contracts;
DROP POLICY "Org members can delete own contracts" ON public.org_contracts;
CREATE POLICY uc_contract_documents_insert ON public.org_contracts FOR INSERT TO authenticated
 WITH CHECK(public.uc_document_row_action_allowed('org_contracts',to_jsonb(org_contracts.*)));
CREATE POLICY uc_contract_documents_update ON public.org_contracts FOR UPDATE TO authenticated
 USING(public.uc_document_row_action_allowed('org_contracts',to_jsonb(org_contracts.*)))
 WITH CHECK(public.uc_document_row_action_allowed('org_contracts',to_jsonb(org_contracts.*)));
CREATE POLICY uc_contract_documents_delete ON public.org_contracts FOR DELETE TO authenticated
 USING(public.uc_document_row_action_allowed('org_contracts',to_jsonb(org_contracts.*)));

-- Three reviewed public namespaces only. Draft contracts keep write permission;
-- final group orders require issue. Education counters are issuer-internal.
CREATE FUNCTION public.reserve_group_document_number(p_org uuid,p_group uuid,p_doc_type text,p_year integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_action text; v_next integer; v_year integer:=coalesce(p_year,extract(year FROM now())::integer);
BEGIN
 v_action:=CASE WHEN p_doc_type IN ('contract','group_contract') THEN 'write' WHEN p_doc_type='group_order' THEN 'issue' END;
 IF v_action IS NULL OR v_year NOT BETWEEN 2000 AND 2200 OR NOT public.uc_document_action_allowed(p_org,v_action,p_group,NULL) THEN
  RAISE EXCEPTION 'Number namespace, action or group scope denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.document_number_sequences(organization_id,doc_type,year,last_number) VALUES(p_org,p_doc_type,v_year,1)
 ON CONFLICT(organization_id,doc_type,year) DO UPDATE SET last_number=document_number_sequences.last_number+1,updated_at=now()
 RETURNING last_number INTO v_next;
 RETURN v_next;
END;$fn$;
CREATE OR REPLACE FUNCTION public.get_next_document_number(p_org uuid,p_doc_type text,p_year integer DEFAULT NULL)
RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.reserve_group_document_number(p_org,NULL,p_doc_type,p_year)
$fn$;

-- The legacy education editor has its own registration counter. Keep its
-- formatting/namespace unchanged, but close its former auth-only tenant bypass.
CREATE FUNCTION public.reserve_education_registration_number(p_org uuid,p_group uuid,p_doc_type text,p_year integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_year integer:=coalesce(p_year,extract(year FROM now())::integer); v_next integer;
BEGIN
 IF p_doc_type NOT IN ('certificate','diploma','qualification') OR p_doc_type IS NULL
  OR v_year NOT BETWEEN 2000 AND 2200 OR NOT public.uc_document_action_allowed(p_org,'issue',p_group,NULL) THEN
  RAISE EXCEPTION 'Education registration action or scope denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_doc_type||':'||v_year::text,0));
 INSERT INTO public.document_number_sequences(organization_id,doc_type,year,last_number) VALUES(p_org,p_doc_type,v_year,1)
 ON CONFLICT(organization_id,doc_type,year) DO UPDATE SET last_number=document_number_sequences.last_number+1,updated_at=now()
 RETURNING last_number INTO v_next;
 RETURN v_next;
END;$fn$;
CREATE OR REPLACE FUNCTION public.next_reg_number(p_org uuid,p_doc_type text,p_year integer DEFAULT NULL)
RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.reserve_education_registration_number(p_org,NULL,p_doc_type,p_year)
$fn$;

CREATE FUNCTION public.set_org_staff_document_grants(p_org uuid,p_staff uuid,p_expected_role text,
 p_expected_sections_access jsonb,p_sign boolean,p_issue boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.org_staff%ROWTYPE; v_sections jsonb; v_old jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed()
  OR NOT public.uc_platform_document_action_allowed(auth.uid(),'write')
  OR NOT public.can_access_organization(p_org,'staff.write')
  OR NOT public.uc_document_scope_allowed(p_org,NULL,NULL) THEN
  RAISE EXCEPTION 'Staff grant management denied' USING ERRCODE='42501'; END IF;
 IF p_sign IS NULL OR p_issue IS NULL THEN RAISE EXCEPTION 'Explicit grant values required' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.org_staff WHERE id=p_staff AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Staff member not found' USING ERRCODE='P0002'; END IF;
 IF s.role IS DISTINCT FROM p_expected_role OR s.sections_access IS DISTINCT FROM p_expected_sections_access THEN
  RAISE EXCEPTION 'Staff grants changed; reload before saving' USING ERRCODE='40001'; END IF;
 IF s.role IN ('owner','admin') THEN RAISE EXCEPTION 'Role supplies immutable default document actions' USING ERRCODE='55000'; END IF;
 v_old:=coalesce(s.sections_access,'[]'::jsonb);
 IF jsonb_typeof(v_old)<>'array' THEN RAISE EXCEPTION 'Unreviewed grant format' USING ERRCODE='22023'; END IF;
 IF p_sign AND NOT v_old ? 'documents.sign' AND NOT public.uc_document_action_allowed(p_org,'sign',NULL,NULL) THEN
  RAISE EXCEPTION 'Cannot delegate document sign permission' USING ERRCODE='42501'; END IF;
 IF p_issue AND NOT v_old ? 'documents.issue' AND NOT public.uc_document_action_allowed(p_org,'issue',NULL,NULL) THEN
  RAISE EXCEPTION 'Cannot delegate document issue permission' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO v_sections
 FROM jsonb_array_elements(v_old) WITH ORDINALITY e(value,ordinal)
 WHERE value NOT IN ('"documents.sign"'::jsonb,'"documents.issue"'::jsonb);
 IF p_sign THEN v_sections:=v_sections||'["documents.sign"]'::jsonb; END IF;
 IF p_issue THEN v_sections:=v_sections||'["documents.issue"]'::jsonb; END IF;
 UPDATE public.org_staff SET sections_access=v_sections WHERE id=s.id;
 RETURN jsonb_build_object('id',s.id,'organization_id',s.organization_id,'role',s.role,'sections_access',v_sections);
END;$fn$;

CREATE FUNCTION public.get_org_staff_document_grants(p_org uuid,p_staff uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.org_staff%ROWTYPE;
BEGIN
 IF NOT public.account_deletion_access_allowed() OR NOT public.uc_platform_document_action_allowed(auth.uid(),'read')
  OR NOT public.uc_document_scope_allowed(p_org,NULL,NULL)
  OR NOT (public.can_access_organization(p_org,'staff.read') OR public.can_access_organization(p_org,'staff.write')) THEN
  RAISE EXCEPTION 'Staff grants read denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.org_staff WHERE id=p_staff AND organization_id=p_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Staff member not found' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('id',s.id,'organization_id',s.organization_id,'role',s.role,'sections_access',s.sections_access);
END;$fn$;
CREATE FUNCTION public.validate_org_staff_document_assignment(p_org uuid,p_role text,p_sections_access jsonb DEFAULT '[]'::jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed()
 AND public.uc_platform_document_action_allowed(auth.uid(),'write')
 AND public.can_access_organization(p_org,'staff.write') AND public.uc_document_scope_allowed(p_org,NULL,NULL)
 AND jsonb_typeof(coalesce(p_sections_access,'[]'))='array'
 AND (NOT ('documents.sign'=ANY(public.org_role_default_permissions(p_role)) OR coalesce(p_sections_access,'[]') ? 'documents.sign')
    OR public.uc_document_action_allowed(p_org,'sign',NULL,NULL))
 AND (NOT ('documents.issue'=ANY(public.org_role_default_permissions(p_role)) OR coalesce(p_sections_access,'[]') ? 'documents.issue')
    OR public.uc_document_action_allowed(p_org,'issue',NULL,NULL))
$fn$;
CREATE FUNCTION public.uc_guard_staff_document_grants() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_old_sign boolean:=false; v_old_issue boolean:=false; v_new_sign boolean; v_new_issue boolean;
BEGIN
 IF auth.role()='service_role' AND auth.uid() IS NULL THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed()
  OR NOT public.uc_platform_document_action_allowed(auth.uid(),'write')
  OR NOT public.can_access_organization(NEW.organization_id,'staff.write')
  OR NOT public.uc_document_scope_allowed(NEW.organization_id,NULL,NULL) THEN
  RAISE EXCEPTION 'Staff permission management denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(coalesce(NEW.sections_access,'[]'))<>'array' THEN RAISE EXCEPTION 'Unreviewed grant format' USING ERRCODE='22023'; END IF;
 IF TG_OP='UPDATE' AND (OLD.organization_id,OLD.user_id) IS NOT DISTINCT FROM (NEW.organization_id,NEW.user_id) THEN
  v_old_sign:='documents.sign'=ANY(public.org_role_default_permissions(OLD.role)) OR coalesce(OLD.sections_access,'[]') ? 'documents.sign';
  v_old_issue:='documents.issue'=ANY(public.org_role_default_permissions(OLD.role)) OR coalesce(OLD.sections_access,'[]') ? 'documents.issue';
 END IF;
 v_new_sign:='documents.sign'=ANY(public.org_role_default_permissions(NEW.role)) OR coalesce(NEW.sections_access,'[]') ? 'documents.sign';
 v_new_issue:='documents.issue'=ANY(public.org_role_default_permissions(NEW.role)) OR coalesce(NEW.sections_access,'[]') ? 'documents.issue';
 IF v_new_sign AND NOT v_old_sign AND NOT public.uc_document_action_allowed(NEW.organization_id,'sign',NULL,NULL) THEN
  RAISE EXCEPTION 'Cannot delegate document sign permission' USING ERRCODE='42501'; END IF;
 IF v_new_issue AND NOT v_old_issue AND NOT public.uc_document_action_allowed(NEW.organization_id,'issue',NULL,NULL) THEN
  RAISE EXCEPTION 'Cannot delegate document issue permission' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_guard_staff_document_grants() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER uc_staff_document_grant_guard BEFORE INSERT OR UPDATE OF role,sections_access,user_id,organization_id ON public.org_staff
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_staff_document_grants();

CREATE FUNCTION public.commit_org_staff_document_assignment(p_org uuid,p_user uuid,p_role text,p_display_name text,
 p_visibility text DEFAULT 'all',p_can_receive_crm_tasks boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF p_role NOT IN('admin','school_editor','course_editor','teacher','sales_manager') OR p_role IS NULL
  OR p_visibility NOT IN('all','course_only','hidden') OR p_visibility IS NULL OR p_user IS NULL
  OR NOT public.validate_org_staff_document_assignment(p_org,p_role,'[]'::jsonb)
  OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user) THEN
  RAISE EXCEPTION 'Staff assignment access denied' USING ERRCODE='42501'; END IF;
 -- SECURITY DEFINER preserves the management path for staff.write-only actors;
 -- the ordinary caller identity remains in auth.uid for effective-grant guards.
 INSERT INTO public.org_staff(organization_id,user_id,role,display_name,visibility,can_receive_crm_tasks)
 VALUES(p_org,p_user,p_role,left(coalesce(p_display_name,''),500),p_visibility,coalesce(p_can_receive_crm_tasks,false))
 ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,display_name=excluded.display_name,
  visibility=excluded.visibility,can_receive_crm_tasks=excluded.can_receive_crm_tasks;
 RETURN true;
END;$fn$;
REVOKE ALL ON FUNCTION public.commit_org_staff_document_assignment(uuid,uuid,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commit_org_staff_document_assignment(uuid,uuid,text,text,text,boolean) TO authenticated;

-- The old table policies trusted global admin alone. Without these narrow
-- guards a viewer could promote/delete its admin_staff row (legacy escape),
-- or mint another unrestricted admin through user_roles.
CREATE FUNCTION public.uc_guard_platform_document_role_delegation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_admin_change boolean:=false;
BEGIN
 IF auth.role()='service_role' AND auth.uid() IS NULL THEN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='admin_staff' THEN
  IF auth.uid() IS NULL OR NOT public.has_role('admin'::public.app_role,auth.uid())
    OR NOT public.uc_platform_document_action_allowed(auth.uid(),'write') THEN
   RAISE EXCEPTION 'Platform role delegation denied' USING ERRCODE='42501'; END IF;
 ELSE
  IF TG_OP IN ('UPDATE','DELETE') THEN v_admin_change:=OLD.role::text='admin'; END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN v_admin_change:=v_admin_change OR NEW.role::text='admin'; END IF;
  IF v_admin_change OR public.has_role('admin'::public.app_role,auth.uid()) THEN
   IF auth.uid() IS NULL OR NOT public.has_role('admin'::public.app_role,auth.uid())
     OR NOT public.uc_platform_document_action_allowed(auth.uid(),'write') THEN
    RAISE EXCEPTION 'Platform role delegation denied' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_guard_platform_document_role_delegation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER uc_platform_document_role_guard BEFORE INSERT OR UPDATE OR DELETE ON public.admin_staff
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_platform_document_role_delegation();
CREATE TRIGGER uc_platform_document_user_role_guard BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_platform_document_role_delegation();

CREATE FUNCTION public.uc_platform_document_storage_action_allowed(p_bucket text,p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.account_deletion_access_allowed() AND (
 public.uc_platform_document_action_allowed(auth.uid(),'write')
 OR p_bucket='student-documents' AND public.uc_document_storage_access(p_bucket,p_name,true) AND (
    public.storage_try_uuid(split_part(p_name,'/',1))=auth.uid()
    OR split_part(p_name,'/',1)='support' AND public.storage_try_uuid(split_part(p_name,'/',2))=auth.uid()
    OR split_part(p_name,'/',1)='avatars' AND public.storage_try_uuid(split_part(split_part(p_name,'/',2),'.',1))=auth.uid())
 OR p_bucket='external-contracts' AND EXISTS(SELECT 1 FROM public.document_signatures s
    WHERE s.recipient_user_id=auth.uid() AND s.deleted_at IS NULL AND s.expires_at>now()
    AND s.status IN('sent','viewed','in_review') AND
    left(p_name,length(s.organization_id::text||'/signed-scans/'||s.id::text||'-'))=s.organization_id::text||'/signed-scans/'||s.id::text||'-')
 -- Existing external-contract uploader stages a random UUID file before its
 -- invitation exists; only the commercial sender workflow may use this key.
 OR p_bucket='external-contracts' AND p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.][A-Za-z0-9]+$'
    AND public.uc_document_commercial_creation_allowed(public.storage_try_uuid(split_part(p_name,'/',1))))
$fn$;
REVOKE ALL ON FUNCTION public.uc_platform_document_storage_action_allowed(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.uc_platform_document_storage_action_allowed(text,text) TO authenticated,service_role;
CREATE POLICY uc_platform_document_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id NOT IN('student-documents','company-documents','org-documents','signed-documents','external-contracts','billing-documents','frdo-documents','issued-documents')
  OR public.uc_platform_document_storage_action_allowed(bucket_id,name));
CREATE POLICY uc_platform_document_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id NOT IN('student-documents','company-documents','org-documents','signed-documents','external-contracts','billing-documents','frdo-documents','issued-documents')
  OR public.uc_platform_document_storage_action_allowed(bucket_id,name))
 WITH CHECK(bucket_id NOT IN('student-documents','company-documents','org-documents','signed-documents','external-contracts','billing-documents','frdo-documents','issued-documents')
  OR public.uc_platform_document_storage_action_allowed(bucket_id,name));
CREATE POLICY uc_platform_document_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id NOT IN('student-documents','company-documents','org-documents','signed-documents','external-contracts','billing-documents','frdo-documents','issued-documents')
  OR public.uc_platform_document_storage_action_allowed(bucket_id,name));

DO $issuer$ DECLARE source text; replacement text;
BEGIN
 source:=pg_get_functiondef('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure);
 replacement:=replace(source,'IF NOT public.uc_document_org_access(p_organization_id,true) THEN',
  'IF NOT public.uc_document_has_action(p_organization_id,''issue'') THEN');
 IF source=replacement THEN RAISE EXCEPTION 'Unreviewed released issuer entry'; END IF;
 source:=replacement;
 replacement:=replace(source,'v_enrollment_id := NULLIF(v_item->>''enrollment_id'', '''')::uuid;',
  'v_enrollment_id := NULLIF(v_item->>''enrollment_id'', '''')::uuid;'||chr(10)||
  '    IF NOT public.uc_document_action_allowed(p_organization_id,''issue'',p_group_id,v_enrollment_id) THEN RAISE EXCEPTION ''Issuance scope denied'' USING ERRCODE=''42501''; END IF;');
 IF source=replacement THEN RAISE EXCEPTION 'Unreviewed released issuer item binding'; END IF;
 EXECUTE replacement;
END;$issuer$;
REVOKE ALL ON FUNCTION public.reserve_group_document_number(uuid,uuid,text,integer),public.get_next_document_number(uuid,text,integer),public.sender_countersign(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_group_document_number(uuid,uuid,text,integer),public.get_next_document_number(uuid,text,integer),public.sender_countersign(uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.reserve_education_registration_number(uuid,uuid,text,integer),public.next_reg_number(uuid,text,integer),
 public.set_org_staff_document_grants(uuid,uuid,text,jsonb,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_education_registration_number(uuid,uuid,text,integer),public.next_reg_number(uuid,text,integer),
 public.set_org_staff_document_grants(uuid,uuid,text,jsonb,boolean,boolean) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_org_staff_document_grants(uuid,uuid),public.validate_org_staff_document_assignment(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_org_staff_document_grants(uuid,uuid),public.validate_org_staff_document_assignment(uuid,text,jsonb) TO authenticated,service_role;
