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
