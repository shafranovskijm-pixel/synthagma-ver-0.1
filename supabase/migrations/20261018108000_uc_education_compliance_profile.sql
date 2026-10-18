-- UC-007/009: explicit declarations, immutable snapshots, no business-data backfill.
-- Applied only inside the reviewed atomic release transaction.
DO $preflight$
BEGIN
 IF EXISTS(SELECT 1 FROM (VALUES
 ('public.account_deletion_access_allowed()','64b0a90b7db9813950ccca6dff208f3a'),
 ('public.uc_document_action_allowed(uuid,text,uuid,uuid)','79c190a053f711dc8110e9d451b1a56c'),
 ('public.uc_document_has_action(uuid,text)','210713a8a6cbd419108e23a7110259cd'),
 ('public.uc_document_scope_allowed(uuid,uuid,uuid)','2a7407e7d178c7561b1d390f0884c6b6'),
 ('public.uc_platform_document_action_allowed(uuid,text)','e5a1436d0cc46218d379c3ffec8c0d0d'),
 ('public.can_access_organization(uuid,text)','2e11495f3d3e6ca261af8a08ed874269'),
 ('public.get_org_staff_permissions(uuid,uuid)','c0ea40b20bbd1a71aa31cdbcbb7fc0b3'),
 ('public.has_org_staff_permission(uuid,uuid,text)','3d1fedafe94778fa19dd47acb71a3782'),
 ('public.has_role(public.app_role,uuid)','20c46f708cc2e7fa51b640290151a59e'),
 ('public.has_role(uuid,public.app_role)','82a7fa1cd06301bb83b010bc315aee0b'),
 ('public.is_org_owner(uuid,uuid)','362aca6afc26c775be594843258b2ab2'),
 ('public.org_role_default_permissions(text)','7aeb1012822cfe0013409ce5b1df1771'),
 ('public.uc_document_teacher_limited(uuid)','72cdbafda69c66500e0d9ae87e8ae403'),
 ('public.normalize_org_staff_permission(text)','bb385c2b288bb966297a8504df1696ea')
 ) AS e(signature,definition_md5) WHERE to_regprocedure(signature) IS NULL
 OR md5(pg_get_functiondef(to_regprocedure(signature)))<>definition_md5) THEN
  RAISE EXCEPTION 'Education profile: unreviewed document access baseline'; END IF;
 IF to_regclass('public.organization_education_profiles') IS NOT NULL
 OR to_regclass('public.organization_education_profile_history') IS NOT NULL
 OR to_regclass('public.organization_document_applicability_decisions') IS NOT NULL
 OR to_regclass('public.organization_document_applicability_history') IS NOT NULL THEN
  RAISE EXCEPTION 'Education profile: unexpected existing persistence'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES
 ('org_documents','id','uuid'),('org_documents','organization_id','uuid'),
 ('org_documents','deleted_at','timestamp with time zone'),('org_documents','current_version_id','uuid'),
 ('org_document_versions','id','uuid'),('org_document_versions','document_id','uuid'),
 ('org_document_versions','organization_id','uuid')
 ) e(t,c,typ) WHERE NOT EXISTS(SELECT 1 FROM information_schema.columns a
 WHERE a.table_schema='public' AND a.table_name=e.t AND a.column_name=e.c AND a.data_type=e.typ)) THEN
  RAISE EXCEPTION 'Education profile: unreviewed evidence schema'; END IF;
END;$preflight$;

CREATE FUNCTION public.uc_empty_education_profile()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT '{"schemaVersion":1,"legalForm":null,"providerKind":null,"educationalActivity":null,"programTypes":null,
 "usesElearning":null,"usesDistanceLearning":null,"paidEducation":null,"hasEmployees":null,"hiresTeachers":null,
 "hasPracticalTraining":null,"usesNetworkForm":null,"servesMinors":null,"servesDisabilities":null,"specialAreas":null,
 "license":{"status":null,"registryNumber":null,"authority":null,"sourceUrl":null,"checkedOn":null,"exemptionReason":null,
 "licensedActivities":null,"evidenceDocumentId":null,"evidenceVersionId":null}}'::jsonb
$fn$;

