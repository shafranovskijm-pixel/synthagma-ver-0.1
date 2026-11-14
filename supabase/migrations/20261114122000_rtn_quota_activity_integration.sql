-- Included managed training shares the existing monthly quotas. This migration
-- does not modify monetary collectors, prices, agreements, invoices or roles.
BEGIN;
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
