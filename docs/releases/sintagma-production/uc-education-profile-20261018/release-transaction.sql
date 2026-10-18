-- Generated UC007/009 plus signature file provenance; Edge first, then this atomic SQL. Submit this ENTIRE file in ONE request.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $assert$ DECLARE r jsonb;BEGIN SELECT to_jsonb(q) INTO r FROM (-- Read-only deployment preflight; no personal data or scheduled credentials returned.
SELECT
 (SELECT count(*)=8 FROM supabase_migrations.schema_migrations WHERE (version='20261018100000' AND name='uc_document_access_boundaries' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='455f5c4069200f225124bfd58adc948c') OR (version='20261018101000' AND name='uc_signature_integrity' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='1a7d1d39332388314cc8ebf0eaaef885') OR (version='20261018102000' AND name='uc_document_versions' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='485580713e67f5bbf40210836f757a8b') OR (version='20261018103000' AND name='uc_document_cleanup_scheduler' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='5d690c2e4284a79f12901a7deabdf736') OR (version='20261018104000' AND name='uc_document_staff_scope' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='c5d0538638fbaf0343612c13e7583510') OR (version='20261018105000' AND name='uc_document_action_permissions' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='6563e5305b0ea46bfead8f8098af4e3f') OR (version='20261018106000' AND name='uc_gorel_draft_caller' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='8e953d5f20050d66ead5454349445b7a') OR (version='20261018107000' AND name='uc_document_reminder_scheduler' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='612d9b242bae5289b34b8598fc1361e4')) AS exact_prior_ledger,
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN('20261018108000','20261018109000')) AS migration_absent,
 to_regclass('public.organization_education_profiles') IS NULL AND to_regclass('public.organization_education_profile_history') IS NULL AND to_regclass('public.organization_document_applicability_decisions') IS NULL AND to_regclass('public.organization_document_applicability_history') IS NULL AND to_regclass('public.uc_signature_file_requests') IS NULL AS new_state_absent,
 NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('uc_empty_education_profile','uc_validate_education_profile','uc_guard_compliance_history','uc_validate_applicability_key','get_organization_education_profile','save_organization_education_profile','list_organization_education_profile_history','list_organization_document_applicability_decisions','save_organization_document_applicability_decision','list_organization_document_applicability_history','uc_signature_locator_key','uc_signature_canonical_file','uc_signature_object_uploader','uc_signature_object_bound','uc_signature_file_scope','uc_guard_signature_file_provenance','create_external_contract_signature_v2','add_signature_revision_v2','uc_signature_file_context')) AS new_functions_absent,
 coalesce(md5(pg_get_functiondef(to_regprocedure('public.account_deletion_access_allowed()')))='64b0a90b7db9813950ccca6dff208f3a',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_document_action_allowed(uuid,text,uuid,uuid)')))='79c190a053f711dc8110e9d451b1a56c',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_document_has_action(uuid,text)')))='210713a8a6cbd419108e23a7110259cd',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_document_scope_allowed(uuid,uuid,uuid)')))='2a7407e7d178c7561b1d390f0884c6b6',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_platform_document_action_allowed(uuid,text)')))='e5a1436d0cc46218d379c3ffec8c0d0d',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.can_access_organization(uuid,text)')))='2e11495f3d3e6ca261af8a08ed874269',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.get_org_staff_permissions(uuid,uuid)')))='c0ea40b20bbd1a71aa31cdbcbb7fc0b3',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.has_org_staff_permission(uuid,uuid,text)')))='3d1fedafe94778fa19dd47acb71a3782',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.has_role(app_role,uuid)')))='20c46f708cc2e7fa51b640290151a59e',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.has_role(uuid,app_role)')))='82a7fa1cd06301bb83b010bc315aee0b',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.is_org_owner(uuid,uuid)')))='362aca6afc26c775be594843258b2ab2',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.org_role_default_permissions(text)')))='7aeb1012822cfe0013409ce5b1df1771',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_document_teacher_limited(uuid)')))='72cdbafda69c66500e0d9ae87e8ae403',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.normalize_org_staff_permission(text)')))='bb385c2b288bb966297a8504df1696ea',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_token_access_allowed(uuid,boolean)')))='d53d282e50b51ab83682444301fe6fed',false) AS exact_access_dependencies,
 coalesce(md5(pg_get_functiondef(to_regprocedure('public.add_signature_revision(uuid,text,text,text,text,text)')))='1781b4727399ddaabce71b145984a071',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.create_external_contract_signature(text,text,text,text,text,text,text)')))='fe172bc95fb6a8ddb5eaff04a91ae3c1',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.create_external_contract_signature(text,text,text,text,text,text,text,uuid)')))='3527f470623efd2f043eedf9cbfe4700',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_document_storage_scope(text,text)')))='22fe1f060a238b9f871c280b1416dcf9',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_signature_integrity()')))='fdd8e690f722d046c7782c64e48f6949',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_signature_revision()')))='13d7a54f91c28c26db9628543b8fea9f',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_storage_read(text,text)')))='a28e130e506297b006d9c6a24d5b6379',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_storage_write(text,text)')))='946e9cc620dadad5eafa02f0e04106a2',false) AS exact_file_dependencies,
 (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='storage' AND table_name='objects' AND ((column_name='owner' AND data_type='uuid') OR (column_name='owner_id' AND data_type='text'))) AS storage_uploader_schema,
 (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('student_group_memberships_effective','student_group_profiles_effective') AND 'security_invoker=true'=ANY(c.reloptions)) AS membership_views_invoker,
 (SELECT count(*)=2 FROM storage.buckets WHERE id IN('external-contracts','signed-documents') AND NOT public) AS signature_buckets_private) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'UC profile preflight failed: %',r;END IF;END $assert$;
LOCK TABLE public.org_documents,public.incoming_documents,public.education_document_records,public.document_issuance_log,public.program_documents,public.program_folders,public.program_categories,public.program_training_plans,public.frdo_signed_documents,public.student_documents,public.student_identity_documents,public.company_documents,public.group_documents,public.document_signatures,public.signature_revisions,public.signature_comments,public.pep_agreements,public.org_document_versions,public.document_number_sequences,public.organizations,public.profiles,public.companies,public.enrollments,storage.objects,storage.buckets,public.org_staff,public.admin_staff,public.user_roles,public.courses,public.lessons,public.student_groups,public.student_group_memberships,public.enrollment_history,public.test_attempts,public.lesson_progress,public.student_frdo_data,public.journal_instances,public.journal_entries,public.group_class_journal_marks,public.org_contracts,public.goreltech_document_operations,public.org_staff_document_groups,public.org_staff_document_scopes,public.org_staff_document_scope_events,public.uc_goreltech_document_stages IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE uc_profile_before(table_name text PRIMARY KEY,row_count bigint,row_hash text) ON COMMIT DROP;
CREATE TEMP TABLE uc_profile_policies_before ON COMMIT DROP AS SELECT * FROM pg_policies WHERE schemaname IN('public','storage');
CREATE TEMP TABLE uc_profile_functions_before ON COMMIT DROP AS
 SELECT p.oid,md5(pg_get_functiondef(p.oid)) definition_hash,p.proowner,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN('f','p');