-- Structural validation only. Neither a supplied URL nor a staff declaration is official verification.
CREATE FUNCTION public.uc_validate_education_profile(p_profile jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE k text; v jsonb; a jsonb; allowed text[]; lic jsonb; d date; authority text; host text; port text; ip inet;
BEGIN
 IF p_profile IS NULL OR jsonb_typeof(p_profile)<>'object'
 OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(p_profile) x)
 IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(public.uc_empty_education_profile()) x)
 OR p_profile->'schemaVersion'<>'1'::jsonb THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_profile_shape'; END IF;
 FOREACH k IN ARRAY ARRAY['educationalActivity','usesElearning','usesDistanceLearning','paidEducation',
 'hasEmployees','hiresTeachers','hasPracticalTraining','usesNetworkForm','servesMinors','servesDisabilities'] LOOP
  IF jsonb_typeof(p_profile->k) NOT IN ('boolean','null') THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_profile_boolean'; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['legalForm','providerKind'] LOOP
  v:=p_profile->k;
  allowed:=CASE k WHEN 'legalForm' THEN ARRAY['legal_entity','individual_entrepreneur']
  ELSE ARRAY['educational_organization','training_unit','entrepreneur_direct','entrepreneur_with_teachers','internal_nonformal'] END;
  IF v<>'null'::jsonb AND (jsonb_typeof(v)<>'string' OR NOT(p_profile->>k=ANY(allowed))) THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_profile_enum'; END IF;
 END LOOP;
 lic:=p_profile->'license';
 IF jsonb_typeof(lic)<>'object'
 OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(lic) x)
 IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(public.uc_empty_education_profile()->'license') x) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_license_shape'; END IF;
 IF lic->'status'<>'null'::jsonb AND (jsonb_typeof(lic->'status')<>'string'
 OR NOT(lic->>'status'=ANY(ARRAY['declared_active','declared_exempt','suspended','terminated']))) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_license_status'; END IF;
 FOREACH k IN ARRAY ARRAY['programTypes','specialAreas','licensedActivities'] LOOP
  a:=CASE WHEN k='licensedActivities' THEN lic->k ELSE p_profile->k END;
  allowed:=CASE WHEN k='specialAreas' THEN ARRAY['medical_pharmaceutical','pedagogical','transport','security','occupational_safety','other_regulated']
  ELSE ARRAY['dpo_upskilling','dpo_retraining','professional_training','internal_nonformal'] END;
  IF a<>'null'::jsonb THEN
   IF jsonb_typeof(a)<>'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_profile_array'; END IF;
   IF jsonb_array_length(a)>cardinality(allowed)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(a) x WHERE jsonb_typeof(x)<>'string' OR NOT(x#>>'{}'=ANY(allowed)))
   OR (SELECT count(*)<>count(DISTINCT x) FROM jsonb_array_elements(a) x) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_profile_array'; END IF;
  END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['registryNumber','authority','sourceUrl','checkedOn','exemptionReason','evidenceDocumentId','evidenceVersionId'] LOOP
  v:=lic->k;
  IF v<>'null'::jsonb AND (jsonb_typeof(v)<>'string' OR lic->>k !~ '[^[:space:]]' OR length(lic->>k)>2000) THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_license_text'; END IF;
 END LOOP;
 IF lic->>'sourceUrl' IS NOT NULL AND (lic->>'sourceUrl' !~* '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$'
 OR lic->>'sourceUrl' ~ '[<>"\\]') THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_license_source_url'; END IF;
 IF lic->>'sourceUrl' IS NOT NULL THEN
  authority:=substring(lic->>'sourceUrl' FROM '(?i)^https://([^/?#]+)');
  BEGIN
   IF left(authority,1)='[' THEN
    IF authority !~ '^\[[0-9a-fA-F:.]+\](:[0-9]{1,5})?$' THEN RAISE EXCEPTION 'authority'; END IF;
    host:=substring(authority FROM '^\[([^]]+)\]');ip:=host::inet;
    IF family(ip)<>6 THEN RAISE EXCEPTION 'address'; END IF;
    port:=substring(authority FROM '\]:([0-9]+)$');
   ELSE
    IF authority !~ '^[[:alnum:]_.-]+(:[0-9]{1,5})?$' THEN RAISE EXCEPTION 'authority'; END IF;
    host:=split_part(authority,':',1);port:=substring(authority FROM ':([0-9]+)$');
    IF host ~ '(^|\.)[0-9]+$' THEN ip:=host::inet;IF family(ip)<>4 THEN RAISE EXCEPTION 'address'; END IF;END IF;
   END IF;
   IF port IS NOT NULL AND port::integer>65535 THEN RAISE EXCEPTION 'port'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_license_source_url';END;
 END IF;
 IF lic->>'checkedOn' IS NOT NULL THEN
  IF lic->>'checkedOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_license_date'; END IF;
  BEGIN d:=(lic->>'checkedOn')::date;
   IF to_char(d,'YYYY-MM-DD')<>lic->>'checkedOn' THEN RAISE EXCEPTION 'date'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_license_date'; END;
 END IF;
 FOREACH k IN ARRAY ARRAY['evidenceDocumentId','evidenceVersionId'] LOOP
  IF lic->>'evidenceDocumentId' IS NULL AND lic->>'evidenceVersionId' IS NOT NULL
  OR lic->>k IS NOT NULL AND lic->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_license_evidence'; END IF;
 END LOOP;
END;$fn$;

CREATE TABLE public.organization_education_profiles(
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
 revision bigint NOT NULL CHECK(revision>0),profile jsonb NOT NULL,
 updated_at timestamptz NOT NULL,updated_by uuid NOT NULL
);
CREATE TABLE public.organization_education_profile_history(
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 revision bigint NOT NULL CHECK(revision>0),previous_revision bigint NOT NULL CHECK(previous_revision=revision-1),
 profile jsonb NOT NULL,request_id uuid NOT NULL,updated_at timestamptz NOT NULL,updated_by uuid NOT NULL,
 PRIMARY KEY(organization_id,revision),UNIQUE(organization_id,request_id)
);
CREATE TABLE public.organization_document_applicability_decisions(
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 requirement_id text NOT NULL,revision bigint NOT NULL CHECK(revision>0),profile_revision bigint NOT NULL CHECK(profile_revision>0),
 catalog_version text NOT NULL,decision text CHECK(decision IN ('not_applicable','applicable')),
 reason text NOT NULL CHECK(length(reason)<=4000 AND reason ~ '[^[:space:]]'),decided_at timestamptz NOT NULL,decided_by uuid NOT NULL,
 PRIMARY KEY(organization_id,requirement_id)
);
CREATE TABLE public.organization_document_applicability_history(
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 requirement_id text NOT NULL,revision bigint NOT NULL CHECK(revision>0),previous_revision bigint NOT NULL CHECK(previous_revision=revision-1),
 profile_revision bigint NOT NULL CHECK(profile_revision>0),profile_snapshot jsonb NOT NULL,
 catalog_version text NOT NULL,decision text CHECK(decision IN ('not_applicable','applicable')),
 reason text NOT NULL CHECK(length(reason)<=4000 AND reason ~ '[^[:space:]]'),request_id uuid NOT NULL,
 decided_at timestamptz NOT NULL,decided_by uuid NOT NULL,
 PRIMARY KEY(organization_id,requirement_id,revision),UNIQUE(organization_id,request_id)
);
COMMENT ON TABLE public.organization_education_profiles IS 'Explicit organization declarations, not official verification. No inferred/backfilled profile.';
COMMENT ON TABLE public.organization_document_applicability_decisions IS 'Reasoned organization declarations; not a legal certification or automatic override of catalog rules. NULL decision is revocation.';

CREATE FUNCTION public.uc_guard_compliance_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 -- Preserve the existing organization-deletion cascade, never allow standalone history edits.
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=OLD.organization_id) THEN RETURN OLD; END IF;
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='compliance_history_immutable';
END;$fn$;
CREATE TRIGGER uc_education_profile_history_immutable BEFORE UPDATE OR DELETE
 ON public.organization_education_profile_history FOR EACH ROW EXECUTE FUNCTION public.uc_guard_compliance_history();
