-- Additive managed Rostekhnadzor banks. No existing course, result or billing
-- row/policy is changed. Public questions are distinct from reviewed keys.
BEGIN;
-- Provider Storage owns bucket creation. Create rtn-sources through the
-- supported Storage API first (public=false), then apply this migration.
-- A NULL limit is the provider default; the worker and SQL independently cap
-- every original at 50 MiB. Do not repair or mutate an existing bucket here.
DO $bucket_precondition$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='rtn-sources' AND name='rtn-sources'
  AND public IS FALSE AND(file_size_limit IS NULL OR file_size_limit=52428800))
 THEN RAISE EXCEPTION 'rtn_private_source_bucket_precondition_required';END IF;
END;$bucket_precondition$;
CREATE SCHEMA rtn_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA rtn_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION rtn_private.official_url(p_url text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT p_url IS NOT NULL AND p_url ~ '^https://(www\.)?gosnadzor\.ru/(service/list/|energy/|upload/)[^[:space:]#]*$'
$fn$;

CREATE TABLE rtn_private.sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,title text NOT NULL,
 page_url text NOT NULL CHECK(rtn_private.official_url(page_url)),
 document_url text NOT NULL CHECK(rtn_private.official_url(document_url)),
 trusted_anchor_rule text NOT NULL CHECK(trusted_anchor_rule IN('a1','energy-xlsx')),
 parser text NOT NULL CHECK(parser IN('industrial-pdf','energy-xlsx')),sheet text,
 last_checked_at timestamptz,last_success_at timestamptz,last_full_check_at timestamptz,
 last_sha256 text CHECK(last_sha256 ~ '^[0-9a-f]{64}$'),last_status text,source_generation integer NOT NULL DEFAULT 0 CHECK(source_generation>=0),
 last_resolved_page_url text CHECK(last_resolved_page_url IS NULL OR rtn_private.official_url(last_resolved_page_url)),
 last_document_url text CHECK(last_document_url IS NULL OR rtn_private.official_url(last_document_url)),
 active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rtn_private.banks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id uuid NOT NULL REFERENCES rtn_private.sources(id),
 code text NOT NULL UNIQUE,title text NOT NULL,domain text NOT NULL,parent_bank_id uuid REFERENCES rtn_private.banks(id),
 UNIQUE(source_id,id)
);
CREATE TABLE rtn_private.source_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id uuid NOT NULL REFERENCES rtn_private.sources(id),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),original_path text NOT NULL,
 media_type text NOT NULL,byte_size bigint NOT NULL CHECK(byte_size>0 AND byte_size<=52428800),
 document_url text NOT NULL CHECK(rtn_private.official_url(document_url)),
 metadata jsonb NOT NULL DEFAULT '{}',captured_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,sha256),UNIQUE(source_id,id)
);
CREATE TABLE rtn_private.bank_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),
 source_revision_id uuid NOT NULL REFERENCES rtn_private.source_revisions(id),
 questions jsonb NOT NULL CHECK(jsonb_typeof(questions)='array' AND jsonb_array_length(questions)>0),
 parent_bank_revision_id uuid REFERENCES rtn_private.bank_revisions(id),
 previous_revision_id uuid REFERENCES rtn_private.bank_revisions(id),normalization_version integer NOT NULL DEFAULT 1 CHECK(normalization_version>0),
 normalized_sha256 text NOT NULL CHECK(normalized_sha256 ~ '^[0-9a-f]{64}$'),
 normalization_note text NOT NULL CHECK(length(btrim(normalization_note)) BETWEEN 10 AND 4000),
 question_count integer NOT NULL CHECK(question_count>0),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(bank_id,source_revision_id,normalization_version),UNIQUE(bank_id,parent_bank_revision_id),UNIQUE(bank_id,id)
);
CREATE TABLE rtn_private.key_sets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_id uuid NOT NULL,
 bank_revision_id uuid NOT NULL,questions jsonb NOT NULL,materials jsonb NOT NULL DEFAULT '[]',
 display_title text NOT NULL CHECK(length(btrim(display_title)) BETWEEN 1 AND 1000),source_generation integer NOT NULL CHECK(source_generation>0),
 review_note text NOT NULL CHECK(length(btrim(review_note)) BETWEEN 10 AND 4000),
 reviewed_by uuid NOT NULL,reviewed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(bank_id,bank_revision_id) REFERENCES rtn_private.bank_revisions(bank_id,id),
 UNIQUE(bank_id,id)
);
CREATE TABLE rtn_private.releases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_id uuid NOT NULL,key_set_id uuid NOT NULL,
 effective_from date NOT NULL,release_note text NOT NULL CHECK(length(btrim(release_note)) BETWEEN 10 AND 4000),
 published_by uuid NOT NULL,published_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(bank_id,key_set_id) REFERENCES rtn_private.key_sets(bank_id,id),
 UNIQUE(key_set_id),UNIQUE(bank_id,id)
);
CREATE INDEX rtn_releases_current ON rtn_private.releases(bank_id,effective_from DESC,published_at DESC);
CREATE TABLE rtn_private.pilot_grants(
 organization_id uuid NOT NULL REFERENCES public.organizations(id),bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,bank_id),
 -- Exact bounded test exceptions; no payment or financial access is granted.
 CHECK(organization_id IN('cdd87239-1b04-47c9-8cd6-7ad57af4c54b'::uuid,
  '0e29e728-bcc5-46e6-a339-066fb1e9c726'::uuid,'f7701297-2c10-4f8e-8123-4016cee9984f'::uuid))
);
CREATE TABLE rtn_private.settings(
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),notify_updates boolean NOT NULL DEFAULT true,
 show_archived_releases boolean NOT NULL DEFAULT false,updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rtn_private.check_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),source_id uuid NOT NULL REFERENCES rtn_private.sources(id),
 organization_id uuid REFERENCES public.organizations(id),requested_by uuid,
 kind text NOT NULL CHECK(kind IN('manual','daily','weekly')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','unchanged','changed','error')),
 queued_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,
 lease_token uuid,lease_expires_at timestamptz,attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
 revision_id uuid REFERENCES rtn_private.source_revisions(id),http_status integer,error text,result_metadata jsonb NOT NULL DEFAULT '{}',
 CHECK((kind='manual')=(organization_id IS NOT NULL AND requested_by IS NOT NULL))
);
CREATE UNIQUE INDEX rtn_one_open_source_check ON rtn_private.check_runs(source_id) WHERE status IN('queued','running');
CREATE INDEX rtn_check_runs_recent ON rtn_private.check_runs(source_id,queued_at DESC);
CREATE TABLE rtn_private.assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),student_id uuid NOT NULL REFERENCES public.profiles(id),
 student_user_id uuid NOT NULL,group_id uuid REFERENCES public.student_groups(id),
 assigned_by uuid NOT NULL,assigned_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'assigned' CHECK(status IN('assigned','in_progress','completed')),
 UNIQUE(organization_id,bank_id,student_id),UNIQUE(organization_id,id)
);
CREATE TABLE rtn_private.attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,assignment_id uuid NOT NULL,
 student_user_id uuid NOT NULL,release_id uuid NOT NULL REFERENCES rtn_private.releases(id),
 title_snapshot text NOT NULL,code_snapshot text NOT NULL,
 question_snapshot jsonb NOT NULL,key_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','submitted')),
 started_at timestamptz NOT NULL DEFAULT now(),submitted_at timestamptz,
 answers jsonb,correct integer,total integer NOT NULL CHECK(total>0),score numeric,passed boolean,
 FOREIGN KEY(organization_id,assignment_id) REFERENCES rtn_private.assignments(organization_id,id),
 CHECK((status='active' AND submitted_at IS NULL AND answers IS NULL AND score IS NULL AND passed IS NULL)
    OR(status='submitted' AND submitted_at IS NOT NULL AND answers IS NOT NULL AND score IS NOT NULL AND passed IS NOT NULL))
);
CREATE UNIQUE INDEX rtn_one_active_attempt ON rtn_private.attempts(assignment_id) WHERE status='active';
CREATE INDEX rtn_attempts_staff_result ON rtn_private.attempts(organization_id,submitted_at DESC);

