-- Empty isolated engine ONLY. Synthetic identities and reduced unrelated tables.
-- Authority functions are loaded separately from exact captured production source.
DO $$BEGIN IF to_regclass('public.organizations')IS NOT NULL THEN RAISE EXCEPTION 'UC015 fixture requires empty isolated database';END IF;END;$$;
CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE ROLE uc015_default_bystander;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid()RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.role()RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
CREATE TYPE public.app_role AS ENUM('admin','organization','student','company','sales_manager');
CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid,full_name text,blocked_at timestamptz);
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE TABLE public.org_staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,role text,sections_access jsonb DEFAULT '[]',expires_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE public.admin_staff(user_id uuid,role text,expires_at timestamptz);
CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY);
CREATE TABLE public.courses(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE public.enrollments(id uuid PRIMARY KEY,course_id uuid,user_id uuid,status text);
CREATE TABLE public.student_groups(id uuid PRIMARY KEY,organization_id uuid,course_id uuid);
CREATE TABLE public.org_staff_document_groups(staff_id uuid,organization_id uuid,group_id uuid);
CREATE TABLE public.student_group_memberships_effective(group_id uuid,organization_id uuid,user_id uuid);
CREATE TABLE public.journal_instances(id uuid PRIMARY KEY,organization_id uuid,course_id uuid,journal_type text,title text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.journal_entries(id uuid PRIMARY KEY,journal_id uuid,user_id uuid,entry_date date,entry_type text,value text,notes text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
-- The old job function is installed/pinned but not executed in this reduced lab.
CREATE TABLE public.account_deletion_jobs(id uuid PRIMARY KEY);
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text,created_by text,idempotency_key text,rollback text);
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role,uc015_default_bystander;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO public.organizations VALUES('00000000-0000-0000-0000-000000000100','Synthetic A'),('00000000-0000-0000-0000-000000000200','Synthetic B');
INSERT INTO auth.users(id)SELECT('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,30)n;
INSERT INTO public.profiles SELECT id,CASE WHEN right(id::text,2)::integer IN(3,7,13,20,21)THEN '00000000-0000-0000-0000-000000000200'::uuid ELSE '00000000-0000-0000-0000-000000000100'::uuid END,'Synthetic Person '||right(id::text,2),NULL FROM auth.users;
INSERT INTO public.user_roles SELECT id,CASE right(id::text,2)::integer WHEN 1 THEN 'organization'::public.app_role WHEN 7 THEN 'organization'::public.app_role WHEN 2 THEN 'admin'::public.app_role WHEN 12 THEN 'admin'::public.app_role ELSE 'student'::public.app_role END FROM auth.users;
INSERT INTO public.org_staff(user_id,organization_id,role,sections_access,expires_at)SELECT('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000100',CASE n WHEN 4 THEN 'teacher'WHEN 6 THEN 'sales_manager'WHEN 10 THEN 'viewer'ELSE 'admin'END,CASE WHEN n IN(4,10)THEN '["journals.read","journals.write"]'::jsonb ELSE '[]'::jsonb END,CASE WHEN n=5 THEN now()-interval '1 day'END FROM unnest(ARRAY[3,4,5,6,9,10,14,15,16,17])n;
INSERT INTO public.org_staff(user_id,organization_id,role,sections_access)VALUES('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000200','teacher','["journals.read","journals.write"]');
INSERT INTO public.admin_staff VALUES('00000000-0000-0000-0000-000000000002','admin',NULL),('00000000-0000-0000-0000-000000000012','admin',now()-interval '1 day');
INSERT INTO public.account_deletion_revocations VALUES('00000000-0000-0000-0000-000000000009');
UPDATE auth.users SET banned_until=now()+interval '1 day'WHERE id='00000000-0000-0000-0000-000000000014';
UPDATE auth.users SET deleted_at=now()WHERE id='00000000-0000-0000-0000-000000000015';
UPDATE public.profiles SET blocked_at=now()WHERE user_id='00000000-0000-0000-0000-000000000016';
INSERT INTO public.courses VALUES('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000100');
INSERT INTO public.enrollments VALUES('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000021','active');
INSERT INTO public.journal_instances(id,organization_id,course_id,journal_type,title)VALUES('00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000301','custom_legacy','Synthetic legacy journal');
INSERT INTO public.journal_entries(id,journal_id,user_id,entry_date,entry_type,value,notes)VALUES('00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000008','2026-10-20','grade','04','Synthetic legacy note');
-- Host defaults are intentionally wider than the new private registry should keep.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,UPDATE ON TABLES TO uc015_default_bystander;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO uc015_default_bystander;
