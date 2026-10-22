-- UC023. Additive workflow; no historical request or deadline backfill and no erasure.
-- Apply this entire migration in one transaction.
-- Public RPC conflicts use PT409, never custom40001 (PostgREST14 retry loop).
DO $preflight$
BEGIN
 IF md5(replace((SELECT prosrc FROM pg_proc WHERE oid='public.set_dsr_due_date()'::regprocedure),chr(13)||chr(10),chr(10))) IS DISTINCT FROM 'a3fe0db2ed0244deb595e9ac76712d93'
 OR md5(replace((SELECT prosrc FROM pg_proc WHERE oid='public.get_documents_kpi(uuid)'::regprocedure),chr(13)||chr(10),chr(10))) IS DISTINCT FROM '7b1d582dbaea5a699b554aa0e90e98b0'
 THEN RAISE EXCEPTION 'UC023: unreviewed existing deadline/KPI bodies'; END IF;
 IF to_regprocedure('public.uc_document_has_action(uuid,text)') IS NULL
 OR to_regprocedure('public.uc_document_student_scope_allowed(uuid,uuid)') IS NULL
 OR to_regprocedure('public.uc_custom_journal_shape(jsonb,text[])') IS NULL
 OR to_regprocedure('public.uc_custom_journal_uuid(jsonb)') IS NULL
 OR to_regclass('public.account_deletion_revocations') IS NULL
 THEN RAISE EXCEPTION 'UC023: released privacy/document authority required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.data_subject_requests'::regclass AND attname IN ('deadline_details','deadline_revision') AND NOT attisdropped)
 OR to_regclass('public.data_subject_request_deadline_events') IS NOT NULL
 THEN RAISE EXCEPTION 'UC023 already exists or has unreviewed partial state'; END IF;
END;$preflight$;
CREATE TEMP TABLE uc023_old_proc_metadata ON COMMIT DROP AS
 SELECT p.oid,to_jsonb(p)-'prosrc' metadata FROM pg_proc p
 WHERE p.oid IN ('public.set_dsr_due_date()'::regprocedure,'public.get_documents_kpi(uuid)'::regprocedure);

ALTER TABLE public.data_subject_requests
 ADD COLUMN deadline_details jsonb,
 ADD COLUMN deadline_revision bigint NOT NULL DEFAULT 0 CHECK(deadline_revision>=0);
ALTER TABLE public.data_subject_requests DROP CONSTRAINT data_subject_requests_request_type_check;
ALTER TABLE public.data_subject_requests ADD CONSTRAINT data_subject_requests_request_type_check
 CHECK(request_type IN ('access','deletion','withdrawal','correction','cessation'));
ALTER TABLE public.data_subject_requests ADD CONSTRAINT data_subject_requests_deadline_details_check
 CHECK(deadline_details IS NULL OR (jsonb_typeof(deadline_details)='object'
  AND coalesce(deadline_details->>'state' IN ('needs_review','calculated','manual_review','unsupported_calendar'),false)));

CREATE TABLE public.data_subject_request_deadline_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.data_subject_requests(id) ON DELETE CASCADE,
 revision bigint NOT NULL CHECK(revision>=0),
 action text NOT NULL CHECK(action IN ('created','reviewed','extended','responded')),
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 4000),
 before_state jsonb,
 after_state jsonb NOT NULL,
 UNIQUE(request_id,revision)
);
ALTER TABLE public.data_subject_request_deadline_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_subject_request_deadline_events FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.uc_dsr_working_2026(p_day date) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT CASE WHEN extract(year FROM p_day)<>2026 THEN NULL
 ELSE extract(isodow FROM p_day)<6 AND p_day<>ALL(ARRAY[
 '2026-01-01','2026-01-02','2026-01-05','2026-01-06','2026-01-07','2026-01-08','2026-01-09',
 '2026-02-23','2026-03-09','2026-05-01','2026-05-11','2026-06-12','2026-11-04','2026-12-31']::date[]) END;
$fn$;
CREATE FUNCTION public.uc_dsr_add_days(p_trigger date,p_days integer,p_working boolean) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE d date:=p_trigger; remaining integer:=p_days;
BEGIN
 IF p_trigger IS NULL OR extract(year FROM p_trigger)<>2026 OR p_days NOT BETWEEN 1 AND 35 OR p_working IS NULL THEN RETURN NULL; END IF;
 WHILE remaining>0 LOOP
  d:=d+1;
  IF extract(year FROM d)<>2026 THEN RETURN NULL; END IF;
  IF NOT p_working OR public.uc_dsr_working_2026(d) THEN remaining:=remaining-1; END IF;
 END LOOP;
 RETURN d;
