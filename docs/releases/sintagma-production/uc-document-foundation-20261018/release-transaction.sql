-- Generated exact-source UC release. Submit the ENTIRE file as ONE SQL request.
-- Prepared only: this generator never connects to production.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $check$ DECLARE result jsonb; BEGIN SELECT to_jsonb(q) INTO result FROM (SELECT
 (md5(pg_get_functiondef('public.can_access_organization(uuid,text)'::regprocedure)) = '2e11495f3d3e6ca261af8a08ed874269'
 AND md5(pg_get_functiondef('public.get_next_document_number(uuid,text,integer)'::regprocedure)) = '7e9e645840a9dc05cc9ec98322927444'
 AND md5(pg_get_functiondef('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure)) = '304262a513c4aded799f0bec0524292d'
 AND md5(pg_get_functiondef('public.create_group_document_batch(uuid,uuid,jsonb)'::regprocedure)) = '8298673e0ecb017fffc3698d0fc6d687') AS access_functions_match,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid))) ORDER BY p.oid::regprocedure::text COLLATE "C"),'[]'::jsonb)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('uc_signature_actor_allowed','uc_guard_signature_integrity','uc_guard_signature_revision','uc_guard_pep_evidence','uc_signature_token_access_allowed','get_signature_by_token','get_signature_revisions_by_token','get_signature_comments_by_token','uc_guard_signature_comment','uc_finalize_signature','revoke_signature','sender_countersign','request_signature_changes','uc_signature_storage_read','uc_signature_storage_write','uc_guard_document_version_write','uc_guard_document_pointer','uc_snapshot_inserted_document','commit_org_document_version','uc_org_document_blob_committed'))=$functions$[{"signature":"get_signature_by_token(text)","md5":"e750e89bda71b9c31c1288889ba58fa2"},{"signature":"get_signature_comments_by_token(text)","md5":"b32624785f22bf7afb877090127b5910"},{"signature":"get_signature_revisions_by_token(text)","md5":"7971cf6ee8c28563618de4e1cefec527"},{"signature":"request_signature_changes(text,text)","md5":"ee803c3a6afdc1d2f04d6db160128640"},{"signature":"revoke_signature(uuid,text)","md5":"6a5d4d54a3327040e7820dee42899b1b"},{"signature":"sender_countersign(uuid,text,text)","md5":"a6a998b9211cf4facc679c1293962cb1"}]$functions$::jsonb AS signature_functions_match,
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename COLLATE "C",policyname COLLATE "C") FROM pg_policies p
  WHERE schemaname='public' AND tablename IN('document_signatures','signature_revisions','signature_comments','pep_agreements','org_document_versions'))=$policies$[{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Admins manage all document_signatures","qual":"has_role('admin'::app_role, auth.uid())","roles":["public"],"schemaname":"public","tablename":"document_signatures","with_check":"has_role('admin'::app_role, auth.uid())"},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org manages its document_signatures","qual":"(organization_id = current_organization_id())","roles":["public"],"schemaname":"public","tablename":"document_signatures","with_check":"(organization_id = current_organization_id())"},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Recipient can update status own","qual":"(recipient_user_id = auth.uid())","roles":["public"],"schemaname":"public","tablename":"document_signatures","with_check":"(recipient_user_id = auth.uid())"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Recipient can view own document_signatures","qual":"(recipient_user_id = auth.uid())","roles":["public"],"schemaname":"public","tablename":"document_signatures","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"document_signatures","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Org members delete document versions","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"org_document_versions","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Org members insert document versions","qual":null,"roles":["public"],"schemaname":"public","tablename":"org_document_versions","with_check":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org members view document versions","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"org_document_versions","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"org_document_versions","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Admins can view all pep_agreements","qual":"has_role('admin'::app_role, auth.uid())","roles":["public"],"schemaname":"public","tablename":"pep_agreements","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Anyone authenticated can insert own pep_agreement","qual":null,"roles":["public"],"schemaname":"public","tablename":"pep_agreements","with_check":"((user_id = auth.uid()) OR (user_id IS NULL))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org sees its pep_agreements","qual":"(organization_id = current_organization_id())","roles":["public"],"schemaname":"public","tablename":"pep_agreements","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"User sees own pep_agreements","qual":"(user_id = auth.uid())","roles":["public"],"schemaname":"public","tablename":"pep_agreements","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"pep_agreements","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Insert comments by participants","qual":null,"roles":["public"],"schemaname":"public","tablename":"signature_comments","with_check":"(EXISTS ( SELECT 1\n   FROM document_signatures ds\n  WHERE ((ds.id = signature_comments.signature_id) AND ((ds.sender_user_id = auth.uid()) OR (ds.recipient_user_id = auth.uid()) OR (ds.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))"},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Update comments by author or sender","qual":"((author_user_id = auth.uid()) OR (EXISTS ( SELECT 1\n   FROM document_signatures ds\n  WHERE ((ds.id = signature_comments.signature_id) AND ((ds.sender_user_id = auth.uid()) OR (ds.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))))))","roles":["public"],"schemaname":"public","tablename":"signature_comments","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"View comments if can view signature","qual":"(EXISTS ( SELECT 1\n   FROM document_signatures ds\n  WHERE ((ds.id = signature_comments.signature_id) AND ((ds.sender_user_id = auth.uid()) OR (ds.recipient_user_id = auth.uid()) OR (ds.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))","roles":["public"],"schemaname":"public","tablename":"signature_comments","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"signature_comments","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Insert revisions by sender or admin","qual":null,"roles":["public"],"schemaname":"public","tablename":"signature_revisions","with_check":"(EXISTS ( SELECT 1\n   FROM document_signatures ds\n  WHERE ((ds.id = signature_revisions.signature_id) AND ((ds.sender_user_id = auth.uid()) OR (ds.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"View revisions if can view signature","qual":"(EXISTS ( SELECT 1\n   FROM document_signatures ds\n  WHERE ((ds.id = signature_revisions.signature_id) AND ((ds.sender_user_id = auth.uid()) OR (ds.recipient_user_id = auth.uid()) OR (ds.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))","roles":["public"],"schemaname":"public","tablename":"signature_revisions","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"signature_revisions","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"}]$policies$::jsonb AS signature_version_policies_match,
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname COLLATE "C",tablename COLLATE "C",policyname COLLATE "C") FROM pg_policies p WHERE permissive='PERMISSIVE' AND (
  schemaname='public' AND tablename IN('org_documents','incoming_documents','education_document_records','document_issuance_log','program_documents','program_folders','program_categories','program_training_plans','frdo_signed_documents','student_documents','student_identity_documents','company_documents','group_documents') OR schemaname='storage' AND tablename='objects' AND (coalesce(qual,'')||coalesce(with_check,''))~'(student-documents|company-documents)'))=$access$[{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Companies can view own documents","qual":"(company_id = current_company_id())","roles":["authenticated"],"schemaname":"public","tablename":"company_documents","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage company documents","qual":"(EXISTS ( SELECT 1\n   FROM companies c\n  WHERE ((c.id = company_documents.company_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))","roles":["public"],"schemaname":"public","tablename":"company_documents","with_check":"(EXISTS ( SELECT 1\n   FROM companies c\n  WHERE ((c.id = company_documents.company_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org users can view company documents","qual":"(EXISTS ( SELECT 1\n   FROM companies c\n  WHERE ((c.id = company_documents.company_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))","roles":["public"],"schemaname":"public","tablename":"company_documents","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage document issuance logs","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"document_issuance_log","with_check":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Org users can delete their education documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"education_document_records","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Org users can insert education documents","qual":null,"roles":["public"],"schemaname":"public","tablename":"education_document_records","with_check":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))"},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Org users can update their education documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"education_document_records","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org users can view their education documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"education_document_records","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Org members can insert documents","qual":null,"roles":["public"],"schemaname":"public","tablename":"frdo_signed_documents","with_check":"(organization_id = current_organization_id())"},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Org members can update their documents","qual":"(organization_id = current_organization_id())","roles":["public"],"schemaname":"public","tablename":"frdo_signed_documents","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org members can view their documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"frdo_signed_documents","with_check":null},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Org staff can delete group documents","qual":"(can_access_organization(organization_id) OR has_role(auth.uid(), 'admin'::app_role))","roles":["authenticated"],"schemaname":"public","tablename":"group_documents","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org staff can view group documents","qual":"(can_access_organization(organization_id) OR has_role(auth.uid(), 'admin'::app_role))","roles":["authenticated"],"schemaname":"public","tablename":"group_documents","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org members manage own incoming documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["authenticated"],"schemaname":"public","tablename":"incoming_documents","with_check":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))"},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage org documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"org_documents","with_check":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))"},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Users can create program categories for their org","qual":null,"roles":["public"],"schemaname":"public","tablename":"program_categories","with_check":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Users can delete program categories for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_categories","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Users can update program categories for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_categories","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Users can view program categories for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_categories","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Users can create program documents for their org","qual":null,"roles":["public"],"schemaname":"public","tablename":"program_documents","with_check":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Users can delete program documents for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_documents","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Users can update program documents for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_documents","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Users can view program documents for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_documents","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Users can create program folders for their org","qual":null,"roles":["public"],"schemaname":"public","tablename":"program_folders","with_check":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Users can delete program folders for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_folders","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Users can update program folders for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_folders","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Users can view program folders for their org","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"program_folders","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org members manage own training plans","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["authenticated"],"schemaname":"public","tablename":"program_training_plans","with_check":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))"},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage student documents","qual":"(EXISTS ( SELECT 1\n   FROM (enrollments e\n     JOIN courses c ON ((c.id = e.course_id)))\n  WHERE ((e.id = student_documents.enrollment_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))","roles":["authenticated"],"schemaname":"public","tablename":"student_documents","with_check":"(EXISTS ( SELECT 1\n   FROM (enrollments e\n     JOIN courses c ON ((c.id = e.course_id)))\n  WHERE ((e.id = student_documents.enrollment_id) AND ((c.organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid())))))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Users can view own documents","qual":"(EXISTS ( SELECT 1\n   FROM enrollments e\n  WHERE ((e.id = student_documents.enrollment_id) AND (e.user_id = auth.uid()))))","roles":["authenticated"],"schemaname":"public","tablename":"student_documents","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage student identity documents","qual":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))","roles":["authenticated"],"schemaname":"public","tablename":"student_identity_documents","with_check":"((organization_id = current_organization_id()) OR has_role('admin'::app_role, auth.uid()))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Students can delete own identity documents","qual":"(user_id = auth.uid())","roles":["authenticated"],"schemaname":"public","tablename":"student_identity_documents","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Students can insert own identity documents","qual":null,"roles":["authenticated"],"schemaname":"public","tablename":"student_identity_documents","with_check":"(user_id = auth.uid())"},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Students can update own identity documents","qual":"(user_id = auth.uid())","roles":["authenticated"],"schemaname":"public","tablename":"student_identity_documents","with_check":"(user_id = auth.uid())"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Students can view own identity documents","qual":"(user_id = auth.uid())","roles":["authenticated"],"schemaname":"public","tablename":"student_identity_documents","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Admins can manage all student docs storage","qual":"((bucket_id = 'student-documents'::text) AND has_role('admin'::app_role, auth.uid()))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Org users can delete company documents","qual":"((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.user_id = auth.uid()) AND (p.organization_id IS NOT NULL)))))","roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Org users can delete company documents storage","qual":"((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1\n   FROM (companies c\n     JOIN profiles p ON ((p.organization_id = c.organization_id)))\n  WHERE (((c.id)::text = (storage.foldername(c.name))[1]) AND (p.user_id = auth.uid())))))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage student docs storage","qual":"((bucket_id = 'student-documents'::text) AND has_role('organization'::app_role, auth.uid()))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Org users can update company documents","qual":"((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.user_id = auth.uid()) AND (p.organization_id IS NOT NULL)))))","roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Org users can upload company documents","qual":null,"roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":"((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.user_id = auth.uid()) AND (p.organization_id IS NOT NULL)))))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org users can view company documents","qual":"((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.user_id = auth.uid()) AND (p.organization_id IS NOT NULL)))))","roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org users can view company documents storage","qual":"((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1\n   FROM (companies c\n     JOIN profiles p ON ((p.organization_id = c.organization_id)))\n  WHERE (((c.id)::text = (storage.foldername(c.name))[1]) AND (p.user_id = auth.uid())))))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Organization users can delete their company documents","qual":"((bucket_id = 'company-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1\n   FROM (profiles p\n     JOIN companies c ON ((c.organization_id = p.organization_id)))\n  WHERE ((p.user_id = auth.uid()) AND ((c.id)::text = split_part(c.name, '/'::text, 1))))))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Organization users can update their company documents","qual":"((bucket_id = 'company-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1\n   FROM (profiles p\n     JOIN companies c ON ((c.organization_id = p.organization_id)))\n  WHERE ((p.user_id = auth.uid()) AND ((c.id)::text = split_part(c.name, '/'::text, 1))))))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Organization users can upload company documents","qual":null,"roles":["public"],"schemaname":"storage","tablename":"objects","with_check":"((bucket_id = 'company-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1\n   FROM (profiles p\n     JOIN companies c ON ((c.organization_id = p.organization_id)))\n  WHERE ((p.user_id = auth.uid()) AND ((c.id)::text = split_part(c.name, '/'::text, 1))))))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Organization users can view their company documents","qual":"((bucket_id = 'company-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1\n   FROM (profiles p\n     JOIN companies c ON ((c.organization_id = p.organization_id)))\n  WHERE ((p.user_id = auth.uid()) AND ((c.id)::text = split_part(c.name, '/'::text, 1))))))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Students can delete own documents","qual":"((bucket_id = 'student-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))","roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Students can upload own documents","qual":null,"roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":"((bucket_id = 'student-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Students can view own documents","qual":"((bucket_id = 'student-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))","roles":["authenticated"],"schemaname":"storage","tablename":"objects","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Students can view own documents storage","qual":"((bucket_id = 'student-documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))","roles":["public"],"schemaname":"storage","tablename":"objects","with_check":null}]$access$::jsonb AS access_policies_match,
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN('20261018100000','20261018101000','20261018102000','20261018103000')) AS migrations_absent,
 NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='org_documents' AND column_name='document_revision') AS versions_absent,
 (SELECT count(*)=18 AND bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('org_documents','incoming_documents','education_document_records','document_issuance_log','program_documents','program_folders','program_categories','program_training_plans','frdo_signed_documents','student_documents','student_identity_documents','company_documents','group_documents','document_signatures','signature_revisions','signature_comments','pep_agreements','org_document_versions')) AS rls_enabled,
 (SELECT count(*)=6 FROM storage.buckets WHERE id IN('student-documents','company-documents','billing-documents','org-documents','signed-documents','external-contracts') AND NOT public) AS buckets_private,
 has_table_privilege(current_user,'supabase_migrations.schema_migrations','SELECT') AND has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT') AS ledger_access,
 (SELECT count(*)=1 AND bool_and(active AND md5(command)='954edfdd26f6b685ed3d0977f26bf5e7' AND username=current_user AND database=current_database()) FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily') AS cleanup_job_reviewed,
 has_function_privilege(current_user,'cron.alter_job(bigint,text,text,text,text,boolean)','EXECUTE') AS cron_api_allowed) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(result) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'UC release preflight failed: %',result; END IF; END $check$;
