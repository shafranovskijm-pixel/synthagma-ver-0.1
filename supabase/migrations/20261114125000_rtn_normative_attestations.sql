-- NPA250 PRODUCT CANDIDATE; isolated review only, not deployed.
-- The supported provider supplies ONE atomic transaction around this payload.
CREATE TEMP TABLE rtn_npa_before_functions ON COMMIT DROP AS
 SELECT p.oid,to_jsonb(p)-'prosrc' metadata,p.prosrc,pg_get_functiondef(p.oid) definition FROM pg_proc p
 WHERE p.oid=ANY(ARRAY['public.assign_rtn_training(uuid,uuid,uuid[],uuid)'::regprocedure,
  'public.start_rtn_attempt(uuid)'::regprocedure,'public.get_rtn_workspace(uuid)'::regprocedure,
  'public.get_rtn_student_workspace()'::regprocedure,'public.get_rtn_assignment(uuid)'::regprocedure,
  'rtn_private.personal_counts(uuid)'::regprocedure,'rtn_private.erase_account_links(uuid,uuid)'::regprocedure]);
CREATE TEMP TABLE rtn_npa_existing_function_oids ON COMMIT DROP AS SELECT oid FROM pg_proc;
DO $preimage$ DECLARE e record;p pg_proc%ROWTYPE;BEGIN
 IF current_user<>'postgres'OR NOT EXISTS(SELECT 1 FROM rtn_private.rollout_state WHERE quota_integration_ready AND privacy_integration_ready)
  OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='rtn-sources'AND NOT public AND(file_size_limit IS NULL OR file_size_limit>=52428800))
 THEN RAISE EXCEPTION 'RTN_NPA_REQUIRES_REVIEWED_PRIVACY_QUOTA_OWNER';END IF;
 FOR e IN SELECT * FROM(VALUES
  ('public.assign_rtn_training(uuid,uuid,uuid[],uuid)','02888afc523ddac1ab0dc36fe49b32f1','v',true),
  ('public.start_rtn_attempt(uuid)','248cf0f1e7d057e3e5ed32f550a483d9','v',true),
  ('public.get_rtn_workspace(uuid)','f2ea884f5aa049fd0c94e4c4a986ff63','s',true),
  ('public.get_rtn_student_workspace()','c6b8feb5eac30a4fbc4d225e2ca036f4','s',true),
  ('public.get_rtn_assignment(uuid)','310195e49ac2dc174de9f58431e43cd5','s',true),
  ('rtn_private.personal_counts(uuid)','e3e42d1bd3065bbcff2cd2a75a59d3b4','s',false),
  ('rtn_private.erase_account_links(uuid,uuid)','54a692cd9a6d72451f896242a595b88e','v',false)
 )x(signature,body_md5,volatility,is_public)LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(e.signature);
  IF p.oid IS NULL OR md5(p.prosrc)<>e.body_md5 OR pg_get_userbyid(p.proowner)<>'postgres'OR NOT p.prosecdef
   OR p.provolatile::text<>e.volatility OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']
   OR p.proacl::text IS DISTINCT FROM(CASE WHEN e.is_public THEN '{postgres=X/postgres,authenticated=X/postgres}'ELSE '{postgres=X/postgres}'END)
  THEN RAISE EXCEPTION 'RTN_NPA_PREIMAGE_OR_AUTHORITY_CHANGED:%',e.signature;END IF;
 END LOOP;
END;$preimage$;

CREATE TABLE rtn_private.npa_configurations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),version integer NOT NULL,
 release_id uuid NOT NULL REFERENCES rtn_private.releases(id),context_sha256 text NOT NULL,
 previous_id uuid REFERENCES rtn_private.npa_configurations(id),basis jsonb NOT NULL,discovery_from date NOT NULL,
 request_id uuid NOT NULL UNIQUE,request_hash text,configured_by uuid,configuration_note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(bank_id,version)
);
CREATE TABLE rtn_private.npa_check_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),
 configuration_id uuid NOT NULL REFERENCES rtn_private.npa_configurations(id),
 release_id uuid NOT NULL REFERENCES rtn_private.releases(id),key_set_id uuid NOT NULL REFERENCES rtn_private.key_sets(id),
 manifest_id uuid,manifest_version integer NOT NULL DEFAULT 0,context jsonb NOT NULL,context_sha256 text NOT NULL,
 finding_epoch bigint NOT NULL DEFAULT 0,discovery_from date NOT NULL,discovery_to_exclusive date NOT NULL,
 origin text NOT NULL CHECK(origin IN('manual','scheduled','bootstrap')),requested_by uuid,requester_erased boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','completed')),
 queued_at timestamptz NOT NULL DEFAULT clock_timestamp(),started_at timestamptz,claimed_at timestamptz,completed_at timestamptz,
 lease_token uuid,lease_expires_at timestamptz,attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
 result jsonb,result_sha256 text,outcome text,error_code text,completion_lease_token uuid,completion_receipt_id uuid,
 CHECK((status='running')=(lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE UNIQUE INDEX npa_one_open_run_per_bank ON rtn_private.npa_check_runs(bank_id)WHERE status IN('queued','running');
CREATE TABLE rtn_private.npa_manifests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),
 configuration_id uuid NOT NULL REFERENCES rtn_private.npa_configurations(id),version integer NOT NULL,
 previous_id uuid REFERENCES rtn_private.npa_manifests(id),release_id uuid NOT NULL REFERENCES rtn_private.releases(id),
 key_set_id uuid NOT NULL REFERENCES rtn_private.key_sets(id),run_id uuid NOT NULL REFERENCES rtn_private.npa_check_runs(id),
 context jsonb NOT NULL,context_sha256 text NOT NULL,basis jsonb NOT NULL,coverage jsonb NOT NULL,
 stable_sha256 text NOT NULL,hard_stop_at timestamptz,acknowledged_epoch bigint NOT NULL,
 request_id uuid NOT NULL UNIQUE,request_hash text,approved_by uuid,approval_note text NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(bank_id,version)
);
ALTER TABLE rtn_private.npa_check_runs ADD CONSTRAINT npa_run_manifest FOREIGN KEY(manifest_id)REFERENCES rtn_private.npa_manifests(id);
CREATE TABLE rtn_private.npa_findings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),epoch bigint NOT NULL,
 run_id uuid NOT NULL REFERENCES rtn_private.npa_check_runs(id),identity_key text NOT NULL,
 observed_at timestamptz NOT NULL,ingested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 projection jsonb NOT NULL,projection_sha256 text NOT NULL,artifacts jsonb NOT NULL,reason text NOT NULL,
 UNIQUE(bank_id,epoch),UNIQUE(run_id,identity_key,projection_sha256)
);
CREATE TABLE rtn_private.npa_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL REFERENCES rtn_private.npa_check_runs(id),
 manifest_id uuid REFERENCES rtn_private.npa_manifests(id),active_manifest_at_commit uuid REFERENCES rtn_private.npa_manifests(id),
 outcome text NOT NULL CHECK(outcome IN('unchanged','needs_subject_review','unknown','partial_coverage','error')),
 checked_at timestamptz NOT NULL,valid_until_exclusive timestamptz,reason_codes text[]NOT NULL,
 finding_epoch bigint NOT NULL,stale_manifest boolean NOT NULL,proof_sha256 text NOT NULL,
 CHECK((outcome='unchanged')=(valid_until_exclusive IS NOT NULL))
);
CREATE UNIQUE INDEX npa_receipt_run_manifest ON rtn_private.npa_receipts(run_id,coalesce(manifest_id,'00000000-0000-0000-0000-000000000000'));
ALTER TABLE rtn_private.npa_check_runs ADD CONSTRAINT npa_completion_receipt FOREIGN KEY(completion_receipt_id)REFERENCES rtn_private.npa_receipts(id);
CREATE TABLE rtn_private.npa_manual_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bank_id uuid NOT NULL REFERENCES rtn_private.banks(id),
 release_id uuid NOT NULL REFERENCES rtn_private.releases(id),context_sha256 text NOT NULL,acknowledged_epoch bigint NOT NULL,
 evidence jsonb NOT NULL,reviewed_by uuid,review_note text NOT NULL,reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 request_id uuid NOT NULL UNIQUE,request_hash text
);
DO $tables$ DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['npa_configurations','npa_check_runs','npa_manifests','npa_findings','npa_receipts','npa_manual_reviews']LOOP
  EXECUTE format('ALTER TABLE rtn_private.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON rtn_private.%I FROM PUBLIC,anon,authenticated,service_role',name);
 END LOOP;
END;$tables$;

CREATE FUNCTION rtn_private.npa_sha(p_value jsonb)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT encode(sha256(convert_to(p_value::text,'UTF8')),'hex')
$fn$;
CREATE FUNCTION rtn_private.npa_iso(p_at timestamptz)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT to_char(p_at AT TIME ZONE'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$fn$;
CREATE FUNCTION rtn_private.npa_latest_release(p_bank uuid,p_at timestamptz)RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT id FROM rtn_private.releases WHERE bank_id=p_bank AND effective_from<=(p_at AT TIME ZONE'Europe/Moscow')::date ORDER BY effective_from DESC,published_at DESC,id DESC LIMIT 1
$fn$;

-- Source/generation/latest-normalization/latest-release fence; no customer data changes.
CREATE FUNCTION rtn_private.npa_context(p_release uuid,p_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r rtn_private.releases;k rtn_private.key_sets;b rtn_private.banks;br rtn_private.bank_revisions;
 s rtn_private.sources;sr rtn_private.source_revisions;parent_id uuid;latest_child uuid;BEGIN
 SELECT * INTO r FROM rtn_private.releases WHERE id=p_release;
 IF NOT FOUND OR p_at IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO STRICT k FROM rtn_private.key_sets WHERE id=r.key_set_id;
 SELECT * INTO STRICT b FROM rtn_private.banks WHERE id=r.bank_id;
 SELECT * INTO STRICT br FROM rtn_private.bank_revisions WHERE id=k.bank_revision_id;
 SELECT * INTO STRICT sr FROM rtn_private.source_revisions WHERE id=br.source_revision_id;
 SELECT * INTO STRICT s FROM rtn_private.sources WHERE id=b.source_id;
 IF NOT s.active OR s.last_sha256 IS DISTINCT FROM sr.sha256 OR s.source_generation<>k.source_generation
  OR r.id IS DISTINCT FROM(SELECT id FROM rtn_private.releases WHERE bank_id=b.id AND effective_from<=(p_at AT TIME ZONE'Europe/Moscow')::date ORDER BY effective_from DESC,published_at DESC,id DESC LIMIT 1)
 THEN RETURN NULL;END IF;
 SELECT id INTO parent_id FROM rtn_private.bank_revisions WHERE bank_id=coalesce(b.parent_bank_id,b.id) AND source_revision_id=sr.id ORDER BY normalization_version DESC LIMIT 1;
 SELECT id INTO latest_child FROM rtn_private.bank_revisions WHERE bank_id=b.id AND source_revision_id=sr.id ORDER BY normalization_version DESC LIMIT 1;
 IF parent_id IS NULL OR latest_child IS DISTINCT FROM br.id
  OR(b.parent_bank_id IS NULL AND parent_id IS DISTINCT FROM br.id)
  OR(b.parent_bank_id IS NOT NULL AND parent_id IS DISTINCT FROM br.parent_bank_revision_id)
 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('release_id',r.id,'key_set_id',k.id,'bank_id',b.id,'source_id',s.id,
  'source_generation',s.source_generation,'source_sha256',s.last_sha256,'source_revision_id',sr.id,
  'bank_revision_id',br.id,'child_normalization_sha256',br.normalized_sha256,'parent_revision_id',parent_id,
  'parent_normalization_sha256',(SELECT normalized_sha256 FROM rtn_private.bank_revisions WHERE id=parent_id),
  'questions_sha256',encode(sha256(convert_to(k.questions::text,'UTF8')),'hex'),
  'materials_sha256',encode(sha256(convert_to(k.materials::text,'UTF8')),'hex'),
  'title_sha256',encode(sha256(convert_to(k.display_title,'UTF8')),'hex'));
END;$fn$;

CREATE FUNCTION rtn_private.npa_time(p_value text)RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF p_value IS NULL OR p_value!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'THEN RETURN NULL;END IF;
 RETURN p_value::timestamptz;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN NULL;END;$fn$;
CREATE FUNCTION rtn_private.npa_date(p_value text)RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE d date;BEGIN
 IF p_value IS NULL OR p_value!~'^\d{4}-\d{2}-\d{2}$'OR left(p_value,4)='0000'THEN RETURN NULL;END IF;
 d:=p_value::date;IF to_char(d,'YYYY-MM-DD')<>p_value THEN RETURN NULL;END IF;RETURN d;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN NULL;END;$fn$;
CREATE FUNCTION rtn_private.npa_keys(p_value jsonb,p_allowed text[])RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_typeof(p_value)='object'AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(CASE WHEN jsonb_typeof(p_value)='object'THEN p_value ELSE '{}'::jsonb END)k WHERE NOT(k=ANY(p_allowed)))
$fn$;
CREATE FUNCTION rtn_private.npa_identity_key(p_value jsonb)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p_value->>'country','')||'|'||coalesce(p_value->>'kind','')||'|'||coalesce(p_value->>'date','')||'|'||coalesce(p_value->>'number','')||'|'||coalesce(p_value->>'docid','')
$fn$;
CREATE FUNCTION rtn_private.npa_supported(p_identity jsonb)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(p_identity->>'country'='RU'AND p_identity->>'kind'='FederalLaw'
 AND jsonb_typeof(p_identity->'docid')='number'AND p_identity->>'docid'~'^[1-9][0-9]{0,12}$'AND rtn_private.npa_date(p_identity->>'date')IS NOT NULL
 AND jsonb_typeof(p_identity->'number')='string'AND length(p_identity->>'number')BETWEEN 1 AND 100,false)
