-- Monthly assignments are distinct learners assigned a course in Europe/Moscow.
-- Personal files remain unlimited. Historic intake counters and postpaid billing
-- events are deliberately not rewritten. All mutations below share one transaction.
BEGIN;

DO $preflight$
DECLARE p record;
BEGIN
  FOR p IN SELECT * FROM (VALUES
    ('get_organization_student_capacity(uuid,integer)', '8b7ec7c051287eec18aadf6e578ee897'),
    ('create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text)', '4ee07dd21d2d5d06e92285f902f5b39c'),
    ('account_deletion_personal_row_counts(uuid)', '539f7a460416d7a410003b21605e16b7'),
    ('account_deletion_erase_data(uuid,text)', 'e152cd57f8da4aa323c57e6130c60aff')
  ) x(signature, source_md5) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||p.signature) AND md5(prosrc)=p.source_md5) THEN
      RAISE EXCEPTION 'Monthly assignment baseline changed: %',p.signature;
    END IF;
  END LOOP;
  IF to_regclass('public.organization_monthly_course_usage') IS NOT NULL
    OR to_regclass('public.organization_monthly_student_assignments') IS NOT NULL
    OR to_regclass('public.organization_monthly_training_completions') IS NOT NULL THEN
    RAISE EXCEPTION 'Monthly assignment objects already exist; inspect migration history';
  END IF;
END;$preflight$;

-- Private counters are authoritative, including after privacy erasure. Keeping
-- them separate avoids the legacy organization_usage admin-write/reset surface.
CREATE TABLE public.organization_monthly_course_usage (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month_start date NOT NULL CHECK (extract(day FROM month_start)=1),
  assigned_students integer NOT NULL DEFAULT 0 CHECK (assigned_students>=0),
  completed_trainings integer NOT NULL DEFAULT 0 CHECK (completed_trainings>=0),
  PRIMARY KEY (organization_id,month_start)
);
CREATE TABLE public.organization_monthly_student_assignments (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month_start date NOT NULL CHECK (extract(day FROM month_start)=1),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_assigned_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('assignment','enrollment_history')),
  PRIMARY KEY (organization_id,month_start,user_id)
);
CREATE INDEX organization_monthly_student_assignments_user_idx
  ON public.organization_monthly_student_assignments(user_id);
CREATE TABLE public.organization_monthly_training_completions (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month_start date NOT NULL CHECK (extract(day FROM month_start)=1),
  enrollment_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_completed_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('completion','existing_completion')),
  PRIMARY KEY (organization_id,month_start,enrollment_id)
);
CREATE INDEX organization_monthly_training_completions_user_idx
  ON public.organization_monthly_training_completions(user_id);
ALTER TABLE public.organization_monthly_course_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_monthly_student_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_monthly_training_completions ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.organization_monthly_course_usage IS
  'Owner-only anonymous monthly quota counters. Never decrement on enrollment/course/profile deletion or privacy erasure.';
COMMENT ON TABLE public.organization_monthly_student_assignments IS
  'Owner-only deduplication of unique learners assigned a course in a Moscow calendar month; personal references are erased by account deletion.';
COMMENT ON TABLE public.organization_monthly_training_completions IS
  'Owner-only deduplication of completed enrollment records per Moscow month. No course/enrollment FK: deleting learning data does not refund usage.';