END;$fn$;
CREATE FUNCTION public.uc_dsr_can_manage(p_org uuid,p_subject uuid,p_write boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed()
 AND public.uc_document_has_action(p_org,CASE WHEN p_write THEN 'write' ELSE 'read' END)
 AND public.uc_document_student_scope_allowed(p_org,p_subject);
$fn$;
CREATE FUNCTION public.uc_dsr_fence(p_subjects uuid[],p_write boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE target uuid; acquired boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 FOR target IN SELECT DISTINCT x FROM unnest(p_subjects||ARRAY[auth.uid()]) x WHERE x IS NOT NULL ORDER BY x LOOP
  IF p_write THEN acquired:=pg_try_advisory_xact_lock(hashtextextended(target::text,42007));
  ELSE acquired:=pg_try_advisory_xact_lock_shared(hashtextextended(target::text,42007)); END IF;
  IF NOT acquired THEN RAISE EXCEPTION 'Personal data operation is busy; reload and retry' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=target) THEN RAISE EXCEPTION 'Personal data access revoked' USING ERRCODE='42501'; END IF;
 END LOOP;
END;$fn$;
CREATE FUNCTION public.uc_dsr_authority_fence(p_org uuid,p_subject uuid,p_write boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 LOCK TABLE public.organizations,public.org_staff,public.org_staff_document_groups,public.profiles,public.user_roles,public.admin_staff IN ROW SHARE MODE NOWAIT;
 PERFORM 1 FROM public.organizations WHERE id=p_org FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_staff WHERE organization_id=p_org AND user_id=auth.uid() ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_staff_document_groups a JOIN public.org_staff s ON s.id=a.staff_id
  WHERE a.organization_id=p_org AND s.user_id=auth.uid() ORDER BY a.staff_id,a.group_id FOR SHARE OF a NOWAIT;
 PERFORM 1 FROM public.profiles WHERE user_id IN (auth.uid(),p_subject) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.user_roles WHERE user_id=auth.uid() FOR SHARE NOWAIT;
 PERFORM 1 FROM public.admin_staff WHERE user_id=auth.uid() FOR SHARE NOWAIT;
 IF NOT public.uc_dsr_can_manage(p_org,p_subject,p_write) THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='42501'; END IF;
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN
 RAISE EXCEPTION 'Access changed or busy; reload before saving' USING ERRCODE='PT409';
END;$fn$;

-- The old INSERT trigger remains attached with the same owner/ACL/identity.
-- New requests have no invented universal legal deadline; old rows are untouched.
CREATE OR REPLACE FUNCTION public.set_dsr_due_date() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $fn$
BEGIN
 NEW.created_at:=now();
 NEW.updated_at:=NEW.created_at;
 NEW.due_date:=NULL;
 NEW.deadline_revision:=0;
 NEW.deadline_details:=jsonb_build_object('state','needs_review','rule_version','152fz-dsr-2026-10-22-v1');
 RETURN NEW;
END;$fn$;

CREATE FUNCTION public.uc_dsr_create(p_request_id uuid,p_organization_id uuid,p_request_type text,p_description text,p_contact_email text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE existing public.data_subject_requests%ROWTYPE; created public.data_subject_requests%ROWTYPE;
BEGIN
 PERFORM public.uc_dsr_fence(ARRAY[auth.uid()],true);
 IF p_request_id IS NULL OR p_organization_id IS NULL OR p_request_type NOT IN ('access','deletion','withdrawal','correction','cessation')
 OR p_request_type IS NULL OR length(coalesce(p_description,''))>12000 OR length(coalesce(p_contact_email,''))>320
 THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 IF NOT (EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.organization_id=p_organization_id)
 OR EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.user_id=auth.uid() AND c.organization_id=p_organization_id)
 OR EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.user_id=auth.uid() AND m.organization_id=p_organization_id))
 THEN RAISE EXCEPTION 'Organization does not hold your learning record' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM public.data_subject_requests r WHERE r.id=p_request_id;
 IF FOUND THEN
  IF existing.user_id IS DISTINCT FROM auth.uid() OR existing.organization_id IS DISTINCT FROM p_organization_id
  OR existing.request_type IS DISTINCT FROM p_request_type OR existing.description IS DISTINCT FROM nullif(btrim(p_description),'')
  OR existing.contact_email IS DISTINCT FROM nullif(btrim(p_contact_email),'') OR existing.deleted_at IS NOT NULL
  THEN RAISE EXCEPTION 'Request identifier already used' USING ERRCODE='PT409'; END IF;
  RETURN to_jsonb(existing);
 END IF;
 INSERT INTO public.data_subject_requests(id,user_id,organization_id,request_type,description,contact_email)
 VALUES(p_request_id,auth.uid(),p_organization_id,p_request_type,nullif(btrim(p_description),''),nullif(btrim(p_contact_email),'')) RETURNING * INTO created;
 INSERT INTO public.data_subject_request_deadline_events(request_id,revision,action,actor_id,reason,after_state)
 VALUES(created.id,0,'created',auth.uid(),'Запрос получен; основание и контрольный срок требуют проверки оператором',
  jsonb_build_object('status',created.status,'due_date',created.due_date,'deadline_details',created.deadline_details,'deadline_revision',created.deadline_revision));
 RETURN to_jsonb(created);