$fn$;

-- A genuine service lease plus an immutable object in the existing fenced
-- bucket constitutes the backend receiver boundary. SQL cannot attest remote
-- hardware; the deployed official worker and its egress/source tests are
-- separate release evidence. Browser clients have neither lease nor RPC grant.
CREATE FUNCTION rtn_private.npa_artifact_ok(p_artifact jsonb,p_run uuid,p_started timestamptz,p_claimed timestamptz,p_now timestamptz,p_question boolean DEFAULT false)RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE path text;sha text;bytes bigint;received timestamptz;url text;metadata jsonb;created timestamptz;BEGIN
 IF NOT coalesce(rtn_private.npa_keys(p_artifact,ARRAY['path','sha256','bytes','request_url','http_status','transport','received_at']),false)
  OR jsonb_typeof(p_artifact->'sha256')IS DISTINCT FROM'string'OR coalesce(p_artifact->>'sha256','')!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(p_artifact->'bytes')IS DISTINCT FROM'number'OR coalesce(p_artifact->>'bytes','')!~'^[1-9][0-9]{0,8}$'
  OR p_artifact->'http_status' IS DISTINCT FROM '200'::jsonb THEN RETURN false;END IF;
 sha:=p_artifact->>'sha256';bytes:=(p_artifact->>'bytes')::bigint;path:=p_artifact->>'path';url:=p_artifact->>'request_url';
 IF bytes>(CASE WHEN p_question THEN 52428800 ELSE 15728640 END)
  OR path!~('^npa250/'||p_run::text||'/'||sha||'\.(json|html|pdf|xml|bin)$')
  OR url IS NULL OR p_artifact->>'transport'IS NULL
  OR url~'[[:space:]#@]'OR length(url)>12000 OR url~*'(token|password|authorization|cookie|api[_-]?key|secret)='
 THEN RETURN false;END IF;
 IF p_question THEN
  IF NOT rtn_private.official_url(url)OR p_artifact->>'transport'<>'https'THEN RETURN false;END IF;
 ELSE
  IF NOT(url~'^http://actual\.pravo\.gov\.ru:8000/api/ebpi/[^#@[:space:]]*$'
   OR url~'^https?://(www\.)?publication\.pravo\.gov\.ru/(search|api/|document/|file/)[^#@[:space:]]*$')
   OR(p_artifact->>'transport')IS DISTINCT FROM split_part(url,':',1)THEN RETURN false;END IF;
 END IF;
 received:=rtn_private.npa_time(p_artifact->>'received_at');
 IF received IS NULL OR received<p_claimed-interval '30 seconds'OR received>p_now+interval '30 seconds'THEN RETURN false;END IF;
 SELECT o.metadata,o.created_at INTO metadata,created FROM storage.objects o WHERE bucket_id='rtn-sources'AND name=path;
 IF NOT FOUND OR created IS NULL OR created<p_started-interval '30 seconds'OR coalesce(metadata->>'size','')!~'^[0-9]{1,9}$'THEN RETURN false;END IF;
 RETURN(metadata->>'size')::bigint=bytes;
END;$fn$;

-- Normalize only the typed public-source projection. No request URL is ever
-- used as an instruction to fetch; artifact URLs are validated audit metadata.
CREATE FUNCTION rtn_private.npa_verified_basis(p_item jsonb,p_run rtn_private.npa_check_runs,p_now timestamptz)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s jsonb;i jsonb;c jsonb;g jsonb;a jsonb;name text;at timestamptz;max_received timestamptz;f jsonb;BEGIN
 IF NOT coalesce(rtn_private.npa_keys(p_item,ARRAY['adapter_version','stable','server_date','fetched_at','artifacts','stable_read_set','identity_count','current_count','error_code']),false)
  OR p_item->>'adapter_version'IS DISTINCT FROM 'actual-pravo-federal-law-v1'
  OR p_item->'identity_count'IS DISTINCT FROM '1'::jsonb OR p_item->'current_count'IS DISTINCT FROM '1'::jsonb
  OR p_item->'stable_read_set'IS DISTINCT FROM 'true'::jsonb OR nullif(p_item->>'error_code','')IS NOT NULL
  OR p_item->>'server_date'IS DISTINCT FROM((p_now AT TIME ZONE'Europe/Moscow')::date)::text THEN RETURN NULL;END IF;
 s:=p_item->'stable';i:=s->'identity';c:=s->'current';g:=s->'graph';a:=p_item->'artifacts';
 IF NOT coalesce(rtn_private.npa_keys(s,ARRAY['identity','current','graph']),false)
  OR NOT coalesce(rtn_private.npa_keys(i,ARRAY['country','kind','issuer','date','number','title','docid','dochash']),false)
  OR NOT rtn_private.npa_supported(i)OR length(coalesce(i->>'dochash',''))NOT BETWEEN 1 AND 200
  OR length(coalesce(i->>'title',''))NOT BETWEEN 1 AND 1000 OR length(coalesce(i->>'issuer',''))NOT BETWEEN 1 AND 200
  OR NOT coalesce(rtn_private.npa_keys(c,ARRAY['redid','effective_from','actual','official','checked','redcompleted','hascontent','contentcomplete','text_sha256']),false)
  OR jsonb_typeof(c->'redid')IS DISTINCT FROM'number'OR coalesce(c->>'redid','')!~'^[1-9][0-9]{0,12}$'
  OR jsonb_typeof(c->'text_sha256')IS DISTINCT FROM'string'OR coalesce(c->>'text_sha256','')!~'^[a-f0-9]{64}$'
  OR rtn_private.npa_date(c->>'effective_from')IS NULL OR(c->>'effective_from')::date>(p_now AT TIME ZONE'Europe/Moscow')::date
  OR c->'actual'IS DISTINCT FROM 'true'::jsonb OR c->'official'IS DISTINCT FROM 'true'::jsonb
  OR c->'checked'IS DISTINCT FROM 'true'::jsonb OR c->'redcompleted'IS DISTINCT FROM 'true'::jsonb
  OR c->'hascontent'IS DISTINCT FROM 'true'::jsonb OR c->'contentcomplete'IS DISTINCT FROM 'true'::jsonb
  OR NOT coalesce(rtn_private.npa_keys(g,ARRAY['canonical','future_editions']),false)
  OR coalesce(jsonb_typeof(g->'canonical'),'null')NOT IN('object','array')OR jsonb_typeof(g->'future_editions')IS DISTINCT FROM 'array'
  OR jsonb_typeof(g->'canonical'->'card')IS DISTINCT FROM'object'OR jsonb_typeof(g->'canonical'->'editions')IS DISTINCT FROM'array'
  OR jsonb_array_length(g->'future_editions')>1000
  OR NOT coalesce(rtn_private.npa_keys(a,ARRAY['identity','redactions','redtext','card']),false)
 THEN RETURN NULL;END IF;
 IF jsonb_array_length(g->'canonical'->'editions')NOT BETWEEN 1 AND 1000 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(g->'canonical'->'editions')e WHERE e->'redid'=c->'redid')THEN RETURN NULL;END IF;
 -- Only identities from this actual-admin configuration can produce findings.
 IF NOT EXISTS(SELECT 1 FROM rtn_private.npa_configurations cfg CROSS JOIN LATERAL jsonb_array_elements(cfg.basis)b
  WHERE cfg.id=p_run.configuration_id AND rtn_private.npa_identity_key(b)=rtn_private.npa_identity_key(i)
   AND(b->>'dochash'IS NULL OR b->>'dochash'=i->>'dochash'))THEN RETURN NULL;END IF;
 FOREACH name IN ARRAY ARRAY['identity','redactions','redtext','card']LOOP
  IF NOT rtn_private.npa_artifact_ok(a->name,p_run.id,p_run.started_at,p_run.claimed_at,p_now)THEN RETURN NULL;END IF;
  max_received:=greatest(max_received,rtn_private.npa_time(a->name->>'received_at'));
 END LOOP;
 at:=rtn_private.npa_time(p_item->>'fetched_at');
 IF at IS NULL OR at<max_received OR at>max_received+interval '30 seconds'OR at>p_now+interval '30 seconds'THEN RETURN NULL;END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(g->'future_editions')LOOP
  IF NOT coalesce(rtn_private.npa_keys(f,ARRAY['redid','effective_from','official','checked','completed','hascontent','contentcomplete','text_sha256']),false)
   OR jsonb_typeof(f->'redid')IS DISTINCT FROM'number'OR coalesce(f->>'redid','')!~'^[1-9][0-9]{0,12}$'OR rtn_private.npa_date(f->>'effective_from')IS NULL
   OR(f->>'effective_from')::date<=(p_now AT TIME ZONE'Europe/Moscow')::date
   OR jsonb_typeof(f->'official')IS DISTINCT FROM'boolean'OR jsonb_typeof(f->'checked')IS DISTINCT FROM'boolean'
   OR jsonb_typeof(f->'completed')IS DISTINCT FROM'boolean'OR jsonb_typeof(f->'hascontent')IS DISTINCT FROM'boolean'OR jsonb_typeof(f->'contentcomplete')IS DISTINCT FROM'boolean'
   OR(f->>'text_sha256'IS NOT NULL AND f->>'text_sha256'!~'^[a-f0-9]{64}$')THEN RETURN NULL;END IF;
 END LOOP;
 IF jsonb_array_length(g->'future_editions')<>(SELECT count(DISTINCT x->>'redid')FROM jsonb_array_elements(g->'future_editions')x)THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('identity',i,'stable',s,'projection_sha256',rtn_private.npa_sha(s),'fetched_at',rtn_private.npa_iso(at),'artifacts',a);
