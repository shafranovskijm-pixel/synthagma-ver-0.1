DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec_atxwvjxbqjgkbjlhsdch')THEN CREATE ROLE sandbox_exec_atxwvjxbqjgkbjlhsdch NOLOGIN;END IF;END;$$;
-- Disposable loopback PostgreSQL17 fixture only. No live project claims,
-- accounts, files or keys. Guards are installed from released-guards.sql.
-- Match the dedicated native CI server session, even when the optional local
-- PGlite adapter inherits this computer's far-eastern timezone.
SET TIME ZONE 'UTC';
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres NOLOGIN BYPASSRLS NOSUPERUSER;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec_atxwvjxbqjgkbjlhsdch') THEN CREATE ROLE sandbox_exec_atxwvjxbqjgkbjlhsdch NOLOGIN;END IF;
END;$$;
GRANT anon,authenticated,service_role TO postgres;
ALTER SCHEMA public OWNER TO postgres;
GRANT CREATE ON DATABASE rtn_erasure_lab_ci TO postgres;
CREATE SCHEMA auth AUTHORIZATION postgres;
CREATE SCHEMA storage AUTHORIZATION postgres;
CREATE SCHEMA billing_access_private AUTHORIZATION postgres;
CREATE SCHEMA lab AUTHORIZATION postgres;
SET ROLE postgres;
-- Real provider-specific public-schema function defaults, in addition to
-- PostgreSQL's ordinary default EXECUTE. Product migrations must revoke every
-- actual grantee on NEW RTN functions without changing these defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
 GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch;
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
-- A pre-existing, unrelated overload deliberately shares a new RPC's name.
-- New-object ACL hardening must leave its full catalog/authority untouched.
CREATE FUNCTION public.get_rtn_workspace(p_note text,p_number integer) RETURNS text LANGUAGE sql AS $$SELECT p_note||p_number::text$$;
SELECT lab.keep('preexisting_rtn_overload',(SELECT to_jsonb(p)FROM pg_proc p WHERE oid='public.get_rtn_workspace(text,integer)'::regprocedure));
SELECT lab.keep('provider_function_defaults',(SELECT jsonb_agg(to_jsonb(d)ORDER BY d.oid)FROM pg_default_acl d WHERE d.defaclrole='postgres'::regrole));
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

-- Exact pg_get_functiondef read-only capture 2026-11-14. No live JWT or DML.
CREATE OR REPLACE FUNCTION billing_access_private.actor_allowed(p_actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=p_actor)
 AND(
  p_actor IS NULL
  OR EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_actor AND ur.role='admin'::public.app_role)
  OR NOT EXISTS(SELECT 1 FROM public.profiles p JOIN billing_access_private.active_holds h ON h.organization_id=p.organization_id
     WHERE p.user_id=p_actor)
 )
$function$;

CREATE OR REPLACE FUNCTION billing_access_private.target_allowed(p_organization_id uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT billing_access_private.actor_allowed(p_actor) AND(
  EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_actor AND ur.role='admin'::public.app_role)
  OR NOT EXISTS(SELECT 1 FROM billing_access_private.active_holds h WHERE h.organization_id=p_organization_id)
 )
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_role app_role, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN billing_access_private.actor_allowed(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT billing_access_private.actor_allowed(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$function$;

CREATE OR REPLACE FUNCTION public.account_deletion_access_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid())
   AND billing_access_private.actor_allowed(auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.normalize_org_staff_permission(_permission text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _permission IS NULL THEN NULL
    WHEN _permission LIKE '%.view'   THEN regexp_replace(_permission, '\.view$',   '.read')
    WHEN _permission LIKE '%.manage' THEN regexp_replace(_permission, '\.manage$', '.write')
    ELSE _permission
  END
$function$;

CREATE OR REPLACE FUNCTION public.org_role_default_permissions(_role text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _role
    WHEN 'owner' THEN ARRAY[
      'courses.read','courses.write','students.read','students.write',
      'companies.read','companies.write','library.read','library.write',
      'documents.read','documents.write','documents.sign','documents.issue','journals.read','journals.write',
      'frdo.read','frdo.write','labor_safety.read','labor_safety.write',
      'services.read','services.write','staff.read','staff.write',
      'billing.read','billing.write','settings.read','settings.write',
      'chats.read','chats.write','homework.read','homework.write',
      'webinars.read','webinars.write','sales.read','sales.write'
    ]
    WHEN 'admin' THEN ARRAY[
      'courses.read','courses.write','students.read','students.write',
      'companies.read','companies.write','library.read','library.write',
      'documents.read','documents.write','documents.sign','documents.issue','journals.read','journals.write',
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

CREATE OR REPLACE FUNCTION public.get_org_staff_permissions(_user_id uuid, _organization_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  staff_role text;
  base_perms text[];
  override_perms text[];
BEGIN
  SELECT role,
         COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(sections_access)),
           ARRAY[]::text[]
         )
    INTO staff_role, override_perms
    FROM public.org_staff
   WHERE user_id = _user_id AND organization_id = _organization_id
   LIMIT 1;

  IF staff_role IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  base_perms := public.org_role_default_permissions(staff_role);

  -- merge: union of base + overrides (overrides могут только добавлять права)
  RETURN ARRAY(
    SELECT DISTINCT unnest(base_perms || override_perms)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_org_staff_permission(_user_id uuid, _organization_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH perms AS (
    SELECT unnest(public.get_org_staff_permissions(_user_id, _organization_id)) AS permission
  )
  SELECT billing_access_private.target_allowed(_organization_id,_user_id) AND EXISTS (
    SELECT 1
    FROM perms
    WHERE permission = _permission
       OR permission = public.normalize_org_staff_permission(_permission)
       OR public.normalize_org_staff_permission(permission) = public.normalize_org_staff_permission(_permission)
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_access_organization(_organization_id uuid, _permission text DEFAULT 'settings.read'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.account_deletion_access_allowed()
    AND billing_access_private.target_allowed(_organization_id,auth.uid())
    AND _organization_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.profiles p ON p.user_id = ur.user_id
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'organization'::public.app_role
          AND p.organization_id = _organization_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.org_staff os
            WHERE os.user_id = auth.uid()
              AND os.organization_id = _organization_id
          )
      )
      OR (
        _permission IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.org_staff os
          WHERE os.user_id = auth.uid()
            AND os.organization_id = _organization_id
            AND (os.expires_at IS NULL OR os.expires_at > now())
        )
        AND public.has_org_staff_permission(auth.uid(), _organization_id, _permission)
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.is_student_profile(_target_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _target_user_id IS NOT NULL
    AND _org_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _target_user_id
        AND role IN ('admin', 'organization', 'company', 'sales_manager')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.org_staff
      WHERE user_id = _target_user_id
        AND organization_id = _org_id
        AND (expires_at IS NULL OR expires_at > now())
    );
$function$;

CREATE OR REPLACE FUNCTION public.postpaid_is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL AND public.has_role('admin'::public.app_role,auth.uid())
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.has_active_postpaid_agreement(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.postpaid_is_admin()
 AND (auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() OR NOT COALESCE(public.can_access_organization(p_organization_id,'settings.read'),false))
 THEN RAISE EXCEPTION 'Organization billing access required' USING ERRCODE='42501'; END IF;
 RETURN EXISTS(SELECT 1 FROM public.organization_billing_agreements WHERE organization_id=p_organization_id
  AND effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date AND (effective_to IS NULL OR effective_to>(now() AT TIME ZONE 'Europe/Moscow')::date));
END $function$;

-- Isolated PG17 schema adapter for the exact released enrollment quota source.
ALTER TABLE public.organizations ADD COLUMN custom_max_students integer,ADD COLUMN custom_max_trained_per_month integer;
ALTER TABLE public.courses ADD COLUMN system_key text;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),course_id uuid NOT NULL REFERENCES public.courses(id),status text NOT NULL DEFAULT 'active',expires_at timestamptz,started_at timestamptz,access_days integer,progress numeric DEFAULT 0,time_spent numeric DEFAULT 0,completed_at timestamptz);
GRANT SELECT,INSERT,UPDATE ON public.enrollments TO authenticated;
CREATE TABLE public.organization_monthly_course_usage(organization_id uuid NOT NULL REFERENCES public.organizations(id),month_start date NOT NULL,assigned_students integer NOT NULL DEFAULT 0,completed_trainings integer NOT NULL DEFAULT 0,PRIMARY KEY(organization_id,month_start));
CREATE TABLE public.organization_monthly_student_assignments(organization_id uuid NOT NULL REFERENCES public.organizations(id),month_start date NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),first_assigned_at timestamptz NOT NULL,source text NOT NULL CHECK(source IN('assignment','enrollment_history')),PRIMARY KEY(organization_id,month_start,user_id));
CREATE TABLE public.organization_monthly_training_completions(organization_id uuid NOT NULL REFERENCES public.organizations(id),month_start date NOT NULL,enrollment_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),first_completed_at timestamptz NOT NULL,source text NOT NULL CHECK(source IN('completion','existing_completion')),PRIMARY KEY(organization_id,month_start,enrollment_id));
ALTER TABLE public.organization_monthly_course_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_monthly_student_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_monthly_training_completions ENABLE ROW LEVEL SECURITY;
DO $$DECLARE n integer;u uuid;p uuid;org uuid;BEGIN
 FOR n IN 3..9 LOOP
  u:=('82000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  p:=('72000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  org:=CASE WHEN n=8 THEN '44444444-4444-4444-8444-444444444444'::uuid ELSE '11111111-1111-4111-8111-111111111111'::uuid END;
  INSERT INTO public.profiles(id,user_id,organization_id,full_name)VALUES(p,u,org,'Synthetic quota learner '||n);
  INSERT INTO public.user_roles VALUES(u,'student');
 END LOOP;
END;$$;
INSERT INTO auth.users SELECT DISTINCT user_id FROM public.profiles;
INSERT INTO public.courses(id,organization_id,body)VALUES('93000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','{"fixture":"normal course A"}');

-- Exact released quota source capture, SELECT-only 2026-11-14; fixture-only installation.
CREATE OR REPLACE FUNCTION public._organization_monthly_course_limits(p_organization_id uuid)
 RETURNS TABLE(subscription_plan text, max_students integer, max_trainings integer, student_limit_source text, training_limit_source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE o record;
BEGIN
  SELECT x.subscription_plan::text AS plan,x.custom_max_students,x.custom_max_trained_per_month
  INTO o FROM public.organizations x WHERE x.id=p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization not found' USING ERRCODE='P0002';END IF;
  subscription_plan:=o.plan;
  max_students:=coalesce(o.custom_max_students,CASE lower(coalesce(o.plan,'free'))
    WHEN 'start' THEN 100 WHEN 'standard' THEN 200 WHEN 'professional' THEN -1 WHEN 'maximum' THEN -1 ELSE 10 END);
  max_trainings:=coalesce(o.custom_max_trained_per_month,CASE lower(coalesce(o.plan,'free'))
    WHEN 'start' THEN 60 WHEN 'standard' THEN 100 WHEN 'professional' THEN -1 WHEN 'maximum' THEN -1 ELSE 10 END);
  student_limit_source:=CASE WHEN o.custom_max_students IS NULL THEN 'plan' ELSE 'custom' END;
  training_limit_source:=CASE WHEN o.custom_max_trained_per_month IS NULL THEN 'plan' ELSE 'custom' END;
  IF EXISTS(SELECT 1 FROM public.organization_billing_agreements a WHERE a.organization_id=p_organization_id
    AND a.effective_from<=(statement_timestamp() AT TIME ZONE 'Europe/Moscow')::date
    AND (a.effective_to IS NULL OR a.effective_to>(statement_timestamp() AT TIME ZONE 'Europe/Moscow')::date)) THEN
    max_students:=-1;max_trainings:=-1;student_limit_source:='postpaid';training_limit_source:='postpaid';
  END IF;
  RETURN NEXT;
END;$function$
;

CREATE OR REPLACE FUNCTION public.enforce_organization_monthly_course_quota()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_org uuid;v_month date:=(date_trunc('month',statement_timestamp() AT TIME ZONE 'Europe/Moscow'))::date;
  v_assigned boolean:=false;v_completed boolean:=false;v_limits record;v_usage record;
BEGIN
  IF TG_OP='INSERT' THEN
    v_assigned:=true;
    v_completed:=(NEW.status='completed');
  ELSE
    v_assigned:=NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.course_id IS DISTINCT FROM OLD.course_id
      OR (OLD.expires_at IS NOT NULL AND (OLD.started_at IS NOT NULL OR NEW.access_days IS DISTINCT FROM OLD.access_days)
        AND (NEW.expires_at IS NULL OR NEW.expires_at>OLD.expires_at))
      OR (OLD.started_at IS NOT NULL AND NEW.started_at>OLD.started_at)
      OR (OLD.status IN ('expired','cancelled','revoked') AND NEW.status='active');
    v_completed:=NEW.status='completed' AND
      (OLD.status IS DISTINCT FROM 'completed' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.course_id IS DISTINCT FROM OLD.course_id);
  END IF;
  IF NOT v_assigned AND NOT v_completed THEN RETURN NEW;END IF;
  SELECT c.organization_id INTO v_org FROM public.courses c WHERE c.id=NEW.course_id;
  IF v_org IS NULL OR NOT public.is_student_profile(NEW.user_id,v_org) THEN RETURN NEW;END IF;
  -- The subject fence already takes this lock for enrollment writes. Taking it
  -- here as well keeps erasure/registration serialized in one documented order.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,42007));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text,42));
  SELECT * INTO v_limits FROM public._organization_monthly_course_limits(v_org);
  INSERT INTO public.organization_monthly_course_usage(organization_id,month_start)
  VALUES(v_org,v_month) ON CONFLICT DO NOTHING;
  SELECT * INTO v_usage FROM public.organization_monthly_course_usage
    WHERE organization_id=v_org AND month_start=v_month FOR UPDATE;
  IF v_assigned AND NOT EXISTS(SELECT 1 FROM public.organization_monthly_student_assignments
    WHERE organization_id=v_org AND month_start=v_month AND user_id=NEW.user_id) THEN
    IF v_limits.max_students<>-1 AND v_usage.assigned_students>=v_limits.max_students THEN
      RAISE EXCEPTION USING ERRCODE='P0001',
        MESSAGE='Достигнут месячный лимит учеников с назначенными курсами. Личные дела можно создавать и хранить без ограничений.',
        DETAIL='STUDENT_ASSIGNMENT_LIMIT_EXCEEDED';
    END IF;
    INSERT INTO public.organization_monthly_student_assignments
      (organization_id,month_start,user_id,first_assigned_at,source)
    VALUES(v_org,v_month,NEW.user_id,statement_timestamp(),'assignment');
    UPDATE public.organization_monthly_course_usage SET assigned_students=assigned_students+1
      WHERE organization_id=v_org AND month_start=v_month;
  END IF;
  IF v_completed AND NOT EXISTS(SELECT 1 FROM public.organization_monthly_training_completions
    WHERE organization_id=v_org AND month_start=v_month AND enrollment_id=NEW.id) THEN
    IF v_limits.max_trainings<>-1 AND v_usage.completed_trainings>=v_limits.max_trainings THEN
      RAISE EXCEPTION USING ERRCODE='P0001',
        MESSAGE='Достигнут месячный лимит завершённых обучений. Обратитесь к администратору организации.',
        DETAIL='TRAINING_COMPLETION_LIMIT_EXCEEDED';
    END IF;
    INSERT INTO public.organization_monthly_training_completions
      (organization_id,month_start,enrollment_id,user_id,first_completed_at,source)
    VALUES(v_org,v_month,NEW.id,NEW.user_id,statement_timestamp(),'completion');
    UPDATE public.organization_monthly_course_usage SET completed_trainings=completed_trainings+1
      WHERE organization_id=v_org AND month_start=v_month;
  END IF;
  RETURN NEW;
END;$function$
;

CREATE OR REPLACE FUNCTION public.get_organization_student_capacity(p_organization_id uuid, p_requested_count integer DEFAULT 1)
 RETURNS TABLE(current_students integer, max_students integer, is_unlimited boolean, can_add boolean, remaining_students integer, subscription_plan text, limit_source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan text;
  v_custom integer;
  v_plan_limit integer;
  v_max integer;
  v_source text;
  v_current integer := 0;
  v_requested integer := GREATEST(COALESCE(p_requested_count, 1), 0);
  v_uid uuid := auth.uid();
  v_jwt_role text := COALESCE(
    current_setting('request.jwt.claim.role', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
  );
  v_is_service boolean := (v_jwt_role = 'service_role');
  v_allowed boolean := false;
  v_month date := date_trunc('month',statement_timestamp() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF v_is_service THEN
    v_allowed := true;
  ELSIF v_uid IS NOT NULL THEN
    IF public.has_role(v_uid, 'admin'::public.app_role) THEN
      v_allowed := true;
    ELSIF EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE ur.user_id = v_uid
        AND ur.role = 'organization'::public.app_role
        AND p.organization_id = p_organization_id
    ) THEN
      v_allowed := true;
    ELSIF EXISTS (
      SELECT 1 FROM public.org_staff os
      WHERE os.user_id = v_uid
        AND os.organization_id = p_organization_id
        AND (os.expires_at IS NULL OR os.expires_at > now())
    ) AND (
      public.has_org_staff_permission(v_uid, p_organization_id, 'students.read')
      OR public.has_org_staff_permission(v_uid, p_organization_id, 'students.write')
    ) THEN
      v_allowed := true;
    ELSIF EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.organization_id = p_organization_id
        AND (
          c.user_id = v_uid
          OR public.has_company_access(v_uid, c.id, 'viewer'::public.company_staff_role)
        )
    ) THEN
      v_allowed := true;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'access denied to organization capacity' USING ERRCODE = '42501';
  END IF;


  SELECT l.subscription_plan,l.max_students,l.student_limit_source INTO v_plan,v_max,v_source
  FROM public._organization_monthly_course_limits(p_organization_id) l;
  SELECT coalesce(u.assigned_students,0) INTO v_current
  FROM public.organization_monthly_course_usage u
  WHERE u.organization_id=p_organization_id AND u.month_start=v_month;
  v_current:=coalesce(v_current,0);

  current_students := v_current;
  max_students := v_max;
  subscription_plan := v_plan;
  limit_source := v_source;
  is_unlimited := (v_max = -1);

  IF is_unlimited THEN
    remaining_students := -1;
    can_add := true;
  ELSIF v_max <= 0 THEN
    remaining_students := 0;
    can_add := false;
  ELSE
    remaining_students := GREATEST(v_max - v_current, 0);
    can_add := (v_current + v_requested) <= v_max;
  END IF;

  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_organization_training_capacity(p_organization_id uuid, p_requested_count integer DEFAULT 1)
 RETURNS TABLE(current_trainings integer, max_trainings integer, is_unlimited boolean, can_complete boolean, remaining_trainings integer, subscription_plan text, limit_source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE l record;requested integer:=greatest(coalesce(p_requested_count,1),0);
BEGIN
  -- Reuse the existing tenant/staff/company authorization; no extra grants.
  PERFORM 1 FROM public.get_organization_student_capacity(p_organization_id,0);
  SELECT * INTO l FROM public._organization_monthly_course_limits(p_organization_id);
  SELECT coalesce(u.completed_trainings,0) INTO current_trainings FROM public.organization_monthly_course_usage u
    WHERE u.organization_id=p_organization_id
      AND u.month_start=date_trunc('month',statement_timestamp() AT TIME ZONE 'Europe/Moscow')::date;
  current_trainings:=coalesce(current_trainings,0);max_trainings:=l.max_trainings;
  subscription_plan:=l.subscription_plan;limit_source:=l.training_limit_source;
  is_unlimited:=max_trainings=-1;
  remaining_trainings:=CASE WHEN is_unlimited THEN -1 ELSE greatest(max_trainings-current_trainings,0) END;
  can_complete:=is_unlimited OR current_trainings+requested<=max_trainings;
  RETURN NEXT;
END;$function$
;

BEGIN;
-- Additive managed Rostekhnadzor banks. No existing course, result or billing
-- row/policy is changed. Public questions are distinct from reviewed keys.
-- Provider Storage owns bucket creation. Create rtn-sources through the
-- supported Storage API first (public=false), then apply this migration.
-- A NULL limit is the provider default; the worker and SQL independently cap
-- every original at 50 MiB. Do not repair or mutate an existing bucket here.
DO $bucket_precondition$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='rtn-sources' AND name='rtn-sources'
  AND public IS FALSE AND(file_size_limit IS NULL OR file_size_limit=52428800))
 THEN RAISE EXCEPTION 'rtn_private_source_bucket_precondition_required';END IF;
END;$bucket_precondition$;
-- Record the pre-existing catalog before creating any RTN function. Provider
-- default grants are scrubbed only on this migration's new objects, never on
-- a pre-existing public overload or an unrelated existing helper.
CREATE TEMP TABLE rtn_core_existing_function_oids ON COMMIT DROP AS SELECT oid FROM pg_proc;
CREATE SCHEMA rtn_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA rtn_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION rtn_private.official_url(p_url text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT p_url IS NOT NULL AND p_url ~ '^https://(www\.)?gosnadzor\.ru/(service/list/|energy/|upload/)[^[:space:]#]*$'
$fn$;

CREATE TABLE rtn_private.sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,title text NOT NULL,
 page_url text NOT NULL CHECK(rtn_private.official_url(page_url)),
 document_url text NOT NULL CHECK(rtn_private.official_url(document_url)),
 trusted_anchor_rule text NOT NULL CHECK(trusted_anchor_rule IN('a1','energy-xlsx')),
 parser text NOT NULL CHECK(parser IN('industrial-pdf','energy-xlsx')),sheet text,
 last_checked_at timestamptz,last_success_at timestamptz,last_full_check_at timestamptz,
 last_sha256 text CHECK(last_sha256 ~ '^[0-9a-f]{64}$'),last_status text,source_generation integer NOT NULL DEFAULT 0 CHECK(source_generation>=0),
 last_resolved_page_url text CHECK(last_resolved_page_url IS NULL OR rtn_private.official_url(last_resolved_page_url)),
 last_document_url text CHECK(last_document_url IS NULL OR rtn_private.official_url(last_document_url)),
 active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rtn_private.banks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id uuid NOT NULL REFERENCES rtn_private.sources(id),
 code text NOT NULL UNIQUE,title text NOT NULL,domain text NOT NULL,parent_bank_id uuid REFERENCES rtn_private.banks(id),
 UNIQUE(source_id,id)
);
CREATE TABLE rtn_private.source_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id uuid NOT NULL REFERENCES rtn_private.sources(id),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),original_path text NOT NULL,
 media_type text NOT NULL,byte_size bigint NOT NULL CHECK(byte_size>0 AND byte_size<=52428800),
 document_url text NOT NULL CHECK(rtn_private.official_url(document_url)),
 metadata jsonb NOT NULL DEFAULT '{}',captured_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,sha256),UNIQUE(source_id,id)
);
CREATE TABLE rtn_private.bank_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),
 source_revision_id uuid NOT NULL REFERENCES rtn_private.source_revisions(id),
 questions jsonb NOT NULL CHECK(jsonb_typeof(questions)='array' AND jsonb_array_length(questions)>0),
 parent_bank_revision_id uuid REFERENCES rtn_private.bank_revisions(id),
 previous_revision_id uuid REFERENCES rtn_private.bank_revisions(id),normalization_version integer NOT NULL DEFAULT 1 CHECK(normalization_version>0),
 normalized_sha256 text NOT NULL CHECK(normalized_sha256 ~ '^[0-9a-f]{64}$'),
 normalization_note text NOT NULL CHECK(length(btrim(normalization_note)) BETWEEN 10 AND 4000),
 question_count integer NOT NULL CHECK(question_count>0),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(bank_id,source_revision_id,normalization_version),UNIQUE(bank_id,parent_bank_revision_id,normalized_sha256),UNIQUE(bank_id,id)
);
CREATE TABLE rtn_private.key_sets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_id uuid NOT NULL,
 bank_revision_id uuid NOT NULL,questions jsonb NOT NULL,materials jsonb NOT NULL DEFAULT '[]',
 display_title text NOT NULL CHECK(length(btrim(display_title)) BETWEEN 1 AND 1000),source_generation integer NOT NULL CHECK(source_generation>0),
 review_note text NOT NULL CHECK(length(btrim(review_note)) BETWEEN 10 AND 4000),
 reviewed_by uuid NOT NULL,reviewed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(bank_id,bank_revision_id) REFERENCES rtn_private.bank_revisions(bank_id,id),
 UNIQUE(bank_id,id)
);
CREATE TABLE rtn_private.releases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_id uuid NOT NULL,key_set_id uuid NOT NULL,
 effective_from date NOT NULL,release_note text NOT NULL CHECK(length(btrim(release_note)) BETWEEN 10 AND 4000),
 published_by uuid NOT NULL,published_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(bank_id,key_set_id) REFERENCES rtn_private.key_sets(bank_id,id),
 UNIQUE(key_set_id),UNIQUE(bank_id,id)
);
CREATE INDEX rtn_releases_current ON rtn_private.releases(bank_id,effective_from DESC,published_at DESC);
CREATE TABLE rtn_private.pilot_grants(
 organization_id uuid NOT NULL REFERENCES public.organizations(id),bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,bank_id),
 -- Exact bounded test exceptions; no payment or financial access is granted.
 CHECK(organization_id IN('cdd87239-1b04-47c9-8cd6-7ad57af4c54b'::uuid,
  '0e29e728-bcc5-46e6-a339-066fb1e9c726'::uuid,'f7701297-2c10-4f8e-8123-4016cee9984f'::uuid))
);
CREATE TABLE rtn_private.rollout_events(
 request_id uuid PRIMARY KEY,actor_id uuid NOT NULL,from_stage text NOT NULL CHECK(from_stage IN('pilot','paid')),
 to_stage text NOT NULL CHECK(to_stage IN('pilot','paid')),expected_revision integer NOT NULL,
 revision integer NOT NULL UNIQUE CHECK(revision>0),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 4000),
 evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object' AND evidence<>'{}'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rtn_private.rollout_state(
 id integer PRIMARY KEY DEFAULT 1 CHECK(id=1),stage text NOT NULL DEFAULT 'pilot' CHECK(stage IN('pilot','paid')),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),last_event_id uuid REFERENCES rtn_private.rollout_events(request_id),
 quota_integration_ready boolean NOT NULL DEFAULT false,privacy_integration_ready boolean NOT NULL DEFAULT false
);
INSERT INTO rtn_private.rollout_state(id) VALUES(1);
CREATE TABLE rtn_private.settings(
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),notify_updates boolean NOT NULL DEFAULT true,
 show_archived_releases boolean NOT NULL DEFAULT false,updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rtn_private.check_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id uuid NOT NULL REFERENCES rtn_private.sources(id),
 organization_id uuid REFERENCES public.organizations(id),requested_by uuid,
 kind text NOT NULL CHECK(kind IN('manual','daily','weekly')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','unchanged','changed','error')),
 queued_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,
 lease_token uuid,lease_expires_at timestamptz,attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
 revision_id uuid REFERENCES rtn_private.source_revisions(id),http_status integer,error text,result_metadata jsonb NOT NULL DEFAULT '{}',
 CHECK((kind='manual')=(organization_id IS NOT NULL AND requested_by IS NOT NULL))
);
CREATE UNIQUE INDEX rtn_one_open_source_check ON rtn_private.check_runs(source_id) WHERE status IN('queued','running');
CREATE INDEX rtn_check_runs_recent ON rtn_private.check_runs(source_id,queued_at DESC);
CREATE TABLE rtn_private.assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),student_id uuid NOT NULL REFERENCES public.profiles(id),
 student_user_id uuid NOT NULL,group_id uuid REFERENCES public.student_groups(id),
 assigned_by uuid NOT NULL,assigned_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'assigned' CHECK(status IN('assigned','in_progress','completed')),
 UNIQUE(organization_id,bank_id,student_id),UNIQUE(organization_id,id)
);
CREATE TABLE rtn_private.attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,assignment_id uuid NOT NULL,
 student_user_id uuid NOT NULL,release_id uuid NOT NULL REFERENCES rtn_private.releases(id),
 title_snapshot text NOT NULL,code_snapshot text NOT NULL,
 question_snapshot jsonb NOT NULL,key_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','submitted')),
 started_at timestamptz NOT NULL DEFAULT now(),submitted_at timestamptz,
 answers jsonb,correct integer,total integer NOT NULL CHECK(total>0),score numeric,passed boolean,
 FOREIGN KEY(organization_id,assignment_id) REFERENCES rtn_private.assignments(organization_id,id),
 CHECK((status='active' AND submitted_at IS NULL AND answers IS NULL AND score IS NULL AND passed IS NULL)
    OR(status='submitted' AND submitted_at IS NOT NULL AND answers IS NOT NULL AND score IS NOT NULL AND passed IS NOT NULL))
);
CREATE UNIQUE INDEX rtn_one_active_attempt ON rtn_private.attempts(assignment_id) WHERE status='active';
CREATE INDEX rtn_attempts_staff_result ON rtn_private.attempts(organization_id,submitted_at DESC);

