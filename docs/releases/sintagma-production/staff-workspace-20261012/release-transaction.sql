-- S-047 atomic release. Generated from reviewed local sources and live read-only metadata.
-- Send this COMPLETE file as ONE SQL editor request. Never split BEGIN/COMMIT between requests.
-- Any raised exception aborts the transaction; do not report success from a partial result.
-- No application business rows are written. Exact source is recorded in the migration ledger.
-- Metadata SHA256: 7ae1f0f4ea7e86b5251b4356196d49fdfa21d7a448397ad4a868c8e996b1a18c
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
DECLARE r record; actual_policies jsonb;
BEGIN
  IF NOT has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT') THEN
    RAISE EXCEPTION 'S-047 migration ledger INSERT required'; END IF;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261012110000','20261012111000')) THEN
    RAISE EXCEPTION 'S-047 migration ledger already contains a release version; replay refused'; END IF;
  FOR r IN SELECT e.signature FROM (VALUES ('public.account_deletion_access_allowed()','6c078d0f1aa1f6b5af15485f0eaccb2a','["search_path=pg_catalog, public"]','true'),
('public.can_access_organization(uuid,text)','ad720ba20dc32362ed009b2917cc2d9c','["search_path=public"]','true'),
('public.current_organization_id()','1ff63e18c919fab8dafc9d5ff5298a6d','["search_path=public"]','true'),
('public.get_documents_kpi(uuid)','81f938320b6634424e7f59b447d85327','["search_path=public"]','true'),
('public.get_org_staff_permissions(uuid,uuid)','f8d82709ae27730782dc4f455b35b7de','["search_path=public"]','true'),
('public.get_organization_core(uuid)','0d1d2341def112507a7d9eed08c619f4','["search_path=public"]','true'),
('public.get_user_role(uuid)','c1e466f7ff2e919b625e7db62fcb64cd','["search_path=public"]','true'),
('public.has_org_staff_permission(uuid,uuid,text)','b9c87ca03c3e95a57baf9122753792e2','["search_path=public"]','true'),
('public.has_role(uuid,app_role)','4e852b30ef52ba5263c4e11d1aec8cf0','["search_path=public"]','true'),
('public.has_role(app_role,uuid)','5457df2171dee5cee3641e64285928f2','["search_path=public"]','true'),
('public.is_org_owner(uuid,uuid)','5894db724b2a3cbc52701cabfb2cf73c','["search_path=public"]','true'),
('public.list_recycle_bin(uuid,text,integer,integer)','1d8277c8135addea5207857d8a2af842','["search_path=public"]','true'),
('public.normalize_org_staff_permission(text)','2d47924fe022372f2dc128a979d56a53','["search_path=public"]','false'),
('public.org_role_default_permissions(text)','30d48528d47eb4e21d5ce13a13c7d138','["search_path=public"]','false'),
('public.restore_document(text,uuid)','9eff9285f82b895a746100f18883bffc','["search_path=public"]','true'),
('public.soft_delete_document(text,uuid)','7a540b6f27ec6cb8d9e0c813b2f4e324','["search_path=public"]','true'))
    e(signature,body_md5,config,security_definer) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
    WHERE p.oid IS NULL OR md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))<>e.body_md5
      OR COALESCE(to_jsonb(p.proconfig),'null'::jsonb)<>e.config::jsonb
      OR p.prosecdef<>e.security_definer::boolean OR NOT pg_has_role(current_user,p.proowner,'USAGE')
  LOOP RAISE EXCEPTION 'S-047 live function drift/ownership: %',r.signature; END LOOP;
  FOR r IN SELECT e.table_name,e.column_name FROM (VALUES ('organizations','id'),
('organizations','name'),
('organizations','description'),
('organizations','branding'),
('organizations','menu_settings'),
('organizations','student_dashboard_settings'),
('organizations','subscription_plan'),
('organizations','custom_enabled_categories'),
('organizations','frdo_enabled'),
('profiles','user_id'),
('profiles','organization_id'),
('org_staff','user_id'),
('org_staff','organization_id'),
('org_staff','expires_at'),
('org_staff','role'),
('org_staff','sections_access'),
('companies','id'),
('companies','organization_id'),
('companies','user_id'),
('labor_safety_groups','id'),
('labor_safety_groups','organization_id'),
('labor_safety_records','group_id'),
('journal_instances','id'),
('journal_instances','organization_id'),
('journal_entries','id'),
('journal_entries','journal_id'),
('org_documents','id'),
('org_documents','organization_id'),
('org_documents','name'),
('org_documents','type'),
('org_documents','deleted_at'),
('org_documents','deleted_by'),
('education_document_records','id'),
('education_document_records','organization_id'),
('education_document_records','full_name'),
('education_document_records','reg_number'),
('education_document_records','document_type'),
('education_document_records','document_status'),
('education_document_records','created_at'),
('education_document_records','deleted_at'),
('education_document_records','deleted_by'),
('document_signatures','id'),
('document_signatures','organization_id'),
('document_signatures','document_title'),
('document_signatures','recipient_email'),
('document_signatures','document_type'),
('document_signatures','status'),
('document_signatures','created_at'),
('document_signatures','signed_at'),
('document_signatures','expires_at'),
('document_signatures','deleted_at'),
('document_signatures','deleted_by'),
('company_documents','id'),
('company_documents','company_id'),
('company_documents','name'),
('company_documents','type'),
('company_documents','is_paid'),
('company_documents','deleted_at'),
('company_documents','deleted_by'),
('commercial_proposals','id'),
('commercial_proposals','organization_id'),
('commercial_proposals','company_name'),
('commercial_proposals','total_amount'),
('commercial_proposals','status'),
('commercial_proposals','deleted_at'),
('commercial_proposals','deleted_by'),
('data_subject_requests','id'),
('data_subject_requests','organization_id'),
('data_subject_requests','request_type'),
('data_subject_requests','status'),
('data_subject_requests','due_date'),
('data_subject_requests','deleted_at'),
('data_subject_requests','deleted_by'),
('incoming_documents','id'),
('incoming_documents','organization_id'),
('incoming_documents','title'),
('incoming_documents','doc_type'),
('incoming_documents','counterparty_name'),
('incoming_documents','created_at'),
('incoming_documents','deleted_at'),
('incoming_documents','deleted_by'),
('document_issuance_log','id'),
('document_issuance_log','organization_id'),
('document_issuance_log','document_name'),
('document_issuance_log','user_name'),
('document_issuance_log','deleted_at'),
('document_issuance_log','deleted_by'),
('org_billing_documents','id'),
('org_billing_documents','organization_id'),
('org_billing_documents','name'),
('org_billing_documents','doc_type'),
('org_billing_documents','deleted_at'),
('org_billing_documents','deleted_by')) e(table_name,column_name)
    LEFT JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name=e.table_name AND c.column_name=e.column_name
    WHERE c.column_name IS NULL
  LOOP RAISE EXCEPTION 'S-047 missing column: %.%',r.table_name,r.column_name; END LOOP;
  FOR r IN SELECT e.table_name FROM (VALUES ('companies'),
('labor_safety_groups'),
('labor_safety_records'),
('journal_instances'),
('journal_entries')) e(table_name)
    LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.table_name)
    WHERE c.oid IS NULL OR NOT c.relrowsecurity OR NOT pg_has_role(current_user,c.relowner,'USAGE')
      OR EXISTS(SELECT 1 FROM (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE')) g(privilege)
        WHERE NOT has_table_privilege('authenticated',c.oid,g.privilege))
  LOOP RAISE EXCEPTION 'S-047 table RLS/grants/ownership: %',r.table_name; END LOOP;
  SELECT (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname),'[]'::jsonb) FROM
  (SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public'
   AND tablename IN ('companies','labor_safety_groups','labor_safety_records','journal_instances','journal_entries','organizations')) p) INTO actual_policies;
  IF NOT(actual_policies @> '[{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"companies","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Companies can update own record","qual":"(id = current_company_id())","roles":["authenticated"],"schemaname":"public","tablename":"companies","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Companies can view own record","qual":"(id = current_company_id())","roles":["authenticated"],"schemaname":"public","tablename":"companies","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage their companies","qual":"((organization_id = current_organization_id()) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"companies","with_check":"((organization_id = current_organization_id()) OR has_role(''admin''::app_role, auth.uid()))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org users can view their companies","qual":"((organization_id = current_organization_id()) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"companies","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"journal_entries","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Organization members can create journal entries","qual":null,"roles":["public"],"schemaname":"public","tablename":"journal_entries","with_check":"(journal_id IN ( SELECT ji.id\n   FROM journal_instances ji\n  WHERE (ji.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid())))))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Organization members can delete journal entries","qual":"(journal_id IN ( SELECT ji.id\n   FROM journal_instances ji\n  WHERE (ji.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid())))))","roles":["public"],"schemaname":"public","tablename":"journal_entries","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Organization members can update journal entries","qual":"(journal_id IN ( SELECT ji.id\n   FROM journal_instances ji\n  WHERE (ji.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid())))))","roles":["public"],"schemaname":"public","tablename":"journal_entries","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Organization members can view their journal entries","qual":"(journal_id IN ( SELECT ji.id\n   FROM journal_instances ji\n  WHERE (ji.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid())))))","roles":["public"],"schemaname":"public","tablename":"journal_entries","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"journal_instances","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Organization members can create journal instances","qual":null,"roles":["public"],"schemaname":"public","tablename":"journal_instances","with_check":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Organization members can delete journal instances","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"journal_instances","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Organization members can update journal instances","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"journal_instances","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Organization members can view their journal instances","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"journal_instances","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"labor_safety_groups","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Users can create labor safety groups in their organization","qual":null,"roles":["public"],"schemaname":"public","tablename":"labor_safety_groups","with_check":"((organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid()))) OR has_role(''admin''::app_role, auth.uid()))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Users can delete labor safety groups in their organization","qual":"((organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid()))) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"labor_safety_groups","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Users can update labor safety groups in their organization","qual":"((organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid()))) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"labor_safety_groups","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Users can view labor safety groups of their organization","qual":"((organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid()))) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"labor_safety_groups","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"labor_safety_records","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Users can create labor safety records","qual":null,"roles":["public"],"schemaname":"public","tablename":"labor_safety_records","with_check":"((group_id IN ( SELECT labor_safety_groups.id\n   FROM labor_safety_groups\n  WHERE (labor_safety_groups.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid()))))) OR has_role(''admin''::app_role, auth.uid()))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Users can delete labor safety records","qual":"((group_id IN ( SELECT labor_safety_groups.id\n   FROM labor_safety_groups\n  WHERE (labor_safety_groups.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid()))))) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"labor_safety_records","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Users can update labor safety records","qual":"((group_id IN ( SELECT labor_safety_groups.id\n   FROM labor_safety_groups\n  WHERE (labor_safety_groups.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid()))))) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"labor_safety_records","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Users can view labor safety records","qual":"((group_id IN ( SELECT labor_safety_groups.id\n   FROM labor_safety_groups\n  WHERE (labor_safety_groups.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid()))))) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"labor_safety_records","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"organizations","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Admins can delete organizations","qual":"has_role(''admin''::app_role, auth.uid())","roles":["public"],"schemaname":"public","tablename":"organizations","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Admins can do everything with organizations","qual":"has_role(''admin''::app_role, auth.uid())","roles":["public"],"schemaname":"public","tablename":"organizations","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Org staff can update organization","qual":"can_access_organization(id, ''settings.write''::text)","roles":["authenticated"],"schemaname":"public","tablename":"organizations","with_check":"can_access_organization(id, ''settings.write''::text)"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org staff can view organization","qual":"can_access_organization(id, ''settings.read''::text)","roles":["authenticated"],"schemaname":"public","tablename":"organizations","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org users can view their organization","qual":"(id = current_organization_id())","roles":["public"],"schemaname":"public","tablename":"organizations","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"public_insert_organizations","qual":null,"roles":["public"],"schemaname":"public","tablename":"organizations","with_check":"(auth.uid() IS NOT NULL)"}]'::jsonb AND actual_policies <@ '[{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"companies","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Companies can update own record","qual":"(id = current_company_id())","roles":["authenticated"],"schemaname":"public","tablename":"companies","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Companies can view own record","qual":"(id = current_company_id())","roles":["authenticated"],"schemaname":"public","tablename":"companies","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Org users can manage their companies","qual":"((organization_id = current_organization_id()) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"companies","with_check":"((organization_id = current_organization_id()) OR has_role(''admin''::app_role, auth.uid()))"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org users can view their companies","qual":"((organization_id = current_organization_id()) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"companies","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"journal_entries","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Organization members can create journal entries","qual":null,"roles":["public"],"schemaname":"public","tablename":"journal_entries","with_check":"(journal_id IN ( SELECT ji.id\n   FROM journal_instances ji\n  WHERE (ji.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid())))))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Organization members can delete journal entries","qual":"(journal_id IN ( SELECT ji.id\n   FROM journal_instances ji\n  WHERE (ji.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid())))))","roles":["public"],"schemaname":"public","tablename":"journal_entries","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Organization members can update journal entries","qual":"(journal_id IN ( SELECT ji.id\n   FROM journal_instances ji\n  WHERE (ji.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid())))))","roles":["public"],"schemaname":"public","tablename":"journal_entries","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Organization members can view their journal entries","qual":"(journal_id IN ( SELECT ji.id\n   FROM journal_instances ji\n  WHERE (ji.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid())))))","roles":["public"],"schemaname":"public","tablename":"journal_entries","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"journal_instances","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Organization members can create journal instances","qual":null,"roles":["public"],"schemaname":"public","tablename":"journal_instances","with_check":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Organization members can delete journal instances","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"journal_instances","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Organization members can update journal instances","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"journal_instances","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Organization members can view their journal instances","qual":"(organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())))","roles":["public"],"schemaname":"public","tablename":"journal_instances","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"labor_safety_groups","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Users can create labor safety groups in their organization","qual":null,"roles":["public"],"schemaname":"public","tablename":"labor_safety_groups","with_check":"((organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid()))) OR has_role(''admin''::app_role, auth.uid()))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Users can delete labor safety groups in their organization","qual":"((organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid()))) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"labor_safety_groups","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Users can update labor safety groups in their organization","qual":"((organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid()))) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"labor_safety_groups","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Users can view labor safety groups of their organization","qual":"((organization_id IN ( SELECT profiles.organization_id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid()))) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"labor_safety_groups","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"labor_safety_records","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"Users can create labor safety records","qual":null,"roles":["public"],"schemaname":"public","tablename":"labor_safety_records","with_check":"((group_id IN ( SELECT labor_safety_groups.id\n   FROM labor_safety_groups\n  WHERE (labor_safety_groups.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid()))))) OR has_role(''admin''::app_role, auth.uid()))"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Users can delete labor safety records","qual":"((group_id IN ( SELECT labor_safety_groups.id\n   FROM labor_safety_groups\n  WHERE (labor_safety_groups.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid()))))) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"labor_safety_records","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Users can update labor safety records","qual":"((group_id IN ( SELECT labor_safety_groups.id\n   FROM labor_safety_groups\n  WHERE (labor_safety_groups.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid()))))) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"labor_safety_records","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Users can view labor safety records","qual":"((group_id IN ( SELECT labor_safety_groups.id\n   FROM labor_safety_groups\n  WHERE (labor_safety_groups.organization_id IN ( SELECT profiles.organization_id\n           FROM profiles\n          WHERE (profiles.user_id = auth.uid()))))) OR has_role(''admin''::app_role, auth.uid()))","roles":["public"],"schemaname":"public","tablename":"labor_safety_records","with_check":null},{"cmd":"ALL","permissive":"RESTRICTIVE","policyname":"account_deletion_no_revoked_access","qual":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)","roles":["authenticated"],"schemaname":"public","tablename":"organizations","with_check":"( SELECT account_deletion_access_allowed() AS account_deletion_access_allowed)"},{"cmd":"DELETE","permissive":"PERMISSIVE","policyname":"Admins can delete organizations","qual":"has_role(''admin''::app_role, auth.uid())","roles":["public"],"schemaname":"public","tablename":"organizations","with_check":null},{"cmd":"ALL","permissive":"PERMISSIVE","policyname":"Admins can do everything with organizations","qual":"has_role(''admin''::app_role, auth.uid())","roles":["public"],"schemaname":"public","tablename":"organizations","with_check":null},{"cmd":"UPDATE","permissive":"PERMISSIVE","policyname":"Org staff can update organization","qual":"can_access_organization(id, ''settings.write''::text)","roles":["authenticated"],"schemaname":"public","tablename":"organizations","with_check":"can_access_organization(id, ''settings.write''::text)"},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org staff can view organization","qual":"can_access_organization(id, ''settings.read''::text)","roles":["authenticated"],"schemaname":"public","tablename":"organizations","with_check":null},{"cmd":"SELECT","permissive":"PERMISSIVE","policyname":"Org users can view their organization","qual":"(id = current_organization_id())","roles":["public"],"schemaname":"public","tablename":"organizations","with_check":null},{"cmd":"INSERT","permissive":"PERMISSIVE","policyname":"public_insert_organizations","qual":null,"roles":["public"],"schemaname":"public","tablename":"organizations","with_check":"(auth.uid() IS NOT NULL)"}]'::jsonb) THEN
    RAISE EXCEPTION 'S-047 live policy inventory drifted from reviewed before-backup';
  END IF;