-- Keys and originals never become ordinary PostgREST tables, even for the
-- service role. Only scoped definer RPCs may mutate this private schema.
DO $rls$ DECLARE t text;BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='rtn_private' LOOP
  EXECUTE format('ALTER TABLE rtn_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON rtn_private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END;$rls$;
CREATE FUNCTION rtn_private.reject_mutation() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $fn$ BEGIN RAISE EXCEPTION 'rtn_history_is_immutable' USING ERRCODE='42501';END;$fn$;
DO $immutable$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['source_revisions','bank_revisions','key_sets','releases'] LOOP
  EXECUTE format('CREATE TRIGGER rtn_immutable BEFORE UPDATE OR DELETE ON rtn_private.%I FOR EACH ROW EXECUTE FUNCTION rtn_private.reject_mutation()',t);
  EXECUTE format('CREATE TRIGGER rtn_no_truncate BEFORE TRUNCATE ON rtn_private.%I FOR EACH STATEMENT EXECUTE FUNCTION rtn_private.reject_mutation()',t);
 END LOOP;
END;$immutable$;
CREATE FUNCTION rtn_private.freeze_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'rtn_attempt_history_is_immutable' USING ERRCODE='42501';END IF;
 IF OLD.status='submitted' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
 OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id OR NEW.student_user_id IS DISTINCT FROM OLD.student_user_id
 OR NEW.release_id IS DISTINCT FROM OLD.release_id OR NEW.question_snapshot IS DISTINCT FROM OLD.question_snapshot
 OR NEW.title_snapshot IS DISTINCT FROM OLD.title_snapshot OR NEW.code_snapshot IS DISTINCT FROM OLD.code_snapshot
 OR NEW.key_snapshot IS DISTINCT FROM OLD.key_snapshot OR NEW.started_at IS DISTINCT FROM OLD.started_at
 OR NEW.total IS DISTINCT FROM OLD.total OR NEW.status<>'submitted'
 THEN RAISE EXCEPTION 'rtn_attempt_history_is_immutable' USING ERRCODE='42501';END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER rtn_attempt_frozen BEFORE UPDATE OR DELETE ON rtn_private.attempts FOR EACH ROW EXECUTE FUNCTION rtn_private.freeze_attempt();
CREATE TRIGGER rtn_attempt_no_truncate BEFORE TRUNCATE ON rtn_private.attempts FOR EACH STATEMENT EXECUTE FUNCTION rtn_private.reject_mutation();

CREATE FUNCTION rtn_private.actor_allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT auth.uid() IS NOT NULL AND auth.role()='authenticated' AND public.account_deletion_access_allowed()
 AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND blocked_at IS NOT NULL)
$fn$;
CREATE FUNCTION rtn_private.assert_service() RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $fn$
BEGIN IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'rtn_service_required' USING ERRCODE='42501';END IF;END;$fn$;
CREATE FUNCTION rtn_private.assert_admin() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT rtn_private.actor_allowed() OR NOT public.has_role(auth.uid(),'admin'::public.app_role)
 THEN RAISE EXCEPTION 'rtn_admin_required' USING ERRCODE='42501';END IF;RETURN auth.uid();
END;$fn$;
CREATE FUNCTION rtn_private.assert_staff(p_org uuid,p_permission text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT rtn_private.actor_allowed() OR NOT coalesce(public.can_access_organization(p_org,p_permission),false)
  OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.organization_id=p_org AND(p.archived_at IS NOT NULL OR p.blocked_at IS NOT NULL))
 THEN RAISE EXCEPTION 'rtn_organization_permission_required' USING ERRCODE='42501';END IF;
END;$fn$;
CREATE FUNCTION rtn_private.entitled(p_org uuid,p_bank uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_org)
 AND NOT EXISTS(SELECT 1 FROM billing_access_private.active_holds h WHERE h.organization_id=p_org)
 AND(EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_org AND o.is_paid AND o.subscription_plan<>'free' AND o.paid_until>now())
 OR EXISTS(SELECT 1 FROM public.organization_billing_agreements a WHERE a.organization_id=p_org
  AND a.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date
  AND(a.effective_to IS NULL OR a.effective_to>(now() AT TIME ZONE 'Europe/Moscow')::date))
 OR EXISTS(SELECT 1 FROM rtn_private.pilot_grants p WHERE p.organization_id=p_org AND(p_bank IS NULL OR p.bank_id=p_bank)))
$fn$;
CREATE FUNCTION rtn_private.assert_entitled(p_org uuid,p_bank uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN IF NOT rtn_private.entitled(p_org,p_bank) THEN RAISE EXCEPTION 'rtn_active_platform_access_required' USING ERRCODE='42501';END IF;END;$fn$;
CREATE FUNCTION rtn_private.public_questions(p_questions jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',q->>'id','number',q->'number','text',q->>'text',
  'options_origin',coalesce(q->>'options_origin','official'),'expected_correct_count',CASE WHEN jsonb_typeof(q->'correct_option_ids')='array' THEN jsonb_array_length(q->'correct_option_ids') ELSE NULL END,'options',
  (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o->>'id','text',o->>'text') ORDER BY m),'[]'::jsonb)
   FROM jsonb_array_elements(q->'options') WITH ORDINALITY z(o,m))) ORDER BY n),'[]'::jsonb)
 FROM jsonb_array_elements(p_questions) WITH ORDINALITY a(q,n)
$fn$;
CREATE FUNCTION rtn_private.valid_questions(p_questions jsonb,p_reviewed boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE q jsonb;o jsonb;ids text[];option_ids text[];correct_ids text[];BEGIN
 IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_questions) NOT BETWEEN 1 AND 10000 THEN RETURN false;END IF;
 ids:=ARRAY[]::text[];
 FOR q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
  IF jsonb_typeof(q) IS DISTINCT FROM 'object' OR nullif(btrim(q->>'id'),'') IS NULL OR length(q->>'id')>160
   OR q->>'id'=ANY(ids) OR nullif(btrim(q->>'text'),'') IS NULL OR length(q->>'text')>30000
   OR coalesce(q->>'number','') !~ '^[1-9][0-9]{0,6}$' OR jsonb_typeof(q->'options') IS DISTINCT FROM 'array'
   OR jsonb_array_length(q->'options')>30 THEN RETURN false;END IF;
  ids:=array_append(ids,q->>'id');option_ids:=ARRAY[]::text[];
  FOR o IN SELECT value FROM jsonb_array_elements(q->'options') LOOP
   IF jsonb_typeof(o) IS DISTINCT FROM 'object' OR nullif(btrim(o->>'id'),'') IS NULL OR length(o->>'id')>160
    OR o->>'id'=ANY(option_ids) OR nullif(btrim(o->>'text'),'') IS NULL OR length(o->>'text')>10000 THEN RETURN false;END IF;
   option_ids:=array_append(option_ids,o->>'id');
  END LOOP;
  IF p_reviewed THEN
   IF cardinality(option_ids)<2 OR jsonb_typeof(q->'correct_option_ids') IS DISTINCT FROM 'array'
    OR jsonb_typeof(q->'evidence') IS DISTINCT FROM 'array' OR jsonb_array_length(q->'evidence')=0 THEN RETURN false;END IF;
   SELECT array_agg(value) INTO correct_ids FROM jsonb_array_elements_text(q->'correct_option_ids');
   IF coalesce(cardinality(correct_ids),0)=0 OR NOT correct_ids<@option_ids
    OR cardinality(correct_ids)<>(SELECT count(DISTINCT x) FROM unnest(correct_ids)x) THEN RETURN false;END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(q->'evidence')e WHERE nullif(btrim(e->>'citation'),'') IS NULL OR length(e->>'citation')>4000
    OR(coalesce(e->>'url','') !~ '^https://' AND coalesce(e->>'url','') !~ '^http://(publication\.)?pravo\.gov\.ru/')) THEN RETURN false;END IF;
  ELSIF q ?| ARRAY['correct_option_ids','correct_answer','answer','is_correct','key','evidence'] THEN RETURN false;
  END IF;
 END LOOP;RETURN true;