-- Keys and originals never become ordinary PostgREST tables, even for the
-- service role. Only scoped definer RPCs may mutate this private schema.
DO $rls$ DECLARE t text;BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='rtn_private' LOOP
  EXECUTE format('ALTER TABLE rtn_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON rtn_private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END;$rls$;
CREATE FUNCTION rtn_private.reject_mutation() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $fn$ BEGIN RAISE EXCEPTION 'rtn_history_is_immutable' USING ERRCODE='42501';END;$fn$;
DO $immutable$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['source_revisions','bank_revisions','key_sets','releases','rollout_events'] LOOP
  EXECUTE format('CREATE TRIGGER rtn_immutable BEFORE UPDATE OR DELETE ON rtn_private.%I FOR EACH ROW EXECUTE FUNCTION rtn_private.reject_mutation()',t);
  EXECUTE format('CREATE TRIGGER rtn_no_truncate BEFORE TRUNCATE ON rtn_private.%I FOR EACH STATEMENT EXECUTE FUNCTION rtn_private.reject_mutation()',t);
 END LOOP;
END;$immutable$;
CREATE FUNCTION rtn_private.freeze_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'rtn_attempt_history_is_immutable' USING ERRCODE='42501';END IF;
 IF OLD.status='submitted' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
 OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id OR NEW.student_user_id IS DISTINCT FROM OLD.student_user_id
 OR NEW.release_id IS DISTINCT FROM OLD.release_id OR NEW.question_snapshot IS DISTINCT FROM OLD.question_snapshot
 OR NEW.title_snapshot IS DISTINCT FROM OLD.title_snapshot OR NEW.code_snapshot IS DISTINCT FROM OLD.code_snapshot
 OR NEW.key_snapshot IS DISTINCT FROM OLD.key_snapshot OR NEW.started_at IS DISTINCT FROM OLD.started_at
 OR NEW.total IS DISTINCT FROM OLD.total OR NEW.status<>'submitted'
 THEN RAISE EXCEPTION 'rtn_attempt_history_is_immutable' USING ERRCODE='42501';END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER rtn_attempt_frozen BEFORE UPDATE OR DELETE ON rtn_private.attempts FOR EACH ROW EXECUTE FUNCTION rtn_private.freeze_attempt();
CREATE TRIGGER rtn_attempt_no_truncate BEFORE TRUNCATE ON rtn_private.attempts FOR EACH STATEMENT EXECUTE FUNCTION rtn_private.reject_mutation();

CREATE FUNCTION rtn_private.actor_allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND auth.role()='authenticated' AND public.account_deletion_access_allowed()
 AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND blocked_at IS NOT NULL)
$fn$;
CREATE FUNCTION rtn_private.assert_service() RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $fn$
BEGIN IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'rtn_service_required' USING ERRCODE='42501';END IF;END;$fn$;
CREATE FUNCTION rtn_private.assert_admin() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT rtn_private.actor_allowed() OR NOT public.has_role(auth.uid(),'admin'::public.app_role)
 THEN RAISE EXCEPTION 'rtn_admin_required' USING ERRCODE='42501';END IF;RETURN auth.uid();
END;$fn$;
CREATE FUNCTION rtn_private.assert_staff(p_org uuid,p_permission text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT rtn_private.actor_allowed() OR NOT coalesce(public.can_access_organization(p_org,p_permission),false)
  OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.organization_id=p_org AND(p.archived_at IS NOT NULL OR p.blocked_at IS NOT NULL))
 THEN RAISE EXCEPTION 'rtn_organization_permission_required' USING ERRCODE='42501';END IF;
END;$fn$;
CREATE FUNCTION rtn_private.entitled(p_org uuid,p_bank uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_org)
 AND NOT EXISTS(SELECT 1 FROM billing_access_private.active_holds h WHERE h.organization_id=p_org)
 AND(EXISTS(SELECT 1 FROM rtn_private.rollout_state gate WHERE gate.id=1 AND gate.stage='paid') AND(
 EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_org AND o.is_paid AND o.subscription_plan<>'free' AND o.paid_until>now())
 OR EXISTS(SELECT 1 FROM public.organization_billing_agreements a WHERE a.organization_id=p_org
  AND a.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date
  AND(a.effective_to IS NULL OR a.effective_to>(now() AT TIME ZONE 'Europe/Moscow')::date)))
 OR EXISTS(SELECT 1 FROM rtn_private.pilot_grants p WHERE p.organization_id=p_org AND(p_bank IS NULL OR p.bank_id=p_bank)))
$fn$;
CREATE FUNCTION rtn_private.assert_entitled(p_org uuid,p_bank uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN IF NOT rtn_private.entitled(p_org,p_bank) THEN RAISE EXCEPTION 'rtn_active_platform_access_required' USING ERRCODE='42501';END IF;END;$fn$;
CREATE FUNCTION rtn_private.public_questions(p_questions jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',q->>'id','number',q->'number','text',q->>'text',
  'options_origin',coalesce(q->>'options_origin','official'),'expected_correct_count',CASE WHEN jsonb_typeof(q->'correct_option_ids')='array' THEN jsonb_array_length(q->'correct_option_ids') ELSE NULL END,'options',
  (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o->>'id','text',o->>'text') ORDER BY m),'[]'::jsonb)
   FROM jsonb_array_elements(q->'options') WITH ORDINALITY z(o,m))) ORDER BY n),'[]'::jsonb)
 FROM jsonb_array_elements(p_questions) WITH ORDINALITY a(q,n)
$fn$;
CREATE FUNCTION rtn_private.valid_questions(p_questions jsonb,p_reviewed boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE q jsonb;o jsonb;ids text[];option_ids text[];correct_ids text[];BEGIN
 IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_questions) NOT BETWEEN 1 AND 10000 THEN RETURN false;END IF;
 ids:=ARRAY[]::text[];
 FOR q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
  IF jsonb_typeof(q) IS DISTINCT FROM 'object' OR nullif(btrim(q->>'id'),'') IS NULL OR length(q->>'id')>160
   OR q->>'id'=ANY(ids) OR nullif(btrim(q->>'text'),'') IS NULL OR length(q->>'text')>30000
   OR coalesce(q->>'number','') !~ '^[1-9][0-9]{0,6}$' OR jsonb_typeof(q->'options') IS DISTINCT FROM 'array'
   OR jsonb_array_length(q->'options')>30 THEN RETURN false;END IF;
  ids:=array_append(ids,q->>'id');option_ids:=ARRAY[]::text[];
  FOR o IN SELECT value FROM jsonb_array_elements(q->'options') LOOP
   IF jsonb_typeof(o) IS DISTINCT FROM 'object' OR nullif(btrim(o->>'id'),'') IS NULL OR length(o->>'id')>160
    OR o->>'id'=ANY(option_ids) OR nullif(btrim(o->>'text'),'') IS NULL OR length(o->>'text')>10000 THEN RETURN false;END IF;
   option_ids:=array_append(option_ids,o->>'id');
  END LOOP;
  IF p_reviewed THEN
   IF cardinality(option_ids)<2 OR jsonb_typeof(q->'correct_option_ids') IS DISTINCT FROM 'array'
    OR jsonb_typeof(q->'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'evidence')=0 THEN RETURN false;END IF;
   SELECT array_agg(value) INTO correct_ids FROM jsonb_array_elements_text(q->'correct_option_ids');
   IF coalesce(cardinality(correct_ids),0)=0 OR NOT correct_ids<@option_ids
    OR cardinality(correct_ids)<>(SELECT count(DISTINCT x) FROM unnest(correct_ids)x) THEN RETURN false;END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(q->'evidence')e WHERE nullif(btrim(e->>'citation'),'') IS NULL OR length(e->>'citation')>4000
    OR(coalesce(e->>'url','') !~ '^https://' AND coalesce(e->>'url','') !~ '^http://(publication\.|actual\.)?pravo\.gov\.ru/')) THEN RETURN false;END IF;
  ELSIF q ?| ARRAY['correct_option_ids','correct_answer','answer','is_correct','key','evidence'] THEN RETURN false;
  END IF;
 END LOOP;RETURN true;
