-- UC-002/003/005. Permissions only; no document rows, blobs or numbers are migrated.
-- Baseline: production metadata SELECT 2026-10-18. Unknown drift aborts atomically.
BEGIN;
DO $preflight$
DECLARE actual jsonb;
BEGIN
 IF md5(pg_get_functiondef('public.can_access_organization(uuid,text)'::regprocedure)) <> '2e11495f3d3e6ca261af8a08ed874269'
 OR md5(pg_get_functiondef('public.get_next_document_number(uuid,text,integer)'::regprocedure)) <> '7e9e645840a9dc05cc9ec98322927444'
 OR md5(pg_get_functiondef('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure)) <> '304262a513c4aded799f0bec0524292d'
 OR md5(pg_get_functiondef('public.create_group_document_batch(uuid,uuid,jsonb)'::regprocedure)) <> '8298673e0ecb017fffc3698d0fc6d687'
 THEN RAISE EXCEPTION 'UC document access: unreviewed function baseline'; END IF;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname COLLATE "C",tablename COLLATE "C",policyname COLLATE "C") INTO actual
 FROM pg_policies p WHERE permissive='PERMISSIVE' AND (
 (schemaname='public' AND tablename=ANY(ARRAY['org_documents','incoming_documents','education_document_records','document_issuance_log','program_documents','program_folders','program_categories','program_training_plans','frdo_signed_documents','student_documents','student_identity_documents','company_documents','group_documents']))
 OR(schemaname='storage' AND tablename='objects' AND (coalesce(qual,'')||coalesce(with_check,'')) ~ '(student-documents|company-documents)'));
 IF actual IS DISTINCT FROM $baseline$[{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Companies can view own documents","qual":"(company_id = current_company_id())","roles":["authenticated"],"schemaname":"public","tablename":"company_documents","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage company documents","qual":"(EXISTS ( SELECT 1\n   FROM companies c\n  WHERE ((c.id = company_documents.company_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))","roles":["public"],"schemaname":"public","tablename":"company_documents","with_check":"(EXISTS ( SELECT 1\n   FROM companies c\n  WHERE ((c.id = company_documents.company_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org users can view company documents","qual":"(EXISTS ( SELECT 1\n   FROM companies c\n  WHERE ((c.id = company_documents.company_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))","roles":["public"],"schemaname":"public","tablename":"company_documents","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage document issuance logs","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"document_issuance_log","with_check":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Org users can delete their education documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"education_document_records","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Org users can insert education documents","qual":null,"roles":["public"],"schemaname":"public","tablename":"education_document_records","with_check":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))"},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Org users can update their education documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"education_document_records","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org users can view their education documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"education_document_records","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Org members can insert documents","qual":null,"roles":["public"],"schemaname":"public","tablename":"frdo_signed_documents","with_check":"(organization_id = current_organization_id())"},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Org members can update their documents","qual":"(organization_id = current_organization_id())","roles":["public"],"schemaname":"public","tablename":"frdo_signed_documents","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org members can view their documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"frdo_signed_documents","with_check":null},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Org staff can delete group documents","qual":"(can_access_organization(organization_id) OR has_role(auth.uid(), 'admin'::app_role))","roles":["authenticated"],"schemaname":"public","tablename":"group_documents","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org staff can view group documents","qual":"(can_access_organization(organization_id) OR has_role(auth.uid(), 'admin'::app_role))","roles":["authenticated"],"schemaname":"public","tablename":"group_documents","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org members manage own incoming documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["authenticated"],"schemaname":"public","tablename":"incoming_documents","with_check":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))"},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage org documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"org_documents","with_check":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))"},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Users can create program categories for their org","qual":null,"roles":["public"],"schemaname":"public","tablename":"program_categories","with_check":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Users can delete program categories for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_categories","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Users can update program categories for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_categories","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Users can view program categories for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_categories","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Users can create program documents for their org","qual":null,"roles":["public"],"schemaname":"public","tablename":"program_documents","with_check":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Users can delete program documents for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_documents","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Users can update program documents for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_documents","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Users can view program documents for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_documents","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Users can create program folders for their org","qual":null,"roles":["public"],"schemaname":"public","tablename":"program_folders","with_check":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Users can delete program folders for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_folders","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Users can update program folders for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_folders","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Users can view program folders for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_folders","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org members manage own training plans","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["authenticated"],"schemaname":"public","tablename":"program_training_plans","with_check":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))"},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage student documents","qual":"(EXISTS ( SELECT 1\n   FROM (enrollments e\n     JOIN courses c ON ((c.id = e.course_id)))\n  WHERE ((e.id = student_documents.enrollment_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))","roles":["authenticated"],"schemaname":"public","tablename":"student_documents","with_check":"(EXISTS ( SELECT 1\n   FROM (enrollments e\n     JOIN courses c ON ((c.id = e.course_id)))\n  WHERE ((e.id = student_documents.enrollment_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Users can view own documents","qual":"(EXISTS ( SELECT 1\n   FROM enrollments e\n  WHERE ((e.id = student_documents.enrollment_id) AND (e.user_id = auth.uid()))))","roles":["authenticated"],"schemaname":"public","tablename":"student_documents","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage student identity documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["authenticated"],"schemaname":"public","tablename":"student_identity_documents","with_check":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Students can delete own identity documents","qual":"(user_id = auth.uid())","roles":["authenticated"],"schemaname":"public","tablename":"student_identity_documents","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Students can insert own identity documents","qual":null,"roles":["authenticated"],"schemaname":"public","tablename":"student_identity_documents","with_check":"(user_id = auth.uid())"},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Students can update own identity documents","qual":"(user_id = auth.uid())","roles":["authenticated"],"schemaname":"public","tablename":"student_identity_documents","with_check":"(user_id = auth.uid())"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Students can view own identity documents","qual":"(user_id = auth.uid())","roles":["authenticated"],"schemaname":"public","tablename":"student_identity_documents","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Admins can manage all student docs storage","qual":"((bucket_id = 'student-documents'::text) AND has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Org users can delete company documents","qual":"((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.user_id = auth.uid()) AND (p.organization_id IS NOT NULL)))))","roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Org users can delete company documents storage","qual":"((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1\n   FROM (companies c\n     JOIN profiles p ON ((p.organization_id = c.organization_id)))\n  WHERE (((c.id)::text = (storage.foldername(c.name))[1]) AND (p.user_id = auth.uid())))))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage student docs storage","qual":"((bucket_id = 'student-documents'::text) AND has_role('organization'::app_role, auth.uid()))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Org users can update company documents","qual":"((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.user_id = auth.uid()) AND (p.organization_id IS NOT NULL)))))","roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Org users can upload company documents","qual":null,"roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":"((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.user_id = auth.uid()) AND (p.organization_id IS NOT NULL)))))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org users can view company documents","qual":"((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.user_id = auth.uid()) AND (p.organization_id IS NOT NULL)))))","roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org users can view company documents storage","qual":"((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1\n   FROM (companies c\n     JOIN profiles p ON ((p.organization_id = c.organization_id)))\n  WHERE (((c.id)::text = (storage.foldername(c.name))[1]) AND (p.user_id = auth.uid())))))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Organization users can delete their company documents","qual":"((bucket_id = 'company-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1\n   FROM (profiles p\n     JOIN companies c ON ((c.organization_id = p.organization_id)))\n  WHERE ((p.user_id = auth.uid()) AND ((c.id)::text = split_part(c.name, '/'::text, 1))))))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Organization users can update their company documents","qual":"((bucket_id = 'company-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1\n   FROM (profiles p\n     JOIN companies c ON ((c.organization_id = p.organization_id)))\n  WHERE ((p.user_id = auth.uid()) AND ((c.id)::text = split_part(c.name, '/'::text, 1))))))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Organization users can upload company documents","qual":null,"roles":["public"],"schemaname":"storage","tablename":"objects","with_check":"((bucket_id = 'company-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1\n   FROM (profiles p\n     JOIN companies c ON ((c.organization_id = p.organization_id)))\n  WHERE ((p.user_id = auth.uid()) AND ((c.id)::text = split_part(c.name, '/'::text, 1))))))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Organization users can view their company documents","qual":"((bucket_id = 'company-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1\n   FROM (profiles p\n     JOIN companies c ON ((c.organization_id = p.organization_id)))\n  WHERE ((p.user_id = auth.uid()) AND ((c.id)::text = split_part(c.name, '/'::text, 1))))))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Students can delete own documents","qual":"((bucket_id = 'student-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))","roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Students can upload own documents","qual":null,"roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":"((bucket_id = 'student-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Students can view own documents","qual":"((bucket_id = 'student-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))","roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Students can view own documents storage","qual":"((bucket_id = 'student-documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null}]$baseline$::jsonb
 THEN RAISE EXCEPTION 'UC document access: unreviewed permissive policy baseline'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['org_documents','incoming_documents','education_document_records','document_issuance_log','program_documents','program_folders','program_categories','program_training_plans','frdo_signed_documents','student_documents','student_identity_documents','company_documents','group_documents']) t(name)
 WHERE NOT EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.name AND p.policyname='account_deletion_no_revoked_access' AND p.permissive='RESTRICTIVE'))
 THEN RAISE EXCEPTION 'UC document access: missing account deletion fence'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['org_documents','incoming_documents','education_document_records','document_issuance_log','program_documents','program_folders','program_categories','program_training_plans','frdo_signed_documents','student_documents','student_identity_documents','company_documents','group_documents']) t(name)
   WHERE NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t.name))
 OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
 THEN RAISE EXCEPTION 'UC document access: RLS disabled'; END IF;
 IF (SELECT count(*) FROM storage.buckets WHERE id IN('student-documents','company-documents') AND public=false)<>2
 THEN RAISE EXCEPTION 'UC document access requires both private buckets'; END IF;