END;$fn$;

CREATE FUNCTION rtn_private.npa_verified_question(p_value jsonb,p_run rtn_private.npa_check_runs,p_now timestamptz)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE at timestamptz;received timestamptz;BEGIN
 IF NOT coalesce(rtn_private.npa_keys(p_value,ARRAY['source_id','source_generation','sha256','parent_normalization_sha256','child_normalization_sha256','fetched_at','artifact','catalog_complete']),false)
  OR p_value->>'source_id'IS DISTINCT FROM p_run.context->>'source_id'
  OR jsonb_typeof(p_value->'sha256')IS DISTINCT FROM'string'OR coalesce(p_value->>'sha256','')!~'^[a-f0-9]{64}$'OR p_value->'catalog_complete'IS DISTINCT FROM 'true'::jsonb
  OR NOT rtn_private.npa_artifact_ok(p_value->'artifact',p_run.id,p_run.started_at,p_run.claimed_at,p_now,true)
  OR p_value->>'sha256'IS DISTINCT FROM p_value->'artifact'->>'sha256'THEN RETURN NULL;END IF;
 at:=rtn_private.npa_time(p_value->>'fetched_at');received:=rtn_private.npa_time(p_value->'artifact'->>'received_at');
 IF at IS NULL OR at<received OR at>received+interval '30 seconds'OR at>p_now+interval '30 seconds'THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('identity_key','question-source','stable',jsonb_build_object('sha256',p_value->'sha256'),
  'projection_sha256',rtn_private.npa_sha(jsonb_build_object('sha256',p_value->'sha256')),'fetched_at',rtn_private.npa_iso(at),'artifacts',p_value->'artifact',
  'exact_context',p_value->'source_generation'=p_run.context->'source_generation'
   AND p_value->'parent_normalization_sha256'=p_run.context->'parent_normalization_sha256'
   AND p_value->'child_normalization_sha256'=p_run.context->'child_normalization_sha256');
END;$fn$;

CREATE FUNCTION rtn_private.npa_discovery_ok(p_value jsonb,p_run rtn_private.npa_check_runs,p_now timestamptz) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE page jsonb;pub jsonb;pages integer;reported integer;ids text[];resolved text[];BEGIN
 IF NOT coalesce(rtn_private.npa_keys(p_value,ARRAY['source','from','to_exclusive','complete','reported_total','pages','relevance_complete','unresolved_candidates','error_code','resolved_publications']),false)
  OR p_value->>'source'IS DISTINCT FROM'publication-pravo-federal-laws'
  OR p_value->>'from'IS DISTINCT FROM p_run.discovery_from::text OR p_value->>'to_exclusive'IS DISTINCT FROM p_run.discovery_to_exclusive::text
  OR p_value->'complete'IS DISTINCT FROM'true'::jsonb OR p_value->'relevance_complete'IS DISTINCT FROM'true'::jsonb
  OR p_value->'unresolved_candidates'IS DISTINCT FROM'[]'::jsonb OR nullif(p_value->>'error_code','')IS NOT NULL
  OR coalesce(p_value->>'reported_total','')!~'^[0-9]{1,5}$'
  OR jsonb_typeof(p_value->'pages')IS DISTINCT FROM'array'OR jsonb_array_length(p_value->'pages')NOT BETWEEN 1 AND 1000
  OR jsonb_typeof(p_value->'resolved_publications')IS DISTINCT FROM'array'THEN RETURN false;END IF;
 reported:=(p_value->>'reported_total')::integer;
 IF reported>10000 OR jsonb_array_length(p_value->'resolved_publications')<>reported THEN RETURN false;END IF;
 pages:=jsonb_array_length(p_value->'pages');
 IF(SELECT count(DISTINCT x->>'index')FROM jsonb_array_elements(p_value->'pages')x)<>pages THEN RETURN false;END IF;
 FOR page IN SELECT value FROM jsonb_array_elements(p_value->'pages')LOOP
  IF NOT coalesce(rtn_private.npa_keys(page,ARRAY['index','reported_total','publication_ids','artifact']),false)
   OR coalesce(page->>'index','')!~'^[0-9]{1,4}$'OR(page->>'index')::integer NOT BETWEEN 1 AND pages
   OR page->'reported_total'IS DISTINCT FROM p_value->'reported_total'OR jsonb_typeof(page->'publication_ids')IS DISTINCT FROM'array'
   OR jsonb_array_length(page->'publication_ids')>1000 OR NOT rtn_private.npa_artifact_ok(page->'artifact',p_run.id,p_run.started_at,p_run.claimed_at,p_now)
   OR(page->'artifact'->>'request_url')!~'^https?://(www\.)?publication\.pravo\.gov\.ru/search'
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(page->'publication_ids')x WHERE jsonb_typeof(x)<>'string'OR(x#>>'{}')!~'^[0-9]{12,30}$')
  THEN RETURN false;END IF;
 END LOOP;
 SELECT array_agg(x#>>'{}'ORDER BY x#>>'{}')INTO ids FROM jsonb_array_elements(p_value->'pages')p CROSS JOIN LATERAL jsonb_array_elements(p->'publication_ids')x;
 IF coalesce(cardinality(ids),0)<>reported OR(SELECT count(DISTINCT x)FROM unnest(ids)x)<>reported THEN RETURN false;END IF;
 FOR pub IN SELECT value FROM jsonb_array_elements(p_value->'resolved_publications')LOOP
  IF NOT coalesce(rtn_private.npa_keys(pub,ARRAY['publication_id','relation','basis_docids','artifact','graph_reference_ids']),false)
   OR coalesce(pub->>'relation','')NOT IN('not_related','known_changing_act')OR coalesce(pub->>'publication_id','')!~'^[0-9]{12,30}$'
   OR jsonb_typeof(pub->'basis_docids')IS DISTINCT FROM'array'OR jsonb_typeof(pub->'graph_reference_ids')IS DISTINCT FROM'array'
   OR NOT rtn_private.npa_artifact_ok(pub->'artifact',p_run.id,p_run.started_at,p_run.claimed_at,p_now)
   OR NOT((pub->'artifact'->>'request_url')~'^https?://(www\.)?publication\.pravo\.gov\.ru/(api/|document/|file/)'
    OR(pub->'artifact'->>'request_url')~'^http://actual\.pravo\.gov\.ru:8000/api/ebpi/redtext\?')
   OR jsonb_array_length(pub->'basis_docids')>200 OR jsonb_array_length(pub->'graph_reference_ids')>1000
   OR(pub->>'relation'='not_related'AND(pub->'basis_docids'<>'[]'::jsonb OR pub->'graph_reference_ids'<>'[]'::jsonb))
   OR(pub->>'relation'='known_changing_act'AND(jsonb_array_length(pub->'basis_docids')=0 OR jsonb_array_length(pub->'graph_reference_ids')=0))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(pub->'basis_docids')x WHERE NOT EXISTS(SELECT 1 FROM rtn_private.npa_configurations cfg CROSS JOIN LATERAL jsonb_array_elements(cfg.basis)b WHERE cfg.id=p_run.configuration_id AND b->'docid'=x))
  THEN RETURN false;END IF;
 END LOOP;
 SELECT array_agg(x->>'publication_id'ORDER BY x->>'publication_id')INTO resolved FROM jsonb_array_elements(p_value->'resolved_publications')x;
 RETURN coalesce(ids,ARRAY[]::text[])IS NOT DISTINCT FROM coalesce(resolved,ARRAY[]::text[]);
END;$fn$;

CREATE FUNCTION rtn_private.npa_proof(p_result jsonb,p_run rtn_private.npa_check_runs,p_now timestamptz)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE observations jsonb:='[]';item jsonb;verified jsonb;question jsonb;artifact jsonb;cfg rtn_private.npa_configurations;full_ok boolean:=true;why text[]:=ARRAY[]::text[];BEGIN
 IF octet_length(coalesce(p_result,'null')::text)>4194304 OR NOT coalesce(rtn_private.npa_keys(p_result,ARRAY['protocol','worker_version','status','basis','question_source','discovery','additional_artifacts','runtime_egress_verified','error_code']),false)
  OR p_result->>'protocol'IS DISTINCT FROM'rtn-npa-v1'OR p_result->>'worker_version'IS DISTINCT FROM'rtn-npa-official-v1'
  OR coalesce(p_result->>'status','')NOT IN('complete','partial_coverage','unknown','error')
  OR jsonb_typeof(p_result->'basis')IS DISTINCT FROM'array'OR jsonb_array_length(p_result->'basis')>200
  OR jsonb_typeof(p_result->'additional_artifacts')IS DISTINCT FROM'array'OR jsonb_array_length(p_result->'additional_artifacts')>2500
 THEN RAISE EXCEPTION'rtn_npa_invalid_worker_result'USING ERRCODE='22023';END IF;
 SELECT * INTO STRICT cfg FROM rtn_private.npa_configurations WHERE id=p_run.configuration_id;
 FOR item IN SELECT value FROM jsonb_array_elements(p_result->'basis')LOOP
  verified:=rtn_private.npa_verified_basis(item,p_run,p_now);
  IF verified IS NULL THEN full_ok:=false;why:=array_append(why,'invalid_or_incomplete_basis');
  ELSE
   observations:=observations||jsonb_build_array(verified||jsonb_build_object('identity_key',rtn_private.npa_identity_key(verified->'identity')));
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(verified->'stable'->'graph'->'future_editions')f
    WHERE f->'official'IS DISTINCT FROM'true'::jsonb OR f->'checked'IS DISTINCT FROM'true'::jsonb OR f->'completed'IS DISTINCT FROM'true'::jsonb
     OR f->'hascontent'IS DISTINCT FROM'true'::jsonb OR f->'contentcomplete'IS DISTINCT FROM'true'::jsonb OR coalesce(f->>'text_sha256','')!~'^[a-f0-9]{64}$')
   THEN full_ok:=false;why:=array_append(why,'future_edition_incomplete');END IF;
  END IF;
 END LOOP;
 IF(SELECT count(DISTINCT x->>'identity_key')FROM jsonb_array_elements(observations)x)<>jsonb_array_length(observations)
 THEN full_ok:=false;why:=array_append(why,'duplicate_basis');END IF;
 IF jsonb_array_length(observations)<>jsonb_array_length(cfg.basis)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(cfg.basis)x WHERE NOT rtn_private.npa_supported(x))
 THEN full_ok:=false;why:=array_append(why,'partial_declared_coverage');END IF;
 question:=rtn_private.npa_verified_question(p_result->'question_source',p_run,p_now);
 IF question IS NULL OR question->'exact_context'IS DISTINCT FROM'true'::jsonb OR question->'stable'->>'sha256'IS DISTINCT FROM p_run.context->>'source_sha256'
 THEN full_ok:=false;why:=array_append(why,'question_source_unproven_or_changed');END IF;
 IF question IS NOT NULL THEN observations:=observations||jsonb_build_array(question);END IF;
 FOR artifact IN SELECT value FROM jsonb_array_elements(p_result->'additional_artifacts')LOOP
  IF NOT rtn_private.npa_artifact_ok(artifact,p_run.id,p_run.started_at,p_run.claimed_at,p_now)THEN full_ok:=false;why:=array_append(why,'invalid_additional_artifact');END IF;
 END LOOP;
 IF NOT rtn_private.npa_discovery_ok(p_result->'discovery',p_run,p_now)THEN full_ok:=false;why:=array_append(why,'discovery_incomplete');END IF;
 IF p_result->'runtime_egress_verified'IS DISTINCT FROM'true'::jsonb OR p_result->>'status'<>'complete'OR nullif(p_result->>'error_code','')IS NOT NULL
 THEN full_ok:=false;why:=array_append(why,'worker_incomplete');END IF;
 RETURN jsonb_build_object('full',full_ok,'observations',observations,'reason_codes',to_jsonb(why));