END;$fn$;
CREATE FUNCTION rtn_private.safe_metadata(p_value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE k text;v jsonb;result jsonb;BEGIN
 IF jsonb_typeof(p_value)='object' THEN
  result:='{}';FOR k,v IN SELECT * FROM jsonb_each(p_value) LOOP
   IF k !~* '(authorization|cookie|password|token|secret|api.?key|headers)' THEN result:=result||jsonb_build_object(k,rtn_private.safe_metadata(v));END IF;
  END LOOP;RETURN result;
 ELSIF jsonb_typeof(p_value)='array' THEN SELECT coalesce(jsonb_agg(rtn_private.safe_metadata(value)),'[]') INTO result FROM jsonb_array_elements(p_value);RETURN result;
 ELSE RETURN p_value;END IF;
END;$fn$;
CREATE FUNCTION rtn_private.valid_materials(p_materials jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE m jsonb;ids text[]:=ARRAY[]::text[];BEGIN
 IF jsonb_typeof(p_materials) IS DISTINCT FROM 'array' OR jsonb_array_length(p_materials) NOT BETWEEN 1 AND 100 OR octet_length(p_materials::text)>2097152 THEN RETURN false;END IF;
 FOR m IN SELECT value FROM jsonb_array_elements(p_materials) LOOP
  IF nullif(btrim(m->>'id'),'') IS NULL OR length(m->>'id')>160 OR m->>'id'=ANY(ids)
   OR length(coalesce(m->>'title','')) NOT BETWEEN 1 AND 1000 OR length(coalesce(m->>'body','')) NOT BETWEEN 1 AND 60000
   OR jsonb_typeof(m->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(m->'source_refs') NOT BETWEEN 1 AND 20
  THEN RETURN false;END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(m->'source_refs')r WHERE length(coalesce(r->>'citation','')) NOT BETWEEN 1 AND 4000
   OR(coalesce(r->>'url','') !~ '^https://' AND coalesce(r->>'url','') !~ '^http://(publication\.|actual\.)?pravo\.gov\.ru/')) THEN RETURN false;END IF;
  ids:=array_append(ids,m->>'id');
 END LOOP;RETURN true;
END;$fn$;
CREATE FUNCTION public.get_rtn_rollout_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE result jsonb;BEGIN
 PERFORM rtn_private.assert_admin();SELECT to_jsonb(s)-'id' INTO result FROM rtn_private.rollout_state s WHERE id=1;
 RETURN result||jsonb_build_object('events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.revision DESC),'[]') FROM rtn_private.rollout_events e));
END;$fn$;
CREATE FUNCTION public.set_rtn_rollout_stage(p_stage text,p_expected_revision integer,p_request_id uuid,p_reason text,p_evidence jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;s rtn_private.rollout_state;prior rtn_private.rollout_events;e rtn_private.rollout_events;BEGIN
 actor:=rtn_private.assert_admin();
 IF p_stage IS NULL OR p_stage NOT IN('pilot','paid') OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_request_id IS NULL
  OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 4000 OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' OR p_evidence='{}'::jsonb
  OR octet_length(p_evidence::text)>32768
 THEN RAISE EXCEPTION 'rtn_invalid_rollout_request' USING ERRCODE='22023';END IF;
 SELECT * INTO STRICT s FROM rtn_private.rollout_state WHERE id=1 FOR UPDATE;
 SELECT * INTO prior FROM rtn_private.rollout_events WHERE request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM actor OR prior.to_stage IS DISTINCT FROM p_stage OR prior.expected_revision IS DISTINCT FROM p_expected_revision
   OR prior.reason IS DISTINCT FROM p_reason OR prior.evidence IS DISTINCT FROM p_evidence THEN RAISE EXCEPTION 'rtn_rollout_request_conflict' USING ERRCODE='40001';END IF;
  RETURN jsonb_build_object('stage',s.stage,'revision',s.revision,'receipt',to_jsonb(prior),'replayed',true);
 END IF;
 IF s.revision<>p_expected_revision THEN RAISE EXCEPTION 'rtn_rollout_revision_conflict' USING ERRCODE='40001';END IF;
 IF s.stage=p_stage THEN RAISE EXCEPTION 'rtn_rollout_stage_already_current' USING ERRCODE='22023';END IF;
 IF p_stage='paid' THEN
  IF NOT s.quota_integration_ready OR NOT s.privacy_integration_ready THEN RAISE EXCEPTION 'rtn_rollout_integrations_not_ready' USING ERRCODE='P0001';END IF;
  IF length(btrim(coalesce(p_evidence->>'qa_acceptance_receipt',''))) NOT BETWEEN 1 AND 4000
   OR length(btrim(coalesce(p_evidence->>'technoservice_acceptance_receipt',''))) NOT BETWEEN 1 AND 4000
  THEN RAISE EXCEPTION 'rtn_rollout_acceptance_evidence_required' USING ERRCODE='22023';END IF;
 END IF;
 INSERT INTO rtn_private.rollout_events(request_id,actor_id,from_stage,to_stage,expected_revision,revision,reason,evidence)
  VALUES(p_request_id,actor,s.stage,p_stage,s.revision,s.revision+1,p_reason,p_evidence) RETURNING * INTO e;
 UPDATE rtn_private.rollout_state SET stage=p_stage,revision=e.revision,last_event_id=e.request_id WHERE id=1;
 RETURN jsonb_build_object('stage',p_stage,'revision',e.revision,'receipt',to_jsonb(e),'replayed',false);
END;$fn$;

CREATE FUNCTION public.register_rtn_source(p_source jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE sid uuid;bid uuid;b jsonb;ids jsonb:='[]';BEGIN
 PERFORM rtn_private.assert_service();
 IF NOT rtn_private.official_url(p_source->>'page_url') OR NOT rtn_private.official_url(p_source->>'document_url')
 OR nullif(btrim(p_source->>'code'),'') IS NULL OR nullif(btrim(p_source->>'title'),'') IS NULL
 OR jsonb_typeof(p_source->'banks') IS DISTINCT FROM 'array' OR jsonb_array_length(p_source->'banks') NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'rtn_invalid_source' USING ERRCODE='22023';END IF;
 SELECT id INTO sid FROM rtn_private.sources WHERE code=p_source->>'code';
 IF sid IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM rtn_private.sources WHERE id=sid AND page_url=p_source->>'page_url' AND document_url=p_source->>'document_url'
   AND parser=p_source->>'parser' AND trusted_anchor_rule=p_source->>'trusted_anchor_rule' AND sheet IS NOT DISTINCT FROM p_source->>'sheet')
  THEN RAISE EXCEPTION 'rtn_source_registration_conflict' USING ERRCODE='40001';END IF;
 ELSE
  INSERT INTO rtn_private.sources(id,code,title,page_url,document_url,parser,trusted_anchor_rule,sheet)
  VALUES(coalesce((p_source->>'id')::uuid,gen_random_uuid()),p_source->>'code',p_source->>'title',p_source->>'page_url',p_source->>'document_url',p_source->>'parser',p_source->>'trusted_anchor_rule',p_source->>'sheet') RETURNING id INTO sid;
 END IF;
 FOR b IN SELECT value FROM jsonb_array_elements(p_source->'banks') LOOP
  IF nullif(btrim(b->>'code'),'') IS NULL OR nullif(btrim(b->>'title'),'') IS NULL OR nullif(btrim(b->>'domain'),'') IS NULL THEN RAISE EXCEPTION 'rtn_invalid_bank' USING ERRCODE='22023';END IF;
  INSERT INTO rtn_private.banks(source_id,code,title,domain) VALUES(sid,b->>'code',b->>'title',b->>'domain') ON CONFLICT(code) DO NOTHING RETURNING id INTO bid;
  IF bid IS NULL THEN SELECT id INTO bid FROM rtn_private.banks WHERE code=b->>'code' AND source_id=sid;END IF;
  IF bid IS NULL THEN RAISE EXCEPTION 'rtn_bank_registration_conflict' USING ERRCODE='40001';END IF;
  ids:=ids||jsonb_build_array(jsonb_build_object('id',bid,'code',b->>'code'));
  IF b->>'code' IN('A.1','А.1') THEN
   INSERT INTO rtn_private.pilot_grants(organization_id,bank_id)
    SELECT id,bid FROM public.organizations WHERE id IN('cdd87239-1b04-47c9-8cd6-7ad57af4c54b'::uuid,
     '0e29e728-bcc5-46e6-a339-066fb1e9c726'::uuid,'f7701297-2c10-4f8e-8123-4016cee9984f'::uuid) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('source_id',sid,'bank_ids',ids);
END;$fn$;

CREATE FUNCTION public.request_rtn_source_check(p_organization_id uuid,p_source_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r rtn_private.check_runs;BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.write');
 IF NOT EXISTS(SELECT 1 FROM rtn_private.banks WHERE source_id=p_source_id AND rtn_private.entitled(p_organization_id,id))
 THEN RAISE EXCEPTION 'rtn_source_access_required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rtn:source:'||p_source_id::text,20261114));
 SELECT * INTO r FROM rtn_private.check_runs WHERE source_id=p_source_id AND status IN('queued','running');
 IF FOUND THEN RETURN jsonb_build_object('run_id',r.id,'status',r.status,'queued_at',r.queued_at,'replayed',true);END IF;
 SELECT * INTO r FROM rtn_private.check_runs WHERE source_id=p_source_id AND queued_at>now()-interval '2 minutes' ORDER BY queued_at DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('run_id',r.id,'status',r.status,'queued_at',r.queued_at,'replayed',true);END IF;
 INSERT INTO rtn_private.check_runs(source_id,organization_id,requested_by,kind) VALUES(p_source_id,p_organization_id,auth.uid(),'manual') RETURNING * INTO r;
 RETURN jsonb_build_object('run_id',r.id,'status',r.status,'queued_at',r.queued_at,'replayed',false);
END;$fn$;
CREATE FUNCTION public.enqueue_due_rtn_checks() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s rtn_private.sources;rid uuid;ids jsonb:='[]';BEGIN
 PERFORM rtn_private.assert_service();
 FOR s IN SELECT * FROM rtn_private.sources WHERE active ORDER BY id FOR UPDATE SKIP LOCKED LOOP
  -- Expired third leases are terminal; lesser crashes are reclaimable.
  UPDATE rtn_private.check_runs SET status='error',completed_at=now(),error='worker_lease_expired',lease_token=NULL,lease_expires_at=NULL
   WHERE source_id=s.id AND status='running' AND lease_expires_at<now() AND attempt_count>=3;
  IF EXISTS(SELECT 1 FROM rtn_private.check_runs WHERE source_id=s.id AND status IN('queued','running')) THEN CONTINUE;END IF;
  IF s.last_checked_at IS NULL OR s.last_checked_at<=now()-interval '1 day'
    OR s.last_full_check_at IS NULL OR s.last_full_check_at<=now()-interval '7 days' THEN
   INSERT INTO rtn_private.check_runs(source_id,kind) VALUES(s.id,CASE WHEN s.last_full_check_at IS NULL OR s.last_full_check_at<=now()-interval '7 days' THEN 'weekly' ELSE 'daily' END) RETURNING id INTO rid;
   ids:=ids||jsonb_build_array(rid);
  END IF;
 END LOOP;RETURN jsonb_build_object('queued',jsonb_array_length(ids),'run_ids',ids);
END;$fn$;
CREATE FUNCTION public.claim_rtn_check(p_run_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r rtn_private.check_runs;s rtn_private.sources;BEGIN
 PERFORM rtn_private.assert_service();
 SELECT * INTO r FROM rtn_private.check_runs WHERE(p_run_id IS NULL OR id=p_run_id)
  AND(status='queued' OR(status='running' AND lease_expires_at<now())) AND attempt_count<3 ORDER BY queued_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE rtn_private.check_runs SET status='running',started_at=coalesce(started_at,now()),lease_token=gen_random_uuid(),lease_expires_at=now()+interval '10 minutes',attempt_count=attempt_count+1 WHERE id=r.id RETURNING * INTO r;
 SELECT * INTO STRICT s FROM rtn_private.sources WHERE id=r.source_id;
 RETURN jsonb_build_object('run_id',r.id,'lease_token',r.lease_token,'kind',r.kind,'lease_expires_at',r.lease_expires_at,
  'source',jsonb_build_object('id',s.id,'page_url',coalesce(s.last_resolved_page_url,s.page_url),'document_url',coalesce(s.last_document_url,s.document_url),'registered_page_url',s.page_url,'trusted_anchor_rule',s.trusted_anchor_rule,'parser',s.parser,'sheet',s.sheet,'last_sha256',s.last_sha256));
END;$fn$;
CREATE FUNCTION rtn_private.normalize_revision(p_revision uuid,p_banks jsonb,p_previous_revision_ids jsonb DEFAULT NULL,p_correction_note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s uuid;bid uuid;b jsonb;ids jsonb:='[]';seen text[]:=ARRAY[]::text[];prior rtn_private.bank_revisions;expected text;BEGIN
 SELECT source_id INTO s FROM rtn_private.source_revisions WHERE id=p_revision;
 IF s IS NULL OR jsonb_typeof(p_banks) IS DISTINCT FROM 'array' OR jsonb_array_length(p_banks)=0 THEN RAISE EXCEPTION 'rtn_invalid_normalization' USING ERRCODE='22023';END IF;
 -- Canonical lock order: source, immutable original, normalization. Publishing
 -- takes that same source lock before checking the latest reviewed context.
 PERFORM 1 FROM rtn_private.sources WHERE id=s FOR UPDATE;
 PERFORM 1 FROM rtn_private.source_revisions WHERE id=p_revision FOR UPDATE;
 IF p_previous_revision_ids IS NOT NULL AND(jsonb_typeof(p_previous_revision_ids) IS DISTINCT FROM 'object' OR length(btrim(coalesce(p_correction_note,''))) NOT BETWEEN 10 AND 4000)
 THEN RAISE EXCEPTION 'rtn_correction_note_and_cas_required' USING ERRCODE='22023';END IF;
 FOR b IN SELECT value FROM jsonb_array_elements(p_banks) LOOP
  SELECT id INTO bid FROM rtn_private.banks WHERE source_id=s AND code=b->>'code' AND parent_bank_id IS NULL;
  IF bid IS NULL OR b->>'code'=ANY(seen) OR NOT rtn_private.valid_questions(b->'questions',false) THEN RAISE EXCEPTION 'rtn_invalid_normalized_bank' USING ERRCODE='22023';END IF;
  seen:=array_append(seen,b->>'code');
  SELECT * INTO prior FROM rtn_private.bank_revisions WHERE bank_id=bid AND source_revision_id=p_revision ORDER BY normalization_version DESC LIMIT 1;
  IF FOUND THEN
   expected:=p_previous_revision_ids->>(b->>'code');
   IF prior.questions=b->'questions' THEN
    -- Exact retries never rewrite a normalization. A retry of a committed
    -- correction must name either that current row or its audited predecessor.
    IF p_previous_revision_ids IS NOT NULL AND expected IS DISTINCT FROM prior.id::text
     AND NOT(expected IS NOT DISTINCT FROM prior.previous_revision_id::text AND prior.normalization_note=p_correction_note)
    THEN RAISE EXCEPTION 'rtn_normalization_revision_conflict' USING ERRCODE='40001';END IF;
   ELSE
    IF p_previous_revision_ids IS NULL OR expected IS DISTINCT FROM prior.id::text
    THEN RAISE EXCEPTION 'rtn_normalization_revision_conflict' USING ERRCODE='40001';END IF;
    INSERT INTO rtn_private.bank_revisions(bank_id,source_revision_id,questions,question_count,previous_revision_id,normalization_version,normalized_sha256,normalization_note)
     VALUES(bid,p_revision,b->'questions',jsonb_array_length(b->'questions'),prior.id,prior.normalization_version+1,encode(sha256(convert_to((b->'questions')::text,'UTF8')),'hex'),p_correction_note);
   END IF;
  ELSE
   IF p_previous_revision_ids IS NOT NULL THEN RAISE EXCEPTION 'rtn_normalization_revision_conflict' USING ERRCODE='40001';END IF;
   INSERT INTO rtn_private.bank_revisions(bank_id,source_revision_id,questions,question_count,normalized_sha256,normalization_note)
    VALUES(bid,p_revision,b->'questions',jsonb_array_length(b->'questions'),encode(sha256(convert_to((b->'questions')::text,'UTF8')),'hex'),'Initial extraction from immutable official source');
  END IF;
  ids:=ids||jsonb_build_array(bid);
 END LOOP;
 IF jsonb_array_length(ids)<>(SELECT count(*) FROM rtn_private.banks WHERE source_id=s AND parent_bank_id IS NULL)
 THEN RAISE EXCEPTION 'rtn_partial_source_normalization' USING ERRCODE='22023';END IF;
 RETURN ids;
END;$fn$;
CREATE FUNCTION public.normalize_rtn_revision(p_source_revision_id uuid,p_normalized_banks jsonb,p_previous_revision_ids jsonb DEFAULT NULL,p_correction_note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ids jsonb;BEGIN
 PERFORM rtn_private.assert_service();ids:=rtn_private.normalize_revision(p_source_revision_id,p_normalized_banks,p_previous_revision_ids,p_correction_note);
 RETURN jsonb_build_object('revision_id',p_source_revision_id,'bank_ids',ids,'normalization_required',false);
END;$fn$;
CREATE FUNCTION public.complete_rtn_check(p_run_id uuid,p_lease_token uuid,p_result jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r rtn_private.check_runs;s rtn_private.sources;rev uuid;bid uuid;b jsonb;q jsonb;new_rev boolean:=false;ids jsonb:='[]';v_status text;meta jsonb;BEGIN
 PERFORM rtn_private.assert_service();
 SELECT * INTO r FROM rtn_private.check_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'running' OR r.lease_token IS DISTINCT FROM p_lease_token OR r.lease_expires_at<=now()
 THEN RAISE EXCEPTION 'rtn_check_lease_conflict' USING ERRCODE='40001';END IF;
 SELECT * INTO STRICT s FROM rtn_private.sources WHERE id=r.source_id FOR UPDATE;
 v_status:=p_result->>'status';
 IF p_result ? 'metadata' AND(jsonb_typeof(p_result->'metadata') IS DISTINCT FROM 'object' OR octet_length((p_result->'metadata')::text)>262144)
 THEN RAISE EXCEPTION 'rtn_invalid_check_metadata' USING ERRCODE='22023';END IF;
 meta:=rtn_private.safe_metadata(coalesce(p_result->'metadata','{}'));
 IF meta ? 'source_page_url' AND NOT rtn_private.official_url(meta->>'source_page_url') THEN RAISE EXCEPTION 'rtn_untrusted_resolved_page' USING ERRCODE='22023';END IF;
 IF p_result ? 'document_url' AND NOT rtn_private.official_url(p_result->>'document_url') THEN RAISE EXCEPTION 'rtn_untrusted_resolved_document' USING ERRCODE='22023';END IF;
 IF v_status IS NULL OR v_status NOT IN('changed','unchanged','error') THEN RAISE EXCEPTION 'rtn_invalid_check_result' USING ERRCODE='22023';END IF;
 IF v_status<>'error' THEN
  IF coalesce(p_result->>'sha256','') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'rtn_invalid_source_hash' USING ERRCODE='22023';END IF;
  IF v_status='unchanged' AND s.last_sha256 IS DISTINCT FROM p_result->>'sha256' THEN RAISE EXCEPTION 'rtn_unchanged_hash_conflict' USING ERRCODE='22023';END IF;
  SELECT id INTO rev FROM rtn_private.source_revisions WHERE source_id=s.id AND sha256=p_result->>'sha256';
  IF rev IS NULL THEN
   IF v_status<>'changed' OR coalesce(p_result->>'original_path','') !~ ('^'||s.id::text||'/'||(p_result->>'sha256')||'\.(pdf|xlsx|json)$')
    OR NOT rtn_private.official_url(p_result->>'document_url')
   THEN RAISE EXCEPTION 'rtn_invalid_source_revision' USING ERRCODE='22023';END IF;
   INSERT INTO rtn_private.source_revisions(source_id,sha256,original_path,media_type,byte_size,document_url,metadata)
    VALUES(s.id,p_result->>'sha256',p_result->>'original_path',p_result->>'media_type',(p_result->>'byte_size')::bigint,p_result->>'document_url',meta) RETURNING id INTO rev;
   new_rev:=true;
   -- Scanned new originals are safely captured before OCR exists. They are
   -- visible as normalization_required and cannot be assigned or graded.
   IF p_result ? 'normalized_banks' AND p_result->'normalized_banks'<>'[]'::jsonb THEN
    ids:=rtn_private.normalize_revision(rev,p_result->'normalized_banks');
   END IF;
  END IF;
  v_status:=CASE WHEN s.last_sha256 IS NOT DISTINCT FROM p_result->>'sha256' THEN 'unchanged' ELSE 'changed' END;
 END IF;
 UPDATE rtn_private.check_runs SET status=v_status,completed_at=now(),revision_id=rev,http_status=(p_result->>'http_status')::integer,
  error=CASE WHEN v_status='error' THEN left(coalesce(p_result->>'error','source_check_failed'),1000) END,result_metadata=meta,lease_token=NULL,lease_expires_at=NULL WHERE id=r.id;
 UPDATE rtn_private.sources SET last_checked_at=now(),last_success_at=CASE WHEN v_status='error' THEN last_success_at ELSE now() END,
  last_full_check_at=CASE WHEN v_status<>'error' AND r.kind='weekly' THEN now() ELSE last_full_check_at END,
  source_generation=CASE WHEN v_status<>'error' AND last_sha256 IS DISTINCT FROM p_result->>'sha256' THEN source_generation+1 ELSE source_generation END,
  last_sha256=CASE WHEN v_status='error' THEN last_sha256 ELSE p_result->>'sha256' END,last_status=v_status,
  last_resolved_page_url=CASE WHEN v_status='error' THEN last_resolved_page_url ELSE coalesce(meta->>'source_page_url',last_resolved_page_url) END,
  last_document_url=CASE WHEN v_status='error' THEN last_document_url ELSE coalesce(p_result->>'document_url',last_document_url) END WHERE id=s.id;
 RETURN jsonb_build_object('run_id',r.id,'status',v_status,'revision_id',rev,'new_revision',new_rev,'bank_ids',ids,
  'normalization_required',v_status<>'error' AND NOT EXISTS(SELECT 1 FROM rtn_private.bank_revisions br WHERE br.source_revision_id=rev));
END;$fn$;

CREATE FUNCTION public.review_rtn_keys(p_bank_id uuid,p_bank_revision_id uuid,p_questions jsonb,p_review_note text,p_module jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;rev rtn_private.bank_revisions;kid uuid;q jsonb;orig jsonb;target_bank uuid:=p_bank_id;target_rev uuid:=p_bank_revision_id;parent rtn_private.banks;full_bank boolean:=coalesce(p_module->>'kind'='full_bank',false);v_title text;generation integer;BEGIN
 actor:=rtn_private.assert_admin();
 SELECT * INTO rev FROM rtn_private.bank_revisions WHERE id=p_bank_revision_id AND bank_id=p_bank_id;
 IF NOT FOUND OR NOT rtn_private.valid_questions(p_questions,true)
  OR((p_module IS NULL OR full_bank) AND jsonb_array_length(p_questions)<>rev.question_count)
  OR(p_module IS NOT NULL AND jsonb_array_length(p_questions)>rev.question_count)
 THEN RAISE EXCEPTION 'rtn_complete_review_required' USING ERRCODE='22023';END IF;
 -- Serialize child coverage numbering and review context with official checks,
 -- normalization corrections, and publication using the same source lock.
 PERFORM 1 FROM rtn_private.sources WHERE id=(SELECT source_id FROM rtn_private.banks WHERE id=p_bank_id) FOR UPDATE;
 FOR q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
  SELECT x INTO orig FROM jsonb_array_elements(rev.questions)x WHERE x->>'id'=q->>'id' AND x->>'text'=q->>'text' AND x->'number'=q->'number';
  IF orig IS NULL
  THEN RAISE EXCEPTION 'rtn_review_source_mismatch' USING ERRCODE='22023';END IF;
  IF jsonb_array_length(orig->'options')=0 THEN
   IF q->>'options_origin' IS DISTINCT FROM 'authorial_training' THEN RAISE EXCEPTION 'rtn_authorial_options_must_be_explicit' USING ERRCODE='22023';END IF;
  ELSIF rtn_private.public_questions(jsonb_build_array(orig))->0->'options' IS DISTINCT FROM rtn_private.public_questions(jsonb_build_array(q))->0->'options'
  THEN RAISE EXCEPTION 'rtn_official_options_mismatch' USING ERRCODE='22023';END IF;
 END LOOP;
 IF p_module IS NOT NULL AND NOT rtn_private.valid_materials(p_module->'materials') THEN RAISE EXCEPTION 'rtn_valid_learning_materials_required' USING ERRCODE='22023';END IF;
 IF p_module IS NOT NULL AND NOT full_bank THEN
  IF nullif(btrim(p_module->>'code'),'') IS NULL OR nullif(btrim(p_module->>'title'),'') IS NULL OR nullif(btrim(p_module->>'domain'),'') IS NULL
  OR NOT rtn_private.valid_materials(p_module->'materials') THEN RAISE EXCEPTION 'rtn_invalid_module' USING ERRCODE='22023';END IF;
  SELECT * INTO STRICT parent FROM rtn_private.banks WHERE id=p_bank_id;
  IF parent.parent_bank_id IS NOT NULL THEN RAISE EXCEPTION 'rtn_nested_module_forbidden' USING ERRCODE='22023';END IF;
  INSERT INTO rtn_private.banks(source_id,code,title,domain,parent_bank_id) VALUES(parent.source_id,p_module->>'code',p_module->>'title',p_module->>'domain',parent.id)
   ON CONFLICT(code) DO NOTHING RETURNING id INTO target_bank;
  IF target_bank IS NULL THEN SELECT id INTO target_bank FROM rtn_private.banks WHERE code=p_module->>'code' AND parent_bank_id=parent.id;END IF;
  IF target_bank IS NULL THEN RAISE EXCEPTION 'rtn_module_registration_conflict' USING ERRCODE='40001';END IF;
  INSERT INTO rtn_private.bank_revisions(bank_id,source_revision_id,questions,question_count,parent_bank_revision_id,previous_revision_id,normalization_version,normalized_sha256,normalization_note)
   SELECT target_bank,rev.source_revision_id,subset,jsonb_array_length(p_questions),rev.id,
    (SELECT id FROM rtn_private.bank_revisions p WHERE p.bank_id=target_bank AND p.source_revision_id=rev.source_revision_id ORDER BY normalization_version DESC LIMIT 1),
    coalesce((SELECT max(normalization_version) FROM rtn_private.bank_revisions p WHERE p.bank_id=target_bank AND p.source_revision_id=rev.source_revision_id),0)+1,
    encode(sha256(convert_to(subset::text,'UTF8')),'hex'),'Reviewed module subset of normalization '||rev.id::text
   FROM(SELECT jsonb_agg(x ORDER BY n)subset FROM jsonb_array_elements(rev.questions) WITH ORDINALITY z(x,n) WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p_questions)q2 WHERE q2->>'id'=x->>'id'))subset_source
   ON CONFLICT(bank_id,parent_bank_revision_id,normalized_sha256) DO NOTHING RETURNING id INTO target_rev;
  IF target_rev IS NULL THEN
   SELECT id INTO target_rev FROM rtn_private.bank_revisions WHERE bank_id=target_bank AND parent_bank_revision_id=rev.id AND question_count=jsonb_array_length(p_questions)
    AND questions=(SELECT jsonb_agg(x ORDER BY n) FROM jsonb_array_elements(rev.questions) WITH ORDINALITY z(x,n) WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p_questions)q2 WHERE q2->>'id'=x->>'id'));
  END IF;
  IF target_rev IS NULL THEN RAISE EXCEPTION 'rtn_module_coverage_conflict' USING ERRCODE='40001';END IF;
  INSERT INTO rtn_private.pilot_grants(organization_id,bank_id) SELECT organization_id,target_bank FROM rtn_private.pilot_grants WHERE bank_id=parent.id ON CONFLICT DO NOTHING;
 END IF;
 SELECT coalesce(nullif(btrim(p_module->>'title'),''),b.title) INTO v_title FROM rtn_private.banks b WHERE b.id=target_bank;
 SELECT s.source_generation INTO generation FROM rtn_private.banks b JOIN rtn_private.sources s ON s.id=b.source_id WHERE b.id=target_bank;
 PERFORM pg_advisory_xact_lock(hashtextextended('rtn:review:'||target_rev::text,20261114));
 SELECT id INTO kid FROM rtn_private.key_sets WHERE bank_id=target_bank AND bank_revision_id=target_rev AND reviewed_by=actor
  AND questions=p_questions AND materials=coalesce(p_module->'materials','[]') AND display_title=v_title AND source_generation=generation AND review_note=p_review_note ORDER BY reviewed_at,id LIMIT 1;
 IF kid IS NOT NULL THEN RETURN jsonb_build_object('key_set_id',kid,'bank_id',target_bank,'bank_revision_id',target_rev,'key_status','reviewed','reviewed_by',actor,'replayed',true);END IF;
 INSERT INTO rtn_private.key_sets(bank_id,bank_revision_id,questions,materials,display_title,source_generation,review_note,reviewed_by)
  VALUES(target_bank,target_rev,p_questions,coalesce(p_module->'materials','[]'),v_title,generation,p_review_note,actor) RETURNING id INTO kid;
 RETURN jsonb_build_object('key_set_id',kid,'bank_id',target_bank,'bank_revision_id',target_rev,'key_status','reviewed','reviewed_by',actor,'replayed',false);
END;$fn$;
CREATE FUNCTION public.publish_rtn_release(p_key_set_id uuid,p_effective_from date,p_release_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;k rtn_private.key_sets;rid uuid;prior rtn_private.releases;source_effective text;b rtn_private.banks;br rtn_private.bank_revisions;sr rtn_private.source_revisions;s rtn_private.sources;latest_parent uuid;BEGIN
 actor:=rtn_private.assert_admin();SELECT * INTO k FROM rtn_private.key_sets WHERE id=p_key_set_id;
 IF NOT FOUND OR p_effective_from IS NULL THEN RAISE EXCEPTION 'rtn_reviewed_keys_required' USING ERRCODE='22023';END IF;
 SELECT * INTO STRICT b FROM rtn_private.banks WHERE id=k.bank_id;
 SELECT * INTO STRICT br FROM rtn_private.bank_revisions WHERE id=k.bank_revision_id;
 SELECT * INTO STRICT sr FROM rtn_private.source_revisions WHERE id=br.source_revision_id;
 SELECT * INTO STRICT s FROM rtn_private.sources WHERE id=b.source_id FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('rtn:publish:'||k.id::text,20261114));
 SELECT * INTO prior FROM rtn_private.releases WHERE key_set_id=k.id;
 IF FOUND THEN
  IF prior.effective_from IS DISTINCT FROM p_effective_from OR prior.release_note IS DISTINCT FROM p_release_note THEN RAISE EXCEPTION 'rtn_release_request_conflict' USING ERRCODE='40001';END IF;
  RETURN jsonb_build_object('release_id',prior.id,'bank_id',prior.bank_id,'effective_from',prior.effective_from,'key_status','released','replayed',true);
 END IF;
 IF s.last_sha256 IS DISTINCT FROM sr.sha256 OR k.source_generation IS DISTINCT FROM s.source_generation THEN RAISE EXCEPTION 'rtn_release_source_is_not_current' USING ERRCODE='40001';END IF;
 SELECT id INTO latest_parent FROM rtn_private.bank_revisions WHERE bank_id=coalesce(b.parent_bank_id,b.id) AND source_revision_id=sr.id ORDER BY normalization_version DESC LIMIT 1;
 IF latest_parent IS NULL OR(b.parent_bank_id IS NULL AND latest_parent IS DISTINCT FROM br.id)
  OR(b.parent_bank_id IS NOT NULL AND latest_parent IS DISTINCT FROM br.parent_bank_revision_id)
  OR(b.parent_bank_id IS NOT NULL AND br.id IS DISTINCT FROM(SELECT x.id FROM rtn_private.bank_revisions x WHERE x.bank_id=b.id AND x.source_revision_id=sr.id ORDER BY x.normalization_version DESC LIMIT 1))
 THEN RAISE EXCEPTION 'rtn_release_normalization_is_not_current' USING ERRCODE='40001';END IF;
 IF NOT rtn_private.valid_materials(k.materials) THEN RAISE EXCEPTION 'rtn_valid_learning_materials_required' USING ERRCODE='22023';END IF;
 source_effective:=sr.metadata->>'effective_from';
 IF source_effective IS NOT NULL AND(source_effective !~ '^\d{4}-\d{2}-\d{2}$' OR p_effective_from<source_effective::date)
 THEN RAISE EXCEPTION 'rtn_release_before_source_effective_date' USING ERRCODE='22023';END IF;
 INSERT INTO rtn_private.releases(bank_id,key_set_id,effective_from,release_note,published_by)
  VALUES(k.bank_id,k.id,p_effective_from,p_release_note,actor) RETURNING id INTO rid;
 RETURN jsonb_build_object('release_id',rid,'bank_id',k.bank_id,'effective_from',p_effective_from,'key_status','released','replayed',false);
END;$fn$;
CREATE FUNCTION public.save_rtn_settings(p_organization_id uuid,p_notify_updates boolean,p_show_archived_releases boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.write');PERFORM rtn_private.assert_entitled(p_organization_id);
 IF p_notify_updates IS NULL OR p_show_archived_releases IS NULL THEN RAISE EXCEPTION 'rtn_invalid_settings' USING ERRCODE='22023';END IF;
 INSERT INTO rtn_private.settings VALUES(p_organization_id,p_notify_updates,p_show_archived_releases,auth.uid(),now())
 ON CONFLICT(organization_id) DO UPDATE SET notify_updates=excluded.notify_updates,show_archived_releases=excluded.show_archived_releases,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 RETURN jsonb_build_object('notify_updates',p_notify_updates,'show_archived_releases',p_show_archived_releases);
END;$fn$;
CREATE FUNCTION public.get_rtn_editorial_workspace() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM rtn_private.assert_admin();
 RETURN jsonb_build_object(
  'rollout',(SELECT to_jsonb(s)-'id' FROM rtn_private.rollout_state s WHERE id=1),
  'sources',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.code),'[]') FROM rtn_private.sources s),
  'banks',(SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.code),'[]') FROM rtn_private.banks b),
  'source_revisions',(SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('normalization_required',NOT EXISTS(SELECT 1 FROM rtn_private.bank_revisions br WHERE br.source_revision_id=r.id)) ORDER BY r.captured_at DESC,r.id),'[]') FROM rtn_private.source_revisions r),
  'bank_revisions',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id),'[]') FROM rtn_private.bank_revisions r),
  'key_sets',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',k.id,'bank_id',k.bank_id,'bank_revision_id',k.bank_revision_id,'display_title',k.display_title,'question_count',jsonb_array_length(k.questions),'material_count',jsonb_array_length(k.materials),'review_note',k.review_note,'reviewed_by',k.reviewed_by,'reviewed_at',k.reviewed_at) ORDER BY k.reviewed_at DESC,k.id),'[]') FROM rtn_private.key_sets k),
  'releases',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.published_at DESC,r.id),'[]') FROM rtn_private.releases r));