LOCK TABLE public.org_documents,public.incoming_documents,public.education_document_records,public.document_issuance_log,public.program_documents,public.program_folders,public.program_categories,public.program_training_plans,public.frdo_signed_documents,public.student_documents,public.student_identity_documents,public.company_documents,public.group_documents,public.document_signatures,public.signature_revisions,public.signature_comments,public.pep_agreements,public.org_document_versions,public.document_number_sequences,public.organizations,public.profiles,public.companies,public.enrollments,storage.objects,storage.buckets IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc_release_before(table_name text PRIMARY KEY,column_list text,row_count bigint,row_hash text) ON COMMIT DROP;
CREATE TEMP TABLE uc_release_restrictive_before ON COMMIT DROP AS SELECT * FROM pg_policies WHERE permissive='RESTRICTIVE' AND schemaname IN('public','storage');
-- Read-only witnesses for extension metadata: no direct cron table lock/update.
CREATE TEMP TABLE uc_release_cron_before ON COMMIT DROP AS SELECT jobid,md5((to_jsonb(j)-CASE WHEN jobname='purge-recycle-bin-storage-daily' THEN 'active' ELSE '__unchanged__' END)::text) AS hash FROM cron.job j;
DO $snapshot$ DECLARE t text; cols text; n bigint; h text; BEGIN
 FOREACH t IN ARRAY ARRAY['public.org_documents','public.incoming_documents','public.education_document_records','public.document_issuance_log','public.program_documents','public.program_folders','public.program_categories','public.program_training_plans','public.frdo_signed_documents','public.student_documents','public.student_identity_documents','public.company_documents','public.group_documents','public.document_signatures','public.signature_revisions','public.signature_comments','public.pep_agreements','public.org_document_versions','public.document_number_sequences','public.organizations','public.profiles','public.companies','public.enrollments','storage.objects','storage.buckets'] LOOP
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=t::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\n'' ORDER BY to_jsonb(r)::text),'''')) FROM (SELECT %s FROM %s) r',cols,t) INTO n,h;
  INSERT INTO uc_release_before VALUES(t,cols,n,h);
 END LOOP; END $snapshot$;

DO $migration_0$ DECLARE source text := $source_20261018100000$-- UC-002/003/005. Permissions only; no document rows, blobs or numbers are migrated.
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

$source_20261018100000$; executable text;
 BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>'455f5c4069200f225124bfd58adc948c' THEN RAISE EXCEPTION 'Source hash mismatch: 20261018100000'; END IF;
 executable := regexp_replace(regexp_replace(source,E'(?m)^BEGIN( ISOLATION LEVEL REPEATABLE READ)?;\r?$','','g'),E'(?m)^COMMIT;\r?$','','g');
 IF md5(replace(executable,chr(13)||chr(10),chr(10)))<>'78cc4967a7ad43dbb33bdb0307c19f0b' THEN RAISE EXCEPTION 'Executable hash mismatch: 20261018100000'; END IF;
 EXECUTE executable;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261018100000','uc_document_access_boundaries',ARRAY[source]);
 END $migration_0$;

DO $migration_1$ DECLARE source text := $source_20261018101000$-- UC-004. Additive signature integrity; historical rows and artifact bytes are not rewritten.
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
$source_20261018101000$; executable text;
 BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>'1a7d1d39332388314cc8ebf0eaaef885' THEN RAISE EXCEPTION 'Source hash mismatch: 20261018101000'; END IF;
 executable := source;
 IF md5(replace(executable,chr(13)||chr(10),chr(10)))<>'1a7d1d39332388314cc8ebf0eaaef885' THEN RAISE EXCEPTION 'Executable hash mismatch: 20261018101000'; END IF;
 EXECUTE executable;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261018101000','uc_signature_integrity',ARRAY[source]);
 END $migration_1$;

DO $migration_2$ DECLARE source text := $source_20261018102000$-- UC-006. Immutable document versions; no reconstruction of unknown past history.
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

$source_20261018102000$; executable text;
 BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>'485580713e67f5bbf40210836f757a8b' THEN RAISE EXCEPTION 'Source hash mismatch: 20261018102000'; END IF;
 executable := regexp_replace(regexp_replace(source,E'(?m)^BEGIN( ISOLATION LEVEL REPEATABLE READ)?;\r?$','','g'),E'(?m)^COMMIT;\r?$','','g');
 IF md5(replace(executable,chr(13)||chr(10),chr(10)))<>'3bb4188643dc02cd5b7e12ec3ac1d7a7' THEN RAISE EXCEPTION 'Executable hash mismatch: 20261018102000'; END IF;
 EXECUTE executable;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261018102000','uc_document_versions',ARRAY[source]);
 END $migration_2$;

DO $migration_3$ DECLARE source text := $source_20261018103000$-- Pause only the legacy anonymous cleanup job. No document or object is deleted.
-- Retention may resume through a separately reviewed authenticated scheduler.
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $pause$
DECLARE j record; preserved jsonb;
BEGIN
 IF current_setting('transaction_isolation') NOT IN('repeatable read','serializable')
   OR to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') IS NULL
   OR NOT has_function_privilege(current_user,'cron.alter_job(bigint,text,text,text,text,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'Cleanup pause requires supported cron API and repeatable-read transaction';
 END IF;
 IF (SELECT count(*) FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily')<>1 THEN
  RAISE EXCEPTION 'Expected exactly one legacy cleanup job';
 END IF;
 SELECT * INTO STRICT j FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily';
 IF NOT j.active OR j.username IS DISTINCT FROM current_user OR j.database IS DISTINCT FROM current_database()
   OR md5(j.command)<>'954edfdd26f6b685ed3d0977f26bf5e7'
   OR j.command NOT LIKE '%/functions/v1/purge-recycle-bin-storage%'
   OR j.command !~* 'authorization' OR j.command !~* 'bearer[[:space:]]+eyJ' THEN
  RAISE EXCEPTION 'Unreviewed legacy cleanup schedule; inspect safe metadata before release';
 END IF;
 preserved:=to_jsonb(j)-'active';
 -- Hosted pg_cron exposes this API; never grant or directly UPDATE cron.job.
 PERFORM cron.alter_job(j.jobid,active:=false);
 SELECT * INTO STRICT j FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily';
 IF j.active OR (to_jsonb(j)-'active') IS DISTINCT FROM preserved THEN
  RAISE EXCEPTION 'Cleanup pause changed more than active';
 END IF;
END $pause$;
COMMIT;
$source_20261018103000$; executable text;
 BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>'5d690c2e4284a79f12901a7deabdf736' THEN RAISE EXCEPTION 'Source hash mismatch: 20261018103000'; END IF;
 executable := regexp_replace(regexp_replace(source,E'(?m)^BEGIN( ISOLATION LEVEL REPEATABLE READ)?;\r?$','','g'),E'(?m)^COMMIT;\r?$','','g');
 IF md5(replace(executable,chr(13)||chr(10),chr(10)))<>'7652ea8d286d4e92f9502cbba693ceef' THEN RAISE EXCEPTION 'Executable hash mismatch: 20261018103000'; END IF;
 EXECUTE executable;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261018103000','uc_document_cleanup_scheduler',ARRAY[source]);
 END $migration_3$;
DO $check$ DECLARE result jsonb; BEGIN SELECT to_jsonb(q) INTO result FROM (-- Read-only metadata acceptance. No claims, issuance, signing or Storage writes.
SELECT
 (SELECT count(*)=4 FROM supabase_migrations.schema_migrations WHERE (version='20261018100000' AND name='uc_document_access_boundaries' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='455f5c4069200f225124bfd58adc948c') OR (version='20261018101000' AND name='uc_signature_integrity' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='1a7d1d39332388314cc8ebf0eaaef885') OR (version='20261018102000' AND name='uc_document_versions' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='485580713e67f5bbf40210836f757a8b') OR (version='20261018103000' AND name='uc_document_cleanup_scheduler' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='5d690c2e4284a79f12901a7deabdf736')) AS exact_migration_ledger,
 NOT has_function_privilege('anon','public.get_next_document_number(uuid,text,integer)','EXECUTE')
 AND NOT has_function_privilege('anon','public.issue_education_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon','public.create_group_document_batch(uuid,uuid,jsonb)','EXECUTE') AS no_anonymous_document_rpc,
 NOT has_function_privilege('authenticated','public.uc_finalize_signature(text,text,jsonb,text,uuid,boolean,text,text,text,text,text,text,text)','EXECUTE') AS service_only_finalize,
 NOT has_table_privilege('authenticated','public.org_document_versions','INSERT')
 AND NOT has_table_privilege('authenticated','public.org_document_versions','UPDATE')
 AND NOT has_table_privilege('authenticated','public.org_document_versions','DELETE') AS versions_immutable,
 (SELECT count(*)=7 FROM pg_trigger WHERE tgname IN('uc_signature_integrity','uc_signature_revision_integrity','uc_pep_evidence_integrity','uc_signature_comment_integrity','uc_document_versions_write_guard','uc_document_pointer_guard','uc_document_initial_snapshot') AND NOT tgisinternal AND tgenabled='O') AS triggers_enabled,
 (SELECT count(*)=11 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND permissive='RESTRICTIVE'
   AND policyname IN('uc_document_objects_read_guard','uc_document_objects_insert_guard','uc_document_objects_update_guard','uc_document_objects_delete_guard','uc_billing_document_upload_guard',
    'uc_signature_file_read_boundary','uc_signature_file_insert_boundary','uc_signature_file_update_boundary','uc_signature_file_delete_boundary','uc_org_document_blob_no_overwrite','uc_org_document_blob_no_delete')) AS storage_boundaries,
 (SELECT count(*)=6 FROM storage.buckets WHERE id IN('student-documents','company-documents','billing-documents','org-documents','signed-documents','external-contracts') AND NOT public) AS buckets_private,
 NOT EXISTS(SELECT 1 FROM public.org_document_write_tokens) AS no_durable_write_token,
 (SELECT count(*)=1 AND bool_and(NOT active AND md5(command)='954edfdd26f6b685ed3d0977f26bf5e7') FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily') AS unsafe_cleanup_paused) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(result) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'UC release postcheck failed: %',result; END IF; END $check$;
DO $preserve$ DECLARE r record; n bigint; h text; BEGIN
 FOR r IN SELECT * FROM uc_release_before LOOP
  EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(x)::text,E''\n'' ORDER BY to_jsonb(x)::text),'''')) FROM (SELECT %s FROM %s) x',r.column_list,r.table_name) INTO n,h;
  IF (n,h) IS DISTINCT FROM (r.row_count,r.row_hash) THEN RAISE EXCEPTION 'Historical data changed in %; release rolled back',r.table_name; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM uc_release_restrictive_before b LEFT JOIN pg_policies p USING(schemaname,tablename,policyname)
  WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(p)) THEN RAISE EXCEPTION 'Existing restrictive policy changed'; END IF;
 IF EXISTS(SELECT 1 FROM uc_release_cron_before b FULL JOIN
   (SELECT jobid,md5((to_jsonb(j)-CASE WHEN jobname='purge-recycle-bin-storage-daily' THEN 'active' ELSE '__unchanged__' END)::text) AS hash FROM cron.job j) a USING(jobid)
   WHERE b.hash IS DISTINCT FROM a.hash) THEN RAISE EXCEPTION 'Unreviewed cron metadata changed'; END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';
