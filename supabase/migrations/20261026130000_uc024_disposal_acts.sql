-- UC024 factual disposal acts. Source only; no ledger row, physical deletion or automatic backup verification.
BEGIN;
SET LOCAL search_path=pg_catalog,public;
DO $preflight$ BEGIN
 IF to_regclass('public.uc_archive_disposal_act_revisions') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('uc_da_snapshot','uc_da_blockers','uc_da_evidence','uc_da_projection','read_archive_disposal_acts','record_archive_disposal_act')) THEN RAISE EXCEPTION 'DISPOSAL_ACT_NAME_COLLISION';END IF;
 IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid='public.uc_archive_personal_counts(uuid)'::regprocedure) IS DISTINCT FROM '256e940d083cb5d9fac43618e356c8e0' THEN RAISE EXCEPTION 'ARCHIVE_RETENTION_PREIMAGE_CHANGED';END IF;
END $preflight$;
CREATE TABLE public.uc_archive_disposal_act_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),act_id uuid NOT NULL,revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),prior_id uuid REFERENCES public.uc_archive_disposal_act_revisions(id) ON DELETE RESTRICT,
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE CHECK(sequence BETWEEN 1 AND 9007199254740991),organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,case_id uuid NOT NULL REFERENCES public.uc_archive_cases(id) ON DELETE RESTRICT,
 case_revision bigint NOT NULL CHECK(case_revision>0),case_state_hash text NOT NULL CHECK(case_state_hash~'^[a-f0-9]{64}$'),actor_id uuid NOT NULL,request_id uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),action_kind text NOT NULL CHECK(action_kind IN('draft','assess','approve')),
 state text NOT NULL CHECK(state IN('blocked_draft','ready_for_center_approval','center_approved')),snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=4194304),snapshot_hash text NOT NULL CHECK(snapshot_hash~'^[a-f0-9]{64}$'),assessment jsonb,center_approval jsonb,blockers jsonb NOT NULL CHECK(jsonb_typeof(blockers)='array'),state_hash text NOT NULL CHECK(state_hash~'^[a-f0-9]{64}$'),
 destruction_authorized boolean NOT NULL DEFAULT false CHECK(destruction_authorized=false),physical_cleanup_claim boolean NOT NULL DEFAULT false CHECK(physical_cleanup_claim=false),retained_people uuid[] NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,act_id,revision),UNIQUE(actor_id,request_id),CHECK((revision=1)=(prior_id IS NULL)),CHECK((state='center_approved')=(center_approval IS NOT NULL)),CHECK(state='blocked_draft' OR (assessment IS NOT NULL AND blockers='[]'::jsonb))
);
CREATE INDEX uc_archive_disposal_act_case_page ON public.uc_archive_disposal_act_revisions(organization_id,case_id,sequence DESC);
CREATE INDEX uc_archive_disposal_act_head ON public.uc_archive_disposal_act_revisions(organization_id,act_id,revision DESC);
ALTER TABLE public.uc_archive_disposal_act_revisions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER uc_archive_disposal_act_immutable BEFORE UPDATE OR DELETE ON public.uc_archive_disposal_act_revisions FOR EACH ROW EXECUTE FUNCTION public.uc_archive_immutable();

