-- Contract-based monthly postpayment. No organization is enrolled by this
-- migration; no invoice, charge, access grant or historical event is created.
BEGIN;
DO $preflight$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY['public.has_role(public.app_role,uuid)','public.can_access_organization(uuid,text)',
    'public.account_deletion_access_allowed()','public.can_access_course_as_learner(uuid)'] LOOP
    IF to_regprocedure(item) IS NULL THEN RAISE EXCEPTION 'Postpaid prerequisite missing: %',item; END IF;
  END LOOP;
  FOREACH item IN ARRAY ARRAY['organizations','profiles','account_deletion_revocations','courses','lessons','enrollments',
    'lesson_progress','test_attempt_sessions','test_attempts','homework_submissions','org_crm_clients','org_crm_deals',
    'org_crm_tasks','org_crm_activities','webinars','subscription_invoices','admin_notifications'] LOOP
    IF to_regclass('public.'||item) IS NULL THEN RAISE EXCEPTION 'Postpaid prerequisite table missing: %',item; END IF;
  END LOOP;
END $preflight$;

CREATE FUNCTION public.postpaid_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.has_role('admin'::public.app_role,auth.uid())
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid());
$fn$;
CREATE FUNCTION public.postpaid_require_admin() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT public.postpaid_is_admin() THEN RAISE EXCEPTION 'Active platform administrator required' USING ERRCODE='42501'; END IF;
END $fn$;

CREATE TABLE public.organization_billing_agreements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id),
 billing_mode text NOT NULL DEFAULT 'postpaid' CHECK(billing_mode='postpaid'),
 effective_from date NOT NULL, effective_to date CHECK(effective_to>effective_from),
 contract_reference text NOT NULL CHECK(length(btrim(contract_reference)) BETWEEN 3 AND 500),
 customer_confirmation text NOT NULL CHECK(length(btrim(customer_confirmation)) BETWEEN 10 AND 4000),
 terms_version text NOT NULL DEFAULT '59-09-26-v1' CHECK(terms_version='59-09-26-v1'),
 contract_through date NOT NULL DEFAULT '2026-12-31', annual_renewal boolean NOT NULL DEFAULT true,
 billing_timezone text NOT NULL DEFAULT 'Europe/Moscow' CHECK(billing_timezone='Europe/Moscow'),
 recording_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.postpaid_feature_confirmations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 feature text NOT NULL CHECK(feature IN('crm','webinar','videoserviceplus','frdoplus')),
 notified_at timestamptz NOT NULL, confirmed_at timestamptz NOT NULL CHECK(confirmed_at>=notified_at),
 effective_to timestamptz CHECK(effective_to>confirmed_at), evidence text NOT NULL CHECK(length(btrim(evidence)) BETWEEN 10 AND 4000),
 recorded_by uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX postpaid_feature_confirmation_lookup ON public.postpaid_feature_confirmations(organization_id,feature,confirmed_at);
-- Deliberately no learner/course FK: archive, reset and deletion cannot erase
-- the fact of prior use. Only opaque identifiers and evidence references remain.
CREATE TABLE public.postpaid_usage_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 feature text NOT NULL CHECK(feature IN('study','crm','webinar','videoserviceplus','frdoplus')),
 learner_id uuid, course_id uuid, occurred_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 source_table text NOT NULL, source_key text NOT NULL, month_start date NOT NULL,
 evidence text, bytes bigint, recorded_by uuid,
 CHECK((feature='study' AND learner_id IS NOT NULL AND course_id IS NOT NULL) OR feature<>'study'),
 UNIQUE(organization_id,source_table,source_key,month_start)
);
CREATE INDEX postpaid_usage_period ON public.postpaid_usage_events(organization_id,occurred_at);
CREATE TABLE public.postpaid_billing_statements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 agreement_id uuid NOT NULL REFERENCES public.organization_billing_agreements(id),
 period_start date NOT NULL, period_end date NOT NULL CHECK(period_end>period_start), revision integer NOT NULL CHECK(revision>0),
 status text NOT NULL DEFAULT 'needs_review' CHECK(status IN('needs_review','approved','invoiced','superseded')),
 snapshot jsonb NOT NULL, source_hash text NOT NULL, plan text NOT NULL CHECK(plan IN('start','standard','professional')),
 amount numeric(12,2) NOT NULL CHECK(amount>0), reviewed_courses integer CHECK(reviewed_courses>=0), reviewed_learners integer CHECK(reviewed_learners>=0),
 review_note text, reviewed_by uuid, reviewed_at timestamptz, invoice_id uuid UNIQUE,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,period_start,revision)
);
CREATE UNIQUE INDEX postpaid_statement_one_current ON public.postpaid_billing_statements(organization_id,period_start) WHERE status<>'superseded';

ALTER TABLE public.subscription_invoices ADD COLUMN billing_kind text NOT NULL DEFAULT 'prepaid' CHECK(billing_kind IN('prepaid','postpaid')),
 ADD COLUMN service_period_start date, ADD COLUMN service_period_end date,
 ADD COLUMN postpaid_statement_id uuid UNIQUE REFERENCES public.postpaid_billing_statements(id);
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoice_postpaid_period CHECK(
 (billing_kind='prepaid' AND postpaid_statement_id IS NULL AND service_period_start IS NULL AND service_period_end IS NULL)
 OR (billing_kind='postpaid' AND postpaid_statement_id IS NOT NULL AND service_period_start IS NOT NULL AND service_period_end>service_period_start));
ALTER TABLE public.postpaid_billing_statements ADD CONSTRAINT postpaid_statement_invoice_fk FOREIGN KEY(invoice_id) REFERENCES public.subscription_invoices(id);