END $preflight$;
CREATE TEMP TABLE s047_release_checks(check_name text PRIMARY KEY,ok boolean NOT NULL,details jsonb) ON COMMIT DROP;
CREATE TEMP TABLE s047_release_result(result jsonb NOT NULL) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE s047_preserved_functions ON COMMIT DROP AS SELECT 'public.'||f.signature AS signature,pg_get_functiondef(p.oid) AS definition,
  p.proowner,p.proacl,p.prosecdef,p.proconfig FROM (VALUES ('account_deletion_access_allowed()'),
('can_access_organization(uuid,text)'),
('current_organization_id()'),
('get_org_staff_permissions(uuid,uuid)'),
('get_user_role(uuid)'),
('has_org_staff_permission(uuid,uuid,text)'),
('has_role(uuid,app_role)'),
('has_role(app_role,uuid)'),
('is_org_owner(uuid,uuid)'),
('normalize_org_staff_permission(text)')) f(signature)
  JOIN pg_proc p ON p.oid=to_regprocedure('public.'||f.signature);
CREATE TEMP TABLE s047_preserved_policies ON COMMIT DROP AS SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies p WHERE schemaname='public'
  AND (tablename='organizations' OR (tablename IN ('companies','labor_safety_groups','labor_safety_records','journal_instances','journal_entries')
   AND (policyname='account_deletion_no_revoked_access' OR policyname IN ('Companies can view own record','Companies can update own record'))));