EXCEPTION WHEN unique_violation OR lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'Request changed; reload and retry' USING ERRCODE='PT409';
END;$fn$;

CREATE FUNCTION public.uc_dsr_list(p_organization_id uuid DEFAULT NULL,p_request_id uuid DEFAULT NULL,p_cursor jsonb DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE subjects uuid[]; captured_ids uuid[]; result jsonb; subject uuid; cursor_time timestamptz; cursor_id uuid; next_cursor jsonb; counts jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR (p_request_id IS NOT NULL AND p_cursor IS NOT NULL) THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
 IF p_cursor IS NOT NULL THEN
  IF NOT public.uc_custom_journal_shape(p_cursor,ARRAY['created_at','id']) OR NOT public.uc_custom_journal_uuid(p_cursor->'id')
   OR jsonb_typeof(p_cursor->'created_at') IS DISTINCT FROM 'string' OR length(p_cursor->>'created_at')>50
  THEN RAISE EXCEPTION 'Invalid cursor' USING ERRCODE='22023'; END IF;
  cursor_time:=(p_cursor->>'created_at')::timestamptz; cursor_id:=(p_cursor->>'id')::uuid;
 END IF;
 IF p_organization_id IS NOT NULL AND NOT public.uc_document_has_action(p_organization_id,'read') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 WITH eligible AS MATERIALIZED (
  SELECT r.id,r.user_id,r.created_at,r.status FROM public.data_subject_requests r
  WHERE r.deleted_at IS NULL AND (p_request_id IS NULL OR r.id=p_request_id)
  AND ((p_organization_id IS NULL AND r.user_id=auth.uid())
   OR (r.organization_id=p_organization_id AND public.uc_dsr_can_manage(r.organization_id,r.user_id,false)))
  AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations v WHERE v.user_id=r.user_id)
 ), page AS MATERIALIZED (
  SELECT * FROM eligible WHERE cursor_time IS NULL OR (created_at,id)<(cursor_time,cursor_id) ORDER BY created_at DESC,id DESC LIMIT p_limit+1
 ), shown AS MATERIALIZED (SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT p_limit)
 SELECT (SELECT array_agg(DISTINCT user_id) FROM shown),
  (SELECT array_agg(id ORDER BY created_at DESC,id DESC) FROM shown),
  (SELECT CASE WHEN (SELECT count(*) FROM page)>p_limit THEN jsonb_build_object('created_at',created_at,'id',id) ELSE NULL END FROM shown ORDER BY created_at,id LIMIT 1),
  (SELECT jsonb_build_object('all',count(*),'pending',count(*) FILTER(WHERE status='pending'),'in_progress',count(*) FILTER(WHERE status='in_progress'),'resolved',count(*) FILTER(WHERE status='resolved'),'rejected',count(*) FILTER(WHERE status='rejected')) FROM eligible)
 INTO subjects,captured_ids,next_cursor,counts;
 PERFORM public.uc_dsr_fence(coalesce(subjects,'{}'::uuid[]),false);
 IF p_organization_id IS NOT NULL THEN
  FOREACH subject IN ARRAY coalesce(subjects,'{}'::uuid[]) LOOP
   PERFORM public.uc_dsr_authority_fence(p_organization_id,subject,false);
  END LOOP;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('deadline_history',CASE WHEN p_request_id IS NULL THEN '[]'::jsonb ELSE
  (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.revision),'[]'::jsonb) FROM public.data_subject_request_deadline_events e WHERE e.request_id=r.id) END) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb)
 INTO result FROM public.data_subject_requests r
 WHERE r.id=ANY(coalesce(captured_ids,'{}'::uuid[])) AND r.deleted_at IS NULL
 AND ((p_organization_id IS NULL AND r.user_id=auth.uid())
  OR (r.organization_id=p_organization_id AND public.uc_dsr_can_manage(r.organization_id,r.user_id,false)))
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations v WHERE v.user_id=r.user_id);
 RETURN jsonb_build_object('requests',result,'counts',counts,'next_cursor',next_cursor);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'Invalid pagination cursor' USING ERRCODE='22023';
