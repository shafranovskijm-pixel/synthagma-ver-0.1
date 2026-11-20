-- SOURCE ONLY, isolated accepted native model extension; not a Cloud migration.
-- Exact current00/00B schema/42007/immutable components only. No row rewrite,
-- Auth seed, role assignment, capability override, DROP, or old helper replacement.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=pg_catalog,public,pg_temp;
DO $caw_model_guard$
BEGIN
 IF current_database()<>'sintagma_copy24_lab_20261028'OR current_user<>'postgres'OR session_user<>'postgres'
 OR inet_server_addr()IS DISTINCT FROM'127.0.0.1'::inet OR inet_server_port()<>5432
 OR current_setting('server_version_num')<>'170011'OR current_setting('data_directory')<>'/var/lib/postgresql/data'
 OR current_setting('pcr.lab_authorized',true)IS DISTINCT FROM'source-reviewed-root-run-only'
 OR current_setting('transaction_isolation')<>'read committed'OR current_setting('session_replication_role')<>'origin'
 OR to_regprocedure('public.uc_assignment_removal_immutable()')IS NOT NULL
 OR to_regprocedure('public.pcc_v2_current_rights_keys(text,uuid[],boolean)')IS NOT NULL
 THEN RAISE EXCEPTION 'CAW_EXACT_ACCEPTED_MODEL_BEFORE_NEW_HELPERS_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc catalog_proc WHERE catalog_proc.oid='public.account_deletion_subject_write_guard()'::regprocedure
  AND catalog_proc.proowner='postgres'::regrole AND catalog_proc.prosecdef
  AND catalog_proc.proconfig=ARRAY['search_path=pg_catalog, public']::text[]
  AND encode(sha256(convert_to(catalog_proc.prosrc,'UTF8')),'hex')='82a48095b102fb498d2bcbb223d21440a190d3216a1b999d790257bba46adfd7')
 OR NOT EXISTS(SELECT 1 FROM pg_proc catalog_proc WHERE catalog_proc.oid='public.uc_enrollment_is_withdrawn(uuid)'::regprocedure
  AND catalog_proc.proowner='postgres'::regrole AND catalog_proc.prosecdef
  AND encode(sha256(convert_to(catalog_proc.prosrc,'UTF8')),'hex')='51d86c8fe394fff258b78347eea25d75cf460c2f9e0e38a4f2f0a60c5891fba1')
 THEN RAISE EXCEPTION 'CAW_EXACT_REUSED_HELPER_BODIES_REQUIRED_NO_STUB';END IF;
 IF public.pcf_v1_delivery_capabilities()->'frozen_reader_implemented'IS DISTINCT FROM'false'::jsonb
 OR public.pcf_v1_delivery_capabilities()->'frontend_consumers_accepted'IS DISTINCT FROM'false'::jsonb
 OR public.pcf_v1_delivery_capabilities()->'copied_centre_exact_binding_supported'IS DISTINCT FROM'false'::jsonb
 THEN RAISE EXCEPTION 'CAW_FALSE_CAPABILITIES_REQUIRED';END IF;
END;$caw_model_guard$;
-- Take both table locks BEFORE checking emptiness in this same transaction.
LOCK TABLE public.uc_enrollment_withdrawal_states,public.uc_course_assignment_removal_events IN ACCESS EXCLUSIVE MODE NOWAIT;
DO $caw_empty_before_shape$
BEGIN
 IF EXISTS(SELECT 1 FROM public.uc_enrollment_withdrawal_states)OR EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events)
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid IN('public.uc_enrollment_withdrawal_states'::regclass,'public.uc_course_assignment_removal_events'::regclass))
 THEN RAISE EXCEPTION 'CAW_TWO_EMPTY_UNEXTENDED_EVENT_STORES_REQUIRED_NO_BACKFILL';END IF;
 IF to_regclass('pg_temp.caw_model_before')IS NOT NULL THEN RAISE EXCEPTION 'CAW_FRESH_MODEL_GUARD_REQUIRED';END IF;
 CREATE TEMP TABLE caw_model_before(function_catalog jsonb,capabilities jsonb)ON COMMIT DROP;
 INSERT INTO pg_temp.caw_model_before SELECT
 (SELECT coalesce(jsonb_agg(jsonb_build_object('oid',catalog_proc.oid,'catalog',to_jsonb(catalog_proc),'definition',pg_get_functiondef(catalog_proc.oid))ORDER BY catalog_proc.oid),'[]')
  FROM pg_proc catalog_proc JOIN pg_namespace catalog_namespace ON catalog_namespace.oid=catalog_proc.pronamespace WHERE catalog_namespace.nspname IN('public','auth')AND catalog_proc.prokind='f'),
 public.pcf_v1_delivery_capabilities();