CREATE TEMP TABLE s047_preserved_table_security ON COMMIT DROP AS
 SELECT c.oid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c
 WHERE c.oid IN ('public.companies'::regclass,'public.labor_safety_groups'::regclass,'public.labor_safety_records'::regclass,'public.journal_instances'::regclass,'public.journal_entries'::regclass,'public.organizations'::regclass);

-- Exact source 20261012110000_staff_workspace_access.sql SHA256 32633ebd3c03ff3185cfc21fc416f5bc81206ac4aee864ef8f7e8fdac089541e
DO $s047_apply_0$
DECLARE v_source text := $s047_exact_0$-- Staff workspace access. Prepared offline; live definitions must be reviewed
-- with docs/releases/sintagma-production/staff-workspace-20261012/preflight.sql.
-- No business rows, global roles, profile identities or current_organization_id
-- are changed. Preserve company-owner policies and account-deletion fences.

DO $prerequisites$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.can_access_organization(uuid,text)',
    'public.has_org_staff_permission(uuid,uuid,text)',
    'public.get_org_staff_permissions(uuid,uuid)',
    'public.normalize_org_staff_permission(text)',
    'public.has_role(public.app_role,uuid)',
    'public.has_role(uuid,public.app_role)',
    'public.is_org_owner(uuid,uuid)',
    'public.account_deletion_access_allowed()',
    'public.get_organization_core(uuid)',
    'public.org_role_default_permissions(text)'
  ] LOOP
    IF to_regprocedure(signature) IS NULL THEN
      RAISE EXCEPTION 'Staff workspace prerequisite missing: %', signature;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('companies'), ('labor_safety_groups'), ('labor_safety_records')) t(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t.name AND c.relrowsecurity
    )
  ) THEN RAISE EXCEPTION 'Staff workspace requires existing RLS tables'; END IF;
  -- A signature alone is insufficient: the older helper trusted every profile
  -- as an organization owner. Reject an unreviewed live definition, including
  -- a semantically harmless change, until its body is explicitly re-reviewed.
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.can_access_organization(uuid,text)','ad720ba20dc32362ed009b2917cc2d9c'),
      ('public.is_org_owner(uuid,uuid)','5894db724b2a3cbc52701cabfb2cf73c'),
      ('public.has_org_staff_permission(uuid,uuid,text)','b9c87ca03c3e95a57baf9122753792e2'),
      ('public.get_org_staff_permissions(uuid,uuid)','f8d82709ae27730782dc4f455b35b7de'),
      ('public.account_deletion_access_allowed()','6c078d0f1aa1f6b5af15485f0eaccb2a')
    ) expected(signature,body_md5)
    LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
    WHERE p.oid IS NULL OR md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))<>expected.body_md5
  ) THEN RAISE EXCEPTION 'Unreviewed staff access helper; inspect live definitions before applying'; END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('companies'),('labor_safety_groups'),('labor_safety_records')) t(name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public'
      AND p.tablename=t.name AND p.policyname='account_deletion_no_revoked_access'
      AND p.permissive='RESTRICTIVE' AND p.cmd='ALL')
  ) THEN RAISE EXCEPTION 'Required account-deletion restrictive policy missing'; END IF;
END;
$prerequisites$;