END;$fn$;

CREATE FUNCTION public.uc_dsr_apply(p_request_id uuid,p_expected_revision bigint,p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.data_subject_requests%ROWTYPE; before_row jsonb; d jsonb; basis text; zone text; trigger_on date;
 days integer; working boolean; due date; base_due date; destruction_due date; extension integer;
 reason text; notice date; today date; decision text; next_status text; response_text text; action_label text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>9007199254740991 OR p_action IS NULL OR p_action NOT IN ('review','extend','respond')
 OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>24000
 THEN RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.data_subject_requests q WHERE q.id=p_request_id AND q.deleted_at IS NULL;
 IF NOT FOUND OR NOT public.uc_dsr_can_manage(r.organization_id,r.user_id,true) THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='42501'; END IF;
 PERFORM public.uc_dsr_fence(ARRAY[r.user_id],true);
 PERFORM public.uc_dsr_authority_fence(r.organization_id,r.user_id,true);
 SELECT * INTO r FROM public.data_subject_requests q WHERE q.id=p_request_id AND q.deleted_at IS NULL FOR UPDATE NOWAIT;
 IF NOT FOUND OR NOT public.uc_dsr_can_manage(r.organization_id,r.user_id,true) THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='42501'; END IF;
 IF r.deadline_revision<>p_expected_revision THEN RAISE EXCEPTION 'Request changed; reload before saving' USING ERRCODE='PT409'; END IF;
 IF r.status IN ('resolved','rejected') THEN RAISE EXCEPTION 'Closed request is immutable; create a new request' USING ERRCODE='22023'; END IF;
 before_row:=jsonb_build_object('status',r.status,'response',r.response,'due_date',r.due_date,'deadline_details',r.deadline_details,'deadline_revision',r.deadline_revision); d:=r.deadline_details;
 reason:=btrim(coalesce(p_payload->>'reason',''));
 IF length(reason) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Reason required' USING ERRCODE='22023'; END IF;
 IF p_action='review' THEN
  IF p_payload->'facts_confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Confirm actual trigger facts and calendar applicability' USING ERRCODE='22023'; END IF;
  basis:=p_payload->>'basis'; zone:=p_payload->>'time_zone';
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) OR (p_payload->>'trigger_on')!~'^\d{4}-\d{2}-\d{2}$'
  OR p_payload->>'trigger_on' IS NULL THEN RAISE EXCEPTION 'Actual date and IANA time zone required' USING ERRCODE='22023'; END IF;
  trigger_on:=(p_payload->>'trigger_on')::date; today:=(now() AT TIME ZONE zone)::date;
  IF trigger_on>today THEN RAISE EXCEPTION 'Trigger date is in the future' USING ERRCODE='22023'; END IF;
  IF NOT (basis='manual' OR basis='access' AND r.request_type='access' OR basis='correction' AND r.request_type='correction'
   OR basis='cessation' AND r.request_type='cessation' OR basis='withdrawal' AND r.request_type IN ('withdrawal','deletion')
   OR basis IN ('erasure_evidence','purpose_achieved') AND r.request_type='deletion'
   OR basis='unlawful_processing' AND r.request_type IN ('cessation','deletion')) OR basis IS NULL
  THEN RAISE EXCEPTION 'Basis does not match request' USING ERRCODE='22023'; END IF;
  days:=CASE basis WHEN 'access' THEN 10 WHEN 'correction' THEN 7 WHEN 'cessation' THEN 10 WHEN 'withdrawal' THEN 30 WHEN 'erasure_evidence' THEN 7 WHEN 'purpose_achieved' THEN 30 WHEN 'unlawful_processing' THEN 3 END;
  working:=basis NOT IN ('withdrawal','purpose_achieved');
  due:=NULL; destruction_due:=NULL;
  IF basis<>'manual' AND p_payload->>'calendar_id'='rf-five-day-2026' THEN
   due:=public.uc_dsr_add_days(trigger_on,days,working);
   IF basis='unlawful_processing' THEN destruction_due:=public.uc_dsr_add_days(trigger_on,10,true); END IF;
  END IF;
  d:=jsonb_build_object('state',CASE WHEN basis='manual' THEN 'manual_review' WHEN due IS NULL OR (basis='unlawful_processing' AND destruction_due IS NULL) THEN 'unsupported_calendar' ELSE 'calculated' END,
   'rule_version','152fz-dsr-2026-10-22-v1','basis',basis,'trigger_on',trigger_on,'time_zone',zone,
   'calendar_id',p_payload->>'calendar_id','base_due_on',due,'control_due_on',due,'destruction_due_on',destruction_due,'extension_days',0,'reason',reason);
  IF basis='manual' THEN
   IF length(btrim(coalesce(p_payload->>'legal_basis',''))) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Manual legal basis required' USING ERRCODE='22023'; END IF;
   IF nullif(p_payload->>'manual_due_on','') IS NOT NULL THEN
    due:=(p_payload->>'manual_due_on')::date;
    IF due<trigger_on THEN RAISE EXCEPTION 'Manual control date precedes trigger' USING ERRCODE='22023'; END IF;
   END IF;
   d:=d||jsonb_build_object('legal_basis',p_payload->>'legal_basis','control_due_on',due);
  END IF;
  r.due_date:=due; action_label:='reviewed';
 ELSIF p_action='extend' THEN
  IF d IS NULL OR d->>'state'<>'calculated' OR d->>'basis' NOT IN ('access','cessation') THEN RAISE EXCEPTION 'No statutory extension for this basis' USING ERRCODE='22023'; END IF;
  extension:=(p_payload->>'extension_days')::integer;
  IF extension IS NULL OR extension NOT BETWEEN 1 AND 5 OR extension<=coalesce((d->>'extension_days')::integer,0)
  THEN RAISE EXCEPTION 'Total extension must increase and cannot exceed 5 working days' USING ERRCODE='22023'; END IF;
  notice:=(p_payload->>'notice_on')::date; base_due:=(d->>'base_due_on')::date; trigger_on:=(d->>'trigger_on')::date;
  today:=(now() AT TIME ZONE (d->>'time_zone'))::date;
  IF notice IS NULL OR notice<trigger_on OR notice>base_due OR notice>today OR length(btrim(coalesce(p_payload->>'notice_reference',''))) NOT BETWEEN 1 AND 2000
  THEN RAISE EXCEPTION 'Timely sent motivated notice and evidence reference required' USING ERRCODE='22023'; END IF;
  due:=public.uc_dsr_add_days(trigger_on,10+extension,true);
  IF due IS NULL THEN RAISE EXCEPTION 'Extension crosses unsupported calendar; record manual review instead' USING ERRCODE='22023'; END IF;
  d:=d||jsonb_build_object('extension_days',extension,'control_due_on',due,'notice_on',notice,'notice_reference',p_payload->>'notice_reference','reason',reason);
  r.due_date:=due; action_label:='extended';
 ELSE
  IF d IS NULL OR d->>'state'='needs_review' THEN RAISE EXCEPTION 'Review the basis and trigger before responding' USING ERRCODE='22023'; END IF;
  action_label:='responded';
 END IF;
 next_status:=coalesce(p_payload->>'status','in_progress'); response_text:=coalesce(p_payload->>'response',r.response);
 decision:=coalesce(p_payload->>'decision','processing');
 IF next_status NOT IN ('in_progress','resolved','rejected') OR decision NOT IN ('processing','completed','retention','refusal','blocked_destruction')
 OR length(coalesce(response_text,''))>12000 THEN RAISE EXCEPTION 'Invalid response state' USING ERRCODE='22023'; END IF;
 IF next_status='rejected' AND decision<>'refusal' OR next_status='resolved' AND decision NOT IN ('completed','retention')
 OR next_status='in_progress' AND decision IN ('completed','refusal') THEN RAISE EXCEPTION 'Decision does not match status' USING ERRCODE='22023'; END IF;
 IF next_status IN ('resolved','rejected') AND length(btrim(coalesce(response_text,'')))=0 THEN RAISE EXCEPTION 'Reasoned response required' USING ERRCODE='22023'; END IF;
 IF decision IN ('retention','refusal','blocked_destruction') THEN
  IF length(btrim(coalesce(p_payload->>'decision_basis',''))) NOT BETWEEN 1 AND 4000 OR length(btrim(coalesce(p_payload->>'decision_reason',''))) NOT BETWEEN 1 AND 4000
  THEN RAISE EXCEPTION 'Specific retention/refusal legal basis and reasons required' USING ERRCODE='22023'; END IF;
  d:=d||jsonb_build_object('decision_basis',p_payload->>'decision_basis','decision_reason',p_payload->>'decision_reason');
 END IF;
 IF decision='blocked_destruction' THEN
  IF d->>'basis' NOT IN ('withdrawal','unlawful_processing','purpose_achieved','cessation','manual') THEN RAISE EXCEPTION 'Blocked destruction needs an applicable basis' USING ERRCODE='22023'; END IF;
  IF nullif(p_payload->>'blocked_on','') IS NULL OR nullif(p_payload->>'destruction_review_on','') IS NULL THEN RAISE EXCEPTION 'Actual blocking and destruction control dates required' USING ERRCODE='22023'; END IF;
  IF (p_payload->>'blocked_on')::date>(now() AT TIME ZONE (d->>'time_zone'))::date
  OR (p_payload->>'destruction_review_on')::date<(p_payload->>'blocked_on')::date
  OR (p_payload->>'destruction_review_on')::date>((d->>'trigger_on')::date+interval '6 months')::date
  THEN RAISE EXCEPTION 'Invalid blocking/six-month control dates; different federal-law term needs manual review' USING ERRCODE='22023'; END IF;
  d:=d||jsonb_build_object('blocked_on',p_payload->>'blocked_on','destruction_review_on',p_payload->>'destruction_review_on');
 END IF;
 d:=d||jsonb_build_object('decision',decision);
 UPDATE public.data_subject_requests SET deadline_details=d,deadline_revision=r.deadline_revision+1,due_date=r.due_date,
  status=next_status,response=response_text,resolved_at=CASE WHEN next_status IN ('resolved','rejected') THEN now() ELSE NULL END,
  resolved_by=CASE WHEN next_status IN ('resolved','rejected') THEN auth.uid() ELSE NULL END
 WHERE id=r.id RETURNING * INTO r;
 INSERT INTO public.data_subject_request_deadline_events(request_id,revision,action,actor_id,reason,before_state,after_state)
 VALUES(r.id,r.deadline_revision,action_label,auth.uid(),reason,before_row,
  jsonb_build_object('status',r.status,'response',r.response,'due_date',r.due_date,'deadline_details',r.deadline_details,'deadline_revision',r.deadline_revision));
 RETURN to_jsonb(r);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN
 RAISE EXCEPTION 'Request changed or busy; reload before saving' USING ERRCODE='PT409';
 WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'Invalid date or number' USING ERRCODE='22023';