CREATE FUNCTION public.uc_da_snapshot(p_head public.uc_archive_cases,p_lock boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $act$
DECLARE v_rule public.uc_archive_rule_revisions;v_review public.uc_archive_disposal_reviews;v_check public.uc_archive_rule_source_checks;v_source jsonb;v_nomenclature jsonb;v_source_ref jsonb;v_nomenclature_ref jsonb;BEGIN
 IF p_head.rule_version_id IS NOT NULL THEN
  SELECT r.* INTO v_rule FROM public.uc_archive_rule_revisions r WHERE r.id=p_head.rule_version_id AND r.organization_id=p_head.organization_id;
  IF v_rule.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_UNAVAILABLE');END IF;
  PERFORM public.uc_archive_fence(p_head.organization_id,p_head.scope,v_rule.retained_people,p_lock,NULL);
  v_source_ref:=v_rule.source_reference;v_nomenclature_ref:=v_rule.nomenclature_reference;
  v_source:=public.uc_archive_org_version(p_head.organization_id,v_source_ref,false,p_lock);
  v_nomenclature:=public.uc_archive_org_version(p_head.organization_id,v_nomenclature_ref,false,p_lock);
  SELECT c.* INTO v_check FROM public.uc_archive_rule_source_checks c WHERE c.id=(v_rule.source_check->>'check_id')::uuid AND c.organization_id=p_head.organization_id AND c.phase='sealed' AND c.actual_byte_sha256=v_rule.source_byte_sha256 AND c.source_context->'private_file'=v_source->'private_file';
 END IF;
 SELECT r.* INTO v_review FROM public.uc_archive_disposal_reviews r WHERE r.organization_id=p_head.organization_id AND r.case_id=p_head.id AND r.case_revision=p_head.revision AND r.case_state_hash=p_head.state_hash AND r.rule_version_id IS NOT DISTINCT FROM p_head.rule_version_id ORDER BY r.created_at DESC,r.id DESC LIMIT 1;
 IF v_review.id IS NOT NULL THEN PERFORM public.uc_archive_fence(p_head.organization_id,p_head.scope,v_review.retained_people,p_lock,NULL);END IF;
 RETURN jsonb_build_object('case',public.uc_archive_case_projection(p_head),'rule_source',v_source_ref,'nomenclature_source',v_nomenclature_ref,'rule_source_context_hash',CASE WHEN v_source IS NULL THEN NULL ELSE public.uc_archive_hash(v_source) END,'nomenclature_context_hash',CASE WHEN v_nomenclature IS NULL THEN NULL ELSE public.uc_archive_hash(v_nomenclature) END,
  'source_check',CASE WHEN v_check.id IS NULL THEN NULL ELSE jsonb_build_object('id',v_check.id,'byte_sha256',v_check.actual_byte_sha256,'byte_size',v_check.actual_byte_size,'sealed_at',v_check.sealed_at) END,
  'review',CASE WHEN v_review.id IS NULL THEN NULL ELSE jsonb_build_object('id',v_review.id,'organization_id',v_review.organization_id,'case_id',v_review.case_id,'actor_id',v_review.actor_id,'case_revision',v_review.case_revision,'case_state_hash',v_review.case_state_hash,'rule_version_id',v_review.rule_version_id,'calculation',v_review.calculation,'blocker_codes',v_review.blocker_codes,'created_at',v_review.created_at) END);
END $act$;

CREATE FUNCTION public.uc_da_blockers(p_snapshot jsonb,p_assessment jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $act$
DECLARE v_head jsonb:=p_snapshot->'case';v_rule jsonb:=p_snapshot->'case'->'rule';v_closure jsonb:=p_snapshot->'case'->'closure';v_blockers jsonb:='[]';v_start date;v_candidate date;v_years integer;BEGIN
 IF v_rule IS NULL OR v_rule='null'::jsonb THEN v_blockers:=v_blockers||jsonb_build_array('RETENTION_UNCLASSIFIED');
 ELSE
  IF v_rule->>'status' IS DISTINCT FROM 'approved' OR v_rule->'legal_review'='null'::jsonb OR v_rule->'center_approval'='null'::jsonb OR (v_rule->>'effective_from')::date>current_date THEN v_blockers:=v_blockers||jsonb_build_array('APPROVAL_REQUIRED');END IF;
  IF EXISTS(SELECT 1 FROM public.uc_archive_rule_revisions later WHERE later.rule_id=(SELECT old.rule_id FROM public.uc_archive_rule_revisions old WHERE old.id=(v_rule->>'id')::uuid) AND later.revision>(v_rule->>'revision')::bigint) THEN v_blockers:=v_blockers||jsonb_build_array('APPROVAL_STALE');END IF;
  IF p_snapshot->'source_check'='null'::jsonb THEN v_blockers:=v_blockers||jsonb_build_array('APPROVAL_STALE');END IF;
  IF v_rule->'duration'->>'kind'='permanent' THEN v_blockers:=v_blockers||jsonb_build_array('RETENTION_PERMANENT');ELSIF v_rule->'duration'->>'kind' IS DISTINCT FROM 'years' THEN v_blockers:=v_blockers||jsonb_build_array('RETENTION_UNCLASSIFIED');END IF;
 END IF;
 IF v_closure IS NULL OR v_closure='null'::jsonb THEN v_blockers:=v_blockers||jsonb_build_array('CLOSURE_REQUIRED');
 ELSIF (v_closure->>'actual_on')::date>current_date THEN v_blockers:=v_blockers||jsonb_build_array('CLOSURE_REQUIRED');
 ELSIF v_rule IS NOT NULL AND v_rule<>'null'::jsonb THEN
  IF v_closure->>'kind' IS DISTINCT FROM v_rule->>'start_event' THEN v_blockers:=v_blockers||jsonb_build_array('EVENT_MISMATCH');
  ELSIF v_rule->'duration'->>'kind'='years' THEN
   v_years:=(v_rule->'duration'->>'years')::integer;
   IF extract(year FROM (v_closure->>'actual_on')::date)::integer+1+v_years>9999 THEN v_blockers:=v_blockers||jsonb_build_array('RETENTION_UNCLASSIFIED');
   ELSE v_start:=make_date(extract(year FROM (v_closure->>'actual_on')::date)::integer+1,1,1);v_candidate:=make_date(extract(year FROM v_start)::integer+v_years,1,1);IF current_date<v_candidate THEN v_blockers:=v_blockers||jsonb_build_array('RETENTION_NOT_EXPIRED');END IF;END IF;
  END IF;
 END IF;
 IF jsonb_array_length(public.uc_archive_active_holds(v_head->'hold_events'))>0 THEN v_blockers:=v_blockers||jsonb_build_array('LEGAL_HOLD');END IF;
 IF p_snapshot->'review'='null'::jsonb THEN v_blockers:=v_blockers||jsonb_build_array('APPROVAL_REQUIRED');
 ELSE SELECT v_blockers||coalesce(jsonb_agg(e.value),'[]') INTO v_blockers FROM jsonb_array_elements(p_snapshot->'review'->'blocker_codes') e WHERE e.value NOT IN('"BACKUP_POLICY_UNVERIFIED"'::jsonb,'"APPROVAL_REQUIRED"'::jsonb,'"EXPERT_REVIEW_REQUIRED"'::jsonb);END IF;
 IF p_assessment IS NULL OR p_assessment->>'backup_status' IS DISTINCT FROM 'documented_conditions_verified' OR p_assessment->'backup_evidence' IS NULL OR p_assessment->'backup_evidence'='null'::jsonb THEN v_blockers:=v_blockers||jsonb_build_array('BACKUP_POLICY_UNVERIFIED');END IF;
 IF p_assessment IS NULL OR p_assessment->>'expert_status'='unknown' OR coalesce((v_rule->>'requires_expert_review')::boolean,true) AND (p_assessment->>'expert_status' IS DISTINCT FROM 'documented_review_complete' OR p_assessment->'expert_evidence' IS NULL OR p_assessment->'expert_evidence'='null'::jsonb) THEN v_blockers:=v_blockers||jsonb_build_array('EXPERT_REVIEW_REQUIRED');END IF;
 RETURN (SELECT coalesce(jsonb_agg(DISTINCT e.value ORDER BY e.value),'[]') FROM jsonb_array_elements(v_blockers)e);
END $act$;

CREATE FUNCTION public.uc_da_evidence(p_row public.uc_archive_disposal_act_revisions,p_lock boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $act$
DECLARE v_proof jsonb;v_current boolean:=true;v_item jsonb;v_ref jsonb;v_hash text;BEGIN
 PERFORM public.uc_archive_fence(p_row.organization_id,(p_row.snapshot->'case'->'scope'),p_row.retained_people,p_lock,NULL);
 FOR v_item IN SELECT x.value FROM jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('ref',p_row.assessment->'backup_evidence','hash',p_row.assessment->'backup_context_hash'),
  jsonb_build_object('ref',p_row.assessment->'expert_evidence','hash',p_row.assessment->'expert_context_hash'),
  jsonb_build_object('ref',p_row.center_approval->'evidence','hash',p_row.center_approval->'evidence_context_hash')))x LOOP
  v_ref:=v_item->'ref';v_hash:=v_item->>'hash';IF v_ref IS NULL OR v_ref='null'::jsonb THEN CONTINUE;END IF;
  v_proof:=public.uc_archive_org_version(p_row.organization_id,v_ref,false,p_lock);
  IF public.uc_archive_hash(v_proof) IS DISTINCT FROM v_hash OR v_proof->'captured_record'->'review'->>'state' IS DISTINCT FROM 'approved' THEN v_current:=false;END IF;
 END LOOP;
 RETURN v_current;
END $act$;

CREATE FUNCTION public.uc_da_projection(p_row public.uc_archive_disposal_act_revisions,p_current jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $act$
DECLARE v_current boolean;v_evidence_current boolean;v_blocks jsonb;BEGIN
 v_evidence_current:=public.uc_da_evidence(p_row,false);v_current:=p_row.snapshot=p_current AND v_evidence_current;
 v_blocks:=public.uc_da_blockers(p_current,p_row.assessment);IF NOT v_current THEN v_blocks:=v_blocks||jsonb_build_array('APPROVAL_STALE');END IF;
 RETURN (to_jsonb(p_row)-ARRAY['request_sha256','action_kind','retained_people'])||jsonb_build_object('is_current',v_current,'current_blockers',v_blocks);
END $act$;

CREATE FUNCTION public.read_archive_disposal_acts(p_organization_id uuid,p_scope jsonb,p_case_id uuid,p_query jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms' SET statement_timeout='15000ms' AS $act$
DECLARE v_head public.uc_archive_cases;v_row public.uc_archive_disposal_act_revisions;v_items jsonb:='[]';v_snapshot jsonb;v_ceiling bigint;v_after bigint;v_next bigint;v_caps jsonb;BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR p_organization_id IS NULL OR p_case_id IS NULL THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 v_head:=public.uc_archive_case_access(p_organization_id,p_scope,p_case_id,false);
 IF p_query IS NULL OR NOT coalesce(public.uc_custom_journal_shape(p_query,ARRAY['ceiling','after','limit']),false) OR p_query->'limit' IS DISTINCT FROM '25'::jsonb OR NOT(p_query->'ceiling'='null'::jsonb OR public.uc_archive_revision_valid(p_query->'ceiling')) OR NOT(p_query->'after'='null'::jsonb OR public.uc_archive_revision_valid(p_query->'after')) THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 SELECT coalesce(max(a.sequence),0) INTO v_ceiling FROM public.uc_archive_disposal_act_revisions a WHERE a.organization_id=p_organization_id AND a.case_id=p_case_id;
 IF p_query->'ceiling'<>'null'::jsonb THEN v_ceiling:=least(v_ceiling,(p_query->>'ceiling')::bigint);END IF;
 v_after:=CASE WHEN p_query->'after'='null'::jsonb THEN NULL ELSE (p_query->>'after')::bigint END;
 v_snapshot:=public.uc_da_snapshot(v_head,false);v_caps:=public.uc_archive_caps(p_organization_id,v_head.scope);
 FOR v_row IN SELECT a.* FROM public.uc_archive_disposal_act_revisions a WHERE a.organization_id=p_organization_id AND a.case_id=p_case_id AND a.sequence<=v_ceiling AND (v_after IS NULL OR a.sequence<v_after) ORDER BY a.sequence DESC LIMIT 26 LOOP
  IF jsonb_array_length(v_items)=25 THEN v_next:=(v_items->24->>'sequence')::bigint;EXIT;END IF;
  v_items:=v_items||jsonb_build_array(public.uc_da_projection(v_row,v_snapshot));
 END LOOP;
 RETURN jsonb_build_object('version',1,'organization_id',p_organization_id,'case_id',p_case_id,'actor_id',auth.uid(),'ceiling',v_ceiling,'next_after',v_next,'items',v_items,'can_draft',v_caps->'can_operate','can_assess',v_caps->'can_prepare_destruction_review','can_approve',v_caps->'can_approve_rules');
END $act$;

CREATE FUNCTION public.record_archive_disposal_act(p_organization_id uuid,p_scope jsonb,p_case_id uuid,p_case_revision bigint,p_case_state_hash text,p_request_id uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms' SET statement_timeout='20000ms' AS $act$
DECLARE v_head public.uc_archive_cases;v_prior public.uc_archive_disposal_act_revisions;v_row public.uc_archive_disposal_act_revisions;v_replay public.uc_archive_disposal_act_revisions;v_authority public.uc_archive_authority_revisions;v_reviewer public.uc_archive_authority_revisions;v_kind text:=p_command->>'kind';v_snapshot jsonb;v_assessment jsonb;v_centre jsonb;v_blocks jsonb;v_req_hash text;v_source jsonb;v_expert jsonb;v_decision jsonb;v_state text;v_id uuid:=gen_random_uuid();v_act uuid;v_revision bigint;v_people uuid[];v_now timestamptz:=clock_timestamp();v_caps jsonb;BEGIN
 IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR p_organization_id IS NULL OR p_case_id IS NULL THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 v_head:=public.uc_archive_case_access(p_organization_id,p_scope,p_case_id,true);v_caps:=public.uc_archive_caps(p_organization_id,v_head.scope);
 IF p_request_id IS NULL OR p_case_revision IS NULL OR p_case_revision NOT BETWEEN 1 AND 9007199254740991 OR coalesce(p_case_state_hash,'')!~'^[a-f0-9]{64}$' OR p_command IS NULL OR coalesce(v_kind,'') NOT IN('draft','assess','approve') THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 IF v_kind='draft' THEN
  IF NOT coalesce(public.uc_custom_journal_shape(p_command,ARRAY['kind']),false) THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  IF NOT coalesce((v_caps->>'can_operate')::boolean,false) THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
 ELSIF v_kind='assess' THEN
  v_authority:=public.uc_archive_authority_current(p_organization_id,auth.uid(),'destruction_reviewer',true);
  IF NOT coalesce(public.uc_custom_journal_shape(p_command,ARRAY['kind','act_id','expected_revision','expected_state_hash','reason','backup_status','backup_evidence','expert_status','expert_evidence']),false) OR NOT public.uc_archive_text(p_command->'reason') OR coalesce(p_command->>'backup_status','') NOT IN('unknown','documented_conditions_verified') OR coalesce(p_command->>'expert_status','') NOT IN('unknown','not_required','documented_review_complete') THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  IF ((p_command->>'backup_status'='unknown') IS DISTINCT FROM (p_command->'backup_evidence'='null'::jsonb)) OR ((p_command->>'expert_status'<>'documented_review_complete') IS DISTINCT FROM (p_command->'expert_evidence'='null'::jsonb)) THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 ELSE
  v_authority:=public.uc_archive_authority_current(p_organization_id,auth.uid(),'center_approver',true);
  IF NOT coalesce(public.uc_custom_journal_shape(p_command,ARRAY['kind','act_id','expected_revision','expected_state_hash','decision']),false) THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 END IF;
 IF v_kind<>'draft' AND (NOT public.uc_custom_journal_uuid(p_command->'act_id') OR NOT public.uc_archive_revision_valid(p_command->'expected_revision') OR (p_command->>'expected_revision')::bigint<1 OR coalesce(p_command->>'expected_state_hash','')!~'^[a-f0-9]{64}$') THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 PERFORM public.uc_archive_fence(p_organization_id,v_head.scope,v_head.retained_subjects||v_head.attribution_actors||ARRAY[auth.uid()],true,p_request_id);
 v_req_hash:=public.uc_archive_hash(jsonb_build_object('organization_id',p_organization_id,'scope',p_scope,'case_id',p_case_id,'case_revision',p_case_revision,'case_state_hash',p_case_state_hash,'command',p_command));
 SELECT a.* INTO v_replay FROM public.uc_archive_disposal_act_revisions a WHERE a.actor_id=auth.uid() AND a.request_id=p_request_id;
 IF v_replay.id IS NOT NULL THEN
  IF v_replay.organization_id<>p_organization_id OR v_replay.case_id<>p_case_id OR v_replay.request_sha256<>v_req_hash THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
  PERFORM public.uc_da_evidence(v_replay,true);
  RETURN jsonb_build_object('version',1,'organization_id',p_organization_id,'case_id',p_case_id,'actor_id',auth.uid(),'request_id',p_request_id,'action_kind',v_kind,'replayed',true,'id',v_replay.id,'act_id',v_replay.act_id,'revision',v_replay.revision,'state_hash',v_replay.state_hash);
 END IF;
 IF v_head.revision<>p_case_revision OR v_head.state_hash<>p_case_state_hash THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 v_snapshot:=public.uc_da_snapshot(v_head,true);v_people:=v_head.retained_subjects||v_head.attribution_actors||ARRAY[auth.uid()];
 IF v_snapshot->'review'<>'null'::jsonb THEN v_people:=v_people||ARRAY[(v_snapshot->'review'->>'actor_id')::uuid];END IF;
 IF v_kind='draft' THEN v_act:=gen_random_uuid();v_revision:=1;
 ELSE
  SELECT a.* INTO v_prior FROM public.uc_archive_disposal_act_revisions a WHERE a.organization_id=p_organization_id AND a.case_id=p_case_id AND a.act_id=(p_command->>'act_id')::uuid ORDER BY a.revision DESC LIMIT 1;
  IF v_prior.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
  PERFORM public.uc_da_evidence(v_prior,true);v_people:=v_people||v_prior.retained_people||coalesce(v_authority.retained_people,'{}');
  IF v_prior.revision<>(p_command->>'expected_revision')::bigint OR v_prior.state_hash<>p_command->>'expected_state_hash' THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
  IF v_prior.snapshot-'review' IS DISTINCT FROM v_snapshot-'review' THEN PERFORM public.uc_archive_error('APPROVAL_STALE');END IF;
  v_act:=v_prior.act_id;v_revision:=v_prior.revision+1;
  IF v_revision>9007199254740991 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
  IF v_kind='assess' THEN
   IF v_prior.state='center_approved' THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
   -- This adds a new real review without rewriting the old blocked review or declaring it approved.
   PERFORM public.uc_archive_prepare_disposal(v_head);v_snapshot:=public.uc_da_snapshot(v_head,true);
   IF p_command->>'backup_status'='documented_conditions_verified' THEN v_source:=public.uc_archive_org_version(p_organization_id,p_command->'backup_evidence',true,true);v_people:=v_people||public.uc_archive_people(v_source->'subjects');END IF;
   IF p_command->>'expert_status'='documented_review_complete' THEN v_expert:=public.uc_archive_org_version(p_organization_id,p_command->'expert_evidence',true,true);v_people:=v_people||public.uc_archive_people(v_expert->'subjects');END IF;
   v_assessment:=jsonb_build_object('actor_id',auth.uid(),'recorded_at',v_now,'authority',jsonb_build_object('id',v_authority.id,'authority_id',v_authority.authority_id,'revision',v_authority.revision),'reason',p_command->'reason','backup_status',p_command->'backup_status','backup_evidence',p_command->'backup_evidence','backup_context_hash',CASE WHEN v_source IS NULL THEN NULL ELSE public.uc_archive_hash(v_source) END,'expert_status',p_command->'expert_status','expert_evidence',p_command->'expert_evidence','expert_context_hash',CASE WHEN v_expert IS NULL THEN NULL ELSE public.uc_archive_hash(v_expert) END);
  ELSE
   IF v_prior.state<>'ready_for_center_approval' OR v_prior.snapshot IS DISTINCT FROM v_snapshot OR NOT public.uc_da_evidence(v_prior,true) THEN PERFORM public.uc_archive_error('APPROVAL_STALE');END IF;
   v_assessment:=v_prior.assessment;
   v_reviewer:=public.uc_archive_authority_current(p_organization_id,(v_assessment->>'actor_id')::uuid,'destruction_reviewer',true);
   IF v_reviewer.id::text IS DISTINCT FROM v_assessment->'authority'->>'id' OR v_reviewer.revision::text IS DISTINCT FROM v_assessment->'authority'->>'revision' THEN PERFORM public.uc_archive_error('APPROVAL_STALE');END IF;
   v_blocks:=public.uc_da_blockers(v_snapshot,v_assessment);IF v_blocks<>'[]'::jsonb THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
   v_decision:=public.uc_archive_decision(p_organization_id,p_command->'decision',true);v_source:=public.uc_archive_org_version(p_organization_id,p_command->'decision'->'evidence',true,true);
   v_people:=v_people||v_reviewer.retained_people||public.uc_archive_people(v_decision->'private_people')||public.uc_archive_people(v_source->'subjects');
   v_centre:=(v_decision-'private_people')||jsonb_build_object('authority',jsonb_build_object('id',v_authority.id,'authority_id',v_authority.authority_id,'revision',v_authority.revision),'evidence_context_hash',public.uc_archive_hash(v_source));
  END IF;
 END IF;
 v_blocks:=public.uc_da_blockers(v_snapshot,v_assessment);v_state:=CASE WHEN v_kind='approve' THEN 'center_approved' WHEN v_blocks='[]'::jsonb THEN 'ready_for_center_approval' ELSE 'blocked_draft' END;
 IF v_kind='approve' AND v_blocks<>'[]'::jsonb THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
 SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id),'{}') INTO v_people FROM unnest(v_people)x(id) WHERE x.id IS NOT NULL;
 PERFORM public.uc_archive_fence(p_organization_id,v_head.scope,v_people,true,p_request_id);
 INSERT INTO public.uc_archive_disposal_act_revisions(id,act_id,revision,prior_id,organization_id,case_id,case_revision,case_state_hash,actor_id,request_id,request_sha256,action_kind,state,snapshot,snapshot_hash,assessment,center_approval,blockers,state_hash,retained_people,created_at)
 VALUES(v_id,v_act,v_revision,v_prior.id,p_organization_id,p_case_id,v_head.revision,v_head.state_hash,auth.uid(),p_request_id,v_req_hash,v_kind,v_state,v_snapshot,public.uc_archive_hash(v_snapshot),v_assessment,v_centre,v_blocks,public.uc_archive_hash(jsonb_build_object('id',v_id,'act_id',v_act,'revision',v_revision,'prior_id',v_prior.id,'organization_id',p_organization_id,'case_id',p_case_id,'case_revision',v_head.revision,'case_state_hash',v_head.state_hash,'actor_id',auth.uid(),'request_id',p_request_id,'created_at',v_now,'state',v_state,'snapshot',v_snapshot,'assessment',v_assessment,'center_approval',v_centre,'blockers',v_blocks)),v_people,v_now) RETURNING * INTO v_row;
 RETURN jsonb_build_object('version',1,'organization_id',p_organization_id,'case_id',p_case_id,'actor_id',auth.uid(),'request_id',p_request_id,'action_kind',v_kind,'replayed',false,'id',v_row.id,'act_id',v_row.act_id,'revision',v_row.revision,'state_hash',v_row.state_hash);
 EXCEPTION WHEN lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END $act$;

-- Preserve every pre-existing archive retention branch; add only new act participants.
CREATE OR REPLACE FUNCTION public.uc_archive_personal_counts(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
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
 UNION ALL
 SELECT 'uc_archive_disposal_act_revisions'::text table_name,count(*)n FROM public.uc_archive_disposal_act_revisions r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 )counts WHERE counts.n>0
$archive$;
DO $private_acl$
DECLARE v_rel regclass;v_kind text;v_owner oid;v_grant record;v_fn record;v_name text;v_col record;BEGIN
 FOREACH v_rel IN ARRAY ARRAY['public.uc_archive_disposal_act_revisions'::regclass,pg_get_serial_sequence('public.uc_archive_disposal_act_revisions','sequence')::regclass] LOOP
  SELECT CASE WHEN c.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,c.relowner INTO v_kind,v_owner FROM pg_class c WHERE c.oid=v_rel;
  FOR v_grant IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(CASE WHEN coalesce(array_length(c.relacl,1),0)=0 THEN acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner) ELSE c.relacl END)a WHERE c.oid=v_rel AND a.grantee<>c.relowner LOOP
   v_name:=CASE WHEN v_grant.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_grant.grantee)) END;EXECUTE format('REVOKE ALL ON %s %s FROM %s',v_kind,v_rel,v_name);
  END LOOP;
  IF v_kind='TABLE' THEN
   FOR v_col IN SELECT a.attname,a.attacl FROM pg_attribute a WHERE a.attrelid=v_rel AND a.attnum>0 AND NOT a.attisdropped AND coalesce(array_length(a.attacl,1),0)>0 LOOP
    FOR v_grant IN SELECT DISTINCT a.grantee FROM aclexplode(v_col.attacl)a WHERE a.grantee<>v_owner LOOP
     v_name:=CASE WHEN v_grant.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_grant.grantee)) END;EXECUTE format('REVOKE ALL (%I) ON TABLE %s FROM %s',v_col.attname,v_rel,v_name);
    END LOOP;
   END LOOP;
  END IF;
 END LOOP;
 FOR v_fn IN SELECT p.oid,p.proname,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('uc_da_snapshot','uc_da_blockers','uc_da_evidence','uc_da_projection','read_archive_disposal_acts','record_archive_disposal_act') LOOP
  FOR v_grant IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(CASE WHEN coalesce(array_length(p.proacl,1),0)=0 THEN acldefault('f',p.proowner) ELSE p.proacl END)a WHERE p.oid=v_fn.oid AND a.grantee<>p.proowner LOOP
   IF v_grant.grantee=0 THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',v_fn.oid::regprocedure);ELSE SELECT rolname INTO v_name FROM pg_roles WHERE oid=v_grant.grantee;EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',v_fn.oid::regprocedure,v_name);END IF;
  END LOOP;
  IF v_fn.proname IN('read_archive_disposal_acts','record_archive_disposal_act') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',v_fn.oid::regprocedure);END IF;
 END LOOP;
END $private_acl$;
COMMENT ON TABLE public.uc_archive_disposal_act_revisions IS 'Immutable documented disposal-act decisions; physical deletion is never authorized; no automatic backup-region or DPA verification.';
COMMIT;