-- Mirror the existing frontend matrix. Only the previously missing teacher
-- library.read and sales_manager defaults differ from the preceding SQL body.
CREATE OR REPLACE FUNCTION public.org_role_default_permissions(_role text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public
AS $function$
  SELECT CASE _role
    WHEN 'owner' THEN ARRAY[
      'courses.read','courses.write','students.read','students.write',
      'companies.read','companies.write','library.read','library.write',
      'documents.read','documents.write','journals.read','journals.write',
      'frdo.read','frdo.write','labor_safety.read','labor_safety.write',
      'services.read','services.write','staff.read','staff.write',
      'billing.read','billing.write','settings.read','settings.write',
      'chats.read','chats.write','homework.read','homework.write',
      'webinars.read','webinars.write','sales.read','sales.write'
    ]
    WHEN 'admin' THEN ARRAY[
      'courses.read','courses.write','students.read','students.write',
      'companies.read','companies.write','library.read','library.write',
      'documents.read','documents.write','journals.read','journals.write',
      'frdo.read','frdo.write','labor_safety.read','labor_safety.write',
      'services.read','services.write','staff.read',
      'billing.read','settings.read',
      'chats.read','chats.write','homework.read','homework.write',
      'webinars.read','webinars.write','sales.read'
    ]
    WHEN 'school_editor' THEN ARRAY[
      'courses.read','courses.write','library.read','library.write',
      'documents.read','services.read','services.write',
      'settings.read','webinars.read','webinars.write'
    ]
    WHEN 'course_editor' THEN ARRAY[
      'courses.read','courses.write','library.read','library.write',
      'documents.read','webinars.read'
    ]
    WHEN 'teacher' THEN ARRAY[
      'courses.read','students.read','library.read','chats.read','chats.write',
      'homework.read','homework.write','documents.read','journals.read'
    ]
    WHEN 'sales_manager' THEN ARRAY[
      'sales.read','sales.write','companies.read','companies.write',
      'services.read','documents.read','chats.read','chats.write','students.read'
    ]
    ELSE ARRAY[]::text[]
  END
$function$;

-- Limited shell metadata; never expand SELECT organizations to all columns.
-- Preserve a genuine learner's existing access to their own school. An expired
-- staff row cannot use a coinciding profile organization to restore staff access.
CREATE OR REPLACE FUNCTION public.get_organization_core(p_org_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_org record;
BEGIN
  IF v_caller IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'Not authenticated or account access revoked' USING ERRCODE='42501';
  END IF;
  IF p_org_id IS NULL OR NOT (
    public.has_role('admin'::public.app_role, v_caller)
    OR public.is_org_owner(v_caller, p_org_id)
    OR EXISTS (
      SELECT 1 FROM public.org_staff s
      WHERE s.user_id=v_caller AND s.organization_id=p_org_id
        AND (s.expires_at IS NULL OR s.expires_at>now())
    )
    OR (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=v_caller AND p.organization_id=p_org_id)
      AND NOT EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id=v_caller AND s.organization_id=p_org_id)
    )
  ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
  END IF;
  SELECT id, name, description, branding, menu_settings,
         student_dashboard_settings, subscription_plan,
         custom_enabled_categories, frdo_enabled
    INTO v_org FROM public.organizations WHERE id=p_org_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id',v_org.id,'name',v_org.name,'description',v_org.description,
    'branding',v_org.branding,'menu_settings',v_org.menu_settings,
    'student_dashboard_settings',v_org.student_dashboard_settings,
    'subscription_plan',v_org.subscription_plan,
    'custom_enabled_categories',v_org.custom_enabled_categories,
    'frdo_enabled',v_org.frdo_enabled
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_organization_core(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_core(uuid) TO authenticated, service_role;

-- Replace only the two legacy organization-wide policies. Company-owner
-- SELECT/UPDATE and any restrictive account-deletion policy stay untouched.
DROP POLICY IF EXISTS "Org users can manage their companies" ON public.companies;
DROP POLICY IF EXISTS "Org users can view their companies" ON public.companies;
CREATE POLICY "Org staff can read companies" ON public.companies
  FOR SELECT TO authenticated
  USING (public.can_access_organization(organization_id,'companies.read'));
CREATE POLICY "Org staff can insert companies" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_organization(organization_id,'companies.write'));
CREATE POLICY "Org staff can update companies" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.can_access_organization(organization_id,'companies.write'))
  WITH CHECK (public.can_access_organization(organization_id,'companies.write'));
CREATE POLICY "Org staff can delete companies" ON public.companies
  FOR DELETE TO authenticated
  USING (public.can_access_organization(organization_id,'companies.write'));

-- Replace the eight named legacy OT policies; other policies are not touched.
DROP POLICY IF EXISTS "Users can view labor safety groups of their organization" ON public.labor_safety_groups;
CREATE POLICY "Users can view labor safety groups of their organization"
  ON public.labor_safety_groups FOR SELECT TO authenticated
  USING (public.can_access_organization(organization_id,'labor_safety.read'));
DROP POLICY IF EXISTS "Users can create labor safety groups in their organization" ON public.labor_safety_groups;
CREATE POLICY "Users can create labor safety groups in their organization"
  ON public.labor_safety_groups FOR INSERT TO authenticated
  WITH CHECK (public.can_access_organization(organization_id,'labor_safety.write'));
DROP POLICY IF EXISTS "Users can update labor safety groups in their organization" ON public.labor_safety_groups;
CREATE POLICY "Users can update labor safety groups in their organization"
  ON public.labor_safety_groups FOR UPDATE TO authenticated
  USING (public.can_access_organization(organization_id,'labor_safety.write'))
  WITH CHECK (public.can_access_organization(organization_id,'labor_safety.write'));
DROP POLICY IF EXISTS "Users can delete labor safety groups in their organization" ON public.labor_safety_groups;
CREATE POLICY "Users can delete labor safety groups in their organization"
  ON public.labor_safety_groups FOR DELETE TO authenticated
  USING (public.can_access_organization(organization_id,'labor_safety.write'));

DROP POLICY IF EXISTS "Users can view labor safety records" ON public.labor_safety_records;
CREATE POLICY "Users can view labor safety records"
  ON public.labor_safety_records FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.labor_safety_groups g WHERE g.id=group_id
    AND public.can_access_organization(g.organization_id,'labor_safety.read')));
DROP POLICY IF EXISTS "Users can create labor safety records" ON public.labor_safety_records;
CREATE POLICY "Users can create labor safety records"
  ON public.labor_safety_records FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.labor_safety_groups g WHERE g.id=group_id
    AND public.can_access_organization(g.organization_id,'labor_safety.write')));
DROP POLICY IF EXISTS "Users can update labor safety records" ON public.labor_safety_records;
CREATE POLICY "Users can update labor safety records"
  ON public.labor_safety_records FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.labor_safety_groups g WHERE g.id=group_id
    AND public.can_access_organization(g.organization_id,'labor_safety.write')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.labor_safety_groups g WHERE g.id=group_id
    AND public.can_access_organization(g.organization_id,'labor_safety.write')));
DROP POLICY IF EXISTS "Users can delete labor safety records" ON public.labor_safety_records;
CREATE POLICY "Users can delete labor safety records"
  ON public.labor_safety_records FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.labor_safety_groups g WHERE g.id=group_id
    AND public.can_access_organization(g.organization_id,'labor_safety.write')));

NOTIFY pgrst, 'reload schema';
$s047_exact_0$;
BEGIN
 IF md5(replace(v_source,chr(13)||chr(10),chr(10)))<>'63d978bf48937722c42c1e99af5a71da' THEN
   RAISE EXCEPTION 'S-047 embedded migration source changed: 20261012110000'; END IF;
 EXECUTE v_source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
 VALUES('20261012110000','staff_workspace_access',ARRAY[v_source]);
END $s047_apply_0$;
-- Exact source 20261012111000_staff_documents_journals_access.sql SHA256 37f618097f38245dfaeaf8c24598a2c2e46025bb6387563500a43a277eb160e6
DO $s047_apply_1$
DECLARE v_source text := $s047_exact_1$-- Staff document lifecycle and manual journals. Prepared offline only.
-- Apply after 20261012110000_staff_workspace_access, in one transaction.
-- Existing business aggregation/whitelist/pagination remain unchanged except
-- scoped read filters, permission checks, and truthful UPDATE row-count results.
DO $preflight$
BEGIN
 IF EXISTS (SELECT 1 FROM (VALUES
  ('public.can_access_organization(uuid,text)','ad720ba20dc32362ed009b2917cc2d9c'),
  ('public.account_deletion_access_allowed()','6c078d0f1aa1f6b5af15485f0eaccb2a'),
  ('public.get_documents_kpi(uuid)','81f938320b6634424e7f59b447d85327'),
  ('public.list_recycle_bin(uuid,text,integer,integer)','1d8277c8135addea5207857d8a2af842'),
  ('public.soft_delete_document(text,uuid)','7a540b6f27ec6cb8d9e0c813b2f4e324'),
  ('public.restore_document(text,uuid)','9eff9285f82b895a746100f18883bffc')
 ) expected(signature,body_md5) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
 WHERE p.oid IS NULL OR md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))<>expected.body_md5)
 THEN RAISE EXCEPTION 'Unreviewed document helpers; capture live definitions before applying'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES('journal_instances'),('journal_entries')) t(name)
 WHERE NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=t.name AND c.relrowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.name
 AND p.policyname='account_deletion_no_revoked_access' AND p.permissive='RESTRICTIVE' AND p.cmd='ALL'))
 THEN RAISE EXCEPTION 'Journal RLS/deletion fence missing'; END IF;
