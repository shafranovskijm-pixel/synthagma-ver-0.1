-- FUTURE SOURCE-ONLY successor E adds UC030 B to immutable D. No ledger lease, engine execution or legal approval.
-- UC024 L + UC025 C + UC026 F source-only transaction. No ledger stamp, cloud execution, existing guard or observer replacement.
-- SOURCE ONLY. Exact current628 four-function preimage; no ledger or existing guard replacement.
BEGIN;
SET LOCAL search_path=pg_catalog,public,extensions;
DO $combined_preimage$
DECLARE e record;p pg_proc%ROWTYPE;
BEGIN
 FOR e IN SELECT * FROM jsonb_to_recordset('[{"signature":"public.account_deletion_files(uuid)","definition_md5":"1cc97248a82a6f1e37e31bc853a67808","body_md5":"4122f51e3c2349b643a9c024e9ff96e0","owner":"postgres","acl":["postgres=X/postgres","service_role=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres"],"config":["search_path=pg_catalog, public, storage"],"security_definer":true,"volatility":"s"},{"signature":"public.account_deletion_snapshot(uuid)","definition_md5":"890ce908b69f1d84e6e9cb23d027ee12","body_md5":"815ae5f75348649363ff405e1747ba79","owner":"postgres","acl":["postgres=X/postgres","service_role=X/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=X/postgres"],"config":["search_path=pg_catalog, public, storage"],"security_definer":true,"volatility":"s"},{"signature":"public.uc_scoped_journal_erase_user(uuid)","definition_md5":"946e0c24de08c2efc6fd0d956fb8f99a","body_md5":"63f8f5ae9532646019c90426cb82f5bf","owner":"postgres","acl":["postgres=X/postgres"],"config":["search_path=pg_catalog, public"],"security_definer":true,"volatility":"v"},{"signature":"public.uc_scoped_journal_personal_counts(uuid)","definition_md5":"c5037d39c2336ce571d9bac59962e4b1","body_md5":"f872b733e7d0a250f3e515ff79674954","owner":"postgres","acl":["postgres=X/postgres"],"config":["search_path=pg_catalog, public"],"security_definer":true,"volatility":"s"}]'::jsonb) AS x(signature text,definition_md5 text,body_md5 text,owner text,acl jsonb,config jsonb,security_definer boolean,volatility text) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(e.signature);
  IF p.oid IS NULL OR md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM e.definition_md5 OR md5(p.prosrc) IS DISTINCT FROM e.body_md5
   OR pg_get_userbyid(p.proowner) IS DISTINCT FROM e.owner OR to_jsonb(p.proacl) IS DISTINCT FROM e.acl OR to_jsonb(p.proconfig) IS DISTINCT FROM e.config
   OR p.prosecdef IS DISTINCT FROM e.security_definer OR p.provolatile::text IS DISTINCT FROM e.volatility
  THEN RAISE EXCEPTION 'COMBINED_PRIVACY_CURRENT628_PREIMAGE_OR_AUTHORITY_CHANGED:%',e.signature;END IF;
 END LOOP;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.uc_observe_education_artifact_object(uuid,uuid,uuid,uuid,bigint,uuid,text)');
 IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM 'd218c431e41c969bdcbeaa3542040ab7' THEN RAISE EXCEPTION 'COMBINED_REQUIRES_EXACT_ADDITIVE628_OBSERVER';END IF;
 IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee<>p.proowner AND a.grantee<>to_regrole('service_role')::oid)
  OR NOT has_function_privilege('service_role',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
 THEN RAISE EXCEPTION 'COMBINED_OBSERVER_PRIVATE_AUTHORITY_CHANGED';END IF;
END;$combined_preimage$;
-- Snapshot all existing public/storage function definitions and authority, including any separately released629 guard.
CREATE TEMP TABLE uc_combined_existing_functions ON COMMIT DROP AS
 SELECT p.oid,n.nspname,p.proname,CASE WHEN p.oid IN(to_regprocedure('public.account_deletion_files(uuid)'),to_regprocedure('public.account_deletion_snapshot(uuid)'),to_regprocedure('public.uc_scoped_journal_erase_user(uuid)'),to_regprocedure('public.uc_scoped_journal_personal_counts(uuid)'))THEN to_jsonb(p)-'prosrc'ELSE to_jsonb(p)END metadata
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','storage');
CREATE TEMP TABLE uc_combined_existing_role_metadata ON COMMIT DROP AS
 SELECT(SELECT coalesce(jsonb_agg(to_jsonb(r)-'rolpassword'ORDER BY r.oid),'[]'::jsonb)FROM pg_roles r)roles,
 (SELECT coalesce(jsonb_agg(to_jsonb(m)ORDER BY m.oid),'[]'::jsonb)FROM pg_auth_members m)memberships,
 (SELECT coalesce(jsonb_agg(to_jsonb(s)ORDER BY s.setdatabase,s.setrole),'[]'::jsonb)FROM pg_db_role_setting s)settings,
 (SELECT coalesce(jsonb_agg(to_jsonb(d)ORDER BY d.oid),'[]'::jsonb)FROM pg_default_acl d)defaults;

-- Additive UC030 namespace guard. Does not replace or relax the preceding exact628/authority guards.
DO $uc030_namespace$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc ngp JOIN pg_namespace ngn ON ngn.oid=ngp.pronamespace WHERE ngn.nspname='public' AND ngp.proname=ANY(ARRAY['uc_ng_hash','uc_ng_closed','uc_ng_canonical','uc_ng_immutable','uc_ng_fence','uc_ng_validate_manifest','read_normative_governance','list_normative_impact_centres','register_normative_manifest','record_normative_governance_event','record_normative_runtime_evidence','uc_ng_personal_counts','uc_ng_retention_block']))
 OR EXISTS(SELECT 1 FROM pg_class ngc JOIN pg_namespace ngn ON ngn.oid=ngc.relnamespace WHERE ngn.nspname='public' AND ngc.relname=ANY(ARRAY['uc_normative_manifests','uc_normative_events']))
 THEN RAISE EXCEPTION 'UC030_NEW_NAMESPACE_ALREADY_PRESENT';END IF;
END;$uc030_namespace$;


-- UC024 full candidate. Source only; no ledger, no provider execution, no physical purge.
-- Requires actual625 S3H plus the native-proven final UC022 source100046; not an acceptance claim.
DO $archive_preconditions$
DECLARE expected record;actual_md5 text;BEGIN
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(ARRAY['uc_archive_cases','uc_archive_case_events','uc_archive_requests','uc_archive_authority_revisions','uc_archive_rule_revisions','uc_archive_package_builds','uc_archive_package_files','uc_archive_restore_runs','uc_archive_restore_files','uc_archive_restore_projections','uc_archive_disposal_reviews','uc_archive_rule_source_checks','uc_archive_org_keys']))OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(ARRAY['uc_archive_error','uc_archive_hash','uc_archive_text','uc_archive_people','uc_archive_json_people','uc_archive_scope','uc_archive_scope_contains','uc_archive_fence','uc_archive_immutable','uc_archive_case_head_guard','uc_archive_event_canonical','uc_archive_event_hash','uc_archive_revision_valid','uc_archive_org_version','uc_archive_authority_current','uc_archive_rule_projection','uc_archive_case_projection','uc_archive_scoped_journal_source','uc_archive_source_shape','uc_archive_source_capture','uc_archive_registry_source','uc_archive_journal_source','uc_archive_group_document_source','uc_archive_admission_source','uc_archive_org_files','uc_archive_education_source','uc_archive_frdo_source','uc_archive_signature_file','uc_archive_signature_source','uc_archive_source','uc_archive_can_role','uc_archive_caps','uc_archive_case_access','uc_archive_case_digest','uc_archive_append_case','uc_archive_active_holds','uc_archive_event_projection','uc_archive_decision','uc_archive_apply_authority','uc_archive_rule_draft_valid','uc_archive_apply_rule','uc_archive_source_check_guard','prepare_archive_rule_source_check','commit_archive_rule_source_check','archive_rule_inspection_context','uc_archive_open_case','uc_archive_apply_case','uc_archive_source_inventory','uc_archive_json_literal','uc_archive_package_guard','uc_archive_package_access','uc_archive_package_projection','uc_archive_prepare_package','archive_package_context','uc_archive_prepare_disposal','claim_archive_package','commit_archive_package','archive_package_object_context','archive_sealed_package_context','archive_sealed_file_context','uc_archive_restore_guard','uc_archive_restore_projection','uc_archive_restore_access','uc_archive_prepare_restore','archive_restore_context','claim_archive_restore','archive_restore_object_context','uc_archive_restore_insert','commit_archive_restore','uc_archive_cursor','uc_archive_current_source_ref','read_archive_cases','uc_archive_action_capability','apply_archive_case','uc_archive_bucket_guard','uc_archive_object_guard','uc_archive_retained_source_object','uc_archive_personal_counts','uc_archive_retention_block']))THEN RAISE EXCEPTION 'ARCHIVE_NEW_NAME_COLLISION';END IF;
 IF to_regclass('public.uc_frdo_packets')IS NULL OR to_regclass('public.uc_signature_assurance_streams')IS NULL THEN RAISE EXCEPTION 'ARCHIVE_DEPENDENCY_UNAVAILABLE';END IF;
END;$archive_preconditions$;

-- UC024 fragment 10_archive_model.sql
-- UC024 additive archive model. Candidate only; no ledger and no production execution.
-- No statutory duration defaults. Classification, legal review and centre approval are distinct facts.
SET LOCAL search_path=pg_catalog,public,extensions;
CREATE TABLE public.uc_archive_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,scope jsonb NOT NULL,
 group_id uuid,user_id uuid,enrollment_id uuid,title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 4000),opened_on date NOT NULL,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),state_hash text NOT NULL CHECK(state_hash~'^[a-f0-9]{64}$'),
 rule_version_id uuid,closure jsonb,hold_events jsonb NOT NULL DEFAULT '[]',members jsonb NOT NULL DEFAULT '[]',
 retained_subjects uuid[] NOT NULL DEFAULT '{}',attribution_actors uuid[] NOT NULL DEFAULT '{}',
 state text NOT NULL DEFAULT 'open' CHECK(state IN('open','closed','review_required','held','disposal_pending','destroyed')),
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 cursor_secret bytea NOT NULL DEFAULT gen_random_bytes(32) CHECK(octet_length(cursor_secret)=32),
 CHECK(jsonb_typeof(scope)='object' AND jsonb_typeof(members)='array' AND jsonb_typeof(hold_events)='array'),
 CHECK(jsonb_array_length(members)<=10000 AND jsonb_array_length(hold_events)<=10000),
 CHECK(cardinality(retained_subjects)<=10000 AND cardinality(attribution_actors)<=10000),
 CHECK((group_id IS NULL AND user_id IS NULL AND enrollment_id IS NULL AND scope=jsonb_build_object('kind','organization'))
  OR(group_id IS NOT NULL AND user_id IS NULL AND enrollment_id IS NULL AND scope=jsonb_build_object('kind','group','group_id',group_id))
  OR(group_id IS NOT NULL AND user_id IS NOT NULL AND enrollment_id IS NOT NULL AND scope=jsonb_build_object('kind','enrollment','group_id',group_id,'user_id',user_id,'enrollment_id',enrollment_id)))
);
CREATE INDEX uc_archive_cases_page ON public.uc_archive_cases(organization_id,created_at DESC,id DESC);
CREATE INDEX uc_archive_cases_subjects ON public.uc_archive_cases USING gin(retained_subjects);
CREATE TABLE public.uc_archive_case_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES public.uc_archive_cases(id),organization_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),kind text NOT NULL,actor_id uuid NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 snapshot jsonb NOT NULL,payload jsonb NOT NULL,private_capture jsonb,payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),
 retained_people uuid[] NOT NULL DEFAULT '{}',UNIQUE(case_id,revision)
);
CREATE TABLE public.uc_archive_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,actor_id uuid NOT NULL,request_id uuid NOT NULL,
 scope jsonb NOT NULL,case_id uuid REFERENCES public.uc_archive_cases(id),command_sha256 text NOT NULL CHECK(command_sha256~'^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL,retained_people uuid[] NOT NULL DEFAULT '{}',recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(actor_id,request_id)
);
-- Authority appointments are centre decisions backed by exact source evidence; catalogue ownership is not an appointment.
CREATE TABLE public.uc_archive_authority_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,authority_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision>0),
 appointed_user_id uuid NOT NULL,roles text[] NOT NULL CHECK(cardinality(roles)>0 AND roles<@ARRAY['legal_reviewer','center_approver','archive_operator','destruction_reviewer']),
 state text NOT NULL CHECK(state IN('appointed','revoked')),evidence jsonb NOT NULL,reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 4000),
 actor_id uuid NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),retained_people uuid[] NOT NULL DEFAULT '{}',UNIQUE(authority_id,revision)
);
CREATE INDEX uc_archive_authority_current ON public.uc_archive_authority_revisions(organization_id,authority_id,revision DESC);
-- Entire reviewed rule versions are immutable. The latest state never rewrites an older case classification.
CREATE TABLE public.uc_archive_rule_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,rule_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision>0),
 nomenclature_version_id uuid NOT NULL,nomenclature_reference jsonb NOT NULL,entry_id uuid NOT NULL,state text NOT NULL CHECK(state IN('draft','reviewed','approved','superseded')),
 data jsonb NOT NULL,source_reference jsonb NOT NULL,source_byte_sha256 text NOT NULL CHECK(source_byte_sha256~'^[a-f0-9]{64}$'),
 source_check jsonb,legal_review jsonb,center_approval jsonb,actor_id uuid NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 retained_people uuid[] NOT NULL DEFAULT '{}',UNIQUE(rule_id,revision),
 CHECK((state NOT IN('reviewed','approved') OR(source_check IS NOT NULL AND legal_review IS NOT NULL)) AND(state<>'approved'OR center_approval IS NOT NULL))
);
CREATE TABLE public.uc_archive_package_builds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES public.uc_archive_cases(id),organization_id uuid NOT NULL,actor_id uuid NOT NULL,
 input_revision bigint NOT NULL CHECK(input_revision>0),input_state_hash text NOT NULL CHECK(input_state_hash~'^[a-f0-9]{64}$'),
 phase text NOT NULL CHECK(phase IN('prepared','generating','sealed','failed')),request_id uuid NOT NULL,lease_id uuid,lease_until timestamptz,
 manifest jsonb,manifest_sha256 text CHECK(manifest_sha256~'^[a-f0-9]{64}$'),manifest_bytes bigint CHECK(manifest_bytes BETWEEN 1 AND 4194304),
 completeness text NOT NULL DEFAULT 'partial' CHECK(completeness IN('partial','complete')),blockers jsonb NOT NULL DEFAULT '[]',
 retained_people uuid[] NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),sealed_at timestamptz,
 CHECK(phase<>'sealed'OR(manifest IS NOT NULL AND manifest_sha256 IS NOT NULL AND manifest_bytes IS NOT NULL AND sealed_at IS NOT NULL)),
 CHECK(completeness<>'complete'OR(phase='sealed'AND jsonb_array_length(blockers)=0))
);
CREATE TABLE public.uc_archive_package_files(
 id uuid NOT NULL,package_id uuid NOT NULL REFERENCES public.uc_archive_package_builds(id),organization_id uuid NOT NULL,member_id uuid NOT NULL,
 source_reference jsonb NOT NULL,bucket_id text NOT NULL CHECK(bucket_id='archive-case-artifacts'),object_path text NOT NULL,object_id uuid NOT NULL,object_updated_at timestamptz NOT NULL,
 byte_sha256 text NOT NULL CHECK(byte_sha256~'^[a-f0-9]{64}$'),byte_size bigint NOT NULL CHECK(byte_size BETWEEN 1 AND 104857600),mime_type text NOT NULL,
 readback_sha256 text NOT NULL CHECK(readback_sha256=byte_sha256),retained_people uuid[] NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(package_id,id),UNIQUE(bucket_id,object_path),UNIQUE(object_id),CHECK(object_path=organization_id::text||'/'||package_id::text||'/files/'||id::text||'/'||byte_sha256||'.bin')
);
-- Restore stores inert projections in a quarantine namespace only. It never creates live users, enrollments, numbers or document issues.
CREATE TABLE public.uc_archive_restore_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,package_id uuid NOT NULL REFERENCES public.uc_archive_package_builds(id),actor_id uuid NOT NULL,
 manifest_sha256 text NOT NULL CHECK(manifest_sha256~'^[a-f0-9]{64}$'),state text NOT NULL CHECK(state IN('prepared','verifying','verified','failed')),
 request_id uuid NOT NULL,lease_id uuid,lease_until timestamptz,
 verified_file_ids uuid[] NOT NULL DEFAULT '{}',projection_sha256 text CHECK(projection_sha256~'^[a-f0-9]{64}$'),
 failure_code text,retained_people uuid[] NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,
 UNIQUE(actor_id,request_id),CHECK(state<>'verified'OR(projection_sha256 IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE TABLE public.uc_archive_restore_files(
 restore_id uuid NOT NULL REFERENCES public.uc_archive_restore_runs(id),id uuid NOT NULL,package_id uuid NOT NULL,organization_id uuid NOT NULL,
 bucket_id text NOT NULL CHECK(bucket_id='archive-case-artifacts'),object_path text NOT NULL,object_id uuid NOT NULL,object_updated_at timestamptz NOT NULL,
 byte_sha256 text NOT NULL CHECK(byte_sha256~'^[a-f0-9]{64}$'),byte_size bigint NOT NULL CHECK(byte_size BETWEEN 1 AND 104857600),mime_type text NOT NULL,
 readback_sha256 text NOT NULL CHECK(readback_sha256=byte_sha256),retained_people uuid[] NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(restore_id,id),FOREIGN KEY(package_id,id)REFERENCES public.uc_archive_package_files(package_id,id),UNIQUE(object_id),UNIQUE(bucket_id,object_path),
 CHECK(object_path=organization_id::text||'/restores/'||restore_id::text||'/files/'||id::text||'/'||byte_sha256||'.bin')
);
CREATE TABLE public.uc_archive_restore_projections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restore_id uuid NOT NULL REFERENCES public.uc_archive_restore_runs(id),organization_id uuid NOT NULL,
 entity_kind text NOT NULL CHECK(entity_kind IN('case_snapshot','record','case_event','file_readback')),export_id uuid NOT NULL,
 projection jsonb NOT NULL,projection_sha256 text NOT NULL CHECK(projection_sha256~'^[a-f0-9]{64}$'),retained_people uuid[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(restore_id,entity_kind,export_id)
);
-- A candidate date permits review only. No automatic expiry, deletion queue or Storage DELETE path exists in UC024.
CREATE TABLE public.uc_archive_disposal_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES public.uc_archive_cases(id),organization_id uuid NOT NULL,actor_id uuid NOT NULL,
 case_revision bigint NOT NULL CHECK(case_revision>0),case_state_hash text NOT NULL CHECK(case_state_hash~'^[a-f0-9]{64}$'),
 rule_version_id uuid REFERENCES public.uc_archive_rule_revisions(id),calculation jsonb NOT NULL,legal_hold_events jsonb NOT NULL,
 state text NOT NULL CHECK(state IN('draft','blocked','reviewed','cancelled')),act_source jsonb,explicit_decision jsonb,
 blocker_codes jsonb NOT NULL DEFAULT '[]',destruction_authorized boolean NOT NULL DEFAULT false CHECK(destruction_authorized=false),
 retained_people uuid[] NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- One narrow original-caller job for actual byte verification of a proposed rule source.
-- A declared hash alone can never produce legal review or centre approval.
CREATE TABLE public.uc_archive_rule_source_checks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,rule_version_id uuid NOT NULL REFERENCES public.uc_archive_rule_revisions(id),actor_id uuid NOT NULL,request_id uuid NOT NULL,
 source_reference jsonb NOT NULL,source_context jsonb NOT NULL,declared_byte_sha256 text NOT NULL CHECK(declared_byte_sha256~'^[a-f0-9]{64}$'),
 phase text NOT NULL DEFAULT'prepared'CHECK(phase IN('prepared','sealed')),verified_rule_version_id uuid REFERENCES public.uc_archive_rule_revisions(id),actual_byte_sha256 text CHECK(actual_byte_sha256~'^[a-f0-9]{64}$'),actual_byte_size bigint CHECK(actual_byte_size BETWEEN 1 AND 104857600),
 retained_people uuid[] NOT NULL DEFAULT'{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval'15 minutes',sealed_at timestamptz,
 UNIQUE(actor_id,request_id),CHECK(phase<>'sealed'OR(verified_rule_version_id IS NOT NULL AND actual_byte_sha256=declared_byte_sha256 AND actual_byte_size IS NOT NULL AND sealed_at IS NOT NULL))
);
-- Close raw table and column access for every non-owner grantee, including provider defaults and service_role.
DO $archive_acl$
DECLARE rel record;grantee record;col record;BEGIN
 FOR rel IN SELECT c.oid,n.nspname,c.relname,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname IN(
 'uc_archive_cases','uc_archive_case_events','uc_archive_requests','uc_archive_authority_revisions','uc_archive_rule_revisions','uc_archive_package_builds','uc_archive_package_files','uc_archive_restore_runs','uc_archive_restore_files','uc_archive_restore_projections','uc_archive_disposal_reviews','uc_archive_rule_source_checks') LOOP
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',rel.nspname,rel.relname);
  FOR grantee IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.oid=rel.oid AND a.grantee<>rel.relowner LOOP
   EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM %s',rel.nspname,rel.relname,CASE WHEN grantee.grantee=0 THEN 'PUBLIC'ELSE quote_ident(pg_get_userbyid(grantee.grantee))END);
  END LOOP;
  FOR col IN SELECT a.attname,x.grantee FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl)x WHERE a.attrelid=rel.oid AND a.attnum>0 AND NOT a.attisdropped AND x.grantee<>rel.relowner LOOP
   EXECUTE format('REVOKE ALL (%I) ON TABLE %I.%I FROM %s',col.attname,rel.nspname,rel.relname,CASE WHEN col.grantee=0 THEN 'PUBLIC'ELSE quote_ident(pg_get_userbyid(col.grantee))END);
  END LOOP;
 END LOOP;
END;$archive_acl$;


-- UC024 fragment 20_archive_boundaries.sql
-- UC024 private actor/scope/CAS boundaries. Assemble after10; no public endpoint grants in this fragment.
CREATE FUNCTION public.uc_archive_error(p_code text)RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $archive$
BEGIN
 IF p_code='ACCESS_DENIED'THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='ACCESS_DENIED';
 ELSIF p_code='NOT_FOUND'THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='NOT_FOUND';
 ELSIF p_code IN('REVISION_CONFLICT','SOURCE_CHANGED','APPROVAL_STALE')THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE=p_code;
 ELSIF p_code IN('SOURCE_UNAVAILABLE','RETENTION_UNCLASSIFIED','RETENTION_NOT_EXPIRED','RETENTION_PERMANENT','CLOSURE_REQUIRED','EVENT_MISMATCH','LEGAL_HOLD','HOLD_HISTORY_INVALID','APPROVAL_REQUIRED','EXPERT_REVIEW_REQUIRED','SHARED_FILE_RETAINED','PACKAGE_INCOMPLETE','HASH_MISMATCH','RESTORE_MAPPING_REQUIRED','BACKUP_POLICY_UNVERIFIED','UNSUPPORTED_STORAGE_GENERATION','DEPENDENCY_UNAVAILABLE','LIMIT_EXCEEDED')THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE=p_code;
 ELSE RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_INPUT';END IF;
END;$archive$;
CREATE FUNCTION public.uc_archive_hash(p_value jsonb)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $archive$
 SELECT public.uc_document_registry_hash(p_value::text)
$archive$;
CREATE FUNCTION public.uc_archive_text(p_value jsonb,p_limit integer DEFAULT 4000)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $archive$
 SELECT coalesce(jsonb_typeof(p_value)='string'AND length(btrim(p_value#>>'{}'))BETWEEN 1 AND p_limit,false)
$archive$;
CREATE FUNCTION public.uc_archive_people(p_value jsonb)RETURNS uuid[] LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $archive$
DECLARE result uuid[];BEGIN
 IF jsonb_typeof(p_value)IS DISTINCT FROM'array'OR jsonb_array_length(p_value)>10000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_value)e WHERE NOT public.uc_custom_journal_uuid(e))THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 SELECT coalesce(array_agg(x.id ORDER BY x.id),'{}')INTO result FROM(SELECT DISTINCT (e#>>'{}')::uuid id FROM jsonb_array_elements(p_value)e)x;
 IF cardinality(result)<>jsonb_array_length(p_value)THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;RETURN result;
END;$archive$;
-- Known UUID-bearing subjects in structured source metadata are derived, never trusted from the browser.
-- Unstructured document contents still need the operator's explicit declared-subject list.
CREATE FUNCTION public.uc_archive_json_people(p_value jsonb)RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
 WITH RECURSIVE nodes(value)AS(SELECT p_value UNION ALL SELECT e.value FROM nodes n CROSS JOIN LATERAL(
  SELECT a.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array'THEN n.value ELSE'[]'::jsonb END)a
  UNION ALL SELECT o.value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object'THEN n.value ELSE'{}'::jsonb END)o)e),
 ids AS(SELECT DISTINCT(value#>>'{}')::uuid id FROM nodes WHERE jsonb_typeof(value)='string'AND (value#>>'{}')~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
 SELECT coalesce(array_agg(i.id ORDER BY i.id),'{}')FROM ids i WHERE EXISTS(SELECT 1 FROM auth.users u WHERE u.id=i.id)OR EXISTS(SELECT 1 FROM public.account_deletion_revocations r WHERE r.user_id=i.id)
$archive$;
CREATE FUNCTION public.uc_archive_scope(p_org uuid,p_scope jsonb)RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE group_key uuid;BEGIN
 IF public.uc_custom_journal_shape(p_scope,ARRAY['kind'])AND p_scope->>'kind'='organization'THEN group_key:=public.uc_document_registry_scope(p_org,p_scope);
 ELSIF public.uc_custom_journal_shape(p_scope,ARRAY['kind','group_id'])AND p_scope->>'kind'='group'AND public.uc_custom_journal_uuid(p_scope->'group_id')THEN group_key:=public.uc_document_registry_scope(p_org,p_scope);
 ELSIF public.uc_custom_journal_shape(p_scope,ARRAY['kind','group_id','user_id','enrollment_id'])AND p_scope->>'kind'='enrollment'AND public.uc_custom_journal_uuid(p_scope->'group_id')AND public.uc_custom_journal_uuid(p_scope->'user_id')AND public.uc_custom_journal_uuid(p_scope->'enrollment_id')THEN
  group_key:=public.uc_document_registry_scope(p_org,jsonb_build_object('kind','group','group_id',p_scope->'group_id'));
  IF NOT EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id WHERE e.id=(p_scope->>'enrollment_id')::uuid AND e.user_id=(p_scope->>'user_id')::uuid AND c.organization_id=p_org)
   OR NOT public.uc_document_registry_student(p_org,group_key,(p_scope->>'user_id')::uuid)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 ELSE PERFORM public.uc_archive_error('INVALID_INPUT');END IF;RETURN group_key;
END;$archive$;
CREATE FUNCTION public.uc_archive_scope_contains(p_query jsonb,p_case jsonb)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $archive$
 SELECT coalesce(p_query->>'kind'='organization'OR p_query=p_case OR(p_query->>'kind'='group'AND p_case->>'kind'='enrollment'AND p_query->'group_id'=p_case->'group_id'),false)
$archive$;
CREATE FUNCTION public.uc_archive_fence(p_org uuid,p_scope jsonb,p_people uuid[],p_write boolean DEFAULT false,p_request uuid DEFAULT NULL)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE group_key uuid;BEGIN
 group_key:=public.uc_archive_scope(p_org,p_scope);
 PERFORM public.uc_document_registry_fence(p_org,group_key,p_people,p_write,NULL);
 IF p_write THEN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_archive_org:'||p_org::text,0))THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 ELSE
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc_archive_org:'||p_org::text,0))THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 END IF;
 IF p_request IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_archive_request:'||auth.uid()::text||':'||p_request::text,0))THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 PERFORM public.uc_archive_scope(p_org,p_scope);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;
CREATE FUNCTION public.uc_archive_immutable()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $archive$
BEGIN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='ARCHIVE_IMMUTABLE_HISTORY';END;$archive$;
DO $archive_triggers$
DECLARE relation_name text;BEGIN
 FOREACH relation_name IN ARRAY ARRAY['uc_archive_case_events','uc_archive_requests','uc_archive_authority_revisions','uc_archive_rule_revisions','uc_archive_package_files','uc_archive_restore_files','uc_archive_restore_projections','uc_archive_disposal_reviews']LOOP
  EXECUTE format('CREATE TRIGGER uc_archive_immutable_history BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_archive_immutable()',relation_name);
 END LOOP;
END;$archive_triggers$;
CREATE FUNCTION public.uc_archive_case_head_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
BEGIN
 IF TG_OP='DELETE'THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.scope<>OLD.scope OR NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.enrollment_id IS DISTINCT FROM OLD.enrollment_id
  OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by OR NEW.cursor_secret<>OLD.cursor_secret OR NEW.opened_on<>OLD.opened_on
  OR NEW.revision<>OLD.revision+1 OR NOT(OLD.retained_subjects<@NEW.retained_subjects)OR NOT(OLD.attribution_actors<@NEW.attribution_actors)THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 IF NEW.state='destroyed'THEN PERFORM public.uc_archive_error('UNSUPPORTED_STORAGE_GENERATION');END IF;
 RETURN NEW;
END;$archive$;
CREATE TRIGGER uc_archive_case_head_guard BEFORE UPDATE OR DELETE ON public.uc_archive_cases FOR EACH ROW EXECUTE FUNCTION public.uc_archive_case_head_guard();
-- Public case-event payload keys are fixed ASCII ABI keys and numbers are safe integers.
-- This emits the same canonical UTF-8 JSON used by package.ts; private source hashes remain separate opaque CAS values.
CREATE FUNCTION public.uc_archive_event_canonical(p_value jsonb)RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $archive$
DECLARE kind text:=jsonb_typeof(p_value);result text;number_value numeric;BEGIN
 IF kind IN('null','boolean','string')THEN RETURN p_value::text;
 ELSIF kind='number'THEN number_value:=(p_value#>>'{}')::numeric;IF number_value<>trunc(number_value)OR abs(number_value)>9007199254740991 THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;RETURN trunc(number_value)::text;
 ELSIF kind='array'THEN SELECT '['||coalesce(string_agg(public.uc_archive_event_canonical(a.value),','ORDER BY a.ordinality),'')||']'INTO result FROM jsonb_array_elements(p_value)WITH ORDINALITY a(value,ordinality);RETURN result;
 ELSIF kind='object'THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_value)k WHERE k!~'^[A-Za-z0-9_]+$')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  SELECT '{'||coalesce(string_agg(to_jsonb(e.key)::text||':'||public.uc_archive_event_canonical(e.value),','ORDER BY e.key COLLATE"C"),'')||'}'INTO result FROM jsonb_each(p_value)e;RETURN result;
 ELSE PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
END;$archive$;
CREATE FUNCTION public.uc_archive_event_hash(p_value jsonb)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $archive$
 SELECT public.uc_document_registry_hash(public.uc_archive_event_canonical(p_value))
$archive$;
CREATE FUNCTION public.uc_archive_revision_valid(p_value jsonb)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $archive$
 SELECT CASE WHEN jsonb_typeof(p_value)='number'AND coalesce(p_value#>>'{}','')~'^(0|[1-9][0-9]{0,15})$'THEN(p_value#>>'{}')::numeric<=9007199254740991 ELSE false END
$archive$;
-- No anonymous, authenticated or service-role EXECUTE is exposed by this source fragment.
DO $archive_function_acl$
DECLARE f record;g record;BEGIN
 FOR f IN SELECT p.oid,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname ~ '^uc_archive_' LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=f.oid AND a.grantee<>f.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',f.oid::regprocedure,CASE WHEN g.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(g.grantee))END);
  END LOOP;
 END LOOP;
END;$archive_function_acl$;


-- UC024 fragment 30_archive_sources_authority.sql
-- UC024 exact version source adapter. Returned locators remain private to controlled workers.
CREATE FUNCTION public.uc_archive_org_version(p_org uuid,p_source jsonb,p_reviewed boolean DEFAULT false,p_lock boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE document_row public.org_documents;version_row public.org_document_versions;review_row public.org_document_reviews;original_ref jsonb;people uuid[];actor_people uuid[];review_history jsonb;captured jsonb;file_bytes bigint;file_mime text;file_path text;BEGIN
 IF NOT public.uc_custom_journal_shape(p_source,ARRAY['kind','document_id','version_id','content_hash'])OR p_source->>'kind'IS DISTINCT FROM'organization_document_version'OR NOT public.uc_custom_journal_uuid(p_source->'document_id')OR NOT public.uc_custom_journal_uuid(p_source->'version_id')OR coalesce(p_source->>'content_hash','')!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 IF NOT public.uc_copy_registry_file_permission(p_org)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 SELECT d.*INTO document_row FROM public.org_documents d WHERE d.id=(p_source->>'document_id')::uuid AND d.organization_id=p_org;
 SELECT v.*INTO version_row FROM public.org_document_versions v WHERE v.id=(p_source->>'version_id')::uuid AND v.document_id=document_row.id AND v.organization_id=p_org;
 IF version_row.id IS NULL OR NOT public.uc_copy_registry_object_matches(version_row)THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 original_ref:=public.uc_copy_registry_original_ref(version_row);
 file_path:=version_row.file_path;
 IF version_row.storage_object_id IS NULL OR file_path IS NULL OR length(file_path)>1024 OR file_path~'(^/|^[a-zA-Z][a-zA-Z0-9+.-]*:|(^|/)\.\.?(/|$)|[[:cntrl:]])'OR position(chr(92)IN file_path)>0 OR file_path~*'%(2e|2f|5c|00|0[1-9a-f]|1[0-9a-f]|25)'THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 IF version_row.file_size IS NOT NULL THEN file_bytes:=version_row.file_size;
 ELSIF jsonb_typeof(version_row.storage_metadata->'size')='number'AND(version_row.storage_metadata->>'size')~'^[0-9]{1,9}$'THEN file_bytes:=(version_row.storage_metadata->>'size')::bigint;
 ELSE PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 IF file_bytes NOT BETWEEN 1 AND 104857600 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
 file_mime:=coalesce(nullif(version_row.storage_metadata->>'mimetype',''),'application/octet-stream');
 IF length(file_mime)>120 OR file_mime!~'^[a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+-]+$'THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 IF original_ref->>'content_hash'IS DISTINCT FROM p_source->>'content_hash'THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 SELECT r.*INTO review_row FROM public.org_document_reviews r WHERE r.document_id=document_row.id AND r.version_id=version_row.id AND r.organization_id=p_org;
 IF p_reviewed AND(review_row.id IS NULL OR review_row.state<>'approved')THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(e)ORDER BY e.revision),'[]'::jsonb)INTO review_history FROM public.org_document_review_events e WHERE e.review_id=review_row.id AND e.organization_id=p_org;
 captured:=jsonb_build_object('version',to_jsonb(version_row)-ARRAY['file_path','request_payload'],'review',CASE WHEN review_row.id IS NULL THEN NULL ELSE to_jsonb(review_row)END,'review_events',review_history);
 SELECT coalesce(array_agg(DISTINCT a.id ORDER BY a.id),'{}')INTO actor_people FROM(SELECT unnest(array_remove(ARRAY[version_row.uploaded_by,review_row.responsible_user_id,review_row.reviewer_user_id,review_row.approved_by],NULL))id UNION ALL SELECT h.actor_id FROM public.org_document_review_events h WHERE h.review_id=review_row.id AND h.organization_id=p_org)a WHERE a.id IS NOT NULL;
 people:=public.uc_archive_json_people(captured)||actor_people;
 SELECT coalesce(array_agg(DISTINCT u.id ORDER BY u.id),'{}')INTO people FROM unnest(people)u(id);
 PERFORM public.uc_document_registry_fence(p_org,NULL,people,p_lock,NULL);
 IF p_lock THEN
  PERFORM 1 FROM public.org_documents d WHERE d.id=document_row.id AND d.organization_id=p_org FOR SHARE NOWAIT;
  PERFORM 1 FROM public.org_document_versions v WHERE v.id=version_row.id AND v.organization_id=p_org FOR SHARE NOWAIT;
  PERFORM 1 FROM public.org_document_reviews r WHERE r.id=review_row.id AND r.organization_id=p_org FOR SHARE NOWAIT;
  PERFORM 1 FROM storage.objects o WHERE o.id=version_row.storage_object_id FOR SHARE NOWAIT;
  PERFORM 1 FROM storage.buckets b WHERE b.id='org-documents'FOR SHARE NOWAIT;
  -- The second read observes any mutation before the row/share locks were acquired.
  SELECT v.*INTO version_row FROM public.org_document_versions v WHERE v.id=version_row.id AND v.document_id=document_row.id AND v.organization_id=p_org;
  IF NOT public.uc_copy_registry_object_matches(version_row)OR public.uc_copy_registry_original_ref(version_row)IS DISTINCT FROM original_ref THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  IF p_reviewed AND NOT EXISTS(SELECT 1 FROM public.org_document_reviews r WHERE r.id=review_row.id AND r.organization_id=p_org AND r.version_id=version_row.id AND r.revision=review_row.revision AND r.state='approved')THEN PERFORM public.uc_archive_error('APPROVAL_STALE');END IF;
 END IF;
 RETURN jsonb_build_object('source',p_source,'subjects',to_jsonb(people),'attribution_actors',to_jsonb(actor_people),'file_ids',jsonb_build_array(version_row.storage_object_id),'label',left(coalesce(version_row.document_metadata->>'name',version_row.file_name,'Версия документа'),500),'captured_record',captured,
 'private_file',jsonb_build_object('retained_people',to_jsonb(people),'attribution_actors',to_jsonb(actor_people),'bucket','org-documents','path',version_row.file_path,'object_id',version_row.storage_object_id,'object_updated_at',(SELECT o.updated_at FROM storage.objects o WHERE o.id=version_row.storage_object_id),'byte_size',file_bytes,'mime_type',file_mime));
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;
CREATE FUNCTION public.uc_archive_authority_current(p_org uuid,p_user uuid,p_role text,p_lock boolean DEFAULT false)RETURNS public.uc_archive_authority_revisions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE appointment public.uc_archive_authority_revisions;BEGIN
 IF p_role NOT IN('legal_reviewer','center_approver','archive_operator','destruction_reviewer')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 IF p_lock AND NOT pg_try_advisory_xact_lock(hashtextextended('uc_archive_authority:'||p_org::text||':'||p_user::text,0))THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 SELECT a.*INTO appointment FROM public.uc_archive_authority_revisions a WHERE a.organization_id=p_org AND a.appointed_user_id=p_user AND a.state='appointed'AND p_role=ANY(a.roles)
  AND NOT EXISTS(SELECT 1 FROM public.uc_archive_authority_revisions later WHERE later.authority_id=a.authority_id AND later.revision>a.revision)ORDER BY a.recorded_at DESC,a.id DESC LIMIT 1;
 IF appointment.id IS NULL OR NOT public.uc_org_document_review_actor(p_org,p_user)THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
 PERFORM public.uc_document_registry_fence(p_org,NULL,appointment.retained_people,p_lock,NULL);
 PERFORM public.uc_archive_org_version(p_org,appointment.evidence,true,p_lock);
 RETURN appointment;
END;$archive$;
CREATE FUNCTION public.uc_archive_rule_projection(p_rule public.uc_archive_rule_revisions)RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $archive$
 SELECT p_rule.data||jsonb_build_object('id',p_rule.id,'revision',p_rule.revision,'organization_id',p_rule.organization_id,'nomenclature_version_id',p_rule.nomenclature_version_id,'entry_id',p_rule.entry_id,'status',p_rule.state,'source_sha256',p_rule.source_byte_sha256,
 'source_version_id',p_rule.source_reference->'version_id','source_checked_at',p_rule.source_check->'recorded_at','legal_review',p_rule.legal_review,'center_approval',p_rule.center_approval)
$archive$;
CREATE FUNCTION public.uc_archive_case_projection(p_case public.uc_archive_cases)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
 SELECT jsonb_build_object('schema_version',1,'id',p_case.id,'organization_id',p_case.organization_id,'scope',p_case.scope,'revision',p_case.revision,'state_hash',p_case.state_hash,'title',p_case.title,'opened_on',p_case.opened_on,
 'rule',(SELECT public.uc_archive_rule_projection(r)FROM public.uc_archive_rule_revisions r WHERE r.id=p_case.rule_version_id AND r.organization_id=p_case.organization_id),'closure',p_case.closure,'hold_events',p_case.hold_events,'members',p_case.members,'retained_subjects',to_jsonb(p_case.retained_subjects),'attribution_actors',to_jsonb(p_case.attribution_actors),'state',p_case.state)
$archive$;


-- UC024 fragment 32_archive_current_sources.sql
-- UC024 bounded original-JWT source captures. These helpers remain private until the final ACL closure.
-- A source CAS is SHA-256 of the complete captured record/history below, not a legal retention conclusion.
CREATE FUNCTION public.uc_archive_source_shape(p_source jsonb,p_kind text,p_keys text[],p_id_key text,p_hash_key text)RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $archive$
BEGIN
 IF NOT public.uc_custom_journal_shape(p_source,p_keys)OR p_source->>'kind'IS DISTINCT FROM p_kind OR NOT public.uc_custom_journal_uuid(p_source->p_id_key)OR coalesce(p_source->>p_hash_key,'')!~'^[a-f0-9]{64}$'OR(p_source?'revision'AND NOT public.uc_archive_revision_valid(p_source->'revision'))THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
END;$archive$;
CREATE FUNCTION public.uc_archive_source_capture(p_org uuid,p_scope jsonb,p_source jsonb,p_captured jsonb,p_actors uuid[],p_files jsonb,p_label text,p_history jsonb,p_history_kind text,p_expected_count bigint)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE source_people uuid[];actor_people uuid[];group_key uuid;BEGIN
 IF octet_length(p_captured::text)>4194304 OR octet_length(p_history::text)>4194304 OR jsonb_typeof(p_history)IS DISTINCT FROM'array'OR jsonb_array_length(p_history)>100000 OR jsonb_typeof(p_files)IS DISTINCT FROM'array'OR jsonb_array_length(p_files)>10000 OR p_history_kind NOT IN('immutable_source','revision_stream','unverified_legacy')THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
 SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id),'{}')INTO actor_people FROM unnest(coalesce(p_actors,'{}'))x(id)WHERE x.id IS NOT NULL;
 SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id),'{}')INTO actor_people FROM(SELECT unnest(actor_people)id UNION ALL SELECT unnest(public.uc_archive_people(coalesce(f.value->'attribution_actors','[]'::jsonb)))FROM jsonb_array_elements(p_files)f)x WHERE x.id IS NOT NULL;
 source_people:=public.uc_archive_json_people(p_captured||jsonb_build_object('_history',p_history,'_files',p_files));
 -- All subjects and attribution actors remain in the privacy fence. They are not replaced by the current row alone.
 PERFORM public.uc_archive_fence(p_org,p_scope,source_people||actor_people,false,NULL);
 group_key:=public.uc_archive_scope(p_org,p_scope);
 IF group_key IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(source_people)x(id)WHERE NOT(x.id=ANY(actor_people))AND NOT public.uc_document_registry_student(p_org,group_key,x.id))THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF p_scope->>'kind'='enrollment'AND EXISTS(SELECT 1 FROM unnest(source_people)x(id)WHERE NOT(x.id=ANY(actor_people))AND x.id IS DISTINCT FROM(p_scope->>'user_id')::uuid)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 RETURN jsonb_build_object('source',p_source,'subjects',to_jsonb(source_people),'attribution_actors',to_jsonb(actor_people),'file_ids',coalesce((SELECT jsonb_agg(coalesce(f.value->'object_id',f.value->'logical_file_id')ORDER BY coalesce(f.value->>'object_id',f.value->>'logical_file_id'))FROM jsonb_array_elements(p_files)f),'[]'::jsonb),'label',left(p_label,500),'captured_record',p_captured,'private_files',p_files,'history',p_history,'history_kind',p_history_kind,'expected_event_count',p_expected_count,'snapshot_hash',public.uc_archive_hash(p_captured));
END;$archive$;
CREATE FUNCTION public.uc_archive_registry_source(p_org uuid,p_scope jsonb,p_source jsonb,p_lock boolean DEFAULT false,p_exact boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE row_value public.uc_document_registry_records;group_key uuid;capture_value jsonb;history_value jsonb;files_value jsonb:='[]';actors uuid[];event_row public.uc_document_registry_events;source_value jsonb;file_value jsonb;proof_value jsonb;artifact_proof jsonb;artifact_build jsonb;event_count bigint;BEGIN
 PERFORM public.uc_archive_source_shape(p_source,'registry_record',ARRAY['kind','record_id','revision','state_hash'],'record_id','state_hash');
 group_key:=public.uc_archive_scope(p_org,p_scope);
 PERFORM public.read_document_registry(p_org,CASE WHEN group_key IS NULL THEN jsonb_build_object('kind','organization')ELSE jsonb_build_object('kind','group','group_id',group_key)END,jsonb_build_object('kind','detail','record_id',p_source->'record_id'));
 IF p_lock THEN
  PERFORM public.uc_document_registry_fence(p_org,group_key,'{}',true,NULL);
  LOCK TABLE public.uc_document_registry_records,public.uc_document_registry_events IN SHARE MODE NOWAIT;
 END IF;
 SELECT x.*INTO row_value FROM public.uc_document_registry_records x WHERE x.id=(p_source->>'record_id')::uuid AND x.organization_id=p_org AND NOT x.redacted;
 IF row_value.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 SELECT count(*)INTO event_count FROM public.uc_document_registry_events h WHERE h.organization_id=p_org AND h.record_id=row_value.id;
 IF event_count>100000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
 IF event_count<>row_value.revision OR EXISTS(SELECT 1 FROM public.uc_document_registry_events h WHERE h.organization_id=p_org AND h.record_id=row_value.id AND(h.redacted OR h.revision<1 OR h.revision>row_value.revision))THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'sequence',h.revision,'source_revision',h.revision,'payload',to_jsonb(h))ORDER BY h.revision),'[]'::jsonb),coalesce(array_agg(h.recorded_by)FILTER(WHERE h.recorded_by IS NOT NULL),'{}')INTO history_value,actors FROM public.uc_document_registry_events h WHERE h.organization_id=p_org AND h.record_id=row_value.id;
 actors:=actors||array_remove(ARRAY[row_value.registered_by,row_value.updated_by],NULL);
 -- Every historical source/context is authorized now. No current-row-only shortcut for an older participant or file.
 FOR source_value IN SELECT DISTINCT q.source FROM(SELECT row_value.data->'source' source UNION ALL SELECT h.snapshot->'data'->'source' FROM public.uc_document_registry_events h WHERE h.organization_id=p_org AND h.record_id=row_value.id)q LOOP
  IF source_value->>'kind'='org_document_version'THEN
   proof_value:=public.uc_archive_org_version(p_org,jsonb_set(source_value,'{kind}','"organization_document_version"'::jsonb),false,p_lock);file_value:=proof_value->'private_file';
  ELSIF source_value->>'kind'='frdo_packet_artifact'THEN
   -- This is a read/copy path, never the narrow registry registration dispatcher. Its write GUC is not forged.
   artifact_proof:=public.uc_frdo_registry_source(p_org,source_value,false);
   IF artifact_proof->>'verified'IS DISTINCT FROM'true'THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
   IF p_lock THEN LOCK TABLE public.uc_frdo_packets,public.uc_frdo_packet_subjects,public.uc_frdo_packet_artifact_builds IN SHARE MODE NOWAIT;artifact_proof:=public.uc_frdo_registry_source(p_org,source_value,false);END IF;
   artifact_build:=to_jsonb(public.uc_frdo_artifact_access((source_value->>'packet_id')::uuid,artifact_proof->'artifact',false,false));
   IF artifact_build->>'organization_id'IS DISTINCT FROM p_org::text OR artifact_build->>'phase'IS DISTINCT FROM'sealed'THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
   file_value:=jsonb_build_object('bucket',artifact_build->'bucket_id','path',artifact_build->'object_path','object_id',artifact_build->'object_id','object_updated_at',artifact_build->'object_updated_at','byte_size',artifact_build->'byte_size','mime_type',artifact_build->'mime','known_sha256',artifact_build->'byte_sha256','retained_people',artifact_proof->'participants','attribution_actors',jsonb_build_array(artifact_build->'actor_id'));
  ELSE PERFORM public.uc_archive_error('DEPENDENCY_UNAVAILABLE');END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(files_value)f WHERE f.value->'object_id'=file_value->'object_id')THEN files_value:=files_value||jsonb_build_array(file_value);END IF;
 END LOOP;
 FOR event_row IN SELECT h.*FROM public.uc_document_registry_events h WHERE h.organization_id=p_org AND h.record_id=row_value.id ORDER BY h.revision LOOP
  PERFORM public.uc_document_registry_data(p_org,group_key,event_row.snapshot->'data',true);
 END LOOP;
 capture_value:=jsonb_build_object('record',to_jsonb(row_value),'history',history_value);
 IF p_exact AND((p_source->>'revision')::bigint<>row_value.revision OR p_source->>'state_hash'IS DISTINCT FROM public.uc_archive_hash(capture_value))THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 RETURN public.uc_archive_source_capture(p_org,p_scope,p_source,capture_value,actors,files_value,'Регистрация '||row_value.registration_id,history_value,'revision_stream',event_count);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;
CREATE FUNCTION public.uc_archive_journal_source(p_org uuid,p_scope jsonb,p_source jsonb,p_lock boolean DEFAULT false,p_exact boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE journal_row public.uc_custom_journals;capture_value jsonb;history_value jsonb;actors uuid[];event_count bigint;record_count bigint;BEGIN
 PERFORM public.uc_archive_source_shape(p_source,'custom_journal',ARRAY['kind','journal_id','revision','snapshot_hash'],'journal_id','snapshot_hash');
 -- A complete organization journal has no invented group/enrollment mapping.
 PERFORM public.uc_archive_scope(p_org,p_scope);
 IF p_scope->>'kind'<>'organization'OR NOT public.uc_custom_journal_allowed(p_org,false)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF p_lock THEN
  PERFORM public.uc_archive_fence(p_org,p_scope,'{}',true,NULL);
  LOCK TABLE public.uc_custom_journals,public.uc_custom_journal_schemas,public.uc_custom_journal_records,public.uc_custom_journal_history IN SHARE MODE NOWAIT;
 END IF;
 SELECT j.*INTO journal_row FROM public.uc_custom_journals j WHERE j.id=(p_source->>'journal_id')::uuid AND j.organization_id=p_org AND NOT j.redacted;
 IF journal_row.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 SELECT count(*)INTO record_count FROM public.uc_custom_journal_records x WHERE x.journal_id=journal_row.id AND x.organization_id=p_org;
 SELECT(SELECT count(*)FROM public.uc_custom_journal_schemas s WHERE s.journal_id=journal_row.id AND s.organization_id=p_org)+(SELECT count(*)FROM public.uc_custom_journal_history h WHERE h.journal_id=journal_row.id AND h.organization_id=p_org)INTO event_count;
 IF record_count>10000 OR event_count>100000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_custom_journal_records x WHERE x.journal_id=journal_row.id AND x.organization_id=p_org AND x.redacted)OR EXISTS(SELECT 1 FROM public.uc_custom_journal_schemas s WHERE s.journal_id=journal_row.id AND s.organization_id=p_org AND s.redacted)OR EXISTS(SELECT 1 FROM public.uc_custom_journal_history h WHERE h.journal_id=journal_row.id AND h.organization_id=p_org AND h.redacted)THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'sequence',e.sequence,'source_revision',NULL,'payload',e.payload)ORDER BY e.sequence),'[]'::jsonb),coalesce(array_agg(e.actor_id)FILTER(WHERE e.actor_id IS NOT NULL),'{}')INTO history_value,actors FROM(
  SELECT x.*,row_number()OVER(ORDER BY x.recorded_at,x.id) sequence FROM(
   SELECT s.id,s.created_at recorded_at,s.created_by actor_id,jsonb_build_object('kind','schema_revision','row',to_jsonb(s))payload FROM public.uc_custom_journal_schemas s WHERE s.journal_id=journal_row.id AND s.organization_id=p_org
   UNION ALL SELECT h.id,h.recorded_at,h.recorded_by,jsonb_build_object('kind','record_revision','row',to_jsonb(h))FROM public.uc_custom_journal_history h WHERE h.journal_id=journal_row.id AND h.organization_id=p_org
  )x
 )e;
 capture_value:=jsonb_build_object('journal',to_jsonb(journal_row),'records',coalesce((SELECT jsonb_agg(to_jsonb(x)ORDER BY x.id)FROM public.uc_custom_journal_records x WHERE x.journal_id=journal_row.id AND x.organization_id=p_org),'[]'::jsonb),'history',history_value);
 actors:=actors||array_remove(ARRAY[journal_row.created_by,journal_row.updated_by],NULL);
 IF p_exact AND((p_source->>'revision')::bigint<>journal_row.revision OR p_source->>'snapshot_hash'IS DISTINCT FROM public.uc_archive_hash(capture_value))THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 RETURN public.uc_archive_source_capture(p_org,p_scope,p_source,capture_value,actors,'[]'::jsonb,journal_row.title,history_value,CASE WHEN journal_row.legacy_id IS NULL THEN'revision_stream'ELSE'unverified_legacy'END,event_count);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;


-- UC024 fragment 32a_archive_scoped_journal.sql
-- UC024 exact UC021 scoped journal capture. Stored group context is required; a legacy organization journal is not a group journal.
CREATE FUNCTION public.uc_archive_scoped_journal_source(p_org uuid,p_scope jsonb,p_source jsonb,p_lock boolean DEFAULT false,p_exact boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE journal_row public.uc_custom_journals;context_row public.uc_scoped_journal_contexts;requested_context jsonb;stored_context jsonb;capture_value jsonb;history_value jsonb;actors uuid[];all_people uuid[];event_count bigint;record_count bigint;export_count bigint;group_key uuid;export_row public.uc_scoped_journal_exports;BEGIN
 PERFORM public.uc_archive_source_shape(p_source,'scoped_journal',ARRAY['kind','journal_id','revision','snapshot_hash'],'journal_id','snapshot_hash');
 group_key:=public.uc_archive_scope(p_org,p_scope);
 -- A whole journal may contain several learners. An individual enrollment never receives an inferred subset.
 IF p_scope->>'kind'='enrollment'THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 SELECT c.*INTO context_row FROM public.uc_scoped_journal_contexts c WHERE c.journal_id=(p_source->>'journal_id')::uuid AND c.organization_id=p_org;
 IF context_row.journal_id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 IF group_key IS NOT NULL AND(context_row.kind IS DISTINCT FROM'group'OR context_row.group_id IS DISTINCT FROM group_key)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 requested_context:=CASE WHEN context_row.kind='group'THEN jsonb_build_object('kind','group','group_id',context_row.group_id)ELSE jsonb_build_object('kind','organization')END;
 PERFORM public.read_scoped_custom_journals(p_org,requested_context,jsonb_build_object('kind','journal','journal_id',context_row.journal_id));
 IF p_lock THEN
  PERFORM public.uc_archive_fence(p_org,p_scope,'{}',true,NULL);
  LOCK TABLE public.uc_custom_journals,public.uc_custom_journal_schemas,public.uc_scoped_journal_contexts,public.uc_scoped_journal_records,public.uc_scoped_journal_history,public.uc_scoped_journal_exports IN SHARE MODE NOWAIT;
 END IF;
 SELECT c.*INTO context_row FROM public.uc_scoped_journal_contexts c WHERE c.journal_id=(p_source->>'journal_id')::uuid AND c.organization_id=p_org;
 IF context_row.journal_id IS NULL OR NOT public.uc_scoped_journal_matches(p_org,requested_context,context_row.journal_id)OR(group_key IS NOT NULL AND context_row.group_id IS DISTINCT FROM group_key)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 SELECT j.*INTO journal_row FROM public.uc_custom_journals j WHERE j.id=context_row.journal_id AND j.organization_id=p_org AND NOT j.redacted;
 IF journal_row.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 stored_context:=public.uc_scoped_journal_context_json(journal_row.id);
 SELECT count(*)INTO record_count FROM public.uc_scoped_journal_records r WHERE r.organization_id=p_org AND r.journal_id=journal_row.id;
 SELECT count(*)INTO export_count FROM public.uc_scoped_journal_exports e WHERE e.organization_id=p_org AND e.journal_id=journal_row.id;
 SELECT(SELECT count(*)FROM public.uc_custom_journal_schemas s WHERE s.organization_id=p_org AND s.journal_id=journal_row.id)+(SELECT count(*)FROM public.uc_scoped_journal_history h WHERE h.organization_id=p_org AND h.journal_id=journal_row.id)+export_count INTO event_count;
 IF record_count>10000 OR event_count>100000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_custom_journal_schemas s WHERE s.organization_id=p_org AND s.journal_id=journal_row.id AND s.redacted)OR EXISTS(SELECT 1 FROM public.uc_scoped_journal_records r WHERE r.organization_id=p_org AND r.journal_id=journal_row.id AND r.redacted)OR EXISTS(SELECT 1 FROM public.uc_scoped_journal_history h WHERE h.organization_id=p_org AND h.journal_id=journal_row.id AND h.redacted)OR EXISTS(SELECT 1 FROM public.uc_scoped_journal_exports e WHERE e.organization_id=p_org AND e.journal_id=journal_row.id AND e.redacted)THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 -- Every saved record has a complete contiguous immutable record history and a real schema.
 IF EXISTS(SELECT 1 FROM public.uc_scoped_journal_records r WHERE r.organization_id=p_org AND r.journal_id=journal_row.id AND((SELECT count(*)FROM public.uc_scoped_journal_history h WHERE h.record_id=r.id AND h.organization_id=p_org)<>r.revision OR EXISTS(SELECT 1 FROM public.uc_scoped_journal_history h WHERE h.record_id=r.id AND h.organization_id=p_org AND(h.revision<1 OR h.revision>r.revision))OR NOT EXISTS(SELECT 1 FROM public.uc_custom_journal_schemas s WHERE s.id=r.schema_version_id AND s.journal_id=r.journal_id AND s.organization_id=p_org)))THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
 FOR export_row IN SELECT e.*FROM public.uc_scoped_journal_exports e WHERE e.organization_id=p_org AND e.journal_id=journal_row.id LOOP
  PERFORM public.uc_scoped_journal_export_json(export_row.id,true);
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'sequence',e.sequence,'source_revision',NULL,'payload',e.payload)ORDER BY e.sequence),'[]'::jsonb),coalesce(array_agg(e.actor_id)FILTER(WHERE e.actor_id IS NOT NULL),'{}')INTO history_value,actors FROM(
  SELECT x.*,row_number()OVER(ORDER BY x.recorded_at,x.id)sequence FROM(
   SELECT s.id,s.created_at recorded_at,s.created_by actor_id,jsonb_build_object('kind','schema_revision','row',to_jsonb(s))payload FROM public.uc_custom_journal_schemas s WHERE s.organization_id=p_org AND s.journal_id=journal_row.id
   UNION ALL SELECT h.id,h.recorded_at,h.recorded_by,jsonb_build_object('kind','record_revision','row',to_jsonb(h))FROM public.uc_scoped_journal_history h WHERE h.organization_id=p_org AND h.journal_id=journal_row.id
   UNION ALL SELECT e.id,e.recorded_at,e.recorded_by,jsonb_build_object('kind','captured_export','row',to_jsonb(e))FROM public.uc_scoped_journal_exports e WHERE e.organization_id=p_org AND e.journal_id=journal_row.id
  )x
 )e;
 actors:=actors||array_remove(ARRAY[journal_row.created_by,journal_row.updated_by,context_row.created_by],NULL);
 capture_value:=jsonb_build_object('journal',to_jsonb(journal_row),'context',stored_context,'records',coalesce((SELECT jsonb_agg(to_jsonb(r)ORDER BY r.id)FROM public.uc_scoped_journal_records r WHERE r.organization_id=p_org AND r.journal_id=journal_row.id),'[]'::jsonb),'history',history_value);
 all_people:=public.uc_archive_json_people(capture_value)||public.uc_scoped_journal_people(journal_row.id);
 PERFORM public.uc_scoped_journal_read_fence(p_org,stored_context,all_people);
 -- Stored session/outcome references remain historical recorded facts. They do not assert that an old session is the current version.
 IF p_exact AND((p_source->>'revision')::bigint<>journal_row.revision OR p_source->>'snapshot_hash'IS DISTINCT FROM public.uc_archive_hash(capture_value))THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 PERFORM public.read_scoped_custom_journals(p_org,requested_context,jsonb_build_object('kind','journal','journal_id',journal_row.id));
 RETURN public.uc_archive_source_capture(p_org,p_scope,p_source,capture_value,actors,'[]'::jsonb,journal_row.title,history_value,CASE WHEN journal_row.legacy_id IS NULL THEN'revision_stream'ELSE'unverified_legacy'END,event_count);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;


-- UC024 fragment 33_archive_group_document_source.sql
-- UC024 legacy group-document adapter. Unknown pre-observation history is retained explicitly.
CREATE FUNCTION public.uc_archive_group_document_source(p_org uuid,p_scope jsonb,p_source jsonb,p_lock boolean DEFAULT false,p_exact boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE document_row public.group_documents;capture_value jsonb;group_key uuid;result_value jsonb;BEGIN
 PERFORM public.uc_archive_source_shape(p_source,'group_document',ARRAY['kind','document_id','revision','snapshot_hash'],'document_id','snapshot_hash');
 group_key:=public.uc_archive_scope(p_org,p_scope);
 SELECT d.*INTO document_row FROM public.group_documents d WHERE d.id=(p_source->>'document_id')::uuid AND d.organization_id=p_org;
 IF document_row.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 IF(group_key IS NOT NULL AND group_key IS DISTINCT FROM document_row.group_id)OR p_scope->>'kind'='enrollment'OR NOT public.uc_document_action_allowed(p_org,'read',document_row.group_id,document_row.student_user_id)OR NOT public.uc_document_scope_allowed(p_org,document_row.group_id,document_row.student_user_id)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF p_lock THEN
  PERFORM public.uc_archive_fence(p_org,p_scope,public.uc_archive_json_people(to_jsonb(document_row)),true,NULL);
  SELECT d.*INTO document_row FROM public.group_documents d WHERE d.id=document_row.id AND d.organization_id=p_org FOR SHARE NOWAIT;
 END IF;
 IF(group_key IS NOT NULL AND group_key IS DISTINCT FROM document_row.group_id)OR p_scope->>'kind'='enrollment'OR NOT public.uc_document_action_allowed(p_org,'read',document_row.group_id,document_row.student_user_id)OR NOT public.uc_document_scope_allowed(p_org,document_row.group_id,document_row.student_user_id)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 capture_value:=jsonb_build_object('document',to_jsonb(document_row)-'file_path','legacy_file_present',nullif(document_row.file_path,'')IS NOT NULL,'legacy_file_locator_hash',public.uc_archive_hash(to_jsonb(document_row.file_path)),'history_coverage','not_versioned_before_archive_capture');
 IF p_exact AND((p_source->>'revision')::bigint<>coalesce(document_row.package_version,0)OR p_source->>'snapshot_hash'IS DISTINCT FROM public.uc_archive_hash(capture_value))THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 result_value:=public.uc_archive_source_capture(p_org,p_scope,p_source,capture_value,array_remove(ARRAY[document_row.created_by],NULL),'[]'::jsonb,document_row.name,'[]'::jsonb,'unverified_legacy',0);
 -- A caller-controlled legacy path is never promoted into a trusted Storage object reference.
 RETURN result_value||jsonb_build_object('source_blockers',CASE WHEN nullif(document_row.file_path,'')IS NOT NULL THEN jsonb_build_array('PACKAGE_INCOMPLETE','SOURCE_UNAVAILABLE')ELSE jsonb_build_array('PACKAGE_INCOMPLETE')END);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;


-- UC024 fragment 34_archive_admission_source.sql
-- UC024 admission capture uses the existing staff boundary for every exact historical evidence object.
CREATE FUNCTION public.uc_archive_admission_source(p_org uuid,p_scope jsonb,p_source jsonb,p_lock boolean DEFAULT false,p_exact boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE case_row public.uc_admission_cases;ev public.uc_admission_case_evidence;capture_value jsonb;history_value jsonb;files_value jsonb:='[]';actors uuid[];permission_value jsonb;event_count bigint;group_key uuid;BEGIN
 PERFORM public.uc_archive_source_shape(p_source,'admission_case',ARRAY['kind','case_id','revision','state_hash'],'case_id','state_hash');
 group_key:=public.uc_archive_scope(p_org,p_scope);
 SELECT c.*INTO case_row FROM public.uc_admission_cases c WHERE c.id=(p_source->>'case_id')::uuid AND c.organization_id=p_org;
 IF case_row.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 IF(group_key IS NOT NULL AND group_key IS DISTINCT FROM case_row.group_id)OR(p_scope->>'kind'='enrollment'AND((p_scope->>'enrollment_id')::uuid IS DISTINCT FROM case_row.enrollment_id OR(p_scope->>'user_id')::uuid IS DISTINCT FROM case_row.user_id))OR NOT public.uc_admission_staff_allowed(auth.uid(),p_org,case_row.user_id,case_row.group_id,case_row.enrollment_id,false)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF p_lock THEN
  PERFORM public.uc_archive_fence(p_org,p_scope,ARRAY[case_row.user_id],true,NULL);
  LOCK TABLE public.uc_admission_cases,public.uc_admission_case_events,public.uc_admission_rule_sets,public.uc_admission_case_evidence,public.uc_admission_evidence_reservations IN SHARE MODE NOWAIT;
  SELECT c.*INTO case_row FROM public.uc_admission_cases c WHERE c.id=case_row.id AND c.organization_id=p_org;
 END IF;
 IF(group_key IS NOT NULL AND group_key IS DISTINCT FROM case_row.group_id)OR(p_scope->>'kind'='enrollment'AND((p_scope->>'enrollment_id')::uuid IS DISTINCT FROM case_row.enrollment_id OR(p_scope->>'user_id')::uuid IS DISTINCT FROM case_row.user_id))OR NOT public.uc_admission_staff_allowed(auth.uid(),p_org,case_row.user_id,case_row.group_id,case_row.enrollment_id,false)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 SELECT count(*)INTO event_count FROM public.uc_admission_case_events h WHERE h.case_id=case_row.id AND h.organization_id=p_org;
 IF event_count>100000 OR(SELECT count(*)FROM public.uc_admission_case_evidence x WHERE x.case_id=case_row.id AND x.organization_id=p_org)>10000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
 IF event_count<>case_row.revision OR EXISTS(SELECT 1 FROM public.uc_admission_case_events h WHERE h.case_id=case_row.id AND h.organization_id=p_org AND(h.authority_redacted OR h.case_revision<1 OR h.case_revision>case_row.revision))OR EXISTS(SELECT 1 FROM public.uc_admission_rule_sets x WHERE x.case_id=case_row.id AND x.organization_id=p_org AND x.authority_redacted)OR EXISTS(SELECT 1 FROM public.uc_admission_case_evidence x WHERE x.case_id=case_row.id AND x.organization_id=p_org AND x.source_redacted)THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
 IF p_exact AND EXISTS(SELECT 1 FROM public.uc_admission_evidence_reservations x WHERE x.case_id=case_row.id AND x.organization_id=p_org AND x.state IN('prepared','sealed')AND x.expires_at>clock_timestamp())THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'sequence',h.case_revision,'source_revision',h.case_revision,'payload',to_jsonb(h))ORDER BY h.case_revision),'[]'::jsonb),coalesce(array_agg(h.actor_id)FILTER(WHERE h.actor_id IS NOT NULL),'{}')INTO history_value,actors FROM public.uc_admission_case_events h WHERE h.case_id=case_row.id AND h.organization_id=p_org;
 actors:=actors||array_remove(ARRAY[case_row.responsible_id],NULL)||ARRAY(SELECT x.reviewer_id FROM public.uc_admission_rule_sets x WHERE x.case_id=case_row.id AND x.organization_id=p_org AND x.reviewer_id IS NOT NULL);
 IF NOT EXISTS(SELECT 1 FROM storage.buckets b WHERE b.id='admission-case-evidence'AND NOT b.public)THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 FOR ev IN SELECT x.*FROM public.uc_admission_case_evidence x WHERE x.case_id=case_row.id AND x.organization_id=p_org ORDER BY x.id LOOP
  permission_value:=public.uc_admission_evidence_dto(ev.id,auth.uid());
  IF permission_value->>'availability'IS DISTINCT FROM'available'OR permission_value->'can_read_bytes'IS DISTINCT FROM'true'::jsonb THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
  files_value:=files_value||jsonb_build_array(jsonb_build_object('bucket','admission-case-evidence','path',ev.sealed_path,'object_id',ev.storage_object_id,'object_updated_at',ev.object_updated_at,'byte_size',ev.byte_size,'mime_type',ev.mime_type,'known_sha256',ev.byte_sha256));actors:=actors||array_remove(ARRAY[ev.captured_by],NULL);
 END LOOP;
 capture_value:=jsonb_build_object('case',to_jsonb(case_row),'history',history_value,'rule_sets',coalesce((SELECT jsonb_agg(to_jsonb(x)ORDER BY x.recorded_at,x.id)FROM public.uc_admission_rule_sets x WHERE x.case_id=case_row.id AND x.organization_id=p_org),'[]'::jsonb),'evidence',coalesce((SELECT jsonb_agg(to_jsonb(x)-'sealed_path'ORDER BY x.id)FROM public.uc_admission_case_evidence x WHERE x.case_id=case_row.id AND x.organization_id=p_org),'[]'::jsonb));
 IF p_exact AND((p_source->>'revision')::bigint<>case_row.revision OR p_source->>'state_hash'IS DISTINCT FROM public.uc_archive_hash(capture_value))THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 RETURN public.uc_archive_source_capture(p_org,p_scope,p_source,capture_value,actors,files_value,'Личное дело поступления',history_value,'revision_stream',event_count);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;


-- UC024 fragment 35_archive_education_source.sql
-- UC024 controlled issuance capture. Historical file references stay exact; no reissue or number allocation.
CREATE FUNCTION public.uc_archive_org_files(p_org uuid,p_value jsonb,p_lock boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE ref_value jsonb;proof_value jsonb;file_value jsonb;result_value jsonb:='[]';BEGIN
 IF octet_length(p_value::text)>4194304 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
 FOR ref_value IN WITH RECURSIVE nodes(value)AS(SELECT p_value UNION ALL SELECT e.value FROM nodes n CROSS JOIN LATERAL(SELECT a.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array'THEN n.value ELSE'[]'::jsonb END)a UNION ALL SELECT o.value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object'THEN n.value ELSE'{}'::jsonb END)o)e)SELECT DISTINCT n.value FROM nodes n WHERE n.value->>'kind'='org_document_version' LOOP
  proof_value:=public.uc_archive_org_version(p_org,jsonb_set(ref_value,'{kind}','"organization_document_version"'::jsonb),false,p_lock);file_value:=proof_value->'private_file';
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result_value)f WHERE f.value->'object_id'=file_value->'object_id')THEN result_value:=result_value||jsonb_build_array(file_value);END IF;
  IF jsonb_array_length(result_value)>10000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
 END LOOP;
 RETURN result_value;
END;$archive$;
CREATE FUNCTION public.uc_archive_education_source(p_org uuid,p_scope jsonb,p_source jsonb,p_lock boolean DEFAULT false,p_exact boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE record_row public.education_document_records;state_row public.uc_education_issuance_states;event_row public.uc_education_issuance_events;group_key uuid;current_value jsonb;artifact_value jsonb;history_value jsonb;capture_value jsonb;files_value jsonb;actors uuid[];event_count bigint;BEGIN
 PERFORM public.uc_archive_source_shape(p_source,'education_document',ARRAY['kind','record_id','state_hash','artifact_id','byte_sha256'],'record_id','state_hash');
 IF NOT public.uc_custom_journal_uuid(p_source->'artifact_id')OR coalesce(p_source->>'byte_sha256','')!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 group_key:=public.uc_archive_scope(p_org,p_scope);
 current_value:=public.uc_education_issue_record(p_org,group_key,(p_source->>'record_id')::uuid);
 IF current_value IS NULL THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF p_scope->>'kind'='enrollment'AND(current_value->'official'->>'enrollment_id'IS DISTINCT FROM p_scope->>'enrollment_id'OR current_value->'official'->>'user_id'IS DISTINCT FROM p_scope->>'user_id')THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF p_lock THEN
  PERFORM public.uc_archive_fence(p_org,p_scope,public.uc_archive_json_people(current_value),true,NULL);
  LOCK TABLE public.education_document_records,public.uc_education_issuance_states,public.uc_education_issuance_events IN SHARE MODE NOWAIT;
  current_value:=public.uc_education_issue_record(p_org,group_key,(p_source->>'record_id')::uuid);
 END IF;
 IF current_value IS NULL OR(p_scope->>'kind'='enrollment'AND(current_value->'official'->>'enrollment_id'IS DISTINCT FROM p_scope->>'enrollment_id'OR current_value->'official'->>'user_id'IS DISTINCT FROM p_scope->>'user_id'))THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF current_value->>'provenance'IS DISTINCT FROM'controlled_issuance'OR current_value->>'proof_availability'IS DISTINCT FROM'captured'OR current_value->'artifact'->>'availability'IS DISTINCT FROM'available'THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 artifact_value:=current_value->'artifact'->'artifact';
 -- archive artifact_id is the exact UC019 preparation item_id; it is not a fabricated Storage version id.
 IF p_exact AND(current_value->>'state_hash'IS DISTINCT FROM p_source->>'state_hash'OR artifact_value->>'item_id'IS DISTINCT FROM p_source->>'artifact_id'OR artifact_value->>'byte_sha256'IS DISTINCT FROM p_source->>'byte_sha256')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 SELECT r.*INTO record_row FROM public.education_document_records r WHERE r.id=(p_source->>'record_id')::uuid AND r.organization_id=p_org AND r.deleted_at IS NULL;
 SELECT s.*INTO state_row FROM public.uc_education_issuance_states s WHERE s.record_id=record_row.id AND s.organization_id=p_org AND NOT s.redacted;
 IF record_row.id IS NULL OR state_row.record_id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 SELECT count(*)INTO event_count FROM public.uc_education_issuance_events h WHERE h.record_id=record_row.id AND h.organization_id=p_org;
 IF event_count>100000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
 IF event_count<>state_row.revision OR EXISTS(SELECT 1 FROM public.uc_education_issuance_events h WHERE h.record_id=record_row.id AND h.organization_id=p_org AND(h.redacted OR h.revision<1 OR h.revision>state_row.revision))THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
 FOR event_row IN SELECT h.*FROM public.uc_education_issuance_events h WHERE h.record_id=record_row.id AND h.organization_id=p_org ORDER BY h.revision LOOP
  IF event_row.payload?'proof'AND NOT public.uc_education_issue_proof_visible(event_row.payload->'proof')THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'sequence',h.revision,'source_revision',h.revision,'payload',to_jsonb(h))ORDER BY h.revision),'[]'::jsonb),coalesce(array_agg(h.actor_id)FILTER(WHERE h.actor_id IS NOT NULL),'{}')INTO history_value,actors FROM public.uc_education_issuance_events h WHERE h.record_id=record_row.id AND h.organization_id=p_org;
 actors:=actors||array_remove(ARRAY[state_row.recorded_by,state_row.updated_by],NULL);
 capture_value:=jsonb_build_object('official',to_jsonb(record_row),'state',to_jsonb(state_row),'history',history_value);
 files_value:=public.uc_archive_org_files(p_org,capture_value,p_lock);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(files_value)f WHERE f.value->>'object_id'=(SELECT v.storage_object_id::text FROM public.org_document_versions v WHERE v.id=(artifact_value->'source'->>'version_id')::uuid AND v.organization_id=p_org))THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 RETURN public.uc_archive_source_capture(p_org,p_scope,p_source,capture_value,actors,files_value,'Учебный документ '||record_row.document_number,history_value,'revision_stream',event_count);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;


-- UC024 fragment 36_archive_frdo_source.sql
-- UC024 FRDO adapter. Source dependency is explicit; no grant or stand-in is installed for an absent module.
CREATE FUNCTION public.uc_archive_frdo_source(p_org uuid,p_scope jsonb,p_source jsonb,p_lock boolean DEFAULT false,p_exact boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE packet_value jsonb;capture_value jsonb;history_value jsonb;build_value jsonb;build_access jsonb;files_value jsonb:='[]';file_value jsonb;actors uuid[];event_count bigint;group_key uuid;BEGIN
 PERFORM public.uc_archive_source_shape(p_source,'frdo_packet',ARRAY['kind','packet_id','revision','state_hash'],'packet_id','state_hash');
 IF to_regprocedure('public.uc_frdo_packet_access(uuid,boolean)')IS NULL OR to_regprocedure('public.uc_frdo_artifact_access(uuid,jsonb,boolean,boolean)')IS NULL OR to_regclass('public.uc_frdo_packet_events')IS NULL THEN PERFORM public.uc_archive_error('DEPENDENCY_UNAVAILABLE');END IF;
 group_key:=public.uc_archive_scope(p_org,p_scope);
 SELECT to_jsonb(public.uc_frdo_packet_access((p_source->>'packet_id')::uuid,false))-'cursor_secret'INTO packet_value;
 IF packet_value->>'organization_id'IS DISTINCT FROM p_org::text OR(group_key IS NOT NULL AND packet_value->'scope'IS DISTINCT FROM jsonb_build_object('kind','group','group_id',group_key))THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF p_scope->>'kind'='enrollment'AND EXISTS(SELECT 1 FROM public.uc_frdo_packet_subjects s WHERE s.packet_id=(p_source->>'packet_id')::uuid AND(s.enrollment_id IS DISTINCT FROM(p_scope->>'enrollment_id')::uuid OR s.user_id IS DISTINCT FROM(p_scope->>'user_id')::uuid))THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF p_lock THEN
  PERFORM public.uc_archive_fence(p_org,p_scope,public.uc_archive_people(packet_value->'retained_people'),true,NULL);
  LOCK TABLE public.uc_frdo_packets,public.uc_frdo_packet_subjects,public.uc_frdo_packet_events,public.uc_frdo_packet_artifact_builds IN SHARE MODE NOWAIT;
  SELECT to_jsonb(public.uc_frdo_packet_access((p_source->>'packet_id')::uuid,false))-'cursor_secret'INTO packet_value;
 END IF;
 IF packet_value->>'organization_id'IS DISTINCT FROM p_org::text OR(group_key IS NOT NULL AND packet_value->'scope'IS DISTINCT FROM jsonb_build_object('kind','group','group_id',group_key))OR(p_scope->>'kind'='enrollment'AND EXISTS(SELECT 1 FROM public.uc_frdo_packet_subjects s WHERE s.packet_id=(p_source->>'packet_id')::uuid AND(s.enrollment_id IS DISTINCT FROM(p_scope->>'enrollment_id')::uuid OR s.user_id IS DISTINCT FROM(p_scope->>'user_id')::uuid)))THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF p_exact AND(packet_value->'revision'IS DISTINCT FROM p_source->'revision'OR packet_value->>'state_hash'IS DISTINCT FROM p_source->>'state_hash')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 SELECT count(*)INTO event_count FROM public.uc_frdo_packet_events h WHERE h.organization_id=p_org AND h.packet_id=(p_source->>'packet_id')::uuid;
 IF event_count>100000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
 IF event_count<>(packet_value->>'revision')::bigint OR EXISTS(SELECT 1 FROM public.uc_frdo_packet_events h WHERE h.organization_id=p_org AND h.packet_id=(p_source->>'packet_id')::uuid AND(h.revision<1 OR h.revision>(packet_value->>'revision')::bigint))THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_frdo_packet_artifact_builds b WHERE b.organization_id=p_org AND b.packet_id=(p_source->>'packet_id')::uuid AND b.phase IN('queued','generating'))THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'sequence',h.revision,'source_revision',h.revision,'payload',to_jsonb(h))ORDER BY h.revision),'[]'::jsonb),coalesce(array_agg(h.actor_id)FILTER(WHERE h.actor_id IS NOT NULL),'{}')INTO history_value,actors FROM public.uc_frdo_packet_events h WHERE h.organization_id=p_org AND h.packet_id=(p_source->>'packet_id')::uuid;
 capture_value:=jsonb_build_object('packet',packet_value,'subjects',coalesce((SELECT jsonb_agg(to_jsonb(s)ORDER BY s.record_id)FROM public.uc_frdo_packet_subjects s WHERE s.organization_id=p_org AND s.packet_id=(p_source->>'packet_id')::uuid),'[]'::jsonb),'history',history_value,'artifact_builds',coalesce((SELECT jsonb_agg(public.uc_frdo_artifact_json(b)ORDER BY b.id)FROM public.uc_frdo_packet_artifact_builds b WHERE b.organization_id=p_org AND b.packet_id=(p_source->>'packet_id')::uuid),'[]'::jsonb));
 files_value:=public.uc_archive_org_files(p_org,capture_value,p_lock);
 FOR build_value IN SELECT to_jsonb(b)FROM public.uc_frdo_packet_artifact_builds b WHERE b.organization_id=p_org AND b.packet_id=(p_source->>'packet_id')::uuid AND b.phase='sealed'ORDER BY b.id LOOP
  SELECT to_jsonb(public.uc_frdo_artifact_access((p_source->>'packet_id')::uuid,build_value->'artifact_ref',false,p_lock))INTO build_access;
  IF build_access->>'id'IS DISTINCT FROM build_value->>'id'OR build_access->>'byte_sha256'IS DISTINCT FROM build_access->>'readback_sha256'OR NOT EXISTS(SELECT 1 FROM storage.buckets sb WHERE sb.id=build_access->>'bucket_id'AND NOT sb.public)THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
  file_value:=jsonb_build_object('bucket',build_access->'bucket_id','path',build_access->'object_path','object_id',build_access->'object_id','object_updated_at',build_access->'object_updated_at','byte_size',build_access->'byte_size','mime_type',build_access->'mime','known_sha256',build_access->'byte_sha256');
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(files_value)f WHERE f.value->'object_id'=file_value->'object_id')THEN files_value:=files_value||jsonb_build_array(file_value);END IF;
 END LOOP;
 RETURN public.uc_archive_source_capture(p_org,p_scope,p_source,capture_value,actors,files_value,'Пакет ФРДО',history_value,'revision_stream',event_count);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;


-- UC024 fragment 37_archive_signature_source.sql
-- UC024 source capture through UC022 current-scope projections and the protected binary facade.
-- No bearer token, raw wider manifest, service Storage locator or private binary fallback is exported.
CREATE FUNCTION public.uc_archive_signature_file(p_org uuid,p_signature uuid,p_party text,p_binding uuid,p_document jsonb,p_disclosure jsonb,p_file_id uuid,p_scan_revision bigint DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE file_value jsonb;request_value jsonb;BEGIN
 IF p_disclosure IS NULL OR p_disclosure='null'::jsonb THEN RETURN NULL;END IF;
 IF p_disclosure->>'visibility'IS DISTINCT FROM'available'OR jsonb_typeof(p_disclosure->'value')IS DISTINCT FROM'object'THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 file_value:=p_disclosure->'value';
 IF NOT public.uc_signature_assurance_shape(file_value,ARRAY['bucket','path','sha256','bytes','mime'])OR NOT public.uc_signature_assurance_sha(file_value->'sha256')OR NOT public.uc_signature_assurance_integer(file_value->'bytes',1,20971520)OR NOT public.uc_signature_assurance_text(file_value->'mime',120)OR p_binding IS NULL OR p_file_id IS NULL OR p_party NOT IN('sender','recipient')OR NOT public.uc_signature_assurance_sha(p_document->'html_sha256')THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 request_value:=jsonb_build_object('version',1,'action','read_file','address',jsonb_build_object('kind','authenticated_signature','organization_id',p_org,'signature_id',p_signature,'chosen_party',p_party),'file_kind',CASE WHEN p_scan_revision IS NULL THEN'source'ELSE'scan'END,'binding_id',p_binding,'event_revision',p_scan_revision,'expected_document_revision_id',p_document->'document_revision_id','document_html_sha256',p_document->'html_sha256');
 -- Logical source identity is separate from the new generated archive file identity.
 -- The worker MUST call signature-protected-file with its original caller JWT.
 RETURN jsonb_build_object('kind','signature_protected_v1','logical_file_id',p_file_id,'protected_request',request_value,'byte_size',(file_value->>'bytes')::bigint,'known_sha256',file_value->>'sha256','mime_type',file_value->>'mime');
END;$archive$;
CREATE FUNCTION public.uc_archive_signature_source(p_org uuid,p_scope jsonb,p_source jsonb,p_lock boolean DEFAULT false,p_exact boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE signature_row public.document_signatures;stream_row public.uc_signature_assurance_streams;binding_row public.uc_signature_assurance_bindings;document_row public.uc_signature_assurance_document_snapshots;event_row public.uc_signature_assurance_events;group_key uuid;education_value jsonb;context_value jsonb;capture_value jsonb;documents_value jsonb:='[]';bindings_value jsonb:='[]';history_value jsonb:='[]';policies_value jsonb:='[]';agreements_value jsonb:='[]';consents_value jsonb:='[]';decision_history jsonb;decision_projection jsonb;decision_row public.uc_signature_assurance_policy_decisions;reference_key uuid;files_value jsonb:='[]';blockers_value jsonb:='[]';projection_value jsonb;document_value jsonb;file_value jsonb;policy_key uuid;actors uuid[]:='{}';count_value bigint;coverage_kind text:='revision_stream';BEGIN
 PERFORM public.uc_archive_source_shape(p_source,'signature_evidence',ARRAY['kind','signature_id','revision','state_hash'],'signature_id','state_hash');
 group_key:=public.uc_archive_scope(p_org,p_scope);
 signature_row:=public.uc_signature_assurance_signature_fence(p_org,(p_source->>'signature_id')::uuid,false,NULL);
 IF signature_row.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 -- Signature rows have no general group relation. Only a genuine immutable issued-record link supports narrower scope.
 IF group_key IS NOT NULL THEN
  IF signature_row.document_type IS DISTINCT FROM'education_document'THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
  education_value:=public.uc_education_issue_record(p_org,group_key,signature_row.document_id);
  IF education_value IS NULL OR education_value->'official'->>'group_id'IS DISTINCT FROM group_key::text OR(p_scope->>'kind'='enrollment'AND(education_value->'official'->>'enrollment_id'IS DISTINCT FROM p_scope->>'enrollment_id'OR education_value->'official'->>'user_id'IS DISTINCT FROM p_scope->>'user_id'))THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 END IF;
 IF p_lock THEN
  PERFORM public.uc_archive_fence(p_org,p_scope,'{}',true,NULL);
  LOCK TABLE public.document_signatures,public.signature_revisions,public.uc_signature_assurance_streams,public.uc_signature_assurance_bindings,public.uc_signature_assurance_document_snapshots,public.uc_signature_assurance_events,public.uc_signature_assurance_participants IN SHARE MODE NOWAIT;
  signature_row:=public.uc_signature_assurance_signature_fence(p_org,signature_row.id,false,NULL);
  IF group_key IS NOT NULL THEN
   education_value:=public.uc_education_issue_record(p_org,group_key,signature_row.document_id);
   IF signature_row.document_type IS DISTINCT FROM'education_document'OR education_value IS NULL OR education_value->'official'->>'group_id'IS DISTINCT FROM group_key::text OR(p_scope->>'kind'='enrollment'AND(education_value->'official'->>'enrollment_id'IS DISTINCT FROM p_scope->>'enrollment_id'OR education_value->'official'->>'user_id'IS DISTINCT FROM p_scope->>'user_id'))THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
  END IF;
 END IF;
 context_value:=public.read_signature_assurance(p_org,jsonb_build_object('kind','signature','signature_id',signature_row.id,'party_role','sender'))#>'{result,context}';
 SELECT h.*INTO stream_row FROM public.uc_signature_assurance_streams h WHERE h.organization_id=p_org AND h.id=signature_row.id AND h.kind='signature'AND h.entity_id=signature_row.id;
 SELECT count(*)INTO count_value FROM public.uc_signature_assurance_events h WHERE h.organization_id=p_org AND h.signature_id=signature_row.id AND h.stream_kind='signature';
 IF count_value>100000 OR(SELECT count(*)FROM public.uc_signature_assurance_bindings b WHERE b.organization_id=p_org AND b.signature_id=signature_row.id)>10000 OR(SELECT count(*)FROM public.uc_signature_assurance_document_snapshots d WHERE d.organization_id=p_org AND d.signature_id=signature_row.id)>10000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
 IF count_value<>coalesce(stream_row.revision,0)THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
 FOR document_row IN SELECT d.*FROM public.uc_signature_assurance_document_snapshots d WHERE d.organization_id=p_org AND d.signature_id=signature_row.id ORDER BY d.id LOOP
  projection_value:=public.uc_signature_assurance_project_document(p_org,signature_row.id,document_row.id);
  IF projection_value->>'content_visibility'IS DISTINCT FROM'available'THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
  documents_value:=documents_value||jsonb_build_array(projection_value);
 END LOOP;
 FOR binding_row IN SELECT b.*FROM public.uc_signature_assurance_bindings b WHERE b.organization_id=p_org AND b.signature_id=signature_row.id ORDER BY b.party_role,b.revision LOOP
  projection_value:=public.uc_signature_assurance_project_binding(p_org,signature_row.id,binding_row.id);bindings_value:=bindings_value||jsonb_build_array(projection_value);
  SELECT d.value INTO document_value FROM jsonb_array_elements(documents_value)d WHERE d.value->>'id'=binding_row.document_snapshot_id::text;
  IF document_value IS NULL THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
  file_value:=public.uc_archive_signature_file(p_org,signature_row.id,binding_row.party_role,binding_row.id,document_value,projection_value->'original_file',binding_row.document_snapshot_id,NULL);
  IF file_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(files_value)f WHERE f.value->'logical_file_id'=file_value->'logical_file_id')THEN files_value:=files_value||jsonb_build_array(file_value);END IF;
  actors:=actors||array_remove(ARRAY[binding_row.bound_by],NULL);
 END LOOP;
 FOR event_row IN SELECT h.*FROM public.uc_signature_assurance_events h WHERE h.organization_id=p_org AND h.signature_id=signature_row.id AND h.stream_kind='signature'ORDER BY h.revision LOOP
  IF event_row.revision<>jsonb_array_length(history_value)+1 THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
  projection_value:=public.uc_signature_assurance_project_signature_event(p_org,signature_row.id,event_row.id);
  history_value:=history_value||jsonb_build_array(jsonb_build_object('id',event_row.id,'sequence',event_row.revision,'source_revision',event_row.revision,'payload',projection_value));actors:=actors||array_remove(ARRAY[event_row.actor_user_id],NULL);
  IF event_row.kind='scan_received'THEN
   SELECT d.value INTO document_value FROM jsonb_array_elements(documents_value)d WHERE d.value->>'id'=event_row.document_snapshot_id::text;
   IF document_value IS NULL OR event_row.binding_id IS NULL THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
   file_value:=public.uc_archive_signature_file(p_org,signature_row.id,event_row.party_role,event_row.binding_id,document_value,projection_value->'scan_file',event_row.id,event_row.revision);
   IF file_value IS NULL THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;files_value:=files_value||jsonb_build_array(file_value);
  END IF;
 END LOOP;
 FOR reference_key IN SELECT DISTINCT h.agreement_event_id FROM public.uc_signature_assurance_events h WHERE h.organization_id=p_org AND h.signature_id=signature_row.id AND h.agreement_event_id IS NOT NULL LOOP
  agreements_value:=agreements_value||jsonb_build_array(public.uc_signature_assurance_project_agreement(p_org,reference_key));
 END LOOP;
 FOR reference_key IN SELECT DISTINCT h.consent_snapshot_id FROM public.uc_signature_assurance_events h WHERE h.organization_id=p_org AND h.signature_id=signature_row.id AND h.consent_snapshot_id IS NOT NULL LOOP
  projection_value:=public.uc_signature_assurance_project_consent(p_org,reference_key);consents_value:=consents_value||jsonb_build_array(projection_value);
  IF projection_value->>'agreement_event_id'IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(agreements_value)a WHERE a.value->'id'=projection_value->'agreement_event_id')THEN agreements_value:=agreements_value||jsonb_build_array(public.uc_signature_assurance_project_agreement(p_org,(projection_value->>'agreement_event_id')::uuid));END IF;
 END LOOP;
 FOR policy_key IN SELECT DISTINCT q.id FROM(SELECT b.policy_version_id id FROM public.uc_signature_assurance_bindings b WHERE b.organization_id=p_org AND b.signature_id=signature_row.id UNION ALL SELECT(a.value->>'policy_version_id')::uuid FROM jsonb_array_elements(agreements_value)a UNION ALL SELECT(c.value->>'policy_version_id')::uuid FROM jsonb_array_elements(consents_value)c)q WHERE q.id IS NOT NULL LOOP
  projection_value:=public.uc_signature_assurance_project_policy(p_org,policy_key);decision_history:='[]';
  IF projection_value->'disclosure'->>'kind'IS DISTINCT FROM'complete'THEN blockers_value:=blockers_value||jsonb_build_array('SOURCE_UNAVAILABLE');END IF;
  IF(SELECT count(*)FROM public.uc_signature_assurance_policy_decisions pd WHERE pd.organization_id=p_org AND pd.policy_version_id=policy_key)>10000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
  FOR decision_row IN SELECT pd.*FROM public.uc_signature_assurance_policy_decisions pd WHERE pd.organization_id=p_org AND pd.policy_version_id=policy_key ORDER BY pd.stream_revision LOOP
   decision_projection:=public.uc_signature_assurance_project_authority(p_org,decision_row.authority);
   IF decision_projection->'document_reference'->>'visibility'='redacted'THEN blockers_value:=blockers_value||jsonb_build_array('SOURCE_UNAVAILABLE');END IF;
   decision_history:=decision_history||jsonb_build_array(jsonb_build_object('id',decision_row.id,'revision',decision_row.stream_revision,'state',decision_row.state,'actor_user_id',decision_row.actor_user_id,'authority',decision_projection,'reason',decision_row.reason,'source_limits_acknowledged',decision_row.source_limits_acknowledged,'server_at',public.uc_signature_assurance_utc(decision_row.server_at)));
   actors:=actors||array_remove(ARRAY[decision_row.actor_user_id],NULL);
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings b WHERE b.organization_id=p_org AND b.signature_id=signature_row.id AND b.policy_version_id=policy_key AND NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_policy_decisions pd WHERE pd.organization_id=p_org AND pd.policy_version_id=policy_key AND pd.stream_revision=b.policy_decision_revision AND pd.state='centre_accepted'))THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
  policies_value:=policies_value||jsonb_build_array(projection_value||jsonb_build_object('archive_decision_history',decision_history));
 END LOOP;
 -- Historical legacy sources lacking typed bindings cannot claim a verified byte/history closure.
 IF stream_row.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(documents_value)d WHERE d.value->>'source_file_state'='unverified_reference')OR EXISTS(SELECT 1 FROM jsonb_array_elements(documents_value)d WHERE d.value->'original_file'IS NOT NULL AND d.value->'original_file'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM public.uc_signature_assurance_bindings b WHERE b.organization_id=p_org AND b.signature_id=signature_row.id AND b.document_snapshot_id=(d.value->>'id')::uuid))THEN coverage_kind:='unverified_legacy';blockers_value:=blockers_value||jsonb_build_array('PACKAGE_INCOMPLETE');END IF;
 capture_value:=jsonb_build_object('signature',jsonb_build_object('id',signature_row.id,'organization_id',p_org,'document_type',signature_row.document_type,'document_id',signature_row.document_id,'legacy_status',signature_row.status,'current_document_revision_id',context_value->'current_document_revision_id','current_document_html_sha256',context_value->'current_document_html_sha256','latest_event_revision',coalesce(stream_row.revision,0)),'documents',documents_value,'bindings',bindings_value,'policies',policies_value,'agreements',agreements_value,'consents',consents_value,'history',history_value);
 IF public.uc_signature_assurance_credential_source(p_org,capture_value::text)THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 IF p_exact AND((p_source->>'revision')::bigint<>coalesce(stream_row.revision,0)OR p_source->>'state_hash'IS DISTINCT FROM public.uc_archive_hash(capture_value))THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 PERFORM public.uc_signature_assurance_signature_fence(p_org,signature_row.id,false,NULL);
 RETURN public.uc_archive_source_capture(p_org,p_scope,p_source,capture_value,actors,files_value,'Доказательства подписи',history_value,coverage_kind,count_value)||jsonb_build_object('source_blockers',blockers_value);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;


-- UC024 fragment 38_archive_source_dispatch.sql
-- UC024 private source dispatcher. No generic table/file resolver and no inferred association.
CREATE FUNCTION public.uc_archive_source(p_org uuid,p_scope jsonb,p_source jsonb,p_lock boolean DEFAULT false,p_exact boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE source_kind text:=p_source->>'kind';proof_value jsonb;BEGIN
 PERFORM public.uc_archive_scope(p_org,p_scope);
 IF jsonb_typeof(p_source)IS DISTINCT FROM'object'OR octet_length(p_source::text)>10000 THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 CASE source_kind
 WHEN'organization_document_version'THEN
  proof_value:=public.uc_archive_org_version(p_org,p_source,false,p_lock);
  proof_value:=public.uc_archive_source_capture(p_org,p_scope,p_source,proof_value->'captured_record',public.uc_archive_people(proof_value->'attribution_actors'),jsonb_build_array(proof_value->'private_file'),proof_value->>'label','[]'::jsonb,'immutable_source',0)||jsonb_build_object('source_blockers','[]'::jsonb);
 WHEN'registry_record'THEN proof_value:=public.uc_archive_registry_source(p_org,p_scope,p_source,p_lock,p_exact);
 WHEN'custom_journal'THEN proof_value:=public.uc_archive_journal_source(p_org,p_scope,p_source,p_lock,p_exact);
 WHEN'scoped_journal'THEN proof_value:=public.uc_archive_scoped_journal_source(p_org,p_scope,p_source,p_lock,p_exact);
 WHEN'group_document'THEN proof_value:=public.uc_archive_group_document_source(p_org,p_scope,p_source,p_lock,p_exact);
 WHEN'admission_case'THEN proof_value:=public.uc_archive_admission_source(p_org,p_scope,p_source,p_lock,p_exact);
 WHEN'education_document'THEN proof_value:=public.uc_archive_education_source(p_org,p_scope,p_source,p_lock,p_exact);
 WHEN'frdo_packet'THEN proof_value:=public.uc_archive_frdo_source(p_org,p_scope,p_source,p_lock,p_exact);
 WHEN'signature_evidence'THEN
  -- The exact protected-binary bridge must exist; metadata or a Storage locator is not a substitute.
  IF to_regprocedure('public.uc_archive_signature_source(uuid,jsonb,jsonb,boolean,boolean)')IS NULL THEN PERFORM public.uc_archive_error('DEPENDENCY_UNAVAILABLE');END IF;
  EXECUTE'SELECT public.uc_archive_signature_source($1,$2,$3,$4,$5)'INTO proof_value USING p_org,p_scope,p_source,p_lock,p_exact;
 ELSE PERFORM public.uc_archive_error('INVALID_INPUT');END CASE;
 IF proof_value IS NULL OR proof_value->'source'IS DISTINCT FROM p_source THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 PERFORM public.uc_archive_fence(p_org,p_scope,public.uc_archive_people(proof_value->'subjects')||public.uc_archive_people(proof_value->'attribution_actors'),p_lock,NULL);
 RETURN proof_value;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;


-- UC024 fragment 40_archive_case_helpers.sql
-- UC024 private case mutations. Only validated dispatchers call these helpers.
CREATE FUNCTION public.uc_archive_can_role(p_org uuid,p_role text)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
BEGIN PERFORM public.uc_archive_authority_current(p_org,auth.uid(),p_role,false);RETURN true;
 EXCEPTION WHEN SQLSTATE'PT422'THEN IF SQLERRM IN('APPROVAL_REQUIRED','SOURCE_UNAVAILABLE')THEN RETURN false;END IF;RAISE;
END;$archive$;
CREATE FUNCTION public.uc_archive_caps(p_org uuid,p_scope jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE writable boolean;legal boolean:=false;approval boolean:=false;operator boolean:=false;destruction_review boolean:=false;BEGIN
 PERFORM public.uc_archive_scope(p_org,p_scope);
 writable:=coalesce(public.uc_document_action_allowed(p_org,'write',NULL,NULL),false);
 IF writable AND NOT public.uc_document_teacher_limited(p_org)THEN
  legal:=public.uc_archive_can_role(p_org,'legal_reviewer');approval:=public.uc_archive_can_role(p_org,'center_approver');operator:=public.uc_archive_can_role(p_org,'archive_operator')OR approval;destruction_review:=public.uc_archive_can_role(p_org,'destruction_reviewer');
 END IF;
 RETURN jsonb_build_object('can_read',true,'can_write',writable,'can_appoint',writable AND public.is_org_owner(auth.uid(),p_org),'can_review_rules',legal,'can_approve_rules',approval,'can_operate',operator,'can_prepare_destruction_review',destruction_review,'can_execute_destruction',false);
END;$archive$;
CREATE FUNCTION public.uc_archive_case_access(p_org uuid,p_scope jsonb,p_case uuid,p_write boolean DEFAULT false)RETURNS public.uc_archive_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE head public.uc_archive_cases;member_value jsonb;source_value jsonb;BEGIN
 PERFORM public.uc_archive_scope(p_org,p_scope);
 SELECT c.*INTO head FROM public.uc_archive_cases c WHERE c.id=p_case AND c.organization_id=p_org AND public.uc_archive_scope_contains(p_scope,c.scope);
 IF head.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
 PERFORM public.uc_archive_fence(p_org,head.scope,head.retained_subjects||head.attribution_actors,p_write,NULL);
 IF p_write AND NOT coalesce(public.uc_document_action_allowed(p_org,'write',NULL,NULL),false)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF p_write THEN SELECT c.*INTO head FROM public.uc_archive_cases c WHERE c.id=head.id AND c.organization_id=p_org FOR UPDATE NOWAIT;END IF;
 -- Check the entire retained subject/actor union before any data/history/file projection.
 PERFORM public.uc_archive_fence(p_org,head.scope,head.retained_subjects||head.attribution_actors,p_write,NULL);
 FOR member_value IN SELECT m.value FROM jsonb_array_elements(head.members)m LOOP
  source_value:=member_value->'source';
  -- Access to every historical member is re-authorized even when its mutable source CAS is old.
  -- A stale source does not permit bypassing current source-specific or retained-person rights.
  PERFORM public.uc_archive_source(p_org,head.scope,source_value,p_write,false);
 END LOOP;
 RETURN head;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;
CREATE FUNCTION public.uc_archive_case_digest(p_case public.uc_archive_cases)RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
 SELECT public.uc_archive_hash(public.uc_archive_case_projection(p_case)-'state_hash')
$archive$;
CREATE FUNCTION public.uc_archive_append_case(p_case public.uc_archive_cases,p_next public.uc_archive_cases,p_kind text,p_payload jsonb,p_capture jsonb DEFAULT NULL,p_people uuid[]DEFAULT '{}')RETURNS public.uc_archive_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE next_head public.uc_archive_cases:=p_next;event_id uuid:=gen_random_uuid();event_at timestamptz:=clock_timestamp();all_people uuid[];payload_value jsonb:=p_payload;capture_value jsonb:=coalesce(p_capture,'{}'::jsonb);authority_row public.uc_archive_authority_revisions;rule_row public.uc_archive_rule_revisions;governance_value jsonb;dependency_ref jsonb;source_proof jsonb;member_value jsonb;member_key uuid;file_key uuid;file_keys uuid[];file_mapping jsonb;private_file jsonb;source_people uuid[];source_actors uuid[];automatic_members jsonb:='[]';BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR NOT public.uc_document_action_allowed(p_case.organization_id,'write',NULL,NULL)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 BEGIN authority_row:=public.uc_archive_authority_current(p_case.organization_id,auth.uid(),'archive_operator',true);
 EXCEPTION WHEN SQLSTATE'PT422'THEN IF SQLERRM<>'APPROVAL_REQUIRED'THEN RAISE;END IF;authority_row:=public.uc_archive_authority_current(p_case.organization_id,auth.uid(),'center_approver',true);END;
 governance_value:=jsonb_build_object('authority_revision',to_jsonb(authority_row)-'retained_people');
 next_head.retained_subjects:=next_head.retained_subjects||authority_row.retained_people;next_head.attribution_actors:=next_head.attribution_actors||array_remove(ARRAY[authority_row.actor_id,authority_row.appointed_user_id],NULL);
 IF next_head.rule_version_id IS NOT NULL THEN
  SELECT r.*INTO rule_row FROM public.uc_archive_rule_revisions r WHERE r.id=next_head.rule_version_id AND r.organization_id=p_case.organization_id;
  IF rule_row.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  governance_value:=governance_value||jsonb_build_object('rule_version',to_jsonb(rule_row)-'retained_people');next_head.retained_subjects:=next_head.retained_subjects||rule_row.retained_people;
 END IF;
 payload_value:=payload_value||jsonb_build_object('actor_id',auth.uid(),'recorded_at',event_at,'event_kind',p_kind,'governance',governance_value);
 -- Closure/hold/rule/authority bases become immutable evidence members in this same CAS event.
 FOR dependency_ref IN WITH RECURSIVE nodes(value)AS(SELECT jsonb_build_object('payload',payload_value,'snapshot',public.uc_archive_case_projection(next_head))UNION ALL SELECT child.value FROM nodes n CROSS JOIN LATERAL(SELECT a.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array'THEN n.value ELSE'[]'::jsonb END)a UNION ALL SELECT o.value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object'THEN n.value ELSE'{}'::jsonb END)o)child)SELECT DISTINCT n.value FROM nodes n WHERE n.value->>'kind'='organization_document_version'LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(next_head.members)m WHERE m.value->'source'=dependency_ref)THEN CONTINUE;END IF;
  IF jsonb_array_length(next_head.members)>=10000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
  source_proof:=public.uc_archive_source(p_case.organization_id,p_case.scope,dependency_ref,true,true);source_people:=public.uc_archive_people(source_proof->'subjects');source_actors:=public.uc_archive_people(source_proof->'attribution_actors');member_key:=gen_random_uuid();file_keys:='{}';file_mapping:='[]';
  FOR private_file IN SELECT f.value FROM jsonb_array_elements(coalesce(source_proof->'private_files',jsonb_build_array(source_proof->'private_file')))f LOOP file_key:=gen_random_uuid();file_keys:=array_append(file_keys,file_key);file_mapping:=file_mapping||jsonb_build_array(jsonb_build_object('file_id',file_key,'private_file',private_file));END LOOP;
  member_value:=jsonb_build_object('id',member_key,'source',dependency_ref,'required',true,'relationship','evidence','subjects',to_jsonb(source_people),'attribution_actors',to_jsonb(source_actors),'file_ids',to_jsonb(file_keys),'label',source_proof->'label');
  next_head.members:=next_head.members||jsonb_build_array(member_value);next_head.retained_subjects:=next_head.retained_subjects||source_people;next_head.attribution_actors:=next_head.attribution_actors||source_actors;
  automatic_members:=automatic_members||jsonb_build_array(jsonb_build_object('member_id',member_key,'source_proof',source_proof,'file_mapping',file_mapping));
 END LOOP;
 capture_value:=capture_value||jsonb_build_object('automatic_members',automatic_members);
 SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id),'{}')INTO all_people FROM unnest(p_case.retained_subjects||p_case.attribution_actors||next_head.retained_subjects||next_head.attribution_actors||coalesce(p_people,'{}')||ARRAY[auth.uid()])x(id)WHERE x.id IS NOT NULL;
 PERFORM public.uc_archive_fence(p_case.organization_id,p_case.scope,all_people,true,NULL);
 next_head.revision:=p_case.revision+1;next_head.updated_at:=event_at;
 SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id),'{}')INTO next_head.retained_subjects FROM unnest(p_case.retained_subjects||next_head.retained_subjects||coalesce(p_people,'{}'))x(id)WHERE x.id IS NOT NULL;
 SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id),'{}')INTO next_head.attribution_actors FROM unnest(p_case.attribution_actors||next_head.attribution_actors||ARRAY[auth.uid()])x(id)WHERE x.id IS NOT NULL;
 next_head.state_hash:=public.uc_archive_case_digest(next_head);
 UPDATE public.uc_archive_cases c SET title=next_head.title,revision=next_head.revision,state_hash=next_head.state_hash,rule_version_id=next_head.rule_version_id,closure=next_head.closure,hold_events=next_head.hold_events,members=next_head.members,retained_subjects=next_head.retained_subjects,attribution_actors=next_head.attribution_actors,state=next_head.state,updated_at=next_head.updated_at WHERE c.id=p_case.id AND c.organization_id=p_case.organization_id AND c.revision=p_case.revision RETURNING c.*INTO next_head;
 IF next_head.id IS NULL THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 INSERT INTO public.uc_archive_case_events(id,case_id,organization_id,revision,kind,actor_id,recorded_at,snapshot,payload,private_capture,payload_sha256,retained_people)VALUES(event_id,next_head.id,next_head.organization_id,next_head.revision,p_kind,auth.uid(),event_at,public.uc_archive_case_projection(next_head),payload_value,capture_value,public.uc_archive_event_hash(payload_value),all_people);
 RETURN next_head;
END;$archive$;
CREATE FUNCTION public.uc_archive_active_holds(p_events jsonb)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $archive$
 SELECT coalesce(jsonb_agg(p.value ORDER BY(p.value->>'sequence')::bigint),'[]')FROM jsonb_array_elements(p_events)p WHERE p.value->>'kind'='placed'
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_events)r WHERE r.value->>'kind'='released'AND r.value->'placed_event_id'=p.value->'id'AND r.value->'hold_id'=p.value->'hold_id')
$archive$;
CREATE FUNCTION public.uc_archive_event_projection(p_event public.uc_archive_case_events)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $archive$
 SELECT jsonb_build_object('id',p_event.id,'sequence',p_event.revision,'source_revision',p_event.revision,'payload',p_event.payload,'payload_sha256',p_event.payload_sha256)
$archive$;


-- UC024 fragment 50_archive_authority_rule_actions.sql
-- UC024 centre appointments and rule drafts/reviews are explicit, separate actions.
CREATE FUNCTION public.uc_archive_decision(p_org uuid,p_decision jsonb,p_lock boolean DEFAULT true)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE source_proof jsonb;BEGIN
 IF NOT public.uc_custom_journal_shape(p_decision,ARRAY['reason','evidence'])OR NOT public.uc_archive_text(p_decision->'reason')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 source_proof:=public.uc_archive_org_version(p_org,p_decision->'evidence',true,p_lock);
 RETURN jsonb_build_object('actor_id',auth.uid(),'recorded_at',clock_timestamp(),'reason',p_decision->'reason','evidence',p_decision->'evidence','private_people',source_proof->'subjects');
END;$archive$;
CREATE FUNCTION public.uc_archive_apply_authority(p_org uuid,p_action jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE action_kind text:=p_action->>'kind';authority_key uuid;expected_revision bigint;target_user uuid;previous public.uc_archive_authority_revisions;created public.uc_archive_authority_revisions;decision_value jsonb;all_people uuid[];role_values text[];BEGIN
 IF NOT public.is_org_owner(auth.uid(),p_org)OR NOT public.uc_document_action_allowed(p_org,'write',NULL,NULL)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_custom_journal_uuid(p_action->'authority_id')OR NOT public.uc_custom_journal_shape(p_action,CASE WHEN action_kind='appoint_authority'THEN ARRAY['kind','authority_id','expected_authority_revision','user_id','roles','decision']ELSE ARRAY['kind','authority_id','expected_authority_revision','decision']END)
  OR NOT public.uc_archive_revision_valid(p_action->'expected_authority_revision') THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 authority_key:=(p_action->>'authority_id')::uuid;expected_revision:=(p_action->>'expected_authority_revision')::bigint;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_archive_authority_id:'||p_org::text||':'||authority_key::text,0))THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 SELECT a.*INTO previous FROM public.uc_archive_authority_revisions a WHERE a.authority_id=authority_key ORDER BY a.revision DESC LIMIT 1;
 IF previous.id IS NOT NULL AND previous.organization_id<>p_org THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF coalesce(previous.revision,0)<>expected_revision THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 IF action_kind='appoint_authority'THEN
  IF NOT public.uc_custom_journal_uuid(p_action->'user_id')OR jsonb_typeof(p_action->'roles')IS DISTINCT FROM'array'OR jsonb_array_length(p_action->'roles')NOT BETWEEN 1 AND 4
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_action->'roles')='array'THEN p_action->'roles'ELSE'[]'::jsonb END)r WHERE jsonb_typeof(r)IS DISTINCT FROM'string'OR(r#>>'{}')NOT IN('legal_reviewer','center_approver','archive_operator','destruction_reviewer'))THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  SELECT array_agg(DISTINCT r.value ORDER BY r.value)INTO role_values FROM jsonb_array_elements_text(p_action->'roles')r(value);
  IF cardinality(role_values)<>jsonb_array_length(p_action->'roles')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  target_user:=(p_action->>'user_id')::uuid;IF previous.id IS NOT NULL AND previous.appointed_user_id<>target_user THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  IF NOT public.uc_org_document_review_actor(p_org,target_user)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 ELSIF action_kind='revoke_authority'THEN
  IF previous.id IS NULL OR previous.state<>'appointed'THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;target_user:=previous.appointed_user_id;role_values:=previous.roles;
 ELSE PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_archive_authority:'||p_org::text||':'||target_user::text,0))THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 decision_value:=public.uc_archive_decision(p_org,p_action->'decision',true);
 SELECT coalesce(array_agg(DISTINCT p.id ORDER BY p.id),'{}')INTO all_people FROM unnest(coalesce(previous.retained_people,'{}')||public.uc_archive_people(decision_value->'private_people')||ARRAY[target_user,auth.uid()])p(id);
 PERFORM public.uc_archive_fence(p_org,jsonb_build_object('kind','organization'),all_people,true,NULL);
 INSERT INTO public.uc_archive_authority_revisions(organization_id,authority_id,revision,appointed_user_id,roles,state,evidence,reason,actor_id,retained_people)
 VALUES(p_org,authority_key,expected_revision+1,target_user,role_values,CASE WHEN action_kind='appoint_authority'THEN'appointed'ELSE'revoked'END,p_action->'decision'->'evidence',p_action->'decision'->>'reason',auth.uid(),all_people)RETURNING *INTO created;
 RETURN jsonb_build_object('authority_revision_id',created.id,'authority_id',created.authority_id,'revision',created.revision,'state',created.state,'retained_people',to_jsonb(all_people));
END;$archive$;
CREATE FUNCTION public.uc_archive_rule_draft_valid(p_value jsonb)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $archive$
DECLARE duration_value jsonb:=p_value->'duration';BEGIN
 IF NOT public.uc_custom_journal_shape(p_value,ARRAY['nomenclature_version_id','entry_id','case_kind','case_index','title','source','declared_source_byte_sha256','provision','source_note','duration','start_event','start_rule','requires_expert_review','effective_from'])
 OR NOT public.uc_custom_journal_uuid(p_value->'nomenclature_version_id')OR NOT public.uc_custom_journal_uuid(p_value->'entry_id')OR NOT public.uc_archive_text(p_value->'case_kind')OR NOT public.uc_archive_text(p_value->'case_index',120)OR NOT public.uc_archive_text(p_value->'title')OR NOT public.uc_archive_text(p_value->'provision')
 OR NOT(p_value->'source_note'='null'::jsonb OR public.uc_archive_text(p_value->'source_note'))OR jsonb_typeof(p_value->'requires_expert_review')IS DISTINCT FROM'boolean'OR NOT public.uc_copy_registry_date(p_value->'effective_from')
 OR coalesce(p_value->>'declared_source_byte_sha256','')!~'^[a-f0-9]{64}$'OR coalesce(p_value->>'start_event','')NOT IN('case_closed','register_ceased','contract_obligations_completed')OR p_value->>'start_rule'IS DISTINCT FROM'next_january_first'THEN RETURN false;END IF;
 IF public.uc_custom_journal_shape(duration_value,ARRAY['kind','years'])AND duration_value->>'kind'='years'THEN
  RETURN CASE WHEN jsonb_typeof(duration_value->'years')='number'AND coalesce(duration_value->>'years','')~'^[1-9][0-9]{0,3}$'THEN(duration_value->>'years')::numeric<=9000 ELSE false END;
 ELSIF public.uc_custom_journal_shape(duration_value,ARRAY['kind'])AND duration_value->>'kind'IN('permanent','unknown')THEN RETURN true;
 ELSIF public.uc_custom_journal_shape(duration_value,ARRAY['kind','event_kind'])AND duration_value->>'kind'='event_bound'AND public.uc_archive_text(duration_value->'event_kind')THEN RETURN true;
 END IF;RETURN false;
END;$archive$;
CREATE FUNCTION public.uc_archive_apply_rule(p_org uuid,p_action jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE action_kind text:=p_action->>'kind';draft_value jsonb;source_proof jsonb;nomenclature_proof jsonb;nomenclature_ref jsonb;nomenclature_version public.org_document_versions;rule_row public.uc_archive_rule_revisions;new_row public.uc_archive_rule_revisions;checked public.uc_archive_rule_source_checks;decision_value jsonb;all_people uuid[];rule_key uuid;BEGIN
 IF NOT public.uc_document_action_allowed(p_org,'write',NULL,NULL)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF action_kind='save_rule_draft'THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind','draft'])OR NOT public.uc_archive_rule_draft_valid(p_action->'draft')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  draft_value:=p_action->'draft';
  SELECT v.*INTO nomenclature_version FROM public.org_document_versions v WHERE v.id=(draft_value->>'nomenclature_version_id')::uuid AND v.organization_id=p_org;
  IF nomenclature_version.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
  nomenclature_ref:=public.uc_copy_registry_original_ref(nomenclature_version)||jsonb_build_object('kind','organization_document_version');nomenclature_proof:=public.uc_archive_org_version(p_org,nomenclature_ref,false,true);
  source_proof:=public.uc_archive_org_version(p_org,draft_value->'source',false,true);
  all_people:=public.uc_archive_people(source_proof->'subjects')||public.uc_archive_people(nomenclature_proof->'subjects')||ARRAY[auth.uid()];PERFORM public.uc_archive_fence(p_org,jsonb_build_object('kind','organization'),all_people,true,NULL);rule_key:=gen_random_uuid();
  INSERT INTO public.uc_archive_rule_revisions(organization_id,rule_id,revision,nomenclature_version_id,nomenclature_reference,entry_id,state,data,source_reference,source_byte_sha256,actor_id,retained_people)
  VALUES(p_org,rule_key,1,(draft_value->>'nomenclature_version_id')::uuid,nomenclature_ref,(draft_value->>'entry_id')::uuid,'draft',draft_value-ARRAY['source','declared_source_byte_sha256'],draft_value->'source',draft_value->>'declared_source_byte_sha256',auth.uid(),all_people)RETURNING *INTO new_row;
 ELSE
  IF action_kind NOT IN('review_rule','approve_rule')OR NOT public.uc_custom_journal_shape(p_action,ARRAY['kind','rule_version_id','decision'])OR NOT public.uc_custom_journal_uuid(p_action->'rule_version_id')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  SELECT r.*INTO rule_row FROM public.uc_archive_rule_revisions r WHERE r.id=(p_action->>'rule_version_id')::uuid AND r.organization_id=p_org;
  IF rule_row.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_archive_rule:'||p_org::text||':'||rule_row.rule_id::text,0))THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
  IF EXISTS(SELECT 1 FROM public.uc_archive_rule_revisions later WHERE later.rule_id=rule_row.rule_id AND later.revision>rule_row.revision)THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
  IF action_kind='review_rule'THEN PERFORM public.uc_archive_authority_current(p_org,auth.uid(),'legal_reviewer',true);IF rule_row.state<>'draft'THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  ELSE PERFORM public.uc_archive_authority_current(p_org,auth.uid(),'center_approver',true);IF rule_row.state<>'reviewed'OR rule_row.legal_review IS NULL THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;END IF;
  source_proof:=public.uc_archive_org_version(p_org,rule_row.source_reference,false,true);nomenclature_proof:=public.uc_archive_org_version(p_org,rule_row.nomenclature_reference,action_kind='approve_rule',true);
  SELECT s.*INTO checked FROM public.uc_archive_rule_source_checks s WHERE s.rule_version_id=coalesce((rule_row.source_check->>'rule_version_id')::uuid,rule_row.id)AND s.organization_id=p_org AND s.phase='sealed'AND s.actual_byte_sha256=rule_row.source_byte_sha256 ORDER BY s.sealed_at DESC,s.id DESC LIMIT 1;
  IF checked.id IS NULL OR rule_row.source_check IS NULL OR checked.id::text IS DISTINCT FROM rule_row.source_check->>'check_id'OR checked.source_context->'private_file'IS DISTINCT FROM source_proof->'private_file'THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
  decision_value:=public.uc_archive_decision(p_org,p_action->'decision',true);
  SELECT coalesce(array_agg(DISTINCT p.id ORDER BY p.id),'{}')INTO all_people FROM unnest(rule_row.retained_people||checked.retained_people||public.uc_archive_people(source_proof->'subjects')||public.uc_archive_people(nomenclature_proof->'subjects')||public.uc_archive_people(decision_value->'private_people')||ARRAY[auth.uid()])p(id);
  PERFORM public.uc_archive_fence(p_org,jsonb_build_object('kind','organization'),all_people,true,NULL);
  INSERT INTO public.uc_archive_rule_revisions(organization_id,rule_id,revision,nomenclature_version_id,nomenclature_reference,entry_id,state,data,source_reference,source_byte_sha256,source_check,legal_review,center_approval,actor_id,retained_people)
  VALUES(p_org,rule_row.rule_id,rule_row.revision+1,rule_row.nomenclature_version_id,rule_row.nomenclature_reference,rule_row.entry_id,CASE WHEN action_kind='review_rule'THEN'reviewed'ELSE'approved'END,rule_row.data,rule_row.source_reference,rule_row.source_byte_sha256,rule_row.source_check,
   CASE WHEN action_kind='review_rule'THEN decision_value-'private_people'ELSE rule_row.legal_review END,CASE WHEN action_kind='approve_rule'THEN decision_value-'private_people'ELSE NULL END,auth.uid(),all_people)RETURNING *INTO new_row;
 END IF;
 RETURN jsonb_build_object('rule_version_id',new_row.id,'rule',public.uc_archive_rule_projection(new_row),'retained_people',to_jsonb(all_people));
END;$archive$;


-- UC024 fragment 55_archive_rule_source_checks.sql
-- UC024 original-JWT preparation, original-JWT fresh context and one fixed service commit.
CREATE FUNCTION public.uc_archive_source_check_guard()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $archive$
BEGIN
 IF TG_OP='DELETE'THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF (to_jsonb(NEW)-ARRAY['phase','verified_rule_version_id','actual_byte_sha256','actual_byte_size','sealed_at','retained_people'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['phase','verified_rule_version_id','actual_byte_sha256','actual_byte_size','sealed_at','retained_people'])
  OR OLD.phase<>'prepared'OR NEW.phase<>'sealed'OR NOT(OLD.retained_people<@NEW.retained_people)THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 RETURN NEW;
END;$archive$;
CREATE TRIGGER uc_archive_source_check_guard BEFORE UPDATE OR DELETE ON public.uc_archive_rule_source_checks FOR EACH ROW EXECUTE FUNCTION public.uc_archive_source_check_guard();
CREATE FUNCTION public.prepare_archive_rule_source_check(p_org uuid,p_rule_version uuid,p_request uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE rule_row public.uc_archive_rule_revisions;job public.uc_archive_rule_source_checks;source_proof jsonb;all_people uuid[];latest_rule public.uc_archive_rule_revisions;BEGIN
 PERFORM public.uc_archive_fence(p_org,jsonb_build_object('kind','organization'),ARRAY[auth.uid()],true,p_request);
 IF p_rule_version IS NULL OR p_request IS NULL OR NOT public.uc_document_action_allowed(p_org,'write',NULL,NULL)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 SELECT r.*INTO rule_row FROM public.uc_archive_rule_revisions r WHERE r.id=p_rule_version AND r.organization_id=p_org;
 IF rule_row.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_archive_rule:'||p_org::text||':'||rule_row.rule_id::text,0))THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 SELECT j.*INTO job FROM public.uc_archive_rule_source_checks j WHERE j.actor_id=auth.uid()AND j.request_id=p_request;
 IF job.id IS NOT NULL AND(job.organization_id<>p_org OR job.rule_version_id<>rule_row.id)THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 SELECT r.*INTO latest_rule FROM public.uc_archive_rule_revisions r WHERE r.organization_id=p_org AND r.rule_id=rule_row.rule_id ORDER BY r.revision DESC LIMIT 1;
 IF job.id IS NULL AND(latest_rule.id<>rule_row.id OR rule_row.state<>'draft')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 IF job.id IS NOT NULL AND latest_rule.id<>rule_row.id AND latest_rule.source_check->>'check_id'IS DISTINCT FROM job.id::text THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 source_proof:=public.uc_archive_org_version(p_org,rule_row.source_reference,false,true);
 SELECT coalesce(array_agg(DISTINCT p.id ORDER BY p.id),'{}')INTO all_people FROM unnest(rule_row.retained_people||latest_rule.retained_people||coalesce(job.retained_people,'{}')||public.uc_archive_people(source_proof->'subjects')||ARRAY[auth.uid()])p(id);
 PERFORM public.uc_archive_fence(p_org,jsonb_build_object('kind','organization'),all_people,true,NULL);
 IF job.id IS NULL THEN
  INSERT INTO public.uc_archive_rule_source_checks(organization_id,rule_version_id,actor_id,request_id,source_reference,source_context,declared_byte_sha256,retained_people)
  VALUES(p_org,rule_row.id,auth.uid(),p_request,rule_row.source_reference,source_proof,rule_row.source_byte_sha256,all_people)RETURNING *INTO job;
 ELSE
  IF job.source_reference<>rule_row.source_reference OR job.source_context->'private_file'IS DISTINCT FROM source_proof->'private_file'OR job.declared_byte_sha256<>rule_row.source_byte_sha256 THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  IF job.phase='prepared'AND job.expires_at<=clock_timestamp()THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 END IF;
 RETURN jsonb_build_object('schema_version',1,'id',job.id,'organization_id',p_org,'actor_id',job.actor_id,'request_id',job.request_id,'rule_version_id',job.rule_version_id,'phase',job.phase,'expires_at',job.expires_at,'declared_byte_sha256',job.declared_byte_sha256,
  'source',job.source_reference,'private_file',source_proof->'private_file','verified_rule_version_id',job.verified_rule_version_id,'actual_byte_sha256',job.actual_byte_sha256,'actual_byte_size',job.actual_byte_size);
END;$archive$;
CREATE FUNCTION public.commit_archive_rule_source_check(p_job uuid,p_proof jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE job public.uc_archive_rule_source_checks;rule_row public.uc_archive_rule_revisions;new_rule public.uc_archive_rule_revisions;source_proof jsonb;all_people uuid[];claims_text text:=current_setting('request.jwt.claims',true);sub_text text:=current_setting('request.jwt.claim.sub',true);role_text text:=current_setting('request.jwt.claim.role',true);projected boolean:=false;replayed boolean:=false;BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR coalesce(claims_text,'')=''THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF jsonb_typeof(claims_text::jsonb)IS DISTINCT FROM'object'OR claims_text::jsonb->>'role'IS DISTINCT FROM'service_role'OR nullif(claims_text::jsonb->>'sub','')IS NOT NULL THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_custom_journal_shape(p_proof,ARRAY['byte_sha256','byte_size','object_id','object_updated_at'])OR coalesce(p_proof->>'byte_sha256','')!~'^[a-f0-9]{64}$'OR NOT public.uc_custom_journal_uuid(p_proof->'object_id')OR NOT public.uc_archive_revision_valid(p_proof->'byte_size')OR(p_proof->>'byte_size')::bigint NOT BETWEEN 1 AND 104857600 OR jsonb_typeof(p_proof->'object_updated_at')IS DISTINCT FROM'string'THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 SELECT j.*INTO job FROM public.uc_archive_rule_source_checks j WHERE j.id=p_job;
 IF job.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claim.role','',true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',job.actor_id)::text,true);projected:=true;
 PERFORM public.uc_archive_fence(job.organization_id,jsonb_build_object('kind','organization'),job.retained_people,true,job.request_id);
 IF NOT public.uc_document_action_allowed(job.organization_id,'write',NULL,NULL)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 SELECT r.*INTO rule_row FROM public.uc_archive_rule_revisions r WHERE r.id=job.rule_version_id AND r.organization_id=job.organization_id;
 IF rule_row.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc_archive_rule:'||job.organization_id::text||':'||rule_row.rule_id::text,0))THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 SELECT j.*INTO job FROM public.uc_archive_rule_source_checks j WHERE j.id=p_job FOR UPDATE NOWAIT;
 source_proof:=public.uc_archive_org_version(job.organization_id,job.source_reference,false,true);
 IF job.source_context->'private_file'IS DISTINCT FROM source_proof->'private_file'OR p_proof->>'byte_sha256'<>job.declared_byte_sha256 OR p_proof->'object_id'IS DISTINCT FROM source_proof->'private_file'->'object_id'
  OR(p_proof->>'object_updated_at')::timestamptz IS DISTINCT FROM(source_proof->'private_file'->>'object_updated_at')::timestamptz
  OR(p_proof->>'byte_size')::bigint IS DISTINCT FROM(source_proof->'private_file'->>'byte_size')::bigint THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 SELECT coalesce(array_agg(DISTINCT p.id ORDER BY p.id),'{}')INTO all_people FROM unnest(job.retained_people||rule_row.retained_people||public.uc_archive_people(source_proof->'subjects')||ARRAY[job.actor_id])p(id);
 PERFORM public.uc_archive_fence(job.organization_id,jsonb_build_object('kind','organization'),all_people,true,NULL);
 IF job.phase='sealed'THEN
  SELECT r.*INTO new_rule FROM public.uc_archive_rule_revisions r WHERE r.id=job.verified_rule_version_id AND r.organization_id=job.organization_id AND r.source_check->>'check_id'=job.id::text;
  IF new_rule.id IS NULL OR job.actual_byte_sha256<>p_proof->>'byte_sha256'OR job.actual_byte_size<>(p_proof->>'byte_size')::bigint THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;replayed:=true;
 ELSE
  IF job.expires_at<=clock_timestamp()OR rule_row.state<>'draft'OR EXISTS(SELECT 1 FROM public.uc_archive_rule_revisions later WHERE later.rule_id=rule_row.rule_id AND later.revision>rule_row.revision)THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  INSERT INTO public.uc_archive_rule_revisions(organization_id,rule_id,revision,nomenclature_version_id,nomenclature_reference,entry_id,state,data,source_reference,source_byte_sha256,source_check,actor_id,retained_people)
  VALUES(rule_row.organization_id,rule_row.rule_id,rule_row.revision+1,rule_row.nomenclature_version_id,rule_row.nomenclature_reference,rule_row.entry_id,'draft',rule_row.data,rule_row.source_reference,rule_row.source_byte_sha256,
   jsonb_build_object('check_id',job.id,'rule_version_id',rule_row.id,'actor_id',job.actor_id,'recorded_at',clock_timestamp(),'byte_sha256',p_proof->'byte_sha256','byte_size',p_proof->'byte_size'),job.actor_id,all_people)RETURNING *INTO new_rule;
  UPDATE public.uc_archive_rule_source_checks j SET phase='sealed',verified_rule_version_id=new_rule.id,actual_byte_sha256=p_proof->>'byte_sha256',actual_byte_size=(p_proof->>'byte_size')::bigint,sealed_at=clock_timestamp(),retained_people=all_people WHERE j.id=job.id;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);projected:=false;
 RETURN jsonb_build_object('schema_version',1,'job_id',job.id,'actor_id',job.actor_id,'request_id',job.request_id,'verified_rule_version_id',new_rule.id,'byte_sha256',p_proof->'byte_sha256','byte_size',p_proof->'byte_size','replayed',replayed);
 EXCEPTION WHEN OTHERS THEN
  IF projected THEN PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);END IF;RAISE;
END;$archive$;


-- UC024 fragment 56_archive_rule_inspection.sql
-- Original-caller inspection supplies actual bytes/hash for drafting only. It grants no legal review or centre approval.
CREATE FUNCTION public.archive_rule_inspection_context(p_org uuid,p_source jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE source_value jsonb;BEGIN
 PERFORM public.uc_archive_fence(p_org,jsonb_build_object('kind','organization'),ARRAY[auth.uid()],false,NULL);
 IF NOT coalesce(public.uc_document_action_allowed(p_org,'write',NULL,NULL),false)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 source_value:=public.uc_archive_org_version(p_org,p_source,false,false);
 PERFORM public.uc_archive_fence(p_org,jsonb_build_object('kind','organization'),public.uc_archive_people(source_value->'subjects'),false,NULL);
 RETURN jsonb_build_object('version',1,'organization_id',p_org,'actor_id',auth.uid(),'source',p_source,'private_file',source_value->'private_file');
END;$archive$;


-- UC024 fragment 60_archive_case_actions.sql
-- UC024 current-case actions. Private helpers only; public dispatch/CAS/replay are assembled later.
CREATE FUNCTION public.uc_archive_open_case(p_org uuid,p_scope jsonb,p_action jsonb)RETURNS public.uc_archive_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE head public.uc_archive_cases;next_head public.uc_archive_cases;caps jsonb;scope_people uuid[]:='{}';BEGIN
 IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind','title','opened_on'])OR p_action->>'kind'IS DISTINCT FROM'open_case'OR NOT public.uc_archive_text(p_action->'title')OR NOT public.uc_copy_registry_date(p_action->'opened_on')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 IF(p_action->>'opened_on')::date>current_date THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 caps:=public.uc_archive_caps(p_org,p_scope);IF NOT(caps->>'can_operate')::boolean THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
 IF p_scope->>'kind'='enrollment'THEN scope_people:=ARRAY[(p_scope->>'user_id')::uuid];END IF;
 PERFORM public.uc_archive_fence(p_org,p_scope,scope_people||ARRAY[auth.uid()],true,NULL);
 INSERT INTO public.uc_archive_cases(organization_id,scope,group_id,user_id,enrollment_id,title,opened_on,state_hash,created_by,retained_subjects,attribution_actors)
 VALUES(p_org,p_scope,(p_scope->>'group_id')::uuid,(p_scope->>'user_id')::uuid,(p_scope->>'enrollment_id')::uuid,p_action->>'title',(p_action->>'opened_on')::date,repeat('0',64),auth.uid(),scope_people,ARRAY[auth.uid()])RETURNING *INTO head;
 next_head:=head;RETURN public.uc_archive_append_case(head,next_head,'case_opened',jsonb_build_object('kind','case_opened','title',head.title,'opened_on',head.opened_on),NULL,scope_people);
END;$archive$;
CREATE FUNCTION public.uc_archive_apply_case(p_org uuid,p_scope jsonb,p_case uuid,p_action jsonb)RETURNS public.uc_archive_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE head public.uc_archive_cases;next_head public.uc_archive_cases;action_kind text:=p_action->>'kind';caps jsonb;decision_value jsonb;source_proof jsonb;member_value jsonb;member_key uuid;file_key uuid;file_keys uuid[]:='{}';file_mapping jsonb:='[]';private_file jsonb;people uuid[]:='{}';actors uuid[]:='{}';declared uuid[];placed jsonb;released jsonb;hold_sequence bigint;rule_row public.uc_archive_rule_revisions;checked public.uc_archive_rule_source_checks;classification_source jsonb;classification_nomenclature jsonb;BEGIN
 head:=public.uc_archive_case_access(p_org,p_scope,p_case,true);next_head:=head;
 caps:=public.uc_archive_caps(p_org,head.scope);IF NOT(caps->>'can_operate')::boolean THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
 IF head.state='destroyed'THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF action_kind='link_source'THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind','source','required','relationship','declared_subjects'])OR jsonb_typeof(p_action->'required')IS DISTINCT FROM'boolean'OR p_action->>'relationship'NOT IN('original','copy','evidence')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  declared:=public.uc_archive_people(p_action->'declared_subjects');
  IF head.group_id IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(declared)person(id)WHERE NOT public.uc_document_registry_student(p_org,head.group_id,person.id))THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
  IF head.enrollment_id IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(declared)person(id)WHERE person.id IS DISTINCT FROM head.user_id)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(head.members)m WHERE m.value->'source'=p_action->'source')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  IF jsonb_array_length(head.members)>=10000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
  source_proof:=public.uc_archive_source(p_org,head.scope,p_action->'source',true);
  SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id),'{}')INTO people FROM unnest(public.uc_archive_people(source_proof->'subjects')||declared)x(id);
  actors:=public.uc_archive_people(source_proof->'attribution_actors');
  PERFORM public.uc_archive_fence(p_org,head.scope,head.retained_subjects||head.attribution_actors||people||actors,true,NULL);
  member_key:=gen_random_uuid();
  FOR private_file IN SELECT f.value FROM jsonb_array_elements(CASE WHEN source_proof?'private_files'THEN source_proof->'private_files'WHEN source_proof->'private_file'IS NOT NULL THEN jsonb_build_array(source_proof->'private_file')ELSE'[]'::jsonb END)f LOOP
   file_key:=gen_random_uuid();file_keys:=array_append(file_keys,file_key);file_mapping:=file_mapping||jsonb_build_array(jsonb_build_object('file_id',file_key,'private_file',private_file));
  END LOOP;
  member_value:=jsonb_build_object('id',member_key,'source',p_action->'source','required',p_action->'required','relationship',p_action->'relationship','subjects',to_jsonb(people),'attribution_actors',to_jsonb(actors),'file_ids',to_jsonb(file_keys),'label',source_proof->'label');
  next_head.members:=head.members||jsonb_build_array(member_value);next_head.retained_subjects:=head.retained_subjects||people;next_head.attribution_actors:=head.attribution_actors||actors;
  RETURN public.uc_archive_append_case(head,next_head,'source_linked',jsonb_build_object('kind','source_linked','member',member_value),jsonb_build_object('member_id',member_key,'source_proof',source_proof,'file_mapping',file_mapping),people||actors);
 ELSIF action_kind='record_closure'THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind','closure_kind','actual_on','reason','evidence'])OR p_action->>'closure_kind'NOT IN('case_closed','register_ceased','contract_obligations_completed')OR NOT public.uc_copy_registry_date(p_action->'actual_on')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  IF head.closure IS NOT NULL THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  IF(p_action->>'actual_on')::date<head.opened_on OR(p_action->>'actual_on')::date>current_date THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  IF head.rule_version_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.uc_archive_rule_revisions r WHERE r.id=head.rule_version_id AND r.data->>'start_event'IS DISTINCT FROM p_action->>'closure_kind')THEN PERFORM public.uc_archive_error('EVENT_MISMATCH');END IF;
  decision_value:=public.uc_archive_decision(p_org,jsonb_build_object('reason',p_action->'reason','evidence',p_action->'evidence'),true);people:=public.uc_archive_people(decision_value->'private_people');
  next_head.closure:=jsonb_build_object('kind',p_action->'closure_kind','actual_on',p_action->'actual_on','evidence',p_action->'evidence','recorded_at',decision_value->'recorded_at','recorded_by',auth.uid(),'reason',p_action->'reason');
  next_head.state:=CASE WHEN jsonb_array_length(public.uc_archive_active_holds(head.hold_events))>0 THEN'held'ELSE'closed'END;
  RETURN public.uc_archive_append_case(head,next_head,'closure_recorded',jsonb_build_object('kind','closure_recorded','closure',next_head.closure),NULL,people);
 ELSIF action_kind IN('place_hold','release_hold')THEN
  IF NOT public.uc_custom_journal_uuid(p_action->'hold_id')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  decision_value:=public.uc_archive_decision(p_org,jsonb_build_object('reason',p_action->'reason','evidence',p_action->'evidence'),true);people:=public.uc_archive_people(decision_value->'private_people');hold_sequence:=jsonb_array_length(head.hold_events)+1;
  IF hold_sequence>10000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
  IF action_kind='place_hold'THEN
   IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind','hold_id','reason_kind','reason','evidence','review_on'])OR p_action->>'reason_kind'NOT IN('dispute','inspection','subject_request','other_reviewed')OR NOT(p_action->'review_on'='null'::jsonb OR public.uc_copy_registry_date(p_action->'review_on'))THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(head.hold_events)h WHERE h.value->'hold_id'=p_action->'hold_id')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
   placed:=jsonb_build_object('kind','placed','id',gen_random_uuid(),'hold_id',p_action->'hold_id','sequence',hold_sequence,'recorded_at',clock_timestamp(),'actor_id',auth.uid(),'reason_kind',p_action->'reason_kind','reason',p_action->'reason','evidence',p_action->'evidence','review_on',p_action->'review_on');next_head.hold_events:=head.hold_events||jsonb_build_array(placed);next_head.state:='held';
   RETURN public.uc_archive_append_case(head,next_head,'hold_placed',jsonb_build_object('kind','hold_placed','hold',placed),NULL,people);
  ELSE
   IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind','hold_id','placed_event_id','reason','evidence'])OR NOT public.uc_custom_journal_uuid(p_action->'placed_event_id')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
   SELECT h.value INTO placed FROM jsonb_array_elements(public.uc_archive_active_holds(head.hold_events))h WHERE h.value->'id'=p_action->'placed_event_id'AND h.value->'hold_id'=p_action->'hold_id';
   IF placed IS NULL THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
   released:=jsonb_build_object('kind','released','id',gen_random_uuid(),'hold_id',p_action->'hold_id','sequence',hold_sequence,'recorded_at',clock_timestamp(),'actor_id',auth.uid(),'placed_event_id',p_action->'placed_event_id','reason',p_action->'reason','evidence',p_action->'evidence');next_head.hold_events:=head.hold_events||jsonb_build_array(released);
   next_head.state:=CASE WHEN jsonb_array_length(public.uc_archive_active_holds(next_head.hold_events))>0 THEN'held'WHEN head.closure IS NOT NULL THEN'closed'ELSE'open'END;
   RETURN public.uc_archive_append_case(head,next_head,'hold_released',jsonb_build_object('kind','hold_released','hold',released),NULL,people);
  END IF;
 ELSIF action_kind='classify_case'THEN
  IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind','rule_version_id','reason'])OR NOT public.uc_custom_journal_uuid(p_action->'rule_version_id')OR NOT public.uc_archive_text(p_action->'reason')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  SELECT r.*INTO rule_row FROM public.uc_archive_rule_revisions r WHERE r.id=(p_action->>'rule_version_id')::uuid AND r.organization_id=p_org;
  IF rule_row.id IS NULL OR rule_row.state<>'approved'OR(rule_row.data->>'effective_from')::date>current_date OR EXISTS(SELECT 1 FROM public.uc_archive_rule_revisions later WHERE later.rule_id=rule_row.rule_id AND later.revision>rule_row.revision)THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
  IF head.closure IS NOT NULL AND head.closure->>'kind'IS DISTINCT FROM rule_row.data->>'start_event'THEN PERFORM public.uc_archive_error('EVENT_MISMATCH');END IF;
  PERFORM public.uc_archive_fence(p_org,head.scope,rule_row.retained_people,true,NULL);
  classification_source:=public.uc_archive_org_version(p_org,rule_row.source_reference,false,true);classification_nomenclature:=public.uc_archive_org_version(p_org,rule_row.nomenclature_reference,true,true);
  SELECT s.*INTO checked FROM public.uc_archive_rule_source_checks s WHERE s.id=(rule_row.source_check->>'check_id')::uuid AND s.organization_id=p_org AND s.phase='sealed'AND s.actual_byte_sha256=rule_row.source_byte_sha256;
  IF checked.id IS NULL OR checked.source_context->'private_file'IS DISTINCT FROM classification_source->'private_file'THEN PERFORM public.uc_archive_error('APPROVAL_STALE');END IF;
  people:=rule_row.retained_people||checked.retained_people||public.uc_archive_people(classification_source->'subjects')||public.uc_archive_people(classification_nomenclature->'subjects');next_head.rule_version_id:=rule_row.id;
  RETURN public.uc_archive_append_case(head,next_head,'rule_classified',jsonb_build_object('kind','rule_classified','rule',public.uc_archive_rule_projection(rule_row),'reason',p_action->'reason'),NULL,people);
 ELSE PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
END;$archive$;


-- UC024 fragment 61_archive_source_inventory.sql
-- Bounded original-caller source inventory. Only fully authorized previews leave this function; scan positions are encrypted.
CREATE FUNCTION public.uc_archive_source_inventory(p_org uuid,p_scope jsonb,p_query jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE source_kind text:=p_query->>'source_kind';search_value text:=btrim(p_query->>'search');query_key text;position_value jsonb;last_position jsonb;statement_value text;candidate_row record;proof_value jsonb;fresh_ref jsonb;items_value jsonb:='[]';next_value text;limit_value integer;scanned integer:=0;visible integer:=0;BEGIN
 PERFORM public.uc_archive_fence(p_org,p_scope,ARRAY[auth.uid()],false,NULL);
 IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','source_kind','search','after_cursor','limit'])OR p_query->>'kind'IS DISTINCT FROM'source_inventory'OR source_kind IS NULL OR source_kind NOT IN('organization_document_version','registry_record','custom_journal','scoped_journal','group_document','admission_case','education_document','frdo_packet','signature_evidence')OR jsonb_typeof(p_query->'search')IS DISTINCT FROM'string'OR length(search_value)>200 OR NOT public.uc_archive_revision_valid(p_query->'limit')OR(p_query->>'limit')::integer NOT BETWEEN 1 AND 25 OR NOT(p_query->'after_cursor'='null'::jsonb OR jsonb_typeof(p_query->'after_cursor')='string')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 limit_value:=(p_query->>'limit')::integer;query_key:='sources:'||source_kind||':'||public.uc_document_registry_hash(lower(search_value));
 IF p_query->'after_cursor'<>'null'::jsonb THEN position_value:=public.uc_archive_cursor(p_org,p_scope,query_key,NULL,p_query->>'after_cursor');END IF;
 CASE source_kind
 WHEN'organization_document_version'THEN statement_value:='SELECT v.id,jsonb_build_object(''kind'',''organization_document_version'',''document_id'',v.document_id,''version_id'',v.id,''content_hash'',public.uc_copy_registry_original_ref(v)->''content_hash'') ref FROM public.org_document_versions v WHERE v.organization_id=$1 AND($2::uuid IS NULL OR v.id>$2::uuid)ORDER BY v.id LIMIT 101';
 WHEN'registry_record'THEN statement_value:='SELECT r.id,jsonb_build_object(''kind'',''registry_record'',''record_id'',r.id,''revision'',0,''state_hash'',repeat(''0'',64))ref FROM public.uc_document_registry_records r WHERE r.organization_id=$1 AND($2::uuid IS NULL OR r.id>$2::uuid)ORDER BY r.id LIMIT 101';
 WHEN'custom_journal'THEN statement_value:='SELECT j.id,jsonb_build_object(''kind'',''custom_journal'',''journal_id'',j.id,''revision'',0,''snapshot_hash'',repeat(''0'',64))ref FROM public.uc_custom_journals j WHERE j.organization_id=$1 AND($2::uuid IS NULL OR j.id>$2::uuid)ORDER BY j.id LIMIT 101';
 WHEN'scoped_journal'THEN statement_value:='SELECT c.journal_id id,jsonb_build_object(''kind'',''scoped_journal'',''journal_id'',c.journal_id,''revision'',0,''snapshot_hash'',repeat(''0'',64))ref FROM public.uc_scoped_journal_contexts c WHERE c.organization_id=$1 AND($2::uuid IS NULL OR c.journal_id>$2::uuid)ORDER BY c.journal_id LIMIT 101';
 WHEN'group_document'THEN statement_value:='SELECT d.id,jsonb_build_object(''kind'',''group_document'',''document_id'',d.id,''revision'',0,''snapshot_hash'',repeat(''0'',64))ref FROM public.group_documents d WHERE d.organization_id=$1 AND($2::uuid IS NULL OR d.id>$2::uuid)ORDER BY d.id LIMIT 101';
 WHEN'admission_case'THEN statement_value:='SELECT c.id,jsonb_build_object(''kind'',''admission_case'',''case_id'',c.id,''revision'',0,''state_hash'',repeat(''0'',64))ref FROM public.uc_admission_cases c WHERE c.organization_id=$1 AND($2::uuid IS NULL OR c.id>$2::uuid)ORDER BY c.id LIMIT 101';
 WHEN'education_document'THEN statement_value:='SELECT r.id,jsonb_build_object(''kind'',''education_document'',''record_id'',r.id,''state_hash'',repeat(''0'',64),''artifact_id'',r.id,''byte_sha256'',repeat(''0'',64))ref FROM public.education_document_records r WHERE r.organization_id=$1 AND($2::uuid IS NULL OR r.id>$2::uuid)ORDER BY r.id LIMIT 101';
 WHEN'frdo_packet'THEN
  IF to_regclass('public.uc_frdo_packets')IS NULL OR to_regprocedure('public.uc_frdo_packet_access(uuid,boolean)')IS NULL THEN PERFORM public.uc_archive_error('DEPENDENCY_UNAVAILABLE');END IF;
  statement_value:='SELECT p.id,jsonb_build_object(''kind'',''frdo_packet'',''packet_id'',p.id,''revision'',0,''state_hash'',repeat(''0'',64))ref FROM public.uc_frdo_packets p WHERE p.organization_id=$1 AND($2::uuid IS NULL OR p.id>$2::uuid)ORDER BY p.id LIMIT 101';
 WHEN'signature_evidence'THEN
  IF to_regclass('public.uc_signature_assurance_streams')IS NULL OR to_regprocedure('public.uc_signature_assurance_signature_fence(uuid,uuid,boolean,uuid)')IS NULL THEN PERFORM public.uc_archive_error('DEPENDENCY_UNAVAILABLE');END IF;
  statement_value:='SELECT s.id,jsonb_build_object(''kind'',''signature_evidence'',''signature_id'',s.id,''revision'',0,''state_hash'',repeat(''0'',64))ref FROM public.document_signatures s WHERE s.organization_id=$1 AND($2::uuid IS NULL OR s.id>$2::uuid)ORDER BY s.id LIMIT 101';
 END CASE;
 FOR candidate_row IN EXECUTE statement_value USING p_org,(position_value->>'id')::uuid LOOP
  IF scanned=100 OR visible=limit_value THEN next_value:=public.uc_archive_cursor(p_org,p_scope,query_key,last_position,NULL)#>>'{}';EXIT;END IF;
  scanned:=scanned+1;last_position:=jsonb_build_object('at','1970-01-01T00:00:00Z','id',candidate_row.id);
  BEGIN
   proof_value:=public.uc_archive_source(p_org,p_scope,candidate_row.ref,false,false);
   IF search_value<>''AND position(lower(search_value)IN lower(proof_value->>'label'))=0 THEN CONTINUE;END IF;
   fresh_ref:=public.uc_archive_current_source_ref(proof_value,p_org,p_scope);
   items_value:=items_value||jsonb_build_array(jsonb_build_object('source',fresh_ref,'label',proof_value->'label','subjects',proof_value->'subjects','attribution_actors',proof_value->'attribution_actors','history_kind',proof_value->'history_kind','expected_event_count',proof_value->'expected_event_count','file_count',jsonb_array_length(coalesce(proof_value->'private_files','[]'::jsonb)),'blockers',coalesce(proof_value->'source_blockers','[]'::jsonb)));visible:=visible+1;
  EXCEPTION WHEN SQLSTATE'PT403'OR SQLSTATE'PT404'OR SQLSTATE'PT422'THEN NULL;END;
 END LOOP;
 PERFORM public.uc_archive_fence(p_org,p_scope,ARRAY[auth.uid()],false,NULL);
 RETURN jsonb_build_object('kind','source_inventory','source_kind',source_kind,'search',search_value,'items',items_value,'next_cursor',next_value);
END;$archive$;


-- UC024 fragment 62_archive_package_inputs.sql
-- Persisted package inputs. Exact PostgreSQL JSON text is wrapped as a string before canonical export.
-- This preserves arbitrary source keys and numeric precision without claiming that PostgreSQL jsonb text is JavaScript canonical JSON.
CREATE FUNCTION public.uc_archive_json_literal(p_value jsonb)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $archive$
 SELECT jsonb_build_object('format','postgresql-jsonb-v1','value_jsonb_text',p_value::text)
$archive$;
CREATE FUNCTION public.uc_archive_package_guard()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $archive$
BEGIN
 IF TG_OP='DELETE'OR OLD.phase IN('sealed','failed')OR(to_jsonb(NEW)-ARRAY['phase','lease_id','lease_until','manifest','manifest_sha256','manifest_bytes','completeness','blockers','retained_people','sealed_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['phase','lease_id','lease_until','manifest','manifest_sha256','manifest_bytes','completeness','blockers','retained_people','sealed_at'])OR NOT(OLD.retained_people<@NEW.retained_people)OR NOT(OLD.phase='prepared'AND NEW.phase='generating'OR OLD.phase='generating'AND NEW.phase IN('generating','sealed','failed'))THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;RETURN NEW;
END;$archive$;
CREATE TRIGGER uc_archive_package_guard BEFORE UPDATE OR DELETE ON public.uc_archive_package_builds FOR EACH ROW EXECUTE FUNCTION public.uc_archive_package_guard();
CREATE FUNCTION public.uc_archive_package_access(p_org uuid,p_scope jsonb,p_package uuid,p_write boolean DEFAULT false,p_current boolean DEFAULT false)RETURNS public.uc_archive_package_builds LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE build_row public.uc_archive_package_builds;head public.uc_archive_cases;BEGIN
 SELECT b.*INTO build_row FROM public.uc_archive_package_builds b WHERE b.id=p_package AND b.organization_id=p_org;
 IF build_row.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
 head:=public.uc_archive_case_access(p_org,p_scope,build_row.case_id,p_write);
 PERFORM public.uc_archive_fence(p_org,head.scope,build_row.retained_people||head.retained_subjects||head.attribution_actors,p_write,NULL);
 IF p_current AND(head.revision<>build_row.input_revision OR head.state_hash<>build_row.input_state_hash)THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 IF p_write THEN SELECT b.*INTO build_row FROM public.uc_archive_package_builds b WHERE b.id=build_row.id FOR UPDATE NOWAIT;END IF;RETURN build_row;
END;$archive$;
CREATE FUNCTION public.uc_archive_package_projection(p_build public.uc_archive_package_builds)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $archive$
 SELECT jsonb_build_object('id',p_build.id,'case_id',p_build.case_id,'organization_id',p_build.organization_id,'actor_id',p_build.actor_id,'request_id',p_build.request_id,'input_revision',p_build.input_revision,'input_state_hash',p_build.input_state_hash,'phase',p_build.phase,'manifest_sha256',p_build.manifest_sha256,'manifest_bytes',p_build.manifest_bytes,'completeness',p_build.completeness,'blockers',p_build.blockers,'created_at',p_build.created_at,'sealed_at',p_build.sealed_at)
$archive$;
CREATE FUNCTION public.uc_archive_prepare_package(p_head public.uc_archive_cases,p_request uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE head public.uc_archive_cases;build_row public.uc_archive_package_builds;BEGIN
 head:=public.uc_archive_case_access(p_head.organization_id,p_head.scope,p_head.id,true);
 IF head.revision<>p_head.revision OR head.state_hash<>p_head.state_hash THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 IF NOT(public.uc_archive_caps(head.organization_id,head.scope)->>'can_operate')::boolean OR jsonb_array_length(head.members)=0 THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
 INSERT INTO public.uc_archive_package_builds(case_id,organization_id,actor_id,input_revision,input_state_hash,phase,request_id,retained_people)VALUES(head.id,head.organization_id,auth.uid(),head.revision,head.state_hash,'prepared',p_request,head.retained_subjects||head.attribution_actors||ARRAY[auth.uid()])RETURNING *INTO build_row;
 RETURN public.uc_archive_package_projection(build_row);
END;$archive$;
CREATE FUNCTION public.archive_package_context(p_org uuid,p_scope jsonb,p_package uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE build_row public.uc_archive_package_builds;case_event public.uc_archive_case_events;head public.uc_archive_cases;rule_row public.uc_archive_rule_revisions;member_files jsonb;member_value jsonb;capture_value jsonb;linked_capture jsonb;dependency_ref jsonb;event_value jsonb;record_value jsonb;records_value jsonb:='[]';files_value jsonb:='[]';case_history jsonb;source_history jsonb;blockers_value jsonb:='[]';BEGIN
 build_row:=public.uc_archive_package_access(p_org,p_scope,p_package,false,true);head:=public.uc_archive_case_access(p_org,p_scope,build_row.case_id,false);
 IF build_row.actor_id<>auth.uid()OR NOT(public.uc_archive_caps(p_org,head.scope)->>'can_operate')::boolean THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF head.rule_version_id IS NOT NULL THEN SELECT r.*INTO rule_row FROM public.uc_archive_rule_revisions r WHERE r.id=head.rule_version_id AND r.organization_id=p_org;END IF;
 FOR member_value IN SELECT m.value FROM jsonb_array_elements(head.members)m LOOP
  SELECT candidate.capture INTO linked_capture FROM public.uc_archive_case_events e CROSS JOIN LATERAL(SELECT e.private_capture capture WHERE e.private_capture->>'member_id'=member_value->>'id'UNION ALL SELECT a.value FROM jsonb_array_elements(coalesce(e.private_capture->'automatic_members','[]'::jsonb))a WHERE a.value->>'member_id'=member_value->>'id')candidate WHERE e.organization_id=p_org AND e.case_id=head.id AND e.revision<=build_row.input_revision ORDER BY e.revision DESC LIMIT 1;
  IF linked_capture IS NULL THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;capture_value:=linked_capture->'source_proof';
  IF capture_value->'source'IS DISTINCT FROM member_value->'source'THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  -- Current source authorization is mandatory even though the copied record is the immutable earlier capture.
  PERFORM public.uc_archive_source(p_org,head.scope,member_value->'source',false,false);
  source_history:='[]';
  FOR event_value IN SELECT h.value FROM jsonb_array_elements(capture_value->'history')h LOOP
   record_value:=public.uc_archive_json_literal(event_value->'payload');
   source_history:=source_history||jsonb_build_array(jsonb_build_object('id',event_value->'id','sequence',event_value->'sequence','source_revision',event_value->'source_revision','payload',record_value,'payload_sha256',public.uc_archive_event_hash(record_value)));
  END LOOP;
  record_value:=public.uc_archive_json_literal(capture_value->'captured_record');
  records_value:=records_value||jsonb_build_array(jsonb_build_object('export_id',member_value->'id','member_id',member_value->'id','source',member_value->'source','record_data',record_value,'record_sha256',public.uc_archive_event_hash(record_value),'references','[]'::jsonb,'history_kind',capture_value->'history_kind','expected_event_count',capture_value->'expected_event_count','events',source_history));
  member_files:=coalesce(linked_capture->'file_mapping','[]'::jsonb);
  IF rule_row.id IS NOT NULL AND member_value->'source'=rule_row.source_reference AND rule_row.source_check IS NOT NULL THEN
   SELECT coalesce(jsonb_agg(jsonb_set(f.value,'{private_file,known_sha256}',to_jsonb(rule_row.source_byte_sha256),true)ORDER BY f.ordinality),'[]')INTO member_files FROM jsonb_array_elements(member_files)WITH ORDINALITY f(value,ordinality);
  END IF;files_value:=files_value||member_files;
  IF capture_value->>'history_kind'='unverified_legacy'THEN blockers_value:=blockers_value||jsonb_build_array('PACKAGE_INCOMPLETE');END IF;
  blockers_value:=blockers_value||coalesce(capture_value->'source_blockers','[]'::jsonb);
 END LOOP;
 SELECT coalesce(jsonb_agg(public.uc_archive_event_projection(e)ORDER BY e.revision),'[]')INTO case_history FROM public.uc_archive_case_events e WHERE e.organization_id=p_org AND e.case_id=head.id AND e.revision<=build_row.input_revision;
 IF jsonb_array_length(case_history)<>build_row.input_revision OR jsonb_array_length(files_value)>10000 THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
 -- Every org-version reference carried by the case or its authority/history facts needs a copied member.
 FOR dependency_ref IN WITH RECURSIVE nodes(value)AS(SELECT jsonb_build_object('case_snapshot',public.uc_archive_case_projection(head),'case_events',case_history)UNION ALL SELECT child.value FROM nodes n CROSS JOIN LATERAL(SELECT a.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array'THEN n.value ELSE'[]'::jsonb END)a UNION ALL SELECT o.value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object'THEN n.value ELSE'{}'::jsonb END)o)child)SELECT DISTINCT n.value FROM nodes n WHERE n.value->>'kind'='organization_document_version'LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(head.members)m WHERE m.value->'source'=dependency_ref)THEN blockers_value:=blockers_value||jsonb_build_array('PACKAGE_INCOMPLETE');END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(x.value ORDER BY x.value),'[]')INTO blockers_value FROM(SELECT DISTINCT b.value FROM jsonb_array_elements(blockers_value)b)x;
 RETURN jsonb_build_object('schema_version',1,'build',public.uc_archive_package_projection(build_row),'actor_id',build_row.actor_id,'request_id',build_row.request_id,'case_snapshot',public.uc_archive_case_projection(head),'case_events',case_history,'records',records_value,'private_files',files_value,'blockers',blockers_value,'created_at',build_row.created_at,'lease_id',build_row.lease_id,'lease_until',build_row.lease_until);
END;$archive$;


-- UC024 fragment 63_archive_disposal_review.sql
-- A persisted destruction REVIEW is not destruction authority. No expiry job, physical deletion or implicit legal acceptance exists.
CREATE FUNCTION public.uc_archive_prepare_disposal(p_head public.uc_archive_cases)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE head public.uc_archive_cases;rule_row public.uc_archive_rule_revisions;review_row public.uc_archive_disposal_reviews;blockers_value jsonb:=jsonb_build_array('BACKUP_POLICY_UNVERIFIED','APPROVAL_REQUIRED');calculation_value jsonb;candidate_on date;duration_kind text;year_count integer;start_on date;BEGIN
 head:=public.uc_archive_case_access(p_head.organization_id,p_head.scope,p_head.id,true);
 IF head.revision<>p_head.revision OR head.state_hash<>p_head.state_hash THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 IF NOT(public.uc_archive_caps(head.organization_id,head.scope)->>'can_prepare_destruction_review')::boolean THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
 IF head.rule_version_id IS NULL THEN blockers_value:=blockers_value||jsonb_build_array('RETENTION_UNCLASSIFIED');
 ELSE
  SELECT r.*INTO rule_row FROM public.uc_archive_rule_revisions r WHERE r.id=head.rule_version_id AND r.organization_id=head.organization_id;
  PERFORM public.uc_archive_fence(head.organization_id,head.scope,rule_row.retained_people,true,NULL);
  PERFORM public.uc_archive_org_version(head.organization_id,rule_row.source_reference,false,true);PERFORM public.uc_archive_org_version(head.organization_id,rule_row.nomenclature_reference,true,true);
  IF rule_row.id IS NULL OR rule_row.state<>'approved'OR EXISTS(SELECT 1 FROM public.uc_archive_rule_revisions later WHERE later.organization_id=head.organization_id AND later.rule_id=rule_row.rule_id AND later.revision>rule_row.revision)THEN blockers_value:=blockers_value||jsonb_build_array('APPROVAL_STALE');END IF;
  duration_kind:=rule_row.data->'duration'->>'kind';
  IF duration_kind='permanent'THEN blockers_value:=blockers_value||jsonb_build_array('RETENTION_PERMANENT');
  ELSIF duration_kind IN('unknown','event_bound')OR duration_kind IS NULL THEN blockers_value:=blockers_value||jsonb_build_array('RETENTION_UNCLASSIFIED');END IF;
  IF coalesce((rule_row.data->>'requires_expert_review')::boolean,true)THEN blockers_value:=blockers_value||jsonb_build_array('EXPERT_REVIEW_REQUIRED');END IF;
 END IF;
 IF head.closure IS NULL THEN blockers_value:=blockers_value||jsonb_build_array('CLOSURE_REQUIRED');
 ELSIF rule_row.id IS NOT NULL AND head.closure->>'kind'IS DISTINCT FROM rule_row.data->>'start_event'THEN blockers_value:=blockers_value||jsonb_build_array('EVENT_MISMATCH');
 ELSIF duration_kind='years'THEN
  year_count:=(rule_row.data->'duration'->>'years')::integer;
  IF year_count NOT BETWEEN 1 AND 9000 THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  IF extract(year FROM(head.closure->>'actual_on')::date)::integer+1+year_count>9999 THEN blockers_value:=blockers_value||jsonb_build_array('RETENTION_UNCLASSIFIED');
  ELSE start_on:=make_date(extract(year FROM(head.closure->>'actual_on')::date)::integer+1,1,1);candidate_on:=make_date(extract(year FROM start_on)::integer+year_count,1,1);IF current_date<candidate_on THEN blockers_value:=blockers_value||jsonb_build_array('RETENTION_NOT_EXPIRED');END IF;END IF;
 END IF;
 IF jsonb_array_length(public.uc_archive_active_holds(head.hold_events))>0 THEN blockers_value:=blockers_value||jsonb_build_array('LEGAL_HOLD');END IF;
 SELECT coalesce(jsonb_agg(x.value ORDER BY x.value),'[]')INTO blockers_value FROM(SELECT DISTINCT b.value FROM jsonb_array_elements(blockers_value)b)x;
 calculation_value:=jsonb_build_object('evaluated_on',current_date,'rule_version_id',head.rule_version_id,'duration',rule_row.data->'duration','actual_closure',head.closure,'start_on',start_on,'expiry_candidate_on',candidate_on,'destruction_authorized',false,'physical_cleanup_claim',false,'legal_review_is_separate',true,'center_approval_is_separate',true);
 INSERT INTO public.uc_archive_disposal_reviews(case_id,organization_id,actor_id,case_revision,case_state_hash,rule_version_id,calculation,legal_hold_events,state,blocker_codes,retained_people)
 VALUES(head.id,head.organization_id,auth.uid(),head.revision,head.state_hash,head.rule_version_id,calculation_value,head.hold_events,'blocked',blockers_value,head.retained_subjects||head.attribution_actors||coalesce(rule_row.retained_people,'{}')||ARRAY[auth.uid()])RETURNING *INTO review_row;
 RETURN to_jsonb(review_row)-'retained_people';
END;$archive$;


-- UC024 fragment 64_archive_package_claim.sql
-- Original-JWT worker lease. The original actor is stored at preparation and never supplied by the browser as authority.
CREATE FUNCTION public.claim_archive_package(p_org uuid,p_scope jsonb,p_package uuid,p_request uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE build_row public.uc_archive_package_builds;BEGIN
 build_row:=public.uc_archive_package_access(p_org,p_scope,p_package,true,true);
 IF build_row.actor_id<>auth.uid()OR build_row.request_id<>p_request OR NOT(public.uc_archive_caps(p_org,p_scope)->>'can_operate')::boolean THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF build_row.phase='failed'THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 IF build_row.phase<>'sealed'AND(build_row.phase='prepared'OR build_row.lease_until<=clock_timestamp())THEN
  UPDATE public.uc_archive_package_builds b SET phase='generating',lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval'10 minutes'WHERE b.id=build_row.id RETURNING b.*INTO build_row;
 END IF;
 RETURN public.archive_package_context(p_org,p_scope,p_package)||jsonb_build_object('lease_id',build_row.lease_id,'lease_until',build_row.lease_until);
END;$archive$;


-- UC024 fragment 65_archive_package_seal.sql
-- One fixed trusted seal. No generic actor projection or arbitrary file-registration endpoint is granted.
CREATE FUNCTION public.commit_archive_package(p_package uuid,p_lease uuid,p_manifest jsonb,p_manifest_sha256 text,p_manifest_bytes bigint,p_files jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE build_row public.uc_archive_package_builds;head public.uc_archive_cases;context_value jsonb;manifest_literal text;file_value jsonb;proof_value jsonb;mapping_value jsonb;descriptor jsonb;member_value jsonb;object_value storage.objects;expected_files jsonb:='[]';all_people uuid[];expected_path text;claims_text text:=current_setting('request.jwt.claims',true);sub_text text:=current_setting('request.jwt.claim.sub',true);role_text text:=current_setting('request.jwt.claim.role',true);projected boolean:=false;replayed boolean:=false;BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR coalesce(claims_text,'')=''OR jsonb_typeof(claims_text::jsonb)IS DISTINCT FROM'object'OR claims_text::jsonb->>'role'IS DISTINCT FROM'service_role'OR nullif(claims_text::jsonb->>'sub','')IS NOT NULL THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 SELECT b.*INTO build_row FROM public.uc_archive_package_builds b WHERE b.id=p_package;
 IF build_row.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claim.role','',true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',build_row.actor_id)::text,true);projected:=true;
 SELECT c.*INTO head FROM public.uc_archive_cases c WHERE c.id=build_row.case_id AND c.organization_id=build_row.organization_id;
 build_row:=public.uc_archive_package_access(build_row.organization_id,head.scope,build_row.id,true,true);
 IF NOT(public.uc_archive_caps(build_row.organization_id,head.scope)->>'can_operate')::boolean OR p_lease IS NULL OR build_row.lease_id IS DISTINCT FROM p_lease OR build_row.phase NOT IN('generating','sealed')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 context_value:=public.archive_package_context(build_row.organization_id,head.scope,build_row.id);
 IF NOT public.uc_custom_journal_shape(p_manifest,ARRAY['schema_version','package_id','organization_id','case_id','case_revision','case_state_hash','created_at','completeness','case_snapshot','members','case_events','records','files','missing_member_ids','blockers'])OR p_manifest->'schema_version'<>'1'::jsonb OR p_manifest->>'package_id'IS DISTINCT FROM build_row.id::text OR p_manifest->>'organization_id'IS DISTINCT FROM build_row.organization_id::text OR p_manifest->>'case_id'IS DISTINCT FROM build_row.case_id::text OR p_manifest->'case_revision'IS DISTINCT FROM to_jsonb(build_row.input_revision)OR p_manifest->>'case_state_hash'IS DISTINCT FROM build_row.input_state_hash
 OR p_manifest->'created_at'IS DISTINCT FROM context_value->'created_at'OR p_manifest->'case_snapshot'IS DISTINCT FROM context_value->'case_snapshot'OR p_manifest->'members'IS DISTINCT FROM context_value->'case_snapshot'->'members'OR p_manifest->'case_events'IS DISTINCT FROM context_value->'case_events'OR p_manifest->'records'IS DISTINCT FROM context_value->'records'OR p_manifest->'missing_member_ids'IS DISTINCT FROM'[]'::jsonb OR p_manifest->'blockers'IS DISTINCT FROM context_value->'blockers'OR p_manifest->>'completeness'IS DISTINCT FROM(CASE WHEN jsonb_array_length(context_value->'blockers')=0 THEN'complete'ELSE'partial'END)
 OR jsonb_typeof(p_manifest->'files')IS DISTINCT FROM'array'OR jsonb_typeof(p_files)IS DISTINCT FROM'array'OR jsonb_array_length(p_files)>10000 OR jsonb_array_length(p_files)<>jsonb_array_length(context_value->'private_files')OR jsonb_array_length(p_manifest->'files')<>jsonb_array_length(p_files)THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 manifest_literal:=public.uc_archive_event_canonical(p_manifest);
 IF p_manifest_sha256 IS DISTINCT FROM public.uc_document_registry_hash(manifest_literal)OR p_manifest_bytes IS DISTINCT FROM octet_length(convert_to(manifest_literal,'UTF8'))::bigint OR p_manifest_bytes NOT BETWEEN 1 AND 4194304 THEN PERFORM public.uc_archive_error('HASH_MISMATCH');END IF;
 IF build_row.phase='sealed'THEN
  IF build_row.manifest IS DISTINCT FROM p_manifest OR build_row.manifest_sha256<>p_manifest_sha256 OR build_row.manifest_bytes<>p_manifest_bytes THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;replayed:=true;
 ELSE
  IF build_row.lease_until<=clock_timestamp()THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_files)f GROUP BY f.value->>'id'HAVING count(*)>1)OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_manifest->'files')f GROUP BY f.value->>'id'HAVING count(*)>1)THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  FOR file_value IN SELECT f.value FROM jsonb_array_elements(p_manifest->'files')f LOOP
   SELECT f.value INTO proof_value FROM jsonb_array_elements(p_files)f WHERE f.value->'id'=file_value->'id';
   SELECT f.value INTO mapping_value FROM jsonb_array_elements(context_value->'private_files')f WHERE f.value->'file_id'=file_value->'id';descriptor:=mapping_value->'private_file';
   SELECT m.value INTO member_value FROM jsonb_array_elements(head.members)m WHERE m.value->'id'=file_value->'member_id'AND m.value->'file_ids'@>jsonb_build_array(file_value->'id');
   IF proof_value IS NULL OR mapping_value IS NULL OR member_value IS NULL OR NOT public.uc_custom_journal_shape(proof_value,ARRAY['id','member_id','object_id','object_updated_at','byte_sha256','byte_size','mime_type','readback_sha256'])OR NOT public.uc_custom_journal_shape(file_value,ARRAY['id','member_id','source','byte_sha256','byte_size','mime_type','original_name','archive_path'])OR NOT public.uc_custom_journal_uuid(proof_value->'object_id')OR proof_value->'member_id'IS DISTINCT FROM member_value->'id'OR file_value->'source'IS DISTINCT FROM member_value->'source'OR proof_value->'byte_size'IS DISTINCT FROM descriptor->'byte_size'OR proof_value->'mime_type'IS DISTINCT FROM descriptor->'mime_type'OR file_value->'byte_size'IS DISTINCT FROM proof_value->'byte_size'OR file_value->'mime_type'IS DISTINCT FROM proof_value->'mime_type'OR file_value->'byte_sha256'IS DISTINCT FROM proof_value->'byte_sha256'OR proof_value->'readback_sha256'IS DISTINCT FROM proof_value->'byte_sha256'OR coalesce(proof_value->>'byte_sha256','')!~'^[a-f0-9]{64}$'OR descriptor?'known_sha256'AND descriptor->'known_sha256'IS DISTINCT FROM proof_value->'byte_sha256'OR file_value->>'original_name'IS DISTINCT FROM(file_value->>'id')||'.bin'OR file_value->>'archive_path'IS DISTINCT FROM'files/'||(file_value->>'id')||'/'||(file_value->>'byte_sha256')||'.bin'THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
   expected_path:=build_row.organization_id::text||'/'||build_row.id::text||'/files/'||(file_value->>'id')||'/'||(file_value->>'byte_sha256')||'.bin';
   SELECT o.*INTO object_value FROM storage.objects o JOIN storage.buckets bucket ON bucket.id=o.bucket_id AND NOT bucket.public WHERE o.id=(proof_value->>'object_id')::uuid AND o.bucket_id='archive-case-artifacts'AND o.name=expected_path FOR SHARE OF o NOWAIT;
   IF object_value.id IS NULL OR object_value.updated_at IS DISTINCT FROM(proof_value->>'object_updated_at')::timestamptz OR object_value.owner IS NOT NULL OR nullif(object_value.owner_id,'')IS NOT NULL OR object_value.metadata->>'mimetype'IS DISTINCT FROM proof_value->>'mime_type'OR coalesce(object_value.metadata->>'size',object_value.metadata->>'contentLength')IS DISTINCT FROM proof_value->>'byte_size'OR NOT public.uc_custom_journal_uuid(object_value.user_metadata->'lease_id')OR(object_value.user_metadata-'lease_id')IS DISTINCT FROM jsonb_build_object('package_id',build_row.id,'file_id',file_value->'id','sha256',file_value->'byte_sha256')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
   INSERT INTO public.uc_archive_package_files(id,package_id,organization_id,member_id,source_reference,bucket_id,object_path,object_id,object_updated_at,byte_sha256,byte_size,mime_type,readback_sha256,retained_people)VALUES((file_value->>'id')::uuid,build_row.id,build_row.organization_id,(file_value->>'member_id')::uuid,member_value->'source','archive-case-artifacts',expected_path,object_value.id,object_value.updated_at,proof_value->>'byte_sha256',(proof_value->>'byte_size')::bigint,proof_value->>'mime_type',proof_value->>'readback_sha256',build_row.retained_people);
  END LOOP;
  PERFORM public.uc_archive_package_access(build_row.organization_id,head.scope,build_row.id,true,true);
  UPDATE public.uc_archive_package_builds b SET phase='sealed',manifest=p_manifest,manifest_sha256=p_manifest_sha256,manifest_bytes=p_manifest_bytes,completeness=p_manifest->>'completeness',blockers=p_manifest->'blockers',sealed_at=clock_timestamp()WHERE b.id=build_row.id AND b.lease_id=p_lease RETURNING b.*INTO build_row;
  IF build_row.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);projected:=false;
 RETURN public.uc_archive_package_projection(build_row)||jsonb_build_object('actor_id',build_row.actor_id,'request_id',build_row.request_id,'replayed',replayed);
 EXCEPTION WHEN OTHERS THEN IF projected THEN PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);END IF;RAISE;
END;$archive$;


-- UC024 fragment 66_archive_file_context.sql
-- Exact job-bound Storage context. This is not a caller-path or generic file-read API.
CREATE FUNCTION public.archive_package_object_context(p_org uuid,p_scope jsonb,p_package uuid,p_lease uuid,p_file uuid,p_kind text,p_sha256 text DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE build_row public.uc_archive_package_builds;head public.uc_archive_cases;context_value jsonb;mapping_value jsonb;descriptor jsonb;object_row storage.objects;path_value text;bucket_value text;BEGIN
 build_row:=public.uc_archive_package_access(p_org,p_scope,p_package,false,true);
 IF build_row.actor_id<>auth.uid()OR build_row.phase<>'generating'OR p_lease IS NULL OR build_row.lease_id IS DISTINCT FROM p_lease OR build_row.lease_until<=clock_timestamp()OR NOT coalesce(p_kind IN('source','destination'),false)THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 context_value:=public.archive_package_context(p_org,p_scope,p_package);
 SELECT f.value INTO mapping_value FROM jsonb_array_elements(context_value->'private_files')f WHERE f.value->>'file_id'=p_file::text;descriptor:=mapping_value->'private_file';
 IF mapping_value IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
 IF p_kind='source'THEN
  IF descriptor->>'kind'='signature_protected_v1'OR p_sha256 IS NOT NULL THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  bucket_value:=descriptor->>'bucket';path_value:=descriptor->>'path';
  SELECT o.*INTO object_row FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id AND NOT b.public WHERE o.id=(descriptor->>'object_id')::uuid AND o.bucket_id=bucket_value AND o.name=path_value FOR SHARE OF o NOWAIT;
  IF object_row.id IS NULL OR object_row.updated_at IS DISTINCT FROM(descriptor->>'object_updated_at')::timestamptz THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 ELSE
  IF coalesce(p_sha256,'')!~'^[a-f0-9]{64}$'OR descriptor?'known_sha256'AND descriptor->>'known_sha256'<>p_sha256 THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  bucket_value:='archive-case-artifacts';path_value:=p_org::text||'/'||p_package::text||'/files/'||p_file::text||'/'||p_sha256||'.bin';
  SELECT o.*INTO object_row FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id AND NOT b.public WHERE o.bucket_id=bucket_value AND o.name=path_value FOR SHARE OF o NOWAIT;
  IF object_row.id IS NULL OR object_row.owner IS NOT NULL OR nullif(object_row.owner_id,'')IS NOT NULL OR NOT public.uc_custom_journal_uuid(object_row.user_metadata->'lease_id')OR(object_row.user_metadata-'lease_id')IS DISTINCT FROM jsonb_build_object('package_id',p_package,'file_id',p_file,'sha256',p_sha256)THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 END IF;
 IF object_row.metadata->>'mimetype'IS DISTINCT FROM descriptor->>'mime_type'OR coalesce(object_row.metadata->>'size',object_row.metadata->>'contentLength')IS DISTINCT FROM descriptor->>'byte_size'THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 PERFORM public.uc_archive_package_access(p_org,p_scope,p_package,false,true);
 RETURN jsonb_build_object('schema_version',1,'package_id',p_package,'lease_id',p_lease,'file_id',p_file,'bucket',bucket_value,'path',path_value,'object_id',object_row.id,'object_updated_at',object_row.updated_at,'byte_size',descriptor->'byte_size','mime_type',descriptor->'mime_type');
END;$archive$;


-- UC024 fragment 67_archive_sealed_reads.sql
-- UC024 sealed historical package reads. Original caller must pass every current source and retained-subject fence.
-- These functions expose no signed URL or bearer token. Byte transport rechecks this exact context after the read.
CREATE FUNCTION public.archive_sealed_package_context(p_org uuid,p_scope jsonb,p_package uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE package_row public.uc_archive_package_builds;literal_value text;BEGIN
 package_row:=public.uc_archive_package_access(p_org,p_scope,p_package,false,false);
 IF package_row.phase<>'sealed'OR package_row.manifest IS NULL THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 literal_value:=public.uc_archive_event_canonical(package_row.manifest);
 IF public.uc_document_registry_hash(literal_value)IS DISTINCT FROM package_row.manifest_sha256 OR octet_length(convert_to(literal_value,'UTF8'))::bigint IS DISTINCT FROM package_row.manifest_bytes THEN PERFORM public.uc_archive_error('HASH_MISMATCH');END IF;
 PERFORM public.uc_archive_fence(p_org,p_scope,package_row.retained_people,false,NULL);
 RETURN jsonb_build_object('version',1,'organization_id',p_org,'scope',p_scope,'actor_id',auth.uid(),'package',public.uc_archive_package_projection(package_row),'manifest_json',literal_value);
END;$archive$;
CREATE FUNCTION public.archive_sealed_file_context(p_org uuid,p_scope jsonb,p_package uuid,p_file uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE package_row public.uc_archive_package_builds;file_row public.uc_archive_package_files;object_row storage.objects;BEGIN
 package_row:=public.uc_archive_package_access(p_org,p_scope,p_package,false,false);
 IF package_row.phase<>'sealed'THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 SELECT f.*INTO file_row FROM public.uc_archive_package_files f WHERE f.package_id=package_row.id AND f.organization_id=p_org AND f.id=p_file;
 IF file_row.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
 PERFORM public.uc_archive_fence(p_org,p_scope,package_row.retained_people||file_row.retained_people,false,NULL);
 SELECT o.*INTO object_row FROM storage.objects o JOIN storage.buckets bucket ON bucket.id=o.bucket_id AND NOT bucket.public WHERE o.id=file_row.object_id AND o.bucket_id=file_row.bucket_id AND o.name=file_row.object_path FOR SHARE OF o NOWAIT;
 IF object_row.id IS NULL OR object_row.updated_at IS DISTINCT FROM file_row.object_updated_at OR object_row.owner IS NOT NULL OR nullif(object_row.owner_id,'')IS NOT NULL OR object_row.metadata->>'mimetype'IS DISTINCT FROM file_row.mime_type OR coalesce(object_row.metadata->>'size',object_row.metadata->>'contentLength')IS DISTINCT FROM file_row.byte_size::text OR object_row.user_metadata->>'package_id'IS DISTINCT FROM package_row.id::text OR object_row.user_metadata->>'file_id'IS DISTINCT FROM file_row.id::text OR object_row.user_metadata->>'sha256'IS DISTINCT FROM file_row.byte_sha256 OR file_row.readback_sha256 IS DISTINCT FROM file_row.byte_sha256 THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 PERFORM public.uc_archive_fence(p_org,p_scope,package_row.retained_people||file_row.retained_people,false,NULL);
 RETURN jsonb_build_object('version',1,'organization_id',p_org,'scope',p_scope,'actor_id',auth.uid(),'package_id',package_row.id,'manifest_sha256',package_row.manifest_sha256,'file_id',file_row.id,'bucket',file_row.bucket_id,'path',file_row.object_path,'object_id',file_row.object_id,'object_updated_at',file_row.object_updated_at,'byte_sha256',file_row.byte_sha256,'byte_size',file_row.byte_size,'mime_type',file_row.mime_type);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;


-- UC024 fragment 68_archive_restore.sql
-- UC024 historical restore. Only immutable copies and inert projections are created; no live business API is invoked.
CREATE FUNCTION public.uc_archive_restore_guard()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $archive$
BEGIN
 IF TG_OP='DELETE'OR OLD.state IN('verified','failed')OR(to_jsonb(NEW)-ARRAY['state','lease_id','lease_until','verified_file_ids','projection_sha256','failure_code','completed_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','lease_id','lease_until','verified_file_ids','projection_sha256','failure_code','completed_at'])OR NOT(OLD.state='prepared'AND NEW.state='verifying'OR OLD.state='verifying'AND NEW.state IN('verifying','verified','failed'))THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;RETURN NEW;
END;$archive$;
CREATE TRIGGER uc_archive_restore_guard BEFORE UPDATE OR DELETE ON public.uc_archive_restore_runs FOR EACH ROW EXECUTE FUNCTION public.uc_archive_restore_guard();
CREATE FUNCTION public.uc_archive_restore_projection(p_run public.uc_archive_restore_runs)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $archive$
 SELECT jsonb_build_object('id',p_run.id,'organization_id',p_run.organization_id,'package_id',p_run.package_id,'actor_id',p_run.actor_id,'request_id',p_run.request_id,'manifest_sha256',p_run.manifest_sha256,'state',p_run.state,'verified_file_ids',p_run.verified_file_ids,'projection_sha256',p_run.projection_sha256,'created_at',p_run.created_at,'completed_at',p_run.completed_at,'historical_only',true,'live_business_actions',0,'source_reissued',false)
$archive$;
CREATE FUNCTION public.uc_archive_restore_access(p_org uuid,p_scope jsonb,p_restore uuid,p_write boolean DEFAULT false)RETURNS public.uc_archive_restore_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE run_row public.uc_archive_restore_runs;package_row public.uc_archive_package_builds;BEGIN
 SELECT r.*INTO run_row FROM public.uc_archive_restore_runs r WHERE r.id=p_restore AND r.organization_id=p_org;
 IF run_row.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
 package_row:=public.uc_archive_package_access(p_org,p_scope,run_row.package_id,p_write,false);
 PERFORM public.uc_archive_fence(p_org,p_scope,run_row.retained_people||package_row.retained_people,p_write,NULL);
 IF package_row.phase<>'sealed'OR package_row.completeness<>'complete'OR package_row.manifest_sha256 IS DISTINCT FROM run_row.manifest_sha256 THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
 IF run_row.state='verified'THEN
  IF(SELECT count(*)FROM public.uc_archive_restore_files f WHERE f.restore_id=run_row.id AND f.organization_id=p_org)<>jsonb_array_length(package_row.manifest->'files')OR EXISTS(
   SELECT 1 FROM public.uc_archive_restore_files f LEFT JOIN storage.objects o ON o.id=f.object_id AND o.bucket_id=f.bucket_id AND o.name=f.object_path LEFT JOIN storage.buckets bucket ON bucket.id=o.bucket_id
   WHERE f.restore_id=run_row.id AND f.organization_id=p_org AND(o.id IS NULL OR coalesce(bucket.public,true)OR o.updated_at IS DISTINCT FROM f.object_updated_at OR o.owner IS NOT NULL OR nullif(o.owner_id,'')IS NOT NULL OR o.metadata->>'mimetype'IS DISTINCT FROM f.mime_type OR coalesce(o.metadata->>'size',o.metadata->>'contentLength')IS DISTINCT FROM f.byte_size::text OR f.readback_sha256 IS DISTINCT FROM f.byte_sha256 OR NOT public.uc_custom_journal_uuid(o.user_metadata->'lease_id')OR(o.user_metadata-'lease_id')IS DISTINCT FROM jsonb_build_object('restore_id',run_row.id,'package_id',run_row.package_id,'file_id',f.id,'sha256',f.byte_sha256)))THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 END IF;
 IF p_write THEN
  IF NOT(public.uc_archive_caps(p_org,p_scope)->>'can_operate')::boolean THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
  SELECT r.*INTO run_row FROM public.uc_archive_restore_runs r WHERE r.id=p_restore AND r.organization_id=p_org FOR UPDATE NOWAIT;
 END IF;RETURN run_row;
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;
CREATE FUNCTION public.uc_archive_prepare_restore(p_head public.uc_archive_cases,p_request uuid,p_package uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE head public.uc_archive_cases;package_row public.uc_archive_package_builds;run_row public.uc_archive_restore_runs;BEGIN
 head:=public.uc_archive_case_access(p_head.organization_id,p_head.scope,p_head.id,true);
 IF head.revision<>p_head.revision OR head.state_hash<>p_head.state_hash THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 package_row:=public.uc_archive_package_access(head.organization_id,head.scope,p_package,true,false);
 IF package_row.case_id<>head.id OR package_row.phase<>'sealed'OR package_row.completeness<>'complete'THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
 IF NOT(public.uc_archive_caps(head.organization_id,head.scope)->>'can_operate')::boolean THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
 INSERT INTO public.uc_archive_restore_runs(organization_id,package_id,actor_id,request_id,manifest_sha256,state,retained_people)VALUES(head.organization_id,package_row.id,auth.uid(),p_request,package_row.manifest_sha256,'prepared',package_row.retained_people||head.retained_subjects||head.attribution_actors||ARRAY[auth.uid()])RETURNING *INTO run_row;
 RETURN public.uc_archive_restore_projection(run_row);
END;$archive$;
CREATE FUNCTION public.archive_restore_context(p_org uuid,p_scope jsonb,p_restore uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE run_row public.uc_archive_restore_runs;package_value jsonb;BEGIN
 run_row:=public.uc_archive_restore_access(p_org,p_scope,p_restore,false);
 IF run_row.actor_id<>auth.uid()OR NOT(public.uc_archive_caps(p_org,p_scope)->>'can_operate')::boolean THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 package_value:=public.archive_sealed_package_context(p_org,p_scope,run_row.package_id);
 RETURN jsonb_build_object('version',1,'organization_id',p_org,'scope',p_scope,'actor_id',auth.uid(),'restore',public.uc_archive_restore_projection(run_row),'manifest_json',package_value->'manifest_json','lease_id',run_row.lease_id,'lease_until',run_row.lease_until);
END;$archive$;
CREATE FUNCTION public.claim_archive_restore(p_org uuid,p_scope jsonb,p_restore uuid,p_request uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE run_row public.uc_archive_restore_runs;BEGIN
 run_row:=public.uc_archive_restore_access(p_org,p_scope,p_restore,true);
 IF run_row.actor_id<>auth.uid()OR p_request IS NULL OR run_row.request_id<>p_request THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF run_row.state='failed'THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
 IF run_row.state<>'verified'AND(run_row.state='prepared'OR run_row.lease_until<=clock_timestamp())THEN UPDATE public.uc_archive_restore_runs r SET state='verifying',lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval'10 minutes'WHERE r.id=run_row.id RETURNING r.*INTO run_row;END IF;
 RETURN public.archive_restore_context(p_org,p_scope,p_restore);
END;$archive$;
CREATE FUNCTION public.archive_restore_object_context(p_org uuid,p_scope jsonb,p_restore uuid,p_lease uuid,p_file uuid,p_side text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE run_row public.uc_archive_restore_runs;source_value jsonb;object_row storage.objects;path_value text;BEGIN
 run_row:=public.uc_archive_restore_access(p_org,p_scope,p_restore,false);
 IF run_row.actor_id<>auth.uid()OR NOT(public.uc_archive_caps(p_org,p_scope)->>'can_operate')::boolean THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF p_side IS NULL OR p_side NOT IN('source','destination')OR p_lease IS NULL OR run_row.lease_id IS DISTINCT FROM p_lease OR run_row.state NOT IN('verifying','verified')OR(run_row.state='verifying'AND run_row.lease_until<=clock_timestamp())THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 source_value:=public.archive_sealed_file_context(p_org,p_scope,run_row.package_id,p_file);
 IF p_side='source'THEN RETURN source_value||jsonb_build_object('restore_id',run_row.id,'lease_id',p_lease,'side',p_side);END IF;
 path_value:=p_org::text||'/restores/'||run_row.id::text||'/files/'||p_file::text||'/'||(source_value->>'byte_sha256')||'.bin';
 SELECT o.*INTO object_row FROM storage.objects o JOIN storage.buckets bucket ON bucket.id=o.bucket_id AND NOT bucket.public WHERE o.bucket_id='archive-case-artifacts'AND o.name=path_value FOR SHARE OF o NOWAIT;
 IF object_row.id IS NOT NULL AND(object_row.owner IS NOT NULL OR nullif(object_row.owner_id,'')IS NOT NULL OR object_row.metadata->>'mimetype'IS DISTINCT FROM source_value->>'mime_type'OR coalesce(object_row.metadata->>'size',object_row.metadata->>'contentLength')IS DISTINCT FROM source_value->>'byte_size'OR NOT public.uc_custom_journal_uuid(object_row.user_metadata->'lease_id')OR(object_row.user_metadata-'lease_id')IS DISTINCT FROM jsonb_build_object('restore_id',run_row.id,'package_id',run_row.package_id,'file_id',p_file,'sha256',source_value->'byte_sha256'))THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 RETURN(source_value-ARRAY['path','object_id','object_updated_at'])||jsonb_build_object('restore_id',run_row.id,'lease_id',p_lease,'side',p_side,'path',path_value,'object_id',object_row.id,'object_updated_at',object_row.updated_at);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;


-- UC024 fragment 69_archive_restore_commit.sql
-- Fixed trusted restore commit. Projections are derived only from the sealed manifest; callers cannot provide arbitrary live rows.
CREATE FUNCTION public.commit_archive_restore(p_restore uuid,p_lease uuid,p_manifest_sha256 text,p_files jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE run_row public.uc_archive_restore_runs;package_row public.uc_archive_package_builds;head public.uc_archive_cases;manifest_value jsonb;file_value jsonb;proof_value jsonb;object_row storage.objects;path_value text;projection_value jsonb;projection_hash text;verified_ids uuid[]:='{}';claims_text text:=current_setting('request.jwt.claims',true);sub_text text:=current_setting('request.jwt.claim.sub',true);role_text text:=current_setting('request.jwt.claim.role',true);projected boolean:=false;BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR coalesce(claims_text,'')=''OR jsonb_typeof(claims_text::jsonb)IS DISTINCT FROM'object'OR claims_text::jsonb->>'role'IS DISTINCT FROM'service_role'OR nullif(claims_text::jsonb->>'sub','')IS NOT NULL THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 SELECT r.*INTO run_row FROM public.uc_archive_restore_runs r WHERE r.id=p_restore;
 IF run_row.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
 SELECT b.*INTO package_row FROM public.uc_archive_package_builds b WHERE b.id=run_row.package_id AND b.organization_id=run_row.organization_id;
 SELECT c.*INTO head FROM public.uc_archive_cases c WHERE c.id=package_row.case_id AND c.organization_id=run_row.organization_id;
 PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claim.role','',true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',run_row.actor_id)::text,true);projected:=true;
 run_row:=public.uc_archive_restore_access(run_row.organization_id,head.scope,run_row.id,true);
 IF p_lease IS NULL OR run_row.lease_id IS DISTINCT FROM p_lease OR run_row.manifest_sha256 IS DISTINCT FROM p_manifest_sha256 OR run_row.state NOT IN('verifying','verified')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 manifest_value:=package_row.manifest;
 IF run_row.state='verified'THEN
  -- Replay still requires current rights to the entire source, manifest and all copied subjects.
  PERFORM public.archive_restore_context(run_row.organization_id,head.scope,run_row.id);
 ELSE
  IF run_row.lease_until<=clock_timestamp()OR jsonb_typeof(p_files)IS DISTINCT FROM'array'OR jsonb_array_length(p_files)<>jsonb_array_length(manifest_value->'files')OR jsonb_array_length(p_files)>10000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_files)f GROUP BY f.value->>'file_id'HAVING count(*)>1)THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
  FOR file_value IN SELECT f.value FROM jsonb_array_elements(manifest_value->'files')f LOOP
   SELECT f.value INTO proof_value FROM jsonb_array_elements(p_files)f WHERE f.value->'file_id'=file_value->'id';
   IF proof_value IS NULL OR NOT public.uc_custom_journal_shape(proof_value,ARRAY['file_id','object_id','object_updated_at','byte_sha256','byte_size','mime_type','readback_sha256'])OR NOT public.uc_custom_journal_uuid(proof_value->'object_id')OR proof_value->'byte_sha256'IS DISTINCT FROM file_value->'byte_sha256'OR proof_value->'readback_sha256'IS DISTINCT FROM file_value->'byte_sha256'OR proof_value->'byte_size'IS DISTINCT FROM file_value->'byte_size'OR proof_value->'mime_type'IS DISTINCT FROM file_value->'mime_type'THEN PERFORM public.uc_archive_error('HASH_MISMATCH');END IF;
   PERFORM public.archive_sealed_file_context(run_row.organization_id,head.scope,run_row.package_id,(file_value->>'id')::uuid);
   path_value:=run_row.organization_id::text||'/restores/'||run_row.id::text||'/files/'||(file_value->>'id')||'/'||(file_value->>'byte_sha256')||'.bin';
   SELECT o.*INTO object_row FROM storage.objects o JOIN storage.buckets bucket ON bucket.id=o.bucket_id AND NOT bucket.public WHERE o.id=(proof_value->>'object_id')::uuid AND o.bucket_id='archive-case-artifacts'AND o.name=path_value FOR SHARE OF o NOWAIT;
   IF object_row.id IS NULL OR object_row.updated_at IS DISTINCT FROM(proof_value->>'object_updated_at')::timestamptz OR object_row.owner IS NOT NULL OR nullif(object_row.owner_id,'')IS NOT NULL OR object_row.metadata->>'mimetype'IS DISTINCT FROM file_value->>'mime_type'OR coalesce(object_row.metadata->>'size',object_row.metadata->>'contentLength')IS DISTINCT FROM file_value->>'byte_size'OR NOT public.uc_custom_journal_uuid(object_row.user_metadata->'lease_id')OR(object_row.user_metadata-'lease_id')IS DISTINCT FROM jsonb_build_object('restore_id',run_row.id,'package_id',run_row.package_id,'file_id',file_value->'id','sha256',file_value->'byte_sha256')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
   INSERT INTO public.uc_archive_restore_files(restore_id,id,package_id,organization_id,bucket_id,object_path,object_id,object_updated_at,byte_sha256,byte_size,mime_type,readback_sha256,retained_people)VALUES(run_row.id,(file_value->>'id')::uuid,run_row.package_id,run_row.organization_id,'archive-case-artifacts',path_value,object_row.id,object_row.updated_at,file_value->>'byte_sha256',(file_value->>'byte_size')::bigint,file_value->>'mime_type',proof_value->>'readback_sha256',run_row.retained_people);
   verified_ids:=verified_ids||(file_value->>'id')::uuid;
  END LOOP;
  projection_value:=jsonb_build_object('schema_version',1,'restore_id',run_row.id,'source_organization_id',run_row.organization_id,'target_organization_id',run_row.organization_id,'source_case_id',package_row.case_id,'source_manifest_sha256',run_row.manifest_sha256,'historical_only',true,'case_snapshot',manifest_value->'case_snapshot','case_events',manifest_value->'case_events','records',manifest_value->'records');
  projection_hash:=public.uc_archive_event_hash(projection_value);
  INSERT INTO public.uc_archive_restore_projections(restore_id,organization_id,entity_kind,export_id,projection,projection_sha256,retained_people)VALUES(run_row.id,run_row.organization_id,'case_snapshot',package_row.case_id,projection_value,projection_hash,run_row.retained_people);
  FOR file_value IN SELECT r.value FROM jsonb_array_elements(manifest_value->'records')r LOOP INSERT INTO public.uc_archive_restore_projections(restore_id,organization_id,entity_kind,export_id,projection,projection_sha256,retained_people)VALUES(run_row.id,run_row.organization_id,'record',(file_value->>'export_id')::uuid,file_value,public.uc_archive_event_hash(file_value),run_row.retained_people);END LOOP;
  FOR file_value IN SELECT e.value FROM jsonb_array_elements(manifest_value->'case_events')e LOOP INSERT INTO public.uc_archive_restore_projections(restore_id,organization_id,entity_kind,export_id,projection,projection_sha256,retained_people)VALUES(run_row.id,run_row.organization_id,'case_event',(file_value->>'id')::uuid,file_value,public.uc_archive_event_hash(file_value),run_row.retained_people);END LOOP;
  FOR file_value IN SELECT f.value FROM jsonb_array_elements(manifest_value->'files')f LOOP
   projection_value:=jsonb_build_object('file_id',file_value->'id','source_package_id',run_row.package_id,'quarantine_path','quarantine/'||run_row.id::text||'/'||(file_value->>'archive_path'),'byte_sha256',file_value->'byte_sha256','byte_size',file_value->'byte_size','readback_sha256',file_value->'byte_sha256');
   INSERT INTO public.uc_archive_restore_projections(restore_id,organization_id,entity_kind,export_id,projection,projection_sha256,retained_people)VALUES(run_row.id,run_row.organization_id,'file_readback',(file_value->>'id')::uuid,projection_value,public.uc_archive_event_hash(projection_value),run_row.retained_people);
  END LOOP;
  PERFORM public.uc_archive_restore_access(run_row.organization_id,head.scope,run_row.id,true);
  UPDATE public.uc_archive_restore_runs r SET state='verified',verified_file_ids=verified_ids,projection_sha256=projection_hash,completed_at=clock_timestamp()WHERE r.id=run_row.id AND r.lease_id=p_lease RETURNING r.*INTO run_row;
  IF run_row.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);projected:=false;
 RETURN public.uc_archive_restore_projection(run_row);
 EXCEPTION WHEN OTHERS THEN IF projected THEN PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);END IF;RAISE;
END;$archive$;


-- UC024 fragment 69a_archive_restore_storage.sql
-- Called only from the archive Storage BEFORE INSERT trigger after its original service-JWT/NULL-owner checks.
CREATE FUNCTION public.uc_archive_restore_insert(p_new storage.objects)RETURNS storage.objects LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE run_row public.uc_archive_restore_runs;package_row public.uc_archive_package_builds;head public.uc_archive_cases;expected_value jsonb;claims_text text:=current_setting('request.jwt.claims',true);sub_text text:=current_setting('request.jwt.claim.sub',true);role_text text:=current_setting('request.jwt.claim.role',true);projected boolean:=false;BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR p_new.bucket_id<>'archive-case-artifacts'OR p_new.owner IS NOT NULL OR nullif(p_new.owner_id,'')IS NOT NULL OR coalesce(claims_text,'')=''OR jsonb_typeof(claims_text::jsonb)IS DISTINCT FROM'object'OR claims_text::jsonb->>'role'IS DISTINCT FROM'service_role'OR nullif(claims_text::jsonb->>'sub','')IS NOT NULL THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF NOT public.uc_custom_journal_shape(p_new.user_metadata,ARRAY['restore_id','package_id','lease_id','file_id','sha256'])OR NOT public.uc_custom_journal_uuid(p_new.user_metadata->'restore_id')OR NOT public.uc_custom_journal_uuid(p_new.user_metadata->'package_id')OR NOT public.uc_custom_journal_uuid(p_new.user_metadata->'lease_id')OR NOT public.uc_custom_journal_uuid(p_new.user_metadata->'file_id')OR coalesce(p_new.user_metadata->>'sha256','')!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 SELECT r.*INTO run_row FROM public.uc_archive_restore_runs r WHERE r.id=(p_new.user_metadata->>'restore_id')::uuid;
 IF run_row.id IS NULL OR run_row.state<>'verifying'OR run_row.lease_id::text IS DISTINCT FROM p_new.user_metadata->>'lease_id'OR run_row.package_id::text IS DISTINCT FROM p_new.user_metadata->>'package_id'OR run_row.lease_until<=clock_timestamp()THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 SELECT b.*INTO package_row FROM public.uc_archive_package_builds b WHERE b.id=run_row.package_id AND b.organization_id=run_row.organization_id;
 SELECT c.*INTO head FROM public.uc_archive_cases c WHERE c.id=package_row.case_id AND c.organization_id=run_row.organization_id;
 PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claim.role','',true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',run_row.actor_id)::text,true);projected:=true;
 run_row:=public.uc_archive_restore_access(run_row.organization_id,head.scope,run_row.id,true);
 expected_value:=public.archive_restore_object_context(run_row.organization_id,head.scope,run_row.id,run_row.lease_id,(p_new.user_metadata->>'file_id')::uuid,'destination');
 IF expected_value->'object_id'<>'null'::jsonb OR p_new.name IS DISTINCT FROM expected_value->>'path'OR p_new.metadata->>'mimetype'IS DISTINCT FROM expected_value->>'mime_type'OR coalesce(p_new.metadata->>'size',p_new.metadata->>'contentLength')IS DISTINCT FROM expected_value->>'byte_size'OR p_new.user_metadata->>'sha256'IS DISTINCT FROM expected_value->>'byte_sha256'THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);projected:=false;RETURN p_new;
 EXCEPTION WHEN OTHERS THEN IF projected THEN PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);END IF;RAISE;
END;$archive$;


-- UC024 fragment 70_archive_public_api.sql
-- UC024 original-JWT public ABI. Private helpers stay ungranted until90 ACL assembly.
-- Opaque cursors contain only encrypted scan positions; denied case identities/counts are never disclosed.
CREATE TABLE public.uc_archive_org_keys(organization_id uuid PRIMARY KEY,secret bytea NOT NULL DEFAULT gen_random_bytes(32)CHECK(octet_length(secret)=32),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.uc_archive_org_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uc_archive_org_keys FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER uc_archive_org_key_immutable BEFORE UPDATE OR DELETE ON public.uc_archive_org_keys FOR EACH ROW EXECUTE FUNCTION public.uc_archive_immutable();
CREATE FUNCTION public.uc_archive_cursor(p_org uuid,p_scope jsonb,p_kind text,p_position jsonb DEFAULT NULL,p_token text DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $archive$
DECLARE key_value bytea;body_value jsonb;BEGIN
 IF(p_position IS NULL)=(p_token IS NULL)OR (p_kind NOT IN('cases','rules','authorities')AND p_kind!~'^(packages|restores):[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'AND p_kind!~'^sources:(organization_document_version|registry_record|custom_journal|scoped_journal|group_document|admission_case|education_document|frdo_packet|signature_evidence):[a-f0-9]{64}$')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 PERFORM public.uc_archive_fence(p_org,p_scope,'{}',false,NULL);SELECT k.secret INTO key_value FROM public.uc_archive_org_keys k WHERE k.organization_id=p_org;
 IF key_value IS NULL THEN
  IF p_token IS NOT NULL THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  -- A per-tenant cursor key is operational metadata only; it creates no source association, approval or business record.
  INSERT INTO public.uc_archive_org_keys(organization_id)VALUES(p_org)ON CONFLICT DO NOTHING;SELECT k.secret INTO key_value FROM public.uc_archive_org_keys k WHERE k.organization_id=p_org;
 END IF;
 IF p_token IS NULL THEN
  body_value:=jsonb_build_object('actor',auth.uid(),'organization',p_org,'scope',p_scope,'kind',p_kind,'expires',extract(epoch FROM clock_timestamp()+interval'30 minutes')::bigint,'position',p_position);
  RETURN to_jsonb(encode(pgp_sym_encrypt(body_value::text,encode(key_value,'hex'),'cipher-algo=aes256,compress-algo=0'),'hex'));
 END IF;
 IF length(p_token)NOT BETWEEN 1 AND 4096 OR p_token!~'^[a-f0-9]+$'THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 BEGIN body_value:=pgp_sym_decrypt(decode(p_token,'hex'),encode(key_value,'hex'))::jsonb;EXCEPTION WHEN OTHERS THEN PERFORM public.uc_archive_error('INVALID_INPUT');END;
 IF NOT public.uc_custom_journal_shape(body_value,ARRAY['actor','organization','scope','kind','expires','position'])OR body_value->>'actor'IS DISTINCT FROM auth.uid()::text OR body_value->>'organization'IS DISTINCT FROM p_org::text OR body_value->'scope'IS DISTINCT FROM p_scope OR body_value->>'kind'IS DISTINCT FROM p_kind OR NOT public.uc_archive_revision_valid(body_value->'expires')OR(body_value->>'expires')::bigint<extract(epoch FROM clock_timestamp())OR NOT public.uc_custom_journal_shape(body_value->'position',ARRAY['at','id'])OR jsonb_typeof(body_value->'position'->'at')IS DISTINCT FROM'string'OR NOT public.uc_custom_journal_uuid(body_value->'position'->'id')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 PERFORM(body_value->'position'->>'at')::timestamptz;RETURN body_value->'position';
END;$archive$;
CREATE FUNCTION public.uc_archive_current_source_ref(p_proof jsonb,p_org uuid,p_scope jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE ref_value jsonb:=p_proof->'source';captured jsonb:=p_proof->'captured_record';record_value jsonb;BEGIN
 CASE ref_value->>'kind'
 WHEN'organization_document_version'THEN RETURN ref_value;
 WHEN'registry_record'THEN RETURN ref_value||jsonb_build_object('revision',captured->'record'->'revision','state_hash',public.uc_archive_hash(captured));
 WHEN'custom_journal','scoped_journal'THEN RETURN ref_value||jsonb_build_object('revision',captured->'journal'->'revision','snapshot_hash',public.uc_archive_hash(captured));
 WHEN'group_document'THEN RETURN ref_value||jsonb_build_object('revision',coalesce(captured->'document'->'package_version','0'::jsonb),'snapshot_hash',public.uc_archive_hash(captured));
 WHEN'admission_case'THEN RETURN ref_value||jsonb_build_object('revision',captured->'case'->'revision','state_hash',public.uc_archive_hash(captured));
 WHEN'education_document'THEN
  record_value:=public.uc_education_issue_record(p_org,public.uc_archive_scope(p_org,p_scope),(ref_value->>'record_id')::uuid);
  IF record_value IS NULL OR record_value->'artifact'->>'availability'IS DISTINCT FROM'available'THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
  RETURN ref_value||jsonb_build_object('state_hash',record_value->>'state_hash','artifact_id',record_value#>'{artifact,artifact,item_id}','byte_sha256',record_value#>'{artifact,artifact,byte_sha256}');
 WHEN'frdo_packet'THEN RETURN ref_value||jsonb_build_object('revision',captured->'packet'->'revision','state_hash',captured->'packet'->'state_hash');
 WHEN'signature_evidence'THEN RETURN ref_value||jsonb_build_object('revision',captured->'signature'->'latest_event_revision','state_hash',public.uc_archive_hash(captured));
 ELSE PERFORM public.uc_archive_error('INVALID_INPUT');END CASE;
END;$archive$;
CREATE FUNCTION public.read_archive_cases(p_organization_id uuid,p_scope jsonb,p_query jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms' SET statement_timeout='15000ms' AS $archive$
DECLARE org uuid:=p_organization_id;query_kind text:=p_query->>'kind';head public.uc_archive_cases;case_row public.uc_archive_cases;rule_row public.uc_archive_rule_revisions;authority_row public.uc_archive_authority_revisions;build_row public.uc_archive_package_builds;run_row public.uc_archive_restore_runs;restore_projection_row public.uc_archive_restore_projections;result_value jsonb;items jsonb:='[]';proof_value jsonb;position_value jsonb;last_position jsonb;next_cursor text;limit_value integer;scanned integer:=0;visible integer:=0;history_ceiling bigint;before_value bigint;BEGIN
 PERFORM public.uc_archive_fence(org,p_scope,ARRAY[auth.uid()],false,NULL);
 IF jsonb_typeof(p_query)IS DISTINCT FROM'object'OR octet_length(p_query::text)>196608 THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 IF query_kind IN('cases','rules')THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','after_cursor','limit'])OR NOT public.uc_archive_revision_valid(p_query->'limit')OR(p_query->>'limit')::integer NOT BETWEEN 1 AND 50 OR NOT(p_query->'after_cursor'='null'::jsonb OR jsonb_typeof(p_query->'after_cursor')='string')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  IF query_kind='rules'AND p_scope->>'kind'<>'organization'THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
  limit_value:=(p_query->>'limit')::integer;
  IF p_query->'after_cursor'<>'null'::jsonb THEN position_value:=public.uc_archive_cursor(org,p_scope,query_kind,NULL,p_query->>'after_cursor');END IF;
  IF query_kind='cases'THEN
   FOR case_row IN SELECT c.*FROM public.uc_archive_cases c WHERE c.organization_id=org AND public.uc_archive_scope_contains(p_scope,c.scope)AND(position_value IS NULL OR(c.created_at,c.id)<((position_value->>'at')::timestamptz,(position_value->>'id')::uuid))ORDER BY c.created_at DESC,c.id DESC LIMIT 101 LOOP
    IF scanned=100 OR visible=limit_value THEN next_cursor:=public.uc_archive_cursor(org,p_scope,query_kind,last_position,NULL)#>>'{}';EXIT;END IF;
    scanned:=scanned+1;last_position:=jsonb_build_object('at',case_row.created_at,'id',case_row.id);
    BEGIN head:=public.uc_archive_case_access(org,p_scope,case_row.id,false);items:=items||jsonb_build_array(public.uc_archive_case_projection(head));visible:=visible+1;
    EXCEPTION WHEN SQLSTATE'PT403'OR SQLSTATE'PT404'THEN NULL;END;
   END LOOP;
  ELSE
   FOR rule_row IN SELECT r.*FROM public.uc_archive_rule_revisions r WHERE r.organization_id=org AND(position_value IS NULL OR(r.recorded_at,r.id)<((position_value->>'at')::timestamptz,(position_value->>'id')::uuid))ORDER BY r.recorded_at DESC,r.id DESC LIMIT 101 LOOP
    IF scanned=100 OR visible=limit_value THEN next_cursor:=public.uc_archive_cursor(org,p_scope,query_kind,last_position,NULL)#>>'{}';EXIT;END IF;
    scanned:=scanned+1;last_position:=jsonb_build_object('at',rule_row.recorded_at,'id',rule_row.id);
    BEGIN PERFORM public.uc_archive_fence(org,p_scope,rule_row.retained_people,false,NULL);PERFORM public.uc_archive_org_version(org,rule_row.source_reference,false,false);PERFORM public.uc_archive_org_version(org,rule_row.nomenclature_reference,false,false);items:=items||jsonb_build_array(public.uc_archive_rule_projection(rule_row));visible:=visible+1;
    EXCEPTION WHEN SQLSTATE'PT403'OR SQLSTATE'PT404'THEN NULL;END;
   END LOOP;
  END IF;result_value:=jsonb_build_object('kind',query_kind,'items',items,'next_cursor',next_cursor);
 ELSIF query_kind IN('detail','history','packages','restores')THEN
  IF NOT public.uc_custom_journal_uuid(p_query->'case_id')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;head:=public.uc_archive_case_access(org,p_scope,(p_query->>'case_id')::uuid,false);
  IF query_kind='detail'THEN
   IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','case_id'])THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;result_value:=jsonb_build_object('kind',query_kind,'case',public.uc_archive_case_projection(head));
  ELSIF query_kind='history'THEN
   IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','case_id','ceiling_revision','before_revision','limit'])OR NOT public.uc_archive_revision_valid(p_query->'ceiling_revision')OR NOT public.uc_archive_revision_valid(p_query->'limit')OR(p_query->>'limit')::integer NOT BETWEEN 1 AND 50 OR NOT(p_query->'before_revision'='null'::jsonb OR public.uc_archive_revision_valid(p_query->'before_revision'))THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
   history_ceiling:=(p_query->>'ceiling_revision')::bigint;before_value:=(p_query->>'before_revision')::bigint;limit_value:=(p_query->>'limit')::integer;
   IF history_ceiling>head.revision OR before_value IS NOT NULL AND before_value>history_ceiling+1 THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
   SELECT coalesce(jsonb_agg(public.uc_archive_event_projection(e)ORDER BY e.revision DESC),'[]')INTO items FROM(SELECT h.*FROM public.uc_archive_case_events h WHERE h.organization_id=org AND h.case_id=head.id AND h.revision<=history_ceiling AND(before_value IS NULL OR h.revision<before_value)ORDER BY h.revision DESC LIMIT limit_value)e;
   result_value:=jsonb_build_object('kind',query_kind,'case_id',head.id,'ceiling_revision',history_ceiling,'events',items,'next_before_revision',CASE WHEN jsonb_array_length(items)=limit_value AND(items->-1->>'sequence')::bigint>1 THEN items->-1->'sequence'END);
  ELSIF query_kind='restores'THEN
   IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','case_id','after_cursor','limit'])OR NOT public.uc_archive_revision_valid(p_query->'limit')OR(p_query->>'limit')::integer NOT BETWEEN 1 AND 50 OR NOT(p_query->'after_cursor'='null'::jsonb OR jsonb_typeof(p_query->'after_cursor')='string')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
   limit_value:=(p_query->>'limit')::integer;
   IF p_query->'after_cursor'<>'null'::jsonb THEN position_value:=public.uc_archive_cursor(org,p_scope,'restores:'||head.id::text,NULL,p_query->>'after_cursor');END IF;
   FOR run_row IN SELECT r.*FROM public.uc_archive_restore_runs r JOIN public.uc_archive_package_builds b ON b.id=r.package_id AND b.case_id=head.id WHERE r.organization_id=org AND(position_value IS NULL OR(r.created_at,r.id)<((position_value->>'at')::timestamptz,(position_value->>'id')::uuid))ORDER BY r.created_at DESC,r.id DESC LIMIT 101 LOOP
    IF scanned=100 OR visible=limit_value THEN next_cursor:=public.uc_archive_cursor(org,p_scope,'restores:'||head.id::text,last_position,NULL)#>>'{}';EXIT;END IF;
    scanned:=scanned+1;last_position:=jsonb_build_object('at',run_row.created_at,'id',run_row.id);
    BEGIN run_row:=public.uc_archive_restore_access(org,p_scope,run_row.id,false);items:=items||jsonb_build_array(public.uc_archive_restore_projection(run_row));visible:=visible+1;
    EXCEPTION WHEN SQLSTATE'PT403'OR SQLSTATE'PT404'THEN NULL;END;
   END LOOP;result_value:=jsonb_build_object('kind',query_kind,'case_id',head.id,'restores',items,'next_cursor',next_cursor);
  ELSE
   IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','case_id','after_cursor','limit'])OR NOT public.uc_archive_revision_valid(p_query->'limit')OR(p_query->>'limit')::integer NOT BETWEEN 1 AND 50 OR NOT(p_query->'after_cursor'='null'::jsonb OR jsonb_typeof(p_query->'after_cursor')='string')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
   limit_value:=(p_query->>'limit')::integer;
   IF p_query->'after_cursor'<>'null'::jsonb THEN position_value:=public.uc_archive_cursor(org,p_scope,'packages:'||head.id::text,NULL,p_query->>'after_cursor');END IF;
   FOR build_row IN SELECT b.*FROM public.uc_archive_package_builds b WHERE b.organization_id=org AND b.case_id=head.id AND(position_value IS NULL OR(b.created_at,b.id)<((position_value->>'at')::timestamptz,(position_value->>'id')::uuid))ORDER BY b.created_at DESC,b.id DESC LIMIT 101 LOOP
    IF scanned=100 OR visible=limit_value THEN next_cursor:=public.uc_archive_cursor(org,p_scope,'packages:'||head.id::text,last_position,NULL)#>>'{}';EXIT;END IF;
    scanned:=scanned+1;last_position:=jsonb_build_object('at',build_row.created_at,'id',build_row.id);
    BEGIN PERFORM public.uc_archive_package_access(org,p_scope,build_row.id,false,false);items:=items||jsonb_build_array(public.uc_archive_package_projection(build_row));visible:=visible+1;
    EXCEPTION WHEN SQLSTATE'PT403'OR SQLSTATE'PT404'THEN NULL;END;
   END LOOP;result_value:=jsonb_build_object('kind',query_kind,'case_id',head.id,'packages',items,'next_cursor',next_cursor);
  END IF;
 ELSIF query_kind='restore'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','restore_id'])OR NOT public.uc_custom_journal_uuid(p_query->'restore_id')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  run_row:=public.uc_archive_restore_access(org,p_scope,(p_query->>'restore_id')::uuid,false);
  IF run_row.state='verified'THEN
   SELECT p.*INTO restore_projection_row FROM public.uc_archive_restore_projections p WHERE p.restore_id=run_row.id AND p.organization_id=org AND p.entity_kind='case_snapshot';
   IF restore_projection_row.id IS NULL OR restore_projection_row.projection_sha256 IS DISTINCT FROM run_row.projection_sha256 OR public.uc_archive_event_hash(restore_projection_row.projection)IS DISTINCT FROM run_row.projection_sha256 THEN PERFORM public.uc_archive_error('HASH_MISMATCH');END IF;
  END IF;
  result_value:=jsonb_build_object('kind',query_kind,'restore',public.uc_archive_restore_projection(run_row),'projection',restore_projection_row.projection);
 ELSIF query_kind='source_inventory'THEN
  result_value:=public.uc_archive_source_inventory(org,p_scope,p_query);
 ELSIF query_kind='source'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','source'])THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;proof_value:=public.uc_archive_source(org,p_scope,p_query->'source',false,false);
  result_value:=jsonb_build_object('kind',query_kind,'source',public.uc_archive_current_source_ref(proof_value,org,p_scope),'label',proof_value->'label','subjects',proof_value->'subjects','attribution_actors',proof_value->'attribution_actors','history_kind',proof_value->'history_kind','expected_event_count',proof_value->'expected_event_count','file_count',jsonb_array_length(coalesce(proof_value->'private_files','[]'::jsonb)),'blockers',coalesce(proof_value->'source_blockers','[]'::jsonb));
 ELSIF query_kind='authorities'THEN
  IF NOT public.uc_custom_journal_shape(p_query,ARRAY['kind','after_cursor','limit'])OR p_scope->>'kind'<>'organization'OR NOT public.uc_archive_revision_valid(p_query->'limit')OR(p_query->>'limit')::integer NOT BETWEEN 1 AND 50 OR NOT(p_query->'after_cursor'='null'::jsonb OR jsonb_typeof(p_query->'after_cursor')='string')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  limit_value:=(p_query->>'limit')::integer;
  IF p_query->'after_cursor'<>'null'::jsonb THEN position_value:=public.uc_archive_cursor(org,p_scope,'authorities',NULL,p_query->>'after_cursor');END IF;
  FOR authority_row IN SELECT a.*FROM public.uc_archive_authority_revisions a WHERE a.organization_id=org AND(position_value IS NULL OR(a.recorded_at,a.id)<((position_value->>'at')::timestamptz,(position_value->>'id')::uuid))ORDER BY a.recorded_at DESC,a.id DESC LIMIT 101 LOOP
   IF scanned=100 OR visible=limit_value THEN next_cursor:=public.uc_archive_cursor(org,p_scope,'authorities',last_position,NULL)#>>'{}';EXIT;END IF;
   scanned:=scanned+1;last_position:=jsonb_build_object('at',authority_row.recorded_at,'id',authority_row.id);
   BEGIN PERFORM public.uc_archive_fence(org,p_scope,authority_row.retained_people,false,NULL);PERFORM public.uc_archive_org_version(org,authority_row.evidence,false,false);
    items:=items||jsonb_build_array(to_jsonb(authority_row)-'retained_people');visible:=visible+1;
   EXCEPTION WHEN SQLSTATE'PT403'OR SQLSTATE'PT404'THEN NULL;END;
  END LOOP;result_value:=jsonb_build_object('kind',query_kind,'authorities',items,'next_cursor',next_cursor);
 ELSE PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 PERFORM public.uc_archive_fence(org,p_scope,ARRAY[auth.uid()],false,NULL);
 RETURN jsonb_build_object('version',1,'ok',true,'organization_id',org,'scope',p_scope,'actor_id',auth.uid(),'capabilities',public.uc_archive_caps(org,p_scope),'result',result_value);
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_archive_error('INVALID_INPUT');WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;
CREATE FUNCTION public.uc_archive_action_capability(p_caps jsonb,p_kind text)RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $archive$
DECLARE cap_key text;BEGIN
 cap_key:=CASE WHEN p_kind IN('appoint_authority','revoke_authority')THEN'can_appoint'WHEN p_kind='review_rule'THEN'can_review_rules'WHEN p_kind='approve_rule'THEN'can_approve_rules'WHEN p_kind='save_rule_draft'THEN'can_write'WHEN p_kind='prepare_destruction_plan'THEN'can_prepare_destruction_review'ELSE'can_operate'END;
 IF NOT coalesce((p_caps->>cap_key)::boolean,false)THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
END;$archive$;
CREATE FUNCTION public.apply_archive_case(p_organization_id uuid,p_scope jsonb,p_request_id uuid,p_case_id uuid,p_expected_revision bigint,p_action jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms' SET statement_timeout='20000ms' AS $archive$
DECLARE org uuid:=p_organization_id;action_kind text:=p_action->>'kind';independent boolean;command_hash text;previous public.uc_archive_requests;head public.uc_archive_cases;value_result jsonb;receipt_value jsonb;caps jsonb;all_people uuid[];source_value jsonb;BEGIN
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991 OR jsonb_typeof(p_action)IS DISTINCT FROM'object'OR octet_length(p_action::text)>196608 THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 independent:=action_kind IN('open_case','save_rule_draft','review_rule','approve_rule','appoint_authority','revoke_authority');
 IF independent IS DISTINCT FROM(p_case_id IS NULL)OR independent AND p_expected_revision<>0 OR action_kind IN('save_rule_draft','review_rule','approve_rule','appoint_authority','revoke_authority')AND p_scope->>'kind'<>'organization'THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 PERFORM public.uc_archive_fence(org,p_scope,ARRAY[auth.uid()],true,p_request_id);caps:=public.uc_archive_caps(org,p_scope);PERFORM public.uc_archive_action_capability(caps,action_kind);
 INSERT INTO public.uc_archive_org_keys(organization_id)VALUES(org)ON CONFLICT DO NOTHING;
 command_hash:=public.uc_archive_hash(jsonb_build_object('organization_id',org,'scope',p_scope,'case_id',p_case_id,'expected_revision',p_expected_revision,'action',p_action));
 SELECT r.*INTO previous FROM public.uc_archive_requests r WHERE r.actor_id=auth.uid()AND r.request_id=p_request_id;
 IF previous.id IS NOT NULL THEN
  IF previous.organization_id<>org OR previous.scope<>p_scope OR previous.command_sha256<>command_hash THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  PERFORM public.uc_archive_fence(org,p_scope,previous.retained_people,true,NULL);
  IF previous.case_id IS NOT NULL THEN PERFORM public.uc_archive_case_access(org,p_scope,previous.case_id,true);END IF;
  FOR source_value IN WITH RECURSIVE nodes(value)AS(SELECT previous.receipt UNION ALL SELECT e.value FROM nodes n CROSS JOIN LATERAL(SELECT a.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array'THEN n.value ELSE'[]'::jsonb END)a UNION ALL SELECT o.value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object'THEN n.value ELSE'{}'::jsonb END)o)e)SELECT DISTINCT n.value FROM nodes n WHERE n.value->>'kind'='organization_document_version'LOOP PERFORM public.uc_archive_org_version(org,source_value,false,false);END LOOP;
  PERFORM public.uc_archive_action_capability(public.uc_archive_caps(org,p_scope),action_kind);RETURN previous.receipt||jsonb_build_object('replayed',true);
 END IF;
 IF independent THEN
  IF action_kind='open_case'THEN head:=public.uc_archive_open_case(org,p_scope,p_action);value_result:=public.uc_archive_case_projection(head);
  ELSIF action_kind IN('appoint_authority','revoke_authority')THEN value_result:=public.uc_archive_apply_authority(org,p_action);
  ELSE value_result:=public.uc_archive_apply_rule(org,p_action);END IF;
 ELSE
  head:=public.uc_archive_case_access(org,p_scope,p_case_id,true);
  IF head.revision<>p_expected_revision THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
  IF action_kind='prepare_package'THEN
   IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind'])THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;value_result:=public.uc_archive_prepare_package(head,p_request_id);
  ELSIF action_kind='prepare_restore'THEN
   IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind','package_id'])OR NOT public.uc_custom_journal_uuid(p_action->'package_id')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;value_result:=public.uc_archive_prepare_restore(head,p_request_id,(p_action->>'package_id')::uuid);
  ELSIF action_kind='prepare_destruction_plan'THEN
   IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind'])THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;value_result:=public.uc_archive_prepare_disposal(head);
  ELSE head:=public.uc_archive_apply_case(org,p_scope,p_case_id,p_action);value_result:=public.uc_archive_case_projection(head);END IF;
 END IF;
 all_people:=public.uc_archive_json_people(p_action||jsonb_build_object('_result',value_result))||coalesce(head.retained_subjects,'{}')||coalesce(head.attribution_actors,'{}')||ARRAY[auth.uid()];PERFORM public.uc_archive_fence(org,p_scope,all_people,true,NULL);
 receipt_value:=jsonb_build_object('version',1,'ok',true,'organization_id',org,'scope',p_scope,'actor_id',auth.uid(),'request_id',p_request_id,'action_kind',action_kind,'case_id',head.id,'revision',head.revision,'state_hash',head.state_hash,'value',value_result,'replayed',false);
 INSERT INTO public.uc_archive_requests(organization_id,actor_id,request_id,scope,case_id,command_sha256,receipt,retained_people)VALUES(org,auth.uid(),p_request_id,p_scope,head.id,command_hash,receipt_value,all_people);
 RETURN receipt_value;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_archive_error('INVALID_INPUT');WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;


-- UC024 fragment 80_archive_storage.sql
-- Private archive bytes are immutable, including bucket privacy. Other Storage buckets retain their original behavior.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)VALUES('archive-case-artifacts','archive-case-artifacts',false,104857600,NULL)ON CONFLICT(id)DO NOTHING;
DO $archive_bucket$BEGIN IF NOT EXISTS(SELECT 1 FROM storage.buckets b WHERE b.id='archive-case-artifacts'AND b.name='archive-case-artifacts'AND NOT b.public AND b.file_size_limit=104857600)THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;END;$archive_bucket$;
CREATE FUNCTION public.uc_archive_bucket_guard()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $archive$
BEGIN
 IF OLD.id='archive-case-artifacts'OR TG_OP='UPDATE'AND NEW.id='archive-case-artifacts'THEN
  IF TG_OP='DELETE'OR to_jsonb(NEW)IS DISTINCT FROM to_jsonb(OLD)THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 END IF;IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;
END;$archive$;
CREATE TRIGGER zz_archive_bucket_guard BEFORE UPDATE OR DELETE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION public.uc_archive_bucket_guard();
CREATE FUNCTION public.uc_archive_object_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE build_row public.uc_archive_package_builds;head public.uc_archive_cases;context_value jsonb;mapping_value jsonb;descriptor jsonb;claims_text text:=current_setting('request.jwt.claims',true);sub_text text:=current_setting('request.jwt.claim.sub',true);role_text text:=current_setting('request.jwt.claim.role',true);projected boolean:=false;hash_value text;file_key uuid;BEGIN
 IF TG_OP<>'INSERT'THEN
  IF OLD.bucket_id<>'archive-case-artifacts'AND(TG_OP='DELETE'OR NEW.bucket_id<>'archive-case-artifacts')THEN IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;END IF;
  IF TG_OP='UPDATE'AND(to_jsonb(OLD)-ARRAY['last_accessed_at','updated_at','path_tokens'])IS NOT DISTINCT FROM(to_jsonb(NEW)-ARRAY['last_accessed_at','updated_at','path_tokens'])THEN NEW.updated_at:=OLD.updated_at;RETURN NEW;END IF;
  PERFORM public.uc_archive_error('ACCESS_DENIED');
 END IF;
 IF NEW.bucket_id<>'archive-case-artifacts'THEN RETURN NEW;END IF;
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR NEW.owner IS NOT NULL OR nullif(NEW.owner_id,'')IS NOT NULL OR coalesce(claims_text,'')=''OR jsonb_typeof(claims_text::jsonb)IS DISTINCT FROM'object'OR claims_text::jsonb->>'role'IS DISTINCT FROM'service_role'OR nullif(claims_text::jsonb->>'sub','')IS NOT NULL THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 IF NEW.user_metadata?'restore_id'THEN RETURN public.uc_archive_restore_insert(NEW);END IF;
 IF NOT public.uc_custom_journal_shape(NEW.user_metadata,ARRAY['package_id','lease_id','file_id','sha256'])OR NOT public.uc_custom_journal_uuid(NEW.user_metadata->'package_id')OR NOT public.uc_custom_journal_uuid(NEW.user_metadata->'lease_id')OR NOT public.uc_custom_journal_uuid(NEW.user_metadata->'file_id')OR coalesce(NEW.user_metadata->>'sha256','')!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 SELECT b.*INTO build_row FROM public.uc_archive_package_builds b WHERE b.id=(NEW.user_metadata->>'package_id')::uuid;
 IF build_row.id IS NULL OR build_row.phase<>'generating'OR build_row.lease_until<=clock_timestamp()OR build_row.lease_id::text IS DISTINCT FROM NEW.user_metadata->>'lease_id'THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claim.role','',true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',build_row.actor_id)::text,true);projected:=true;
 SELECT c.*INTO head FROM public.uc_archive_cases c WHERE c.id=build_row.case_id AND c.organization_id=build_row.organization_id;
 PERFORM public.uc_archive_package_access(build_row.organization_id,head.scope,build_row.id,true,true);context_value:=public.archive_package_context(build_row.organization_id,head.scope,build_row.id);
 IF NOT(public.uc_archive_caps(build_row.organization_id,head.scope)->>'can_operate')::boolean THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 file_key:=(NEW.user_metadata->>'file_id')::uuid;hash_value:=NEW.user_metadata->>'sha256';
 SELECT f.value INTO mapping_value FROM jsonb_array_elements(context_value->'private_files')f WHERE f.value->>'file_id'=file_key::text;descriptor:=mapping_value->'private_file';
 IF mapping_value IS NULL OR NEW.name IS DISTINCT FROM build_row.organization_id::text||'/'||build_row.id::text||'/files/'||file_key::text||'/'||hash_value||'.bin'OR NEW.metadata->>'mimetype'IS DISTINCT FROM descriptor->>'mime_type'OR coalesce(NEW.metadata->>'size',NEW.metadata->>'contentLength')IS DISTINCT FROM descriptor->>'byte_size'OR descriptor?'known_sha256'AND descriptor->>'known_sha256'IS DISTINCT FROM hash_value THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);projected:=false;RETURN NEW;
 EXCEPTION WHEN OTHERS THEN IF projected THEN PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);END IF;RAISE;
END;$archive$;
CREATE TRIGGER zz_archive_object_guard BEFORE INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.uc_archive_object_guard();


-- UC024 fragment 85_archive_source_storage_retention.sql
-- Immutable dependency retention for physical source objects used by archive captures/rule-source jobs.
-- Indexed lookups include automatic evidence members; no generic path association or Storage grant is introduced.
CREATE INDEX uc_archive_capture_source_objects ON public.uc_archive_case_events USING gin(private_capture jsonb_path_ops)WHERE private_capture IS NOT NULL;
CREATE INDEX uc_archive_rule_check_source_object ON public.uc_archive_rule_source_checks((source_context#>>'{private_file,object_id}'));
CREATE FUNCTION public.uc_archive_retained_source_object()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE mapping_value jsonb;retained boolean;BEGIN
 IF OLD.bucket_id NOT IN('org-documents','admission-case-evidence','frdo-packet-artifacts','archive-case-artifacts')THEN IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;END IF;
 mapping_value:=jsonb_build_array(jsonb_build_object('private_file',jsonb_build_object('object_id',OLD.id)));
 retained:=EXISTS(SELECT 1 FROM public.uc_archive_case_events e WHERE e.private_capture IS NOT NULL AND(e.private_capture@>jsonb_build_object('file_mapping',mapping_value)OR e.private_capture@>jsonb_build_object('automatic_members',jsonb_build_array(jsonb_build_object('file_mapping',mapping_value)))))OR EXISTS(SELECT 1 FROM public.uc_archive_rule_source_checks j WHERE j.source_context#>>'{private_file,object_id}'=OLD.id::text);
 IF NOT retained THEN IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;END IF;
 IF TG_OP='DELETE'OR(to_jsonb(OLD)-ARRAY['last_accessed_at','updated_at','path_tokens'])IS DISTINCT FROM(to_jsonb(NEW)-ARRAY['last_accessed_at','updated_at','path_tokens'])THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 NEW.updated_at:=OLD.updated_at;RETURN NEW;
END;$archive$;
CREATE TRIGGER zzz_archive_retained_source_object_guard BEFORE UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.uc_archive_retained_source_object();


-- UC024 fragment 86_archive_privacy.sql
-- UC024 conservative retention of all archived subject/actor copies. The org cursor-key table contains no user identity.
CREATE FUNCTION public.uc_archive_personal_counts(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',counts.table_name,'column','archive_retention_review_required','count',counts.n)ORDER BY counts.table_name),'[]'::jsonb)FROM(
 SELECT 'uc_archive_cases'::text table_name,count(*)n FROM public.uc_archive_cases r WHERE r.user_id=p_user OR r.created_by=p_user OR p_user=ANY(r.retained_subjects) OR p_user=ANY(r.attribution_actors)
 UNION ALL
 SELECT 'uc_archive_case_events'::text table_name,count(*)n FROM public.uc_archive_case_events r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_requests'::text table_name,count(*)n FROM public.uc_archive_requests r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_authority_revisions'::text table_name,count(*)n FROM public.uc_archive_authority_revisions r WHERE r.appointed_user_id=p_user OR r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_rule_revisions'::text table_name,count(*)n FROM public.uc_archive_rule_revisions r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_package_builds'::text table_name,count(*)n FROM public.uc_archive_package_builds r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_package_files'::text table_name,count(*)n FROM public.uc_archive_package_files r WHERE p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_restore_runs'::text table_name,count(*)n FROM public.uc_archive_restore_runs r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_restore_files'::text table_name,count(*)n FROM public.uc_archive_restore_files r WHERE p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_restore_projections'::text table_name,count(*)n FROM public.uc_archive_restore_projections r WHERE p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_disposal_reviews'::text table_name,count(*)n FROM public.uc_archive_disposal_reviews r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_rule_source_checks'::text table_name,count(*)n FROM public.uc_archive_rule_source_checks r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 )counts WHERE counts.n>0
$archive$;
CREATE FUNCTION public.uc_archive_retention_block(p_user uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_user::text,42007))THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 IF public.uc_archive_personal_counts(p_user)<>'[]'::jsonb THEN RAISE EXCEPTION 'ARCHIVE_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
END;$archive$;


-- UC024 fragment 87_archive_privacy_composition.sql
-- Exact additive composition on625 S3H + native-proven final022. All prior ER, S3 and022 guards remain.









-- UC024 fragment 90_archive_acl_closure.sql
-- Every own function/table is private by default, regardless of provider default grants. Prior four privacy function ACLs are preserved.
DO $archive_final_acl$
DECLARE fn record;grant_row record;rel record;col record;names text[]:=ARRAY['uc_archive_error','uc_archive_hash','uc_archive_text','uc_archive_people','uc_archive_json_people','uc_archive_scope','uc_archive_scope_contains','uc_archive_fence','uc_archive_immutable','uc_archive_case_head_guard','uc_archive_event_canonical','uc_archive_event_hash','uc_archive_revision_valid','uc_archive_org_version','uc_archive_authority_current','uc_archive_rule_projection','uc_archive_case_projection','uc_archive_scoped_journal_source','uc_archive_source_shape','uc_archive_source_capture','uc_archive_registry_source','uc_archive_journal_source','uc_archive_group_document_source','uc_archive_admission_source','uc_archive_org_files','uc_archive_education_source','uc_archive_frdo_source','uc_archive_signature_file','uc_archive_signature_source','uc_archive_source','uc_archive_can_role','uc_archive_caps','uc_archive_case_access','uc_archive_case_digest','uc_archive_append_case','uc_archive_active_holds','uc_archive_event_projection','uc_archive_decision','uc_archive_apply_authority','uc_archive_rule_draft_valid','uc_archive_apply_rule','uc_archive_source_check_guard','prepare_archive_rule_source_check','commit_archive_rule_source_check','archive_rule_inspection_context','uc_archive_open_case','uc_archive_apply_case','uc_archive_source_inventory','uc_archive_json_literal','uc_archive_package_guard','uc_archive_package_access','uc_archive_package_projection','uc_archive_prepare_package','archive_package_context','uc_archive_prepare_disposal','claim_archive_package','commit_archive_package','archive_package_object_context','archive_sealed_package_context','archive_sealed_file_context','uc_archive_restore_guard','uc_archive_restore_projection','uc_archive_restore_access','uc_archive_prepare_restore','archive_restore_context','claim_archive_restore','archive_restore_object_context','uc_archive_restore_insert','commit_archive_restore','uc_archive_cursor','uc_archive_current_source_ref','read_archive_cases','uc_archive_action_capability','apply_archive_case','uc_archive_bucket_guard','uc_archive_object_guard','uc_archive_retained_source_object','uc_archive_personal_counts','uc_archive_retention_block'];auth_names text[]:=ARRAY['read_archive_cases','apply_archive_case','claim_archive_package','archive_package_object_context','archive_sealed_package_context','archive_sealed_file_context','archive_restore_context','claim_archive_restore','archive_restore_object_context','archive_rule_inspection_context','prepare_archive_rule_source_check'];service_names text[]:=ARRAY['commit_archive_package','commit_archive_restore','commit_archive_rule_source_check'];BEGIN
 IF(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(names))<>79 THEN RAISE EXCEPTION 'ARCHIVE_FUNCTION_VECTOR_CHANGED';END IF;
 FOR fn IN SELECT p.oid,p.proowner,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(names) LOOP
  FOR grant_row IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.oid=fn.oid AND a.grantee<>p.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s CASCADE',fn.oid::regprocedure,CASE WHEN grant_row.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(grant_row.grantee))END);
  END LOOP;
  IF fn.proname=ANY(auth_names)THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',fn.oid::regprocedure);END IF;
  IF fn.proname=ANY(service_names)THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn.oid::regprocedure);END IF;
 END LOOP;
 FOR rel IN SELECT c.oid,c.relowner,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(ARRAY['uc_archive_cases','uc_archive_case_events','uc_archive_requests','uc_archive_authority_revisions','uc_archive_rule_revisions','uc_archive_package_builds','uc_archive_package_files','uc_archive_restore_runs','uc_archive_restore_files','uc_archive_restore_projections','uc_archive_disposal_reviews','uc_archive_rule_source_checks','uc_archive_org_keys'])LOOP
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',rel.nspname,rel.relname);
  FOR grant_row IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.oid=rel.oid AND a.grantee<>c.relowner LOOP
   EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM %s CASCADE',rel.nspname,rel.relname,CASE WHEN grant_row.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(grant_row.grantee))END);
  END LOOP;
  FOR col IN SELECT att.attname,a.grantee FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl)a WHERE att.attrelid=rel.oid AND att.attnum>0 AND NOT att.attisdropped AND a.grantee<>rel.relowner LOOP
   EXECUTE format('REVOKE ALL (%I) ON TABLE %I.%I FROM %s CASCADE',col.attname,rel.nspname,rel.relname,CASE WHEN col.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(col.grantee))END);
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(ARRAY['uc_archive_cases','uc_archive_case_events','uc_archive_requests','uc_archive_authority_revisions','uc_archive_rule_revisions','uc_archive_package_builds','uc_archive_package_files','uc_archive_restore_runs','uc_archive_restore_files','uc_archive_restore_projections','uc_archive_disposal_reviews','uc_archive_rule_source_checks','uc_archive_org_keys'])AND NOT c.relrowsecurity)THEN RAISE EXCEPTION 'ARCHIVE_RAW_TABLE_NOT_PRIVATE';END IF;
END;$archive_final_acl$;


-- Deliberately no ledger or commit in this review candidate.


-- UC025 proposed complete source; private original-JWT annual draft workflow. No ledger or production execution.
-- UC025 authoring: original-JWT private yearly drafts and append-only fact provenance.
-- No ledger, charges, old-order rewrite, normative approval or public publication.
DO $fresh$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname IN('uc_self_examination_drafts','uc_self_examination_events','uc_self_examination_sources'))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname LIKE 'uc_self_examination_%'OR p.proname IN('read_self_examination_draft','apply_self_examination_draft')))THEN RAISE EXCEPTION 'UC025_NAMESPACE_NOT_FRESH';END IF;
END;$fresh$;
CREATE TABLE public.uc_self_examination_drafts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id)ON DELETE RESTRICT,reporting_year integer NOT NULL CHECK(reporting_year BETWEEN 2000 AND 2200),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),body jsonb NOT NULL,fact_reviews jsonb NOT NULL DEFAULT '{}',
 participant_ids uuid[] NOT NULL,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 latest_artifact jsonb,centre_final jsonb,publication jsonb,UNIQUE(organization_id,reporting_year));
CREATE TABLE public.uc_self_examination_events(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,draft_id uuid NOT NULL REFERENCES public.uc_self_examination_drafts(id)ON DELETE RESTRICT,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),actor_id uuid NOT NULL,request_id uuid NOT NULL,payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),
 action text NOT NULL CHECK(action IN('save','review_fact','clear_review','prepare_generation','record_generation','record_centre_final','record_publication')),
 snapshot jsonb NOT NULL,receipt jsonb NOT NULL,participant_ids uuid[] NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(draft_id,revision),UNIQUE(actor_id,request_id));
CREATE TABLE public.uc_self_examination_sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,draft_id uuid NOT NULL REFERENCES public.uc_self_examination_drafts(id)ON DELETE RESTRICT,
 event_id uuid NOT NULL REFERENCES public.uc_self_examination_events(id)ON DELETE RESTRICT,source_role text NOT NULL,source_ref jsonb NOT NULL,
 document_id uuid NOT NULL,version_id uuid NOT NULL REFERENCES public.org_document_versions(id)ON DELETE RESTRICT,storage_object_id uuid NOT NULL REFERENCES storage.objects(id)ON DELETE RESTRICT,bucket text NOT NULL CHECK(bucket='org-documents'),path text NOT NULL,
 participant_ids uuid[] NOT NULL,linked_by uuid NOT NULL,linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(event_id,source_role,version_id));
ALTER TABLE public.uc_self_examination_sources ENABLE ROW LEVEL SECURITY;
CREATE INDEX uc_self_examination_sources_object ON public.uc_self_examination_sources(storage_object_id);
CREATE INDEX uc_self_examination_sources_path ON public.uc_self_examination_sources(bucket,path);
CREATE INDEX uc_self_examination_sources_people ON public.uc_self_examination_sources USING gin(participant_ids);
ALTER TABLE public.uc_self_examination_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uc_self_examination_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX uc_self_examination_events_draft_page ON public.uc_self_examination_events(draft_id,revision DESC);
CREATE INDEX uc_self_examination_drafts_people ON public.uc_self_examination_drafts USING gin(participant_ids);
CREATE INDEX uc_self_examination_events_people ON public.uc_self_examination_events USING gin(participant_ids);
CREATE FUNCTION public.uc_self_examination_error(p_code text)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $f$
BEGIN RAISE EXCEPTION 'SELF_EXAMINATION_%',p_code USING ERRCODE=CASE p_code WHEN'ACCESS_DENIED'THEN'42501'WHEN'INVALID_INPUT'THEN'22023'WHEN'REVISION_CONFLICT'THEN'40001'ELSE'P0001'END;END;$f$;
CREATE FUNCTION public.uc_self_examination_shape(p_value jsonb,p_keys text[])RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT jsonb_typeof(p_value)='object'AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(p_value)k WHERE NOT(k=ANY(p_keys)))AND(SELECT count(*)FROM jsonb_object_keys(p_value))=cardinality(p_keys)
$f$;
CREATE FUNCTION public.uc_self_examination_immutable()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $f$
BEGIN PERFORM public.uc_self_examination_error('RETAINED_HISTORY_IMMUTABLE');RETURN NULL;END;$f$;
CREATE TRIGGER uc_self_examination_events_immutable BEFORE UPDATE OR DELETE ON public.uc_self_examination_events FOR EACH ROW EXECUTE FUNCTION public.uc_self_examination_immutable();
CREATE TRIGGER uc_self_examination_sources_immutable BEFORE UPDATE OR DELETE ON public.uc_self_examination_sources FOR EACH ROW EXECUTE FUNCTION public.uc_self_examination_immutable();
CREATE FUNCTION public.uc_self_examination_catalog()RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT '{"version":"dpo-annex6-with-703-687-2025-11-10-v1","indicators":[{"code":"1.1","label":"Повышение квалификации: слушатели и доля","unit":"people_percent","point":"№1324, приложение6, пункт1.1"},{"code":"1.2","label":"Переподготовка: слушатели и доля","unit":"people_percent","point":"№1324, приложение6, пункт1.2"},{"code":"1.3","label":"Слушатели, направленные службой занятости","unit":"people_percent","point":"№1324, приложение6, пункт1.3"},{"code":"1.4","label":"Реализуемые ДПП","unit":"units","point":"№1324, приложение6, пункт1.4"},{"code":"1.4.1","label":"Программы повышения квалификации","unit":"units","point":"№1324, приложение6, пункт1.4.1"},{"code":"1.4.2","label":"Программы переподготовки","unit":"units","point":"№1324, приложение6, пункт1.4.2"},{"code":"1.5","label":"ДПП, разработанные за отчётный период","unit":"units","point":"№1324, приложение6, пункт1.5"},{"code":"1.5.1","label":"Новые программы повышения квалификации","unit":"units","point":"№1324, приложение6, пункт1.5.1"},{"code":"1.5.2","label":"Новые программы переподготовки","unit":"units","point":"№1324, приложение6, пункт1.5.2"},{"code":"1.6","label":"ДПП приоритетных направлений: доля","unit":"percent","point":"№1324, приложение6, пункт1.6"},{"code":"1.7","label":"ДПП с общественной/профессионально-общественной аккредитацией: доля","unit":"percent","point":"№1324, приложение6, пункт1.7"},{"code":"1.8","label":"Работники с учёной степенью/званием","unit":"people_percent","point":"№1324, приложение6, пункт1.8"},{"code":"1.9","label":"Работники, прошедшие ПК/переподготовку","unit":"people_percent","point":"№1324, приложение6, пункт1.9"},{"code":"1.10","label":"Работники с квалификационной категорией","unit":"people_percent","point":"№1324, приложение6, пункт1.10"},{"code":"1.10.1","label":"Высшая квалификационная категория","unit":"people_percent","point":"№1324, приложение6, пункт1.10.1"},{"code":"1.10.2","label":"Первая квалификационная категория","unit":"people_percent","point":"№1324, приложение6, пункт1.10.2"},{"code":"1.11","label":"Средний возраст штатных научно-педагогических работников","unit":"years","point":"№1324, приложение6, пункт1.11"},{"code":"1.12","label":"Выполнение государственного задания по ДПП","unit":"percent","point":"№1324, приложение6, пункт1.12"},{"code":"2.1","label":"Публикации в журналах Белого списка","unit":"units","point":"№1324, приложение6, пункт2.1"},{"code":"2.3","label":"Цитирования РИНЦ на100 научно-педагогических работников","unit":"units","point":"№1324, приложение6, пункт2.3"},{"code":"2.6","label":"Публикации РИНЦ на100 научно-педагогических работников","unit":"units","point":"№1324, приложение6, пункт2.6"},{"code":"2.7","label":"Общий объём НИОКР","unit":"thousand_rubles","point":"№1324, приложение6, пункт2.7"},{"code":"2.8","label":"НИОКР на научно-педагогического работника","unit":"thousand_rubles","point":"№1324, приложение6, пункт2.8"},{"code":"2.9","label":"Доля доходов НИОКР","unit":"percent","point":"№1324, приложение6, пункт2.9"},{"code":"2.10","label":"Доля НИОКР собственными силами","unit":"percent","point":"№1324, приложение6, пункт2.10"},{"code":"2.11","label":"Подготовленные печатные учебные издания","unit":"units","point":"№1324, приложение6, пункт2.11"},{"code":"2.12","label":"Проведённые международные/всероссийские мероприятия","unit":"units","point":"№1324, приложение6, пункт2.12"},{"code":"2.13","label":"Подготовленные научные кадры высшей квалификации","unit":"people","point":"№1324, приложение6, пункт2.13"},{"code":"2.14","label":"Молодые кандидаты/доктора наук","unit":"people_percent","point":"№1324, приложение6, пункт2.14"},{"code":"2.15","label":"Электронные научные журналы организации","unit":"units","point":"№1324, приложение6, пункт2.15"},{"code":"3.1","label":"Доходы по всем видам обеспечения на работника","unit":"thousand_rubles","point":"№1324, приложение6, пункт3.1"},{"code":"3.2","label":"Финансовое обеспечение на научно-педагогического работника","unit":"thousand_rubles","point":"№1324, приложение6, пункт3.2"},{"code":"3.3","label":"Приносящая доход деятельность на работника","unit":"thousand_rubles","point":"№1324, приложение6, пункт3.3"},{"code":"4.1","label":"Площадь образовательных помещений на слушателя","unit":"square_metres","point":"№1324, приложение6, пункт4.1"},{"code":"4.1.1","label":"Площадь в собственности на слушателя","unit":"square_metres","point":"№1324, приложение6, пункт4.1.1"},{"code":"4.1.2","label":"Площадь в оперативном управлении на слушателя","unit":"square_metres","point":"№1324, приложение6, пункт4.1.2"},{"code":"4.1.3","label":"Площадь в аренде/безвозмездном пользовании на слушателя","unit":"square_metres","point":"№1324, приложение6, пункт4.1.3"},{"code":"4.2","label":"Печатные учебные издания на слушателя","unit":"units","point":"№1324, приложение6, пункт4.2"},{"code":"4.3","label":"Электронные учебные издания на слушателя","unit":"units","point":"№1324, приложение6, пункт4.3"},{"code":"4.4","label":"Общежитие: проживающие и доля нуждающихся","unit":"people_percent","point":"№1324, приложение6, пункт4.4"}],"sections":[["education","Образовательная деятельность"],["management","Система управления"],["content_quality","Содержание и качество подготовки"],["process","Организация учебного процесса"],["graduates","Востребованность выпускников"],["staff","Кадровое обеспечение"],["methodology","Учебно-методическое обеспечение"],["library","Библиотечно-информационное обеспечение"],["facilities","Материально-техническая база"],["internal_quality","Внутренняя оценка качества"],["conclusions","Выводы и меры улучшения"]],"legal_references":{"procedure":{"title":"Порядок №462: применимость и процедура самообследования","url":"https://minjust.consultant.ru/documents/6631","sourceSha256":"761670e49bf2941b444ce6e75df1eece5a91dcd5121052c41cf15aa01aba1d07","status":"primary_scan_checked_not_centre_approved"},"reportingPeriod":{"title":"Изменение №1218: отчётный период и срок размещения","url":"http://publication.pravo.gov.ru/Document/View/0001201801090025","sourceSha256":"4d9b766f25557e111879dfc1aa801615c153ad359933cc6405b0742baf4577b7","status":"primary_scan_checked_not_centre_approved"},"indicators":{"title":"Показатели №1324, приложение6: исходный текст","url":"https://minjust.consultant.ru/documents/8799","sourceSha256":"e288d4529ae2ad03ad410aedf940823fb726175d3924b74c891d3e03367e635e","status":"primary_scan_checked_not_centre_approved"},"changedIndicators":{"title":"Изменение №703/687: приложения4 и6","url":"http://publication.pravo.gov.ru/Document/View/0001202510300006","sourceSha256":"d3ef442f4f8b4ea30da7bae54a0aece238dce12789566e0a16fbdba15950d53f","status":"primary_scan_checked_not_centre_approved"}}}'::jsonb
$f$;
CREATE FUNCTION public.uc_self_examination_json_valid(p_value jsonb,p_depth integer DEFAULT 0)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $f$
DECLARE entry record;item jsonb;BEGIN
 IF p_depth>12 OR octet_length(p_value::text)>262144 THEN RETURN false;END IF;
 IF jsonb_typeof(p_value)='object'THEN
  IF(SELECT count(*)FROM jsonb_object_keys(p_value))>100 THEN RETURN false;END IF;
  FOR entry IN SELECT * FROM jsonb_each(p_value)LOOP
   IF entry.key IN('__proto__','constructor','prototype')OR length(entry.key)>100 OR NOT public.uc_self_examination_json_valid(entry.value,p_depth+1)THEN RETURN false;END IF;
  END LOOP;
 ELSIF jsonb_typeof(p_value)='array'THEN
  IF jsonb_array_length(p_value)>250 THEN RETURN false;END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_value)LOOP IF NOT public.uc_self_examination_json_valid(item,p_depth+1)THEN RETURN false;END IF;END LOOP;
 ELSIF jsonb_typeof(p_value)='string'THEN IF length(p_value#>>'{}')>12000 OR regexp_replace(p_value#>>'{}',E'[\\n\\r\\t]','','g')~'[[:cntrl:]]'THEN RETURN false;END IF;
 ELSIF jsonb_typeof(p_value)='number'THEN IF abs((p_value#>>'{}')::numeric)>9007199254740991 THEN RETURN false;END IF;
 END IF;RETURN true;
END;$f$;
CREATE FUNCTION public.uc_self_examination_answers_valid(p_answers jsonb)RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $f$
DECLARE a record;r jsonb;k text;expected text[];numeric_fields text[];BEGIN
 IF jsonb_typeof(p_answers)IS DISTINCT FROM'object'OR(SELECT count(*)FROM jsonb_object_keys(p_answers))>60 THEN RETURN false;END IF;
 FOR a IN SELECT * FROM jsonb_each(p_answers)LOOP
  IF NOT a.key=ANY(ARRAY['fullName','shortName','legalForm','legalAddress','phone','email','website','ogrn','inn','kpp','founders','licenseNumber','licenseDate','orderNumber','orderDate','directorFio','directorPosition','pedagogicalCouncilProtocolNumber','pedagogicalCouncilProtocolDate','testingPlatformName','testingPlatformUrl','finalAttestationForm','additionalEquipment','additionalNotes','directorTermYears','totalStudents','completedStudents','hasPedagogicalCouncil','hasEmployerParticipation','hasWebsite','hasDistancePlatform','hasMultimedia','hasLibrary','programTypes','controlTypes','commissionChairman','commissionMembers','programs','staff'])THEN RETURN false;END IF;
  IF a.value='null'::jsonb THEN CONTINUE;END IF;
  IF a.key=ANY(ARRAY['directorTermYears','totalStudents','completedStudents'])THEN
   IF jsonb_typeof(a.value)IS DISTINCT FROM'number'OR(a.value#>>'{}')::numeric NOT BETWEEN 0 AND 9007199254740991 OR a.key IN('totalStudents','completedStudents')AND trunc((a.value#>>'{}')::numeric)<>(a.value#>>'{}')::numeric THEN RETURN false;END IF;
  ELSIF a.key=ANY(ARRAY['hasPedagogicalCouncil','hasEmployerParticipation','hasWebsite','hasDistancePlatform','hasMultimedia','hasLibrary'])THEN IF jsonb_typeof(a.value)IS DISTINCT FROM'boolean'THEN RETURN false;END IF;
  ELSIF a.key=ANY(ARRAY['programTypes','controlTypes'])THEN
   IF jsonb_typeof(a.value)IS DISTINCT FROM'array'OR jsonb_array_length(a.value)>250 OR EXISTS(SELECT 1 FROM jsonb_array_elements(a.value)x WHERE jsonb_typeof(x)IS DISTINCT FROM'string'OR length(x#>>'{}')>12000)THEN RETURN false;END IF;
  ELSIF a.key=ANY(ARRAY['commissionChairman','commissionMembers','programs','staff'])THEN
   expected:=CASE a.key WHEN'programs'THEN ARRAY['name','type','studentsCount']WHEN'staff'THEN ARRAY['fio','subject','education','experienceYears','employmentType']ELSE ARRAY['fio','position']END;
   numeric_fields:=CASE a.key WHEN'programs'THEN ARRAY['studentsCount']WHEN'staff'THEN ARRAY['experienceYears']ELSE'{}'::text[]END;
   IF a.key='commissionChairman'THEN IF NOT coalesce(public.uc_self_examination_shape(a.value,expected),false)OR EXISTS(SELECT 1 FROM jsonb_each(a.value)x WHERE jsonb_typeof(x.value)IS DISTINCT FROM'string'OR length(x.value#>>'{}')>12000)THEN RETURN false;END IF;
   ELSE
    IF jsonb_typeof(a.value)IS DISTINCT FROM'array'OR jsonb_array_length(a.value)>250 THEN RETURN false;END IF;
    FOR r IN SELECT * FROM jsonb_array_elements(a.value)LOOP
     IF NOT coalesce(public.uc_self_examination_shape(r,expected),false)THEN RETURN false;END IF;
     FOREACH k IN ARRAY expected LOOP
      IF k=ANY(numeric_fields)THEN IF r->k<>'null'::jsonb AND(jsonb_typeof(r->k)IS DISTINCT FROM'number'OR(r->>k)::numeric NOT BETWEEN 0 AND 9007199254740991 OR k='studentsCount'AND trunc((r->>k)::numeric)<>(r->>k)::numeric)THEN RETURN false;END IF;
      ELSIF jsonb_typeof(r->k)IS DISTINCT FROM'string'OR length(r->>k)>12000 THEN RETURN false;END IF;
     END LOOP;
    END LOOP;
   END IF;
  ELSIF jsonb_typeof(a.value)IS DISTINCT FROM'string'OR length(a.value#>>'{}')>12000 THEN RETURN false;
  END IF;
 END LOOP;RETURN true;
END;$f$;
CREATE FUNCTION public.uc_self_examination_validate(p_body jsonb,p_year integer)RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $f$
DECLARE i jsonb;v jsonb;s record;catalog jsonb:=public.uc_self_examination_catalog();BEGIN
 IF NOT coalesce(public.uc_self_examination_shape(p_body,ARRAY['reporting_year','provider_kind','indicator_profile','legal_basis_note','answers','sections','indicators']),false)
 OR NOT public.uc_self_examination_json_valid(p_body)OR jsonb_typeof(p_body->'reporting_year')IS DISTINCT FROM'number'OR p_body->>'reporting_year'IS DISTINCT FROM p_year::text
 OR jsonb_typeof(p_body->'provider_kind')IS DISTINCT FROM'string'OR p_body->>'provider_kind'NOT IN('undetermined','dpo_organization','other_educational_organization','other_training_provider')
 OR jsonb_typeof(p_body->'indicator_profile')IS DISTINCT FROM'string'OR p_body->>'indicator_profile'NOT IN('undetermined','dpo_annex6','centre_selected')OR jsonb_typeof(p_body->'legal_basis_note')IS DISTINCT FROM'string'OR length(p_body->>'legal_basis_note')>4000
 OR NOT public.uc_self_examination_answers_valid(p_body->'answers')OR jsonb_typeof(p_body->'sections')IS DISTINCT FROM'object'OR jsonb_typeof(p_body->'indicators')IS DISTINCT FROM'array'THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
 IF NOT public.uc_self_examination_shape(p_body->'sections',ARRAY(SELECT x->>0 FROM jsonb_array_elements(catalog->'sections')x))OR jsonb_array_length(p_body->'indicators')>250 THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
 FOR s IN SELECT * FROM jsonb_each(p_body->'sections')LOOP IF jsonb_typeof(s.value)NOT IN('null','string')THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_body->'indicators')x GROUP BY x->>'code'HAVING count(*)>1)THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
 FOR i IN SELECT * FROM jsonb_array_elements(p_body->'indicators')LOOP
  IF NOT public.uc_self_examination_shape(i,ARRAY['code','label','unit','value'])OR jsonb_typeof(i->'code')IS DISTINCT FROM'string'OR i->>'code'!~'^[A-Za-z0-9_.-]{1,80}$'
  OR jsonb_typeof(i->'label')IS DISTINCT FROM'string'OR length(i->>'label')NOT BETWEEN 1 AND 500 OR jsonb_typeof(i->'unit')IS DISTINCT FROM'string'OR i->>'unit'NOT IN('people','people_percent','percent','units','years','thousand_rubles','square_metres')THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
  v:=i->'value';IF v='null'::jsonb THEN CONTINUE;END IF;
  IF i->>'unit'='people_percent'THEN
   IF NOT public.uc_self_examination_shape(v,ARRAY['count','share','undefined_share_reason'])OR jsonb_typeof(v->'count')IS DISTINCT FROM'number'OR v->>'count'!~'^[0-9]+$'OR(v->>'count')::numeric>9007199254740991
   OR NOT(v->'share'='null'::jsonb OR jsonb_typeof(v->'share')='number'AND(v->>'share')::numeric BETWEEN 0 AND 100)
   OR NOT(v->'undefined_share_reason'='null'::jsonb OR jsonb_typeof(v->'undefined_share_reason')='string'AND length(btrim(v->>'undefined_share_reason'))BETWEEN 1 AND 1000)
   OR(v->'share'='null'::jsonb)IS DISTINCT FROM(v->'undefined_share_reason'<>'null'::jsonb)THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
  ELSE IF jsonb_typeof(v)IS DISTINCT FROM'number'OR(v#>>'{}')::numeric<0 OR(v#>>'{}')::numeric>9007199254740991 OR i->>'unit'='people'AND v#>>'{}'!~'^[0-9]+$'OR i->>'unit'='percent'AND i->>'code'<>'1.12'AND(v#>>'{}')::numeric>100 THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;END IF;
 END LOOP;
 IF p_body->>'indicator_profile'='dpo_annex6'AND p_year<2025 THEN PERFORM public.uc_self_examination_error('HISTORICAL_CATALOG_REVIEW_REQUIRED');END IF;
 IF p_body->>'indicator_profile'='dpo_annex6'AND(p_body->>'provider_kind'<>'dpo_organization'OR jsonb_array_length(p_body->'indicators')<>jsonb_array_length(catalog->'indicators')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'indicators')c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_body->'indicators')x WHERE x->>'code'=c->>'code'AND x->>'label'=c->>'label'AND x->>'unit'=c->>'unit')))THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
END;$f$;
CREATE FUNCTION public.uc_self_examination_facts(p_body jsonb)RETURNS TABLE(fact_key text,value jsonb,value_sha256 text,required boolean)LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $f$
 WITH facts(k,v,needed)AS(
 SELECT 'reporting_period',jsonb_build_object('reporting_year',p_body->'reporting_year','from',(p_body->>'reporting_year')||'-01-01','to',(p_body->>'reporting_year')||'-12-31'),true
 UNION ALL SELECT'legal_scope',jsonb_build_object('provider_kind',p_body->'provider_kind','indicator_profile',p_body->'indicator_profile','legal_basis_note',p_body->'legal_basis_note'),true
 UNION ALL SELECT'answer:'||a.key,a.value,a.key='fullName'FROM jsonb_each(p_body->'answers')a
 UNION ALL SELECT'answer:fullName','null'::jsonb,true WHERE NOT(p_body->'answers'?'fullName')
 UNION ALL SELECT'section:'||s.key,s.value,true FROM jsonb_each(p_body->'sections')s
 UNION ALL SELECT'indicator:'||(i->>'code'),i->'value',true FROM jsonb_array_elements(p_body->'indicators')i)
 SELECT k,v,public.uc_program_hash(v),needed FROM facts ORDER BY k
$f$;
CREATE FUNCTION public.uc_self_examination_actor(p_org uuid,p_people uuid[]DEFAULT'{}',p_write boolean DEFAULT false,p_request uuid DEFAULT NULL,p_lock boolean DEFAULT true)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE actor uuid:=auth.uid();BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR actor IS NULL OR p_org IS NULL OR NOT public.account_deletion_access_allowed()OR NOT public.uc_document_action_allowed(p_org,CASE WHEN p_write THEN'write'ELSE'read'END,NULL,NULL)THEN PERFORM public.uc_self_examination_error('ACCESS_DENIED');END IF;
 IF p_lock THEN PERFORM public.uc_copy_registry_fence(p_org,NULL,p_people,p_write,p_request);END IF;
 IF NOT public.uc_document_action_allowed(p_org,CASE WHEN p_write THEN'write'ELSE'read'END,NULL,NULL)THEN PERFORM public.uc_self_examination_error('ACCESS_DENIED');END IF;RETURN actor;
END;$f$;
CREATE FUNCTION public.uc_self_examination_source(p_org uuid,p_ref jsonb,p_lock boolean DEFAULT false)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE proof jsonb;BEGIN
 IF NOT coalesce(public.uc_self_examination_shape(p_ref,ARRAY['kind','document_id','version_id','content_hash']),false)OR p_ref->>'kind'IS DISTINCT FROM'org_document_version'THEN PERFORM public.uc_self_examination_error('SOURCE_UNAVAILABLE');END IF;
 IF p_lock THEN PERFORM public.uc_document_registry_source_lock(p_org,p_ref,false);END IF;
 proof:=public.uc_document_registry_source(p_org,p_ref,false,false);RETURN proof;
END;$f$;
CREATE FUNCTION public.uc_self_examination_reviews(p_org uuid,p_body jsonb,p_reviews jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE f record;r jsonb;src jsonb;items jsonb:='[]';current boolean;state text;BEGIN
 FOR f IN SELECT * FROM public.uc_self_examination_facts(p_body)LOOP
  r:=p_reviews->f.fact_key;state:=CASE WHEN f.value='null'::jsonb OR jsonb_typeof(f.value)='string'AND btrim(f.value#>>'{}')=''THEN'unknown'ELSE'entered'END;current:=false;
  IF r IS NOT NULL AND r->>'value_hash'=f.value_sha256 THEN
   src:=public.uc_self_examination_source(p_org,r->'source',false);current:=src IS NOT NULL AND public.uc_program_hash(src-'label')=r->>'source_proof_hash';
   IF r->>'state'IN('confirmed','not_applicable')THEN state:=r->>'state';END IF;
  END IF;
  items:=items||jsonb_build_array(jsonb_build_object('fact_key',f.fact_key,'state',state,'value',f.value,'value_hash',f.value_sha256,'required',f.required,'source_current',current,
   'source',CASE WHEN r->>'value_hash'=f.value_sha256 THEN r->'source'ELSE NULL END,'location',CASE WHEN r->>'value_hash'=f.value_sha256 THEN r->'location'ELSE NULL END,'review_note',CASE WHEN r->>'value_hash'=f.value_sha256 THEN r->'review_note'ELSE NULL END,
   'confirmed_by',CASE WHEN r->>'value_hash'=f.value_sha256 THEN r->'confirmed_by'ELSE NULL END,'confirmed_at',CASE WHEN r->>'value_hash'=f.value_sha256 THEN r->'confirmed_at'ELSE NULL END));
 END LOOP;RETURN items;
END;$f$;
CREATE FUNCTION public.uc_self_examination_projection(p_draft public.uc_self_examination_drafts)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE facts jsonb;missing jsonb;fact_hash text;artifact_current boolean;centre_current boolean;final_proof jsonb;BEGIN
 PERFORM public.uc_self_examination_actor(p_draft.organization_id,p_draft.participant_ids,false,NULL);
 facts:=public.uc_self_examination_reviews(p_draft.organization_id,p_draft.body,p_draft.fact_reviews);
 SELECT coalesce(jsonb_agg(x->>'fact_key'),'[]')INTO missing FROM jsonb_array_elements(facts)x WHERE(x->>'required')::boolean AND NOT(x->>'state'IN('confirmed','not_applicable')AND(x->>'source_current')::boolean);
 IF p_draft.body->>'provider_kind'='undetermined'OR p_draft.body->>'indicator_profile'='undetermined'OR btrim(p_draft.body->>'legal_basis_note')=''THEN missing:=missing||jsonb_build_array('legal_scope');END IF;
 fact_hash:=public.uc_program_hash(jsonb_build_object('body',p_draft.body,'reviews',p_draft.fact_reviews));
 artifact_current:=p_draft.latest_artifact IS NOT NULL AND p_draft.latest_artifact->>'fact_hash'=fact_hash;
 final_proof:=CASE WHEN p_draft.centre_final IS NOT NULL THEN public.uc_self_examination_source(p_draft.organization_id,p_draft.centre_final->'source',false)ELSE NULL END;
 centre_current:=p_draft.centre_final IS NOT NULL AND p_draft.centre_final->>'fact_hash'=fact_hash AND jsonb_array_length(missing)=0 AND final_proof IS NOT NULL AND public.uc_program_hash(final_proof-'label')=p_draft.centre_final->>'source_proof_hash'
 AND EXISTS(SELECT 1 FROM public.org_document_reviews r WHERE r.id=(p_draft.centre_final->>'review_id')::uuid AND r.version_id=(p_draft.centre_final->'source'->>'version_id')::uuid AND r.organization_id=p_draft.organization_id AND r.state='approved'AND r.approval_number=p_draft.centre_final->>'approval_number'AND r.approval_date=(p_draft.centre_final->>'approval_date')::date AND r.approved_by=(p_draft.centre_final->>'approved_by')::uuid);
 -- An older reporting year keeps its exact approved version. A newer annual document pointer never substitutes its bytes or year.
 RETURN jsonb_build_object('schema_version',1,'id',p_draft.id,'organization_id',p_draft.organization_id,'reporting_year',p_draft.reporting_year,'revision',p_draft.revision,'body',p_draft.body,'fact_hash',fact_hash,'facts',facts,'missing_fact_keys',missing,
 'latest_artifact',p_draft.latest_artifact,'artifact_current',artifact_current,'centre_final',p_draft.centre_final,'centre_final_current',centre_current,'publication',p_draft.publication,
 'status',CASE WHEN centre_current AND p_draft.publication->>'fact_hash'=fact_hash THEN'publication_declared_by_centre'WHEN centre_current THEN'centre_final_recorded'WHEN artifact_current THEN'centre_review_required'ELSE'draft'END,
 'can_write',public.uc_document_action_allowed(p_draft.organization_id,'write',NULL,NULL),'service_price',jsonb_build_object('amount_rub',3500,'label','3 500 ₽','decision','user20261023'),'service_order_state','separate_existing_order_flow','updated_at',p_draft.updated_at);
END;$f$;
CREATE FUNCTION public.read_self_examination_draft(p_organization_id uuid,p_reporting_year integer)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE d public.uc_self_examination_drafts;BEGIN
 PERFORM public.uc_self_examination_actor(p_organization_id,'{}',false,NULL,false);
 IF p_reporting_year IS NULL OR p_reporting_year NOT BETWEEN 2000 AND extract(year FROM clock_timestamp()AT TIME ZONE'UTC')::integer THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
 SELECT q.*INTO d FROM public.uc_self_examination_drafts q WHERE q.organization_id=p_organization_id AND q.reporting_year=p_reporting_year;
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'reporting_year',p_reporting_year,'catalog',public.uc_self_examination_catalog(),'draft',CASE WHEN d.id IS NULL THEN NULL ELSE public.uc_self_examination_projection(d)END);
END;$f$;

-- Original authenticated caller only; every mutation uses revision CAS and retained request receipts.
CREATE FUNCTION public.apply_self_examination_draft(p_organization_id uuid,p_reporting_year integer,p_expected_revision bigint,p_request_id uuid,p_action jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
<<uc025_apply_local>>
DECLARE actor uuid;d public.uc_self_examination_drafts;prior public.uc_self_examination_events;generation public.uc_self_examination_events;
 event_id uuid:=gen_random_uuid();payload_hash text;kind text;created boolean:=false;people uuid[];body jsonb;reviews jsonb;part jsonb;source_proof jsonb;f record;review jsonb;
 receipt jsonb;capture jsonb;fact_hash text;target public.org_documents;version public.org_document_versions;approved public.org_document_reviews;order_row public.service_orders;uri text;current_projection jsonb;
BEGIN
 actor:=public.uc_self_examination_actor(p_organization_id,'{}',true,p_request_id,false);
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990 OR p_reporting_year IS NULL
 OR p_reporting_year NOT BETWEEN 2000 AND extract(year FROM clock_timestamp()AT TIME ZONE'UTC')::integer OR jsonb_typeof(p_action)IS DISTINCT FROM'object'OR octet_length(p_action::text)>300000 THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
 kind:=p_action->>'kind';payload_hash:=public.uc_program_hash(jsonb_build_object('organization_id',p_organization_id,'reporting_year',p_reporting_year,'expected_revision',p_expected_revision,'action',p_action));
 PERFORM pg_advisory_xact_lock(hashtextextended('uc025_request:'||actor::text||':'||p_request_id::text,0));
 SELECT q.*INTO prior FROM public.uc_self_examination_events q WHERE q.actor_id=actor AND q.request_id=p_request_id;
 IF prior.id IS NOT NULL THEN
  IF prior.organization_id IS DISTINCT FROM p_organization_id OR prior.payload_sha256 IS DISTINCT FROM payload_hash THEN PERFORM public.uc_self_examination_error('REQUEST_MISMATCH');END IF;
  SELECT q.*INTO d FROM public.uc_self_examination_drafts q WHERE q.id=prior.draft_id AND q.organization_id=p_organization_id AND q.reporting_year=p_reporting_year;
  IF d.id IS NULL THEN PERFORM public.uc_self_examination_error('ACCESS_DENIED');END IF;
  PERFORM public.uc_self_examination_actor(p_organization_id,prior.participant_ids||d.participant_ids,true,p_request_id);
  RETURN jsonb_build_object('schema_version',1,'request_id',p_request_id,'replayed',true,'receipt',prior.receipt,'generation_capture',prior.snapshot->'generation_capture','draft',public.uc_self_examination_projection(d));
 END IF;
 -- Discover the complete old/new subject union before taking the organization fence.
 SELECT q.*INTO d FROM public.uc_self_examination_drafts q WHERE q.organization_id=p_organization_id AND q.reporting_year=p_reporting_year;
 people:=coalesce(d.participant_ids,'{}'::uuid[])||ARRAY[actor];
 IF kind IN('review_fact','record_generation','record_centre_final')AND jsonb_typeof(p_action->'source')='object'THEN
  source_proof:=public.uc_self_examination_source(p_organization_id,p_action->'source',false);
  IF source_proof IS NOT NULL THEN people:=people||ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(source_proof->'participants')x);END IF;
 END IF;
 IF kind='record_centre_final'AND public.uc_custom_journal_uuid(p_action->'review_id')THEN people:=people||ARRAY(SELECT r.approved_by FROM public.org_document_reviews r WHERE r.id=(p_action->>'review_id')::uuid AND r.organization_id=p_organization_id);END IF;
 PERFORM public.uc_self_examination_actor(p_organization_id,people,true,p_request_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('uc025_year:'||p_organization_id::text||':'||p_reporting_year::text,0));
 SELECT q.*INTO d FROM public.uc_self_examination_drafts q WHERE q.organization_id=p_organization_id AND q.reporting_year=p_reporting_year FOR UPDATE;
 IF d.id IS NULL THEN
  IF kind IS DISTINCT FROM'save'OR p_expected_revision<>0 OR NOT public.uc_self_examination_shape(p_action,ARRAY['kind','body'])THEN PERFORM public.uc_self_examination_error('REVISION_CONFLICT');END IF;
  PERFORM public.uc_self_examination_validate(p_action->'body',p_reporting_year);
  INSERT INTO public.uc_self_examination_drafts(organization_id,reporting_year,revision,body,participant_ids,created_by,updated_by)VALUES(p_organization_id,p_reporting_year,1,p_action->'body',ARRAY[actor],actor,actor)RETURNING *INTO d;created:=true;
 ELSE
  IF NOT(d.participant_ids<@people)THEN PERFORM public.uc_self_examination_error('REVISION_CONFLICT');END IF;
  PERFORM public.uc_self_examination_actor(p_organization_id,d.participant_ids,true,p_request_id);
  IF d.revision IS DISTINCT FROM p_expected_revision THEN PERFORM public.uc_self_examination_error('REVISION_CONFLICT');END IF;
 END IF;
 body:=d.body;reviews:=d.fact_reviews;people:=d.participant_ids||ARRAY[actor];
 IF kind='save'THEN
  IF NOT public.uc_self_examination_shape(p_action,ARRAY['kind','body'])THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
  PERFORM public.uc_self_examination_validate(p_action->'body',p_reporting_year);body:=p_action->'body';
  SELECT coalesce(jsonb_object_agg(r.key,r.value),'{}')INTO reviews FROM jsonb_each(d.fact_reviews)r JOIN public.uc_self_examination_facts(body)x ON x.fact_key=r.key AND x.value_sha256=r.value->>'value_hash';
 ELSIF kind='review_fact'THEN
  IF NOT public.uc_self_examination_shape(p_action,ARRAY['kind','fact_key','expected_value_hash','state','source','location','review_note'])
  OR jsonb_typeof(p_action->'fact_key')IS DISTINCT FROM'string'OR jsonb_typeof(p_action->'expected_value_hash')IS DISTINCT FROM'string'OR p_action->>'expected_value_hash'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(p_action->'state')IS DISTINCT FROM'string'OR p_action->>'state'NOT IN('confirmed','not_applicable')
  OR jsonb_typeof(p_action->'location')IS DISTINCT FROM'string'OR length(btrim(p_action->>'location'))NOT BETWEEN 1 AND 2000
  OR jsonb_typeof(p_action->'review_note')IS DISTINCT FROM'string'OR length(btrim(p_action->>'review_note'))NOT BETWEEN 1 AND 4000 THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
  SELECT x.*INTO f FROM public.uc_self_examination_facts(body)x WHERE x.fact_key=p_action->>'fact_key';
  IF NOT FOUND OR f.value_sha256 IS DISTINCT FROM p_action->>'expected_value_hash'THEN PERFORM public.uc_self_examination_error('REVISION_CONFLICT');END IF;
  IF p_action->>'state'='confirmed'AND(f.value='null'::jsonb OR jsonb_typeof(f.value)='string'AND btrim(f.value#>>'{}')='')THEN PERFORM public.uc_self_examination_error('MISSING_FACT');END IF;
  IF p_action->>'state'='not_applicable'AND f.fact_key IN('reporting_period','legal_scope','answer:fullName')THEN PERFORM public.uc_self_examination_error('REVIEW_REQUIRED');END IF;
  IF EXISTS(SELECT 1 FROM public.uc_self_examination_events q WHERE q.draft_id=d.id AND q.action='record_generation'AND q.snapshot->'latest_artifact'->'source'->>'version_id'=p_action->'source'->>'version_id')THEN PERFORM public.uc_self_examination_error('SOURCE_CHANGED');END IF;
  source_proof:=public.uc_self_examination_source(p_organization_id,p_action->'source',true);
  IF source_proof IS NULL THEN PERFORM public.uc_self_examination_error('SOURCE_UNAVAILABLE');END IF;
  people:=people||ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(source_proof->'participants')x);
  PERFORM public.uc_self_examination_actor(p_organization_id,people,true,p_request_id);
  review:=jsonb_build_object('fact_key',f.fact_key,'state',p_action->>'state','value_hash',f.value_sha256,'source',p_action->'source','source_proof_hash',public.uc_program_hash(source_proof-'label'),
  'location',btrim(p_action->>'location'),'review_note',btrim(p_action->>'review_note'),'confirmed_by',actor,'confirmed_at',clock_timestamp());reviews:=jsonb_set(reviews,ARRAY[f.fact_key],review,true);
 ELSIF kind='clear_review'THEN
  IF NOT public.uc_self_examination_shape(p_action,ARRAY['kind','fact_key'])OR jsonb_typeof(p_action->'fact_key')IS DISTINCT FROM'string'OR NOT EXISTS(SELECT 1 FROM public.uc_self_examination_facts(body)x WHERE x.fact_key=p_action->>'fact_key')THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;reviews:=reviews-(p_action->>'fact_key');
 ELSIF kind='prepare_generation'THEN
  IF NOT public.uc_self_examination_shape(p_action,ARRAY['kind','order_id','document_id','expected_document_revision'])OR NOT public.uc_custom_journal_uuid(p_action->'document_id')
  OR NOT(p_action->'order_id'='null'::jsonb OR public.uc_custom_journal_uuid(p_action->'order_id'))OR jsonb_typeof(p_action->'expected_document_revision')IS DISTINCT FROM'number'OR p_action->>'expected_document_revision'!~'^[0-9]+$'OR(p_action->>'expected_document_revision')::numeric>9007199254740990 THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
  IF NOT public.has_role(actor,'admin'::public.app_role)OR NOT public.uc_platform_document_action_allowed(actor,'write')THEN PERFORM public.uc_self_examination_error('ACCESS_DENIED');END IF;
  IF p_action->'order_id'<>'null'::jsonb THEN
   SELECT o.*INTO order_row FROM public.service_orders o WHERE o.id=(p_action->>'order_id')::uuid AND o.organization_id=p_organization_id AND o.service_id IN('self_examination_report','self_examination_report_auto')FOR SHARE;
   IF order_row.id IS NULL OR order_row.status IN('cancelled','canceled','refunded','rejected')THEN PERFORM public.uc_self_examination_error('ACCESS_DENIED');END IF;
  END IF;
  SELECT q.*INTO target FROM public.org_documents q WHERE q.id=(p_action->>'document_id')::uuid FOR SHARE;
  IF target.id IS NULL THEN IF(p_action->>'expected_document_revision')::bigint<>0 THEN PERFORM public.uc_self_examination_error('REVISION_CONFLICT');END IF;
  ELSIF target.organization_id IS DISTINCT FROM p_organization_id OR target.type IS DISTINCT FROM'self_examination_report'OR target.deleted_at IS NOT NULL THEN PERFORM public.uc_self_examination_error('ACCESS_DENIED');
  ELSIF target.document_revision IS DISTINCT FROM(p_action->>'expected_document_revision')::bigint THEN PERFORM public.uc_self_examination_error('REVISION_CONFLICT');END IF;
  -- Explicit target/year; old report year is never inferred from updated_at or silently replaced outside version history.
  capture:=jsonb_build_object('generation_id',event_id,'reporting_year',p_reporting_year,'body',body,'fact_reviews',reviews,'facts',public.uc_self_examination_reviews(p_organization_id,body,reviews),
   'fact_hash',public.uc_program_hash(jsonb_build_object('body',body,'reviews',reviews)),'order_id',p_action->'order_id','document_id',p_action->'document_id','expected_document_revision',p_action->'expected_document_revision','prepared_by',actor,'prepared_at',clock_timestamp());
 ELSIF kind='record_generation'THEN
  IF NOT public.uc_self_examination_shape(p_action,ARRAY['kind','generation_id','source','byte_sha256'])OR NOT public.uc_custom_journal_uuid(p_action->'generation_id')OR jsonb_typeof(p_action->'byte_sha256')IS DISTINCT FROM'string'OR p_action->>'byte_sha256'!~'^[a-f0-9]{64}$'THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
  IF NOT public.has_role(actor,'admin'::public.app_role)OR NOT public.uc_platform_document_action_allowed(actor,'write')THEN PERFORM public.uc_self_examination_error('ACCESS_DENIED');END IF;
  SELECT q.*INTO generation FROM public.uc_self_examination_events q WHERE q.id=(p_action->>'generation_id')::uuid AND q.draft_id=d.id AND q.organization_id=p_organization_id AND q.action='prepare_generation'AND q.actor_id=actor;
  IF generation.id IS NULL THEN PERFORM public.uc_self_examination_error('ACCESS_DENIED');END IF;
  fact_hash:=public.uc_program_hash(jsonb_build_object('body',body,'reviews',reviews));
  IF generation.snapshot->'generation_capture'->>'fact_hash'IS DISTINCT FROM fact_hash OR generation.snapshot->'generation_capture'->'facts'IS DISTINCT FROM public.uc_self_examination_reviews(p_organization_id,body,reviews)THEN PERFORM public.uc_self_examination_error('REVISION_CONFLICT');END IF;
  source_proof:=public.uc_self_examination_source(p_organization_id,p_action->'source',true);IF source_proof IS NULL THEN PERFORM public.uc_self_examination_error('SOURCE_UNAVAILABLE');END IF;
  SELECT q.*INTO version FROM public.org_document_versions q WHERE q.id=(p_action->'source'->>'version_id')::uuid AND q.document_id=(generation.snapshot->'generation_capture'->>'document_id')::uuid AND q.organization_id=p_organization_id AND q.request_id=generation.id AND q.uploaded_by=actor;
  IF version.id IS NULL OR version.document_metadata->>'type'IS DISTINCT FROM'self_examination_report'THEN PERFORM public.uc_self_examination_error('SOURCE_CHANGED');END IF;
  people:=people||generation.participant_ids||ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(source_proof->'participants')x);
  d.latest_artifact:=jsonb_build_object('generation_id',generation.id,'source',p_action->'source','fact_hash',fact_hash,'byte_sha256',p_action->>'byte_sha256','recorded_by',actor,'recorded_at',clock_timestamp(),'status','operator_recorded_draft');
 ELSIF kind='record_centre_final'THEN
  IF p_reporting_year>=extract(year FROM clock_timestamp()AT TIME ZONE'UTC')::integer THEN PERFORM public.uc_self_examination_error('REPORTING_PERIOD_NOT_FINISHED');END IF;
  IF NOT public.uc_self_examination_shape(p_action,ARRAY['kind','expected_fact_hash','source','review_id','verification_note'])OR jsonb_typeof(p_action->'expected_fact_hash')IS DISTINCT FROM'string'OR NOT public.uc_custom_journal_uuid(p_action->'review_id')OR jsonb_typeof(p_action->'verification_note')IS DISTINCT FROM'string'OR length(btrim(p_action->>'verification_note'))NOT BETWEEN 1 AND 4000 THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
  current_projection:=public.uc_self_examination_projection(d);fact_hash:=current_projection->>'fact_hash';
  IF fact_hash IS DISTINCT FROM p_action->>'expected_fact_hash'OR jsonb_array_length(current_projection->'missing_fact_keys')<>0 THEN PERFORM public.uc_self_examination_error('REVIEW_REQUIRED');END IF;
  source_proof:=public.uc_self_examination_source(p_organization_id,p_action->'source',true);IF source_proof IS NULL THEN PERFORM public.uc_self_examination_error('SOURCE_UNAVAILABLE');END IF;
  SELECT q.*INTO target FROM public.org_documents q WHERE q.id=(p_action->'source'->>'document_id')::uuid AND q.organization_id=p_organization_id AND q.type='self_examination_report'AND q.current_version_id=(p_action->'source'->>'version_id')::uuid AND q.deleted_at IS NULL FOR SHARE;
  SELECT r.*INTO approved FROM public.org_document_reviews r WHERE r.id=(p_action->>'review_id')::uuid AND r.document_id=target.id AND r.version_id=target.current_version_id AND r.organization_id=p_organization_id AND r.state='approved'FOR SHARE;
  IF target.id IS NULL OR approved.id IS NULL OR NOT public.uc_org_document_review_file_bound(target)OR public.uc_org_document_review_file_state(target)NOT IN('active','expiring')OR approved.approval_number IS NULL OR approved.approval_date IS NULL OR approved.approved_at IS NULL OR approved.approved_by IS NULL THEN PERFORM public.uc_self_examination_error('REVIEW_REQUIRED');END IF;
  IF NOT public.is_org_owner(actor,p_organization_id)AND NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.organization_id=p_organization_id AND s.user_id=actor AND(s.expires_at IS NULL OR s.expires_at>clock_timestamp())AND approved.approved_by=actor)THEN PERFORM public.uc_self_examination_error('CENTRE_DECISION_REQUIRED');END IF;
  people:=people||ARRAY[approved.approved_by]||ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(source_proof->'participants')x);
  d.centre_final:=jsonb_build_object('fact_hash',fact_hash,'source',p_action->'source','source_proof_hash',public.uc_program_hash(source_proof-'label'),'review_id',approved.id,'approval_number',approved.approval_number,'approval_date',approved.approval_date,'approved_by',approved.approved_by,'verification_note',btrim(p_action->>'verification_note'),'recorded_by',actor,'recorded_at',clock_timestamp(),'scope','Centre declares content verification; existing review binds this exact final file; no automatic legal or signature verification');
 ELSIF kind='record_publication'THEN
  IF NOT public.is_org_owner(actor,p_organization_id)AND NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.organization_id=p_organization_id AND s.user_id=actor AND(s.expires_at IS NULL OR s.expires_at>clock_timestamp()))THEN PERFORM public.uc_self_examination_error('CENTRE_DECISION_REQUIRED');END IF;
  IF NOT public.uc_self_examination_shape(p_action,ARRAY['kind','expected_fact_hash','public_url','declaration'])OR jsonb_typeof(p_action->'expected_fact_hash')IS DISTINCT FROM'string'OR jsonb_typeof(p_action->'public_url')IS DISTINCT FROM'string'OR jsonb_typeof(p_action->'declaration')IS DISTINCT FROM'string'OR length(btrim(p_action->>'declaration'))NOT BETWEEN 1 AND 4000 THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
  current_projection:=public.uc_self_examination_projection(d);fact_hash:=current_projection->>'fact_hash';
  IF fact_hash IS DISTINCT FROM p_action->>'expected_fact_hash'OR NOT(current_projection->>'centre_final_current')::boolean THEN PERFORM public.uc_self_examination_error('REVIEW_REQUIRED');END IF;
  source_proof:=public.uc_self_examination_source(p_organization_id,d.centre_final->'source',true);IF source_proof IS NULL THEN PERFORM public.uc_self_examination_error('SOURCE_UNAVAILABLE');END IF;
  uri:=btrim(p_action->>'public_url');IF length(uri)>2000 OR uri!~'^https://[A-Za-z0-9.-]+(:443)?(/[A-Za-z0-9_./~!$&()*+,;=:@%-]*)?$'OR uri~'(^https://[^/]*@|[?#]|storage/v1/|sb-storage/|object/sign/)'THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
  d.publication:=jsonb_build_object('fact_hash',fact_hash,'final_source',d.centre_final->'source','public_url',uri,'declaration',btrim(p_action->>'declaration'),'declared_by',actor,'declared_at',clock_timestamp(),'state','declared_by_centre_not_independently_verified');
 ELSE PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
 people:=ARRAY(SELECT DISTINCT x FROM unnest(people)x WHERE x IS NOT NULL ORDER BY x);IF cardinality(people)>1000 THEN PERFORM public.uc_self_examination_error('LIMIT_REACHED');END IF;
 PERFORM public.uc_self_examination_actor(p_organization_id,people,true,p_request_id);
 UPDATE public.uc_self_examination_drafts q SET body=uc025_apply_local.body,fact_reviews=reviews,revision=CASE WHEN created THEN 1 ELSE q.revision+1 END,participant_ids=people,updated_by=actor,updated_at=clock_timestamp(),latest_artifact=d.latest_artifact,centre_final=d.centre_final,publication=d.publication WHERE q.id=d.id RETURNING q.*INTO d;
 receipt:=jsonb_build_object('event_id',event_id,'draft_id',d.id,'organization_id',p_organization_id,'reporting_year',p_reporting_year,'revision',d.revision,'action',kind,'actor_id',actor,'request_id',p_request_id,'payload_sha256',payload_hash);
 INSERT INTO public.uc_self_examination_events(id,organization_id,draft_id,revision,actor_id,request_id,payload_sha256,action,snapshot,receipt,participant_ids)VALUES(event_id,p_organization_id,d.id,d.revision,actor,p_request_id,payload_hash,kind,jsonb_build_object('body',body,'fact_reviews',reviews,'latest_artifact',d.latest_artifact,'centre_final',d.centre_final,'publication',d.publication,'generation_capture',capture),receipt,people);
 IF kind IN('review_fact','record_generation','record_centre_final')THEN PERFORM public.uc_self_examination_link(p_organization_id,d.id,event_id,CASE kind WHEN'review_fact'THEN'fact:'||(p_action->>'fact_key')ELSE kind END,p_action->'source',people);END IF;
 RETURN jsonb_build_object('schema_version',1,'request_id',p_request_id,'replayed',false,'receipt',receipt,'generation_capture',capture,'draft',public.uc_self_examination_projection(d));
END;$f$;
CREATE FUNCTION public.read_self_examination_history(p_organization_id uuid,p_reporting_year integer,p_before_revision bigint DEFAULT NULL,p_limit integer DEFAULT 25)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE d public.uc_self_examination_drafts;items jsonb;more boolean;last_revision bigint;BEGIN
 PERFORM public.uc_self_examination_actor(p_organization_id,'{}',false,NULL,false);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR(p_before_revision IS NOT NULL AND p_before_revision<1)THEN PERFORM public.uc_self_examination_error('INVALID_INPUT');END IF;
 SELECT q.*INTO d FROM public.uc_self_examination_drafts q WHERE q.organization_id=p_organization_id AND q.reporting_year=p_reporting_year;
 IF d.id IS NULL THEN PERFORM public.uc_self_examination_error('NOT_FOUND');END IF;
 PERFORM public.uc_self_examination_actor(p_organization_id,d.participant_ids,false,NULL);
 SELECT coalesce(jsonb_agg(q.row ORDER BY q.revision DESC),'[]'),min(q.revision)INTO items,last_revision FROM(SELECT e.revision,jsonb_build_object('id',e.id,'revision',e.revision,'actor_id',e.actor_id,'action',e.action,'recorded_at',e.recorded_at,'snapshot',e.snapshot,'receipt',e.receipt)row FROM public.uc_self_examination_events e WHERE e.draft_id=d.id AND e.revision<=d.revision AND(p_before_revision IS NULL OR e.revision<p_before_revision)ORDER BY e.revision DESC LIMIT p_limit)q;
 SELECT EXISTS(SELECT 1 FROM public.uc_self_examination_events e WHERE e.draft_id=d.id AND e.revision<=d.revision AND e.revision<last_revision)INTO more;
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'draft_id',d.id,'reporting_year',p_reporting_year,'history',items,'next_before_revision',CASE WHEN more THEN last_revision ELSE NULL END);
END;$f$;

-- Retained exact source references are separate from draft values. No external-file deletion is begun automatically.
CREATE FUNCTION public.uc_self_examination_link(p_org uuid,p_draft uuid,p_event uuid,p_role text,p_source jsonb,p_people uuid[])RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE e public.uc_self_examination_events;v public.org_document_versions;proof jsonb;BEGIN
 SELECT q.*INTO e FROM public.uc_self_examination_events q WHERE q.id=p_event AND q.draft_id=p_draft AND q.organization_id=p_org AND q.actor_id=auth.uid();
 IF e.id IS NULL OR length(p_role)NOT BETWEEN 1 AND 220 THEN PERFORM public.uc_self_examination_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_self_examination_actor(p_org,p_people,true,e.request_id);proof:=public.uc_self_examination_source(p_org,p_source,true);
 SELECT q.*INTO v FROM public.org_document_versions q WHERE q.id=(p_source->>'version_id')::uuid AND q.document_id=(p_source->>'document_id')::uuid AND q.organization_id=p_org;
 IF proof IS NULL OR v.id IS NULL OR v.storage_object_id IS NULL OR v.file_path IS NULL THEN PERFORM public.uc_self_examination_error('SOURCE_UNAVAILABLE');END IF;
 INSERT INTO public.uc_self_examination_sources(organization_id,draft_id,event_id,source_role,source_ref,document_id,version_id,storage_object_id,bucket,path,participant_ids,linked_by)
 VALUES(p_org,p_draft,p_event,p_role,p_source,v.document_id,v.id,v.storage_object_id,'org-documents',v.file_path,p_people,auth.uid());
END;$f$;
CREATE FUNCTION public.uc_self_examination_personal_counts(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
 WITH scoped AS(SELECT d.id FROM public.uc_self_examination_drafts d WHERE p_user=ANY(d.participant_ids)OR d.created_by=p_user OR d.updated_by=p_user
 OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.organization_id=d.organization_id)
 OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_user AND s.organization_id=d.organization_id))
 SELECT jsonb_build_object('self_examination_drafts',(SELECT count(*)FROM public.uc_self_examination_drafts d WHERE d.id IN(SELECT id FROM scoped)),
 'self_examination_history',(SELECT count(*)FROM public.uc_self_examination_events e WHERE e.draft_id IN(SELECT id FROM scoped)OR p_user=ANY(e.participant_ids)OR e.actor_id=p_user),
 'self_examination_sources',(SELECT count(*)FROM public.uc_self_examination_sources s WHERE s.draft_id IN(SELECT id FROM scoped)OR p_user=ANY(s.participant_ids)OR s.linked_by=p_user))
$f$;
CREATE FUNCTION public.uc_self_examination_retained(p_user uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
 SELECT EXISTS(SELECT 1 FROM jsonb_each_text(public.uc_self_examination_personal_counts(p_user))x WHERE x.value::bigint>0)
$f$;
CREATE FUNCTION public.uc_self_examination_storage_retention()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.uc_self_examination_sources s WHERE s.storage_object_id=OLD.id OR(s.bucket=OLD.bucket_id AND s.path=OLD.name))THEN IF TG_OP='DELETE'THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='UPDATE'AND(to_jsonb(NEW)-ARRAY['last_accessed_at','updated_at','path_tokens'])IS NOT DISTINCT FROM(to_jsonb(OLD)-ARRAY['last_accessed_at','updated_at','path_tokens'])THEN NEW.updated_at:=OLD.updated_at;RETURN NEW;END IF;
 PERFORM public.uc_self_examination_error('RETAINED_SOURCE_IMMUTABLE');RETURN NULL;
END;$f$;
CREATE TRIGGER zz_uc_self_examination_storage_retention BEFORE UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.uc_self_examination_storage_retention();










-- Narrow source closure only. Existing four privacy function ACL/defaults remain untouched.
DO $closure$
DECLARE f record;g record;expected text[]:=ARRAY['uc_self_examination_error','uc_self_examination_shape','uc_self_examination_immutable','uc_self_examination_catalog','uc_self_examination_json_valid','uc_self_examination_answers_valid','uc_self_examination_validate','uc_self_examination_facts','uc_self_examination_actor','uc_self_examination_source','uc_self_examination_reviews','uc_self_examination_projection','read_self_examination_draft','apply_self_examination_draft','read_self_examination_history','uc_self_examination_link','uc_self_examination_personal_counts','uc_self_examination_retained','uc_self_examination_storage_retention'];BEGIN
 IF(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(expected))<>cardinality(expected)THEN RAISE EXCEPTION 'UC025_FUNCTION_CLOSURE_CHANGED';END IF;
 FOR f IN SELECT p.oid,p.proname,p.oid::regprocedure sig,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(expected)LOOP
  FOR g IN SELECT DISTINCT x.grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',f.proowner)))x WHERE x.grantee<>f.proowner LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',f.sig,CASE WHEN g.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(g.grantee))END);END LOOP;
  IF f.proname IN('read_self_examination_draft','apply_self_examination_draft','read_self_examination_history')THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END IF;
 END LOOP;
 REVOKE ALL ON public.uc_self_examination_drafts,public.uc_self_examination_events,public.uc_self_examination_sources FROM PUBLIC,anon,authenticated,service_role;
 FOR g IN SELECT DISTINCT x.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x WHERE c.oid IN('public.uc_self_examination_drafts'::regclass,'public.uc_self_examination_events'::regclass,'public.uc_self_examination_sources'::regclass)AND x.grantee<>c.relowner LOOP
  EXECUTE format('REVOKE ALL ON public.uc_self_examination_drafts,public.uc_self_examination_events,public.uc_self_examination_sources FROM %s',CASE WHEN g.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(g.grantee))END);
 END LOOP;
END;$closure$;



-- UC026 isolated native core only. Four shared privacy bodies are deliberately not replaced.
-- Full three-feature privacy acceptance is separate and pending composed source.
-- UC026 SOURCE PROPOSAL. Not a migration, legal decision, deployment or publication.
-- Depends on actual627 authorization/privacy helpers. No existing table/row/grant/role is changed here.

CREATE TABLE public.uc_publication_rule_versions(
 id text NOT NULL CHECK(id~'^[A-Za-z0-9_.:-]{1,200}$'),revision bigint NOT NULL CHECK(revision>0),
 catalog_version text NOT NULL CHECK(catalog_version~'^[A-Za-z0-9_.:-]{1,200}$'),
 requirement_id text NOT NULL CHECK(requirement_id~'^[A-Za-z0-9_.:-]{1,200}$'),
 requirement_version text NOT NULL CHECK(requirement_version~'^[A-Za-z0-9_.:-]{1,200}$'),
 title text NOT NULL CHECK(length(title)BETWEEN 1 AND 4000 AND title~'[^[:space:]]'),
 period text NOT NULL CHECK(period IN('continuous','reporting_year')),
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object'AND octet_length(source_snapshot::text)<=100000),
 source_revision_sha256 text NOT NULL CHECK(source_revision_sha256~'^[0-9a-f]{64}$'),
 legal_review text NOT NULL DEFAULT'needs_legal_review'CHECK(legal_review IN('needs_legal_review','reviewed')),
 annual_deadline jsonb CHECK(annual_deadline IS NULL OR jsonb_typeof(annual_deadline)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,
 review_reason text,request_id uuid NOT NULL UNIQUE,request_sha256 text NOT NULL CHECK(request_sha256~'^[0-9a-f]{64}$'),PRIMARY KEY(id,revision),
 CHECK(legal_review='reviewed'OR annual_deadline IS NULL),
 CHECK(legal_review<>'reviewed'OR(review_reason IS NOT NULL AND review_reason~'[^[:space:]]'AND length(review_reason)<=8000))
);
COMMENT ON COLUMN public.uc_publication_rule_versions.source_revision_sha256 IS 'Hash of this explicit rule-source snapshot, not an invented hash of unread legislation. Reviewed legal content requires a separate deliberate normative decision.';

CREATE TABLE public.uc_publication_streams(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id)ON DELETE RESTRICT,
 requirement_id text NOT NULL CHECK(requirement_id~'^[A-Za-z0-9_.:-]{1,200}$'),
 reporting_year integer CHECK(reporting_year BETWEEN 1900 AND 9998),
 revision bigint NOT NULL CHECK(revision>0),current_edition_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,
 UNIQUE NULLS NOT DISTINCT(organization_id,requirement_id,reporting_year),UNIQUE(organization_id,id)
);
CREATE TABLE public.uc_publication_editions(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,stream_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),rule_id text NOT NULL,rule_revision bigint NOT NULL,
 profile_revision bigint NOT NULL CHECK(profile_revision>0),
 applicability_revision bigint CHECK(applicability_revision>0),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'AND octet_length(body::text)<=50000),
 body_sha256 text NOT NULL CHECK(body_sha256~'^[0-9a-f]{64}$'),
 private_document_id uuid,private_version_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,
 FOREIGN KEY(organization_id,stream_id)REFERENCES public.uc_publication_streams(organization_id,id)ON DELETE RESTRICT,
 FOREIGN KEY(rule_id,rule_revision)REFERENCES public.uc_publication_rule_versions(id,revision)ON DELETE RESTRICT,
 CHECK((private_document_id IS NULL)=(private_version_id IS NULL)),
 UNIQUE(organization_id,id),UNIQUE(stream_id,revision)
);
ALTER TABLE public.uc_publication_streams ADD CONSTRAINT uc_publication_head_edition_fk
 FOREIGN KEY(organization_id,current_edition_id)REFERENCES public.uc_publication_editions(organization_id,id)DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE public.uc_publication_events(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,edition_id uuid NOT NULL,
 sequence bigint NOT NULL CHECK(sequence>0),kind text NOT NULL CHECK(kind IN('approved','withdrawn','check_completed')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'AND octet_length(body::text)<=50000),
 actor_id uuid NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),request_id uuid NOT NULL,
 FOREIGN KEY(organization_id,edition_id)REFERENCES public.uc_publication_editions(organization_id,id)ON DELETE RESTRICT,
 UNIQUE(edition_id,sequence),UNIQUE(organization_id,request_id),UNIQUE(organization_id,id)
);
CREATE TABLE public.uc_publication_check_jobs(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,edition_id uuid NOT NULL,
 actor_id uuid NOT NULL,request_id uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256~'^[0-9a-f]{64}$'),
 expected_stream_revision bigint NOT NULL CHECK(expected_stream_revision>0),expected_event_sequence bigint NOT NULL CHECK(expected_event_sequence>0),
 current_scope_sha256 text NOT NULL CHECK(current_scope_sha256~'^[0-9a-f]{64}$'),
 state text NOT NULL CHECK(state IN('prepared','committed','expired')),
 lease_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 check_id uuid,completed_at timestamptz,
 FOREIGN KEY(organization_id,edition_id)REFERENCES public.uc_publication_editions(organization_id,id)ON DELETE RESTRICT,
 UNIQUE(organization_id,request_id),UNIQUE(organization_id,id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval'5 minutes'),
 CHECK((state='prepared'AND check_id IS NULL AND completed_at IS NULL)OR(state='committed'AND check_id IS NOT NULL AND completed_at IS NOT NULL)
  OR(state='expired'AND check_id IS NULL AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX uc_publication_one_active_job ON public.uc_publication_check_jobs(edition_id)WHERE state='prepared';
CREATE TABLE public.uc_publication_checks(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,edition_id uuid NOT NULL,job_id uuid NOT NULL,
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'AND octet_length(body::text)<=50000),
 body_sha256 text NOT NULL CHECK(body_sha256~'^[0-9a-f]{64}$'),
 actor_id uuid NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,edition_id)REFERENCES public.uc_publication_editions(organization_id,id)ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,job_id)REFERENCES public.uc_publication_check_jobs(organization_id,id)ON DELETE RESTRICT,
 UNIQUE(job_id),UNIQUE(organization_id,id)
);
ALTER TABLE public.uc_publication_check_jobs ADD CONSTRAINT uc_publication_job_check_fk
 FOREIGN KEY(organization_id,check_id)REFERENCES public.uc_publication_checks(organization_id,id)DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE public.uc_publication_calendar_tasks(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id)ON DELETE RESTRICT,
 task_key text NOT NULL CHECK(octet_length(task_key)<=2000 AND task_key<>''),
 kind text NOT NULL CHECK(kind IN('annual_report','norm_change')),
 rule_id text NOT NULL,rule_revision bigint NOT NULL,profile_revision bigint NOT NULL CHECK(profile_revision>0),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'AND octet_length(body::text)<=100000),
 body_sha256 text NOT NULL CHECK(body_sha256~'^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_by uuid NOT NULL,
 FOREIGN KEY(rule_id,rule_revision)REFERENCES public.uc_publication_rule_versions(id,revision)ON DELETE RESTRICT,
 UNIQUE(organization_id,task_key),UNIQUE(organization_id,id)
);
CREATE TABLE public.uc_publication_deadline_decisions(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id)ON DELETE RESTRICT,
 rule_id text NOT NULL,rule_revision bigint NOT NULL,profile_revision bigint NOT NULL,
 applicability_revision bigint NOT NULL,revision bigint NOT NULL CHECK(revision>0),accepted boolean NOT NULL,
 reason text NOT NULL CHECK(length(reason)BETWEEN 1 AND 4000 AND reason~'[^[:space:]]'),
 deadline jsonb,source_revision_sha256 text NOT NULL CHECK(source_revision_sha256~'^[0-9a-f]{64}$'),
 decided_by uuid NOT NULL,decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),request_id uuid NOT NULL,
 FOREIGN KEY(rule_id,rule_revision)REFERENCES public.uc_publication_rule_versions(id,revision)ON DELETE RESTRICT,
 UNIQUE(organization_id,rule_id,revision),UNIQUE(organization_id,request_id),UNIQUE(organization_id,id),
 CHECK((accepted AND deadline IS NOT NULL)OR(NOT accepted AND deadline IS NULL))
);
CREATE TABLE public.uc_publication_requests(
 organization_id uuid NOT NULL REFERENCES public.organizations(id)ON DELETE RESTRICT,request_id uuid NOT NULL,
 actor_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('create_edition','approve','withdraw','calendar')),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[0-9a-f]{64}$'),
 object_id uuid NOT NULL,result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'AND octet_length(result::text)<=100000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(organization_id,request_id)
);
CREATE TABLE public.uc_publication_participants(
 organization_id uuid NOT NULL REFERENCES public.organizations(id)ON DELETE RESTRICT,
 object_kind text NOT NULL CHECK(object_kind IN('edition','event','job','check','task','request')),
 object_id uuid NOT NULL,user_id uuid NOT NULL,relation text NOT NULL CHECK(length(relation)BETWEEN 1 AND 80),
 PRIMARY KEY(organization_id,object_kind,object_id,user_id,relation)
);
CREATE INDEX uc_publication_person_retention ON public.uc_publication_participants(user_id,organization_id,object_kind,object_id);
CREATE INDEX uc_publication_org_heads ON public.uc_publication_streams(organization_id,requirement_id,id);
CREATE INDEX uc_publication_edition_events ON public.uc_publication_events(organization_id,edition_id,sequence);

CREATE TABLE public.uc_publication_write_tokens(
 transaction_id bigint NOT NULL,table_name text NOT NULL,object_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN('append','head_advance','job_commit','job_expire')),
 PRIMARY KEY(transaction_id,table_name,object_id,operation)
);

CREATE FUNCTION public.uc_publication_error(p_code text)RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
BEGIN
 IF p_code='ACCESS_DENIED'THEN RAISE EXCEPTION 'PUBLICATION_ACCESS_DENIED' USING ERRCODE='42501';
 ELSIF p_code='REVISION_CONFLICT'THEN RAISE EXCEPTION 'PUBLICATION_REVISION_CONFLICT' USING ERRCODE='40001';
 ELSIF p_code='SOURCE_CHANGED'THEN RAISE EXCEPTION 'PUBLICATION_SOURCE_CHANGED' USING ERRCODE='P0001';
 ELSIF p_code='SOURCE_UNAVAILABLE'THEN RAISE EXCEPTION 'PUBLICATION_SOURCE_UNAVAILABLE' USING ERRCODE='P0001';
 ELSE RAISE EXCEPTION 'PUBLICATION_INVALID_INPUT' USING ERRCODE='22023';END IF;
END;$fn$;
CREATE FUNCTION public.uc_publication_hash(p_value text)RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
 SELECT encode(pg_catalog.sha256(convert_to(p_value,'UTF8')),'hex')
$fn$;

CREATE FUNCTION public.uc_publication_boundary()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_object_id uuid;v_operation text;v_new jsonb:=to_jsonb(NEW);v_old jsonb:=to_jsonb(OLD);
BEGIN
 IF TG_OP='DELETE'THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 IF TG_TABLE_NAME='uc_publication_rule_versions'THEN
  -- Rule editions are written only by their separate deliberate normative editor;
  -- this proposal has no public API that can auto-approve a legal source.
  IF TG_OP<>'INSERT'THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
  IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS DISTINCT FROM'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid
   OR NOT public.has_role(auth.uid(),'admin'::public.app_role)THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
  RETURN NEW;
 END IF;
 v_object_id:=(v_new->>(CASE WHEN TG_TABLE_NAME='uc_publication_requests'THEN'request_id'WHEN TG_TABLE_NAME='uc_publication_participants'THEN'object_id'ELSE'id'END))::uuid;
 v_operation:='append';
 IF TG_OP='UPDATE'THEN
  IF TG_TABLE_NAME='uc_publication_streams'AND(v_new-ARRAY['revision','current_edition_id'])=(v_old-ARRAY['revision','current_edition_id'])
    AND(v_new->>'revision')::bigint=(v_old->>'revision')::bigint+1 AND v_new->>'current_edition_id'IS DISTINCT FROM v_old->>'current_edition_id'THEN v_operation:='head_advance';
  ELSIF TG_TABLE_NAME='uc_publication_check_jobs'AND(v_new-ARRAY['state','check_id','completed_at'])=(v_old-ARRAY['state','check_id','completed_at'])
    AND v_old->>'state'='prepared'AND v_new->>'state'='committed'AND v_new->>'check_id'IS NOT NULL AND v_new->>'completed_at'IS NOT NULL THEN v_operation:='job_commit';
  ELSIF TG_TABLE_NAME='uc_publication_check_jobs'AND(v_new-ARRAY['state','completed_at'])=(v_old-ARRAY['state','completed_at'])
    AND v_old->>'state'='prepared'AND v_new->>'state'='expired'AND(v_old->>'expires_at')::timestamptz<=clock_timestamp()
    AND v_new->>'check_id'IS NULL AND v_new->>'completed_at'IS NOT NULL THEN v_operation:='job_expire';
  ELSE PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.uc_publication_write_tokens t WHERE t.transaction_id=txid_current()AND t.table_name=TG_TABLE_NAME AND t.object_id=v_object_id AND t.operation=v_operation)
 THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 RETURN NEW;
END;$fn$;

CREATE FUNCTION public.uc_publication_token(p_table text,p_id uuid,p_operation text DEFAULT'append')RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF p_table NOT IN('uc_publication_streams','uc_publication_editions','uc_publication_events','uc_publication_check_jobs','uc_publication_checks','uc_publication_calendar_tasks','uc_publication_deadline_decisions','uc_publication_requests','uc_publication_participants')
 OR p_id IS NULL OR p_operation NOT IN('append','head_advance','job_commit','job_expire')THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 INSERT INTO public.uc_publication_write_tokens VALUES(txid_current(),p_table,p_id,p_operation)ON CONFLICT DO NOTHING;
END;$fn$;

DO $private_models$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['uc_publication_rule_versions','uc_publication_streams','uc_publication_editions','uc_publication_events','uc_publication_check_jobs','uc_publication_checks','uc_publication_calendar_tasks','uc_publication_deadline_decisions','uc_publication_requests','uc_publication_participants','uc_publication_write_tokens']LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  IF t<>'uc_publication_write_tokens'THEN EXECUTE format('CREATE TRIGGER uc_publication_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uc_publication_boundary()',t);END IF;
 END LOOP;
END;$private_models$;

-- No external EXECUTE on private helpers. A final assembled ACL pass must also
-- remove inherited non-owner grants and verify effective privileges/column ACLs.
REVOKE ALL ON FUNCTION public.uc_publication_error(text),public.uc_publication_hash(text),public.uc_publication_boundary(),public.uc_publication_token(text,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;

-- UC026 SOURCE PROPOSAL: original-caller reads, exact current/historical fences.
-- No public document endpoint, public Storage ACL, signed URL or file byte fallback.

CREATE FUNCTION public.uc_publication_actor_allowed(p_actor uuid,p_org uuid,p_write boolean DEFAULT false)RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_signature_assurance_active(p_actor)
 AND public.uc_signature_assurance_as_document_action_allowed(p_actor,p_org,'read',NULL,NULL)
 AND(NOT p_write OR public.uc_signature_assurance_as_document_action_allowed(p_actor,p_org,'write',NULL,NULL))
$fn$;

CREATE FUNCTION public.uc_publication_people(p_org uuid,p_edition uuid)RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(array_agg(DISTINCT person ORDER BY person),'{}'::uuid[])FROM(
 SELECT e.created_by person FROM public.uc_publication_editions e WHERE e.organization_id=p_org AND(p_edition IS NULL OR e.id=p_edition)
 UNION SELECT s.created_by FROM public.uc_publication_streams s WHERE s.organization_id=p_org AND(p_edition IS NULL OR EXISTS(SELECT 1 FROM public.uc_publication_editions e WHERE e.organization_id=p_org AND e.id=p_edition AND e.stream_id=s.id))
 UNION SELECT ev.actor_id FROM public.uc_publication_events ev WHERE ev.organization_id=p_org AND(p_edition IS NULL OR ev.edition_id=p_edition)
 UNION SELECT j.actor_id FROM public.uc_publication_check_jobs j WHERE j.organization_id=p_org AND(p_edition IS NULL OR j.edition_id=p_edition)
 UNION SELECT c.actor_id FROM public.uc_publication_checks c WHERE c.organization_id=p_org AND(p_edition IS NULL OR c.edition_id=p_edition)
 UNION SELECT q.actor_id FROM public.uc_publication_requests q WHERE q.organization_id=p_org AND(p_edition IS NULL OR q.object_id=p_edition)
 UNION SELECT t.created_by FROM public.uc_publication_calendar_tasks t WHERE t.organization_id=p_org AND p_edition IS NULL
 UNION SELECT d.decided_by FROM public.uc_publication_deadline_decisions d WHERE d.organization_id=p_org AND p_edition IS NULL
 UNION SELECT p.user_id FROM public.uc_publication_participants p WHERE p.organization_id=p_org AND(p_edition IS NULL OR p.object_kind='edition'AND p.object_id=p_edition
  OR p.object_kind='event'AND EXISTS(SELECT 1 FROM public.uc_publication_events e WHERE e.organization_id=p_org AND e.edition_id=p_edition AND e.id=p.object_id)
  OR p.object_kind='job'AND EXISTS(SELECT 1 FROM public.uc_publication_check_jobs j WHERE j.organization_id=p_org AND j.edition_id=p_edition AND j.id=p.object_id)
  OR p.object_kind='check'AND EXISTS(SELECT 1 FROM public.uc_publication_checks c WHERE c.organization_id=p_org AND c.edition_id=p_edition AND c.id=p.object_id))
 UNION SELECT v.uploaded_by FROM public.uc_publication_editions e JOIN public.org_document_versions v ON v.organization_id=e.organization_id AND v.document_id=e.private_document_id AND v.id=e.private_version_id WHERE e.organization_id=p_org AND(p_edition IS NULL OR e.id=p_edition)
 )known WHERE person IS NOT NULL
$fn$;

CREATE FUNCTION public.uc_publication_fence(p_actor uuid,p_org uuid,p_edition uuid DEFAULT NULL,p_write boolean DEFAULT false,p_extra_people uuid[]DEFAULT'{}')RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_people uuid[];
BEGIN
 IF NOT coalesce(public.uc_publication_actor_allowed(p_actor,p_org,p_write),false)THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 v_people:=public.uc_publication_people(p_org,p_edition)||coalesce(p_extra_people,'{}'::uuid[]);
 -- Shares the genuine627 erasure namespace and original actor/organization locks.
 -- The underlying private helper supports explicit service actors only with service role and uid NULL.
 BEGIN
  PERFORM public.uc_signature_assurance_fence(p_org,v_people,p_write,NULL,NULL,p_actor);
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
  IF SQLERRM='SIGNATURE_EVIDENCE_SOURCE_UNAVAILABLE'THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
  RAISE;
 END;
 IF NOT coalesce(public.uc_publication_actor_allowed(p_actor,p_org,p_write),false)THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
END;$fn$;

CREATE FUNCTION public.uc_publication_current_scope(p_org uuid,p_edition uuid)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE e public.uc_publication_editions;s public.uc_publication_streams;r public.uc_publication_rule_versions;
 p public.organization_education_profiles;d public.organization_document_applicability_decisions;v_private_current boolean:=true;v_current boolean;
BEGIN
 SELECT*INTO e FROM public.uc_publication_editions WHERE organization_id=p_org AND id=p_edition FOR SHARE NOWAIT;
 IF e.id IS NULL THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 SELECT*INTO s FROM public.uc_publication_streams WHERE organization_id=p_org AND id=e.stream_id FOR SHARE NOWAIT;
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc026:rule:'||e.rule_id,26026))THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 SELECT*INTO r FROM public.uc_publication_rule_versions WHERE id=e.rule_id ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
 SELECT*INTO p FROM public.organization_education_profiles WHERE organization_id=p_org FOR SHARE NOWAIT;
 SELECT*INTO d FROM public.organization_document_applicability_decisions WHERE organization_id=p_org AND requirement_id=s.requirement_id FOR SHARE NOWAIT;
 IF e.private_document_id IS NOT NULL THEN
  PERFORM 1 FROM public.org_documents od WHERE od.organization_id=p_org AND od.id=e.private_document_id FOR SHARE NOWAIT;
  PERFORM 1 FROM public.org_document_versions ov WHERE ov.organization_id=p_org AND ov.id=e.private_version_id AND ov.document_id=e.private_document_id FOR SHARE NOWAIT;
  SELECT EXISTS(SELECT 1 FROM public.org_documents od JOIN public.org_document_versions ov ON ov.id=od.current_version_id AND ov.document_id=od.id AND ov.organization_id=od.organization_id
   WHERE od.organization_id=p_org AND od.id=e.private_document_id AND od.deleted_at IS NULL AND od.current_version_id=e.private_version_id)INTO v_private_current;
 END IF;
 v_current:=s.id IS NOT NULL AND s.current_edition_id=e.id AND s.revision=e.revision
  AND p.organization_id IS NOT NULL AND p.revision=e.profile_revision AND r.id IS NOT NULL AND r.revision=e.rule_revision
  AND r.requirement_id=s.requirement_id AND r.catalog_version=e.body->'basis'->>'catalogVersion'
  AND r.requirement_version=e.body->'basis'->>'requirementVersion'AND r.source_revision_sha256=e.body->'basis'->>'sourceRevisionSha256'
  AND r.legal_review=e.body->'basis'->>'legalReview'AND v_private_current
  AND e.body->'basis'->>'profileRevision'=e.profile_revision::text
  AND e.body->'basis'->>'applicabilityDecisionRevision'IS NOT DISTINCT FROM e.applicability_revision::text
  AND((e.applicability_revision IS NULL AND d.organization_id IS NULL)
   OR(d.revision=e.applicability_revision AND d.profile_revision=p.revision AND d.catalog_version=r.catalog_version AND d.decision='applicable'));
 RETURN jsonb_build_object('current',coalesce(v_current,false),'stream_revision',s.revision,'edition_revision',e.revision,
  'profile_revision',p.revision,'rule_revision',r.revision,'applicability_revision',d.revision,'private_source_current',v_private_current,
  'basis',jsonb_build_object('catalogVersion',r.catalog_version,'requirementId',r.requirement_id,'requirementVersion',r.requirement_version,
   'profileRevision',p.revision,'applicabilityDecisionRevision',d.revision,
   'legalReview',r.legal_review,'sourceRevisionSha256',r.source_revision_sha256));
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');
END;$fn$;

CREATE FUNCTION public.read_organization_publication(p_organization_id uuid,p_edition_id uuid,p_before_sequence bigint DEFAULT NULL,p_limit integer DEFAULT 100)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE e public.uc_publication_editions;v_scope jsonb;v_events jsonb;v_latest bigint;v_people uuid[];
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR p_organization_id IS NULL OR p_edition_id IS NULL
 OR p_limit IS NULL OR p_limit<1 OR p_limit>100 OR(p_before_sequence IS NOT NULL AND p_before_sequence<1)THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_publication_fence(auth.uid(),p_organization_id,p_edition_id,false);
 SELECT*INTO e FROM public.uc_publication_editions WHERE organization_id=p_organization_id AND id=p_edition_id FOR SHARE NOWAIT;
 IF e.id IS NULL THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 IF e.body_sha256 IS DISTINCT FROM public.uc_publication_hash(e.body::text)THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
 v_scope:=public.uc_publication_current_scope(p_organization_id,p_edition_id);
 SELECT coalesce(max(sequence),0)INTO v_latest FROM public.uc_publication_events WHERE organization_id=p_organization_id AND edition_id=p_edition_id;
 SELECT coalesce(jsonb_agg(item ORDER BY sequence),'[]'::jsonb)INTO v_events FROM(
  SELECT ev.sequence,ev.body||jsonb_build_object('id',ev.id,'organizationId',ev.organization_id,'editionId',ev.edition_id,'sequence',ev.sequence,
   'actorId',ev.actor_id,'occurredAt',ev.occurred_at,'kind',ev.kind)item
  FROM public.uc_publication_events ev WHERE ev.organization_id=p_organization_id AND ev.edition_id=p_edition_id AND(p_before_sequence IS NULL OR ev.sequence<p_before_sequence)
  ORDER BY ev.sequence DESC LIMIT p_limit
 )page;
 -- body cannot override authoritative identity/time: its writes are closed-schema
 -- validated before insertion; additionally authoritative fields are applied last here.
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'edition',e.body||jsonb_build_object('id',e.id,'organizationId',e.organization_id,
  'revision',e.revision,'createdAt',e.created_at,'createdBy',e.created_by),'current_scope',v_scope,
  'projection',public.uc_publication_projection(p_organization_id,p_edition_id,v_scope),'events',v_events,'latest_event_sequence',v_latest,'history_complete',jsonb_array_length(v_events)=v_latest,
  'server_as_of',clock_timestamp(),'recheck_after_hours',24,'legal_compliance_confirmed',false,'continuous_availability_confirmed',false);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');
END;$fn$;

CREATE FUNCTION public.list_organization_publications(p_organization_id uuid,p_before_stream_id uuid DEFAULT NULL,p_limit integer DEFAULT 25)RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_rows jsonb:='[]';item record;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR p_limit IS NULL OR p_limit<1 OR p_limit>50
 THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_publication_fence(auth.uid(),p_organization_id,NULL,false);
 FOR item IN SELECT id,current_edition_id FROM public.uc_publication_streams WHERE organization_id=p_organization_id
  AND(p_before_stream_id IS NULL OR id<p_before_stream_id)ORDER BY id DESC LIMIT p_limit LOOP
  IF item.current_edition_id IS NOT NULL THEN v_rows:=v_rows||jsonb_build_array(jsonb_build_object('stream_id',item.id,
   'record',public.read_organization_publication(p_organization_id,item.current_edition_id,NULL,100)));END IF;
 END LOOP;
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'items',v_rows,'server_as_of',clock_timestamp());
END;$fn$;

REVOKE ALL ON FUNCTION public.uc_publication_actor_allowed(uuid,uuid,boolean),public.uc_publication_people(uuid,uuid),public.uc_publication_fence(uuid,uuid,uuid,boolean,uuid[]),public.uc_publication_current_scope(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.read_organization_publication(uuid,uuid,bigint,integer),public.list_organization_publications(uuid,uuid,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_organization_publication(uuid,uuid,bigint,integer),public.list_organization_publications(uuid,uuid,integer)TO authenticated;

-- UC026 proposed source. Deliberate centre actions; no public write, upload or legal approval inference.
CREATE FUNCTION public.uc_publication_closed(p_value jsonb,p_keys text[])RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT jsonb_typeof(p_value)='object'AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(p_value)k WHERE NOT(k=ANY(p_keys)))AND cardinality(p_keys)=(SELECT count(*)FROM jsonb_object_keys(p_value))
$fn$;
CREATE FUNCTION public.uc_publication_public_url(p_value text)RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE v_host text;v_probe text:=lower(p_value);v_hit text[];i integer;j integer;v_ascii integer;
BEGIN
 IF p_value IS NULL OR octet_length(p_value)>2048 OR p_value~'[[:space:][:cntrl:]\\#@]'OR p_value!~'^https://[a-z0-9.-]+/'THEN RETURN false;END IF;
 v_host:=substring(p_value FROM '^https://([^/?]+)');
 IF v_host IS NULL OR length(v_host)>253 OR v_host!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
  OR v_host~'(^|[.])(localhost|local|internal|test|invalid|example|onion)$'THEN RETURN false;END IF;
 -- Decode ASCII percent escapes only to detect hidden credential parameter names.
 -- UTF8 bytes in legitimate Cyrillic paths are not mistaken for invalid ASCII.
 FOR i IN 1..4 LOOP
  FOR v_hit IN SELECT regexp_matches(v_probe,'%([0-9a-f]{2})','g')LOOP
   v_ascii:=get_byte(decode(v_hit[1],'hex'),0);
   IF v_ascii BETWEEN 32 AND 126 THEN v_probe:=replace(v_probe,'%'||v_hit[1],chr(v_ascii));END IF;
  END LOOP;
 END LOOP;
 RETURN v_probe!~'[?&][^=&]*(token|signature|credential|password|authorization|session|secret|api.?key)[^=&]*=';
END;$fn$;
CREATE FUNCTION public.uc_publication_record_person(p_org uuid,p_kind text,p_object uuid,p_person uuid,p_relation text)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF p_person IS NULL THEN RETURN;END IF;
 PERFORM public.uc_publication_token('uc_publication_participants',p_object);
 INSERT INTO public.uc_publication_participants VALUES(p_org,p_kind,p_object,p_person,p_relation)ON CONFLICT DO NOTHING;
END;$fn$;
CREATE FUNCTION public.uc_publication_append_event(p_org uuid,p_edition uuid,p_actor uuid,p_request uuid,p_kind text,p_body jsonb)RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_id uuid:=gen_random_uuid();v_seq bigint;
BEGIN
 SELECT coalesce(max(sequence),0)+1 INTO v_seq FROM public.uc_publication_events WHERE organization_id=p_org AND edition_id=p_edition;
 PERFORM public.uc_publication_token('uc_publication_events',v_id);
 INSERT INTO public.uc_publication_events(id,organization_id,edition_id,sequence,kind,body,actor_id,request_id)VALUES(v_id,p_org,p_edition,v_seq,p_kind,p_body,p_actor,p_request);
 PERFORM public.uc_publication_record_person(p_org,'event',v_id,p_actor,'actor');
 RETURN v_id;
END;$fn$;
CREATE FUNCTION public.uc_publication_receipt(p_org uuid,p_request uuid)RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('requestId',r.request_id,'actorId',r.actor_id,'kind',r.kind,'objectId',r.object_id,'recordedAt',r.created_at)FROM public.uc_publication_requests r WHERE r.organization_id=p_org AND r.request_id=p_request
$fn$;
CREATE FUNCTION public.create_organization_publication(p_organization_id uuid,p_expected_stream_revision bigint,p_input jsonb,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_actor uuid:=auth.uid();v_hash text;v_req public.uc_publication_requests;r public.uc_publication_rule_versions;
 p public.organization_education_profiles;d public.organization_document_applicability_decisions;s public.uc_publication_streams;
 v_id uuid:=gen_random_uuid();v_stream uuid;v_revision bigint;v_body jsonb;v_private_doc uuid;v_private_ver uuid;v_uploader uuid;v_year integer;v_people uuid[];
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR v_actor IS NULL OR p_organization_id IS NULL OR p_request_id IS NULL OR p_expected_stream_revision IS NULL OR p_expected_stream_revision<0
 OR NOT coalesce(public.uc_publication_closed(p_input,ARRAY['ruleId','ruleRevision','profileRevision','applicabilityDecisionRevision','title','reportingYear','publicUrl','content','privateSource']),false)
 THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 PERFORM public.uc_publication_fence(v_actor,p_organization_id,NULL,true);
 v_hash:=public.uc_publication_hash(jsonb_build_object('input',p_input,'revision',p_expected_stream_revision)::text);
 SELECT*INTO v_req FROM public.uc_publication_requests WHERE organization_id=p_organization_id AND request_id=p_request_id FOR SHARE NOWAIT;
 IF v_req.request_id IS NOT NULL THEN
  IF v_req.actor_id<>v_actor OR v_req.kind<>'create_edition'OR v_req.request_sha256<>v_hash THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
  PERFORM public.uc_publication_fence(v_actor,p_organization_id,v_req.object_id,true);
  RETURN public.read_organization_publication(p_organization_id,v_req.object_id,NULL,100)||jsonb_build_object('receipt',public.uc_publication_receipt(p_organization_id,p_request_id));
 END IF;
 IF jsonb_typeof(p_input->'ruleId')IS DISTINCT FROM'string'OR jsonb_typeof(p_input->'publicUrl')IS DISTINCT FROM'string'OR jsonb_typeof(p_input->'title')IS DISTINCT FROM'string'OR length(p_input->>'title')NOT BETWEEN 1 AND 4000 OR(p_input->>'title')!~'[^[:space:]]'
 OR NOT coalesce(public.uc_publication_public_url(p_input->>'publicUrl'),false)
 OR NOT coalesce(public.uc_publication_closed(p_input->'content',ARRAY['sha256','bytes','mime']),false)
 OR jsonb_typeof(p_input->'content'->'sha256')IS DISTINCT FROM'string'OR jsonb_typeof(p_input->'content'->'mime')IS DISTINCT FROM'string'OR(p_input->'content'->>'sha256')!~'^[0-9a-f]{64}$'OR jsonb_typeof(p_input->'content'->'bytes')IS DISTINCT FROM'number'
 OR(p_input->'content'->>'bytes')!~'^[1-9][0-9]{0,8}$'OR(p_input->'content'->>'bytes')::bigint>20971520
 OR(p_input->'content'->>'mime')NOT IN('application/pdf','text/html','text/plain','image/png','image/jpeg')
 OR jsonb_typeof(p_input->'ruleRevision')IS DISTINCT FROM'number'OR jsonb_typeof(p_input->'profileRevision')IS DISTINCT FROM'number'OR jsonb_typeof(p_input->'applicabilityDecisionRevision')IS DISTINCT FROM'number'OR(p_input->>'ruleRevision')!~'^[1-9][0-9]{0,14}$'OR(p_input->>'profileRevision')!~'^[1-9][0-9]{0,14}$'
 OR(p_input->>'applicabilityDecisionRevision')!~'^[1-9][0-9]{0,14}$'
 THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc026:rule:'||(p_input->>'ruleId'),26026))THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 SELECT*INTO r FROM public.uc_publication_rule_versions WHERE id=p_input->>'ruleId'ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
 SELECT*INTO p FROM public.organization_education_profiles WHERE organization_id=p_organization_id FOR SHARE NOWAIT;
 SELECT*INTO d FROM public.organization_document_applicability_decisions WHERE organization_id=p_organization_id AND requirement_id=r.requirement_id FOR SHARE NOWAIT;
 IF r.id IS NULL OR r.revision<>(p_input->>'ruleRevision')::bigint OR p.organization_id IS NULL OR p.revision<>(p_input->>'profileRevision')::bigint
 OR d.organization_id IS NULL OR d.revision<>(p_input->>'applicabilityDecisionRevision')::bigint OR d.decision<>'applicable'OR d.profile_revision<>p.revision OR d.catalog_version<>r.catalog_version
 THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
 IF r.period='reporting_year'THEN
  IF jsonb_typeof(p_input->'reportingYear')IS DISTINCT FROM'number'OR(p_input->>'reportingYear')!~'^[0-9]{4}$'THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
  v_year:=(p_input->>'reportingYear')::integer;IF v_year NOT BETWEEN 1900 AND 9998 THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 ELSIF p_input->'reportingYear'<>'null'::jsonb THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 IF p_input->'privateSource'<>'null'::jsonb THEN
  IF NOT coalesce(public.uc_publication_closed(p_input->'privateSource',ARRAY['documentId','versionId']),false)THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
  v_private_doc:=(p_input->'privateSource'->>'documentId')::uuid;v_private_ver:=(p_input->'privateSource'->>'versionId')::uuid;
  PERFORM 1 FROM public.org_documents WHERE organization_id=p_organization_id AND id=v_private_doc AND current_version_id=v_private_ver AND deleted_at IS NULL FOR SHARE NOWAIT;
  IF NOT FOUND THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
  SELECT uploaded_by INTO v_uploader FROM public.org_document_versions WHERE organization_id=p_organization_id AND document_id=v_private_doc AND id=v_private_ver FOR SHARE NOWAIT;
  IF NOT FOUND THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
 END IF;
 PERFORM public.uc_publication_fence(v_actor,p_organization_id,NULL,true,ARRAY[v_uploader,d.decided_by,p.updated_by,r.created_by]);
 SELECT*INTO s FROM public.uc_publication_streams WHERE organization_id=p_organization_id AND requirement_id=r.requirement_id AND reporting_year IS NOT DISTINCT FROM v_year FOR UPDATE NOWAIT;
 IF(s.id IS NULL AND p_expected_stream_revision<>0)OR(s.id IS NOT NULL AND s.revision<>p_expected_stream_revision)THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 IF s.id IS NOT NULL THEN PERFORM public.uc_publication_fence(v_actor,p_organization_id,s.current_edition_id,true);END IF;
 v_stream:=coalesce(s.id,gen_random_uuid());v_revision:=p_expected_stream_revision+1;
 v_body:=jsonb_build_object('title',p_input->>'title','reportingYear',v_year,'publicUrl',p_input->>'publicUrl','content',p_input->'content','privateSource',p_input->'privateSource',
  'basis',jsonb_build_object('catalogVersion',r.catalog_version,'requirementId',r.requirement_id,'requirementVersion',r.requirement_version,'profileRevision',p.revision,
   'applicabilityDecisionRevision',d.revision,'legalReview',r.legal_review,'sourceRevisionSha256',r.source_revision_sha256));
 IF s.id IS NULL THEN
  PERFORM public.uc_publication_token('uc_publication_streams',v_stream);
  INSERT INTO public.uc_publication_streams(id,organization_id,requirement_id,reporting_year,revision,current_edition_id,created_by)VALUES(v_stream,p_organization_id,r.requirement_id,v_year,1,v_id,v_actor);
 ELSE
  PERFORM public.uc_publication_token('uc_publication_streams',v_stream,'head_advance');
  UPDATE public.uc_publication_streams SET revision=v_revision,current_edition_id=v_id WHERE id=v_stream AND organization_id=p_organization_id;
 END IF;
 PERFORM public.uc_publication_token('uc_publication_editions',v_id);
 INSERT INTO public.uc_publication_editions(id,organization_id,stream_id,revision,rule_id,rule_revision,profile_revision,applicability_revision,body,body_sha256,private_document_id,private_version_id,created_by)
 VALUES(v_id,p_organization_id,v_stream,v_revision,r.id,r.revision,p.revision,d.revision,v_body,public.uc_publication_hash(v_body::text),v_private_doc,v_private_ver,v_actor);
 FOREACH v_actor IN ARRAY ARRAY[auth.uid(),v_uploader,d.decided_by,p.updated_by,r.created_by]LOOP
  PERFORM public.uc_publication_record_person(p_organization_id,'edition',v_id,v_actor,'source_actor');END LOOP;
 v_actor:=auth.uid();
 PERFORM public.uc_publication_token('uc_publication_requests',p_request_id);
 INSERT INTO public.uc_publication_requests VALUES(p_organization_id,p_request_id,v_actor,'create_edition',v_hash,v_id,jsonb_build_object('edition_id',v_id),clock_timestamp());
 PERFORM public.uc_publication_record_person(p_organization_id,'request',p_request_id,v_actor,'actor');
 RETURN public.read_organization_publication(p_organization_id,v_id,NULL,100)||jsonb_build_object('receipt',public.uc_publication_receipt(p_organization_id,p_request_id));
EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected OR unique_violation THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');
 WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM public.uc_publication_error('INVALID_INPUT');
END;$fn$;
CREATE FUNCTION public.record_organization_publication_action(p_organization_id uuid,p_edition_id uuid,p_expected_revision bigint,p_expected_event_sequence bigint,p_kind text,p_reason text,p_reported_publication_date date,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_actor uuid:=auth.uid();v_hash text;v_req public.uc_publication_requests;v_scope jsonb;v_seq bigint;v_id uuid;v_body jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR v_actor IS NULL OR p_kind IS NULL OR p_kind NOT IN('approve','withdraw')OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_event_sequence IS NULL OR p_expected_revision<1 OR p_expected_event_sequence<0
 OR p_reason IS NULL OR length(p_reason)NOT BETWEEN 1 AND 4000 OR p_reason!~'[^[:space:]]'
 OR(p_kind='withdraw'AND p_reported_publication_date IS NOT NULL)OR(p_reported_publication_date IS NOT NULL AND(p_reported_publication_date>current_date OR extract(year FROM p_reported_publication_date)<1900))
 THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 PERFORM public.uc_publication_fence(v_actor,p_organization_id,p_edition_id,true);
 IF NOT public.uc_signature_assurance_as_document_action_allowed(v_actor,p_organization_id,'sign',NULL,NULL)THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 v_hash:=public.uc_publication_hash(jsonb_build_object('edition',p_edition_id,'revision',p_expected_revision,'sequence',p_expected_event_sequence,'kind',p_kind,'reason',p_reason,'date',p_reported_publication_date)::text);
 SELECT*INTO v_req FROM public.uc_publication_requests WHERE organization_id=p_organization_id AND request_id=p_request_id FOR SHARE NOWAIT;
 IF v_req.request_id IS NOT NULL THEN
  IF v_req.actor_id<>v_actor OR v_req.kind<>p_kind OR v_req.request_sha256<>v_hash OR v_req.object_id<>p_edition_id THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
  RETURN public.read_organization_publication(p_organization_id,p_edition_id,NULL,100)||jsonb_build_object('receipt',public.uc_publication_receipt(p_organization_id,p_request_id));
 END IF;
 v_scope:=public.uc_publication_current_scope(p_organization_id,p_edition_id);
 IF v_scope->>'current'<>'true'THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
 IF(v_scope->>'stream_revision')::bigint<>p_expected_revision THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 SELECT coalesce(max(sequence),0)INTO v_seq FROM public.uc_publication_events WHERE organization_id=p_organization_id AND edition_id=p_edition_id;
 IF v_seq<>p_expected_event_sequence THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 IF EXISTS(SELECT 1 FROM public.uc_publication_events WHERE organization_id=p_organization_id AND edition_id=p_edition_id AND(kind='withdrawn'OR(p_kind='approve'AND kind='approved')))
 OR(p_kind='withdraw'AND NOT EXISTS(SELECT 1 FROM public.uc_publication_events WHERE organization_id=p_organization_id AND edition_id=p_edition_id AND kind='approved'))
 THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 v_body:=jsonb_build_object('reason',p_reason);
 IF p_kind='approve'THEN v_body:=v_body||jsonb_build_object('reportedPublicationDate',p_reported_publication_date);END IF;
 v_id:=public.uc_publication_append_event(p_organization_id,p_edition_id,v_actor,p_request_id,CASE WHEN p_kind='approve'THEN'approved'ELSE'withdrawn'END,v_body);
 PERFORM public.uc_publication_token('uc_publication_requests',p_request_id);
 INSERT INTO public.uc_publication_requests VALUES(p_organization_id,p_request_id,v_actor,p_kind,v_hash,p_edition_id,jsonb_build_object('event_id',v_id),clock_timestamp());
 PERFORM public.uc_publication_record_person(p_organization_id,'request',p_request_id,v_actor,'actor');
 RETURN public.read_organization_publication(p_organization_id,p_edition_id,NULL,100)||jsonb_build_object('receipt',public.uc_publication_receipt(p_organization_id,p_request_id));
EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected OR unique_violation THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_publication_closed(jsonb,text[]),public.uc_publication_public_url(text),public.uc_publication_record_person(uuid,text,uuid,uuid,text),public.uc_publication_append_event(uuid,uuid,uuid,uuid,text,jsonb),
 public.uc_publication_receipt(uuid,uuid),public.create_organization_publication(uuid,bigint,jsonb,uuid),public.record_organization_publication_action(uuid,uuid,bigint,bigint,text,text,date,uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_organization_publication(uuid,bigint,jsonb,uuid),public.record_organization_publication_action(uuid,uuid,bigint,bigint,text,text,date,uuid)TO authenticated;

-- UC026 SOURCE PROPOSAL. Private lease-bound observation; browser cannot submit a successful check.
CREATE FUNCTION public.uc_publication_projection(p_org uuid,p_edition uuid,p_scope jsonb)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_approved timestamptz;v_reported text;v_withdrawn boolean;v_check jsonb;v_state text;v_verified timestamptz;
BEGIN
 SELECT occurred_at,body->>'reportedPublicationDate'INTO v_approved,v_reported FROM public.uc_publication_events WHERE organization_id=p_org AND edition_id=p_edition AND kind='approved'ORDER BY sequence DESC LIMIT 1;
 SELECT EXISTS(SELECT 1 FROM public.uc_publication_events WHERE organization_id=p_org AND edition_id=p_edition AND kind='withdrawn')INTO v_withdrawn;
 SELECT c.body INTO v_check FROM public.uc_publication_checks c JOIN public.uc_publication_events e ON e.organization_id=c.organization_id AND e.edition_id=c.edition_id AND e.kind='check_completed'AND e.body->'check'->>'id'=c.id::text
 WHERE c.organization_id=p_org AND c.edition_id=p_edition AND c.body_sha256=public.uc_publication_hash(c.body::text)ORDER BY e.sequence DESC LIMIT 1;
 IF v_check->>'result'='verified'THEN v_verified:=(v_check->>'checkedAt')::timestamptz;END IF;
 v_state:=CASE WHEN v_withdrawn THEN'withdrawn'WHEN p_scope->>'current'IS DISTINCT FROM'true'THEN'source_changed'WHEN v_approved IS NULL THEN'draft'
  WHEN v_verified IS NOT NULL AND v_verified>=clock_timestamp()-interval'24 hours'THEN'verified_at_time'WHEN v_verified IS NOT NULL OR v_check IS NOT NULL THEN'recheck_required'ELSE'awaiting_check'END;
 RETURN jsonb_build_object('state',v_state,'approvedAt',v_approved,'reportedPublicationDate',v_reported,'verifiedAt',v_verified,'checkId',v_check->>'id',
  'legalComplianceConfirmed',false,'continuousAvailabilityConfirmed',false)
  ||jsonb_build_object('verifiedAt',CASE WHEN v_state IN('withdrawn','source_changed')OR v_verified IS NULL THEN NULL ELSE v_check->>'checkedAt' END,'checkId',CASE WHEN v_state='withdrawn'THEN NULL ELSE v_check->>'id'END);
END;$fn$;
CREATE FUNCTION public.prepare_organization_publication_check(p_organization_id uuid,p_edition_id uuid,p_expected_revision bigint,p_expected_event_sequence bigint,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_actor uuid:=auth.uid();v_hash text;v_scope jsonb;v_seq bigint;j public.uc_publication_check_jobs;v_id uuid:=gen_random_uuid();v_lease uuid:=gen_random_uuid();v_old record;v_prepared_at timestamptz;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR v_actor IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_expected_event_sequence IS NULL OR p_expected_event_sequence<1 THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 PERFORM public.uc_publication_fence(v_actor,p_organization_id,p_edition_id,true);
 v_hash:=public.uc_publication_hash(jsonb_build_object('edition',p_edition_id,'revision',p_expected_revision,'sequence',p_expected_event_sequence)::text);
 SELECT*INTO j FROM public.uc_publication_check_jobs WHERE organization_id=p_organization_id AND request_id=p_request_id FOR SHARE NOWAIT;
 IF j.id IS NOT NULL THEN
  IF j.actor_id<>v_actor OR j.edition_id<>p_edition_id OR j.request_sha256<>v_hash THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
  -- Rights/all original people were checked above even for committed replays. No stale check is replayed as current.
  IF j.state='expired'OR(j.state='prepared'AND j.expires_at<=clock_timestamp())THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
  RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'job_id',j.id,'lease_id',j.lease_id,'actor_id',j.actor_id,'state',j.state);
 END IF;
 IF EXISTS(SELECT 1 FROM public.uc_publication_requests WHERE organization_id=p_organization_id AND request_id=p_request_id)THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 v_scope:=public.uc_publication_current_scope(p_organization_id,p_edition_id);
 IF v_scope->>'current'IS DISTINCT FROM'true'THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
 SELECT coalesce(max(sequence),0)INTO v_seq FROM public.uc_publication_events WHERE organization_id=p_organization_id AND edition_id=p_edition_id;
 IF(v_scope->>'stream_revision')::bigint<>p_expected_revision OR v_seq<>p_expected_event_sequence THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.uc_publication_events WHERE organization_id=p_organization_id AND edition_id=p_edition_id AND kind='approved')
 OR EXISTS(SELECT 1 FROM public.uc_publication_events WHERE organization_id=p_organization_id AND edition_id=p_edition_id AND kind='withdrawn')THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
 FOR v_old IN SELECT id FROM public.uc_publication_check_jobs WHERE organization_id=p_organization_id AND edition_id=p_edition_id AND state='prepared'AND expires_at<=clock_timestamp()FOR UPDATE NOWAIT LOOP
  PERFORM public.uc_publication_token('uc_publication_check_jobs',v_old.id,'job_expire');
  UPDATE public.uc_publication_check_jobs SET state='expired',completed_at=clock_timestamp()WHERE id=v_old.id;
 END LOOP;
 PERFORM public.uc_publication_token('uc_publication_check_jobs',v_id);
 v_prepared_at:=clock_timestamp();
 INSERT INTO public.uc_publication_check_jobs(id,organization_id,edition_id,actor_id,request_id,request_sha256,expected_stream_revision,expected_event_sequence,current_scope_sha256,state,lease_id,created_at,expires_at)
 VALUES(v_id,p_organization_id,p_edition_id,v_actor,p_request_id,v_hash,p_expected_revision,p_expected_event_sequence,public.uc_publication_hash(v_scope::text),'prepared',v_lease,v_prepared_at,v_prepared_at+interval'5 minutes');
 PERFORM public.uc_publication_record_person(p_organization_id,'job',v_id,v_actor,'actor');
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'job_id',v_id,'lease_id',v_lease,'actor_id',v_actor,'state','prepared');
EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected OR unique_violation THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.uc_publication_check_context(p_organization_id uuid,p_job_id uuid,p_lease_id uuid,p_actor_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE j public.uc_publication_check_jobs;e public.uc_publication_editions;v_scope jsonb;v_seq bigint;
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR p_actor_id IS NULL OR p_job_id IS NULL OR p_lease_id IS NULL THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 SELECT*INTO j FROM public.uc_publication_check_jobs WHERE organization_id=p_organization_id AND id=p_job_id AND lease_id=p_lease_id AND actor_id=p_actor_id FOR UPDATE NOWAIT;
 IF j.id IS NULL THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_publication_fence(p_actor_id,p_organization_id,j.edition_id,true);
 SELECT*INTO e FROM public.uc_publication_editions WHERE organization_id=p_organization_id AND id=j.edition_id FOR SHARE NOWAIT;
 IF e.id IS NULL OR e.body_sha256<>public.uc_publication_hash(e.body::text)THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
 v_scope:=public.uc_publication_current_scope(p_organization_id,j.edition_id);
 -- Committed replays still recheck current source and all retained people; they cannot trigger another network probe.
 IF v_scope->>'current'IS DISTINCT FROM'true'OR(v_scope->>'stream_revision')::bigint<>j.expected_stream_revision THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
 SELECT coalesce(max(sequence),0)INTO v_seq FROM public.uc_publication_events WHERE organization_id=p_organization_id AND edition_id=j.edition_id;
 IF j.state='committed'THEN
  IF v_seq<>j.expected_event_sequence+1 THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
  RETURN jsonb_build_object('schema_version',1,'state','committed','organization_id',p_organization_id,'edition_id',j.edition_id,'check_id',j.check_id);
 END IF;
 IF j.state<>'prepared'OR j.expires_at<=clock_timestamp()OR v_seq<>j.expected_event_sequence OR j.current_scope_sha256<>public.uc_publication_hash(v_scope::text)
 OR EXISTS(SELECT 1 FROM public.uc_publication_events WHERE organization_id=p_organization_id AND edition_id=j.edition_id AND kind='withdrawn')THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
 RETURN jsonb_build_object('schema_version',1,'state','prepared','organization_id',p_organization_id,'edition_id',j.edition_id,'edition_revision',e.revision,
  'public_url',e.body->>'publicUrl','content',e.body->'content','prepared_at',j.created_at,'expires_at',j.expires_at);
EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.uc_publication_commit_check(p_organization_id uuid,p_job_id uuid,p_lease_id uuid,p_actor_id uuid,p_observation jsonb)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context jsonb;j public.uc_publication_check_jobs;e public.uc_publication_editions;v_id uuid:=gen_random_uuid();v_body jsonb;v_event uuid;v_time timestamptz;v_validated_at timestamptz;v_result text;
BEGIN
 v_context:=public.uc_publication_check_context(p_organization_id,p_job_id,p_lease_id,p_actor_id);
 IF v_context->>'state'='committed'THEN RETURN v_context;END IF;
 IF NOT coalesce(public.uc_publication_closed(p_observation,ARRAY['result','requestedUrl','finalUrl','checkedAt','httpStatus','observed','responseHeadersSha256','redirectCount','observer','transport']),false)THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 SELECT*INTO j FROM public.uc_publication_check_jobs WHERE organization_id=p_organization_id AND id=p_job_id;
 SELECT*INTO e FROM public.uc_publication_editions WHERE organization_id=p_organization_id AND id=j.edition_id;
 v_validated_at:=clock_timestamp();v_time:=(p_observation->>'checkedAt')::timestamptz;v_result:=p_observation->>'result';
 IF v_time>v_validated_at THEN PERFORM public.uc_publication_error('SOURCE_UNAVAILABLE');END IF;
 IF v_time IS NULL OR v_time<j.created_at OR v_time>j.expires_at
 OR p_observation->>'requestedUrl'IS DISTINCT FROM e.body->>'publicUrl'OR NOT coalesce(public.uc_publication_public_url(p_observation->>'finalUrl'),false)
 OR p_observation->>'observer'IS DISTINCT FROM'platform_anonymous_https'OR p_observation->>'transport'IS DISTINCT FROM'public_addresses_pinned_tls_hostname_checked'
 OR v_result IS NULL OR v_result NOT IN('verified','hash_mismatch','mime_mismatch','http_unavailable','unsafe_target')
 OR jsonb_typeof(p_observation->'redirectCount')IS DISTINCT FROM'number'OR(p_observation->>'redirectCount')!~'^[0-3]$'
 OR(p_observation->'httpStatus'<>'null'::jsonb AND((p_observation->>'httpStatus')!~'^[1-5][0-9]{2}$'OR jsonb_typeof(p_observation->'httpStatus')<>'number'))
 OR(p_observation->'responseHeadersSha256'<>'null'::jsonb AND(jsonb_typeof(p_observation->'responseHeadersSha256')IS DISTINCT FROM'string'OR(p_observation->>'responseHeadersSha256')!~'^[0-9a-f]{64}$'))THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 IF p_observation->'observed'<>'null'::jsonb THEN
  IF NOT coalesce(public.uc_publication_closed(p_observation->'observed',ARRAY['sha256','bytes','mime']),false)
   OR jsonb_typeof(p_observation->'observed'->'sha256')IS DISTINCT FROM'string'OR jsonb_typeof(p_observation->'observed'->'bytes')IS DISTINCT FROM'number'OR jsonb_typeof(p_observation->'observed'->'mime')IS DISTINCT FROM'string'OR(p_observation->'observed'->>'sha256')!~'^[0-9a-f]{64}$'OR(p_observation->'observed'->>'bytes')!~'^[1-9][0-9]{0,8}$'
   OR(p_observation->'observed'->>'bytes')::bigint>20971520 OR length(p_observation->'observed'->>'mime')NOT BETWEEN 1 AND 200 THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 END IF;
 IF v_result='verified'AND(p_observation->'httpStatus'<>'200'::jsonb OR p_observation->'observed'IS DISTINCT FROM e.body->'content'OR p_observation->>'responseHeadersSha256'IS NULL)THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
 v_body:=p_observation||jsonb_build_object('id',v_id,'organizationId',p_organization_id,'editionId',j.edition_id,'editionRevision',e.revision);
 PERFORM public.uc_publication_token('uc_publication_checks',v_id);
 INSERT INTO public.uc_publication_checks(id,organization_id,edition_id,job_id,body,body_sha256,actor_id)VALUES(v_id,p_organization_id,j.edition_id,j.id,v_body,public.uc_publication_hash(v_body::text),p_actor_id);
 PERFORM public.uc_publication_record_person(p_organization_id,'check',v_id,p_actor_id,'actor');
 v_event:=public.uc_publication_append_event(p_organization_id,j.edition_id,p_actor_id,j.request_id,'check_completed',jsonb_build_object('check',v_body));
 PERFORM public.uc_publication_token('uc_publication_check_jobs',j.id,'job_commit');
 UPDATE public.uc_publication_check_jobs SET state='committed',check_id=v_id,completed_at=clock_timestamp()WHERE id=j.id;
 RETURN jsonb_build_object('schema_version',1,'state','committed','organization_id',p_organization_id,'edition_id',j.edition_id,'check_id',v_id);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN PERFORM public.uc_publication_error('INVALID_INPUT');
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_publication_projection(uuid,uuid,jsonb),public.prepare_organization_publication_check(uuid,uuid,bigint,bigint,uuid),public.uc_publication_check_context(uuid,uuid,uuid,uuid),public.uc_publication_commit_check(uuid,uuid,uuid,uuid,jsonb)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.prepare_organization_publication_check(uuid,uuid,bigint,bigint,uuid)TO authenticated;
GRANT EXECUTE ON FUNCTION public.uc_publication_check_context(uuid,uuid,uuid,uuid),public.uc_publication_commit_check(uuid,uuid,uuid,uuid,jsonb)TO service_role;

-- UC026 source: retained editions remain addressable under fresh original-caller rights.
CREATE FUNCTION public.list_organization_publication_editions(p_organization_id uuid,p_stream_id uuid,p_before_revision bigint DEFAULT NULL,p_limit integer DEFAULT 25)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_rows jsonb:='[]';e record;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR(p_before_revision IS NOT NULL AND p_before_revision<1)THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 PERFORM public.uc_publication_fence(auth.uid(),p_organization_id,NULL,false);
 IF NOT EXISTS(SELECT 1 FROM public.uc_publication_streams WHERE organization_id=p_organization_id AND id=p_stream_id)THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 FOR e IN SELECT id FROM public.uc_publication_editions WHERE organization_id=p_organization_id AND stream_id=p_stream_id AND(p_before_revision IS NULL OR revision<p_before_revision)ORDER BY revision DESC LIMIT p_limit LOOP
  v_rows:=v_rows||jsonb_build_array(public.read_organization_publication(p_organization_id,e.id,NULL,100));
 END LOOP;
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'stream_id',p_stream_id,'editions',v_rows,'server_as_of',clock_timestamp());
END;$fn$;
REVOKE ALL ON FUNCTION public.list_organization_publication_editions(uuid,uuid,bigint,integer)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_organization_publication_editions(uuid,uuid,bigint,integer)TO authenticated;

-- UC026 SOURCE PROPOSAL. The designated owner deliberately versions a source snapshot.
-- Importing a catalogue label never marks a law current, a deadline reviewed or a centre compliant.
CREATE FUNCTION public.list_publication_rule_versions(p_organization_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_rows jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_publication_fence(auth.uid(),p_organization_id,NULL,false);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'revision',r.revision,'catalogVersion',r.catalog_version,'requirementId',r.requirement_id,'requirementVersion',r.requirement_version,'title',r.title,
  'period',r.period,'sourceSnapshot',r.source_snapshot,'sourceRevisionSha256',r.source_revision_sha256,'legalReview',r.legal_review,'annualDeadline',r.annual_deadline,'createdAt',r.created_at,'reviewReason',r.review_reason,'centreDeadlineDecision',(SELECT jsonb_build_object('id',dd.id,'revision',dd.revision,'accepted',dd.accepted,'reason',dd.reason,'profileRevision',dd.profile_revision,'ruleRevision',dd.rule_revision,'applicabilityRevision',dd.applicability_revision,'decidedAt',dd.decided_at)FROM public.uc_publication_deadline_decisions dd WHERE dd.organization_id=p_organization_id AND dd.rule_id=r.id ORDER BY dd.revision DESC LIMIT 1))ORDER BY r.requirement_id),'[]'::jsonb)INTO v_rows
 FROM public.uc_publication_rule_versions r WHERE NOT EXISTS(SELECT 1 FROM public.uc_publication_rule_versions n WHERE n.id=r.id AND n.revision>r.revision);
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'rules',v_rows,'legal_compliance_confirmed',false);
END;$fn$;
CREATE FUNCTION public.append_publication_rule_version(p_organization_id uuid,p_rule_id text,p_expected_revision bigint,p_input jsonb,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_old public.uc_publication_rule_versions;v_replay public.uc_publication_rule_versions;v_hash text;v_request_hash text;v_deadline jsonb;v_review text;v_result jsonb;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS DISTINCT FROM'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid OR NOT public.has_role(auth.uid(),'admin'::public.app_role)
 THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 PERFORM public.uc_publication_fence(auth.uid(),p_organization_id,NULL,true);
 IF p_request_id IS NULL OR p_rule_id IS NULL OR p_rule_id!~'^[A-Za-z0-9_.:-]{1,200}$'OR p_expected_revision IS NULL OR p_expected_revision<0
 OR NOT coalesce(public.uc_publication_closed(p_input,ARRAY['catalogVersion','requirementId','requirementVersion','title','period','sourceSnapshot','legalReview','annualDeadline','reviewReason']),false)
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['catalogVersion','requirementId','requirementVersion','title','period','legalReview'])k WHERE jsonb_typeof(p_input->k)IS DISTINCT FROM'string')
 OR(jsonb_typeof(p_input->'reviewReason')IS DISTINCT FROM'string'AND p_input->'reviewReason'<>'null'::jsonb)OR length(p_input->>'reviewReason')>8000
 OR jsonb_typeof(p_input->'sourceSnapshot')IS DISTINCT FROM'object'OR octet_length((p_input->'sourceSnapshot')::text)>100000
 OR(p_input->>'catalogVersion')IS NULL OR(p_input->>'catalogVersion')!~'^[A-Za-z0-9_.:-]{1,200}$'OR(p_input->>'requirementId')IS NULL OR(p_input->>'requirementId')!~'^[A-Za-z0-9_.:-]{1,200}$'
 OR(p_input->>'requirementVersion')IS NULL OR(p_input->>'requirementVersion')!~'^[A-Za-z0-9_.:-]{1,200}$'OR(p_input->>'title')IS NULL OR length(p_input->>'title')NOT BETWEEN 1 AND 4000
 OR(p_input->>'period')IS NULL OR(p_input->>'period')NOT IN('continuous','reporting_year')OR(p_input->>'legalReview')IS NULL OR(p_input->>'legalReview')NOT IN('needs_legal_review','reviewed')
 THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 v_review:=p_input->>'legalReview';v_deadline:=nullif(p_input->'annualDeadline','null'::jsonb);
 IF v_review='reviewed'AND((p_input->>'reviewReason')IS NULL OR(p_input->>'reviewReason')!~'[^[:space:]]'OR length(p_input->>'reviewReason')>8000)THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 IF v_deadline IS NOT NULL THEN
  IF v_review<>'reviewed'OR p_input->>'period'<>'reporting_year'OR NOT coalesce(public.uc_publication_closed(v_deadline,ARRAY['month','day','yearOffset']),false)
  OR jsonb_typeof(v_deadline->'month')IS DISTINCT FROM'number'OR jsonb_typeof(v_deadline->'day')IS DISTINCT FROM'number'OR jsonb_typeof(v_deadline->'yearOffset')IS DISTINCT FROM'number'OR(v_deadline->>'month')!~'^(0?[1-9]|1[0-2])$'OR(v_deadline->>'day')!~'^(0?[1-9]|[12][0-9]|3[01])$'OR(v_deadline->>'yearOffset')!~'^[0-2]$'THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
  PERFORM make_date(2000,(v_deadline->>'month')::integer,(v_deadline->>'day')::integer);
 END IF;
 v_request_hash:=public.uc_publication_hash(jsonb_build_object('ruleId',p_rule_id,'expectedRevision',p_expected_revision,'input',p_input)::text);
 SELECT*INTO v_replay FROM public.uc_publication_rule_versions WHERE request_id=p_request_id FOR SHARE NOWAIT;
 IF v_replay.id IS NOT NULL THEN
  IF v_replay.created_by<>auth.uid()OR v_replay.id<>p_rule_id OR v_replay.revision<>p_expected_revision+1 OR v_replay.request_sha256<>v_request_hash THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
  RETURN public.list_publication_rule_versions(p_organization_id)||jsonb_build_object('rule_receipt',jsonb_build_object('requestId',p_request_id,'actorId',auth.uid(),'ruleId',v_replay.id,'ruleRevision',v_replay.revision,'recordedAt',v_replay.created_at));
 END IF;
 -- Stable advisory key also serializes the absent first revision; no new source replaces an old row.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc026:rule:'||p_rule_id,26026))THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 SELECT*INTO v_old FROM public.uc_publication_rule_versions WHERE id=p_rule_id ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
 IF coalesce(v_old.revision,0)<>p_expected_revision THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 IF v_old.id IS NOT NULL AND v_old.requirement_id IS DISTINCT FROM p_input->>'requirementId'THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 v_hash:=public.uc_publication_hash((p_input->'sourceSnapshot')::text);
 INSERT INTO public.uc_publication_rule_versions(id,revision,catalog_version,requirement_id,requirement_version,title,period,source_snapshot,source_revision_sha256,legal_review,annual_deadline,created_by,review_reason,request_id,request_sha256)
 VALUES(p_rule_id,p_expected_revision+1,p_input->>'catalogVersion',p_input->>'requirementId',p_input->>'requirementVersion',p_input->>'title',p_input->>'period',p_input->'sourceSnapshot',v_hash,v_review,v_deadline,auth.uid(),p_input->>'reviewReason',p_request_id,v_request_hash);
 SELECT*INTO v_replay FROM public.uc_publication_rule_versions WHERE request_id=p_request_id;
 RETURN public.list_publication_rule_versions(p_organization_id)||jsonb_build_object('rule_receipt',jsonb_build_object('requestId',p_request_id,'actorId',auth.uid(),'ruleId',v_replay.id,'ruleRevision',v_replay.revision,'recordedAt',v_replay.created_at));
EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected OR unique_violation THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');
 WHEN datetime_field_overflow OR invalid_text_representation THEN PERFORM public.uc_publication_error('INVALID_INPUT');
END;$fn$;
REVOKE ALL ON FUNCTION public.list_publication_rule_versions(uuid),public.append_publication_rule_version(uuid,text,bigint,jsonb,uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_publication_rule_versions(uuid),public.append_publication_rule_version(uuid,text,bigint,jsonb,uuid)TO authenticated;

-- UC026 SOURCE PROPOSAL. Explicit centre deadline acceptance, immutable annual/change tasks.
CREATE FUNCTION public.record_publication_deadline_decision(p_organization_id uuid,p_rule_id text,p_rule_revision bigint,p_profile_revision bigint,p_applicability_revision bigint,p_expected_revision bigint,p_accept boolean,p_reason text,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.uc_publication_rule_versions;p public.organization_education_profiles;d public.organization_document_applicability_decisions;v_old public.uc_publication_deadline_decisions;v_replay public.uc_publication_deadline_decisions;v_id uuid:=gen_random_uuid();
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR p_request_id IS NULL OR p_accept IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0
 OR p_reason IS NULL OR length(p_reason)NOT BETWEEN 1 AND 4000 OR p_reason!~'[^[:space:]]'THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 PERFORM public.uc_publication_fence(auth.uid(),p_organization_id,NULL,true);
 IF NOT public.uc_signature_assurance_as_document_action_allowed(auth.uid(),p_organization_id,'sign',NULL,NULL)THEN PERFORM public.uc_publication_error('ACCESS_DENIED');END IF;
 SELECT*INTO v_replay FROM public.uc_publication_deadline_decisions WHERE organization_id=p_organization_id AND request_id=p_request_id FOR SHARE NOWAIT;
 IF v_replay.id IS NOT NULL THEN
  IF v_replay.decided_by<>auth.uid()OR v_replay.rule_id IS DISTINCT FROM p_rule_id OR v_replay.rule_revision IS DISTINCT FROM p_rule_revision OR v_replay.profile_revision IS DISTINCT FROM p_profile_revision
  OR v_replay.applicability_revision IS DISTINCT FROM p_applicability_revision OR v_replay.revision<>p_expected_revision+1 OR v_replay.accepted<>p_accept OR v_replay.reason<>p_reason THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
  RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'request_id',p_request_id,'decision_id',v_replay.id,'revision',v_replay.revision,'actor_id',v_replay.decided_by,'rule_id',v_replay.rule_id,'rule_revision',v_replay.rule_revision,'profile_revision',v_replay.profile_revision,'applicability_revision',v_replay.applicability_revision,'accepted',v_replay.accepted,'decided_at',v_replay.decided_at,'replayed',true);
 END IF;
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc026:rule:'||p_rule_id,26026))THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 SELECT*INTO r FROM public.uc_publication_rule_versions WHERE id=p_rule_id ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
 SELECT*INTO p FROM public.organization_education_profiles WHERE organization_id=p_organization_id FOR SHARE NOWAIT;
 SELECT*INTO d FROM public.organization_document_applicability_decisions WHERE organization_id=p_organization_id AND requirement_id=r.requirement_id FOR SHARE NOWAIT;
 IF r.id IS NULL OR r.revision IS DISTINCT FROM p_rule_revision OR p.organization_id IS NULL OR p.revision IS DISTINCT FROM p_profile_revision
 OR d.organization_id IS NULL OR d.revision IS DISTINCT FROM p_applicability_revision OR d.profile_revision<>p.revision OR d.catalog_version<>r.catalog_version OR d.decision<>'applicable'
 OR(p_accept AND(r.legal_review<>'reviewed'OR r.annual_deadline IS NULL OR r.period<>'reporting_year'))THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
 PERFORM public.uc_publication_fence(auth.uid(),p_organization_id,NULL,true,ARRAY[r.created_by,p.updated_by,d.decided_by]);
 SELECT*INTO v_old FROM public.uc_publication_deadline_decisions WHERE organization_id=p_organization_id AND rule_id=p_rule_id ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
 IF coalesce(v_old.revision,0)<>p_expected_revision THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 PERFORM public.uc_publication_token('uc_publication_deadline_decisions',v_id);
 INSERT INTO public.uc_publication_deadline_decisions(id,organization_id,rule_id,rule_revision,profile_revision,applicability_revision,revision,accepted,reason,deadline,source_revision_sha256,decided_by,request_id)
 VALUES(v_id,p_organization_id,p_rule_id,r.revision,p.revision,d.revision,p_expected_revision+1,p_accept,p_reason,CASE WHEN p_accept THEN r.annual_deadline ELSE NULL END,r.source_revision_sha256,auth.uid(),p_request_id);
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'request_id',p_request_id,'decision_id',v_id,'revision',p_expected_revision+1,'actor_id',auth.uid(),'rule_id',p_rule_id,'rule_revision',r.revision,'profile_revision',p.revision,'applicability_revision',d.revision,'accepted',p_accept,'decided_at',(SELECT decided_at FROM public.uc_publication_deadline_decisions WHERE id=v_id),'replayed',false);
EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected OR unique_violation THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.list_organization_publication_calendar(p_organization_id uuid,p_reporting_year integer,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 50)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_rows jsonb:='[]';t public.uc_publication_calendar_tasks;r public.uc_publication_rule_versions;p public.organization_education_profiles;d public.organization_document_applicability_decisions;v_deadline public.uc_publication_deadline_decisions;v_current boolean;v_scope jsonb;s public.uc_publication_streams;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR p_reporting_year IS NULL OR p_reporting_year NOT BETWEEN 1900 AND 9996 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 PERFORM public.uc_publication_fence(auth.uid(),p_organization_id,NULL,false);
 SELECT*INTO p FROM public.organization_education_profiles WHERE organization_id=p_organization_id FOR SHARE NOWAIT;
 FOR t IN SELECT*FROM public.uc_publication_calendar_tasks WHERE organization_id=p_organization_id AND(body->>'calendarYear')::integer=p_reporting_year AND(p_before_id IS NULL OR id<p_before_id)ORDER BY id DESC LIMIT p_limit LOOP
  IF t.body_sha256<>public.uc_publication_hash(t.body::text)THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc026:rule:'||t.rule_id,26026))THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
  SELECT*INTO r FROM public.uc_publication_rule_versions WHERE id=t.rule_id ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc026:rule:'||r.id,26026))THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
  IF EXISTS(SELECT 1 FROM public.uc_publication_rule_versions n WHERE n.id=r.id AND n.revision>r.revision)THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
  SELECT*INTO d FROM public.organization_document_applicability_decisions WHERE organization_id=p_organization_id AND requirement_id=r.requirement_id FOR SHARE NOWAIT;
  SELECT*INTO v_deadline FROM public.uc_publication_deadline_decisions WHERE organization_id=p_organization_id AND rule_id=r.id ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
  v_current:=r.revision=t.rule_revision AND p.revision=t.profile_revision AND d.revision::text IS NOT DISTINCT FROM t.body->'basis'->>'applicabilityDecisionRevision'
   AND d.profile_revision=p.revision AND d.catalog_version=r.catalog_version AND d.decision IS DISTINCT FROM'not_applicable'
   AND t.body->'basis'->>'sourceRevisionSha256'=r.source_revision_sha256
   AND v_deadline.id::text IS NOT DISTINCT FROM t.body->>'deadlineDecisionId'
   AND(t.body->>'acceptedDeadlineDecisionId'IS NULL OR(v_deadline.id::text=t.body->>'acceptedDeadlineDecisionId'AND v_deadline.accepted AND v_deadline.rule_revision=r.revision AND v_deadline.profile_revision=p.revision AND v_deadline.applicability_revision=d.revision));
  s:=NULL;v_scope:=NULL;
  SELECT*INTO s FROM public.uc_publication_streams WHERE organization_id=p_organization_id AND requirement_id=r.requirement_id AND reporting_year IS NOT DISTINCT FROM CASE WHEN r.period='reporting_year'THEN p_reporting_year ELSE NULL END FOR SHARE NOWAIT;
  IF s.current_edition_id IS NOT NULL THEN v_scope:=public.uc_publication_current_scope(p_organization_id,s.current_edition_id);END IF;
  v_rows:=v_rows||jsonb_build_array(jsonb_build_object('id',t.id,'body',t.body,'current',coalesce(v_current,false),'created_at',t.created_at,
   'publication',CASE WHEN s.current_edition_id IS NULL THEN NULL ELSE jsonb_build_object('edition_id',s.current_edition_id,'projection',public.uc_publication_projection(p_organization_id,s.current_edition_id,v_scope))END));
 END LOOP;
 RETURN jsonb_build_object('schema_version',1,'organization_id',p_organization_id,'reporting_year',p_reporting_year,'tasks',v_rows,'server_as_of',clock_timestamp(),'legal_compliance_confirmed',false);
EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');
END;$fn$;
CREATE FUNCTION public.sync_organization_publication_calendar(p_organization_id uuid,p_reporting_year integer,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.uc_publication_rule_versions;p public.organization_education_profiles;d public.organization_document_applicability_decisions;a public.uc_publication_deadline_decisions;v_previous text;v_key text;v_kind text;v_body jsonb;v_id uuid;v_due date;v_basis jsonb;v_hash text;v_req public.uc_publication_requests;v_kinds text[];
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR auth.uid()IS NULL OR p_request_id IS NULL OR p_reporting_year IS NULL OR p_reporting_year NOT BETWEEN 1900 AND 9996 THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 PERFORM public.uc_publication_fence(auth.uid(),p_organization_id,NULL,true);
 SELECT*INTO p FROM public.organization_education_profiles WHERE organization_id=p_organization_id FOR SHARE NOWAIT;
 IF p.organization_id IS NULL THEN PERFORM public.uc_publication_error('SOURCE_UNAVAILABLE');END IF;
 -- The request identity is stable for an uncertain retry, while current rows are always read again.
 v_hash:=public.uc_publication_hash(jsonb_build_object('year',p_reporting_year)::text);
 SELECT*INTO v_req FROM public.uc_publication_requests WHERE organization_id=p_organization_id AND request_id=p_request_id FOR SHARE NOWAIT;
 IF v_req.request_id IS NOT NULL THEN
  IF v_req.kind<>'calendar'OR v_req.actor_id<>auth.uid()OR v_req.request_sha256<>v_hash THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
  RETURN public.list_organization_publication_calendar(p_organization_id,p_reporting_year,NULL,100)||jsonb_build_object('receipt',public.uc_publication_receipt(p_organization_id,p_request_id));
 END IF;
 FOR r IN SELECT*FROM public.uc_publication_rule_versions q WHERE NOT EXISTS(SELECT 1 FROM public.uc_publication_rule_versions n WHERE n.id=q.id AND n.revision>q.revision)ORDER BY q.id FOR SHARE NOWAIT LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc026:rule:'||r.id,26026))THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
  IF EXISTS(SELECT 1 FROM public.uc_publication_rule_versions n WHERE n.id=r.id AND n.revision>r.revision)THEN PERFORM public.uc_publication_error('SOURCE_CHANGED');END IF;
  SELECT*INTO d FROM public.organization_document_applicability_decisions WHERE organization_id=p_organization_id AND requirement_id=r.requirement_id FOR SHARE NOWAIT;
  IF d.decision='not_applicable'AND d.profile_revision=p.revision AND d.catalog_version=r.catalog_version THEN CONTINUE;END IF;
  PERFORM public.uc_publication_fence(auth.uid(),p_organization_id,NULL,true,ARRAY[r.created_by,p.updated_by,d.decided_by]);
  SELECT*INTO a FROM public.uc_publication_deadline_decisions WHERE organization_id=p_organization_id AND rule_id=r.id ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
  SELECT source_revision_sha256 INTO v_previous FROM public.uc_publication_rule_versions WHERE id=r.id AND revision<r.revision ORDER BY revision DESC LIMIT 1;
  v_basis:=jsonb_build_object('catalogVersion',r.catalog_version,'requirementId',r.requirement_id,'requirementVersion',r.requirement_version,'profileRevision',p.revision,'applicabilityDecisionRevision',d.revision,'legalReview',r.legal_review,'sourceRevisionSha256',r.source_revision_sha256);
  v_due:=NULL;
  IF r.period='reporting_year'AND r.legal_review='reviewed'AND a.id IS NOT NULL AND a.accepted AND a.rule_revision=r.revision AND a.profile_revision=p.revision AND a.applicability_revision=d.revision AND a.source_revision_sha256=r.source_revision_sha256 AND a.deadline=r.annual_deadline THEN
   BEGIN v_due:=make_date(p_reporting_year+(a.deadline->>'yearOffset')::integer,(a.deadline->>'month')::integer,(a.deadline->>'day')::integer);EXCEPTION WHEN datetime_field_overflow THEN v_due:=NULL;END;
  END IF;
  v_kinds:=ARRAY[]::text[];IF r.period='reporting_year'THEN v_kinds:=v_kinds||'annual_report'::text;END IF;
  IF v_previous IS NOT NULL AND v_previous<>r.source_revision_sha256 THEN v_kinds:=v_kinds||'norm_change'::text;END IF;
  FOREACH v_kind IN ARRAY v_kinds LOOP
   v_key:=public.uc_publication_hash(jsonb_build_object('org',p_organization_id,'rule',r.id,'revision',r.revision,'basis',v_basis,'kind',v_kind,'year',p_reporting_year,'deadline_decision',a.id)::text);
   IF EXISTS(SELECT 1 FROM public.uc_publication_calendar_tasks WHERE organization_id=p_organization_id AND task_key=v_key)THEN CONTINUE;END IF;
   v_body:=jsonb_build_object('schema_version',1,'calendarYear',p_reporting_year,'kind',v_kind,'title',r.title,'requirementId',r.requirement_id,'basis',v_basis,
    'reportingYear',CASE WHEN r.period='reporting_year'THEN p_reporting_year ELSE NULL END,'dueOn',CASE WHEN v_kind='annual_report'THEN v_due ELSE NULL END,
    'deadlineDecisionId',a.id,'acceptedDeadlineDecisionId',CASE WHEN v_due IS NULL THEN NULL ELSE a.id END,
    'state',CASE WHEN d.organization_id IS NULL OR d.profile_revision<>p.revision OR d.catalog_version<>r.catalog_version OR d.decision IS DISTINCT FROM'applicable'THEN'needs_information'WHEN v_kind='norm_change'OR v_due IS NULL THEN'needs_review'ELSE'open'END,
    'reason',CASE WHEN v_kind='norm_change'THEN'Изменилась редакция источника в каталоге. Проверьте первоисточник, применимость и публичную редакцию; это не автоматическое утверждение нормы.'WHEN v_due IS NULL THEN'Срок не утверждён: нужна проверенная нормативная редакция и отдельное решение центра.'ELSE'Подготовьте публичную редакцию за отчётный год. Проверка ссылки не подтверждает юридическую готовность.'END,
    'sourceChange',CASE WHEN v_kind='norm_change'THEN jsonb_build_object('previousRevisionSha256',v_previous,'nextRevisionSha256',r.source_revision_sha256)ELSE NULL END);
   v_id:=gen_random_uuid();PERFORM public.uc_publication_token('uc_publication_calendar_tasks',v_id);
   INSERT INTO public.uc_publication_calendar_tasks(id,organization_id,task_key,kind,rule_id,rule_revision,profile_revision,body,body_sha256,created_by)VALUES(v_id,p_organization_id,v_key,v_kind,r.id,r.revision,p.revision,v_body,public.uc_publication_hash(v_body::text),auth.uid());
   PERFORM public.uc_publication_record_person(p_organization_id,'task',v_id,auth.uid(),'actor');PERFORM public.uc_publication_record_person(p_organization_id,'task',v_id,r.created_by,'rule_author');
   PERFORM public.uc_publication_record_person(p_organization_id,'task',v_id,d.decided_by,'applicability_actor');PERFORM public.uc_publication_record_person(p_organization_id,'task',v_id,a.decided_by,'deadline_actor');
  END LOOP;
 END LOOP;
 PERFORM public.uc_publication_token('uc_publication_requests',p_request_id);
 INSERT INTO public.uc_publication_requests VALUES(p_organization_id,p_request_id,auth.uid(),'calendar',v_hash,p_request_id,jsonb_build_object('reporting_year',p_reporting_year),clock_timestamp());
 PERFORM public.uc_publication_record_person(p_organization_id,'request',p_request_id,auth.uid(),'actor');
 RETURN public.list_organization_publication_calendar(p_organization_id,p_reporting_year,NULL,100)||jsonb_build_object('receipt',public.uc_publication_receipt(p_organization_id,p_request_id));
EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected OR unique_violation THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');
END;$fn$;
REVOKE ALL ON FUNCTION public.record_publication_deadline_decision(uuid,text,bigint,bigint,bigint,bigint,boolean,text,uuid),public.list_organization_publication_calendar(uuid,integer,uuid,integer),public.sync_organization_publication_calendar(uuid,integer,uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_publication_deadline_decision(uuid,text,bigint,bigint,bigint,bigint,boolean,text,uuid),public.list_organization_publication_calendar(uuid,integer,uuid,integer),public.sync_organization_publication_calendar(uuid,integer,uuid)TO authenticated;

-- UC026 SOURCE PROPOSAL. Conservative retention, never an invented disposal authority.
CREATE FUNCTION public.uc_publication_personal_counts(p_user uuid)RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',x.table_name,'column','retained_publication_evidence_review_required','count',x.n)ORDER BY x.table_name),'[]'::jsonb)FROM(
 SELECT'uc_publication_rule_versions'::text table_name,count(*)n FROM public.uc_publication_rule_versions WHERE created_by=p_user
 UNION ALL SELECT'uc_publication_streams',count(*)FROM public.uc_publication_streams WHERE created_by=p_user
 UNION ALL SELECT'uc_publication_editions',count(*)FROM public.uc_publication_editions WHERE created_by=p_user
 UNION ALL SELECT'uc_publication_events',count(*)FROM public.uc_publication_events WHERE actor_id=p_user
 UNION ALL SELECT'uc_publication_check_jobs',count(*)FROM public.uc_publication_check_jobs WHERE actor_id=p_user
 UNION ALL SELECT'uc_publication_checks',count(*)FROM public.uc_publication_checks WHERE actor_id=p_user
 UNION ALL SELECT'uc_publication_calendar_tasks',count(*)FROM public.uc_publication_calendar_tasks WHERE created_by=p_user
 UNION ALL SELECT'uc_publication_deadline_decisions',count(*)FROM public.uc_publication_deadline_decisions WHERE decided_by=p_user
 UNION ALL SELECT'uc_publication_requests',count(*)FROM public.uc_publication_requests WHERE actor_id=p_user
 UNION ALL SELECT'uc_publication_participants',count(*)FROM public.uc_publication_participants WHERE user_id=p_user
 )x WHERE x.n>0
$fn$;
CREATE FUNCTION public.uc_publication_retention_block(p_user uuid)RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF p_user IS NULL THEN PERFORM public.uc_publication_error('INVALID_INPUT');END IF;
 -- Exclusive BEFORE count; every writer holds the matching shared 42007 fence.
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_user::text,42007))THEN PERFORM public.uc_publication_error('REVISION_CONFLICT');END IF;
 IF public.uc_publication_personal_counts(p_user)<>'[]'::jsonb THEN RAISE EXCEPTION'PUBLICATION_EVIDENCE_RETENTION_REVIEW_REQUIRED'USING ERRCODE='P0001';END IF;
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_publication_personal_counts(uuid),public.uc_publication_retention_block(uuid)FROM PUBLIC,anon,authenticated,service_role;

-- UC026 final private boundary. Only new exact objects are touched; old four functions retain their authority.
DO $publication_acl$
DECLARE r record;a record;c record;v_role text;v_grantee text;v_expected boolean;v_names text[]:=ARRAY['append_publication_rule_version','create_organization_publication','list_organization_publication_calendar','list_organization_publication_editions','list_organization_publications','list_publication_rule_versions','prepare_organization_publication_check','read_organization_publication','record_organization_publication_action','record_publication_deadline_decision','sync_organization_publication_calendar','uc_publication_actor_allowed','uc_publication_append_event','uc_publication_boundary','uc_publication_check_context','uc_publication_closed','uc_publication_commit_check','uc_publication_current_scope','uc_publication_error','uc_publication_fence','uc_publication_hash','uc_publication_people','uc_publication_personal_counts','uc_publication_projection','uc_publication_public_url','uc_publication_receipt','uc_publication_record_person','uc_publication_retention_block','uc_publication_token'];v_tables text[]:=ARRAY['uc_publication_rule_versions','uc_publication_streams','uc_publication_editions','uc_publication_events','uc_publication_check_jobs','uc_publication_checks','uc_publication_calendar_tasks','uc_publication_deadline_decisions','uc_publication_requests','uc_publication_participants','uc_publication_write_tokens'];
 v_authenticated text[]:=ARRAY['read_organization_publication','list_organization_publications','list_organization_publication_editions','create_organization_publication','record_organization_publication_action','prepare_organization_publication_check','list_publication_rule_versions','append_publication_rule_version','record_publication_deadline_decision','list_organization_publication_calendar','sync_organization_publication_calendar'];v_service text[]:=ARRAY['uc_publication_check_context','uc_publication_commit_check'];
BEGIN
 IF(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(v_names))<>cardinality(v_names)THEN RAISE EXCEPTION'PUBLICATION_ACL_SOURCE_MISMATCH';END IF;
 FOR r IN SELECT p.oid,p.proowner,p.oid::regprocedure signature,p.proacl,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(v_names)LOOP
  FOR a IN SELECT DISTINCT x.grantee FROM aclexplode(coalesce(r.proacl,acldefault('f',r.proowner)))x WHERE x.grantee<>r.proowner LOOP
   v_grantee:=CASE WHEN a.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(a.grantee))END;
   EXECUTE'REVOKE ALL PRIVILEGES ON FUNCTION '||r.signature||' FROM '||v_grantee;
  END LOOP;
  EXECUTE'REVOKE ALL PRIVILEGES ON FUNCTION '||r.signature||' FROM PUBLIC,anon,authenticated,service_role';
  IF r.proname=ANY(v_authenticated)THEN EXECUTE'GRANT EXECUTE ON FUNCTION '||r.signature||' TO authenticated';END IF;
  IF r.proname=ANY(v_service)THEN EXECUTE'GRANT EXECUTE ON FUNCTION '||r.signature||' TO service_role';END IF;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','supabase_auth_admin']LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=v_role)THEN
    v_expected:=(v_role='authenticated'AND r.proname=ANY(v_authenticated))OR(v_role='service_role'AND r.proname=ANY(v_service));
    IF has_function_privilege(v_role,r.oid,'EXECUTE')IS DISTINCT FROM v_expected THEN RAISE EXCEPTION'PUBLICATION_EFFECTIVE_FUNCTION_ACL_MISMATCH';END IF;
   END IF;
  END LOOP;
 END LOOP;
 FOR r IN SELECT cl.oid,cl.relowner,cl.relacl,cl.relname FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public'AND cl.relname=ANY(v_tables)AND cl.relkind='r'LOOP
  FOR a IN SELECT DISTINCT x.grantee FROM aclexplode(coalesce(r.relacl,acldefault('r',r.relowner)))x WHERE x.grantee<>r.relowner LOOP
   v_grantee:=CASE WHEN a.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(a.grantee))END;EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %s',r.relname,v_grantee);
  END LOOP;
  FOR c IN SELECT attnum,attname,attacl FROM pg_attribute WHERE attrelid=r.oid AND attnum>0 AND NOT attisdropped LOOP
   FOR a IN SELECT DISTINCT x.grantee FROM aclexplode(CASE WHEN cardinality(c.attacl)>0 THEN c.attacl END)x WHERE x.grantee<>r.relowner LOOP
    v_grantee:=CASE WHEN a.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(a.grantee))END;EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %s',c.attname,r.relname,v_grantee);
   END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','supabase_auth_admin']LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=v_role)AND(has_table_privilege(v_role,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')OR has_any_column_privilege(v_role,r.oid,'SELECT,INSERT,UPDATE,REFERENCES'))THEN RAISE EXCEPTION'PUBLICATION_EFFECTIVE_TABLE_ACL_MISMATCH';END IF;
  END LOOP;
 END LOOP;
 IF(SELECT count(*)FROM pg_class uc_checked_class JOIN pg_namespace n ON n.oid=uc_checked_class.relnamespace WHERE n.nspname='public'AND uc_checked_class.relname=ANY(v_tables)AND uc_checked_class.relkind='r'AND uc_checked_class.relrowsecurity)<>cardinality(v_tables)THEN RAISE EXCEPTION'PUBLICATION_PRIVATE_TABLE_MISMATCH';END IF;
END;$publication_acl$;



-- UC030 finite additive SOURCE PROPOSAL, never executed by this authoring step.
-- No role grant, old catalogue validator replacement, business-row update or legal approval seed.
-- RELEASE BLOCK: fresh authority definitions, native tests and personal-data integration required.
CREATE TABLE public.uc_normative_manifests(
 id uuid PRIMARY KEY,revision bigint NOT NULL UNIQUE CHECK(revision>0),predecessor_id uuid REFERENCES public.uc_normative_manifests(id)ON DELETE RESTRICT,
 canonical_body text NOT NULL CHECK(octet_length(canonical_body)<=1000000),body_sha256 text NOT NULL UNIQUE CHECK(body_sha256~'^[0-9a-f]{64}$'),
 catalog_version text NOT NULL,created_at timestamptz NOT NULL,created_by uuid NOT NULL,
 request_id uuid NOT NULL UNIQUE,request_sha256 text NOT NULL CHECK(request_sha256~'^[0-9a-f]{64}$')
);
CREATE TABLE public.uc_normative_events(
 id uuid PRIMARY KEY,organization_id uuid REFERENCES public.organizations(id)ON DELETE RESTRICT,
 scope_key text NOT NULL,sequence bigint NOT NULL CHECK(sequence>0),manifest_id uuid REFERENCES public.uc_normative_manifests(id)ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN('owner_assigned','draft_registered','review_due_set','source_checked','legal_reviewed','published','runtime_verified','centre_accepted')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'AND octet_length(body::text)<=16000),
 actor_id uuid NOT NULL,occurred_at timestamptz NOT NULL,request_id uuid NOT NULL UNIQUE,request_sha256 text NOT NULL CHECK(request_sha256~'^[0-9a-f]{64}$'),
 expected_sequence bigint NOT NULL CHECK(expected_sequence=sequence-1),
 UNIQUE(scope_key,sequence),CHECK(scope_key=coalesce(organization_id::text,'global')),
 CHECK((kind='centre_accepted')=(organization_id IS NOT NULL)),CHECK((kind='owner_assigned')=(manifest_id IS NULL))
);
COMMENT ON TABLE public.uc_normative_manifests IS 'Immutable metadata/evidence editions. Hash is not a consolidated legal text hash. A stored edition never activates a new applicability validator.';
COMMENT ON TABLE public.uc_normative_events IS 'Separate deliberate owner/source/legal/publication/technical/centre records. Does not certify legal compliance. No default legal retention period is assigned.';
CREATE FUNCTION public.uc_ng_hash(p_text text)RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $f$ SELECT encode(pg_catalog.sha256(convert_to(p_text,'UTF8')),'hex') $f$;
CREATE FUNCTION public.uc_ng_closed(p jsonb,keys text[])RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT jsonb_typeof(p)='object'AND(SELECT array_agg(k ORDER BY k)FROM jsonb_object_keys(p)k)IS NOT DISTINCT FROM(SELECT array_agg(k ORDER BY k)FROM unnest(keys)k)
$f$;
CREATE FUNCTION public.uc_ng_canonical(p jsonb,p_depth integer DEFAULT 0)RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $f$
DECLARE result text;
BEGIN
 IF p_depth>48 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_MANIFEST_INVALID';END IF;
 CASE jsonb_typeof(p)
 WHEN'object'THEN SELECT'{'||coalesce(string_agg(to_jsonb(k)::text||':'||public.uc_ng_canonical(v,p_depth+1),','ORDER BY k COLLATE "C"),'')||'}'INTO result FROM jsonb_each(p)e(k,v);
 WHEN'array'THEN SELECT'['||coalesce(string_agg(public.uc_ng_canonical(v,p_depth+1),','ORDER BY n),'')||']'INTO result FROM jsonb_array_elements(p)WITH ORDINALITY e(v,n);
 ELSE result:=p::text;END CASE;RETURN result;
END;$f$;
CREATE FUNCTION public.uc_ng_immutable()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NORMATIVE_HISTORY_IMMUTABLE';END;$f$;
CREATE TRIGGER uc_ng_manifest_immutable BEFORE UPDATE OR DELETE ON public.uc_normative_manifests FOR EACH ROW EXECUTE FUNCTION public.uc_ng_immutable();
CREATE TRIGGER uc_ng_event_immutable BEFORE UPDATE OR DELETE ON public.uc_normative_events FOR EACH ROW EXECUTE FUNCTION public.uc_ng_immutable();
ALTER TABLE public.uc_normative_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uc_normative_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uc_normative_manifests,public.uc_normative_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.uc_ng_fence(p_org uuid,p_write boolean,p_owner boolean DEFAULT false)RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE actor uuid:=auth.uid();person uuid;
BEGIN
 IF auth.role()IS DISTINCT FROM'authenticated'OR actor IS NULL OR p_org IS NULL
 OR NOT coalesce(public.uc_signature_assurance_active(actor),false)
 OR NOT coalesce(public.uc_signature_assurance_as_document_action_allowed(actor,p_org,'read',NULL,NULL),false)
 OR(p_write AND NOT coalesce(public.uc_signature_assurance_as_document_action_allowed(actor,p_org,'write',NULL,NULL),false))
 OR(p_owner AND(actor IS DISTINCT FROM'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid OR NOT coalesce(public.has_role(actor,'admin'::public.app_role),false)))THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NORMATIVE_ACCESS_DENIED';END IF;
 PERFORM public.uc_signature_assurance_fence(p_org,ARRAY[actor],p_write,NULL,NULL,actor);
 FOR person IN SELECT DISTINCT actor_id FROM public.uc_normative_events WHERE organization_id IS NULL OR organization_id=p_org UNION SELECT actor LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(person::text,42007))THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';END IF;
 END LOOP;
 RETURN actor;
END;$f$;
CREATE FUNCTION public.uc_ng_validate_manifest(p_raw text,p_hash text)RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $f$
DECLARE m jsonb;s jsonb;r jsonb;payload jsonb;ids text[];rid text;today date;
BEGIN
 IF p_raw IS NULL OR octet_length(p_raw)>1000000 OR p_hash IS NULL OR p_hash!~'^[0-9a-f]{64}$'OR public.uc_ng_hash(p_raw)IS DISTINCT FROM p_hash THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_MANIFEST_INVALID';END IF;
 m:=p_raw::jsonb;
 IF public.uc_ng_canonical(m)IS DISTINCT FROM p_raw OR NOT coalesce(public.uc_ng_closed(m,ARRAY['schemaVersion','catalogVersion','asOf','sources','requirements']),false)
 OR m->'schemaVersion'IS DISTINCT FROM'1'::jsonb OR m->>'catalogVersion'IS DISTINCT FROM'uc-requirements-2026-10-18-v1'
 OR jsonb_typeof(m->'asOf')IS DISTINCT FROM'string'OR m->>'asOf'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 OR jsonb_typeof(m->'sources')IS DISTINCT FROM'array'OR jsonb_array_length(m->'sources')NOT BETWEEN 1 AND 1000
 OR jsonb_typeof(m->'requirements')IS DISTINCT FROM'array'OR jsonb_array_length(m->'requirements')<>32 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_MANIFEST_INVALID';END IF;
 today:=(m->>'asOf')::date;IF to_char(today,'YYYY-MM-DD')IS DISTINCT FROM m->>'asOf'THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_MANIFEST_INVALID';END IF;
 ids:='{}';FOR s IN SELECT value FROM jsonb_array_elements(m->'sources')LOOP
  IF NOT coalesce(public.uc_ng_closed(s,ARRAY['id','payloadJson','sha256']),false)OR jsonb_typeof(s->'id')IS DISTINCT FROM'string'OR s->>'id'!~'^[A-Za-z0-9_.:-]{1,200}$'OR s->>'id'=ANY(ids)
  OR jsonb_typeof(s->'payloadJson')IS DISTINCT FROM'string'OR jsonb_typeof(s->'sha256')IS DISTINCT FROM'string'OR public.uc_ng_hash(s->>'payloadJson')IS DISTINCT FROM s->>'sha256'THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_MANIFEST_INVALID';END IF;
  payload:=(s->>'payloadJson')::jsonb;IF jsonb_typeof(payload)IS DISTINCT FROM'object'OR payload->>'id'IS DISTINCT FROM s->>'id'OR public.uc_ng_canonical(payload)IS DISTINCT FROM s->>'payloadJson'THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_MANIFEST_INVALID';END IF;ids:=ids||(s->>'id');
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(m->'requirements')LOOP
  IF NOT coalesce(public.uc_ng_closed(r,ARRAY['id','version','sourceIds','payloadJson','sha256']),false)OR jsonb_typeof(r->'id')IS DISTINCT FROM'string'OR jsonb_typeof(r->'version')IS DISTINCT FROM'string'OR r->>'version'!~'^[A-Za-z0-9_.:-]{1,200}$'
  OR jsonb_typeof(r->'sourceIds')IS DISTINCT FROM'array'OR jsonb_typeof(r->'payloadJson')IS DISTINCT FROM'string'OR jsonb_typeof(r->'sha256')IS DISTINCT FROM'string'OR public.uc_ng_hash(r->>'payloadJson')IS DISTINCT FROM r->>'sha256'THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_MANIFEST_INVALID';END IF;
  PERFORM public.uc_validate_applicability_key(r->>'id',m->>'catalogVersion');
  payload:=(r->>'payloadJson')::jsonb;IF payload->>'id'IS DISTINCT FROM r->>'id'OR payload->>'version'IS DISTINCT FROM r->>'version'OR public.uc_ng_canonical(payload)IS DISTINCT FROM r->>'payloadJson'
  OR jsonb_typeof(payload->'legalSources')IS DISTINCT FROM'array'
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'sourceIds')x WHERE jsonb_typeof(x)IS DISTINCT FROM'string'OR NOT(x#>>'{}'=ANY(ids)))
  OR(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]')FROM(SELECT DISTINCT value v FROM jsonb_array_elements(r->'sourceIds'))a)IS DISTINCT FROM r->'sourceIds'
  OR(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]')FROM(SELECT DISTINCT value->'id'v FROM jsonb_array_elements(payload->'legalSources'))a)IS DISTINCT FROM r->'sourceIds'THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_MANIFEST_INVALID';END IF;
 END LOOP;
 IF(SELECT count(DISTINCT value->>'id')FROM jsonb_array_elements(m->'requirements'))<>32 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_MANIFEST_INVALID';END IF;
 RETURN m;
 EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_MANIFEST_INVALID';
END;$f$;


CREATE FUNCTION public.read_normative_governance(p_organization_id uuid,p_manifest_id uuid DEFAULT NULL)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE actor uuid;selected public.uc_normative_manifests;prior public.uc_normative_manifests;rows jsonb;events jsonb;projection jsonb;impact jsonb;
 current_profile bigint;global_seq bigint;centre_seq bigint;checked jsonb;due_on text;legal boolean;published boolean;verified boolean;accepted bigint;
 changed_sources jsonb;changed_requirements jsonb;affected jsonb;type_ids jsonb;total_events bigint;
BEGIN
 actor:=public.uc_ng_fence(p_organization_id,false,false);
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc030:global',30030))OR NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc030:'||p_organization_id::text,30030))THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';END IF;
 IF p_manifest_id IS NULL THEN SELECT*INTO selected FROM public.uc_normative_manifests ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
 ELSE SELECT*INTO selected FROM public.uc_normative_manifests WHERE id=p_manifest_id FOR SHARE NOWAIT;IF selected.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NORMATIVE_SOURCE_UNAVAILABLE';END IF;END IF;
 IF selected.id IS NOT NULL THEN PERFORM public.uc_ng_validate_manifest(selected.canonical_body,selected.body_sha256);SELECT*INTO prior FROM public.uc_normative_manifests WHERE id=selected.predecessor_id FOR SHARE NOWAIT;END IF;
 SELECT coalesce(max(sequence),0)INTO global_seq FROM public.uc_normative_events WHERE scope_key='global';
 SELECT coalesce(max(sequence),0)INTO centre_seq FROM public.uc_normative_events WHERE organization_id=p_organization_id;
 SELECT revision INTO current_profile FROM public.organization_education_profiles WHERE organization_id=p_organization_id FOR SHARE NOWAIT;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'revision',v.revision,'predecessorId',v.predecessor_id,'createdAt',v.created_at,'createdBy',v.created_by,'manifest',v.canonical_body::jsonb||jsonb_build_object('sha256',v.body_sha256))ORDER BY v.revision DESC),'[]')INTO rows FROM public.uc_normative_manifests v WHERE v.id IN(SELECT id FROM public.uc_normative_manifests ORDER BY revision DESC LIMIT CASE WHEN selected.id IS NULL THEN 5 ELSE 4 END)OR v.id=selected.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'sequence',e.sequence,'manifestId',e.manifest_id,'manifestSha256',m.body_sha256,'actorId',e.actor_id,'occurredAt',e.occurred_at,'organizationId',e.organization_id,'kind',e.kind,'body',e.body)ORDER BY e.occurred_at,e.id),'[]')INTO events FROM(SELECT*FROM public.uc_normative_events WHERE(organization_id IS NULL OR organization_id=p_organization_id)AND(manifest_id=selected.id OR kind='owner_assigned')ORDER BY occurred_at DESC,id DESC LIMIT 100)e LEFT JOIN public.uc_normative_manifests m ON m.id=e.manifest_id;
 SELECT count(*)INTO total_events FROM public.uc_normative_events WHERE(organization_id IS NULL OR organization_id=p_organization_id)AND(manifest_id=selected.id OR kind='owner_assigned');
 SELECT coalesce(jsonb_agg(s->'id'ORDER BY s->>'id'),'[]')INTO checked FROM jsonb_array_elements(coalesce(selected.canonical_body::jsonb->'sources','[]'))s WHERE EXISTS(SELECT 1 FROM public.uc_normative_events e WHERE e.manifest_id=selected.id AND e.kind='source_checked'AND e.body->>'sourceId'=s->>'id'AND e.body->>'sourceSha256'=s->>'sha256');
 SELECT body->>'dueOn'INTO due_on FROM public.uc_normative_events WHERE manifest_id=selected.id AND kind='review_due_set'ORDER BY sequence DESC LIMIT 1;
 SELECT EXISTS(SELECT 1 FROM public.uc_normative_events WHERE manifest_id=selected.id AND kind='legal_reviewed'),EXISTS(SELECT 1 FROM public.uc_normative_events WHERE manifest_id=selected.id AND kind='published'),EXISTS(SELECT 1 FROM public.uc_normative_events WHERE manifest_id=selected.id AND kind='runtime_verified')INTO legal,published,verified;
 SELECT(body->>'profileRevision')::bigint INTO accepted FROM public.uc_normative_events WHERE manifest_id=selected.id AND organization_id=p_organization_id AND kind='centre_accepted'ORDER BY sequence DESC LIMIT 1;
 projection:=jsonb_build_object('ownerAssigned',EXISTS(SELECT 1 FROM public.uc_normative_events WHERE kind='owner_assigned'),'reviewDueOn',due_on,'checkedSourceIds',checked,'legalReviewed',legal,'published',published,'runtimeVerified',verified,'centreAccepted',coalesce(verified AND accepted=current_profile AND selected.id=(SELECT manifest_id FROM public.uc_normative_events WHERE kind='published'ORDER BY sequence DESC LIMIT 1),false),'acceptedProfileRevision',accepted,'legalComplianceConfirmed',false);
 WITH a AS(SELECT value FROM jsonb_array_elements(coalesce(prior.canonical_body::jsonb->'sources','[]'))),b AS(SELECT value FROM jsonb_array_elements(coalesce(selected.canonical_body::jsonb->'sources','[]')))
 SELECT coalesce(jsonb_agg(to_jsonb(id)ORDER BY id),'[]')INTO changed_sources FROM(SELECT coalesce(a.value->>'id',b.value->>'id')id FROM a FULL JOIN b ON a.value->>'id'=b.value->>'id'WHERE a.value->>'sha256'IS DISTINCT FROM b.value->>'sha256')x;
 WITH a AS(SELECT value FROM jsonb_array_elements(coalesce(prior.canonical_body::jsonb->'requirements','[]'))),b AS(SELECT value FROM jsonb_array_elements(coalesce(selected.canonical_body::jsonb->'requirements','[]')))
 SELECT coalesce(jsonb_agg(to_jsonb(id)ORDER BY id),'[]')INTO changed_requirements FROM(SELECT coalesce(a.value->>'id',b.value->>'id')id FROM a FULL JOIN b ON a.value->>'id'=b.value->>'id'WHERE a.value->>'sha256'IS DISTINCT FROM b.value->>'sha256')x;
 SELECT coalesce(jsonb_agg(to_jsonb(id)ORDER BY id),'[]')INTO affected FROM(SELECT DISTINCT r->>'id'id FROM jsonb_array_elements(coalesce(prior.canonical_body::jsonb->'requirements','[]')||coalesce(selected.canonical_body::jsonb->'requirements','[]'))r WHERE changed_requirements? (r->>'id')OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->'sourceIds')s WHERE changed_sources?s))a;
 SELECT coalesce(jsonb_agg(to_jsonb(t)ORDER BY t),'[]')INTO type_ids FROM(SELECT DISTINCT t FROM jsonb_array_elements(coalesce(selected.canonical_body::jsonb->'requirements','[]'))r CROSS JOIN LATERAL jsonb_array_elements_text(coalesce((r->>'payloadJson')::jsonb->'existingDocTypes','[]')||jsonb_build_array((r->>'payloadJson')::jsonb->>'typeId'))t WHERE affected?(r->>'id'))a;
 impact:=jsonb_build_object('changedSourceIds',changed_sources,'changedRequirementIds',changed_requirements,'affectedRequirementIds',affected,'affectedDecisions',(SELECT coalesce(jsonb_agg(jsonb_build_object('requirementId',requirement_id,'revision',revision,'catalogVersion',catalog_version,'profileRevision',profile_revision)ORDER BY requirement_id),'[]')FROM public.organization_document_applicability_decisions WHERE organization_id=p_organization_id AND affected?requirement_id),'documentTypeIds',type_ids,'documentCount',(SELECT count(*)FROM public.org_documents WHERE organization_id=p_organization_id AND deleted_at IS NULL AND type_ids?type),'customTemplateCoverage','unmapped','centresCoverage','current_organization_only','existingDecisionsPreserved',true);
 RETURN jsonb_build_object('schemaVersion',1,'organizationId',p_organization_id,'profileRevision',current_profile,'actorId',actor,'serverAsOf',clock_timestamp(),'globalSequence',global_seq,'centreSequence',centre_seq,'canManage',actor='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid AND coalesce(public.has_role(actor,'admin'::public.app_role),false)AND coalesce(public.uc_signature_assurance_as_document_action_allowed(actor,p_organization_id,'write',NULL,NULL),false),'canAccept',current_profile IS NOT NULL AND coalesce(public.uc_signature_assurance_as_document_action_allowed(actor,p_organization_id,'write',NULL,NULL),false),'manifests',rows,'selectedManifestId',selected.id,'events',events,'historyComplete',total_events<=100,'projection',projection,'impact',impact);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';
END;$f$;

CREATE FUNCTION public.list_normative_impact_centres(p_context_organization_id uuid,p_manifest_id uuid,p_before_organization_id uuid DEFAULT NULL,p_limit integer DEFAULT 25)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE actor uuid;row record;snapshot jsonb;result jsonb:='[]';last_id uuid;more boolean:=false;
BEGIN
 actor:=public.uc_ng_fence(p_context_organization_id,false,true);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 OR p_manifest_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_INPUT_INVALID';END IF;
 FOR row IN SELECT o.id,o.name FROM public.organizations o WHERE(p_before_organization_id IS NULL OR o.id<p_before_organization_id)AND public.uc_signature_assurance_as_document_action_allowed(actor,o.id,'read',NULL,NULL)ORDER BY o.id DESC LIMIT p_limit+1 LOOP
  IF jsonb_array_length(result)=p_limit THEN more:=true;EXIT;END IF;
  snapshot:=public.read_normative_governance(row.id,p_manifest_id);
  result:=result||jsonb_build_array(jsonb_build_object('organizationId',row.id,'name',row.name,'profileRevision',snapshot->'profileRevision','impact',snapshot->'impact','coverage','potential_impacts_not_complete_custom_template_mapping'));
  last_id:=row.id;
 END LOOP;
 RETURN jsonb_build_object('schemaVersion',1,'contextOrganizationId',p_context_organization_id,'manifestId',p_manifest_id,'items',result,'nextBeforeOrganizationId',CASE WHEN more THEN last_id ELSE NULL END,'complete',NOT more,'legalComplianceConfirmed',false);
END;$f$;


CREATE FUNCTION public.register_normative_manifest(p_organization_id uuid,p_expected_sequence bigint,p_canonical_body text,p_sha256 text,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE actor uuid;m jsonb;prior public.uc_normative_manifests;replay public.uc_normative_manifests;r public.uc_normative_manifests;seq bigint;req_hash text;recorded timestamptz:=clock_timestamp();event_id uuid:=gen_random_uuid();
BEGIN
 actor:=public.uc_ng_fence(p_organization_id,true,true);
 IF p_expected_sequence IS NULL OR p_expected_sequence<0 OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_INPUT_INVALID';END IF;
 m:=public.uc_ng_validate_manifest(p_canonical_body,p_sha256);
 req_hash:=public.uc_ng_hash(jsonb_build_object('kind','register','expectedSequence',p_expected_sequence,'body',p_canonical_body,'sha256',p_sha256)::text);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc030:global',30030))THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';END IF;
 SELECT*INTO replay FROM public.uc_normative_manifests WHERE request_id=p_request_id FOR SHARE NOWAIT;
 IF replay.id IS NOT NULL THEN
  IF replay.created_by IS DISTINCT FROM actor OR replay.request_sha256 IS DISTINCT FROM req_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REQUEST_REUSED';END IF;
  RETURN jsonb_build_object('snapshot',public.read_normative_governance(p_organization_id,replay.id),'receipt',jsonb_build_object('requestId',p_request_id,'actorId',actor,'kind','register','manifestId',replay.id,'manifestSha256',replay.body_sha256));
 END IF;
 SELECT coalesce(max(sequence),0)INTO seq FROM public.uc_normative_events WHERE scope_key='global';IF seq<>p_expected_sequence THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.uc_normative_events WHERE kind='owner_assigned')THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_OWNER_ASSIGNMENT_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM public.uc_normative_events WHERE request_id=p_request_id)OR EXISTS(SELECT 1 FROM public.uc_normative_manifests WHERE body_sha256=p_sha256)THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REQUEST_REUSED';END IF;
 SELECT*INTO prior FROM public.uc_normative_manifests ORDER BY revision DESC LIMIT 1 FOR SHARE NOWAIT;
 INSERT INTO public.uc_normative_manifests VALUES(gen_random_uuid(),coalesce(prior.revision,0)+1,prior.id,p_canonical_body,p_sha256,m->>'catalogVersion',recorded,actor,p_request_id,req_hash)RETURNING*INTO r;
 INSERT INTO public.uc_normative_events VALUES(event_id,NULL,'global',seq+1,r.id,'draft_registered',jsonb_build_object('revision',r.revision),actor,recorded,p_request_id,req_hash,seq);
 RETURN jsonb_build_object('snapshot',public.read_normative_governance(p_organization_id,r.id),'receipt',jsonb_build_object('requestId',p_request_id,'actorId',actor,'kind','register','manifestId',r.id,'manifestSha256',r.body_sha256));
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected OR unique_violation THEN
 IF SQLSTATE='40001'AND SQLERRM IN('NORMATIVE_REQUEST_REUSED','NORMATIVE_REVISION_CONFLICT')THEN RAISE;END IF;
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';
END;$f$;

CREATE FUNCTION public.record_normative_governance_event(p_organization_id uuid,p_expected_sequence bigint,p_kind text,p_manifest_id uuid,p_body jsonb,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE actor uuid;scope text;seq bigint;req_hash text;replay public.uc_normative_events;selected public.uc_normative_manifests;source jsonb;
 current_profile bigint;due date;recorded timestamptz:=clock_timestamp();eid uuid:=gen_random_uuid();
BEGIN
 actor:=public.uc_ng_fence(p_organization_id,true,p_kind IS DISTINCT FROM'centre_accepted');
 IF p_expected_sequence IS NULL OR p_expected_sequence<0 OR p_request_id IS NULL OR p_kind IS NULL OR p_kind NOT IN('owner_assigned','review_due_set','source_checked','legal_reviewed','published','centre_accepted')OR p_body IS NULL OR jsonb_typeof(p_body)<>'object'THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_INPUT_INVALID';END IF;
 scope:=CASE WHEN p_kind='centre_accepted'THEN p_organization_id::text ELSE'global'END;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc030:'||scope,30030))THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';END IF;
 -- A centre action also serializes against a new global publication without changing it.
 IF scope<>'global'AND NOT pg_try_advisory_xact_lock_shared(hashtextextended('uc030:global',30030))THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';END IF;
 req_hash:=public.uc_ng_hash(jsonb_build_object('kind',p_kind,'manifestId',p_manifest_id,'body',p_body,'expectedSequence',p_expected_sequence,'scope',scope)::text);
 SELECT*INTO replay FROM public.uc_normative_events WHERE request_id=p_request_id FOR SHARE NOWAIT;
 IF replay.id IS NOT NULL THEN
  IF replay.actor_id IS DISTINCT FROM actor OR replay.scope_key IS DISTINCT FROM scope OR replay.request_sha256 IS DISTINCT FROM req_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REQUEST_REUSED';END IF;
  RETURN jsonb_build_object('snapshot',public.read_normative_governance(p_organization_id,replay.manifest_id),'receipt',jsonb_build_object('requestId',p_request_id,'actorId',actor,'kind',p_kind,'manifestId',replay.manifest_id,'manifestSha256',(SELECT body_sha256 FROM public.uc_normative_manifests WHERE id=replay.manifest_id)));
 END IF;
 IF EXISTS(SELECT 1 FROM public.uc_normative_manifests WHERE request_id=p_request_id)THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REQUEST_REUSED';END IF;
 SELECT coalesce(max(sequence),0)INTO seq FROM public.uc_normative_events WHERE scope_key=scope;IF seq<>p_expected_sequence THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';END IF;
 IF p_kind='owner_assigned'THEN
  IF p_manifest_id IS NOT NULL OR p_body IS DISTINCT FROM jsonb_build_object('ownerId','aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','designation','human_2026_10_22')OR EXISTS(SELECT 1 FROM public.uc_normative_events WHERE kind='owner_assigned')THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_INPUT_INVALID';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.uc_normative_events WHERE kind='owner_assigned')THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_OWNER_ASSIGNMENT_REQUIRED';END IF;
  SELECT*INTO selected FROM public.uc_normative_manifests WHERE id=p_manifest_id FOR SHARE NOWAIT;IF selected.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NORMATIVE_SOURCE_UNAVAILABLE';END IF;
  PERFORM public.uc_ng_validate_manifest(selected.canonical_body,selected.body_sha256);
  IF p_kind<>'centre_accepted'AND selected.id IS DISTINCT FROM(SELECT id FROM public.uc_normative_manifests ORDER BY revision DESC LIMIT 1)THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';END IF;
  IF jsonb_typeof(p_body->'reason')IS DISTINCT FROM'string'OR p_body->>'reason'!~'[^[:space:]]'OR length(p_body->>'reason')>4000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_REASON_REQUIRED';END IF;
  CASE p_kind
  WHEN'review_due_set'THEN
   IF NOT coalesce(public.uc_ng_closed(p_body,ARRAY['dueOn','reason']),false)OR jsonb_typeof(p_body->'dueOn')IS DISTINCT FROM'string'OR p_body->>'dueOn'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_INPUT_INVALID';END IF;
   due:=(p_body->>'dueOn')::date;IF to_char(due,'YYYY-MM-DD')IS DISTINCT FROM p_body->>'dueOn'THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_INPUT_INVALID';END IF;
  WHEN'source_checked'THEN
   IF NOT coalesce(public.uc_ng_closed(p_body,ARRAY['sourceId','sourceSha256','reason']),false)THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_INPUT_INVALID';END IF;
   SELECT value INTO source FROM jsonb_array_elements(selected.canonical_body::jsonb->'sources')WHERE value->>'id'=p_body->>'sourceId';
   IF source IS NULL OR p_body->>'sourceSha256'IS DISTINCT FROM source->>'sha256'THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_SOURCE_CHANGED';END IF;
  WHEN'legal_reviewed'THEN
   IF NOT coalesce(public.uc_ng_closed(p_body,ARRAY['reason']),false)OR EXISTS(SELECT 1 FROM jsonb_array_elements(selected.canonical_body::jsonb->'sources')s WHERE NOT EXISTS(SELECT 1 FROM public.uc_normative_events e WHERE e.manifest_id=selected.id AND e.kind='source_checked'AND e.body->>'sourceId'=s->>'id'AND e.body->>'sourceSha256'=s->>'sha256'))THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_SOURCE_REVIEW_REQUIRED';END IF;
  WHEN'published'THEN
   IF NOT coalesce(public.uc_ng_closed(p_body,ARRAY['reason']),false)OR NOT EXISTS(SELECT 1 FROM public.uc_normative_events WHERE manifest_id=selected.id AND kind='legal_reviewed')OR NOT EXISTS(SELECT 1 FROM public.uc_normative_events WHERE manifest_id=selected.id AND kind='review_due_set')THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_LEGAL_REVIEW_REQUIRED';END IF;
   IF EXISTS(SELECT 1 FROM public.uc_normative_events WHERE manifest_id=selected.id AND kind='published')THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_ALREADY_PUBLISHED';END IF;
  WHEN'centre_accepted'THEN
   IF NOT coalesce(public.uc_ng_closed(p_body,ARRAY['profileRevision','reason']),false)OR jsonb_typeof(p_body->'profileRevision')IS DISTINCT FROM'number'OR p_body->>'profileRevision'!~'^[1-9][0-9]{0,14}$'THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_INPUT_INVALID';END IF;
   SELECT revision INTO current_profile FROM public.organization_education_profiles WHERE organization_id=p_organization_id FOR SHARE NOWAIT;
   IF current_profile IS NULL OR current_profile::text IS DISTINCT FROM p_body->>'profileRevision'OR selected.id IS DISTINCT FROM(SELECT manifest_id FROM public.uc_normative_events WHERE kind='published'ORDER BY sequence DESC LIMIT 1)OR NOT EXISTS(SELECT 1 FROM public.uc_normative_events WHERE manifest_id=selected.id AND kind='runtime_verified')THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_CURRENT_ACCEPTANCE_REQUIRED';END IF;
  END CASE;
 END IF;
 INSERT INTO public.uc_normative_events VALUES(eid,CASE WHEN p_kind='centre_accepted'THEN p_organization_id ELSE NULL END,scope,seq+1,p_manifest_id,p_kind,p_body,actor,recorded,p_request_id,req_hash,seq);
 RETURN jsonb_build_object('snapshot',public.read_normative_governance(p_organization_id,p_manifest_id),'receipt',jsonb_build_object('requestId',p_request_id,'actorId',actor,'kind',p_kind,'manifestId',p_manifest_id,'manifestSha256',selected.body_sha256));
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected OR unique_violation THEN
 IF SQLSTATE='40001'AND SQLERRM IN('NORMATIVE_ALREADY_PUBLISHED','NORMATIVE_CURRENT_ACCEPTANCE_REQUIRED','NORMATIVE_REQUEST_REUSED','NORMATIVE_REVISION_CONFLICT')THEN RAISE;END IF;
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';
 WHEN invalid_text_representation OR datetime_field_overflow THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_INPUT_INVALID';
END;$f$;


-- The browser cannot write runtime verification. Only a trusted technical operator
-- supplies an actual immutable QA receipt after observing this exact deployed metadata hash.
CREATE FUNCTION public.record_normative_runtime_evidence(p_organization_id uuid,p_manifest_id uuid,p_expected_sequence bigint,p_body jsonb,p_request_id uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE owner_id uuid:='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';m public.uc_normative_manifests;replay public.uc_normative_events;seq bigint;req_hash text;eid uuid:=gen_random_uuid();
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR p_organization_id IS NULL OR NOT coalesce(public.uc_signature_assurance_active(owner_id),false)OR NOT coalesce(public.has_role(owner_id,'admin'::public.app_role),false)
 OR NOT coalesce(public.uc_signature_assurance_as_document_action_allowed(owner_id,p_organization_id,'write',NULL,NULL),false)THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NORMATIVE_ACCESS_DENIED';END IF;
 PERFORM public.uc_signature_assurance_fence(p_organization_id,ARRAY[owner_id],true,NULL,NULL,owner_id);
 IF p_request_id IS NULL OR p_expected_sequence IS NULL OR p_expected_sequence<0 OR NOT coalesce(public.uc_ng_closed(p_body,ARRAY['deploymentRef','receiptSha256','observedManifestSha256','reason']),false)
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['deploymentRef','receiptSha256','observedManifestSha256','reason'])k WHERE jsonb_typeof(p_body->k)IS DISTINCT FROM'string')
 OR length(p_body->>'deploymentRef')NOT BETWEEN 1 AND 200 OR p_body->>'deploymentRef'!~'[^[:space:]]'OR p_body->>'receiptSha256'!~'^[0-9a-f]{64}$'OR p_body->>'observedManifestSha256'!~'^[0-9a-f]{64}$'
 OR length(p_body->>'reason')NOT BETWEEN 1 AND 4000 OR p_body->>'reason'!~'[^[:space:]]'THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NORMATIVE_INPUT_INVALID';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('uc030:global',30030))THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';END IF;
 req_hash:=public.uc_ng_hash(jsonb_build_object('kind','runtime_verified','manifestId',p_manifest_id,'expectedSequence',p_expected_sequence,'body',p_body)::text);
 SELECT*INTO replay FROM public.uc_normative_events WHERE request_id=p_request_id FOR SHARE NOWAIT;
 IF replay.id IS NOT NULL THEN
  IF replay.kind IS DISTINCT FROM'runtime_verified'OR replay.actor_id IS DISTINCT FROM owner_id OR replay.request_sha256 IS DISTINCT FROM req_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REQUEST_REUSED';END IF;
  RETURN jsonb_build_object('id',replay.id,'manifestId',replay.manifest_id,'requestId',p_request_id,'sequence',replay.sequence);
 END IF;
 IF EXISTS(SELECT 1 FROM public.uc_normative_manifests WHERE request_id=p_request_id)THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REQUEST_REUSED';END IF;
 SELECT coalesce(max(sequence),0)INTO seq FROM public.uc_normative_events WHERE scope_key='global';IF seq<>p_expected_sequence THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';END IF;
 SELECT*INTO m FROM public.uc_normative_manifests WHERE id=p_manifest_id FOR SHARE NOWAIT;
 IF m.id IS NULL OR m.body_sha256 IS DISTINCT FROM p_body->>'observedManifestSha256'OR m.id IS DISTINCT FROM(SELECT manifest_id FROM public.uc_normative_events WHERE kind='published'ORDER BY sequence DESC LIMIT 1)THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_SOURCE_CHANGED';END IF;
 PERFORM public.uc_ng_validate_manifest(m.canonical_body,m.body_sha256);
 INSERT INTO public.uc_normative_events VALUES(eid,NULL,'global',seq+1,m.id,'runtime_verified',p_body,owner_id,clock_timestamp(),p_request_id,req_hash,seq);
 RETURN jsonb_build_object('id',eid,'manifestId',m.id,'requestId',p_request_id,'sequence',seq+1);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected OR unique_violation THEN
 IF SQLSTATE='40001'AND SQLERRM IN('NORMATIVE_REQUEST_REUSED','NORMATIVE_REVISION_CONFLICT','NORMATIVE_SOURCE_CHANGED')THEN RAISE;END IF;
 RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';
END;$f$;

CREATE FUNCTION public.uc_ng_personal_counts(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',t,'column','normative_review_required','count',n)ORDER BY t),'[]')FROM(
 SELECT'uc_normative_manifests't,count(*)n FROM public.uc_normative_manifests WHERE created_by=p_user
 UNION ALL SELECT'uc_normative_events',count(*)FROM public.uc_normative_events WHERE actor_id=p_user
 )c WHERE n>0
$f$;
-- This helper is NOT silently composed into current erasure. It is an explicit
-- release dependency of this candidate, with no guessed destruction permission.
CREATE FUNCTION public.uc_ng_retention_block(p_user uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR p_user IS NULL OR current_setting('sintagma.account_deletion_erase_user',true)IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NORMATIVE_ACCESS_DENIED';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_user::text,42007))THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NORMATIVE_REVISION_CONFLICT';END IF;
 IF public.uc_ng_personal_counts(p_user)<>'[]'::jsonb THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='NORMATIVE_RETENTION_REVIEW_REQUIRED';END IF;
END;$f$;


-- Close every new object against inherited provider default ACLs as well as PUBLIC.
DO $acl$
DECLARE r record;a record;c record;grantee text;role_name text;expected boolean;
 names text[]:=ARRAY['uc_ng_hash','uc_ng_closed','uc_ng_canonical','uc_ng_immutable','uc_ng_fence','uc_ng_validate_manifest','read_normative_governance','list_normative_impact_centres','register_normative_manifest','record_normative_governance_event','record_normative_runtime_evidence','uc_ng_personal_counts','uc_ng_retention_block'];tables text[]:=ARRAY['uc_normative_manifests','uc_normative_events'];
 front text[]:=ARRAY['read_normative_governance','list_normative_impact_centres','register_normative_manifest','record_normative_governance_event'];
BEGIN
 IF(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(names))<>cardinality(names)THEN RAISE EXCEPTION'NORMATIVE_ACL_SOURCE_MISMATCH';END IF;
 FOR r IN SELECT p.oid,p.proowner,p.oid::regprocedure signature,p.proacl,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(names)LOOP
  FOR a IN SELECT DISTINCT x.grantee FROM aclexplode(coalesce(r.proacl,acldefault('f',r.proowner)))x WHERE x.grantee<>r.proowner LOOP
   grantee:=CASE WHEN a.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(a.grantee))END;EXECUTE'REVOKE ALL PRIVILEGES ON FUNCTION '||r.signature||' FROM '||grantee;
  END LOOP;
  IF r.proname=ANY(front)THEN EXECUTE'GRANT EXECUTE ON FUNCTION '||r.signature||' TO authenticated';END IF;
  IF r.proname='record_normative_runtime_evidence'THEN EXECUTE'GRANT EXECUTE ON FUNCTION '||r.signature||' TO service_role';END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','supabase_auth_admin']LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name)THEN
    expected:=(role_name='authenticated'AND r.proname=ANY(front))OR(role_name='service_role'AND r.proname='record_normative_runtime_evidence');
    IF has_function_privilege(role_name,r.oid,'EXECUTE')IS DISTINCT FROM expected THEN RAISE EXCEPTION'NORMATIVE_EFFECTIVE_FUNCTION_ACL_MISMATCH';END IF;
   END IF;
  END LOOP;
 END LOOP;
 FOR r IN SELECT cl.oid,cl.relowner,cl.relacl,cl.relname FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public'AND cl.relname=ANY(tables)AND cl.relkind='r'LOOP
  FOR a IN SELECT DISTINCT x.grantee FROM aclexplode(coalesce(r.relacl,acldefault('r',r.relowner)))x WHERE x.grantee<>r.relowner LOOP
   grantee:=CASE WHEN a.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(a.grantee))END;EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %s',r.relname,grantee);
  END LOOP;
  FOR c IN SELECT attname,attacl FROM pg_attribute WHERE attrelid=r.oid AND attnum>0 AND NOT attisdropped LOOP
   FOR a IN SELECT DISTINCT x.grantee FROM aclexplode(CASE WHEN cardinality(c.attacl)>0 THEN c.attacl END)x WHERE x.grantee<>r.relowner LOOP
    grantee:=CASE WHEN a.grantee=0 THEN'PUBLIC'ELSE quote_ident(pg_get_userbyid(a.grantee))END;EXECUTE format('REVOKE ALL PRIVILEGES (%I)ON TABLE public.%I FROM %s',c.attname,r.relname,grantee);
   END LOOP;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','authenticator','supabase_auth_admin']LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name)AND(has_table_privilege(role_name,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')OR has_any_column_privilege(role_name,r.oid,'SELECT,INSERT,UPDATE,REFERENCES'))THEN RAISE EXCEPTION'NORMATIVE_EFFECTIVE_TABLE_ACL_MISMATCH';END IF;
  END LOOP;
 END LOOP;
END;$acl$;


-- SOURCE ONLY. Four old privacy definitions composed from exact fresh628-equivalent627 bodies.
-- Each held feature contribution is preserved as an insertion; no old byte is removed.
CREATE OR REPLACE FUNCTION public.account_deletion_files(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
 SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name,'objectId',o.id,'updatedAt',o.updated_at) ORDER BY o.bucket_id,o.name),'[]'::jsonb)
 FROM storage.objects o WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.uc_archive_personal_counts(p_user_id)))AND NOT public.uc_self_examination_retained(p_user_id)AND public.uc_publication_personal_counts(p_user_id)='[]'::jsonb AND public.uc_ng_personal_counts(p_user_id)='[]'::jsonb AND NOT EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events retained_removal WHERE retained_removal.user_id=p_user_id OR retained_removal.actor_id=p_user_id)AND(
  (o.bucket_id IN ('avatars','student-documents','final-test-photos','student-identification-media','admission-case-evidence','education-issuance-staging') AND split_part(o.name,'/',1)=p_user_id::text)
  OR (o.bucket_id='student-documents' AND o.name LIKE 'avatars/'||p_user_id::text||'.%')
  OR (o.bucket_id='admission-case-evidence'AND split_part(o.name,'/',4)='staging'AND split_part(o.name,'/',5)=p_user_id::text)
  OR (o.bucket_id='chat-attachments' AND split_part(o.name,'/',2)=p_user_id::text
    AND (EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user_id AND split_part(o.name,'/',1)=p.organization_id::text)
      OR EXISTS(SELECT 1 FROM public.account_deletion_jobs j WHERE j.user_id=p_user_id AND j.state='cleanup_pending' AND split_part(o.name,'/',1)=j.snapshot->>'organizationId'))));
$function$;

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
 SELECT coalesce(sum((archive_row->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_archive_personal_counts(p_user_id))archive_row;
 IF v_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','ARCHIVE_RETENTION_REVIEW_REQUIRED','message','Сохранены архивные дела, основания, история, файлы или изолированные копии. Центру нужно отдельно проверить дальнейшее хранение; удаление аккаунта не начато.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','archive_retained_copies','label','Архивные дела, история, основания и копии: требуется проверка хранения','count',v_count,'action','block'));
 END IF;
 SELECT * INTO p FROM public.profiles WHERE user_id=p_user_id;
 v_org:=p.organization_id;
 IF v_org IS NOT NULL THEN v_owner:=public.is_org_owner(p_user_id,v_org); END IF;
 SELECT count(*) INTO v_learning FROM public.enrollments WHERE user_id=p_user_id;
 SELECT count(*)INTO v_count FROM public.uc_course_assignment_removal_events removal_event WHERE removal_event.user_id=p_user_id OR removal_event.actor_id=p_user_id;
 IF v_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','Сохранена история отмены или повторного назначения курса. До удаления нужна отдельная проверка этих записей; назначение не удаляется физически.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','retained_assignment_removals','label','История отмен и повторных назначений: требуется проверка хранения','count',v_count,'action','retain'));
 END IF;
 IF public.uc_publication_personal_counts(p_user_id)<>'[]'::jsonb THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','Сохранены публичные редакции, проверки или календарные решения. До удаления нужна отдельная проверка хранения этих фактов.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','retained_publication_evidence','label','История публикаций и решений: требуется проверка хранения','count',(SELECT coalesce(sum((x->>'count')::bigint),0)FROM jsonb_array_elements(public.uc_publication_personal_counts(p_user_id))x),'action','retain'));
 END IF;
 IF public.uc_ng_personal_counts(p_user_id)<>'[]'::jsonb THEN
  SELECT coalesce(sum((ng_item->>'count')::bigint),0)INTO v_count FROM jsonb_array_elements(public.uc_ng_personal_counts(p_user_id))ng_item;
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','NORMATIVE_RETENTION_REVIEW_REQUIRED','message','Сохранена история нормативного каталога и решений. До удаления требуется отдельная проверка дальнейшего хранения.'));
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','normative_history_retained_copies','label','История нормативного каталога и решений: требуется проверка хранения','count',v_count,'action','block'));
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
 IF public.uc_self_examination_retained(p_user_id)THEN
  v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','RETENTION_POLICY_REQUIRED','message','Сохранены черновики самообследования, подтверждения фактов или связанные источники. До удаления нужна отдельная проверка хранения; автоматическая очистка файлов не начинается.'));
  SELECT coalesce(sum(x.value::bigint),0)INTO v_count FROM jsonb_each_text(public.uc_self_examination_personal_counts(p_user_id))x;
  v_categories:=v_categories||jsonb_build_array(jsonb_build_object('key','retained_self_examination','label','Самообследование и его источники: требуется проверка хранения','count',v_count,'action','retain'));
 END IF;
 RETURN jsonb_build_object('organizationId',v_org,'emptyOrganization',v_owner AND v_org_shared=0,'learningCount',v_learning,
  'categories',v_categories,'blockers',v_blockers,'files',v_files,'sharedCount',v_shared,'personalRows',public.account_deletion_personal_row_counts(p_user_id),
  'profileRevision',p.updated_at,'role',(SELECT role::text FROM public.user_roles WHERE user_id=p_user_id LIMIT 1));
END;$function$;

CREATE OR REPLACE FUNCTION public.uc_scoped_journal_erase_user(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR current_setting('sintagma.account_deletion_erase_user',true) IS DISTINCT FROM p_user::text OR NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations rev WHERE rev.user_id=p_user) THEN PERFORM public.uc_custom_journal_error('ACCESS_DENIED');END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(p_user::text,42007))THEN PERFORM public.uc_self_examination_error('REVISION_CONFLICT');END IF;
 IF public.uc_self_examination_retained(p_user)THEN RAISE EXCEPTION 'SELF_EXAMINATION_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
 IF EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events retained_removal WHERE retained_removal.user_id=p_user OR retained_removal.actor_id=p_user)THEN RAISE EXCEPTION 'COURSE_ASSIGNMENT_REMOVAL_RETENTION_REVIEW_REQUIRED' USING ERRCODE='P0001';END IF;
 PERFORM public.uc_archive_retention_block(p_user);
 PERFORM public.uc_publication_retention_block(p_user);
 PERFORM public.uc_ng_retention_block(p_user);
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
)||public.uc_education_personal_counts(p_user))||public.uc_frdo_personal_counts(p_user))||public.uc_signature_assurance_personal_counts(p_user)||public.uc_signature_assurance_file_proof_personal_counts(p_user)||public.uc_archive_personal_counts(p_user)||public.uc_publication_personal_counts(p_user)
||(SELECT coalesce(jsonb_agg(jsonb_build_object('table',x.key,'column','retained_self_examination','count',x.value::bigint)ORDER BY x.key),'[]'::jsonb)FROM jsonb_each_text(public.uc_self_examination_personal_counts(p_user))x WHERE x.value::bigint>0)
||public.uc_ng_personal_counts(p_user)
$function$;


-- No existing function metadata/ACL/config, role, membership, role-setting or default ACL may change.
DO $combined_postimage$
DECLARE e record;v_privacy_function pg_proc%ROWTYPE;c pg_class%ROWTYPE;before_role record;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.uc_combined_existing_functions b LEFT JOIN pg_proc p ON p.oid=b.oid
 WHERE p.oid IS NULL OR (CASE WHEN b.oid IN(to_regprocedure('public.account_deletion_files(uuid)'),to_regprocedure('public.account_deletion_snapshot(uuid)'),to_regprocedure('public.uc_scoped_journal_erase_user(uuid)'),to_regprocedure('public.uc_scoped_journal_personal_counts(uuid)'))THEN to_jsonb(p)-'prosrc'ELSE to_jsonb(p)END)IS DISTINCT FROM b.metadata)
 THEN RAISE EXCEPTION 'COMBINED_EXISTING_FUNCTION_BODY_OR_AUTHORITY_CHANGED';END IF;
 FOR e IN SELECT * FROM jsonb_to_recordset('[{"name":"uc_archive_error","body_md5":"20b2f0f16e53d702058dff053b7d28f7"},{"name":"uc_archive_hash","body_md5":"0a675fa80e7cef8f522e09b1f0f560ea"},{"name":"uc_archive_text","body_md5":"9cbd307b20f293c41a65597cc1c9ecd2"},{"name":"uc_archive_people","body_md5":"1e879c849944fff04bbd338754a91fef"},{"name":"uc_archive_json_people","body_md5":"43b6ba12c53a85bdf0e816f46d7e226f"},{"name":"uc_archive_scope","body_md5":"9e877d3ce41b5b509adb69229334beca"},{"name":"uc_archive_scope_contains","body_md5":"3f79c6108effc79b93bf6bec16207f2c"},{"name":"uc_archive_fence","body_md5":"f345a977f83a17daa1fa8ed0b228db63"},{"name":"uc_archive_immutable","body_md5":"1a9d21186eeade6c93e665d75d76cf09"},{"name":"uc_archive_case_head_guard","body_md5":"ab5b2b1ba1daa56f21054967e4062814"},{"name":"uc_archive_event_canonical","body_md5":"b689f6d54031c98d0917c416b221f76e"},{"name":"uc_archive_event_hash","body_md5":"751f2b28ee96c12b193a5c2da1accc7a"},{"name":"uc_archive_revision_valid","body_md5":"562acb5c5dc4aff9dbdbffe263a269dd"},{"name":"uc_archive_org_version","body_md5":"0b954a36fdd906cf5db152f0fdb23c7b"},{"name":"uc_archive_authority_current","body_md5":"1fb316a79037a1f406e51dd1493881cf"},{"name":"uc_archive_rule_projection","body_md5":"21ee1d5fb3c852dfc595479db56a0a62"},{"name":"uc_archive_case_projection","body_md5":"d12dc58d11d6512c9b13f96788eb8146"},{"name":"uc_archive_source_shape","body_md5":"5b287e6729c1ec4164ed82645fcc47af"},{"name":"uc_archive_source_capture","body_md5":"1df6da9553fefaf81c2d9929eb7fae09"},{"name":"uc_archive_registry_source","body_md5":"208028b7cb1fc015ce834a17658714c2"},{"name":"uc_archive_journal_source","body_md5":"7eecdf422366f06b17d5efef99faed93"},{"name":"uc_archive_scoped_journal_source","body_md5":"80024b5900be57e6e8a160d32e7439de"},{"name":"uc_archive_group_document_source","body_md5":"c5ba3d0e56fb4e17c5097692014343db"},{"name":"uc_archive_admission_source","body_md5":"b1f641e3037296e28756613e603e1dfa"},{"name":"uc_archive_org_files","body_md5":"1fc3815902db5bbfc7f93ac553d3ddb3"},{"name":"uc_archive_education_source","body_md5":"dafc524502705a3d1696e4b3733a4d99"},{"name":"uc_archive_frdo_source","body_md5":"5ae25f93304a4099b26c9ac14601f1d8"},{"name":"uc_archive_signature_file","body_md5":"fdd2dbaa3a9d869a8cd231eccc8d4f9b"},{"name":"uc_archive_signature_source","body_md5":"fb42f99a862e786cf31b9b3ef21c94d9"},{"name":"uc_archive_source","body_md5":"56c61d3990508476435aec9767681d13"},{"name":"uc_archive_can_role","body_md5":"9c8487d46ff5b30e568f73e3272b4e9e"},{"name":"uc_archive_caps","body_md5":"ca7b20189dbe985c91980b2a5eb096c2"},{"name":"uc_archive_case_access","body_md5":"4663edb6975a6cb0cf72f542fb52dc4f"},{"name":"uc_archive_case_digest","body_md5":"16bda25a9bc5a7ba31dca0a54f4d3726"},{"name":"uc_archive_append_case","body_md5":"84c2e8d589b4d5436f21a38654f5d3dd"},{"name":"uc_archive_active_holds","body_md5":"4c337729cd2ff5714c12b8d151da4ea3"},{"name":"uc_archive_event_projection","body_md5":"9db6dc86352cc04df13f435ccc970613"},{"name":"uc_archive_decision","body_md5":"50e18c64166c86a76d1ec0bb624c64a1"},{"name":"uc_archive_apply_authority","body_md5":"12b07a40d325bb089b76d72e91c18fd3"},{"name":"uc_archive_rule_draft_valid","body_md5":"a51c36a2e1e377d70278276c5f49e5ce"},{"name":"uc_archive_apply_rule","body_md5":"394bd4e6c8c2a310a18837162c544e1b"},{"name":"uc_archive_source_check_guard","body_md5":"8a6e8a9c9595b9b17eef94fcffdfa54f"},{"name":"prepare_archive_rule_source_check","body_md5":"12352f0b5cdfe0880ab0ef783d8a403d"},{"name":"commit_archive_rule_source_check","body_md5":"ec81b4664ce072112f2ed734d35a6819"},{"name":"archive_rule_inspection_context","body_md5":"7f765758b1f30a5aea3f24ab9c3d2920"},{"name":"uc_archive_open_case","body_md5":"f14a3b0d67148d1f110dc5861a735f1a"},{"name":"uc_archive_apply_case","body_md5":"d4f9b10ae1685b905fe9b0c6b0685a0d"},{"name":"uc_archive_source_inventory","body_md5":"aecc78bb1e4102037a21c8b1ece21951"},{"name":"uc_archive_json_literal","body_md5":"05730356ec9416811c217fd7e065c2a3"},{"name":"uc_archive_package_guard","body_md5":"85bdd919e297b09bd76562242145f14b"},{"name":"uc_archive_package_access","body_md5":"64991149a013bc21df9f91ab3498d68e"},{"name":"uc_archive_package_projection","body_md5":"61d49eacc1a4c735ad2eb50fc4080abf"},{"name":"uc_archive_prepare_package","body_md5":"fa833c59812675786e23155b98779edb"},{"name":"archive_package_context","body_md5":"3603bbe2ac0d635ee63c53108748a870"},{"name":"uc_archive_prepare_disposal","body_md5":"76dce3bd03c2e01541ba710679e57208"},{"name":"claim_archive_package","body_md5":"773d8e1d71a73b3e046ec19e30791293"},{"name":"commit_archive_package","body_md5":"b3d07d50ba266fa7ec5f9b63438bc5b3"},{"name":"archive_package_object_context","body_md5":"df3823feae8a90d96312b7c2c1c10a2d"},{"name":"archive_sealed_package_context","body_md5":"91ce44cb5572eb061c3ff341ccbf81ee"},{"name":"archive_sealed_file_context","body_md5":"cc2b4afd0b7a54a6ee720f9d1a1c1675"},{"name":"uc_archive_restore_guard","body_md5":"9e7c039b02174ccc7d4a7db59d19a786"},{"name":"uc_archive_restore_projection","body_md5":"47350836bdf0e2fda9b279251a1036f9"},{"name":"uc_archive_restore_access","body_md5":"0d26f26d169834bcb151126110147b9b"},{"name":"uc_archive_prepare_restore","body_md5":"89427b3ad565b8afea8cfcb36b20c988"},{"name":"archive_restore_context","body_md5":"61cd48c6a06d9320e015584c7d35f541"},{"name":"claim_archive_restore","body_md5":"b00d912eef98339f921b47663ecd4add"},{"name":"archive_restore_object_context","body_md5":"cb8f597896fe07d7748fd3db9d39ee2e"},{"name":"commit_archive_restore","body_md5":"97b948e93fb82531ea3964a1d622d7c6"},{"name":"uc_archive_restore_insert","body_md5":"64f012c84af30ba7b34814bf3bf70623"},{"name":"uc_archive_cursor","body_md5":"27e16b324c20b04eca132687d823258e"},{"name":"uc_archive_current_source_ref","body_md5":"eeae4deee93d11d53451a94edc463f95"},{"name":"read_archive_cases","body_md5":"7da9fdf765050981282faa7ea73cb4b6"},{"name":"uc_archive_action_capability","body_md5":"5e64d2386465c8d2c83a01e45465c5ba"},{"name":"apply_archive_case","body_md5":"fd21e2cf91938e333f685fc94e02e435"},{"name":"uc_archive_bucket_guard","body_md5":"a216c6206b699b22100bec4f794b879c"},{"name":"uc_archive_object_guard","body_md5":"58a0bfa2cbe381313ef22ad8d70bbb2c"},{"name":"uc_archive_retained_source_object","body_md5":"e651dcb68cae0ee1a3bf014f52c649ff"},{"name":"uc_archive_personal_counts","body_md5":"256e940d083cb5d9fac43618e356c8e0"},{"name":"uc_archive_retention_block","body_md5":"ea01e22fca7c4dc1aed91b16e8e4f483"},{"name":"uc_self_examination_error","body_md5":"77ce4848c2b719df92bf775f902c8a26"},{"name":"uc_self_examination_shape","body_md5":"fa716429ddaaa6a6c8985fc1fc877400"},{"name":"uc_self_examination_immutable","body_md5":"6998ed3d5673f8c8a06dc2c0abc95d0a"},{"name":"uc_self_examination_catalog","body_md5":"8fa62eda97c2b78e81916c7024ddc92d"},{"name":"uc_self_examination_json_valid","body_md5":"c1f2aea0c25eb8a52977a744cc6f1627"},{"name":"uc_self_examination_answers_valid","body_md5":"fe9024b604fd21a5f3ad0a6ad9b5935f"},{"name":"uc_self_examination_validate","body_md5":"2cad6a863a90291fb9bdccddf4c7a5d0"},{"name":"uc_self_examination_facts","body_md5":"5ac87723949552d784f4364a61b46b0c"},{"name":"uc_self_examination_actor","body_md5":"a42fa2aec5aa1ac3675e65b28bfd8f04"},{"name":"uc_self_examination_source","body_md5":"399b616baf87a291a3846ca9cda78566"},{"name":"uc_self_examination_reviews","body_md5":"05aab67a4e24f0b322966a83ab4a41d0"},{"name":"uc_self_examination_projection","body_md5":"db87b6d1cf97adf54d1ac47c211aae01"},{"name":"read_self_examination_draft","body_md5":"2695b7616e308f02f463f34fc1df0775"},{"name":"apply_self_examination_draft","body_md5":"d2a70003cb6c6e10a425acd5ea7f76db"},{"name":"read_self_examination_history","body_md5":"179555f86924709e114d3ee3abd97ad1"},{"name":"uc_self_examination_link","body_md5":"6c4d97c72d59646d74edc0c6bdd4b4b8"},{"name":"uc_self_examination_personal_counts","body_md5":"d0799684d3b7f2ddf66c71479272d490"},{"name":"uc_self_examination_retained","body_md5":"f8bd3b59819edbe08c9b3f9bb0f44001"},{"name":"uc_self_examination_storage_retention","body_md5":"51b3ece9514a5e8139f21721dee1a101"},{"name":"uc_publication_error","body_md5":"a9f62f5d6f62bd4868f9f171c4afebf4"},{"name":"uc_publication_hash","body_md5":"b851aa6636188cc86748d87949677360"},{"name":"uc_publication_boundary","body_md5":"4c39ed65d9b1bcb812452f5efd1d9aed"},{"name":"uc_publication_token","body_md5":"8a166e6cc102793b1804d4cba9c8fc2a"},{"name":"uc_publication_actor_allowed","body_md5":"a3fe5f9bbc86a4906bd5427fa98204cb"},{"name":"uc_publication_people","body_md5":"fcbb416d0d7a95aba2189ff2346bcb07"},{"name":"uc_publication_fence","body_md5":"a3c903d7ed1035ee984597ae8f673fcd"},{"name":"uc_publication_current_scope","body_md5":"3f5b92f94acafbbf9b88d45d20b2f25c"},{"name":"read_organization_publication","body_md5":"1c4e98a779c7fdd1ddaf49c2c83317a2"},{"name":"list_organization_publications","body_md5":"91987888b879ec598ca0ca57bb8458fc"},{"name":"uc_publication_closed","body_md5":"aebd290621fe50a93423b09f72f99be1"},{"name":"uc_publication_public_url","body_md5":"0a0e75bcb46e01c1a76a508433bfe69e"},{"name":"uc_publication_record_person","body_md5":"b2de01300ae8a76707734f10fda06477"},{"name":"uc_publication_append_event","body_md5":"26adb59b38b6898083ea0a956ae39cf3"},{"name":"uc_publication_receipt","body_md5":"d82a56298a86b7baeb5921512853cb60"},{"name":"create_organization_publication","body_md5":"e1ac89bb6903cb1718c5d71bf6bb267f"},{"name":"record_organization_publication_action","body_md5":"2137aa8cb3b55c6b8a8b26ec1f8fe061"},{"name":"uc_publication_projection","body_md5":"339d95fd62130d528931adef23b99451"},{"name":"prepare_organization_publication_check","body_md5":"fa64ae35cfe1fbfcf3962c58c9933bda"},{"name":"uc_publication_check_context","body_md5":"b38805df7a3de6e7af0cc0a397218ad9"},{"name":"uc_publication_commit_check","body_md5":"921b3ef77627a356c96637e677bcf8c0"},{"name":"list_organization_publication_editions","body_md5":"885ab94af7d5c61771bc1c53396ca975"},{"name":"list_publication_rule_versions","body_md5":"82003d74892c92fcb96b25784a16a02e"},{"name":"append_publication_rule_version","body_md5":"e724c21ec70f8f7d60f0905c9e042bce"},{"name":"record_publication_deadline_decision","body_md5":"37a3bd1a76bf367fe19b654bd4e69dba"},{"name":"list_organization_publication_calendar","body_md5":"585c0ffed9345cea75b8eaee4cd95f0a"},{"name":"sync_organization_publication_calendar","body_md5":"42adb599497eb991b0b85abe1ad2b5f6"},{"name":"uc_publication_personal_counts","body_md5":"a6328e9fbf97b5296974a601137da070"},{"name":"uc_publication_retention_block","body_md5":"317fe50fd6c41392547aeae9e15339b2"},{"name":"uc_ng_hash","body_md5":"94993526efde76ba5d39f142c8f98e62"},{"name":"uc_ng_closed","body_md5":"d1aa8ed1a05c6cd9f8de645bccd93b40"},{"name":"uc_ng_canonical","body_md5":"769fb46234b6c57647c07d7f1c6147dc"},{"name":"uc_ng_immutable","body_md5":"2778c71e43095cd6717b85cb9dbc42bb"},{"name":"uc_ng_fence","body_md5":"55746017ccd0ad191e1a33aee44d0b9a"},{"name":"uc_ng_validate_manifest","body_md5":"d22aeb33f72cd908369545da9f0e4197"},{"name":"read_normative_governance","body_md5":"cff52b7b9630b0506eb1da5f7bb9bdce"},{"name":"list_normative_impact_centres","body_md5":"cfbb570bc15bc31023c809e5e6e428d9"},{"name":"register_normative_manifest","body_md5":"ed3436189c667b38b1ef5f6410e60df1"},{"name":"record_normative_governance_event","body_md5":"4092735aca29560f70195073824463b0"},{"name":"record_normative_runtime_evidence","body_md5":"6924529208b979da62049154ce79ded6"},{"name":"uc_ng_personal_counts","body_md5":"0910076e55d0d943c95f653c78424c3f"},{"name":"uc_ng_retention_block","body_md5":"e4613bc3e3955f2501f0f5a92fec7701"}]'::jsonb)AS x(name text,body_md5 text)LOOP
  IF(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=e.name)<>1
   OR(SELECT md5(p.prosrc)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=e.name)IS DISTINCT FROM e.body_md5
  THEN RAISE EXCEPTION 'COMBINED_DISJOINT_FEATURE_BODY_CHANGED:%',e.name;END IF;
 END LOOP;
 IF(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','storage'))<>(SELECT count(*)+140 FROM pg_temp.uc_combined_existing_functions)
 THEN RAISE EXCEPTION 'COMBINED_EXACT_NEW_FUNCTION_FOOTPRINT_CHANGED';END IF;
 FOR e IN SELECT * FROM jsonb_to_recordset('[{"name":"account_deletion_files","body_md5":"fc70bb80cd30ebcc25c479e7fd912219"},{"name":"account_deletion_snapshot","body_md5":"c6e55ea2001e24e7849875210d44baad"},{"name":"uc_scoped_journal_erase_user","body_md5":"42dd7cccdd600c49e1471bef7f3b9604"},{"name":"uc_scoped_journal_personal_counts","body_md5":"f8f7b3be7cf578aafc26c66c46864ec9"}]'::jsonb)AS x(name text,body_md5 text)LOOP
  SELECT * INTO v_privacy_function FROM pg_proc WHERE oid=to_regprocedure('public.'||e.name||'(uuid)');
  IF v_privacy_function.oid IS NULL OR md5(v_privacy_function.prosrc)IS DISTINCT FROM e.body_md5 THEN RAISE EXCEPTION 'COMBINED_FOUR_BODY_POSTIMAGE_CHANGED:%',e.name;END IF;
 END LOOP;
 FOR e IN SELECT value name FROM jsonb_array_elements_text('["uc_archive_cases","uc_archive_case_events","uc_archive_requests","uc_archive_authority_revisions","uc_archive_rule_revisions","uc_archive_package_builds","uc_archive_package_files","uc_archive_restore_runs","uc_archive_restore_files","uc_archive_restore_projections","uc_archive_disposal_reviews","uc_archive_rule_source_checks","uc_archive_org_keys","uc_self_examination_drafts","uc_self_examination_events","uc_self_examination_sources","uc_publication_rule_versions","uc_publication_streams","uc_publication_editions","uc_publication_events","uc_publication_check_jobs","uc_publication_checks","uc_publication_calendar_tasks","uc_publication_deadline_decisions","uc_publication_requests","uc_publication_participants","uc_publication_write_tokens","uc_normative_manifests","uc_normative_events"]'::jsonb)LOOP
  SELECT * INTO c FROM pg_class WHERE oid=to_regclass('public.'||e.name);
  IF c.oid IS NULL OR c.relkind<>'r'OR NOT c.relrowsecurity OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE a.grantee<>c.relowner)
  THEN RAISE EXCEPTION 'COMBINED_NEW_MODEL_NOT_PRIVATE:%',e.name;END IF;
 END LOOP;
 SELECT * INTO before_role FROM pg_temp.uc_combined_existing_role_metadata;
 IF(SELECT coalesce(jsonb_agg(to_jsonb(r)-'rolpassword'ORDER BY r.oid),'[]'::jsonb)FROM pg_roles r)IS DISTINCT FROM before_role.roles
 OR(SELECT coalesce(jsonb_agg(to_jsonb(m)ORDER BY m.oid),'[]'::jsonb)FROM pg_auth_members m)IS DISTINCT FROM before_role.memberships
 OR(SELECT coalesce(jsonb_agg(to_jsonb(s)ORDER BY s.setdatabase,s.setrole),'[]'::jsonb)FROM pg_db_role_setting s)IS DISTINCT FROM before_role.settings
 OR(SELECT coalesce(jsonb_agg(to_jsonb(d)ORDER BY d.oid),'[]'::jsonb)FROM pg_default_acl d)IS DISTINCT FROM before_role.defaults
 THEN RAISE EXCEPTION 'COMBINED_EXISTING_ROLE_OR_DEFAULT_AUTHORITY_CHANGED';END IF;
END;$combined_postimage$;
-- Whole candidate is review-only. Native acceptance must prove complete rollback before isolated commit testing.
COMMIT;