END;$fn$;
CREATE FUNCTION rtn_private.safe_metadata(p_value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE k text;v jsonb;result jsonb;BEGIN
 IF jsonb_typeof(p_value)='object' THEN
  result:='{}';FOR k,v IN SELECT * FROM jsonb_each(p_value) LOOP
   IF k !~* '(authorization|cookie|password|token|secret|api.?key|headers)' THEN result:=result||jsonb_build_object(k,rtn_private.safe_metadata(v));END IF;
  END LOOP;RETURN result;
 ELSIF jsonb_typeof(p_value)='array' THEN SELECT coalesce(jsonb_agg(rtn_private.safe_metadata(value)),'[]') INTO result FROM jsonb_array_elements(p_value);RETURN result;
 ELSE RETURN p_value;END IF;
END;$fn$;
CREATE FUNCTION rtn_private.valid_materials(p_materials jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE m jsonb;ids text[]:=ARRAY[]::text[];BEGIN
 IF jsonb_typeof(p_materials) IS DISTINCT FROM 'array' OR jsonb_array_length(p_materials) NOT BETWEEN 1 AND 100 OR octet_length(p_materials::text)>2097152 THEN RETURN false;END IF;
 FOR m IN SELECT value FROM jsonb_array_elements(p_materials) LOOP
  IF nullif(btrim(m->>'id'),'') IS NULL OR length(m->>'id')>160 OR m->>'id'=ANY(ids)
   OR length(coalesce(m->>'title','')) NOT BETWEEN 1 AND 1000 OR length(coalesce(m->>'body','')) NOT BETWEEN 1 AND 60000
   OR jsonb_typeof(m->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(m->'source_refs') NOT BETWEEN 1 AND 20
  THEN RETURN false;END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(m->'source_refs')r WHERE length(coalesce(r->>'citation','')) NOT BETWEEN 1 AND 4000
   OR(coalesce(r->>'url','') !~ '^https://' AND coalesce(r->>'url','') !~ '^http://(publication\.)?pravo\.gov\.ru/')) THEN RETURN false;END IF;
  ids:=array_append(ids,m->>'id');
 END LOOP;RETURN true;
END;$fn$;

CREATE FUNCTION public.register_rtn_source(p_source jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE sid uuid;bid uuid;b jsonb;ids jsonb:='[]';BEGIN
 PERFORM rtn_private.assert_service();
 IF NOT rtn_private.official_url(p_source->>'page_url') OR NOT rtn_private.official_url(p_source->>'document_url')
 OR nullif(btrim(p_source->>'code'),'') IS NULL OR nullif(btrim(p_source->>'title'),'') IS NULL
 OR jsonb_typeof(p_source->'banks') IS DISTINCT FROM 'array' OR jsonb_array_length(p_source->'banks') NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'rtn_invalid_source' USING ERRCODE='22023';END IF;
 SELECT id INTO sid FROM rtn_private.sources WHERE code=p_source->>'code';
 IF sid IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM rtn_private.sources WHERE id=sid AND page_url=p_source->>'page_url' AND document_url=p_source->>'document_url'
   AND parser=p_source->>'parser' AND trusted_anchor_rule=p_source->>'trusted_anchor_rule' AND sheet IS NOT DISTINCT FROM p_source->>'sheet')
  THEN RAISE EXCEPTION 'rtn_source_registration_conflict' USING ERRCODE='40001';END IF;
 ELSE
  INSERT INTO rtn_private.sources(id,code,title,page_url,document_url,parser,trusted_anchor_rule,sheet)
  VALUES(coalesce((p_source->>'id')::uuid,gen_random_uuid()),p_source->>'code',p_source->>'title',p_source->>'page_url',p_source->>'document_url',p_source->>'parser',p_source->>'trusted_anchor_rule',p_source->>'sheet') RETURNING id INTO sid;
 END IF;
 FOR b IN SELECT value FROM jsonb_array_elements(p_source->'banks') LOOP
  IF nullif(btrim(b->>'code'),'') IS NULL OR nullif(btrim(b->>'title'),'') IS NULL OR nullif(btrim(b->>'domain'),'') IS NULL THEN RAISE EXCEPTION 'rtn_invalid_bank' USING ERRCODE='22023';END IF;
  INSERT INTO rtn_private.banks(source_id,code,title,domain) VALUES(sid,b->>'code',b->>'title',b->>'domain') ON CONFLICT(code) DO NOTHING RETURNING id INTO bid;
  IF bid IS NULL THEN SELECT id INTO bid FROM rtn_private.banks WHERE code=b->>'code' AND source_id=sid;END IF;
  IF bid IS NULL THEN RAISE EXCEPTION 'rtn_bank_registration_conflict' USING ERRCODE='40001';END IF;
  ids:=ids||jsonb_build_array(jsonb_build_object('id',bid,'code',b->>'code'));
  IF b->>'code' IN('A.1','А.1') THEN
   INSERT INTO rtn_private.pilot_grants(organization_id,bank_id)
    SELECT id,bid FROM public.organizations WHERE id IN('cdd87239-1b04-47c9-8cd6-7ad57af4c54b'::uuid,
     '0e29e728-bcc5-46e6-a339-066fb1e9c726'::uuid,'f7701297-2c10-4f8e-8123-4016cee9984f'::uuid) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('source_id',sid,'bank_ids',ids);
END;$fn$;

CREATE FUNCTION public.request_rtn_source_check(p_organization_id uuid,p_source_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r rtn_private.check_runs;BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.write');
 IF NOT EXISTS(SELECT 1 FROM rtn_private.banks WHERE source_id=p_source_id AND rtn_private.entitled(p_organization_id,id))
 THEN RAISE EXCEPTION 'rtn_source_access_required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rtn:source:'||p_source_id::text,20261114));
 SELECT * INTO r FROM rtn_private.check_runs WHERE source_id=p_source_id AND status IN('queued','running');
 IF FOUND THEN RETURN jsonb_build_object('run_id',r.id,'status',r.status,'queued_at',r.queued_at,'replayed',true);END IF;
 SELECT * INTO r FROM rtn_private.check_runs WHERE source_id=p_source_id AND queued_at>now()-interval '2 minutes' ORDER BY queued_at DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('run_id',r.id,'status',r.status,'queued_at',r.queued_at,'replayed',true);END IF;
 INSERT INTO rtn_private.check_runs(source_id,organization_id,requested_by,kind) VALUES(p_source_id,p_organization_id,auth.uid(),'manual') RETURNING * INTO r;
 RETURN jsonb_build_object('run_id',r.id,'status',r.status,'queued_at',r.queued_at,'replayed',false);
END;$fn$;
CREATE FUNCTION public.enqueue_due_rtn_checks() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s rtn_private.sources;rid uuid;ids jsonb:='[]';BEGIN
 PERFORM rtn_private.assert_service();
 FOR s IN SELECT * FROM rtn_private.sources WHERE active ORDER BY id FOR UPDATE SKIP LOCKED LOOP
  -- Expired third leases are terminal; lesser crashes are reclaimable.
  UPDATE rtn_private.check_runs SET status='error',completed_at=now(),error='worker_lease_expired',lease_token=NULL,lease_expires_at=NULL
   WHERE source_id=s.id AND status='running' AND lease_expires_at<now() AND attempt_count>=3;
  IF EXISTS(SELECT 1 FROM rtn_private.check_runs WHERE source_id=s.id AND status IN('queued','running')) THEN CONTINUE;END IF;
  IF s.last_checked_at IS NULL OR s.last_checked_at<=now()-interval '1 day'
    OR s.last_full_check_at IS NULL OR s.last_full_check_at<=now()-interval '7 days' THEN
   INSERT INTO rtn_private.check_runs(source_id,kind) VALUES(s.id,CASE WHEN s.last_full_check_at IS NULL OR s.last_full_check_at<=now()-interval '7 days' THEN 'weekly' ELSE 'daily' END) RETURNING id INTO rid;
   ids:=ids||jsonb_build_array(rid);
  END IF;
 END LOOP;RETURN jsonb_build_object('queued',jsonb_array_length(ids),'run_ids',ids);
END;$fn$;
CREATE FUNCTION public.claim_rtn_check(p_run_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r rtn_private.check_runs;s rtn_private.sources;BEGIN
 PERFORM rtn_private.assert_service();
 SELECT * INTO r FROM rtn_private.check_runs WHERE(p_run_id IS NULL OR id=p_run_id)
  AND(status='queued' OR(status='running' AND lease_expires_at<now())) AND attempt_count<3 ORDER BY queued_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE rtn_private.check_runs SET status='running',started_at=coalesce(started_at,now()),lease_token=gen_random_uuid(),lease_expires_at=now()+interval '10 minutes',attempt_count=attempt_count+1 WHERE id=r.id RETURNING * INTO r;
 SELECT * INTO STRICT s FROM rtn_private.sources WHERE id=r.source_id;
 RETURN jsonb_build_object('run_id',r.id,'lease_token',r.lease_token,'kind',r.kind,'lease_expires_at',r.lease_expires_at,
  'source',jsonb_build_object('id',s.id,'page_url',coalesce(s.last_resolved_page_url,s.page_url),'document_url',coalesce(s.last_document_url,s.document_url),'registered_page_url',s.page_url,'trusted_anchor_rule',s.trusted_anchor_rule,'parser',s.parser,'sheet',s.sheet,'last_sha256',s.last_sha256));
END;$fn$;
CREATE FUNCTION rtn_private.normalize_revision(p_revision uuid,p_banks jsonb,p_previous_revision_ids jsonb DEFAULT NULL,p_correction_note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s uuid;bid uuid;b jsonb;ids jsonb:='[]';seen text[]:=ARRAY[]::text[];prior rtn_private.bank_revisions;expected text;BEGIN
 SELECT source_id INTO s FROM rtn_private.source_revisions WHERE id=p_revision;
 IF s IS NULL OR jsonb_typeof(p_banks) IS DISTINCT FROM 'array' OR jsonb_array_length(p_banks)=0 THEN RAISE EXCEPTION 'rtn_invalid_normalization' USING ERRCODE='22023';END IF;
 -- Canonical lock order: source, immutable original, normalization. Publishing
 -- takes that same source lock before checking the latest reviewed context.
 PERFORM 1 FROM rtn_private.sources WHERE id=s FOR UPDATE;
 PERFORM 1 FROM rtn_private.source_revisions WHERE id=p_revision FOR UPDATE;
 IF p_previous_revision_ids IS NOT NULL AND(jsonb_typeof(p_previous_revision_ids) IS DISTINCT FROM 'object' OR length(btrim(coalesce(p_correction_note,''))) NOT BETWEEN 10 AND 4000)
 THEN RAISE EXCEPTION 'rtn_correction_note_and_cas_required' USING ERRCODE='22023';END IF;
 FOR b IN SELECT value FROM jsonb_array_elements(p_banks) LOOP
  SELECT id INTO bid FROM rtn_private.banks WHERE source_id=s AND code=b->>'code' AND parent_bank_id IS NULL;
  IF bid IS NULL OR b->>'code'=ANY(seen) OR NOT rtn_private.valid_questions(b->'questions',false) THEN RAISE EXCEPTION 'rtn_invalid_normalized_bank' USING ERRCODE='22023';END IF;
  seen:=array_append(seen,b->>'code');
  SELECT * INTO prior FROM rtn_private.bank_revisions WHERE bank_id=bid AND source_revision_id=p_revision ORDER BY normalization_version DESC LIMIT 1;
  IF FOUND THEN
   expected:=p_previous_revision_ids->>(b->>'code');
   IF prior.questions=b->'questions' THEN
    -- Exact retries never rewrite a normalization. A retry of a committed
    -- correction must name either that current row or its audited predecessor.
    IF p_previous_revision_ids IS NOT NULL AND expected IS DISTINCT FROM prior.id::text
     AND NOT(expected IS NOT DISTINCT FROM prior.previous_revision_id::text AND prior.normalization_note=p_correction_note)
    THEN RAISE EXCEPTION 'rtn_normalization_revision_conflict' USING ERRCODE='40001';END IF;
   ELSE
    IF p_previous_revision_ids IS NULL OR expected IS DISTINCT FROM prior.id::text
    THEN RAISE EXCEPTION 'rtn_normalization_revision_conflict' USING ERRCODE='40001';END IF;
    INSERT INTO rtn_private.bank_revisions(bank_id,source_revision_id,questions,question_count,previous_revision_id,normalization_version,normalized_sha256,normalization_note)
     VALUES(bid,p_revision,b->'questions',jsonb_array_length(b->'questions'),prior.id,prior.normalization_version+1,encode(sha256(convert_to((b->'questions')::text,'UTF8')),'hex'),p_correction_note);
   END IF;
  ELSE
   IF p_previous_revision_ids IS NOT NULL THEN RAISE EXCEPTION 'rtn_normalization_revision_conflict' USING ERRCODE='40001';END IF;
   INSERT INTO rtn_private.bank_revisions(bank_id,source_revision_id,questions,question_count,normalized_sha256,normalization_note)
    VALUES(bid,p_revision,b->'questions',jsonb_array_length(b->'questions'),encode(sha256(convert_to((b->'questions')::text,'UTF8')),'hex'),'Initial extraction from immutable official source');
  END IF;
  ids:=ids||jsonb_build_array(bid);
 END LOOP;
 IF jsonb_array_length(ids)<>(SELECT count(*) FROM rtn_private.banks WHERE source_id=s AND parent_bank_id IS NULL)
 THEN RAISE EXCEPTION 'rtn_partial_source_normalization' USING ERRCODE='22023';END IF;
 RETURN ids;
END;$fn$;
CREATE FUNCTION public.normalize_rtn_revision(p_source_revision_id uuid,p_normalized_banks jsonb,p_previous_revision_ids jsonb DEFAULT NULL,p_correction_note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ids jsonb;BEGIN
 PERFORM rtn_private.assert_service();ids:=rtn_private.normalize_revision(p_source_revision_id,p_normalized_banks,p_previous_revision_ids,p_correction_note);
 RETURN jsonb_build_object('revision_id',p_source_revision_id,'bank_ids',ids,'normalization_required',false);
END;$fn$;
CREATE FUNCTION public.complete_rtn_check(p_run_id uuid,p_lease_token uuid,p_result jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r rtn_private.check_runs;s rtn_private.sources;rev uuid;bid uuid;b jsonb;q jsonb;new_rev boolean:=false;ids jsonb:='[]';v_status text;meta jsonb;BEGIN
 PERFORM rtn_private.assert_service();
 SELECT * INTO r FROM rtn_private.check_runs WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'running' OR r.lease_token IS DISTINCT FROM p_lease_token OR r.lease_expires_at<=now()
 THEN RAISE EXCEPTION 'rtn_check_lease_conflict' USING ERRCODE='40001';END IF;
 SELECT * INTO STRICT s FROM rtn_private.sources WHERE id=r.source_id FOR UPDATE;
 v_status:=p_result->>'status';
 IF p_result ? 'metadata' AND(jsonb_typeof(p_result->'metadata') IS DISTINCT FROM 'object' OR octet_length((p_result->'metadata')::text)>262144)
 THEN RAISE EXCEPTION 'rtn_invalid_check_metadata' USING ERRCODE='22023';END IF;
 meta:=rtn_private.safe_metadata(coalesce(p_result->'metadata','{}'));
 IF meta ? 'source_page_url' AND NOT rtn_private.official_url(meta->>'source_page_url') THEN RAISE EXCEPTION 'rtn_untrusted_resolved_page' USING ERRCODE='22023';END IF;
 IF p_result ? 'document_url' AND NOT rtn_private.official_url(p_result->>'document_url') THEN RAISE EXCEPTION 'rtn_untrusted_resolved_document' USING ERRCODE='22023';END IF;
 IF v_status IS NULL OR v_status NOT IN('changed','unchanged','error') THEN RAISE EXCEPTION 'rtn_invalid_check_result' USING ERRCODE='22023';END IF;
 IF v_status<>'error' THEN
  IF coalesce(p_result->>'sha256','') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'rtn_invalid_source_hash' USING ERRCODE='22023';END IF;
  IF v_status='unchanged' AND s.last_sha256 IS DISTINCT FROM p_result->>'sha256' THEN RAISE EXCEPTION 'rtn_unchanged_hash_conflict' USING ERRCODE='22023';END IF;
  SELECT id INTO rev FROM rtn_private.source_revisions WHERE source_id=s.id AND sha256=p_result->>'sha256';
  IF rev IS NULL THEN
   IF v_status<>'changed' OR coalesce(p_result->>'original_path','') !~ ('^'||s.id::text||'/'||(p_result->>'sha256')||'\.(pdf|xlsx|json)$')
    OR NOT rtn_private.official_url(p_result->>'document_url')
   THEN RAISE EXCEPTION 'rtn_invalid_source_revision' USING ERRCODE='22023';END IF;
   INSERT INTO rtn_private.source_revisions(source_id,sha256,original_path,media_type,byte_size,document_url,metadata)
    VALUES(s.id,p_result->>'sha256',p_result->>'original_path',p_result->>'media_type',(p_result->>'byte_size')::bigint,p_result->>'document_url',meta) RETURNING id INTO rev;
   new_rev:=true;
   -- Scanned new originals are safely captured before OCR exists. They are
   -- visible as normalization_required and cannot be assigned or graded.
   IF p_result ? 'normalized_banks' AND p_result->'normalized_banks'<>'[]'::jsonb THEN
    ids:=rtn_private.normalize_revision(rev,p_result->'normalized_banks');
   END IF;
  END IF;
  v_status:=CASE WHEN s.last_sha256 IS NOT DISTINCT FROM p_result->>'sha256' THEN 'unchanged' ELSE 'changed' END;
 END IF;
 UPDATE rtn_private.check_runs SET status=v_status,completed_at=now(),revision_id=rev,http_status=(p_result->>'http_status')::integer,
  error=CASE WHEN v_status='error' THEN left(coalesce(p_result->>'error','source_check_failed'),1000) END,result_metadata=meta,lease_token=NULL,lease_expires_at=NULL WHERE id=r.id;
 UPDATE rtn_private.sources SET last_checked_at=now(),last_success_at=CASE WHEN v_status='error' THEN last_success_at ELSE now() END,
  last_full_check_at=CASE WHEN v_status<>'error' AND r.kind='weekly' THEN now() ELSE last_full_check_at END,
  source_generation=CASE WHEN v_status<>'error' AND last_sha256 IS DISTINCT FROM p_result->>'sha256' THEN source_generation+1 ELSE source_generation END,
  last_sha256=CASE WHEN v_status='error' THEN last_sha256 ELSE p_result->>'sha256' END,last_status=v_status,
  last_resolved_page_url=CASE WHEN v_status='error' THEN last_resolved_page_url ELSE coalesce(meta->>'source_page_url',last_resolved_page_url) END,
  last_document_url=CASE WHEN v_status='error' THEN last_document_url ELSE coalesce(p_result->>'document_url',last_document_url) END WHERE id=s.id;
 RETURN jsonb_build_object('run_id',r.id,'status',v_status,'revision_id',rev,'new_revision',new_rev,'bank_ids',ids,
  'normalization_required',v_status<>'error' AND NOT EXISTS(SELECT 1 FROM rtn_private.bank_revisions br WHERE br.source_revision_id=rev));
END;$fn$;

CREATE FUNCTION public.review_rtn_keys(p_bank_id uuid,p_bank_revision_id uuid,p_questions jsonb,p_review_note text,p_module jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;rev rtn_private.bank_revisions;kid uuid;q jsonb;orig jsonb;target_bank uuid:=p_bank_id;target_rev uuid:=p_bank_revision_id;parent rtn_private.banks;full_bank boolean:=coalesce(p_module->>'kind'='full_bank',false);v_title text;generation integer;BEGIN
 actor:=rtn_private.assert_admin();
 SELECT * INTO rev FROM rtn_private.bank_revisions WHERE id=p_bank_revision_id AND bank_id=p_bank_id;
 IF NOT FOUND OR NOT rtn_private.valid_questions(p_questions,true)
  OR((p_module IS NULL OR full_bank) AND jsonb_array_length(p_questions)<>rev.question_count)
  OR(p_module IS NOT NULL AND jsonb_array_length(p_questions)>rev.question_count)
 THEN RAISE EXCEPTION 'rtn_complete_review_required' USING ERRCODE='22023';END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
  SELECT x INTO orig FROM jsonb_array_elements(rev.questions)x WHERE x->>'id'=q->>'id' AND x->>'text'=q->>'text' AND x->'number'=q->'number';
  IF orig IS NULL
  THEN RAISE EXCEPTION 'rtn_review_source_mismatch' USING ERRCODE='22023';END IF;
  IF jsonb_array_length(orig->'options')=0 THEN
   IF q->>'options_origin' IS DISTINCT FROM 'authorial_training' THEN RAISE EXCEPTION 'rtn_authorial_options_must_be_explicit' USING ERRCODE='22023';END IF;
  ELSIF rtn_private.public_questions(jsonb_build_array(orig))->0->'options' IS DISTINCT FROM rtn_private.public_questions(jsonb_build_array(q))->0->'options'
  THEN RAISE EXCEPTION 'rtn_official_options_mismatch' USING ERRCODE='22023';END IF;
 END LOOP;
 IF p_module IS NOT NULL AND NOT rtn_private.valid_materials(p_module->'materials') THEN RAISE EXCEPTION 'rtn_valid_learning_materials_required' USING ERRCODE='22023';END IF;
 IF p_module IS NOT NULL AND NOT full_bank THEN
  IF nullif(btrim(p_module->>'code'),'') IS NULL OR nullif(btrim(p_module->>'title'),'') IS NULL OR nullif(btrim(p_module->>'domain'),'') IS NULL
  OR NOT rtn_private.valid_materials(p_module->'materials') THEN RAISE EXCEPTION 'rtn_invalid_module' USING ERRCODE='22023';END IF;
  SELECT * INTO STRICT parent FROM rtn_private.banks WHERE id=p_bank_id;
  IF parent.parent_bank_id IS NOT NULL THEN RAISE EXCEPTION 'rtn_nested_module_forbidden' USING ERRCODE='22023';END IF;
  INSERT INTO rtn_private.banks(source_id,code,title,domain,parent_bank_id) VALUES(parent.source_id,p_module->>'code',p_module->>'title',p_module->>'domain',parent.id)
   ON CONFLICT(code) DO NOTHING RETURNING id INTO target_bank;
  IF target_bank IS NULL THEN SELECT id INTO target_bank FROM rtn_private.banks WHERE code=p_module->>'code' AND parent_bank_id=parent.id;END IF;
  IF target_bank IS NULL THEN RAISE EXCEPTION 'rtn_module_registration_conflict' USING ERRCODE='40001';END IF;
  INSERT INTO rtn_private.bank_revisions(bank_id,source_revision_id,questions,question_count,parent_bank_revision_id,normalization_version,normalized_sha256,normalization_note)
   SELECT target_bank,rev.source_revision_id,subset,jsonb_array_length(p_questions),rev.id,rev.normalization_version,encode(sha256(convert_to(subset::text,'UTF8')),'hex'),'Reviewed module subset of normalization '||rev.id::text
   FROM(SELECT jsonb_agg(x ORDER BY n)subset FROM jsonb_array_elements(rev.questions) WITH ORDINALITY z(x,n) WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p_questions)q2 WHERE q2->>'id'=x->>'id'))subset_source
   ON CONFLICT(bank_id,parent_bank_revision_id) DO NOTHING RETURNING id INTO target_rev;
  IF target_rev IS NULL THEN
   SELECT id INTO target_rev FROM rtn_private.bank_revisions WHERE bank_id=target_bank AND parent_bank_revision_id=rev.id AND question_count=jsonb_array_length(p_questions)
    AND questions=(SELECT jsonb_agg(x ORDER BY n) FROM jsonb_array_elements(rev.questions) WITH ORDINALITY z(x,n) WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p_questions)q2 WHERE q2->>'id'=x->>'id'));
  END IF;
  IF target_rev IS NULL THEN RAISE EXCEPTION 'rtn_module_coverage_conflict' USING ERRCODE='40001';END IF;
  INSERT INTO rtn_private.pilot_grants(organization_id,bank_id) SELECT organization_id,target_bank FROM rtn_private.pilot_grants WHERE bank_id=parent.id ON CONFLICT DO NOTHING;
 END IF;
 SELECT coalesce(nullif(btrim(p_module->>'title'),''),b.title) INTO v_title FROM rtn_private.banks b WHERE b.id=target_bank;
 SELECT s.source_generation INTO generation FROM rtn_private.banks b JOIN rtn_private.sources s ON s.id=b.source_id WHERE b.id=target_bank;
 PERFORM pg_advisory_xact_lock(hashtextextended('rtn:review:'||target_rev::text,20261114));
 SELECT id INTO kid FROM rtn_private.key_sets WHERE bank_id=target_bank AND bank_revision_id=target_rev AND reviewed_by=actor
  AND questions=p_questions AND materials=coalesce(p_module->'materials','[]') AND display_title=v_title AND source_generation=generation AND review_note=p_review_note ORDER BY reviewed_at,id LIMIT 1;
 IF kid IS NOT NULL THEN RETURN jsonb_build_object('key_set_id',kid,'bank_id',target_bank,'bank_revision_id',target_rev,'key_status','reviewed','reviewed_by',actor,'replayed',true);END IF;
 INSERT INTO rtn_private.key_sets(bank_id,bank_revision_id,questions,materials,display_title,source_generation,review_note,reviewed_by)
  VALUES(target_bank,target_rev,p_questions,coalesce(p_module->'materials','[]'),v_title,generation,p_review_note,actor) RETURNING id INTO kid;
 RETURN jsonb_build_object('key_set_id',kid,'bank_id',target_bank,'bank_revision_id',target_rev,'key_status','reviewed','reviewed_by',actor,'replayed',false);
END;$fn$;
CREATE FUNCTION public.publish_rtn_release(p_key_set_id uuid,p_effective_from date,p_release_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;k rtn_private.key_sets;rid uuid;prior rtn_private.releases;source_effective text;b rtn_private.banks;br rtn_private.bank_revisions;sr rtn_private.source_revisions;s rtn_private.sources;latest_parent uuid;BEGIN
 actor:=rtn_private.assert_admin();SELECT * INTO k FROM rtn_private.key_sets WHERE id=p_key_set_id;
 IF NOT FOUND OR p_effective_from IS NULL THEN RAISE EXCEPTION 'rtn_reviewed_keys_required' USING ERRCODE='22023';END IF;
 SELECT * INTO STRICT b FROM rtn_private.banks WHERE id=k.bank_id;
 SELECT * INTO STRICT br FROM rtn_private.bank_revisions WHERE id=k.bank_revision_id;
 SELECT * INTO STRICT sr FROM rtn_private.source_revisions WHERE id=br.source_revision_id;
 SELECT * INTO STRICT s FROM rtn_private.sources WHERE id=b.source_id FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('rtn:publish:'||k.id::text,20261114));
 SELECT * INTO prior FROM rtn_private.releases WHERE key_set_id=k.id;
 IF FOUND THEN
  IF prior.effective_from IS DISTINCT FROM p_effective_from OR prior.release_note IS DISTINCT FROM p_release_note THEN RAISE EXCEPTION 'rtn_release_request_conflict' USING ERRCODE='40001';END IF;
  RETURN jsonb_build_object('release_id',prior.id,'bank_id',prior.bank_id,'effective_from',prior.effective_from,'key_status','released','replayed',true);
 END IF;
 IF s.last_sha256 IS DISTINCT FROM sr.sha256 OR k.source_generation IS DISTINCT FROM s.source_generation THEN RAISE EXCEPTION 'rtn_release_source_is_not_current' USING ERRCODE='40001';END IF;
 SELECT id INTO latest_parent FROM rtn_private.bank_revisions WHERE bank_id=coalesce(b.parent_bank_id,b.id) AND source_revision_id=sr.id ORDER BY normalization_version DESC LIMIT 1;
 IF latest_parent IS NULL OR(b.parent_bank_id IS NULL AND latest_parent IS DISTINCT FROM br.id)
  OR(b.parent_bank_id IS NOT NULL AND latest_parent IS DISTINCT FROM br.parent_bank_revision_id)
 THEN RAISE EXCEPTION 'rtn_release_normalization_is_not_current' USING ERRCODE='40001';END IF;
 IF NOT rtn_private.valid_materials(k.materials) THEN RAISE EXCEPTION 'rtn_valid_learning_materials_required' USING ERRCODE='22023';END IF;
 source_effective:=sr.metadata->>'effective_from';
 IF source_effective IS NOT NULL AND(source_effective !~ '^\d{4}-\d{2}-\d{2}$' OR p_effective_from<source_effective::date)
 THEN RAISE EXCEPTION 'rtn_release_before_source_effective_date' USING ERRCODE='22023';END IF;
 INSERT INTO rtn_private.releases(bank_id,key_set_id,effective_from,release_note,published_by)
  VALUES(k.bank_id,k.id,p_effective_from,p_release_note,actor) RETURNING id INTO rid;
 RETURN jsonb_build_object('release_id',rid,'bank_id',k.bank_id,'effective_from',p_effective_from,'key_status','released','replayed',false);
END;$fn$;
CREATE FUNCTION public.save_rtn_settings(p_organization_id uuid,p_notify_updates boolean,p_show_archived_releases boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.write');PERFORM rtn_private.assert_entitled(p_organization_id);
 IF p_notify_updates IS NULL OR p_show_archived_releases IS NULL THEN RAISE EXCEPTION 'rtn_invalid_settings' USING ERRCODE='22023';END IF;
 INSERT INTO rtn_private.settings VALUES(p_organization_id,p_notify_updates,p_show_archived_releases,auth.uid(),now())
 ON CONFLICT(organization_id) DO UPDATE SET notify_updates=excluded.notify_updates,show_archived_releases=excluded.show_archived_releases,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 RETURN jsonb_build_object('notify_updates',p_notify_updates,'show_archived_releases',p_show_archived_releases);
END;$fn$;
CREATE FUNCTION public.get_rtn_editorial_workspace() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM rtn_private.assert_admin();
 RETURN jsonb_build_object(
  'sources',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.code),'[]') FROM rtn_private.sources s),
  'banks',(SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.code),'[]') FROM rtn_private.banks b),
  'source_revisions',(SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('normalization_required',NOT EXISTS(SELECT 1 FROM rtn_private.bank_revisions br WHERE br.source_revision_id=r.id)) ORDER BY r.captured_at DESC,r.id),'[]') FROM rtn_private.source_revisions r),
  'bank_revisions',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id),'[]') FROM rtn_private.bank_revisions r),
  'key_sets',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',k.id,'bank_id',k.bank_id,'bank_revision_id',k.bank_revision_id,'display_title',k.display_title,'question_count',jsonb_array_length(k.questions),'material_count',jsonb_array_length(k.materials),'review_note',k.review_note,'reviewed_by',k.reviewed_by,'reviewed_at',k.reviewed_at) ORDER BY k.reviewed_at DESC,k.id),'[]') FROM rtn_private.key_sets k),
  'releases',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.published_at DESC,r.id),'[]') FROM rtn_private.releases r));