END;
$preflight$;


CREATE OR REPLACE FUNCTION public.get_documents_kpi(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_current_org uuid;
  v_now timestamptz := now();
  v_month_start timestamptz := date_trunc('month', v_now);
  v_in30 timestamptz := v_now + interval '30 days';
  v_six_months_ago timestamptz := date_trunc('month', v_now - interval '5 months');
  v_result jsonb;
  v_sig_total int; v_sig_signed int; v_sig_pending int;
  v_sig_expired int; v_sig_rejected int;
  v_edu_total int; v_edu_month int; v_dup int; v_cancel int;
  v_expiring int; v_expired int;
  v_contracts_total int; v_contracts_signed int; v_contracts_pending int;
  v_prop_total int; v_prop_accepted int;
  v_pd_open int; v_pd_overdue int;
  v_inc_total int; v_inc_month int;
  v_monthly_sigs jsonb; v_monthly_edu jsonb;
BEGIN
  IF v_user IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'Authentication required or account access revoked' USING ERRCODE='42501';
  END IF;
  IF NOT public.can_access_organization(p_organization_id,'documents.read') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;

  -- Подписания
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL),
    count(*) FILTER (WHERE deleted_at IS NULL AND status = 'signed'),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('sent','viewed')),
    count(*) FILTER (WHERE deleted_at IS NULL AND status = 'expired'),
    count(*) FILTER (WHERE deleted_at IS NULL AND status = 'rejected'),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('sent','viewed') AND expires_at <= v_in30 AND expires_at >= v_now),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('sent','viewed') AND expires_at < v_now)
  INTO v_sig_total, v_sig_signed, v_sig_pending, v_sig_expired, v_sig_rejected, v_expiring, v_expired
  FROM public.document_signatures
  WHERE organization_id = p_organization_id;

  -- Документы об образовании
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL),
    count(*) FILTER (WHERE deleted_at IS NULL AND created_at >= v_month_start),
    count(*) FILTER (WHERE deleted_at IS NULL AND document_status = 'duplicate'),
    count(*) FILTER (WHERE deleted_at IS NULL AND document_status = 'cancelled')
  INTO v_edu_total, v_edu_month, v_dup, v_cancel
  FROM public.education_document_records
  WHERE organization_id = p_organization_id;

  -- Договоры с контрагентами (через JOIN с companies для org-фильтра)
  SELECT
    count(*) FILTER (WHERE cd.deleted_at IS NULL AND cd.type = 'contract'),
    count(*) FILTER (WHERE cd.deleted_at IS NULL AND cd.type = 'contract' AND cd.is_paid = true),
    count(*) FILTER (WHERE cd.deleted_at IS NULL AND cd.type = 'contract' AND COALESCE(cd.is_paid, false) = false)
  INTO v_contracts_total, v_contracts_signed, v_contracts_pending
  FROM public.company_documents cd
  JOIN public.companies c ON c.id = cd.company_id
  WHERE c.organization_id = p_organization_id;

  -- КП
  IF public.can_access_organization(p_organization_id,'sales.read') THEN
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('accepted','signed'))
  INTO v_prop_total, v_prop_accepted
  FROM public.commercial_proposals
  WHERE organization_id = p_organization_id;
  ELSE
    v_prop_total := NULL;
    v_prop_accepted := NULL;
  END IF;

  -- Запросы ПД
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('new','in_progress')),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('new','in_progress') AND due_date < v_now::date)
  INTO v_pd_open, v_pd_overdue
  FROM public.data_subject_requests
  WHERE organization_id = p_organization_id;

  -- Входящие
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL),
    count(*) FILTER (WHERE deleted_at IS NULL AND created_at >= v_month_start)
  INTO v_inc_total, v_inc_month
  FROM public.incoming_documents
  WHERE organization_id = p_organization_id;

  -- Тренд подписаний (6 мес.)
  WITH months AS (
    SELECT date_trunc('month', v_six_months_ago + (n || ' month')::interval) AS m
    FROM generate_series(0, 5) n
  ),
  sigs AS (
    SELECT date_trunc('month', created_at) AS m_sent,
           date_trunc('month', signed_at) AS m_signed
    FROM public.document_signatures
    WHERE organization_id = p_organization_id
      AND deleted_at IS NULL
      AND (created_at >= v_six_months_ago OR signed_at >= v_six_months_ago)
  )
  SELECT jsonb_agg(jsonb_build_object(
    'month', to_char(months.m, 'TMMon YY'),
    'sent', COALESCE((SELECT count(*) FROM sigs WHERE m_sent = months.m), 0),
    'signed', COALESCE((SELECT count(*) FROM sigs WHERE m_signed = months.m), 0)
  ) ORDER BY months.m)
  INTO v_monthly_sigs FROM months;

  -- Тренд документов об образовании (6 мес.)
  WITH months AS (
    SELECT date_trunc('month', v_six_months_ago + (n || ' month')::interval) AS m
    FROM generate_series(0, 5) n
  )
  SELECT jsonb_agg(jsonb_build_object(
    'month', to_char(months.m, 'TMMon YY'),
    'count', COALESCE((
      SELECT count(*) FROM public.education_document_records
      WHERE organization_id = p_organization_id
        AND deleted_at IS NULL
        AND date_trunc('month', created_at) = months.m
    ), 0)
  ) ORDER BY months.m)
  INTO v_monthly_edu FROM months;

  v_result := jsonb_build_object(
    'signatures_total', v_sig_total,
    'signatures_signed', v_sig_signed,
    'signatures_pending', v_sig_pending,
    'signatures_expired', v_sig_expired,
    'signatures_rejected', v_sig_rejected,
    'signing_conversion', CASE WHEN v_sig_total > 0 THEN round((v_sig_signed::numeric / v_sig_total) * 100) ELSE 0 END,
    'education_docs_total', v_edu_total,
    'education_docs_this_month', v_edu_month,
    'duplicates_count', v_dup,
    'cancelled_count', v_cancel,
    'expiring_soon', v_expiring,
    'expired_count', v_expired,
    'contracts_total', v_contracts_total,
    'contracts_signed', v_contracts_signed,
    'contracts_pending', v_contracts_pending,
    'proposals_total', v_prop_total,
    'proposals_accepted', v_prop_accepted,
    'proposal_to_contract_conversion', CASE WHEN v_prop_total IS NULL THEN NULL WHEN v_prop_total > 0 THEN round((v_prop_accepted::numeric / v_prop_total) * 100) ELSE 0 END,
    'pd_requests_open', v_pd_open,
    'pd_requests_overdue', v_pd_overdue,
    'incoming_total', v_inc_total,
    'incoming_this_month', v_inc_month,
    'monthly_signatures', COALESCE(v_monthly_sigs, '[]'::jsonb),
    'monthly_education_docs', COALESCE(v_monthly_edu, '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_documents_kpi(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_documents_kpi(uuid) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.list_recycle_bin(
  p_organization_id uuid,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  source_table text,
  display_name text,
  type_label text,
  meta text,
  deleted_at timestamptz,
  deleted_by uuid,
  organization_id uuid,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_current_org uuid;
  v_q text := COALESCE(NULLIF(trim(p_search), ''), NULL);
  v_search_pat text;
BEGIN
  IF v_user IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'Authentication required or account access revoked' USING ERRCODE='42501';
  END IF;
  IF NOT public.can_access_organization(p_organization_id,'documents.read') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;

  v_search_pat := CASE WHEN v_q IS NULL THEN NULL ELSE '%' || lower(v_q) || '%' END;

  RETURN QUERY
  WITH all_items AS (
    -- education_document_records
    SELECT r.id,
           'education_document_records'::text AS source_table,
           (r.full_name || ' — ' || r.reg_number)::text AS display_name,
           'Документ об образовании'::text AS type_label,
           r.document_type::text AS meta,
           r.deleted_at, r.deleted_by, r.organization_id
    FROM public.education_document_records r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL

    UNION ALL
    SELECT r.id, 'org_documents', r.name, 'Документ организации', r.type, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.org_documents r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL

    UNION ALL
    SELECT cd.id, 'company_documents', cd.name, 'Документ контрагента', cd.type, cd.deleted_at, cd.deleted_by, c.organization_id
    FROM public.company_documents cd
    JOIN public.companies c ON c.id = cd.company_id
    WHERE c.organization_id = p_organization_id AND cd.deleted_at IS NOT NULL

    UNION ALL
    SELECT r.id, 'document_signatures',
           (r.document_title || ' → ' || r.recipient_email)::text,
           'Подписание (ПЭП)', r.document_type, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.document_signatures r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL

    UNION ALL
    SELECT r.id, 'data_subject_requests',
           ('Запрос: ' || r.request_type)::text,
           'Запрос ПД (152-ФЗ)', r.status, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.data_subject_requests r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL

    UNION ALL
    SELECT r.id, 'incoming_documents',
           (COALESCE(r.title, r.doc_type) || COALESCE(' от ' || r.counterparty_name, ''))::text,
           'Входящий документ', r.doc_type, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.incoming_documents r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL

    UNION ALL
    SELECT r.id, 'document_issuance_log',
           (r.document_name || ' — ' || r.user_name)::text,
           'Запись журнала выдачи', NULL, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.document_issuance_log r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL

    UNION ALL
    SELECT r.id, 'commercial_proposals',
           ('КП: ' || r.company_name || ' (' || r.total_amount::text || ' ₽)')::text,
           'Коммерческое предложение', NULL, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.commercial_proposals r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL
      AND public.can_access_organization(p_organization_id,'sales.read')

    UNION ALL
    SELECT r.id, 'org_billing_documents', r.name, 'Счёт / Акт', r.doc_type, r.deleted_at, r.deleted_by, r.organization_id
    FROM public.org_billing_documents r
    WHERE r.organization_id = p_organization_id AND r.deleted_at IS NOT NULL
      AND public.can_access_organization(p_organization_id,'billing.read')
  ),
  filtered AS (
    SELECT ai.* FROM all_items ai
    WHERE v_search_pat IS NULL
       OR lower(ai.display_name) LIKE v_search_pat
       OR lower(ai.type_label) LIKE v_search_pat
       OR lower(COALESCE(ai.meta, '')) LIKE v_search_pat
  ),
  counted AS (
    SELECT *, count(*) OVER () AS total_count FROM filtered
  )
  SELECT counted.id, counted.source_table, counted.display_name, counted.type_label,
         counted.meta, counted.deleted_at, counted.deleted_by, counted.organization_id, counted.total_count
  FROM counted
  ORDER BY counted.deleted_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_recycle_bin(uuid,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_recycle_bin(uuid,text,integer,integer) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.soft_delete_document(p_table text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_query TEXT;
  v_org_id UUID;
  v_company_org UUID;
  v_is_admin BOOLEAN;
  v_current_org UUID;
  v_affected bigint;
  v_required_permission text := CASE p_table
    WHEN 'org_billing_documents' THEN 'billing.write'
    WHEN 'commercial_proposals' THEN 'sales.write'
    ELSE 'documents.write' END;
  v_allowed_tables TEXT[] := ARRAY[
    'education_document_records',
    'org_documents',
    'company_documents',
    'document_signatures',
    'data_subject_requests',
    'incoming_documents',
    'document_issuance_log',
    'commercial_proposals',
    'org_billing_documents'
  ];
BEGIN
  IF v_user IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'Authentication required or account access revoked' USING ERRCODE='42501';
  END IF;
  IF NOT (p_table = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not allowed for soft-delete', p_table;
  END IF;


  IF p_table = 'company_documents' THEN
    SELECT c.organization_id INTO v_company_org
    FROM public.company_documents cd
    JOIN public.companies c ON c.id = cd.company_id
    WHERE cd.id = p_id;
    IF NOT public.can_access_organization(v_company_org,v_required_permission) THEN
      RAISE EXCEPTION 'Forbidden: insufficient permission' USING ERRCODE='42501';
    END IF;
  ELSE
    v_query := format('SELECT organization_id FROM public.%I WHERE id = $1', p_table);
    EXECUTE v_query INTO v_org_id USING p_id;
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Document not found';
    END IF;
    IF NOT public.can_access_organization(v_org_id,v_required_permission) THEN
      RAISE EXCEPTION 'Forbidden: insufficient permission' USING ERRCODE='42501';
    END IF;
  END IF;

  v_query := format(
    'UPDATE public.%I SET deleted_at = now(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
    p_table
  );
  EXECUTE v_query USING v_user, p_id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.soft_delete_document(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_document(text,uuid) TO authenticated,service_role;


CREATE OR REPLACE FUNCTION public.restore_document(p_table text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_query TEXT;
  v_org_id UUID;
  v_company_org UUID;
  v_is_admin BOOLEAN;
  v_current_org UUID;
  v_affected bigint;
  v_required_permission text := CASE p_table
    WHEN 'org_billing_documents' THEN 'billing.write'
    WHEN 'commercial_proposals' THEN 'sales.write'
    ELSE 'documents.write' END;
  v_allowed_tables TEXT[] := ARRAY[
    'education_document_records',
    'org_documents',
    'company_documents',
    'document_signatures',
    'data_subject_requests',
    'incoming_documents',
    'document_issuance_log',
    'commercial_proposals',
    'org_billing_documents'
  ];
BEGIN
  IF v_user IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'Authentication required or account access revoked' USING ERRCODE='42501';
  END IF;
  IF NOT (p_table = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not allowed', p_table;
  END IF;


  -- Verify ownership before restore
  IF p_table = 'company_documents' THEN
    SELECT c.organization_id INTO v_company_org
    FROM public.company_documents cd
    JOIN public.companies c ON c.id = cd.company_id
    WHERE cd.id = p_id;
    IF NOT public.can_access_organization(v_company_org,v_required_permission) THEN
      RAISE EXCEPTION 'Forbidden: insufficient permission' USING ERRCODE='42501';
    END IF;
  ELSE
    v_query := format('SELECT organization_id FROM public.%I WHERE id = $1', p_table);
    EXECUTE v_query INTO v_org_id USING p_id;
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'Document not found';
    END IF;
    IF NOT public.can_access_organization(v_org_id,v_required_permission) THEN
      RAISE EXCEPTION 'Forbidden: insufficient permission' USING ERRCODE='42501';
    END IF;
  END IF;

  v_query := format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1',
    p_table
  );
  EXECUTE v_query USING p_id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_document(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_document(text,uuid) TO authenticated,service_role;


DROP POLICY IF EXISTS "Organization members can view their journal instances" ON public.journal_instances;
CREATE POLICY "Organization members can view their journal instances" ON public.journal_instances
 FOR SELECT TO authenticated
 USING (public.can_access_organization(organization_id,'journals.read'));

DROP POLICY IF EXISTS "Organization members can create journal instances" ON public.journal_instances;
CREATE POLICY "Organization members can create journal instances" ON public.journal_instances
 FOR INSERT TO authenticated
 WITH CHECK (public.can_access_organization(organization_id,'journals.write'));

DROP POLICY IF EXISTS "Organization members can update journal instances" ON public.journal_instances;
CREATE POLICY "Organization members can update journal instances" ON public.journal_instances
 FOR UPDATE TO authenticated
 USING (public.can_access_organization(organization_id,'journals.write'))
 WITH CHECK (public.can_access_organization(organization_id,'journals.write'));

DROP POLICY IF EXISTS "Organization members can delete journal instances" ON public.journal_instances;
CREATE POLICY "Organization members can delete journal instances" ON public.journal_instances
 FOR DELETE TO authenticated
 USING (public.can_access_organization(organization_id,'journals.write'));

DROP POLICY IF EXISTS "Organization members can view their journal entries" ON public.journal_entries;
CREATE POLICY "Organization members can view their journal entries" ON public.journal_entries
 FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.journal_instances j WHERE j.id=journal_id AND public.can_access_organization(j.organization_id,'journals.read')));

DROP POLICY IF EXISTS "Organization members can create journal entries" ON public.journal_entries;
CREATE POLICY "Organization members can create journal entries" ON public.journal_entries
 FOR INSERT TO authenticated
 WITH CHECK (EXISTS(SELECT 1 FROM public.journal_instances j WHERE j.id=journal_id AND public.can_access_organization(j.organization_id,'journals.write')));

DROP POLICY IF EXISTS "Organization members can update journal entries" ON public.journal_entries;
CREATE POLICY "Organization members can update journal entries" ON public.journal_entries
 FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.journal_instances j WHERE j.id=journal_id AND public.can_access_organization(j.organization_id,'journals.write')))
 WITH CHECK (EXISTS(SELECT 1 FROM public.journal_instances j WHERE j.id=journal_id AND public.can_access_organization(j.organization_id,'journals.write')));

DROP POLICY IF EXISTS "Organization members can delete journal entries" ON public.journal_entries;
CREATE POLICY "Organization members can delete journal entries" ON public.journal_entries
 FOR DELETE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.journal_instances j WHERE j.id=journal_id AND public.can_access_organization(j.organization_id,'journals.write')));

NOTIFY pgrst,'reload schema';
$s047_exact_1$;
BEGIN
 IF md5(replace(v_source,chr(13)||chr(10),chr(10)))<>'a5f8f6aee00ad267494362ac986904df' THEN
   RAISE EXCEPTION 'S-047 embedded migration source changed: 20261012111000'; END IF;
 EXECUTE v_source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
 VALUES('20261012111000','staff_documents_journals_access',ARRAY[v_source]);
END $s047_apply_1$;
DO $postcheck_0$ DECLARE r record; BEGIN
 FOR r IN WITH expected(signature,body_md5) AS (VALUES
 ('public.get_organization_core(uuid)','605bd6383175f8851046c2962afa4bbf'),
 ('public.org_role_default_permissions(text)','2e440ec2b8552f215d00bd88ad7af166'))
SELECT e.signature AS check_name,COALESCE(md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=e.body_md5,false) AS ok
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) LOOP
   IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'S-047 postcheck failed: %',r.check_name; END IF;
   INSERT INTO s047_release_checks VALUES(r.check_name,r.ok,to_jsonb(r));
 END LOOP;
END $postcheck_0$;
DO $postcheck_1$ DECLARE r record; BEGIN
 FOR r IN SELECT 'core authenticated execute' AS check_name,has_function_privilege('authenticated','public.get_organization_core(uuid)','EXECUTE') AS ok
UNION ALL SELECT 'core anonymous denied',NOT has_function_privilege('anon','public.get_organization_core(uuid)','EXECUTE')
UNION ALL SELECT 'core service execute',has_function_privilege('service_role','public.get_organization_core(uuid)','EXECUTE')
UNION ALL SELECT 'core no PUBLIC grant',NOT EXISTS(
 SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
 WHERE p.oid=to_regprocedure('public.get_organization_core(uuid)') AND a.grantee=0 AND a.privilege_type='EXECUTE')
UNION ALL SELECT 'legacy companies policies absent',NOT EXISTS(SELECT 1 FROM pg_policies
 WHERE schemaname='public' AND tablename='companies'
 AND policyname IN ('Org users can manage their companies','Org users can view their companies'))
UNION ALL SELECT 'company-owner SELECT and UPDATE remain',(
 SELECT count(*)=2 FROM pg_policies WHERE schemaname='public' AND tablename='companies'
 AND policyname IN ('Companies can view own record','Companies can update own record')) LOOP
   IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'S-047 postcheck failed: %',r.check_name; END IF;
   INSERT INTO s047_release_checks VALUES(r.check_name,r.ok,to_jsonb(r));
 END LOOP;
END $postcheck_1$;
DO $postcheck_2$ DECLARE r record; BEGIN
 FOR r IN WITH expected(table_name,policy_name,command,permission) AS (VALUES
 ('companies','Org staff can read companies','SELECT','companies.read'),
 ('companies','Org staff can insert companies','INSERT','companies.write'),
 ('companies','Org staff can update companies','UPDATE','companies.write'),
 ('companies','Org staff can delete companies','DELETE','companies.write'),
 ('labor_safety_groups','Users can view labor safety groups of their organization','SELECT','labor_safety.read'),
 ('labor_safety_groups','Users can create labor safety groups in their organization','INSERT','labor_safety.write'),
 ('labor_safety_groups','Users can update labor safety groups in their organization','UPDATE','labor_safety.write'),
 ('labor_safety_groups','Users can delete labor safety groups in their organization','DELETE','labor_safety.write'),
 ('labor_safety_records','Users can view labor safety records','SELECT','labor_safety.read'),
 ('labor_safety_records','Users can create labor safety records','INSERT','labor_safety.write'),
 ('labor_safety_records','Users can update labor safety records','UPDATE','labor_safety.write'),
 ('labor_safety_records','Users can delete labor safety records','DELETE','labor_safety.write'))
SELECT e.table_name||' / '||e.policy_name AS check_name,
 COALESCE(p.cmd=e.command AND p.permissive='PERMISSIVE' AND p.roles=ARRAY['authenticated']::name[]
   AND (e.command='INSERT' OR strpos(p.qual,'can_access_organization')>0 AND strpos(p.qual,e.permission)>0)
   AND (e.command NOT IN ('INSERT','UPDATE') OR strpos(p.with_check,'can_access_organization')>0 AND strpos(p.with_check,e.permission)>0),false) AS ok,
 p.qual,p.with_check
FROM expected e LEFT JOIN pg_policies p ON p.schemaname='public' AND p.tablename=e.table_name AND p.policyname=e.policy_name LOOP
   IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'S-047 postcheck failed: %',r.check_name; END IF;
   INSERT INTO s047_release_checks VALUES(r.check_name,r.ok,to_jsonb(r));
 END LOOP;
END $postcheck_2$;
DO $postcheck_3$ DECLARE r record; BEGIN
 FOR r IN SELECT t.name||' deletion fence' AS check_name,EXISTS(SELECT 1 FROM pg_policies p
 WHERE p.schemaname='public' AND p.tablename=t.name AND p.policyname='account_deletion_no_revoked_access'
 AND p.permissive='RESTRICTIVE' AND p.cmd='ALL') AS ok
FROM (VALUES('companies'),('labor_safety_groups'),('labor_safety_records')) t(name) LOOP
   IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'S-047 postcheck failed: %',r.check_name; END IF;
   INSERT INTO s047_release_checks VALUES(r.check_name,r.ok,to_jsonb(r));
 END LOOP;
END $postcheck_3$;
DO $postcheck_4$ DECLARE r record; BEGIN
 FOR r IN WITH expected(signature,body_md5) AS (VALUES ('public.get_documents_kpi(uuid)','bf2a4257aa25cc98c117cf493fd37af3'),
('public.list_recycle_bin(uuid,text,integer,integer)','809e2faab1878886e39d113c2b31a56c'),
('public.soft_delete_document(text,uuid)','1636bd7fd1137589b38939cc8c94b025'),
('public.restore_document(text,uuid)','35b9752df3748bb27fcd4244ef837512')) SELECT e.signature AS check_name,COALESCE(md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=e.body_md5,false) AS ok FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) LOOP
   IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'S-047 postcheck failed: %',r.check_name; END IF;
   INSERT INTO s047_release_checks VALUES(r.check_name,r.ok,to_jsonb(r));
 END LOOP;
