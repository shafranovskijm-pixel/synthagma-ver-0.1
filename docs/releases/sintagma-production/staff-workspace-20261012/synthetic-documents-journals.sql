-- Isolated fixture extension only; same transaction/ROLLBACK as main runner.
DO $$ BEGIN
 IF current_setting('sintagma.staff_access_fixture',true) IS DISTINCT FROM 'isolated' THEN
  RAISE EXCEPTION 'Isolated synthetic fixture required';
 END IF;
END $$;
CREATE TABLE journal_instances(id uuid PRIMARY KEY,organization_id uuid,title text);
CREATE TABLE journal_entries(id uuid PRIMARY KEY,journal_id uuid REFERENCES journal_instances(id),user_id uuid,value text);
ALTER TABLE journal_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_deletion_no_revoked_access ON journal_instances AS RESTRICTIVE FOR ALL TO authenticated
 USING(account_deletion_access_allowed()) WITH CHECK(account_deletion_access_allowed());
CREATE POLICY account_deletion_no_revoked_access ON journal_entries AS RESTRICTIVE FOR ALL TO authenticated
 USING(account_deletion_access_allowed()) WITH CHECK(account_deletion_access_allowed());
CREATE TABLE org_documents(id uuid PRIMARY KEY,organization_id uuid,name text,type text,deleted_at timestamptz,deleted_by uuid);
CREATE TABLE education_document_records(id uuid PRIMARY KEY,organization_id uuid,full_name text,reg_number text,document_type text,document_status text,
 created_at timestamptz DEFAULT now(),deleted_at timestamptz,deleted_by uuid);
CREATE TABLE document_signatures(id uuid PRIMARY KEY,organization_id uuid,document_title text,recipient_email text,document_type text,status text,
 created_at timestamptz DEFAULT now(),signed_at timestamptz,expires_at timestamptz,deleted_at timestamptz,deleted_by uuid);
CREATE TABLE company_documents(id uuid PRIMARY KEY,company_id uuid,name text,type text,is_paid boolean,deleted_at timestamptz,deleted_by uuid);
CREATE TABLE commercial_proposals(id uuid PRIMARY KEY,organization_id uuid,company_name text,total_amount numeric,status text,deleted_at timestamptz,deleted_by uuid);
CREATE TABLE data_subject_requests(id uuid PRIMARY KEY,organization_id uuid,request_type text,status text,due_date date,deleted_at timestamptz,deleted_by uuid);
CREATE TABLE incoming_documents(id uuid PRIMARY KEY,organization_id uuid,title text,doc_type text,counterparty_name text,
 created_at timestamptz DEFAULT now(),deleted_at timestamptz,deleted_by uuid);
CREATE TABLE document_issuance_log(id uuid PRIMARY KEY,organization_id uuid,document_name text,user_name text,deleted_at timestamptz,deleted_by uuid);
CREATE TABLE org_billing_documents(id uuid PRIMARY KEY,organization_id uuid,name text,doc_type text,deleted_at timestamptz,deleted_by uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON journal_instances,journal_entries TO authenticated;
-- No direct document table grants: SECURITY DEFINER RPC authorization is tested
-- without relying on a permissive table policy or granting fixture users SQL DML.
INSERT INTO journal_instances VALUES
 ('00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000100','Synthetic journal A'),
 ('00000000-0000-0000-0000-000000000702','00000000-0000-0000-0000-000000000200','Synthetic journal B');
INSERT INTO journal_entries VALUES
 ('00000000-0000-0000-0000-000000000711','00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000008','A'),
 ('00000000-0000-0000-0000-000000000712','00000000-0000-0000-0000-000000000702','00000000-0000-0000-0000-000000000008','B');
INSERT INTO org_documents VALUES
 ('00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000100','Synthetic document A','document',NULL,NULL),
 ('00000000-0000-0000-0000-000000000602','00000000-0000-0000-0000-000000000200','Synthetic document B','document',NULL,NULL);
INSERT INTO company_documents VALUES
 ('00000000-0000-0000-0000-000000000603','00000000-0000-0000-0000-000000000301','Synthetic contract A','contract',true,NULL,NULL),
 ('00000000-0000-0000-0000-000000000604','00000000-0000-0000-0000-000000000302','Synthetic contract B','contract',false,NULL,NULL);
INSERT INTO commercial_proposals VALUES
 ('00000000-0000-0000-0000-000000000605','00000000-0000-0000-0000-000000000100','Synthetic proposal A',100,'accepted',NULL,NULL),
 ('00000000-0000-0000-0000-000000000606','00000000-0000-0000-0000-000000000100','Deleted proposal',100,'sent',now(),NULL);
INSERT INTO org_billing_documents VALUES
 ('00000000-0000-0000-0000-000000000607','00000000-0000-0000-0000-000000000100','Synthetic invoice A','invoice',NULL,NULL),
 ('00000000-0000-0000-0000-000000000608','00000000-0000-0000-0000-000000000100','Deleted invoice','invoice',now(),NULL);
INSERT INTO incoming_documents(id,organization_id,title) VALUES
 ('00000000-0000-0000-0000-000000000609','00000000-0000-0000-0000-000000000100','Synthetic incoming A');