CREATE TEMP TABLE uc_profile_cron_before ON COMMIT DROP AS SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j;
DO $snapshot$ DECLARE t text;n bigint;h text;BEGIN
 FOREACH t IN ARRAY ARRAY['public.org_documents','public.incoming_documents','public.education_document_records','public.document_issuance_log','public.program_documents','public.program_folders','public.program_categories','public.program_training_plans','public.frdo_signed_documents','public.student_documents','public.student_identity_documents','public.company_documents','public.group_documents','public.document_signatures','public.signature_revisions','public.signature_comments','public.pep_agreements','public.org_document_versions','public.document_number_sequences','public.organizations','public.profiles','public.companies','public.enrollments','storage.objects','storage.buckets','public.org_staff','public.admin_staff','public.user_roles','public.courses','public.lessons','public.student_groups','public.student_group_memberships','public.enrollment_history','public.test_attempts','public.lesson_progress','public.student_frdo_data','public.journal_instances','public.journal_entries','public.group_class_journal_marks','public.org_contracts','public.goreltech_document_operations','public.org_staff_document_groups','public.org_staff_document_scopes','public.org_staff_document_scope_events','public.uc_goreltech_document_stages'] LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(r)::text,E''\n'' ORDER BY to_jsonb(r)::text),'''')) FROM %s r',t) INTO n,h;
 INSERT INTO uc_profile_before VALUES(t,n,h);END LOOP;END $snapshot$;
DO $migration$ DECLARE source text:=$source_20261018108000$-- UC-007/009: explicit declarations, immutable snapshots, no business-data backfill.
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

$source_20261018108000$;BEGIN
 IF md5(source)<>'a840381f437b4529d13a466636acf512' THEN RAISE EXCEPTION 'Source hash mismatch 20261018108000';END IF;
 EXECUTE source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261018108000','uc_education_compliance_profile',ARRAY[source]);
END $migration$;
DO $migration$ DECLARE source text:=$source_20261018109000$-- UC-007/009 companion: token previews and exact signature-owned file provenance.
-- No existing business rows, files, signatures, revisions or permission JSON are rewritten.
DO $preflight$
BEGIN
 IF to_regprocedure('public.uc_signature_file_context(text,text,uuid)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM (VALUES
  ('public.uc_signature_token_access_allowed(uuid,boolean)','d53d282e50b51ab83682444301fe6fed'),
  ('public.uc_document_storage_scope(text,text)','22fe1f060a238b9f871c280b1416dcf9'),
  ('public.uc_signature_storage_read(text,text)','a28e130e506297b006d9c6a24d5b6379'),
  ('public.uc_signature_storage_write(text,text)','946e9cc620dadad5eafa02f0e04106a2'),
  ('public.uc_guard_signature_revision()','13d7a54f91c28c26db9628543b8fea9f'),
  ('public.uc_guard_signature_integrity()','fdd8e690f722d046c7782c64e48f6949'),
  ('public.create_external_contract_signature(text,text,text,text,text,text,text,uuid)','3527f470623efd2f043eedf9cbfe4700'),
  ('public.add_signature_revision(uuid,text,text,text,text,text)','1781b4727399ddaabce71b145984a071')
 ) expected(signature,hash) WHERE to_regprocedure(signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>hash)
 OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='storage' AND table_name='objects' AND column_name='owner_id' AND data_type='text')
 THEN RAISE EXCEPTION 'Signature files: unreviewed provenance baseline'; END IF;
END;$preflight$;

CREATE TABLE public.uc_signature_file_requests(
 request_id uuid PRIMARY KEY,request_kind text NOT NULL CHECK(request_kind IN('create','revision')),
 signature_id uuid NOT NULL,actor_id uuid NOT NULL,request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 revision_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.uc_signature_file_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uc_signature_file_requests FROM PUBLIC,anon,authenticated,service_role;

-- Parse a locator only; never fetch its URL. The Edge additionally requires the exact project origin.
-- New writes use raw keys. Percent-encoded/ambiguous path aliases are intentionally not accepted.
CREATE FUNCTION public.uc_signature_locator_key(p_locator text,p_bucket text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE v text; m text[];
BEGIN
 IF p_bucket NOT IN('external-contracts','signed-documents') OR p_locator IS NULL OR length(p_locator)>4000 THEN RETURN NULL; END IF;
 v:=p_locator;
 IF v ~* '^https://' THEN
  m:=regexp_match(v,'^https://[^/@?#[:space:]]+/storage/v1/object/(public|sign|authenticated)/'||p_bucket||'/([^?#]+)([?][^#]*)?$','i');
  IF m IS NULL THEN RETURN NULL; END IF; v:=m[2];
 END IF;
 IF v='' OR v ~ '[%?#\\[:cntrl:]]' OR v ~ '(^|/)([.]|[.][.]|)(/|$)' OR left(v,1)='/' THEN RETURN NULL; END IF;
 RETURN v;
END;$fn$;

CREATE FUNCTION public.uc_signature_canonical_file(p_org uuid,p_signature uuid,p_path text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
 SELECT coalesce(p_path ~ ('^'||p_org::text||'/signature-files/'||p_signature::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][a-z0-9]{1,10}$'),false)
$fn$;
CREATE FUNCTION public.uc_signature_object_uploader(p_bucket text,p_path text,p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_user IS NOT NULL AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path
  AND (o.owner=p_user OR o.owner_id=p_user::text)
  AND (o.owner IS NULL OR o.owner=p_user)
  AND (nullif(o.owner_id,'') IS NULL OR o.owner_id=p_user::text))
$fn$;
CREATE FUNCTION public.uc_signature_object_bound(p_signature uuid,p_bucket text,p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=p_signature AND s.deleted_at IS NULL AND (
  p_bucket='external-contracts' AND public.uc_signature_canonical_file(s.organization_id,s.id,p_path) AND (
   EXISTS(SELECT 1 FROM public.signature_revisions r WHERE r.signature_id=s.id
     AND public.uc_signature_locator_key(r.file_url,p_bucket)=p_path
     AND public.uc_signature_object_uploader(p_bucket,p_path,r.created_by))
   OR public.uc_signature_locator_key(s.document_snapshot_url,p_bucket)=p_path
     AND public.uc_signature_object_uploader(p_bucket,p_path,s.sender_user_id))
  OR p_bucket='external-contracts' AND s.handwritten_scan_path=p_path
   AND p_path ~ ('^'||s.organization_id::text||'/signed-scans/'||s.id::text||'-[a-zA-Z0-9._-]+$')
   AND s.status='signed' AND s.handwritten_scan_hash ~ '^[0-9a-f]{64}$'
   AND public.uc_signature_object_uploader(p_bucket,p_path,s.recipient_user_id)
  OR p_bucket='signed-documents' AND s.signed_document_path=p_path AND s.status='signed'
   AND p_path=s.organization_id::text||'/certificates/'||s.id::text||'.html'
   AND s.certificate_hash ~ '^[0-9a-f]{64}$'
   AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path)))
$fn$;

-- File scope is separate from permissive read/write grants. A mutable reference
-- never turns another signature's object into this group's object.
CREATE FUNCTION public.uc_signature_file_scope(p_bucket text,p_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_org uuid;v_signature uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN RETURN false; END IF;
 v_org:=public.storage_try_uuid(split_part(p_path,'/',1));
 IF v_org IS NULL THEN RETURN false; END IF;
 -- Retain authenticated organization-wide access to historical objects. This
 -- cannot be used by the public token broker or by an assigned-group teacher.
 IF public.uc_document_scope_allowed(v_org,NULL,NULL) THEN RETURN true; END IF;
 IF EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.organization_id=v_org
   AND public.uc_document_signature_read_scope(s.id)
   AND public.uc_signature_object_bound(s.id,p_bucket,p_path)) THEN RETURN true; END IF;
 IF p_bucket='external-contracts' AND split_part(p_path,'/',2)='signature-files' THEN
  v_signature:=public.storage_try_uuid(split_part(p_path,'/',3));
  RETURN EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.id=v_signature AND s.organization_id=v_org
   AND s.deleted_at IS NULL AND s.expires_at>now() AND s.status IN('draft','sent','viewed','in_review','changes_requested')
   AND public.uc_signature_canonical_file(v_org,s.id,p_path) AND public.uc_signature_actor_allowed(s.id,true,true)
   AND (NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path)
    OR public.uc_signature_object_uploader(p_bucket,p_path,auth.uid())));
 END IF;
 RETURN p_bucket='external-contracts' AND EXISTS(SELECT 1 FROM public.document_signatures s
  WHERE s.organization_id=v_org AND s.recipient_user_id=auth.uid() AND s.deleted_at IS NULL AND s.expires_at>now()
   AND s.status IN('sent','viewed','in_review')
   AND p_path ~ ('^'||v_org::text||'/signed-scans/'||s.id::text||'-[a-zA-Z0-9._-]+$')
   AND (NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path)
    OR public.uc_signature_object_uploader(p_bucket,p_path,auth.uid())));
END;$fn$;

DO $storage_scope$ DECLARE source text;needle text;replacement text;
BEGIN
 source:=pg_get_functiondef('public.uc_document_storage_scope(text,text)'::regprocedure);
 needle:='BEGIN'||chr(10);
 replacement:=replace(source,needle,needle||
  ' IF p_bucket IN(''external-contracts'',''signed-documents'') THEN RETURN public.uc_signature_file_scope(p_bucket,p_name); END IF;'||chr(10));
 IF source=replacement THEN RAISE EXCEPTION 'Unreviewed storage scope entry'; END IF;
 EXECUTE replacement;
END;$storage_scope$;
CREATE OR REPLACE FUNCTION public.uc_signature_storage_read(p_bucket text,p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.account_deletion_access_allowed() AND (
  EXISTS(SELECT 1 FROM public.organizations o WHERE o.id::text=split_part(p_name,'/',1)
   AND public.uc_document_action_allowed(o.id,'read',NULL,NULL))
  OR EXISTS(SELECT 1 FROM public.document_signatures s WHERE s.organization_id::text=split_part(p_name,'/',1)
   AND public.uc_signature_actor_allowed(s.id,false,true) AND public.uc_document_signature_read_scope(s.id)
   AND public.uc_signature_object_bound(s.id,p_bucket,p_name))
  OR p_bucket='external-contracts' AND split_part(p_name,'/',2)='signature-files'
   AND public.uc_signature_object_uploader(p_bucket,p_name,auth.uid()) AND public.uc_signature_file_scope(p_bucket,p_name))
$fn$;
-- Preserve all original referenced-file immutability checks and add only an
-- existing participant's canonical revision staging path.
DO $storage_write$ DECLARE source text;needle text;replacement text;
BEGIN
 source:=pg_get_functiondef('public.uc_signature_storage_write(text,text)'::regprocedure);
 needle:='AND (EXISTS(SELECT 1 FROM public.organizations o';
 replacement:=replace(source,needle,
  'AND ((p_bucket=''external-contracts'' AND EXISTS(SELECT 1 FROM public.document_signatures s WHERE '||
  's.id=public.storage_try_uuid(split_part(p_name,''/'',3)) AND s.deleted_at IS NULL AND s.expires_at>now() '||
  'AND s.status IN(''draft'',''sent'',''viewed'',''in_review'',''changes_requested'') '||
  'AND public.uc_signature_canonical_file(s.organization_id,s.id,p_name) AND public.uc_signature_actor_allowed(s.id,true,true))) '||
  'OR EXISTS(SELECT 1 FROM public.organizations o');
 IF source=replacement THEN RAISE EXCEPTION 'Unreviewed storage write entry'; END IF;
 EXECUTE replacement;
END;$storage_write$;
-- Staged canonical bytes are append-only even before a revision references them.
CREATE POLICY uc_signature_namespace_immutable_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'external-contracts' OR split_part(name,'/',2)<>'signature-files')
 WITH CHECK(bucket_id<>'external-contracts' OR split_part(name,'/',2)<>'signature-files');
CREATE POLICY uc_signature_namespace_immutable_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'external-contracts' OR split_part(name,'/',2)<>'signature-files');
CREATE POLICY uc_signature_namespace_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'external-contracts' OR (
  (owner=auth.uid() OR owner_id=auth.uid()::text)
  AND (owner IS NULL OR owner=auth.uid()) AND (nullif(owner_id,'') IS NULL OR owner_id=auth.uid()::text)
  AND (public.uc_signature_canonical_file(public.storage_try_uuid(split_part(name,'/',1)),public.storage_try_uuid(split_part(name,'/',3)),name)
   OR split_part(name,'/',2)='signed-scans')));

CREATE FUNCTION public.uc_guard_signature_file_provenance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE;v_path text;r public.signature_revisions%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='signature_revisions' THEN
  IF TG_OP='INSERT' AND (auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid())
    AND NOT (auth.role()='service_role' AND nullif(NEW.file_url,'') IS NULL) THEN
   RAISE EXCEPTION 'Revision uploader must be the authenticated actor' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' AND nullif(NEW.file_url,'') IS NOT NULL THEN
   SELECT * INTO s FROM public.document_signatures WHERE id=NEW.signature_id;
   IF NOT FOUND OR NOT public.uc_signature_canonical_file(s.organization_id,s.id,NEW.file_url)
    OR NOT public.uc_signature_object_uploader('external-contracts',NEW.file_url,NEW.created_by) THEN
    RAISE EXCEPTION 'Revision file provenance is not verified' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='INSERT' AND NEW.handwritten_scan_path IS NOT NULL THEN
  RAISE EXCEPTION 'Use atomic signature finalization' USING ERRCODE='42501'; END IF;
 IF nullif(NEW.document_snapshot_url,'') IS NOT NULL AND
  (TG_OP='INSERT' OR NEW.document_snapshot_url IS DISTINCT FROM OLD.document_snapshot_url) THEN
  IF NOT public.uc_signature_canonical_file(NEW.organization_id,NEW.id,NEW.document_snapshot_url)
   OR NOT public.uc_signature_object_uploader('external-contracts',NEW.document_snapshot_url,NEW.sender_user_id) THEN
   RAISE EXCEPTION 'Snapshot file provenance is not verified' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id AND NEW.current_revision_id IS NOT NULL THEN
  SELECT * INTO r FROM public.signature_revisions WHERE id=NEW.current_revision_id AND signature_id=NEW.id;
  IF NOT FOUND OR nullif(r.file_url,'') IS NOT NULL AND
   (NOT public.uc_signature_canonical_file(NEW.organization_id,NEW.id,public.uc_signature_locator_key(r.file_url,'external-contracts'))
    OR NOT public.uc_signature_object_uploader('external-contracts',public.uc_signature_locator_key(r.file_url,'external-contracts'),r.created_by)) THEN
   RAISE EXCEPTION 'Current revision file provenance is not verified' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.signed_source_path IS DISTINCT FROM OLD.signed_source_path AND NEW.signed_source_path IS NOT NULL THEN
  SELECT * INTO r FROM public.signature_revisions WHERE id=NEW.signed_revision_id AND signature_id=NEW.id;
  IF NOT FOUND OR NEW.signed_source_bucket<>'external-contracts'
   OR public.uc_signature_locator_key(r.file_url,'external-contracts') IS DISTINCT FROM NEW.signed_source_path
   OR NOT public.uc_signature_canonical_file(NEW.organization_id,NEW.id,NEW.signed_source_path)
   OR NOT public.uc_signature_object_uploader('external-contracts',NEW.signed_source_path,r.created_by) THEN
   RAISE EXCEPTION 'Signed source provenance is not verified' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.handwritten_scan_path IS DISTINCT FROM OLD.handwritten_scan_path AND NEW.handwritten_scan_path IS NOT NULL THEN
  IF NEW.handwritten_scan_path !~ ('^'||NEW.organization_id::text||'/signed-scans/'||NEW.id::text||'-[a-zA-Z0-9._-]+$')
   OR NOT public.uc_signature_object_uploader('external-contracts',NEW.handwritten_scan_path,NEW.recipient_user_id) THEN
   RAISE EXCEPTION 'Signed scan provenance is not verified' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END;$fn$;
CREATE TRIGGER uc_signature_file_provenance BEFORE INSERT OR UPDATE ON public.document_signatures
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_signature_file_provenance();
CREATE TRIGGER uc_revision_file_provenance BEFORE INSERT OR UPDATE ON public.signature_revisions
 FOR EACH ROW EXECUTE FUNCTION public.uc_guard_signature_file_provenance();

-- A UUID is generated before upload. Lost-response retries reuse it and the
-- exact original request; they never create a second invitation or revision.
CREATE FUNCTION public.create_external_contract_signature_v2(
 p_signature_id uuid,p_file_url text,p_file_name text,p_file_mime text,p_document_title text,p_admin_email text,
 p_admin_name text DEFAULT 'Администратор Синтагма',p_summary text DEFAULT NULL,p_organization_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_org uuid:=p_organization_id;v_actor uuid:=auth.uid();v_name text;v_revision uuid;s public.document_signatures%ROWTYPE;
 q public.uc_signature_file_requests%ROWTYPE;v_request_hash text;
BEGIN
 IF v_actor IS NULL OR NOT public.account_deletion_access_allowed() OR p_signature_id IS NULL OR v_org IS NULL
  OR NOT(public.uc_document_action_allowed(v_org,'write',NULL,NULL) OR public.uc_document_commercial_creation_allowed(v_org)) THEN
  RAISE EXCEPTION 'Organization document write access required' USING ERRCODE='42501'; END IF;
 IF NOT public.uc_signature_canonical_file(v_org,p_signature_id,p_file_url)
  OR nullif(btrim(p_file_name),'') IS NULL OR length(p_file_name)>500
  OR nullif(btrim(p_document_title),'') IS NULL OR length(p_document_title)>2000
  OR nullif(btrim(p_admin_email),'') IS NULL OR length(p_admin_email)>320
  OR NOT public.uc_signature_object_uploader('external-contracts',p_file_url,v_actor) THEN
  RAISE EXCEPTION 'Uploaded file binding is not verified' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('uc-external-signature:'||p_signature_id::text,0));
 IF NOT(public.uc_document_action_allowed(v_org,'write',NULL,NULL) OR public.uc_document_commercial_creation_allowed(v_org)) THEN
  RAISE EXCEPTION 'Organization document write access required' USING ERRCODE='42501'; END IF;
 v_request_hash:=encode(sha256(convert_to(jsonb_build_array(p_signature_id,p_file_url,p_file_name,p_file_mime,
  p_document_title,p_admin_email,p_admin_name,p_summary,p_organization_id)::text,'UTF8')),'hex');
 SELECT * INTO q FROM public.uc_signature_file_requests WHERE request_id=p_signature_id;
 IF FOUND THEN
  IF (q.request_kind,q.signature_id,q.actor_id,q.request_hash) IS DISTINCT FROM ('create',p_signature_id,v_actor,v_request_hash)
   OR NOT EXISTS(SELECT 1 FROM public.document_signatures WHERE id=q.signature_id AND deleted_at IS NULL AND organization_id=v_org AND sender_user_id=v_actor) THEN
   RAISE EXCEPTION 'Signature request UUID already used for a different request' USING ERRCODE='22023'; END IF;
  RETURN q.signature_id;
 END IF;
 SELECT * INTO s FROM public.document_signatures WHERE id=p_signature_id FOR UPDATE;
 IF FOUND THEN
  RAISE EXCEPTION 'Signature UUID is already occupied without this upload receipt' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(full_name,email,'Организация') INTO v_name FROM public.profiles WHERE user_id=v_actor LIMIT 1;
 IF v_name IS NULL THEN SELECT coalesce(display_name,'Организация') INTO v_name FROM public.org_staff WHERE user_id=v_actor AND organization_id=v_org LIMIT 1; END IF;
 INSERT INTO public.document_signatures(id,organization_id,sender_user_id,sender_name,document_type,document_title,
  recipient_type,recipient_email,recipient_name,status,mode,requires_bilateral)
 VALUES(p_signature_id,v_org,v_actor,coalesce(v_name,'Организация'),'external_upload',p_document_title,
  'admin_sintagma',p_admin_email,p_admin_name,'in_review','review',true);
 INSERT INTO public.signature_revisions(signature_id,version,document_html,file_url,file_name,file_mime,created_by,created_by_name,change_summary)
 VALUES(p_signature_id,1,NULL,p_file_url,p_file_name,p_file_mime,v_actor,coalesce(v_name,'Организация'),coalesce(p_summary,'Первоначальная версия'))
 RETURNING id INTO v_revision;
 UPDATE public.document_signatures SET current_revision_id=v_revision WHERE id=p_signature_id;
 INSERT INTO public.uc_signature_file_requests(request_id,request_kind,signature_id,actor_id,request_hash,revision_id)
 VALUES(p_signature_id,'create',p_signature_id,v_actor,v_request_hash,v_revision);
 RETURN p_signature_id;
END;$fn$;

-- Serialize revision version allocation under the same parent row lock used by
-- immutable guards. Keep the original participant, notification and response API.
DO $revision_lock$ DECLARE source text;needle text;replacement text;
BEGIN
 source:=pg_get_functiondef('public.add_signature_revision(uuid,text,text,text,text,text)'::regprocedure);
 needle:='SELECT * INTO v_sig FROM document_signatures WHERE id = p_signature_id;';
 replacement:=replace(source,needle,'SELECT * INTO v_sig FROM document_signatures WHERE id = p_signature_id FOR UPDATE;');
 IF source=replacement THEN RAISE EXCEPTION 'Unreviewed revision allocation'; END IF;
 EXECUTE replacement;
END;$revision_lock$;

CREATE FUNCTION public.add_signature_revision_v2(p_revision_id uuid,p_signature_id uuid,p_expected_revision_id uuid,
 p_file_url text DEFAULT NULL,p_file_name text DEFAULT NULL,p_file_mime text DEFAULT NULL,
 p_document_html text DEFAULT NULL,p_change_summary text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE;v_actor uuid:=auth.uid();v_name text;v_next integer;
 q public.uc_signature_file_requests%ROWTYPE;v_request_hash text;
BEGIN
 IF v_actor IS NULL OR NOT public.account_deletion_access_allowed() OR p_revision_id IS NULL THEN
  RAISE EXCEPTION 'Authenticated revision actor required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.document_signatures WHERE id=p_signature_id FOR UPDATE;
 IF NOT FOUND OR NOT public.uc_signature_actor_allowed(s.id,true,true) THEN
  RAISE EXCEPTION 'Revision permission denied' USING ERRCODE='42501'; END IF;
 v_request_hash:=encode(sha256(convert_to(jsonb_build_array(p_revision_id,p_signature_id,p_expected_revision_id,
  p_file_url,p_file_name,p_file_mime,p_document_html,p_change_summary)::text,'UTF8')),'hex');
 SELECT * INTO q FROM public.uc_signature_file_requests WHERE request_id=p_revision_id;
 IF FOUND THEN
  IF (q.request_kind,q.signature_id,q.actor_id,q.request_hash) IS DISTINCT FROM ('revision',p_signature_id,v_actor,v_request_hash) THEN
   RAISE EXCEPTION 'Revision request UUID already used for a different request' USING ERRCODE='22023'; END IF;
  RETURN q.revision_id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.signature_revisions WHERE id=p_revision_id) THEN
  RAISE EXCEPTION 'Revision UUID is already occupied without this upload receipt' USING ERRCODE='22023'; END IF;
 IF s.current_revision_id IS DISTINCT FROM p_expected_revision_id THEN
  RAISE EXCEPTION 'Document revision changed; reload before editing' USING ERRCODE='40001'; END IF;
 IF s.deleted_at IS NOT NULL OR s.status NOT IN('draft','sent','viewed','in_review','changes_requested') OR s.expires_at<=now() THEN
  RAISE EXCEPTION 'Signature revision is closed' USING ERRCODE='55000'; END IF;
 SELECT coalesce(full_name,email,'Пользователь') INTO v_name FROM public.profiles WHERE user_id=v_actor LIMIT 1;
 SELECT coalesce(max(version),0)+1 INTO v_next FROM public.signature_revisions WHERE signature_id=s.id;
 INSERT INTO public.signature_revisions(id,signature_id,version,document_html,file_url,file_name,file_mime,created_by,created_by_name,change_summary)
 VALUES(p_revision_id,s.id,v_next,p_document_html,p_file_url,p_file_name,p_file_mime,v_actor,coalesce(v_name,'Пользователь'),p_change_summary);
 UPDATE public.document_signatures SET current_revision_id=p_revision_id,status='in_review',updated_at=now() WHERE id=s.id;
 IF v_actor<>s.sender_user_id THEN
  INSERT INTO public.org_notifications(organization_id,user_id,type,title,message,related_id)
  VALUES(s.organization_id,s.sender_user_id,'signature','Новая версия документа от '||coalesce(v_name,'Пользователь'),
   s.document_title||coalesce(' — '||p_change_summary,''),s.id);
 END IF;
 INSERT INTO public.uc_signature_file_requests(request_id,request_kind,signature_id,actor_id,request_hash,revision_id)
 VALUES(p_revision_id,'revision',p_signature_id,v_actor,v_request_hash,p_revision_id);
 RETURN p_revision_id;
END;$fn$;

CREATE FUNCTION public.uc_signature_file_context(p_token text,p_kind text DEFAULT 'revision',p_revision_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE s public.document_signatures%ROWTYPE;r public.signature_revisions%ROWTYPE;
 v_bucket text:='external-contracts';v_locator text;v_path text;v_hash text;v_revision uuid;v_name text;v_mime text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service context required' USING ERRCODE='42501'; END IF;
 IF p_token IS NULL OR length(p_token) NOT BETWEEN 16 AND 200 OR p_token ~ '[[:space:]]' OR p_kind IS NULL
  OR p_kind NOT IN('revision','source','scan','certificate') OR p_kind<>'revision' AND p_revision_id IS NOT NULL THEN
  RAISE EXCEPTION 'Invalid file selector' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.document_signatures WHERE signature_token=p_token;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document not found' USING ERRCODE='P0002'; END IF;
 IF NOT public.uc_signature_token_access_allowed(s.id,false) THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='55000'; END IF;
 IF p_kind IN('revision','source') THEN
  v_revision:=CASE WHEN p_kind='revision' THEN coalesce(p_revision_id,s.current_revision_id)
   WHEN s.status='signed' THEN coalesce(s.signed_revision_id,s.current_revision_id) ELSE s.current_revision_id END;
  IF v_revision IS NOT NULL THEN
   SELECT * INTO r FROM public.signature_revisions WHERE id=v_revision AND signature_id=s.id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found' USING ERRCODE='P0002'; END IF;
   v_locator:=r.file_url;v_name:=r.file_name;v_mime:=r.file_mime;
  END IF;
  IF p_kind='source' AND s.status='signed' AND s.signed_source_path IS NOT NULL THEN
   v_bucket:=s.signed_source_bucket;v_locator:=s.signed_source_path;v_hash:=s.signed_source_hash;
  ELSIF s.status='signed' AND v_revision=s.signed_revision_id AND s.signed_source_path IS NOT NULL THEN
   v_hash:=s.signed_source_hash;
  END IF;
 ELSIF p_kind='scan' THEN
  IF s.status<>'signed' THEN RAISE EXCEPTION 'Signed scan unavailable' USING ERRCODE='P0002'; END IF;
  v_locator:=s.handwritten_scan_path;v_hash:=s.handwritten_scan_hash;
 ELSE
  IF s.status<>'signed' THEN RAISE EXCEPTION 'Certificate unavailable' USING ERRCODE='P0002'; END IF;
  v_bucket:='signed-documents';v_locator:=s.signed_document_path;v_hash:=s.certificate_hash;v_mime:='text/html';
 END IF;
 IF v_bucket NOT IN('external-contracts','signed-documents') OR nullif(v_locator,'') IS NULL THEN
  RAISE EXCEPTION 'File unavailable' USING ERRCODE='P0002'; END IF;
 v_path:=public.uc_signature_locator_key(v_locator,v_bucket);
 IF v_path IS NULL OR NOT public.uc_signature_object_bound(s.id,v_bucket,v_path) THEN
  RAISE EXCEPTION 'Historical file binding requires review' USING ERRCODE='P0010'; END IF;
 RETURN jsonb_build_object('signature_id',s.id,'organization_id',s.organization_id,'status',s.status,'kind',p_kind,
  'revision_id',v_revision,'bucket',v_bucket,'locator',v_locator,'provenance_path',v_path,'expected_hash',v_hash,'file_name',v_name,'file_mime',v_mime,
  'signed_source_bucket',s.signed_source_bucket,'signed_source_path',s.signed_source_path,'signed_revision_id',s.signed_revision_id);
END;$fn$;
REVOKE ALL ON FUNCTION public.uc_signature_locator_key(text,text),public.uc_signature_canonical_file(uuid,uuid,text),
 public.uc_signature_object_uploader(text,text,uuid),public.uc_signature_object_bound(uuid,text,text),
 public.uc_signature_file_scope(text,text),public.uc_guard_signature_file_provenance(),
 public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid),
 public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text),
 public.uc_signature_file_context(text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.uc_signature_file_scope(text,text),public.uc_signature_canonical_file(uuid,uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.uc_signature_file_context(text,text,uuid) TO service_role;
COMMENT ON FUNCTION public.uc_signature_file_context(text,text,uuid) IS 'Service-only exact token context. Canonical signature namespace AND exact uploader required. Edge independently verifies project origin and sealed hashes, then issues a 60-second URL.';

$source_20261018109000$;BEGIN
 IF md5(source)<>'f61b7f838928467ae28aa0a6602810c1' THEN RAISE EXCEPTION 'Source hash mismatch 20261018109000';END IF;
 EXECUTE source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261018109000','uc_signature_token_files',ARRAY[source]);
END $migration$;
DO $assert$ DECLARE r jsonb;BEGIN SELECT to_jsonb(q) INTO r FROM (-- Repeatable read-only acceptance: valid after real profiles have been saved too.
SELECT
 (SELECT count(*)=2 FROM supabase_migrations.schema_migrations WHERE (version='20261018108000' AND name='uc_education_compliance_profile' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='a840381f437b4529d13a466636acf512') OR (version='20261018109000' AND name='uc_signature_token_files' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='f61b7f838928467ae28aa0a6602810c1')) AS exact_profile_ledger,
 coalesce(md5(pg_get_functiondef(to_regprocedure('public.add_signature_revision(uuid,text,text,text,text,text)')))='55bba8f07761156974e016203862fce3',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text)')))='4eff66a8bbd761b099c451f3cab5184c',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid)')))='5e7217ad17ad684950bc1d4cc1a599b6',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.get_organization_education_profile(uuid)')))='fb776b25a2d3ddb2de45f4bb0af55c66',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.list_organization_document_applicability_decisions(uuid)')))='38bc3c9607dd9b234faedfb0a0c6a7e8',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.list_organization_document_applicability_history(uuid,text,integer,bigint)')))='9eaf5cedc8f849a078e3628c81b71bee',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.list_organization_education_profile_history(uuid,integer,bigint)')))='e5f0f8646e2e57ee474ec2105f5c5f3e',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)')))='d9b8bb1b7cc5a20ae27f9b71b8f7c4c0',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.save_organization_education_profile(uuid,bigint,jsonb,uuid)')))='20666a5fc6e0ec3d33e8229b103e047e',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_document_storage_scope(text,text)')))='8b098a3d3719a73e92a0b1a002121de9',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_empty_education_profile()')))='5cfa6476fc8d857005b1860f162c37b2',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_compliance_history()')))='9ea2c738380752e8d7de9cd5d2bf520b',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_signature_file_provenance()')))='29818408e329a07be3f740a8953f3bfc',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_canonical_file(uuid,uuid,text)')))='401b44e39584dd94d073b944e03979a8',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_file_context(text,text,uuid)')))='0913f786957394707e29ef705d5b790d',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_file_scope(text,text)')))='9d4733a8bb62597b9a67e4d85261c0df',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_locator_key(text,text)')))='3d2d9463e7063aea9f2090f218ffe3f0',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_object_bound(uuid,text,text)')))='0bad882bf215319b4fd5715103b78573',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_object_uploader(text,text,uuid)')))='69f24010df2478180c9b6dce8c32077d',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_storage_read(text,text)')))='8ed97513c96236cf32c44e764ad1e098',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_storage_write(text,text)')))='01d386c700f5341f132c72ed607a6e9a',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_validate_applicability_key(text,text)')))='fdaba82d961192324e65e8ccb876d987',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_validate_education_profile(jsonb)')))='dcb4593eeeecc6a48123ef8569b6e419',false) AS exact_new_functions,
 (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.organization_education_profiles'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.organization_education_profiles'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='organization_education_profiles'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='organization_education_profiles'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organization_education_profiles'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_education_profiles'::regclass))::text) hash)='876d5ee780c85d0d7a2256e72b38d086' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.organization_education_profile_history'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.organization_education_profile_history'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='organization_education_profile_history'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='organization_education_profile_history'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organization_education_profile_history'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_education_profile_history'::regclass))::text) hash)='a8514967a2b0ad1341cf192a6eb7a7c1' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.organization_document_applicability_decisions'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.organization_document_applicability_decisions'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='organization_document_applicability_decisions'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='organization_document_applicability_decisions'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organization_document_applicability_decisions'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_document_applicability_decisions'::regclass))::text) hash)='5f3e4bbd138ec894b1a582f7113320cf' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.organization_document_applicability_history'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.organization_document_applicability_history'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='organization_document_applicability_history'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='organization_document_applicability_history'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organization_document_applicability_history'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_document_applicability_history'::regclass))::text) hash)='ad0359196a8ad0b37ee84b98965284c4' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.uc_signature_file_requests'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.uc_signature_file_requests'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='uc_signature_file_requests'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='uc_signature_file_requests'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.uc_signature_file_requests'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.uc_signature_file_requests'::regclass))::text) hash)='d794ebebf61a3b2dff0df8b7e4633c7b' AS exact_new_schema,
 has_table_privilege('authenticated','public.organization_education_profiles','SELECT') AND NOT has_table_privilege('authenticated','public.organization_education_profiles','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.organization_education_profiles','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.organization_education_profiles','INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.organization_education_profile_history','SELECT') AND NOT has_table_privilege('authenticated','public.organization_education_profile_history','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.organization_education_profile_history','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.organization_education_profile_history','INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.organization_document_applicability_decisions','SELECT') AND NOT has_table_privilege('authenticated','public.organization_document_applicability_decisions','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.organization_document_applicability_decisions','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.organization_document_applicability_decisions','INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.organization_document_applicability_history','SELECT') AND NOT has_table_privilege('authenticated','public.organization_document_applicability_history','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.organization_document_applicability_history','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.organization_document_applicability_history','INSERT,UPDATE,DELETE') AS rpc_only_writes,
 has_function_privilege('authenticated','public.get_organization_education_profile(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.get_organization_education_profile(uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.get_organization_education_profile(uuid)','EXECUTE') AND has_function_privilege('authenticated','public.list_organization_document_applicability_decisions(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.list_organization_document_applicability_decisions(uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.list_organization_document_applicability_decisions(uuid)','EXECUTE') AND has_function_privilege('authenticated','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE') AND NOT has_function_privilege('anon','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE') AND NOT has_function_privilege('service_role','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE') AND has_function_privilege('authenticated','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE') AND NOT has_function_privilege('anon','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE') AND NOT has_function_privilege('service_role','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE') AND has_function_privilege('authenticated','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE') AND has_function_privilege('authenticated','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE') AS authenticated_rpc_only,
 has_function_privilege('authenticated','public.add_signature_revision(uuid,text,text,text,text,text)','EXECUTE')=true AND has_function_privilege('anon','public.add_signature_revision(uuid,text,text,text,text,text)','EXECUTE')=true AND has_function_privilege('service_role','public.add_signature_revision(uuid,text,text,text,text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text)','EXECUTE')=true AND has_function_privilege('anon','public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text)','EXECUTE')=false AND has_function_privilege('authenticated','public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.get_organization_education_profile(uuid)','EXECUTE')=true AND has_function_privilege('anon','public.get_organization_education_profile(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.get_organization_education_profile(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.list_organization_document_applicability_decisions(uuid)','EXECUTE')=true AND has_function_privilege('anon','public.list_organization_document_applicability_decisions(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.list_organization_document_applicability_decisions(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE')=true AND has_function_privilege('anon','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE')=false AND has_function_privilege('service_role','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE')=false AND has_function_privilege('authenticated','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE')=true AND has_function_privilege('anon','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE')=false AND has_function_privilege('service_role','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE')=false AND has_function_privilege('authenticated','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_document_storage_scope(text,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_document_storage_scope(text,text)','EXECUTE')=true AND has_function_privilege('service_role','public.uc_document_storage_scope(text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_empty_education_profile()','EXECUTE')=false AND has_function_privilege('anon','public.uc_empty_education_profile()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_empty_education_profile()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_guard_compliance_history()','EXECUTE')=false AND has_function_privilege('anon','public.uc_guard_compliance_history()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_guard_compliance_history()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_guard_signature_file_provenance()','EXECUTE')=false AND has_function_privilege('anon','public.uc_guard_signature_file_provenance()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_guard_signature_file_provenance()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_signature_canonical_file(uuid,uuid,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_signature_canonical_file(uuid,uuid,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_canonical_file(uuid,uuid,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_signature_file_context(text,text,uuid)','EXECUTE')=false AND has_function_privilege('anon','public.uc_signature_file_context(text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_file_context(text,text,uuid)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_signature_file_scope(text,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_signature_file_scope(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_file_scope(text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_signature_locator_key(text,text)','EXECUTE')=false AND has_function_privilege('anon','public.uc_signature_locator_key(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_locator_key(text,text)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_signature_object_bound(uuid,text,text)','EXECUTE')=false AND has_function_privilege('anon','public.uc_signature_object_bound(uuid,text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_object_bound(uuid,text,text)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_signature_object_uploader(text,text,uuid)','EXECUTE')=false AND has_function_privilege('anon','public.uc_signature_object_uploader(text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_object_uploader(text,text,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_signature_storage_read(text,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_signature_storage_read(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_storage_read(text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_signature_storage_write(text,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_signature_storage_write(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_storage_write(text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_validate_applicability_key(text,text)','EXECUTE')=false AND has_function_privilege('anon','public.uc_validate_applicability_key(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_validate_applicability_key(text,text)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_validate_education_profile(jsonb)','EXECUTE')=false AND has_function_privilege('anon','public.uc_validate_education_profile(jsonb)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_validate_education_profile(jsonb)','EXECUTE')=false AS exact_function_grants,
 NOT has_table_privilege('authenticated','public.uc_signature_file_requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.uc_signature_file_requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.uc_signature_file_requests','SELECT,INSERT,UPDATE,DELETE') AS private_request_receipts,
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='uc_revision_file_provenance' AND tgrelid='public.signature_revisions'::regclass AND tgenabled='O' AND md5(pg_get_triggerdef(oid))='3af5b39abc7d67db409c560a2d854c9f') AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='uc_signature_file_provenance' AND tgrelid='public.document_signatures'::regclass AND tgenabled='O' AND md5(pg_get_triggerdef(oid))='2a0cc2818aa843a097492522bc620b60') AS exact_provenance_triggers,
 EXISTS(SELECT 1 FROM pg_policies x WHERE schemaname='storage' AND policyname='uc_signature_namespace_immutable_delete' AND md5(to_jsonb(x)::text)='908d0e9b13cf7a2627011cc5152a3ca8') AND EXISTS(SELECT 1 FROM pg_policies x WHERE schemaname='storage' AND policyname='uc_signature_namespace_immutable_update' AND md5(to_jsonb(x)::text)='0381e2dba8030669fb760f4ff70ba1fc') AND EXISTS(SELECT 1 FROM pg_policies x WHERE schemaname='storage' AND policyname='uc_signature_namespace_insert' AND md5(to_jsonb(x)::text)='aa5bb3aba16a387e755916064a48c34e') AS exact_storage_boundaries) q;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) WHERE value IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'UC profile postcheck failed: %',r;END IF;END $assert$;
DO $preserve$ DECLARE r record;n bigint;h text;BEGIN
 FOR r IN SELECT * FROM uc_profile_before LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(x)::text,E''\n'' ORDER BY to_jsonb(x)::text),'''')) FROM %s x',r.table_name) INTO n,h;
 IF (n,h) IS DISTINCT FROM (r.row_count,r.row_hash) THEN RAISE EXCEPTION 'Historical data changed in %',r.table_name;END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM uc_profile_policies_before b LEFT JOIN pg_policies p USING(schemaname,tablename,policyname) WHERE to_jsonb(b) IS DISTINCT FROM to_jsonb(p)) THEN RAISE EXCEPTION 'Existing policy changed';END IF;
 IF EXISTS(SELECT 1 FROM uc_profile_functions_before b LEFT JOIN pg_proc p ON p.oid=b.oid WHERE (p.oid::regprocedure::text NOT IN('uc_document_storage_scope(text,text)','uc_signature_storage_read(text,text)','uc_signature_storage_write(text,text)','add_signature_revision(uuid,text,text,text,text,text)') AND b.definition_hash IS DISTINCT FROM md5(pg_get_functiondef(p.oid))) OR b.proowner IS DISTINCT FROM p.proowner OR b.proacl IS DISTINCT FROM p.proacl) THEN RAISE EXCEPTION 'Existing function changed';END IF;
 IF EXISTS(SELECT 1 FROM uc_profile_cron_before b FULL JOIN (SELECT jobid,md5(to_jsonb(j)::text) hash FROM cron.job j) a USING(jobid) WHERE b.hash IS DISTINCT FROM a.hash) THEN RAISE EXCEPTION 'Cron metadata changed';END IF;
 IF EXISTS(SELECT 1 FROM public.organization_education_profiles) OR EXISTS(SELECT 1 FROM public.organization_education_profile_history) OR EXISTS(SELECT 1 FROM public.organization_document_applicability_decisions) OR EXISTS(SELECT 1 FROM public.organization_document_applicability_history) OR EXISTS(SELECT 1 FROM public.uc_signature_file_requests) THEN RAISE EXCEPTION 'Unexpected profile/decision backfill';END IF;