CREATE TRIGGER uc_applicability_history_immutable BEFORE UPDATE OR DELETE
 ON public.organization_document_applicability_history FOR EACH ROW EXECUTE FUNCTION public.uc_guard_compliance_history();

DO $rls$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['organization_education_profiles','organization_education_profile_history',
 'organization_document_applicability_decisions','organization_document_applicability_history'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY uc_compliance_read ON public.%I FOR SELECT TO authenticated USING(public.uc_document_action_allowed(organization_id,''read'',NULL,NULL))',t);
  EXECUTE format('CREATE POLICY uc_compliance_active_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(auth.uid() IS NOT NULL AND public.uc_document_action_allowed(organization_id,''read'',NULL,NULL)) WITH CHECK(false)',t);
 END LOOP;
END;$rls$;

CREATE FUNCTION public.get_organization_education_profile(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE r public.organization_education_profiles%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.uc_document_action_allowed(p_organization_id,'read',NULL,NULL),false) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='education_profile_access_denied'; END IF;
 SELECT * INTO r FROM public.organization_education_profiles WHERE organization_id=p_organization_id;
 IF FOUND THEN RETURN to_jsonb(r); END IF;
 RETURN jsonb_build_object('organization_id',p_organization_id,'revision',0,'profile',public.uc_empty_education_profile(),'updated_at',NULL,'updated_by',NULL);
END;$fn$;

CREATE FUNCTION public.save_organization_education_profile(p_organization_id uuid,p_expected_revision bigint,p_profile jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE prior public.organization_education_profile_history%ROWTYPE; r public.organization_education_profiles%ROWTYPE;
 v_current bigint; doc uuid; ver uuid; current_ver uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.uc_document_action_allowed(p_organization_id,'write',NULL,NULL),false) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='education_profile_access_denied'; END IF;
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_education_profile_request'; END IF;
 PERFORM public.uc_validate_education_profile(p_profile);
 PERFORM pg_advisory_xact_lock(hashtextextended('uc-compliance:'||p_organization_id::text,0));
 IF NOT coalesce(public.uc_document_action_allowed(p_organization_id,'write',NULL,NULL),false) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='education_profile_access_denied'; END IF;
 SELECT * INTO prior FROM public.organization_education_profile_history WHERE organization_id=p_organization_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.updated_by<>auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='education_profile_request_actor_mismatch'; END IF;
  IF prior.previous_revision<>p_expected_revision OR prior.profile IS DISTINCT FROM p_profile THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='education_profile_request_reused'; END IF;
  RETURN jsonb_build_object('organization_id',prior.organization_id,'revision',prior.revision,'profile',prior.profile,'updated_at',prior.updated_at,'updated_by',prior.updated_by);
 END IF;
 SELECT revision INTO v_current FROM public.organization_education_profiles WHERE organization_id=p_organization_id FOR UPDATE;
 IF coalesce(v_current,0)<>p_expected_revision THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='education_profile_revision_conflict'; END IF;
 doc:=(p_profile#>>'{license,evidenceDocumentId}')::uuid;ver:=(p_profile#>>'{license,evidenceVersionId}')::uuid;
 IF doc IS NOT NULL THEN
  SELECT current_version_id INTO current_ver FROM public.org_documents WHERE id=doc AND organization_id=p_organization_id AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND OR (ver IS NULL AND current_ver IS NOT NULL) THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='education_profile_evidence_mismatch'; END IF;
  IF ver IS NOT NULL THEN
   PERFORM 1 FROM public.org_document_versions WHERE id=ver AND document_id=doc AND organization_id=p_organization_id FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='education_profile_evidence_mismatch'; END IF;
  END IF;
 END IF;
 INSERT INTO public.organization_education_profiles(organization_id,revision,profile,updated_at,updated_by)
 VALUES(p_organization_id,p_expected_revision+1,p_profile,clock_timestamp(),auth.uid())
 ON CONFLICT(organization_id) DO UPDATE SET revision=EXCLUDED.revision,profile=EXCLUDED.profile,updated_at=EXCLUDED.updated_at,updated_by=EXCLUDED.updated_by RETURNING * INTO r;
 INSERT INTO public.organization_education_profile_history(organization_id,revision,previous_revision,profile,request_id,updated_at,updated_by)
 VALUES(r.organization_id,r.revision,p_expected_revision,r.profile,p_request_id,r.updated_at,r.updated_by);
 RETURN to_jsonb(r);
END;$fn$;

CREATE FUNCTION public.list_organization_education_profile_history(p_organization_id uuid,p_limit integer DEFAULT 25,p_before_revision bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.uc_document_action_allowed(p_organization_id,'read',NULL,NULL),false) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='education_profile_access_denied'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_before_revision IS NOT NULL AND p_before_revision<1 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_compliance_history_page'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY revision DESC),'[]'::jsonb) FROM
 (SELECT organization_id,revision,profile,updated_at,updated_by FROM public.organization_education_profile_history
 WHERE organization_id=p_organization_id AND (p_before_revision IS NULL OR revision<p_before_revision) ORDER BY revision DESC LIMIT p_limit) x);
END;$fn$;

CREATE FUNCTION public.uc_validate_applicability_key(p_requirement_id text,p_catalog_version text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
BEGIN
 IF p_catalog_version IS DISTINCT FROM 'uc-requirements-2026-10-18-v1' OR p_requirement_id IS NULL
 OR NOT(p_requirement_id=ANY(ARRAY['charter','license','registration','admission_rules','edu_activity_order','attestation_rules',
 'edu_relations','expulsion_rules','program_dev_rules','vsoko','elearning_rules','practice_rules','qualification_issuance','credit_rules',
 'salary_rules','pedagogical_council','paid_services','personal_data','electronic_docs_rules','program_approval','schedule_approval',
 'commission_orders','doc_forms_approval','electronic_docs_order','self_examination_report','enrollment_order','expulsion_order',
 'attestation_protocol','certificate_qualification','diploma_retraining','testimonial_profession','testimonial_position'])) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_applicability_catalog_key'; END IF;
END;$fn$;

CREATE FUNCTION public.list_organization_document_applicability_decisions(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.uc_document_action_allowed(p_organization_id,'read',NULL,NULL),false) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='education_profile_access_denied'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY requirement_id),'[]'::jsonb)
 FROM public.organization_document_applicability_decisions d WHERE organization_id=p_organization_id);
