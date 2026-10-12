-- Isolated extension: called after regression-rollback.sql in the SAME fixture
-- transaction. The runner rolls everything back; never run against live data.
DO $$ BEGIN
 IF current_setting('sintagma.staff_access_fixture',true) IS DISTINCT FROM 'isolated' THEN
  RAISE EXCEPTION 'Isolated synthetic fixture required';
 END IF;
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SELECT synthetic_assert((get_documents_kpi(synthetic_uid(100))->>'incoming_total')::int=1,'staff admin KPI through membership A');
SELECT synthetic_assert((get_documents_kpi(synthetic_uid(100))->>'proposals_total')::int=1,'sales.read admin sees actual proposal total');
SELECT synthetic_assert(jsonb_array_length(get_documents_kpi(synthetic_uid(100))->'monthly_signatures')=6,'KPI monthly output preserved');
SELECT synthetic_assert(soft_delete_document('org_documents',synthetic_uid(601)),'successful delete returns true');
SELECT synthetic_assert(NOT soft_delete_document('org_documents',synthetic_uid(601)),'repeated delete returns false on no-op');
SELECT synthetic_assert((SELECT count(*)=3 FROM list_recycle_bin(synthetic_uid(100))),'admin recycle includes permitted docs sales billing');
SELECT synthetic_assert((SELECT bool_and(total_count=3) FROM list_recycle_bin(synthetic_uid(100),NULL,1,0)),'recycle total count before pagination preserved');
SELECT synthetic_assert((SELECT count(*)=1 FROM list_recycle_bin(synthetic_uid(100),'Synthetic document')),'recycle search preserved');
SELECT synthetic_denied('SELECT soft_delete_document(''org_documents'',synthetic_uid(602))','cross-tenant document deletion denied');
SELECT synthetic_denied('SELECT restore_document(''org_documents'',synthetic_uid(602))','cross-tenant restore denied');
SELECT synthetic_denied('SELECT get_documents_kpi(synthetic_uid(200))','cross-tenant KPI denied despite profile B');
SELECT synthetic_denied('SELECT * FROM list_recycle_bin(synthetic_uid(200))','cross-tenant recycle denied');
SELECT synthetic_denied('SELECT soft_delete_document(''commercial_proposals'',synthetic_uid(605))','docs.write does not imply sales.write');
SELECT synthetic_denied('SELECT restore_document(''commercial_proposals'',synthetic_uid(606))','docs.write cannot restore sales');
SELECT synthetic_denied('SELECT soft_delete_document(''org_billing_documents'',synthetic_uid(607))','docs.write does not imply billing.write');
SELECT synthetic_denied('SELECT restore_document(''org_billing_documents'',synthetic_uid(608))','docs.write cannot restore billing');
SELECT synthetic_assert(soft_delete_document('company_documents',synthetic_uid(603)),'staff can delete own-org company document');
SELECT synthetic_assert(restore_document('company_documents',synthetic_uid(603)),'staff can restore own-org company document');
SELECT synthetic_denied('SELECT soft_delete_document(''company_documents'',synthetic_uid(604))','foreign company document denied');
RESET ROLE;
SELECT synthetic_assert((SELECT deleted_at IS NOT NULL AND deleted_by=synthetic_uid(3) FROM org_documents WHERE id=synthetic_uid(601)),'delete actually changed document and attributed staff');
SELECT synthetic_assert((SELECT deleted_at IS NULL FROM org_documents WHERE id=synthetic_uid(602)),'foreign document remains unchanged');
SELECT synthetic_assert((SELECT deleted_at IS NULL FROM company_documents WHERE id=synthetic_uid(603)),'company document restored');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
SELECT synthetic_assert(get_documents_kpi(synthetic_uid(100))->'proposals_total'='null'::jsonb,'teacher proposal total null rather than false zero');
SELECT synthetic_assert(get_documents_kpi(synthetic_uid(100))->'proposals_accepted'='null'::jsonb,'teacher proposal accepted null');
SELECT synthetic_assert(get_documents_kpi(synthetic_uid(100))->'proposal_to_contract_conversion'='null'::jsonb,'teacher proposal conversion null');
SELECT synthetic_assert((get_documents_kpi(synthetic_uid(100))->>'incoming_total')::int=1,'teacher allowed document KPI retained');
SELECT synthetic_assert((SELECT count(*)=1 FROM list_recycle_bin(synthetic_uid(100))),'teacher recycle excludes sales and billing rows');
SELECT synthetic_assert((SELECT bool_and(total_count=1) FROM list_recycle_bin(synthetic_uid(100))),'teacher recycle count excludes hidden rows');
SELECT synthetic_denied('SELECT soft_delete_document(''org_documents'',synthetic_uid(601))','teacher docs.read cannot delete');
SELECT synthetic_denied('SELECT restore_document(''org_documents'',synthetic_uid(601))','teacher docs.read cannot restore');
SELECT synthetic_assert((SELECT count(*)=1 FROM journal_instances),'teacher default journals.read');
SELECT synthetic_assert((SELECT count(*)=1 FROM journal_entries),'teacher sees own-org journal entries');
SELECT synthetic_denied('INSERT INTO journal_instances VALUES(synthetic_uid(703),synthetic_uid(100),''denied'')','teacher journals.read cannot create');
SELECT synthetic_denied('INSERT INTO journal_entries VALUES(synthetic_uid(713),synthetic_uid(701),synthetic_uid(8),''denied'')','teacher cannot write entries');
WITH changed AS(UPDATE journal_entries SET value='denied' RETURNING id)
 SELECT synthetic_assert((SELECT count(*)=0 FROM changed),'teacher cannot update entries');

SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000006';
SELECT synthetic_assert((SELECT count(*)=2 FROM list_recycle_bin(synthetic_uid(100))),'sales staff sees docs and sales, not billing');
SELECT synthetic_assert(soft_delete_document('commercial_proposals',synthetic_uid(605)),'sales.write can delete proposal');
SELECT synthetic_assert(restore_document('commercial_proposals',synthetic_uid(605)),'sales.write can restore proposal');
SELECT synthetic_denied('SELECT restore_document(''org_documents'',synthetic_uid(601))','sales staff cannot restore docs without documents.write');
SELECT synthetic_assert((SELECT count(*)=0 FROM journal_instances),'sales staff no journal permission');

SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SELECT synthetic_assert(restore_document('org_documents',synthetic_uid(601)),'successful restore returns true');
SELECT synthetic_assert((SELECT count(*)=1 FROM journal_instances),'admin journals through membership, not profile B');
SELECT synthetic_assert((SELECT count(*)=1 FROM journal_entries),'admin own journal entries only');
INSERT INTO journal_instances VALUES(synthetic_uid(703),synthetic_uid(100),'new journal');
INSERT INTO journal_entries VALUES(synthetic_uid(713),synthetic_uid(703),synthetic_uid(8),'initial');
UPDATE journal_entries SET value='updated' WHERE id=synthetic_uid(713);
SELECT synthetic_assert((SELECT value='updated' FROM journal_entries WHERE id=synthetic_uid(713)),'journal entry CRUD update');
SELECT synthetic_denied('UPDATE journal_instances SET organization_id=synthetic_uid(200) WHERE id=synthetic_uid(703)','journal tenant move denied');
SELECT synthetic_denied('UPDATE journal_entries SET journal_id=synthetic_uid(702) WHERE id=synthetic_uid(713)','journal entry foreign move denied');
SELECT synthetic_denied('INSERT INTO journal_entries VALUES(synthetic_uid(714),synthetic_uid(702),synthetic_uid(8),''denied'')','journal entry foreign insert denied');
DELETE FROM journal_entries WHERE id=synthetic_uid(713);
DELETE FROM journal_instances WHERE id=synthetic_uid(703);
SELECT synthetic_assert((SELECT count(*)=0 FROM journal_instances WHERE id=synthetic_uid(703)),'journal CRUD delete');
RESET ROLE;
SELECT synthetic_assert((SELECT deleted_at IS NULL AND deleted_by IS NULL FROM org_documents WHERE id=synthetic_uid(601)),'restore actually cleared deletion metadata');
SELECT synthetic_assert((SELECT value='B' FROM journal_entries WHERE id=synthetic_uid(712)),'foreign journal content unchanged');