END;$caw_empty_before_shape$;

ALTER TABLE public.uc_enrollment_withdrawal_states ALTER COLUMN enrollment_id SET NOT NULL;
ALTER TABLE public.uc_enrollment_withdrawal_states ADD COLUMN organization_id uuid NOT NULL;
ALTER TABLE public.uc_enrollment_withdrawal_states ADD COLUMN user_id uuid;
ALTER TABLE public.uc_enrollment_withdrawal_states ADD COLUMN course_id uuid NOT NULL;
ALTER TABLE public.uc_enrollment_withdrawal_states ADD COLUMN group_id uuid;
ALTER TABLE public.uc_enrollment_withdrawal_states ADD COLUMN revision bigint NOT NULL;
ALTER TABLE public.uc_enrollment_withdrawal_states ADD COLUMN effective_date date NOT NULL;
ALTER TABLE public.uc_enrollment_withdrawal_states ADD COLUMN basis jsonb NOT NULL;
ALTER TABLE public.uc_enrollment_withdrawal_states ADD COLUMN technical_snapshot jsonb NOT NULL;
ALTER TABLE public.uc_enrollment_withdrawal_states ADD COLUMN recorded_by uuid;
ALTER TABLE public.uc_enrollment_withdrawal_states ADD COLUMN participant_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL;
ALTER TABLE public.uc_enrollment_withdrawal_states ALTER COLUMN redacted SET NOT NULL;
ALTER TABLE public.uc_enrollment_withdrawal_states ADD COLUMN recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL;
ALTER TABLE public.uc_enrollment_withdrawal_states ADD CONSTRAINT uc_enrollment_withdrawal_states_pkey PRIMARY KEY (enrollment_id);
ALTER TABLE public.uc_enrollment_withdrawal_states ADD CONSTRAINT uc_enrollment_withdrawal_states_revision_check CHECK (((revision >= 1) AND (revision <= '9007199254740991'::bigint)));
ALTER TABLE public.uc_course_assignment_removal_events ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ALTER COLUMN enrollment_id SET NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN organization_id uuid NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN user_id uuid NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN course_id uuid NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN group_id uuid;
ALTER TABLE public.uc_course_assignment_removal_events ALTER COLUMN revision SET NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ALTER COLUMN state SET NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN actor_id uuid NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN request_id uuid NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN preflight_sha256 text NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN before_enrollment jsonb NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN after_enrollment jsonb NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ADD COLUMN reason text DEFAULT 'erroneous_unstarted_assignment'::text NOT NULL;
ALTER TABLE public.uc_course_assignment_removal_events ADD CONSTRAINT uc_course_assignment_removal_events_actor_id_request_id_key UNIQUE (actor_id, request_id);
ALTER TABLE public.uc_course_assignment_removal_events ADD CONSTRAINT uc_course_assignment_removal_events_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES enrollments(id);
ALTER TABLE public.uc_course_assignment_removal_events ADD CONSTRAINT uc_course_assignment_removal_events_enrollment_id_revision_key UNIQUE (enrollment_id, revision);
ALTER TABLE public.uc_course_assignment_removal_events ADD CONSTRAINT uc_course_assignment_removal_events_pkey PRIMARY KEY (id);
ALTER TABLE public.uc_course_assignment_removal_events ADD CONSTRAINT uc_course_assignment_removal_events_preflight_sha256_check CHECK ((preflight_sha256 ~ '^[a-f0-9]{64}$'::text));
ALTER TABLE public.uc_course_assignment_removal_events ADD CONSTRAINT uc_course_assignment_removal_events_reason_check CHECK ((reason = 'erroneous_unstarted_assignment'::text));
ALTER TABLE public.uc_course_assignment_removal_events ADD CONSTRAINT uc_course_assignment_removal_events_revision_check CHECK (((revision >= 1) AND (revision <= '9007199254740991'::bigint)));
ALTER TABLE public.uc_course_assignment_removal_events ADD CONSTRAINT uc_course_assignment_removal_events_state_check CHECK ((state = ANY (ARRAY['cancelled'::text, 'active'::text])));