END;$fn$;

CREATE FUNCTION public.assign_rtn_training(p_organization_id uuid,p_bank_id uuid,p_student_ids uuid[],p_group_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE sid uuid;p public.profiles;a rtn_private.assignments;items jsonb:='[]';all_replayed boolean:=true;BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.write');PERFORM rtn_private.assert_staff(p_organization_id,'students.write');PERFORM rtn_private.assert_entitled(p_organization_id,p_bank_id);
 IF NOT EXISTS(SELECT 1 FROM rtn_private.releases WHERE bank_id=p_bank_id AND effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date)
 THEN RAISE EXCEPTION 'rtn_released_bank_required' USING ERRCODE='22023';END IF;
 IF p_student_ids IS NULL OR cardinality(p_student_ids) NOT BETWEEN 1 AND 500 OR array_position(p_student_ids,NULL) IS NOT NULL
 THEN RAISE EXCEPTION 'rtn_invalid_students' USING ERRCODE='22023';END IF;
 IF p_group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_groups WHERE id=p_group_id AND organization_id=p_organization_id)
 THEN RAISE EXCEPTION 'rtn_foreign_group' USING ERRCODE='42501';END IF;
 FOR sid IN SELECT DISTINCT unnest(p_student_ids) LOOP
  SELECT * INTO p FROM public.profiles WHERE id=sid AND organization_id=p_organization_id AND archived_at IS NULL AND blocked_at IS NULL;
  IF NOT FOUND OR NOT public.is_student_profile(p.user_id,p_organization_id)
   OR EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p.user_id)
   OR(p_group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_organization_id AND m.group_id=p_group_id AND m.user_id=p.user_id))
  THEN RAISE EXCEPTION 'rtn_foreign_or_inactive_student' USING ERRCODE='42501';END IF;
  INSERT INTO rtn_private.assignments(organization_id,bank_id,student_id,student_user_id,group_id,assigned_by)
   VALUES(p_organization_id,p_bank_id,p.id,p.user_id,p_group_id,auth.uid()) ON CONFLICT(organization_id,bank_id,student_id) DO NOTHING RETURNING * INTO a;
  IF FOUND THEN all_replayed:=false;ELSE SELECT * INTO STRICT a FROM rtn_private.assignments WHERE organization_id=p_organization_id AND bank_id=p_bank_id AND student_id=sid;END IF;
  items:=items||jsonb_build_array(jsonb_build_object('id',a.id,'student_id',a.student_id,'bank_id',a.bank_id,'status',a.status,'assigned_at',a.assigned_at));
 END LOOP;RETURN jsonb_build_object('assignments',items,'replayed',all_replayed);
