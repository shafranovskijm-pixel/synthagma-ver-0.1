-- SOURCE-ONLY synthetic PostgreSQL unit fixture. NOT a production clone.
-- Run ONLY in a fresh disposable loopback database of this exact name.
-- No production credentials, client rows or answer banks belong here.
\set ON_ERROR_STOP on
DO $f$ BEGIN
 IF current_database()<>'sintagma_pcr_v4_r2_lab_20261028' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
    OR current_setting('pcr.lab_authorized',true) IS DISTINCT FROM 'source-reviewed-root-run-only' THEN
  RAISE EXCEPTION 'PCR_UNIT_LAB_ONLY';
 END IF;
 IF to_regclass('public.courses') IS NOT NULL OR to_regclass('auth.users') IS NOT NULL THEN RAISE EXCEPTION 'PCR_FRESH_EMPTY_UNIT_DATABASE_REQUIRED';END IF;
END $f$;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TYPE public.app_role AS ENUM('admin','organization','student');
CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid,blocked_at timestamptz,archived_at timestamptz);
CREATE TABLE public.user_roles(user_id uuid,role public.app_role,PRIMARY KEY(user_id,role));
CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY);
CREATE TABLE public.admin_staff(user_id uuid,role text,expires_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $f$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$ SELECT current_setting('request.jwt.claim.role',true) $f$;
-- These three definitions reproduce the current narrow helper contract. The
-- remainder of UC013/PLP/other application triggers is NOT cloned or accepted.
CREATE FUNCTION public.has_role(_role public.app_role,_user_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
BEGIN RETURN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);END $f$;
CREATE FUNCTION public.account_deletion_access_allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid())
$f$;
CREATE FUNCTION public.uc_platform_document_action_allowed(p_user uuid,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
 SELECT p_user IS NOT NULL AND p_action IN ('read','write','sign','issue')
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND (NOT public.has_role('admin'::public.app_role,p_user)
  OR NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user)
  OR EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user AND
     (role IN ('super_admin','admin') OR p_action='read' AND role IN ('viewer','sales_manager'))
     AND (expires_at IS NULL OR expires_at>now()))
   AND NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user
     AND (NOT (role IN ('super_admin','admin') OR p_action='read' AND role IN ('viewer','sales_manager')) OR expires_at<=now())))
$f$;
CREATE FUNCTION public.prog_test_question_key_valid(p_options jsonb,p_answer integer) RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
 SELECT jsonb_typeof(p_options)='array' AND p_answer>=0 AND p_answer<jsonb_array_length(p_options)