-- Exact real current00/00B subject bindings. Reuse if already exact; never replace.
-- org_staff/user_roles/lesson_progress row schemas remain the accepted partial model.
DO $caw_exact_subject_bindings$
DECLARE v_table text;v_count integer;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['enrollments','org_staff','user_roles','lesson_progress'] LOOP
  SELECT count(*)INTO v_count FROM pg_trigger WHERE tgrelid=to_regclass('public.'||v_table)AND tgname='account_deletion_subject_fence'AND NOT tgisinternal;
  IF v_count=0 AND v_table<>'enrollments'THEN
   EXECUTE format('CREATE TRIGGER account_deletion_subject_fence BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.account_deletion_subject_write_guard(%L)',v_table,'user_id');
  ELSIF v_count<>1 THEN RAISE EXCEPTION 'CAW_EXISTING_ENROLLMENT_OR_SINGLE_SUBJECT_TRIGGER_REQUIRED';END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||v_table)AND tgname='account_deletion_subject_fence'
   AND tgenabled='O'AND NOT tgisinternal AND tgtype=23 AND tgnargs=1 AND tgqual IS NULL AND tgconstraint=0
   AND tgfoid='public.account_deletion_subject_write_guard()'::regprocedure AND encode(tgargs,'hex')='757365725f696400')
  THEN RAISE EXCEPTION 'CAW_CURRENT_SUBJECT_BINDING_DRIFT: %',v_table;END IF;
 END LOOP;
END;$caw_exact_subject_bindings$;

CREATE FUNCTION public.uc_assignment_removal_immutable()RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN RAISE EXCEPTION 'assignment_removal_history_is_immutable' USING ERRCODE='42501';END;$fn$;

DO $caw_new_immutable_owner_only$
DECLARE v_oid oid:='public.uc_assignment_removal_immutable()'::regprocedure;v_grantee oid;v_name name;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc catalog_proc WHERE catalog_proc.oid=v_oid AND catalog_proc.proowner='postgres'::regrole
  AND NOT catalog_proc.prosecdef AND catalog_proc.prorettype='trigger'::regtype
  AND catalog_proc.proconfig=ARRAY['search_path=pg_catalog, public']::text[]
  AND encode(sha256(convert_to(catalog_proc.prosrc,'UTF8')),'hex')='1b9e39c3a0820be6cd297be17cfff8022e6bb46a6f4206462dc950094337e2a3')
 THEN RAISE EXCEPTION 'CAW_ACTUAL_UC_IMMUTABLE_FUNCTION_REQUIRED';END IF;
 FOR v_grantee IN SELECT DISTINCT acl.grantee FROM pg_proc catalog_proc CROSS JOIN LATERAL aclexplode(coalesce(catalog_proc.proacl,acldefault('f',catalog_proc.proowner)))acl
  WHERE catalog_proc.oid=v_oid AND acl.grantee<>catalog_proc.proowner LOOP
  IF v_grantee=0 THEN EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION public.uc_assignment_removal_immutable() FROM PUBLIC';
  ELSE
   SELECT rolname INTO v_name FROM pg_roles WHERE oid=v_grantee;
   IF v_name IS NULL OR to_regprocedure('public.uc_assignment_removal_immutable()')::oid IS DISTINCT FROM v_oid THEN RAISE EXCEPTION 'CAW_NEW_FUNCTION_SCOPE_DRIFT';END IF;
   EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.uc_assignment_removal_immutable() FROM %I',v_name);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc catalog_proc CROSS JOIN LATERAL aclexplode(coalesce(catalog_proc.proacl,acldefault('f',catalog_proc.proowner)))acl
  WHERE catalog_proc.oid=v_oid AND acl.grantee<>catalog_proc.proowner)THEN RAISE EXCEPTION 'CAW_NEW_IMMUTABLE_OWNER_ONLY_REQUIRED';END IF;
END;$caw_new_immutable_owner_only$;
CREATE TRIGGER uc_assignment_removal_immutable BEFORE DELETE OR UPDATE ON public.uc_course_assignment_removal_events FOR EACH ROW EXECUTE FUNCTION public.uc_assignment_removal_immutable();