END;$fn$;

CREATE FUNCTION public.save_organization_document_applicability_decision(p_organization_id uuid,p_requirement_id text,p_expected_revision bigint,
 p_profile_revision bigint,p_catalog_version text,p_decision text,p_reason text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE prior public.organization_document_applicability_history%ROWTYPE;
 r public.organization_document_applicability_decisions%ROWTYPE; prof public.organization_education_profiles%ROWTYPE; v_current bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.uc_document_action_allowed(p_organization_id,'write',NULL,NULL),false) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='education_profile_access_denied'; END IF;
 PERFORM public.uc_validate_applicability_key(p_requirement_id,p_catalog_version);
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_profile_revision IS NULL OR p_profile_revision<1
 OR p_decision IS NOT NULL AND p_decision NOT IN ('not_applicable','applicable')
 OR p_reason IS NULL OR p_reason !~ '[^[:space:]]' OR length(p_reason)>4000 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_applicability_decision_request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('uc-compliance:'||p_organization_id::text,0));
 IF NOT coalesce(public.uc_document_action_allowed(p_organization_id,'write',NULL,NULL),false) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='education_profile_access_denied'; END IF;
 SELECT * INTO prior FROM public.organization_document_applicability_history WHERE organization_id=p_organization_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.decided_by<>auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='applicability_request_actor_mismatch'; END IF;
  IF prior.requirement_id<>p_requirement_id OR prior.previous_revision<>p_expected_revision OR prior.profile_revision<>p_profile_revision
  OR prior.catalog_version<>p_catalog_version OR prior.decision IS DISTINCT FROM p_decision OR prior.reason IS DISTINCT FROM p_reason THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='applicability_request_reused'; END IF;
  RETURN to_jsonb(prior)-ARRAY['previous_revision','request_id','profile_snapshot'];
 END IF;
 SELECT * INTO prof FROM public.organization_education_profiles WHERE organization_id=p_organization_id FOR SHARE;
 IF NOT FOUND OR prof.revision<>p_profile_revision THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='applicability_profile_revision_conflict'; END IF;
 SELECT revision INTO v_current FROM public.organization_document_applicability_decisions
 WHERE organization_id=p_organization_id AND requirement_id=p_requirement_id FOR UPDATE;
 IF coalesce(v_current,0)<>p_expected_revision THEN
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='applicability_revision_conflict'; END IF;
 INSERT INTO public.organization_document_applicability_decisions(organization_id,requirement_id,revision,profile_revision,catalog_version,decision,reason,decided_at,decided_by)
 VALUES(p_organization_id,p_requirement_id,p_expected_revision+1,p_profile_revision,p_catalog_version,p_decision,p_reason,clock_timestamp(),auth.uid())
 ON CONFLICT(organization_id,requirement_id) DO UPDATE SET revision=EXCLUDED.revision,profile_revision=EXCLUDED.profile_revision,
 catalog_version=EXCLUDED.catalog_version,decision=EXCLUDED.decision,reason=EXCLUDED.reason,decided_at=EXCLUDED.decided_at,decided_by=EXCLUDED.decided_by RETURNING * INTO r;
 INSERT INTO public.organization_document_applicability_history(organization_id,requirement_id,revision,previous_revision,profile_revision,profile_snapshot,catalog_version,decision,reason,request_id,decided_at,decided_by)
 VALUES(r.organization_id,r.requirement_id,r.revision,p_expected_revision,r.profile_revision,prof.profile,r.catalog_version,r.decision,r.reason,p_request_id,r.decided_at,r.decided_by);
 RETURN to_jsonb(r);