END;$fn$;

CREATE FUNCTION public.assign_rtn_training(p_organization_id uuid,p_bank_id uuid,p_student_ids uuid[],p_group_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE sid uuid;p public.profiles;a rtn_private.assignments;items jsonb:='[]';all_replayed boolean:=true;BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.write');PERFORM rtn_private.assert_staff(p_organization_id,'students.write');PERFORM rtn_private.assert_entitled(p_organization_id,p_bank_id);
 IF NOT EXISTS(SELECT 1 FROM rtn_private.releases WHERE bank_id=p_bank_id AND effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date)
 THEN RAISE EXCEPTION 'rtn_released_bank_required' USING ERRCODE='22023';END IF;
 IF p_student_ids IS NULL OR cardinality(p_student_ids) NOT BETWEEN 1 AND 500 OR array_position(p_student_ids,NULL) IS NOT NULL
 THEN RAISE EXCEPTION 'rtn_invalid_students' USING ERRCODE='22023';END IF;
 IF p_group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_groups WHERE id=p_group_id AND organization_id=p_organization_id)
 THEN RAISE EXCEPTION 'rtn_foreign_group' USING ERRCODE='42501';END IF;
 FOR sid IN SELECT DISTINCT unnest(p_student_ids) LOOP
  SELECT * INTO p FROM public.profiles WHERE id=sid AND organization_id=p_organization_id AND archived_at IS NULL AND blocked_at IS NULL;
  IF NOT FOUND OR NOT public.is_student_profile(p.user_id,p_organization_id)
   OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p.user_id)
   OR(p_group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_organization_id AND m.group_id=p_group_id AND m.user_id=p.user_id))
  THEN RAISE EXCEPTION 'rtn_foreign_or_inactive_student' USING ERRCODE='42501';END IF;
  INSERT INTO rtn_private.assignments(organization_id,bank_id,student_id,student_user_id,group_id,assigned_by)
   VALUES(p_organization_id,p_bank_id,p.id,p.user_id,p_group_id,auth.uid()) ON CONFLICT(organization_id,bank_id,student_id) DO NOTHING RETURNING * INTO a;
  IF FOUND THEN all_replayed:=false;ELSE SELECT * INTO STRICT a FROM rtn_private.assignments WHERE organization_id=p_organization_id AND bank_id=p_bank_id AND student_id=sid;END IF;
  items:=items||jsonb_build_array(jsonb_build_object('id',a.id,'student_id',a.student_id,'bank_id',a.bank_id,'status',a.status,'assigned_at',a.assigned_at));
 END LOOP;RETURN jsonb_build_object('assignments',items,'replayed',all_replayed);
END;$fn$;
CREATE FUNCTION rtn_private.assert_learner_assignment(p_assignment uuid) RETURNS rtn_private.assignments LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a rtn_private.assignments;BEGIN
 SELECT * INTO a FROM rtn_private.assignments WHERE id=p_assignment;
 IF NOT FOUND OR NOT rtn_private.actor_allowed() OR a.student_user_id IS DISTINCT FROM auth.uid()
  OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=a.student_id AND p.user_id=auth.uid() AND p.organization_id=a.organization_id AND p.archived_at IS NULL AND p.blocked_at IS NULL)
  OR NOT public.is_student_profile(auth.uid(),a.organization_id)
 THEN RAISE EXCEPTION 'rtn_learner_assignment_required' USING ERRCODE='42501';END IF;
 PERFORM rtn_private.assert_entitled(a.organization_id,a.bank_id);RETURN a;
END;$fn$;
CREATE FUNCTION public.get_rtn_assignment(p_assignment_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a rtn_private.assignments;r rtn_private.releases;k rtn_private.key_sets;b rtn_private.banks;s rtn_private.sources;br rtn_private.bank_revisions;sr rtn_private.source_revisions;BEGIN
 a:=rtn_private.assert_learner_assignment(p_assignment_id);
 SELECT * INTO r FROM rtn_private.releases WHERE bank_id=a.bank_id AND effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date ORDER BY effective_from DESC,published_at DESC,id DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_released_bank_required' USING ERRCODE='22023';END IF;
 SELECT * INTO STRICT k FROM rtn_private.key_sets WHERE id=r.key_set_id;
 SELECT * INTO STRICT b FROM rtn_private.banks WHERE id=a.bank_id;
 SELECT * INTO STRICT s FROM rtn_private.sources WHERE id=b.source_id;
 SELECT * INTO STRICT br FROM rtn_private.bank_revisions WHERE id=k.bank_revision_id;
 SELECT * INTO STRICT sr FROM rtn_private.source_revisions WHERE id=br.source_revision_id;
  RETURN jsonb_build_object('assignment',jsonb_build_object('id',a.id,'organization_id',a.organization_id,'bank_id',b.id,'code',b.code,'title',k.display_title,'status',a.status),
  'release',jsonb_build_object('id',r.id,'effective_from',r.effective_from,'question_count',br.question_count),
  'source',jsonb_build_object('page_url',coalesce(sr.metadata->>'source_page_url',s.page_url),'document_url',sr.document_url,'approved_on',sr.metadata->>'approved_on'),
  'materials',k.materials);
END;$fn$;
CREATE FUNCTION public.start_rtn_attempt(p_assignment_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a rtn_private.assignments;t rtn_private.attempts;r rtn_private.releases;k rtn_private.key_sets;BEGIN
 a:=rtn_private.assert_learner_assignment(p_assignment_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('rtn:assignment:'||a.id::text,20261114));
 SELECT * INTO t FROM rtn_private.attempts WHERE assignment_id=a.id AND status='active';
 IF NOT FOUND THEN
  SELECT * INTO r FROM rtn_private.releases WHERE bank_id=a.bank_id AND effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date ORDER BY effective_from DESC,published_at DESC,id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'rtn_released_bank_required' USING ERRCODE='22023';END IF;
  SELECT * INTO STRICT k FROM rtn_private.key_sets WHERE id=r.key_set_id;
  INSERT INTO rtn_private.attempts(organization_id,assignment_id,student_user_id,release_id,title_snapshot,code_snapshot,question_snapshot,key_snapshot,total)
   VALUES(a.organization_id,a.id,a.student_user_id,r.id,k.display_title,(SELECT code FROM rtn_private.banks WHERE id=a.bank_id),rtn_private.public_questions(k.questions),k.questions,jsonb_array_length(k.questions)) RETURNING * INTO t;
  UPDATE rtn_private.assignments SET status='in_progress' WHERE id=a.id;
 END IF;
 RETURN jsonb_build_object('attempt_id',t.id,'release_id',t.release_id,'title',t.title_snapshot,'code',t.code_snapshot,'status',t.status,'questions',t.question_snapshot,'started_at',t.started_at,
  'materials',(SELECT k2.materials FROM rtn_private.releases r2 JOIN rtn_private.key_sets k2 ON k2.id=r2.key_set_id WHERE r2.id=t.release_id));
END;$fn$;
CREATE FUNCTION public.submit_rtn_attempt(p_attempt_id uuid,p_answers jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t rtn_private.attempts;a rtn_private.assignments;q jsonb;given text[];expected text[];valid_ids text[];v_correct integer:=0;answer_key text;BEGIN
 SELECT * INTO t FROM rtn_private.attempts WHERE id=p_attempt_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_attempt_not_found' USING ERRCODE='P0002';END IF;
 a:=rtn_private.assert_learner_assignment(t.assignment_id);
 IF t.status='submitted' THEN
  IF t.answers IS DISTINCT FROM p_answers THEN RAISE EXCEPTION 'rtn_submission_conflict' USING ERRCODE='40001';END IF;
 ELSE
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' OR octet_length(p_answers::text)>1048576 THEN RAISE EXCEPTION 'rtn_invalid_answers' USING ERRCODE='22023';END IF;
  FOR answer_key IN SELECT jsonb_object_keys(p_answers) LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t.key_snapshot)qq WHERE qq->>'id'=answer_key) THEN RAISE EXCEPTION 'rtn_unknown_question' USING ERRCODE='22023';END IF;
  END LOOP;
  FOR q IN SELECT value FROM jsonb_array_elements(t.key_snapshot) LOOP
   IF jsonb_typeof(p_answers->(q->>'id')) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'rtn_all_answers_required' USING ERRCODE='22023';END IF;
   SELECT array_agg(value ORDER BY value) INTO given FROM jsonb_array_elements_text(p_answers->(q->>'id'));
   SELECT array_agg(value ORDER BY value) INTO expected FROM jsonb_array_elements_text(q->'correct_option_ids');
   SELECT array_agg(o->>'id') INTO valid_ids FROM jsonb_array_elements(q->'options')o;
   IF coalesce(cardinality(given),0)=0 OR NOT given<@valid_ids OR cardinality(given)<>(SELECT count(DISTINCT x) FROM unnest(given)x)
   THEN RAISE EXCEPTION 'rtn_invalid_answer_option' USING ERRCODE='22023';END IF;
   IF given=expected THEN v_correct:=v_correct+1;END IF;
  END LOOP;
  UPDATE rtn_private.attempts SET status='submitted',submitted_at=now(),answers=p_answers,correct=v_correct,
   score=round(100.0*v_correct/total,2),passed=(v_correct=total) WHERE id=t.id RETURNING * INTO t;
  UPDATE rtn_private.assignments SET status='completed' WHERE id=a.id;
 END IF;
 RETURN jsonb_build_object('attempt_id',t.id,'release_id',t.release_id,'status',t.status,'score',t.score,'total',t.total,'correct',t.correct,'passed',t.passed,'submitted_at',t.submitted_at);
END;$fn$;
CREATE FUNCTION public.get_rtn_attempt(p_attempt_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t rtn_private.attempts;a rtn_private.assignments;BEGIN
 SELECT * INTO t FROM rtn_private.attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_attempt_not_found' USING ERRCODE='P0002';END IF;
 IF t.student_user_id=auth.uid() THEN a:=rtn_private.assert_learner_assignment(t.assignment_id);
 ELSE PERFORM rtn_private.assert_staff(t.organization_id,'courses.read');PERFORM rtn_private.assert_staff(t.organization_id,'students.read');PERFORM rtn_private.assert_entitled(t.organization_id);END IF;
 RETURN jsonb_build_object('attempt_id',t.id,'assignment_id',t.assignment_id,'release_id',t.release_id,'title',t.title_snapshot,'code',t.code_snapshot,'status',t.status,'questions',t.question_snapshot,'answers',t.answers,'started_at',t.started_at,
  'score',t.score,'total',t.total,'correct',t.correct,'passed',t.passed,'submitted_at',t.submitted_at,
  'materials',(SELECT k2.materials FROM rtn_private.releases r2 JOIN rtn_private.key_sets k2 ON k2.id=r2.key_set_id WHERE r2.id=t.release_id),
  'feedback',CASE WHEN t.status='submitted' THEN(SELECT jsonb_agg(jsonb_build_object('id',q2->>'id','explanation',q2->>'explanation','evidence',q2->'evidence')) FROM jsonb_array_elements(t.key_snapshot)q2) ELSE NULL END);
END;$fn$;

CREATE FUNCTION public.get_rtn_workspace(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE can_manage boolean;can_students boolean;allowed boolean;v_banks jsonb;v_checks jsonb;v_students jsonb:='[]';v_groups jsonb:='[]';v_assignments jsonb:='[]';v_results jsonb:='[]';v_settings jsonb;v_archived jsonb:='[]';BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.read');
 allowed:=rtn_private.entitled(p_organization_id);
 can_manage:=allowed AND public.can_access_organization(p_organization_id,'courses.write');
 can_students:=allowed AND public.can_access_organization(p_organization_id,'students.read');
 SELECT jsonb_build_object('notify_updates',coalesce(s.notify_updates,true),'show_archived_releases',coalesce(s.show_archived_releases,false)) INTO v_settings
 FROM(VALUES(1))dummy(n) LEFT JOIN rtn_private.settings s ON s.organization_id=p_organization_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'title',coalesce(active_k.display_title,b.title),'domain',b.domain,'source_id',s.id,'source_url',coalesce(active_sr.metadata->>'source_page_url',sr.metadata->>'source_page_url',s.last_resolved_page_url,s.page_url),'document_url',coalesce(active_sr.document_url,sr.document_url,s.document_url),'latest_document_url',latest_sr.document_url,
  'approved_on',coalesce(active_sr.metadata->>'approved_on',sr.metadata->>'approved_on'),'effective_from',coalesce(r.effective_from::text,sr.metadata->>'effective_from'),
  'question_count',coalesce(active_br.question_count,br.question_count,0),'release_id',r.id,'source_revision_id',coalesce(active_br.source_revision_id,br.source_revision_id),'bank_revision_id',coalesce(active_br.id,br.id),
  'key_status',CASE WHEN r.id IS NOT NULL THEN 'released' WHEN EXISTS(SELECT 1 FROM rtn_private.key_sets k WHERE k.bank_revision_id=br.id) THEN 'reviewed' ELSE 'unreviewed' END,
  'available_for_training',r.id IS NOT NULL AND rtn_private.entitled(p_organization_id,b.id),'can_manual_check',can_manage AND rtn_private.entitled(p_organization_id,b.id),
  'parent_bank_id',b.parent_bank_id,'active_release',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('release_id',r.id,'source_revision_id',active_br.source_revision_id,'bank_revision_id',active_br.id,'question_count',active_br.question_count,'effective_from',r.effective_from,'approved_on',active_sr.metadata->>'approved_on') END,
  'coverage',jsonb_build_object('kind',CASE WHEN b.parent_bank_id IS NULL THEN 'full_bank' ELSE 'module' END,'question_count',coalesce(active_br.question_count,br.question_count,0),
   'source_question_count',coalesce((SELECT full_br.question_count FROM rtn_private.bank_revisions full_br WHERE full_br.id=coalesce(active_br.parent_bank_revision_id,br.parent_bank_revision_id)),active_br.question_count,br.question_count,0)),
  'normalization_version',coalesce(active_br.normalization_version,br.normalization_version),'normalized_sha256',coalesce(active_br.normalized_sha256,br.normalized_sha256),
  'latest_source_revision_id',latest_sr.id,'pending_source_revision_id',CASE WHEN latest_sr.id IS DISTINCT FROM active_br.source_revision_id
    OR(br.source_revision_id=latest_sr.id AND br.id IS DISTINCT FROM active_br.id)
    OR(b.parent_bank_id IS NOT NULL AND latest_parent.id IS DISTINCT FROM br.parent_bank_revision_id) THEN latest_sr.id END,
  'pending_bank_revision_id',CASE WHEN br.source_revision_id=latest_sr.id AND br.id IS DISTINCT FROM active_br.id THEN br.id END,
  'pending_key_status',CASE WHEN latest_sr.id IS DISTINCT FROM active_br.source_revision_id
    OR(br.source_revision_id=latest_sr.id AND br.id IS DISTINCT FROM active_br.id)
    OR(b.parent_bank_id IS NOT NULL AND latest_parent.id IS DISTINCT FROM br.parent_bank_revision_id) THEN
    CASE WHEN b.parent_bank_id IS NOT NULL AND latest_parent.id IS DISTINCT FROM br.parent_bank_revision_id THEN 'unreviewed'
     WHEN br.source_revision_id IS DISTINCT FROM latest_sr.id THEN 'normalization_required'
     WHEN EXISTS(SELECT 1 FROM rtn_private.key_sets k WHERE k.bank_revision_id=br.id) THEN 'reviewed' ELSE 'unreviewed' END ELSE NULL END,
  'last_checked_at',s.last_checked_at,'last_success_at',s.last_success_at,'check_status',coalesce(open_check.status,s.last_status,'not_checked')) ORDER BY b.code),'[]') INTO v_banks
 FROM rtn_private.banks b JOIN rtn_private.sources s ON s.id=b.source_id
 LEFT JOIN LATERAL(SELECT * FROM rtn_private.source_revisions x WHERE x.source_id=s.id AND x.sha256=s.last_sha256 LIMIT 1)latest_sr ON true
 LEFT JOIN LATERAL(SELECT x.* FROM rtn_private.bank_revisions x JOIN rtn_private.source_revisions xsr ON xsr.id=x.source_revision_id WHERE x.bank_id=b.id
  ORDER BY(x.source_revision_id=latest_sr.id) DESC,xsr.captured_at DESC,x.normalization_version DESC,x.created_at DESC,x.id DESC LIMIT 1)br ON true
 LEFT JOIN LATERAL(SELECT id FROM rtn_private.bank_revisions x WHERE x.bank_id=b.parent_bank_id AND x.source_revision_id=latest_sr.id ORDER BY x.normalization_version DESC LIMIT 1)latest_parent ON true
 LEFT JOIN rtn_private.source_revisions sr ON sr.id=br.source_revision_id
 LEFT JOIN LATERAL(SELECT * FROM rtn_private.releases x WHERE x.bank_id=b.id AND x.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date ORDER BY x.effective_from DESC,x.published_at DESC,x.id DESC LIMIT 1)r ON true
 LEFT JOIN rtn_private.key_sets active_k ON active_k.id=r.key_set_id
 LEFT JOIN rtn_private.bank_revisions active_br ON active_br.id=active_k.bank_revision_id
 LEFT JOIN rtn_private.source_revisions active_sr ON active_sr.id=active_br.source_revision_id
 LEFT JOIN LATERAL(SELECT status FROM rtn_private.check_runs c WHERE c.source_id=s.id AND c.status IN('queued','running') LIMIT 1)open_check ON true
 WHERE s.active;
 SELECT coalesce(jsonb_agg(x.payload ORDER BY x.queued_at DESC),'[]') INTO v_checks FROM(
  SELECT c.queued_at,jsonb_build_object('id',c.id,'run_id',c.id,'source_id',c.source_id,'kind',c.kind,'status',c.status,'queued_at',c.queued_at,'completed_at',c.completed_at,'error',c.error,'http_status',c.http_status,'revision_id',c.revision_id,
   'observations',c.result_metadata->'observations','source_page_url',c.result_metadata->>'source_page_url')payload
  FROM rtn_private.check_runs c WHERE EXISTS(SELECT 1 FROM rtn_private.banks b WHERE b.source_id=c.source_id)
  ORDER BY c.queued_at DESC LIMIT 30)x;
 IF allowed AND(v_settings->>'show_archived_releases')::boolean THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('bank_id',b.id,'bank_code',b.code,'title',k.display_title,'release_id',r.id,'key_set_id',k.id,'bank_revision_id',br.id,'source_revision_id',sr.id,
   'question_count',br.question_count,'effective_from',r.effective_from,'published_at',r.published_at,'is_current',coalesce(r.id=current_release.id,false),
   'state',CASE WHEN r.effective_from>(now() AT TIME ZONE 'Europe/Moscow')::date THEN 'scheduled' WHEN r.id=current_release.id THEN 'current' ELSE 'archived' END,
   'source_url',coalesce(sr.metadata->>'source_page_url',s.page_url),'document_url',sr.document_url) ORDER BY r.effective_from DESC,r.published_at DESC,r.id),'[]') INTO v_archived
  FROM rtn_private.releases r JOIN rtn_private.key_sets k ON k.id=r.key_set_id JOIN rtn_private.bank_revisions br ON br.id=k.bank_revision_id
  JOIN rtn_private.source_revisions sr ON sr.id=br.source_revision_id JOIN rtn_private.banks b ON b.id=r.bank_id JOIN rtn_private.sources s ON s.id=b.source_id
  LEFT JOIN LATERAL(SELECT id FROM rtn_private.releases x WHERE x.bank_id=b.id AND x.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date ORDER BY x.effective_from DESC,x.published_at DESC,x.id DESC LIMIT 1)current_release ON true;
 END IF;
 IF can_students THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'full_name',p.full_name,'group_id',p.student_group_id,
   'group_ids',coalesce((SELECT jsonb_agg(DISTINCT m.group_id ORDER BY m.group_id) FROM public.student_group_memberships_effective m
     WHERE m.organization_id=p_organization_id AND m.user_id=p.user_id AND m.group_id IS NOT NULL),
     CASE WHEN p.student_group_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p.student_group_id) END)) ORDER BY p.full_name,p.id),'[]') INTO v_students
   FROM public.profiles p WHERE p.organization_id=p_organization_id AND p.archived_at IS NULL AND p.blocked_at IS NULL
    AND public.is_student_profile(p.user_id,p_organization_id) AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations d WHERE d.user_id=p.user_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) ORDER BY g.name,g.id),'[]') INTO v_groups FROM public.student_groups g WHERE g.organization_id=p_organization_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'bank_id',a.bank_id,'student_id',a.student_id,'student_name',p.full_name,'group_id',a.group_id,'status',a.status,'assigned_at',a.assigned_at) ORDER BY a.assigned_at DESC),'[]') INTO v_assignments
   FROM rtn_private.assignments a JOIN public.profiles p ON p.id=a.student_id WHERE a.organization_id=p_organization_id;
  SELECT coalesce(jsonb_agg(x.payload ORDER BY x.started_at DESC),'[]') INTO v_results FROM(
   SELECT t.started_at,jsonb_build_object('attempt_id',t.id,'assignment_id',a.id,'bank_id',a.bank_id,'title',t.title_snapshot,'student_id',a.student_id,'student_name',p.full_name,'release_id',t.release_id,'status',t.status,'score',t.score,'correct',t.correct,'total',t.total,'passed',t.passed,'started_at',t.started_at,'submitted_at',t.submitted_at)payload
   FROM rtn_private.attempts t JOIN rtn_private.assignments a ON a.id=t.assignment_id JOIN public.profiles p ON p.id=a.student_id
   WHERE t.organization_id=p_organization_id ORDER BY t.started_at DESC LIMIT 200)x;
 END IF;
 RETURN jsonb_build_object('access',jsonb_build_object('allowed',allowed,'reason',CASE WHEN allowed THEN 'included'
    WHEN EXISTS(SELECT 1 FROM rtn_private.rollout_state WHERE stage='pilot') THEN 'pilot_not_enabled' ELSE 'active_platform_access_required' END,
  'rollout_stage',(SELECT stage FROM rtn_private.rollout_state WHERE id=1),
  'can_manage',can_manage,'can_assign',can_manage AND public.can_access_organization(p_organization_id,'students.write'),'can_view_results',can_students,
  'pilot',EXISTS(SELECT 1 FROM rtn_private.pilot_grants WHERE organization_id=p_organization_id),
  'pilot_kind',CASE WHEN p_organization_id='cdd87239-1b04-47c9-8cd6-7ad57af4c54b'::uuid THEN 'technoservice'
    WHEN EXISTS(SELECT 1 FROM rtn_private.pilot_grants WHERE organization_id=p_organization_id) THEN 'technical_qa' ELSE NULL END),
  'banks',v_banks,'settings',v_settings,'checks',v_checks,'students',v_students,'groups',v_groups,'assignments',v_assignments,'results',v_results,'archived_releases',v_archived);