CREATE TABLE public.postpaid_invoice_write_tokens (
 transaction_id bigint NOT NULL, invoice_id uuid NOT NULL, operation text NOT NULL CHECK(operation IN('INSERT','UPDATE')),
 PRIMARY KEY(transaction_id,invoice_id,operation)
);
DO $policies$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['organization_billing_agreements','postpaid_feature_confirmations','postpaid_usage_events','postpaid_billing_statements','postpaid_invoice_write_tokens'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tab);
  IF tab<>'postpaid_invoice_write_tokens' THEN
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated,service_role',tab);
   EXECUTE format('CREATE POLICY postpaid_admin_read ON public.%I FOR SELECT TO authenticated USING(public.postpaid_is_admin())',tab);
  END IF;
 END LOOP;
END $policies$;

CREATE FUNCTION public.postpaid_immutable_record() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN RAISE EXCEPTION 'Postpaid usage and confirmation evidence are immutable' USING ERRCODE='42501'; END $fn$;
CREATE TRIGGER postpaid_event_immutable BEFORE UPDATE OR DELETE ON public.postpaid_usage_events FOR EACH ROW EXECUTE FUNCTION public.postpaid_immutable_record();
CREATE TRIGGER postpaid_confirmation_immutable BEFORE UPDATE OR DELETE ON public.postpaid_feature_confirmations FOR EACH ROW EXECUTE FUNCTION public.postpaid_immutable_record();
CREATE FUNCTION public.postpaid_statement_immutable_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
 IF TG_OP='DELETE' OR (NEW.id,NEW.organization_id,NEW.agreement_id,NEW.period_start,NEW.period_end,NEW.revision,NEW.snapshot,NEW.source_hash,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.agreement_id,OLD.period_start,OLD.period_end,OLD.revision,OLD.snapshot,OLD.source_hash,OLD.created_by,OLD.created_at)
 THEN RAISE EXCEPTION 'Postpaid statement snapshot is immutable' USING ERRCODE='42501'; END IF;
 IF OLD.status='invoiced' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'Issued statement is immutable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER postpaid_statement_snapshot_guard BEFORE UPDATE OR DELETE ON public.postpaid_billing_statements FOR EACH ROW EXECUTE FUNCTION public.postpaid_statement_immutable_snapshot();