DO $caw_model_shape_post$
DECLARE v_columns jsonb;v_constraints jsonb;v_functions jsonb;v_before record;
 v_expected_columns constant jsonb:=$current00_columns$[{"table":"uc_course_assignment_removal_events","column":"actor_id","type":"uuid","not_null":true,"default":null},{"table":"uc_course_assignment_removal_events","column":"after_enrollment","type":"jsonb","not_null":true,"default":null},{"table":"uc_course_assignment_removal_events","column":"before_enrollment","type":"jsonb","not_null":true,"default":null},{"table":"uc_course_assignment_removal_events","column":"course_id","type":"uuid","not_null":true,"default":null},{"table":"uc_course_assignment_removal_events","column":"enrollment_id","type":"uuid","not_null":true,"default":null},{"table":"uc_course_assignment_removal_events","column":"group_id","type":"uuid","not_null":false,"default":null},{"table":"uc_course_assignment_removal_events","column":"id","type":"uuid","not_null":true,"default":"gen_random_uuid()"},{"table":"uc_course_assignment_removal_events","column":"organization_id","type":"uuid","not_null":true,"default":null},{"table":"uc_course_assignment_removal_events","column":"preflight_sha256","type":"text","not_null":true,"default":null},{"table":"uc_course_assignment_removal_events","column":"reason","type":"text","not_null":true,"default":"'erroneous_unstarted_assignment'::text"},{"table":"uc_course_assignment_removal_events","column":"recorded_at","type":"timestamp with time zone","not_null":true,"default":"clock_timestamp()"},{"table":"uc_course_assignment_removal_events","column":"request_id","type":"uuid","not_null":true,"default":null},{"table":"uc_course_assignment_removal_events","column":"revision","type":"bigint","not_null":true,"default":null},{"table":"uc_course_assignment_removal_events","column":"state","type":"text","not_null":true,"default":null},{"table":"uc_course_assignment_removal_events","column":"user_id","type":"uuid","not_null":true,"default":null},{"table":"uc_enrollment_withdrawal_states","column":"basis","type":"jsonb","not_null":true,"default":null},{"table":"uc_enrollment_withdrawal_states","column":"course_id","type":"uuid","not_null":true,"default":null},{"table":"uc_enrollment_withdrawal_states","column":"effective_date","type":"date","not_null":true,"default":null},{"table":"uc_enrollment_withdrawal_states","column":"enrollment_id","type":"uuid","not_null":true,"default":null},{"table":"uc_enrollment_withdrawal_states","column":"group_id","type":"uuid","not_null":false,"default":null},{"table":"uc_enrollment_withdrawal_states","column":"organization_id","type":"uuid","not_null":true,"default":null},{"table":"uc_enrollment_withdrawal_states","column":"participant_ids","type":"uuid[]","not_null":true,"default":"'{}'::uuid[]"},{"table":"uc_enrollment_withdrawal_states","column":"recorded_at","type":"timestamp with time zone","not_null":true,"default":"clock_timestamp()"},{"table":"uc_enrollment_withdrawal_states","column":"recorded_by","type":"uuid","not_null":false,"default":null},{"table":"uc_enrollment_withdrawal_states","column":"redacted","type":"boolean","not_null":true,"default":"false"},{"table":"uc_enrollment_withdrawal_states","column":"revision","type":"bigint","not_null":true,"default":null},{"table":"uc_enrollment_withdrawal_states","column":"technical_snapshot","type":"jsonb","not_null":true,"default":null},{"table":"uc_enrollment_withdrawal_states","column":"user_id","type":"uuid","not_null":false,"default":null}]$current00_columns$::jsonb;
 v_expected_constraints constant jsonb:=$current00_constraints$[{"table":"uc_course_assignment_removal_events","name":"uc_course_assignment_removal_events_actor_id_request_id_key","definition":"UNIQUE (actor_id, request_id)"},{"table":"uc_course_assignment_removal_events","name":"uc_course_assignment_removal_events_enrollment_id_fkey","definition":"FOREIGN KEY (enrollment_id) REFERENCES enrollments(id)"},{"table":"uc_course_assignment_removal_events","name":"uc_course_assignment_removal_events_enrollment_id_revision_key","definition":"UNIQUE (enrollment_id, revision)"},{"table":"uc_course_assignment_removal_events","name":"uc_course_assignment_removal_events_pkey","definition":"PRIMARY KEY (id)"},{"table":"uc_course_assignment_removal_events","name":"uc_course_assignment_removal_events_preflight_sha256_check","definition":"CHECK ((preflight_sha256 ~ '^[a-f0-9]{64}$'::text))"},{"table":"uc_course_assignment_removal_events","name":"uc_course_assignment_removal_events_reason_check","definition":"CHECK ((reason = 'erroneous_unstarted_assignment'::text))"},{"table":"uc_course_assignment_removal_events","name":"uc_course_assignment_removal_events_revision_check","definition":"CHECK (((revision >= 1) AND (revision <= '9007199254740991'::bigint)))"},{"table":"uc_course_assignment_removal_events","name":"uc_course_assignment_removal_events_state_check","definition":"CHECK ((state = ANY (ARRAY['cancelled'::text, 'active'::text])))"},{"table":"uc_enrollment_withdrawal_states","name":"uc_enrollment_withdrawal_states_pkey","definition":"PRIMARY KEY (enrollment_id)"},{"table":"uc_enrollment_withdrawal_states","name":"uc_enrollment_withdrawal_states_revision_check","definition":"CHECK (((revision >= 1) AND (revision <= '9007199254740991'::bigint)))"}]$current00_constraints$::jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',catalog_class.relname,'column',catalog_attribute.attname,'type',format_type(catalog_attribute.atttypid,catalog_attribute.atttypmod),'not_null',catalog_attribute.attnotnull,'default',pg_get_expr(catalog_default.adbin,catalog_default.adrelid))ORDER BY catalog_class.relname,catalog_attribute.attname),'[]')INTO v_columns
 FROM pg_class catalog_class JOIN pg_attribute catalog_attribute ON catalog_attribute.attrelid=catalog_class.oid AND catalog_attribute.attnum>0 AND NOT catalog_attribute.attisdropped LEFT JOIN pg_attrdef catalog_default ON catalog_default.adrelid=catalog_attribute.attrelid AND catalog_default.adnum=catalog_attribute.attnum
 WHERE catalog_class.oid IN('public.uc_enrollment_withdrawal_states'::regclass,'public.uc_course_assignment_removal_events'::regclass);
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',catalog_class.relname,'name',catalog_constraint.conname,'definition',pg_get_constraintdef(catalog_constraint.oid))ORDER BY catalog_class.relname,catalog_constraint.conname),'[]')INTO v_constraints
 FROM pg_class catalog_class JOIN pg_constraint catalog_constraint ON catalog_constraint.conrelid=catalog_class.oid
 WHERE catalog_class.oid IN('public.uc_enrollment_withdrawal_states'::regclass,'public.uc_course_assignment_removal_events'::regclass);
 IF v_columns IS DISTINCT FROM v_expected_columns OR v_constraints IS DISTINCT FROM v_expected_constraints THEN RAISE EXCEPTION 'CAW_ACTUAL_EVENT_MODEL_SHAPE_DRIFT';END IF;
 IF(SELECT count(*)FROM pg_temp.caw_model_before)<>1 THEN RAISE EXCEPTION 'CAW_SAME_TRANSACTION_MODEL_GUARD_REQUIRED';END IF;
 SELECT * INTO v_before FROM pg_temp.caw_model_before;
 SELECT coalesce(jsonb_agg(jsonb_build_object('oid',catalog_proc.oid,'catalog',to_jsonb(catalog_proc),'definition',pg_get_functiondef(catalog_proc.oid))ORDER BY catalog_proc.oid),'[]')INTO v_functions
 FROM pg_proc catalog_proc JOIN pg_namespace catalog_namespace ON catalog_namespace.oid=catalog_proc.pronamespace WHERE catalog_namespace.nspname IN('public','auth')AND catalog_proc.prokind='f'AND catalog_proc.oid<>'public.uc_assignment_removal_immutable()'::regprocedure;
 IF v_functions IS DISTINCT FROM v_before.function_catalog OR public.pcf_v1_delivery_capabilities()IS DISTINCT FROM v_before.capabilities
 OR EXISTS(SELECT 1 FROM public.uc_enrollment_withdrawal_states)OR EXISTS(SELECT 1 FROM public.uc_course_assignment_removal_events)THEN RAISE EXCEPTION 'CAW_NO_OLD_FUNCTION_CAPABILITY_OR_EVENT_ROWS_CHANGE';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.uc_course_assignment_removal_events'::regclass AND tgname='uc_assignment_removal_immutable' AND tgfoid='public.uc_assignment_removal_immutable()'::regprocedure AND NOT tgisinternal AND tgenabled='O'AND tgtype=27 AND tgnargs=0 AND tgqual IS NULL AND tgconstraint=0)THEN RAISE EXCEPTION 'CAW_EXACT_IMMUTABLE_TRIGGER_BINDING_REQUIRED';END IF;
END;$caw_model_shape_post$;
COMMIT;
