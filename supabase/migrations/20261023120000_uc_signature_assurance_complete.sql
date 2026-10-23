-- UC022 complete assurance composition on actual624ER plus retained S3H; isolated-source verification and production approval remain separate.
BEGIN;
-- Private foundation is followed by complete current-scope/service/privacy overrides.
-- The guarded release must preserve exact existing624ER and retained S3H authority.
-- No legacy row/backfill, real policy approval, account role or retention rule is seeded here.
SET search_path=pg_catalog,public;

CREATE FUNCTION public.uc_signature_assurance_error(p_code text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
 IF p_code IS NULL OR p_code NOT IN ('ACCESS_DENIED','INVALID_INPUT','NOT_FOUND','REVISION_CONFLICT','REQUEST_CONFLICT','CLASSIFICATION_REQUIRED','POLICY_REQUIRED','POLICY_NOT_ACCEPTED','POLICY_CHANGED','IDENTITY_REQUIRED','IDENTITY_MISMATCH','AUTHORITY_REQUIRED','AGREEMENT_REQUIRED','AGREEMENT_CHANGED','METHOD_UNSUPPORTED','SOURCE_UNAVAILABLE','SOURCE_CHANGED','CLOSED','EXPIRED','LIMIT_EXCEEDED','DEPENDENCY_UNAVAILABLE') THEN p_code:='DEPENDENCY_UNAVAILABLE'; END IF;
 RAISE EXCEPTION 'SIGNATURE_EVIDENCE_%',p_code USING ERRCODE=CASE WHEN p_code='ACCESS_DENIED' THEN '42501' WHEN p_code='INVALID_INPUT' THEN '22023' WHEN p_code='NOT_FOUND' THEN 'P0002' ELSE 'PT409' END;
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_hash(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$
 SELECT encode(sha256(convert_to(p_text,'UTF8')),'hex')
$fn$;
CREATE FUNCTION public.uc_signature_assurance_shape(p_value jsonb,p_keys text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN jsonb_typeof(p_value)='object' THEN p_value ?& p_keys AND (SELECT count(*) FROM jsonb_object_keys(p_value))=cardinality(p_keys) ELSE false END
$fn$;
CREATE FUNCTION public.uc_signature_assurance_text(p_value jsonb,p_max integer,p_empty boolean DEFAULT false) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_typeof(p_value)='string' AND char_length(p_value#>>'{}')+(SELECT count(*)FROM regexp_split_to_table(p_value#>>'{}','')ch WHERE ascii(ch)>65535)<=p_max
  AND (p_empty OR length(btrim(p_value#>>'{}'))>0) AND regexp_replace(p_value#>>'{}',E'[\t\r\n]','','g')!~'[[:cntrl:]]',false)
$fn$;
CREATE FUNCTION public.uc_signature_assurance_uuid(p_value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_typeof(p_value)='string' AND (p_value#>>'{}')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)
$fn$;
CREATE FUNCTION public.uc_signature_assurance_sha(p_value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(jsonb_typeof(p_value)='string' AND (p_value#>>'{}')~'^[0-9a-f]{64}$',false)
$fn$;
CREATE FUNCTION public.uc_signature_assurance_integer(p_value jsonb,p_min integer DEFAULT 0,p_max integer DEFAULT 2147483647) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN jsonb_typeof(p_value)='number' AND (p_value#>>'{}')~'^[0-9]{1,10}$' THEN (p_value#>>'{}')::numeric BETWEEN p_min AND p_max ELSE false END
$fn$;
CREATE FUNCTION public.uc_signature_assurance_classification(p_value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_signature_assurance_shape(p_value,ARRAY['document_type','subtype','party_role'])
  AND p_value->>'document_type' IN ('contract','consent','act','order','custom_pdf','education_document','external_upload')
  AND public.uc_signature_assurance_text(p_value->'subtype',120) AND p_value->>'subtype'<>'*'
  AND p_value->>'party_role' IN ('sender','recipient','student','individual','company_representative'),false)
$fn$;
CREATE FUNCTION public.uc_signature_assurance_selection(p_value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(CASE WHEN p_value->>'kind'='org_document_version' THEN public.uc_signature_assurance_shape(p_value,ARRAY['kind','organization_id','source'])
  WHEN p_value->>'kind'='document_registry_file' THEN public.uc_signature_assurance_shape(p_value,ARRAY['kind','organization_id','registry_record_id','registry_record_revision','source'])
   AND public.uc_signature_assurance_uuid(p_value->'registry_record_id') AND public.uc_signature_assurance_integer(p_value->'registry_record_revision',1)
  ELSE false END
  AND public.uc_signature_assurance_uuid(p_value->'organization_id')
  AND public.uc_signature_assurance_shape(p_value->'source',ARRAY['kind','document_id','version_id','content_hash'])
  AND p_value->'source'->>'kind'='org_document_version'
  AND public.uc_signature_assurance_uuid(p_value->'source'->'document_id') AND public.uc_signature_assurance_uuid(p_value->'source'->'version_id') AND public.uc_signature_assurance_sha(p_value->'source'->'content_hash'),false)
$fn$;
CREATE FUNCTION public.uc_signature_assurance_terms(p_value jsonb,p_kind text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_signature_assurance_shape(p_value,ARRAY['kind','version','text','sha256']) AND p_value->>'kind'=p_kind
  AND public.uc_signature_assurance_text(p_value->'version',120) AND jsonb_typeof(p_value->'text')='string'
   AND octet_length(p_value->>'text') BETWEEN 1 AND 65536 AND public.uc_signature_assurance_text(p_value->'text',65536)
  AND public.uc_signature_assurance_sha(p_value->'sha256') AND public.uc_signature_assurance_hash(p_value->>'text')=p_value->>'sha256',false)
$fn$;

-- No new relation references auth.users/profiles or old customer tables by FK. All customer
-- associations are resolved under exact current authority in entrypoints, not by a name/role guess.
CREATE TABLE public.uc_signature_assurance_streams(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('policy','signature','consent','agreement')),
 entity_id uuid NOT NULL,subject_user_id uuid,revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(organization_id,kind,entity_id),UNIQUE(id,organization_id),
 CHECK((kind IN('consent','agreement'))=(subject_user_id IS NOT NULL)),
 CHECK(kind NOT IN('policy','signature') OR id=entity_id)
);
CREATE TABLE public.uc_signature_assurance_policy_versions(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,family_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),
 body jsonb NOT NULL,body_json text NOT NULL,body_sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid,
 UNIQUE(id,organization_id),UNIQUE(family_id,version),
 FOREIGN KEY(family_id,organization_id)REFERENCES public.uc_signature_assurance_streams(id,organization_id),
 CHECK(jsonb_typeof(body)='object' AND body_json::jsonb=body),
 CHECK(octet_length(body_json) BETWEEN 1 AND 196608),
 CHECK(body_sha256~'^[0-9a-f]{64}$' AND body_sha256=public.uc_signature_assurance_hash(body_json))
);
CREATE TABLE public.uc_signature_assurance_policy_decisions(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,policy_version_id uuid NOT NULL,stream_revision integer NOT NULL CHECK(stream_revision>0),
 state text NOT NULL CHECK(state IN('draft','source_checked','reviewed','centre_accepted','retired')),
 actor_user_id uuid,authority jsonb NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 4000),source_limits_acknowledged boolean NOT NULL,
 server_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,organization_id),UNIQUE(policy_version_id,stream_revision),
 FOREIGN KEY(policy_version_id,organization_id)REFERENCES public.uc_signature_assurance_policy_versions(id,organization_id),
 CHECK(jsonb_typeof(authority)='object')
);
CREATE TABLE public.uc_signature_assurance_document_snapshots(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,signature_id uuid NOT NULL,party_role text NOT NULL CHECK(party_role IN('sender','recipient')),document_revision_id uuid,
 html_text text NOT NULL,html_sha256 text NOT NULL,original_file jsonb,
 source_file_state text NOT NULL CHECK(source_file_state IN('not_present','verified_bytes','unverified_reference')),
 subject_user_id uuid,recipient_user_id uuid,captured_by uuid,captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,organization_id),UNIQUE(id,organization_id,signature_id,party_role),FOREIGN KEY(signature_id,organization_id)REFERENCES public.uc_signature_assurance_streams(id,organization_id),
 CHECK(octet_length(html_text)<=1000000),CHECK(html_sha256~'^[0-9a-f]{64}$' AND html_sha256=public.uc_signature_assurance_hash(html_text)),
 CHECK((original_file IS NULL)=(source_file_state='not_present')),CHECK(original_file IS NULL OR jsonb_typeof(original_file)='object')
);
CREATE TABLE public.uc_signature_assurance_bindings(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,signature_id uuid NOT NULL,party_role text NOT NULL CHECK(party_role IN('sender','recipient')),revision integer NOT NULL CHECK(revision>0),
 document_snapshot_id uuid NOT NULL,policy_version_id uuid NOT NULL,policy_sha256 text NOT NULL,policy_decision_revision integer NOT NULL CHECK(policy_decision_revision>0),
 classification jsonb NOT NULL,agreement_sha256 text,subject_user_id uuid,recipient_user_id uuid,
 bound_by uuid,bound_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,organization_id),UNIQUE(id,organization_id,signature_id,party_role),UNIQUE(signature_id,revision),
 FOREIGN KEY(signature_id,organization_id)REFERENCES public.uc_signature_assurance_streams(id,organization_id),
 FOREIGN KEY(document_snapshot_id,organization_id,signature_id,party_role)REFERENCES public.uc_signature_assurance_document_snapshots(id,organization_id,signature_id,party_role),
 FOREIGN KEY(policy_version_id,organization_id)REFERENCES public.uc_signature_assurance_policy_versions(id,organization_id),
 CHECK(public.uc_signature_assurance_classification(classification)),CHECK((party_role='sender')=(classification->>'party_role'='sender')),CHECK(policy_sha256~'^[0-9a-f]{64}$'),CHECK(agreement_sha256 IS NULL OR agreement_sha256~'^[0-9a-f]{64}$')
);
CREATE TABLE public.uc_signature_assurance_agreements(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,subject_user_id uuid NOT NULL,stream_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),
 policy_version_id uuid NOT NULL,policy_sha256 text NOT NULL,terms jsonb NOT NULL,rendered_text text NOT NULL,rendered_text_sha256 text NOT NULL,
 actor jsonb NOT NULL,accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,organization_id),UNIQUE(stream_id,revision),FOREIGN KEY(stream_id,organization_id)REFERENCES public.uc_signature_assurance_streams(id,organization_id),
 FOREIGN KEY(policy_version_id,organization_id)REFERENCES public.uc_signature_assurance_policy_versions(id,organization_id),
 CHECK(public.uc_signature_assurance_terms(terms,'pep_agreement')),CHECK(policy_sha256~'^[0-9a-f]{64}$'),
 CHECK(octet_length(rendered_text) BETWEEN 1 AND 65536),CHECK(rendered_text_sha256~'^[0-9a-f]{64}$' AND rendered_text_sha256=public.uc_signature_assurance_hash(rendered_text)),CHECK(jsonb_typeof(actor)='object')
);
CREATE TABLE public.uc_signature_assurance_consents(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,subject_user_id uuid NOT NULL,stream_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),
 state text NOT NULL CHECK(state IN('confirmed','withdrawn')),previous_snapshot_id uuid,
 policy_version_id uuid NOT NULL,policy_sha256 text NOT NULL,agreement_event_id uuid NOT NULL,terms jsonb NOT NULL,
 rendered_text text NOT NULL,rendered_text_sha256 text NOT NULL,organization_name text NOT NULL,organization_inn text,
 actor jsonb NOT NULL,authority jsonb NOT NULL,confirmed_at timestamptz NOT NULL,withdrawn_at timestamptz,
 UNIQUE(id,organization_id),UNIQUE(stream_id,revision),
 FOREIGN KEY(stream_id,organization_id)REFERENCES public.uc_signature_assurance_streams(id,organization_id),
 FOREIGN KEY(previous_snapshot_id,organization_id)REFERENCES public.uc_signature_assurance_consents(id,organization_id),
 FOREIGN KEY(policy_version_id,organization_id)REFERENCES public.uc_signature_assurance_policy_versions(id,organization_id),
 FOREIGN KEY(agreement_event_id,organization_id)REFERENCES public.uc_signature_assurance_agreements(id,organization_id),
 CHECK(public.uc_signature_assurance_terms(terms,'personal_data_consent')),CHECK(policy_sha256~'^[0-9a-f]{64}$'),
 CHECK(octet_length(rendered_text) BETWEEN 1 AND 65536),CHECK(rendered_text_sha256~'^[0-9a-f]{64}$' AND rendered_text_sha256=public.uc_signature_assurance_hash(rendered_text)),
 CHECK((state='withdrawn')=(withdrawn_at IS NOT NULL)),CHECK(state<>'withdrawn' OR previous_snapshot_id IS NOT NULL),CHECK(jsonb_typeof(actor)='object' AND jsonb_typeof(authority)='object')
);
CREATE TABLE public.uc_signature_assurance_events(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,stream_id uuid NOT NULL,stream_kind text NOT NULL CHECK(stream_kind IN('policy','signature','consent','agreement')),
 revision integer NOT NULL CHECK(revision>0),kind text NOT NULL CHECK(kind IN('policy_created','policy_source_checked','policy_reviewed','policy_accepted','policy_retired','signature_bound','graphic_prepared','bearer_confirmed','account_confirmed','scan_received','sender_confirmed','agreement_accepted','consent_confirmed','consent_withdrawn','invitation_revoked','recipient_rejected')),
 payload jsonb NOT NULL,request_id uuid NOT NULL,subject_user_id uuid,recipient_user_id uuid,actor_user_id uuid,
 signature_id uuid,binding_id uuid,party_role text,document_snapshot_id uuid,policy_version_id uuid,agreement_event_id uuid,consent_snapshot_id uuid,
 server_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,organization_id),UNIQUE(stream_id,revision),
 FOREIGN KEY(stream_id,organization_id)REFERENCES public.uc_signature_assurance_streams(id,organization_id),
 FOREIGN KEY(binding_id,organization_id,signature_id,party_role)REFERENCES public.uc_signature_assurance_bindings(id,organization_id,signature_id,party_role),
 FOREIGN KEY(document_snapshot_id,organization_id,signature_id,party_role)REFERENCES public.uc_signature_assurance_document_snapshots(id,organization_id,signature_id,party_role),
 FOREIGN KEY(policy_version_id,organization_id)REFERENCES public.uc_signature_assurance_policy_versions(id,organization_id),
 FOREIGN KEY(agreement_event_id,organization_id)REFERENCES public.uc_signature_assurance_agreements(id,organization_id),
 FOREIGN KEY(consent_snapshot_id,organization_id)REFERENCES public.uc_signature_assurance_consents(id,organization_id),
 CHECK(jsonb_typeof(payload)='object' AND coalesce(payload->>'cryptographic_verification'='not_performed',false) AND coalesce(payload->>'time_assurance'='platform_server_time',false)),
 CHECK(octet_length(payload::text)<=1000000),
 CHECK(CASE WHEN stream_kind='signature' THEN signature_id IS NOT NULL AND signature_id=stream_id AND party_role IS NOT NULL AND party_role IN('sender','recipient') ELSE signature_id IS NULL AND party_role IS NULL AND binding_id IS NULL AND document_snapshot_id IS NULL END),
 CHECK(stream_kind=CASE WHEN kind LIKE'policy_%'THEN'policy'WHEN kind='agreement_accepted'THEN'agreement'WHEN kind LIKE'consent_%'THEN'consent'ELSE'signature'END),
 CHECK(stream_kind<>'signature' OR (binding_id IS NULL)=(policy_version_id IS NULL)),
 CHECK(kind NOT IN('signature_bound','account_confirmed','sender_confirmed') OR binding_id IS NOT NULL AND document_snapshot_id IS NOT NULL),
 CHECK(kind<>'sender_confirmed' OR party_role='sender'),CHECK(kind NOT IN('account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked') OR party_role='recipient')
);
CREATE TABLE public.uc_signature_assurance_private_manifests(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,signature_id uuid NOT NULL,through_revision integer NOT NULL CHECK(through_revision>=0),
 body_json text NOT NULL,body_sha256 text NOT NULL,captured_by uuid,captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,organization_id),FOREIGN KEY(signature_id,organization_id)REFERENCES public.uc_signature_assurance_streams(id,organization_id),
 CHECK(octet_length(body_json) BETWEEN 1 AND 2000000),CHECK(body_sha256~'^[0-9a-f]{64}$' AND body_sha256=public.uc_signature_assurance_hash(body_json))
);
CREATE TABLE public.uc_signature_assurance_scoped_manifests(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,source_manifest_id uuid NOT NULL,signature_id uuid NOT NULL,
 body_json text NOT NULL,body_json_sha256 text NOT NULL,receipt_html text NOT NULL,receipt_html_sha256 text NOT NULL,
 captured_by uuid,captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(id,organization_id),
 FOREIGN KEY(source_manifest_id,organization_id)REFERENCES public.uc_signature_assurance_private_manifests(id,organization_id),
 CHECK(id<>source_manifest_id),CHECK(octet_length(body_json)+octet_length(receipt_html) BETWEEN 1 AND 2000000),
 CHECK(body_json_sha256~'^[0-9a-f]{64}$' AND body_json_sha256=public.uc_signature_assurance_hash(body_json)),
 CHECK(receipt_html_sha256~'^[0-9a-f]{64}$' AND receipt_html_sha256=public.uc_signature_assurance_hash(receipt_html))
);
CREATE TABLE public.uc_signature_assurance_requests(
 organization_id uuid NOT NULL,request_id uuid NOT NULL,actor_user_id uuid,payload_sha256 text NOT NULL,
 action text NOT NULL,stream_id uuid NOT NULL,event_id uuid,party_role text,binding_id uuid,entity_id uuid NOT NULL,revision_applied integer NOT NULL CHECK(revision_applied>=0),
 server_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(organization_id,request_id),
 FOREIGN KEY(stream_id,organization_id)REFERENCES public.uc_signature_assurance_streams(id,organization_id),
 FOREIGN KEY(event_id,organization_id)REFERENCES public.uc_signature_assurance_events(id,organization_id),
 FOREIGN KEY(binding_id,organization_id)REFERENCES public.uc_signature_assurance_bindings(id,organization_id),
 CHECK(payload_sha256~'^[0-9a-f]{64}$'),CHECK(action IN('save_policy_draft','record_policy_decision','bind_signature','accept_agreement','confirm_consent','withdraw_consent','confirm_sender','record_graphic_preparation','revoke_invitation','capture_receipt','confirm','receive_scan','reject')),
 CHECK(CASE WHEN action IN('bind_signature','confirm_sender','record_graphic_preparation','revoke_invitation','capture_receipt','confirm','receive_scan','reject') THEN party_role IS NOT NULL AND party_role IN('sender','recipient') ELSE party_role IS NULL AND binding_id IS NULL END),
 CHECK(action<>'capture_receipt' OR event_id IS NULL AND binding_id IS NULL),CHECK(action NOT IN('bind_signature','confirm_sender') OR binding_id IS NOT NULL),
 CHECK(action<>'confirm_sender' OR party_role='sender'),CHECK(action NOT IN('revoke_invitation','confirm','receive_scan','reject') OR party_role='recipient')
);
CREATE TABLE public.uc_signature_assurance_participants(
 organization_id uuid NOT NULL,object_kind text NOT NULL CHECK(object_kind IN('stream','policy','decision','binding','document','agreement','consent','event','private_manifest','scoped_manifest','request')),
 object_id uuid NOT NULL,user_id uuid NOT NULL,relation text NOT NULL CHECK(relation IN('subject','recipient','actual_personal_signer','staff_attribution')),
 PRIMARY KEY(organization_id,object_kind,object_id,user_id,relation)
);
-- Owner-only transaction tokens distinguish normal append operations from exact trusted
-- privacy anonymization/removal. No caller-configurable GUC is accepted as this authority.
CREATE TABLE public.uc_signature_assurance_write_tokens(
 transaction_id bigint NOT NULL,object_kind text NOT NULL,object_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN('append','privacy_attribution','privacy_subject')),
 PRIMARY KEY(transaction_id,object_kind,object_id,operation)
);
CREATE INDEX uc_signature_assurance_policy_org_page ON public.uc_signature_assurance_policy_versions(organization_id,id);
CREATE INDEX uc_signature_assurance_event_stream_page ON public.uc_signature_assurance_events(organization_id,stream_id,revision);
CREATE INDEX uc_signature_assurance_participant_subject ON public.uc_signature_assurance_participants(user_id,relation,organization_id,object_kind,object_id);
CREATE INDEX uc_signature_assurance_binding_signature ON public.uc_signature_assurance_bindings(organization_id,signature_id,party_role,revision DESC);
CREATE INDEX uc_signature_assurance_agreement_subject ON public.uc_signature_assurance_agreements(organization_id,subject_user_id,id);
CREATE INDEX uc_signature_assurance_consent_subject ON public.uc_signature_assurance_consents(organization_id,subject_user_id,id);

CREATE FUNCTION public.uc_signature_assurance_active(p_actor uuid DEFAULT auth.uid()) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(public.uc_custom_journal_person(p_actor) AND (
  auth.role()='authenticated' AND p_actor=auth.uid() AND public.account_deletion_access_allowed()
  OR auth.role()='service_role' AND auth.uid() IS NULL),false)
$fn$;
CREATE FUNCTION public.uc_signature_assurance_date(p_value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE value text;
BEGIN
 IF jsonb_typeof(p_value)IS DISTINCT FROM'string' THEN RETURN false;END IF;value:=p_value#>>'{}';
 IF value!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false;END IF;
 RETURN to_char(value::date,'YYYY-MM-DD')=value;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_legal_source(p_value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE address text;host text;
BEGIN
 IF NOT public.uc_signature_assurance_shape(p_value,ARRAY['source_key','title','primary_url','provision','edition','checked_on','effective_from','effective_until','completeness','limitation'])
 OR NOT public.uc_signature_assurance_text(p_value->'source_key',120)OR NOT public.uc_signature_assurance_text(p_value->'title',500)
 OR NOT public.uc_signature_assurance_text(p_value->'primary_url',2000)OR NOT public.uc_signature_assurance_text(p_value->'provision',2000)OR NOT public.uc_signature_assurance_text(p_value->'edition',500)
 OR NOT public.uc_signature_assurance_date(p_value->'checked_on')OR(p_value->'effective_from'<>'null'::jsonb AND NOT public.uc_signature_assurance_date(p_value->'effective_from'))
 OR(p_value->'effective_until'<>'null'::jsonb AND NOT public.uc_signature_assurance_date(p_value->'effective_until'))
 OR NOT coalesce((p_value->>'completeness')IN('verified_body','consolidation_review_required'),false)
 OR(p_value->'limitation'<>'null'::jsonb AND NOT public.uc_signature_assurance_text(p_value->'limitation',4000))
 OR(p_value->>'completeness'='consolidation_review_required' AND p_value->'limitation'='null'::jsonb) THEN RETURN false;END IF;
 address:=p_value->>'primary_url';host:=regexp_replace(substr(address,9),'[/?#].*$','');
 RETURN left(address,8)='https://' AND address!~'[[:space:]#]' AND host<>'' AND strpos(host,'@')=0;
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_policy_body(p_org uuid,p_value jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
DECLARE item jsonb;selected_method text;purpose text;
BEGIN
 IF octet_length(p_value::text)>196608 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 IF NOT public.uc_signature_assurance_shape(p_value,ARRAY['version','classification','method','purpose','identity_requirement','authority_requirement','basis','agreement','consent','limitations'])
 OR p_value->'version'IS DISTINCT FROM'1'::jsonb OR NOT public.uc_signature_assurance_classification(p_value->'classification')
 OR NOT coalesce((p_value->>'method')IN('graphic_asset','scan_received','bearer_invitation_confirmation','authenticated_account_confirmation'),false)
 OR NOT coalesce((p_value->>'purpose')IN('factual_only','account_pep','paper_scan_record'),false)
 OR NOT coalesce((p_value->>'identity_requirement')IN('declared','account_control'),false)OR NOT coalesce((p_value->>'authority_requirement')IN('self','declared_representative','exact_document_reference'),false)
 OR NOT public.uc_signature_assurance_text(p_value->'limitations',4000)
 OR NOT public.uc_signature_assurance_shape(p_value->'basis',ARRAY['kind','explanation','sources','document_references'])
 OR NOT coalesce((p_value->'basis'->>'kind')IN('law','agreement','local_act','combined'),false)OR NOT public.uc_signature_assurance_text(p_value->'basis'->'explanation',4000)
 OR jsonb_typeof(p_value->'basis'->'sources')IS DISTINCT FROM'array' OR jsonb_typeof(p_value->'basis'->'document_references')IS DISTINCT FROM'array'
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF jsonb_array_length(p_value->'basis'->'sources')>20 OR jsonb_array_length(p_value->'basis'->'document_references')>20 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_value->'basis'->'sources')LOOP
  IF public.uc_signature_assurance_legal_source(item)IS DISTINCT FROM true THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p_value->'basis'->'document_references')LOOP
  IF NOT public.uc_signature_assurance_selection(item)OR item->>'organization_id'IS DISTINCT FROM p_org::text THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 END LOOP;
 IF(p_value->'agreement'<>'null'::jsonb AND public.uc_signature_assurance_terms(p_value->'agreement','pep_agreement')IS DISTINCT FROM true)
 OR(p_value->'consent'<>'null'::jsonb AND public.uc_signature_assurance_terms(p_value->'consent','personal_data_consent')IS DISTINCT FROM true)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 selected_method:=p_value->>'method';purpose:=p_value->>'purpose';
 IF selected_method='graphic_asset'AND purpose<>'factual_only'
 OR selected_method='bearer_invitation_confirmation'AND(purpose<>'factual_only'OR p_value->>'identity_requirement'<>'declared')
 OR selected_method='scan_received'AND purpose<>'paper_scan_record'
 OR purpose='account_pep'AND(selected_method<>'authenticated_account_confirmation'OR p_value->>'identity_requirement'<>'account_control'OR p_value->'agreement'='null'::jsonb)
 OR selected_method='authenticated_account_confirmation'AND p_value->'classification'->>'document_type'='consent'AND p_value->'consent'='null'::jsonb
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
END;$fn$;
-- Returns exact metadata selection only. Actual file-byte proof may be attached solely
-- by a separately captured trusted verifier record; content_hash is never reused as byte SHA.
CREATE FUNCTION public.uc_signature_assurance_resolve_selection(p_org uuid,p_value jsonb,p_required boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE record_row public.uc_document_registry_records;stored_source jsonb;proof jsonb;
BEGIN
 IF NOT public.uc_signature_assurance_selection(p_value)OR p_value->>'organization_id'IS DISTINCT FROM p_org::text THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF p_value->>'kind'='document_registry_file' THEN
  SELECT*INTO record_row FROM public.uc_document_registry_records WHERE id=(p_value->>'registry_record_id')::uuid AND organization_id=p_org AND NOT redacted;
  IF record_row.id IS NULL OR NOT public.uc_scoped_journal_permission(p_org,record_row.group_id,false)THEN
   IF p_required THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;RETURN NULL;
  END IF;
  IF record_row.revision=(p_value->>'registry_record_revision')::integer THEN stored_source:=record_row.data->'source';
  ELSE SELECT snapshot->'data'->'source'INTO stored_source FROM public.uc_document_registry_events WHERE organization_id=p_org AND record_id=record_row.id AND revision=(p_value->>'registry_record_revision')::integer AND NOT redacted;END IF;
  IF stored_source IS DISTINCT FROM p_value->'source' THEN IF p_required THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;RETURN NULL;END IF;
 END IF;
 proof:=public.uc_document_registry_source(p_org,p_value->'source',false,false);
 IF proof IS NULL THEN IF p_required THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;RETURN NULL;END IF;
 RETURN p_value;
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_disclose_selection(p_org uuid,p_value jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE literal text:=p_value::text;
BEGIN
 IF public.uc_signature_assurance_resolve_selection(p_org,p_value,false)IS NULL THEN RETURN jsonb_build_object('visibility','redacted','captured_reference_sha256',public.uc_signature_assurance_hash(literal),'value',NULL,'reason','current_file_scope');END IF;
 RETURN jsonb_build_object('visibility','available','captured_reference_sha256',public.uc_signature_assurance_hash(literal),'captured_reference_json',literal,'value',p_value);
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_actor(p_user uuid,p_declared_name text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actual_email text;confirmed boolean:=false;
BEGIN
 IF p_declared_name IS NOT NULL AND NOT public.uc_signature_assurance_text(to_jsonb(p_declared_name),300)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF p_user IS NOT NULL THEN
  IF NOT public.uc_custom_journal_person(p_user)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
  SELECT email,email IS NOT NULL AND email_confirmed_at IS NOT NULL INTO actual_email,confirmed FROM auth.users WHERE id=p_user;
  IF NOT FOUND THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 END IF;
 RETURN jsonb_build_object('user_id',p_user,'observed_mode',CASE WHEN p_user IS NULL THEN'bearer'ELSE'account'END,
 'observed_email',actual_email,'email_control_confirmed',coalesce(confirmed,false),'declared_full_name',p_declared_name,'name_assurance','declared');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_authority(p_org uuid,p_value jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE resolved jsonb;reference jsonb;literal text;
BEGIN
 IF NOT public.uc_signature_assurance_shape(p_value,ARRAY['kind','declaration','document_reference'])
 OR NOT coalesce(p_value->>'kind'IN('self','declared_representative','exact_document_reference','unknown'),false)
 OR(p_value->'declaration'<>'null'::jsonb AND NOT public.uc_signature_assurance_text(p_value->'declaration',4000))
 OR(p_value->>'kind'='declared_representative'AND p_value->'declaration'='null'::jsonb)
 OR(p_value->>'kind'='exact_document_reference')IS DISTINCT FROM(p_value->'document_reference'<>'null'::jsonb)
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF p_value->>'kind'='exact_document_reference' THEN
  resolved:=public.uc_signature_assurance_resolve_selection(p_org,p_value->'document_reference',true)||jsonb_build_object('byte_proof',NULL);
  literal:=resolved::text;reference:=jsonb_build_object('visibility','available','captured_reference_json',literal,'captured_reference_sha256',public.uc_signature_assurance_hash(literal),'value',resolved);
 END IF;
 RETURN jsonb_build_object('kind',p_value->>'kind','declaration',p_value->'declaration','document_reference',reference,
 'verification',CASE WHEN reference IS NULL THEN'not_verified'ELSE'exact_reference_checked'END);
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_stream(p_org uuid,p_kind text,p_entity uuid,p_subject uuid DEFAULT NULL) RETURNS public.uc_signature_assurance_streams
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE head public.uc_signature_assurance_streams;new_id uuid;
BEGIN
 IF p_org IS NULL OR p_entity IS NULL OR NOT coalesce(p_kind IN('policy','signature','agreement','consent'),false)
 OR(p_kind IN('agreement','consent'))IS DISTINCT FROM(p_subject IS NOT NULL)
 OR(p_subject IS NOT NULL AND p_entity<>p_subject)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 SELECT*INTO head FROM public.uc_signature_assurance_streams WHERE organization_id=p_org AND kind=p_kind AND entity_id=p_entity FOR UPDATE NOWAIT;
 IF head.id IS NOT NULL THEN
  IF head.subject_user_id IS DISTINCT FROM p_subject THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;RETURN head;
 END IF;
 new_id:=CASE WHEN p_kind IN('policy','signature')THEN p_entity ELSE gen_random_uuid()END;
 PERFORM public.uc_signature_assurance_token('stream',new_id);
 INSERT INTO public.uc_signature_assurance_streams(id,organization_id,kind,entity_id,subject_user_id)VALUES(new_id,p_org,p_kind,p_entity,p_subject)RETURNING*INTO head;
 RETURN head;
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_track(p_org uuid,p_kind text,p_id uuid,p_user uuid,p_relation text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF p_user IS NULL THEN RETURN;END IF;
 IF p_org IS NULL OR p_id IS NULL OR NOT coalesce(p_kind IN('stream','policy','decision','binding','document','agreement','consent','event','private_manifest','scoped_manifest','request'),false)
 OR NOT coalesce(p_relation IN('subject','recipient','actual_personal_signer','staff_attribution'),false)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 PERFORM public.uc_signature_assurance_token('participant',p_id);
 INSERT INTO public.uc_signature_assurance_participants(organization_id,object_kind,object_id,user_id,relation)VALUES(p_org,p_kind,p_id,p_user,p_relation)ON CONFLICT DO NOTHING;
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_own_current(p_org uuid,p_subject uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND auth.uid()=p_subject AND public.uc_signature_assurance_active(p_subject)
  AND EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org)
  AND(EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_subject AND organization_id=p_org)
   OR EXISTS(SELECT 1 FROM public.org_staff staff WHERE staff.user_id=p_subject AND staff.organization_id=p_org AND(staff.expires_at IS NULL OR staff.expires_at>clock_timestamp()))
   OR EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.user_id=p_subject AND c.organization_id=p_org AND e.status IN('active','completed'))),false)
$fn$;
CREATE FUNCTION public.uc_signature_assurance_subject_read(p_org uuid,p_subject uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND public.uc_signature_assurance_active() AND public.uc_custom_journal_person(p_subject) AND (
  auth.uid()=p_subject AND(public.uc_signature_assurance_own_current(p_org,p_subject)
   OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_agreements WHERE organization_id=p_org AND subject_user_id=p_subject)
   OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_consents WHERE organization_id=p_org AND subject_user_id=p_subject)
   OR EXISTS(SELECT 1 FROM public.pep_agreements WHERE organization_id=p_org AND user_id=p_subject)
   OR EXISTS(SELECT 1 FROM public.pep_agreements WHERE organization_id IS NULL AND user_id=p_subject)
   OR EXISTS(SELECT 1 FROM public.student_consents WHERE organization_id=p_org AND user_id=p_subject))
  OR public.uc_document_has_action(p_org,'read') AND public.uc_document_student_scope_allowed(p_org,p_subject)
   AND(public.uc_document_student_in_org(p_org,p_subject)
    OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_agreements WHERE organization_id=p_org AND subject_user_id=p_subject)
    OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_consents WHERE organization_id=p_org AND subject_user_id=p_subject)
    OR EXISTS(SELECT 1 FROM public.student_consents WHERE organization_id=p_org AND user_id=p_subject))),false)
$fn$;
CREATE FUNCTION public.uc_signature_assurance_signature_read(p_org uuid,p_signature uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND public.uc_signature_assurance_active() AND EXISTS(
  SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature AND s.organization_id=p_org AND public.uc_signature_actor_allowed(s.id,false,true)),false)
$fn$;
CREATE FUNCTION public.uc_signature_assurance_signature_write(p_org uuid,p_signature uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND public.uc_signature_assurance_active() AND EXISTS(
  SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature AND s.organization_id=p_org AND public.uc_signature_action_allowed(s.id,'write')),false)
$fn$;
-- Shared ordinary person locks use the exact existing42007 namespace; trusted erasure
-- continues to take its exclusive lock. No shared-to-exclusive person-lock upgrade is used.
CREATE FUNCTION public.uc_signature_assurance_fence(p_org uuid,p_people uuid[],p_write boolean DEFAULT false,p_stream uuid DEFAULT NULL,p_request uuid DEFAULT NULL,p_actor uuid DEFAULT auth.uid()) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE person uuid;
BEGIN
 IF NOT coalesce(public.uc_signature_assurance_active(p_actor) OR p_actor IS NULL AND auth.role()='service_role' AND auth.uid() IS NULL,false) OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org) THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF cardinality(coalesce(p_people,'{}'))>20000 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 FOR person IN SELECT DISTINCT x FROM unnest(array_append(coalesce(p_people,'{}'),p_actor))x WHERE x IS NOT NULL ORDER BY x LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(person::text,42007)) THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
  IF NOT public.uc_custom_journal_person(person) THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 END LOOP;
 IF p_write THEN
  IF NOT pg_try_advisory_xact_lock(hashtextextended(p_org::text,0)) OR NOT pg_try_advisory_xact_lock(hashtextextended('uc_signature_assurance:'||p_org::text,0)) THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 ELSIF NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc_signature_assurance:'||p_org::text,0)) THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF p_stream IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_signature_assurance_stream:'||p_stream::text,0)) THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF p_request IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_signature_assurance_request:'||p_org::text||':'||p_request::text,0)) THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 LOCK TABLE public.organizations,public.org_staff,public.org_staff_document_groups,public.user_roles,public.admin_staff IN ROW SHARE MODE NOWAIT;
 PERFORM 1 FROM public.organizations WHERE id=p_org FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_staff WHERE organization_id=p_org AND user_id=p_actor ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_staff_document_groups g JOIN public.org_staff s ON s.id=g.staff_id WHERE g.organization_id=p_org AND s.user_id=p_actor ORDER BY g.staff_id,g.group_id FOR SHARE OF g NOWAIT;
 PERFORM 1 FROM public.user_roles WHERE user_id=p_actor FOR SHARE NOWAIT;
 PERFORM 1 FROM public.admin_staff WHERE user_id=p_actor FOR SHARE NOWAIT;
 IF NOT coalesce(public.uc_signature_assurance_active(p_actor) OR p_actor IS NULL AND auth.role()='service_role' AND auth.uid() IS NULL,false) THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_token(p_kind text,p_id uuid,p_operation text DEFAULT 'append') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF p_id IS NULL OR p_kind IS NULL OR p_operation IS NULL OR p_kind NOT IN('stream','policy','decision','binding','document','agreement','consent','event','private_manifest','scoped_manifest','request','participant') OR p_operation NOT IN('append','privacy_attribution','privacy_subject') THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 INSERT INTO public.uc_signature_assurance_write_tokens(transaction_id,object_kind,object_id,operation)VALUES(txid_current(),p_kind,p_id,p_operation)ON CONFLICT DO NOTHING;
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE row_id uuid;allowed boolean;
BEGIN
 row_id:=CASE WHEN TG_ARGV[0]='request' THEN(coalesce(to_jsonb(NEW),to_jsonb(OLD))->>'request_id')::uuid WHEN TG_ARGV[0]='participant' THEN(coalesce(to_jsonb(NEW),to_jsonb(OLD))->>'object_id')::uuid ELSE(coalesce(to_jsonb(NEW),to_jsonb(OLD))->>'id')::uuid END;
 IF TG_OP='INSERT' THEN
  allowed:=EXISTS(SELECT 1 FROM public.uc_signature_assurance_write_tokens WHERE transaction_id=txid_current() AND object_kind=TG_ARGV[0] AND object_id=row_id AND operation='append');
 ELSIF TG_OP='UPDATE' AND TG_ARGV[0]='stream' AND(to_jsonb(NEW)-'revision')=(to_jsonb(OLD)-'revision')AND(to_jsonb(NEW)->>'revision')::integer=(to_jsonb(OLD)->>'revision')::integer+1 THEN
  allowed:=EXISTS(SELECT 1 FROM public.uc_signature_assurance_write_tokens WHERE transaction_id=txid_current() AND object_kind='stream' AND object_id=row_id AND operation='append');
 ELSE
  -- Only the private trusted erasure composition may mint these transaction tokens.
  -- No authenticated/service direct table or helper privilege is granted.
  allowed:=EXISTS(SELECT 1 FROM public.uc_signature_assurance_write_tokens WHERE transaction_id=txid_current() AND object_kind=TG_ARGV[0] AND object_id=row_id AND operation IN('privacy_attribution','privacy_subject'));
 END IF;
 IF NOT coalesce(allowed,false) THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END;$fn$;
DO $immutable$
DECLARE item record;
BEGIN
 FOR item IN SELECT*FROM(VALUES
 ('uc_signature_assurance_streams','stream'),('uc_signature_assurance_policy_versions','policy'),('uc_signature_assurance_policy_decisions','decision'),('uc_signature_assurance_document_snapshots','document'),('uc_signature_assurance_bindings','binding'),('uc_signature_assurance_agreements','agreement'),('uc_signature_assurance_consents','consent'),('uc_signature_assurance_events','event'),('uc_signature_assurance_private_manifests','private_manifest'),('uc_signature_assurance_scoped_manifests','scoped_manifest'),('uc_signature_assurance_requests','request'),('uc_signature_assurance_participants','participant'))v(table_name,kind) LOOP
  EXECUTE format('CREATE TRIGGER uc_signature_assurance_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_signature_assurance_immutable(%L)',item.table_name,item.kind);
 END LOOP;
END;$immutable$;

-- New owner-only policy/event helpers. Public/legacy622 boundaries remain unmodified.
CREATE FUNCTION public.uc_signature_assurance_utc(p_time timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$
 SELECT to_char(p_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$fn$;
CREATE FUNCTION public.uc_signature_assurance_empty_authority() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_build_object('kind','unknown','declaration',NULL,'document_reference',NULL,'verification','not_verified')
$fn$;
CREATE FUNCTION public.uc_signature_assurance_policy_eligible(p_org uuid,p_policy uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(EXISTS(
  SELECT 1 FROM public.uc_signature_assurance_policy_versions v
  CROSS JOIN LATERAL(SELECT d.state FROM public.uc_signature_assurance_policy_decisions d WHERE d.organization_id=p_org AND d.policy_version_id=v.id ORDER BY d.stream_revision DESC LIMIT 1)latest
  WHERE v.id=p_policy AND v.organization_id=p_org AND latest.state='centre_accepted'
   AND v.id=(SELECT candidate.id FROM public.uc_signature_assurance_policy_versions candidate
    WHERE candidate.organization_id=p_org AND candidate.family_id=v.family_id
     AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_policy_decisions accepted WHERE accepted.organization_id=p_org AND accepted.policy_version_id=candidate.id AND accepted.state='centre_accepted')
    ORDER BY candidate.version DESC LIMIT 1)),false)
$fn$;
CREATE FUNCTION public.uc_signature_assurance_policy_read(p_org uuid,p_policy uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND public.uc_signature_assurance_active() AND EXISTS(
  SELECT 1 FROM public.uc_signature_assurance_policy_versions v WHERE v.id=p_policy AND v.organization_id=p_org AND(
   public.uc_document_action_allowed(p_org,'read',NULL,NULL)
   OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings b WHERE b.organization_id=p_org AND b.policy_version_id=v.id AND public.uc_signature_assurance_signature_read(p_org,b.signature_id))
   OR public.uc_signature_assurance_own_current(p_org,auth.uid()) AND public.uc_signature_assurance_policy_eligible(p_org,v.id)
    AND v.body->>'method'='authenticated_account_confirmation' AND(v.body->'agreement'<>'null'::jsonb OR v.body->'consent'<>'null'::jsonb)
  )),false)
$fn$;
CREATE FUNCTION public.uc_signature_assurance_project_authority(p_org uuid,p_authority jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE reference jsonb;selection jsonb;
BEGIN
 IF p_authority->'document_reference' IS NULL OR p_authority->'document_reference'='null'::jsonb THEN RETURN p_authority;END IF;
 reference:=p_authority->'document_reference';
 IF reference->>'visibility'IS DISTINCT FROM'available' OR NOT public.uc_signature_assurance_sha(reference->'captured_reference_sha256')
  OR jsonb_typeof(reference->'captured_reference_json')IS DISTINCT FROM'string'
  OR public.uc_signature_assurance_hash(reference->>'captured_reference_json')IS DISTINCT FROM reference->>'captured_reference_sha256'
  OR (reference->>'captured_reference_json')::jsonb IS DISTINCT FROM reference->'value' THEN PERFORM public.uc_signature_assurance_error('DEPENDENCY_UNAVAILABLE');END IF;
 selection:=(reference->'value')-'byte_proof';
 IF public.uc_signature_assurance_resolve_selection(p_org,selection,false)IS NULL THEN
  RETURN jsonb_set(p_authority,'{document_reference}',jsonb_build_object('visibility','redacted','captured_reference_sha256',reference->>'captured_reference_sha256','value',NULL,'reason','current_file_scope'));
 END IF;
 RETURN p_authority;
 EXCEPTION WHEN invalid_text_representation THEN PERFORM public.uc_signature_assurance_error('DEPENDENCY_UNAVAILABLE');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_project_policy(p_org uuid,p_policy uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE version_row public.uc_signature_assurance_policy_versions;decision_row public.uc_signature_assurance_policy_decisions;
 projected jsonb;projected_refs jsonb:='[]';item jsonb;decision jsonb;summary jsonb;literal text;masked integer:=0;
BEGIN
 IF NOT public.uc_signature_assurance_policy_read(p_org,p_policy) THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT*INTO version_row FROM public.uc_signature_assurance_policy_versions WHERE id=p_policy AND organization_id=p_org;
 SELECT*INTO decision_row FROM public.uc_signature_assurance_policy_decisions WHERE organization_id=p_org AND policy_version_id=p_policy ORDER BY stream_revision DESC LIMIT 1;
 IF version_row.id IS NULL OR decision_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('DEPENDENCY_UNAVAILABLE');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(version_row.body->'basis'->'document_references')LOOP
  item:=public.uc_signature_assurance_disclose_selection(p_org,item);projected_refs:=projected_refs||jsonb_build_array(item);
  IF item->>'visibility'='redacted' THEN masked:=masked+1;END IF;
 END LOOP;
 decision:=public.uc_signature_assurance_project_authority(p_org,decision_row.authority);
 IF decision->'document_reference'->>'visibility'='redacted' THEN masked:=masked+1;END IF;
 projected:=jsonb_set(version_row.body,'{basis,document_references}',projected_refs);
 summary:=jsonb_build_object('kind',CASE WHEN masked=0 THEN'complete'ELSE'current_scope_projection'END,'redacted_reference_count',masked,'redacted_content_count',0,
  -- A policy hash is not actual file-byte verification or a legal-validity conclusion.
  'complete_private_evidence_verified',false);
 literal:=jsonb_build_object('body',projected,'body_sha256',version_row.body_sha256,'disclosure',summary)::text;
 RETURN jsonb_build_object('id',version_row.id,'family_id',version_row.family_id,'organization_id',p_org,'version',version_row.version,
  'body',projected,'body_sha256',version_row.body_sha256,'body_json',CASE WHEN masked=0 THEN version_row.body_json ELSE NULL END,
  'projection_json',literal,'projection_sha256',public.uc_signature_assurance_hash(literal),'disclosure',summary,
  'created_at',public.uc_signature_assurance_utc(version_row.created_at),'created_by',version_row.created_by,
  'decision',jsonb_build_object('id',decision_row.id,'revision',decision_row.stream_revision,'state',decision_row.state,
   'server_at',public.uc_signature_assurance_utc(decision_row.server_at),'actor_user_id',decision_row.actor_user_id,'reason',decision_row.reason,
   'authority',decision,'source_limits_acknowledged',decision_row.source_limits_acknowledged));
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_request(p_org uuid,p_request uuid,p_digest text,p_actor uuid DEFAULT auth.uid()) RETURNS public.uc_signature_assurance_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE stored public.uc_signature_assurance_requests;
BEGIN
 IF p_org IS NULL OR p_request IS NULL OR NOT public.uc_signature_assurance_sha(to_jsonb(p_digest))THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 SELECT*INTO stored FROM public.uc_signature_assurance_requests WHERE organization_id=p_org AND request_id=p_request FOR SHARE NOWAIT;
 IF stored.request_id IS NOT NULL AND(stored.payload_sha256 IS DISTINCT FROM p_digest OR stored.actor_user_id IS DISTINCT FROM p_actor)THEN PERFORM public.uc_signature_assurance_error('REQUEST_CONFLICT');END IF;
 RETURN stored;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_receipt(p_request public.uc_signature_assurance_requests,p_replayed boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('request_id',p_request.request_id,'payload_sha256',p_request.payload_sha256,'outcome',CASE WHEN p_replayed THEN'replayed'ELSE'applied'END,
  'action',p_request.action,'event_id',p_request.event_id,'party_role',p_request.party_role,'binding_id',p_request.binding_id,'entity_id',p_request.entity_id,'revision_applied',p_request.revision_applied,'server_at',public.uc_signature_assurance_utc(p_request.server_at))
$fn$;
CREATE FUNCTION public.uc_signature_assurance_record_request(p_org uuid,p_request uuid,p_digest text,p_action text,p_stream uuid,p_event uuid,p_entity uuid,p_revision integer,p_actor uuid DEFAULT auth.uid(),p_party_role text DEFAULT NULL,p_binding uuid DEFAULT NULL) RETURNS public.uc_signature_assurance_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE stored public.uc_signature_assurance_requests;head public.uc_signature_assurance_streams;event_row public.uc_signature_assurance_events;personal boolean;
BEGIN
 SELECT*INTO head FROM public.uc_signature_assurance_streams WHERE id=p_stream AND organization_id=p_org;
 IF head.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF head.kind='signature' THEN
  IF p_party_role IS NULL OR p_party_role NOT IN('sender','recipient')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ELSE
  IF p_party_role IS NOT NULL OR p_binding IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 END IF;
 IF p_action='capture_receipt' THEN
  IF head.kind<>'signature' OR p_event IS NOT NULL OR p_binding IS NOT NULL OR head.revision IS DISTINCT FROM p_revision THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ELSE
  SELECT*INTO event_row FROM public.uc_signature_assurance_events WHERE id=p_event AND organization_id=p_org AND stream_id=head.id;
  IF event_row.id IS NULL OR event_row.revision IS DISTINCT FROM p_revision OR event_row.request_id IS DISTINCT FROM p_request OR event_row.party_role IS DISTINCT FROM p_party_role OR event_row.binding_id IS DISTINCT FROM p_binding THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 END IF;
 PERFORM public.uc_signature_assurance_token('request',p_request);
 INSERT INTO public.uc_signature_assurance_requests(organization_id,request_id,actor_user_id,payload_sha256,action,stream_id,event_id,party_role,binding_id,entity_id,revision_applied)
 VALUES(p_org,p_request,p_actor,p_digest,p_action,p_stream,p_event,p_party_role,p_binding,p_entity,p_revision)RETURNING*INTO stored;
 personal:=p_action IN('accept_agreement','confirm_consent','withdraw_consent','confirm_sender','confirm');
 PERFORM public.uc_signature_assurance_track(p_org,'request',p_request,head.subject_user_id,'subject');
 PERFORM public.uc_signature_assurance_track(p_org,'request',p_request,p_actor,CASE WHEN personal THEN'actual_personal_signer'ELSE'staff_attribution'END);
 RETURN stored;
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_append(p_org uuid,p_stream uuid,p_expected integer,p_request uuid,p_kind text,p_method text,p_reason text,p_authority jsonb,
 p_policy uuid DEFAULT NULL,p_signature uuid DEFAULT NULL,p_document uuid DEFAULT NULL,p_agreement uuid DEFAULT NULL,p_consent uuid DEFAULT NULL,
 p_conclusion text DEFAULT 'not_confirmed',p_actor uuid DEFAULT auth.uid(),p_declared_name text DEFAULT NULL,p_party_role text DEFAULT NULL,p_binding uuid DEFAULT NULL) RETURNS public.uc_signature_assurance_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE head public.uc_signature_assurance_streams;version_row public.uc_signature_assurance_policy_versions;
 document_row public.uc_signature_assurance_document_snapshots;binding_row public.uc_signature_assurance_bindings;bound_document public.uc_signature_assurance_document_snapshots;agreement_row public.uc_signature_assurance_agreements;consent_row public.uc_signature_assurance_consents;
 event_row public.uc_signature_assurance_events;event_id uuid:=gen_random_uuid();actor_fact jsonb;payload jsonb;at_time timestamptz:=clock_timestamp();recipient uuid;subject uuid;signer boolean;
BEGIN
 IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR p_expected=2147483647 OR NOT public.uc_signature_assurance_text(to_jsonb(p_reason),4000)
 OR NOT coalesce(p_kind IN('policy_created','policy_source_checked','policy_reviewed','policy_accepted','policy_retired','signature_bound','graphic_prepared','bearer_confirmed','account_confirmed','scan_received','sender_confirmed','agreement_accepted','consent_confirmed','consent_withdrawn','invitation_revoked','recipient_rejected'),false)
 OR NOT coalesce(p_method IN('graphic_asset','scan_received','bearer_invitation_confirmation','authenticated_account_confirmation','legacy_unknown'),false)
 OR NOT coalesce(p_conclusion IN('not_confirmed','factual_confirmation','policy_eligible_account_confirmation','scan_received','graphic_prepared','legacy_unknown'),false)
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF NOT coalesce(public.uc_signature_assurance_active(p_actor)OR p_actor IS NULL AND auth.role()='service_role' AND auth.uid()IS NULL,false)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT*INTO head FROM public.uc_signature_assurance_streams WHERE id=p_stream AND organization_id=p_org FOR UPDATE NOWAIT;
 IF head.id IS NULL OR head.revision<>p_expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF(head.kind='signature')IS DISTINCT FROM(p_signature IS NOT NULL)OR p_signature IS NOT NULL AND p_signature<>head.entity_id THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF head.kind IS DISTINCT FROM(CASE WHEN p_kind LIKE'policy_%'THEN'policy'WHEN p_kind='agreement_accepted'THEN'agreement'WHEN p_kind LIKE'consent_%'THEN'consent'ELSE'signature'END)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF head.kind='signature' THEN
  IF p_party_role IS NULL OR p_party_role NOT IN('sender','recipient')OR(p_binding IS NULL)IS DISTINCT FROM(p_policy IS NULL)
   OR p_kind='sender_confirmed'AND p_party_role<>'sender'
   OR p_kind IN('account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked')AND p_party_role<>'recipient'
   OR p_kind IN('signature_bound','account_confirmed','sender_confirmed')AND(p_binding IS NULL OR p_document IS NULL)
  THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ELSE
  IF p_party_role IS NOT NULL OR p_binding IS NOT NULL OR p_document IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 END IF;
 IF p_kind IN('account_confirmed','sender_confirmed')AND(p_method<>'authenticated_account_confirmation'OR p_actor IS NULL)
  OR p_kind='bearer_confirmed'AND p_method<>'bearer_invitation_confirmation'
  OR p_kind='scan_received'AND p_method<>'scan_received'
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF p_policy IS NOT NULL THEN
  SELECT*INTO version_row FROM public.uc_signature_assurance_policy_versions WHERE id=p_policy AND organization_id=p_org;
  IF version_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 END IF;
 IF p_document IS NOT NULL THEN
  SELECT*INTO document_row FROM public.uc_signature_assurance_document_snapshots WHERE id=p_document AND organization_id=p_org AND signature_id=p_signature;
  IF document_row.id IS NULL OR document_row.party_role IS DISTINCT FROM p_party_role THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  subject:=document_row.subject_user_id;recipient:=document_row.recipient_user_id;
 END IF;
 IF p_binding IS NOT NULL THEN
  SELECT*INTO binding_row FROM public.uc_signature_assurance_bindings WHERE id=p_binding AND organization_id=p_org AND signature_id=p_signature AND party_role=p_party_role;
  SELECT*INTO bound_document FROM public.uc_signature_assurance_document_snapshots WHERE id=binding_row.document_snapshot_id AND organization_id=p_org;
  IF binding_row.id IS NULL OR bound_document.id IS NULL OR binding_row.policy_version_id IS DISTINCT FROM p_policy OR binding_row.policy_sha256 IS DISTINCT FROM version_row.body_sha256
   OR binding_row.classification IS DISTINCT FROM version_row.body->'classification' OR binding_row.agreement_sha256 IS DISTINCT FROM(version_row.body->'agreement'->>'sha256')
   OR document_row.id IS NULL OR document_row.document_revision_id IS DISTINCT FROM bound_document.document_revision_id OR document_row.html_sha256 IS DISTINCT FROM bound_document.html_sha256 OR document_row.original_file IS DISTINCT FROM bound_document.original_file
   OR p_kind='signature_bound'AND(binding_row.revision<>head.revision+1 OR p_document IS DISTINCT FROM binding_row.document_snapshot_id)
   OR p_kind<>'signature_bound'AND(binding_row.revision>head.revision OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings newer WHERE newer.organization_id=p_org AND newer.signature_id=p_signature AND newer.party_role=p_party_role AND newer.revision>binding_row.revision))
  THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 END IF;
 IF p_agreement IS NOT NULL THEN
  SELECT*INTO agreement_row FROM public.uc_signature_assurance_agreements WHERE id=p_agreement AND organization_id=p_org;
  IF agreement_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_REQUIRED');END IF;
  IF agreement_row.subject_user_id IS DISTINCT FROM p_actor OR agreement_row.policy_version_id IS DISTINCT FROM p_policy OR agreement_row.policy_sha256 IS DISTINCT FROM version_row.body_sha256 OR agreement_row.terms->>'sha256'IS DISTINCT FROM version_row.body->'agreement'->>'sha256'THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
 END IF;
 IF p_kind IN('account_confirmed','sender_confirmed')AND version_row.body->>'purpose'='account_pep'AND p_agreement IS NULL THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_REQUIRED');END IF;
 IF p_conclusion='policy_eligible_account_confirmation'AND(p_kind NOT IN('account_confirmed','sender_confirmed')OR p_policy IS NULL OR p_binding IS NULL OR p_agreement IS NULL OR p_method<>'authenticated_account_confirmation'OR version_row.body->>'purpose'IS DISTINCT FROM'account_pep')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF p_consent IS NOT NULL THEN
  SELECT*INTO consent_row FROM public.uc_signature_assurance_consents WHERE id=p_consent AND organization_id=p_org;
  IF consent_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 END IF;
 subject:=coalesce(head.subject_user_id,subject);actor_fact:=public.uc_signature_assurance_actor(p_actor,p_declared_name);
 payload:=jsonb_build_object('id',event_id,'organization_id',p_org,'stream_kind',head.kind,'stream_id',head.id,'revision',head.revision+1,
 'kind',p_kind,'server_at',public.uc_signature_assurance_utc(at_time),'actor',actor_fact,'authority',p_authority,'method',p_method,
  'policy_version_id',p_policy,'policy_sha256',version_row.body_sha256,'signature_id',p_signature,'party_role',p_party_role,'binding_id',p_binding,'document_snapshot_id',p_document,
 'document_revision_id',document_row.document_revision_id,'document_html_sha256',document_row.html_sha256,'original_file',document_row.original_file,'scan_file',NULL,
 'agreement_event_id',p_agreement,'agreement_sha256',agreement_row.terms->>'sha256','consent_snapshot_id',p_consent,
 'conclusion',p_conclusion,'explanation',p_reason,'request_id',p_request,'cryptographic_verification','not_performed','time_assurance','platform_server_time');
 PERFORM public.uc_signature_assurance_token('event',event_id);
 INSERT INTO public.uc_signature_assurance_events(id,organization_id,stream_id,stream_kind,revision,kind,payload,request_id,subject_user_id,recipient_user_id,actor_user_id,
 signature_id,party_role,binding_id,document_snapshot_id,policy_version_id,agreement_event_id,consent_snapshot_id,server_at)
 VALUES(event_id,p_org,head.id,head.kind,head.revision+1,p_kind,payload,p_request,subject,recipient,p_actor,p_signature,p_party_role,p_binding,p_document,p_policy,p_agreement,p_consent,at_time)RETURNING*INTO event_row;
 PERFORM public.uc_signature_assurance_token('stream',head.id);
 UPDATE public.uc_signature_assurance_streams SET revision=head.revision+1 WHERE id=head.id AND revision=head.revision;
 IF NOT FOUND THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 signer:=p_kind IN('account_confirmed','sender_confirmed','agreement_accepted','consent_confirmed','consent_withdrawn');
 PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,subject,'subject');
 PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,recipient,'recipient');
 PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,p_actor,CASE WHEN signer THEN'actual_personal_signer'ELSE'staff_attribution'END);
 RETURN event_row;
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_save_policy(p_org uuid,p_request uuid,p_expected integer,p_action jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE head public.uc_signature_assurance_streams;previous public.uc_signature_assurance_policy_versions;version_row public.uc_signature_assurance_policy_versions;
 event_row public.uc_signature_assurance_events;request_row public.uc_signature_assurance_requests;family uuid;new_id uuid:=gen_random_uuid();decision_id uuid:=gen_random_uuid();item jsonb;digest text;literal text;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated' OR NOT public.uc_signature_assurance_active()OR NOT public.uc_document_action_allowed(p_org,'read',NULL,NULL)OR NOT public.uc_document_action_allowed(p_org,'write',NULL,NULL)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR NOT public.uc_signature_assurance_shape(p_action,ARRAY['action','family_id','previous_version_id','body'])
 OR p_action->>'action'IS DISTINCT FROM'save_policy_draft'
 OR(p_action->'family_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_action->'family_id'))
 OR(p_action->'previous_version_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_action->'previous_version_id'))
 OR(p_action->'family_id'='null'::jsonb)IS DISTINCT FROM(p_action->'previous_version_id'='null'::jsonb)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 PERFORM public.uc_signature_assurance_policy_body(p_org,p_action->'body');
 family:=CASE WHEN p_action->'family_id'='null'::jsonb THEN NULL ELSE(p_action->>'family_id')::uuid END;
 digest:=public.uc_signature_assurance_hash(jsonb_build_object('organization_id',p_org,'expected_revision',p_expected,'action',p_action)::text);
 PERFORM public.uc_signature_assurance_fence(p_org,'{}',true,family,p_request);
 IF NOT public.uc_document_action_allowed(p_org,'read',NULL,NULL)OR NOT public.uc_document_action_allowed(p_org,'write',NULL,NULL)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 request_row:=public.uc_signature_assurance_request(p_org,p_request,digest);
 IF request_row.request_id IS NOT NULL THEN RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(request_row,true),'result',jsonb_build_object('kind','policy','policy',public.uc_signature_assurance_project_policy(p_org,request_row.entity_id)));END IF;
 IF family IS NULL THEN family:=gen_random_uuid();ELSE
  SELECT*INTO previous FROM public.uc_signature_assurance_policy_versions WHERE id=(p_action->>'previous_version_id')::uuid AND organization_id=p_org AND family_id=family;
  IF previous.id IS NULL OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_policy_versions newer WHERE newer.organization_id=p_org AND newer.family_id=family AND newer.version>previous.version)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 END IF;
 head:=public.uc_signature_assurance_stream(p_org,'policy',family);
 IF head.revision<>p_expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_action->'body'->'basis'->'document_references')LOOP PERFORM public.uc_signature_assurance_resolve_selection(p_org,item,true);END LOOP;
 literal:=(p_action->'body')::text;PERFORM public.uc_signature_assurance_token('policy',new_id);
 INSERT INTO public.uc_signature_assurance_policy_versions(id,organization_id,family_id,version,body,body_json,body_sha256,created_by)
 VALUES(new_id,p_org,family,coalesce(previous.version,0)+1,p_action->'body',literal,public.uc_signature_assurance_hash(literal),auth.uid())RETURNING*INTO version_row;
 PERFORM public.uc_signature_assurance_token('decision',decision_id);
 INSERT INTO public.uc_signature_assurance_policy_decisions(id,organization_id,policy_version_id,stream_revision,state,actor_user_id,authority,reason,source_limits_acknowledged)
 VALUES(decision_id,p_org,new_id,head.revision+1,'draft',auth.uid(),public.uc_signature_assurance_empty_authority(),'Создана новая редакция правил; проверка и принятие ещё не выполнены.',false);
 event_row:=public.uc_signature_assurance_append(p_org,head.id,p_expected,p_request,'policy_created',version_row.body->>'method','Создана новая редакция правил; проверка и принятие ещё не выполнены.',public.uc_signature_assurance_empty_authority(),new_id);
 PERFORM public.uc_signature_assurance_track(p_org,'policy',new_id,auth.uid(),'staff_attribution');
 PERFORM public.uc_signature_assurance_track(p_org,'decision',decision_id,auth.uid(),'staff_attribution');
 request_row:=public.uc_signature_assurance_record_request(p_org,p_request,digest,'save_policy_draft',head.id,event_row.id,new_id,event_row.revision);
 RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(request_row),'result',jsonb_build_object('kind','policy','policy',public.uc_signature_assurance_project_policy(p_org,new_id)));
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_decide_policy(p_org uuid,p_request uuid,p_expected integer,p_action jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE version_row public.uc_signature_assurance_policy_versions;latest public.uc_signature_assurance_policy_decisions;head public.uc_signature_assurance_streams;
 event_row public.uc_signature_assurance_events;request_row public.uc_signature_assurance_requests;decision_id uuid:=gen_random_uuid();next_state text;required_action text;digest text;authority jsonb;item jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated' OR NOT public.uc_signature_assurance_active()THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR NOT public.uc_signature_assurance_shape(p_action,ARRAY['action','policy_version_id','decision','reason','authority','source_limits_acknowledged'])
 OR p_action->>'action'IS DISTINCT FROM'record_policy_decision'OR NOT public.uc_signature_assurance_uuid(p_action->'policy_version_id')
 OR NOT coalesce(p_action->>'decision'IN('source_checked','reviewed','centre_accepted','retired'),false)
 OR NOT public.uc_signature_assurance_text(p_action->'reason',4000)OR jsonb_typeof(p_action->'source_limits_acknowledged')IS DISTINCT FROM'boolean'
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 next_state:=p_action->>'decision';required_action:=CASE WHEN next_state='source_checked' THEN'write'ELSE'sign'END;
 IF NOT public.uc_document_action_allowed(p_org,'read',NULL,NULL)OR NOT public.uc_document_action_allowed(p_org,required_action,NULL,NULL)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT*INTO version_row FROM public.uc_signature_assurance_policy_versions WHERE id=(p_action->>'policy_version_id')::uuid AND organization_id=p_org;
 IF version_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 digest:=public.uc_signature_assurance_hash(jsonb_build_object('organization_id',p_org,'expected_revision',p_expected,'action',p_action)::text);
 PERFORM public.uc_signature_assurance_fence(p_org,'{}',true,version_row.family_id,p_request);
 IF NOT public.uc_document_action_allowed(p_org,'read',NULL,NULL)OR NOT public.uc_document_action_allowed(p_org,required_action,NULL,NULL)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 request_row:=public.uc_signature_assurance_request(p_org,p_request,digest);
 IF request_row.request_id IS NOT NULL THEN RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(request_row,true),'result',jsonb_build_object('kind','policy','policy',public.uc_signature_assurance_project_policy(p_org,request_row.entity_id)));END IF;
 head:=public.uc_signature_assurance_stream(p_org,'policy',version_row.family_id);
 IF head.revision<>p_expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 SELECT*INTO latest FROM public.uc_signature_assurance_policy_decisions WHERE organization_id=p_org AND policy_version_id=version_row.id ORDER BY stream_revision DESC LIMIT 1;
 IF latest.id IS NULL OR NOT coalesce((latest.state='draft'AND next_state='source_checked')OR(latest.state='source_checked'AND next_state='reviewed')OR(latest.state='reviewed'AND next_state='centre_accepted')OR(latest.state='centre_accepted'AND next_state='retired'),false)THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 -- An obsolete lower version cannot supersede a newer accepted family member.
 IF next_state='centre_accepted'AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_policy_versions higher WHERE higher.organization_id=p_org AND higher.family_id=version_row.family_id AND higher.version>version_row.version
  AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_policy_decisions d WHERE d.organization_id=p_org AND d.policy_version_id=higher.id AND d.state='centre_accepted'))THEN PERFORM public.uc_signature_assurance_error('POLICY_CHANGED');END IF;
 IF NOT(p_action->>'source_limits_acknowledged')::boolean THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 authority:=public.uc_signature_assurance_authority(p_org,p_action->'authority');
 IF next_state IN('reviewed','centre_accepted','retired')AND authority->>'kind'='unknown' THEN PERFORM public.uc_signature_assurance_error('AUTHORITY_REQUIRED');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(version_row.body->'basis'->'document_references')LOOP PERFORM public.uc_signature_assurance_resolve_selection(p_org,item,true);END LOOP;
 PERFORM public.uc_signature_assurance_token('decision',decision_id);
 INSERT INTO public.uc_signature_assurance_policy_decisions(id,organization_id,policy_version_id,stream_revision,state,actor_user_id,authority,reason,source_limits_acknowledged)
 VALUES(decision_id,p_org,version_row.id,head.revision+1,next_state,auth.uid(),authority,p_action->>'reason',true);
 event_row:=public.uc_signature_assurance_append(p_org,head.id,p_expected,p_request,CASE next_state WHEN'source_checked'THEN'policy_source_checked'WHEN'reviewed'THEN'policy_reviewed'WHEN'centre_accepted'THEN'policy_accepted'ELSE'policy_retired'END,
  version_row.body->>'method',p_action->>'reason',authority,version_row.id);
 PERFORM public.uc_signature_assurance_track(p_org,'decision',decision_id,auth.uid(),'staff_attribution');
 request_row:=public.uc_signature_assurance_record_request(p_org,p_request,digest,'record_policy_decision',head.id,event_row.id,version_row.id,event_row.revision);
 RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(request_row),'result',jsonb_build_object('kind','policy','policy',public.uc_signature_assurance_project_policy(p_org,version_row.id)));
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_project_agreement(p_org uuid,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE stored public.uc_signature_assurance_agreements;
BEGIN
 SELECT*INTO stored FROM public.uc_signature_assurance_agreements WHERE id=p_id AND organization_id=p_org;
 IF stored.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 IF NOT public.uc_signature_assurance_subject_read(p_org,stored.subject_user_id)
  AND NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_events e WHERE e.organization_id=p_org AND e.agreement_event_id=stored.id AND e.signature_id IS NOT NULL AND public.uc_signature_assurance_signature_read(p_org,e.signature_id))
 THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 RETURN jsonb_build_object('kind','account_acceptance','id',stored.id,'legacy_agreement_id',NULL,'organization_id',p_org,'subject_user_id',stored.subject_user_id,
  'terms',stored.terms,'rendered_text',stored.rendered_text,'rendered_text_sha256',stored.rendered_text_sha256,'actor',stored.actor,
  'policy_version_id',stored.policy_version_id,'policy_sha256',stored.policy_sha256,'accepted_at',public.uc_signature_assurance_utc(stored.accepted_at),
  'timestamp_assurance','platform_server_time','identity_assurance','observed_account_control','assurance','account_acceptance');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_project_consent(p_org uuid,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE stored public.uc_signature_assurance_consents;
BEGIN
 SELECT*INTO stored FROM public.uc_signature_assurance_consents WHERE id=p_id AND organization_id=p_org;
 IF stored.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 IF NOT public.uc_signature_assurance_subject_read(p_org,stored.subject_user_id)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 RETURN jsonb_build_object('id',stored.id,'legacy_consent_id',NULL,'organization_id',p_org,'subject_user_id',stored.subject_user_id,
 'revision',stored.revision,'state',stored.state,'consent_terms',stored.terms,'rendered_text',stored.rendered_text,'rendered_text_sha256',stored.rendered_text_sha256,
 'organization_name',stored.organization_name,'organization_inn',stored.organization_inn,'actor',stored.actor,'policy_version_id',stored.policy_version_id,'policy_sha256',stored.policy_sha256,
 'agreement_event_id',stored.agreement_event_id,'confirmed_at',public.uc_signature_assurance_utc(stored.confirmed_at),'withdrawn_at',public.uc_signature_assurance_utc(stored.withdrawn_at),
 'legacy_recorded_at',NULL,'limitations',jsonb_build_array('Зафиксированы сведения и действие учётной записи. Юридическая действительность согласия автоматически не установлена.'));
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_project_legacy_agreement(p_org uuid,p_id uuid,p_subject uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE stored public.pep_agreements;known_text text;known_version text;known_name text;
BEGIN
 SELECT*INTO stored FROM public.pep_agreements WHERE id=p_id AND user_id=p_subject AND(organization_id=p_org OR organization_id IS NULL AND auth.uid()=p_subject);
 IF stored.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 IF stored.organization_id IS NULL THEN
  IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS DISTINCT FROM p_subject OR NOT public.uc_signature_assurance_active()THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSIF NOT public.uc_signature_assurance_subject_read(p_org,p_subject)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 known_text:=nullif(stored.agreement_text,'');known_version:=nullif(stored.agreement_version,'');known_name:=nullif(btrim(stored.full_name),'');
 IF known_text IS NOT NULL AND(octet_length(known_text)>65536 OR NOT public.uc_signature_assurance_text(to_jsonb(known_text),65536))
  OR known_version IS NOT NULL AND NOT public.uc_signature_assurance_text(to_jsonb(known_version),120)
  OR known_name IS NOT NULL AND NOT public.uc_signature_assurance_text(to_jsonb(known_name),300)
  OR stored.email IS NOT NULL AND NOT public.uc_signature_assurance_text(to_jsonb(stored.email),320,true)
 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 RETURN jsonb_build_object('kind','legacy_unknown','id',stored.id,'legacy_agreement_id',stored.id,'organization_id',stored.organization_id,
  'subject_user_id',p_subject,'organization_assurance',CASE WHEN stored.organization_id IS NULL THEN'association_unknown'ELSE'stored_exact'END,
  'stored_terms',jsonb_build_object('version',known_version,'text',known_text,'text_sha256',public.uc_signature_assurance_hash(known_text),
   'hash_assurance',CASE WHEN known_text IS NULL THEN'not_available'ELSE'computed_from_known_stored_text'END),
  -- No separate rendered acceptance text was stored in this legacy relation.
  'stored_rendered_text',NULL,'stored_rendered_text_sha256',NULL,
  'actor',jsonb_build_object('user_id',stored.user_id,'observed_mode','legacy_unknown','observed_email',stored.email,'email_control_confirmed',false,'declared_full_name',known_name,'name_assurance','legacy_unknown'),
  'policy_version_id',NULL,'policy_sha256',NULL,'accepted_at',NULL,'stored_timestamp',stored.accepted_at::text,
  'timestamp_assurance','legacy_origin_unknown','identity_assurance','unverified','assurance','legacy_unknown',
  'limitations',jsonb_build_array('Историческая запись содержит только ранее сохранённые сведения. Источник даты и проверка личности не подтверждены.',
   'Хеш рассчитан сейчас по известному сохранённому тексту и не доказывает содержание или подлинность исторического подтверждения.',
   CASE WHEN stored.organization_id IS NULL THEN'Организация в исторической записи не указана; связь с текущей организацией не установлена.'ELSE'Связь с организацией взята только из сохранённой записи.'END));
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_project_legacy_consent(p_org uuid,p_id uuid,p_subject uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE stored public.student_consents;known_name text;
BEGIN
 SELECT*INTO stored FROM public.student_consents WHERE id=p_id AND organization_id=p_org AND user_id=p_subject;
 IF stored.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 IF NOT public.uc_signature_assurance_subject_read(p_org,p_subject)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 known_name:=nullif(btrim(stored.full_name),'');
 IF known_name IS NOT NULL AND NOT public.uc_signature_assurance_text(to_jsonb(known_name),300)
  OR stored.email IS NOT NULL AND NOT public.uc_signature_assurance_text(to_jsonb(stored.email),320,true)THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 RETURN jsonb_build_object('id',stored.id,'legacy_consent_id',stored.id,'organization_id',p_org,'subject_user_id',p_subject,'revision',0,'state','legacy_unknown',
 'consent_terms',NULL,'rendered_text',NULL,'rendered_text_sha256',NULL,'organization_name',NULL,'organization_inn',NULL,
 'actor',jsonb_build_object('user_id',stored.user_id,'observed_mode','legacy_unknown','observed_email',stored.email,'email_control_confirmed',false,'declared_full_name',known_name,'name_assurance','legacy_unknown'),
 'policy_version_id',NULL,'policy_sha256',NULL,'agreement_event_id',NULL,'confirmed_at',NULL,'withdrawn_at',NULL,
 'legacy_recorded_at',public.uc_signature_assurance_utc(stored.created_at),
 'limitations',jsonb_build_array('В исторической записи не сохранён точный канонический текст согласия; действующая редакция сюда не подставлена.',
  'Историческое состояние: '||stored.status||'. Оно не является новой проверкой личности или юридической действительности.',
  CASE WHEN stored.withdrawn_at IS NULL THEN'Историческая дата отзыва не записана.'ELSE'Историческая дата отзыва: '||stored.withdrawn_at::text||'; источник даты не подтверждён.'END));
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_render_terms(p_org uuid,p_policy uuid,p_kind text,p_declared text,p_actor uuid DEFAULT auth.uid()) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE version_row public.uc_signature_assurance_policy_versions;terms jsonb;organization_row public.organizations;rendered text;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR p_actor IS DISTINCT FROM auth.uid()OR NOT public.uc_signature_assurance_own_current(p_org,p_actor)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF NOT coalesce(p_kind IN('pep_agreement','personal_data_consent'),false)OR NOT public.uc_signature_assurance_text(to_jsonb(p_declared),300)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 SELECT*INTO version_row FROM public.uc_signature_assurance_policy_versions WHERE id=p_policy AND organization_id=p_org;
 IF version_row.id IS NULL OR NOT public.uc_signature_assurance_policy_eligible(p_org,p_policy)THEN PERFORM public.uc_signature_assurance_error('POLICY_NOT_ACCEPTED');END IF;
 IF version_row.body->>'method'<>'authenticated_account_confirmation' THEN PERFORM public.uc_signature_assurance_error('METHOD_UNSUPPORTED');END IF;
 terms:=version_row.body->CASE WHEN p_kind='pep_agreement'THEN'agreement'ELSE'consent'END;
 IF terms IS NULL OR terms='null'::jsonb THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_REQUIRED');END IF;
 SELECT*INTO organization_row FROM public.organizations WHERE id=p_org;
 IF organization_row.id IS NULL OR NOT public.uc_signature_assurance_text(to_jsonb(organization_row.name),500)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 -- Canonical terms are literal plain text, not an HTML template or mutable browser policy.
 -- Only this explicit declaration block is appended; arbitrary placeholders are not evaluated.
 rendered:=(terms->>'text')||E'\n\nСведения о подтверждении\nОрганизация: '||organization_row.name||E'\nИмя, указанное участником: '||p_declared||E'\nИдентификатор учётной записи: '||p_actor::text;
 IF octet_length(rendered)>65536 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 RETURN jsonb_build_object('kind','terms','policy_version_id',p_policy,'subject_user_id',p_actor,'terms',terms,'rendered_text',rendered,
 'rendered_text_sha256',public.uc_signature_assurance_hash(rendered),'declared_full_name',p_declared);
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_accept_agreement(p_org uuid,p_request uuid,p_expected integer,p_action jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE head public.uc_signature_assurance_streams;version_row public.uc_signature_assurance_policy_versions;stored public.uc_signature_assurance_agreements;
 event_row public.uc_signature_assurance_events;request_row public.uc_signature_assurance_requests;terms_result jsonb;digest text;new_id uuid:=gen_random_uuid();actor_id uuid:=auth.uid();
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_active()THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR NOT public.uc_signature_assurance_shape(p_action,ARRAY['action','policy_version_id','terms_sha256','rendered_text_sha256','declared_full_name'])
 OR p_action->>'action'IS DISTINCT FROM'accept_agreement'OR NOT public.uc_signature_assurance_uuid(p_action->'policy_version_id')
 OR NOT public.uc_signature_assurance_sha(p_action->'terms_sha256')OR NOT public.uc_signature_assurance_sha(p_action->'rendered_text_sha256')
 OR NOT public.uc_signature_assurance_text(p_action->'declared_full_name',300)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 digest:=public.uc_signature_assurance_hash(jsonb_build_object('organization_id',p_org,'expected_revision',p_expected,'action',p_action)::text);
 PERFORM public.uc_signature_assurance_fence(p_org,ARRAY[actor_id],true,NULL,p_request);
 request_row:=public.uc_signature_assurance_request(p_org,p_request,digest);
 IF request_row.request_id IS NOT NULL THEN
  RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(request_row,true),'result',jsonb_build_object('kind','agreement','agreement',public.uc_signature_assurance_project_agreement(p_org,request_row.entity_id)));
 END IF;
 IF NOT public.uc_signature_assurance_own_current(p_org,actor_id)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 terms_result:=public.uc_signature_assurance_render_terms(p_org,(p_action->>'policy_version_id')::uuid,'pep_agreement',p_action->>'declared_full_name');
 IF terms_result->'terms'->>'sha256'IS DISTINCT FROM p_action->>'terms_sha256'OR terms_result->>'rendered_text_sha256'IS DISTINCT FROM p_action->>'rendered_text_sha256'THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
 SELECT*INTO version_row FROM public.uc_signature_assurance_policy_versions WHERE id=(p_action->>'policy_version_id')::uuid AND organization_id=p_org;
 head:=public.uc_signature_assurance_stream(p_org,'agreement',actor_id,actor_id);
 IF head.revision<>p_expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 PERFORM public.uc_signature_assurance_token('agreement',new_id);
 INSERT INTO public.uc_signature_assurance_agreements(id,organization_id,subject_user_id,stream_id,revision,policy_version_id,policy_sha256,terms,rendered_text,rendered_text_sha256,actor)
 VALUES(new_id,p_org,actor_id,head.id,head.revision+1,version_row.id,version_row.body_sha256,terms_result->'terms',terms_result->>'rendered_text',terms_result->>'rendered_text_sha256',public.uc_signature_assurance_actor(actor_id,p_action->>'declared_full_name'))RETURNING*INTO stored;
 event_row:=public.uc_signature_assurance_append(p_org,head.id,p_expected,p_request,'agreement_accepted','authenticated_account_confirmation','Учётная запись подтвердила точный сохранённый текст соглашения.',
 jsonb_build_object('kind','self','declaration',NULL,'document_reference',NULL,'verification','not_verified'),version_row.id,NULL,NULL,new_id,NULL,'factual_confirmation',actor_id,p_action->>'declared_full_name');
 PERFORM public.uc_signature_assurance_track(p_org,'agreement',new_id,actor_id,'subject');
 PERFORM public.uc_signature_assurance_track(p_org,'stream',head.id,actor_id,'subject');
 request_row:=public.uc_signature_assurance_record_request(p_org,p_request,digest,'accept_agreement',head.id,event_row.id,new_id,event_row.revision);
 RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(request_row),'result',jsonb_build_object('kind','agreement','agreement',public.uc_signature_assurance_project_agreement(p_org,new_id)));
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_confirm_consent(p_org uuid,p_request uuid,p_expected integer,p_action jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE head public.uc_signature_assurance_streams;version_row public.uc_signature_assurance_policy_versions;agreement_row public.uc_signature_assurance_agreements;
 event_row public.uc_signature_assurance_events;request_row public.uc_signature_assurance_requests;terms_result jsonb;digest text;new_id uuid:=gen_random_uuid();actor_id uuid:=auth.uid();authority jsonb;organization_row public.organizations;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_active()THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR NOT public.uc_signature_assurance_shape(p_action,ARRAY['action','policy_version_id','terms_sha256','rendered_text_sha256','declared_full_name','agreement_event_id','authority'])
 OR p_action->>'action'IS DISTINCT FROM'confirm_consent'OR NOT public.uc_signature_assurance_uuid(p_action->'policy_version_id')OR NOT public.uc_signature_assurance_uuid(p_action->'agreement_event_id')
 OR NOT public.uc_signature_assurance_sha(p_action->'terms_sha256')OR NOT public.uc_signature_assurance_sha(p_action->'rendered_text_sha256')
 OR NOT public.uc_signature_assurance_text(p_action->'declared_full_name',300)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 digest:=public.uc_signature_assurance_hash(jsonb_build_object('organization_id',p_org,'expected_revision',p_expected,'action',p_action)::text);
 PERFORM public.uc_signature_assurance_fence(p_org,ARRAY[actor_id],true,NULL,p_request);
 request_row:=public.uc_signature_assurance_request(p_org,p_request,digest);
 IF request_row.request_id IS NOT NULL THEN RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(request_row,true),'result',jsonb_build_object('kind','consent','consent',public.uc_signature_assurance_project_consent(p_org,request_row.entity_id)));END IF;
 IF NOT public.uc_signature_assurance_own_current(p_org,actor_id)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT*INTO version_row FROM public.uc_signature_assurance_policy_versions WHERE id=(p_action->>'policy_version_id')::uuid AND organization_id=p_org;
 IF version_row.id IS NULL OR version_row.body->'classification'->>'document_type'IS DISTINCT FROM'consent'THEN PERFORM public.uc_signature_assurance_error('CLASSIFICATION_REQUIRED');END IF;
 terms_result:=public.uc_signature_assurance_render_terms(p_org,version_row.id,'personal_data_consent',p_action->>'declared_full_name');
 IF terms_result->'terms'->>'sha256'IS DISTINCT FROM p_action->>'terms_sha256'OR terms_result->>'rendered_text_sha256'IS DISTINCT FROM p_action->>'rendered_text_sha256'THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
 SELECT*INTO agreement_row FROM public.uc_signature_assurance_agreements WHERE id=(p_action->>'agreement_event_id')::uuid AND organization_id=p_org AND subject_user_id=actor_id;
 IF agreement_row.id IS NULL OR agreement_row.policy_version_id<>version_row.id OR agreement_row.policy_sha256<>version_row.body_sha256
  OR agreement_row.terms->>'sha256'IS DISTINCT FROM version_row.body->'agreement'->>'sha256'THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_REQUIRED');END IF;
 authority:=public.uc_signature_assurance_authority(p_org,p_action->'authority');
 IF authority->>'kind'IS DISTINCT FROM version_row.body->>'authority_requirement'THEN PERFORM public.uc_signature_assurance_error('AUTHORITY_REQUIRED');END IF;
 SELECT*INTO organization_row FROM public.organizations WHERE id=p_org;
 IF organization_row.inn IS NOT NULL AND NOT public.uc_signature_assurance_text(to_jsonb(organization_row.inn),20)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 head:=public.uc_signature_assurance_stream(p_org,'consent',actor_id,actor_id);
 IF head.revision<>p_expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 PERFORM public.uc_signature_assurance_token('consent',new_id);
 INSERT INTO public.uc_signature_assurance_consents(id,organization_id,subject_user_id,stream_id,revision,state,policy_version_id,policy_sha256,agreement_event_id,terms,rendered_text,rendered_text_sha256,
 organization_name,organization_inn,actor,authority,confirmed_at)
 VALUES(new_id,p_org,actor_id,head.id,head.revision+1,'confirmed',version_row.id,version_row.body_sha256,agreement_row.id,terms_result->'terms',terms_result->>'rendered_text',terms_result->>'rendered_text_sha256',
 organization_row.name,organization_row.inn,public.uc_signature_assurance_actor(actor_id,p_action->>'declared_full_name'),authority,clock_timestamp());
 event_row:=public.uc_signature_assurance_append(p_org,head.id,p_expected,p_request,'consent_confirmed','authenticated_account_confirmation','Учётная запись подтвердила точный сохранённый текст согласия.',authority,
 version_row.id,NULL,NULL,agreement_row.id,new_id,'factual_confirmation',actor_id,p_action->>'declared_full_name');
 PERFORM public.uc_signature_assurance_track(p_org,'consent',new_id,actor_id,'subject');
 PERFORM public.uc_signature_assurance_track(p_org,'stream',head.id,actor_id,'subject');
 request_row:=public.uc_signature_assurance_record_request(p_org,p_request,digest,'confirm_consent',head.id,event_row.id,new_id,event_row.revision);
 RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(request_row),'result',jsonb_build_object('kind','consent','consent',public.uc_signature_assurance_project_consent(p_org,new_id)));
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_withdraw_consent(p_org uuid,p_request uuid,p_expected integer,p_action jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE previous public.uc_signature_assurance_consents;head public.uc_signature_assurance_streams;new_id uuid:=gen_random_uuid();actor_id uuid:=auth.uid();digest text;
 request_row public.uc_signature_assurance_requests;event_row public.uc_signature_assurance_events;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_active()THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR NOT public.uc_signature_assurance_shape(p_action,ARRAY['action','consent_snapshot_id','reason'])OR p_action->>'action'IS DISTINCT FROM'withdraw_consent'
 OR NOT public.uc_signature_assurance_uuid(p_action->'consent_snapshot_id')OR NOT public.uc_signature_assurance_text(p_action->'reason',4000)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 SELECT*INTO previous FROM public.uc_signature_assurance_consents WHERE id=(p_action->>'consent_snapshot_id')::uuid AND organization_id=p_org AND subject_user_id=actor_id;
 IF previous.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 digest:=public.uc_signature_assurance_hash(jsonb_build_object('organization_id',p_org,'expected_revision',p_expected,'action',p_action)::text);
 -- A stored consent may be withdrawn by its account holder after leaving the organisation.
 -- Current enrolment and current policy acceptance are deliberately not prerequisites.
 PERFORM public.uc_signature_assurance_fence(p_org,ARRAY[actor_id],true,previous.stream_id,p_request);
 request_row:=public.uc_signature_assurance_request(p_org,p_request,digest);
 IF request_row.request_id IS NOT NULL THEN RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(request_row,true),'result',jsonb_build_object('kind','consent','consent',public.uc_signature_assurance_project_consent(p_org,request_row.entity_id)));END IF;
 SELECT*INTO head FROM public.uc_signature_assurance_streams WHERE id=previous.stream_id AND organization_id=p_org FOR UPDATE NOWAIT;
 IF head.id IS NULL OR head.revision<>p_expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF previous.state<>'confirmed'OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_consents newer WHERE newer.organization_id=p_org AND newer.stream_id=previous.stream_id AND newer.previous_snapshot_id=previous.id)THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 PERFORM public.uc_signature_assurance_token('consent',new_id);
 INSERT INTO public.uc_signature_assurance_consents(id,organization_id,subject_user_id,stream_id,revision,state,previous_snapshot_id,policy_version_id,policy_sha256,agreement_event_id,
 terms,rendered_text,rendered_text_sha256,organization_name,organization_inn,actor,authority,confirmed_at,withdrawn_at)
 VALUES(new_id,p_org,actor_id,head.id,head.revision+1,'withdrawn',previous.id,previous.policy_version_id,previous.policy_sha256,previous.agreement_event_id,
 previous.terms,previous.rendered_text,previous.rendered_text_sha256,previous.organization_name,previous.organization_inn,public.uc_signature_assurance_actor(actor_id,NULL),
 jsonb_build_object('kind','self','declaration',NULL,'document_reference',NULL,'verification','not_verified'),previous.confirmed_at,clock_timestamp());
 event_row:=public.uc_signature_assurance_append(p_org,head.id,p_expected,p_request,'consent_withdrawn','authenticated_account_confirmation',p_action->>'reason',
 jsonb_build_object('kind','self','declaration',NULL,'document_reference',NULL,'verification','not_verified'),previous.policy_version_id,NULL,NULL,previous.agreement_event_id,new_id,'factual_confirmation',actor_id);
 PERFORM public.uc_signature_assurance_track(p_org,'consent',new_id,actor_id,'subject');
 request_row:=public.uc_signature_assurance_record_request(p_org,p_request,digest,'withdraw_consent',head.id,event_row.id,new_id,event_row.revision);
 RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(request_row),'result',jsonb_build_object('kind','consent','consent',public.uc_signature_assurance_project_consent(p_org,new_id)));
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

-- FOUNDATION ONLY. Additional current-authority/capture/project/apply helpers and exact622
-- legacy/privacy composition follow before any complete source hold or actual engine/release.
DO $acl$
DECLARE rel record;fn record;gr record;
BEGIN
 FOR rel IN SELECT c.oid,c.relname,c.relowner,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN(
 'uc_signature_assurance_streams','uc_signature_assurance_policy_versions','uc_signature_assurance_policy_decisions','uc_signature_assurance_document_snapshots','uc_signature_assurance_bindings','uc_signature_assurance_agreements','uc_signature_assurance_consents','uc_signature_assurance_events','uc_signature_assurance_private_manifests','uc_signature_assurance_scoped_manifests','uc_signature_assurance_requests','uc_signature_assurance_participants','uc_signature_assurance_write_tokens') LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',rel.relname);
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',rel.relname);
  FOR gr IN SELECT DISTINCT a.grantee FROM aclexplode(NULLIF(coalesce(rel.relacl,acldefault('r',rel.relowner)),'{}'::aclitem[]))a WHERE a.grantee<>rel.relowner AND a.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',rel.relname,pg_get_userbyid(gr.grantee));
  END LOOP;
 END LOOP;
 -- Exact new object names, never a prefix wildcard over existing customer objects.
 FOR fn IN SELECT p.oid,p.proowner,p.proacl,p.oid::regprocedure AS identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(
 'uc_signature_assurance_error','uc_signature_assurance_hash','uc_signature_assurance_shape','uc_signature_assurance_text','uc_signature_assurance_uuid','uc_signature_assurance_sha','uc_signature_assurance_integer','uc_signature_assurance_classification','uc_signature_assurance_selection','uc_signature_assurance_terms',
 'uc_signature_assurance_active','uc_signature_assurance_own_current','uc_signature_assurance_subject_read','uc_signature_assurance_signature_read','uc_signature_assurance_signature_write','uc_signature_assurance_fence','uc_signature_assurance_token','uc_signature_assurance_immutable',
 'uc_signature_assurance_date','uc_signature_assurance_legal_source','uc_signature_assurance_policy_body','uc_signature_assurance_resolve_selection','uc_signature_assurance_disclose_selection',
 'uc_signature_assurance_actor','uc_signature_assurance_authority','uc_signature_assurance_stream','uc_signature_assurance_track',
  'uc_signature_assurance_utc','uc_signature_assurance_empty_authority','uc_signature_assurance_policy_eligible','uc_signature_assurance_policy_read','uc_signature_assurance_project_authority','uc_signature_assurance_project_policy','uc_signature_assurance_request','uc_signature_assurance_receipt','uc_signature_assurance_record_request','uc_signature_assurance_append','uc_signature_assurance_save_policy','uc_signature_assurance_decide_policy','uc_signature_assurance_project_agreement','uc_signature_assurance_project_consent','uc_signature_assurance_project_legacy_agreement','uc_signature_assurance_project_legacy_consent','uc_signature_assurance_render_terms','uc_signature_assurance_accept_agreement','uc_signature_assurance_confirm_consent','uc_signature_assurance_withdraw_consent') LOOP
  EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',fn.identity);
  FOR gr IN SELECT DISTINCT x.grantee FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner)))x WHERE x.grantee<>fn.proowner AND x.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I',fn.identity,pg_get_userbyid(gr.grantee));
  END LOOP;
 END LOOP;
END;$acl$;


-- UC022 fragment 10_permission_mirror.sql
-- UC022 source-only explicit-actor parity candidates. NOT native/released permission proof.
-- New owner-private functions only. No SET ROLE, auth-claim mutation, grants or old replacement.

CREATE FUNCTION public.uc_signature_assurance_as_can_access_organization(p_actor uuid,
  _organization_id uuid,
  _permission text DEFAULT 'settings.read'::text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
  SELECT
    _organization_id IS NOT NULL
    AND p_actor IS NOT NULL
    AND (
      public.has_role(p_actor, 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.profiles p ON p.user_id = ur.user_id
        WHERE ur.user_id = p_actor
          AND ur.role = 'organization'::public.app_role
          AND p.organization_id = _organization_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.org_staff os
            WHERE os.user_id = p_actor
              AND os.organization_id = _organization_id
          )
      )
      OR (
        _permission IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.org_staff os
          WHERE os.user_id = p_actor
            AND os.organization_id = _organization_id
            AND (os.expires_at IS NULL OR os.expires_at > now())
        )
        AND public.has_org_staff_permission(p_actor, _organization_id, _permission)
      )
    )
$function$;

CREATE FUNCTION public.uc_signature_assurance_as_document_teacher_limited(p_actor uuid,p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT NOT public.has_role(p_actor,'admin'::public.app_role)
 AND EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.role='teacher')
 AND NOT public.is_org_owner(p_actor,p_org)
 AND NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org AND s.role<>'teacher'
  AND (s.expires_at IS NULL OR s.expires_at>now()));
$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_document_scope_allowed(p_actor uuid,p_org uuid,p_group uuid DEFAULT NULL,p_enrollment uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_user uuid;v_course uuid;v_group_course uuid;
BEGIN
 IF p_actor IS NULL OR NOT (NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)) OR p_org IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org) THEN RETURN false; END IF;
 IF p_group IS NOT NULL THEN
  SELECT course_id INTO v_group_course FROM public.student_groups WHERE id=p_group AND organization_id=p_org;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_group_course IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=v_group_course AND c.organization_id=p_org) THEN RETURN false; END IF;
 END IF;
 IF p_enrollment IS NOT NULL THEN
  SELECT e.user_id,e.course_id INTO v_user,v_course FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id
   WHERE e.id=p_enrollment AND c.organization_id=p_org;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_group IS NOT NULL AND (v_group_course IS DISTINCT FROM v_course OR NOT EXISTS(
   SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=v_user))
  THEN RETURN false; END IF;
 END IF;
 IF public.has_role(p_actor,'admin'::public.app_role) OR public.is_org_owner(p_actor,p_org) THEN RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.organization_id=p_org AND s.user_id=p_actor
   AND (s.expires_at IS NULL OR s.expires_at>now())) THEN RETURN false; END IF;
 IF NOT public.uc_signature_assurance_as_document_teacher_limited(p_actor,p_org) THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.org_staff s JOIN public.org_staff_document_groups a ON a.staff_id=s.id AND a.organization_id=s.organization_id
  JOIN public.student_groups g ON g.id=a.group_id AND g.organization_id=a.organization_id
  WHERE s.organization_id=p_org AND s.user_id=p_actor AND (s.expires_at IS NULL OR s.expires_at>now())
   AND (p_group IS NULL OR g.id=p_group)
   AND (p_enrollment IS NULL OR (g.course_id=v_course AND EXISTS(SELECT 1 FROM public.student_group_memberships_effective m
     WHERE m.organization_id=p_org AND m.group_id=g.id AND m.user_id=v_user)))
   AND (p_group IS NOT NULL OR p_enrollment IS NOT NULL));
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_document_record_scope(p_actor uuid,p_org uuid,p_group uuid,p_enrollment uuid,p_user uuid,p_course uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF p_enrollment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id
  WHERE e.id=p_enrollment AND c.organization_id=p_org AND (p_user IS NULL OR e.user_id=p_user) AND (p_course IS NULL OR e.course_id=p_course)) THEN RETURN false; END IF;
 IF p_course IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=p_course AND c.organization_id=p_org) THEN RETURN false; END IF;
 IF p_group IS NOT NULL AND p_course IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_groups g WHERE g.id=p_group AND g.organization_id=p_org AND g.course_id=p_course) THEN RETURN false; END IF;
 IF p_group IS NOT NULL AND p_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m
  WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=p_user) THEN RETURN false; END IF;
 RETURN public.uc_signature_assurance_as_document_scope_allowed(p_actor,p_org,p_group,p_enrollment);
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_document_contract_scope(p_actor uuid,p_org uuid,p_group uuid,p_user uuid,p_company uuid,p_students jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE item jsonb;v_user uuid;
BEGIN
 IF p_company IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.companies c WHERE c.id=p_company AND c.organization_id=p_org) THEN RETURN false; END IF;
 IF p_user IS NOT NULL AND p_group IS NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.organization_id=p_org)
 AND NOT EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.user_id=p_user AND c.organization_id=p_org)
 THEN RETURN false; END IF;
 IF p_students IS NULL OR jsonb_typeof(p_students)<>'array' THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_students) LOOP
  v_user:=public.storage_try_uuid(item->>'user_id');
  IF v_user IS NULL THEN
   IF public.uc_signature_assurance_as_document_teacher_limited(p_actor,p_org) OR nullif(item->>'user_id','') IS NOT NULL THEN RETURN false; END IF;
  ELSIF p_group IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=v_user) THEN RETURN false; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=v_user AND p.organization_id=p_org) THEN RETURN false;
  END IF;
 END LOOP;
 RETURN public.uc_signature_assurance_as_document_record_scope(p_actor,p_org,p_group,NULL,p_user,NULL);
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_document_signature_source_scope(p_actor uuid,p_org uuid,p_document uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_actor IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)) AND (
 public.uc_signature_assurance_as_document_scope_allowed(p_actor,p_org,NULL,NULL)
 OR EXISTS(SELECT 1 FROM public.group_documents d WHERE d.id=p_document AND d.organization_id=p_org
   AND public.uc_signature_assurance_as_document_record_scope(p_actor,d.organization_id,d.group_id,NULL,d.student_user_id,NULL))
 OR EXISTS(SELECT 1 FROM public.education_document_records d WHERE d.id=p_document AND d.organization_id=p_org
   AND public.uc_signature_assurance_as_document_record_scope(p_actor,d.organization_id,d.group_id,d.enrollment_id,d.user_id,d.course_id))
 OR EXISTS(SELECT 1 FROM public.student_documents d JOIN public.enrollments e ON e.id=d.enrollment_id JOIN public.courses c ON c.id=e.course_id
   WHERE d.id=p_document AND c.organization_id=p_org AND public.uc_signature_assurance_as_document_scope_allowed(p_actor,c.organization_id,NULL,e.id))
 OR EXISTS(SELECT 1 FROM public.org_contracts d WHERE d.id=p_document AND d.organization_id=p_org
   AND public.uc_signature_assurance_as_document_contract_scope(p_actor,d.organization_id,d.student_group_id,d.student_user_id,d.company_id,d.students)));
$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_document_signature_scope(p_actor uuid,p_signature_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature_id
 AND public.uc_signature_assurance_as_document_signature_source_scope(p_actor,s.organization_id,s.document_id));
$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_document_signature_read_scope(p_actor uuid,p_signature_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_actor IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)) AND
 (public.uc_signature_assurance_as_document_signature_scope(p_actor,p_signature_id) OR EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature_id AND s.recipient_user_id=p_actor));
$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_document_has_action(p_actor uuid,p_org uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_platform_document_action_allowed(p_actor,p_action)
  AND (NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor))
  AND p_org IS NOT NULL AND p_action IN ('read','write','sign','issue')
  AND coalesce(public.uc_signature_assurance_as_can_access_organization(p_actor,p_org,'documents.'||p_action),false)
$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_document_action_allowed(p_actor uuid,p_org uuid,p_action text,p_group uuid DEFAULT NULL,p_enrollment uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_signature_assurance_as_document_has_action(p_actor,p_org,p_action)
  AND public.uc_signature_assurance_as_document_scope_allowed(p_actor,p_org,p_group,p_enrollment)
$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_document_commercial_creation_allowed(p_actor uuid,p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_platform_sales_action_allowed(p_actor) AND (NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor))
  AND coalesce(public.uc_signature_assurance_as_can_access_organization(p_actor,p_org,'sales.write'),false)
  AND public.uc_signature_assurance_as_document_scope_allowed(p_actor,p_org,NULL,NULL)
$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_signature_commercial_sender_allowed(p_actor uuid,p_signature uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT (NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)) AND EXISTS(SELECT 1 FROM public.document_signatures s
  WHERE s.id=p_signature AND s.deleted_at IS NULL AND s.sender_user_id=p_actor
   AND s.document_type IN ('contract','external_upload','act')
   AND public.uc_signature_assurance_as_document_commercial_creation_allowed(p_actor,s.organization_id))
$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_signature_action_allowed(p_actor uuid,p_signature uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_action IN ('read','write','sign') AND (NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor))
  AND EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature AND s.deleted_at IS NULL
   AND (public.uc_signature_assurance_as_document_has_action(p_actor,s.organization_id,p_action) AND public.uc_signature_assurance_as_document_signature_scope(p_actor,s.id)
    OR public.uc_signature_assurance_as_signature_commercial_sender_allowed(p_actor,s.id)))
$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_signature_actor_allowed(p_actor uuid,p_signature_id uuid,p_write boolean DEFAULT false,p_recipient boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT (NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)) AND (
  public.uc_signature_assurance_as_signature_action_allowed(p_actor,p_signature_id,CASE WHEN p_write THEN 'write' ELSE 'read' END)
  OR p_recipient AND EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature_id
   AND s.deleted_at IS NULL AND s.recipient_user_id=p_actor))
$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_signature_file_scope(p_actor uuid,p_bucket text,p_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_org uuid;v_signature uuid;
BEGIN
 IF p_actor IS NULL OR NOT (NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)) THEN RETURN false; END IF;
 v_org:=public.storage_try_uuid(split_part(p_path,'/',1));
 IF v_org IS NULL THEN RETURN false; END IF;
 -- Retain authenticated organization-wide access to historical objects. This
 -- cannot be used by the public token broker or by an assigned-group teacher.
 IF public.uc_signature_assurance_as_document_scope_allowed(p_actor,v_org,NULL,NULL) THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.organization_id=v_org
   AND public.uc_signature_assurance_as_document_signature_read_scope(p_actor,s.id)
   AND public.uc_signature_object_bound(s.id,p_bucket,p_path)) THEN RETURN true; END IF;
 IF p_bucket='external-contracts' AND split_part(p_path,'/',2)='signature-files' THEN
  v_signature:=public.storage_try_uuid(split_part(p_path,'/',3));
  RETURN EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=v_signature AND s.organization_id=v_org
   AND s.deleted_at IS NULL AND s.expires_at>now() AND s.status IN('draft','sent','viewed','in_review','changes_requested')
   AND public.uc_signature_canonical_file(v_org,s.id,p_path) AND public.uc_signature_assurance_as_signature_actor_allowed(p_actor,s.id,true,true)
   AND (NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path)
    OR public.uc_signature_object_uploader(p_bucket,p_path,p_actor)));
 END IF;
 RETURN p_bucket='external-contracts' AND EXISTS(SELECT 1 FROM public.document_signatures s
  WHERE s.organization_id=v_org AND s.recipient_user_id=p_actor AND s.deleted_at IS NULL AND s.expires_at>now()
   AND s.status IN('sent','viewed','in_review')
   AND p_path ~ ('^'||v_org::text||'/signed-scans/'||s.id::text||'-[a-zA-Z0-9._-]+$')
   AND (NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path)
    OR public.uc_signature_object_uploader(p_bucket,p_path,p_actor)));
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_as_signature_storage_read(p_actor uuid,p_bucket text,p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT (NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)) AND (
  EXISTS(SELECT 1 FROM public.organizations o WHERE o.id::text=split_part(p_name,'/',1)
   AND public.uc_signature_assurance_as_document_action_allowed(p_actor,o.id,'read',NULL,NULL))
  OR EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.organization_id::text=split_part(p_name,'/',1)
   AND public.uc_signature_assurance_as_signature_actor_allowed(p_actor,s.id,false,true) AND public.uc_signature_assurance_as_document_signature_read_scope(p_actor,s.id)
   AND public.uc_signature_object_bound(s.id,p_bucket,p_name))
  OR p_bucket='external-contracts' AND split_part(p_name,'/',2)='signature-files'
   AND public.uc_signature_object_uploader(p_bucket,p_name,p_actor) AND public.uc_signature_assurance_as_signature_file_scope(p_actor,p_bucket,p_name))
$fn$;


-- UC022 fragment 15_read_mask.sql
-- UC022 source-only H fragment. New owner-private helpers; NOT applied or integrated.
-- Depends on held F private foundation. Existing public/legacy bodies and grants unchanged.
-- This is a conservative known-credential tripwire, NOT universal DLP or an HTML renderer.
CREATE FUNCTION public.uc_signature_assurance_decode_probe(p_value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE result text:=p_value;next_value text;item text[];literal text;code integer;counted integer;pass integer;
BEGIN
 IF result IS NULL THEN RETURN NULL;END IF;
 IF octet_length(result)>2000000 THEN RETURN NULL;END IF;
 FOR pass IN 1..6 LOOP
  next_value:=result;counted:=0;
  FOR item IN SELECT regexp_matches(result,'(&#(?:[xX]([0-9a-fA-F]{1,6})|([0-9]{1,7}));?)','g')LOOP
   counted:=counted+1;IF counted>4096 THEN RETURN NULL;END IF;
   literal:=item[1];
   IF item[2]IS NOT NULL THEN code:=('x'||lpad(item[2],8,'0'))::bit(32)::integer;ELSE code:=item[3]::integer;END IF;
   IF code=0 OR code>1114111 OR code BETWEEN 55296 AND 57343 THEN RETURN NULL;END IF;
   next_value:=replace(next_value,literal,chr(code));
  END LOOP;
  -- Actual ASCII URL delimiters and common credential-route entity spellings.
  next_value:=replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(next_value,
   '&amp;','&'),'&equals;','='),'&sol;','/'),'&colon;',':'),'&quest;','?'),'&percnt;','%'),'&lowbar;','_'),'&period;','.'),'&Tab;',E'\t'),'&NewLine;',E'\n'),'&commat;','@');
  next_value:=replace(replace(replace(replace(replace(next_value,'&quot;','"'),'&apos;',''''),'&lt;','<'),'&gt;','>'),'&nbsp;',' ');
  counted:=0;
  FOR item IN SELECT regexp_matches(next_value,'(%[0-9a-fA-F]{2})','g')LOOP
   counted:=counted+1;IF counted>4096 THEN RETURN NULL;END IF;
   code:=get_byte(decode(substr(item[1],2),'hex'),0);
   -- Credential keys/tokens here are ASCII. Unsupported byte encodings are not
   -- silently decoded as another character set; callers protectively hide this source.
   IF code=0 OR code>=128 THEN RETURN NULL;END IF;
   next_value:=replace(next_value,item[1],chr(code));
  END LOOP;
  next_value:=replace(replace(replace(next_value,E'\t',''),E'\r',''),E'\n','');
  IF next_value=result THEN
   IF result~'&[A-Za-z][A-Za-z0-9]+;'THEN RETURN NULL;END IF;
   RETURN result;
  END IF;result:=next_value;
 END LOOP;
 -- Further nested encoding is deliberately not presented as a readable safe original.
 IF result~'%[0-9a-fA-F]{2}|&#(?:[xX][0-9a-fA-F]+|[0-9]+);?|&[A-Za-z][A-Za-z0-9]+;'THEN RETURN NULL;END IF;
 RETURN result;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR character_not_in_repertoire THEN RETURN NULL;
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_credential_source(p_org uuid,p_value text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE decoded text;known_token text;checked integer:=0;
BEGIN
 IF p_value IS NULL THEN RETURN false;END IF;
 decoded:=public.uc_signature_assurance_decode_probe(p_value);
 IF decoded IS NULL THEN RETURN true;END IF;
 -- Actual scoped invitation/email-open credentials are read only inside this private
 -- boolean helper. Neither their literal text nor a token-bearing URL is returned.
 FOR known_token IN
  SELECT DISTINCT known.token FROM public.document_signatures s
  CROSS JOIN LATERAL unnest(ARRAY[s.signature_token::text,s.email_open_token::text])AS known(token)
  WHERE s.organization_id=p_org AND known.token IS NOT NULL AND length(known.token)>=16
  ORDER BY known.token LIMIT 10001
 LOOP
  checked:=checked+1;IF checked>10000 THEN RETURN true;END IF;
  IF strpos(p_value,known_token)>0 OR strpos(decoded,known_token)>0 THEN RETURN true;END IF;
 END LOOP;
 RETURN decoded~*'[?&](token|access_token|refresh_token|authorization|api[_-]?key|signature)=[^[:space:]"''<>]+'
  OR decoded~*'/sign/[^[:space:]"''<>/?#]+'
  OR decoded~'\meyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\M'
  OR decoded~*'\mBearer[[:space:]]+[A-Za-z0-9._~-]+';
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_safe_authenticated_input(p_org uuid,p_action jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 -- For closed authenticated ApplyAction only. Invitation transport actions contain
 -- their token by design and MUST use their separate exact service validator instead.
 IF jsonb_typeof(p_action)IS DISTINCT FROM'object'OR p_action?'token'OR p_action?'address'
  OR public.uc_signature_assurance_credential_source(p_org,p_action::text)
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_read_html_fields(p_org uuid,p_signature uuid,p_document uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE stored public.uc_signature_assurance_document_snapshots;people uuid[];can_source boolean:=true;visibility text;literal text;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT*INTO stored FROM public.uc_signature_assurance_document_snapshots WHERE id=p_document AND organization_id=p_org AND signature_id=p_signature;
 IF stored.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 SELECT array_agg(DISTINCT person ORDER BY person)INTO people FROM(
  SELECT stored.subject_user_id AS person UNION SELECT stored.recipient_user_id
  UNION SELECT user_id FROM public.uc_signature_assurance_participants WHERE organization_id=p_org AND object_kind='document'AND object_id=p_document
 )known WHERE person IS NOT NULL;
 -- Read uses shared person/org fences, never the exclusive signature stream/request
 -- locks. Parallel ordinary reads must coexist. Trusted erasure remains exclusive42007.
 PERFORM public.uc_signature_assurance_fence(p_org,coalesce(people,'{}'::uuid[]),false,NULL,NULL);
 PERFORM 1 FROM public.document_signatures WHERE id=p_signature AND organization_id=p_org FOR SHARE NOWAIT;
 SELECT*INTO stored FROM public.uc_signature_assurance_document_snapshots WHERE id=p_document AND organization_id=p_org AND signature_id=p_signature FOR SHARE NOWAIT;
 IF stored.id IS NULL OR NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF stored.html_sha256 IS DISTINCT FROM public.uc_signature_assurance_hash(stored.html_text)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 -- A known canonical source reference requires its actual current file-read scope.
 -- Unknown old pointers remain private; this function never fabricates ExactFile proof.
 IF stored.original_file IS NOT NULL AND stored.original_file->>'bucket'IN('external-contracts','signed-documents')AND public.uc_signature_assurance_text(stored.original_file->'path',2000)THEN
  can_source:=coalesce(public.uc_signature_storage_read(stored.original_file->>'bucket',stored.original_file->>'path'),false)
   AND public.uc_signature_object_bound(p_signature,stored.original_file->>'bucket',stored.original_file->>'path');
 END IF;
 IF NOT can_source THEN visibility:='redacted_current_file_scope';literal:=NULL;
 ELSIF public.uc_signature_assurance_credential_source(p_org,stored.html_text)THEN visibility:='redacted_credential_bearing_source';literal:=NULL;
 ELSE visibility:='available';literal:=stored.html_text;END IF;
 RETURN jsonb_build_object('html_text',literal,'html_sha256',stored.html_sha256,'content_visibility',visibility);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

DO $private_acl$
DECLARE fn record;gr record;
BEGIN
  FOR fn IN SELECT p.oid,p.proowner,p.proacl,p.oid::regprocedure AS identity FROM pg_proc p
  WHERE p.oid=ANY(ARRAY['public.uc_signature_assurance_decode_probe(text)'::regprocedure,
   'public.uc_signature_assurance_credential_source(uuid,text)'::regprocedure,
   'public.uc_signature_assurance_safe_authenticated_input(uuid,jsonb)'::regprocedure,
   'public.uc_signature_assurance_read_html_fields(uuid,uuid,uuid)'::regprocedure])LOOP
  EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',fn.identity);
  FOR gr IN SELECT DISTINCT x.grantee FROM aclexplode(NULLIF(coalesce(fn.proacl,acldefault('f',fn.proowner)),'{}'::aclitem[]))x WHERE x.grantee<>fn.proowner AND x.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I',fn.identity,pg_get_userbyid(gr.grantee));
  END LOOP;
   IF EXISTS(SELECT 1 FROM pg_proc q CROSS JOIN LATERAL aclexplode(NULLIF(coalesce(q.proacl,acldefault('f',q.proowner)),'{}'::aclitem[]))x WHERE q.oid=fn.oid AND x.grantee<>q.proowner)
   THEN RAISE EXCEPTION 'UC022_PRIVATE_HELPER_ACL_NOT_CLOSED';END IF;
 END LOOP;
END;$private_acl$;


-- UC022 fragment 20_file_proof.sql
-- UC022 V2B3 SOURCE ONLY. Append after held F and explicit-permission-fragment-i.
-- No old replacement, grants, public facade, existing row update or policy approval.
CREATE TABLE public.uc_signature_assurance_file_proofs(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,verification_request_id uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),actor_user_id uuid,
 signature_id uuid NOT NULL,party_role text NOT NULL CHECK(party_role IN('sender','recipient')),
 subject_user_id uuid,recipient_user_id uuid,proof jsonb NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,verification_request_id),UNIQUE(id,organization_id),CHECK(jsonb_typeof(proof)='object'),CHECK(octet_length(proof::text)<=20000),
 CHECK(coalesce(proof->'source'->>'organization_id'=organization_id::text AND proof->'source'->>'signature_id'=signature_id::text AND proof->'source'->>'chosen_party'=party_role,false))
);
CREATE TABLE public.uc_signature_assurance_file_proof_tokens(
 transaction_id bigint NOT NULL,proof_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN('append','privacy_attribution','privacy_subject')),
 PRIMARY KEY(transaction_id,proof_id,operation)
);
CREATE TABLE public.uc_signature_assurance_file_proof_links(
 proof_id uuid NOT NULL,
 organization_id uuid NOT NULL,user_id uuid NOT NULL,relation text NOT NULL CHECK(relation IN('subject','recipient','actual_personal_signer','staff_attribution')),
 PRIMARY KEY(proof_id,user_id,relation),FOREIGN KEY(proof_id,organization_id)REFERENCES public.uc_signature_assurance_file_proofs(id,organization_id)ON DELETE CASCADE
);
ALTER TABLE public.uc_signature_assurance_file_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uc_signature_assurance_file_proof_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uc_signature_assurance_file_proof_links ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.uc_signature_assurance_file_proof_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE allowed boolean;record_id uuid;
BEGIN
 record_id:=CASE WHEN TG_OP='DELETE'THEN OLD.id ELSE NEW.id END;
 IF TG_OP='INSERT'THEN allowed:=EXISTS(SELECT 1 FROM public.uc_signature_assurance_file_proof_tokens WHERE transaction_id=txid_current()AND proof_id=record_id AND operation='append');
 ELSIF TG_OP='UPDATE'THEN
  allowed:=EXISTS(SELECT 1 FROM public.uc_signature_assurance_file_proof_tokens WHERE transaction_id=txid_current()AND proof_id=record_id AND operation='privacy_attribution')
   AND NEW.actor_user_id IS NULL AND(to_jsonb(NEW)-'actor_user_id')IS NOT DISTINCT FROM(to_jsonb(OLD)-'actor_user_id');
 ELSE allowed:=EXISTS(SELECT 1 FROM public.uc_signature_assurance_file_proof_tokens WHERE transaction_id=txid_current()AND proof_id=record_id AND operation='privacy_subject');END IF;
 IF NOT coalesce(allowed,false)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_signature_assurance_file_proof_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.uc_signature_assurance_file_proofs FOR EACH ROW EXECUTE FUNCTION public.uc_signature_assurance_file_proof_immutable();
CREATE FUNCTION public.uc_signature_assurance_file_proof_link_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE record_id uuid;
BEGIN
 record_id:=CASE WHEN TG_OP='DELETE'THEN OLD.proof_id ELSE NEW.proof_id END;
 IF TG_OP='UPDATE'OR NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_file_proof_tokens WHERE transaction_id=txid_current()AND proof_id=record_id
  AND(operation=CASE WHEN TG_OP='INSERT'THEN'append'ELSE'privacy_subject'END OR TG_OP='DELETE'AND operation='privacy_attribution'AND OLD.relation='staff_attribution'))
 THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_signature_assurance_file_proof_link_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.uc_signature_assurance_file_proof_links FOR EACH ROW EXECUTE FUNCTION public.uc_signature_assurance_file_proof_link_guard();

CREATE FUNCTION public.uc_signature_assurance_file_action(p_action jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE keys text[];a jsonb;
BEGIN
 keys:=ARRAY['action','address','expected_document_revision_id','document_html_sha256','purpose','scan_path'];
 IF p_action->>'action'='attest_file'THEN keys:=array_append(keys,'verification_request_id');END IF;
 a:=p_action->'address';
 IF NOT public.uc_signature_assurance_shape(p_action,keys)OR NOT coalesce(p_action->>'action'IN('file_context','attest_file'),false)
 OR NOT coalesce(p_action->>'purpose'IN('source','scan'),false)OR NOT public.uc_signature_assurance_sha(p_action->'document_html_sha256')
 OR(p_action->'expected_document_revision_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_action->'expected_document_revision_id'))
 OR(p_action->'scan_path'<>'null'::jsonb AND NOT public.uc_signature_assurance_text(p_action->'scan_path',2000))
 OR((p_action->>'purpose'='scan')IS DISTINCT FROM(p_action->'scan_path'<>'null'::jsonb))
 OR(p_action->>'action'='attest_file'AND NOT public.uc_signature_assurance_uuid(p_action->'verification_request_id'))
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF a->>'kind'='authenticated_signature'THEN
  IF NOT public.uc_signature_assurance_shape(a,ARRAY['kind','organization_id','signature_id','chosen_party'])OR NOT public.uc_signature_assurance_uuid(a->'organization_id')OR NOT public.uc_signature_assurance_uuid(a->'signature_id')OR NOT coalesce(a->>'chosen_party'IN('sender','recipient'),false)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ELSIF a->>'kind'='invitation'THEN
  IF NOT public.uc_signature_assurance_shape(a,ARRAY['kind','token'])OR NOT public.uc_signature_assurance_text(a->'token',200)OR length(a->>'token')<16 OR a->>'token'~'[[:space:]]'THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ELSE PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_file_actor(p_action jsonb,p_actor uuid) RETURNS public.document_signatures
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_signature_assurance_file_action(p_action);
 IF p_action->'address'->>'kind'='invitation'THEN
  SELECT*INTO s FROM public.document_signatures WHERE signature_token=p_action->'address'->>'token'FOR SHARE NOWAIT;
  IF s.id IS NULL OR NOT public.uc_signature_token_access_allowed(s.id,false)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
  IF p_actor IS NOT NULL AND NOT public.uc_custom_journal_person(p_actor)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSE
  SELECT*INTO s FROM public.document_signatures WHERE id=(p_action->'address'->>'signature_id')::uuid AND organization_id=(p_action->'address'->>'organization_id')::uuid FOR SHARE NOWAIT;
  IF s.id IS NULL OR NOT public.uc_custom_journal_person(p_actor)
   OR NOT public.uc_signature_assurance_as_signature_actor_allowed(p_actor,s.id,false,true)
   OR NOT public.uc_signature_assurance_as_signature_action_allowed(p_actor,s.id,'sign')
   OR p_action->'address'->>'chosen_party'='sender'AND s.sender_user_id IS DISTINCT FROM p_actor
  THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 END IF;
 RETURN s;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_file_people(p_signature public.document_signatures)RETURNS TABLE(user_id uuid,relation text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT DISTINCT k.user_id,k.relation FROM(
  SELECT p_signature.recipient_user_id user_id,'recipient'::text relation
  UNION SELECT h.subject_user_id,'subject'FROM public.uc_signature_assurance_streams h WHERE h.organization_id=p_signature.organization_id AND h.kind='signature'AND h.entity_id=p_signature.id
  UNION SELECT p.user_id,p.relation FROM public.uc_signature_assurance_participants p WHERE p.organization_id=p_signature.organization_id AND p.object_kind='stream'AND p.object_id=p_signature.id AND p.relation<>'staff_attribution'
  UNION SELECT d.student_user_id,'subject'FROM public.group_documents d WHERE d.id=p_signature.document_id AND d.organization_id=p_signature.organization_id
  UNION SELECT d.user_id,'subject'FROM public.education_document_records d WHERE d.id=p_signature.document_id AND d.organization_id=p_signature.organization_id
  UNION SELECT d.student_user_id,'subject'FROM public.org_contracts d WHERE d.id=p_signature.document_id AND d.organization_id=p_signature.organization_id
  UNION SELECT public.storage_try_uuid(item->>'user_id'),'subject'FROM public.org_contracts d CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.students)='array'THEN d.students ELSE'[]'::jsonb END)item WHERE d.id=p_signature.document_id AND d.organization_id=p_signature.organization_id
  UNION SELECT e.user_id,'subject'FROM public.student_documents d JOIN public.enrollments e ON e.id=d.enrollment_id JOIN public.courses c ON c.id=e.course_id WHERE d.id=p_signature.document_id AND c.organization_id=p_signature.organization_id
 )k WHERE k.user_id IS NOT NULL
$fn$;

CREATE FUNCTION public.uc_signature_assurance_file_fence(p_signature public.document_signatures,p_actor uuid,p_write boolean,p_previous_subject uuid DEFAULT NULL,p_previous_recipient uuid DEFAULT NULL,p_previous_people uuid[] DEFAULT NULL) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE people uuid[];groups uuid[];
BEGIN
 -- Tiny DB phases only: prevent absent-row role-restriction/owner-overlap phantoms.
 -- No lock is claimed to survive a service context/HTTP download boundary.
 LOCK TABLE public.org_staff,public.admin_staff IN SHARE MODE NOWAIT;
 PERFORM 1 FROM public.group_documents d WHERE d.id=p_signature.document_id AND d.organization_id=p_signature.organization_id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.education_document_records d WHERE d.id=p_signature.document_id AND d.organization_id=p_signature.organization_id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_contracts d WHERE d.id=p_signature.document_id AND d.organization_id=p_signature.organization_id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.student_documents d WHERE d.id=p_signature.document_id FOR SHARE NOWAIT;
 SELECT array_agg(DISTINCT user_id ORDER BY user_id)INTO people FROM(
  SELECT p.user_id FROM public.uc_signature_assurance_file_people(p_signature)p UNION SELECT p_previous_subject UNION SELECT p_previous_recipient UNION SELECT unnest(coalesce(p_previous_people,'{}'::uuid[]))
 )known WHERE user_id IS NOT NULL;
 PERFORM public.uc_signature_assurance_fence(p_signature.organization_id,coalesce(people,'{}'::uuid[]),p_write,NULL,NULL,p_actor);
 PERFORM 1 FROM public.profiles WHERE user_id=ANY(array_append(coalesce(people,'{}'::uuid[]),p_actor))FOR SHARE NOWAIT;
 PERFORM 1 FROM auth.users WHERE id=ANY(array_append(coalesce(people,'{}'::uuid[]),p_actor))FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_custom_roles r JOIN public.org_staff s ON s.custom_role_id=r.id WHERE s.user_id=p_actor AND s.organization_id=p_signature.organization_id FOR SHARE OF r NOWAIT;
 SELECT array_agg(DISTINCT group_id ORDER BY group_id)INTO groups FROM(
  SELECT group_id FROM public.group_documents WHERE id=p_signature.document_id AND organization_id=p_signature.organization_id
  UNION SELECT group_id FROM public.education_document_records WHERE id=p_signature.document_id AND organization_id=p_signature.organization_id
  UNION SELECT student_group_id FROM public.org_contracts WHERE id=p_signature.document_id AND organization_id=p_signature.organization_id
 )known WHERE group_id IS NOT NULL;
 PERFORM 1 FROM public.student_groups WHERE organization_id=p_signature.organization_id AND id=ANY(coalesce(groups,'{}'::uuid[]))FOR SHARE NOWAIT;
 PERFORM 1 FROM public.student_group_memberships WHERE organization_id=p_signature.organization_id AND group_id=ANY(coalesce(groups,'{}'::uuid[]))AND user_id=ANY(coalesce(people,'{}'::uuid[]))FOR SHARE NOWAIT;
 PERFORM 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=p_signature.organization_id AND e.user_id=ANY(coalesce(people,'{}'::uuid[]))FOR SHARE OF e,c NOWAIT;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_object_snapshot(p_bucket text,p_path text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE o storage.objects;a jsonb;b jsonb;sz bigint;other_sz bigint;m text;other_m text;commitment jsonb;
BEGIN
 SELECT*INTO o FROM storage.objects WHERE bucket_id=p_bucket AND name=p_path FOR SHARE NOWAIT;
 IF o.id IS NULL OR o.updated_at IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 a:=o.metadata->'size';b:=o.metadata->'contentLength';
 IF a IS NOT NULL AND a<>'null'::jsonb THEN
  IF jsonb_typeof(a)NOT IN('number','string')OR(a#>>'{}')!~'^[0-9]{1,12}$'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;sz:=(a#>>'{}')::bigint;
 END IF;
 IF b IS NOT NULL AND b<>'null'::jsonb THEN
  IF jsonb_typeof(b)NOT IN('number','string')OR(b#>>'{}')!~'^[0-9]{1,12}$'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;other_sz:=(b#>>'{}')::bigint;
 END IF;
 IF sz IS NOT NULL AND other_sz IS NOT NULL AND sz<>other_sz THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;sz:=coalesce(sz,other_sz);
 IF sz IS NOT NULL AND(sz<1 OR sz>20971520)THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 m:=lower(btrim(split_part(o.metadata->>'mimetype',';',1)));other_m:=lower(btrim(split_part(o.metadata->>'contentType',';',1)));
 IF m IS NOT NULL AND m!~'^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$'OR other_m IS NOT NULL AND other_m!~'^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$'OR m IS NOT NULL AND other_m IS NOT NULL AND m<>other_m THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 m:=coalesce(m,other_m);IF length(m)>200 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 commitment:=jsonb_build_object('id',o.id,'bucket_id',o.bucket_id,'name',o.name,'owner',o.owner,'owner_id',o.owner_id,'updated_at',public.uc_signature_assurance_utc(o.updated_at),'metadata',o.metadata,'user_metadata',o.user_metadata);
 RETURN jsonb_build_object('object_id',o.id,'bucket',p_bucket,'path',p_path,'updated_at',public.uc_signature_assurance_utc(o.updated_at),'metadata_sha256',public.uc_signature_assurance_hash(commitment::text),'reported_size',sz,'reported_mime',m);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_file_context_private(p_action jsonb,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;r public.signature_revisions;head public.uc_signature_assurance_streams;revision_id uuid;html text;locator text;path text;bucket text:='external-contracts';party text;people uuid[];source jsonb;object_snapshot jsonb;
BEGIN
 s:=public.uc_signature_assurance_file_actor(p_action,p_actor);
 SELECT*INTO head FROM public.uc_signature_assurance_streams WHERE organization_id=s.organization_id AND kind='signature'AND entity_id=s.id;
 PERFORM public.uc_signature_assurance_file_fence(s,p_actor,false);
 s:=public.uc_signature_assurance_file_actor(p_action,p_actor);
 revision_id:=CASE WHEN s.status='signed'THEN coalesce(s.signed_revision_id,s.current_revision_id)ELSE s.current_revision_id END;
 IF revision_id IS NOT NULL THEN
  SELECT*INTO r FROM public.signature_revisions WHERE id=revision_id AND signature_id=s.id FOR SHARE NOWAIT;
  IF r.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;html:=r.document_html;locator:=r.file_url;
 ELSE html:=s.document_html;locator:=s.document_snapshot_url;END IF;
 IF html IS NULL OR public.uc_signature_assurance_hash(html)IS DISTINCT FROM p_action->>'document_html_sha256'
  OR revision_id IS DISTINCT FROM public.storage_try_uuid(p_action->>'expected_document_revision_id')THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF p_action->>'purpose'='scan'THEN
  -- New unissued scan integration remains separate. Only an already signature-bound
  -- exact immutable scan can be verified by this new generic private proof helper.
  IF s.status<>'signed'OR s.handwritten_scan_path IS DISTINCT FROM p_action->>'scan_path'THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;locator:=s.handwritten_scan_path;
 ELSIF s.status='signed'AND s.signed_source_path IS NOT NULL THEN bucket:=s.signed_source_bucket;locator:=s.signed_source_path;END IF;
 IF bucket NOT IN('external-contracts','signed-documents')OR locator IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 path:=public.uc_signature_locator_key(locator,bucket);
 -- Historical URL aliases need separate exact-origin review, never an assumed origin.
 -- New canonical raw-key writes work; ordinary legacy reads remain unchanged.
 IF path IS NULL OR path IS DISTINCT FROM locator OR NOT public.uc_signature_object_bound(s.id,bucket,path)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF p_action->'address'->>'kind'='authenticated_signature'AND NOT public.uc_signature_assurance_as_signature_storage_read(p_actor,bucket,path)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 party:=CASE WHEN p_action->'address'->>'kind'='invitation'THEN'recipient'ELSE p_action->'address'->>'chosen_party'END;
 source:=jsonb_build_object('organization_id',s.organization_id,'signature_id',s.id,'chosen_party',party,'document_revision_id',revision_id,'document_html_sha256',public.uc_signature_assurance_hash(html),'purpose',p_action->>'purpose','bucket',bucket,'path',path);
 object_snapshot:=public.uc_signature_assurance_object_snapshot(bucket,path);
 RETURN jsonb_build_object('version',1,'ok',true,'kind','file_context','source',source,'object',object_snapshot);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_file_proof_receipt(p_row public.uc_signature_assurance_file_proofs,p_replay boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('version',1,'ok',true,'kind','file_verified','verification_request_id',p_row.verification_request_id,'verification_record_id',p_row.id,'outcome',CASE WHEN p_replay THEN'replayed'ELSE'applied'END,'verified_at',public.uc_signature_assurance_utc(p_row.verified_at),'source',p_row.proof->'source','object',p_row.proof->'object_after','file',p_row.proof->'file')
$fn$;

CREATE FUNCTION public.uc_signature_assurance_attest_file_private(p_action jsonb,p_actor uuid,p_proof jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;head public.uc_signature_assurance_streams;ctx jsonb;stored public.uc_signature_assurance_file_proofs;request_id uuid;digest text;people uuid[];object_snapshot jsonb;file jsonb;source jsonb;new_id uuid:=gen_random_uuid();party text;
BEGIN
 s:=public.uc_signature_assurance_file_actor(p_action,p_actor);
 IF p_action->>'action'IS DISTINCT FROM'attest_file'THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 request_id:=(p_action->>'verification_request_id')::uuid;digest:=public.uc_signature_assurance_hash(jsonb_build_object('actor_user_id',p_actor,'action',p_action)::text);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_signature_source_verification:'||s.organization_id::text||':'||request_id::text,0))THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 SELECT*INTO stored FROM public.uc_signature_assurance_file_proofs WHERE organization_id=s.organization_id AND verification_request_id=request_id FOR SHARE NOWAIT;
 SELECT*INTO head FROM public.uc_signature_assurance_streams WHERE organization_id=s.organization_id AND kind='signature'AND entity_id=s.id;
 -- A replay remains bound to every original non-attribution subject. Current
 -- editable contracts/recipients cannot erase an earlier proof's privacy scope.
 PERFORM 1 FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=stored.id AND organization_id=s.organization_id AND relation<>'staff_attribution' FOR SHARE NOWAIT;
 SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=stored.id AND organization_id=s.organization_id AND relation<>'staff_attribution';
 PERFORM public.uc_signature_assurance_file_fence(s,p_actor,true,stored.subject_user_id,stored.recipient_user_id,people);
 s:=public.uc_signature_assurance_file_actor(p_action,p_actor);
 IF stored.id IS NOT NULL THEN
  IF stored.request_sha256 IS DISTINCT FROM digest OR stored.actor_user_id IS DISTINCT FROM p_actor THEN PERFORM public.uc_signature_assurance_error('REQUEST_CONFLICT');END IF;
  -- Replay is the original immutable receipt, not a reinterpretation of newer bytes.
  RETURN public.uc_signature_assurance_file_proof_receipt(stored,true);
 END IF;
 IF p_proof IS NULL OR p_proof='null'::jsonb THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF NOT public.uc_signature_assurance_shape(p_proof,ARRAY['assurance','source','object_before','file','object_after'])OR p_proof->>'assurance'IS DISTINCT FROM'trusted_service_reread'
  OR p_proof->'object_before'IS DISTINCT FROM p_proof->'object_after'THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ctx:=public.uc_signature_assurance_file_context_private(p_action,p_actor);source:=ctx->'source';object_snapshot:=ctx->'object';file:=p_proof->'file';
 IF source IS DISTINCT FROM p_proof->'source'OR object_snapshot IS DISTINCT FROM p_proof->'object_after'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF NOT public.uc_signature_assurance_shape(file,ARRAY['bucket','path','sha256','bytes','mime'])OR NOT public.uc_signature_assurance_sha(file->'sha256')OR NOT public.uc_signature_assurance_integer(file->'bytes',1,20971520)
  OR file->>'bucket'IS DISTINCT FROM source->>'bucket'OR file->>'path'IS DISTINCT FROM source->>'path'
  OR NOT public.uc_signature_assurance_text(file->'mime',200)OR file->>'mime'!~'^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$'
  OR object_snapshot->'reported_size'<>'null'::jsonb AND object_snapshot->'reported_size'IS DISTINCT FROM file->'bytes'
  OR object_snapshot->'reported_mime'<>'null'::jsonb AND object_snapshot->'reported_mime'IS DISTINCT FROM file->'mime'
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF p_action->>'purpose'='scan'AND(s.handwritten_scan_hash IS NULL OR s.handwritten_scan_hash IS DISTINCT FROM file->>'sha256')
  OR p_action->>'purpose'='source'AND s.status='signed'AND s.signed_source_path IS NOT NULL AND(s.signed_source_hash IS NULL OR s.signed_source_hash IS DISTINCT FROM file->>'sha256')
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 party:=source->>'chosen_party';
 INSERT INTO public.uc_signature_assurance_file_proof_tokens(transaction_id,proof_id,operation)VALUES(txid_current(),new_id,'append');
 INSERT INTO public.uc_signature_assurance_file_proofs(id,organization_id,verification_request_id,request_sha256,actor_user_id,signature_id,party_role,subject_user_id,recipient_user_id,proof)
 VALUES(new_id,s.organization_id,request_id,digest,p_actor,s.id,party,head.subject_user_id,s.recipient_user_id,p_proof)RETURNING*INTO stored;
 INSERT INTO public.uc_signature_assurance_file_proof_links(proof_id,organization_id,user_id,relation)
 SELECT new_id,s.organization_id,p.user_id,p.relation FROM public.uc_signature_assurance_file_people(s)p
 UNION SELECT new_id,s.organization_id,p_actor,'staff_attribution'WHERE p_actor IS NOT NULL;
 DELETE FROM public.uc_signature_assurance_file_proof_tokens WHERE transaction_id=txid_current()AND proof_id=new_id AND operation='append';
 RETURN public.uc_signature_assurance_file_proof_receipt(stored,false);
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
-- ACL close-out on all exact new functions/tables is generated into the combined
-- source-only I package, not an assumption that PostgreSQL default ACL is private.


-- UC022 fragment 25_source_verification_service.sql
-- Source-only narrow trusted byte-verification facade. No new signing event,
-- agreement, policy decision, signature status or qualified-signature conclusion.
CREATE FUNCTION public.uc_signature_assurance_verify_source_service(
 p_action jsonb,p_observed_actor_user_id uuid,p_request_ip inet DEFAULT NULL,
 p_request_user_agent text DEFAULT NULL,p_original_proof jsonb DEFAULT NULL,p_scan_proof jsonb DEFAULT NULL
)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='10000ms' SET lock_timeout='2000ms'AS $fn$
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL
  OR NOT public.uc_signature_assurance_active(p_observed_actor_user_id)
  OR p_action->'address'->>'kind'IS DISTINCT FROM'authenticated_signature'
  OR p_action->>'purpose'IS DISTINCT FROM'source'
  OR p_action->'scan_path'IS DISTINCT FROM'null'::jsonb
  OR p_request_ip IS NOT NULL OR p_request_user_agent IS NOT NULL OR coalesce(p_scan_proof,'null'::jsonb)IS DISTINCT FROM'null'::jsonb
 THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_signature_assurance_file_action(p_action);
 IF p_action->>'action'='file_context'THEN
  IF coalesce(p_original_proof,'null'::jsonb)IS DISTINCT FROM'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  RETURN public.uc_signature_assurance_file_context_private(p_action,p_observed_actor_user_id);
 ELSIF p_action->>'action'='attest_file'THEN
  RETURN public.uc_signature_assurance_attest_file_private(p_action,p_observed_actor_user_id,p_original_proof);
 END IF;
 PERFORM public.uc_signature_assurance_error('INVALID_INPUT');
END;$fn$;
-- The final composed ACL packet must keep all new helpers owner-only and expose
-- EXECUTE on this exact facade only to service_role. No grant is made here.


-- UC022 fragment 28_file_proof_privacy.sql
-- New private proof copies participate in retention review. This fragment does
-- not replace an old account-deletion helper or delete retained evidence.
CREATE FUNCTION public.uc_signature_assurance_file_proof_personal_counts(p_user uuid)RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',table_name,'column','signature_proof_retention_review_required','count',n)ORDER BY table_name),'[]'::jsonb)FROM(
  SELECT'uc_signature_assurance_file_proofs'::text table_name,count(*)n
  FROM public.uc_signature_assurance_file_proofs p
  WHERE p.actor_user_id=p_user OR p.subject_user_id=p_user OR p.recipient_user_id=p_user
   OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_file_proof_links l WHERE l.proof_id=p.id AND l.organization_id=p.organization_id AND l.user_id=p_user)
  UNION ALL
  SELECT'uc_signature_assurance_file_proof_links',count(*)FROM public.uc_signature_assurance_file_proof_links WHERE user_id=p_user
 )counts WHERE n>0
$fn$;

CREATE FUNCTION public.uc_signature_assurance_file_proof_retention_block(p_user uuid)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR current_setting('sintagma.account_deletion_erase_user',true)IS DISTINCT FROM p_user::text
  OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_user::text,42007))THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF public.uc_signature_assurance_file_proof_personal_counts(p_user)<>'[]'::jsonb THEN
  RAISE EXCEPTION 'SIGNATURE_PROOF_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';
 END IF;
END;$fn$;
-- Full integration must append the count and call the block BEFORE the first
-- then-current UC020/K erasure mutation. No old K body is copied over here.


-- UC022 fragment 30_private_acl.sql
-- Source-only exact new-object closeout. Never alters default ACL or old objects.
DO $private_closeout$
DECLARE fn record;gr record;rel record;found integer:=0;
BEGIN
 FOR fn IN SELECT p.oid,p.proowner,p.proacl,p.oid::regprocedure identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(ARRAY['uc_signature_assurance_error','uc_signature_assurance_hash','uc_signature_assurance_shape','uc_signature_assurance_text','uc_signature_assurance_uuid','uc_signature_assurance_sha','uc_signature_assurance_integer','uc_signature_assurance_classification','uc_signature_assurance_selection','uc_signature_assurance_terms','uc_signature_assurance_active','uc_signature_assurance_date','uc_signature_assurance_legal_source','uc_signature_assurance_policy_body','uc_signature_assurance_resolve_selection','uc_signature_assurance_disclose_selection','uc_signature_assurance_actor','uc_signature_assurance_authority','uc_signature_assurance_stream','uc_signature_assurance_track','uc_signature_assurance_own_current','uc_signature_assurance_subject_read','uc_signature_assurance_signature_read','uc_signature_assurance_signature_write','uc_signature_assurance_fence','uc_signature_assurance_token','uc_signature_assurance_immutable','uc_signature_assurance_utc','uc_signature_assurance_empty_authority','uc_signature_assurance_policy_eligible','uc_signature_assurance_policy_read','uc_signature_assurance_project_authority','uc_signature_assurance_project_policy','uc_signature_assurance_request','uc_signature_assurance_receipt','uc_signature_assurance_record_request','uc_signature_assurance_append','uc_signature_assurance_save_policy','uc_signature_assurance_decide_policy','uc_signature_assurance_project_agreement','uc_signature_assurance_project_consent','uc_signature_assurance_project_legacy_agreement','uc_signature_assurance_project_legacy_consent','uc_signature_assurance_render_terms','uc_signature_assurance_accept_agreement','uc_signature_assurance_confirm_consent','uc_signature_assurance_withdraw_consent','uc_signature_assurance_as_can_access_organization','uc_signature_assurance_as_document_teacher_limited','uc_signature_assurance_as_document_scope_allowed','uc_signature_assurance_as_document_record_scope','uc_signature_assurance_as_document_contract_scope','uc_signature_assurance_as_document_signature_source_scope','uc_signature_assurance_as_document_signature_scope','uc_signature_assurance_as_document_signature_read_scope','uc_signature_assurance_as_document_has_action','uc_signature_assurance_as_document_action_allowed','uc_signature_assurance_as_document_commercial_creation_allowed','uc_signature_assurance_as_signature_commercial_sender_allowed','uc_signature_assurance_as_signature_action_allowed','uc_signature_assurance_as_signature_actor_allowed','uc_signature_assurance_as_signature_file_scope','uc_signature_assurance_as_signature_storage_read','uc_signature_assurance_decode_probe','uc_signature_assurance_credential_source','uc_signature_assurance_safe_authenticated_input','uc_signature_assurance_read_html_fields','uc_signature_assurance_file_proof_immutable','uc_signature_assurance_file_proof_link_guard','uc_signature_assurance_file_action','uc_signature_assurance_file_actor','uc_signature_assurance_file_people','uc_signature_assurance_file_fence','uc_signature_assurance_object_snapshot','uc_signature_assurance_file_context_private','uc_signature_assurance_file_proof_receipt','uc_signature_assurance_attest_file_private','uc_signature_assurance_verify_source_service','uc_signature_assurance_file_proof_personal_counts','uc_signature_assurance_file_proof_retention_block'])LOOP
  found:=found+1;
  EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',fn.identity);
  FOR gr IN SELECT DISTINCT x.grantee FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner)))x WHERE x.grantee<>fn.proowner AND x.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I',fn.identity,pg_get_userbyid(gr.grantee));
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x WHERE p.oid=fn.oid AND x.grantee<>p.proowner)THEN RAISE EXCEPTION 'UC022_NEW_HELPER_ACL_NOT_CLOSED';END IF;
 END LOOP;
 IF found<>80 THEN RAISE EXCEPTION 'UC022_NEW_HELPER_COUNT_MISMATCH';END IF;
 FOR rel IN SELECT c.oid,c.relname,c.relowner,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname IN('uc_signature_assurance_file_proofs','uc_signature_assurance_file_proof_tokens','uc_signature_assurance_file_proof_links')LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',rel.relname);
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',rel.relname);
  FOR gr IN SELECT DISTINCT x.grantee FROM aclexplode(coalesce(rel.relacl,acldefault('r',rel.relowner)))x WHERE x.grantee<>rel.relowner AND x.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',rel.relname,pg_get_userbyid(gr.grantee));
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x WHERE c.oid=rel.oid AND x.grantee<>c.relowner)THEN RAISE EXCEPTION 'UC022_NEW_PROOF_TABLE_ACL_NOT_CLOSED';END IF;
 END LOOP;
END;$private_closeout$;
GRANT EXECUTE ON FUNCTION public.uc_signature_assurance_verify_source_service(jsonb,uuid,inet,text,jsonb,jsonb)TO service_role;


-- UC022 fragment 40_document_capture.sql
-- S2 AUTHORING: authenticated capture for the exact canonical signature source.
-- This is not part of frozen S1 or a released migration. The full dispatcher,
-- issued org-documents bridge and final S2 ACL/native tests are still required.
CREATE FUNCTION public.uc_signature_assurance_capture_document(
 p_org uuid,p_signature uuid,p_party text,p_expected_document_revision uuid,p_expected_html_sha256 text
)RETURNS public.uc_signature_assurance_document_snapshots
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout='2000ms'AS $fn$
DECLARE s public.document_signatures;r public.signature_revisions;head public.uc_signature_assurance_streams;
 proof public.uc_signature_assurance_file_proofs;captured public.uc_signature_assurance_document_snapshots;
 html text;locator text;key text;bucket text:='external-contracts';revision_id uuid;object_snapshot jsonb;
 original_file jsonb;new_id uuid:=gen_random_uuid();people uuid[];prior_people uuid[];primary_subject uuid;person record;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_active()
  OR p_party NOT IN('sender','recipient')OR p_party IS NULL OR p_org IS NULL OR p_signature IS NULL
  OR NOT public.uc_signature_assurance_sha(to_jsonb(p_expected_html_sha256))THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_signature_assurance_signature_write(p_org,p_signature)
  OR NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT *INTO s FROM public.document_signatures WHERE id=p_signature AND organization_id=p_org FOR SHARE NOWAIT;
 IF s.id IS NULL OR s.deleted_at IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 -- Previously closed/legacy-signed rows cannot acquire a new canonical signing
 -- assurance merely by creating another snapshot or repeating an old request.
 IF s.status IN('signed','rejected','expired')OR s.signed_at IS NOT NULL OR p_party='sender'AND s.sender_signed_at IS NOT NULL
  THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 IF s.expires_at IS NOT NULL AND s.expires_at<=clock_timestamp()THEN PERFORM public.uc_signature_assurance_error('EXPIRED');END IF;
 SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_file_people(s);
 PERFORM public.uc_signature_assurance_file_fence(s,auth.uid(),true,NULL,NULL,people);
 IF NOT public.uc_signature_assurance_signature_write(p_org,p_signature)
  OR NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 revision_id:=s.current_revision_id;
 IF revision_id IS NOT NULL THEN
  SELECT *INTO r FROM public.signature_revisions WHERE id=revision_id AND signature_id=s.id FOR SHARE NOWAIT;
  IF r.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  html:=r.document_html;locator:=r.file_url;
 ELSE html:=s.document_html;locator:=s.document_snapshot_url;END IF;
 IF revision_id IS DISTINCT FROM p_expected_document_revision OR html IS NULL OR octet_length(html)>1000000
  OR public.uc_signature_assurance_hash(html)IS DISTINCT FROM p_expected_html_sha256
  THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF locator IS NOT NULL THEN
  key:=public.uc_signature_locator_key(locator,bucket);
  IF key IS NULL OR key IS DISTINCT FROM locator OR NOT public.uc_signature_object_bound(s.id,bucket,key)
   OR NOT public.uc_signature_storage_read(bucket,key)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  object_snapshot:=public.uc_signature_assurance_object_snapshot(bucket,key);
  SELECT *INTO proof FROM public.uc_signature_assurance_file_proofs p
   WHERE p.organization_id=p_org AND p.signature_id=p_signature AND p.party_role=p_party
    AND p.proof->'source'->'document_revision_id'IS NOT DISTINCT FROM coalesce(to_jsonb(revision_id),'null'::jsonb)
    AND p.proof->'source'->>'document_html_sha256'=p_expected_html_sha256 AND p.proof->'source'->>'purpose'='source'
    AND p.proof->'source'->>'bucket'=bucket AND p.proof->'source'->>'path'=key
    AND p.proof->'object_after'=object_snapshot
   ORDER BY p.verified_at DESC,p.id DESC LIMIT 1 FOR SHARE NOWAIT;
  IF proof.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  PERFORM 1 FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=proof.id AND organization_id=p_org AND relation<>'staff_attribution'FOR SHARE NOWAIT;
  SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO prior_people FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=proof.id AND organization_id=p_org AND relation<>'staff_attribution';
  PERFORM public.uc_signature_assurance_file_fence(s,auth.uid(),true,proof.subject_user_id,proof.recipient_user_id,prior_people);
  original_file:=proof.proof->'file';
 END IF;
 head:=public.uc_signature_assurance_stream(p_org,'signature',p_signature);
 SELECT CASE WHEN count(DISTINCT user_id)=1 THEN min(user_id::text)::uuid END INTO primary_subject
  FROM public.uc_signature_assurance_file_people(s)WHERE relation='subject';
 PERFORM public.uc_signature_assurance_token('document',new_id);
 INSERT INTO public.uc_signature_assurance_document_snapshots(id,organization_id,signature_id,party_role,document_revision_id,html_text,html_sha256,original_file,source_file_state,subject_user_id,recipient_user_id,captured_by)
  VALUES(new_id,p_org,p_signature,p_party,revision_id,html,p_expected_html_sha256,original_file,CASE WHEN original_file IS NULL THEN'not_present'ELSE'verified_bytes'END,primary_subject,s.recipient_user_id,auth.uid())RETURNING *INTO captured;
 FOR person IN SELECT user_id,relation FROM public.uc_signature_assurance_file_people(s)LOOP
  PERFORM public.uc_signature_assurance_track(p_org,'document',new_id,person.user_id,person.relation);
  PERFORM public.uc_signature_assurance_track(p_org,'stream',p_signature,person.user_id,person.relation);
 END LOOP;
 FOR person IN SELECT unnest(coalesce(prior_people,'{}'::uuid[]))user_id LOOP
  PERFORM public.uc_signature_assurance_track(p_org,'document',new_id,person.user_id,'subject');
  PERFORM public.uc_signature_assurance_track(p_org,'stream',p_signature,person.user_id,'subject');
 END LOOP;
 PERFORM public.uc_signature_assurance_track(p_org,'document',new_id,auth.uid(),'staff_attribution');
 RETURN captured;
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;


-- UC022 fragment 41_signature_read_projections.sql
-- UC022 S2 source-only canonical reads. No public grants or old table mutations.
CREATE FUNCTION public.uc_signature_assurance_signature_fence(p_org uuid,p_signature uuid,p_write boolean DEFAULT false,p_request uuid DEFAULT NULL)RETURNS public.document_signatures
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;people uuid[];
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_signature_read(p_org,p_signature)
  OR p_write AND NOT public.uc_signature_assurance_signature_write(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT *INTO s FROM public.document_signatures WHERE id=p_signature AND organization_id=p_org FOR SHARE NOWAIT;
 IF s.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 -- Historical captured people remain in scope when mutable source rows or current
 -- memberships have changed. Staff attribution is deliberately not a subject link.
 SELECT coalesce(array_agg(DISTINCT person ORDER BY person),'{}'::uuid[])INTO people FROM(
  SELECT user_id person FROM public.uc_signature_assurance_file_people(s)
  UNION SELECT p.user_id FROM public.uc_signature_assurance_participants p WHERE p.organization_id=p_org AND p.relation<>'staff_attribution'AND(
   p.object_kind='stream'AND p.object_id=p_signature
   OR p.object_kind='binding'AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings b WHERE b.organization_id=p_org AND b.signature_id=p_signature AND b.id=p.object_id)
   OR p.object_kind='document'AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_document_snapshots d WHERE d.organization_id=p_org AND d.signature_id=p_signature AND d.id=p.object_id)
   OR p.object_kind='event'AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_events e WHERE e.organization_id=p_org AND e.signature_id=p_signature AND e.id=p.object_id)
   OR p.object_kind='private_manifest'AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_private_manifests m WHERE m.organization_id=p_org AND m.signature_id=p_signature AND m.id=p.object_id)
   OR p.object_kind='scoped_manifest'AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_scoped_manifests m WHERE m.organization_id=p_org AND m.signature_id=p_signature AND m.id=p.object_id))
  UNION SELECT l.user_id FROM public.uc_signature_assurance_file_proof_links l JOIN public.uc_signature_assurance_file_proofs f ON f.id=l.proof_id AND f.organization_id=l.organization_id WHERE f.organization_id=p_org AND f.signature_id=p_signature AND l.relation<>'staff_attribution'
  UNION SELECT d.subject_user_id FROM public.uc_signature_assurance_document_snapshots d WHERE d.organization_id=p_org AND d.signature_id=p_signature
  UNION SELECT d.recipient_user_id FROM public.uc_signature_assurance_document_snapshots d WHERE d.organization_id=p_org AND d.signature_id=p_signature
 )known WHERE person IS NOT NULL;
 PERFORM public.uc_signature_assurance_file_fence(s,auth.uid(),p_write,NULL,NULL,people);
 PERFORM public.uc_signature_assurance_fence(p_org,people,p_write,CASE WHEN p_write THEN p_signature ELSE NULL END,p_request);
 IF NOT public.uc_signature_assurance_signature_read(p_org,p_signature)
  OR p_write AND NOT public.uc_signature_assurance_signature_write(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 RETURN s;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_disclose_file(p_org uuid,p_signature uuid,p_file jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE literal text;can_source boolean;
BEGIN
 IF p_file IS NULL OR p_file='null'::jsonb THEN RETURN NULL;END IF;
 IF NOT public.uc_signature_assurance_shape(p_file,ARRAY['bucket','path','sha256','bytes','mime'])
  OR NOT coalesce(p_file->>'bucket'IN('external-contracts','signed-documents'),false)
  OR NOT public.uc_signature_assurance_text(p_file->'path',2000)OR NOT public.uc_signature_assurance_sha(p_file->'sha256')
  OR NOT public.uc_signature_assurance_integer(p_file->'bytes',1,20971520)OR NOT public.uc_signature_assurance_text(p_file->'mime',200)
  OR p_file->>'path'~'[?#\\[:cntrl:]]|://'OR EXISTS(SELECT 1 FROM unnest(string_to_array(p_file->>'path','/'))part WHERE part IN('.','..'))
 THEN PERFORM public.uc_signature_assurance_error('DEPENDENCY_UNAVAILABLE');END IF;
 IF NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 literal:=p_file::text;
 can_source:=coalesce(public.uc_signature_storage_read(p_file->>'bucket',p_file->>'path')AND public.uc_signature_object_bound(p_signature,p_file->>'bucket',p_file->>'path'),false);
 IF NOT can_source THEN RETURN jsonb_build_object('visibility','redacted','captured_reference_sha256',public.uc_signature_assurance_hash(literal),'value',NULL,'reason','current_file_scope');END IF;
 RETURN jsonb_build_object('visibility','available','captured_reference_json',literal,'captured_reference_sha256',public.uc_signature_assurance_hash(literal),'value',p_file);
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_project_document(p_org uuid,p_signature uuid,p_document uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.uc_signature_assurance_document_snapshots;content jsonb;
BEGIN
 PERFORM public.uc_signature_assurance_signature_fence(p_org,p_signature);
 SELECT *INTO d FROM public.uc_signature_assurance_document_snapshots WHERE id=p_document AND organization_id=p_org AND signature_id=p_signature FOR SHARE NOWAIT;
 IF d.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 content:=public.uc_signature_assurance_read_html_fields(p_org,p_signature,p_document);
 RETURN jsonb_build_object('id',d.id,'organization_id',p_org,'signature_id',p_signature,'party_role',d.party_role,'document_revision_id',d.document_revision_id,
  'html_text',content->'html_text','html_sha256',d.html_sha256,'content_visibility',content->'content_visibility',
  'original_file',public.uc_signature_assurance_disclose_file(p_org,p_signature,d.original_file),'source_file_state',d.source_file_state,'captured_at',public.uc_signature_assurance_utc(d.captured_at));
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_project_binding(p_org uuid,p_signature uuid,p_binding uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE b public.uc_signature_assurance_bindings;d public.uc_signature_assurance_document_snapshots;
BEGIN
 PERFORM public.uc_signature_assurance_signature_fence(p_org,p_signature);
 SELECT *INTO b FROM public.uc_signature_assurance_bindings WHERE id=p_binding AND organization_id=p_org AND signature_id=p_signature FOR SHARE NOWAIT;
 SELECT *INTO d FROM public.uc_signature_assurance_document_snapshots WHERE id=b.document_snapshot_id AND organization_id=p_org AND signature_id=p_signature AND party_role=b.party_role FOR SHARE NOWAIT;
 IF b.id IS NULL OR d.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 RETURN jsonb_build_object('id',b.id,'organization_id',p_org,'signature_id',p_signature,'party_role',b.party_role,'revision',b.revision,'document_snapshot_id',d.id,
  'document_revision_id',d.document_revision_id,'document_html_sha256',d.html_sha256,'original_file',public.uc_signature_assurance_disclose_file(p_org,p_signature,d.original_file),
  'classification',b.classification,'policy_version_id',b.policy_version_id,'policy_sha256',b.policy_sha256,'policy_decision_revision',b.policy_decision_revision,
  'agreement_sha256',b.agreement_sha256,'subject_user_id',b.subject_user_id,'recipient_user_id',b.recipient_user_id,'bound_at',public.uc_signature_assurance_utc(b.bound_at),'bound_by',b.bound_by);
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_project_signature_event(p_org uuid,p_signature uuid,p_event uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE e public.uc_signature_assurance_events;result jsonb;
BEGIN
 PERFORM public.uc_signature_assurance_signature_fence(p_org,p_signature);
 SELECT *INTO e FROM public.uc_signature_assurance_events WHERE id=p_event AND organization_id=p_org AND signature_id=p_signature AND stream_kind='signature'FOR SHARE NOWAIT;
 IF e.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 IF public.uc_signature_assurance_credential_source(p_org,(e.payload-'original_file'-'scan_file'-'authority')::text)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 result:=e.payload||jsonb_build_object('original_file',public.uc_signature_assurance_disclose_file(p_org,p_signature,e.payload->'original_file'),
  'scan_file',public.uc_signature_assurance_disclose_file(p_org,p_signature,e.payload->'scan_file'),
  'authority',public.uc_signature_assurance_project_authority(p_org,e.payload->'authority'));
 RETURN result;
END;$fn$;


-- UC022 fragment 42_signature_context.sql
-- UC022 S2 source-only context; capabilities derive existing current permissions.
CREATE FUNCTION public.uc_signature_assurance_capabilities(p_org uuid,p_signature uuid DEFAULT NULL,p_party text DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;active boolean;readable boolean;writable boolean;signable boolean;policy_read boolean;policy_write boolean;policy_sign boolean;
BEGIN
 active:=coalesce(auth.role()='authenticated'AND public.uc_signature_assurance_active(),false);
 policy_read:=active AND public.uc_document_action_allowed(p_org,'read',NULL,NULL);
 policy_write:=policy_read AND public.uc_document_action_allowed(p_org,'write',NULL,NULL);
 policy_sign:=policy_read AND public.uc_document_action_allowed(p_org,'sign',NULL,NULL);
 IF p_signature IS NOT NULL THEN
  SELECT *INTO s FROM public.document_signatures WHERE id=p_signature AND organization_id=p_org;
  readable:=active AND s.id IS NOT NULL AND public.uc_signature_assurance_signature_read(p_org,p_signature);
  writable:=readable AND public.uc_signature_assurance_signature_write(p_org,p_signature);
  signable:=readable AND public.uc_signature_action_allowed(p_signature,'sign')AND s.deleted_at IS NULL AND s.signed_at IS NULL
   AND s.status NOT IN('signed','rejected','expired')AND(s.expires_at IS NULL OR s.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_events terminal WHERE terminal.organization_id=p_org AND terminal.signature_id=p_signature AND terminal.party_role=p_party AND terminal.kind IN('sender_confirmed','account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked')); 
 END IF;
 RETURN jsonb_build_object('can_read',coalesce(readable,policy_read,false),'can_draft_policy',coalesce(policy_write,false),
  'can_review_policy',coalesce(policy_sign,false),'can_accept_policy',coalesce(policy_sign,false),
  'can_bind_signature',coalesce(writable AND signable AND(p_party<>'sender'OR s.sender_signed_at IS NULL AND s.sender_user_id=auth.uid()),false),
  'can_confirm_account',coalesce(signable AND p_party='recipient'AND s.recipient_user_id=auth.uid(),false),
  'can_confirm_sender',coalesce(signable AND p_party='sender'AND s.sender_user_id=auth.uid()AND s.sender_signed_at IS NULL,false),
  'can_receive_scan',coalesce(signable AND p_party='recipient',false),
  'can_record_bearer_fact',false,'can_capture_receipt',coalesce(readable,false),
  'supported_methods',jsonb_build_array('graphic_asset','scan_received','bearer_invitation_confirmation','authenticated_account_confirmation'),
  'unsupported_methods',jsonb_build_array(jsonb_build_object('method','verified_email_challenge_confirmation','verified',false,'reason','VERIFIER_NOT_IMPLEMENTED'),
   jsonb_build_object('method','external_qualified_signature','verified',false,'reason','VERIFIER_NOT_IMPLEMENTED')));
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_current_document(p_org uuid,p_signature uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;r public.signature_revisions;html text;
BEGIN
 IF NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT *INTO s FROM public.document_signatures WHERE id=p_signature AND organization_id=p_org FOR SHARE NOWAIT;
 IF s.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 IF s.current_revision_id IS NOT NULL THEN
  SELECT *INTO r FROM public.signature_revisions WHERE id=s.current_revision_id AND signature_id=s.id FOR SHARE NOWAIT;
  IF r.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;html:=r.document_html;
 ELSE html:=s.document_html;END IF;
 IF html IS NULL OR octet_length(html)>1000000 THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 RETURN jsonb_build_object('document_revision_id',s.current_revision_id,'document_html_sha256',public.uc_signature_assurance_hash(html));
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_context(p_org uuid,p_signature uuid,p_party text)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;h public.uc_signature_assurance_streams;b public.uc_signature_assurance_bindings;
 e public.uc_signature_assurance_events;d public.uc_signature_assurance_document_snapshots;v public.uc_signature_assurance_policy_versions;
 decision public.uc_signature_assurance_policy_decisions;role_name text;current_document jsonb;caps jsonb;parties jsonb:='{}';
 missing text[];limits text[];purpose text;party_json jsonb;legacy boolean;closed boolean;
BEGIN
 IF p_party IS NULL OR p_party NOT IN('sender','recipient')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 s:=public.uc_signature_assurance_signature_fence(p_org,p_signature);
 current_document:=public.uc_signature_assurance_current_document(p_org,p_signature);caps:=public.uc_signature_assurance_capabilities(p_org,p_signature,p_party);
 SELECT *INTO h FROM public.uc_signature_assurance_streams WHERE organization_id=p_org AND kind='signature'AND entity_id=p_signature FOR SHARE NOWAIT;
 legacy:=s.signed_at IS NOT NULL OR s.sender_signed_at IS NOT NULL OR s.signed_source_hash IS NOT NULL OR s.handwritten_scan_hash IS NOT NULL;
 closed:=s.deleted_at IS NOT NULL OR s.signed_at IS NOT NULL OR s.status IN('signed','rejected','expired');
 FOREACH role_name IN ARRAY ARRAY['sender','recipient']LOOP
  SELECT *INTO b FROM public.uc_signature_assurance_bindings WHERE organization_id=p_org AND signature_id=p_signature AND party_role=role_name ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
  SELECT *INTO e FROM public.uc_signature_assurance_events WHERE organization_id=p_org AND signature_id=p_signature AND stream_kind='signature'AND party_role=role_name ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
  missing:='{}';limits:=ARRAY['Показываются сохранённые факты платформы. Криптографическая проверка подписи и автоматический вывод о юридической действительности не выполнялись.'];purpose:='unconfigured';
  IF closed OR role_name='sender'AND s.sender_signed_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_events terminal WHERE terminal.organization_id=p_org AND terminal.signature_id=p_signature AND terminal.party_role=role_name AND terminal.kind IN('sender_confirmed','account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked'))THEN missing:=array_append(missing,'CLOSED');END IF;
  IF s.expires_at IS NOT NULL AND s.expires_at<=clock_timestamp()THEN missing:=array_append(missing,'EXPIRED');END IF;
  IF b.id IS NULL THEN
   missing:=missing||ARRAY['CLASSIFICATION_REQUIRED','POLICY_REQUIRED'];
   party_json:=jsonb_build_object('binding',NULL,'policy',NULL);
  ELSE
   SELECT *INTO v FROM public.uc_signature_assurance_policy_versions WHERE id=b.policy_version_id AND organization_id=p_org FOR SHARE NOWAIT;
   SELECT *INTO d FROM public.uc_signature_assurance_document_snapshots WHERE id=b.document_snapshot_id AND organization_id=p_org AND signature_id=p_signature AND party_role=role_name FOR SHARE NOWAIT;
   SELECT *INTO decision FROM public.uc_signature_assurance_policy_decisions WHERE policy_version_id=v.id AND organization_id=p_org ORDER BY stream_revision DESC LIMIT 1 FOR SHARE NOWAIT;
   IF v.id IS NULL OR d.id IS NULL OR decision.id IS NULL THEN PERFORM public.uc_signature_assurance_error('DEPENDENCY_UNAVAILABLE');END IF;
   purpose:=v.body->>'purpose';limits:=array_append(limits,v.body->>'limitations');
   IF NOT public.uc_signature_assurance_policy_eligible(p_org,v.id)THEN missing:=array_append(missing,'POLICY_NOT_ACCEPTED');END IF;
   IF b.policy_sha256 IS DISTINCT FROM v.body_sha256 OR b.policy_decision_revision IS DISTINCT FROM decision.stream_revision THEN missing:=array_append(missing,'POLICY_CHANGED');END IF;
   IF coalesce(to_jsonb(d.document_revision_id),'null'::jsonb)IS DISTINCT FROM current_document->'document_revision_id'OR d.html_sha256 IS DISTINCT FROM current_document->>'document_html_sha256'THEN missing:=array_append(missing,'SOURCE_CHANGED');END IF;
   IF d.source_file_state='unverified_reference'THEN missing:=array_append(missing,'SOURCE_UNAVAILABLE');END IF;
   IF d.original_file IS NOT NULL AND NOT coalesce(public.uc_signature_storage_read(d.original_file->>'bucket',d.original_file->>'path')AND public.uc_signature_object_bound(p_signature,d.original_file->>'bucket',d.original_file->>'path'),false)THEN missing:=array_append(missing,'SOURCE_UNAVAILABLE');END IF;
   IF d.original_file IS NOT NULL AND public.uc_signature_storage_read(d.original_file->>'bucket',d.original_file->>'path')AND public.uc_signature_object_bound(p_signature,d.original_file->>'bucket',d.original_file->>'path')AND NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_file_proofs proof WHERE proof.organization_id=p_org AND proof.signature_id=p_signature AND proof.party_role=role_name AND proof.proof->'file'=d.original_file AND proof.proof->'source'->>'purpose'='source'AND proof.proof->'source'->'document_revision_id'IS NOT DISTINCT FROM current_document->'document_revision_id'AND proof.proof->'source'->>'document_html_sha256'=current_document->>'document_html_sha256'AND proof.proof->'object_after'=public.uc_signature_assurance_object_snapshot(d.original_file->>'bucket',d.original_file->>'path'))THEN missing:=array_append(missing,'SOURCE_CHANGED');END IF;
   IF v.body->>'method'='authenticated_account_confirmation'AND(role_name='recipient'AND s.recipient_user_id IS DISTINCT FROM auth.uid()OR role_name='sender'AND s.sender_user_id IS DISTINCT FROM auth.uid())THEN missing:=array_append(missing,'IDENTITY_MISMATCH');END IF;
   IF v.body->>'purpose'='account_pep'AND NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_agreements a WHERE a.organization_id=p_org AND a.subject_user_id=auth.uid()AND a.policy_version_id=v.id AND a.policy_sha256=v.body_sha256 AND a.terms->>'sha256'=v.body->'agreement'->>'sha256')THEN missing:=array_append(missing,'AGREEMENT_REQUIRED');END IF;
   party_json:=jsonb_build_object('binding',public.uc_signature_assurance_project_binding(p_org,p_signature,b.id),'policy',public.uc_signature_assurance_project_policy(p_org,v.id));
  END IF;
  SELECT coalesce(array_agg(DISTINCT item ORDER BY item),'{}'::text[])INTO missing FROM unnest(missing)item;
  party_json:=party_json||jsonb_build_object('party_role',role_name,'latest_party_event_revision',coalesce(e.revision,0),
   'conclusion',coalesce(e.payload->>'conclusion',CASE WHEN legacy AND(role_name='sender'AND s.sender_signed_at IS NOT NULL OR role_name='recipient'AND s.signed_at IS NOT NULL)THEN'legacy_unknown'ELSE'not_confirmed'END),
   'requirements',jsonb_build_object('eligible',cardinality(missing)=0,'missing',to_jsonb(missing),'purpose',purpose,'limitations',to_jsonb(limits)));
  parties:=parties||jsonb_build_object(role_name,party_json);
 END LOOP;
 RETURN jsonb_build_object('organization_id',p_org,'signature_id',p_signature,'current_document_revision_id',current_document->'document_revision_id',
  'current_document_html_sha256',current_document->>'document_html_sha256','legacy_status',s.status,'legacy_method',s.signature_method,'chosen_party',p_party,
  'parties',parties,'latest_event_revision',coalesce(h.revision,0),'capabilities',caps,
  'latest_receipt_id',(SELECT m.source_manifest_id FROM public.uc_signature_assurance_scoped_manifests m WHERE m.organization_id=p_org AND m.signature_id=p_signature ORDER BY m.captured_at DESC,m.id DESC LIMIT 1),
  'legacy_evidence_available',legacy);
END;$fn$;


-- UC022 fragment 43_signature_binding.sql
-- UC022 S2 canonical binding; new evidence only, no legacy signed facts rewritten.
CREATE FUNCTION public.uc_signature_assurance_bind_signature(p_org uuid,p_request uuid,p_expected integer,p_action jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;h public.uc_signature_assurance_streams;v public.uc_signature_assurance_policy_versions;
 decision public.uc_signature_assurance_policy_decisions;d public.uc_signature_assurance_document_snapshots;b public.uc_signature_assurance_bindings;
 event_row public.uc_signature_assurance_events;request_row public.uc_signature_assurance_requests;new_id uuid:=gen_random_uuid();digest text;sig uuid;party text;person record;item jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_active()THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR p_expected=2147483647
  OR NOT public.uc_signature_assurance_shape(p_action,ARRAY['action','signature_id','party_role','document_revision_id','document_html_sha256','classification','policy_version_id'])
  OR p_action->>'action'IS DISTINCT FROM'bind_signature'OR NOT public.uc_signature_assurance_uuid(p_action->'signature_id')
  OR NOT public.uc_signature_assurance_uuid(p_action->'policy_version_id')OR NOT public.uc_signature_assurance_sha(p_action->'document_html_sha256')
  OR NOT public.uc_signature_assurance_classification(p_action->'classification')
  OR p_action->'document_revision_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_action->'document_revision_id')
  OR NOT coalesce(p_action->>'party_role'IN('sender','recipient'),false)
  OR(p_action->>'party_role'='sender')IS DISTINCT FROM(p_action->'classification'->>'party_role'='sender')
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 PERFORM public.uc_signature_assurance_safe_authenticated_input(p_org,p_action);
 sig:=(p_action->>'signature_id')::uuid;party:=p_action->>'party_role';
 digest:=public.uc_signature_assurance_hash(jsonb_build_object('organization_id',p_org,'expected_revision',p_expected,'action',p_action)::text);
 s:=public.uc_signature_assurance_signature_fence(p_org,sig,true,p_request);
 IF NOT public.uc_signature_action_allowed(sig,'sign')THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 request_row:=public.uc_signature_assurance_request(p_org,p_request,digest);
 IF request_row.request_id IS NOT NULL THEN
  IF request_row.action IS DISTINCT FROM'bind_signature'OR request_row.stream_id IS DISTINCT FROM sig OR request_row.party_role IS DISTINCT FROM party THEN PERFORM public.uc_signature_assurance_error('REQUEST_CONFLICT');END IF;
  RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(request_row,true),'result',jsonb_build_object('kind','signature','context',public.uc_signature_assurance_context(p_org,sig,party)));
 END IF;
 IF s.deleted_at IS NOT NULL OR s.signed_at IS NOT NULL OR s.status IN('signed','rejected','expired')OR party='sender'AND s.sender_signed_at IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 IF s.expires_at IS NOT NULL AND s.expires_at<=clock_timestamp()THEN PERFORM public.uc_signature_assurance_error('EXPIRED');END IF;
 SELECT *INTO v FROM public.uc_signature_assurance_policy_versions WHERE id=(p_action->>'policy_version_id')::uuid AND organization_id=p_org FOR SHARE NOWAIT;
 IF v.id IS NULL OR NOT public.uc_signature_assurance_policy_read(p_org,v.id)THEN PERFORM public.uc_signature_assurance_error('POLICY_REQUIRED');END IF;
 IF NOT public.uc_signature_assurance_policy_eligible(p_org,v.id)THEN PERFORM public.uc_signature_assurance_error('POLICY_NOT_ACCEPTED');END IF;
 IF v.body->'classification'IS DISTINCT FROM p_action->'classification'THEN PERFORM public.uc_signature_assurance_error('CLASSIFICATION_REQUIRED');END IF;
 SELECT *INTO decision FROM public.uc_signature_assurance_policy_decisions WHERE organization_id=p_org AND policy_version_id=v.id ORDER BY stream_revision DESC LIMIT 1 FOR SHARE NOWAIT;
 IF decision.state IS DISTINCT FROM'centre_accepted'THEN PERFORM public.uc_signature_assurance_error('POLICY_NOT_ACCEPTED');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(v.body->'basis'->'document_references')LOOP PERFORM public.uc_signature_assurance_resolve_selection(p_org,item,true);END LOOP;
 h:=public.uc_signature_assurance_stream(p_org,'signature',sig);
 IF h.revision IS DISTINCT FROM p_expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 d:=public.uc_signature_assurance_capture_document(p_org,sig,party,(p_action->>'document_revision_id')::uuid,p_action->>'document_html_sha256');
 PERFORM public.uc_signature_assurance_token('binding',new_id);
 INSERT INTO public.uc_signature_assurance_bindings(id,organization_id,signature_id,party_role,revision,document_snapshot_id,policy_version_id,policy_sha256,policy_decision_revision,classification,agreement_sha256,subject_user_id,recipient_user_id,bound_by)
 VALUES(new_id,p_org,sig,party,h.revision+1,d.id,v.id,v.body_sha256,decision.stream_revision,v.body->'classification',v.body->'agreement'->>'sha256',d.subject_user_id,d.recipient_user_id,auth.uid())RETURNING *INTO b;
 event_row:=public.uc_signature_assurance_append(p_org=>p_org,p_stream=>h.id,p_expected=>p_expected,p_request=>p_request,p_kind=>'signature_bound',p_method=>v.body->>'method',
  p_reason=>'Зафиксированы точная версия документа, сторона и принятая редакция правил. Подпись ещё не подтверждена.',p_authority=>public.uc_signature_assurance_empty_authority(),
  p_policy=>v.id,p_signature=>sig,p_document=>d.id,p_party_role=>party,p_binding=>b.id);
 request_row:=public.uc_signature_assurance_record_request(p_org,p_request,digest,'bind_signature',h.id,event_row.id,sig,event_row.revision,auth.uid(),party,b.id);
 FOR person IN SELECT user_id,relation FROM public.uc_signature_assurance_participants WHERE organization_id=p_org AND object_kind='document'AND object_id=d.id LOOP
  PERFORM public.uc_signature_assurance_track(p_org,'binding',b.id,person.user_id,person.relation);
  PERFORM public.uc_signature_assurance_track(p_org,'event',event_row.id,person.user_id,person.relation);
  PERFORM public.uc_signature_assurance_track(p_org,'request',p_request,person.user_id,person.relation);
 END LOOP;
 RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(request_row),'result',jsonb_build_object('kind','signature','context',public.uc_signature_assurance_context(p_org,sig,party)));
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;


-- UC022 fragment 44_issued_source_bridge.sql
-- UC022 S2 source-only bridge to actual accepted K622 issued PDFs.
-- This separate descriptor is NOT a blanket third-bucket ExactFile permission.
-- It records the trusted issuance attestation; no new HTTP byte reread is claimed.
CREATE FUNCTION public.uc_signature_assurance_issued_source(p_org uuid,p_signature uuid,p_expected_record_revision bigint,p_expected_state_hash text)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout='2000ms'AS $fn$
DECLARE sig public.document_signatures;r public.education_document_records;state public.uc_education_issuance_states;
 item public.uc_education_issuance_preparation_items;v public.org_document_versions;o storage.objects;saved jsonb;artifact jsonb;people uuid[];
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_active()
  OR p_expected_record_revision IS NULL OR p_expected_record_revision NOT BETWEEN 1 AND 9007199254740991
  OR NOT public.uc_signature_assurance_sha(to_jsonb(p_expected_state_hash))THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 sig:=public.uc_signature_assurance_signature_fence(p_org,p_signature);
 SELECT *INTO r FROM public.education_document_records WHERE id=sig.document_id AND organization_id=p_org AND deleted_at IS NULL FOR SHARE NOWAIT;
 IF r.id IS NULL OR r.user_id IS NULL OR r.enrollment_id IS NULL OR NOT public.uc_education_issue_can(p_org,r.group_id,r.enrollment_id,r.user_id,r.course_id,'read')THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT *INTO state FROM public.uc_education_issuance_states WHERE record_id=r.id AND organization_id=p_org FOR SHARE NOWAIT;
 IF state.record_id IS NULL OR state.redacted OR state.proof IS NULL OR state.annulment IS NOT NULL OR state.artifact IS NULL OR state.artifact='null'::jsonb THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 -- Preserve all previously captured people while the current record and old events
 -- are locked; metadata correction cannot silently change the privacy subject.
 PERFORM 1 FROM public.uc_education_issuance_events WHERE organization_id=p_org AND record_id=r.id FOR SHARE NOWAIT;
 SELECT coalesce(array_agg(DISTINCT person ORDER BY person),'{}'::uuid[])INTO people FROM(
  SELECT r.user_id person UNION SELECT state.user_id UNION SELECT unnest(state.participant_ids)
  UNION SELECT e.user_id FROM public.uc_education_issuance_events e WHERE e.organization_id=p_org AND e.record_id=r.id
  UNION SELECT unnest(e.participant_ids)FROM public.uc_education_issuance_events e WHERE e.organization_id=p_org AND e.record_id=r.id
 )known WHERE person IS NOT NULL;
 PERFORM public.uc_signature_assurance_file_fence(sig,auth.uid(),false,r.user_id,sig.recipient_user_id,people);
 PERFORM public.uc_education_issue_fence(p_org,r.group_id,people);
 IF NOT public.uc_education_issue_can(p_org,r.group_id,r.enrollment_id,r.user_id,r.course_id,'read')OR NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF state.revision IS DISTINCT FROM p_expected_record_revision OR public.uc_education_issue_state_hash(r.id)IS DISTINCT FROM p_expected_state_hash
  OR state.user_id IS DISTINCT FROM r.user_id OR state.enrollment_id IS DISTINCT FROM r.enrollment_id OR state.course_id IS DISTINCT FROM r.course_id OR state.group_id IS DISTINCT FROM r.group_id
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 artifact:=state.artifact;
 IF NOT public.uc_admission_shape(artifact,ARRAY['preparation_id','item_id','input_revision','source','byte_sha256','byte_size','render_input_hash','template_byte_sha256','html_sha256','renderer','renderer_revision','output_review_id','output_review_revision'])
  OR NOT public.uc_signature_assurance_sha(artifact->'byte_sha256')OR NOT public.uc_signature_assurance_integer(artifact->'byte_size',1,20971520)
  OR NOT public.uc_signature_assurance_uuid(artifact->'item_id')OR NOT public.uc_signature_assurance_uuid(artifact->'preparation_id')
  OR artifact->>'renderer'IS DISTINCT FROM'browserless'OR artifact->>'renderer_revision'IS DISTINCT FROM'uc019-v1'
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 SELECT *INTO item FROM public.uc_education_issuance_preparation_items WHERE id=(artifact->>'item_id')::uuid AND preparation_id=(artifact->>'preparation_id')::uuid AND organization_id=p_org FOR SHARE NOWAIT;
 IF item.id IS NULL OR item.redacted OR item.final_record_id IS DISTINCT FROM r.id OR item.user_id IS DISTINCT FROM r.user_id OR item.enrollment_id IS DISTINCT FROM r.enrollment_id
  OR item.input_revision::text IS DISTINCT FROM artifact->>'input_revision'OR item.artifact IS NULL
  OR item.artifact->'source'IS DISTINCT FROM artifact->'source'OR item.artifact->'byte_sha256'IS DISTINCT FROM artifact->'byte_sha256'OR item.artifact->'byte_size'IS DISTINCT FROM artifact->'byte_size'
  OR item.artifact->'render_input_hash'IS DISTINCT FROM artifact->'render_input_hash'OR item.artifact->'html_sha256'IS DISTINCT FROM artifact->'html_sha256'OR item.artifact->'template_byte_sha256'IS DISTINCT FROM artifact->'template_byte_sha256'
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 PERFORM public.uc_education_issue_source_lock(p_org,artifact->'source');
 saved:=public.uc_education_artifact_saved_source(item.id);
 IF saved IS NULL OR saved->'source'IS DISTINCT FROM artifact->'source'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 SELECT *INTO v FROM public.org_document_versions WHERE organization_id=p_org AND document_id=(artifact->'source'->>'document_id')::uuid AND id=(artifact->'source'->>'version_id')::uuid FOR SHARE NOWAIT;
 SELECT *INTO o FROM storage.objects WHERE id=v.storage_object_id AND bucket_id='org-documents'AND name=v.file_path FOR SHARE NOWAIT;
 IF v.id IS NULL OR o.id IS NULL OR NOT public.uc_copy_registry_object_matches(v)OR public.uc_copy_registry_original_ref(v)IS DISTINCT FROM artifact->'source'
  OR v.file_size IS DISTINCT FROM(artifact->>'byte_size')::bigint OR lower(btrim(v.storage_metadata->>'mimetype'))IS DISTINCT FROM'application/pdf'
  OR saved->'object'->>'object_id'IS DISTINCT FROM o.id::text OR(saved->'object'->>'updated_at')::timestamptz IS DISTINCT FROM o.updated_at
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('version',1,'kind','controlled_education_artifact','organization_id',p_org,'signature_id',p_signature,
  'record_id',r.id,'record_revision',state.revision,'record_state_sha256',p_expected_state_hash,'subject_user_id',r.user_id,'enrollment_id',r.enrollment_id,'group_id',r.group_id,
  'artifact',artifact,'object',jsonb_build_object('id',o.id,'updated_at',public.uc_signature_assurance_utc(o.updated_at)),
  'file',jsonb_build_object('bucket','org-documents','path',v.file_path,'sha256',artifact->>'byte_sha256','bytes',artifact->'byte_size','mime','application/pdf'),
  'byte_assurance','trusted_issuance_attestation','current_byte_reread',false,'cryptographic_signature_verification','not_performed');
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');
 WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;


-- UC022 fragment 49_private_s2_acl.sql
-- S2 source-only closeout: exact eleven new private helpers, no public facade grants.
DO $s2_acl$
DECLARE f record;gr record;found integer:=0;
BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.proacl,p.oid::regprocedure identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(ARRAY['uc_signature_assurance_signature_fence','uc_signature_assurance_disclose_file','uc_signature_assurance_project_document','uc_signature_assurance_project_binding','uc_signature_assurance_project_signature_event','uc_signature_assurance_capabilities','uc_signature_assurance_current_document','uc_signature_assurance_context','uc_signature_assurance_bind_signature','uc_signature_assurance_issued_source','uc_signature_assurance_capture_document'])LOOP
  found:=found+1;EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.identity);
  FOR gr IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))a WHERE a.grantee<>f.proowner AND a.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I',f.identity,pg_get_userbyid(gr.grantee));
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=f.oid AND a.grantee<>p.proowner)THEN RAISE EXCEPTION 'UC022_S2_PRIVATE_HELPER_ACL_NOT_CLOSED';END IF;
 END LOOP;
 IF found<>11 THEN RAISE EXCEPTION 'UC022_S2_PRIVATE_HELPER_SET_MISMATCH';END IF;
END;$s2_acl$;


-- UC022 fragment 50_evidence_projection_capture.sql
-- UC022 S3 source authoring: immutable capture of the complete event history and
-- the evidence projection actually visible at capture time. Hidden file contents
-- are not copied into another relation and are not called privately verified.
-- No public dispatcher/grant, existing fact mutation or legal approval is added.
CREATE FUNCTION public.uc_signature_assurance_capture_evidence_projection(p_org uuid,p_signature uuid,p_party text,p_through integer)RETURNS public.uc_signature_assurance_private_manifests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
DECLARE sig public.document_signatures;head public.uc_signature_assurance_streams;saved public.uc_signature_assurance_private_manifests;
 new_id uuid:=gen_random_uuid();captured_at timestamptz:=clock_timestamp();context jsonb;body jsonb;literal text;person record;item record;
 events jsonb:='[]';bindings jsonb:='[]';policies jsonb:='[]';agreements jsonb:='[]';documents jsonb:='[]';
 people uuid[];binding_ids uuid[];policy_ids uuid[];agreement_ids uuid[];document_ids uuid[];event_count integer;
BEGIN
 IF p_party IS NULL OR p_party NOT IN('sender','recipient')OR p_through IS NULL OR p_through NOT BETWEEN 0 AND 5000 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 sig:=public.uc_signature_assurance_signature_fence(p_org,p_signature);
 SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM(
  SELECT user_id FROM public.uc_signature_assurance_file_people(sig)
  UNION SELECT user_id FROM public.uc_signature_assurance_participants WHERE organization_id=p_org AND object_kind='stream'AND object_id=p_signature AND relation<>'staff_attribution'
 )known;
 PERFORM public.uc_signature_assurance_fence(p_org,people,true,p_signature);
 IF NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 head:=public.uc_signature_assurance_stream(p_org,'signature',p_signature);
 IF head.revision IS DISTINCT FROM p_through THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 SELECT count(*)::integer INTO event_count FROM public.uc_signature_assurance_events WHERE organization_id=p_org AND signature_id=p_signature AND stream_kind='signature'AND revision<=p_through;
 IF event_count<>p_through OR EXISTS(SELECT 1 FROM generate_series(1,p_through)expected(revision)WHERE NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_events e WHERE e.organization_id=p_org AND e.signature_id=p_signature AND e.stream_kind='signature'AND e.revision=expected.revision))THEN PERFORM public.uc_signature_assurance_error('DEPENDENCY_UNAVAILABLE');END IF;
 PERFORM 1 FROM public.uc_signature_assurance_events WHERE organization_id=p_org AND signature_id=p_signature AND stream_kind='signature'AND revision<=p_through ORDER BY revision FOR SHARE NOWAIT;
 SELECT coalesce(array_agg(DISTINCT binding_id)FILTER(WHERE binding_id IS NOT NULL),'{}'::uuid[]),
  coalesce(array_agg(DISTINCT policy_version_id)FILTER(WHERE policy_version_id IS NOT NULL),'{}'::uuid[]),
  coalesce(array_agg(DISTINCT agreement_event_id)FILTER(WHERE agreement_event_id IS NOT NULL),'{}'::uuid[]),
  coalesce(array_agg(DISTINCT document_snapshot_id)FILTER(WHERE document_snapshot_id IS NOT NULL),'{}'::uuid[])
 INTO binding_ids,policy_ids,agreement_ids,document_ids FROM public.uc_signature_assurance_events WHERE organization_id=p_org AND signature_id=p_signature AND stream_kind='signature'AND revision<=p_through;
 SELECT coalesce(array_agg(DISTINCT id),'{}'::uuid[])INTO document_ids FROM(
  SELECT unnest(document_ids)id UNION SELECT document_snapshot_id FROM public.uc_signature_assurance_bindings WHERE organization_id=p_org AND signature_id=p_signature AND id=ANY(binding_ids)
 )known;
 -- Include the chosen context's policy/binding dependencies as exactly the latest
 -- binding already present in this bounded event chain; do not infer new events.
 context:=public.uc_signature_assurance_context(p_org,p_signature,p_party);
 IF context->>'latest_event_revision'IS DISTINCT FROM p_through::text THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 FOR item IN SELECT id FROM public.uc_signature_assurance_events WHERE organization_id=p_org AND signature_id=p_signature AND stream_kind='signature'AND revision<=p_through ORDER BY revision LOOP
  events:=events||jsonb_build_array(public.uc_signature_assurance_project_signature_event(p_org,p_signature,item.id));
 END LOOP;
 FOR item IN SELECT id FROM public.uc_signature_assurance_bindings WHERE organization_id=p_org AND signature_id=p_signature AND id=ANY(binding_ids)ORDER BY revision,id LOOP
  bindings:=bindings||jsonb_build_array(public.uc_signature_assurance_project_binding(p_org,p_signature,item.id));
 END LOOP;
 FOR item IN SELECT id FROM public.uc_signature_assurance_policy_versions WHERE organization_id=p_org AND id=ANY(policy_ids)ORDER BY id LOOP
  policies:=policies||jsonb_build_array(public.uc_signature_assurance_project_policy(p_org,item.id));
 END LOOP;
 FOR item IN SELECT id FROM public.uc_signature_assurance_agreements WHERE organization_id=p_org AND id=ANY(agreement_ids)ORDER BY id LOOP
  agreements:=agreements||jsonb_build_array(public.uc_signature_assurance_project_agreement(p_org,item.id));
 END LOOP;
 FOR item IN SELECT id FROM public.uc_signature_assurance_document_snapshots WHERE organization_id=p_org AND signature_id=p_signature AND id=ANY(document_ids)ORDER BY id LOOP
  documents:=documents||jsonb_build_array(public.uc_signature_assurance_project_document(p_org,p_signature,item.id));
 END LOOP;
 IF jsonb_array_length(bindings)<>cardinality(binding_ids)OR jsonb_array_length(policies)<>cardinality(policy_ids)OR jsonb_array_length(agreements)<>cardinality(agreement_ids)OR jsonb_array_length(documents)<>cardinality(document_ids)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 -- This committed source is deliberately not the outward FrozenManifestBody:
 -- its own id/hash remain the stable source commitment of a later separately
 -- scoped derivative. A derivative must re-check current rights before export.
 body:=jsonb_build_object('schema_version',1,'id',new_id,'organization_id',p_org,'signature_id',p_signature,
  'captured_at',public.uc_signature_assurance_utc(captured_at),'captured_by',auth.uid(),'manifest_kind','captured_evidence_projection',
  'context',context,'through_revision',p_through,'event_count',event_count,'events',events,
  'referenced_bindings',bindings,'referenced_policies',policies,'referenced_agreements',agreements,'document_snapshots',documents,
  'private_undisclosed_bytes_verified',false,
  'limitations',jsonb_build_array('Снимок содержит полную последовательность сохранённых событий и доступную на момент подготовки проекцию доказательств.',
   'Скрытое исходное содержимое сюда не копируется. Хеш исходного пакета не является доказательством проверки скрытых байтов.',
   'Факты учётной записи, графический макет и полученный скан не получают автоматически юридический или криптографический статус.'));
 literal:=body::text;
 IF octet_length(literal)>2000000 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 IF public.uc_signature_assurance_credential_source(p_org,literal)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 PERFORM public.uc_signature_assurance_token('private_manifest',new_id);
 INSERT INTO public.uc_signature_assurance_private_manifests(id,organization_id,signature_id,through_revision,body_json,body_sha256,captured_by,captured_at)
 VALUES(new_id,p_org,p_signature,p_through,literal,public.uc_signature_assurance_hash(literal),auth.uid(),captured_at)RETURNING *INTO saved;
 -- All original subjects of every captured document/event remain attributable
 -- for trusted retention decisions, independent of mutable current memberships.
 FOR person IN SELECT DISTINCT user_id,relation FROM public.uc_signature_assurance_participants WHERE organization_id=p_org AND relation<>'staff_attribution'AND(
  object_kind='stream'AND object_id=p_signature OR object_kind='binding'AND object_id=ANY(binding_ids)
  OR object_kind='document'AND object_id=ANY(document_ids)OR object_kind='policy'AND object_id=ANY(policy_ids)
  OR object_kind='agreement'AND object_id=ANY(agreement_ids)
  OR object_kind='event'AND object_id IN(SELECT id FROM public.uc_signature_assurance_events WHERE organization_id=p_org AND signature_id=p_signature AND revision<=p_through))LOOP
  PERFORM public.uc_signature_assurance_track(p_org,'private_manifest',new_id,person.user_id,person.relation);
 END LOOP;
 FOR person IN SELECT user_id,relation FROM public.uc_signature_assurance_file_people(sig)LOOP
  PERFORM public.uc_signature_assurance_track(p_org,'private_manifest',new_id,person.user_id,person.relation);
 END LOOP;
 PERFORM public.uc_signature_assurance_track(p_org,'private_manifest',new_id,auth.uid(),'staff_attribution');
 RETURN saved;
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
DO $manifest_private_acl$
DECLARE f record;gr record;
BEGIN
 SELECT p.oid,p.proowner,p.proacl,p.oid::regprocedure identity INTO STRICT f FROM pg_proc p WHERE p.oid='public.uc_signature_assurance_capture_evidence_projection(uuid,uuid,text,integer)'::regprocedure;
 EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.identity);
 FOR gr IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))a WHERE a.grantee<>f.proowner AND a.grantee<>0 LOOP
  EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I',f.identity,pg_get_userbyid(gr.grantee));
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=f.oid AND a.grantee<>p.proowner)THEN RAISE EXCEPTION 'UC022_MANIFEST_CAPTURE_PRIVATE_ACL_NOT_CLOSED';END IF;
END;$manifest_private_acl$;


-- UC022 fragment 51_current_scope_derivative.sql
-- UC022 S3. Re-scope a frozen captured projection; never reveal a reference
-- that was absent/redacted in the immutable source, even after a role expansion.
CREATE FUNCTION public.uc_signature_assurance_mask_captured_file(p_org uuid,p_signature uuid,p_value jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
#variable_conflict use_column
DECLARE fresh jsonb;literal text;
BEGIN
 IF p_value IS NULL OR p_value='null'::jsonb THEN RETURN NULL;END IF;
 IF p_value->>'visibility'='redacted'THEN RETURN p_value;END IF;
 literal:=p_value->>'captured_reference_json';
 IF p_value->>'visibility'IS DISTINCT FROM'available'OR literal IS NULL OR public.uc_signature_assurance_hash(literal)IS DISTINCT FROM p_value->>'captured_reference_sha256'OR literal::jsonb IS DISTINCT FROM p_value->'value'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 fresh:=public.uc_signature_assurance_disclose_file(p_org,p_signature,p_value->'value');
 IF fresh->>'visibility'='available'THEN RETURN p_value;END IF;
 RETURN jsonb_build_object('visibility','redacted','captured_reference_sha256',p_value->>'captured_reference_sha256','value',NULL,'reason','current_file_scope');
 EXCEPTION WHEN invalid_text_representation THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_mask_captured_selection(p_org uuid,p_value jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
#variable_conflict use_column
DECLARE literal text;
BEGIN
 IF p_value IS NULL OR p_value='null'::jsonb OR p_value->>'visibility'='redacted'THEN RETURN p_value;END IF;
 literal:=p_value->>'captured_reference_json';
 IF p_value->>'visibility'IS DISTINCT FROM'available'OR literal IS NULL OR public.uc_signature_assurance_hash(literal)IS DISTINCT FROM p_value->>'captured_reference_sha256'OR literal::jsonb IS DISTINCT FROM p_value->'value'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF public.uc_signature_assurance_resolve_selection(p_org,(p_value->'value')-'byte_proof',false)IS NOT NULL THEN RETURN p_value;END IF;
 RETURN jsonb_build_object('visibility','redacted','captured_reference_sha256',p_value->>'captured_reference_sha256','value',NULL,'reason','current_file_scope');
 EXCEPTION WHEN invalid_text_representation THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_mask_captured_authority(p_org uuid,p_value jsonb)RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT CASE WHEN p_value->'document_reference'IS NULL OR p_value->'document_reference'='null'::jsonb THEN p_value ELSE jsonb_set(p_value,'{document_reference}',public.uc_signature_assurance_mask_captured_selection(p_org,p_value->'document_reference'))END
$fn$;
CREATE FUNCTION public.uc_signature_assurance_mask_captured_policy(p_org uuid,p_value jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
#variable_conflict use_column
DECLARE projected jsonb;refs jsonb:='[]';item jsonb;decision jsonb;summary jsonb;literal text;masked integer:=0;
BEGIN
 IF p_value->>'organization_id'IS DISTINCT FROM p_org::text OR public.uc_signature_assurance_hash(p_value->>'projection_json')IS DISTINCT FROM p_value->>'projection_sha256'
  OR(p_value->>'projection_json')::jsonb IS DISTINCT FROM jsonb_build_object('body',p_value->'body','body_sha256',p_value->'body_sha256','disclosure',p_value->'disclosure')THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_value->'body'->'basis'->'document_references')LOOP
  item:=public.uc_signature_assurance_mask_captured_selection(p_org,item);refs:=refs||jsonb_build_array(item);IF item->>'visibility'='redacted'THEN masked:=masked+1;END IF;
 END LOOP;
 decision:=jsonb_set(p_value->'decision','{authority}',public.uc_signature_assurance_mask_captured_authority(p_org,p_value->'decision'->'authority'));
 IF decision->'authority'->'document_reference'->>'visibility'='redacted'THEN masked:=masked+1;END IF;
 projected:=jsonb_set(p_value->'body','{basis,document_references}',refs);
 summary:=jsonb_build_object('kind',CASE WHEN masked=0 THEN'complete'ELSE'current_scope_projection'END,'redacted_reference_count',masked,'redacted_content_count',0,'complete_private_evidence_verified',false);
 literal:=jsonb_build_object('body',projected,'body_sha256',p_value->'body_sha256','disclosure',summary)::text;
 RETURN p_value||jsonb_build_object('body',projected,'body_json',CASE WHEN masked=0 THEN p_value->'body_json'ELSE'null'::jsonb END,'decision',decision,'disclosure',summary,'projection_json',literal,'projection_sha256',public.uc_signature_assurance_hash(literal));
 EXCEPTION WHEN invalid_text_representation THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_redactions(p_value jsonb,p_depth integer DEFAULT 0)RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
#variable_conflict use_column
DECLARE refs integer:=0;contents integer:=0;child jsonb;item record;counts jsonb;
BEGIN
 IF p_depth>100 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 IF jsonb_typeof(p_value)='array'THEN
  FOR child IN SELECT value FROM jsonb_array_elements(p_value)LOOP counts:=public.uc_signature_assurance_redactions(child,p_depth+1);refs:=refs+(counts->>'refs')::integer;contents:=contents+(counts->>'contents')::integer;END LOOP;
 ELSIF jsonb_typeof(p_value)='object'THEN
  refs:=CASE WHEN p_value->>'visibility'='redacted'THEN 1 ELSE 0 END;contents:=CASE WHEN p_value->>'content_visibility'IN('redacted_current_file_scope','redacted_credential_bearing_source')THEN 1 ELSE 0 END;
  FOR item IN SELECT key,value FROM jsonb_each(p_value)WHERE key<>ALL(ARRAY['disclosure','body_json','projection_json','captured_reference_json'])LOOP counts:=public.uc_signature_assurance_redactions(item.value,p_depth+1);refs:=refs+(counts->>'refs')::integer;contents:=contents+(counts->>'contents')::integer;END LOOP;
 END IF;
 RETURN jsonb_build_object('refs',refs,'contents',contents);
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_html_escape(p_value text)RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT replace(replace(replace(replace(replace(coalesce(p_value,'—'),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')
$fn$;
CREATE FUNCTION public.uc_signature_assurance_derive_manifest(p_org uuid,p_signature uuid,p_source uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
#variable_conflict use_column
DECLARE source public.uc_signature_assurance_private_manifests;stored public.uc_signature_assurance_scoped_manifests;sig public.document_signatures;
 raw jsonb;context jsonb;events jsonb:='[]';bindings jsonb:='[]';policies jsonb:='[]';agreements jsonb;documents jsonb:='[]';item jsonb;value jsonb;original_file jsonb;party text;one jsonb;bound jsonb;policy jsonb;current_document jsonb;caps jsonb;missing text[];counts jsonb;body jsonb;literal text;html text;brief text:='';hash text;new_id uuid:=gen_random_uuid();at_time timestamptz:=clock_timestamp();person record;
BEGIN
 sig:=public.uc_signature_assurance_signature_fence(p_org,p_signature);
 SELECT *INTO source FROM public.uc_signature_assurance_private_manifests WHERE id=p_source AND organization_id=p_org AND signature_id=p_signature FOR SHARE NOWAIT;
 IF source.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 IF public.uc_signature_assurance_hash(source.body_json)IS DISTINCT FROM source.body_sha256 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 raw:=source.body_json::jsonb;
 IF raw->>'manifest_kind'IS DISTINCT FROM'captured_evidence_projection'OR raw->>'id'IS DISTINCT FROM source.id::text OR raw->>'organization_id'IS DISTINCT FROM p_org::text OR raw->>'signature_id'IS DISTINCT FROM p_signature::text OR raw->>'through_revision'IS DISTINCT FROM source.through_revision::text OR raw->>'event_count'IS DISTINCT FROM source.through_revision::text THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(raw->'events')LOOP
  value:=item||jsonb_build_object('original_file',public.uc_signature_assurance_mask_captured_file(p_org,p_signature,item->'original_file'),'scan_file',public.uc_signature_assurance_mask_captured_file(p_org,p_signature,item->'scan_file'),'authority',public.uc_signature_assurance_mask_captured_authority(p_org,item->'authority'));events:=events||jsonb_build_array(value);
  brief:=brief||'<tr><td>'||public.uc_signature_assurance_html_escape(value->>'revision')||'</td><td>'||public.uc_signature_assurance_html_escape(value->>'server_at')||'</td><td>'||public.uc_signature_assurance_html_escape(value->>'party_role')||'</td><td>'||public.uc_signature_assurance_html_escape(value->>'method')||'</td><td>'||public.uc_signature_assurance_html_escape(value->>'conclusion')||'</td><td>'||public.uc_signature_assurance_html_escape(value->>'explanation')||'</td></tr>';
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(raw->'referenced_bindings')LOOP bindings:=bindings||jsonb_build_array(jsonb_set(item,'{original_file}',coalesce(public.uc_signature_assurance_mask_captured_file(p_org,p_signature,item->'original_file'),'null'::jsonb)));END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(raw->'referenced_policies')LOOP policies:=policies||jsonb_build_array(public.uc_signature_assurance_mask_captured_policy(p_org,item));END LOOP;
 agreements:=raw->'referenced_agreements';
 FOR item IN SELECT value FROM jsonb_array_elements(raw->'document_snapshots')LOOP
  original_file:=public.uc_signature_assurance_mask_captured_file(p_org,p_signature,item->'original_file');value:=item||jsonb_build_object('original_file',original_file);
  IF item->>'content_visibility'='available'THEN
   IF original_file->>'visibility'='redacted'THEN value:=value||jsonb_build_object('html_text',NULL,'content_visibility','redacted_current_file_scope');
   ELSIF public.uc_signature_assurance_credential_source(p_org,item->>'html_text')THEN value:=value||jsonb_build_object('html_text',NULL,'content_visibility','redacted_credential_bearing_source');END IF;
  END IF;documents:=documents||jsonb_build_array(value);
 END LOOP;
 context:=raw->'context';party:=context->>'chosen_party';current_document:=public.uc_signature_assurance_current_document(p_org,p_signature);caps:=public.uc_signature_assurance_capabilities(p_org,p_signature,party);
 FOREACH party IN ARRAY ARRAY['sender','recipient']LOOP
  one:=context->'parties'->party;bound:=NULL;policy:=NULL;missing:=ARRAY(SELECT jsonb_array_elements_text(one->'requirements'->'missing'));
  IF one->'binding'<>'null'::jsonb THEN
   SELECT value INTO bound FROM jsonb_array_elements(bindings)WHERE value->>'id'=one->'binding'->>'id';SELECT value INTO policy FROM jsonb_array_elements(policies)WHERE value->>'id'=one->'policy'->>'id';
   IF bound IS NULL OR policy IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
   IF NOT public.uc_signature_assurance_policy_eligible(p_org,(bound->>'policy_version_id')::uuid)THEN missing:=array_append(missing,'POLICY_NOT_ACCEPTED');END IF;
   IF bound->'document_revision_id'IS DISTINCT FROM current_document->'document_revision_id'OR bound->>'document_html_sha256'IS DISTINCT FROM current_document->>'document_html_sha256'
    OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings b WHERE b.organization_id=p_org AND b.signature_id=p_signature AND b.party_role=party AND b.revision>(bound->>'revision')::integer)THEN missing:=array_append(missing,'SOURCE_CHANGED');END IF;
   IF bound->'original_file'->>'visibility'='redacted'THEN missing:=array_append(missing,'SOURCE_UNAVAILABLE');END IF;
  END IF;
  IF sig.deleted_at IS NOT NULL OR sig.status IN('signed','rejected','revoked','expired')OR sig.signed_at IS NOT NULL OR party='sender'AND sig.sender_signed_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_events terminal WHERE terminal.organization_id=p_org AND terminal.signature_id=p_signature AND terminal.party_role=party AND terminal.kind IN('sender_confirmed','account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked'))THEN missing:=array_append(missing,'CLOSED');END IF;
  IF sig.expires_at<=clock_timestamp()THEN missing:=array_append(missing,'EXPIRED');END IF;
  SELECT coalesce(array_agg(DISTINCT code ORDER BY code),'{}'::text[])INTO missing FROM unnest(missing)code;
  one:=one||jsonb_build_object('binding',bound,'policy',policy,'requirements',(one->'requirements')||jsonb_build_object('eligible',cardinality(missing)=0,'missing',to_jsonb(missing)));
  context:=jsonb_set(context,ARRAY['parties',party],one);
 END LOOP;
 context:=context||jsonb_build_object('capabilities',caps,'current_document_revision_id',current_document->'document_revision_id','current_document_html_sha256',current_document->>'document_html_sha256','latest_receipt_id',source.id);
 body:=jsonb_build_object('schema_version',1,'id',new_id,'organization_id',p_org,'signature_id',p_signature,'captured_at',public.uc_signature_assurance_utc(at_time),'captured_by',auth.uid(),'manifest_kind','scoped_derivative','source_manifest_id',source.id,'source_manifest_sha256',source.body_sha256,
  'context',context,'through_revision',source.through_revision,'event_count',source.through_revision,'events',events,'referenced_bindings',bindings,'referenced_policies',policies,'referenced_agreements',agreements,'document_snapshots',documents,'limitations',raw->'limitations');
 counts:=public.uc_signature_assurance_redactions(body);body:=body||jsonb_build_object('disclosure',jsonb_build_object('kind',CASE WHEN(counts->>'refs')::integer+(counts->>'contents')::integer=0 THEN'complete'ELSE'current_scope_projection'END,'redacted_reference_count',counts->'refs','redacted_content_count',counts->'contents','complete_private_evidence_verified',false));
 literal:=body::text;hash:=public.uc_signature_assurance_hash(literal);
 html:='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;; style-src &#39;unsafe-inline&#39;"><title>Пакет подтверждений</title><style>body{font:14px/1.5 system-ui;margin:32px;color:#17212b}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd;padding:8px;text-align:left;overflow-wrap:anywhere}p{overflow-wrap:anywhere}</style></head><body><h1>Пакет фактов подтверждения</h1><p>Документ: '||p_signature::text||'. Организация: '||p_org::text||'. События: 1–'||source.through_revision::text||'.</p><p>SHA-256 JSON проекции: '||hash||'. Исходный снимок: '||source.id::text||'. Его сохранённый хеш: '||source.body_sha256||'.</p><p>Это текущая доступная проекция сохранённой истории. Скрытое исходное содержимое этим экспортом не подтверждается. Криптографическая проверка подписи и автоматический вывод о юридической действительности не выполнялись. Наблюдение учётной записи не устанавливает личность человека и полномочия само по себе.</p><table><thead><tr><th>Ревизия</th><th>Время сервера</th><th>Сторона</th><th>Фактический способ</th><th>Факт</th><th>Пояснение</th></tr></thead><tbody>'||brief||'</tbody></table></body></html>';
 IF octet_length(literal)+octet_length(html)>2000000 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 IF public.uc_signature_assurance_credential_source(p_org,literal)OR public.uc_signature_assurance_credential_source(p_org,html)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 -- Reuse only an exact freshly re-authorized projection for this observed actor.
 -- The identity/time fields are presentation facts; every scope/capability/body
 -- field remains in the comparison. Do not re-use a wider historical projection.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_signature_assurance_derivative:'||source.id::text||':'||auth.uid()::text,0))THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 SELECT *INTO stored FROM public.uc_signature_assurance_scoped_manifests prior
  WHERE prior.organization_id=p_org AND prior.signature_id=p_signature AND prior.source_manifest_id=source.id AND prior.captured_by IS NOT DISTINCT FROM auth.uid()
   AND(prior.body_json::jsonb-'id'-'captured_at')=(body-'id'-'captured_at')
  ORDER BY prior.captured_at DESC,prior.id DESC LIMIT 1 FOR SHARE NOWAIT;
 IF stored.id IS NOT NULL THEN
  IF public.uc_signature_assurance_hash(stored.body_json)IS DISTINCT FROM stored.body_json_sha256 OR public.uc_signature_assurance_hash(stored.receipt_html)IS DISTINCT FROM stored.receipt_html_sha256 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  RETURN jsonb_build_object('body',stored.body_json::jsonb,'body_json',stored.body_json,'body_json_sha256',stored.body_json_sha256,'receipt_html',stored.receipt_html,'receipt_html_sha256',stored.receipt_html_sha256);
 END IF;
 PERFORM public.uc_signature_assurance_token('scoped_manifest',new_id);
 INSERT INTO public.uc_signature_assurance_scoped_manifests(id,organization_id,source_manifest_id,signature_id,body_json,body_json_sha256,receipt_html,receipt_html_sha256,captured_by,captured_at)VALUES(new_id,p_org,source.id,p_signature,literal,hash,html,public.uc_signature_assurance_hash(html),auth.uid(),at_time)RETURNING *INTO stored;
 FOR person IN SELECT user_id,relation FROM public.uc_signature_assurance_participants WHERE organization_id=p_org AND object_kind='private_manifest'AND object_id=source.id LOOP PERFORM public.uc_signature_assurance_track(p_org,'scoped_manifest',new_id,person.user_id,person.relation);END LOOP;
 PERFORM public.uc_signature_assurance_track(p_org,'scoped_manifest',new_id,auth.uid(),'staff_attribution');
 RETURN jsonb_build_object('body',body,'body_json',stored.body_json,'body_json_sha256',stored.body_json_sha256,'receipt_html',stored.receipt_html,'receipt_html_sha256',stored.receipt_html_sha256);
 EXCEPTION WHEN invalid_text_representation THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');
 WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;


-- UC022 fragment 52_authenticated_read.sql
-- UC022 public authenticated read ABI. All returned data is current-authorized;
-- a local preview hint, caller actor, stale role or another tenant is never authority.
CREATE FUNCTION public.uc_signature_assurance_empty_subject_stream(p_org uuid,p_kind text,p_subject uuid)RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $fn$
 SELECT md5('uc022_subject_stream:'||p_org::text||':'||p_kind||':'||p_subject::text)::uuid
$fn$;
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_stream(p_org uuid,p_kind text,p_entity uuid,p_subject uuid DEFAULT NULL)RETURNS public.uc_signature_assurance_streams
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE head public.uc_signature_assurance_streams;new_id uuid;
BEGIN
 IF p_org IS NULL OR p_entity IS NULL OR NOT coalesce(p_kind IN('policy','signature','agreement','consent'),false)OR(p_kind IN('agreement','consent'))IS DISTINCT FROM(p_subject IS NOT NULL)OR(p_subject IS NOT NULL AND p_entity<>p_subject)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 SELECT *INTO head FROM public.uc_signature_assurance_streams WHERE organization_id=p_org AND kind=p_kind AND entity_id=p_entity FOR UPDATE NOWAIT;
 IF head.id IS NOT NULL THEN IF head.subject_user_id IS DISTINCT FROM p_subject THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;RETURN head;END IF;
 new_id:=CASE WHEN p_kind IN('policy','signature')THEN p_entity ELSE public.uc_signature_assurance_empty_subject_stream(p_org,p_kind,p_subject)END;
 PERFORM public.uc_signature_assurance_token('stream',new_id);INSERT INTO public.uc_signature_assurance_streams(id,organization_id,kind,entity_id,subject_user_id)VALUES(new_id,p_org,p_kind,p_entity,p_subject)RETURNING *INTO head;RETURN head;
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_read_events(p_org uuid,p_query jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE head public.uc_signature_assurance_streams;v_kind text:=p_query->>'stream_kind';stream uuid:=(p_query->>'stream_id')::uuid;through integer;after_revision integer:=(p_query->>'after_revision')::integer;lim integer:=(p_query->>'limit')::integer;events jsonb:='[]';e public.uc_signature_assurance_events;value jsonb;last_revision integer:=after_revision;people uuid[];
BEGIN
 SELECT *INTO head FROM public.uc_signature_assurance_streams WHERE id=stream AND organization_id=p_org FOR SHARE NOWAIT;
 IF v_kind='signature'THEN PERFORM public.uc_signature_assurance_signature_fence(p_org,stream);
 ELSIF head.id IS NULL OR head.kind IS DISTINCT FROM v_kind THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');
 ELSIF v_kind='policy'THEN
  IF NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_policy_versions v WHERE v.organization_id=p_org AND v.family_id=stream AND public.uc_signature_assurance_policy_read(p_org,v.id))THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSIF v_kind IN('agreement','consent')THEN
  IF NOT public.uc_signature_assurance_subject_read(p_org,head.subject_user_id)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSE PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_participants WHERE organization_id=p_org AND object_kind='stream'AND object_id=stream AND relation<>'staff_attribution';
 PERFORM public.uc_signature_assurance_fence(p_org,array_append(people,head.subject_user_id),false);
 through:=CASE WHEN p_query->'through_revision'='null'::jsonb THEN coalesce(head.revision,0)ELSE(p_query->>'through_revision')::integer END;
 IF through>coalesce(head.revision,0)OR after_revision>through THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 FOR e IN SELECT *FROM public.uc_signature_assurance_events WHERE organization_id=p_org AND stream_id=stream AND stream_kind=v_kind AND revision>after_revision AND revision<=through ORDER BY revision LIMIT lim LOOP
  IF e.revision<>last_revision+1 THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  IF v_kind='signature'THEN value:=public.uc_signature_assurance_project_signature_event(p_org,stream,e.id);
  ELSE value:=e.payload||jsonb_build_object('authority',public.uc_signature_assurance_mask_captured_authority(p_org,e.payload->'authority'));
   IF public.uc_signature_assurance_credential_source(p_org,(value-'authority')::text)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  END IF;
  events:=events||jsonb_build_array(value);last_revision:=e.revision;
 END LOOP;
 IF last_revision<through AND jsonb_array_length(events)<lim THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 RETURN jsonb_build_object('stream_kind',v_kind,'stream_id',stream,'through_revision',through,'events',events,'after_revision',after_revision,'next_after_revision',CASE WHEN last_revision<through THEN last_revision END);
END;$fn$;
CREATE FUNCTION public.read_signature_assurance(p_organization_id uuid,p_query jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms' SET statement_timeout='10000ms'AS $fn$
DECLARE org uuid:=p_organization_id;v_kind text:=p_query->>'kind';result jsonb;caps jsonb;list jsonb:='[]';agreements jsonb:='[]';consents jsonb:='[]';v public.uc_signature_assurance_policy_versions;head public.uc_signature_assurance_streams;subject uuid;sig uuid;party text;after_id uuid;lim integer;seen integer:=0;last_id uuid;next_id uuid;value jsonb;row_item record;revision_value integer;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_active()OR org IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=org)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF jsonb_typeof(p_query)IS DISTINCT FROM'object'OR octet_length(p_query::text)>196608 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 caps:=public.uc_signature_assurance_capabilities(org);
 IF v_kind IN('policy_list','policy_choices','subject')THEN
  IF NOT public.uc_signature_assurance_integer(p_query->'limit',1,100)OR p_query->'after_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_query->'after_id')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;lim:=(p_query->>'limit')::integer;after_id:=(p_query->>'after_id')::uuid;
 END IF;
 IF v_kind='signature'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','signature_id','party_role'])OR NOT public.uc_signature_assurance_uuid(p_query->'signature_id')OR NOT coalesce(p_query->>'party_role'IN('sender','recipient'),false)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  sig:=(p_query->>'signature_id')::uuid;party:=p_query->>'party_role';value:=public.uc_signature_assurance_context(org,sig,party);caps:=value->'capabilities';result:=jsonb_build_object('kind',v_kind,'context',value);
 ELSIF v_kind='policy'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','policy_version_id'])OR NOT public.uc_signature_assurance_uuid(p_query->'policy_version_id')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  PERFORM public.uc_signature_assurance_fence(org,'{}');value:=public.uc_signature_assurance_project_policy(org,(p_query->>'policy_version_id')::uuid);result:=jsonb_build_object('kind',v_kind,'policy',value);
 ELSIF v_kind IN('policy_list','policy_choices')THEN
  IF v_kind='policy_list'THEN
   IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','after_id','limit'])THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  ELSE
   IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','signature_id','party_role','purpose','after_id','limit'])OR NOT coalesce(p_query->>'purpose'IN('signature','consent','agreement'),false)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
   IF p_query->>'purpose'='signature'THEN
    IF NOT public.uc_signature_assurance_uuid(p_query->'signature_id')OR NOT coalesce(p_query->>'party_role'IN('sender','recipient'),false)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
    sig:=(p_query->>'signature_id')::uuid;party:=p_query->>'party_role';PERFORM public.uc_signature_assurance_signature_fence(org,sig);caps:=public.uc_signature_assurance_capabilities(org,sig,party);
   ELSIF p_query->'signature_id'<>'null'::jsonb OR p_query->'party_role'<>'null'::jsonb OR NOT public.uc_signature_assurance_own_current(org,auth.uid())THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
  END IF;
  PERFORM public.uc_signature_assurance_fence(org,'{}');
  FOR v IN SELECT *FROM public.uc_signature_assurance_policy_versions v WHERE v.organization_id=org AND(after_id IS NULL OR v.id>after_id)AND public.uc_signature_assurance_policy_read(org,v.id)
   AND(v_kind='policy_list'OR public.uc_signature_assurance_policy_eligible(org,v.id)AND CASE WHEN p_query->>'purpose'='signature'THEN(v.body->'classification'->>'party_role'='sender')=(party='sender')WHEN p_query->>'purpose'='agreement'THEN v.body->>'method'='authenticated_account_confirmation'AND v.body->'agreement'<>'null'::jsonb ELSE v.body->>'method'='authenticated_account_confirmation'AND v.body->'consent'<>'null'::jsonb END)ORDER BY v.id LIMIT lim+1 LOOP
   seen:=seen+1;IF seen>lim THEN next_id:=last_id;EXIT;END IF;
   IF v_kind='policy_list'THEN value:=public.uc_signature_assurance_project_policy(org,v.id);
   ELSE SELECT stream_revision INTO revision_value FROM public.uc_signature_assurance_policy_decisions WHERE organization_id=org AND policy_version_id=v.id ORDER BY stream_revision DESC LIMIT 1;
    value:=jsonb_build_object('id',v.id,'family_id',v.family_id,'organization_id',org,'version',v.version,'body_sha256',v.body_sha256,'classification',v.body->'classification','method',v.body->>'method','purpose',v.body->>'purpose','identity_requirement',v.body->>'identity_requirement','authority_requirement',v.body->>'authority_requirement','limitations',v.body->>'limitations','decision_revision',revision_value);
   END IF;list:=list||jsonb_build_array(value);last_id:=v.id;
  END LOOP;
  IF v_kind='policy_list'THEN result:=jsonb_build_object('kind',v_kind,'policies',list,'next_after_id',next_id);
  ELSE result:=jsonb_build_object('kind',v_kind,'signature_id',sig,'party_role',party,'purpose',p_query->>'purpose','choices',list,'next_after_id',next_id);END IF;
 ELSIF v_kind='events'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','stream_kind','stream_id','after_revision','through_revision','limit'])OR NOT public.uc_signature_assurance_uuid(p_query->'stream_id')OR NOT coalesce(p_query->>'stream_kind'IN('policy','signature','agreement','consent'),false)OR NOT public.uc_signature_assurance_integer(p_query->'after_revision')OR NOT public.uc_signature_assurance_integer(p_query->'limit',1,100)OR p_query->'through_revision'<>'null'::jsonb AND NOT public.uc_signature_assurance_integer(p_query->'through_revision')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  value:=public.uc_signature_assurance_read_events(org,p_query);result:=jsonb_build_object('kind',v_kind,'page',value);
  IF p_query->>'stream_kind'='signature'THEN caps:=public.uc_signature_assurance_capabilities(org,(p_query->>'stream_id')::uuid,NULL);END IF;
 ELSIF v_kind='terms'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','policy_version_id','terms_kind','declared_full_name'])OR NOT public.uc_signature_assurance_uuid(p_query->'policy_version_id')OR NOT public.uc_signature_assurance_text(p_query->'declared_full_name',300)OR NOT coalesce(p_query->>'terms_kind'IN('pep_agreement','personal_data_consent'),false)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  PERFORM public.uc_signature_assurance_fence(org,ARRAY[auth.uid()]);result:=public.uc_signature_assurance_render_terms(org,(p_query->>'policy_version_id')::uuid,p_query->>'terms_kind',p_query->>'declared_full_name');
 ELSIF v_kind='subject'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','subject_user_id','after_id','limit'])OR NOT public.uc_signature_assurance_uuid(p_query->'subject_user_id')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;subject:=(p_query->>'subject_user_id')::uuid;
  IF NOT public.uc_signature_assurance_subject_read(org,subject)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
  PERFORM public.uc_signature_assurance_fence(org,ARRAY[subject]);
  FOR row_item IN SELECT *FROM(SELECT id,'agreement'::text source FROM public.uc_signature_assurance_agreements WHERE organization_id=org AND subject_user_id=subject UNION ALL SELECT id,'consent'FROM public.uc_signature_assurance_consents WHERE organization_id=org AND subject_user_id=subject UNION ALL SELECT id,'legacy_agreement'FROM public.pep_agreements WHERE user_id=subject AND(organization_id=org OR organization_id IS NULL AND auth.uid()=subject)UNION ALL SELECT id,'legacy_consent'FROM public.student_consents WHERE organization_id=org AND user_id=subject)all_rows WHERE after_id IS NULL OR id>after_id ORDER BY id LIMIT lim+1 LOOP
   seen:=seen+1;IF seen>lim THEN next_id:=last_id;EXIT;END IF;
   IF row_item.source='agreement'THEN agreements:=agreements||jsonb_build_array(public.uc_signature_assurance_project_agreement(org,row_item.id));
   ELSIF row_item.source='legacy_agreement'THEN agreements:=agreements||jsonb_build_array(public.uc_signature_assurance_project_legacy_agreement(org,row_item.id,subject));
   ELSIF row_item.source='consent'THEN consents:=consents||jsonb_build_array(public.uc_signature_assurance_project_consent(org,row_item.id));
   ELSE consents:=consents||jsonb_build_array(public.uc_signature_assurance_project_legacy_consent(org,row_item.id,subject));END IF;last_id:=row_item.id;
  END LOOP;
  result:=jsonb_build_object('kind',v_kind,'subject_user_id',subject,
   'agreement_stream_id',coalesce((SELECT id FROM public.uc_signature_assurance_streams subject_head WHERE subject_head.organization_id=org AND subject_head.kind='agreement'AND entity_id=subject),public.uc_signature_assurance_empty_subject_stream(org,'agreement',subject)),
   'agreement_revision',coalesce((SELECT revision FROM public.uc_signature_assurance_streams subject_head WHERE subject_head.organization_id=org AND subject_head.kind='agreement'AND entity_id=subject),0),
   'consent_stream_id',coalesce((SELECT id FROM public.uc_signature_assurance_streams subject_head WHERE subject_head.organization_id=org AND subject_head.kind='consent'AND entity_id=subject),public.uc_signature_assurance_empty_subject_stream(org,'consent',subject)),
   'consent_revision',coalesce((SELECT revision FROM public.uc_signature_assurance_streams subject_head WHERE subject_head.organization_id=org AND subject_head.kind='consent'AND entity_id=subject),0),
   'agreements',agreements,'consents',consents,'next_after_id',next_id);
 ELSIF v_kind='receipt'THEN
  IF NOT public.uc_signature_assurance_shape(p_query,ARRAY['kind','signature_id','receipt_id'])OR NOT public.uc_signature_assurance_uuid(p_query->'signature_id')OR NOT public.uc_signature_assurance_uuid(p_query->'receipt_id')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  sig:=(p_query->>'signature_id')::uuid;value:=public.uc_signature_assurance_derive_manifest(org,sig,(p_query->>'receipt_id')::uuid);result:=jsonb_build_object('kind',v_kind,'manifest',value);caps:=value->'body'->'context'->'capabilities';
 ELSE PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 caps:=jsonb_set(caps,'{can_read}','true'::jsonb);
 RETURN jsonb_build_object('version',1,'ok',true,'scope',jsonb_build_object('actor_user_id',auth.uid(),'organization_id',org),'capabilities',caps,'result',result);
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');
 WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;


-- UC022 fragment 53_authenticated_apply.sql
-- UC022 authenticated mutations. No client chooses observed identity, server time,
-- proof assurance or another subject. Each exact request UUID is fenced and replayed.
CREATE FUNCTION public.uc_signature_assurance_auth_signature_action(p_org uuid,p_request uuid,p_expected integer,p_action jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
DECLARE operation text:=p_action->>'action';sig_id uuid;party text;sig public.document_signatures;head public.uc_signature_assurance_streams;stored public.uc_signature_assurance_requests;
 b public.uc_signature_assurance_bindings;v public.uc_signature_assurance_policy_versions;decision public.uc_signature_assurance_policy_decisions;d public.uc_signature_assurance_document_snapshots;agreement public.uc_signature_assurance_agreements;e public.uc_signature_assurance_events;manifest public.uc_signature_assurance_private_manifests;
 digest text;authority jsonb;conclusion text;person record;keys text[];doc_hash text;result jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_active()THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR p_expected=2147483647 OR NOT public.uc_signature_assurance_uuid(p_action->'signature_id')OR NOT coalesce(p_action->>'party_role'IN('sender','recipient'),false)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 sig_id:=(p_action->>'signature_id')::uuid;party:=p_action->>'party_role';
 IF operation='confirm_sender'THEN keys:=ARRAY['action','signature_id','party_role','binding_id','policy_sha256','document_html_sha256','declared_full_name','authority','agreement_event_id','agreement_sha256'];
 ELSIF operation='record_graphic_preparation'THEN keys:=ARRAY['action','signature_id','party_role','binding_id','document_html_sha256','reason'];
 ELSIF operation='revoke_invitation'THEN keys:=ARRAY['action','signature_id','party_role','reason'];
 ELSIF operation='capture_receipt'THEN keys:=ARRAY['action','signature_id','party_role','through_revision'];
 ELSE PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF NOT public.uc_signature_assurance_shape(p_action,keys)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 PERFORM public.uc_signature_assurance_safe_authenticated_input(p_org,p_action);
 digest:=public.uc_signature_assurance_hash(jsonb_build_object('organization_id',p_org,'expected_revision',p_expected,'action',p_action)::text);
 sig:=public.uc_signature_assurance_signature_fence(p_org,sig_id,operation<>'capture_receipt',p_request);
 IF operation='capture_receipt'THEN PERFORM public.uc_signature_assurance_fence(p_org,ARRAY[auth.uid()],true,sig_id,p_request);END IF;
 stored:=public.uc_signature_assurance_request(p_org,p_request,digest);
 IF stored.request_id IS NOT NULL THEN
  IF stored.action IS DISTINCT FROM operation OR stored.stream_id IS DISTINCT FROM sig_id OR stored.party_role IS DISTINCT FROM party THEN PERFORM public.uc_signature_assurance_error('REQUEST_CONFLICT');END IF;
  IF operation='capture_receipt'THEN result:=jsonb_build_object('kind','receipt','manifest',public.uc_signature_assurance_derive_manifest(p_org,sig_id,stored.entity_id));
  ELSE result:=jsonb_build_object('kind','signature','context',public.uc_signature_assurance_context(p_org,sig_id,party));END IF;
  RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(stored,true),'result',result);
 END IF;
 head:=public.uc_signature_assurance_stream(p_org,'signature',sig_id);
 IF head.revision<>p_expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF operation='capture_receipt'THEN
  IF NOT public.uc_signature_assurance_integer(p_action->'through_revision')OR(p_action->>'through_revision')::integer<>p_expected THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  manifest:=public.uc_signature_assurance_capture_evidence_projection(p_org,sig_id,party,p_expected);
  stored:=public.uc_signature_assurance_record_request(p_org,p_request,digest,operation,head.id,NULL,manifest.id,head.revision,auth.uid(),party,NULL);
  FOR person IN SELECT user_id,relation FROM public.uc_signature_assurance_participants WHERE organization_id=p_org AND object_kind='private_manifest'AND object_id=manifest.id LOOP PERFORM public.uc_signature_assurance_track(p_org,'request',p_request,person.user_id,person.relation);END LOOP;
  RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(stored),'result',jsonb_build_object('kind','receipt','manifest',public.uc_signature_assurance_derive_manifest(p_org,sig_id,manifest.id)));
 END IF;
 IF sig.deleted_at IS NOT NULL OR sig.signed_at IS NOT NULL OR sig.status IN('signed','revoked','rejected','expired')OR party='sender'AND sig.sender_signed_at IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 IF sig.expires_at<=clock_timestamp()THEN PERFORM public.uc_signature_assurance_error('EXPIRED');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_signature_assurance_events fact WHERE fact.organization_id=p_org AND fact.signature_id=sig_id AND fact.party_role=party AND fact.kind IN('account_confirmed','sender_confirmed','bearer_confirmed','scan_received'))THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 IF operation='revoke_invitation'THEN
  IF party<>'recipient'OR NOT public.uc_signature_assurance_text(p_action->'reason',4000)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  -- Canonical append-only revocation also works after the other party confirmed.
  -- Existing legacy status/facts are preserved; new commands consult the terminal event.
  e:=public.uc_signature_assurance_append(p_org=>p_org,p_stream=>head.id,p_expected=>p_expected,p_request=>p_request,p_kind=>'invitation_revoked',p_method=>'legacy_unknown',p_reason=>p_action->>'reason',p_authority=>public.uc_signature_assurance_empty_authority(),p_signature=>sig_id,p_party_role=>party);
 ELSE
  IF NOT public.uc_signature_assurance_sha(p_action->'document_html_sha256')OR p_action->'binding_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_action->'binding_id')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  IF p_action->'binding_id'<>'null'::jsonb THEN
   SELECT *INTO b FROM public.uc_signature_assurance_bindings WHERE id=(p_action->>'binding_id')::uuid AND organization_id=p_org AND signature_id=sig_id AND party_role=party FOR SHARE NOWAIT;
   IF b.id IS NULL OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings newer WHERE newer.organization_id=p_org AND newer.signature_id=sig_id AND newer.party_role=party AND newer.revision>b.revision)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
   SELECT *INTO v FROM public.uc_signature_assurance_policy_versions WHERE id=b.policy_version_id AND organization_id=p_org FOR SHARE NOWAIT;
   SELECT *INTO decision FROM public.uc_signature_assurance_policy_decisions WHERE policy_version_id=v.id AND organization_id=p_org ORDER BY stream_revision DESC LIMIT 1 FOR SHARE NOWAIT;
  END IF;
  d:=public.uc_signature_assurance_capture_document(p_org,sig_id,party,sig.current_revision_id,p_action->>'document_html_sha256');
  IF operation='confirm_sender'THEN
   IF party<>'sender'OR sig.sender_user_id IS DISTINCT FROM auth.uid()OR NOT public.uc_signature_action_allowed(sig_id,'sign')THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
   IF b.id IS NULL THEN PERFORM public.uc_signature_assurance_error('POLICY_REQUIRED');END IF;
   IF NOT public.uc_signature_assurance_policy_eligible(p_org,v.id)OR decision.state IS DISTINCT FROM'centre_accepted'THEN PERFORM public.uc_signature_assurance_error('POLICY_NOT_ACCEPTED');END IF;
   IF NOT public.uc_signature_assurance_sha(p_action->'policy_sha256')OR v.body_sha256 IS DISTINCT FROM p_action->>'policy_sha256'OR b.policy_sha256 IS DISTINCT FROM v.body_sha256 OR b.policy_decision_revision IS DISTINCT FROM decision.stream_revision THEN PERFORM public.uc_signature_assurance_error('POLICY_CHANGED');END IF;
   IF v.body->>'method'IS DISTINCT FROM'authenticated_account_confirmation'THEN PERFORM public.uc_signature_assurance_error('METHOD_UNSUPPORTED');END IF;
   IF NOT public.uc_signature_assurance_text(p_action->'declared_full_name',300)OR(p_action->'agreement_event_id'='null'::jsonb)IS DISTINCT FROM(p_action->'agreement_sha256'='null'::jsonb)OR p_action->'agreement_event_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_action->'agreement_event_id')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
   authority:=public.uc_signature_assurance_authority(p_org,p_action->'authority');
   IF authority->>'kind'IS DISTINCT FROM v.body->>'authority_requirement'THEN PERFORM public.uc_signature_assurance_error('AUTHORITY_REQUIRED');END IF;
   IF p_action->'agreement_event_id'<>'null'::jsonb THEN
    SELECT *INTO agreement FROM public.uc_signature_assurance_agreements WHERE id=(p_action->>'agreement_event_id')::uuid AND organization_id=p_org AND subject_user_id=auth.uid()FOR SHARE NOWAIT;
    IF agreement.id IS NULL OR agreement.policy_version_id IS DISTINCT FROM v.id OR agreement.policy_sha256 IS DISTINCT FROM v.body_sha256 OR agreement.terms->>'sha256'IS DISTINCT FROM p_action->>'agreement_sha256'OR agreement.terms->>'sha256'IS DISTINCT FROM v.body->'agreement'->>'sha256'THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
   END IF;
   IF v.body->>'purpose'='account_pep'AND agreement.id IS NULL THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_REQUIRED');END IF;
   conclusion:=CASE WHEN v.body->>'purpose'='account_pep'THEN'policy_eligible_account_confirmation'ELSE'factual_confirmation'END;
   e:=public.uc_signature_assurance_append(p_org=>p_org,p_stream=>head.id,p_expected=>p_expected,p_request=>p_request,p_kind=>'sender_confirmed',p_method=>'authenticated_account_confirmation',p_reason=>'Учётная запись отправителя подтвердила точную сохранённую версию документа и выбранные правила.',p_authority=>authority,p_policy=>v.id,p_signature=>sig_id,p_document=>d.id,p_agreement=>agreement.id,p_conclusion=>conclusion,p_actor=>auth.uid(),p_declared_name=>p_action->>'declared_full_name',p_party_role=>party,p_binding=>b.id);
  ELSE
   IF NOT public.uc_signature_assurance_text(p_action->'reason',4000)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
   e:=public.uc_signature_assurance_append(p_org=>p_org,p_stream=>head.id,p_expected=>p_expected,p_request=>p_request,p_kind=>'graphic_prepared',p_method=>'graphic_asset',p_reason=>p_action->>'reason',p_authority=>public.uc_signature_assurance_empty_authority(),p_policy=>b.policy_version_id,p_signature=>sig_id,p_document=>d.id,p_conclusion=>'graphic_prepared',p_party_role=>party,p_binding=>b.id);
  END IF;
 END IF;
 stored:=public.uc_signature_assurance_record_request(p_org,p_request,digest,operation,head.id,e.id,sig_id,e.revision,auth.uid(),party,e.binding_id);
 FOR person IN SELECT user_id,relation FROM public.uc_signature_assurance_file_people(sig)LOOP PERFORM public.uc_signature_assurance_track(p_org,'event',e.id,person.user_id,person.relation);PERFORM public.uc_signature_assurance_track(p_org,'request',p_request,person.user_id,person.relation);END LOOP;
 RETURN jsonb_build_object('receipt',public.uc_signature_assurance_receipt(stored),'result',jsonb_build_object('kind','signature','context',public.uc_signature_assurance_context(p_org,sig_id,party)));
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');
 WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.apply_signature_assurance(p_organization_id uuid,p_request_id uuid,p_expected_revision integer,p_action jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms' SET statement_timeout='10000ms'AS $fn$
DECLARE value jsonb;caps jsonb;operation text:=p_action->>'action';
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_active()THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF p_organization_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR jsonb_typeof(p_action)IS DISTINCT FROM'object'OR octet_length(p_action::text)>196608 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 PERFORM public.uc_signature_assurance_safe_authenticated_input(p_organization_id,p_action);
 IF operation='save_policy_draft'THEN value:=public.uc_signature_assurance_save_policy(p_organization_id,p_request_id,p_expected_revision,p_action);
 ELSIF operation='record_policy_decision'THEN value:=public.uc_signature_assurance_decide_policy(p_organization_id,p_request_id,p_expected_revision,p_action);
 ELSIF operation='bind_signature'THEN value:=public.uc_signature_assurance_bind_signature(p_organization_id,p_request_id,p_expected_revision,p_action);
 ELSIF operation='accept_agreement'THEN value:=public.uc_signature_assurance_accept_agreement(p_organization_id,p_request_id,p_expected_revision,p_action);
 ELSIF operation='confirm_consent'THEN value:=public.uc_signature_assurance_confirm_consent(p_organization_id,p_request_id,p_expected_revision,p_action);
 ELSIF operation='withdraw_consent'THEN value:=public.uc_signature_assurance_withdraw_consent(p_organization_id,p_request_id,p_expected_revision,p_action);
 ELSIF operation IN('confirm_sender','record_graphic_preparation','revoke_invitation','capture_receipt')THEN value:=public.uc_signature_assurance_auth_signature_action(p_organization_id,p_request_id,p_expected_revision,p_action);
 ELSE PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF value->'result'->>'kind'='signature'THEN caps:=value->'result'->'context'->'capabilities';
 ELSIF value->'result'->>'kind'='receipt'THEN caps:=value->'result'->'manifest'->'body'->'context'->'capabilities';
 ELSE caps:=jsonb_set(public.uc_signature_assurance_capabilities(p_organization_id),'{can_read}','true'::jsonb);END IF;
 RETURN value||jsonb_build_object('version',1,'ok',true,'scope',jsonb_build_object('actor_user_id',auth.uid(),'organization_id',p_organization_id),'capabilities',caps);
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');
 WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;


-- UC022 fragment 54_observed_actor_capture.sql
-- Explicit observed actor core. No JWT/role claims are manufactured.
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_own_current(p_org uuid,p_subject uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND auth.uid()=p_subject AND public.uc_signature_assurance_active(p_subject)
  AND EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org)
  AND(EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_subject AND organization_id=p_org)
   OR EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.user_id=p_subject AND c.organization_id=p_org AND e.status IN('active','completed'))
   OR public.uc_document_action_allowed(p_org,'read',NULL,NULL)
   OR EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.organization_id=p_org AND s.deleted_at IS NULL AND(s.recipient_user_id=p_subject OR s.sender_user_id=p_subject)AND public.uc_signature_actor_allowed(s.id,false,true))),false)
$fn$;
CREATE FUNCTION public.uc_signature_assurance_capture_document_as(
 p_org uuid,p_signature uuid,p_party text,p_expected_document_revision uuid,p_expected_html_sha256 text,p_actor uuid,p_invitation text DEFAULT NULL
)RETURNS public.uc_signature_assurance_document_snapshots
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout='2000ms'AS $fn$
DECLARE s public.document_signatures;r public.signature_revisions;head public.uc_signature_assurance_streams;
 proof public.uc_signature_assurance_file_proofs;captured public.uc_signature_assurance_document_snapshots;
 html text;locator text;key text;bucket text:='external-contracts';revision_id uuid;object_snapshot jsonb;
 original_file jsonb;new_id uuid:=gen_random_uuid();people uuid[];prior_people uuid[];primary_subject uuid;person record;
BEGIN
 IF p_party NOT IN('sender','recipient')OR p_party IS NULL OR p_org IS NULL OR p_signature IS NULL OR NOT public.uc_signature_assurance_sha(to_jsonb(p_expected_html_sha256))THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 SELECT *INTO s FROM public.document_signatures WHERE id=p_signature AND organization_id=p_org FOR SHARE NOWAIT;
 IF s.id IS NULL OR s.deleted_at IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF auth.role()='authenticated'THEN
  IF p_actor IS DISTINCT FROM auth.uid()OR p_invitation IS NOT NULL OR NOT public.uc_signature_assurance_active(p_actor)OR NOT public.uc_signature_assurance_signature_write(p_org,p_signature)OR NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSIF auth.role()='service_role'AND auth.uid()IS NULL THEN
  IF p_party<>'recipient'OR p_invitation IS NULL OR s.signature_token IS DISTINCT FROM p_invitation OR NOT public.uc_signature_token_access_allowed(s.id,false)OR p_actor IS NOT NULL AND NOT public.uc_signature_assurance_active(p_actor)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSE PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 -- Previously closed/legacy-signed rows cannot acquire a new canonical signing
 -- assurance merely by creating another snapshot or repeating an old request.
 IF s.status IN('signed','rejected','expired')OR s.signed_at IS NOT NULL OR p_party='sender'AND s.sender_signed_at IS NOT NULL
  THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 IF s.expires_at IS NOT NULL AND s.expires_at<=clock_timestamp()THEN PERFORM public.uc_signature_assurance_error('EXPIRED');END IF;
 SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_file_people(s);
 PERFORM public.uc_signature_assurance_file_fence(s,p_actor,true,NULL,NULL,people);
 IF auth.role()='authenticated'AND(NOT public.uc_signature_assurance_signature_write(p_org,p_signature)
  OR NOT public.uc_signature_assurance_signature_read(p_org,p_signature))THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 revision_id:=s.current_revision_id;
 IF revision_id IS NOT NULL THEN
  SELECT *INTO r FROM public.signature_revisions WHERE id=revision_id AND signature_id=s.id FOR SHARE NOWAIT;
  IF r.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  html:=r.document_html;locator:=r.file_url;
 ELSE html:=s.document_html;locator:=s.document_snapshot_url;END IF;
 IF revision_id IS DISTINCT FROM p_expected_document_revision OR html IS NULL OR octet_length(html)>1000000
  OR public.uc_signature_assurance_hash(html)IS DISTINCT FROM p_expected_html_sha256
  THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF locator IS NOT NULL THEN
  key:=public.uc_signature_locator_key(locator,bucket);
  IF key IS NULL OR key IS DISTINCT FROM locator OR NOT public.uc_signature_object_bound(s.id,bucket,key)
   OR auth.role()='authenticated'AND NOT public.uc_signature_storage_read(bucket,key)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  object_snapshot:=public.uc_signature_assurance_object_snapshot(bucket,key);
  SELECT *INTO proof FROM public.uc_signature_assurance_file_proofs p
   WHERE p.organization_id=p_org AND p.signature_id=p_signature AND p.party_role=p_party
    AND p.proof->'source'->'document_revision_id'IS NOT DISTINCT FROM coalesce(to_jsonb(revision_id),'null'::jsonb)
    AND p.proof->'source'->>'document_html_sha256'=p_expected_html_sha256 AND p.proof->'source'->>'purpose'='source'
    AND p.proof->'source'->>'bucket'=bucket AND p.proof->'source'->>'path'=key
    AND p.proof->'object_after'=object_snapshot
   ORDER BY p.verified_at DESC,p.id DESC LIMIT 1 FOR SHARE NOWAIT;
  IF proof.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  PERFORM 1 FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=proof.id AND organization_id=p_org AND relation<>'staff_attribution'FOR SHARE NOWAIT;
  SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO prior_people FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=proof.id AND organization_id=p_org AND relation<>'staff_attribution';
  PERFORM public.uc_signature_assurance_file_fence(s,p_actor,true,proof.subject_user_id,proof.recipient_user_id,prior_people);
  original_file:=proof.proof->'file';
 END IF;
 head:=public.uc_signature_assurance_stream(p_org,'signature',p_signature);
 SELECT CASE WHEN count(DISTINCT user_id)=1 THEN min(user_id::text)::uuid END INTO primary_subject
  FROM public.uc_signature_assurance_file_people(s)WHERE relation='subject';
 PERFORM public.uc_signature_assurance_token('document',new_id);
 INSERT INTO public.uc_signature_assurance_document_snapshots(id,organization_id,signature_id,party_role,document_revision_id,html_text,html_sha256,original_file,source_file_state,subject_user_id,recipient_user_id,captured_by)
  VALUES(new_id,p_org,p_signature,p_party,revision_id,html,p_expected_html_sha256,original_file,CASE WHEN original_file IS NULL THEN'not_present'ELSE'verified_bytes'END,primary_subject,s.recipient_user_id,p_actor)RETURNING *INTO captured;
 FOR person IN SELECT user_id,relation FROM public.uc_signature_assurance_file_people(s)LOOP
  PERFORM public.uc_signature_assurance_track(p_org,'document',new_id,person.user_id,person.relation);
  PERFORM public.uc_signature_assurance_track(p_org,'stream',p_signature,person.user_id,person.relation);
 END LOOP;
 FOR person IN SELECT unnest(coalesce(prior_people,'{}'::uuid[]))user_id LOOP
  PERFORM public.uc_signature_assurance_track(p_org,'document',new_id,person.user_id,'subject');
  PERFORM public.uc_signature_assurance_track(p_org,'stream',p_signature,person.user_id,'subject');
 END LOOP;
 PERFORM public.uc_signature_assurance_track(p_org,'document',new_id,p_actor,'staff_attribution');
 RETURN captured;
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_signature_assurance_capture_document(p_org uuid,p_signature uuid,p_party text,p_expected_document_revision uuid,p_expected_html_sha256 text)RETURNS public.uc_signature_assurance_document_snapshots
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 RETURN public.uc_signature_assurance_capture_document_as(p_org,p_signature,p_party,p_expected_document_revision,p_expected_html_sha256,auth.uid(),NULL);
END;$fn$;


-- UC022 fragment 55_invitation_file_verification.sql
-- Invitation-only technical byte verifier. Existing source-only facade remains narrow.
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_file_context_private(p_action jsonb,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;r public.signature_revisions;head public.uc_signature_assurance_streams;revision_id uuid;html text;locator text;path text;bucket text:='external-contracts';party text;people uuid[];source jsonb;object_snapshot jsonb;
BEGIN
 s:=public.uc_signature_assurance_file_actor(p_action,p_actor);
 SELECT*INTO head FROM public.uc_signature_assurance_streams WHERE organization_id=s.organization_id AND kind='signature'AND entity_id=s.id;
 PERFORM public.uc_signature_assurance_file_fence(s,p_actor,false);
 s:=public.uc_signature_assurance_file_actor(p_action,p_actor);
 revision_id:=CASE WHEN s.status='signed'THEN coalesce(s.signed_revision_id,s.current_revision_id)ELSE s.current_revision_id END;
 IF revision_id IS NOT NULL THEN
  SELECT*INTO r FROM public.signature_revisions WHERE id=revision_id AND signature_id=s.id FOR SHARE NOWAIT;
  IF r.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;html:=r.document_html;locator:=r.file_url;
 ELSE html:=s.document_html;locator:=s.document_snapshot_url;END IF;
 IF html IS NULL OR public.uc_signature_assurance_hash(html)IS DISTINCT FROM p_action->>'document_html_sha256'
  OR revision_id IS DISTINCT FROM public.storage_try_uuid(p_action->>'expected_document_revision_id')THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF p_action->>'purpose'='scan'THEN
  -- New unissued scan integration remains separate. Only an already signature-bound
  -- exact immutable scan can be verified by this new generic private proof helper.
  IF s.status='signed'THEN
   IF s.handwritten_scan_path IS DISTINCT FROM p_action->>'scan_path'THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;locator:=s.handwritten_scan_path;
  ELSE
   IF p_action->'address'->>'kind'<>'invitation'OR s.deleted_at IS NOT NULL OR s.signed_at IS NOT NULL OR s.status IN('rejected','expired')OR s.expires_at<=clock_timestamp()OR p_action->>'scan_path'!~('^'||s.organization_id::text||'/signed-scans/'||s.id::text||'-[A-Za-z0-9_-]{1,120}\.(pdf|png|jpg|jpeg)$')THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;locator:=p_action->>'scan_path';
  END IF;
 ELSIF s.status='signed'AND s.signed_source_path IS NOT NULL THEN bucket:=s.signed_source_bucket;locator:=s.signed_source_path;END IF;
 IF bucket NOT IN('external-contracts','signed-documents')OR locator IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 path:=public.uc_signature_locator_key(locator,bucket);
 -- Historical URL aliases need separate exact-origin review, never an assumed origin.
 -- New canonical raw-key writes work; ordinary legacy reads remain unchanged.
 IF path IS NULL OR path IS DISTINCT FROM locator OR NOT(public.uc_signature_object_bound(s.id,bucket,path)OR p_action->>'purpose'='scan'AND s.status<>'signed'AND p_action->'address'->>'kind'='invitation')THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF p_action->'address'->>'kind'='authenticated_signature'AND NOT public.uc_signature_assurance_as_signature_storage_read(p_actor,bucket,path)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 party:=CASE WHEN p_action->'address'->>'kind'='invitation'THEN'recipient'ELSE p_action->'address'->>'chosen_party'END;
 source:=jsonb_build_object('organization_id',s.organization_id,'signature_id',s.id,'chosen_party',party,'document_revision_id',revision_id,'document_html_sha256',public.uc_signature_assurance_hash(html),'purpose',p_action->>'purpose','bucket',bucket,'path',path);
 object_snapshot:=public.uc_signature_assurance_object_snapshot(bucket,path);
 RETURN jsonb_build_object('version',1,'ok',true,'kind','file_context','source',source,'object',object_snapshot);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_signature_assurance_attest_file_private(p_action jsonb,p_actor uuid,p_proof jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;head public.uc_signature_assurance_streams;ctx jsonb;stored public.uc_signature_assurance_file_proofs;request_id uuid;digest text;people uuid[];object_snapshot jsonb;file jsonb;source jsonb;new_id uuid:=gen_random_uuid();party text;
BEGIN
 s:=public.uc_signature_assurance_file_actor(p_action,p_actor);
 IF p_action->>'action'IS DISTINCT FROM'attest_file'THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 request_id:=(p_action->>'verification_request_id')::uuid;digest:=public.uc_signature_assurance_hash(jsonb_build_object('actor_user_id',p_actor,'action',p_action)::text);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_signature_source_verification:'||s.organization_id::text||':'||request_id::text,0))THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 SELECT*INTO stored FROM public.uc_signature_assurance_file_proofs WHERE organization_id=s.organization_id AND verification_request_id=request_id FOR SHARE NOWAIT;
 SELECT*INTO head FROM public.uc_signature_assurance_streams WHERE organization_id=s.organization_id AND kind='signature'AND entity_id=s.id;
 -- A replay remains bound to every original non-attribution subject. Current
 -- editable contracts/recipients cannot erase an earlier proof's privacy scope.
 PERFORM 1 FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=stored.id AND organization_id=s.organization_id AND relation<>'staff_attribution' FOR SHARE NOWAIT;
 SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=stored.id AND organization_id=s.organization_id AND relation<>'staff_attribution';
 PERFORM public.uc_signature_assurance_file_fence(s,p_actor,true,stored.subject_user_id,stored.recipient_user_id,people);
 s:=public.uc_signature_assurance_file_actor(p_action,p_actor);
 IF stored.id IS NOT NULL THEN
  IF stored.request_sha256 IS DISTINCT FROM digest OR stored.actor_user_id IS DISTINCT FROM p_actor THEN PERFORM public.uc_signature_assurance_error('REQUEST_CONFLICT');END IF;
  -- Replay is the original immutable receipt, not a reinterpretation of newer bytes.
  RETURN public.uc_signature_assurance_file_proof_receipt(stored,true);
 END IF;
 IF p_proof IS NULL OR p_proof='null'::jsonb THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF NOT public.uc_signature_assurance_shape(p_proof,ARRAY['assurance','source','object_before','file','object_after'])OR p_proof->>'assurance'IS DISTINCT FROM'trusted_service_reread'
  OR p_proof->'object_before'IS DISTINCT FROM p_proof->'object_after'THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ctx:=public.uc_signature_assurance_file_context_private(p_action,p_actor);source:=ctx->'source';object_snapshot:=ctx->'object';file:=p_proof->'file';
 IF source IS DISTINCT FROM p_proof->'source'OR object_snapshot IS DISTINCT FROM p_proof->'object_after'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF NOT public.uc_signature_assurance_shape(file,ARRAY['bucket','path','sha256','bytes','mime'])OR NOT public.uc_signature_assurance_sha(file->'sha256')OR NOT public.uc_signature_assurance_integer(file->'bytes',1,20971520)
  OR file->>'bucket'IS DISTINCT FROM source->>'bucket'OR file->>'path'IS DISTINCT FROM source->>'path'
  OR NOT public.uc_signature_assurance_text(file->'mime',200)OR file->>'mime'!~'^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$'
  OR object_snapshot->'reported_size'<>'null'::jsonb AND object_snapshot->'reported_size'IS DISTINCT FROM file->'bytes'
  OR object_snapshot->'reported_mime'<>'null'::jsonb AND object_snapshot->'reported_mime'IS DISTINCT FROM file->'mime'
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF p_action->>'purpose'='scan'AND s.status='signed'AND(s.handwritten_scan_hash IS NULL OR s.handwritten_scan_hash IS DISTINCT FROM file->>'sha256')
  OR p_action->>'purpose'='source'AND s.status='signed'AND s.signed_source_path IS NOT NULL AND(s.signed_source_hash IS NULL OR s.signed_source_hash IS DISTINCT FROM file->>'sha256')
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 party:=source->>'chosen_party';
 INSERT INTO public.uc_signature_assurance_file_proof_tokens(transaction_id,proof_id,operation)VALUES(txid_current(),new_id,'append');
 INSERT INTO public.uc_signature_assurance_file_proofs(id,organization_id,verification_request_id,request_sha256,actor_user_id,signature_id,party_role,subject_user_id,recipient_user_id,proof)
 VALUES(new_id,s.organization_id,request_id,digest,p_actor,s.id,party,head.subject_user_id,s.recipient_user_id,p_proof)RETURNING*INTO stored;
 INSERT INTO public.uc_signature_assurance_file_proof_links(proof_id,organization_id,user_id,relation)
 SELECT new_id,s.organization_id,p.user_id,p.relation FROM public.uc_signature_assurance_file_people(s)p
 UNION SELECT new_id,s.organization_id,p_actor,'staff_attribution'WHERE p_actor IS NOT NULL;
 DELETE FROM public.uc_signature_assurance_file_proof_tokens WHERE transaction_id=txid_current()AND proof_id=new_id AND operation='append';
 RETURN public.uc_signature_assurance_file_proof_receipt(stored,false);
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_verify_invitation_file_service(p_action jsonb,p_observed_actor_user_id uuid,p_request_ip inet DEFAULT NULL,p_request_user_agent text DEFAULT NULL,p_original_proof jsonb DEFAULT NULL,p_scan_proof jsonb DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='10000ms' SET lock_timeout='2000ms'AS $fn$
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR p_action->'address'->>'kind'IS DISTINCT FROM'invitation'OR p_observed_actor_user_id IS NOT NULL AND NOT public.uc_signature_assurance_active(p_observed_actor_user_id)OR p_request_ip IS NOT NULL OR p_request_user_agent IS NOT NULL OR coalesce(p_scan_proof,'null'::jsonb)IS DISTINCT FROM'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_signature_assurance_file_action(p_action);
 IF p_action->>'action'='file_context'THEN
  IF coalesce(p_original_proof,'null'::jsonb)IS DISTINCT FROM'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  BEGIN
  -- absent source is a separate private result, never a catch-all for inaccessible bytes.
  IF p_action->>'purpose'='source'AND EXISTS(SELECT 1 FROM public.document_signatures s LEFT JOIN public.signature_revisions r ON r.id=s.current_revision_id AND r.signature_id=s.id WHERE s.signature_token=p_action->'address'->>'token'AND(s.current_revision_id IS NULL AND s.document_snapshot_url IS NULL OR s.current_revision_id IS NOT NULL AND r.id IS NOT NULL AND r.file_url IS NULL)AND s.signed_source_path IS NULL)THEN
   PERFORM public.uc_signature_assurance_invitation_context(p_action->'address'->>'token',p_observed_actor_user_id);
   RETURN jsonb_build_object('version',1,'ok',true,'kind','file_absent');
  END IF;
  RETURN public.uc_signature_assurance_file_context_private(p_action,p_observed_actor_user_id);
 END;
 ELSIF p_action->>'action'='attest_file'THEN RETURN public.uc_signature_assurance_attest_file_private(p_action,p_observed_actor_user_id,p_original_proof);END IF;
 PERFORM public.uc_signature_assurance_error('INVALID_INPUT');
END;$fn$;


-- UC022 fragment 56_invitation_context.sql
-- Recipient-only service context, authorized by the real invitation plus optional
-- original JWT observation. No sender policy, internal document path or account is exposed.
CREATE FUNCTION public.uc_signature_assurance_invitation_context(p_token text,p_actor uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
DECLARE s public.document_signatures;r public.signature_revisions;head public.uc_signature_assurance_streams;b public.uc_signature_assurance_bindings;v public.uc_signature_assurance_policy_versions;d public.uc_signature_assurance_document_snapshots;e public.uc_signature_assurance_events;decision public.uc_signature_assurance_policy_decisions;html text;binding jsonb;policy jsonb;missing text[]:='{}';people uuid[];account boolean;purpose text:='unconfigured';limits text[]:=ARRAY['Подтверждается наблюдаемый факт действия на платформе. Проверка криптографической подписи, личности человека и юридической действительности не выполнялась.'];
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR NOT public.uc_signature_assurance_text(to_jsonb(p_token),200)OR length(p_token)<16 OR p_token~'[[:space:]]'OR p_actor IS NOT NULL AND NOT public.uc_signature_assurance_active(p_actor)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT *INTO s FROM public.document_signatures WHERE signature_token=p_token FOR SHARE NOWAIT;
 IF s.id IS NULL OR NOT public.uc_signature_token_access_allowed(s.id,false)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_signature_assurance_file_fence(s,p_actor,false);
 SELECT *INTO head FROM public.uc_signature_assurance_streams WHERE organization_id=s.organization_id AND kind='signature'AND entity_id=s.id FOR SHARE NOWAIT;
 IF s.current_revision_id IS NOT NULL THEN SELECT *INTO r FROM public.signature_revisions WHERE id=s.current_revision_id AND signature_id=s.id FOR SHARE NOWAIT;IF r.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;html:=r.document_html;ELSE html:=s.document_html;END IF;
 IF html IS NULL OR octet_length(html)>1000000 THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 account:=p_actor IS NOT NULL AND p_actor=s.recipient_user_id AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_actor AND u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL AND(s.recipient_email IS NULL OR lower(btrim(u.email))=lower(btrim(s.recipient_email))));
 SELECT *INTO e FROM public.uc_signature_assurance_events WHERE organization_id=s.organization_id AND signature_id=s.id AND party_role='recipient'ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
 SELECT *INTO b FROM public.uc_signature_assurance_bindings WHERE organization_id=s.organization_id AND signature_id=s.id AND party_role='recipient'ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
 IF s.deleted_at IS NOT NULL OR s.signed_at IS NOT NULL OR s.status IN('signed','rejected','expired')OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_events terminal WHERE terminal.organization_id=s.organization_id AND terminal.signature_id=s.id AND terminal.party_role='recipient'AND terminal.kind IN('account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked'))THEN missing:=array_append(missing,'CLOSED');END IF;
 IF s.expires_at<=clock_timestamp()THEN missing:=array_append(missing,'EXPIRED');END IF;
 IF b.id IS NULL THEN missing:=missing||ARRAY['CLASSIFICATION_REQUIRED','POLICY_REQUIRED'];
 ELSE
  SELECT *INTO v FROM public.uc_signature_assurance_policy_versions WHERE id=b.policy_version_id AND organization_id=s.organization_id FOR SHARE NOWAIT;SELECT *INTO d FROM public.uc_signature_assurance_document_snapshots WHERE id=b.document_snapshot_id AND organization_id=s.organization_id AND signature_id=s.id AND party_role='recipient'FOR SHARE NOWAIT;SELECT *INTO decision FROM public.uc_signature_assurance_policy_decisions WHERE policy_version_id=v.id AND organization_id=s.organization_id ORDER BY stream_revision DESC LIMIT 1 FOR SHARE NOWAIT;
  IF v.id IS NULL OR d.id IS NULL OR decision.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  purpose:=v.body->>'purpose';limits:=array_append(limits,v.body->>'limitations');
  IF NOT public.uc_signature_assurance_policy_eligible(s.organization_id,v.id)THEN missing:=array_append(missing,'POLICY_NOT_ACCEPTED');END IF;
  IF b.policy_sha256 IS DISTINCT FROM v.body_sha256 OR b.policy_decision_revision IS DISTINCT FROM decision.stream_revision THEN missing:=array_append(missing,'POLICY_CHANGED');END IF;
  IF d.document_revision_id IS DISTINCT FROM s.current_revision_id OR d.html_sha256 IS DISTINCT FROM public.uc_signature_assurance_hash(html)THEN missing:=array_append(missing,'SOURCE_CHANGED');END IF;
  IF v.body->>'method'='authenticated_account_confirmation'AND NOT account THEN missing:=array_append(missing,'IDENTITY_MISMATCH');END IF;
  binding:=jsonb_build_object('id',b.id,'organization_id',b.organization_id,'signature_id',b.signature_id,'party_role',b.party_role,'revision',b.revision,'document_revision_id',d.document_revision_id,'document_html_sha256',d.html_sha256,'classification',b.classification,'policy_version_id',b.policy_version_id,'policy_sha256',b.policy_sha256,'policy_decision_revision',b.policy_decision_revision,'agreement_sha256',b.agreement_sha256);
  policy:=jsonb_build_object('id',v.id,'family_id',v.family_id,'organization_id',v.organization_id,'version',v.version,'body_sha256',v.body_sha256,'classification',v.body->'classification','method',v.body->'method','purpose',v.body->'purpose','identity_requirement',v.body->'identity_requirement','authority_requirement',v.body->'authority_requirement','agreement',v.body->'agreement','consent',v.body->'consent','basis_explanation',v.body->'basis'->'explanation','legal_sources',v.body->'basis'->'sources','limitations',v.body->'limitations');
 END IF;
 SELECT coalesce(array_agg(DISTINCT code ORDER BY code),'{}'::text[])INTO missing FROM unnest(missing)code;
 RETURN jsonb_build_object('organization_id',s.organization_id,'signature_id',s.id,'current_document_revision_id',s.current_revision_id,'current_document_html_sha256',public.uc_signature_assurance_hash(html),'legacy_status',s.status,'legacy_method',s.signature_method,'latest_event_revision',coalesce(head.revision,0),'party_role','recipient','latest_party_event_revision',coalesce(e.revision,0),'conclusion',coalesce(e.payload->>'conclusion',CASE WHEN s.signed_at IS NULL THEN'not_confirmed'ELSE'legacy_unknown'END),'requirements',jsonb_build_object('eligible',cardinality(missing)=0,'missing',to_jsonb(missing),'purpose',purpose,'limitations',to_jsonb(limits)),'binding',binding,'policy',policy,'supported_methods',jsonb_build_array('graphic_asset','scan_received','bearer_invitation_confirmation','authenticated_account_confirmation'),'unsupported_methods',jsonb_build_array(jsonb_build_object('method','verified_email_challenge_confirmation','verified',false,'reason','VERIFIER_NOT_IMPLEMENTED'),jsonb_build_object('method','external_qualified_signature','verified',false,'reason','VERIFIER_NOT_IMPLEMENTED')),'authenticated_recipient',account);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;


-- UC022 fragment 57_verified_scan_append.sql
-- Scan event has a real trusted reread proof; the raw file fact is committed atomically with the event.
CREATE FUNCTION public.uc_signature_assurance_append_scan(p_org uuid,p_stream uuid,p_expected integer,p_request uuid,p_kind text,p_method text,p_reason text,p_authority jsonb,
 p_policy uuid DEFAULT NULL,p_signature uuid DEFAULT NULL,p_document uuid DEFAULT NULL,p_agreement uuid DEFAULT NULL,p_consent uuid DEFAULT NULL,
 p_conclusion text DEFAULT 'not_confirmed',p_actor uuid DEFAULT auth.uid(),p_declared_name text DEFAULT NULL,p_party_role text DEFAULT NULL,p_binding uuid DEFAULT NULL,p_scan jsonb DEFAULT NULL) RETURNS public.uc_signature_assurance_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE head public.uc_signature_assurance_streams;version_row public.uc_signature_assurance_policy_versions;
 document_row public.uc_signature_assurance_document_snapshots;binding_row public.uc_signature_assurance_bindings;bound_document public.uc_signature_assurance_document_snapshots;agreement_row public.uc_signature_assurance_agreements;consent_row public.uc_signature_assurance_consents;
 event_row public.uc_signature_assurance_events;event_id uuid:=gen_random_uuid();actor_fact jsonb;payload jsonb;at_time timestamptz:=clock_timestamp();recipient uuid;subject uuid;signer boolean;
BEGIN
 IF p_kind IS DISTINCT FROM'scan_received'OR p_method IS DISTINCT FROM'scan_received'OR NOT public.uc_signature_assurance_shape(p_scan,ARRAY['bucket','path','sha256','bytes','mime'])OR NOT public.uc_signature_assurance_sha(p_scan->'sha256')OR NOT public.uc_signature_assurance_integer(p_scan->'bytes',1,20971520)OR p_scan->>'mime'NOT IN('application/pdf','image/png','image/jpeg')OR NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_file_proofs proof WHERE proof.organization_id=p_org AND proof.signature_id=p_signature AND proof.party_role='recipient'AND proof.proof->'source'->>'purpose'='scan'AND proof.proof->'file'=p_scan AND proof.proof->'object_after'=public.uc_signature_assurance_object_snapshot(p_scan->>'bucket',p_scan->>'path'))THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR p_expected=2147483647 OR NOT public.uc_signature_assurance_text(to_jsonb(p_reason),4000)
 OR NOT coalesce(p_kind IN('policy_created','policy_source_checked','policy_reviewed','policy_accepted','policy_retired','signature_bound','graphic_prepared','bearer_confirmed','account_confirmed','scan_received','sender_confirmed','agreement_accepted','consent_confirmed','consent_withdrawn','invitation_revoked','recipient_rejected'),false)
 OR NOT coalesce(p_method IN('graphic_asset','scan_received','bearer_invitation_confirmation','authenticated_account_confirmation','legacy_unknown'),false)
 OR NOT coalesce(p_conclusion IN('not_confirmed','factual_confirmation','policy_eligible_account_confirmation','scan_received','graphic_prepared','legacy_unknown'),false)
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF NOT coalesce(public.uc_signature_assurance_active(p_actor)OR p_actor IS NULL AND auth.role()='service_role' AND auth.uid()IS NULL,false)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT*INTO head FROM public.uc_signature_assurance_streams WHERE id=p_stream AND organization_id=p_org FOR UPDATE NOWAIT;
 IF head.id IS NULL OR head.revision<>p_expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF(head.kind='signature')IS DISTINCT FROM(p_signature IS NOT NULL)OR p_signature IS NOT NULL AND p_signature<>head.entity_id THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF head.kind IS DISTINCT FROM(CASE WHEN p_kind LIKE'policy_%'THEN'policy'WHEN p_kind='agreement_accepted'THEN'agreement'WHEN p_kind LIKE'consent_%'THEN'consent'ELSE'signature'END)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF head.kind='signature' THEN
  IF p_party_role IS NULL OR p_party_role NOT IN('sender','recipient')OR(p_binding IS NULL)IS DISTINCT FROM(p_policy IS NULL)
   OR p_kind='sender_confirmed'AND p_party_role<>'sender'
   OR p_kind IN('account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked')AND p_party_role<>'recipient'
   OR p_kind IN('signature_bound','account_confirmed','sender_confirmed')AND(p_binding IS NULL OR p_document IS NULL)
  THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ELSE
  IF p_party_role IS NOT NULL OR p_binding IS NOT NULL OR p_document IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 END IF;
 IF p_kind IN('account_confirmed','sender_confirmed')AND(p_method<>'authenticated_account_confirmation'OR p_actor IS NULL)
  OR p_kind='bearer_confirmed'AND p_method<>'bearer_invitation_confirmation'
  OR p_kind='scan_received'AND p_method<>'scan_received'
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF p_policy IS NOT NULL THEN
  SELECT*INTO version_row FROM public.uc_signature_assurance_policy_versions WHERE id=p_policy AND organization_id=p_org;
  IF version_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 END IF;
 IF p_document IS NOT NULL THEN
  SELECT*INTO document_row FROM public.uc_signature_assurance_document_snapshots WHERE id=p_document AND organization_id=p_org AND signature_id=p_signature;
  IF document_row.id IS NULL OR document_row.party_role IS DISTINCT FROM p_party_role THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  subject:=document_row.subject_user_id;recipient:=document_row.recipient_user_id;
 END IF;
 IF p_binding IS NOT NULL THEN
  SELECT*INTO binding_row FROM public.uc_signature_assurance_bindings WHERE id=p_binding AND organization_id=p_org AND signature_id=p_signature AND party_role=p_party_role;
  SELECT*INTO bound_document FROM public.uc_signature_assurance_document_snapshots WHERE id=binding_row.document_snapshot_id AND organization_id=p_org;
  IF binding_row.id IS NULL OR bound_document.id IS NULL OR binding_row.policy_version_id IS DISTINCT FROM p_policy OR binding_row.policy_sha256 IS DISTINCT FROM version_row.body_sha256
   OR binding_row.classification IS DISTINCT FROM version_row.body->'classification' OR binding_row.agreement_sha256 IS DISTINCT FROM(version_row.body->'agreement'->>'sha256')
   OR document_row.id IS NULL OR document_row.document_revision_id IS DISTINCT FROM bound_document.document_revision_id OR document_row.html_sha256 IS DISTINCT FROM bound_document.html_sha256 OR document_row.original_file IS DISTINCT FROM bound_document.original_file
   OR p_kind='signature_bound'AND(binding_row.revision<>head.revision+1 OR p_document IS DISTINCT FROM binding_row.document_snapshot_id)
   OR p_kind<>'signature_bound'AND(binding_row.revision>head.revision OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings newer WHERE newer.organization_id=p_org AND newer.signature_id=p_signature AND newer.party_role=p_party_role AND newer.revision>binding_row.revision))
  THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 END IF;
 IF p_agreement IS NOT NULL THEN
  SELECT*INTO agreement_row FROM public.uc_signature_assurance_agreements WHERE id=p_agreement AND organization_id=p_org;
  IF agreement_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_REQUIRED');END IF;
  IF agreement_row.subject_user_id IS DISTINCT FROM p_actor OR agreement_row.policy_version_id IS DISTINCT FROM p_policy OR agreement_row.policy_sha256 IS DISTINCT FROM version_row.body_sha256 OR agreement_row.terms->>'sha256'IS DISTINCT FROM version_row.body->'agreement'->>'sha256'THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
 END IF;
 IF p_kind IN('account_confirmed','sender_confirmed')AND version_row.body->>'purpose'='account_pep'AND p_agreement IS NULL THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_REQUIRED');END IF;
 IF p_conclusion='policy_eligible_account_confirmation'AND(p_kind NOT IN('account_confirmed','sender_confirmed')OR p_policy IS NULL OR p_binding IS NULL OR p_agreement IS NULL OR p_method<>'authenticated_account_confirmation'OR version_row.body->>'purpose'IS DISTINCT FROM'account_pep')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF p_consent IS NOT NULL THEN
  SELECT*INTO consent_row FROM public.uc_signature_assurance_consents WHERE id=p_consent AND organization_id=p_org;
  IF consent_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 END IF;
 subject:=coalesce(head.subject_user_id,subject);actor_fact:=public.uc_signature_assurance_actor(p_actor,p_declared_name);
 payload:=jsonb_build_object('id',event_id,'organization_id',p_org,'stream_kind',head.kind,'stream_id',head.id,'revision',head.revision+1,
 'kind',p_kind,'server_at',public.uc_signature_assurance_utc(at_time),'actor',actor_fact,'authority',p_authority,'method',p_method,
  'policy_version_id',p_policy,'policy_sha256',version_row.body_sha256,'signature_id',p_signature,'party_role',p_party_role,'binding_id',p_binding,'document_snapshot_id',p_document,
 'document_revision_id',document_row.document_revision_id,'document_html_sha256',document_row.html_sha256,'original_file',document_row.original_file,'scan_file',p_scan,
 'agreement_event_id',p_agreement,'agreement_sha256',agreement_row.terms->>'sha256','consent_snapshot_id',p_consent,
 'conclusion',p_conclusion,'explanation',p_reason,'request_id',p_request,'cryptographic_verification','not_performed','time_assurance','platform_server_time');
 PERFORM public.uc_signature_assurance_token('event',event_id);
 INSERT INTO public.uc_signature_assurance_events(id,organization_id,stream_id,stream_kind,revision,kind,payload,request_id,subject_user_id,recipient_user_id,actor_user_id,
 signature_id,party_role,binding_id,document_snapshot_id,policy_version_id,agreement_event_id,consent_snapshot_id,server_at)
 VALUES(event_id,p_org,head.id,head.kind,head.revision+1,p_kind,payload,p_request,subject,recipient,p_actor,p_signature,p_party_role,p_binding,p_document,p_policy,p_agreement,p_consent,at_time)RETURNING*INTO event_row;
 PERFORM public.uc_signature_assurance_token('stream',head.id);
 UPDATE public.uc_signature_assurance_streams SET revision=head.revision+1 WHERE id=head.id AND revision=head.revision;
 IF NOT FOUND THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 signer:=p_kind IN('account_confirmed','sender_confirmed','agreement_accepted','consent_confirmed','consent_withdrawn');
 PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,subject,'subject');
 PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,recipient,'recipient');
 PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,p_actor,CASE WHEN signer THEN'actual_personal_signer'ELSE'staff_attribution'END);
 RETURN event_row;
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;


-- UC022 fragment 58_invitation_commands.sql
-- Exact invitation commands. Service identity is an observation from the original
-- request JWT, never a body-selected user or manufactured authenticated session.
CREATE FUNCTION public.uc_signature_assurance_public_action(p_action jsonb)RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE keys text[];operation text:=p_action->>'action';
BEGIN
 IF operation='context'THEN keys:=ARRAY['action','token','party_role'];
 ELSIF operation='reject'THEN keys:=ARRAY['action','token','party_role','request_id','expected_revision','expected_document_revision_id','reason'];
 ELSIF operation='receive_scan'THEN keys:=ARRAY['action','token','party_role','request_id','expected_revision','binding_id','expected_document_revision_id','document_html_sha256','policy_sha256','policy_decision_revision','scan_path','declared_full_name','declaration','confirmed'];
 ELSIF operation='confirm'THEN
  keys:=ARRAY['action','token','party_role','request_id','expected_revision','expected_document_revision_id','document_html_sha256','declared_full_name','authority','confirmed','method','binding_id','policy_sha256','policy_decision_revision'];
  IF p_action->>'method'='authenticated_account_confirmation'THEN keys:=keys||ARRAY['agreement_sha256','agreement_event_id','agreement_accepted'];ELSIF p_action->>'method'IS DISTINCT FROM'bearer_invitation_confirmation'THEN PERFORM public.uc_signature_assurance_error('METHOD_UNSUPPORTED');END IF;
 ELSE PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF NOT public.uc_signature_assurance_shape(p_action,keys)OR p_action->>'party_role'IS DISTINCT FROM'recipient'OR NOT public.uc_signature_assurance_text(p_action->'token',200)OR length(p_action->>'token')<16 OR p_action->>'token'~'[[:space:]]'THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF operation='context'THEN RETURN;END IF;
 IF NOT public.uc_signature_assurance_uuid(p_action->'request_id')OR NOT public.uc_signature_assurance_integer(p_action->'expected_revision',0,2147483646)OR p_action->'expected_document_revision_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_action->'expected_document_revision_id')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF operation='reject'THEN IF NOT public.uc_signature_assurance_text(p_action->'reason',4000)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;RETURN;END IF;
 IF p_action->'confirmed'IS DISTINCT FROM'true'::jsonb OR NOT public.uc_signature_assurance_sha(p_action->'document_html_sha256')OR NOT public.uc_signature_assurance_text(p_action->'declared_full_name',300)OR(p_action->'binding_id'='null'::jsonb)IS DISTINCT FROM(p_action->'policy_sha256'='null'::jsonb)OR(p_action->'binding_id'='null'::jsonb)IS DISTINCT FROM(p_action->'policy_decision_revision'='null'::jsonb)OR p_action->'binding_id'<>'null'::jsonb AND(NOT public.uc_signature_assurance_uuid(p_action->'binding_id')OR NOT public.uc_signature_assurance_sha(p_action->'policy_sha256')OR NOT public.uc_signature_assurance_integer(p_action->'policy_decision_revision',1,2147483646))THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF operation='receive_scan'THEN
  IF NOT public.uc_signature_assurance_text(p_action->'scan_path',2000)OR NOT public.uc_signature_assurance_text(p_action->'declaration',4000)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ELSIF p_action->>'method'='authenticated_account_confirmation'THEN
  IF NOT public.uc_signature_assurance_uuid(p_action->'binding_id')OR NOT public.uc_signature_assurance_sha(p_action->'agreement_sha256')OR p_action->'agreement_event_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_action->'agreement_event_id')OR p_action->'agreement_accepted'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 END IF;
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_invitation_authority(p_org uuid,p_actor uuid,p_value jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT public.uc_signature_assurance_shape(p_value,ARRAY['kind','declaration','document_reference'])OR NOT coalesce(p_value->>'kind'IN('self','declared_representative','unknown'),false)OR p_value->'document_reference'IS DISTINCT FROM'null'::jsonb OR p_value->'declaration'<>'null'::jsonb AND NOT public.uc_signature_assurance_text(p_value->'declaration',4000)OR p_value->>'kind'='declared_representative'AND p_value->'declaration'='null'::jsonb THEN PERFORM public.uc_signature_assurance_error('AUTHORITY_REQUIRED');END IF;
 RETURN p_value||jsonb_build_object('verification','not_verified');
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_service(p_action jsonb,p_observed_actor_user_id uuid,p_request_ip text DEFAULT NULL,p_request_user_agent text DEFAULT NULL,p_original_proof jsonb DEFAULT NULL,p_scan_proof jsonb DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='10000ms' SET lock_timeout='2000ms'AS $fn$
#variable_conflict use_column
DECLARE s public.document_signatures;ctx jsonb;head public.uc_signature_assurance_streams;stored public.uc_signature_assurance_requests;b public.uc_signature_assurance_bindings;v public.uc_signature_assurance_policy_versions;decision public.uc_signature_assurance_policy_decisions;d public.uc_signature_assurance_document_snapshots;a public.uc_signature_assurance_agreements;e public.uc_signature_assurance_events;agreement_head public.uc_signature_assurance_streams;agreement_event public.uc_signature_assurance_events;scan_ctx jsonb;file_action jsonb;people uuid[];person record;operation text:=p_action->>'action';actor uuid:=p_observed_actor_user_id;request_id uuid;expected integer;digest text;authority jsonb;method text;conclusion text;terms jsonb;rendered text;org_name text;new_agreement uuid;proof_row public.uc_signature_assurance_file_proofs;
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR actor IS NOT NULL AND NOT public.uc_signature_assurance_active(actor)OR p_request_ip IS NOT NULL OR p_request_user_agent IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_signature_assurance_public_action(p_action);
 IF octet_length(p_action::text)>196608 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 ctx:=public.uc_signature_assurance_invitation_context(p_action->>'token',actor);
 SELECT *INTO s FROM public.document_signatures WHERE id=(ctx->>'signature_id')::uuid AND organization_id=(ctx->>'organization_id')::uuid FOR SHARE NOWAIT;
 IF public.uc_signature_assurance_credential_source(s.organization_id,(p_action-'token')::text)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF operation='context'THEN
  IF coalesce(p_original_proof,'null'::jsonb)<>'null'::jsonb OR coalesce(p_scan_proof,'null'::jsonb)<>'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  RETURN jsonb_build_object('version',1,'ok',true,'kind','context','context',ctx);
 END IF;
 request_id:=(p_action->>'request_id')::uuid;expected:=(p_action->>'expected_revision')::integer;
 SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_file_people(s);
 PERFORM public.uc_signature_assurance_file_fence(s,actor,true,NULL,NULL,people);PERFORM public.uc_signature_assurance_fence(s.organization_id,people,true,s.id,request_id,actor);
 ctx:=public.uc_signature_assurance_invitation_context(p_action->>'token',actor);
 digest:=public.uc_signature_assurance_hash(jsonb_build_object('organization_id',s.organization_id,'signature_id',s.id,'action',p_action-'token')::text);
 stored:=public.uc_signature_assurance_request(s.organization_id,request_id,digest,actor);
 IF stored.request_id IS NOT NULL THEN
  -- Every original non-attribution participant remains in the fence even when
  -- current mutable document/recipient associations have changed.
  SELECT coalesce(array_agg(DISTINCT person ORDER BY person),'{}'::uuid[])INTO people FROM(
   SELECT p.user_id person FROM public.uc_signature_assurance_participants p WHERE p.organization_id=s.organization_id AND p.relation<>'staff_attribution'AND(
    p.object_kind='request'AND p.object_id=stored.request_id OR p.object_kind='event'AND p.object_id=stored.event_id OR p.object_kind='binding'AND p.object_id=stored.binding_id
    OR p.object_kind='document'AND p.object_id IN(SELECT oldevent.document_snapshot_id FROM public.uc_signature_assurance_events oldevent WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id))
   UNION SELECT oldevent.subject_user_id FROM public.uc_signature_assurance_events oldevent WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id
   UNION SELECT oldevent.recipient_user_id FROM public.uc_signature_assurance_events oldevent WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id
   UNION SELECT olddoc.subject_user_id FROM public.uc_signature_assurance_document_snapshots olddoc JOIN public.uc_signature_assurance_events oldevent ON oldevent.document_snapshot_id=olddoc.id AND oldevent.organization_id=olddoc.organization_id WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id
   UNION SELECT olddoc.recipient_user_id FROM public.uc_signature_assurance_document_snapshots olddoc JOIN public.uc_signature_assurance_events oldevent ON oldevent.document_snapshot_id=olddoc.id AND oldevent.organization_id=olddoc.organization_id WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id
  )known WHERE person IS NOT NULL;
  PERFORM public.uc_signature_assurance_file_fence(s,actor,true,NULL,NULL,people);
  IF stored.action IS DISTINCT FROM operation OR stored.stream_id IS DISTINCT FROM s.id OR stored.party_role IS DISTINCT FROM'recipient'THEN PERFORM public.uc_signature_assurance_error('REQUEST_CONFLICT');END IF;
  RETURN jsonb_build_object('version',1,'ok',true,'kind','confirmation','context',ctx,'receipt',public.uc_signature_assurance_receipt(stored,true),'certificate_state','not_requested');
 END IF;
 head:=public.uc_signature_assurance_stream(s.organization_id,'signature',s.id);
 IF head.revision<>expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF ctx->'requirements'->'missing'?'CLOSED'THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 IF ctx->'requirements'->'missing'?'EXPIRED'THEN PERFORM public.uc_signature_assurance_error('EXPIRED');END IF;
 IF coalesce(p_action->'expected_document_revision_id','null'::jsonb)IS DISTINCT FROM ctx->'current_document_revision_id'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF operation='reject'THEN
  IF coalesce(p_original_proof,'null'::jsonb)<>'null'::jsonb OR coalesce(p_scan_proof,'null'::jsonb)<>'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  e:=public.uc_signature_assurance_append(p_org=>s.organization_id,p_stream=>head.id,p_expected=>expected,p_request=>request_id,p_kind=>'recipient_rejected',p_method=>'legacy_unknown',p_reason=>p_action->>'reason',p_authority=>public.uc_signature_assurance_empty_authority(),p_signature=>s.id,p_actor=>actor,p_party_role=>'recipient');
 ELSE
  IF p_action->>'document_html_sha256'IS DISTINCT FROM ctx->>'current_document_html_sha256'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  IF p_action->'binding_id'IS DISTINCT FROM coalesce(ctx->'binding'->'id','null'::jsonb)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  IF ctx->'binding'<>'null'::jsonb THEN
   SELECT *INTO b FROM public.uc_signature_assurance_bindings WHERE id=(ctx->'binding'->>'id')::uuid AND organization_id=s.organization_id AND signature_id=s.id AND party_role='recipient'FOR SHARE NOWAIT;SELECT *INTO v FROM public.uc_signature_assurance_policy_versions WHERE id=b.policy_version_id AND organization_id=s.organization_id FOR SHARE NOWAIT;SELECT *INTO decision FROM public.uc_signature_assurance_policy_decisions WHERE policy_version_id=v.id AND organization_id=s.organization_id ORDER BY stream_revision DESC LIMIT 1 FOR SHARE NOWAIT;
   IF NOT public.uc_signature_assurance_policy_eligible(s.organization_id,v.id)THEN PERFORM public.uc_signature_assurance_error('POLICY_NOT_ACCEPTED');END IF;
   IF b.policy_sha256 IS DISTINCT FROM p_action->>'policy_sha256'OR v.body_sha256 IS DISTINCT FROM b.policy_sha256 OR b.policy_decision_revision IS DISTINCT FROM(p_action->>'policy_decision_revision')::integer OR b.policy_decision_revision IS DISTINCT FROM decision.stream_revision THEN PERFORM public.uc_signature_assurance_error('POLICY_CHANGED');END IF;
  END IF;
  method:=CASE WHEN operation='receive_scan'THEN'scan_received'ELSE p_action->>'method'END;
  IF b.id IS NOT NULL AND v.body->>'method'IS DISTINCT FROM method THEN PERFORM public.uc_signature_assurance_error('METHOD_UNSUPPORTED');END IF;
  IF method='authenticated_account_confirmation'AND NOT(ctx->>'authenticated_recipient')::boolean THEN PERFORM public.uc_signature_assurance_error('IDENTITY_MISMATCH');END IF;
  authority:=CASE WHEN operation='receive_scan'THEN jsonb_build_object('kind','declared_representative','declaration',p_action->>'declaration','document_reference',NULL,'verification','not_verified')ELSE public.uc_signature_assurance_invitation_authority(s.organization_id,actor,p_action->'authority')END;
  IF b.id IS NOT NULL AND authority->>'kind'IS DISTINCT FROM v.body->>'authority_requirement'THEN PERFORM public.uc_signature_assurance_error('AUTHORITY_REQUIRED');END IF;
  d:=public.uc_signature_assurance_capture_document_as(s.organization_id,s.id,'recipient',s.current_revision_id,p_action->>'document_html_sha256',actor,p_action->>'token');
  IF coalesce(p_original_proof,'null'::jsonb)IS DISTINCT FROM coalesce(d.original_file,'null'::jsonb)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  IF method='authenticated_account_confirmation'THEN
   terms:=v.body->'agreement';
   IF terms IS NULL OR terms='null'::jsonb OR terms->>'sha256'IS DISTINCT FROM p_action->>'agreement_sha256'THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
   IF p_action->'agreement_event_id'<>'null'::jsonb THEN
    SELECT *INTO a FROM public.uc_signature_assurance_agreements WHERE id=(p_action->>'agreement_event_id')::uuid AND organization_id=s.organization_id AND subject_user_id=actor FOR SHARE NOWAIT;
    IF a.id IS NULL OR a.policy_version_id IS DISTINCT FROM v.id OR a.policy_sha256 IS DISTINCT FROM v.body_sha256 OR a.terms IS DISTINCT FROM terms THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
   ELSE
    SELECT name INTO org_name FROM public.organizations WHERE id=s.organization_id FOR SHARE NOWAIT;
    IF NOT public.uc_signature_assurance_text(to_jsonb(org_name),500)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
    rendered:=(terms->>'text')||E'\n\nСведения о подтверждении\nОрганизация: '||org_name||E'\nИмя, указанное участником: '||(p_action->>'declared_full_name')||E'\nИдентификатор учётной записи: '||actor::text;
    IF octet_length(rendered)>65536 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
    agreement_head:=public.uc_signature_assurance_stream(s.organization_id,'agreement',actor,actor);new_agreement:=gen_random_uuid();PERFORM public.uc_signature_assurance_token('agreement',new_agreement);
    INSERT INTO public.uc_signature_assurance_agreements(id,organization_id,subject_user_id,stream_id,revision,policy_version_id,policy_sha256,terms,rendered_text,rendered_text_sha256,actor)VALUES(new_agreement,s.organization_id,actor,agreement_head.id,agreement_head.revision+1,v.id,v.body_sha256,terms,rendered,public.uc_signature_assurance_hash(rendered),public.uc_signature_assurance_actor(actor,p_action->>'declared_full_name'))RETURNING *INTO a;
    agreement_event:=public.uc_signature_assurance_append(p_org=>s.organization_id,p_stream=>agreement_head.id,p_expected=>agreement_head.revision,p_request=>request_id,p_kind=>'agreement_accepted',p_method=>'authenticated_account_confirmation',p_reason=>'Учётная запись получателя явно подтвердила точный текст выбранной редакции соглашения.',p_authority=>jsonb_build_object('kind','self','declaration',NULL,'document_reference',NULL,'verification','not_verified'),p_policy=>v.id,p_agreement=>a.id,p_conclusion=>'factual_confirmation',p_actor=>actor,p_declared_name=>p_action->>'declared_full_name');
    PERFORM public.uc_signature_assurance_track(s.organization_id,'agreement',a.id,actor,'subject');PERFORM public.uc_signature_assurance_track(s.organization_id,'stream',agreement_head.id,actor,'subject');
   END IF;
  END IF;
  conclusion:=CASE WHEN method='scan_received'THEN'scan_received'WHEN method='authenticated_account_confirmation'AND v.body->>'purpose'='account_pep'THEN'policy_eligible_account_confirmation'ELSE'factual_confirmation'END;
  IF method='scan_received'THEN
   file_action:=jsonb_build_object('action','file_context','address',jsonb_build_object('kind','invitation','token',p_action->>'token'),'expected_document_revision_id',p_action->'expected_document_revision_id','document_html_sha256',p_action->'document_html_sha256','purpose','scan','scan_path',p_action->'scan_path');scan_ctx:=public.uc_signature_assurance_file_context_private(file_action,actor);
   SELECT *INTO proof_row FROM public.uc_signature_assurance_file_proofs proof WHERE proof.organization_id=s.organization_id AND proof.signature_id=s.id AND proof.party_role='recipient'AND proof.proof->'source'=scan_ctx->'source'AND proof.proof->'object_after'=scan_ctx->'object'AND proof.proof->'file'=p_scan_proof ORDER BY proof.verified_at DESC,proof.id DESC LIMIT 1 FOR SHARE NOWAIT;
   IF proof_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
   SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=proof_row.id AND organization_id=s.organization_id AND relation<>'staff_attribution';PERFORM public.uc_signature_assurance_file_fence(s,actor,true,proof_row.subject_user_id,proof_row.recipient_user_id,people);
   e:=public.uc_signature_assurance_append_scan(p_org=>s.organization_id,p_stream=>head.id,p_expected=>expected,p_request=>request_id,p_kind=>'scan_received',p_method=>method,p_reason=>p_action->>'declaration',p_authority=>authority,p_policy=>v.id,p_signature=>s.id,p_document=>d.id,p_conclusion=>conclusion,p_actor=>actor,p_declared_name=>p_action->>'declared_full_name',p_party_role=>'recipient',p_binding=>b.id,p_scan=>p_scan_proof);
   FOR person IN SELECT unnest(people)user_id LOOP PERFORM public.uc_signature_assurance_track(s.organization_id,'event',e.id,person.user_id,'subject');PERFORM public.uc_signature_assurance_track(s.organization_id,'stream',s.id,person.user_id,'subject');PERFORM public.uc_signature_assurance_track(s.organization_id,'request',request_id,person.user_id,'subject');END LOOP;
  ELSE
   IF coalesce(p_scan_proof,'null'::jsonb)<>'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
   e:=public.uc_signature_assurance_append(p_org=>s.organization_id,p_stream=>head.id,p_expected=>expected,p_request=>request_id,p_kind=>CASE WHEN method='authenticated_account_confirmation'THEN'account_confirmed'ELSE'bearer_confirmed'END,p_method=>method,p_reason=>CASE WHEN method='authenticated_account_confirmation'THEN'Получатель подтвердил точную версию документа из наблюдаемой учётной записи.'ELSE'Зафиксировано подтверждение точной версии документа держателем приглашения; личность не устанавливалась.'END,p_authority=>authority,p_policy=>v.id,p_signature=>s.id,p_document=>d.id,p_agreement=>a.id,p_conclusion=>conclusion,p_actor=>actor,p_declared_name=>p_action->>'declared_full_name',p_party_role=>'recipient',p_binding=>b.id);
  END IF;
 END IF;
 stored:=public.uc_signature_assurance_record_request(s.organization_id,request_id,digest,operation,head.id,e.id,s.id,e.revision,actor,'recipient',b.id);
 FOR person IN SELECT user_id,relation FROM public.uc_signature_assurance_file_people(s)LOOP PERFORM public.uc_signature_assurance_track(s.organization_id,'event',e.id,person.user_id,person.relation);PERFORM public.uc_signature_assurance_track(s.organization_id,'request',request_id,person.user_id,person.relation);PERFORM public.uc_signature_assurance_track(s.organization_id,'stream',s.id,person.user_id,person.relation);END LOOP;
 RETURN jsonb_build_object('version',1,'ok',true,'kind','confirmation','context',public.uc_signature_assurance_invitation_context(p_action->>'token',actor),'receipt',public.uc_signature_assurance_receipt(stored),'certificate_state','not_requested');
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;


-- UC022 fragment 59_confirmed_source_boundaries.sql
-- New confirmed evidence fixes the exact source/parties; old historical rows
-- without new terminal evidence keep their existing native guards and workflows.
CREATE FUNCTION public.uc_signature_assurance_signature_boundary()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 -- A newly bound workflow cannot be finalized through the older generic PEP route.
 -- Its canonical commands append exact party facts and never rewrite legacy signed fields.
 IF TG_OP='UPDATE'AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings b WHERE b.organization_id=OLD.organization_id AND b.signature_id=OLD.id AND b.party_role='recipient')AND(
  NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN('signed','rejected','revoked')
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['handwritten_scan_hash','handwritten_scan_path','pep_agreement_id','rejected_at','rejection_reason','sender_signed_at','sender_signed_ip','sender_signed_user_agent','signature_method','signed_at','signed_document_path','signed_ip','signed_organization_inn','signed_organization_name','signed_revision_id','signed_source_bucket','signed_source_hash','signed_source_path','signed_user_agent']) field WHERE to_jsonb(NEW)->field IS DISTINCT FROM to_jsonb(OLD)->field)
 )THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_events e WHERE e.organization_id=OLD.organization_id AND e.signature_id=OLD.id AND e.kind IN('sender_confirmed','account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked'))THEN IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE'THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 IF (to_jsonb(NEW)-ARRAY['viewed_at','updated_at','certificate_state','certificate_error','certificate_url'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['viewed_at','updated_at','certificate_state','certificate_error','certificate_url'])THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER zz_uc_signature_assurance_source_boundary BEFORE UPDATE OR DELETE ON public.document_signatures FOR EACH ROW EXECUTE FUNCTION public.uc_signature_assurance_signature_boundary();

CREATE FUNCTION public.uc_signature_assurance_storage_boundary()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE used boolean;confirmed boolean;
BEGIN
 IF OLD.bucket_id NOT IN('external-contracts','signed-documents')THEN IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;END IF;
 SELECT EXISTS(SELECT 1 FROM public.document_signatures s WHERE
  s.signed_source_bucket=OLD.bucket_id AND s.signed_source_path=OLD.name
  OR OLD.bucket_id='external-contracts'AND(s.document_snapshot_url=OLD.name OR s.handwritten_scan_path=OLD.name OR EXISTS(SELECT 1 FROM public.signature_revisions r WHERE r.signature_id=s.id AND r.file_url=OLD.name))
  OR OLD.bucket_id='signed-documents'AND s.signed_document_path=OLD.name
  OR OLD.bucket_id='external-contracts'AND s.organization_id=public.storage_try_uuid(split_part(OLD.name,'/',1))AND split_part(OLD.name,'/',2)='signed-scans'AND s.id=public.storage_try_uuid(left(split_part(OLD.name,'/',3),36))AND OLD.name~('^'||s.organization_id::text||'/signed-scans/'||s.id::text||'-[A-Za-z0-9_-]{1,120}\.(pdf|png|jpg|jpeg)$'))INTO used;
 IF NOT used THEN IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='UPDATE'AND(to_jsonb(NEW)-ARRAY['last_accessed_at','updated_at','path_tokens'])IS NOT DISTINCT FROM(to_jsonb(OLD)-ARRAY['last_accessed_at','updated_at','path_tokens'])THEN NEW.updated_at:=OLD.updated_at;RETURN NEW;END IF;
 SELECT EXISTS(SELECT 1 FROM public.uc_signature_assurance_events e WHERE e.kind IN('sender_confirmed','account_confirmed','bearer_confirmed','scan_received')AND(e.payload->'original_file'->>'bucket'=OLD.bucket_id AND e.payload->'original_file'->>'path'=OLD.name OR e.payload->'scan_file'->>'bucket'=OLD.bucket_id AND e.payload->'scan_file'->>'path'=OLD.name))INTO confirmed;
 IF confirmed THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;
END;$fn$;
-- Must run after native update_objects_updated_at and the existing K object guard.
CREATE TRIGGER zz_uc_signature_assurance_storage_boundary BEFORE UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.uc_signature_assurance_storage_boundary();


-- UC022 fragment 61_observed_actor_authority.sql
-- Explicit-actor mirror of the existing UC016 file and scoped-journal read
-- rules. The service does not manufacture auth.uid()/JWT claims for resolution.
CREATE FUNCTION public.uc_signature_assurance_selection_people(p_org uuid,p_value jsonb)RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(array_agg(DISTINCT person ORDER BY person),'{}'::uuid[])FROM(
  SELECT v.uploaded_by person FROM public.org_document_versions v WHERE v.organization_id=p_org AND v.id=public.storage_try_uuid(p_value->'source'->>'version_id')AND v.document_id=public.storage_try_uuid(p_value->'source'->>'document_id')
  UNION SELECT unnest(r.participant_ids)FROM public.uc_document_registry_records r WHERE p_value->>'kind'='document_registry_file'AND r.organization_id=p_org AND r.id=public.storage_try_uuid(p_value->>'registry_record_id')
  UNION SELECT unnest(e.participant_ids)FROM public.uc_document_registry_events e WHERE p_value->>'kind'='document_registry_file'AND e.organization_id=p_org AND e.record_id=public.storage_try_uuid(p_value->>'registry_record_id')
 )known WHERE person IS NOT NULL
$fn$;
CREATE FUNCTION public.uc_signature_assurance_as_resolve_selection(p_org uuid,p_actor uuid,p_value jsonb,p_required boolean DEFAULT true)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
DECLARE v public.org_document_versions;d public.org_documents;r public.uc_document_registry_records;stored_source jsonb;allowed boolean;people uuid[];
BEGIN
 IF NOT public.uc_signature_assurance_selection(p_value)OR p_value->>'organization_id'IS DISTINCT FROM p_org::text THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 allowed:=coalesce(public.uc_signature_assurance_active(p_actor)AND NOT public.uc_signature_assurance_as_document_teacher_limited(p_actor,p_org)AND public.uc_signature_assurance_as_document_action_allowed(p_actor,p_org,'read',NULL,NULL),false);
 IF p_value->>'kind'='document_registry_file'THEN
  SELECT *INTO r FROM public.uc_document_registry_records WHERE id=(p_value->>'registry_record_id')::uuid AND organization_id=p_org AND NOT redacted FOR SHARE NOWAIT;
  allowed:=allowed AND r.id IS NOT NULL AND public.uc_platform_document_action_allowed(p_actor,'read')AND public.uc_signature_assurance_as_can_access_organization(p_actor,p_org,'journals.read')AND(r.group_id IS NULL AND NOT public.uc_signature_assurance_as_document_teacher_limited(p_actor,p_org)OR r.group_id IS NOT NULL AND public.uc_signature_assurance_as_document_scope_allowed(p_actor,p_org,r.group_id,NULL));
  IF r.revision=(p_value->>'registry_record_revision')::integer THEN stored_source:=r.data->'source';ELSE SELECT snapshot->'data'->'source'INTO stored_source FROM public.uc_document_registry_events WHERE record_id=r.id AND organization_id=p_org AND revision=(p_value->>'registry_record_revision')::integer AND NOT redacted FOR SHARE NOWAIT;END IF;
  allowed:=allowed AND stored_source IS NOT DISTINCT FROM p_value->'source';
 END IF;
 IF NOT coalesce(allowed,false)THEN IF p_required THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;RETURN NULL;END IF;
 SELECT *INTO d FROM public.org_documents WHERE id=(p_value->'source'->>'document_id')::uuid AND organization_id=p_org AND deleted_at IS NULL AND coalesce(to_jsonb(org_documents)->>'status','active')NOT IN('archived','expired')FOR SHARE NOWAIT;
 SELECT *INTO v FROM public.org_document_versions WHERE id=(p_value->'source'->>'version_id')::uuid AND document_id=d.id AND organization_id=p_org FOR SHARE NOWAIT;
 allowed:=v.id IS NOT NULL AND public.uc_copy_registry_object_matches(v)AND public.uc_copy_registry_original_ref(v)=p_value->'source';
 IF NOT coalesce(allowed,false)THEN IF p_required THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;RETURN NULL;END IF;
 people:=public.uc_signature_assurance_selection_people(p_org,p_value);PERFORM public.uc_signature_assurance_fence(p_org,people,false,NULL,NULL,p_actor);
 IF p_value->>'kind'='document_registry_file'THEN PERFORM 1 FROM public.uc_document_registry_events WHERE organization_id=p_org AND record_id=r.id FOR SHARE NOWAIT;END IF;
 PERFORM 1 FROM storage.objects WHERE id=v.storage_object_id AND bucket_id='org-documents'AND name=v.file_path FOR SHARE NOWAIT;
 IF NOT public.uc_copy_registry_object_matches(v)THEN IF p_required THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;RETURN NULL;END IF;
 RETURN p_value;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_resolve_selection(p_org uuid,p_value jsonb,p_required boolean DEFAULT true)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_active()THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 RETURN public.uc_signature_assurance_as_resolve_selection(p_org,auth.uid(),p_value,p_required);
END;$fn$;
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_invitation_authority(p_org uuid,p_actor uuid,p_value jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE resolved jsonb;literal text;reference jsonb;
BEGIN
 IF NOT public.uc_signature_assurance_shape(p_value,ARRAY['kind','declaration','document_reference'])OR NOT coalesce(p_value->>'kind'IN('self','declared_representative','exact_document_reference','unknown'),false)OR(p_value->>'kind'='exact_document_reference')IS DISTINCT FROM(p_value->'document_reference'<>'null'::jsonb)OR p_value->'declaration'<>'null'::jsonb AND NOT public.uc_signature_assurance_text(p_value->'declaration',4000)OR p_value->>'kind'='declared_representative'AND p_value->'declaration'='null'::jsonb THEN PERFORM public.uc_signature_assurance_error('AUTHORITY_REQUIRED');END IF;
 IF p_value->>'kind'='exact_document_reference'THEN
  resolved:=public.uc_signature_assurance_as_resolve_selection(p_org,p_actor,p_value->'document_reference',true)||jsonb_build_object('byte_proof',NULL);literal:=resolved::text;reference:=jsonb_build_object('visibility','available','captured_reference_json',literal,'captured_reference_sha256',public.uc_signature_assurance_hash(literal),'value',resolved);
 END IF;
 RETURN jsonb_build_object('kind',p_value->>'kind','declaration',p_value->'declaration','document_reference',reference,'verification',CASE WHEN reference IS NULL THEN'not_verified'ELSE'exact_reference_checked'END);
END;$fn$;


-- UC022 fragment 62_original_reference_participants.sql
-- Add original known reference participants to every actual new event stream.
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_append(p_org uuid,p_stream uuid,p_expected integer,p_request uuid,p_kind text,p_method text,p_reason text,p_authority jsonb,
 p_policy uuid DEFAULT NULL,p_signature uuid DEFAULT NULL,p_document uuid DEFAULT NULL,p_agreement uuid DEFAULT NULL,p_consent uuid DEFAULT NULL,
 p_conclusion text DEFAULT 'not_confirmed',p_actor uuid DEFAULT auth.uid(),p_declared_name text DEFAULT NULL,p_party_role text DEFAULT NULL,p_binding uuid DEFAULT NULL) RETURNS public.uc_signature_assurance_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE head public.uc_signature_assurance_streams;version_row public.uc_signature_assurance_policy_versions;
 document_row public.uc_signature_assurance_document_snapshots;binding_row public.uc_signature_assurance_bindings;bound_document public.uc_signature_assurance_document_snapshots;agreement_row public.uc_signature_assurance_agreements;consent_row public.uc_signature_assurance_consents;
 event_row public.uc_signature_assurance_events;event_id uuid:=gen_random_uuid();actor_fact jsonb;payload jsonb;at_time timestamptz:=clock_timestamp();recipient uuid;subject uuid;signer boolean;
 extra_people uuid[];extra_ref jsonb;extra_person uuid;
BEGIN
 IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR p_expected=2147483647 OR NOT public.uc_signature_assurance_text(to_jsonb(p_reason),4000)
 OR NOT coalesce(p_kind IN('policy_created','policy_source_checked','policy_reviewed','policy_accepted','policy_retired','signature_bound','graphic_prepared','bearer_confirmed','account_confirmed','scan_received','sender_confirmed','agreement_accepted','consent_confirmed','consent_withdrawn','invitation_revoked','recipient_rejected'),false)
 OR NOT coalesce(p_method IN('graphic_asset','scan_received','bearer_invitation_confirmation','authenticated_account_confirmation','legacy_unknown'),false)
 OR NOT coalesce(p_conclusion IN('not_confirmed','factual_confirmation','policy_eligible_account_confirmation','scan_received','graphic_prepared','legacy_unknown'),false)
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF NOT coalesce(public.uc_signature_assurance_active(p_actor)OR p_actor IS NULL AND auth.role()='service_role' AND auth.uid()IS NULL,false)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT*INTO head FROM public.uc_signature_assurance_streams WHERE id=p_stream AND organization_id=p_org FOR UPDATE NOWAIT;
 IF head.id IS NULL OR head.revision<>p_expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF(head.kind='signature')IS DISTINCT FROM(p_signature IS NOT NULL)OR p_signature IS NOT NULL AND p_signature<>head.entity_id THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF head.kind IS DISTINCT FROM(CASE WHEN p_kind LIKE'policy_%'THEN'policy'WHEN p_kind='agreement_accepted'THEN'agreement'WHEN p_kind LIKE'consent_%'THEN'consent'ELSE'signature'END)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF head.kind='signature' THEN
  IF p_party_role IS NULL OR p_party_role NOT IN('sender','recipient')OR(p_binding IS NULL)IS DISTINCT FROM(p_policy IS NULL)
   OR p_kind='sender_confirmed'AND p_party_role<>'sender'
   OR p_kind IN('account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked')AND p_party_role<>'recipient'
   OR p_kind IN('signature_bound','account_confirmed','sender_confirmed')AND(p_binding IS NULL OR p_document IS NULL)
  THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ELSE
  IF p_party_role IS NOT NULL OR p_binding IS NOT NULL OR p_document IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 END IF;
 IF p_kind IN('account_confirmed','sender_confirmed')AND(p_method<>'authenticated_account_confirmation'OR p_actor IS NULL)
  OR p_kind='bearer_confirmed'AND p_method<>'bearer_invitation_confirmation'
  OR p_kind='scan_received'AND p_method<>'scan_received'
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF p_policy IS NOT NULL THEN
  SELECT*INTO version_row FROM public.uc_signature_assurance_policy_versions WHERE id=p_policy AND organization_id=p_org;
  IF version_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 END IF;
 IF p_document IS NOT NULL THEN
  SELECT*INTO document_row FROM public.uc_signature_assurance_document_snapshots WHERE id=p_document AND organization_id=p_org AND signature_id=p_signature;
  IF document_row.id IS NULL OR document_row.party_role IS DISTINCT FROM p_party_role THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  subject:=document_row.subject_user_id;recipient:=document_row.recipient_user_id;
 END IF;
 IF p_binding IS NOT NULL THEN
  SELECT*INTO binding_row FROM public.uc_signature_assurance_bindings WHERE id=p_binding AND organization_id=p_org AND signature_id=p_signature AND party_role=p_party_role;
  SELECT*INTO bound_document FROM public.uc_signature_assurance_document_snapshots WHERE id=binding_row.document_snapshot_id AND organization_id=p_org;
  IF binding_row.id IS NULL OR bound_document.id IS NULL OR binding_row.policy_version_id IS DISTINCT FROM p_policy OR binding_row.policy_sha256 IS DISTINCT FROM version_row.body_sha256
   OR binding_row.classification IS DISTINCT FROM version_row.body->'classification' OR binding_row.agreement_sha256 IS DISTINCT FROM(version_row.body->'agreement'->>'sha256')
   OR document_row.id IS NULL OR document_row.document_revision_id IS DISTINCT FROM bound_document.document_revision_id OR document_row.html_sha256 IS DISTINCT FROM bound_document.html_sha256 OR document_row.original_file IS DISTINCT FROM bound_document.original_file
   OR p_kind='signature_bound'AND(binding_row.revision<>head.revision+1 OR p_document IS DISTINCT FROM binding_row.document_snapshot_id)
   OR p_kind<>'signature_bound'AND(binding_row.revision>head.revision OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings newer WHERE newer.organization_id=p_org AND newer.signature_id=p_signature AND newer.party_role=p_party_role AND newer.revision>binding_row.revision))
  THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 END IF;
 IF p_agreement IS NOT NULL THEN
  SELECT*INTO agreement_row FROM public.uc_signature_assurance_agreements WHERE id=p_agreement AND organization_id=p_org;
  IF agreement_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_REQUIRED');END IF;
  IF agreement_row.subject_user_id IS DISTINCT FROM p_actor OR agreement_row.policy_version_id IS DISTINCT FROM p_policy OR agreement_row.policy_sha256 IS DISTINCT FROM version_row.body_sha256 OR agreement_row.terms->>'sha256'IS DISTINCT FROM version_row.body->'agreement'->>'sha256'THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
 END IF;
 IF p_kind IN('account_confirmed','sender_confirmed')AND version_row.body->>'purpose'='account_pep'AND p_agreement IS NULL THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_REQUIRED');END IF;
 IF p_conclusion='policy_eligible_account_confirmation'AND(p_kind NOT IN('account_confirmed','sender_confirmed')OR p_policy IS NULL OR p_binding IS NULL OR p_agreement IS NULL OR p_method<>'authenticated_account_confirmation'OR version_row.body->>'purpose'IS DISTINCT FROM'account_pep')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF p_consent IS NOT NULL THEN
  SELECT*INTO consent_row FROM public.uc_signature_assurance_consents WHERE id=p_consent AND organization_id=p_org;
  IF consent_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 END IF;
 subject:=coalesce(head.subject_user_id,subject);actor_fact:=public.uc_signature_assurance_actor(p_actor,p_declared_name);
 payload:=jsonb_build_object('id',event_id,'organization_id',p_org,'stream_kind',head.kind,'stream_id',head.id,'revision',head.revision+1,
 'kind',p_kind,'server_at',public.uc_signature_assurance_utc(at_time),'actor',actor_fact,'authority',p_authority,'method',p_method,
  'policy_version_id',p_policy,'policy_sha256',version_row.body_sha256,'signature_id',p_signature,'party_role',p_party_role,'binding_id',p_binding,'document_snapshot_id',p_document,
 'document_revision_id',document_row.document_revision_id,'document_html_sha256',document_row.html_sha256,'original_file',document_row.original_file,'scan_file',NULL,
 'agreement_event_id',p_agreement,'agreement_sha256',agreement_row.terms->>'sha256','consent_snapshot_id',p_consent,
 'conclusion',p_conclusion,'explanation',p_reason,'request_id',p_request,'cryptographic_verification','not_performed','time_assurance','platform_server_time');
 -- The policy/authority file references have their own original known people.
 -- They are fenced before the event mutation and remain linked thereafter.
 extra_people:='{}'::uuid[];
 IF p_authority->'document_reference'->>'visibility'='available'THEN extra_people:=extra_people||public.uc_signature_assurance_selection_people(p_org,(p_authority->'document_reference'->'value')-'byte_proof');END IF;
 IF version_row.id IS NOT NULL THEN FOR extra_ref IN SELECT value FROM jsonb_array_elements(version_row.body->'basis'->'document_references')LOOP extra_people:=extra_people||public.uc_signature_assurance_selection_people(p_org,extra_ref);END LOOP;END IF;
 PERFORM public.uc_signature_assurance_fence(p_org,extra_people,false,NULL,NULL,p_actor);
 PERFORM public.uc_signature_assurance_token('event',event_id);
 INSERT INTO public.uc_signature_assurance_events(id,organization_id,stream_id,stream_kind,revision,kind,payload,request_id,subject_user_id,recipient_user_id,actor_user_id,
 signature_id,party_role,binding_id,document_snapshot_id,policy_version_id,agreement_event_id,consent_snapshot_id,server_at)
 VALUES(event_id,p_org,head.id,head.kind,head.revision+1,p_kind,payload,p_request,subject,recipient,p_actor,p_signature,p_party_role,p_binding,p_document,p_policy,p_agreement,p_consent,at_time)RETURNING*INTO event_row;
 PERFORM public.uc_signature_assurance_token('stream',head.id);
 UPDATE public.uc_signature_assurance_streams SET revision=head.revision+1 WHERE id=head.id AND revision=head.revision;
 IF NOT FOUND THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 signer:=p_kind IN('account_confirmed','sender_confirmed','agreement_accepted','consent_confirmed','consent_withdrawn');
 PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,subject,'subject');
 PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,recipient,'recipient');
 PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,p_actor,CASE WHEN signer THEN'actual_personal_signer'ELSE'staff_attribution'END);
 FOR extra_person IN SELECT DISTINCT person FROM unnest(extra_people)person WHERE person IS NOT NULL LOOP
  PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,extra_person,'subject');PERFORM public.uc_signature_assurance_track(p_org,'stream',head.id,extra_person,'subject');
 END LOOP;
 RETURN event_row;
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_signature_assurance_append_scan(p_org uuid,p_stream uuid,p_expected integer,p_request uuid,p_kind text,p_method text,p_reason text,p_authority jsonb,
 p_policy uuid DEFAULT NULL,p_signature uuid DEFAULT NULL,p_document uuid DEFAULT NULL,p_agreement uuid DEFAULT NULL,p_consent uuid DEFAULT NULL,
 p_conclusion text DEFAULT 'not_confirmed',p_actor uuid DEFAULT auth.uid(),p_declared_name text DEFAULT NULL,p_party_role text DEFAULT NULL,p_binding uuid DEFAULT NULL,p_scan jsonb DEFAULT NULL) RETURNS public.uc_signature_assurance_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE head public.uc_signature_assurance_streams;version_row public.uc_signature_assurance_policy_versions;
 document_row public.uc_signature_assurance_document_snapshots;binding_row public.uc_signature_assurance_bindings;bound_document public.uc_signature_assurance_document_snapshots;agreement_row public.uc_signature_assurance_agreements;consent_row public.uc_signature_assurance_consents;
 event_row public.uc_signature_assurance_events;event_id uuid:=gen_random_uuid();actor_fact jsonb;payload jsonb;at_time timestamptz:=clock_timestamp();recipient uuid;subject uuid;signer boolean;
 extra_people uuid[];extra_ref jsonb;extra_person uuid;
BEGIN
 IF p_kind IS DISTINCT FROM'scan_received'OR p_method IS DISTINCT FROM'scan_received'OR NOT public.uc_signature_assurance_shape(p_scan,ARRAY['bucket','path','sha256','bytes','mime'])OR NOT public.uc_signature_assurance_sha(p_scan->'sha256')OR NOT public.uc_signature_assurance_integer(p_scan->'bytes',1,20971520)OR p_scan->>'mime'NOT IN('application/pdf','image/png','image/jpeg')OR NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_file_proofs proof WHERE proof.organization_id=p_org AND proof.signature_id=p_signature AND proof.party_role='recipient'AND proof.proof->'source'->>'purpose'='scan'AND proof.proof->'file'=p_scan AND proof.proof->'object_after'=public.uc_signature_assurance_object_snapshot(p_scan->>'bucket',p_scan->>'path'))THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF p_request IS NULL OR p_expected IS NULL OR p_expected<0 OR p_expected=2147483647 OR NOT public.uc_signature_assurance_text(to_jsonb(p_reason),4000)
 OR NOT coalesce(p_kind IN('policy_created','policy_source_checked','policy_reviewed','policy_accepted','policy_retired','signature_bound','graphic_prepared','bearer_confirmed','account_confirmed','scan_received','sender_confirmed','agreement_accepted','consent_confirmed','consent_withdrawn','invitation_revoked','recipient_rejected'),false)
 OR NOT coalesce(p_method IN('graphic_asset','scan_received','bearer_invitation_confirmation','authenticated_account_confirmation','legacy_unknown'),false)
 OR NOT coalesce(p_conclusion IN('not_confirmed','factual_confirmation','policy_eligible_account_confirmation','scan_received','graphic_prepared','legacy_unknown'),false)
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF NOT coalesce(public.uc_signature_assurance_active(p_actor)OR p_actor IS NULL AND auth.role()='service_role' AND auth.uid()IS NULL,false)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT*INTO head FROM public.uc_signature_assurance_streams WHERE id=p_stream AND organization_id=p_org FOR UPDATE NOWAIT;
 IF head.id IS NULL OR head.revision<>p_expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF(head.kind='signature')IS DISTINCT FROM(p_signature IS NOT NULL)OR p_signature IS NOT NULL AND p_signature<>head.entity_id THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF head.kind IS DISTINCT FROM(CASE WHEN p_kind LIKE'policy_%'THEN'policy'WHEN p_kind='agreement_accepted'THEN'agreement'WHEN p_kind LIKE'consent_%'THEN'consent'ELSE'signature'END)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF head.kind='signature' THEN
  IF p_party_role IS NULL OR p_party_role NOT IN('sender','recipient')OR(p_binding IS NULL)IS DISTINCT FROM(p_policy IS NULL)
   OR p_kind='sender_confirmed'AND p_party_role<>'sender'
   OR p_kind IN('account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked')AND p_party_role<>'recipient'
   OR p_kind IN('signature_bound','account_confirmed','sender_confirmed')AND(p_binding IS NULL OR p_document IS NULL)
  THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ELSE
  IF p_party_role IS NOT NULL OR p_binding IS NOT NULL OR p_document IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 END IF;
 IF p_kind IN('account_confirmed','sender_confirmed')AND(p_method<>'authenticated_account_confirmation'OR p_actor IS NULL)
  OR p_kind='bearer_confirmed'AND p_method<>'bearer_invitation_confirmation'
  OR p_kind='scan_received'AND p_method<>'scan_received'
 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF p_policy IS NOT NULL THEN
  SELECT*INTO version_row FROM public.uc_signature_assurance_policy_versions WHERE id=p_policy AND organization_id=p_org;
  IF version_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 END IF;
 IF p_document IS NOT NULL THEN
  SELECT*INTO document_row FROM public.uc_signature_assurance_document_snapshots WHERE id=p_document AND organization_id=p_org AND signature_id=p_signature;
  IF document_row.id IS NULL OR document_row.party_role IS DISTINCT FROM p_party_role THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  subject:=document_row.subject_user_id;recipient:=document_row.recipient_user_id;
 END IF;
 IF p_binding IS NOT NULL THEN
  SELECT*INTO binding_row FROM public.uc_signature_assurance_bindings WHERE id=p_binding AND organization_id=p_org AND signature_id=p_signature AND party_role=p_party_role;
  SELECT*INTO bound_document FROM public.uc_signature_assurance_document_snapshots WHERE id=binding_row.document_snapshot_id AND organization_id=p_org;
  IF binding_row.id IS NULL OR bound_document.id IS NULL OR binding_row.policy_version_id IS DISTINCT FROM p_policy OR binding_row.policy_sha256 IS DISTINCT FROM version_row.body_sha256
   OR binding_row.classification IS DISTINCT FROM version_row.body->'classification' OR binding_row.agreement_sha256 IS DISTINCT FROM(version_row.body->'agreement'->>'sha256')
   OR document_row.id IS NULL OR document_row.document_revision_id IS DISTINCT FROM bound_document.document_revision_id OR document_row.html_sha256 IS DISTINCT FROM bound_document.html_sha256 OR document_row.original_file IS DISTINCT FROM bound_document.original_file
   OR p_kind='signature_bound'AND(binding_row.revision<>head.revision+1 OR p_document IS DISTINCT FROM binding_row.document_snapshot_id)
   OR p_kind<>'signature_bound'AND(binding_row.revision>head.revision OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings newer WHERE newer.organization_id=p_org AND newer.signature_id=p_signature AND newer.party_role=p_party_role AND newer.revision>binding_row.revision))
  THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 END IF;
 IF p_agreement IS NOT NULL THEN
  SELECT*INTO agreement_row FROM public.uc_signature_assurance_agreements WHERE id=p_agreement AND organization_id=p_org;
  IF agreement_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_REQUIRED');END IF;
  IF agreement_row.subject_user_id IS DISTINCT FROM p_actor OR agreement_row.policy_version_id IS DISTINCT FROM p_policy OR agreement_row.policy_sha256 IS DISTINCT FROM version_row.body_sha256 OR agreement_row.terms->>'sha256'IS DISTINCT FROM version_row.body->'agreement'->>'sha256'THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
 END IF;
 IF p_kind IN('account_confirmed','sender_confirmed')AND version_row.body->>'purpose'='account_pep'AND p_agreement IS NULL THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_REQUIRED');END IF;
 IF p_conclusion='policy_eligible_account_confirmation'AND(p_kind NOT IN('account_confirmed','sender_confirmed')OR p_policy IS NULL OR p_binding IS NULL OR p_agreement IS NULL OR p_method<>'authenticated_account_confirmation'OR version_row.body->>'purpose'IS DISTINCT FROM'account_pep')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF p_consent IS NOT NULL THEN
  SELECT*INTO consent_row FROM public.uc_signature_assurance_consents WHERE id=p_consent AND organization_id=p_org;
  IF consent_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 END IF;
 subject:=coalesce(head.subject_user_id,subject);actor_fact:=public.uc_signature_assurance_actor(p_actor,p_declared_name);
 payload:=jsonb_build_object('id',event_id,'organization_id',p_org,'stream_kind',head.kind,'stream_id',head.id,'revision',head.revision+1,
 'kind',p_kind,'server_at',public.uc_signature_assurance_utc(at_time),'actor',actor_fact,'authority',p_authority,'method',p_method,
  'policy_version_id',p_policy,'policy_sha256',version_row.body_sha256,'signature_id',p_signature,'party_role',p_party_role,'binding_id',p_binding,'document_snapshot_id',p_document,
 'document_revision_id',document_row.document_revision_id,'document_html_sha256',document_row.html_sha256,'original_file',document_row.original_file,'scan_file',p_scan,
 'agreement_event_id',p_agreement,'agreement_sha256',agreement_row.terms->>'sha256','consent_snapshot_id',p_consent,
 'conclusion',p_conclusion,'explanation',p_reason,'request_id',p_request,'cryptographic_verification','not_performed','time_assurance','platform_server_time');
 -- The policy/authority file references have their own original known people.
 -- They are fenced before the event mutation and remain linked thereafter.
 extra_people:='{}'::uuid[];
 IF p_authority->'document_reference'->>'visibility'='available'THEN extra_people:=extra_people||public.uc_signature_assurance_selection_people(p_org,(p_authority->'document_reference'->'value')-'byte_proof');END IF;
 IF version_row.id IS NOT NULL THEN FOR extra_ref IN SELECT value FROM jsonb_array_elements(version_row.body->'basis'->'document_references')LOOP extra_people:=extra_people||public.uc_signature_assurance_selection_people(p_org,extra_ref);END LOOP;END IF;
 PERFORM public.uc_signature_assurance_fence(p_org,extra_people,false,NULL,NULL,p_actor);
 PERFORM public.uc_signature_assurance_token('event',event_id);
 INSERT INTO public.uc_signature_assurance_events(id,organization_id,stream_id,stream_kind,revision,kind,payload,request_id,subject_user_id,recipient_user_id,actor_user_id,
 signature_id,party_role,binding_id,document_snapshot_id,policy_version_id,agreement_event_id,consent_snapshot_id,server_at)
 VALUES(event_id,p_org,head.id,head.kind,head.revision+1,p_kind,payload,p_request,subject,recipient,p_actor,p_signature,p_party_role,p_binding,p_document,p_policy,p_agreement,p_consent,at_time)RETURNING*INTO event_row;
 PERFORM public.uc_signature_assurance_token('stream',head.id);
 UPDATE public.uc_signature_assurance_streams SET revision=head.revision+1 WHERE id=head.id AND revision=head.revision;
 IF NOT FOUND THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 signer:=p_kind IN('account_confirmed','sender_confirmed','agreement_accepted','consent_confirmed','consent_withdrawn');
 PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,subject,'subject');
 PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,recipient,'recipient');
 PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,p_actor,CASE WHEN signer THEN'actual_personal_signer'ELSE'staff_attribution'END);
 FOR extra_person IN SELECT DISTINCT person FROM unnest(extra_people)person WHERE person IS NOT NULL LOOP
  PERFORM public.uc_signature_assurance_track(p_org,'event',event_id,extra_person,'subject');PERFORM public.uc_signature_assurance_track(p_org,'stream',head.id,extra_person,'subject');
 END LOOP;
 RETURN event_row;
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;



-- UC022 fragment 63_invitation_terminal_write_guard.sql
-- Exact existing621 token helper body MD5 d215638ebdd578ffda206a148f1c5d3e
-- with one additive write-only canonical-terminal restriction. Read/history preserved.
CREATE OR REPLACE FUNCTION public.uc_signature_token_access_allowed(p_id uuid,p_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_id AND s.deleted_at IS NULL
  AND (NOT p_write AND s.status='signed' OR s.status IN ('sent','viewed','in_review','changes_requested') AND s.expires_at>now())
  AND(NOT p_write OR NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_events terminal WHERE terminal.organization_id=s.organization_id AND terminal.signature_id=s.id AND terminal.party_role='recipient'AND terminal.kind IN('account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked')))
  AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id IN(s.sender_user_id,s.recipient_user_id)))
$fn$;


-- UC022 fragment 64_controlled_issued_source_actor.sql
-- Exact K622 v_artifact chain under current original actor or exact invitation.
-- This helper alone grants no general org-documents access or byte-reread claim.
CREATE FUNCTION public.uc_signature_assurance_issued_source_as(p_org uuid,p_signature uuid,p_expected_record_revision bigint,p_expected_state_hash text,p_actor uuid,p_invitation text DEFAULT NULL,p_for_confirmation boolean DEFAULT true)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout='2000ms'AS $fn$
DECLARE sig public.document_signatures;r public.education_document_records;state public.uc_education_issuance_states;
 item public.uc_education_issuance_preparation_items;v public.org_document_versions;o storage.objects;saved jsonb;v_artifact jsonb;people uuid[];
BEGIN
 IF NOT(auth.role()='authenticated'AND p_actor=auth.uid()AND p_invitation IS NULL AND public.uc_signature_assurance_active(p_actor)OR auth.role()='service_role'AND auth.uid()IS NULL AND(p_actor IS NULL OR public.uc_signature_assurance_active(p_actor)))
  OR p_expected_record_revision IS NULL OR p_expected_record_revision NOT BETWEEN 1 AND 9007199254740991
  OR NOT public.uc_signature_assurance_sha(to_jsonb(p_expected_state_hash))THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT *INTO sig FROM public.document_signatures WHERE id=p_signature AND organization_id=p_org AND document_type='education_document'FOR SHARE NOWAIT;
 IF sig.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF p_invitation IS NOT NULL THEN
  IF auth.role()<>'service_role'OR auth.uid()IS NOT NULL OR sig.signature_token IS DISTINCT FROM p_invitation OR NOT public.uc_signature_token_access_allowed(sig.id,false)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSE
  IF p_actor IS NULL OR NOT public.uc_signature_assurance_as_signature_actor_allowed(p_actor,sig.id,false,true)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 END IF;
 SELECT *INTO r FROM public.education_document_records WHERE id=sig.document_id AND organization_id=p_org AND deleted_at IS NULL FOR SHARE NOWAIT;
 IF r.id IS NULL OR r.user_id IS NULL OR r.enrollment_id IS NULL OR NOT (p_invitation IS NOT NULL OR public.uc_signature_assurance_as_document_has_action(p_actor,p_org,'read')AND public.uc_signature_assurance_as_document_record_scope(p_actor,p_org,r.group_id,r.enrollment_id,r.user_id,r.course_id))THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT *INTO state FROM public.uc_education_issuance_states WHERE record_id=r.id AND organization_id=p_org FOR SHARE NOWAIT;
 IF state.record_id IS NULL OR state.redacted OR state.proof IS NULL OR p_for_confirmation AND state.annulment IS NOT NULL OR state.artifact IS NULL OR state.artifact='null'::jsonb THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 -- Preserve all previously captured people while the current record and old events
 -- are locked; metadata correction cannot silently change the privacy subject.
 PERFORM 1 FROM public.uc_education_issuance_events WHERE organization_id=p_org AND record_id=r.id FOR SHARE NOWAIT;
 SELECT coalesce(array_agg(DISTINCT person ORDER BY person),'{}'::uuid[])INTO people FROM(
  SELECT r.user_id person UNION SELECT state.user_id UNION SELECT unnest(state.participant_ids)
  UNION SELECT e.user_id FROM public.uc_education_issuance_events e WHERE e.organization_id=p_org AND e.record_id=r.id
  UNION SELECT unnest(e.participant_ids)FROM public.uc_education_issuance_events e WHERE e.organization_id=p_org AND e.record_id=r.id
 )known WHERE person IS NOT NULL;
 PERFORM public.uc_signature_assurance_file_fence(sig,p_actor,false,r.user_id,sig.recipient_user_id,people);
 PERFORM public.uc_education_issue_fence(p_org,r.group_id,people);
 IF NOT (p_invitation IS NOT NULL OR public.uc_signature_assurance_as_document_has_action(p_actor,p_org,'read')AND public.uc_signature_assurance_as_document_record_scope(p_actor,p_org,r.group_id,r.enrollment_id,r.user_id,r.course_id))OR p_invitation IS NULL AND NOT public.uc_signature_assurance_as_signature_actor_allowed(p_actor,p_signature,false,true)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF state.revision IS DISTINCT FROM p_expected_record_revision OR public.uc_education_issue_state_hash(r.id)IS DISTINCT FROM p_expected_state_hash
  OR state.user_id IS DISTINCT FROM r.user_id OR state.enrollment_id IS DISTINCT FROM r.enrollment_id OR state.course_id IS DISTINCT FROM r.course_id OR state.group_id IS DISTINCT FROM r.group_id
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 v_artifact:=state.artifact;
 IF NOT public.uc_admission_shape(v_artifact,ARRAY['preparation_id','item_id','input_revision','source','byte_sha256','byte_size','render_input_hash','template_byte_sha256','html_sha256','renderer','renderer_revision','output_review_id','output_review_revision'])
  OR NOT public.uc_signature_assurance_sha(v_artifact->'byte_sha256')OR NOT public.uc_signature_assurance_integer(v_artifact->'byte_size',1,20971520)
  OR NOT public.uc_signature_assurance_uuid(v_artifact->'item_id')OR NOT public.uc_signature_assurance_uuid(v_artifact->'preparation_id')
  OR v_artifact->>'renderer'IS DISTINCT FROM'browserless'OR v_artifact->>'renderer_revision'IS DISTINCT FROM'uc019-v1'
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 SELECT *INTO item FROM public.uc_education_issuance_preparation_items WHERE id=(v_artifact->>'item_id')::uuid AND preparation_id=(v_artifact->>'preparation_id')::uuid AND organization_id=p_org FOR SHARE NOWAIT;
 IF item.id IS NULL OR item.redacted OR item.final_record_id IS DISTINCT FROM r.id OR item.user_id IS DISTINCT FROM r.user_id OR item.enrollment_id IS DISTINCT FROM r.enrollment_id
  OR item.input_revision::text IS DISTINCT FROM v_artifact->>'input_revision'OR item.artifact IS NULL
  OR item.artifact->'source'IS DISTINCT FROM v_artifact->'source'OR item.artifact->'byte_sha256'IS DISTINCT FROM v_artifact->'byte_sha256'OR item.artifact->'byte_size'IS DISTINCT FROM v_artifact->'byte_size'
  OR item.artifact->'render_input_hash'IS DISTINCT FROM v_artifact->'render_input_hash'OR item.artifact->'html_sha256'IS DISTINCT FROM v_artifact->'html_sha256'OR item.artifact->'template_byte_sha256'IS DISTINCT FROM v_artifact->'template_byte_sha256'
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 PERFORM 1 FROM public.org_documents WHERE id=(v_artifact->'source'->>'document_id')::uuid AND organization_id=p_org FOR SHARE NOWAIT;
 PERFORM 1 FROM public.org_document_versions WHERE id=(v_artifact->'source'->>'version_id')::uuid AND document_id=(v_artifact->'source'->>'document_id')::uuid AND organization_id=p_org FOR SHARE NOWAIT;
 saved:=public.uc_education_artifact_saved_source(item.id);
 IF saved IS NULL OR saved->'source'IS DISTINCT FROM v_artifact->'source'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 SELECT *INTO v FROM public.org_document_versions WHERE organization_id=p_org AND document_id=(v_artifact->'source'->>'document_id')::uuid AND id=(v_artifact->'source'->>'version_id')::uuid FOR SHARE NOWAIT;
 SELECT *INTO o FROM storage.objects WHERE id=v.storage_object_id AND bucket_id='org-documents'AND name=v.file_path FOR SHARE NOWAIT;
 IF v.id IS NULL OR o.id IS NULL OR NOT public.uc_copy_registry_object_matches(v)OR public.uc_copy_registry_original_ref(v)IS DISTINCT FROM v_artifact->'source'
  OR v.file_size IS DISTINCT FROM(v_artifact->>'byte_size')::bigint OR lower(btrim(v.storage_metadata->>'mimetype'))IS DISTINCT FROM'application/pdf'
  OR saved->'object'->>'object_id'IS DISTINCT FROM o.id::text OR(saved->'object'->>'updated_at')::timestamptz IS DISTINCT FROM o.updated_at
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('version',1,'kind','controlled_education_artifact','organization_id',p_org,'signature_id',p_signature,
  'record_id',r.id,'record_revision',state.revision,'record_state_sha256',p_expected_state_hash,'subject_user_id',r.user_id,'enrollment_id',r.enrollment_id,'group_id',r.group_id,
  'artifact',v_artifact,'object',jsonb_build_object('id',o.id,'updated_at',public.uc_signature_assurance_utc(o.updated_at)),
  'file',jsonb_build_object('bucket','org-documents','path',v.file_path,'sha256',v_artifact->>'byte_sha256','bytes',v_artifact->'byte_size','mime','application/pdf'),
  'byte_assurance','trusted_issuance_attestation','current_byte_reread',false,'cryptographic_signature_verification','not_performed');
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');
 WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;


-- UC022 fragment 65_retention_privacy_composition.sql
-- Composition on exact current S3 privacy helpers; every old branch is retained.
-- No legal retention period or deletion authorization is manufactured.
CREATE FUNCTION public.uc_signature_assurance_personal_counts(p_user uuid)RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',table_name,'column','signature_evidence_retention_review_required','count',n)ORDER BY table_name),'[]'::jsonb)FROM(
 SELECT 'uc_signature_assurance_streams'::text table_name,count(*)n FROM public.uc_signature_assurance_streams r WHERE to_jsonb(r)->>'subject_user_id'=p_user::text OR to_jsonb(r)->'actor'->>'user_id'=p_user::text OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_participants p WHERE p.organization_id=r.organization_id AND p.object_kind='stream'AND p.object_id=r.id AND p.user_id=p_user)
 UNION ALL
 SELECT 'uc_signature_assurance_policy_versions'::text table_name,count(*)n FROM public.uc_signature_assurance_policy_versions r WHERE to_jsonb(r)->>'created_by'=p_user::text OR to_jsonb(r)->'actor'->>'user_id'=p_user::text OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_participants p WHERE p.organization_id=r.organization_id AND p.object_kind='policy'AND p.object_id=r.id AND p.user_id=p_user)
 UNION ALL
 SELECT 'uc_signature_assurance_policy_decisions'::text table_name,count(*)n FROM public.uc_signature_assurance_policy_decisions r WHERE to_jsonb(r)->>'actor_user_id'=p_user::text OR to_jsonb(r)->'actor'->>'user_id'=p_user::text OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_participants p WHERE p.organization_id=r.organization_id AND p.object_kind='decision'AND p.object_id=r.id AND p.user_id=p_user)
 UNION ALL
 SELECT 'uc_signature_assurance_document_snapshots'::text table_name,count(*)n FROM public.uc_signature_assurance_document_snapshots r WHERE to_jsonb(r)->>'subject_user_id'=p_user::text OR to_jsonb(r)->>'recipient_user_id'=p_user::text OR to_jsonb(r)->>'captured_by'=p_user::text OR to_jsonb(r)->'actor'->>'user_id'=p_user::text OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_participants p WHERE p.organization_id=r.organization_id AND p.object_kind='document'AND p.object_id=r.id AND p.user_id=p_user)
 UNION ALL
 SELECT 'uc_signature_assurance_bindings'::text table_name,count(*)n FROM public.uc_signature_assurance_bindings r WHERE to_jsonb(r)->>'subject_user_id'=p_user::text OR to_jsonb(r)->>'recipient_user_id'=p_user::text OR to_jsonb(r)->>'bound_by'=p_user::text OR to_jsonb(r)->'actor'->>'user_id'=p_user::text OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_participants p WHERE p.organization_id=r.organization_id AND p.object_kind='binding'AND p.object_id=r.id AND p.user_id=p_user)
 UNION ALL
 SELECT 'uc_signature_assurance_agreements'::text table_name,count(*)n FROM public.uc_signature_assurance_agreements r WHERE to_jsonb(r)->>'subject_user_id'=p_user::text OR to_jsonb(r)->'actor'->>'user_id'=p_user::text OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_participants p WHERE p.organization_id=r.organization_id AND p.object_kind='agreement'AND p.object_id=r.id AND p.user_id=p_user)
 UNION ALL
 SELECT 'uc_signature_assurance_consents'::text table_name,count(*)n FROM public.uc_signature_assurance_consents r WHERE to_jsonb(r)->>'subject_user_id'=p_user::text OR to_jsonb(r)->'actor'->>'user_id'=p_user::text OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_participants p WHERE p.organization_id=r.organization_id AND p.object_kind='consent'AND p.object_id=r.id AND p.user_id=p_user)
 UNION ALL
 SELECT 'uc_signature_assurance_events'::text table_name,count(*)n FROM public.uc_signature_assurance_events r WHERE to_jsonb(r)->>'subject_user_id'=p_user::text OR to_jsonb(r)->>'recipient_user_id'=p_user::text OR to_jsonb(r)->>'actor_user_id'=p_user::text OR to_jsonb(r)->'actor'->>'user_id'=p_user::text OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_participants p WHERE p.organization_id=r.organization_id AND p.object_kind='event'AND p.object_id=r.id AND p.user_id=p_user)
 UNION ALL
 SELECT 'uc_signature_assurance_private_manifests'::text table_name,count(*)n FROM public.uc_signature_assurance_private_manifests r WHERE to_jsonb(r)->>'captured_by'=p_user::text OR to_jsonb(r)->'actor'->>'user_id'=p_user::text OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_participants p WHERE p.organization_id=r.organization_id AND p.object_kind='private_manifest'AND p.object_id=r.id AND p.user_id=p_user)
 UNION ALL
 SELECT 'uc_signature_assurance_scoped_manifests'::text table_name,count(*)n FROM public.uc_signature_assurance_scoped_manifests r WHERE to_jsonb(r)->>'captured_by'=p_user::text OR to_jsonb(r)->'actor'->>'user_id'=p_user::text OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_participants p WHERE p.organization_id=r.organization_id AND p.object_kind='scoped_manifest'AND p.object_id=r.id AND p.user_id=p_user)
 UNION ALL
 SELECT 'uc_signature_assurance_requests'::text table_name,count(*)n FROM public.uc_signature_assurance_requests r WHERE to_jsonb(r)->>'actor_user_id'=p_user::text OR to_jsonb(r)->'actor'->>'user_id'=p_user::text OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_participants p WHERE p.organization_id=r.organization_id AND p.object_kind='request'AND p.object_id=r.request_id AND p.user_id=p_user)
 UNION ALL SELECT 'uc_signature_assurance_participants',count(*)FROM public.uc_signature_assurance_participants WHERE user_id=p_user
 )counts WHERE n>0
$fn$;
CREATE FUNCTION public.uc_signature_assurance_retention_block(p_user uuid)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR current_setting('sintagma.account_deletion_erase_user',true)IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_user::text,42007))THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF public.uc_signature_assurance_personal_counts(p_user)<>'[]'::jsonb OR public.uc_signature_assurance_file_proof_personal_counts(p_user)<>'[]'::jsonb THEN RAISE EXCEPTION 'SIGNATURE_EVIDENCE_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_scoped_journal_personal_counts(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT(
 SELECT(
 SELECT(
 SELECT(
 SELECT(
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',count_row.table_name,'column',count_row.column_name,'count',count_row.n) ORDER BY count_row.table_name),'[]'::jsonb) FROM(
  SELECT 'uc_scoped_journal_contexts'::text table_name,'created_by'::text column_name,count(*) n FROM public.uc_scoped_journal_contexts c WHERE c.created_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_records','participant_ids',count(*) FROM public.uc_scoped_journal_records r WHERE p_user=ANY(r.participant_ids) OR r.subject_user_id=p_user OR r.recorded_by=p_user OR r.created_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_history','participant_ids',count(*) FROM public.uc_scoped_journal_history h WHERE p_user=ANY(h.participant_ids) OR h.subject_user_id=p_user OR h.recorded_by=p_user
  UNION ALL SELECT 'uc_scoped_journal_requests','participant_ids',count(*) FROM public.uc_scoped_journal_requests request_row WHERE p_user=ANY(request_row.participant_ids) OR request_row.actor_id=p_user
  UNION ALL SELECT 'uc_scoped_journal_exports','participant_ids',count(*) FROM public.uc_scoped_journal_exports e WHERE p_user=ANY(e.participant_ids) OR e.recorded_by=p_user
 ) count_row WHERE count_row.n>0
)||public.uc_copy_registry_personal_counts(p_user)
)||public.uc_document_registry_personal_counts(p_user)
)||public.uc_education_personal_counts(p_user))||public.uc_frdo_personal_counts(p_user))||public.uc_signature_assurance_personal_counts(p_user)||public.uc_signature_assurance_file_proof_personal_counts(p_user)
$function$;
CREATE OR REPLACE FUNCTION public.uc_scoped_journal_erase_user(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR current_setting('sintagma.account_deletion_erase_user',true) IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations rev WHERE rev.user_id=p_user) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events retained_removal WHERE retained_removal.user_id=p_user OR retained_removal.actor_id=p_user)THEN RAISE EXCEPTION 'COURSE_ASSIGNMENT_REMOVAL_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
 PERFORM public.uc_signature_assurance_retention_block(p_user);
 PERFORM public.uc_frdo_retention_block(p_user);
 PERFORM public.uc_education_erase_user(p_user);
 PERFORM public.uc_copy_registry_erase_user(p_user);
 PERFORM public.uc_document_registry_erase_user(p_user);
 -- Every copied personal export is invalidated, never silently re-rendered under an old hash.
 DELETE FROM public.uc_scoped_journal_exports e WHERE e.recorded_by=p_user OR p_user=ANY(e.participant_ids);
 DELETE FROM public.uc_scoped_journal_requests request_row WHERE request_row.actor_id=p_user OR p_user=ANY(request_row.participant_ids);
 DELETE FROM public.uc_scoped_journal_history h WHERE h.subject_user_id=p_user;
 DELETE FROM public.uc_scoped_journal_records r WHERE r.subject_user_id=p_user;
 -- Conservatively redact an entire attributed copy, including nonpersonal-author text.
 -- No universal discovery of undeclared third-party personal data in free text is claimed.
 UPDATE public.uc_scoped_journal_history SET recorded_by=NULL,subject_user_id=NULL,subject_label=NULL,field_values='{}',source='{"kind":"none"}',reason='',participant_ids='{}',redacted=true
  WHERE recorded_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_scoped_journal_records SET recorded_by=NULL,created_by=NULL,subject_user_id=NULL,subject_label=NULL,field_values='{}',source='{"kind":"none"}',participant_ids='{}',redacted=true
  WHERE recorded_by=p_user OR created_by=p_user OR p_user=ANY(participant_ids);
 UPDATE public.uc_scoped_journal_contexts SET created_by=NULL WHERE created_by=p_user;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.uc_education_personal_counts(p_user))x WHERE x->>'column'='retained_subject_output_reference_review_required')THEN RAISE EXCEPTION 'EDUCATION_ARTIFACT_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
 IF public.uc_scoped_journal_personal_counts(p_user)<>'[]'::jsonb THEN PERFORM public.uc_custom_journal_error('DEPENDENCY_UNAVAILABLE');END IF;
END;$function$;
CREATE OR REPLACE FUNCTION public.account_deletion_snapshot(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE p public.profiles%ROWTYPE; v_org uuid; v_owner boolean:=false; v_education_outputs jsonb;v_education_unissued bigint;v_education_issued bigint;
 v_blockers jsonb:='[]'; v_categories jsonb:='[]'; v_files jsonb;
 v_count bigint; v_learning bigint; v_docs bigint:=0; v_shared bigint:=0; v_documentary bigint:=0;
 v_org_shared bigint:=0; v_courses bigint:=0; r record; v_fingerprint jsonb;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE user_id=p_user_id;
 v_org:=p.organization_id;
 IF v_org IS NOT NULL THEN v_owner:=public.is_org_owner(p_user_id,v_org); END IF;
 SELECT count(*) INTO v_learning FROM public.enrollments WHERE user_id=p_user_id;
 SELECT count(*)INTO v_count FROM public.uc_course_assignment_removal_events removal_event WHERE removal_event.user_id=p_user_id OR removal_event.actor_id=p_user_id;
 IF v_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','Сохранена история отмены или повторного назначения курса. До удаления нужна отдельная проверка этих записей; назначение не удаляется физически.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','retained_assignment_removals','label','История отмен и повторных назначений: требуется проверка хранения','count',v_count,'action','retain'));
 END IF;
 v_files:=public.account_deletion_files(p_user_id);
 -- Exact subject/document relationships; JSON checks are read-only detection,
 -- never commands to remove an organization-wide document.
 SELECT
   (SELECT count(*) FROM public.education_document_records WHERE user_id=p_user_id OR enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_issuance_log WHERE user_id=p_user_id)+
   (SELECT count(*) FROM public.student_documents WHERE enrollment_id IN (SELECT id FROM public.enrollments WHERE user_id=p_user_id))+
   (SELECT count(*) FROM public.document_signatures WHERE (recipient_user_id=p_user_id OR sender_user_id=p_user_id) AND (signed_at IS NOT NULL OR sender_signed_at IS NOT NULL OR status='signed'))+
   (SELECT count(*) FROM public.org_contracts WHERE (student_user_id=p_user_id OR students::text LIKE '%'||p_user_id::text||'%') AND (approved_at IS NOT NULL OR signed_at IS NOT NULL OR status NOT IN ('draft','cancelled')))+
   (SELECT count(*) FROM public.group_documents WHERE (student_user_id=p_user_id OR variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%') AND (file_path IS NOT NULL OR doc_status<>'draft'))
 INTO v_docs;
 IF v_docs>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','У аккаунта есть оформленные учебные или подписанные документы организации. Для этих записей требуется отдельная проверка возможности удаления; она не заменяется подтверждением удаления аккаунта.')); END IF;
 IF EXISTS(SELECT 1 FROM public.group_completion_decision_history WHERE user_id=p_user_id) OR EXISTS(SELECT 1 FROM public.group_completion_decisions WHERE user_id=p_user_id) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть неизменяемая история итоговых решений организации. Их автоматическое удаление сейчас не поддержано без нарушения целостности общей истории; удаление не начато.'));
 END IF;
 -- CSZ preserves accepted homework by a dedicated immutable-history trigger.
 -- Do not bypass that guard just to scrub a personal free-text attachment.
 IF EXISTS(SELECT 1 FROM public.homework_submissions WHERE student_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.enrollments WHERE user_id=p_user_id AND course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a'))
 OR EXISTS(SELECT 1 FROM public.lesson_progress lp JOIN public.lessons l ON l.id=lp.lesson_id WHERE lp.user_id=p_user_id AND l.course_id IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39','7e5bc4e6-0629-4186-9745-a821cbe7255a')) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROTECTED_HISTORY_REVIEW_REQUIRED','message','Есть защищённые работы ЦСЗ. Их обработка требует отдельного решения; результаты обучения сейчас не изменяются.'));
 END IF;
 -- These records have other stakeholders or privileged ownership. Never let
 -- Auth FK cascades silently delete client call records, contracts or grants.
 FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','student_user_id'),
  ('ai_avatar_templates','created_by'),
  ('balance_transactions','performed_by'),
  ('call_logs','manager_user_id'),
  ('chat_groups','created_by'),
  ('checko_search_presets','created_by'),
  ('checko_search_runs','created_by'),
  ('commercial_proposals','created_by'),
  ('commercial_proposals','deleted_by'),
  ('companies','user_id'),
  ('company_documents','deleted_by'),
  ('company_staff','invited_by'),
  ('course_landing_history','created_by'),
  ('course_manual_credits','credited_by'),
  ('course_manual_credits','revoked_by'),
  ('course_payments','user_id'),
  ('course_review_grants','created_by'),
  ('course_review_grants','updated_by'),
  ('course_snapshots','created_by'),
  ('data_subject_requests','deleted_by'),
  ('data_subject_requests','resolved_by'),
  ('document_issuance_log','deleted_by'),
  ('document_signatures','deleted_by'),
  ('driving_audit','user_id'),
  ('driving_entries','created_by'),
  ('driving_entry_reversals','created_by'),
  ('driving_instructors','user_id'),
  ('driving_invites','created_by'),
  ('driving_lessons','created_by'),
  ('driving_memberships','user_id'),
  ('driving_schools','created_by'),
  ('driving_students','user_id'),
  ('education_document_records','deleted_by'),
  ('email_campaigns','created_by'),
  ('email_drip_sequences','created_by'),
  ('email_templates','created_by'),
  ('enrollment_requests','resolved_by'),
  ('enrollment_requests','user_id'),
  ('goreltech_document_operations','actor_id'),
  ('goreltech_enrollment_orders','actor_id'),
  ('group_class_journal_marks','updated_by'),
  ('group_completion_decisions','confirmed_by'),
  ('group_document_schedules','updated_by'),
  ('group_documents','created_by'),
  ('group_documents','student_user_id'),
  ('homework_submissions','reviewer_id'),
  ('incoming_documents','deleted_by'),
  ('labor_safety_enrollment_protocols','created_by'),
  ('labor_safety_enrollment_protocols','source_user_id'),
  ('labor_safety_enrollment_protocols','updated_by'),
  ('labor_safety_profiles','user_id'),
  ('library_documents','created_by'),
  ('mailing_deliverability_seeds','created_by'),
  ('mailing_report_links','created_by'),
  ('mailing_senders','created_by'),
  ('marketplace_course_comments','user_id'),
  ('marketplace_orders','buyer_user_id'),
  ('org_billing_documents','deleted_by'),
  ('org_contract_template_versions','created_by'),
  ('org_custom_roles','created_by'),
  ('org_document_share_links','created_by'),
  ('org_documents','deleted_by'),
  ('org_signatories','created_by'),
  ('platform_invoice_acts','created_by'),
  ('platform_updates','created_by'),
  ('proposal_presets','created_by'),
  ('referral_attribution_log','user_id'),
  ('referral_partners','user_id'),
  ('sales_demo_links','created_by'),
  ('sales_demo_sessions','user_id'),
  ('sales_managers','user_id'),
  ('sales_tasks','created_by'),
  ('signature_comments','author_user_id'),
  ('signature_comments','resolved_by'),
  ('signature_revisions','created_by'),
  ('training_plans','created_by'),
  ('webinar_polls','created_by'),
  ('webinars','created_by'),
  ('webinars','host_user_id')
 ) x(t,c) LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING p_user_id;
  v_shared:=v_shared+v_count;
 END LOOP;
 v_shared:=v_shared+(SELECT count(*) FROM public.document_signatures WHERE (sender_user_id=p_user_id OR recipient_user_id=p_user_id) AND (sender_user_id IS DISTINCT FROM p_user_id OR recipient_user_id IS DISTINCT FROM p_user_id));
 v_shared:=v_shared+(SELECT count(*) FROM public.org_contracts WHERE student_user_id IS DISTINCT FROM p_user_id AND students::text LIKE '%'||p_user_id::text||'%');
 v_shared:=v_shared+(SELECT count(*) FROM public.group_documents WHERE student_user_id IS DISTINCT FROM p_user_id AND (variables::text LIKE '%'||p_user_id::text||'%' OR variables_snapshot::text LIKE '%'||p_user_id::text||'%'));
 IF v_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_DATA_REVIEW_REQUIRED','message','Аккаунт связан с общими рабочими записями. Сначала нужно передать ответственность за них; данные других пользователей не удаляются.')); END IF;
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE (o.owner=p_user_id OR o.owner_id=p_user_id::text)
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_files) f WHERE f->>'bucket'=o.bucket_id AND f->>'path'=o.name)) THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SHARED_FILES_REVIEW_REQUIRED','message','Есть загруженные аккаунтом файлы вне личных папок. Сначала нужно проверить их принадлежность организации.'));
 END IF;
 IF v_owner THEN
  -- Locking/revalidation occurs again in begin. A brand-new sole-owner
  -- organization may be removed with its default welcome course/templates.
  SELECT count(*) INTO v_org_shared FROM public.profiles WHERE organization_id=v_org AND user_id<>p_user_id;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE c.organization_id=v_org);
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.organizations WHERE id=v_org AND (balance<>0 OR is_paid OR paid_until IS NOT NULL));
  FOR r IN SELECT * FROM (VALUES
  ('org_crm_clients','organization_id'),
  ('org_crm_deals','organization_id'),
  ('org_crm_tasks','organization_id'),
  ('org_crm_activities','organization_id'),
  ('achievements','organization_id'),
  ('admin_generated_documents','sent_to_organization_id'),
  ('admin_org_messages','organization_id'),
  ('ai_avatar_templates','organization_id'),
  ('audit_logs','organization_id'),
  ('balance_transactions','organization_id'),
  ('chat_groups','organization_id'),
  ('checko_search_presets','organization_id'),
  ('commercial_proposals','organization_id'),
  ('companies','organization_id'),
  ('company_requests','organization_id'),
  ('consent_documents','organization_id'),
  ('course_landing_history','organization_id'),
  ('course_payments','organization_id'),
  ('course_reminders','organization_id'),
  ('course_requests','organization_id'),
  ('course_snapshots','organization_id'),
  ('data_subject_requests','organization_id'),
  ('document_issuance_log','organization_id'),
  ('document_number_sequences','organization_id'),
  ('document_signatures','organization_id'),
  ('driving_audit','organization_id'),
  ('driving_cars','organization_id'),
  ('driving_courses','organization_id'),
  ('driving_entries','organization_id'),
  ('driving_entry_reversals','organization_id'),
  ('driving_groups','organization_id'),
  ('driving_instructors','organization_id'),
  ('driving_invites','organization_id'),
  ('driving_lessons','organization_id'),
  ('driving_memberships','organization_id'),
  ('driving_operations','organization_id'),
  ('driving_programs','organization_id'),
  ('driving_schools','organization_id'),
  ('driving_shifts','organization_id'),
  ('driving_students','organization_id'),
  ('education_document_records','organization_id'),
  ('email_action_tokens','organization_id'),
  ('email_campaign_consent_log','organization_id'),
  ('email_campaigns','organization_id'),
  ('email_drip_subscribers','organization_id'),
  ('frdo_signed_documents','organization_id'),
  ('goreltech_document_operations','organization_id'),
  ('goreltech_enrollment_orders','organization_id'),
  ('group_class_journal_marks','organization_id'),
  ('group_completion_decision_history','organization_id'),
  ('group_completion_decisions','organization_id'),
  ('group_document_schedules','organization_id'),
  ('group_documents','organization_id'),
  ('homework_submissions','organization_id'),
  ('incoming_documents','organization_id'),
  ('journal_instances','organization_id'),
  ('kinescope_usage_cache','organization_id'),
  ('knowledge_bank','organization_id'),
  ('labor_safety_enrollment_protocols','organization_id'),
  ('labor_safety_groups','organization_id'),
  ('labor_safety_profiles','organization_id'),
  ('library_documents','organization_id'),
  ('library_folders','organization_id'),
  ('mailing_campaign_ledger','organization_id'),
  ('mailing_campaign_replies','organization_id'),
  ('mailing_contacts','organization_id'),
  ('mailing_deliverability_checks','organization_id'),
  ('mailing_deliverability_seeds','organization_id'),
  ('mailing_report_links','organization_id'),
  ('mailing_seed_ledger','organization_id'),
  ('mailing_senders','organization_id'),
  ('marketplace_courses','organization_id'),
  ('marketplace_orders','buyer_organization_id'),
  ('ordinary_mail_report_events','organization_id'),
  ('org_billing_documents','organization_id'),
  ('org_contract_template_versions','organization_id'),
  ('org_contract_templates','organization_id'),
  ('org_contracts','organization_id'),
  ('org_custom_roles','organization_id'),
  ('org_document_share_links','organization_id'),
  ('org_document_versions','organization_id'),
  ('org_documents','organization_id'),
  ('org_general_messages','organization_id'),
  ('org_payers','organization_id'),
  ('org_services','organization_id'),
  ('org_signatories','organization_id'),
  ('org_smtp_settings','organization_id'),
  ('org_staff','organization_id'),
  ('org_student_messages','organization_id'),
  ('organization_comments','organization_id'),
  ('organization_payment_settings','organization_id'),
  ('organization_reminders','organization_id'),
  ('pending_enrollments','organization_id'),
  ('platform_invoice_acts','organization_id'),
  ('program_categories','organization_id'),
  ('program_documents','organization_id'),
  ('program_folders','organization_id'),
  ('program_training_plans','organization_id'),
  ('proposal_presets','organization_id'),
  ('referral_attribution_log','organization_id'),
  ('referral_commissions','organization_id'),
  ('referral_registrations','organization_id'),
  ('registration_links','organization_id'),
  ('role_audit_log','organization_id'),
  ('sales_blacklist','organization_id'),
  ('sales_companies_db','organization_id'),
  ('sales_contracts','organization_id'),
  ('sales_demo_links','organization_id'),
  ('sales_demo_sessions','organization_id'),
  ('sales_lead_activities','organization_id'),
  ('sales_leads','organization_id'),
  ('sales_tasks','organization_id'),
  ('service_orders','organization_id'),
  ('skillspace_import_jobs','organization_id'),
  ('staff_invitations','organization_id'),
  ('student_deletion_log','organization_id'),
  ('student_group_memberships','organization_id'),
  ('student_groups','organization_id'),
  ('student_roster_removals','organization_id'),
  ('subscription_invoices','organization_id'),
  ('system_diagnostics','organization_id'),
  ('testimonials','organization_id'),
  ('training_plans','organization_id'),
  ('webinars','organization_id')
  ) x(t,c) LOOP
   EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',r.t,r.c) INTO v_count USING v_org;
   v_org_shared:=v_org_shared+v_count;
  END LOOP;
  -- Only the audited seeded course is auto-removable in the first release.
  SELECT count(*) INTO v_courses FROM public.courses WHERE organization_id=v_org;
  v_org_shared:=v_org_shared+(SELECT count(*) FROM public.courses WHERE organization_id=v_org AND system_key IS DISTINCT FROM 'welcome');
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_admission_cases WHERE organization_id=v_org);
 v_org_shared:=v_org_shared+(SELECT count(*)FROM public.uc_group_education_states WHERE organization_id=v_org);
 IF v_org_shared>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','OWNERSHIP_TRANSFER_REQUIRED','message','Организация содержит пользователей, обучение, платежи или рабочие записи. Сначала передайте управление организацией.','actionHref','/organization?tab=staff')); END IF;
 END IF;
 -- PEP is deletable only when it is the person's standalone agreement, not
 -- evidence attached to a document signature (the live FK is SET NULL).
 SELECT count(*) INTO v_documentary FROM public.pep_agreements pa
 WHERE pa.user_id=p_user_id AND EXISTS(SELECT 1 FROM public.document_signatures d WHERE d.pep_agreement_id=pa.id);
 -- An organization's offer acceptance belongs to the organization lifecycle.
 -- Remove it only together with the verified unused sole-owner organization.
 SELECT v_documentary+count(*) INTO v_documentary FROM public.organization_offer_acceptances a
 WHERE a.user_id=p_user_id AND NOT (v_owner AND v_org_shared=0 AND a.organization_id=v_org);
 IF v_documentary>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','DOCUMENTARY_RELATION_REVIEW_REQUIRED','message','Есть соглашение ПЭП, связанное с подписью документа, или акцепт оферты действующей организации. Эти общие документальные записи требуют отдельной обработки; удаление аккаунта не начато.')); END IF;
 v_education_outputs:=public.uc_education_saved_output_counts(p_user_id);v_education_unissued:=(v_education_outputs->>'unissued')::bigint;v_education_issued:=(v_education_outputs->>'issued')::bigint;
 IF v_education_unissued+v_education_issued>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','EDUCATION_ARTIFACT_RETENTION_REVIEW_REQUIRED','message','Сохранены файлы подготовки, ещё не выданные: '||v_education_unissued||'; архивы выданных документов: '||v_education_issued||'. Учебному центру нужно проверить черновики и основания дальнейшего хранения архива. Удаление аккаунта не начато.'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_frdo_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','FRDO_PACKET_RETENTION_REVIEW_REQUIRED','message','Сохранены персональные сведения и их копии в пакетах ФРДО, файлах, квитанциях или полномочиях оператора. Учебному центру нужно проверить основание и порядок дальнейшего хранения. Удаление аккаунта не начато.'));END IF;
 v_categories:=v_categories||jsonb_build_array(
  jsonb_build_object('key','account','label','Вход в аккаунт, пароль, профиль и личные настройки','count',1,'action','delete'),
  jsonb_build_object('key','private_files','label','Личные фотографии и загруженные документы','count',jsonb_array_length(v_files),'action','delete'),
  jsonb_build_object('key','learning_results','label','Назначения курсов, прогресс, попытки, ответы и результаты обучения','count',v_learning,'action','delete'),
  jsonb_build_object('key','institutional_documents','label','Оформленные документы','count',v_docs,'action',CASE WHEN v_docs>0 THEN 'block' ELSE 'delete' END));
 IF v_education_unissued+v_education_issued>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','education_artifact_outputs','label','Файлы подготовки и архив выданных документов: требуется проверка сохранения','count',v_education_unissued+v_education_issued,'action','block'));END IF;
 IF v_documentary>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','documentary_relations','label','Соглашения ПЭП и акцепты оферт, связанные с документами или действующей организацией','count',v_documentary,'action','block')); END IF;
 IF v_owner THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','empty_organization','label','Неиспользованная организация и ознакомительный курс','count',1,'action',CASE WHEN v_org_shared>0 THEN 'block' ELSE 'delete' END)); END IF;
 SELECT count(*) INTO v_count FROM public.audit_logs WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','common_audit','label','Общие события организации: запись события сохраняется, имя и ссылка на аккаунт удаляются','count',v_count,'action','anonymize')); END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_cases WHERE user_id=p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','admission_cases','label','Личные дела и их индивидуальные копии','count',v_count,'action','delete'));END IF;
 SELECT count(*)INTO v_count FROM public.uc_admission_case_events WHERE actor_id=p_user_id AND user_id<>p_user_id;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','admission_review_attribution','label','Атрибуция внутренних проверок: удаляется ссылка на аккаунт и личный текст','count',v_count,'action','anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_frdo_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','frdo_retained_copies','label','Пакеты ФРДО, файлы, квитанции, источники и полномочия: требуется проверка хранения','count',v_count,'action','block'));END IF;
 v_categories:=v_categories||public.uc_group_education_deletion_preview(p_user_id);
 SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_learning_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','learning_outcomes','label','Результаты обучения и решения: личные строки удаляются, атрибуция обезличивается','count',v_count,'action','delete_or_anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_custom_journal_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','custom_journals','label','Собственные журналы: строки выбранного лица удаляются, авторские копии обезличиваются','count',v_count,'action','delete_or_anonymize'));END IF;
 SELECT coalesce(sum((v->>'count')::bigint),0) INTO v_count FROM jsonb_array_elements(public.uc_session_personal_counts(p_user_id))v;
 IF v_count>0 THEN v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','conducted_sessions','label','Проведённые занятия, посещение и черновики: личные сведения обезличиваются, редакции сохраняются','count',v_count,'action','anonymize'));END IF;
 v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','security_record','label','Техническая запись запрета старого доступа и квитанция об удалении без имени и контактов','count',1,'action','retain'));
 SELECT coalesce(sum((x->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_signature_assurance_personal_counts(p_user_id)||public.uc_signature_assurance_file_proof_personal_counts(p_user_id))x;
 IF v_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SIGNATURE_EVIDENCE_RETENTION_REVIEW_REQUIRED','message','Сохранены факты подтверждения, точные тексты соглашений или согласий, файлы и их копии. Учебному центру нужно отдельно проверить основание и порядок дальнейшего хранения. Удаление аккаунта не начато.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','signature_evidence_retained_copies','label','Подтверждения документов, тексты соглашений и согласий, файлы и копии: требуется проверка хранения','count',v_count,'action','block'));
 END IF;
 -- The snapshot is compared atomically just before the first mutation. Counts
 -- and manifest cover additions during the confirmation dialog; no PII stored.
 RETURN jsonb_build_object('organizationId',v_org,'emptyOrganization',v_owner AND v_org_shared=0,'learningCount',v_learning,
  'categories',v_categories,'blockers',v_blockers,'files',v_files,'sharedCount',v_shared,'personalRows',public.account_deletion_personal_row_counts(p_user_id),
  'profileRevision',p.updated_at,'role',(SELECT role::text FROM public.user_roles WHERE user_id=p_user_id LIMIT 1));
END;$function$;


-- UC022 fragment 66_controlled_source_participants.sql
-- The exact issued-record history remains part of every read/replay/proof fence.
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_file_people(p_signature public.document_signatures)RETURNS TABLE(user_id uuid,relation text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT DISTINCT k.user_id,k.relation FROM(
  SELECT p_signature.recipient_user_id user_id,'recipient'::text relation
  UNION SELECT h.subject_user_id,'subject'FROM public.uc_signature_assurance_streams h WHERE h.organization_id=p_signature.organization_id AND h.kind='signature'AND h.entity_id=p_signature.id
  UNION SELECT p.user_id,p.relation FROM public.uc_signature_assurance_participants p WHERE p.organization_id=p_signature.organization_id AND p.object_kind='stream'AND p.object_id=p_signature.id AND p.relation<>'staff_attribution'
  UNION SELECT d.student_user_id,'subject'FROM public.group_documents d WHERE d.id=p_signature.document_id AND d.organization_id=p_signature.organization_id
  UNION SELECT d.user_id,'subject'FROM public.education_document_records d WHERE d.id=p_signature.document_id AND d.organization_id=p_signature.organization_id
  UNION SELECT d.student_user_id,'subject'FROM public.org_contracts d WHERE d.id=p_signature.document_id AND d.organization_id=p_signature.organization_id
  UNION SELECT public.storage_try_uuid(item->>'user_id'),'subject'FROM public.org_contracts d CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.students)='array'THEN d.students ELSE'[]'::jsonb END)item WHERE d.id=p_signature.document_id AND d.organization_id=p_signature.organization_id
  UNION SELECT e.user_id,'subject'FROM public.student_documents d JOIN public.enrollments e ON e.id=d.enrollment_id JOIN public.courses c ON c.id=e.course_id WHERE d.id=p_signature.document_id AND c.organization_id=p_signature.organization_id
  UNION SELECT st.user_id,'subject'FROM public.uc_education_issuance_states st WHERE p_signature.document_type='education_document'AND st.organization_id=p_signature.organization_id AND st.record_id=p_signature.document_id
  UNION SELECT unnest(st.participant_ids),'subject'FROM public.uc_education_issuance_states st WHERE p_signature.document_type='education_document'AND st.organization_id=p_signature.organization_id AND st.record_id=p_signature.document_id
  UNION SELECT ev.user_id,'subject'FROM public.uc_education_issuance_events ev WHERE p_signature.document_type='education_document'AND ev.organization_id=p_signature.organization_id AND ev.record_id=p_signature.document_id
  UNION SELECT unnest(ev.participant_ids),'subject'FROM public.uc_education_issuance_events ev WHERE p_signature.document_type='education_document'AND ev.organization_id=p_signature.organization_id AND ev.record_id=p_signature.document_id
 )k WHERE k.user_id IS NOT NULL
$fn$;



-- UC022 fragment 67_controlled_source_verification.sql
-- A third bucket is reached only through the exact issued K record/artifact chain.
CREATE FUNCTION public.uc_signature_assurance_controlled_file_context_private(p_action jsonb,p_actor uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;r public.signature_revisions;st public.uc_education_issuance_states;descriptor jsonb;html text;locator text;party text;
BEGIN
 s:=public.uc_signature_assurance_file_actor(p_action,p_actor);
 IF s.document_type IS DISTINCT FROM'education_document'OR p_action->>'purpose'IS DISTINCT FROM'source'OR p_action->'scan_path'IS DISTINCT FROM'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF s.current_revision_id IS NOT NULL THEN SELECT *INTO r FROM public.signature_revisions WHERE id=s.current_revision_id AND signature_id=s.id FOR SHARE NOWAIT;IF r.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;html:=r.document_html;locator:=r.file_url;ELSE html:=s.document_html;locator:=s.document_snapshot_url;END IF;
 IF s.current_revision_id IS DISTINCT FROM public.storage_try_uuid(p_action->>'expected_document_revision_id')OR public.uc_signature_assurance_hash(html)IS DISTINCT FROM p_action->>'document_html_sha256'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 SELECT *INTO st FROM public.uc_education_issuance_states WHERE record_id=s.document_id AND organization_id=s.organization_id FOR SHARE NOWAIT;
 IF st.record_id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 descriptor:=public.uc_signature_assurance_issued_source_as(s.organization_id,s.id,st.revision,public.uc_education_issue_state_hash(st.record_id),p_actor,CASE WHEN p_action->'address'->>'kind'='invitation'THEN p_action->'address'->>'token'END,true);
 IF locator IS NOT NULL AND locator IS DISTINCT FROM descriptor->'file'->>'path'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 party:=CASE WHEN p_action->'address'->>'kind'='invitation'THEN'recipient'ELSE p_action->'address'->>'chosen_party'END;
 RETURN jsonb_build_object('version',1,'ok',true,'kind','file_context','source',jsonb_build_object('organization_id',s.organization_id,'signature_id',s.id,'chosen_party',party,'document_revision_id',s.current_revision_id,'document_html_sha256',p_action->'document_html_sha256','purpose','source','bucket','org-documents','path',descriptor->'file'->>'path'),'object',public.uc_signature_assurance_object_snapshot('org-documents',descriptor->'file'->>'path'));
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_controlled_attest_private(p_action jsonb,p_actor uuid,p_proof jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;head public.uc_signature_assurance_streams;ctx jsonb;stored public.uc_signature_assurance_file_proofs;request_id uuid;digest text;people uuid[];object_snapshot jsonb;file jsonb;source jsonb;new_id uuid:=gen_random_uuid();party text;
BEGIN
 s:=public.uc_signature_assurance_file_actor(p_action,p_actor);
 IF p_action->>'action'IS DISTINCT FROM'attest_file'THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 request_id:=(p_action->>'verification_request_id')::uuid;digest:=public.uc_signature_assurance_hash(jsonb_build_object('actor_user_id',p_actor,'action',p_action)::text);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_signature_source_verification:'||s.organization_id::text||':'||request_id::text,0))THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 SELECT*INTO stored FROM public.uc_signature_assurance_file_proofs WHERE organization_id=s.organization_id AND verification_request_id=request_id FOR SHARE NOWAIT;
 SELECT*INTO head FROM public.uc_signature_assurance_streams WHERE organization_id=s.organization_id AND kind='signature'AND entity_id=s.id;
 -- A replay remains bound to every original non-attribution subject. Current
 -- editable contracts/recipients cannot erase an earlier proof's privacy scope.
 PERFORM 1 FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=stored.id AND organization_id=s.organization_id AND relation<>'staff_attribution' FOR SHARE NOWAIT;
 SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=stored.id AND organization_id=s.organization_id AND relation<>'staff_attribution';
 PERFORM public.uc_signature_assurance_file_fence(s,p_actor,true,stored.subject_user_id,stored.recipient_user_id,people);
 s:=public.uc_signature_assurance_file_actor(p_action,p_actor);
 IF stored.id IS NOT NULL THEN
  IF stored.request_sha256 IS DISTINCT FROM digest OR stored.actor_user_id IS DISTINCT FROM p_actor THEN PERFORM public.uc_signature_assurance_error('REQUEST_CONFLICT');END IF;
  -- Replay is the original immutable receipt, not a reinterpretation of newer bytes.
  RETURN public.uc_signature_assurance_file_proof_receipt(stored,true);
 END IF;
 IF p_proof IS NULL OR p_proof='null'::jsonb THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF NOT public.uc_signature_assurance_shape(p_proof,ARRAY['assurance','source','object_before','file','object_after'])OR p_proof->>'assurance'IS DISTINCT FROM'trusted_service_reread'
  OR p_proof->'object_before'IS DISTINCT FROM p_proof->'object_after'THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ctx:=public.uc_signature_assurance_controlled_file_context_private(p_action,p_actor);source:=ctx->'source';object_snapshot:=ctx->'object';file:=p_proof->'file';
 IF source IS DISTINCT FROM p_proof->'source'OR object_snapshot IS DISTINCT FROM p_proof->'object_after'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF NOT public.uc_signature_assurance_shape(file,ARRAY['bucket','path','sha256','bytes','mime'])OR NOT public.uc_signature_assurance_sha(file->'sha256')OR NOT public.uc_signature_assurance_integer(file->'bytes',1,20971520)
  OR file->>'bucket'IS DISTINCT FROM source->>'bucket'OR file->>'path'IS DISTINCT FROM source->>'path'
  OR NOT public.uc_signature_assurance_text(file->'mime',200)OR file->>'mime'!~'^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$'
  OR object_snapshot->'reported_size'<>'null'::jsonb AND object_snapshot->'reported_size'IS DISTINCT FROM file->'bytes'
  OR object_snapshot->'reported_mime'<>'null'::jsonb AND object_snapshot->'reported_mime'IS DISTINCT FROM file->'mime'
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF p_action->>'purpose'='scan'AND(s.handwritten_scan_hash IS NULL OR s.handwritten_scan_hash IS DISTINCT FROM file->>'sha256')
  OR p_action->>'purpose'='source'AND s.status='signed'AND s.signed_source_path IS NOT NULL AND(s.signed_source_hash IS NULL OR s.signed_source_hash IS DISTINCT FROM file->>'sha256')
 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_states st WHERE st.organization_id=s.organization_id AND st.record_id=s.document_id AND st.artifact->>'byte_sha256'=file->>'sha256'AND st.artifact->'byte_size'=file->'bytes'AND file->>'mime'='application/pdf')THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 party:=source->>'chosen_party';
 INSERT INTO public.uc_signature_assurance_file_proof_tokens(transaction_id,proof_id,operation)VALUES(txid_current(),new_id,'append');
 INSERT INTO public.uc_signature_assurance_file_proofs(id,organization_id,verification_request_id,request_sha256,actor_user_id,signature_id,party_role,subject_user_id,recipient_user_id,proof)
 VALUES(new_id,s.organization_id,request_id,digest,p_actor,s.id,party,head.subject_user_id,s.recipient_user_id,p_proof)RETURNING*INTO stored;
 INSERT INTO public.uc_signature_assurance_file_proof_links(proof_id,organization_id,user_id,relation)
 SELECT new_id,s.organization_id,p.user_id,p.relation FROM public.uc_signature_assurance_file_people(s)p
 UNION SELECT new_id,s.organization_id,p_actor,'staff_attribution'WHERE p_actor IS NOT NULL;
 DELETE FROM public.uc_signature_assurance_file_proof_tokens WHERE transaction_id=txid_current()AND proof_id=new_id AND operation='append';
 RETURN public.uc_signature_assurance_file_proof_receipt(stored,false);
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;

CREATE FUNCTION public.uc_signature_assurance_verify_controlled_source_service(p_action jsonb,p_observed_actor_user_id uuid,p_request_ip inet DEFAULT NULL,p_request_user_agent text DEFAULT NULL,p_original_proof jsonb DEFAULT NULL,p_scan_proof jsonb DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='10000ms' SET lock_timeout='2000ms'AS $fn$
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR NOT public.uc_signature_assurance_active(p_observed_actor_user_id)OR p_action->'address'->>'kind'IS DISTINCT FROM'authenticated_signature'OR p_action->>'purpose'IS DISTINCT FROM'source'OR p_action->'scan_path'IS DISTINCT FROM'null'::jsonb OR p_request_ip IS NOT NULL OR p_request_user_agent IS NOT NULL OR coalesce(p_scan_proof,'null'::jsonb)IS DISTINCT FROM'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_signature_assurance_file_action(p_action);
 IF p_action->>'action'='file_context'THEN IF coalesce(p_original_proof,'null'::jsonb)IS DISTINCT FROM'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;RETURN public.uc_signature_assurance_controlled_file_context_private(p_action,p_observed_actor_user_id);
 ELSIF p_action->>'action'='attest_file'THEN RETURN public.uc_signature_assurance_controlled_attest_private(p_action,p_observed_actor_user_id,p_original_proof);END IF;
 PERFORM public.uc_signature_assurance_error('INVALID_INPUT');
END;$fn$;


-- UC022 fragment 68_current_controlled_file_disclosure.sql
-- Current file disclosure is an exact signature/evidence association, never a
-- generic third-bucket privilege. No fresh byte verification is claimed by reads.
CREATE FUNCTION public.uc_signature_assurance_current_file_scope(p_org uuid,p_signature uuid,p_file jsonb)RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;st public.uc_education_issuance_states;descriptor jsonb;
BEGIN
 IF NOT public.uc_signature_assurance_signature_read(p_org,p_signature)OR p_file IS NULL OR p_file='null'::jsonb THEN RETURN false;END IF;
 IF p_file->>'bucket'IN('external-contracts','signed-documents')THEN
  IF public.uc_signature_storage_read(p_file->>'bucket',p_file->>'path')AND public.uc_signature_object_bound(p_signature,p_file->>'bucket',p_file->>'path')THEN RETURN true;END IF;
  -- A newly received scan is bound by the immutable actual event rather than by
  -- an invented legacy handwritten_scan_path/status. Current signature rights apply.
  RETURN EXISTS(SELECT 1 FROM public.uc_signature_assurance_events e JOIN storage.objects o ON o.bucket_id=p_file->>'bucket'AND o.name=p_file->>'path'JOIN storage.buckets bucket ON bucket.id=o.bucket_id AND NOT bucket.public WHERE e.organization_id=p_org AND e.signature_id=p_signature AND e.party_role='recipient'AND e.kind='scan_received'AND e.payload->'scan_file'=p_file);
 ELSIF p_file->>'bucket'='org-documents'THEN
  SELECT *INTO s FROM public.document_signatures WHERE id=p_signature AND organization_id=p_org FOR SHARE NOWAIT;SELECT *INTO st FROM public.uc_education_issuance_states WHERE record_id=s.document_id AND organization_id=p_org FOR SHARE NOWAIT;
  IF st.record_id IS NULL THEN RETURN false;END IF;
  descriptor:=public.uc_signature_assurance_issued_source_as(p_org,p_signature,st.revision,public.uc_education_issue_state_hash(st.record_id),auth.uid(),NULL,false);
  RETURN descriptor->'file'=p_file;
 END IF;RETURN false;
 EXCEPTION WHEN OTHERS THEN RETURN false;
END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_signature_assurance_disclose_file(p_org uuid,p_signature uuid,p_file jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE literal text;can_source boolean;
BEGIN
 IF p_file IS NULL OR p_file='null'::jsonb THEN RETURN NULL;END IF;
 IF NOT public.uc_signature_assurance_shape(p_file,ARRAY['bucket','path','sha256','bytes','mime'])
  OR NOT coalesce(p_file->>'bucket'IN('external-contracts','signed-documents','org-documents'),false)
  OR NOT public.uc_signature_assurance_text(p_file->'path',2000)OR NOT public.uc_signature_assurance_sha(p_file->'sha256')
  OR NOT public.uc_signature_assurance_integer(p_file->'bytes',1,20971520)OR NOT public.uc_signature_assurance_text(p_file->'mime',200)
  OR p_file->>'path'~'[?#\\[:cntrl:]]|://'OR EXISTS(SELECT 1 FROM unnest(string_to_array(p_file->>'path','/'))part WHERE part IN('.','..'))
 THEN PERFORM public.uc_signature_assurance_error('DEPENDENCY_UNAVAILABLE');END IF;
 IF NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 literal:=p_file::text;
 can_source:=public.uc_signature_assurance_current_file_scope(p_org,p_signature,p_file);
 IF NOT can_source THEN RETURN jsonb_build_object('visibility','redacted','captured_reference_sha256',public.uc_signature_assurance_hash(literal),'value',NULL,'reason','current_file_scope');END IF;
 RETURN jsonb_build_object('visibility','available','captured_reference_json',literal,'captured_reference_sha256',public.uc_signature_assurance_hash(literal),'value',p_file);
END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_signature_assurance_read_html_fields(p_org uuid,p_signature uuid,p_document uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE stored public.uc_signature_assurance_document_snapshots;people uuid[];can_source boolean:=true;visibility text;literal text;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT*INTO stored FROM public.uc_signature_assurance_document_snapshots WHERE id=p_document AND organization_id=p_org AND signature_id=p_signature;
 IF stored.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 SELECT array_agg(DISTINCT person ORDER BY person)INTO people FROM(
  SELECT stored.subject_user_id AS person UNION SELECT stored.recipient_user_id
  UNION SELECT user_id FROM public.uc_signature_assurance_participants WHERE organization_id=p_org AND object_kind='document'AND object_id=p_document
 )known WHERE person IS NOT NULL;
 -- Read uses shared person/org fences, never the exclusive signature stream/request
 -- locks. Parallel ordinary reads must coexist. Trusted erasure remains exclusive42007.
 PERFORM public.uc_signature_assurance_fence(p_org,coalesce(people,'{}'::uuid[]),false,NULL,NULL);
 PERFORM 1 FROM public.document_signatures WHERE id=p_signature AND organization_id=p_org FOR SHARE NOWAIT;
 SELECT*INTO stored FROM public.uc_signature_assurance_document_snapshots WHERE id=p_document AND organization_id=p_org AND signature_id=p_signature FOR SHARE NOWAIT;
 IF stored.id IS NULL OR NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF stored.html_sha256 IS DISTINCT FROM public.uc_signature_assurance_hash(stored.html_text)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 -- A known canonical source reference requires its actual current file-read scope.
 -- Unknown old pointers remain private; this function never fabricates ExactFile proof.
 IF stored.original_file IS NOT NULL THEN can_source:=public.uc_signature_assurance_current_file_scope(p_org,p_signature,stored.original_file);END IF;
 IF NOT can_source THEN visibility:='redacted_current_file_scope';literal:=NULL;
 ELSIF public.uc_signature_assurance_credential_source(p_org,stored.html_text)THEN visibility:='redacted_credential_bearing_source';literal:=NULL;
 ELSE visibility:='available';literal:=stored.html_text;END IF;
 RETURN jsonb_build_object('html_text',literal,'html_sha256',stored.html_sha256,'content_visibility',visibility);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;



-- UC022 fragment 69_controlled_document_capture.sql
-- Signature HTML is a separate recorded preview. The protected PDF is displayed
-- and confirmed as the canonical file, with a real reread proof matching K bytes.
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_capture_document_as(
 p_org uuid,p_signature uuid,p_party text,p_expected_document_revision uuid,p_expected_html_sha256 text,p_actor uuid,p_invitation text DEFAULT NULL
)RETURNS public.uc_signature_assurance_document_snapshots
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage SET lock_timeout='2000ms'AS $fn$
DECLARE s public.document_signatures;r public.signature_revisions;head public.uc_signature_assurance_streams;
 proof public.uc_signature_assurance_file_proofs;captured public.uc_signature_assurance_document_snapshots;
 html text;locator text;key text;bucket text:='external-contracts';revision_id uuid;object_snapshot jsonb;
 issued_descriptor jsonb;issued_state public.uc_education_issuance_states;original_file jsonb;new_id uuid:=gen_random_uuid();people uuid[];prior_people uuid[];primary_subject uuid;person record;
BEGIN
 IF p_party NOT IN('sender','recipient')OR p_party IS NULL OR p_org IS NULL OR p_signature IS NULL OR NOT public.uc_signature_assurance_sha(to_jsonb(p_expected_html_sha256))THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 SELECT *INTO s FROM public.document_signatures WHERE id=p_signature AND organization_id=p_org FOR SHARE NOWAIT;
 IF s.id IS NULL OR s.deleted_at IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF auth.role()='authenticated'THEN
  IF p_actor IS DISTINCT FROM auth.uid()OR p_invitation IS NOT NULL OR NOT public.uc_signature_assurance_active(p_actor)OR NOT public.uc_signature_assurance_signature_write(p_org,p_signature)OR NOT public.uc_signature_assurance_signature_read(p_org,p_signature)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSIF auth.role()='service_role'AND auth.uid()IS NULL THEN
  IF p_party<>'recipient'OR p_invitation IS NULL OR s.signature_token IS DISTINCT FROM p_invitation OR NOT public.uc_signature_token_access_allowed(s.id,false)OR p_actor IS NOT NULL AND NOT public.uc_signature_assurance_active(p_actor)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSE PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 -- Previously closed/legacy-signed rows cannot acquire a new canonical signing
 -- assurance merely by creating another snapshot or repeating an old request.
 IF s.status IN('signed','rejected','expired')OR s.signed_at IS NOT NULL OR p_party='sender'AND s.sender_signed_at IS NOT NULL
  THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 IF s.expires_at IS NOT NULL AND s.expires_at<=clock_timestamp()THEN PERFORM public.uc_signature_assurance_error('EXPIRED');END IF;
 SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_file_people(s);
 PERFORM public.uc_signature_assurance_file_fence(s,p_actor,true,NULL,NULL,people);
 IF auth.role()='authenticated'AND(NOT public.uc_signature_assurance_signature_write(p_org,p_signature)
  OR NOT public.uc_signature_assurance_signature_read(p_org,p_signature))THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 revision_id:=s.current_revision_id;
 IF revision_id IS NOT NULL THEN
  SELECT *INTO r FROM public.signature_revisions WHERE id=revision_id AND signature_id=s.id FOR SHARE NOWAIT;
  IF r.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  html:=r.document_html;locator:=r.file_url;
 ELSE html:=s.document_html;locator:=s.document_snapshot_url;END IF;
 IF revision_id IS DISTINCT FROM p_expected_document_revision OR html IS NULL OR octet_length(html)>1000000
  OR public.uc_signature_assurance_hash(html)IS DISTINCT FROM p_expected_html_sha256
  THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF s.document_type='education_document'THEN
  SELECT *INTO issued_state FROM public.uc_education_issuance_states WHERE record_id=s.document_id AND organization_id=p_org FOR SHARE NOWAIT;
  IF issued_state.record_id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  issued_descriptor:=public.uc_signature_assurance_issued_source_as(p_org,p_signature,issued_state.revision,public.uc_education_issue_state_hash(issued_state.record_id),p_actor,p_invitation,true);
  IF locator IS NOT NULL AND locator IS DISTINCT FROM issued_descriptor->'file'->>'path'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  bucket:='org-documents';locator:=issued_descriptor->'file'->>'path';
 END IF;
 IF locator IS NOT NULL THEN
  key:=CASE WHEN bucket='org-documents'THEN issued_descriptor->'file'->>'path'ELSE public.uc_signature_locator_key(locator,bucket)END;
  IF key IS NULL OR key IS DISTINCT FROM locator OR bucket<>'org-documents'AND NOT public.uc_signature_object_bound(s.id,bucket,key)
   OR bucket<>'org-documents'AND auth.role()='authenticated'AND NOT public.uc_signature_storage_read(bucket,key)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  object_snapshot:=public.uc_signature_assurance_object_snapshot(bucket,key);
  SELECT *INTO proof FROM public.uc_signature_assurance_file_proofs p
   WHERE p.organization_id=p_org AND p.signature_id=p_signature AND p.party_role=p_party
    AND p.proof->'source'->'document_revision_id'IS NOT DISTINCT FROM coalesce(to_jsonb(revision_id),'null'::jsonb)
    AND p.proof->'source'->>'document_html_sha256'=p_expected_html_sha256 AND p.proof->'source'->>'purpose'='source'
    AND p.proof->'source'->>'bucket'=bucket AND p.proof->'source'->>'path'=key
    AND p.proof->'object_after'=object_snapshot
   ORDER BY p.verified_at DESC,p.id DESC LIMIT 1 FOR SHARE NOWAIT;
  IF proof.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  PERFORM 1 FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=proof.id AND organization_id=p_org AND relation<>'staff_attribution'FOR SHARE NOWAIT;
  SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO prior_people FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=proof.id AND organization_id=p_org AND relation<>'staff_attribution';
  PERFORM public.uc_signature_assurance_file_fence(s,p_actor,true,proof.subject_user_id,proof.recipient_user_id,prior_people);
  original_file:=proof.proof->'file';
 END IF;
 head:=public.uc_signature_assurance_stream(p_org,'signature',p_signature);
 SELECT CASE WHEN count(DISTINCT user_id)=1 THEN min(user_id::text)::uuid END INTO primary_subject
  FROM public.uc_signature_assurance_file_people(s)WHERE relation='subject';
 PERFORM public.uc_signature_assurance_token('document',new_id);
 INSERT INTO public.uc_signature_assurance_document_snapshots(id,organization_id,signature_id,party_role,document_revision_id,html_text,html_sha256,original_file,source_file_state,subject_user_id,recipient_user_id,captured_by)
  VALUES(new_id,p_org,p_signature,p_party,revision_id,html,p_expected_html_sha256,original_file,CASE WHEN original_file IS NULL THEN'not_present'ELSE'verified_bytes'END,primary_subject,s.recipient_user_id,p_actor)RETURNING *INTO captured;
 FOR person IN SELECT user_id,relation FROM public.uc_signature_assurance_file_people(s)LOOP
  PERFORM public.uc_signature_assurance_track(p_org,'document',new_id,person.user_id,person.relation);
  PERFORM public.uc_signature_assurance_track(p_org,'stream',p_signature,person.user_id,person.relation);
 END LOOP;
 FOR person IN SELECT unnest(coalesce(prior_people,'{}'::uuid[]))user_id LOOP
  PERFORM public.uc_signature_assurance_track(p_org,'document',new_id,person.user_id,'subject');
  PERFORM public.uc_signature_assurance_track(p_org,'stream',p_signature,person.user_id,'subject');
 END LOOP;
 PERFORM public.uc_signature_assurance_track(p_org,'document',new_id,p_actor,'staff_attribution');
 RETURN captured;
 EXCEPTION WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;



-- UC022 fragment 70_current_source_context.sql
-- Current source eligibility includes genuine controlled issuer state and exact
-- object proof; historical conclusions remain frozen independently of eligibility.
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_context(p_org uuid,p_signature uuid,p_party text)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;h public.uc_signature_assurance_streams;b public.uc_signature_assurance_bindings;
 e public.uc_signature_assurance_events;d public.uc_signature_assurance_document_snapshots;v public.uc_signature_assurance_policy_versions;
 decision public.uc_signature_assurance_policy_decisions;role_name text;current_document jsonb;caps jsonb;parties jsonb:='{}';
 missing text[];limits text[];purpose text;party_json jsonb;legacy boolean;closed boolean;
BEGIN
 IF p_party IS NULL OR p_party NOT IN('sender','recipient')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 s:=public.uc_signature_assurance_signature_fence(p_org,p_signature);
 current_document:=public.uc_signature_assurance_current_document(p_org,p_signature);caps:=public.uc_signature_assurance_capabilities(p_org,p_signature,p_party);
 SELECT *INTO h FROM public.uc_signature_assurance_streams WHERE organization_id=p_org AND kind='signature'AND entity_id=p_signature FOR SHARE NOWAIT;
 legacy:=s.signed_at IS NOT NULL OR s.sender_signed_at IS NOT NULL OR s.signed_source_hash IS NOT NULL OR s.handwritten_scan_hash IS NOT NULL;
 closed:=s.deleted_at IS NOT NULL OR s.signed_at IS NOT NULL OR s.status IN('signed','rejected','expired');
 FOREACH role_name IN ARRAY ARRAY['sender','recipient']LOOP
  SELECT *INTO b FROM public.uc_signature_assurance_bindings WHERE organization_id=p_org AND signature_id=p_signature AND party_role=role_name ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
  SELECT *INTO e FROM public.uc_signature_assurance_events WHERE organization_id=p_org AND signature_id=p_signature AND stream_kind='signature'AND party_role=role_name ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
  missing:='{}';limits:=ARRAY['Показываются сохранённые факты платформы. Криптографическая проверка подписи и автоматический вывод о юридической действительности не выполнялись.'];purpose:='unconfigured';
  IF closed OR role_name='sender'AND s.sender_signed_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_events terminal WHERE terminal.organization_id=p_org AND terminal.signature_id=p_signature AND terminal.party_role=role_name AND terminal.kind IN('sender_confirmed','account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked'))THEN missing:=array_append(missing,'CLOSED');END IF;
  IF s.document_type='education_document'AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_states issued WHERE issued.organization_id=p_org AND issued.record_id=s.document_id AND NOT issued.redacted AND issued.annulment IS NULL AND issued.artifact IS NOT NULL)THEN missing:=array_append(missing,'SOURCE_UNAVAILABLE');END IF;
  IF s.expires_at IS NOT NULL AND s.expires_at<=clock_timestamp()THEN missing:=array_append(missing,'EXPIRED');END IF;
  IF b.id IS NULL THEN
   missing:=missing||ARRAY['CLASSIFICATION_REQUIRED','POLICY_REQUIRED'];
   party_json:=jsonb_build_object('binding',NULL,'policy',NULL);
  ELSE
   SELECT *INTO v FROM public.uc_signature_assurance_policy_versions WHERE id=b.policy_version_id AND organization_id=p_org FOR SHARE NOWAIT;
   SELECT *INTO d FROM public.uc_signature_assurance_document_snapshots WHERE id=b.document_snapshot_id AND organization_id=p_org AND signature_id=p_signature AND party_role=role_name FOR SHARE NOWAIT;
   SELECT *INTO decision FROM public.uc_signature_assurance_policy_decisions WHERE policy_version_id=v.id AND organization_id=p_org ORDER BY stream_revision DESC LIMIT 1 FOR SHARE NOWAIT;
   IF v.id IS NULL OR d.id IS NULL OR decision.id IS NULL THEN PERFORM public.uc_signature_assurance_error('DEPENDENCY_UNAVAILABLE');END IF;
   purpose:=v.body->>'purpose';limits:=array_append(limits,v.body->>'limitations');
   IF NOT public.uc_signature_assurance_policy_eligible(p_org,v.id)THEN missing:=array_append(missing,'POLICY_NOT_ACCEPTED');END IF;
   IF b.policy_sha256 IS DISTINCT FROM v.body_sha256 OR b.policy_decision_revision IS DISTINCT FROM decision.stream_revision THEN missing:=array_append(missing,'POLICY_CHANGED');END IF;
   IF coalesce(to_jsonb(d.document_revision_id),'null'::jsonb)IS DISTINCT FROM current_document->'document_revision_id'OR d.html_sha256 IS DISTINCT FROM current_document->>'document_html_sha256'THEN missing:=array_append(missing,'SOURCE_CHANGED');END IF;
   IF d.source_file_state='unverified_reference'THEN missing:=array_append(missing,'SOURCE_UNAVAILABLE');END IF;
   IF d.original_file IS NOT NULL AND NOT public.uc_signature_assurance_current_file_scope(p_org,p_signature,d.original_file)THEN missing:=array_append(missing,'SOURCE_UNAVAILABLE');END IF;
   IF d.original_file IS NOT NULL AND public.uc_signature_assurance_current_file_scope(p_org,p_signature,d.original_file)AND NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_file_proofs proof WHERE proof.organization_id=p_org AND proof.signature_id=p_signature AND proof.party_role=role_name AND proof.proof->'file'=d.original_file AND proof.proof->'source'->>'purpose'='source'AND proof.proof->'source'->'document_revision_id'IS NOT DISTINCT FROM current_document->'document_revision_id'AND proof.proof->'source'->>'document_html_sha256'=current_document->>'document_html_sha256'AND proof.proof->'object_after'=public.uc_signature_assurance_object_snapshot(d.original_file->>'bucket',d.original_file->>'path'))THEN missing:=array_append(missing,'SOURCE_CHANGED');END IF;
   IF v.body->>'method'='authenticated_account_confirmation'AND(role_name='recipient'AND s.recipient_user_id IS DISTINCT FROM auth.uid()OR role_name='sender'AND s.sender_user_id IS DISTINCT FROM auth.uid())THEN missing:=array_append(missing,'IDENTITY_MISMATCH');END IF;
   IF v.body->>'purpose'='account_pep'AND NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_agreements a WHERE a.organization_id=p_org AND a.subject_user_id=auth.uid()AND a.policy_version_id=v.id AND a.policy_sha256=v.body_sha256 AND a.terms->>'sha256'=v.body->'agreement'->>'sha256')THEN missing:=array_append(missing,'AGREEMENT_REQUIRED');END IF;
   party_json:=jsonb_build_object('binding',public.uc_signature_assurance_project_binding(p_org,p_signature,b.id),'policy',public.uc_signature_assurance_project_policy(p_org,v.id));
  END IF;
  SELECT coalesce(array_agg(DISTINCT item ORDER BY item),'{}'::text[])INTO missing FROM unnest(missing)item;
  party_json:=party_json||jsonb_build_object('party_role',role_name,'latest_party_event_revision',coalesce(e.revision,0),
   'conclusion',coalesce(e.payload->>'conclusion',CASE WHEN legacy AND(role_name='sender'AND s.sender_signed_at IS NOT NULL OR role_name='recipient'AND s.signed_at IS NOT NULL)THEN'legacy_unknown'ELSE'not_confirmed'END),
   'requirements',jsonb_build_object('eligible',cardinality(missing)=0,'missing',to_jsonb(missing),'purpose',purpose,'limitations',to_jsonb(limits)));
  parties:=parties||jsonb_build_object(role_name,party_json);
 END LOOP;
 RETURN jsonb_build_object('organization_id',p_org,'signature_id',p_signature,'current_document_revision_id',current_document->'document_revision_id',
  'current_document_html_sha256',current_document->>'document_html_sha256','legacy_status',s.status,'legacy_method',s.signature_method,'chosen_party',p_party,
  'parties',parties,'latest_event_revision',coalesce(h.revision,0),'capabilities',caps,
  'latest_receipt_id',(SELECT m.source_manifest_id FROM public.uc_signature_assurance_scoped_manifests m WHERE m.organization_id=p_org AND m.signature_id=p_signature ORDER BY m.captured_at DESC,m.id DESC LIMIT 1),
  'legacy_evidence_available',legacy);
END;$fn$;

-- Recipient-only service context, authorized by the real invitation plus optional
-- original JWT observation. No sender policy, internal document path or account is exposed.
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_invitation_context(p_token text,p_actor uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
DECLARE s public.document_signatures;r public.signature_revisions;head public.uc_signature_assurance_streams;b public.uc_signature_assurance_bindings;v public.uc_signature_assurance_policy_versions;d public.uc_signature_assurance_document_snapshots;e public.uc_signature_assurance_events;decision public.uc_signature_assurance_policy_decisions;html text;binding jsonb;policy jsonb;missing text[]:='{}';people uuid[];account boolean;purpose text:='unconfigured';limits text[]:=ARRAY['Подтверждается наблюдаемый факт действия на платформе. Проверка криптографической подписи, личности человека и юридической действительности не выполнялась.'];
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR NOT public.uc_signature_assurance_text(to_jsonb(p_token),200)OR length(p_token)<16 OR p_token~'[[:space:]]'OR p_actor IS NOT NULL AND NOT public.uc_signature_assurance_active(p_actor)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT *INTO s FROM public.document_signatures WHERE signature_token=p_token FOR SHARE NOWAIT;
 IF s.id IS NULL OR NOT public.uc_signature_token_access_allowed(s.id,false)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_signature_assurance_file_fence(s,p_actor,false);
 SELECT *INTO head FROM public.uc_signature_assurance_streams WHERE organization_id=s.organization_id AND kind='signature'AND entity_id=s.id FOR SHARE NOWAIT;
 IF s.current_revision_id IS NOT NULL THEN SELECT *INTO r FROM public.signature_revisions WHERE id=s.current_revision_id AND signature_id=s.id FOR SHARE NOWAIT;IF r.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;html:=r.document_html;ELSE html:=s.document_html;END IF;
 IF html IS NULL OR octet_length(html)>1000000 THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 account:=p_actor IS NOT NULL AND p_actor=s.recipient_user_id AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=p_actor AND u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL AND(s.recipient_email IS NULL OR lower(btrim(u.email))=lower(btrim(s.recipient_email))));
 SELECT *INTO e FROM public.uc_signature_assurance_events WHERE organization_id=s.organization_id AND signature_id=s.id AND party_role='recipient'ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
 SELECT *INTO b FROM public.uc_signature_assurance_bindings WHERE organization_id=s.organization_id AND signature_id=s.id AND party_role='recipient'ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
 IF s.deleted_at IS NOT NULL OR s.signed_at IS NOT NULL OR s.status IN('signed','rejected','expired')OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_events terminal WHERE terminal.organization_id=s.organization_id AND terminal.signature_id=s.id AND terminal.party_role='recipient'AND terminal.kind IN('account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked'))THEN missing:=array_append(missing,'CLOSED');END IF;
 IF s.document_type='education_document'AND NOT EXISTS(SELECT 1 FROM public.uc_education_issuance_states issued WHERE issued.organization_id=s.organization_id AND issued.record_id=s.document_id AND NOT issued.redacted AND issued.annulment IS NULL AND issued.artifact IS NOT NULL)THEN missing:=array_append(missing,'SOURCE_UNAVAILABLE');END IF;
 IF s.expires_at<=clock_timestamp()THEN missing:=array_append(missing,'EXPIRED');END IF;
 IF b.id IS NULL THEN missing:=missing||ARRAY['CLASSIFICATION_REQUIRED','POLICY_REQUIRED'];
 ELSE
  SELECT *INTO v FROM public.uc_signature_assurance_policy_versions WHERE id=b.policy_version_id AND organization_id=s.organization_id FOR SHARE NOWAIT;SELECT *INTO d FROM public.uc_signature_assurance_document_snapshots WHERE id=b.document_snapshot_id AND organization_id=s.organization_id AND signature_id=s.id AND party_role='recipient'FOR SHARE NOWAIT;SELECT *INTO decision FROM public.uc_signature_assurance_policy_decisions WHERE policy_version_id=v.id AND organization_id=s.organization_id ORDER BY stream_revision DESC LIMIT 1 FOR SHARE NOWAIT;
  IF v.id IS NULL OR d.id IS NULL OR decision.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  purpose:=v.body->>'purpose';limits:=array_append(limits,v.body->>'limitations');
  IF NOT public.uc_signature_assurance_policy_eligible(s.organization_id,v.id)THEN missing:=array_append(missing,'POLICY_NOT_ACCEPTED');END IF;
  IF b.policy_sha256 IS DISTINCT FROM v.body_sha256 OR b.policy_decision_revision IS DISTINCT FROM decision.stream_revision THEN missing:=array_append(missing,'POLICY_CHANGED');END IF;
  IF d.document_revision_id IS DISTINCT FROM s.current_revision_id OR d.html_sha256 IS DISTINCT FROM public.uc_signature_assurance_hash(html)THEN missing:=array_append(missing,'SOURCE_CHANGED');END IF;
  IF d.original_file IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_file_proofs proof WHERE proof.organization_id=s.organization_id AND proof.signature_id=s.id AND proof.party_role='recipient'AND proof.proof->'source'->>'purpose'='source'AND proof.proof->'file'=d.original_file AND proof.proof->'object_after'=public.uc_signature_assurance_object_snapshot(d.original_file->>'bucket',d.original_file->>'path'))THEN missing:=array_append(missing,'SOURCE_CHANGED');END IF;
  IF v.body->>'method'='authenticated_account_confirmation'AND(v.body->'agreement'IS NULL OR v.body->'agreement'='null'::jsonb)THEN missing:=array_append(missing,'AGREEMENT_REQUIRED');END IF;
  IF v.body->>'method'='authenticated_account_confirmation'AND NOT account THEN missing:=array_append(missing,'IDENTITY_MISMATCH');END IF;
  binding:=jsonb_build_object('id',b.id,'organization_id',b.organization_id,'signature_id',b.signature_id,'party_role',b.party_role,'revision',b.revision,'document_revision_id',d.document_revision_id,'document_html_sha256',d.html_sha256,'classification',b.classification,'policy_version_id',b.policy_version_id,'policy_sha256',b.policy_sha256,'policy_decision_revision',b.policy_decision_revision,'agreement_sha256',b.agreement_sha256,'source_file_sha256',d.original_file->'sha256','source_file_bytes',d.original_file->'bytes');
  policy:=jsonb_build_object('id',v.id,'family_id',v.family_id,'organization_id',v.organization_id,'version',v.version,'body_sha256',v.body_sha256,'classification',v.body->'classification','method',v.body->'method','purpose',v.body->'purpose','identity_requirement',v.body->'identity_requirement','authority_requirement',v.body->'authority_requirement','agreement',v.body->'agreement','consent',v.body->'consent','basis_explanation',v.body->'basis'->'explanation','legal_sources',v.body->'basis'->'sources','limitations',v.body->'limitations');
 END IF;
 SELECT coalesce(array_agg(DISTINCT code ORDER BY code),'{}'::text[])INTO missing FROM unnest(missing)code;
 RETURN jsonb_build_object('organization_id',s.organization_id,'signature_id',s.id,'current_document_revision_id',s.current_revision_id,'current_document_html_sha256',public.uc_signature_assurance_hash(html),'legacy_status',s.status,'legacy_method',s.signature_method,'latest_event_revision',coalesce(head.revision,0),'party_role','recipient','latest_party_event_revision',coalesce(e.revision,0),'conclusion',coalesce(e.payload->>'conclusion',CASE WHEN s.signed_at IS NULL THEN'not_confirmed'ELSE'legacy_unknown'END),'requirements',jsonb_build_object('eligible',cardinality(missing)=0,'missing',to_jsonb(missing),'purpose',purpose,'limitations',to_jsonb(limits)),'binding',binding,'policy',policy,'supported_methods',jsonb_build_array('graphic_asset','scan_received','bearer_invitation_confirmation','authenticated_account_confirmation'),'unsupported_methods',jsonb_build_array(jsonb_build_object('method','verified_email_challenge_confirmation','verified',false,'reason','VERIFIER_NOT_IMPLEMENTED'),jsonb_build_object('method','external_qualified_signature','verified',false,'reason','VERIFIER_NOT_IMPLEMENTED')),'authenticated_recipient',account);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;



-- UC022 fragment 72_private_evidence_bucket_boundary.sql
-- A private proof cannot silently become a public object through a bucket flip.
CREATE FUNCTION public.uc_signature_assurance_bucket_boundary()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE used boolean;
BEGIN
 IF OLD.id NOT IN('external-contracts','signed-documents','org-documents')THEN IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;END IF;
 SELECT EXISTS(SELECT 1 FROM public.uc_signature_assurance_file_proofs p WHERE p.proof->'file'->>'bucket'=OLD.id)OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_document_snapshots d WHERE d.original_file->>'bucket'=OLD.id)OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_events e WHERE e.payload->'original_file'->>'bucket'=OLD.id OR e.payload->'scan_file'->>'bucket'=OLD.id)INTO used;
 IF used THEN IF TG_OP='DELETE'THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;IF NEW.id IS DISTINCT FROM OLD.id OR NEW.public THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_signature_assurance_private_bucket_boundary BEFORE UPDATE OR DELETE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION public.uc_signature_assurance_bucket_boundary();

CREATE OR REPLACE FUNCTION public.uc_signature_assurance_object_snapshot(p_bucket text,p_path text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE o storage.objects;a jsonb;b jsonb;sz bigint;other_sz bigint;m text;other_m text;commitment jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets b WHERE b.id=p_bucket AND NOT b.public)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 SELECT*INTO o FROM storage.objects WHERE bucket_id=p_bucket AND name=p_path FOR SHARE NOWAIT;
 IF o.id IS NULL OR o.updated_at IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 a:=o.metadata->'size';b:=o.metadata->'contentLength';
 IF a IS NOT NULL AND a<>'null'::jsonb THEN
  IF jsonb_typeof(a)NOT IN('number','string')OR(a#>>'{}')!~'^[0-9]{1,12}$'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;sz:=(a#>>'{}')::bigint;
 END IF;
 IF b IS NOT NULL AND b<>'null'::jsonb THEN
  IF jsonb_typeof(b)NOT IN('number','string')OR(b#>>'{}')!~'^[0-9]{1,12}$'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;other_sz:=(b#>>'{}')::bigint;
 END IF;
 IF sz IS NOT NULL AND other_sz IS NOT NULL AND sz<>other_sz THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;sz:=coalesce(sz,other_sz);
 IF sz IS NOT NULL AND(sz<1 OR sz>20971520)THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 m:=lower(btrim(split_part(o.metadata->>'mimetype',';',1)));other_m:=lower(btrim(split_part(o.metadata->>'contentType',';',1)));
 IF m IS NOT NULL AND m!~'^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$'OR other_m IS NOT NULL AND other_m!~'^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$'OR m IS NOT NULL AND other_m IS NOT NULL AND m<>other_m THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 m:=coalesce(m,other_m);IF length(m)>200 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 commitment:=jsonb_build_object('id',o.id,'bucket_id',o.bucket_id,'name',o.name,'owner',o.owner,'owner_id',o.owner_id,'updated_at',public.uc_signature_assurance_utc(o.updated_at),'metadata',o.metadata,'user_metadata',o.user_metadata);
 RETURN jsonb_build_object('object_id',o.id,'bucket',p_bucket,'path',p_path,'updated_at',public.uc_signature_assurance_utc(o.updated_at),'metadata_sha256',public.uc_signature_assurance_hash(commitment::text),'reported_size',sz,'reported_mime',m);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;



-- UC022 fragment 73_scan_declaration_authority.sql
-- A scan declaration does not automatically assert representative authority.
-- File-backed confirmations require an exact saved binding; HTML-only factual
-- bearer confirmation makes no policy/legal-identity claim.
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_service(p_action jsonb,p_observed_actor_user_id uuid,p_request_ip text DEFAULT NULL,p_request_user_agent text DEFAULT NULL,p_original_proof jsonb DEFAULT NULL,p_scan_proof jsonb DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='10000ms' SET lock_timeout='2000ms'AS $fn$
#variable_conflict use_column
DECLARE s public.document_signatures;ctx jsonb;head public.uc_signature_assurance_streams;stored public.uc_signature_assurance_requests;b public.uc_signature_assurance_bindings;v public.uc_signature_assurance_policy_versions;decision public.uc_signature_assurance_policy_decisions;d public.uc_signature_assurance_document_snapshots;a public.uc_signature_assurance_agreements;e public.uc_signature_assurance_events;agreement_head public.uc_signature_assurance_streams;agreement_event public.uc_signature_assurance_events;scan_ctx jsonb;file_action jsonb;people uuid[];person record;operation text:=p_action->>'action';actor uuid:=p_observed_actor_user_id;request_id uuid;expected integer;digest text;authority jsonb;method text;conclusion text;terms jsonb;rendered text;org_name text;new_agreement uuid;proof_row public.uc_signature_assurance_file_proofs;
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR actor IS NOT NULL AND NOT public.uc_signature_assurance_active(actor)OR p_request_ip IS NOT NULL OR p_request_user_agent IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_signature_assurance_public_action(p_action);
 IF octet_length(p_action::text)>196608 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 ctx:=public.uc_signature_assurance_invitation_context(p_action->>'token',actor);
 SELECT *INTO s FROM public.document_signatures WHERE id=(ctx->>'signature_id')::uuid AND organization_id=(ctx->>'organization_id')::uuid FOR SHARE NOWAIT;
 IF public.uc_signature_assurance_credential_source(s.organization_id,(p_action-'token')::text)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF operation='context'THEN
  IF coalesce(p_original_proof,'null'::jsonb)<>'null'::jsonb OR coalesce(p_scan_proof,'null'::jsonb)<>'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  RETURN jsonb_build_object('version',1,'ok',true,'kind','context','context',ctx);
 END IF;
 request_id:=(p_action->>'request_id')::uuid;expected:=(p_action->>'expected_revision')::integer;
 SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_file_people(s);
 PERFORM public.uc_signature_assurance_file_fence(s,actor,true,NULL,NULL,people);PERFORM public.uc_signature_assurance_fence(s.organization_id,people,true,s.id,request_id,actor);
 ctx:=public.uc_signature_assurance_invitation_context(p_action->>'token',actor);
 digest:=public.uc_signature_assurance_hash(jsonb_build_object('organization_id',s.organization_id,'signature_id',s.id,'action',p_action-'token')::text);
 stored:=public.uc_signature_assurance_request(s.organization_id,request_id,digest,actor);
 IF stored.request_id IS NOT NULL THEN
  -- Every original non-attribution participant remains in the fence even when
  -- current mutable document/recipient associations have changed.
  SELECT coalesce(array_agg(DISTINCT person ORDER BY person),'{}'::uuid[])INTO people FROM(
   SELECT p.user_id person FROM public.uc_signature_assurance_participants p WHERE p.organization_id=s.organization_id AND p.relation<>'staff_attribution'AND(
    p.object_kind='request'AND p.object_id=stored.request_id OR p.object_kind='event'AND p.object_id=stored.event_id OR p.object_kind='binding'AND p.object_id=stored.binding_id
    OR p.object_kind='document'AND p.object_id IN(SELECT oldevent.document_snapshot_id FROM public.uc_signature_assurance_events oldevent WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id))
   UNION SELECT oldevent.subject_user_id FROM public.uc_signature_assurance_events oldevent WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id
   UNION SELECT oldevent.recipient_user_id FROM public.uc_signature_assurance_events oldevent WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id
   UNION SELECT olddoc.subject_user_id FROM public.uc_signature_assurance_document_snapshots olddoc JOIN public.uc_signature_assurance_events oldevent ON oldevent.document_snapshot_id=olddoc.id AND oldevent.organization_id=olddoc.organization_id WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id
   UNION SELECT olddoc.recipient_user_id FROM public.uc_signature_assurance_document_snapshots olddoc JOIN public.uc_signature_assurance_events oldevent ON oldevent.document_snapshot_id=olddoc.id AND oldevent.organization_id=olddoc.organization_id WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id
  )known WHERE person IS NOT NULL;
  PERFORM public.uc_signature_assurance_file_fence(s,actor,true,NULL,NULL,people);
  IF stored.action IS DISTINCT FROM operation OR stored.stream_id IS DISTINCT FROM s.id OR stored.party_role IS DISTINCT FROM'recipient'THEN PERFORM public.uc_signature_assurance_error('REQUEST_CONFLICT');END IF;
  RETURN jsonb_build_object('version',1,'ok',true,'kind','confirmation','context',ctx,'receipt',public.uc_signature_assurance_receipt(stored,true),'certificate_state','not_requested');
 END IF;
 head:=public.uc_signature_assurance_stream(s.organization_id,'signature',s.id);
 IF head.revision<>expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF ctx->'requirements'->'missing'?'CLOSED'THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 IF ctx->'requirements'->'missing'?'EXPIRED'THEN PERFORM public.uc_signature_assurance_error('EXPIRED');END IF;
 IF coalesce(p_action->'expected_document_revision_id','null'::jsonb)IS DISTINCT FROM ctx->'current_document_revision_id'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF operation='reject'THEN
  IF coalesce(p_original_proof,'null'::jsonb)<>'null'::jsonb OR coalesce(p_scan_proof,'null'::jsonb)<>'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  e:=public.uc_signature_assurance_append(p_org=>s.organization_id,p_stream=>head.id,p_expected=>expected,p_request=>request_id,p_kind=>'recipient_rejected',p_method=>'legacy_unknown',p_reason=>p_action->>'reason',p_authority=>public.uc_signature_assurance_empty_authority(),p_signature=>s.id,p_actor=>actor,p_party_role=>'recipient');
 ELSE
  IF p_action->>'document_html_sha256'IS DISTINCT FROM ctx->>'current_document_html_sha256'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  IF p_action->'binding_id'IS DISTINCT FROM coalesce(ctx->'binding'->'id','null'::jsonb)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  IF ctx->'binding'<>'null'::jsonb THEN
   SELECT *INTO b FROM public.uc_signature_assurance_bindings WHERE id=(ctx->'binding'->>'id')::uuid AND organization_id=s.organization_id AND signature_id=s.id AND party_role='recipient'FOR SHARE NOWAIT;SELECT *INTO v FROM public.uc_signature_assurance_policy_versions WHERE id=b.policy_version_id AND organization_id=s.organization_id FOR SHARE NOWAIT;SELECT *INTO decision FROM public.uc_signature_assurance_policy_decisions WHERE policy_version_id=v.id AND organization_id=s.organization_id ORDER BY stream_revision DESC LIMIT 1 FOR SHARE NOWAIT;
   IF NOT public.uc_signature_assurance_policy_eligible(s.organization_id,v.id)THEN PERFORM public.uc_signature_assurance_error('POLICY_NOT_ACCEPTED');END IF;
   IF b.policy_sha256 IS DISTINCT FROM p_action->>'policy_sha256'OR v.body_sha256 IS DISTINCT FROM b.policy_sha256 OR b.policy_decision_revision IS DISTINCT FROM(p_action->>'policy_decision_revision')::integer OR b.policy_decision_revision IS DISTINCT FROM decision.stream_revision THEN PERFORM public.uc_signature_assurance_error('POLICY_CHANGED');END IF;
  END IF;
  method:=CASE WHEN operation='receive_scan'THEN'scan_received'ELSE p_action->>'method'END;
  IF b.id IS NOT NULL AND v.body->>'method'IS DISTINCT FROM method THEN PERFORM public.uc_signature_assurance_error('METHOD_UNSUPPORTED');END IF;
  IF method='authenticated_account_confirmation'AND NOT(ctx->>'authenticated_recipient')::boolean THEN PERFORM public.uc_signature_assurance_error('IDENTITY_MISMATCH');END IF;
  authority:=CASE WHEN operation='receive_scan'THEN jsonb_build_object('kind',CASE WHEN v.body->>'authority_requirement'IN('self','declared_representative')THEN v.body->>'authority_requirement'ELSE'unknown'END,'declaration',p_action->>'declaration','document_reference',NULL,'verification','not_verified')ELSE public.uc_signature_assurance_invitation_authority(s.organization_id,actor,p_action->'authority')END;
  IF b.id IS NOT NULL AND authority->>'kind'IS DISTINCT FROM v.body->>'authority_requirement'THEN PERFORM public.uc_signature_assurance_error('AUTHORITY_REQUIRED');END IF;
  d:=public.uc_signature_assurance_capture_document_as(s.organization_id,s.id,'recipient',s.current_revision_id,p_action->>'document_html_sha256',actor,p_action->>'token');
  IF d.original_file IS NOT NULL AND b.id IS NULL THEN PERFORM public.uc_signature_assurance_error('POLICY_REQUIRED');END IF;
  IF coalesce(p_original_proof,'null'::jsonb)IS DISTINCT FROM coalesce(d.original_file,'null'::jsonb)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  IF method='authenticated_account_confirmation'THEN
   terms:=v.body->'agreement';
   IF terms IS NULL OR terms='null'::jsonb OR terms->>'sha256'IS DISTINCT FROM p_action->>'agreement_sha256'THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
   IF p_action->'agreement_event_id'<>'null'::jsonb THEN
    SELECT *INTO a FROM public.uc_signature_assurance_agreements WHERE id=(p_action->>'agreement_event_id')::uuid AND organization_id=s.organization_id AND subject_user_id=actor FOR SHARE NOWAIT;
    IF a.id IS NULL OR a.policy_version_id IS DISTINCT FROM v.id OR a.policy_sha256 IS DISTINCT FROM v.body_sha256 OR a.terms IS DISTINCT FROM terms THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
   ELSE
    SELECT name INTO org_name FROM public.organizations WHERE id=s.organization_id FOR SHARE NOWAIT;
    IF NOT public.uc_signature_assurance_text(to_jsonb(org_name),500)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
    rendered:=(terms->>'text')||E'\n\nСведения о подтверждении\nОрганизация: '||org_name||E'\nИмя, указанное участником: '||(p_action->>'declared_full_name')||E'\nИдентификатор учётной записи: '||actor::text;
    IF octet_length(rendered)>65536 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
    agreement_head:=public.uc_signature_assurance_stream(s.organization_id,'agreement',actor,actor);new_agreement:=gen_random_uuid();PERFORM public.uc_signature_assurance_token('agreement',new_agreement);
    INSERT INTO public.uc_signature_assurance_agreements(id,organization_id,subject_user_id,stream_id,revision,policy_version_id,policy_sha256,terms,rendered_text,rendered_text_sha256,actor)VALUES(new_agreement,s.organization_id,actor,agreement_head.id,agreement_head.revision+1,v.id,v.body_sha256,terms,rendered,public.uc_signature_assurance_hash(rendered),public.uc_signature_assurance_actor(actor,p_action->>'declared_full_name'))RETURNING *INTO a;
    agreement_event:=public.uc_signature_assurance_append(p_org=>s.organization_id,p_stream=>agreement_head.id,p_expected=>agreement_head.revision,p_request=>request_id,p_kind=>'agreement_accepted',p_method=>'authenticated_account_confirmation',p_reason=>'Учётная запись получателя явно подтвердила точный текст выбранной редакции соглашения.',p_authority=>jsonb_build_object('kind','self','declaration',NULL,'document_reference',NULL,'verification','not_verified'),p_policy=>v.id,p_agreement=>a.id,p_conclusion=>'factual_confirmation',p_actor=>actor,p_declared_name=>p_action->>'declared_full_name');
    PERFORM public.uc_signature_assurance_track(s.organization_id,'agreement',a.id,actor,'subject');PERFORM public.uc_signature_assurance_track(s.organization_id,'stream',agreement_head.id,actor,'subject');
   END IF;
  END IF;
  conclusion:=CASE WHEN method='scan_received'THEN'scan_received'WHEN method='authenticated_account_confirmation'AND v.body->>'purpose'='account_pep'THEN'policy_eligible_account_confirmation'ELSE'factual_confirmation'END;
  IF method='scan_received'THEN
   file_action:=jsonb_build_object('action','file_context','address',jsonb_build_object('kind','invitation','token',p_action->>'token'),'expected_document_revision_id',p_action->'expected_document_revision_id','document_html_sha256',p_action->'document_html_sha256','purpose','scan','scan_path',p_action->'scan_path');scan_ctx:=public.uc_signature_assurance_file_context_private(file_action,actor);
   SELECT *INTO proof_row FROM public.uc_signature_assurance_file_proofs proof WHERE proof.organization_id=s.organization_id AND proof.signature_id=s.id AND proof.party_role='recipient'AND proof.proof->'source'=scan_ctx->'source'AND proof.proof->'object_after'=scan_ctx->'object'AND proof.proof->'file'=p_scan_proof ORDER BY proof.verified_at DESC,proof.id DESC LIMIT 1 FOR SHARE NOWAIT;
   IF proof_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
   SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=proof_row.id AND organization_id=s.organization_id AND relation<>'staff_attribution';PERFORM public.uc_signature_assurance_file_fence(s,actor,true,proof_row.subject_user_id,proof_row.recipient_user_id,people);
   e:=public.uc_signature_assurance_append_scan(p_org=>s.organization_id,p_stream=>head.id,p_expected=>expected,p_request=>request_id,p_kind=>'scan_received',p_method=>method,p_reason=>p_action->>'declaration',p_authority=>authority,p_policy=>v.id,p_signature=>s.id,p_document=>d.id,p_conclusion=>conclusion,p_actor=>actor,p_declared_name=>p_action->>'declared_full_name',p_party_role=>'recipient',p_binding=>b.id,p_scan=>p_scan_proof);
   FOR person IN SELECT unnest(people)user_id LOOP PERFORM public.uc_signature_assurance_track(s.organization_id,'event',e.id,person.user_id,'subject');PERFORM public.uc_signature_assurance_track(s.organization_id,'stream',s.id,person.user_id,'subject');PERFORM public.uc_signature_assurance_track(s.organization_id,'request',request_id,person.user_id,'subject');END LOOP;
  ELSE
   IF coalesce(p_scan_proof,'null'::jsonb)<>'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
   e:=public.uc_signature_assurance_append(p_org=>s.organization_id,p_stream=>head.id,p_expected=>expected,p_request=>request_id,p_kind=>CASE WHEN method='authenticated_account_confirmation'THEN'account_confirmed'ELSE'bearer_confirmed'END,p_method=>method,p_reason=>CASE WHEN method='authenticated_account_confirmation'THEN'Получатель подтвердил точную версию документа из наблюдаемой учётной записи.'ELSE'Зафиксировано подтверждение точной версии документа держателем приглашения; личность не устанавливалась.'END,p_authority=>authority,p_policy=>v.id,p_signature=>s.id,p_document=>d.id,p_agreement=>a.id,p_conclusion=>conclusion,p_actor=>actor,p_declared_name=>p_action->>'declared_full_name',p_party_role=>'recipient',p_binding=>b.id);
  END IF;
 END IF;
 stored:=public.uc_signature_assurance_record_request(s.organization_id,request_id,digest,operation,head.id,e.id,s.id,e.revision,actor,'recipient',b.id);
 FOR person IN SELECT user_id,relation FROM public.uc_signature_assurance_file_people(s)LOOP PERFORM public.uc_signature_assurance_track(s.organization_id,'event',e.id,person.user_id,person.relation);PERFORM public.uc_signature_assurance_track(s.organization_id,'request',request_id,person.user_id,person.relation);PERFORM public.uc_signature_assurance_track(s.organization_id,'stream',s.id,person.user_id,person.relation);END LOOP;
 RETURN jsonb_build_object('version',1,'ok',true,'kind','confirmation','context',public.uc_signature_assurance_invitation_context(p_action->>'token',actor),'receipt',public.uc_signature_assurance_receipt(stored),'certificate_state','not_requested');
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;



-- UC022 fragment 74_controlled_invitation_proof_dispatch.sql
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_verify_invitation_file_service(p_action jsonb,p_observed_actor_user_id uuid,p_request_ip inet DEFAULT NULL,p_request_user_agent text DEFAULT NULL,p_original_proof jsonb DEFAULT NULL,p_scan_proof jsonb DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='10000ms' SET lock_timeout='2000ms'AS $fn$
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR p_action->'address'->>'kind'IS DISTINCT FROM'invitation'OR p_observed_actor_user_id IS NOT NULL AND NOT public.uc_signature_assurance_active(p_observed_actor_user_id)OR p_request_ip IS NOT NULL OR p_request_user_agent IS NOT NULL OR coalesce(p_scan_proof,'null'::jsonb)IS DISTINCT FROM'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_signature_assurance_file_action(p_action);
 IF p_action->>'purpose'='source'AND EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.signature_token=p_action->'address'->>'token'AND s.document_type='education_document')THEN
  IF p_action->>'action'='file_context'THEN IF coalesce(p_original_proof,'null'::jsonb)IS DISTINCT FROM'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;RETURN public.uc_signature_assurance_controlled_file_context_private(p_action,p_observed_actor_user_id);
  ELSIF p_action->>'action'='attest_file'THEN RETURN public.uc_signature_assurance_controlled_attest_private(p_action,p_observed_actor_user_id,p_original_proof);END IF;
 END IF;
 IF p_action->>'action'='file_context'THEN
  IF coalesce(p_original_proof,'null'::jsonb)IS DISTINCT FROM'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  BEGIN
  -- absent source is a separate private result, never a catch-all for inaccessible bytes.
  IF p_action->>'purpose'='source'AND EXISTS(SELECT 1 FROM public.document_signatures s LEFT JOIN public.signature_revisions r ON r.id=s.current_revision_id AND r.signature_id=s.id WHERE s.signature_token=p_action->'address'->>'token'AND(s.current_revision_id IS NULL AND s.document_snapshot_url IS NULL OR s.current_revision_id IS NOT NULL AND r.id IS NOT NULL AND r.file_url IS NULL)AND s.signed_source_path IS NULL)THEN
   PERFORM public.uc_signature_assurance_invitation_context(p_action->'address'->>'token',p_observed_actor_user_id);
   RETURN jsonb_build_object('version',1,'ok',true,'kind','file_absent');
  END IF;
  RETURN public.uc_signature_assurance_file_context_private(p_action,p_observed_actor_user_id);
 END;
 ELSIF p_action->>'action'='attest_file'THEN RETURN public.uc_signature_assurance_attest_file_private(p_action,p_observed_actor_user_id,p_original_proof);END IF;
 PERFORM public.uc_signature_assurance_error('INVALID_INPUT');
END;$fn$;



-- UC022 fragment 75_protected_binary_read.sql
-- Exact current-scope binary disclosure. No caller path, URL, service proof or actor claim.
CREATE FUNCTION public.uc_signature_assurance_file_read_private(p_action jsonb,p_actor uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures;r public.signature_revisions;b public.uc_signature_assurance_bindings;d public.uc_signature_assurance_document_snapshots;e public.uc_signature_assurance_events;st public.uc_education_issuance_states;address jsonb;party text;people uuid[];file jsonb;descriptor jsonb;locator text;bucket text:='external-contracts';html text;revision_id uuid;object_info jsonb;binding_id uuid;event_revision integer;
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR p_actor IS NOT NULL AND NOT public.uc_signature_assurance_active(p_actor)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_signature_assurance_shape(p_action,ARRAY['version','action','address','file_kind','binding_id','event_revision','expected_document_revision_id','document_html_sha256'])OR p_action->'version'IS DISTINCT FROM'1'::jsonb OR p_action->>'action'IS DISTINCT FROM'read_file'OR p_action->>'file_kind'NOT IN('source','scan')OR NOT public.uc_signature_assurance_sha(p_action->'document_html_sha256')OR NOT(p_action->'expected_document_revision_id'='null'::jsonb OR public.uc_signature_assurance_uuid(p_action->'expected_document_revision_id'))OR NOT(p_action->'binding_id'='null'::jsonb OR public.uc_signature_assurance_uuid(p_action->'binding_id'))OR NOT(p_action->'event_revision'='null'::jsonb OR public.uc_signature_assurance_integer(p_action->'event_revision',1))OR p_action->>'file_kind'='source'AND p_action->'event_revision'<>'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 address:=p_action->'address';binding_id:=public.storage_try_uuid(p_action->>'binding_id');event_revision:=(p_action->>'event_revision')::integer;
 IF address->>'kind'='invitation'THEN
  IF NOT public.uc_signature_assurance_shape(address,ARRAY['kind','token'])OR NOT public.uc_signature_assurance_text(address->'token',200)OR length(address->>'token')<16 THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  SELECT*INTO s FROM public.document_signatures WHERE signature_token=address->>'token'FOR SHARE NOWAIT;party:='recipient';
  IF s.id IS NULL OR NOT public.uc_signature_token_access_allowed(s.id,false)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSIF address->>'kind'='authenticated_signature'THEN
  IF NOT public.uc_signature_assurance_shape(address,ARRAY['kind','organization_id','signature_id','chosen_party'])OR NOT public.uc_signature_assurance_uuid(address->'organization_id')OR NOT public.uc_signature_assurance_uuid(address->'signature_id')OR address->>'chosen_party'NOT IN('sender','recipient')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  SELECT*INTO s FROM public.document_signatures WHERE id=(address->>'signature_id')::uuid AND organization_id=(address->>'organization_id')::uuid FOR SHARE NOWAIT;party:=address->>'chosen_party';
  IF s.id IS NULL OR p_actor IS NULL OR NOT public.uc_signature_assurance_as_signature_actor_allowed(p_actor,s.id,false,true)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSE PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 -- Include every immutable original subject, not only the current editable recipient.
 SELECT coalesce(array_agg(DISTINCT person ORDER BY person),'{}'::uuid[])INTO people FROM(
  SELECT p.user_id person FROM public.uc_signature_assurance_file_people(s)p
  UNION SELECT p.user_id FROM public.uc_signature_assurance_participants p WHERE p.organization_id=s.organization_id AND p.relation<>'staff_attribution'AND(p.object_kind='stream'AND p.object_id=s.id OR p.object_kind='binding'AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings x WHERE x.organization_id=s.organization_id AND x.signature_id=s.id AND x.id=p.object_id)OR p.object_kind='document'AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_document_snapshots x WHERE x.organization_id=s.organization_id AND x.signature_id=s.id AND x.id=p.object_id)OR p.object_kind='event'AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_events x WHERE x.organization_id=s.organization_id AND x.signature_id=s.id AND x.id=p.object_id))
  UNION SELECT p.user_id FROM public.uc_signature_assurance_file_proof_links p JOIN public.uc_signature_assurance_file_proofs f ON f.id=p.proof_id AND f.organization_id=p.organization_id WHERE f.organization_id=s.organization_id AND f.signature_id=s.id AND p.relation<>'staff_attribution'
  UNION SELECT x.subject_user_id FROM public.uc_signature_assurance_document_snapshots x WHERE x.organization_id=s.organization_id AND x.signature_id=s.id
  UNION SELECT x.recipient_user_id FROM public.uc_signature_assurance_document_snapshots x WHERE x.organization_id=s.organization_id AND x.signature_id=s.id
 )known WHERE person IS NOT NULL;
 PERFORM public.uc_signature_assurance_file_fence(s,p_actor,false,NULL,NULL,people);
 IF address->>'kind'='invitation'THEN IF NOT public.uc_signature_token_access_allowed(s.id,false)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSIF NOT public.uc_signature_assurance_as_signature_actor_allowed(p_actor,s.id,false,true)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 IF binding_id IS NOT NULL THEN
  SELECT*INTO b FROM public.uc_signature_assurance_bindings WHERE id=binding_id AND organization_id=s.organization_id AND signature_id=s.id AND party_role=party FOR SHARE NOWAIT;
  IF b.id IS NULL OR address->>'kind'='invitation'AND b.id IS DISTINCT FROM(SELECT id FROM public.uc_signature_assurance_bindings WHERE organization_id=s.organization_id AND signature_id=s.id AND party_role='recipient'ORDER BY revision DESC LIMIT 1)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  SELECT*INTO d FROM public.uc_signature_assurance_document_snapshots WHERE id=b.document_snapshot_id AND organization_id=s.organization_id AND signature_id=s.id AND party_role=party FOR SHARE NOWAIT;
  IF d.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;html:=d.html_text;revision_id:=d.document_revision_id;file:=d.original_file;
 ELSE
  IF address->>'kind'='invitation'AND EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings WHERE organization_id=s.organization_id AND signature_id=s.id AND party_role='recipient')THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  revision_id:=CASE WHEN s.status='signed'THEN coalesce(s.signed_revision_id,s.current_revision_id)ELSE s.current_revision_id END;
  IF revision_id IS NULL THEN html:=s.document_html;locator:=s.document_snapshot_url;ELSE SELECT*INTO r FROM public.signature_revisions WHERE id=revision_id AND signature_id=s.id FOR SHARE NOWAIT;IF r.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;html:=r.document_html;locator:=r.file_url;END IF;
  IF s.status='signed'AND s.signed_source_path IS NOT NULL THEN bucket:=s.signed_source_bucket;locator:=s.signed_source_path;END IF;
 END IF;
 IF html IS NULL OR revision_id IS DISTINCT FROM public.storage_try_uuid(p_action->>'expected_document_revision_id')OR public.uc_signature_assurance_hash(html)IS DISTINCT FROM p_action->>'document_html_sha256'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF p_action->>'file_kind'='scan'THEN
  SELECT*INTO e FROM public.uc_signature_assurance_events WHERE organization_id=s.organization_id AND signature_id=s.id AND party_role=party AND kind='scan_received'AND(event_revision IS NULL OR revision=event_revision)ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
  IF e.id IS NULL OR binding_id IS NOT NULL AND e.binding_id IS DISTINCT FROM binding_id THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;file:=e.payload->'scan_file';
 ELSIF s.document_type='education_document'THEN
  SELECT*INTO st FROM public.uc_education_issuance_states WHERE record_id=s.document_id AND organization_id=s.organization_id FOR SHARE NOWAIT;
  IF st.record_id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
  descriptor:=public.uc_signature_assurance_issued_source_as(s.organization_id,s.id,st.revision,public.uc_education_issue_state_hash(st.record_id),p_actor,CASE WHEN address->>'kind'='invitation'THEN address->>'token'END,false);
  IF binding_id IS NOT NULL AND file IS DISTINCT FROM descriptor->'file'OR locator IS NOT NULL AND locator IS DISTINCT FROM descriptor->'file'->>'path'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;file:=descriptor->'file';
 END IF;
 IF file IS NOT NULL AND file<>'null'::jsonb THEN
  IF NOT public.uc_signature_assurance_shape(file,ARRAY['bucket','path','sha256','bytes','mime'])OR NOT public.uc_signature_assurance_sha(file->'sha256')OR NOT public.uc_signature_assurance_integer(file->'bytes',1,20971520)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;bucket:=file->>'bucket';locator:=file->>'path';
 END IF;
 IF locator IS NULL AND file IS NULL AND p_action->>'file_kind'='source'THEN RETURN jsonb_build_object('version',1,'ok',true,'kind','file_absent','organization_id',s.organization_id,'signature_id',s.id,'chosen_party',party,'document_revision_id',revision_id,'document_html_sha256',p_action->'document_html_sha256','binding_id',binding_id);END IF;
 IF bucket NOT IN('external-contracts','signed-documents','org-documents')OR locator IS NULL OR locator IS DISTINCT FROM (CASE WHEN bucket='org-documents'THEN descriptor->'file'->>'path'ELSE public.uc_signature_locator_key(locator,bucket)END)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 IF bucket='org-documents'THEN IF descriptor IS NULL OR descriptor->'file'IS DISTINCT FROM file THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSIF p_action->>'file_kind'='scan'THEN IF e.id IS NULL OR e.payload->'scan_file'IS DISTINCT FROM file THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 ELSE IF NOT public.uc_signature_object_bound(s.id,bucket,locator)OR address->>'kind'='authenticated_signature'AND NOT public.uc_signature_assurance_as_signature_storage_read(p_actor,bucket,locator)THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;END IF;
 object_info:=public.uc_signature_assurance_object_snapshot(bucket,locator);
 RETURN jsonb_build_object('version',1,'ok',true,'kind','protected_file_context','source',jsonb_build_object('organization_id',s.organization_id,'signature_id',s.id,'chosen_party',party,'document_revision_id',revision_id,'document_html_sha256',p_action->'document_html_sha256','purpose',p_action->>'file_kind','bucket',bucket,'path',locator),'object',object_info,'binding_id',binding_id,'event_revision',e.revision,'expected_sha256',file->'sha256','expected_bytes',file->'bytes','expected_mime',file->'mime');
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');
END;$fn$;
CREATE FUNCTION public.uc_signature_assurance_file_read_service(p_action jsonb,p_observed_actor_user_id uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='10000ms' SET lock_timeout='2000ms'AS $fn$
BEGIN RETURN public.uc_signature_assurance_file_read_private(p_action,p_observed_actor_user_id);END;$fn$;


-- UC022 fragment 76_explicit_scan_authority.sql
-- Explicit scan statement and authority are separate facts. The authority source is resolved under the actually observed original account and current protected source rights, never inferred from the chosen policy.
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_public_action(p_action jsonb)RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE keys text[];operation text:=p_action->>'action';
BEGIN
 IF operation='context'THEN keys:=ARRAY['action','token','party_role'];
 ELSIF operation='reject'THEN keys:=ARRAY['action','token','party_role','request_id','expected_revision','expected_document_revision_id','reason'];
 ELSIF operation='receive_scan'THEN keys:=ARRAY['action','token','party_role','request_id','expected_revision','binding_id','expected_document_revision_id','document_html_sha256','policy_sha256','policy_decision_revision','scan_path','declared_full_name','declaration','authority','confirmed'];
 ELSIF operation='confirm'THEN
  keys:=ARRAY['action','token','party_role','request_id','expected_revision','expected_document_revision_id','document_html_sha256','declared_full_name','authority','confirmed','method','binding_id','policy_sha256','policy_decision_revision'];
  IF p_action->>'method'='authenticated_account_confirmation'THEN keys:=keys||ARRAY['agreement_sha256','agreement_event_id','agreement_accepted'];ELSIF p_action->>'method'IS DISTINCT FROM'bearer_invitation_confirmation'THEN PERFORM public.uc_signature_assurance_error('METHOD_UNSUPPORTED');END IF;
 ELSE PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF NOT public.uc_signature_assurance_shape(p_action,keys)OR p_action->>'party_role'IS DISTINCT FROM'recipient'OR NOT public.uc_signature_assurance_text(p_action->'token',200)OR length(p_action->>'token')<16 OR p_action->>'token'~'[[:space:]]'THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF operation='context'THEN RETURN;END IF;
 IF NOT public.uc_signature_assurance_uuid(p_action->'request_id')OR NOT public.uc_signature_assurance_integer(p_action->'expected_revision',0,2147483646)OR p_action->'expected_document_revision_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_action->'expected_document_revision_id')THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF operation='reject'THEN IF NOT public.uc_signature_assurance_text(p_action->'reason',4000)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;RETURN;END IF;
 IF p_action->'confirmed'IS DISTINCT FROM'true'::jsonb OR NOT public.uc_signature_assurance_sha(p_action->'document_html_sha256')OR NOT public.uc_signature_assurance_text(p_action->'declared_full_name',300)OR(p_action->'binding_id'='null'::jsonb)IS DISTINCT FROM(p_action->'policy_sha256'='null'::jsonb)OR(p_action->'binding_id'='null'::jsonb)IS DISTINCT FROM(p_action->'policy_decision_revision'='null'::jsonb)OR p_action->'binding_id'<>'null'::jsonb AND(NOT public.uc_signature_assurance_uuid(p_action->'binding_id')OR NOT public.uc_signature_assurance_sha(p_action->'policy_sha256')OR NOT public.uc_signature_assurance_integer(p_action->'policy_decision_revision',1,2147483646))THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF operation='receive_scan'THEN
  IF NOT public.uc_signature_assurance_text(p_action->'scan_path',2000)OR NOT public.uc_signature_assurance_text(p_action->'declaration',4000)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 ELSIF p_action->>'method'='authenticated_account_confirmation'THEN
  IF NOT public.uc_signature_assurance_uuid(p_action->'binding_id')OR NOT public.uc_signature_assurance_sha(p_action->'agreement_sha256')OR p_action->'agreement_event_id'<>'null'::jsonb AND NOT public.uc_signature_assurance_uuid(p_action->'agreement_event_id')OR p_action->'agreement_accepted'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 END IF;
END;$fn$;
-- A scan declaration does not automatically assert representative authority.
-- File-backed confirmations require an exact saved binding; HTML-only factual
-- bearer confirmation makes no policy/legal-identity claim.
CREATE OR REPLACE FUNCTION public.uc_signature_assurance_service(p_action jsonb,p_observed_actor_user_id uuid,p_request_ip text DEFAULT NULL,p_request_user_agent text DEFAULT NULL,p_original_proof jsonb DEFAULT NULL,p_scan_proof jsonb DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='10000ms' SET lock_timeout='2000ms'AS $fn$
#variable_conflict use_column
DECLARE s public.document_signatures;ctx jsonb;head public.uc_signature_assurance_streams;stored public.uc_signature_assurance_requests;b public.uc_signature_assurance_bindings;v public.uc_signature_assurance_policy_versions;decision public.uc_signature_assurance_policy_decisions;d public.uc_signature_assurance_document_snapshots;a public.uc_signature_assurance_agreements;e public.uc_signature_assurance_events;agreement_head public.uc_signature_assurance_streams;agreement_event public.uc_signature_assurance_events;scan_ctx jsonb;file_action jsonb;people uuid[];person record;operation text:=p_action->>'action';actor uuid:=p_observed_actor_user_id;request_id uuid;expected integer;digest text;authority jsonb;method text;conclusion text;terms jsonb;rendered text;org_name text;new_agreement uuid;proof_row public.uc_signature_assurance_file_proofs;
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR actor IS NOT NULL AND NOT public.uc_signature_assurance_active(actor)OR p_request_ip IS NOT NULL OR p_request_user_agent IS NOT NULL THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_signature_assurance_public_action(p_action);
 IF octet_length(p_action::text)>196608 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 ctx:=public.uc_signature_assurance_invitation_context(p_action->>'token',actor);
 SELECT *INTO s FROM public.document_signatures WHERE id=(ctx->>'signature_id')::uuid AND organization_id=(ctx->>'organization_id')::uuid FOR SHARE NOWAIT;
 IF public.uc_signature_assurance_credential_source(s.organization_id,(p_action-'token')::text)THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
 IF operation='context'THEN
  IF coalesce(p_original_proof,'null'::jsonb)<>'null'::jsonb OR coalesce(p_scan_proof,'null'::jsonb)<>'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  RETURN jsonb_build_object('version',1,'ok',true,'kind','context','context',ctx);
 END IF;
 request_id:=(p_action->>'request_id')::uuid;expected:=(p_action->>'expected_revision')::integer;
 SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_file_people(s);
 PERFORM public.uc_signature_assurance_file_fence(s,actor,true,NULL,NULL,people);PERFORM public.uc_signature_assurance_fence(s.organization_id,people,true,s.id,request_id,actor);
 ctx:=public.uc_signature_assurance_invitation_context(p_action->>'token',actor);
 digest:=public.uc_signature_assurance_hash(jsonb_build_object('organization_id',s.organization_id,'signature_id',s.id,'action',p_action-'token')::text);
 stored:=public.uc_signature_assurance_request(s.organization_id,request_id,digest,actor);
 IF stored.request_id IS NOT NULL THEN
  -- Every original non-attribution participant remains in the fence even when
  -- current mutable document/recipient associations have changed.
  SELECT coalesce(array_agg(DISTINCT person ORDER BY person),'{}'::uuid[])INTO people FROM(
   SELECT p.user_id person FROM public.uc_signature_assurance_participants p WHERE p.organization_id=s.organization_id AND p.relation<>'staff_attribution'AND(
    p.object_kind='request'AND p.object_id=stored.request_id OR p.object_kind='event'AND p.object_id=stored.event_id OR p.object_kind='binding'AND p.object_id=stored.binding_id
    OR p.object_kind='document'AND p.object_id IN(SELECT oldevent.document_snapshot_id FROM public.uc_signature_assurance_events oldevent WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id))
   UNION SELECT oldevent.subject_user_id FROM public.uc_signature_assurance_events oldevent WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id
   UNION SELECT oldevent.recipient_user_id FROM public.uc_signature_assurance_events oldevent WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id
   UNION SELECT olddoc.subject_user_id FROM public.uc_signature_assurance_document_snapshots olddoc JOIN public.uc_signature_assurance_events oldevent ON oldevent.document_snapshot_id=olddoc.id AND oldevent.organization_id=olddoc.organization_id WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id
   UNION SELECT olddoc.recipient_user_id FROM public.uc_signature_assurance_document_snapshots olddoc JOIN public.uc_signature_assurance_events oldevent ON oldevent.document_snapshot_id=olddoc.id AND oldevent.organization_id=olddoc.organization_id WHERE oldevent.id=stored.event_id AND oldevent.organization_id=s.organization_id
  )known WHERE person IS NOT NULL;
  PERFORM public.uc_signature_assurance_file_fence(s,actor,true,NULL,NULL,people);
  IF stored.action IS DISTINCT FROM operation OR stored.stream_id IS DISTINCT FROM s.id OR stored.party_role IS DISTINCT FROM'recipient'THEN PERFORM public.uc_signature_assurance_error('REQUEST_CONFLICT');END IF;
  RETURN jsonb_build_object('version',1,'ok',true,'kind','confirmation','context',ctx,'receipt',public.uc_signature_assurance_receipt(stored,true),'certificate_state','not_requested');
 END IF;
 head:=public.uc_signature_assurance_stream(s.organization_id,'signature',s.id);
 IF head.revision<>expected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 IF ctx->'requirements'->'missing'?'CLOSED'THEN PERFORM public.uc_signature_assurance_error('CLOSED');END IF;
 IF ctx->'requirements'->'missing'?'EXPIRED'THEN PERFORM public.uc_signature_assurance_error('EXPIRED');END IF;
 IF coalesce(p_action->'expected_document_revision_id','null'::jsonb)IS DISTINCT FROM ctx->'current_document_revision_id'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 IF operation='reject'THEN
  IF coalesce(p_original_proof,'null'::jsonb)<>'null'::jsonb OR coalesce(p_scan_proof,'null'::jsonb)<>'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
  e:=public.uc_signature_assurance_append(p_org=>s.organization_id,p_stream=>head.id,p_expected=>expected,p_request=>request_id,p_kind=>'recipient_rejected',p_method=>'legacy_unknown',p_reason=>p_action->>'reason',p_authority=>public.uc_signature_assurance_empty_authority(),p_signature=>s.id,p_actor=>actor,p_party_role=>'recipient');
 ELSE
  IF p_action->>'document_html_sha256'IS DISTINCT FROM ctx->>'current_document_html_sha256'THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  IF p_action->'binding_id'IS DISTINCT FROM coalesce(ctx->'binding'->'id','null'::jsonb)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  IF ctx->'binding'<>'null'::jsonb THEN
   SELECT *INTO b FROM public.uc_signature_assurance_bindings WHERE id=(ctx->'binding'->>'id')::uuid AND organization_id=s.organization_id AND signature_id=s.id AND party_role='recipient'FOR SHARE NOWAIT;SELECT *INTO v FROM public.uc_signature_assurance_policy_versions WHERE id=b.policy_version_id AND organization_id=s.organization_id FOR SHARE NOWAIT;SELECT *INTO decision FROM public.uc_signature_assurance_policy_decisions WHERE policy_version_id=v.id AND organization_id=s.organization_id ORDER BY stream_revision DESC LIMIT 1 FOR SHARE NOWAIT;
   IF NOT public.uc_signature_assurance_policy_eligible(s.organization_id,v.id)THEN PERFORM public.uc_signature_assurance_error('POLICY_NOT_ACCEPTED');END IF;
   IF b.policy_sha256 IS DISTINCT FROM p_action->>'policy_sha256'OR v.body_sha256 IS DISTINCT FROM b.policy_sha256 OR b.policy_decision_revision IS DISTINCT FROM(p_action->>'policy_decision_revision')::integer OR b.policy_decision_revision IS DISTINCT FROM decision.stream_revision THEN PERFORM public.uc_signature_assurance_error('POLICY_CHANGED');END IF;
  END IF;
  method:=CASE WHEN operation='receive_scan'THEN'scan_received'ELSE p_action->>'method'END;
  IF b.id IS NOT NULL AND v.body->>'method'IS DISTINCT FROM method THEN PERFORM public.uc_signature_assurance_error('METHOD_UNSUPPORTED');END IF;
  IF method='authenticated_account_confirmation'AND NOT(ctx->>'authenticated_recipient')::boolean THEN PERFORM public.uc_signature_assurance_error('IDENTITY_MISMATCH');END IF;
  authority:=public.uc_signature_assurance_invitation_authority(s.organization_id,actor,p_action->'authority');
  IF b.id IS NOT NULL AND authority->>'kind'IS DISTINCT FROM v.body->>'authority_requirement'THEN PERFORM public.uc_signature_assurance_error('AUTHORITY_REQUIRED');END IF;
  d:=public.uc_signature_assurance_capture_document_as(s.organization_id,s.id,'recipient',s.current_revision_id,p_action->>'document_html_sha256',actor,p_action->>'token');
  IF d.original_file IS NOT NULL AND b.id IS NULL THEN PERFORM public.uc_signature_assurance_error('POLICY_REQUIRED');END IF;
  IF coalesce(p_original_proof,'null'::jsonb)IS DISTINCT FROM coalesce(d.original_file,'null'::jsonb)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  IF method='authenticated_account_confirmation'THEN
   terms:=v.body->'agreement';
   IF terms IS NULL OR terms='null'::jsonb OR terms->>'sha256'IS DISTINCT FROM p_action->>'agreement_sha256'THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
   IF p_action->'agreement_event_id'<>'null'::jsonb THEN
    SELECT *INTO a FROM public.uc_signature_assurance_agreements WHERE id=(p_action->>'agreement_event_id')::uuid AND organization_id=s.organization_id AND subject_user_id=actor FOR SHARE NOWAIT;
    IF a.id IS NULL OR a.policy_version_id IS DISTINCT FROM v.id OR a.policy_sha256 IS DISTINCT FROM v.body_sha256 OR a.terms IS DISTINCT FROM terms THEN PERFORM public.uc_signature_assurance_error('AGREEMENT_CHANGED');END IF;
   ELSE
    SELECT name INTO org_name FROM public.organizations WHERE id=s.organization_id FOR SHARE NOWAIT;
    IF NOT public.uc_signature_assurance_text(to_jsonb(org_name),500)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
    rendered:=(terms->>'text')||E'\n\nСведения о подтверждении\nОрганизация: '||org_name||E'\nИмя, указанное участником: '||(p_action->>'declared_full_name')||E'\nИдентификатор учётной записи: '||actor::text;
    IF octet_length(rendered)>65536 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
    agreement_head:=public.uc_signature_assurance_stream(s.organization_id,'agreement',actor,actor);new_agreement:=gen_random_uuid();PERFORM public.uc_signature_assurance_token('agreement',new_agreement);
    INSERT INTO public.uc_signature_assurance_agreements(id,organization_id,subject_user_id,stream_id,revision,policy_version_id,policy_sha256,terms,rendered_text,rendered_text_sha256,actor)VALUES(new_agreement,s.organization_id,actor,agreement_head.id,agreement_head.revision+1,v.id,v.body_sha256,terms,rendered,public.uc_signature_assurance_hash(rendered),public.uc_signature_assurance_actor(actor,p_action->>'declared_full_name'))RETURNING *INTO a;
    agreement_event:=public.uc_signature_assurance_append(p_org=>s.organization_id,p_stream=>agreement_head.id,p_expected=>agreement_head.revision,p_request=>request_id,p_kind=>'agreement_accepted',p_method=>'authenticated_account_confirmation',p_reason=>'Учётная запись получателя явно подтвердила точный текст выбранной редакции соглашения.',p_authority=>jsonb_build_object('kind','self','declaration',NULL,'document_reference',NULL,'verification','not_verified'),p_policy=>v.id,p_agreement=>a.id,p_conclusion=>'factual_confirmation',p_actor=>actor,p_declared_name=>p_action->>'declared_full_name');
    PERFORM public.uc_signature_assurance_track(s.organization_id,'agreement',a.id,actor,'subject');PERFORM public.uc_signature_assurance_track(s.organization_id,'stream',agreement_head.id,actor,'subject');
   END IF;
  END IF;
  conclusion:=CASE WHEN method='scan_received'THEN'scan_received'WHEN method='authenticated_account_confirmation'AND v.body->>'purpose'='account_pep'THEN'policy_eligible_account_confirmation'ELSE'factual_confirmation'END;
  IF method='scan_received'THEN
   file_action:=jsonb_build_object('action','file_context','address',jsonb_build_object('kind','invitation','token',p_action->>'token'),'expected_document_revision_id',p_action->'expected_document_revision_id','document_html_sha256',p_action->'document_html_sha256','purpose','scan','scan_path',p_action->'scan_path');scan_ctx:=public.uc_signature_assurance_file_context_private(file_action,actor);
   SELECT *INTO proof_row FROM public.uc_signature_assurance_file_proofs proof WHERE proof.organization_id=s.organization_id AND proof.signature_id=s.id AND proof.party_role='recipient'AND proof.proof->'source'=scan_ctx->'source'AND proof.proof->'object_after'=scan_ctx->'object'AND proof.proof->'file'=p_scan_proof ORDER BY proof.verified_at DESC,proof.id DESC LIMIT 1 FOR SHARE NOWAIT;
   IF proof_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
   SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id),'{}'::uuid[])INTO people FROM public.uc_signature_assurance_file_proof_links WHERE proof_id=proof_row.id AND organization_id=s.organization_id AND relation<>'staff_attribution';PERFORM public.uc_signature_assurance_file_fence(s,actor,true,proof_row.subject_user_id,proof_row.recipient_user_id,people);
   e:=public.uc_signature_assurance_append_scan(p_org=>s.organization_id,p_stream=>head.id,p_expected=>expected,p_request=>request_id,p_kind=>'scan_received',p_method=>method,p_reason=>p_action->>'declaration',p_authority=>authority,p_policy=>v.id,p_signature=>s.id,p_document=>d.id,p_conclusion=>conclusion,p_actor=>actor,p_declared_name=>p_action->>'declared_full_name',p_party_role=>'recipient',p_binding=>b.id,p_scan=>p_scan_proof);
   FOR person IN SELECT unnest(people)user_id LOOP PERFORM public.uc_signature_assurance_track(s.organization_id,'event',e.id,person.user_id,'subject');PERFORM public.uc_signature_assurance_track(s.organization_id,'stream',s.id,person.user_id,'subject');PERFORM public.uc_signature_assurance_track(s.organization_id,'request',request_id,person.user_id,'subject');END LOOP;
  ELSE
   IF coalesce(p_scan_proof,'null'::jsonb)<>'null'::jsonb THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');END IF;
   e:=public.uc_signature_assurance_append(p_org=>s.organization_id,p_stream=>head.id,p_expected=>expected,p_request=>request_id,p_kind=>CASE WHEN method='authenticated_account_confirmation'THEN'account_confirmed'ELSE'bearer_confirmed'END,p_method=>method,p_reason=>CASE WHEN method='authenticated_account_confirmation'THEN'Получатель подтвердил точную версию документа из наблюдаемой учётной записи.'ELSE'Зафиксировано подтверждение точной версии документа держателем приглашения; личность не устанавливалась.'END,p_authority=>authority,p_policy=>v.id,p_signature=>s.id,p_document=>d.id,p_agreement=>a.id,p_conclusion=>conclusion,p_actor=>actor,p_declared_name=>p_action->>'declared_full_name',p_party_role=>'recipient',p_binding=>b.id);
  END IF;
 END IF;
 stored:=public.uc_signature_assurance_record_request(s.organization_id,request_id,digest,operation,head.id,e.id,s.id,e.revision,actor,'recipient',b.id);
 FOR person IN SELECT user_id,relation FROM public.uc_signature_assurance_file_people(s)LOOP PERFORM public.uc_signature_assurance_track(s.organization_id,'event',e.id,person.user_id,person.relation);PERFORM public.uc_signature_assurance_track(s.organization_id,'request',request_id,person.user_id,person.relation);PERFORM public.uc_signature_assurance_track(s.organization_id,'stream',s.id,person.user_id,person.relation);END LOOP;
 RETURN jsonb_build_object('version',1,'ok',true,'kind','confirmation','context',public.uc_signature_assurance_invitation_context(p_action->>'token',actor),'receipt',public.uc_signature_assurance_receipt(stored),'certificate_state','not_requested');
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_signature_assurance_error('INVALID_INPUT');WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;



-- UC022 fragment 77_policy_decision_history.sql
-- Exact immutable policy decision history, separate from the latest decision.
-- Existing captured policies without history remain explicitly historical snapshots.
CREATE INDEX uc_signature_policy_decisions_history_idx ON public.uc_signature_assurance_policy_decisions(organization_id,policy_version_id,stream_revision);

CREATE OR REPLACE FUNCTION public.uc_signature_assurance_project_policy(p_org uuid,p_policy uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE version_row public.uc_signature_assurance_policy_versions;decision_row public.uc_signature_assurance_policy_decisions;
 projected jsonb;projected_refs jsonb:='[]';item jsonb;decision jsonb;summary jsonb;literal text;masked integer:=0;history jsonb:='[]';history_row public.uc_signature_assurance_policy_decisions;history_decision jsonb;
BEGIN
 IF NOT public.uc_signature_assurance_policy_read(p_org,p_policy) THEN PERFORM public.uc_signature_assurance_error('ACCESS_DENIED');END IF;
 SELECT*INTO version_row FROM public.uc_signature_assurance_policy_versions WHERE id=p_policy AND organization_id=p_org;

 IF version_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('DEPENDENCY_UNAVAILABLE');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(version_row.body->'basis'->'document_references')LOOP
  item:=public.uc_signature_assurance_disclose_selection(p_org,item);projected_refs:=projected_refs||jsonb_build_array(item);
  IF item->>'visibility'='redacted' THEN masked:=masked+1;END IF;
 END LOOP;
 IF(SELECT count(*)FROM public.uc_signature_assurance_policy_decisions WHERE organization_id=p_org AND policy_version_id=p_policy)>5000 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 FOR history_row IN SELECT*FROM public.uc_signature_assurance_policy_decisions WHERE organization_id=p_org AND policy_version_id=p_policy ORDER BY stream_revision LOOP
  decision_row:=history_row;
  history_decision:=jsonb_build_object('id',history_row.id,'revision',history_row.stream_revision,'state',history_row.state,'server_at',public.uc_signature_assurance_utc(history_row.server_at),'actor_user_id',history_row.actor_user_id,'reason',history_row.reason,'authority',public.uc_signature_assurance_project_authority(p_org,history_row.authority),'source_limits_acknowledged',history_row.source_limits_acknowledged);
  IF history_decision->'authority'->'document_reference'->>'visibility'='redacted'THEN masked:=masked+1;END IF;
  history:=history||jsonb_build_array(history_decision);
 END LOOP;
 IF decision_row.id IS NULL THEN PERFORM public.uc_signature_assurance_error('DEPENDENCY_UNAVAILABLE');END IF;
 decision:=public.uc_signature_assurance_project_authority(p_org,decision_row.authority);
 IF decision->'document_reference'->>'visibility'='redacted' THEN masked:=masked+1;END IF;
 projected:=jsonb_set(version_row.body,'{basis,document_references}',projected_refs);
 summary:=jsonb_build_object('kind',CASE WHEN masked=0 THEN'complete'ELSE'current_scope_projection'END,'redacted_reference_count',masked,'redacted_content_count',0,
  -- A policy hash is not actual file-byte verification or a legal-validity conclusion.
  'complete_private_evidence_verified',false);
 literal:=jsonb_build_object('body',projected,'body_sha256',version_row.body_sha256,'disclosure',summary,'decision_history',history)::text;
 RETURN jsonb_build_object('id',version_row.id,'family_id',version_row.family_id,'organization_id',p_org,'version',version_row.version,
  'body',projected,'body_sha256',version_row.body_sha256,'body_json',CASE WHEN masked=0 THEN version_row.body_json ELSE NULL END,
  'projection_json',literal,'projection_sha256',public.uc_signature_assurance_hash(literal),'disclosure',summary,
  'created_at',public.uc_signature_assurance_utc(version_row.created_at),'created_by',version_row.created_by,
  'decision_history',history,'decision',jsonb_build_object('id',decision_row.id,'revision',decision_row.stream_revision,'state',decision_row.state,
   'server_at',public.uc_signature_assurance_utc(decision_row.server_at),'actor_user_id',decision_row.actor_user_id,'reason',decision_row.reason,
   'authority',decision,'source_limits_acknowledged',decision_row.source_limits_acknowledged));
END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_signature_assurance_mask_captured_policy(p_org uuid,p_value jsonb)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
#variable_conflict use_column
DECLARE projected jsonb;refs jsonb:='[]';item jsonb;decision jsonb;summary jsonb;literal text;masked integer:=0;history jsonb:='[]';history_item jsonb;
BEGIN
 IF p_value->>'organization_id'IS DISTINCT FROM p_org::text OR public.uc_signature_assurance_hash(p_value->>'projection_json')IS DISTINCT FROM p_value->>'projection_sha256'
  OR(p_value->>'projection_json')::jsonb IS DISTINCT FROM (jsonb_build_object('body',p_value->'body','body_sha256',p_value->'body_sha256','disclosure',p_value->'disclosure')||CASE WHEN p_value?'decision_history'THEN jsonb_build_object('decision_history',p_value->'decision_history')ELSE'{}'::jsonb END)THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_value->'body'->'basis'->'document_references')LOOP
  item:=public.uc_signature_assurance_mask_captured_selection(p_org,item);refs:=refs||jsonb_build_array(item);IF item->>'visibility'='redacted'THEN masked:=masked+1;END IF;
 END LOOP;
 decision:=jsonb_set(p_value->'decision','{authority}',public.uc_signature_assurance_mask_captured_authority(p_org,p_value->'decision'->'authority'));
 IF decision->'authority'->'document_reference'->>'visibility'='redacted'THEN masked:=masked+1;END IF;
 IF p_value?'decision_history'THEN
  IF jsonb_typeof(p_value->'decision_history')IS DISTINCT FROM'array'OR jsonb_array_length(p_value->'decision_history')NOT BETWEEN 1 AND 5000 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  FOR history_item IN SELECT value FROM jsonb_array_elements(p_value->'decision_history')LOOP
   history_item:=jsonb_set(history_item,'{authority}',public.uc_signature_assurance_mask_captured_authority(p_org,history_item->'authority'));
   IF history_item->'authority'->'document_reference'->>'visibility'='redacted'THEN masked:=masked+1;END IF;history:=history||jsonb_build_array(history_item);
  END LOOP;
 END IF;
 projected:=jsonb_set(p_value->'body','{basis,document_references}',refs);
 summary:=jsonb_build_object('kind',CASE WHEN masked=0 THEN'complete'ELSE'current_scope_projection'END,'redacted_reference_count',masked,'redacted_content_count',0,'complete_private_evidence_verified',false);
 literal:=(jsonb_build_object('body',projected,'body_sha256',p_value->'body_sha256','disclosure',summary)||CASE WHEN p_value?'decision_history'THEN jsonb_build_object('decision_history',history)ELSE'{}'::jsonb END)::text;
 RETURN p_value||CASE WHEN p_value?'decision_history'THEN jsonb_build_object('decision_history',history)ELSE'{}'::jsonb END||jsonb_build_object('body',projected,'body_json',CASE WHEN masked=0 THEN p_value->'body_json'ELSE'null'::jsonb END,'decision',decision,'disclosure',summary,'projection_json',literal,'projection_sha256',public.uc_signature_assurance_hash(literal));
 EXCEPTION WHEN invalid_text_representation THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');
END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_signature_assurance_derive_manifest(p_org uuid,p_signature uuid,p_source uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2000ms'AS $fn$
#variable_conflict use_column
DECLARE source public.uc_signature_assurance_private_manifests;stored public.uc_signature_assurance_scoped_manifests;sig public.document_signatures;
 raw jsonb;context jsonb;events jsonb:='[]';bindings jsonb:='[]';policies jsonb:='[]';agreements jsonb;documents jsonb:='[]';item jsonb;value jsonb;original_file jsonb;party text;one jsonb;bound jsonb;policy jsonb;current_document jsonb;caps jsonb;missing text[];counts jsonb;body jsonb;literal text;html text;brief text:='';policy_brief text:='';history_entry jsonb;hash text;new_id uuid:=gen_random_uuid();at_time timestamptz:=clock_timestamp();person record;
BEGIN
 sig:=public.uc_signature_assurance_signature_fence(p_org,p_signature);
 SELECT *INTO source FROM public.uc_signature_assurance_private_manifests WHERE id=p_source AND organization_id=p_org AND signature_id=p_signature FOR SHARE NOWAIT;
 IF source.id IS NULL THEN PERFORM public.uc_signature_assurance_error('NOT_FOUND');END IF;
 IF public.uc_signature_assurance_hash(source.body_json)IS DISTINCT FROM source.body_sha256 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 raw:=source.body_json::jsonb;
 IF raw->>'manifest_kind'IS DISTINCT FROM'captured_evidence_projection'OR raw->>'id'IS DISTINCT FROM source.id::text OR raw->>'organization_id'IS DISTINCT FROM p_org::text OR raw->>'signature_id'IS DISTINCT FROM p_signature::text OR raw->>'through_revision'IS DISTINCT FROM source.through_revision::text OR raw->>'event_count'IS DISTINCT FROM source.through_revision::text THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(raw->'events')LOOP
  value:=item||jsonb_build_object('original_file',public.uc_signature_assurance_mask_captured_file(p_org,p_signature,item->'original_file'),'scan_file',public.uc_signature_assurance_mask_captured_file(p_org,p_signature,item->'scan_file'),'authority',public.uc_signature_assurance_mask_captured_authority(p_org,item->'authority'));events:=events||jsonb_build_array(value);
  brief:=brief||'<tr><td>'||public.uc_signature_assurance_html_escape(value->>'revision')||'</td><td>'||public.uc_signature_assurance_html_escape(value->>'server_at')||'</td><td>'||public.uc_signature_assurance_html_escape(value->>'party_role')||'</td><td>'||public.uc_signature_assurance_html_escape(value->>'method')||'</td><td>'||public.uc_signature_assurance_html_escape(value->>'conclusion')||'</td><td>'||public.uc_signature_assurance_html_escape(value->>'explanation')||'</td></tr>';
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(raw->'referenced_bindings')LOOP bindings:=bindings||jsonb_build_array(jsonb_set(item,'{original_file}',coalesce(public.uc_signature_assurance_mask_captured_file(p_org,p_signature,item->'original_file'),'null'::jsonb)));END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(raw->'referenced_policies')LOOP policies:=policies||jsonb_build_array(public.uc_signature_assurance_mask_captured_policy(p_org,item));END LOOP;
 agreements:=raw->'referenced_agreements';
 FOR item IN SELECT value FROM jsonb_array_elements(raw->'document_snapshots')LOOP
  original_file:=public.uc_signature_assurance_mask_captured_file(p_org,p_signature,item->'original_file');value:=item||jsonb_build_object('original_file',original_file);
  IF item->>'content_visibility'='available'THEN
   IF original_file->>'visibility'='redacted'THEN value:=value||jsonb_build_object('html_text',NULL,'content_visibility','redacted_current_file_scope');
   ELSIF public.uc_signature_assurance_credential_source(p_org,item->>'html_text')THEN value:=value||jsonb_build_object('html_text',NULL,'content_visibility','redacted_credential_bearing_source');END IF;
  END IF;documents:=documents||jsonb_build_array(value);
 END LOOP;
 context:=raw->'context';party:=context->>'chosen_party';current_document:=public.uc_signature_assurance_current_document(p_org,p_signature);caps:=public.uc_signature_assurance_capabilities(p_org,p_signature,party);
 FOREACH party IN ARRAY ARRAY['sender','recipient']LOOP
  one:=context->'parties'->party;bound:=NULL;policy:=NULL;missing:=ARRAY(SELECT jsonb_array_elements_text(one->'requirements'->'missing'));
  IF one->'binding'<>'null'::jsonb THEN
   SELECT value INTO bound FROM jsonb_array_elements(bindings)WHERE value->>'id'=one->'binding'->>'id';SELECT value INTO policy FROM jsonb_array_elements(policies)WHERE value->>'id'=one->'policy'->>'id';
   IF bound IS NULL OR policy IS NULL THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
   IF NOT public.uc_signature_assurance_policy_eligible(p_org,(bound->>'policy_version_id')::uuid)THEN missing:=array_append(missing,'POLICY_NOT_ACCEPTED');END IF;
   IF bound->'document_revision_id'IS DISTINCT FROM current_document->'document_revision_id'OR bound->>'document_html_sha256'IS DISTINCT FROM current_document->>'document_html_sha256'
    OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings b WHERE b.organization_id=p_org AND b.signature_id=p_signature AND b.party_role=party AND b.revision>(bound->>'revision')::integer)THEN missing:=array_append(missing,'SOURCE_CHANGED');END IF;
   IF bound->'original_file'->>'visibility'='redacted'THEN missing:=array_append(missing,'SOURCE_UNAVAILABLE');END IF;
  END IF;
  IF sig.deleted_at IS NOT NULL OR sig.status IN('signed','rejected','revoked','expired')OR sig.signed_at IS NOT NULL OR party='sender'AND sig.sender_signed_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.uc_signature_assurance_events terminal WHERE terminal.organization_id=p_org AND terminal.signature_id=p_signature AND terminal.party_role=party AND terminal.kind IN('sender_confirmed','account_confirmed','bearer_confirmed','scan_received','recipient_rejected','invitation_revoked'))THEN missing:=array_append(missing,'CLOSED');END IF;
  IF sig.expires_at<=clock_timestamp()THEN missing:=array_append(missing,'EXPIRED');END IF;
  SELECT coalesce(array_agg(DISTINCT code ORDER BY code),'{}'::text[])INTO missing FROM unnest(missing)code;
  one:=one||jsonb_build_object('binding',bound,'policy',policy,'requirements',(one->'requirements')||jsonb_build_object('eligible',cardinality(missing)=0,'missing',to_jsonb(missing)));
  context:=jsonb_set(context,ARRAY['parties',party],one);
 END LOOP;
 context:=context||jsonb_build_object('capabilities',caps,'current_document_revision_id',current_document->'document_revision_id','current_document_html_sha256',current_document->>'document_html_sha256','latest_receipt_id',source.id);
 body:=jsonb_build_object('schema_version',1,'id',new_id,'organization_id',p_org,'signature_id',p_signature,'captured_at',public.uc_signature_assurance_utc(at_time),'captured_by',auth.uid(),'manifest_kind','scoped_derivative','source_manifest_id',source.id,'source_manifest_sha256',source.body_sha256,
  'context',context,'through_revision',source.through_revision,'event_count',source.through_revision,'events',events,'referenced_bindings',bindings,'referenced_policies',policies,'referenced_agreements',agreements,'document_snapshots',documents,'limitations',raw->'limitations');
 counts:=public.uc_signature_assurance_redactions(body);body:=body||jsonb_build_object('disclosure',jsonb_build_object('kind',CASE WHEN(counts->>'refs')::integer+(counts->>'contents')::integer=0 THEN'complete'ELSE'current_scope_projection'END,'redacted_reference_count',counts->'refs','redacted_content_count',counts->'contents','complete_private_evidence_verified',false));
 FOR policy IN SELECT value FROM jsonb_array_elements(policies)LOOP
  IF policy?'decision_history'THEN
   FOR history_entry IN SELECT value FROM jsonb_array_elements(policy->'decision_history')LOOP
    policy_brief:=policy_brief||'<tr><td>'||public.uc_signature_assurance_html_escape(policy->>'id')||'</td><td>'||public.uc_signature_assurance_html_escape(history_entry->>'revision')||'</td><td>'||public.uc_signature_assurance_html_escape(history_entry->>'state')||'</td><td>'||public.uc_signature_assurance_html_escape(history_entry->>'server_at')||'</td><td>'||public.uc_signature_assurance_html_escape(history_entry->>'actor_user_id')||'</td><td>'||public.uc_signature_assurance_html_escape(history_entry->>'reason')||'</td></tr>';
   END LOOP;
  ELSE policy_brief:=policy_brief||'<tr><td>'||public.uc_signature_assurance_html_escape(policy->>'id')||'</td><td colspan="5">История решений не была сохранена в этом историческом снимке.</td></tr>';END IF;
 END LOOP;
 literal:=body::text;hash:=public.uc_signature_assurance_hash(literal);
 html:='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;; style-src &#39;unsafe-inline&#39;"><title>Пакет подтверждений</title><style>body{font:14px/1.5 system-ui;margin:32px;color:#17212b}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd;padding:8px;text-align:left;overflow-wrap:anywhere}p{overflow-wrap:anywhere}</style></head><body><h1>Пакет фактов подтверждения</h1><p>Документ: '||p_signature::text||'. Организация: '||p_org::text||'. События: 1–'||source.through_revision::text||'.</p><p>SHA-256 JSON проекции: '||hash||'. Исходный снимок: '||source.id::text||'. Его сохранённый хеш: '||source.body_sha256||'.</p><p>Это текущая доступная проекция сохранённой истории. Скрытое исходное содержимое этим экспортом не подтверждается. Криптографическая проверка подписи и автоматический вывод о юридической действительности не выполнялись. Наблюдение учётной записи не устанавливает личность человека и полномочия само по себе.</p><table><thead><tr><th>Ревизия</th><th>Время сервера</th><th>Сторона</th><th>Фактический способ</th><th>Факт</th><th>Пояснение</th></tr></thead><tbody>'||brief||'</tbody></table><h2>История решений по правилам</h2><p>Это записи ответственных лиц. Юридическая действительность автоматически не устанавливалась.</p><table><thead><tr><th>Правила</th><th>Ревизия</th><th>Решение</th><th>Время сервера</th><th>Учётная запись</th><th>Основание записи</th></tr></thead><tbody>'||policy_brief||'</tbody></table></body></html>';
 IF octet_length(literal)+octet_length(html)>2000000 THEN PERFORM public.uc_signature_assurance_error('LIMIT_EXCEEDED');END IF;
 IF public.uc_signature_assurance_credential_source(p_org,literal)OR public.uc_signature_assurance_credential_source(p_org,html)THEN PERFORM public.uc_signature_assurance_error('SOURCE_UNAVAILABLE');END IF;
 -- Reuse only an exact freshly re-authorized projection for this observed actor.
 -- The identity/time fields are presentation facts; every scope/capability/body
 -- field remains in the comparison. Do not re-use a wider historical projection.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_signature_assurance_derivative:'||source.id::text||':'||auth.uid()::text,0))THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');END IF;
 SELECT *INTO stored FROM public.uc_signature_assurance_scoped_manifests prior
  WHERE prior.organization_id=p_org AND prior.signature_id=p_signature AND prior.source_manifest_id=source.id AND prior.captured_by IS NOT DISTINCT FROM auth.uid()
   AND(prior.body_json::jsonb-'id'-'captured_at')=(body-'id'-'captured_at')
  ORDER BY prior.captured_at DESC,prior.id DESC LIMIT 1 FOR SHARE NOWAIT;
 IF stored.id IS NOT NULL THEN
  IF public.uc_signature_assurance_hash(stored.body_json)IS DISTINCT FROM stored.body_json_sha256 OR public.uc_signature_assurance_hash(stored.receipt_html)IS DISTINCT FROM stored.receipt_html_sha256 THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');END IF;
  RETURN jsonb_build_object('body',stored.body_json::jsonb,'body_json',stored.body_json,'body_json_sha256',stored.body_json_sha256,'receipt_html',stored.receipt_html,'receipt_html_sha256',stored.receipt_html_sha256);
 END IF;
 PERFORM public.uc_signature_assurance_token('scoped_manifest',new_id);
 INSERT INTO public.uc_signature_assurance_scoped_manifests(id,organization_id,source_manifest_id,signature_id,body_json,body_json_sha256,receipt_html,receipt_html_sha256,captured_by,captured_at)VALUES(new_id,p_org,source.id,p_signature,literal,hash,html,public.uc_signature_assurance_hash(html),auth.uid(),at_time)RETURNING *INTO stored;
 FOR person IN SELECT user_id,relation FROM public.uc_signature_assurance_participants WHERE organization_id=p_org AND object_kind='private_manifest'AND object_id=source.id LOOP PERFORM public.uc_signature_assurance_track(p_org,'scoped_manifest',new_id,person.user_id,person.relation);END LOOP;
 PERFORM public.uc_signature_assurance_track(p_org,'scoped_manifest',new_id,auth.uid(),'staff_attribution');
 RETURN jsonb_build_object('body',body,'body_json',stored.body_json,'body_json_sha256',stored.body_json_sha256,'receipt_html',stored.receipt_html,'receipt_html_sha256',stored.receipt_html_sha256);
 EXCEPTION WHEN invalid_text_representation THEN PERFORM public.uc_signature_assurance_error('SOURCE_CHANGED');
 WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_signature_assurance_error('REVISION_CONFLICT');
END;$fn$;


-- UC022 fragment 90_final_composed_acl.sql
-- Close every new object against hostile inherited provider default ACLs.
-- This is object-local; existing provider defaults and old function ACLs are preserved.
DO $acl$
DECLARE f record;t record;grant_row record;column_row record;target text;new_functions text[]:=ARRAY['apply_signature_assurance','read_signature_assurance','uc_signature_assurance_accept_agreement','uc_signature_assurance_active','uc_signature_assurance_actor','uc_signature_assurance_append','uc_signature_assurance_append_scan','uc_signature_assurance_as_can_access_organization','uc_signature_assurance_as_document_action_allowed','uc_signature_assurance_as_document_commercial_creation_allowed','uc_signature_assurance_as_document_contract_scope','uc_signature_assurance_as_document_has_action','uc_signature_assurance_as_document_record_scope','uc_signature_assurance_as_document_scope_allowed','uc_signature_assurance_as_document_signature_read_scope','uc_signature_assurance_as_document_signature_scope','uc_signature_assurance_as_document_signature_source_scope','uc_signature_assurance_as_document_teacher_limited','uc_signature_assurance_as_resolve_selection','uc_signature_assurance_as_signature_action_allowed','uc_signature_assurance_as_signature_actor_allowed','uc_signature_assurance_as_signature_commercial_sender_allowed','uc_signature_assurance_as_signature_file_scope','uc_signature_assurance_as_signature_storage_read','uc_signature_assurance_attest_file_private','uc_signature_assurance_auth_signature_action','uc_signature_assurance_authority','uc_signature_assurance_bind_signature','uc_signature_assurance_bucket_boundary','uc_signature_assurance_capabilities','uc_signature_assurance_capture_document','uc_signature_assurance_capture_document_as','uc_signature_assurance_capture_evidence_projection','uc_signature_assurance_classification','uc_signature_assurance_confirm_consent','uc_signature_assurance_context','uc_signature_assurance_controlled_attest_private','uc_signature_assurance_controlled_file_context_private','uc_signature_assurance_credential_source','uc_signature_assurance_current_document','uc_signature_assurance_current_file_scope','uc_signature_assurance_date','uc_signature_assurance_decide_policy','uc_signature_assurance_decode_probe','uc_signature_assurance_derive_manifest','uc_signature_assurance_disclose_file','uc_signature_assurance_disclose_selection','uc_signature_assurance_empty_authority','uc_signature_assurance_empty_subject_stream','uc_signature_assurance_error','uc_signature_assurance_fence','uc_signature_assurance_file_action','uc_signature_assurance_file_actor','uc_signature_assurance_file_context_private','uc_signature_assurance_file_fence','uc_signature_assurance_file_people','uc_signature_assurance_file_proof_immutable','uc_signature_assurance_file_proof_link_guard','uc_signature_assurance_file_proof_personal_counts','uc_signature_assurance_file_proof_receipt','uc_signature_assurance_file_proof_retention_block','uc_signature_assurance_file_read_private','uc_signature_assurance_file_read_service','uc_signature_assurance_hash','uc_signature_assurance_html_escape','uc_signature_assurance_immutable','uc_signature_assurance_integer','uc_signature_assurance_invitation_authority','uc_signature_assurance_invitation_context','uc_signature_assurance_issued_source','uc_signature_assurance_issued_source_as','uc_signature_assurance_legal_source','uc_signature_assurance_mask_captured_authority','uc_signature_assurance_mask_captured_file','uc_signature_assurance_mask_captured_policy','uc_signature_assurance_mask_captured_selection','uc_signature_assurance_object_snapshot','uc_signature_assurance_own_current','uc_signature_assurance_personal_counts','uc_signature_assurance_policy_body','uc_signature_assurance_policy_eligible','uc_signature_assurance_policy_read','uc_signature_assurance_project_agreement','uc_signature_assurance_project_authority','uc_signature_assurance_project_binding','uc_signature_assurance_project_consent','uc_signature_assurance_project_document','uc_signature_assurance_project_legacy_agreement','uc_signature_assurance_project_legacy_consent','uc_signature_assurance_project_policy','uc_signature_assurance_project_signature_event','uc_signature_assurance_public_action','uc_signature_assurance_read_events','uc_signature_assurance_read_html_fields','uc_signature_assurance_receipt','uc_signature_assurance_record_request','uc_signature_assurance_redactions','uc_signature_assurance_render_terms','uc_signature_assurance_request','uc_signature_assurance_resolve_selection','uc_signature_assurance_retention_block','uc_signature_assurance_safe_authenticated_input','uc_signature_assurance_save_policy','uc_signature_assurance_selection','uc_signature_assurance_selection_people','uc_signature_assurance_service','uc_signature_assurance_sha','uc_signature_assurance_shape','uc_signature_assurance_signature_boundary','uc_signature_assurance_signature_fence','uc_signature_assurance_signature_read','uc_signature_assurance_signature_write','uc_signature_assurance_storage_boundary','uc_signature_assurance_stream','uc_signature_assurance_subject_read','uc_signature_assurance_terms','uc_signature_assurance_text','uc_signature_assurance_token','uc_signature_assurance_track','uc_signature_assurance_utc','uc_signature_assurance_uuid','uc_signature_assurance_verify_controlled_source_service','uc_signature_assurance_verify_invitation_file_service','uc_signature_assurance_verify_source_service','uc_signature_assurance_withdraw_consent'];new_tables text[]:=ARRAY['uc_signature_assurance_agreements','uc_signature_assurance_bindings','uc_signature_assurance_consents','uc_signature_assurance_document_snapshots','uc_signature_assurance_events','uc_signature_assurance_file_proof_links','uc_signature_assurance_file_proof_tokens','uc_signature_assurance_file_proofs','uc_signature_assurance_participants','uc_signature_assurance_policy_decisions','uc_signature_assurance_policy_versions','uc_signature_assurance_private_manifests','uc_signature_assurance_requests','uc_signature_assurance_scoped_manifests','uc_signature_assurance_streams','uc_signature_assurance_write_tokens'];
BEGIN
 IF(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(new_functions))<>cardinality(new_functions)THEN RAISE EXCEPTION 'UC022_FINAL_FUNCTION_VECTOR_MISMATCH';END IF;
 FOR f IN SELECT p.oid,p.proowner,p.proacl,p.oid::regprocedure identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(new_functions)LOOP
  FOR grant_row IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))a WHERE a.grantee<>f.proowner LOOP
   target:=CASE WHEN grant_row.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(grant_row.grantee))END;
   EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s CASCADE',f.identity,target);
  END LOOP;
 END LOOP;
 IF(SELECT count(*)FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(new_tables)AND c.relkind='r')<>cardinality(new_tables)THEN RAISE EXCEPTION 'UC022_FINAL_TABLE_VECTOR_MISMATCH';END IF;
 FOR t IN SELECT c.oid,c.relowner,c.relacl,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(new_tables)LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.relname);
  FOR grant_row IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner)))a WHERE a.grantee<>t.relowner LOOP
   target:=CASE WHEN grant_row.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(grant_row.grantee))END;
   EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %s CASCADE',t.relname,target);
  END LOOP;
  FOR column_row IN SELECT attname,attacl FROM pg_attribute WHERE attrelid=t.oid AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL LOOP
   FOR grant_row IN SELECT DISTINCT a.grantee FROM aclexplode(column_row.attacl)a WHERE a.grantee<>t.relowner LOOP
    target:=CASE WHEN grant_row.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(grant_row.grantee))END;
    EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %s CASCADE',column_row.attname,t.relname,target);
   END LOOP;
  END LOOP;
 END LOOP;
END;$acl$;
GRANT EXECUTE ON FUNCTION public.read_signature_assurance(uuid,jsonb),public.apply_signature_assurance(uuid,uuid,integer,jsonb)TO authenticated;
GRANT EXECUTE ON FUNCTION public.uc_signature_assurance_service(jsonb,uuid,text,text,jsonb,jsonb),public.uc_signature_assurance_verify_source_service(jsonb,uuid,inet,text,jsonb,jsonb),public.uc_signature_assurance_verify_invitation_file_service(jsonb,uuid,inet,text,jsonb,jsonb),public.uc_signature_assurance_verify_controlled_source_service(jsonb,uuid,inet,text,jsonb,jsonb),public.uc_signature_assurance_file_read_service(jsonb,uuid)TO service_role;
DO $acl$
DECLARE f record;t record;acl_item record;new_functions text[]:=ARRAY['apply_signature_assurance','read_signature_assurance','uc_signature_assurance_accept_agreement','uc_signature_assurance_active','uc_signature_assurance_actor','uc_signature_assurance_append','uc_signature_assurance_append_scan','uc_signature_assurance_as_can_access_organization','uc_signature_assurance_as_document_action_allowed','uc_signature_assurance_as_document_commercial_creation_allowed','uc_signature_assurance_as_document_contract_scope','uc_signature_assurance_as_document_has_action','uc_signature_assurance_as_document_record_scope','uc_signature_assurance_as_document_scope_allowed','uc_signature_assurance_as_document_signature_read_scope','uc_signature_assurance_as_document_signature_scope','uc_signature_assurance_as_document_signature_source_scope','uc_signature_assurance_as_document_teacher_limited','uc_signature_assurance_as_resolve_selection','uc_signature_assurance_as_signature_action_allowed','uc_signature_assurance_as_signature_actor_allowed','uc_signature_assurance_as_signature_commercial_sender_allowed','uc_signature_assurance_as_signature_file_scope','uc_signature_assurance_as_signature_storage_read','uc_signature_assurance_attest_file_private','uc_signature_assurance_auth_signature_action','uc_signature_assurance_authority','uc_signature_assurance_bind_signature','uc_signature_assurance_bucket_boundary','uc_signature_assurance_capabilities','uc_signature_assurance_capture_document','uc_signature_assurance_capture_document_as','uc_signature_assurance_capture_evidence_projection','uc_signature_assurance_classification','uc_signature_assurance_confirm_consent','uc_signature_assurance_context','uc_signature_assurance_controlled_attest_private','uc_signature_assurance_controlled_file_context_private','uc_signature_assurance_credential_source','uc_signature_assurance_current_document','uc_signature_assurance_current_file_scope','uc_signature_assurance_date','uc_signature_assurance_decide_policy','uc_signature_assurance_decode_probe','uc_signature_assurance_derive_manifest','uc_signature_assurance_disclose_file','uc_signature_assurance_disclose_selection','uc_signature_assurance_empty_authority','uc_signature_assurance_empty_subject_stream','uc_signature_assurance_error','uc_signature_assurance_fence','uc_signature_assurance_file_action','uc_signature_assurance_file_actor','uc_signature_assurance_file_context_private','uc_signature_assurance_file_fence','uc_signature_assurance_file_people','uc_signature_assurance_file_proof_immutable','uc_signature_assurance_file_proof_link_guard','uc_signature_assurance_file_proof_personal_counts','uc_signature_assurance_file_proof_receipt','uc_signature_assurance_file_proof_retention_block','uc_signature_assurance_file_read_private','uc_signature_assurance_file_read_service','uc_signature_assurance_hash','uc_signature_assurance_html_escape','uc_signature_assurance_immutable','uc_signature_assurance_integer','uc_signature_assurance_invitation_authority','uc_signature_assurance_invitation_context','uc_signature_assurance_issued_source','uc_signature_assurance_issued_source_as','uc_signature_assurance_legal_source','uc_signature_assurance_mask_captured_authority','uc_signature_assurance_mask_captured_file','uc_signature_assurance_mask_captured_policy','uc_signature_assurance_mask_captured_selection','uc_signature_assurance_object_snapshot','uc_signature_assurance_own_current','uc_signature_assurance_personal_counts','uc_signature_assurance_policy_body','uc_signature_assurance_policy_eligible','uc_signature_assurance_policy_read','uc_signature_assurance_project_agreement','uc_signature_assurance_project_authority','uc_signature_assurance_project_binding','uc_signature_assurance_project_consent','uc_signature_assurance_project_document','uc_signature_assurance_project_legacy_agreement','uc_signature_assurance_project_legacy_consent','uc_signature_assurance_project_policy','uc_signature_assurance_project_signature_event','uc_signature_assurance_public_action','uc_signature_assurance_read_events','uc_signature_assurance_read_html_fields','uc_signature_assurance_receipt','uc_signature_assurance_record_request','uc_signature_assurance_redactions','uc_signature_assurance_render_terms','uc_signature_assurance_request','uc_signature_assurance_resolve_selection','uc_signature_assurance_retention_block','uc_signature_assurance_safe_authenticated_input','uc_signature_assurance_save_policy','uc_signature_assurance_selection','uc_signature_assurance_selection_people','uc_signature_assurance_service','uc_signature_assurance_sha','uc_signature_assurance_shape','uc_signature_assurance_signature_boundary','uc_signature_assurance_signature_fence','uc_signature_assurance_signature_read','uc_signature_assurance_signature_write','uc_signature_assurance_storage_boundary','uc_signature_assurance_stream','uc_signature_assurance_subject_read','uc_signature_assurance_terms','uc_signature_assurance_text','uc_signature_assurance_token','uc_signature_assurance_track','uc_signature_assurance_utc','uc_signature_assurance_uuid','uc_signature_assurance_verify_controlled_source_service','uc_signature_assurance_verify_invitation_file_service','uc_signature_assurance_verify_source_service','uc_signature_assurance_withdraw_consent'];new_tables text[]:=ARRAY['uc_signature_assurance_agreements','uc_signature_assurance_bindings','uc_signature_assurance_consents','uc_signature_assurance_document_snapshots','uc_signature_assurance_events','uc_signature_assurance_file_proof_links','uc_signature_assurance_file_proof_tokens','uc_signature_assurance_file_proofs','uc_signature_assurance_participants','uc_signature_assurance_policy_decisions','uc_signature_assurance_policy_versions','uc_signature_assurance_private_manifests','uc_signature_assurance_requests','uc_signature_assurance_scoped_manifests','uc_signature_assurance_streams','uc_signature_assurance_write_tokens'];
BEGIN
 FOR f IN SELECT p.*FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(new_functions)LOOP
  FOR acl_item IN SELECT x.*FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))x WHERE x.grantee<>f.proowner LOOP
   IF acl_item.grantee=0 OR acl_item.privilege_type<>'EXECUTE'OR acl_item.is_grantable OR NOT(
    pg_get_userbyid(acl_item.grantee)='authenticated'AND f.proname IN('read_signature_assurance','apply_signature_assurance')
    OR pg_get_userbyid(acl_item.grantee)='service_role'AND f.proname IN('uc_signature_assurance_service','uc_signature_assurance_verify_source_service','uc_signature_assurance_verify_invitation_file_service','uc_signature_assurance_verify_controlled_source_service','uc_signature_assurance_file_read_service')
   )THEN RAISE EXCEPTION 'UC022_UNEXPECTED_EFFECTIVE_FUNCTION_GRANT';END IF;
  END LOOP;
 END LOOP;
 FOR t IN SELECT c.*FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(new_tables)LOOP
  IF NOT t.relrowsecurity OR EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner)))a WHERE a.grantee<>t.relowner)OR EXISTS(SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl)a WHERE c.attrelid=t.oid AND c.attnum>0 AND NOT c.attisdropped AND a.grantee<>t.relowner)THEN RAISE EXCEPTION 'UC022_PRIVATE_TABLE_OR_COLUMN_GRANT';END IF;
 END LOOP;
END;$acl$;


COMMIT;