END;$fn$;
CREATE FUNCTION rtn_private.assert_learner_assignment(p_assignment uuid) RETURNS rtn_private.assignments LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a rtn_private.assignments;BEGIN
 SELECT * INTO a FROM rtn_private.assignments WHERE id=p_assignment;
 IF NOT FOUND OR NOT rtn_private.actor_allowed() OR a.student_user_id IS DISTINCT FROM auth.uid()
  OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=a.student_id AND p.user_id=auth.uid() AND p.organization_id=a.organization_id AND p.archived_at IS NULL AND p.blocked_at IS NULL)
  OR NOT public.is_student_profile(auth.uid(),a.organization_id)
 THEN RAISE EXCEPTION 'rtn_learner_assignment_required' USING ERRCODE='42501';END IF;
 PERFORM rtn_private.assert_entitled(a.organization_id,a.bank_id);RETURN a;
END;$fn$;
CREATE FUNCTION public.get_rtn_assignment(p_assignment_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a rtn_private.assignments;r rtn_private.releases;k rtn_private.key_sets;b rtn_private.banks;s rtn_private.sources;br rtn_private.bank_revisions;sr rtn_private.source_revisions;BEGIN
 a:=rtn_private.assert_learner_assignment(p_assignment_id);
 SELECT * INTO r FROM rtn_private.releases WHERE bank_id=a.bank_id AND effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date ORDER BY effective_from DESC,published_at DESC,id DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_released_bank_required' USING ERRCODE='22023';END IF;
 SELECT * INTO STRICT k FROM rtn_private.key_sets WHERE id=r.key_set_id;
 SELECT * INTO STRICT b FROM rtn_private.banks WHERE id=a.bank_id;
 SELECT * INTO STRICT s FROM rtn_private.sources WHERE id=b.source_id;
 SELECT * INTO STRICT br FROM rtn_private.bank_revisions WHERE id=k.bank_revision_id;
 SELECT * INTO STRICT sr FROM rtn_private.source_revisions WHERE id=br.source_revision_id;
  RETURN jsonb_build_object('assignment',jsonb_build_object('id',a.id,'organization_id',a.organization_id,'bank_id',b.id,'code',b.code,'title',k.display_title,'status',a.status),
  'release',jsonb_build_object('id',r.id,'effective_from',r.effective_from,'question_count',br.question_count),
  'source',jsonb_build_object('page_url',coalesce(sr.metadata->>'source_page_url',s.page_url),'document_url',sr.document_url,'approved_on',sr.metadata->>'approved_on'),
  'materials',k.materials);
END;$fn$;
CREATE FUNCTION public.start_rtn_attempt(p_assignment_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE a rtn_private.assignments;t rtn_private.attempts;r rtn_private.releases;k rtn_private.key_sets;BEGIN
 a:=rtn_private.assert_learner_assignment(p_assignment_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('rtn:assignment:'||a.id::text,20261114));
 SELECT * INTO t FROM rtn_private.attempts WHERE assignment_id=a.id AND status='active';
 IF NOT FOUND THEN
  SELECT * INTO r FROM rtn_private.releases WHERE bank_id=a.bank_id AND effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date ORDER BY effective_from DESC,published_at DESC,id DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'rtn_released_bank_required' USING ERRCODE='22023';END IF;
  SELECT * INTO STRICT k FROM rtn_private.key_sets WHERE id=r.key_set_id;
  INSERT INTO rtn_private.attempts(organization_id,assignment_id,student_user_id,release_id,title_snapshot,code_snapshot,question_snapshot,key_snapshot,total)
   VALUES(a.organization_id,a.id,a.student_user_id,r.id,k.display_title,(SELECT code FROM rtn_private.banks WHERE id=a.bank_id),rtn_private.public_questions(k.questions),k.questions,jsonb_array_length(k.questions)) RETURNING * INTO t;
  UPDATE rtn_private.assignments SET status='in_progress' WHERE id=a.id;
 END IF;
 RETURN jsonb_build_object('attempt_id',t.id,'release_id',t.release_id,'title',t.title_snapshot,'code',t.code_snapshot,'status',t.status,'questions',t.question_snapshot,'started_at',t.started_at,
  'materials',(SELECT k2.materials FROM rtn_private.releases r2 JOIN rtn_private.key_sets k2 ON k2.id=r2.key_set_id WHERE r2.id=t.release_id));
END;$fn$;
CREATE FUNCTION public.submit_rtn_attempt(p_attempt_id uuid,p_answers jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t rtn_private.attempts;a rtn_private.assignments;q jsonb;given text[];expected text[];valid_ids text[];v_correct integer:=0;answer_key text;BEGIN
 SELECT * INTO t FROM rtn_private.attempts WHERE id=p_attempt_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_attempt_not_found' USING ERRCODE='P0002';END IF;
 a:=rtn_private.assert_learner_assignment(t.assignment_id);
 IF t.status='submitted' THEN
  IF t.answers IS DISTINCT FROM p_answers THEN RAISE EXCEPTION 'rtn_submission_conflict' USING ERRCODE='40001';END IF;
 ELSE
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' OR octet_length(p_answers::text)>1048576 THEN RAISE EXCEPTION 'rtn_invalid_answers' USING ERRCODE='22023';END IF;
  FOR answer_key IN SELECT jsonb_object_keys(p_answers) LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(t.key_snapshot)qq WHERE qq->>'id'=answer_key) THEN RAISE EXCEPTION 'rtn_unknown_question' USING ERRCODE='22023';END IF;
  END LOOP;
  FOR q IN SELECT value FROM jsonb_array_elements(t.key_snapshot) LOOP
   IF jsonb_typeof(p_answers->(q->>'id')) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'rtn_all_answers_required' USING ERRCODE='22023';END IF;
   SELECT array_agg(value ORDER BY value) INTO given FROM jsonb_array_elements_text(p_answers->(q->>'id'));
   SELECT array_agg(value ORDER BY value) INTO expected FROM jsonb_array_elements_text(q->'correct_option_ids');
   SELECT array_agg(o->>'id') INTO valid_ids FROM jsonb_array_elements(q->'options')o;
   IF coalesce(cardinality(given),0)=0 OR NOT given<@valid_ids OR cardinality(given)<>(SELECT count(DISTINCT x) FROM unnest(given)x)
   THEN RAISE EXCEPTION 'rtn_invalid_answer_option' USING ERRCODE='22023';END IF;
   IF given=expected THEN v_correct:=v_correct+1;END IF;
  END LOOP;
  UPDATE rtn_private.attempts SET status='submitted',submitted_at=now(),answers=p_answers,correct=v_correct,
   score=round(100.0*v_correct/total,2),passed=(v_correct=total) WHERE id=t.id RETURNING * INTO t;
  UPDATE rtn_private.assignments SET status='completed' WHERE id=a.id;
 END IF;
 RETURN jsonb_build_object('attempt_id',t.id,'release_id',t.release_id,'status',t.status,'score',t.score,'total',t.total,'correct',t.correct,'passed',t.passed,'submitted_at',t.submitted_at);
END;$fn$;
CREATE FUNCTION public.get_rtn_attempt(p_attempt_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t rtn_private.attempts;a rtn_private.assignments;BEGIN
 SELECT * INTO t FROM rtn_private.attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_attempt_not_found' USING ERRCODE='P0002';END IF;
 IF t.student_user_id=auth.uid() THEN a:=rtn_private.assert_learner_assignment(t.assignment_id);
 ELSE PERFORM rtn_private.assert_staff(t.organization_id,'courses.read');PERFORM rtn_private.assert_staff(t.organization_id,'students.read');PERFORM rtn_private.assert_entitled(t.organization_id);END IF;
 RETURN jsonb_build_object('attempt_id',t.id,'assignment_id',t.assignment_id,'release_id',t.release_id,'title',t.title_snapshot,'code',t.code_snapshot,'status',t.status,'questions',t.question_snapshot,'answers',t.answers,'started_at',t.started_at,
  'score',t.score,'total',t.total,'correct',t.correct,'passed',t.passed,'submitted_at',t.submitted_at,
  'materials',(SELECT k2.materials FROM rtn_private.releases r2 JOIN rtn_private.key_sets k2 ON k2.id=r2.key_set_id WHERE r2.id=t.release_id),
  'feedback',CASE WHEN t.status='submitted' THEN(SELECT jsonb_agg(jsonb_build_object('id',q2->>'id','explanation',q2->>'explanation','evidence',q2->'evidence')) FROM jsonb_array_elements(t.key_snapshot)q2) ELSE NULL END);
END;$fn$;

CREATE FUNCTION public.get_rtn_workspace(p_organization_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE can_manage boolean;can_students boolean;allowed boolean;v_banks jsonb;v_checks jsonb;v_students jsonb:='[]';v_groups jsonb:='[]';v_assignments jsonb:='[]';v_results jsonb:='[]';v_settings jsonb;v_archived jsonb:='[]';BEGIN
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.read');
 allowed:=rtn_private.entitled(p_organization_id);
 can_manage:=allowed AND public.can_access_organization(p_organization_id,'courses.write');
 can_students:=allowed AND public.can_access_organization(p_organization_id,'students.read');
 SELECT jsonb_build_object('notify_updates',coalesce(s.notify_updates,true),'show_archived_releases',coalesce(s.show_archived_releases,false)) INTO v_settings
 FROM(VALUES(1))dummy(n) LEFT JOIN rtn_private.settings s ON s.organization_id=p_organization_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'title',coalesce(active_k.display_title,b.title),'domain',b.domain,'source_id',s.id,'source_url',coalesce(active_sr.metadata->>'source_page_url',sr.metadata->>'source_page_url',s.last_resolved_page_url,s.page_url),'document_url',coalesce(active_sr.document_url,sr.document_url,s.document_url),'latest_document_url',latest_sr.document_url,
  'approved_on',coalesce(active_sr.metadata->>'approved_on',sr.metadata->>'approved_on'),'effective_from',coalesce(r.effective_from::text,sr.metadata->>'effective_from'),
  'question_count',coalesce(active_br.question_count,br.question_count,0),'release_id',r.id,'source_revision_id',coalesce(active_br.source_revision_id,br.source_revision_id),'bank_revision_id',coalesce(active_br.id,br.id),
  'key_status',CASE WHEN r.id IS NOT NULL THEN 'released' WHEN EXISTS(SELECT 1 FROM rtn_private.key_sets k WHERE k.bank_revision_id=br.id) THEN 'reviewed' ELSE 'unreviewed' END,
  'available_for_training',r.id IS NOT NULL AND rtn_private.entitled(p_organization_id,b.id),'can_manual_check',can_manage AND rtn_private.entitled(p_organization_id,b.id),
  'parent_bank_id',b.parent_bank_id,'active_release',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('release_id',r.id,'source_revision_id',active_br.source_revision_id,'bank_revision_id',active_br.id,'question_count',active_br.question_count,'effective_from',r.effective_from,'approved_on',active_sr.metadata->>'approved_on') END,
  'coverage',jsonb_build_object('kind',CASE WHEN b.parent_bank_id IS NULL THEN 'full_bank' ELSE 'module' END,'question_count',coalesce(active_br.question_count,br.question_count,0),
   'source_question_count',coalesce((SELECT full_br.question_count FROM rtn_private.bank_revisions full_br WHERE full_br.id=coalesce(active_br.parent_bank_revision_id,br.parent_bank_revision_id)),active_br.question_count,br.question_count,0)),
  'normalization_version',coalesce(active_br.normalization_version,br.normalization_version),'normalized_sha256',coalesce(active_br.normalized_sha256,br.normalized_sha256),
  'latest_source_revision_id',latest_sr.id,'pending_source_revision_id',CASE WHEN latest_sr.id IS DISTINCT FROM active_br.source_revision_id
    OR(br.source_revision_id=latest_sr.id AND br.id IS DISTINCT FROM active_br.id)
    OR(b.parent_bank_id IS NOT NULL AND latest_parent.id IS DISTINCT FROM br.parent_bank_revision_id) THEN latest_sr.id END,
  'pending_bank_revision_id',CASE WHEN br.source_revision_id=latest_sr.id AND br.id IS DISTINCT FROM active_br.id THEN br.id END,
  'pending_key_status',CASE WHEN latest_sr.id IS DISTINCT FROM active_br.source_revision_id
    OR(br.source_revision_id=latest_sr.id AND br.id IS DISTINCT FROM active_br.id)
    OR(b.parent_bank_id IS NOT NULL AND latest_parent.id IS DISTINCT FROM br.parent_bank_revision_id) THEN
    CASE WHEN b.parent_bank_id IS NOT NULL AND latest_parent.id IS DISTINCT FROM br.parent_bank_revision_id THEN 'unreviewed'
     WHEN br.source_revision_id IS DISTINCT FROM latest_sr.id THEN 'normalization_required'
     WHEN EXISTS(SELECT 1 FROM rtn_private.key_sets k WHERE k.bank_revision_id=br.id) THEN 'reviewed' ELSE 'unreviewed' END ELSE NULL END,
  'last_checked_at',s.last_checked_at,'last_success_at',s.last_success_at,'check_status',coalesce(open_check.status,s.last_status,'not_checked')) ORDER BY b.code),'[]') INTO v_banks
 FROM rtn_private.banks b JOIN rtn_private.sources s ON s.id=b.source_id
 LEFT JOIN LATERAL(SELECT * FROM rtn_private.source_revisions x WHERE x.source_id=s.id AND x.sha256=s.last_sha256 LIMIT 1)latest_sr ON true
 LEFT JOIN LATERAL(SELECT x.* FROM rtn_private.bank_revisions x JOIN rtn_private.source_revisions xsr ON xsr.id=x.source_revision_id WHERE x.bank_id=b.id
  ORDER BY(x.source_revision_id=latest_sr.id) DESC,xsr.captured_at DESC,x.normalization_version DESC,x.created_at DESC,x.id DESC LIMIT 1)br ON true
 LEFT JOIN LATERAL(SELECT id FROM rtn_private.bank_revisions x WHERE x.bank_id=b.parent_bank_id AND x.source_revision_id=latest_sr.id ORDER BY x.normalization_version DESC LIMIT 1)latest_parent ON true
 LEFT JOIN rtn_private.source_revisions sr ON sr.id=br.source_revision_id
 LEFT JOIN LATERAL(SELECT * FROM rtn_private.releases x WHERE x.bank_id=b.id AND x.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date ORDER BY x.effective_from DESC,x.published_at DESC,x.id DESC LIMIT 1)r ON true
 LEFT JOIN rtn_private.key_sets active_k ON active_k.id=r.key_set_id
 LEFT JOIN rtn_private.bank_revisions active_br ON active_br.id=active_k.bank_revision_id
 LEFT JOIN rtn_private.source_revisions active_sr ON active_sr.id=active_br.source_revision_id
 LEFT JOIN LATERAL(SELECT status FROM rtn_private.check_runs c WHERE c.source_id=s.id AND c.status IN('queued','running') LIMIT 1)open_check ON true
 WHERE s.active;
 SELECT coalesce(jsonb_agg(x.payload ORDER BY x.queued_at DESC),'[]') INTO v_checks FROM(
  SELECT c.queued_at,jsonb_build_object('id',c.id,'run_id',c.id,'source_id',c.source_id,'kind',c.kind,'status',c.status,'queued_at',c.queued_at,'completed_at',c.completed_at,'error',c.error,'http_status',c.http_status,'revision_id',c.revision_id,
   'observations',c.result_metadata->'observations','source_page_url',c.result_metadata->>'source_page_url')payload
  FROM rtn_private.check_runs c WHERE EXISTS(SELECT 1 FROM rtn_private.banks b WHERE b.source_id=c.source_id)
  ORDER BY c.queued_at DESC LIMIT 30)x;
 IF allowed AND(v_settings->>'show_archived_releases')::boolean THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('bank_id',b.id,'bank_code',b.code,'title',k.display_title,'release_id',r.id,'key_set_id',k.id,'bank_revision_id',br.id,'source_revision_id',sr.id,
   'question_count',br.question_count,'effective_from',r.effective_from,'published_at',r.published_at,'is_current',coalesce(r.id=current_release.id,false),
   'state',CASE WHEN r.effective_from>(now() AT TIME ZONE 'Europe/Moscow')::date THEN 'scheduled' WHEN r.id=current_release.id THEN 'current' ELSE 'archived' END,
   'source_url',coalesce(sr.metadata->>'source_page_url',s.page_url),'document_url',sr.document_url) ORDER BY r.effective_from DESC,r.published_at DESC,r.id),'[]') INTO v_archived
  FROM rtn_private.releases r JOIN rtn_private.key_sets k ON k.id=r.key_set_id JOIN rtn_private.bank_revisions br ON br.id=k.bank_revision_id
  JOIN rtn_private.source_revisions sr ON sr.id=br.source_revision_id JOIN rtn_private.banks b ON b.id=r.bank_id JOIN rtn_private.sources s ON s.id=b.source_id
  LEFT JOIN LATERAL(SELECT id FROM rtn_private.releases x WHERE x.bank_id=b.id AND x.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date ORDER BY x.effective_from DESC,x.published_at DESC,x.id DESC LIMIT 1)current_release ON true;
 END IF;
 IF can_students THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'full_name',p.full_name,'group_id',p.student_group_id,
   'group_ids',coalesce((SELECT jsonb_agg(DISTINCT m.group_id ORDER BY m.group_id) FROM public.student_group_memberships_effective m
     WHERE m.organization_id=p_organization_id AND m.user_id=p.user_id AND m.group_id IS NOT NULL),
     CASE WHEN p.student_group_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p.student_group_id) END)) ORDER BY p.full_name,p.id),'[]') INTO v_students
   FROM public.profiles p WHERE p.organization_id=p_organization_id AND p.archived_at IS NULL AND p.blocked_at IS NULL
    AND public.is_student_profile(p.user_id,p_organization_id) AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations d WHERE d.user_id=p.user_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) ORDER BY g.name,g.id),'[]') INTO v_groups FROM public.student_groups g WHERE g.organization_id=p_organization_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'bank_id',a.bank_id,'student_id',a.student_id,'student_name',p.full_name,'group_id',a.group_id,'status',a.status,'assigned_at',a.assigned_at) ORDER BY a.assigned_at DESC),'[]') INTO v_assignments
   FROM rtn_private.assignments a JOIN public.profiles p ON p.id=a.student_id WHERE a.organization_id=p_organization_id;
  SELECT coalesce(jsonb_agg(x.payload ORDER BY x.started_at DESC),'[]') INTO v_results FROM(
   SELECT t.started_at,jsonb_build_object('attempt_id',t.id,'assignment_id',a.id,'bank_id',a.bank_id,'title',t.title_snapshot,'student_id',a.student_id,'student_name',p.full_name,'release_id',t.release_id,'status',t.status,'score',t.score,'correct',t.correct,'total',t.total,'passed',t.passed,'started_at',t.started_at,'submitted_at',t.submitted_at)payload
   FROM rtn_private.attempts t JOIN rtn_private.assignments a ON a.id=t.assignment_id JOIN public.profiles p ON p.id=a.student_id
   WHERE t.organization_id=p_organization_id ORDER BY t.started_at DESC LIMIT 200)x;
 END IF;
 RETURN jsonb_build_object('access',jsonb_build_object('allowed',allowed,'reason',CASE WHEN allowed THEN 'included' ELSE 'active_platform_access_required' END,
  'can_manage',can_manage,'can_assign',can_manage AND public.can_access_organization(p_organization_id,'students.write'),'can_view_results',can_students,
  'pilot',EXISTS(SELECT 1 FROM rtn_private.pilot_grants WHERE organization_id=p_organization_id),
  'pilot_kind',CASE WHEN p_organization_id='cdd87239-1b04-47c9-8cd6-7ad57af4c54b'::uuid THEN 'technoservice'
    WHEN EXISTS(SELECT 1 FROM rtn_private.pilot_grants WHERE organization_id=p_organization_id) THEN 'technical_qa' ELSE NULL END),
  'banks',v_banks,'settings',v_settings,'checks',v_checks,'students',v_students,'groups',v_groups,'assignments',v_assignments,'results',v_results,'archived_releases',v_archived);