$f$;
-- Minimal table shapes exercise the NEW SQL, not production schema fidelity.
CREATE TABLE public.courses(id uuid PRIMARY KEY,organization_id uuid NOT NULL,title text,description text,frdo_program_type text,frdo_duration_hours integer,generation_progress jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.course_modules(id uuid PRIMARY KEY,course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,title text,order_index integer,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.lessons(id uuid PRIMARY KEY,course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,module_id uuid REFERENCES public.course_modules(id) ON DELETE SET NULL,title text,type text,content text,metadata jsonb,order_index integer,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.test_questions(id uuid PRIMARY KEY,lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,question text,options jsonb,correct_answer integer,explanation text,order_index integer);
CREATE TABLE public.library_documents(id uuid PRIMARY KEY,organization_id uuid,edition_label text,external_url text,storage_path text,last_checked_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.course_documents(id uuid PRIMARY KEY,course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,library_document_id uuid REFERENCES public.library_documents(id) ON DELETE RESTRICT,name text,file_url text,sort_order integer,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.lesson_attachments(id uuid PRIMARY KEY,lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,name text,file_url text,order_index integer,created_at timestamptz DEFAULT now());
CREATE TABLE public.marketplace_courses(id uuid PRIMARY KEY,course_id uuid UNIQUE REFERENCES public.courses(id) ON DELETE CASCADE,organization_id uuid,is_validated boolean NOT NULL DEFAULT false,is_active boolean DEFAULT true,description_short text,updated_at timestamptz DEFAULT now());
CREATE TABLE public.qa_retained_results(id integer PRIMARY KEY,source_course_id uuid,score integer,answers jsonb);
-- A unit invalidation fixture with the same six current source routes. Full
-- historical production trigger execution is a SEPARATE integration gate.
CREATE FUNCTION public.invalidate_marketplace_course_validation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE a uuid;b uuid;
BEGIN
 IF TG_TABLE_NAME='courses' THEN a:=OLD.id;b:=NEW.id;
 ELSIF TG_TABLE_NAME IN('course_modules','lessons','course_documents') THEN
  IF TG_OP<>'INSERT' THEN a:=OLD.course_id;END IF;IF TG_OP<>'DELETE' THEN b:=NEW.course_id;END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN SELECT course_id INTO a FROM public.lessons WHERE id=OLD.lesson_id;END IF;
  IF TG_OP<>'DELETE' THEN SELECT course_id INTO b FROM public.lessons WHERE id=NEW.lesson_id;END IF;
 END IF;
 UPDATE public.marketplace_courses SET is_validated=false WHERE is_validated AND course_id IN(a,b);
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $f$;
DO $f$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['course_modules','lessons','test_questions','lesson_attachments','course_documents'] LOOP
  EXECUTE format('CREATE TRIGGER invalidate_marketplace_fixture AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.invalidate_marketplace_course_validation()',t);
 END LOOP;
END $f$;
CREATE TRIGGER invalidate_marketplace_fixture AFTER UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.invalidate_marketplace_course_validation();
INSERT INTO auth.users(id) VALUES('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
INSERT INTO public.profiles(user_id,organization_id) VALUES('10000000-0000-0000-0000-000000000001','4ac2c05a-d8b5-4e72-ba31-f2c743091d95'),('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001');
INSERT INTO public.user_roles VALUES('10000000-0000-0000-0000-000000000001','admin'),('10000000-0000-0000-0000-000000000002','organization');
INSERT INTO public.courses(id,organization_id,title) VALUES
 ('30000000-0000-0000-0000-000000000001','4ac2c05a-d8b5-4e72-ba31-f2c743091d95','PCR LAB inline TEST'),
 ('30000000-0000-0000-0000-000000000002','4ac2c05a-d8b5-4e72-ba31-f2c743091d95','PCR LAB legacy TEST'),
 ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','PCR LAB client TEST');
INSERT INTO public.course_modules(id,course_id,title,order_index) VALUES('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','TEST',0);
INSERT INTO public.lessons(id,course_id,module_id,title,type,content,order_index) VALUES
 ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Inline TEST','text','Synthetic text: control code 28.',0),
 ('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Synthetic TEST','test','',1);
INSERT INTO public.test_questions VALUES('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','Synthetic control code?','["28","17"]',0,'Synthetic code only.',0);
INSERT INTO public.marketplace_courses VALUES
 ('70000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','4ac2c05a-d8b5-4e72-ba31-f2c743091d95',false,true,'TEST',now()),
 ('70000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002',NULL,true,true,'LEGACY',now()),
 ('70000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',true,true,'CLIENT',now());
INSERT INTO public.qa_retained_results VALUES(1,'30000000-0000-0000-0000-000000000003',73,'{"old_question":"old_answer"}');
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.courses,public.course_modules,public.lessons,public.test_questions,public.library_documents,public.course_documents,public.lesson_attachments,public.marketplace_courses TO authenticated;
-- RLS is not substituted as the access proof here: actor checks exercise the
-- real new SECURITY DEFINER functions and explicit table ACL denial.

-- LAB ONLY SOURCE. Run after exact minimal bootstrap and before the new core.
-- No production schema change. This adds the second pinned module SET NULL edge.
\set ON_ERROR_STOP on
DO $gate$ BEGIN
 IF current_database() IS DISTINCT FROM 'sintagma_pcr_v4_r2_lab_20261028'
 OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port() IS DISTINCT FROM 65319
 OR current_setting('server_version_num') IS DISTINCT FROM '170011'
 OR lower(replace(current_setting('data_directory'),chr(92),'/')) IS DISTINCT FROM lower('C:/Users/max/Documents/Codex/2026-10-16/sintagma-local/work/course-finish-20261026/prog012-isolated-v4-r2-unit-lab-20261028/data')
 OR current_setting('pcr.lab_authorized',true) IS DISTINCT FROM 'source-reviewed-root-run-only'
 THEN RAISE EXCEPTION 'PCR_V4_EXACT_ISOLATED_LAB_REQUIRED';END IF;
END;$gate$;
BEGIN;
ALTER TABLE public.course_documents ADD COLUMN module_id uuid REFERENCES public.course_modules(id) ON DELETE SET NULL;
COMMIT;