CREATE FUNCTION public.has_active_postpaid_agreement(p_organization_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.postpaid_is_admin()
 AND (auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() OR NOT COALESCE(public.can_access_organization(p_organization_id,'settings.read'),false))
 THEN RAISE EXCEPTION 'Organization billing access required' USING ERRCODE='42501'; END IF;
 RETURN EXISTS(SELECT 1 FROM public.organization_billing_agreements WHERE organization_id=p_organization_id
  AND effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date AND (effective_to IS NULL OR effective_to>(now() AT TIME ZONE 'Europe/Moscow')::date));
END $fn$;

CREATE FUNCTION public.save_postpaid_agreement(p_organization_id uuid,p_effective_from date,p_contract_reference text,p_customer_confirmation text,p_effective_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.organization_billing_agreements%ROWTYPE; latest_end date;
BEGIN
 PERFORM public.postpaid_require_admin(); PERFORM pg_advisory_xact_lock(hashtextextended('postpaid:'||p_organization_id::text,0));
 IF p_effective_from IS NULL OR p_effective_from<>date_trunc('month',p_effective_from)::date OR p_effective_from<'2026-01-01' OR p_effective_from>'2100-01-01'
 OR length(btrim(COALESCE(p_contract_reference,''))) NOT BETWEEN 3 AND 500 OR length(btrim(COALESCE(p_customer_confirmation,''))) NOT BETWEEN 10 AND 4000
 OR p_effective_to<=p_effective_from THEN RAISE EXCEPTION 'Invalid postpaid agreement' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.organization_billing_agreements WHERE organization_id=p_organization_id FOR UPDATE;
 SELECT max(period_end) INTO latest_end FROM public.postpaid_billing_statements WHERE organization_id=p_organization_id AND status='invoiced';
 IF latest_end IS NOT NULL AND ((p_effective_from,p_contract_reference,p_customer_confirmation) IS DISTINCT FROM (r.effective_from,r.contract_reference,r.customer_confirmation)
 OR p_effective_to<latest_end) THEN RAISE EXCEPTION 'Issued periods prevent retrospective agreement changes'; END IF;
 INSERT INTO public.organization_billing_agreements(organization_id,effective_from,effective_to,contract_reference,customer_confirmation,created_by)
 VALUES(p_organization_id,p_effective_from,p_effective_to,btrim(p_contract_reference),btrim(p_customer_confirmation),auth.uid())
 ON CONFLICT(organization_id) DO UPDATE SET effective_from=EXCLUDED.effective_from,effective_to=EXCLUDED.effective_to,
 contract_reference=EXCLUDED.contract_reference,customer_confirmation=EXCLUDED.customer_confirmation,updated_at=clock_timestamp() RETURNING * INTO r;
 RETURN to_jsonb(r);
END $fn$;

CREATE FUNCTION public.postpaid_append_event(p_org uuid,p_feature text,p_learner uuid,p_course uuid,p_source text,p_key text,p_when timestamptz,p_evidence text DEFAULT NULL,p_bytes bigint DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE inserted integer;
BEGIN
 -- Platform-owned instructions (for example the welcome course) are not
 -- customer training. Check at capture time; later deletion/reclassification
 -- must not erase an already recorded legitimate training event.
 IF p_feature='study' AND NOT EXISTS(SELECT 1 FROM public.courses WHERE id=p_course AND organization_id=p_org AND system_key IS NULL) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organization_billing_agreements WHERE organization_id=p_org
 AND effective_from<=(p_when AT TIME ZONE 'Europe/Moscow')::date AND (effective_to IS NULL OR effective_to>(p_when AT TIME ZONE 'Europe/Moscow')::date)) THEN RETURN false; END IF;
 INSERT INTO public.postpaid_usage_events(organization_id,feature,learner_id,course_id,occurred_at,month_start,source_table,source_key,evidence,bytes,recorded_by)
 VALUES(p_org,p_feature,p_learner,p_course,p_when,date_trunc('month',p_when AT TIME ZONE 'Europe/Moscow')::date,p_source,p_key,p_evidence,p_bytes,auth.uid())
 ON CONFLICT(organization_id,source_table,source_key,month_start) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT; RETURN inserted>0;
END $fn$;

CREATE FUNCTION public.record_postpaid_lesson_activity(p_lesson_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE org uuid; course uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RAISE EXCEPTION 'Active learner required' USING ERRCODE='42501'; END IF;
 SELECT c.organization_id,c.id INTO org,course FROM public.lessons l JOIN public.courses c ON c.id=l.course_id
 JOIN public.profiles p ON p.user_id=auth.uid() AND p.organization_id=c.organization_id
 WHERE l.id=p_lesson_id AND EXISTS(SELECT 1 FROM public.enrollments e WHERE e.user_id=auth.uid() AND e.course_id=c.id)
 AND public.can_access_course_as_learner(c.id);
 IF org IS NULL THEN RAISE EXCEPTION 'Enrolled lesson access required' USING ERRCODE='42501'; END IF;
 RETURN public.postpaid_append_event(org,'study',auth.uid(),course,'lesson_open',p_lesson_id::text||':'||auth.uid()::text,clock_timestamp());
END $fn$;

CREATE FUNCTION public.capture_postpaid_study_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE n jsonb:=to_jsonb(NEW); o jsonb; learner uuid; course uuid; org uuid; meaningful boolean:=false;
BEGIN
 IF TG_OP='UPDATE' THEN o:=to_jsonb(OLD); ELSE o:='{}'::jsonb; END IF;
 learner:=COALESCE((n->>'user_id')::uuid,(n->>'student_id')::uuid);
 -- A teacher review, administrative import or backdated payload is not a
 -- learner interaction. Imported historical evidence is reviewed separately.
 IF auth.uid() IS NULL OR learner IS DISTINCT FROM auth.uid() OR NOT public.account_deletion_access_allowed() THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='lesson_progress' THEN
  meaningful:=(COALESCE((n->>'completed')::boolean,false) AND NOT COALESCE((o->>'completed')::boolean,false))
    OR COALESCE((n->>'time_spent')::numeric,0)>COALESCE((o->>'time_spent')::numeric,0)
    OR COALESCE((n->>'video_position')::numeric,0)>COALESCE((o->>'video_position')::numeric,0);
 ELSIF TG_TABLE_NAME='enrollments' THEN
  meaningful:=COALESCE((n->>'progress')::numeric,0)>COALESCE((o->>'progress')::numeric,0)
   OR COALESCE((n->>'time_spent')::numeric,0)>COALESCE((o->>'time_spent')::numeric,0)
   OR (n->>'status'='completed' AND COALESCE(o->>'status','')<>'completed');
 ELSIF TG_TABLE_NAME='homework_submissions' THEN
  meaningful:=TG_OP='INSERT' AND (length(btrim(COALESCE(n->>'content','')))>0 OR COALESCE(n->'attachments','[]'::jsonb)<>'[]'::jsonb);
 ELSE meaningful:=TG_OP='INSERT'; END IF;
 IF NOT meaningful THEN RETURN NEW; END IF;
 course:=(n->>'course_id')::uuid;
 IF course IS NULL THEN SELECT course_id INTO course FROM public.lessons WHERE id=(n->>'lesson_id')::uuid; END IF;
 SELECT c.organization_id INTO org FROM public.courses c JOIN public.profiles p ON p.organization_id=c.organization_id AND p.user_id=learner
 WHERE c.id=course AND EXISTS(SELECT 1 FROM public.enrollments e WHERE e.course_id=c.id AND e.user_id=learner) AND public.can_access_course_as_learner(c.id);
 IF org IS NOT NULL THEN PERFORM public.postpaid_append_event(org,'study',learner,course,TG_TABLE_NAME,n->>'id',clock_timestamp()); END IF;
 RETURN NEW;
END $fn$;
DO $triggers$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['lesson_progress','enrollments','test_attempt_sessions','test_attempts','homework_submissions'] LOOP
  EXECUTE format('CREATE TRIGGER capture_postpaid_study AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_postpaid_study_activity()',tab);
 END LOOP;
END $triggers$;

CREATE FUNCTION public.capture_postpaid_feature_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE n jsonb:=to_jsonb(NEW); o jsonb:='{}'::jsonb; feature text; org uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() OR public.postpaid_is_admin() THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN o:=to_jsonb(OLD); END IF;
 org:=(n->>'organization_id')::uuid;
 IF TG_TABLE_NAME='webinars' THEN
  IF n->>'status'<>'live' OR COALESCE(o->>'status','')='live' THEN RETURN NEW; END IF; feature:='webinar';
 ELSE
  IF TG_OP='UPDATE' AND (n-'updated_at')=(o-'updated_at') THEN RETURN NEW; END IF; feature:='crm';
 END IF;
 PERFORM public.postpaid_append_event(org,feature,NULL,NULL,TG_TABLE_NAME,n->>'id',clock_timestamp()); RETURN NEW;
END $fn$;
DO $triggers$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['org_crm_clients','org_crm_deals','org_crm_tasks','org_crm_activities','webinars'] LOOP
  EXECUTE format('CREATE TRIGGER capture_postpaid_feature AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_postpaid_feature_activity()',tab);
 END LOOP;
END $triggers$;

CREATE FUNCTION public.record_postpaid_feature_confirmation(p_organization_id uuid,p_feature text,p_notified_at timestamptz,p_confirmed_at timestamptz,p_evidence text,p_effective_to timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.postpaid_feature_confirmations%ROWTYPE;
BEGIN
 PERFORM public.postpaid_require_admin(); PERFORM pg_advisory_xact_lock(hashtextextended('postpaid:'||p_organization_id::text,0));
 IF p_confirmed_at>clock_timestamp() OR p_notified_at>p_confirmed_at OR NOT EXISTS(SELECT 1 FROM public.organization_billing_agreements WHERE organization_id=p_organization_id)
 THEN RAISE EXCEPTION 'Existing agreement and prior written confirmation required'; END IF;
 INSERT INTO public.postpaid_feature_confirmations(organization_id,feature,notified_at,confirmed_at,effective_to,evidence,recorded_by)
 VALUES(p_organization_id,p_feature,p_notified_at,p_confirmed_at,p_effective_to,btrim(p_evidence),auth.uid()) RETURNING * INTO r; RETURN to_jsonb(r);
END $fn$;
CREATE FUNCTION public.record_postpaid_feature_usage(p_organization_id uuid,p_feature text,p_occurred_at timestamptz,p_evidence text,p_bytes bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE event_id uuid:=gen_random_uuid(); r jsonb;
BEGIN
 PERFORM public.postpaid_require_admin(); PERFORM pg_advisory_xact_lock(hashtextextended('postpaid:'||p_organization_id::text,0));
 IF p_feature IS NULL OR p_feature NOT IN('crm','webinar','videoserviceplus','frdoplus') OR p_occurred_at IS NULL OR p_occurred_at>clock_timestamp()
 OR length(btrim(COALESCE(p_evidence,''))) NOT BETWEEN 10 AND 4000
 OR (p_feature='videoserviceplus' AND (p_bytes IS NULL OR p_bytes<=2147483648))
 THEN RAISE EXCEPTION 'Actual feature use evidence required'; END IF;
 IF EXISTS(SELECT 1 FROM public.postpaid_billing_statements WHERE organization_id=p_organization_id AND status='invoiced'
 AND (p_occurred_at AT TIME ZONE 'Europe/Moscow')::date>=period_start AND (p_occurred_at AT TIME ZONE 'Europe/Moscow')::date<period_end)
 THEN RAISE EXCEPTION 'Issued period requires separate reconciliation'; END IF;
 IF NOT public.postpaid_append_event(p_organization_id,p_feature,NULL,NULL,'admin_evidence',event_id::text,p_occurred_at,btrim(p_evidence),p_bytes)
 THEN RAISE EXCEPTION 'Feature use is outside the agreement access period'; END IF;
 SELECT to_jsonb(e) INTO r FROM public.postpaid_usage_events e WHERE source_table='admin_evidence' AND source_key=event_id::text; RETURN r;
END $fn$;

-- Returns BOTH distinct courses and distinct learners. Assignments, directory
-- opens and merely enabled features are deliberately absent from the sources.
CREATE FUNCTION public.postpaid_collect_snapshot(p_organization_id uuid,p_period_start date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a public.organization_billing_agreements%ROWTYPE; finish date; first_day date; last_day date; starts timestamptz; ends timestamptz;
 courses integer; learners integer; ledger_courses integer; ledger_learners integer; features jsonb; feature_evidence jsonb; unconfirmed integer; study_hash text;
 month_days integer; access_days integer; reasons jsonb:='[]'::jsonb; complete_status text:='recorded'; closed boolean;
BEGIN
 SELECT * INTO STRICT a FROM public.organization_billing_agreements WHERE organization_id=p_organization_id;
 IF p_period_start IS NULL OR p_period_start<>date_trunc('month',p_period_start)::date THEN RAISE EXCEPTION 'First calendar day of month required'; END IF;
 finish:=(p_period_start+interval '1 month')::date; first_day:=greatest(p_period_start,a.effective_from); last_day:=least(finish,COALESCE(a.effective_to,finish));
 IF first_day>=last_day THEN RAISE EXCEPTION 'No agreement access in this month'; END IF;
 starts:=first_day::timestamp AT TIME ZONE 'Europe/Moscow'; ends:=last_day::timestamp AT TIME ZONE 'Europe/Moscow';
 closed:=last_day<=(clock_timestamp() AT TIME ZONE 'Europe/Moscow')::date;
 month_days:=finish-p_period_start;
 -- Full monthly minimum applies unless access was terminated in this month.
 access_days:=CASE WHEN a.effective_to IS NOT NULL AND a.effective_to<finish THEN last_day-first_day ELSE month_days END;
 SELECT count(DISTINCT course_id),count(DISTINCT learner_id) INTO ledger_courses,ledger_learners FROM public.postpaid_usage_events
 WHERE organization_id=p_organization_id AND feature='study' AND occurred_at>=starts AND occurred_at<ends;
 WITH historical AS (
  SELECT e.course_id,e.user_id FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=p_organization_id AND c.system_key IS NULL
   AND e.status='completed' AND e.completed_at>=starts AND e.completed_at<ends
  UNION SELECT l.course_id,t.user_id FROM public.test_attempt_sessions t JOIN public.lessons l ON l.id=t.lesson_id JOIN public.courses c ON c.id=l.course_id
   WHERE c.organization_id=p_organization_id AND c.system_key IS NULL AND t.started_at>=starts AND t.started_at<ends
  UNION SELECT l.course_id,t.user_id FROM public.test_attempts t JOIN public.lessons l ON l.id=t.lesson_id JOIN public.courses c ON c.id=l.course_id
   WHERE c.organization_id=p_organization_id AND c.system_key IS NULL AND t.completed_at>=starts AND t.completed_at<ends
  UNION SELECT h.course_id,h.student_id FROM public.homework_submissions h JOIN public.courses c ON c.id=h.course_id
   WHERE c.organization_id=p_organization_id AND c.system_key IS NULL AND h.submitted_at>=starts AND h.submitted_at<ends
  UNION SELECT l.course_id,p.user_id FROM public.lesson_progress p JOIN public.lessons l ON l.id=p.lesson_id JOIN public.courses c ON c.id=l.course_id
   WHERE c.organization_id=p_organization_id AND c.system_key IS NULL AND p.completed AND p.completed_at>=starts AND p.completed_at<ends
 ), combined AS (
  SELECT course_id,learner_id AS user_id FROM public.postpaid_usage_events WHERE organization_id=p_organization_id AND feature='study' AND occurred_at>=starts AND occurred_at<ends
  UNION SELECT course_id,user_id FROM historical WHERE starts<a.recording_started_at
 ) SELECT count(DISTINCT course_id),count(DISTINCT user_id),md5(COALESCE(string_agg(course_id::text||':'||user_id::text,',' ORDER BY course_id,user_id),''))
 INTO courses,learners,study_hash FROM combined;
 WITH eligible AS (
  SELECT e.id,e.feature,e.occurred_at,e.source_table,e.source_key,e.bytes,
   (SELECT COALESCE(jsonb_agg(f.id ORDER BY f.id),'[]'::jsonb) FROM public.postpaid_feature_confirmations f WHERE f.organization_id=e.organization_id AND f.feature=e.feature
    AND f.notified_at<=f.confirmed_at AND f.confirmed_at<=e.occurred_at AND (f.effective_to IS NULL OR f.effective_to>e.occurred_at)) AS confirmations,
   EXISTS(SELECT 1 FROM public.postpaid_feature_confirmations f WHERE f.organization_id=e.organization_id AND f.feature=e.feature
    AND f.notified_at<=f.confirmed_at AND f.confirmed_at<=e.occurred_at AND (f.effective_to IS NULL OR f.effective_to>e.occurred_at))
    AND (e.feature<>'videoserviceplus' OR e.bytes>2147483648) AS confirmed
  FROM public.postpaid_usage_events e WHERE e.organization_id=p_organization_id AND e.feature<>'study' AND e.occurred_at>=starts AND e.occurred_at<ends
 ) SELECT jsonb_build_object('crm',COALESCE(bool_or(feature='crm' AND confirmed),false),'webinar',COALESCE(bool_or(feature='webinar' AND confirmed),false),
 'videoserviceplus',COALESCE(bool_or(feature='videoserviceplus' AND confirmed),false),'frdoplus',COALESCE(bool_or(feature='frdoplus' AND confirmed),false)),
 count(*) FILTER(WHERE NOT confirmed),COALESCE(jsonb_agg(jsonb_build_object('event_id',id,'feature',feature,'occurred_at',occurred_at,
  'source_table',source_table,'source_key',source_key,'bytes',bytes,'confirmed',confirmed,'confirmation_ids',confirmations) ORDER BY id),'[]'::jsonb)
 INTO features,unconfirmed,feature_evidence FROM eligible;
 IF starts<a.recording_started_at THEN complete_status:='requires_manual_review'; reasons:=reasons||jsonb_build_array('retrospective_history_incomplete'); END IF;
 IF NOT closed THEN reasons:=reasons||jsonb_build_array('period_open'); END IF;
 IF unconfirmed>0 THEN reasons:=reasons||jsonb_build_array('unconfirmed_feature_use_excluded'); END IF;
 reasons:=reasons||jsonb_build_array('administrator_must_review_offline_and_separate_service_evidence');
 RETURN jsonb_build_object('agreement',to_jsonb(a),'courses_count',courses,'learners_count',learners,'ledger_courses_count',ledger_courses,'ledger_learners_count',ledger_learners,
 'features',features,'feature_evidence',feature_evidence,'study_source_hash',study_hash,'unconfirmed_feature_events',unconfirmed,'completeness',jsonb_build_object('status',complete_status,'reasons',reasons),
 'access_days',access_days,'month_days',month_days,'access_period_start',first_day,'access_period_end',last_day,'period_closed',closed,
 'terms_version',a.terms_version,'additional_services_included',false);
END $fn$;

CREATE FUNCTION public.postpaid_calculate(p_courses integer,p_learners integer,p_features jsonb,p_access_days integer,p_month_days integer)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE plan text; price integer;
BEGIN
 IF p_courses IS NULL OR p_courses<0 OR p_learners IS NULL OR p_learners<0 OR p_access_days IS NULL OR p_access_days<1
 OR p_month_days IS NULL OR p_month_days NOT BETWEEN 28 AND 31 OR p_access_days>p_month_days THEN RAISE EXCEPTION 'Invalid postpaid metrics'; END IF;
 plan:=CASE WHEN p_courses<=15 AND p_learners<=100 THEN 'start' WHEN p_courses<=30 AND p_learners<=200 THEN 'standard' ELSE 'professional' END;
 IF COALESCE((p_features->>'crm')::boolean,false) AND plan='start' THEN plan:='standard'; END IF;
 IF COALESCE((p_features->>'webinar')::boolean,false) OR COALESCE((p_features->>'videoserviceplus')::boolean,false) OR COALESCE((p_features->>'frdoplus')::boolean,false) THEN plan:='professional'; END IF;
 price:=CASE plan WHEN 'start' THEN 4490 WHEN 'standard' THEN 6990 ELSE 16990 END;
 RETURN jsonb_build_object('plan',plan,'monthly_amount',price,'amount',round(price::numeric*p_access_days/p_month_days,2));
END $fn$;

CREATE FUNCTION public.postpaid_prepare_statement_internal(p_organization_id uuid,p_period_start date,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.postpaid_billing_statements%ROWTYPE; s jsonb; q jsonb; version integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('postpaid:'||p_organization_id::text,0));
 SELECT * INTO r FROM public.postpaid_billing_statements WHERE organization_id=p_organization_id AND period_start=p_period_start AND status<>'superseded' FOR UPDATE;
 IF r.status='invoiced' THEN RETURN to_jsonb(r); END IF;
 s:=public.postpaid_collect_snapshot(p_organization_id,p_period_start);
 IF r.source_hash=md5(s::text) THEN RETURN to_jsonb(r); END IF;
 q:=public.postpaid_calculate((s->>'courses_count')::integer,(s->>'learners_count')::integer,s->'features',(s->>'access_days')::integer,(s->>'month_days')::integer);
 SELECT COALESCE(max(revision),0)+1 INTO version FROM public.postpaid_billing_statements WHERE organization_id=p_organization_id AND period_start=p_period_start;
 UPDATE public.postpaid_billing_statements SET status='superseded' WHERE organization_id=p_organization_id AND period_start=p_period_start AND status<>'superseded';
 INSERT INTO public.postpaid_billing_statements(organization_id,agreement_id,period_start,period_end,revision,snapshot,source_hash,plan,amount,created_by)
 VALUES(p_organization_id,(s->'agreement'->>'id')::uuid,p_period_start,(p_period_start+interval '1 month')::date,version,s,md5(s::text),q->>'plan',(q->>'amount')::numeric,p_actor) RETURNING * INTO r;
 RETURN to_jsonb(r);
END $fn$;

CREATE FUNCTION public.prepare_postpaid_statement(p_organization_id uuid,p_period_start date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM public.postpaid_require_admin(); RETURN public.postpaid_prepare_statement_internal(p_organization_id,p_period_start,auth.uid());
END $fn$;

CREATE FUNCTION public.prepare_due_postpaid_statements() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a public.organization_billing_agreements%ROWTYPE; period date; result jsonb; prepared integer:=0; failures integer:=0; notified integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted scheduled billing worker required' USING ERRCODE='42501'; END IF;
 FOR a IN SELECT * FROM public.organization_billing_agreements LOOP
  FOR period IN SELECT d::date FROM generate_series(a.effective_from::timestamp,
    least(date_trunc('month',clock_timestamp() AT TIME ZONE 'Europe/Moscow')-interval '1 month',
      COALESCE(date_trunc('month',a.effective_to-1),date_trunc('month',clock_timestamp() AT TIME ZONE 'Europe/Moscow')-interval '1 month')),interval '1 month') d LOOP
   BEGIN
    result:=public.postpaid_prepare_statement_internal(a.organization_id,period,a.created_by);
    IF result->>'status'='needs_review' AND NOT EXISTS(SELECT 1 FROM public.admin_notifications WHERE type='postpaid_statement_review' AND related_entity_id=result->>'id') THEN
     INSERT INTO public.admin_notifications(type,title,message,related_entity_id,metadata)
     VALUES('postpaid_statement_review','Постоплата: расчёт месяца требует проверки',
       'Подготовлен только черновик. Проверьте фактическое обучение и подтверждения функций перед выставлением счёта.',
       result->>'id',jsonb_build_object('organization_id',a.organization_id,'period_start',period,'statement_id',result->>'id'));
     prepared:=prepared+1;
    END IF;
   EXCEPTION WHEN OTHERS THEN failures:=failures+1;
   END;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('prepared',prepared,'failed',failures,'invoices_issued',0);
END $fn$;

CREATE FUNCTION public.approve_postpaid_statement(p_statement_id uuid,p_review_note text,p_courses_override integer DEFAULT NULL,p_learners_override integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.postpaid_billing_statements%ROWTYPE; org uuid; s jsonb; q jsonb; courses integer; learners integer;
BEGIN
 PERFORM public.postpaid_require_admin(); SELECT organization_id INTO STRICT org FROM public.postpaid_billing_statements WHERE id=p_statement_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('postpaid:'||org::text,0)); SELECT * INTO STRICT r FROM public.postpaid_billing_statements WHERE id=p_statement_id FOR UPDATE;
 IF r.status NOT IN('needs_review','approved') THEN RAISE EXCEPTION 'Statement cannot be approved'; END IF;
 s:=public.postpaid_collect_snapshot(org,r.period_start);
 IF NOT (s->>'period_closed')::boolean THEN RAISE EXCEPTION 'Usage period is still open'; END IF;
 IF r.source_hash<>md5(s::text) THEN RAISE EXCEPTION 'Usage evidence changed; prepare a new statement revision'; END IF;
 IF length(btrim(COALESCE(p_review_note,''))) NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION 'Written review of usage and feature evidence required'; END IF;
 IF s->'completeness'->>'status'='requires_manual_review' AND (p_courses_override IS NULL OR p_learners_override IS NULL)
 THEN RAISE EXCEPTION 'Retrospective period requires explicit reviewed course and learner counts'; END IF;
 courses:=COALESCE(p_courses_override,(s->>'courses_count')::integer); learners:=COALESCE(p_learners_override,(s->>'learners_count')::integer);
 IF courses<(s->>'ledger_courses_count')::integer OR learners<(s->>'ledger_learners_count')::integer
 OR (courses=0 AND learners<>0) OR (learners=0 AND courses<>0) THEN RAISE EXCEPTION 'Reviewed counts cannot discard recorded actual use'; END IF;
 q:=public.postpaid_calculate(courses,learners,s->'features',(s->>'access_days')::integer,(s->>'month_days')::integer);
 UPDATE public.postpaid_billing_statements SET status='approved',reviewed_courses=courses,reviewed_learners=learners,review_note=btrim(p_review_note),
 reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),plan=q->>'plan',amount=(q->>'amount')::numeric WHERE id=r.id RETURNING * INTO r;
 RETURN to_jsonb(r);
END $fn$;

CREATE FUNCTION public.postpaid_authorize_invoice_write(p_invoice_id uuid,p_operation text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 INSERT INTO public.postpaid_invoice_write_tokens(transaction_id,invoice_id,operation) VALUES(txid_current(),p_invoice_id,p_operation) ON CONFLICT DO NOTHING;
$fn$;
CREATE FUNCTION public.guard_postpaid_invoice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.postpaid_billing_statements%ROWTYPE; token_found boolean;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.billing_kind='postpaid' THEN RAISE EXCEPTION 'Issued postpaid invoice cannot be deleted'; END IF; RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND NEW.billing_kind IS DISTINCT FROM OLD.billing_kind THEN RAISE EXCEPTION 'Invoice billing kind is immutable'; END IF;
 IF NEW.billing_kind='prepaid' THEN
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.organization_billing_agreements WHERE organization_id=NEW.organization_id
    AND effective_from<=(clock_timestamp() AT TIME ZONE 'Europe/Moscow')::date AND (effective_to IS NULL OR effective_to>(clock_timestamp() AT TIME ZONE 'Europe/Moscow')::date))
  THEN RAISE EXCEPTION 'Active postpaid agreement: prepaid invoice creation is disabled'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.payment_method IS DISTINCT FROM 'invoice' THEN RAISE EXCEPTION 'Postpaid supports reviewed bank-transfer invoices only'; END IF;
 SELECT * INTO s FROM public.postpaid_billing_statements WHERE id=NEW.postpaid_statement_id;
 IF NOT FOUND OR s.status NOT IN('approved','invoiced') OR s.invoice_id IS DISTINCT FROM NEW.id
 OR (s.organization_id,s.plan,s.amount,s.period_start,s.period_end) IS DISTINCT FROM
 (NEW.organization_id,NEW.plan,NEW.amount,NEW.service_period_start,NEW.service_period_end)
 OR NEW.period_months<>1 THEN RAISE EXCEPTION 'Postpaid invoice must match its approved statement'; END IF;
 IF TG_OP='INSERT' AND (NEW.status<>'pending' OR NEW.paid_at IS NOT NULL OR NEW.payment_id IS NOT NULL) THEN RAISE EXCEPTION 'Postpaid invoice must start pending'; END IF;
 DELETE FROM public.postpaid_invoice_write_tokens WHERE transaction_id=txid_current() AND invoice_id=NEW.id AND operation=TG_OP RETURNING true INTO token_found;
 IF NOT COALESCE(token_found,false) THEN RAISE EXCEPTION 'Guarded postpaid invoice RPC required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER guard_postpaid_invoice BEFORE INSERT OR UPDATE OR DELETE ON public.subscription_invoices FOR EACH ROW EXECUTE FUNCTION public.guard_postpaid_invoice();

CREATE FUNCTION public.issue_postpaid_invoice(p_statement_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.postpaid_billing_statements%ROWTYPE; org uuid; invoice uuid; fresh jsonb;
BEGIN
 PERFORM public.postpaid_require_admin(); SELECT organization_id INTO STRICT org FROM public.postpaid_billing_statements WHERE id=p_statement_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('postpaid:'||org::text,0)); SELECT * INTO STRICT r FROM public.postpaid_billing_statements WHERE id=p_statement_id FOR UPDATE;
 IF r.status='invoiced' THEN RETURN jsonb_build_object('invoice_id',r.invoice_id,'statement_id',r.id,'already_issued',true); END IF;
 IF r.status<>'approved' OR r.reviewed_at IS NULL THEN RAISE EXCEPTION 'Administrator approval required before invoice issuance'; END IF;
 fresh:=public.postpaid_collect_snapshot(org,r.period_start);
 IF NOT (fresh->>'period_closed')::boolean OR r.source_hash<>md5(fresh::text) THEN RAISE EXCEPTION 'Usage evidence changed; prepare and review a new statement revision'; END IF;
 invoice:=gen_random_uuid();
 -- Defer only this circular FK: the row binding exists BEFORE INSERT trigger.
 SET CONSTRAINTS postpaid_statement_invoice_fk DEFERRED;
 UPDATE public.postpaid_billing_statements SET invoice_id=invoice WHERE id=r.id;
 PERFORM public.postpaid_authorize_invoice_write(invoice,'INSERT');
 INSERT INTO public.subscription_invoices(id,organization_id,invoice_number,invoice_date,plan,amount,period_months,status,payment_method,billing_kind,service_period_start,service_period_end,postpaid_statement_id)
 VALUES(invoice,org,'ПП-'||to_char(r.period_start,'YYYYMM')||'-'||replace(invoice::text,'-',''),(clock_timestamp() AT TIME ZONE 'Europe/Moscow')::date,
 r.plan,r.amount,1,'pending','invoice','postpaid',r.period_start,r.period_end,r.id);
 UPDATE public.postpaid_billing_statements SET status='invoiced' WHERE id=r.id;
 RETURN jsonb_build_object('invoice_id',invoice,'statement_id',r.id,'already_issued',false);
END $fn$;
ALTER TABLE public.postpaid_billing_statements ALTER CONSTRAINT postpaid_statement_invoice_fk DEFERRABLE INITIALLY IMMEDIATE;

CREATE FUNCTION public.get_postpaid_billing_overview(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM public.postpaid_require_admin();
 RETURN jsonb_build_object('agreement',(SELECT to_jsonb(a) FROM public.organization_billing_agreements a WHERE organization_id=p_organization_id),
 'statements',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.period_start DESC,s.revision DESC) FROM public.postpaid_billing_statements s WHERE organization_id=p_organization_id),'[]'::jsonb),
 'feature_confirmations',COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.confirmed_at DESC) FROM public.postpaid_feature_confirmations f WHERE organization_id=p_organization_id),'[]'::jsonb),
 'feature_usage',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at DESC) FROM (SELECT * FROM public.postpaid_usage_events WHERE organization_id=p_organization_id AND feature<>'study' ORDER BY occurred_at DESC LIMIT 200)e),'[]'::jsonb));
