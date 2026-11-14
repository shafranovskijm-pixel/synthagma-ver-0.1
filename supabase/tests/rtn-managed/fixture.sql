-- Disposable loopback PostgreSQL17 fixture only. No live project claims,
-- accounts, files or keys. Guards are installed from released-guards.sql.
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres NOLOGIN BYPASSRLS NOSUPERUSER;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS;END IF;
END;$$;
GRANT anon,authenticated,service_role TO postgres;
ALTER SCHEMA public OWNER TO postgres;
GRANT CREATE ON DATABASE rtn_lab_ci TO postgres;
CREATE SCHEMA auth AUTHORIZATION postgres;
CREATE SCHEMA storage AUTHORIZATION postgres;
CREATE SCHEMA billing_access_private AUTHORIZATION postgres;
CREATE SCHEMA lab AUTHORIZATION postgres;
SET ROLE postgres;
GRANT USAGE ON SCHEMA auth,public,lab,storage TO anon,authenticated,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
CREATE TYPE public.app_role AS ENUM('admin','organization','student','sales_manager','company');
CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text,is_paid boolean,paid_until timestamptz,subscription_plan text);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,user_id uuid UNIQUE NOT NULL,organization_id uuid,blocked_at timestamptz,archived_at timestamptz,full_name text,student_group_id uuid);
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE TABLE public.org_staff(user_id uuid,organization_id uuid,role text,sections_access jsonb,expires_at timestamptz);
CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY);
CREATE TABLE public.organization_billing_agreements(id uuid PRIMARY KEY,organization_id uuid,effective_from date,effective_to date);
CREATE TABLE public.student_groups(id uuid PRIMARY KEY,organization_id uuid,name text);
CREATE TABLE public.student_group_memberships(organization_id uuid,group_id uuid,user_id uuid);
CREATE VIEW public.student_group_memberships_effective AS SELECT organization_id,group_id,user_id FROM public.student_group_memberships;
CREATE TABLE billing_access_private.active_holds(organization_id uuid PRIMARY KEY);
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text NOT NULL,name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
-- Deliberately overbroad pre-existing fixture policy: the additive RTN fence
-- must protect the new bucket without editing this policy or other buckets.
CREATE POLICY lab_broad_storage ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
INSERT INTO storage.buckets VALUES('other-public','other-public',true,52428800);
-- Model the release prerequisite performed by the provider's Storage API.
-- This is fixture setup, never bucket creation in the product migration.
INSERT INTO storage.buckets VALUES('rtn-sources','rtn-sources',false,NULL);
INSERT INTO storage.objects(bucket_id,name) VALUES('other-public','existing-other-object'),('rtn-sources','synthetic-private-original');
-- Existing unrelated synthetic learning and financial data: migration must not
-- touch these sentinel bytes or any released helper definitions/ACLs.
CREATE TABLE public.courses(id uuid PRIMARY KEY,organization_id uuid,body jsonb);
CREATE TABLE public.test_attempts(id uuid PRIMARY KEY,score integer,answers jsonb);
CREATE TABLE public.subscription_invoices(id uuid PRIMARY KEY,amount numeric,status text);
CREATE TABLE lab.results(name text PRIMARY KEY);
CREATE TABLE lab.context(name text PRIMARY KEY,value jsonb);
GRANT SELECT,INSERT,UPDATE ON lab.context TO authenticated,service_role;
CREATE FUNCTION lab.check(p_name text,p_ok boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',p_name;END IF;INSERT INTO lab.results VALUES(p_name);END;$$;
CREATE FUNCTION lab.denied(p_name text,p_sql text,p_state text DEFAULT '42501') RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE actual text;BEGIN
 BEGIN EXECUTE p_sql;EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE;END;
 IF actual IS DISTINCT FROM p_state THEN RAISE EXCEPTION 'FAIL: % expected % received %',p_name,p_state,coalesce(actual,'SUCCESS');END IF;
 PERFORM lab.check(p_name,true);
END;$$;
CREATE FUNCTION lab.ctx(p_name text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$SELECT value FROM lab.context WHERE name=p_name$$;
CREATE FUNCTION lab.keep(p_name text,p_value jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN INSERT INTO lab.context VALUES(p_name,p_value) ON CONFLICT(name) DO UPDATE SET value=excluded.value;RETURN p_value;END;$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA lab TO authenticated,service_role;
INSERT INTO public.organizations VALUES
 ('11111111-1111-4111-8111-111111111111','Paid A',true,now()+interval '30 days','start'),
 ('22222222-2222-4222-8222-222222222222','Paid B',true,now()+interval '30 days','start'),
 ('33333333-3333-4333-8333-333333333333','Free',false,NULL,'free'),
 ('44444444-4444-4444-8444-444444444444','Postpaid',false,NULL,'free'),
 ('55555555-5555-4555-8555-555555555555','Expired',true,now()-interval '1 second','start'),
 ('cdd87239-1b04-47c9-8cd6-7ad57af4c54b','Technical pilot',false,NULL,'free'),
 ('0e29e728-bcc5-46e6-a339-066fb1e9c726','QA A technical exception',false,NULL,'free'),
 ('f7701297-2c10-4f8e-8123-4016cee9984f','QA B technical exception',false,NULL,'free');
INSERT INTO public.organization_billing_agreements VALUES(gen_random_uuid(),'44444444-4444-4444-8444-444444444444',current_date-5,NULL);
INSERT INTO public.profiles(id,user_id,organization_id,full_name) VALUES
 ('71000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Owner A'),
 ('71000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','Owner B'),
 ('71000000-0000-4000-8000-000000000101','81000000-0000-4000-8000-000000000101','11111111-1111-4111-8111-111111111111','Student A'),
 ('71000000-0000-4000-8000-000000000102','81000000-0000-4000-8000-000000000102','22222222-2222-4222-8222-222222222222','Student B'),
 ('71000000-0000-4000-8000-000000000201','81000000-0000-4000-8000-000000000201','11111111-1111-4111-8111-111111111111','Teacher'),
 ('71000000-0000-4000-8000-000000000202','81000000-0000-4000-8000-000000000202','11111111-1111-4111-8111-111111111111','Editor'),
 ('71000000-0000-4000-8000-000000000999','81000000-0000-4000-8000-000000000999','11111111-1111-4111-8111-111111111111','Admin');
INSERT INTO public.user_roles VALUES
 ('81000000-0000-4000-8000-000000000001','organization'),('81000000-0000-4000-8000-000000000002','organization'),
 ('81000000-0000-4000-8000-000000000101','student'),('81000000-0000-4000-8000-000000000102','student'),
 ('81000000-0000-4000-8000-000000000999','admin');
INSERT INTO public.org_staff VALUES
 ('81000000-0000-4000-8000-000000000201','11111111-1111-4111-8111-111111111111','teacher','[]',NULL),
 ('81000000-0000-4000-8000-000000000202','11111111-1111-4111-8111-111111111111','course_editor','[]',NULL);
INSERT INTO public.student_groups VALUES('91000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Group A');
INSERT INTO public.student_group_memberships VALUES('11111111-1111-4111-8111-111111111111','91000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000101');
INSERT INTO public.courses VALUES(gen_random_uuid(),'11111111-1111-4111-8111-111111111111','{"existing":"client course"}');
INSERT INTO public.test_attempts VALUES(gen_random_uuid(),80,'{"old":"frozen"}');
INSERT INTO public.subscription_invoices VALUES(gen_random_uuid(),6990,'paid');
