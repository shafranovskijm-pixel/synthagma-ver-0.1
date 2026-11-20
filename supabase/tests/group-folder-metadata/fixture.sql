-- Synthetic authority adapters in an empty, local PostgreSQL only.
-- They test real SQL roles/RLS/invoker behavior, not production OAuth or policy equivalence.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('qa.actor',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;

CREATE TABLE public.student_groups(id uuid PRIMARY KEY,organization_id uuid NOT NULL,course_id uuid);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid NOT NULL,
 student_group_id uuid,full_name text,email text,login text,phone text,archived_at timestamptz,
 department text,generated_password text,private_notes text);
CREATE TABLE public.student_group_memberships(organization_id uuid NOT NULL,group_id uuid NOT NULL,
 user_id uuid NOT NULL,PRIMARY KEY(group_id,user_id));
CREATE TABLE public.courses(id uuid PRIMARY KEY,organization_id uuid NOT NULL,title text,content text);
CREATE TABLE public.enrollments(id uuid PRIMARY KEY,user_id uuid,course_id uuid,status text,
 progress integer,completed_at timestamptz,private_notes text,caller_visible boolean DEFAULT true);
CREATE TABLE public.student_identity_documents(id uuid PRIMARY KEY,user_id uuid,organization_id uuid,
 type text,file_path text,caller_visible boolean DEFAULT true);
CREATE TABLE public.org_contracts(id uuid PRIMARY KEY,organization_id uuid,student_user_id uuid,
 student_group_id uuid,private_notes text,caller_visible boolean DEFAULT true);
CREATE TABLE public.test_attempts(id uuid PRIMARY KEY,user_id uuid,score integer,answers jsonb,
 caller_visible boolean DEFAULT true);
CREATE TABLE public.student_frdo_data(id uuid PRIMARY KEY,user_id uuid,organization_id uuid,
 last_name text,first_name text,middle_name text,birth_date date,gender text,snils text,
 citizenship_code text,education_level text,passport_series text,passport_number text,private_notes text,UNIQUE(user_id,organization_id));
CREATE TABLE public.lab_revocations(user_id uuid PRIMARY KEY);
CREATE TABLE public.lab_holds(organization_id uuid PRIMARY KEY);

CREATE FUNCTION public.lab_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=pg_catalog AS $$
 SELECT auth.uid() IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.lab_revocations WHERE user_id=auth.uid())
 AND (coalesce(current_setting('qa.kind',true),'')='admin'
   OR NOT EXISTS(SELECT 1 FROM public.lab_holds WHERE organization_id=nullif(current_setting('qa.org',true),'')::uuid))
$$;
CREATE FUNCTION public.lab_org_allowed(o uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=pg_catalog AS $$
 SELECT public.lab_ready() AND (coalesce(current_setting('qa.kind',true),'')='admin'
  OR o=nullif(current_setting('qa.org',true),'')::uuid)
$$;
CREATE FUNCTION public.lab_person_allowed(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=pg_catalog AS $$
 SELECT public.lab_ready()
 AND (nullif(current_setting('qa.subject',true),'') IS NULL OR u::text=current_setting('qa.subject',true))
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=u AND public.lab_org_allowed(p.organization_id)
  AND (nullif(current_setting('qa.group',true),'') IS NULL
   OR p.student_group_id::text=current_setting('qa.group',true)
   OR EXISTS(SELECT 1 FROM public.student_group_memberships m WHERE m.user_id=u
     AND m.organization_id=p.organization_id AND m.group_id::text=current_setting('qa.group',true))))
$$;
CREATE FUNCTION public.lab_enrollment_allowed(u uuid) RETURNS boolean LANGUAGE plpgsql STABLE
 SET search_path=pg_catalog AS $$
BEGIN
 IF current_setting('qa.enrollment_error',true)='cancel' THEN
  RAISE EXCEPTION 'synthetic cancellation' USING ERRCODE='57014';
 END IF;
 IF current_setting('qa.enrollment_error',true)='permission' THEN
  RAISE EXCEPTION 'synthetic enrollment denial' USING ERRCODE='42501';
 END IF;
 RETURN public.lab_person_allowed(u);
END;
$$;
CREATE FUNCTION public.lab_identity_allowed() RETURNS boolean LANGUAGE plpgsql STABLE
 SET search_path=pg_catalog AS $$
BEGIN
 IF current_setting('qa.identity_error',true)='dependency' THEN
  RAISE EXCEPTION 'synthetic broken dependency' USING ERRCODE='42883';
 END IF;
 RETURN public.lab_ready();
END;
$$;

ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_identity_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_frdo_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY lab_groups ON public.student_groups FOR SELECT TO authenticated USING(
 public.lab_org_allowed(organization_id)
 AND (nullif(current_setting('qa.group',true),'') IS NULL OR id::text=current_setting('qa.group',true))
 AND id::text IS DISTINCT FROM nullif(current_setting('qa.hidden_group',true),'')
);
CREATE POLICY lab_profiles ON public.profiles FOR SELECT TO authenticated USING(public.lab_person_allowed(user_id));
CREATE POLICY lab_members ON public.student_group_memberships FOR SELECT TO authenticated USING(
 public.lab_org_allowed(organization_id) AND public.lab_person_allowed(user_id)
 AND (nullif(current_setting('qa.group',true),'') IS NULL OR group_id::text=current_setting('qa.group',true))
);
CREATE POLICY lab_courses ON public.courses FOR SELECT TO authenticated USING(public.lab_org_allowed(organization_id)
 AND id::text IS DISTINCT FROM nullif(current_setting('qa.hidden_course',true),''));
CREATE POLICY lab_enrollments ON public.enrollments FOR SELECT TO authenticated
 USING(caller_visible AND public.lab_enrollment_allowed(user_id));
CREATE POLICY lab_identity ON public.student_identity_documents FOR SELECT TO authenticated USING(
 caller_visible AND public.lab_identity_allowed()
 AND public.lab_org_allowed(organization_id) AND public.lab_person_allowed(user_id)
);
CREATE POLICY lab_contracts ON public.org_contracts FOR SELECT TO authenticated USING(
 caller_visible AND public.lab_org_allowed(organization_id)
);
CREATE POLICY lab_attempts ON public.test_attempts FOR SELECT TO authenticated
 USING(caller_visible AND public.lab_person_allowed(user_id));
CREATE POLICY lab_frdo ON public.student_frdo_data FOR SELECT TO authenticated
 USING(public.lab_org_allowed(organization_id) AND public.lab_person_allowed(user_id));

CREATE VIEW public.student_group_memberships_effective WITH(security_invoker=true) AS
 SELECT p.organization_id,p.student_group_id AS group_id,p.user_id
 FROM public.profiles p JOIN public.student_groups g ON g.id=p.student_group_id AND g.organization_id=p.organization_id
 UNION SELECT m.organization_id,m.group_id,m.user_id FROM public.student_group_memberships m;
CREATE VIEW public.student_group_profiles_effective WITH(security_invoker=true) AS
 SELECT p.*,m.group_id FROM public.profiles p JOIN public.student_group_memberships_effective m
 ON m.user_id=p.user_id AND m.organization_id=p.organization_id;
GRANT SELECT ON public.student_groups,public.profiles,public.student_group_memberships,public.courses,
 public.enrollments,public.student_identity_documents,public.org_contracts,public.test_attempts,
 public.student_frdo_data,public.student_group_memberships_effective,public.student_group_profiles_effective
 TO authenticated;
