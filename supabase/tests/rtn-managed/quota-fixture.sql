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
