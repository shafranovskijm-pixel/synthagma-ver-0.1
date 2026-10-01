-- Isolated PostgreSQL test fixture. Never run against an existing database.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('admin','organization','student','company','sales_manager');
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.student_groups(id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations, course_id uuid);
CREATE TABLE public.profiles(id uuid DEFAULT gen_random_uuid(), user_id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations,
  full_name text, email text, login text, company_id uuid, student_group_id uuid REFERENCES student_groups,
  last_visit_at timestamptz, archived_at timestamptz, department text, generated_password text);
CREATE TABLE public.user_roles(user_id uuid, role app_role);
CREATE TABLE public.org_staff(user_id uuid, organization_id uuid, expires_at timestamptz, permissions text[]);
CREATE TABLE public.courses(id uuid PRIMARY KEY, organization_id uuid, title text);
CREATE TABLE public.enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, course_id uuid, progress integer,
  status text, started_at timestamptz, completed_at timestamptz, time_spent integer, UNIQUE(user_id,course_id));
CREATE TABLE public.student_identity_documents(user_id uuid, organization_id uuid, type text);
CREATE TABLE public.student_frdo_data(user_id uuid, organization_id uuid, last_name text, first_name text, birth_date date, gender text, snils text);
CREATE TABLE public.education_document_records(id uuid DEFAULT gen_random_uuid(), organization_id uuid, user_id uuid, course_id uuid,
  group_id uuid, enrollment_id uuid, reg_number text, document_number text, document_series text, document_type text, full_name text,
  birth_date date, issue_date date, specialty_name text, qualification_name text, document_status text, delivery_method text,
  education_result text, notes text, deleted_at timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE public.document_number_sequences(organization_id uuid, doc_type text, year integer, last_number integer,
  updated_at timestamptz, PRIMARY KEY(organization_id,doc_type,year));
CREATE FUNCTION public.has_role(p_user uuid, p_role app_role) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=p_user AND role=p_role) $$;
CREATE FUNCTION public.has_role(p_role app_role, p_user uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT public.has_role(p_user,p_role) $$;
CREATE FUNCTION public.current_organization_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT organization_id FROM profiles WHERE user_id=auth.uid() $$;
-- Deliberately permissive legacy helper: the new mutation must not trust it.
CREATE FUNCTION public.can_access_organization(p_org uuid,p_permission text) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE user_id=auth.uid() AND organization_id=p_org) $$;
CREATE FUNCTION public.has_org_staff_permission(p_user uuid,p_org uuid,p_permission text) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT EXISTS(SELECT 1 FROM org_staff WHERE user_id=p_user AND organization_id=p_org AND p_permission=ANY(permissions)) $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

INSERT INTO organizations VALUES ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
INSERT INTO courses VALUES ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Local fixture course');
INSERT INTO student_groups VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',NULL),
 ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002',NULL);
INSERT INTO profiles(user_id,organization_id,full_name,student_group_id,archived_at,department,generated_password) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Fixture owner',NULL,NULL,NULL,NULL),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Fixture student A','20000000-0000-0000-0000-000000000001',NULL,'Department A','Fixture preserved password'),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Fixture student B',NULL,NULL,NULL,NULL),
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','Fixture archived',NULL,now(),NULL,NULL),
 ('30000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002','Fixture foreign',NULL,NULL,NULL,NULL),
 ('30000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','Fixture staff',NULL,NULL,NULL,NULL);
INSERT INTO user_roles VALUES ('30000000-0000-0000-0000-000000000001','organization');
INSERT INTO org_staff VALUES ('30000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001',NULL,ARRAY['students.write','students.read']);
INSERT INTO enrollments(id,user_id,course_id,progress,status,time_spent) VALUES
 ('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001',73,'active',1200);