END $postcheck_4$;
DO $postcheck_5$ DECLARE r record; BEGIN
 FOR r IN WITH expected(signature) AS (VALUES ('public.get_documents_kpi(uuid)'),('public.list_recycle_bin(uuid,text,integer,integer)'),('public.soft_delete_document(text,uuid)'),('public.restore_document(text,uuid)')) SELECT signature||' grants' AS check_name,has_function_privilege('authenticated',signature,'EXECUTE') AND has_function_privilege('service_role',signature,'EXECUTE') AND NOT has_function_privilege('anon',signature,'EXECUTE') AND NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure(signature) AND a.grantee=0 AND a.privilege_type='EXECUTE') AS ok FROM expected LOOP
   IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'S-047 postcheck failed: %',r.check_name; END IF;
   INSERT INTO s047_release_checks VALUES(r.check_name,r.ok,to_jsonb(r));
 END LOOP;
END $postcheck_5$;
DO $postcheck_6$ DECLARE r record; BEGIN
 FOR r IN WITH expected(table_name,policy_name,command,permission) AS (VALUES ('journal_instances','Organization members can view their journal instances','SELECT','journals.read'),
('journal_instances','Organization members can create journal instances','INSERT','journals.write'),
('journal_instances','Organization members can update journal instances','UPDATE','journals.write'),
('journal_instances','Organization members can delete journal instances','DELETE','journals.write'),
('journal_entries','Organization members can view their journal entries','SELECT','journals.read'),
('journal_entries','Organization members can create journal entries','INSERT','journals.write'),
('journal_entries','Organization members can update journal entries','UPDATE','journals.write'),
('journal_entries','Organization members can delete journal entries','DELETE','journals.write')) SELECT e.table_name||' / '||e.policy_name AS check_name,COALESCE(p.cmd=e.command AND p.permissive='PERMISSIVE' AND p.roles=ARRAY['authenticated']::name[] AND (e.command='INSERT' OR strpos(p.qual,'can_access_organization')>0 AND strpos(p.qual,e.permission)>0) AND (e.command NOT IN ('INSERT','UPDATE') OR strpos(p.with_check,'can_access_organization')>0 AND strpos(p.with_check,e.permission)>0),false) AS ok FROM expected e LEFT JOIN pg_policies p ON p.schemaname='public' AND p.tablename=e.table_name AND p.policyname=e.policy_name LOOP
   IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'S-047 postcheck failed: %',r.check_name; END IF;
   INSERT INTO s047_release_checks VALUES(r.check_name,r.ok,to_jsonb(r));
 END LOOP;
