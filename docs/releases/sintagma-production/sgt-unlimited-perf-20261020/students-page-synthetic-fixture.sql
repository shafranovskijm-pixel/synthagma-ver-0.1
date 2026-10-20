-- Isolated in-memory PostgreSQL fixture only. No network or production data.
DO $$ BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'students_page_fixture_requires_empty_database';
  END IF;
END $$;
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
CREATE TYPE public.app_role AS ENUM ('admin','organization','student','company','sales_manager');
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE NOT NULL,
 organization_id uuid NOT NULL,full_name text,email text,login text,company_id uuid,student_group_id uuid,
 last_visit_at timestamptz,archived_at timestamptz);
CREATE TABLE user_roles(user_id uuid,role app_role);
CREATE TABLE org_staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,
 role text,sections_access jsonb DEFAULT '[]',expires_at timestamptz,UNIQUE(user_id,organization_id));
CREATE TABLE account_deletion_revocations(user_id uuid PRIMARY KEY);
CREATE TABLE courses(id uuid PRIMARY KEY,organization_id uuid,title text);
CREATE TABLE enrollments(id uuid PRIMARY KEY,user_id uuid,course_id uuid,progress integer,status text,
 started_at timestamptz,completed_at timestamptz,time_spent integer);
CREATE TABLE student_groups(id uuid PRIMARY KEY,organization_id uuid,course_id uuid);
CREATE TABLE student_group_memberships(organization_id uuid,group_id uuid,user_id uuid);
CREATE TABLE org_staff_document_groups(staff_id uuid,organization_id uuid,group_id uuid);
CREATE TABLE student_roster_removals(organization_id uuid,user_id uuid);
CREATE TABLE student_identity_documents(id uuid DEFAULT gen_random_uuid(),organization_id uuid,user_id uuid,type text);
CREATE TABLE student_frdo_data(organization_id uuid,user_id uuid,last_name text,first_name text,
 birth_date date,gender text,snils text);
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
-- No direct application-table grant to authenticated: calls use the actual
-- SECURITY DEFINER helpers and RPC, matching their production owner context.

CREATE FUNCTION public.students_fixture_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
$$;
INSERT INTO organizations VALUES(students_fixture_id(100)),(students_fixture_id(200));
INSERT INTO profiles(user_id,organization_id,full_name,email,login)
 SELECT students_fixture_id(n),students_fixture_id(CASE WHEN n IN (1,5,8,9,10,11,12) THEN 100 ELSE 200 END),
 'Actor '||n,'actor'||n||'@example.invalid','actor'||n FROM generate_series(1,15)n;
INSERT INTO user_roles
 SELECT user_id,CASE WHEN user_id=students_fixture_id(2) THEN 'admin'::app_role
 WHEN user_id IN (students_fixture_id(1),students_fixture_id(7)) THEN 'organization'::app_role
 ELSE 'student'::app_role END FROM profiles;
INSERT INTO org_staff(user_id,organization_id,role,expires_at) VALUES
 (students_fixture_id(3),students_fixture_id(100),'admin',NULL),
 (students_fixture_id(4),students_fixture_id(100),'teacher',NULL),
 (students_fixture_id(5),students_fixture_id(100),'admin','2000-01-01T00:00:00Z'),
 (students_fixture_id(6),students_fixture_id(100),'sales_manager',NULL),
 (students_fixture_id(9),students_fixture_id(100),'admin',NULL),
 (students_fixture_id(10),students_fixture_id(100),'teacher','2000-01-01T00:00:00Z'),
 (students_fixture_id(11),students_fixture_id(100),'course_editor',NULL),
 (students_fixture_id(12),students_fixture_id(200),'teacher',NULL),
 (students_fixture_id(13),students_fixture_id(100),'teacher',NULL),
 (students_fixture_id(13),students_fixture_id(200),'admin',NULL),
 (students_fixture_id(14),students_fixture_id(100),'teacher',NULL),
 (students_fixture_id(15),students_fixture_id(100),'admin',NULL),
 (students_fixture_id(15),students_fixture_id(200),'teacher','2000-01-01T00:00:00Z');