END;$fn$;

-- RPC ownership supplies calculations; direct client writes cannot forge them.
-- Old read/insert/update abilities move to the scoped public RPCs; recycle-bin
-- owner functions and service cleanup remain compatible.
REVOKE ALL PRIVILEGES ON public.data_subject_requests FROM PUBLIC,anon,authenticated;
DO $column_acl$
DECLARE c record;
BEGIN
 FOR c IN SELECT attname FROM pg_attribute WHERE attrelid='public.data_subject_requests'::regclass AND attnum>0 AND NOT attisdropped LOOP
  EXECUTE format('REVOKE SELECT (%1$I),INSERT (%1$I),UPDATE (%1$I),REFERENCES (%1$I) ON public.data_subject_requests FROM PUBLIC,anon,authenticated',c.attname);
 END LOOP;
END;$column_acl$;
DO $new_acl$
DECLARE f record; a record;
BEGIN
 FOR a IN SELECT DISTINCT grantee FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid='public.data_subject_request_deadline_events'::regclass),acldefault('r',(SELECT relowner FROM pg_class WHERE oid='public.data_subject_request_deadline_events'::regclass))))
 WHERE grantee<>(SELECT relowner FROM pg_class WHERE oid='public.data_subject_request_deadline_events'::regclass) LOOP
  EXECUTE format('REVOKE ALL ON public.data_subject_request_deadline_events FROM %s CASCADE',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END);
 END LOOP;
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('uc_dsr_working_2026','uc_dsr_add_days','uc_dsr_can_manage','uc_dsr_fence','uc_dsr_authority_fence','uc_dsr_create','uc_dsr_list','uc_dsr_apply') LOOP
  FOR a IN SELECT DISTINCT grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',f.proowner))) WHERE grantee<>f.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s CASCADE',f.signature,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END);
  END LOOP;
 END LOOP;