END $postcheck_6$;
DO $postcheck_7$ DECLARE r record; BEGIN
 FOR r IN SELECT t.name||' deletion fence' AS check_name,EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.name AND p.policyname='account_deletion_no_revoked_access' AND p.permissive='RESTRICTIVE' AND p.cmd='ALL') AS ok FROM (VALUES('journal_instances'),('journal_entries')) t(name) LOOP
   IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'S-047 postcheck failed: %',r.check_name; END IF;
   INSERT INTO s047_release_checks VALUES(r.check_name,r.ok,to_jsonb(r));
 END LOOP;
END $postcheck_7$;
DO $preserved$
BEGIN
 IF EXISTS((SELECT * FROM s047_preserved_functions EXCEPT SELECT 'public.'||f.signature AS signature,pg_get_functiondef(p.oid) AS definition,
  p.proowner,p.proacl,p.prosecdef,p.proconfig FROM (VALUES ('account_deletion_access_allowed()'),
('can_access_organization(uuid,text)'),
('current_organization_id()'),
('get_org_staff_permissions(uuid,uuid)'),
('get_user_role(uuid)'),
('has_org_staff_permission(uuid,uuid,text)'),
('has_role(uuid,app_role)'),
('has_role(app_role,uuid)'),
('is_org_owner(uuid,uuid)'),
('normalize_org_staff_permission(text)')) f(signature)
  JOIN pg_proc p ON p.oid=to_regprocedure('public.'||f.signature))
   UNION ALL (SELECT 'public.'||f.signature AS signature,pg_get_functiondef(p.oid) AS definition,
  p.proowner,p.proacl,p.prosecdef,p.proconfig FROM (VALUES ('account_deletion_access_allowed()'),
('can_access_organization(uuid,text)'),
('current_organization_id()'),
('get_org_staff_permissions(uuid,uuid)'),
('get_user_role(uuid)'),
('has_org_staff_permission(uuid,uuid,text)'),
('has_role(uuid,app_role)'),
('has_role(app_role,uuid)'),
('is_org_owner(uuid,uuid)'),
('normalize_org_staff_permission(text)')) f(signature)
  JOIN pg_proc p ON p.oid=to_regprocedure('public.'||f.signature) EXCEPT SELECT * FROM s047_preserved_functions)) THEN
   RAISE EXCEPTION 'S-047 changed an untouched function definition/ACL'; END IF;
 IF EXISTS((SELECT * FROM s047_preserved_policies EXCEPT SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies p WHERE schemaname='public'
  AND (tablename='organizations' OR (tablename IN ('companies','labor_safety_groups','labor_safety_records','journal_instances','journal_entries')
   AND (policyname='account_deletion_no_revoked_access' OR policyname IN ('Companies can view own record','Companies can update own record')))))
   UNION ALL (SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies p WHERE schemaname='public'
  AND (tablename='organizations' OR (tablename IN ('companies','labor_safety_groups','labor_safety_records','journal_instances','journal_entries')
   AND (policyname='account_deletion_no_revoked_access' OR policyname IN ('Companies can view own record','Companies can update own record')))) EXCEPT SELECT * FROM s047_preserved_policies)) THEN
   RAISE EXCEPTION 'S-047 changed a retained organization/company-owner/deletion policy'; END IF;
 IF EXISTS(SELECT 1 FROM s047_preserved_table_security b JOIN pg_class c ON c.oid=b.oid
   WHERE ROW(b.relowner,b.relacl,b.relrowsecurity,b.relforcerowsecurity)
    IS DISTINCT FROM ROW(c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity)) THEN
   RAISE EXCEPTION 'S-047 changed table ownership/grants/RLS'; END IF;
 IF (SELECT count(*) FROM s047_release_checks)<>41 OR EXISTS(SELECT 1 FROM s047_release_checks WHERE ok IS DISTINCT FROM true) THEN
   RAISE EXCEPTION 'S-047 requires exactly 41 successful postchecks'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('20261012110000','staff_workspace_access','63d978bf48937722c42c1e99af5a71da'),
