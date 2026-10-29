-- CI-only fresh dedicated database. Synthetic SQL users, no Auth provider/credentials.
-- This is NOT the full production fourteen-trigger profile schema.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'sintagma_self_profile_lab_20261028'OR current_user<>'postgres'OR session_user<>'postgres'
 OR inet_server_addr()IS DISTINCT FROM'127.0.0.1'::inet OR inet_server_port()<>5432
 OR current_setting('server_version_num')<>'170011'OR current_setting('data_directory')<>'/var/lib/postgresql/data'
 OR current_setting('pcr.lab_authorized',true)IS DISTINCT FROM'source-reviewed-root-run-only'
 THEN RAISE EXCEPTION 'SELF_NATIVE_EXACT_PRIVATE_FRESH_PG1711_LAB_REQUIRED';END IF;
 IF to_regnamespace('auth')IS NOT NULL OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
 THEN RAISE EXCEPTION 'SELF_NATIVE_EMPTY_DATABASE_AND_EXISTING_JOB_ROLES_REQUIRED';END IF;
END;$guard$;
BEGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid()RETURNS uuid LANGUAGE sql STABLE AS $f$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$f$;
CREATE FUNCTION auth.role()RETURNS text LANGUAGE sql STABLE AS $f$SELECT current_setting('request.jwt.claim.role',true)$f$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,deleted_at timestamptz,banned_until timestamptz);
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.companies(id uuid PRIMARY KEY);
CREATE TABLE public.student_groups(id uuid PRIMARY KEY,organization_id uuid,UNIQUE(id,organization_id));
CREATE TABLE public.pep_agreements(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE public.profiles(
 id uuid DEFAULT gen_random_uuid() NOT NULL,
 user_id uuid NOT NULL,
 organization_id uuid,
 full_name text,
 email text,
 avatar_url text,
 created_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL,
 company_id uuid,
 login text,
 generated_password text,
 last_visit_at timestamp with time zone DEFAULT now(),
 student_group_id uuid,
 onboarding_completed boolean DEFAULT false NOT NULL,
 phone text,
 city text,
 bio text,
 vk_link text,
 telegram_link text,
 chat_privacy jsonb DEFAULT '{}'::jsonb,
 lead_source text,
 lead_utm jsonb DEFAULT '{}'::jsonb,
 last_seen_announcement_at timestamp with time zone,
 archived_at timestamp with time zone,
 blocked_at timestamp with time zone,
 blocked_reason text,
 blocked_by uuid,
 region text,
 contact_email text,
 job_position text,
 department text
);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_group_organization_registration_fkey FOREIGN KEY (student_group_id, organization_id) REFERENCES student_groups(id, organization_id) ON DELETE SET NULL (student_group_id) NOT VALID;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_login_key UNIQUE (login);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_student_group_id_fkey FOREIGN KEY (student_group_id) REFERENCES student_groups(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
-- uc013_source_fold is a production constraint-trigger display, not ALTER TABLE DDL.
-- It and the wider UC trigger graph are intentionally outside this minimal fixture.
CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY);
CREATE TABLE public.user_roles(user_id uuid,role text,PRIMARY KEY(user_id,role));
CREATE TABLE public.org_staff(user_id uuid,organization_id uuid,role text);
CREATE TABLE public.admin_staff(user_id uuid,role text,expires_at timestamptz);
CREATE TABLE public.achievements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE);
CREATE TABLE public.user_achievements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,achievement_id uuid REFERENCES public.achievements(id),is_seen boolean,created_at timestamptz DEFAULT now(),UNIQUE(user_id,achievement_id));
CREATE TABLE public.qa_retained_results(id integer PRIMARY KEY,score integer,answers jsonb);
-- Actual current function definitions are copied byte-for-byte below; only an
-- outer statement terminator is appended to each pg_get_functiondef result.
CREATE OR REPLACE FUNCTION public.account_deletion_access_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid());
$function$
;
CREATE OR REPLACE FUNCTION public.award_achievement(p_user_id uuid, p_achievement_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_achievement_id UUID;
BEGIN
  -- Get achievement id by code
  SELECT id INTO v_achievement_id FROM achievements WHERE code = p_achievement_code;
  
  IF v_achievement_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Insert achievement (ignore if already exists)
  INSERT INTO user_achievements (user_id, achievement_id, is_seen)
  VALUES (p_user_id, v_achievement_id, false)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_profile_achievements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Award "First step" achievement on profile creation
  PERFORM award_achievement(NEW.user_id, 'first_step');
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.account_deletion_subject_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE column_name text; target_id uuid; targets uuid[]; pep_targets uuid[];
BEGIN
 -- Sort locks to avoid deadlocks in two-person message rows.
 -- UPDATE may not move a revoked subject's data outside the deletion scope.
 SELECT array_agg(DISTINCT subject_id::uuid ORDER BY subject_id::uuid) INTO targets
 FROM unnest(TG_ARGV) c CROSS JOIN LATERAL (
  VALUES (to_jsonb(NEW)->>c),
         (CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>c END)
 ) subjects(subject_id) WHERE subject_id IS NOT NULL;
 -- A signature may refer to a person's PEP agreement even if its party UUIDs
 -- differ. Keep that exact indirect relationship inside the same write fence.
 IF TG_TABLE_NAME='document_signatures' THEN
  SELECT array_agg(DISTINCT p.user_id) INTO pep_targets FROM public.pep_agreements p
  WHERE p.user_id IS NOT NULL AND p.id IN (
   (to_jsonb(NEW)->>'pep_agreement_id')::uuid,
   CASE WHEN TG_OP='UPDATE' THEN (to_jsonb(OLD)->>'pep_agreement_id')::uuid END);
  SELECT array_agg(DISTINCT x ORDER BY x) INTO targets
  FROM unnest(coalesce(targets,'{}'::uuid[])||coalesce(pep_targets,'{}'::uuid[])) x;
 END IF;
 FOREACH target_id IN ARRAY coalesce(targets,'{}'::uuid[]) LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(target_id::text,42007));
  IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=target_id) THEN
   -- Only these two real DELETE-trigger event rows may be generated during
   -- service cleanup. The same transaction erases them at the tail. The flag
   -- is transaction-local and never bypasses profile/learning/document writes.
   IF TG_OP='INSERT' AND TG_TABLE_NAME IN ('enrollment_history','role_audit_log')
    AND auth.role()='service_role'
    AND current_setting('sintagma.account_deletion_erase_user',true)=target_id::text THEN CONTINUE; END IF;
   RAISE EXCEPTION 'Account personal data writes are closed' USING ERRCODE='42501';
  END IF;
 END LOOP;
 RETURN NEW;
