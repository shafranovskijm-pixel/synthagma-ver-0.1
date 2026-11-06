-- Disposable native PostgreSQL17 fixture only; NEVER a project database.
-- Docker initializes lab_bootstrap as OID10; PostgreSQL17 forbids demoting it.
-- The app owner is a separate non-superuser postgres, matching production.
CREATE ROLE postgres NOLOGIN BYPASSRLS NOSUPERUSER;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE billing_lab_observer NOLOGIN;
GRANT anon,authenticated,service_role,billing_lab_observer TO postgres;
ALTER SCHEMA public OWNER TO postgres;
GRANT CREATE ON DATABASE org_billing_hold_lab_ci TO postgres;
CREATE SCHEMA auth AUTHORIZATION postgres;
SET ROLE postgres;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$fn$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$
 SELECT nullif(current_setting('request.jwt.claim.role',true),'')
$fn$;
CREATE TYPE public.app_role AS ENUM('admin','organization','student','sales_manager','company');
CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text,is_paid boolean,paid_until timestamptz,subscription_plan text);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid,blocked_at timestamptz,full_name text);
CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,role public.app_role);
CREATE TABLE public.org_staff(user_id uuid,organization_id uuid,role text,sections_access jsonb,expires_at timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY);
CREATE TABLE public.courses(id uuid PRIMARY KEY,organization_id uuid,is_published boolean,landing_content jsonb DEFAULT '{}',title text);
CREATE TABLE public.course_modules(id uuid PRIMARY KEY,course_id uuid,title text,order_index integer);
CREATE TABLE public.enrollments(id uuid PRIMARY KEY,user_id uuid,course_id uuid,status text,expires_at timestamptz);
CREATE TABLE public.lab_withdrawals(enrollment_id uuid PRIMARY KEY);
CREATE TABLE public.lesson_progress(id uuid PRIMARY KEY,user_id uuid,organization_id uuid,progress integer);
CREATE TABLE public.test_attempts(id uuid PRIMARY KEY,user_id uuid,score integer,answers jsonb);
CREATE TABLE public.subscription_invoices(id uuid PRIMARY KEY,organization_id uuid,amount numeric,status text);
CREATE TABLE public.contracts(id uuid PRIMARY KEY,organization_id uuid,amount numeric);
CREATE TABLE public.lab_ddl_events(id bigint GENERATED ALWAYS AS IDENTITY,identity text);
-- Stubs are replaced with exact released sources before any application test.
CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$fn$;
CREATE FUNCTION public.has_role(_role public.app_role,_user_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
BEGIN RETURN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);END;$fn$;
CREATE FUNCTION public.get_org_staff_permissions(_user_id uuid,_organization_id uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
 SELECT coalesce(array_agg(p.permission),'{}'::text[])FROM public.org_staff s
 CROSS JOIN LATERAL jsonb_array_elements_text(s.sections_access)p(permission)
 WHERE s.user_id=_user_id AND s.organization_id=_organization_id AND(s.expires_at IS NULL OR s.expires_at>now())
$fn$;
CREATE FUNCTION public.normalize_org_staff_permission(_permission text)RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$ SELECT _permission $fn$;
CREATE FUNCTION public.has_org_staff_permission(_user_id uuid,_organization_id uuid,_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
 SELECT _permission=ANY(public.get_org_staff_permissions(_user_id,_organization_id))
$fn$;
CREATE FUNCTION public.uc_enrollment_is_withdrawn(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.lab_withdrawals WHERE enrollment_id=p_id)
$fn$;