END $fn$;

CREATE FUNCTION public.get_postpaid_access_profile(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE active boolean; features jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.postpaid_is_admin() AND
  (auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() OR NOT (
   COALESCE(public.can_access_organization(p_organization_id,'settings.read'),false) OR COALESCE(public.can_access_organization(p_organization_id,'students.read'),false)
   OR COALESCE(public.can_access_organization(p_organization_id,'students.write'),false) OR COALESCE(public.can_access_organization(p_organization_id,'courses.read'),false)
   OR COALESCE(public.can_access_organization(p_organization_id,'courses.write'),false) OR COALESCE(public.can_access_organization(p_organization_id,'sales.read'),false)
   OR EXISTS(SELECT 1 FROM public.profiles p JOIN public.enrollments e ON e.user_id=p.user_id JOIN public.courses c ON c.id=e.course_id
     WHERE p.user_id=auth.uid() AND p.organization_id=p_organization_id AND c.organization_id=p_organization_id AND public.can_access_course_as_learner(c.id))))
 THEN RAISE EXCEPTION 'Organization access required' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.organization_billing_agreements WHERE organization_id=p_organization_id
 AND effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date AND (effective_to IS NULL OR effective_to>(now() AT TIME ZONE 'Europe/Moscow')::date)) INTO active;
 SELECT jsonb_build_object('crm',COALESCE(bool_or(feature='crm'),false),'webinar',COALESCE(bool_or(feature='webinar'),false),
 'videoserviceplus',COALESCE(bool_or(feature='videoserviceplus'),false),'frdoplus',COALESCE(bool_or(feature='frdoplus'),false)) INTO features
 FROM public.postpaid_feature_confirmations WHERE active AND organization_id=p_organization_id AND confirmed_at<=now() AND (effective_to IS NULL OR effective_to>now());
 RETURN jsonb_build_object('organization_id',p_organization_id,'active',active,'billing_mode',CASE WHEN active THEN 'postpaid' ELSE 'prepaid' END,
 'limits',CASE WHEN active THEN jsonb_build_object('maxCourses',-1,'maxStudents',-1,'maxTrainedStudents',-1,'maxStorageBytes',-1,'maxAiGenerations',-1) ELSE NULL END,'features',features);