COMMIT;
-- Read-only metadata acceptance. No claims, issuance, signing or Storage writes.
SELECT
 (SELECT count(*)=4 FROM supabase_migrations.schema_migrations WHERE (version='20261018100000' AND name='uc_document_access_boundaries' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='455f5c4069200f225124bfd58adc948c') OR (version='20261018101000' AND name='uc_signature_integrity' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='1a7d1d39332388314cc8ebf0eaaef885') OR (version='20261018102000' AND name='uc_document_versions' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='485580713e67f5bbf40210836f757a8b') OR (version='20261018103000' AND name='uc_document_cleanup_scheduler' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='5d690c2e4284a79f12901a7deabdf736')) AS exact_migration_ledger,
 NOT has_function_privilege('anon','public.get_next_document_number(uuid,text,integer)','EXECUTE')
 AND NOT has_function_privilege('anon','public.issue_education_document_batch(uuid,uuid,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon','public.create_group_document_batch(uuid,uuid,jsonb)','EXECUTE') AS no_anonymous_document_rpc,
 NOT has_function_privilege('authenticated','public.uc_finalize_signature(text,text,jsonb,text,uuid,boolean,text,text,text,text,text,text,text)','EXECUTE') AS service_only_finalize,
 NOT has_table_privilege('authenticated','public.org_document_versions','INSERT')
 AND NOT has_table_privilege('authenticated','public.org_document_versions','UPDATE')
 AND NOT has_table_privilege('authenticated','public.org_document_versions','DELETE') AS versions_immutable,
 (SELECT count(*)=7 FROM pg_trigger WHERE tgname IN('uc_signature_integrity','uc_signature_revision_integrity','uc_pep_evidence_integrity','uc_signature_comment_integrity','uc_document_versions_write_guard','uc_document_pointer_guard','uc_document_initial_snapshot') AND NOT tgisinternal AND tgenabled='O') AS triggers_enabled,
 (SELECT count(*)=11 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND permissive='RESTRICTIVE'
   AND policyname IN('uc_document_objects_read_guard','uc_document_objects_insert_guard','uc_document_objects_update_guard','uc_document_objects_delete_guard','uc_billing_document_upload_guard',
    'uc_signature_file_read_boundary','uc_signature_file_insert_boundary','uc_signature_file_update_boundary','uc_signature_file_delete_boundary','uc_org_document_blob_no_overwrite','uc_org_document_blob_no_delete')) AS storage_boundaries,
 (SELECT count(*)=6 FROM storage.buckets WHERE id IN('student-documents','company-documents','billing-documents','org-documents','signed-documents','external-contracts') AND NOT public) AS buckets_private,
 NOT EXISTS(SELECT 1 FROM public.org_document_write_tokens) AS no_durable_write_token,
 (SELECT count(*)=1 AND bool_and(NOT active AND md5(command)='954edfdd26f6b685ed3d0977f26bf5e7') FROM cron.job WHERE jobname='purge-recycle-bin-storage-daily') AS unsafe_cleanup_paused;
