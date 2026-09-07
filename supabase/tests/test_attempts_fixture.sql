\set ON_ERROR_STOP on
-- Minimal local schema for real PostgreSQL behavior tests; no production data.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE TABLE public.organizations(id uuid PRIMARY KEY, name text);
CREATE TABLE public.profiles(id uuid UNIQUE DEFAULT gen_random_uuid(), user_id uuid PRIMARY KEY, organization_id uuid, role text, blocked_at timestamptz, full_name text, email text, login text, archived_at timestamptz);
CREATE TABLE public.user_roles(user_id uuid, role text);
CREATE TABLE public.org_staff(user_id uuid, organization_id uuid, expires_at timestamptz);
CREATE TABLE public.courses(id uuid PRIMARY KEY, organization_id uuid, title text, is_published boolean);
CREATE TABLE public.lessons(id uuid PRIMARY KEY, course_id uuid REFERENCES public.courses(id), title text, type text,
  order_index integer DEFAULT 0, test_max_attempts integer, test_passing_score integer DEFAULT 60,
  test_questions_to_show integer, test_show_answers boolean DEFAULT true);
CREATE TABLE public.enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, course_id uuid REFERENCES public.courses(id),
  status text DEFAULT 'active', progress integer DEFAULT 0, time_spent integer DEFAULT 0, started_at timestamptz DEFAULT now(),
  completed_at timestamptz, expires_at timestamptz, UNIQUE(user_id,course_id));
CREATE TABLE public.lesson_progress(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, lesson_id uuid REFERENCES public.lessons(id),
  completed boolean DEFAULT false, completed_at timestamptz, time_spent integer DEFAULT 0, UNIQUE(user_id,lesson_id));
CREATE TABLE public.test_questions(id uuid PRIMARY KEY, lesson_id uuid REFERENCES public.lessons(id), question text, options jsonb,
  correct_answer integer, order_index integer DEFAULT 0, explanation text, image_url text, is_bank_question boolean DEFAULT true);
CREATE TABLE public.test_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, lesson_id uuid REFERENCES public.lessons(id),
  score integer NOT NULL DEFAULT 0, max_score integer NOT NULL DEFAULT 0, answers jsonb NOT NULL DEFAULT '{}',
  completed_at timestamptz NOT NULL DEFAULT now(), shown_question_ids jsonb DEFAULT '[]');
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own test attempts" ON public.test_attempts FOR ALL USING (user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
CREATE FUNCTION public.can_access_organization(p_org uuid, p_permission text DEFAULT 'courses.read') RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.organization_id=p_org AND p.role='staff')
$$;
CREATE FUNCTION public.can_access_course(p_course uuid, p_permission text DEFAULT 'courses.read') RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS (SELECT 1 FROM public.courses c WHERE c.id=p_course AND public.can_access_organization(c.organization_id,p_permission))
$$;
CREATE FUNCTION public.can_access_lesson(p_lesson uuid, p_permission text DEFAULT 'courses.read') RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id=p_lesson AND public.can_access_course(l.course_id,p_permission))
$$;
CREATE FUNCTION public.can_access_course_as_learner(p_course uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.enrollments e
 JOIN public.courses c ON c.id=e.course_id JOIN public.profiles p ON p.user_id=e.user_id AND p.organization_id=c.organization_id
 WHERE e.user_id=auth.uid() AND e.course_id=p_course AND e.status IN ('active','completed')
 AND (e.expires_at IS NULL OR e.expires_at>now() OR e.status='completed'))
$$;
CREATE FUNCTION public.test_assert(p_condition boolean, p_description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', p_description; END IF;
 RAISE NOTICE 'PASS: %', p_description;
END;
$$;
INSERT INTO public.organizations VALUES ('10000000-0000-0000-0000-000000000001','Org A'),('10000000-0000-0000-0000-000000000002','Org B');
INSERT INTO public.profiles(user_id,organization_id,role,blocked_at) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','student',null),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','student',null),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','staff',null),
 ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','staff',null);
INSERT INTO public.courses VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Course A',true),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Course B',true);
INSERT INTO public.lessons(id,course_id,title,type,test_passing_score) VALUES
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Test A','test',60),
 ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','Test B','test',60);
INSERT INTO public.enrollments(user_id,course_id) VALUES
 ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002');
INSERT INTO public.test_questions(id,lesson_id,question,options,correct_answer,explanation) VALUES
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Original question','["Correct","Incorrect"]',0,'Original explanation'),
 ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','Second question','["Incorrect","Correct"]',1,'Second explanation'),
 ('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000002','Other tenant','["Correct","Incorrect"]',0,'Other explanation');