END;$fn$;

CREATE FUNCTION public.list_organization_document_applicability_history(p_organization_id uuid,p_requirement_id text,p_limit integer DEFAULT 25,p_before_revision bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.uc_document_action_allowed(p_organization_id,'read',NULL,NULL),false) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='education_profile_access_denied'; END IF;
 IF p_requirement_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_before_revision IS NOT NULL AND p_before_revision<1 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_compliance_history_page'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)-ARRAY['previous_revision','request_id'] ORDER BY revision DESC),'[]'::jsonb) FROM
 (SELECT * FROM public.organization_document_applicability_history WHERE organization_id=p_organization_id AND requirement_id=p_requirement_id
 AND (p_before_revision IS NULL OR revision<p_before_revision) ORDER BY revision DESC LIMIT p_limit) x);
END;$fn$;

REVOKE ALL ON FUNCTION public.uc_empty_education_profile(),public.uc_validate_education_profile(jsonb),
 public.uc_guard_compliance_history(),public.uc_validate_applicability_key(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_organization_education_profile(uuid),
 public.save_organization_education_profile(uuid,bigint,jsonb,uuid),public.list_organization_education_profile_history(uuid,integer,bigint),
 public.list_organization_document_applicability_decisions(uuid),
 public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid),
 public.list_organization_document_applicability_history(uuid,text,integer,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_organization_education_profile(uuid),
 public.save_organization_education_profile(uuid,bigint,jsonb,uuid),public.list_organization_education_profile_history(uuid,integer,bigint),
 public.list_organization_document_applicability_decisions(uuid),
 public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid),
 public.list_organization_document_applicability_history(uuid,text,integer,bigint) TO authenticated;

DO $postflight$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['organization_education_profiles','organization_education_profile_history',
 'organization_document_applicability_decisions','organization_document_applicability_history'] LOOP
  IF EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||t)::regclass AND NOT relrowsecurity)
  OR has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE')
  OR has_table_privilege('service_role','public.'||t,'INSERT,UPDATE,DELETE') THEN
   RAISE EXCEPTION 'Education profile: unexpected persistence privileges'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.organization_education_profiles) OR EXISTS(SELECT 1 FROM public.organization_education_profile_history)
 OR EXISTS(SELECT 1 FROM public.organization_document_applicability_decisions) OR EXISTS(SELECT 1 FROM public.organization_document_applicability_history) THEN
  RAISE EXCEPTION 'Education profile: unexpected inferred/backfilled rows'; END IF;
END;$postflight$;

