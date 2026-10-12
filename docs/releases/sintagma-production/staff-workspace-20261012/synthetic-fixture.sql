-- ISOLATED TEST DATABASE ONLY. Runner begins a transaction and rolls it back.
-- Reject a nonempty application schema before any setup.
DO $$ BEGIN
  IF to_regclass('public.organizations') IS NOT NULL OR to_regclass('public.profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'Synthetic staff fixture requires an empty isolated database';
  END IF;
END $$;
SET LOCAL sintagma.staff_access_fixture='isolated';
SET LOCAL sintagma.staff_assertions='0';
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
CREATE TYPE public.app_role AS ENUM ('admin','organization','student','company','sales_manager');
CREATE TABLE organizations (
  id uuid PRIMARY KEY, name text, description text, branding jsonb, menu_settings jsonb,
  student_dashboard_settings jsonb, subscription_plan text, custom_enabled_categories jsonb,
  frdo_enabled boolean, private_fixture_marker text
);
CREATE TABLE profiles (user_id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE user_roles (user_id uuid,role app_role);
CREATE TABLE org_staff (user_id uuid,organization_id uuid,role text,sections_access jsonb DEFAULT '[]',expires_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE account_deletion_revocations(user_id uuid PRIMARY KEY);
CREATE TABLE companies(id uuid PRIMARY KEY,organization_id uuid,name text,user_id uuid);
CREATE TABLE labor_safety_groups(id uuid PRIMARY KEY,organization_id uuid,name text);
CREATE TABLE labor_safety_records(id uuid PRIMARY KEY,group_id uuid REFERENCES labor_safety_groups(id),full_name text);
CREATE FUNCTION public.has_role(u uuid,r app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role=r);
$$;
CREATE FUNCTION public.has_role(r app_role,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(u,r);
$$;
CREATE FUNCTION account_deletion_access_allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT NOT EXISTS(SELECT 1 FROM account_deletion_revocations WHERE user_id=auth.uid());
$$;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_safety_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_safety_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_deletion_no_revoked_access ON organizations AS RESTRICTIVE FOR ALL TO authenticated
  USING(account_deletion_access_allowed()) WITH CHECK(account_deletion_access_allowed());
CREATE POLICY account_deletion_no_revoked_access ON companies AS RESTRICTIVE FOR ALL TO authenticated
  USING(account_deletion_access_allowed()) WITH CHECK(account_deletion_access_allowed());
CREATE POLICY account_deletion_no_revoked_access ON labor_safety_groups AS RESTRICTIVE FOR ALL TO authenticated
  USING(account_deletion_access_allowed()) WITH CHECK(account_deletion_access_allowed());
CREATE POLICY account_deletion_no_revoked_access ON labor_safety_records AS RESTRICTIVE FOR ALL TO authenticated
  USING(account_deletion_access_allowed()) WITH CHECK(account_deletion_access_allowed());
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE ALL ON account_deletion_revocations FROM authenticated;

-- Roles: 1 owner A; 2 global admin; 3 active staff-admin A/profile B;
-- 4 teacher A/profile B; 5 expired admin A/profile A; 6 sales_manager A;
-- 7 company owner B; 8 genuine student A; 9 revoked staff A; 10 OT read-only;
-- 11 OT write-only (requires separate read grant to target existing records).
INSERT INTO organizations(id,name,subscription_plan,frdo_enabled,private_fixture_marker) VALUES
 ('00000000-0000-0000-0000-000000000100','Synthetic A','standard',true,'never exposed'),
 ('00000000-0000-0000-0000-000000000200','Synthetic B','start',false,'never exposed');
INSERT INTO profiles SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('00000000-0000-0000-0000-'||lpad((CASE WHEN n IN (1,5,8,9,10,11) THEN 100 ELSE 200 END)::text,12,'0'))::uuid
  FROM generate_series(1,11) n;
INSERT INTO user_roles SELECT user_id,CASE right(user_id::text,2) WHEN '01' THEN 'organization'::app_role
  WHEN '02' THEN 'admin'::app_role WHEN '07' THEN 'company'::app_role ELSE 'student'::app_role END FROM profiles;
INSERT INTO org_staff(user_id,organization_id,role,sections_access,expires_at) VALUES
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000100','admin','[]',NULL),
 ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000100','teacher','[]',NULL),
 ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000100','admin','[]',now()-interval '1 day'),
 ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000100','sales_manager','[]',NULL),
 ('00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000100','admin','[]',NULL),
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000100','teacher','["labor_safety.read","companies.read"]',NULL),
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100','teacher','["labor_safety.write"]',NULL);
INSERT INTO account_deletion_revocations VALUES ('00000000-0000-0000-0000-000000000009');
INSERT INTO companies VALUES
 ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000100','Synthetic company A',NULL),
 ('00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000200','Synthetic company B','00000000-0000-0000-0000-000000000007');
INSERT INTO labor_safety_groups VALUES
 ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000100','Synthetic OT A'),
 ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000200','Synthetic OT B');
INSERT INTO labor_safety_records VALUES
 ('00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000401','Synthetic learner A'),
 ('00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-000000000402','Synthetic learner B');