END $preserve$;
NOTIFY pgrst,'reload schema';COMMIT;
-- Repeatable read-only acceptance: valid after real profiles have been saved too.
SELECT
 (SELECT count(*)=2 FROM supabase_migrations.schema_migrations WHERE (version='20261018108000' AND name='uc_education_compliance_profile' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='a840381f437b4529d13a466636acf512') OR (version='20261018109000' AND name='uc_signature_token_files' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='f61b7f838928467ae28aa0a6602810c1')) AS exact_profile_ledger,
 coalesce(md5(pg_get_functiondef(to_regprocedure('public.add_signature_revision(uuid,text,text,text,text,text)')))='55bba8f07761156974e016203862fce3',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text)')))='4eff66a8bbd761b099c451f3cab5184c',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid)')))='5e7217ad17ad684950bc1d4cc1a599b6',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.get_organization_education_profile(uuid)')))='fb776b25a2d3ddb2de45f4bb0af55c66',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.list_organization_document_applicability_decisions(uuid)')))='38bc3c9607dd9b234faedfb0a0c6a7e8',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.list_organization_document_applicability_history(uuid,text,integer,bigint)')))='9eaf5cedc8f849a078e3628c81b71bee',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.list_organization_education_profile_history(uuid,integer,bigint)')))='e5f0f8646e2e57ee474ec2105f5c5f3e',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)')))='d9b8bb1b7cc5a20ae27f9b71b8f7c4c0',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.save_organization_education_profile(uuid,bigint,jsonb,uuid)')))='20666a5fc6e0ec3d33e8229b103e047e',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_document_storage_scope(text,text)')))='8b098a3d3719a73e92a0b1a002121de9',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_empty_education_profile()')))='5cfa6476fc8d857005b1860f162c37b2',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_compliance_history()')))='9ea2c738380752e8d7de9cd5d2bf520b',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_guard_signature_file_provenance()')))='29818408e329a07be3f740a8953f3bfc',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_canonical_file(uuid,uuid,text)')))='401b44e39584dd94d073b944e03979a8',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_file_context(text,text,uuid)')))='0913f786957394707e29ef705d5b790d',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_file_scope(text,text)')))='9d4733a8bb62597b9a67e4d85261c0df',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_locator_key(text,text)')))='3d2d9463e7063aea9f2090f218ffe3f0',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_object_bound(uuid,text,text)')))='0bad882bf215319b4fd5715103b78573',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_object_uploader(text,text,uuid)')))='69f24010df2478180c9b6dce8c32077d',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_storage_read(text,text)')))='8ed97513c96236cf32c44e764ad1e098',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_signature_storage_write(text,text)')))='01d386c700f5341f132c72ed607a6e9a',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_validate_applicability_key(text,text)')))='fdaba82d961192324e65e8ccb876d987',false) AND coalesce(md5(pg_get_functiondef(to_regprocedure('public.uc_validate_education_profile(jsonb)')))='dcb4593eeeecc6a48123ef8569b6e419',false) AS exact_new_functions,
 (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.organization_education_profiles'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.organization_education_profiles'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='organization_education_profiles'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='organization_education_profiles'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organization_education_profiles'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_education_profiles'::regclass))::text) hash)='876d5ee780c85d0d7a2256e72b38d086' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.organization_education_profile_history'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.organization_education_profile_history'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='organization_education_profile_history'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='organization_education_profile_history'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organization_education_profile_history'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_education_profile_history'::regclass))::text) hash)='a8514967a2b0ad1341cf192a6eb7a7c1' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.organization_document_applicability_decisions'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.organization_document_applicability_decisions'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='organization_document_applicability_decisions'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='organization_document_applicability_decisions'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organization_document_applicability_decisions'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_document_applicability_decisions'::regclass))::text) hash)='5f3e4bbd138ec894b1a582f7113320cf' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.organization_document_applicability_history'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.organization_document_applicability_history'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='organization_document_applicability_history'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='organization_document_applicability_history'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.organization_document_applicability_history'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_document_applicability_history'::regclass))::text) hash)='ad0359196a8ad0b37ee84b98965284c4' AND (SELECT md5(jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.uc_signature_file_requests'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.uc_signature_file_requests'::regclass AND contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(indexname,indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='uc_signature_file_requests'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='uc_signature_file_requests'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.uc_signature_file_requests'::regclass AND NOT tgisinternal),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.uc_signature_file_requests'::regclass))::text) hash)='d794ebebf61a3b2dff0df8b7e4633c7b' AS exact_new_schema,
 has_table_privilege('authenticated','public.organization_education_profiles','SELECT') AND NOT has_table_privilege('authenticated','public.organization_education_profiles','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.organization_education_profiles','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.organization_education_profiles','INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.organization_education_profile_history','SELECT') AND NOT has_table_privilege('authenticated','public.organization_education_profile_history','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.organization_education_profile_history','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.organization_education_profile_history','INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.organization_document_applicability_decisions','SELECT') AND NOT has_table_privilege('authenticated','public.organization_document_applicability_decisions','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.organization_document_applicability_decisions','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.organization_document_applicability_decisions','INSERT,UPDATE,DELETE') AND has_table_privilege('authenticated','public.organization_document_applicability_history','SELECT') AND NOT has_table_privilege('authenticated','public.organization_document_applicability_history','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.organization_document_applicability_history','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.organization_document_applicability_history','INSERT,UPDATE,DELETE') AS rpc_only_writes,
 has_function_privilege('authenticated','public.get_organization_education_profile(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.get_organization_education_profile(uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.get_organization_education_profile(uuid)','EXECUTE') AND has_function_privilege('authenticated','public.list_organization_document_applicability_decisions(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.list_organization_document_applicability_decisions(uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.list_organization_document_applicability_decisions(uuid)','EXECUTE') AND has_function_privilege('authenticated','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE') AND NOT has_function_privilege('anon','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE') AND NOT has_function_privilege('service_role','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE') AND has_function_privilege('authenticated','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE') AND NOT has_function_privilege('anon','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE') AND NOT has_function_privilege('service_role','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE') AND has_function_privilege('authenticated','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE') AND has_function_privilege('authenticated','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE') AND NOT has_function_privilege('service_role','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE') AS authenticated_rpc_only,
 has_function_privilege('authenticated','public.add_signature_revision(uuid,text,text,text,text,text)','EXECUTE')=true AND has_function_privilege('anon','public.add_signature_revision(uuid,text,text,text,text,text)','EXECUTE')=true AND has_function_privilege('service_role','public.add_signature_revision(uuid,text,text,text,text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text)','EXECUTE')=true AND has_function_privilege('anon','public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.add_signature_revision_v2(uuid,uuid,uuid,text,text,text,text,text)','EXECUTE')=false AND has_function_privilege('authenticated','public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.create_external_contract_signature_v2(uuid,text,text,text,text,text,text,text,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.get_organization_education_profile(uuid)','EXECUTE')=true AND has_function_privilege('anon','public.get_organization_education_profile(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.get_organization_education_profile(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.list_organization_document_applicability_decisions(uuid)','EXECUTE')=true AND has_function_privilege('anon','public.list_organization_document_applicability_decisions(uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.list_organization_document_applicability_decisions(uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE')=true AND has_function_privilege('anon','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE')=false AND has_function_privilege('service_role','public.list_organization_document_applicability_history(uuid,text,integer,bigint)','EXECUTE')=false AND has_function_privilege('authenticated','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE')=true AND has_function_privilege('anon','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE')=false AND has_function_privilege('service_role','public.list_organization_education_profile_history(uuid,integer,bigint)','EXECUTE')=false AND has_function_privilege('authenticated','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.save_organization_document_applicability_decision(uuid,text,bigint,bigint,text,text,text,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE')=true AND has_function_privilege('anon','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.save_organization_education_profile(uuid,bigint,jsonb,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_document_storage_scope(text,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_document_storage_scope(text,text)','EXECUTE')=true AND has_function_privilege('service_role','public.uc_document_storage_scope(text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_empty_education_profile()','EXECUTE')=false AND has_function_privilege('anon','public.uc_empty_education_profile()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_empty_education_profile()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_guard_compliance_history()','EXECUTE')=false AND has_function_privilege('anon','public.uc_guard_compliance_history()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_guard_compliance_history()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_guard_signature_file_provenance()','EXECUTE')=false AND has_function_privilege('anon','public.uc_guard_signature_file_provenance()','EXECUTE')=false AND has_function_privilege('service_role','public.uc_guard_signature_file_provenance()','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_signature_canonical_file(uuid,uuid,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_signature_canonical_file(uuid,uuid,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_canonical_file(uuid,uuid,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_signature_file_context(text,text,uuid)','EXECUTE')=false AND has_function_privilege('anon','public.uc_signature_file_context(text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_file_context(text,text,uuid)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_signature_file_scope(text,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_signature_file_scope(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_file_scope(text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_signature_locator_key(text,text)','EXECUTE')=false AND has_function_privilege('anon','public.uc_signature_locator_key(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_locator_key(text,text)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_signature_object_bound(uuid,text,text)','EXECUTE')=false AND has_function_privilege('anon','public.uc_signature_object_bound(uuid,text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_object_bound(uuid,text,text)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_signature_object_uploader(text,text,uuid)','EXECUTE')=false AND has_function_privilege('anon','public.uc_signature_object_uploader(text,text,uuid)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_object_uploader(text,text,uuid)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_signature_storage_read(text,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_signature_storage_read(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_storage_read(text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_signature_storage_write(text,text)','EXECUTE')=true AND has_function_privilege('anon','public.uc_signature_storage_write(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_signature_storage_write(text,text)','EXECUTE')=true AND has_function_privilege('authenticated','public.uc_validate_applicability_key(text,text)','EXECUTE')=false AND has_function_privilege('anon','public.uc_validate_applicability_key(text,text)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_validate_applicability_key(text,text)','EXECUTE')=false AND has_function_privilege('authenticated','public.uc_validate_education_profile(jsonb)','EXECUTE')=false AND has_function_privilege('anon','public.uc_validate_education_profile(jsonb)','EXECUTE')=false AND has_function_privilege('service_role','public.uc_validate_education_profile(jsonb)','EXECUTE')=false AS exact_function_grants,
 NOT has_table_privilege('authenticated','public.uc_signature_file_requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.uc_signature_file_requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.uc_signature_file_requests','SELECT,INSERT,UPDATE,DELETE') AS private_request_receipts,
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='uc_revision_file_provenance' AND tgrelid='public.signature_revisions'::regclass AND tgenabled='O' AND md5(pg_get_triggerdef(oid))='3af5b39abc7d67db409c560a2d854c9f') AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='uc_signature_file_provenance' AND tgrelid='public.document_signatures'::regclass AND tgenabled='O' AND md5(pg_get_triggerdef(oid))='2a0cc2818aa843a097492522bc620b60') AS exact_provenance_triggers,
 EXISTS(SELECT 1 FROM pg_policies x WHERE schemaname='storage' AND policyname='uc_signature_namespace_immutable_delete' AND md5(to_jsonb(x)::text)='908d0e9b13cf7a2627011cc5152a3ca8') AND EXISTS(SELECT 1 FROM pg_policies x WHERE schemaname='storage' AND policyname='uc_signature_namespace_immutable_update' AND md5(to_jsonb(x)::text)='0381e2dba8030669fb760f4ff70ba1fc') AND EXISTS(SELECT 1 FROM pg_policies x WHERE schemaname='storage' AND policyname='uc_signature_namespace_insert' AND md5(to_jsonb(x)::text)='aa5bb3aba16a387e755916064a48c34e') AS exact_storage_boundaries;
