import { PGlite } from '@electric-sql/pglite';
import { installPostpaidPrerequisites } from './postpaid-billing.fixture';

// This is a DDL/transaction integration fixture, not a replica of hosted data or
// a replacement for the separate full permission/payment behavioral suites.
export async function createReleaseBatchFixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE ROLE fixture_release NOSUPERUSER; CREATE ROLE fixture_extension_owner NOSUPERUSER;
    CREATE SCHEMA auth; CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TYPE public.app_role AS ENUM('admin','organization','student','sales_manager','company');
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE organizations(id uuid PRIMARY KEY,balance numeric NOT NULL DEFAULT 0,subscription_plan text,paid_until timestamptz,
      custom_price numeric,custom_discount numeric,branding jsonb);
    CREATE TABLE profiles(user_id uuid PRIMARY KEY,organization_id uuid,archived_at timestamptz,full_name text,email text);
    CREATE TABLE user_roles(user_id uuid UNIQUE,role public.app_role);
    CREATE TABLE account_deletion_revocations(user_id uuid PRIMARY KEY);
    CREATE TABLE subscription_invoices(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),invoice_number text,
      invoice_date date DEFAULT current_date,plan text,amount numeric(12,2),period_months int,status text,created_at timestamptz DEFAULT now(),
      payment_id text,payment_method text,paid_at timestamptz,buyer_name text,buyer_inn text,buyer_kpp text);
    CREATE TABLE courses(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),title text,default_access_days int);
    CREATE TABLE course_payments(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),course_id uuid REFERENCES courses(id),
      user_id uuid,amount numeric,status text,robokassa_inv_id bigint UNIQUE,payment_method text,paid_at timestamptz);
    CREATE TABLE enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,course_id uuid REFERENCES courses(id),
      status text,progress int,access_days int,expires_at timestamptz,started_at timestamptz DEFAULT now(),completed_at timestamptz,
      UNIQUE(user_id,course_id));
    CREATE TABLE balance_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations(id),
      amount numeric,type text,description text,related_order_id uuid,performed_by uuid);
    CREATE TABLE admin_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text,title text,message text,related_entity_id text,metadata jsonb);
    CREATE TABLE admin_staff(user_id uuid,role text);
    CREATE TABLE org_staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,role text,
      display_name text,can_receive_crm_tasks boolean,expires_at timestamptz);
    CREATE TABLE sales_managers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE,full_name text,is_active boolean);
    CREATE TABLE sales_leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,assigned_manager_id uuid,status text,updated_at timestamptz);
    CREATE TABLE sales_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,lead_id uuid);
    CREATE TABLE sales_lead_activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,lead_id uuid,manager_id uuid,activity_type text,description text);
    CREATE TABLE skillspace_import_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,batch_id uuid,created_by uuid,
      status text,url text,login text,password text,result jsonb,error_message text);
    CREATE FUNCTION public.has_role(p_role public.app_role,p_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_uid AND role=p_role)$$;
    CREATE FUNCTION public.current_organization_id() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT organization_id FROM public.profiles WHERE user_id=auth.uid()$$;
    CREATE FUNCTION public.account_deletion_access_allowed() RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid())$$;
    CREATE FUNCTION public.can_access_organization(_organization_id uuid,_permission text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT _organization_id=public.current_organization_id() OR public.has_role('admin',auth.uid())$$;
    CREATE FUNCTION public.is_org_owner(p_user uuid,p_org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS(SELECT 1 FROM profiles WHERE user_id=p_user AND organization_id=p_org) AND public.has_role('organization',p_user)$$;
    ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY; ALTER TABLE sales_tasks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sales_lead_activities ENABLE ROW LEVEL SECURITY; ALTER TABLE skillspace_import_jobs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY sales_leads_sm_all ON sales_leads FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY sales_tasks_select ON sales_tasks FOR SELECT TO authenticated USING(true);
    CREATE POLICY sales_lead_activities_sm_all ON sales_lead_activities FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY "Admins can view all import jobs" ON skillspace_import_jobs FOR SELECT TO authenticated USING(has_role('admin'::app_role,auth.uid()));
    CREATE POLICY "Admins can insert import jobs" ON skillspace_import_jobs FOR INSERT TO authenticated WITH CHECK(has_role('admin'::app_role,auth.uid()));
    CREATE POLICY "Org users can insert own import jobs" ON skillspace_import_jobs FOR INSERT TO authenticated WITH CHECK(organization_id=current_organization_id());
    CREATE POLICY account_deletion_no_revoked_access ON skillspace_import_jobs AS RESTRICTIVE FOR ALL TO authenticated
      USING(account_deletion_access_allowed()) WITH CHECK(account_deletion_access_allowed());
    CREATE TABLE org_crm_fixture(id int PRIMARY KEY,note text);
    ALTER TABLE org_crm_fixture ENABLE ROW LEVEL SECURITY;
    CREATE POLICY unrelated_policy ON org_crm_fixture FOR SELECT USING(false);
    INSERT INTO org_crm_fixture VALUES(1,'Unrelated business row');
    INSERT INTO organizations VALUES('10000000-0000-0000-0000-000000000000',1234,'professional','2040-12-31',10000,25,'{"logo":"fixture","orgTheme":{"density":"compact"}}');
    INSERT INTO auth.users(id,email) VALUES('20000000-0000-0000-0000-000000000000','fixture@example.invalid');
    INSERT INTO profiles VALUES('20000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000000',NULL,'Synthetic admin','fixture@example.invalid');
    INSERT INTO user_roles VALUES('20000000-0000-0000-0000-000000000000','admin');
    INSERT INTO subscription_invoices(id,organization_id,invoice_number,plan,amount,period_months,status,payment_method)
      VALUES('30000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000000','fixture-pending','start',3490,1,'pending','tbank');
    INSERT INTO balance_transactions(organization_id,amount,type,description)
      VALUES('10000000-0000-0000-0000-000000000000',1234,'payment','Synthetic historical credit');
    INSERT INTO skillspace_import_jobs(organization_id,batch_id,created_by,status,url,login,password)
      VALUES('10000000-0000-0000-0000-000000000000','40000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000000','pending','https://fixture.invalid','fixture','not-a-real-credential');
  `);
  await installPostpaidPrerequisites(db);
  // Synthetic Vault/pg_cron APIs, matching billing-scheduler.sql.test.ts.
  // No extension, hosted database, production credential or network is used.
  await db.exec(`CREATE SCHEMA vault; CREATE SCHEMA cron; CREATE SCHEMA net;
    CREATE TABLE vault.secrets(id uuid DEFAULT gen_random_uuid(),name text UNIQUE,secret text,description text);
    CREATE VIEW vault.decrypted_secrets AS SELECT name,secret AS decrypted_secret FROM vault.secrets;
    CREATE FUNCTION vault.create_secret(new_secret text,new_name text DEFAULT NULL,new_description text DEFAULT '',new_key_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
      DECLARE result uuid; BEGIN INSERT INTO vault.secrets(name,secret,description) VALUES(new_name,new_secret,new_description) RETURNING id INTO result; RETURN result; END$$;
    CREATE TABLE cron.job(jobid bigint PRIMARY KEY,jobname text UNIQUE,schedule text,command text,active boolean,
      username text DEFAULT 'fixture_release',database text DEFAULT current_database());
    -- Models the C extension's internal owner switch, without granting direct
    -- cron-table mutation rights to the synthetic release role.
    CREATE FUNCTION cron.alter_job(job_id bigint,schedule text DEFAULT NULL,command text DEFAULT NULL,database text DEFAULT NULL,username text DEFAULT NULL,active boolean DEFAULT NULL)
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
      BEGIN
        IF schedule IS NULL AND command IS NULL AND database IS NULL AND username IS NULL AND active IS NULL THEN RAISE EXCEPTION 'no updates specified'; END IF;
        UPDATE cron.job j SET command=coalesce($3,j.command),active=coalesce($6,j.active),schedule=coalesce($2,j.schedule),database=coalesce($4,j.database),username=coalesce($5,j.username)
          WHERE j.jobid=$1 AND j.username=coalesce(nullif(current_setting('role'),'none'),session_user);
        IF NOT FOUND THEN RAISE EXCEPTION 'Job does not exist or you do not own it'; END IF;
      END$$;
    CREATE TABLE fixture_http(headers jsonb,timeout_ms integer,url text);
    CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer DEFAULT 1000) RETURNS bigint LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO fixture_http VALUES(headers,timeout_milliseconds,url);RETURN 1;END$$;
    INSERT INTO vault.secrets(name,secret,description) VALUES('unrelated_fixture_secret','synthetic-not-live','Preservation witness');
    INSERT INTO cron.job(jobid,jobname,schedule,command,active) VALUES(1,'unrelated-fixture-job','0 1 * * *','SELECT 1',true);`);
  await db.query('INSERT INTO cron.job(jobid,jobname,schedule,command,active) VALUES(2,$1,$2,$3,true)', ['check-subscription-expiry-daily','0 9 * * *',
    `SELECT net.http_post(url:='https://atxwvjxbqjgkbjlhsdch.supabase.co/functions/v1/check-subscription-expiry',headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJ.fixture.signature"}'::jsonb,body:='{}'::jsonb) AS request_id;`]);
  await db.exec(`
    -- Existing business objects are owned by the release role, as in hosted
    -- postgres. Extension objects have a separate owner and restricted grants.
    DO $$ DECLARE item record; BEGIN
      FOR item IN SELECT c.oid::regclass AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN('public','auth','supabase_migrations') AND c.relkind='r'
      LOOP EXECUTE format('ALTER TABLE %s OWNER TO fixture_release',item.name); END LOOP;
      FOR item IN SELECT p.oid::regprocedure AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN('public','auth') AND p.prokind='f'
      LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO fixture_release',item.name); END LOOP;
    END $$;
    ALTER TABLE cron.job OWNER TO fixture_extension_owner;
    ALTER TABLE vault.secrets OWNER TO fixture_extension_owner;
    ALTER VIEW vault.decrypted_secrets OWNER TO fixture_extension_owner;
    ALTER FUNCTION cron.alter_job(bigint,text,text,text,text,boolean) OWNER TO fixture_extension_owner;
    ALTER FUNCTION vault.create_secret(text,text,text,uuid) OWNER TO fixture_extension_owner;
    GRANT USAGE ON SCHEMA cron,vault TO fixture_extension_owner,fixture_release;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role,fixture_release;
    GRANT USAGE ON SCHEMA supabase_migrations TO fixture_release;
    GRANT CREATE ON SCHEMA public TO fixture_release;
    GRANT SELECT ON cron.job,vault.secrets,vault.decrypted_secrets TO fixture_release;
    GRANT DELETE ON vault.secrets TO fixture_release;
    REVOKE ALL ON FUNCTION cron.alter_job(bigint,text,text,text,text,boolean),vault.create_secret(text,text,text,uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION cron.alter_job(bigint,text,text,text,text,boolean),vault.create_secret(text,text,text,uuid) TO fixture_release;
    SET ROLE fixture_release;
  `);
  return db;
}