END;$fn$;
CREATE FUNCTION public.get_rtn_student_workspace() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE items jsonb;BEGIN
 IF NOT rtn_private.actor_allowed() THEN RAISE EXCEPTION 'rtn_student_required' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'assignment_id',a.id,'organization_id',a.organization_id,'bank_id',b.id,'code',b.code,'title',coalesce(current_k.display_title,b.title),'status',a.status,'assigned_at',a.assigned_at,
  'access_allowed',rtn_private.entitled(a.organization_id,b.id),'last_attempt_id',t.id,'last_score',t.score,'last_passed',t.passed,
  'materials_available',EXISTS(SELECT 1 FROM rtn_private.releases r2 JOIN rtn_private.key_sets k2 ON k2.id=r2.key_set_id WHERE r2.bank_id=b.id AND r2.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date AND jsonb_array_length(k2.materials)>0)) ORDER BY a.assigned_at DESC),'[]') INTO items
 FROM rtn_private.assignments a JOIN public.profiles p ON p.id=a.student_id AND p.organization_id=a.organization_id AND p.user_id=auth.uid()
 JOIN rtn_private.banks b ON b.id=a.bank_id
 LEFT JOIN LATERAL(SELECT key_set_id FROM rtn_private.releases r2 WHERE r2.bank_id=b.id AND r2.effective_from<=(now() AT TIME ZONE 'Europe/Moscow')::date ORDER BY r2.effective_from DESC,r2.published_at DESC,r2.id DESC LIMIT 1)current_r ON true
 LEFT JOIN rtn_private.key_sets current_k ON current_k.id=current_r.key_set_id
 LEFT JOIN LATERAL(SELECT * FROM rtn_private.attempts x WHERE x.assignment_id=a.id ORDER BY x.started_at DESC,x.id DESC LIMIT 1)t ON true
 WHERE a.student_user_id=auth.uid() AND p.archived_at IS NULL AND p.blocked_at IS NULL AND public.is_student_profile(auth.uid(),a.organization_id);
 RETURN jsonb_build_object('assignments',items,'access',jsonb_build_object('allowed',true));