END
$preflight$;

-- Browser uploads must use the same document permission as the PDF renderer.
-- Keep every existing read/update/delete and special issued-artifact restriction.
DO $billing_preflight$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
   AND policyname='Org users can upload billing documents' AND cmd='INSERT'
   AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[]
   AND with_check='((bucket_id = ''billing-documents''::text) AND ((storage.foldername(name))[1] = (current_organization_id())::text))')
 OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='billing-documents' AND public=false)
 THEN RAISE EXCEPTION 'UC billing upload: unreviewed baseline'; END IF;
END
$billing_preflight$;

-- Shared predicate adds active account to the existing canonical owner/staff gate.
CREATE FUNCTION public.uc_document_org_access(p_org uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed()
 AND coalesce(public.can_access_organization(p_org,CASE WHEN p_write THEN 'documents.write' ELSE 'documents.read' END),false);
$fn$;
CREATE FUNCTION public.uc_document_enrollment_access(p_enrollment uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND EXISTS(
 SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id
 WHERE e.id=p_enrollment AND (public.uc_document_org_access(c.organization_id,p_write)
 OR(NOT p_write AND e.user_id=auth.uid())));
$fn$;
CREATE FUNCTION public.uc_document_owns_enrollment(p_enrollment uuid,p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND EXISTS(
 SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id
 WHERE e.id=p_enrollment AND e.user_id=auth.uid() AND c.organization_id=p_org);
$fn$;
CREATE FUNCTION public.uc_document_company_access(p_company uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND EXISTS(
 SELECT 1 FROM public.companies c WHERE c.id=p_company AND (
 public.uc_document_org_access(c.organization_id,p_write) OR(NOT p_write AND c.user_id=auth.uid())));
$fn$;
CREATE FUNCTION public.uc_document_student_in_org(p_user uuid,p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed()
 AND (p_user=auth.uid() OR public.uc_document_org_access(p_org,false) OR public.uc_document_org_access(p_org,true))
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.organization_id=p_org)
 AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.organization_id IS DISTINCT FROM p_org);
$fn$;

-- Existing object identities come from exact paths/references, never uploader's current org.
-- An orphan company prefix is not an organization: only platform admin can inspect it.
CREATE FUNCTION public.uc_document_storage_access(p_bucket text,p_name text,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_user uuid:=auth.uid(); v_target uuid; v_orgs uuid[]; v_org uuid;
BEGIN
 IF v_user IS NULL OR NOT public.account_deletion_access_allowed()
 OR p_bucket IS NULL OR p_name IS NULL OR p_name='' OR left(p_name,1)='/'
 OR p_name ~ '(^|/)[.]{1,2}(/|$)' OR position(chr(92) IN p_name)>0
 OR p_name ~ '[?#]' OR p_name ~* '%(2f|5c|2e)' OR position('//' IN p_name)>0 THEN RETURN false; END IF;
 IF p_bucket NOT IN('student-documents','company-documents') THEN RETURN false; END IF;
 IF public.has_role('admin'::public.app_role,v_user) THEN RETURN true; END IF;
 IF p_bucket='company-documents' THEN
  v_target:=public.storage_try_uuid(split_part(p_name,'/',1));
  RETURN split_part(p_name,'/',2)<>'' AND public.uc_document_company_access(v_target,p_write);
 END IF;
 IF split_part(p_name,'/',1)='students' THEN
  v_target:=public.storage_try_uuid(split_part(p_name,'/',2));
  RETURN split_part(p_name,'/',3)<>'' AND public.uc_document_enrollment_access(v_target,p_write);
 ELSIF split_part(p_name,'/',1)='avatars' THEN
  IF p_name !~ '^avatars/[0-9A-Fa-f-]{36}[.][A-Za-z0-9]+$' THEN RETURN false; END IF;
  v_target:=public.storage_try_uuid(split_part(split_part(p_name,'/',2),'.',1));
 ELSIF split_part(p_name,'/',1)='support' THEN
  v_target:=public.storage_try_uuid(split_part(p_name,'/',2));
  RETURN v_target=v_user AND split_part(p_name,'/',3)<>'';
 ELSE
  v_target:=public.storage_try_uuid(split_part(p_name,'/',1));
  IF split_part(p_name,'/',2)='' THEN RETURN false; END IF;
 END IF;
 IF v_target IS NULL OR EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=v_target) THEN RETURN false; END IF;
 IF v_target=v_user THEN RETURN true; END IF;
 SELECT array_agg(DISTINCT scoped.org) INTO v_orgs FROM (
  SELECT p.organization_id AS org FROM public.profiles p WHERE p.user_id=v_target
  UNION ALL
  SELECT d.organization_id FROM public.student_identity_documents d WHERE d.user_id=v_target
  AND (d.file_path=p_name OR d.file_url=p_name
    OR right(split_part(d.file_url,'?',1),length('/student-documents/'||p_name))='/student-documents/'||p_name)
 ) scoped WHERE scoped.org IS NOT NULL;
 IF cardinality(v_orgs) IS DISTINCT FROM 1 THEN RETURN false; END IF;
 v_org:=v_orgs[1];
 RETURN public.uc_document_org_access(v_org,p_write);
END
$fn$;

CREATE FUNCTION public.uc_document_billing_upload_access(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_org uuid; v_filename text;
BEGIN
 IF auth.uid() IS NULL OR p_name IS NULL OR p_name='' OR left(p_name,1)='/'
 OR p_name ~ '(^|/)[.]{1,2}(/|$)' OR position(chr(92) IN p_name)>0
 OR p_name ~ '[?#]' OR p_name ~* '%(2f|5c|2e)' OR position('//' IN p_name)>0
 THEN RETURN false; END IF;
 IF split_part(p_name,'/',1)='organizations' THEN
  v_org:=public.storage_try_uuid(split_part(p_name,'/',2));
  v_filename:=split_part(p_name,'/',3);
 ELSE
  v_org:=public.storage_try_uuid(split_part(p_name,'/',1));
  v_filename:=split_part(p_name,'/',2);
 END IF;
 RETURN v_org IS NOT NULL AND v_filename<>''
   AND EXISTS(SELECT 1 FROM public.organizations WHERE id=v_org)
   AND public.uc_document_org_access(v_org,true);
END
$fn$;
REVOKE ALL ON FUNCTION public.uc_document_billing_upload_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uc_document_billing_upload_access(text) TO anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.uc_document_org_access(uuid,boolean),
 public.uc_document_enrollment_access(uuid,boolean),public.uc_document_owns_enrollment(uuid,uuid),
 public.uc_document_company_access(uuid,boolean),public.uc_document_student_in_org(uuid,uuid),
 public.uc_document_storage_access(text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.uc_document_org_access(uuid,boolean),
 public.uc_document_enrollment_access(uuid,boolean),public.uc_document_owns_enrollment(uuid,uuid),
 public.uc_document_company_access(uuid,boolean),public.uc_document_student_in_org(uuid,uuid),
 public.uc_document_storage_access(text,text,boolean) TO authenticated,service_role;
-- RLS must be evaluable for anon on unrelated buckets; the predicate explicitly returns false without auth.
GRANT EXECUTE ON FUNCTION public.uc_document_storage_access(text,text,boolean) TO anon;

DO $policies$
DECLARE r record; t text; read_expr text; write_expr text;
BEGIN
 FOR r IN SELECT * FROM pg_policies WHERE permissive='PERMISSIVE' AND (
  (schemaname='public' AND tablename=ANY(ARRAY['org_documents','incoming_documents','education_document_records','document_issuance_log','program_documents','program_folders','program_categories','program_training_plans','frdo_signed_documents','student_documents','student_identity_documents','company_documents','group_documents']))
  OR(schemaname='storage' AND tablename='objects' AND (coalesce(qual,'')||coalesce(with_check,''))~'(student-documents|company-documents)'))
 LOOP EXECUTE format('DROP POLICY %I ON %I.%I',r.policyname,r.schemaname,r.tablename); END LOOP;
 FOREACH t IN ARRAY ARRAY['org_documents','incoming_documents','education_document_records','document_issuance_log','program_documents','program_folders','program_categories','program_training_plans','frdo_signed_documents','student_documents','student_identity_documents','company_documents','group_documents']
 LOOP
  read_expr:='public.uc_document_org_access(organization_id,false)';
  write_expr:='public.uc_document_org_access(organization_id,true)';
  IF t IN('education_document_records','document_issuance_log') THEN
   read_expr:=read_expr||' OR (auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND user_id=auth.uid()) OR public.uc_document_owns_enrollment(enrollment_id,organization_id)';
  ELSIF t='student_documents' THEN
   read_expr:='public.uc_document_enrollment_access(enrollment_id,false)';
   write_expr:='public.uc_document_enrollment_access(enrollment_id,true)';
  ELSIF t='student_identity_documents' THEN
   read_expr:=read_expr||' OR (auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND user_id=auth.uid())';
   write_expr:='(public.uc_document_org_access(organization_id,true) OR (auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND user_id=auth.uid())) AND public.uc_document_student_in_org(user_id,organization_id)';
  ELSIF t='company_documents' THEN
   read_expr:='public.uc_document_company_access(company_id,false)';
   write_expr:='public.uc_document_company_access(company_id,true)';
  END IF;
  EXECUTE format('CREATE POLICY uc_documents_select ON public.%I FOR SELECT TO authenticated USING (%s)',t,read_expr);
  -- group document inserts/updates stay RPC-only; FRDO has never permitted DELETE.
  IF t<>'group_documents' THEN
   EXECUTE format('CREATE POLICY uc_documents_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',t,write_expr);
   EXECUTE format('CREATE POLICY uc_documents_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',t,write_expr,write_expr);
  END IF;
  IF t<>'frdo_signed_documents' THEN
   EXECUTE format('CREATE POLICY uc_documents_delete ON public.%I FOR DELETE TO authenticated USING (%s)',t,write_expr);
  END IF;
 END LOOP;
END
$policies$;

DROP POLICY "Org users can upload billing documents" ON storage.objects;
CREATE POLICY uc_billing_document_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='billing-documents' AND public.uc_document_billing_upload_access(name));
CREATE POLICY uc_billing_document_upload_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(bucket_id<>'billing-documents' OR public.uc_document_billing_upload_access(name));

-- Both permissive and restrictive gates: unrelated broad storage policies cannot OR-bypass them.
CREATE POLICY uc_document_objects_select ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id IN('student-documents','company-documents') AND public.uc_document_storage_access(bucket_id,name,false));
CREATE POLICY uc_document_objects_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id IN('student-documents','company-documents') AND public.uc_document_storage_access(bucket_id,name,true));
CREATE POLICY uc_document_objects_update ON storage.objects FOR UPDATE TO authenticated
 USING(bucket_id IN('student-documents','company-documents') AND public.uc_document_storage_access(bucket_id,name,true))
 WITH CHECK(bucket_id IN('student-documents','company-documents') AND public.uc_document_storage_access(bucket_id,name,true));
CREATE POLICY uc_document_objects_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id IN('student-documents','company-documents') AND public.uc_document_storage_access(bucket_id,name,true));
CREATE POLICY uc_document_objects_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(bucket_id NOT IN('student-documents','company-documents') OR public.uc_document_storage_access(bucket_id,name,false));
CREATE POLICY uc_document_objects_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
 WITH CHECK(bucket_id NOT IN('student-documents','company-documents') OR public.uc_document_storage_access(bucket_id,name,true));
CREATE POLICY uc_document_objects_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(bucket_id NOT IN('student-documents','company-documents') OR public.uc_document_storage_access(bucket_id,name,true))
 WITH CHECK(bucket_id NOT IN('student-documents','company-documents') OR public.uc_document_storage_access(bucket_id,name,true));
CREATE POLICY uc_document_objects_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
 USING(bucket_id NOT IN('student-documents','company-documents') OR public.uc_document_storage_access(bucket_id,name,true));

-- Patch only authorization. Preserve issuance, multigroup membership, locks and idempotency.
DO $rpc$
DECLARE source text; replacement text;
BEGIN
 source:=pg_get_functiondef('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure);
 replacement:=replace(source,
  'IF NOT (has_role(''admin''::app_role, auth.uid()) OR p_organization_id = current_organization_id()) THEN',
  'IF NOT public.uc_document_org_access(p_organization_id,true) THEN');
 IF replacement=source THEN RAISE EXCEPTION 'UC issue gate patch did not match'; END IF;
 EXECUTE replacement;
 source:=pg_get_functiondef('public.create_group_document_batch(uuid,uuid,jsonb)'::regprocedure);
 replacement:=replace(source,
  'IF v_uid IS NULL THEN RAISE EXCEPTION ''not authenticated''; END IF;',
  'IF NOT public.uc_document_org_access(p_organization_id,true) THEN RAISE EXCEPTION ''Document write permission required'' USING ERRCODE=''42501''; END IF;');
 IF replacement=source THEN RAISE EXCEPTION 'UC group batch gate patch did not match'; END IF;
 EXECUTE replacement;
 source:=pg_get_functiondef('public.get_next_document_number(uuid,text,integer)'::regprocedure);
 replacement:=replace(source,
  'IF NOT (has_role(''admin''::app_role, auth.uid())'||chr(10)||'          OR p_org = current_organization_id()) THEN',
  'IF NOT public.uc_document_org_access(p_org,true) THEN');
 IF replacement=source THEN RAISE EXCEPTION 'UC numbering gate patch did not match'; END IF;
 EXECUTE replacement;
END
$rpc$;
REVOKE ALL ON FUNCTION public.get_next_document_number(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_next_document_number(uuid,text,integer) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.issue_education_document_batch(uuid,uuid,uuid,jsonb),
 public.create_group_document_batch(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_education_document_batch(uuid,uuid,uuid,jsonb),
 public.create_group_document_batch(uuid,uuid,jsonb) TO authenticated,service_role;

DO $postcheck$
BEGIN
 IF has_function_privilege('anon','public.get_next_document_number(uuid,text,integer)','EXECUTE')
 OR has_function_privilege('anon','public.issue_education_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('anon','public.create_group_document_batch(uuid,uuid,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'UC document access: anonymous RPC privilege remains'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
 AND policyname IN('uc_document_objects_read_guard','uc_document_objects_insert_guard','uc_document_objects_update_guard','uc_document_objects_delete_guard')
 AND permissive='RESTRICTIVE')<>4 THEN RAISE EXCEPTION 'UC document storage guard missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
   AND policyname='uc_billing_document_upload_guard' AND permissive='RESTRICTIVE' AND cmd='INSERT')
 THEN RAISE EXCEPTION 'UC billing upload guard missing'; END IF;
END
$postcheck$;
COMMIT;