END;$fn$;

CREATE FUNCTION rtn_private.npa_lock_source(p_bank uuid)RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE sid uuid;BEGIN
 SELECT source_id INTO sid FROM rtn_private.banks WHERE id=p_bank;
 IF sid IS NULL THEN RAISE EXCEPTION'rtn_npa_bank_required'USING ERRCODE='22023';END IF;
 PERFORM 1 FROM rtn_private.sources WHERE id=sid FOR UPDATE;RETURN sid;
END;$fn$;
CREATE FUNCTION public.configure_rtn_npa_basis(p_bank_id uuid,p_expected_configuration_id uuid,p_expected_release_id uuid,p_basis jsonb,p_discovery_from date,p_note text,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;old rtn_private.npa_configurations;current_id uuid;v integer;fingerprint text;item jsonb;cid uuid;supported integer;release_id uuid;context jsonb;BEGIN
 actor:=rtn_private.lock_actor();PERFORM rtn_private.assert_admin();PERFORM rtn_private.npa_lock_source(p_bank_id);
 IF p_request_id IS NULL OR p_expected_release_id IS NULL OR jsonb_typeof(p_basis)IS DISTINCT FROM'array'OR jsonb_array_length(p_basis)NOT BETWEEN 1 AND 200
  OR p_discovery_from IS NULL OR p_discovery_from>(clock_timestamp()AT TIME ZONE'Europe/Moscow')::date
  OR length(btrim(p_note))NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION'rtn_npa_configuration_invalid'USING ERRCODE='22023';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_basis)LOOP
  IF NOT coalesce(rtn_private.npa_keys(item,ARRAY['country','kind','date','number','title','docid','dochash']),false)
   OR item->>'country'IS DISTINCT FROM'RU'OR length(coalesce(item->>'kind',''))NOT BETWEEN 1 AND 100
   OR rtn_private.npa_date(item->>'date')IS NULL OR length(coalesce(item->>'number',''))NOT BETWEEN 1 AND 100
   OR length(coalesce(item->>'title',''))NOT BETWEEN 1 AND 1000
   OR(item->>'kind'='FederalLaw'AND jsonb_typeof(item->'number')IS DISTINCT FROM'string')
   OR(item?'docid'AND(jsonb_typeof(item->'docid')IS DISTINCT FROM'number'OR coalesce(item->>'docid','')!~'^[1-9][0-9]{0,12}$'))
   OR(item->>'dochash'IS NOT NULL AND length(item->>'dochash')NOT BETWEEN 1 AND 200)
  THEN RAISE EXCEPTION'rtn_npa_basis_identity_invalid'USING ERRCODE='22023';END IF;
 END LOOP;
 IF(SELECT count(DISTINCT rtn_private.npa_identity_key(x))FROM jsonb_array_elements(p_basis)x)<>jsonb_array_length(p_basis)THEN RAISE EXCEPTION'rtn_npa_duplicate_basis'USING ERRCODE='22023';END IF;
 fingerprint:=rtn_private.npa_sha(jsonb_build_object('bank',p_bank_id,'expected',p_expected_configuration_id,'expected_release',p_expected_release_id,'basis',p_basis,'from',p_discovery_from,'note',p_note));
 SELECT * INTO old FROM rtn_private.npa_configurations WHERE request_id=p_request_id;
 IF FOUND THEN
  IF old.request_hash IS DISTINCT FROM fingerprint OR old.configured_by IS DISTINCT FROM actor THEN RAISE EXCEPTION'rtn_npa_request_conflict'USING ERRCODE='40001';END IF;
  cid:=old.id;v:=old.version;
 ELSE
  SELECT id,version INTO current_id,v FROM rtn_private.npa_configurations WHERE bank_id=p_bank_id ORDER BY version DESC LIMIT 1;
  IF current_id IS DISTINCT FROM p_expected_configuration_id THEN RAISE EXCEPTION'rtn_npa_configuration_cas_conflict'USING ERRCODE='40001';END IF;
  release_id:=rtn_private.npa_latest_release(p_bank_id,clock_timestamp());context:=rtn_private.npa_context(release_id,clock_timestamp());
  IF release_id IS DISTINCT FROM p_expected_release_id THEN RAISE EXCEPTION'rtn_npa_configuration_release_conflict'USING ERRCODE='40001';END IF;
  IF context IS NULL THEN RAISE EXCEPTION'rtn_npa_current_release_required'USING ERRCODE='22023';END IF;
  v:=coalesce(v,0)+1;
  INSERT INTO rtn_private.npa_configurations(bank_id,version,release_id,context_sha256,previous_id,basis,discovery_from,request_id,request_hash,configured_by,configuration_note)
   VALUES(p_bank_id,v,release_id,rtn_private.npa_sha(context),current_id,p_basis,p_discovery_from,p_request_id,fingerprint,actor,p_note)RETURNING id INTO cid;
 END IF;
 SELECT count(*)INTO supported FROM jsonb_array_elements(p_basis)x WHERE rtn_private.npa_supported(x);
 RETURN jsonb_build_object('configuration_id',cid,'version',v,'basis',p_basis,'supported_count',supported,'unsupported_count',jsonb_array_length(p_basis)-supported,'replayed',old.id IS NOT NULL);
END;$fn$;