INSERT INTO account_deletion_revocations VALUES(students_fixture_id(9));
INSERT INTO courses VALUES(students_fixture_id(301),students_fixture_id(100),'Synthetic A1'),
 (students_fixture_id(302),students_fixture_id(100),'Synthetic A2'),
 (students_fixture_id(303),students_fixture_id(200),'Synthetic B1');
INSERT INTO student_groups VALUES(students_fixture_id(401),students_fixture_id(100),students_fixture_id(301)),
 (students_fixture_id(402),students_fixture_id(100),students_fixture_id(302)),
 (students_fixture_id(403),students_fixture_id(200),students_fixture_id(303)),
 (students_fixture_id(404),students_fixture_id(100),NULL);
INSERT INTO org_staff_document_groups
 SELECT id,organization_id,students_fixture_id(CASE WHEN user_id=students_fixture_id(12) THEN 403 ELSE 401 END)
 FROM org_staff WHERE role='teacher' AND user_id<>students_fixture_id(14);
INSERT INTO profiles(user_id,organization_id,full_name,email,login,student_group_id,archived_at,last_visit_at)
 SELECT students_fixture_id(1000+n),students_fixture_id(CASE WHEN n=9 THEN 200 ELSE 100 END),
 CASE WHEN n=8 THEN NULL ELSE 'Synthetic learner '||n END,'learner'||n||'@example.invalid','learner'||n,
 CASE WHEN n IN (1,2,6,7,8,11,12) THEN students_fixture_id(401)
 WHEN n=3 THEN students_fixture_id(402) WHEN n=9 THEN students_fixture_id(403)
 WHEN n=10 THEN students_fixture_id(404) ELSE NULL END,
 CASE WHEN n IN (6,7) THEN '2026-10-01T10:00:00Z'::timestamptz ELSE NULL END,'2026-10-01T09:00:00Z'
 FROM generate_series(1,12)n;
INSERT INTO user_roles SELECT user_id,'student'::app_role FROM profiles WHERE user_id>=students_fixture_id(1001);
-- Learner 4 has an additional assigned group; learner 2 also has a distinct
-- second group/course. Learner 11 is explicitly removed from the roster.
INSERT INTO student_group_memberships VALUES
 (students_fixture_id(100),students_fixture_id(401),students_fixture_id(1004)),
 (students_fixture_id(100),students_fixture_id(402),students_fixture_id(1002));
INSERT INTO student_roster_removals VALUES(students_fixture_id(100),students_fixture_id(1011));
INSERT INTO enrollments
 SELECT students_fixture_id(2000+n),students_fixture_id(1000+n),
 students_fixture_id(CASE WHEN n=3 THEN 302 WHEN n=9 THEN 303 ELSE 301 END),
 CASE WHEN n IN (2,6) THEN 100 ELSE 25 END,CASE WHEN n IN (2,6) THEN 'completed' ELSE 'active' END,
 '2026-10-01T08:00:00Z',CASE WHEN n IN (2,6) THEN '2026-10-02T08:00:00Z'::timestamptz ELSE NULL END,60*n
 FROM generate_series(1,12)n WHERE n NOT IN (5,10);
INSERT INTO enrollments VALUES(students_fixture_id(2102),students_fixture_id(1002),students_fixture_id(302),10,'active','2026-10-03T08:00:00Z',NULL,5);
INSERT INTO enrollments VALUES(students_fixture_id(2101),students_fixture_id(1001),students_fixture_id(303),10,'active','2026-10-03T08:00:00Z',NULL,5);
INSERT INTO student_identity_documents(organization_id,user_id,type)
 SELECT students_fixture_id(100),students_fixture_id(1001),t FROM unnest(ARRAY['birth_certificate','snils','attestat'])t;
INSERT INTO student_identity_documents(organization_id,user_id,type) VALUES
 (students_fixture_id(100),students_fixture_id(1002),'passport'),
 (students_fixture_id(200),students_fixture_id(1003),'snils');
INSERT INTO student_frdo_data VALUES
 (students_fixture_id(100),students_fixture_id(1001),'Synthetic','Complete','2000-01-01','male','synthetic'),
 (students_fixture_id(100),students_fixture_id(1002),'Synthetic','Incomplete',NULL,'male',NULL),
 (students_fixture_id(200),students_fixture_id(1003),'Foreign','Excluded','2000-01-01','male','synthetic');