END;$new_acl$;
GRANT EXECUTE ON FUNCTION public.uc_dsr_create(uuid,uuid,text,text,text),public.uc_dsr_list(uuid,uuid,jsonb,integer),public.uc_dsr_apply(uuid,bigint,text,jsonb) TO authenticated;

-- Finite delta in existing aggregate, preserving signature/owner/ACL/config.
DO $kpi$
DECLARE old_body text; new_body text; definition text;
BEGIN
 SELECT replace(prosrc,chr(13)||chr(10),chr(10)) INTO old_body FROM pg_proc WHERE oid='public.get_documents_kpi(uuid)'::regprocedure;
 IF md5(old_body)<>'7b1d582dbaea5a699b554aa0e90e98b0' THEN RAISE EXCEPTION 'KPI source changed'; END IF;
 new_body:=replace(old_body,'v_pd_open int; v_pd_overdue int;','v_pd_open int; v_pd_overdue int; v_pd_review int;');
 new_body:=replace(new_body,$old$count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('new','in_progress')),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('new','in_progress') AND due_date < v_now::date)
  INTO v_pd_open, v_pd_overdue
  FROM public.data_subject_requests
  WHERE organization_id = p_organization_id;$old$,$new$count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('pending','in_progress')),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('pending','in_progress') AND due_date IS NOT NULL
      AND deadline_details->>'state' IN ('calculated','manual_review','unsupported_calendar')
      AND due_date < (v_now AT TIME ZONE (deadline_details->>'time_zone'))::date),
    count(*) FILTER (WHERE deleted_at IS NULL AND status IN ('pending','in_progress')
      AND (deadline_details IS NULL OR deadline_details->>'state' IS DISTINCT FROM 'calculated'))
  INTO v_pd_open, v_pd_overdue, v_pd_review
  FROM public.data_subject_requests
  WHERE organization_id = p_organization_id
    AND public.uc_dsr_can_manage(organization_id,user_id,false)
    AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations v WHERE v.user_id=data_subject_requests.user_id);$new$);
 new_body:=replace(new_body,$old$'pd_requests_overdue', v_pd_overdue,$old$,$new$'pd_requests_overdue', v_pd_overdue,
    'pd_requests_review_required', v_pd_review,$new$);
 IF new_body=old_body OR position('v_pd_review' IN new_body)=0 OR position('v_pd_open, v_pd_overdue, v_pd_review' IN new_body)=0
 THEN RAISE EXCEPTION 'KPI finite replacement failed'; END IF;
 definition:=pg_get_functiondef('public.get_documents_kpi(uuid)'::regprocedure);
 IF position(old_body IN replace(definition,chr(13)||chr(10),chr(10)))=0 THEN RAISE EXCEPTION 'KPI definition body mismatch'; END IF;
 EXECUTE replace(replace(definition,chr(13)||chr(10),chr(10)),old_body,new_body);
END;$kpi$;
DO $metadata$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.uc023_old_proc_metadata b LEFT JOIN pg_proc p ON p.oid=b.oid
  WHERE p.oid IS NULL OR (to_jsonb(p)-'prosrc') IS DISTINCT FROM b.metadata)
 THEN RAISE EXCEPTION 'UC023 changed existing function metadata'; END IF;
END;$metadata$;