CREATE FUNCTION rtn_private.npa_queue(p_bank uuid,p_origin text,p_actor uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE cfg rtn_private.npa_configurations;m rtn_private.npa_manifests;r uuid;c jsonb;run rtn_private.npa_check_runs;at timestamptz:=clock_timestamp();BEGIN
 PERFORM rtn_private.npa_lock_source(p_bank);
 SELECT * INTO cfg FROM rtn_private.npa_configurations WHERE bank_id=p_bank ORDER BY version DESC LIMIT 1;
 IF cfg.id IS NULL THEN RAISE EXCEPTION'rtn_npa_basis_configuration_required'USING ERRCODE='22023';END IF;
 SELECT * INTO run FROM rtn_private.npa_check_runs WHERE bank_id=p_bank AND status IN('queued','running');
 IF run.id IS NOT NULL THEN RETURN jsonb_build_object('run_id',run.id,'status',run.status,'queued_at',run.queued_at);END IF;
 r:=rtn_private.npa_latest_release(p_bank,at);c:=rtn_private.npa_context(r,at);
 IF c IS NULL THEN RAISE EXCEPTION'rtn_npa_current_release_required'USING ERRCODE='22023';END IF;
 SELECT * INTO m FROM rtn_private.npa_manifests WHERE bank_id=p_bank ORDER BY version DESC LIMIT 1;
 INSERT INTO rtn_private.npa_check_runs(bank_id,configuration_id,release_id,key_set_id,manifest_id,manifest_version,context,context_sha256,finding_epoch,discovery_from,discovery_to_exclusive,origin,requested_by)
 VALUES(p_bank,cfg.id,r,(c->>'key_set_id')::uuid,m.id,coalesce(m.version,0),c,rtn_private.npa_sha(c),coalesce((SELECT max(epoch)FROM rtn_private.npa_findings WHERE bank_id=p_bank),0),
  greatest(cfg.discovery_from,(SELECT max(rr.discovery_to_exclusive-1)FROM rtn_private.npa_receipts receipts JOIN rtn_private.npa_check_runs rr ON rr.id=receipts.run_id
   JOIN rtn_private.npa_manifests mm ON mm.id=receipts.manifest_id WHERE mm.bank_id=p_bank AND mm.configuration_id=cfg.id AND mm.context_sha256=rtn_private.npa_sha(c)
   AND receipts.outcome='unchanged'AND NOT receipts.stale_manifest)),(at AT TIME ZONE'Europe/Moscow')::date+1,p_origin,p_actor)RETURNING * INTO run;
 RETURN jsonb_build_object('run_id',run.id,'status',run.status,'queued_at',run.queued_at);
END;$fn$;
CREATE FUNCTION public.request_rtn_npa_check(p_organization_id uuid,p_bank_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM rtn_private.lock_actor();PERFORM rtn_private.assert_staff(p_organization_id,'courses.write');PERFORM rtn_private.assert_entitled(p_organization_id,p_bank_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text,42));
 PERFORM rtn_private.assert_staff(p_organization_id,'courses.write');PERFORM rtn_private.assert_entitled(p_organization_id,p_bank_id);
 RETURN rtn_private.npa_queue(p_bank_id,'manual',auth.uid());END;$fn$;
CREATE FUNCTION public.request_rtn_npa_editorial_check(p_bank_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM rtn_private.lock_actor();PERFORM rtn_private.assert_admin();RETURN rtn_private.npa_queue(p_bank_id,'bootstrap',auth.uid());END;$fn$;
CREATE FUNCTION rtn_private.npa_expire_exhausted()RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE run rtn_private.npa_check_runs;payload jsonb;receipt uuid;now_at timestamptz;epoch bigint;BEGIN
 SELECT * INTO run FROM rtn_private.npa_check_runs WHERE status='running'AND lease_expires_at<clock_timestamp()AND attempt_count>=3 ORDER BY bank_id,id LIMIT 1;
 IF run.id IS NULL THEN RETURN false;END IF;
 PERFORM rtn_private.npa_lock_source(run.bank_id);
 SELECT * INTO STRICT run FROM rtn_private.npa_check_runs WHERE id=run.id FOR UPDATE;
 IF run.status<>'running'OR run.lease_expires_at>=clock_timestamp()OR run.attempt_count<3 THEN RETURN true;END IF;
 now_at:=clock_timestamp();epoch:=coalesce((SELECT max(f.epoch)FROM rtn_private.npa_findings f WHERE f.bank_id=run.bank_id),0);
 payload:='{"protocol":"rtn-npa-v1","worker_version":"rtn-npa-official-v1","status":"error","basis":[],"question_source":null,"discovery":null,"additional_artifacts":[],"runtime_egress_verified":false,"error_code":"lease_attempts_exhausted"}';
 INSERT INTO rtn_private.npa_receipts(run_id,manifest_id,active_manifest_at_commit,outcome,checked_at,reason_codes,finding_epoch,stale_manifest,proof_sha256)
 VALUES(run.id,run.manifest_id,(SELECT id FROM rtn_private.npa_manifests WHERE bank_id=run.bank_id ORDER BY version DESC LIMIT 1),'error',now_at,ARRAY['lease_attempts_exhausted'],epoch,true,rtn_private.npa_sha(payload))RETURNING id INTO receipt;
 UPDATE rtn_private.npa_check_runs SET status='completed',completed_at=now_at,result=payload,result_sha256=rtn_private.npa_sha(payload),outcome='error',error_code='lease_attempts_exhausted',
  completion_lease_token=run.lease_token,completion_receipt_id=receipt,lease_token=NULL,lease_expires_at=NULL WHERE id=run.id;
 RETURN true;
END;$fn$;
CREATE FUNCTION public.enqueue_due_rtn_npa_checks()RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE b uuid;n integer:=0;BEGIN PERFORM rtn_private.assert_service();
 IF rtn_private.npa_expire_exhausted()THEN RETURN 0;END IF;
 FOR b IN SELECT cfg.bank_id FROM rtn_private.npa_configurations cfg JOIN rtn_private.banks bank_row ON bank_row.id=cfg.bank_id JOIN rtn_private.sources source_row ON source_row.id=bank_row.source_id
  WHERE source_row.active AND cfg.version=(SELECT max(version)FROM rtn_private.npa_configurations WHERE bank_id=cfg.bank_id)
  AND rtn_private.npa_context(rtn_private.npa_latest_release(cfg.bank_id,clock_timestamp()),clock_timestamp())IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM rtn_private.npa_check_runs r WHERE r.bank_id=cfg.bank_id AND r.status IN('queued','running'))
  AND NOT EXISTS(SELECT 1 FROM rtn_private.npa_check_runs r WHERE r.bank_id=cfg.bank_id AND r.configuration_id=cfg.id AND r.completed_at>clock_timestamp()-(CASE WHEN r.outcome='error'THEN interval'1 hour'ELSE interval'1 day'END))ORDER BY source_row.id,cfg.bank_id LIMIT 20
 LOOP BEGIN PERFORM rtn_private.npa_queue(b,'scheduled',NULL);n:=n+1;EXCEPTION WHEN SQLSTATE'22023'THEN NULL;END;END LOOP;RETURN n;END;$fn$;

CREATE FUNCTION public.claim_rtn_npa_check(p_run_id uuid DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE run rtn_private.npa_check_runs;cfg rtn_private.npa_configurations;s rtn_private.sources;BEGIN
 PERFORM rtn_private.assert_service();
 IF rtn_private.npa_expire_exhausted()THEN RETURN NULL;END IF;
 -- No source lock is held while remote HTTP runs. Completion serializes facts.
 SELECT * INTO run FROM rtn_private.npa_check_runs WHERE(p_run_id IS NULL OR id=p_run_id)
 AND(status='queued'OR(status='running'AND lease_expires_at<clock_timestamp()))AND attempt_count<3 ORDER BY queued_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF run.id IS NULL THEN RETURN NULL;END IF;
 UPDATE rtn_private.npa_check_runs SET status='running',started_at=coalesce(started_at,clock_timestamp()),claimed_at=clock_timestamp(),lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval'15 minutes',attempt_count=attempt_count+1 WHERE id=run.id RETURNING * INTO run;
 SELECT * INTO STRICT cfg FROM rtn_private.npa_configurations WHERE id=run.configuration_id;
 SELECT * INTO STRICT s FROM rtn_private.sources WHERE id=(run.context->>'source_id')::uuid;
 RETURN jsonb_build_object('protocol','rtn-npa-v1','worker_version','rtn-npa-official-v1','run_id',run.id,'lease_token',run.lease_token,'lease_expires_at',run.lease_expires_at,
  'bank_id',run.bank_id,'release_id',run.release_id,'key_set_id',run.key_set_id,'manifest_id',run.manifest_id,'manifest_version',run.manifest_version,'context_sha256',run.context_sha256,'finding_epoch',run.finding_epoch,
  'question_source',jsonb_build_object('source_id',s.id,'source_code',s.code,'trusted_anchor_rule',s.trusted_anchor_rule,'parser',s.parser,'page_url',coalesce(s.last_resolved_page_url,s.page_url),'document_url',coalesce(s.last_document_url,s.document_url),'sha256',run.context->>'source_sha256',
  'source_generation',run.context->'source_generation','parent_normalization_sha256',run.context->'parent_normalization_sha256','child_normalization_sha256',run.context->'child_normalization_sha256'),
  'basis',(SELECT coalesce(jsonb_agg(jsonb_build_object('country',x->'country','kind',x->'kind','date',x->'date','number',x->'number','docid',x->'docid','dochash',x->'dochash')),'[]')FROM jsonb_array_elements(cfg.basis)x WHERE rtn_private.npa_supported(x)),
  'unsupported_basis',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',x->'kind','date',x->'date','number',x->'number','title',x->'title')),'[]')FROM jsonb_array_elements(cfg.basis)x WHERE NOT rtn_private.npa_supported(x)),
  'all_declared_basis_count',jsonb_array_length(cfg.basis),'discovery_window',jsonb_build_object('from',run.discovery_from,'to_exclusive',run.discovery_to_exclusive));
END;$fn$;

CREATE FUNCTION rtn_private.npa_observation_covered(p_manifest uuid,p_observation jsonb)RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE baseline jsonb;BEGIN
 SELECT x INTO baseline FROM rtn_private.npa_manifests m CROSS JOIN LATERAL jsonb_array_elements(m.basis)x
 WHERE m.id=p_manifest AND x->>'identity_key'=p_observation->>'identity_key';
 RETURN baseline IS NOT NULL AND(baseline->>'projection_sha256'=p_observation->>'projection_sha256'
  OR rtn_private.npa_time(p_observation->>'fetched_at')<rtn_private.npa_time(baseline->>'fetched_at'));
END;$fn$;
CREATE FUNCTION rtn_private.npa_hard_stop(p_key uuid,p_basis jsonb)RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE cap timestamptz;future timestamptz;BEGIN
 -- Exclude ONLY the top-level editorial review date. Other declared stops,
 -- including nested review dates, remain hard conservative boundaries.
 SELECT min((x->>'date')::date::timestamp AT TIME ZONE'Europe/Moscow')INTO cap
 FROM rtn_private.key_sets k CROSS JOIN LATERAL jsonb_array_elements(k.normative_limits)x
 WHERE k.id=p_key AND x->'path'IS DISTINCT FROM'["module","review_before"]'::jsonb;
 SELECT min((f->>'effective_from')::date::timestamp AT TIME ZONE'Europe/Moscow')INTO future
 FROM jsonb_array_elements(p_basis)b CROSS JOIN LATERAL jsonb_array_elements(coalesce(b->'stable'->'graph'->'future_editions','[]'))f;
 RETURN least(cap,future);
END;$fn$;
CREATE FUNCTION rtn_private.npa_findings_covered(p_bank uuid,p_basis jsonb,p_after bigint DEFAULT 0)RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT NOT EXISTS(SELECT 1 FROM rtn_private.npa_findings f WHERE f.bank_id=p_bank AND f.epoch>p_after AND NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(p_basis)b WHERE b->>'identity_key'=f.identity_key
   AND(b->>'projection_sha256'=f.projection_sha256 OR rtn_private.npa_time(b->>'fetched_at')>f.observed_at)))
$fn$;
CREATE FUNCTION rtn_private.npa_receipt_valid_until(p_at timestamptz,p_hard timestamptz)RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT least((((p_at AT TIME ZONE'Europe/Moscow')::date+7)::timestamp AT TIME ZONE'Europe/Moscow'),p_hard)
$fn$;
CREATE FUNCTION public.complete_rtn_npa_check(p_run_id uuid,p_lease_token uuid,p_result jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE run rtn_private.npa_check_runs;m rtn_private.npa_manifests;cfgid uuid;proof jsonb;obs jsonb;basis jsonb;epoch bigint;added integer:=0;
 now_at timestamptz;receipt rtn_private.npa_receipts;last_question rtn_private.npa_findings;hash text;changed boolean;stale boolean;v_outcome text;expires timestamptz;reasons text[];BEGIN
 PERFORM rtn_private.assert_service();
 SELECT * INTO run FROM rtn_private.npa_check_runs WHERE id=p_run_id;
 IF run.id IS NULL THEN RAISE EXCEPTION'rtn_npa_run_required'USING ERRCODE='22023';END IF;
 PERFORM rtn_private.npa_lock_source(run.bank_id);
 SELECT * INTO STRICT run FROM rtn_private.npa_check_runs WHERE id=p_run_id FOR UPDATE;
 now_at:=clock_timestamp();hash:=rtn_private.npa_sha(p_result);
 IF run.status='completed'THEN
  IF run.result_sha256 IS DISTINCT FROM hash OR run.completion_lease_token IS DISTINCT FROM p_lease_token THEN RAISE EXCEPTION'rtn_npa_completed_request_conflict'USING ERRCODE='40001';END IF;
  SELECT * INTO STRICT receipt FROM rtn_private.npa_receipts WHERE id=run.completion_receipt_id;
  RETURN jsonb_build_object('run_id',run.id,'receipt_id',receipt.id,'outcome',receipt.outcome,'confirmed_findings',0,'finding_epoch',receipt.finding_epoch,'valid_until_exclusive',receipt.valid_until_exclusive,'stale_manifest',receipt.stale_manifest);
 END IF;
 IF run.status<>'running'OR run.lease_token IS DISTINCT FROM p_lease_token OR now_at>=run.lease_expires_at THEN RAISE EXCEPTION'rtn_npa_valid_service_lease_required'USING ERRCODE='42501';END IF;
 proof:=rtn_private.npa_proof(p_result,run,now_at);basis:=proof->'observations';
 SELECT * INTO m FROM rtn_private.npa_manifests WHERE bank_id=run.bank_id ORDER BY version DESC LIMIT 1;
 SELECT id INTO cfgid FROM rtn_private.npa_configurations WHERE bank_id=run.bank_id ORDER BY version DESC LIMIT 1;
 epoch:=coalesce((SELECT max(f.epoch)FROM rtn_private.npa_findings f WHERE f.bank_id=run.bank_id),0);
 FOR obs IN SELECT value FROM jsonb_array_elements(basis)LOOP
  -- Positive facts are independent of whether this old run may renew the
  -- latest manifest. A new approval cannot hide an in-flight changed edition.
  IF obs->>'identity_key'='question-source'THEN
   SELECT * INTO last_question FROM rtn_private.npa_findings WHERE bank_id=run.bank_id AND identity_key='question-source'ORDER BY epoch DESC LIMIT 1;
   IF last_question.id IS NOT NULL AND(last_question.projection_sha256=obs->>'projection_sha256'OR rtn_private.npa_time(obs->>'fetched_at')<last_question.observed_at)THEN
    changed:=false; -- Raw obsolete evidence is retained in this immutable run.
   ELSE
    changed:=obs->'stable'->>'sha256'IS DISTINCT FROM run.context->>'source_sha256'OR last_question.id IS NOT NULL;
   END IF;
  ELSE
   changed:=(run.manifest_id IS NOT NULL AND NOT rtn_private.npa_observation_covered(run.manifest_id,obs))
    OR(m.id IS NOT NULL AND NOT rtn_private.npa_observation_covered(m.id,obs));
  END IF;
  IF changed THEN
   epoch:=epoch+1;
   INSERT INTO rtn_private.npa_findings(bank_id,epoch,run_id,identity_key,observed_at,projection,projection_sha256,artifacts,reason)
   VALUES(run.bank_id,epoch,run.id,obs->>'identity_key',rtn_private.npa_time(obs->>'fetched_at'),obs->'stable',obs->>'projection_sha256',obs->'artifacts',CASE WHEN obs->>'identity_key'='question-source'THEN'official_question_source_changed'ELSE'confirmed_normative_projection_changed'END);
   added:=added+1;
  END IF;
 END LOOP;
 stale:=cfgid IS DISTINCT FROM run.configuration_id OR m.id IS DISTINCT FROM run.manifest_id
  OR run.context IS DISTINCT FROM rtn_private.npa_context(run.release_id,now_at)
  OR(m.id IS NOT NULL AND(m.context_sha256 IS DISTINCT FROM run.context_sha256 OR m.configuration_id IS DISTINCT FROM run.configuration_id));
 reasons:=ARRAY(SELECT jsonb_array_elements_text(proof->'reason_codes'));
 IF stale THEN reasons:=array_append(reasons,'stale_manifest_or_context');END IF;
 IF added>0 OR(m.id IS NOT NULL AND NOT rtn_private.npa_findings_covered(run.bank_id,m.basis,m.acknowledged_epoch))THEN v_outcome:='needs_subject_review';
 ELSIF p_result->>'status'='error'THEN v_outcome:='error';
 ELSIF p_result->>'status'='partial_coverage'THEN v_outcome:='partial_coverage';
 ELSIF proof->'full'='true'::jsonb AND NOT stale AND m.id IS NOT NULL
  AND m.stable_sha256=rtn_private.npa_sha(jsonb_build_object('context',run.context,'basis',(SELECT jsonb_agg(jsonb_build_object('identity_key',x->'identity_key','stable',x->'stable')ORDER BY x->>'identity_key')FROM jsonb_array_elements(basis)x)))
 THEN v_outcome:='unchanged';expires:=rtn_private.npa_receipt_valid_until(now_at,m.hard_stop_at);
 ELSE v_outcome:='unknown';END IF;
 IF expires<=now_at THEN v_outcome:='needs_subject_review';expires:=NULL;reasons:=array_append(reasons,'hard_boundary_reached');END IF;
 INSERT INTO rtn_private.npa_receipts(run_id,manifest_id,active_manifest_at_commit,outcome,checked_at,valid_until_exclusive,reason_codes,finding_epoch,stale_manifest,proof_sha256)
 VALUES(run.id,run.manifest_id,m.id,v_outcome,now_at,expires,reasons,epoch,stale,hash)RETURNING * INTO receipt;
 UPDATE rtn_private.npa_check_runs SET status='completed',completed_at=now_at,result=p_result,result_sha256=hash,outcome=v_outcome,error_code=left(p_result->>'error_code',1000),
  lease_token=NULL,lease_expires_at=NULL,completion_lease_token=p_lease_token,completion_receipt_id=receipt.id WHERE id=run.id;
 RETURN jsonb_build_object('run_id',run.id,'receipt_id',receipt.id,'outcome',v_outcome,'confirmed_findings',added,'finding_epoch',epoch,'valid_until_exclusive',expires,'stale_manifest',stale);
END;$fn$;

CREATE FUNCTION rtn_private.npa_admission(p_release uuid,p_at timestamptz)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c jsonb;k rtn_private.key_sets;m rtn_private.npa_manifests;cfg uuid;latest rtn_private.npa_check_runs;
 epoch bigint;ack bigint:=0;last_question rtn_private.npa_findings;question_manual_covered boolean:=false;manual_until timestamptz;automatic_until timestamptz;effective_until timestamptz;basis text:='blocked';reasons text[]:=ARRAY[]::text[];uncovered boolean;BEGIN
 c:=rtn_private.npa_context(p_release,p_at);
 SELECT k2.* INTO k FROM rtn_private.releases r JOIN rtn_private.key_sets k2 ON k2.id=r.key_set_id WHERE r.id=p_release;
 IF k.id IS NULL THEN RETURN jsonb_build_object('allowed',false,'normative_status','review_required','admission_basis','blocked','normative_cutoff_at',NULL,'reasons',jsonb_build_array('released_edition_required'),'finding_epoch',0,'latest_check_status',NULL,'latest_check_run_id',NULL,'latest_check_at',NULL);END IF;
 SELECT * INTO m FROM rtn_private.npa_manifests WHERE bank_id=k.bank_id ORDER BY version DESC LIMIT 1;
 SELECT id INTO cfg FROM rtn_private.npa_configurations WHERE bank_id=k.bank_id ORDER BY version DESC LIMIT 1;
 SELECT * INTO latest FROM rtn_private.npa_check_runs WHERE bank_id=k.bank_id ORDER BY queued_at DESC,id DESC LIMIT 1;
 epoch:=coalesce((SELECT max(f.epoch)FROM rtn_private.npa_findings f WHERE f.bank_id=k.bank_id),0);
 SELECT coalesce(max(acknowledged_epoch),0)INTO ack FROM rtn_private.npa_manual_reviews WHERE release_id=p_release AND context_sha256=rtn_private.npa_sha(c);
 SELECT * INTO last_question FROM rtn_private.npa_findings WHERE bank_id=k.bank_id AND identity_key='question-source'ORDER BY epoch DESC LIMIT 1;
 question_manual_covered:=last_question.id IS NOT NULL AND last_question.projection->>'sha256'=c->>'source_sha256'
  AND(k.reviewed_at>=last_question.ingested_at OR ack>=last_question.epoch);
 -- A manual acknowledgement can cover a reviewed legal change, but never
 -- dismiss a positive official-question PDF change to a different hash.
 uncovered:=EXISTS(SELECT 1 FROM rtn_private.npa_findings f WHERE f.bank_id=k.bank_id AND(
  (f.identity_key='question-source'AND NOT coalesce(question_manual_covered,false)AND NOT EXISTS(SELECT 1 FROM rtn_private.npa_manifests ma CROSS JOIN LATERAL jsonb_array_elements(ma.basis)b
   WHERE ma.id=m.id AND ma.context_sha256=rtn_private.npa_sha(c)AND b->>'identity_key'='question-source'
   AND(b->>'projection_sha256'=f.projection_sha256 OR rtn_private.npa_time(b->>'fetched_at')>f.observed_at)))
  OR(f.identity_key<>'question-source'AND f.epoch>ack AND k.reviewed_at<f.ingested_at AND NOT EXISTS(SELECT 1 FROM rtn_private.npa_manifests ma CROSS JOIN LATERAL jsonb_array_elements(ma.basis)b
   WHERE ma.id=m.id AND ma.context_sha256=rtn_private.npa_sha(c)AND b->>'identity_key'=f.identity_key
   AND(b->>'projection_sha256'=f.projection_sha256 OR rtn_private.npa_time(b->>'fetched_at')>f.observed_at)))));
 IF c IS NULL THEN reasons:=array_append(reasons,'official_source_or_latest_edition_changed');
 ELSIF uncovered THEN reasons:=array_append(reasons,'confirmed_change_requires_subject_review');
 ELSE
  IF rtn_private.normative_current(k.id,p_at)THEN manual_until:=k.normative_cutoff_at;END IF;
  IF m.id IS NOT NULL AND m.configuration_id=cfg AND m.release_id=p_release AND m.context_sha256=rtn_private.npa_sha(c)
   AND rtn_private.npa_findings_covered(k.bank_id,m.basis,m.acknowledged_epoch)THEN
   SELECT max(least(r.valid_until_exclusive,m.hard_stop_at))INTO automatic_until FROM rtn_private.npa_receipts r
   WHERE r.manifest_id=m.id AND r.outcome='unchanged'AND NOT r.stale_manifest AND r.valid_until_exclusive>p_at;
  END IF;
  effective_until:=greatest(manual_until,automatic_until);
  IF automatic_until IS NOT NULL AND( manual_until IS NULL OR automatic_until>manual_until)THEN basis:='automatic_attestation';
  ELSIF manual_until IS NOT NULL THEN basis:='manual_review';END IF;
  IF effective_until IS NULL THEN reasons:=array_append(reasons,'review_window_expired_or_unproven');END IF;
 END IF;
 RETURN jsonb_build_object('allowed',effective_until IS NOT NULL AND p_at<effective_until,'normative_status',CASE WHEN effective_until IS NOT NULL AND p_at<effective_until THEN'current'ELSE'review_required'END,
  'admission_basis',basis,'normative_cutoff_at',effective_until,'reasons',to_jsonb(reasons),'finding_epoch',epoch,
  'latest_check_status',coalesce(latest.outcome,latest.status),'latest_check_run_id',latest.id,'latest_check_at',latest.completed_at);
END;$fn$;
CREATE FUNCTION rtn_private.npa_key_admission(p_key uuid,p_at timestamptz)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT rtn_private.npa_admission((SELECT id FROM rtn_private.releases WHERE key_set_id=p_key ORDER BY effective_from DESC,published_at DESC,id DESC LIMIT 1),p_at)
$fn$;
CREATE FUNCTION rtn_private.npa_key_current(p_key uuid,p_at timestamptz)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce((rtn_private.npa_key_admission(p_key,p_at)->>'allowed')::boolean,false)
$fn$;
CREATE FUNCTION rtn_private.npa_assert_release(p_release uuid)RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE sid uuid;answer jsonb;BEGIN
 SELECT b.source_id INTO sid FROM rtn_private.releases r JOIN rtn_private.banks b ON b.id=r.bank_id WHERE r.id=p_release;
 IF sid IS NULL THEN RAISE EXCEPTION'rtn_normative_review_required'USING ERRCODE='22023';END IF;
 -- Existing subject42007 -> org42 locks precede this source SHARE lock.
 -- Source/normalization/publication workers use UPDATE; no stale admission can
 -- commit after a source change which won this lock first.
 PERFORM 1 FROM rtn_private.sources WHERE id=sid FOR SHARE;
 answer:=rtn_private.npa_admission(p_release,clock_timestamp());
 IF answer->'allowed'IS DISTINCT FROM'true'::jsonb THEN RAISE EXCEPTION'rtn_normative_review_required'USING ERRCODE='22023',DETAIL=answer::text;END IF;
END;$fn$;
CREATE FUNCTION rtn_private.npa_assert_bank(p_bank uuid)RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM rtn_private.npa_assert_release(rtn_private.npa_latest_release(p_bank,clock_timestamp()));END;$fn$;

CREATE FUNCTION public.approve_rtn_npa_manifest(p_bank_id uuid,p_run_id uuid,p_expected_configuration_id uuid,p_expected_manifest_id uuid,p_expected_finding_epoch bigint,p_note text,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;run rtn_private.npa_check_runs;m rtn_private.npa_manifests;old rtn_private.npa_manifests;cfg uuid;epoch bigint;proof jsonb;basis jsonb;fingerprint text;stable text;hard timestamptz;expires timestamptz;newid uuid;at timestamptz;BEGIN
 actor:=rtn_private.lock_actor();PERFORM rtn_private.assert_admin();PERFORM rtn_private.npa_lock_source(p_bank_id);at:=clock_timestamp();
 IF p_request_id IS NULL OR length(btrim(p_note))NOT BETWEEN 10 AND 4000 OR p_expected_finding_epoch IS NULL THEN RAISE EXCEPTION'rtn_npa_approval_invalid'USING ERRCODE='22023';END IF;
 fingerprint:=rtn_private.npa_sha(jsonb_build_object('bank',p_bank_id,'run',p_run_id,'configuration',p_expected_configuration_id,'manifest',p_expected_manifest_id,'epoch',p_expected_finding_epoch,'note',p_note));
 SELECT * INTO old FROM rtn_private.npa_manifests WHERE request_id=p_request_id;
 IF old.id IS NOT NULL THEN
  IF old.request_hash IS DISTINCT FROM fingerprint OR old.approved_by IS DISTINCT FROM actor THEN RAISE EXCEPTION'rtn_npa_request_conflict'USING ERRCODE='40001';END IF;
  RETURN jsonb_build_object('manifest_id',old.id,'version',old.version,'stable_sha256',old.stable_sha256,'hard_stop_at',old.hard_stop_at,'admission',rtn_private.npa_admission(old.release_id,at),'replayed',true);
 END IF;
 SELECT * INTO run FROM rtn_private.npa_check_runs WHERE id=p_run_id FOR UPDATE;
 SELECT * INTO m FROM rtn_private.npa_manifests WHERE bank_id=p_bank_id ORDER BY version DESC LIMIT 1;
 SELECT id INTO cfg FROM rtn_private.npa_configurations WHERE bank_id=p_bank_id ORDER BY version DESC LIMIT 1;
 epoch:=coalesce((SELECT max(f.epoch)FROM rtn_private.npa_findings f WHERE f.bank_id=p_bank_id),0);
 IF run.id IS NULL OR run.bank_id<>p_bank_id OR run.status<>'completed'OR at>run.completed_at+interval'15 minutes'
  OR cfg IS DISTINCT FROM p_expected_configuration_id OR run.configuration_id IS DISTINCT FROM cfg
  OR NOT EXISTS(SELECT 1 FROM rtn_private.npa_configurations configuration_row WHERE configuration_row.id=cfg AND configuration_row.release_id=run.release_id AND configuration_row.context_sha256=run.context_sha256)
  OR m.id IS DISTINCT FROM p_expected_manifest_id OR run.manifest_id IS DISTINCT FROM m.id
  OR epoch<>p_expected_finding_epoch OR run.context IS DISTINCT FROM rtn_private.npa_context(run.release_id,at)
 THEN RAISE EXCEPTION'rtn_npa_approval_cas_conflict'USING ERRCODE='40001';END IF;
 proof:=rtn_private.npa_proof(run.result,run,at);basis:=proof->'observations';
 IF proof->'full'IS DISTINCT FROM'true'::jsonb OR NOT rtn_private.npa_findings_covered(p_bank_id,basis)
 THEN RAISE EXCEPTION'rtn_npa_complete_current_evidence_required'USING ERRCODE='22023';END IF;
 stable:=rtn_private.npa_sha(jsonb_build_object('context',run.context,'basis',(SELECT jsonb_agg(jsonb_build_object('identity_key',x->'identity_key','stable',x->'stable')ORDER BY x->>'identity_key')FROM jsonb_array_elements(basis)x)));
 hard:=rtn_private.npa_hard_stop(run.key_set_id,basis);expires:=rtn_private.npa_receipt_valid_until(run.completed_at,hard);
 IF expires<=at THEN RAISE EXCEPTION'rtn_npa_hard_boundary_reached'USING ERRCODE='22023';END IF;
 INSERT INTO rtn_private.npa_manifests(bank_id,configuration_id,version,previous_id,release_id,key_set_id,run_id,context,context_sha256,basis,coverage,stable_sha256,hard_stop_at,acknowledged_epoch,request_id,request_hash,approved_by,approval_note)
 VALUES(p_bank_id,cfg,coalesce(m.version,0)+1,m.id,run.release_id,run.key_set_id,run.id,run.context,run.context_sha256,basis,
  jsonb_build_object('all_declared',true,'basis_count',jsonb_array_length(basis)-1,'discovery_from',run.discovery_from,'discovery_to_exclusive',run.discovery_to_exclusive),
  stable,hard,epoch,p_request_id,fingerprint,actor,p_note)RETURNING id INTO newid;
 -- Approval does not move the actual observation time forward. This first
 -- attestation expires seven Moscow dates after the original completed proof.
 INSERT INTO rtn_private.npa_receipts(run_id,manifest_id,active_manifest_at_commit,outcome,checked_at,valid_until_exclusive,reason_codes,finding_epoch,stale_manifest,proof_sha256)
 VALUES(run.id,newid,newid,'unchanged',run.completed_at,expires,ARRAY['actual_admin_manifest_approval'],epoch,false,run.result_sha256);
 RETURN jsonb_build_object('manifest_id',newid,'version',coalesce(m.version,0)+1,'stable_sha256',stable,'hard_stop_at',hard,'admission',rtn_private.npa_admission(run.release_id,at),'replayed',false);
END;$fn$;

CREATE FUNCTION public.acknowledge_rtn_npa_manual_review(p_bank_id uuid,p_release_id uuid,p_expected_finding_epoch bigint,p_evidence jsonb,p_note text,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;c jsonb;epoch bigint;old rtn_private.npa_manual_reviews;fingerprint text;newid uuid;e jsonb;BEGIN
 actor:=rtn_private.lock_actor();PERFORM rtn_private.assert_admin();PERFORM rtn_private.npa_lock_source(p_bank_id);
 c:=rtn_private.npa_context(p_release_id,clock_timestamp());
 IF c IS NULL OR c->>'bank_id'IS DISTINCT FROM p_bank_id::text OR p_request_id IS NULL OR length(btrim(p_note))NOT BETWEEN 10 AND 4000
  OR jsonb_typeof(p_evidence)IS DISTINCT FROM'array'OR jsonb_array_length(p_evidence)NOT BETWEEN 1 AND 200
 THEN RAISE EXCEPTION'rtn_npa_manual_review_invalid'USING ERRCODE='22023';END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_evidence)LOOP
  IF NOT coalesce(rtn_private.npa_keys(e,ARRAY['url','citation']),false)OR coalesce(e->>'url','')!~'^https?://(www\.)?(actual\.pravo\.gov\.ru(:8000)?|publication\.pravo\.gov\.ru|pravo\.gov\.ru|gosnadzor\.ru)/'
   OR e->>'url'~'[[:space:]@]'OR(e->>'url'LIKE'%#%'AND(e->>'url')!~'^http://actual\.pravo\.gov\.ru/content/content\.html#hash=[A-Za-z0-9_-]+&bpa=ebpi&ttl=[012]$')
   OR length(coalesce(e->>'citation',''))NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION'rtn_npa_manual_evidence_invalid'USING ERRCODE='22023';END IF;
 END LOOP;
 fingerprint:=rtn_private.npa_sha(jsonb_build_object('bank',p_bank_id,'release',p_release_id,'epoch',p_expected_finding_epoch,'evidence',p_evidence,'note',p_note));
 SELECT * INTO old FROM rtn_private.npa_manual_reviews WHERE request_id=p_request_id;
 IF old.id IS NOT NULL THEN
  IF old.request_hash IS DISTINCT FROM fingerprint OR old.reviewed_by IS DISTINCT FROM actor THEN RAISE EXCEPTION'rtn_npa_request_conflict'USING ERRCODE='40001';END IF;
  RETURN jsonb_build_object('review_id',old.id,'acknowledged_epoch',old.acknowledged_epoch,'admission',rtn_private.npa_admission(p_release_id,clock_timestamp()),'replayed',true);
 END IF;
 epoch:=coalesce((SELECT max(f.epoch)FROM rtn_private.npa_findings f WHERE f.bank_id=p_bank_id),0);
 IF epoch IS DISTINCT FROM p_expected_finding_epoch THEN RAISE EXCEPTION'rtn_npa_finding_epoch_conflict'USING ERRCODE='40001';END IF;
 INSERT INTO rtn_private.npa_manual_reviews(bank_id,release_id,context_sha256,acknowledged_epoch,evidence,reviewed_by,review_note,request_id,request_hash)
 VALUES(p_bank_id,p_release_id,rtn_private.npa_sha(c),epoch,p_evidence,actor,p_note,p_request_id,fingerprint)RETURNING id INTO newid;
 RETURN jsonb_build_object('review_id',newid,'acknowledged_epoch',epoch,'admission',rtn_private.npa_admission(p_release_id,clock_timestamp()),'replayed',false);
END;$fn$;

CREATE FUNCTION rtn_private.npa_run_projection(p_run rtn_private.npa_check_runs,p_at timestamptz)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE proof jsonb;current_cfg uuid;current_m uuid;epoch bigint;can_approve boolean:=false;BEGIN
 IF p_run.id IS NULL THEN RETURN NULL;END IF;
 IF p_run.result IS NOT NULL THEN proof:=rtn_private.npa_proof(p_run.result,p_run,p_at);END IF;
 SELECT id INTO current_cfg FROM rtn_private.npa_configurations WHERE bank_id=p_run.bank_id ORDER BY version DESC LIMIT 1;
 SELECT id INTO current_m FROM rtn_private.npa_manifests WHERE bank_id=p_run.bank_id ORDER BY version DESC LIMIT 1;
 epoch:=coalesce((SELECT max(f.epoch)FROM rtn_private.npa_findings f WHERE f.bank_id=p_run.bank_id),0);
 can_approve:=p_run.status='completed'AND p_at<=p_run.completed_at+interval'15 minutes'AND p_run.configuration_id=current_cfg
 AND p_run.manifest_id IS NOT DISTINCT FROM current_m AND p_run.context IS NOT DISTINCT FROM rtn_private.npa_context(p_run.release_id,p_at)
 AND EXISTS(SELECT 1 FROM rtn_private.npa_configurations cfg WHERE cfg.id=current_cfg AND cfg.release_id=p_run.release_id AND cfg.context_sha256=p_run.context_sha256)
 AND proof->'full'='true'::jsonb AND rtn_private.npa_findings_covered(p_run.bank_id,proof->'observations');
 RETURN jsonb_build_object('id',p_run.id,'status',p_run.status,'configuration_id',p_run.configuration_id,'release_id',p_run.release_id,'key_set_id',p_run.key_set_id,
  'manifest_id',p_run.manifest_id,'manifest_version',p_run.manifest_version,'context_sha256',p_run.context_sha256,'finding_epoch',epoch,'queued_at',p_run.queued_at,'completed_at',p_run.completed_at,
  'outcome',p_run.outcome,'error_code',p_run.error_code,'proof_full',coalesce((proof->>'full')::boolean,false),'reason_codes',coalesce(proof->'reason_codes','[]'),
  'observations',coalesce(proof->'observations','[]'),'discovery_evidence',p_run.result->'discovery','can_approve',coalesce(can_approve,false));
END;$fn$;
CREATE FUNCTION public.get_rtn_npa_editorial_workspace()RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE rows jsonb;at timestamptz:=clock_timestamp();BEGIN
 PERFORM rtn_private.assert_admin();
 SELECT coalesce(jsonb_agg(jsonb_build_object('bank_id',b.id,'code',b.code,'title',coalesce(k.display_title,b.title),'release_id',r.id,
 'configuration',CASE WHEN cfg.id IS NOT NULL THEN jsonb_build_object('id',cfg.id,'version',cfg.version,'release_id',cfg.release_id,'context_sha256',cfg.context_sha256,'basis',cfg.basis,'discovery_from',cfg.discovery_from,'created_at',cfg.created_at)END,
 'manifest',CASE WHEN m.id IS NOT NULL THEN jsonb_build_object('id',m.id,'version',m.version,'stable_sha256',m.stable_sha256,'approved_at',m.approved_at,'hard_stop_at',m.hard_stop_at,'acknowledged_epoch',m.acknowledged_epoch,'run_id',m.run_id)END,
 'admission',rtn_private.npa_admission(r.id,at),'latest_check',rtn_private.npa_run_projection(last_run,at),
 'check_runs',(SELECT coalesce(jsonb_agg(rtn_private.npa_run_projection(x,at)ORDER BY x.queued_at DESC),'[]')FROM(SELECT * FROM rtn_private.npa_check_runs WHERE bank_id=b.id ORDER BY queued_at DESC LIMIT 10)x),
 'pending_findings',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'epoch',f.epoch,'identity_key',f.identity_key,'observed_at',f.observed_at,'projection_sha256',f.projection_sha256,'reason',f.reason,'projection',f.projection,'artifacts',f.artifacts)ORDER BY f.epoch),'[]')
  FROM rtn_private.npa_findings f WHERE f.bank_id=b.id AND f.epoch>coalesce(m.acknowledged_epoch,0)))ORDER BY b.code),'[]')INTO rows
 FROM rtn_private.banks b JOIN rtn_private.sources s ON s.id=b.source_id
 LEFT JOIN LATERAL(SELECT * FROM rtn_private.releases WHERE bank_id=b.id AND effective_from<=(at AT TIME ZONE'Europe/Moscow')::date ORDER BY effective_from DESC,published_at DESC,id DESC LIMIT 1)r ON true
 LEFT JOIN rtn_private.key_sets k ON k.id=r.key_set_id
 LEFT JOIN LATERAL(SELECT * FROM rtn_private.npa_configurations WHERE bank_id=b.id ORDER BY version DESC LIMIT 1)cfg ON true
 LEFT JOIN LATERAL(SELECT * FROM rtn_private.npa_manifests WHERE bank_id=b.id ORDER BY version DESC LIMIT 1)m ON true
 LEFT JOIN LATERAL(SELECT * FROM rtn_private.npa_check_runs WHERE bank_id=b.id ORDER BY queued_at DESC,id DESC LIMIT 1)last_run ON true WHERE s.active;
 RETURN jsonb_build_object('server_time',at,'banks',rows);