END;$fn$;
CREATE FUNCTION public.get_rtn_student_workspace() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE items jsonb;BEGIN
 IF NOT rtn_private.actor_allowed() THEN RAISE EXCEPTION 'rtn_student_required' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'assignment_id',a.id,'organization_id',a.organization_id,'bank_id',b.id,'code',b.code,'title',coalesce(current_k.display_title,b.title),'status',a.status,'assigned_at',a.assigned_at,
  'access_allowed',rtn_private.entitled(a.organization_id,b.id),'last_attempt_id',t.id,'last_score',t.score,'last_passed',t.passed,
  'materials_available',EXISTS(SELECT 1 FROM rtn_private.releases r2 JOIN rtn_private.key_sets k2 ON k2.id=r2.key_set_id WHERE r2.bank_id=b.id AND r2.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date AND jsonb_array_length(k2.materials)>0)) ORDER BY a.assigned_at DESC),'[]') INTO items
 FROM rtn_private.assignments a JOIN public.profiles p ON p.id=a.student_id AND p.organization_id=a.organization_id AND p.user_id=auth.uid()
 JOIN rtn_private.banks b ON b.id=a.bank_id
 LEFT JOIN LATERAL(SELECT key_set_id FROM rtn_private.releases r2 WHERE r2.bank_id=b.id AND r2.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date ORDER BY r2.effective_from DESC,r2.published_at DESC,r2.id DESC LIMIT 1)current_r ON true
 LEFT JOIN rtn_private.key_sets current_k ON current_k.id=current_r.key_set_id
 LEFT JOIN LATERAL(SELECT * FROM rtn_private.attempts x WHERE x.assignment_id=a.id ORDER BY x.started_at DESC,x.id DESC LIMIT 1)t ON true
 WHERE a.student_user_id=auth.uid() AND p.archived_at IS NULL AND p.blocked_at IS NULL AND public.is_student_profile(auth.uid(),a.organization_id);
 RETURN jsonb_build_object('assignments',items,'access',jsonb_build_object('allowed',true));
END;$fn$;

-- This restrictive fence is neutral for every existing bucket and keeps a
-- future broad permissive Storage policy from exposing source originals.
-- The trusted service role uses Storage's existing BYPASSRLS path.
CREATE POLICY rtn_source_originals_private_fence ON storage.objects AS RESTRICTIVE
FOR ALL TO anon,authenticated
USING(bucket_id<>'rtn-sources') WITH CHECK(bucket_id<>'rtn-sources');

-- Explicit least-privilege RPC allowlists. Internal helpers remain private.
-- In this provider the public-schema defaults also grant a sandbox execution
-- role. A fixed four-role REVOKE is insufficient; enumerate actual grantees.
-- Do not change the provider's defaults or an existing function's authority.
DO $acl$ DECLARE f record;g record;BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure signature,p.proname,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE NOT EXISTS(SELECT 1 FROM pg_temp.rtn_core_existing_function_oids old WHERE old.oid=p.oid)
   AND(n.nspname='rtn_private' OR(n.nspname='public' AND p.proname=ANY(ARRAY['register_rtn_source','request_rtn_source_check','enqueue_due_rtn_checks','claim_rtn_check','complete_rtn_check','normalize_rtn_revision','review_rtn_keys','publish_rtn_release','get_rtn_editorial_workspace','get_rtn_rollout_state','set_rtn_rollout_stage','save_rtn_settings','assign_rtn_training','get_rtn_assignment','start_rtn_attempt','submit_rtn_attempt','get_rtn_attempt','get_rtn_workspace','get_rtn_student_workspace']))) LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',f.proowner)))a WHERE a.grantee<>f.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',f.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
  IF f.nspname='public' THEN
   IF f.proname=ANY(ARRAY['register_rtn_source','enqueue_due_rtn_checks','claim_rtn_check','complete_rtn_check','normalize_rtn_revision']) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
   ELSE EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
  END IF;
 END LOOP;
END;$acl$;

COMMIT;

BEGIN;
-- Included managed training shares the existing monthly quotas. This migration
-- does not modify monetary collectors, prices, agreements, invoices or roles.
CREATE TEMP TABLE rtn_quota_existing_function_oids ON COMMIT DROP AS SELECT oid FROM pg_proc;
DO $preflight$ DECLARE f record;BEGIN
 IF to_regclass('rtn_private.assignments') IS NULL OR to_regclass('public.organization_monthly_course_usage') IS NULL
 OR to_regclass('public.organization_monthly_student_assignments') IS NULL THEN RAISE EXCEPTION 'rtn_quota_baseline_missing';END IF;
 FOR f IN SELECT * FROM(VALUES
  ('public._organization_monthly_course_limits(uuid)','acf1fc5f690e37684461c1a616fe8445'),
  ('public.enforce_organization_monthly_course_quota()','4316014b31033b92ef72fcfe28ff301e'),
  ('public.get_organization_student_capacity(uuid,integer)','fa823a30119733564445838a1f014ffa'),
  ('public.get_organization_training_capacity(uuid,integer)','a11971397178dc51cdbb5a355f10dc84'),
  ('public.assign_rtn_training(uuid,uuid,uuid[],uuid)','6a27abd99e95a77b90baf2469c22ddaf'),
  ('public.start_rtn_attempt(uuid)','e342394b02cbf5739118496e084573af'),
  ('public.submit_rtn_attempt(uuid,jsonb)','c75593683e5eca9c88e1ec734b4b2fde')
 )x(signature,body_hash) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(f.signature) AND md5(replace(prosrc,E'\r\n',E'\n'))=f.body_hash)
  THEN RAISE EXCEPTION 'rtn_quota_source_changed: %',f.signature;END IF;
 END LOOP;
END;$preflight$;

CREATE TABLE rtn_private.monthly_completions(
 organization_id uuid NOT NULL REFERENCES public.organizations(id),month_start date NOT NULL CHECK(extract(day FROM month_start)=1),
 assignment_id uuid NOT NULL REFERENCES rtn_private.assignments(id),user_id uuid NOT NULL,
 attempt_id uuid NOT NULL REFERENCES rtn_private.attempts(id),first_passed_at timestamptz NOT NULL,
 PRIMARY KEY(organization_id,month_start,assignment_id)
);
CREATE INDEX rtn_monthly_completions_user ON rtn_private.monthly_completions(user_id);
CREATE TABLE rtn_private.monthly_activity_totals(
 organization_id uuid NOT NULL REFERENCES public.organizations(id),month_start date NOT NULL CHECK(extract(day FROM month_start)=1),
 active_learners integer NOT NULL DEFAULT 0 CHECK(active_learners>=0),used_banks integer NOT NULL DEFAULT 0 CHECK(used_banks>=0),
 activity_count integer NOT NULL DEFAULT 0 CHECK(activity_count>=0),PRIMARY KEY(organization_id,month_start)
);
CREATE TABLE rtn_private.monthly_active_learners(
 organization_id uuid NOT NULL REFERENCES public.organizations(id),month_start date NOT NULL CHECK(extract(day FROM month_start)=1),
 user_id uuid NOT NULL,PRIMARY KEY(organization_id,month_start,user_id)
);
CREATE INDEX rtn_monthly_active_learners_user ON rtn_private.monthly_active_learners(user_id);
CREATE TABLE rtn_private.monthly_used_banks(
 organization_id uuid NOT NULL REFERENCES public.organizations(id),month_start date NOT NULL CHECK(extract(day FROM month_start)=1),
 bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),PRIMARY KEY(organization_id,month_start,bank_id)
);
CREATE TABLE rtn_private.activity_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 month_start date NOT NULL CHECK(extract(day FROM month_start)=1),bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),
 assignment_id uuid NOT NULL REFERENCES rtn_private.assignments(id),attempt_id uuid REFERENCES rtn_private.attempts(id),
 release_id uuid NOT NULL REFERENCES rtn_private.releases(id),learner_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('materials_open','attempt_start','attempt_submit','attempt_answer')),occurred_at timestamptz NOT NULL,
 UNIQUE NULLS NOT DISTINCT(organization_id,assignment_id,attempt_id,release_id,kind,month_start)
);
CREATE INDEX rtn_activity_learner ON rtn_private.activity_events(learner_id);
DO $private$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['monthly_completions','monthly_activity_totals','monthly_active_learners','monthly_used_banks','activity_events'] LOOP
  EXECUTE format('ALTER TABLE rtn_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON rtn_private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END;$private$;

CREATE FUNCTION rtn_private.reserve_monthly_assignment(p_org uuid,p_user uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE m date:=date_trunc('month',statement_timestamp() AT TIME ZONE 'Europe/Moscow')::date;l record;n integer;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,42007));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text,42));
 IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_user AND organization_id=p_org AND blocked_at IS NULL AND archived_at IS NULL)
  OR NOT public.is_student_profile(p_user,p_org) THEN RAISE EXCEPTION 'rtn_inactive_assignment_subject' USING ERRCODE='42501';END IF;
 SELECT * INTO l FROM public._organization_monthly_course_limits(p_org);
 INSERT INTO public.organization_monthly_course_usage(organization_id,month_start) VALUES(p_org,m) ON CONFLICT DO NOTHING;
 SELECT assigned_students INTO n FROM public.organization_monthly_course_usage WHERE organization_id=p_org AND month_start=m FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.organization_monthly_student_assignments WHERE organization_id=p_org AND month_start=m AND user_id=p_user) THEN RETURN false;END IF;
 IF l.max_students<>-1 AND n>=l.max_students THEN RAISE EXCEPTION USING ERRCODE='P0001',
  MESSAGE='Достигнут месячный лимит учеников с назначенными курсами. Личные дела можно создавать и хранить без ограничений.',DETAIL='STUDENT_ASSIGNMENT_LIMIT_EXCEEDED';END IF;
 INSERT INTO public.organization_monthly_student_assignments(organization_id,month_start,user_id,first_assigned_at,source)
  VALUES(p_org,m,p_user,statement_timestamp(),'assignment');
 UPDATE public.organization_monthly_course_usage SET assigned_students=assigned_students+1 WHERE organization_id=p_org AND month_start=m;
 RETURN true;