CREATE FUNCTION public._organization_monthly_course_limits(p_organization_id uuid)
RETURNS TABLE(subscription_plan text,max_students integer,max_trainings integer,student_limit_source text,training_limit_source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $limits$
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
END;$limits$;

-- AFTER rather than BEFORE avoids charging rejected INSERTs and ON CONFLICT
-- DO NOTHING. All enrollment paths (RPC, Edge, bulk and REST) pass this gate.
-- Actual study, first started_at and automatic completed->active recalculation
-- do not constitute a new assignment. Extending access is a new assignment.
CREATE FUNCTION public.enforce_organization_monthly_course_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $quota$
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
END;$quota$;

-- The migration holds the enrollment write lock while backfilling and installing
-- the gate; a concurrent assignment cannot fall between these operations.
LOCK TABLE public.enrollments IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.organization_monthly_student_assignments
  (organization_id,month_start,user_id,first_assigned_at,source)
SELECT c.organization_id,date_trunc('month',h.created_at AT TIME ZONE 'Europe/Moscow')::date,h.user_id,
  min(h.created_at),'enrollment_history'
FROM public.enrollment_history h JOIN public.courses c ON c.id=h.course_id
JOIN auth.users u ON u.id=h.user_id
WHERE h.action='enrolled' AND c.organization_id IS NOT NULL
  AND h.created_at>=date_trunc('month',statement_timestamp() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'
  AND h.created_at<=statement_timestamp() AND public.is_student_profile(h.user_id,c.organization_id)
GROUP BY c.organization_id,date_trunc('month',h.created_at AT TIME ZONE 'Europe/Moscow')::date,h.user_id
ON CONFLICT DO NOTHING;
INSERT INTO public.organization_monthly_training_completions
  (organization_id,month_start,enrollment_id,user_id,first_completed_at,source)
SELECT c.organization_id,date_trunc('month',e.completed_at AT TIME ZONE 'Europe/Moscow')::date,
  e.id,e.user_id,e.completed_at,'existing_completion'
FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id JOIN auth.users u ON u.id=e.user_id
WHERE e.status='completed' AND c.organization_id IS NOT NULL
  AND e.completed_at>=date_trunc('month',statement_timestamp() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'
  AND e.completed_at<=statement_timestamp() AND public.is_student_profile(e.user_id,c.organization_id)
ON CONFLICT DO NOTHING;
INSERT INTO public.organization_monthly_course_usage(organization_id,month_start,assigned_students,completed_trainings)
SELECT coalesce(a.organization_id,t.organization_id),coalesce(a.month_start,t.month_start),coalesce(a.n,0),coalesce(t.n,0)
FROM (SELECT organization_id,month_start,count(*)::integer n FROM public.organization_monthly_student_assignments GROUP BY 1,2) a
FULL JOIN (SELECT organization_id,month_start,count(*)::integer n FROM public.organization_monthly_training_completions GROUP BY 1,2) t USING(organization_id,month_start)
ON CONFLICT(organization_id,month_start) DO UPDATE SET
  assigned_students=greatest(public.organization_monthly_course_usage.assigned_students,excluded.assigned_students),
  completed_trainings=greatest(public.organization_monthly_course_usage.completed_trainings,excluded.completed_trainings);
CREATE TRIGGER enforce_organization_monthly_course_quota
AFTER INSERT OR UPDATE ON public.enrollments FOR EACH ROW
EXECUTE FUNCTION public.enforce_organization_monthly_course_quota();

-- Keep the public student-capacity ABI, authorization and ACL unchanged. Only
-- replace plan resolution/read source after pinning the live function body.
DO $capacity$
DECLARE d text;start_at integer;end_at integer;
BEGIN
  SELECT pg_get_functiondef('public.get_organization_student_capacity(uuid,integer)'::regprocedure) INTO d;
  start_at:=strpos(d,'  SELECT o.subscription_plan, o.custom_max_students');
  end_at:=strpos(d,'  current_students := v_current;');
  IF start_at=0 OR end_at<=start_at THEN RAISE EXCEPTION 'Capacity patch anchor changed';END IF;
  d:=replace(d,$old$(date_trunc('month', timezone('Europe/Moscow', now())))::date$old$,$new$date_trunc('month',statement_timestamp() AT TIME ZONE 'Europe/Moscow')::date$new$);
  start_at:=strpos(d,'  SELECT o.subscription_plan, o.custom_max_students');
  end_at:=strpos(d,'  current_students := v_current;');
  d:=substr(d,1,start_at-1)||$replacement$
  SELECT l.subscription_plan,l.max_students,l.student_limit_source INTO v_plan,v_max,v_source
  FROM public._organization_monthly_course_limits(p_organization_id) l;
  SELECT coalesce(u.assigned_students,0) INTO v_current
  FROM public.organization_monthly_course_usage u
  WHERE u.organization_id=p_organization_id AND u.month_start=v_month;
  v_current:=coalesce(v_current,0);

$replacement$||substr(d,end_at);
  EXECUTE d;
END;$capacity$;

CREATE FUNCTION public.get_organization_training_capacity(p_organization_id uuid,p_requested_count integer DEFAULT 1)
RETURNS TABLE(current_trainings integer,max_trainings integer,is_unlimited boolean,can_complete boolean,remaining_trainings integer,subscription_plan text,limit_source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $training$
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
END;$training$;

CREATE OR REPLACE FUNCTION public.create_student_profile_with_capacity(p_organization_id uuid,p_user_id uuid,p_full_name text,p_email text,p_login text,p_generated_password text,p_company_id uuid,p_student_group_id uuid,p_region text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $profile$
DECLARE
  v_limits record;v_current integer:=0;v_existing_org uuid;v_existing_archived timestamptz;
  v_existing boolean:=false;v_group_confirmed boolean:=true;v_detail text;
  v_month date:=date_trunc('month',statement_timestamp() AT TIME ZONE 'Europe/Moscow')::date;
  v_jwt_role text:=coalesce(current_setting('request.jwt.claim.role',true),current_setting('request.jwt.claims',true)::jsonb->>'role');
BEGIN
  IF v_jwt_role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501';END IF;
  IF p_organization_id IS NULL OR p_user_id IS NULL THEN RAISE EXCEPTION 'organization_id and user_id are required';END IF;
  -- Match the existing account-deletion subject lock before the org quota lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,42007));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,42));
  SELECT * INTO v_limits FROM public._organization_monthly_course_limits(p_organization_id);
  SELECT p.organization_id,p.archived_at INTO v_existing_org,v_existing_archived
    FROM public.profiles p WHERE p.user_id=p_user_id FOR UPDATE;
  IF v_existing_org IS NOT NULL AND v_existing_org<>p_organization_id THEN
    RETURN jsonb_build_object('success',false,'code','PROFILE_IN_OTHER_ORG','message','Профиль пользователя уже привязан к другой организации.',
      'max_students',v_limits.max_students,'is_unlimited',v_limits.max_students=-1,'limit_source',v_limits.student_limit_source);
  END IF;
  SELECT coalesce(u.assigned_students,0) INTO v_current FROM public.organization_monthly_course_usage u
    WHERE u.organization_id=p_organization_id AND u.month_start=v_month;
  v_current:=coalesce(v_current,0);
  v_existing:=v_existing_org=p_organization_id;
  IF v_existing AND v_existing_archived IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','STUDENT_ARCHIVED','message','Ученик находится в архиве. Восстановите его из архива вручную.',
      'current_students',v_current,'max_students',v_limits.max_students,'is_unlimited',v_limits.max_students=-1,'limit_source',v_limits.student_limit_source);
  END IF;
  IF v_existing THEN
    UPDATE public.profiles SET full_name=coalesce(nullif(p_full_name,''),full_name),email=coalesce(nullif(p_email,''),email),
      company_id=coalesce(p_company_id,company_id),region=coalesce(nullif(p_region,''),region)
      WHERE user_id=p_user_id;
  ELSE
    INSERT INTO public.profiles(user_id,full_name,email,login,generated_password,organization_id,company_id,region)
    VALUES(p_user_id,p_full_name,nullif(p_email,''),nullif(p_login,''),nullif(p_generated_password,''),p_organization_id,p_company_id,nullif(p_region,''))
    ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name,email=coalesce(excluded.email,public.profiles.email),
      login=coalesce(excluded.login,public.profiles.login),generated_password=coalesce(excluded.generated_password,public.profiles.generated_password),
      organization_id=excluded.organization_id,company_id=coalesce(excluded.company_id,public.profiles.company_id),region=coalesce(excluded.region,public.profiles.region)
    WHERE public.profiles.organization_id IS NULL OR public.profiles.organization_id=p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'profile organization changed during registration' USING ERRCODE='40001';END IF;
  END IF;
  INSERT INTO public.user_roles(user_id,role) VALUES(p_user_id,'student'::public.app_role) ON CONFLICT(user_id) DO NOTHING;
  -- Group membership may automatically assign a course. A full course quota
  -- rolls back only that requested membership, never the unlimited personal file.
  IF p_student_group_id IS NOT NULL THEN
    BEGIN
      UPDATE public.profiles SET student_group_id=p_student_group_id WHERE user_id=p_user_id;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;
      IF v_detail IS DISTINCT FROM 'STUDENT_ASSIGNMENT_LIMIT_EXCEEDED' THEN RAISE;END IF;
      v_group_confirmed:=false;
    END;
  END IF;
  SELECT coalesce(u.assigned_students,0) INTO v_current FROM public.organization_monthly_course_usage u
    WHERE u.organization_id=p_organization_id AND u.month_start=v_month;
  RETURN jsonb_build_object('success',true,'is_existing',coalesce(v_existing,false),'profile_persisted',true,
    'group_assignment_confirmed',v_group_confirmed,
    'group_assignment_error',CASE WHEN v_group_confirmed THEN NULL ELSE 'STUDENT_ASSIGNMENT_LIMIT_EXCEEDED' END,
    'current_students',coalesce(v_current,0),'max_students',v_limits.max_students,'is_unlimited',v_limits.max_students=-1,'limit_source',v_limits.student_limit_source);