END;$fn$;

DO $hooks$DECLARE old record;body text;keyname text;anchor text;replacement text;BEGIN
 SELECT * INTO STRICT old FROM pg_temp.rtn_npa_before_functions WHERE oid='public.assign_rtn_training(uuid,uuid,uuid[],uuid)'::regprocedure;
 anchor:='PERFORM rtn_private.assert_bank_normative_current(p_bank_id,clock_timestamp());';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION'RTN_NPA_ASSIGN_ANCHOR_CHANGED';END IF;
 body:=replace(old.prosrc,anchor,'PERFORM rtn_private.npa_assert_bank(p_bank_id);');EXECUTE replace(old.definition,old.prosrc,body);
 SELECT * INTO STRICT old FROM pg_temp.rtn_npa_before_functions WHERE oid='public.start_rtn_attempt(uuid)'::regprocedure;
 anchor:='PERFORM rtn_private.assert_normative_current(k.id,clock_timestamp());';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION'RTN_NPA_START_ANCHOR_CHANGED';END IF;
 body:=replace(old.prosrc,anchor,'PERFORM rtn_private.npa_assert_release(r.id);');EXECUTE replace(old.definition,old.prosrc,body);
 FOR old IN SELECT * FROM pg_temp.rtn_npa_before_functions WHERE oid=ANY(ARRAY['public.get_rtn_workspace(uuid)'::regprocedure,'public.get_rtn_student_workspace()'::regprocedure,'public.get_rtn_assignment(uuid)'::regprocedure])LOOP
  keyname:=CASE old.oid WHEN'public.get_rtn_workspace(uuid)'::regprocedure THEN'active_k'WHEN'public.get_rtn_student_workspace()'::regprocedure THEN'current_k'ELSE'k'END;
  body:=replace(old.prosrc,'rtn_private.normative_current('||keyname||'.id,clock_timestamp())','rtn_private.npa_key_current('||keyname||'.id,clock_timestamp())');
  anchor:='CASE WHEN '||keyname||'.editorial_review_before IS NOT NULL THEN '||keyname||'.normative_cutoff_at END';
  replacement:='(rtn_private.npa_key_admission('||keyname||'.id,clock_timestamp())->>''normative_cutoff_at'')::timestamptz';
  IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION'RTN_NPA_PROJECTION_CUTOFF_CHANGED:%',old.oid;END IF;
  body:=replace(body,anchor,replacement||',''admission_basis'',rtn_private.npa_key_admission('||keyname||'.id,clock_timestamp())->>''admission_basis'',''latest_check_status'',rtn_private.npa_key_admission('||keyname||'.id,clock_timestamp())->>''latest_check_status'',''latest_check_run_id'',rtn_private.npa_key_admission('||keyname||'.id,clock_timestamp())->>''latest_check_run_id'',''latest_check_at'',rtn_private.npa_key_admission('||keyname||'.id,clock_timestamp())->''latest_check_at''');
  IF body=old.prosrc OR position('rtn_private.normative_current('IN body)>0 THEN RAISE EXCEPTION'RTN_NPA_PROJECTION_ANCHOR_CHANGED:%',old.oid;END IF;
  EXECUTE replace(old.definition,old.prosrc,body);
 END LOOP;