END;$function$
;
REVOKE ALL ON FUNCTION public.award_achievement(uuid,text),public.check_profile_achievements(),public.account_deletion_subject_write_guard()FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.award_achievement(uuid,text)TO service_role;
REVOKE ALL ON FUNCTION public.account_deletion_access_allowed()FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_deletion_access_allowed()TO anon,authenticated,service_role;
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
CREATE TRIGGER trigger_profile_achievements AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.check_profile_achievements();
CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public.user_achievements FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard('user_id');
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Synthetic self select" ON public.profiles FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Synthetic self update" ON public.profiles FOR UPDATE TO authenticated USING(user_id=auth.uid())WITH CHECK(user_id=auth.uid());
CREATE POLICY "Actual deletion helper boundary" ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated USING(public.account_deletion_access_allowed())WITH CHECK(public.account_deletion_access_allowed());
-- No permissive INSERT policy: direct table INSERT must remain denied.
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid(),auth.role()TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.profiles TO authenticated;
INSERT INTO public.organizations VALUES('aaaaaaaa-0000-4000-8000-000000000001');
INSERT INTO public.companies VALUES('aaaaaaaa-0000-4000-8000-000000000002');
INSERT INTO public.student_groups(id,organization_id)VALUES('aaaaaaaa-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000001');
INSERT INTO auth.users(id,email,banned_until,deleted_at)VALUES
 ('11111111-1111-4111-8111-111111111111','native-self-1@example.invalid',NULL,NULL),
 ('22222222-2222-4222-8222-222222222222','native-existing-2@example.invalid',NULL,NULL),
 ('33333333-3333-4333-8333-333333333333','native-banned-3@example.invalid','2099-01-01T00:00:00Z',NULL),
 ('44444444-4444-4444-8444-444444444444','native-deleted-4@example.invalid',NULL,'2020-01-01T00:00:00Z'),
 ('55555555-5555-4555-8555-555555555555','native-revoked-5@example.invalid',NULL,NULL),
 ('66666666-6666-4666-8666-666666666666','native-blocked-6@example.invalid',NULL,NULL),
 ('77777777-7777-4777-8777-777777777777','native-archived-7@example.invalid',NULL,NULL),
 ('88888888-8888-4888-8888-888888888888','native-old-award-8@example.invalid',NULL,NULL);
INSERT INTO public.user_roles VALUES('11111111-1111-4111-8111-111111111111','admin'),('22222222-2222-4222-8222-222222222222','student');
INSERT INTO public.org_staff VALUES('22222222-2222-4222-8222-222222222222','aaaaaaaa-0000-4000-8000-000000000001','viewer');
INSERT INTO public.admin_staff VALUES('11111111-1111-4111-8111-111111111111','viewer',NULL);
INSERT INTO public.account_deletion_revocations VALUES('55555555-5555-4555-8555-555555555555');
INSERT INTO public.achievements(code)VALUES('first_step');
INSERT INTO public.profiles(user_id,email,full_name,phone,organization_id,company_id,student_group_id)VALUES
 ('22222222-2222-4222-8222-222222222222','saved@example.invalid','Preserved existing','synthetic-old-phone','aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000003');
INSERT INTO public.profiles(user_id,full_name,blocked_at)VALUES('66666666-6666-4666-8666-666666666666','Blocked preserved','2020-01-01T00:00:00Z');
INSERT INTO public.profiles(user_id,full_name,archived_at)VALUES('77777777-7777-4777-8777-777777777777','Archived preserved','2020-01-01T00:00:00Z');
INSERT INTO public.user_achievements(user_id,achievement_id,is_seen)SELECT'88888888-8888-4888-8888-888888888888',id,true FROM public.achievements WHERE code='first_step';
INSERT INTO public.qa_retained_results VALUES(1,73,'{"historical":"synthetic-unchanged"}');
COMMIT;