-- Personal grants add only the corresponding domain, never organization ownership.
UPDATE org_staff SET sections_access=sections_access||'["billing.read","billing.write","journals.write"]'::jsonb WHERE user_id=synthetic_uid(10);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000010';
SELECT synthetic_assert(soft_delete_document('org_billing_documents',synthetic_uid(607)),'explicit billing.write override can delete billing document');
SELECT synthetic_assert(restore_document('org_billing_documents',synthetic_uid(607)),'explicit billing.write override can restore billing document');
INSERT INTO journal_instances VALUES(synthetic_uid(703),synthetic_uid(100),'override journal');
DELETE FROM journal_instances WHERE id=synthetic_uid(703);
SELECT synthetic_assert((SELECT count(*)=0 FROM journal_instances WHERE id=synthetic_uid(703)),'explicit journal write override');

SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
SELECT synthetic_denied('SELECT get_documents_kpi(synthetic_uid(100))','expired staff KPI denied');
SELECT synthetic_denied('SELECT soft_delete_document(''org_documents'',synthetic_uid(601))','expired staff delete denied');
SELECT synthetic_assert((SELECT count(*)=0 FROM journal_instances),'expired same-profile staff journal denied');
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000009';
SELECT synthetic_denied('SELECT get_documents_kpi(synthetic_uid(100))','revoked staff KPI denied');
SELECT synthetic_denied('SELECT * FROM list_recycle_bin(synthetic_uid(100))','revoked staff recycle denied');
SELECT synthetic_denied('SELECT soft_delete_document(''org_documents'',synthetic_uid(601))','revoked staff delete denied');
SELECT synthetic_denied('SELECT restore_document(''org_documents'',synthetic_uid(601))','revoked staff restore denied');
SELECT synthetic_assert((SELECT count(*)=0 FROM journal_instances),'revoked journal instances denied');
SELECT synthetic_assert((SELECT count(*)=0 FROM journal_entries),'revoked journal entries denied');
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000008';
SELECT synthetic_denied('SELECT get_documents_kpi(synthetic_uid(100))','ordinary learner cannot read organization KPI');
SELECT synthetic_assert((SELECT count(*)=0 FROM journal_entries),'ordinary learner gets no organization journal management');
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
SELECT synthetic_assert((SELECT count(*)=1 FROM journal_instances),'real owner journal access preserved');
SELECT synthetic_assert(soft_delete_document('org_billing_documents',synthetic_uid(607)),'real owner billing delete retained');
SELECT synthetic_assert(restore_document('org_billing_documents',synthetic_uid(607)),'real owner billing restore retained');
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
SELECT synthetic_assert((SELECT count(*)=2 FROM journal_entries),'global admin journal access');
SELECT synthetic_assert((get_documents_kpi(synthetic_uid(100))->>'proposals_total')::int=1,'global admin KPI shape');
SET LOCAL request.jwt.claim.sub='';
SELECT synthetic_denied('SELECT get_documents_kpi(synthetic_uid(100))','missing actor KPI denied');
SELECT synthetic_denied('SELECT * FROM list_recycle_bin(synthetic_uid(100))','missing actor recycle denied');
SELECT synthetic_denied('SELECT soft_delete_document(''org_documents'',synthetic_uid(601))','missing actor delete denied');
SELECT synthetic_denied('SELECT restore_document(''org_documents'',synthetic_uid(601))','missing actor restore denied');
RESET ROLE;