END;$hooks$;

CREATE FUNCTION rtn_private.npa_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE subject uuid;oldrow jsonb;newrow jsonb;columns text[];ok boolean:=false;BEGIN
 IF TG_OP='DELETE'THEN RAISE EXCEPTION'rtn_npa_immutable_history'USING ERRCODE='42501';END IF;
 oldrow:=to_jsonb(OLD);newrow:=to_jsonb(NEW);
 IF TG_TABLE_NAME='npa_configurations'THEN
  subject:=OLD.configured_by;columns:=ARRAY['configured_by','configuration_note','request_hash'];
  ok:=NEW.configured_by IS NULL AND NEW.request_hash IS NULL AND NEW.configuration_note='Авторская атрибуция удалена по подтверждённому запросу.';
 ELSIF TG_TABLE_NAME='npa_manifests'THEN
  subject:=OLD.approved_by;columns:=ARRAY['approved_by','approval_note','request_hash'];
  ok:=NEW.approved_by IS NULL AND NEW.request_hash IS NULL AND NEW.approval_note='Авторская атрибуция удалена по подтверждённому запросу.';
 ELSIF TG_TABLE_NAME='npa_manual_reviews'THEN
  subject:=OLD.reviewed_by;columns:=ARRAY['reviewed_by','review_note','evidence','request_hash'];
  ok:=NEW.reviewed_by IS NULL AND NEW.request_hash IS NULL AND NEW.review_note='Авторская атрибуция удалена по подтверждённому запросу.'AND NEW.evidence='{"redacted":true,"basis":"confirmed_account_erasure"}';
 ELSIF TG_TABLE_NAME='npa_check_runs'THEN
  subject:=OLD.requested_by;columns:=ARRAY['requested_by','requester_erased'];
  ok:=NEW.requested_by IS NULL AND NEW.requester_erased;
  IF(oldrow-ARRAY['status','started_at','claimed_at','completed_at','lease_token','lease_expires_at','attempt_count','result','result_sha256','outcome','error_code','completion_lease_token','completion_receipt_id'])
   IS NOT DISTINCT FROM(newrow-ARRAY['status','started_at','claimed_at','completed_at','lease_token','lease_expires_at','attempt_count','result','result_sha256','outcome','error_code','completion_lease_token','completion_receipt_id'])
   AND OLD.status IN('queued','running')AND NEW.status IN('running','completed')THEN RETURN NEW;END IF;
 END IF;
 IF ok AND subject IS NOT NULL AND rtn_private.erasure_allowed(subject)AND(oldrow-columns)IS NOT DISTINCT FROM(newrow-columns)THEN RETURN NEW;END IF;
 RAISE EXCEPTION'rtn_npa_immutable_history'USING ERRCODE='42501';