END $fn$;

CREATE FUNCTION public.get_postpaid_invoice_calculation(p_invoice_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE invoice public.subscription_invoices%ROWTYPE; s public.postpaid_billing_statements%ROWTYPE;
BEGIN
 SELECT * INTO STRICT invoice FROM public.subscription_invoices WHERE id=p_invoice_id;
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.postpaid_is_admin() AND
 (auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() OR NOT COALESCE(public.can_access_organization(invoice.organization_id,'settings.read'),false))
 THEN RAISE EXCEPTION 'Organization billing access required' USING ERRCODE='42501'; END IF;
 IF invoice.billing_kind<>'postpaid' THEN RETURN NULL; END IF;
 SELECT * INTO STRICT s FROM public.postpaid_billing_statements WHERE id=invoice.postpaid_statement_id AND invoice_id=invoice.id;
 RETURN jsonb_build_object('invoice_id',invoice.id,'organization_id',invoice.organization_id,'period_start',s.period_start,'period_end',s.period_end,
 'courses_count',s.reviewed_courses,'learners_count',s.reviewed_learners,'features',s.snapshot->'features','access_days',s.snapshot->'access_days','month_days',s.snapshot->'month_days',
 'access_period_start',s.snapshot->'access_period_start','access_period_end',s.snapshot->'access_period_end',
 'plan',s.plan,'monthly_amount',CASE s.plan WHEN 'start' THEN 4490 WHEN 'standard' THEN 6990 ELSE 16990 END,'amount',s.amount,
 'contract_reference',s.snapshot->'agreement'->>'contract_reference','terms_version',s.snapshot->>'terms_version','tax_label','Без НДС (НПД)');
END $fn$;

-- All writes go through narrowly authorized functions. Service integrations
-- can read the agreement but cannot manufacture evidence or issue documents.
DO $privileges$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN(
  'postpaid_is_admin','postpaid_require_admin','postpaid_immutable_record','postpaid_statement_immutable_snapshot','postpaid_append_event','capture_postpaid_study_activity',
  'capture_postpaid_feature_activity','postpaid_collect_snapshot','postpaid_calculate','postpaid_authorize_invoice_write','guard_postpaid_invoice',
  'has_active_postpaid_agreement','save_postpaid_agreement','record_postpaid_lesson_activity','record_postpaid_feature_confirmation','record_postpaid_feature_usage',
  'postpaid_prepare_statement_internal','prepare_due_postpaid_statements','get_postpaid_access_profile','get_postpaid_invoice_calculation',
  'prepare_postpaid_statement','approve_postpaid_statement','issue_postpaid_invoice','get_postpaid_billing_overview') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',fn);
 END LOOP;
END $privileges$;
GRANT EXECUTE ON FUNCTION public.postpaid_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_postpaid_agreement(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_postpaid_access_profile(uuid),public.get_postpaid_invoice_calculation(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_due_postpaid_statements() TO service_role;
GRANT EXECUTE ON FUNCTION public.save_postpaid_agreement(uuid,date,text,text,date),public.record_postpaid_lesson_activity(uuid),
 public.record_postpaid_feature_confirmation(uuid,text,timestamptz,timestamptz,text,timestamptz),public.record_postpaid_feature_usage(uuid,text,timestamptz,text,bigint),
 public.prepare_postpaid_statement(uuid,date),public.approve_postpaid_statement(uuid,text,integer,integer),public.issue_postpaid_invoice(uuid),public.get_postpaid_billing_overview(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