END;$fn$;

-- This restrictive fence is neutral for every existing bucket and keeps a
-- future broad permissive Storage policy from exposing source originals.
-- The trusted service role uses Storage's existing BYPASSRLS path.
CREATE POLICY rtn_source_originals_private_fence ON storage.objects AS RESTRICTIVE
FOR ALL TO anon,authenticated
USING(bucket_id<>'rtn-sources') WITH CHECK(bucket_id<>'rtn-sources');

-- Explicit least-privilege RPC allowlists. Internal helpers remain private.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA rtn_private FROM PUBLIC,anon,authenticated,service_role;
DO $acl$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname=ANY(ARRAY['register_rtn_source','request_rtn_source_check','enqueue_due_rtn_checks','claim_rtn_check','complete_rtn_check','normalize_rtn_revision','review_rtn_keys','publish_rtn_release','get_rtn_editorial_workspace','save_rtn_settings','assign_rtn_training','get_rtn_assignment','start_rtn_attempt','submit_rtn_attempt','get_rtn_attempt','get_rtn_workspace','get_rtn_student_workspace']) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname=ANY(ARRAY['register_rtn_source','enqueue_due_rtn_checks','claim_rtn_check','complete_rtn_check','normalize_rtn_revision']) THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  ELSE EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END;$acl$;
COMMIT;