('20261012111000','staff_documents_journals_access','a5f8f6aee00ad267494362ac986904df')) e(version,name,source_md5)
   LEFT JOIN supabase_migrations.schema_migrations m ON m.version=e.version
   WHERE m.version IS NULL OR m.name IS DISTINCT FROM e.name OR cardinality(m.statements) IS DISTINCT FROM 1
    OR md5(replace(m.statements[1],chr(13)||chr(10),chr(10))) IS DISTINCT FROM e.source_md5) THEN
   RAISE EXCEPTION 'S-047 exact migration ledger postcheck failed'; END IF;
END $preserved$;
INSERT INTO s047_release_result SELECT jsonb_build_object(
 'release','S-047 staff workspace','migrations','["20261012110000_staff_workspace_access.sql","20261012111000_staff_documents_journals_access.sql"]'::jsonb,
 'checks_passed',count(*),'all_checks_passed',bool_and(ok),
 'preserved_functions',(SELECT count(*) FROM s047_preserved_functions),
 'preserved_policies',(SELECT count(*) FROM s047_preserved_policies),
 'preserved_table_security',(SELECT count(*) FROM s047_preserved_table_security),
 'checked_at',clock_timestamp(),'application_transaction',txid_current(),
 'migration_ledger_changed',true,'ledger_rows_added',2,'ledger_source_checks_passed',2,'business_rows_changed',false,
 'checks',jsonb_agg(details ORDER BY check_name)) FROM s047_release_checks;
NOTIFY pgrst,'reload schema';
COMMIT;
-- This result is available only after the complete transaction commits successfully.
SELECT result||jsonb_build_object('committed',true) AS release_result FROM s047_release_result;