END;$fn$;
DO $triggers$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['npa_configurations','npa_check_runs','npa_manifests','npa_findings','npa_receipts','npa_manual_reviews']LOOP
  EXECUTE format('CREATE TRIGGER rtn_npa_immutable BEFORE UPDATE OR DELETE ON rtn_private.%I FOR EACH ROW EXECUTE FUNCTION rtn_private.npa_guard()',t);
 END LOOP;
END;$triggers$;
CREATE FUNCTION rtn_private.npa_erase_attribution(p_user uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT rtn_private.erasure_allowed(p_user)THEN RAISE EXCEPTION'rtn_confirmed_account_erasure_required'USING ERRCODE='42501';END IF;
 UPDATE rtn_private.npa_configurations SET configured_by=NULL,configuration_note='Авторская атрибуция удалена по подтверждённому запросу.',request_hash=NULL WHERE configured_by=p_user;
 UPDATE rtn_private.npa_manifests SET approved_by=NULL,approval_note='Авторская атрибуция удалена по подтверждённому запросу.',request_hash=NULL WHERE approved_by=p_user;
 UPDATE rtn_private.npa_manual_reviews SET reviewed_by=NULL,review_note='Авторская атрибуция удалена по подтверждённому запросу.',evidence='{"redacted":true,"basis":"confirmed_account_erasure"}',request_hash=NULL WHERE reviewed_by=p_user;
 UPDATE rtn_private.npa_check_runs SET requested_by=NULL,requester_erased=true WHERE requested_by=p_user;
END;$fn$;
DO $privacy_hooks$DECLARE old record;body text;anchor text;BEGIN
 SELECT * INTO STRICT old FROM pg_temp.rtn_npa_before_functions WHERE oid='rtn_private.personal_counts(uuid)'::regprocedure;
 anchor:='   ELSIF t.tablename=''settings'' AND r->>''updated_by''=p_user::text THEN v:=r-''updated_by'';';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION'RTN_NPA_PERSONAL_COUNTS_ANCHOR_CHANGED';END IF;
 body:=replace(old.prosrc,anchor,$addition$
   ELSIF t.tablename='npa_configurations' AND r->>'configured_by'=p_user::text THEN v:=r-ARRAY['configured_by','configuration_note','request_hash'];
   ELSIF t.tablename='npa_manifests' AND r->>'approved_by'=p_user::text THEN v:=r-ARRAY['approved_by','approval_note','request_hash'];
   ELSIF t.tablename='npa_manual_reviews' AND r->>'reviewed_by'=p_user::text THEN v:=r-ARRAY['reviewed_by','review_note','evidence','request_hash'];
   ELSIF t.tablename='npa_check_runs' AND r->>'requested_by'=p_user::text THEN v:=r-ARRAY['requested_by','requester_erased'];
$addition$||anchor);
 EXECUTE replace(old.definition,old.prosrc,body);
 SELECT * INTO STRICT old FROM pg_temp.rtn_npa_before_functions WHERE oid='rtn_private.erase_account_links(uuid,uuid)'::regprocedure;
 anchor:=' IF rtn_private.personal_counts(p_user)<>''[]''::jsonb THEN RAISE EXCEPTION ''RTN_PERSONAL_ERASURE_INCOMPLETE'' USING ERRCODE=''P0001'';END IF;';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION'RTN_NPA_ERASURE_WORKFLOW_ANCHOR_CHANGED';END IF;
 body:=replace(old.prosrc,anchor,E' PERFORM rtn_private.npa_erase_attribution(p_user);\n'||anchor);EXECUTE replace(old.definition,old.prosrc,body);
END;$privacy_hooks$;

-- Only functions created by THIS migration are scrubbed. Existing financial,
-- role, privacy and course RPC ACLs are left byte-identical.
DO $acl$DECLARE p record;g record;role_name text;allow_auth boolean;allow_service boolean;BEGIN
 FOR p IN SELECT pf.oid,n.nspname,pf.proname FROM pg_proc pf JOIN pg_namespace n ON n.oid=pf.pronamespace WHERE NOT EXISTS(SELECT 1 FROM pg_temp.rtn_npa_existing_function_oids x WHERE x.oid=pf.oid)
 AND n.nspname IN('public','rtn_private')LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM pg_proc x CROSS JOIN LATERAL aclexplode(coalesce(x.proacl,acldefault('f',x.proowner)))a WHERE x.oid=p.oid AND a.grantee<>x.proowner LOOP
   role_name:=CASE WHEN g.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(g.grantee))END;
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',p.oid::regprocedure,role_name);
  END LOOP;
  allow_auth:=p.nspname='public'AND p.proname IN('configure_rtn_npa_basis','approve_rtn_npa_manifest','acknowledge_rtn_npa_manual_review','request_rtn_npa_check','request_rtn_npa_editorial_check','get_rtn_npa_editorial_workspace');
  allow_service:=p.nspname='public'AND p.proname IN('claim_rtn_npa_check','complete_rtn_npa_check','enqueue_due_rtn_npa_checks');
  IF allow_auth THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',p.oid::regprocedure);END IF;
  IF allow_service THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',p.oid::regprocedure);END IF;
 END LOOP;
 FOR p IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='rtn_private'AND c.relname LIKE'npa_%'AND c.relkind='r'LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM pg_class x CROSS JOIN LATERAL aclexplode(coalesce(x.relacl,acldefault('r',x.relowner)))a WHERE x.oid=p.oid AND a.grantee<>x.relowner LOOP
   role_name:=CASE WHEN g.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(g.grantee))END;
   EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM %s',p.nspname,p.relname,role_name);
  END LOOP;
 END LOOP;
END;$acl$;
DO $metadata$DECLARE old record;nowmeta jsonb;BEGIN
 FOR old IN SELECT * FROM pg_temp.rtn_npa_before_functions LOOP
  SELECT to_jsonb(p)-'prosrc'INTO nowmeta FROM pg_proc p WHERE p.oid=old.oid;
  IF nowmeta IS DISTINCT FROM old.metadata THEN RAISE EXCEPTION'RTN_NPA_OLD_FUNCTION_METADATA_CHANGED:%',old.oid;END IF;
 END LOOP;
END;$metadata$;