END;$fn$;
CREATE FUNCTION rtn_private.reserve_monthly_completion(p_assignment uuid,p_attempt uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a rtn_private.assignments;m date:=date_trunc('month',statement_timestamp() AT TIME ZONE 'Europe/Moscow')::date;l record;n integer;BEGIN
 SELECT * INTO STRICT a FROM rtn_private.assignments WHERE id=p_assignment;
 PERFORM pg_advisory_xact_lock(hashtextextended(a.student_user_id::text,42007));
 PERFORM pg_advisory_xact_lock(hashtextextended(a.organization_id::text,42));
 SELECT * INTO l FROM public._organization_monthly_course_limits(a.organization_id);
 INSERT INTO public.organization_monthly_course_usage(organization_id,month_start) VALUES(a.organization_id,m) ON CONFLICT DO NOTHING;
 SELECT completed_trainings INTO n FROM public.organization_monthly_course_usage WHERE organization_id=a.organization_id AND month_start=m FOR UPDATE;
 IF EXISTS(SELECT 1 FROM rtn_private.monthly_completions WHERE organization_id=a.organization_id AND month_start=m AND assignment_id=a.id) THEN RETURN false;END IF;
 IF l.max_trainings<>-1 AND n>=l.max_trainings THEN RAISE EXCEPTION USING ERRCODE='P0001',
  MESSAGE='Достигнут месячный лимит завершённых обучений. Обратитесь к администратору организации.',DETAIL='TRAINING_COMPLETION_LIMIT_EXCEEDED';END IF;
 INSERT INTO rtn_private.monthly_completions VALUES(a.organization_id,m,a.id,a.student_user_id,p_attempt,statement_timestamp());
 UPDATE public.organization_monthly_course_usage SET completed_trainings=completed_trainings+1 WHERE organization_id=a.organization_id AND month_start=m;
 RETURN true;
END;$fn$;
CREATE FUNCTION rtn_private.record_activity(p_assignment uuid,p_attempt uuid,p_release uuid,p_kind text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a rtn_private.assignments;m date:=date_trunc('month',statement_timestamp() AT TIME ZONE 'Europe/Moscow')::date;n integer;BEGIN
 a:=rtn_private.assert_learner_assignment(p_assignment);
 PERFORM pg_advisory_xact_lock(hashtextextended(a.student_user_id::text,42007));
 PERFORM pg_advisory_xact_lock(hashtextextended(a.organization_id::text,42));
 a:=rtn_private.assert_learner_assignment(p_assignment);
 IF NOT EXISTS(SELECT 1 FROM rtn_private.releases WHERE id=p_release AND bank_id=a.bank_id)
  OR(p_attempt IS NOT NULL AND NOT EXISTS(SELECT 1 FROM rtn_private.attempts WHERE id=p_attempt AND assignment_id=a.id AND release_id=p_release))
  OR p_kind NOT IN('materials_open','attempt_start','attempt_submit','attempt_answer') OR(p_kind<>'materials_open' AND p_attempt IS NULL)
 THEN RAISE EXCEPTION 'rtn_invalid_activity_subject' USING ERRCODE='22023';END IF;
 INSERT INTO rtn_private.activity_events(organization_id,month_start,bank_id,assignment_id,attempt_id,release_id,learner_id,kind,occurred_at)
  VALUES(a.organization_id,m,a.bank_id,a.id,p_attempt,p_release,a.student_user_id,p_kind,statement_timestamp()) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;IF n=0 THEN RETURN false;END IF;
 INSERT INTO rtn_private.monthly_activity_totals(organization_id,month_start) VALUES(a.organization_id,m) ON CONFLICT DO NOTHING;
 UPDATE rtn_private.monthly_activity_totals SET activity_count=activity_count+1 WHERE organization_id=a.organization_id AND month_start=m;
 INSERT INTO rtn_private.monthly_active_learners VALUES(a.organization_id,m,a.student_user_id) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n>0 THEN UPDATE rtn_private.monthly_activity_totals SET active_learners=active_learners+1 WHERE organization_id=a.organization_id AND month_start=m;END IF;
 INSERT INTO rtn_private.monthly_used_banks VALUES(a.organization_id,m,a.bank_id) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n>0 THEN UPDATE rtn_private.monthly_activity_totals SET used_banks=used_banks+1 WHERE organization_id=a.organization_id AND month_start=m;END IF;
 RETURN true;
END;$fn$;
CREATE FUNCTION public.record_rtn_material_open(p_assignment_id uuid,p_release_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN RETURN jsonb_build_object('recorded',rtn_private.record_activity(p_assignment_id,NULL,p_release_id,'materials_open'),'extra_charge',0);END;$fn$;

-- Owner-only erasure adapter. The next reviewed privacy migration installs the
-- genuine job/context guard. Anonymous counters are deliberately never touched.
CREATE FUNCTION rtn_private.erase_personal_usage(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT coalesce(rtn_private.erasure_allowed(p_user_id),false) THEN RAISE EXCEPTION 'rtn_erasure_context_required' USING ERRCODE='42501';END IF;
 DELETE FROM rtn_private.activity_events WHERE learner_id=p_user_id;
 DELETE FROM rtn_private.monthly_completions WHERE user_id=p_user_id;
 DELETE FROM rtn_private.monthly_active_learners WHERE user_id=p_user_id;
END;$fn$;
CREATE FUNCTION rtn_private.guard_personal_usage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE subject uuid;BEGIN
 IF TG_OP='DELETE' THEN
  subject:=coalesce(to_jsonb(OLD)->>'learner_id',to_jsonb(OLD)->>'user_id')::uuid;
  IF coalesce(rtn_private.erasure_allowed(subject),false) THEN RETURN OLD;END IF;
 END IF;
 RAISE EXCEPTION 'rtn_usage_history_is_immutable' USING ERRCODE='42501';
END;$fn$;
DO $guard$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['activity_events','monthly_completions','monthly_active_learners'] LOOP
  EXECUTE format('CREATE TRIGGER rtn_personal_usage_immutable BEFORE UPDATE OR DELETE ON rtn_private.%I FOR EACH ROW EXECUTE FUNCTION rtn_private.guard_personal_usage()',t);
  EXECUTE format('CREATE TRIGGER rtn_usage_no_truncate BEFORE TRUNCATE ON rtn_private.%I FOR EACH STATEMENT EXECUTE FUNCTION rtn_private.reject_mutation()',t);
 END LOOP;
END;$guard$;

-- Keep every old enrollment trigger/helper OID, ABI, body and ACL unchanged.
-- Only insert narrow hooks into the source-pinned new managed-training RPCs.
DO $rtn_hooks$ DECLARE d text;before_text text;BEGIN
 SELECT pg_get_functiondef('public.assign_rtn_training(uuid,uuid,uuid[],uuid)'::regprocedure) INTO d;
 before_text:=d;d:=replace(d,'DECLARE sid uuid;','DECLARE quota_user uuid;sid uuid;');
 d:=replace(d,' FOR sid IN SELECT DISTINCT unnest(p_student_ids) LOOP',$hook$
 -- Lock the entire sorted subject set before the shared organization lock.
 -- This prevents mixed batch assignments from acquiring subject/org inversions.
 FOR quota_user IN SELECT DISTINCT p2.user_id FROM public.profiles p2 WHERE p2.id=ANY(p_student_ids) AND p2.organization_id=p_organization_id ORDER BY p2.user_id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(quota_user::text,42007));
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,42));
 FOR sid IN SELECT DISTINCT unnest(p_student_ids) LOOP$hook$);
 d:=replace(d,'  items:=items||jsonb_build_array','  PERFORM rtn_private.reserve_monthly_assignment(a.organization_id,a.student_user_id);'||E'\n'||'  items:=items||jsonb_build_array');
 IF d=before_text OR d NOT LIKE '%reserve_monthly_assignment(a.organization_id,a.student_user_id)%' THEN RAISE EXCEPTION 'rtn_assignment_hook_anchor_changed';END IF;EXECUTE d;

 SELECT pg_get_functiondef('public.start_rtn_attempt(uuid)'::regprocedure) INTO d;before_text:=d;
 d:=replace(d,' a:=rtn_private.assert_learner_assignment(p_assignment_id);',$hook$ a:=rtn_private.assert_learner_assignment(p_assignment_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(a.student_user_id::text,42007));
 PERFORM pg_advisory_xact_lock(hashtextextended(a.organization_id::text,42));
 a:=rtn_private.assert_learner_assignment(p_assignment_id);$hook$);
 d:=replace(d,' RETURN jsonb_build_object(''attempt_id'',t.id,',' PERFORM rtn_private.record_activity(a.id,t.id,t.release_id,''attempt_start'');'||E'\n'||' RETURN jsonb_build_object(''attempt_id'',t.id,');
 IF d=before_text OR d NOT LIKE '%record_activity(a.id,t.id,t.release_id,%' THEN RAISE EXCEPTION 'rtn_start_hook_anchor_changed';END IF;EXECUTE d;

 SELECT pg_get_functiondef('public.submit_rtn_attempt(uuid,jsonb)'::regprocedure) INTO d;before_text:=d;
 d:=replace(d,' SELECT * INTO t FROM rtn_private.attempts WHERE id=p_attempt_id FOR UPDATE;',' SELECT * INTO t FROM rtn_private.attempts WHERE id=p_attempt_id;');
 d:=replace(d,' a:=rtn_private.assert_learner_assignment(t.assignment_id);',$hook$ a:=rtn_private.assert_learner_assignment(t.assignment_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(a.student_user_id::text,42007));
 PERFORM pg_advisory_xact_lock(hashtextextended(a.organization_id::text,42));
 SELECT * INTO STRICT t FROM rtn_private.attempts WHERE id=p_attempt_id FOR UPDATE;
 a:=rtn_private.assert_learner_assignment(t.assignment_id);$hook$);
 d:=replace(d,'  UPDATE rtn_private.attempts SET status=''submitted''',$hook$  IF v_correct=t.total THEN PERFORM rtn_private.reserve_monthly_completion(a.id,t.id);END IF;
  UPDATE rtn_private.attempts SET status='submitted'$hook$);
 d:=replace(d,'  UPDATE rtn_private.assignments SET status=''completed'' WHERE id=a.id;','  UPDATE rtn_private.assignments SET status=''completed'' WHERE id=a.id;'||E'\n'||'  PERFORM rtn_private.record_activity(a.id,t.id,t.release_id,''attempt_submit'');');
 IF d=before_text OR d NOT LIKE '%reserve_monthly_completion(a.id,t.id)%' THEN RAISE EXCEPTION 'rtn_submit_hook_anchor_changed';END IF;EXECUTE d;
END;$rtn_hooks$;

DO $new_acl$ DECLARE f record;g record;BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE NOT EXISTS(SELECT 1 FROM pg_temp.rtn_quota_existing_function_oids old WHERE old.oid=p.oid)
   AND(n.nspname='rtn_private' OR p.oid='public.record_rtn_material_open(uuid,uuid)'::regprocedure) LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',f.proowner)))a WHERE a.grantee<>f.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',f.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
 END LOOP;
END;$new_acl$;
GRANT EXECUTE ON FUNCTION public.record_rtn_material_open(uuid,uuid) TO authenticated;
-- This reviewed integration marks quota capability only. Privacy and genuine
-- QA/Tech acceptance are independent gates; wider paid rollout stays OFF.
UPDATE rtn_private.rollout_state SET quota_integration_ready=true WHERE id=1;

COMMIT;

BEGIN;
-- Server-side partial answers for the exact immutable RTN attempt. No key,
-- score, source revision or previous completed result can be changed here.
DO $preflight$ BEGIN
 IF to_regclass('rtn_private.attempts') IS NULL
 OR to_regprocedure('rtn_private.record_activity(uuid,uuid,uuid,text)') IS NULL
 OR to_regprocedure('rtn_private.assert_learner_assignment(uuid)') IS NULL
 THEN RAISE EXCEPTION 'RTN attempts and reviewed activity integration required';END IF;
END;$preflight$;
CREATE TABLE rtn_private.attempt_drafts(
 attempt_id uuid PRIMARY KEY REFERENCES rtn_private.attempts(id) ON DELETE CASCADE,
 answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='object' AND octet_length(answers::text)<=1048576),
 revision bigint NOT NULL CHECK(revision>0),saved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rtn_private.attempt_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rtn_private.attempt_drafts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION rtn_private.valid_partial_answers(p_questions jsonb,p_answers jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE pair record;q jsonb;choice jsonb;seen text[];BEGIN
 IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' OR octet_length(p_answers::text)>1048576 THEN RETURN false;END IF;
 FOR pair IN SELECT * FROM jsonb_each(p_answers) LOOP
  SELECT value INTO q FROM jsonb_array_elements(p_questions) WHERE value->>'id'=pair.key;
  IF q IS NULL OR jsonb_typeof(pair.value) IS DISTINCT FROM 'array' OR jsonb_array_length(pair.value)>30 THEN RETURN false;END IF;
  seen:=ARRAY[]::text[];
  FOR choice IN SELECT value FROM jsonb_array_elements(pair.value) LOOP
   IF jsonb_typeof(choice) IS DISTINCT FROM 'string' OR choice#>>'{}'=ANY(seen)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q->'options')o WHERE o->>'id'=choice#>>'{}') THEN RETURN false;END IF;
   seen:=array_append(seen,choice#>>'{}');
  END LOOP;
 END LOOP;RETURN true;
END;$fn$;
REVOKE ALL ON FUNCTION rtn_private.valid_partial_answers(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_rtn_attempt_draft(p_attempt_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t rtn_private.attempts;d rtn_private.attempt_drafts;BEGIN
 SELECT * INTO t FROM rtn_private.attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_attempt_not_found' USING ERRCODE='P0002';END IF;
 PERFORM rtn_private.assert_learner_assignment(t.assignment_id);
 SELECT * INTO d FROM rtn_private.attempt_drafts WHERE attempt_id=t.id;
 RETURN jsonb_build_object('attempt_id',t.id,'status',t.status,'revision',coalesce(d.revision,0),
  'answers',CASE WHEN t.status='submitted' THEN t.answers ELSE coalesce(d.answers,'{}') END,'saved_at',d.saved_at);
END;$fn$;

CREATE FUNCTION public.save_rtn_attempt_draft(p_attempt_id uuid,p_answers jsonb,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t rtn_private.attempts;d rtn_private.attempt_drafts;BEGIN
 IF p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'rtn_invalid_draft_revision' USING ERRCODE='22023';END IF;
 SELECT * INTO t FROM rtn_private.attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_attempt_not_found' USING ERRCODE='P0002';END IF;
 PERFORM rtn_private.assert_learner_assignment(t.assignment_id);
 -- Same subject -> organization -> attempt order as quota and privacy erasure.
 PERFORM pg_advisory_xact_lock(hashtextextended(t.student_user_id::text,42007));
 PERFORM pg_advisory_xact_lock(hashtextextended(t.organization_id::text,42));
 PERFORM rtn_private.assert_learner_assignment(t.assignment_id);
 SELECT * INTO STRICT t FROM rtn_private.attempts WHERE id=p_attempt_id FOR UPDATE;
 SELECT * INTO d FROM rtn_private.attempt_drafts WHERE attempt_id=t.id;
 IF t.status='submitted' THEN
  RETURN jsonb_build_object('attempt_id',t.id,'status',t.status,'revision',coalesce(d.revision,0),'answers',t.answers,'saved_at',t.submitted_at,'replayed',true);
 END IF;
 IF NOT rtn_private.valid_partial_answers(t.question_snapshot,p_answers) THEN RAISE EXCEPTION 'rtn_invalid_partial_answers' USING ERRCODE='22023';END IF;
 -- Exact retry is a no-op even if the response to the previous save was lost.
 IF coalesce(d.answers,'{}')=p_answers THEN
  RETURN jsonb_build_object('attempt_id',t.id,'status',t.status,'revision',coalesce(d.revision,0),'answers',p_answers,'saved_at',d.saved_at,'replayed',true);
 END IF;
 IF p_expected_revision<>coalesce(d.revision,0) THEN RAISE EXCEPTION 'rtn_draft_revision_conflict' USING ERRCODE='40001';END IF;
 INSERT INTO rtn_private.attempt_drafts(attempt_id,answers,revision,saved_at) VALUES(t.id,p_answers,coalesce(d.revision,0)+1,now())
 ON CONFLICT(attempt_id) DO UPDATE SET answers=excluded.answers,revision=excluded.revision,saved_at=excluded.saved_at RETURNING * INTO d;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_answers)e WHERE jsonb_array_length(e.value)>0) THEN
  PERFORM rtn_private.record_activity(t.assignment_id,t.id,t.release_id,'attempt_answer');
 END IF;
 RETURN jsonb_build_object('attempt_id',t.id,'status',t.status,'revision',d.revision,'answers',d.answers,'saved_at',d.saved_at,'replayed',false);
END;$fn$;
DO $acl$ DECLARE f record;g record;BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure signature FROM pg_proc p
 WHERE p.oid IN('public.get_rtn_attempt_draft(uuid)'::regprocedure,'public.save_rtn_attempt_draft(uuid,jsonb,bigint)'::regprocedure) LOOP
  FOR g IN SELECT DISTINCT grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',f.proowner))) WHERE grantee<>f.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',f.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
 END LOOP;
END;$acl$;
GRANT EXECUTE ON FUNCTION public.get_rtn_attempt_draft(uuid),public.save_rtn_attempt_draft(uuid,jsonb,bigint) TO authenticated;

COMMIT;

CREATE TABLE IF NOT EXISTS public.achievements(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.admin_generated_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.admin_generated_documents ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.admin_generated_documents ADD COLUMN IF NOT EXISTS sent_to_organization_id uuid;
CREATE TABLE IF NOT EXISTS public.admin_org_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.admin_org_messages ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.admin_org_messages ADD COLUMN IF NOT EXISTS sender_user_id uuid;
CREATE TABLE IF NOT EXISTS public.admin_staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.admin_staff ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.ai_avatar_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.ai_avatar_templates ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.ai_avatar_templates ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.ai_prompt_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.ai_prompt_templates ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.ai_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS updated_by uuid;
CREATE TABLE IF NOT EXISTS public.ai_tutor_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.ai_tutor_sessions ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.ai_usage_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.ai_usage_log ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.app_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS updated_by uuid;
CREATE TABLE IF NOT EXISTS public.audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.balance_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.balance_transactions ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.balance_transactions ADD COLUMN IF NOT EXISTS performed_by uuid;
CREATE TABLE IF NOT EXISTS public.call_log_listens(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.call_log_listens ADD COLUMN IF NOT EXISTS listener_user_id uuid;
CREATE TABLE IF NOT EXISTS public.call_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS manager_user_id uuid;
CREATE TABLE IF NOT EXISTS public.chat_group_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.chat_group_members ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.chat_group_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.chat_group_messages ADD COLUMN IF NOT EXISTS sender_user_id uuid;
CREATE TABLE IF NOT EXISTS public.chat_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.chat_groups ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.chat_groups ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.chat_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.chat_notification_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.chat_notification_settings ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.checko_search_presets(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.checko_search_presets ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.checko_search_presets ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.checko_search_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.checko_search_runs ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TABLE IF NOT EXISTS public.client_error_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.client_error_logs ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.commercial_proposals(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.commercial_proposals ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.commercial_proposals ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.commercial_proposals ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.companies(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.company_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.company_documents ADD COLUMN IF NOT EXISTS uploaded_by uuid;
CREATE TABLE IF NOT EXISTS public.company_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.company_requests ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.company_staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.company_staff ADD COLUMN IF NOT EXISTS invited_by uuid;
ALTER TABLE public.company_staff ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.consent_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.consent_documents ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.consent_documents ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.consent_documents ADD COLUMN IF NOT EXISTS student_user_id uuid;
CREATE TABLE IF NOT EXISTS public.course_access_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.course_access_log ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.course_landing_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.course_landing_history ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.course_landing_history ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.course_manual_credits(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.course_manual_credits ADD COLUMN IF NOT EXISTS credited_by uuid;
ALTER TABLE public.course_manual_credits ADD COLUMN IF NOT EXISTS revoked_by uuid;
CREATE TABLE IF NOT EXISTS public.course_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.course_payments ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.course_payments ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.course_reminders(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.course_reminders ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.course_reminders ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.course_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.course_requests ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.course_requests ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.course_review_grants(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.course_review_grants ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.course_review_grants ADD COLUMN IF NOT EXISTS revoked_by uuid;
ALTER TABLE public.course_review_grants ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.course_review_grants ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.course_snapshots(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.course_snapshots ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.course_snapshots ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.courses(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.data_subject_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.data_subject_requests ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.data_subject_requests ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.data_subject_requests ADD COLUMN IF NOT EXISTS resolved_by uuid;
ALTER TABLE public.data_subject_requests ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.document_issuance_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.document_issuance_log ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.document_issuance_log ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.document_issuance_log ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.document_number_sequences(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.document_number_sequences ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.document_signatures(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.document_signatures ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.document_signatures ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.document_signatures ADD COLUMN IF NOT EXISTS recipient_user_id uuid;
ALTER TABLE public.document_signatures ADD COLUMN IF NOT EXISTS sender_user_id uuid;
CREATE TABLE IF NOT EXISTS public.draft(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.draft ADD COLUMN IF NOT EXISTS cancelled uuid;
CREATE TABLE IF NOT EXISTS public.driving_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_audit ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.driving_audit ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_cars(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_cars ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_courses(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_courses ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_entries ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.driving_entries ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_entry_reversals(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_entry_reversals ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.driving_entry_reversals ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_groups ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_instructors(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_instructors ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.driving_instructors ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_invites ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.driving_invites ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_lessons(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_lessons ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.driving_lessons ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_memberships ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.driving_memberships ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_operations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_operations ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_programs(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_programs ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_schools(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_schools ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.driving_schools ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_shifts(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_shifts ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.driving_students(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.driving_students ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.driving_students ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.education_document_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.education_document_records ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.education_document_records ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.education_document_records ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.email_action_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.email_action_tokens ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.email_campaign_consent_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.email_campaign_consent_log ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.email_campaigns(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.email_drip_sequences(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.email_drip_sequences ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TABLE IF NOT EXISTS public.email_drip_subscribers(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.email_drip_subscribers ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.email_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TABLE IF NOT EXISTS public.enrollment_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.enrollment_history ADD COLUMN IF NOT EXISTS performed_by uuid;
ALTER TABLE public.enrollment_history ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.enrollment_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.enrollment_requests ADD COLUMN IF NOT EXISTS resolved_by uuid;
ALTER TABLE public.enrollment_requests ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.exolve_sip_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.exolve_sip_accounts ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.exolve_sip_accounts ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.final_test_photo_challenges(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.final_test_photo_challenges ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.frdo_signed_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.frdo_signed_documents ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.goreltech_document_operations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.goreltech_document_operations ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.goreltech_document_operations ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.goreltech_enrollment_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.goreltech_enrollment_orders ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.goreltech_enrollment_orders ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.group_class_journal_marks(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.group_class_journal_marks ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.group_class_journal_marks ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.group_class_journal_marks ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.group_completion_decision_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.group_completion_decision_history ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.group_completion_decision_history ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.group_completion_decisions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.group_completion_decisions ADD COLUMN IF NOT EXISTS confirmed_by uuid;
ALTER TABLE public.group_completion_decisions ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.group_completion_decisions ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.group_document_schedules(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.group_document_schedules ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.group_document_schedules ADD COLUMN IF NOT EXISTS updated_by uuid;
CREATE TABLE IF NOT EXISTS public.group_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.group_documents ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.group_documents ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.group_documents ADD COLUMN IF NOT EXISTS student_user_id uuid;
CREATE TABLE IF NOT EXISTS public.homework_submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.homework_submissions ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.homework_submissions ADD COLUMN IF NOT EXISTS reviewer_id uuid;
ALTER TABLE public.homework_submissions ADD COLUMN IF NOT EXISTS student_id uuid;
CREATE TABLE IF NOT EXISTS public.incoming_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.incoming_documents ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.incoming_documents ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.journal_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.journal_instances(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.journal_instances ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.kinescope_usage_cache(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.kinescope_usage_cache ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.knowledge_bank(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.knowledge_bank ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.labor_safety_enrollment_protocols(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.labor_safety_enrollment_protocols ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.labor_safety_enrollment_protocols ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.labor_safety_enrollment_protocols ADD COLUMN IF NOT EXISTS source_user_id uuid;
ALTER TABLE public.labor_safety_enrollment_protocols ADD COLUMN IF NOT EXISTS updated_by uuid;
CREATE TABLE IF NOT EXISTS public.labor_safety_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.labor_safety_groups ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.labor_safety_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.labor_safety_profiles ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.labor_safety_profiles ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.landing_content(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.landing_content ADD COLUMN IF NOT EXISTS updated_by uuid;
CREATE TABLE IF NOT EXISTS public.lesson_progress(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.lesson_progress ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.lessons(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.library_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.library_documents ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.library_documents ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.library_folders(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.library_folders ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.mailing_campaign_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.mailing_campaign_ledger ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.mailing_campaign_replies(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.mailing_campaign_replies ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.mailing_contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.mailing_contacts ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.mailing_deliverability_checks(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.mailing_deliverability_checks ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.mailing_deliverability_seeds(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.mailing_deliverability_seeds ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.mailing_deliverability_seeds ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.mailing_report_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.mailing_report_links ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.mailing_report_links ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.mailing_seed_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.mailing_seed_ledger ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.mailing_senders(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.mailing_senders ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.mailing_senders ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.marketplace_course_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.marketplace_course_comments ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.marketplace_courses(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.marketplace_courses ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.marketplace_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS buyer_organization_id uuid;
ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS buyer_user_id uuid;
CREATE TABLE IF NOT EXISTS public.marketplace_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.marketplace_settings ADD COLUMN IF NOT EXISTS updated_by uuid;
CREATE TABLE IF NOT EXISTS public.module_access_overrides(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.module_access_overrides ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.notification_preferences(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.ordinary_mail_report_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.ordinary_mail_report_events ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_billing_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_billing_documents ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.org_billing_documents ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_contract_template_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_contract_template_versions ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.org_contract_template_versions ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_contract_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_contract_templates ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_contracts(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_contracts ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.org_contracts ADD COLUMN IF NOT EXISTS student_user_id uuid;
CREATE TABLE IF NOT EXISTS public.org_crm_activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_crm_activities ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_crm_clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_crm_clients ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.org_crm_clients ADD COLUMN IF NOT EXISTS student_user_id uuid;
CREATE TABLE IF NOT EXISTS public.org_crm_deals(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_crm_deals ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_crm_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_crm_tasks ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_custom_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_custom_roles ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.org_custom_roles ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_document_share_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_document_share_links ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.org_document_share_links ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_document_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_document_versions ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_documents ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.org_documents ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_general_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_general_messages ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.org_general_messages ADD COLUMN IF NOT EXISTS sender_user_id uuid;
CREATE TABLE IF NOT EXISTS public.org_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_notifications ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.org_payers(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_payers ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_services(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_services ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_signatories(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_signatories ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.org_signatories ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_smtp_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_smtp_settings ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.org_staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_staff ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.org_staff ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.org_student_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.org_student_messages ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.org_student_messages ADD COLUMN IF NOT EXISTS sender_user_id uuid;
ALTER TABLE public.org_student_messages ADD COLUMN IF NOT EXISTS student_user_id uuid;
CREATE TABLE IF NOT EXISTS public.organization_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.organization_comments ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.organization_comments ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.organization_monthly_student_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.organization_monthly_student_assignments ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.organization_monthly_training_completions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.organization_monthly_training_completions ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.organization_offer_acceptances(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.organization_offer_acceptances ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.organization_payment_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.organization_payment_settings ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.organization_reminders(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.organization_reminders ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.organization_reminders ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.partner_applications(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.partner_applications ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.pending_enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.pending_enrollments ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.pending_enrollments ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.pep_agreements(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.pep_agreements ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.pipeline_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.pipeline_runs ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.platform_announcements(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.platform_announcements ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TABLE IF NOT EXISTS public.platform_invoice_acts(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.platform_invoice_acts ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.platform_invoice_acts ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.platform_updates(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.platform_updates ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TABLE IF NOT EXISTS public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.program_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.program_categories ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.program_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.program_documents ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.program_folders(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.program_folders ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.program_training_plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.program_training_plans ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.proposal_presets(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.proposal_presets ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.proposal_presets ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.referral_attribution_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.referral_attribution_log ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.referral_attribution_log ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.referral_commissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.referral_commissions ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.referral_partners(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.referral_partners ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.referral_registrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.referral_registrations ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.registration_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.registration_attempts ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.registration_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.registration_links ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.role_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.role_audit_log ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.role_audit_log ADD COLUMN IF NOT EXISTS performed_by uuid;
ALTER TABLE public.role_audit_log ADD COLUMN IF NOT EXISTS target_user_id uuid;
CREATE TABLE IF NOT EXISTS public.sales_blacklist(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.sales_blacklist ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.sales_companies_db(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.sales_companies_db ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.sales_contracts(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.sales_contracts ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.sales_demo_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.sales_demo_links ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.sales_demo_links ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.sales_demo_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.sales_demo_sessions ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.sales_demo_sessions ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.sales_lead_activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.sales_lead_activities ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.sales_leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.sales_leads ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.sales_managers(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.sales_managers ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.sales_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.sales_tasks ADD COLUMN IF NOT EXISTS assigned_user_id uuid;
ALTER TABLE public.sales_tasks ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.sales_tasks ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.service_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.signature_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.signature_comments ADD COLUMN IF NOT EXISTS author_user_id uuid;
ALTER TABLE public.signature_comments ADD COLUMN IF NOT EXISTS resolved_by uuid;
CREATE TABLE IF NOT EXISTS public.signature_revisions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.signature_revisions ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TABLE IF NOT EXISTS public.skillspace_import_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.skillspace_import_jobs ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.skillspace_import_jobs ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.staff_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS accepted_user_id uuid;
ALTER TABLE public.staff_invitations ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.student_consents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.student_consents ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.student_deletion_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.student_deletion_log ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.student_deletion_log ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.student_deletion_log ADD COLUMN IF NOT EXISTS student_id uuid;
CREATE TABLE IF NOT EXISTS public.student_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.student_frdo_data(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.student_frdo_data ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.student_group_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.student_group_memberships ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.student_group_memberships ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.student_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.student_groups ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.student_identity_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.student_identity_documents ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.student_login_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.student_login_history ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.student_login_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.student_login_tokens ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.student_login_tokens ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.student_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.student_notifications ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.student_roster_removals(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.student_roster_removals ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.student_roster_removals ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.subject_erase(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.subject_erase ADD COLUMN IF NOT EXISTS reviewer_erase uuid;
CREATE TABLE IF NOT EXISTS public.subscription_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.subscription_invoices ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.support_conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.support_conversations ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.support_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS sender_user_id uuid;
CREATE TABLE IF NOT EXISTS public.support_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.support_requests ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.system_diagnostics(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.system_diagnostics ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE TABLE IF NOT EXISTS public.test_attempt_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.test_attempt_sessions ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.test_attempt_start_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.test_attempt_start_requests ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.test_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.testimonials(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.testimonials ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.testimonials ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.training_plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.training_plans ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.training_plans ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.training_plans ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_admission_case_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_admission_case_events ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.uc_admission_case_events ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_admission_case_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_admission_case_evidence ADD COLUMN IF NOT EXISTS captured_by uuid;
ALTER TABLE public.uc_admission_case_evidence ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_admission_case_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_admission_case_requests ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.uc_admission_case_requests ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_admission_cases(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_admission_cases ADD COLUMN IF NOT EXISTS responsible_id uuid;
ALTER TABLE public.uc_admission_cases ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_admission_evidence_reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_admission_evidence_reservations ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.uc_admission_evidence_reservations ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_admission_rule_sets(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_admission_rule_sets ADD COLUMN IF NOT EXISTS reviewer_id uuid;
ALTER TABLE public.uc_admission_rule_sets ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_course_assignment_removal_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_custom_journal_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_custom_journal_history ADD COLUMN IF NOT EXISTS recorded_by uuid;
ALTER TABLE public.uc_custom_journal_history ADD COLUMN IF NOT EXISTS subject_user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_custom_journal_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_custom_journal_records ADD COLUMN IF NOT EXISTS recorded_by uuid;
ALTER TABLE public.uc_custom_journal_records ADD COLUMN IF NOT EXISTS subject_user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_custom_journal_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_custom_journal_requests ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.uc_custom_journal_requests ADD COLUMN IF NOT EXISTS subject_user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_custom_journal_schemas(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_custom_journal_schemas ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TABLE IF NOT EXISTS public.uc_custom_journals(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_custom_journals ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.uc_custom_journals ADD COLUMN IF NOT EXISTS updated_by uuid;
CREATE TABLE IF NOT EXISTS public.uc_group_education_states(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.uc_identification_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_identification_events ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.uc_identification_events ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_identification_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_identification_records ADD COLUMN IF NOT EXISTS decided_by uuid;
ALTER TABLE public.uc_identification_records ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_identification_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_identification_requests ADD COLUMN IF NOT EXISTS actor_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_identification_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_identification_sources ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_identification_write_contexts(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_identification_write_contexts ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_scoped_journal_contexts(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_scoped_journal_contexts ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TABLE IF NOT EXISTS public.uc_scoped_journal_exports(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_scoped_journal_exports ADD COLUMN IF NOT EXISTS recorded_by uuid;
CREATE TABLE IF NOT EXISTS public.uc_scoped_journal_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_scoped_journal_history ADD COLUMN IF NOT EXISTS recorded_by uuid;
ALTER TABLE public.uc_scoped_journal_history ADD COLUMN IF NOT EXISTS subject_user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_scoped_journal_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_scoped_journal_records ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.uc_scoped_journal_records ADD COLUMN IF NOT EXISTS recorded_by uuid;
ALTER TABLE public.uc_scoped_journal_records ADD COLUMN IF NOT EXISTS subject_user_id uuid;
CREATE TABLE IF NOT EXISTS public.uc_scoped_journal_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.uc_scoped_journal_requests ADD COLUMN IF NOT EXISTS actor_id uuid;
CREATE TABLE IF NOT EXISTS public.user_achievements(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.user_achievements ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.video_identifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.video_identifications ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.video_identifications ADD COLUMN IF NOT EXISTS verified_by uuid;
CREATE TABLE IF NOT EXISTS public.webinar_participants(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.webinar_participants ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE TABLE IF NOT EXISTS public.webinar_polls(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.webinar_polls ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE TABLE IF NOT EXISTS public.webinars(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.webinars ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.webinars ADD COLUMN IF NOT EXISTS host_user_id uuid;
ALTER TABLE public.webinars ADD COLUMN IF NOT EXISTS organization_id uuid;
-- ISOLATED LAB ONLY: empty shape adapters for unrelated legacy erasure domains.
-- The actual captured erase/snapshot/count function bodies remain unchanged.
-- No production account, credential, storage file or erasure request is used.
CREATE TABLE public.account_deletion_jobs(id uuid PRIMARY KEY,user_id uuid NOT NULL,receipt_hash text NOT NULL,state text NOT NULL,consent_version text,files jsonb NOT NULL DEFAULT '[]',snapshot jsonb NOT NULL DEFAULT '{}',data_erased boolean NOT NULL DEFAULT false);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS owner uuid,ADD COLUMN IF NOT EXISTS owner_id text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0;
ALTER TABLE public.test_attempts ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.organization_offer_acceptances ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id text,ADD COLUMN IF NOT EXISTS entity_type text,ADD COLUMN IF NOT EXISTS user_name text,ADD COLUMN IF NOT EXISTS ip_address text,ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.role_audit_log ADD COLUMN IF NOT EXISTS performed_by_name text,ADD COLUMN IF NOT EXISTS details jsonb;
ALTER TABLE public.student_deletion_log ADD COLUMN IF NOT EXISTS deleted_by_name text,ADD COLUMN IF NOT EXISTS deleted_by_email text;
ALTER TABLE public.support_messages ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.document_signatures ADD COLUMN IF NOT EXISTS signed_at timestamptz,ADD COLUMN IF NOT EXISTS sender_signed_at timestamptz,ADD COLUMN IF NOT EXISTS status text,ADD COLUMN IF NOT EXISTS pep_agreement_id uuid;
ALTER TABLE public.org_contracts ADD COLUMN IF NOT EXISTS approved_at timestamptz,ADD COLUMN IF NOT EXISTS signed_at timestamptz,ADD COLUMN IF NOT EXISTS status text,ADD COLUMN IF NOT EXISTS students jsonb;
ALTER TABLE public.group_documents ADD COLUMN IF NOT EXISTS variables jsonb,ADD COLUMN IF NOT EXISTS variables_snapshot jsonb,ADD COLUMN IF NOT EXISTS file_path text,ADD COLUMN IF NOT EXISTS doc_status text;
ALTER TABLE public.education_document_records ADD COLUMN IF NOT EXISTS enrollment_id uuid;
ALTER TABLE public.student_documents ADD COLUMN IF NOT EXISTS enrollment_id uuid;
ALTER TABLE public.homework_submissions ADD COLUMN IF NOT EXISTS course_id uuid;
ALTER TABLE public.lesson_progress ADD COLUMN IF NOT EXISTS lesson_id uuid;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS course_id uuid;
ALTER TABLE public.uc_admission_cases ADD COLUMN IF NOT EXISTS reviews jsonb,ADD COLUMN IF NOT EXISTS decision jsonb,ADD COLUMN IF NOT EXISTS tasks jsonb;
ALTER TABLE public.uc_admission_cases ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.uc_group_education_states ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.uc_identification_write_contexts ADD COLUMN IF NOT EXISTS backend_pid integer,ADD COLUMN IF NOT EXISTS transaction_id bigint,ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.uc_scoped_journal_records ADD COLUMN IF NOT EXISTS participant_ids uuid[];
ALTER TABLE public.uc_scoped_journal_history ADD COLUMN IF NOT EXISTS participant_ids uuid[];
ALTER TABLE public.uc_scoped_journal_requests ADD COLUMN IF NOT EXISTS participant_ids uuid[];
ALTER TABLE public.uc_scoped_journal_exports ADD COLUMN IF NOT EXISTS participant_ids uuid[];
CREATE FUNCTION public.is_org_owner(p_user uuid,p_org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.user_id WHERE p.user_id=p_user AND p.organization_id=p_org AND r.role='organization')$$;
-- These old-domain adapters are intentionally empty. This suite proves the RTN
-- integration/order/ACLs, not correctness of pre-existing UC erasure domains.
CREATE FUNCTION public.uc_self_examination_retained(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
CREATE FUNCTION public.uc_self_examination_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{}'::jsonb$$;
CREATE FUNCTION public.uc_education_saved_output_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{"unissued":0,"issued":0}'::jsonb$$;

CREATE FUNCTION public.account_deletion_files(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_archive_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_copy_registry_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_custom_journal_erase_user(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;
CREATE FUNCTION public.uc_document_registry_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_education_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_erase_admission_cases(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;
CREATE FUNCTION public.uc_erase_group_education_facts(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;
CREATE FUNCTION public.uc_erase_identification_data(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;
CREATE FUNCTION public.uc_frdo_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_group_education_deletion_preview(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_group_education_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_learning_erase_user(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;
CREATE FUNCTION public.uc_learning_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_ng_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_publication_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_session_erase_user(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;
CREATE FUNCTION public.uc_session_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_signature_assurance_file_proof_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
CREATE FUNCTION public.uc_signature_assurance_personal_counts(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM sandbox_exec_atxwvjxbqjgkbjlhsdch;
-- SELECT-only production source capture 2026-11-14; installed ONLY in the disposable native fixture.
-- No customer rows, credentials, production JWTs or erasure invocation are included.

-- account_deletion_erase_data(uuid,text); body_md5=a13f74f6687fff498ac1628830458560; definition_md5=a496bbcd2154d994c9e83888313a84a3
CREATE OR REPLACE FUNCTION public.account_deletion_erase_data(p_request_id uuid, p_receipt_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE j public.account_deletion_jobs%ROWTYPE; u uuid; r record; v_org uuid; current_snapshot jsonb;
BEGIN
 SELECT * INTO j FROM public.account_deletion_jobs WHERE id=p_request_id AND receipt_hash=p_receipt_hash FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','INVALID_RECEIPT'); END IF;
 IF j.consent_version IS DISTINCT FROM 'full-personal-data-v1' THEN RETURN jsonb_build_object('code','CONSENT_REQUIRED'); END IF;
 IF j.state='deleted' THEN RETURN jsonb_build_object('erased',true); END IF;
 IF j.state<>'cleanup_pending' THEN RETURN jsonb_build_object('code','NOT_CONFIRMED'); END IF;
 u:=j.user_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,42007));
 IF jsonb_array_length(public.account_deletion_files(u))>0 OR EXISTS(SELECT 1 FROM storage.objects o JOIN jsonb_array_elements(j.files) f ON f->>'bucket'=o.bucket_id AND f->>'path'=o.name) THEN RETURN jsonb_build_object('code','DELETION_UNAVAILABLE'); END IF;
 current_snapshot:=public.account_deletion_snapshot(u);
 IF jsonb_array_length(current_snapshot->'blockers')>0 THEN RETURN jsonb_build_object('code','PLAN_CHANGED'); END IF;
 -- Delete the enrollment before lesson progress: the live progress trigger
 -- then has no enrollment to reset. CSZ/issued/shared cases failed in preview.
 PERFORM set_config('sintagma.account_deletion_erase_user',u::text,true);
 PERFORM public.uc_erase_group_education_facts(u);
 PERFORM public.uc_erase_admission_cases(u);
 PERFORM public.uc_erase_identification_data(u);
 DELETE FROM public.audit_logs WHERE entity_id=u::text OR (entity_type='enrollment' AND entity_id IN(SELECT id::text FROM public.enrollments WHERE user_id=u));
 UPDATE public.audit_logs SET user_id='00000000-0000-0000-0000-000000000000',user_name=NULL,ip_address=NULL,user_agent=NULL WHERE user_id=u;
 UPDATE public.role_audit_log SET performed_by=NULL,performed_by_name=NULL,details=CASE WHEN details->>'from_user_id'=u::text THEN details-'from_user_id' ELSE details END WHERE performed_by=u AND target_user_id IS DISTINCT FROM u;
 UPDATE public.student_deletion_log SET deleted_by=NULL,deleted_by_name=NULL,deleted_by_email=NULL WHERE deleted_by=u AND student_id IS DISTINCT FROM u;
 DELETE FROM public.final_test_photo_challenges WHERE user_id=u;
 DELETE FROM public.test_attempts WHERE user_id=u;
 DELETE FROM public.test_attempt_start_requests WHERE user_id=u;
 DELETE FROM public.test_attempt_sessions WHERE user_id=u;
 DELETE FROM public.homework_submissions WHERE student_id=u;
 DELETE FROM public.journal_entries WHERE user_id=u;
 DELETE FROM public.group_class_journal_marks WHERE user_id=u;
 DELETE FROM public.training_plans WHERE user_id=u;
 DELETE FROM public.student_group_memberships WHERE user_id=u;
 DELETE FROM public.student_roster_removals WHERE user_id=u;
 DELETE FROM public.enrollments WHERE user_id=u;
 DELETE FROM public.lesson_progress WHERE user_id=u;
 -- on_enrollment_delete inserts an event; remove it after that trigger.
 DELETE FROM public.enrollment_history WHERE user_id=u;
 DELETE FROM public.organization_monthly_student_assignments WHERE user_id=u;
 DELETE FROM public.organization_monthly_training_completions WHERE user_id=u;
 DELETE FROM public.student_deletion_log WHERE student_id=u;
 DELETE FROM public.support_messages WHERE conversation_id IN (SELECT id FROM public.support_conversations WHERE user_id=u) OR sender_user_id=u;
 DELETE FROM public.support_conversations WHERE user_id=u;
 DELETE FROM public.document_signatures WHERE (sender_user_id=u OR recipient_user_id=u) AND signed_at IS NULL AND sender_signed_at IS NULL AND status<>'signed';
 DELETE FROM public.consent_documents WHERE student_user_id=u;
 DELETE FROM public.org_contracts WHERE student_user_id=u AND approved_at IS NULL AND signed_at IS NULL AND status IN ('draft','cancelled');
 FOR r IN SELECT * FROM (VALUES
  ('admin_org_messages','sender_user_id'),
  ('admin_staff','user_id'),
  ('ai_prompt_templates','user_id'),
  ('ai_tutor_sessions','user_id'),
  ('ai_usage_log','user_id'),
  ('call_log_listens','listener_user_id'),
  ('chat_group_members','user_id'),
  ('chat_group_messages','sender_user_id'),
  ('chat_messages','user_id'),
  ('chat_notification_settings','user_id'),
  ('client_error_logs','user_id'),
  ('company_staff','user_id'),
  ('course_access_log','user_id'),
  ('course_reminders','user_id'),
  ('course_requests','user_id'),
  ('course_review_grants','user_id'),
  ('data_subject_requests','user_id'),
  ('exolve_sip_accounts','user_id'),
  ('final_test_photo_challenges','user_id'),
  ('module_access_overrides','user_id'),
  ('notification_preferences','user_id'),
  ('org_general_messages','sender_user_id'),
  ('org_notifications','user_id'),
  ('org_staff','user_id'),
  ('org_student_messages','sender_user_id'),
  ('org_student_messages','student_user_id'),
  ('organization_offer_acceptances','user_id'),
  ('partner_applications','user_id'),
  ('pending_enrollments','user_id'),
  ('pep_agreements','user_id'),
  ('pipeline_runs','user_id'),
  ('registration_attempts','user_id'),
  ('student_consents','user_id'),
  ('student_frdo_data','user_id'),
  ('student_identity_documents','user_id'),
  ('student_login_history','user_id'),
  ('student_login_tokens','user_id'),
  ('student_notifications','user_id'),
  ('support_requests','user_id'),
  ('testimonials','user_id'),
  ('user_achievements','user_id'),
  ('video_identifications','user_id'),
  ('webinar_participants','user_id')
 ) x(t,c) LOOP
  EXECUTE format('DELETE FROM public.%I WHERE %I=$1',r.t,r.c) USING u;
 END LOOP;
 -- Nullable author references are attribution, not ownership of client data.
 FOR r IN SELECT * FROM (VALUES
  ('admin_generated_documents','created_by'),
  ('ai_settings','updated_by'),
  ('app_settings','updated_by'),
  ('company_documents','uploaded_by'),
  ('consent_documents','created_by'),
  ('course_review_grants','revoked_by'),
  ('enrollment_history','performed_by'),
  ('exolve_sip_accounts','created_by'),
  ('landing_content','updated_by'),
  ('marketplace_settings','updated_by'),
  ('organization_comments','created_by'),
  ('organization_reminders','created_by'),
  ('platform_announcements','created_by'),
  ('sales_tasks','assigned_user_id'),
  ('skillspace_import_jobs','created_by'),
  ('staff_invitations','accepted_user_id'),
  ('student_login_tokens','created_by'),
  ('video_identifications','verified_by')
 ) x(t,c) LOOP
  EXECUTE format('UPDATE public.%I SET %I=NULL WHERE %I=$1',r.t,r.c,r.c) USING u;
 END LOOP;
 DELETE FROM public.user_roles WHERE user_id=u;
 DELETE FROM public.profiles WHERE user_id=u;
 -- org_staff DELETE creates a role-audit event: clear it after all staff/profile
 -- triggers; never leave the target UUID hidden in its own account history.
 DELETE FROM public.role_audit_log WHERE target_user_id=u;
 DELETE FROM public.audit_logs WHERE entity_id=u::text;
 IF (j.snapshot->>'emptyOrganization')::boolean THEN
  v_org:=(j.snapshot->>'organizationId')::uuid;
  -- Recheck under the organization lock; a concurrent invitation/registration
  -- must never be swept into this operation.
  PERFORM 1 FROM public.organizations WHERE id=v_org FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE organization_id=v_org AND user_id<>u) OR EXISTS(SELECT 1 FROM public.org_staff WHERE organization_id=v_org) THEN RAISE EXCEPTION 'Organization changed during deletion'; END IF;
  DELETE FROM public.organizations WHERE id=v_org;
 END IF;
 DELETE FROM public.uc_identification_write_contexts WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND kind IN('subject_erase','reviewer_erase') AND user_id=u;
 PERFORM public.uc_learning_erase_user(u);
 PERFORM public.uc_custom_journal_erase_user(u);
 PERFORM public.uc_session_erase_user(u);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_personal_row_counts(u)) n WHERE (n->>'count')::bigint>0) THEN RAISE EXCEPTION 'Personal data erasure is incomplete'; END IF;
 UPDATE public.account_deletion_jobs SET data_erased=true WHERE id=j.id;
 RETURN jsonb_build_object('erased',true);
END;$function$
;
ALTER FUNCTION public.account_deletion_erase_data(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_erase_data(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_erase_data(uuid,text) TO service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch;

-- account_deletion_snapshot(uuid); body_md5=c6e55ea2001e24e7849875210d44baad; definition_md5=aaa5cc6d382e87fd1b513f0632f7ea2f
CREATE OR REPLACE FUNCTION public.account_deletion_snapshot(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE p public.profiles%ROWTYPE; v_org uuid; v_owner boolean:=false; v_education_outputs jsonb;v_education_unissued bigint;v_education_issued bigint;
 v_blockers jsonb:='[]'; v_categories jsonb:='[]'; v_files jsonb;
 v_count bigint; v_learning bigint; v_docs bigint:=0; v_shared bigint:=0; v_documentary bigint:=0;
 v_org_shared bigint:=0; v_courses bigint:=0; r record; v_fingerprint jsonb;
BEGIN
 SELECT coalesce(sum((archive_row->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_archive_personal_counts(p_user_id))archive_row;
 IF v_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','ARCHIVE_RETENTION_REVIEW_REQUIRED','message','Сохранены архивные дела, основания, история, файлы или изолированные копии. Центру нужно отдельно проверить дальнейшее хранение; удаление аккаунта не начато.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','archive_retained_copies','label','Архивные дела, история, основания и копии: требуется проверка хранения','count',v_count,'action','block'));
 END IF;
 SELECT * INTO p FROM public.profiles WHERE user_id=p_user_id;
 v_org:=p.organization_id;
 IF v_org IS NOT NULL THEN v_owner:=public.is_org_owner(p_user_id,v_org); END IF;
 SELECT count(*) INTO v_learning FROM public.enrollments WHERE user_id=p_user_id;
 SELECT count(*)INTO v_count FROM public.uc_course_assignment_removal_events removal_event WHERE removal_event.user_id=p_user_id OR removal_event.actor_id=p_user_id;
 IF v_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','Сохранена история отмены или повторного назначения курса. До удаления нужна отдельная проверка этих записей; назначение не удаляется физически.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','retained_assignment_removals','label','История отмен и повторных назначений: требуется проверка хранения','count',v_count,'action','retain'));
 END IF;
 IF public.uc_publication_personal_counts(p_user_id)<>'[]'::jsonb THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','Сохранены публичные редакции, проверки или календарные решения. До удаления нужна отдельная проверка хранения этих фактов.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','retained_publication_evidence','label','История публикаций и решений: требуется проверка хранения','count',(SELECT coalesce(sum((x->>'count')::bigint),0)FROM jsonb_array_elements(public.uc_publication_personal_counts(p_user_id))x),'action','retain'));
 END IF;
 IF public.uc_ng_personal_counts(p_user_id)<>'[]'::jsonb THEN
  SELECT coalesce(sum((ng_item->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_ng_personal_counts(p_user_id))ng_item;
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','NORMATIVE_RETENTION_REVIEW_REQUIRED','message','Сохранена история нормативного каталога и решений. До удаления требуется отдельная проверка дальнейшего хранения.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','normative_history_retained_copies','label','История нормативного каталога и решений: требуется проверка хранения','count',v_count,'action','block'));
 END IF;
 v_files:=public.account_deletion_files(p_user_id);
 -- Exact subject/document relationships; JSON checks are read-only detection,
 -- never commands to remove an organization-wide document.
 SELECT
   (SELECT count(*) FROM public.education_document_records WHERE user_id=p_user_id OR enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_issuance_log WHERE user_id=p_user_id)+
   (SELECT count(*) FROM public.student_documents WHERE enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_signatures WHERE (recipient_user_id=p_user_id OR sender_user_id=p_user_id) AND (signed_at IS NOT NULL OR sender_signed_at IS NOT NULL OR status='signed'))+
   (SELECT count(*) FROM public.org_contracts WHERE (student_user_id=p_user_id OR students::text LIKE '%'||p_user_id::text||'%') AND (approved_at IS NOT NULL OR signed_at IS NOT NULL OR status NOT IN ('draft','cancelled')))+
   (SELECT count(*) FROM public.group_documents WHERE (student_user_id=p_user_id OR variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%') AND (file_path IS NOT NULL OR doc_status<>'draft'))
 INTO v_docs;
 IF v_docs>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','У аккаунта есть оформленные учебные или подписанные документы организации. Для этих записей требуется отдельная проверка возможности удаления; она не заменяется подтверждением удаления аккаунта.')); END IF;
 IF EXISTS(SELECT 1 FROM public.group_completion_decision_history WHERE user_id=p_user_id) OR EXISTS(SELECT 1 FROM public.group_completion_decisions WHERE user_id=p_user_id) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть неизменяемая история итоговых решений организации. Их автоматическое удаление сейчас не поддержано без нарушения целостности общей истории; удаление не начато.'));
 END IF;
 -- CSZ preserves accepted homework by a dedicated immutable-history trigger.
 -- Do not bypass that guard just to scrub a personal free-text attachment.
 IF EXISTS(SELECT 1 FROM public.homework_submissions WHERE student_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.enrollments WHERE user_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id WHERE lp.user_id=p_user_id AND l.course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a')) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть защищённые работы ЦСЗ. Их обработка требует отдельного решения; результаты обучения сейчас не изменяются.'));
 END IF;
 -- These records have other stakeholders or privileged ownership. Never let
 -- Auth FK cascades silently delete client call records, contracts or grants.
 FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','student_user_id'),
  ('ai_avatar_templates','created_by'),
  ('balance_transactions','performed_by'),
  ('call_logs','manager_user_id'),
  ('chat_groups','created_by'),
  ('checko_search_presets','created_by'),
  ('checko_search_runs','created_by'),
  ('commercial_proposals','created_by'),
  ('commercial_proposals','deleted_by'),
  ('companies','user_id'),
  ('company_documents','deleted_by'),
  ('company_staff','invited_by'),
  ('course_landing_history','created_by'),
  ('course_manual_credits','credited_by'),
  ('course_manual_credits','revoked_by'),
  ('course_payments','user_id'),
  ('course_review_grants','created_by'),
  ('course_review_grants','updated_by'),
  ('course_snapshots','created_by'),
  ('data_subject_requests','deleted_by'),
  ('data_subject_requests','resolved_by'),
  ('document_issuance_log','deleted_by'),
  ('document_signatures','deleted_by'),
  ('driving_audit','user_id'),
  ('driving_entries','created_by'),
  ('driving_entry_reversals','created_by'),
  ('driving_instructors','user_id'),
  ('driving_invites','created_by'),
  ('driving_lessons','created_by'),
  ('driving_memberships','user_id'),
  ('driving_schools','created_by'),
  ('driving_students','user_id'),
  ('education_document_records','deleted_by'),
  ('email_campaigns','created_by'),
  ('email_drip_sequences','created_by'),
  ('email_templates','created_by'),
  ('enrollment_requests','resolved_by'),
  ('enrollment_requests','user_id'),
  ('goreltech_document_operations','actor_id'),
  ('goreltech_enrollment_orders','actor_id'),
  ('group_class_journal_marks','updated_by'),
  ('group_completion_decisions','confirmed_by'),
  ('group_document_schedules','updated_by'),
  ('group_documents','created_by'),
  ('group_documents','student_user_id'),
  ('homework_submissions','reviewer_id'),
  ('incoming_documents','deleted_by'),
  ('labor_safety_enrollment_protocols','created_by'),
  ('labor_safety_enrollment_protocols','source_user_id'),
  ('labor_safety_enrollment_protocols','updated_by'),
  ('labor_safety_profiles','user_id'),
  ('library_documents','created_by'),
  ('mailing_deliverability_seeds','created_by'),
  ('mailing_report_links','created_by'),
  ('mailing_senders','created_by'),
  ('marketplace_course_comments','user_id'),
  ('marketplace_orders','buyer_user_id'),
  ('org_billing_documents','deleted_by'),
  ('org_contract_template_versions','created_by'),
  ('org_custom_roles','created_by'),
  ('org_document_share_links','created_by'),
  ('org_documents','deleted_by'),
  ('org_signatories','created_by'),
  ('platform_invoice_acts','created_by'),
  ('platform_updates','created_by'),
  ('proposal_presets','created_by'),
  ('referral_attribution_log','user_id'),
  ('referral_partners','user_id'),
  ('sales_demo_links','created_by'),
  ('sales_demo_sessions','user_id'),
  ('sales_managers','user_id'),
  ('sales_tasks','created_by'),
  ('signature_comments','author_user_id'),
  ('signature_comments','resolved_by'),
  ('signature_revisions','created_by'),
  ('training_plans','created_by'),
  ('webinar_polls','created_by'),
  ('webinars','created_by'),
  ('webinars','host_user_id')
 ) x(t,c) LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING p_user_id;
  v_shared:=v_shared+v_count;
 END LOOP;
 v_shared:=v_shared+(SELECT count(*) FROM public.document_signatures WHERE (sender_user_id=p_user_id OR recipient_user_id=p_user_id) AND (sender_user_id IS DISTINCT FROM p_user_id OR recipient_user_id IS DISTINCT FROM p_user_id));
 v_shared:=v_shared+(SELECT count(*) FROM public.org_contracts WHERE student_user_id IS DISTINCT FROM p_user_id AND students::text LIKE '%'||p_user_id::text||'%');
 v_shared:=v_shared+(SELECT count(*) FROM public.group_documents WHERE student_user_id IS DISTINCT FROM p_user_id AND (variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%'));
 IF v_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_DATA_REVIEW_REQUIRED','message','Аккаунт связан с общими рабочими записями. Сначала нужно передать ответственность за них; данные других пользователей не удаляются.')); END IF;
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE (o.owner=p_user_id OR o.owner_id=p_user_id::text)
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_files) f WHERE f->>'bucket'=o.bucket_id AND f->>'path'=o.name)) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_FILES_REVIEW_REQUIRED','message','Есть загруженные аккаунтом файлы вне личных папок. Сначала нужно проверить их принадлежность организации.'));
 END IF;
 IF v_owner THEN
  -- Locking/revalidation occurs again in begin. A brand-new sole-owner
  -- organization may be removed with its default welcome course/templates.
  SELECT count(*) INTO v_org_shared FROM public.profiles WHERE organization_id=v_org AND user_id<>p_user_id;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=v_org);
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.organizations WHERE id=v_org AND (balance<>0 OR is_paid OR paid_until IS NOT NULL));
  FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','organization_id'),
  ('org_crm_deals','organization_id'),
  ('org_crm_tasks','organization_id'),
  ('org_crm_activities','organization_id'),
  ('achievements','organization_id'),
  ('admin_generated_documents','sent_to_organization_id'),
  ('admin_org_messages','organization_id'),
  ('ai_avatar_templates','organization_id'),
  ('audit_logs','organization_id'),
  ('balance_transactions','organization_id'),
  ('chat_groups','organization_id'),
  ('checko_search_presets','organization_id'),
  ('commercial_proposals','organization_id'),
  ('companies','organization_id'),
  ('company_requests','organization_id'),
  ('consent_documents','organization_id'),
  ('course_landing_history','organization_id'),
  ('course_payments','organization_id'),
  ('course_reminders','organization_id'),
  ('course_requests','organization_id'),
  ('course_snapshots','organization_id'),
  ('data_subject_requests','organization_id'),
  ('document_issuance_log','organization_id'),
  ('document_number_sequences','organization_id'),
  ('document_signatures','organization_id'),
  ('driving_audit','organization_id'),
  ('driving_cars','organization_id'),
  ('driving_courses','organization_id'),
  ('driving_entries','organization_id'),
  ('driving_entry_reversals','organization_id'),
  ('driving_groups','organization_id'),
  ('driving_instructors','organization_id'),
  ('driving_invites','organization_id'),
  ('driving_lessons','organization_id'),
  ('driving_memberships','organization_id'),
  ('driving_operations','organization_id'),
  ('driving_programs','organization_id'),
  ('driving_schools','organization_id'),
  ('driving_shifts','organization_id'),
  ('driving_students','organization_id'),
  ('education_document_records','organization_id'),
  ('email_action_tokens','organization_id'),
  ('email_campaign_consent_log','organization_id'),
  ('email_campaigns','organization_id'),
  ('email_drip_subscribers','organization_id'),
  ('frdo_signed_documents','organization_id'),
  ('goreltech_document_operations','organization_id'),
  ('goreltech_enrollment_orders','organization_id'),
  ('group_class_journal_marks','organization_id'),
  ('group_completion_decision_history','organization_id'),
  ('group_completion_decisions','organization_id'),
  ('group_document_schedules','organization_id'),
  ('group_documents','organization_id'),
  ('homework_submissions','organization_id'),
  ('incoming_documents','organization_id'),
  ('journal_instances','organization_id'),
  ('kinescope_usage_cache','organization_id'),
  ('knowledge_bank','organization_id'),
  ('labor_safety_enrollment_protocols','organization_id'),
  ('labor_safety_groups','organization_id'),
  ('labor_safety_profiles','organization_id'),
  ('library_documents','organization_id'),
  ('library_folders','organization_id'),
  ('mailing_campaign_ledger','organization_id'),
  ('mailing_campaign_replies','organization_id'),
  ('mailing_contacts','organization_id'),
  ('mailing_deliverability_checks','organization_id'),
  ('mailing_deliverability_seeds','organization_id'),
  ('mailing_report_links','organization_id'),
  ('mailing_seed_ledger','organization_id'),
  ('mailing_senders','organization_id'),
  ('marketplace_courses','organization_id'),
  ('marketplace_orders','buyer_organization_id'),
  ('ordinary_mail_report_events','organization_id'),
  ('org_billing_documents','organization_id'),
  ('org_contract_template_versions','organization_id'),
  ('org_contract_templates','organization_id'),
  ('org_contracts','organization_id'),
  ('org_custom_roles','organization_id'),
  ('org_document_share_links','organization_id'),
  ('org_document_versions','organization_id'),
  ('org_documents','organization_id'),
  ('org_general_messages','organization_id'),
  ('org_payers','organization_id'),
  ('org_services','organization_id'),
  ('org_signatories','organization_id'),
  ('org_smtp_settings','organization_id'),
  ('org_staff','organization_id'),
  ('org_student_messages','organization_id'),
  ('organization_comments','organization_id'),
  ('organization_payment_settings','organization_id'),
  ('organization_reminders','organization_id'),
  ('pending_enrollments','organization_id'),
  ('platform_invoice_acts','organization_id'),
  ('program_categories','organization_id'),
  ('program_documents','organization_id'),
  ('program_folders','organization_id'),
  ('program_training_plans','organization_id'),
  ('proposal_presets','organization_id'),
  ('referral_attribution_log','organization_id'),
  ('referral_commissions','organization_id'),
  ('referral_registrations','organization_id'),
  ('registration_links','organization_id'),
  ('role_audit_log','organization_id'),
  ('sales_blacklist','organization_id'),
  ('sales_companies_db','organization_id'),
  ('sales_contracts','organization_id'),
  ('sales_demo_links','organization_id'),
  ('sales_demo_sessions','organization_id'),
  ('sales_lead_activities','organization_id'),
  ('sales_leads','organization_id'),
  ('sales_tasks','organization_id'),
  ('service_orders','organization_id'),
  ('skillspace_import_jobs','organization_id'),
  ('staff_invitations','organization_id'),
  ('student_deletion_log','organization_id'),
  ('student_group_memberships','organization_id'),
  ('student_groups','organization_id'),
  ('student_roster_removals','organization_id'),
  ('subscription_invoices','organization_id'),
  ('system_diagnostics','organization_id'),
  ('testimonials','organization_id'),
  ('training_plans','organization_id'),
  ('webinars','organization_id')
  ) x(t,c) LOOP
   EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING v_org;
   v_org_shared:=v_org_shared+v_count;
  END LOOP;
  -- Only the audited seeded course is auto-removable in the first release.
  SELECT count(*) INTO v_courses FROM public.courses WHERE organization_id=v_org;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.courses WHERE organization_id=v_org AND system_key IS DISTINCT FROM 'welcome');
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_admission_cases WHERE organization_id=v_org);
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_group_education_states WHERE organization_id=v_org);
 IF v_org_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','OWNERSHIP_TRANSFER_REQUIRED','message','Организация содержит пользователей, обучение, платежи или рабочие записи. Сначала передайте управление организацией.','actionHref','/organization?tab=staff')); END IF;
 END IF;
 -- PEP is deletable only when it is the person's standalone agreement, not
 -- evidence attached to a document signature (the live FK is SET NULL).
 SELECT count(*) INTO v_documentary FROM public.pep_agreements pa
 WHERE pa.user_id=p_user_id AND EXISTS(SELECT 1 FROM public.document_signatures d WHERE d.pep_agreement_id=pa.id);
 -- An organization's offer acceptance belongs to the organization lifecycle.
 -- Remove it only together with the verified unused sole-owner organization.
 SELECT v_documentary+count(*) INTO v_documentary FROM public.organization_offer_acceptances a
 WHERE a.user_id=p_user_id AND NOT (v_owner AND v_org_shared=0 AND a.organization_id=v_org);
 IF v_documentary>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','DOCUMENTARY_RELATION_REVIEW_REQUIRED','message','Есть соглашение ПЭП, связанное с подписью документа, или акцепт оферты действующей организации. Эти общие документальные записи требуют отдельной обработки; удаление аккаунта не начато.')); END IF;
 v_education_outputs:=public.uc_education_saved_output_counts(p_user_id);v_education_unissued:=(v_education_outputs->>'unissued')::bigint;v_education_issued:=(v_education_outputs->>'issued')::bigint;
 IF v_education_unissued+v_education_issued>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','EDUCATION_ARTIFACT_RETENTION_REVIEW_REQUIRED','message','Сохранены файлы подготовки, ещё не выданные: '||v_education_unissued||'; архивы выданных документов: '||v_education_issued||'. Учебному центру нужно проверить черновики и основания дальнейшего хранения архива. Удаление аккаунта не начато.'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_frdo_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','FRDO_PACKET_RETENTION_REVIEW_REQUIRED','message','Сохранены персональные сведения и их копии в пакетах ФРДО, файлах, квитанциях или полномочиях оператора. Учебному центру нужно проверить основание и порядок дальнейшего хранения. Удаление аккаунта не начато.'));END IF;
 v_categories:=v_categories||jsonb_build_array(
  jsonb_build_object('key','account','label','Вход в аккаунт, пароль, профиль и личные настройки','count',1,'action','delete'),
  jsonb_build_object('key','private_files','label','Личные фотографии и загруженные документы','count',jsonb_array_length(v_files),'action','delete'),
  jsonb_build_object('key','learning_results','label','Назначения курсов, прогресс, попытки, ответы и результаты обучения','count',v_learning,'action','delete'),
  jsonb_build_object('key','institutional_documents','label','Оформленные документы','count',v_docs,'action',CASE WHEN v_docs>0 THEN 'block' ELSE 'delete' END));
 IF v_education_unissued+v_education_issued>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','education_artifact_outputs','label','Файлы подготовки и архив выданных документов: требуется проверка сохранения','count',v_education_unissued+v_education_issued,'action','block'));END IF;
 IF v_documentary>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','documentary_relations','label','Соглашения ПЭП и акцепты оферт, связанные с документами или действующей организацией','count',v_documentary,'action','block')); END IF;
 IF v_owner THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','empty_organization','label','Неиспользованная организация и ознакомительный курс','count',1,'action',CASE WHEN v_org_shared>0 THEN 'block' ELSE 'delete' END)); END IF;
 SELECT count(*) INTO v_count FROM public.audit_logs WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','common_audit','label','Общие события организации: запись события сохраняется, имя и ссылка на аккаунт удаляются','count',v_count,'action','anonymize')); END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_cases WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','admission_cases','label','Личные дела и их индивидуальные копии','count',v_count,'action','delete'));END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_case_events WHERE actor_id=p_user_id AND user_id<>p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','admission_review_attribution','label','Атрибуция внутренних проверок: удаляется ссылка на аккаунт и личный текст','count',v_count,'action','anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_frdo_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','frdo_retained_copies','label','Пакеты ФРДО, файлы, квитанции, источники и полномочия: требуется проверка хранения','count',v_count,'action','block'));END IF;
 v_categories:=v_categories||public.uc_group_education_deletion_preview(p_user_id);
 SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_learning_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','learning_outcomes','label','Результаты обучения и решения: личные строки удаляются, атрибуция обезличивается','count',v_count,'action','delete_or_anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_custom_journal_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','custom_journals','label','Собственные журналы: строки выбранного лица удаляются, авторские копии обезличиваются','count',v_count,'action','delete_or_anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_session_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','conducted_sessions','label','Проведённые занятия, посещение и черновики: личные сведения обезличиваются, редакции сохраняются','count',v_count,'action','anonymize'));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record','label','Техническая запись запрета старого доступа и квитанция об удалении без имени и контактов','count',1,'action','retain'));
 SELECT coalesce(sum((x->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_signature_assurance_personal_counts(p_user_id)||public.uc_signature_assurance_file_proof_personal_counts(p_user_id))x;
 IF v_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SIGNATURE_EVIDENCE_RETENTION_REVIEW_REQUIRED','message','Сохранены факты подтверждения, точные тексты соглашений или согласий, файлы и их копии. Учебному центру нужно отдельно проверить основание и порядок дальнейшего хранения. Удаление аккаунта не начато.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','signature_evidence_retained_copies','label','Подтверждения документов, тексты соглашений и согласий, файлы и копии: требуется проверка хранения','count',v_count,'action','block'));
 END IF;
 -- The snapshot is compared atomically just before the first mutation. Counts
 -- and manifest cover additions during the confirmation dialog; no PII stored.
 IF public.uc_self_examination_retained(p_user_id)THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','Сохранены черновики самообследования, подтверждения фактов или связанные источники. До удаления нужна отдельная проверка хранения; автоматическая очистка файлов не начинается.'));
  SELECT coalesce(sum(x.value::bigint),0)INTO v_count FROM jsonb_each_text(public.uc_self_examination_personal_counts(p_user_id))x;
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','retained_self_examination','label','Самообследование и его источники: требуется проверка хранения','count',v_count,'action','retain'));
 END IF;
 RETURN jsonb_build_object('organizationId',v_org,'emptyOrganization',v_owner AND v_org_shared=0,'learningCount',v_learning,
  'categories',v_categories,'blockers',v_blockers,'files',v_files,'sharedCount',v_shared,'personalRows',public.account_deletion_personal_row_counts(p_user_id),
  'profileRevision',p.updated_at,'role',(SELECT role::text FROM public.user_roles WHERE user_id=p_user_id LIMIT 1));
END;$function$
;
ALTER FUNCTION public.account_deletion_snapshot(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_snapshot(uuid) TO service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch;

-- uc_scoped_journal_personal_counts(uuid); body_md5=f8f7b3be7cf578aafc26c66c46864ec9; definition_md5=4824a861df1f690d3c4e6b0e23a5832a
CREATE OR REPLACE FUNCTION public.uc_scoped_journal_personal_counts(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT(
 SELECT(
 SELECT(
 SELECT(
 SELECT(
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',count_row.table_name,'column',count_row.column_name,'count',count_row.n) ORDER BY count_row.table_name),'[]'::jsonb) FROM(
  SELECT 'uc_scoped_journal_contexts'::text table_name,'created_by'::text column_name,count(*) n FROM public.uc_scoped_journal_contexts c WHERE c.created_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_records','participant_ids',count(*) FROM public.uc_scoped_journal_records r WHERE p_user=ANY(r.participant_ids) OR r.subject_user_id=p_user OR r.recorded_by=p_user OR r.created_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_history','participant_ids',count(*) FROM public.uc_scoped_journal_history h WHERE p_user=ANY(h.participant_ids) OR h.subject_user_id=p_user OR h.recorded_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_requests','participant_ids',count(*) FROM public.uc_scoped_journal_requests request_row WHERE p_user=ANY(request_row.participant_ids) OR request_row.actor_id=p_user
  UNION ALL SELECT 'uc_scoped_journal_exports','participant_ids',count(*) FROM public.uc_scoped_journal_exports e WHERE p_user=ANY(e.participant_ids) OR e.recorded_by=p_user
 ) count_row WHERE count_row.n>0
)||public.uc_copy_registry_personal_counts(p_user)
)||public.uc_document_registry_personal_counts(p_user)
)||public.uc_education_personal_counts(p_user))||public.uc_frdo_personal_counts(p_user))||public.uc_signature_assurance_personal_counts(p_user)||public.uc_signature_assurance_file_proof_personal_counts(p_user)||public.uc_archive_personal_counts(p_user)||public.uc_publication_personal_counts(p_user)
||(SELECT coalesce(jsonb_agg(jsonb_build_object('table',x.key,'column','retained_self_examination','count',x.value::bigint)ORDER BY x.key),'[]'::jsonb)FROM jsonb_each_text(public.uc_self_examination_personal_counts(p_user))x WHERE x.value::bigint>0)
||public.uc_ng_personal_counts(p_user)
$function$
;
ALTER FUNCTION public.uc_scoped_journal_personal_counts(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.uc_scoped_journal_personal_counts(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- account_deletion_personal_row_counts(uuid); body_md5=705da9fbcd16a68fe1ea3a9dca90b52e; definition_md5=5b88dbf3ae72ae78fcd5c9f3dbca3872
CREATE OR REPLACE FUNCTION public.account_deletion_personal_row_counts(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r record; n bigint; result jsonb:='[]';
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('admin_org_messages','sender_user_id'),
  ('admin_staff','user_id'),
  ('ai_prompt_templates','user_id'),
  ('ai_tutor_sessions','user_id'),
  ('ai_usage_log','user_id'),
  ('call_log_listens','listener_user_id'),
  ('chat_group_members','user_id'),
  ('chat_group_messages','sender_user_id'),
  ('chat_messages','user_id'),
  ('chat_notification_settings','user_id'),
  ('client_error_logs','user_id'),
  ('company_staff','user_id'),
  ('consent_documents','student_user_id'),
  ('course_access_log','user_id'),
  ('course_reminders','user_id'),
  ('course_requests','user_id'),
  ('course_review_grants','user_id'),
  ('data_subject_requests','user_id'),
  ('document_signatures','recipient_user_id'),
  ('document_signatures','sender_user_id'),
  ('organization_monthly_student_assignments','user_id'),
  ('organization_monthly_training_completions','user_id'),
  ('enrollment_history','user_id'),
  ('enrollments','user_id'),
  ('exolve_sip_accounts','user_id'),
  ('final_test_photo_challenges','user_id'),
  ('group_class_journal_marks','user_id'),
  ('group_completion_decision_history','user_id'),
  ('group_completion_decisions','user_id'),
  ('homework_submissions','student_id'),
  ('journal_entries','user_id'),
  ('lesson_progress','user_id'),
  ('module_access_overrides','user_id'),
  ('notification_preferences','user_id'),
  ('org_contracts','student_user_id'),
  ('org_general_messages','sender_user_id'),
  ('org_notifications','user_id'),
  ('org_staff','user_id'),
  ('org_student_messages','sender_user_id'),
  ('org_student_messages','student_user_id'),
  ('organization_offer_acceptances','user_id'),
  ('partner_applications','user_id'),
  ('pending_enrollments','user_id'),
  ('pep_agreements','user_id'),
  ('pipeline_runs','user_id'),
  ('profiles','user_id'),
  ('registration_attempts','user_id'),
  ('role_audit_log','target_user_id'),
  ('student_consents','user_id'),
  ('student_deletion_log','student_id'),
  ('student_frdo_data','user_id'),
  ('student_group_memberships','user_id'),
  ('student_identity_documents','user_id'),
  ('student_login_history','user_id'),
  ('student_login_tokens','user_id'),
  ('student_notifications','user_id'),
  ('student_roster_removals','user_id'),
  ('support_conversations','user_id'),
  ('support_messages','sender_user_id'),
  ('support_requests','user_id'),
  ('test_attempt_sessions','user_id'),
  ('test_attempt_start_requests','user_id'),
  ('test_attempts','user_id'),
  ('testimonials','user_id'),
  ('training_plans','user_id'),
  ('user_achievements','user_id'),
  ('user_roles','user_id'),
  ('uc_identification_records','user_id'),
  ('uc_identification_sources','user_id'),
  ('uc_identification_events','user_id'),
  ('uc_identification_records','decided_by'),
  ('uc_identification_events','actor_id'),
  ('uc_identification_requests','actor_id'),
  ('uc_admission_cases','user_id'),
  ('uc_admission_cases','responsible_id'),
  ('uc_admission_rule_sets','user_id'),
  ('uc_admission_rule_sets','reviewer_id'),
  ('uc_admission_case_events','user_id'),
  ('uc_admission_case_events','actor_id'),
  ('uc_admission_case_evidence','user_id'),
  ('uc_admission_case_evidence','captured_by'),
  ('uc_admission_evidence_reservations','user_id'),
  ('uc_admission_evidence_reservations','actor_id'),
  ('uc_admission_case_requests','user_id'),
  ('uc_admission_case_requests','actor_id'),
  ('video_identifications','user_id'),
  ('webinar_participants','user_id')
 ) x(t,c) LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO n USING p_user_id;
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table',r.t,'column',r.c,'count',n)); END IF;
 END LOOP;
 SELECT count(*)INTO n FROM public.uc_admission_cases WHERE reviews::text LIKE '%'||p_user_id::text||'%'OR decision::text LIKE '%'||p_user_id::text||'%'OR tasks::text LIKE '%'||p_user_id::text||'%';
 IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table','uc_admission_cases','column','review_attribution','count',n));END IF;
 result:=result||public.uc_group_education_personal_counts(p_user_id);
 result:=result||public.uc_learning_personal_counts(p_user_id);
 result:=result||public.uc_custom_journal_personal_counts(p_user_id);
 result:=result||public.uc_session_personal_counts(p_user_id);
 RETURN result;
END;$function$
;
ALTER FUNCTION public.account_deletion_personal_row_counts(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_personal_row_counts(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_personal_row_counts(uuid) TO service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch;

-- uc_custom_journal_personal_counts(uuid); body_md5=bad19efdfe514c375a4f38cf8c064b01; definition_md5=bcbdd8666c91ff27ace8a3716d40153e
CREATE OR REPLACE FUNCTION public.uc_custom_journal_personal_counts(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE t text;c text;n bigint;result jsonb:='[]';BEGIN
 FOR t,c IN SELECT * FROM(VALUES('uc_custom_journals','created_by'),('uc_custom_journals','updated_by'),('uc_custom_journal_schemas','created_by'),('uc_custom_journal_records','subject_user_id'),('uc_custom_journal_records','recorded_by'),('uc_custom_journal_history','subject_user_id'),('uc_custom_journal_history','recorded_by'),('uc_custom_journal_requests','actor_id'),('uc_custom_journal_requests','subject_user_id'))x(t,c)LOOP
  EXECUTE format('SELECT count(*)FROM public.%I WHERE %I=$1',t,c)INTO n USING p_user;
  IF n>0 THEN result:=result||jsonb_build_array(jsonb_build_object('table',t,'column',c,'count',n));END IF;
 END LOOP;result:=result||public.uc_scoped_journal_personal_counts(p_user);RETURN result;
END;$function$
;
ALTER FUNCTION public.uc_custom_journal_personal_counts(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.uc_custom_journal_personal_counts(uuid) FROM PUBLIC,anon,authenticated,service_role;


ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO sandbox_exec_atxwvjxbqjgkbjlhsdch;