END;$profile$;

-- Erase deduplication references along with other personal learning data.
-- Anonymous monthly totals remain, so erasure does not create a tariff refund.
DO $privacy$
DECLARE d text;anchor text;
BEGIN
  SELECT pg_get_functiondef('public.account_deletion_personal_row_counts(uuid)'::regprocedure) INTO d;
  anchor:=$anchor$  ('enrollment_history','user_id'),$anchor$;
  IF (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Privacy count patch anchor changed';END IF;
  d:=replace(d,anchor,$addition$  ('organization_monthly_student_assignments','user_id'),
  ('organization_monthly_training_completions','user_id'),
$addition$||anchor);EXECUTE d;
  SELECT pg_get_functiondef('public.account_deletion_erase_data(uuid,text)'::regprocedure) INTO d;
  anchor:=' DELETE FROM public.enrollment_history WHERE user_id=u;';
  IF (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Privacy erasure patch anchor changed';END IF;
  d:=replace(d,anchor,anchor||$addition$
 DELETE FROM public.organization_monthly_student_assignments WHERE user_id=u;
 DELETE FROM public.organization_monthly_training_completions WHERE user_id=u;$addition$);EXECUTE d;
END;$privacy$;

-- New owner-only objects must remain private even if a project's default ACL
-- grants an auxiliary execution role. Existing public RPC ACLs are untouched.
DO $acl$
DECLARE r record;g record;
BEGIN
  FOR r IN SELECT c.oid,c.relname,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN('organization_monthly_course_usage','organization_monthly_student_assignments','organization_monthly_training_completions') LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',r.relname);
    FOR g IN SELECT DISTINCT grantee FROM aclexplode((SELECT relacl FROM pg_class WHERE oid=r.oid)) WHERE grantee<>r.relowner AND grantee<>0 LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',r.relname,pg_get_userbyid(g.grantee));
    END LOOP;
  END LOOP;
  FOR r IN SELECT p.oid,p.proowner,p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN('_organization_monthly_course_limits','enforce_organization_monthly_course_quota','get_organization_training_capacity') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',r.signature);
    FOR g IN SELECT DISTINCT grantee FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid=r.oid)) WHERE grantee<>r.proowner AND grantee<>0 LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',r.signature,pg_get_userbyid(g.grantee));
    END LOOP;
  END LOOP;
END;$acl$;
GRANT EXECUTE ON FUNCTION public.get_organization_training_capacity(uuid,integer) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
